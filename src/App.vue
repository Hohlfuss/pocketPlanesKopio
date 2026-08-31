<script setup lang="ts">
import { ref, computed, onMounted } from "vue"

interface Matkustaja {
  id: string
  nimi: string
  kohde: string
  lahtoKentta?: string
  tuottaaKultaa?: boolean
  kultaMaara?: number
}

interface Lentokone {
  id: number
  nimi: string
  nopeus: number
  paino: number
  kulutus: number
  matkustajaMaara: number
  sijainti: string     
  matkustajatKyydissa: Matkustaja[]
  tila: "Maassa" | "Ilmassa"
  reitti: string[]     
  kohde: string | null 
  lentoAikaJaljella: number
  onBonusLento: boolean 
}

interface OstettavaKentta {
  nimi: string
  hinta: number
}

type OsaTyyppi = 'moottori' | 'runko' | 'siivet'

interface Osa {
  malliId: string
  tyyppi: OsaTyyppi
  hinta: number
}

interface Piirustus {
  malliId: string
  nimi: string
  nopeus: number
  paino: number
  kulutus: number
  matkustajaMaara: number
}

// Pelin tila (Aloitusraha muutettu 100)
const rahat = ref(100)
const kulta = ref(0) 
const kultaIlmoitus = ref("") 
const tallennusIlmoitus = ref("") 

const maksimiKonePaikat = ref(4)
const uudenPaikanHinta = computed(() => maksimiKonePaikat.value * 500)

const avatutKentat = ref(["Pirkkala", "Pori", "Helsinki"])
const tyopajaAuki = ref(false) 
const kenttaKauppaAuki = ref(false) 
let koneIdCounter = 4 

const rakennettavatMallit: Piirustus[] = [
  { malliId: "piper", nimi: "Piper Cub (Keltasirkku)", nopeus: 130, paino: 350, kulutus: 16, matkustajaMaara: 1 },
  { malliId: "cessna150", nimi: "Cessna 150 (Kirppu)", nopeus: 150, paino: 500, kulutus: 22, matkustajaMaara: 1 },
  { malliId: "da40", nimi: "Diamond DA40 (Kaksikko)", nopeus: 220, paino: 800, kulutus: 30, matkustajaMaara: 2 },
  { malliId: "c172", nimi: "Cessna 172 (Taivaan Lada)", nopeus: 226, paino: 767, kulutus: 30, matkustajaMaara: 3 },
  { malliId: "baron", nimi: "Beechcraft Baron (Paroni)", nopeus: 370, paino: 2500, kulutus: 120, matkustajaMaara: 4 },
  { malliId: "pc12", nimi: "Pilatus PC-12 (Alppikotka)", nopeus: 520, paino: 4700, kulutus: 250, matkustajaMaara: 5 },
  { malliId: "twinotter", nimi: "de Havilland Twin Otter (Saaristotykki)", nopeus: 280, paino: 3360, kulutus: 180, matkustajaMaara: 12 },
  { malliId: "kingair", nimi: "Beechcraft King Air (Taivaan Herra)", nopeus: 540, paino: 5350, kulutus: 320, matkustajaMaara: 8 },
  { malliId: "caravan", nimi: "Cessna Caravan (Rahtikasa)", nopeus: 340, paino: 4000, kulutus: 210, matkustajaMaara: 9 }
]

const kaupanOsat = ref<Osa[]>([])
const omistetutOsat = ref<{ malliId: string, tyyppi: OsaTyyppi }[]>([])

const ostettavatKentat = ref<OstettavaKentta[]>([
  { nimi: "Turku", hinta: 1500 },
  { nimi: "Vaasa", hinta: 2800 },
  { nimi: "Kuopio", hinta: 3500 },
  { nimi: "Tallinna", hinta: 4200 },
  { nimi: "Oulu", hinta: 5500 },
  { nimi: "Tukholma", hinta: 7500 },
  { nimi: "Riika", hinta: 9000 },
  { nimi: "Oslo", hinta: 12000 }
])

