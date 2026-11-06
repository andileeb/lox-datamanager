<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Password from 'primevue/password'
import Select from 'primevue/select'
import type { ConnMeta, TlsPref } from '../../../shared/types'
import AppControls from '../components/AppControls.vue'
import { useConnectionStore } from '../stores/connection'
import { errorText } from '../i18n'
import { cleanHost } from '../../../shared/host'

const router = useRouter()
const conn = useConnectionStore()
const { t } = useI18n()

const form = reactive({
  host: '',
  port: 21,
  user: 'admin',
  password: '',
  tls: 'auto' as TlsPref,
  // on by default: next time it's one click (an existing entry is updated, not duplicated)
  save: true,
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

/** host of the last attempt — a failed one offers its downloaded copy */
const attempted = ref('')

async function submit(): Promise<void> {
  form.host = cleanHost(form.host) // pasted "http://…/" → the bare address, visibly
  attempted.value = form.host
  const ok = await withBusy(() =>
    conn.connect(
      { host: form.host, port: form.port, user: form.user, password: form.password, tls: form.tls },
      form.save ? form.name || form.host : undefined
    )
  )
  if (ok && !cancelled.value) router.push('/browser')
}

/** the saved entry into the form with the cursor in the password — Connect then updates it */
async function prefill(meta: ConnMeta): Promise<void> {
  const { host, port, user, tls, name } = meta
  Object.assign(form, { host, port, user, tls, name, password: '', save: true })
  await nextTick()
  document.getElementById('conn-password')?.focus()
}

async function useSaved(meta: ConnMeta): Promise<void> {
  attempted.value = meta.host
  const result = await withBusy(() => conn.connectSaved(meta))
  if (cancelled.value) return
  if (result === true) {
    router.push('/browser')
  } else if (result === 'needs-password') {
    // no stored password (no OS keychain)
    conn.error = { code: 'NO_PASSWORD', message: 'Enter the password for this connection' }
    await prefill(meta)
  } else if (conn.error?.code === 'FTP_AUTH_FAILED') {
    await prefill(meta) // password changed on the Miniserver — type the new one, it's saved
  }
}

/** Miniserver not reachable, but its files were downloaded before → offer them right in the error */
const offlineCopy = computed(() => {
  if (!['FTP_REFUSED', 'FTP_TIMEOUT'].includes(conn.error?.code ?? '')) return null
  const dir = attempted.value.replace(/[^a-zA-Z0-9.-]/g, '_')
  return conn.cachedHosts.find((h) => h.name === dir) ?? null
})

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

onMounted(() => conn.loadSaved())

// a failed attempt must be seen — small windows would leave it below the fold
watch(
  () => conn.error,
  async (e) => {
    if (!e) return
    await nextTick()
    // center: the Message is still animating open (≈0 px tall), 'nearest' would barely move
    document.querySelector('.connect .p-message')?.scrollIntoView({ block: 'center' })
  }
)
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
            v-tooltip="t('connect.removeSaved')"
            icon="pi pi-trash"
            severity="danger"
            text
            :aria-label="t('connect.removeSaved')"
            :disabled="busy"
            @click="conn.removeSaved(meta.id)"
          />
        </div>
      </div>

      <form class="form" @submit.prevent="submit">
        <div class="row">
          <label for="conn-host">{{ t('connect.host') }}</label>
          <InputText
            id="conn-host"
            v-model="form.host"
            placeholder="192.168.11.23"
            required
            autofocus
            @blur="form.host = cleanHost(form.host)"
          />
        </div>
        <div class="row">
          <label for="conn-port">{{ t('connect.port') }}</label>
          <InputNumber
            v-model="form.port"
            input-id="conn-port"
            :use-grouping="false"
            :min="1"
            :max="65535"
          />
        </div>
        <div class="row">
          <label for="conn-user">{{ t('connect.user') }}</label>
          <InputText id="conn-user" v-model="form.user" required />
        </div>
        <div class="row">
          <label for="conn-password">{{ t('connect.password') }}</label>
          <Password
            v-model="form.password"
            input-id="conn-password"
            :feedback="false"
            toggle-mask
            required
          />
        </div>
        <div class="row">
          <label id="conn-tls">{{ t('connect.encryption') }}</label>
          <Select
            v-model="form.tls"
            aria-labelledby="conn-tls"
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

      <!-- right under Connect: at 800×600 anything below the offline list is off-screen -->
      <Message v-if="conn.error" severity="error" :closable="false">
        {{ errorText(conn.error) }}
        <Button
          v-if="offlineCopy"
          class="offline-copy"
          :label="t('connect.offlineCopy', offlineCopy.count)"
          icon="pi pi-database"
          size="small"
          severity="secondary"
          @click="openLocal('folder', offlineCopy.name)"
        />
      </Message>
      <Message v-if="conn.error?.code === 'FTP_REFUSED'" severity="warn" :closable="false">
        <!-- eslint-disable-next-line vue/no-v-html -->
        <span v-html="t('connect.ftpHint')"></span>
      </Message>
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
.offline-copy {
  display: flex;
  margin-top: 0.5rem;
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
