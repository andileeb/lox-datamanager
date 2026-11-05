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
import * as catalog from './catalog'
import { unitsFor } from '../shared/catalog'
import { CodedError, toApiError } from './stats-service'
import { notifyRenderer } from './mcp'
import type { ParsedStatFile } from './statfile'
import { validateRecords } from './statfile'
import { compileFormula } from '../shared/formula'
import {
  applyToRecords,
  dominantInterval,
  fillGaps,
  findSpikes,
  isCurrentMonth,
  orderMonths,
  statusOf,
  summarizeRecords
} from '../shared/records'
import { displayToLox, loxToDisplay } from '../shared/time'
import {
  STAT_FILENAME_RE,
  type CatalogEntry,
  type ControlProfile,
  type EnergyOverview,
  type EnergySeries,
  type Problem,
  type StatRecord,
  type SyncStatus
} from '../shared/types'
import { aggregate, isCounter, round, usageProfile, type Period } from '../shared/insights'

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

type FileRow = { name: string; description: string | null } & Partial<
  Omit<CatalogEntry, 'name'>
> & {
    yyyymm: string
    size: number
    modifiedAt: string | null
    status: SyncStatus
  }

/**
 * Every stat file of the session: the Miniserver listing merged with the local cache (offline /
 * local-folder session: the local files only), described from the catalog when available.
 */
async function fileRows(): Promise<FileRow[]> {
  const remote = cache.localSource() ? [] : await ftp.listStats()
  const cached = cache.listWork()
  const cat = await catalog.sessionCatalog()
  const about = (
    name: string,
    header: string | null
  ): { description: string | null } & Partial<Omit<CatalogEntry, 'name'>> => {
    const e = cat[name.slice(0, 35)]
    return {
      description: e?.name ?? header,
      ...(e && {
        room: e.room,
        category: e.category,
        type: e.type,
        units: unitsFor(e, STAT_FILENAME_RE.exec(name)?.[2] ? Number(name[36]) : null)
      })
    }
  }
  const cachedBy = new Map(cached.map((c) => [c.name, c]))
  const remoteNames = new Set(remote.map((r) => r.name))
  const rows: FileRow[] = remote.map((r) => ({
    name: r.name,
    ...about(r.name, cachedBy.get(r.name)?.nameFromHeader ?? null),
    yyyymm: r.yyyymm,
    size: r.size,
    modifiedAt: r.modifiedAt,
    status: statusOf(r, cachedBy.get(r.name))
  }))
  for (const c of cached) {
    if (remoteNames.has(c.name)) continue
    rows.push({
      name: c.name,
      ...about(c.name, c.nameFromHeader),
      yyyymm: c.name.slice(-6),
      size: c.size,
      modifiedAt: c.modifiedAt,
      status: 'only-local'
    })
  }
  return rows
}

/** control id = file name without the month: "<uuid>" or "<uuid>_<n>" */
const controlOf = (name: string): string => name.slice(0, -7)

const controlArg = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{16}(_[1-9])?$/,
    'control id like <uuid> or <uuid>_2'
  )
const monthArg = z
  .string()
  .regex(/^\d{6}$/, 'YYYYMM')
  .optional()

/**
 * Months of one control within [from, to] (YYYYMM; default: the newest 12), downloaded in one
 * batch when missing, stitched in time order. Months with a different value count are skipped.
 */
async function loadControl(
  rows: FileRow[],
  control: string,
  from?: string,
  to?: string,
  defaultMonths = 12
): Promise<{
  row: FileRow
  records: StatRecord[]
  months: string[]
  skipped: string[]
  spikesIgnored: number
  stale: string[]
}> {
  let mine = rows
    .filter((r) => controlOf(r.name) === control)
    .sort((a, b) => a.yyyymm.localeCompare(b.yyyymm))
  if (!mine.length) throw new CodedError('IO_ERROR', `No statistics files for control ${control}`)
  if (from || to) mine = mine.filter((r) => (!from || r.yyyymm >= from) && (!to || r.yyyymm <= to))
  else mine = mine.slice(-defaultMonths)
  if (!mine.length) throw new CodedError('IO_ERROR', `No months of ${control} in that range`)
  // never overwrite local copies (they may hold unuploaded edits) — newer server copies are reported
  const missing = mine.filter((r) => r.status === 'only-remote')
  if (missing.length) {
    const outcome = await ftp.download(missing, cache.cacheDir(ftp.activeHost()), () => {})
    if (outcome.done.length) notifyRenderer({ kind: 'download' })
    for (const f of outcome.failed) mine = mine.filter((r) => r.name !== f.name)
  }
  const { kept, skipped } = orderMonths(
    mine.map((r) => {
      const p = stats.getParsed(r.name)
      return { fileName: p.fileName, valueCount: p.valueCount, records: p.records }
    })
  )
  // glitches would dominate peaks and meter deltas — drop what the spike rule flags
  const all = kept.flatMap((f) => f.records)
  const spikes = new Set(findSpikes(all, kept[0]?.valueCount ?? 0).map(([i]) => i))
  return {
    row: mine[mine.length - 1],
    records: spikes.size ? all.filter((_, i) => !spikes.has(i)) : all,
    spikesIgnored: spikes.size,
    stale: mine.filter((r) => r.status === 'remote-newer').map((r) => r.yyyymm),
    months: kept.map((f) => f.fileName.slice(-6)),
    skipped: skipped.map((f) => f.fileName.slice(-6))
  }
}

