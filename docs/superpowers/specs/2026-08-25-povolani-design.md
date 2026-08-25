# Povolání hráčů — návrh

**Datum:** 2026-08-25
**Stav:** schváleno k implementaci
**Branch:** testing

---

## 1. Motivace

Registr `apps/api/src/generators/occupations.ts` obsahuje **67 povolání** s gameplay metadaty.
Skutečné využití je ale jen zlomkové.

### Co dnes žije

| Pole / mechanismus | Kde | Stav |
|---|---|---|
| `excuses` | `events/absence.ts:548` — kategorie „profesní" | ✅ funguje |
| `overtimeRisk` | `events/absence.ts:521` — váha profesní kategorie | ✅ funguje |
| leadership / agresivita / clutch | `generators/player.ts:298–339` | ✅ funguje |
| přezdívky | `generators/nickname.ts:65` | ✅ funguje |
| „kolegové z práce" ve vztazích | `generators/relationships.ts:129` | ✅ funguje |
| pikantnost rozhovorů | `news/player-interview.ts:241` | ✅ funguje |

### Co je mrtvé

| Pole | Problém |
|---|---|
| `injuryRisk` | **0 použití.** Jediný výskyt mimo definici je admin výpis `routes/game.ts:8352`. |
| `strengthBonus` | **0 použití.** `generators/player.ts:308` má místo toho natvrdo zadaný seznam sedmi jmen (`PHYSICAL_OCCUPATIONS`) a plochý bonus +10; odstupňované hodnoty −2 až +3 z registru nikdo nečte. |

### Co chybí úplně

1. **Povolání nemá žádný dopad na klub.** 67 profesí, a ani jedna po příchodu hráče
   klubu nic nepřináší.
2. **Trénink o povolání neví.** `season/training.ts:262` počítá docházku jen
   z disciplíny, věku a alkoholu. Když hráč trénink vynechá, hráč se nedozví proč —
   jen zmizí ze seznamu. Vedle přitom leží 67 sad profesních výmluv, používaných
   výhradně na zápasy.
3. **Výmluvy neznají roční období ani počasí.** `ExcuseEnv` rozlišuje jen
   `"rural" | "urban"` (`events/absence.ts:115`).

---

## 2. Zamítnuté varianty

**Klubové brigády** (manažer přiřadí hráče na roli, stojí to jeho kondici) —
zamítnuto uživatelem. Do hry se nepřidává žádná nová obrazovka s přiřazováním,
žádné sloty a žádná cena v kondici. Klubové efekty proto běží **výhradně pasivně**
(Část 5).

Důsledek: **žádná DB migrace není potřeba.** Vše se odvozuje z `occupation`,
které už v `players.life_context` je.

---

## 3. Část 1 — Výmluvy do tréninku

### Problém

`season/training.ts:262`:

```ts
let attendProb = player.discipline / 100 * 0.6 + 0.3 + attendanceBonus + managerAttendanceMod;
```

Docházka na trénink je slepá vůči povolání a **vynechání je nemé** — hráč prostě
není v seznamu.

### Řešení

1. Nový timing `"training"` v `AbsenceTiming`.
2. `season/training.ts` volá `generateAbsences(..., { timing: "training" })`
   a výsledné SMS zobrazí u vynechaných hráčů — stejným kanálem, jakým chodí
   zápasové omluvenky.
3. Do `attendProb` přiteče `overtimeRisk`:

```ts
attendProb -= occupation.overtimeRisk * 0.15;
```

Kombajnér (`overtimeRisk` 0,7) tak chodí na tréninky znatelně hůř než účetní (0,4).
Na zápas si čas udělá skoro každý, na středeční trénink ne — to je realita okresu.

### Vyvážení

Bázová šance absence na tréninku je vyšší než na zápase, protože trénink je
dobrovolnější. Cílová docházka po zavedení: **beze změny mediánu**, jen s vyšším
rozptylem mezi profesemi. Ověřit na testovacích datech před nasazením.

---

## 4. Část 2 — Sezónnost a počasí ve výmluvách

### 4a) Refactor signatury (nutná podmínka)

`events/absence.ts:457` má dnes šest pozičních parametrů a u `commuteMod`
tohle varování:

> `commuteMod: number = 0, // klubová dodávka: 0-0.45 — tlumí absence z dojíždění`
> `// (MUSÍ být stejný ve všech voláních pro tentýž zápas, jinak se rozjede SMS vs. simulace)`

