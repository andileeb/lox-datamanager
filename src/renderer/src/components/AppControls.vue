<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import SelectButton from 'primevue/selectbutton'
import { setLocale, type AppLocale } from '../i18n'
import { isDark, toggleDark } from '../theme'

const router = useRouter()
const { t, locale } = useI18n()

const localeModel = computed({
  get: () => locale.value as AppLocale,
  set: (v: AppLocale) => setLocale(v)
})
const localeOptions = [
  { label: 'EN', value: 'en' },
  { label: 'DE', value: 'de' }
]
</script>

<template>
  <div class="app-controls">
    <SelectButton
      v-model="localeModel"
      v-tooltip.bottom="t('browser.tipLanguage')"
      :options="localeOptions"
      option-label="label"
      option-value="value"
      :allow-empty="false"
      size="small"
      class="lang-switch"
    />
    <Button
      v-tooltip.bottom="t('browser.tipTheme')"
      :icon="isDark ? 'pi pi-sun' : 'pi pi-moon'"
      text
      severity="secondary"
      :aria-label="t('browser.tipTheme')"
      @click="toggleDark"
    />
    <Button
      v-tooltip.bottom="t('settings.title')"
      icon="pi pi-cog"
      text
      severity="secondary"
      :aria-label="t('settings.title')"
      @click="router.push('/settings')"
    />
  </div>
</template>

<style scoped>
.app-controls {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}
</style>
