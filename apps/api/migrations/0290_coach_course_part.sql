-- Trenérská škola: kurz vlastnosti má díly s vlastními skripty a otázkami.
-- NULL = kurz z doby před díly, počítá se jako 1. díl.
ALTER TABLE coach_courses ADD COLUMN part INTEGER;
