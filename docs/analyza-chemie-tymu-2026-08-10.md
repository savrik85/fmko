# Chemie týmu — analýza mechanismu a návrh řešení (2026-08-10)

> **STAV: VŠE Z NÁVRHU IMPLEMENTOVÁNO** (commity `102ac41`, `edb0efb`, `18d05bf`, větev testing).
> Ověřeno na testovací DB i v prohlížeči — viz sekce „Výsledek" na konci dokumentu.
> Na produkci zatím **není**, čeká na souhlas.

Analýza níže popisuje stav **před** opravou.

## Shrnutí

Pod „chemií" se v kódu skrývají **tři nezávislé věci**, které spolu nekomunikují:

| | Co to je | Kde to hráč vidí | Dopad na zápas |
|---|---|---|---|
| **1. Chemie týmu** | vztahy hráčů v kabině | widget „CHEMIE 50" v sestavovači | **žádný** (číslo), malý (jednotlivé páry) |
| **2. Sehranost formace** | jak dlouho tým hraje rozestavění | badge „Sehranost 42/100" u formace | **0 % u vyrovnané taktiky**, ~2 % u ostatních |
| 3. Chemie z tréninku | `teamChemistry` z taktického tréninku | nikde | jen +2 k sehranosti |

Hlavní odpověď na tvou otázku: **chemie týmu jako číslo je čistá dekorace** a **data, ze kterých se počítá, systematicky vysychají**.

---

# 1. CHEMIE TÝMU (vztahy) — hlavní téma

## 1.1 Jak vzniká číslo, které vidíš

`apps/web/src/app/dashboard/match/page.tsx:402-425` — počítá se **v prohlížeči**, základ 50, vlastní tabulka vah:

| Typ vztahu | Váha ve widgetu |
|---|---|
| bratři | +5 |
| otec–syn, mentor a žák | +4 |
| spolužáci, kolegové, parťáci od piva | +2 |
| sousedi | +1 |
| švagři | −1 |
| rivalové | −3 |

Započítají se jen páry, kde jsou **oba hráči v základní jedenáctce**.

## 1.2 Proč je to dekorace

1. **Neposílá se na server.** `saveLineup` posílá `calendarId, formation, tactic, captainId, presetSlot, players` — chemie mezi tím není.
2. **Engine o tom čísle neví.** Vztahy si načítá sám (`match-runner.ts:208-250`) a používá je úplně jinak.
3. **Váhy widgetu neodpovídají enginu.** Kolegové mají ve widgetu +2, v kabině +1. Spolužáci +2 ve widgetu, v enginu +10 % asistencí. Číslo tedy nepopisuje ani to, co se reálně děje.

## 1.3 Co vztahy *doopravdy* dělají

Tohle je ta funkční část — malá, ale živá:

| Typ | Kde | Efekt |
|---|---|---|
| bratři, otec–syn, mentor a žák | `simulation.ts:212` | +15 % váhy na vzájemnou asistenci |
| spolužáci | `simulation.ts:214` | +10 % váhy na vzájemnou asistenci |
| mentor a žák | `simulation.ts:170` | +3 % na gólovou šanci žáka |
| rivalové | `simulation.ts:557` | +15 % váhy při výběru faulujícího |
| bratři, otec–syn, mentor, pijáci | `simulation.ts:476-484` | +1 morálka po gólu parťáka |
| rivalové −3, pijáci +2, kolegové +1, sousedi +1, švagři −1 | `kabina.ts:60` | týdenní morálka |
| pijáci | `pub.ts:87` | ×1,5 šance jít do hospody, když už parťák sedí uvnitř → vyšší riziko kocoviny (−15 kondice) |
| rivalové | `pub.ts:88, 660` | ×0,7 šance jít do hospody; při setkání **30 % místo 12 %** na rvačku (1–3 dny zranění nebo −12 kondice oběma) |
| rivalové, rodina, pijáci | `season-recap.ts:163` | text v sezónním souhrnu |

**Kde se vztahy naopak neuplatní vůbec:**

- **Pohár a přátelák** — `cup.ts:545` a `friendly-runner.ts:120` volají `simulateMatch` bez injektáže vztahů. Jediné místo, kde se vztahy do enginu dostanou, je ligový `match-runner.ts:247`.
- **Náhradníci** — `match-runner.ts:189` odřízne lavičku (`splice(11)`) **dřív**, než se vztahy injektují (řádek 208). Střídající hráč nemá vztahy nikdy.
- **Přestupy** — `player-interest.ts`, `unrest.ts`, `player-agency.ts` o vztazích spoluhráčů nevědí vůbec. Pracují jen s `coach_relationship` (hráč↔trenér), což je jiná mechanika. Odchod bratra hráče nezajímá.
- **Absence, zprávy, AI prompty** — nula.

