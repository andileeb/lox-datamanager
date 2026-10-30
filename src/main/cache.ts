import { app } from 'electron'
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readSync, statSync } from 'fs'
import { join } from 'path'
import * as ftp from './ftp'
import type { CachedFile, LocalSource } from '../shared/types'
import { STAT_FILENAME_RE } from '../shared/types'

const cacheRoot = (): string => join(app.getPath('userData'), 'stats-cache')

export function cacheDir(host: string): string {
  const safe = host.replace(/[^a-zA-Z0-9.-]/g, '_')
  const dir = join(cacheRoot(), safe)
  mkdirSync(dir, { recursive: true })
  return dir
}

/** name is renderer-supplied — the regex check doubles as path-traversal protection */
export function cachePath(host: string, name: string): string {
  if (!STAT_FILENAME_RE.test(name)) throw new Error(`Invalid statistics file name: ${name}`)
  return join(cacheDir(host), name)
}

/** offline session: a cached host's folder or any local folder, no Miniserver involved */
let localDir: string | null = null
/** single files picked with "Open files…" — the session shows only these */
let localFiles: Set<string> | null = null

export function setLocalDir(dir: string | null, files: string[] | null = null): void {
  localDir = dir
  localFiles = dir && files ? new Set(files) : null
}

export function localSource(): string | null {
  return localDir
}

/** where the session's stat files are read from and saved to */
export function workDir(): string {
  return localDir ?? cacheDir(ftp.activeHost())
}

export function workPath(name: string): string {
  if (!STAT_FILENAME_RE.test(name)) throw new Error(`Invalid statistics file name: ${name}`)
  if (localFiles && !localFiles.has(name)) throw new Error(`${name} was not opened`)
  return join(workDir(), name)
}

/** the session's files: the work dir, narrowed to the picked files if any */
export function listWork(): CachedFile[] {
  const files = listDir(workDir())
  return localFiles ? files.filter((f) => localFiles!.has(f.name)) : files
}

/** cached hosts with at least one stat file — offers "work offline" without connecting */
export function listCachedHosts(): LocalSource[] {
  const root = cacheRoot()
  if (!existsSync(root)) return []
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => ({
      name: d.name,
      count: readdirSync(join(root, d.name)).filter((n) => STAT_FILENAME_RE.test(n)).length
    }))
    .filter((h) => h.count > 0)
}

/** the folder of a cached host — name must come from listCachedHosts() */
export function cachedHostDir(name: string): string {
  const dir = join(cacheRoot(), name)
  if (!listCachedHosts().some((h) => h.name === name)) {
    throw new Error(`No cached statistics for ${name}`)
  }
  return dir
}

/** Read just the stat name out of a file header without loading the whole file. */
function peekName(path: string): string | null {
  try {
    const fd = openSync(path, 'r')
    try {
      const head = Buffer.alloc(4096)
      const n = readSync(fd, head, 0, head.length, 0)
      if (n < 13) return null
      const textLen = head.readInt32LE(8)
      if (textLen <= 0 || 12 + textLen > n) return null
      return head.toString('utf8', 12, 12 + textLen)
    } finally {
      closeSync(fd)
    }
  } catch {
    return null
  }
}

export function listDir(dir: string): CachedFile[] {
  const files: CachedFile[] = []
  for (const name of readdirSync(dir)) {
    if (!STAT_FILENAME_RE.test(name)) continue
    const path = join(dir, name)
    const st = statSync(path)
    files.push({
      name,
      size: st.size,
      modifiedAt: st.mtime.toISOString(),
      nameFromHeader: peekName(path)
    })
  }
  return files
}
