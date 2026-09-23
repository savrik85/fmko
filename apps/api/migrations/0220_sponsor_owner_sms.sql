-- 0220: SMS od majitelů firem (docs/superpowers/plans/2026-09-23-sms-majitelu-firem.md).
-- Fronta i historie: spouštěče zapisují 'pending', doručení mění na 'awaiting',
-- odpověď na 'replied', mlčení na 'ignored' (čekala se odpověď) nebo 'closed'.
-- Aplikovat ručně PŘED nasazením kódu:
--   npx wrangler d1 execute prales-db-test --remote --file apps/api/migrations/0220_sponsor_owner_sms.sql

CREATE TABLE IF NOT EXISTS sponsor_owner_sms (
  id TEXT PRIMARY KEY,
  sponsor_id INTEGER NOT NULL REFERENCES district_sponsors(id),
  team_id TEXT NOT NULL REFERENCES teams(id),
  -- Klíč příležitosti (OWNER_SMS_OCCASIONS v sponsors/owner-sms-texts.ts).
  occasion TEXT NOT NULL,
  -- Stabilní klíč spouštěče: tatáž událost nesmí zařadit SMS dvakrát.
  reference_id TEXT NOT NULL,
  expects_reply INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','awaiting','replied','ignored','closed','dropped')),
  -- Proměnné šablony (skóre, délka série) jako JSON.
  vars TEXT NOT NULL DEFAULT '{}',
  -- Herní dny ve tvaru YYYY-MM-DD.
  created_day TEXT NOT NULL,
  deliver_by TEXT NOT NULL,
  sent_day TEXT,
  reply_by TEXT,
  conversation_id TEXT,
  body TEXT,
  reply_tone TEXT CHECK(reply_tone IS NULL OR reply_tone IN ('warm','neutral','dismissive')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_sponsor_owner_sms_ref ON sponsor_owner_sms(reference_id);
CREATE INDEX IF NOT EXISTS idx_sponsor_owner_sms_team ON sponsor_owner_sms(team_id, status);
CREATE INDEX IF NOT EXISTS idx_sponsor_owner_sms_sent ON sponsor_owner_sms(team_id, sent_day);
