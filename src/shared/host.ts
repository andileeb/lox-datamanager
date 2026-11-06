/**
 * Miniserver address as typed or pasted → the bare host FTP needs.
 * "http://192.168.1.5:8080/" → "192.168.1.5" (a pasted port is the web port; FTP keeps the form's).
 * Loxone Cloud DNS addresses stay as they are — the serial in the path is the address (ftp.ts).
 */
export function cleanHost(raw: string): string {
  const s = raw.trim()
  if (/dns\.loxonecloud\.com\//i.test(s)) return s
  const scheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(s)
  if (!scheme && (s.match(/:/g)?.length ?? 0) > 1) return s.replace(/^\[|\]$/g, '') // bare IPv6
  const m = /^(?:[a-z][a-z0-9+.-]*:\/\/)?(?:[^@/]*@)?(?:\[([^\]]+)\]|([^/:?#]+))/i.exec(s)
  return m?.[1] ?? m?.[2] ?? s
}
