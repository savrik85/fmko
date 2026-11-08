/**
 * Další díly skript „Trénink“ (vlastnost Koučink). 1. díl je v `../trenink.ts`.
 *
 * Základní kurz: 2. díl Technika s míčem, 3. díl Herní cvičení, 4. díl Sezóna a kondice.
 * Pokročilý kurz: 2. díl Sportovní věda.
 *
 * Fakta ověřena proti zdrojům:
 * Technika s míčem: Levanon a Dapena 1998 (MSSE, nárt a placírka, 86 % a 67 % z propnutí kolena),
 * Kellis a Katis 2007 (J Sports Sci Med, PMC3786235, přehled kopu nártem: 18–35 m/s, MS 1990
 * 32–35 m/s, rozběh 2–3 kroky, úhel do 45°, rychlost a přesnost), Kellis, Katis a Vrabas 2006
 * (Scand J Med Sci Sports, únava 24,69 → 21,78 m/s), Katis a kol. 2014 (Asian J Sports Med,
 * zotavení kopu do minuty); FA „How to help your players move with the ball“ (vedení, klička,
 * obraty), Huijgen a kol. 2010 (J Sports Sci, 267 hráčů 12–19 let), Cruyffova otočka
 * (MS 1974, Nizozemsko – Švédsko 0:0, Dortmund, Jan Olsson); Carey a kol. 2001 (J Sports Sci,
 * MS 1998, 236 hráčů, 79 % pravonohých), Haaland a Hoff 2003 (Scand J Med Sci Sports,
 * 39 hráčů, 8 týdnů slabší nohou); Mackay a kol. 2019 (NEJM, 7676 bývalých profesionálů,
 * subhazard 3,45), FA heading guidance 2020 (děti) a 2021 (profesionálové 10 hlaviček s větší
 * silou za týden, amatéři 1 trénink týdně a 10 hlaviček), FA 2024 (úmyslné hlavičky
 * v zápasech U7–U11 do sezóny 2026/27, nepřímý volný kop), FAW Heading Guidelines (lehčí míče),
 * Caccese a kol. 2018 (Sports Biomech, síla krku a zrychlení hlavy).
 * Herní cvičení: Coaches' Voice „Rondo explained“ (Cruyff v Barceloně od 1988, Guardiola,
 * slabiny ronda), Townsend 2014 (These Football Times, citát Cruyffa); Clemente a kol. 2014
 * (Res Sports Med, 2 na 2, 3 na 3, 4 na 4), Dellal a kol. 2011 (IJSPP, počet doteků),
 * Lacome a kol. 2018 (IJSPP, žolíci), Farhani a kol. 2022 (Sci Med Football, délka úseků);
 * FA „1v1 emergency defending“ a „How to defend like England“ (zdržet, slabší strana,
 * kdy napadat a kdy ustoupit), Wilson a kol. 2019 (J Sports Sci, 1330 soubojů 1 na 1);
 * Bunker a Thorpe 1982 (Loughborough, TGfU), Ortiz a kol. 2023 (Children, PMC10047062,
 * meta-analýza TGfU), Salmoni, Schmidt a Walter 1984 (Psychol Bull, hypotéza vedení),
 * Winstein a Schmidt 1990 (J Exp Psychol LMC, 50 % vs. 100 % zpětné vazby).
 * Sezóna a kondice: Mujika a Padilla 2000 (Sports Med, krátkodobé odtrénování),
 * Hickson a Rosenkoetter 1981 (MSSE, 2× týdně udrží VO2max 15 týdnů), Hickson a kol. 1985
 * (J Appl Physiol, snížení intenzity o třetinu), aus der Fünten a kol. 2014 (J Athl Train,
 * PMC4264651, zimní přestávka 6,5 → 3,5 týdne), Ekstrand, Hägglund a Fuller 2011 (Scand J Med
 * Sci Sports, umělá tráva třetí generace); Collins a kol. 2021 (BJSM 55:416, stanovisko expertů
 * UEFA k výživě: 85 % TFmax, 6–8 g/kg, 1–3 g/kg 3–4 h před výkopem, 5–7 ml/kg, 30–60 g,
 * 1 g/kg/h 4 h, 20–25 g bílkovin, alkohol do 2 jednotek, trénink vs. zápas v rychlém běhu),
 * Parr a kol. 2014 (PLoS One, PMC3922864, alkohol −24 % a −37 %); Tomlin a Wenger 2001
 * (Sports Med) a 2002 (J Sci Med Sport, 8,8 % vs. 18 % poklesu), Tanaka a kol. 2001 (JACC,
 * 208 − 0,7 × věk), Woltmann a kol. 2015 (JSCR) a Bok, Rakovac a Foster 2022 (Sports Med,
 * test řečí); Di Salvo a kol. 2008 (J Sports Med Phys Fitness, brankáři 5611 m, 73 % chůze),
 * White a kol. 2018 (Sports Med, 2–10 zákroků) a 2020 (J Sports Sci, 51 vs. 5 pádů),
 * pravidlo o přihrávce brankáři od 1992 (IFAB, po MS 1990).
 * Sportovní věda: Scott, Scott a Kelly 2016 (JSCR, GPS 1, 5, 10 a 15 Hz), Bradley a kol. 2009
 * (J Sports Sci, Premier League, pásma 14,4 / 19,8 / 25,1 km/h); Foster 1998 (MSSE,
 * monotónnost a napětí), Gabbett 2016 (BJSM, PMC4789704, ACWR 0,8–1,3 a ≥ 1,5, nárůst pod 10 %),
 * Impellizzeri a kol. 2020 (IJSPP, kritika ACWR); Bangsbo, Iaia a Krustrup 2008 (Sports Med,
 * Yo-Yo IR1 a IR2), Krustrup a kol. 2003 (MSSE, CV 4,9 %, r = 0,71, +25 % vs. +7 %),
 * theyoyotest.com (protokol IR1); Ardern a kol. 2016 (BJSM, konsenzus z Bernu, tři části
 * návratu), Ekstrand, Hägglund a Waldén 2011 (Am J Sports Med, svalová zranění 31 %,
 * hamstringy 37 %, opakovaná 16 %), Grindem a kol. 2016 (BJSM, PMC4912389, přední zkřížený vaz).
 */
import type { CategoryContent, PartTitles } from "../types";

export const COACHING_PART_TITLES: PartTitles = {
  attr_basic: { 2: "Technika s míčem", 3: "Herní cvičení", 4: "Sezóna a kondice" },
  attr_advanced: { 2: "Sportovní věda" },
};

