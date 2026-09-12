-- Nahrávky chorálů (Suno)
--
-- Chorál dosud existoval jen jako text. Teď k němu může být zpěv, protože
-- přečtený chorál a slyšený chorál jsou dvě různé věci.
--
-- Proč dva sloupce na zvuk: Suno vrací za jednu platbu DVĚ verze a liší se.
-- Měřením čtyř nahrávek vyšlo, že podíl energie pod 120 Hz kolísá mezi 9,6 %
-- a 25,8 % při naprosto stejném zadání, tedy někdy tam prosáknou bicí a někdy
-- ne. Rozhodovat to podle spektra na workeru nejde (mp3 se tam nedekóduje),
-- takže se uloží obě a vybere si manažer uchem.
--
-- `audio_task_id` je zároveň zámek: objednává se přes
-- `UPDATE ... WHERE audio_task_id IS NULL`, aby dva běhy ticku neobjednaly
-- tutéž nahrávku dvakrát. Kredity se neúčtují za pokus, ale za generaci.

ALTER TABLE fan_chants ADD COLUMN audio_task_id TEXT;
ALTER TABLE fan_chants ADD COLUMN audio_a TEXT;
ALTER TABLE fan_chants ADD COLUMN audio_b TEXT;
-- 'a' nebo 'b'. Dokud je NULL a obě nahrávky existují, čeká se na výběr.
ALTER TABLE fan_chants ADD COLUMN audio_vybrana TEXT;
ALTER TABLE fan_chants ADD COLUMN audio_zadano_at TEXT;

-- Rozpracované objednávky, které se mají dotáhnout. Krátký seznam, čte se
-- každý tick.
CREATE INDEX IF NOT EXISTS idx_fan_chants_nahravka
  ON fan_chants(audio_task_id) WHERE audio_task_id IS NOT NULL;
