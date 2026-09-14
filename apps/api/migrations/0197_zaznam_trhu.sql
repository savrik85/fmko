-- Kdo se na trhu objevil a odkud přišel
--
-- Vznik hráče se nikde nezapisoval. Řádek ve `free_agents` po podpisu nebo
-- vypršení zmizí, takže z databáze nešlo zjistit, kolik lidí hra za týden
-- doopravdy stvořila. Odhad z toho, co v poolu zbylo, je nesmysl: v okrese
-- s hodně manažery se hráči podepíšou dřív, než se na ně někdo podívá.
--
-- Tohle je záznam vstupů na trh. Nic nemaže, nic nepřepisuje, jen si píše,
-- že se někdo objevil a odkud. Rozlišuje dvě věci, které se nesmí míchat:
--   * `generated` a `celebrity` — nové tělo, které hra vytvořila
--   * `released` — hráč, co už existoval a pustil ho klub
--
-- `from_human` říká, jestli ten klub řídí živý trenér. Bez toho by se
-- vyhazov od AI tvářil stejně jako vyhazov od manažera.

CREATE TABLE IF NOT EXISTS market_log (
  id          TEXT PRIMARY KEY,
  district    TEXT,
  -- generated | celebrity | released
  origin      TEXT NOT NULL,
  -- Klub, který hráče pustil. NULL u těch, co vytvořila hra.
  team_id     TEXT,
  from_human  INTEGER NOT NULL DEFAULT 0,
  game_date   TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- Přehled se čte po dnech a okresech, jiný dotaz nad tím nebude.
CREATE INDEX IF NOT EXISTS idx_market_log_den ON market_log(created_at, district);
