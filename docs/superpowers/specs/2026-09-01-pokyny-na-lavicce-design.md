# Pokyny na lavičce — přednastavené scénáře zápasu

Datum: 2026-09-01 · Větev: `testing`

## Problém

Taktika se dnes nastavuje jednou před zápasem a po celých 90 minut se nemění.
Manažer nemá jak říct „když od 60. minuty prohráváme, hraj útočně" nebo
„v 70. minutě stáhni Nováka a pošli tam Dvořáka". Střídání řídí výhradně engine
podle vlastní heuristiky (zranění, únava po 60', prohrávající tým po 75').

## Cíl

Manažer přednastaví pravidla „podmínka → akce", engine je za běhu vyhodnocuje
a mění taktiku, tvrdost hry a provádí střídání.

## Datový model

Nový sloupec `match_plan TEXT NOT NULL DEFAULT '[]'` na tabulkách `lineups`
a `lineup_presets`. Plán je součástí Sestavy A/B/C stejně jako formace, taktika
a tvrdost — přepnutí presetu přepne i plán.

Typy žijí v `packages/shared/src/types/match-plan.ts`, sdílí je engine, API i FE.

```ts
type PlanTrigger =
  | { kind: "score"; state: "losing" | "drawing" | "winning"; byAtLeast?: number }
  | { kind: "minute" }
  | { kind: "men"; state: "down" | "up" }
  | { kind: "condition"; below: number };

type PlanAction =
  | { kind: "tactic"; tactic: Tactic }
  | { kind: "hardness"; hardness: Hardness }
  | { kind: "sub"; outPlayerId: string; inPlayerId: string };

interface MatchPlanRule {
  id: string;
  fromMinute: number;   // 1–90; dřív pravidlo nesepne
  trigger: PlanTrigger;
  action: PlanAction;
}
```

Limit 5 pravidel na plán. Pravidlo sepne **nejvýš jednou za zápas** — jinak by
se u remízy taktika přepínala každou minutu tam a zpět.

### Sémantika `condition`

Spouštěč `condition` (kondice pod X) se u střídání vztahuje na **konkrétního
střídaného hráče**; u změny taktiky/tvrdosti na **kteréhokoli hráče základní
jedenáctky mimo brankáře**. Tohle je jediné čtení, které dává smysl v obou
případech, a UI ho pojmenuje explicitně.

## Engine

Nový modul `apps/api/src/engine/match-plan.ts`:

- `ruleMatches(rule, ctx): boolean` — čistá funkce, testovatelná bez simulace.
- `PlanContext` = minuta, vlastní/soupeřovo skóre, počet červených na obou
  stranách, sestava, lavička.

`TeamSetup` dostane `plan?: EngineMatchPlanRule[]`, kde jsou ID hráčů převedená
na engine ID (stejně jako `captainId` nebo `penaltyTakerId` dnes).

V minutové smyčce `simulation.ts` se plán vyhodnotí **před** stávajícím
auto-střídáním. Mutace `team.tactic` / `team.hardness` se projeví okamžitě,
protože engine obě hodnoty čte znovu při každé šanci (`simulation.ts:172`, `:204`)
— nic dalšího se přepojovat nemusí.

### Rezervace střídacích slotů

Auto-střídání (vyčerpaný hráč po 60', útočník za obránce po 75') zůstává, ale smí
sáhnout jen na sloty, které si nenárokuje dosud nesepnuté plánované střídání:

```
autoSubsAllowed  ⟺  subsUsed + pendingPlannedSubs < MAX_SUBS
```

Bez toho by asistent v 60. minutě vyplýtval všechny tři sloty a plánované
střídání na 75. by nikdy neproběhlo. Střídání za zraněného tuto rezervaci
ignoruje — hráč, který nemůže dál, musí ven vždy.

### Chybějící hráči

Lavička se neukládá, odvozuje se ze zbytku kádru (`match-runner.ts:1381`).
Plánované střídání proto sepne jen když je střídající hráč skutečně na lavičce
(není zraněný, omluvený ani po stopce). Jinak pravidlo propadne bez efektu.

## Události zápasu

- Střídání → `substitution` (už se renderuje v timeline).
- Změna taktiky / tvrdosti → `special` s detailem `plan:tactic` / `plan:hardness`,
  `playerId: 0`, `playerName` = jméno týmu. `playerId 0` není v `idMap`, takže
  `extractStatsFromEvents` ani `calculatePlayerRatings` událost nikam nepřičtou.

FE detail zápasu musí `plan:*` přidat do filtru `keyEvents` a do ikon `EventRow`,
jinak by změna taktiky v průběhu zápasu nebyla vidět.

## API

Plán prochází stejnými cestami jako zbytek sestavy:

| Endpoint | Změna |
|---|---|
| `POST /teams/:id/lineup` | přijímá a validuje `matchPlan`, ukládá na lineup i do presetu |
| `PUT /teams/:id/lineup-presets/:slot` | přijímá a validuje `matchPlan` |
| `GET /teams/:id/lineup-presets` | vrací `matchPlan` |
| `GET /teams/:id/lineup/:calendarId` | vrací `matchPlan` |
| `GET /teams/:id/next-match` | vrací `matchPlan` |
| `POST /teams/:id/lineup-presets/:slot/apply` | vrací `matchPlan` + varování u pravidel s nedostupným hráčem |

Validace na serveru: max 5 pravidel, `fromMinute` 1–90, taktika a tvrdost proti
sdílenému whitelistu, střídaný hráč musí být v jedenáctce, střídající v kádru
a mimo jedenáctku.

## UI

Sbalitelná sekce „Pokyny na lavičce" pod tvrdostí hry na `/dashboard/match`.
Řádek pravidla: `Když [podmínka] od [minuta]' → [akce]`. Mobile-first — volby
se skládají pod sebe, ne do sloupců. Tlačítko přidat (max 5), křížek na smazání.

## Záměrně mimo rozsah

- **Postih za změnu taktiky v průběhu.** Kompetenci týmu už řeší `calcTacticFit`;
  druhá vrstva postihu by jen zdvojila totéž.
- **Změna formace za běhu.** Sehranost formace se počítá jednou před zápasem
  (`formationFamiliarity`), za běhu by neseděla.
- **Rolové střídání „typ za typ".** Uživatel ho ve výběru nezvolil.

## Testování (localhost, lokální sqlite D1)

1. Vitest: `ruleMatches` — každý spouštěč, hranice `fromMinute`, jednorázovost.
2. Vitest: simulace — plán opravdu přepnul taktiku a provedl střídání; rezervace
   slotů drží; pravidlo s nedostupným hráčem propadne bez pádu.
3. Migrace do lokální sqlite (`.wrangler/state/v3/d1/...`).
4. `wrangler dev` + curl na všechny dotčené endpointy, včetně zamítnutí
   neplatného plánu.
5. Odsimulovaný reálný zápas nad lokální DB — kontrola událostí v uloženém zápase.
6. MCP browser: uložení plánu v UI, reload, přepnutí presetu.
