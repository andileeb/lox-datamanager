import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import * as ftp from './ftp'
import * as cache from './cache'
import { webGet } from './web'
import { parseStructure } from '../shared/catalog'
import type { Catalog } from '../shared/types'

/** the extracted catalog, saved next to the cached stats (not the full LoxAPP3.json — it holds more than we need) */
const CATALOG_FILE = 'catalog.json'

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
    p = webGet('/data/LoxAPP3.json')
      .then((body) => JSON.parse(body))
      .then((s) => writeFileSync(join(dir, CATALOG_FILE), JSON.stringify(parseStructure(s))))
      // no catalog is fine — names fall back to the stat file headers (and a stale saved catalog)
      .catch((e) => console.warn('LoxAPP3.json fetch failed:', (e as Error).message))
    fetched.set(host, p)
  }
  await p
  return readDir(dir)
}
