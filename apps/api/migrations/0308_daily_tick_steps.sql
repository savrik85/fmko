-- Záznam dokončených kroků denního ticku: po pádu běhu se v ticku téhož dne pokračuje
-- a kroky se záznamem (finance, trénink, opotřebení) se neprovedou podruhé.
CREATE TABLE IF NOT EXISTS daily_tick_steps (
  day TEXT NOT NULL,
  step TEXT NOT NULL,
  done_at TEXT NOT NULL,
  PRIMARY KEY (day, step)
);
