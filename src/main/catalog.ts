import http from 'http'
import https from 'https'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import * as ftp from './ftp'
import * as cache from './cache'
import { parseStructure } from '../shared/catalog'
import type { Catalog } from '../shared/types'

// socket idle time, not total — a big structure file still loads; a silent web port only
// delays the header-name fallback by this much (per scheme tried)
const TIMEOUT_MS = 5000
/** the extracted catalog, saved next to the cached stats (not the full LoxAPP3.json — it holds more than we need) */
const CATALOG_FILE = 'catalog.json'

function get(url: string, auth: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const onRes = (res: http.IncomingMessage): void => {
      if (res.statusCode !== 200) {
        res.resume()
        reject(new Error(`HTTP ${res.statusCode}`))
        return
      }
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      res.on('error', reject)
    }
    const opts = { headers: { Authorization: auth }, timeout: TIMEOUT_MS }
    const req = url.startsWith('https:')
      ? // Miniserver certs are self-signed / hostname-mismatched on the LAN, like FTPS
        https.get(url, { ...opts, rejectUnauthorized: false }, onRes)
      : http.get(url, opts, onRes)
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', reject)
  })
}

/**
 * LoxAPP3.json over HTTP basic auth with the FTP credentials. FTPS sessions only try
 * https, so the password never goes out in the clear when the user chose TLS.
 */
async function fetchStructure(): Promise<unknown> {
  const { host, user, password, tls } = ftp.webTarget()
  const h = host.includes(':') ? `[${host}]` : host
  // ponytail: default web ports only; LDM_WEB_PORT is for the test harness — add a form field if users need one
  const port = process.env['LDM_WEB_PORT'] ? `:${process.env['LDM_WEB_PORT']}` : ''
  const auth = `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`
  let lastErr: unknown
  for (const scheme of tls ? ['https'] : ['http', 'https']) {
    try {
      return JSON.parse(await get(`${scheme}://${h}${port}/data/LoxAPP3.json`, auth))
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr
}

function readDir(dir: string): Catalog {
  try {
    const saved = join(dir, CATALOG_FILE)
    if (existsSync(saved)) return JSON.parse(readFileSync(saved, 'utf8'))
    // a local folder may hold the structure file itself (e.g. copied from the Miniserver)
    const raw = join(dir, 'LoxAPP3.json')
    if (existsSync(raw)) return parseStructure(JSON.parse(readFileSync(raw, 'utf8')))
  } catch (e) {
    console.warn('catalog unreadable:', (e as Error).message)
  }
  return {}
}

// ponytail: fetched once per host per app launch; renames in Loxone Config show after a restart
const fetched = new Map<string, Promise<void>>()

/** the session's catalog; a connected session fetches it from the Miniserver first */
export async function sessionCatalog(): Promise<Catalog> {
  const local = cache.localSource()
  if (local) return readDir(local)
  const host = ftp.activeHost()
  const dir = cache.cacheDir(host)
  let p = fetched.get(host)
  if (!p) {
    p = fetchStructure()
      .then((s) => writeFileSync(join(dir, CATALOG_FILE), JSON.stringify(parseStructure(s))))
      // no catalog is fine — names fall back to the stat file headers (and a stale saved catalog)
      .catch((e) => console.warn('LoxAPP3.json fetch failed:', (e as Error).message))
    fetched.set(host, p)
  }
  await p
  return readDir(dir)
}
