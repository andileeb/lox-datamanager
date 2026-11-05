/**
 * "Add to Claude": the server entries Claude Code (~/.claude.json, user scope) and Claude Desktop
 * (claude_desktop_config.json) need, and merging them into those files. Pure so it unit-tests;
 * the file I/O is in main/claude-clients.ts.
 */

export type ClaudeClient = 'claudeCode' | 'claudeDesktop'

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
