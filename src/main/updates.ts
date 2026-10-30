// Update *notification* only — no auto-install. macOS auto-update needs a Developer ID
// signature (Squirrel.Mac rejects unsigned updates), so electron-updater would only ever
// work on Windows here. See CLAUDE.md.
// No Electron imports: the current version comes in as an argument so this stays
// unit-testable, like statfile.ts.
import type { UpdateCheck } from '../shared/types'

const REPO = 'andileeb/lox-datamanager'
const API = `https://api.github.com/repos/${REPO}/releases/latest`
const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`

/** numeric segment compare — no semver dep; "0.1.10" > "0.1.9", which strings get wrong */
export function isNewer(a: string, b: string): boolean {
  const parse = (v: string): number[] =>
    v.split(/[.-]/).map((s) => {
      const n = Number(s)
      return Number.isFinite(n) ? n : 0
    })
  const x = parse(a)
  const y = parse(b)
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const l = x[i] ?? 0
    const r = y[i] ?? 0
    if (l !== r) return l > r
  }
  return false
}

/**
 * Asks GitHub for the newest published release. Never throws — offline, rate-limited or
 * "no release published yet" (404, since /releases/latest skips drafts) all resolve with
 * latest: null so a failed check can't surface as an app error.
 */
export async function check(currentVersion: string): Promise<UpdateCheck> {
  const miss: UpdateCheck = {
    current: currentVersion,
    latest: null,
    url: RELEASES_PAGE,
    updateAvailable: false
  }
  try {
    const res = await fetch(API, {
      // GitHub 403s requests without a User-Agent, and rate-limits to 60/h per IP —
      // one check per launch stays well inside that, a 403 just reads as "unknown"
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'lox-datamanager' },
      signal: AbortSignal.timeout(5000)
    })
    if (!res.ok) return miss
    const body = (await res.json()) as { tag_name?: string; html_url?: string }
    if (!body.tag_name) return miss
    const latest = body.tag_name.replace(/^v/, '')
    return {
      current: currentVersion,
      latest,
      url: body.html_url ?? RELEASES_PAGE,
      updateAvailable: isNewer(latest, currentVersion)
    }
  } catch {
    return miss
  }
}
