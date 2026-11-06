/**
 * "Add to Claude": the server entries Claude Code (~/.claude.json, user scope) and Claude Desktop
 * (claude_desktop_config.json) need, and merging them into those files. Pure so it unit-tests;
 * the file I/O is in main/claude-clients.ts.
 */

export type ClaudeClient = 'claudeCode' | 'claudeDesktop'

/** address + token of each server we hand to Claude, by server name */
export type Servers = Record<string, { url: string; token: string }>

/** missing = not in the file, outdated = there with another URL/token */
export type ServerStatus = 'missing' | 'current' | 'outdated'

export function clientEntry(client: ClaudeClient, url: string, token: string): object {
  const auth = `Bearer ${token}`
  if (client === 'claudeCode') return { type: 'http', url, headers: { Authorization: auth } }
  // Claude Desktop's config file only starts local (stdio) servers → mcp-remote bridges to HTTP;
  // the header goes through env because spaces in args break on Windows
  return {
    command: 'npx',
    args: ['-y', 'mcp-remote', url, '--header', 'Authorization:${AUTH_HEADER}'],
    env: { AUTH_HEADER: auth }
  }
}

/** the file's JSON as an object; null/empty text = new file. Throws on anything else, so a
 *  file we can't read is never overwritten */
function parse(text: string | null): Record<string, unknown> {
  if (!text?.trim()) return {}
  const o: unknown = JSON.parse(text)
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('not a JSON object')
  return o as Record<string, unknown>
}

function servers(o: Record<string, unknown>): Record<string, unknown> {
  const s = o.mcpServers
  return s && typeof s === 'object' && !Array.isArray(s) ? (s as Record<string, unknown>) : {}
}

/** sets mcpServers[name] for every entry, drops the `remove` names, keeps everything else */
export function addServers(
  text: string | null,
  entries: Record<string, object>,
  remove: string[] = []
): string {
  const o = parse(text)
  const s = { ...servers(o), ...entries }
  for (const name of remove) delete s[name]
  o.mcpServers = s
  return JSON.stringify(o, null, 2) + '\n'
}

/** names "Add to Claude" writes — a client that has one of them is kept in sync */
export const OUR_SERVERS = ['lox-datamanager', 'loxone-config']

/** true when the file already has one of our servers (= the user added us before) */
export function hasOurServers(text: string | null): boolean {
  try {
    return OUR_SERVERS.some((n) => n in servers(parse(text)))
  } catch {
    return false
  }
}

export function serverStatus(
  text: string | null,
  entries: Record<string, object>
): Record<string, ServerStatus> {
  let existing: Record<string, unknown> = {}
  try {
    existing = servers(parse(text))
  } catch {
    // unreadable → everything counts as missing; addServers refuses to touch it
  }
  return Object.fromEntries(
    Object.entries(entries).map(([name, entry]) => [
      name,
      !(name in existing)
        ? 'missing'
        : JSON.stringify(existing[name]) === JSON.stringify(entry)
          ? 'current'
          : 'outdated'
    ])
  )
}

const EXTENSION_TEXT: Record<string, { title: string; description: string }> = {
  'lox-datamanager': {
    title: 'Lox DataManager',
    description:
      'Your Loxone Miniserver statistics: energy, usage profiles, standby, gaps — read and repair.'
  },
  'loxone-config': {
    title: 'Loxone Config (via Lox DataManager)',
    description: 'The project open in Loxone Config, shared from another computer on your network.'
  }
}

/** manifest.json of the Claude Desktop extension for one server. server.type node + command
 *  "node" and *no* compatibility.runtimes.node = Claude Desktop runs it on its built-in Node
 *  (measured in Claude Desktop 4.16: a node range there may send it looking for a system Node) */
export function extensionManifest(name: string, version: string, bridgeConfig: string): object {
  const text = EXTENSION_TEXT[name] ?? { title: name, description: name }
  return {
    manifest_version: '0.3',
    name,
    display_name: text.title,
    version,
    description: text.description,
    author: { name: 'Lox DataManager', url: 'https://github.com/andileeb/lox-datamanager' },
    homepage: 'https://github.com/andileeb/lox-datamanager',
    icon: 'icon.png',
    server: {
      type: 'node',
      entry_point: 'server/bridge.js',
      mcp_config: {
        command: 'node',
        args: ['${__dirname}/server/bridge.js'],
        env: { LDM_BRIDGE_CONFIG: bridgeConfig, LDM_BRIDGE_SERVER: name }
      }
    },
    compatibility: { platforms: ['darwin', 'win32'] }
  }
}
