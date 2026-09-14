-- schema_update.sql
-- Voit ajaa tämän skriptin Supabasen SQL Editorissa lisätäksesi tulostaululle laajennetut sarakkeet.
-- Huom: Palvelin toimii ja tallentaa tilastot automaattisesti myös ilman tämän ajamista (hybridivälimuisti).

ALTER TABLE public.leaderboard
ADD COLUMN IF NOT EXISTS lentokoneet INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS lennot INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS matkustajat INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS kentat INTEGER DEFAULT 0;

-- Varmistetaan RLS-käytännöt:
-- Kaikki saavat lukea tulostaulua
CREATE POLICY "Julkinen lukuoikeus tulostauluun" 
ON public.leaderboard 
FOR SELECT 
USING (true);

-- Autentikoidut käyttäjät voivat lisätä ja päivittää oman rivinsä
CREATE POLICY "Oman tuloksen päivitys tulostauluun" 
ON public.leaderboard 
FOR ALL 
TO authenticated 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);
