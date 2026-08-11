-- Obohacení rozhlasu: víc hlášek napříč událostmi, v duchu okresního Pralesa.
--
-- Součástí jsou i tagy, které vznikly s přepracováním standardek a dosud pro ně
-- žádná šablona nebyla: zahozená a chycená penalta jsou události typu "chance",
-- takže bez vlastních řádků by u nich rozhlas hlásil obecné "pálí vedle".

INSERT INTO commentary_templates (event_type, template, tags, district) VALUES
  -- ── Zahozená a chycená penalta ───────────────────────────────────────────
  ('chance', 'PENALTA VEDLE! {player} to poslal někam k parkovišti. Ticho jak v kostele.', '["penalty_missed"]', NULL),
  ('chance', '{player} penaltu zahodil! Drží se za hlavu a nejradši by se propadl.', '["penalty_missed"]', NULL),
  ('chance', 'Penalta mimo! {player} trefil všechno kromě brány. Tohle mu budou připomínat do konce sezóny.', '["penalty_missed"]', NULL),
  ('chance', '{player} přestřelil penaltu. Z hospody se ozvalo něco, co se nedá vysílat.', '["penalty_missed"]', NULL),
  ('chance', 'Penalta nad břevno! {player} si právě zajistil místo v kronice — bohužel v té špatné rubrice.', '["penalty_missed"]', NULL),
  ('chance', 'BRANKÁŘ CHYTIL PENALTU! {player} nevěřícně kouká. {crowd_reaction}', '["penalty_saved"]', NULL),
  ('chance', 'Penalta zneškodněna! Gólman si sedl na správnou stranu a {player} zůstal stát jak solný sloup.', '["penalty_saved"]', NULL),
  ('chance', '{player} kopal penaltu doprostřed a brankář zůstal stát. Někdy je lenost výhoda.', '["penalty_saved"]', NULL),
  ('chance', 'Chycená penalta! {player} to trefil čistě, ale gólman byl dneska v laufu.', '["penalty_saved"]', NULL),

  -- ── Neproměněný přímý kop ────────────────────────────────────────────────
  ('chance', '{player} pálí přímák do zdi. Zeď má radost, my méně.', '["freekick_missed"]', NULL),
  ('chance', 'Přímý kop {player} letí nad břevno směrem k lesu. Balon hledají dobrovolníci.', '["freekick_missed"]', NULL),
  ('chance', '{player} to zkusil zpoza vápna — brankář vyrazil na roh. Slušný pokus.', '["freekick_missed"]', NULL),
  ('chance', 'Přímák {player} mine tyč o kus. Kolem branky proletěla i jedna vrána.', '["freekick_missed"]', NULL),
  ('chance', '{player} si přímák rozmyslel a poslal ho do zdi. Trenér si sedá na lavičku.', '["freekick_missed"]', NULL),

  -- ── Hlavička po centru, která neskončila gólem ───────────────────────────
  ('chance', '{player} se ve vápně vytáhl výš než ostatní, ale hlavička jde vedle.', '["header_missed"]', NULL),
  ('chance', 'Hlavička {player} po centru — brankář vytahuje zázrak!', '["header_missed"]', NULL),
  ('chance', '{player} hlavičkuje nad. Ve vápně to vypadalo jak fronta na klobásu.', '["header_missed"]', NULL),
  ('chance', 'Po rohu se {player} dostal k hlavičce, ale trefil jen vzduch a záda spoluhráče.', '["header_missed"]', NULL),

  -- ── Góly ─────────────────────────────────────────────────────────────────
  ('goal', 'GÓÓÓL! {player} to napálil tak, že se otřásla i tabule s reklamou na pneuservis!', '[]', NULL),
  ('goal', '{player} skóruje na {score}! Hospodský rovnou natáčí rundu, ještě než se doběhne oslavovat.', '[]', NULL),
  ('goal', 'A je to tam! {player} se prosadil a děda u plotu spokojeně kývl. To se jen tak nevidí.', '[]', NULL),
  ('goal', '{player} zavěsil! Balon skončil v síti a tři fanoušci vstali z lehátek.', '[]', NULL),
  ('goal', 'GÓL! {player} to trefil poprvé za celý zápas — a stačilo to. {crowd_reaction}', '[]', NULL),
  ('goal', '{player} dává na {score}. Někdo na tribuně křičí, že to bylo z ofsajdu. Nebylo.', '[]', NULL),
  ('goal', 'Krásná akce zakončená {player}! Tohle by nebyla ostuda ani o dvě soutěže výš.', '[]', NULL),
  ('goal', '{player} skóruje a hned ukazuje na spoluhráče. Slušnost, nebo alibi?', '[]', NULL),
  ('goal', 'GÓL! {player} propálil brankáře skrz. Ten se teď dlouho bude dívat do trávy.', '[]', NULL),
  ('goal', '{player} to tam dorazil z půl metru. Krása to nebyla, do tabulky se počítá stejně.', '[]', NULL),
  ('goal', 'Balon v síti! {player} slaví u rohového praporku, kde už na něj čeká celá lavička.', '[]', NULL),
  ('goal', '{player} zvyšuje na {score}. Rozhlas hlásí gól a zároveň prosí majitele modré felicie o přeparkování.', '[]', NULL),
  ('goal', 'GÓL! {player} zakončil tak čistě, že se i soupeřův obránce uznale ušklíbl.', '[]', NULL),
  ('goal', '{player} skóruje! Na tribuně vyskočil pes a rozštěkal celou vesnici.', '[]', NULL),
  ('goal', 'A padá gól! {player} si počkal na svou chvíli a nezaváhal. {crowd_reaction}', '[]', NULL),

  -- ── Neproměněné šance ────────────────────────────────────────────────────
  ('chance', '{player} pálí do brankáře. Ten ani nemusel uhnout, jen nastavil břicho.', '[]', NULL),
  ('chance', 'Šance pro {player} — a balon letí do kopřiv za brankou. Nikdo se pro něj nehrne.', '[]', NULL),
  ('chance', '{player} to trefil skvěle, jenže o metr vedle. Fotbal je krutý.', '[]', NULL),
  ('chance', 'Obrovská příležitost! {player} zaváhal o vteřinu dýl, než měl.', '[]', NULL),
  ('chance', '{player} vypálil z dvaceti metrů — a trefil rozhodčího u lajny. Ten to nesl statečně.', '[]', NULL),
  ('chance', 'Sólo {player} končí střelou vedle. Sprint byl hezčí než zakončení.', '[]', NULL),
  ('chance', '{player} má gól na kopačce a poslal to do nebe. Nad hřištěm zakroužil čáp.', '[]', NULL),
  ('chance', 'Brankář vyrazil ránu {player} nohou. Ani sám neví jak.', '[]', NULL),
  ('chance', '{player} se dostal do vápna, ale zakončení mělo daleko k učebnici.', '[]', NULL),
  ('chance', 'Tutovka! {player} to poslal nad z pěti metrů a teď se dívá do trávy, jako by za to mohla.', '[]', NULL),

  -- ── Fauly ────────────────────────────────────────────────────────────────
  ('foul', '{player} přišel pozdě do souboje. O půl minuty, řekl bych.', '[]', NULL),
  ('foul', 'Faul {player}! Rozhodčí píská a mimoděk se podívá, jestli je sanitka na místě.', '[]', NULL),
  ('foul', '{player} soupeře jen tak lehce postrčil. Do zádové části. Oběma rukama.', '[]', NULL),
  ('foul', 'Zákrok {player} vypadal spíš na házenou. Rozhodčí to řešit musí.', '[]', NULL),
  ('foul', '{player} fauluje a hned zvedá ruce, že nic. Klasika.', '[]', NULL),
  ('foul', 'Šlápnutí od {player}. Kopačky s kolíky si dneska vybírají daň.', '[]', NULL),
  ('foul', '{player} zastavil útok tak, jak to na okrese chodí — tělem.', '[]', NULL),
  ('foul', 'Faul {player} u lajny. Z tribuny se ozývá dobře míněná rada, ať se hraje na míč.', '[]', NULL),

  -- ── Karty ────────────────────────────────────────────────────────────────
  ('card', 'Žlutá pro {player}. Trenér na lavičce zavírá oči a počítá do deseti.', '[]', NULL),
  ('card', '{player} dostal žlutou a rovnou se jde omluvit. To se dneska už nenosí.', '[]', NULL),
  ('card', 'Karta pro {player}! Z vedlejšího hřiště přiběhli dva diváci, aby to viděli.', '[]', NULL),
  ('card', 'ČERVENÁ pro {player}! Cestou do kabin ještě něco zabručel. Radši to nebudeme opakovat.', '[]', NULL),
  ('card', '{player} má žlutou a od teď hraje jak v porcelánu.', '[]', NULL),
  ('card', 'Žlutá pro {player} za nesportovní chování. Rozhodčí má dneska pevnou ruku.', '[]', NULL),
  ('card', '{player} viděl červenou. Manželka na tribuně jen kroutí hlavou — zase bude doma dřív.', '[]', NULL),

  -- ── Zranění ──────────────────────────────────────────────────────────────
  ('injury', '{player} leží na zemi. Masér už běží, i když má v ruce jen sprej a naději.', '[]', NULL),
  ('injury', '{player} se drží za sval. Vypadá to na týden ledu a měsíc výmluv.', '[]', NULL),
  ('injury', 'Zranění {player}! Na hřiště vbíhá pomoc, tedy pán s kufříkem a kolegou.', '[]', NULL),
  ('injury', '{player} kulhá ke střídačce. Dohrát chce, ale tělo hlasuje proti.', '[]', NULL),
  ('injury', '{player} to schytal do kotníku. Kolem něj se sešel hlouček odborníků z tribuny.', '[]', NULL),
  ('injury', 'Křeče u {player}! Spoluhráči mu narovnávají nohu, on jen syčí.', '[]', NULL),

  -- ── Střídání ─────────────────────────────────────────────────────────────
  ('substitution', 'Střídá {player}. Rozcvičoval se od poločasu, tak ať to stojí za to.', '[]', NULL),
  ('substitution', '{player} přichází na hřiště a cestou si stahuje štulpny. Připraven jak hasič.', '[]', NULL),
  ('substitution', 'Změna v sestavě — {player} jde do hry a trenér mu ještě něco křičí do ucha.', '[]', NULL),
  ('substitution', '{player} naskakuje. Na lavičce zůstala jedna deka a dvě zklamání.', '[]', NULL),
  ('substitution', 'Střídání: {player}. Odcházející hráč dostal potlesk od obou babiček u plotu.', '[]', NULL),

  -- ── Držení míče a atmosféra ──────────────────────────────────────────────
  ('special', '{team} si míč posílají dozadu. Divákům to nevadí, mají pivo.', '["possession"]', NULL),
  ('special', '{player} rozehrává a rozhlíží se, jako by hledal někoho známého.', '["possession"]', NULL),
  ('special', 'Hra se přelévá ze strany na stranu. Rozhodčí si mezitím upravuje ponožky.', '["possession"]', NULL),
  ('special', '{team} zpomalují tempo. Někdo z lavičky křičí, ať to nekomplikují.', '["possession"]', NULL),
  ('special', '{player} si míč přišlápl a přemýšlí. Přemýšlení trvá o vteřinu dýl, než by mělo.', '["possession"]', NULL),
  ('special', 'Klid na kopačkách {team}. Na tribuně klid na lavičkách.', '["possession"]', NULL),
  ('special', '{team} kombinují po zemi. Nezvyk, ale sluší jim to.', '["possession"]', NULL),
  ('special', 'Dlouhý nákop od {player} — a hlavou pryč. Klasický okresní volejbal.', '["possession"]', NULL),
  ('special', '{player} si to vede po lajně, kde ho slovně doprovází pán s termoskou.', '["possession"]', NULL),
  ('special', 'Míč šel do autu a stoper ho hodil rovnou vedoucímu. Ten ho podal zpátky. Souhra.', '["possession"]', NULL),

  -- ── Brankářské zákroky a bloky ───────────────────────────────────────────
  ('special', '{player} vytáhl zákrok, který si zaslouží víc diváků, než jich tu je.', '["save"]', NULL),
  ('special', 'Brankář {player} sbírá míč a hned ho posílá dopředu. Chce hrát rychle, na rozdíl od zbytku týmu.', '["save"]', NULL),
  ('special', '{player} zblokoval střelu vlastním tělem. Zítra to bude modré, dneska je to hrdinství.', '["block"]', NULL),
  ('special', 'Skluz {player} v poslední chvíli! Trávník za to zaplatil.', '["block"]', NULL);
