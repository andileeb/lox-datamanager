/**
 * Pure stat-record transforms shared by the renderer editor and the MCP server.
 * All functions are side-effect-free except applyToRecords (documented in-place).
 */
import type { CachedFile, RemoteFile, StatRecord, SyncStatus } from './types'

/** dominant recording interval = most frequent timestamp delta (default 600s) */
export function dominantInterval(records: StatRecord[]): number {
  const counts = new Map<number, number>()
  for (let i = 1; i < records.length; i++) {
    const d = records[i].ts - records[i - 1].ts
    if (d > 0) counts.set(d, (counts.get(d) ?? 0) + 1)
  }
  let best = 600
  let bestCount = 0
  for (const [d, c] of counts) {
    if (c > bestCount) {
      best = d
      bestCount = c
    }
  }
  return best
}

/** insert linearly interpolated rows into gaps > 1.5× the interval; returns a new array */
export function fillGaps(
  records: StatRecord[],
  interval: number = dominantInterval(records)
): { records: StatRecord[]; inserted: number } {
  const out: StatRecord[] = []
  let inserted = 0
  for (let i = 0; i < records.length; i++) {
    if (i > 0) {
      const prev = records[i - 1]
      const cur = records[i]
      const gap = cur.ts - prev.ts
      if (gap > interval * 1.5) {
        const steps = Math.round(gap / interval) - 1
        for (let s = 1; s <= steps; s++) {
          const f = s / (steps + 1)
          out.push({
            ts: prev.ts + Math.round(gap * f),
            values: prev.values.map((v, vi) => v + (cur.values[vi] - v) * f)
          })
          inserted++
        }
      }
    }
    out.push(records[i])
  }
  return { records: out, inserted }
}

/** apply fn to a column (or all) of the given rows (default: all rows) IN PLACE; returns modified count */
export function applyToRecords(
  records: StatRecord[],
  valueCount: number,
  fn: (v: number) => number,
  column: number | 'all',
  indices?: number[]
): number {
  const cols = column === 'all' ? [...Array(valueCount).keys()] : [column]
  const rows = indices ?? [...Array(records.length).keys()]
  let modified = 0
  for (const i of rows) {
    const r = records[i]
    if (!r) continue
    for (const c of cols) {
      if (c < 0 || c >= r.values.length) continue
      r.values[c] = fn(r.values[c])
    }
    modified++
  }
  return modified
}

export interface ColumnStats {
  min: number
  max: number
  avg: number
}

export interface Gap {
  afterIndex: number
  fromTs: number
  toTs: number
  seconds: number
}

export interface RecordsSummary {
  count: number
  firstTs: number | null
  lastTs: number | null
  intervalSec: number
  columns: ColumnStats[]
  gaps: Gap[]
}

/** time range, per-column min/max/avg and gaps > 1.5× the dominant interval */
export function summarizeRecords(records: StatRecord[], valueCount: number): RecordsSummary {
  const intervalSec = dominantInterval(records)
  const columns: ColumnStats[] = []
  for (let c = 0; c < valueCount; c++) {
    let min = Infinity
    let max = -Infinity
    let sum = 0
    for (const r of records) {
      const v = r.values[c]
      if (v < min) min = v
      if (v > max) max = v
      sum += v
    }
    columns.push(
      records.length ? { min, max, avg: sum / records.length } : { min: 0, max: 0, avg: 0 }
    )
  }
  const gaps: Gap[] = []
  for (let i = 1; i < records.length; i++) {
    const seconds = records[i].ts - records[i - 1].ts
    if (seconds > intervalSec * 1.5) {
      gaps.push({ afterIndex: i - 1, fromTs: records[i - 1].ts, toTs: records[i].ts, seconds })
    }
  }
  return {
    count: records.length,
    firstTs: records.length ? records[0].ts : null,
    lastTs: records.length ? records[records.length - 1].ts : null,
    intervalSec,
    columns,
    gaps
  }
}

/** sync status of a stat file across remote listing and local cache */
export function statusOf(
  remote: RemoteFile | undefined | null,
  cached: CachedFile | undefined | null
): SyncStatus {
  if (!cached) return 'only-remote'
  if (!remote) return 'only-local'
  const rt = remote.modifiedAt ? Date.parse(remote.modifiedAt) : 0
  const ct = Date.parse(cached.modifiedAt)
  if (remote.size === cached.size && Math.abs(rt - ct) < 1500) return 'same'
  return rt > ct ? 'remote-newer' : 'local-newer'
}

/** true if the stat file's yyyymm is the current month (UTC) — Miniserver is still appending */
export function isCurrentMonth(name: string, now: Date = new Date()): boolean {
  const cur = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`
  return name.slice(-6) === cur
}

/** compact snapshot for undo: [ts, v1..vn] per record in one Float64Array (~8 B per number) */
export function packRecords(records: StatRecord[], valueCount: number): Float64Array {
  const stride = valueCount + 1
  const out = new Float64Array(records.length * stride)
  records.forEach((r, i) => {
    out[i * stride] = r.ts
    for (let v = 0; v < valueCount; v++) out[i * stride + 1 + v] = r.values[v]
  })
  return out
}

export function unpackRecords(packed: Float64Array, valueCount: number): StatRecord[] {
  const stride = valueCount + 1
  const records: StatRecord[] = []
  for (let i = 0; i < packed.length; i += stride) {
    records.push({ ts: packed[i], values: Array.from(packed.subarray(i + 1, i + stride)) })
  }
  return records
}
