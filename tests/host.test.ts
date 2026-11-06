import { describe, expect, it } from 'vitest'
import { cleanHost } from '../src/shared/host'

describe('cleanHost', () => {
  it('strips what a pasted address carries around the host', () => {
    expect(cleanHost('  192.168.1.5 ')).toBe('192.168.1.5')
    expect(cleanHost('http://192.168.1.5/')).toBe('192.168.1.5')
    expect(cleanHost('https://miniserver.local:8080/#/home')).toBe('miniserver.local')
    expect(cleanHost('ftp://admin@192.168.1.5:21')).toBe('192.168.1.5')
    expect(cleanHost('192.168.1.5:80')).toBe('192.168.1.5')
    expect(cleanHost('[fe80::1]')).toBe('fe80::1')
    expect(cleanHost('http://[fe80::1]:80/')).toBe('fe80::1')
    expect(cleanHost('fe80::1')).toBe('fe80::1')
  })
  it('keeps Loxone Cloud DNS addresses whole', () => {
    expect(cleanHost('https://dns.loxonecloud.com/504F94ABCDEF/')).toBe(
      'https://dns.loxonecloud.com/504F94ABCDEF/'
    )
  })
})
