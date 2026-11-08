/**
 * Další díly skript „Karty“ (vlastnost Disciplína). 1. díl je v `../karty.ts`.
 *
 * Základní kurz: 2. díl „Disciplína v týmu“, 3. díl „Míč ve hře“, 4. díl „Zápas podle pravidel“.
 * Pokročilý kurz: 2. díl „Brankář a těžké situace“.
 *
 * Zdroje (ověřeno v listopadu 2026):
 * - Pravidla fotbalu IFAB, vydání 2026/27 (theifab.com/laws/latest): pravidlo 3 (časově omezené
 *   střídání, vyloučení před výkopem, opozdilec, FAQ), 4 (barvy, ochranná výstroj, elektronika,
 *   nápisy, 4.6), 5 (konečnost rozhodnutí, zranění a výjimky, karty o přestávce a po zápase,
 *   souběh přestupků, odpovědnost rozhodčích), 7 (nastavení, přestávky, FAQ), 8.2 (míč rozhodčího
 *   a FAQ), 9 (míč a rozhodčí, dotek osoby mimo hrací plochu), 10.3 (kopy ze značky pokutového
 *   kopu a FAQ), 12 (brankář a osm sekund, bránění a clonění, trik na brankáře, zdržování,
 *   simulování, hrubé nesportovní chování proti spoluhráči, 12.5 navázání hry, FAQ),
 *   14.2 (náhodný dvojí dotek), 15, 16 a 17 (vhazování, kop od branky, kop z rohu a FAQ),
 * - Notes and modifications 2026/27: Throw-in and goal-kick countdown protocol, Time-limited
 *   substitution protocol, Off-field treatment and assessment protocol, General modifications,
 * - IFAB: „The IFAB introduces further measures to improve match flow and player behaviour“
 *   (28. 2. 2026), „The IFAB tackles goalkeeper time-wasting“ (osm sekund od 2025/26), oběžník 33
 *   (odchod ze hřiště na protest jako možnost soutěže), oběžník 31 a zprávy Reuters/ESPN z června
 *   2025 (dvojí dotek po rozstřelu Atlético Madrid proti Realu Madrid, 12. 3. 2025),
 * - FAČR: česká terminologie Pravidel fotbalu; ČTK 24. 7. 2026 (FAČR přebírá úpravy 2026/27),
 * - fair play: arsenal.com a Irish Times (Arsenal proti Sheffield United, únor 1999, opakovaný zápas
 *   23. 2. 1999), Irish Times, Sky Sports a inside.fifa.com (Leeds proti Aston Ville, duben 2019, 1:1,
 *   cena FIFA fair play 2019).
 * Lekce o kabinových pokutách je praktická rada bez pravidlového základu, otázky se ptají jen na
 * doporučení z textu. Vynecháno jako neověřené: Disciplinární řád FAČR (výše trestů), značky
 * 9,15 m mimo hrací plochu u rohu, rok zavedení pravidla o malé domů.
 */
import type { CategoryContent, PartTitles } from "../types";

export const DISCIPLINE_PART_TITLES: PartTitles = {
  attr_basic: { 2: "Disciplína v týmu", 3: "Míč ve hře", 4: "Zápas podle pravidel" },
  attr_advanced: { 2: "Brankář a těžké situace" },
};