const etaisyydet: Record<string, Record<string, number>> = {
  "Pirkkala": { "Helsinki": 150, "Pori": 100, "Turku": 150, "Vaasa": 230, "Kuopio": 310, "Tallinna": 230, "Oulu": 400, "Tukholma": 480, "Riika": 420, "Oslo": 750 },
  "Pori": { "Pirkkala": 100, "Helsinki": 220, "Turku": 120, "Vaasa": 190, "Kuopio": 380, "Tallinna": 300, "Oulu": 450, "Tukholma": 420, "Riika": 490, "Oslo": 710 },
  "Helsinki": { "Pirkkala": 150, "Pori": 220, "Turku": 160, "Vaasa": 350, "Kuopio": 330, "Tallinna": 85, "Oulu": 550, "Tukholma": 400, "Riika": 310, "Oslo": 780 },
  "Turku": { "Pirkkala": 150, "Pori": 120, "Helsinki": 160, "Vaasa": 280, "Kuopio": 390, "Tallinna": 190, "Oulu": 500, "Tukholma": 350, "Riika": 380, "Oslo": 700 },
  "Vaasa": { "Pirkkala": 230, "Pori": 190, "Helsinki": 350, "Turku": 280, "Kuopio": 290, "Tallinna": 430, "Oulu": 310, "Tukholma": 410, "Riika": 610, "Oslo": 630 },
  "Kuopio": { "Pirkkala": 310, "Pori": 380, "Helsinki": 330, "Turku": 390, "Vaasa": 290, "Tallinna": 390, "Oulu": 250, "Tukholma": 690, "Riika": 570, "Oslo": 960 },
  "Tallinna": { "Pirkkala": 230, "Pori": 300, "Helsinki": 85, "Turku": 190, "Vaasa": 430, "Kuopio": 390, "Oulu": 630, "Tukholma": 470, "Riika": 280, "Oslo": 860 },
  "Oulu": { "Pirkkala": 400, "Pori": 450, "Helsinki": 550, "Turku": 500, "Vaasa": 310, "Kuopio": 250, "Tallinna": 630, "Tukholma": 720, "Riika": 810, "Oslo": 920 },
  "Tukholma": { "Pirkkala": 480, "Pori": 420, "Helsinki": 400, "Turku": 350, "Vaasa": 410, "Kuopio": 690, "Tallinna": 470, "Oulu": 720, "Riika": 450, "Oslo": 400 },
  "Riika": { "Pirkkala": 420, "Pori": 490, "Helsinki": 310, "Turku": 380, "Vaasa": 610, "Kuopio": 570, "Tallinna": 280, "Oulu": 810, "Tukholma": 450, "Oslo": 890 },
  "Oslo": { "Pirkkala": 750, "Pori": 710, "Helsinki": 780, "Turku": 700, "Vaasa": 630, "Kuopio": 960, "Tallinna": 860, "Oulu": 920, "Tukholma": 400, "Riika": 890 }
}

const mahdollisetNimet = ["Matti", "Maija", "Pekka", "Liisa", "Jari", "Sari", "Teppo", "Sirpa", "Kalle", "Anna", "Jukka", "Tiina", "Simo", "Tarja", "Eero", "Sanna", "Mikko", "Minna", "Lauri", "Eeva"]
const matkustajatKentilla = ref<Record<string, Matkustaja[]>>({
  "Pirkkala": [], "Pori": [], "Helsinki": [], "Turku": [], "Vaasa": [], "Kuopio": [], "Tallinna": [], "Oulu": [], "Tukholma": [], "Riika": [], "Oslo": []
})

const aikaSeuraavaanPaivitykseen = ref(300)
let matkustajaIdCounter = 1

const tallennaPeli = () => {
  const pelitila = {
    rahat: rahat.value,
    kulta: kulta.value,
    maksimiKonePaikat: maksimiKonePaikat.value,
    avatutKentat: avatutKentat.value,
    ostettavatKentat: ostettavatKentat.value,
    lentokoneet: lentokoneet.value,
    omistetutOsat: omistetutOsat.value,
    matkustajatKentilla: matkustajatKentilla.value,
    kaupanOsat: kaupanOsat.value,
    aikaSeuraavaanPaivitykseen: aikaSeuraavaanPaivitykseen.value,
    koneIdCounter: koneIdCounter
  }
  localStorage.setItem("lentopeli_tallennus", JSON.stringify(pelitila))
  
  tallennusIlmoitus.value = "Peli tallennettu automaattisesti!"
  setTimeout(() => { tallennusIlmoitus.value = "" }, 3000)
}

