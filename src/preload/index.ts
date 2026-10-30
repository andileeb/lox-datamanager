import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { Api, ConnectPayload, TransferFilePayload } from '../shared/api'
import type { ConnMeta, McpActivity, StatRecord, TransferProgress } from '../shared/types'

const api: Api = {
  ftp: {
    connect: (args: ConnectPayload) => ipcRenderer.invoke('ftp:connect', args),
    connectSaved: (id: string) => ipcRenderer.invoke('ftp:connectSaved', id),
    disconnect: () => ipcRenderer.invoke('ftp:disconnect'),
    listStats: () => ipcRenderer.invoke('ftp:listStats'),
    download: (files: TransferFilePayload[]) => ipcRenderer.invoke('ftp:download', files),
    upload: (names: string[]) => ipcRenderer.invoke('ftp:upload', names),
    delete: (names: string[]) => ipcRenderer.invoke('ftp:delete', names),
    backupZip: () => ipcRenderer.invoke('ftp:backupZip')
  },
  connections: {
    list: () => ipcRenderer.invoke('connections:list'),
    save: (meta: ConnMeta, password: string) =>
      ipcRenderer.invoke('connections:save', meta, password),
    remove: (id: string) => ipcRenderer.invoke('connections:remove', id)
  },
  local: {
    cachedHosts: () => ipcRenderer.invoke('local:cachedHosts'),
    openCached: (name: string) => ipcRenderer.invoke('local:openCached', name),
    open: (kind: 'folder' | 'files') => ipcRenderer.invoke('local:open', kind)
  },
  backups: {
    list: (name: string) => ipcRenderer.invoke('backups:list', name),
    restore: (name: string, id: string) => ipcRenderer.invoke('backups:restore', name, id)
  },
  cache: {
    list: () => ipcRenderer.invoke('cache:list'),
    openFolder: () => ipcRenderer.invoke('cache:openFolder')
  },
  stat: {
    parse: (name: string) => ipcRenderer.invoke('stat:parse', name),
    validate: (name: string, records: StatRecord[]) =>
      ipcRenderer.invoke('stat:validate', name, records),
    serialize: (name: string, records: StatRecord[]) =>
      ipcRenderer.invoke('stat:serialize', name, records),
    exportCsv: (name: string) => ipcRenderer.invoke('stat:exportCsv', name),
    diffRemote: (name: string, records: StatRecord[]) =>
      ipcRenderer.invoke('stat:diffRemote', name, records)
  },
  mcp: {
    get: () => ipcRenderer.invoke('mcp:get'),
    configure: (enabled: boolean, port: number) =>
      ipcRenderer.invoke('mcp:configure', enabled, port),
    regenerateToken: () => ipcRenderer.invoke('mcp:regenerateToken')
  },
  updates: {
    check: () => ipcRenderer.invoke('updates:check')
  },
  onTransferProgress: (cb: (p: TransferProgress) => void) => {
    const listener = (_e: IpcRendererEvent, p: TransferProgress): void => cb(p)
    ipcRenderer.on('transfer:progress', listener)
    return () => ipcRenderer.removeListener('transfer:progress', listener)
  },
  onMcpActivity: (cb: (a: McpActivity) => void) => {
    const listener = (_e: IpcRendererEvent, a: McpActivity): void => cb(a)
    ipcRenderer.on('mcp:activity', listener)
    return () => ipcRenderer.removeListener('mcp:activity', listener)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
