// server/db/storage.ts
import type { GameState } from '../types'
import { supabaseAdmin } from '../middleware/auth'
import { luoAlkutila, tickGameState } from '../game/gameEngine'

// Muistivälimuisti aktiivisille pelaajille nopeaan käsittelyyn ja rinnakkaisuuden hallintaan
const stateCache = new Map<string, GameState>()

export async function loadGameState(userId: string, username: string): Promise<GameState> {
  // 1. Tarkistetaan muistivälimuisti
  if (stateCache.has(userId)) {
    const cached = stateCache.get(userId)!
    cached.pelaajanNimi = username || cached.pelaajanNimi
    tickGameState(cached)
    return cached
  }

  // 2. Haetaan Supabasesta
  try {
    const { data, error } = await supabaseAdmin
      .from('game_saves')
      .select('game_state')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      console.warn('Virhe pelitilan haussa Supabasesta:', error.message)
    }

    if (data?.game_state) {
      const state = data.game_state as GameState
      state.userId = userId
      state.pelaajanNimi = username || state.pelaajanNimi || 'Pelaaja'

      // Varmistetaan uudet kentät, jos kyseessä on vanha tallenne
      if (typeof state.lastHataapuClaimedAt !== 'number') {
        state.lastHataapuClaimedAt = 0
      }
      if (typeof state.hataapuCooldownJaljella !== 'number') {
        state.hataapuCooldownJaljella = 0
      }
      if (!state.lastPassengerRefreshAt) {
        state.lastPassengerRefreshAt = Date.now()
      }

      // Suoritetaan simulaation catch-up
      tickGameState(state)
      stateCache.set(userId, state)
      return state
    }
  } catch (err: any) {
    console.error('Poikkeus tietokantahaussa:', err)
  }

  // 3. Luodaan uusi alkutila, jos tallennusta ei löytynyt
  const newState = luoAlkutila(userId, username)
  stateCache.set(userId, newState)
  await saveGameState(newState)
  return newState
}

export async function saveGameState(state: GameState): Promise<void> {
  state.lastUpdated = Date.now()
  stateCache.set(state.userId, state)

  try {
    // Tallennetaan pelitila
    const { error: saveError } = await supabaseAdmin
      .from('game_saves')
      .upsert({
        user_id: state.userId,
        game_state: state
      }, { onConflict: 'user_id' })

    if (saveError) {
      console.warn('Virhe pelitilan tallennuksessa Supabaseen:', saveError.message)
    }

    // Päivitetään palvelimen toimesta virallinen tulostaulu (Leaderboard)
    const { error: lbError } = await supabaseAdmin
      .from('leaderboard')
      .upsert({
        user_id: state.userId,
        pelaajan_nimi: state.pelaajanNimi,
        rahat: state.rahat,
        kulta: state.kulta
      }, { onConflict: 'user_id' })

    if (lbError) {
      console.warn('Virhe tulostaulun päivityksessä:', lbError.message)
    }
  } catch (err: any) {
    console.error('Poikkeus pelitilan tallennuksessa:', err)
  }
}

export async function getLeaderboard(): Promise<any[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('leaderboard')
      .select('*')
      .order('rahat', { ascending: false })
      .limit(20)

    if (error) {
      console.warn('Virhe tulostaulun haussa:', error.message)
      return []
    }
    return data || []
  } catch (err: any) {
    console.error('Poikkeus tulostaulun haussa:', err)
    return []
  }
}