**Dvě nepřesnosti v popiscích:** `mentor_pupil` dává +3 % **oběma** členům páru, ale UI tvrdí „žák má jistější zakončení". A bonus rivalů na fauly zůstává i po červené kartě rivala — `relationshipsInLineup` se fixuje při výkopu.

## 1.4 Skutečný problém: vztahy jen zanikají

Tohle je závažnější než mrtvé číslo.

**Vznikají na 3 místech, všechna jen při zakládání týmu:**
- `routes/teams.ts:378` — kádr lidského hráče
- `routes/teams.ts:779`, `league/insert-ai-teams.ts:112` — AI týmy

**Zanikají při každém odchodu hráče:**
- `transfers/remove-player.ts:87` — `DELETE FROM relationships WHERE player_a_id = ? OR player_b_id = ?`

**Nikdy nevzniknou pro:** přestup, volného hráče, dorosteneckou nabídku, doplnění kádru po sezóně, U21 (generátor o vztazích neví — nula zmínek), povýšení z U21.

Je to jednosměrná rohatka: počet vztahů může jen klesat.

### Produkční důkaz

Z 549 vztahů má 497 oba hráče ve stejném týmu, 52 rozpojily přestupy (do sestavy se nikdy nezapočítají), osiřelý žádný.

| Tým | Vztahů v kádru |
|---|---|
| FK Autolakovka Braník Žižkov | 24 |
| Sokol Kobylisy | 22 |
| FK Kebab U Ibrahima Stodůlky | 21 |
| FK Rohde Čkyně | 11 |
| FK Rohlík Podolí | 7 |
| FK Hvězda Vimperk, FK Madeta Lčovice, FK Löffler Spůle … | **0** |
| **všechny U21 týmy bez výjimky** | **0** |

Widget proto u většiny týmů ukazuje napořád plochou padesátku a „Žádné aktivní vztahy v sestavě".

## 1.5 Chyba ve škále alkoholu — 69 % vztahů je jeden jediný typ

`generators/relationships.ts:148` požaduje pro parťáky od piva `alcohol >= 12`. Jenže **12 je práh ze staré škály 0–20**. Dnešní generátor (`generators/player.ts:246`) dává `alcohol = rng.int(5, 100)`, takže podmínku splňuje **~93 % hráčů**. Navíc `break` opouští jen vnitřní smyčku, takže tenhle typ jako jediný **obchází limit `targetCount`** (4–6 vazeb na vesnický kádr).

Výsledek pro 18členný kádr: **~12–13 párů parťáků od piva** místo zamýšlených jednotek.

Empiricky na testovací DB (445 vazeb):

| Typ | Počet | Podíl |
|---|---|---|
| **drinking_buddies** | **309** | **69 %** |
| classmates | 75 | 17 % |
| brothers | 38 | 9 % |
| in_laws | 8 | 2 % |
| neighbors | 5 | 1 % |
| rivals, mentor_pupil | 4 + 4 | 2 % |
| coworkers | 2 | 0,4 % |
| father_son | 0 | 0 % |

Dopady: kabina dostává skoro jen +2 za pijáky (chemie je tím uměle nafouklá nahoru), hospoda je přeplněná, a typy s reálným zápasovým efektem (bratři, mentor, spolužáci) jsou vzácné.

**Stejná chyba je i v `generators/manager-effects.ts:122`** — backstory „hospodský" dává `+5 morálky` každému s `alcohol > 12`, tedy prakticky celému kádru.

**Dvě další mezery v generátoru:** `coworkers` se prakticky nikdy nevygenerují (limit `targetCount` vyčerpají spolužáci dřív) a `neighbors` se přidávají až v `routes/teams.ts:360`, takže **AI týmy sousedy nedostanou nikdy**.

## 1.6 Jak rychle to vysychá

Odhad při běžné obměně (AI tým 3 odchody z 18 hráčů za sezónu, faktor přežití páru ≈ 0,69):

| Po | Vazeb celkem | Z toho s efektem v zápase |
|---|---|---|
| založení | 15–19 | 3–5 |
| 1 sezóně | 10–13 | 2–4 |
| 3 sezónách | 5–7 | 1–2 |
| **5 sezónách** | **2–4** | **0–1** |

U lidského týmu s aktivním přestupováním (5–6 změn za sezónu) je faktor ~0,5 a po pěti sezónách zbydou **0–2 vazby**. To přesně odpovídá tomu, co je vidět na produkci.