const lataaPeli = () => {
  const tallenne = localStorage.getItem("lentopeli_tallennus")
  if (tallenne) {
    try {
      const data = JSON.parse(tallenne)
      rahat.value = data.rahat ?? 100
      kulta.value = data.kulta ?? 0
      maksimiKonePaikat.value = data.maksimiKonePaikat ?? 4
      avatutKentat.value = data.avatutKentat ?? ["Pirkkala", "Pori", "Helsinki"]
      ostettavatKentat.value = data.ostettavatKentat ?? ostettavatKentat.value
      lentokoneet.value = data.lentokoneet ?? lentokoneet.value
      omistetutOsat.value = data.omistetutOsat ?? []
      matkustajatKentilla.value = data.matkustajatKentilla ?? matkustajatKentilla.value
      kaupanOsat.value = data.kaupanOsat ?? []
      aikaSeuraavaanPaivitykseen.value = data.aikaSeuraavaanPaivitykseen ?? 300
      koneIdCounter = data.koneIdCounter ?? 4
    } catch (e) {
      console.error("Virhe tallennuksen latauksessa:", e)
    }
  }
}

const generoiKaupanOsat = () => {
  const maara = Math.floor(Math.random() * 4) + 2 
  const uudetOsat: Osa[] = []
  const tyypit: OsaTyyppi[] = ['moottori', 'runko', 'siivet']
  
  for(let i = 0; i < maara; i++) {
    const malli = rakennettavatMallit[Math.floor(Math.random() * rakennettavatMallit.length)]
    const tyyppi = tyypit[Math.floor(Math.random() * tyypit.length)]
    const hinta = Math.floor(Math.random() * 4) + 2 
    
    if (!uudetOsat.some(o => o.malliId === malli.malliId && o.tyyppi === tyyppi)) {
      uudetOsat.push({ malliId: malli.malliId, tyyppi, hinta })
    } else {
      i--
    }
  }
  kaupanOsat.value = uudetOsat
}

const generoiMatkustajat = () => {
  avatutKentat.value.forEach(kentta => {
    const maara = Math.floor(Math.random() * 8) + 1 
    const uudet = []
    const mahdollisetKohteet = avatutKentat.value.filter(k => k !== kentta)
    if (mahdollisetKohteet.length === 0) return;

    for (let i = 0; i < maara; i++) {
      const onKulta = Math.random() < 0.15
      const kultaMaara = onKulta ? 1 : 0

      uudet.push({
        id: `m_${matkustajaIdCounter++}`,
        nimi: mahdollisetNimet[Math.floor(Math.random() * mahdollisetNimet.length)],
        kohde: mahdollisetKohteet[Math.floor(Math.random() * mahdollisetKohteet.length)],
        tuottaaKultaa: onKulta,
        kultaMaara: kultaMaara
      })
    }
    const yhdistetty = [...(matkustajatKentilla.value[kentta] || []), ...uudet]
    matkustajatKentilla.value[kentta] = yhdistetty.slice(-15) 
  })
}

onMounted(() => {
  lataaPeli()

  if (Object.values(matkustajatKentilla.value).every(arr => arr.length === 0)) {
    generoiMatkustajat()
  }
  if (kaupanOsat.value.length === 0) {
    generoiKaupanOsat()
  }

  setInterval(() => {
    aikaSeuraavaanPaivitykseen.value--
    if (aikaSeuraavaanPaivitykseen.value <= 0) {
      generoiMatkustajat()
      generoiKaupanOsat() 
      aikaSeuraavaanPaivitykseen.value = 300
    }
  }, 1000)

  setInterval(() => {
    tallennaPeli()
  }, 30000)
})

const muotoileAika = (sekunnit: number) => {
  const min = Math.floor(sekunnit / 60)
  const sek = sekunnit % 60
  return `${min}:${sek < 10 ? '0' + sek : sek}`
}

