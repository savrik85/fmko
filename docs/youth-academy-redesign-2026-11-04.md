# Žáci: nová mládežnická akademie (návrh 2026-11-04)

Nahrazuje posuvník investice (Žádná / Symbolická / Solidní / Velkorysá). Místo něj má klub
vlastní **žáky**: partu kluků od 12 do 15 let se jmény. Hráč je sleduje roky a v šestnácti
rozhodne, koho vezme do dorostu.

## Proč měnit (data z produ)

- První ročník (21. 10.): 36 kluků z velkorysé akademie mělo hodnocení 38,9. Kluci z nabídek
  dorostu, kteří jsou zdarma, měli 39,5. Akademie přidává jen skrytý talent (+12) a strop (+6),
  který se projeví za 3–4 sezóny. Hráč tak vidí, že platí 45 000 Kč za sezónu za totéž, co mu
  přijde zadarmo.
- Solidní a symbolická úroveň nabídky dorostu nepřebijí. Za 2. sezónu přišlo 171 nabídek
  dorostu, asi 5 na klub, a 85 jich kluby přijaly.
- Trenérova dovednost „mládež“ akademii neovlivňuje. Trenér mládeže (51 klubů ho má, plat
  ~212 Kč/týden) zrychluje jen trénink U21.
- Hráč nic nerozhoduje a nic nevidí. Jednou za sezónu mu z ničeho nic vypadne kluk.

## 1. Žáci jako entita

Nová tabulka `youth_prospects` (kluci 12–15 let nejsou hráči, nehrají zápasy áčka ani U21):

| Sloupec | Význam |
|---|---|
| `team_id` | klub |
| `first_name`, `last_name`, `age` | jméno z generátoru jmen okresu |
| `home_village_id` | obec, odkud dojíždí (pro autobus a mapu) |
| `position` | ve 12 letech neurčená, ustálí se ve 13–14 |
| `hidden_talent` | skrytý, generuje se jako u ostatních (`talentForAge`, klenot 7 % = `GEM_CHANCE`) |
| `progress_current`, `progress_cap` | nastřádaný náskok z let v akademii (viz bod 3) |
| `traits` | 1–2 slovní rysy („rychlej“, „bojí se hlavičkovat“, „brácha hraje za áčko“) |
| `commitment` | chuť pokračovat 0–100, slovy v UI |
| `status` | `active` / `quit` / `poached` / `promoted` / `released` |

Velikost party: 12–20 kluků. Do 9 kluků žáci nemůžou hrát okresní soutěž a rostou pomaleji
(bod 3). Nad 20 se nikdo nový nepřihlásí.

## 2. Nábor (jednou za léto)

Ve fázi `academy` na konci sezóny vybere hráč obce, kde udělá nábor. Vlastní obec je v náboru
vždy. Další obce do 8 km se přidávají za jednorázový poplatek **1 000 Kč** (leták, náborový
den na hřišti).

Počet nových dvanáctiletých z jedné obce: `min(3, populace × 0,0008)`. Když v obci nebo v jejím
okolí nabírá i jiný klub, kluci se dělí. Celý ročník je nejvýš 6 kluků.

Odhad nad skutečnými obcemi klubů na produ:

| Obec klubu | Jen vlastní obec | + 2 okolní obce | + 4 okolní obce |
|---|---|---|---|
| do 500 obyv. (8 klubů) | 0,1 | 2,7 | 3,9 |
| 500–2 000 (10) | 1,1 | 3,9 | 4,7 |
| 2 000–5 000 (6) | 2,7 | 6,2 | 6 (strop) |
| nad 5 000 (7) | 3,0 | 6 (strop) | 6 (strop) |

Osada bez náboru v okolí tedy žáky mít nebude. Tím mapa obcí dostává herní smysl.

## 3. Růst: za co klub platí

Peníze jdou do konkrétních věcí, každou lze zrušit zvlášť:

| Položka | Kč/týden | Co dělá |
|---|---|---|
| Provoz žáků (dresy, míče, startovné) | 600 | bez něj žáci nefungují, je to vypínač celé akademie |
| Trenér mládeže (stávající role) | ~150–330 | kvalita přípravy; dnes jen U21, nově vede i žáky |
| Hala na zimu | 700 | bez ní žáci přes zimu nerostou (−30 % růstu) |
| Autobus na zápasy | 500 | bez něj kluci z obcí dál než 3 km častěji končí |

