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

export interface GameState {
  userId: string
  pelaajanNimi: string
  rahat: number
  kulta: number
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
  | 'dispatch-plane'

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
  updatedAt?: string
}
