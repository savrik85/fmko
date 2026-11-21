# Konverzace s dopadem na ostatní hráče („Kabina má uši“)

Datum: 2026-11-21 · Stav: návrh ke schválení · Rozsah: „maximum“ (uživatel)

## Proč

Hra teď stojí na konverzacích s hráči a manažery to baví nejvíc. Rozhovor ale dnes
zasáhne jen toho jednoho hráče (vztah k trenérovi, nálada, sliby). Manažeři přitom
v SMS běžně mluví o ostatních a čekají, že se to projeví. Uživatel chce, aby
konverzace **mohly mít dopad na ostatní hráče**, a obecně konverzace rozšířit.
Na otázku „kolik se má roznést samo“ odpověděl „chci maximum“.

## Z čeho návrh vychází (prod, 19.–21. 11., 853 zpráv; 1 128 SMS trenérů od 1. 11.)

Co manažeři čekají a hra nedělá:

1. **Stížnost na spoluhráče končí v prázdnu.** Hra ji sama posílá (scénář `team_chemistry`,
   3× za 3 dny: Šmejkal, Král, Pauch). Trenér: „Se Šmejkalem si promluvím, flákání trpět
   nebudu.“ Šmejkal o ničem neví a když mu trenér napíše, nezná kontext. Dopad má jen tón
   rozhovoru se stěžovatelem (rivalita ± v `applyResolutionAndClose`).
2. **Pravidla kabiny nic nedělají.** „Kdo nebude moct, bude na tréninku běhat kolečka“,
   „do 9 doma“, „s mírou, ať nemám omluvenky“. Turek se pak omluvil, trenér: „víš, co jsem
   psal o kolečkách“. Nic.
3. **Rozhodnutí o jednom řečené druhému.** „Pásku budeš mít ty, místo Straky“, „s Alexem se
   budete střídat“, „nechám chytat Aleše Pešla“. Dotčený se to nedozví. Kapitánská páska
   z dohody (`transfers/unrest.ts`, `captaincy`) přepíše `teams.captain_id` a starý kapitán mlčí.
4. **Usmiřování se nepropíše.** „Co se stalo mezi Růžičkou a Tomanem?“ → „už jsme si plácli“,
   rivalita v `relationships` zůstane.
5. **Tlak kabiny na jednoho.** „Šimek… řekněte mu něco 🙏“ → Rubeš: „vytáhnu ho z postele
   sám“. Na Šimka bez vlivu. „Vyřiď klukům, že do 9 budou doma“ (starší data) taky.
6. **Pokyn na zápas** („vezmi si na osobku jejich Říhu“): engine nic takového nezná.
7. **Slib nejde upravit dohodou** (Chval: základ → domluva na druhý poločas → ve 3 ráno
   „slíbil jste mi základ“).
8. **Objem:** ze 73 rozhovorů, které hráč začal sám, 44 bez odpovědi; 32× „urazil se“ za 3 dny.
   Rozpad: 34 z 44 neodpovězených a 29 z 32 urážek připadá na kluby, jejichž trenér za ty
   3 dny nenapsal nic. U 28 klubů, kde trenér píše, je to 10 z 39 bez odpovědi, průměr
   1,2 zprávy od hráče na klub a den (nejvýš 2). Aktivní manažeři tedy zahlcení nejsou.

Co už existuje a nesmí se zdvojit:
- `relationships` (bratři, otec–syn, parťáci od piva, sousedi, spolužáci, kolegové, rivalové,
  mentor; `strength`), chemie sestavy v enginu (`CHEMISTRY_WEIGHTS`).
- `coach_commitments` (sliby z volného textu, kind bez CHECK, rozšiřitelné), `player_promises`.
- `club_incident_knowledge` (kdo co ví u incidentu, ochota mluvit), úkol „poptej se“.
- Kabina: oslovený odpoví, proslov, přemluvení omluvených (`squad-talk.ts`), sázky kabiny.
- Truc za vynechání (`leftOutSulk`), nespokojenost (`transferUnrest`).
- Odložené zprávy hráčů (`player_follow_ups`, CHECK na `kind`, nové druhy = jiná tabulka nebo přestavba).
- Zamítnuté a vyhozené: drby o přestupech od výčepu (F10, revert a9b77149). Tady jde o něco
  jiného: šíří se to, co **řekl sám trenér** (nebo co si hráč stěžoval), ne cizí informace.

