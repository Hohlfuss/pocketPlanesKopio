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

export async function fetchLeaderboard() {
  const res = await fetch('/api/leaderboard')
  if (!res.ok) {
    throw new Error('Tulostaulun haku epäonnistui')
  }
  const data = await res.json()
  return data.leaderboard || []
}
