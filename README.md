# Pocket Planes Klooni ✈️

Server-authoritative selainpeli, jossa backend (Node.js/Express + TypeScript) vastaa täysin pelitilasta, lentojen saapumisajoista, matkustajien ja osien generoimisesta sekä talouden säännöistä. Frontend on rakennettu Vue 3:lla ja Vitellä.

---

## 🏗️ Arkkitehtuuri

- **Backend (`server/`)**: Express-palvelin, joka sisältää authoritative-pelimoottorin (`gameEngine.ts`). Kaikki toiminnot (lentojen lähettäminen, kenttien osto, koneiden rakennus jne.) validoidaan ja suoritetaan palvelimella.
- **Aikaperusteinen simulaatio**: Lennot etenevät oikean ajan (`Date.now()`) mukaan, joten pelaaja kerryttää tuotot myös offline-tilassa luotettavasti.
- **Tietokanta & Auth**: Supabase Auth ja PostgreSQL (`game_saves`, `profiles`, `leaderboard`).
- **Render.com -valmius**: Sama palvelinprosessi tarjoilee sekä `/api`-reitit että käännetyn frontendin (`dist/`).

---

## 🚀 Paikallinen kehitys (Local Dev)

1. **Asenna riippuvuudet**:
   ```bash
   npm install
   ```

2. **Ympäristömuuttujat (`.env`)**:
   Kopioi tarvittaessa `.env.example`:
   ```bash
   cp .env.example .env
   ```

3. **Käynnistä kehitysympäristö (Backend + Frontend)**:
   ```bash
   npm run dev
   ```
   Tämä käynnistää rinnakkain:
   - Backend API: `http://localhost:3001`
   - Vite Frontend (HMR): `http://localhost:5173`

4. **Aja testit**:
   ```bash
   npm test
   ```

---

## 🌐 Julkaisu Render.comissa

Peli on konfiguroitu toimimaan Renderissä yhtenä ainoana Web Servicenä (ilmais- tai maksullisella tasolla).

### Vaihtoehto A: Render Blueprint (`render.yaml`)
1. Kirjaudu [Render.comiin](https://render.com).
2. Valitse **New +** -> **Blueprint**.
3. Yhdistä tämä GitHub-repository. Render lukee `render.yaml` -tiedoston ja luo palvelun automaattisesti.

### Vaihtoehto B: Manuaalinen Web Service
1. Luo Renderissä **New +** -> **Web Service**.
2. Yhdistä GitHub-repositorio.
3. Aseta asetukset:
   - **Name**: `pocketplanes` (tai haluamasi)
   - **Runtime**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
4. Lisää ympäristömuuttujat (**Environment Variables**):
   - `NODE_ENV`: `production`
   - `SUPABASE_URL`: `https://xalwsdeeujyhoqygcoul.supabase.co`
   - `SUPABASE_ANON_KEY`: `sb_publishable_r6j0Nf2Y0ndCMqZyzgtVVQ_J1OKjsCv`
   - *(Valinnainen)* `SUPABASE_SERVICE_ROLE_KEY`: *(Supabase-projektisi service_role secret, jos haluat ohittaa RLS:n palvelimella)*
5. Klikkaa **Deploy Web Service**!
