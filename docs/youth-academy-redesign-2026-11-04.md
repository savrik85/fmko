# Žáci: mládež podle skutečného okresního fotbalu (návrh v2, 2026-11-04)

Nahrazuje první verzi tohoto návrhu (nábor dvanáctiletých, čekání tři sezóny na prvního
hráče). Ta šla proti tomu, jak mládež na vesnici opravdu funguje.

## Jak to funguje ve skutečnosti

- **Kategorie podle ročníku (FAČR 2026/27):** přípravka 7–10 let, mladší žáci 11–12,
  starší žáci 13–14, mladší dorost 15–16, starší dorost 17–18. Za muže smí kluk od 15 let.
  Každý může hrát i o kategorii výš.
- **Problém vesnice nejsou peníze, ale lidi:** chybí trenéři a děti. Na Rychnovsku nemá
  polovina z 32 klubů ani jeden dětský tým. Kdo nemá dost dětí, dá se se sousedem dohromady
  do sdruženého družstva (nejvýš dva kluby).
- **Áčka stárnou,** protože je nemá kdo doplňovat. Kluby bez mládeže žijí z hráčů z okolí.
- **Peníze:** dorostenec může 1.–14. června přestoupit i bez souhlasu klubu a nový klub
  zaplatí tabulkové odstupné. Za klub z okresního přeboru je to 8 000 Kč za kluka
  ve 14–15 letech, 13 000 Kč v 16–17 a 16 000 Kč v 18–19 letech. Velké peníze jsou jen
  u profesionální smlouvy (tréninková kompenzace 15 000 Kč za každý rok mezi 12 a 15 lety
  v nižších soutěžích).

Zdroje: výkladové stanovisko FAČR k nastupování 2026/27, Přestupní řád FAČR od 1. 6. 2025,
Deník (Beroun, Rychnov), Prostějovský Večerník, fotbal-straznice.cz.

## Hra v jedné větě

Klub buď má družstvo žáků, nebo nemá. Mít ho stojí hlavně trenéra a dost kluků z obce,
málo peněz. Každé léto postoupí nejstarší ročník do dorostu (U21), takže áčko dostává
vlastní kluky každý rok.

## 1. Družstvo žáků

- Kluci 11–14 let (mladší a starší žáci) z vlastní obce, rovnou po čtyřech ročnících.
  Kdo družstvo založí, vidí partu hned, žádné čekání.
- **Kolik kluků:** na ročník `populace × 0,0015` (zhruba 1 % dětí v ročníku, polovina kluci,
  třetina z nich hraje fotbal). Na produ to dává:
  - osada do 500 obyvatel: kluk každé druhé léto, celkem 2–3 kluci, na družstvo málo,
  - obec s 1 500 obyvateli: 2 kluci na ročník, celkem kolem 9,
  - obec s 2 300 obyvateli (medián klubů na produ): 3–4 kluci na ročník, kolem 14.
  Zhruba polovina klubů tak sama družstvo nedá dohromady, jako ve skutečnosti.
- **Na soutěž je potřeba 9 kluků.** Pod 9 družstvo nehraje a kluci rostou jen tréninkem
  (pomaleji) a víc jich skončí.

## 2. Trenér žáků

Bez trenéra žáci nejsou. Tři možnosti:
- **Dobrovolník z áčka:** starší hráč áčka (od 28 let, s vůdcovstvím). Je zadarmo,
  ale bere mu to čas, takže občas vynechá trénink áčka. Kvalitu určuje jeho vůdcovství.
- **Táta jednoho z kluků:** objeví se sám (SMS), je zadarmo a průměrný. Když jeho kluk
  postoupí do dorostu nebo skončí, trenér odejde s ním.
- **Placený trenér mládeže** (stávající role zaměstnance): nejlepší příprava, bere plat.

## 3. Peníze

Málo, ale nějaké: provoz žáků **400 Kč týdně** (dresy, míče, startovné, cesty na zápasy).
Bez něj družstvo nehraje. Hala a autobus z první verze odpadají, ve skutečnosti o nich
vesnice nerozhoduje.

