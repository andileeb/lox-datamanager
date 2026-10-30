import { existsSync, renameSync } from 'fs'
import { join } from 'path'

/**
 * userData folder under appData — no Electron imports, so it unit-tests.
 * Up to v0.3 the app was "Loxone DataManager" and stored everything in
 * 'loxone-datamanager'; move that once to the new name. If the move fails
 * (e.g. an old version is still running) keep using the old folder and retry
 * next launch — saved connections, cache, backups and the MCP token must never
 * look wiped.
 */
export function resolveUserData(appData: string): string {
  const dir = join(appData, 'lox-datamanager')
  const legacy = join(appData, 'loxone-datamanager')
  if (!existsSync(dir) && existsSync(legacy)) {
    try {
      renameSync(legacy, dir)
    } catch {
      return legacy
    }
  }
  return dir
}
