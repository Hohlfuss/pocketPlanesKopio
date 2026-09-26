// src/shared/types.ts

export type OsaTyyppi = 'moottori' | 'runko' | 'siivet'

export interface Matkustaja {
  id: string
  nimi: string
  kohde: string
  lahtoKentta?: string
  tuottaaKultaa?: boolean
  kultaMaara?: number
}

export type PilottiHarvinaisuus = 'tavallinen' | 'harvinainen' | 'eeppinen' | 'legendaarinen'

export interface PilottiStatit {
  nopeusBonus: number      // Esim. +5% nopeuteen (lyhentää lentoaikaa)
  kulutusAlennus: number   // Esim. -8% polttoainekuluihin
  tuloBonus: number        // Esim. +10% lipputuloihin (rahat)
  kultaBonus: number       // Esim. +10% kultatuottoon kultamatkustajista
  xpBonus: number          // Esim. +15% XP-ansioon lennoilta
}

export interface Pilotti {
  id: string
  nimi: string
  titteli: string
  kuvaus: string
  avatar: string
  harvinaisuus: PilottiHarvinaisuus
  taso: number
  maxTaso: number
  hinta: number
  valuutta: 'raha' | 'kulta'
  statit: PilottiStatit
  koneId?: number | null
  paivitysHinta: number
  paivitysValuutta: 'raha' | 'kulta'
}

export interface Lentokone {
  id: number
  nimi: string
  malliId: string
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
  departedAt?: number | null
  arrivalAt?: number | null
  legDurationSeconds?: number
  onBonusLento: boolean
  nopeusTaso: number
  kulutusTaso: number
  tilavuusTaso: number
  currentLegDistance?: number
  pilottiId?: string | null
  masteryXp?: number
  masteryStars?: number
  isGolden?: boolean
}

export interface KenttaData {
  nimi: string
  tier: number
  maxMatkustajat: number
  matkustajaPaikkaTaso: number
}

export interface OstettavaKentta {
  nimi: string
  tier: number
  maxMatkustajat: number
}

export interface Osa {
  id: string
  malliId: string
  tyyppi: OsaTyyppi
  hinta: number
}

export interface Piirustus {
  malliId: string
  nimi: string
  nopeus: number
  paino: number
  kulutus: number
  matkustajaMaara: number
  vaadittuTaso?: number
}

export interface Tilastot {
  tehdytLennot: number
  lennodetytKilometrit: number
  ansaitutRahat: number
  kulutetutRahatPolttoaineeseen: number
  kuljetutMatkustajat: number
  keratytKullat: number
  rakennetutKoneet: number
}

export type EtsintaLoytoTyyppi = 'tyhja' | 'raha' | 'kulta' | 'osa'

export interface EtsintaRuutu {
  id: number
  avattu: boolean
  tyyppi: EtsintaLoytoTyyppi
  nimi: string
  ikoni: string
  arvoTeksti?: string
  rahaMaara?: number
  kultaMaara?: number
  osa?: {
    malliId: string
    tyyppi: OsaTyyppi
  }
}

export interface GameState {
  userId: string
  pelaajanNimi: string
  rahat: number
  kulta: number
  taso: number
  xp: number
  maksimiKonePaikat: number
  lastHataapuClaimedAt: number
  hataapuCooldownJaljella: number
  lastPassengerRefreshAt: number
  aikaSeuraavaanPaivitykseen: number
  avatutKentat: Record<string, KenttaData>
  ostettavatKentat: OstettavaKentta[]
  lentokoneet: Lentokone[]
  omistetutOsat: { malliId: string; tyyppi: OsaTyyppi }[]
  matkustajatKentilla: Record<string, Matkustaja[]>
  kaupanOsat: Osa[]
  tilastot: Tilastot
  koneIdCounter: number
  matkustajaIdCounter: number
  lastUpdated: number
  lastEtsintaAt: number
  etsintaCooldownJaljella: number
  etsintaRuudut: EtsintaRuutu[]
  pilotit: Pilotti[]
  kaupanPilotit: Pilotti[]
}

export type GameActionType =
  | 'claim-emergency-aid'
  | 'buy-airport'
  | 'upgrade-airport'
  | 'buy-part'
  | 'build-plane'
  | 'scrap-plane'
  | 'upgrade-plane'
  | 'buy-hangar-slot'
  | 'load-passenger'
  | 'unload-passenger'
  | 'load-destination-passengers'
  | 'dispatch-plane'
  | 'avaa-etsinta-ruutu'
  | 'buy-pilot'
  | 'assign-pilot'
  | 'upgrade-pilot'
  | 'fire-pilot'

export interface GameActionPayload {
  action: GameActionType
  payload?: any
}

export interface LeaderboardEntry {
  userId: string
  user_id?: string
  pelaajanNimi: string
  pelaajan_nimi?: string
  rahat: number
  kulta: number
  koneet: number
  lennot: number
  matkustajat: number
  kentat?: number
  taso?: number
  updatedAt?: string
}
