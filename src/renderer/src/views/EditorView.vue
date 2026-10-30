<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Tag from 'primevue/tag'
import StatChart from '../components/StatChart.vue'
import ProblemsPanel from '../components/ProblemsPanel.vue'
import FormulaDialog from '../components/FormulaDialog.vue'
import { displayToLox } from '../../../shared/time'
import { LOXONE_EPOCH_OFFSET } from '../../../shared/types'
import { isCurrentMonth as isCurrentMonthName } from '../../../shared/records'
import { useEditorStore } from '../stores/editor'
import { useConnectionStore } from '../stores/connection'
import { SUFFIX_KEYS } from '../stores/files'
import { errorText } from '../i18n'
import { loxToDisplayPref } from '../prefs'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ filename: string }>()
const router = useRouter()
const editor = useEditorStore()
const conn = useConnectionStore()
const { t } = useI18n()

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dt = ref<any>(null)
const csvPath = ref<string | null>(null)
const selection = ref<{ index: number }[]>([])
const showFormula = ref(false)
const showUploadConfirm = ref(false)
const showPostUpload = ref(false)
const fillResult = ref<number | null>(null)

interface Row {
  index: number
  ts: number
  values: number[]
}
const rows = computed<Row[]>(
  () => editor.data?.records.map((r, index) => ({ index, ts: r.ts, values: r.values })) ?? []
)

const problemRows = computed(() => {
  const set = new Set<number>()
  for (const p of editor.data?.problems ?? []) if (p.row !== null) set.add(p.row)
  return set
})
const errorCount = computed(
  () => editor.data?.problems.filter((p) => p.severity === 'error').length ?? 0
)
const warnCount = computed(
  () => editor.data?.problems.filter((p) => p.severity === 'warning').length ?? 0
)

const suffixText = computed(() => {
  const m = /_([1-9])\.\d{6}$/.exec(props.filename)
  if (!m) return null
  const key = SUFFIX_KEYS[Number(m[1])]
  return key ? t(`suffix.${key}`) : t('suffix.output', { n: Number(m[1]) })
})

const isCurrentMonth = computed(() => isCurrentMonthName(props.filename))

const selectedIndices = computed(() => selection.value.map((s) => s.index).sort((a, b) => a - b))

function gotoRow(index: number): void {
  editor.selectedIndex = index
  dt.value?.$refs?.virtualScroller?.scrollToIndex?.(index)
}

function rowClass(row: Row): string {
  const classes: string[] = []
  if (problemRows.value.has(row.index)) classes.push('problem-row')
  if (editor.selectedIndex === row.index) classes.push('selected-row')
  return classes.join(' ')
}

function commitValue(row: Row, valueIdx: number, event: Event): void {
  const input = event.target as HTMLInputElement
  const num = Number(input.value.replace(',', '.'))
  if (Number.isFinite(num)) {
    editor.setValue(row.index, valueIdx, num)
  } else {
    input.value = String(row.values[valueIdx])
  }
}

function commitTimestamp(row: Row, event: Event): void {
  const input = event.target as HTMLInputElement
  const ts = displayToLox(input.value)
  if (ts !== null && ts >= 0) {
    editor.setTimestamp(row.index, ts)
  } else {
    input.value = loxToDisplayPref(row.ts, LOXONE_EPOCH_OFFSET)
  }
}

function insertRow(where: 'above' | 'below'): void {
  const base = selectedIndices.value[0] ?? editor.selectedIndex
  if (base === null || base === undefined) return
  editor.insertRow(base, where)
  selection.value = []
}

function deleteSelected(): void {
  editor.deleteRows(selectedIndices.value)
  selection.value = []
}

function fillGaps(): void {
  fillResult.value = editor.fillGaps()
}

function applyFormula(
  fn: (v: number) => number,
  valueIdx: number | 'all',
  scope: 'selected' | 'downwards' | 'all'
): void {
  if (!editor.data) return
  let indices: number[]
  if (scope === 'all') {
    indices = [...editor.data.records.keys()]
  } else if (scope === 'downwards') {
    const first = selectedIndices.value[0] ?? 0
    indices = []
    for (let i = first; i < editor.data.records.length; i++) indices.push(i)
  } else {
    indices = selectedIndices.value
  }
  editor.applyFormula(fn, valueIdx, indices)
}

