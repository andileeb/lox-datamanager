import http from 'http'
import https from 'https'
import * as ftp from './ftp'
import { CodedError } from './stats-service'

// socket idle time, not total — a big structure file still loads; a silent web port only
// delays the header-name fallback by this much (per scheme tried)
const TIMEOUT_MS = 5000

class HttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`)
  }
}

function get(url: string, auth: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const onRes = (res: http.IncomingMessage): void => {
      if (res.statusCode !== 200) {
        res.resume()
        reject(new HttpError(res.statusCode ?? 0))
        return
      }
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      res.on('error', reject)
    }
    const opts = { headers: { Authorization: auth }, timeout: TIMEOUT_MS }
    const req = url.startsWith('https:')
      ? // Miniserver certs are self-signed / hostname-mismatched on the LAN, like FTPS
        https.get(url, { ...opts, rejectUnauthorized: false }, onRes)
      : http.get(url, opts, onRes)
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', reject)
  })
}

/**
 * GET on the connected Miniserver's web server, HTTP basic auth with the FTP credentials.
 * FTPS sessions only try https, so the password never goes out in the clear when the
 * user chose TLS.
 */
export async function webGet(path: string): Promise<string> {
  const { host, user, password, tls } = ftp.webTarget()
  const h = host.includes(':') ? `[${host}]` : host
  // ponytail: default web ports only; LDM_WEB_PORT is for the test harness — add a form field if users need one
  const port = process.env['LDM_WEB_PORT'] ? `:${process.env['LDM_WEB_PORT']}` : ''
  const auth = `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`
  let lastErr: unknown
  for (const scheme of tls ? ['https'] : ['http', 'https']) {
    try {
      return await get(`${scheme}://${h}${port}${path}`, auth)
    } catch (e) {
      lastErr = e
      // the server answered — the other scheme won't say anything different
      if (e instanceof HttpError) break
    }
  }
  throw lastErr
}

/**
 * Restarts the Miniserver (web service `dev/sys/reboot`, needs a user with admin rights).
 * The answer is `{"LL": {"Code": "200", …}}` (JSON or XML depending on firmware).
 */
export async function reboot(): Promise<void> {
  let body: string
  try {
    body = await webGet('/dev/sys/reboot')
  } catch (e) {
    if (e instanceof HttpError && (e.status === 401 || e.status === 403)) {
      throw new CodedError('NO_PERMISSION', `Restart refused (${e.message})`)
    }
    throw new CodedError('IO_ERROR', `Restart failed: ${(e as Error).message}`)
  }
  const code = /Code"?\s*[:=]\s*"?(\d+)/i.exec(body)?.[1]
  if (code === '401' || code === '403') {
    throw new CodedError('NO_PERMISSION', `Restart refused (code ${code})`)
  }
  if (code && code !== '200') throw new CodedError('IO_ERROR', `Restart failed (code ${code})`)
}