## Cíle

- Každá věc, kterou trenér napíše o jiném hráči, může dojít k dotčenému a **projevit se ve hře**.
- Šíří se samo („maximum“), ale **po skutečných vazbách** a podle povahy, a hráč vždy řekne,
  odkud to ví („brácha mi říkal“, „v hospodě se povídalo“). Žádná náhoda bez vysvětlení.
- Kabina, skupina i vzkaz přes hráče mají skutečné následky.
- Pokyny na zápas z telefonu se promítnou do enginu.

## Ne-cíle

- Žádná čísla nálady, vztahu ani „autority“ v UI (jen slovy). Hráč mluví jen přes SMS.
- Žádné formuláře s tlačítky místo psaní (výjimka: peníze dál jen tlačítkem, jako dnes).
- Žádné nové drby od hospodského ani tipy na cizí hráče.
- Žádné zápisy záznamu „Co je nového“ bez výslovného přání.

## Anti-cíle (selhání, i kdyby kód běžel)

- Hráč tvrdí, že slyšel něco, co trenér nikdy nenapsal, nebo od někoho, kdo to vědět nemohl.
- Šíření působí jako trest za psaní: manažer přestane psát o ostatních. Pochvala za zády
  musí mít stejnou šanci se roznést jako kritika a dotčeného potěší.
- Lavina SMS: víc nových zpráv od hráčů, než manažer stihne přečíst (dnes 44/73 bez odpovědi).
- Slib hráči (v textu SMS nebo promptu), který se nikde nezapíše nebo nic nezmění.
- Zdvojení existující mechaniky (truc za vynechání, sázky, poptej se).

## Přístupy (zváženo)

1. **Jen přes trenéra**: dotčený se nic nedozví, dokud mu trenér nenapíše; pak zná kontext.
   Málo dramatu.
2. **Volné šíření**: věci se šíří samy po vazbách, dotčený se ozve sám.
3. **Kombinace**: samo jen rozhodnutí na úkor někoho a kritika za zády.

**Vybráno: 2 (uživatel: „chci maximum“).** Šíří se všechno, co trenér o někom řekne
(pochvala, kritika, rozhodnutí, vzkaz, stížnost), ale jen po vazbách a s pojistkami na
objem a férovost (níže). Technicky jedna společná vrstva „kdo co ví“ (jako
`club_incident_knowledge`), na kterou se napojí všechny části, místo samostatných mechanik.

## Návrh

### 1. Rozpoznání: o kom trenér mluví (společné pro všechno)

- Každá zpráva trenéra hráči (1:1), do kabiny a do skupiny projde levným sítem: obsahuje
  jméno, příjmení nebo přezdívku jiného hráče **klubu** (áčko i U21), i ve skloňovaném
  tvaru? Pozor na shody s běžnými slovy (na produ: Pořádek × „pořádně“, Pivko × „pivko“,
  Němec × „Německo“, Dělo × „dělo“): síto jen pustí model, rozhodne model.
- Model (jedno volání na zprávu, ideálně společné s dnešním `detectCommitment`, ať se
  nepálí kvóta dvakrát) vrátí seznam nálezů. Každý nález: o kom (id ze seznamu, který
  dostane), druh, doslovná citace (ověří se jako dnes `quoteHoldsUp`). Druhy:
  - `praise`: pochvala X
  - `criticism`: kritika X (výkon, přístup, váha, pití)
  - `decision_against`: rozhodnutí na úkor X (páska, místo v základu, brána, lavička)
  - `decision_for`: rozhodnutí ve prospěch X (dostane šanci, páska)
  - `talk_to`: trenér slibuje, že si s X promluví / srovná ho
  - `reveal_source`: trenér prozradí, kdo si stěžoval / kdo co řekl
  - `relay`: vzkaz pro X nebo celou kabinu přes adresáta („vyřiď“, „řekni mu“, „řekněte mu něco“)
  - `mediation`: usmiřování X a Y („podejte si ruce“, „pozvu vás oba“, „co se mezi vámi stalo“)
  - `rule`: pravidlo pro celou kabinu (viz část 6)
  - `match_instruction`: pokyn adresátovi na příští zápas (viz část 8)
  - `commitment_change`: úprava běžícího slibu dohodou (viz část 9)
