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
  LeaderboardEntry,
  EtsintaRuutu,
  Pilotti
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
  tarvittavaXpTasonNostoon,
  OLETUS_PILOTTI,
  haeKoneenPilotti
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
const etsintaAuki = ref(false)
const hangariAuki = ref(false)
const hangariFiltteri = ref<'kaikki' | 'ilmassa' | 'maassa'>('kaikki')
const pilotitAuki = ref(false)
const pilottiValilehti = ref<'omat' | 'kauppa'>('omat')
const valittuKonePilotinAsetukseen = ref<number | null>(null)
const pilotit = ref<Pilotti[]>([OLETUS_PILOTTI])
const kaupanPilotit = ref<Pilotti[]>([])
const etsintaCooldown = ref(0)
const etsintaRuudut = ref<EtsintaRuutu[]>([])
const etsintaKlikattuIndeksi = ref<number | null>(null)
const etsintaViesti = ref("")
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
    tilavuusTaso: k.tilavuusTaso || 0,
    pilottiId: k.pilottiId ?? null
  }))
  omistetutOsat.value = state.omistetutOsat || []
  matkustajatKentilla.value = state.matkustajatKentilla || {}
  kaupanOsat.value = state.kaupanOsat || []
  pilotit.value = state.pilotit || [OLETUS_PILOTTI]
  kaupanPilotit.value = state.kaupanPilotit || []
  tilastot.value = state.tilastot || tilastot.value
  aikaSeuraavaanPaivitykseen.value = state.aikaSeuraavaanPaivitykseen ?? 180
  etsintaCooldown.value = state.etsintaCooldownJaljella ?? 0
  etsintaRuudut.value = state.etsintaRuudut || []
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

const romutaKone = async (kone?: Lentokone) => {
  const target = kone || aktiivinenKone.value
  if (!target) return
  const vahvistus = confirm(
    `Haluatko varmasti myydä koneen ${target.nimi} romuttamolle?\n\nSaat tästä 500 € ja vapautat paikan hangaarista.`
  )
  if (vahvistus) {
    const ok = await suoritaPalvelinToiminto('scrap-plane', { planeId: target.id })
    if (ok && valittuKoneId.value === target.id) {
      valittuKoneId.value = null
    }
  }
}

const paivitaNopeus = (kone?: Lentokone) => {
  const target = kone || aktiivinenKone.value
  if (target) {
    suoritaPalvelinToiminto('upgrade-plane', { planeId: target.id, type: 'speed' })
  }
}

const paivitaKulutus = (kone?: Lentokone) => {
  const target = kone || aktiivinenKone.value
  if (target) {
    suoritaPalvelinToiminto('upgrade-plane', { planeId: target.id, type: 'consumption' })
  }
}

const paivitaTilavuus = (kone?: Lentokone) => {
  const target = kone || aktiivinenKone.value
  if (target) {
    suoritaPalvelinToiminto('upgrade-plane', { planeId: target.id, type: 'capacity' })
  }
}

const lisaaMatkustaja = (matkustaja: Matkustaja, _indeksi?: number) => {
  if (aktiivinenKone.value) {
    suoritaPalvelinToiminto('load-passenger', { planeId: aktiivinenKone.value.id, passengerId: matkustaja.id })
  }
}

const lisaaKaikkiKohteeseen = (kohde: string) => {
  if (aktiivinenKone.value) {
    suoritaPalvelinToiminto('load-destination-passengers', {
      planeId: aktiivinenKone.value.id,
      kohde
    })
  }
}

const poistaMatkustaja = (matkustaja: Matkustaja, _indeksi?: number) => {
  if (aktiivinenKone.value) {
    suoritaPalvelinToiminto('unload-passenger', { planeId: aktiivinenKone.value.id, passengerId: matkustaja.id })
  }
}

// Pilottitoiminnot
const avaaPilotit = (planeId?: number) => {
  valittuKonePilotinAsetukseen.value = typeof planeId === 'number' ? planeId : null
  pilotitAuki.value = true
}

const suljePilotit = () => {
  pilotitAuki.value = false
  valittuKonePilotinAsetukseen.value = null
}

const ostaPilotti = async (p: Pilotti) => {
  await suoritaPalvelinToiminto('buy-pilot', { pilotId: p.id })
}

const asetaPilottiKoneeseen = async (planeId: number, pilotId: string | null) => {
  const ok = await suoritaPalvelinToiminto('assign-pilot', { planeId, pilotId })
  if (ok && valittuKonePilotinAsetukseen.value === planeId) {
    valittuKonePilotinAsetukseen.value = null
  }
}

const paivitaPilotti = async (p: Pilotti) => {
  await suoritaPalvelinToiminto('upgrade-pilot', { pilotId: p.id })
}

const irtisanoPilotti = async (p: Pilotti) => {
  if (confirm(`Haluatko varmasti irtisanoa pilotin ${p.nimi}?\nSaat pienen erorahahyvityksen.`)) {
    await suoritaPalvelinToiminto('fire-pilot', { pilotId: p.id })
  }
}

const haePilottiKoneelle = (kone?: Lentokone | null): Pilotti => {
  return haeKoneenPilotti(kone, pilotit.value)
}

