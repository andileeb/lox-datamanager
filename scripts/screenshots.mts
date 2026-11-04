/**
 * Regenerates the README / docs screenshots and the showcase GIF from FAKE data only:
 * generated stat files on a local ftp-srv "Miniserver" (+ a fake LoxAPP3.json for
 * names/rooms), a throwaway userData profile (LDM_USER_DATA) and a fixed demo MCP
 * token — never the real profile.
 *
 *   pnpm run build && pnpm run screenshots   # PNGs
 *   pnpm run build && pnpm run showcase      # docs/images/showcase-*.gif (needs ffmpeg)
 */
import { execFileSync } from 'child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'fs'
import { createRequire } from 'module'
import { createServer as createHttpsServer } from 'https'
import { createServer } from 'net'
import { tmpdir } from 'os'
import { join } from 'path'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright-core'
import { buildStatFile, loxTs } from '../tests/build-statfile.ts'

const require = createRequire(import.meta.url)
const FtpSrv = require('ftp-srv')

const ROOT = join(import.meta.dirname, '..')
const OUT = join(ROOT, 'docs', 'images')
const FTP_PORT = 2121
const WEB_PORT = 2443
// ponytail: env override only so --serve can run next to an installed app
const MCP_PORT = Number(process.env.LDM_MCP_PORT ?? 12009)
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
  room: string
  /** LoxAPP3.json control fields that carry the units */
  control: Record<string, unknown>
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
    room: 'Utility room',
    control: { type: 'InfoOnlyAnalog', details: { format: '%.2fkW' } },
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
    room: 'Roof',
    control: { type: 'InfoOnlyAnalog', details: { format: '%.2fkW' } },
    intervalSec: 900,
    gen: (h, d) => [
      Math.max(0, 7.8 * sun(h) * (0.55 + 0.45 * Math.abs(Math.sin(d * 1.7))) - rand() * 0.3)
    ]
  },
  {
    uuid: '1a9f3c20-02b4-4e13-ffffd1e2c3b4a503',
    suffix: 2,
    name: 'Grid meter',
    room: 'Utility room',
    control: { type: 'Meter', details: { actualFormat: '%.2fkW', totalFormat: '%.1fkWh' } },
    intervalSec: 3600,
    gen: (h) => [(meter += 0.2 + (h > 17 && h < 22 ? 1.1 : 0.3) * rand())]
  },
  {
    uuid: '1a9f3c20-02b4-4e14-ffffd1e2c3b4a504',
    name: 'Living room temperature',
    room: 'Living room',
    control: {
      type: 'IRoomControllerV2',
      statistic: { outputs: [{ format: '%.1f°C' }, { format: '%.1f°C' }] }
    },
    intervalSec: 1800,
    gen: (h) => {
      const target = h > 6 && h < 22 ? 21.5 : 19
      return [target - 0.6 + Math.sin(h / 3) * 0.5 + rand() * 0.3, target]
    }
  },
  {
    uuid: '1a9f3c20-02b4-4e15-ffffd1e2c3b4a505',
    name: 'Outdoor temperature',
    room: 'Garden',
    control: { type: 'InfoOnlyAnalog', details: { format: '%.1f°C' } },
    intervalSec: 3600,
    gen: (h, d) => [14 + 7 * Math.sin(((h - 9) / 24) * 2 * Math.PI) + Math.sin(d / 4) * 4 + rand()]
  },
  {
    uuid: '1a9f3c20-02b4-4e16-ffffd1e2c3b4a506',
    name: 'Heat pump power',
    room: 'Utility room',
    control: { type: 'InfoOnlyAnalog', details: { format: '%.2fkW' } },
    intervalSec: 900,
    gen: (h) => [h % 3 < 1 ? 1.4 + rand() * 0.3 : 0.02]
  }
]