- Zápis: tabulka `squad_hearsay` (jedna věc, která se může roznést) a
  `squad_hearsay_knowledge` (kdo ji ví, od koho, jak, kdy, jestli už zareagoval). Vzor:
  `club_incident_knowledge`. Věc má platnost (stará kritika po pár týdnech nikoho nezajímá).
- Co trenér napíše do **kabiny**, ví hned celá kabina (veřejně). Co napíše do **skupiny**,
  ví hned skupina. Co napíše **1:1**, ví zatím jen adresát.
- *(Moje volba po kontrole stavitele.)* Jmenovaný hráč, který zmínku čte sám v kabině nebo
  ve skupině, ji má **„před všemi“**: pochvala před partou potěší víc než 1:1, kritika před
  partou zabolí víc než 1:1, ale je to do očí, takže žádné „slyšel jsem…“ SMS. Reaguje
  v kabině (rozšíření `replyInSquadGroup`: jmenovaný je mezi odpovídajícími). Strop: stejný
  denní strop zlepšení jako u rozhovoru 1:1 (`coachChatAlreadyCounted`), ať levná zpráva
  do kabiny není nejlevnější páka na náladu. Zhoršení strop nemá (jako dnes).

### 2. Šíření (C, „šuškanda“)

- Běží v hodinovém běhu Telefonu (`runPhoneHourly`, cron `30 * * * *`) nebo v denním ticku
  (rozhodne stavitel podle zátěže; hodinově je přirozenější). Deterministicky ze seedu, ať se
  dá přehrát a otestovat.
- Kdo věc ví, může ji předat svým vazbám. Šance podle:
  - druhu vazby a `strength` (bratři, otec–syn, parťáci od piva nejvíc; sousedé, spolužáci
    středně; kolegové málo; **rival předá kritiku dotčenému rád**, pochvalu ne),
  - povahy předávajícího (ukecaný = stejný odhad jako `vyberMluvciho`: temperament, nízká
    disciplína; tahoun s vysokým leadershipem kritiku spíš nechá u sebe),
  - druhu věci: *(moje volba po kontrole stavitele)* **pochvala a kritika mají stejnou
    základní šanci**, rozdíl dělají jen vazby (rival předá hlavně kritiku, bratr a parťák
    hlavně pochvalu). Rozhodnutí na úkor se šíří víc, protože se týká sestavy a mluví se
    o něm. Cíl kalibrace: za týden na klub zhruba stejně došlých pochval jako kritik,
    když jich trenér napsal stejně,
  - příležitosti: hospoda (`season/pub.ts`, kdo seděl spolu ten večer) a den zápasu (kabina
    pohromadě) šanci zvednou.
- Dotčený se to může dozvědět i oklikou (A → bratr B → B to řekne X). Řetězec se ukládá
  (`from_player_id`, `via`), hráč pak v SMS řekne skutečný zdroj.
- Pojistky: strop předání na věc a den, věc nikdy neopustí klub (hráč na hostování ji ví,
  jen pokud ji ví jeho vazba), odchod hráče z klubu jeho znalosti nesmaže (bývalý spoluhráč
  pořád může vědět, ale už nereaguje).

### 3. Reakce dotčeného

Když se X dozví věc o sobě, hra:

- **Hned** zapíše dopad (nezávisle na tom, jestli trenér odpoví):
  - `criticism` za zády: vztah k trenérovi dolů (víc než stejná kritika do očí, ta dnes
    jde přes běžný dopad rozhovoru), nálada dolů.
  - `praise` za zády: vztah a nálada nahoru (víc než pochvala do očí).
  - `decision_against`: nálada dolů, vztah dolů, u hráče s nabídkou nebo trucem
    `transferUnrest` nahoru. **Menší**, když mu to trenér řekl sám dřív (v jeho
    konverzaci je o tom zmínka dřív, než se to dozvěděl jinudy).
  - `decision_for`: nálada nahoru.
  - `reveal_source` (X ví, kdo si na něj stěžoval): rivalita X × stěžovatel vznikne nebo sílí.
