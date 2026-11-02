import { describe, expect, it } from 'vitest'
import {
  aggregate,
  bucketStart,
  isCounter,
  percentile,
  round,
  usageProfile,
  weekday
} from '../src/shared/insights'
import { loxTs } from './build-statfile'
import type { StatRecord } from '../src/shared/types'

/** one record every `step` s from `startIso`, value = f(i, ts) */
function series(
  startIso: string,
  n: number,
  step: number,
  f: (i: number, ts: number) => number
): StatRecord[] {
  const t0 = loxTs(startIso)
  return Array.from({ length: n }, (_, i) => ({ ts: t0 + i * step, values: [f(i, t0 + i * step)] }))
}

describe('periods', () => {
  it('weekday: Monday = 0', () => {
    expect(weekday(loxTs('2009-01-01T00:00:00Z'))).toBe(3) // Thursday
    expect(weekday(loxTs('2026-11-02T23:59:00Z'))).toBe(0) // Monday
    expect(weekday(loxTs('2026-11-08T12:00:00Z'))).toBe(6) // Sunday
  })

  it('bucketStart for each period', () => {
    const ts = loxTs('2026-11-05T13:47:12Z') // Thursday
    expect(bucketStart(ts, 'hour')).toBe(loxTs('2026-11-05T13:00:00Z'))
    expect(bucketStart(ts, 'day')).toBe(loxTs('2026-11-05T00:00:00Z'))
    expect(bucketStart(ts, 'week')).toBe(loxTs('2026-11-02T00:00:00Z'))
    expect(bucketStart(ts, 'month')).toBe(loxTs('2026-11-01T00:00:00Z'))
  })
})

describe('isCounter', () => {
  it('meter readings with a reset are a counter, power and temperature are not', () => {
    const meter = series('2026-10-01T00:00:00Z', 500, 600, (i) => (i < 300 ? 1000 + i : i - 300))
    expect(isCounter(meter, 0)).toBe(true)
    const power = series('2026-10-01T00:00:00Z', 500, 600, (i) => (i % 7 < 2 ? 2 : 0.1))
    expect(isCounter(power, 0)).toBe(false)
    const flat = series('2026-10-01T00:00:00Z', 50, 600, () => 0)
    expect(isCounter(flat, 0)).toBe(true) // e.g. a production column that stays at 0 kWh
  })
})

describe('aggregate', () => {
  it('counter: consumption per day, reset skipped, step attributed to the later record', () => {
    // 1 kWh per hour for 3 days, meter replaced (reset to 0) at the start of day 2
    const recs = series('2026-10-01T00:00:00Z', 72, 3600, (i) => (i < 30 ? 500 + i : i - 30))
    const days = aggregate(recs, 0, 'day', true)
    expect(days.map((d) => d.total)).toEqual([23, 23, 24])
    expect(days.map((d) => d.n)).toEqual([24, 24, 24])
  })

  it('level: kW × hours = kWh, gaps capped at 1.5× the interval', () => {
    // 2 kW every 10 min for one day → 48 kWh
    const recs = series('2026-10-01T00:00:00Z', 144, 600, () => 2)
    const [day] = aggregate(recs, 0, 'day', false)
    expect(day.total).toBeCloseTo(48, 6)
    expect(day.avg).toBe(2)
    // a 6 h hole only counts 15 min of it
    const holed = recs.filter((_, i) => i < 50 || i >= 86)
    expect(aggregate(holed, 0, 'day', false)[0].total).toBeCloseTo(
      ((108 * 600 + 300) * 2) / 3600,
      6
    )
  })

  it('skips NaN values and reports min/max/avg', () => {
    const recs = series('2026-10-01T00:00:00Z', 4, 600, (i) => [1, NaN, 3, 5][i])
    const [b] = aggregate(recs, 0, 'month', false)
    expect([b.n, b.min, b.max, b.avg]).toEqual([3, 1, 5, 3])
  })
})

describe('usageProfile', () => {
  it('finds the evening peak, the base load and the weekend difference', () => {
    // two weeks from Monday: 0.2 kW base, 3 kW 18–19 h, weekends +0.3 kW all day
    const recs = series('2026-10-05T00:00:00Z', 14 * 24 * 6, 600, (_, ts) => {
      const h = Math.floor((ts % 86400) / 3600)
      return (h === 18 ? 3 : 0.2) + (weekday(ts) >= 5 ? 0.3 : 0)
    })
    const p = usageProfile(aggregate(recs, 0, 'hour', false), false)
    expect(p.day[18]).toBeCloseTo((3 * 5 + 3.3 * 2) / 7, 6)
    expect(p.day[3]).toBeCloseTo((0.2 * 5 + 0.5 * 2) / 7, 6)
    expect(p.weekdayHour[0][18]).toBeCloseTo(3, 6)
    expect(p.weekdayHour[6][3]).toBeCloseTo(0.5, 6)
    expect(p.base).toBeCloseTo(0.2, 6)
    expect(p.weekendAvg! - p.weekdayAvg!).toBeCloseTo(0.3, 6)
    expect(p.peaks).toHaveLength(10)
    expect(new Set(p.peaks.map((x) => Math.floor(x.start / 86400))).size).toBe(10) // one per day
    expect(p.peaks[0].value).toBeCloseTo(3.3, 6)
  })

  it('counter series profile = consumption per hour', () => {
    const recs = series('2026-10-05T00:00:00Z', 48 * 6 + 1, 600, (i) => i * 0.1) // 0.6 kWh/h
    const p = usageProfile(aggregate(recs, 0, 'hour', true), true)
    expect(p.day[5]).toBeCloseTo(0.6, 6)
  })
})

describe('helpers', () => {
  it('percentile and round', () => {
    expect(percentile([5, 1, 3, 2, 4], 0)).toBe(1)
    expect(percentile([5, 1, 3, 2, 4], 0.5)).toBe(3)
    expect(Number.isNaN(percentile([], 0.5))).toBe(true)
    expect(round(0.1 + 0.2)).toBe(0.3)
    expect(round(NaN)).toBeNull()
  })
})
