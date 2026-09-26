<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { supabase } from '../lib/supabase'
import { fetchChatMessages, sendChatMessage, type ChatMessage } from '../lib/api'

interface Props {
  currentUsername: string
  currentUserId?: string
  playerLevel?: number
}

const props = withDefaults(defineProps<Props>(), {
  currentUsername: 'Lentäjä',
  currentUserId: '',
  playerLevel: 1
})

const isOpen = ref(false)
const showOnlineList = ref(false)
const inputMessage = ref('')
const isSending = ref(false)
const unreadCount = ref(0)
const messagesContainer = ref<HTMLElement | null>(null)

// Viestit ja paikallaolijat
const messages = ref<ChatMessage[]>([])
const onlineCount = ref(1)
const onlineUsers = ref<Array<{ name: string; level: number; joinedAt: string }>>([])

let chatChannel: any = null
let pollInterval: any = null

// Uniikki client-avain tälle istunnolle
const clientSessionKey = props.currentUserId 
  ? `${props.currentUserId}-${Math.random().toString(36).substring(2, 6)}`
  : `guest-${Math.random().toString(36).substring(2, 8)}`

// Ääniefekti saapuvalle viestille (Web Audio API, ei ulkoisia riippuvuuksia)
function playNotificationSound() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioContextClass) return
    const ctx = new AudioContextClass()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    
    osc.type = 'sine'
    osc.frequency.setValueAtTime(587.33, ctx.currentTime) // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12) // A5
    
    gain.gain.setValueAtTime(0.08, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2)
    
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.22)
  } catch {
    // Äänet eivät käytettävissä tai estetty selaimessa
  }
}

// Vieritä viestilista alareunaan
function scrollToBottom(smooth = true) {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTo({
        top: messagesContainer.value.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto'
      })
    }
  })
}

// Avaa / sulje chat
function toggleChat() {
  isOpen.value = !isOpen.value
  if (isOpen.value) {
    unreadCount.value = 0
    scrollToBottom(false)
  }
}

function closeChat() {
  isOpen.value = false
}

// Alusta viestit palvelimelta
async function loadHistory() {
  try {
    const list = await fetchChatMessages()
    if (list && list.length > 0) {
      messages.value = list
      if (isOpen.value) {
        scrollToBottom(false)
      }
    }
  } catch (err) {
    console.warn('Viestihistorian nouto epäonnistui:', err)
  }
}

// Alusta Supabase Realtime (Presence & Broadcast)
function initRealtime() {
  try {
    chatChannel = supabase.channel('pocket-planes-chat', {
      config: {
        presence: {
          key: clientSessionKey
        },
        broadcast: {
          self: false
        }
      }
    })

    // 1. Kuuntele saapuvia pikaviestejä
    chatChannel.on('broadcast', { event: 'new-message' }, ({ payload }: { payload: ChatMessage }) => {
      if (!payload || !payload.id) return
      
      // Vältetään duplikaatit
      if (!messages.value.some(m => m.id === payload.id)) {
        messages.value.push(payload)
        
        if (!isOpen.value) {
          unreadCount.value++
          playNotificationSound()
        } else {
          scrollToBottom(true)
        }
      }
    })

    // 2. Kuuntele paikallaoloa (Presence)
    chatChannel.on('presence', { event: 'sync' }, () => {
      const presenceState = chatChannel.presenceState()
      const users: Array<{ name: string; level: number; joinedAt: string }> = []
      
      for (const key of Object.keys(presenceState)) {
        const presences = presenceState[key] as any[]
        if (presences && presences.length > 0) {
          const userMeta = presences[0]
          users.push({
            name: userMeta.name || 'Lentäjä',
            level: userMeta.level || 1,
            joinedAt: userMeta.joinedAt || new Date().toISOString()
          })
        }
      }

      onlineUsers.value = users
      onlineCount.value = Math.max(1, users.length)
    })

    // 3. Tilaa kanava ja ilmoita oma paikallaolo
    chatChannel.subscribe(async (status: string) => {
      if (status === 'SUBSCRIBED') {
        await chatChannel.track({
          userId: props.currentUserId || clientSessionKey,
          name: props.currentUsername || 'Lentäjä',
          level: props.playerLevel || 1,
          joinedAt: new Date().toISOString()
        })
      }
    })
  } catch (err) {
    console.warn('Supabase Realtime -alustus epäonnistui:', err)
  }
}