const lentokoneet = ref<Lentokone[]>([
  { id: 1, nimi: "Piper Cub (Keltasirkku)", nopeus: 130, paino: 350, kulutus: 16, matkustajaMaara: 1, sijainti: "Pirkkala", matkustajatKyydissa: [], tila: "Maassa", reitti: [], kohde: null, lentoAikaJaljella: 0, onBonusLento: false },
  { id: 2, nimi: "Cessna 150 (Kirppu)", nopeus: 150, paino: 500, kulutus: 22, matkustajaMaara: 1, sijainti: "Pori", matkustajatKyydissa: [], tila: "Maassa", reitti: [], kohde: null, lentoAikaJaljella: 0, onBonusLento: false },
  { id: 3, nimi: "Diamond DA40 (Kaksikko)", nopeus: 220, paino: 800, kulutus: 30, matkustajaMaara: 2, sijainti: "Helsinki", matkustajatKyydissa: [], tila: "Maassa", reitti: [], kohde: null, lentoAikaJaljella: 0, onBonusLento: false }
])

const valittuKentta = ref<string | null>(null)
const valittuKoneId = ref<number | null>(null)
const suunniteltuReitti = ref<string[]>([]) 

const haeKoneetKentalla = (kenttaNimi: string) => lentokoneet.value.filter(k => k.sijainti === kenttaNimi && k.tila === "Maassa")

const lennollaOlevat = computed(() => {
  return lentokoneet.value
    .filter(k => k.tila === "Ilmassa")
    .sort((a, b) => a.lentoAikaJaljella - b.lentoAikaJaljella)
})

const aktiivinenKone = computed(() => lentokoneet.value.find(k => k.id === valittuKoneId.value))

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
    const etaisyys = etaisyydet[kentta]?.[kohde] || 9999
    return {
      kohde,
      etaisyys,
      jasenet: ryhmat[kohde]
    }
  })

  ryhmaTaulukko.sort((a, b) => a.etaisyys - b.etaisyys)

  return ryhmaTaulukko
})

const onkoOsaOmistuksessa = (malliId: string, tyyppi: OsaTyyppi) => omistetutOsat.value.some(o => o.malliId === malliId && o.tyyppi === tyyppi)

const ostaOsa = (osa: Osa, index: number) => {
  if (kulta.value >= osa.hinta && !onkoOsaOmistuksessa(osa.malliId, osa.tyyppi)) {
    kulta.value -= osa.hinta
    omistetutOsat.value.push({ malliId: osa.malliId, tyyppi: osa.tyyppi })
    kaupanOsat.value.splice(index, 1)
  }
}

const ostaKonePaikka = () => {
  if (rahat.value >= uudenPaikanHinta.value) {
    rahat.value -= uudenPaikanHinta.value
    maksimiKonePaikat.value++
  }
}

const onkoValmisRakennettavaksi = (malliId: string) => {
  const tarvittavat: OsaTyyppi[] = ['moottori', 'runko', 'siivet']
  return tarvittavat.every(t => onkoOsaOmistuksessa(malliId, t))
}

const rakennaKone = (piirustus: Piirustus) => {
  if (lentokoneet.value.length >= maksimiKonePaikat.value) return; 
  
  if (onkoValmisRakennettavaksi(piirustus.malliId)) {
    omistetutOsat.value = omistetutOsat.value.filter(o => o.malliId !== piirustus.malliId)
    lentokoneet.value.push({
      id: koneIdCounter++,
      nimi: piirustus.nimi,
      nopeus: piirustus.nopeus,
      paino: piirustus.paino,
      kulutus: piirustus.kulutus,
      matkustajaMaara: piirustus.matkustajaMaara,
      sijainti: avatutKentat.value[0],
      matkustajatKyydissa: [],
      tila: "Maassa",
      reitti: [],
      kohde: null,
      lentoAikaJaljella: 0,
      onBonusLento: false
    })
  }
}

const mallinNimi = (malliId: string) => rakennettavatMallit.find(m => m.malliId === malliId)?.nimi || malliId

const naytaKultaIlmoitus = (maara: number) => {
  kultaIlmoitus.value = `+${maara} KULTAA SAATU!`
  setTimeout(() => { kultaIlmoitus.value = "" }, 4000)
}

