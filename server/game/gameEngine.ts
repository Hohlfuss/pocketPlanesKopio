import type {
  GameState,
  Lentokone,
  Matkustaja,
  Osa,
  OsaTyyppi,
  KenttaData,
  Piirustus,
  EtsintaRuutu,
  Pilotti,
  PilottiHarvinaisuus
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
  laskeReitinTiedot,
  laskeOsanHinta,
  tarvittavaXpTasonNostoon,
  laskeTasoPalkinto,
  OLETUS_PILOTTI,
  haeKoneenPilotti,
  laskeKoneenMastery
} from './gameData'

interface PilottiMalli {
  nimi: string
  titteli: string
  kuvaus: string
  avatar: string
  harvinaisuus: PilottiHarvinaisuus
  hinta: number
  valuutta: 'raha' | 'kulta'
  nopeusBonus: number
  kulutusAlennus: number
  tuloBonus: number
  kultaBonus: number
  xpBonus: number
  paivitysHinta: number
  paivitysValuutta: 'raha' | 'kulta'
}

export const PILOTTI_POHJAT: PilottiMalli[] = [
  // TAVALLISET (Common)
  {
    nimi: 'Seppo Siipi',
    titteli: 'Rauhallinen Reittilentäjä',
    kuvaus: 'Perusvarma lentäjä. Pysyy tasaisessa kurssissa ja noudattaa ohjeita kirjaimellisesti.',
    avatar: '🧑‍✈️',
    harvinaisuus: 'tavallinen',
    hinta: 450,
    valuutta: 'raha',
    nopeusBonus: 4,
    kulutusAlennus: 4,
    tuloBonus: 3,
    kultaBonus: 0,
    xpBonus: 5,
    paivitysHinta: 300,
    paivitysValuutta: 'raha'
  },
  {
    nimi: 'Maija Mittari',
    titteli: 'Tarkka Teknillinen',
    kuvaus: 'Tarkistaa kaikki polttoaineventtiilit kahdesti. Säästää jokaisen bensiinilitran.',
    avatar: '👩‍✈️',
    harvinaisuus: 'tavallinen',
    hinta: 600,
    valuutta: 'raha',
    nopeusBonus: 2,
    kulutusAlennus: 9,
    tuloBonus: 2,
    kultaBonus: 0,
    xpBonus: 6,
    paivitysHinta: 350,
    paivitysValuutta: 'raha'
  },
  {
    nimi: 'Jarkko Jarruton',
    titteli: 'Vauhtiveikko',
    kuvaus: 'Työntää tehovipua eteenpäin aina kun silmä välttää. Lentää ripeästi perille.',
    avatar: '👨‍✈️',
    harvinaisuus: 'tavallinen',
    hinta: 550,
    valuutta: 'raha',
    nopeusBonus: 8,
    kulutusAlennus: 0,
    tuloBonus: 2,
    kultaBonus: 0,
    xpBonus: 8,
    paivitysHinta: 350,
    paivitysValuutta: 'raha'
  },
  {
    nimi: 'Liisa Lempeä',
    titteli: 'Asiakaspalveluässä',
    kuvaus: 'Toivottaa matkustajat tervetulleeksi hymyssä suin ja tarjoaa kahvia. Matkustajat maksavat mielellään.',
    avatar: '👩‍✈️',
    harvinaisuus: 'tavallinen',
    hinta: 650,
    valuutta: 'raha',
    nopeusBonus: 2,
    kulutusAlennus: 3,
    tuloBonus: 8,
    kultaBonus: 0,
    xpBonus: 7,
    paivitysHinta: 400,
    paivitysValuutta: 'raha'
  },
  {
    nimi: 'Antti Aamuvirkku',
    titteli: 'Lentoperämies',
    kuvaus: 'Herää aina kello 4 aamulla. Valmistelee nousun ajoissa ja säästää kallista lentoaikaa.',
    avatar: '🧑‍✈️',
    harvinaisuus: 'tavallinen',
    hinta: 500,
    valuutta: 'raha',
    nopeusBonus: 5,
    kulutusAlennus: 5,
    tuloBonus: 4,
    kultaBonus: 0,
    xpBonus: 6,
    paivitysHinta: 320,
    paivitysValuutta: 'raha'
  },

  // HARVINAISET (Rare)
  {
    nimi: 'Kari Kiituri',
    titteli: 'Taitolentomestari',
    kuvaus: 'Entinen taitolentäjä. Oikaisee mutkat ja löytää nopeimmat ilmavirtaukset.',
    avatar: '⚡',
    harvinaisuus: 'harvinainen',
    hinta: 1800,
    valuutta: 'raha',
    nopeusBonus: 14,
    kulutusAlennus: 6,
    tuloBonus: 8,
    kultaBonus: 5,
    xpBonus: 12,
    paivitysHinta: 900,
    paivitysValuutta: 'raha'
  },
  {
    nimi: 'Laura Lentotähti',
    titteli: 'VIP-Kapteeni',
    kuvaus: 'Karismaattinen lentokapteeni. Matkustajat kilpailevat paikoista hänen lennoilleen.',
    avatar: '🌟',
    harvinaisuus: 'harvinainen',
    hinta: 2400,
    valuutta: 'raha',
    nopeusBonus: 8,
    kulutusAlennus: 8,
    tuloBonus: 18,
    kultaBonus: 8,
    xpBonus: 15,
    paivitysHinta: 1100,
    paivitysValuutta: 'raha'
  },
  {
    nimi: 'Topi Turbiini',
    titteli: 'Polttoaineguru',
    kuvaus: 'Laskee siipien optimaalisen nosteen silmämääräisesti. Polttoainelasku puolittuu.',
    avatar: '⛽',
    harvinaisuus: 'harvinainen',
    hinta: 2100,
    valuutta: 'raha',
    nopeusBonus: 8,
    kulutusAlennus: 16,
    tuloBonus: 6,
    kultaBonus: 5,
    xpBonus: 10,
    paivitysHinta: 950,
    paivitysValuutta: 'raha'
  },
  {
    nimi: 'Veera Vakaa',
    titteli: 'Myrskynkesyttäjä',
    kuvaus: 'Kylmähermoinen ammattilainen. Lentää turbulenssin halki kuin pehmeällä tyynyllä.',
    avatar: '🧭',
    harvinaisuus: 'harvinainen',
    hinta: 5,
    valuutta: 'kulta',
    nopeusBonus: 12,
    kulutusAlennus: 12,
    tuloBonus: 10,
    kultaBonus: 10,
    xpBonus: 16,
    paivitysHinta: 2,
    paivitysValuutta: 'kulta'
  },

  // EEPPISET (Epic)
  {
    nimi: 'Kapteeni Myrskynsilmä',
    titteli: 'Ukkosen Valtias',
    kuvaus: 'Ei kierrä säärintamia. Syö salamoita aamiaiseksi ja saapuu aina etuajassa.',
    avatar: '⛈️',
    harvinaisuus: 'eeppinen',
    hinta: 16,
    valuutta: 'kulta',
    nopeusBonus: 22,
    kulutusAlennus: 15,
    tuloBonus: 15,
    kultaBonus: 15,
    xpBonus: 25,
    paivitysHinta: 5,
    paivitysValuutta: 'kulta'
  },
  {
    nimi: 'Aura Ässä',
    titteli: 'Hävittäjälegenda',
    kuvaus: 'Yli 10 000 lentotuntia. Ohjaa matkustajakonetta kuin suihkuhävittäjää.',
    avatar: '🎖️',
    harvinaisuus: 'eeppinen',
    hinta: 18,
    valuutta: 'kulta',
    nopeusBonus: 26,
    kulutusAlennus: 12,
    tuloBonus: 20,
    kultaBonus: 12,
    xpBonus: 28,
    paivitysHinta: 6,
    paivitysValuutta: 'kulta'
  },
  {
    nimi: 'Kustaa Kultasiipi',
    titteli: 'Kultakeisari',
    kuvaus: 'Löytää rikkaimmat lentoreitit ja neuvottelee kultamatkustajilta muhkeat lisämaksut.',
    avatar: '🟡',
    harvinaisuus: 'eeppinen',
    hinta: 20,
    valuutta: 'kulta',
    nopeusBonus: 14,
    kulutusAlennus: 14,
    tuloBonus: 28,
    kultaBonus: 30,
    xpBonus: 20,
    paivitysHinta: 7,
    paivitysValuutta: 'kulta'
  },
  {
    nimi: 'Elena Eko',
    titteli: 'Ilmavirtojen Mestari',
    kuvaus: 'Hyödyntää suihkuvirtauksia ja liitää pitkiä matkoja ilman moottorin rasitusta.',
    avatar: '🌿',
    harvinaisuus: 'eeppinen',
    hinta: 17,
    valuutta: 'kulta',
    nopeusBonus: 18,
    kulutusAlennus: 25,
    tuloBonus: 16,
    kultaBonus: 15,
    xpBonus: 22,
    paivitysHinta: 5,
    paivitysValuutta: 'kulta'
  },

  // LEGENDAARISET (Legendary)
  {
    nimi: 'Maverick Muukalainen',
    titteli: 'Taivaiden Ykkösässä',
    kuvaus: 'Painovoima ja fysiikan lait ovat hänelle vain suosituksia. Huippunopeus ja huikeat tulot.',
    avatar: '🕶️',
    harvinaisuus: 'legendaarinen',
    hinta: 40,
    valuutta: 'kulta',
    nopeusBonus: 36,
    kulutusAlennus: 24,
    tuloBonus: 32,
    kultaBonus: 25,
    xpBonus: 40,
    paivitysHinta: 10,
    paivitysValuutta: 'kulta'
  },
  {
    nimi: 'Kyber-Koneistaja 9000',
    titteli: 'Kvanttitekoäly',
    kuvaus: 'Algoritminen huippulentäjä. Optimoi lentoradan atomintarkasti reaaliajassa.',
    avatar: '🤖',
    harvinaisuus: 'legendaarinen',
    hinta: 45,
    valuutta: 'kulta',
    nopeusBonus: 40,
    kulutusAlennus: 32,
    tuloBonus: 26,
    kultaBonus: 20,
    xpBonus: 45,
    paivitysHinta: 12,
    paivitysValuutta: 'kulta'
  },
  {
    nimi: 'Paroni von Richthofen',
    titteli: 'Ilmojen Keisari',
    kuvaus: 'Historian maineikkain lentäjä. Pelkkä hänen nimensä täyttää matkustamolauteet ääriään myöten.',
    avatar: '👑',
    harvinaisuus: 'legendaarinen',
    hinta: 50,
    valuutta: 'kulta',
    nopeusBonus: 32,
    kulutusAlennus: 25,
    tuloBonus: 42,
    kultaBonus: 35,
    xpBonus: 50,
    paivitysHinta: 14,
    paivitysValuutta: 'kulta'
  }
]