function writeDemoFiles(statsDir: string): void {
  seed = 7
  meter = 18_400
  rmSync(statsDir, { recursive: true, force: true })
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

/** LoxAPP3.json for the demo stats, so the browser shows names and rooms like on a real Miniserver */
function demoStructure(): unknown {
  const rooms = [...new Set(STATS.map((st) => st.room))]
  return {
    rooms: Object.fromEntries(rooms.map((name, i) => [`room-${i}`, { name }])),
    cats: { 'cat-0': { name: 'Energy' } },
    controls: Object.fromEntries(
      STATS.map((st) => [
        st.uuid,
        {
          ...st.control,
          name: st.name,
          uuidAction: st.uuid,
          room: `room-${rooms.indexOf(st.room)}`,
          cat: 'cat-0'
        }
      ])
    )
  }
}

async function startServers(root: string): Promise<{ close: () => Promise<void> }> {
  // Self-signed cert so the app's auto-detect lands on FTPS, like a real Gen 2
  const key = join(root, 'key.pem')
  const cert = join(root, 'cert.pem')
  execFileSync(
    'openssl',
    ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-subj', '/CN=demo'] //
      .concat(['-days', '1', '-keyout', key, '-out', cert]),
    { stdio: 'ignore' }
  )
  const tls = { key: readFileSync(key), cert: readFileSync(cert) }
  const server = new FtpSrv({
    url: `ftp://127.0.0.1:${FTP_PORT}`,
    pasv_url: '127.0.0.1',
    pasv_min: 30000,
    pasv_max: 30100,
    tls,
    log: quiet
  })
  server.on('login', (_: unknown, resolve: (o: { root: string }) => void) =>
    resolve({ root: join(root, 'ftp') })
  )
  await server.listen()
  // the Miniserver's web server: only the structure file (the catalog fetch); FTPS → https
  const structure = JSON.stringify(demoStructure())
  const web = createHttpsServer(tls, (req, res) => {
    if (req.url !== '/data/LoxAPP3.json') return void res.writeHead(404).end()
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(structure)
  })
  await new Promise<void>((resolve) => web.listen(WEB_PORT, '127.0.0.1', resolve))
  return {
    close: async () => {
      await server.close()
      await new Promise((resolve) => web.close(resolve))
    }
  }
}

const settle = (page: Page, ms = 800): Promise<void> => page.waitForTimeout(ms)

/** Built app on a throwaway profile */
async function launch(
  dark: boolean,
  userData: string
): Promise<{ app: ElectronApplication; page: Page }> {
  writeFileSync(
    join(userData, 'connections.json'),
    JSON.stringify({
      connections: [],
      secrets: {},
      mcp: { enabled: true, port: MCP_PORT, tokenEnc: 'plain:demo-token-not-a-real-secret' }
    })
  )
  const env = { ...process.env, LDM_USER_DATA: userData, LDM_WEB_PORT: String(WEB_PORT) }
  delete env['ELECTRON_RENDERER_URL']
  const app = await electron.launch({
    executablePath: require('electron') as unknown as string,
    args: [ROOT],
    env: env as Record<string, string>
  })
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(1280, 800)
  )
  const page = await app.firstWindow()
  await page.evaluate((d) => {
    localStorage.setItem('ldm.dark', d ? '1' : '0')
    localStorage.setItem('ldm.locale', 'en')
  }, dark)
  await page.reload()
  return { app, page }
}

async function connect(page: Page, label?: string): Promise<void> {
  const rows = page.locator('.form .row')
  if (label) {
    await page.locator('#save').check()
    await page.locator('.save-opts input[type=text]').fill(label)
  }
  await rows.nth(0).locator('input').fill('127.0.0.1')
  await rows.nth(1).locator('input').fill(String(FTP_PORT))
  await rows.nth(3).locator('input').fill('demo-password')
  await page.locator('form button[type=submit]').click()
  await page.locator('.p-datatable-tbody tr').first().waitFor()
}

const transferDone = (page: Page): Promise<unknown> =>
  page.waitForFunction(() => !document.querySelector('.p-progressbar'), null, { timeout: 30_000 })

const DEMO_FILE = '1a9f3c20-02b4-4e11-ffffd1e2c3b4a501.202609'