const laskeReitinTiedot = (kone: Lentokone, lahtoKentta: string, reitti: string[]) => {
  if (reitti.length === 0) return { matka: 0, aikaSekunteina: 0, tulot: 0, kulut: 0, voitto: 0, isBonus: false, arvioKulta: 0 }
  let kokoMatka = 0
  let nykyinen = lahtoKentta
  for (const etappi of reitti) {
    kokoMatka += etaisyydet[nykyinen]?.[etappi] || 150
    nykyinen = etappi
  }
  const lentoAikaTunteina = kokoMatka / kone.nopeus 
  const aikaSekunteina = Math.max(5, Math.round(lentoAikaTunteina * 80)) 
  const kulut = Math.round((kone.kulutus * lentoAikaTunteina) * 2.0)
  
  let isBonus = false
  if (kone.matkustajaMaara > 1 && kone.matkustajatKyydissa.length === kone.matkustajaMaara) {
    const ekaKohde = kone.matkustajatKyydissa[0].kohde
    if (kone.matkustajatKyydissa.every(m => m.kohde === ekaKohde) && reitti.includes(ekaKohde)) {
      isBonus = true
    }
  }

  let tulot = 0
  let kultaArvio = 0

  for (const m of kone.matkustajatKyydissa) {
    if (reitti.includes(m.kohde)) {
      // PUDOTETTU TIENAUS-TAHTI: Kerroin alennettu 0.35 (aiemmin 0.55)
      tulot += (etaisyydet[lahtoKentta]?.[m.kohde] || 150) * 0.35
      if (m.tuottaaKultaa) {
        kultaArvio += (m.kultaMaara || 1)
      }
    }
  }

  if (isBonus) {
    tulot *= 1.25
    kultaArvio *= 1.25 
  }

  const lopullisetTulot = Math.ceil(tulot)
  const lopullinenKulta = Math.ceil(kultaArvio)
  const voitto = lopullisetTulot - kulut

  return { matka: kokoMatka, aikaSekunteina, tulot: lopullisetTulot, kulut, voitto, isBonus, arvioKulta: lopullinenKulta }
}

const reittiTiedot = computed(() => {
  if (!aktiivinenKone.value || !valittuKentta.value) return null
  return laskeReitinTiedot(aktiivinenKone.value, valittuKentta.value, suunniteltuReitti.value)
})

const ostaKentta = (kentta: OstettavaKentta, index: number) => {
  if (rahat.value >= kentta.hinta) {
    rahat.value -= kentta.hinta
    avatutKentat.value.push(kentta.nimi)
    ostettavatKentat.value.splice(index, 1)
    
    if (!matkustajatKentilla.value[kentta.nimi]) {
      matkustajatKentilla.value[kentta.nimi] = []
    }

    const uudet = []
    const mahdollisetKohteet = avatutKentat.value.filter(k => k !== kentta.nimi)
    for (let i = 0; i < 5; i++) {
      const onKulta = Math.random() < 0.15
      uudet.push({
        id: `m_${matkustajaIdCounter++}`,
        nimi: mahdollisetNimet[Math.floor(Math.random() * mahdollisetNimet.length)],
        kohde: mahdollisetKohteet[Math.floor(Math.random() * mahdollisetKohteet.length)],
        tuottaaKultaa: onKulta,
        kultaMaara: onKulta ? 1 : 0
      })
    }
    matkustajatKentilla.value[kentta.nimi] = uudet
  }
}

const valitseKentta = (kentta: string) => { if (haeKoneetKentalla(kentta).length > 0) valittuKentta.value = kentta }
const valitseKone = (id: number) => { valittuKoneId.value = id; suunniteltuReitti.value = [] }
const lisaaReitille = (kentta: string) => suunniteltuReitti.value.push(kentta)
const tyhjennaReitti = () => suunniteltuReitti.value = []

const lisaaMatkustaja = (matkustaja: Matkustaja, alkuperainenIndeksi: number) => {
  if (aktiivinenKone.value && valittuKentta.value && aktiivinenKone.value.matkustajatKyydissa.length < aktiivinenKone.value.matkustajaMaara) {
    matkustaja.lahtoKentta = valittuKentta.value
    aktiivinenKone.value.matkustajatKyydissa.push(matkustaja)
    matkustajatKentilla.value[valittuKentta.value].splice(alkuperainenIndeksi, 1)
  }
}

