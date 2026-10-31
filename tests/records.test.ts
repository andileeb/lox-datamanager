import { describe, expect, it } from 'vitest'
import {
  applyToRecords,
  diffRecords,
  dominantInterval,
  fileOffsets,
  fillGaps,
  isCurrentMonth,
  locateIndex,
  type MonthFileLike,
  orderMonths,
  packRecords,
  statusOf,
  summarizeRecords,
  unpackRecords
} from '../src/shared/records'
import { compileFormula } from '../src/shared/formula'
import { loxTs, makeRecords } from './build-statfile'
import type { CachedFile, RemoteFile } from '../src/shared/types'

describe('dominantInterval', () => {
  it('finds the most frequent delta', () => {
    const records = makeRecords(20, 1, '2024-01-01T00:00:00Z', 300)
    records.push({ ts: records[19].ts + 4000, values: [0] })
    expect(dominantInterval(records)).toBe(300)
  })

  it('defaults to 600 with too few records', () => {
    expect(dominantInterval([])).toBe(600)
    expect(dominantInterval(makeRecords(1, 1))).toBe(600)
  })
})

describe('fillGaps', () => {
  it('interpolates missing records linearly', () => {
    const start = loxTs('2024-01-01T00:00:00Z')
    const records = [
      { ts: start, values: [0] },
      { ts: start + 600, values: [10] },
      // gap of 3 missing records
      { ts: start + 3000, values: [50] },
      { ts: start + 3600, values: [60] }
    ]
    const result = fillGaps(records, 600)
    expect(result.inserted).toBe(3)
    expect(result.records).toHaveLength(7)
    const inserted = result.records.slice(2, 5)
    expect(inserted.map((r) => r.ts)).toEqual([start + 1200, start + 1800, start + 2400])
    expect(inserted.map((r) => r.values[0])).toEqual([20, 30, 40])
    // timestamps stay strictly ascending
    for (let i = 1; i < result.records.length; i++) {
      expect(result.records[i].ts).toBeGreaterThan(result.records[i - 1].ts)
    }
  })

  it('does nothing without gaps', () => {
    const records = makeRecords(10, 2)
    const result = fillGaps(records)
    expect(result.inserted).toBe(0)
    expect(result.records).toEqual(records)
  })
})

describe('applyToRecords', () => {
  it('applies a compiled formula to one column of selected rows', () => {
    const records = [
      { ts: 0, values: [1, 2] },
      { ts: 600, values: [3, 4] },
      { ts: 1200, values: [5, 6] }
    ]
    const fn = compileFormula('v * 1000')!
    const modified = applyToRecords(records, 2, fn, 1, [0, 2])
    expect(modified).toBe(2)
    expect(records.map((r) => r.values)).toEqual([
      [1, 2000],
      [3, 4],
      [5, 6000]
    ])
  })

  it("column 'all' without indices touches everything", () => {
    const records = [
      { ts: 0, values: [1, 2] },
      { ts: 600, values: [3, 4] }
    ]
    const modified = applyToRecords(records, 2, (v) => v + 1, 'all')
    expect(modified).toBe(2)
    expect(records.map((r) => r.values)).toEqual([
      [2, 3],
      [4, 5]
    ])
  })
})

describe('summarizeRecords', () => {
  it('reports range, per-column stats and gaps', () => {
    const start = loxTs('2024-01-01T00:00:00Z')
    const records = [
      { ts: start, values: [10] },
      { ts: start + 600, values: [20] },
      { ts: start + 1200, values: [30] },
      { ts: start + 4000, values: [40] }
    ]
    const s = summarizeRecords(records, 1)
    expect(s.count).toBe(4)
    expect(s.firstTs).toBe(start)
    expect(s.lastTs).toBe(start + 4000)
    expect(s.intervalSec).toBe(600)
    expect(s.columns).toEqual([{ min: 10, max: 40, avg: 25 }])
    expect(s.gaps).toEqual([
      { afterIndex: 2, fromTs: start + 1200, toTs: start + 4000, seconds: 2800 }
    ])
  })

  it('ignores broken (NaN) values in min/max/avg', () => {
    const s = summarizeRecords(
      [
        { ts: 0, values: [10] },
        { ts: 60, values: [NaN] },
        { ts: 120, values: [30] }
      ],
      1
    )
    expect(s.columns).toEqual([{ min: 10, max: 30, avg: 20 }])
  })

  it('handles empty record lists', () => {
    const s = summarizeRecords([], 2)
    expect(s.count).toBe(0)
    expect(s.firstTs).toBeNull()
    expect(s.columns).toEqual([
      { min: 0, max: 0, avg: 0 },
      { min: 0, max: 0, avg: 0 }
    ])
  })
})

