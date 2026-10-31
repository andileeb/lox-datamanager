<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Message from 'primevue/message'
import type { ApiError } from '../../../shared/types'
import { errorText } from '../i18n'

/** "uploaded — restart + clear the app cache" checklist, with an optional restart button */
const visible = defineModel<boolean>('visible', { required: true })
const { t } = useI18n()

const restart = ref<'idle' | 'confirm' | 'busy' | 'done'>('idle')
const error = ref<ApiError | null>(null)

watch(visible, (v) => {
  if (v) {
    restart.value = 'idle'
    error.value = null
  }
})

async function doRestart(): Promise<void> {
  restart.value = 'busy'
  error.value = null
  const r = await window.api.miniserver.reboot()
  if (r.ok) restart.value = 'done'
  else {
    error.value = r.error
    restart.value = 'idle'
  }
}
</script>

<template>
  <Dialog
    v-model:visible="visible"
    :header="t('editor.postUploadTitle')"
    modal
    :style="{ width: '30rem' }"
  >
    <p>{{ t('editor.postUploadIntro') }}</p>
    <ol class="checklist">
      <li>
        <!-- eslint-disable-next-line vue/no-v-html -->
        <span v-html="t('editor.postUploadStep1')"></span>
        <div class="restart">
          <Button
            v-if="restart === 'idle'"
            :label="t('restart.now')"
            icon="pi pi-power-off"
            size="small"
            severity="secondary"
            @click="restart = 'confirm'"
          />
          <template v-else-if="restart === 'confirm' || restart === 'busy'">
            <p class="warn">{{ t('restart.confirm') }}</p>
            <div class="row">
              <Button
                :label="t('formula.cancel')"
                size="small"
                severity="secondary"
                text
                :disabled="restart === 'busy'"
                @click="restart = 'idle'"
              />
              <Button
                :label="t('restart.confirmButton')"
                icon="pi pi-power-off"
                size="small"
                severity="danger"
                :loading="restart === 'busy'"
                @click="doRestart"
              />
            </div>
          </template>
          <Message v-else severity="success" :closable="false">{{ t('restart.done') }}</Message>
          <Message v-if="error" severity="error" :closable="false">{{ errorText(error) }}</Message>
        </div>
      </li>
      <!-- eslint-disable-next-line vue/no-v-html -->
      <li v-html="t('editor.postUploadStep2')"></li>
    </ol>
    <template #footer>
      <Button :label="t('editor.gotIt')" @click="visible = false" />
    </template>
  </Dialog>
</template>

<style scoped>
.checklist {
  margin: 0.5rem 0 0 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.restart {
  margin-top: 0.5rem;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.5rem;
}
.restart .row {
  display: flex;
  gap: 0.5rem;
}
.warn {
  margin: 0;
  color: var(--p-orange-500);
}
</style>
