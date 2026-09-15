<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue"
import { useRouter } from "vue-router"
import { logout, getCurrentProfile } from '../lib/auth'
import { fetchGameState, sendGameAction, fetchLeaderboard } from '../lib/api'
import type {
  KenttaData,
  Lentokone,
  Matkustaja,
  Osa,
  OsaTyyppi,
  OstettavaKentta,
  Piirustus,
  LeaderboardEntry
} from '../shared/types'
import {
  rakennettavatMallit,
  haeEtaisyys,
  hintaNopeus as laskeHintaNopeus,
  hintaKulutus as laskeHintaKulutus,
  hintaTilavuus as laskeHintaTilavuus,
  uudenPaikanHinta as laskeUudenPaikanHinta,
  hintaKentalle as laskeHintaKentalle,
  hintaKenttaMatkustajaPaikka as laskeHintaKenttaMatkustajaPaikka,
  laskeReitinTiedot,
  tarvittavaXpTasonNostoon
} from '../shared/gameData'

const router = useRouter()

// Käyttäjä ja profiili
const kayttaja = ref<any>(null)
const pelaajanNimi = ref("")

// Leaderboard
const leaderboardAuki = ref(false)
const leaderboardLataus = ref(false)
const leaderboardData = ref<LeaderboardEntry[]>([])
const leaderboardLajittelu = ref<'rahat' | 'taso' | 'koneet' | 'lennot' | 'matkustajat' | 'kulta'>('rahat')
let leaderboardInterval: any = null

// Pelin tila (Palvelimen auktoriteetti)
const rahat = ref(100)
const kulta = ref(0)
const taso = ref(1)
const xp = ref(0)
const tasonMaksimiXp = computed(() => tarvittavaXpTasonNostoon(taso.value))
const xpProsentti = computed(() => {
  const max = tasonMaksimiXp.value
  if (!max || max <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((xp.value / max) * 100)))
})
const kultaIlmoitus = ref("")
const tallennusIlmoitus = ref("")
const hataapuCooldown = ref(0)
const maksimiKonePaikat = ref(4)
const uudenPaikanHinta = computed(() => laskeUudenPaikanHinta(maksimiKonePaikat.value))

const tilastot = ref({
  tehdytLennot: 0,
  lennodetytKilometrit: 0,
  ansaitutRahat: 0,
  kulutetutRahatPolttoaineeseen: 0,
  kuljetutMatkustajat: 0,
  keratytKullat: 0,
  rakennetutKoneet: 0
})

const avatutKentat = ref<Record<string, KenttaData>>({})
const ostettavatKentat = ref<OstettavaKentta[]>([])
const lentokoneet = ref<Lentokone[]>([])
const omistetutOsat = ref<{ malliId: string, tyyppi: OsaTyyppi }[]>([])
const matkustajatKentilla = ref<Record<string, Matkustaja[]>>({})
const kaupanOsat = ref<Osa[]>([])
const aikaSeuraavaanPaivitykseen = ref(180)

const tyopajaAuki = ref(false)
const kenttaKauppaAuki = ref(false)
const tilastotAuki = ref(false)
const valittuKentta = ref<string | null>(null)
const valittuKoneId = ref<number | null>(null)
const suunniteltuReitti = ref<string[]>([])
const toimintoLataus = ref(false)

// Päivittää käyttöliittymän vastaamaan palvelimen tilaa
const paivitaTila = (state: any) => {
  if (!state) return
  rahat.value = state.rahat ?? 100
  kulta.value = state.kulta ?? 0
  taso.value = state.taso ?? 1
  xp.value = state.xp ?? 0
  maksimiKonePaikat.value = state.maksimiKonePaikat ?? 4
  hataapuCooldown.value = state.hataapuCooldownJaljella ?? 0
  avatutKentat.value = state.avatutKentat || {}
  ostettavatKentat.value = state.ostettavatKentat || []
  lentokoneet.value = (state.lentokoneet || []).map((k: any) => ({
    ...k,
    nopeusTaso: k.nopeusTaso || 0,
    kulutusTaso: k.kulutusTaso || 0,
    tilavuusTaso: k.tilavuusTaso || 0
  }))
  omistetutOsat.value = state.omistetutOsat || []
  matkustajatKentilla.value = state.matkustajatKentilla || {}
  kaupanOsat.value = state.kaupanOsat || []
  tilastot.value = state.tilastot || tilastot.value
  aikaSeuraavaanPaivitykseen.value = state.aikaSeuraavaanPaivitykseen ?? 180
}

// Hakee pelitilan palvelimelta
const lataaTilaPalvelimelta = async (naytaIlmoitus = false) => {
  try {
    const res = await fetchGameState()
    paivitaTila(res.state)
    if (res.events && res.events.length > 0) {
      tallennusIlmoitus.value = res.events[res.events.length - 1]
      setTimeout(() => { tallennusIlmoitus.value = "" }, 4000)
    } else if (naytaIlmoitus) {
      tallennusIlmoitus.value = "Palvelintila synkronoitu!"
      setTimeout(() => { tallennusIlmoitus.value = "" }, 3000)
    }
  } catch (err: any) {
    console.error("Virhe tilan haussa palvelimelta:", err)
  }
}

// Suorittaa toiminnon palvelimella (Server-authoritative)
const suoritaPalvelinToiminto = async (action: string, payload?: any) => {
  if (toimintoLataus.value) return false
  toimintoLataus.value = true
  try {
    const res = await sendGameAction(action, payload)
    paivitaTila(res.state)
    if (res.message) {
      tallennusIlmoitus.value = res.message
      setTimeout(() => { tallennusIlmoitus.value = "" }, 3500)
    }
    return true
  } catch (err: any) {
    alert(err.message || 'Toiminto epäonnistui')
    return false
  } finally {
    toimintoLataus.value = false
  }
}

// Toiminnot
const nostaHataapu = () => suoritaPalvelinToiminto('claim-emergency-aid')

const ostaKentta = (ostettava: OstettavaKentta, _index?: number) => {
  suoritaPalvelinToiminto('buy-airport', { airportName: ostettava.nimi })
}

const paivitaKenttaMatkustajaPaikat = (kenttaNimi: string) => {
  suoritaPalvelinToiminto('upgrade-airport', { airportName: kenttaNimi })
}

const ostaOsa = (osa: Osa, _index?: number) => {
  suoritaPalvelinToiminto('buy-part', { partId: osa.id })
}

const ostaKonePaikka = () => {
  suoritaPalvelinToiminto('buy-hangar-slot')
}

const rakennaKone = (piirustus: Piirustus) => {
  suoritaPalvelinToiminto('build-plane', { malliId: piirustus.malliId })
}

const romutaKone = async () => {
  if (!aktiivinenKone.value) return
  const vahvistus = confirm(
    `Haluatko varmasti myydä koneen ${aktiivinenKone.value.nimi} romuttamolle?\n\nSaat tästä 500 € ja vapautat paikan hangaarista.`
  )
  if (vahvistus) {
    const ok = await suoritaPalvelinToiminto('scrap-plane', { planeId: aktiivinenKone.value.id })
    if (ok) {
      valittuKoneId.value = null
    }
  }
}

const paivitaNopeus = () => {
  if (aktiivinenKone.value) {
    suoritaPalvelinToiminto('upgrade-plane', { planeId: aktiivinenKone.value.id, type: 'speed' })
  }
}

const paivitaKulutus = () => {
  if (aktiivinenKone.value) {
    suoritaPalvelinToiminto('upgrade-plane', { planeId: aktiivinenKone.value.id, type: 'consumption' })
  }
}

const paivitaTilavuus = () => {
  if (aktiivinenKone.value) {
    suoritaPalvelinToiminto('upgrade-plane', { planeId: aktiivinenKone.value.id, type: 'capacity' })
  }
}

const lisaaMatkustaja = (matkustaja: Matkustaja, _indeksi?: number) => {
  if (aktiivinenKone.value) {
    suoritaPalvelinToiminto('load-passenger', { planeId: aktiivinenKone.value.id, passengerId: matkustaja.id })
  }
}

const poistaMatkustaja = (matkustaja: Matkustaja, _indeksi?: number) => {
  if (aktiivinenKone.value) {
    suoritaPalvelinToiminto('unload-passenger', { planeId: aktiivinenKone.value.id, passengerId: matkustaja.id })
  }
}

const lahetaKone = async () => {
  if (!aktiivinenKone.value || !valittuKentta.value || suunniteltuReitti.value.length === 0) return
  const ok = await suoritaPalvelinToiminto('dispatch-plane', {
    planeId: aktiivinenKone.value.id,
    route: suunniteltuReitti.value
  })
  if (ok) {
    valittuKoneId.value = null
    valittuKentta.value = null
    suunniteltuReitti.value = []
  }
}

const tallennaPeliPilveen = () => {
  lataaTilaPalvelimelta(true)
}

const kirjauduUlos = async () => {
  await logout()
  kayttaja.value = null
  router.push({ name: 'login' })
}

const haeLeaderboard = async (naytaLataus = false) => {
  if (naytaLataus && leaderboardData.value.length === 0) {
    leaderboardLataus.value = true
  }
  try {
    const data = await fetchLeaderboard(leaderboardLajittelu.value)
    leaderboardData.value = data
  } catch (err: any) {
    console.error('Tulostaulun haku epäonnistui:', err)
  } finally {
    leaderboardLataus.value = false
  }
}

const vaihdaLeaderboardLajittelu = (uusiLajittelu: 'rahat' | 'taso' | 'koneet' | 'lennot' | 'matkustajat' | 'kulta') => {
  leaderboardLajittelu.value = uusiLajittelu
  haeLeaderboard(true)
}

const avaaLeaderboard = () => {
  leaderboardAuki.value = true
  haeLeaderboard(true)
  if (leaderboardInterval) clearInterval(leaderboardInterval)
  leaderboardInterval = setInterval(() => {
    if (leaderboardAuki.value) {
      haeLeaderboard(false)
    }
  }, 10000)
}

const suljeLeaderboard = () => {
  leaderboardAuki.value = false
  if (leaderboardInterval) {
    clearInterval(leaderboardInterval)
    leaderboardInterval = null
  }
}

// Navigointi ja valinnat
const haeKoneetKentalla = (kenttaNimi: string) =>
  lentokoneet.value.filter(k => k.sijainti === kenttaNimi && k.tila === "Maassa")

const lennollaOlevat = computed(() => {
  return lentokoneet.value
    .filter(k => k.tila === "Ilmassa")
    .sort((a, b) => a.lentoAikaJaljella - b.lentoAikaJaljella)
})

