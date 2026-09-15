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

test('Osien hinnoittelu: kehittyneempien koneiden osat ovat kalliimpia', async () => {
  const { laskeOsanHinta } = await import('../game/gameData')

  const piperHinta = laskeOsanHinta('piper')
  const c172Hinta = laskeOsanHinta('c172')
  const baronHinta = laskeOsanHinta('baron')
  const erjHinta = laskeOsanHinta('erj145')
  const b737Hinta = laskeOsanHinta('b737')
  const concordeHinta = laskeOsanHinta('concorde')

  assert.ok(piperHinta <= c172Hinta, 'Piperin osan pitää olla halvempi kuin Cessna 172')
  assert.ok(c172Hinta < baronHinta, 'Cessna 172 pitää olla halvempi kuin Baron')
  assert.ok(baronHinta < erjHinta, 'Baron pitää olla halvempi kuin ERJ 145')
  assert.ok(erjHinta < b737Hinta, 'ERJ 145 pitää olla halvempi kuin Boeing 737')
  assert.ok(b737Hinta < concordeHinta, 'Boeing 737 pitää olla halvempi kuin Concorde')
})

test('Tasojärjestelmä: pelaaja aloittaa tasolta 1, kerää XP:tä lennoista ja saa kultaa tason noustessa', async () => {
  const { tarvittavaXpTasonNostoon, laskeTasoPalkinto } = await import('../game/gameData')
  const state = luoAlkutila('test-user-level', 'LevelPilot')

  assert.equal(state.taso, 1, 'Pelaajan tulee aloittaa tasolta 1')
  assert.equal(state.xp, 0, 'Pelaajan tulee aloittaa 0 XP:llä')

  const kone = state.lentokoneet[0]
  const now = 2000000

  // Lähetetään kone lennolle Pirkkala -> Pori
  suoritaToiminto(state, 'dispatch-plane', { planeId: kone.id, route: ['Pori'] }, now)
  const arrivalTime = kone.arrivalAt!

  // Kone saapuu
  const { events } = tickGameState(state, arrivalTime + 1000)
  assert.ok(state.xp > 0, 'Pelaajan tulisi saada XP:tä lennosta')
  assert.equal(state.taso, 1, 'Yksi lyhyt lento ei vielä riitä tason nostoon')

  // Simuloidaan lisää XP:tä niin että taso nousee
  const xpTarve1 = tarvittavaXpTasonNostoon(1)
  const kultaEnnen = state.kulta

  // Asetetaan kone uudelle pitkälle lennolle tai asetetaan xp juuri alle kynnyksen
  state.xp = xpTarve1 - 10
  kone.sijainti = 'Pori'
  kone.tila = 'Maassa'

  suoritaToiminto(state, 'dispatch-plane', { planeId: kone.id, route: ['Helsinki'] }, arrivalTime + 2000)
  const arrivalTime2 = kone.arrivalAt!

  const { events: events2 } = tickGameState(state, arrivalTime2 + 1000)
  assert.equal(state.taso, 2, 'Pelaajan tulisi nousta tasolle 2 kun tarvittava XP saavutetaan')
  const odotettuPalkinto = laskeTasoPalkinto(2)
  assert.equal(state.kulta, kultaEnnen + odotettuPalkinto, 'Tason noususta pitää saada kultapalkinto')
  assert.ok(events2.some(e => e.includes('TASON NOUSU')), 'Tapahtumalokissa tulee näkyä tason nousu')
})

