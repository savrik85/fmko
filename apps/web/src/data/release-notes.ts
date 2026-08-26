/**
 * Novinky ve hře (release notes) — statický seznam, nejnovější nahoře.
 * Nový záznam = nová položka na začátku pole; badge „Nové" v menu se řídí
 * datem nejnovějšího záznamu vs. localStorage (markNotesSeen na stránce Novinky).
 */
export interface ReleaseNote {
  date: string; // ISO datum vydání
  emoji: string;
  title: string;
  items: string[];
}

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    date: "2026-08-26",
    emoji: "\u{1F31F}",
    title: "Práce s mládeží — z dorostence se dá vypiplat hráč do áčka",
    items: [
      "Každý hráč má potenciál, tedy strop, kam může dorůst. V profilu ho vidíš jako hvězdičky v hlavičce a v kádru jako sloupec Pot, podle kterého jde řadit. Není to jistota, je to odhad, a jak přesný bude, záleží na tvém skautovi.",
      "Bez skauta vidíš jen mlhu. Odhad je zpočátku široký klidně o osmnáct bodů na obě strany, se špičkovým skautem se zúží na čtyři. Skaut se tím konečně vyplácí: pozná, do koho stojí za to investovat, dřív než to pozná soupeř.",
      "U hráče svítí odznak s výhledem, kam to dotáhne. Čte se rovnou, o co jde — Výhled: tahoun áčka, sestava áčka, střídání v áčku, nebo na áčko nemá. Vždycky se to měří proti tvému áčku, takže co je hvězda v jednom klubu, může být v jiném náhradník.",
      "V U21 přibyla záložka Rozvoj. U každého kluka je vidět, kde je dnes, kam může dorůst a za kolik sezón se dotáhne na základní sestavu áčka. Nahoře máš shrnutí, kolik jich na áčko už má a kolik se tam dostane do tří sezón, a seznam jde řadit i filtrovat podle pozice nebo jen na nadějné.",
      "Přes léto kluci povyrostou. Mladí do jednadvaceti dostávají na přelomu sezóny skok v hodnocení podle svého talentu a trenér mládeže ti pošle esemesku s tím, kdo vyrostl nejvíc. Někteří po tom skoku můžou být rovnou na áčko.",
      "Dorost se obměňuje. Kdo dosáhne dvaadvaceti, z mládeže odchází do áčka, a když je kádr plný, jde mezi volné hráče. Na jeho místo přijde nový šestnáctiletý ročník, takže se ti dorost nezaplní samými přestárlými kluky.",
      "Mladí do jednadvaceti se trénují rychleji než dřív. Nejvíc šestnácti a sedmnáctiletí, ale přidali si i dvacetiletí a jednadvacetiletí, kteří dřív rostli stejně pomalu jako čtyřiadvacetiletí, přestože jsou to pořád kluci z dorostu.",
      "Odhad, za kolik sezón se hráč dotáhne, je nově spočítaný z toho, jak trénink opravdu funguje. Dřív sliboval skoro dvojnásobek. Počítá se s klubem, který trénuje třikrát týdně, takže kdo trénuje víc, dorazí dřív, než mu odznak sliboval.",
      "Mládežnická akademie konečně říká, co za ty peníze dostaneš. Místo nesmyslné šestiny odchovance u každé úrovně stojí, kolik kluků ti z ní vyroste — u symbolické zhruba jeden za dvě sezóny, u velkorysé dva až tři za sezónu. Šance u symbolické a solidní úrovně jsme zvedli.",
      "Brankáři měli rozbité hodnocení i potenciál. Po tréninku se jim rating nehýbal, karta potenciálu jim ukazovala jediný řádek a profil se seznamem se o nich navzájem přeli. Chytání, výběh i postavení teď hrají podle stejných pravidel jako dovednosti hráčů v poli.",
      "Dorostenci, kteří vznikli podle starých pravidel, dostali zpátky to, co jim tehdy sebral generátor. Nikdo z nich nezmizel a nezmenšil se — jen mají strop tam, kde ho měli mít od začátku, a nikoho to nevytáhne nad úroveň základní sestavy jeho vlastního áčka.",
    ],
  },
  {
    date: "2026-08-25",
    emoji: "\u{1F326}\u{FE0F}",
    title: "Počasí má svůj rok a hřiště paměť",
    items: [
      "Počasí se řídí tím, kde je sezóna, ne kalendářem. Rozjíždí se v létě, uprostřed sezóny je zima s mrazem a sněhem a do konce se zase oteplí. Teploty jdou zhruba od mínus dvou do dvaceti čtyř stupňů a platí pro celý okres najednou, takže se nestane, že v jedné vsi sněží a ve vedlejší se griluje.",
      "Aktuální počasí máš v hlavičce, ať jsi kdekoli. Vedle rozpočtu svítí ikona a teplota, na širší obrazovce i popis dne.",
      "U nadcházejícího zápasu je předpověď a ta platí. Co v ní stojí, to se v zápase opravdu odehraje, takže se podle ní dá stavět sestava, volit taktika i naskladňovat bufet.",
      "Hřiště má nově vlhkost, což je paměť půdy. Po lijáku zůstane rozmáčené ještě několik dní a po týdnu veder je vyprahlé, i když zrovna svítí slunce. Na Stadionu ji najdeš číslem i slovem (Ideální, Vlhké, Rozmáčené, Bahno, Vyprahlé) a s větou, co to dělá se hrou.",
      "V zápase je ten stav znát. Na bahně vázne kombinace, vyplatí se posílat dlouhé míče dopředu, drží se kaluže a hráči se snáz zraní. Na vyprahlé tvrdé zemi to zase bolí klouby a míč se veze rychleji. Nejlíp se hraje někde uprostřed.",
      "Počasí ovlivňuje trávník každý den, ne jen ve dnech, kdy se hraje. Déšť ho namočí, slunce vysuší a po mrazivé noci se z něj lámou drny, takže kvalita jde dolů.",
      "Spravit se to dá na Stadionu v Údržbě trávníku. Na výběr jsou tři zásahy, od posečení a zarovnání přes přesetí holých míst a hnojení až po kompletní obnovu povrchu. Čím větší zásah, tím levnější vyjde na procento, takže se vyplatí spravit hřiště najednou a ne po kouskách. Kdo má v šatně sekačku s traktůrkem, tomu trávník část dní nechátrá vůbec, u nejvyšší úrovně v dobrém stavu skoro pořád. A kdo chce mít pokoj, může přejít na hybridní povrch, ten toho snese víc než přírodní tráva.",
      "Vyhřívání a zavlažování se o hřiště starají i mezi zápasy. V běžný den jede udržovací režim za čtvrtinu zápasové sazby: zapnuté vyhřívání drží plochu rozmrzlou, takže jí mráz neublíží, a zavlažování dotuje vyprahlou půdu. V režimu Automaticky se to zapíná samo, Ručně platí dál jen na zápas a Nezapínat nestojí nic, jen si to hřiště odnese.",
      "V den, kdy hraješ doma, se areál otevře rovnou v zápasovém režimu, tedy plné tribuny, kotel a atmosféra. Ostatní dny běží tréninkový.",
      "Ze zápasu se hráči vymlouvají na počasí. V dešti, mrazu i ve vedru chodí do telefonu omluvenky, které na ten den sedí, od „v tomhle dešti se mi fakt nechce\" po „na Zadově sníh, řetězy nemám a ten kopec nevyjedu\". Přijdou den předem nebo rovnou v den zápasu, takže se s tím dá ještě něco dělat.",
      "Na trénink v ošklivém počasí dorazí míň lidí. Nejhorší je sníh, o kus lepší déšť, vítr už jen trochu, a za sluníčka se naopak sejde víc než obvykle. Zimní tréninky tak mají slabší docházku, i když nikdo neposílá žádnou omluvu.",
      "Bufet jde za počasím. V mrazu se prodává svařák a teplé nápoje, na výhni limonáda, a naskladnit se dá podle předpovědi na příští domácí zápas.",
      "Ve zpravodaji se počasí objevuje v předzápasovém preview i v ohlédnutí za kolem. Když kolo rozhodl liják nebo sníh, dočteš se to i v novinách.",
    ],
  },
  {
    date: "2026-08-24",
    emoji: "🌧️",
    title: "Počasí se začalo plést do zápasu",
    items: [
      "Ošklivé počasí nově bere kondici. Na sněhu se tým unaví o pětinu rychleji, v dešti o osminu, ve větru jen o kousek. Nejde o velké číslo na papíře, ale v poslední půlhodině je poznat, kdo v tom brodění doběhl a kdo už jen chodí.",
      "Zimní výbava v šatně konečně dělá to, co slibuje. Kromě techniky a zranění teď tlumí i ten kondiční úbytek a hráči v ní míň podklouzávají. Kdo do ní investoval, má na zimní kolo skutečnou výhodu — a kdo ne, tomu tým v prosinci odejde.",
      "V ošklivém počasí se víc zraňuje. Na sněhu nejvíc, v dešti o kus míň a nově i ve větru, kde dřív bylo riziko stejné jako za slunečna. Pořád ale platí, že největší vliv na zdraví má stav trávníku — rozbité hřiště nadělá víc škody než jakákoli plískanice.",
      "Na hřišti se začaly dít věci. Na sněhu a v dešti hráči podklouzávají (a chvíli se pak sbírají), na podmáčeném trávníku míč uvázne v kaluži, ve větru poryv stočí centr někam za bránu. Zhruba jednou za zápas — dost na to, aby bylo poznat, v čem se hraje, ale ne tak často, aby to otravovalo.",
      "Louže se dělají jen na špatném trávníku. Kdo má hřiště v pořádku, ten se rozbahněnému vápnu vyhne — takže investice do trávníku má nově i tenhle důvod.",
      "Brankářům kluzký míč nedrží v rukavicích. Ve sněhu je to znát nejvíc, v dešti o něco míň, ve větru jen trochu — a čím hůř drží, tím spíš mu tam něco propadne. Zimní výbava i tenhle postih tlumí, takže dobře vybavený gólman zůstává gólmanem i v lednu.",
      "Ve sněhu a dešti část gólů padne z dorážky, když se míč odrazí od brankáře do vápna. V zápisu je u nich napsáno „z dorážky\" a rozhlas k nim má vlastní hlášky.",
      "Hlasatel dostal celkově víc textu — podklouznutí, kaluže i poryvy větru komentuje pokaždé jinak, aby se stejná věta neopakovala třikrát za zápas.",
    ],
  },
  {
    date: "2026-08-23",
    emoji: "🏟️",
    title: "Vylepšení 3D stadionu",
    items: [
      "Věrnější textury budov, tribun, střech a sítí v brankách.",
      "Nové vylepšitelné zázemí: Vstupní brána a pokladny (L0–L3).",
      "Pyrotechnika a dýmovnice v klubových barvách v sektoru kotle.",
      "Vyladěné osvětlení v rozích stadionu a živější atmosféra kolem hřiště.",
    ],
  },
  {
    date: "2026-08-22",
    emoji: "🎫",
    title: "Sázková kancelář — Okresní tiket",
    items: [
      "V menu přibyly Sázky. Kancelář vypisuje kurzy na zápasy tvé soutěže a sází se z klubové kasy — takže si rozmysli, jestli ty peníze nepotřebuješ na výplaty.",
      "Na vlastní zápas si nevsadíš. Ani na svůj A-tým, ani na rezervu. Kancelář to má v pravidlech od chvíle, kdy si jeden trenér vsadil na vlastní prohru. A vyhrál.",
      "Sází se na výsledek (1 / X / 2), na neprohru (1X, X2, nebo že padne vítěz), na počet gólů a na to, kdo se trefí. Tipy z různých zápasů téhož kola můžeš složit na jeden tiket — kurzy se pak násobí, ale musí vyjít všechny. Z jednoho zápasu si vybíráš jen jeden tip.",
      "Vklad od 100 Kč, nejvýš tři tikety na kolo a šest tipů na tiketu. Z jednoho tiketu se dá vyhrát maximálně 100 000 Kč — což jsou dvě třetiny odměny za titul, takže dobrý večer u přepážky klub opravdu postaví na nohy.",
      "Kurz počítá hra ze síly obou kádrů, formy a domácího prostředí. Kancelář si k tomu přirazí osm procent, takže dlouhodobě vydělává ona, ne ty. Na lístku je u každého týmu vidět pořadí, posledních pět výsledků i skóre, aby se nesázelo naslepo.",
      "Když sázený střelec vůbec nenastoupí, tip se anuluje a kurz tiketu o něj klesne — neprohráváš. Cizí sestavu totiž před zápasem nevidíš a hráči vypadávají kvůli kocovině, žním i zraněním.",
      "Lístek se zavírá ve chvíli, kdy se kolo začne hrát. Výsledek přijde SMS do telefonu hned po odehrání a v Sázkách máš historii všech tiketů i bilanci, jak si u kanceláře stojíš.",
      "V grémiu přibyla pátá volená funkce — Komisař pro integritu soutěže. Otevře se od devíti lidských klubů a hlídá sázky i přestupový trh, protože obojí je odpověď na tutéž otázku: nejde tady o něco podezřelého?",
      "Komisař jediný vidí knihu sázek celé soutěže včetně tiketů, které ještě běží — kromě něj do ní vidí už jen prezident. K tomu má listinu všech realizovaných přestupů, kde se samy zvýrazní obchody mezi kluby stejného majitele, ceny mimo odhad hodnoty hráče a dvojice, které spolu obchodují pořád dokola. Není to obvinění, jen upozornění; posoudit to musí člověk.",
      "Když na něco přijde, může klubu zakázat sázení sám a bez hlasování — nejvýš dvakrát za sezónu, ne vlastnímu klubu a ne někomu, s kým má vyhrocený vztah. Umí taky zabavit výhru z konkrétního tiketu ve prospěch pokladny soutěže. Obojí musí odůvodnit a klub se proti tomu odvolá k zasedání.",
      "Pod komisaře spadají i čtyři nová hlasování: nejvyšší sázka na tiket, strop výhry, odvod ze sázek do pokladny soutěže a úplný zákaz sázení klubům soutěže. Takže si limity nastavíte sami — včetně toho, že si sázení zakážete úplně.",
    ],
  },
  {
    date: "2026-08-14",
    emoji: "🧑‍⚖️",
    title: "Okresní rozhodčí — každý má svůj metr",
    items: [
      "Okres má patnáct rozhodčích a každý píská jinak. Delegace přijde dva herní dny před výkopem, takže se stihneš přizpůsobit.",
      "Pískavý kohout rozdá skoro tři karty na zápas, pohodář ani jednu. S vysokým presinkem a agresivními stopery si u prvního koleduješ o oslabení.",
      "Sudí s mizernou kondicí se v posledních dvaceti minutách rozsype — přibývají karty i chyby. Kdo drží metr celý zápas, ten ho drží i v závěru.",
      "Rozhodčí chybují. Neuznaný gól, vymyšlená penalta, přehlédnutá červená — nanejvýš jednou za zápas a vždycky je v detailu vidět, co se stalo a komu to nahrálo. Zelenáč se splete čtyřikrát častěji než veterán.",
      "Za každý zápas dostane sudí známku jako ve škole. V žebříčku okresu (menu Soutěž → Rozhodčí) je vidět, kdo je nejlepší a kdo katastrofa. Na jeho profilu najdeš známky ze všech zápasů i bilanci vůči tvému klubu.",
      "Rozhodčí píská i pohár. Je to tentýž člověk, včetně toho, co si o tobě pamatuje.",
    ],
  },
  {
    date: "2026-08-14",
    emoji: "💪",
    title: "Tvrdost hry — třetí volba vedle formace a taktiky",
    items: [
      "V sestavě si vybíráš, jak se bude hrát: Na férovku, Normálně, nebo Do těla. Volba se ukládá k sestavě i k presetu.",
      "Do těla znamená pevnější obranu, víc získaných míčů a zastrašení soupeřů, kteří na to nemají povahu. Technický kádr plný jemných hráčů z toho vytěží zlomek toho, co dřevorubci — riziko ale nese stejné.",
      "Za tvrdou hru se platí kartami, stopkami a zraněními. A hlavně sudím: přísný pískne dřív, než souboj dohraješ, takže tvrdost nevyrobí zisk míče, jen faul. Proti němu se Do těla nevyplatí, proti benevolentnímu ano.",
      "Na férovku je gólově skoro neutrální — platíš za pojistku. Míň karet, míň stopek, míň zranění.",
      "Predikce rizika ti před zápasem řekne, kolik karet čekat a kdo je jednu žlutou od stopky.",
      "Červená karta konečně opravdu oslabuje. Deset hráčů od poločasu stojí zhruba tři čtvrtě gólu. Vyloučenému gólmanovi se hledá náhrada mezi hráči v poli — a je to znát.",
      "Přibyla přímá červená za brutální faul. Vzácná, ale existuje.",
    ],
  },
  {
    date: "2026-08-14",
    emoji: "🗣️",
    title: "Pozápasové rozhovory — a sudí si to pamatuje",
    items: [
      "Když je po zápase o čem mluvit — sporná situace, červená, penalta, karetní žně nebo výprask — ozve se redaktor. Ptá se na výsledek, na rozhodčího a na to, co před zápasem řekl soupeřův trenér.",
      "Nechodí po každém utkání a nejvýš dva čekající najednou, aby to nebyla povinnost.",
      "V otázce máš rovnou fakta ze zápasu: skóre, sudího, karty, penalty a zvýrazněnou spornou situaci. Nemusíš odpovídat po paměti.",
      "Píšeš vlastními slovy. Hra si přečte, jestli jsi sudího sepsul, vzal v ochranu, nebo se mu vyhnul.",
      "Kritika má cenu. Rozhodčí si ji pamatuje do příštího vzájemného zápasu a hraniční verdikty pak padnou spíš proti tobě — nanejvýš o tři procenta, zápas ti to nevezme, ale nakřiví. Zášť vyprchává zhruba za sezónu.",
      "Za ostrá slova může přijít pokuta od disciplinární komise. Na druhé straně stojí kabina a fanoušci — když se trenér postaví za mužstvo, morálka jde nahoru.",
      "Nic z toho není skryté. Karta rozhodčího ukazuje spočítané číslo i důvod: „Sudí Vopička si tě pamatuje: jde po tobě.\"",
      "AI trenéři nově mluví do novin sami od sebe. Provokatér si rýpne, férovka smeká, pohodář se shazuje — a ty na to po zápase odpovíš.",
      "Z rozhovoru vyjde článek ve Zpravodaji v rubrice Ohlasy po zápase, i s tím, co jsi řekl.",
    ],
  },
  {
    date: "2026-08-13",
    emoji: "📊",
    title: "Statistiky ligy — 22 žebříčků místo pěti",
    items: [
      "Ve statistikách ligy bylo pět tabulek, teď je jich dvaadvacet a k tomu tři nové sekce: brankáři, týmy a kuriozity sezóny.",
      "U hráčů přibyli exekutoři penalt (4/5 = čtyři góly z pěti pokusů), góly ze standardek, góly na 90 minut, úspěšnost zakončení, odehrané minuty, fauly a zranění.",
      "Brankáři mají vlastní sekci: nejmíň inkasovaných na odchytaný zápas, čistá konta a zákroky. Chycené penalty se počítají zvlášť.",
      "U týmů najdeš útok a obranu, průměrnou návštěvu doma, držení míče, nejčistší mužstvo, nejdelší neporazitelnost, výhry v řadě a bilanci doma vs. venku.",
      "Kuriozity sezóny: nejrychlejší gól, nejdivočejší zápas, největší výhra, nejvíc gólů v zápase a rekordní návštěva. Každá vede na ten zápas.",
    ],
  },
  {
    date: "2026-08-12",
    emoji: "🎯",
    title: "Standardky — penalty, rohy a přímáky",
    items: [
      "V zápasech se kopou rohy, penalty a přímé kopy. Padne z nich zhruba každý čtvrtý gól.",
      "Nastav si exekutory. Na stránce Sestava je nová karta Role v týmu — vybereš v ní kdo kope penalty a kdo přímé kopy a rohy. Dokud to neuděláš, kope za tebe ten, kdo má nejvyšší standardky, a to nemusí být ten, koho chceš.",
      "Exekutoři platí pro celý klub — v lize, poháru i přáteláku. Když zvolený hráč zrovna nehraje nebo ho stáhneš, standardky převezme nejlepší zbylý.",
      "Penalta je souboj střelce s gólmanem, obrana do toho nemluví. Rozhoduje klid na míči, technika a střelba. V závěru vyrovnaného zápasu se navíc pozná povaha: nervák ji zahodí, chladnokrevný dá. Nařídí se asi jedna za čtyři zápasy a tři ze čtyř skončí gólem.",
      "Rohů je kolem devíti za zápas. Centruje jeden, hlavičkuje druhý — do vápna naskakují útočníci a stopeři podle hlaviček a důrazu. Vysoký stoper má důvod chodit nahoru. Asistenci si připíše ten, kdo kopal.",
      "Přímák napřímo na branku padne málokdy, ale padne. Dobrý exekutor se vyplatí.",
      "Ve větru se centry rozhodí dřív, než doletí. V dešti a sněhu je těžký míč pro gólmany noční můra a hlavičkářům nahrává.",
      "Gólů celkem padá stejně jako dřív, jen se jinak rozdělily. Tabulky se tím nerozhodí.",
      "U kapitána teď vidíš vůdcovství — jediné, podle čeho kapitán funguje. Od 65 zvedne po gólu náladu celému mužstvu, od 80 dvojnásobně. Slaboch pod 35 ji po inkasovaném gólu naopak srazí.",
      "V zápase přibyly statistiky rohů, standardek a penalt. U každého gólu je vidět, odkud padl — po rohu, z penalty, z přímáku nebo z brejku.",
      "Přenos zápasu penaltu natáhne: hřiště ztmavne, míč pulzuje na puntíku a přes celé hřiště bliká PENALTA se jménem exekutora. Teprve pak se dozvíš, jak to dopadlo.",
    ],
  },
  {
    date: "2026-08-11",
    emoji: "🧺",
    title: "Sedm nových věcí do kůlny",
    items: [
      "Pračka a sušárna dresů je z nové sedmičky nejzvláštnější — sama o sobě nedělá nic, ale zpomaluje chátrání všeho ostatního vybavení až o 45 %. Vyplatí se až ve chvíli, kdy už něco máš.",
      "Sekačka a traktůrek drží trávník v kondici. Stav hřiště ovlivňuje zranění i techniku v zápase, takže je to znát v sobotu.",
      "Kávovar do kabiny tlumí ranní kocovinu po posezení v hospodě. Ráno se to s kafem prostě dá.",
      "Iontové nápoje a gely na lavičku zabírají tam, kde se zápasy rozhodují. Po sedmdesáté minutě padá kondice všem rychleji — s gely v kapse ten závěr ustojíš líp než soupeř.",
      "Tombola a losy jsou první vybavení ve hře, které vydělává. Za každého diváka na domácím zápase přiteče pár korun navíc, a los si koupí i ten, kdo prolezl dírou v plotě. Při plné výbavě a slušné návštěvě se zaplatí zhruba za devatenáct domácích zápasů.",
      "Ozvučení a hlasatel zvedá spokojenost fanoušků — hymna před derby, sestavy nahlas, dechovka o poločase. Spokojení lidi chodí ve větším počtu, takže je to znát na vstupném i na bufetu.",
      "Klubová kronika a vitrína drží hráče doma. Kdo vidí v klubovně fotky z roku 1963, odchází nerad. U rodáků to platí dvojnásob.",
    ],
  },
  {
    date: "2026-08-11",
    emoji: "🏷️",
    title: "Vybavení se dá prodat — bazar a zastavárna",
    items: [
      "Vybavení bylo dosud jednosměrka: koupíš, opotřebuje se, opravíš, koupíš vyšší. Zbavit se ho nešlo. Teď u každého kusu, který vlastníš, najdeš tlačítko Prodat a dvě cesty ven.",
      "V bazaru vystavíš vybavení za svoji cenu a kluby z tvé ligy si ho můžou koupit. Inzerát platí týden a vybavení mezitím používáš dál — dokud se neprodá, bonusy ti běží. Cenu si řekni jakou chceš; jediné, co nejde, je jít pod to, co za věc dá zastavárna.",
      "Zastavárna vykoupí cokoliv na počkání, ale za nejhorší cenu ve hře. Rozhoduje stav: za ojetou sadu dostaneš zlomek toho, cos do ní vrazil. Co jde do zastavárny, mizí ze hry natrvalo.",
      "Na kartě nabídky je vidět stav prodávaného kusu, popis úrovně a srovnání s cenou v obchodě — takže hned poznáš, kolik ušetříš. Koupit jde jen to, co ještě nemáš a na co máš nárok; u zamčené úrovně se rovnou dozvíš, co ti chybí.",
      "Pozor na opotřebení: vyšší úroveň v mizerném stavu může být slabší než to, co máš teď. Potvrzení nákupu ti spočítá efektivní úroveň před a po, ať tě to nepřekvapí.",
      "V bazaru nabízejí i kluby ze sousedních okresů — Strakonice, Blatná, Český Krumlov a další vyklízejí kůlny. Nabídka se každou noc doplňuje, takže je se na co dívat i v lize, kde jsou samí lidé.",
      "Dodávku nejde prodat ani koupit v den zápasu. Kluci s ní počítají a sestava je už rozeslaná.",
    ],
  },
  {
    date: "2026-08-10",
    emoji: "📰",
    title: "Zpravodaj má vlastní redakci — a redaktoři si tě zapamatují",
    items: [
      "Každý okres má svoji redakci: čtyři redaktory s tváří, jménem a povahou. Bulvární pero jde po drbech z kabiny, seriózní rozebírá rozestavení a čísla, vyčůraný se ptá mile a odpověď ti pak otočí, srdcař žije atmosférou v kotli. Pod každým článkem je podepsaný ten, kdo ho psal, a jeho jméno vede na profil.",
      "Rozhovory teď vede konkrétní člověk. Ještě než začneš odpovídat, vidíš, kdo se ptá a jaký k tobě má vztah — od „drží palce\" po „jde po nich\".",
      "A ten vztah se hýbe podle tebe. Kdo je na novináře vstřícný, dočká se přátelských otázek a shovívavých článků. Kdo je odbývá, dostane otázky s háčkem a v novinách se s ním nikdo mazlit nebude.",
      "Vztah není jen do počtu: nakloněná redakce dělá klubu dobré jméno a přivádí lidi na stadion, znepřátelená ho sráží. Na reputaci i návštěvnosti je to poznat.",
      "Celý zpravodaj dostal podobu skutečných novin — sloupcová sazba, hlavička s ročníkem a číslem vydání, rubriky oddělené linkami a rozhovory s velkým portrétem, kolem kterého text obtéká.",
    ],
  },
  {
    date: "2026-08-09",
    emoji: "🏋️",
    title: "Trénink se plánuje na celý týden — a hráči na něj reagují",
    items: [
      "Každému dni v týdnu můžeš dát vlastní typ tréninku. V pondělí kondice, ve středu taktika, v pátek technika — nebo den nechat volný. Za volný den se netrénuje ani neplatí. Kdo chce mít celý týden stejný, přepne zpátky jedním tlačítkem.",
      "Ke každému tréninkovému dni si vybereš i intenzitu: lehký, normální nebo tvrdý. Lehký je regenerační a hodí se den před zápasem, tvrdý dá hráčům víc, ale pořádně je vysaje.",
      "Hráči teď na nastavení reagují náladou. Dříč se při jednom tréninku týdně nudí, pohodář a unavený veterán reptá, když se dře pětkrát. Komu tempo sedne, chodí spokojený. Po každém tréninku je vidět, komu se co nelíbilo a proč.",
      "Nová karta Co to přinese ukazuje ještě před uložením, co dané nastavení udělá: kolik zlepšení čekat za týden i za měsíc, kolik to bude stát a jak tempo sedne kádru — kolik hráčů je spokojených, kolik přetížených a kdo to nese nejhůř. Čísla se přepočítají hned, jak něco změníš.",
      "Součástí je i rozpis, kdo hráčům k růstu pomáhá: hlavní trenér, asistent, trenér mládeže i brankářů a jednotlivé kusy vybavení od míčů po taktickou tabuli. U každého je vidět, kolik procent přidává — takže poznáš, do čeho se vyplatí investovat.",
    ],
  },
  {
    date: "2026-08-07",
    emoji: "🧩",
    title: "Domů si poskládáš sám",
    items: [
      "Domovská stránka byla pro všechny stejná a v pevném pořadí. Teď je to skládačka — tlačítkem Upravit dashboard přepneš stránku do editace a naskládáš si ji přesně tak, jak ti to vyhovuje.",
      "Widget chytneš za jeho zelenou lištu a přetáhneš myší nebo prstem kam potřebuješ. Šipky ↑↓ ho posunou po jednom kroku, křížek ho odebere a čísla 1/2/3 nastaví, přes kolik sloupců se roztáhne. Na mobilu je vždycky jeden sloupec.",
      "Na výběr je 64 widgetů v osmi kategoriích — Přehled, Zápasy, Liga, Kádr, Přestupy, Finance, Fanoušci a Klub. Kromě všeho, co na Domů bývalo, přibyla spousta grafů: vývoj bodů a rozpočtu, koláče příjmů a výdajů, radar dovedností kádru a trenéra, věková pyramida, návštěvnost proti kapacitě stadionu, spokojenost fanoušků na ciferníku, vývoj fanouškovské základny nebo pohárový postup.",
      "Nové jsou i žebříčky, které dřív nikde nebyly pohromadě: volní hráči na trhu, kdo je na prodej, poslední přestupy v lize, nejlepší hráči a mladíci A týmu i U21, nejlepší docházka na trénink a největší absentéři včetně důvodu, proč chyběli.",
      "Každý widget si můžeš obarvit jedním ze sedmi odstínů, ať se ti v tom lépe hledá. Všechny jsou světlé, takže zůstane čitelný.",
      "Widgety se sesypávají nahoru — menší karta zaplní místo pod vyšším sousedem a nikde nezůstávají prázdná okna.",
      "Rozložení se ukládá na server, takže tě následuje na mobil i na počítač. Tlačítkem Obnovit výchozí se kdykoliv vrátíš k původní podobě.",
      "Kdo nic nemění, nepozná rozdíl: výchozí rozložení odpovídá tomu, jak Domů vypadala dosud.",
      "Opraveno: karta Bilance nezobrazovala skóre — místo vstřelených a inkasovaných branek tam svítila prázdná dvojtečka a rozdíl vždycky nula.",
    ],
  },
  {
    date: "2026-08-07",
    emoji: "⭐",
    title: "Reputace klubu má vlastní stránku — a nové způsoby, jak ji zvednout",
    items: [
      "V menu přibyla sekce Reputace. Na jedné stránce vidíš, kde tvůj klub stojí, co ti reputace odemyká, kolik ti vydělává v korunách a kolik by to bylo o stupeň výš.",
      "Stupnice ukazuje prahy, na kterých se odemykají vyšší úrovně stadionu a vybavení — takže je na první pohled vidět, jestli ti chybí reputace, odehrané zápasy, nebo prostě jen čas.",
      "Reputaci nově zvedne i vyprodaný stadion, série výher, kádr postavený na místních rodácích a dobrý vztah s obcí. Naopak poloprázdné hlediště, série proher nebo měsíc bez jediného úspěchu ji stáhnou dolů — klub, na kterém se nepracuje, se pomalu vytrácí z povědomí.",
      "Čím výš jsi, tím dráž se stoupá: nad 55 bodů se zisky krátí. Ztráty ne.",
      "U každé změny se pamatuje důvod, takže v historii přesně vidíš, odkud se každý bod vzal.",
      "Zamčené upgrady na stadionu a ve vybavení teď vypíšou všechny chybějící podmínky naráz a poradí, co s tím. U sprch, hřiště, parkoviště a tribun navíc připomenou, že je umí spolufinancovat obec — tam reputace nerozhoduje.",
    ],
  },
  {
    date: "2026-08-07",
    emoji: "🧑‍💼",
    title: "Vliv trenéra na fanoušky je konečně čitelný",
    items: [
      "Karta na stránce Fanoušci ukazuje, jak se z reputace a motivace trenéra počítá jeho vliv, a celý žebříček stupňů — od Vyhlášeného po Odepsaného. Zvýrazněný je ten tvůj.",
      "Vliv trenéra sahá od −3 do +3 spokojenosti po každém zápase a posouvá i dlouhodobou hladinu loajality. Respektovaný a nabuzený kouč je na tribunách znát.",
      "U každého stupně je napsáno, co ti chybí do dalšího — v bodech reputace i motivace. A pod tím konkrétní návod, čím obojí hýbat.",
      "Nápověda dostala novou sekci, která rozlišuje reputaci klubu a reputaci trenéra. Jsou to dvě různá čísla a pletlo se to.",
    ],
  },
  {
    date: "2026-07-30",
    emoji: "🎯",
    title: "V profilu hráče je vidět, co je pro jeho pozici klíčové",
    items: [
      "V profilu hráče se nově zvýrazní vlastnosti, na kterých u jeho pozice nejvíc záleží — u obránce třeba Obrana, Hlavičky nebo Síla, u záložníka Přihrávky a Přehled. Na první pohled tak vidíš, podle čeho hráče posuzovat.",
      "Přibyly taky Přehled a Zkušenost, které se v profilu dřív vůbec nezobrazovaly.",
    ],
  },
  {
    date: "2026-07-30",
    emoji: "📊",
    title: "Oprava celkového hodnocení hráčů",
    items: [
      "Celkové hodnocení se po tréninku zvyšovalo mnohem rychleji, než odpovídalo skutečnému zlepšení — za každý natrénovaný bod povyskočilo o celý bod, přestože je to vážený průměr deseti atributů. U nejvíc trénovaných hráčů se rozdíl vyšplhal přes 30 bodů.",
      "Hodnocení je nově přepočítané u všech hráčů ve hře, průměrně kleslo o 3 body. Tvoji hráči jsou přesně tak dobří jako předtím — zápasy se vždycky počítaly ze skutečných schopností, ne ze zobrazeného čísla. Žádný odehraný výsledek ani tabulka se nemění.",
      "Mzdy se odvíjejí od hodnocení, takže většině hráčů klesly. Vyjednané navýšení zůstává každému zachované.",
      "Trénink teď hodnocení přepočítává správně, takže už znovu neutíká.",
    ],
  },
  {
    date: "2026-07-10",
    emoji: "🏟️",
    title: "Velký upgrade 3D stadionu",
    items: [
      "Stadion ve 3D dostal pořádný vizuální posun — stylizovaná obloha, měkčí světlo a rozsvícený, jemně pulzující scoreboard.",
      "Vlajky, kotel plachta i vlaječky teď vlají ve větru, diváci vypadají jako lidi místo barevných kostek a branky mají skutečnou síť.",
      "Tribuny sedí dál od hřiště, střechy tribun a cedule už neplavou ve vzduchu, plot je pořádně vidět, kolem hřiště je souvislá řada reklam a v okolí smíšený les.",
    ],
  },
  {
    date: "2026-07-10",
    emoji: "🚩",
    title: "Klubová vlajka na stadionu",
    items: [
      "Vlajka ve 3D vizualizaci stadionu teď nese tvůj klubový znak přesně jako v profilu — správný tvar, barvy i symbol (emoji/půlměsíc).",
      "Vlajka je celá v klubové barvě a pořádně vlaje ve větru.",
      "Nově si vybereš i vlastní barvu vlajky — ve Stadion → Vzhled stadionu přibyl výběr barvy vlajky (jakmile ji máš postavenou). Výchozí je týmová barva.",
    ],
  },
  {
    date: "2026-07-10",
    emoji: "⚽",
    title: "Přátelák jde domluvit i v den ligy",
    items: [
      "Výzvu na přátelák teď pošleš, i když máš ten den ligový zápas. Přátelák se stejně hraje až v den, kdy ho soupeř přijme — a to nikdy nepadne na den s ligou. Dřív to hlásilo, že dnes máš ligový zápas, a nešlo výzvu ani odeslat.",
    ],
  },
  {
    date: "2026-07-09",
    emoji: "↩️",
    title: "Zrušení odeslané výzvy na přátelák",
    items: [
      "Odeslal jsi výzvu na přátelák a rozmyslel sis to? U čekajících odeslaných výzev v sekci Přáteláky je teď tlačítko Zrušit. Soupeři přijde SMS, že jsi výzvu stáhl.",
    ],
  },
  {
    date: "2026-07-09",
    emoji: "📊",
    title: "Pozápasové hodnocení — o výkonu, ne o kádru",
    items: [
      "Rozbor toho, co rozhodlo zápas, teď jasně říká, že srovnává VÝKON v daném zápase, ne kvalitu kádru. Dřív formulace zněla, jako bys měl slabý útok — i když jsi byl kádrově vyrovnaný a jen se ti zápas nepovedl.",
    ],
  },
  {
    date: "2026-07-09",
    emoji: "🗺️",
    title: "Hlášky sedící k okresu",
    items: [
      "Hospodské historky, denní speciality, přestupové hlášky, komentář zápasu i výroky trenérů teď ladí k okresu — Praha dostává městský kolorit (Sparta–Slavia, tramvaj, náplavka, kavárny), Prachaticko šumavský (Boubín, myslivci, pouť, zabíjačka).",
      "Přibyla velká várka nových hlášek pro obě prostředí, tak se to tak často neopakuje.",
      "Týmy z jiných okresů (třeba Budějovice) dostávají neutrální texty místo šumavských — už žádní myslivci z Volar v Praze.",
    ],
  },
  {
    date: "2026-07-07",
    emoji: "🔥",
    title: "Prales Ultras — pohled z kotle",
    items: [
      "Po každém kole vychází v Zpravodaji nová rubrika Prales Ultras — souhrn zápasů očima fanoušků. Kam přišlo nejvíc lidí, kde bylo vyprodáno a kde zely ochozy prázdnotou.",
      "K článku patří fotky kotlů — pohled na sektor s plachtou, vlajkami a bubnem. Čím větší kotel a čím víc lidí, tím větší peklo na fotce.",
      "Máš v kotli plachtu s vlastním nápisem? Objeví se přímo na fotce v novinách.",
    ],
  },
  {
    date: "2026-07-06",
    emoji: "🗳️",
    title: "Komunální volby v obcích",
    items: [
      "Proběhla nová sezóna a s ní komunální volby — na mnoha místech se vyměnilo vedení obcí. Podívej se do sekce Obec, kdo ti teď sedí na radnici.",
      "Vztahy klubů s obcemi (přízeň) začínají nanovo — všem se resetovala na neutrál.",
      "Získat si přízeň obce je teď těžší — brigády, petice i posezení v hospodě dávají méně přízně než dřív. Budování vztahu s radnicí je běh na delší trať.",
    ],
  },
  {
    date: "2026-07-06",
    emoji: "🏟️",
    title: "Tři nové stavby na stadionu",
    items: [
      "Zastřešení tribun — v dešti a mrazu ti neuteče tolik diváků. Od plachty nad lavičkami po pořádnou plechovou stříšku. (Nejdřív musíš mít tribuny — co jinak zastřešit.)",
      "Sektor kotle — vlajkový sektor za brankou s bubnem. Zvedá domácí výhodu v zápase a náladu týmu. Čím větší kotel, tím větší peklo pro soupeře.",
      "Na plachtu v kotli si napíšeš vlastní nápis — chorál, jméno klubu, cokoli. Nastavíš v Stadion → Vzhled stadionu (jakmile kotel postavíš).",
      "Sociálky — kadibudka, zděné záchodky nebo čisté sociálky s teplou vodou. Fanoušci nemusí do kopřiv a jsou spokojenější.",
      "Všechny tři stavby vidíš i ve 3D vizualizaci stadionu.",
    ],
  },
  {
    date: "2026-07-06",
    emoji: "👔",
    title: "Zaměstnanci — realizační tým klubu",
    items: [
      "Nová stránka Zaměstnanci: najmi si realizační tým. Dvanáct rolí (asistent, trenér mládeže/brankářů, kondiční trenér, masér, lékař, psycholog, správce hřiště, skaut, obsluha občerstvení, šéf fanklubu, ekonom), každou obsadíš max jedním člověkem. Nejsou povinní — jsou to bonusy.",
      "V záložce Volní je nabídka lidí z okresu (kdo dřív přijde…). Každý má sedm vlastností a profesi, ve které je nejlepší — ale najmout ho můžeš na jakoukoli roli. Jeho vlastnosti určují, jak dobrý v ní bude.",
      "Masér zvedá regeneraci, lékař hojí zranění rychleji, kondiční trenér šetří síly, asistent a trenér mládeže zrychlují tréninky, trenér brankářů kouše gólmany, psycholog drží náladu, správce se stará o trávník a vybavení, šéf fanklubu přitáhne diváky.",
      "Obsluha občerstvení (klidně i šikovná servírka — rozhoduje šarm) zvýší prodej piva a klobás. Ekonom osekne provozní náklady a vyjedná víc od sponzorů. Skaut jednou týdně tipne talent.",
      "Za peníze můžeš zaměstnance poslat na kurz a vylepšit mu konkrétní vlastnost — třeba maséra přeškolit na lékaře. Během kurzu normálně pracuje.",
      "Platí se podpisné při náboru a týdenní mzda (strhává se s ostatními mzdami). Propuštění je zdarma.",
    ],
  },
  {
    date: "2026-07-05",
    emoji: "🚐",
    title: "Sedm nových kusů vybavení",
    items: [
      "Klubová dodávka — míň omluvenek kvůli dojíždění a lepší docházka na tréninky. Od ojeté Felicie po mikrobus s logem.",
      "Posilovna v kabině (+kondice denně), tréninková zeď (+standardky), klubový gril (nálada kabiny drží výš).",
      "Kotel s bubny a vlajkami (+návštěva doma), zimní výbava lavičky (menší postih počasí), kamera a rozbory (mladíci rostou rychleji).",
      "Lékárnička konečně dělá, co slibovala: od úrovně 2 jsou nová zranění o 1-2 dny kratší.",
      "Chemie z rozlišováků a taktické tabule se nově skutečně počítá do sehranosti formace.",
    ],
  },
  {
    date: "2026-07-05",
    emoji: "🤝",
    title: "Přestupový tlak — o hvězdy se hraje",
    items: [
      "Cizí kluby z okolí nově posílají nabídky na tvoje nejlepší hráče — peníze mají připravené a nabízejí víc, než je tržní cena. Ber, nebo nech být: o ceně nejednají.",
      "U každé nabídky vidíš, jestli hráč o přestup STOJÍ — a u vlastních hráčů i proč (málo hraje, špatná nálada, silnější klub, lákavé peníze…).",
      "Odmítneš nabídku, o kterou hráč stál? Napíše ti naštvanou SMS a můžeš si to s ním vyříkat — vlastními slovy, po pár zprávách se ukáže, jak sis vedl.",
      "Nespokojený hráč chodí míň na tréninky, vymlouvá se ze zápasů a může i „záhadně“ marodit. Fyzioterapeut ti poradí, když mu zranění nesedí.",
      "Když řeči nestačí, nabídni dohodu: místo v sestavě (slib se hlídá!), vyšší odměny, nebo slib prodeje při další nabídce.",
      "Pozor: stejná pravidla platí i pro nabídky lidských soupeřů — dobře mířenou nabídkou jde rozhodit hráče cizí kabiny. A naopak.",
    ],
  },
  {
    date: "2026-07-05",
    emoji: "📋",
    title: "Sponzorské smlouvy po sezónách a opravené přáteláky",
    items: [
      "Sponzorskou smlouvu jde nově PRODLOUŽIT přímo na kartě smlouvy — stejný sponzor, podmínky podle aktuální reputace, bez přejmenování klubu a bez sankce.",
      "Sponzorské smlouvy nově s koncem sezóny ztratí sezónu platnosti — roční smlouvy vyprší a podepíšeš novou za podmínek podle své aktuální reputace. O vypršení přijde SMS.",
      "Opravené zvaní na přátelské zápasy — zápasy z minulé sezóny už neblokují nové výzvy.",
      "V nabídce soupeřů pro přáteláky už nejsou U21 týmy.",
    ],
  },
  {
    date: "2026-07-04",
    emoji: "🌴",
    title: "Volno z tréninku a přehlednější Pohár",
    items: [
      "Tréninky: vybraným hráčům můžeš dát volno z nejbližšího tréninku — neztratí kondici, ale ani se nezlepší. Po tréninku se volno samo zruší.",
      "Pohár: pavouk je konečně čitelný na mobilu a střelci mají vlastní záložku.",
      "Pohár: odměny za kola jsou přehledně srovnané a Pohár najdeš nově i v mobilním menu Více.",
      "Zpravodaj: otevírák sezóny a ohlédnutí za sezónou už z hlavní stránky nevytlačí příval přestupových zpráv.",
    ],
  },
  {
    date: "2026-07-04",
    emoji: "🎺",
    title: "Sezóna 2 odstartovala",
    items: [
      "Herní kalendář jede podle skutečného — liga se hraje v pondělí a ve čtvrtek, pohár v sobotu.",
      "Celorepublikový amatérský pohár: velkokluby z celé země, plnohodnotné zápasy a statistiky střelců.",
      "Hráči přes léto zestárli a někteří veteráni se rozloučili — mrkni na soupisku.",
    ],
  },
];

