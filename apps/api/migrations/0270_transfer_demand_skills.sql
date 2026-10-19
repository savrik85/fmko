-- Poptávka manažera může chtít konkrétní dovednosti (2026-10-19): JSON {"speed": 60, "heading": 55}.
-- Nejnižší hodnocení drží už sloupec min_rating (u klubů mimo hru skrytý, u manažera viditelný).
ALTER TABLE transfer_demands ADD COLUMN skill_mins TEXT;
