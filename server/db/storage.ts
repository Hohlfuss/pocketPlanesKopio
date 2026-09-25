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

export interface EncodedLeaderboardStats {
  t: number  // taso
  k: number  // koneet
  l: number  // lennot
  m: number  // matkustajat
  kt: number // kentat
}

export function encodeLeaderboardName(name: string, stats: EncodedLeaderboardStats): string {
  const clean = (name || 'Pelaaja').replace(/\s*#M:.*$/, '').replace(/\s*#META#.*$/, '').trim() || 'Pelaaja'
  return `${clean} #M:${stats.t},${stats.k},${stats.l},${stats.m},${stats.kt}`
}

export function decodeLeaderboardName(rawName?: string): {
  name: string
  stats?: { taso: number; koneet: number; lennot: number; matkustajat: number; kentat: number }
} {
  if (!rawName) return { name: 'Pelaaja' }

  // 1. Tiivis formaatti #M:taso,koneet,lennot,matkustajat,kentat
  const mMatch = rawName.match(/^(.*?)\s*#M:(\d+),(\d+),(\d+),(\d+),(\d+)$/)
  if (mMatch) {
    return {
      name: mMatch[1].trim() || 'Pelaaja',
      stats: {
        taso: parseInt(mMatch[2], 10),
        koneet: parseInt(mMatch[3], 10),
        lennot: parseInt(mMatch[4], 10),
        matkustajat: parseInt(mMatch[5], 10),
        kentat: parseInt(mMatch[6], 10),
      }
    }
  }

  // 2. JSON-pohjainen #META# formaatti
  const metaIndex = rawName.indexOf('#META#')
  if (metaIndex !== -1) {
    const clean = rawName.substring(0, metaIndex).trim() || 'Pelaaja'
    try {
      const parsed = JSON.parse(rawName.substring(metaIndex + 6))
      return {
        name: clean,
        stats: {
          taso: parsed.t ?? parsed.taso,
          koneet: parsed.k ?? parsed.koneet,
          lennot: parsed.l ?? parsed.lennot,
          matkustajat: parsed.m ?? parsed.matkustajat,
          kentat: parsed.kt ?? parsed.kentat,
        }
      }
    } catch {
      return { name: clean }
    }
  }

  return { name: rawName.trim() || 'Pelaaja' }
}

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
  if (process.env.NODE_ENV === 'test') {
    return
  }
  if (fs.existsSync(LEADERBOARD_FILE)) {
    try {
      fs.unlinkSync(LEADERBOARD_FILE)
    } catch {}
  }
}

function saveLeaderboardToFile() {
  if (process.env.NODE_ENV === 'test') {
    return
  }
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
    await updateLeaderboardEntry(cached, token)
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
      await updateLeaderboardEntry(state, token)

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
  const rawName = state.pelaajanNimi || 'Pelaaja'
  const cleanName = rawName.replace(/\s*#M:.*$/, '').replace(/\s*#META#.*$/, '').trim() || 'Pelaaja'
  state.pelaajanNimi = cleanName // Pidetään pelitilassa aina siisti nimi

  const entry: LeaderboardEntry = {
    userId: state.userId,
    user_id: state.userId,
    pelaajanNimi: cleanName,
    pelaajan_nimi: cleanName,
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

  if (process.env.NODE_ENV === 'test') {
    return
  }

  // Synkronoidaan Supabaseen
  const client = getSupabaseClient(state.userId, token)
  try {
    // 1. Yritetään ensin tallentaa laajennetuilla sarakkeilla (jos schema_update.sql on ajettu Supabasessa)
    const { error: fullError } = await client
      .from('leaderboard')
      .upsert({
        user_id: state.userId,
        pelaajan_nimi: cleanName,
        rahat: state.rahat,
        kulta: state.kulta,
        lentokoneet: entry.koneet,
        lennot: entry.lennot,
        matkustajat: entry.matkustajat,
        kentat: entry.kentat,
        taso: entry.taso,
        updated_at: entry.updatedAt
      }, { onConflict: 'user_id' })

    if (fullError) {
      // 2. Jos Supabasen skeemassa ei vielä ole uusia sarakkeita (esim. column lentokoneet does not exist),
      // tallennetaan olemassa olevilla sarakkeilla ja koodataan laajennetut tilastot nimen perään.
      // Näin kaikki tilastot (taso, laivasto, lennot, matkustajat, kentät) säilyvät varmasti Supabasessa
      // myös silloin kun palvelin tai Render-prosessi resetoidaan!
      const encodedName = encodeLeaderboardName(cleanName, {
        t: entry.taso ?? 1,
        k: entry.koneet,
        l: entry.lennot,
        m: entry.matkustajat,
        kt: entry.kentat ?? 0
      })

      const { error: baseError } = await client
        .from('leaderboard')
        .upsert({
          user_id: state.userId,
          pelaajan_nimi: encodedName,
          rahat: state.rahat,
          kulta: state.kulta,
          updated_at: entry.updatedAt
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
    const { name: cleanName, stats: metaStats } = decodeLeaderboardName(entry.pelaajanNimi || entry.pelaajan_nimi || 'Tuntematon')
    combinedMap.set(userId, {
      ...entry,
      userId,
      user_id: userId,
      pelaajanNimi: cleanName,
      pelaajan_nimi: cleanName,
      taso: entry.taso ?? metaStats?.taso ?? 1,
      koneet: entry.koneet ?? metaStats?.koneet ?? 0,
      lennot: entry.lennot ?? metaStats?.lennot ?? 0,
      matkustajat: entry.matkustajat ?? metaStats?.matkustajat ?? 0,
      kentat: entry.kentat ?? metaStats?.kentat ?? 0
    })
  }

  // 2. Päivitetään aktiivisten pelitilojen tuoreimmat tiedot (muistissa olevat)
  for (const [userId, state] of stateCache.entries()) {
    const existing = combinedMap.get(userId)
    const rawName = state.pelaajanNimi || existing?.pelaajanNimi || existing?.pelaajan_nimi || 'Pelaaja'
    const { name: cleanName } = decodeLeaderboardName(rawName)
    combinedMap.set(userId, {
      userId,
      user_id: userId,
      pelaajanNimi: cleanName,
      pelaajan_nimi: cleanName,
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

  // 3. Haetaan Supabasesta muiden pelaajien tiedot (ohitetaan testiajossa puhtauden ja determinismin takaamiseksi)
  if (process.env.NODE_ENV !== 'test') {
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
          const { name: decodedName, stats: metaStats } = decodeLeaderboardName(row.pelaajan_nimi)
          const name = decodedName || existing?.pelaajanNimi || existing?.pelaajan_nimi || 'Tuntematon'

          const koneetVal = typeof row.lentokoneet === 'number'
            ? row.lentokoneet
            : (typeof metaStats?.koneet === 'number' ? metaStats.koneet : (existing?.koneet ?? 0))

          const lennotVal = typeof row.lennot === 'number'
            ? row.lennot
            : (typeof metaStats?.lennot === 'number' ? metaStats.lennot : (existing?.lennot ?? 0))

          const matkustajatVal = typeof row.matkustajat === 'number'
            ? row.matkustajat
            : (typeof metaStats?.matkustajat === 'number' ? metaStats.matkustajat : (existing?.matkustajat ?? 0))

          const kentatVal = typeof row.kentat === 'number'
            ? row.kentat
            : (typeof metaStats?.kentat === 'number' ? metaStats.kentat : (existing?.kentat ?? 0))

          const tasoVal = typeof row.taso === 'number'
            ? Math.max(row.taso, existing?.taso ?? 1)
            : (typeof metaStats?.taso === 'number' ? Math.max(metaStats.taso, existing?.taso ?? 1) : (existing?.taso ?? 1))

          const entry: LeaderboardEntry = {
            userId,
            user_id: userId,
            pelaajanNimi: name,
            pelaajan_nimi: name,
            rahat: typeof row.rahat === 'number' ? Math.max(row.rahat, existing?.rahat ?? 0) : (existing?.rahat ?? 0),
            kulta: typeof row.kulta === 'number' ? Math.max(row.kulta, existing?.kulta ?? 0) : (existing?.kulta ?? 0),
            koneet: koneetVal,
            lennot: lennotVal,
            matkustajat: matkustajatVal,
            kentat: kentatVal,
            taso: tasoVal,
            updatedAt: row.updated_at || existing?.updatedAt || new Date().toISOString()
          }

          combinedMap.set(userId, entry)

          // Päivitetään palvelimen omaan välimuistiin
          if (!leaderboardCache.has(userId) || (existing && existing.rahat < entry.rahat)) {
            leaderboardCache.set(userId, entry)
          }
        }
      }
    } catch (err: any) {
      console.error('Poikkeus tulostaulun haussa Supabasesta:', err)
    }

    // 3b. Haetaan lisäksi game_saves-taulusta tiedot (toimii jos SUPABASE_SERVICE_ROLE_KEY on asetettu tai RLS sallii)
    try {
      const { data: savesData, error: savesError } = await supabaseAdmin
        .from('game_saves')
        .select('user_id, game_state')
        .limit(100)

      if (!savesError && savesData) {
        for (const save of savesData) {
          const uid = save.user_id
          const gState = save.game_state as GameState | undefined
          if (gState) {
            const entry = combinedMap.get(uid)
            const gKoneet = gState.lentokoneet ? gState.lentokoneet.length : 0
            const gLennot = gState.tilastot?.tehdytLennot ?? 0
            const gMatkustajat = gState.tilastot?.kuljetutMatkustajat ?? 0
            const gKentat = gState.avatutKentat ? Object.keys(gState.avatutKentat).length : 0
            const gTaso = typeof gState.taso === 'number' && gState.taso >= 1 ? gState.taso : 1
            const gRahat = gState.rahat ?? 0
            const gKulta = gState.kulta ?? 0

            if (entry) {
              entry.taso = Math.max(entry.taso ?? 1, gTaso)
              entry.rahat = Math.max(entry.rahat, gRahat)
              entry.kulta = Math.max(entry.kulta, gKulta)
              if (entry.koneet === 0 && gKoneet > 0) entry.koneet = gKoneet
              if (entry.lennot === 0 && gLennot > 0) entry.lennot = gLennot
              if (entry.matkustajat === 0 && gMatkustajat > 0) entry.matkustajat = gMatkustajat
              if ((entry.kentat ?? 0) === 0 && gKentat > 0) entry.kentat = gKentat
            } else {
              const pName = gState.pelaajanNimi || 'Pelaaja'
              const newEntry: LeaderboardEntry = {
                userId: uid,
                user_id: uid,
                pelaajanNimi: pName,
                pelaajan_nimi: pName,
                rahat: gRahat,
                kulta: gKulta,
                koneet: gKoneet,
                lennot: gLennot,
                matkustajat: gMatkustajat,
                kentat: gKentat,
                taso: gTaso,
                updatedAt: new Date().toISOString()
              }
              combinedMap.set(uid, newEntry)
              leaderboardCache.set(uid, newEntry)
            }
          }
        }
      }
    } catch (err: any) {
      // Valinnainen haku
    }
  }

  // Tallennetaan tuore välimuisti levylle
  saveLeaderboardToFile()

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