Plný program vyjde asi na 2 000 Kč/týden, levněji než dnešní velkorysá úroveň (2 791 Kč).
Placení je ale rozložené a každá položka má viditelný účinek.

Každou sezónu přidá kluk v akademii:

```
kvalita q = 0,6 + trenér mládeže (0–0,4 podle efektivity) + hala 0,15
            + trenérova „mládež“ (0–0,15) − 0,25 když je žáků méně než 9
progress_current += 1,5 × q
progress_cap     += 3   × q
```

Čtyři roky při q = 1 dají náskok +6 k dovednostem a +12 ke stropu, zhruba jako dnešní
velkorysá úroveň (+5 / +14). Špičkový program (q ≈ 1,3) dá +8 / +16, ubohý (q ≈ 0,5) dá
+3 / +6. V šestnácti se hráč vytvoří společným generátorem (`createPlayer` s `academy` bonusem
z `progress_*`), takže zůstává jediný vzorec.

**Hvězdy.** Každý ročník je zhruba 4 kluci, při 7 % klenotů je to ~0,3 klenotu za rok, tedy
jedna hvězda za 3–4 sezóny. To sedí s původním cílem: „šance na hvězdu, ale ať není hvězda
každý“.

**Pozdní květ a vyhoření.** Ve 14 letech dostane 10 % kluků talent +20 až +35 a 10 % kluků −20.
Zázračné dítě ve 12 tak nemusí vydržet a z průměrného kluka může něco vyrůst.

## 4. Co hráč vidí (bez čísel)

Trenér mládeže hodnotí každého kluka slovy: „z toho bude krajskej přebor“, „na béčko“,
„spíš pro radost“. Ve 12 letech se trenér plete hodně (šum ±25 talentu). Každý rok se šum
zmenšuje a lepší trenér (`judgement`) odhaduje přesněji. Ve 15 letech už je odhad spolehlivý.

Nová stránka **Žáci** (pod U21):
- party po ročnících (12, 13, 14, 15) se jménem, obcí, pozicí, slovy trenéra a náladou,
- zázemí (provoz, trenér, hala, autobus) s cenou mimo tlačítka,
- mapa náboru s obcemi v dosahu 8 km.

## 5. Postup do dorostu průběžně (rozhodnuto 2026-11-04)

Kluci nepostupují najednou na konci sezóny, ale během celé sezóny. Tento průběžný tok
nahrazuje dnešní náhodné nabídky dorostu.

**Doporučení trenéra.** Každý kluk od 15 let (výjimečný talent od 14) dostane den, kdy ho
trenér mládeže považuje za připraveného. Ten den se rozloží rovnoměrně přes týdny sezóny.
Trenér pak pošle nabídku stávající cestou `player_offers` (`source = 'academy'`, odesílatel
Trenér mládeže, s vazbou na `prospect_id`). Ročník má zhruba 4 kluky, takže nabídka přijde asi
jednou za 3–4 týdny. Dnes chodí asi 5 náhodných nabídek dorostu za sezónu.

Na nabídku může hráč odpovědět třemi způsoby:
- **Vzít**: vznikne hráč v U21, nebo v áčku, když klub U21 nemá (`join_type = 'youth'`,
  `raised_by_team_id`).
- **Ještě nechat u žáků**: kluk zůstane, trenér ho nabídne znovu za pár týdnů. Jde to jen do
  16 let.
- **Pustit**: kluk jde na trh jako volný hráč a může si ho vzít soused nebo AI klub.

Mlčení se počítá jako „ještě nechat“. Kluk, kterého klub nevezme do konce sezóny, ve které mu
je 16, odchází. Trenér na to předem upozorní SMS.

**Hráč to má pod kontrolou.** Na stránce Žáci může kohokoli od 15 let vytáhnout do dorostu sám,
kdykoli a bez čekání na trenéra. Trenér k tomu řekne slovy, jestli je kluk připravený.

Když se puštěný kluk později prosadí jinde, napíše o tom Zpravodaj („Kluk, kterého Lhota
pustila, jí dal dva góly“).

## 6. Události (SMS v konverzaci „Žáci“ od trenéra mládeže)

