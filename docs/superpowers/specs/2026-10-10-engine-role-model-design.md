# Engine podle rolí — návrh

Stav: návrh ke schválení. Větev `feat/engine-roles` = produkce (`6d2a68ea`) + změna gólů z testu
(`7c911ec3`, šance na gól poměrem útoku a obrany). Všechna čísla v dokumentu jsou naměřená na tomto
enginu nad kopií produkční databáze z 9. 10. 2026 23:58.

## Proč

Profil hráče zvýrazňuje vlastnosti, které jsou pro jeho post klíčové. Bere je z vah celkového
hodnocení (`packages/shared/src/types/rating-weights.ts`, `attributeImportance`: váha 2 a víc =
klíčová). Zápasový engine ale s velkou částí z nich nepočítá vůbec a jiné nafukuje:

- **Brankář:** engine bere jen chytání (střely, penalty, přímé kopy, centry), výšku a kondici.
  Obrana, rychlost, hlavičky, kreativita, zkušenost, technika, přihrávky a síla nedělají nic, to je
  65 % vah jeho hodnocení. Chytání má strop 100 a bonus trenéra brankářů a vybavení se přičítá
  před ořezáním, takže u brankáře se 100 propadá celý (`simulation.ts`, přičtení `gkBonus`).
- **Zkušenost** je klíčová u brankáře, obránce i záložníka (u útočníka užitečná). Hráčům roste za
  odehrané zápasy, ale do `MatchPlayer` se vůbec nenačítá.
- **Přehled** obránců a útočníků nedělá nic (útok počítá přehled jen ze záložníků), **kreativita**
  obránců taky ne (jen záložníci a útočníci).
- **Držení míče** určují jen technika a přihrávky hráčů na postu záložníka. Držení rozhoduje, kdo
  v dané minutě útočí, proto tyhle dvě vlastnosti záložníků přebíjejí všechno ostatní.
- Útok a obrana zařazují hráče podle přirozené pozice (`p.position`), držení míče podle místa
  v sestavě (`matchPosition`). Hráč postavený mimo svůj post se tak počítá na dvou místech různě.
- Náhled síly sestavy (`engine/lineup-strength.ts`) má vlastní ruční kopii vzorců útoku a obrany
  a vlastní váhy řad, které se s enginem nikdy nesrovnávaly.

Vzorce útoku a obrany jsou z března 2026, čísla v nich byla zvolená ručně a kalibrovala se jen na
počet gólů za zápas, nikdy na to, jakou váhu má mít který post.

## Rozhodnutí uživatele

- **Varianta B:** engine se naučí to, co hra ukazuje. Váhy hodnocení se nemění, začnou platit.
- **Vyrovnaně podle rolí:** každá řada dělá svou práci a posila o 10 bodů přinese na každém postu
  zhruba stejně (rozdíl do ±30 %).
- **Žádná vlastnost s váhou nesmí být zbytečná.** Vliv každé vlastnosti v zápase odpovídá její
  váze v hodnocení: klíčové nejvíc, užitečné méně, okrajové málo, nula nikde.
- Zkoušet rovnou s úpravou gólů z testu (`7c911ec3`).

## Výchozí stav (engine z testu)

Měřeno v laboratoři: Jitona Spůle (4-3-3, útočná) proti AppYours Čkyně, Budvar Spůle, Madeta
Volary, FaSta Vimperk a Engel Vimperk, skutečné sestavení zápasu (sestavy, trenér, vybavení,
zaměstnanci, sehranost, vztahy, exekutoři, pokyny z lavičky), neutrální hřiště, plná kondice,
3 000 zápasů na řádek, stejná semínka. Základ 1,625 bodu na zápas, 5,02 gólu, 17,7 % remíz.
Šum rozdílu zhruba ±0,02.

**Hodnota hráče** (jeden hráč postu o 10 horší ve všech dovednostech, ztráta bodů na zápas):
brankář 0,022 · obránce 0,040 · záložník 0,091 · útočník 0,060. Poměr nejvyšší a nejnižší 4,1.

**Vliv vlastnosti** (celé řadě −15, ztráta bodů na zápas; klíčové = váha 2+):

