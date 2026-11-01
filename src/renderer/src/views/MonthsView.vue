<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Message from 'primevue/message'
import ProgressBar from 'primevue/progressbar'
import Tag from 'primevue/tag'
import StatChart from '../components/StatChart.vue'
import { fileOffsets, locateIndex, orderMonths, summarizeRecords } from '../../../shared/records'
import { unitsFor } from '../../../shared/catalog'
import type { StatFileData } from '../../../shared/types'
import { useConnectionStore } from '../stores/connection'
import { SUFFIX_KEYS, useFilesStore } from '../stores/files'
import { errorText } from '../i18n'

/** read-only: every downloaded month of one control (uuid + optional _n suffix) in one chart */
const props = defineProps<{ base: string }>()
const router = useRouter()
const { t, locale } = useI18n()
const conn = useConnectionStore()
const files = useFilesStore()

const months = ref<StatFileData[]>([])
const loading = ref(true)
/** months on the Miniserver that couldn't be downloaded (not in the chart) */
const missing = ref(0)

const suffix = computed(() => {
  const m = /_([1-9])$/.exec(props.base)
  return m ? Number(m[1]) : null
})
const suffixText = computed(() => {
  if (suffix.value === null) return null
  const key = SUFFIX_KEYS[suffix.value]
  return key ? t(`suffix.${key}`) : t('suffix.output', { n: suffix.value })
})
const entry = computed(() => files.catalog[props.base.slice(0, 35)])
const unitList = computed(() => unitsFor(entry.value, suffix.value))
const units = computed(() => [...new Set(unitList.value.filter((u) => u))].join(' / '))
const title = computed(
  () =>
    entry.value?.name || months.value.find((m) => m.nameFromHeader)?.nameFromHeader || props.base
)

const ordered = computed(() => orderMonths(months.value))
const chartRecords = computed(() => ordered.value.kept.flatMap((m) => m.records))
const offsets = computed(() => fileOffsets(ordered.value.kept))
const valueCount = computed(() => ordered.value.kept[0]?.valueCount ?? 0)
const entries = computed(() => months.value.reduce((n, m) => n + m.records.length, 0))

interface MonthRow {
  name: string
  yyyymm: string
  entries: number
  valueCount: number
  inChart: boolean
  problems: number
  /** one "min – max · Ø avg" text per value */
  values: string[]
}

function num(v: number): string {
  return v.toLocaleString(locale.value, { maximumFractionDigits: 2 })
}

const rows = computed<MonthRow[]>(() =>
  [...months.value]
    .sort((a, b) => b.fileName.slice(-6).localeCompare(a.fileName.slice(-6)))
    .map((m) => {
      const s = summarizeRecords(m.records, m.valueCount)
      return {
        name: m.fileName,
        yyyymm: m.fileName.slice(-6),
        entries: m.records.length,
        valueCount: m.valueCount,
        inChart: ordered.value.kept.includes(m),
        problems: m.problems.length,
        values: s.columns.map((c, i) => {
          const unit = unitList.value[suffix.value === null ? i : 0]
          const u = unit ? ` ${unit}` : ''
          return m.records.length ? `${num(c.min)} – ${num(c.max)}${u} · Ø ${num(c.avg)}${u}` : '—'
        })
      }
    })
)

function formatMonthLong(yyyymm: string): string {
  return new Date(Number(yyyymm.slice(0, 4)), Number(yyyymm.slice(4)) - 1).toLocaleString(
    locale.value,
    { month: 'long', year: 'numeric' }
  )
}

/** over every listed month, also those left out of the chart */
const range = computed(() => {
  const r = rows.value
  if (!r.length) return ''
  const from = formatMonthLong(r[r.length - 1].yyyymm)
  const to = formatMonthLong(r[0].yyyymm)
  return from === to ? from : `${from} – ${to}`
})

function openMonth(name: string, row?: number): void {
  router.push({ path: `/editor/${name}`, query: row === undefined ? {} : { row: String(row) } })
}

/** chart click → that month's editor, scrolled to the clicked entry */
function onChartSelect(index: number): void {
  const { file, local } = locateIndex(offsets.value, index)
  const m = ordered.value.kept[file]
  if (m) openMonth(m.fileName, local)
}

const transferPercent = computed(() => {
  if (!files.transfer) return 0
  const { index, total, bytes, bytesTotal } = files.transfer
  return Math.round(((index + (bytesTotal > 0 ? bytes / bytesTotal : 0)) / total) * 100)
})

