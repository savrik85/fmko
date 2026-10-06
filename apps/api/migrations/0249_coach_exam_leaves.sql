-- Trenérská škola: kolikrát trenér během testu odešel z okna (jiný tab, jiná aplikace).
-- Každý odchod zkrátí čas testu (COURSE_RULES.examLeavePenaltySec).
ALTER TABLE coach_exam_attempts ADD COLUMN leaves INTEGER NOT NULL DEFAULT 0;
