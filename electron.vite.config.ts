import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import pkg from './package.json'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        // bridge.js goes into the Claude Desktop extension (main/claude-clients.ts) — self-contained
        input: { index: resolve('src/main/index.ts'), bridge: resolve('src/bridge/index.ts') }
      }
    }
  },
  preload: {},
  renderer: {
    // shown in Settings without waiting for the (network) update check
    define: { 'import.meta.env.APP_VERSION': JSON.stringify(pkg.version) },
    plugins: [vue()]
  }
})