// Lähetä viesti
async function handleSendMessage() {
  const text = inputMessage.value.trim()
  if (!text || isSending.value) return

  isSending.value = true
  const senderName = props.currentUsername || 'Lentäjä'
  const playerLvl = props.playerLevel || 1

  try {
    // 1. Tallenna viesti palvelimelle
    const savedMessage = await sendChatMessage(text, senderName, playerLvl, props.currentUserId)

    // 2. Lisää paikallisesti, jos ei vielä ole
    if (!messages.value.some(m => m.id === savedMessage.id)) {
      messages.value.push(savedMessage)
    }

    // 3. Lähetä heti reaaliaikaisesti muille Supabase Broadcastilla
    if (chatChannel) {
      chatChannel.send({
        type: 'broadcast',
        event: 'new-message',
        payload: savedMessage
      })
    }

    inputMessage.value = ''
    scrollToBottom(true)
  } catch (err: any) {
    console.error('Virhe viestin lähetyksessä:', err)
    // Lisätään varoitusviesti paikallisesti
    const fallbackMessage: ChatMessage = {
      id: `local-${Date.now()}`,
      sender: senderName,
      text: text,
      taso: playerLvl,
      timestamp: Date.now()
    }
    messages.value.push(fallbackMessage)
    inputMessage.value = ''
    scrollToBottom(true)
  } finally {
    isSending.value = false
  }
}

function lisaaEmoji(emoji: string) {
  inputMessage.value += emoji
}