const laskeLennonEdistyminen = (kone: Lentokone) => {
  if (kone.tila !== "Ilmassa" || !kone.arrivalAt || !kone.departedAt) return 0
  const kokonaisaika = kone.arrivalAt - kone.departedAt
  if (kokonaisaika <= 0) return 100
  const kulunut = Date.now() - kone.departedAt
  return Math.min(100, Math.max(0, Math.round((kulunut / kokonaisaika) * 100)))
}

const aktiivinenKone = computed(() => lentokoneet.value.find(k => k.id === valittuKoneId.value))

const hintaNopeus = computed(() => aktiivinenKone.value ? laskeHintaNopeus(aktiivinenKone.value.nopeusTaso) : 0)
const hintaKulutus = computed(() => aktiivinenKone.value ? laskeHintaKulutus(aktiivinenKone.value.kulutusTaso) : 0)
const hintaTilavuus = computed(() => aktiivinenKone.value ? laskeHintaTilavuus(aktiivinenKone.value.tilavuusTaso) : 0)

const hintaKentalle = (kentta: OstettavaKentta) => laskeHintaKentalle(kentta, avatutKentat.value)
const hintaKenttaMatkustajaPaikka = (kenttaNimi: string) => {
  const k = avatutKentat.value[kenttaNimi]
  return k ? laskeHintaKenttaMatkustajaPaikka(k) : 1500
}

const valitseKentta = (kentta: string) => {
  if (haeKoneetKentalla(kentta).length > 0) valittuKentta.value = kentta
}
const valitseKone = (id: number) => {
  valittuKoneId.value = id
  suunniteltuReitti.value = []
}
const lisaaReitille = (kentta: string) => suunniteltuReitti.value.push(kentta)
const tyhjennaReitti = () => { suunniteltuReitti.value = [] }

const meneTaaksepain = () => {
  if (tyopajaAuki.value) tyopajaAuki.value = false
  else if (kenttaKauppaAuki.value) kenttaKauppaAuki.value = false
  else if (tilastotAuki.value) tilastotAuki.value = false
  else if (valittuKoneId.value !== null) { valittuKoneId.value = null; suunniteltuReitti.value = [] }
  else if (valittuKentta.value !== null) valittuKentta.value = null
}

const mallinNimi = (malliId: string) =>
  rakennettavatMallit.find(m => m.malliId === malliId)?.nimi || malliId

const onkoOsaOmistuksessa = (malliId: string, tyyppi: OsaTyyppi) =>
  omistetutOsat.value.some(o => o.malliId === malliId && o.tyyppi === tyyppi)

const onkoValmisRakennettavaksi = (malliId: string) => {
  const tarvittavat: OsaTyyppi[] = ['moottori', 'runko', 'siivet']
  return tarvittavat.every(t => onkoOsaOmistuksessa(malliId, t))
}

const ryhmitellytMatkustajat = computed(() => {
  if (!valittuKentta.value) return []
  const kentta = valittuKentta.value
  const lista = matkustajatKentilla.value[kentta] || []

  const ryhmat: Record<string, { matkustaja: Matkustaja; alkuperainenIndeksi: number }[]> = {}

  lista.forEach((m, alkuperainenIndeksi) => {
    if (!ryhmat[m.kohde]) {
      ryhmat[m.kohde] = []
    }
    ryhmat[m.kohde].push({ matkustaja: m, alkuperainenIndeksi })
  })

  const ryhmaTaulukko = Object.keys(ryhmat).map(kohde => {
    const etaisyys = haeEtaisyys(kentta, kohde)
    return {
      kohde,
      etaisyys,
      jasenet: ryhmat[kohde]
    }
  })

  ryhmaTaulukko.sort((a, b) => a.etaisyys - b.etaisyys)
  return ryhmaTaulukko
})

const reittiTiedot = computed(() => {
  if (!aktiivinenKone.value || !valittuKentta.value) return null
  return laskeReitinTiedot(aktiivinenKone.value, valittuKentta.value, suunniteltuReitti.value)
})

const lahetettavatKentat = computed(() => {
  if (!valittuKentta.value) return []
  const nykyinenPiste = suunniteltuReitti.value.length > 0
    ? suunniteltuReitti.value[suunniteltuReitti.value.length - 1]
    : valittuKentta.value

  return Object.keys(avatutKentat.value)
    .filter(kentta => kentta !== nykyinenPiste)
    .map(kentta => ({
      nimi: kentta,
      etaisyys: haeEtaisyys(nykyinenPiste, kentta)
    }))
    .sort((a, b) => a.etaisyys - b.etaisyys)
})

const muotoileAika = (sekunnit: number) => {
  const min = Math.floor(sekunnit / 60)
  const sek = sekunnit % 60
  return `${min}:${sek < 10 ? '0' + sek : sek}`
}

let tickTimer: any = null
let syncTimer: any = null

onMounted(async () => {
  // Tarkistetaan profiili
  const profiili = await getCurrentProfile()
  if (profiili) {
    kayttaja.value = { id: profiili.id }
    pelaajanNimi.value = profiili.username
    await lataaTilaPalvelimelta()
  } else {
    router.push({ name: 'login' })
    return
  }

  // Paikallinen sekuntikello sulavaan näyttöön
  tickTimer = setInterval(() => {
    // 1. Hätäapujäähy
    if (hataapuCooldown.value > 0) {
      hataapuCooldown.value--
    }

    // 2. Aika päivitykseen
    if (aikaSeuraavaanPaivitykseen.value > 0) {
      aikaSeuraavaanPaivitykseen.value--
      if (aikaSeuraavaanPaivitykseen.value === 0) {
        lataaTilaPalvelimelta()
      }
    }

    // 3. Lentojen lokaali laskenta
    let jokinLaskeutui = false
    lentokoneet.value.forEach(kone => {
      if (kone.tila === "Ilmassa") {
        if (kone.lentoAikaJaljella > 0) {
          kone.lentoAikaJaljella--
        }
        if (kone.lentoAikaJaljella <= 0) {
          jokinLaskeutui = true
        }
      }
    })

    // Kun kone saapuu perille, synkronoidaan palvelimelta viralliset tuotot ja tila
    if (jokinLaskeutui) {
      lataaTilaPalvelimelta()
    }
  }, 1000)

  // Automaattinen taustasynkkaus palvelimen kanssa 15s välein
  syncTimer = setInterval(() => {
    lataaTilaPalvelimelta()
  }, 15000)
})

onUnmounted(() => {
  if (tickTimer) clearInterval(tickTimer)
  if (syncTimer) clearInterval(syncTimer)
  if (leaderboardInterval) clearInterval(leaderboardInterval)
})
</script>

