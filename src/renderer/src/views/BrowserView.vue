<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import ProgressBar from 'primevue/progressbar'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import AppControls from '../components/AppControls.vue'
import { useConnectionStore } from '../stores/connection'
import { SUFFIX_KEYS, useFilesStore, type FileRow } from '../stores/files'
import type { SyncStatus } from '../../../shared/types'
import { errorText } from '../i18n'
import { formatDateTime } from '../prefs'

const router = useRouter()
const conn = useConnectionStore()
const files = useFilesStore()
const { t, locale } = useI18n()

const filter = computed({
  get: () => files.listUi.filter,
  set: (v: string) => {
    files.listUi.filter = v
    files.listUi.first = 0
  }
})
const monthFilter = computed({
  get: () => files.listUi.month,
  set: (v: string | null) => {
    files.listUi.month = v ?? ''
    files.listUi.first = 0
  }
})
const statusFilter = computed({
  get: () => files.listUi.status,
  set: (v: string | null) => {
    files.listUi.status = v ?? ''
    files.listUi.first = 0
  }
})
const selection = ref<FileRow[]>([])
const busyRow = ref<string | null>(null)
const deleteTargets = ref<FileRow[]>([])
const showPostUpload = ref(false)

const rows = computed(() => {
  const q = filter.value.trim().toLowerCase()
  const month = monthFilter.value
  const status = statusFilter.value
  return files.rows.filter(
    (f) =>
      (!month || f.yyyymm === month) &&
      (!status || f.status === status) &&
      (!q || f.name.toLowerCase().includes(q) || f.description?.toLowerCase().includes(q))
  )
})

function formatMonthLong(yyyymm: string): string {
  return new Date(Number(yyyymm.slice(0, 4)), Number(yyyymm.slice(4)) - 1).toLocaleString(
    locale.value,
    { month: 'long', year: 'numeric' }
  )
}

const monthOptions = computed(() => {
  const months = [...new Set(files.rows.map((f) => f.yyyymm))].sort().reverse()
  return months.map((m) => ({ label: formatMonthLong(m), value: m }))
})

// all statuses always listed (a selected one may drop to 0 after a transfer)
const statusOptions = computed(() => {
  const counts = new Map<SyncStatus, number>()
  for (const f of files.rows) counts.set(f.status, (counts.get(f.status) ?? 0) + 1)
  return (Object.keys(STATUS_SEVERITY) as SyncStatus[]).map((s) => ({
    label: `${t(`status.${s}`)} (${counts.get(s) ?? 0})`,
    value: s
  }))
})

const STATUS_SEVERITY: Record<SyncStatus, string> = {
  'only-remote': 'secondary',
  'only-local': 'contrast',
  same: 'success',
  'remote-newer': 'info',
  'local-newer': 'warn'
}

function suffixText(suffix: number | null): string | null {
  if (suffix === null) return null
  const key = SUFFIX_KEYS[suffix]
  return key ? t(`suffix.${key}`) : t('suffix.output', { n: suffix })
}

function formatMonth(yyyymm: string): string {
  return `${yyyymm.slice(0, 4)}-${yyyymm.slice(4)}`
}
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
function formatDate(iso: string | null): string {
  return iso ? formatDateTime(new Date(iso)) : '—'
}

async function downloadOne(row: FileRow): Promise<void> {
  busyRow.value = row.name
  await files.download([row])
  busyRow.value = null
}

async function openEditor(row: FileRow): Promise<void> {
  if (row.status === 'only-remote') {
    busyRow.value = row.name
    const ok = await files.download([row])
    busyRow.value = null
    if (!ok) return
  }
  router.push(`/editor/${row.name}`)
}

async function downloadSelected(): Promise<void> {
  await files.download(selection.value)
  selection.value = []
}

const uploadableSelected = computed(() =>
  selection.value.filter((r) => r.status === 'local-newer' || r.status === 'only-local')
)

async function uploadOne(row: FileRow): Promise<void> {
  busyRow.value = row.name
  if (await files.upload([row.name])) showPostUpload.value = true
  busyRow.value = null
}

async function uploadSelected(): Promise<void> {
  const names = uploadableSelected.value.map((r) => r.name)
  selection.value = []
  if (await files.upload(names)) showPostUpload.value = true
}