async function capture(dark: boolean): Promise<void> {
  const theme = dark ? 'dark' : 'light'
  const userData = mkdtempSync(join(tmpdir(), 'ldm-shots-'))
  const { app, page } = await launch(dark, userData)
  try {
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
    await connect(page) // saves "Demo Home" → browser title

    // Browse: download everything except the newest month, so the status column is mixed
    await page.locator('.p-datatable-thead .p-checkbox').click()
    for (const row of await page.locator('.p-datatable-tbody tr', { hasText: '202609' }).all()) {
      await row.locator('.p-checkbox').click()
    }
    await page.getByRole('button', { name: /^Download \d+/ }).click()
    await page.getByText('Total power consumption').first().waitFor()
    await transferDone(page)
    const demoRow = page.locator('.p-datatable-tbody tr', { hasText: DEMO_FILE })
    await demoRow.getByRole('button', { name: 'Download' }).click()
    await settle(page, 1500)
    await demoRow.getByRole('button', { name: 'Open' }).click()

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
    await page.locator('.p-datatable-table-container').evaluate((el) => (el.scrollTop = 0))
    await shot('browser')

    await page.getByRole('button', { name: 'Dashboard' }).click()
    await page.locator('.consumer').nth(1).click()
    await page.locator('.heatmap').waitFor({ timeout: 60000 })
    await shot('dashboard')

    await page.evaluate(() => (location.hash = '#/settings'))
    await shot('settings')
  } finally {
    await app.close()
    rmSync(userData, { recursive: true, force: true })
  }
}

/** type into the value cell of the selected grid row */
async function editSelected(page: Page, value: string): Promise<void> {
  const cell = page.locator('.grid tr.selected-row .cell-input').last()
  const box = (await cell.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 20 })
  await cell.click()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.type(value, { delay: 120 })
  await page.keyboard.press('Enter')
}

/** Fake mouse pointer — Playwright videos don't show the real one */
const showPointer = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const dot = document.createElement('div')
    dot.style.cssText =
      'position:fixed;z-index:99999;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;' +
      'background:rgba(255,120,0,.55);border:2px solid #fff;box-shadow:0 0 4px #0006;' +
      'pointer-events:none;transition:transform .12s;left:-50px;top:-50px'
    document.body.append(dot)
    addEventListener(
      'mousemove',
      (e) => {
        dot.style.left = `${e.clientX}px`
        dot.style.top = `${e.clientY}px`
      },
      true
    )
    addEventListener('mousedown', () => (dot.style.transform = 'scale(.6)'), true)
    addEventListener('mouseup', () => (dot.style.transform = ''), true)
  })