<template>
  <div class="peli-alusta dark-theme">
    
    <div class="top-bar">
      <div class="kassa-rivi">
        <div class="mittari-kortti rahat-kortti" title="Kassavarat">
          <div class="mittari-ikoni-pallo rahat-halo">
            <span class="mittari-ikoni">💰</span>
          </div>
          <div class="mittari-tekstit">
            <span class="mittari-otsikko">Kassavarat</span>
            <span class="mittari-summa" :class="{'miinus': rahat < 0}">{{ Number(rahat).toLocaleString() }} €</span>
          </div>
        </div>

        <div class="mittari-kortti kulta-kortti" title="Kultavarat">
          <div class="mittari-ikoni-pallo kulta-halo">
            <span class="mittari-ikoni">🟡</span>
          </div>
          <div class="mittari-tekstit">
            <span class="mittari-otsikko">Kulta</span>
            <span class="mittari-summa kulta-teksti">{{ Number(kulta).toLocaleString() }}</span>
          </div>
        </div>

        <div class="mittari-kortti taso-kortti" title="Nykyinen kokemustasosi">
          <div class="mittari-ikoni-pallo taso-halo">
            <span class="mittari-ikoni">⭐</span>
          </div>
          <div class="mittari-tekstit">
            <span class="mittari-otsikko">Taso</span>
            <span class="mittari-summa taso-teksti">Taso {{ taso }}</span>
          </div>
        </div>
      </div>

      <div v-if="tallennusIlmoitus" class="tallennus-pop">{{ tallennusIlmoitus }}</div>
      <div v-if="kultaIlmoitus" class="kulta-pop">{{ kultaIlmoitus }}</div>

      <div class="ajastin-rivi">
        <span class="ajastin-pala">🛫 Hangaari: <strong>{{ lentokoneet.length }} / {{ maksimiKonePaikat }}</strong></span>
        <span class="ajastin-piste">•</span>
        <span class="ajastin-pala">⏱️ Seuraava päivitys: <strong>{{ muotoileAika(aikaSeuraavaanPaivitykseen) }}</strong></span>
      </div>
    </div>

    <!-- PÄÄNAVIGOINTI -->
    <div v-if="!valittuKentta && !tyopajaAuki && !kenttaKauppaAuki && !tilastotAuki" class="nav-alue">
      <div class="yla-napit-rivi">
        <button 
          class="mini-nappi keraa-nappi" 
          :disabled="hataapuCooldown > 0"
          @click="nostaHataapu"
          :class="{ 'valmis-syke': hataapuCooldown === 0 }"
        >
          <span class="nappi-ikoni">🟡</span>
          <div class="nappi-tekstit">
            <span class="nappi-otsikko">Kerää (+100 €)</span>
            <span v-if="hataapuCooldown > 0" class="hataapu-ajastin">{{ muotoileAika(hataapuCooldown) }} s</span>
            <span v-else class="hataapu-valmis">Valmis!</span>
          </div>
        </button>
        <button class="mini-nappi tehdas-nappi" @click="tyopajaAuki = true">
          <span class="nappi-ikoni">🔧</span>
          <span class="nappi-otsikko">Tehdas</span>
        </button>
        <button class="mini-nappi kauppa-nappi" @click="kenttaKauppaAuki = true">
          <span class="nappi-ikoni">🌐</span>
          <span class="nappi-otsikko">Kentät</span>
        </button>
        <button class="mini-nappi stats-nappi" @click="tilastotAuki = true">
          <span class="nappi-ikoni">📊</span>
          <span class="nappi-otsikko">Tilastot</span>
        </button>
      </div>

      <div class="yla-napit-rivi ala-napit">
        <button class="mini-nappi cloud-save-nappi" @click="tallennaPeliPilveen" title="Tallenna peli pilveen">
          <span class="nappi-ikoni">☁️</span>
          <span>Tallenna</span>
        </button>
        <button class="mini-nappi trophy-nappi" @click="avaaLeaderboard" title="Avaa tulostaulu">
          <span class="nappi-ikoni">🏆</span>
          <span>Tulostaulu</span>
        </button>
        <button class="mini-nappi cloud-nappi" @click="kirjauduUlos" :title="`Kirjaudu ulos (${pelaajanNimi || 'Pelaaja'})`">
          <span class="nappi-ikoni">🚪</span>
          <span>{{ pelaajanNimi || 'Ulos' }}</span>
        </button>
      </div>
    </div>

    <div class="valikko-container">
      
      <!-- PÄÄVALIKKO -->
      <div v-if="!valittuKentta && !tyopajaAuki && !kenttaKauppaAuki && !tilastotAuki" class="nakyma">
        <div class="osio-otsikko-rivi">
          <h1>📍 Omat lentokentät</h1>
          <span class="osio-badge">{{ Object.keys(avatutKentat).length }} kenttää</span>
        </div>

        <ul class="lista kentta-lista">
          <li 
            v-for="(kData, kenttaNimi) in avatutKentat" 
            :key="kenttaNimi"
            @click="valitseKentta(kenttaNimi)"
            :class="['kentta-kortti', `tier-reuna-${kData.tier}`, { 'disabled': haeKoneetKentalla(kenttaNimi).length === 0 }]"
          >
            <div class="kentta-ylariivi">
              <div class="kentta-nimi-alue">
                <span class="kentta-ikoni">📍</span>
                <span class="lista-otsikko">{{ kenttaNimi }}</span>
              </div>
              <span :class="['tier-badge', `tier-${kData.tier}`]">Tier {{ kData.tier }}</span>
            </div>

            <div class="kentta-info-rivi">
              <span class="kentta-chip" :class="{ 'on-koneita': haeKoneetKentalla(kenttaNimi).length > 0 }">
                ✈️ {{ haeKoneetKentalla(kenttaNimi).length }} konetta
              </span>
              <span class="kentta-chip">
                👥 {{ matkustajatKentilla[kenttaNimi]?.length || 0 }} / {{ kData.maxMatkustajat }} matkustajaa
              </span>
            </div>

            <div class="kapasiteetti-kisko" title="Odotussalin täyttöaste">
              <div 
                class="kapasiteetti-tayte"
                :style="{ width: Math.min(100, Math.round(((matkustajatKentilla[kenttaNimi]?.length || 0) / (kData.maxMatkustajat || 1)) * 100)) + '%' }"
              ></div>
            </div>
          </li>
        </ul>

        <!-- LENNOLLE OLEVAT KONEET ANIMOIDULLA RADARILLA -->
        <div v-if="lennollaOlevat.length > 0" class="lennolla-osio">
          <div class="osio-otsikko-rivi">
            <h2>✈️ Lennolla juuri nyt</h2>
            <span class="live-radar-badge">
              <span class="pulse-dot"></span>
              {{ lennollaOlevat.length }} kone{{ lennollaOlevat.length > 1 ? 'tta' : '' }} ilmassa
            </span>
          </div>

          <ul class="lista lennolla-lista">
            <li v-for="kone in lennollaOlevat" :key="kone.id" class="lento-kortti">
              <div class="lento-kortti-header">
                <div class="lento-kone-nimi">
                  <span class="kone-ikoni-animoitu">✈️</span>
                  <span>{{ kone.nimi }}</span>
                </div>
                <span class="lento-ajastin-badge">
                  ⏱️ {{ kone.lentoAikaJaljella }} s
                </span>
              </div>

              <!-- Animoitu lentoreitti ja reaaliaikainen koneen eteneminen -->
              <div class="lento-radar-kisko">
                <div class="lento-radar-tayte" :style="{ width: laskeLennonEdistyminen(kone) + '%' }"></div>
                <div 
                  class="lento-lentava-kone" 
                  :style="{ left: Math.min(94, Math.max(3, laskeLennonEdistyminen(kone))) + '%' }"
                >
                  ✈️
                </div>
              </div>

              <div class="lento-kortti-footer">
                <div class="lento-kohde-alue">
                  <span class="lento-suunta-teksti">Kohti kenttää:</span>
                  <strong class="lento-kohde-nimi">🛬 {{ kone.kohde }}</strong>
                  <span class="lento-prosentti-badge">({{ laskeLennonEdistyminen(kone) }}%)</span>
                </div>
                <div class="lento-pikkutiedot">
                  <span class="lento-mini-chip">👥 {{ kone.matkustajatKyydissa.length }}/{{ kone.matkustajaMaara }} hlö</span>
                  <span class="lento-mini-chip">💨 {{ kone.nopeus }} km/h</span>
                  <span v-if="kone.onBonusLento" class="lento-mini-chip bonus">✨ +25%</span>
                </div>
              </div>
            </li>
          </ul>
        </div>
      </div>

      <!-- TILASTOSIVU -->
      <div v-else-if="tilastotAuki" class="nakyma">
        <h1>📊 Yrityksen Tilastot</h1>
        <ul class="lista stats-lista">
          <li>
            <div class="lista-otsikko">🛫 Tehdyt lennot</div>
            <div class="lista-info stats-arvo">{{ tilastot.tehdytLennot }} kpl</div>
          </li>
          <li>
            <div class="lista-otsikko">🌍 Lennodetyt kilometrit</div>
            <div class="lista-info stats-arvo">{{ tilastot.lennodetytKilometrit }} km</div>
          </li>
          <li>
            <div class="lista-otsikko">💰 Ansaitut kokonaisrahat</div>
            <div class="lista-info stats-arvo tulo-teksti">+{{ tilastot.ansaitutRahat }} €</div>
          </li>
          <li>
            <div class="lista-otsikko">⛽ Polttoainekulut yhteensä</div>
            <div class="lista-info stats-arvo kulu-teksti">-{{ tilastot.kulutetutRahatPolttoaineeseen }} €</div>
          </li>
          <li>
            <div class="lista-otsikko">🧍 Kuljetut matkustajat</div>
            <div class="lista-info stats-arvo">{{ tilastot.kuljetutMatkustajat }} matkustajaa</div>
          </li>
          <li>
            <div class="lista-otsikko">🟡 Kerätyt kullat</div>
            <div class="lista-info stats-arvo kulta-teksti">{{ tilastot.keratytKullat }} kultaa</div>
          </li>
          <li>
            <div class="lista-otsikko">⭐ Taso ja kokemus</div>
            <div class="lista-info stats-arvo taso-arvo">Taso {{ taso }} ({{ xp.toLocaleString() }} / {{ tasonMaksimiXp.toLocaleString() }} XP)</div>
          </li>
          <li>
            <div class="lista-otsikko">🔨 Rakennetut koneet</div>
            <div class="lista-info stats-arvo">{{ tilastot.rakennetutKoneet }} konetta</div>
          </li>
        </ul>
      </div>

      <!-- LENTOKENTTÄKAUPPA & UPGRADET -->
      <div v-else-if="kenttaKauppaAuki" class="nakyma">
        <h1>🌐 Lentokentät & Kehitys</h1>
        
        <h2>🌟 Päivitä omia lentokenttiä</h2>
        <ul class="lista">
          <li v-for="(kData, kNimi) in avatutKentat" :key="kNimi" class="kanta-upgrade-rivi">
            <div class="lista-otsikko">{{ kData.nimi }} (Tier {{ kData.tier }})</div>
            <div class="lista-info" style="margin-bottom: 8px;">
              Matkustajakapasiteetti: <strong>{{ kData.maxMatkustajat }}</strong> hlö
            </div>
            <div class="upgrade-buttons">
              <button @click="paivitaKenttaMatkustajaPaikat(kNimi)" :disabled="rahat < hintaKenttaMatkustajaPaikka(kNimi)">
                +2 Matkustajapaikkaa<br/><span class="hinta-teksti">{{ hintaKenttaMatkustajaPaikka(kNimi) }} €</span>
              </button>
            </div>
          </li>
        </ul>

        <div v-if="ostettavatKentat.length > 0" class="kauppa-osio">
          <h2>🔒 Osta uusia lentokenttiä</h2>
          <p class="ohjeteksti">Hinta määräytyy kapasiteetin mukaan ja nousee saman tason (Tier) kenttiä ostettaessa.</p>
          <ul class="lista">
            <li 
              v-for="(kentta, index) in ostettavatKentat" 
              :key="kentta.nimi"
              @click="ostaKentta(kentta, index)"
              :class="{ 'liian-kallis': rahat < hintaKentalle(kentta) }"
              class="kauppa-rivi"
            >
              <div class="lista-otsikko">
                Avaa {{ kentta.nimi }} <span class="tier-badge">Tier {{ kentta.tier }}</span>
              </div>
              <div class="lista-info">
                Max matkustajat: {{ kentta.maxMatkustajat }} hlö
              </div>
              <div class="lista-info hinta-teksti">Hinta: {{ hintaKentalle(kentta) }} €</div>
            </li>
          </ul>
        </div>
        <div v-else class="tyhja-lista" style="text-align: center; margin-top: 30px;">
          Kaikki maailman lentokentät on jo avattu! 🏆
        </div>
      </div>

      <!-- LENTOKONETEHDAS & KAUPPA -->
      <div v-else-if="tyopajaAuki" class="nakyma">
        <h1>🔧 Lentokonetehdas</h1>
        
        <div class="reitti-paneeli hangaari-paneeli">
          <h2>Hangaarin kapasiteetti: {{ lentokoneet.length }} / {{ maksimiKonePaikat }}</h2>
          <button 
            class="osta-paikka-nappi" 
            :disabled="rahat < uudenPaikanHinta"
            @click="ostaKonePaikka"
          >
            + Osta uusi konepaikka ({{ uudenPaikanHinta }} €)
          </button>
        </div>

        <h2>Osakauppa</h2>
        <ul class="lista">
          <li 
            v-for="(osa, index) in kaupanOsat" 
            :key="index"
            @click="ostaOsa(osa, index)"
            :class="{ 'liian-kallis': kulta < osa.hinta || onkoOsaOmistuksessa(osa.malliId, osa.tyyppi) }"
          >
            <div class="lista-otsikko">{{ mallinNimi(osa.malliId) }} - <span class="osa-nimi">{{ osa.tyyppi.toUpperCase() }}</span></div>
            <div class="lista-info kulta-teksti">Hinta: 🟡 {{ osa.hinta }} kultaa</div>
            <div v-if="onkoOsaOmistuksessa(osa.malliId, osa.tyyppi)" class="tulo-teksti">Omistat jo tämän osan!</div>
          </li>
          <li v-if="kaupanOsat.length === 0" class="tyhja-lista">Kaupan hyllyt ovat tyhjät! Odota päivitystä.</li>
        </ul>

        <h2>Omat Piirustukset & Kokoonpano</h2>
        <ul class="lista">
          <li 
            v-for="piirustus in rakennettavatMallit" 
            :key="piirustus.malliId" 
            :class="['piirustus-rivi', { 'piirustus-lukittu': taso < (piirustus.vaadittuTaso || 1) }]"
          >
            <div class="piirustus-header-rivi">
              <div class="lista-otsikko">
                <span v-if="taso < (piirustus.vaadittuTaso || 1)">🔒 </span>
                <span v-else>✈️ </span>
                {{ piirustus.nimi }}
              </div>
              <span v-if="taso < (piirustus.vaadittuTaso || 1)" class="lukittu-taso-badge">
                🔒 Vaatii tason {{ piirustus.vaadittuTaso }}
              </span>
              <span v-else-if="(piirustus.vaadittuTaso || 1) > 1" class="auki-taso-badge">
                ⭐ Taso {{ piirustus.vaadittuTaso }}
              </span>
            </div>

            <div class="lista-info">Nopeus: {{ piirustus.nopeus }} km/h | Tilaa: {{ piirustus.matkustajaMaara }} hlö</div>
            
            <template v-if="taso >= (piirustus.vaadittuTaso || 1)">
              <div class="osat-kokoelma">
                <span :class="onkoOsaOmistuksessa(piirustus.malliId, 'moottori') ? 'omistaa' : 'puuttuu'">Moottori</span>
                <span :class="onkoOsaOmistuksessa(piirustus.malliId, 'runko') ? 'omistaa' : 'puuttuu'">Runko</span>
                <span :class="onkoOsaOmistuksessa(piirustus.malliId, 'siivet') ? 'omistaa' : 'puuttuu'">Siivet</span>
              </div>

              <button 
                v-if="onkoValmisRakennettavaksi(piirustus.malliId) && lentokoneet.length < maksimiKonePaikat" 
                class="rakenna-nappi"
                @click="rakennaKone(piirustus)"
              >
                🔨 RAKENNA KONE VALMIIKSI!
              </button>
              <div v-else-if="onkoValmisRakennettavaksi(piirustus.malliId) && lentokoneet.length >= maksimiKonePaikat" class="varoitusteksti">
                Hangaari on täynnä! Osta lisää tilaa tai myy vanhoja koneita.
              </div>
            </template>
            <div v-else class="lukittu-selite">
              🔒 Konemallin osat ja kokoonpano avautuvat saavutettuasi tason {{ piirustus.vaadittuTaso }}.
            </div>
          </li>
        </ul>
      </div>

      <!-- KONEVALINTA -->
      <div v-else-if="valittuKentta && !valittuKoneId" class="nakyma">
        <h1>Koneet kentällä: {{ valittuKentta }}</h1>
        <ul class="lista">
          <li 
            v-for="kone in haeKoneetKentalla(valittuKentta)" 
            :key="kone.id"
            @click="valitseKone(kone.id)"
          >
            <div class="lista-otsikko">✈️ {{ kone.nimi }}</div>
            <div class="lista-info">Kapasiteetti: {{ kone.matkustajaMaara }} hlö | Nopeus: {{ kone.nopeus }} km/h</div>
          </li>
        </ul>
      </div>

      <!-- MATKUSTAJAT JA REITIN SUUNNITTELU -->
      <div v-else-if="aktiivinenKone && valittuKentta" class="nakyma">
        
        <!-- KONEEN HEADER JA ROMUTUS -->
        <div class="koneen-header">
          <h1>{{ aktiivinenKone.nimi }}</h1>
          <button class="romuta-nappi" @click="romutaKone">🗑️ Myy romuksi (500 €)</button>
        </div>

        <!-- LENTOKONEEN PÄIVITYSPANEELI -->
        <div class="upgrade-paneeli">
          <div class="lista-otsikko" style="margin-bottom: 10px;">🛠️ Päivitä konetta</div>
          <div class="upgrade-buttons">
            <button @click="paivitaNopeus" :disabled="kulta < hintaNopeus">
              <strong>Nopeus ({{ aktiivinenKone.nopeusTaso }})</strong><br/>
              +20 km/h<br/>
              <span class="kulta-teksti">🟡 {{ hintaNopeus }}</span>
            </button>
            <button @click="paivitaKulutus" :disabled="kulta < hintaKulutus || aktiivinenKone.kulutus <= 2">
              <strong>Kulutus ({{ aktiivinenKone.kulutusTaso }})</strong><br/>
              -15% kulua<br/>
              <span class="kulta-teksti">🟡 {{ aktiivinenKone.kulutus > 2 ? hintaKulutus : 'MAX' }}</span>
            </button>
            <button @click="paivitaTilavuus" :disabled="kulta < hintaTilavuus" class="kallis-nappi">
              <strong>Tilavuus ({{ aktiivinenKone.tilavuusTaso }})</strong><br/>
              +1 Paikka<br/>
              <span class="kulta-teksti">🟡 {{ hintaTilavuus }}</span>
            </button>
          </div>
          <div class="lista-info" style="margin-top: 8px;">
            Statsit: {{ aktiivinenKone.nopeus }} km/h | Kulutus {{ aktiivinenKone.kulutus }} €/h | Paikkoja {{ aktiivinenKone.matkustajaMaara }}
          </div>
        </div>

        <p class="tila-teksti">Paikkoja: {{ aktiivinenKone.matkustajatKyydissa.length }} / {{ aktiivinenKone.matkustajaMaara }}</p>

        <ul class="lista matkustaja-lista kyydissa">
          <li v-for="(matkustaja, index) in aktiivinenKone.matkustajatKyydissa" :key="matkustaja.id" @click="poistaMatkustaja(matkustaja, index)">
            - Poista: {{ matkustaja.nimi }} <strong>(➔ {{ matkustaja.kohde }})</strong>
            <span v-if="matkustaja.tuottaaKultaa" class="kulta-tag">🟡 Kultamatkustaja (+{{ matkustaja.kultaMaara }})</span>
          </li>
          <li v-if="aktiivinenKone.matkustajatKyydissa.length === 0" class="tyhja-lista">Kone on tyhjä.</li>
        </ul>

        <h2>Odottavat matkustajat (Järjestetty lähimmästä kauimpaan):</h2>
        
        <div v-if="ryhmitellytMatkustajat.length > 0">
          <div v-for="ryhma in ryhmitellytMatkustajat" :key="ryhma.kohde" class="matkustaja-ryhma">
            <div class="ryhma-otsikko">
              📍 {{ ryhma.kohde }} <span class="etaisyys-badge">({{ ryhma.etaisyys }} km)</span>
            </div>
            <ul class="lista matkustaja-lista">
              <li v-for="item in ryhma.jasenet" :key="item.matkustaja.id" @click="lisaaMatkustaja(item.matkustaja, item.alkuperainenIndeksi)">
                + Kyytiin: {{ item.matkustaja.nimi }}
                <span v-if="item.matkustaja.tuottaaKultaa" class="kulta-tag">🟡 (+{{ item.matkustaja.kultaMaara }})</span>
              </li>
            </ul>
          </div>
        </div>
        <p v-else class="tyhja-lista">Ei odottajia.</p>

        <div class="suunnittelu-header-lohko">
          <h2>Suunnittele reitti ja lähetä</h2>
          <div class="lahtokentta-banner">
            <div class="lahto-info-vasen">
              <span class="lahto-merkki">🛫 Lähtökaupunki:</span>
              <span class="lahto-kaupunki-nimi">{{ valittuKentta }}</span>
            </div>
            <span v-if="avatutKentat[valittuKentta]" :class="['tier-badge', `tier-${avatutKentat[valittuKentta].tier}`]">
              Tier {{ avatutKentat[valittuKentta].tier }}
            </span>
          </div>
        </div>
        <div v-if="suunniteltuReitti.length > 0" class="reitti-paneeli">
          <div class="reitti-jono">
            Reitti: <strong>{{ valittuKentta }} ➔ {{ suunniteltuReitti.join(' ➔ ') }}</strong>
          </div>
          <button class="tyhjenna-nappi" @click="tyhjennaReitti">Nollaa</button>
          
          <div class="lento-ennuste" v-if="reittiTiedot">
            Kesto: {{ reittiTiedot.aikaSekunteina }}s<br/>
            <span class="kulu-teksti">Polttoaine: -{{ reittiTiedot.kulut }} €</span><br/>
            <span class="tulo-teksti">Tuotto: +{{ reittiTiedot.tulot }} €
              <span v-if="reittiTiedot.isBonus" class="bonus-tag">(Sis. +25%!)</span>
            </span><br/>
            <span v-if="reittiTiedot.arvioKulta > 0" class="kulta-teksti">
              🟡 Arvioitu kultatuotto: +{{ reittiTiedot.arvioKulta }} kultaa
            </span><br/>
            <span :class="reittiTiedot.voitto >= 0 ? 'tulo-teksti' : 'kulu-teksti'" class="voitto-summa">Voitto: {{ reittiTiedot.voitto }} €</span>
          </div>

          <button class="laheta-matkaan-nappi" :disabled="rahat < (reittiTiedot?.kulut || 0)" @click="lahetaKone">LÄHETÄ MATKAAN 🛫</button>
        </div>
        
        <p v-else class="ohjeteksti">Klikkaa alta kenttiä lisätäksesi ne reitille (järjestetty lähimmästä kauimpaan):</p>

        <ul class="lista lahetys-lista">
          <li 
            v-for="etappi in lahetettavatKentat" 
            :key="etappi.nimi"
            @click="lisaaReitille(etappi.nimi)"
          >
            <div class="lista-otsikko">
              + Lisää etappi: {{ etappi.nimi }} 
              <span class="etaisyys-badge">({{ etappi.etaisyys }} km)</span>
            </div>
          </li>
        </ul>
      </div>

    </div>

    <!-- LEADERBOARD (TULOSTAULU) -->
    <div v-if="leaderboardAuki" class="modal-overlay" @click.self="suljeLeaderboard">
      <div class="modal-content leaderboard-modal">
        <div class="leaderboard-header">
          <div class="leaderboard-otsikko-alue">
            <h2>🏆 Lentoyhtiöiden Tulostaulu</h2>
            <div class="live-indikaattori">
              <span class="pulse-dot"></span>
              <span>Reaaliaikainen päivitys aktiivinen</span>
            </div>
          </div>
          <button class="sulje-risti" @click="suljeLeaderboard">✕</button>
        </div>

        <!-- KATEGORIAPAINIKKEET -->
        <div class="leaderboard-kategoriat">
          <button
            :class="['kategoria-nappi', { aktiivinen: leaderboardLajittelu === 'rahat' }]"
            @click="vaihdaLeaderboardLajittelu('rahat')"
          >
            💰 Kassavarat
          </button>
          <button
            :class="['kategoria-nappi', { aktiivinen: leaderboardLajittelu === 'taso' }]"
            @click="vaihdaLeaderboardLajittelu('taso')"
          >
            ⭐ Taso
          </button>
          <button
            :class="['kategoria-nappi', { aktiivinen: leaderboardLajittelu === 'koneet' }]"
            @click="vaihdaLeaderboardLajittelu('koneet')"
          >
            ✈️ Laivasto
          </button>
          <button
            :class="['kategoria-nappi', { aktiivinen: leaderboardLajittelu === 'lennot' }]"
            @click="vaihdaLeaderboardLajittelu('lennot')"
          >
            🛫 Lennot
          </button>
          <button
            :class="['kategoria-nappi', { aktiivinen: leaderboardLajittelu === 'matkustajat' }]"
            @click="vaihdaLeaderboardLajittelu('matkustajat')"
          >
            👥 Matkustajat
          </button>
          <button
            :class="['kategoria-nappi', { aktiivinen: leaderboardLajittelu === 'kulta' }]"
            @click="vaihdaLeaderboardLajittelu('kulta')"
          >
            🟡 Kulta
          </button>
        </div>

        <!-- TULOSTAULUN LISTA -->
        <div class="leaderboard-lista-wrapper">
          <ul class="lista leaderboard-lista">
            <li
              v-for="(tulos, index) in leaderboardData"
              :key="tulos.userId || tulos.user_id || index"
              :class="['leaderboard-rivi', { 'oma-rivi': (tulos.userId || tulos.user_id) === kayttaja?.id }]"
            >
              <div class="sija">
                <span v-if="index === 0" class="mitali mitali-kulta" title="1. Sija">🥇</span>
                <span v-else-if="index === 1" class="mitali mitali-hopea" title="2. Sija">🥈</span>
                <span v-else-if="index === 2" class="mitali mitali-pronssi" title="3. Sija">🥉</span>
                <span v-else class="sija-numero">#{{ index + 1 }}</span>
              </div>

              <div class="pelaaja-tiedot">
                <div class="pelaaja-otsikkorivi">
                  <span class="lista-otsikko">{{ tulos.pelaajanNimi || tulos.pelaajan_nimi || 'Pelaaja' }}</span>
                  <span class="taso-tagi">⭐ Taso {{ tulos.taso || 1 }}</span>
                  <span v-if="(tulos.userId || tulos.user_id) === kayttaja?.id" class="sina-tagi">Sinä</span>
                </div>

                <!-- Korostettu päämittari valitun kategorian mukaan -->
                <div class="paamittari-rivi">
                  <span v-if="leaderboardLajittelu === 'rahat'" class="paamittari rahat">
                    💰 {{ Number(tulos.rahat).toLocaleString() }} €
                  </span>
                  <span v-else-if="leaderboardLajittelu === 'taso'" class="paamittari taso">
                    ⭐ Taso {{ tulos.taso || 1 }}
                  </span>
                  <span v-else-if="leaderboardLajittelu === 'koneet'" class="paamittari koneet">
                    ✈️ {{ tulos.koneet }} lentokonetta
                  </span>
                  <span v-else-if="leaderboardLajittelu === 'lennot'" class="paamittari lennot">
                    🛫 {{ tulos.lennot }} lentoa
                  </span>
                  <span v-else-if="leaderboardLajittelu === 'matkustajat'" class="paamittari matkustajat">
                    👥 {{ tulos.matkustajat }} matkustajaa
                  </span>
                  <span v-else-if="leaderboardLajittelu === 'kulta'" class="paamittari kulta">
                    🟡 {{ tulos.kulta }} kultaa
                  </span>
                </div>

                <!-- Täydet osatilastot pikkulappuina -->
                <div class="mini-tilastot">
                  <span class="stat-badge taso-badge" title="Taso">⭐ Taso {{ tulos.taso || 1 }}</span>
                  <span class="stat-badge" title="Kassavarat">💰 {{ tulos.rahat }} €</span>
                  <span class="stat-badge" title="Omistetut koneet">✈️ {{ tulos.koneet }}</span>
                  <span class="stat-badge" title="Tehdyt lennot">🛫 {{ tulos.lennot }}</span>
                  <span class="stat-badge" title="Kuljetetut matkustajat">👥 {{ tulos.matkustajat }}</span>
                  <span class="stat-badge" title="Kultavarat">🟡 {{ tulos.kulta }}</span>
                </div>
              </div>
            </li>

            <li v-if="leaderboardLataus && leaderboardData.length === 0" class="tyhja-lista">
              Ladataan tulostaulua...
            </li>
            <li v-else-if="!leaderboardLataus && leaderboardData.length === 0" class="tyhja-lista">
              Ei vielä pelaajatuloksia.
            </li>
          </ul>
        </div>

        <button class="sulje-modal" @click="suljeLeaderboard">Sulje</button>
      </div>
    </div>

    <!-- SININEN XP-PALKKI JA TASO ALAKULMASSA -->
    <div class="xp-widget-alakulma" title="Kokemustaso ja eteneminen seuraavalle tasolle">
      <div class="xp-widget-sisus">
        <div class="xp-otsikkorivi">
          <div class="xp-taso-otsikko">
            <span class="xp-tahti">⭐</span>
            <span class="xp-taso-teksti">Taso {{ taso }}</span>
          </div>
          <span class="xp-arvo-teksti">{{ xp.toLocaleString() }} / {{ tasonMaksimiXp.toLocaleString() }} XP</span>
        </div>
        <div class="xp-kisko">
          <div class="xp-tayte" :style="{ width: xpProsentti + '%' }"></div>
        </div>
        <div class="xp-alarivi">
          <span>Seuraava taso: {{ xpProsentti }}%</span>
          <span class="xp-puuttuu">Puuttuu {{ Math.max(0, tasonMaksimiXp - xp).toLocaleString() }} XP</span>
        </div>
      </div>
    </div>

    <!-- TAKAISIN-NAPPI -->
    <button v-if="valittuKentta || tyopajaAuki || kenttaKauppaAuki || tilastotAuki" class="takaisin-nappi" @click="meneTaaksepain">✕</button>
  </div>
