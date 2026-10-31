-- Události (2026-10-31): co trenér zvolil. Bez toho stránka po obnovení ukazovala
-- výchozí efekty šablony místo toho, co se opravdu stalo.
-- Hodnoty: id volby | 'missed' (propadlo, trenér nerozhodl včas nebo stránku otevřel pozdě).
ALTER TABLE seasonal_events ADD COLUMN chosen_choice_id TEXT;
