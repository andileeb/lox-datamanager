<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import Panel from 'primevue/panel'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import Tab from 'primevue/tab'
import TabList from 'primevue/tablist'
import TabPanel from 'primevue/tabpanel'
import TabPanels from 'primevue/tabpanels'
import Tabs from 'primevue/tabs'
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
const route = useRoute()
const { t, locale } = useI18n()

// ?tab=ai opens the AI tab directly (e.g. from the dashboard)
const tab = computed({
  get: () => (route.query.tab === 'ai' ? 'ai' : 'general'),
  set: (v: string) => void router.replace({ query: { ...route.query, tab: v } })
})

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
const copied = ref<'token' | 'snippet' | 'code' | null>(null)

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
  // back from Claude Desktop's install dialog → show "Added"
  window.addEventListener('focus', loadClaude)
  await checkUpdates()
})
onBeforeUnmount(() => window.removeEventListener('focus', loadClaude))

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
const mcpClient = ref<McpClient>('cursor')

interface Server {
  name: string
  url: string
  token: string
}

/** by-hand setup for apps "Add to Claude" doesn't cover — every server in one snippet */
function snippet(list: Server[]): string {
  const json = (o: unknown): string => JSON.stringify(o, null, 2)
  const map = (f: (s: Server) => object): Record<string, object> =>
    Object.fromEntries(list.map((s) => [s.name, f(s)]))
  const headers = (s: Server): object => ({ Authorization: `Bearer ${s.token}` })
  switch (mcpClient.value) {
    case 'claudeCode':
      return list
        .map(
          (s) =>
            `claude mcp add --scope user --transport http ${s.name} ${s.url} --header "Authorization: Bearer ${s.token}"`
        )
        .join('\n')
    case 'claudeDesktop':
      return json({ mcpServers: map((s) => clientEntry('claudeDesktop', s.url, s.token)) })
    case 'cursor':
      return json({ mcpServers: map((s) => ({ url: s.url, headers: headers(s) })) })
    case 'vscode':
      return json({ servers: map((s) => ({ type: 'http', url: s.url, headers: headers(s) })) })
  }
  return ''
}

const mcpSnippet = computed(() => {
  const list: Server[] = []
  if (mcp.value?.token)
    list.push({ name: 'lox-datamanager', url: mcp.value.url, token: mcp.value.token })
  const c = remote.value && parseConnectionCode(remoteInput.value)
  if (c) list.push({ name: 'loxone-config', url: connectionUrl(c), token: c.token })
  return list.length ? snippet(list) : ''
})

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
  else forgotExtension.value = false
  await loadClaude()
}

/** Claude Desktop's extension stays installed after Forget — we don't delete Claude's files */
const forgotExtension = ref(false)

async function forgetRemote(): Promise<void> {
  forgotExtension.value = claudeApps.value.some(
    (c) => c.client === 'claudeDesktop' && c.servers['loxone-config'] === 'current'
  )
  await window.api.configMcp.forget()
  if (configMcp.value) configMcp.value.remoteCode = null
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
  if (r.ok) claudeApps.value = r.data
}

/** current = every server there and up to date; outdated = one has an old token/URL;
 *  partial = Claude Desktop installs one extension per click, some are in already */
function claudeStatus(c: ClaudeSetup): 'current' | 'outdated' | 'partial' | 'missing' {
  const s = Object.values(c.servers)
  if (s.every((x) => x === 'current')) return 'current'
  if (s.includes('outdated')) return 'outdated'
  return s.includes('current') ? 'partial' : 'missing'
}

const claudeDone = (c: ClaudeSetup): { done: number; total: number } => ({
  done: Object.values(c.servers).filter((x) => x === 'current').length,
  total: Object.keys(c.servers).length
})

async function addToClaude(client: ClaudeClient): Promise<void> {
  claudeError.value = null
  // adding Claude means "let Claude in" → switch the server on instead of asking for it first
  if (mcp.value && !mcp.value.enabled) await configureMcp(true, mcp.value.port)
  const r = await window.api.claude.add(client)
  if (r.ok) {
    claudeApps.value = r.data
    claudeAdded.value = client
  } else claudeError.value = errorText(r.error)
}

async function copyText(text: string, which: NonNullable<typeof copied.value>): Promise<void> {
  await navigator.clipboard.writeText(text)
  copied.value = which
  setTimeout(() => (copied.value = null), 1500)
}

