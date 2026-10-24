-- Přáteláky s podmínkami: konkrétní den, místo, kdo platí náklady, sázka o peníze.
-- Výzva i veřejná nabídka termínu se domlouvají na den; v ten den nesmí mít žádný
-- z týmů jiný zápas. Sázku si při přijetí obě strany složí, vítěz bere obě.
ALTER TABLE challenges ADD COLUMN match_date TEXT;
-- 'challenger' = hraje se u vyzyvatele, 'opponent' = u vyzvaného, 'neutral' = obecní hřiště napůl cesty
ALTER TABLE challenges ADD COLUMN venue TEXT NOT NULL DEFAULT 'challenger';
ALTER TABLE challenges ADD COLUMN neutral_village_id TEXT;
-- 'each' = každý platí své, 'challenger' = vyzyvatel platí náklady za oba
ALTER TABLE challenges ADD COLUMN cost_payer TEXT NOT NULL DEFAULT 'each';
ALTER TABLE challenges ADD COLUMN stake INTEGER NOT NULL DEFAULT 0;
-- NULL = bez sázky nebo ještě nesloženo, 'held' = složeno při přijetí, 'paid' = vyplaceno, 'refunded' = vráceno
ALTER TABLE challenges ADD COLUMN stake_status TEXT;
ALTER TABLE challenges ADD COLUMN offer_id TEXT;
ALTER TABLE challenges ADD COLUMN cancel_reason TEXT;
ALTER TABLE challenges ADD COLUMN resolved_at TEXT;
CREATE INDEX IF NOT EXISTS idx_challenges_match_date ON challenges(match_date);
CREATE INDEX IF NOT EXISTS idx_challenges_match ON challenges(match_id);

-- Veřejná nabídka: „ten den mám volno a chci hrát". Kdo ji vezme, je soupeř.
-- Pohled je z klubu, který nabídku vypsal: 'poster' = hraje se u něj, 'taker' = u toho, kdo ji vezme.
CREATE TABLE IF NOT EXISTS friendly_offers (
  id               TEXT PRIMARY KEY,
  team_id          TEXT NOT NULL,
  match_date       TEXT NOT NULL,
  venue            TEXT NOT NULL DEFAULT 'poster' CHECK (venue IN ('poster', 'taker', 'neutral')),
  cost_payer       TEXT NOT NULL DEFAULT 'each' CHECK (cost_payer IN ('each', 'poster')),
  stake            INTEGER NOT NULL DEFAULT 0,
  message          TEXT,
  status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'taken', 'withdrawn', 'expired')),
  challenge_id     TEXT,
  taken_by_team_id TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  resolved_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_friendly_offers_open ON friendly_offers(status, match_date);
CREATE INDEX IF NOT EXISTS idx_friendly_offers_team ON friendly_offers(team_id, status);
