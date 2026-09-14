// src/main.ts
// This is a REFERENCE file - merge the two highlighted lines into your
// existing main.ts, don't just overwrite it if you have other setup there.

import { createApp } from 'vue'
import App from './App.vue'
import router from './router'          // <-- add this
import './style.css'                    // keep whatever global styles you already import

const app = createApp(App)
app.use(router)                         // <-- add this
app.mount('#app')