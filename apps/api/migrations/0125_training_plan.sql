-- Různý typ tréninku pro jednotlivé dny v týdnu.
--
-- Dosud měl tým jeden training_type pro všechny tréninkové dny. Nově lze každému dni
-- přiřadit vlastní typ: {"1":"conditioning","3":"tactics","5":"technique"}
-- (klíč = den v týdnu 1-5 = pondělí až pátek, hodnota = typ tréninku).
--
-- Zpětná kompatibilita: když je training_plan prázdný, platí původní chování
-- (training_type pro všechny dny z training_days).

ALTER TABLE teams ADD COLUMN training_plan TEXT;