export const LATEST_NOTE_DATE = RELEASE_NOTES[0]?.date ?? "";

/**
 * Otisk nejnovějšího záznamu.
 *
 * Dřív se porovnávalo jen datum, jenže za jeden den může vyjít víc záznamů —
 * a hráči, který mezitím Novinky otevřel, se ten druhý už nikdy neohlásil,
 * protože "2026-08-07" < "2026-08-07" neplatí. Otisk zahrnuje i nadpis, takže
 * každý nový záznam badge spolehlivě vyvolá.
 */
export const LATEST_NOTE_KEY = RELEASE_NOTES[0]
  ? `${RELEASE_NOTES[0].date}|${RELEASE_NOTES[0].title}`
  : "";

const NOTES_SEEN_KEY = "release_notes_seen";

/** Má hráč neprohlédnuté novinky? (SSR-safe) */
export function hasUnseenNotes(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(NOTES_SEEN_KEY) !== LATEST_NOTE_KEY;
  } catch (e) {
    console.warn("release notes seen check:", e);
    return false;
  }
}

/** Označit novinky jako prohlédnuté (volá stránka Novinky). */
export function markNotesSeen(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(NOTES_SEEN_KEY, LATEST_NOTE_KEY);
  } catch (e) {
    console.warn("release notes seen store:", e);
  }
}
