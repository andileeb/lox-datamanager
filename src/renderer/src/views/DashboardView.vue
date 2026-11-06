<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import Message from 'primevue/message'
import ProgressBar from 'primevue/progressbar'
import SelectButton from 'primevue/selectbutton'
import AppControls from '../components/AppControls.vue'
import type { ApiError, ControlProfile, EnergyOverview, EnergySeries } from '../../../shared/types'
import { useConnectionStore } from '../stores/connection'
import { useFilesStore } from '../stores/files'
import { errorText } from '../i18n'

/** insights without AI: top consumers, kWh per month, typical week + standby load (read-only) */
const router = useRouter()
const { t, locale } = useI18n()
const conn = useConnectionStore()
const files = useFilesStore()

const span = ref(3)
const spanOptions = computed(() =>
  [3, 6, 12].map((n) => ({ label: t('dashboard.months', { n }), value: n }))
)

const overview = ref<EnergyOverview | null>(null)
const selected = ref<EnergySeries | null>(null)
const profile = ref<ControlProfile | null>(null)
const loading = ref(false)
const profileLoading = ref(false)
const error = ref<ApiError | null>(null)

/** first month of the range, counted back from the newest month that has files (offline folders may be old) */
const from = computed(() => {
  const newest = files.rows.reduce((m, r) => (r.name.slice(-6) > m ? r.name.slice(-6) : m), '')
  if (!newest) return undefined
  const d = new Date(Number(newest.slice(0, 4)), Number(newest.slice(4)) - span.value, 1)
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
})

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  if (!files.rows.length) await files.refresh()
  const r = await window.api.insights.energy(from.value)
  loading.value = false
  if (!r.ok) {
    error.value = r.error
    return
  }
  overview.value = r.data
  const keep = r.data.series.find((s) => s.control === selected.value?.control)
  select(keep ?? r.data.series[0] ?? null)
}

let request = 0
async function select(s: EnergySeries | null): Promise<void> {
  selected.value = s
  profile.value = null
  if (!s) return
  const mine = ++request
  profileLoading.value = true
  const r = await window.api.insights.profile(s.control, from.value)
  if (mine !== request) return // a newer selection won
  profileLoading.value = false
  if (r.ok) profile.value = r.data
  else error.value = r.error
}

onMounted(load)
watch(span, load)

function num(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—'
  return v.toLocaleString(
    locale.value,
    Math.abs(v) >= 100 ? { maximumFractionDigits: 0 } : { maximumSignificantDigits: 3 }
  )
}

const maxTotal = computed(() =>
  Math.max(1e-9, ...(overview.value?.series.map((s) => s.totalKWh[0] ?? 0) ?? []))
)

const monthBars = computed(() => {
  const m = selected.value?.perMonth[0] ?? []
  const max = Math.max(1e-9, ...m.map((b) => b.kWh ?? 0))
  return m.map((b) => ({
    ...b,
    yyyymm: b.month.replace('-', ''),
    label: new Date(Number(b.month.slice(0, 4)), Number(b.month.slice(5)) - 1).toLocaleString(
      locale.value,
      { month: 'short', year: '2-digit' }
    ),
    pct: ((b.kWh ?? 0) / max) * 100
  }))
})

/** consumption per hour of a kWh reading is average power: kWh → kW */
const profileUnit = computed(() => {
  const u = profile.value?.unit ?? ''
  return profile.value?.counter && u.endsWith('h') ? u.slice(0, -1) : u
})
const unitSuffix = computed(() => (profileUnit.value ? ` ${profileUnit.value}` : ''))

/** standby load running all year, in kWh — only when the unit is power */
const baseYearKWh = computed(() => {
  const p = profile.value
  if (!p || !(p.profile.base > 0)) return null
  const f = { kW: 1, W: 0.001 }[profileUnit.value]
  return f === undefined ? null : p.profile.base * f * 8760
})

const days = computed(() =>
  // 2024-01-01 was a Monday
  Array.from({ length: 7 }, (_, d) =>
    new Date(Date.UTC(2024, 0, 1 + d)).toLocaleString(locale.value, {
      weekday: 'short',
      timeZone: 'UTC'
    })
  )
)
const heatMax = computed(() =>
  Math.max(1e-9, ...(profile.value?.profile.weekdayHour.flat().map((v) => v ?? 0) ?? []))
)
function cellStyle(v: number | null): Record<string, string> {
  if (v === null) return {}
  const pct = Math.round(Math.max(0, v / heatMax.value) * 100)
  return { background: `color-mix(in srgb, var(--p-primary-color) ${pct}%, transparent)` }
}
</script>

