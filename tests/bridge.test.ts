import { createServer, type Server } from 'http'
import type { AddressInfo } from 'net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { forward } from '../src/bridge'

let server: Server
let url = ''
const seen: { auth?: string; body: string }[] = []

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      seen.push({ auth: req.headers.authorization, body })
      const msg = JSON.parse(body)
      if (req.headers.authorization !== 'Bearer good') res.writeHead(401).end('nope')
      else if (msg.id === undefined) res.writeHead(202).end()
      else if (msg.method === 'sse')
        res
          .writeHead(200, { 'content-type': 'text/event-stream' })
          .end(`event: message\ndata: {"jsonrpc":"2.0","id":${msg.id},"result":{}}\n\n`)
      else
        res
          .writeHead(200, { 'content-type': 'application/json' })
          .end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { ok: true } }))
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`
})
afterAll(() => server.close())

async function run(msg: object, token = 'good', u = url): Promise<string[]> {
  const out: string[] = []
  await forward(JSON.stringify(msg), { url: u, token }, (l) => out.push(l))
  return out
}

describe('bridge forward', () => {
  it('passes a request through with the token, JSON reply', async () => {
    expect(await run({ jsonrpc: '2.0', id: 1, method: 'tools/list' })).toEqual([
      '{"jsonrpc":"2.0","id":1,"result":{"ok":true}}'
    ])
    expect(seen.at(-1)?.auth).toBe('Bearer good')
  })
  it('unpacks an SSE reply', async () => {
    expect(await run({ jsonrpc: '2.0', id: 2, method: 'sse' })).toEqual([
      '{"jsonrpc":"2.0","id":2,"result":{}}'
    ])
  })
  it('notifications get no reply', async () => {
    expect(await run({ jsonrpc: '2.0', method: 'notifications/initialized' })).toEqual([])
  })
  it('an error status becomes a JSON-RPC error for that id', async () => {
    const [line] = await run({ jsonrpc: '2.0', id: 3, method: 'x' }, 'bad')
    expect(JSON.parse(line)).toMatchObject({ id: 3, error: { message: 'HTTP 401: nope' } })
  })
  it('app not running → a readable error instead of silence', async () => {
    const [line] = await run(
      { jsonrpc: '2.0', id: 4, method: 'x' },
      'good',
      'http://127.0.0.1:1/mcp'
    )
    expect(JSON.parse(line).error.message).toMatch(/not running/)
    // another PC (Loxone Config share): says what to check, incl. macOS's Local Network permission
    const [lan] = await run(
      { jsonrpc: '2.0', id: 6, method: 'x' },
      'good',
      'http://localhost:1/mcp'
    )
    expect(JSON.parse(lan).error.message).toMatch(/Local Network/)
    const out: string[] = []
    await forward('{"jsonrpc":"2.0","id":5}', null, (l) => out.push(l))
    expect(JSON.parse(out[0]).error.message).toMatch(/not running/)
  })
})
