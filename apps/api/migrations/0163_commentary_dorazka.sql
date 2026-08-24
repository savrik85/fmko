-- Hlášky ke gólu z dorážky. Engine umí od nasazení počasí `GoalSource` "scramble",
-- ale rozhlas k tomu neměl co říct a dorážka dostávala obyčejnou gólovou hlášku.
--
-- Pozor na tag: u gólu je `detail` obsazený skóre, takže se zdroj gólu poznává podle
-- `source`. Tag proto musí být přesně "scramble" — je i v SITUATION_TAGS v commentary.ts,
-- takže tyhle řádky nikdy nepadnou na gól z penalty ani ze hry.
--
-- Variant je pět schválně: tag "scramble" je exkluzivní, takže s jedinou šablonou
-- by každá dorážka v sezóně zněla stejně (na sněhu a dešti padá ~0,8× za zápas).

INSERT INTO commentary_templates (event_type, template, tags, district) VALUES
  ('goal', 'GÓÓÓL! Brankář vyrazil před sebe a {player} byl u dorážky první! {crowd_reaction}', '["scramble"]', NULL),
  ('goal', '{player} doráží vyražený míč do odkryté branky. {minute}. minuta a je to {score}!', '["scramble"]', NULL),
  ('goal', 'Gólman míč neudržel, {player} si na něj počkal a v klidu ho dorazil do sítě.', '["scramble"]', NULL),
  ('goal', 'Kluzký míč vyklouzl brankáři z rukavic a {player} byl na správném místě. Gól!', '["scramble"]', NULL),
  ('goal', 'Brankář vyrazil, obrana koukala a {player} to z bezprostřední blízkosti dotlačil za čáru.', '["scramble"]', NULL);
