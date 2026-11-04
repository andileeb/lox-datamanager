<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import type { UpdateCheck } from '../../../shared/types'

const { t } = useI18n()

/** dismissing hides this version only — a newer release shows the banner again */
const DISMISSED_KEY = 'ldm.updateDismissed'

const update = ref<UpdateCheck | null>(null)
const bar = ref<HTMLElement>()

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

onMounted(async () => {
  // one check per launch (updates.ts); a failed check stays silent
  const r = await window.api.updates.check()
  if (r.ok && r.data.updateAvailable && localStorage.getItem(DISMISSED_KEY) !== r.data.latest) {
    update.value = r.data
  }
})
onBeforeUnmount(() => reserve.disconnect())

function dismiss(): void {
  if (update.value?.latest) localStorage.setItem(DISMISSED_KEY, update.value.latest)
  update.value = null
}
</script>

<template>
  <div v-if="update" ref="bar" class="update-banner" role="status">
    <i class="pi pi-sparkles"></i>
    <span>{{ t('update.available', { latest: update.latest }) }}</span>
    <!-- setWindowOpenHandler in main/index.ts turns target=_blank into shell.openExternal -->
    <a :href="update.url" target="_blank">{{ t('update.download') }}</a>
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
  flex-wrap: wrap;
  gap: 0.25rem 0.75rem;
  padding: 0.4rem 0.5rem 0.4rem 1rem;
  border-radius: 999px;
  background: var(--p-primary-color);
  color: var(--p-primary-contrast-color);
  box-shadow: 0 4px 16px rgb(0 0 0 / 0.25);
  font-size: 0.9rem;
}
.update-banner a {
  color: inherit;
  font-weight: 600;
}
.update-banner :deep(.p-button) {
  color: inherit;
}
</style>