Volacích míst je **devět** a tři z nich už dnes `commuteMod` nepředávají vůbec:

- `season/team-day.ts:150`, `:498`
- `events/match-absences.ts:152`, `:154`
- `multiplayer/match-runner.ts:1295`, `:1296`
- `routes/game.ts:3612`, `:3613` ← chybí `commuteMod`
- `routes/game.ts:9126` ← chybí `commuteMod`

Přidávat další poziční parametr do téhle konstrukce je koledování si o průšvih.

**Parametry od třetího výš se přepíšou na options objekt** a všech devět volání se
sjednotí:

```ts
export interface AbsenceOpts {
  timing?: AbsenceTiming;          // "day_before" | "match_day" | "training" | "any"
  district?: string;
  friendlyMultiplier?: number;
  commuteMod?: number;
  month?: number;                  // 1–12, pro sezónní výmluvy
  weather?: Weather;               // pro povětrnostní výmluvy
}

export function generateAbsences(rng: Rng, squad: PlayerForAbsence[], opts: AbsenceOpts = {}): AbsenceResult[]
```

Tím se zároveň opraví ta stávající nekonzistence ve třech voláních.

### 4b) Sezónní výmluvy

Nový filtr vedle `ExcuseEnv`:

```ts
type ExcuseSeason = "jaro" | "leto" | "podzim" | "zima";
```

Profesní výmluvy dostanou volitelné `months?: number[]`. Když je pole vyplněné,
výmluva se nabídne jen v daných měsících.

| Profese | Měsíce | Příklad |
|---|---|---|
| Zemědělec, kombajnér | 7–8 | „Seno musí být dneska svezený, prší od zítřka" |
| Sadař | 9–10 | „Sklízíme, jablka nepočkají" |
| Myslivec, hajný | 10–12 | „Máme naháňku, to se neodkládá" |
| Včelař | 5–6 | „Roj mi utekl na hrušku, musím ho sundat" |
| Hospodský, kuchař, číšník, barman | 7–8, 12 | „Máme hody, sál je plnej" |
| Instalatér, elektrikář | 12–2 | „Půl vesnice nemá teplo, nemůžu odejít" |
| Zedník, pokrývač, tesař | 5–9 | „Stavební sezóna, makáme do tmy" |
| Chovatel | 3–4 | „Ovce se bahní, nemůžu od nich" |
| Prodavač, prodavač v trafice | 12 | „Předvánoční šturm, šéf volno nedá" |
| Učitel | 6, 9 | „Vysvědčení, uzavírám známky" |

### 4c) Povětrnostní výmluvy

`Weather` z `engine/types` se předá do `AbsenceOpts.weather`. Volitelné pole
`weather?: Weather[]` na výmluvě funguje stejně jako `months`.

Pokrývač v srpnu za 30 °C: *„Krytí se mi rozteče, musím to dodělat teď."*
Tentýž pokrývač v prosinci ve sněhu: *„V týhle plundře nelezu na střechu."*

---

## 5. Část 3 — Pracovní úrazy (oživení `injuryRisk`)

Hodnoty v registru sahají od 0,02 (úředník, programátor) po 0,6 (dřevorubec)
a nikde se nečtou.

### Řešení

Denní hod v `season/daily-tick.ts`, vedle stávajícího hojení zranění (`:702`):

```
denní šance na pracovní úraz = injuryRisk × 0,004
```

- Dřevorubec (0,6) → ~1,4 úrazu za sezónu
- Zedník (0,4) → ~0,9
- Programátor (0,02) → prakticky nikdy

Úraz se zapíše do stávající tabulky `injuries` přes stávající `generateInjury()`
(`injuries/injury-generator.ts:44`) — žádná nová infrastruktura. Severity model
zůstává, takže obvykle jde o lehké zranění a jen občas o malér.

### SMS

Každá profese s `injuryRisk >= 0,25` dostane vlastní sadu `workInjuryTexts`
v tónu, který už `excuses` mají:

- Dřevorubec: *„Dostala mě motorovka, píchla do boty."*
- Kovář: *„Chytil jsem to kladivem přes palec, je fialovej jak švestka."*
- Pokrývač: *„Sletěl jsem z lešení, naštěstí jen z metru."*

Profese pod prahem použijí obecný fallback.

### Proč to hru zlepší

Dnes se hráči zraní jen na hřišti, takže kádr o reprezentační pauze zamrzne.
S tímhle žije okres i mezi zápasy a `injury_proneness` dostane profesní protějšek.

