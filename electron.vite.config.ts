import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import pkg from './package.json'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    // shown in Settings without waiting for the (network) update check
    define: { 'import.meta.env.APP_VERSION': JSON.stringify(pkg.version) },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [vue()]
  }
})
