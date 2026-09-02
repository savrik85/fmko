-- 0181: Obsazovací listina a pozastavení rozhodčího — pravomoci komisaře rozhodčích.
--
-- Aplikovat MANUÁLNĚ, PŘED nasazením kódu:
--   npx wrangler d1 execute prales-db-test --remote --file apps/api/migrations/0181_obsazovaci_listina_komisare.sql
--
-- Kontext: komisař uměl jen vyškrtnout sudího z listiny na celou sezónu, což je
-- atomovka, kterou nikdo nepoužije. Dostává dvě mírnější pravomoci — nominovat
-- sudí pro kolo (párování dál losuje systém, aby nešlo namířit sudího na soupeře)
-- a pozastavit sudího na tři kola.
--
-- Listina okresu se zároveň v kódu rozšiřuje z 15 na 24 sudích. Migrace se toho
-- netýká: pool se doplní sám při první delegaci (`ensureReferees`), stávající
-- patnáctce se ID nemění.

-- ── Obsazovací listina kola ─────────────────────────────────────────────────
-- Kdo z okresní listiny smí v tomhle kole pískat. Když pro kolo není ani jeden
-- řádek, deleguje se ze všech jako dosud — komisař nic nezablokuje tím, že se
-- na to vykašle.
--
-- Váže se na calendar_id, ne na game_week: kolo je jednotka kalendáře a ID je
-- přesně to, s čím pracuje delegace.
CREATE TABLE IF NOT EXISTS competition_referee_nominations (
  id                TEXT PRIMARY KEY,
  league_id         TEXT NOT NULL,
  calendar_id       TEXT NOT NULL,
  referee_id        TEXT NOT NULL,
  season_number     INTEGER NOT NULL,
  nominated_by_team TEXT NOT NULL,
  game_date         TEXT NOT NULL,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  -- Dvakrát nominovaný sudí by v losu měl dvojnásobnou šanci.
  UNIQUE(calendar_id, referee_id)
);
CREATE INDEX IF NOT EXISTS idx_comp_refnom_cal
  ON competition_referee_nominations(calendar_id);
CREATE INDEX IF NOT EXISTS idx_comp_refnom_league
  ON competition_referee_nominations(league_id, season_number);

-- ── Pozastavení rozhodčího ──────────────────────────────────────────────────
-- Mírnější nástroj než vyškrtnutí: sudí vypadne z delegace na tři kola a pak se
-- vrátí sám. Nemá UNIQUE na (soutěž, sudí, sezóna) schválně — týž sudí smí
-- dostat stopku víckrát za sezónu, jen ne souběžně (hlídá kód).
--
-- until_week je VČETNĚ: stopka od 5. kola na tři kola má from_week 5, until_week 7.
CREATE TABLE IF NOT EXISTS competition_referee_suspensions (
  id                TEXT PRIMARY KEY,
  league_id         TEXT NOT NULL,
  referee_id        TEXT NOT NULL,
  season_number     INTEGER NOT NULL,
  from_week         INTEGER NOT NULL,
  until_week        INTEGER NOT NULL,
  reason            TEXT NOT NULL DEFAULT '',
  issued_by_team_id TEXT,
  game_date         TEXT NOT NULL,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_comp_refsusp_league
  ON competition_referee_suspensions(league_id, season_number, until_week);
CREATE INDEX IF NOT EXISTS idx_comp_refsusp_ref
  ON competition_referee_suspensions(referee_id, season_number);

-- ── Počítadlo stopek ────────────────────────────────────────────────────────
-- Vlastní sloupec, ne sdílený used_suspend: ten čerpá prezident, když pozastavuje
-- pravomoc předsedovi, a prezident zároveň zastupuje neobsazenou komisi rozhodčích.
-- Na jednom počítadle by si ty dvě pravomoci ujídaly navzájem.
ALTER TABLE competition_officials ADD COLUMN used_ref_pause INTEGER NOT NULL DEFAULT 0;
