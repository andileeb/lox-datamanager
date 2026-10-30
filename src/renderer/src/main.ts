import './assets/main.css'
import 'primeicons/primeicons.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'
import Tooltip from 'primevue/tooltip'
import Aura from '@primeuix/themes/aura'
import App from './App.vue'
import router from './router'
import { i18n } from './i18n'
import './theme' // applies the persisted/system dark-mode class

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(i18n)
app.use(PrimeVue, {
  theme: {
    preset: Aura,
    options: { darkModeSelector: '.app-dark' }
  }
})
app.directive('tooltip', Tooltip)
app.mount('#app')