---

## 6. Část 4 — Sezónní výpadky

Delší než jednotlivá absence: zemědělec o žních vynechá **tři týdny tréninků**
a na zápas dorazí, jen když neprší.

- Není to zranění — hráč je k dispozici, jen nepravidelně.
- Manažer to **vidí dopředu** v kalendáři a může s tím počítat při plánování.
- Dotkne se ~10 profesí (`seasonalPeak`), u těch ale výrazně.

Implementačně: `daily-tick.ts` při vstupu do `seasonalPeak` měsíce nastaví hráči
příznak a po celou dobu zvyšuje šanci absence na tréninku (×2,5) i na zápase (×1,4).

---

## 7. Část 5 — Tiché klubové efekty

**Bez přiřazování, bez ceny, bez klikání. Hráč je v kádru → efekt běží.**

### Napojení

Nový modul `apps/api/src/staff/occupation-effects.ts` agreguje profese kádru do
už existujícího vektoru `StaffEffects` (`staff/staff-effects.ts`) — jako **třetí
zdroj** vedle vybavení (`equipment/equipment-generator.ts:237`) a placených
zaměstnanců. Vzor a struktura se kopírují ze `staff-effects.ts`, žádný paralelní
systém nevzniká.

### Role a efekty

| Role | Efekt v `StaffEffects` | Placený protějšek |
|---|---|---|
| `udrzba` — Údržbář | `repairCostMul` 🆕 | — |
| `travnik` — Správce hřiště | `pitchDegradationReduction`, `equipDegradationReduction` | `spravce_hriste` |
| `bufet` — Bufet | `concessionDemandMul`, `concessionSatBonus` | `obsluha` |
| `doprava` — Řidič | `commuteBonus` 🆕 | — |
| `zdravotnik` — Zdravotník | `injuryExtraHealChance`, `conditionRegenBonus` | `maser` / `lekar` |
| `hospodar` — Hospodář | `opsCostMul`, `sponsorBonusMul` | `ekonom` |
| `zved` — Zvěd po okrese | ×`scoutChanceMultiplier()` — **mimo `StaffEffects`**, viz níže | `skaut` |

Dvě nová pole do `StaffEffects` (a do `emptyStaffEffects()`):

```ts
repairCostMul: number;   // ×cena opravy vybavení (<1 = sleva). default 1
commuteBonus: number;    // + k commuteMod. default 0
```

> **`commuteBonus` má strop.** `commuteMod` je dnes v rozsahu 0–0,45 (klubová
> dodávka). Profesní bonus se k němu přičítá, ale **výsledek se zastropuje na 0,55**,
> jinak by kombinace dodávka + řidič v kádru absence z dojíždění vypnula úplně.

### Výjimka: scouting není ve vektoru

Role `zved` se do `StaffEffects` **nezapojuje** — scouting tam žádné pole nemá.
Řeší se samostatně:

- `staff/staff-effects.ts:154` — `scoutChanceMultiplier(rows)` vrací násobitel
  šance zahlédnout hráče soupeře; bez skauta vrací 1.
- `staff/staff-tick.ts:262` — periodické objevování hráčů v okrese.

Profesní zvěd proto dostane vlastní funkci `occupationScoutMultiplier(squad)`
a obě místa ji zkombinují se stávajícím skautem podle pravidla „bere se vyšší,
nesčítá se" (Část 5, pravidlo 2).

### Dvě tvrdá pravidla

1. **Počítá se jen jednou za roli** — bere se nejvyšší `effectFit` v kádru.
   Bez toho by tým jedenácti zedníků měl opravy zadarmo.
2. **Nesčítá se s placeným zaměstnancem** — bere se vyšší z obou. Když je najatý
   ekonom, účetní v kádru nepřidá nic.

Pravidlo 2 **musí být v UI vidět**, ne skryté. Stránka `/dashboard/zamestnanci`
u nabízeného zaměstnance zobrazí:

> „Máš v kádru účetního (−6 %). Ekonom přidá jen −4 % navíc."

Skrývat to by byla past na hráče, který by platil mzdu za nic.

### Síla

Efekt při `effectFit` 1,0 odpovídá **~40 % dobrého placeného zaměstnance**.
Je to bonus, ne náhrada — najímání musí zůstat výhodné.

---

## 8. Část 6 — Oprava `strengthBonus`

`generators/player.ts:308`:

