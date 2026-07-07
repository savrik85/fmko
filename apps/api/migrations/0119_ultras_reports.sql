-- apps/api/migrations/0119_ultras_reports.sql
-- Rubrika "Prales Ultras": idempotence + metadata galerie fotek kotlů (per liga/kolo).
CREATE TABLE IF NOT EXISTS ultras_reports (
  id            TEXT PRIMARY KEY,
  league_id     TEXT NOT NULL,
  calendar_id   TEXT,
  game_week     INTEGER NOT NULL,
  season_number INTEGER NOT NULL DEFAULT 0,
  news_id       TEXT,
  photos_json   TEXT NOT NULL DEFAULT '[]',
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE(league_id, game_week)
);
CREATE INDEX IF NOT EXISTS idx_ultras_reports_news ON ultras_reports(news_id);