/** ~25 s tour: browse with names → open → fix problems → upload → restart dialog → all months */
async function showcase(dark: boolean): Promise<void> {
  const theme = dark ? 'dark' : 'light'
  const userData = mkdtempSync(join(tmpdir(), 'ldm-video-'))
  const frameDir = mkdtempSync(join(tmpdir(), 'ldm-frames-'))
  const { app, page } = await launch(dark, userData)
  // Playwright's recordVideo hangs Electron pages → CDP screencast; frames only arrive on change
  const frames: { file: string; t: number }[] = []
  const cdp = await page.context().newCDPSession(page)
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    const file = join(frameDir, `${String(frames.length).padStart(5, '0')}.jpg`)
    writeFileSync(file, Buffer.from(data, 'base64'))
    frames.push({ file, t: metadata.timestamp ?? Date.now() / 1000 })
    void cdp.send('Page.screencastFrameAck', { sessionId })
  })
  try {
    await connect(page, 'Demo Home')
    await page.getByText('Total power consumption').first().waitFor()
    await showPointer(page)
    await page.mouse.move(640, 760)
    await cdp.send('Page.startScreencast', {
      format: 'jpeg',
      quality: 92,
      maxWidth: 1280,
      maxHeight: 800
    })
    // glide to a target before clicking, so viewers can follow
    const click = async (target: ReturnType<Page['locator']>, pause = 700): Promise<void> => {
      const box = (await target.boundingBox())!
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 20 })
      await settle(page, 250)
      await target.click()
      await settle(page, pause)
    }

    await settle(page, 2000)
    // Open downloads the file itself — no separate download step
    await click(
      page
        .locator('.p-datatable-tbody tr', { hasText: DEMO_FILE })
        .getByRole('button', { name: 'Open' }),
      1800
    )

    // the broken entry: problems panel → jump to the row → type a value
    await page.locator('canvas').first().waitFor()
    await click(page.locator('.problem', { hasText: 'NaN' }).first(), 900)
    await editSelected(page, '0.62')
    await settle(page, 900)
    await click(page.getByRole('button', { name: 'Fill gaps' }), 1500)

    // the spike is a problem too: jump there, type a plausible value
    await click(page.locator('.problem', { hasText: 'spike' }).first(), 900)
    await editSelected(page, '0.45')
    await settle(page, 1500)

    // upload: diff confirm, then the restart checklist (not clicked — nothing to restart here)
    await click(page.getByRole('button', { name: 'Upload to Miniserver' }), 2200)
    await click(
      page.locator('.p-dialog').getByRole('button', { name: 'Upload', exact: true }),
      2500
    )
    await page.getByRole('button', { name: 'Restart now' }).hover()
    await settle(page, 1500)
    await click(page.getByRole('button', { name: 'Got it' }), 600)

    // the whole half year of this control in one chart (missing months download on the fly)
    await click(page.getByRole('button', { name: 'All months' }), 300)
    await page
      .getByText('Downloading the missing months')
      .waitFor({ state: 'hidden', timeout: 30_000 })
    await page.mouse.move(640, 700, { steps: 20 })
    await settle(page, 3500)
  } finally {
    await cdp.send('Page.stopScreencast').catch(() => undefined)
    await app.close()
    rmSync(userData, { recursive: true, force: true })
    if (frames.length) {
      // ffconcat: each frame shown until the next one arrived
      const list = frames.map((f, i) => {
        const next = frames[i + 1]?.t ?? f.t + 1
        return `file '${f.file}'\nduration ${(next - f.t).toFixed(3)}`
      })
      const listFile = join(frameDir, 'list.txt')
      writeFileSync(listFile, `${list.join('\n')}\nfile '${frames.at(-1)!.file}'\n`)
      const gif = join(OUT, `showcase-${theme}.gif`)
      const filters =
        'fps=12,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];' +
        '[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle'
      execFileSync(
        'ffmpeg',
        ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0'] //
          .concat(['-i', listFile, '-vf', filters, gif])
      )
      console.log(`wrote ${gif}`)
    }
    rmSync(frameDir, { recursive: true, force: true })
  }
}

// A running real app holds the MCP port → "EADDRINUSE" would end up in the settings shot
await new Promise<void>((resolve, reject) => {
  const probe = createServer()
    .once('error', () => reject(new Error(`Port ${MCP_PORT} is busy — quit Lox DataManager first`)))
    .listen(MCP_PORT, '127.0.0.1', () => probe.close(() => resolve()))
})

const ftpRoot = mkdtempSync(join(tmpdir(), 'ldm-ftp-'))
mkdirSync(OUT, { recursive: true })
const servers = await startServers(ftpRoot)
try {
  if (process.argv.includes('--serve')) {
    // fake Miniserver + connected app with MCP on, for trying the MCP tools; quit the app to stop
    writeDemoFiles(join(ftpRoot, 'ftp', 'stats'))
    const userData = mkdtempSync(join(tmpdir(), 'ldm-shot-'))
    const { app, page } = await launch(false, userData)
    await connect(page)
    console.log(
      `MCP: http://127.0.0.1:${MCP_PORT}/mcp  Authorization: Bearer demo-token-not-a-real-secret`
    )
    await new Promise((resolve) => app.once('close', resolve))
    rmSync(userData, { recursive: true, force: true })
  }
  for (const dark of process.argv.includes('--serve') ? [] : [false, true]) {
    // fresh per run: the showcase uploads its fixed file to the fake Miniserver
    writeDemoFiles(join(ftpRoot, 'ftp', 'stats'))
    if (process.argv.includes('--showcase')) await showcase(dark)
    else await capture(dark)
  }
} finally {
  await servers.close()
  rmSync(ftpRoot, { recursive: true, force: true })
}
console.log(`written to ${OUT}`)
