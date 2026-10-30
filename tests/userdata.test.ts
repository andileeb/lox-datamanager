import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveUserData } from '../src/main/userdata'

let appData: string
afterEach(() => rmSync(appData, { recursive: true, force: true }))
const fresh = (): string => (appData = mkdtempSync(join(tmpdir(), 'ldm-appdata-')))

describe('resolveUserData', () => {
  it('moves the pre-rename folder with its contents', () => {
    fresh()
    mkdirSync(join(appData, 'loxone-datamanager'))
    writeFileSync(join(appData, 'loxone-datamanager', 'connections.json'), '{"x":1}')
    const dir = resolveUserData(appData)
    expect(dir).toBe(join(appData, 'lox-datamanager'))
    expect(readFileSync(join(dir, 'connections.json'), 'utf8')).toBe('{"x":1}')
    expect(existsSync(join(appData, 'loxone-datamanager'))).toBe(false)
  })

  it('leaves both alone when the new folder already exists', () => {
    fresh()
    mkdirSync(join(appData, 'loxone-datamanager'))
    mkdirSync(join(appData, 'lox-datamanager'))
    expect(resolveUserData(appData)).toBe(join(appData, 'lox-datamanager'))
    expect(existsSync(join(appData, 'loxone-datamanager'))).toBe(true)
  })

  it('uses the new folder on a fresh install', () => {
    fresh()
    expect(resolveUserData(appData)).toBe(join(appData, 'lox-datamanager'))
  })
})