const poistaMatkustaja = (matkustaja: Matkustaja, index: number) => {
  if (aktiivinenKone.value && valittuKentta.value) {
    aktiivinenKone.value.matkustajatKyydissa.splice(index, 1)
    matkustajatKentilla.value[valittuKentta.value].push(matkustaja)
  }
}

const aloitaLentoAjastin = (kone: Lentokone) => {
  const lennonAjastin = setInterval(() => {
    kone.lentoAikaJaljella--
    if (kone.lentoAikaJaljella <= 0) {
      const saavuttuKentta = kone.kohde!
      const jaavatKyytiin: Matkustaja[] = []
      let lennonKulta = 0

      for (const m of kone.matkustajatKyydissa) {
        if (m.kohde === saavuttuKentta) {
          let tulo = (etaisyydet[m.lahtoKentta!]?.[m.kohde] || 150) * 0.35
          if (kone.onBonusLento) tulo *= 1.25 
          rahat.value += Math.ceil(tulo)

          if (m.tuottaaKultaa) {
            let saatuKulta = (m.kultaMaara || 1)
            if (kone.onBonusLento) saatuKulta *= 1.25
            lennonKulta += Math.ceil(saatuKulta)
          }
        } else {
          jaavatKyytiin.push(m)
        }
      }
      kone.matkustajatKyydissa = jaavatKyytiin
      
      if (lennonKulta > 0) {
        kulta.value += lennonKulta
        naytaKultaIlmoitus(lennonKulta)
      }

      kone.reitti.shift()

      if (kone.reitti.length > 0) {
        kone.kohde = kone.reitti[0]
        const matka = etaisyydet[saavuttuKentta]?.[kone.kohde] || 150
        const uusiAikaTunteina = matka / kone.nopeus
        kone.lentoAikaJaljella = Math.max(5, Math.round(uusiAikaTunteina * 80))
      } else {
        clearInterval(lennonAjastin)
        kone.tila = "Maassa"
        kone.sijainti = saavuttuKentta
        kone.kohde = null
        kone.onBonusLento = false
      }
    }
  }, 1000)
}

const lahetaKone = () => {
  if (aktiivinenKone.value && valittuKentta.value && reittiTiedot.value) {
    const kone = aktiivinenKone.value
    const tiedot = reittiTiedot.value
    if (rahat.value < tiedot.kulut) return; 

    rahat.value -= tiedot.kulut
    kone.reitti = [...suunniteltuReitti.value]
    kone.kohde = kone.reitti[0]
    kone.tila = "Ilmassa"
    kone.sijainti = "Ilmassa"
    kone.onBonusLento = tiedot.isBonus
    
    const ekaMatka = etaisyydet[valittuKentta.value]?.[kone.kohde] || 150
    const ekaAika = ekaMatka / kone.nopeus
    kone.lentoAikaJaljella = Math.max(5, Math.round(ekaAika * 80))
    
    valittuKoneId.value = null
    valittuKentta.value = null
    suunniteltuReitti.value = []
    aloitaLentoAjastin(kone)
  }
}

