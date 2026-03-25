-- Komentářové šablony — v DB pro snadnou editaci
CREATE TABLE IF NOT EXISTS commentary_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,         -- goal, chance, foul, card, injury, substitution, special
  template TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',  -- JSON array of tags
  min_skill INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_ct_type ON commentary_templates(event_type);

-- Crowd reactions
CREATE TABLE IF NOT EXISTS crowd_reactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL
);

-- ═══ SEED: Crowd Reactions ═══
INSERT INTO crowd_reactions (text) VALUES
('Na tribuně se zvedla vlna nadšení — tedy oba dva diváci.'),
('Místní chlapi u piva přestali na chvíli řešit politiku.'),
('Děda Vašek se probudil a zeptal se, co se stalo.'),
('Paní Nováková zavolala z okna, ať nekřičí.'),
('Pes, co leží za brankou, zvedl hlavu.'),
('U stánku přestali točit párek v rohlíku.'),
('Na parkovišti někdo zatroubil.'),
('Šest diváků aplauduje, sedmý zapíná mobil na video.'),
('Starosta se usmívá — investice do trávníku se vyplatila.'),
('Hospodský za plotem přinesl pivo pro gólmana.'),
('Kluk na kole za brankou spadl z kola nadšením.'),
('Důchodci na lavičce konečně odložili křížovku.'),
('Z okna protějšího baráku někdo vyhodil konfety. Tedy spíš zbytky oběda.'),
('Kočka, co sedí na střídačce, se lekla.'),
('U plotu propukla debata, jestli to byl ofsajd.'),
('Hasič, co jel kolem, zastavil se podívat.'),
('Tleskání a cinkání půllitrů — to je zvuk okresního fotbalu.'),
('Prodavačka z obchodu naproti vyběhla ven.'),
('Starý hasič vedle hřiště spustil sirénu. Prý omylem.'),
('Sousedovic kluk přestal házet míčem o zeď a konečně se dívá.'),
('Maminka jednoho hráče zakřičela: ''Tak to byl můj syn!'''),
('Rozhodčí se tváří, že to viděl. Neviděl.'),
('Na střídačce spadla láhev minerálky. Větší vzrušení než celý poločas.'),
('Dva diváci se začali hádat, kdo dal gól. Třetí říká, že to byl vlastňák.'),
('Z vedlejšího hřiště přiběhly děti — prý tu je to lepší.'),
('Chlap s trakařem se zastavil u plotu. Prý jen na chvíli. Stojí tam už půl hodiny.'),
('Krávy na louce vedle hřiště přestaly žvýkat.'),
('Někdo pustil rádio s hymnou. Nikdo neví proč.'),
('Babička s nákupní taškou se zastavila: ''Co to hrajete? Volejbal?'''),
('Holubi na střeše kabin se rozletěli.');

