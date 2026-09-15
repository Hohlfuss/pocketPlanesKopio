// server/db/storage.ts
import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import type { GameState, LeaderboardEntry } from '../types'
import { supabaseAdmin } from '../middleware/auth'
import { luoAlkutila, tickGameState } from '../game/gameEngine'
import { alkuperaisetOstettavatKentat } from '../game/gameData'

// Muistivälimuisti aktiivisille pelaajille nopeaan käsittelyyn ja rinnakkaisuuden hallintaan
const stateCache = new Map<string, GameState>()

// Säilytetään pelaajakohtaiset Bearer-tokenit Supabase RLS -toimintaa varten
const userTokens = new Map<string, string>()

// Paikallinen pysyvä välimuisti tulostaulukolle
const DATA_DIR = path.join(process.cwd(), 'server', 'data')
const LEADERBOARD_FILE = path.join(DATA_DIR, 'leaderboard.json')
const leaderboardCache = new Map<string, LeaderboardEntry>()

// Ladataan tulostaulukko tiedostosta palvelimen käynnistyessä
function loadLeaderboardFromFile() {
  try {
    if (fs.existsSync(LEADERBOARD_FILE)) {
      const content = fs.readFileSync(LEADERBOARD_FILE, 'utf-8')
      const entries: LeaderboardEntry[] = JSON.parse(content)
      for (const entry of entries) {
        if (entry.userId) {
          leaderboardCache.set(entry.userId, entry)
        }
      }
    }
  } catch (err: any) {
    console.warn('Virhe tulostaulutiedoston lukemisessa:', err.message)
  }
}
loadLeaderboardFromFile()

export function clearLeaderboardCacheForTesting() {
  leaderboardCache.clear()
  if (fs.existsSync(LEADERBOARD_FILE)) {
    try {
      fs.unlinkSync(LEADERBOARD_FILE)
    } catch {}
  }
}

function saveLeaderboardToFile() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true })
    }
    const entries = Array.from(leaderboardCache.values())
    fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(entries, null, 2), 'utf-8')
  } catch (err: any) {
    console.warn('Virhe tulostaulutiedoston kirjoittamisessa:', err.message)
  }
}

