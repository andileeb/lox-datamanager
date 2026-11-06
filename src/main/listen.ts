/**
 * Port fallback for our two servers — no Electron imports, so it unit-tests.
 */
import type { Server } from 'http'
import type { AddressInfo } from 'net'

function tryListen(s: Server, port: number, host: string | undefined): Promise<string | null> {
  return new Promise((resolve) => {
    const onError = (e: NodeJS.ErrnoException): void => {
      s.off('listening', onListening)
      resolve(e.code ?? e.message)
    }
    const onListening = (): void => {
      s.off('error', onError)
      resolve(null)
    }
    s.once('error', onError)
    s.once('listening', onListening)
    s.listen(port, host)
  })
}

/** `port`, else one of the next nine, else any free port the OS hands out — so a port taken by
 *  another program (or one this computer blocks) never stops us. `avoid`: the other server's port.
 *  Resolves the port listened on, or the last error code when even the OS pick failed. */
export async function listenFallback(
  s: Server,
  port: number,
  host?: string,
  avoid: number[] = []
): Promise<number | string> {
  const near = Array.from({ length: 10 }, (_, i) => port + i)
  let error = ''
  for (const p of [...near.filter((p) => p <= 65535 && !avoid.includes(p)), 0]) {
    const e = await tryListen(s, p, host)
    if (!e) return (s.address() as AddressInfo).port
    error = e
  }
  return error
}
