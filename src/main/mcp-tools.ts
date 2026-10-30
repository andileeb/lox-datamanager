/**
 * MCP tool surface. Handlers stay thin: zod args → ftp/stats-service/shared
 * records → compact JSON text block. Main-process messages stay English.
 */
import { statSync } from 'fs'
import { app } from 'electron'
import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import * as ftp from './ftp'
import * as cache from './cache'
import * as store from './store'
import * as stats from './stats-service'
import { CodedError, toApiError } from './stats-service'
import { notifyRenderer } from './mcp'
import type { ParsedStatFile } from './statfile'
import { validateRecords } from './statfile'
import { compileFormula } from '../shared/formula'
import {
  applyToRecords,
  dominantInterval,
  fillGaps,
  isCurrentMonth,
  statusOf,
  summarizeRecords
} from '../shared/records'
import { displayToLox, loxToDisplay } from '../shared/time'
import { STAT_FILENAME_RE, type Problem, type StatRecord } from '../shared/types'

interface ToolResult {
  content: { type: 'text'; text: string }[]
  isError?: boolean
  [key: string]: unknown
}

function json(data: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data) }] }
}

function fail(e: unknown): ToolResult {
  const a = toApiError(e)
  return { isError: true, content: [{ type: 'text', text: `${a.code}: ${a.message}` }] }
}

function parseTime(text: string): number {
  const ts = displayToLox(text)
  if (ts === null) {
    throw new CodedError('UNKNOWN', `Unparseable time "${text}" — use "YYYY-MM-DD HH:mm:ss"`)
  }
  return ts
}

const CURRENT_MONTH_WARNING =
  'This is the current month — the Miniserver is still appending records to this file; ' +
  'new records will conflict with your edit after upload.'

function monthWarning(name: string): { warning?: string } {
  return isCurrentMonth(name) ? { warning: CURRENT_MONTH_WARNING } : {}
}

const UPLOAD_CHECKLIST = [
  'Restart the Miniserver (Loxone Config or power cycle) — it only picks up edited statistics after a restart.',
  'Clear the Loxone app cache (or remove and re-add the Miniserver in the app) so cached statistics are refreshed.'
]

/** getParsed, but transparently downloads from the Miniserver when not cached yet */
async function ensureLocal(name: string): Promise<ParsedStatFile> {
  try {
    return stats.getParsed(name)
  } catch (e) {
    if (!(e instanceof CodedError) || e.apiCode !== 'IO_ERROR') throw e
    const remote = (await ftp.listStats()).find((r) => r.name === name)
    if (!remote) throw new CodedError('IO_ERROR', `${name} does not exist on the Miniserver`)
    const outcome = await ftp.download([remote], cache.cacheDir(ftp.activeHost()), () => {})
    if (outcome.failed.length) {
      throw new CodedError('IO_ERROR', `Download failed: ${outcome.failed[0].message}`)
    }
    notifyRenderer({ kind: 'download', name })
    return stats.getParsed(name)
  }
}

function problemsSummary(problems: Problem[]): {
  errors: number
  warnings: number
  byRule: Record<string, number>
} {
  const byRule: Record<string, number> = {}
  for (const p of problems) byRule[p.rule] = (byRule[p.rule] ?? 0) + 1
  return {
    errors: problems.filter((p) => p.severity === 'error').length,
    warnings: problems.filter((p) => p.severity === 'warning').length,
    byRule
  }
}

function freshProblems(parsed: ParsedStatFile): Problem[] {
  return validateRecords(parsed.records, parsed.fileName.slice(-6), parsed.valueCount)
}

/** resolve a row selection: explicit indices win, then a time range, then all rows */
function selectIndices(
  records: StatRecord[],
  indices: number[] | undefined,
  from: string | undefined,
  to: string | undefined
): number[] {
  if (indices?.length) return indices
  const fromTs = from ? parseTime(from) : -Infinity
  const toTs = to ? parseTime(to) : Infinity
  const out: number[] = []
  for (let i = 0; i < records.length; i++) {
    if (records[i].ts >= fromTs && records[i].ts <= toTs) out.push(i)
  }
  return out
}

const nameArg = z.string().regex(STAT_FILENAME_RE, 'stat file name like <uuid>.YYYYMM')