// Apufunktio: Hae oikea Supabase-asiakas (huomioi käyttäjän token RLS:ää varten)
function getSupabaseClient(userId?: string, token?: string) {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return supabaseAdmin
  }

  const activeToken = token || (userId ? userTokens.get(userId) : undefined)
  if (activeToken) {
    const supabaseUrl = process.env.SUPABASE_URL || 'https://xalwsdeeujyhoqygcoul.supabase.co'
    const anonKey = process.env.SUPABASE_ANON_KEY || 'sb_publishable_r6j0Nf2Y0ndCMqZyzgtVVQ_J1OKjsCv'
    return createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${activeToken}` } }
    })
  }

  return supabaseAdmin
}

export async function loadGameState(userId: string, username: string, token?: string): Promise<GameState> {
  if (token) {
    userTokens.set(userId, token)
  }

  // 1. Tarkistetaan muistivälimuisti
  if (stateCache.has(userId)) {
    const cached = stateCache.get(userId)!
    cached.pelaajanNimi = username || cached.pelaajanNimi
    tickGameState(cached)
    updateLeaderboardEntry(cached, token)
    return cached
  }

  // 2. Haetaan Supabasesta käyttäjän oikeuksilla
  const client = getSupabaseClient(userId, token)
  try {
    const { data, error } = await client
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
      if (typeof state.taso !== 'number' || state.taso < 1) {
        state.taso = 1
      }
      if (typeof state.xp !== 'number' || state.xp < 0) {
        state.xp = 0
      }
      if (typeof state.lastHataapuClaimedAt !== 'number') {
        state.lastHataapuClaimedAt = 0
      }
      if (typeof state.hataapuCooldownJaljella !== 'number') {
        state.hataapuCooldownJaljella = 0
      }
      if (typeof state.lastEtsintaAt !== 'number') {
        state.lastEtsintaAt = 0
      }
      if (typeof state.etsintaCooldownJaljella !== 'number') {
        state.etsintaCooldownJaljella = 0
      }
      if (!state.lastPassengerRefreshAt) {
        state.lastPassengerRefreshAt = Date.now()
      }

      // Varmistetaan, että uudet pelin lentokentät lisätään ostettavien listaan vanhoillekin tallennuksille
      if (!Array.isArray(state.ostettavatKentat)) {
        state.ostettavatKentat = []
      }
      for (const k of alkuperaisetOstettavatKentat) {
        if (!state.avatutKentat[k.nimi] && !state.ostettavatKentat.some(ok => ok.nimi === k.nimi)) {
          state.ostettavatKentat.push(JSON.parse(JSON.stringify(k)))
        }
      }

      // Suoritetaan simulaation catch-up
      tickGameState(state)
      stateCache.set(userId, state)

      // Päivitetään myös tulostaulun tiedot tälle pelaajalle
      updateLeaderboardEntry(state, token)

      return state
    }
  } catch (err: any) {
    console.error('Poikkeus tietokantahaussa:', err)
  }

  // 3. Luodaan uusi alkutila, jos tallennusta ei löytynyt
  const newState = luoAlkutila(userId, username)
  stateCache.set(userId, newState)
  await saveGameState(newState, token)
  return newState
}

export async function saveGameState(state: GameState, token?: string): Promise<void> {
  if (token) {
    userTokens.set(state.userId, token)
  }

  state.lastUpdated = Date.now()
  stateCache.set(state.userId, state)

  // Päivitetään tulostaulu automaattisesti aina kun pelitila tallennetaan
  await updateLeaderboardEntry(state, token)

  const client = getSupabaseClient(state.userId, token)

  try {
    // Tallennetaan pelitila
    const { error: saveError } = await client
      .from('game_saves')
      .upsert({
        user_id: state.userId,
        game_state: state
      }, { onConflict: 'user_id' })

    if (saveError) {
      console.warn('Virhe pelitilan tallennuksessa Supabaseen:', saveError.message)
    }
  } catch (err: any) {
    console.error('Poikkeus pelitilan tallennuksessa:', err)
  }
}

// Päivittää tulostaulumerkinnän paikalliseen välimuistiin ja Supabaseen
export async function updateLeaderboardEntry(state: GameState, token?: string): Promise<void> {
  const name = state.pelaajanNimi || 'Pelaaja'
  const entry: LeaderboardEntry = {
    userId: state.userId,
    user_id: state.userId,
    pelaajanNimi: name,
    pelaajan_nimi: name,
    rahat: state.rahat,
    kulta: state.kulta,
    koneet: state.lentokoneet ? state.lentokoneet.length : 0,
    lennot: state.tilastot?.tehdytLennot ?? 0,
    matkustajat: state.tilastot?.kuljetutMatkustajat ?? 0,
    kentat: state.avatutKentat ? Object.keys(state.avatutKentat).length : 0,
    taso: state.taso || 1,
    updatedAt: new Date().toISOString()
  }

  // Päivitetään palvelimen oma välimuisti ja tiedosto
  leaderboardCache.set(state.userId, entry)
  saveLeaderboardToFile()

  // Synkronoidaan Supabaseen
  const client = getSupabaseClient(state.userId, token)
  try {
    // Yritetään ensin tallentaa laajennetuilla sarakkeilla
    const { error: fullError } = await client
      .from('leaderboard')
      .upsert({
        user_id: state.userId,
        pelaajan_nimi: name,
        rahat: state.rahat,
        kulta: state.kulta,
        lentokoneet: entry.koneet,
        lennot: entry.lennot,
        matkustajat: entry.matkustajat,
        taso: entry.taso,
        updated_at: entry.updatedAt
      }, { onConflict: 'user_id' })

    if (fullError) {
      // Jos Supabasen skeemassa ei vielä ole uusia sarakkeita, tallennetaan olemassa olevilla sarakkeilla
      const { error: baseError } = await client
        .from('leaderboard')
        .upsert({
          user_id: state.userId,
          pelaajan_nimi: name,
          rahat: state.rahat,
          kulta: state.kulta
        }, { onConflict: 'user_id' })

      if (baseError) {
        console.warn('Virhe tulostaulun Supabase-päivityksessä:', baseError.message)
      }
    }
  } catch (err: any) {
    console.error('Poikkeus tulostaulun päivityksessä:', err)
  }
}

export async function getLeaderboard(sortBy: string = 'rahat'): Promise<LeaderboardEntry[]> {
  const combinedMap = new Map<string, LeaderboardEntry>()

  // 1. Haetaan paikallinen välimuisti pohjaksi
  for (const [userId, entry] of leaderboardCache.entries()) {
    const name = entry.pelaajanNimi || entry.pelaajan_nimi || 'Tuntematon'
    combinedMap.set(userId, {
      ...entry,
      userId,
      user_id: userId,
      pelaajanNimi: name,
      pelaajan_nimi: name,
      taso: entry.taso || 1
    })
  }

  // 2. Päivitetään aktiivisten pelitilojen tuoreimmat tiedot
  for (const [userId, state] of stateCache.entries()) {
    const existing = combinedMap.get(userId)
    const name = state.pelaajanNimi || existing?.pelaajanNimi || existing?.pelaajan_nimi || 'Pelaaja'
    combinedMap.set(userId, {
      userId,
      user_id: userId,
      pelaajanNimi: name,
      pelaajan_nimi: name,
      rahat: state.rahat,
      kulta: state.kulta,
      koneet: state.lentokoneet ? state.lentokoneet.length : 0,
      lennot: state.tilastot?.tehdytLennot ?? 0,
      matkustajat: state.tilastot?.kuljetutMatkustajat ?? 0,
      kentat: state.avatutKentat ? Object.keys(state.avatutKentat).length : 0,
      taso: state.taso || existing?.taso || 1,
      updatedAt: existing?.updatedAt || new Date().toISOString()
    })
  }

  // 3. Haetaan Supabasesta muiden pelaajien tiedot (toimii julkisesti anon-avaimella)
  try {
    const { data, error } = await supabaseAdmin
      .from('leaderboard')
      .select('*')
      .limit(100)

    if (error) {
      console.warn('Virhe tulostaulun haussa Supabasesta:', error.message)
    } else if (data) {
      for (const row of data) {
        const userId = row.user_id
        const existing = combinedMap.get(userId)
        const name = row.pelaajan_nimi || existing?.pelaajanNimi || existing?.pelaajan_nimi || 'Tuntematon'

        combinedMap.set(userId, {
          userId,
          user_id: userId,
          pelaajanNimi: name,
          pelaajan_nimi: name,
          rahat: typeof row.rahat === 'number' ? Math.max(row.rahat, existing?.rahat ?? 0) : (existing?.rahat ?? 0),
          kulta: typeof row.kulta === 'number' ? Math.max(row.kulta, existing?.kulta ?? 0) : (existing?.kulta ?? 0),
          koneet: typeof row.lentokoneet === 'number' ? row.lentokoneet : (existing?.koneet ?? 0),
          lennot: typeof row.lennot === 'number' ? row.lennot : (existing?.lennot ?? 0),
          matkustajat: typeof row.matkustajat === 'number' ? row.matkustajat : (existing?.matkustajat ?? 0),
          kentat: existing?.kentat ?? 0,
          taso: typeof row.taso === 'number' ? Math.max(row.taso, existing?.taso ?? 1) : (existing?.taso ?? 1),
          updatedAt: row.updated_at || existing?.updatedAt || new Date().toISOString()
        })
      }
    }
  } catch (err: any) {
    console.error('Poikkeus tulostaulun haussa Supabasesta:', err)
  }

  // 3b. Haetaan lisäksi game_saves-taulusta tasotiedot (varmistaa tasojen näkymisen vaikka Supabasen leaderboard-taulussa ei olisi vielä taso-saraketta)
  try {
    const { data: savesData, error: savesError } = await supabaseAdmin
      .from('game_saves')
      .select('user_id, game_state')
      .limit(100)

    if (!savesError && savesData) {
      for (const save of savesData) {
        const uid = save.user_id
        const gState = save.game_state as GameState | undefined
        if (gState && typeof gState.taso === 'number' && gState.taso >= 1) {
          const entry = combinedMap.get(uid)
          if (entry) {
            entry.taso = Math.max(entry.taso ?? 1, gState.taso)
          } else {
            const pName = gState.pelaajanNimi || 'Pelaaja'
            combinedMap.set(uid, {
              userId: uid,
              user_id: uid,
              pelaajanNimi: pName,
              pelaajan_nimi: pName,
              rahat: gState.rahat ?? 0,
              kulta: gState.kulta ?? 0,
              koneet: gState.lentokoneet ? gState.lentokoneet.length : 0,
              lennot: gState.tilastot?.tehdytLennot ?? 0,
              matkustajat: gState.tilastot?.kuljetutMatkustajat ?? 0,
              kentat: gState.avatutKentat ? Object.keys(gState.avatutKentat).length : 0,
              taso: gState.taso,
              updatedAt: new Date().toISOString()
            })
          }
        }
      }
    }
  } catch (err: any) {
    // Valinnainen haku
  }

  const list = Array.from(combinedMap.values())

  // 4. Lajitellaan valitun sarakkeen mukaan laskevasti
  const sortKey = (['rahat', 'taso', 'koneet', 'lennot', 'matkustajat', 'kulta', 'kentat'].includes(sortBy)
    ? sortBy
    : 'rahat') as keyof LeaderboardEntry

  list.sort((a, b) => {
    const valA = Number(a[sortKey] ?? 0)
    const valB = Number(b[sortKey] ?? 0)
    return valB - valA
  })

  return list.slice(0, 50)
}