```ts
const PHYSICAL_OCCUPATIONS = ["Zemědělec", "Zedník", "Dřevorubec", "Kovář", "Řezník", "Hasič", "Automechanik"];
// …
+ (PHYSICAL_OCCUPATIONS.includes(occupation) ? 10 : 0)
```

Sedm jmen ze 67, všem stejně. Nahradit čtením z registru:

```ts
+ (getOccupationByName(occupation)?.strengthBonus ?? 0) * 4
```

Rozsah −2 až +3 → −8 až +12, tedy srovnatelný se stávajícím plochým +10, ale
odstupňovaný: dřevorubec (+12) ≠ prodavač (0) ≠ účetní (−8).

> ⚠️ **Platí jen pro nově generované hráče.** Retroaktivní přepočet stávajících
> kádrů je zakázaný — přerovnal by lidem tým pod rukama.

---

## 9. Datový model

Žádná migrace. Tři nová pole na `Occupation`:

```ts
export interface Occupation {
  // …stávající: id, name, w, injuryRisk, overtimeRisk, strengthBonus, excuses
  /** Klubová role, kterou profese pasivně podporuje. null = žádná. */
  clubEffect: ClubEffect | null;
  /** Jak silně. 0.4 = okrajově, 1.0 = dělá to v civilu denně. 0 když clubEffect je null. */
  effectFit: number;
  /** Měsíce (1–12) s výrazně vyšší pracovní zátěží. null = rovnoměrné. */
  seasonalPeak: number[] | null;
  /** Texty SMS při pracovním úrazu. Prázdné = použije se obecný fallback. */
  workInjuryTexts?: string[];
}

export type ClubEffect = "udrzba" | "travnik" | "bufet" | "doprava" | "zdravotnik" | "hospodar" | "zved";
```

---

## 10. Mapování všech 67 povolání

`effectFit` a `seasonalPeak` jsou **balancovací hodnoty — určené k přepsání.**
Níže je první nástřel.