export function buildServer(): McpServer {
  const server = new McpServer({ name: 'loxone-datamanager', version: app.getVersion() })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function tool<Shape extends Record<string, any>>(
    name: string,
    description: string,
    inputSchema: Shape,
    fn: (args: Record<string, unknown>) => Promise<ToolResult> | ToolResult,
    annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean }
  ): void {
    server.registerTool(name, { description, inputSchema, annotations }, (async (
      args: Record<string, unknown>
    ) => {
      try {
        return await fn(args)
      } catch (e) {
        return fail(e)
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any)
  }

  // ── connection ────────────────────────────────────────────────────────────

  tool(
    'get_status',
    'Current app state: Miniserver connection, cache location, files open for editing.',
    {},
    () => {
      let host: string | null = null
      try {
        host = ftp.activeHost()
      } catch {
        host = null
      }
      const localFolder = cache.localSource()
      return json({
        connected: host !== null,
        host,
        localFolder,
        cacheDir: localFolder ?? (host ? cache.cacheDir(host) : null),
        openFiles: stats.openFiles()
      })
    },
    { readOnlyHint: true }
  )

  tool(
    'list_connections',
    'List Miniserver connections saved in the app (passwords are never returned).',
    {},
    async () =>
      json(
        await Promise.all(
          store.listConnections().map(async (c) => ({
            id: c.id,
            name: c.name,
            host: c.host,
            port: c.port,
            user: c.user,
            tls: c.tls,
            hasPassword: (await store.getPassword(c.id)) !== null
          }))
        )
      ),
    { readOnlyHint: true }
  )

  tool(
    'connect_saved',
    'Connect to a Miniserver using a saved connection (by id from list_connections).',
    { id: z.string() },
    async ({ id }) => {
      const meta = store.getConnection(id as string)
      if (!meta) throw new CodedError('UNKNOWN', 'Saved connection not found')
      const password = await store.getPassword(id as string)
      if (password === null) {
        throw new CodedError('NO_PASSWORD', 'No stored password for this connection')
      }
      cache.setLocalDir(null)
      const tlsMode = await ftp.connect({ ...meta, password })
      notifyRenderer({ kind: 'connect' })
      return json({ connected: true, host: meta.host, tlsMode })
    }
  )

  tool('disconnect', 'Disconnect from the Miniserver and drop unsaved edits.', {}, () => {
    stats.clear()
    ftp.disconnect()
    cache.setLocalDir(null)
    notifyRenderer({ kind: 'disconnect' })
    return json({ connected: false })
  })

  // ── browse & read ─────────────────────────────────────────────────────────

  tool(
    'list_stat_files',
    'List statistics files on the Miniserver with local-cache sync status ' +
      '(in an offline / local-folder session: the local files only). ' +
      'Optionally filter by month (YYYYMM) or a name/description substring.',
    {
      month: z
        .string()
        .regex(/^\d{6}$/)
        .optional(),
      filter: z.string().optional()
    },
    async ({ month, filter }) => {
      // offline / local-folder session: only the local files, no Miniserver to compare with
      const remote = cache.localSource() ? [] : await ftp.listStats()
      const cached = cache.listDir(cache.workDir())
      const cachedBy = new Map(cached.map((c) => [c.name, c]))
      const remoteNames = new Set(remote.map((r) => r.name))
      const rows = remote.map((r) => ({
        name: r.name,
        description: cachedBy.get(r.name)?.nameFromHeader ?? null,
        yyyymm: r.yyyymm,
        size: r.size,
        modifiedAt: r.modifiedAt,
        status: statusOf(r, cachedBy.get(r.name))
      }))
      for (const c of cached) {
        if (remoteNames.has(c.name)) continue
        rows.push({
          name: c.name,
          description: c.nameFromHeader,
          yyyymm: c.name.slice(-6),
          size: c.size,
          modifiedAt: c.modifiedAt,
          status: 'only-local'
        })
      }
      const f = (filter as string | undefined)?.toLowerCase()
      const filtered = rows.filter(
        (r) =>
          (!month || r.yyyymm === month) &&
          (!f || r.name.includes(f) || r.description?.toLowerCase().includes(f))
      )
      return json({ count: filtered.length, files: filtered })
    },
    { readOnlyHint: true }
  )

  tool(
    'read_stat_file',
    'Read records of a statistics file (paginated; downloads it into the local cache first if needed). ' +
      'Times are the stored UTC components ("YYYY-MM-DD HH:mm:ss"), no timezone conversion.',
    {
      name: nameArg,
      offset: z.number().int().min(0).default(0),
      limit: z.number().int().min(1).max(2000).default(500),
      from: z.string().optional(),
      to: z.string().optional()
    },
    async ({ name, offset, limit, from, to }) => {
      const parsed = await ensureLocal(name as string)
      const fromTs = from ? parseTime(from as string) : -Infinity
      const toTs = to ? parseTime(to as string) : Infinity
      const matching: { index: number; time: string; values: number[] }[] = []
      for (let i = 0; i < parsed.records.length; i++) {
        const r = parsed.records[i]
        if (r.ts >= fromTs && r.ts <= toTs) {
          matching.push({ index: i, time: loxToDisplay(r.ts), values: r.values })
        }
      }
      const page = matching.slice(offset as number, (offset as number) + (limit as number))
      return json({
        fileName: parsed.fileName,
        description: parsed.nameFromHeader,
        valueCount: parsed.valueCount,
        totalRecords: parsed.records.length,
        matching: matching.length,
        offset,
        records: page,
        truncated: (offset as number) + page.length < matching.length,
        ...monthWarning(name as string)
      })
    },
    { readOnlyHint: true }
  )

  tool(
    'get_stat_summary',
    'Summary of a statistics file: time range, per-column min/max/avg, dominant recording interval, gaps, problem counts.',
    { name: nameArg },
    async ({ name }) => {
      const parsed = await ensureLocal(name as string)
      const s = summarizeRecords(parsed.records, parsed.valueCount)
      return json({
        fileName: parsed.fileName,
        description: parsed.nameFromHeader,
        valueCount: parsed.valueCount,
        records: s.count,
        timeRange:
          s.firstTs !== null && s.lastTs !== null
            ? { from: loxToDisplay(s.firstTs), to: loxToDisplay(s.lastTs) }
            : null,
        dominantIntervalSec: s.intervalSec,
        columns: s.columns,
        gapCount: s.gaps.length,
        gaps: s.gaps.slice(0, 50).map((g) => ({
          afterIndex: g.afterIndex,
          from: loxToDisplay(g.fromTs),
          to: loxToDisplay(g.toTs),
          seconds: g.seconds
        })),
        problems: problemsSummary(freshProblems(parsed)),
        ...monthWarning(name as string)
      })
    },
    { readOnlyHint: true }
  )

  tool(
    'validate_stat_file',
    'Validate a statistics file and list each problem (timestamp order, out-of-month timestamps, invalid values, uuid mismatch).',
    { name: nameArg },
    async ({ name }) => {
      const parsed = await ensureLocal(name as string)
      const problems = freshProblems(parsed)
      const listed = problems.slice(0, 200).map((p) => ({
        row: p.row,
        time:
          p.row !== null && parsed.records[p.row] ? loxToDisplay(parsed.records[p.row].ts) : null,
        rule: p.rule,
        severity: p.severity,
        message: p.message
      }))
      return json({
        fileName: parsed.fileName,
        total: problems.length,
        problems: listed,
        truncated: problems.length > listed.length
      })
    },
    { readOnlyHint: true }
  )

  // ── edit (in-memory working copy; save_stat_file persists) ────────────────

  tool(
    'update_records',
    'Edit records of the in-memory working copy by index: change the time and/or the values. ' +
      'Changes are not persisted until save_stat_file.',
    {
      name: nameArg,
      edits: z.array(
        z.object({
          index: z.number().int().min(0),
          time: z.string().optional(),
          values: z.array(z.number()).optional()
        })
      )
    },
    async ({ name, edits }) => {
      const parsed = await ensureLocal(name as string)
      type Edit = { index: number; time?: string; values?: number[] }
      const prepared = (edits as Edit[]).map((e) => {
        const r = parsed.records[e.index]
        if (!r) throw new CodedError('UNKNOWN', `No record at index ${e.index}`)
        if (e.values && e.values.length !== parsed.valueCount) {
          throw new CodedError(
            'UNKNOWN',
            `Record needs exactly ${parsed.valueCount} value(s), got ${e.values.length} at index ${e.index}`
          )
        }
        return { record: r, ts: e.time !== undefined ? parseTime(e.time) : null, values: e.values }
      })
      for (const p of prepared) {
        if (p.ts !== null) p.record.ts = p.ts
        if (p.values) p.record.values = p.values
      }
      stats.markDirty(name as string)
      return json({
        updated: prepared.length,
        problems: problemsSummary(freshProblems(parsed)),
        ...monthWarning(name as string)
      })
    }
  )

  tool(
    'insert_records',
    'Insert new records (kept sorted by time). Values must have exactly valueCount entries. ' +
      'Not persisted until save_stat_file.',
    {
      name: nameArg,
      records: z.array(z.object({ time: z.string(), values: z.array(z.number()) }))
    },
    async ({ name, records }) => {
      const parsed = await ensureLocal(name as string)
      const toInsert = (records as { time: string; values: number[] }[]).map((r) => {
        if (r.values.length !== parsed.valueCount) {
          throw new CodedError(
            'UNKNOWN',
            `Record needs exactly ${parsed.valueCount} value(s), got ${r.values.length}`
          )
        }
        return { ts: parseTime(r.time), values: r.values }
      })
      parsed.records = [...parsed.records, ...toInsert].sort((a, b) => a.ts - b.ts)
      stats.markDirty(name as string)
      return json({
        inserted: toInsert.length,
        totalRecords: parsed.records.length,
        problems: problemsSummary(freshProblems(parsed)),
        ...monthWarning(name as string)
      })
    }
  )

  tool(
    'delete_records',
    'Delete records of the in-memory working copy by index. Not persisted until save_stat_file.',
    { name: nameArg, indices: z.array(z.number().int().min(0)).min(1) },
    async ({ name, indices }) => {
      const parsed = await ensureLocal(name as string)
      const drop = new Set(indices as number[])
      const before = parsed.records.length
      parsed.records = parsed.records.filter((_, i) => !drop.has(i))
      stats.markDirty(name as string)
      return json({
        deleted: before - parsed.records.length,
        totalRecords: parsed.records.length,
        problems: problemsSummary(freshProblems(parsed)),
        ...monthWarning(name as string)
      })
    }
  )

  tool(
    'apply_formula',
    'Apply an arithmetic formula to values, e.g. "v * 1000" or "(v - 32) / 1.8". ' +
      'Supports numbers, v, + - * /, unary minus, parentheses. ' +
      'Row selection: explicit indices, or a from/to time range, or all rows. Not persisted until save_stat_file.',
    {
      name: nameArg,
      formula: z.string(),
      column: z.union([z.number().int().min(0), z.literal('all')]),
      indices: z.array(z.number().int().min(0)).optional(),
      from: z.string().optional(),
      to: z.string().optional()
    },
    async ({ name, formula, column, indices, from, to }) => {
      const fn = compileFormula(formula as string)
      if (!fn) {
        throw new CodedError(
          'UNKNOWN',
          `Invalid formula "${formula}" — allowed: numbers, v, + - * / and parentheses`
        )
      }
      const parsed = await ensureLocal(name as string)
      const rows = selectIndices(
        parsed.records,
        indices as number[] | undefined,
        from as string | undefined,
        to as string | undefined
      )
      const modified = applyToRecords(
        parsed.records,
        parsed.valueCount,
        fn,
        column as number | 'all',
        rows
      )
      stats.markDirty(name as string)
      return json({
        modified,
        problems: problemsSummary(freshProblems(parsed)),
        ...monthWarning(name as string)
      })
    }
  )

  tool(
    'fill_gaps',
    'Insert linearly interpolated records into gaps larger than 1.5× the recording interval. ' +
      'Not persisted until save_stat_file.',
    { name: nameArg, intervalSec: z.number().int().positive().optional() },
    async ({ name, intervalSec }) => {
      const parsed = await ensureLocal(name as string)
      const interval = (intervalSec as number | undefined) ?? dominantInterval(parsed.records)
      const result = fillGaps(parsed.records, interval)
      if (result.inserted) {
        parsed.records = result.records
        stats.markDirty(name as string)
      }
      return json({
        inserted: result.inserted,
        intervalSec: interval,
        totalRecords: parsed.records.length,
        ...monthWarning(name as string)
      })
    }
  )

  tool(
    'shift_timestamps',
    'Shift record timestamps by a number of seconds (negative = earlier). ' +
      'Row selection: explicit indices, or a from/to time range, or all rows. Not persisted until save_stat_file.',
    {
      name: nameArg,
      seconds: z.number().int(),
      indices: z.array(z.number().int().min(0)).optional(),
      from: z.string().optional(),
      to: z.string().optional()
    },
    async ({ name, seconds, indices, from, to }) => {
      const parsed = await ensureLocal(name as string)
      const rows = selectIndices(
        parsed.records,
        indices as number[] | undefined,
        from as string | undefined,
        to as string | undefined
      )
      for (const i of rows) {
        const r = parsed.records[i]
        if (!r) continue
        const ts = r.ts + (seconds as number)
        if (ts < 0 || ts > 0xffffffff) {
          throw new CodedError('UNKNOWN', `Shift would move index ${i} outside the valid range`)
        }
      }
      let shifted = 0
      for (const i of rows) {
        const r = parsed.records[i]
        if (!r) continue
        r.ts += seconds as number
        shifted++
      }
      stats.markDirty(name as string)
      return json({
        shifted,
        problems: problemsSummary(freshProblems(parsed)),
        ...monthWarning(name as string)
      })
    }
  )

  tool(
    'save_stat_file',
    'Serialize the working copy byte-faithfully (original header preserved) and write it to the local cache. ' +
      'Use upload_files afterwards to push it to the Miniserver.',
    { name: nameArg },
    ({ name }) => {
      const parsed = stats.getParsed(name as string)
      const problems = stats.saveRecords(name as string, parsed.records)
      notifyRenderer({ kind: 'save', name: name as string })
      return json({
        saved: true,
        problems: problemsSummary(problems),
        ...monthWarning(name as string)
      })
    }
  )

  tool(
    'discard_changes',
    'Drop unsaved edits of a file; the next read reloads it from the local cache.',
    { name: nameArg },
    ({ name }) => {
      stats.discard(name as string)
      return json({ discarded: name })
    }
  )

  // ── transfer ──────────────────────────────────────────────────────────────

  tool(
    'download_files',
    'Download statistics files from the Miniserver into the local cache (overwrites cached copies).',
    { names: z.array(nameArg).min(1) },
    async ({ names }) => {
      const remote = await ftp.listStats()
      const byName = new Map(remote.map((r) => [r.name, r]))
      const files = (names as string[]).map((n) => {
        const r = byName.get(n)
        if (!r) throw new CodedError('IO_ERROR', `${n} does not exist on the Miniserver`)
        return r
      })
      const outcome = await ftp.download(files, cache.cacheDir(ftp.activeHost()), () => {})
      for (const n of outcome.done) stats.discard(n)
      notifyRenderer({ kind: 'download' })
      return json(outcome)
    }
  )

  tool(
    'upload_files',
    'Upload edited files from the local cache to the Miniserver, overwriting the remote copies. ' +
      'There is no undo. The Miniserver only picks up the changes after the returned checklist is done.',
    { names: z.array(nameArg).min(1) },
    async ({ names }) => {
      const host = ftp.activeHost()
      const dir = cache.cacheDir(host)
      const files = (names as string[]).map((name) => ({
        name,
        size: statSync(cache.cachePath(host, name)).size,
        modifiedAt: null
      }))
      const uploaded = await ftp.upload(files, dir, () => {})
      notifyRenderer({ kind: 'upload' })
      const warnings = (names as string[]).filter((n) => isCurrentMonth(n))
      return json({
        uploaded,
        checklist: UPLOAD_CHECKLIST,
        ...(warnings.length ? { warning: `${warnings.join(', ')}: ${CURRENT_MONTH_WARNING}` } : {})
      })
    },
    { destructiveHint: true }
  )

  tool(
    'delete_remote_files',
    'Permanently delete statistics files from the Miniserver. There is no undo; local cached copies are kept.',
    { names: z.array(nameArg).min(1) },
    async ({ names }) => {
      await ftp.remove(names as string[])
      notifyRenderer({ kind: 'delete' })
      return json({ deleted: names })
    },
    { destructiveHint: true }
  )

  tool(
    'export_csv',
    'Export a statistics file as CSV text (semicolon-separated, same format as the app).',
    { name: nameArg, maxRows: z.number().int().min(1).max(20000).default(10000) },
    async ({ name, maxRows }) => {
      const parsed = await ensureLocal(name as string)
      return json(stats.buildCsv(parsed, maxRows as number))
    },
    { readOnlyHint: true }
  )

  server.registerPrompt(
    'fix-statistics',
    { description: 'Guided workflow to inspect and repair Loxone statistics files' },
    () => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: [
              'Help me fix Loxone Miniserver statistics. Typical workflow:',
              '1. get_status — check the connection; connect_saved if needed (list_connections shows the ids).',
              '2. list_stat_files — find the affected file(s); sync status shows what is cached locally.',
              '3. get_stat_summary + validate_stat_file — understand the data and its problems.',
              '4. Repair: fill_gaps for missing records, apply_formula for unit/scale errors (e.g. "v * 1000"),',
              '   update_records / insert_records / delete_records for individual rows, shift_timestamps for offsets.',
              '5. validate_stat_file again, then save_stat_file.',
              '6. upload_files — and follow the returned checklist (Miniserver restart + Loxone app cache clear).',
              'Timestamps are stored UTC components without timezone conversion. Be careful with current-month files.'
            ].join('\n')
          }
        }
      ]
    })
  )

  return server
}
