/**
 * Embedded MCP server: Streamable HTTP on 127.0.0.1, bearer-token auth.
 * Stateless — a fresh McpServer + transport per POST (the SDK's documented
 * pattern for single-user endpoints; avoids request-ID collisions).
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'
import { createHash, timingSafeEqual } from 'crypto'
import { BrowserWindow } from 'electron'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import * as store from './store'
import * as configShare from './config-share'
import { listenFallback } from './listen'
import { buildServer } from './mcp-tools'
import type { McpActivity } from '../shared/types'

let server: Server | null = null
let lastError: string | null = null
/** the stored port was taken by another program at the last start → we moved off it */
let movedFrom: number | null = null

function sha256(s: string): Buffer {
  return createHash('sha256').update(s).digest()
}

/** constant-time `Authorization: Bearer <token>` check (also used by config-share.ts) */
export function bearerMatches(req: IncomingMessage, token: string | null): boolean {
  const header = req.headers.authorization
  if (!token || !header?.startsWith('Bearer ')) return false
  return timingSafeEqual(sha256(header.slice(7)), sha256(token))
}

async function authorized(req: IncomingMessage): Promise<boolean> {
  return bearerMatches(req, await store.getMcpToken())
}

async function handleHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.url?.split('?')[0] !== '/mcp') {
    res.writeHead(404).end()
    return
  }
  if (!(await authorized(req))) {
    res.writeHead(401, { 'WWW-Authenticate': 'Bearer' }).end()
    return
  }
  if (req.method !== 'POST') {
    res.writeHead(405, { Allow: 'POST' }).end()
    return
  }
  const mcp = buildServer()
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  })
  res.on('close', () => {
    void transport.close()
    void mcp.close()
  })
  try {
    await mcp.connect(transport)
    await transport.handleRequest(req, res)
  } catch (e) {
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }))
    }
  }
}

export function status(): { running: boolean; error: string | null; movedFrom: number | null } {
  return { running: server !== null, error: lastError, movedFrom }
}

/** (re)start according to the stored config; resolves once listening or failed.
 *  Port taken → listenFallback's pick is stored instead (not a second copy of this app — index.ts
 *  holds the single-instance lock); true = moved, the caller re-syncs Claude's entries. */
export async function start(): Promise<boolean> {
  await stop()
  lastError = null
  movedFrom = null
  const { enabled, port } = store.getMcpConfig()
  if (!enabled) return false
  if (!(await store.getMcpToken())) await store.regenerateMcpToken()
  const s = createServer((req, res) => {
    void handleHttp(req, res)
  })
  const got = await listenFallback(s, port, '127.0.0.1', [configShare.sharePort()])
  if (typeof got === 'string') {
    lastError = got
    return false
  }
  s.on('error', (e) => {
    lastError = (e as NodeJS.ErrnoException).code ?? e.message
    if (server === s) server = null
  })
  server = s
  if (got === port) return false
  store.setMcpConfig(true, got)
  movedFrom = port
  return true
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

/** tell all app windows that MCP changed something they may be displaying */
export function notifyRenderer(activity: McpActivity): void {
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send('mcp:activity', activity)
  }
}