| id | Název | `injuryRisk` | `overtimeRisk` | `clubEffect` | `effectFit` | `seasonalPeak` |
|---|---|---|---|---|---|---|
| zemedelec | Zemědělec | 0.30 | 0.50 | travnik | 0.8 | 7,8 |
| traktorista | Traktorista | 0.20 | 0.60 | travnik | 0.8 | 7,8 |
| lesni_delnik | Lesní dělník | 0.50 | 0.30 | travnik | 0.6 | — |
| drevorubec | Dřevorubec | 0.60 | 0.30 | udrzba | 0.5 | — |
| vcelar | Včelař | 0.10 | 0.20 | — | 0 | 5,6 |
| chovatel | Chovatel | 0.20 | 0.40 | bufet | 0.5 | 3,4 |
| kombajner | Kombajnér | 0.20 | 0.70 | travnik | 0.7 | 7,8 |
| myslivec | Myslivec | 0.15 | 0.20 | zved | 0.8 | 10,11,12 |
| kovar | Kovář | 0.40 | 0.30 | udrzba | 0.7 | — |
| hajny | Hajný | 0.10 | 0.30 | travnik | 0.7 | 10,11 |
| spravce_rybniku | Správce rybníka | 0.10 | 0.20 | travnik | 0.5 | — |
| sadar | Sadař | 0.20 | 0.30 | travnik | 0.7 | 9,10 |
| sezonni_delnik | Sezonní dělník | 0.30 | 0.50 | udrzba | 0.4 | 5,6,7,8,9 |
| chalupar | Chalupář | 0.20 | 0.10 | udrzba | 0.5 | — |
| zednik | Zedník | 0.40 | 0.50 | udrzba | **1.0** | 5–9 |
| tesar | Tesař | 0.40 | 0.40 | udrzba | 0.9 | 5–9 |
| truhlar | Truhlář | 0.25 | 0.30 | udrzba | 0.9 | — |
| instalater | Instalatér | 0.20 | 0.40 | udrzba | 0.8 | 12,1,2 |
| pokryvac | Pokrývač | 0.50 | 0.40 | udrzba | 0.7 | 5–9 |
| reznik | Řezník | 0.30 | 0.30 | bufet | 0.9 | — |
| pekar | Pekař | 0.15 | 0.50 | bufet | 0.8 | — |
| hospodsky | Hospodský | 0.05 | 0.40 | bufet | **1.0** | 7,8,12 |
| prodavac | Prodavač | 0.05 | 0.30 | bufet | 0.6 | 12 |
| automechanik | Automechanik | 0.30 | 0.40 | udrzba | 0.8 | — |
| svarac | Svářeč | 0.40 | 0.40 | udrzba | 0.8 | — |
| malir_pokoju | Malíř pokojů | 0.10 | 0.30 | udrzba | 0.5 | 6,7,8 |
| postovni | Poštovní doručovatel | 0.10 | 0.20 | zved | **1.0** | — |
| spravce_hriste | Správce hřiště | 0.10 | 0.20 | travnik | **1.0** | — |
| obchodnik | Obchodník | 0.05 | 0.30 | hospodar | 0.7 | — |
| zahradnik | Zahradník | 0.15 | 0.20 | travnik | 0.9 | — |
| ridic_autobusu | Řidič autobusu | 0.05 | 0.50 | doprava | **1.0** | — |
| stolar | Stolař | 0.25 | 0.30 | udrzba | 0.7 | — |
| mistr_v_tovarne | Mistr v továrně | 0.15 | 0.50 | hospodar | 0.6 | — |
| delnik_v_pile | Dělník v pile | 0.40 | 0.40 | udrzba | 0.5 | — |
| delnik_v_kamenolomu | Dělník v kamenolomu | 0.50 | 0.40 | udrzba | 0.4 | — |
| ridic_kamionu | Řidič kamionu | 0.15 | 0.70 | doprava | **1.0** | — |
| elektrikar | Elektrikář | 0.25 | 0.40 | udrzba | 0.8 | 12,1,2 |
| hasic | Hasič | 0.20 | 0.30 | zdravotnik | 0.7 | — |
| policista | Policista | 0.15 | 0.40 | zdravotnik | 0.5 | — |
| kuchar | Kuchař | 0.15 | 0.40 | bufet | 0.9 | 7,8,12 |
| cisnik | Číšník | 0.05 | 0.40 | bufet | 0.8 | 7,8,12 |
| skladnik | Skladník | 0.20 | 0.50 | hospodar | 0.4 | — |
| zachranar | Záchranář | 0.10 | 0.30 | zdravotnik | **1.0** | — |
| strojni_inzenyr | Strojní inženýr | 0.10 | 0.30 | hospodar | 0.6 | — |
| podnikatel | Podnikatel | 0.05 | 0.30 | hospodar | 0.8 | — |
| programator | Programátor | 0.02 | 0.30 | hospodar | 0.6 | — |
| ucetni | Účetní | 0.02 | 0.40 | hospodar | **1.0** | — |
| ucitel | Učitel | 0.05 | 0.20 | zved | 0.6 | 6,9 |
| urednik | Úředník | 0.02 | 0.20 | hospodar | 0.8 | — |
| revizor | Revizor | 0.05 | 0.30 | hospodar | 0.5 | — |
| tramvajak | Řidič tramvaje | 0.10 | 0.60 | doprava | 0.8 | — |
| bezdomovec | Bezdomovec | 0.20 | 0.05 | — | 0 | — |
| ridic_boltu | Řidič Boltu | 0.05 | 0.40 | doprava | 0.7 | — |
| barman | Barman | 0.05 | 0.50 | bufet | 0.8 | 7,8,12 |
| kuryr | Kurýr | 0.15 | 0.50 | doprava | 0.7 | 12 |
| vratny | Vrátný | 0.02 | 0.30 | — | 0 | — |
| taxikar | Taxikář | 0.05 | 0.50 | doprava | 0.8 | — |
| prodavac_trafika | Prodavač v trafice | 0.02 | 0.30 | bufet | 0.5 | 12 |
| metar | Metař | 0.15 | 0.40 | — | 0 | — |
| strojvedouci_metro | Strojvedoucí metra | 0.05 | 0.60 | doprava | 0.6 | — |
| hlidac_parkoviste | Hlídač parkoviště | 0.02 | 0.30 | — | 0 | — |
| poulicni_muzikant | Pouliční muzikant | 0.05 | 0.10 | — | 0 | — |
| ridic_mhd | Řidič autobusu MHD | 0.05 | 0.60 | doprava | 0.9 | — |
| uklidova_firma | Uklízeč kanceláří | 0.10 | 0.40 | — | 0 | — |
| student | Student | 0.10 | 0.10 | — | 0 | 6,9 |
| nezamestnany | Nezaměstnaný | 0.05 | 0.05 | — | 0 | — |
| duchodce | Důchodce | 0.15 | 0.00 | — | 0 | — |

