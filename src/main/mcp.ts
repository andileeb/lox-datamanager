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
import { buildServer } from './mcp-tools'
import type { McpActivity } from '../shared/types'

let server: Server | null = null
let lastError: string | null = null

function sha256(s: string): Buffer {
  return createHash('sha256').update(s).digest()
}

async function authorized(req: IncomingMessage): Promise<boolean> {
  const token = await store.getMcpToken()
  if (!token) return false
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) return false
  return timingSafeEqual(sha256(header.slice(7)), sha256(token))
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

export function status(): { running: boolean; error: string | null } {
  return { running: server !== null, error: lastError }
}

/** (re)start according to the stored config; resolves once listening or failed */
export async function start(): Promise<void> {
  await stop()
  lastError = null
  const { enabled, port } = store.getMcpConfig()
  if (!enabled) return
  if (!(await store.getMcpToken())) await store.regenerateMcpToken()
  await new Promise<void>((resolve) => {
    const s = createServer((req, res) => {
      void handleHttp(req, res)
    })
    s.on('error', (e) => {
      lastError = (e as NodeJS.ErrnoException).code ?? e.message
      if (server === s) server = null
      resolve()
    })
    s.listen(port, '127.0.0.1', () => {
      server = s
      resolve()
    })
  })
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