- **Napíše trenérovi** (nová odložená zpráva s realistickou prodlevou, jako `follow-ups.ts`),
  jen u věcí, které stojí za SMS (kritika, rozhodnutí na úkor, výrazná pochvala).
  „Slyšel jsem od bráchy, že prý jsem podle tebe lempl.“ Prompt zná: co přesně trenér
  napsal (citace), komu, odkud to X ví. Rozhovor dál běží jako běžný rozhovor od hráče
  (omluva, vysvětlení → běžný dopad rozhovoru).
- **Pamatuje si to**: v každém dalším rozhovoru má X v promptu, co o něm trenér říkal a
  odkud to ví (jako `memoryPromptLines`). Kdo to ví a nemá to o sobě, může to zmínit taky
  („Kluci říkali, žes Šmejkala seřval“).
- Rozhodnutí na úkor, která hra zná bez modelu, se zapíšou rovnou jako `decision_against`:
  - změna kapitána klubu (`teams.captain_id`): obě cesty, dohoda `captaincy`
    (`transfers/unrest.ts`) i obrazovka rolí v týmu (`services/lineup.ts`, `captainId`): starý kapitán,
  - změna kapitána v sestavě na zápas (`lineups.captain_id` proti minulé sestavě),
  - (truc za vynechání ze sestavy už existuje, `leftOutSulk`: **nezdvojovat**; jen když mu
    to trenér předem napsal, truc je menší, to je napojení, ne nová mechanika).

### 3b. Reakce na prodej a nákup (doplněno 2026-11-21 na přání uživatele)

Uživatel: „ať taky třeba reagujou na prodej nebo nákup pokud…“ (věta useknutá). Výklad:
reagují hráči, kteří k přestupujícímu **mají vztah** (rodina, kamarádi, rival), a u nákupu
i **konkurent na stejném postu**.

- Prodej hráče X z klubu, který vede člověk: každý v kádru s vazbou na X.
  Rodina (bratři, otec–syn): nálada a vztah k trenérovi výrazně dolů, nespokojenost nahoru
  (jen když už nějaká je), SMS vždy („Prodals mi bráchu?“). Kamarádi (parťáci od piva,
  mentor, spolužáci, sousedé, švagři): menší pokles, SMS někdy. Kolegové z práce: jen
  drobný pokles nálady. Rival: nálada nahoru, někdy škodolibá SMS.
- Nákup hráče Y: rodina v kádru nálada a vztah nahoru, SMS vždy („Díky, žes vzal bráchu“);
  kamarádi drobně nahoru; rival dolů; **konkurent na postu** (stejný post, je mezi dvěma
  nejlepšími na něm a Y je aspoň zhruba stejně dobrý): nálada dolů, někdy SMS („Další
  gólman? To se mnou nepočítáš?“), nespokojenost mírně nahoru, jen když už nějaká je.
- Používá stejnou vrstvu: věc o dotčeném (`teammate_left` / `teammate_arrived`), dopad hned,
  SMS přes stejný strop 2 na klub a den a stejné doručení, hráč si to pamatuje. Nešíří se
  (přestup ví všichni). Vazby se při přestupu nemažou, jen `removePlayer` je maže, takže
  reakce se musí spočítat **před** smazáním.
- Kabina při příchodu bráchy už dnes reaguje textem (vítání v kabině); tohle přidává dopad
  a SMS, nezdvojuje to.

### 4. Stížnost dotažená do konce (A)

- Stížnost hráče A na X (scénář `team_chemistry`, ale i volný text „Král má blbý kecy“)
  se zapíše jako věc `complaint` o X s původcem A. Šíří se jako ostatní (kabina ví, kdo si stěžuje).
- *(Moje volba po kontrole stavitele.)* Dnešní dopad tónu rozhovoru se stěžovatelem na
  rivalitu (`ai-player-spawn.ts`, `team_chemistry`: −25 / +20 / nová rivalita) se **nahradí**
  tímto tokem, ne přidá. O rivalitě rozhoduje rozhovor s X, nebo jeho absence (lhůta
  vyprší → rivalita mírně sílí, A je naštvaný). Jinak by se jedna stížnost započítala dvakrát.
  `assist_teamwork` (pochvala spolupráce) zůstává, jak je.
