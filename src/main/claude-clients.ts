/**
 * "Add to Claude" in Settings. Claude Code: our servers are merged into ~/.claude.json (user scope,
 * the same thing Loxone Config's one-click connect does). Claude Desktop: one extension (.mcpb) per
 * server, opened so Claude Desktop shows its own install dialog; it runs bridge.js (src/bridge) on its
 * built-in Node, so users need no Node.js. The bridge reads address + token from mcp-bridge.json in
 * userData, which writeBridge() keeps current — installed extensions never go stale.
 * LDM_CLAUDE_CONFIG_DIR puts every Claude file in one folder and skips opening Claude Desktop (tests
 * only — never let a test run touch the real files).
 */
import { app, shell } from 'electron'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { strToU8, zipSync } from 'fflate'
import icon from '../../resources/icon.png?asset'
import {
  addServers,
  clientEntry,
  extensionManifest,
  hasOurServers,
  OUR_SERVERS,
  serverStatus,
  type ClaudeClient,
  type Servers
} from '../shared/mcp-clients'
import type { ClaudeSetup } from '../shared/types'
import { CodedError } from './stats-service'

const CLIENTS: ClaudeClient[] = ['claudeCode', 'claudeDesktop']
const testDir = process.env.LDM_CLAUDE_CONFIG_DIR

const desktopDir = (): string => testDir ?? join(app.getPath('appData'), 'Claude')
const codeFile = (): string => join(testDir ?? homedir(), '.claude.json')
/** where Claude Desktop keeps manually added servers — earlier versions of "Add" wrote there */
const desktopFile = (): string => join(desktopDir(), 'claude_desktop_config.json')
const bridgeConfig = (): string => join(app.getPath('userData'), 'mcp-bridge.json')

/** Claude Code creates ~/.claude.json on first run, Claude Desktop its folder on install */
function installed(client: ClaudeClient): boolean {
  return existsSync(client === 'claudeCode' ? codeFile() : desktopDir())
}

function read(file: string): string | null {
  return existsSync(file) ? readFileSync(file, 'utf8') : null
}

/** manifest names of the extensions installed in Claude Desktop (folder names are its own ids) */
function extensionNames(): string[] {
  const dir = join(desktopDir(), 'Claude Extensions')
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((d) => {
    try {
      return [JSON.parse(readFileSync(join(dir, d, 'manifest.json'), 'utf8')).name as string]
    } catch {
      return []
    }
  })
}

const entriesFor = (client: ClaudeClient, servers: Servers): Record<string, object> =>
  Object.fromEntries(
    Object.entries(servers).map(([name, s]) => [name, clientEntry(client, s.url, s.token)])
  )

/** address + token per server for bridge.js; owner-only, same trust level as the stats cache */
function writeBridge(servers: Servers): void {
  writeFileSync(bridgeConfig(), JSON.stringify(servers), { mode: 0o600 })
}

/** keeps the bridge file current — only once one of our extensions is installed */
export function refreshBridge(servers: Servers): void {
  if (extensionNames().some((n) => OUR_SERVERS.includes(n))) writeBridge(servers)
}

export function setup(servers: Servers): ClaudeSetup[] {
  const ext = extensionNames()
  return CLIENTS.filter(installed).map((client) => ({
    client,
    servers:
      client === 'claudeCode'
        ? serverStatus(read(codeFile()), entriesFor(client, servers))
        : Object.fromEntries(
            Object.keys(servers).map((n) => [n, ext.includes(n) ? 'current' : 'missing'])
          )
  }))
}

/** merges `entries` into a Claude config file; `remove` names leave it. An unreadable file is
 *  never overwritten. */
function writeFile(file: string, entries: Record<string, object>, remove: string[]): void {
  let text: string
  try {
    text = addServers(read(file), entries, remove)
  } catch {
    throw new CodedError('CLIENT_CONFIG_UNREADABLE', `${file} is not valid JSON`)
  }
  // write next to it + rename: Claude never sees a half-written file
  writeFileSync(`${file}.ldm-tmp`, text)
  renameSync(`${file}.ldm-tmp`, file)
}

/** Claude Code: our names not in `servers` any more (Loxone Config forgotten) leave the file */
const writeCode = (servers: Servers): void =>
  writeFile(
    codeFile(),
    entriesFor('claudeCode', servers),
    OUR_SERVERS.filter((n) => n !== 'lox-datamanager' && !(n in servers))
  )

async function installExtensions(servers: Servers): Promise<void> {
  writeBridge(servers)
  const dir = join(app.getPath('userData'), 'claude-extensions')
  mkdirSync(dir, { recursive: true })
  const bridge = readFileSync(join(__dirname, 'bridge.js'))
  const have = extensionNames()
  for (const name of Object.keys(servers).filter((n) => !have.includes(n))) {
    const file = join(dir, `${name}.mcpb`)
    const manifest = extensionManifest(name, app.getVersion(), bridgeConfig())
    writeFileSync(
      file,
      zipSync({
        'manifest.json': strToU8(JSON.stringify(manifest, null, 2)),
        'server/bridge.js': bridge,
        'icon.png': readFileSync(icon)
      })
    )
    if (testDir) continue
    // Claude Desktop owns .mcpb → its install dialog; without it, show the file to double-click
    const err = await shell.openPath(file)
    if (err) {
      shell.showItemInFolder(file)
      throw new CodedError('EXTENSION_OPEN_FAILED', err)
    }
  }
  // entries the old way (mcp-remote in its config file) would show every server twice
  if (hasOurServers(read(desktopFile()))) {
    try {
      writeFile(desktopFile(), {}, OUR_SERVERS)
    } catch {
      // unreadable → leave it alone
    }
  }
}

export async function add(client: ClaudeClient, servers: Servers): Promise<void> {
  if (client === 'claudeCode') writeCode(servers)
  else if (client === 'claudeDesktop') await installExtensions(servers)
  else throw new Error(`unknown client ${client}`)
}

/** after a new token / port / connection code: Claude Desktop's extensions read the bridge file,
 *  Claude Code's entries are rewritten if we were added there. Never adds us on its own. */
export function sync(servers: Servers): void {
  refreshBridge(servers)
  if (!hasOurServers(read(codeFile()))) return
  try {
    writeCode(servers)
  } catch {
    // unreadable file → Settings shows the error when the user clicks Add
  }
}