async function upload(): Promise<void> {
  showUploadConfirm.value = false
  if (await editor.upload()) showPostUpload.value = true
}

async function exportCsv(): Promise<void> {
  if (editor.dirty) await editor.save()
  if (!editor.data) return
  const r = await window.api.stat.exportCsv(editor.data.fileName)
  if (r.ok) csvPath.value = r.data
}

onMounted(() => editor.load(props.filename))
watch(
  () => props.filename,
  (name) => editor.load(name)
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
            {{ editor.data?.nameFromHeader || filename }}
            <Tag v-if="suffixText" :value="suffixText" severity="secondary" />
          </h2>
          <span class="meta mono">{{ filename }}</span>
        </div>
      </div>
      <div class="actions">
        <Tag v-if="errorCount" severity="danger" :value="t('editor.errors', errorCount)" />
        <Tag v-if="warnCount" severity="warn" :value="t('editor.warnings', warnCount)" />
        <span v-if="editor.data" class="meta">
          {{
            t('editor.meta', {
              entries: editor.data.records.length.toLocaleString(),
              values: editor.data.valueCount
            })
          }}
        </span>
        <Button
          :label="t('editor.exportCsv')"
          icon="pi pi-file-export"
          severity="secondary"
          text
          :disabled="!editor.data"
          @click="exportCsv"
        />
        <Button
          :label="t('editor.save')"
          icon="pi pi-save"
          severity="secondary"
          :disabled="!editor.dirty"
          :loading="editor.saving"
          @click="editor.save()"
        />
        <Button
          v-if="!conn.offline"
          :label="t('editor.upload')"
          icon="pi pi-cloud-upload"
          :disabled="!editor.data"
          :loading="editor.saving"
          @click="showUploadConfirm = true"
        />
      </div>
    </div>

    <Message v-if="isCurrentMonth" severity="warn" :closable="false">
      <!-- eslint-disable-next-line vue/no-v-html -->
      <span v-html="t('editor.currentMonthWarning')"></span>
    </Message>
    <Message
      v-if="editor.externallyChanged"
      severity="warn"
      closable
      @close="editor.externallyChanged = false"
    >
      {{ t('editor.mcpChanged') }}
      <Button
        :label="t('editor.mcpReload')"
        size="small"
        text
        @click="editor.load(props.filename)"
      />
    </Message>
    <Message v-if="editor.error" severity="error" :closable="false">
      {{ errorText(editor.error) }}
    </Message>
    <Message v-if="csvPath" severity="success" closable @close="csvPath = null">
      {{ t('editor.exportedTo', { path: csvPath }) }}
    </Message>
    <Message v-if="fillResult !== null" severity="info" closable @close="fillResult = null">
      {{ fillResult ? t('editor.gapsFilled', fillResult) : t('editor.noGaps') }}
    </Message>

    <template v-if="editor.data">
      <StatChart
        :records="editor.data.records"
        :value-count="editor.data.valueCount"
        :version="editor.chartVersion"
        @select="gotoRow"
      />

      <div class="edit-bar">
        <Button
          :label="t('editor.insertAbove')"
          icon="pi pi-arrow-up"
          size="small"
          severity="secondary"
          :disabled="!selection.length"
          @click="insertRow('above')"
        />
        <Button
          :label="t('editor.insertBelow')"
          icon="pi pi-arrow-down"
          size="small"
          severity="secondary"
          :disabled="!selection.length"
          @click="insertRow('below')"
        />
        <Button
          :label="
            selection.length ? t('editor.deleteN', { n: selection.length }) : t('editor.delete')
          "
          icon="pi pi-trash"
          size="small"
          severity="danger"
          outlined
          :disabled="!selection.length"
          @click="deleteSelected"
        />
        <span class="spacer" />
        <Button
          :label="t('editor.fillGaps')"
          icon="pi pi-arrows-h"
          size="small"
          severity="secondary"
          @click="fillGaps"
        />
        <Button
          :label="t('editor.calculate')"
          icon="pi pi-calculator"
          size="small"
          severity="secondary"
          @click="showFormula = true"
        />
      </div>

      <div class="lower">
        <DataTable
          ref="dt"
          v-model:selection="selection"
          :value="rows"
          :loading="editor.loading"
          data-key="index"
          scrollable
          scroll-height="flex"
          :virtual-scroller-options="{ itemSize: 40 }"
          :row-class="rowClass"
          class="grid"
        >
          <Column selection-mode="multiple" header-style="width: 2.5rem" />
          <Column field="index" header="#" style="width: 5rem">
            <template #body="{ data }">
              <span class="mono muted">{{ data.index + 1 }}</span>
            </template>
          </Column>
          <Column field="ts" :header="t('editor.timestamp')" style="width: 15rem">
            <template #body="{ data }">
              <InputText
                :model-value="loxToDisplayPref(data.ts, LOXONE_EPOCH_OFFSET)"
                class="cell-input mono"
                @change="commitTimestamp(data, $event)"
                @keyup.enter="($event.target as HTMLInputElement).blur()"
              />
            </template>
          </Column>
          <Column
            v-for="v in editor.data.valueCount"
            :key="v"
            :header="t('editor.value', { n: v })"
          >
            <template #body="{ data }">
              <InputText
                :model-value="String(data.values[v - 1])"
                class="cell-input mono"
                @change="commitValue(data, v - 1, $event)"
                @keyup.enter="($event.target as HTMLInputElement).blur()"
              />
            </template>
          </Column>
        </DataTable>

        <aside class="side">
          <h3>{{ t('editor.problems') }}</h3>
          <ProblemsPanel :problems="editor.data.problems" @goto="gotoRow" />
        </aside>
      </div>

      <FormulaDialog
        v-model:visible="showFormula"
        :value-count="editor.data.valueCount"
        :has-selection="!!selection.length"
        @apply="applyFormula"
      />

      <Dialog
        v-model:visible="showUploadConfirm"
        :header="t('editor.uploadConfirmTitle')"
        modal
        :style="{ width: '28rem' }"
      >
        <p>{{ t('editor.uploadConfirmBody', { file: filename }) }}</p>
        <template #footer>
          <Button
            :label="t('formula.cancel')"
            severity="secondary"
            text
            @click="showUploadConfirm = false"
          />
          <Button :label="t('editor.uploadConfirm')" icon="pi pi-cloud-upload" @click="upload" />
        </template>
      </Dialog>

      <Dialog
        v-model:visible="showPostUpload"
        :header="t('editor.postUploadTitle')"
        modal
        :style="{ width: '28rem' }"
      >
        <p>{{ t('editor.postUploadIntro') }}</p>
        <ol class="checklist">
          <!-- eslint-disable-next-line vue/no-v-html -->
          <li v-html="t('editor.postUploadStep1')"></li>
          <!-- eslint-disable-next-line vue/no-v-html -->
          <li v-html="t('editor.postUploadStep2')"></li>
        </ol>
        <template #footer>
          <Button :label="t('editor.gotIt')" @click="showPostUpload = false" />
        </template>
      </Dialog>
    </template>
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
.meta {
  color: var(--p-text-muted-color);
  font-size: 0.8rem;
}
.actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.edit-bar {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}
.spacer {
  flex: 1;
}
.lower {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 18rem;
  gap: 1rem;
}
.grid {
  min-height: 0;
}
.side {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-height: 0;
  overflow: hidden;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.85rem;
}
.muted {
  color: var(--p-text-muted-color);
}
.cell-input {
  width: 100%;
  border: none;
  background: transparent;
  padding: 0.25rem 0.5rem;
  box-shadow: none;
}
.cell-input:focus {
  background: var(--p-content-background);
  outline: 1px solid var(--p-primary-color);
}
.checklist {
  margin: 0.5rem 0 0 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
:deep(.problem-row) {
  background: color-mix(in srgb, var(--p-red-500) 12%, transparent) !important;
}
:deep(.selected-row) {
  outline: 2px solid var(--p-primary-color);
  outline-offset: -2px;
}
</style>
