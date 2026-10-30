<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import Tag from 'primevue/tag'
import ToggleSwitch from 'primevue/toggleswitch'
import { setLocale, type AppLocale } from '../i18n'
import { isDark, toggleDark } from '../theme'
import { formatDateTime, prefs } from '../prefs'
import type { McpState, UpdateCheck } from '../../../shared/types'

const router = useRouter()
const { t, locale } = useI18n()

const localeModel = computed({
  get: () => locale.value as AppLocale,
  set: (v: AppLocale) => setLocale(v)
})

const themeModel = computed({
  get: () => (isDark.value ? 'dark' : 'light'),
  set: (v: string) => {
    if ((v === 'dark') !== isDark.value) toggleDark()
  }
})

const languageOptions = [
  { label: 'English', value: 'en' },
  { label: 'Deutsch', value: 'de' }
]
const themeOptions = computed(() => [
  { label: t('settings.themeLight'), value: 'light' },
  { label: t('settings.themeDark'), value: 'dark' }
])
const dateFormatOptions = ['DD.MM.YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'].map((f) => ({
  label: f,
  value: f
}))
const timeFormatOptions = computed(() => [
  { label: t('settings.time24'), value: '24h' },
  { label: t('settings.time12'), value: '12h' }
])

const example = computed(() => {
  void prefs.dateFormat
  void prefs.timeFormat
  return formatDateTime(new Date(2026, 4, 31, 17, 45, 9))
})

const mcp = ref<McpState | null>(null)
const copied = ref<'token' | 'snippet' | null>(null)

const appVersion: string = import.meta.env.APP_VERSION
const update = ref<UpdateCheck | null>(null)
const checking = ref(false)

async function checkUpdates(): Promise<void> {
  checking.value = true
  const r = await window.api.updates.check()
  checking.value = false
  if (r.ok) update.value = r.data
}

const updateStatus = computed(() => {
  if (!update.value) return ''
  if (update.value.updateAvailable) return t('update.available', { latest: update.value.latest })
  return update.value.latest === null ? t('update.checkFailed') : t('update.upToDate')
})

onMounted(async () => {
  const r = await window.api.mcp.get()
  if (r.ok) mcp.value = r.data
  await checkUpdates()
})

async function configureMcp(enabled: boolean, port: number): Promise<void> {
  const r = await window.api.mcp.configure(enabled, port)
  if (r.ok) mcp.value = r.data
}

function onMcpToggle(): void {
  if (mcp.value) void configureMcp(mcp.value.enabled, mcp.value.port)
}

function onMcpPortBlur(): void {
  if (mcp.value?.port) void configureMcp(mcp.value.enabled, mcp.value.port)
}

async function regenerateToken(): Promise<void> {
  const r = await window.api.mcp.regenerateToken()
  if (r.ok) mcp.value = r.data
}

const mcpSnippet = computed(() =>
  mcp.value
    ? `claude mcp add --transport http lox-datamanager ${mcp.value.url} --header "Authorization: Bearer ${mcp.value.token ?? '<token>'}"`
    : ''
)

async function copyText(text: string, which: 'token' | 'snippet'): Promise<void> {
  await navigator.clipboard.writeText(text)
  copied.value = which
  setTimeout(() => (copied.value = null), 1500)
}
</script>