async function confirmDelete(): Promise<void> {
  const names = deleteTargets.value.filter((r) => r.remote).map((r) => r.name)
  deleteTargets.value = []
  await files.remove(names)
}

async function disconnect(): Promise<void> {
  await conn.disconnect()
  router.push('/connect')
}

function openCacheFolder(): void {
  window.api.cache.openFolder()
}

const backupPath = ref<string | null>(null)
async function backup(): Promise<void> {
  backupPath.value = await files.backupZip()
}

const transferPercent = computed(() => {
  if (!files.transfer) return 0
  const { index, total, bytes, bytesTotal } = files.transfer
  const fileFraction = bytesTotal > 0 ? bytes / bytesTotal : 0
  return Math.round(((index + fileFraction) / total) * 100)
})

function scrollContainer(): HTMLElement | null {
  return document.querySelector('.table .p-datatable-table-container')
}

let unsubscribe: (() => void) | null = null
onMounted(async () => {
  unsubscribe = window.api.onTransferProgress((p) => {
    if (files.transfer) files.transfer = p
  })
  if (!files.remote.length) files.refresh()
  await nextTick()
  const el = scrollContainer()
  if (el) el.scrollTop = files.listUi.scrollTop
})
onBeforeUnmount(() => {
  files.listUi.scrollTop = scrollContainer()?.scrollTop ?? 0
  unsubscribe?.()
})
</script>