<template>
  <main class="view dashboard">
    <div class="toolbar">
      <div class="title">
        <Button
          v-tooltip.bottom="t('editor.back')"
          icon="pi pi-arrow-left"
          text
          severity="secondary"
          :aria-label="t('editor.back')"
          @click="router.push('/browser')"
        />
        <div>
          <h2>{{ t('dashboard.title') }}</h2>
          <span class="meta">{{ conn.activeLabel }}</span>
        </div>
        <AppControls />
      </div>
      <div class="actions">
        <Button
          v-tooltip.bottom="t('dashboard.askTip')"
          :label="t('dashboard.ask')"
          icon="pi pi-sparkles"
          severity="secondary"
          outlined
          @click="router.push('/settings?tab=ai')"
        />
        <SelectButton
          v-model="span"
          :options="spanOptions"
          option-label="label"
          option-value="value"
          :allow-empty="false"
          size="small"
          :disabled="loading"
        />
        <Button
          v-tooltip.bottom="t('browser.tipRefresh')"
          icon="pi pi-refresh"
          severity="secondary"
          :loading="loading"
          :aria-label="t('browser.tipRefresh')"
          @click="load"
        />
      </div>
    </div>

    <div v-if="loading" class="loading">
      <span class="meta">{{ t('dashboard.loading') }}</span>
      <ProgressBar mode="indeterminate" style="height: 4px" />
    </div>
    <Message v-if="error" severity="error" :closable="false">{{ errorText(error) }}</Message>
    <Message
      v-if="!loading && overview && !overview.series.length"
      severity="info"
      :closable="false"
    >
      {{ t('dashboard.empty') }}
      <template v-if="overview.skippedNoUnit.length">
        {{ t('dashboard.skipped', overview.skippedNoUnit.length) }}
      </template>
    </Message>

    <div v-if="overview?.series.length" class="grid">
      <section class="card">
        <h3>{{ t('dashboard.consumers') }}</h3>
        <p class="meta">{{ t('dashboard.consumersHint') }}</p>
        <button
          v-for="s in overview.series"
          :key="s.control"
          class="consumer"
          :class="{ active: s.control === selected?.control }"
          @click="select(s)"
        >
          <span class="name">
            {{ s.description || s.control }}
            <span v-if="s.room" class="meta"> · {{ s.room }}</span>
          </span>
          <span class="value">
            {{ num(s.totalKWh[0]) }} kWh
            <span v-if="s.totalKWh.length > 1" class="meta">
              · {{ t('dashboard.second', { v: num(s.totalKWh[1]) }) }}
            </span>
          </span>
          <span class="bar"
            ><span :style="{ width: `${((s.totalKWh[0] ?? 0) / maxTotal) * 100}%` }"
          /></span>
        </button>
      </section>

      <section v-if="selected" class="card detail">
        <div class="detail-head">
          <div>
            <h3>{{ selected.description || selected.control }}</h3>
            <span class="meta">
              <template v-if="selected.room">{{ selected.room }} · </template>
              {{
                selected.source === 'meter reading'
                  ? t('dashboard.fromMeter')
                  : t('dashboard.fromPower')
              }}
            </span>
          </div>
          <Button
            :label="t('months.button')"
            icon="pi pi-images"
            size="small"
            severity="secondary"
            @click="router.push(`/months/${selected.control}`)"
          />
        </div>

        <h4>{{ t('dashboard.perMonth') }}</h4>
        <div class="months">
          <button
            v-for="b in monthBars"
            :key="b.month"
            v-tooltip.top="t('dashboard.openMonth')"
            class="month"
            @click="router.push(`/editor/${selected.control}.${b.yyyymm}`)"
          >
            <span class="kwh">{{ num(b.kWh) }}</span>
            <span class="col"><span :style="{ height: `${b.pct}%` }" /></span>
            <span class="meta">{{ b.label }}</span>
          </button>
        </div>

        <h4>{{ t('dashboard.week') }}</h4>
        <ProgressBar v-if="profileLoading" mode="indeterminate" style="height: 4px" />
        <template v-if="profile">
          <div class="stats">
            <div>
              <span class="meta">{{ t('dashboard.base') }}</span>
              <strong>{{ num(profile.profile.base) }}{{ unitSuffix }}</strong>
              <span v-if="baseYearKWh !== null" class="meta">
                {{ t('dashboard.baseYear', { v: num(baseYearKWh) }) }}
              </span>
            </div>
            <div>
              <span class="meta">{{ t('dashboard.weekdays') }}</span>
              <strong>{{ num(profile.profile.weekdayAvg) }}{{ unitSuffix }}</strong>
            </div>
            <div>
              <span class="meta">{{ t('dashboard.weekend') }}</span>
              <strong>{{ num(profile.profile.weekendAvg) }}{{ unitSuffix }}</strong>
            </div>
          </div>
          <div class="heatmap" role="img" :aria-label="t('dashboard.week')">
            <span />
            <span v-for="h in 24" :key="h" class="hour">{{ (h - 1) % 3 ? '' : h - 1 }}</span>
            <template v-for="(row, d) in profile.profile.weekdayHour" :key="d">
              <span class="day">{{ days[d] }}</span>
              <span
                v-for="(v, h) in row"
                :key="h"
                class="cell"
                :style="cellStyle(v)"
                :title="`${days[d]} ${String(h).padStart(2, '0')}:00 · ${num(v)}${unitSuffix}`"
              />
            </template>
          </div>
          <p class="meta">{{ t('dashboard.weekHint') }}</p>
        </template>
      </section>
    </div>
  </main>