</template>

<style scoped>
.peli-alusta { 
  user-select: none; 
  -webkit-user-select: none; 
  -moz-user-select: none; 
  -ms-user-select: none; 
}

.dark-theme { 
  min-height: 100vh; 
  font-family: var(--font-body, 'Inter', sans-serif); 
  padding: 16px 16px 110px 16px; 
  box-sizing: border-box; 
  color: var(--text-main, #e2e8f0);
}

/* YLÄPALKKI & MITTARIT (HUD) */
.top-bar { 
  background: rgba(15, 23, 38, 0.85); 
  border: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  padding: 14px 18px; 
  border-radius: 16px; 
  margin-bottom: 12px; 
  max-width: 660px; 
  margin-left: auto; 
  margin-right: auto; 
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.06);
  position: relative; 
}

.kassa-rivi { 
  display: grid; 
  grid-template-columns: repeat(3, 1fr); 
  gap: 10px; 
}

.mittari-kortti {
  background: rgba(20, 30, 48, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  padding: 8px 10px;
  display: flex;
  align-items: center;
  gap: 10px;
  transition: all 0.2s ease;
}

.mittari-kortti:hover {
  transform: translateY(-2px);
  border-color: rgba(255, 255, 255, 0.16);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3);
}

.mittari-ikoni-pallo {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  flex-shrink: 0;
  box-shadow: inset 0 1px 2px rgba(255, 255, 255, 0.2);
}