- Když trenér A odpoví, že si s X promluví (`talk_to`), vznikne slib trenéra A
  (`coach_commitments`, nový kind, lhůta ~3 herní dny).
- Trenér napíše X: X má v promptu, co mu je vyčítáno (ne kdo, pokud to trenér neprozradí;
  prozradí-li, `reveal_source`). Výsledek rozhovoru s X (tón) rozhodne:
  - X to vzal: rivalita X × A slábne, X dostane přechodně lepší přístup (navrhuji
    malé zvýšení formy do příštího zápasu přes stejný mechanismus jako proslov, jen pro jednoho hráče,
    `speechAdjustedRoll` posun pro hráče; stavitel ověří v enginu, že to jde po hráči),
  - X se urazil: rivalita sílí, nálada X dolů.
- Slib A se vyhodnotí: trenér s X mluvil a X to vzal → A poděkuje (vztah nahoru); X se urazil →
  A „aspoň jste to zkusil“ (beze změny); trenér s X nemluvil → A „tak sis s ním nepromluvil,
  co?“ (vztah dolů, slib porušen jako dnešní sliby).

### 5. Vzkaz přes hráče a tlak kabiny (D)

- `relay` v 1:1 („vyřiď Šimkovi, ať v neděli přijde“): adresát A vzkaz opravdu předá.
  Kabina uvidí zprávu od A (generovanou jeho hlasem, „Kluci, trenér vzkazuje…“); vzkaz pro
  jednoho jde do kabiny s oslovením, nebo jako věc do znalostí X (trenér soukromou SMS
  mezi hráči nevidí, X pak může reagovat v kabině nebo trenérovi).
- Účinnost podle leadershipu A a vazby A × X (rival vzkaz předá kousavě a může to obrátit).
- Dopady podle obsahu vzkazu (uzavřený seznam, jinak jen znalost bez dopadu):
  - „ať přijde / ať se nevymlouvá“: nižší šance měkké omluvenky (osobní, absurdní, kocovina)
    u X na příští zápas. Napojení: `generateAbsences` (`events/absence.ts`) dostane modifikátor
    hráče; platí i pro `recordedExcuses`/`settleAbsences` (kabina už odpověděla: pak
    přemluvení jako dnes `persuadeAbsentees`, ne nový los),
  - povzbuzení: nálada X nahoru,
  - výtka: jako `criticism`, ale „řekl mi to Rubeš za tebe“ (zdroj je jasný).
- Kabina („řekněte mu něco“, „Šimka potřebujeme“): kdo z kabiny odpoví, ten je „tlak“;
  účinek na X podle jejich vazeb k X. Stejné dopady jako vzkaz.

### 6. Pravidla kabiny (E)

- Trenér napíše pravidlo do kabiny (nebo 1:1 „řekni klukům“). Uzavřený seznam druhů, každý
  s napojením na místo ve hře:
  - `excuse_penalty` („kdo se omluví, běhá kolečka / platí / sedí na lavičce“): nižší šance
    měkkých omluvenek celého kádru (`generateAbsences`).
  - `curfew` („do 9 doma“, „s mírou, v neděli zápas“): nižší šance omluvenky z kocoviny a
    kocoviny v zápase (`engine/simulation.ts`, událost `hangover`, dnes alkohol ≥ 75).
  - `referee_discipline` („kecy na sudího = pokuta“): nižší šance hádky s rozhodčím
    (událost `argument` v enginu) a tedy žlutých za protesty.
- Pravidlo má skrytou **váhu** (v UI nikdy číslo): roste, když ho trenér vymáhá, klesá, když
  ho porušení projde. Účinek na omluvenky a události je úměrný váze a disciplíně hráče.
- **Porušení** (omluvenka, kocovina, žlutá za protesty) hra pozná sama. Trenér ho vymáhá
  psaním: SMS porušiteli („víš, co jsem psal o kolečkách“) se rozpozná jako vymáhání →
  trest podle pravidla: kolečka = nálada dolů a únava (kondice); pokuta = jako dnešní pokuta
  (`fineCap`, peníze jen přes existující cestu); lavička = slib trenéra „nepostavím ho“
  hlídaný jako sliby. Porušení, které trenér do ~2 dnů nevymůže, sníží váhu a kabina to ví
  (šíří se jako věc). Odpuštění („tentokrát to nech být“) taky sníží váhu, ale méně.