| Post | Klíčové | Ostatní s váhou |
|---|---|---|
| Brankář | chytání 0,047 · obrana 0 · rychlost 0 · hlavičky 0 · kreativita 0 · zkušenost 0 | výdrž 0,001 · technika 0 · přihrávky 0 · síla 0 |
| Obránci | obrana 0,074 · síla 0,063 · hlavičky 0,045 · přihrávky 0,023 · výdrž 0,014 · přehled 0 · zkušenost 0 | technika 0,025 · rychlost 0,018 · střelba 0,001 · kreativita 0 · standardky 0 |
| Záloha | přihrávky 0,182 · technika 0,170 · přehled 0,031 · kreativita 0,018 · rychlost 0,013 · výdrž 0,010 · zkušenost 0 | obrana 0,038 · standardky 0,031 · síla 0,029 · hlavičky 0,010 · střelba 0,009 |
| Útok | hlavičky 0,056 · střelba 0,046 · technika 0,041 · přihrávky 0,020 · kreativita 0,018 · rychlost 0,016 · přehled 0 | síla 0,056 · obrana 0,037 · výdrž 0,011 · zkušenost 0 · standardky 0 |

Standardky měří jen exekutor (v sestavě Jitony je to záložník).

## Princip

1. Každá vlastnost s váhou v hodnocení na daném postu má v zápase roli. Její podíl na vlivu postu
   leží mezi polovinou a dvojnásobkem jejího podílu na vahách postu.
2. Hráč o 10 bodů lepší přinese na každém postu podobně: hodnota každého postu do ±30 % od průměru
   čtyř postů.
3. Hráč se počítá tam, kde v sestavě stojí (`matchPosition`), všude stejně. Postih za hraní mimo
   post (`getPositionPenalty`) zůstává.
4. Engine i náhled síly sestavy čtou role z jednoho modulu, žádná kopie vzorců.

## Model rolí

Nový modul `apps/api/src/engine/roles.ts` (čisté funkce, žádná DB). Pro každý post a každou fázi
hry drží koeficienty vlastností. Příspěvek hráče do fáze = Σ koeficient × vlastnost × čerstvost ×
klid (zkušenost). Hodnota týmu ve fázi = součet příspěvků hráčů (ne průměr řady), dělený pevnou
konstantou. Součet místo průměru znamená, že víc hráčů v řadě = víc síly v její fázi a jeden hráč
ve tříčlenné záloze neváží víc než ve čtyřčlenné. Engine z testu pracuje s poměry (útok / obrana),
takže měřítko se vykrátí a kalibrace gólů (`BASE_CHANCE`) zůstane.

Výchozí rozdělení vlastností do fází (koeficienty určí kalibrace, viz níž):

| Fáze | Brankář | Obránci | Záloha | Útok |
|---|---|---|---|---|
| **Držení míče** (podíl na míči) | rozehrávka: přihrávky, technika | rozehrávka: přihrávky, technika, kreativita | přihrávky, technika, přehled, kreativita, rychlost | podržení míče: technika, síla, přihrávky |
| **Vytváření šancí** (útok) | – | dlouhé míče a nájezdy: přehled, přihrávky, rychlost | přehled, přihrávky, kreativita, technika, rychlost, střelba z dálky | rychlost, technika, kreativita, přehled, přihrávky, síla |
| **Bránění šancí** (obrana) | komunikace: kreativita | obrana, síla, hlavičky, rychlost | obrana, síla, nasazení | presink: obrana, nasazení, rychlost |
| **Zakončení** (gól ze šance) | chytání, postavení (obrana), u hlaviček dosah (hlavičky + výška) | obrana (blokování) | – (střílí jako střelec) | střelec: střelba, technika; hlavička: hlavičky, síla |
| **Brejky** | vybíhání (rychlost) | rychlost | – | rychlost |
| **Standardky** | dosah a souboje na centry: hlavičky, výška, síla | hlavičky, síla | exekutor: standardky | hlavičky, síla; exekutor: standardky |

Doplňky mimo tabulku:

- **Výdrž:** úbytek kondice podle zátěže postu (záloha nejvíc, brankář nejméně, jako dnes
  `roleMod`). Čerstvost (`freshness`) násobí všechny příspěvky hráče, takže výdrž působí ve všech
  jeho fázích, ne jen v počtu šancí.
- **Zkušenost = klid:** násobitel příspěvků od 0,96 (nováček) do 1,04 (ostřílený hráč) a navíc v tlaku (po 75. minutě při těsném
  skóre a na penaltách) tlumí výkyvy z konzistence a clutche. Načítá se do `MatchPlayer` v
  `lineup-loader.ts` a `buildMatchPlayers` (ploché `skills.experience`).
