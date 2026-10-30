<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Password from 'primevue/password'
import Select from 'primevue/select'
import type { ConnMeta, TlsPref, UpdateCheck } from '../../../shared/types'
import AppControls from '../components/AppControls.vue'
import { useConnectionStore } from '../stores/connection'
import { errorText } from '../i18n'

const router = useRouter()
const conn = useConnectionStore()
const { t } = useI18n()

const form = reactive({
  host: '',
  port: 21,
  user: 'admin',
  password: '',
  tls: 'auto' as TlsPref,
  save: false,
  name: ''
})

const tlsOptions = computed(() => [
  { label: t('connect.tlsAuto'), value: 'auto' },
  { label: t('connect.tlsFtps'), value: 'ftps' },
  { label: t('connect.tlsPlain'), value: 'plain' }
])

const busy = ref(false)
const slow = ref(false) // attempt has been running > 2s → offer to cancel
const cancelled = ref(false)

async function withBusy<T>(fn: () => Promise<T>): Promise<T> {
  busy.value = true
  cancelled.value = false
  const timer = setTimeout(() => (slow.value = true), 2000)
  try {
    return await fn()
  } finally {
    clearTimeout(timer)
    busy.value = false
    slow.value = false
    if (cancelled.value) {
      conn.error = null // the failure was self-inflicted, don't alarm the user
      await conn.disconnect() // in case cancel raced a connect that just succeeded
    }
  }
}

async function cancel(): Promise<void> {
  cancelled.value = true
  await conn.disconnect() // closes the pending client in main → connect() rejects
}

async function submit(): Promise<void> {
  const ok = await withBusy(() =>
    conn.connect(
      { host: form.host, port: form.port, user: form.user, password: form.password, tls: form.tls },
      form.save ? form.name || form.host : undefined
    )
  )
  if (ok && !cancelled.value) router.push('/browser')
}

async function useSaved(meta: ConnMeta): Promise<void> {
  const result = await withBusy(() => conn.connectSaved(meta))
  if (cancelled.value) return
  if (result === true) {
    router.push('/browser')
  } else if (result === 'needs-password') {
    // no stored password (no OS keychain) — prefill the form instead
    form.host = meta.host
    form.port = meta.port
    form.user = meta.user
    form.tls = meta.tls
    conn.error = { code: 'NO_PASSWORD', message: 'Enter the password for this connection' }
  }
}

/** cache folders are named after the sanitized host (cache.ts) — show the saved name when known */
function cachedLabel(name: string): string {
  const meta = conn.saved.find((m) => m.host.replace(/[^a-zA-Z0-9.-]/g, '_') === name)
  return meta ? `${meta.name} (${name})` : name
}

/** cachedHost given → open that cache folder, otherwise show a folder/file picker */
async function openLocal(kind: 'folder' | 'files', cachedHost?: string): Promise<void> {
  const files = await conn.openLocal(() =>
    cachedHost ? window.api.local.openCached(cachedHost) : window.api.local.open(kind)
  )
  if (files === undefined) return
  if (cachedHost) conn.activeLabel = cachedLabel(cachedHost)
  router.push(files?.length === 1 ? `/editor/${files[0]}` : '/browser')
}

const update = ref<UpdateCheck | null>(null)

onMounted(async () => {
  await conn.loadSaved()
  // /connect is the cold-start screen (the router guard sends every start here, since a
  // connection is never persisted), so this doubles as the startup update check
  const r = await window.api.updates.check()
  if (r.ok) update.value = r.data
})
</script>