.rahat-halo { 
  background: rgba(76, 175, 80, 0.18); 
  border: 1px solid rgba(76, 175, 80, 0.4); 
  box-shadow: 0 0 12px rgba(76, 175, 80, 0.2);
}

.kulta-halo { 
  background: rgba(255, 213, 79, 0.18); 
  border: 1px solid rgba(255, 213, 79, 0.4); 
  box-shadow: 0 0 12px rgba(255, 213, 79, 0.2);
}

.taso-halo { 
  background: rgba(0, 210, 255, 0.18); 
  border: 1px solid rgba(0, 210, 255, 0.4); 
  box-shadow: 0 0 12px rgba(0, 210, 255, 0.2);
}

.mittari-tekstit {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: 0;
}

.mittari-otsikko {
  font-size: 0.66rem;
  text-transform: uppercase;
  letter-spacing: 0.7px;
  color: var(--text-muted, #94a3b8);
  font-weight: 600;
}

.mittari-summa {
  font-size: 1rem;
  font-weight: 700;
  font-family: var(--font-head, 'Outfit', sans-serif);
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.rahat-kortti .mittari-summa { color: #4caf50; }
.kulta-teksti { color: #ffd54f !important; font-weight: bold; }
.taso-teksti { color: #64b5f6 !important; font-weight: bold; }
.miinus { color: #ef5350 !important; }

.ajastin-rivi { 
  display: flex; 
  justify-content: center; 
  align-items: center; 
  gap: 12px; 
  margin-top: 10px; 
  padding-top: 10px; 
  border-top: 1px solid rgba(255, 255, 255, 0.05); 
  font-size: 0.78rem; 
  color: #8fa3b8; 
}

.ajastin-pala strong { color: #cbd5e1; }
.ajastin-piste { opacity: 0.4; }

/* POPUP-ILMOITUKSET */
.kulta-pop { 
  position: absolute; 
  top: -14px; 
  right: 20px; 
  background: linear-gradient(135deg, #ffd54f, #ffb300); 
  color: #0d131a; 
  padding: 5px 12px; 
  border-radius: 20px; 
  font-weight: 800; 
  font-size: 0.85rem;
  box-shadow: 0 4px 15px rgba(255, 213, 79, 0.5); 
  animation: pop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); 
  z-index: 10;
}

.tallennus-pop { 
  position: absolute; 
  top: -14px; 
  left: 20px; 
  background: linear-gradient(135deg, #4caf50, #2e7d32); 
  color: #fff; 
  padding: 5px 12px; 
  border-radius: 20px; 
  font-size: 0.82rem; 
  font-weight: 700; 
  box-shadow: 0 4px 15px rgba(76, 175, 80, 0.5); 
  animation: pop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); 
  z-index: 10;
}

@keyframes pop { 
  0% { transform: scale(0.6); opacity: 0; } 
  70% { transform: scale(1.15); } 
  100% { transform: scale(1); opacity: 1; } 
}

/* PÄÄNAVIGOINTI JA PIENET YLÄNAPIT */
.nav-alue {
  max-width: 660px;
  margin: 0 auto 16px auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.yla-napit-rivi { 
  display: flex; 
  gap: 8px; 
}

.ala-napit {
  margin-top: 0;
}

.mini-nappi { 
  flex: 1; 
  padding: 9px 10px; 
  font-size: 0.85rem; 
  font-weight: 600; 
  border: 1px solid rgba(100, 160, 230, 0.18); 
  border-radius: 10px; 
  cursor: pointer; 
  color: #f1f5f9; 
  background: rgba(22, 32, 50, 0.8);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); 
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25); 
}

.mini-nappi:hover { 
  transform: translateY(-2px); 
  border-color: rgba(0, 210, 255, 0.4);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.35); 
}

.mini-nappi:active {
  transform: scale(0.97);
}

.nappi-ikoni { font-size: 1rem; }

/* Erikoisnappien teemat */
.keraa-nappi { 
  flex: 1.35;
  background: linear-gradient(135deg, rgba(243, 156, 18, 0.25) 0%, rgba(180, 80, 0, 0.2) 100%); 
  border-color: rgba(243, 156, 18, 0.45); 
  color: #ffd54f; 
}

.nappi-tekstit {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  line-height: 1.15;
}

.nappi-otsikko { font-size: 0.82rem; font-weight: 700; }
.hataapu-ajastin { font-size: 0.7rem; color: #cbd5e1; font-weight: 500; }
.hataapu-valmis { font-size: 0.7rem; color: #a5d6a7; font-weight: 700; text-transform: uppercase; }

/* Hätäavun kultainen sykeanimaatio kun noudettavissa */
.valmis-syke {
  animation: goldPulse 2s infinite cubic-bezier(0.4, 0, 0.6, 1);
  border-color: #ffd54f !important;
  box-shadow: 0 0 16px rgba(255, 213, 79, 0.4) !important;
}

@keyframes goldPulse {
  0% { box-shadow: 0 0 0 0 rgba(255, 213, 79, 0.6); }
  70% { box-shadow: 0 0 0 8px rgba(255, 213, 79, 0); }
  100% { box-shadow: 0 0 0 0 rgba(255, 213, 79, 0); }
}

.tehdas-nappi:hover { border-color: #f39c12; }
.kauppa-nappi:hover { border-color: #2980b9; }
.stats-nappi:hover { border-color: #8e44ad; }

.cloud-save-nappi { 
  background: rgba(40, 124, 111, 0.25); 
  border-color: rgba(40, 124, 111, 0.45); 
}
.cloud-save-nappi:hover { border-color: #2ecc71; }

.trophy-nappi { 
  background: rgba(211, 84, 0, 0.25); 
  border-color: rgba(211, 84, 0, 0.45); 
}
.trophy-nappi:hover { border-color: #f39c12; }

.cloud-nappi { 
  background: rgba(52, 73, 94, 0.25); 
  border-color: rgba(52, 73, 94, 0.45); 
}
.cloud-nappi:hover { border-color: #90caf9; }

/* PÄÄCONTAINER & OTSIKOT */
.valikko-container { 
  max-width: 660px; 
  margin: 0 auto; 
  padding-bottom: 20px; 
}

.osio-otsikko-rivi {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 20px 0 12px 0;
}

h1 { 
  font-family: var(--font-head, 'Outfit', sans-serif);
  font-size: 1.45rem; 
  font-weight: 700;
  color: #ffffff; 
  margin: 0;
  letter-spacing: -0.2px;
}

h2 { 
  font-family: var(--font-head, 'Outfit', sans-serif);
  font-size: 1.15rem; 
  font-weight: 600;
  color: #94a3b8; 
  margin: 22px 0 10px 0; 
}

.osio-badge {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  font-size: 0.74rem;
  padding: 3px 10px;
  color: #94a3b8;
  font-weight: 600;
}

/* LISTAT & KORTIT */
.lista { 
  list-style: none; 
  padding: 0; 
  margin: 0; 
  display: flex; 
  flex-direction: column; 
  gap: 10px; 
}

.lista li { 
  background: rgba(18, 26, 42, 0.85); 
  border: 1px solid rgba(90, 140, 200, 0.16); 
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border-radius: 12px; 
  padding: 14px 16px; 
  cursor: pointer; 
  transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1); 
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
}

.lista li:hover:not(.disabled):not(.liian-kallis):not(.tyhja-lista):not(.leaderboard-rivi):not(.piirustus-lukittu) { 
  background: rgba(26, 38, 62, 0.95); 
  border-color: rgba(0, 210, 255, 0.45); 
  transform: translateY(-2px); 
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4), 0 0 14px rgba(0, 210, 255, 0.12);
}

.lista-otsikko { 
  font-size: 1.08rem; 
  font-weight: 700; 
  color: #fff; 
  margin-bottom: 4px; 
}

.lista-info { 
  font-size: 0.86rem; 
  color: #94a3b8; 
  line-height: 1.4; 
}

.disabled { 
  opacity: 0.45; 
  cursor: not-allowed !important; 
}

.tyhja-lista { 
  color: #64748b; 
  background: transparent !important; 
  border: none !important; 
  cursor: default !important; 
  padding: 10px 0; 
  box-shadow: none !important;
}

/* LENTOKENTTÄ-KORTTI */
.kentta-kortti {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tier-reuna-1 { border-left: 4px solid #81c784 !important; }
.tier-reuna-2 { border-left: 4px solid #64b5f6 !important; }
.tier-reuna-3 { border-left: 4px solid #ba68c8 !important; }

.kentta-ylariivi {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.kentta-nimi-alue {
  display: flex;
  align-items: center;
  gap: 8px;
}

.kentta-ikoni { font-size: 1.1rem; }

.tier-badge { 
  font-size: 0.72rem; 
  font-weight: 700;
  padding: 3px 8px; 
  border-radius: 6px; 
  border: 1px solid;
}

.tier-badge.tier-1 { 
  background: rgba(76, 175, 80, 0.15); 
  color: #a5d6a7; 
  border-color: rgba(76, 175, 80, 0.35); 
}

.tier-badge.tier-2 { 
  background: rgba(33, 150, 243, 0.15); 
  color: #90caf9; 
  border-color: rgba(33, 150, 243, 0.35); 
}

.tier-badge.tier-3 { 
  background: rgba(186, 104, 200, 0.15); 
  color: #ce93d8; 
  border-color: rgba(186, 104, 200, 0.35); 
}

.kentta-info-rivi {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.kentta-chip {
  background: rgba(10, 16, 26, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 6px;
  padding: 3px 8px;
  font-size: 0.76rem;
  color: #94a3b8;
}

.kentta-chip.on-koneita {
  background: rgba(76, 175, 80, 0.16);
  color: #a5d6a7;
  border-color: rgba(76, 175, 80, 0.35);
  font-weight: 600;
}

.kapasiteetti-kisko {
  width: 100%;
  height: 5px;
  background: rgba(0, 0, 0, 0.4);
  border-radius: 4px;
  overflow: hidden;
  margin-top: 4px;
}

.kapasiteetti-tayte {
  height: 100%;
  background: linear-gradient(90deg, #2196f3, #00e5ff);
  border-radius: 4px;
  transition: width 0.3s ease;
}

/* REAALIAIKAINEN ANIMOITU LENTOTUTKA */
.lennolla-osio { 
  margin-top: 26px; 
}

.live-radar-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.76rem;
  color: #00e5ff;
  background: rgba(0, 229, 255, 0.1);
  border: 1px solid rgba(0, 229, 255, 0.28);
  padding: 3px 10px;
  border-radius: 20px;
  font-weight: 600;
}

.lento-kortti {
  background: linear-gradient(135deg, rgba(14, 24, 40, 0.95) 0%, rgba(9, 15, 26, 0.98) 100%) !important;
  border: 1px solid rgba(0, 180, 255, 0.28) !important;
  border-radius: 14px !important;
  padding: 14px 16px !important;
  position: relative;
  overflow: visible;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

.lento-kortti:hover {
  border-color: rgba(0, 229, 255, 0.6) !important;
  box-shadow: 0 8px 26px rgba(0, 0, 0, 0.5), 0 0 18px rgba(0, 229, 255, 0.2) !important;
}

.lento-kortti-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.lento-kone-nimi {
  font-family: var(--font-head, 'Outfit', sans-serif);
  font-weight: 700;
  font-size: 1.05rem;
  color: #fff;
  display: flex;
  align-items: center;
  gap: 8px;
}

.kone-ikoni-animoitu {
  display: inline-block;
  animation: planeWiggle 3.5s infinite ease-in-out;
}

@keyframes planeWiggle {
  0%, 100% { transform: rotate(0deg); }
  25% { transform: rotate(-6deg); }
  75% { transform: rotate(6deg); }
}

.lento-ajastin-badge {
  background: rgba(0, 210, 255, 0.15);
  color: #00e5ff;
  border: 1px solid rgba(0, 210, 255, 0.35);
  border-radius: 6px;
  padding: 3px 8px;
  font-size: 0.8rem;
  font-weight: 700;
  font-family: monospace;
}

/* KISKO & LENTÄVÄ KONE */
.lento-radar-kisko {
  position: relative;
  height: 18px;
  margin: 10px 0 14px 0;
  background: rgba(7, 13, 22, 0.9);
  border-radius: 9px;
  border: 1px solid rgba(0, 180, 255, 0.22);
  overflow: visible;
  box-shadow: inset 0 2px 5px rgba(0, 0, 0, 0.8);
}

.lento-radar-tayte {
  height: 100%;
  border-radius: 8px;
  background: linear-gradient(90deg, #1565c0, #00b0ff, #00e5ff);
  box-shadow: 0 0 12px rgba(0, 229, 255, 0.7);
  transition: width 0.9s linear;
}

.lento-lentava-kone {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  font-size: 1.3rem;
  z-index: 5;
  pointer-events: none;
  filter: drop-shadow(0 0 8px rgba(0, 229, 255, 0.95));
  transition: left 0.9s linear;
  animation: flightHover 2s infinite ease-in-out;
}

@keyframes flightHover {
  0%, 100% { transform: translate(-50%, -50%) rotate(0deg); }
  50% { transform: translate(-50%, -60%) rotate(-3deg); }
}

.lento-kortti-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.82rem;
  flex-wrap: wrap;
  gap: 6px;
}

.lento-kohde-alue {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #94a3b8;
}

.lento-kohde-nimi { color: #fff; font-weight: 700; }
.lento-prosentti-badge { color: #00e5ff; font-weight: 600; font-size: 0.78rem; }
.lento-pikkutiedot { display: flex; gap: 6px; }

.lento-mini-chip {
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 0.74rem;
  color: #cbd5e1;
}

.lento-mini-chip.bonus {
  background: rgba(255, 235, 59, 0.15);
  color: #ffd54f;
  border-color: rgba(255, 235, 59, 0.35);
  font-weight: 700;
}

/* KONEEN HEADER JA ROMUTUS */
.koneen-header { 
  display: flex; 
  justify-content: space-between; 
  align-items: center; 
  border-bottom: 1px solid rgba(255, 255, 255, 0.08); 
  padding-bottom: 12px; 
  margin-bottom: 18px; 
}

.romuta-nappi { 
  background: rgba(211, 47, 47, 0.2); 
  color: #ef5350; 
  border: 1px solid rgba(211, 47, 47, 0.4); 
  padding: 8px 14px; 
  font-weight: 700; 
  border-radius: 8px; 
  cursor: pointer; 
  transition: all 0.2s; 
}

.romuta-nappi:hover { 
  background: #d32f2f; 
  color: #fff; 
  transform: scale(1.03); 
}

/* PÄIVITYSPANEELI */
.upgrade-paneeli { 
  background: rgba(36, 28, 14, 0.6); 
  border: 1px solid rgba(212, 175, 55, 0.4); 
  border-radius: 12px; 
  padding: 15px; 
  margin-bottom: 20px; 
  box-shadow: 0 4px 16px rgba(0,0,0,0.3);
}

.upgrade-buttons { display: flex; gap: 10px; }

.upgrade-buttons button { 
  flex: 1; 
  padding: 10px 8px; 
  background: rgba(61, 53, 18, 0.6); 
  color: #fff; 
  border: 1px solid rgba(212, 175, 55, 0.4); 
  border-radius: 8px; 
  cursor: pointer; 
  transition: all 0.2s; 
  font-size: 0.82rem; 
}

.upgrade-buttons button:hover:not(:disabled) { 
  background: rgba(90, 79, 26, 0.9); 
  border-color: #ffd54f;
  transform: translateY(-2px); 
}

.upgrade-buttons button:disabled { 
  opacity: 0.35; 
  cursor: not-allowed; 
  border-color: #555; 
  color: #888; 
}

.kallis-nappi { border-color: rgba(156, 39, 176, 0.5) !important; }

.tila-teksti { 
  background: rgba(26, 39, 51, 0.7); 
  color: #64b5f6; 
  padding: 10px 15px; 
  border-radius: 8px; 
  font-weight: 700; 
  border: 1px solid rgba(100, 181, 246, 0.25);
}

/* MATKUSTAJALISTAT & RYHMÄT */
.matkustaja-ryhma { 
  margin-bottom: 12px; 
  background: rgba(20, 28, 44, 0.6); 
  padding: 12px; 
  border-radius: 10px; 
  border: 1px solid rgba(255, 255, 255, 0.06); 
}

.ryhma-otsikko { 
  font-size: 0.95rem; 
  font-weight: 700; 
  color: #64b5f6; 
  margin-bottom: 8px; 
  display: flex; 
  justify-content: space-between; 
  align-items: center; 
}

.etaisyys-badge { font-size: 0.8rem; color: #94a3b8; font-weight: normal; }

.matkustaja-lista { 
  max-height: 250px; 
  overflow-y: auto; 
  overflow-x: hidden; 
  padding-right: 6px; 
}

.matkustaja-lista li { 
  padding: 10px 14px; 
  color: #81c784; 
}

.kyydissa li { color: #ef5350 !important; }
.kyydissa li:hover { 
  background-color: rgba(61, 36, 36, 0.8) !important; 
  border-color: #ef5350 !important; 
}

.kulta-tag { 
  background: rgba(255, 213, 79, 0.15); 
  color: #ffd54f; 
  padding: 2px 7px; 
  border-radius: 4px; 
  font-size: 0.75rem; 
  margin-left: 8px; 
  border: 1px solid rgba(255, 213, 79, 0.4); 
  font-weight: 700;
}

/* REITIN SUUNNITTELU & LÄHETYS */
.suunnittelu-header-lohko {
  margin-top: 26px;
  margin-bottom: 14px;
}

.suunnittelu-header-lohko h2 {
  margin-top: 0;
  margin-bottom: 10px;
}

.lahtokentta-banner {
  background: linear-gradient(135deg, rgba(0, 180, 255, 0.16) 0%, rgba(15, 28, 48, 0.9) 100%);
  border: 1px solid rgba(0, 210, 255, 0.45);
  border-left: 5px solid #00d2ff;
  border-radius: 12px;
  padding: 10px 14px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 4px 18px rgba(0, 210, 255, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.08);
  transition: all 0.2s ease;
}

.lahtokentta-banner:hover {
  border-color: rgba(0, 229, 255, 0.7);
  box-shadow: 0 6px 24px rgba(0, 210, 255, 0.3);
  transform: translateY(-1px);
}

.lahto-info-vasen {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.lahto-merkki {
  font-size: 0.8rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: #90caf9;
  display: flex;
  align-items: center;
  gap: 4px;
}

.lahto-kaupunki-nimi {
  font-size: 1.25rem;
  font-weight: 800;
  font-family: var(--font-head, 'Outfit', sans-serif);
  color: #ffffff;
  letter-spacing: 0.3px;
  text-shadow: 0 0 14px rgba(0, 210, 255, 0.7);
}

.reitti-paneeli { 
  background: rgba(22, 36, 50, 0.85); 
  border: 1px solid rgba(41, 128, 185, 0.5); 
  border-radius: 12px; 
  padding: 16px; 
  margin-bottom: 20px; 
  box-shadow: 0 6px 20px rgba(0,0,0,0.3);
}

.reitti-jono { font-size: 1.05rem; color: #64b5f6; margin-bottom: 10px; }

.tyhjenna-nappi { 
  background: rgba(211, 47, 47, 0.25); 
  color: #ef5350; 
  border: 1px solid rgba(211, 47, 47, 0.4); 
  padding: 5px 12px; 
  border-radius: 6px; 
  cursor: pointer; 
  margin-bottom: 14px; 
  font-weight: 600;
}

.ohjeteksti { color: #94a3b8; font-style: italic; margin-bottom: 10px; font-size: 0.88rem; }

.lento-ennuste { 
  background: rgba(13, 22, 32, 0.9); 
  padding: 12px; 
  border-radius: 8px; 
  margin-bottom: 16px; 
  line-height: 1.6; 
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.kulu-teksti { color: #ef5350; font-weight: 700; }
.tulo-teksti { color: #81c784; font-weight: 700; }
.voitto-summa { display: block; margin-top: 8px; font-size: 1.1rem; border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 6px; font-weight: 700; }
.bonus-tag { color: #ffd54f; margin-left: 5px; font-size: 0.82rem; font-style: italic; font-weight: 700; }

/* LÄHETÄ MATKAAN -NAPPI (SÄIHKYVÄ ANIMAATIO) */
.laheta-matkaan-nappi { 
  width: 100%; 
  padding: 15px; 
  font-size: 1.15rem; 
  font-weight: 800; 
  font-family: var(--font-head, 'Outfit', sans-serif);
  letter-spacing: 0.5px;
  background: linear-gradient(135deg, #2e7d32 0%, #43a047 50%, #4caf50 100%); 
  color: white; 
  border: 1px solid #81c784; 
  border-radius: 10px; 
  cursor: pointer; 
  position: relative;
  overflow: hidden;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1); 
  box-shadow: 0 6px 20px rgba(76, 175, 80, 0.4); 
}

.laheta-matkaan-nappi::after {
  content: '';
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: linear-gradient(60deg, transparent 40%, rgba(255, 255, 255, 0.3) 50%, transparent 60%);
  transform: translateX(-100%);
  animation: shimmerSweep 3.5s infinite;
}

@keyframes shimmerSweep {
  0% { transform: translateX(-100%); }
  25%, 100% { transform: translateX(100%); }
}

.laheta-matkaan-nappi:hover:not(:disabled) { 
  transform: translateY(-2px) scale(1.01); 
  box-shadow: 0 8px 26px rgba(76, 175, 80, 0.55); 
}

.laheta-matkaan-nappi:disabled { 
  background: #374151; 
  border-color: #4b5563;
  cursor: not-allowed; 
  opacity: 0.6; 
  box-shadow: none;
}

.lahetys-lista li { background-color: rgba(30, 44, 58, 0.85); border-color: rgba(44, 62, 80, 0.8); }

/* HANGAARI & TEHDAS */
.hangaari-paneeli { text-align: center; border-color: #4caf50 !important; margin-bottom: 24px; }

.osta-paikka-nappi { 
  background: linear-gradient(135deg, #2e7d32, #4caf50); 
  color: white; 
  border: 1px solid #81c784; 
  padding: 10px 20px; 
  font-weight: 700; 
  border-radius: 8px; 
  cursor: pointer; 
  margin-top: 10px; 
  transition: all 0.2s; 
  box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);
}

.osta-paikka-nappi:hover:not(:disabled) { 
  transform: translateY(-2px); 
  box-shadow: 0 6px 18px rgba(76, 175, 80, 0.45);
}

.osta-paikka-nappi:disabled { background: #475569; border-color: #64748b; cursor: not-allowed; }

.osa-nimi { color: #f39c12; font-weight: 700; }

.piirustus-rivi { 
  background: rgba(26, 26, 46, 0.85) !important; 
  border-left: 5px solid #64b5f6 !important; 
}

.piirustus-lukittu { 
  background: rgba(20, 23, 32, 0.8) !important; 
  border-left: 5px solid #475569 !important; 
  opacity: 0.72; 
  cursor: default !important; 
}

.piirustus-header-rivi { 
  display: flex; 
  justify-content: space-between; 
  align-items: center; 
  margin-bottom: 5px; 
}

.lukittu-taso-badge { 
  background: rgba(44, 27, 27, 0.8); 
  color: #ff8a80; 
  border: 1px solid #c62828; 
  font-size: 0.72rem; 
  padding: 2px 8px; 
  border-radius: 4px; 
  font-weight: 700; 
}

.auki-taso-badge { 
  background: rgba(17, 40, 58, 0.8); 
  color: #64b5f6; 
  border: 1px solid #1976d2; 
  font-size: 0.72rem; 
  padding: 2px 8px; 
  border-radius: 4px; 
  font-weight: 700; 
}

.lukittu-selite { 
  margin-top: 10px; 
  font-size: 0.84rem; 
  color: #94a3b8; 
  font-style: italic; 
  background: rgba(0,0,0,0.3); 
  padding: 6px 10px; 
  border-radius: 6px; 
  border: 1px dashed #475569; 
}

.osat-kokoelma { margin-top: 12px; display: flex; gap: 8px; }
.osat-kokoelma span { padding: 5px 10px; border-radius: 6px; font-size: 0.82rem; font-weight: 700; }
.omistaa { background: rgba(46, 125, 50, 0.8); color: #fff; border: 1px solid #81c784; }
.puuttuu { background: rgba(66, 66, 66, 0.6); color: #94a3b8; border: 1px dashed #64748b; }

.rakenna-nappi { 
  margin-top: 14px; 
  width: 100%; 
  padding: 12px; 
  background: linear-gradient(135deg, #00b0ff, #00e5ff); 
  color: #0d131a; 
  font-weight: 800; 
  font-family: var(--font-head, 'Outfit', sans-serif);
  border: none; 
  border-radius: 8px; 
  cursor: pointer; 
  transition: all 0.2s;
  box-shadow: 0 4px 15px rgba(0, 229, 255, 0.35);
}

.rakenna-nappi:hover { 
  transform: translateY(-2px); 
  box-shadow: 0 6px 20px rgba(0, 229, 255, 0.5);
}

/* LENTOKENTTÄKAUPPA */
.kauppa-osio { margin-top: 30px; }
.kauppa-rivi { border-left: 4px solid #ff9800 !important; }
.hinta-teksti { color: #ffd54f !important; font-weight: 700; font-size: 0.95rem !important; }
.liian-kallis { opacity: 0.4; cursor: not-allowed !important; border-color: #ef5350 !important; }

/* TILASTOT */
.stats-lista li { cursor: default !important; }
.stats-arvo { font-size: 1.05rem; font-weight: 700; color: #fff; margin-top: 3px; }
.kanta-upgrade-rivi { background: rgba(26, 35, 47, 0.85) !important; border-left: 4px solid #2980b9 !important; }

/* MODAALI / LEADERBOARD */
.modal-overlay { 
  position: fixed; 
  top: 0; 
  left: 0; 
  width: 100vw; 
  height: 100vh; 
  background: rgba(0, 0, 0, 0.8); 
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  display: flex; 
  justify-content: center; 
  align-items: center; 
  z-index: 2000; 
}

.leaderboard-modal { 
  max-width: 620px; 
  width: 95%; 
  background: rgba(18, 26, 38, 0.96); 
  border: 1px solid rgba(0, 180, 255, 0.3); 
  border-radius: 16px; 
  padding: 20px; 
  box-shadow: 0 16px 50px rgba(0, 0, 0, 0.8), 0 0 30px rgba(0, 180, 255, 0.15); 
}

.leaderboard-header { 
  display: flex; 
  justify-content: space-between; 
  align-items: flex-start; 
  margin-bottom: 16px; 
  text-align: left; 
}

.leaderboard-otsikko-alue h2 { 
  margin: 0 0 6px 0; 
  font-size: 1.35rem; 
  color: #fff; 
}

.live-indikaattori { 
  display: flex; 
  align-items: center; 
  gap: 8px; 
  font-size: 0.78rem; 
  color: #4caf50; 
}

.pulse-dot { 
  width: 8px; 
  height: 8px; 
  background-color: #4caf50; 
  border-radius: 50%; 
  box-shadow: 0 0 10px #4caf50; 
  animation: pulseAnimation 2s infinite ease-in-out; 
}

@keyframes pulseAnimation { 
  0% { transform: scale(0.85); opacity: 0.7; } 
  50% { transform: scale(1.3); opacity: 1; } 
  100% { transform: scale(0.85); opacity: 0.7; } 
}

.sulje-risti { 
  background: transparent; 
  border: none; 
  color: #94a3b8; 
  font-size: 1.3rem; 
  cursor: pointer; 
  padding: 4px 8px; 
  border-radius: 6px; 
  transition: all 0.2s;
}

.sulje-risti:hover { color: #fff; background: rgba(255, 255, 255, 0.1); }

.leaderboard-kategoriat { 
  display: flex; 
  flex-wrap: wrap; 
  gap: 8px; 
  margin-bottom: 16px; 
}

.kategoria-nappi { 
  flex: 1 1 calc(20% - 8px); 
  min-width: 95px; 
  padding: 8px 10px; 
  background: rgba(31, 42, 56, 0.8); 
  border: 1px solid rgba(255, 255, 255, 0.08); 
  border-radius: 8px; 
  color: #cbd5e1; 
  font-size: 0.82rem; 
  font-weight: 600; 
  cursor: pointer; 
  transition: all 0.2s ease; 
  white-space: nowrap; 
}

.kategoria-nappi:hover { 
  background: rgba(42, 58, 77, 0.9); 
  color: #fff; 
  border-color: rgba(0, 210, 255, 0.4); 
}

.kategoria-nappi.aktiivinen { 
  background: linear-gradient(135deg, #1e3a5f 0%, #152840 100%); 
  color: #ffd54f; 
  border-color: #ffd54f; 
  box-shadow: 0 0 14px rgba(255, 213, 79, 0.3); 
}

.leaderboard-lista-wrapper { 
  max-height: 420px; 
  overflow-y: auto; 
  padding-right: 4px; 
}

.leaderboard-lista { 
  margin: 0; 
  padding: 0; 
  list-style: none; 
  display: flex; 
  flex-direction: column; 
  gap: 8px; 
}

.leaderboard-rivi { 
  display: flex; 
  align-items: center; 
  gap: 14px; 
  padding: 12px 14px; 
  background: rgba(24, 35, 48, 0.8) !important; 
  border: 1px solid rgba(255, 255, 255, 0.06); 
  border-left: 4px solid #4a6582 !important; 
  border-radius: 10px; 
  transition: transform 0.15s, border-color 0.15s; 
}

.leaderboard-rivi:hover { 
  transform: translateY(-2px); 
  border-color: rgba(0, 210, 255, 0.4); 
}

.leaderboard-rivi.oma-rivi { 
  border-left: 4px solid #ffd54f !important; 
  border-color: #ffd54f; 
  background: linear-gradient(90deg, rgba(30, 45, 65, 0.9) 0%, rgba(24, 35, 48, 0.9) 100%) !important; 
  box-shadow: 0 0 14px rgba(255, 213, 79, 0.2); 
}

.sija { min-width: 40px; text-align: center; font-weight: 700; }
.mitali { font-size: 1.7rem; line-height: 1; }
.sija-numero { font-size: 1.15rem; color: #94a3b8; }
.pelaaja-tiedot { flex: 1; text-align: left; }
.pelaaja-otsikkorivi { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.pelaaja-otsikkorivi .lista-otsikko { font-size: 1rem; font-weight: 700; color: #f8fafc; }

.sina-tagi { 
  background: #ffd54f; 
  color: #0d131a; 
  font-size: 0.7rem; 
  font-weight: 800; 
  padding: 2px 6px; 
  border-radius: 4px; 
  text-transform: uppercase; 
  letter-spacing: 0.5px; 
}

.paamittari-rivi { margin-bottom: 6px; }
.paamittari { font-size: 1.1rem; font-weight: 700; font-family: var(--font-head, 'Outfit', sans-serif); }
.paamittari.rahat { color: #4caf50; }
.paamittari.taso { color: #64b5f6; }
.paamittari.koneet { color: #64b5f6; }
.paamittari.lennot { color: #ba68c8; }
.paamittari.matkustajat { color: #ff8a65; }
.paamittari.kulta { color: #ffd54f; }

.mini-tilastot { display: flex; flex-wrap: wrap; gap: 6px; }
.stat-badge { 
  background: rgba(15, 23, 34, 0.8); 
  border: 1px solid rgba(255, 255, 255, 0.08); 
  padding: 2px 7px; 
  border-radius: 4px; 
  font-size: 0.74rem; 
  color: #94a3b8; 
}

.stat-badge.taso-badge { 
  background: rgba(13, 35, 58, 0.8); 
  border-color: #1976d2; 
  color: #90caf9; 
  font-weight: 700; 
}

.taso-tagi { 
  background: rgba(16, 42, 69, 0.8); 
  color: #64b5f6; 
  border: 1px solid #1976d2; 
  font-size: 0.72rem; 
  padding: 2px 7px; 
  border-radius: 4px; 
  font-weight: 600; 
  margin-left: 6px; 
}

.sulje-modal { 
  margin-top: 20px; 
  background: transparent; 
  color: #94a3b8; 
  border: 1px solid rgba(255, 255, 255, 0.15); 
  padding: 8px 18px; 
  border-radius: 8px; 
  cursor: pointer; 
  transition: all 0.2s;
}

.sulje-modal:hover { background: rgba(255, 255, 255, 0.1); color: #fff; }

/* SIVUN ALAKULMAN XP-PALKKI */
.xp-widget-alakulma { 
  position: fixed; 
  bottom: 24px; 
  left: 24px; 
  width: 290px; 
  max-width: calc(100vw - 120px); 
  background: rgba(15, 23, 36, 0.92); 
  backdrop-filter: blur(12px); 
  -webkit-backdrop-filter: blur(12px); 
  border: 1px solid rgba(0, 180, 255, 0.35); 
  border-radius: 14px; 
  padding: 10px 14px; 
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.6), 0 0 18px rgba(0, 150, 255, 0.15); 
  z-index: 900; 
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1); 
}

.xp-widget-alakulma:hover { 
  transform: translateY(-3px); 
  border-color: rgba(0, 229, 255, 0.7); 
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.7), 0 0 24px rgba(0, 229, 255, 0.28); 
}

.xp-widget-sisus { display: flex; flex-direction: column; gap: 6px; }
.xp-otsikkorivi { display: flex; justify-content: space-between; align-items: center; }
.xp-taso-otsikko { display: flex; align-items: center; gap: 6px; }
.xp-tahti { font-size: 1.1rem; }
.xp-taso-teksti { font-weight: 800; font-size: 0.95rem; color: #64b5f6; font-family: var(--font-head, 'Outfit', sans-serif); }
.xp-arvo-teksti { font-size: 0.78rem; color: #90caf9; font-weight: 600; font-family: monospace; }

.xp-kisko { 
  position: relative; 
  width: 100%; 
  height: 9px; 
  background: rgba(7, 14, 24, 0.9); 
  border-radius: 6px; 
  overflow: hidden; 
  border: 1px solid rgba(0, 180, 255, 0.2); 
  box-shadow: inset 0 1px 3px rgba(0,0,0,0.7); 
}

.xp-tayte { 
  height: 100%; 
  background: linear-gradient(90deg, #1976d2, #00b0ff, #00e5ff); 
  box-shadow: 0 0 10px rgba(0, 229, 255, 0.6); 
  border-radius: 6px; 
  transition: width 0.4s ease-out; 
}

.xp-alarivi { display: flex; justify-content: space-between; font-size: 0.72rem; color: #78909c; }
.xp-puuttuu { color: #90a4ae; }

/* KELLUVA TAKAISIN-NAPPI */
.takaisin-nappi { 
  position: fixed; 
  bottom: 24px; 
  right: 24px; 
  width: 60px; 
  height: 60px; 
  border-radius: 50%; 
  background: linear-gradient(135deg, #ef5350 0%, #c62828 100%); 
  color: white; 
  border: 1px solid rgba(255, 255, 255, 0.25); 
  font-size: 26px; 
  font-weight: 700; 
  cursor: pointer; 
  box-shadow: 0 8px 24px rgba(198, 40, 40, 0.55); 
  z-index: 1000; 
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.takaisin-nappi:hover { 
  transform: scale(1.1) rotate(90deg); 
  box-shadow: 0 12px 30px rgba(239, 83, 80, 0.7); 
}

@media (max-width: 480px) {
  .kassa-rivi { grid-template-columns: 1fr; gap: 8px; }
  .yla-napit-rivi { flex-wrap: wrap; }
  .mini-nappi { flex: 1 1 calc(50% - 8px); }
  .xp-widget-alakulma { width: calc(100vw - 110px); left: 14px; bottom: 14px; }
  .takaisin-nappi { right: 14px; bottom: 14px; width: 52px; height: 52px; font-size: 22px; }
}
</style>