import { createServer, type Server } from 'http'
import type { AddressInfo } from 'net'
import { afterAll, describe, expect, it } from 'vitest'
import { listenFallback } from '../src/main/listen'

const open: Server[] = []
afterAll(() => open.forEach((s) => s.close()))
const server = (): Server => {
  const s = createServer()
  open.push(s)
  return s
}

describe('listenFallback', () => {
  it('takes the port when free, the next free one when taken, skipping avoided ports', async () => {
    const first = server()
    const port = await listenFallback(first, 23000 + Math.floor(Math.random() * 1000), '127.0.0.1')
    expect(typeof port).toBe('number')
    const p = port as number
    expect((first.address() as AddressInfo).port).toBe(p)
    expect(await listenFallback(server(), p, '127.0.0.1', [p + 1])).toBe(p + 2)
  })
  it('all ten taken → any free port the OS picks', async () => {
    const base = 24000 + Math.floor(Math.random() * 1000)
    for (let i = 0; i < 10; i++) await listenFallback(server(), base + i, '127.0.0.1')
    const p = await listenFallback(server(), base, '127.0.0.1')
    expect(typeof p).toBe('number')
    expect((p as number) < base || (p as number) >= base + 10).toBe(true)
  })
})