const isEnergyUnit = (u: string | null | undefined): boolean => !!u && /^(k|M)?Wh?$/.test(u)

const label = (ts: number, period: string): string =>
  period === 'hour'
    ? loxToDisplay(ts).slice(0, 13) + ':00'
    : loxToDisplay(ts).slice(0, period === 'month' ? 7 : 10)

/** typical week of one column (get_usage_profile + dashboard heatmap); months default to the newest 3 */
export async function controlProfile(
  control: string,
  from?: string,
  to?: string,
  column = 0,
  counter?: boolean
): Promise<ControlProfile> {
  const c = await loadControl(await fileRows(), control, from, to, 3)
  const ctr = counter ?? isCounter(c.records, column)
  return {
    control,
    description: c.row.description,
    room: c.row.room ?? null,
    unit: c.row.units?.[column] ?? null,
    counter: ctr,
    months: c.months,
    spikesIgnored: c.spikesIgnored,
    stale: c.stale,
    profile: usageProfile(aggregate(c.records, column, 'hour', ctr), ctr)
  }
}

/**
 * kWh per month of every energy/power control (energy_overview + dashboard), largest first.
 * One series per uuid: a meter reading beats a power series of the same control.
 */
export async function energyOverview(from?: string, to?: string): Promise<EnergyOverview> {
  const rows = await fileRows()
  const best = new Map<string, { id: string; unit: string }>()
  const skipped = new Set<string>()
  for (const r of rows) {
    const id = controlOf(r.name)
    const unit = r.units?.[0]
    if (!isEnergyUnit(unit)) {
      if (r.type && /meter|energy/i.test(r.type)) skipped.add(id)
      continue
    }
    const prev = best.get(id.slice(0, 35))
    if (!prev || (!prev.unit.endsWith('h') && unit!.endsWith('h'))) {
      best.set(id.slice(0, 35), { id, unit: unit! })
    }
  }
  const series: EnergySeries[] = []
  for (const { id, unit } of best.values()) {
    let c: Awaited<ReturnType<typeof loadControl>>
    try {
      c = await loadControl(rows, id, from, to, 3)
    } catch {
      continue // no months of this control in the range
    }
    const toK = unit.startsWith('k') ? 1 : unit.startsWith('M') ? 1000 : 0.001
    const perMonth = Array.from({ length: c.records[0]?.values.length ?? 0 }, (_, col) => {
      const ctr = isCounter(c.records, col)
      // ponytail: a non-cumulative kWh series (per-interval amounts) has no safe meaning here
      if (unit.endsWith('h') && !ctr) return null
      return aggregate(c.records, col, 'month', ctr).map((b) => ({
        month: label(b.start, 'month'),
        kWh: round(b.total * toK)
      }))
    })
    series.push({
      control: id,
      description: c.row.description,
      room: c.row.room ?? null,
      source: unit.endsWith('h') ? 'meter reading' : 'power (integrated)',
      totalKWh: perMonth.map((m) => (m ? round(m.reduce((s, b) => s + (b.kWh ?? 0), 0)) : null)),
      perMonth
    })
  }
  series.sort((a, b) => (b.totalKWh[0] ?? -1) - (a.totalKWh[0] ?? -1))
  for (const id of skipped) if (best.has(id.slice(0, 35))) skipped.delete(id)
  return { series, skippedNoUnit: [...skipped] }
}

const nameArg = z.string().regex(STAT_FILENAME_RE, 'stat file name like <uuid>.YYYYMM')

