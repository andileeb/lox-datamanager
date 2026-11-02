import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import {
  parseStatFile,
  serializeStatFile,
  strideCandidates,
  validateRecords
} from '../src/main/statfile'
import { buildStatFile, loxTs, makeRecords, strideFor } from './build-statfile'

describe('stride models', () => {
  it('agree for 1-2 values, diverge for 3+', () => {
    expect(strideCandidates(1)).toEqual([16])
    expect(strideCandidates(2)).toEqual([32])
    expect(strideCandidates(3)).toEqual([40, 32])
    expect(strideCandidates(4)).toEqual([48, 64])
    expect(strideCandidates(8)).toEqual([80, 88])
  })
})

describe('parse → serialize round trip', () => {
  const cases: Array<[number, 'loxstatedit' | 'sarnau']> = [
    [1, 'loxstatedit'],
    [2, 'loxstatedit'],
    [3, 'loxstatedit'],
    [3, 'sarnau'],
    [4, 'loxstatedit'],
    [4, 'sarnau'],
    [8, 'loxstatedit'],
    [8, 'sarnau']
  ]
  for (const [vc, variant] of cases) {
    it(`is byte-identical for valueCount=${vc} (${variant} stride)`, () => {
      const { fileName, buf } = buildStatFile({
        valueCount: vc,
        variant,
        records: makeRecords(100, vc)
      })
      const parsed = parseStatFile(buf, fileName)
      expect(parsed.stride).toBe(strideFor(vc, variant))
      expect(parsed.records).toHaveLength(100)
      expect(parsed.problems).toHaveLength(0)
      expect(serializeStatFile(parsed, parsed.records).equals(buf)).toBe(true)
    })
  }

  it('detects the right stride even when the file size divides by both candidates', () => {
    // 4 records × 40 B (loxstatedit, vc=3) = 160 B = 5 × 32 B (sarnau) — uuid
    // fragments and timestamps must disambiguate
    const a = buildStatFile({ valueCount: 3, variant: 'loxstatedit', records: makeRecords(4, 3) })
    expect(parseStatFile(a.buf, a.fileName).stride).toBe(40)
    const b = buildStatFile({ valueCount: 3, variant: 'sarnau', records: makeRecords(5, 3) })
    expect(parseStatFile(b.buf, b.fileName).stride).toBe(32)
  })

  it('handles an empty file and a single record', () => {
    for (const n of [0, 1]) {
      const { fileName, buf } = buildStatFile({ valueCount: 1, records: makeRecords(n, 1) })
      const parsed = parseStatFile(buf, fileName)
      expect(parsed.records).toHaveLength(n)
      expect(serializeStatFile(parsed, parsed.records).equals(buf)).toBe(true)
    }
  })

  it('preserves multi-byte UTF-8 names verbatim', () => {
    const { fileName, buf } = buildStatFile({
      valueCount: 1,
      name: 'Küchen-Temperatur 🌡',
      records: makeRecords(3, 1)
    })
    const parsed = parseStatFile(buf, fileName)
    expect(parsed.nameFromHeader).toBe('Küchen-Temperatur 🌡')
    expect(serializeStatFile(parsed, parsed.records).equals(buf)).toBe(true)
  })

  it('parses suffixed meter files (_2)', () => {
    const { fileName, buf } = buildStatFile({
      valueCount: 1,
      suffix: 2,
      records: makeRecords(5, 1)
    })
    expect(parseStatFile(buf, fileName).records).toHaveLength(5)
  })

  it('rejects garbage', () => {
    expect(() => parseStatFile(Buffer.alloc(4), 'x.202401')).toThrow()
    const huge = Buffer.alloc(64)
    huge.writeUInt16LE(500, 0) // implausible value count
    expect(() => parseStatFile(huge, '10f7ca5e-01e3-15b2-ffff8caa2f4b3d5c.202401')).toThrow(
      /value count/i
    )
  })
})

describe('validation', () => {
  it('flags uuid fragment mismatches', () => {
    const { fileName, buf } = buildStatFile({
      valueCount: 1,
      records: makeRecords(3, 1),
      frags: [0xdead, 0xbeef]
    })
    const parsed = parseStatFile(buf, fileName)
    expect(parsed.problems.filter((p) => p.rule === 'uuid-mismatch')).toHaveLength(3)
  })

  it('flags non-ascending timestamps', () => {
    const records = makeRecords(3, 1)
    records[1].ts = records[0].ts // duplicate
    expect(validateRecords(records, '202401', 1).some((p) => p.rule === 'timestamp-order')).toBe(
      true
    )
  })

  it('flags NaN values', () => {
    const records = makeRecords(2, 1)
    records[1].values[0] = NaN
    expect(validateRecords(records, '202401', 1).some((p) => p.rule === 'invalid-value')).toBe(true)
  })

  it('treats a next-month spill as a warning only on the last record', () => {
    const records = [
      { ts: loxTs('2024-01-31T23:50:00Z'), values: [1] },
      { ts: loxTs('2024-02-01T00:00:00Z'), values: [2] }
    ]
    const problems = validateRecords(records, '202401', 1)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatchObject({
      row: 1,
      rule: 'timestamp-outside-month',
      severity: 'warning'
    })

    const middle = [...records, { ts: loxTs('2024-02-01T00:10:00Z'), values: [3] }]
    const p2 = validateRecords(middle, '202401', 1)
    expect(p2.find((p) => p.row === 1)?.severity).toBe('error')
    expect(p2.find((p) => p.row === 2)?.severity).toBe('warning')
  })
})

describe('real fixture files (drop anonymized Miniserver files into tests/fixtures)', () => {
  const dir = join(__dirname, 'fixtures')
  let files: string[] = []
  try {
    files = readdirSync(dir).filter((f) => /\.\d{6}$/.test(f))
  } catch {
    // no fixtures directory
  }
  it.each(files.length ? files : [])('round-trips %s byte-identically', (name) => {
    const buf = readFileSync(join(dir, name))
    const parsed = parseStatFile(buf, name)
    expect(serializeStatFile(parsed, parsed.records).equals(buf)).toBe(true)
  })
  if (!files.length) {
    it('has no real fixtures yet (add some from a real /stats dump)', () => {
      expect(true).toBe(true)
    })
  }
})

describe('spike rule', () => {
  it('reports a spike as a warning, not on rows that already have an error', () => {
    const records = makeRecords(200, 1, '2024-01-01T00:00:00Z', 900)
    records[50].values[0] = 1e6
    records[120].values[0] = NaN
    const problems = validateRecords(records, '202401', 1)
    expect(problems.filter((p) => p.rule === 'spike')).toEqual([
      expect.objectContaining({ row: 50, severity: 'warning' })
    ])
    expect(problems.map((p) => p.row)).toEqual(
      [...problems.map((p) => p.row)].sort((a, b) => a! - b!)
    )
  })
})
