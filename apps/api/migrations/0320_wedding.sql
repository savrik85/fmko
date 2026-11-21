-- Svatba v kabině (F3, plán docs/superpowers/plans/2026-11-20-winter-features-roadmap.md).
-- Svatba hráče má datum, často pátek před zápasem. Trenér na pozvánku odpoví vlastními slovy:
-- přijde (a pohlídá kluky), pošle dar, nebo klukům pít zakáže. Řádek drží rozhodnutí a zámky
-- jednotlivých kroků, ať opakovaný běh nedá dvojí dar, dvojí kocovinu ani dvojí SMS.
CREATE TABLE IF NOT EXISTS weddings (
  -- Stejné id jako situace svatba_spoluhrace v club_incidents.
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  -- Ženich.
  player_id TEXT NOT NULL,
  season_number INTEGER,
  -- YYYY-MM-DD herního dne, kdy hráč svatbu ohlásil.
  announced_on TEXT NOT NULL,
  -- YYYY-MM-DD herního dne svatby.
  wedding_date TEXT NOT NULL,
  -- YYYY-MM-DD zápasu den po svatbě, NULL když se druhý den nehraje.
  match_date TEXT,
  -- attend | gift | ban | none (nikdo neodpověděl). NULL = ještě se nerozhodlo.
  choice TEXT,
  gift_amount INTEGER,
  -- coach | ai | ai_fallback | default
  decided_by TEXT,
  decided_at TEXT,
  -- Trenérova slova, jak je napsal (zkrácená).
  coach_quote TEXT,
  gift_paid_at TEXT,
  -- Kocovina v sestavě: JSON pole hráčů, kterým se zapsala absence na zápas po svatbě.
  hangover_absent TEXT,
  hangover_written_at TEXT,
  -- Den po svatbě: kondice pijáků, vztah ženicha, poděkování.
  settled_at TEXT,
  -- Článek ve Zpravodaji a SMS od Redakce Zpravodaje (hodinový běh Telefonu).
  article_at TEXT,
  news_id TEXT,
  photo_key TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_weddings_team ON weddings(team_id, wedding_date);
CREATE INDEX IF NOT EXISTS idx_weddings_open ON weddings(settled_at, wedding_date);
CREATE INDEX IF NOT EXISTS idx_weddings_article ON weddings(article_at, settled_at);
