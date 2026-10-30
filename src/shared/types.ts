// Types shared between main and renderer (IPC payloads).

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
    'uuid-mismatch' | 'timestamp-order' | 'timestamp-outside-month' | 'invalid-value' | 'bad-header'
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
    | 'PARSE_ERROR'
    | 'IO_ERROR'
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