<template>
  <main class="view settings">
    <div class="panel">
      <div class="head">
        <Button
          v-tooltip.bottom="t('editor.back')"
          icon="pi pi-arrow-left"
          text
          severity="secondary"
          aria-label="Back"
          @click="router.back()"
        />
        <h1>{{ t('settings.title') }}</h1>
      </div>

      <div class="row">
        <label>{{ t('settings.language') }}</label>
        <Select
          v-model="localeModel"
          :options="languageOptions"
          option-label="label"
          option-value="value"
        />
      </div>

      <div class="row">
        <label>{{ t('settings.theme') }}</label>
        <SelectButton
          v-model="themeModel"
          :options="themeOptions"
          option-label="label"
          option-value="value"
          :allow-empty="false"
        />
      </div>

      <div class="row">
        <label>{{ t('settings.dateFormat') }}</label>
        <Select
          v-model="prefs.dateFormat"
          :options="dateFormatOptions"
          option-label="label"
          option-value="value"
        />
      </div>

      <div class="row">
        <label>{{ t('settings.timeFormat') }}</label>
        <SelectButton
          v-model="prefs.timeFormat"
          :options="timeFormatOptions"
          option-label="label"
          option-value="value"
          :allow-empty="false"
        />
      </div>

      <p class="example">{{ t('settings.example', { example }) }}</p>
      <p class="hint">{{ t('settings.shortcutHint') }}</p>

      <p>{{ t('update.version') }} {{ appVersion }}</p>
      <div class="update">
        <Button
          :label="checking ? t('update.checking') : t('update.check')"
          size="small"
          severity="secondary"
          outlined
          :disabled="checking"
          @click="checkUpdates"
        />
        <a v-if="update?.updateAvailable" :href="update.url" target="_blank">
          {{ updateStatus }}
        </a>
        <span v-else class="hint">{{ updateStatus }}</span>
      </div>

      <template v-if="mcp">
        <h2>{{ t('settings.mcpTitle') }}</h2>
        <div class="row">
          <label>{{ t('settings.mcpEnable') }}</label>
          <div class="mcp-status">
            <ToggleSwitch v-model="mcp.enabled" @change="onMcpToggle" />
            <Tag
              v-if="mcp.error"
              severity="danger"
              :value="t('settings.mcpError', { error: mcp.error })"
            />
            <Tag
              v-else-if="mcp.running"
              severity="success"
              :value="t('settings.mcpRunning', { url: mcp.url })"
            />
            <Tag v-else severity="secondary" :value="t('settings.mcpStopped')" />
          </div>
        </div>
        <div class="row">
          <label>{{ t('settings.mcpPort') }}</label>
          <InputNumber
            v-model="mcp.port"
            :min="1024"
            :max="65535"
            :use-grouping="false"
            :disabled="mcp.enabled"
            @blur="onMcpPortBlur"
          />
        </div>
        <div class="row">
          <label>{{ t('settings.mcpToken') }}</label>
          <div class="mcp-token">
            <InputText :model-value="mcp.token ?? ''" readonly class="token-input" />
            <Button
              :label="copied === 'token' ? t('settings.mcpCopied') : t('settings.mcpCopy')"
              size="small"
              severity="secondary"
              :disabled="!mcp.token"
              @click="copyText(mcp.token ?? '', 'token')"
            />
            <Button
              :label="t('settings.mcpRegenerate')"
              size="small"
              severity="secondary"
              outlined
              @click="regenerateToken"
            />
          </div>
        </div>
        <template v-if="mcp.enabled && mcp.token">
          <p class="hint">{{ t('settings.mcpSnippetLabel') }}</p>
          <div class="mcp-snippet">
            <pre>{{ mcpSnippet }}</pre>
            <Button
              :label="copied === 'snippet' ? t('settings.mcpCopied') : t('settings.mcpCopy')"
              size="small"
              severity="secondary"
              @click="copyText(mcpSnippet, 'snippet')"
            />
          </div>
        </template>
        <p class="hint">{{ t('settings.mcpHint') }}</p>
      </template>
    </div>
  </main>
</template>

<style scoped>
.settings {
  align-items: center;
}
.panel {
  width: 100%;
  max-width: 34rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding-top: 1rem;
}
.head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.row {
  display: grid;
  grid-template-columns: 10rem 1fr;
  align-items: center;
  gap: 0.75rem;
}
.row :deep(.p-select) {
  width: 100%;
  max-width: 16rem;
}
.example {
  color: var(--p-text-muted-color);
  font-family: ui-monospace, Menlo, monospace;
  font-size: 0.9rem;
}
.hint {
  color: var(--p-text-muted-color);
  font-size: 0.8rem;
}
h2 {
  margin: 1rem 0 0;
  font-size: 1.1rem;
}
.mcp-status,
.mcp-token {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.update {
  /* pull the box out by border+padding so the button *label* lines up with "Version" above */
  margin-left: calc(-1 * (var(--p-button-sm-padding-x) + 1px));
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.token-input {
  flex: 1;
  font-family: ui-monospace, Menlo, monospace;
  font-size: 0.85rem;
}
.mcp-snippet {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
}
.mcp-snippet pre {
  flex: 1;
  margin: 0;
  padding: 0.5rem;
  background: var(--p-content-hover-background);
  border-radius: 6px;
  font-size: 0.75rem;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