- **Standardky** zůstávají jedinou výjimkou z pravidla „nic není zbytečné“: hrají u hráče, který
  kope, nebo zaskočí za exekutora (`pickTaker` bere nejlepší standardky na hřišti).
- **Bonus trenéra brankářů a vybavení** se nepřičítá ke chytání před stropem, ale k výsledné
  hodnotě brankáře v zákroku, takže nepropadá ani u brankáře se 100.
- Osobnostní vlastnosti (nasazení, agresivita, disciplína…) nejsou ve vahách hodnocení; zůstávají,
  kde jsou, a model je jen přebírá (nasazení v obraně a presinku).

## Kalibrace

Laboratoř z tohoto návrhu se uloží jako nástroj `apps/api/scripts/engine-lab/` (vitest soubor
spouštěný ručně s `NODE_OPTIONS=--experimental-sqlite`, čte SQLite kopii zálohy produkce, do CI
nejde). Měří tři tabulky výše a úroveň gólů. Aby se koeficienty nenaladily na jeden tým, měří se
pro tři různá rozestavení: Jitona (4-3-3), AppYours Čkyně (4-4-2) a Budvar Spůle ve 3-4-3, které
hrál nejčastěji (18 z 25 zápasů), plus pro syntetický průměrný tým bez osobností.

Postup: nastavit koeficienty → změřit → upravit → opakovat, dokud neplatí přejímací kritéria.

## Přejímací kritéria

1. Žádná vlastnost s váhou nemá vliv 0 (standardky se měří na exekutorovi).
2. Na každém postu má každá vlastnost podíl na vlivu mezi 0,5× a 2× svého podílu na vahách postu.
3. Hodnota hráče (o 10 horší ve všem) je na každém postu do ±30 % od průměru čtyř postů, ve všech
   třech měřených sestavách.
4. Góly: `goal-calibration.test.ts` z `7c911ec3` projde beze změny prahů. Podíl remíz a výher
   domácích se proti enginu z testu nezmění o víc než 2 procentní body (měřeno na všech dvojicích
   Okresního přeboru Prachatice s výhodou domácích).
5. Náhled síly sestavy řadí sestavy stejně jako engine (test: tři sestavy téhož týmu, pořadí
   podle náhledu = pořadí podle odsimulovaných bodů).

## Testy v repu

- `roles.test.ts` (statický): pro každý post a každou vlastnost s váhou v `RATING_WEIGHTS` existuje
  nenulový koeficient v aspoň jedné fázi (výjimka standardky). Hlídá, že přidaná vlastnost nebo
  váha nezůstane v enginu mrtvá.
- `role-impact.test.ts` (deterministický, syntetické týmy, pevná semínka): snížení každé vlastnosti
  s vahou u celé řady změní výsledek simulací. Nulový vliv = identické zápasy, takže se pozná přesně
  a rychle.
- Stávající testy enginu projdou; kde se práh musí změnit, s komentářem proč (jako v `7c911ec3`).

## Co se mění jinde

- **Náhled síly sestavy** (`lineup-strength.ts`, endpoint v `routes/game.ts`) počítá síly řad,
  útok a obranu z `roles.ts`. Rozhraní pro web zůstává.
- **Sázkovka:** kurzový model bere sílu z průměru nejlepší jedenáctky; po nasazení se přeměří
  `STRENGTH_K` a báze gólů nad novými zápasy (`betting/calibration.ts` hlídá odchylku).
- **Hodnocení hráčů, tržní ceny a zvýraznění v profilu se nemění.** Na produkci se nic
  nepřepisuje, žádná migrace dat.

## Mimo rozsah

- Změna vah hodnocení (`RATING_WEIGHTS`).
- Známky hráčů za zápas a výběr hráče zápasu.
- Nároky taktik na kádr (`calcTacticEffectiveness`) a tvrdost hry, pokud je kalibrace nevynutí.
- Automatická sestava AI klubů.

## Nasazení

- Vývoj ve větvi `feat/engine-roles`, ověření na testu (zápasy, náhled sestavy, góly).
- Produkce **ještě 2026-10-10** (rozhodnutí uživatele), po testu skutečnými zápasy na localhostu.
  Turnaj P-Mobile (start 14. 10.) se tak odehraje celý na novém enginu. Jde tam spolu s `7c911ec3`,
  na kterém stojí.
- Novinka do „Co je nového“ jen na výslovné přání.

## Rizika

