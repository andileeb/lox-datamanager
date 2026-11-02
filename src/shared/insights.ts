/**
 * Pure analytics over stitched multi-month records, used by the MCP insight tools (and later
 * the dashboard). Times are the stored UTC components, so "hour 7" is the Miniserver's local 7:00.
 */
import { dominantInterval } from './records'
import { LOXONE_EPOCH_OFFSET, type StatRecord } from './types'

export type Period = 'hour' | 'day' | 'week' | 'month'

const DAY = 86400

/** Monday = 0 … Sunday = 6 (the Loxone epoch 2009-01-01 was a Thursday) */
export function weekday(ts: number): number {
  return (Math.floor(ts / DAY) + 3) % 7
}

/** start of the period containing ts (weeks start on Monday) */
export function bucketStart(ts: number, period: Period): number {
  if (period === 'hour') return Math.floor(ts / 3600) * 3600
  const day = Math.floor(ts / DAY) * DAY
  if (period === 'day') return day
  if (period === 'week') return day - weekday(ts) * DAY
  const d = new Date((ts + LOXONE_EPOCH_OFFSET) * 1000)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000 - LOXONE_EPOCH_OFFSET
}

/**
 * Cumulative series (meter readings): at most 1 % of the changes go down. A reset (meter
 * replaced) is a single negative step and doesn't change the verdict. Flat series count too —
 * an unused production column then reads 0 kWh (measured: such columns are common).
 */
export function isCounter(records: StatRecord[], column: number): boolean {
  let up = 0
  let down = 0
  for (let i = 1; i < records.length; i++) {
    const d = records[i].values[column] - records[i - 1].values[column]
    if (d > 0) up++
    else if (d < 0) down++
  }
  return down <= (up + down) * 0.01
}

export interface Bucket {
  start: number
  n: number
  min: number
  max: number
  avg: number
  /** counter: amount consumed in the bucket (resets skipped); level: value × hours (kW → kWh) */
  total: number
}

/**
 * Aggregate one column into periods. Counters attribute each step to the bucket of its later
 * record and skip negative steps (resets); levels integrate value × time to the next record
 * (capped at 1.5× the recording interval so gaps don't count as usage).
 */
export function aggregate(
  records: StatRecord[],
  column: number,
  period: Period,
  counter: boolean
): Bucket[] {
  const out: Bucket[] = []
  const cap = dominantInterval(records) * 1.5
  let cur: Bucket | null = null
  let sum = 0
  for (let i = 0; i < records.length; i++) {
    const r = records[i]
    const v = r.values[column]
    if (!Number.isFinite(v)) continue
    const start = bucketStart(r.ts, period)
    if (!cur || cur.start !== start) {
      if (cur) cur.avg = sum / cur.n
      cur = { start, n: 0, min: v, max: v, avg: 0, total: 0 }
      out.push(cur)
      sum = 0
    }
    cur.n++
    sum += v
    if (v < cur.min) cur.min = v
    if (v > cur.max) cur.max = v
    if (counter) {
      const prev = records[i - 1]?.values[column]
      if (Number.isFinite(prev) && v > prev) cur.total += v - prev
    } else {
      const dt = Math.min((records[i + 1]?.ts ?? r.ts + cap / 1.5) - r.ts, cap)
      cur.total += (v * dt) / 3600
    }
  }
  if (cur) cur.avg = sum / cur.n
  return out
}

/** value at fraction p (0..1) of the sorted numbers */
export function percentile(values: number[], p: number): number {
  if (!values.length) return NaN
  const s = [...values].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(p * s.length))]
}

export interface UsageProfile {
  /** [weekday Mon..Sun][hour 0..23] average per hour; null = no data */
  weekdayHour: (number | null)[][]
  /** average per hour of the day over all days */
  day: (number | null)[]
  weekdayAvg: number | null
  weekendAvg: number | null
  /** the lowest 10 % of hours — standby / base load */
  base: number
  /** highest hours, at most one per day */
  peaks: { start: number; value: number }[]
}

/**
 * Typical week from hourly buckets: counters use the consumption per hour, levels the
 * average value — for a power series both read as "kW in that hour".
 */
export function usageProfile(hourly: Bucket[], counter: boolean, peakCount = 10): UsageProfile {
  const val = (b: Bucket): number => (counter ? b.total : b.avg)
  const sums = Array.from({ length: 7 }, () => new Array<number>(24).fill(0))
  const counts = Array.from({ length: 7 }, () => new Array<number>(24).fill(0))
  const mean = (s: number, n: number): number | null => (n ? s / n : null)
  let wd = [0, 0]
  let we = [0, 0]
  for (const b of hourly) {
    const d = weekday(b.start)
    const h = Math.floor((b.start % DAY) / 3600)
    sums[d][h] += val(b)
    counts[d][h]++
    if (d < 5) wd = [wd[0] + val(b), wd[1] + 1]
    else we = [we[0] + val(b), we[1] + 1]
  }
  const day = Array.from({ length: 24 }, (_, h) =>
    mean(
      sums.reduce((s, row) => s + row[h], 0),
      counts.reduce((s, row) => s + row[h], 0)
    )
  )
  const byDay = new Map<number, Bucket>()
  for (const b of hourly) {
    const k = Math.floor(b.start / DAY)
    const best = byDay.get(k)
    if (!best || val(b) > val(best)) byDay.set(k, b)
  }
  return {
    weekdayHour: sums.map((row, d) => row.map((s, h) => mean(s, counts[d][h]))),
    day,
    weekdayAvg: mean(wd[0], wd[1]),
    weekendAvg: mean(we[0], we[1]),
    base: percentile(hourly.map(val), 0.1),
    peaks: [...byDay.values()]
      .sort((a, b) => val(b) - val(a))
      .slice(0, peakCount)
      .map((b) => ({ start: b.start, value: val(b) }))
  }
}

/** 6 significant digits — enough for any meter, and no 0.30000000000000004 in tool output */
export function round(x: number | null): number | null {
  return x === null || !Number.isFinite(x) ? null : Number(x.toPrecision(6))
}
