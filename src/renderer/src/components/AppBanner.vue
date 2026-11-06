<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import type { ClaudeClient } from '../../../shared/mcp-clients'
import type { UpdateCheck } from '../../../shared/types'

const { t } = useI18n()
const route = useRoute()

/** dismissing hides this version only — a newer release shows the banner again */
const DISMISSED_KEY = 'ldm.updateDismissed'
/** "Not now" on the Claude offer is final — Settings → AI stays the way to add it later */
const CLAUDE_DISMISSED_KEY = 'ldm.claudeOfferDismissed'

const update = ref<UpdateCheck | null>(null)
/** Claude apps installed here that don't have Lox DataManager yet */
const offer = ref<ClaudeClient[]>([])
const added = ref<ClaudeClient[]>([])
const bar = ref<HTMLElement>()

const label = (c: ClaudeClient): string => (c === 'claudeCode' ? 'Claude Code' : 'Claude Desktop')
const apps = computed(() => offer.value.map(label).join(t('banner.and')))

// one banner at a time: an update wins; the Claude offer never shows on Settings (it's right there)
const show = computed<'update' | 'claude' | 'added' | null>(() =>
  update.value
    ? 'update'
    : added.value.length
      ? 'added'
      : offer.value.length && route.path !== '/settings'
        ? 'claude'
        : null
)

// the app reserves the banner's height at the bottom, so scrolled-down content is never hidden
const reserve = new ResizeObserver(([e]) =>
  document.documentElement.style.setProperty(
    '--banner-space',
    `calc(${e.target.getBoundingClientRect().height}px + 1.25rem)`
  )
)
watch(bar, (el, old) => {
  if (old) reserve.unobserve(old)
  if (el) reserve.observe(el)
  else document.documentElement.style.removeProperty('--banner-space')
})

async function checkClaude(): Promise<void> {
  if (localStorage.getItem(CLAUDE_DISMISSED_KEY)) return void (offer.value = [])
  const r = await window.api.claude.get()
  if (r.ok)
    offer.value = r.data
      .filter((c) => c.servers['lox-datamanager'] === 'missing')
      .map((c) => c.client)
}

onMounted(async () => {
  // one check per launch (updates.ts); a failed check stays silent
  const r = await window.api.updates.check()
  if (r.ok && r.data.updateAvailable && localStorage.getItem(DISMISSED_KEY) !== r.data.latest) {
    update.value = r.data
  }
  await checkClaude()
})
// added in Settings meanwhile → don't offer it again
watch(
  () => route.path,
  (_to, from) => from === '/settings' && void checkClaude()
)
onBeforeUnmount(() => reserve.disconnect())

function dismiss(): void {
  if (update.value?.latest) localStorage.setItem(DISMISSED_KEY, update.value.latest)
  update.value = null
}

function notNow(): void {
  localStorage.setItem(CLAUDE_DISMISSED_KEY, '1')
  offer.value = []
}

async function addToClaude(): Promise<void> {
  // same as Settings → AI → Add: switch the server on, then write Claude's settings
  const m = await window.api.mcp.get()
  if (m.ok && !m.data.enabled) await window.api.mcp.configure(true, m.data.port)
  const done: ClaudeClient[] = []
  for (const c of offer.value) if ((await window.api.claude.add(c)).ok) done.push(c)
  offer.value = offer.value.filter((c) => !done.includes(c))
  added.value = done
}
</script>

<template>
  <div v-if="show" ref="bar" class="update-banner" role="status">
    <template v-if="show === 'update'">
      <i class="pi pi-sparkles"></i>
      <span>{{ t('update.available', { latest: update?.latest }) }}</span>
      <!-- setWindowOpenHandler in main/index.ts turns target=_blank into shell.openExternal -->
      <a :href="update?.url" target="_blank">{{ t('update.download') }}</a>
      <Button
        v-tooltip.top="t('update.dismiss')"
        icon="pi pi-times"
        size="small"
        severity="secondary"
        text
        rounded
        :aria-label="t('update.dismiss')"
        @click="dismiss"
      />
    </template>
    <template v-else-if="show === 'claude'">
      <span><i class="pi pi-sparkles"></i> {{ t('banner.claudeOffer', { apps }) }}</span>
      <Button
        :label="t('settings.claudeAdd')"
        size="small"
        severity="contrast"
        @click="addToClaude"
      />
      <Button
        v-tooltip.top="t('banner.notNowTip')"
        :label="t('banner.notNow')"
        size="small"
        severity="secondary"
        text
        @click="notNow"
      />
    </template>
    <template v-else>
      <span>
        <i class="pi pi-check"></i>
        <template v-if="added.includes('claudeCode')">
          {{ t('banner.added', { apps: 'Claude Code' }) }}
        </template>
        {{ added.includes('claudeDesktop') ? t('banner.confirmDesktop') : '' }}
      </span>
      <Button
        icon="pi pi-times"
        size="small"
        severity="secondary"
        text
        rounded
        :aria-label="t('banner.close')"
        @click="added = []"
      />
    </template>
  </div>
</template>

<style scoped>
.update-banner {
  position: fixed;
  left: 50%;
  bottom: 0.75rem;
  transform: translateX(-50%);
  z-index: 1000;
  max-width: calc(100% - 1.5rem);
  display: flex;
  align-items: center;
  gap: 0.25rem 0.75rem;
  padding: 0.4rem 0.5rem 0.4rem 1rem;
  border-radius: 1.25rem;
  background: var(--p-primary-color);
  color: var(--p-primary-contrast-color);
  box-shadow: 0 4px 16px rgb(0 0 0 / 0.25);
  font-size: 0.9rem;
}
.update-banner > span {
  /* only the text wraps; the buttons stay next to it */
  min-width: 0;
}
.update-banner :deep(.p-button) {
  flex-shrink: 0;
}
.update-banner .pi {
  margin-right: 0.25rem;
}
.update-banner a {
  color: inherit;
  font-weight: 600;
}
.update-banner :deep(.p-button-text) {
  color: inherit;
}
</style>
