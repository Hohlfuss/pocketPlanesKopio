// server/game/gameEngine.ts
import type {
  GameState,
  Lentokone,
  Matkustaja,
  Osa,
  OsaTyyppi,
  KenttaData,
  Piirustus
} from '../types'
import {
  haeEtaisyys,
  rakennettavatMallit,
  alkuperaisetOstettavatKentat,
  mahdollisetNimet,
  hintaKentalle,
  hintaKenttaMatkustajaPaikka,
  hintaNopeus,
  hintaKulutus,
  hintaTilavuus,
  uudenPaikanHinta,
  laskeReitinTiedot
} from './gameData'

export function generoiKaupanOsat(count = 4): Osa[] {
  const maara = Math.max(2, Math.min(6, count))
  const uudetOsat: Osa[] = []
  const tyypit: OsaTyyppi[] = ['moottori', 'runko', 'siivet']
  let safety = 0

  while (uudetOsat.length < maara && safety++ < 50) {
    const malli = rakennettavatMallit[Math.floor(Math.random() * rakennettavatMallit.length)]
    const tyyppi = tyypit[Math.floor(Math.random() * tyypit.length)]
    const hinta = Math.floor(Math.random() * 5) + 3 // 3-7 kultaa

    if (!uudetOsat.some(o => o.malliId === malli.malliId && o.tyyppi === tyyppi)) {
      uudetOsat.push({
        id: `part_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        malliId: malli.malliId,
        tyyppi,
        hinta
      })
    }
  }
  return uudetOsat
}

export function generoiMatkustajatKentalle(
  kenttaNimi: string,
  kenttaData: KenttaData,
  olemassaOlevat: Matkustaja[],
  avatutNimet: string[],
  counterRef: { current: number }
): Matkustaja[] {
  if (olemassaOlevat.length >= kenttaData.maxMatkustajat) return olemassaOlevat

  const vapaaTila = kenttaData.maxMatkustajat - olemassaOlevat.length
  const arvottavaMaara = Math.floor(Math.random() * 2) + 1
  const maara = Math.min(vapaaTila, arvottavaMaara)

  const mahdollisetKohteet = avatutNimet.filter(k => k !== kenttaNimi)
  if (mahdollisetKohteet.length === 0) return olemassaOlevat

  const uudet: Matkustaja[] = []
  for (let i = 0; i < maara; i++) {
    const onKulta = Math.random() < 0.15
    const kultaMaara = onKulta ? 1 : 0

    uudet.push({
      id: `m_${counterRef.current++}`,
      nimi: mahdollisetNimet[Math.floor(Math.random() * mahdollisetNimet.length)],
      kohde: mahdollisetKohteet[Math.floor(Math.random() * mahdollisetKohteet.length)],
      tuottaaKultaa: onKulta,
      kultaMaara
    })
  }

  return [...olemassaOlevat, ...uudet]
}

export function luoAlkutila(userId: string, username: string): GameState {
  const now = Date.now()
  const avatutKentat: Record<string, KenttaData> = {
    "Pirkkala": { nimi: "Pirkkala", tier: 1, maxMatkustajat: 3, matkustajaPaikkaTaso: 0 },
    "Pori": { nimi: "Pori", tier: 1, maxMatkustajat: 3, matkustajaPaikkaTaso: 0 },
    "Helsinki": { nimi: "Helsinki", tier: 3, maxMatkustajat: 9, matkustajaPaikkaTaso: 0 }
  }

  const matkustajatKentilla: Record<string, Matkustaja[]> = {
    "Pirkkala": [], "Pori": [], "Helsinki": [], "Turku": [], "Tampere": [],
    "Jyväskylä": [], "Vaasa": [], "Kuopio": [], "Joensuu": [], "Lappeenranta": [],
    "Oulu": [], "Rovaniemi": [], "Ivalo": [], "Tallinna": [], "Riika": [],
    "Tukholma": [], "Oslo": [], "Kööpenhamina": [], "Berliini": [], "Lontoo": [], "Pariisi": []
  }

  const counterRef = { current: 1 }
  const avatutNimet = Object.keys(avatutKentat)
  avatutNimet.forEach(nimi => {
    matkustajatKentilla[nimi] = generoiMatkustajatKentalle(
      nimi,
      avatutKentat[nimi],
      [],
      avatutNimet,
      counterRef
    )
  })

  const lentokoneet: Lentokone[] = [
    {
      id: 1,
      nimi: "Piper Cub (Keltasirkku)",
      malliId: "piper",
      nopeus: 130,
      paino: 350,
      kulutus: 16,
      matkustajaMaara: 1,
      sijainti: "Pirkkala",
      matkustajatKyydissa: [],
      tila: "Maassa",
      reitti: [],
      kohde: null,
      lentoAikaJaljella: 0,
      departedAt: null,
      arrivalAt: null,
      onBonusLento: false,
      nopeusTaso: 0,
      kulutusTaso: 0,
      tilavuusTaso: 0
    },
    {
      id: 2,
      nimi: "Cessna 150 (Kirppu)",
      malliId: "cessna150",
      nopeus: 150,
      paino: 500,
      kulutus: 22,
      matkustajaMaara: 1,
      sijainti: "Pori",
      matkustajatKyydissa: [],
      tila: "Maassa",
      reitti: [],
      kohde: null,
      lentoAikaJaljella: 0,
      departedAt: null,
      arrivalAt: null,
      onBonusLento: false,
      nopeusTaso: 0,
      kulutusTaso: 0,
      tilavuusTaso: 0
    },
    {
      id: 3,
      nimi: "Diamond DA40 (Kaksikko)",
      malliId: "da40",
      nopeus: 220,
      paino: 800,
      kulutus: 30,
      matkustajaMaara: 2,
      sijainti: "Helsinki",
      matkustajatKyydissa: [],
      tila: "Maassa",
      reitti: [],
      kohde: null,
      lentoAikaJaljella: 0,
      departedAt: null,
      arrivalAt: null,
      onBonusLento: false,
      nopeusTaso: 0,
      kulutusTaso: 0,
      tilavuusTaso: 0
    }
  ]

  return {
    userId,
    pelaajanNimi: username || 'Pelaaja',
    rahat: 100,
    kulta: 0,
    maksimiKonePaikat: 4,
    lastHataapuClaimedAt: 0,
    hataapuCooldownJaljella: 0,
    lastPassengerRefreshAt: now,
    aikaSeuraavaanPaivitykseen: 180,
    avatutKentat,
    ostettavatKentat: JSON.parse(JSON.stringify(alkuperaisetOstettavatKentat)),
    lentokoneet,
    omistetutOsat: [],
    matkustajatKentilla,
    kaupanOsat: generoiKaupanOsat(3),
    tilastot: {
      tehdytLennot: 0,
      lennodetytKilometrit: 0,
      ansaitutRahat: 0,
      kulutetutRahatPolttoaineeseen: 0,
      kuljetutMatkustajat: 0,
      keratytKullat: 0,
      rakennetutKoneet: 0
    },
    koneIdCounter: 4,
    matkustajaIdCounter: counterRef.current,
    lastUpdated: now
  }
}

/**
 * tickGameState suorittaa pelimaailman simulaatiopäivityksen annettun ajanhetkeen asti.
 * Tämä toimii palvelimen auktoriteettinä ja mahdollistaa offline-etenemisen.
 */
export function tickGameState(state: GameState, nowMs = Date.now()): { state: GameState, events: string[] } {
  const events: string[] = []

  // 1. Hätäapujäähy
  const cooldownEnd = (state.lastHataapuClaimedAt || 0) + 180000
  state.hataapuCooldownJaljella = Math.max(0, Math.ceil((cooldownEnd - nowMs) / 1000))

  // 2. Matkustajien ja osien päivitysjakso (180 s / 3 min)
  const refreshIntervalMs = 180000
  if (!state.lastPassengerRefreshAt) {
    state.lastPassengerRefreshAt = nowMs
  }

  // Jos pelaaja on ollut offline pitkään tai aika on tullut täyteen:
  if (nowMs - state.lastPassengerRefreshAt >= refreshIntervalMs) {
    const counterRef = { current: state.matkustajaIdCounter }
    const avatutNimet = Object.keys(state.avatutKentat)

    avatutNimet.forEach(nimi => {
      state.matkustajatKentilla[nimi] = generoiMatkustajatKentalle(
        nimi,
        state.avatutKentat[nimi],
        state.matkustajatKentilla[nimi] || [],
        avatutNimet,
        counterRef
      )
    })
    state.matkustajaIdCounter = counterRef.current
    state.kaupanOsat = generoiKaupanOsat(Math.floor(Math.random() * 4) + 2)
    state.lastPassengerRefreshAt = nowMs
    events.push("Lentokenttien matkustajat ja kaupan osat päivitetty!")
  }

  state.aikaSeuraavaanPaivitykseen = Math.max(
    0,
    Math.ceil((state.lastPassengerRefreshAt + refreshIntervalMs - nowMs) / 1000)
  )

  // 3. Lentojen eteneminen ja laskeutuminen
  state.lentokoneet.forEach(kone => {
    if (kone.tila !== "Ilmassa") return

    // Jos koneella ei ole vielä aikaleimoja (esim. vanha tallennus), alustetaan ne
    if (!kone.arrivalAt) {
      const remainingSec = kone.lentoAikaJaljella || 10
      kone.departedAt = nowMs - 1000
      kone.arrivalAt = nowMs + remainingSec * 1000
    }

    // Suoritetaan lennon etapit, jos arrivalAt on saavutettu
    while (kone.tila === "Ilmassa" && kone.arrivalAt && nowMs >= kone.arrivalAt) {
      const saavuttuKentta = kone.kohde!
      const jaavatKyytiin: Matkustaja[] = []
      let lennonKulta = 0
      let lennonTulot = 0
      let laskeutuneetMatkustajat = 0

      // Puretaan matkustajat, joiden kohde on tämä kenttä
      for (const m of kone.matkustajatKyydissa) {
        if (m.kohde === saavuttuKentta) {
          laskeutuneetMatkustajat++
          const lahto = m.lahtoKentta || saavuttuKentta
          let tulo = haeEtaisyys(lahto, m.kohde) * 0.35
          if (kone.onBonusLento) tulo *= 1.25
          lennonTulot += Math.ceil(tulo)
          state.tilastot.kuljetutMatkustajat++

          if (m.tuottaaKultaa) {
            let saatuKulta = (m.kultaMaara || 1)
            if (kone.onBonusLento) saatuKulta *= 1.25
            lennonKulta += Math.ceil(saatuKulta)
          }
        } else {
          jaavatKyytiin.push(m)
        }
      }

      state.rahat += lennonTulot
      state.tilastot.ansaitutRahat += lennonTulot
      kone.matkustajatKyydissa = jaavatKyytiin

      if (lennonKulta > 0) {
        state.kulta += lennonKulta
        state.tilastot.keratytKullat += lennonKulta
      }

      events.push(
        `Kone ${kone.nimi} saapui kentälle ${saavuttuKentta}! Tuotto: +${lennonTulot} €${lennonKulta > 0 ? `, +${lennonKulta} kultaa` : ''}.`
      )

      // Siirrytään reitillä eteenpäin
      kone.reitti.shift()

      if (kone.reitti.length > 0) {
        // Seuraava etappi
        const edellinenArrival: number = kone.arrivalAt || nowMs
        kone.kohde = kone.reitti[0]
        const matka = haeEtaisyys(saavuttuKentta, kone.kohde)
        const uusiAikaTunteina = matka / kone.nopeus
        const kestoSek = Math.max(5, Math.round(uusiAikaTunteina * 80))
        
        kone.departedAt = edellinenArrival
        kone.arrivalAt = edellinenArrival + (kestoSek * 1000)
        kone.legDurationSeconds = kestoSek
      } else {
        // Reitti päättynyt -> kone maahan
        kone.tila = "Maassa"
        kone.sijainti = saavuttuKentta
        kone.kohde = null
        kone.onBonusLento = false
        kone.departedAt = null
        kone.arrivalAt = null
        kone.lentoAikaJaljella = 0
      }
    }

    // Jos kone on edelleen ilmassa, päivitetään jäljellä oleva aika sekunteina
    if (kone.tila === "Ilmassa" && kone.arrivalAt) {
      kone.lentoAikaJaljella = Math.max(0, Math.ceil((kone.arrivalAt - nowMs) / 1000))
    }
  })

  state.lastUpdated = nowMs
  return { state, events }
}

/**
 * Pelaajan toimenpiteiden käsittely (Actions) palvelimella
 */
export function suoritaToiminto(
  state: GameState,
  action: string,
  payload: any,
  nowMs = Date.now()
): { success: boolean, message?: string, state: GameState } {
  // Aina ensin päivitetään simulaatio nykyhetkeen
  tickGameState(state, nowMs)

  switch (action) {
    case 'claim-emergency-aid': {
      if (state.hataapuCooldownJaljella > 0) {
        return { success: false, message: `Hätäapu on vielä jäähyllä (${state.hataapuCooldownJaljella}s)`, state }
      }
      state.rahat += 100
      state.lastHataapuClaimedAt = nowMs
      state.hataapuCooldownJaljella = 180
      return { success: true, message: '+100 € hätäapu lunastettu!', state }
    }

    case 'buy-airport': {
      const { airportName } = payload || {}
      const ostettavaIdx = state.ostettavatKentat.findIndex(k => k.nimi === airportName)
      if (ostettavaIdx === -1) {
        return { success: false, message: 'Kenttä ei ole ostettavissa tai on jo avattu', state }
      }
      const ostettava = state.ostettavatKentat[ostettavaIdx]
      const hinta = hintaKentalle(ostettava, state.avatutKentat)

      if (state.rahat < hinta) {
        return { success: false, message: `Rahat eivät riitä kentän ostoon (tarvitaan ${hinta} €)`, state }
      }

      state.rahat -= hinta
      state.avatutKentat[ostettava.nimi] = {
        nimi: ostettava.nimi,
        tier: ostettava.tier,
        maxMatkustajat: ostettava.maxMatkustajat,
        matkustajaPaikkaTaso: 0
      }
      state.ostettavatKentat.splice(ostettavaIdx, 1)

      // Luodaan heti alkumatkustajat uudelle kentälle
      if (!state.matkustajatKentilla[ostettava.nimi]) {
        state.matkustajatKentilla[ostettava.nimi] = []
      }
      const counterRef = { current: state.matkustajaIdCounter }
      state.matkustajatKentilla[ostettava.nimi] = generoiMatkustajatKentalle(
        ostettava.nimi,
        state.avatutKentat[ostettava.nimi],
        [],
        Object.keys(state.avatutKentat),
        counterRef
      )
      state.matkustajaIdCounter = counterRef.current

      return { success: true, message: `Lentokenttä ${ostettava.nimi} ostettu onnistuneesti!`, state }
    }

    case 'upgrade-airport': {
      const { airportName } = payload || {}
      const kData = state.avatutKentat[airportName]
      if (!kData) {
        return { success: false, message: 'Lentokenttää ei löydy omistuksesta', state }
      }
      const hinta = hintaKenttaMatkustajaPaikka(kData)
      if (state.rahat < hinta) {
        return { success: false, message: `Rahat eivät riitä kentän päivitykseen (tarvitaan ${hinta} €)`, state }
      }

      state.rahat -= hinta
      kData.matkustajaPaikkaTaso++
      kData.maxMatkustajat += 2
      return { success: true, message: `Kenttä ${airportName} päivitetty! Kapasiteetti nyt ${kData.maxMatkustajat}.`, state }
    }

    case 'buy-part': {
      const { partId } = payload || {}
      const partIdx = state.kaupanOsat.findIndex(p => p.id === partId)
      if (partIdx === -1) {
        return { success: false, message: 'Osaa ei löydy enää kaupasta', state }
      }
      const osa = state.kaupanOsat[partIdx]
      const onkoJo = state.omistetutOsat.some(o => o.malliId === osa.malliId && o.tyyppi === osa.tyyppi)
      if (onkoJo) {
        return { success: false, message: 'Omistat jo tämän osan tälle konemallille', state }
      }
      if (state.kulta < osa.hinta) {
        return { success: false, message: `Kulta ei riitä osan ostoon (tarvitaan ${osa.hinta} kultaa)`, state }
      }

      state.kulta -= osa.hinta
      state.omistetutOsat.push({ malliId: osa.malliId, tyyppi: osa.tyyppi })
      state.kaupanOsat.splice(partIdx, 1)

      return { success: true, message: `Osa ${osa.tyyppi} ostettu malliin ${osa.malliId}!`, state }
    }

    case 'build-plane': {
      const { malliId } = payload || {}
      if (state.lentokoneet.length >= state.maksimiKonePaikat) {
        return { success: false, message: 'Hangaari on täynnä! Osta lisäpaikka tai romuta kone.', state }
      }
      const piirustus = rakennettavatMallit.find(m => m.malliId === malliId)
      if (!piirustus) {
        return { success: false, message: 'Tuntematon konemalli', state }
      }

      const tarvittavat: OsaTyyppi[] = ['moottori', 'runko', 'siivet']
      const onKaikki = tarvittavat.every(t => state.omistetutOsat.some(o => o.malliId === malliId && o.tyyppi === t))
      if (!onKaikki) {
        return { success: false, message: 'Kaikkia kolmea osaa (moottori, runko, siivet) ei löydy omistuksesta', state }
      }

      // Poistetaan osat
      state.omistetutOsat = state.omistetutOsat.filter(o => o.malliId !== malliId)

      // Spawnaa ensimmäiselle avatulle kentälle
      const aloitusKentta = Object.keys(state.avatutKentat)[0] || "Pirkkala"
      const uusiKone: Lentokone = {
        id: state.koneIdCounter++,
        nimi: piirustus.nimi,
        malliId: piirustus.malliId,
        nopeus: piirustus.nopeus,
        paino: piirustus.paino,
        kulutus: piirustus.kulutus,
        matkustajaMaara: piirustus.matkustajaMaara,
        sijainti: aloitusKentta,
        matkustajatKyydissa: [],
        tila: "Maassa",
        reitti: [],
        kohde: null,
        lentoAikaJaljella: 0,
        departedAt: null,
        arrivalAt: null,
        onBonusLento: false,
        nopeusTaso: 0,
        kulutusTaso: 0,
        tilavuusTaso: 0
      }

      state.lentokoneet.push(uusiKone)
      state.tilastot.rakennetutKoneet++

      return { success: true, message: `Kone ${piirustus.nimi} rakennettu valmiiksi!`, state }
    }

    case 'scrap-plane': {
      const { planeId } = payload || {}
      const koneIdx = state.lentokoneet.findIndex(k => k.id === planeId)
      if (koneIdx === -1) {
        return { success: false, message: 'Konetta ei löytynyt', state }
      }
      const kone = state.lentokoneet[koneIdx]
      if (kone.tila !== "Maassa") {
        return { success: false, message: 'Konetta ei voi myydä kesken lennon', state }
      }

      // Siirretään matkustajat takaisin kentälle
      if (kone.matkustajatKyydissa.length > 0 && state.matkustajatKentilla[kone.sijainti]) {
        state.matkustajatKentilla[kone.sijainti].push(...kone.matkustajatKyydissa)
      }

      state.lentokoneet.splice(koneIdx, 1)
      state.rahat += 500
      return { success: true, message: `Kone ${kone.nimi} romutettu (+500 €)!`, state }
    }

    case 'upgrade-plane': {
      const { planeId, type } = payload || {}
      const kone = state.lentokoneet.find(k => k.id === planeId)
      if (!kone) {
        return { success: false, message: 'Konetta ei löytynyt', state }
      }

      if (type === 'speed') {
        const hinta = hintaNopeus(kone.nopeusTaso)
        if (state.kulta < hinta) {
          return { success: false, message: `Kulta ei riitä (tarvitaan ${hinta} kultaa)`, state }
        }
        state.kulta -= hinta
        kone.nopeusTaso++
        kone.nopeus += 20
        return { success: true, message: `Nopeus päivitetty (+20 km/h)!`, state }
      }

      if (type === 'consumption') {
        const hinta = hintaKulutus(kone.kulutusTaso)
        if (kone.kulutus <= 2) {
          return { success: false, message: 'Kulutus on jo minimitasolla (2 €/h)', state }
        }
        if (state.kulta < hinta) {
          return { success: false, message: `Kulta ei riitä (tarvitaan ${hinta} kultaa)`, state }
        }
        state.kulta -= hinta
        kone.kulutusTaso++
        kone.kulutus = Math.max(2, Math.floor(kone.kulutus * 0.85))
        return { success: true, message: `Kulutusta laskettu 15%!`, state }
      }

      if (type === 'capacity') {
        const hinta = hintaTilavuus(kone.tilavuusTaso)
        if (state.kulta < hinta) {
          return { success: false, message: `Kulta ei riitä (tarvitaan ${hinta} kultaa)`, state }
        }
        state.kulta -= hinta
        kone.tilavuusTaso++
        kone.matkustajaMaara++
        return { success: true, message: `Matkustajapaikkoja lisätty (+1 paikka)!`, state }
      }

      return { success: false, message: 'Tuntematon päivitystyyppi', state }
    }

    case 'buy-hangar-slot': {
      const hinta = uudenPaikanHinta(state.maksimiKonePaikat)
      if (state.rahat < hinta) {
        return { success: false, message: `Rahat eivät riitä (tarvitaan ${hinta} €)`, state }
      }
      state.rahat -= hinta
      state.maksimiKonePaikat++
      return { success: true, message: `Uusi konepaikka ostettu (${state.maksimiKonePaikat} paikkaa)!`, state }
    }

    case 'load-passenger': {
      const { planeId, passengerId } = payload || {}
      const kone = state.lentokoneet.find(k => k.id === planeId)
      if (!kone || kone.tila !== "Maassa") {
        return { success: false, message: 'Kone ei ole maassa tai sitä ei löydy', state }
      }
      if (kone.matkustajatKyydissa.length >= kone.matkustajaMaara) {
        return { success: false, message: 'Kone on jo täynnä', state }
      }

      const kenttaMatkustajat = state.matkustajatKentilla[kone.sijainti] || []
      const mIdx = kenttaMatkustajat.findIndex(m => m.id === passengerId)
      if (mIdx === -1) {
        return { success: false, message: 'Matkustajaa ei löydy tältä kentältä', state }
      }

      const [matkustaja] = kenttaMatkustajat.splice(mIdx, 1)
      matkustaja.lahtoKentta = kone.sijainti
      kone.matkustajatKyydissa.push(matkustaja)

      return { success: true, message: `${matkustaja.nimi} nousi koneeseen!`, state }
    }

    case 'unload-passenger': {
      const { planeId, passengerId } = payload || {}
      const kone = state.lentokoneet.find(k => k.id === planeId)
      if (!kone || kone.tila !== "Maassa") {
        return { success: false, message: 'Kone ei ole maassa', state }
      }
      const mIdx = kone.matkustajatKyydissa.findIndex(m => m.id === passengerId)
      if (mIdx === -1) {
        return { success: false, message: 'Matkustaja ei ole koneessa', state }
      }

      const [matkustaja] = kone.matkustajatKyydissa.splice(mIdx, 1)
      if (!state.matkustajatKentilla[kone.sijainti]) {
        state.matkustajatKentilla[kone.sijainti] = []
      }
      state.matkustajatKentilla[kone.sijainti].push(matkustaja)

      return { success: true, message: `${matkustaja.nimi} poistettu koneesta`, state }
    }

    case 'dispatch-plane': {
      const { planeId, route } = payload || {}
      const kone = state.lentokoneet.find(k => k.id === planeId)
      if (!kone) {
        return { success: false, message: 'Konetta ei löydy', state }
      }
      if (kone.tila !== "Maassa") {
        return { success: false, message: 'Kone on jo ilmassa', state }
      }
      if (!Array.isArray(route) || route.length === 0) {
        return { success: false, message: 'Valitse vähintään yksi etappi reitille', state }
      }

      const lahtoKentta = kone.sijainti
      const tiedot = laskeReitinTiedot(kone, lahtoKentta, route)

      if (state.rahat < tiedot.kulut) {
        return { success: false, message: `Rahat eivät riitä polttoainekuluihin (tarvitaan ${tiedot.kulut} €)`, state }
      }

      // Vähennetään polttoainekulut ja päivitetään tilastot
      state.rahat -= tiedot.kulut
      state.tilastot.kulutetutRahatPolttoaineeseen += tiedot.kulut
      state.tilastot.tehdytLennot++
      state.tilastot.lennodetytKilometrit += tiedot.matka

      kone.reitti = [...route]
      kone.kohde = route[0]
      kone.tila = "Ilmassa"
      kone.sijainti = "Ilmassa"
      kone.onBonusLento = tiedot.isBonus

      const ekaMatka = haeEtaisyys(lahtoKentta, route[0])
      const ekaAikaTunteina = ekaMatka / kone.nopeus
      const kestoSek = Math.max(5, Math.round(ekaAikaTunteina * 80))

      kone.departedAt = nowMs
      kone.arrivalAt = nowMs + (kestoSek * 1000)
      kone.legDurationSeconds = kestoSek
      kone.lentoAikaJaljella = kestoSek

      return {
        success: true,
        message: `Kone ${kone.nimi} lähti matkaan kohti kenttää ${kone.kohde}!`,
        state
      }
    }

    default:
      return { success: false, message: `Tuntematon toiminto: ${action}`, state }
  }
}
