/**
 * Sharing Loxone Config's MCP server (Config 17.3+, Windows only) with other computers on the
 * local network. Config's server binds 127.0.0.1 on a port it picks, has no auth and rejects
 * any Host header other than 127.0.0.1/localhost:<port> — config-share.ts proxies it with a
 * token. Pure helpers here so they unit-test.
 */

/** the process Config starts for its MCP server */
export const CONFIG_MCP_EXE = 'LoxoneConfigMcpServer.exe'

/** PIDs from `tasklist /fo csv /nh`; the "no tasks" line is localized, so match rows only */
export function parseTasklistPids(csv: string): number[] {
  const re = /^"([^"]+)","(\d+)"/
  return csv
    .split(/\r?\n/)
    .map((l) => re.exec(l.trim()))
    .filter((m) => m && m[1].toLowerCase() === CONFIG_MCP_EXE.toLowerCase())
    .map((m) => Number(m![2]))
}

/**
 * Loopback ports listened on by one of `pids`, from `netstat -ano -p tcp`. The state column is
 * localized ("LISTENING", "ABHÖREN"), so a listener is recognized by its 0.0.0.0:0 peer.
 */
export function parseListeningPorts(netstat: string, pids: number[]): number[] {
  const re = /^TCP\s+(127\.0\.0\.1|\[::1\]):(\d+)\s+(?:0\.0\.0\.0|\[::\]):0\s+\S+\s+(\d+)$/i
  const ports: number[] = []
  for (const line of netstat.split(/\r?\n/)) {
    const m = re.exec(line.trim())
    if (m && pids.includes(Number(m[3])) && !ports.includes(Number(m[2]))) ports.push(Number(m[2]))
  }
  return ports
}

/** private / link-local / loopback — the only peers the share accepts ("local network only") */
export function isLanAddress(address: string | undefined): boolean {
  if (!address) return false
  const ip = address.toLowerCase().replace(/^::ffff:/, '')
  const v4 = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(ip)
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])]
    return (
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254)
    )
  }
  return ip === '::1' || /^f[cd]/.test(ip) || /^fe[89ab]/.test(ip)
}

export interface ConnectionCode {
  host: string
  port: number
  token: string
}

/** the one string the sharing PC shows and the other computer pastes: `<host>:<port>/<token>` */
export function formatConnectionCode(c: ConnectionCode): string {
  return `${c.host}:${c.port}/${c.token}`
}

export function parseConnectionCode(code: string): ConnectionCode | null {
  const m = /^([A-Za-z0-9.-]+):(\d{1,5})\/([A-Za-z0-9_-]{16,})$/.exec(code.trim())
  if (!m || Number(m[2]) > 65535) return null
  return { host: m[1], port: Number(m[2]), token: m[3] }
}

export function connectionUrl(c: ConnectionCode): string {
  return `http://${c.host}:${c.port}/mcp`
}