const prompts = [
  'energy-report',
  'automation-ideas',
  'what-to-buy',
  'improve-config',
  'fix-statistics'
]
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

      <Tabs v-model:value="tab">
        <TabList>
          <Tab value="general">{{ t('settings.tabGeneral') }}</Tab>
          <Tab value="ai"><i class="pi pi-sparkles" /> {{ t('settings.tabAi') }}</Tab>
        </TabList>
        <TabPanels>
          <TabPanel value="general">
            <div class="tab">
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
            </div>
          </TabPanel>

          <TabPanel v-if="mcp" value="ai">
            <div class="tab">
              <p class="intro">{{ t('settings.aiIntro') }}</p>

              <!-- 1: Claude — the one thing most users need -->
              <h2>{{ t('settings.claudeTitle') }}</h2>
              <div v-for="c in claudeApps" :key="c.client" class="row">
                <label>{{ mcpClients.find((m) => m.value === c.client)?.label }}</label>
                <div class="mcp-status">
                  <Tag
                    :severity="claudeStatus(c) === 'current' ? 'success' : 'secondary'"
                    :value="t(`settings.claudeStatus.${claudeStatus(c)}`, claudeDone(c))"
                  />
                  <Button
                    v-if="claudeStatus(c) !== 'current'"
                    :label="
                      t(
                        claudeStatus(c) === 'outdated'
                          ? 'settings.claudeUpdate'
                          : 'settings.claudeAdd'
                      )
                    "
                    size="small"
                    @click="addToClaude(c.client)"
                  />
                </div>
              </div>
              <p v-if="!claudeApps.length" class="hint">
                {{ t('settings.claudeNotFound') }}
                <a href="https://claude.ai/download" target="_blank">claude.ai/download</a>
              </p>
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
                    :value="t('settings.mcpRunning')"
                  />
                  <Tag v-else severity="secondary" :value="t('settings.mcpStopped')" />
                </div>
              </div>
              <p class="hint">{{ t('settings.claudeHint') }}</p>
              <Tag v-if="claudeError" class="remote-tag" severity="danger" :value="claudeError" />
              <p v-else-if="claudeAdded" class="hint">
                {{ t(`settings.claudeRestart.${claudeAdded}`) }}
              </p>

              <!-- 2: Loxone Config (optional) -->
              <template v-if="configMcp">
                <h2>{{ t('settings.configTitle') }}</h2>
                <p class="hint">{{ t('settings.configIntro') }}</p>

                <template v-if="configMcp.shareAvailable">
                  <h3>{{ t('settings.shareTitle') }}</h3>
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

                <h3>{{ t('settings.remoteTitle') }}</h3>
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
                <Tag
                  v-else-if="remoteError"
                  class="remote-tag"
                  severity="danger"
                  :value="remoteError"
                />
                <p class="hint">{{ t('settings.remoteHint') }}</p>
                <p v-if="forgotExtension" class="hint">
                  <i class="pi pi-info-circle"></i> {{ t('settings.remoteForgotExtension') }}
                </p>
              </template>

              <!-- 3: what to ask -->
              <h2>{{ t('settings.tryTitle') }}</h2>
              <ul class="prompts">
                <li v-for="p in prompts" :key="p">
                  <code>{{ p }}</code> — {{ t(`settings.prompts.${p}`) }}
                </li>
              </ul>
              <p class="hint">{{ t('settings.tryHint') }}</p>

              <!-- 4: everything else, folded away -->
              <Panel :header="t('settings.advancedTitle')" toggleable collapsed class="advanced">
                <div class="tab">
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
                        :label="
                          copied === 'token' ? t('settings.mcpCopied') : t('settings.mcpCopy')
                        "
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
                  <template v-if="mcpSnippet">
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
                        :label="
                          copied === 'snippet' ? t('settings.mcpCopied') : t('settings.mcpCopy')
                        "
                        size="small"
                        severity="secondary"
                        @click="copyText(mcpSnippet, 'snippet')"
                      />
                    </div>
                  </template>
                  <p class="hint">{{ t('settings.mcpHint', { url: mcp.url }) }}</p>
                </div>
              </Panel>
            </div>
          </TabPanel>
        </TabPanels>
      </Tabs>
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
  grid-template-columns: 10rem minmax(0, 1fr);
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
h3 {
  margin: 0.5rem 0 0;
  font-size: 0.95rem;
}
.tab {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.intro {
  margin: 0;
}
.prompts {
  margin: 0;
  padding-left: 1.2rem;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.advanced {
  margin-top: 1rem;
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
