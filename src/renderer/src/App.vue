<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useEditorStore } from './stores/editor'
import { useFilesStore } from './stores/files'

const router = useRouter()

// Cmd+, (macOS) / Ctrl+, (Windows/Linux) opens the settings, like native apps
function onKeydown(e: KeyboardEvent): void {
  // the default menu's Cmd/Ctrl+R / F5 reloads the window and drops unsaved edits —
  // BrowserView maps them to "refresh file list" instead
  if (e.key === 'F5' || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'r')) {
    e.preventDefault()
    return
  }
  if ((e.metaKey || e.ctrlKey) && e.key === ',') {
    e.preventDefault()
    if (router.currentRoute.value.path !== '/settings') router.push('/settings')
  }
}

let offMcp: (() => void) | null = null

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  // keep the UI in sync when an MCP client changes files behind its back
  offMcp = window.api.onMcpActivity((a) => {
    const files = useFilesStore()
    const editor = useEditorStore()
    if (a.kind === 'save' || a.kind === 'download') void files.refreshCache()
    else void files.refresh()
    if (a.name && editor.data?.fileName === a.name) editor.externallyChanged = true
  })
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  offMcp?.()
})
</script>

<template>
  <router-view />
</template>
