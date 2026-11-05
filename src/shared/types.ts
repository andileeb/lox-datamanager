// Types shared between main and renderer (IPC payloads).
import type { UsageProfile } from './insights'
import type { ClaudeClient, ServerStatus } from './mcp-clients'

export type TlsPref = 'auto' | 'ftps' | 'plain'
export type TlsMode = 'ftps' | 'plain'

export interface ConnMeta {
  id: string
  name: string
  host: string
  port: number
  user: string
  tls: TlsPref
}

export interface RemoteFile {
  name: string
  uuid: string
  /** _1.._9 suffix of newer meter blocks, null for classic files */
  suffix: number | null
  yyyymm: string
  size: number
  /** ISO timestamp, null when the server listing had no parseable date */
  modifiedAt: string | null
}

/** a cached host folder that can be opened offline */
export interface LocalSource {
  name: string
  count: number
}

/** result of opening a cached host / local folder / local files */
export interface LocalOpened {
  label: string
  /** the picked files when single files were opened, null for a whole folder */
  files: string[] | null
}

export interface CachedFile {
  name: string
  size: number
  modifiedAt: string
  /** stat name read from the file header */
  nameFromHeader: string | null
}

/** server copy saved before an upload/delete; id = file-name-safe ISO timestamp */
export interface Backup {
  id: string
  size: number
}

export type SyncStatus = 'only-remote' | 'only-local' | 'same' | 'remote-newer' | 'local-newer'

/** ts = seconds since 2009-01-01 UTC (Loxone epoch) */
export interface StatRecord {
  ts: number
  values: number[]
}

export interface Problem {
  /** record index, null for file-level problems */
  row: number | null
  rule:
    | 'uuid-mismatch'
    | 'timestamp-order'
    | 'timestamp-outside-month'
    | 'invalid-value'
    | 'spike'
    | 'bad-header'
  severity: 'error' | 'warning'
  message: string
}

export interface StatFileData {
  fileName: string
  nameFromHeader: string
  valueCount: number
  stride: number
  records: StatRecord[]
  problems: Problem[]
}

export interface TransferProgress {
  file: string
  index: number
  total: number
  bytes: number
  bytesTotal: number
}

/** bulk downloads continue past per-file errors and report both lists */
export interface DownloadOutcome {
  done: string[]
  failed: { name: string; message: string }[]
}

/** Serialized error shape crossing IPC; code lets the UI special-case (e.g. FTP_REFUSED → setup hint) */
export interface ApiError {
  code:
    | 'FTP_REFUSED'
    | 'FTP_AUTH_FAILED'
    | 'FTP_TIMEOUT'
    | 'FTP_NOT_CONNECTED'
    | 'NO_PASSWORD'
    | 'NO_PERMISSION'
    | 'PARSE_ERROR'
    | 'IO_ERROR'
    | 'BAD_CONNECTION_CODE'
    | 'MCP_AUTH_FAILED'
    | 'MCP_NOT_LAN'
    | 'MCP_UNREACHABLE'
    | 'CONFIG_NOT_RUNNING'
    | 'CLIENT_CONFIG_UNREADABLE'
    | 'EXTENSION_OPEN_FAILED'
    | 'UNKNOWN'
  message: string
}

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: ApiError }

/** state of the embedded MCP server, for the Settings UI */
export interface McpState {
  enabled: boolean
  port: number
  token: string | null
  running: boolean
  url: string
  error: string | null
}

/** Loxone Config MCP shared across computers (config-share.ts), for the Settings UI */
export interface ConfigMcpState {
  /** this computer can share (Loxone Config runs on Windows only) */
  shareAvailable: boolean
  shareEnabled: boolean
  running: boolean
  error: string | null
  /** port Config's MCP listens on right now; null = Config or its MCP isn't running */
  configPort: number | null
  /** connection codes for the other computer, one per local-network address */
  codes: string[]
  /** code pasted on this computer to reach another one's Config */
  remoteCode: string | null
}

/** "Add to Claude": one per Claude app found on this computer, status per server name */
export interface ClaudeSetup {
  client: ClaudeClient
  servers: Record<string, ServerStatus>
}

/** what a shared Config MCP answered to initialize + tools/list */
export interface ConfigRemoteInfo {
  name: string
  version: string
  tools: number
}

/** result of the GitHub release check (notification only — the app never self-installs) */
export interface UpdateCheck {
  current: string
  /** null when the check failed: offline, rate-limited, or no release published yet */
  latest: string | null
  /** release page to open in the browser */
  url: string
  updateAvailable: boolean
}

/** broadcast to the renderer when an MCP client changes something the UI may show */
export interface McpActivity {
  kind: 'save' | 'upload' | 'delete' | 'download' | 'connect' | 'disconnect'
  name?: string
}

export const LOXONE_EPOCH_OFFSET = 1230768000 // 2009-01-01T00:00:00Z in unix seconds

export const STAT_FILENAME_RE =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{16})(?:_([1-9]))?\.([12][0-9]{3})([01][0-9])$/

/** what the Miniserver's structure file (LoxAPP3.json) says about a control uuid */
export interface CatalogEntry {
  name: string
  room: string | null
  category: string | null
  /** Loxone control type, e.g. "Meter" */
  type: string | null
  /** unit per value of the classic (unsuffixed) file, from its printf format ("%.1f°C" → "°C") */
  units: (string | null)[]
  /** Meter controls: unit of the _1 power / _2 meter reading / _3 storage files */
  suffixUnits?: Record<number, string | null>
}

/** lowercase uuid → entry */
export type Catalog = Record<string, CatalogEntry>

/** kWh of one energy/power control; per column (0 = consumption, 1 = production / 2nd tariff) */
export interface EnergySeries {
  control: string
  description: string | null
  room: string | null
  source: 'meter reading' | 'power (integrated)'
  /** null = column is not a cumulative reading */
  totalKWh: (number | null)[]
  perMonth: ({ month: string; kWh: number | null }[] | null)[]
}

export interface EnergyOverview {
  series: EnergySeries[]
  /** meter/energy controls without units in the structure file */
  skippedNoUnit: string[]
}

export interface ControlProfile {
  control: string
  description: string | null
  room: string | null
  unit: string | null
  counter: boolean
  months: string[]
  spikesIgnored: number
  stale: string[]
  profile: UsageProfile
}
