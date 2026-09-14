// server/test/gameEngine.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  luoAlkutila,
  tickGameState,
  suoritaToiminto
} from '../game/gameEngine'

test('Alustustila: pelaajalla on 100 €, 3 kenttää ja 3 aloituskonetta', () => {
  const state = luoAlkutila('test-user', 'TestPilot')
  assert.equal(state.userId, 'test-user')
  assert.equal(state.pelaajanNimi, 'TestPilot')
  assert.equal(state.rahat, 100)
  assert.equal(state.kulta, 0)
  assert.equal(state.lentokoneet.length, 3)
  assert.equal(Object.keys(state.avatutKentat).length, 3)
})

test('Hätäapu: voidaan lunastaa vain kerran 3 minuutissa', () => {
  const now = 1000000
  const state = luoAlkutila('test-user', 'TestPilot')

  // Ensimmäinen lunastus
  const res1 = suoritaToiminto(state, 'claim-emergency-aid', {}, now)
  assert.equal(res1.success, true)
  assert.equal(state.rahat, 200)
  assert.equal(state.hataapuCooldownJaljella, 180)

  // Yritetään heti uudestaan
  const res2 = suoritaToiminto(state, 'claim-emergency-aid', {}, now + 10000)
  assert.equal(res2.success, false)
  assert.equal(state.rahat, 200)

  // 181 sekunnin kuluttua onnistuu taas
  const res3 = suoritaToiminto(state, 'claim-emergency-aid', {}, now + 181000)
  assert.equal(res3.success, true)
  assert.equal(state.rahat, 300)
})

test('Lennon lähetys: vähentää polttoainekulut ja asettaa saapumisajan', () => {
  const now = 1000000
  const state = luoAlkutila('test-user', 'TestPilot')
  const kone = state.lentokoneet[0] // Piper Cub Pirkkalassa

  // Lähetetään Poriin
  const rahatAlussa = state.rahat
  const res = suoritaToiminto(state, 'dispatch-plane', { planeId: kone.id, route: ['Pori'] }, now)
  assert.equal(res.success, true)
  assert.equal(kone.tila, 'Ilmassa')
  assert.equal(kone.kohde, 'Pori')
  assert.ok(state.rahat < rahatAlussa, 'Polttoainekulut pitää vähentää')
  assert.ok(kone.arrivalAt! > now, 'Saapumisaika pitää olla tulevaisuudessa')
})

test('Lennon valmistuminen (Catch-up): palkitsee tulot ja laskee koneen kentälle', () => {
  const now = 1000000
  const state = luoAlkutila('test-user', 'TestPilot')
  const kone = state.lentokoneet[0]

  // Lisätään matkustaja kohteeseen Pori
  kone.matkustajatKyydissa.push({
    id: 'm_test_1',
    nimi: 'Koematkustaja',
    kohde: 'Pori',
    lahtoKentta: 'Pirkkala',
    tuottaaKultaa: true,
    kultaMaara: 1
  })

  // Lähetetään kone
  suoritaToiminto(state, 'dispatch-plane', { planeId: kone.id, route: ['Pori'] }, now)
  const arrivalTime = kone.arrivalAt!
  const rahatLennonAlussa = state.rahat

  // Hypätään ajassa eteenpäin saapumisaikaan
  const { events } = tickGameState(state, arrivalTime + 1000)

  assert.equal(kone.tila, 'Maassa')
  assert.equal(kone.sijainti, 'Pori')
  assert.equal(kone.kohde, null)
  assert.equal(kone.matkustajatKyydissa.length, 0)
  assert.ok(state.rahat > rahatLennonAlussa, 'Pelaajan rahat pitää kasvaa lennon tuotolla')
  assert.equal(state.kulta, 1, 'Kultamatkustajasta pitää saada kultaa')
  assert.ok(events.length > 0)
})

test('Huijauksen esto: ei voi ostaa kenttää ilman riittäviä varoja', () => {
  const state = luoAlkutila('test-user', 'TestPilot')
  state.rahat = 10 // Liian vähän rahaa

  const res = suoritaToiminto(state, 'buy-airport', { airportName: 'Tampere' }, Date.now())
  assert.equal(res.success, false)
  assert.equal(state.avatutKentat['Tampere'], undefined)
})
