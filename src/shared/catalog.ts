import type { Catalog } from './types'

interface Control {
  name?: string
  type?: string
  uuidAction?: string
  room?: string
  cat?: string
  subControls?: Record<string, Control>
  statistic?: { outputs?: { format?: string }[] }
}

interface Structure {
  rooms?: Record<string, { name?: string }>
  cats?: Record<string, { name?: string }>
  controls?: Record<string, Control>
}

/** "%.1fkWh" → "kWh", "%.0f%%" → "%"; null when the format has no unit */
export function unitOf(format: string | undefined): string | null {
  if (!format) return null
  const u = format
    .replace(/%[-+ #0]*\d*(?:\.\d+)?[a-zA-Z]/g, '')
    .replace(/%%/g, '%')
    .trim()
  return u || null
}

/** uuid → name/room/category/unit out of LoxAPP3.json; unknown fields are tolerated */
export function parseStructure(raw: unknown): Catalog {
  const doc = (raw ?? {}) as Structure
  const out: Catalog = {}
  const add = (uuid: string, c: Control, parent: Control | null): void => {
    if (!c?.name) return
    const room = c.room ?? parent?.room
    const cat = c.cat ?? parent?.cat
    const entry = {
      name: parent?.name ? `${parent.name} · ${c.name}` : c.name,
      room: (room && doc.rooms?.[room]?.name) || null,
      category: (cat && doc.cats?.[cat]?.name) || null,
      type: c.type ?? null,
      units: c.statistic?.outputs?.map((o) => unitOf(o.format)) ?? []
    }
    for (const id of [uuid, c.uuidAction]) if (id) out[id.toLowerCase()] ??= entry
    for (const [id, sub] of Object.entries(c.subControls ?? {})) add(id, sub, { ...c, room, cat })
  }
  for (const [uuid, c] of Object.entries(doc.controls ?? {})) add(uuid, c, null)
  return out
}