const meneTaaksepain = () => {
  if (tyopajaAuki.value) tyopajaAuki.value = false
  else if (kenttaKauppaAuki.value) kenttaKauppaAuki.value = false
  else if (valittuKoneId.value !== null) { valittuKoneId.value = null; suunniteltuReitti.value = [] }
  else if (valittuKentta.value !== null) valittuKentta.value = null
}
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
        Hangaari: <strong>{{ lentokoneet.length }} / {{ maksimiKonePaikat }}</strong> | 
        Seuraava päivitys: <strong>{{ muotoileAika(aikaSeuraavaanPaivitykseen) }}</strong>
      </div>
    </div>

    <div class="valikko-container">
      
      <!-- PÄÄVALIKKO -->
      <div v-if="!valittuKentta && !tyopajaAuki && !kenttaKauppaAuki" class="nakyma">
        <button class="tyopaja-nappi" @click="tyopajaAuki = true">
          🔧 Siirry Lentokonetehtaalle & Osakauppaan
        </button>

        <button class="tyopaja-nappi kentta-nappi" @click="kenttaKauppaAuki = true">
          🌐 Siirry Lentokenttäkauppaan
        </button>

        <h1>Omat lentokentät</h1>
        <ul class="lista">
          <li 
            v-for="kentta in avatutKentat" 
            :key="kentta"
            @click="valitseKentta(kentta)"
            :class="{ 'disabled': haeKoneetKentalla(kentta).length === 0 }"
          >
            <div class="lista-otsikko">{{ kentta }}</div>
            <div class="lista-info">
              ✈️ {{ haeKoneetKentalla(kentta).length }} konetta | 
              🧍 {{ matkustajatKentilla[kentta]?.length || 0 }} matkustajaa odottaa
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

      <!-- LENTOKENTTÄKAUPPA (OMA VALIKKO) -->
      <div v-else-if="kenttaKauppaAuki" class="nakyma">
        <h1>🌐 Lentokenttäkauppa</h1>
        
        <div v-if="ostettavatKentat.length > 0" class="kauppa-osio" style="margin-top: 0;">
          <h2>🔒 Osta uusia lentokenttiä</h2>
          <ul class="lista">
            <li 
              v-for="(kentta, index) in ostettavatKentat" 
              :key="kentta.nimi"
              @click="ostaKentta(kentta, index)"
              :class="{ 'liian-kallis': rahat < kentta.hinta }"
              class="kauppa-rivi"
            >
              <div class="lista-otsikko">Avaa {{ kentta.nimi }}</div>
              <div class="lista-info hinta-teksti">Hinta: {{ kentta.hinta }} €</div>
            </li>
          </ul>
        </div>
        <div v-else class="tyhja-lista" style="text-align: center; margin-top: 30px;">
          Kaikki lentokentät on jo avattu! 🏆
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
          <li v-for="piirustus in rakennettavatMallit" :key="piirustus.malliId" class="piirustus-rivi">
            <div class="lista-otsikko">✈️ {{ piirustus.nimi }}</div>
            <div class="lista-info">Nopeus: {{ piirustus.nopeus }} km/h | Tilaa: {{ piirustus.matkustajaMaara }} hlö</div>
            
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
              Hangaari on täynnä! Osta lisää tilaa.
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
        <h1>{{ aktiivinenKone.nimi }}</h1>
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
        
        <p v-else class="ohjeteksti">Klikkaa alta kenttiä lisätäksesi ne reitille:</p>

        <ul class="lista lahetys-lista">
          <li 
            v-for="kentta in avatutKentat" 
            :key="kentta"
            v-show="kentta !== (suunniteltuReitti.length > 0 ? suunniteltuReitti[suunniteltuReitti.length-1] : valittuKentta)"
            @click="lisaaReitille(kentta)"
          >
            <div class="lista-otsikko">+ Lisää etappi: {{ kentta }}</div>
          </li>
        </ul>
      </div>

    </div>

    <!-- TAKAISIN-NAPPI -->
    <button v-if="valittuKentta || tyopajaAuki || kenttaKauppaAuki" class="takaisin-nappi" @click="meneTaaksepain">✕</button>
  </div>
</template>

