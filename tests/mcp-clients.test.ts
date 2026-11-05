import { describe, expect, it } from 'vitest'
import { addServers, clientEntry, serverStatus } from '../src/shared/mcp-clients'

const url = 'http://127.0.0.1:12009/mcp'
const entry = clientEntry('claudeCode', url, 'tok')

describe('clientEntry', () => {
  it('Claude Code talks HTTP with the bearer header', () => {
    expect(entry).toEqual({ type: 'http', url, headers: { Authorization: 'Bearer tok' } })
  })
  it('Claude Desktop goes through mcp-remote with the header in env', () => {
    const e = clientEntry('claudeDesktop', url, 'tok') as { args: string[]; env: object }
    expect(e.args).toContain(url)
    expect(e.env).toEqual({ AUTH_HEADER: 'Bearer tok' })
  })
})

describe('addServers', () => {
  it('creates a new file', () => {
    expect(JSON.parse(addServers(null, { a: entry }))).toEqual({ mcpServers: { a: entry } })
  })
  it('keeps other settings and servers, replaces its own', () => {
    const old = JSON.stringify({ theme: 'dark', mcpServers: { other: { x: 1 }, a: { old: true } } })
    expect(JSON.parse(addServers(old, { a: entry }))).toEqual({
      theme: 'dark',
      mcpServers: { other: { x: 1 }, a: entry }
    })
  })
  it('refuses a file it cannot read', () => {
    expect(() => addServers('{broken', { a: entry })).toThrow()
    expect(() => addServers('[1]', { a: entry })).toThrow()
  })
})

describe('serverStatus', () => {
  it('missing / current / outdated', () => {
    const text = JSON.stringify({ mcpServers: { a: entry, b: { ...entry, url: 'old' } } })
    expect(serverStatus(text, { a: entry, b: entry, c: entry })).toEqual({
      a: 'current',
      b: 'outdated',
      c: 'missing'
    })
  })
  it('an unreadable file counts as missing', () => {
    expect(serverStatus('{broken', { a: entry })).toEqual({ a: 'missing' })
  })
})
