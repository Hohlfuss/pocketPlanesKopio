// src/lib/api.ts
import { supabase } from './supabase'

async function getAuthHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  }
}

export async function fetchGameState() {
  const headers = await getAuthHeaders()
  const res = await fetch('/api/game/state', {
    method: 'GET',
    headers
  })

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.error || 'Pelitilan haku palvelimelta epäonnistui')
  }

  return res.json()
}

export async function sendGameAction(action: string, payload?: any) {
  const headers = await getAuthHeaders()
  const res = await fetch('/api/game/action', {
    method: 'POST',
    headers,
    body: JSON.stringify({ action, payload })
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Toiminnon suoritus epäonnistui')
  }

  return data
}

export async function fetchLeaderboard(sortBy: string = 'rahat') {
  const res = await fetch(`/api/leaderboard?sortBy=${encodeURIComponent(sortBy)}`)
  if (!res.ok) {
    throw new Error('Tulostaulun haku epäonnistui')
  }
  const data = await res.json()
  return data.leaderboard || []
}

export interface ChatMessage {
  id: string
  userId?: string
  sender: string
  text: string
  taso?: number
  timestamp: number
}

export async function fetchChatMessages(): Promise<ChatMessage[]> {
  try {
    const res = await fetch('/api/chat/messages')
    if (!res.ok) {
      return []
    }
    const data = await res.json()
    return data.messages || []
  } catch (err) {
    console.warn('Chat-viestien haku epäonnistui:', err)
    return []
  }
}

export async function sendChatMessage(text: string, sender: string, taso?: number, userId?: string): Promise<ChatMessage> {
  const res = await fetch('/api/chat/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ text, sender, taso, userId })
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Viestin lähetys epäonnistui')
  }

  const data = await res.json()
  return data.message
}

