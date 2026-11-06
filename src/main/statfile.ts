import type { Problem, StatRecord } from '../shared/types'
import { LOXONE_EPOCH_OFFSET, STAT_FILENAME_RE } from '../shared/types'
import { findResets, findSpikes } from '../shared/records'

/**
 * Loxone statistics binary format (little-endian, reverse-engineered — see
 * LoxStatEdit and sarnau/Inside-The-Loxone-Miniserver):
 *
 *   u16 valueCount | u16 unknown (often 0x8000) | u32 controlType |
 *   i32 textLen | utf8 name | 0x00 | zero-pad to record stride
 *
 * then records of `stride` bytes each:
 *
 *   u16 uuidFrag1 (3rd 16-bit uuid group) | u16 uuidFrag2 (2nd group) |
 *   u32 timestamp (seconds since 2009-01-01) | valueCount × f64 | zero-pad
 *
 * The record stride is ambiguous for valueCount >= 3 (LoxStatEdit and sarnau
 * disagree), so it is detected empirically per file.
 */

export interface ParsedStatFile {
  fileName: string
  nameFromHeader: string
  valueCount: number
  controlType: number
  stride: number
  /** verbatim original bytes up to the first record; re-emitted on serialize */
  headerBytes: Buffer
  uuidFrag1: number
  uuidFrag2: number
  records: StatRecord[]
  problems: Problem[]
}

const HEADER_FIXED = 12

export function strideCandidates(valueCount: number): number[] {
  const loxStatEdit = 8 + 8 * valueCount + (valueCount > 1 ? 8 : 0)
  const slots = valueCount <= 1 ? 1 : valueCount <= 3 ? 3 : valueCount <= 7 ? 7 : 10
  const sarnau = 8 + slots * 8
  return loxStatEdit === sarnau ? [loxStatEdit] : [loxStatEdit, sarnau]
}

export function uuidFrags(uuid: string): [number, number] {
  const groups = uuid.split('-')
  return [parseInt(groups[2], 16), parseInt(groups[1], 16)]
}

function dataStartFor(headerEnd: number, stride: number): number {
  return Math.ceil(headerEnd / stride) * stride
}

interface Candidate {
  stride: number
  dataStart: number
  strict: boolean
}

function tryCandidate(
  buf: Buffer,
  headerEnd: number,
  stride: number,
  frag1: number,
  frag2: number
): Candidate | null {
  const dataStart = dataStartFor(headerEnd, stride)
  if (buf.length < dataStart) {
    // empty file that was never padded up to the first record boundary
    return buf.length === headerEnd ? { stride, dataStart: buf.length, strict: true } : null
  }
  if ((buf.length - dataStart) % stride !== 0) return null
  let strict = true
  let prevTs = -1
  for (let off = dataStart; off < buf.length; off += stride) {
    if (buf.readUInt16LE(off) !== frag1 || buf.readUInt16LE(off + 2) !== frag2) strict = false
    const ts = buf.readUInt32LE(off + 4)
    if (ts < prevTs) strict = false
    prevTs = ts
  }
  return { stride, dataStart, strict }
}

function monthBoundsLox(yyyymm: string): [number, number] {
  const y = Number(yyyymm.slice(0, 4))
  const m = Number(yyyymm.slice(4))
  return [
    Date.UTC(y, m - 1, 1) / 1000 - LOXONE_EPOCH_OFFSET,
    Date.UTC(y, m, 1) / 1000 - LOXONE_EPOCH_OFFSET
  ]
}

