// server/test/leaderboard.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { luoAlkutila } from '../game/gameEngine'
import { updateLeaderboardEntry, getLeaderboard, clearLeaderboardCacheForTesting } from '../db/storage'

test('Tulostaulu: pelaajan tiedot päivittyvät ja lajittelu toimii usealla sarakkeella', async () => {
  clearLeaderboardCacheForTesting()
  const u1 = '11111111-1111-1111-1111-111111111111'
  const u2 = '22222222-2222-2222-2222-222222222222'
  const u3 = '33333333-3333-3333-3333-333333333333'

  // Pelaaja 1: Rikas, vähän lentoja ja koneita, taso 2
  const p1 = luoAlkutila(u1, 'RikasRoope')
  p1.rahat = 50000
  p1.kulta = 10
  p1.taso = 2
  p1.lentokoneet = p1.lentokoneet.slice(0, 1) // 1 kone
  p1.tilastot.tehdytLennot = 2
  p1.tilastot.kuljetutMatkustajat = 5
  await updateLeaderboardEntry(p1)

  // Pelaaja 2: Ahkera lentäjä, suuri laivasto, taso 10
  const p2 = luoAlkutila(u2, 'ÄssäLentäjä')
  p2.rahat = 2000
  p2.kulta = 5
  p2.taso = 10
  // Lisätään koneita
  p2.lentokoneet.push({ ...p2.lentokoneet[0], id: 101 }, { ...p2.lentokoneet[0], id: 102 }) // 5 konetta
  p2.tilastot.tehdytLennot = 99
  p2.tilastot.kuljetutMatkustajat = 250
  await updateLeaderboardEntry(p2)

  // Pelaaja 3: Kultapossu, taso 5
  const p3 = luoAlkutila(u3, 'KultaKunkku')
  p3.rahat = 15000
  p3.kulta = 200
  p3.taso = 5
  p3.tilastot.tehdytLennot = 30
  p3.tilastot.kuljetutMatkustajat = 80
  await updateLeaderboardEntry(p3)

  // 1. Testataan lajittelu rahojen mukaan (oletus)
  const lbRahat = await getLeaderboard('rahat')
  assert.equal(lbRahat[0].userId, u1)
  assert.equal(lbRahat[0].pelaajanNimi, 'RikasRoope')
  assert.equal(lbRahat[0].rahat, 50000)
  assert.equal(lbRahat[0].taso, 2, 'RikasRoopen tason tulee säilyä tulostaulukossa')

  // 2. Testataan lajittelu koneiden mukaan
  const lbKoneet = await getLeaderboard('koneet')
  assert.equal(lbKoneet[0].userId, u2)
  assert.equal(lbKoneet[0].pelaajanNimi, 'ÄssäLentäjä')
  assert.equal(lbKoneet[0].koneet, 5)

  // 3. Testataan lajittelu lentojen mukaan
  const lbLennot = await getLeaderboard('lennot')
  assert.equal(lbLennot[0].userId, u2)
  assert.equal(lbLennot[0].lennot, 99)

  // 4. Testataan lajittelu matkustajien mukaan
  const lbMatkustajat = await getLeaderboard('matkustajat')
  assert.equal(lbMatkustajat[0].userId, u2)
  assert.equal(lbMatkustajat[0].matkustajat, 250)

  // 5. Testataan lajittelu kullan mukaan
  const lbKulta = await getLeaderboard('kulta')
  assert.equal(lbKulta[0].userId, u3)
  assert.equal(lbKulta[0].pelaajanNimi, 'KultaKunkku')
  assert.equal(lbKulta[0].kulta, 200)

  // 6. Testataan lajittelu tason mukaan
  const lbTaso = await getLeaderboard('taso')
  assert.equal(lbTaso[0].userId, u2, 'Korkeimman tason (10) omaavan ÄssäLentäjän tulee olla kärjessä')
  assert.equal(lbTaso[0].taso, 10)
  assert.equal(lbTaso[1].userId, u3, 'Toisena tason 5 KultaKunkku')
  assert.equal(lbTaso[1].taso, 5)
  assert.equal(lbTaso[2].userId, u1, 'Kolmantena tason 2 RikasRoope')
  assert.equal(lbTaso[2].taso, 2)
})