const koneenNimiIdlla = (planeId?: number | null): string => {
  if (!planeId) return ''
  const k = lentokoneet.value.find(item => item.id === planeId)
  return k ? k.nimi : `Kone #${planeId}`
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

const puhdistaPelaajanNimi = (nimi?: string) => {
  if (!nimi) return 'Pelaaja'
  return nimi.replace(/\s*#M:.*$/, '').replace(/\s*#META#.*$/, '').trim() || 'Pelaaja'
}

const haeLeaderboard = async (naytaLataus = false) => {
  if (naytaLataus && leaderboardData.value.length === 0) {
    leaderboardLataus.value = true
  }
  try {
    const data = await fetchLeaderboard(leaderboardLajittelu.value)
    leaderboardData.value = (data || []).map((e: LeaderboardEntry) => ({
      ...e,
      pelaajanNimi: puhdistaPelaajanNimi(e.pelaajanNimi || e.pelaajan_nimi),
      pelaajan_nimi: puhdistaPelaajanNimi(e.pelaajanNimi || e.pelaajan_nimi)
    }))
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

const koneetIlmassaLkm = computed(() => lentokoneet.value.filter(k => k.tila === 'Ilmassa').length)
const koneetMaassaLkm = computed(() => lentokoneet.value.filter(k => k.tila === 'Maassa').length)

const suodatetutLentokoneet = computed(() => {
  if (hangariFiltteri.value === 'ilmassa') {
    return lentokoneet.value.filter(k => k.tila === 'Ilmassa')
  }
  if (hangariFiltteri.value === 'maassa') {
    return lentokoneet.value.filter(k => k.tila === 'Maassa')
  }
  return lentokoneet.value
})

const haeMallinNimi = (malliId: string) => {
  const m = rakennettavatMallit.find(rm => rm.malliId === malliId)
  return m ? m.nimi : (malliId || 'Tuntematon kone')
}

const siirryKoneeseen = (kone: Lentokone) => {
  hangariAuki.value = false
  tyopajaAuki.value = false
  kenttaKauppaAuki.value = false
  tilastotAuki.value = false
  etsintaAuki.value = false
  valittuKentta.value = kone.sijainti
  valitseKone(kone.id)
}

const meneTaaksepain = () => {
  if (pilotitAuki.value) suljePilotit()
  else if (etsintaAuki.value) etsintaAuki.value = false
  else if (hangariAuki.value) hangariAuki.value = false
  else if (tyopajaAuki.value) tyopajaAuki.value = false
  else if (kenttaKauppaAuki.value) kenttaKauppaAuki.value = false
  else if (tilastotAuki.value) tilastotAuki.value = false
  else if (valittuKoneId.value !== null) { valittuKoneId.value = null; suunniteltuReitti.value = [] }
  else if (valittuKentta.value !== null) valittuKentta.value = null
}

const avaaRuutu = async (indeksi: number) => {
  if (toimintoLataus.value) return
  const ruutu = etsintaRuudut.value[indeksi]
  if (!ruutu || ruutu.avattu) return

  etsintaKlikattuIndeksi.value = indeksi
  const onnistui = await suoritaPalvelinToiminto('avaa-etsinta-ruutu', { ruutuIndeksi: indeksi })
  if (onnistui) {
    const avattu = etsintaRuudut.value[indeksi]
    if (avattu) {
      if (avattu.tyyppi === 'raha') {
        etsintaViesti.value = `Löysit maasta: ${avattu.nimi} (+${avattu.rahaMaara} €)! 💰`
      } else if (avattu.tyyppi === 'kulta') {
        etsintaViesti.value = `Upea kimmellys! ${avattu.nimi} (+${avattu.kultaMaara} kultaa)! 🟡`
      } else if (avattu.tyyppi === 'osa') {
        etsintaViesti.value = `Harvinainen aarre! Löysit osan: ${avattu.nimi}! ✈️`
      } else {
        etsintaViesti.value = `Piippaus oli väärä hälytys: ${avattu.nimi}.`
      }
      setTimeout(() => {
        etsintaViesti.value = ""
      }, 4500)
    }
  }
}

const muotoileTunnitMinuutit = (totalSec: number) => {
  if (totalSec <= 0) return '0m'
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

const etsintaAvatutLkm = computed(() => {
  return (etsintaRuudut.value || []).filter(r => r.avattu).length
})

const etsintaKaikkiAvattu = computed(() => {
  return (etsintaRuudut.value || []).length > 0 && (etsintaRuudut.value || []).every(r => r.avattu)
})

const etsintaSaalis = computed(() => {
  let rahat = 0
  let kulta = 0
  const osat: string[] = []
  let tyhjat = 0

  ;(etsintaRuudut.value || []).forEach(r => {
    if (!r.avattu) return
    if (r.tyyppi === 'raha' && r.rahaMaara) rahat += r.rahaMaara
    else if (r.tyyppi === 'kulta' && r.kultaMaara) kulta += r.kultaMaara
    else if (r.tyyppi === 'osa' && r.osa) osat.push(r.nimi)
    else if (r.tyyppi === 'tyhja') tyhjat++
  })

  return { rahat, kulta, osat, tyhjat }
})

const mallinNimi = (malliId: string) =>
  rakennettavatMallit.find(m => m.malliId === malliId)?.nimi || malliId

const onkoOsaOmistuksessa = (malliId: string, tyyppi: OsaTyyppi) =>
  omistetutOsat.value.some(o => o.malliId === malliId && o.tyyppi === tyyppi)

const onkoValmisRakennettavaksi = (malliId: string) => {
  const tarvittavat: OsaTyyppi[] = ['moottori', 'runko', 'siivet']
  return tarvittavat.every(t => onkoOsaOmistuksessa(malliId, t))
}

const vapaatPaikat = computed(() => {
  if (!aktiivinenKone.value) return 0
  return Math.max(0, aktiivinenKone.value.matkustajaMaara - aktiivinenKone.value.matkustajatKyydissa.length)
})

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
    // Lajitellaan matkustajat ryhmän sisällä: kultamatkustajat (ja korkeamman kultatuoton) ensin
    const jasenet = [...ryhmat[kohde]].sort((a, b) => {
      const aKulta = a.matkustaja.tuottaaKultaa ? (a.matkustaja.kultaMaara || 1) : 0
      const bKulta = b.matkustaja.tuottaaKultaa ? (b.matkustaja.kultaMaara || 1) : 0
      return bKulta - aKulta
    })
    const kultaMatkustajiaLkm = jasenet.filter(j => j.matkustaja.tuottaaKultaa).length
    return {
      kohde,
      etaisyys,
      jasenet,
      kultaMatkustajiaLkm
    }
  })

  ryhmaTaulukko.sort((a, b) => a.etaisyys - b.etaisyys)
  return ryhmaTaulukko
})

const reittiTiedot = computed(() => {
  if (!aktiivinenKone.value || !valittuKentta.value) return null
  const pilotti = haePilottiKoneelle(aktiivinenKone.value)
  return laskeReitinTiedot(aktiivinenKone.value, valittuKentta.value, suunniteltuReitti.value, pilotti)
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

    // 1.5 Metallinpaljastinjäähy (Piippari)
    if (etsintaCooldown.value > 0) {
      etsintaCooldown.value--
      if (etsintaCooldown.value === 0) {
        lataaTilaPalvelimelta()
      }
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
        <span class="ajastin-pala hangari-linkki" @click="hangariAuki = true" title="Avaa hangari ja laivasto">🛫 Hangaari: <strong>{{ lentokoneet.length }} / {{ maksimiKonePaikat }}</strong></span>
        <span class="ajastin-piste">•</span>
        <span class="ajastin-pala hangari-linkki" @click="avaaPilotit()" title="Avaa pilottikeskus ja rekrytointi">👨‍✈️ Miehistö: <strong>{{ pilotit.length }}</strong></span>
        <span class="ajastin-piste">•</span>
        <span class="ajastin-pala">⏱️ Seuraava päivitys: <strong>{{ muotoileAika(aikaSeuraavaanPaivitykseen) }}</strong></span>
      </div>
    </div>

    <!-- PÄÄNAVIGOINTI -->
    <div v-if="!valittuKentta && !tyopajaAuki && !kenttaKauppaAuki && !tilastotAuki && !etsintaAuki && !hangariAuki && !pilotitAuki" class="nav-alue">
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
        <button 
          class="mini-nappi piippari-nappi" 
          @click="etsintaAuki = true"
          :class="{ 'piippari-syke': etsintaCooldown === 0 && !etsintaKaikkiAvattu }"
          title="Piippari – päivittäinen metallinpaljastin"
        >
          <span class="nappi-ikoni">🧭</span>
          <div class="nappi-tekstit">
            <span class="nappi-otsikko">Piippari</span>
            <span v-if="etsintaCooldown > 0" class="hataapu-ajastin">⏱️ {{ muotoileTunnitMinuutit(etsintaCooldown) }}</span>
            <span v-else-if="etsintaKaikkiAvattu" class="hataapu-ajastin">Valmis!</span>
            <span v-else class="piippari-valmis">{{ 16 - etsintaAvatutLkm }} ruutua</span>
          </div>
        </button>
        <button 
          class="mini-nappi hangari-nappi" 
          @click="hangariAuki = true"
          title="Avaa hangari ja hallitse laivastoa"
        >
          <span class="nappi-ikoni">🛫</span>
          <div class="nappi-tekstit">
            <span class="nappi-otsikko">Hangari</span>
            <span class="hangari-paikat-badge">{{ lentokoneet.length }} / {{ maksimiKonePaikat }}</span>
          </div>
        </button>
        <button 
          class="mini-nappi pilotit-nappi" 
          @click="avaaPilotit()"
          title="Avaa pilottikeskus ja hallitse miehistöä"
        >
          <span class="nappi-ikoni">👨‍✈️</span>
          <div class="nappi-tekstit">
            <span class="nappi-otsikko">Pilotit</span>
            <span class="pilotti-maara-badge">{{ pilotit.length }} kuskia</span>
          </div>
        </button>
        <button class="mini-nappi tehdas-nappi" @click="tyopajaAuki = true">
          <span class="nappi-ikoni">🔧</span>
          <span class="nappi-otsikko">Tehdas</span>
        </button>
      </div>

      <div class="yla-napit-rivi ala-napit">
        <button class="mini-nappi kauppa-nappi" @click="kenttaKauppaAuki = true">
          <span class="nappi-ikoni">🌐</span>
          <span class="nappi-otsikko">Kentät</span>
        </button>
        <button class="mini-nappi stats-nappi" @click="tilastotAuki = true">
          <span class="nappi-ikoni">📊</span>
          <span class="nappi-otsikko">Tilastot</span>
        </button>
        <button class="mini-nappi trophy-nappi" @click="avaaLeaderboard" title="Avaa tulostaulu">
          <span class="nappi-ikoni">🏆</span>
          <span>Tulostaulu</span>
        </button>
        <button class="mini-nappi cloud-save-nappi" @click="tallennaPeliPilveen" title="Tallenna peli pilveen">
          <span class="nappi-ikoni">☁️</span>
          <span>Tallenna</span>
        </button>
        <button class="mini-nappi cloud-nappi" @click="kirjauduUlos" :title="`Kirjaudu ulos (${pelaajanNimi || 'Pelaaja'})`">
          <span class="nappi-ikoni">🚪</span>
          <span>{{ pelaajanNimi || 'Ulos' }}</span>
        </button>
      </div>
    </div>

    <div class="valikko-container">
      
      <!-- PÄÄVALIKKO -->
      <div v-if="!valittuKentta && !tyopajaAuki && !kenttaKauppaAuki && !tilastotAuki && !etsintaAuki && !hangariAuki && !pilotitAuki" class="nakyma">
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

      <!-- HANGARI (LAIVASTO & KONEIDEN UPGRADET JA TILA) -->
      <div v-else-if="hangariAuki" class="nakyma hangari-nakyma">
        <div class="osio-otsikko-rivi">
          <div>
            <h1>🛫 Hangari & Laivasto</h1>
            <p class="ohjeteksti">
              Hallitse kaikkia lentokoneitasi yhdestä paikasta. Näe reaaliaikainen tilanne (lennossa tai kentällä) ja suorita nopeus-, kulutus- ja tilavuuspäivitykset.
            </p>
          </div>
        </div>

        <!-- HANGARIN KAPASITEETTI JA LAIVASTON YHTEENVETO -->
        <div class="hangari-kapasiteetti-kortti">
          <div class="hangari-info-ylariivi">
            <div class="hangari-paikat-info">
              <span class="hangari-kapasiteetti-otsikko">Hangaripaikat</span>
              <span class="hangari-paikat-arvo">
                <strong>{{ lentokoneet.length }}</strong> / {{ maksimiKonePaikat }} konetta
              </span>
            </div>
            
            <button 
              class="osta-konepaikka-nappi" 
              :disabled="rahat < laskeUudenPaikanHinta(maksimiKonePaikat) || toimintoLataus"
              @click="suoritaPalvelinToiminto('buy-hangar-slot')"
              title="Laajenna hangaria uudella konepaikalla"
            >
              <span class="nappi-ikoni">➕</span>
              <div class="osta-nappi-tekstit">
                <span class="osta-nappi-otsikko">Osta konepaikka</span>
                <span class="osta-nappi-hinta">💰 {{ laskeUudenPaikanHinta(maksimiKonePaikat).toLocaleString() }} €</span>
              </div>
            </button>
          </div>

          <!-- Täyttöasteen kisko -->
          <div class="hangari-kisko-wrapper" title="Hangaripaikkojen täyttöaste">
            <div 
              class="hangari-kisko-tayte" 
              :style="{ width: Math.min(100, Math.round((lentokoneet.length / (maksimiKonePaikat || 1)) * 100)) + '%' }"
            ></div>
          </div>

          <!-- Tilastopillerit: Kaikki, Ilmassa vs Maassa suodatus -->
          <div class="hangari-stat-pillerit">
            <div class="stat-pilleri" :class="{ aktiivinen: hangariFiltteri === 'kaikki' }" @click="hangariFiltteri = 'kaikki'">
              <span class="pilleri-ikoni">📋</span>
              <span class="pilleri-nimi">Kaikki</span>
              <span class="pilleri-maara">{{ lentokoneet.length }}</span>
            </div>
            <div class="stat-pilleri" :class="{ aktiivinen: hangariFiltteri === 'ilmassa' }" @click="hangariFiltteri = 'ilmassa'">
              <span class="pilleri-ikoni">🛫</span>
              <span class="pilleri-nimi">Ilmassa</span>
              <span class="pilleri-maara">{{ koneetIlmassaLkm }}</span>
            </div>
            <div class="stat-pilleri" :class="{ aktiivinen: hangariFiltteri === 'maassa' }" @click="hangariFiltteri = 'maassa'">
              <span class="pilleri-ikoni">📍</span>
              <span class="pilleri-nimi">Maassa</span>
              <span class="pilleri-maara">{{ koneetMaassaLkm }}</span>
            </div>
          </div>
        </div>

        <!-- TYHJÄ TILA -->
        <div v-if="lentokoneet.length === 0" class="hangari-tyhja-tila">
          <span class="tyhja-ikoni">🛩️</span>
          <h2>Hangari on vielä tyhjä!</h2>
          <p>Sinulla ei ole vielä yhtään lentokonetta laivastossasi. Rakenna koneita tehtaassa kerätyistä osista tai löydä osia piipparilla.</p>
          <button class="nappi ensimmainen-kone-nappi" @click="tyopajaAuki = true; hangariAuki = false">
            🔧 Siirry tehtaaseen
          </button>
        </div>

        <div v-else-if="suodatetutLentokoneet.length === 0" class="hangari-tyhja-tila pikkutyhja">
          <p>Ei lentokoneita tilassa <strong>{{ hangariFiltteri }}</strong>.</p>
        </div>

        <!-- LENTOKONELISTA -->
        <div v-else class="hangari-kone-lista">
          <div 
            v-for="kone in suodatetutLentokoneet" 
            :key="kone.id"
            :class="['hangari-kone-kortti', { 'kortti-ilmassa': kone.tila === 'Ilmassa', 'kortti-maassa': kone.tila === 'Maassa' }]"
          >
            <!-- KORTIN YLÄOSA: Nimi, malli ja tilaindikaattori -->
            <div class="hangari-kone-yliosa">
              <div class="kone-tunniste-alue">
                <span class="kone-tyyppi-ikoni">✈️</span>
                <div>
                  <div class="kone-paa-otsikko">
                    <span class="kone-nimi">{{ kone.nimi }}</span>
                    <span class="kone-malli-badge">{{ haeMallinNimi(kone.malliId) }}</span>
                  </div>
                  <div class="kone-alaviite">Kone-ID #{{ kone.id }}</div>
                </div>
              </div>

              <!-- Tilastatus -->
              <div class="kone-tila-badge-alue">
                <div v-if="kone.tila === 'Ilmassa'" class="kone-tila-badge tila-ilmassa">
                  <span class="pulse-dot"></span>
                  <span>Lennossa</span>
                </div>
                <div v-else class="kone-tila-badge tila-maassa">
                  <span class="vihrea-piste">●</span>
                  <span>Maassa: {{ kone.sijainti }}</span>
                </div>
              </div>
            </div>

            <!-- LENNON AKTIIVINEN TILA (JOS KONE ON ILMASSA) -->
            <div v-if="kone.tila === 'Ilmassa'" class="hangari-lento-live-alue">
              <div class="hangari-lento-reitti">
                <span class="reitti-alku">📍 Lähtö: {{ kone.sijainti }}</span>
                <span class="reitti-nuoli">➔</span>
                <span class="reitti-kohde">🛬 Kohde: {{ kone.kohde }}</span>
                <span v-if="kone.onBonusLento" class="bonus-tagi">✨ +25% Bonuslento</span>
              </div>

              <!-- Live-radar etenemispalkki -->
              <div class="hangari-radar-kisko">
                <div class="hangari-radar-tayte" :style="{ width: laskeLennonEdistyminen(kone) + '%' }"></div>
                <div 
                  class="hangari-lentava-kone" 
                  :style="{ left: Math.min(94, Math.max(3, laskeLennonEdistyminen(kone))) + '%' }"
                >
                  ✈️
                </div>
              </div>

              <div class="hangari-lento-aikatiedot">
                <span class="lento-jaljella">⏱️ Lentoaikaa jäljellä: <strong>{{ kone.lentoAikaJaljella }} s</strong></span>
                <span class="lento-edistyminen-pros">Edistyminen: <strong>{{ laskeLennonEdistyminen(kone) }}%</strong></span>
              </div>
            </div>

            <!-- MATKUSTAJAT & KUORMA -->
            <div class="hangari-kuorma-alue">
              <div class="kuorma-header">
                <span class="kuorma-otsikko">👥 Matkustajat</span>
                <span class="kuorma-maara">
                  <strong>{{ kone.matkustajatKyydissa.length }}</strong> / {{ kone.matkustajaMaara }} paikkaa
                </span>
              </div>
              <div class="kuorma-kisko">
                <div 
                  class="kuorma-tayte" 
                  :style="{ width: Math.min(100, Math.round((kone.matkustajatKyydissa.length / (kone.matkustajaMaara || 1)) * 100)) + '%' }"
                ></div>
              </div>
              <!-- Matkustajalistaus pikamerkkeinä -->
              <div v-if="kone.matkustajatKyydissa.length > 0" class="hangari-matkustajat-chips">
                <span 
                  v-for="(pax, pIdx) in kone.matkustajatKyydissa" 
                  :key="pIdx"
                  class="pax-chip"
                  :title="`${pax.nimi} ➔ ${pax.kohde}`"
                >
                  👤 {{ pax.nimi }} <span class="pax-kohde">➔ {{ pax.kohde }}</span>
                  <span v-if="pax.tuottaaKultaa" class="pax-kulta">🟡 +{{ pax.kultaMaara || 1 }}</span>
                </span>
              </div>
              <div v-else class="kuorma-tyhja-teksti">
                Koneessa ei ole matkustajia.
              </div>
            </div>

            <!-- KONEEN PILOTTI -TIEDOT -->
            <div class="hangari-pilotti-laatikko" :class="`rarity-${haePilottiKoneelle(kone).harvinaisuus}`">
              <div class="pilotti-vasen-tiedot">
                <span class="pilotti-avatar-suuri">{{ haePilottiKoneelle(kone).avatar }}</span>
                <div class="pilotti-tekstit">
                  <div class="pilotti-nimi-rivi">
                    <span class="pilotti-nimi">{{ haePilottiKoneelle(kone).nimi }}</span>
                    <span :class="['pilotti-harvinaisuus-tag', `tag-${haePilottiKoneelle(kone).harvinaisuus}`]">
                      {{ haePilottiKoneelle(kone).harvinaisuus.toUpperCase() }}
                    </span>
                    <span v-if="haePilottiKoneelle(kone).id !== 'pilot_default'" class="pilotti-taso-badge">
                      ⭐ Taso {{ haePilottiKoneelle(kone).taso }}
                    </span>
                  </div>
                  <div class="pilotti-titteli">{{ haePilottiKoneelle(kone).titteli }}</div>
                  <div class="pilotti-bonukset-pillerit">
                    <span v-if="haePilottiKoneelle(kone).statit.nopeusBonus > 0" class="mini-stat-badge">💨 +{{ haePilottiKoneelle(kone).statit.nopeusBonus }}% nopeus</span>
                    <span v-if="haePilottiKoneelle(kone).statit.kulutusAlennus > 0" class="mini-stat-badge">⛽ -{{ haePilottiKoneelle(kone).statit.kulutusAlennus }}% kulu</span>
                    <span v-if="haePilottiKoneelle(kone).statit.tuloBonus > 0" class="mini-stat-badge">💰 +{{ haePilottiKoneelle(kone).statit.tuloBonus }}% tulot</span>
                    <span v-if="haePilottiKoneelle(kone).statit.kultaBonus > 0" class="mini-stat-badge">🟡 +{{ haePilottiKoneelle(kone).statit.kultaBonus }}% kulta</span>
                    <span v-if="haePilottiKoneelle(kone).statit.xpBonus > 0" class="mini-stat-badge">🌟 +{{ haePilottiKoneelle(kone).statit.xpBonus }}% XP</span>
                    <span v-if="haePilottiKoneelle(kone).id === 'pilot_default'" class="mini-stat-tyhja">🥱 0% bonukset (Tylsä oletuspilotti)</span>
                  </div>
                </div>
              </div>
              <button 
                class="vaihda-pilotti-nappi"
                @click="avaaPilotit(kone.id)"
                title="Aseta tälle koneelle parempi pilotti tai vaihda nykyistä"
              >
                {{ kone.pilottiId ? '🔄 Vaihda pilotti' : '➕ Aseta pilotti' }}
              </button>
            </div>

            <!-- UPGRADE-OSIO: NOPEUS, KULUTUS, TILAVUUS -->
            <div class="hangari-upgradet-osio">
              <div class="upgradet-otsikko">⚡ Päivitykset (Upgrades)</div>
              
              <div class="upgrade-grid">
                <!-- 1. NOPEUS -->
                <div class="upgrade-laatikko">
                  <div class="upgrade-info-rivi">
                    <span class="upgrade-nimi">💨 Nopeus</span>
                    <span class="upgrade-taso-badge">⭐ Taso {{ kone.nopeusTaso }}</span>
                  </div>
                  <div class="upgrade-arvo">{{ kone.nopeus }} km/h</div>
                  <button 
                    class="nappi-upgrade"
                    :disabled="kulta < laskeHintaNopeus(kone.nopeusTaso) || toimintoLataus"
                    @click="paivitaNopeus(kone)"
                    title="Nosta nopeutta +20 km/h"
                  >
                    <span class="upgrade-teho">+20 km/h</span>
                    <span class="upgrade-hinta">🟡 {{ laskeHintaNopeus(kone.nopeusTaso) }} kultaa</span>
                  </button>
                </div>

                <!-- 2. KULUTUS -->
                <div class="upgrade-laatikko">
                  <div class="upgrade-info-rivi">
                    <span class="upgrade-nimi">⛽ Kulutus</span>
                    <span class="upgrade-taso-badge">⭐ Taso {{ kone.kulutusTaso }}</span>
                  </div>
                  <div class="upgrade-arvo">{{ kone.kulutus }} €/h</div>
                  <button 
                    class="nappi-upgrade"
                    :disabled="kulta < laskeHintaKulutus(kone.kulutusTaso) || kone.kulutus <= 2 || toimintoLataus"
                    @click="paivitaKulutus(kone)"
                    title="Laske polttoainekulutusta 15%"
                  >
                    <span class="upgrade-teho">-15% kulutus</span>
                    <span class="upgrade-hinta">
                      🟡 {{ kone.kulutus > 2 ? `${laskeHintaKulutus(kone.kulutusTaso)} kultaa` : 'MAX' }}
                    </span>
                  </button>
                </div>

                <!-- 3. TILAVUUS -->
                <div class="upgrade-laatikko">
                  <div class="upgrade-info-rivi">
                    <span class="upgrade-nimi">📦 Tilavuus</span>
                    <span class="upgrade-taso-badge">⭐ Taso {{ kone.tilavuusTaso }}</span>
                  </div>
                  <div class="upgrade-arvo">{{ kone.matkustajaMaara }} paikkaa</div>
                  <button 
                    class="nappi-upgrade"
                    :disabled="kulta < laskeHintaTilavuus(kone.tilavuusTaso) || toimintoLataus"
                    @click="paivitaTilavuus(kone)"
                    title="Lisää matkustajapaikka (+1 paikka)"
                  >
                    <span class="upgrade-teho">+1 paikka</span>
                    <span class="upgrade-hinta">🟡 {{ laskeHintaTilavuus(kone.tilavuusTaso) }} kultaa</span>
                  </button>
                </div>
              </div>
            </div>

            <!-- KORTIN ALAPALKKI / TOIMINNOT -->
            <div class="hangari-kortti-footer">
              <button 
                v-if="kone.tila === 'Maassa'"
                class="nappi mini-toiminto-nappi lennata-nappi"
                @click="siirryKoneeseen(kone)"
              >
                🛫 Siirry kentälle ({{ kone.sijainti }})
              </button>
              <div v-else class="lennolla-status-note">
                ✈️ Kone on ilmassa matkalla kentälle {{ kone.kohde }}
              </div>

              <button 
                v-if="kone.tila === 'Maassa'"
                class="nappi-romuta"
                @click="romutaKone(kone)"
                title="Myy kone romuttamolle (+500 €)"
              >
                🗑️ Romuta (+500 €)
              </button>
            </div>

          </div>
        </div>

        <div class="hangari-ala-sulje">
          <button class="sulje-modal" @click="hangariAuki = false">Takaisin päävalikkoon</button>
        </div>
      </div>

      <!-- PILOTTIKESKUS & REKRYTOINTI -->
      <div v-else-if="pilotitAuki" class="nakyma pilotit-nakyma">
        <div class="osio-otsikko-rivi">
          <div>
            <h1>👨‍✈️ Lentäjät & Rekrytointi</h1>
            <p class="ohjeteksti">
              Palkkaa ammattilentäjiä parantamaan lentokoneidesi suorituskykyä! Harvinaisemmat pilotit tarjoavat kovia nopeusbonuksia, säästävät polttoainetta ja kerryttävät lisätuloja ja kultaa.
            </p>
          </div>
          <span class="osio-badge">Miehistö: {{ pilotit.length }} kpl</span>
        </div>

        <!-- Jos ollaan asettamassa pilottia tietylle koneelle -->
        <div v-if="valittuKonePilotinAsetukseen !== null" class="pilotti-valinta-ohje-banner">
          <span>✈️ Valitaan pilottia koneelle: <strong>{{ koneenNimiIdlla(valittuKonePilotinAsetukseen) }}</strong></span>
          <button class="nappi-peruuta-valinta" @click="valittuKonePilotinAsetukseen = null">Peruuta kohdennus</button>
        </div>

        <!-- VÄLILEHTIVALITSIN -->
        <div class="pilotti-tabit">
          <button 
            class="pilotti-tab-nappi" 
            :class="{ active: pilottiValilehti === 'omat' }" 
            @click="pilottiValilehti = 'omat'"
          >
            👨‍✈️ Oma miehistö ({{ pilotit.length }})
          </button>
          <button 
            class="pilotti-tab-nappi" 
            :class="{ active: pilottiValilehti === 'kauppa' }" 
            @click="pilottiValilehti = 'kauppa'"
          >
            🏢 Rekrytointitoimisto ({{ kaupanPilotit.length }})
            <span class="kauppa-ajastin-badge">⏱️ {{ muotoileAika(aikaSeuraavaanPaivitykseen) }}</span>
          </button>
        </div>

        <!-- 1. OMA MIEHISTÖ -->
        <div v-if="pilottiValilehti === 'omat'" class="pilotti-sisalto">
          <div class="pilotti-grid">
            <div 
              v-for="pilotti in pilotit" 
              :key="pilotti.id" 
              class="pilotti-kortti"
              :class="'kortti-' + pilotti.harvinaisuus"
            >
              <div class="pilotti-kortti-header">
                <div class="pilotti-kuva-alue">
                  <span class="pilotti-iso-emoji">{{ pilotti.avatar }}</span>
                </div>
                <div class="pilotti-paatiedot">
                  <div class="pilotti-nimi-rivi">
                    <h3 class="pilotti-nimi">{{ pilotti.nimi }}</h3>
                    <span class="harvinaisuus-tag" :class="'tag-' + pilotti.harvinaisuus">
                      {{ pilotti.harvinaisuus }}
                    </span>
                  </div>
                  <div class="pilotti-titteli">{{ pilotti.titteli }}</div>
                  <div class="pilotti-taso-rivi">
                    <span class="taso-pala">⭐ Taso {{ pilotti.taso }} / {{ pilotti.maxTaso }}</span>
                    <span class="pilotti-tyyppi-teksti" v-if="pilotti.id === 'pilot_default'">(Oletuslentäjä)</span>
                  </div>
                </div>
              </div>

              <!-- STATSIT JA BONUKSET -->
              <div class="pilotti-statit-laatikko">
                <div class="stat-otsikko">Lentobonukset:</div>
                <div class="stat-rivi" :class="{ 'on-aktiivinen': pilotti.statit.nopeusBonus > 0 }">
                  <span class="stat-label">⚡ Lentonopeus:</span>
                  <span class="stat-arvo">{{ pilotti.statit.nopeusBonus > 0 ? `+${pilotti.statit.nopeusBonus}%` : '0%' }}</span>
                </div>
                <div class="stat-rivi" :class="{ 'on-aktiivinen': pilotti.statit.kulutusAlennus > 0 }">
                  <span class="stat-label">⛽ Polttoainesäästö:</span>
                  <span class="stat-arvo">{{ pilotti.statit.kulutusAlennus > 0 ? `-${pilotti.statit.kulutusAlennus}%` : '0%' }}</span>
                </div>
                <div class="stat-rivi" :class="{ 'on-aktiivinen': pilotti.statit.tuloBonus > 0 }">
                  <span class="stat-label">💶 Lipputulobonus:</span>
                  <span class="stat-arvo">{{ pilotti.statit.tuloBonus > 0 ? `+${pilotti.statit.tuloBonus}%` : '0%' }}</span>
                </div>
                <div class="stat-rivi" :class="{ 'on-aktiivinen': pilotti.statit.kultaBonus > 0 }">
                  <span class="stat-label">🟡 Kultabonus per lento:</span>
                  <span class="stat-arvo">{{ pilotti.statit.kultaBonus > 0 ? `+${pilotti.statit.kultaBonus} kultaa` : '0' }}</span>
                </div>
                <div class="stat-rivi" :class="{ 'on-aktiivinen': pilotti.statit.xpBonus > 0 }">
                  <span class="stat-label">⭐ Kokemusbonus (XP):</span>
                  <span class="stat-arvo">{{ pilotti.statit.xpBonus > 0 ? `+${pilotti.statit.xpBonus}%` : '0%' }}</span>
                </div>
              </div>

              <!-- SIJOITUS KONEESEEN -->
              <div class="pilotti-sijoitus-osio">
                <div class="sijoitus-otsikko">Lentokone:</div>
                <!-- Jos ollaan valitsemassa tietylle koneelle pilottia -->
                <div v-if="valittuKonePilotinAsetukseen !== null">
                  <button 
                    class="nappi mini-toiminto-nappi valitse-koneelle-nappi"
                    @click="asetaPilottiKoneeseen(valittuKonePilotinAsetukseen, pilotti.id)"
                  >
                    ✓ Aseta koneeseen {{ koneenNimiIdlla(valittuKonePilotinAsetukseen) }}
                  </button>
                </div>
                <!-- Yleinen valinta koneeseen -->
                <div v-else class="kone-valinta-rivi">
                  <select 
                    class="pilotti-kone-select"
                    :value="lentokoneet.find(k => k.pilottiId === pilotti.id)?.id || ''"
                    @change="e => {
                      const val = (e.target as HTMLSelectElement).value
                      if (val) {
                        asetaPilottiKoneeseen(Number(val), pilotti.id)
                      } else {
                        const current = lentokoneet.find(k => k.pilottiId === pilotti.id)
                        if (current) asetaPilottiKoneeseen(current.id, null)
                      }
                    }"
                  >
                    <option value="">(Ei asetettu koneeseen / Vapaana)</option>
                    <option v-for="k in lentokoneet" :key="k.id" :value="k.id">
                      ✈️ {{ k.nimi }} {{ k.pilottiId === pilotti.id ? '(Asetettu tähän)' : '' }}
                    </option>
                  </select>
                </div>
              </div>

              <!-- TOIMINTORIVI: PÄIVITYS & IRTISANOMINEN -->
              <div class="pilotti-kortti-footer">
                <div class="pilotti-footer-napit">
                  <button 
                    v-if="pilotti.id !== 'pilot_default' && pilotti.taso < pilotti.maxTaso"
                    class="nappi-upgrade-pilotti"
                    :disabled="(pilotti.paivitysValuutta === 'kulta' ? kulta < pilotti.paivitysHinta : rahat < pilotti.paivitysHinta) || toimintoLataus"
                    @click="paivitaPilotti(pilotti)"
                    title="Kouluta pilottia paremmaksi (parantaa statseja)"
                  >
                    <span>⭐ Kouluta tasolle {{ pilotti.taso + 1 }}</span>
                    <span class="koulutus-hinnat">
                      <span v-if="pilotti.paivitysValuutta === 'raha'">💶 {{ pilotti.paivitysHinta }} €</span>
                      <span v-else>🟡 {{ pilotti.paivitysHinta }} kultaa</span>
                    </span>
                  </button>
                  <div v-else-if="pilotti.id !== 'pilot_default' && pilotti.taso >= pilotti.maxTaso" class="max-taso-badge">
                    ⭐ Maksimitaso saavutettu!
                  </div>
                  <div v-else class="oletus-pilotti-info">
                    Peruslentäjä (Ei koulutettavissa)
                  </div>

                  <button 
                    v-if="pilotti.id !== 'pilot_default'"
                    class="nappi-irtisano"
                    @click="irtisanoPilotti(pilotti)"
                    title="Irtisano pilotti miehistöstä"
                  >
                    🗑️ Irtisano (+{{ Math.round(pilotti.hinta * 0.3) }} {{ pilotti.valuutta === 'kulta' ? 'kultaa' : '€' }})
                  </button>
                </div>
              </div>

            </div>
          </div>
        </div>

        <!-- 2. REKRYTOINTITOIMISTO (KAUPPA) -->
        <div v-else-if="pilottiValilehti === 'kauppa'" class="pilotti-sisalto">
          <div class="rekry-ohje-banner">
            <div class="rekry-ohje-teksti">
              <strong>Uusia hakemuksia saapuu säännöllisesti:</strong> Hakijalista uusiutuu lentokenttien ja osakaupan tahdissa. Harvinaisemmat kapteenit ovat kalliimpia mutta tuovat valtavia etuja!
            </div>
            <div class="rekry-ajastin-laatikko">
              ⏱️ Seuraavat hakijat: <strong>{{ muotoileAika(aikaSeuraavaanPaivitykseen) }}</strong>
            </div>
          </div>

          <div v-if="kaupanPilotit && kaupanPilotit.length > 0" class="pilotti-grid">
            <div 
              v-for="p in kaupanPilotit" 
              :key="p.id" 
              class="pilotti-kortti kauppa-kortti"
              :class="'kortti-' + p.harvinaisuus"
            >
              <div class="pilotti-kortti-header">
                <div class="pilotti-kuva-alue">
                  <span class="pilotti-iso-emoji">{{ p.avatar }}</span>
                </div>
                <div class="pilotti-paatiedot">
                  <div class="pilotti-nimi-rivi">
                    <h3 class="pilotti-nimi">{{ p.nimi }}</h3>
                    <span class="harvinaisuus-tag" :class="'tag-' + p.harvinaisuus">
                      {{ p.harvinaisuus }}
                    </span>
                  </div>
                  <div class="pilotti-titteli">{{ p.titteli }}</div>
                  <div class="pilotti-taso-rivi">
                    <span class="taso-pala">⭐ Alkuperäistaso {{ p.taso }} (Max {{ p.maxTaso }})</span>
                  </div>
                </div>
              </div>

              <!-- LENTOBONUKSET -->
              <div class="pilotti-statit-laatikko">
                <div class="stat-otsikko">Aloitusbonukset:</div>
                <div class="stat-rivi" :class="{ 'on-aktiivinen': p.statit.nopeusBonus > 0 }">
                  <span class="stat-label">⚡ Lentonopeus:</span>
                  <span class="stat-arvo">+{{ p.statit.nopeusBonus }}%</span>
                </div>
                <div class="stat-rivi" :class="{ 'on-aktiivinen': p.statit.kulutusAlennus > 0 }">
                  <span class="stat-label">⛽ Polttoainesäästö:</span>
                  <span class="stat-arvo">-{{ p.statit.kulutusAlennus }}%</span>
                </div>
                <div class="stat-rivi" :class="{ 'on-aktiivinen': p.statit.tuloBonus > 0 }">
                  <span class="stat-label">💶 Lipputulobonus:</span>
                  <span class="stat-arvo">+{{ p.statit.tuloBonus }}%</span>
                </div>
                <div class="stat-rivi" :class="{ 'on-aktiivinen': p.statit.kultaBonus > 0 }">
                  <span class="stat-label">🟡 Kultabonus:</span>
                  <span class="stat-arvo">+{{ p.statit.kultaBonus }} kultaa</span>
                </div>
                <div class="stat-rivi" :class="{ 'on-aktiivinen': p.statit.xpBonus > 0 }">
                  <span class="stat-label">⭐ XP-bonus:</span>
                  <span class="stat-arvo">+{{ p.statit.xpBonus }}%</span>
                </div>
              </div>

              <!-- HINTA JA PALKKAUS -->
              <div class="kauppa-pilotti-footer">
                <div class="pilotti-hinta-laatikko">
                  <span v-if="p.valuutta === 'raha'" class="hinta-euro">💶 {{ p.hinta.toLocaleString() }} €</span>
                  <span v-else class="hinta-kulta">🟡 {{ p.hinta }} kultaa</span>
                </div>
                <button 
                  class="nappi-palkkaa"
                  :disabled="(p.valuutta === 'kulta' ? kulta < p.hinta : rahat < p.hinta) || toimintoLataus"
                  @click="ostaPilotti(p)"
                  title="Palkkaa pilotti lentoyhtiöösi"
                >
                  ✍️ Palkkaa miehistöön
                </button>
              </div>

            </div>
          </div>
          <div v-else class="pilotti-tyhja-tila">
            <span class="tyhja-ikoni">🏢</span>
            <h2>Ei avoimia hakemuksia</h2>
            <p>Kaikki tarjolla olleet lentäjät on palkattu tai kierros on päättynyt. Uusia hakijoita saapuu seuraavassa päivityksessä!</p>
          </div>
        </div>

        <div class="hangari-ala-sulje">
          <button class="sulje-modal" @click="suljePilotit">Sulje pilottikeskus</button>
        </div>
      </div>

      <!-- PIIPPARI (PÄIVITTÄINEN METALLINPALJASTIN) -->
      <div v-else-if="etsintaAuki" class="nakyma piippari-nakyma">
        <div class="osio-otsikko-rivi">
          <div>
            <h1>🧭 Piippari – Päivittäinen etsintä</h1>
            <p class="ohjeteksti">
              Tutki maaperää metallinpaljastimella kerran vuorokaudessa! Käännä 4x4-ruudukon laattoja ja löydä kätkettyjä aarteita, rahaa, kultaa ja lentokoneen osia.
            </p>
          </div>
          <span class="osio-badge">{{ etsintaAvatutLkm }} / 16 tutkittu</span>
        </div>

        <!-- Tilan ilmoituslaatikko -->
        <transition name="pop-fade">
          <div v-if="etsintaViesti" class="etsinta-viesti-banner">
            {{ etsintaViesti }}
          </div>
        </transition>

        <!-- 4x4 ETSINTÄRUUDUKKO (16 RUUTUA) -->
        <div class="piippari-alue">
          <div class="piippari-grid">
            <div 
              v-for="(ruutu, index) in etsintaRuudut" 
              :key="ruutu.id ?? index"
              class="piippari-kortti-wrapper"
              :class="{ 'on-avattu': ruutu.avattu, 'klikattu': etsintaKlikattuIndeksi === index }"
              @click="avaaRuutu(index)"
            >
              <div class="piippari-kortti-3d">
                <!-- ETUPUOLI (KÄÄNTÄMÄTÖN MAAPERÄLAATTA) -->
                <div class="kortti-puoli kortti-etu">
                  <div class="tutka-keha"></div>
                  <div class="kortti-etu-sisus">
                    <span class="laatta-ikoni">🧭</span>
                    <span class="laatta-teksti">#{{ index + 1 }}</span>
                    <span class="laatta-kehote">Tutki</span>
                  </div>
                </div>

                <!-- TAKAPUOLI (PALJASTUNUT LÖYTÖ) -->
                <div class="kortti-puoli kortti-taka" :class="[`loyto-${ruutu.tyyppi}`]">
                  <div class="loyto-hohde"></div>
                  <span class="loyto-ikoni">{{ ruutu.ikoni || (ruutu.tyyppi === 'kulta' ? '🟡' : ruutu.tyyppi === 'raha' ? '💰' : ruutu.tyyppi === 'osa' ? '✈️' : '🪨') }}</span>
                  <span class="loyto-nimi">{{ ruutu.nimi }}</span>
                  <span class="loyto-arvo-badge">{{ ruutu.arvoTeksti || (ruutu.tyyppi === 'tyhja' ? 'Hukkanosto' : '') }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- SAALIS- JA VALMISTUMISYHTEENVETO -->
        <div class="piippari-yhteenveto">
          <div class="saalis-kortti">
            <div class="saalis-otsikko">🎒 Päivän kerätty saalis:</div>
            <div class="saalis-rivit">
              <span class="saalis-item raha">💰 +{{ etsintaSaalis.rahat }} €</span>
              <span class="saalis-item kulta">🟡 +{{ etsintaSaalis.kulta }} kultaa</span>
              <span class="saalis-item osat">✈️ {{ etsintaSaalis.osat.length }} osaa</span>
              <span class="saalis-item tyhjat">🪨 {{ etsintaSaalis.tyhjat }} hukkanostoa</span>
            </div>
            <div v-if="etsintaSaalis.osat.length > 0" class="saalis-osat-lista">
              <strong>Löydetyt osat tehtaassa:</strong>
              <span v-for="(oNimi, oi) in etsintaSaalis.osat" :key="oi" class="saalis-osa-tag">🛠️ {{ oNimi }}</span>
            </div>
          </div>

          <div v-if="etsintaKaikkiAvattu || etsintaCooldown > 0" class="cooldown-laatikko">
            <div class="cooldown-ikoni">⏳</div>
            <div class="cooldown-tekstit">
              <h3>Kaikki ruudut tältä päivältä tutkittu!</h3>
              <p>Uusi metallinpaljastusalue aukeaa 24 tunnin jäähyn jälkeen.</p>
              <div class="cooldown-aika">
                Seuraava alue valmis: <strong>{{ muotoileTunnitMinuutit(etsintaCooldown) }}</strong>
              </div>
            </div>
          </div>
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
          <button class="romuta-nappi" @click="romutaKone()">🗑️ Myy romuksi (500 €)</button>
        </div>

        <!-- KONEEN PILOTTI -->
        <div class="aktiivinen-pilotti-palkki" :class="'pilotti-reuna-' + haePilottiKoneelle(aktiivinenKone).harvinaisuus">
          <div class="pilotti-palkki-vasen">
            <span class="pilotti-palkki-kuva">{{ haePilottiKoneelle(aktiivinenKone).avatar }}</span>
            <div class="pilotti-palkki-tiedot">
              <div class="pilotti-palkki-nimi">
                <strong>{{ haePilottiKoneelle(aktiivinenKone).nimi }}</strong>
                <span class="harvinaisuus-tag mini" :class="'tag-' + haePilottiKoneelle(aktiivinenKone).harvinaisuus">{{ haePilottiKoneelle(aktiivinenKone).harvinaisuus }}</span>
                <span class="pilotti-taso-badge">⭐ Taso {{ haePilottiKoneelle(aktiivinenKone).taso }}/{{ haePilottiKoneelle(aktiivinenKone).maxTaso }}</span>
              </div>
              <div class="pilotti-palkki-bonukset">
                <span v-if="haePilottiKoneelle(aktiivinenKone).statit.nopeusBonus > 0" class="pilotti-bonus-pill nopeus">⚡ +{{ haePilottiKoneelle(aktiivinenKone).statit.nopeusBonus }}% nopeus</span>
                <span v-if="haePilottiKoneelle(aktiivinenKone).statit.kulutusAlennus > 0" class="pilotti-bonus-pill kulutus">⛽ -{{ haePilottiKoneelle(aktiivinenKone).statit.kulutusAlennus }}% kulutus</span>
                <span v-if="haePilottiKoneelle(aktiivinenKone).statit.tuloBonus > 0" class="pilotti-bonus-pill tulo">💶 +{{ haePilottiKoneelle(aktiivinenKone).statit.tuloBonus }}% tulot</span>
                <span v-if="haePilottiKoneelle(aktiivinenKone).statit.kultaBonus > 0" class="pilotti-bonus-pill kulta">🟡 +{{ haePilottiKoneelle(aktiivinenKone).statit.kultaBonus }} kultaa</span>
                <span v-if="haePilottiKoneelle(aktiivinenKone).statit.xpBonus > 0" class="pilotti-bonus-pill xp">⭐ +{{ haePilottiKoneelle(aktiivinenKone).statit.xpBonus }}% XP</span>
                <span v-if="haePilottiKoneelle(aktiivinenKone).id === 'pilot_default'" class="pilotti-bonus-pill neutraali">Peruslentäjä (Ei erikoisbonuksia)</span>
              </div>
            </div>
          </div>
          <button class="nappi mini-toiminto-nappi" @click="avaaPilotit(aktiivinenKone.id)">
            👨‍✈️ Vaihda pilotti
          </button>
        </div>

        <!-- LENTOKONEEN PÄIVITYSPANEELI -->
        <div class="upgrade-paneeli">
          <div class="lista-otsikko" style="margin-bottom: 10px;">🛠️ Päivitä konetta</div>
          <div class="upgrade-buttons">
            <button @click="paivitaNopeus()" :disabled="kulta < hintaNopeus">
              <strong>Nopeus ({{ aktiivinenKone.nopeusTaso }})</strong><br/>
              +20 km/h<br/>
              <span class="kulta-teksti">🟡 {{ hintaNopeus }}</span>
            </button>
            <button @click="paivitaKulutus()" :disabled="kulta < hintaKulutus || aktiivinenKone.kulutus <= 2">
              <strong>Kulutus ({{ aktiivinenKone.kulutusTaso }})</strong><br/>
              -15% kulua<br/>
              <span class="kulta-teksti">🟡 {{ aktiivinenKone.kulutus > 2 ? hintaKulutus : 'MAX' }}</span>
            </button>
            <button @click="paivitaTilavuus()" :disabled="kulta < hintaTilavuus" class="kallis-nappi">
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
              <div class="ryhma-kohde-tiedot">
                📍 {{ ryhma.kohde }} <span class="etaisyys-badge">({{ ryhma.etaisyys }} km)</span>
              </div>
              <button 
                class="lisaa-kaikki-ryhma-nappi"
                :disabled="vapaatPaikat <= 0"
                @click="lisaaKaikkiKohteeseen(ryhma.kohde)"
                :title="vapaatPaikat <= 0 ? 'Kone on jo täynnä' : (vapaatPaikat < ryhma.jasenet.length ? `Tilaa vain ${vapaatPaikat} matkustajalle (${ryhma.jasenet.length} odottaa). Priorisoi kultamatkustajat!` : `Lisää kaikki ${ryhma.jasenet.length} matkustajaa koneeseen`)"
              >
                <span class="plus-merkki">➕</span>
                <span>Ota kaikki ({{ ryhma.jasenet.length }})</span>
                <span v-if="ryhma.kultaMatkustajiaLkm > 0" class="ryhma-kulta-badge" :title="`${ryhma.kultaMatkustajiaLkm} kultamatkustajaa`">
                  🟡 {{ ryhma.kultaMatkustajiaLkm }}
                </span>
              </button>
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
                  <span class="lista-otsikko">{{ puhdistaPelaajanNimi(tulos.pelaajanNimi || tulos.pelaajan_nimi) }}</span>
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
    <button v-if="valittuKentta || tyopajaAuki || kenttaKauppaAuki || tilastotAuki || etsintaAuki || hangariAuki || pilotitAuki" class="takaisin-nappi" @click="meneTaaksepain">✕</button>
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

.piippari-nappi {
  flex: 1.35;
  background: linear-gradient(135deg, rgba(0, 229, 255, 0.22) 0%, rgba(3, 169, 244, 0.16) 100%);
  border-color: rgba(0, 229, 255, 0.45);
  color: #80deea;
}

.piippari-nappi:hover {
  border-color: rgba(0, 229, 255, 0.85);
  box-shadow: 0 6px 20px rgba(0, 229, 255, 0.35);
}

.piippari-valmis {
  font-size: 0.7rem;
  color: #80deea;
  font-weight: 700;
  text-transform: uppercase;
}

.piippari-syke {
  animation: cyanPulse 2s infinite cubic-bezier(0.4, 0, 0.6, 1);
  border-color: #00e5ff !important;
  box-shadow: 0 0 16px rgba(0, 229, 255, 0.45) !important;
}

@keyframes cyanPulse {
  0% { box-shadow: 0 0 0 0 rgba(0, 229, 255, 0.6); }
  70% { box-shadow: 0 0 0 8px rgba(0, 229, 255, 0); }
  100% { box-shadow: 0 0 0 0 rgba(0, 229, 255, 0); }
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
  gap: 8px;
  flex-wrap: wrap;
}

.ryhma-kohde-tiedot {
  display: flex;
  align-items: center;
  gap: 6px;
}

.lisaa-kaikki-ryhma-nappi {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: linear-gradient(135deg, #059669 0%, #10b981 100%);
  border: 1px solid rgba(52, 211, 153, 0.4);
  color: #ffffff;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 0.76rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: 0 2px 6px rgba(16, 185, 129, 0.25);
}

.lisaa-kaikki-ryhma-nappi:hover:not(:disabled) {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  transform: translateY(-1px);
  box-shadow: 0 3px 8px rgba(16, 185, 129, 0.35);
}

.lisaa-kaikki-ryhma-nappi:disabled {
  background: rgba(148, 163, 184, 0.1);
  border-color: rgba(148, 163, 184, 0.2);
  color: #64748b;
  cursor: not-allowed;
  box-shadow: none;
  transform: none;
  opacity: 0.55;
}

.plus-merkki {
  font-size: 0.72rem;
}

.ryhma-kulta-badge {
  background: rgba(255, 213, 79, 0.25);
  border: 1px solid rgba(255, 213, 79, 0.6);
  color: #ffd54f;
  font-size: 0.68rem;
  padding: 1px 5px;
  border-radius: 4px;
  font-weight: 800;
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

/* ==========================================================================
   PIIPPARI (PÄIVITTÄINEN METALLINPALJASTIN) & 3D-KÄÄNTÖANIMAATIO
   ========================================================================== */
.piippari-nakyma {
  animation: viewFadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.etsinta-viesti-banner {
  background: linear-gradient(135deg, rgba(0, 229, 255, 0.2), rgba(14, 116, 144, 0.25));
  border: 1px solid #00e5ff;
  color: #e0f7fa;
  border-radius: 10px;
  padding: 10px 16px;
  margin-bottom: 18px;
  text-align: center;
  font-weight: 700;
  font-size: 0.92rem;
  box-shadow: 0 0 16px rgba(0, 229, 255, 0.25);
}

.piippari-alue {
  margin: 10px 0 20px 0;
}

.piippari-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
  max-width: 620px;
  margin: 0 auto;
}

/* 3D-kortin kääntökontti */
.piippari-kortti-wrapper {
  perspective: 1200px;
  -webkit-perspective: 1200px;
  cursor: pointer;
  height: 125px;
  position: relative;
  user-select: none;
}

.piippari-kortti-3d {
  position: relative;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
  -webkit-transform-style: preserve-3d;
  transition: transform 0.85s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.35s ease;
  border-radius: 14px;
}

/* Leijutus ja 3D-kallistus ennen avaamista */
.piippari-kortti-wrapper:hover:not(.on-avattu) .piippari-kortti-3d {
  transform: translateY(-5px) scale(1.03) rotateY(12deg);
  box-shadow: 0 12px 28px rgba(0, 229, 255, 0.35);
}

.piippari-kortti-wrapper.on-avattu .piippari-kortti-3d {
  transform: rotateY(180deg);
}

/* Kortin puolet (etu & taka) */
.kortti-puoli {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border-radius: 14px;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 8px;
  box-sizing: border-box;
  overflow: hidden;
}

/* Kääntämätön laatta (etupuoli) */
.kortti-etu {
  background: linear-gradient(145deg, rgba(28, 38, 56, 0.95), rgba(16, 22, 34, 0.98));
  border: 2px solid rgba(80, 140, 200, 0.28);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.45);
  position: relative;
}

.tutka-keha {
  position: absolute;
  width: 130px;
  height: 130px;
  border-radius: 50%;
  border: 1px dashed rgba(0, 229, 255, 0.22);
  animation: tutkaPyori 10s linear infinite;
  pointer-events: none;
}

@keyframes tutkaPyori {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.kortti-etu-sisus {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  z-index: 1;
}

.laatta-ikoni {
  font-size: 1.8rem;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5));
}

.laatta-teksti {
  font-size: 0.85rem;
  font-weight: 700;
  color: #90caf9;
  font-family: var(--font-head, 'Outfit', sans-serif);
}

.laatta-kehote {
  font-size: 0.65rem;
  color: #64b5f6;
  opacity: 0.8;
  text-transform: uppercase;
  font-weight: 600;
  letter-spacing: 0.5px;
}

/* Paljastunut laatta (takapuoli) */
.kortti-taka {
  transform: rotateY(180deg);
  border: 2px solid transparent;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  text-align: center;
}

.loyto-ikoni {
  font-size: 2rem;
  margin-bottom: 2px;
  filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.6));
}

.loyto-nimi {
  font-size: 0.78rem;
  font-weight: 700;
  line-height: 1.15;
  margin-bottom: 4px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.loyto-arvo-badge {
  font-size: 0.72rem;
  font-weight: 800;
  padding: 2px 8px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid currentColor;
  letter-spacing: 0.3px;
}

/* Eri löytötyyppien uniikit hehkut ja väritykset */
.loyto-kulta {
  background: linear-gradient(145deg, rgba(46, 36, 10, 0.95), rgba(26, 20, 5, 0.98));
  border-color: rgba(255, 215, 0, 0.75);
  box-shadow: 0 0 20px rgba(255, 215, 0, 0.35);
  color: #ffd54f;
}

.loyto-raha {
  background: linear-gradient(145deg, rgba(16, 42, 28, 0.95), rgba(8, 26, 16, 0.98));
  border-color: rgba(0, 230, 118, 0.75);
  box-shadow: 0 0 20px rgba(0, 230, 118, 0.35);
  color: #69f0ae;
}

.loyto-osa {
  background: linear-gradient(145deg, rgba(14, 38, 55, 0.95), rgba(8, 22, 36, 0.98));
  border-color: rgba(0, 229, 255, 0.85);
  box-shadow: 0 0 24px rgba(0, 229, 255, 0.45);
  color: #80deea;
}

.loyto-tyhja {
  background: linear-gradient(145deg, rgba(28, 30, 36, 0.95), rgba(18, 20, 24, 0.98));
  border-color: rgba(140, 150, 170, 0.3);
  opacity: 0.85;
  color: #94a3b8;
}

/* Yhteenveto ja päivittäinen jäähyalue */
.piippari-yhteenveto {
  margin-top: 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 620px;
  margin-left: auto;
  margin-right: auto;
}

.saalis-kortti {
  background: rgba(16, 24, 38, 0.85);
  border: 1px solid rgba(100, 160, 230, 0.25);
  border-radius: 14px;
  padding: 16px 20px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
}

.saalis-otsikko {
  font-size: 0.95rem;
  font-weight: 700;
  color: #e2e8f0;
  margin-bottom: 10px;
  font-family: var(--font-head, 'Outfit', sans-serif);
}

.saalis-rivit {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.saalis-item {
  padding: 5px 12px;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 700;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid transparent;
}

.saalis-item.raha { color: #69f0ae; border-color: rgba(0, 230, 118, 0.35); }
.saalis-item.kulta { color: #ffd54f; border-color: rgba(255, 215, 0, 0.35); }
.saalis-item.osat { color: #80deea; border-color: rgba(0, 229, 255, 0.35); }
.saalis-item.tyhjat { color: #94a3b8; border-color: rgba(140, 150, 170, 0.25); }

.saalis-osat-lista {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px dashed rgba(100, 160, 230, 0.2);
  font-size: 0.82rem;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.saalis-osa-tag {
  color: #80deea;
  font-weight: 600;
  padding: 3px 8px;
  background: rgba(0, 229, 255, 0.12);
  border-radius: 6px;
  display: inline-block;
  align-self: flex-start;
}

.cooldown-laatikko {
  display: flex;
  align-items: center;
  gap: 16px;
  background: linear-gradient(135deg, rgba(30, 41, 59, 0.92), rgba(15, 23, 42, 0.98));
  border: 1px solid rgba(0, 229, 255, 0.35);
  border-radius: 14px;
  padding: 18px 22px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

.cooldown-ikoni {
  font-size: 2.2rem;
}

.cooldown-tekstit h3 {
  margin: 0 0 4px 0;
  font-size: 1.05rem;
  color: #f1f5f9;
  font-family: var(--font-head, 'Outfit', sans-serif);
}

.cooldown-tekstit p {
  margin: 0 0 6px 0;
  font-size: 0.82rem;
  color: #94a3b8;
}

.cooldown-aika {
  font-size: 0.9rem;
  color: #00e5ff;
  font-weight: 600;
}

/* HANGARIN PAINIKE JA LINKKI */
.hangari-nappi {
  flex: 1.2;
  background: linear-gradient(135deg, rgba(33, 150, 243, 0.22) 0%, rgba(30, 58, 138, 0.25) 100%);
  border-color: rgba(33, 150, 243, 0.45);
  color: #90caf9;
}

.hangari-nappi:hover {
  border-color: #64b5f6;
  box-shadow: 0 6px 20px rgba(33, 150, 243, 0.35);
}

.hangari-paikat-badge {
  font-size: 0.72rem;
  font-weight: 700;
  color: #90caf9;
  letter-spacing: 0.5px;
}

.hangari-linkki {
  cursor: pointer;
  transition: color 0.15s ease;
}

.hangari-linkki:hover {
  color: #60a5fa;
  text-decoration: underline;
}

/* HANGARI / LAIVASTO */
.hangari-nakyma {
  text-align: left;
}

.hangari-kapasiteetti-kortti {
  background: rgba(18, 28, 45, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(12px);
  border-radius: 14px;
  padding: 16px 18px;
  margin-bottom: 20px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

.hangari-info-ylariivi {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.hangari-paikat-info {
  display: flex;
  flex-direction: column;
}

.hangari-kapasiteetti-otsikko {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: #94a3b8;
  font-weight: 600;
}

.hangari-paikat-arvo {
  font-size: 1.25rem;
  color: #f1f5f9;
}

.hangari-paikat-arvo strong {
  color: #60a5fa;
  font-size: 1.4rem;
}

.osta-konepaikka-nappi {
  display: flex;
  align-items: center;
  gap: 8px;
  background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%);
  border: 1px solid rgba(96, 165, 250, 0.4);
  color: #fff;
  border-radius: 10px;
  padding: 8px 14px;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
}

.osta-konepaikka-nappi:hover:not(:disabled) {
  background: linear-gradient(135deg, #2563eb 0%, #3b82f6 100%);
  transform: translateY(-2px);
  box-shadow: 0 6px 18px rgba(37, 99, 235, 0.45);
}

.osta-konepaikka-nappi:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  filter: grayscale(0.6);
}

.osta-nappi-tekstit {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  line-height: 1.2;
}

.osta-nappi-otsikko {
  font-size: 0.8rem;
  font-weight: 700;
}

.osta-nappi-hinta {
  font-size: 0.72rem;
  color: #fbbf24;
  font-weight: 600;
}

.hangari-kisko-wrapper {
  width: 100%;
  height: 8px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  overflow: hidden;
  margin-bottom: 14px;
}

.hangari-kisko-tayte {
  height: 100%;
  background: linear-gradient(90deg, #3b82f6 0%, #60a5fa 100%);
  border-radius: 999px;
  transition: width 0.3s ease;
}

.hangari-stat-pillerit {
  display: flex;
  gap: 8px;
}

.stat-pilleri {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 0.82rem;
  cursor: pointer;
  transition: all 0.2s ease;
  color: #94a3b8;
}

.stat-pilleri:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #f1f5f9;
}

.stat-pilleri.aktiivinen {
  background: rgba(59, 130, 246, 0.2);
  border-color: #3b82f6;
  color: #60a5fa;
  font-weight: 700;
}

.pilleri-maara {
  background: rgba(0, 0, 0, 0.35);
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
}

/* HANGARIN KONEKORTIT */
.hangari-kone-lista {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 24px;
}

.hangari-kone-kortti {
  background: #141f30;
  border: 1px solid #23354d;
  border-radius: 14px;
  padding: 16px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
  transition: transform 0.2s, border-color 0.2s;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.hangari-kone-kortti:hover {
  border-color: #3e5e8a;
  transform: translateY(-2px);
}

.hangari-kone-kortti.kortti-ilmassa {
  border-left: 4px solid #38bdf8;
  background: linear-gradient(180deg, #142238 0%, #111a29 100%);
}

.hangari-kone-kortti.kortti-maassa {
  border-left: 4px solid #4ade80;
  background: linear-gradient(180deg, #13242a 0%, #111a24 100%);
}

.hangari-kone-yliosa {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.kone-tunniste-alue {
  display: flex;
  align-items: center;
  gap: 10px;
}

.kone-tyyppi-ikoni {
  font-size: 1.8rem;
  background: rgba(255, 255, 255, 0.05);
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.kone-paa-otsikko {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.kone-nimi {
  font-size: 1.15rem;
  font-weight: 700;
  color: #f8fafc;
}

.kone-malli-badge {
  font-size: 0.72rem;
  background: rgba(148, 163, 184, 0.15);
  border: 1px solid rgba(148, 163, 184, 0.3);
  color: #cbd5e1;
  padding: 2px 8px;
  border-radius: 6px;
  font-weight: 600;
}

.kone-alaviite {
  font-size: 0.72rem;
  color: #64748b;
  margin-top: 2px;
}

.kone-tila-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 0.78rem;
  font-weight: 700;
  white-space: nowrap;
}

.kone-tila-badge.tila-ilmassa {
  background: rgba(56, 189, 248, 0.15);
  border: 1px solid rgba(56, 189, 248, 0.4);
  color: #38bdf8;
}

.kone-tila-badge.tila-maassa {
  background: rgba(74, 222, 128, 0.15);
  border: 1px solid rgba(74, 222, 128, 0.4);
  color: #4ade80;
}

.vihrea-piste {
  font-size: 0.65rem;
  color: #4ade80;
}

/* LENTO LIVE ALUE */
.hangari-lento-live-alue {
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid rgba(56, 189, 248, 0.25);
  border-radius: 10px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.hangari-lento-reitti {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.88rem;
  color: #cbd5e1;
  flex-wrap: wrap;
}

.reitti-nuoli {
  color: #38bdf8;
  font-weight: bold;
}

.reitti-kohde {
  font-weight: 700;
  color: #f1f5f9;
}

.bonus-tagi {
  background: rgba(255, 213, 79, 0.2);
  border: 1px solid #ffd54f;
  color: #ffd54f;
  font-size: 0.7rem;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 700;
}

.hangari-radar-kisko {
  position: relative;
  height: 8px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  overflow: visible;
  margin: 6px 0;
}

.hangari-radar-tayte {
  height: 100%;
  background: linear-gradient(90deg, #0284c7 0%, #38bdf8 100%);
  border-radius: 999px;
  transition: width 0.5s linear;
}

.hangari-lentava-kone {
  position: absolute;
  top: -10px;
  transform: translateX(-50%);
  font-size: 1rem;
  filter: drop-shadow(0 0 6px #38bdf8);
  transition: left 0.5s linear;
}

.hangari-lento-aikatiedot {
  display: flex;
  justify-content: space-between;
  font-size: 0.78rem;
  color: #94a3b8;
}

/* MATKUSTAJAT & KUORMA */
.hangari-kuorma-alue {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.kuorma-header {
  display: flex;
  justify-content: space-between;
  font-size: 0.8rem;
  color: #94a3b8;
}

.kuorma-maara strong {
  color: #f1f5f9;
}

.kuorma-kisko {
  width: 100%;
  height: 6px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 999px;
  overflow: hidden;
}

.kuorma-tayte {
  height: 100%;
  background: linear-gradient(90deg, #10b981 0%, #34d399 100%);
  border-radius: 999px;
}

.hangari-matkustajat-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.pax-chip {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  padding: 3px 8px;
  font-size: 0.72rem;
  color: #e2e8f0;
}

.pax-kohde {
  color: #38bdf8;
  font-weight: 600;
}

.pax-kulta {
  color: #fbbf24;
  font-weight: 700;
  margin-left: 4px;
}

.kuorma-tyhja-teksti {
  font-size: 0.72rem;
  color: #64748b;
  font-style: italic;
}

/* UPGRADES GRID */
.hangari-upgradet-osio {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.upgradet-otsikko {
  font-size: 0.82rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: #94a3b8;
}

.upgrade-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.upgrade-laatikko {
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 10px;
  padding: 10px 8px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 6px;
  text-align: center;
}

.upgrade-info-rivi {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 4px;
}

.upgrade-nimi {
  font-size: 0.75rem;
  font-weight: 700;
  color: #cbd5e1;
}

.upgrade-taso-badge {
  font-size: 0.68rem;
  background: rgba(255, 213, 79, 0.15);
  border: 1px solid rgba(255, 213, 79, 0.4);
  color: #ffd54f;
  padding: 1px 5px;
  border-radius: 4px;
  font-weight: 700;
}

.upgrade-arvo {
  font-size: 1rem;
  font-weight: 800;
  color: #f8fafc;
  margin: 2px 0;
}

.nappi-upgrade {
  background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
  border: 1px solid rgba(255, 213, 79, 0.4);
  border-radius: 6px;
  padding: 5px 6px;
  color: #fff;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  transition: all 0.15s ease;
}

.nappi-upgrade:hover:not(:disabled) {
  background: linear-gradient(135deg, #334155 0%, #475569 100%);
  border-color: #ffd54f;
  transform: translateY(-1px);
}

.nappi-upgrade:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  border-color: rgba(255, 255, 255, 0.1);
}

.upgrade-teho {
  font-size: 0.72rem;
  font-weight: 700;
  color: #e2e8f0;
}

.upgrade-hinta {
  font-size: 0.7rem;
  color: #ffd54f;
  font-weight: 700;
}

/* KORTIN FOOTER */
.hangari-kortti-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
  padding-top: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.lennata-nappi {
  flex: 1;
  background: linear-gradient(135deg, #059669 0%, #10b981 100%);
  border: 1px solid #34d399;
  color: white;
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.lennata-nappi:hover {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.35);
}

.lennolla-status-note {
  flex: 1;
  font-size: 0.78rem;
  color: #38bdf8;
  font-weight: 600;
  text-align: left;
}

.nappi-romuta {
  background: transparent;
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #f87171;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.nappi-romuta:hover {
  background: rgba(239, 68, 68, 0.15);
  border-color: #ef4444;
}

/* TYHJÄ TILA */
.hangari-tyhja-tila {
  background: rgba(20, 30, 48, 0.5);
  border: 1px dashed rgba(255, 255, 255, 0.15);
  border-radius: 14px;
  padding: 36px 20px;
  text-align: center;
  margin: 20px 0;
}

.hangari-tyhja-tila .tyhja-ikoni {
  font-size: 3rem;
  display: block;
  margin-bottom: 12px;
}

.hangari-tyhja-tila h2 {
  font-size: 1.3rem;
  color: #f1f5f9;
  margin-bottom: 8px;
}

.hangari-tyhja-tila p {
  color: #94a3b8;
  max-width: 440px;
  margin: 0 auto 20px auto;
  font-size: 0.9rem;
}

.ensimmainen-kone-nappi {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  border: none;
  color: #fff;
  font-weight: 700;
  padding: 10px 20px;
  border-radius: 8px;
  cursor: pointer;
}

.hangari-ala-sulje {
  margin-top: 10px;
  text-align: center;
}

/* ========================================================
   PILOTTIJÄRJESTELMÄN TYYLIT
   ======================================================== */

.pilotit-nakyma {
  max-width: 1080px;
  margin: 0 auto;
}

.pilotti-valinta-ohje-banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(2, 132, 199, 0.2);
  border: 1.5px solid #0284c7;
  border-radius: 8px;
  padding: 10px 16px;
  margin-bottom: 14px;
  font-size: 0.95rem;
  color: #e0f2fe;
}

.nappi-peruuta-valinta {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #cbd5e1;
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 0.8rem;
  cursor: pointer;
  transition: 0.2s;
}

.nappi-peruuta-valinta:hover {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
  border-color: #ef4444;
}

.pilotti-tabit {
  display: flex;
  gap: 12px;
  margin: 12px 0 20px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding-bottom: 10px;
}

.pilotti-tab-nappi {
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #94a3b8;
  padding: 8px 18px;
  border-radius: 8px;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s ease;
}

.pilotti-tab-nappi:hover {
  color: #f1f5f9;
  background: rgba(51, 65, 85, 0.8);
}

.pilotti-tab-nappi.active {
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.25) 0%, rgba(2, 132, 199, 0.35) 100%);
  border-color: #38bdf8;
  color: #38bdf8;
  box-shadow: 0 0 14px rgba(56, 189, 248, 0.2);
}

.kauppa-ajastin-badge {
  font-size: 0.78rem;
  background: rgba(15, 23, 42, 0.7);
  padding: 2px 7px;
  border-radius: 6px;
  color: #fbbf24;
  border: 1px solid rgba(251, 191, 36, 0.3);
}

/* Pilottikortit & Grid */
.pilotti-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.pilotti-kortti {
  background: rgba(30, 41, 59, 0.75);
  backdrop-filter: blur(12px);
  border-radius: 12px;
  border: 1.5px solid;
  padding: 16px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.pilotti-kortti:hover {
  transform: translateY(-2px);
}

/* Harvinaisuuksien teemat ja hehkut */
.kortti-Tavallinen {
  border-color: rgba(148, 163, 184, 0.4);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
}

.kortti-Harvinainen {
  border-color: rgba(56, 189, 248, 0.55);
  box-shadow: 0 4px 16px rgba(56, 189, 248, 0.15);
}

.kortti-Eeppinen {
  border-color: rgba(192, 132, 252, 0.6);
  box-shadow: 0 4px 20px rgba(192, 132, 252, 0.2);
  background: linear-gradient(155deg, rgba(30, 41, 59, 0.8) 0%, rgba(88, 28, 135, 0.15) 100%);
}

.kortti-Legendaarinen {
  border-color: rgba(245, 158, 11, 0.75);
  box-shadow: 0 4px 24px rgba(245, 158, 11, 0.25);
  background: linear-gradient(155deg, rgba(30, 41, 59, 0.85) 0%, rgba(120, 53, 15, 0.25) 100%);
}

.pilotti-kortti-header {
  display: flex;
  gap: 14px;
  align-items: center;
  margin-bottom: 12px;
}

.pilotti-kuva-alue {
  width: 54px;
  height: 54px;
  border-radius: 50%;
  background: rgba(15, 23, 42, 0.8);
  border: 1.5px solid rgba(255, 255, 255, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.pilotti-iso-emoji {
  font-size: 2.2rem;
  line-height: 1;
}

.pilotti-paatiedot {
  flex: 1;
  min-width: 0;
}

.pilotti-nimi-rivi {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.pilotti-nimi {
  font-size: 1.1rem;
  font-weight: 700;
  color: #f1f5f9;
  margin: 0;
}

.pilotti-titteli {
  font-size: 0.82rem;
  color: #94a3b8;
  margin-top: 2px;
}

.pilotti-taso-rivi {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  font-size: 0.78rem;
}

.taso-pala {
  color: #f59e0b;
  font-weight: 600;
}

.pilotti-tyyppi-teksti {
  color: #64748b;
  font-style: italic;
}

/* Harvinaisuustagit */
.harvinaisuus-tag {
  font-size: 0.7rem;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 6px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.harvinaisuus-tag.mini {
  font-size: 0.62rem;
  padding: 1px 5px;
}

.tag-Tavallinen {
  background: rgba(148, 163, 184, 0.2);
  color: #cbd5e1;
  border: 1px solid rgba(148, 163, 184, 0.35);
}

.tag-Harvinainen {
  background: rgba(56, 189, 248, 0.2);
  color: #38bdf8;
  border: 1px solid rgba(56, 189, 248, 0.45);
}

.tag-Eeppinen {
  background: rgba(192, 132, 252, 0.2);
  color: #d8b4fe;
  border: 1px solid rgba(192, 132, 252, 0.5);
}

.tag-Legendaarinen {
  background: rgba(245, 158, 11, 0.25);
  color: #fbbf24;
  border: 1px solid rgba(245, 158, 11, 0.6);
  box-shadow: 0 0 8px rgba(245, 158, 11, 0.3);
}

/* Stat-laatikko */
.pilotti-statit-laatikko {
  background: rgba(15, 23, 42, 0.65);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 12px;
}

.stat-otsikko {
  font-size: 0.72rem;
  text-transform: uppercase;
  color: #64748b;
  letter-spacing: 0.5px;
  font-weight: 700;
  margin-bottom: 6px;
}

.stat-rivi {
  display: flex;
  justify-content: space-between;
  font-size: 0.8rem;
  padding: 3px 0;
  color: #64748b;
}

.stat-rivi.on-aktiivinen {
  color: #e2e8f0;
  font-weight: 600;
}

.stat-rivi.on-aktiivinen .stat-arvo {
  color: #38bdf8;
}

/* Sijoitus koneeseen */
.pilotti-sijoitus-osio {
  background: rgba(15, 23, 42, 0.45);
  border-radius: 8px;
  padding: 8px 10px;
  margin-bottom: 12px;
}

.sijoitus-otsikko {
  font-size: 0.75rem;
  color: #94a3b8;
  margin-bottom: 6px;
}

.pilotti-kone-select {
  width: 100%;
  background: #0f172a;
  color: #f1f5f9;
  border: 1px solid #334155;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 0.82rem;
  cursor: pointer;
  outline: none;
}

.pilotti-kone-select:focus {
  border-color: #38bdf8;
}

.valitse-koneelle-nappi {
  width: 100%;
  background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
  color: #fff;
  border: none;
  padding: 8px;
  font-weight: 700;
  border-radius: 6px;
  cursor: pointer;
}

/* Footer & toiminnot */
.pilotti-kortti-footer {
  margin-top: auto;
}

.pilotti-footer-napit {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.nappi-upgrade-pilotti {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  border: none;
  border-radius: 8px;
  color: #fff;
  padding: 8px 12px;
  font-weight: 700;
  font-size: 0.82rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  transition: all 0.2s ease;
}

.nappi-upgrade-pilotti:hover:not(:disabled) {
  filter: brightness(1.15);
  transform: translateY(-1px);
}

.nappi-upgrade-pilotti:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  filter: grayscale(0.5);
}

.koulutus-hinnat {
  display: flex;
  gap: 6px;
  font-size: 0.8rem;
}

.max-taso-badge {
  text-align: center;
  padding: 6px;
  border-radius: 6px;
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
  font-size: 0.8rem;
  font-weight: 600;
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.oletus-pilotti-info {
  text-align: center;
  padding: 6px;
  border-radius: 6px;
  background: rgba(100, 116, 139, 0.15);
  color: #94a3b8;
  font-size: 0.8rem;
}

.nappi-irtisano {
  background: transparent;
  border: 1px solid rgba(239, 68, 68, 0.35);
  color: #f87171;
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 0.72rem;
  cursor: pointer;
  transition: all 0.2s ease;
  align-self: flex-end;
}

.nappi-irtisano:hover {
  background: rgba(239, 68, 68, 0.15);
  border-color: #ef4444;
  color: #fca5a5;
}

/* Rekrytointitoimisto banner & kauppa */
.rekry-ohje-banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(30, 41, 59, 0.65);
  border: 1px solid rgba(56, 189, 248, 0.3);
  border-radius: 10px;
  padding: 12px 16px;
  margin-bottom: 18px;
  gap: 16px;
}

.rekry-ohje-teksti {
  font-size: 0.88rem;
  color: #cbd5e1;
  line-height: 1.4;
}

.rekry-ajastin-laatikko {
  font-size: 0.9rem;
  color: #38bdf8;
  white-space: nowrap;
  background: rgba(15, 23, 42, 0.6);
  padding: 6px 12px;
  border-radius: 8px;
  border: 1px solid rgba(56, 189, 248, 0.2);
}

.kauppa-pilotti-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 14px;
  gap: 10px;
}

.pilotti-hinta-laatikko {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.hinta-euro {
  font-weight: 700;
  color: #10b981;
  font-size: 0.92rem;
}

.hinta-kulta {
  font-weight: 700;
  color: #f59e0b;
  font-size: 0.82rem;
}

.nappi-palkkaa {
  background: linear-gradient(135deg, #059669 0%, #047857 100%);
  border: none;
  border-radius: 8px;
  color: #fff;
  padding: 8px 16px;
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.nappi-palkkaa:hover:not(:disabled) {
  filter: brightness(1.15);
  transform: translateY(-1px);
}

.nappi-palkkaa:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.pilotti-tyhja-tila {
  text-align: center;
  padding: 40px 20px;
  color: #94a3b8;
}

/* Aktiivinen pilottipalkki lentokenttänäkymässä */
.aktiivinen-pilotti-palkki {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(30, 41, 59, 0.85);
  border: 1.5px solid;
  border-radius: 10px;
  padding: 10px 14px;
  margin-bottom: 14px;
  gap: 12px;
}

.pilotti-reuna-Tavallinen {
  border-color: rgba(148, 163, 184, 0.4);
}

.pilotti-reuna-Harvinainen {
  border-color: rgba(56, 189, 248, 0.6);
  box-shadow: 0 0 10px rgba(56, 189, 248, 0.15);
}

.pilotti-reuna-Eeppinen {
  border-color: rgba(192, 132, 252, 0.65);
  box-shadow: 0 0 12px rgba(192, 132, 252, 0.2);
}

.pilotti-reuna-Legendaarinen {
  border-color: rgba(245, 158, 11, 0.75);
  box-shadow: 0 0 14px rgba(245, 158, 11, 0.25);
}

.pilotti-palkki-vasen {
  display: flex;
  align-items: center;
  gap: 12px;
}

.pilotti-palkki-kuva {
  font-size: 1.8rem;
  line-height: 1;
}

.pilotti-palkki-tiedot {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.pilotti-palkki-nimi {
  font-size: 0.95rem;
  color: #f1f5f9;
  display: flex;
  align-items: center;
  gap: 8px;
}

.pilotti-taso-badge {
  font-size: 0.75rem;
  color: #f59e0b;
  font-weight: 600;
}

.pilotti-palkki-bonukset {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.pilotti-bonus-pill {
  font-size: 0.7rem;
  padding: 2px 6px;
  border-radius: 5px;
  font-weight: 600;
}

.pilotti-bonus-pill.nopeus {
  background: rgba(56, 189, 248, 0.15);
  color: #38bdf8;
}

.pilotti-bonus-pill.kulutus {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
}

.pilotti-bonus-pill.tulo {
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
}

.pilotti-bonus-pill.kulta {
  background: rgba(234, 179, 8, 0.2);
  color: #fde047;
}

.pilotti-bonus-pill.xp {
  background: rgba(168, 85, 247, 0.2);
  color: #c084fc;
}

.pilotti-bonus-pill.neutraali {
  background: rgba(100, 116, 139, 0.15);
  color: #94a3b8;
}

/* Hangarissa näytettävä pilottilaatikko */
.hangari-pilotti-laatikko {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 8px 12px;
  margin: 10px 0;
  gap: 8px;
}

.hangari-pilotti-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.hangari-pilotti-kuva {
  font-size: 1.5rem;
}

.hangari-pilotti-tekstit {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.hangari-pilotti-otsikko {
  display: flex;
  align-items: center;
  gap: 6px;
}

.hangari-pilotti-nimi {
  font-weight: 600;
  font-size: 0.85rem;
  color: #f1f5f9;
}

.hangari-pilotti-bonukset {
  font-size: 0.72rem;
  color: #38bdf8;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.neutraali-bonus {
  color: #64748b;
}

.hangari-vaihda-pilotti-nappi {
  background: rgba(56, 189, 248, 0.15);
  border: 1px solid rgba(56, 189, 248, 0.35);
  color: #38bdf8;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.hangari-vaihda-pilotti-nappi:hover {
  background: rgba(56, 189, 248, 0.3);
}

@media (max-width: 600px) {
  .piippari-grid { gap: 8px; }
  .piippari-kortti-wrapper { height: 96px; }
  .laatta-ikoni { font-size: 1.4rem; }
  .laatta-teksti { font-size: 0.72rem; }
  .laatta-kehote { display: none; }
  .loyto-ikoni { font-size: 1.4rem; }
  .loyto-nimi { font-size: 0.68rem; }
  .loyto-arvo-badge { font-size: 0.65rem; padding: 1px 5px; }
  .upgrade-grid { grid-template-columns: 1fr; }
}

@media (max-width: 480px) {
  .kassa-rivi { grid-template-columns: 1fr; gap: 8px; }
  .yla-napit-rivi { flex-wrap: wrap; }
  .mini-nappi { flex: 1 1 calc(50% - 8px); }
  .xp-widget-alakulma { width: calc(100vw - 110px); left: 14px; bottom: 14px; }
  .takaisin-nappi { right: 14px; bottom: 14px; width: 52px; height: 52px; font-size: 22px; }
  .hangari-info-ylariivi { flex-direction: column; align-items: flex-start; }
  .osta-konepaikka-nappi { width: 100%; justify-content: center; }
  .hangari-stat-pillerit { flex-direction: column; }
}
</style>