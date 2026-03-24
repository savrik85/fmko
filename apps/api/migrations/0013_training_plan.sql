-- Training plan persisted per team
ALTER TABLE teams ADD COLUMN training_type TEXT DEFAULT 'conditioning';
ALTER TABLE teams ADD COLUMN training_approach TEXT DEFAULT 'balanced';
ALTER TABLE teams ADD COLUMN training_sessions INTEGER DEFAULT 2;
ALTER TABLE teams ADD COLUMN last_training_at TEXT;
ALTER TABLE teams ADD COLUMN last_training_result TEXT;  -- JSON: {attendance, improvements}
