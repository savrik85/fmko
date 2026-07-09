-- Okresová lokalizace komentáře: district sloupec (NULL = univerzální) + pražské řádky.
-- Filtr dle okresu je v kódu až při generování (engine/commentary.ts), ne při načtení.
ALTER TABLE commentary_templates ADD COLUMN district TEXT;
ALTER TABLE crowd_reactions ADD COLUMN district TEXT;
CREATE INDEX IF NOT EXISTS idx_ct_district ON commentary_templates(district);

-- ═══ Praha — komentář (přidává variety k 180 univerzálním, nenahrazuje je) ═══
INSERT INTO commentary_templates (event_type, template, tags, district) VALUES
  ('goal', 'GÓÓÓL! {player} to napálil pod břevno — tohle by slušelo i Julisce!', '[]', 'Praha'),
  ('goal', '{player} skóruje! Na Andělu by teď troubila celá tramvaj.', '[]', 'Praha'),
  ('goal', 'Paráda! {player} dává gól, jako by hrál pražské derby.', '[]', 'Praha'),
  ('chance', '{player} pálí těsně vedle — míč letěl skoro až na Vltavu.', '[]', 'Praha'),
  ('chance', '{player} zahazuje šanci. Diváci z panelákových oken kroutí hlavou.', '[]', 'Praha'),
  ('foul', 'Faul {player}a — rozhodčí to viděl líp než revizor černého pasažéra.', '[]', 'Praha'),
  ('foul', '{player} zasekl soupeře. Ostré jak ranní špička v metru.', '[]', 'Praha'),
  ('card', 'Žlutá pro {player}a. Zapsáno rychleji než pokuta za parkování v centru.', '[]', 'Praha'),
  ('card', 'Karta pro {player}a — na Barrandově by za to dali rovnou stopku.', '[]', 'Praha'),
  ('injury', '{player} zůstává ležet. Nosítka jedou pomaleji než náhradní autobus za tramvaj.', '[]', 'Praha'),
  ('substitution', 'Střídá {player}. Odchází pod potleskem, jako když přijede spoj na čas.', '[]', 'Praha'),
  ('special', '{player} drží míč, klídek jak v kavárně na Vinohradech.', '["possession"]', 'Praha'),
  ('special', '{player} si to vodí po lajně, dav u výčepu ani nedutá.', '["possession"]', 'Praha'),
  ('special', '{player} rozehrává trpělivě, jak čekání na zelenou na magistrále.', '["possession"]', 'Praha'),
  ('special', '{player} zvedl krásnou akci — hospoda u velkoplošky vyskočila.', '[]', 'Praha'),
  ('special', 'Šance střídá šanci, atmosféra jak na plné Slavii.', '[]', 'Praha');

-- ═══ Praha — reakce davu ═══
INSERT INTO crowd_reactions (text, district) VALUES
  ('Kluk s koloběžkou za plotem si dělá story na Instagram.', 'Praha'),
  ('Z hospody u hřiště se ozvalo zaburácení přes celé sídliště.', 'Praha'),
  ('Někdo pustil vuvuzelu, soused otevřel okno a zařval ať je ticho.', 'Praha'),
  ('Partička z Vinohrad skanduje, pivo v ruce.', 'Praha'),
  ('Nad hřištěm proletělo letadlo na Ruzyň, na chvíli přehlušilo dav.', 'Praha'),
  ('Fanoušci v šálách Sparty i Slavie dnes výjimečně drží spolu.', 'Praha'),
  ('Prodavač langošů zvýšil hlas, aby ho bylo přes dav slyšet.', 'Praha'),
  ('Z tramvajové zastávky za plotem tleská parta co zmeškala spoj.', 'Praha'),
  ('Diváci na provizorní tribuně dupou, konstrukce sténá.', 'Praha');
