-- Zranění kotníku a třísel nešlo zapsat: v CHECK omezení je cyrilice.
--
-- Sloupec `injuries.type` má výčet povolených hodnot a jedna z nich se do schématu dostala
-- s cyrilickými znaky místo latinských:
--
--     'kotnік'   ← 'і' je U+0456 a 'к' je U+043A, obojí cyrilské
--
-- Generátor zranění měl tutéž cyrilickou variantu, takže spolu seděly, ale `cup/cup.ts`
-- mapuje popis na latinské "kotnik" — a to SQLite pokaždé odmítlo:
--     CHECK constraint failed: type IN ('sval','kotnік',...)
--
-- Zároveň se sjednocuje 'tříselný' na 'triselny': diakritika v hodnotě výčtu je zbytečná
-- past, protože se stejné slovo dá napsat několika způsoby a jeden z nich vždycky selže.
-- Popis pro hráče zůstává s diakritikou, mění se jen technická hodnota typu.
--
-- Naměřeno na produkci před opravou: za celou historii hry vznikla zranění jen dvou typů
-- (obecne 163, sval 35). Koleno, záda, hlava, žebra, achilovka, třísla, rameno ani kotník
-- se neobjevily ani jednou, přestože je generátor umí — ten se totiž vůbec nevolal.
--
-- SQLite neumí CHECK změnit, takže se tabulka staví znovu se VŠEMI sloupci, které má dnes.
-- Data se přenášejí beze změny; cyrilické hodnoty v nich nejsou (nikdy se neuložily).

CREATE TABLE injuries_nove (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id),
  team_id TEXT NOT NULL REFERENCES teams(id),
  type TEXT NOT NULL CHECK(type IN (
    'sval', 'kotnik', 'koleno', 'zada', 'hlava', 'zebra',
    'achilovka', 'triselny', 'rameno', 'obecne',
    -- Hospodské příhody: kocovina, žaludeční potíže, modřiny po rvačce. `season/pub.ts`
    -- je posílá odjakživa, jenže ve výčtu nikdy nebyly, takže se ani jedna neuložila —
    -- hráč dostal zprávu do telefonu, ale zraněný nebyl.
    'drobne', 'zazivaci_potize'
  )),
  description TEXT NOT NULL,
  severity TEXT NOT NULL CHECK(severity IN ('lehke', 'stredni', 'tezke')),
  days_remaining INTEGER NOT NULL,
  days_total INTEGER NOT NULL,
  match_id TEXT REFERENCES matches(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  is_fake INTEGER NOT NULL DEFAULT 0
);

INSERT INTO injuries_nove (id, player_id, team_id, type, description, severity,
                           days_remaining, days_total, match_id, created_at, is_fake)
SELECT id, player_id, team_id,
       -- pojistka, kdyby se přece jen nějaká cyrilická hodnota uložila
       CASE WHEN type NOT IN ('sval','kotnik','koleno','zada','hlava','zebra',
                              'achilovka','triselny','rameno','obecne',
                              'drobne','zazivaci_potize')
            THEN 'obecne' ELSE type END,
       description, severity, days_remaining, days_total, match_id, created_at, is_fake
  FROM injuries;

DROP TABLE injuries;
ALTER TABLE injuries_nove RENAME TO injuries;
