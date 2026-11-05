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
import { errorText } from '../i18n'
import { connectionUrl, parseConnectionCode } from '../../../shared/config-mcp'
import { clientEntry, type ClaudeClient } from '../../../shared/mcp-clients'
import type {
  ClaudeSetup,
  ConfigMcpState,
  ConfigRemoteInfo,
  McpState,
  UpdateCheck
} from '../../../shared/types'

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
const copied = ref<'token' | 'snippet' | 'code' | 'remoteSnippet' | null>(null)

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
  await loadConfigMcp()
  if (configMcp.value?.remoteCode) {
    remoteInput.value = configMcp.value.remoteCode
    void connectRemote()
  }
  await loadClaude()
  await checkUpdates()
})

async function configureMcp(enabled: boolean, port: number): Promise<void> {
  const r = await window.api.mcp.configure(enabled, port)
  if (r.ok) mcp.value = r.data
  await loadClaude()
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
  await loadClaude()
}

type McpClient = 'claudeCode' | 'claudeDesktop' | 'cursor' | 'vscode'
const mcpClients: { value: McpClient; label: string }[] = [
  { value: 'claudeCode', label: 'Claude Code' },
  { value: 'claudeDesktop', label: 'Claude Desktop' },
  { value: 'cursor', label: 'Cursor' },
  { value: 'vscode', label: 'VS Code' }
]
const mcpClient = ref<McpClient>('claudeCode')

function snippet(name: string, url: string, token: string | null): string {
  const auth = `Bearer ${token ?? '<token>'}`
  const json = (o: unknown): string => JSON.stringify(o, null, 2)
  switch (mcpClient.value) {
    case 'claudeCode':
      return `claude mcp add --transport http ${name} ${url} --header "Authorization: ${auth}"`
    case 'claudeDesktop':
      return json({ mcpServers: { [name]: clientEntry('claudeDesktop', url, token ?? '<token>') } })
    case 'cursor':
      return json({ mcpServers: { [name]: { url, headers: { Authorization: auth } } } })
    case 'vscode':
      return json({ servers: { [name]: { type: 'http', url, headers: { Authorization: auth } } } })
  }
  return ''
}

const mcpSnippet = computed(() =>
  mcp.value ? snippet('lox-datamanager', mcp.value.url, mcp.value.token) : ''
)

// Loxone Config's MCP across computers: this PC shares it, or connects to another PC's share
const configMcp = ref<ConfigMcpState | null>(null)
const shareCode = ref<string | null>(null)
const remoteInput = ref('')
const remote = ref<ConfigRemoteInfo | null>(null)
const remoteError = ref<string | null>(null)
const connecting = ref(false)

function setConfigMcp(s: ConfigMcpState): void {
  configMcp.value = s
  if (!shareCode.value || !s.codes.includes(shareCode.value)) shareCode.value = s.codes[0] ?? null
}

async function loadConfigMcp(): Promise<void> {
  const r = await window.api.configMcp.get()
  if (r.ok) setConfigMcp(r.data)
}

async function onShareToggle(): Promise<void> {
  if (!configMcp.value) return
  const r = await window.api.configMcp.share(configMcp.value.shareEnabled)
  if (r.ok) setConfigMcp(r.data)
}

async function regenerateShare(): Promise<void> {
  const r = await window.api.configMcp.regenerate()
  if (r.ok) setConfigMcp(r.data)
}

async function connectRemote(): Promise<void> {
  connecting.value = true
  remoteError.value = null
  const r = await window.api.configMcp.connect(remoteInput.value)
  connecting.value = false
  remote.value = r.ok ? r.data : null
  if (!r.ok) remoteError.value = errorText(r.error)
  await loadClaude()
}

async function forgetRemote(): Promise<void> {
  await window.api.configMcp.forget()
  remote.value = null
  remoteError.value = null
  remoteInput.value = ''
  await loadClaude()
}

// "Add to Claude": writes both servers into Claude Code's / Claude Desktop's config file
const claudeApps = ref<ClaudeSetup[]>([])
const claudeAdded = ref<ClaudeClient | null>(null)
const claudeError = ref<string | null>(null)

async function loadClaude(): Promise<void> {
  const r = await window.api.claude.get()
  if (r.ok) claudeApps.value = r.data.filter((c) => Object.keys(c.servers).length)
}

/** current = every server there and up to date; outdated = one has an old token/URL */
function claudeStatus(c: ClaudeSetup): 'current' | 'outdated' | 'missing' {
  const s = Object.values(c.servers)
  return s.every((x) => x === 'current')
    ? 'current'
    : s.includes('outdated')
      ? 'outdated'
      : 'missing'
}

async function addToClaude(client: ClaudeClient): Promise<void> {
  claudeError.value = null
  const r = await window.api.claude.add(client)
  if (r.ok) {
    claudeApps.value = r.data.filter((c) => Object.keys(c.servers).length)
    claudeAdded.value = client
  } else claudeError.value = errorText(r.error)
}

const remoteSnippet = computed(() => {
  const c = remote.value && parseConnectionCode(remoteInput.value)
  return c ? snippet('loxone-config', connectionUrl(c), c.token) : ''
})