## 1.7 Síla vztahu se pořád nepoužívá

Migrace 0131 dala 549 vztahům reálnou sílu místo jednotné padesátky. Čte ji ale **jediné místo**: `game.ts:229` (profil hráče) pro zobrazení a řazení.

Žádný gameplay efekt podle síly neškáluje — bratři se silou 95 mají naprosto stejný dopad jako se silou 71. `match-runner.ts:219` a `kabina.ts:52` si `strength` ani nevybírají ze SELECTu.

---

# 2. SEHRANOST FORMACE (ověřeno, jak jsi chtěl)

## 2.1 Jak funguje

`teams.formation_familiarity` — JSON `{formace: 0–100}`, založeno migrací `0065_tactic_familiarity_presets.sql`, spodní mez 15.

**Zápis:**

| Kdy | Kolik |
|---|---|
| odehraný ligový zápas nebo přáteľák — hraná formace | **+3** |
| tentýž zápas — všechny ostatní formace | **−0,4** |
| trénink taktiky | **+2** + bonus z vybavení |
| rozlišováky + taktická tabule | až **+8** k tréninkovému boostu |
| decay časem, reset na konci sezóny | **neexistuje** |

**Čtení:** `formationChemistryFactor = 0,8 + 0,2 × (f/100)` → 0,83 při floor 15, 1,00 při 100. Vstupuje do `calcTacticEffectiveness = skillFit × formationSynergy × formationChemistry` a odtud do `effMod(baseMod, eff) = 1 + (baseMod − 1) × eff`.

## 2.2 Naměřený dopad — a proč je většinou nulový

`effMod` škáluje **odchylku** modifikátoru od 1,0. Vyrovnaná taktika má v `TACTIC_MODS` všechny modifikátory přesně 1,0, takže odchylka je nula a není co škálovat.

Změřeno na 400 zápasech identických kádrů (sehranost 15 vs. 100, stejný seed):

```
balanced    góly 2.465 → 2.465 | výhry 167 → 167 | shodných zápasů 400/400
offensive   góly 3.018 → 3.147 | výhry 182 → 180 | shodných zápasů 286/400
```

**U vyrovnané taktiky vyšlo 400 ze 400 zápasů bit-identicky.** Není to malý efekt, je doslova nulový. U ostatních taktik dělá celý rozsah sehranosti ~2 % na modifikátoru (offensive attackMod 1,1038 → 1,1250), tedy ~4 % na gólech.

**Produkční rozložení taktik:**

| Taktika | Sestav | Podíl |
|---|---|---|
| **balanced** | **984** | **68 %** |
| offensive | 295 | 21 % |
| defensive | 71 | 5 % |
| long_ball | 41 | 3 % |
| possession | 31 | 2 % |
| pressing | 17 | 1 % |

Ve **dvou třetinách odehraných zápasů** systém sehranosti nedělá nic. Přitom UI ukazuje barevný badge a trénink taktiky ji poctivě zvedá.

## 2.3 Další díry v sehranosti