-- ═══ SEED: Góly ═══
INSERT INTO commentary_templates (event_type, template, tags) VALUES
('goal', 'GÓÓÓL! {player} to tam napálil! {crowd_reaction}', '["epic"]'),
('goal', '{player} zakončuje a je to tam! {minute}. minuta!', '["normal"]'),
('goal', 'Parádní akce! {player} si to obhodil a uklidil to k tyči!', '["epic"]'),
('goal', '{player} hlavou po rohu — brankář jen koukal!', '["header"]'),
('goal', 'No tak {player} se trefil. Upřímně, ani on tomu nevěří.', '["funny"]'),
('goal', '{player} střílí zpoza vápna a míč se odráží do branky. Počítá se!', '["lucky"]'),
('goal', 'Gól! {player} proměňuje penaltu. Brankář skákal doprava, míč šel doleva.', '["penalty"]'),
('goal', '{player} to tam doslova dotlačil. Nebyla to krása, ale je to gól.', '["ugly"]'),
('goal', 'Bomba od {player}! To se muselo slyšet až v hospodě!', '["epic"]'),
('goal', '{player} si naběhl za obranu a s přehledem skóruje.', '["normal"]'),
('goal', 'Brankář pustil míč pod rukama a {player} to dopíchl do prázdné.', '["gk_error"]'),
('goal', '{player} to zkusil z půlky a ono to spadlo! Gól roku okresu!', '["epic","funny"]'),
('goal', 'Po rohovém kopu největší zmatek a {player} to tam nějak dostal.', '["messy"]'),
('goal', '{player} přebírá dlouhý nákop, otáčí se a pálí! Gól!', '["long_ball"]'),
('goal', '{player} překonává brankáře po zemi. Čistá práce.', '["normal"]'),
('goal', 'Lobík od {player} přes vyběhnutého brankáře — nádherný gól!', '["epic"]'),
('goal', '{player} se prosadil v šestnáctce. Kolem něj byli tři obránci, ale stejně dal gól.', '["epic"]'),
('goal', 'Gól po rychlém protiútoku! {player} to zakončil na první dotek.', '["normal"]'),
('goal', '{player} přiměl brankáře k chybě a uklidil to do sítě. Chytrý gól.', '["normal"]'),
('goal', 'Dělovka od {player}! Brankář ani nehnul rukama. To letělo jak z praku.', '["epic"]'),
('goal', '{player} se dostal k odraženému míči a napálil to pod břevno!', '["normal"]'),
('goal', 'Nečekaná střela {player} z třiceti metrů — a je to tam! {crowd_reaction}', '["epic"]'),
('goal', '{player} prostrčil míč mezi nohama obránci a pak i brankáři. Parádička!', '["epic","funny"]'),
('goal', 'Míč se odrazil od tyče zpátky do hry, {player} na dorážku — gól!', '["normal"]'),
('goal', '{player} to tam prostě hodil. Nic hezkého, ale funguje to.', '["ugly"]');

-- ═══ SEED: Šance ═══
INSERT INTO commentary_templates (event_type, template, tags) VALUES
('chance', '{player} pálí — těsně vedle! O chlup.', '["miss"]'),
('chance', 'Střela {player} — břevno! To je smůla!', '["woodwork"]'),
('chance', '{player} sám před brankářem — a brankář chytá! Výborný zákrok!', '["save"]'),
('chance', '{player} hlavičkuje — tyč! Ten zvuk se rozlehl celým hřištěm.', '["woodwork"]'),
('chance', 'Šance! {player} to trefil do brankáře z pěti metrů. To se neodpouští.', '["miss","funny"]'),
('chance', '{player} střílí — obránce blokuje na poslední chvíli!', '["block"]'),
('chance', 'Nádherná kombinace, ale {player} to na konci přestřelil.', '["miss"]'),
('chance', '{player} zkouší lob přes brankáře — míč letí nad. Škoda.', '["miss"]'),
('chance', 'Brankář vyběhl a {player} to netrefil prázdnou bránu. Nevěřím!', '["miss","funny"]'),
('chance', '{player} pálí zpoza vápna — brankář vyráží na roh.', '["save"]'),
('chance', '{player} se dostal do gólové pozice, ale míč mu ujel z nohy.', '["miss"]'),
('chance', 'Hlavička {player} — centimetry nad břevnem!', '["miss"]'),
('chance', '{player} pálí z voleje — těsně mimo! To byla paráda i tak.', '["miss"]'),
('chance', 'Brankář fantasticky zasahuje po ráně {player}! Co to bylo za zákrok!', '["save"]'),
('chance', '{player} měl prázdnou bránu, ale kopačka mu sklouzla. Smůla.', '["miss","funny"]'),
('chance', 'Centr z kraje, {player} hlavičkuje — brankář vytahuje na roh.', '["save"]'),
('chance', '{player} se protáhl přes dva obránce, ale koncovka chyběla.', '["miss"]'),
('chance', 'Parádní přihrávka na {player}, ale střela jde vysoko nad.', '["miss"]'),
('chance', '{player} zkusil nůžky! Amatérské, ale ambiciózní. Mimo.', '["miss","funny"]'),
('chance', 'Tyč! {player} se drží za hlavu. O milimetry.', '["woodwork"]');