async function copyText(text: string, which: NonNullable<typeof copied.value>): Promise<void> {
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
          <div class="row">
            <label>{{ t('settings.mcpClient') }}</label>
            <Select
              v-model="mcpClient"
              :options="mcpClients"
              option-label="label"
              option-value="value"
            />
          </div>
          <p class="hint">{{ t(`settings.mcpWhere.${mcpClient}`) }}</p>
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

      <template v-if="configMcp?.shareAvailable">
        <h2>{{ t('settings.shareTitle') }}</h2>
        <div class="row">
          <label>{{ t('settings.shareEnable') }}</label>
          <div class="mcp-status">
            <ToggleSwitch v-model="configMcp.shareEnabled" @change="onShareToggle" />
            <Tag
              v-if="configMcp.error"
              severity="danger"
              :value="t('settings.mcpError', { error: configMcp.error })"
            />
            <Tag
              v-else-if="configMcp.running && configMcp.configPort"
              severity="success"
              :value="t('settings.shareRunning')"
            />
            <Tag
              v-else-if="configMcp.running"
              severity="warn"
              :value="t('settings.shareNoConfig')"
            />
            <Tag v-else severity="secondary" :value="t('settings.mcpStopped')" />
            <Button
              v-tooltip.top="t('settings.shareRecheck')"
              icon="pi pi-refresh"
              size="small"
              severity="secondary"
              text
              rounded
              :aria-label="t('settings.shareRecheck')"
              @click="loadConfigMcp"
            />
          </div>
        </div>
        <div v-if="configMcp.running && shareCode" class="row">
          <label>{{ t('settings.shareCode') }}</label>
          <div class="mcp-token">
            <!-- several network adapters: pick the address, Copy takes the whole code -->
            <Select
              v-if="configMcp.codes.length > 1"
              v-model="shareCode"
              :options="configMcp.codes"
              :option-label="(c: string) => c.slice(0, c.lastIndexOf(':'))"
            />
            <InputText v-else :model-value="shareCode" readonly class="token-input" />
            <Button
              :label="copied === 'code' ? t('settings.mcpCopied') : t('settings.mcpCopy')"
              size="small"
              severity="secondary"
              @click="copyText(shareCode, 'code')"
            />
            <Button
              :label="t('settings.mcpRegenerate')"
              size="small"
              severity="secondary"
              outlined
              @click="regenerateShare"
            />
          </div>
        </div>
        <p class="hint">{{ t('settings.shareHint') }}</p>
      </template>

      <template v-if="configMcp">
        <h2>{{ t('settings.remoteTitle') }}</h2>
        <div class="row">
          <label>{{ t('settings.shareCode') }}</label>
          <div class="mcp-token">
            <InputText
              v-model="remoteInput"
              :placeholder="t('settings.remotePlaceholder')"
              class="token-input"
              @keydown.enter="connectRemote"
            />
            <Button
              :label="t('settings.remoteConnect')"
              size="small"
              :loading="connecting"
              :disabled="!remoteInput.trim()"
              @click="connectRemote"
            />
            <Button
              v-if="configMcp.remoteCode || remote"
              :label="t('settings.remoteForget')"
              size="small"
              severity="secondary"
              outlined
              @click="forgetRemote"
            />
          </div>
        </div>
        <Tag
          v-if="remote"
          class="remote-tag"
          severity="success"
          :value="t('settings.remoteConnected', remote)"
        />
        <Tag v-else-if="remoteError" class="remote-tag" severity="danger" :value="remoteError" />
        <template v-if="remoteSnippet">
          <div class="row">
            <label>{{ t('settings.mcpClient') }}</label>
            <Select
              v-model="mcpClient"
              :options="mcpClients"
              option-label="label"
              option-value="value"
            />
          </div>
          <p class="hint">{{ t(`settings.mcpWhere.${mcpClient}`) }}</p>
          <div class="mcp-snippet">
            <pre>{{ remoteSnippet }}</pre>
            <Button
              :label="copied === 'remoteSnippet' ? t('settings.mcpCopied') : t('settings.mcpCopy')"
              size="small"
              severity="secondary"
              @click="copyText(remoteSnippet, 'remoteSnippet')"
            />
          </div>
        </template>
        <p class="hint">{{ t('settings.remoteHint') }}</p>
      </template>

      <template v-if="claudeApps.length">
        <h2>{{ t('settings.claudeTitle') }}</h2>
        <div v-for="c in claudeApps" :key="c.client" class="row">
          <label>{{ mcpClients.find((m) => m.value === c.client)?.label }}</label>
          <div class="mcp-status">
            <Tag
              :severity="claudeStatus(c) === 'current' ? 'success' : 'secondary'"
              :value="t(`settings.claudeStatus.${claudeStatus(c)}`)"
            />
            <Button
              v-if="claudeStatus(c) !== 'current'"
              :label="
                t(claudeStatus(c) === 'outdated' ? 'settings.claudeUpdate' : 'settings.claudeAdd')
              "
              size="small"
              @click="addToClaude(c.client)"
            />
          </div>
        </div>
        <Tag v-if="claudeError" class="remote-tag" severity="danger" :value="claudeError" />
        <p v-else-if="claudeAdded" class="hint">{{ t(`settings.claudeRestart.${claudeAdded}`) }}</p>
        <p class="hint">
          {{ t('settings.claudeHint', { servers: Object.keys(claudeApps[0].servers).join(', ') }) }}
        </p>
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
  min-width: 0;
  font-family: ui-monospace, Menlo, monospace;
  font-size: 0.85rem;
}
.mcp-token :deep(.p-button) {
  flex-shrink: 0;
}
.mcp-token :deep(.p-select) {
  flex: 1;
  min-width: 0;
}
.remote-tag {
  align-self: flex-start;
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