function formatAika(ts: number | string): string {
  try {
    const d = new Date(ts)
    if (isNaN(d.getTime())) return ''
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

// Päivitä presence kun käyttäjän nimi tai taso muuttuu
watch(
  () => [props.currentUsername, props.playerLevel],
  async () => {
    if (chatChannel && chatChannel.state === 'joined') {
      try {
        await chatChannel.track({
          userId: props.currentUserId || clientSessionKey,
          name: props.currentUsername || 'Lentäjä',
          level: props.playerLevel || 1,
          joinedAt: new Date().toISOString()
        })
      } catch {}
    }
  }
)

onMounted(async () => {
  await loadHistory()
  initRealtime()

  // Polling-varmistus: Päivitä taustalta viestit 20s välein
  pollInterval = setInterval(async () => {
    try {
      const fresh = await fetchChatMessages()
      if (fresh && fresh.length > 0) {
        // Lisätään puuttuvat
        let added = false
        for (const msg of fresh) {
          if (!messages.value.some(m => m.id === msg.id)) {
            messages.value.push(msg)
            added = true
            if (!isOpen.value) unreadCount.value++
          }
        }
        if (added && isOpen.value) {
          scrollToBottom(true)
        }
      }
    } catch {}
  }, 20000)
})

onUnmounted(() => {
  if (chatChannel) {
    supabase.removeChannel(chatChannel)
  }
  if (pollInterval) {
    clearInterval(pollInterval)
  }
})
</script>

<template>
  <div class="chat-widget-root">
    <!-- PIENI ALAPALKKI: VIHREÄ PISTE JA ONLINE-PELAAJIEN MÄÄRÄ -->
    <div
      class="chat-bottom-bar"
      :class="{ 'bar-active': isOpen }"
      @click="toggleChat"
      title="Napsauta avataksesi tai sulkeaksesi keskusteluikkunan"
    >
      <div class="online-indicator">
        <span class="online-dot"></span>
        <span class="online-pulse"></span>
      </div>

      <div class="chat-bar-info">
        <span class="online-count">{{ onlineCount }}</span>
        <span class="online-text">{{ onlineCount === 1 ? 'pelaaja online' : 'pelaajaa online' }}</span>
      </div>

      <div class="chat-bar-divider"></div>

      <div class="chat-bar-cta">
        <span class="chat-icon">💬</span>
        <span class="chat-label">Chat</span>
      </div>

      <!-- Lukemattomien viestien huomiolappu -->
      <span v-if="unreadCount > 0 && !isOpen" class="chat-unread-badge">
        +{{ unreadCount }}
      </span>

      <span class="bar-toggle-chevron">
        {{ isOpen ? '▼' : '▲' }}
      </span>
    </div>

    <!-- CHAT-IKKUNA (EI VIE KOKO RUUTUA) -->
    <transition name="chat-slide">
      <div v-if="isOpen" class="chat-window" @click.stop>
        <!-- YLÄPALKKI -->
        <div class="chat-header">
          <div class="chat-header-title-box">
            <div class="header-indicator">
              <span class="online-dot"></span>
            </div>
            <div>
              <div class="chat-title">
                ✈️ Lentäjä-Chat
              </div>
              <div class="chat-subtitle">
                {{ onlineCount }} {{ onlineCount === 1 ? 'pelaaja' : 'pelaajaa' }} linjoilla
              </div>
            </div>
          </div>

          <div class="chat-header-actions">
            <!-- Nappi paikallaolijoiden tarkasteluun -->
            <button
              class="header-action-btn"
              :class="{ 'action-active': showOnlineList }"
              @click="showOnlineList = !showOnlineList"
              title="Näytä paikalla olevat lentäjät"
            >
              👥
            </button>
            <button class="header-action-btn close-btn" @click="closeChat" title="Pienennä chat">
              ✕
            </button>
          </div>
        </div>

        <!-- PAIKALLAOLIJAT -LISTA (POPOVER / SUB-BAR) -->
        <transition name="fade">
          <div v-if="showOnlineList" class="online-users-drawer">
            <div class="drawer-header">
              <span>Aktiiviset lentäjät juuri nyt:</span>
              <span class="drawer-count">{{ onlineUsers.length || onlineCount }}</span>
            </div>
            <div class="online-chips">
              <span
                v-for="(u, idx) in onlineUsers"
                :key="idx"
                class="online-chip"
                :class="{ 'own-chip': u.name === currentUsername }"
              >
                <span class="chip-dot"></span>
                <span class="chip-name">{{ u.name }}</span>
                <span class="chip-level">⭐ {{ u.level || 1 }}</span>
              </span>
              <span v-if="onlineUsers.length === 0" class="online-chip own-chip">
                <span class="chip-dot"></span>
                <span class="chip-name">{{ currentUsername || 'Sinä' }}</span>
                <span class="chip-level">⭐ {{ playerLevel || 1 }}</span>
              </span>
            </div>
          </div>
        </transition>

        <!-- VIESTILISTA -->
        <div ref="messagesContainer" class="chat-messages-area">
          <div v-if="messages.length === 0" class="chat-empty-state">
            <div class="empty-icon">📻</div>
            <div class="empty-title">Pocket Planes Radiotaajuus</div>
            <div class="empty-desc">
              Ei vielä viestejä. Lähetä ensimmäinen tervehdys muille piloteille alla olevasta kentästä!
            </div>
          </div>

          <div
            v-for="msg in messages"
            :key="msg.id"
            class="chat-message-row"
            :class="{ 'is-me': msg.sender === currentUsername || (currentUserId && msg.userId === currentUserId) }"
          >
            <div class="message-bubble">
              <div class="message-meta">
                <span class="sender-name">
                  {{ msg.sender === currentUsername ? 'Sinä' : msg.sender }}
                </span>
                <span v-if="msg.taso" class="sender-level-badge">
                  ⭐ {{ msg.taso }}
                </span>
                <span class="message-time">
                  {{ formatAika(msg.timestamp) }}
                </span>
              </div>
              <div class="message-text">
                {{ msg.text }}
              </div>
            </div>
          </div>
        </div>

        <!-- PIKA-EMOJIT -->
        <div class="chat-quick-emojis">
          <button type="button" @click="lisaaEmoji('✈️')" title="Lentokone">✈️</button>
          <button type="button" @click="lisaaEmoji('🛫')" title="Nousu">🛫</button>
          <button type="button" @click="lisaaEmoji('💰')" title="Rahat">💰</button>
          <button type="button" @click="lisaaEmoji('🏆')" title="Voitto">🏆</button>
          <button type="button" @click="lisaaEmoji('👋')" title="Moi">👋</button>
          <button type="button" @click="lisaaEmoji('⭐')" title="Tähti">⭐</button>
        </div>

        <!-- SYÖTTEEN LÄHETYS -->
        <form class="chat-input-bar" @submit.prevent="handleSendMessage">
          <input
            v-model="inputMessage"
            type="text"
            placeholder="Kirjoita viesti lentäjille..."
            maxlength="300"
            :disabled="isSending"
            class="chat-text-input"
          />
          <button
            type="submit"
            class="chat-send-btn"
            :disabled="!inputMessage.trim() || isSending"
            title="Lähetä viesti (Enter)"
          >
            <span v-if="!isSending">➤</span>
            <span v-else class="sending-spinner"></span>
          </button>
        </form>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.chat-widget-root {
  position: relative;
  z-index: 950;
  font-family: var(--font-main, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
}

/* ==========================================================================
   ALAPALKKI: VIHREÄ PISTE JA ONLINE-PELAAJIEN MÄÄRÄ
   ========================================================================== */
.chat-bottom-bar {
  position: fixed;
  bottom: 22px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(13, 22, 36, 0.94);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid rgba(0, 200, 255, 0.35);
  border-radius: 9999px;
  padding: 8px 18px;
  cursor: pointer;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.65), 0 0 16px rgba(0, 200, 255, 0.15);
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  user-select: none;
  z-index: 950;
}

.chat-bottom-bar:hover {
  transform: translateX(-50%) translateY(-2px);
  border-color: rgba(0, 229, 255, 0.7);
  box-shadow: 0 12px 34px rgba(0, 0, 0, 0.75), 0 0 24px rgba(0, 229, 255, 0.3);
  background: rgba(16, 28, 46, 0.96);
}

.chat-bottom-bar.bar-active {
  border-color: #00e5ff;
  box-shadow: 0 0 20px rgba(0, 229, 255, 0.4);
  background: rgba(14, 26, 44, 0.98);
}

/* VIHREÄ PISTE JA PULSSIANIMAATIO */
.online-indicator {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
}

.online-dot {
  width: 10px;
  height: 10px;
  background: #00e676;
  border-radius: 50%;
  box-shadow: 0 0 8px #00e676;
  z-index: 2;
}

.online-pulse {
  position: absolute;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: rgba(0, 230, 118, 0.5);
  animation: pulse-ring 2s infinite ease-out;
  z-index: 1;
}

@keyframes pulse-ring {
  0% {
    transform: scale(0.8);
    opacity: 0.9;
  }
  70% {
    transform: scale(2.2);
    opacity: 0;
  }
  100% {
    transform: scale(2.4);
    opacity: 0;
  }
}

.chat-bar-info {
  display: flex;
  align-items: baseline;
  gap: 5px;
}

.online-count {
  font-weight: 800;
  font-size: 0.96rem;
  color: #00e676;
  font-family: monospace;
}

.online-text {
  font-size: 0.82rem;
  color: #c9d6df;
  font-weight: 600;
  letter-spacing: 0.3px;
}

.chat-bar-divider {
  width: 1px;
  height: 16px;
  background: rgba(255, 255, 255, 0.18);
  margin: 0 2px;
}

.chat-bar-cta {
  display: flex;
  align-items: center;
  gap: 5px;
}

.chat-icon {
  font-size: 0.95rem;
}

.chat-label {
  font-size: 0.86rem;
  font-weight: 700;
  color: #00e5ff;
  letter-spacing: 0.4px;
}

.chat-unread-badge {
  background: linear-gradient(135deg, #ff1744, #d50000);
  color: #fff;
  font-size: 0.72rem;
  font-weight: 800;
  padding: 2px 7px;
  border-radius: 10px;
  box-shadow: 0 0 10px rgba(255, 23, 68, 0.7);
  animation: bounce 1.5s infinite;
}

@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
}

.bar-toggle-chevron {
  font-size: 0.65rem;
  color: #64b5f6;
  margin-left: 2px;
  transition: transform 0.2s ease;
}

/* ==========================================================================
   CHAT-IKKUNA (KOMPAKTI, EI KOKO RUUDUN KOKOINEN)
   ========================================================================== */
.chat-window {
  position: fixed;
  bottom: 74px;
  left: 50%;
  transform: translateX(-50%);
  width: 380px;
  max-width: calc(100vw - 32px);
  height: 480px;
  max-height: calc(100vh - 130px);
  background: rgba(14, 23, 38, 0.96);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(0, 200, 255, 0.35);
  border-radius: 18px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.75), 0 0 28px rgba(0, 180, 255, 0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 960;
}

/* YLÄPALKKI */
.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: rgba(8, 14, 24, 0.75);
  border-bottom: 1px solid rgba(0, 180, 255, 0.2);
}

.chat-header-title-box {
  display: flex;
  align-items: center;
  gap: 10px;
}

.header-indicator {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.chat-title {
  font-size: 0.96rem;
  font-weight: 800;
  color: #e0f7fa;
  letter-spacing: 0.3px;
}

.chat-subtitle {
  font-size: 0.72rem;
  color: #00e676;
  font-weight: 600;
}

.chat-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-action-btn {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #c9d6df;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
  transition: all 0.2s ease;
}

.header-action-btn:hover {
  background: rgba(0, 229, 255, 0.2);
  border-color: #00e5ff;
  color: #fff;
}

.header-action-btn.action-active {
  background: rgba(0, 229, 255, 0.3);
  border-color: #00e5ff;
  color: #fff;
}

.close-btn {
  font-size: 1rem;
  font-weight: 700;
}

.close-btn:hover {
  background: rgba(239, 83, 80, 0.3);
  border-color: #ef5350;
  color: #ff8a80;
}

/* PAIKALLAOLIJAT */
.online-users-drawer {
  background: rgba(6, 11, 20, 0.95);
  border-bottom: 1px solid rgba(0, 180, 255, 0.25);
  padding: 10px 14px;
}

.drawer-header {
  display: flex;
  justify-content: space-between;
  font-size: 0.74rem;
  color: #90caf9;
  font-weight: 600;
  margin-bottom: 8px;
}

.drawer-count {
  background: rgba(0, 230, 118, 0.2);
  color: #00e676;
  padding: 1px 7px;
  border-radius: 10px;
  font-weight: 800;
}

.online-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-height: 80px;
  overflow-y: auto;
}

.online-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  padding: 3px 8px;
  font-size: 0.72rem;
  color: #e0e0e0;
}