-- ═══ SEED: Fauly ═══
INSERT INTO commentary_templates (event_type, template, tags) VALUES
('foul', '{player} sekl soupeře zezadu. Rozhodčí píská.', '["hard"]'),
('foul', 'Tvrdý zákrok {player}. To bolelo.', '["hard"]'),
('foul', '{player} podrazil protihráče. Rozhodčí to viděl.', '["normal"]'),
('foul', 'Faul na střední čáře. {player} to trochu přehnal.', '["normal"]'),
('foul', '{player} v souboji o míč trefil všechno kromě míče.', '["funny"]'),
('foul', '{player} zastavil průnik soupeře. Ne zrovna čistě.', '["normal"]'),
('foul', 'Přímý kop po faulu {player}. Soupeř se zvedá ze země.', '["normal"]'),
('foul', '{player} si spletl fotbal s hokejem. Tvrdý zásah!', '["funny"]'),
('foul', 'Zbytečný faul {player} třicet metrů od branky.', '["normal"]'),
('foul', '{player} se vrhl do skluzu — trefil hráče i míč. Rozhodčí píská.', '["hard"]'),
('foul', 'Strkanice po faulu {player}. Rozhodčí uklidňuje situaci.', '["hard"]'),
('foul', '{player} držel soupeře za dres. Tak jednoduchý faul.', '["normal"]');

-- ═══ SEED: Karty ═══
INSERT INTO commentary_templates (event_type, template, tags) VALUES
('card', 'Žlutá karta! {player} si to mohl odpustit.', '["yellow"]'),
('card', 'Rozhodčí tasí žlutou pro {player}. Přísné, ale spravedlivé.', '["yellow"]'),
('card', 'ČERVENÁ pro {player}! Do sprch! {crowd_reaction}', '["red"]'),
('card', '{player} dostává žlutou za protesty. Měl radši mlčet.', '["yellow"]'),
('card', 'Druhá žlutá a {player} jde dolů! Tým bude hrát v deseti.', '["red"]'),
('card', 'Žlutá za simulování! {player} se válel, ale rozhodčí se nenechal oblbnout.', '["yellow"]'),
('card', '{player} schytal žlutou za zdržování hry.', '["yellow"]'),
('card', 'Rozhodčí neváhá — žlutá pro {player} za brutální skluz.', '["yellow"]'),
('card', 'Rovnou červená! {player} to přehnal. Tohle nemá na hřišti co dělat.', '["red"]'),
('card', '{player} dostal žlutou. Z lavičky se ozývá: ''Za co?!''', '["yellow","funny"]'),
('card', '{player} se po žluté kartě tváří překvapeně. Jako by nevěděl.', '["yellow","funny"]'),
('card', 'Červená karta pro {player}! Trenér si drží hlavu v dlaních.', '["red"]'),
('card', '{player} žlutá. Poslední varování.', '["yellow"]'),
('card', '{player} musí z hřiště! Druhá žlutá = červená. Prchá do kabin.', '["red"]');

-- ═══ SEED: Zranění ═══
INSERT INTO commentary_templates (event_type, template, tags) VALUES
('injury', '{player} leží na zemi a drží se za nohu. Vypadá to vážně.', '["serious"]'),
('injury', 'Křeče u {player}. Asi ta včerejší zabijačka.', '["cramps","funny"]'),
('injury', '{player} si podvrtl kotník. Správce hřiště nese magický sprej.', '["ankle"]'),
('injury', '{player} dostal ránu do obličeje. Nos vypadá rovně... asi.', '["face"]'),
('injury', '{player} kulhá, ale odmítá střídání. ''To nic není,'' říká.', '["tough"]'),
('injury', '{player} sedí na trávníku a čeká na nosítka. Tedy na dva chlapy s dekou.', '["serious","funny"]'),
('injury', 'Nepříjemný kontakt — {player} drží rameno.', '["serious"]'),
('injury', '{player} se natáhl po míči a chytil se za zadní stehenní. To je průšvih.', '["serious"]'),
('injury', 'Správce hřiště běží s houbou a studenou vodou. {player} si drží koleno.', '["serious"]'),
('injury', '{player} dostal loktem do žeber. Bolí to, ale pokračuje.', '["tough"]'),
('injury', '{player} se srazil se spoluhráčem. Oba leží. Kdo koho?', '["funny"]'),
('injury', 'Zranění {player} — trenér se dívá na lavičku, koho tam pošle.', '["serious"]');