<template>
  <main class="view">
    <div class="toolbar">
      <div class="title">
        <h1>{{ conn.activeLabel }}</h1>
        <Tag
          :value="conn.tlsMode === 'ftps' ? 'FTPS' : 'FTP'"
          :severity="conn.tlsMode === 'ftps' ? 'success' : 'warn'"
        />
        <AppControls />
      </div>
      <div class="actions">
        <Button
          v-if="selection.length"
          :label="t('browser.downloadSelected', { n: selection.length })"
          icon="pi pi-download"
          :disabled="!!files.transfer"
          @click="downloadSelected"
        />
        <Button
          v-if="uploadableSelected.length"
          :label="t('browser.uploadSelected', { n: uploadableSelected.length })"
          icon="pi pi-cloud-upload"
          severity="warn"
          :disabled="!!files.transfer"
          @click="uploadSelected"
        />
        <InputText v-model="filter" :placeholder="t('browser.filterPlaceholder')" />
        <Select
          v-model="monthFilter"
          :options="monthOptions"
          option-label="label"
          option-value="value"
          :placeholder="t('browser.allMonths')"
          show-clear
          class="month-select"
        />
        <Select
          v-model="statusFilter"
          :options="statusOptions"
          option-label="label"
          option-value="value"
          :placeholder="t('browser.allStatuses')"
          show-clear
          class="month-select"
        />
        <Button
          v-tooltip.bottom="t('browser.tipRefresh')"
          icon="pi pi-refresh"
          severity="secondary"
          :loading="files.loading"
          aria-label="Refresh"
          @click="files.refresh()"
        />
        <Button
          v-tooltip.bottom="t('browser.tipOpenFolder')"
          icon="pi pi-folder-open"
          severity="secondary"
          aria-label="Open local folder"
          @click="openCacheFolder"
        />
        <Button
          v-tooltip.bottom="t('browser.tipBackup')"
          icon="pi pi-file-export"
          :label="t('browser.backup')"
          severity="secondary"
          :disabled="!!files.transfer"
          @click="backup"
        />
        <Button
          icon="pi pi-sign-out"
          :label="t('browser.disconnect')"
          severity="secondary"
          @click="disconnect"
        />
      </div>
    </div>

    <Message v-if="files.error" severity="error" :closable="false">
      {{ errorText(files.error) }}
    </Message>

    <div v-if="files.transfer" class="transfer">
      <span class="mono">{{ files.transfer.file }}</span>
      <ProgressBar :value="transferPercent" style="flex: 1" />
    </div>

    <DataTable
      v-model:selection="selection"
      v-model:first="files.listUi.first"
      v-model:rows="files.listUi.rows"
      :value="rows"
      :loading="files.loading"
      data-key="name"
      sort-field="name"
      :sort-order="1"
      paginator
      :rows-per-page-options="[25, 50, 100]"
      scrollable
      scroll-height="flex"
      class="table"
    >
      <Column selection-mode="multiple" header-style="width: 3rem" />
      <Column field="name" :header="t('browser.colFile')" sortable>
        <template #body="{ data }">
          <span class="mono">{{ data.name }}</span>
        </template>
      </Column>
      <Column field="description" :header="t('browser.colDescription')" sortable>
        <template #body="{ data }">
          <span class="desc">
            <span v-if="data.description">{{ data.description }}</span>
            <span v-else v-tooltip.right="t('browser.unknownTooltip')" class="muted">{{
              t('browser.unknown')
            }}</span>
            <Tag
              v-if="suffixText(data.suffix)"
              :value="suffixText(data.suffix)!"
              severity="secondary"
              class="suffix-tag"
            />
          </span>
        </template>
      </Column>
      <Column field="yyyymm" :header="t('browser.colMonth')" sortable>
        <template #body="{ data }">{{ formatMonth(data.yyyymm) }}</template>
      </Column>
      <Column field="size" :header="t('browser.colSize')" sortable>
        <template #body="{ data }">{{ formatSize(data.size) }}</template>
      </Column>
      <Column field="modifiedAt" :header="t('browser.colModified')" sortable>
        <template #body="{ data }">{{ formatDate(data.modifiedAt) }}</template>
      </Column>
      <Column field="status" :header="t('browser.colStatus')" sortable>
        <template #body="{ data }">
          <Tag
            :value="t(`status.${data.status}`)"
            :severity="STATUS_SEVERITY[data.status as SyncStatus]"
          />
        </template>
      </Column>
      <Column header-style="width: 11rem">
        <template #body="{ data }">
          <div class="row-actions">
            <Button
              v-tooltip.left="t('browser.tipDownload')"
              icon="pi pi-download"
              text
              severity="secondary"
              aria-label="Download"
              :disabled="!data.remote || !!files.transfer"
              :loading="busyRow === data.name"
              @click="downloadOne(data)"
            />
            <Button
              v-tooltip.left="t('browser.tipOpen')"
              icon="pi pi-chart-line"
              text
              aria-label="Open"
              :disabled="!!files.transfer"
              @click="openEditor(data)"
            />
            <Button
              v-tooltip.left="t('browser.tipUpload')"
              icon="pi pi-cloud-upload"
              text
              severity="warn"
              aria-label="Upload"
              :disabled="
                (data.status !== 'local-newer' && data.status !== 'only-local') || !!files.transfer
              "
              @click="uploadOne(data)"
            />
            <Button
              v-tooltip.left="t('browser.tipDelete')"
              icon="pi pi-trash"
              text
              severity="danger"
              aria-label="Delete"
              :disabled="!data.remote || !!files.transfer"
              @click="deleteTargets = [data]"
            />
          </div>
        </template>
      </Column>
      <template #empty>
        <span v-if="!files.loading">{{ t('browser.empty') }}</span>
      </template>
    </DataTable>

    <Dialog
      :visible="!!deleteTargets.length"
      :header="t('browser.deleteTitle')"
      modal
      :style="{ width: '28rem' }"
      @update:visible="deleteTargets = []"
    >
      <p>{{ t('browser.deleteBody') }}</p>
      <ul class="delete-list">
        <li v-for="target in deleteTargets" :key="target.name" class="mono">{{ target.name }}</li>
      </ul>
      <template #footer>
        <Button
          :label="t('browser.cancel')"
          severity="secondary"
          text
          @click="deleteTargets = []"
        />
        <Button
          :label="t('browser.deleteConfirm')"
          icon="pi pi-trash"
          severity="danger"
          @click="confirmDelete"
        />
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
  gap: 0.75rem;
}
.lang-switch {
  margin-left: 0.5rem;
}
.actions {
  display: flex;
  gap: 0.5rem;
}
.month-select {
  min-width: 11rem;
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
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.85rem;
}
.muted {
  color: var(--p-text-muted-color);
  font-style: italic;
  font-size: 0.85rem;
}
.row-actions {
  display: flex;
}
.desc {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}
.suffix-tag {
  font-size: 0.7rem;
}
.delete-list {
  margin: 0.5rem 0 0 1.25rem;
}
.checklist {
  margin: 0.5rem 0 0 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
</style>