<style scoped>
.peli-alusta { user-select: none; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; }
.dark-theme { background-color: #121212; color: #e0e0e0; min-height: 100vh; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; box-sizing: border-box; }

.top-bar { background: #1e1e1e; padding: 15px 20px; border-radius: 8px; margin-bottom: 20px; max-width: 600px; margin: 0 auto 20px auto; border: 1px solid #333; text-align: center; position: relative; }
.kassa-rivi { display: flex; justify-content: center; gap: 30px; }
.top-bar h2 { margin: 0; color: #4caf50; font-size: 1.5rem; }
.kulta-teksti { color: #ffd54f !important; font-weight: bold; }
.ajastin { margin-top: 8px; color: #bbb; font-size: 0.9rem; }
.miinus { color: #f44336 !important; }

.kulta-tag { background: #3d3512; color: #ffd54f; padding: 2px 6px; border-radius: 4px; font-size: 0.8rem; margin-left: 8px; border: 1px solid #ffd54f; }

.kulta-pop { position: absolute; top: -15px; right: 20px; background: #ffd54f; color: #000; padding: 5px 10px; border-radius: 20px; font-weight: bold; animation: pop 0.4s ease-out; }
.tallennus-pop { position: absolute; top: -15px; left: 20px; background: #4caf50; color: #fff; padding: 5px 10px; border-radius: 20px; font-size: 0.85rem; font-weight: bold; animation: pop 0.4s ease-out; }

@keyframes pop { 0% { transform: scale(0.5); opacity: 0; } 50% { transform: scale(1.2); } 100% { transform: scale(1); opacity: 1; } }

h1 { font-size: 1.8rem; color: #ffffff; border-bottom: 1px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
h2 { font-size: 1.2rem; color: #aaaaaa; margin-top: 30px; margin-bottom: 10px; }

.valikko-container { max-width: 600px; margin: 0 auto; padding-bottom: 100px; }

.tyopaja-nappi { width: 100%; padding: 15px; margin-bottom: 15px; font-size: 1.1rem; font-weight: bold; background-color: #f39c12; color: #000; border: none; border-radius: 8px; cursor: pointer; transition: transform 0.2s; box-shadow: 0 4px 6px rgba(243, 156, 18, 0.3); }
.tyopaja-nappi:hover { transform: scale(1.02); background-color: #f1c40f; }

.kentta-nappi { background-color: #2980b9; color: #fff; box-shadow: 0 4px 6px rgba(41, 128, 185, 0.3); margin-bottom: 25px; }
.kentta-nappi:hover { background-color: #3498db; }

.lista { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
.lista li { background-color: #1e1e1e; border: 1px solid #2a2a2a; border-radius: 8px; padding: 14px; cursor: pointer; transition: all 0.2s; }
.lista li:hover:not(.disabled):not(.liian-kallis):not(.tyhja-lista) { background-color: #2c2c2c; border-color: #444; transform: translateX(5px); }

.lista-otsikko { font-size: 1.2rem; font-weight: bold; color: #fff; margin-bottom: 5px; }
.lista-info { font-size: 0.9rem; color: #888; line-height: 1.4; }

.disabled { opacity: 0.5; cursor: not-allowed !important; }
.tyhja-lista { color: #555; background: transparent !important; border: none !important; cursor: default !important; padding: 5px 0; }
.tila-teksti { background: #1a2733; color: #64b5f6; padding: 10px 15px; border-radius: 6px; font-weight: bold; }

.matkustaja-ryhma { margin-bottom: 15px; background: #181818; padding: 10px; border-radius: 8px; border: 1px solid #2a2a2a; }
.ryhma-otsikko { font-size: 1rem; font-weight: bold; color: #64b5f6; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; }
.etaisyys-badge { font-size: 0.85rem; color: #888; font-weight: normal; }

.hangaari-paneeli { text-align: center; border-color: #4caf50 !important; margin-bottom: 30px; }
.osta-paikka-nappi { background: #4caf50; color: white; border: none; padding: 10px 20px; font-weight: bold; border-radius: 5px; cursor: pointer; margin-top: 10px; transition: 0.2s; }
.osta-paikka-nappi:hover:not(:disabled) { background: #45a049; transform: scale(1.05); }
.osta-paikka-nappi:disabled { background: #555; cursor: not-allowed; }

.osa-nimi { color: #f39c12; }
.piirustus-rivi { background: #1a1a2e !important; border-left: 5px solid #64b5f6 !important; }
.osat-kokoelma { margin-top: 15px; display: flex; gap: 10px; }
.osat-kokoelma span { padding: 5px 10px; border-radius: 4px; font-size: 0.85rem; font-weight: bold; }
.omistaa { background: #2e7d32; color: #fff; }
.puuttuu { background: #424242; color: #757575; border: 1px dashed #666; }
.rakenna-nappi { margin-top: 15px; width: 100%; padding: 10px; background: #64b5f6; color: #000; font-weight: bold; border: none; border-radius: 6px; cursor: pointer; }
.rakenna-nappi:hover { background: #42a5f5; transform: scale(1.02); }

.matkustaja-lista { max-height: 250px; overflow-y: auto; }
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

.takaisin-nappi { position: fixed; bottom: 30px; right: 30px; width: 70px; height: 70px; border-radius: 50%; background-color: #d32f2f; color: white; border: none; font-size: 32px; font-weight: bold; cursor: pointer; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5); z-index: 1000; }
.takaisin-nappi:hover { background-color: #b71c1c; transform: scale(1.1); }
</style>