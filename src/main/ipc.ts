import { app, dialog, ipcMain, shell } from 'electron'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { basename, dirname, join } from 'path'
import { zipSync, type Zippable } from 'fflate'
import * as ftp from './ftp'
import * as store from './store'
import * as cache from './cache'
import * as stats from './stats-service'
import * as mcp from './mcp'
import * as updates from './updates'
import { CodedError, toApiError } from './stats-service'
import { parseStatFile, validateRecords } from './statfile'
import { diffRecords } from '../shared/records'
import type { ConnMeta, IpcResult, LocalOpened, McpState, StatRecord } from '../shared/types'
import { STAT_FILENAME_RE } from '../shared/types'
import type { ConnectPayload, TransferFilePayload } from '../shared/api'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (...args: any[]) => unknown

function handle(channel: string, fn: Handler): void {
  ipcMain.handle(channel, async (_event, ...args): Promise<IpcResult<unknown>> => {
    try {
      return { ok: true, data: await fn(...args) }
    } catch (e) {
      return { ok: false, error: toApiError(e) }
    }
  })
}

/** like handle(), but fn receives the ipc event first (for progress events) */
function handleE(channel: string, fn: Handler): void {
  ipcMain.handle(channel, async (event, ...args): Promise<IpcResult<unknown>> => {
    try {
      return { ok: true, data: await fn(event, ...args) }
    } catch (e) {
      return { ok: false, error: toApiError(e) }
    }
  })
}

/** leave any Miniserver/offline session before starting a new one */
function resetSession(): void {
  stats.clear()
  ftp.disconnect()
  cache.setLocalDir(null)
}

function openLocal(dir: string, label: string, files: string[] | null): LocalOpened {
  resetSession()
  cache.setLocalDir(dir, files)
  return { label, files }
}