describe('statusOf', () => {
  const remote = (over: Partial<RemoteFile> = {}): RemoteFile => ({
    name: 'a.202401',
    uuid: 'a',
    suffix: null,
    yyyymm: '202401',
    size: 100,
    modifiedAt: '2024-02-01T10:00:00Z',
    ...over
  })
  const cached = (over: Partial<CachedFile> = {}): CachedFile => ({
    name: 'a.202401',
    size: 100,
    modifiedAt: '2024-02-01T10:00:00Z',
    nameFromHeader: null,
    ...over
  })

  it('covers the full matrix', () => {
    expect(statusOf(remote(), undefined)).toBe('only-remote')
    expect(statusOf(undefined, cached())).toBe('only-local')
    expect(statusOf(remote(), cached())).toBe('same')
    expect(statusOf(remote({ modifiedAt: '2024-02-01T11:00:00Z' }), cached())).toBe('remote-newer')
    expect(statusOf(remote(), cached({ modifiedAt: '2024-02-01T11:00:00Z' }))).toBe('local-newer')
    // same mtime but different size is not "same"; the mtime tie resolves to local-newer
    expect(statusOf(remote({ size: 200 }), cached())).toBe('local-newer')
  })
})

describe('isCurrentMonth', () => {
  it('compares the yyyymm suffix against UTC now', () => {
    const now = new Date(Date.UTC(2024, 0, 15))
    expect(isCurrentMonth('uuid.202401', now)).toBe(true)
    expect(isCurrentMonth('uuid.202312', now)).toBe(false)
    expect(isCurrentMonth('uuid_1.202401', now)).toBe(true)
  })
})

describe('packRecords / unpackRecords', () => {
  it('round-trips records', () => {
    const records = makeRecords(5, 3, '2024-01-01T00:00:00Z', 600)
    const packed = packRecords(records, 3)
    expect(packed.length).toBe(20)
    expect(unpackRecords(packed, 3)).toEqual(records)
  })
  it('handles no records', () => {
    expect(unpackRecords(packRecords([], 2), 2)).toEqual([])
  })
})

describe('diffRecords', () => {
  it('counts changed, inserted and deleted entries by timestamp', () => {
    const before = [
      { ts: 1, values: [1] },
      { ts: 2, values: [2] },
      { ts: 3, values: [NaN] },
      { ts: 4, values: [4] }
    ]
    const after = [
      { ts: 1, values: [1] },
      { ts: 2, values: [20] },
      { ts: 3, values: [NaN] },
      { ts: 5, values: [5] },
      { ts: 6, values: [6] }
    ]
    expect(diffRecords(before, after)).toEqual({ changed: 1, inserted: 2, deleted: 1 })
    expect(diffRecords(before, before)).toEqual({ changed: 0, inserted: 0, deleted: 0 })
  })
})

describe('orderMonths', () => {
  const month = (yyyymm: string, valueCount = 1): MonthFileLike => ({
    fileName: `uuid.${yyyymm}`,
    valueCount,
    records: []
  })

  it('sorts months ascending regardless of input order', () => {
    const { kept, skipped } = orderMonths([month('202403'), month('202401'), month('202402')])
    expect(kept.map((f) => f.fileName)).toEqual(['uuid.202401', 'uuid.202402', 'uuid.202403'])
    expect(skipped).toEqual([])
  })

  it('skips months whose valueCount differs from the newest month', () => {
    const { kept, skipped } = orderMonths([month('202401', 2), month('202402'), month('202403')])
    expect(kept.map((f) => f.fileName)).toEqual(['uuid.202402', 'uuid.202403'])
    expect(skipped.map((f) => f.fileName)).toEqual(['uuid.202401'])
  })

  it('handles empty input', () => {
    expect(orderMonths([])).toEqual({ kept: [], skipped: [] })
  })
})

describe('fileOffsets / locateIndex', () => {
  const files = (...counts: number[]): MonthFileLike[] =>
    counts.map((n, i) => ({
      fileName: `uuid.20240${i + 1}`,
      valueCount: 1,
      records: Array.from({ length: n }, (_, k) => ({ ts: k, values: [k] }))
    }))

  it('computes prefix sums', () => {
    expect(fileOffsets(files(3, 0, 2))).toEqual([0, 3, 3])
    expect(fileOffsets([])).toEqual([])
  })

  it('locates boundary indices, skipping empty files', () => {
    const offsets = fileOffsets(files(3, 0, 2))
    expect(locateIndex(offsets, 0)).toEqual({ file: 0, local: 0 })
    expect(locateIndex(offsets, 2)).toEqual({ file: 0, local: 2 })
    // index 3 belongs to file 2 — file 1 is empty
    expect(locateIndex(offsets, 3)).toEqual({ file: 2, local: 0 })
    expect(locateIndex(offsets, 4)).toEqual({ file: 2, local: 1 })
  })
})