export const DISCIPLINE_PARTS: CategoryContent = {
  lessons: [
    // ─── Základní kurz, 2. díl: Disciplína v týmu ─────────────────────────────
    {
      id: "karty-team-fines",
      category: "karty",
      difficulty: 2,
      part: 2,
      title: "Pokladnička a pravidla kabiny",
      body: `Na okrese má skoro každá kabina svou **pokladničku**. Kdo přijde pozdě, platí. Kdo dostane zbytečnou žlutou, platí. Na konci sezóny se z toho zaplatí sud a guláš. Funguje to ale jen tehdy, když mají pokuty jasná pravidla.

Pravidla fotbalu o kabinových pokutách nic neříkají, je to vnitřní věc týmu. Osvědčily se tyhle zásady:
- **sazebník předem**: co se pokutuje a kolik, ví každý dřív, než to poruší. Pokuta vymyšlená po prohře v afektu je pomsta, ne disciplína,
- **stejně pro všechny**: nejlepší střelec platí za pozdní příchod stejně jako náhradník, jinak sazebník ztratí váhu,
- **přiměřená výše**: na okrese stačí desítky korun. Pokuta nemá hráče zruinovat, má mu připomenout dohodu,
- **průhledná pokladna**: peníze vede pokladník z řad hráčů, ne trenér, a jdou na společnou akci,
- **trestat chování, ne fotbal**: za zkaženou přihrávku nebo neproměněnou šanci se neplatí. Hráč, který se bojí chyby, hraje hůř.

Do sazebníku patří hlavně věci, které má hráč plně ve své moci: pozdní příchod, neomluvená absence, zapomenuté kopačky a **zbytečné karty**. Zbytečná je třeba žlutá za řeči na sudího, za odkopnutí míče po hvizdu nebo za svlečený dres při oslavě. Žlutá za taktický faul, kterým hráč zastavil soupeřův brejk, do pokladničky obvykle nepatří. Hráč tím udělal něco pro tým.

Kabinová pokuta není trest od svazu. Disciplinární komise trestá podle svých předpisů a dohoda v kabině na tom nic nezmění.

Nejsilnější zbraní ale není sazebník, je to **příklad trenéra**. Kdo sám chodí pozdě, ať se nediví, že pokladnička zeje prázdnotou.`,
    },
    {
      id: "karty-time-wasting",
      category: "karty",
      difficulty: 2,
      part: 2,
      title: "Zdržování hry a simulování",
      body: `Vedete o gól, je osmdesátá minuta a strejda na tribuně řve „hrajte to do autu!“. Zdržovat se dá chytře i hloupě. Hloupě to znamená žlutou.

Rozhodčí musí napomenout hráče, který **přehnaně zdržuje navázání hry**. Pravidla jako příklady uvádějí, když hráč:
- dělá, že bude vhazovat, a pak míč najednou nechá spoluhráči,
- se při střídání loudá z hrací plochy,
- přehnaně protahuje provedení kopu,
- po přerušení hry **odkopne nebo odnese míč**, nebo se ho schválně dotkne, aby vyprovokoval strkanici,
- kope volný kop ze špatného místa, aby se musel opakovat.

Pozor na jednu past. Když hráč za běžící hry kopne míč z plných sil do autu, i když na něj nikdo neútočí, pravidla to za žlutou nepovažují. Míč byl ve hře, takže nejde o zdržování navázání hry. Soupeř vhazuje a rozhodčí ztracený čas **nastaví**.

**Simulování** je pokus oklamat rozhodčího, třeba předstíraným zraněním nebo předstíraným faulem. Je to **nesportovní chování** a trestá se žlutou. Když se útočník ve vápně svalí k zemi bez doteku a sudí to prokoukne, žádná penalta není. Útočník dostane žlutou a bránící tým kope **nepřímý volný kop**. Stejně to dopadne, když rozhodčí penaltu zruší po přezkoumání videozáznamu, protože záznam ukáže simulování.

Proč na tom trenérovi záleží? Žlutá za zdržování nebo za divadlo je **zbytečná**. Týmu nic nepřinese, hráč pak hraje zbytek zápasu opatrně a druhá žlutá je blíž. A ztracený čas sudí stejně nastaví, takže zdržování často jen prodlouží utrpení na obou stranách.`,
    },
    {
      id: "karty-teammates",
      category: "karty",
      difficulty: 2,
      part: 2,
      title: "Spor ve vlastních řadách",
      body: `Prohráváte 0:3, stoper zase nestihl návrat a záložník mu to jde vysvětlit. Ne slovy, ale pěstí. Na okrese se to stává častěji, než by kdo přiznal, a pravidla na takovou chvíli pamatují.

**Hrubé nesportovní chování** není jen násilí proti soupeři. Pravidla výslovně říkají, že jde i o použití nebo pokus o použití nepřiměřené síly či brutality proti **spoluhráči**, funkcionáři družstva, rozhodčímu, divákovi nebo komukoli jinému, a to **bez ohledu na to, jestli dojde ke kontaktu**. Když se za hry poperou dva hráči jednoho týmu, **oba dostanou červenou**.

Jak se naváže hra? Fyzický přestupek na hrací ploše proti spoluhráči, vlastnímu náhradníkovi nebo funkcionáři družstva se trestá **přímým volným kopem** pro soupeře. Když se to stane ve **vlastním pokutovém území**, kope soupeř **penaltu**. Dva obránci se tedy poperou ve vlastním vápně a soupeř jde na značku. Lepší dárek mu dát nemůžete.

Když hráč za běžící hry napadne spoluhráče nebo vlastního funkcionáře **mimo hrací plochu**, třeba u lavičky, naváže se **nepřímým volným kopem** z nejbližšího místa na čáře ohraničující hrací plochu.

Za urážky a sprosté nadávky je **červená**, ať míří na kohokoli. **Všechny slovní přestupky** se přitom navazují **nepřímým volným kopem**.

Novější pravidla navíc dávají soutěžím možnost trestat červenou hráče, který **odejde ze hřiště na protest** proti rozhodnutí sudího, a funkcionáře, který k tomu hráče **vyzve**. Funkcionář ji dostane, i když hráči nakonec neodejdou.

Pro trenéra z toho plyne jednoduché pravidlo: spory se řeší v kabině, ne na trávníku. A kapitán má zasáhnout dřív, než se z hádky stane rvačka.`,
    },
    {
      id: "karty-fair-play",
      category: "karty",
      difficulty: 2,
      part: 2,
      title: "Fair play: míč do autu a zpátky",
      body: `Soupeř leží na zemi a drží se za koleno, tvůj hráč má míč. Na hřištích se ujal zvyk, kterému se říká **fair play**: tým s míčem ho vykopne do autu, aby se zraněný mohl ošetřit, a soupeř pak míč po vhazování vrátí.

Důležité je vědět, že **pravidla fotbalu tohle nepřikazují**. Kdo míč nevrátí, neporušil žádné pravidlo, jen nepsanou dohodu, a gól vstřelený z takové situace platí. Svědomí za vás sudí mít nebude.

Pravidla na zranění pamatují jinak. Při **vážném zranění** rozhodčí hru sám přeruší. Když hra nestojí kvůli jinému přestupku, naváže **míčem rozhodčího** pro tým, který míč měl nebo by ho získal. Vykopávat míč do autu tak často ani není potřeba: stačí počkat na hvizd a míč se týmu vrátí.

Dva příběhy, které se vyprávějí na každém školení:
- **Arsenal a Sheffield United, únor 1999**, anglický pohár. Brankář Sheffieldu Alan Kelly vykopl míč do autu kvůli zraněnému spoluhráči. Arsenal ho po vhazování nevrátil, Kanu se s míčem rozběhl a Marc Overmars dal vítězný gól na 2:1. Trenér Arsène Wenger hned nabídl, že se zápas odehraje znovu. Anglický svaz souhlasil a Arsenal vyhrál i opakovaný zápas 2:1.
- **Leeds a Aston Villa, duben 2019**, druhá anglická liga. Leeds dal gól, zatímco hráč Villy ležel zraněný. Trenér Marcelo Bielsa nařídil svým hráčům, ať soupeře nechají vyrovnat. Zápas skončil 1:1 a Leeds s Bielsou dostali od FIFA **cenu fair play** za rok 2019.

Fair play ale neznamená naivitu. Kdo předstírá zranění, aby zastavil soupeřův brejk, simuluje, a na to mají pravidla žlutou.

Kabina by měla vědět dvě věci. Vracet míč je slušnost, ne povinnost. A slušnost se na okrese pamatuje déle než výsledek.`,
    },

    // ─── Základní kurz, 3. díl: Míč ve hře ────────────────────────────────────
    {
      id: "karty-throw-in",
      category: "karty",
      difficulty: 2,
      part: 3,
      title: "Vhazování: chyby a tresty",
      body: `Vhazování vypadá jako nejjednodušší věc ve fotbale, a přesto se kvůli němu na okrese hádá každou neděli. Základ znáš: čelem k hřišti, část každé nohy na postranní čáře nebo za ní, oběma rukama zpoza hlavy a přes hlavu. Teď to, co se probírá méně.

**Kdy je míč ve hře.** Jakmile se dostane na hrací plochu. Když dopadne na zem ještě **před** vstupem na hrací plochu, vhazuje **znovu stejný tým** ze stejného místa, klidně jiný hráč. Když je vhazování **nesprávné**, třeba hráč zvedne nohu ze země nebo hází zpředu, vhazuje **soupeř**. Kotrmelec před vhozením pravidla nezakazují, pokud v okamžiku vhození hráč splní všechno, co má.

**Druhý dotek.** Vhazující se nesmí míče dotknout znovu, dokud se ho nedotkne jiný hráč. Když to udělá, soupeř kope **nepřímý volný kop**. Kdyby míč podruhé zahrál rukou, je to přímý volný kop, ve vlastním vápně penalta.

**Soupeř, který překáží.** Kdo vhazujícího nesportovně rozptyluje nebo mu brání, třeba se přiblíží na méně než **2 m**, dostane **žlutou**. Pokud už bylo vhozeno, naváže se nepřímým volným kopem.

**Hodit míč do soupeře** schválně, aby ho vhazující mohl znovu zahrát, je dovoleno, pokud to není nedbalé, bezohledné nebo s nepřiměřenou silou.

**Zdržování.** Od pravidel 2026/27 platí odpočet. Když tým vhazování schválně protahuje, sudí zapíská, ukáže, ať se vhazuje, a zdviženou rukou odpočítá **pět sekund**. Pokud míč do té doby není ve hře, vhazuje **soupeř** ze stejného místa. Žlutou dostane hráč jen tehdy, když potom přehnaně zdržuje vhazování soupeře.

Na okrese se nejvíc chybuje nohama. Hráč vhazuje v běhu, zadní noha mu vyletí do vzduchu a sudí z vedlejší vesnice dá míč soupeři.`,
    },
    {
      id: "karty-goal-kick-corner",
      category: "karty",
      difficulty: 2,
      part: 3,
      title: "Kop od branky a roh: když se něco pokazí",
      body: `Kdy se kop od branky a roh nařizují, ví každý, kdo někdy stál u lajny. Méně se ví, co se stane, když se při nich něco pokazí.

**Kop od branky:**
- míč musí **ležet v klidu** a kope ho hráč bránícího týmu z kteréhokoli místa brankového území,
- ve hře je, jakmile je **kopnut a zřetelně se pohne**,
- když se ho kopající dotkne podruhé dřív než jiný hráč, soupeř kope **nepřímý volný kop**,
- **soupeř**, který zůstal ve vápně jen proto, že **nestihl odejít**, smí hrát dál, a když brankář rozehraje rychle, smí míč i zachytit,
- když se ale míče nebo souboje o něj ještě před tím, než je míč ve hře, účastní soupeř, který ve vápně zůstal **schválně** nebo do něj vběhl, kop se **opakuje**,
- z kopu od branky lze dát gól přímo, ale **jen soupeři**. Skončí-li míč přímo ve vlastní brance, kope soupeř **roh**.

**Kop z rohu:**
- míč se položí do rohového území nejblíž místu, kde přešel brankovou čáru. Nemusí ležet celý uvnitř, stačí, když část míče **přesahuje** čáru rohového území,
- rohový praporek se **nesmí posouvat**, ani když kopajícímu překáží v rozběhu,
- dvojí dotek kopajícího znamená **nepřímý volný kop** pro soupeře, ruka přímý volný kop,
- bránící hráč, který stojí blíž než 9,15 m a kopajícímu překáží, dostane **žlutou** a roh se opakuje,
- když míč z rohu skončí přímo ve vlastní brance kopajícího, kope roh soupeř.

Roh se dnes nařizuje i za zdržování: když brankář drží míč v rukou déle než osm sekund a když tým nestihne kop od branky provést během pětisekundového odpočtu.

Na okrese se často vidí tohle: kopající pošle roh na metr, míč se zastaví v trávě a on ho zahraje znovu. To není krátký roh, to je nepřímý volný kop pro soupeře.`,
    },
    {
      id: "karty-ball-in-play",
      category: "karty",
      difficulty: 2,
      part: 3,
      title: "Když míč trefí sudího",
      body: `Sudí z vedlejší vesnice stojí vždycky přesně tam, kam chceš přihrát. Co říkají pravidla, když ho míč trefí?

Podle **pravidla 9** je míč **mimo hru**, když celým objemem přejde brankovou nebo postranní čáru, nebo když rozhodčí přeruší hru. Třetí případ se týká rozhodčích: míč se dotkne **člena týmu rozhodčích**, třeba i asistenta na čáře, zůstane na hrací ploše a přitom:
- jeden tým začne **slibně se rozvíjející útok**, nebo
- míč jde **přímo do branky**, nebo
- míč **získá druhý tým**.

Ve všech třech případech se hra přeruší a naváže **míčem rozhodčího**. Ten dostane tým, který by míč měl nebo získal, kdyby rozhodčího netrefil, a spouští se v **místě, kde se míč rozhodčího dotkl**.

Ve všech ostatních případech míč po odrazu od rozhodčího **zůstává ve hře**, stejně jako po odrazu od tyče, břevna nebo rohového praporku, pokud zůstane na hrací ploše.

Když se míč od rozhodčího odrazí **ven za čáru**, míč rozhodčího se nepoužije. Naváže se, jako by tam sudí nebyl: vhazováním, kopem od branky nebo rohem pro soupeře toho, kdo se míče dotkl naposledy.

Novější pravidla řeší i jednu lavičkovou situaci. Když se míče, který **zjevně opouští hrací plochu**, dotkne náhradník při rozcvičce, vystřídaný hráč, hráč mimo hřiště kvůli ošetření nebo funkcionář družstva a nechtěl tím nesportovně zasáhnout do hry, soupeř dostane **nepřímý volný kop**. Karta za to není.

Takže trenére, až poletí míč do autu kolem lavičky, ruce do kapes. Chytit ho dřív, než přejde čáru, jen aby se rychleji vhazovalo, se nevyplácí.`,
    },
    {
      id: "karty-dropped-ball",
      category: "karty",
      difficulty: 2,
      part: 3,
      title: "Míč rozhodčího do detailu",
      body: `Míč rozhodčího je navázání pro chvíle, kdy hra stojí a pravidla nepředepisují nic jiného. Třeba zranění bez faulu, prasklý míč, píšťalka z tribuny, která zmate hráče, nebo pes, který se rozhodne zapojit do útoku. Základ: ve vápně dostane míč brankář bránícího týmu, jinde tým, který míč měl nebo by ho získal, a ostatní hráči obou týmů musí být aspoň **4 m** daleko. Tady jsou jemnosti.

**Kdy se spouští znovu.** Míč je ve hře, jakmile se dotkne země. Rozhodčí ho spustí **znovu**, když:
- se ho někdo dotkne **dřív, než dopadne na zem**,
- míč po dopadu **opustí hrací plochu**, aniž se ho dotkl hráč.

**Co se smí, když je míč ve hře.** Hráč, pro kterého byl míč spuštěn, s ním smí kličkovat, kolikrát chce. Soupeř, který dodržel 4 m, smí po dopadu míče přiběhnout a zahrát ho **jako první**. A brankář, pro kterého sudí spustil míč ve vápně, ho hrát nemusí, může ho nechat spoluhráči.

**Gól z míče rozhodčího.** Branka platí, jen když se míče dotknou **aspoň dva hráči**, klidně jeden z každého týmu. Když hráč po spuštění míče rovnou vystřelí do soupeřovy branky a nikdo jiný se míče nedotkne, gól neplatí a soupeř kope **od branky**. Kdyby míč takhle skončil ve vlastní brance, je to **roh** pro soupeře.

**Míč chycený podavačem.** Když podavač chytí míč, který ještě nepřešel čáru, rozhodčí hru přeruší a spustí míč týmu, který by vhazoval, v místě, kde ho podavač chytil. Volný kop se nedává, protože podavač není zapsaný v zápise o utkání.

Na okrese podavače často dělají žáci. Vysvětli jim, že míč berou až za čarou. Jinak se dočkají kázání od sudího i od dědy na tribuně.`,
    },

    // ─── Základní kurz, 4. díl: Zápas podle pravidel ──────────────────────────
    {
      id: "karty-match-time",
      category: "karty",
      difficulty: 2,
      part: 4,
      title: "Nastavení a hodinky sudího",
      body: `Že se hrají dva poločasy po 45 minutách a sudí nastavuje čas ztracený střídáním, ošetřováním nebo oslavami, ví každý, kdo někdy stál u lajny. Na tribuně se ale každou neděli řeší, proč sudí nastavil zrovna tolik. Pár pravidel, která se hodí znát.

**Nastavení se nezkracuje.** Kde je čtvrtý rozhodčí, ukazuje na konci poslední minuty poločasu **minimální** nastavení. Rozhodčí ho smí **prodloužit, ale ne zkrátit**. Když se v nastavení ošetřuje nebo slaví gól, hraje se déle.

**Chyba se nevyrovnává.** Když sudí v prvním poločase špatně změří čas, nesmí to dohnat úpravou délky **druhého poločasu**.

**Přestávky na pití.** Pokud je soutěž povolí, přestávka na pití nemá přesáhnout **jednu minutu** a ochlazovací přestávka trvá **90 sekund až tři minuty**. Obojí se nastavuje.

**Poločasová přestávka** smí trvat nejvýš 15 minut. Její délku stanoví řád soutěže a změnit ji lze jen se **svolením rozhodčího**. Za lijáku ji lze zkrátit, když se rozhodčí a oba týmy dohodnou.

**Zranění těsně před koncem.** Sudí chtěl nastavit tři minuty a pár vteřin před koncem základní doby se hráč zraní, ošetřování trvá pět minut. Nastavuje se jen **zbývající hrací čas**, ne délka přerušení, takže se hrají zase ty tři minuty.

**Penalta na konci.** Když se na konci zápasu kope penalta a padne z ní gól, zápas tím končí. Výkop se už neprovádí.

**Předčasně ukončený zápas** se hraje znovu, pokud řád soutěže nestanoví jinak. Když ale zápas skončí proto, že tým klesl pod sedm hráčů, tým ho v zásadě **prohraje kontumačně**.

Až tedy strejda u zábradlí zařve „pískej, už je konec!“, sudí má hodinky a pravidla. Strejda jen hlad.`,
    },
    {
      id: "karty-substitutions",
      category: "karty",
      difficulty: 2,
      part: 4,
      title: "Střídání na čas a červená před výkopem",
      body: `Postup střídání znáš: při přerušení hry, u střední čáry, až když vystřídaný odejde, a na pokyn sudího. Pravidla 2026/27 k tomu přidala **časový limit**.

**Deset sekund.** Vystřídaný hráč musí opustit hrací plochu do **deseti sekund** od ukázání tabule se střídáním, a kde tabule není, od pokynu rozhodčího. Odchází **nejbližším místem** na čáře ohraničující hrací plochu, ne loudavě přes celé hřiště, ledaže sudí kvůli bezpečnosti nebo zranění určí jinak. Pak jde rovnou do technické zóny nebo do kabiny.

Když limit nestihne:
- stejně musí odejít, žlutou dostane jen za **přehnané** zdržování,
- náhradník zatím **nesmí** na hřiště, hra se naváže a tým hraje v oslabení,
- náhradník smí nastoupit až při **prvním přerušení po uplynutí jedné minuty** od navázání hry,
- střídání nejde zrušit ani vyměnit náhradníka.

Střídání je **dokončené**, když náhradník vstoupí na hrací plochu. Od té chvíle je hráčem a smí provést jakékoli navázání hry. Když vystřídaný hráč odmítne odejít, hra pokračuje.

**Červená před výkopem.** Vyloučit hráče lze i před zápasem, třeba při rozcvičce. Hráče vyloučeného **po zapsání do zápisu a před výkopem** smí nahradit náhradník ze zápisu, který už nahrazen být nemůže, a počet střídání se tím nesnižuje. Hráče vyloučeného **po výkopu** nahradit nelze. Vyloučeného náhradníka nelze nahradit nikdy.

**Opozdilec.** Když hráč zapsaný v zápise dorazí až po výkopu, smí naskočit při přerušení hry se svolením rozhodčího. Doplní tým do jedenácti a nepočítá se to jako střídání. Kdo zaspal po sobotní zábavě, tedy ještě není ztracený. Jen ho v kabině čeká pokladnička.`,
    },
    {
      id: "karty-equipment",
      category: "karty",
      difficulty: 2,
      part: 4,
      title: "Výstroj: barvy, pokrývky a elektronika",
      body: `Že chrániče musí být zakryté stulpnami a prsten jde do tašky, víš. **Pravidlo 4** ale řeší i věci, na které se v kabině zapomíná.

**Barvy.** Oba týmy se musí barvou odlišit od sebe i od rozhodčích, brankář od všech ostatních hráčů i rozhodčích. Dále platí:
- **spodní tričko** musí mít jednu barvu, stejnou jako hlavní barva rukávu dresu, nebo rukáv přesně napodobovat,
- **spodní šortky a elasťáky** musí mít hlavní barvu trenýrek nebo barvu jejich spodní části, celý tým stejnou,
- **páska** na stulpnách musí mít barvu té části stulpny, kterou zakrývá.

**Ochranná výstroj.** Povolené jsou třeba rukavice, ochranné pokrývky hlavy, obličejové masky a chrániče kolen a paží z měkkého lehkého materiálu. Brankář smí mít **čepici, sportovní brýle a tepláky**. Rukavice brankář mít **nemusí**, pravidla je nevyžadují. **Pokrývka hlavy** hráče musí být černá nebo v hlavní barvě dresu, nesmí být připevněná k dresu a nic z ní nesmí trčet.

**Elektronika.** Hráči ani náhradníci nesmějí nosit ani používat elektronická či komunikační zařízení, kromě schválených systémů měření výkonu. Funkcionáři družstva smějí, ale jen kvůli zdraví a bezpečnosti hráčů nebo z taktických důvodů, a jen malá přenosná zařízení, třeba mobil nebo tablet. Za nepovolené zařízení dostane funkcionář **červenou**.

**Nápisy.** Výstroj nesmí nést politická, náboženská ani osobní hesla a hráč nesmí ukázat spodní prádlo, na kterém jsou. Trestá to ale **řídící orgán soutěže**, svaz nebo FIFA, ne sudí kartou.

**Když je něco špatně**, hra se přerušovat nemusí. Hráč odejde výstroj upravit, nechá si ji zkontrolovat a vrátí se jen se svolením rozhodčího. Kdo se vrátí bez svolení, dostane **žlutou**.

Tričko „Pozdrav pro babičku“ pod dresem tedy nech na pouť.`,
    },
    {
      id: "karty-referee-powers",
      category: "karty",
      difficulty: 2,
      part: 4,
      title: "Rozhodčí, jeho slovo a zranění",
      body: `„Sudí, to přece vidíš!“ Rozhodčí to vidí jinak a podle **pravidla 5** má poslední slovo.

**Fakta jsou konečná.** Rozhodnutí o faktech souvisejících s hrou, včetně toho, jestli padl gól a jak zápas skončil, jsou konečná. Rozhodnutí o navázání hry smí rozhodčí změnit, když zjistí, že je špatné, nebo na radu jiného člena týmu rozhodčích. **Nesmí** to ale udělat, když se hra už navázala, nebo když odpískal konec poločasu či zápasu a odešel z hrací plochy. Když se rozhodčí zraní, hra může pokračovat pod dohledem ostatních rozhodčích, dokud míč neopustí hru.

**Karty i mimo hru.** Sudí smí dát kartu i o poločasové přestávce, třeba za ránu v tunelu, a po závěrečném hvizdu, dokud neodejde z hrací plochy.

**Zranění.** Při lehkém zranění se hraje dál, než míč opustí hru. Při vážném zranění sudí hru přeruší. Od pravidel 2026/27 platí, že hráč v poli, kvůli jehož zranění se hra přerušila nebo kterého ošetřovali na hřišti, musí odejít a vrátit se smí až **jednu minutu po navázání hry**, se svolením rozhodčího. Když ho tým vystřídá, střídání se nezdržuje. Odcházet nemusí:
- zraněný **brankář**,
- hráči po srážce brankáře s hráčem v poli nebo dvou spoluhráčů,
- hráč s **vážným zraněním**, třeba otřesem mozku,
- hráč zraněný faulem, za který soupeř dostal **žlutou nebo červenou**, pokud je ošetření rychlé,
- zraněný, který bude kopat **penaltu**.

Krvácející hráč musí z hřiště a vrátí se, až krvácení ustane a výstroj je bez krve.

A jedno ustanovení potěší sudí na každém okrese: rozhodčí **neodpovídá** za zranění hráčů ani diváků ani za škody, které vzniknou z jeho rozhodnutí podle pravidel. Třeba z toho, že uznal hřiště za způsobilé ke hře.`,
    },

    // ─── Pokročilý kurz, 2. díl: Brankář a těžké situace ──────────────────────
    {
      id: "karty-goalkeeper-hands",
      category: "karty",
      difficulty: 3,
      part: 2,
      title: "Brankář s míčem v rukou",
      body: `Brankář ve vlastním pokutovém území smí míč chytit. Jakmile ho ale **ovládá rukama**, platí pro něj i pro soupeře zvláštní pravidla.

Podle pravidla 12 brankář ovládá míč rukama, když:
- je míč mezi jeho rukama nebo mezi rukou a jakýmkoli povrchem, třeba zemí nebo vlastním tělem,
- drží míč na **natažené otevřené dlani**,
- míč **odráží o zem** nebo ho vyhazuje do vzduchu.

Když se míč od brankáře jen **odrazí** nebo když brankář zrovna **zasahoval** proti střele, míč neovládá a smí ho chytit znovu.

**Osm sekund.** Od pravidel 2025/26 smí brankář ovládat míč rukama nejvýš **osm sekund**. Dřív platilo šest sekund a trestalo se to nepřímým volným kopem. Kdy počítání začíná, určí rozhodčí, a posledních pět sekund odpočítává **zdviženou rukou**. Když brankář míč nepustí včas, soupeř kope **roh** ze strany bližší místu, kde brankář stál. Karta za to není, dokud brankář přestupek neopakuje. Pozor:
- odrážení míče o zem počítání **nezastaví ani nevynuluje**,
- když brankář chytí slabou střelu a pak leží na zemi, osm sekund běží od chvíle, kdy míč ovládl, ne od chvíle, kdy vstal,
- když míč do osmi sekund pustí na zem, přestupek to není, ale od té chvíle ho soupeř smí napadnout.

**Soupeř** brankáře, který míč ovládá rukama, atakovat nesmí. Nesmí mu ani bránit v rozehrání míče nebo do míče kopat, když ho brankář vyhazuje nebo vykopává. Trestá se to **nepřímým volným kopem**, při kontaktu **přímým**, a žlutou jen za bezohlednost, zastavení slibného útoku nebo opakování. Když se útočník postaví brankáři do cesty a vyhozený míč se mu odrazí od hlavy do branky, **gól neplatí**.

Když útočník brankáři brání a ten kvůli tomu překročí osm sekund, roh se nedává. Volný kop kope brankářův tým.`,
    },
    {
      id: "karty-back-pass",
      category: "karty",
      difficulty: 3,
      part: 2,
      title: "Malá domů a brankářské triky",
      body: `Základ znáš: brankář nesmí vzít do rukou míč, který mu spoluhráč úmyslně přihrál nohou nebo který dostal přímo z vhazování spoluhráče. Pokročilý trenér musí znát i jemnosti.

**Kdy přihrávka nohou nevadí.** Brankář smí míč chytit, když:
- spoluhráč míč brankáři **nepřihrával**, třeba jen zblokoval střelu soupeře nebo míč určený někomu jinému doputoval k brankáři,
- se přihrávky po cestě **dotkl jiný hráč** kteréhokoli týmu, ať jakkoli slabě,
- brankář míč nejdřív **zřetelně kopl nebo se o to pokusil**, aby ho dostal do hry, a teprve potom ho vzal do rukou.

**Nepovedená** přihrávka je ale pořád přihrávka. Když obránce uklouzne, míč brankáři nedohraje a ten ho chytí před útočníkem, soupeř kope nepřímý volný kop.

**Trik.** Hráč si míč nadhodí nohou a hlavou, hrudí nebo kolenem ho pošle brankáři, aby obešel pravidlo. Dostane **žlutou** za nesportovní chování a soupeř kope **nepřímý volný kop**, a to **i když brankář míč rukama nevezme**. Když trik vymyslí sám brankář, třeba si při kopu od branky nadhodí míč spoluhráči, žlutou dostane on.

**Bez karty.** Za hru rukou ve vlastním pokutovém území, kterou nesměl, dostane brankář jen nepřímý volný kop proti sobě, i kdyby tím zastavil slibný útok. Totéž platí, když míč z vhazování spoluhráče dovede nohou do vápna a teprve tam ho chytí. Výjimka: když po navázání hry zahraje míč **podruhé** dřív, než se ho dotkne jiný hráč, a tím zastaví slibný útok nebo zmaří brankovou možnost, kartu dostane. Typicky po kopu od branky: brankář kopne na tři metry, k míči se řítí útočník a brankář do míče šťouchne znovu.

Okresní brankáři si tyhle triky rádi zkoušejí. Sudí je rádi trestají.`,
    },
    {
      id: "karty-shootout",
      category: "karty",
      difficulty: 3,
      part: 2,
      title: "Kopy ze značky pokutového kopu",
      body: `Pohár skončí remízou a přijde rozstřel. Oficiálně **kopy ze značky pokutového kopu**, na okrese prostě „penalty“. Pravidlo 10 má pár háčků, na kterých trenéři pohořívají.

**Kdo smí kopat.** Jen hráči, kteří byli na konci zápasu **na hrací ploše** nebo dočasně mimo ni, třeba kvůli ošetření. Kdo seděl na lavičce, kopat nesmí, ani když tým nevyčerpal střídání. Jedinou výjimkou je **brankář**, který nemůže pokračovat. Nahradit ho smí náhradník ze zápisu, pokud tým nevyčerpal počet náhradníků, nebo hráč vyřazený kvůli vyrovnání počtu. Nahrazený brankář už nekope. Místo s brankářem si může vyměnit i kterýkoli oprávněný hráč.

**Vyrovnání počtu.** Když má jeden tým víc hráčů, musí jich tolik vyřadit a jejich jména a čísla oznámit rozhodčímu. Pořadí kopajících se rozhodčímu neoznamuje.

**Postavení.** Všichni kromě kopajícího a obou brankářů stojí ve **středovém kruhu**. Brankář kopajícího týmu stojí na hrací ploše na brankové čáře, tam, kde se potkává s čárou pokutového území.

**Karty.** Napomenutí ze zápasu se do rozstřelu **nepřenášejí**. Hráč se žlutou z prodloužení, který dostane žlutou v rozstřelu, vyloučen není.

**Chyby při kopu:**
- brankář vyběhne dřív a kop se opakuje: za první přestupek **varování**, za další **žlutá**,
- kopající zastaví až po dokončeném rozběhu a fintuje: kop je **neproměněný** a kopající dostane žlutou,
- kopající uklouzne a míče se náhodou dotkne podruhé, třeba stojnou nohou: skončí-li míč v brance, kop se **opakuje**, jinak je **neproměněný**.

To poslední pravidlo vzniklo po rozstřelu Atlética Madrid s Realem Madrid v Lize mistrů v březnu 2025. Julián Álvarez uklouzl, gól mu neuznali a Atlético vypadlo.

**Všichni oprávnění** musí kopnout, než kdokoli půjde podruhé. Rozhodující penaltu tak klidně může kopat brankář.`,
    },
    {
      id: "karty-impeding",
      category: "karty",
      difficulty: 3,
      part: 2,
      title: "Bránění, clonění a souběh přestupků",
      body: `Útočník vbíhá za obranu, stoper mu vkročí do cesty a ruce dá za záda. Faul, nebo ne? Tady se rozhoduje o centimetry.

**Bránění ve hře.** Hráč brání soupeři, když se mu **pohybem dostane do cesty**, aby ho zablokoval, zpomalil nebo přinutil změnit směr, a míč přitom **není na dosah** ani jednoho z nich. Bez kontaktu je to nepřímý volný kop, s kontaktem přímý. Každý hráč má ale **právo na své místo**: stát soupeři v cestě není totéž jako vstoupit mu do cesty.

**Clonění míče.** Hráč smí míč clonit, tedy postavit se mezi soupeře a míč, když je míč **na dosah** a hráč soupeře nedrží rukama ani ho neodtlačuje tělem. Soupeř ho přitom smí férově atakovat. Míč se kutálí do autu, stoper ho zakrývá a nechá ho doběhnout za čáru? Dokud je míč na dosah a stoper nepoužívá ruce, je to v pořádku.

**Víc přestupků naráz.** Když hráč spáchá najednou víc přestupků, rozhodčí potrestá ten **závažnější**, a to podle trestu, navázání hry, **fyzické závažnosti a taktického dopadu**. Příklady z pravidel:
- bezohledný zákrok, který zastaví slibný útok: **jedna žlutá**, za bezohlednost, protože fyzická závažnost převáží nad taktikou,
- bezohledné podražení mimo vápno, které zmaří zjevnou brankovou možnost: **červená** za zmařenou šanci, ne žlutá za bezohlednost,
- zákrok ve vlastním vápně, který zmaří šanci a zároveň ohrozí zdraví soupeře: penalta a **červená za surovou hru**.

**Dva samostatné přestupky** jsou ale dvě karty, i když jdou těsně po sobě. Obránce bezohledně zajede do útočníka, sudí nechá výhodu, obránce útočníka doběhne a strhne ho za dres, čímž zastaví slibný útok. Výsledek: **dvě žluté a červená**.

Ruce za zády a tělo mezi soupeřem a míčem je umění. Ruce na soupeřově dresu je volný kop.`,
    },
  ],

  questions: [
    // ── Pokladnička a pravidla kabiny ──
    {
      id: "karty-team-fines-1",
      lessonId: "karty-team-fines",
      text: "Kdy má tým podle lekce stanovit, za co se platí do pokladničky?",
      options: [
        "Po zápase podle toho, jak se hrálo",
        "Kdykoli to trenér uzná za vhodné",
        "Až na konci sezóny při guláši",
        "Předem, v sazebníku, který zná každý",
      ],
      correct: 3,
      explain: "Sazebník má být známý předem. Pokuta vymyšlená po prohře v afektu je podle lekce pomsta, ne disciplína.",
    },
    {
      id: "karty-team-fines-2",
      lessonId: "karty-team-fines",
      text: "Za co by se podle lekce do pokladničky platit nemělo?",
      options: [
        "Za pozdní příchod na sraz",
        "Za zapomenuté kopačky",
        "Za neproměněnou šanci",
        "Za žlutou za řeči na sudího",
      ],
      correct: 2,
      explain: "Lekce radí trestat chování, ne fotbal. Za zkaženou přihrávku nebo neproměněnou šanci se neplatí.",
    },
    {
      id: "karty-team-fines-3",
      lessonId: "karty-team-fines",
      text: "Proč lekce nedoporučuje pokutovat chyby ve hře?",
      options: [
        "Protože to zakazují pravidla fotbalu",
        "Protože by se pokladnička plnila moc rychle",
        "Protože chyby ve hře trestá svaz",
        "Protože hráč, který se bojí chyby, hraje hůř",
      ],
      correct: 3,
      explain: "Strach z pokuty za chybu hráče svazuje. Pravidla fotbalu přitom o kabinových pokutách nic neříkají.",
    },
    {
      id: "karty-team-fines-4",
      lessonId: "karty-team-fines",
      text: "Kdo má podle lekce vést kabinovou pokladnu?",
      options: ["Trenér", "Pokladník z řad hráčů", "Předseda klubu", "Hospodský z výčepu u hřiště"],
      correct: 1,
      explain: "Pokladna má být průhledná: vede ji pokladník z řad hráčů, ne trenér, a peníze jdou na společnou akci.",
    },
    {
      id: "karty-team-fines-5",
      lessonId: "karty-team-fines",
      text: "Hráč dostane žlutou za taktický faul, kterým zastavil soupeřův brejk. Co o tom říká lekce?",
      options: [
        "Platí dvojnásobek, protože jde o kartu",
        "Platí stejně jako za žlutou za řeči na sudího",
        "Pokutu za něj zaplatí trenér",
        "Do pokladničky to obvykle nepatří, hráč udělal něco pro tým",
      ],
      correct: 3,
      explain: "Do pokladničky patří zbytečné karty. Taktický faul, kterým hráč zastavil brejk, je podle lekce služba týmu.",
    },

    // ── Zdržování hry a simulování ──
    {
      id: "karty-time-wasting-1",
      lessonId: "karty-time-wasting",
      text: "Vedoucí tým za běžící hry z plných sil kopne míč do autu, i když na hráče nikdo neútočí. Co rozhodčí?",
      options: [
        "Žlutá za zdržování navázání hry",
        "Nepřímý volný kop pro soupeře",
        "Červená za hrubé nesportovní chování",
        "Soupeř vhazuje, karta za to není a ztracený čas se nastaví",
      ],
      correct: 3,
      explain: "Míč byl ve hře, takže nejde o zdržování navázání hry a pravidla to za žlutou nepovažují. Rozhodčí ztracený čas nastaví.",
    },
    {
      id: "karty-time-wasting-2",
      lessonId: "karty-time-wasting",
      text: "Co z tohoto pravidla uvádějí jako zdržování navázání hry?",
      options: [
        "Odkopnutí nebo odnesení míče po přerušení hry",
        "Rychle rozehraný volný kop",
        "Dlouhý nákop na hrotového útočníka",
        "Střídání během poločasové přestávky",
      ],
      correct: 0,
      explain: "Odkopnutí nebo odnesení míče po přerušení hry je v pravidlech výslovně mezi příklady zdržování navázání hry.",
    },
    {
      id: "karty-time-wasting-3",
      lessonId: "karty-time-wasting",
      text: "Co je podle pravidel simulování?",
      options: [
        "Každý pád po souboji o míč",
        "Hlasitý křik po faulu soupeře",
        "Pokus oklamat rozhodčího předstíraným zraněním nebo faulem",
        "Zákrok, při kterém hráč nehraje míč",
      ],
      correct: 2,
      explain: "Simulování je pokus oklamat rozhodčího, třeba předstíraným zraněním nebo faulem. Trestá se žlutou za nesportovní chování.",
    },
    {
      id: "karty-time-wasting-4",
      lessonId: "karty-time-wasting",
      text: "Útočník se ve vápně svalí k zemi bez doteku a rozhodčí simulování prokoukne. Jak se naváže hra?",
      options: [
        "Pokutovým kopem",
        "Nepřímým volným kopem pro bránící tým",
        "Míčem rozhodčího",
        "Kopem od branky",
      ],
      correct: 1,
      explain: "Penalta není. Simulant dostane žlutou a bránící tým kope nepřímý volný kop.",
    },
    {
      id: "karty-time-wasting-5",
      lessonId: "karty-time-wasting",
      text: "Proč lekce označuje žlutou za zdržování za zbytečnou?",
      options: [
        "Protože za ni svaz vždy vybírá pokutu",
        "Protože ji nemůže dostat brankář",
        "Týmu nic nepřinese a ztracený čas sudí stejně nastaví",
        "Protože se po třech zápasech sama smaže",
      ],
      correct: 2,
      explain: "Žlutá za zdržování týmu nic nepřinese, hráč pak hraje opatrně a sudí ztracený čas stejně nastaví.",
    },

    // ── Spor ve vlastních řadách ──
    {
      id: "karty-teammates-1",
      lessonId: "karty-teammates",
      text: "Dva hráči stejného týmu se za běžící hry poperou na hrací ploše. Jaký osobní trest dostanou?",
      options: [
        "Oba červenou",
        "Oba žlutou",
        "Nic, je to vnitřní věc týmu",
        "Jen kapitán dostane žlutou, že je neuklidnil",
      ],
      correct: 0,
      explain: "Hrubé nesportovní chování zahrnuje i násilí proti spoluhráči. Když se poperou dva hráči jednoho týmu, oba jdou ven.",
    },
    {
      id: "karty-teammates-2",
      lessonId: "karty-teammates",
      text: "Dva obránci se za běžící hry poperou ve vlastním pokutovém území. Jak se naváže hra?",
      options: [
        "Míčem rozhodčího",
        "Nepřímým volným kopem pro soupeře",
        "Kopem od branky",
        "Pokutovým kopem pro soupeře",
      ],
      correct: 3,
      explain: "Fyzický přestupek proti spoluhráči na hrací ploše se trestá přímým volným kopem, ve vlastním pokutovém území tedy penaltou.",
    },
    {
      id: "karty-teammates-3",
      lessonId: "karty-teammates",
      text: "Musí dojít ke kontaktu, aby šlo o hrubé nesportovní chování proti spoluhráči?",
      options: [
        "Ano, bez kontaktu nejde o přestupek",
        "Ano, a spoluhráč se musí zranit",
        "Ne, stačí pokus o použití nepřiměřené síly",
        "Ne, ale jen když to vidí asistent rozhodčího",
      ],
      correct: 2,
      explain: "Pravidla trestají použití i pokus o použití nepřiměřené síly či brutality, a to bez ohledu na to, jestli dojde ke kontaktu.",
    },
    {
      id: "karty-teammates-4",
      lessonId: "karty-teammates",
      text: "Jak se navazuje hra po slovním přestupku, třeba po urážce?",
      options: [
        "Přímým volným kopem",
        "Nepřímým volným kopem",
        "Pokutovým kopem, pokud k němu dojde ve vápně",
        "Míčem rozhodčího",
      ],
      correct: 1,
      explain: "Všechny slovní přestupky se navazují nepřímým volným kopem. Za urážky přitom hráč dostane červenou.",
    },
    {
      id: "karty-teammates-5",
      lessonId: "karty-teammates",
      text: "Soutěž zavedla trest za odchod ze hřiště na protest. Trenér vyzve hráče, ať odejdou, ale oni zůstanou. Co mu hrozí?",
      options: [
        "Červená karta",
        "Nic, hráči přece neodešli",
        "Jen ústní varování",
        "Žlutá karta pro kapitána",
      ],
      correct: 0,
      explain: "Pokud to soutěž zavedla, funkcionář, který hráče vyzve k odchodu na protest, dostane červenou, i když hráči neodejdou.",
    },

    // ── Fair play: míč do autu a zpátky ──
    {
      id: "karty-fair-play-1",
      lessonId: "karty-fair-play",
      text: "Přikazují pravidla fotbalu vykopnout míč do autu, když leží zraněný soupeř?",
      options: [
        "Ano, jinak soupeř dostane nepřímý volný kop",
        "Ne, je to nepsaný zvyk",
        "Ano, ale jen v mládežnických soutěžích",
        "Ano, jinak gól neplatí",
      ],
      correct: 1,
      explain: "Vykopnutí míče do autu a jeho vrácení je zvyk fair play. Pravidla ho nepřikazují a kdo míč nevrátí, žádné pravidlo neporuší.",
    },
    {
      id: "karty-fair-play-2",
      lessonId: "karty-fair-play",
      text: "Rozhodčí přeruší hru kvůli vážnému zranění, žádný přestupek nebyl. Jak naváže?",
      options: [
        "Vhazováním pro tým zraněného hráče",
        "Nepřímým volným kopem pro tým zraněného",
        "Výkopem ze středové značky",
        "Míčem rozhodčího pro tým, který míč měl nebo by ho získal",
      ],
      correct: 3,
      explain: "Když hra nestojí kvůli jinému přestupku, naváže se míčem rozhodčího pro tým, který míč měl nebo by ho získal.",
    },
    {
      id: "karty-fair-play-3",
      lessonId: "karty-fair-play",
      text: "Co nabídl Arsène Wenger po gólu Overmarse proti Sheffieldu v roce 1999?",
      options: [
        "Odehrát zápas znovu",
        "Nechat soupeře hned vyrovnat",
        "Zaplatit soupeři odškodné",
        "Postavit v příštím kole rezervu",
      ],
      correct: 0,
      explain: "Wenger hned nabídl opakování zápasu, anglický svaz souhlasil a Arsenal vyhrál i opakovaný zápas 2:1.",
    },
    {
      id: "karty-fair-play-4",
      lessonId: "karty-fair-play",
      text: "Jak skončil zápas Leedsu s Aston Villou v dubnu 2019, ve kterém Bielsa nechal soupeře vyrovnat?",
      options: ["2:1 pro Leeds", "0:1", "1:1", "2:2"],
      correct: 2,
      explain: "Leeds dal gól, zatímco hráč Villy ležel zraněný, pak nechal soupeře vyrovnat a zápas skončil 1:1.",
    },
    {
      id: "karty-fair-play-5",
      lessonId: "karty-fair-play",
      text: "Co dostali Leeds a Bielsa za to, že nechali Villu vyrovnat?",
      options: [
        "Pokutu od anglického svazu",
        "Kontumační prohru",
        "Cenu FIFA za fair play",
        "Postup do Premier League jako odměnu",
      ],
      correct: 2,
      explain: "Leeds s Bielsou dostali od FIFA cenu fair play za rok 2019.",
    },

    // ── Vhazování: chyby a tresty ──
    {
      id: "karty-throw-in-1",
      lessonId: "karty-throw-in",
      text: "Vhozený míč dopadne na zem ještě za postranní čarou a teprve pak skočí na hřiště. Co následuje?",
      options: [
        "Hraje se dál",
        "Vhazuje soupeř",
        "Vhazuje znovu stejný tým ze stejného místa",
        "Nepřímý volný kop pro soupeře",
      ],
      correct: 2,
      explain: "Když míč dopadne na zem před vstupem na hrací plochu, vhazuje znovu stejný tým ze stejného místa, klidně jiný hráč.",
    },
    {
      id: "karty-throw-in-2",
      lessonId: "karty-throw-in",
      text: "Vhazující při vhození zvedne zadní nohu ze země. Co rozhodčí?",
      options: [
        "Vhazuje soupeř",
        "Vhazuje znovu stejný tým",
        "Žlutá pro vhazujícího",
        "Nic, na nohách nezáleží",
      ],
      correct: 0,
      explain: "Vhazující musí mít v okamžiku vhození část každé nohy na čáře nebo za ní. Nesprávné vhazování provádí soupeř.",
    },
    {
      id: "karty-throw-in-3",
      lessonId: "karty-throw-in",
      text: "Vhazující zahraje míč podruhé nohou dřív, než se ho dotkne jiný hráč. Co následuje?",
      options: [
        "Přímý volný kop pro soupeře",
        "Vhazování se opakuje",
        "Hraje se dál, nohou smí",
        "Nepřímý volný kop pro soupeře",
      ],
      correct: 3,
      explain: "Druhý dotek vhazujícího před dotekem jiného hráče se trestá nepřímým volným kopem. Přímý by byl jen za ruku.",
    },
    {
      id: "karty-throw-in-4",
      lessonId: "karty-throw-in",
      text: "Obránce se při vhazování postaví metr od vhazujícího a mává mu rukama před obličejem. Co mu hrozí?",
      options: [
        "Nic, vzdálenost je jen doporučení",
        "Žlutá karta",
        "Červená karta",
        "Pokutový kop pro soupeře",
      ],
      correct: 1,
      explain: "Kdo vhazujícího nesportovně rozptyluje nebo mu brání, včetně přiblížení na méně než 2 m, dostane žlutou.",
    },
    {
      id: "karty-throw-in-5",
      lessonId: "karty-throw-in",
      text: "Tým schválně protahuje vhazování, rozhodčí odpočítá pět sekund a míč pořád není ve hře. Co následuje?",
      options: [
        "Vhazuje soupeř ze stejného místa",
        "Žlutá pro vhazujícího a vhazování se opakuje",
        "Nepřímý volný kop pro soupeře",
        "Kop z rohu pro soupeře",
      ],
      correct: 0,
      explain: "Podle pravidel 2026/27 po marném pětisekundovém odpočtu vhazuje soupeř ze stejného místa. Žlutá hrozí jen za další přehnané zdržování.",
    },

    // ── Kop od branky a roh ──
    {
      id: "karty-goal-kick-corner-1",
      lessonId: "karty-goal-kick-corner",
      text: "Útočník zůstal při kopu od branky ve vápně jen proto, že nestihl odejít. Brankář rozehraje rychle a útočník míč zachytí. Co rozhodčí?",
      options: [
        "Nechá kop od branky opakovat",
        "Nechá hrát dál",
        "Dá útočníkovi žlutou",
        "Nařídí nepřímý volný kop pro brankářův tým",
      ],
      correct: 1,
      explain: "Soupeř, který nestihl vápno opustit, smí hrát dál a míč po rychlém rozehrání i zachytit.",
    },
    {
      id: "karty-goal-kick-corner-2",
      lessonId: "karty-goal-kick-corner",
      text: "Útočník při kopu od branky schválně zůstane ve vápně a vrhne se po míči dřív, než je míč ve hře. Co následuje?",
      options: [
        "Hraje se dál",
        "Pokutový kop pro útočící tým",
        "Nepřímý volný kop pro bránící tým a žlutá",
        "Kop od branky se opakuje",
      ],
      correct: 3,
      explain: "Když se míče nebo souboje o něj před tím, než je ve hře, účastní soupeř, který ve vápně zůstal schválně, kop od branky se opakuje.",
    },
    {
      id: "karty-goal-kick-corner-3",
      lessonId: "karty-goal-kick-corner",
      text: "Brankář kopne kop od branky tak nešťastně, že míč skončí přímo ve vlastní brance. Co následuje?",
      options: [
        "Kop z rohu pro soupeře",
        "Gól platí",
        "Kop od branky se opakuje",
        "Nepřímý volný kop pro soupeře",
      ],
      correct: 0,
      explain: "Z kopu od branky lze dát gól přímo jen soupeři. Když míč skončí přímo ve vlastní brance, kope soupeř roh.",
    },
    {
      id: "karty-goal-kick-corner-4",
      lessonId: "karty-goal-kick-corner",
      text: "Míč při rohu leží tak, že jen jeho část přesahuje čáru rohového území. Smí se kopat?",
      options: [
        "Ne, míč musí ležet celý uvnitř",
        "Ne, míč se musí dotýkat čáry",
        "Ano, stačí, když část míče přesahuje čáru",
        "Jen se souhlasem kapitána soupeře",
      ],
      correct: 2,
      explain: "Míč nemusí ležet celý v rohovém území. Stačí, když jeho část přesahuje čáru rohového území.",
    },
    {
      id: "karty-goal-kick-corner-5",
      lessonId: "karty-goal-kick-corner",
      text: "Kopající pošle roh na metr, míč se zastaví a on ho zahraje znovu, aniž se ho dotkl jiný hráč. Co rozhodčí?",
      options: [
        "Hraje se dál, je to krátký roh",
        "Nepřímý volný kop pro soupeře",
        "Roh se opakuje",
        "Přímý volný kop pro soupeře",
      ],
      correct: 1,
      explain: "Dvojí dotek kopajícího při rohu se trestá nepřímým volným kopem pro soupeře.",
    },

    // ── Když míč trefí sudího ──
    {
      id: "karty-ball-in-play-1",
      lessonId: "karty-ball-in-play",
      text: "Míč se odrazí od rozhodčího, zůstane na hřišti a získá ho druhý tým. Co následuje?",
      options: [
        "Hraje se dál, sudí je vzduch",
        "Nepřímý volný kop pro tým, který míč ztratil",
        "Rozhodčí přeruší hru a naváže míčem rozhodčího",
        "Vhazování pro tým, který míč ztratil",
      ],
      correct: 2,
      explain: "Když míč po doteku rozhodčího změní tým, který ho má, hra se přeruší a naváže míčem rozhodčího.",
    },
    {
      id: "karty-ball-in-play-2",
      lessonId: "karty-ball-in-play",
      text: "Kde se v takovém případě spouští míč rozhodčího?",
      options: [
        "V místě, kde se míč dotkl rozhodčího",
        "Na středové značce",
        "Vždy v pokutovém území",
        "U postranní čáry nejblíž k lavičkám",
      ],
      correct: 0,
      explain: "Míč rozhodčího se po doteku rozhodčího spouští v místě, kde se ho míč dotkl.",
    },
    {
      id: "karty-ball-in-play-3",
      lessonId: "karty-ball-in-play",
      text: "Míč se odrazí od rozhodčího a zůstane na hřišti, ale nezačne slibný útok, nejde do branky a nezmění tým. Co platí?",
      options: [
        "Hra se vždy přeruší",
        "Opakuje se poslední přihrávka",
        "Nařizuje se nepřímý volný kop",
        "Míč zůstává ve hře",
      ],
      correct: 3,
      explain: "Mimo tyto tři případy míč po odrazu od rozhodčího zůstává ve hře, stejně jako po odrazu od tyče nebo břevna.",
    },
    {
      id: "karty-ball-in-play-4",
      lessonId: "karty-ball-in-play",
      text: "Míč se od rozhodčího odrazí přímo za postranní čáru. Jak se naváže?",
      options: [
        "Míčem rozhodčího",
        "Vhazováním pro soupeře toho, kdo se míče dotkl naposledy",
        "Vhazováním pro tým, který vyhrál los",
        "Nepřímým volným kopem",
      ],
      correct: 1,
      explain: "Když míč od rozhodčího odletí ven, míč rozhodčího se nepoužije a naváže se, jako by tam sudí nebyl.",
    },
    {
      id: "karty-ball-in-play-5",
      lessonId: "karty-ball-in-play",
      text: "Náhradník při rozcvičce zastaví míč, který zjevně opouští hrací plochu, aniž by chtěl nesportovně zasáhnout do hry. Co rozhodčí?",
      options: [
        "Žlutá pro náhradníka a přímý volný kop",
        "Nic, hraje se vhazováním",
        "Nepřímý volný kop pro soupeře, bez karty",
        "Míč rozhodčího pro tým náhradníka",
      ],
      correct: 2,
      explain: "Dotek míče, který zjevně opouští hrací plochu, od osoby mimo hřiště bez úmyslu nesportovně zasáhnout se trestá nepřímým volným kopem bez karty.",
    },

    // ── Míč rozhodčího do detailu ──
    {
      id: "karty-dropped-ball-1",
      lessonId: "karty-dropped-ball",
      text: "Rozhodčí spustí míč a hráč ho kopne dřív, než míč dopadne na zem. Co následuje?",
      options: [
        "Nepřímý volný kop pro soupeře",
        "Míč se spouští znovu",
        "Hraje se dál",
        "Žlutá karta pro hráče",
      ],
      correct: 1,
      explain: "Míč rozhodčího je ve hře, až když se dotkne země. Když se ho někdo dotkne dřív, spouští se znovu.",
    },
    {
      id: "karty-dropped-ball-2",
      lessonId: "karty-dropped-ball",
      text: "Hráč, pro kterého byl spuštěn míč, ho po dopadu hned vystřelí přímo do soupeřovy branky a nikdo jiný se míče nedotkne. Co rozhodčí?",
      options: [
        "Gól platí",
        "Míč se spouští znovu",
        "Nepřímý volný kop pro soupeře",
        "Gól neplatí, soupeř kope od branky",
      ],
      correct: 3,
      explain: "Z míče rozhodčího platí gól, jen když se míče dotknou aspoň dva hráči. Jinak soupeř kope od branky.",
    },
    {
      id: "karty-dropped-ball-3",
      lessonId: "karty-dropped-ball",
      text: "Smí soupeř, který dodržel 4 m, po dopadu spuštěného míče zahrát míč jako první?",
      options: [
        "Ano, jakmile se míč dotkne země, je ve hře",
        "Ne, první musí hrát hráč, pro kterého byl míč spuštěn",
        "Ne, jinak dostane žlutou",
        "Jen v pokutovém území",
      ],
      correct: 0,
      explain: "Po dopadu je míč ve hře a hrát ho smí kdokoli, i soupeř, který do té doby dodržel vzdálenost.",
    },
    {
      id: "karty-dropped-ball-4",
      lessonId: "karty-dropped-ball",
      text: "Podavač míčů chytí míč, který ještě nepřešel postranní čáru. Jak se naváže hra?",
      options: [
        "Vhazováním pro tým, který by vhazoval",
        "Přímým volným kopem pro tým, který měl míč",
        "Míčem rozhodčího pro tým, který by vhazoval",
        "Nepřímým volným kopem proti domácím",
      ],
      correct: 2,
      explain: "Podavač není zapsaný v zápise, takže volný kop nejde. Míč se spustí týmu, který by vhazoval, v místě, kde ho podavač chytil.",
    },
    {
      id: "karty-dropped-ball-5",
      lessonId: "karty-dropped-ball",
      text: "Kolik hráčů se musí dotknout míče rozhodčího, aby z něj mohla padnout branka?",
      options: ["Stačí jeden", "Aspoň tři", "Aspoň dva ze stejného týmu", "Aspoň dva"],
      correct: 3,
      explain: "Branka z míče rozhodčího platí, jen když se míče dotknou aspoň dva hráči, klidně jeden z každého týmu.",
    },

    // ── Nastavení a hodinky sudího ──
    {
      id: "karty-match-time-1",
      lessonId: "karty-match-time",
      text: "Čtvrtý rozhodčí ukáže tři minuty nastavení. Co s tím smí rozhodčí udělat?",
      options: [
        "Prodloužit, ale ne zkrátit",
        "Zkrátit, když se nic neděje",
        "Nic, číslo platí přesně",
        "Zkrátit i prodloužit podle stavu zápasu",
      ],
      correct: 0,
      explain: "Ukazuje se minimální nastavení. Rozhodčí ho smí prodloužit, ale ne zkrátit.",
    },
    {
      id: "karty-match-time-2",
      lessonId: "karty-match-time",
      text: "Sudí v prvním poločase omylem nechal hrát o dvě minuty méně. Smí to dohnat ve druhém poločase?",
      options: [
        "Ano, prodlouží druhý poločas o dvě minuty",
        "Ano, pokud souhlasí oba kapitáni",
        "Ne, délku druhého poločasu kvůli tomu měnit nesmí",
        "Ano, ale jen v okresních soutěžích",
      ],
      correct: 2,
      explain: "Chybu v měření času v prvním poločase nesmí rozhodčí vyrovnávat změnou délky druhého poločasu.",
    },
    {
      id: "karty-match-time-3",
      lessonId: "karty-match-time",
      text: "Jak dlouho smí nejvýš trvat přestávka na pití, pokud ji soutěž povolí?",
      options: ["Tři minuty", "Jednu minutu", "Pět minut", "Než se vypije pivo"],
      correct: 1,
      explain: "Přestávka na pití nemá přesáhnout jednu minutu. Tři minuty je horní hranice ochlazovací přestávky.",
    },
    {
      id: "karty-match-time-4",
      lessonId: "karty-match-time",
      text: "Sudí chtěl nastavit tři minuty. Pár vteřin před koncem základní doby se hráč zraní a ošetření trvá pět minut. Kolik se po něm hraje?",
      options: [
        "Osm minut",
        "Pět minut",
        "Nic, zápas tím končí",
        "Tři minuty, nastavuje se zbývající hrací čas",
      ],
      correct: 3,
      explain: "Když je přerušení delší než zbývající hrací čas, nastavuje se zbývající hrací čas, ne délka přerušení.",
    },
    {
      id: "karty-match-time-5",
      lessonId: "karty-match-time",
      text: "Zápas skončí předčasně, protože jeden tým klesl pod sedm hráčů. Co podle pravidel v zásadě následuje?",
      options: [
        "Ten tým zápas prohraje kontumačně",
        "Zápas se vždy opakuje",
        "Platí výsledek v okamžiku ukončení",
        "O vítězi rozhodnou penalty",
      ],
      correct: 0,
      explain: "Tým, kvůli kterému byl zápas ukončen, protože má méně než sedm hráčů, zápas v zásadě prohraje kontumačně.",
    },

    // ── Střídání na čas a červená před výkopem ──
    {
      id: "karty-substitutions-1",
      lessonId: "karty-substitutions",
      text: "Do kdy musí vystřídaný hráč podle pravidel 2026/27 opustit hrací plochu?",
      options: [
        "Do třiceti sekund od pokynu sudího",
        "Do deseti sekund od ukázání tabule nebo pokynu sudího",
        "Do příštího přerušení hry",
        "Kdykoli, hlavně když odejde u střední čáry",
      ],
      correct: 1,
      explain: "Vystřídaný hráč musí odejít do deseti sekund od ukázání tabule, a kde tabule není, od pokynu rozhodčího.",
    },
    {
      id: "karty-substitutions-2",
      lessonId: "karty-substitutions",
      text: "Vystřídaný hráč se loudá a limit nestihne. Kdy smí náhradník nastoupit?",
      options: [
        "Hned jak hráč odejde",
        "Až ve druhém poločase",
        "Po pěti minutách hry",
        "Při prvním přerušení po uplynutí jedné minuty od navázání hry",
      ],
      correct: 3,
      explain: "Hra se naváže bez náhradníka a ten smí nastoupit až při prvním přerušení po uplynutí jedné minuty od navázání.",
    },
    {
      id: "karty-substitutions-3",
      lessonId: "karty-substitutions",
      text: "Hráč zapsaný v zápise zaspí a dorazí až po výkopu, když jeho tým hraje v deseti. Co platí?",
      options: [
        "Už nesmí nastoupit",
        "Smí nastoupit jen místo jiného hráče jako střídání",
        "Smí naskočit při přerušení se svolením sudího a nepočítá se to jako střídání",
        "Smí naskočit kdykoli, i za běžící hry",
      ],
      correct: 2,
      explain: "Opozdilec ze zápisu doplní tým do jedenácti při přerušení hry se svolením rozhodčího a počet střídání se nesníží.",
    },
    {
      id: "karty-substitutions-4",
      lessonId: "karty-substitutions",
      text: "Hráč zapsaný v zápise dostane červenou při rozcvičce před výkopem. Co to znamená pro tým?",
      options: [
        "Nahradí ho náhradník ze zápisu a počet střídání se nesníží",
        "Tým musí hrát celý zápas v deseti",
        "Nahradí ho náhradník, ale tým přijde o jedno střídání",
        "Nahradit ho smí kdokoli z tribuny",
      ],
      correct: 0,
      explain: "Hráče vyloučeného po zapsání do zápisu a před výkopem smí nahradit náhradník ze zápisu a počet střídání se tím nesnižuje.",
    },
    {
      id: "karty-substitutions-5",
      lessonId: "karty-substitutions",
      text: "Kdy je střídání dokončené?",
      options: [
        "Když sudí zapíská",
        "Když náhradník vstoupí na hrací plochu",
        "Když vystřídaný hráč dojde do kabiny",
        "Když se ukáže tabule se střídáním",
      ],
      correct: 1,
      explain: "Střídání je dokončené vstupem náhradníka na hrací plochu. Od té chvíle je hráčem a smí provést jakékoli navázání hry.",
    },

    // ── Výstroj: barvy, pokrývky a elektronika ──
    {
      id: "karty-equipment-1",
      lessonId: "karty-equipment",
      text: "Jakou barvu musí mít spodní tričko s rukávy?",
      options: [
        "Libovolnou, hlavně ať hřeje",
        "Vždy černou",
        "Hlavní barvu rukávu dresu, nebo musí rukáv přesně napodobovat",
        "Barvu trenýrek",
      ],
      correct: 2,
      explain: "Spodní tričko má jednu barvu shodnou s hlavní barvou rukávu dresu, nebo rukáv přesně napodobuje.",
    },
    {
      id: "karty-equipment-2",
      lessonId: "karty-equipment",
      text: "Musí brankář podle pravidel nosit rukavice?",
      options: [
        "Ne, pravidla je nevyžadují",
        "Ano, bez nich nesmí hrát",
        "Ano, ale jen v pokutovém území",
        "Jen v zimních měsících",
      ],
      correct: 0,
      explain: "Rukavice jsou povolená ochranná výstroj, ale pravidla je brankáři nepředepisují.",
    },
    {
      id: "karty-equipment-3",
      lessonId: "karty-equipment",
      text: "Smí trenér na lavičce během zápasu používat tablet?",
      options: [
        "Ne, elektronika je u hřiště zakázaná",
        "Jen o poločase v kabině",
        "Jen se souhlasem trenéra soupeře",
        "Ano, kvůli zdraví a bezpečnosti hráčů nebo z taktických důvodů",
      ],
      correct: 3,
      explain: "Funkcionáři družstva smějí používat malá přenosná zařízení kvůli zdraví a bezpečnosti hráčů nebo z taktických důvodů.",
    },
    {
      id: "karty-equipment-4",
      lessonId: "karty-equipment",
      text: "Hráč má pod dresem tričko s politickým heslem a ukáže ho. Kdo ho za to potrestá?",
      options: [
        "Rozhodčí červenou kartou",
        "Řídící orgán soutěže, svaz nebo FIFA",
        "Kapitán soupeře",
        "Nikdo, heslo pod dresem je soukromá věc",
      ],
      correct: 1,
      explain: "Za zakázané nápisy na výstroji nebo spodním prádle trestá řídící orgán soutěže, svaz nebo FIFA.",
    },
    {
      id: "karty-equipment-5",
      lessonId: "karty-equipment",
      text: "Hráč odešel upravit výstroj a vrátí se na hřiště bez svolení rozhodčího. Co ho čeká?",
      options: [
        "Žlutá karta",
        "Červená karta",
        "Nic, když má výstroj v pořádku",
        "Pokutový kop pro soupeře",
      ],
      correct: 0,
      explain: "Po úpravě výstroje se hráč smí vrátit jen se svolením rozhodčího. Kdo se vrátí bez něj, dostane žlutou.",
    },

    // ── Rozhodčí, jeho slovo a zranění ──
    {
      id: "karty-referee-powers-1",
      lessonId: "karty-referee-powers",
      text: "Rozhodčí nařídí roh, hra se rozehraje a pak zjistí, že to měl být kop od branky. Smí rozhodnutí změnit?",
      options: [
        "Ano, kdykoli do konce poločasu",
        "Ano, pokud ho požádá kapitán",
        "Ano, ale jen když z rohu padne gól",
        "Ne, po navázání hry už rozhodnutí o navázání měnit nesmí",
      ],
      correct: 3,
      explain: "Rozhodnutí o navázání hry smí rozhodčí změnit jen do chvíle, než se hra naváže.",
    },
    {
      id: "karty-referee-powers-2",
      lessonId: "karty-referee-powers",
      text: "Útočníka po souboji bez faulu ošetřují na hřišti. Kdy se smí vrátit do hry?",
      options: [
        "Hned po ošetření",
        "Jednu minutu po navázání hry, se svolením rozhodčího",
        "Až ve druhém poločase",
        "Po pěti minutách hry",
      ],
      correct: 1,
      explain: "Podle pravidel 2026/27 musí ošetřený hráč v poli odejít a vrátit se smí až jednu minutu po navázání hry.",
    },
    {
      id: "karty-referee-powers-3",
      lessonId: "karty-referee-powers",
      text: "Ve kterém případě zraněný hráč v poli po ošetření na hřišti nemusí odejít?",
      options: [
        "Je kapitánem týmu",
        "Jeho tým prohrává",
        "Zranil ho faul, za který soupeř dostal žlutou, a ošetření bylo rychlé",
        "Je nejlepším střelcem týmu",
      ],
      correct: 2,
      explain: "Hráč zraněný faulem, za který soupeř dostal žlutou nebo červenou, smí po rychlém ošetření zůstat.",
    },
    {
      id: "karty-referee-powers-4",
      lessonId: "karty-referee-powers",
      text: "Hráč o poločase v tunelu udeří soupeře. Smí mu rozhodčí ukázat kartu?",
      options: [
        "Ano, karty smí dávat i o poločasové přestávce",
        "Ne, karty jen za běžící hry",
        "Ne, smí jen napsat zprávu",
        "Jen pokud to viděl asistent",
      ],
      correct: 0,
      explain: "Rozhodčí smí ukazovat karty i o poločasové přestávce a po zápase, dokud neodejde z hrací plochy.",
    },
    {
      id: "karty-referee-powers-5",
      lessonId: "karty-referee-powers",
      text: "Odpovídá rozhodčí podle pravidel za zranění hráče, když uznal hřiště za způsobilé ke hře?",
      options: [
        "Ano, vždy",
        "Ano, pokud bylo hřiště zmrzlé",
        "Jen v mládežnických soutěžích",
        "Ne, za zranění z rozhodnutí podle pravidel neodpovídá",
      ],
      correct: 3,
      explain: "Pravidla výslovně říkají, že rozhodčí neodpovídá za zranění ani škody vzniklé z rozhodnutí podle pravidel, včetně stavu hřiště.",
    },

    // ── Brankář s míčem v rukou ──
    {
      id: "karty-goalkeeper-hands-1",
      lessonId: "karty-goalkeeper-hands",
      text: "Brankář drží míč osm sekund, pak ho několikrát odrazí o zem a znovu chytí. Co rozhodčí?",
      options: [
        "Nic, odrazem začíná nových osm sekund",
        "Kop z rohu pro soupeře, odrážení počítání nezastaví",
        "Nepřímý volný kop pro soupeře",
        "Žlutá pro brankáře a vhazování",
      ],
      correct: 1,
      explain: "Při odrážení o zem brankář míč pořád ovládá, takže počítání běží dál. Po překročení osmi sekund kope soupeř roh.",
    },
    {
      id: "karty-goalkeeper-hands-2",
      lessonId: "karty-goalkeeper-hands",
      text: "Kdo určuje, kdy brankáři začíná běžet osm sekund?",
      options: ["Rozhodčí", "Asistent rozhodčího na čáře", "Kapitán soupeře", "Časomíra na výsledkové tabuli"],
      correct: 0,
      explain: "Kdy brankář míč ovládl a osm sekund začíná, rozhoduje rozhodčí. Posledních pět sekund odpočítává zdviženou rukou.",
    },
    {
      id: "karty-goalkeeper-hands-3",
      lessonId: "karty-goalkeeper-hands",
      text: "Brankář chytí slabou střelu, chvíli leží na zemi a teprve potom vstane. Odkud se počítá osm sekund?",
      options: [
        "Od chvíle, kdy vstal",
        "Od pokynu rozhodčího",
        "Ležícímu brankáři se nepočítá",
        "Od chvíle, kdy míč ovládl",
      ],
      correct: 3,
      explain: "Osm sekund běží od chvíle, kdy brankář míč ovládl, ne od chvíle, kdy vstal.",
    },
    {
      id: "karty-goalkeeper-hands-4",
      lessonId: "karty-goalkeeper-hands",
      text: "Útočník se postaví brankáři do cesty, když vyhazuje míč, a míč se útočníkovi odrazí od hlavy do branky. Co rozhodčí?",
      options: [
        "Gól platí",
        "Míč rozhodčího pro brankáře",
        "Gól neplatí a brankářův tým kope nepřímý volný kop",
        "Roh pro útočící tým",
      ],
      correct: 2,
      explain: "Soupeř nesmí brankáři bránit v rozehrání míče, který ovládá rukama. Gól neplatí a brankářův tým kope nepřímý volný kop.",
    },
    {
      id: "karty-goalkeeper-hands-5",
      lessonId: "karty-goalkeeper-hands",
      text: "Brankář poprvé v zápase nepustí míč z rukou do osmi sekund. Dostane kartu?",
      options: [
        "Ano, žlutou",
        "Ne, karta hrozí jen za opakování",
        "Ano, červenou, pokud jeho tým vede",
        "Ne, ale soupeř kope penaltu",
      ],
      correct: 1,
      explain: "Za překročení osmi sekund kope soupeř roh. Žlutou dostane brankář jen tehdy, když přestupek opakuje.",
    },

    // ── Malá domů a brankářské triky ──
    {
      id: "karty-back-pass-1",
      lessonId: "karty-back-pass",
      text: "Obránce chce přihrát brankáři, uklouzne a přihrávka je krátká. Brankář míč chytí rukama ve vápně dřív než útočník. Co rozhodčí?",
      options: [
        "Nepřímý volný kop pro soupeře",
        "Nechá hrát, přihrávka se nepovedla",
        "Pokutový kop pro soupeře",
        "Žlutá pro brankáře a přímý volný kop",
      ],
      correct: 0,
      explain: "I nepovedená úmyslná přihrávka nohou je přihrávka. Brankář ji nesmí chytit a soupeř kope nepřímý volný kop.",
    },
    {
      id: "karty-back-pass-2",
      lessonId: "karty-back-pass",
      text: "Úmyslná přihrávka obránce na brankáře se po cestě lehce dotkne nohy útočníka. Smí ji brankář chytit?",
      options: [
        "Ne, dotek soupeře nic nemění",
        "Jen když míč změnil směr",
        "Ano, dotkl se jí jiný hráč",
        "Jen mimo brankové území",
      ],
      correct: 2,
      explain: "Když se přihrávky po cestě dotkne jiný hráč kteréhokoli týmu, ať jakkoli slabě, brankář ji chytit smí.",
    },
    {
      id: "karty-back-pass-3",
      lessonId: "karty-back-pass",
      text: "Obránce si míč nadhodí a hlavou ho pošle brankáři. Brankář ho nakonec rukama nevezme a rozehraje nohou. Co rozhodčí?",
      options: [
        "Nic, brankář míč do rukou nevzal",
        "Žlutá pro brankáře a nepřímý volný kop",
        "Přímý volný kop pro soupeře bez karty",
        "Žlutá pro obránce a nepřímý volný kop pro soupeře",
      ],
      correct: 3,
      explain: "Trik na obejití pravidla se trestá žlutou pro jeho původce a nepřímým volným kopem, i když brankář míč rukama nevezme.",
    },
    {
      id: "karty-back-pass-4",
      lessonId: "karty-back-pass",
      text: "Brankář ve vlastním vápně chytí míč přímo z vhazování spoluhráče a zastaví tím slibný útok. Jaký osobní trest dostane?",
      options: [
        "Žlutou",
        "Žádný, soupeř kope nepřímý volný kop",
        "Červenou",
        "Žlutou a soupeř kope penaltu",
      ],
      correct: 1,
      explain: "Za nedovolenou hru rukou ve vlastním pokutovém území dostane brankář jen nepřímý volný kop proti sobě, bez karty.",
    },
    {
      id: "karty-back-pass-5",
      lessonId: "karty-back-pass",
      text: "Kdy dostane brankář kartu za to, že po kopu od branky zahraje míč podruhé dřív, než se ho dotkne jiný hráč?",
      options: [
        "Když tím zastaví slibný útok nebo zmaří brankovou možnost",
        "Nikdy, za přestupky ve vlastním vápně kartu nedostává",
        "Vždy, i když poblíž není žádný útočník",
        "Jen když míč podruhé zahraje rukou",
      ],
      correct: 0,
      explain: "Dvojí dotek po navázání hry je výjimka: když jím brankář zastaví slibný útok nebo zmaří brankovou možnost, kartu dostane.",
    },

    // ── Kopy ze značky pokutového kopu ──
    {
      id: "karty-shootout-1",
      lessonId: "karty-shootout",
      text: "Trenér chce na penalty poslat náhradníka, který celý zápas seděl na lavičce, protože tým nevyčerpal střídání. Smí?",
      options: [
        "Ano, střídání mu zůstalo",
        "Ano, ale jen jako pátého kopajícího",
        "Ne, kopat smějí jen hráči, kteří byli na konci zápasu na hřišti",
        "Ano, se souhlasem soupeře",
      ],
      correct: 2,
      explain: "Kopat smějí jen hráči, kteří byli na konci zápasu na hrací ploše nebo dočasně mimo ni. Výjimkou je náhrada za brankáře.",
    },
    {
      id: "karty-shootout-2",
      lessonId: "karty-shootout",
      text: "Brankář se v rozstřelu zraní a nemůže pokračovat. Kdo ho smí nahradit?",
      options: [
        "Náhradník ze zápisu, pokud tým nevyčerpal počet náhradníků, nebo vyřazený hráč",
        "Nikdo, tým musí dochytat bez brankáře",
        "Jen brankář soupeře",
        "Kdokoli z diváků, kdo má rukavice",
      ],
      correct: 0,
      explain: "Brankáře, který nemůže pokračovat, smí nahradit náhradník ze zápisu nebo hráč vyřazený kvůli vyrovnání počtu.",
    },
    {
      id: "karty-shootout-3",
      lessonId: "karty-shootout",
      text: "Hráč dostal žlutou v prodloužení a další žlutou během rozstřelu. Co následuje?",
      options: [
        "Je vyloučen a jeho kop se nepočítá",
        "Je vyloučen a soupeř musí vyřadit jednoho hráče",
        "Jeho tým rozstřel prohrává",
        "Vyloučen není, napomenutí ze zápasu se do rozstřelu nepřenášejí",
      ],
      correct: 3,
      explain: "Napomenutí ze zápasu se do kopů ze značky nepřenášejí, takže žlutá v rozstřelu je pro hráče první.",
    },
    {
      id: "karty-shootout-4",
      lessonId: "karty-shootout",
      text: "Kopající v rozstřelu uklouzne, míče se náhodou dotkne i stojnou nohou a míč skončí v brance. Co rozhodčí?",
      options: [
        "Gól platí",
        "Kop se opakuje",
        "Kop je neproměněný",
        "Kop je neproměněný a kopající dostane žlutou",
      ],
      correct: 1,
      explain: "Při náhodném dvojím doteku se kop, po kterém míč skončil v brance, opakuje. Když míč do branky nejde, kop je neproměněný.",
    },
    {
      id: "karty-shootout-5",
      lessonId: "karty-shootout",
      text: "Kde během rozstřelu stojí brankář týmu, který právě kope?",
      options: [
        "Ve středovém kruhu se spoluhráči",
        "Za brankou soupeře",
        "Na brankové čáře, kde se potkává s čárou pokutového území",
        "Na lavičce",
      ],
      correct: 2,
      explain: "Brankář kopajícího týmu stojí na hrací ploše na brankové čáře v místě, kde se potkává s čárou pokutového území.",
    },

    // ── Bránění, clonění a souběh přestupků ──
    {
      id: "karty-impeding-1",
      lessonId: "karty-impeding",
      text: "Kdy jde o bránění ve hře?",
      options: [
        "Kdykoli hráč stojí soupeři v cestě",
        "Když hráč cloní míč, který má na dosah",
        "Když hráč skočí do souboje hlavou",
        "Když hráč vstoupí soupeři do cesty a míč není na dosah ani jednomu z nich",
      ],
      correct: 3,
      explain: "Bránění je vstoupení do cesty soupeři, když míč není na dosah ani jednoho z nich. Stát v cestě není totéž jako do ní vstoupit.",
    },
    {
      id: "karty-impeding-2",
      lessonId: "karty-impeding",
      text: "Stoper zakrývá tělem míč, který se kutálí do autu a je mu na dosah. Útočníka nedrží rukama. Co rozhodčí?",
      options: [
        "Nepřímý volný kop za bránění ve hře",
        "Nechá hrát, clonění míče na dosah je dovolené",
        "Přímý volný kop a žlutá",
        "Míč rozhodčího",
      ],
      correct: 1,
      explain: "Hráč smí clonit míč, který má na dosah, pokud soupeře nedrží rukama ani ho neodtlačuje tělem.",
    },
    {
      id: "karty-impeding-3",
      lessonId: "karty-impeding",
      text: "Obránce bezohledně podrazí útočníka a tím zastaví slibný útok. Jaký osobní trest dostane?",
      options: [
        "Jednu, za bezohlednost",
        "Dvě, a tedy červenou",
        "Žádnou, stačí volný kop",
        "Jednu, za zastavení slibného útoku",
      ],
      correct: 0,
      explain: "Při souběhu se trestá závažnější přestupek. Fyzická závažnost bezohlednosti převáží nad taktickým zastavením útoku.",
    },
    {
      id: "karty-impeding-4",
      lessonId: "karty-impeding",
      text: "Obránce mimo vápno bezohledně podrazí útočníka a zmaří mu zjevnou brankovou možnost. Jaký trest dostane?",
      options: [
        "Žlutou za bezohlednost",
        "Dvě žluté",
        "Červenou za zmaření zjevné brankové možnosti",
        "Žádný, jen přímý volný kop",
      ],
      correct: 2,
      explain: "Závažnější je zmaření zjevné brankové možnosti mimo vápno, takže červená, ne žlutá za bezohlednost.",
    },
    {
      id: "karty-impeding-5",
      lessonId: "karty-impeding",
      text: "Obránce bezohledně zajede do útočníka, sudí nechá výhodu a obránce pak útočníka strhne za dres a zastaví slibný útok. Co následuje?",
      options: [
        "Jedna žlutá za závažnější přestupek",
        "Dvě žluté a červená",
        "Jen přímý volný kop, výhoda trest smazala",
        "Rovnou červená bez žlutých",
      ],
      correct: 1,
      explain: "Jde o dva samostatné přestupky, i když jdou těsně po sobě, takže dvě žluté a červená.",
    },
  ],
};
