/**
 * Shared stat-file session logic used by both the IPC handlers and the MCP
 * server, so the two surfaces cannot diverge on the byte-fidelity invariant:
 * parsed files are kept per session and serialization re-emits the original
 * header bytes verbatim.
 */
import { readFileSync, writeFileSync } from 'fs'
import { FTPError } from 'basic-ftp'
import * as ftp from './ftp'
import * as cache from './cache'
import { parseStatFile, serializeStatFile, validateRecords, type ParsedStatFile } from './statfile'
import { loxToDisplay } from '../shared/time'
import type { ApiError, Problem, StatFileData, StatRecord } from '../shared/types'

export class CodedError extends Error {
  constructor(
    public apiCode: ApiError['code'],
    message: string
  ) {
    super(message)
  }
}

export function toApiError(e: unknown): ApiError {
  if (e instanceof CodedError) return { code: e.apiCode, message: e.message }
  if (e instanceof ftp.NotConnectedError) return { code: 'FTP_NOT_CONNECTED', message: e.message }
  if (e instanceof FTPError) {
    if (e.code === 530)
      return { code: 'FTP_AUTH_FAILED', message: 'Login failed — check user and password' }
    return { code: 'UNKNOWN', message: e.message }
  }
  const msg = e instanceof Error ? e.message : String(e)
  const sysCode = (e as NodeJS.ErrnoException)?.code
  if (sysCode === 'ECONNREFUSED' || sysCode === 'EHOSTUNREACH' || sysCode === 'ENOTFOUND') {
    return { code: 'FTP_REFUSED', message: msg }
  }
  if (/timeout/i.test(msg)) return { code: 'FTP_TIMEOUT', message: msg }
  return { code: 'UNKNOWN', message: msg }
}

/** parsed files kept per session so serialization can re-emit the original header bytes */
const parsedFiles = new Map<string, ParsedStatFile>()
/** files with unsaved MCP edits (the renderer tracks its own dirty flag in Pinia) */
const dirty = new Set<string>()

export function loadParsed(name: string): ParsedStatFile {
  const path = cache.workPath(name)
  let parsed: ParsedStatFile
  try {
    parsed = parseStatFile(readFileSync(path), name)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new CodedError('IO_ERROR', `${name} is not downloaded yet`)
    }
    throw new CodedError('PARSE_ERROR', e instanceof Error ? e.message : String(e))
  }
  parsedFiles.set(name, parsed)
  dirty.delete(name)
  return parsed
}

export function getParsed(name: string): ParsedStatFile {
  return parsedFiles.get(name) ?? loadParsed(name)
}

export function isCached(name: string): boolean {
  return parsedFiles.has(name)
}

export function markDirty(name: string): void {
  dirty.add(name)
}

export function openFiles(): { name: string; dirty: boolean }[] {
  return [...parsedFiles.keys()].map((name) => ({ name, dirty: dirty.has(name) }))
}

export function toStatFileData(p: ParsedStatFile): StatFileData {
  return {
    fileName: p.fileName,
    nameFromHeader: p.nameFromHeader,
    valueCount: p.valueCount,
    stride: p.stride,
    records: p.records,
    problems: p.problems
  }
}

/** serialize with the stored header bytes, write to cache, keep the entry current */
export function saveRecords(name: string, records: StatRecord[]): Problem[] {
  const parsed = getParsed(name)
  const buf = serializeStatFile(parsed, records)
  writeFileSync(cache.workPath(name), buf)
  parsed.records = records
  parsed.problems = validateRecords(records, name.slice(-6), parsed.valueCount)
  dirty.delete(name)
  return parsed.problems
}

export function discard(name: string): void {
  parsedFiles.delete(name)
  dirty.delete(name)
}

export function clear(): void {
  parsedFiles.clear()
  dirty.clear()
}

export function buildCsv(
  p: ParsedStatFile,
  maxRows: number = Infinity
): { csv: string; truncated: boolean } {
  const header = ['Timestamp', ...Array.from({ length: p.valueCount }, (_, i) => `Value ${i + 1}`)]
  const rows = p.records.slice(0, maxRows)
  const lines = rows.map((r) => [loxToDisplay(r.ts), ...r.values.map((v) => String(v))].join(';'))
  return {
    csv: [header.join(';'), ...lines].join('\n') + '\n',
    truncated: p.records.length > rows.length
  }
}
