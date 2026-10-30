import { defineStore } from 'pinia'
import type {
  ApiError,
  ConnMeta,
  IpcResult,
  LocalOpened,
  LocalSource,
  TlsMode
} from '../../../shared/types'
import type { ConnectPayload } from '../../../shared/api'
import { useFilesStore } from './files'

export const useConnectionStore = defineStore('connection', {
  state: () => ({
    status: 'disconnected' as 'disconnected' | 'connecting' | 'connected',
    tlsMode: null as TlsMode | null,
    activeLabel: '',
    /** offline session: a cached host or local folder, no Miniserver */
    offline: false,
    saved: [] as ConnMeta[],
    cachedHosts: [] as LocalSource[],
    error: null as ApiError | null
  }),
  actions: {
    async loadSaved() {
      const r = await window.api.connections.list()
      if (r.ok) this.saved = r.data
      const c = await window.api.local.cachedHosts()
      if (c.ok) this.cachedHosts = c.data
    },
    /** resolves with the opened files (null = whole folder), or undefined on cancel/error */
    async openLocal(
      open: () => Promise<IpcResult<LocalOpened | null>>
    ): Promise<string[] | null | undefined> {
      this.error = null
      const r = await open()
      if (!r.ok) {
        this.error = r.error
        return undefined
      }
      if (!r.data) return undefined
      useFilesStore().$reset()
      this.status = 'connected'
      this.offline = true
      this.tlsMode = null
      this.activeLabel = r.data.label
      return r.data.files
    },
    async connect(args: ConnectPayload, saveAs?: string): Promise<boolean> {
      this.status = 'connecting'
      this.error = null
      const r = await window.api.ftp.connect(args)
      if (!r.ok) {
        this.status = 'disconnected'
        this.error = r.error
        return false
      }
      this.status = 'connected'
      this.offline = false
      this.tlsMode = r.data
      this.activeLabel = saveAs || args.host
      if (saveAs) {
        const meta: ConnMeta = {
          id: crypto.randomUUID(),
          name: saveAs,
          host: args.host,
          port: args.port,
          user: args.user,
          tls: args.tls
        }
        await window.api.connections.save(meta, args.password)
        await this.loadSaved()
      }
      return true
    },
    async connectSaved(meta: ConnMeta): Promise<boolean | 'needs-password'> {
      this.status = 'connecting'
      this.error = null
      const r = await window.api.ftp.connectSaved(meta.id)
      if (!r.ok) {
        this.status = 'disconnected'
        if (r.error.code === 'NO_PASSWORD') return 'needs-password'
        this.error = r.error
        return false
      }
      this.status = 'connected'
      this.offline = false
      this.tlsMode = r.data
      this.activeLabel = meta.name
      return true
    },
    async removeSaved(id: string) {
      await window.api.connections.remove(id)
      await this.loadSaved()
    },
    async disconnect() {
      await window.api.ftp.disconnect()
      this.status = 'disconnected'
      this.offline = false
      this.tlsMode = null
      this.activeLabel = ''
      useFilesStore().$reset()
    }
  }
})
