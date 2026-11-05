import { describe, expect, it } from 'vitest'
import {
  formatConnectionCode,
  isLanAddress,
  parseConnectionCode,
  parseListeningPorts,
  parseTasklistPids
} from '../src/shared/config-mcp'

describe('Config MCP port detection', () => {
  it('reads PIDs from tasklist csv, ignoring the localized "no tasks" line', () => {
    const csv = '"LoxoneConfigMcpServer.exe","9172","Console","1","45.000 K"\r\n'
    expect(parseTasklistPids(csv)).toEqual([9172])
    expect(
      parseTasklistPids('INFO: Es werden keine Aufgaben mit den angegebenen Kriterien ausgeführt.')
    ).toEqual([])
  })

  it('finds loopback listeners of the PID in any language', () => {
    const netstat = [
      'Aktive Verbindungen',
      '  Proto  Lokale Adresse         Remoteadresse          Status           PID',
      '  TCP    0.0.0.0:135            0.0.0.0:0              ABHÖREN          1000',
      '  TCP    127.0.0.1:57707        0.0.0.0:0              ABHÖREN          9172',
      '  TCP    127.0.0.1:57707        127.0.0.1:60000        HERGESTELLT      9172',
      '  TCP    127.0.0.1:57708        0.0.0.0:0              LISTENING        4242'
    ].join('\r\n')
    expect(parseListeningPorts(netstat, [9172])).toEqual([57707])
    expect(parseListeningPorts(netstat, [])).toEqual([])
  })
})

describe('isLanAddress', () => {
  it('accepts private, link-local and loopback peers', () => {
    for (const ip of [
      '192.168.1.20',
      '::ffff:10.0.0.5',
      '172.16.0.1',
      '172.31.255.1',
      '127.0.0.1',
      '169.254.3.4',
      '::1',
      'fd12::1',
      'fe80::1'
    ])
      expect(isLanAddress(ip), ip).toBe(true)
  })
  it('rejects public, CGNAT and missing peers', () => {
    for (const ip of [
      '8.8.8.8',
      '172.32.0.1',
      '100.64.0.1',
      '2a01:4f8::1',
      '::ffff:1.2.3.4',
      undefined
    ])
      expect(isLanAddress(ip), String(ip)).toBe(false)
  })
})

describe('connection code', () => {
  it('round-trips and rejects junk', () => {
    const c = { host: '192.168.1.20', port: 12010, token: 'abcDEF_-0123456789xyz' }
    expect(parseConnectionCode(` ${formatConnectionCode(c)} `)).toEqual(c)
    expect(parseConnectionCode('192.168.1.20:12010/short')).toBeNull()
    expect(parseConnectionCode('192.168.1.20:99999/abcDEF_-0123456789xyz')).toBeNull()
    expect(parseConnectionCode('http://x:1/abcDEF_-0123456789xyz')).toBeNull()
  })
})
