/**
 * Regenerates the README / docs screenshots from FAKE data only:
 * generated stat files on a local ftp-srv "Miniserver", a throwaway userData
 * profile (LDM_USER_DATA) and a fixed demo MCP token — never the real profile.
 *
 *   pnpm run build && pnpm run screenshots
 */
import { execFileSync } from 'child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'fs'
import { createRequire } from 'module'
import { createServer } from 'net'
import { tmpdir } from 'os'
import { join } from 'path'
import { _electron as electron, type Page } from 'playwright-core'
import { buildStatFile, loxTs } from '../tests/build-statfile.ts'

const require = createRequire(import.meta.url)
const FtpSrv = require('ftp-srv')

const ROOT = join(import.meta.dirname, '..')
const OUT = join(ROOT, 'docs', 'images')
const FTP_PORT = 2121
const MONTHS = ['202604', '202605', '202606', '202607', '202608', '202609']

// mulberry32 — deterministic noise so screenshots don't change between runs
let seed = 7
const rand = (): number => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

interface DemoStat {
  uuid: string
  suffix?: number
  name: string
  intervalSec: number
  /** values for one timestamp; hour = fractional hour of day, day = day of month */
  gen: (hour: number, day: number, i: number) => number[]
}

const sun = (h: number): number => Math.max(0, Math.sin(((h - 6) / 14) * Math.PI))
let meter = 18_400

const STATS: DemoStat[] = [
  {
    uuid: '1a9f3c20-02b4-4e11-ffffd1e2c3b4a501',
    name: 'Total power consumption',
    intervalSec: 900,
    gen: (h) => [
      0.28 +
        (h > 6.5 && h < 8.5 ? 1.6 : 0) +
        (h > 17.5 && h < 21.5 ? 2.1 : 0) +
        (h > 11.5 && h < 13 ? 1.2 : 0) +
        rand() * 0.4
    ]
  },
  {
    uuid: '1a9f3c20-02b4-4e12-ffffd1e2c3b4a502',
    name: 'PV production',
    intervalSec: 900,
    gen: (h, d) => [
      Math.max(0, 7.8 * sun(h) * (0.55 + 0.45 * Math.abs(Math.sin(d * 1.7))) - rand() * 0.3)
    ]
  },
  {
    uuid: '1a9f3c20-02b4-4e13-ffffd1e2c3b4a503',
    suffix: 2,
    name: 'Grid meter',
    intervalSec: 3600,
    gen: (h) => [(meter += 0.2 + (h > 17 && h < 22 ? 1.1 : 0.3) * rand())]
  },
  {
    uuid: '1a9f3c20-02b4-4e14-ffffd1e2c3b4a504',
    name: 'Living room temperature',
    intervalSec: 1800,
    gen: (h) => {
      const target = h > 6 && h < 22 ? 21.5 : 19
      return [target - 0.6 + Math.sin(h / 3) * 0.5 + rand() * 0.3, target]
    }
  },
  {
    uuid: '1a9f3c20-02b4-4e15-ffffd1e2c3b4a505',
    name: 'Outdoor temperature',
    intervalSec: 3600,
    gen: (h, d) => [14 + 7 * Math.sin(((h - 9) / 24) * 2 * Math.PI) + Math.sin(d / 4) * 4 + rand()]
  },
  {
    uuid: '1a9f3c20-02b4-4e16-ffffd1e2c3b4a506',
    name: 'Heat pump power',
    intervalSec: 900,
    gen: (h) => [h % 3 < 1 ? 1.4 + rand() * 0.3 : 0.02]
  }
]

function writeDemoFiles(statsDir: string): void {
  mkdirSync(statsDir, { recursive: true })
  for (const stat of STATS) {
    for (const yyyymm of MONTHS) {
      const y = Number(yyyymm.slice(0, 4))
      const m = Number(yyyymm.slice(4))
      const start = loxTs(`${y}-${String(m).padStart(2, '0')}-01T00:00:00Z`)
      const end = loxTs(new Date(Date.UTC(y, m, 1)).toISOString())
      const records: { ts: number; values: number[] }[] = []
      for (let ts = start, i = 0; ts < end; ts += stat.intervalSec, i++) {
        const sec = ts - start
        const values = stat
          .gen((sec % 86400) / 3600, Math.floor(sec / 86400) + 1, i)
          .map((v) => Math.round(v * 1000) / 1000)
        records.push({ ts, values })
      }
      // Something to fix in the file the editor screenshot opens: a spike,
      // a broken (NaN) entry and a 6-hour recording gap.
      if (stat.name === 'Total power consumption' && yyyymm === '202609') {
        records[1250].values[0] = 48.6
        records[1720].values[0] = NaN
        records.splice(2100, 24)
      }
      const { fileName, buf } = buildStatFile({
        uuid: stat.uuid,
        suffix: stat.suffix,
        yyyymm,
        name: stat.name,
        valueCount: records[0].values.length,
        records
      })
      const path = join(statsDir, fileName)
      writeFileSync(path, buf)
      const mtime = new Date(Date.UTC(y, m, 1, 0, 5))
      utimesSync(path, mtime, mtime)
    }
  }
}

const noop = (): void => undefined
// bunyan-shaped logger that drops everything — ftp-srv is chatty
const quiet = { info: noop, debug: noop, trace: noop, warn: noop, error: noop, child: () => quiet }

