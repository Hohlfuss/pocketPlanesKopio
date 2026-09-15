// src/shared/gameData.ts
import type { Piirustus, OstettavaKentta, KenttaData, Lentokone, Matkustaja } from './types'

export const kenttaKoordinaatit: Record<string, { x: number, y: number }> = {
  "Pirkkala": { x: 400, y: 720 },
  "Pori": { x: 330, y: 700 },
  "Helsinki": { x: 500, y: 800 },
  "Turku": { x: 380, y: 780 },
  "Tampere": { x: 420, y: 710 },
  "Jyväskylä": { x: 480, y: 650 },
  "Vaasa": { x: 350, y: 550 },
  "Kuopio": { x: 600, y: 600 },
  "Joensuu": { x: 680, y: 620 },
  "Lappeenranta": { x: 620, y: 750 },
  "Oulu": { x: 500, y: 400 },
  "Rovaniemi": { x: 500, y: 250 },
  "Ivalo": { x: 550, y: 100 },
  "Tallinna": { x: 500, y: 850 },
  "Riika": { x: 480, y: 1000 },
  "Varsova": { x: 520, y: 1200 },
  "Tukholma": { x: 200, y: 750 },
  "Oslo": { x: 50, y: 750 },
  "Kööpenhamina": { x: 150, y: 1100 },
  "Amsterdam": { x: 100, y: 1280 },
  "Berliini": { x: 300, y: 1300 },
  "Praha": { x: 360, y: 1380 },
  "Wien": { x: 440, y: 1460 },
  "Lontoo": { x: -100, y: 1250 },
  "Pariisi": { x: -50, y: 1450 },
  "Rooma": { x: 360, y: 1780 },
  "Madrid": { x: -240, y: 1780 }
}

export const haeEtaisyys = (k1: string, k2: string): number => {
  const p1 = kenttaKoordinaatit[k1]
  const p2 = kenttaKoordinaatit[k2]
  if (!p1 || !p2) return 150
  return Math.round(Math.hypot(p2.x - p1.x, p2.y - p1.y) * 1.5)
}

export const rakennettavatMallit: Piirustus[] = [
  { malliId: "piper", nimi: "Piper Cub (Keltasirkku)", nopeus: 130, paino: 350, kulutus: 16, matkustajaMaara: 1, vaadittuTaso: 1 },
  { malliId: "cessna150", nimi: "Cessna 150 (Kirppu)", nopeus: 150, paino: 500, kulutus: 22, matkustajaMaara: 1, vaadittuTaso: 1 },
  { malliId: "da40", nimi: "Diamond DA40 (Kaksikko)", nopeus: 220, paino: 800, kulutus: 30, matkustajaMaara: 2, vaadittuTaso: 1 },
  { malliId: "c172", nimi: "Cessna 172 (Taivaan Lada)", nopeus: 226, paino: 767, kulutus: 30, matkustajaMaara: 3, vaadittuTaso: 1 },
  { malliId: "baron", nimi: "Beechcraft Baron (Paroni)", nopeus: 370, paino: 2500, kulutus: 120, matkustajaMaara: 4, vaadittuTaso: 1 },
  { malliId: "pc12", nimi: "Pilatus PC-12 (Alppikotka)", nopeus: 520, paino: 4700, kulutus: 250, matkustajaMaara: 5, vaadittuTaso: 2 },
  { malliId: "twinotter", nimi: "de Havilland Twin Otter (Saaristotykki)", nopeus: 280, paino: 3360, kulutus: 180, matkustajaMaara: 12, vaadittuTaso: 3 },
  { malliId: "kingair", nimi: "Beechcraft King Air (Taivaan Herra)", nopeus: 540, paino: 5350, kulutus: 320, matkustajaMaara: 8, vaadittuTaso: 4 },
  { malliId: "caravan", nimi: "Cessna Caravan (Rahtikasa)", nopeus: 340, paino: 4000, kulutus: 210, matkustajaMaara: 9, vaadittuTaso: 5 },
  { malliId: "atr42", nimi: "ATR 42 (Euroopan Työjuhta)", nopeus: 510, paino: 11500, kulutus: 480, matkustajaMaara: 16, vaadittuTaso: 6 },
  { malliId: "erj145", nimi: "Embraer ERJ 145 (Kapearunkoinen)", nopeus: 800, paino: 20000, kulutus: 900, matkustajaMaara: 18, vaadittuTaso: 7 },
  { malliId: "dash8", nimi: "Bombardier Dash 8 (Pohjolan Tykki)", nopeus: 660, paino: 17500, kulutus: 720, matkustajaMaara: 22, vaadittuTaso: 8 },
  { malliId: "b737", nimi: "Boeing 737 (Taivaan Valas)", nopeus: 850, paino: 41000, kulutus: 1800, matkustajaMaara: 30, vaadittuTaso: 9 },
  { malliId: "bae146", nimi: "BAe 146 (Hiljainen Nelonen)", nopeus: 750, paino: 24000, kulutus: 1250, matkustajaMaara: 26, vaadittuTaso: 10 },
  { malliId: "a320", nimi: "Airbus A320 (Eurobussi)", nopeus: 830, paino: 42000, kulutus: 1750, matkustajaMaara: 35, vaadittuTaso: 11 },
  { malliId: "a220", nimi: "Airbus A220 (Uuden Ajan Siipi)", nopeus: 840, paino: 37000, kulutus: 1550, matkustajaMaara: 38, vaadittuTaso: 12 },
  { malliId: "concorde", nimi: "Concorde (Äänivalli)", nopeus: 2150, paino: 78000, kulutus: 8500, matkustajaMaara: 20, vaadittuTaso: 14 }
]

