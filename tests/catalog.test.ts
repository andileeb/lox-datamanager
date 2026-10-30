import { describe, expect, it } from 'vitest'
import { parseStructure, unitOf, unitsFor } from '../src/shared/catalog'

describe('unitOf', () => {
  it('strips the printf spec', () => {
    expect(unitOf('%.1fkWh')).toBe('kWh')
    expect(unitOf('%.2f °C')).toBe('°C')
    expect(unitOf('%.0f%%')).toBe('%')
    expect(unitOf('%.3f')).toBeNull()
    expect(unitOf(undefined)).toBeNull()
  })
})

describe('parseStructure', () => {
  const doc = {
    rooms: { r1: { name: 'Kitchen' } },
    cats: { c1: { name: 'Energy' } },
    controls: {
      '0b734138-037d-034e-FFFF403FB0C34B9E': {
        name: 'Power meter',
        type: 'Meter',
        room: 'r1',
        cat: 'c1',
        statistic: { outputs: [{ format: '%.3fkW' }, { format: '%.1fkWh' }] },
        subControls: {
          '0b734138-037d-034e-ffff403fb0c34b9f': { name: 'Total', type: 'InfoOnlyAnalog' }
        }
      },
      '10000000-0000-0000-ffff000000000000': { name: 'No room' },
      bad: { type: 'nameless' }
    }
  }

  it('maps uuids to name, room, category, units', () => {
    const cat = parseStructure(doc)
    expect(cat['0b734138-037d-034e-ffff403fb0c34b9e']).toEqual({
      name: 'Power meter',
      room: 'Kitchen',
      category: 'Energy',
      type: 'Meter',
      units: ['kW', 'kWh'],
      suffixUnits: { 1: null, 2: null, 3: null }
    })
    // subcontrols inherit room/category and carry the parent's name
    expect(cat['0b734138-037d-034e-ffff403fb0c34b9f']).toMatchObject({
      name: 'Power meter · Total',
      room: 'Kitchen',
      category: 'Energy'
    })
    expect(cat['10000000-0000-0000-ffff000000000000'].room).toBeNull()
    expect(cat['bad']).toBeUndefined()
  })

  it('tolerates garbage', () => {
    expect(parseStructure(null)).toEqual({})
    expect(parseStructure({ controls: 5 })).toEqual({})
  })

  it('reads Meter units by file suffix (statisticV2 firmware keeps formats in details)', () => {
    const cat = parseStructure({
      controls: {
        'aaaaaaaa-0000-0000-ffff000000000001': {
          name: 'Grid',
          type: 'Meter',
          statisticV2: {},
          details: { actualFormat: '%.3fkW', totalFormat: '%.1fkWh', storageFormat: '%.0f%%' }
        },
        'aaaaaaaa-0000-0000-ffff000000000002': {
          name: 'Price',
          type: 'SpotPriceOptimizer',
          details: { format: '%.3f€/kWh' }
        },
        'aaaaaaaa-0000-0000-ffff000000000003': {
          name: 'Energy manager',
          type: 'EFM',
          details: { actualFormat: '%.3fkW', totalFormat: '%.1fkWh' }
        }
      }
    })
    const meter = cat['aaaaaaaa-0000-0000-ffff000000000001']
    expect(unitsFor(meter, 1)).toEqual(['kW'])
    expect(unitsFor(meter, 2)).toEqual(['kWh'])
    expect(unitsFor(meter, 3)).toEqual(['%'])
    expect(unitsFor(cat['aaaaaaaa-0000-0000-ffff000000000002'], 1)).toEqual([null])
    expect(cat['aaaaaaaa-0000-0000-ffff000000000002'].units).toEqual(['€/kWh'])
    // EFM suffix files are not power/reading/storage like Meter ones — no guessed units
    expect(unitsFor(cat['aaaaaaaa-0000-0000-ffff000000000003'], 1)).toEqual([null])
    expect(unitsFor(undefined, null)).toEqual([])
  })
})