async function startFtp(root: string): Promise<{ close: () => Promise<void> }> {
  // Self-signed cert so the app's auto-detect lands on FTPS, like a real Gen 2
  const key = join(root, 'key.pem')
  const cert = join(root, 'cert.pem')
  execFileSync(
    'openssl',
    ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-subj', '/CN=demo'] //
      .concat(['-days', '1', '-keyout', key, '-out', cert]),
    { stdio: 'ignore' }
  )
  const server = new FtpSrv({
    url: `ftp://127.0.0.1:${FTP_PORT}`,
    pasv_url: '127.0.0.1',
    pasv_min: 30000,
    pasv_max: 30100,
    tls: { key: readFileSync(key), cert: readFileSync(cert) },
    log: quiet
  })
  server.on('login', (_: unknown, resolve: (o: { root: string }) => void) =>
    resolve({ root: join(root, 'ftp') })
  )
  await server.listen()
  return { close: () => server.close() }
}

const settle = (page: Page, ms = 800): Promise<void> => page.waitForTimeout(ms)

async function capture(dark: boolean): Promise<void> {
  const theme = dark ? 'dark' : 'light'
  const userData = mkdtempSync(join(tmpdir(), 'ldm-shots-'))
  writeFileSync(
    join(userData, 'connections.json'),
    JSON.stringify({
      connections: [],
      secrets: {},
      mcp: { enabled: true, port: 12009, tokenEnc: 'plain:demo-token-not-a-real-secret' }
    })
  )
  const env = { ...process.env, LDM_USER_DATA: userData }
  delete env['ELECTRON_RENDERER_URL']
  const app = await electron.launch({
    executablePath: require('electron') as unknown as string,
    args: [ROOT],
    env: env as Record<string, string>
  })
  try {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1280, 800)
    )
    const page = await app.firstWindow()
    await page.evaluate((d) => {
      localStorage.setItem('ldm.dark', d ? '1' : '0')
      localStorage.setItem('ldm.locale', 'en')
    }, dark)
    await page.reload()
    const shot = async (name: string): Promise<void> => {
      await settle(page)
      await page.screenshot({ path: join(OUT, `${name}-${theme}.png`) })
    }

    // Connect — the screenshot shows a generic demo host; the real target is the local fake
    const rows = page.locator('.form .row')
    await rows.nth(0).locator('input').fill('miniserver.local')
    await page.locator('#save').check()
    await page.locator('.save-opts input[type=text]').fill('Demo Home')
    await rows.nth(3).locator('input').fill('demo-password')
    await shot('connect')
    await rows.nth(0).locator('input').fill('127.0.0.1')
    await rows.nth(1).locator('input').fill(String(FTP_PORT))
    await page.locator('form button[type=submit]').click()

    // Browse: download everything except the newest month, so the status column is mixed
    await page.locator('.p-datatable-tbody tr').first().waitFor()
    await page.locator('.p-datatable-thead .p-checkbox').click()
    for (const row of await page.locator('.p-datatable-tbody tr', { hasText: '202609' }).all()) {
      await row.locator('.p-checkbox').click()
    }
    await page.getByRole('button', { name: /^Download \d+/ }).click()
    await page.getByText('Total power consumption').first().waitFor()
    await page.waitForFunction(() => !document.querySelector('.p-progressbar'), null, {
      timeout: 30_000
    })
    await page
      .locator('.p-datatable-tbody tr', { hasText: '1a9f3c20-02b4-4e11-ffffd1e2c3b4a501.202609' })
      .getByRole('button', { name: 'Download' })
      .click()
    await settle(page, 1500)
    await page
      .locator('.p-datatable-tbody tr', { hasText: '1a9f3c20-02b4-4e11-ffffd1e2c3b4a501.202609' })
      .getByRole('button', { name: 'Open' })
      .click()

    // Editor: chart + grid + problems, then the formula dialog
    await page.locator('canvas').first().waitFor()
    await shot('editor')
    await page.getByRole('button', { name: 'Calculate…' }).click()
    await page.locator('.p-dialog input').first().fill('v * 1000')
    await shot('formula')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Fill gaps' }).click()
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await settle(page)
    await page.getByRole('button', { name: 'Back', exact: true }).click()
    await page.locator('.p-datatable-tbody tr').first().waitFor()
    await shot('browser')

    await page.evaluate(() => (location.hash = '#/settings'))
    await shot('settings')
  } finally {
    await app.close()
    rmSync(userData, { recursive: true, force: true })
  }
}

// A running real app holds the MCP port → "EADDRINUSE" would end up in the settings shot
await new Promise<void>((resolve, reject) => {
  const probe = createServer()
    .once('error', () => reject(new Error('Port 12009 is busy — quit Lox DataManager first')))
    .listen(12009, '127.0.0.1', () => probe.close(() => resolve()))
})

const ftpRoot = mkdtempSync(join(tmpdir(), 'ldm-ftp-'))
writeDemoFiles(join(ftpRoot, 'ftp', 'stats'))
mkdirSync(OUT, { recursive: true })
const ftp = await startFtp(ftpRoot)
try {
  await capture(false)
  await capture(true)
} finally {
  await ftp.close()
  rmSync(ftpRoot, { recursive: true, force: true })
}
console.log(`screenshots written to ${OUT}`)
