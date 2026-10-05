-- 0247_klubovy_web_adresy_anketa.sql: staré adresy klubového webu, anketa fanoušků a fotky stadionu

-- Když klub změní adresu webu, stará adresa dál vede na jeho web. Sdílené odkazy
-- (WhatsApp, Facebook) tak po přejmenování nepřestanou fungovat.
CREATE TABLE IF NOT EXISTS team_website_slug_aliases (
  slug TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_team_website_slug_aliases_team ON team_website_slug_aliases(team_id);

-- Anketa „Jak dopadne příští zápas?“ na klubovém webu. Jeden hlas na návštěvníka
-- a zápas; návštěvník je jen otisk (hash), žádná IP adresa se neukládá.
CREATE TABLE IF NOT EXISTS team_website_poll_votes (
  team_id TEXT NOT NULL REFERENCES teams(id),
  match_id TEXT NOT NULL,
  voter TEXT NOT NULL,
  choice TEXT NOT NULL CHECK (choice IN ('win', 'draw', 'loss')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (team_id, match_id, voter)
);

-- Fotky stadionu vyfocené z 3D modelu klubu (soubory v R2 pod stadium-photo/).
-- `version` je otisk všeho, co ovlivňuje vzhled stadionu: po přestavbě, nových barvách
-- nebo sponzorech fotka neplatí a vlastníkův prohlížeč ji vyfotí znovu.
CREATE TABLE IF NOT EXISTS team_stadium_photos (
  team_id TEXT NOT NULL REFERENCES teams(id),
  viewpoint TEXT NOT NULL,
  version TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'image/webp',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (team_id, viewpoint)
);