/** Validation rules shared by parse-time checks and re-validation after edits. */
export function validateRecords(
  records: StatRecord[],
  yyyymm: string,
  valueCount: number
): Problem[] {
  const problems: Problem[] = []
  const [monthStart, nextMonth] = monthBoundsLox(yyyymm)
  for (let i = 0; i < records.length; i++) {
    const r = records[i]
    if (i > 0 && r.ts <= records[i - 1].ts) {
      problems.push({
        row: i,
        rule: 'timestamp-order',
        severity: 'error',
        message: `Timestamp is not after the previous entry`
      })
    }
    if (r.ts < monthStart || r.ts >= nextMonth) {
      const isLast = i === records.length - 1
      problems.push({
        row: i,
        rule: 'timestamp-outside-month',
        severity: isLast ? 'warning' : 'error',
        message: isLast
          ? `Last entry lies outside ${yyyymm} (allowed for interpolation)`
          : `Timestamp lies outside the file's month ${yyyymm}`
      })
    }
    if (r.values.length !== valueCount || r.values.some((v) => !Number.isFinite(v))) {
      problems.push({
        row: i,
        rule: 'invalid-value',
        severity: 'error',
        message: 'Entry contains NaN/Infinity or a wrong number of values'
      })
    }
  }
  for (const [row] of findSpikes(records, valueCount)) {
    if (problems.some((p) => p.row === row)) continue
    problems.push({
      row,
      rule: 'spike',
      severity: 'warning',
      message: 'Value is far outside the usual range of this series (spike?)'
    })
  }
  for (const [row] of findResets(records, valueCount)) {
    if (problems.some((p) => p.row === row)) continue
    problems.push({
      row,
      rule: 'counter-reset',
      severity: 'warning',
      message:
        'Meter reading drops here and stays low (meter reset?) — fix_counter_resets repairs it'
    })
  }
  return problems.sort((a, b) => (a.row ?? -1) - (b.row ?? -1))
}

export function parseStatFile(buf: Buffer, fileName: string): ParsedStatFile {
  const m = STAT_FILENAME_RE.exec(fileName)
  if (!m) throw new Error(`Not a statistics file name: ${fileName}`)
  const [frag1, frag2] = uuidFrags(m[1])
  const yyyymm = m[3] + m[4]

  if (buf.length < HEADER_FIXED + 1) throw new Error('File too small for a statistics header')
  const valueCount = buf.readUInt16LE(0)
  const controlType = buf.readUInt32LE(4)
  const textLen = buf.readInt32LE(8)
  if (valueCount < 1 || valueCount > 10) throw new Error(`Implausible value count ${valueCount}`)
  if (textLen < 0 || HEADER_FIXED + textLen + 1 > buf.length) {
    throw new Error(`Implausible name length ${textLen}`)
  }
  const nameFromHeader = buf.toString('utf8', HEADER_FIXED, HEADER_FIXED + textLen)
  const headerEnd = HEADER_FIXED + textLen + 1

  const candidates = strideCandidates(valueCount)
    .map((s) => tryCandidate(buf, headerEnd, s, frag1, frag2))
    .filter((c): c is Candidate => c !== null)
  // strict (uuid fragments + ascending timestamps) wins; candidate order
  // already prefers the LoxStatEdit stride on a tie
  const chosen = candidates.find((c) => c.strict) ?? candidates[0]
  if (!chosen) {
    throw new Error(`File size does not match any known record layout for ${valueCount} value(s)`)
  }

  const records: StatRecord[] = []
  const problems: Problem[] = []
  for (let off = chosen.dataStart; off < buf.length; off += chosen.stride) {
    const idx = records.length
    if (buf.readUInt16LE(off) !== frag1 || buf.readUInt16LE(off + 2) !== frag2) {
      problems.push({
        row: idx,
        rule: 'uuid-mismatch',
        severity: 'error',
        message: 'Entry UUID does not match the file name'
      })
    }
    const ts = buf.readUInt32LE(off + 4)
    const values: number[] = []
    for (let v = 0; v < valueCount; v++) values.push(buf.readDoubleLE(off + 8 + v * 8))
    records.push({ ts, values })
  }
  problems.push(...validateRecords(records, yyyymm, valueCount))
  problems.sort((a, b) => (a.row ?? -1) - (b.row ?? -1))

  return {
    fileName,
    nameFromHeader,
    valueCount,
    controlType,
    stride: chosen.stride,
    headerBytes: Buffer.from(buf.subarray(0, Math.min(chosen.dataStart, buf.length))),
    uuidFrag1: frag1,
    uuidFrag2: frag2,
    records,
    problems
  }
}

export function serializeStatFile(
  f: Pick<ParsedStatFile, 'headerBytes' | 'stride' | 'valueCount' | 'uuidFrag1' | 'uuidFrag2'>,
  records: StatRecord[]
): Buffer {
  const out = Buffer.alloc(f.headerBytes.length + records.length * f.stride)
  f.headerBytes.copy(out)
  let off = f.headerBytes.length
  for (const r of records) {
    out.writeUInt16LE(f.uuidFrag1, off)
    out.writeUInt16LE(f.uuidFrag2, off + 2)
    out.writeUInt32LE(r.ts, off + 4)
    for (let v = 0; v < f.valueCount; v++) out.writeDoubleLE(r.values[v] ?? 0, off + 8 + v * 8)
    off += f.stride
  }
  return out
}
