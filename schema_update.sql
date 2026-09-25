-- schema_update.sql
-- Voit ajaa tämän skriptin Supabasen SQL Editorissa lisätäksesi tulostaululle laajennetut sarakkeet
-- ja päivittääksesi kaikkien olemassa olevien pelaajien tiedot suoraan pelitallennuksista.

-- 1. Lisätään puuttuvat sarakkeet leaderboard-tauluun
ALTER TABLE public.leaderboard
ADD COLUMN IF NOT EXISTS lentokoneet INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS lennot INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS matkustajat INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS kentat INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS taso INTEGER DEFAULT 1;

-- 2. Varmistetaan RLS-käytännöt (poistetaan vanhat ensin, jotta skripti voidaan ajaa useasti ilman virheitä)
ALTER TABLE public.leaderboard ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Julkinen lukuoikeus tulostauluun" ON public.leaderboard;
CREATE POLICY "Julkinen lukuoikeus tulostauluun" 
ON public.leaderboard 
FOR SELECT 
USING (true);

DROP POLICY IF EXISTS "Oman tuloksen päivitys tulostauluun" ON public.leaderboard;
CREATE POLICY "Oman tuloksen päivitys tulostauluun" 
ON public.leaderboard 
FOR ALL 
TO authenticated 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

-- 3. Päivitetään nykyisten pelaajien taso, lentokoneet, lennot, matkustajat ja kentät tallennuksista (game_saves)
UPDATE public.leaderboard l
SET 
  taso = GREATEST(1, COALESCE((gs.game_state::jsonb->>'taso')::integer, 1)),
  lentokoneet = COALESCE(jsonb_array_length(COALESCE(gs.game_state::jsonb->'lentokoneet', '[]'::jsonb)), 0),
  lennot = COALESCE((gs.game_state::jsonb->'tilastot'->>'tehdytLennot')::integer, 0),
  matkustajat = COALESCE((gs.game_state::jsonb->'tilastot'->>'kuljetutMatkustajat')::integer, 0),
  kentat = COALESCE((SELECT count(*) FROM jsonb_object_keys(COALESCE(gs.game_state::jsonb->'avatutKentat', '{}'::jsonb))), 0),
  updated_at = NOW()
FROM public.game_saves gs
WHERE l.user_id = gs.user_id;

-- 4. Lisätään leaderboardiin myös ne pelaajat, joilla on tallennus mutta ei vielä riviä leaderboardissa
INSERT INTO public.leaderboard (user_id, pelaajan_nimi, rahat, kulta, lentokoneet, lennot, matkustajat, kentat, taso, updated_at)
SELECT 
  gs.user_id,
  COALESCE(p.username, gs.game_state::jsonb->>'pelaajanNimi', 'Pelaaja'),
  COALESCE((gs.game_state::jsonb->>'rahat')::integer, 0),
  COALESCE((gs.game_state::jsonb->>'kulta')::integer, 0),
  COALESCE(jsonb_array_length(COALESCE(gs.game_state::jsonb->'lentokoneet', '[]'::jsonb)), 0),
  COALESCE((gs.game_state::jsonb->'tilastot'->>'tehdytLennot')::integer, 0),
  COALESCE((gs.game_state::jsonb->'tilastot'->>'kuljetutMatkustajat')::integer, 0),
  COALESCE((SELECT count(*) FROM jsonb_object_keys(COALESCE(gs.game_state::jsonb->'avatutKentat', '{}'::jsonb))), 0),
  GREATEST(1, COALESCE((gs.game_state::jsonb->>'taso')::integer, 1)),
  NOW()
FROM public.game_saves gs
LEFT JOIN public.profiles p ON p.id = gs.user_id
ON CONFLICT (user_id) DO UPDATE SET
  pelaajan_nimi = EXCLUDED.pelaajan_nimi,
  rahat = EXCLUDED.rahat,
  kulta = EXCLUDED.kulta,
  lentokoneet = EXCLUDED.lentokoneet,
  lennot = EXCLUDED.lennot,
  matkustajat = EXCLUDED.matkustajat,
  kentat = EXCLUDED.kentat,
  taso = EXCLUDED.taso,
  updated_at = NOW();