</template>

<style scoped>
.dashboard {
  overflow: auto;
}
.toolbar,
.title,
.actions,
.detail-head {
  display: flex;
  align-items: center;
  gap: 0.5rem 1rem;
  flex-wrap: wrap;
}
.toolbar,
.detail-head {
  justify-content: space-between;
}
.title {
  gap: 0.5rem;
}
.meta {
  color: var(--p-text-muted-color);
  font-size: 0.8rem;
}
h3,
h4 {
  margin: 0;
}
h4 {
  margin-top: 1rem;
  font-size: 0.9rem;
}
.loading {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.grid {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
  gap: 1rem;
  align-items: start;
}
@media (max-width: 1000px) {
  .grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
.card {
  border: 1px solid var(--p-content-border-color);
  border-radius: var(--p-border-radius-md, 6px);
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.consumer {
  all: unset;
  cursor: pointer;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.15rem 0.75rem;
  padding: 0.4rem 0.5rem;
  border-radius: 4px;
}
.consumer:hover,
.consumer:focus-visible {
  background: var(--p-content-hover-background);
}
.consumer.active {
  background: var(--p-highlight-background);
}
.consumer .name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.consumer .value {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.consumer .bar {
  grid-column: 1 / -1;
  height: 4px;
  background: var(--p-content-border-color);
  border-radius: 2px;
}
.consumer .bar span {
  display: block;
  height: 100%;
  background: var(--p-primary-color);
  border-radius: 2px;
}
.months {
  display: flex;
  gap: 0.25rem;
  height: 9rem;
}
.month {
  all: unset;
  cursor: pointer;
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
}
.month .col {
  flex: 1;
  width: min(100%, 3rem);
  display: flex;
  align-items: flex-end;
}
.month .col span {
  width: 100%;
  background: var(--p-primary-color);
  border-radius: 3px 3px 0 0;
  min-height: 1px;
}
.month:hover .col span,
.month:focus-visible .col span {
  opacity: 0.8;
}
.stats {
  display: flex;
  gap: 1.5rem;
  flex-wrap: wrap;
}
.stats div {
  display: flex;
  flex-direction: column;
}
.heatmap {
  display: grid;
  grid-template-columns: 2.5rem repeat(24, minmax(0, 1fr));
  gap: 2px;
  font-size: 0.7rem;
}
.heatmap .hour,
.heatmap .day {
  color: var(--p-text-muted-color);
}
.heatmap .cell {
  aspect-ratio: 1.4;
  border-radius: 2px;
  outline: 1px solid var(--p-content-border-color);
  outline-offset: -1px;
}
</style>