export function generoiKaupanPilotit(count = 3, pelaajanTaso = 1): Pilotti[] {
  const maara = Math.max(2, Math.min(5, count))
  const uudetPilotit: Pilotti[] = []
  const arvotutNimet = new Set<string>()
  let safety = 0

  while (uudetPilotit.length < maara && safety++ < 60) {
    // Harvinaisuuksien todennäköisyydet tason mukaan
    const roll = Math.random() * 100
    let haluttuHarvinaisuus: PilottiHarvinaisuus = 'tavallinen'
    
    const legendaryChance = Math.min(10, 2 + pelaajanTaso * 0.5)
    const epicChance = Math.min(22, 6 + pelaajanTaso * 1.0)
    const rareChance = Math.min(38, 22 + pelaajanTaso * 1.2)

    if (roll < legendaryChance && pelaajanTaso >= 3) {
      haluttuHarvinaisuus = 'legendaarinen'
    } else if (roll < legendaryChance + epicChance && pelaajanTaso >= 2) {
      haluttuHarvinaisuus = 'eeppinen'
    } else if (roll < legendaryChance + epicChance + rareChance) {
      haluttuHarvinaisuus = 'harvinainen'
    } else {
      haluttuHarvinaisuus = 'tavallinen'
    }

    const sopivatPohjat = PILOTTI_POHJAT.filter(p => p.harvinaisuus === haluttuHarvinaisuus && !arvotutNimet.has(p.nimi))
    const valittuPohja = sopivatPohjat.length > 0 
      ? sopivatPohjat[Math.floor(Math.random() * sopivatPohjat.length)]
      : PILOTTI_POHJAT.filter(p => !arvotutNimet.has(p.nimi))[0] || PILOTTI_POHJAT[Math.floor(Math.random() * PILOTTI_POHJAT.length)]

    arvotutNimet.add(valittuPohja.nimi)
    uudetPilotit.push({
      id: `pilot_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      nimi: valittuPohja.nimi,
      titteli: valittuPohja.titteli,
      kuvaus: valittuPohja.kuvaus,
      avatar: valittuPohja.avatar,
      harvinaisuus: valittuPohja.harvinaisuus,
      taso: 1,
      maxTaso: 5,
      hinta: valittuPohja.hinta,
      valuutta: valittuPohja.valuutta,
      statit: {
        nopeusBonus: valittuPohja.nopeusBonus,
        kulutusAlennus: valittuPohja.kulutusAlennus,
        tuloBonus: valittuPohja.tuloBonus,
        kultaBonus: valittuPohja.kultaBonus,
        xpBonus: valittuPohja.xpBonus
      },
      koneId: null,
      paivitysHinta: valittuPohja.paivitysHinta,
      paivitysValuutta: valittuPohja.paivitysValuutta
    })
  }

  return uudetPilotit
}

export function generoiKaupanOsat(count = 4, pelaajanTaso = 1): Osa[] {
  const maara = Math.max(2, Math.min(6, count))
  const uudetOsat: Osa[] = []
  const tyypit: OsaTyyppi[] = ['moottori', 'runko', 'siivet']
  let safety = 0

  // Sallitaan vain koneet, joiden tasovaatimus on täyttynyt (ensimmäiset 5 konetta ovat aina auki)
  const sallitutMallit = rakennettavatMallit.filter(m => (m.vaadittuTaso || 1) <= Math.max(1, pelaajanTaso))
  const malliLista = sallitutMallit.length > 0 ? sallitutMallit : rakennettavatMallit.slice(0, 5)

  while (uudetOsat.length < maara && safety++ < 50) {
    const malli = malliLista[Math.floor(Math.random() * malliLista.length)]
    const tyyppi = tyypit[Math.floor(Math.random() * tyypit.length)]
    const hinta = laskeOsanHinta(malli.malliId)

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

export function generoiEtsintaRuudut(pelaajanTaso = 1): EtsintaRuutu[] {
  const tyhjatNimet = [
    { nimi: "Ruosteinen naula", ikoni: "🪛" },
    { nimi: "Vanha pullonkorkki", ikoni: "🍾" },
    { nimi: "Pellon kivi", ikoni: "🪨" },
    { nimi: "Tölkin repäisyklipsi", ikoni: "🥫" },
    { nimi: "Hevosenkenkä", ikoni: "🧲" },
    { nimi: "Maakaapelin pätkä", ikoni: "🔌" },
    { nimi: "Vanha tinalusikka", ikoni: "🥄" },
    { nimi: "Tyhjä sorakuoppa", ikoni: "🕳️" }
  ]

  const rahaVaihtoehdot = [
    { nimi: "Kourallinen kolikoita", ikoni: "💰", min: 60, max: 120 },
    { nimi: "Kadonnut lompakko", ikoni: "👛", min: 130, max: 200 },
    { nimi: "Kätketty setelitukku", ikoni: "💵", min: 200, max: 300 },
    { nimi: "Vanha säästölipas", ikoni: "🪙", min: 250, max: 380 },
    { nimi: "Peltipurkki käteistä", ikoni: "📦", min: 150, max: 280 }
  ]

  const kultaVaihtoehdot = [
    { nimi: "Kultahippu", ikoni: "🟡", maara: 1 },
    { nimi: "Vanha kultakolikko", ikoni: "🪙", maara: 2 },
    { nimi: "Kultasormus", ikoni: "💍", maara: 2 }
  ]

  const ruudut: Omit<EtsintaRuutu, 'id'>[] = []

  // 1. 8 tyhjää ruutua (~50%)
  for (let i = 0; i < 8; i++) {
    const t = tyhjatNimet[i % tyhjatNimet.length]
    ruudut.push({
      avattu: false,
      tyyppi: 'tyhja',
      nimi: t.nimi,
      ikoni: t.ikoni,
      arvoTeksti: 'Tyhjä'
    })
  }

  // 2. 5 raharuutua (~30-35%)
  for (let i = 0; i < 5; i++) {
    const r = rahaVaihtoehdot[i % rahaVaihtoehdot.length]
    const summa = Math.floor(Math.random() * (r.max - r.min + 1)) + r.min
    ruudut.push({
      avattu: false,
      tyyppi: 'raha',
      nimi: r.nimi,
      ikoni: r.ikoni,
      rahaMaara: summa,
      arvoTeksti: `+${summa} €`
    })
  }

  // 3. 2 kultaruutua (~10%)
  for (let i = 0; i < 2; i++) {
    const k = kultaVaihtoehdot[i % kultaVaihtoehdot.length]
    ruudut.push({
      avattu: false,
      tyyppi: 'kulta',
      nimi: k.nimi,
      ikoni: k.ikoni,
      kultaMaara: k.maara,
      arvoTeksti: `+${k.maara} kultaa`
    })
  }

  // 4. 1 lentokoneen osa (~5%)
  const sallitutMallit = rakennettavatMallit.filter(m => (m.vaadittuTaso || 1) <= Math.max(1, pelaajanTaso))
  const malliLista = sallitutMallit.length > 0 ? sallitutMallit : rakennettavatMallit.slice(0, 5)
  const malli = malliLista[Math.floor(Math.random() * malliLista.length)]
  const tyypit: OsaTyyppi[] = ['moottori', 'runko', 'siivet']
  const osaTyyppi = tyypit[Math.floor(Math.random() * tyypit.length)]

  ruudut.push({
    avattu: false,
    tyyppi: 'osa',
    nimi: `${malli.nimi} - ${osaTyyppi}`,
    ikoni: '✈️',
    arvoTeksti: `${osaTyyppi.toUpperCase()}`,
    osa: {
      malliId: malli.malliId,
      tyyppi: osaTyyppi
    }
  })

  // Sekoitetaan 16 ruutua satunnaiseen järjestykseen
  for (let i = ruudut.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = ruudut[i]
    ruudut[i] = ruudut[j]
    ruudut[j] = temp
  }

  return ruudut.map((r, idx) => ({ ...r, id: idx }))
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
      tilavuusTaso: 0,
      masteryXp: 0,
      masteryStars: 0,
      isGolden: false
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
      tilavuusTaso: 0,
      masteryXp: 0,
      masteryStars: 0,
      isGolden: false
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
      tilavuusTaso: 0,
      masteryXp: 0,
      masteryStars: 0,
      isGolden: false
    }
  ]

  return {
    userId,
    pelaajanNimi: username || 'Pelaaja',
    rahat: 100,
    kulta: 0,
    taso: 1,
    xp: 0,
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
    kaupanOsat: generoiKaupanOsat(3, 1),
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
    lastUpdated: now,
    lastEtsintaAt: 0,
    etsintaCooldownJaljella: 0,
    etsintaRuudut: generoiEtsintaRuudut(1),
    pilotit: [OLETUS_PILOTTI],
    kaupanPilotit: generoiKaupanPilotit(3, 1)
  }
}

/**
 * tickGameState suorittaa pelimaailman simulaatiopäivityksen annettun ajanhetkeen asti.
 * Tämä toimii palvelimen auktoriteettinä ja mahdollistaa offline-etenemisen.
 */
export function tickGameState(state: GameState, nowMs = Date.now()): { state: GameState, events: string[] } {
  const events: string[] = []

  // Varmistetaan tason, xp:n ja pilottien alustus
  if (typeof state.taso !== 'number' || state.taso < 1) state.taso = 1
  if (typeof state.xp !== 'number' || state.xp < 0) state.xp = 0
  if (!state.pilotit || !Array.isArray(state.pilotit) || state.pilotit.length === 0) {
    state.pilotit = [OLETUS_PILOTTI]
  }
  if (!state.kaupanPilotit || !Array.isArray(state.kaupanPilotit)) {
    state.kaupanPilotit = generoiKaupanPilotit(3, state.taso || 1)
  }

  // 1. Hätäapujäähy
  const cooldownEnd = (state.lastHataapuClaimedAt || 0) + 180000
  state.hataapuCooldownJaljella = Math.max(0, Math.ceil((cooldownEnd - nowMs) / 1000))

  // 2. Matkustajien, osien ja pilottien päivitysjakso (180 s / 3 min)
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
    state.kaupanOsat = generoiKaupanOsat(Math.floor(Math.random() * 4) + 2, state.taso || 1)
    state.kaupanPilotit = generoiKaupanPilotit(3, state.taso || 1)
    state.lastPassengerRefreshAt = nowMs
    events.push("Lentokenttien matkustajat, kaupan osat ja uudet rekrytoitavat pilotit päivitetty!")
  } else if (Array.isArray(state.kaupanOsat)) {
    // Siivotaan kaupasta mahdolliset liian korkean tason osat (esim. vanha tallennus)
    const sallitut = state.kaupanOsat.filter(osa => {
      const malli = rakennettavatMallit.find(m => m.malliId === osa.malliId)
      return !malli || (malli.vaadittuTaso || 1) <= (state.taso || 1)
    })
    if (sallitut.length !== state.kaupanOsat.length) {
      state.kaupanOsat = sallitut.length > 0 ? sallitut : generoiKaupanOsat(3, state.taso || 1)
    }
  }

  state.aikaSeuraavaanPaivitykseen = Math.max(
    0,
    Math.ceil((state.lastPassengerRefreshAt + refreshIntervalMs - nowMs) / 1000)
  )

  // 3. Lentojen eteneminen ja laskeutuminen
  state.lentokoneet.forEach(kone => {
    if (kone.tila !== "Ilmassa") return

    // Haetaan koneen nykyinen pilotti
    const pilotti = haeKoneenPilotti(kone, state.pilotit)

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
          if (kone.isGolden || (kone.masteryStars && kone.masteryStars >= 3)) tulo *= 1.15
          if (pilotti.statit.tuloBonus > 0) tulo *= (1 + pilotti.statit.tuloBonus / 100)
          lennonTulot += Math.ceil(tulo)
          state.tilastot.kuljetutMatkustajat++

          if (m.tuottaaKultaa) {
            let saatuKulta = (m.kultaMaara || 1)
            if (kone.onBonusLento) saatuKulta *= 1.25
            if (pilotti.statit.kultaBonus > 0) saatuKulta *= (1 + pilotti.statit.kultaBonus / 100)
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

      // XP ja tason nousu lennon pituuden ja pilotin mukaan
      const xpKerroin = 1 + (pilotti.statit.xpBonus || 0) / 100
      const lennonXp = Math.max(10, Math.round((kone.currentLegDistance || 100) * xpKerroin))
      state.xp = (state.xp || 0) + lennonXp

      let tarvittava = tarvittavaXpTasonNostoon(state.taso)
      while (state.xp >= tarvittava) {
        state.xp -= tarvittava
        state.taso++
        const palkintoKulta = laskeTasoPalkinto(state.taso)
        state.kulta += palkintoKulta
        state.tilastot.keratytKullat += palkintoKulta
        events.push(`🎉 TASON NOUSU! Saavutit tason ${state.taso}! Palkinto: +${palkintoKulta} kultaa ⭐`)
        tarvittava = tarvittavaXpTasonNostoon(state.taso)
      }

      // Lentokoneen masterointi-XP lennon etäisyydestä (km)
      const legDist = Math.max(10, Math.round(kone.currentLegDistance || 100))
      const oldStars = kone.masteryStars || 0
      kone.masteryXp = (kone.masteryXp || 0) + legDist
      const masteryTiedot = laskeKoneenMastery(kone.masteryXp)
      kone.masteryStars = masteryTiedot.stars
      kone.isGolden = masteryTiedot.isGolden

      if (oldStars < 1 && masteryTiedot.stars >= 1) {
        events.push(`⭐ Lentokone ${kone.nimi} saavutti 1. Masterointitähden! (${kone.masteryXp.toLocaleString()} km)`)
      } else if (oldStars < 2 && masteryTiedot.stars >= 2) {
        events.push(`⭐⭐ Lentokone ${kone.nimi} saavutti 2. Masterointitähden! (${kone.masteryXp.toLocaleString()} km)`)
      } else if (oldStars < 3 && masteryTiedot.stars >= 3) {
        events.push(`👑✨ LENTOKONE MASTEROITU! ${kone.nimi} saavutti 3 tähteä ja muuttui KULTAISEKSI! (+15% tulobonus lennoilta) ✨👑`)
      }

      events.push(
        `Kone ${kone.nimi} (${pilotti.avatar} ${pilotti.nimi}) saapui kentälle ${saavuttuKentta}! Tuotto: +${lennonTulot} €${lennonKulta > 0 ? `, +${lennonKulta} kultaa` : ''} (+${lennonXp} XP, +${legDist} km kone-XP).`
      )

      // Siirrytään reitillä eteenpäin
      kone.reitti.shift()

      if (kone.reitti.length > 0) {
        // Seuraava etappi - pilotin nopeusbonus vaikuttaa
        const edellinenArrival: number = kone.arrivalAt || nowMs
        kone.kohde = kone.reitti[0]
        const matka = haeEtaisyys(saavuttuKentta, kone.kohde)
        const nopeusBonus = pilotti?.statit?.nopeusBonus || 0
        const tehokasNopeus = Math.max(10, Math.round(kone.nopeus * (1 + nopeusBonus / 100)))
        const uusiAikaTunteina = matka / tehokasNopeus
        const kestoSek = Math.max(5, Math.round(uusiAikaTunteina * 80))
        
        kone.departedAt = edellinenArrival
        kone.arrivalAt = edellinenArrival + (kestoSek * 1000)
        kone.legDurationSeconds = kestoSek
        kone.currentLegDistance = matka
      } else {
        // Reitti päättynyt -> kone maahan
        kone.tila = "Maassa"
        kone.sijainti = saavuttuKentta
        kone.kohde = null
        kone.onBonusLento = false
        kone.departedAt = null
        kone.arrivalAt = null
        kone.lentoAikaJaljella = 0
        kone.currentLegDistance = undefined
      }
    }

    // Jos kone on edelleen ilmassa, päivitetään jäljellä oleva aika sekunteina
    if (kone.tila === "Ilmassa" && kone.arrivalAt) {
      kone.lentoAikaJaljella = Math.max(0, Math.ceil((kone.arrivalAt - nowMs) / 1000))
    }
  })

  // 4. Päivittäinen metallinpaljastin (24 h / 86400 s)
  const etsintaKestoMs = 86400000
  const etsintaCooldownEnd = (state.lastEtsintaAt || 0) + etsintaKestoMs
  state.etsintaCooldownJaljella = Math.max(0, Math.ceil((etsintaCooldownEnd - nowMs) / 1000))

  if (!Array.isArray(state.etsintaRuudut) || state.etsintaRuudut.length === 0) {
    state.etsintaRuudut = generoiEtsintaRuudut(state.taso || 1)
  } else if (state.etsintaCooldownJaljella === 0 && state.etsintaRuudut.every(r => r.avattu)) {
    // 24h on kulunut edellisen alueen valmistumisesta -> uusi 4x4-alue valmis tutkittavaksi!
    state.etsintaRuudut = generoiEtsintaRuudut(state.taso || 1)
  }

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
      const piirustus = rakennettavatMallit.find(m => m.malliId === osa.malliId)
      const vaadittu = piirustus?.vaadittuTaso || 1
      if ((state.taso || 1) < vaadittu) {
        return { success: false, message: `Tämän koneen osat vaativat tason ${vaadittu}!`, state }
      }

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
      const vaadittu = piirustus.vaadittuTaso || 1
      if ((state.taso || 1) < vaadittu) {
        return { success: false, message: `Koneen ${piirustus.nimi} rakentaminen vaatii tason ${vaadittu}!`, state }
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
        tilavuusTaso: 0,
        masteryXp: 0,
        masteryStars: 0,
        isGolden: false
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

    case 'load-destination-passengers': {
      const { planeId, kohde } = payload || {}
      const kone = state.lentokoneet.find(k => k.id === planeId)
      if (!kone || kone.tila !== "Maassa") {
        return { success: false, message: 'Kone ei ole maassa tai sitä ei löydy', state }
      }
      const vapaatPaikat = kone.matkustajaMaara - kone.matkustajatKyydissa.length
      if (vapaatPaikat <= 0) {
        return { success: false, message: 'Kone on jo täynnä', state }
      }

      const kenttaMatkustajat = state.matkustajatKentilla[kone.sijainti] || []
      const kohteeseenMenevat = kenttaMatkustajat.filter(m => m.kohde === kohde)
      if (kohteeseenMenevat.length === 0) {
        return { success: false, message: `Ei odottavia matkustajia kohteeseen ${kohde}`, state }
      }

      // Priorisoidaan kultamatkustajat (tuottaaKultaa ja suurempi kultaMaara ensin)
      const priorisoidut = [...kohteeseenMenevat].sort((a, b) => {
        const aKulta = a.tuottaaKultaa ? (a.kultaMaara || 1) : 0
        const bKulta = b.tuottaaKultaa ? (b.kultaMaara || 1) : 0
        return bKulta - aKulta
      })

      // Otetaan enintään niin monta kuin vapaata tilaa koneessa on
      const valitut = priorisoidut.slice(0, vapaatPaikat)
      const valitutIdt = new Set(valitut.map(m => m.id))

      // Poistetaan valitut kentältä
      state.matkustajatKentilla[kone.sijainti] = kenttaMatkustajat.filter(m => !valitutIdt.has(m.id))

      // Lisätään koneeseen
      for (const matkustaja of valitut) {
        matkustaja.lahtoKentta = kone.sijainti
        kone.matkustajatKyydissa.push(matkustaja)
      }

      const kultaLkm = valitut.filter(m => m.tuottaaKultaa).length
      const kultaInfo = kultaLkm > 0 ? ` (joista ${kultaLkm} kultamatkustajaa)` : ''
      return {
        success: true,
        message: `${valitut.length} matkustajaa kohteeseen ${kohde} nousi koneeseen${kultaInfo}!`,
        state
      }
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
      const pilotti = haeKoneenPilotti(kone, state.pilotit)
      const tiedot = laskeReitinTiedot(kone, lahtoKentta, route, pilotti)

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
      const nopeusBonus = pilotti?.statit?.nopeusBonus || 0
      const tehokasNopeus = Math.max(10, Math.round(kone.nopeus * (1 + nopeusBonus / 100)))
      const ekaAikaTunteina = ekaMatka / tehokasNopeus
      const kestoSek = Math.max(5, Math.round(ekaAikaTunteina * 80))

      kone.departedAt = nowMs
      kone.arrivalAt = nowMs + (kestoSek * 1000)
      kone.legDurationSeconds = kestoSek
      kone.lentoAikaJaljella = kestoSek
      kone.currentLegDistance = ekaMatka

      return {
        success: true,
        message: `Kone ${kone.nimi} (${pilotti.avatar} ${pilotti.nimi}) lähti matkaan kohti kenttää ${kone.kohde}!`,
        state
      }
    }

    case 'avaa-etsinta-ruutu': {
      const { ruutuIndeksi } = payload || {}
      if (typeof ruutuIndeksi !== 'number' || ruutuIndeksi < 0 || ruutuIndeksi > 15) {
        return { success: false, message: 'Virheellinen ruutu', state }
      }
      if (!Array.isArray(state.etsintaRuudut) || !state.etsintaRuudut[ruutuIndeksi]) {
        return { success: false, message: 'Ruutua ei löydy', state }
      }
      const ruutu = state.etsintaRuudut[ruutuIndeksi]
      if (ruutu.avattu) {
        return { success: false, message: 'Tämä ruutu on jo tutkittu', state }
      }

      ruutu.avattu = true
      let loytoViesti = ''

      if (ruutu.tyyppi === 'raha' && ruutu.rahaMaara) {
        state.rahat += ruutu.rahaMaara
        state.tilastot.ansaitutRahat += ruutu.rahaMaara
        loytoViesti = `Löysit rahaa maasta: +${ruutu.rahaMaara} €! 💰`
      } else if (ruutu.tyyppi === 'kulta' && ruutu.kultaMaara) {
        state.kulta += ruutu.kultaMaara
        state.tilastot.keratytKullat += ruutu.kultaMaara
        loytoViesti = `Upea kimmellys! Löysit kultaa: +${ruutu.kultaMaara} kultaa! 🟡`
      } else if (ruutu.tyyppi === 'osa' && ruutu.osa) {
        state.omistetutOsat.push({ malliId: ruutu.osa.malliId, tyyppi: ruutu.osa.tyyppi })
        loytoViesti = `Harvinainen aarre! Löysit osan: ${ruutu.nimi}! ✈️`
      } else {
        loytoViesti = `Piippaus oli väärä hälytys: ${ruutu.nimi}.`
      }

      // Jos kaikki 16 ruutua on nyt avattu, käynnistetään 24h jäähy
      if (state.etsintaRuudut.every(r => r.avattu)) {
        state.lastEtsintaAt = nowMs
        state.etsintaCooldownJaljella = 86400 // 24 tuntia sekunteina
      }

      return { success: true, message: loytoViesti, state }
    }

    case 'buy-pilot': {
      const { pilotId } = payload || {}
      if (!Array.isArray(state.kaupanPilotit)) {
        state.kaupanPilotit = generoiKaupanPilotit(3, state.taso || 1)
      }
      const pilotIdx = state.kaupanPilotit.findIndex(p => p.id === pilotId)
      if (pilotIdx === -1) {
        return { success: false, message: 'Pilottia ei löydy rekrytoinnista', state }
      }
      const pilotti = state.kaupanPilotit[pilotIdx]

      if (pilotti.valuutta === 'kulta') {
        if (state.kulta < pilotti.hinta) {
          return { success: false, message: `Ei tarpeeksi kultaa (tarvitaan ${pilotti.hinta} kultaa)`, state }
        }
        state.kulta -= pilotti.hinta
      } else {
        if (state.rahat < pilotti.hinta) {
          return { success: false, message: `Ei tarpeeksi rahaa (tarvitaan ${pilotti.hinta} €)`, state }
        }
        state.rahat -= pilotti.hinta
      }

      state.kaupanPilotit.splice(pilotIdx, 1)
      if (!Array.isArray(state.pilotit)) {
        state.pilotit = [OLETUS_PILOTTI]
      }
      pilotti.koneId = null
      state.pilotit.push(pilotti)

      return {
        success: true,
        message: `Palkkasit pilotin ${pilotti.nimi} (${pilotti.avatar} ${pilotti.titteli})! Voit nyt asettaa hänet koneeseen.`,
        state
      }
    }

    case 'assign-pilot': {
      const { planeId, pilotId } = payload || {}
      const kone = state.lentokoneet.find(k => k.id === planeId)
      if (!kone) {
        return { success: false, message: 'Lentokonetta ei löydy', state }
      }
      if (!Array.isArray(state.pilotit)) {
        state.pilotit = [OLETUS_PILOTTI]
      }

      // Jos pilotId on null tai OLETUS_PILOTTI: vapautetaan kone oletuslentäjälle
      if (!pilotId || pilotId === OLETUS_PILOTTI.id) {
        if (kone.pilottiId) {
          const vanha = state.pilotit.find(p => p.id === kone.pilottiId)
          if (vanha) vanha.koneId = null
        }
        kone.pilottiId = null
        return { success: true, message: `Koneen ${kone.nimi} puikkoihin asetettiin Timo Tylsä (oletus)`, state }
      }

      const uusiPilotti = state.pilotit.find(p => p.id === pilotId)
      if (!uusiPilotti) {
        return { success: false, message: 'Pilottia ei löydy omistamistasi piloteista', state }
      }

      // Jos uusi pilotti oli jo toisessa koneessa, vapautetaan se toinen kone
      if (uusiPilotti.koneId && uusiPilotti.koneId !== planeId) {
        const toinenKone = state.lentokoneet.find(k => k.id === uusiPilotti.koneId)
        if (toinenKone) toinenKone.pilottiId = null
      }

      // Jos tässä koneessa oli aiempi pilotti, vapautetaan se
      if (kone.pilottiId && kone.pilottiId !== pilotId) {
        const vanha = state.pilotit.find(p => p.id === kone.pilottiId)
        if (vanha) vanha.koneId = null
      }

      kone.pilottiId = uusiPilotti.id
      uusiPilotti.koneId = planeId

      return {
        success: true,
        message: `${uusiPilotti.avatar} ${uusiPilotti.nimi} asetettiin koneen ${kone.nimi} kapteeniksi!`,
        state
      }
    }

    case 'upgrade-pilot': {
      const { pilotId } = payload || {}
      if (!Array.isArray(state.pilotit)) {
        state.pilotit = [OLETUS_PILOTTI]
      }
      const pilotti = state.pilotit.find(p => p.id === pilotId)
      if (!pilotti) {
        return { success: false, message: 'Pilottia ei löydy', state }
      }
      if (pilotti.id === OLETUS_PILOTTI.id) {
        return { success: false, message: 'Timo Tylsää ei voi päivittää. Palkkaa uusia pilotteja rekrytoinnista!', state }
      }
      if (pilotti.taso >= (pilotti.maxTaso || 5)) {
        return { success: false, message: `${pilotti.nimi} on jo saavuttanut maksimitason!`, state }
      }

      if (pilotti.paivitysValuutta === 'kulta') {
        if (state.kulta < pilotti.paivitysHinta) {
          return { success: false, message: `Ei tarpeeksi kultaa päivitykseen (tarvitaan ${pilotti.paivitysHinta} kultaa)`, state }
        }
        state.kulta -= pilotti.paivitysHinta
      } else {
        if (state.rahat < pilotti.paivitysHinta) {
          return { success: false, message: `Ei tarpeeksi rahaa päivitykseen (tarvitaan ${pilotti.paivitysHinta} €)`, state }
        }
        state.rahat -= pilotti.paivitysHinta
      }

      // Nostetaan statseja harvinaisuuden mukaan
      pilotti.taso++
      const boost = pilotti.harvinaisuus === 'legendaarinen' ? 5 : (pilotti.harvinaisuus === 'eeppinen' ? 4 : (pilotti.harvinaisuus === 'harvinainen' ? 3 : 2))
      if (pilotti.statit.nopeusBonus > 0) pilotti.statit.nopeusBonus += boost
      if (pilotti.statit.kulutusAlennus > 0) pilotti.statit.kulutusAlennus += boost
      if (pilotti.statit.tuloBonus > 0) pilotti.statit.tuloBonus += boost
      if (pilotti.statit.kultaBonus > 0) pilotti.statit.kultaBonus += Math.max(1, Math.round(boost * 0.7))
      if (pilotti.statit.xpBonus > 0) pilotti.statit.xpBonus += boost + 1

      // Uusi päivityshinta
      if (pilotti.paivitysValuutta === 'kulta') {
        pilotti.paivitysHinta = Math.max(2, Math.round(pilotti.paivitysHinta * 1.5))
      } else {
        pilotti.paivitysHinta = Math.round(pilotti.paivitysHinta * 1.6)
      }

      return {
        success: true,
        message: `🎉 ${pilotti.avatar} ${pilotti.nimi} päivitettiin tasolle ${pilotti.taso}! Bonukset paranivat ⭐`,
        state
      }
    }

    case 'fire-pilot': {
      const { pilotId } = payload || {}
      if (!Array.isArray(state.pilotit)) return { success: false, message: 'Pilotteja ei löydy', state }
      if (pilotId === OLETUS_PILOTTI.id) {
        return { success: false, message: 'Timo Tylsää ei voi irtisanoa!', state }
      }
      const idx = state.pilotit.findIndex(p => p.id === pilotId)
      if (idx === -1) {
        return { success: false, message: 'Pilottia ei löydy', state }
      }
      const [poistettu] = state.pilotit.splice(idx, 1)
      if (poistettu.koneId) {
        const kone = state.lentokoneet.find(k => k.id === poistettu.koneId)
        if (kone) kone.pilottiId = null
      }

      // Pieni erorahapalkkio (30% perushinnasta)
      const hyvitys = Math.round(poistettu.hinta * 0.3)
      if (poistettu.valuutta === 'kulta') {
        state.kulta += Math.max(1, hyvitys)
      } else {
        state.rahat += Math.max(100, hyvitys)
      }

      return {
        success: true,
        message: `Irtisanoit pilotin ${poistettu.nimi}. Sait erorahana ${hyvitys} ${poistettu.valuutta === 'kulta' ? 'kultaa' : '€'}.`,
        state
      }
    }

    default:
      return { success: false, message: `Tuntematon toiminto: ${action}`, state }
  }
}