export function registerIpc(): void {
  handle('ftp:connect', (args: ConnectPayload) => {
    cache.setLocalDir(null)
    return ftp.connect(args)
  })
  handle('ftp:connectSaved', async (id: string) => {
    cache.setLocalDir(null)
    const meta = store.getConnection(id)
    if (!meta) throw new CodedError('UNKNOWN', 'Saved connection not found')
    const password = await store.getPassword(id)
    if (password === null) {
      throw new CodedError('NO_PASSWORD', 'No stored password — enter it manually')
    }
    return ftp.connect({ ...meta, password })
  })
  handle('ftp:disconnect', () => {
    resetSession()
    return null
  })

  handle('local:cachedHosts', () => cache.listCachedHosts())
  handle('local:openCached', (name: string) => openLocal(cache.cachedHostDir(name), name, null))
  handle('local:open', async (kind: 'folder' | 'files'): Promise<LocalOpened | null> => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: kind === 'folder' ? ['openDirectory'] : ['openFile', 'multiSelections']
    })
    if (canceled || !filePaths.length) return null
    if (kind === 'folder') return openLocal(filePaths[0], basename(filePaths[0]), null)
    const dir = dirname(filePaths[0])
    const names = filePaths.map((p) => basename(p))
    const bad = names.find((n) => !STAT_FILENAME_RE.test(n))
    if (bad) {
      throw new CodedError('IO_ERROR', `${bad} is not a Loxone statistics file (<uuid>.YYYYMM)`)
    }
    if (filePaths.some((p) => dirname(p) !== dir)) {
      throw new CodedError('IO_ERROR', 'Pick files from one folder')
    }
    return openLocal(dir, basename(dir), names)
  })
  handle('ftp:listStats', () => ftp.listStats())
  handleE('ftp:download', (event, files: TransferFilePayload[]) =>
    ftp.download(files, cache.cacheDir(ftp.activeHost()), (p) =>
      event.sender.send('transfer:progress', p)
    )
  )
  handleE('ftp:backupZip', async (event) => {
    const host = ftp.activeHost()
    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: `loxone-stats-${host}-${new Date().toISOString().slice(0, 10)}.zip`,
      filters: [{ name: 'Zip archive', extensions: ['zip'] }]
    })
    if (canceled || !filePath) return null
    // download fresh into a temp dir so the backup reflects server state, not local edits
    const files = await ftp.listStats()
    const tmp = mkdtempSync(join(tmpdir(), 'loxone-backup-'))
    try {
      const outcome = await ftp.download(files, tmp, (p) =>
        event.sender.send('transfer:progress', p)
      )
      if (outcome.failed.length) {
        // an incomplete backup silently masquerading as complete is worse than no backup
        const names = outcome.failed.map((f) => f.name)
        throw new CodedError(
          'IO_ERROR',
          `Backup aborted — ${names.length} file(s) failed to download: ${names.slice(0, 3).join(', ')}${names.length > 3 ? ', …' : ''}`
        )
      }
      const entries: Zippable = {}
      for (const f of files) {
        entries[f.name] = [
          readFileSync(join(tmp, f.name)),
          f.modifiedAt ? { mtime: new Date(f.modifiedAt) } : {}
        ]
      }
      // ponytail: zipSync blocks main for a few seconds on huge archives; fflate's async zip() if it hurts
      writeFileSync(filePath, zipSync(entries))
      return filePath
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  handle('connections:list', () => store.listConnections())
  handle('connections:save', async (meta: ConnMeta, password: string) => {
    await store.saveConnection(meta, password)
    return null
  })
  handle('connections:remove', (id: string) => {
    store.deleteConnection(id)
    return null
  })

  handleE('ftp:upload', (event, names: string[]) => {
    const host = ftp.activeHost()
    const dir = cache.cacheDir(host)
    const files = names.map((name) => {
      const path = cache.cachePath(host, name)
      return { name, size: statSync(path).size, modifiedAt: null }
    })
    return ftp.upload(
      files,
      dir,
      (p) => event.sender.send('transfer:progress', p),
      (name) => cache.newBackupPath(host, name)
    )
  })
  handle('ftp:delete', (names: string[]) => {
    for (const name of names) {
      if (!/^[0-9a-f-]+(_[1-9])?\.\d{6}$/.test(name)) throw new CodedError('UNKNOWN', 'Bad name')
    }
    const host = ftp.activeHost()
    return ftp.remove(names, (name) => cache.newBackupPath(host, name))
  })
  handle('backups:list', (name: string) => cache.listBackups(ftp.activeHost(), name))
  handle('backups:restore', (name: string, id: string) => {
    cache.restoreBackup(ftp.activeHost(), name, id)
    stats.discard(name) // the editor reparses the restored bytes
    return null
  })

  handle('cache:list', () => cache.listWork())
  handle('cache:openFolder', () => {
    shell.openPath(cache.workDir())
    return null
  })

  const mcpState = async (): Promise<McpState> => {
    const { enabled, port } = store.getMcpConfig()
    const { running, error } = mcp.status()
    return {
      enabled,
      port,
      token: await store.getMcpToken(),
      running,
      url: `http://127.0.0.1:${port}/mcp`,
      error
    }
  }
  handle('mcp:get', () => mcpState())
  handle('mcp:configure', async (enabled: boolean, port: number) => {
    store.setMcpConfig(enabled, port)
    await mcp.start() // reads the stored config; stops when disabled
    return mcpState()
  })
  handle('mcp:regenerateToken', async () => {
    await store.regenerateMcpToken()
    return mcpState()
  })

  handle('updates:check', () => updates.check(app.getVersion()))

  handle('stat:parse', (name: string) => stats.toStatFileData(stats.loadParsed(name)))
  handle('stat:validate', (name: string, records: StatRecord[]) => {
    const parsed = stats.getParsed(name)
    return validateRecords(records, name.slice(-6), parsed.valueCount)
  })
  handle('stat:serialize', (name: string, records: StatRecord[]) =>
    stats.saveRecords(name, records)
  )
  // null = not on the Miniserver yet (the upload creates it)
  handle('stat:diffRemote', async (name: string, records: StatRecord[]) => {
    cache.cachePath(ftp.activeHost(), name) // validates the renderer-supplied name
    if (!(await ftp.exists(name))) return null
    const tmp = mkdtempSync(join(tmpdir(), 'ldm-diff-'))
    try {
      const { failed } = await ftp.download([{ name, size: 0, modifiedAt: null }], tmp, () => {})
      if (failed.length) throw new Error(failed[0].message)
      return diffRecords(parseStatFile(readFileSync(join(tmp, name)), name).records, records)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
  handle('stat:exportCsv', async (name: string) => {
    const parsed = stats.getParsed(name)
    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: `${name}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    })
    if (canceled || !filePath) return null
    writeFileSync(filePath, stats.buildCsv(parsed).csv)
    return filePath
  })
}