Nejvýš jedna týdně, s volbou pro hráče:
- **Zpráva o klukovi**: krátká zmínka o jednom klukovi („Matěj dal hattrick, ale doma má
  problém se školou“).
- **Kopačky**: rodiče chtějí příspěvek 1 500–3 000 Kč. Když hráč nezaplatí, kluk ztratí chuť
  (`commitment`).
- **Přetahování**: klub do 10 km s lepším programem láká nejlepšího kluka. Hráč může zaplatit,
  promluvit s rodiči (šance podle vztahu) nebo kluka pustit.
- **Konec**: kluk chce skončit (hokej, holky, škola). Základ je 8 % za rok, víc bez autobusu
  nebo při malé chuti.
- **Výsledky žáků**: jednou za čas jen výsledek a střelec („Žáci prohráli v Netolicích 3:5,
  Kubík dal dva“). Simulovaná soutěž žáků není potřeba.

## 7. Co z odchovance klub má

- Stránka **Odchovanci klubu**: kdo z žáků prošel, kde hraje, hodnocení slovy, zápasy za áčko
  a za kolik se prodal. Tím se odpovídá na otázku, jestli se akademie vyplatila.
- **Výchovné**: při přestupu odchovance mezi dvěma jinými kluby dostane 10 % poplatku klub,
  který ho vychoval (`raised_by_team_id`, transakce `youth_training_fee`).
- **Fanoušci**: odchovanec v základní sestavě áčka zvedá spokojenost fanoušků (napojení na
  stávající spokojenost).
- **Plat**: první smlouva o 30 % nižší, patriotismus vyšší (to už dnes platí).

## 8. Konec náhodných nabídek dorostu (rozhodnuto 2026-11-04)

Náhodné nabídky „Trenéra dorostu“ (`source = 'youth'` v `events/player-offers.ts`) se vypnou
všem klubům. Dorost bude chodit jen z vlastních žáků (bod 5). Klub bez akademie dorostence
nedostane. Zbývají mu nabídky od kamarádů, z hospody a na doporučení, trh a volní hráči,
mezi kterými jsou i kluci puštění z cizích akademií.

Nabídky dorostu, které už čekají na odpověď, doběhnou podle dosavadních pravidel.

## 9. AI kluby

Podle pravidla „AI kluby: vše přes model“ rozhoduje AI klub o náboru, zázemí, kopačkách
a o rozhodnutí v šestnácti přes Workers AI v týdenní správě klubu (`ai-coach/weekly.ts`).
Kód hlídá jen meze: rozpočet, kapacitu U21 a obce v dosahu.

## 10. Přechod z dnešní akademie

- Posuvník `youth_investment` a počítadla `youth_paid_*` zmizí. Řádek ve financích nahradí
  položky zázemí.
- Kluby, které teď platí, dostanou při spuštění rozjetou partu, aby investice nepropadla:
  - velkorysá: 14 kluků ve všech ročnících, provoz i hala zapnuté, náskok za 2 roky,
  - solidní: 10 kluků, provoz zapnutý, náskok za 1 rok,
  - symbolická: 6 kluků ve věku 12–13,
  - žádná: nic, první nábor hned při spuštění.
- Kluci, kteří už z akademie vyšli, zůstávají. Dostanou zpětně `raised_by_team_id`.

## 11. Fáze

1. **Základ**: tabulka žáků, nábor, zázemí a růst, stránka Žáci, průběžné nabídky z akademie
   a vypnutí náhodných nabídek dorostu, přechod. Bez toho to nedává smysl.
2. **Život**: SMS trenéra, kopačky, přetahování, konce, výsledky žáků.
3. **Návratnost**: Odchovanci klubu, výchovné, fanoušci, Zpravodaj o puštěných klucích.

Před fází 1 projede simulace nad kopií produ 6 sezón (nábor, růst, odchody) a z ní se doladí
koeficienty (0,0008 na obyvatele, q, 8 % odchodů).

## Rozhodnutí (2026-11-04)

1. Žáky vede **stávající trenér mládeže**, jeden člověk pro U21 i žáky.
2. Náhodné nabídky dorostu se vypnou. Dorost chodí **průběžně z akademie** (body 5 a 8).
3. Hlavní nábor je v létě. Během sezóny se občas přihlásí kluk sám, v průměru jeden za sezónu,
   jen z obcí, kde klub nabíral. Celý přísun tak má hráč pod kontrolou.