## 4. Sdružené družstvo se sousedem

- Kdo nemá 9 kluků, může se spojit s klubem z obce do 10 km (lidským i AI). Kluci z obou
  obcí hrají spolu a trenéra dává jeden z klubů.
- Klub navrhne spojení SMS. Lidský soused souhlasí v telefonu, AI soused rozhoduje přes model.
- Každý kluk patří dál svému klubu a v létě postoupí do dorostu svého klubu.
- Spojení jde zrušit vždy k létu.

## 5. Postup do dorostu

- **Každé léto** se všichni čtrnáctiletí přesunou do U21 svého klubu jako hráči
  (`join_type = 'youth'`, vychovaný klubem). Áčko tak každý rok dostane jeden ročník.
- Klub bez U21 dorost nemá. Kluci pak odejdou do nejbližšího klubu s dorostem a klub
  dostane tabulkové odstupné (8 000 Kč za kluka).
- **Během sezóny** (průběžné nabídky, jak sis přál): trenér žáků doporučí výjimečného
  třináctiletého nebo čtrnáctiletého, aby hrál o kategorii výš. Přijde SMS a nabídka
  v Přestupy → Nabídky. Přijetím jde kluk do U21 dřív.
- Kluk od 15 let v U21 může naskočit i za áčko, to už ve hře funguje (promote/send down).

## 6. Talent z vesnice

- Každé léto (1.–14. června) si o nejlepšího kluka z dorostu nebo žáků může říct klub
  z vyšší soutěže v okolí. Přijde SMS od rodičů: „Kubu chtějí v Prachaticích.“
- Kluka můžeš přemlouvat (podle vztahu a patriotismu), nebo ho pustit. Když odejde,
  dostaneš tabulkové odstupné podle věku a soutěže.
- Když se ve městě neprosadí, ve 19–20 letech se s velkou šancí vrátí domů jako volný hráč
  se silným patriotismem a napíše ti SMS.

## 6b. Přetahování nadějných žáků mezi kluby

Ve skutečnosti se kluci mezi kluby přetahují pořád: větší klub v okolí, lepší trenér,
dorost, který malá vesnice nemá, nebo táta, co dojíždí do práce do města. Přestoupit
bez souhlasu klubu jde jen 1.–14. června a nový klub zaplatí tabulkové odstupné.

**Jak se o klukovi dozvíš (nikdy ne čísly):**
- výsledky žákovské soutěže ve Zpravodaji: „Za Lhenice dal pět gólů Kuba Novák“,
- drby v hospodě a od hráčů: „Brácha říkal, že v Ktiši mají kluka, co kope jak dospělej“,
- skaut na úkolu (stávající skauting) přinese slovní odhad jako u dospělých.

**Jak ho lákáš (během sezóny):**
- **Pozvat na trénink** (SMS rodičům): kluk přijde, trenér řekne, co si o něm myslí.
- **Mluvit s rodiči:** co jim slíbíš (bude hrát dorost, dostane šanci v áčku, odvoz
  na trénink). Slib se pak hlídá jako sliby hráčům, nesplněný kazí vztah.
- **Příspěvek na kopačky nebo benzín** rodičům: zabírá nejvíc, ale je to šedá zóna.
  Když to praskne, píše o tom Zpravodaj (stávající kauzy redaktorů) a soused se zlobí.

**Co rozhoduje, jestli kluk přejde** (zájem rodičů 0–100, v UI jen slovy):
- jeho klub nemá dorost (U21), takže v patnácti stejně musí jinam: velký plus,
- vyšší soutěž tvého áčka nebo dorostu než u jeho klubu,
- lepší trenér žáků nebo dorostu,
- vzdálenost: kdo má jezdit 10 km, nechce, pokud mu neslíbíš odvoz,
- kamarádi: když od vás už jeden kluk z jeho party hraje, jde snáz,
- patriotismus a vztah k vlastnímu klubu ho drží doma.