-- ═══ SEED: Střídání ═══
INSERT INTO commentary_templates (event_type, template, tags) VALUES
('substitution', 'Střídání: {player} jde na hřiště. Čerstvá krev!', '["normal"]'),
('substitution', '{player} nastupuje za zraněného spoluhráče.', '["injury_sub"]'),
('substitution', 'Trenér stahuje unavené hráče. Na hřiště jde {player}.', '["tactical"]'),
('substitution', '{player} běží na hřiště. Rozcvičoval se celý poločas u stánku.', '["funny"]'),
('substitution', 'Na hřiště přichází {player}. Uvidíme, co přinese.', '["normal"]'),
('substitution', 'Střídání — {player} se konečně dočkal. Sedel na lavičce od začátku.', '["normal"]'),
('substitution', '{player} poklusává na hřiště. Trenér mu něco šeptá do ucha.', '["tactical"]'),
('substitution', 'Taktická změna — {player} jde na plac.', '["tactical"]'),
('substitution', '{player} nastupuje do hry. Přinesl s sebou energii — a vůni spreje.', '["funny"]'),
('substitution', '{player} střídá. Na lavičce mu kolegové poklepávají po zádech.', '["normal"]');

-- ═══ SEED: Speciální události ═══
INSERT INTO commentary_templates (event_type, template, tags) VALUES
('special', '{player} se drží za kolena a nemůže dál. Kondice na nule.', '["exhausted"]'),
('special', '{player} se hádá s rozhodčím. ''Máte to doma trénovat!''', '["argument"]'),
('special', '{player} vypadá, že včerejší hospoda se podepsala. Běhá jak po Novém roce.', '["hangover"]'),
('special', 'Divák u lajny: ''To bych dal i já, a to mám padesát!''', '["crowd"]'),
('special', 'Od plotu se ozývá: ''Rozhodčí, na oči!''', '["crowd"]'),
('special', 'Sousedka z okna volá: ''Tak co, vedeme?''', '["crowd"]'),
('special', 'Děda u plotu: ''Za mých časů se hrálo líp!''', '["crowd"]'),
('special', 'U stánku s párky se tvoří fronta. Zápas nikoho nezajímá.', '["crowd"]'),
('special', '{player} přiběhl pozdě. Prý mu nejel autobus. Bydlí přes ulici.', '["late","funny"]'),
('special', '{player} předvedl zákrok sezóny! Odkud se to v něm vzalo?', '["gk_hero"]'),
('special', 'Na hřiště vběhl pes. Má lepší kontrolu míče než polovina hráčů.', '["dog","funny"]'),
('special', '{player} volá na lavičku, jestli mu někdo podá vodu. Správce nese pivo.', '["funny"]'),
('special', '{player} si upravuje chrániče. Nebo to byl telefon?', '["funny"]'),
('special', 'Rozhodčí se dívá na hodinky. Asi pospíchá na autobus.', '["funny"]'),
('special', 'Poločas! U stánku je guláš za padesátku a pivo za třicet.', '["half_time"]'),
('special', 'Trenér si při kraji hřiště zapálil cigaretu. Asi ho to stresuje.', '["half_time","funny"]'),
('special', 'Začíná druhá půle. Někteří hráči se vracejí od stánku.', '["half_time"]'),
('special', 'Konec zápasu! Obě mužstva míří do hospody na rozbor.', '["full_time"]'),
('special', 'Píská se konec! Rozhodčí utíká k autu — pro jistotu.', '["full_time","funny"]'),
('special', 'Padla tma. Reflektory tady nejsou, tak se dohrávalo poslepu.', '["atmosphere"]'),
('special', 'Chlap na kole projíždí za brankou. Skoro dostal míčem.', '["crowd","funny"]'),
('special', 'Trenér kopnul do láhve s vodou. Frustrace roste.', '["funny"]'),
('special', '{player} si povídá s divákem u plotu. Rozhodčí ho napomíná.', '["funny"]'),
('special', 'Někdo hodil na hřiště rohlík. Asi protest.', '["crowd","funny"]'),
('special', 'Začalo pršet. Polovina diváků utekla pod střechu hospody.', '["atmosphere"]'),
('special', '{player} si stěžuje, že ho spoluhráči nevidí. Asi má pravdu.', '["funny"]'),
('special', 'Na lavičce se řeší, kdo zaplatí rozhodčímu.', '["funny"]');

