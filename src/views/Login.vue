<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { loginWithUsername } from '../lib/auth'

const router = useRouter()
const username = ref('')
const password = ref('')
const ilmoitus = ref('')
const ladataan = ref(false)

const kirjaudu = async () => {
  if (!username.value || !password.value) {
    ilmoitus.value = 'Täytä molemmat kentät'
    return
  }
  ladataan.value = true
  ilmoitus.value = ''
  const { error } = await loginWithUsername(username.value, password.value)
  ladataan.value = false
  if (error) {
    ilmoitus.value = error.message
    return
  }
  router.push({ name: 'game' })
}
</script>

<template>
  <div class="auth-page">
    <div class="auth-card">
      <h1>Kirjaudu sisään</h1>
      <div class="input-ryhma">
        <input v-model="username" type="text" placeholder="Käyttäjänimi" @keyup.enter="kirjaudu" />
        <input v-model="password" type="password" placeholder="Salasana" @keyup.enter="kirjaudu" />
      </div>
      <div v-if="ilmoitus" class="auth-ilmoitus">{{ ilmoitus }}</div>
      <button class="auth-submit-nappi" :disabled="ladataan" @click="kirjaudu">
        {{ ladataan ? 'Kirjaudutaan...' : 'Kirjaudu' }}
      </button>
      <p class="vaihda-tila">
        Eikö sinulla ole tiliä?
        <router-link to="/register">Luo tili</router-link>
      </p>
    </div>
  </div>
</template>

<style scoped>
.auth-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #0f172a; }
.auth-card { background: #1a1a2e; padding: 30px; border-radius: 12px; border: 2px solid #2980b9; width: 90%; max-width: 380px; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.8); }
.input-ryhma { display: flex; flex-direction: column; gap: 12px; margin: 20px 0; }
.input-ryhma input { padding: 12px; border-radius: 6px; border: 1px solid #444; background: #0f172a; color: #fff; font-size: 1rem; }
.input-ryhma input:focus { border-color: #64b5f6; outline: none; }
.auth-submit-nappi { width: 100%; padding: 12px; background: #4caf50; color: white; border: none; font-weight: bold; font-size: 1.1rem; border-radius: 6px; cursor: pointer; transition: 0.2s; }
.auth-submit-nappi:hover:not(:disabled) { background: #45a049; }
.auth-submit-nappi:disabled { opacity: 0.6; cursor: not-allowed; }
.auth-ilmoitus { color: #ff9800; margin-bottom: 15px; font-weight: bold; }
.vaihda-tila { margin-top: 18px; color: #aaa; font-size: 0.9rem; }
.vaihda-tila a { color: #64b5f6; text-decoration: underline; }
</style>