- Pravidla vidí trenér v Kabině slovy („Platí: kdo se omluví, běhá kolečka. Kluci to berou vážně.“).

### 7. Usmíření (F) a skupinový chat (G)

- `mediation`: trenér v jakémkoli rozhovoru usmiřuje X a Y. Rivalita slábne (dnešní čísla
  smíru: −25, pod 10 zaniká), když: trenér mluvil s oběma do ~3 dnů v dobrém tónu, nebo
  seděli oba v hospodě na jeho pozvání, nebo se usmířili ve skupině. Model v odpovědi „už
  jsme si plácli“ bez toho nic nemění (a prompt to nesmí tvrdit, pokud rivalita trvá).
- **Skupinový chat**: trenér v Telefonu založí skupinu se 2–4 hráči (oba gólmani, rivalové,
  stopeři). Hráči odpovídají trenérovi **i sobě navzájem** podle vazeb (rival rýpne, brácha
  se zastane). Každá odpověď stojí kredit jako dnes. Všechno řečené ví hned celá skupina.
  Usmíření ve skupině je nejsilnější (i nejriskantnější: hádka ji může zhoršit).
  *(Moje volba po kontrole stavitele.)* Na jednu zprávu trenéra odpoví nejvýš tolik hráčů,
  kolik je členů, a nejvýš 3 repliky celkem (včetně odpovědí mezi sebou). Cenu trenér vidí
  před odesláním („odpovědi až 3 × 3 Kč“), účtuje se jen skutečně poslaná odpověď.
  Technicky: konverzace typu `squad_group` s vlastním názvem a tabulkou členů (nový typ by
  znamenal přestavět CHECK v `conversations`).

### 8. Pokyny na zápas (H)

- `match_instruction` v SMS hráči na příští zápas. Uzavřený seznam:
  - `man_mark` (osobka na jmenovaného hráče soupeře): menší podíl označeného na střelách a
    asistencích, krytý hráč má horší zakončení; krycí hráč méně do útoku.
  - `attack_more` / `stay_back`: malý posun role.
  - `calm_down` („nekopej, máš žlutou“): nižší šance karet a protestů tohoto hráče.
  - `shoot_more`: víc střel, horší průměrná kvalita.
- Hráč pokyn v SMS přijme nebo se ohradí; platí jen když je v sestavě. Trenér pokyny vidí u
  sestavy („Z telefonu: Němec bere osobně Říhu“) a může je smazat.
- Efekty malé a ohraničené, změřené v laboratoři enginu (přehrání kol, `reference_engine_lab`)
  a ověřené proti kurzovému modelu sázkovky, ať se kurzy nerozbijí.
- Neplést s „Pokyny na lavičce“ (`engine/match-plan.ts`): ty jsou týmová pravidla za běhu
  zápasu z UI, tohle jsou osobní úkoly z telefonu.

### 9. Úprava slibu dohodou

- `commitment_change`: když trenér s hráčem běžící slib v rozhovoru změní („tak jen druhý
  poločas“) a hráč souhlasí, slib se přepíše (nový obsah, starý `cancelled` bez porušení).
  Připomínka den před zápasem pak připomíná nový obsah.

### 10. Objem a férovost (pojistky přes všechno)

- *(Moje volba po kontrole stavitele, z dat v bodě 8.)* **Žádný společný rozpočet pro
  všechny zprávy od hráčů** (přestavba existujících cronů není potřeba: aktivní manažer
  dostává ~1,2 zprávy denně). Jen nové zprávy z této vrstvy mají strop **2 na klub a den**,
  přednost má rozhodnutí na úkor, pak kritika, pak pochvala; co se nevejde, počká na další
  den nebo propadne (dopad z bodu 3 se zapíše tak jako tak).
- Zprávy „slyšel jsem…“ jen klubům, jejichž trenér psal v Telefonu v posledních 3 dnech
  (stejné pravidlo jako zprávy „jen tak“). U neaktivních se dopady zapisují, SMS nechodí.
- Neodpovězená zpráva „slyšel jsem…“ se počítá do urážky za mlčení stejně jako dnes.
  Dopad slyšené věci se ale zapíše hned (bod 3), takže mlčením se trenér dopadu nevyhne.