export const mallinVaadittuTaso = (malliId: string): number => {
  const m = rakennettavatMallit.find(p => p.malliId === malliId)
  return m?.vaadittuTaso ?? 1
}

export const alkuperaisetOstettavatKentat: OstettavaKentta[] = [
  { nimi: "Turku", tier: 1, maxMatkustajat: 3 },
  { nimi: "Tampere", tier: 1, maxMatkustajat: 3 },
  { nimi: "Jyväskylä", tier: 1, maxMatkustajat: 3 },
  { nimi: "Vaasa", tier: 2, maxMatkustajat: 6 },
  { nimi: "Kuopio", tier: 2, maxMatkustajat: 6 },
  { nimi: "Joensuu", tier: 1, maxMatkustajat: 3 },
  { nimi: "Lappeenranta", tier: 1, maxMatkustajat: 3 },
  { nimi: "Oulu", tier: 2, maxMatkustajat: 6 },
  { nimi: "Rovaniemi", tier: 2, maxMatkustajat: 6 },
  { nimi: "Ivalo", tier: 1, maxMatkustajat: 3 },
  { nimi: "Tallinna", tier: 2, maxMatkustajat: 6 },
  { nimi: "Riika", tier: 2, maxMatkustajat: 6 },
  { nimi: "Varsova", tier: 2, maxMatkustajat: 6 },
  { nimi: "Praha", tier: 2, maxMatkustajat: 6 },
  { nimi: "Wien", tier: 2, maxMatkustajat: 6 },
  { nimi: "Tukholma", tier: 3, maxMatkustajat: 9 },
  { nimi: "Oslo", tier: 3, maxMatkustajat: 9 },
  { nimi: "Kööpenhamina", tier: 3, maxMatkustajat: 9 },
  { nimi: "Amsterdam", tier: 3, maxMatkustajat: 9 },
  { nimi: "Berliini", tier: 3, maxMatkustajat: 9 },
  { nimi: "Lontoo", tier: 3, maxMatkustajat: 9 },
  { nimi: "Pariisi", tier: 3, maxMatkustajat: 9 },
  { nimi: "Rooma", tier: 3, maxMatkustajat: 9 },
  { nimi: "Madrid", tier: 3, maxMatkustajat: 9 }
]

export const mahdollisetNimet = [
  "Matti", "Maija", "Pekka", "Liisa", "Jari", "Sari", "Teppo", "Sirpa",
  "Kalle", "Anna", "Jukka", "Tiina", "Simo", "Tarja", "Eero", "Sanna",
  "Mikko", "Minna", "Lauri", "Eeva"
]

