-- 0184: Uzavření sektoru se počítá na zápasy, ne na herní datum.
--
-- 0183 to ukládalo jako `closed_until_gd`. To je špatně ze dvou důvodů:
--   1. Trest se v disciplinárce vyslovuje v ZÁPASECH („sektor uzavřen na dvě utkání"),
--      a převod na datum vyžaduje znát rozpis — ten se ale mění (odklady, pohár).
--   2. Herní hodiny mají `game_clock.offset_days` a při přechodu sezóny se datum
--      posouvá; trest s pevným datem by buď nikdy nevypršel, nebo vypršel hned.
-- Počítadlo se snižuje po každém domácím zápase, uvnitř nároku na jeho vyhodnocení,
-- takže je odolné vůči opakovanému běhu.
--
-- Aplikovat MANUÁLNĚ:
--   npx wrangler d1 execute prales-db-test --remote --file apps/api/migrations/0184_uzavreni_sektoru_pocitadlo.sql

ALTER TABLE fan_groups ADD COLUMN closed_matches INTEGER NOT NULL DEFAULT 0;
ALTER TABLE fan_groups DROP COLUMN closed_until_gd;
