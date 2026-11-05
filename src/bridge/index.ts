/**
 * stdio ↔ HTTP bridge shipped inside the Claude Desktop extension (.mcpb, see main/claude-clients.ts).
 * Claude Desktop runs it with its built-in Node and talks MCP over stdin/stdout; every message is
 * POSTed to our Streamable HTTP server (stateless, so no session to keep). Address and token come
 * from LDM_BRIDGE_CONFIG (a file the app keeps current) on every message, so Regenerate or a new
 * port never needs a reinstall. Node built-ins only — nothing else exists inside the extension.
 */
import { readFileSync } from 'fs'
import { createInterface } from 'readline'

export interface Target {
  url: string
  token: string
}

const NOT_RUNNING =
  'Lox DataManager is not running or AI access is off — open it (Settings → AI) and try again.'

/** one JSON-RPC message from Claude → our server; replies go to `write`, one line each */
export async function forward(
  msg: string,
  target: Target | null,
  write: (line: string) => void
): Promise<void> {
  let id: unknown
  try {
    id = (JSON.parse(msg) as { id?: unknown }).id
  } catch {
    return
  }
  const fail = (message: string): void => {
    // notifications get no reply; a request must, or Claude waits for it forever
    if (id !== undefined)
      write(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32000, message } }))
  }
  if (!target) return fail(NOT_RUNNING)
  let res: Response
  try {
    res = await fetch(target.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${target.token}`
      },
      body: msg
    })
  } catch {
    return fail(NOT_RUNNING)
  }
  const text = await res.text()
  if (res.status === 202) return
  if (!res.ok) return fail(`HTTP ${res.status}${text ? `: ${text.slice(0, 300)}` : ''}`)
  if (res.headers.get('content-type')?.includes('text/event-stream')) {
    for (const line of text.split(/\r?\n/))
      if (line.startsWith('data:')) write(line.slice(5).trim())
  } else if (text.trim()) write(text.trim())
}

function target(): Target | null {
  try {
    const all = JSON.parse(readFileSync(process.env.LDM_BRIDGE_CONFIG ?? '', 'utf8'))
    return all[process.env.LDM_BRIDGE_SERVER ?? ''] ?? null
  } catch {
    return null
  }
}

if (process.env.LDM_BRIDGE_SERVER) {
  createInterface({ input: process.stdin }).on('line', (line) => {
    if (line.trim()) void forward(line, target(), (l) => process.stdout.write(l + '\n'))
  })
}