<template>
  <main class="view connect">
    <AppControls class="corner" />
    <div class="panel">
      <div class="brand">
        <svg
          class="logo"
          viewBox="0 0 64 64"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <circle cx="28" cy="28" r="17" stroke-width="4.5" />
          <path d="M41.8 41.8L52 52" stroke-width="6" />
          <g stroke-width="5">
            <path d="M21 37V30" />
            <path d="M28 37V19" />
            <path d="M35 37V25" />
          </g>
        </svg>
        <h1>{{ t('connect.title') }}</h1>
      </div>
      <p class="subtitle">{{ t('connect.subtitle') }}</p>

      <div v-if="conn.saved.length" class="saved">
        <h2>{{ t('connect.savedConnections') }}</h2>
        <div v-for="meta in conn.saved" :key="meta.id" class="saved-row">
          <Button
            class="saved-main"
            severity="secondary"
            :label="`${meta.name} (${meta.user}@${meta.host})`"
            icon="pi pi-server"
            :disabled="busy"
            @click="useSaved(meta)"
          />
          <Button
            icon="pi pi-trash"
            severity="danger"
            text
            :disabled="busy"
            @click="conn.removeSaved(meta.id)"
          />
        </div>
      </div>

      <form class="form" @submit.prevent="submit">
        <div class="row">
          <label>{{ t('connect.host') }}</label>
          <InputText v-model="form.host" placeholder="192.168.11.23" required autofocus />
        </div>
        <div class="row">
          <label>{{ t('connect.port') }}</label>
          <InputNumber v-model="form.port" :use-grouping="false" :min="1" :max="65535" />
        </div>
        <div class="row">
          <label>{{ t('connect.user') }}</label>
          <InputText v-model="form.user" required />
        </div>
        <div class="row">
          <label>{{ t('connect.password') }}</label>
          <Password v-model="form.password" :feedback="false" toggle-mask required />
        </div>
        <div class="row">
          <label>{{ t('connect.encryption') }}</label>
          <Select
            v-model="form.tls"
            :options="tlsOptions"
            option-label="label"
            option-value="value"
          />
        </div>
        <div class="row">
          <label></label>
          <div class="save-opts">
            <Checkbox v-model="form.save" binary input-id="save" />
            <label for="save">{{ t('connect.saveConnection') }}</label>
            <InputText
              v-model="form.name"
              :placeholder="t('connect.namePlaceholder')"
              :style="{ visibility: form.save ? 'visible' : 'hidden' }"
            />
          </div>
        </div>
        <div class="actions">
          <Button
            type="submit"
            :label="t('connect.connect')"
            icon="pi pi-arrow-right"
            :loading="busy || conn.status === 'connecting'"
          />
          <Button
            v-tooltip="t('connect.cancel')"
            type="button"
            class="cancel"
            :class="{ show: slow }"
            icon="pi pi-times"
            severity="danger"
            text
            :aria-label="t('connect.cancel')"
            @click="cancel"
          />
        </div>
      </form>

      <div class="saved offline">
        <h2>{{ t('connect.offline') }}</h2>
        <p class="hint">{{ t('connect.offlineHint') }}</p>
        <Button
          v-for="h in conn.cachedHosts"
          :key="h.name"
          class="saved-main"
          severity="secondary"
          :label="t('connect.cachedHost', { name: cachedLabel(h.name), n: h.count }, h.count)"
          icon="pi pi-database"
          :disabled="busy"
          @click="openLocal('folder', h.name)"
        />
        <div class="saved-row">
          <Button
            class="saved-main"
            severity="secondary"
            :label="t('connect.openFolder')"
            icon="pi pi-folder-open"
            :disabled="busy"
            @click="openLocal('folder')"
          />
          <Button
            class="saved-main"
            severity="secondary"
            :label="t('connect.openFiles')"
            icon="pi pi-file"
            :disabled="busy"
            @click="openLocal('files')"
          />
        </div>
      </div>

      <Message v-if="conn.error" severity="error" :closable="false">
        {{ errorText(conn.error) }}
      </Message>
      <Message v-if="conn.error?.code === 'FTP_REFUSED'" severity="warn" :closable="false">
        <!-- eslint-disable-next-line vue/no-v-html -->
        <span v-html="t('connect.ftpHint')"></span>
      </Message>
      <Message v-if="update?.updateAvailable" severity="info" closable>
        {{ t('update.available', { latest: update.latest }) }}
        <!-- setWindowOpenHandler in main/index.ts turns target=_blank into shell.openExternal -->
        <a :href="update.url" target="_blank">{{ t('update.download') }}</a>
      </Message>
    </div>
  </main>
</template>

<style scoped>
.connect {
  align-items: center;
  position: relative;
  overflow-y: auto;
  /* keep the form clear of the corner controls */
  padding-top: 4rem;
}
.corner {
  position: absolute;
  top: 1rem;
  right: 1rem;
}
.panel {
  /* centered while it fits, scrolls from the top when it doesn't */
  margin: auto 0;
  width: 100%;
  max-width: 30rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.brand {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.logo {
  width: 2.75rem;
  height: 2.75rem;
  flex: none;
  color: var(--p-primary-color);
}
.subtitle {
  color: var(--p-text-muted-color);
}
.saved {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.saved-row {
  display: flex;
  gap: 0.25rem;
}
.saved-main {
  flex: 1;
  justify-content: flex-start;
}
.hint {
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
}
.form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}
.actions :deep(.p-button[type='submit']) {
  flex: 1;
}
/* collapsed until slow — the connect button (flex:1) shrinks as this grows */
.cancel {
  overflow: hidden;
  transition:
    width 0.2s,
    padding 0.2s,
    opacity 0.2s;
}
.cancel:not(.show) {
  width: 0;
  padding: 0;
  opacity: 0;
  visibility: hidden;
}
.row {
  display: grid;
  grid-template-columns: 7rem 1fr;
  align-items: center;
  gap: 0.5rem;
}
.row :deep(.p-inputtext),
.row :deep(.p-password),
.row :deep(.p-inputnumber),
.row :deep(.p-select) {
  width: 100%;
}
.save-opts {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.save-opts :deep(.p-inputtext) {
  flex: 1;
}
</style>