export const COACHING_PARTS: CategoryContent = {
  lessons: [
    // ─── Základní kurz, 2. díl: Technika s míčem ────────────────────────────
    {
      id: "trenink-instep-shot",
      category: "trenink",
      difficulty: 2,
      part: 2,
      title: "Střelba nártem",
      body: `Placírkou se přihrává a zakončuje zblízka, protože je přesná. Když je ale potřeba prudká rána, přichází na řadu **nárt**, tedy horní část chodidla, kde má kopačka tkaničky.

Proč je nárt prudší? Rozbor pohybu (Levanon a Dapena, 1998) ukázal, že rychlost nohy při kopu vzniká hlavně **propnutím v koleni**: u kopu nártem zhruba z **86 %**, u placírky ze 67 %. Noha při kopu nártem letěla k míči rychlostí 21,6 m/s, při placírce jen 18,3 m/s, a proto byl pomalejší i míč. Placírka platí za přesnost rychlostí.

Přehled studií o kopu nártem (Kellis a Katis, 2007) přináší pár užitečných čísel:
- nejprudší kopy se pohybují zhruba mezi **18 a 35 m/s**; na mistrovství světa 1990 naměřili **32–35 m/s**, tedy přes 110 km/h,
- hráči se nejčastěji rozbíhají na **2–3 kroky** a šikmý rozběh, zhruba do **45°**, může míč mírně zrychlit,
- když měli hráči kopnout co nejsilněji, rychlejší rozběh **zhoršil přesnost**. Nejrychlejší rozběh tedy není vždycky nejlepší.

Základ techniky: **stojná noha** dopadne vedle míče, spíš kousek za něj, **kotník je zpevněný** se špičkou dolů a nárt trefí střed míče. Kdo se při kopu zakloní, posílá míč přes břevno sousedům do zahrady.

Pozor na **únavu**. Po devadesátiminutovém přerušovaném zatížení klesla rychlost míče z 24,7 na **21,8 m/s** (Kellis a kol., 2006). Jiná studie ale zjistila, že po běhu do vyčerpání se kop vrátil do normálu zhruba **do minuty**. Před přímým kopem v 89. minutě se tedy vyplatí chvilku vydýchat a teprve pak se rozběhnout.

Střelbu proto trénuj v odpočaté části tréninku, ne po kolečkách kolem hřiště, kdy už nohy kopou jen ze slušnosti.`,
    },
    {
      id: "trenink-dribbling",
      category: "trenink",
      difficulty: 2,
      part: 2,
      title: "Vedení míče a klička",
      body: `Anglický svaz (FA) řadí pod **pohyb s míčem** tři dovednosti: **vedení míče**, **kličkování** a **obraty**. Liší se hlavně tím, kolik doteků hráč udělá a jakých.

**Vedení míče** je běh s míčem do volného prostoru, kde v cestě nikdo nestojí. Míč se posílá kus před sebe, často **nártem**, s hlavou nahoře a s co nejmenším počtem doteků, aby hráč běžel skoro plnou rychlostí. **Klička** přichází na řadu, když tě soupeř napadá. Míč je blízko u nohy, doteků je víc, střídají se různé části chodidla a o úspěchu rozhoduje **změna tempa a směru**.

Rychlé nohy na kličku nestačí. Nizozemská studie (Huijgen a kol., 2010) sledovala sedm let **267 talentovaných hráčů** od 12 do 19 let. Sprint bez míče a sprint s míčem spolu souvisely jen slabě až středně, jde tedy o **odlišné schopnosti**. S kličkováním souvisel mimo jiné **počet hodin tréninku**. Mezi 14 a 16 lety se rychle zlepšoval hlavně sprint, kdežto **po šestnáctce** se výrazně zlepšovalo kličkování a sprint už skoro ne. Na techniku s míčem tedy není pozdě ani u dorostu.

Nejslavnější obrat nese jméno **Johana Cruyffa**. Na mistrovství světa **1974** v zápase Nizozemska se **Švédskem** v Dortmundu předstíral přihrávku, míč si přetáhl za stojnou nohu, otočil se o 180 stupňů a utekl obránci **Janu Olssonovi**. Zápas skončil 0:0, ale pohybu se od té doby říká **Cruyffova otočka**. Cruyff ho podle všeho nevymyslel, jen ho předvedl na největší scéně.

Na okrese platí totéž co v Dortmundu: klička bez změny tempa je jen tanec s míčem. Obránce si počká, odebere a strejda na tribuně zařve, ať už to konečně někomu přihraješ.`,
    },
    {
      id: "trenink-weaker-foot",
      category: "trenink",
      difficulty: 2,
      part: 2,
      title: "Slabší noha",
      body: `Každý trenér chce obounohé hráče. Jak je na tom elita? **Carey a kolegové (2001)** rozebrali hru **236 hráčů** z 16 týmů na mistrovství světa 1998 ve Francii. Zhruba **79 % hráčů bylo pravonohých**, tedy stejně jako v běžné populaci. Levonozí byli na lepší noze závislí stejně jako pravonozí a **obě nohy stejně často** používal jen málokdo.

Překvapení přišlo jinde. Když už hráči slabší nohu použili, byli s ní v průměru **stejně úspěšní** jako s lepší. Nejvíc jednostranní byli při **standardních situacích**, ale i první dotek, přihrávky, kličky a skluzy dělali slabší nohou jen zřídka. Autoři z toho usoudili, že malé používání slabší nohy se nedá vysvětlit jen tím, že by s ní hráči hůř uměli.

Dá se slabší noha natrénovat? **Haaland a Hoff (2003)** rozdělili 39 hráčů ve věku 15–20 let ze stejného týmu do dvou skupin. Tréninková skupina dělala **8 týdnů** všechna cvičení kromě hry **jen slabší nohou**. Ve fotbalových testech se oproti kontrolní skupině zlepšila slabší nohou. Autory překvapilo, že **se zlepšila i lepší nohou**. Vysvětlují to tím, že se zlepšilo řízení pohybu obecně, ne jen jedné nohy.

Pro trenéra z toho plyne:
- slabší noha se trénuje **pravidelně**, ne jednou za sezónu,
- dobře poslouží cvičení, kde se smí hrát **jen slabší nohou**, třeba přihrávky ve dvojicích nebo zpracování míče,
- lepší noha tím netrpí, spíš naopak.

Až bude levák z áčka tvrdit, že pravou má jen na stání, trenér má v ruce studii. A u standardek ho klidně nechá kopat levou, ať se nezlobí.`,
    },
    {
      id: "trenink-heading",
      category: "trenink",
      difficulty: 2,
      part: 2,
      title: "Hlavičkování",
      body: `Hlavička se na okrese cenila odjakživa. Dnes se o ní mluví i kvůli zdraví. Skotská studie (Mackay a kol., 2019) porovnala **7676 bývalých profesionálů** s 23 028 lidmi z běžné populace. Bývalí fotbalisté umírali méně často na nemoci srdce a na rakovinu plic, ale úmrtí, kde byla hlavní příčinou **neurodegenerativní nemoc**, třeba demence, bylo u nich zhruba **3,5krát častější**. Samotné hlavičkování studie neměřila, ale anglický svaz po ní zpřísnil pravidla pro trénink.

Doporučení anglického svazu (FA):
- **profesionálové**: nejvýš **10 hlaviček s větší silou** za tréninkový týden; to jsou hlavičky po dlouhém míči přes 35 m, po centrech, rozích a volných kopech,
- **dospělí amatéři**: hlavičky nacvičovat nanejvýš v **jednom tréninku týdně** a v něm nejvýš **10 hlaviček**,
- **děti na prvním stupni**: v tréninku **žádné hlavičkování**, u starších se přidává postupně. Od sezóny 2024/25 navíc Anglie ruší úmyslné hlavičky i v zápasech nejmenších; v sezóně 2026/27 už to platí pro **U7 až U11** a trestá se to **nepřímým volným kopem**.

Technika: oči otevřené, pusa zavřená, sledovat míč a trefit ho **čelem**, ne temenem. Velšský svaz doporučuje nacvičovat techniku s **lehčími míči**.

Proč posilovat krk? Americká studie (Caccese a kol., 2018) měřila u 100 hráčů, jak prudce se jim při hlavičce hýbe hlava. Menší zrychlení hlavy měli hráči s **větší hlavou a krkem** a se **silnějšími krčními svaly**. Pohyb trupu a hlavy v této studii vliv neprokázal.

Na tréninku tedy stačí málo hlaviček, ale pořádných. Deset centrů po sobě na hlavu stopera je celý týdenní příděl profesionála z Premier League.`,
    },

    // ─── Základní kurz, 3. díl: Herní cvičení ───────────────────────────────
    {
      id: "trenink-rondo",
      category: "trenink",
      difficulty: 2,
      part: 3,
      title: "Rondo",
      body: `**Rondo** zná každý, kdo kdy přišel na trénink o deset minut dřív. Hráči stojí v kruhu nebo ve čtverci, přihrávají si a jeden nebo dva **obránci uprostřed** se snaží míč získat. Kdo míč získá, jde ven, a doprostřed jde ten, kdo ho ztratil. Obránců je vždycky **méně** než útočníků; nejběžnější je pět až osm hráčů venku a **dva uvnitř**, třeba 5 na 2.

S rondem je spojený hlavně **Johan Cruyff**, který ho po příchodu do Barcelony v roce **1988** zařadil do tréninku i do předzápasové přípravy. Připisuje se mu věta: „Všechno, co se děje v zápase, kromě střelby, se dá dělat v rondu.“ Učí se v něm hrát na jeden dotek, vymanit se z těsné obsluhy a rychle získat míč zpátky. Jeho žák **Pep Guardiola** chce, aby útočníci **vtáhli obránce k míči** a pak přihráli volnému spoluhráči jinde.

Rady pro útočníky:
- hraj tam, **kam jsi natočený**, a nabízej se tak, aby mezi tebou a míčem nestál obránce,
- kdo to zvládne, hraje **na jeden dotek**, obránci pak nestíhají přebíhat.

Obránci mají napadat ostře a zavírat **přihrávku středem** mezi sebou.

Obtížnost se ladí snadno: **omezení doteků** a **menší prostor** cvičení ztíží, víc hráčů ho zkomplikuje a volnější verze poslouží jako zklidnění na konci.

Rondo má i **slabiny**. Nemá směr, takže držení míče se snadno stane cílem samo o sobě. Hraje se po zemi, takže se v něm nenacvičí středně dlouhé a dlouhé přihrávky. A obránci se učí napadat pořád, kdežto v zápase musí odhadnout, kdy napadat a kdy ustoupit.

Na okrese má rondo ještě jednu výhodu: stačí na něj šest lidí a jeden míč, takže se dá hrát, i když půlka kádru ještě v kabině hledá chrániče.`,
    },
    {
      id: "trenink-ssg-rules",
      category: "trenink",
      difficulty: 2,
      part: 3,
      title: "Hry na malém prostoru: pravidla podle cíle",
      body: `Hry na malém prostoru se často hrají kvůli kondici. Stejně důležité je ale to, jak pravidla mění, **co se hráči naučí**. Platí jednoduchá zásada: nejdřív si urči **cíl**, potom vyber pravidla.

Co ukazují studie:
- **Počet hráčů.** U hráčů portugalské regionální ligy (Clemente a kol., 2014) přinesla hra **2 na 2** nejvíc technických a taktických akcí, hra 3 na 3 nejvyšší tepovou frekvenci a hra 4 na 4 nejvíc naběhaných metrů.
- **Omezení doteků.** Reprezentanti hráli 4 na 4 na jeden dotek, na dva doteky a volně (Dellal a kol., 2011). Hra **na jeden dotek** přinesla víc akcí ve vysoké intenzitě, ale hráči měli větší potíže zahrát technicky správně. **Volná hra** měla nejvíc **soubojů** a výkon v ní během opakování klesal nejméně.
- **Žolík.** Neutrální hráč, který hraje vždy s týmem v držení míče, toho podle měření v profesionálním francouzském klubu (Lacome a kol., 2018) **naběhá méně** než ostatní. Žolíka je proto dobré střídat, ať se jeden hráč neveze celý trénink.
- **Délka úseků.** V malé studii (Farhani a kol., 2022) měli hráči při jednom souvislém úseku 12 minut víc úspěšných přihrávek, méně ztrát a větší radost ze hry než při třech úsecích po 4 minutách.

Pravidla se dají vymyslet i na míru slabině týmu. Když tým po ztrátě míče jen kouká, ať platí **gól po zisku míče na útočné polovině dvakrát**. Když všichni běží za míčem jako hejno vrabců, ať gól platí jen po přihrávce ze strany.

A jedno pravidlo z praxe: hra, kde se pořád vysvětluje a nehraje, nenaučí nic. Pravidla se řeknou krátce, pak se hraje a upravuje se za běhu. Kdo dal víc gólů, si kluci stejně spočítají až u piva.`,
    },
    {
      id: "trenink-one-v-one",
      category: "trenink",
      difficulty: 2,
      part: 3,
      title: "Souboje 1 na 1 a přesilovka 2 na 1",
      body: `Zápas se dá rozložit na malé souboje. Kdo vyhraje víc soubojů jeden na jednoho a umí využít přesilovku, ten má navrch.

**Útočník v souboji 1 na 1.** Brazilská studie (Wilson a kol., 2019) nechala 25 mladých hráčů akademie odehrát přes 1300 soubojů jeden na jednoho. Úspěch útočníka nejlépe předpovídala **rychlost vedení míče po zakřivené dráze**, která sama vysvětlila víc než polovinu rozdílů mezi hráči. **Rychlost sprintu** bez míče úspěch **nepředpovídala**. Rychlík, který neumí s míčem zatočit, obránce nepřejde.

**Obránce v souboji 1 na 1.** Anglický svaz (FA) v metodice obrany zdůrazňuje:
- **zdržet** útočníka a umět rozhodnout, **kdy jít do míče a kdy ustoupit**,
- **vytlačit útočníka na jeho slabší stranu** a pryč od branky.

K tomu patří osvědčené rady: při přibližování **zpomalit**, pokrčit kolena a stát **bokem**, ne čelem jako skříň, a **neskákat** do skluzu naslepo. Obránce, který leží, už nebrání.

**Přesilovka 2 na 1.** Hráč s míčem **vede míč přímo na obránce**, aby ho donutil rozhodnout se. Jakmile obránce **vystoupí** k němu, přihraje volnému spoluhráči. Když obránce zůstane u spoluhráče, pokračuje sám. Přihrávka příliš brzy dá obránci čas se přesunout, příliš pozdě přesilovku promarní. Dvě nejčastější řešení:
- **narážečka** (zeď): přihrávka spoluhráči a okamžitý návrat míče, s prudkou **změnou tempa** po přihrávce,
- **obíhání**: spoluhráč oběhne hráče s míčem; chce to **domluvu** hlasem.

V tréninku se souboje hrají jako krátké hry na malé branky nebo přes čáru. Obránci se střídají často, protože bránit pořád proti dvěma je fuška, po které by i kovaný stoper potřeboval tři dny v hospodě.`,
    },
    {
      id: "trenink-guided-discovery",
      category: "trenink",
      difficulty: 2,
      part: 3,
      title: "Jak trenér učí a opravuje",
      body: `Trenér může učit dvojím způsobem. **Řízené učení** znamená, že trenér ukáže, vysvětlí a hráči opakují, dokud to nesedí. **Objevné učení** postaví hráče do herní situace a nechá je řešení hledat; trenér pomáhá otázkami a úpravou pravidel.

Známým příkladem objevného přístupu je model **Teaching Games for Understanding**, tedy výuka her s porozuměním. V roce **1982** ho na univerzitě v Loughborough popsali **David Bunker a Rod Thorpe** jako odpověď na výuku postavenou na nacvičování jednotlivých dovedností. Začíná se **upravenou hrou**. Hráči nejdřív pochopí, o co v ní jde a jaká řešení dávají smysl, a technika se dolaďuje podle toho, co hra ukáže. Souhrnná analýza randomizovaných studií (Ortiz a kol., 2023) zjistila, že oproti technickému přístupu přináší výrazně **lepší rozhodování** ve hře, kdežto v samotném **provedení dovedností** se skupiny nelišily.

Druhá otázka je, **jak často opravovat**. Podle takzvané **hypotézy vedení** (Salmoni, Schmidt a Walter, 1984) zpětná vazba po každém pokusu zlepšuje výkon v tréninku, ale hráč si na ni zvykne a bez ní pak hraje hůř. Winstein a Schmidt (1990) zjistili, že skupina se zpětnou vazbou **po polovině pokusů** si dovednost zapamatovala lépe než skupina, která ji dostávala po každém pokusu. Ne všechny pozdější studie to potvrdily, ale směr je jasný: méně je někdy víc.

V praxi to znamená:
- nech hráče **několikrát zkusit**, než zasáhneš,
- zastav hru, jen když se chyba **opakuje**, a oprav jednu věc,
- místo hotové odpovědi se zeptej a nech hráče přijít na řešení.

Trenér, který řve po každém doteku, vychová hráče, co bez řevu z lavičky neví, kam s míčem. A takového trenéra si pak hráči pamatují spíš z vyprávění v hospodě než z tréninku.`,
    },

    // ─── Základní kurz, 4. díl: Sezóna a kondice ────────────────────────────
    {
      id: "trenink-winter-prep",
      category: "trenink",
      difficulty: 2,
      part: 4,
      title: "Zimní přestávka a příprava",
      body: `Na okrese se v listopadu dohraje podzim a do března je klid. Pro kondici je to nejzrádnější období roku.

Přehled studií o **odtrénování** (Mujika a Padilla, 2000) říká, že už **krátká pauza do čtyř týdnů** vede u trénovaných sportovců k rychlému poklesu **maximální spotřeby kyslíku** a objemu krve. **Síla** přitom klesá jen málo. Vytrvalost tedy s vánočním cukrovím zmizí dřív než svaly.

Dobrá zpráva: **udržet je snazší než nabrat**. Hickson a Rosenkoetter (1981) nechali lidi deset týdnů trénovat šestkrát týdně. Pak jedni trénovali jen **čtyřikrát** a druzí jen **dvakrát týdně**, ale ve **stejné intenzitě**. Maximální spotřeba kyslíku vydržela v obou skupinách **15 týdnů**. Když ale jiná skupina při stejném počtu tréninků ubrala z **intenzity** o třetinu, pokles už nezastavila (Hickson a kol., 1985). Přes svátky tedy stačí méně tréninků, ale ostrých, ne procházky kolem rybníka.

Po pauze přichází **zimní příprava** a s ní pozor na rychlý návrat. Když německé profesionální ligy zkrátily zimní přestávku z 6,5 na 3,5 týdne, celkový počet zranění se nezměnil, ale přibylo **zranění v tréninku** a **zranění kolen** (aus der Fünten a kol., 2014).

Velká část přípravy se v zimě hraje na **umělé trávě**. Studie elitních týmů (Ekstrand a kol., 2011) nenašla mezi umělou trávou třetí generace a přírodní trávou rozdíl v **celkovém počtu úrazů**. Muži měli na umělé trávě v zápasech o něco víc **podvrtnutých kotníků** a méně natažených čtyřhlavých svalů.

Plán pro okres:
- v prosinci **1–2 ostré jednotky týdně**, klidně běh nebo hala,
- v lednu zátěž přidávat postupně, ne začít tím, čím se v srpnu končilo,
- přáteláky na umělce brát jako trénink, ne jako finále mistrovství světa.`,
    },
    {
      id: "trenink-aerobic-base",
      category: "trenink",
      difficulty: 2,
      part: 4,
      title: "Aerobní vytrvalost a tepovka",
      body: `Na okrese se vytrvalost často bere jako schopnost „uběhat“ soupeře. Ve skutečnosti je **aerobní kondice** hlavně základ, na kterém stojí opakované sprinty.

Podle stanoviska expertů UEFA mají hráči v poli během zápasu průměrně kolem **85 % maximální tepové frekvence** a pracují zhruba na 70 % maximální spotřeby kyslíku. Přehled studií (Tomlin a Wenger, 2001) shrnuje, že lepší aerobní kondice urychluje **zotavení mezi krátkými prudkými úseky**. Ukázala to i studie rekreačních fotbalistek (Tomlin a Wenger, 2002): skupina s vyšší maximální spotřebou kyslíku měla při deseti šestisekundových sprintech na rotopedu **stejný nejvyšší výkon** jako méně trénovaná skupina, ale výkon jí během série klesl jen asi o **9 %**, kdežto druhé skupině o **18 %**.

Intenzitu vytrvalostního tréninku trenér nejčastěji hlídá podle **tepové frekvence**. Oblíbený vzorec **220 minus věk** je jen hrubý odhad maxima. Souhrnná analýza 351 studií (Tanaka a kol., 2001) navrhla vzorec **208 minus 0,7 × věk** a upozornila, že starý vzorec maximum u starších lidí **podceňuje**. Šedesátiletému veteránovi vychází podle starého vzorce 160, podle nového 166 tepů za minutu. Pohlaví ani to, kolik kdo sportuje, na odhad podle studie vliv nemělo.

Kdo nemá sporttester, může použít **test řečí**. Nejrychlejší tempo, ve kterém hráč ještě **pohodlně mluví**, odpovídá zhruba ventilačnímu prahu a hodí se na **regenerační a dlouhé klidné běhy**. Když už pohodlně mluvit nejde, jde o vyšší intenzitu, vhodnou pro ostřejší trénink (Woltmann a kol., 2015; Bok a kol., 2022).

Prakticky:
- klidný běh: ještě se dá povídat,
- ostrý úsek: na povídání není dech,
- když hráči při „lehkém“ výklusu probírají sobotní zábavu jen v heslech, lehký nebyl.`,
    },
    {
      id: "trenink-match-nutrition",
      category: "trenink",
      difficulty: 2,
      part: 4,
      title: "Jídlo a pití kolem zápasu",
      body: `Hlavním palivem pro prudké akce jsou **sacharidy** uložené ve svalech a v játrech jako **glykogen**. Kdo začne zápas s prázdnými zásobami, naběhá podle stanoviska expertů UEFA (Collins a kol., 2021) méně a hlavně méně ve vysoké rychlosti, a to nejvíc ve druhém poločase.

Doporučení UEFA pro profesionály:
- **den před zápasem** a v den zápasu **6–8 g sacharidů na kilogram** tělesné hmotnosti denně,
- **předzápasové jídlo** bohaté na sacharidy, **1–3 g/kg**, zhruba **3–4 hodiny** před výkopem; má být lehce stravitelné a vyzkoušené v tréninku. Zásoby glykogenu v **játrech** po noci klesnou asi o polovinu, proto snídaně rozhoduje hlavně před polední hrou,
- **5–7 ml tekutin na kilogram** 2–4 hodiny před výkopem, aby hráč stihl přebytek vyčůrat,
- **30–60 g sacharidů** po rozcvičce a znovu o **poločase**,
- **po zápase** zhruba **1 g/kg sacharidů každou hodinu po dobu 4 hodin** a bílkoviny po **20–25 g** každé 3–4 hodiny.

Pro osmdesátikilového stopera to znamená předzápasové jídlo s 80–240 g sacharidů, tedy pořádný talíř těstovin nebo rýže, ne tlačenku s cibulí.

A pak je tu **alkohol**. Experti UEFA uvádějí, že občasné malé množství, nejvýš **2 jednotky denně**, neškodí, ale alkohol zhoršuje doplnění glykogenu, stavbu svalových bílkovin i rehydrataci. Australská studie (Parr a kol., 2014) dala sportovcům po tréninku alkohol v množství zhruba **12 standardních drinků**. Tvorba svalových bílkovin byla i při současném pití proteinu o **24 % nižší**, se sacharidy místo proteinu dokonce o 37 %.

Pro okres to neznamená zákaz hospody po zápase. Znamená to nejdřív se najíst a napít vody a pivo brát s mírou, zvlášť když se ve středě hraje pohár.`,
    },
    {
      id: "trenink-goalkeeper",
      category: "trenink",
      difficulty: 2,
      part: 4,
      title: "Trénink brankáře",
      body: `Brankář je v kabině zvláštní živočich a jeho trénink je jiný. Rozbor 109 zápasů Premier League (Di Salvo a kol., 2008) ukázal, že brankář za zápas urazí průměrně **5,6 km**, **73 % času chodí** a jen **2 % času** se pohybuje ve vysoké intenzitě. Přehled studií (White a kol., 2018) uvádí **2–10 zákroků** za zápas, často výbušných: skoky a pády. Brankáři v testech **skáčou výš** než hráči v poli, ale mají nižší maximální spotřebu kyslíku a pomalejší sprint.

Kolečka kolem hřiště s ostatními tedy brankáře moc nepřipraví. Potřebuje **krátké výbušné akce** s dostatkem odpočinku a hlavně **techniku**: chytání, padání, vyrážení, výběh na centr.

Pozor na hry na malém prostoru. Měření v Premier League (White a kol., 2020) ukázalo, že brankář při **brankářském tréninku** udělal průměrně **51 pádů**, kdežto při **hře na malém prostoru jen 5**. Kdo trénuje jen v rámci her, chytání skoro netrénuje. Brankář proto potřebuje část tréninku **zvlášť**, nejlépe s trenérem brankářů, nebo aspoň s ochotným střelcem.

Základy postavení:
- brankář stojí na pomyslné čáře mezi míčem a **středem branky**,
- když vyběhne moc daleko, hrozí přehození; když stojí moc hluboko, nechává střelci velký terč.

A nezapomeň na **nohy**. Od roku **1992** platí pravidlo, že brankář nesmí vzít do rukou úmyslnou přihrávku nohou od spoluhráče. Zavedli ho i proto, že na mistrovství světa 1990 týmy zdržovaly hru přihrávkami na brankáře. Brankář, který neumí zpracovat a rozehrát míč, je dnes jako stoper, co neumí hlavičkovat. Ať proto hraje i rondo a přihrávková cvičení s ostatními, i když bude remcat, že on je přece na ruce.`,
    },

    // ─── Pokročilý kurz, 2. díl: Sportovní věda ─────────────────────────────
    {
      id: "trenink-gps-speed",
      category: "trenink",
      difficulty: 3,
      part: 2,
      title: "GPS a běh vysokou rychlostí",
      body: `GPS vesta pod dresem měří, kde hráč je a jak rychle běží. Z toho se počítá **vnější zatížení**: uběhnutá vzdálenost, metry v rychlostních pásmech, zrychlení a zpomalení.

Nejdřív přesnost. Přehled studií (Scott a kol., 2016) zjistil, že vzdálenost změří slušně všechny přístroje, ale jednotky s frekvencí **1 a 5 Hz** mají potíže s **během vysokou rychlostí**, krátkými úseky a **změnami směru**. Nejspolehlivější byly přístroje s **10 Hz**; zvýšení na 15 Hz už nic nepřidalo. Levná vesta tedy změří kilometry, ale sprinty může zkreslit.

Rychlostní pásma se mezi studiemi liší jen málo. Často se používá:
- **běh vysokou intenzitou** od **14,4 km/h**,
- **běh vysokou rychlostí** od **19,8 km/h**,
- **sprint** nad zhruba **25 km/h** (podle studie 25,1 nebo 25,2 km/h).

Rozbor Premier League (Bradley a kol., 2009) ukázal velké rozdíly mezi posty. Krajní záložníci naběhali vysokou intenzitou přes **3100 m**, středoví obránci kolem **1800 m**. V **posledních 15 minutách** to bylo u všech postů asi o **pětinu méně** než v prvních patnácti a pauzy mezi nejrychlejšími úseky se prodloužily.

Stanovisko expertů UEFA (Collins a kol., 2021) přidává srovnání: v běžném tréninku profesionálové naběhají méně než v zápase, třeba běhu vysokou rychlostí **pod 300 m** oproti **víc než 900 m** v zápase.

Pro trenéra z toho plyne:
- čísla porovnávej **podle postů**, ne krajního záložníka se stoperem,
- hráč, který nehrál, nedostal v týdnu dávku vysoké rychlosti a je potřeba mu ji **doplnit**,
- u levných přístrojů ber sprinty a změny směru s rezervou.

Na okrese nosí GPS vestu leda ten, kdo ji dostal k Vánocům. Princip ale platí i bez ní: kdo v týdnu nikdy nesprintuje, toho první sprint v neděli zaskočí.`,
    },
    {
      id: "trenink-acute-chronic",
      category: "trenink",
      difficulty: 3,
      part: 2,
      title: "Akutní a chronická zátěž",
      body: `Když trenér zapisuje zatížení každého tréninku, třeba jako námahu krát minuty (sRPE), může z čísel vyčíst víc než jen součet.

**Monotónnost** zavedl **Carl Foster** (1998). Je to **průměrná denní zátěž vydělená směrodatnou odchylkou**, tedy tím, jak moc se dny liší. Když je každý den stejně těžký, odchylka je malá a monotónnost vysoká. **Napětí** je zátěž vynásobená monotónností. Foster zjistil, že velkou část banálních nemocí sportovci chytili, když překročili své individuální prahy, hlavně v napětí. Jednotvárně těžký týden je tedy horší než stejně těžký týden, kde se střídají lehké a těžké dny.

**Tim Gabbett** (2016) popsal **paradox prevence zranění**: hráči zvyklí na vysokou zátěž se zraňují méně než ti, kdo trénují málo. Bezkontaktní zranění podle něj nezpůsobuje trénink sám o sobě, ale nevhodný program a hlavně **prudké skoky** v zátěži. Navrhl sledovat:
- **akutní zátěž**: poslední **týden**,
- **chronickou zátěž**: klouzavý průměr posledních **3–6 týdnů**,
- jejich poměr (**ACWR**): rozmezí **0,8–1,3** nazval „sweet spot“, poměr **1,5 a víc** nebezpečnou zónou.

Když zátěž stoupla proti předchozímu týdnu o **15 % a víc**, riziko zranění v datech, která citoval, vzrostlo na 21–49 %. Doporučil proto zvyšovat týdenní zátěž **o méně než 10 %**.

Pozor, věda se o poměr hádá. **Impellizzeri a kolegové (2020)** upozornili, že poměr dvou čísel má statistické vady a že **nejsou důkazy**, že řízení podle ACWR počet zranění snižuje. Užitečná myšlenka ale zůstává: vyhýbat se **prudkým skokům** a nenechat hráče dlouho v příliš lehké zátěži.

Na okrese je nejčastější skok jasný: hráč, který dva měsíce nechodil, se v neděli objeví na zápase, protože „chyběli lidi“. Poměr akutní a chronické zátěže jak hrom.`,
    },
    {
      id: "trenink-yo-yo",
      category: "trenink",
      difficulty: 3,
      part: 2,
      title: "Yo-Yo test",
      body: `Kondici je dobré měřit, jinak trenér jen hádá. Ve fotbale se nejčastěji používá **Yo-Yo test přerušovaného zotavení** dánských vědců kolem **Jense Bangsba**.

Jak probíhá úroveň 1:
- hráč běží **2× 20 m** tam a zpět v tempu podle zvukového signálu,
- po každém úseku má **10 sekund aktivního odpočinku**: dojde nebo doklusá ke kuželu 5 m za startem a zpátky,
- tempo začíná na **10 km/h** a postupně se zrychluje,
- když hráč nedoběhne včas na čáru, dostane varování, **podruhé končí**. Výsledkem je dosažená úroveň, z níž se dá spočítat uběhnutá vzdálenost.

**Úroveň 1** žene k maximu hlavně **aerobní systém**, **úroveň 2** víc zatěžuje **anaerobní systém** a schopnost zotavit se z opakovaných prudkých úseků (Bangsbo a kol., 2008).

Proč zrovna Yo-Yo? Krustrup a kolegové (2003) zjistili, že:
- test je dobře opakovatelný, variabilita mezi dvěma měřeními byla kolem **5 %**,
- metry, které hráči v zápase naběhali vysokou intenzitou, souvisely s výsledkem Yo-Yo testu (**r = 0,71**), ale **ne s maximální spotřebou kyslíku**,
- během přípravy se elitní hráči zlepšili v Yo-Yo testu o **25 %**, kdežto v maximální spotřebě kyslíku jen o 7 %. Test tedy citlivěji ukáže, jestli příprava zabrala.

Bangsbo a kolegové dodávají, že čím vyšší soutěž, tím lepší výsledky, a že u mladých hráčů výsledek roste s věkem.

Aby čísla šla porovnat, měří se **za stejných podmínek**: stejný povrch, obuv a rozcvička, ideálně i stejná denní doba. Test na zmrzlé škváře v lednu a na trávě v červnu porovnávat nejde.

A ještě rada: test patří na začátek přípravy a před sezónu, ne na den po posvícení. To by se změřil leda obsah žaludku.`,
    },
    {
      id: "trenink-return-to-play",
      category: "trenink",
      difficulty: 3,
      part: 2,
      title: "Návrat po zranění",
      body: `Hráč s obvazem na lýtku přijde ve čtvrtek a hlásí: „Už je to dobrý, trenére.“ Je? Návrat po zranění patří k nejtěžším trenérským rozhodnutím.

**Konsenzus z Bernu** (Ardern a kol., 2016), na kterém se shodlo 17 odborníků, říká, že návrat **není jednorázové rozhodnutí** na konci léčby, ale **plynulá cesta** souběžná s rehabilitací. Má tři části:
- **návrat k účasti**: hráč trénuje upraveně nebo i naplno, ale ještě není připravený hrát,
- **návrat ke sportu**: hraje svůj sport, ale ještě ne na úrovni, jakou chce,
- **návrat k výkonu**: hraje stejně dobře nebo lépe než před zraněním.

Rozhodovat se má ideálně **společně**: hráč, lékař nebo fyzioterapeut a trenér. Jde o řízení rizika, ne o hlasování, kdo víc chce hrát.

Proč na tom záleží? Ve studii profesionálních evropských týmů (Ekstrand a kol., 2011) tvořila **svalová zranění 31 %** všech zranění a nejčastěji šlo o **zadní stehenní svaly** (37 % svalových zranění). **16 %** svalových zranění byla **opakovaná** a ta znamenala **delší absenci** než první zranění.

Nejlépe prozkoumaný je návrat po operaci **předního zkříženého vazu**. Studie Grindem a kolegů (2016) sledovala 106 pacientů:
- kdo se vrátil ke sportům se skoky, otočkami a změnami směru, jako je fotbal, měl **víc než čtyřikrát** vyšší riziko dalšího zranění kolena,
- každý měsíc odkladu návratu **až do 9 měsíců** po operaci snížil riziko opakovaného zranění o **51 %**, později už se nesnižovalo,
- pomáhala i **vyrovnaná síla čtyřhlavého svalu** obou nohou.

Pro trenéra z toho plyne: vracet hráče podle **kritérií**, jako je síla, testy a trénink bez potíží, ne podle kalendáře ani podle toho, že je v neděli derby. Jinak za tři týdny Pepa v kabině vysvětluje, že tentokrát to bylo „úplně jiný místo“.`,
    },
  ],
  questions: [
    // Střelba nártem
    {
      id: "trenink-instep-shot-1",
      lessonId: "trenink-instep-shot",
      text: "Z čeho podle rozboru Levanona a Dapeny pochází většina rychlosti nohy při kopu nártem?",
      options: ["Z propnutí v koleni", "Z máchnutí rukama", "Z odrazu stojné nohy od země", "Z otočení ramen"],
      correct: 0,
      explain: "Rychlost nohy vzniká hlavně propnutím v koleni, u kopu nártem zhruba z 86 %.",
    },
    {
      id: "trenink-instep-shot-2",
      lessonId: "trenink-instep-shot",
      text: "Proč je střela placírkou pomalejší než střela nártem?",
      options: [
        "Placírka se kope špičkou kopačky",
        "Noha se při placírce pohybuje pomaleji, a tak letí pomaleji i míč",
        "Placírkou se smí kopat jen z místa",
        "Při placírce se míč trefuje shora",
      ],
      correct: 1,
      explain: "Noha letěla k míči při placírce 18,3 m/s, při kopu nártem 21,6 m/s. Placírka platí za přesnost rychlostí.",
    },
    {
      id: "trenink-instep-shot-3",
      lessonId: "trenink-instep-shot",
      text: "Co se stalo, když měli hráči kopnout co nejsilněji a rozbíhali se rychleji?",
      options: [
        "Přesnost se zlepšila",
        "Nic se nezměnilo",
        "Přesnost se zhoršila",
        "Míč se pokaždé stočil k tyči",
      ],
      correct: 2,
      explain: "Při pokynu kopnout co nejsilněji rychlejší rozběh zhoršil přesnost, nejrychlejší rozběh tedy není vždycky nejlepší.",
    },
    {
      id: "trenink-instep-shot-4",
      lessonId: "trenink-instep-shot",
      text: "Jak prudké střely naměřili na mistrovství světa 1990?",
      options: ["Kolem 10 m/s", "Kolem 20 m/s", "Přes 60 m/s", "32–35 m/s, tedy přes 110 km/h"],
      correct: 3,
      explain: "Na MS 1990 naměřili 32–35 m/s, víc než ve většině laboratorních měření.",
    },
    {
      id: "trenink-instep-shot-5",
      lessonId: "trenink-instep-shot",
      text: "Co se stalo s rychlostí míče po devadesátiminutovém přerušovaném zatížení (Kellis a kol., 2006)?",
      options: [
        "Klesla zhruba z 24,7 na 21,8 m/s",
        "Stoupla, protože svaly byly zahřáté",
        "Zůstala úplně stejná",
        "Klesla na polovinu",
      ],
      correct: 0,
      explain: "Únava po zatížení podobném zápasu snížila rychlost míče z 24,7 na 21,8 m/s.",
    },

    // Vedení míče a klička
    {
      id: "trenink-dribbling-1",
      lessonId: "trenink-dribbling",
      text: "Které tři dovednosti řadí anglický svaz (FA) pod pohyb s míčem?",
      options: [
        "Přihrávku, střelu a hlavičku",
        "Vedení míče, kličkování a obraty",
        "Skluz, odkop a vhazování",
        "Žonglování, kopanou a nohejbal",
      ],
      correct: 1,
      explain: "FA řadí pod pohyb s míčem vedení míče, kličkování a obraty. Liší se počtem a druhem doteků.",
    },
    {
      id: "trenink-dribbling-2",
      lessonId: "trenink-dribbling",
      text: "Kdy se hodí vedení míče s co nejmenším počtem doteků?",
      options: [
        "Když hráče obstoupí tři soupeři",
        "Když hráč stojí zády k brance v pokutovém území",
        "Když je před hráčem volný prostor a nikdo mu nestojí v cestě",
        "Když chce hráč zdržovat a čekat na střídání",
      ],
      correct: 2,
      explain: "Vedení míče je běh do volného prostoru: míč kus před sebe, málo doteků a skoro plná rychlost.",
    },
    {
      id: "trenink-dribbling-3",
      lessonId: "trenink-dribbling",
      text: "Co zjistila studie Huijgena a kolegů o sprintu bez míče a sprintu s míčem?",
      options: [
        "Jde o tutéž schopnost, kdo je rychlý, umí i kličkovat",
        "Kličkování se po 14. roce už nezlepšuje",
        "Na kličkování nemá počet hodin tréninku vliv",
        "Souvisely jen slabě až středně, jde o odlišné schopnosti",
      ],
      correct: 3,
      explain: "Sprint a sprint s míčem spolu souvisely jen slabě až středně. S kličkováním souvisel i počet hodin tréninku.",
    },
    {
      id: "trenink-dribbling-4",
      lessonId: "trenink-dribbling",
      text: "Jak se podle studie Huijgena a kolegů vyvíjelo kličkování po 16. roce věku?",
      options: [
        "Výrazně se zlepšovalo, kdežto sprint už skoro ne",
        "Zhoršovalo se, protože hráči rostou",
        "Zůstávalo stejné, technika se učí jen do 12 let",
        "Zlepšovalo se jen u brankářů",
      ],
      correct: 0,
      explain: "Po šestnáctce se kličkování výrazně zlepšovalo a sprint skoro ne. Na techniku není pozdě ani u dorostu.",
    },
    {
      id: "trenink-dribbling-5",
      lessonId: "trenink-dribbling",
      text: "Proti komu předvedl Johan Cruyff svou slavnou otočku na MS 1974?",
      options: [
        "Proti Západnímu Německu ve finále v Mnichově",
        "Proti Švédsku a obránci Janu Olssonovi",
        "Proti Brazílii a jejímu brankáři",
        "Proti Československu v přátelském zápase",
      ],
      correct: 1,
      explain: "Cruyffova otočka se proslavila v zápase Nizozemsko – Švédsko v Dortmundu, obětí byl Jan Olsson.",
    },

    // Slabší noha
    {
      id: "trenink-weaker-foot-1",
      lessonId: "trenink-weaker-foot",
      text: "Kolik hráčů na MS 1998 bylo podle Careyho a kolegů pravonohých?",
      options: [
        "Přes 95 %",
        "Zhruba polovina",
        "Zhruba 79 %, stejně jako v běžné populaci",
        "Jen asi třetina, elita je hlavně obounohá",
      ],
      correct: 2,
      explain: "Hráči na MS 1998 byli zhruba ze 79 % pravonozí, tedy stejně jako běžná populace.",
    },
    {
      id: "trenink-weaker-foot-2",
      lessonId: "trenink-weaker-foot",
      text: "Jak úspěšní byli hráči na MS 1998 se slabší nohou, když ji použili?",
      options: [
        "Výrazně horší, proto ji skoro nepoužívali",
        "Úspěšní jen při standardních situacích",
        "Úspěšnější než s lepší nohou, protože to soupeř nečekal",
        "V průměru stejně úspěšní jako s lepší nohou",
      ],
      correct: 3,
      explain: "Když slabší nohu použili, byli s ní v průměru stejně úspěšní. Malé používání tedy nevysvětluje jen horší dovednost.",
    },
    {
      id: "trenink-weaker-foot-3",
      lessonId: "trenink-weaker-foot",
      text: "Při čem byli hráči na MS 1998 nejvíc jednostranní?",
      options: [
        "Při standardních situacích",
        "Při hlavičkách",
        "Při vhazování",
        "Při skluzech, jinak hráli obounož",
      ],
      correct: 0,
      explain: "Nejvíc jednostranní byli hráči při standardních situacích, i když slabší nohu málo používali i jinde.",
    },
    {
      id: "trenink-weaker-foot-4",
      lessonId: "trenink-weaker-foot",
      text: "Co dělala tréninková skupina ve studii Haalanda a Hoffa?",
      options: [
        "Osm týdnů střílela penalty lepší nohou",
        "Osm týdnů dělala všechna cvičení kromě hry jen slabší nohou",
        "Trénovala jen v posilovně",
        "Hrála zápasy se zavázanou lepší nohou",
      ],
      correct: 1,
      explain: "Tréninková skupina dělala osm týdnů všechna cvičení kromě hry jen slabší nohou.",
    },
    {
      id: "trenink-weaker-foot-5",
      lessonId: "trenink-weaker-foot",
      text: "Co se stalo s lepší nohou hráčů, kteří osm týdnů trénovali slabší nohou?",
      options: [
        "Zhoršila se, protože ji nepoužívali",
        "Zůstala úplně stejná",
        "Zlepšila se také",
        "Začala bolet a hráči museli přestat",
      ],
      correct: 2,
      explain: "Hráči se zlepšili slabší nohou a k překvapení autorů i lepší nohou. Vysvětlují to lepším řízením pohybu obecně.",
    },

    // Hlavičkování
    {
      id: "trenink-heading-1",
      lessonId: "trenink-heading",
      text: "Co zjistila skotská studie Mackaye a kolegů (2019) u bývalých profesionálů?",
      options: [
        "Umírali častěji na nemoci srdce než ostatní lidé",
        "Neurodegenerativní nemoci u nich byly stejně časté jako v běžné populaci",
        "Hlavičky přímo počítali na trénincích",
        "Úmrtí s neurodegenerativní nemocí jako hlavní příčinou bylo zhruba 3,5krát častější",
      ],
      correct: 3,
      explain: "Bývalí profesionálové umírali méně na nemoci srdce, ale úmrtí s neurodegenerativní nemocí jako hlavní příčinou bylo zhruba 3,5krát častější.",
    },
    {
      id: "trenink-heading-2",
      lessonId: "trenink-heading",
      text: "Kolik hlaviček s větší silou za tréninkový týden doporučuje anglický svaz profesionálům?",
      options: ["Nejvýš 10", "Nejvýš 50", "Nejvýš 100, ale jen po rozcvičce", "Neomezeně, omezení platí jen pro děti"],
      correct: 0,
      explain: "Profesionálové mají mít nejvýš 10 hlaviček s větší silou za tréninkový týden, třeba po centrech nebo dlouhých míčích.",
    },
    {
      id: "trenink-heading-3",
      lessonId: "trenink-heading",
      text: "Jak má podle anglického svazu nacvičovat hlavičky dospělý amatérský tým?",
      options: [
        "Každý trénink aspoň 30 hlaviček",
        "Nanejvýš v jednom tréninku týdně a v něm nejvýš 10 hlaviček",
        "Vůbec, dospělí amatéři hlavičkovat nesmějí",
        "Jen v zimní přípravě na umělé trávě",
      ],
      correct: 1,
      explain: "Dospělí amatéři mají hlavičky nacvičovat nanejvýš v jednom tréninku týdně a v něm nejvýš desetkrát.",
    },
    {
      id: "trenink-heading-4",
      lessonId: "trenink-heading",
      text: "Čím se míč při hlavičce trefuje?",
      options: [
        "Temenem, aby letěl výš",
        "Zátylkem, aby se prodloužil",
        "Čelem, s otevřenýma očima",
        "Spánkem, aby šel do strany",
      ],
      correct: 2,
      explain: "Míč se trefuje čelem, ne temenem, oči zůstávají otevřené a hráč míč sleduje.",
    },
    {
      id: "trenink-heading-5",
      lessonId: "trenink-heading",
      text: "Co ve studii Caccese a kolegů souviselo s menším zrychlením hlavy při hlavičce?",
      options: [
        "Delší vlasy",
        "Rychlejší rozběh",
        "Zavřené oči",
        "Silnější krční svaly a větší hlava a krk",
      ],
      correct: 3,
      explain: "Menší zrychlení hlavy měli hráči s větší hlavou a krkem a se silnějšími krčními svaly, proto patří posilování krku k přípravě.",
    },

    // Rondo
    {
      id: "trenink-rondo-1",
      lessonId: "trenink-rondo",
      text: "Jak se v rondu obvykle střídá obránce uprostřed?",
      options: [
        "Kdo míč získá, jde ven, a doprostřed jde ten, kdo ho ztratil",
        "Obránci se nestřídají, celé cvičení jsou uprostřed stejní",
        "Střídá je trenér vždy po pěti minutách bez ohledu na hru",
        "Doprostřed jde vždycky nejmladší hráč",
      ],
      correct: 0,
      explain: "Obránce, který míč získá, jde ven a doprostřed jde hráč, který míč ztratil.",
    },
    {
      id: "trenink-rondo-2",
      lessonId: "trenink-rondo",
      text: "Kdy zařadil Johan Cruyff rondo do tréninku Barcelony?",
      options: [
        "Jako hráč Ajaxu v 60. letech",
        "Po svém příchodu do klubu v roce 1988",
        "Až po zisku Ligy mistrů v roce 2009",
        "Nikdy, rondo vymyslel až Guardiola",
      ],
      correct: 1,
      explain: "Cruyff po příchodu do Barcelony v roce 1988 zařadil rondo do tréninku i do předzápasové přípravy.",
    },
    {
      id: "trenink-rondo-3",
      lessonId: "trenink-rondo",
      text: "Co chce podle lekce Pep Guardiola od útočníků v rondu?",
      options: [
        "Kopat míč co nejvýš, aby na něj obránci nedosáhli",
        "Držet míč co nejdéle u nohy",
        "Vtáhnout obránce k míči a pak přihrát volnému spoluhráči jinde",
        "Hrát jen dlouhé přihrávky přes celý kruh",
      ],
      correct: 2,
      explain: "Guardiola chce obránce vtáhnout k míči a pak hru přenést k volnému spoluhráči.",
    },
    {
      id: "trenink-rondo-4",
      lessonId: "trenink-rondo",
      text: "Čím se dá rondo ztížit?",
      options: [
        "Přidáním obránců tak, aby měli přesilu",
        "Zvětšením prostoru a volnými doteky",
        "Delší přestávkou mezi koly",
        "Omezením počtu doteků a menším prostorem",
      ],
      correct: 3,
      explain: "Omezení doteků a menší prostor rondo ztíží. Obránců má být vždycky méně než útočníků.",
    },
    {
      id: "trenink-rondo-5",
      lessonId: "trenink-rondo",
      text: "Kterou slabinu ronda lekce uvádí?",
      options: [
        "Nemá směr a nenacvičí se v něm dlouhé přihrávky",
        "Potřebuje celé hřiště a dvacet hráčů",
        "Hráči v něm skoro nedostanou míč",
        "Je zakázané v soutěžích mládeže",
      ],
      correct: 0,
      explain: "Rondo nemá směr a hraje se po zemi, takže v něm chybí středně dlouhé a dlouhé přihrávky.",
    },

    // Hry na malém prostoru: pravidla podle cíle
    {
      id: "trenink-ssg-rules-1",
      lessonId: "trenink-ssg-rules",
      text: "Která hra přinesla ve studii Clementeho a kolegů nejvíc technických a taktických akcí?",
      options: ["4 na 4", "2 na 2", "3 na 3", "11 na 11"],
      correct: 1,
      explain: "Nejvíc technických a taktických akcí přinesla hra 2 na 2, nejvyšší tepovou frekvenci 3 na 3.",
    },
    {
      id: "trenink-ssg-rules-2",
      lessonId: "trenink-ssg-rules",
      text: "Co přinesla reprezentantům hra 4 na 4 na jeden dotek?",
      options: [
        "Nejvíc soubojů ze všech variant",
        "Nejmenší pokles výkonu během opakování",
        "Víc akcí ve vysoké intenzitě, ale víc potíží zahrát technicky správně",
        "Nic, počet doteků hru nijak nemění",
      ],
      correct: 2,
      explain: "Hra na jeden dotek zvýšila počet akcí ve vysoké intenzitě, ale hráči měli větší potíže s technicky správnou akcí.",
    },
    {
      id: "trenink-ssg-rules-3",
      lessonId: "trenink-ssg-rules",
      text: "Proč je dobré žolíka v hrách na malém prostoru střídat?",
      options: [
        "Žolík smí podle pravidel hrát jen pět minut",
        "Žolík naběhá nejvíc ze všech a rychle se unaví",
        "Žolík nesmí střílet, takže se nudí",
        "Žolík naběhá méně než ostatní hráči",
      ],
      correct: 3,
      explain: "Měření ve francouzském klubu ukázalo, že žolík naběhá méně než ostatní, proto se má role střídat.",
    },
    {
      id: "trenink-ssg-rules-4",
      lessonId: "trenink-ssg-rules",
      text: "Co zjistila malá studie Farhaniho a kolegů o souvislém úseku 12 minut oproti třem úsekům po 4 minutách?",
      options: [
        "Víc úspěšných přihrávek, méně ztrát a větší radost ze hry",
        "Víc ztrát míče a nižší tepovou frekvenci",
        "Žádný rozdíl v ničem",
        "Hráči si stěžovali na nudu a hráli hůř",
      ],
      correct: 0,
      explain: "Při souvislém úseku měli hráči víc úspěšných přihrávek, méně ztrát a větší radost ze hry.",
    },
    {
      id: "trenink-ssg-rules-5",
      lessonId: "trenink-ssg-rules",
      text: "Jaké pravidlo lekce navrhuje pro tým, který po ztrátě míče jen kouká?",
      options: [
        "Gól platí jen hlavou",
        "Gól po zisku míče na útočné polovině platí dvakrát",
        "Hraje se bez brankářů",
        "Kdo ztratí míč, musí oběhnout kužel",
      ],
      correct: 1,
      explain: "Pravidlo se volí podle cíle: dvojnásobný gól po zisku na útočné polovině odměňuje okamžité napadání.",
    },

    // Souboje 1 na 1 a přesilovka 2 na 1
    {
      id: "trenink-one-v-one-1",
      lessonId: "trenink-one-v-one",
      text: "Co ve studii Wilsona a kolegů nejlépe předpovídalo úspěch útočníka v souboji 1 na 1?",
      options: [
        "Rychlost sprintu bez míče",
        "Výška a hmotnost hráče",
        "Rychlost vedení míče po zakřivené dráze",
        "Počet žonglů za minutu",
      ],
      correct: 2,
      explain: "Úspěch předpovídala rychlost vedení míče po zakřivené dráze, sprint bez míče ne.",
    },
    {
      id: "trenink-one-v-one-2",
      lessonId: "trenink-one-v-one",
      text: "Kam má obránce podle anglického svazu útočníka v souboji 1 na 1 vytlačit?",
      options: [
        "Doprostřed před branku, kde jsou ostatní obránci",
        "Na jeho silnější nohu",
        "Kamkoli, hlavně rychle do skluzu",
        "Na jeho slabší stranu a pryč od branky",
      ],
      correct: 3,
      explain: "Obránce má útočníka vytlačit na jeho slabší stranu a pryč od branky.",
    },
    {
      id: "trenink-one-v-one-3",
      lessonId: "trenink-one-v-one",
      text: "Jak se má obránce chovat, když se blíží k útočníkovi s míčem?",
      options: [
        "Zpomalit, pokrčit kolena a stát bokem",
        "Zrychlit a skočit do skluzu co nejdřív",
        "Postavit se čelem a roztáhnout ruce",
        "Zastavit se deset metrů daleko a jen čekat",
      ],
      correct: 0,
      explain: "Při přibližování má obránce zpomalit, pokrčit kolena, stát bokem a neskákat do skluzu naslepo.",
    },
    {
      id: "trenink-one-v-one-4",
      lessonId: "trenink-one-v-one",
      text: "Kdy má hráč s míčem v přesilovce 2 na 1 přihrát?",
      options: [
        "Hned po převzetí míče, ještě daleko od obránce",
        "Když obránce vystoupí k němu",
        "Až když ho obránce obejde",
        "Nikdy, přesilovka se má řešit kličkou",
      ],
      correct: 1,
      explain: "Hráč vede míč na obránce, a jakmile obránce vystoupí k němu, přihraje volnému spoluhráči.",
    },
    {
      id: "trenink-one-v-one-5",
      lessonId: "trenink-one-v-one",
      text: "Co je u narážečky důležité po přihrávce?",
      options: [
        "Zastavit se a sledovat, co spoluhráč udělá",
        "Zvednout ruku a hlásit ofsajd",
        "Prudká změna tempa",
        "Vrátit se do obrany",
      ],
      correct: 2,
      explain: "Narážečka potřebuje po přihrávce prudkou změnu tempa, jinak obránce stihne zareagovat.",
    },

    // Jak trenér učí a opravuje
    {
      id: "trenink-guided-discovery-1",
      lessonId: "trenink-guided-discovery",
      text: "Kdo a kdy popsal model Teaching Games for Understanding?",
      options: [
        "Johan Cruyff v Barceloně v roce 1988",
        "Rinus Michels v roce 1974",
        "Gabriele Wulfová v roce 2013",
        "David Bunker a Rod Thorpe v roce 1982",
      ],
      correct: 3,
      explain: "Model popsali David Bunker a Rod Thorpe v roce 1982 na univerzitě v Loughborough.",
    },
    {
      id: "trenink-guided-discovery-2",
      lessonId: "trenink-guided-discovery",
      text: "Čím výuka podle modelu Teaching Games for Understanding začíná?",
      options: [
        "Upravenou hrou",
        "Dlouhým nácvikem techniky bez soupeře",
        "Teoretickou přednáškou u tabule",
        "Kondičním během",
      ],
      correct: 0,
      explain: "Začíná se upravenou hrou, hráči pochopí, o co jde, a technika se dolaďuje podle toho, co hra ukáže.",
    },
    {
      id: "trenink-guided-discovery-3",
      lessonId: "trenink-guided-discovery",
      text: "Co zjistila souhrnná analýza Ortize a kolegů (2023) o výuce her s porozuměním?",
      options: [
        "Zhoršuje techniku, a proto se nedoporučuje",
        "Přináší lepší rozhodování ve hře, v provedení dovedností se skupiny nelišily",
        "Technický přístup je lepší ve všem",
        "Mezi přístupy není žádný rozdíl",
      ],
      correct: 1,
      explain: "Oproti technickému přístupu přinesla výrazně lepší rozhodování, v samotném provedení dovedností rozdíl nebyl.",
    },
    {
      id: "trenink-guided-discovery-4",
      lessonId: "trenink-guided-discovery",
      text: "Co tvrdí hypotéza vedení o zpětné vazbě po každém pokusu?",
      options: [
        "Je vždy nejlepší, čím víc rad, tím líp",
        "Hráče nijak neovlivní",
        "Zlepší výkon v tréninku, ale hráč si na ni zvykne a bez ní hraje hůř",
        "Pomáhá jen brankářům",
      ],
      correct: 2,
      explain: "Častá zpětná vazba zlepší výkon v tréninku, ale hráč na ní začne záviset a bez ní hraje hůř.",
    },
    {
      id: "trenink-guided-discovery-5",
      lessonId: "trenink-guided-discovery",
      text: "Co zjistili Winstein a Schmidt (1990)?",
      options: [
        "Zpětná vazba má přijít až týden po tréninku",
        "Bez jakékoli zpětné vazby se hráči učí nejlépe",
        "Zpětná vazba po každém pokusu je pro zapamatování nejlepší",
        "Zpětná vazba po polovině pokusů vedla k lepšímu zapamatování než po každém pokusu",
      ],
      correct: 3,
      explain: "Skupina se zpětnou vazbou po polovině pokusů si dovednost zapamatovala lépe, i když ne všechny pozdější studie to potvrdily.",
    },

    // Zimní přestávka a příprava
    {
      id: "trenink-winter-prep-1",
      lessonId: "trenink-winter-prep",
      text: "Co podle Mujiky a Padilly rychle klesá už při krátké pauze v tréninku?",
      options: [
        "Maximální spotřeba kyslíku a objem krve",
        "Hlavně síla, vytrvalost vydrží",
        "Výška hráče",
        "Nic, pauza do čtyř týdnů je bez následků",
      ],
      correct: 0,
      explain: "Při krátké pauze rychle klesá maximální spotřeba kyslíku a objem krve, síla jen málo.",
    },
    {
      id: "trenink-winter-prep-2",
      lessonId: "trenink-winter-prep",
      text: "Co zjistili Hickson a Rosenkoetter, když lidé trénovali jen dvakrát týdně ve stejné intenzitě?",
      options: [
        "Maximální spotřeba kyslíku klesla na výchozí úroveň",
        "Maximální spotřeba kyslíku se udržela 15 týdnů",
        "Lidé se zranili z přetížení",
        "Kondici udržel jen trénink čtyřikrát týdně",
      ],
      correct: 1,
      explain: "Při dvou i čtyřech trénincích týdně ve stejné intenzitě se maximální spotřeba kyslíku udržela 15 týdnů.",
    },
    {
      id: "trenink-winter-prep-3",
      lessonId: "trenink-winter-prep",
      text: "Co se stalo, když skupina při stejném počtu tréninků snížila intenzitu o třetinu?",
      options: [
        "Kondice dál rostla",
        "Nic, na intenzitě nezáleží",
        "Maximální spotřebu kyslíku už neudržela",
        "Zlepšila se hlavně síla",
      ],
      correct: 2,
      explain: "Se sníženou intenzitou maximální spotřeba kyslíku klesala. Pro udržení kondice je intenzita klíčová.",
    },
    {
      id: "trenink-winter-prep-4",
      lessonId: "trenink-winter-prep",
      text: "Co přibylo po zkrácení zimní přestávky v německých profesionálních ligách?",
      options: [
        "Celkový počet zranění se zdvojnásobil",
        "Zranění brankářů",
        "Žluté karty za nesportovní chování",
        "Zranění v tréninku a zranění kolen",
      ],
      correct: 3,
      explain: "Celkový počet zranění se nezměnil, ale přibylo zranění v tréninku a zranění kolen.",
    },
    {
      id: "trenink-winter-prep-5",
      lessonId: "trenink-winter-prep",
      text: "Co zjistila studie Ekstranda a kolegů o umělé trávě třetí generace?",
      options: [
        "Celkový počet úrazů se od přírodní trávy nelišil",
        "Úrazů bylo na umělé trávě třikrát víc",
        "Úrazů bylo na umělé trávě o polovinu méně",
        "Na umělé trávě se nezranil nikdo",
      ],
      correct: 0,
      explain: "Celkový počet úrazů byl stejný, muži měli na umělé trávě jen o něco víc podvrtnutých kotníků.",
    },

    // Aerobní vytrvalost a tepovka
    {
      id: "trenink-aerobic-base-1",
      lessonId: "trenink-aerobic-base",
      text: "Jakou průměrnou tepovou frekvenci mají hráči v poli během zápasu podle expertů UEFA?",
      options: ["Kolem 50 % maxima", "Kolem 85 % maxima", "Pořád 100 % maxima", "Kolem 65 % maxima"],
      correct: 1,
      explain: "Hráči v poli mají během zápasu průměrně kolem 85 % maximální tepové frekvence.",
    },
    {
      id: "trenink-aerobic-base-2",
      lessonId: "trenink-aerobic-base",
      text: "Čím se ve studii Tomlina a Wengera lišila skupina s vyšší maximální spotřebou kyslíku?",
      options: [
        "Měla výrazně vyšší výkon v prvním sprintu",
        "Neuběhla ani jeden sprint",
        "Výkon jí během série sprintů klesl méně",
        "Ničím, aerobní kondice na sprinty vliv nemá",
      ],
      correct: 2,
      explain: "Nejvyšší výkon měly obě skupiny stejný, ale lépe trénovaným klesl během série jen asi o 9 %, ostatním o 18 %.",
    },
    {
      id: "trenink-aerobic-base-3",
      lessonId: "trenink-aerobic-base",
      text: "Jaký vzorec pro odhad maximální tepové frekvence navrhli Tanaka a kolegové?",
      options: ["220 minus věk", "200 plus věk", "180 minus polovina věku", "208 minus 0,7 × věk"],
      correct: 3,
      explain: "Souhrnná analýza 351 studií navrhla vzorec 208 minus 0,7 × věk.",
    },
    {
      id: "trenink-aerobic-base-4",
      lessonId: "trenink-aerobic-base",
      text: "Co platí podle Tanaky a kolegů o vzorci 220 minus věk?",
      options: [
        "U starších lidí maximum podceňuje",
        "Je naprosto přesný pro každého",
        "Platí jen pro ženy",
        "U starších lidí maximum přeceňuje",
      ],
      correct: 0,
      explain: "Starý vzorec maximum u starších lidí podceňuje, šedesátiletému vyjde 160 místo 166.",
    },
    {
      id: "trenink-aerobic-base-5",
      lessonId: "trenink-aerobic-base",
      text: "K čemu se hodí nejrychlejší tempo, ve kterém hráč ještě pohodlně mluví?",
      options: [
        "K maximálním sprintům",
        "K regeneračním a dlouhým klidným běhům",
        "K testu maximální tepové frekvence",
        "K ničemu, takové tempo je zbytečné",
      ],
      correct: 1,
      explain: "Toto tempo odpovídá zhruba ventilačnímu prahu a hodí se na regenerační a dlouhé klidné běhy.",
    },

    // Jídlo a pití kolem zápasu
    {
      id: "trenink-match-nutrition-1",
      lessonId: "trenink-match-nutrition",
      text: "Kolik sacharidů má podle expertů UEFA obsahovat předzápasové jídlo a kdy se jí?",
      options: [
        "10 g na kilogram těsně před výkopem",
        "Žádné, před zápasem se nejí",
        "1–3 g na kilogram zhruba 3–4 hodiny před výkopem",
        "Půl kila masa hodinu před výkopem",
      ],
      correct: 2,
      explain: "Předzápasové jídlo má mít 1–3 g sacharidů na kilogram a jí se zhruba 3–4 hodiny před výkopem.",
    },
    {
      id: "trenink-match-nutrition-2",
      lessonId: "trenink-match-nutrition",
      text: "Proč je snídaně důležitá hlavně před polední hrou?",
      options: [
        "Protože ráno je trávení nejrychlejší",
        "Protože svalový glykogen přes noc úplně zmizí",
        "Protože se v poledne hraje rychleji",
        "Protože zásoby glykogenu v játrech přes noc klesnou asi o polovinu",
      ],
      correct: 3,
      explain: "Zásoby glykogenu v játrech klesnou po noci asi o polovinu, a proto snídaně rozhoduje hlavně před polední hrou.",
    },
    {
      id: "trenink-match-nutrition-3",
      lessonId: "trenink-match-nutrition",
      text: "Kolik sacharidů doporučují experti UEFA po rozcvičce a znovu o poločase?",
      options: ["30–60 g", "Žádné, v zápase se pije jen voda", "Aspoň 300 g", "5 g"],
      correct: 0,
      explain: "Doporučuje se 30–60 g sacharidů po rozcvičce a znovu o poločase.",
    },
    {
      id: "trenink-match-nutrition-4",
      lessonId: "trenink-match-nutrition",
      text: "Co doporučují experti UEFA po zápase?",
      options: [
        "Nejíst do druhého dne",
        "Zhruba 1 g sacharidů na kilogram každou hodinu po dobu 4 hodin a bílkoviny po 20–25 g",
        "Jen bílkoviny, sacharidy po zápase škodí",
        "Hlavně tuky, aby se doplnila energie",
      ],
      correct: 1,
      explain: "Po zápase zhruba 1 g sacharidů na kilogram každou hodinu po 4 hodiny a bílkoviny po 20–25 g každé 3–4 hodiny.",
    },
    {
      id: "trenink-match-nutrition-5",
      lessonId: "trenink-match-nutrition",
      text: "O kolik klesla ve studii Parra a kolegů tvorba svalových bílkovin, když sportovci k alkoholu pili protein?",
      options: ["O 2 %", "Vůbec, protein alkohol vyrovnal", "Asi o 24 %", "O 90 %"],
      correct: 2,
      explain: "I s proteinem byla tvorba svalových bílkovin o 24 % nižší, se sacharidy místo proteinu o 37 %.",
    },

    // Trénink brankáře
    {
      id: "trenink-goalkeeper-1",
      lessonId: "trenink-goalkeeper",
      text: "Kolik času brankář podle rozboru Premier League během zápasu chodí?",
      options: ["Asi 10 %", "Asi 30 %", "Asi 50 %", "Asi 73 %"],
      correct: 3,
      explain: "Brankář za zápas urazí asi 5,6 km, 73 % času chodí a jen 2 % se pohybuje ve vysoké intenzitě.",
    },
    {
      id: "trenink-goalkeeper-2",
      lessonId: "trenink-goalkeeper",
      text: "Kolik zákroků za zápas uvádí přehled Whitea a kolegů?",
      options: ["2–10", "30–40", "Přes 100", "Ani jeden, brankář jen rozehrává"],
      correct: 0,
      explain: "Brankář má za zápas 2–10 zákroků, často výbušných, jako jsou skoky a pády.",
    },
    {
      id: "trenink-goalkeeper-3",
      lessonId: "trenink-goalkeeper",
      text: "Kolik pádů udělal brankář v Premier League průměrně při brankářském tréninku a kolik při hře na malém prostoru?",
      options: [
        "5 při brankářském tréninku, 51 při hře",
        "51 při brankářském tréninku, 5 při hře",
        "V obou případech kolem 20",
        "Při hře víc, protože se v ní hodně střílí",
      ],
      correct: 1,
      explain: "Při brankářském tréninku 51 pádů, při hře na malém prostoru jen 5. Brankář proto potřebuje trénovat i zvlášť.",
    },
    {
      id: "trenink-goalkeeper-4",
      lessonId: "trenink-goalkeeper",
      text: "Kde má brankář stát vzhledem k míči?",
      options: [
        "Vždy uprostřed branky na brankové čáře",
        "U bližší tyče, ať se děje cokoli",
        "Na pomyslné čáře mezi míčem a středem branky",
        "Co nejdál před brankou, i když hrozí přehození",
      ],
      correct: 2,
      explain: "Brankář stojí na pomyslné čáře mezi míčem a středem branky, ne moc daleko ani moc hluboko.",
    },
    {
      id: "trenink-goalkeeper-5",
      lessonId: "trenink-goalkeeper",
      text: "Od kterého roku nesmí brankář vzít do rukou úmyslnou přihrávku nohou od spoluhráče?",
      options: ["Od roku 1970", "Od roku 1982", "Od roku 2010", "Od roku 1992"],
      correct: 3,
      explain: "Pravidlo platí od roku 1992, mimo jiné kvůli zdržování hry na MS 1990. Brankář proto musí umět hrát i nohama.",
    },

    // GPS a běh vysokou rychlostí
    {
      id: "trenink-gps-speed-1",
      lessonId: "trenink-gps-speed",
      text: "Které GPS přístroje byly podle přehledu Scotta a kolegů nejspolehlivější?",
      options: [
        "S frekvencí 10 Hz",
        "S frekvencí 1 Hz",
        "S frekvencí 15 Hz, výrazně lepší než 10 Hz",
        "Všechny stejně, na frekvenci nezáleží",
      ],
      correct: 0,
      explain: "Nejspolehlivější byly přístroje s 10 Hz, zvýšení na 15 Hz už nic nepřidalo.",
    },
    {
      id: "trenink-gps-speed-2",
      lessonId: "trenink-gps-speed",
      text: "S čím mají potíže GPS přístroje s frekvencí 1 a 5 Hz?",
      options: [
        "S měřením tepové frekvence",
        "S během vysokou rychlostí, krátkými úseky a změnami směru",
        "S měřením celkové vzdálenosti",
        "S měřením v dešti",
      ],
      correct: 1,
      explain: "Vzdálenost změří slušně, ale běh vysokou rychlostí, krátké úseky a změny směru zkreslují.",
    },
    {
      id: "trenink-gps-speed-3",
      lessonId: "trenink-gps-speed",
      text: "Od jaké rychlosti se obvykle počítá běh vysokou rychlostí?",
      options: ["Od 7,2 km/h", "Od 14,4 km/h", "Od 19,8 km/h", "Od 30 km/h"],
      correct: 2,
      explain: "Běh vysokou rychlostí se počítá od 19,8 km/h; 14,4 km/h je hranice běhu vysokou intenzitou.",
    },
    {
      id: "trenink-gps-speed-4",
      lessonId: "trenink-gps-speed",
      text: "Co ukázal rozbor Premier League (Bradley a kol., 2009) o posledních 15 minutách zápasu?",
      options: [
        "Hráči běhali vysokou intenzitou víc než na začátku",
        "Rozdíly mezi posty zmizely",
        "Pauzy mezi nejrychlejšími úseky se zkrátily",
        "Hráči naběhali vysokou intenzitou asi o pětinu méně než v prvních 15 minutách",
      ],
      correct: 3,
      explain: "V posledních 15 minutách naběhali hráči všech postů vysokou intenzitou asi o pětinu méně a pauzy mezi nejrychlejšími úseky se prodloužily.",
    },
    {
      id: "trenink-gps-speed-5",
      lessonId: "trenink-gps-speed",
      text: "Jak se podle expertů UEFA liší běžný trénink profesionálů od zápasu v běhu vysokou rychlostí?",
      options: [
        "V tréninku ho je méně, pod 300 m oproti víc než 900 m v zápase",
        "V tréninku ho je víc než v zápase",
        "Je stejný, trénink přesně kopíruje zápas",
        "V tréninku se vysokou rychlostí neběhá vůbec",
      ],
      correct: 0,
      explain: "V běžném tréninku je běhu vysokou rychlostí pod 300 m, v zápase víc než 900 m. Kdo nehrál, potřebuje dávku doplnit.",
    },

    // Akutní a chronická zátěž
    {
      id: "trenink-acute-chronic-1",
      lessonId: "trenink-acute-chronic",
      text: "Jak se podle Fostera počítá monotónnost tréninku?",
      options: [
        "Jako součet minut za týden",
        "Jako průměrná denní zátěž vydělená směrodatnou odchylkou",
        "Jako počet tréninků krát počet zápasů",
        "Jako nejtěžší den minus nejlehčí den",
      ],
      correct: 1,
      explain: "Monotónnost je průměrná denní zátěž vydělená směrodatnou odchylkou. Čím podobnější dny, tím vyšší monotónnost.",
    },
    {
      id: "trenink-acute-chronic-2",
      lessonId: "trenink-acute-chronic",
      text: "Co podle Gabbetta stojí hlavně za bezkontaktními zraněními?",
      options: [
        "Vysoká zátěž sama o sobě",
        "Příliš mnoho regenerace",
        "Nevhodný program a hlavně prudké skoky v zátěži",
        "Špatné počasí",
      ],
      correct: 2,
      explain: "Podle paradoxu prevence zranění nezraňuje trénink sám o sobě, ale nevhodný program a prudké skoky v zátěži.",
    },
    {
      id: "trenink-acute-chronic-3",
      lessonId: "trenink-acute-chronic",
      text: "Jaký poměr akutní a chronické zátěže označil Gabbett za „sweet spot“?",
      options: ["0,2–0,5", "1,5–2,0", "2,0 a víc", "0,8–1,3"],
      correct: 3,
      explain: "Za sweet spot označil poměr 0,8–1,3, poměr 1,5 a víc za nebezpečnou zónu.",
    },
    {
      id: "trenink-acute-chronic-4",
      lessonId: "trenink-acute-chronic",
      text: "O kolik nejvýš doporučil Gabbett zvyšovat týdenní zátěž?",
      options: [
        "O méně než 10 %",
        "O 25 %",
        "O 50 %",
        "Klidně na dvojnásobek, když se hráč cítí dobře",
      ],
      correct: 0,
      explain: "Doporučil nárůst pod 10 % za týden, protože při skoku o 15 % a víc riziko zranění výrazně rostlo.",
    },
    {
      id: "trenink-acute-chronic-5",
      lessonId: "trenink-acute-chronic",
      text: "Co namítli Impellizzeri a kolegové (2020) k poměru akutní a chronické zátěže?",
      options: [
        "Že se má počítat denně místo týdně",
        "Že nejsou důkazy, že řízení podle něj snižuje počet zranění",
        "Že funguje jen u brankářů",
        "Že sweet spot má být 1,5–2,0",
      ],
      correct: 1,
      explain: "Upozornili na statistické vady poměru a na to, že chybí důkazy, že řízení podle ACWR zranění snižuje.",
    },

    // Yo-Yo test
    {
      id: "trenink-yo-yo-1",
      lessonId: "trenink-yo-yo",
      text: "Jak dlouhý je aktivní odpočinek mezi úseky v Yo-Yo testu úrovně 1?",
      options: ["Žádný, běží se bez přestávky", "1 minuta", "10 sekund", "30 sekund vsedě"],
      correct: 2,
      explain: "Po každém úseku 2× 20 m má hráč 10 sekund aktivního odpočinku.",
    },
    {
      id: "trenink-yo-yo-2",
      lessonId: "trenink-yo-yo",
      text: "Kdy hráč v Yo-Yo testu končí?",
      options: [
        "Po přesně 20 minutách",
        "Když mu tepová frekvence přesáhne 180",
        "Hned když poprvé nedoběhne včas na čáru",
        "Když podruhé nedoběhne včas na čáru",
      ],
      correct: 3,
      explain: "Za první nedoběhnutí dostane varování, podruhé test končí.",
    },
    {
      id: "trenink-yo-yo-3",
      lessonId: "trenink-yo-yo",
      text: "Čím se liší úroveň 2 Yo-Yo testu od úrovně 1?",
      options: [
        "Víc zatěžuje anaerobní systém a schopnost zotavit se z opakovaných úseků",
        "Běží se s míčem",
        "Je určená jen pro brankáře",
        "Měří hlavně sílu nohou",
      ],
      correct: 0,
      explain: "Úroveň 1 žene k maximu hlavně aerobní systém, úroveň 2 víc zatěžuje anaerobní systém a zotavení.",
    },
    {
      id: "trenink-yo-yo-4",
      lessonId: "trenink-yo-yo",
      text: "S čím podle Krustrupa a kolegů souvisel běh vysokou intenzitou v zápase?",
      options: [
        "S maximální spotřebou kyslíku, ne s Yo-Yo testem",
        "S výsledkem Yo-Yo testu, ne s maximální spotřebou kyslíku",
        "S výškou hráče",
        "S ničím, byla to náhoda",
      ],
      correct: 1,
      explain: "Běh vysokou intenzitou v zápase souvisel s Yo-Yo testem (r = 0,71), s maximální spotřebou kyslíku ne.",
    },
    {
      id: "trenink-yo-yo-5",
      lessonId: "trenink-yo-yo",
      text: "O kolik se elitní hráči během přípravy zlepšili v Yo-Yo testu a o kolik v maximální spotřebě kyslíku?",
      options: [
        "O 7 % v testu a o 25 % ve spotřebě kyslíku",
        "Stejně, o 10 % v obou",
        "O 25 % v testu a o 7 % ve spotřebě kyslíku",
        "Nezlepšili se v ničem",
      ],
      correct: 2,
      explain: "Yo-Yo test se zlepšil o 25 %, maximální spotřeba kyslíku o 7 %. Test tedy citlivěji ukáže účinek přípravy.",
    },

    // Návrat po zranění
    {
      id: "trenink-return-to-play-1",
      lessonId: "trenink-return-to-play",
      text: "Jak má podle konsenzu z Bernu vypadat návrat ke sportu?",
      options: [
        "Jako jednorázové rozhodnutí lékaře na konci léčby",
        "Hráč se vrátí, jakmile ho v klidu nic nebolí",
        "Rozhodne trenér podle toho, jak důležitý je zápas",
        "Jako plynulá cesta souběžná s rehabilitací, ne jednorázové rozhodnutí",
      ],
      correct: 3,
      explain: "Konsenzus z Bernu chápe návrat jako plynulou cestu souběžnou s rehabilitací, o které se rozhoduje společně.",
    },
    {
      id: "trenink-return-to-play-2",
      lessonId: "trenink-return-to-play",
      text: "Co znamená „návrat ke sportu“ podle konsenzu z Bernu?",
      options: [
        "Hráč hraje svůj sport, ale ještě ne na úrovni, jakou chce",
        "Hráč hraje stejně dobře nebo lépe než před zraněním",
        "Hráč zatím jen jezdí na rotopedu",
        "Hráč chodí na zápasy jako divák",
      ],
      correct: 0,
      explain: "Návrat ke sportu znamená, že hráč hraje, ale ještě ne na úrovni, jakou chce. Plnou úroveň označuje návrat k výkonu.",
    },
    {
      id: "trenink-return-to-play-3",
      lessonId: "trenink-return-to-play",
      text: "Kolik svalových zranění v profesionálních evropských týmech bylo opakovaných?",
      options: [
        "Jen 1 %",
        "16 %, a znamenala delší absenci než první zranění",
        "Polovina",
        "16 %, ale hojila se rychleji než první zranění",
      ],
      correct: 1,
      explain: "Opakovaných bylo 16 % svalových zranění a znamenala delší absenci než první zranění.",
    },
    {
      id: "trenink-return-to-play-4",
      lessonId: "trenink-return-to-play",
      text: "Jak se ve studii Grindem a kolegů měnilo riziko opakovaného zranění kolena s odkladem návratu po operaci?",
      options: [
        "Na odkladu nezáleželo",
        "Riziko s každým měsícem odkladu rostlo",
        "Každý měsíc odkladu až do 9 měsíců ho snížil o 51 %",
        "Riziko kleslo až po dvou letech",
      ],
      correct: 2,
      explain: "Každý měsíc odkladu až do 9 měsíců po operaci snížil riziko o 51 %, později už se nesnižovalo.",
    },
    {
      id: "trenink-return-to-play-5",
      lessonId: "trenink-return-to-play",
      text: "Podle čeho má trenér vracet hráče po zranění do hry?",
      options: [
        "Podle kalendáře, po přesně šesti týdnech",
        "Podle toho, jak důležitý je nedělní zápas",
        "Podle toho, jak moc hráč chce hrát",
        "Podle kritérií, jako je síla, testy a trénink bez potíží",
      ],
      correct: 3,
      explain: "Hráč se vrací podle kritérií, ne podle kalendáře ani podle důležitosti zápasu.",
    },
  ],
};
