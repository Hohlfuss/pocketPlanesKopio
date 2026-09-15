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
        <h2>💰 <span :class="{'miinus': rahat < 0}">{{ rahat }} €</span></h2>
        <h2 class="kulta-teksti">🟡 {{ kulta }} Kultaa</h2>
      </div>
      <div v-if="tallennusIlmoitus" class="tallennus-pop">{{ tallennusIlmoitus }}</div>
      <div v-if="kultaIlmoitus" class="kulta-pop">{{ kultaIlmoitus }}</div>
      <div class="ajastin">
        ⭐ Taso: <strong>{{ taso }}</strong> | 
        Hangaari: <strong>{{ lentokoneet.length }} / {{ maksimiKonePaikat }}</strong> | 
        Seuraava päivitys: <strong>{{ muotoileAika(aikaSeuraavaanPaivitykseen) }}</strong>
      </div>
    </div>

    <!-- PIENET YLÄNAPIT -->
    <div v-if="!valittuKentta && !tyopajaAuki && !kenttaKauppaAuki && !tilastotAuki" class="yla-napit-rivi">
      <button 
        class="mini-nappi kerää-nappi" 
        :disabled="hataapuCooldown > 0"
        @click="nostaHataapu"
      >
        🟡 Kerää (+100 €)<br/>
        <span v-if="hataapuCooldown > 0" class="hataapu-ajastin">{{ muotoileAika(hataapuCooldown) }} s</span>
      </button>
      <button class="mini-nappi tehdas-nappi" @click="tyopajaAuki = true">🔧 Tehdas</button>
      <button class="mini-nappi kauppa-nappi" @click="kenttaKauppaAuki = true">🌐 Kentät</button>
      <button class="mini-nappi stats-nappi" @click="tilastotAuki = true">📊 Tilastot</button>
    </div>

    <!-- UUDET PILVINAPIT -->
    <div class="yla-napit-rivi">
      <button class="mini-nappi cloud-save-nappi" @click="tallennaPeliPilveen">☁️ Tallenna peli</button>
      <button class="mini-nappi cloud-nappi" @click="kirjauduUlos">🚪 Ulos ({{ pelaajanNimi || 'Pelaaja' }})</button>
      <button class="mini-nappi trophy-nappi" @click="avaaLeaderboard">🏆 Tulostaulu</button>
    </div>

    <!-- HÄTÄAPUNAPPI (Näkyy päävalikossa) -->
    <div v-if="!valittuKentta && !tyopajaAuki && !kenttaKauppaAuki && !tilastotAuki" class="hataapu-container">
      
    </div>

    <div class="valikko-container">
      
      <!-- PÄÄVALIKKO -->
      <div v-if="!valittuKentta && !tyopajaAuki && !kenttaKauppaAuki && !tilastotAuki" class="nakyma">
        <h1>Omat lentokentät</h1>
        <ul class="lista">
          <li 
            v-for="(kData, kenttaNimi) in avatutKentat" 
            :key="kenttaNimi"
            @click="valitseKentta(kenttaNimi)"
            :class="{ 'disabled': haeKoneetKentalla(kenttaNimi).length === 0 }"
          >
            <div class="lista-otsikko">
              {{ kenttaNimi }} <span class="tier-badge">Tier {{ kData.tier }}</span>
            </div>
            <div class="lista-info">
              ✈️ Konetta kentällä: {{ haeKoneetKentalla(kenttaNimi).length }} | 
              🧍 Matkustajia: {{ matkustajatKentilla[kenttaNimi]?.length || 0 }} / {{ kData.maxMatkustajat }}
            </div>
          </li>
        </ul>

        <div v-if="lennollaOlevat.length > 0" class="lennolla-osio">
          <h2>✈️ Lennolla juuri nyt (Laskeutuvat ensin)</h2>
          <ul class="lista">
            <li v-for="kone in lennollaOlevat" :key="kone.id" class="lento-rivi disabled">
              <div class="lista-otsikko">{{ kone.nimi }}</div>
              <div class="lista-info lennon-tila">
                Suunta: {{ kone.kohde }} | Saapuu: {{ kone.lentoAikaJaljella }}s päästä
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

        <h2>Suunnittele reitti ja lähetä</h2>
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
.peli-alusta { user-select: none; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; }
.dark-theme { background-color: #121212; color: #e0e0e0; min-height: 100vh; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; box-sizing: border-box; }

.top-bar { background: #1e1e1e; padding: 15px 20px; border-radius: 8px; margin-bottom: 10px; max-width: 600px; margin-left: auto; margin-right: auto; border: 1px solid #333; text-align: center; position: relative; }
.kassa-rivi { display: flex; justify-content: center; gap: 30px; }
.top-bar h2 { margin: 0; color: #4caf50; font-size: 1.5rem; }
.kulta-teksti { color: #ffd54f !important; font-weight: bold; }
.ajastin { margin-top: 8px; color: #bbb; font-size: 0.9rem; }
.miinus { color: #f44336 !important; }

/* PIENET YLÄNAPIT */
.yla-napit-rivi { display: flex; gap: 10px; max-width: 600px; margin: 0 auto 20px auto; }
.mini-nappi { flex: 1; padding: 10px; font-size: 0.95rem; font-weight: bold; border: none; border-radius: 6px; cursor: pointer; color: #fff; transition: transform 0.2s, opacity 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,0.3); }
.mini-nappi:hover { transform: translateY(-2px); opacity: 0.9; }
.tehdas-nappi { background-color: #f39c12; color: #000; }
.kauppa-nappi { background-color: #2980b9; }
.stats-nappi { background-color: #8e44ad; }

.kulta-tag { background: #3d3512; color: #ffd54f; padding: 2px 6px; border-radius: 4px; font-size: 0.8rem; margin-left: 8px; border: 1px solid #ffd54f; }

.kulta-pop { position: absolute; top: -15px; right: 20px; background: #ffd54f; color: #000; padding: 5px 10px; border-radius: 20px; font-weight: bold; animation: pop 0.4s ease-out; }
.tallennus-pop { position: absolute; top: -15px; left: 20px; background: #4caf50; color: #fff; padding: 5px 10px; border-radius: 20px; font-size: 0.85rem; font-weight: bold; animation: pop 0.4s ease-out; }

@keyframes pop { 0% { transform: scale(0.5); opacity: 0; } 50% { transform: scale(1.2); } 100% { transform: scale(1); opacity: 1; } }

h1 { font-size: 1.8rem; color: #ffffff; border-bottom: 1px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
h2 { font-size: 1.2rem; color: #aaaaaa; margin-top: 30px; margin-bottom: 10px; }

/* KONEEN HEADER JA ROMUTUS */
.koneen-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
.koneen-header h1 { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
.romuta-nappi { background: #d32f2f; color: white; border: none; padding: 8px 15px; font-weight: bold; border-radius: 6px; cursor: pointer; transition: 0.2s; }
.romuta-nappi:hover { background: #b71c1c; transform: scale(1.05); }

.valikko-container { max-width: 600px; margin: 0 auto; padding-bottom: 100px; }

.tier-badge { background: #333; color: #ffd54f; font-size: 0.75rem; padding: 2px 6px; border-radius: 4px; float: right; border: 1px solid #555; }

.lista { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
.lista li { background-color: #1e1e1e; border: 1px solid #2a2a2a; border-radius: 8px; padding: 14px; cursor: pointer; transition: all 0.2s; }
.lista li:hover:not(.disabled):not(.liian-kallis):not(.tyhja-lista):not(.leaderboard-rivi) { background-color: #2c2c2c; border-color: #444; transform: translateX(5px); }

.lista-otsikko { font-size: 1.2rem; font-weight: bold; color: #fff; margin-bottom: 5px; }
.lista-info { font-size: 0.9rem; color: #888; line-height: 1.4; }

.disabled { opacity: 0.5; cursor: not-allowed !important; }
.tyhja-lista { color: #555; background: transparent !important; border: none !important; cursor: default !important; padding: 5px 0; }
.tila-teksti { background: #1a2733; color: #64b5f6; padding: 10px 15px; border-radius: 6px; font-weight: bold; }

/* UPGRADE PANEELI */
.upgrade-paneeli { background: #241c0e; border: 1px solid #d4af37; border-radius: 8px; padding: 15px; margin-bottom: 20px; }
.upgrade-buttons { display: flex; gap: 10px; }
.upgrade-buttons button { flex: 1; padding: 8px; background: #3d3512; color: #fff; border: 1px solid #d4af37; border-radius: 6px; cursor: pointer; transition: 0.2s; font-size: 0.85rem; }
.upgrade-buttons button:hover:not(:disabled) { background: #5a4f1a; transform: scale(1.03); }
.upgrade-buttons button:disabled { opacity: 0.4; cursor: not-allowed; border-color: #555; color: #888; }
.kallis-nappi { border-color: #9c27b0 !important; }

.matkustaja-ryhma { margin-bottom: 15px; background: #181818; padding: 10px; border-radius: 8px; border: 1px solid #2a2a2a; }
.ryhma-otsikko { font-size: 1rem; font-weight: bold; color: #64b5f6; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; }
.etaisyys-badge { font-size: 0.85rem; color: #888; font-weight: normal; }

.hangaari-paneeli { text-align: center; border-color: #4caf50 !important; margin-bottom: 30px; }
.osta-paikka-nappi { background: #4caf50; color: white; border: none; padding: 10px 20px; font-weight: bold; border-radius: 5px; cursor: pointer; margin-top: 10px; transition: 0.2s; }
.osta-paikka-nappi:hover:not(:disabled) { background: #45a049; transform: scale(1.05); }
.osta-paikka-nappi:disabled { background: #555; cursor: not-allowed; }

.osa-nimi { color: #f39c12; }
.piirustus-rivi { background: #1a1a2e !important; border-left: 5px solid #64b5f6 !important; }
.piirustus-lukittu { background: #141720 !important; border-left: 5px solid #455a64 !important; opacity: 0.72; cursor: default !important; }
.piirustus-lukittu:hover { transform: none !important; }
.piirustus-header-rivi { display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; }
.lukittu-taso-badge { background: #2c1b1b; color: #ff8a80; border: 1px solid #c62828; font-size: 0.75rem; padding: 2px 8px; border-radius: 4px; font-weight: bold; }
.auki-taso-badge { background: #11283a; color: #64b5f6; border: 1px solid #1976d2; font-size: 0.75rem; padding: 2px 8px; border-radius: 4px; font-weight: bold; }
.lukittu-selite { margin-top: 10px; font-size: 0.85rem; color: #90a4ae; font-style: italic; background: rgba(0,0,0,0.3); padding: 6px 10px; border-radius: 4px; border: 1px dashed #37474f; }
.osat-kokoelma { margin-top: 15px; display: flex; gap: 10px; }
.osat-kokoelma span { padding: 5px 10px; border-radius: 4px; font-size: 0.85rem; font-weight: bold; }
.omistaa { background: #2e7d32; color: #fff; }
.puuttuu { background: #424242; color: #757575; border: 1px dashed #666; }
.rakenna-nappi { margin-top: 15px; width: 100%; padding: 10px; background: #64b5f6; color: #000; font-weight: bold; border: none; border-radius: 6px; cursor: pointer; }
.rakenna-nappi:hover { background: #42a5f5; transform: scale(1.02); }

.matkustaja-lista { max-height: 250px; overflow-y: auto; overflow-x: hidden; padding-right: 6px; }
.matkustaja-lista li { padding: 10px 14px; color: #81c784; }
.kyydissa li { color: #e57373 !important; }
.kyydissa li:hover { background-color: #3d2424 !important; border-color: #ff5252 !important; }

.lahetys-lista li { background-color: #1e2c3a; border-color: #2c3e50; }
.lahetys-lista li:hover { background-color: #293a4c; }

.reitti-paneeli { background-color: #162432; border: 1px solid #2980b9; border-radius: 8px; padding: 15px; margin-bottom: 20px; }
.reitti-jono { font-size: 1.1rem; color: #64b5f6; margin-bottom: 10px; }
.tyhjenna-nappi { background: #d32f2f; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; margin-bottom: 15px; }
.ohjeteksti { color: #888; font-style: italic; margin-bottom: 10px; }
.lento-ennuste { background: #0d1620; padding: 10px; border-radius: 5px; margin-bottom: 15px; line-height: 1.5; }

.laheta-matkaan-nappi { width: 100%; padding: 15px; font-size: 1.2rem; font-weight: bold; background-color: #4caf50; color: white; border: none; border-radius: 8px; cursor: pointer; transition: transform 0.2s; }
.laheta-matkaan-nappi:hover:not(:disabled) { background-color: #45a049; transform: scale(1.02); }
.laheta-matkaan-nappi:disabled { background-color: #555; cursor: not-allowed; opacity: 0.6; }

.liian-kallis { opacity: 0.4; cursor: not-allowed !important; border-color: #f44336 !important; }
.varoitusteksti { color: #f44336; font-weight: bold; margin-top: 10px;}

.kulu-teksti { color: #e57373; font-weight: bold; }
.tulo-teksti { color: #81c784; font-weight: bold; }
.voitto-summa { display: block; margin-top: 8px; font-size: 1.1rem; border-top: 1px solid #333; padding-top: 5px; }
.bonus-tag { color: #ffeb3b; margin-left: 5px; font-size: 0.85rem; font-style: italic; }

.kauppa-osio { margin-top: 40px; }
.kauppa-rivi { border-left: 4px solid #ff9800 !important; }
.hinta-teksti { color: #ffb74d !important; font-weight: bold; font-size: 1rem !important; }

.lennolla-osio { margin-top: 40px; }
.lento-rivi { border-left: 4px solid #64b5f6 !important; }
.lennon-tila { color: #64b5f6; font-weight: bold; }

.stats-lista li { cursor: default !important; }
.stats-arvo { font-size: 1.1rem; font-weight: bold; color: #fff; margin-top: 2px; }
.kanta-upgrade-rivi { background: #1a232f !important; border-left: 4px solid #2980b9 !important; }

.takaisin-nappi { position: fixed; bottom: 30px; right: 30px; width: 70px; height: 70px; border-radius: 50%; background-color: #d32f2f; color: white; border: none; font-size: 32px; font-weight: bold; cursor: pointer; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5); z-index: 1000; }
.takaisin-nappi:hover { background-color: #b71c1c; transform: scale(1.1); }

/* HÄTÄAPUNAPIN TYYLIT */
.hataapu-container { max-width: 600px; margin: 0 auto 20px auto; }
.hataapu-nappi { width: 100%; padding: 12px; background-color: #c0392b; color: white; border: 1px solid #e74c3c; border-radius: 8px; font-weight: bold; font-size: 1rem; cursor: pointer; transition: 0.2s; box-shadow: 0 4px 6px rgba(0,0,0,0.3); }
.hataapu-nappi:hover:not(:disabled) { background-color: #e74c3c; transform: translateY(-2px); }
.hataapu-nappi:disabled { background-color: #2c3e50; border-color: #34495e; color: #7f8c8d; cursor: not-allowed; opacity: 0.8; }
.hataapu-ajastin { font-size: 0.85rem; color: #bdc3c7; font-weight: normal; }
.hataapu-vapaa { font-size: 0.85rem; color: #2ecc71; }

.kerää-nappi {
  font-size: 0.7rem;
  color: black;
}

/* SUPABASE CLOUD & AUTH TYYLIT */
.cloud-nappi { background-color: #34495e; border: 1px solid #2c3e50; }
.cloud-save-nappi { background-color: #287c6f; border: 1px solid #1f665b; }
.trophy-nappi { background-color: #d35400; border: 1px solid #e67e22; }

.modal-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0, 0, 0, 0.85); display: flex; justify-content: center; align-items: center; z-index: 2000; }
.modal-content { background: #1a1a2e; padding: 25px; border-radius: 12px; border: 2px solid #2980b9; width: 90%; max-width: 400px; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.8); }

.input-ryhma { display: flex; flex-direction: column; gap: 12px; margin-top: 20px; margin-bottom: 20px; }
.input-ryhma input { padding: 12px; border-radius: 6px; border: 1px solid #444; background: #0f172a; color: #fff; font-size: 1rem; }
.input-ryhma input:focus { border-color: #64b5f6; outline: none; }

.auth-submit-nappi { width: 100%; padding: 12px; background: #4caf50; color: white; border: none; font-weight: bold; font-size: 1.1rem; border-radius: 6px; cursor: pointer; transition: 0.2s; }
.auth-submit-nappi:hover { background: #45a049; }

.vaihda-tila { margin-top: 15px; color: #64b5f6; font-size: 0.9rem; cursor: pointer; text-decoration: underline; }
.vaihda-tila:hover { color: #90caf9; }
.auth-ilmoitus { color: #ff9800; margin-bottom: 15px; font-weight: bold; }

.sulje-modal { margin-top: 25px; background: transparent; color: #888; border: 1px solid #555; padding: 8px 15px; border-radius: 6px; cursor: pointer; }
.sulje-modal:hover { background: #333; color: #fff; }

.leaderboard-modal {
  max-width: 620px;
  width: 95%;
  background: #151d28;
  border: 1px solid #2c3e50;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.7);
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
  font-size: 1.4rem;
  color: #fff;
}

.live-indikaattori {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8rem;
  color: #4caf50;
}

.pulse-dot {
  width: 8px;
  height: 8px;
  background-color: #4caf50;
  border-radius: 50%;
  box-shadow: 0 0 8px #4caf50;
  animation: pulseAnimation 2s infinite ease-in-out;
}

@keyframes pulseAnimation {
  0% { transform: scale(0.9); opacity: 0.7; }
  50% { transform: scale(1.3); opacity: 1; }
  100% { transform: scale(0.9); opacity: 0.7; }
}

.sulje-risti {
  background: transparent;
  border: none;
  color: #888;
  font-size: 1.2rem;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
}
.sulje-risti:hover {
  color: #fff;
  background: #223040;
}

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
  background: #1f2a38;
  border: 1px solid #2e3e52;
  border-radius: 6px;
  color: #b0c4de;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.kategoria-nappi:hover {
  background: #2a3a4d;
  color: #fff;
  border-color: #4a6582;
}

.kategoria-nappi.aktiivinen {
  background: linear-gradient(135deg, #2b4c7e 0%, #1e3557 100%);
  color: #ffd54f;
  border-color: #ffd54f;
  box-shadow: 0 0 10px rgba(255, 213, 79, 0.25);
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
  gap: 10px;
}

.leaderboard-rivi {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 14px;
  background: #182330 !important;
  border: 1px solid #27374a;
  border-left: 4px solid #4a6582 !important;
  border-radius: 8px;
  transition: transform 0.15s, border-color 0.15s;
}

.leaderboard-rivi:hover {
  transform: translateY(-2px);
  border-color: #5c7e9f;
  background: #1e2c3c !important;
}

.leaderboard-rivi.oma-rivi {
  border-left: 4px solid #ffd54f !important;
  border-color: #ffd54f;
  background: linear-gradient(90deg, #1b2838 0%, #1a2533 100%) !important;
  box-shadow: 0 0 12px rgba(255, 213, 79, 0.15);
}

.sija {
  min-width: 44px;
  text-align: center;
  font-weight: bold;
}

.mitali {
  font-size: 1.8rem;
  line-height: 1;
}

.sija-numero {
  font-size: 1.2rem;
  color: #8fa3b8;
}

.pelaaja-tiedot {
  flex: 1;
  text-align: left;
}

.pelaaja-otsikkorivi {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.pelaaja-otsikkorivi .lista-otsikko {
  font-size: 1.05rem;
  font-weight: bold;
  color: #f0f4f8;
}

.sina-tagi {
  background: #ffd54f;
  color: #0d131a;
  font-size: 0.72rem;
  font-weight: 800;
  padding: 2px 6px;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.paamittari-rivi {
  margin-bottom: 6px;
}

.paamittari {
  font-size: 1.15rem;
  font-weight: 700;
}

.paamittari.rahat { color: #4caf50; }
.paamittari.taso { color: #64b5f6; }
.paamittari.koneet { color: #64b5f6; }
.paamittari.lennot { color: #ba68c8; }
.paamittari.matkustajat { color: #ff8a65; }
.paamittari.kulta { color: #ffd54f; }

.mini-tilastot {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.stat-badge {
  background: #111822;
  border: 1px solid #233140;
  padding: 2px 7px;
  border-radius: 4px;
  font-size: 0.75rem;
  color: #a0b2c6;
}

/* SIVUN ALAKULMAN XP-PALKKI JA TYYLIT */
.xp-widget-alakulma {
  position: fixed;
  bottom: 24px;
  left: 24px;
  width: 280px;
  max-width: calc(100vw - 120px);
  background: rgba(18, 26, 36, 0.92);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(0, 180, 255, 0.3);
  border-radius: 12px;
  padding: 10px 14px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6), 0 0 15px rgba(0, 150, 255, 0.15);
  z-index: 900;
  transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;
}

.xp-widget-alakulma:hover {
  transform: translateY(-2px);
  border-color: rgba(0, 210, 255, 0.6);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.7), 0 0 20px rgba(0, 210, 255, 0.25);
}

.xp-widget-sisus {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.xp-otsikkorivi {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.xp-taso-otsikko {
  display: flex;
  align-items: center;
  gap: 6px;
}

.xp-tahti {
  font-size: 1.05rem;
}

.xp-taso-teksti {
  font-weight: 700;
  font-size: 0.95rem;
  color: #64b5f6;
}

.xp-arvo-teksti {
  font-size: 0.8rem;
  color: #90caf9;
  font-weight: 600;
  font-family: monospace;
}

.xp-kisko {
  position: relative;
  width: 100%;
  height: 10px;
  background: #0d1b2a;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid #1b3a5c;
  box-shadow: inset 0 1px 3px rgba(0,0,0,0.6);
}

.xp-tayte {
  height: 100%;
  background: linear-gradient(90deg, #1976d2, #00b0ff, #00e5ff);
  box-shadow: 0 0 10px rgba(0, 229, 255, 0.6);
  border-radius: 6px;
  transition: width 0.4s ease-out;
}

.xp-alarivi {
  display: flex;
  justify-content: space-between;
  font-size: 0.72rem;
  color: #78909c;
}

.xp-puuttuu {
  color: #90a4ae;
}

.taso-tagi {
  background: #102a45;
  color: #64b5f6;
  border: 1px solid #1976d2;
  font-size: 0.75rem;
  padding: 2px 7px;
  border-radius: 4px;
  font-weight: 600;
  margin-left: 6px;
}

.stat-badge.taso-badge {
  background: #0d233a;
  border-color: #1976d2;
  color: #90caf9;
  font-weight: 600;
}

.taso-arvo {
  color: #64b5f6 !important;
  font-weight: bold;
}

</style>