/**
 * Loxone Config MCP across computers. On the PC running Loxone Config (Windows): a token-gated
 * proxy on the local network in front of Config's own MCP server, which binds 127.0.0.1 on a
 * port it picks per start, has no auth and only accepts Host 127.0.0.1/localhost:<port>.
 * On the other computer: `testRemote()` checks a pasted connection code with the SDK client.
 * The proxy forwards bytes only — what the tools do (edit, save_project, undo) stays Config's.
 */
import { createServer, request, type IncomingMessage, type Server, type ServerResponse } from 'http'
import { execFile } from 'child_process'
import { networkInterfaces } from 'os'
import { promisify } from 'util'
import { app } from 'electron'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError
} from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import * as store from './store'
import { bearerMatches } from './mcp'
import { CodedError } from './stats-service'
import { listenFallback } from './listen'
import {
  CONFIG_MCP_EXE,
  connectionUrl,
  isLanAddress,
  parseConnectionCode,
  parseListeningPorts,
  parseTasklistPids
} from '../shared/config-mcp'
import type { ConfigRemoteInfo } from '../shared/types'

/** the port in the connection codes: 12010, or the free one start() moved to (stored, so codes
 *  stay valid across restarts). LDM_CONFIG_SHARE_PORT: test harness only */
export function sharePort(): number {
  return store.getConfigSharePort() || Number(process.env.LDM_CONFIG_SHARE_PORT) || 12010
}

const run = promisify(execFile)

let server: Server | null = null
let lastError: string | null = null
/** the share port was taken by another program at the last start → codes changed */
let movedFrom: number | null = null
let configPort: number | null = null

/** Config only exists on Windows; LDM_CONFIG_MCP_PORT points at a fake Config MCP (tests) */
export function shareAvailable(): boolean {
  return process.platform === 'win32' || !!process.env.LDM_CONFIG_MCP_PORT
}

/** the port Config's MCP listens on right now, or null when Config / its MCP isn't running */
export async function detectConfigPort(): Promise<number | null> {
  if (process.env.LDM_CONFIG_MCP_PORT) return (configPort = Number(process.env.LDM_CONFIG_MCP_PORT))
  if (process.platform !== 'win32') return (configPort = null)
  try {
    const opts = { windowsHide: true }
    const tasks = await run(
      'tasklist',
      ['/fi', `imagename eq ${CONFIG_MCP_EXE}`, '/fo', 'csv', '/nh'],
      opts
    )
    const pids = parseTasklistPids(tasks.stdout)
    if (!pids.length) return (configPort = null)
    const netstat = await run('netstat', ['-ano', '-p', 'tcp'], opts)
    // ponytail: first loopback listener of the process — fine while it opens only the MCP port
    return (configPort = parseListeningPorts(netstat.stdout, pids)[0] ?? null)
  } catch {
    return (configPort = null)
  }
}

/** this PC's local-network IPv4 addresses, for the connection code */
export function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal && isLanAddress(a.address))
    .filter((a) => !a!.address.startsWith('169.254.'))
    .map((a) => a!.address)
}

/** resolves false when Config refused the connection (stale port), true once answered */
function forward(
  req: IncomingMessage,
  body: Buffer,
  res: ServerResponse,
  port: number
): Promise<boolean> {
  return new Promise((resolve) => {
    const headers = { ...req.headers, host: `127.0.0.1:${port}` }
    delete headers.authorization // our token, meaningless to Config
    delete headers.origin
    const upstream = request(
      { host: '127.0.0.1', port, method: req.method, path: req.url, headers },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers)
        up.pipe(res) // streams SSE responses through as they come
        resolve(true)
      }
    )
    upstream.on('error', (e) => {
      if ((e as NodeJS.ErrnoException).code === 'ECONNREFUSED' && !res.headersSent)
        return resolve(false)
      if (res.headersSent) res.destroy()
      else res.writeHead(502).end()
      resolve(true)
    })
    res.on('close', () => upstream.destroy())
    upstream.end(body)
  })
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // ponytail: plain HTTP inside the LAN, the token is sniffable there; self-signed TLS if that matters
  if (!isLanAddress(req.socket.remoteAddress)) {
    res.writeHead(403).end()
    return
  }
  if (req.url?.split('?')[0] !== '/mcp') {
    res.writeHead(404).end()
    return
  }
  if (!bearerMatches(req, await store.getConfigShareToken())) {
    res.writeHead(401, { 'WWW-Authenticate': 'Bearer' }).end()
    return
  }
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  const body = Buffer.concat(chunks)
  // Config picks a new port when it restarts → look again once when the cached one refuses
  for (const fresh of [false, true]) {
    const port = fresh || configPort === null ? await detectConfigPort() : configPort
    if (port && (await forward(req, body, res, port))) return
  }
  res.writeHead(502, { 'Content-Type': 'application/json' }).end(
    JSON.stringify({
      error: 'Loxone Config MCP is not running: open Loxone Config and enable its MCP server'
    })
  )
}

export function status(): { running: boolean; error: string | null; movedFrom: number | null } {
  return { running: server !== null, error: lastError, movedFrom }
}

/** (re)start according to the stored config; resolves once listening or failed */
export async function start(): Promise<void> {
  await stop()
  lastError = null
  movedFrom = null
  if (!shareAvailable() || !store.getConfigShareEnabled()) return
  if (!(await store.getConfigShareToken())) await store.regenerateConfigShareToken()
  const s = createServer((req, res) => void handle(req, res))
  const port = sharePort()
  // all interfaces: Windows asks once whether to allow it on private networks
  const got = await listenFallback(s, port, undefined, [store.getMcpConfig().port])
  if (typeof got === 'string') {
    lastError = got
    return
  }
  s.on('error', (e) => {
    lastError = (e as NodeJS.ErrnoException).code ?? e.message
    if (server === s) server = null
  })
  server = s
  if (got !== port) {
    store.setConfigSharePort(got)
    movedFrom = port
  }
}

export function stop(): Promise<void> {
  return new Promise((resolve) => {
    const s = server
    if (!s) return resolve()
    server = null
    s.close(() => resolve())
    s.closeAllConnections()
  })
}

/** connects to a shared Config MCP with a pasted connection code; read-only (initialize + tools/list) */
export async function testRemote(code: string): Promise<ConfigRemoteInfo> {
  const c = parseConnectionCode(code)
  if (!c) throw new CodedError('BAD_CONNECTION_CODE', 'Not a connection code')
  const client = new Client({ name: 'lox-datamanager', version: app.getVersion() })
  const transport = new StreamableHTTPClientTransport(new URL(connectionUrl(c)), {
    requestInit: { headers: { Authorization: `Bearer ${c.token}` } }
  })
  try {
    await client.connect(transport, { timeout: 8000 })
    const { tools } = await client.listTools(undefined, { timeout: 8000 })
    const v = client.getServerVersion()
    return { name: v?.name ?? '', version: v?.version ?? '', tools: tools.length }
  } catch (e) {
    const http = e instanceof StreamableHTTPError ? e.code : undefined
    if (http === 401)
      throw new CodedError('MCP_AUTH_FAILED', 'The connection code is not valid (any more)')
    if (http === 403)
      throw new CodedError(
        'MCP_NOT_LAN',
        'Refused: only computers on the same local network may connect'
      )
    if (http === 502)
      throw new CodedError('CONFIG_NOT_RUNNING', 'Loxone Config or its MCP server is not running')
    throw new CodedError('MCP_UNREACHABLE', e instanceof Error ? e.message : String(e))
  } finally {
    await client.close().catch(() => {})
  }
}
