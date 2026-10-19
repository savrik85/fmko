-- Klub mimo hru, od kterého hráč přišel (2026-10-19). Přehled přestupů hledal „odkud“ jen podle
-- předchozí smlouvy ve hře; klub mimo hru (inzerát na trhu, skaut) žádnou nemá, takže web psal
-- „Volný hráč“. Nové nákupy jméno klubu zapíšou rovnou (transfers/virtual-purchase.ts), staré se
-- doplní jednorázově z popisu transakce „Přestup: Jméno Příjmení z Klub“.
ALTER TABLE player_contracts ADD COLUMN from_club_name TEXT;
