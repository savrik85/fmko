-- 0128: konfigurovatelny dashboard "Domu".
--
-- Proc: stranka Domu mela natvrdo zadratovane rozlozeni a kazdy manazer videl
-- to same. Ted si kazdy sklada vlastni sadu widgetu (poradi + sirka 1-3 sloupce).
--
-- Radek pro tym chybi = plati vychozi layout. Vychozi layout zamerne NENI v DB
-- (resi ho aplikace), aby se dal menit bez migrace a aby "nikdy jsem needitoval"
-- slo odlisit od "smazal jsem vsechny widgety".
--
-- Sloupec widgets je JSON pole: [{"id":"next-match","w":1}, ...]
-- Aplikovat RUCNE: nejdriv prales-db-test, pak prales-db-prod po souhlasu.

CREATE TABLE IF NOT EXISTS dashboard_layouts (
  team_id    TEXT PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
  widgets    TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