**Letní okno 1.–14. června:** kluk se zájmem nad hranicí přestoupí. Platíš tabulkové
odstupné podle jeho věku a soutěže tvého áčka (okresní přebor 8 000 / 13 000 /
16 000 Kč), peníze dostane jeho klub. Mimo okno jde jen přestup se souhlasem klubu
(stávající vyjednávání přestupů, smluvené odstupné).

**Druhá strana: o tvoje kluky se zajímají jiní.**
- Trenér nebo táta ti napíše: „Za Matějem byli z Netolic, rodiče váhají.“
- Můžeš s rodiči mluvit, něco slíbit, zlepšit trenéra, nebo kluka nechat jít a vzít odstupné.
- Kdo sousedovi přetáhne kluka, zhorší si s ním vztah (stávající vztahy manažerů)
  a rivalita se propíše do derby.

**Meze, ať to nezaplaví hru:** jeden klub láká nejvýš 2 kluky za sezónu. Kluk, kterého
někdo přetáhl, se rok přetahovat nedá. AI kluby lákají a brání se přes model, kód hlídá meze.

## 7. Co hráč vidí

Stránka **U21 → Žáci**:
- trenér (kdo to je, jak je dobrý slovy),
- kluci po ročnících se jménem, pozicí od 13 let, rysem a slovy trenéra, kam to dotáhne,
- jestli družstvo hraje soutěž (9 kluků), případně návrh spojení se sousedem,
- kolik kluků příští léto postoupí do dorostu.

## 8. AI kluby

Rozhodnutí AI klubu jdou přes model a kód hlídá meze: jestli má žáky, kdo je trénuje,
spojení se sousedem, přemlouvání talentu.

## 9. Přechod

- Staré úrovně investice zmizí.
- Kluby, které platily starou akademii, dostanou družstvo žáků hned i s placeným trenérem
  mládeže, pokud ho mají, jinak s dobrovolníkem z áčka.
- Ostatní kluby žáky nemají, dokud si je nezaloží.

## 10. Co zůstane z první verze kódu

Tabulka kluků (`youth_prospects`), růst podle kvality přípravy, slova trenéra, přijetí
do U21 přes nabídku s atomickým zabráním kluka, AI rozhodnutí přes model. Odpadá nábor
v obcích do 8 km, hala, autobus, nábor jen dvanáctiletých a pouštění na trh.

## Fáze

1. Družstvo žáků (založení, kluci 11–14 hned, trenér ze tří možností, 9 kluků na soutěž),
   letní postup do U21, průběžná doporučení o kategorii výš, přechod.
2. Přetahování nadějných žáků mezi kluby (bod 6b) a talent z vesnice, který odchází
   do města a vrací se domů (bod 6). Je to stejný mechanismus, jen jednou lákáš ty
   a jednou klub z města.
3. Sdružené družstvo se sousedem.

## Stav 2026-11-04 (postaveno, zatím jen lokálně)

- Akademie (Mládež → Akademie): kluci 11–14 let, trenér (dobrovolník, táta, placený trenér
  mládeže s najímáním přímo v Akademii), klubové vybavení zrychluje růst, dodávka snižuje odchody.
- U kluka: věk, pozice, silné a slabé stránky slovy, pás potenciálu s rozpětím odhadu, dětský avatar.
- Noví kluci: letní ročník z obce, kluci z obcí do 6 km bez akademie (nejvýš 4 za léto),
  náborový den ve škole (1 500 Kč, jednou za sezónu), přetahování z klubů do 15 km
  (pozvat, slíbit dorost a odvoz, kopačky 2 000 Kč; v létě přestup od zájmu 60 za tabulkové
  odstupné; nejvýš 2 kluci za sezónu, rok ochrana; obrana „promluvit s rodiči“).
- Věk podle FAČR: do dorostu od 13, za muže od 15.
- AI kluby zatím nelákají ani se nebrání (chybí rozhodnutí přes model).