async function load(): Promise<void> {
  loading.value = true
  months.value = []
  missing.value = 0
  if (!files.rows.length) await files.refresh()
  const own = files.rows.filter((r) => r.name.slice(0, -7) === props.base)
  // downloading only reads the Miniserver; local edits (local-newer) are never overwritten
  const toFetch = own.filter((r) => r.status === 'only-remote')
  if (toFetch.length && !conn.offline && !files.transfer) await files.download(toFetch)
  const cached = new Set(files.cached.map((c) => c.name))
  const names = own.filter((r) => cached.has(r.name)).map((r) => r.name)
  missing.value = own.length - names.length
  // ponytail: all months held in memory at once — fine for years of 5-minute data
  const parsed = await Promise.all(names.map((n) => window.api.stat.parse(n)))
  months.value = parsed.flatMap((r) => (r.ok ? [r.data] : []))
  missing.value += parsed.filter((r) => !r.ok).length
  loading.value = false
}

let unsubscribe: (() => void) | null = null
onMounted(() => {
  unsubscribe = window.api.onTransferProgress((p) => {
    if (files.transfer) files.transfer = p
  })
  void load()
})
onBeforeUnmount(() => unsubscribe?.())
watch(
  () => props.base,
  () => load()
)
</script>

<template>
  <main class="view">
    <div class="toolbar">
      <div class="title">
        <Button
          v-tooltip.bottom="t('editor.back')"
          icon="pi pi-arrow-left"
          text
          severity="secondary"
          aria-label="Back"
          @click="router.push('/browser')"
        />
        <div>
          <h2>
            {{ title }}
            <Tag v-if="suffixText" :value="suffixText" severity="secondary" />
          </h2>
          <span class="meta"
            ><span class="mono">{{ base }}</span
            ><template v-if="entry?.room"> · {{ entry.room }}</template
            ><template v-if="units"> · {{ units }}</template></span
          >
        </div>
      </div>
      <span v-if="months.length" class="meta">
        {{ range }} ·
        {{
          t(
            'months.meta',
            { n: months.length, entries: entries.toLocaleString(locale) },
            months.length
          )
        }}
      </span>
    </div>

    <div v-if="files.transfer" class="transfer">
      <span>{{ t('months.downloading') }}</span>
      <ProgressBar :value="transferPercent" style="flex: 1" />
    </div>
    <Message v-if="files.error" severity="error" :closable="false">
      {{ errorText(files.error) }}
    </Message>
    <Message v-if="!loading && missing" severity="warn" :closable="false">
      {{ conn.offline ? t('months.notDownloaded', missing) : t('months.failed', missing) }}
    </Message>
    <Message v-if="ordered.skipped.length" severity="info" :closable="false">
      {{ t('months.skipped', ordered.skipped.length) }}
    </Message>

    <template v-if="chartRecords.length">
      <StatChart :records="chartRecords" :value-count="valueCount" @select="onChartSelect" />
      <p class="hint">{{ t('months.hint') }}</p>
    </template>

    <DataTable
      :value="rows"
      :loading="loading"
      data-key="name"
      scrollable
      scroll-height="flex"
      class="table"
      row-hover
      @row-click="openMonth($event.data.name)"
    >
      <Column :header="t('browser.colMonth')" body-class="nowrap">
        <template #body="{ data }">
          {{ formatMonthLong(data.yyyymm) }}
          <Tag
            v-if="!data.inChart"
            v-tooltip.right="t('months.notInChartTip')"
            :value="t('months.notInChart')"
            severity="secondary"
            class="small-tag"
          />
        </template>
      </Column>
      <Column :header="t('months.colEntries')" body-class="nowrap">
        <template #body="{ data }">{{ data.entries.toLocaleString(locale) }}</template>
      </Column>
      <Column v-for="v in valueCount || 1" :key="v" :header="t('months.colValue', { n: v })">
        <template #body="{ data }">
          <span class="mono">{{ data.values[v - 1] ?? '' }}</span>
        </template>
      </Column>
      <Column :header="t('editor.problems')" body-class="nowrap">
        <template #body="{ data }">
          <Tag v-if="data.problems" severity="warn" :value="String(data.problems)" />
        </template>
      </Column>
      <Column header-style="width: 3.5rem" frozen align-frozen="right">
        <template #body="{ data }">
          <Button
            v-tooltip.left="t('browser.tipOpen')"
            icon="pi pi-chart-line"
            text
            aria-label="Open"
            @click.stop="openMonth(data.name)"
          />
        </template>
      </Column>
      <template #empty>
        <span v-if="!loading">{{ t('months.empty') }}</span>
      </template>
    </DataTable>
  </main>
</template>

<style scoped>
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}
.title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.meta,
.hint {
  color: var(--p-text-muted-color);
  font-size: 0.8rem;
}
.hint {
  margin: -0.5rem 0 0;
}
.transfer {
  display: flex;
  align-items: center;
  gap: 1rem;
}
.table {
  flex: 1;
  min-height: 0;
}
.table :deep(tbody tr) {
  cursor: pointer;
}
:deep(.nowrap) {
  white-space: nowrap;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.85rem;
}
.small-tag {
  font-size: 0.7rem;
  margin-left: 0.5rem;
}
</style>