- Hráč nikdy neřekne nic, co není ve znalostech; zdroj vždy skutečný.

## Sliby hráči → zápis → dopad (kontrolní tabulka)

| Co hráč/trenér uvidí | Kde se zapíše | Kde se projeví |
|---|---|---|
| „Slyšel jsem, že jsem podle tebe lempl“ | `squad_hearsay_knowledge` | vztah k trenérovi, nálada (engine přes morálku), `transferUnrest` |
| Pochvala za zády došla | totéž | vztah, nálada |
| Starý kapitán se ozve | `squad_hearsay` z `captain_id` | nálada, vztah, nespokojenost |
| Šmejkal ví, že si na něj někdo stěžoval | `squad_hearsay` + slib `talk_to` | rivalita (chemie v enginu), forma hráče do zápasu, vztah stěžovatele |
| Vzkaz „ať přijde“ | znalost + modifikátor hráče | `generateAbsences` / přemluvení |
| Pravidlo „kdo se omluví, kolečka“ | `squad_rules` | omluvenky kádru, kondice a nálada porušitele |
| Večerka | `squad_rules` | omluvenky z kocoviny, událost `hangover` v zápase |
| Kecy na sudího = pokuta | `squad_rules` | událost `argument`, žluté za protesty |
| „Už jsme si plácli“ | rivalita v `relationships` | chemie sestavy |
| Osobka na Říhu | pokyn k sestavě | střely/asistence Říhy, zakončení |
| „Tak jen druhý poločas“ | `coach_commitments` | vyhodnocení slibu, připomínka |

## Omezení

- *(Moje volba po kontrole stavitele.)* Celá vrstva jen pro kluby, které vede člověk. AI
  trenéři hráčům nepíšou a změna kapitána u AI klubu nic nespouští (jinak by podle pravidla
  „AI kluby: vše přes model“ musel AI trenér odpovídat přes model).
- Kvóta modelu (prod Gemini, test sdílí klíč a jede `off`/`workers-ai`): síto před modelem,
  jedno volání na zprávu, nic v cyklu přes celý kádr.
- D1 na produ: žádné korelované poddotazy přes velké tabulky v hodinovém běhu
  (`reference_d1_cpu_limit_dotazy`); šíření počítat po klubech s předem načtenými vazbami.
- Identifikátory, soubory a klíče anglicky; texty pro hráče česky, bez dlouhé pomlčky.
- UI nejdřív na localhostu, pak testing; push jen na pokyn.
- Migrace jen přidávací (`CREATE TABLE`, `ADD COLUMN`), na produ se zálohou.
- Před „hotovo“ projít jako hráč dlouhými přirozenými větami (1:1, kabina, skupina) a ke
  každému slibu v tabulce ověřit dopad (`feedback_funkce_musi_mit_dopad`).

## Pořadí (návrh, uživatel může přeházet)

1. Jádro: rozpoznání (1), šíření (2), reakce (3) včetně kapitánů. Bez toho nic dalšího nejde.
2. Stížnost dotažená do konce (4) a usmíření (7, bez skupiny).
3. Vzkazy a tlak kabiny (5), pravidla kabiny (6).
4. Skupinový chat (7).
5. Pokyny na zápas (8), s měřením v enginu.
6. Úprava slibu dohodou (9) může jít kdykoli, je malá.

Každá fáze se dá nasadit zvlášť.

## Mimo tento návrh (řeší se protokolem chyb, zvlášť)

- Kabina: trenér se ptal na Miroslava Tomana, odpověděl Martin Toman.
- Dužda: „psal jsem to před hodinou“ o zprávě ze včerejška (historie v promptu bez časů).
- Hrdlička: výčitka krádeže dresů, hráč „to si mě s někým pletete“.

## Nechává se na staviteli

- Přesné pravděpodobnosti šíření a velikosti dopadů (výchozí hodnoty navrhnout, ověřit
  simulací nad kopií produ: kolik zpráv „slyšel jsem“ by vzniklo za týden na klub).
- Hodinový běh vs. denní tick pro šíření.
- Spojení detekce slibů a zmínek do jednoho volání modelu.
- Tvar tabulek a indexů.
