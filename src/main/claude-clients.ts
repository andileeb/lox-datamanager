/**
 * "Add to Claude" in Settings: writes our MCP servers into Claude Code's and Claude Desktop's
 * config files (the same thing Loxone Config's one-click connect does), merging via
 * shared/mcp-clients.ts. LDM_CLAUDE_CONFIG_DIR puts both files in one folder (tests only — never
 * let a test run touch the real files).
 */
import { app } from 'electron'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'
import { addServers, serverStatus, type ClaudeClient } from '../shared/mcp-clients'
import type { ClaudeSetup } from '../shared/types'
import { CodedError } from './stats-service'

const CLIENTS: ClaudeClient[] = ['claudeCode', 'claudeDesktop']

function configFile(client: ClaudeClient): string {
  const dir = process.env.LDM_CLAUDE_CONFIG_DIR
  return client === 'claudeCode'
    ? join(dir ?? homedir(), '.claude.json')
    : join(dir ?? join(app.getPath('appData'), 'Claude'), 'claude_desktop_config.json')
}

/** Claude Code creates ~/.claude.json on first run, Claude Desktop its folder on install */
function installed(client: ClaudeClient): boolean {
  const file = configFile(client)
  return existsSync(client === 'claudeCode' ? file : dirname(file))
}

function read(file: string): string | null {
  return existsSync(file) ? readFileSync(file, 'utf8') : null
}

export function setup(entries: (client: ClaudeClient) => Record<string, object>): ClaudeSetup[] {
  return CLIENTS.filter(installed).map((client) => ({
    client,
    servers: serverStatus(read(configFile(client)), entries(client))
  }))
}

export function add(client: ClaudeClient, entries: Record<string, object>): void {
  if (!CLIENTS.includes(client)) throw new Error(`unknown client ${client}`)
  const file = configFile(client)
  let text: string
  try {
    text = addServers(read(file), entries)
  } catch {
    throw new CodedError('CLIENT_CONFIG_UNREADABLE', `${file} is not valid JSON`)
  }
  // write next to it + rename: Claude never sees a half-written file
  writeFileSync(`${file}.ldm-tmp`, text)
  renameSync(`${file}.ldm-tmp`, file)
}
