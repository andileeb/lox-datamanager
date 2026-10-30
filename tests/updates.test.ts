import { afterEach, describe, expect, it, vi } from 'vitest'
import { check, isNewer } from '../src/main/updates'

describe('isNewer', () => {
  it('compares release versions numerically, not lexically', () => {
    expect(isNewer('0.2.0', '0.1.0')).toBe(true)
    expect(isNewer('0.1.10', '0.1.9')).toBe(true) // string compare would say false
    expect(isNewer('1.0.0', '0.9.9')).toBe(true)
    expect(isNewer('0.10.0', '0.9.0')).toBe(true)
  })

  it('is false for equal and older versions', () => {
    expect(isNewer('0.1.0', '0.1.0')).toBe(false)
    expect(isNewer('0.1.0', '0.2.0')).toBe(false)
    expect(isNewer('0.9.9', '1.0.0')).toBe(false)
  })

  it('treats missing segments as zero', () => {
    expect(isNewer('0.2', '0.1.9')).toBe(true)
    expect(isNewer('1', '1.0.0')).toBe(false)
    expect(isNewer('1.0.1', '1')).toBe(true)
  })

  it('does not crash on prerelease tags', () => {
    expect(typeof isNewer('0.1.0-beta.1', '0.1.0')).toBe('boolean')
    expect(isNewer('0.2.0-beta.1', '0.1.0')).toBe(true)
  })
})

// a failed update check must never surface as an app error
describe('check', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('resolves with latest: null when offline', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('getaddrinfo ENOTFOUND')))
    await expect(check('0.1.0')).resolves.toMatchObject({ latest: null, updateAvailable: false })
  })

  it('resolves with latest: null on 404 (no published release yet)', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('{}', { status: 404 })))
    const r = await check('0.1.0')
    expect(r).toMatchObject({ current: '0.1.0', latest: null, updateAvailable: false })
    expect(r.url).toBe('https://github.com/andileeb/lox-datamanager/releases/latest')
  })

  it('strips the leading v from the tag', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve(
        Response.json({ tag_name: 'v0.3.0', html_url: 'https://example.test/r/v0.3.0' })
      )
    )
    await expect(check('0.1.0')).resolves.toEqual({
      current: '0.1.0',
      latest: '0.3.0',
      url: 'https://example.test/r/v0.3.0',
      updateAvailable: true
    })
  })
})