.online-chip.own-chip {
  background: rgba(0, 180, 255, 0.15);
  border-color: rgba(0, 229, 255, 0.4);
  color: #00e5ff;
}

.chip-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #00e676;
}

.chip-name {
  font-weight: 700;
}

.chip-level {
  font-size: 0.65rem;
  color: #ffd54f;
}

/* VIESTIT */
.chat-messages-area {
  flex: 1;
  padding: 14px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  scroll-behavior: smooth;
}

.chat-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  margin: auto;
  padding: 20px 10px;
}

.empty-icon {
  font-size: 2.2rem;
  margin-bottom: 8px;
  filter: drop-shadow(0 0 10px rgba(0, 229, 255, 0.4));
}

.empty-title {
  font-size: 0.95rem;
  font-weight: 800;
  color: #64b5f6;
  margin-bottom: 4px;
}

.empty-desc {
  font-size: 0.78rem;
  color: #90a4ae;
  line-height: 1.4;
  max-width: 260px;
}

.chat-message-row {
  display: flex;
  width: 100%;
}

.chat-message-row.is-me {
  justify-content: flex-end;
}

.message-bubble {
  max-width: 82%;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 14px 14px 14px 4px;
  padding: 8px 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
  word-break: break-word;
}

.chat-message-row.is-me .message-bubble {
  background: linear-gradient(135deg, #0288d1 0%, #0077b6 100%);
  border-color: rgba(0, 229, 255, 0.45);
  border-radius: 14px 14px 4px 14px;
  box-shadow: 0 4px 14px rgba(0, 119, 182, 0.4);
}

.message-meta {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 3px;
}

.sender-name {
  font-weight: 800;
  font-size: 0.74rem;
  color: #81d4fa;
}

.chat-message-row.is-me .sender-name {
  color: #e0f7fa;
}

.sender-level-badge {
  font-size: 0.65rem;
  font-weight: 700;
  color: #ffd54f;
  background: rgba(0, 0, 0, 0.25);
  padding: 1px 4px;
  border-radius: 6px;
}

.message-time {
  font-size: 0.65rem;
  color: #78909c;
  margin-left: auto;
  font-family: monospace;
}

.chat-message-row.is-me .message-time {
  color: #b2ebf2;
}

.message-text {
  font-size: 0.86rem;
  line-height: 1.35;
  color: #f5f5f5;
}

/* PIKA-EMOJIT */
.chat-quick-emojis {
  display: flex;
  gap: 6px;
  padding: 6px 14px;
  background: rgba(7, 13, 22, 0.85);
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.chat-quick-emojis button {
  background: transparent;
  border: none;
  font-size: 1.1rem;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 6px;
  transition: transform 0.15s, background 0.15s;
}

.chat-quick-emojis button:hover {
  background: rgba(255, 255, 255, 0.1);
  transform: scale(1.25);
}

/* SYÖTTEEN LÄHETYS */
.chat-input-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: rgba(7, 13, 22, 0.95);
  border-top: 1px solid rgba(0, 180, 255, 0.2);
}

.chat-text-input {
  flex: 1;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 10px;
  padding: 9px 12px;
  color: #fff;
  font-size: 0.86rem;
  outline: none;
  transition: border-color 0.2s, background 0.2s;
}

.chat-text-input:focus {
  border-color: #00e5ff;
  background: rgba(255, 255, 255, 0.12);
  box-shadow: 0 0 10px rgba(0, 229, 255, 0.25);
}

.chat-text-input::placeholder {
  color: #78909c;
  font-size: 0.82rem;
}

.chat-send-btn {
  background: linear-gradient(135deg, #00b0ff, #0091ea);
  border: none;
  border-radius: 10px;
  color: white;
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0, 176, 255, 0.4);
  transition: all 0.2s ease;
}

.chat-send-btn:hover:not(:disabled) {
  transform: scale(1.06);
  background: linear-gradient(135deg, #40c4ff, #00b0ff);
  box-shadow: 0 6px 16px rgba(0, 176, 255, 0.6);
}

.chat-send-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  box-shadow: none;
}

.sending-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ANIMAATIOT */
.chat-slide-enter-active,
.chat-slide-leave-active {
  transition: all 0.28s cubic-bezier(0.16, 1, 0.3, 1);
}

.chat-slide-enter-from,
.chat-slide-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(20px) scale(0.96);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* RESPONSIIVISUUS */
@media (max-width: 600px) {
  .chat-bottom-bar {
    bottom: 12px;
    padding: 7px 14px;
    gap: 8px;
  }
  .online-text {
    display: none;
  }
  .chat-window {
    bottom: 64px;
    width: calc(100vw - 20px);
    height: 420px;
  }
}
</style>
