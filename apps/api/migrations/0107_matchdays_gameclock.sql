-- Rozšíření CHECK na match_day (pondělí/čtvrtek pro ligu, sobota pro pohár) — přestavba tabulky.
-- (Na testu už aplikováno; pro prod je zde záznam.)

-- Globální herní hodiny: jeden datum pro celou hru, herní den = reálný den + offset (násobek 7 → den v týdnu sedí).
CREATE TABLE IF NOT EXISTS game_clock (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  offset_days INTEGER NOT NULL
);