**Bez klubového efektu:** 10 profesí (včelař, bezdomovec, vrátný, metař, hlídač
parkoviště, pouliční muzikant, uklízeč, student, nezaměstnaný, důchodce).
Ty žijí přes výmluvy a sezónnost, ne přes ekonomiku.

---

## 11. Dotčené soubory

### Nové

- `apps/api/src/staff/occupation-effects.ts`
- `apps/api/src/staff/occupation-effects.test.ts`

### Upravené

| Soubor | Změna |
|---|---|
| `generators/occupations.ts` | 3–4 nová pole × 67 profesí, sezónní a povětrnostní výmluvy, `workInjuryTexts` |
| `events/absence.ts` | options objekt, timing `"training"`, filtr na měsíc a počasí |
| `season/training.ts` | `overtimeRisk` do docházky, výmluvy místo tichého zmizení |
| `season/daily-tick.ts` | pracovní úrazy, sezónní výpadky |
| `staff/staff-effects.ts` | `repairCostMul`, `commuteBonus` do vektoru i `emptyStaffEffects()` |
| `staff/staff-tick.ts` | kombinace profesního zvěda se skautem při objevování hráčů |
| `equipment/equipment-generator.ts` | `getRepairCost()` přijme `repairCostMul` |
| `generators/player.ts` | `strengthBonus` z registru |
| 9 volání `generateAbsences` | sjednocení na options objekt |
| `routes/game.ts` | endpoint pro přehled profesních efektů kádru |
| FE `dashboard/player/[id]` | „Přínos klubu" na kartě hráče |
| FE `dashboard/zamestnanci` | hláška o kolizi s profesí v kádru |

---

## 12. Rizika

| Riziko | Dopad | Ošetření |
|---|---|---|
| Rozjetí SMS vs. simulace u absencí | **vysoký** — hráči vidí jiné omluvenky, než co se odehrálo | Options objekt + test determinismu se stejným seedem |
| Přestřelené pracovní úrazy | střední — kádry rozbité mimo hřiště | Koeficient 0,004 ověřit simulací celé sezóny před nasazením |
| Tiché efekty rozbijí ekonomiku | střední — bufet/opravy zadarmo | Strop „jen jednou za roli" + 40 % stropu zaměstnance |
| Sezónní výpadky zabijí zábavu | střední — tři týdny bez opory | Zasáhne jen ~10 profesí; výpadek není absolutní, jen zvýšená šance |
| Změna `strengthBonus` retroaktivně | vysoký | Platí výhradně pro nově generované hráče |

---

## 13. Testování

- **Unit** (`vitest`, vzorem `equipment-pricing.test.ts`):
  - agregace profesních efektů — nesčítání přes víc hráčů stejné role
  - kolize s placeným zaměstnancem — bere se vyšší, ne součet
  - `repairCostMul` se propíše do `getRepairCost()`
  - `commuteBonus` + dodávka se zastropuje na 0,55
  - profesní zvěd se se skautem nesčítá, bere se vyšší
- **Registr:** všech 67 profesí má konzistentní dvojici `clubEffect` / `effectFit`
  (null ⇒ 0), `effectFit` v rozsahu 0,4–1,0, `seasonalPeak` v rozsahu 1–12
- **Determinismus:** dvě volání `generateAbsences` se stejným seedem a stejnými
  options vrátí identický výsledek — přímo ta past z komentáře na `absence.ts:463`
- **Sezónní simulace:** proběhnout celou sezónu a ověřit počet pracovních úrazů
  na profesi proti očekávání z bodu 5
- **API:** `curl` na kádr → profesní efekty v odpovědi
- **MCP browser:** login na test.prales.fun → karta hráče (screenshot) →
  `/dashboard/zamestnanci` a ověřit hlášku o kolizi

---

## 14. Pořadí implementace

Od nejmenšího rizika k největšímu. Každý krok je samostatně nasaditelný.

1. **Část 6** — `strengthBonus` z registru (pár řádků, okamžitý efekt)
2. **Část 1** — výmluvy do tréninku (největší poměr přínos/práce)
3. **Část 3** — pracovní úrazy
4. **Část 2** — sezónnost a počasí (obsahuje refactor devíti volání)
5. **Část 5** — tiché klubové efekty (největší kus)
6. **Část 4** — sezónní výpadky (nejvíc se dotýká vyvážení hry)