export function buildServer(): McpServer {
  const server = new McpServer({ name: 'lox-datamanager', version: app.getVersion() })

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
      'Names, rooms, categories and units come from the Miniserver structure file when available. ' +
      'Optionally filter by month (YYYYMM) or a name/description/room substring.',
    {
      month: z
        .string()
        .regex(/^\d{6}$/)
        .optional(),
      filter: z.string().optional()
    },
    async ({ month, filter }) => {
      const rows = await fileRows()
      const f = (filter as string | undefined)?.toLowerCase()
      const filtered = rows.filter(
        (r) =>
          (!month || r.yyyymm === month) &&
          (!f ||
            r.name.includes(f) ||
            r.description?.toLowerCase().includes(f) ||
            r.room?.toLowerCase().includes(f))
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
      'The previous server copy is backed up first (restorable in the app editor). ' +
      'The Miniserver only picks up the changes after the returned checklist is done.',
    { names: z.array(nameArg).min(1) },
    async ({ names }) => {
      const host = ftp.activeHost()
      const dir = cache.cacheDir(host)
      const files = (names as string[]).map((name) => ({
        name,
        size: statSync(cache.cachePath(host, name)).size,
        modifiedAt: null
      }))
      const uploaded = await ftp.upload(
        files,
        dir,
        () => {},
        (n) => cache.newBackupPath(host, n)
      )
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
    'Delete statistics files from the Miniserver. The server copy is backed up first (restorable ' +
      'in the app editor); local cached copies are kept.',
    { names: z.array(nameArg).min(1) },
    async ({ names }) => {
      const host = ftp.activeHost()
      await ftp.remove(names as string[], (n) => cache.newBackupPath(host, n))
      notifyRenderer({ kind: 'delete' })
      return json({ deleted: names })
    },
    { destructiveHint: true }
  )

  // ── insights (compact aggregates over months, not raw rows) ───────────────

  tool(
    'find_controls',
    'List the controls that have statistics — one entry per control instead of one per month ' +
      '(id = file name without the month: "<uuid>" or "<uuid>_<n>" for meter sub-files: ' +
      '_1 power, _2 meter reading(s), _3 storage). With name, room, category, type and units from ' +
      'the Miniserver structure file when available. Start here to answer questions about the data.',
    { filter: z.string().optional() },
    async ({ filter }) => {
      const byControl = new Map<string, FileRow[]>()
      for (const r of await fileRows()) {
        const id = controlOf(r.name)
        byControl.set(id, [...(byControl.get(id) ?? []), r])
      }
      const f = (filter as string | undefined)?.toLowerCase()
      const controls = [...byControl].map(([id, files]) => {
        files.sort((a, b) => a.yyyymm.localeCompare(b.yyyymm))
        const last = files[files.length - 1]
        return {
          id,
          description: last.description,
          room: last.room,
          category: last.category,
          type: last.type,
          units: last.units,
          months: files.length,
          from: files[0].yyyymm,
          to: last.yyyymm
        }
      })
      const filtered = controls.filter(
        (c) =>
          !f ||
          c.id.includes(f) ||
          [c.description, c.room, c.category, c.type].some((x) => x?.toLowerCase().includes(f))
      )
      return json({ count: filtered.length, controls: filtered })
    },
    { readOnlyHint: true }
  )

  const periodArg = z.enum(['hour', 'day', 'week', 'month'])
  const counterNote =
    'counter = cumulative meter reading: "total" is the consumption in the period (resets skipped). ' +
    'Otherwise "total" is value × hours (kW → kWh; meaningless for °C, %).'

  tool(
    'get_aggregates',
    'Aggregate one control over several months into hours/days/weeks/months: min, max, avg and ' +
      'total per period, plus the overall result. Downloads missing months. ' +
      counterNote +
      ' Months default to the newest 12; compare periods by calling it twice.',
    {
      control: controlArg,
      period: periodArg.default('day'),
      from: monthArg,
      to: monthArg,
      column: z.number().int().min(0).default(0),
      counter: z.boolean().optional().describe('override the cumulative-series detection')
    },
    async ({ control, period, from, to, column, counter }) => {
      const c = await loadControl(await fileRows(), control as string, from as string, to as string)
      const col = column as number
      if (col >= (c.records[0]?.values.length ?? 1)) {
        throw new CodedError('UNKNOWN', `column ${col} does not exist (0-based)`)
      }
      const ctr = (counter as boolean | undefined) ?? isCounter(c.records, col)
      const buckets = aggregate(c.records, col, period as Period, ctr)
      if (buckets.length > 1500) {
        throw new CodedError(
          'UNKNOWN',
          `${buckets.length} periods — use a coarser period or a shorter month range`
        )
      }
      const all = aggregate(c.records, col, 'month', ctr)
      const finite = buckets.filter((b) => b.n)
      return json({
        control,
        description: c.row.description,
        room: c.row.room,
        unit: c.row.units?.[col] ?? null,
        counter: ctr,
        months: c.months,
        ...(c.skipped.length && { skippedMonths: c.skipped }),
        ...(c.spikesIgnored && { spikesIgnored: c.spikesIgnored }),
        ...(c.stale.length && {
          staleMonths: c.stale,
          staleNote: 'the Miniserver has newer data for these months — download_files to refresh'
        }),
        overall: {
          min: round(Math.min(...finite.map((b) => b.min))),
          max: round(Math.max(...finite.map((b) => b.max))),
          avg: round(
            finite.reduce((s, b) => s + b.avg * b.n, 0) / finite.reduce((s, b) => s + b.n, 0)
          ),
          total: round(all.reduce((s, b) => s + b.total, 0))
        },
        periods: buckets.map((b) => ({
          period: label(b.start, period as string),
          min: round(b.min),
          max: round(b.max),
          avg: round(b.avg),
          total: round(b.total)
        }))
      })
    },
    { readOnlyHint: true }
  )

  tool(
    'get_usage_profile',
    'Typical week of one control: average per weekday × hour, average day, weekday vs weekend, ' +
      'base load (the lowest 10 % of hours — standby) and the highest hours (at most one per day). ' +
      'For counters the values are consumption per hour, otherwise the hourly average ' +
      '(a kW series reads as kW either way). Times are the Miniserver local time. Months default to the newest 3.',
    {
      control: controlArg,
      from: monthArg,
      to: monthArg,
      column: z.number().int().min(0).default(0),
      counter: z.boolean().optional().describe('override the cumulative-series detection')
    },
    async ({ control, from, to, column, counter }) => {
      const { profile: p, ...c } = await controlProfile(
        control as string,
        from as string,
        to as string,
        column as number,
        counter as boolean | undefined
      )
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
      return json({
        control,
        description: c.description,
        room: c.room,
        unit: c.unit,
        counter: c.counter,
        months: c.months,
        ...(c.spikesIgnored && { spikesIgnored: c.spikesIgnored }),
        ...(c.stale.length && {
          staleMonths: c.stale,
          staleNote: 'the Miniserver has newer data for these months — download_files to refresh'
        }),
        base: round(p.base),
        weekdayAvg: round(p.weekdayAvg),
        weekendAvg: round(p.weekendAvg),
        day: p.day.map(round),
        weekdayHour: Object.fromEntries(p.weekdayHour.map((row, d) => [days[d], row.map(round)])),
        peaks: p.peaks.map((x) => ({ hour: label(x.start, 'hour'), value: round(x.value) }))
      })
    },
    { readOnlyHint: true }
  )

  tool(
    'energy_overview',
    'Energy per month for every control whose unit is energy or power ' +
      '(meter readings → consumption, kW/W → integrated to kWh), largest first — the top consumers. ' +
      'Needs units from the Miniserver structure file; controls without (e.g. energy managers) are ' +
      'listed as skipped — use get_aggregates for those. Months default to the newest 3; downloads missing months.',
    { from: monthArg, to: monthArg },
    async ({ from, to }) => {
      const o = await energyOverview(from as string, to as string)
      // one column → plain values (the tool's original shape), two → arrays
      const flat = <T>(x: T[]): T | T[] => (x.length > 1 ? x : x[0])
      return json({
        note:
          'Includes producers (e.g. PV) and sub-meters of the same circuit — judge by description; ' +
          'do not add them up blindly.' +
          (o.series.some((x) => x.totalKWh.length > 1)
            ? ' Array totals = a meter with two reading columns [consumption, production/second tariff].'
            : ''),
        series: o.series.map((x) => ({
          ...x,
          totalKWh: flat(x.totalKWh),
          perMonth: flat(x.perMonth)
        })),
        ...(o.skippedNoUnit.length && { skippedNoUnit: o.skippedNoUnit })
      })
    },
    { readOnlyHint: true }
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

  const insightPrompt = (name: string, description: string, goal: string[]): void => {
    server.registerPrompt(name, { description }, () => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: [
              ...goal,
              '',
              'How to get the data (Lox DataManager tools, all read-only):',
              '- find_controls — what is measured, with rooms and units. Ids ending in _1 are power, _2 meter readings, _3 storage.',
              '- energy_overview — energy per control and month (top consumers, but also producers like PV).',
              '- get_usage_profile — typical week per control: hourly pattern, base load, peak hours.',
              '- get_aggregates — per hour/day/week/month for a time range; call twice to compare periods.',
              'Prefer these aggregates over read_stat_file (raw rows are large). Times are Miniserver local time.',
              'If Loxone MCP tools are also available (Miniserver: live states; Loxone Config: the project),',
              'use them for current states and to see how the installation is programmed — but never change',
              'the Loxone Config project or trigger anything without asking me first.',
              'Do not edit, save or upload statistics for this. Say which numbers your conclusions rest on,',
              'and mention when data is missing or a month is incomplete.'
            ].join('\n')
          }
        }
      ]
    }))
  }

  insightPrompt(
    'energy-report',
    'Where and when electricity is used, with the biggest savings levers',
    [
      'Write a short energy report about my home from the Loxone statistics:',
      '1. Total consumption and the top consumers over the last months, month-over-month changes.',
      '2. When electricity is used: typical day and week, weekday vs weekend, evening/night peaks.',
      '3. Base load (standby): how high, what share of the total, which controls contribute.',
      '4. Anything unusual (sudden changes, a device that never turns off, gaps in the data).',
      '5. The three most promising savings levers, each with the expected effect in kWh per year.'
    ]
  )

  insightPrompt(
    'automation-ideas',
    'Automation ideas for the Miniserver derived from the measured usage patterns',
    [
      'Suggest automations for my Loxone installation based on the measured data:',
      '1. Look at the usage profiles of consumers, heating/cooling, lighting and presence where available.',
      '2. Find patterns an automation could use or fix: loads at fixed times, devices running when nobody',
      '   is home or at night, heating while windows are open, load that could move to PV/cheap hours.',
      '3. For each idea: the observation (with numbers), the automation in Loxone terms (which function',
      '   blocks / inputs it would need), the expected benefit, and the risk or comfort trade-off.',
      'Rank the ideas by benefit. Only describe them — do not program anything.'
    ]
  )

  insightPrompt(
    'what-to-buy',
    'Sizing advice for PV, battery, heat pump or more sensors from the measured profile',
    [
      'Help me decide what to add to my home next, based on the measured data:',
      '1. From the yearly and daily consumption profile: is a PV system, a battery or a bigger one worth it?',
      '   Estimate sizes (kWp, kWh) and self-consumption from the hourly profile; state your assumptions',
      '   (location, tariff) and ask me for the ones that matter most.',
      '2. If PV/battery/heat pump data already exists, check how well it is used (self-consumption,',
      '   battery cycles, heat pump runtime) and whether an upgrade would help.',
      '3. Where the data is blind: which meters or sensors would answer the open questions.',
      'Give a short ranked list with rough costs vs. benefit; be explicit about uncertainty.'
    ]
  )

  // the one prompt that may change something: the Loxone Config project, step by step after an OK
  server.registerPrompt(
    'improve-config',
    {
      description:
        'Find something to improve in the measured data, then change the Loxone Config project — only after you approve',
      argsSchema: {
        goal: z
          .string()
          .optional()
          .describe('What to improve, e.g. "standby at night", "PV self-consumption"')
      }
    },
    ({ goal }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: [
              `Goal: ${goal?.trim() || 'lower my standby (base) load'}.`,
              '',
              '1. Data (Lox DataManager, read-only): find_controls, energy_overview, get_usage_profile and',
              '   get_aggregates — find the controls that matter for the goal, with numbers. Prefer these',
              '   aggregates over read_stat_file. Times are Miniserver local time.',
              '2. Project (loxone-config tools, read-only in this step): read skill_read / sdk_describe first',
              '   to learn how to work with the project, then code_query to find the blocks, inputs and outputs',
              '   behind the controls from step 1 (match by name and room).',
              '3. Suggest up to three changes, ranked by benefit: the observation (with numbers), the change',
              '   in Loxone terms (which blocks, which wiring), the expected effect per year, the risk or comfort',
              '   trade-off. Then stop and ask me which one to make.',
              '4. Only after my OK: make that one change with code_run. Prefer adding blocks over rewiring',
              '   existing ones. Then tell me what to check in Loxone Config (and in its simulation); use undo',
              '   if I do not like it.',
              '',
              'Never call save_project, never send anything to the Miniserver, never edit, save or upload',
              'statistics — I review and save in Loxone Config myself. If no loxone-config tools are available,',
              'stop after step 3 and tell me to connect Loxone Config (Settings in Lox DataManager).'
            ].join('\n')
          }
        }
      ]
    })
  )

  return server
}
