import { defineStore } from 'pinia'
import type { ApiError, StatFileData, StatRecord } from '../../../shared/types'
import {
  applyToRecords,
  dominantInterval,
  fillGaps as fillGapsPure,
  packRecords,
  unpackRecords
} from '../../../shared/records'
import { useFilesStore } from './files'

/** undo steps kept per file */
const HISTORY = 30

let validateTimer: ReturnType<typeof setTimeout> | null = null

/** Vue reactive proxies can't cross the contextBridge — send plain clones */
export function plain(records: StatRecord[]): StatRecord[] {
  return records.map((r) => ({ ts: r.ts, values: [...r.values] }))
}

export const useEditorStore = defineStore('editor', {
  state: () => ({
    data: null as StatFileData | null,
    loading: false,
    saving: false,
    dirty: false,
    error: null as ApiError | null,
    selectedIndex: null as number | null,
    /** bumped after in-place cell edits so the chart refreshes */
    chartVersion: 0,
    /** an MCP client saved this file behind the editor's back — offer a reload */
    externallyChanged: false,
    /** packed record snapshots (Float64Array isn't made reactive → cheap) */
    undoStack: [] as Float64Array[],
    redoStack: [] as Float64Array[]
  }),
  actions: {
    async load(name: string) {
      this.loading = true
      this.error = null
      this.data = null
      this.dirty = false
      this.selectedIndex = null
      this.externallyChanged = false
      this.undoStack = []
      this.redoStack = []
      const r = await window.api.stat.parse(name)
      this.loading = false
      if (r.ok) this.data = r.data
      else this.error = r.error
    },

    touch() {
      this.dirty = true
      this.chartVersion++
      if (validateTimer) clearTimeout(validateTimer)
      validateTimer = setTimeout(() => this.revalidate(), 400)
    },

    /** call before every mutation so it can be undone */
    snapshot() {
      if (!this.data) return
      this.undoStack.push(packRecords(this.data.records, this.data.valueCount))
      if (this.undoStack.length > HISTORY) this.undoStack.shift()
      this.redoStack = []
    },

    /** pop a snapshot from one stack, push the current state onto the other */
    restore(from: Float64Array[], to: Float64Array[]): boolean {
      const packed = from.pop()
      if (!this.data || !packed) return false
      to.push(packRecords(this.data.records, this.data.valueCount))
      this.data.records = unpackRecords(packed, this.data.valueCount)
      this.selectedIndex = null
      this.touch()
      return true
    },

    undo(): boolean {
      return this.restore(this.undoStack, this.redoStack)
    },

    redo(): boolean {
      return this.restore(this.redoStack, this.undoStack)
    },

    async revalidate() {
      if (!this.data) return
      const r = await window.api.stat.validate(this.data.fileName, plain(this.data.records))
      if (r.ok && this.data) this.data.problems = r.data
    },

    setValue(index: number, valueIdx: number, value: number) {
      if (!this.data) return
      this.snapshot()
      this.data.records[index].values[valueIdx] = value
      this.touch()
    },

    setTimestamp(index: number, ts: number) {
      if (!this.data) return
      this.snapshot()
      this.data.records[index].ts = ts
      this.touch()
    },

    /** dominant recording interval = most frequent timestamp delta */
    dominantInterval(): number {
      return dominantInterval(this.data?.records ?? [])
    },

    insertRow(index: number, where: 'above' | 'below') {
      if (!this.data) return
      this.snapshot()
      const records = this.data.records
      const at = where === 'above' ? index : index + 1
      const prev = records[at - 1]
      const next = records[at]
      const interval = this.dominantInterval()
      const ts =
        prev && next
          ? Math.round((prev.ts + next.ts) / 2)
          : prev
            ? prev.ts + interval
            : next
              ? next.ts - interval
              : 0
      const template = records[index] ?? { values: new Array(this.data.valueCount).fill(0) }
      records.splice(at, 0, { ts, values: [...template.values] })
      this.data.records = [...records]
      this.touch()
    },

    deleteRows(indices: number[]) {
      if (!this.data || !indices.length) return
      this.snapshot()
      const drop = new Set(indices)
      this.data.records = this.data.records.filter((_, i) => !drop.has(i))
      this.selectedIndex = null
      this.touch()
    },

    /** insert linearly interpolated rows into gaps > 1.5× the dominant interval */
    fillGaps(): number {
      if (!this.data) return 0
      const { records, inserted } = fillGapsPure(this.data.records)
      if (inserted) {
        this.snapshot()
        this.data.records = records
        this.touch()
      }
      return inserted
    },

    applyFormula(fn: (v: number) => number, valueIdx: number | 'all', indices: number[]) {
      if (!this.data) return
      this.snapshot()
      applyToRecords(this.data.records, this.data.valueCount, fn, valueIdx, indices)
      this.touch()
    },

    async save(): Promise<boolean> {
      if (!this.data) return false
      this.saving = true
      this.error = null
      const r = await window.api.stat.serialize(this.data.fileName, plain(this.data.records))
      this.saving = false
      if (!r.ok) {
        this.error = r.error
        return false
      }
      this.data.problems = r.data
      this.dirty = false
      useFilesStore().refreshCache()
      return true
    },

    /** saves if needed, then uploads the file to the Miniserver */
    async upload(): Promise<boolean> {
      if (!this.data) return false
      if (this.dirty && !(await this.save())) return false
      this.saving = true
      this.error = null
      const r = await window.api.ftp.upload([this.data.fileName])
      this.saving = false
      if (!r.ok) {
        this.error = r.error
        return false
      }
      useFilesStore().refresh()
      return true
    }
  }
})
