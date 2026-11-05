import { describe, expect, it } from 'vitest'
import {
  addServers,
  clientEntry,
  extensionManifest,
  hasOurServers,
  serverStatus
} from '../src/shared/mcp-clients'

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
  it('removes the given names', () => {
    const old = JSON.stringify({ mcpServers: { a: entry, b: entry } })
    expect(JSON.parse(addServers(old, { a: entry }, ['b']))).toEqual({ mcpServers: { a: entry } })
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

describe('hasOurServers', () => {
  it('only when one of our names is there', () => {
    expect(hasOurServers(JSON.stringify({ mcpServers: { 'loxone-config': {} } }))).toBe(true)
    expect(hasOurServers(JSON.stringify({ mcpServers: { other: {} } }))).toBe(false)
    expect(hasOurServers(null)).toBe(false)
    expect(hasOurServers('{broken')).toBe(false)
  })
})

describe('extensionManifest', () => {
  it('runs the bridge on Claude Desktop’s built-in Node and points it at the config file', () => {
    const m = extensionManifest('lox-datamanager', '0.12.0', '/data/mcp-bridge.json') as {
      name: string
      server: { type: string; mcp_config: { command: string; args: string[]; env: object } }
      compatibility: { runtimes?: object }
    }
    expect(m.name).toBe('lox-datamanager')
    expect(m.server.type).toBe('node')
    expect(m.server.mcp_config.command).toBe('node')
    expect(m.server.mcp_config.args).toEqual(['${__dirname}/server/bridge.js'])
    expect(m.server.mcp_config.env).toEqual({
      LDM_BRIDGE_CONFIG: '/data/mcp-bridge.json',
      LDM_BRIDGE_SERVER: 'lox-datamanager'
    })
    // a node version range here can make Claude Desktop look for a system Node instead
    expect(m.compatibility.runtimes).toBeUndefined()
  })
})