-- ═══ SEED: Possession — hodně variant ═══
INSERT INTO commentary_templates (event_type, template, tags) VALUES
('special', '{team} kombinují přes střed hřiště.', '["possession"]'),
('special', '{team} kontrolují tempo hry.', '["possession"]'),
('special', 'Tvrdý pressing {team}. Soupeř se nemůže dostat z vlastní půlky.', '["possession"]'),
('special', '{player} rozehrává z hloubky pole.', '["possession"]'),
('special', '{team} si nahrávají na polovině soupeře.', '["possession"]'),
('special', 'Soupeř stahuje obranu, {team} hledají prostor.', '["possession"]'),
('special', 'Dlouhý míč od {player}, {team} zrychlují.', '["possession"]'),
('special', 'Hra se přesouvá na polovinu soupeře.', '["possession"]'),
('special', '{team} mají míč. Zatím nic nebezpečného.', '["possession"]'),
('special', '{player} vede míč po křídle. Hledá přihrávku.', '["possession"]'),
('special', '{team} pomalu budují útok. Trpělivá hra.', '["possession"]'),
('special', '{player} nahrává do středu — míč se vrací do obrany.', '["possession"]'),
('special', 'Rozehrávka od brankáře. {team} začínají znovu.', '["possession"]'),
('special', '{team} tlačí dopředu. Obrana soupeře má plné ruce práce.', '["possession"]'),
('special', '{player} se snaží projít přes dva hráče. Neúspěšně.', '["possession"]'),
('special', 'Krátká nahrávka {player} na spoluhráče. Tempo se zrychluje.', '["possession"]'),
('special', '{team} drží míč. Soupeř čeká na chybu.', '["possession"]'),
('special', 'Centr od {player} — nikdo se k němu nedostal.', '["possession"]'),
('special', '{player} posílá míč na druhou stranu. Přepínání hry.', '["possession"]'),
('special', '{team} se snaží najít mezeru v obraně.', '["possession"]'),
('special', '{player} si zpracoval míč na hrudi a hledá řešení.', '["possession"]'),
('special', '{team} rotují míč ze strany na stranu. Soupeř běhá.', '["possession"]'),
('special', '{player} přihrává do běhu spoluhráči. Dobré načasování.', '["possession"]'),
('special', 'Aut pro {team}. Chvíle na vydechnutí.', '["possession"]'),
('special', '{player} si stáhl míč patičkou. Pak ale ztratil přehled.', '["possession"]'),
('special', '{team} se snaží zrychlit. Zatím marně.', '["possession"]'),
('special', 'Rohový kop pro {team}. Všichni běží do vápna.', '["possession"]'),
('special', '{player} odkopává z vlastní šestnáctky. Trochu panika.', '["possession"]'),
('special', 'Nudný pasáž hry. Ani jedna strana nechce riskovat.', '["possession"]'),
('special', '{team} hrají na jistotu. Míč koluje v obraně.', '["possession"]');
