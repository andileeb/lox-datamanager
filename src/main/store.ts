import { app, safeStorage } from 'electron'
import { randomBytes } from 'crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { ConnMeta } from '../shared/types'

// ponytail: plain JSON in userData instead of electron-store — same job, zero deps.
interface StoreShape {
  connections: ConnMeta[]
  /** base64 of safeStorage-encrypted passwords, keyed by connection id */
  secrets: Record<string, string>
  mcp?: {
    enabled: boolean
    port: number
    /** safeStorage-encrypted token (base64), or plaintext with the `plain:` prefix */
    tokenEnc: string | null
  }
  /** this PC shares Loxone Config's MCP on the local network (config-share.ts) */
  configShare?: { enabled: boolean; tokenEnc: string | null; port?: number }
  /** connection code of a Config MCP shared by another computer */
  configRemote?: { codeEnc: string }
}

const storeFile = (): string => join(app.getPath('userData'), 'connections.json')

function load(): StoreShape {
  try {
    return JSON.parse(readFileSync(storeFile(), 'utf8'))
  } catch {
    return { connections: [], secrets: {} }
  }
}

function persist(s: StoreShape): void {
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(storeFile(), JSON.stringify(s, null, 2))
}

export function listConnections(): ConnMeta[] {
  return load().connections
}

async function encrypt(plain: string): Promise<string | null> {
  if (!(await safeStorage.isAsyncEncryptionAvailable())) return null
  return (await safeStorage.encryptStringAsync(plain)).toString('base64')
}

export async function saveConnection(meta: ConnMeta, password: string): Promise<void> {
  const enc = await encrypt(password)
  const s = load()
  const idx = s.connections.findIndex((c) => c.id === meta.id)
  if (idx >= 0) s.connections[idx] = meta
  else s.connections.push(meta)
  // No OS keychain available → store no secret at all; user re-enters the password.
  if (enc) s.secrets[meta.id] = enc
  persist(s)
}

export function deleteConnection(id: string): void {
  const s = load()
  s.connections = s.connections.filter((c) => c.id !== id)
  delete s.secrets[id]
  persist(s)
}

export function getConnection(id: string): ConnMeta | null {
  return load().connections.find((c) => c.id === id) ?? null
}

/**
 * Ciphertext is only decryptable by the app that wrote it — a dev build and the
 * packaged app get different macOS keychain entries while sharing userData, so
 * decryption throws on the other one's data. Treat that as "no secret stored".
 * Ciphertext written by the pre-Electron-46 sync API decrypts here too.
 */
async function decrypt(b64: string | null | undefined): Promise<string | null> {
  if (!b64 || !(await safeStorage.isAsyncEncryptionAvailable())) return null
  try {
    // ponytail: shouldReEncrypt (key rotation) ignored — if the old key ever stops
    // working the user re-enters the password once; re-encrypt here if that gets annoying
    return (await safeStorage.decryptStringAsync(Buffer.from(b64, 'base64'))).result
  } catch {
    return null
  }
}

export async function getPassword(id: string): Promise<string | null> {
  return decrypt(load().secrets[id])
}

const MCP_DEFAULTS = { enabled: false, port: 12009, tokenEnc: null }

export function getMcpConfig(): { enabled: boolean; port: number } {
  const { enabled, port } = load().mcp ?? MCP_DEFAULTS
  return { enabled, port }
}

export function setMcpConfig(enabled: boolean, port: number): void {
  const s = load()
  s.mcp = { ...(s.mcp ?? MCP_DEFAULTS), enabled, port }
  persist(s)
}

// ponytail: plaintext fallback — tokens only gate a localhost / LAN port, same trust level as the stats cache itself
async function seal(secret: string): Promise<string> {
  return (await encrypt(secret)) ?? `plain:${secret}`
}

async function unseal(enc: string | null | undefined): Promise<string | null> {
  if (!enc) return null
  return enc.startsWith('plain:') ? enc.slice(6) : decrypt(enc)
}

const newToken = (): string => randomBytes(32).toString('base64url')

export async function getMcpToken(): Promise<string | null> {
  return unseal(load().mcp?.tokenEnc)
}

export async function regenerateMcpToken(): Promise<string> {
  const token = newToken()
  const tokenEnc = await seal(token)
  const s = load()
  s.mcp = { ...(s.mcp ?? MCP_DEFAULTS), tokenEnc }
  persist(s)
  return token
}

export function getConfigShareEnabled(): boolean {
  return load().configShare?.enabled ?? false
}

export function setConfigShareEnabled(enabled: boolean): void {
  const s = load()
  s.configShare = { tokenEnc: null, ...s.configShare, enabled }
  persist(s)
}

export function getConfigSharePort(): number | undefined {
  return load().configShare?.port
}

export function setConfigSharePort(port: number): void {
  const s = load()
  s.configShare = { enabled: true, tokenEnc: null, ...s.configShare, port }
  persist(s)
}

export async function getConfigShareToken(): Promise<string | null> {
  return unseal(load().configShare?.tokenEnc)
}

export async function regenerateConfigShareToken(): Promise<string> {
  const token = newToken()
  const tokenEnc = await seal(token)
  const s = load()
  s.configShare = { enabled: false, ...s.configShare, tokenEnc }
  persist(s)
  return token
}

export async function getConfigRemoteCode(): Promise<string | null> {
  return unseal(load().configRemote?.codeEnc)
}

export async function setConfigRemoteCode(code: string | null): Promise<void> {
  const s = load()
  if (code) s.configRemote = { codeEnc: await seal(code) }
  else delete s.configRemote
  persist(s)
}
