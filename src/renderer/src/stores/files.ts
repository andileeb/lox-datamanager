import { defineStore } from 'pinia'
import type {
  ApiError,
  CachedFile,
  Catalog,
  RemoteFile,
  SyncStatus,
  TransferProgress
} from '../../../shared/types'
import { STAT_FILENAME_RE } from '../../../shared/types'
import { statusOf } from '../../../shared/records'
import { useConnectionStore } from './connection'

export interface FileRow {
  name: string
  yyyymm: string
  size: number
  modifiedAt: string | null
  description: string | null
  room: string | null
  suffix: number | null
  status: SyncStatus
  remote: RemoteFile | null
}

/** community-documented meaning of the _n meter-file suffixes (i18n keys under `suffix.`) */
export const SUFFIX_KEYS: Record<number, string> = {
  1: 'power',
  2: 'meterReading',
  3: 'storageLevel'
}

export const useFilesStore = defineStore('files', {
  state: () => ({
    remote: [] as RemoteFile[],
    cached: [] as CachedFile[],
    catalog: {} as Catalog,
    loading: false,
    error: null as ApiError | null,
    transfer: null as TransferProgress | null,
    /** file names already tried while auto-resolving stat names (avoid retry loops) */
    nameResolveAttempted: [] as string[],
    /** browser-list UI state, kept so returning from the editor restores the view */
    listUi: { first: 0, rows: 50, filter: '', month: '', status: '', scrollTop: 0 }
  }),
  getters: {
    /** name per control uuid: the Miniserver's catalog, else any cached month's file header */
    nameByUuid(state): Map<string, string> {
      const map = new Map<string, string>(
        Object.entries(state.catalog).map(([uuid, e]) => [uuid, e.name])
      )
      for (const c of state.cached) {
        const m = STAT_FILENAME_RE.exec(c.name)
        if (m && c.nameFromHeader && !map.has(m[1])) map.set(m[1], c.nameFromHeader)
      }
      return map
    },
    rows(state): FileRow[] {
      const cachedByName = new Map(state.cached.map((c) => [c.name, c]))
      const remoteNames = new Set(state.remote.map((r) => r.name))
      const names = this.nameByUuid
      const rows: FileRow[] = state.remote.map((r) => {
        const c = cachedByName.get(r.name)
        return {
          name: r.name,
          yyyymm: r.yyyymm,
          size: r.size,
          modifiedAt: r.modifiedAt,
          description:
            state.catalog[r.uuid]?.name ?? c?.nameFromHeader ?? names.get(r.uuid) ?? null,
          room: state.catalog[r.uuid]?.room ?? null,
          suffix: r.suffix,
          status: statusOf(r, c),
          remote: r
        }
      })
      for (const c of state.cached) {
        if (remoteNames.has(c.name)) continue
        const m = STAT_FILENAME_RE.exec(c.name)
        rows.push({
          name: c.name,
          yyyymm: c.name.slice(-6),
          size: c.size,
          modifiedAt: c.modifiedAt,
          description:
            (m && state.catalog[m[1]]?.name) || c.nameFromHeader || (m && names.get(m[1])) || null,
          room: (m && state.catalog[m[1]]?.room) || null,
          suffix: m?.[2] ? Number(m[2]) : null,
          status: 'only-local',
          remote: null
        })
      }
      return rows
    }
  },
  actions: {
    async refresh() {
      this.loading = true
      this.error = null
      const offline = useConnectionStore().offline
      const [r, c] = await Promise.all([
        offline ? null : window.api.ftp.listStats(),
        window.api.cache.list()
      ])
      this.loading = false
      if (r?.ok) this.remote = r.data
      else if (r) this.error = r.error
      if (c.ok) this.cached = c.data
      // names from the catalog spare resolveNames the header downloads
      const cat = await window.api.catalog.get()
      if (cat.ok) this.catalog = cat.data
      void this.resolveNames()
    },
    async refreshCache() {
      const c = await window.api.cache.list()
      if (c.ok) this.cached = c.data
    },
    /**
     * Filenames are just uuids — learn the human names by downloading a small
     * month of each control whose name is still unknown. Empty stub files and
     * failed downloads are tolerated: up to 3 different months are tried per
     * control before giving up.
     */
    async resolveNames() {
      if (this.transfer) return
      const MAX_TRIES_PER_UUID = 3
      const known = this.nameByUuid
      const byUuid = new Map<string, RemoteFile[]>()
      for (const r of this.remote) {
        if (known.has(r.uuid)) continue
        const list = byUuid.get(r.uuid)
        if (list) list.push(r)
        else byUuid.set(r.uuid, [r])
      }
      const picks: RemoteFile[] = []
      for (const files of byUuid.values()) {
        const tried = files.filter((f) => this.nameResolveAttempted.includes(f.name)).length
        if (tried >= MAX_TRIES_PER_UUID) continue
        const candidates = files
          .filter((f) => !this.nameResolveAttempted.includes(f.name))
          .sort((a, b) => a.size - b.size)
        // prefer files big enough to actually hold a header over empty stubs
        const pick = candidates.find((f) => f.size >= 64) ?? candidates[0]
        if (pick) picks.push(pick)
      }
      if (!picks.length) return
      this.nameResolveAttempted.push(...picks.map((p) => p.name))
      await this.download(
        picks.map((r) => ({
          name: r.name,
          yyyymm: r.yyyymm,
          size: r.size,
          modifiedAt: r.modifiedAt,
          description: null,
          room: null,
          suffix: r.suffix,
          status: 'only-remote' as const,
          remote: r
        }))
      )
      // some controls may still be nameless (stub or failed file) — try other months
      if (picks.some((p) => !this.nameByUuid.has(p.uuid))) void this.resolveNames()
    },
    async upload(names: string[]): Promise<boolean> {
      if (!names.length) return true
      this.error = null
      this.transfer = { file: '', index: 0, total: names.length, bytes: 0, bytesTotal: 0 }
      const r = await window.api.ftp.upload(names)
      this.transfer = null
      if (!r.ok) this.error = r.error
      await this.refresh()
      return r.ok
    },
    async remove(names: string[]): Promise<boolean> {
      this.error = null
      const r = await window.api.ftp.delete(names)
      if (!r.ok) this.error = r.error
      await this.refresh()
      return r.ok
    },
    async download(rows: FileRow[]): Promise<boolean> {
      const remoteRows = rows.filter((r) => r.remote)
      if (!remoteRows.length) return true
      this.error = null
      this.transfer = { file: '', index: 0, total: remoteRows.length, bytes: 0, bytesTotal: 0 }
      const r = await window.api.ftp.download(
        remoteRows.map((row) => ({
          name: row.name,
          size: row.size,
          modifiedAt: row.remote!.modifiedAt
        }))
      )
      this.transfer = null
      await this.refreshCache()
      if (!r.ok) {
        this.error = r.error
        return false
      }
      if (r.data.failed.length) {
        this.error = {
          code: 'IO_ERROR',
          message: `${r.data.failed.length} download(s) failed — ${r.data.failed[0].name}: ${r.data.failed[0].message}`
        }
        return false
      }
      return true
    },
    /** downloads all remote stats into a zip via main; returns the saved path or null (error/cancel) */
    async backupZip(): Promise<string | null> {
      this.error = null
      this.transfer = {
        file: '',
        index: 0,
        total: this.remote.length || 1,
        bytes: 0,
        bytesTotal: 0
      }
      const r = await window.api.ftp.backupZip()
      this.transfer = null
      if (!r.ok) {
        this.error = r.error
        return null
      }
      return r.data
    }
  }
})