test('Osien tasovaatimukset: tasolla 1 näkyvät vain ensimmäiset 5 konetta, edistyneemmät vaativat tason', async () => {
  const { generoiKaupanOsat } = await import('../game/gameEngine')
  const { rakennettavatMallit } = await import('../game/gameData')

  // Ensimmäisten 5 koneen tulee olla tasolla 1 auki
  for (let i = 0; i < 5; i++) {
    assert.equal(rakennettavatMallit[i].vaadittuTaso || 1, 1, `Koneen ${rakennettavatMallit[i].nimi} tulee olla auki tasolla 1`)
  }

  // 6. koneesta eteenpäin vaaditaan korkeampi taso
  for (let i = 5; i < rakennettavatMallit.length; i++) {
    assert.ok((rakennettavatMallit[i].vaadittuTaso || 1) > 1, `Koneen ${rakennettavatMallit[i].nimi} tulee vaatia taso > 1`)
  }

  // Generoidaan osia tasolle 1: ei koskaan yli tason 1 osia
  for (let i = 0; i < 20; i++) {
    const osatTaso1 = generoiKaupanOsat(6, 1)
    for (const osa of osatTaso1) {
      const malli = rakennettavatMallit.find(m => m.malliId === osa.malliId)
      assert.equal(malli?.vaadittuTaso || 1, 1, `Tasolla 1 kauppaan ei saa tulla osaa malliin ${osa.malliId}`)
    }
  }

  // Yritetään ostaa tai rakentaa korkean tason konetta tasolla 1
  const state = luoAlkutila('level-restrict-user', 'Pilot')
  state.taso = 1
  state.kulta = 500

  // Lisätään kauppaan Concorden osa
  state.kaupanOsat = [{
    id: 'test_concorde_part',
    malliId: 'concorde',
    tyyppi: 'moottori',
    hinta: 10
  }]

  const ostoRes = suoritaToiminto(state, 'buy-part', { partId: 'test_concorde_part' }, Date.now())
  assert.equal(ostoRes.success, false, 'Tasolla 1 ei saa pystyä ostamaan Concorden osaa')

  // Yritetään rakentaa Concorde tasolla 1
  state.omistetutOsat = [
    { malliId: 'concorde', tyyppi: 'moottori' },
    { malliId: 'concorde', tyyppi: 'runko' },
    { malliId: 'concorde', tyyppi: 'siivet' }
  ]
  const buildRes = suoritaToiminto(state, 'build-plane', { malliId: 'concorde' }, Date.now())
  assert.equal(buildRes.success, false, 'Tasolla 1 ei saa pystyä rakentamaan Concordea')

  // Nostetaan pelaajan taso Concorden vaatimalle tasolle (14)
  state.taso = 14
  const buildRes2 = suoritaToiminto(state, 'build-plane', { malliId: 'concorde' }, Date.now())
  assert.equal(buildRes2.success, true, 'Tasolla 14 Concorden rakentamisen tulee onnistua')
})

test('Uudet Euroopan lentokentät ja välitason lentokoneet', async () => {
  const { kenttaKoordinaatit, alkuperaisetOstettavatKentat, rakennettavatMallit, malliOsanPerushinnat, haeEtaisyys } = await import('../game/gameData')

  const uudetKentat = ['Amsterdam', 'Varsova', 'Praha', 'Wien', 'Rooma', 'Madrid']
  for (const kNimi of uudetKentat) {
    assert.ok(kenttaKoordinaatit[kNimi], `Koordinaatit puuttuvat kentältä: ${kNimi}`)
    assert.ok(alkuperaisetOstettavatKentat.some(k => k.nimi === kNimi), `Kenttä puuttuu ostettavista kentistä: ${kNimi}`)
    const etaisyysHki = haeEtaisyys('Helsinki', kNimi)
    assert.ok(etaisyysHki > 0, `Etäisyyden Helsingistä kentälle ${kNimi} tulee olla positiivinen`)
  }

  const uudetKoneet = ['atr42', 'dash8', 'bae146', 'a220']
  for (const malliId of uudetKoneet) {
    const malli = rakennettavatMallit.find(m => m.malliId === malliId)
    assert.ok(malli, `Uutta lentokonemallia ${malliId} ei löydy rakennettavista malleista`)
    assert.ok((malli.vaadittuTaso || 1) >= 6 && (malli.vaadittuTaso || 1) <= 12, `Koneen ${malliId} tasovaatimuksen tulee olla 6-12 välillä`)
    assert.ok(malliOsanPerushinnat[malliId] > 0, `Koneelle ${malliId} tulee olla osan perushinta`)
  }
})

