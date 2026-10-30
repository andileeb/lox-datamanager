import type { Catalog, CatalogEntry } from './types'

interface Control {
  name?: string
  type?: string
  uuidAction?: string
  room?: string
  cat?: string
  subControls?: Record<string, Control>
  /** classic statistics; newer firmware has statisticV2 (no formats) and keeps them in details */
  statistic?: { outputs?: { format?: string }[] }
  details?: {
    format?: string
    actualFormat?: string
    totalFormat?: string
    storageFormat?: string
  }
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
      units: c.statistic?.outputs?.map((o) => unitOf(o.format)) ?? [unitOf(c.details?.format)],
      // measured on a real Miniserver: Meter _1 = power, _2 = meter reading(s), _3 = storage.
      // EFM suffix files don't follow that pattern, so they get no units.
      ...(c.type === 'Meter' && {
        suffixUnits: {
          1: unitOf(c.details?.actualFormat),
          2: unitOf(c.details?.totalFormat),
          3: unitOf(c.details?.storageFormat)
        }
      })
    }
    for (const id of [uuid, c.uuidAction]) if (id) out[id.toLowerCase()] ??= entry
    for (const [id, sub] of Object.entries(c.subControls ?? {})) add(id, sub, { ...c, room, cat })
  }
  for (const [uuid, c] of Object.entries(doc.controls ?? {})) add(uuid, c, null)
  return out
}

/** units of one file's values: by suffix for Meter files, else per statistic output */
export function unitsFor(
  entry: CatalogEntry | undefined,
  suffix: number | null
): (string | null)[] {
  if (!entry) return []
  if (suffix === null) return entry.units
  return [entry.suffixUnits?.[suffix] ?? null]
}