export const omistetutTasoittain = (avatutKentat: Record<string, KenttaData>, tier: number): number => {
  const count = Object.values(avatutKentat).filter(k => k.tier === tier).length
  if (tier === 1) return Math.max(0, count - 2)
  if (tier === 3) return Math.max(0, count - 1)
  return count
}

export const hintaKentalle = (kentta: { tier: number, maxMatkustajat: number }, avatutKentat: Record<string, KenttaData>): number => {
  const n = omistetutTasoittain(avatutKentat, kentta.tier)
  const baseHinta = kentta.maxMatkustajat * 600
  const progressio = (n * kentta.maxMatkustajat * 700) + (n * n * 500)
  return baseHinta + progressio
}

export const hintaKenttaMatkustajaPaikka = (k: KenttaData): number => {
  return (k.matkustajaPaikkaTaso + 1) * 1500 * k.tier
}

export const hintaNopeus = (nopeusTaso: number) => 2 + (nopeusTaso * 3)
export const hintaKulutus = (kulutusTaso: number) => 2 + (kulutusTaso * 3)
export const hintaTilavuus = (tilavuusTaso: number) => 8 + (tilavuusTaso * 12)
export const uudenPaikanHinta = (maksimiKonePaikat: number) => maksimiKonePaikat * 500

export const malliOsanPerushinnat: Record<string, number> = {
  piper: 3,
  cessna150: 4,
  da40: 6,
  c172: 8,
  baron: 12,
  pc12: 16,
  kingair: 20,
  caravan: 24,
  twinotter: 28,
  atr42: 32,
  erj145: 40,
  dash8: 50,
  b737: 65,
  bae146: 70,
  a320: 75,
  a220: 85,
  concorde: 100
}

export const laskeOsanHinta = (malliId: string): number => {
  const base = malliOsanPerushinnat[malliId] || 5
  // Pieni luonnollinen satunnaisvaihtelu (0 - ~15%)
  const varianssi = Math.floor(base * 0.15)
  const lisa = varianssi > 0 ? Math.floor(Math.random() * (varianssi + 1)) : (Math.random() < 0.5 ? 1 : 0)
  return base + lisa
}

export const laskeReitinTiedot = (kone: Lentokone, lahtoKentta: string, reitti: string[]) => {
  if (reitti.length === 0) {
    return { matka: 0, aikaSekunteina: 0, tulot: 0, kulut: 0, voitto: 0, isBonus: false, arvioKulta: 0 }
  }
  let kokoMatka = 0
  let nykyinen = lahtoKentta
  for (const etappi of reitti) {
    kokoMatka += haeEtaisyys(nykyinen, etappi)
    nykyinen = etappi
  }
  const lentoAikaTunteina = kokoMatka / kone.nopeus 
  const aikaSekunteina = Math.max(5, Math.round(lentoAikaTunteina * 80)) 
  const kulut = Math.round((kone.kulutus * lentoAikaTunteina) * 2.0)
  
  let isBonus = false
  if (kone.matkustajaMaara > 1 && kone.matkustajatKyydissa.length === kone.matkustajaMaara) {
    const ekaKohde = kone.matkustajatKyydissa[0].kohde
    if (kone.matkustajatKyydissa.every((m: Matkustaja) => m.kohde === ekaKohde) && reitti.includes(ekaKohde)) {
      isBonus = true
    }
  }

  let tulot = 0
  let kultaArvio = 0

  for (const m of kone.matkustajatKyydissa) {
    if (reitti.includes(m.kohde)) {
      tulot += haeEtaisyys(lahtoKentta, m.kohde) * 0.35
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

// Laskee XP-määrän, joka vaaditaan seuraavalle tasolle pääsemiseksi (hidastettu tahti)
export const tarvittavaXpTasonNostoon = (taso: number): number => {
  return Math.round(2000 * Math.pow(Math.max(1, taso), 1.5))
}

// Laskee kultapalkinnon kun uusi taso saavutetaan (nousee hitaasti tason mukaan)
export const laskeTasoPalkinto = (uusiTaso: number): number => {
  return Math.max(2, Math.floor(1 + Math.max(1, uusiTaso) * 0.45))
}