- **Posun síly klubů:** kluby postavené na technické záloze relativně zeslábnou, kluby se silnou
  obranou a brankářem zesílí. Je to záměr, ale hráči si toho všimnou.
- **Přeladění na pár týmů:** proto tři sestavy a syntetický tým.
- **Výkon workeru:** match tick zpracuje všechny ligy v jedné invokaci. Fáze se počítají každou minutu
  stejně jako dřív průměry řad: 11 hráčů × několik koeficientů, žádné volání DB.

## Implementace a naměřené výsledky (2026-10-10)

Oproti návrhu výše:

- **Výdrž a nasazení nejsou položkou fáze, ale násobitelem** všeho, co hráč dělá
  (`STAMINA_EFFECT` podle postu, nasazení 0,15 v útoku a 0,2 v obraně, agresivita obránců 0,3),
  se středem v 50. Přičítání do obrany dělalo útok/obranu závislé na úrovni ligy (slabá liga
  měla o 12 % méně gólů než silná); jako násobitel je poměr na úrovni nezávislý.
- **Zkušenost je koeficient** ve fázích a zákrocích jako ostatní vlastnosti (brankář: zákrok,
  úniky, penalty, organizace obrany; obránce: bránění, rozehrávka; záloha: držení míče; útočník:
  podržení míče; všichni: zakončení). Pod tlakem (po 75. minutě při rozdílu do jednoho gólu
  a na penaltách) se počítá napůl se povahou (`clutch`).
- **Zakončení má tabulku pro každý post** (`FINISHING`), brankářské situace `GK_SITUATIONS`
  (střela, centr, únik, penalta). Váha brankáře proti obráncům u střely `GK_SHOT_WEIGHT` 2,04.
- **Oslabení:** chybějící hráč chybí ve své roli (součet, ne průměr) a k tomu mírná srážka za
  přeskupení s citlivostí 1 (dřív 2, kdy vyloučení jinak nic nestálo).
- **Hřiště a počasí** ubírají technice i přihrávkám v útoku (dohromady pětina útoku jako dřív
  samotná technika).
- **Úroveň gólů:** skuteční brankáři mají postavení, vybíhání a hlavičky slabší než chytání, takže
  jejich zákrok vychází níž a padalo víc gólů. `OPEN_PLAY_GOAL_SCALE` 0,82 → 0,74, základ centrů
  a rohů 0,065/0,12 → 0,06/0,112.
- **Náhled síly sestavy** měl zastaralé měřítko (dovednosti ×4) a skoro všude ukazoval 100; teď
  počítá řady, útok a obranu z `roles.ts` (50 = průměrný tým).
- Testy tvrdosti a bahna ověřovaly celkové góly na pár stovkách zápasů; přeměření ukázalo, že
  efekt byl pod úrovní šumu i na starém enginu. Hlídají teď mechanismus přesně (šance za minutu,
  góly ze hry).

Ladění: 4 kola, 2 sestavy (Jitona 4-3-3, AppYours 4-4-2) proti pěti soupeřům, 48 scénářů
po 6 000 zápasech, 9 souběžných dávek.

**Výsledek (kritéria 1–3 splněna):**

| | Brankář | Obránce | Záložník | Útočník |
|---|---|---|---|---|
| Hráč o 10 horší, před | 0,022 | 0,040 | 0,091 | 0,060 |
| Hráč o 10 horší, po | 0,091 (+17 %) | 0,072 (−8 %) | 0,070 (−11 %) | 0,079 (+2 %) |

Podíl každé vlastnosti na vlivu postu je 0,53–1,46× jejího podílu na vahách (pásmo 0,5–2),
žádná vlastnost s vahou nemá nulu (`roles.test.ts` to ověřuje simulací).

**Góly (kritérium 4)**, mini liga šesti prachatických týmů z kopie produkce, 6 000 zápasů:
engine z testu 4,52 gólu, 47,2 % výher domácích, 19,8 % remíz; nový 4,56 / 48,1 % / 18,8 %.
Ze hry 3,15 → 3,11, rohy a centry po úpravě základu stejně.

**Postava** (Jitona proti pěti soupeřům, 5 000 zápasů): všichni o 12 kg těžší −0,065 bodu na
zápas, o 8 cm menší −0,061, brankář o 10 cm vyšší +0,022.

**Tvrdá hra** na skutečných týmech (10 000 zápasů): +0,065 → +0,058 bodu na zápas, góly soupeře
ze hry −7,6 % → −7,4 %, tedy beze změny v rámci šumu.
