<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import type { StatRecord } from '../../../shared/types'
import { loxToUnixSec } from '../../../shared/time'
import { isDark } from '../theme'

const { t, locale } = useI18n()

const props = defineProps<{
  records: StatRecord[]
  valueCount: number
  /** bump to force a data refresh after in-place edits */
  version?: number
}>()
const emit = defineEmits<{ select: [index: number] }>()

// categorical palette (validated light/dark pairs, fixed slot order)
const LIGHT = [
  '#2a78d6',
  '#eb6834',
  '#1baf7a',
  '#eda100',
  '#e87ba4',
  '#008300',
  '#4a3aa7',
  '#e34948'
]
const DARK = [
  '#3987e5',
  '#d95926',
  '#199e70',
  '#c98500',
  '#d55181',
  '#008300',
  '#9085e9',
  '#e66767'
]

const wrap = ref<HTMLDivElement>()
const zoomed = ref(false)
let plot: uPlot | null = null

function resetZoom(): void {
  if (!plot) return
  const xs = plot.data[0]
  if (!xs?.length) return
  plot.setScale('x', { min: xs[0], max: xs[xs.length - 1] })
}

function seriesColor(i: number): string {
  const pal = isDark.value ? DARK : LIGHT
  // ponytail: stats with >8 outputs fold into gray — real files have 1-3
  return pal[i] ?? '#888888'
}

function cssVar(name: string, fallback: string): string {
  return getComputedStyle(document.body).getPropertyValue(name).trim() || fallback
}

function buildData(): uPlot.AlignedData {
  const xs = props.records.map((r) => loxToUnixSec(r.ts))
  const series: number[][] = []
  for (let v = 0; v < props.valueCount; v++) series.push(props.records.map((r) => r.values[v]))
  return [xs, ...series] as uPlot.AlignedData
}

/** size the y-axis to its widest tick label so huge values never get cut off */
function autoAxisSize(
  u: uPlot,
  values: string[] | null,
  axisIdx: number,
  cycleNum: number
): number {
  const axis = u.axes[axisIdx] as uPlot.Axis & { _size?: number }
  if (cycleNum > 1) return axis._size ?? 60
  let size = ((axis.ticks?.size as number) ?? 10) + ((axis.gap as number) ?? 5)
  const longest = (values ?? []).reduce((a, b) => (a.length > b.length ? a : b), '')
  if (longest) {
    u.ctx.font = (axis.font as unknown as string[])[0]
    size += u.ctx.measureText(longest).width / devicePixelRatio
  }
  return Math.ceil(Math.max(size, 40))
}

/** 320px on normal windows, shrinks on short ones so the entry grid stays usable */
const chartHeight = (): number => Math.round(Math.min(320, Math.max(160, innerHeight * 0.32)))

function makePlot(): void {
  if (!wrap.value) return
  plot?.destroy()
  const axisColor = cssVar('--p-text-muted-color', '#999')
  const gridColor = cssVar('--p-content-border-color', '#8883')
  const opts: uPlot.Options = {
    width: wrap.value.clientWidth,
    height: chartHeight(),
    tzDate: (ts) => uPlot.tzDate(new Date(ts * 1000), 'Etc/UTC'),
    series: [
      {},
      ...Array.from({ length: props.valueCount }, (_, i) => ({
        label: t('chart.value', { n: i + 1 }),
        stroke: seriesColor(i),
        width: 2,
        points: { show: false }
      }))
    ],
    axes: [
      { stroke: axisColor, grid: { stroke: gridColor, width: 1 }, ticks: { stroke: gridColor } },
      {
        stroke: axisColor,
        grid: { stroke: gridColor, width: 1 },
        ticks: { stroke: gridColor },
        size: autoAxisSize
      }
    ],
    cursor: { drag: { x: true, y: false } },
    legend: { live: true },
    hooks: {
      setScale: [
        (u, key): void => {
          if (key !== 'x') return
          const xs = u.data[0]
          if (!xs?.length) return
          const s = u.scales.x
          zoomed.value = (s.min ?? xs[0]) > xs[0] || (s.max ?? 0) < xs[xs.length - 1]
        }
      ]
    }
  }
  plot = new uPlot(opts, buildData(), wrap.value)
  wrap.value.querySelector('.u-over')?.addEventListener('click', () => {
    const idx = plot?.cursor.idx
    if (idx != null) emit('select', idx)
  })
}

const resizeObserver = new ResizeObserver(() => {
  if (plot && wrap.value) plot.setSize({ width: wrap.value.clientWidth, height: chartHeight() })
})

onMounted(() => {
  makePlot()
  if (wrap.value) resizeObserver.observe(wrap.value)
  resizeObserver.observe(document.documentElement) // window height changes too
})
onBeforeUnmount(() => {
  resizeObserver.disconnect()
  plot?.destroy()
})

watch(
  () => [props.records, props.valueCount, props.version],
  () => {
    if (!plot || plot.series.length - 1 !== props.valueCount) makePlot()
    else plot.setData(buildData())
  }
)

// theme or language changed → colors and series labels must be rebuilt
watch([isDark, locale], () => makePlot())
</script>

<template>
  <div class="chart-wrap">
    <div ref="wrap" class="chart"></div>
    <Button
      v-if="zoomed"
      v-tooltip.left="t('chart.resetZoomTip')"
      class="reset-zoom"
      icon="pi pi-search-minus"
      :label="t('chart.resetZoom')"
      size="small"
      severity="secondary"
      @click="resetZoom"
    />
  </div>
</template>

<style scoped>
.chart-wrap {
  position: relative;
}
.reset-zoom {
  position: absolute;
  top: 0.25rem;
  right: 0.5rem;
  z-index: 5;
}
.chart {
  width: 100%;
}
.chart :deep(.u-legend) {
  font-size: 0.8rem;
  color: var(--p-text-muted-color);
}
</style>
