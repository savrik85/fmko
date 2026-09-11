-- 0186: Kredit na telefonu — denní limit AI odpovědí.
--
-- Trenér si může psát s kýmkoli z kádru i do kabiny, jenže každá odpověď stojí
-- volání modelu. Místo tvrdého zákazu je to kredit: vidíš, kolik ti zbývá,
-- a sám se rozhodneš, na koho ho utratíš.
--
-- Resetuje se podle HERNÍHO dne, ne reálného — jinak by hráč, co odehraje tři
-- herní dny za odpoledne, měl kredit jen na první z nich.
--
-- Aplikovat MANUÁLNĚ:
--   npx wrangler d1 execute prales-db-test --remote --file apps/api/migrations/0186_telefonni_kredit.sql

ALTER TABLE teams ADD COLUMN phone_credit INTEGER;
ALTER TABLE teams ADD COLUMN phone_credit_date TEXT;