1. **Pohár sehranost úplně obchází.** `cup.ts:543-544` natvrdo nastaví `tactic: "balanced"` (ignoruje zvolenou taktiku týmu) a `formationFamiliarity: 0`, a `applyMatchResult` nikdy nevolá — pohárové zápasy sehranost ani nečtou, ani nezvyšují.
2. **Katalog zná formace, které nejdou zvolit.** `5-4-1` a `4-2-3-1` mají definovanou synergii, ale serverová whitelist (`game.ts:3687`) je odmítá s chybou 400.
3. **Naopak `3-5-2` a `4-5-1`** jdou zvolit, ale nemají synergii v žádné taktice → vždy neutrální 1,0.
4. **`teams.tactic_familiarity` je mrtvý sloupec** — nikdy se nezapisuje, endpoint ho vrací, UI ho zahodí.
5. **Popisky taktik nadhodnocují** — „~1,3× šance na gól" u útočné vs. skutečných 1,15/1,05.
6. **Sehranost nikdy nevybledne** — žádný decay mimo zápasy, žádný reset na konci sezóny. Možná záměr („svalová paměť"), ale znamená to, že po pár sezónách má tým všechno na stropu.

---

# 3. Návrh řešení

Seřazeno podle poměru dopad/práce. Čísla jsou odvozená z reálných vzorců a myšlená jako výchozí bod k doladění.

### 0. Opravit práh alkoholu *(dva řádky, největší okamžitý efekt na skladbu chemie)*

```ts
// generators/relationships.ts:148 — práh ze staré škály 0-20
if (squad[a].alcohol >= 12 && squad[b].alcohol >= 12)   // ~93 % hráčů projde
// → přepočítat na dnešní škálu 0-100, např. >= 60
```
A přesunout `break` tak, aby parťáci od piva respektovali `targetCount` jako ostatní typy. Totéž v `manager-effects.ts:122` (backstory „hospodský").

Bez toho bude jakákoliv další práce s chemií stát na kádru, kde 69 % vazeb je jeden typ.

**Pozor:** oprava se projeví jen na **nově generovaných** kádrech. Pro existující data je otázka, jestli přebytečné vazby proředit migrací, nebo je nechat dožít — doporučuju nechat, ať se nikomu neztratí kabina ze dne na den.

### A. Vztahy musí vznikat, ne jen zanikat *(střední práce — bez toho je zbytek zbytečný)*

Nová funkce v `generators/relationships.ts`:

```ts
export function generateRelationsForNewcomer(rng, newcomer, squad, villageInfo): GeneratedRelationship[]
```

Použije stejná pravidla, která už existují pro celý kádr (společné bydliště → sousedi, stejné povolání → kolegové, blízký věk → spolužáci, oba pijáci → parťáci od piva, věkový rozdíl 12+ a vysoké vůdcovství staršího → mentor a žák, oba výbušní → rivalové), jen proti stávajícímu kádru.

Zavolat ze **všech cest příchodu**: podpis volného hráče, přijetí dorostenecké nabídky, dokončený přestup i hostování, doplnění kádru po sezóně, povýšení z U21. A do `u21-generator.ts` doplnit generování pro celou U21 soupisku.

**K rozhodnutí:** co s 52 vztahy rozpojenými přestupem — smazat, nebo nechat jako základ pro budoucí mechaniku „bývalý spoluhráč" (vliv na zájem o přestup)? Doporučuju nechat, data neškodí.

### B. Chemie ať je jedno číslo, které něco dělá *(střední práce)*

Přesunout výpočet z prohlížeče na server do sdílené funkce, kterou volá **UI i engine**:

```ts
// engine/squad-chemistry.ts
export function lineupChemistry(lineup): { score: number; pairs: Array<{type, aName, bName, effect}> }
```

- endpoint sestavy vrací `chemistry` pro vybranou jedenáctku
- engine tutéž funkci použije pro **jeden agregátní efekt**: chemie 0–100 → multiplikátor tvorby šancí ~0,99–1,02 (parta, co se zná, si víc vyhraje)
- per-pár efekty (asistence, fauly, mentor) zůstávají — jsou lokální a tematické, agregát je týmový

Tím číslo přestane lhát a zároveň bude odpovídat tomu, co se v zápase stane.

### C. Síla vztahu ať konečně něco dělá *(malá práce)*

Škálovat per-pár efekty podle `strength / 50`:

```ts
const w = rel.strength / 50;      // 0,4 – 1,9
relBonus = 1 + 0.15 * w;          // místo pevných 1,15
```

Vyžaduje doplnit `strength` do SELECTu v `match-runner.ts:219` a `kabina.ts:52`. Data už jsou po migraci 0131 správná, chybí je jen použít.

### D. Sehranost musí kousat i u vyrovnané taktiky *(malá práce, velký dopad)*

Vytáhnout sehranost z `calcTacticEffectiveness` a aplikovat ji jako **samostatný multiplikátor** na `attackPower`, nezávisle na taktice:

```ts
export function formationChemistryFactor(f = 15): number {
  const v = Math.max(15, Math.min(100, f));
  return 0.975 + 0.05 * (v - 15) / 85;   // 0,975 při 15 → 1,025 při 100
}
// calcTacticEffectiveness = skillFit × formationSynergy   (bez chemie)
// calcChanceProb: attackPower *= formationChemistryFactor(...)
```

**Derivace:** pro kádr s atributy ~50 vychází `attackPower ≈ 39`, `defensePower ≈ 35`, tedy advantage 0,04 a šance 0,14/min. Posun attackPower o ±2,5 % mění advantage na 0,03–0,05 a šanci na 0,13–0,15, tj. **±7 % šancí, ~±0,2 gólu na zápas**. Za sezónu o 26 kolech ~5 gólů — znatelné, ne rozhodující.

### E. Vztahy ať platí i mimo ligu a na lavičce *(malá práce)*

- **pohár a přátelák**: injektovat vztahy stejně jako `match-runner.ts:208` (dnes v nich vztahy neexistují)
- **náhradníci**: injektovat vztahy až po sestavení lavičky, ne před — dnes střídající hráč nemá vztahy nikdy
- rivalský bonus na fauly přestat počítat po červené kartě rivala

### F. Dodělat díry v sehranosti *(malá práce)*

- pohár: volat `applyMatchResult` a předat reálnou taktiku i sehranost místo natvrdo `balanced`/0
- doplnit synergii pro `3-5-2` a `4-5-1`, nebo naopak zpřístupnit `5-4-1` a `4-2-3-1`
- smazat mrtvý sloupec `tactic_familiarity`
- srovnat popisky taktik s reálnými čísly

### G. Popisky ať nelžou *(malá práce)*

- tooltip u chemie vypíše konkrétní páry a jejich efekt místo abstraktního čísla
- prázdný stav místo „Žádné aktivní vztahy v sestavě" napoví, jak vztahy vznikají
- opravit „žák má jistější zakončení" — mentor bonus platí oběma

## Doporučené pořadí

1. **0 (práh alkoholu)** — dva řádky, bez toho stojí všechno ostatní na pokřivené skladbě vztahů
2. **A (životní cyklus vztahů)** — bez toho se všechno časem vyprázdní; jediná oprava, která pomůže i týmům s nulou
3. **D (sehranost kouše)** — malý zásah, okamžitě dá smysl trénování taktiky u 68 % zápasů
4. **C (síla vztahů)** — pár řádků, zhodnotí už provedenou migraci
5. **E (pohár, lavička)** — levné rozšíření působnosti
6. **B (jeden zdroj pravdy)** — největší úklid, až po 0 a A
7. **F, G** — dočištění

## Jak ověřit

Harness `scratchpad/chem-impact.ts` měří dopad na 400 zápasech s identickými kádry a stejným seedem. Když po zásahu vyjde 400/400 shodných zápasů, efekt je nulový. Pro životní cyklus vztahů stačí DB kontrola: počet vztahů v kádru po odsimulované sezóně nesmí klesat k nule.

---

# Výsledek implementace (2026-08-10)

## Naměřený dopad — 400 zápasů, identické kádry, stejný seed, VYROVNANÁ taktika

| Varianta | Góly | Výhry | Shodných zápasů s referencí |
|---|---|---|---|
| sehranost 15, bez vztahů (reference) | 2,110 | 173 | — |
| sehranost 100, bez vztahů | **2,438** | 190 | 260/400 |
| sehranost 15, dobrá parta | **2,212** | 182 | 354/400 |
| sehranost 15, rozhádaná kabina | **2,098** | 168 | 383/400 |

Před opravou byla u vyrovnané taktiky shoda **400/400** — sehranost nedělala nic.

## Ověřeno na testovací DB

- podpis volného hráče → nováček dostal 2 vazby (`neighbors` síla 36, `classmates` síla 50)
- endpoint `/next-match` vrací u vztahů `strength` i `effect`
- widget v sestavovači ukazuje „Jan Růžička a Jan Kolman — sehraní ze školy, častější vzájemné asistence" a skóre 52

## Co se změnilo v kódu

| Oblast | Soubor |
|---|---|
| Vazby nováčků | `generators/relationships.ts` (`generateRelationsForNewcomer`), `transfers/attach-relations.ts` |
| Zapojení do příchodů | `routes/game.ts` (`onPlayerTransferred`, volný hráč, celebrita, dorostenec), `league/u21-generator.ts` |
| Práh alkoholu | `generators/relationships.ts:148` (12 → 60), `generators/manager-effects.ts:122` |
| Sehranost jako samostatný multiplikátor | `engine/tactics.ts`, `engine/simulation.ts` |
| Chemie kabiny v enginu | `engine/squad-chemistry.ts` |
| Sdílené váhy | `packages/shared/src/types/relationship.ts` |
| Vztahy v poháru/přáteláku/na lavičce | `multiplayer/inject-relations.ts`, `cup/cup.ts`, `multiplayer/friendly-runner.ts` |
| Síla vztahu škáluje efekty | `engine/simulation.ts`, `season/kabina.ts` |
| Popisky | `web/src/lib/tactic-info.ts`, `web/src/app/dashboard/match/page.tsx` |

## Co zůstává otevřené

- **Produkce**: kód ani migrace nejsou nasazené.
- **Existující data**: přebytečné vazby typu `drinking_buddies` (69 % na produkci) zůstávají — nová
  skladba se projeví až na nově generovaných kádrech a u nováčků. Proředění migrací je možné,
  ale znamenalo by, že hráčům ze dne na den zmizí část kabiny.
- **U21**: `attachSquadRelations` běží při generování nové U21 soupisky; existující U21 týmy
  (41 na testu) zůstávají bez vazeb, dokud se nepřegenerují. Jednorázový admin backfill by to spravil.
