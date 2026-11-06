import type {
  Backup,
  CachedFile,
  Catalog,
  ClaudeSetup,
  ConnMeta,
  ControlProfile,
  DownloadOutcome,
  EnergyOverview,
  IpcResult,
  LocalOpened,
  LocalSource,
  ConfigMcpState,
  ConfigRemoteInfo,
  McpActivity,
  McpState,
  Problem,
  RemoteFile,
  StatFileData,
  StatRecord,
  TlsMode,
  TlsPref,
  TransferProgress,
  UpdateCheck
} from './types'
import type { RecordsDiff } from './records'
import type { ClaudeClient } from './mcp-clients'

export interface ConnectPayload {
  host: string
  port: number
  user: string
  password: string
  tls: TlsPref
}

export interface TransferFilePayload {
  name: string
  size: number
  modifiedAt: string | null
}

/** Contract between preload (implements) and renderer (consumes as window.api). */
export interface Api {
  ftp: {
    connect(args: ConnectPayload): Promise<IpcResult<TlsMode>>
    connectSaved(id: string): Promise<IpcResult<TlsMode>>
    disconnect(): Promise<IpcResult<null>>
    listStats(): Promise<IpcResult<RemoteFile[]>>
    download(files: TransferFilePayload[]): Promise<IpcResult<DownloadOutcome>>
    upload(names: string[]): Promise<IpcResult<string[]>>
    delete(names: string[]): Promise<IpcResult<null>>
    /** save dialog, then downloads ALL /stats into a zip; resolves with the written path or null when cancelled */
    backupZip(): Promise<IpcResult<string | null>>
  }
  connections: {
    list(): Promise<IpcResult<ConnMeta[]>>
    save(meta: ConnMeta, password: string): Promise<IpcResult<null>>
    remove(id: string): Promise<IpcResult<null>>
  }
  /** offline sessions: no Miniserver, files are read from and saved to a local folder */
  local: {
    cachedHosts(): Promise<IpcResult<LocalSource[]>>
    openCached(name: string): Promise<IpcResult<LocalOpened>>
    /** shows an open dialog; resolves with null when cancelled */
    open(kind: 'folder' | 'files'): Promise<IpcResult<LocalOpened | null>>
  }
  /** server copies saved before each upload/delete (connected sessions only) */
  backups: {
    list(name: string): Promise<IpcResult<Backup[]>>
    /** copies the backup over the cached file; upload it to put it back on the Miniserver */
    restore(name: string, id: string): Promise<IpcResult<null>>
  }
  /** uuid → name/room/category/unit from the Miniserver's LoxAPP3.json; {} when unavailable */
  catalog: {
    get(): Promise<IpcResult<Catalog>>
  }
  /** dashboard: the same aggregates as the MCP insight tools; downloads missing months (read-only) */
  insights: {
    /** from = YYYYMM, default the newest 3 months per control */
    energy(from?: string): Promise<IpcResult<EnergyOverview>>
    profile(control: string, from?: string): Promise<IpcResult<ControlProfile>>
  }
  miniserver: {
    /** restarts the connected Miniserver over its web server (admin user needed) */
    reboot(): Promise<IpcResult<null>>
  }
  cache: {
    list(): Promise<IpcResult<CachedFile[]>>
    openFolder(): Promise<IpcResult<null>>
  }
  stat: {
    parse(name: string): Promise<IpcResult<StatFileData>>
    validate(name: string, records: StatRecord[]): Promise<IpcResult<Problem[]>>
    /** writes the edited records into the cached file; returns fresh problems */
    serialize(name: string, records: StatRecord[]): Promise<IpcResult<Problem[]>>
    /** opens a save dialog; resolves with the written path or null when cancelled */
    exportCsv(name: string): Promise<IpcResult<string | null>>
    /** compares records with the Miniserver's copy; null = not on the Miniserver yet */
    diffRemote(name: string, records: StatRecord[]): Promise<IpcResult<RecordsDiff | null>>
  }
  mcp: {
    get(): Promise<IpcResult<McpState>>
    /** persists the config and starts/stops/restarts the server accordingly */
    configure(enabled: boolean, port: number): Promise<IpcResult<McpState>>
    regenerateToken(): Promise<IpcResult<McpState>>
  }
  configMcp: {
    get(): Promise<IpcResult<ConfigMcpState>>
    /** start/stop sharing this PC's Loxone Config MCP on the local network */
    share(enabled: boolean): Promise<IpcResult<ConfigMcpState>>
    /** new token → the old connection code stops working */
    regenerate(): Promise<IpcResult<ConfigMcpState>>
    /** tests a connection code (initialize + tools/list) and remembers it when it works */
    connect(code: string): Promise<IpcResult<ConfigRemoteInfo>>
    forget(): Promise<IpcResult<null>>
  }
  claude: {
    /** Claude apps found on this computer and whether our servers are in their config */
    get(): Promise<IpcResult<ClaudeSetup[]>>
    /** writes every available server (this app's, Loxone Config's) into that app's config */
    add(client: ClaudeClient): Promise<IpcResult<ClaudeSetup[]>>
  }
  updates: {
    /** asks GitHub for the newest release; never rejects, latest is null when it failed */
    check(): Promise<IpcResult<UpdateCheck>>
  }
  onTransferProgress(cb: (p: TransferProgress) => void): () => void
  onMcpActivity(cb: (a: McpActivity) => void): () => void
}
