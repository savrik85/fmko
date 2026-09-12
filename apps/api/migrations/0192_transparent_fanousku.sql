-- Transparent si píšou fanoušci
--
-- Nápis v kotli dosud psal manažer (`stadiums.ultras_text`). Když ho ale drží
-- v rukou kotel, má odpovídat tomu, jak jim zrovna je: naštvaná parta nenapíše
-- „děkujeme". Přepínač nechává obojí, protože vlastní nápis je zároveň kus
-- přizpůsobení stadionu, o který nikdo nechce přijít.
--
-- Text vybírá `engine/fan-banner.ts` deterministicky ze stavu part. Žádná AI:
-- heslo musí být PRAVDIVÉ vzhledem k tomu, co se v klubu děje, a to se dá
-- zaručit jen tak, že je každé vázané na konkrétní podmínku.

ALTER TABLE stadiums ADD COLUMN ultras_text_mode TEXT NOT NULL DEFAULT 'vlastni';
-- Proč tam zrovna tohle visí. Ukazuje se u nápisu, aby bylo vidět, že to není náhoda.
ALTER TABLE stadiums ADD COLUMN ultras_text_duvod TEXT;
