# Incidenty — Pozitivní incidenty

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Klubu se nedějí jen průšvihy. Řemeslník v kádru opraví škodu zadarmo, automechanik spraví dodávku, hráč se zachová jako hrdina, někdo vrátí ztracenou peněženku, přijde dědictví dresů, dar od zaměstnavatele, anonymní obálka s penězi, a od hráče, který kdysi utekl s pokladnou, dorazí omluvný dopis s částí peněz.

**Architecture:** Osm nových položek v `KATALOG` s `category: "pozitivni"`, losovaných vlastní denní šancí vedle problémů a životních situací. Dopady jdou přes už existující cesty: `provedZtratu` obráceně (oprava a vybavení nahoru), `recordTransaction` s novým typem `incident_gift`, `applyReputationDelta` se zdrojem `incident`, `posunKadru` na morálku a `ensureGlobalFavor` na přízeň obce.

**Tech Stack:** Hono + D1 na Cloudflare Workers (`apps/api`), Next.js 15 (`apps/web`), Vitest, wrangler.

**Spec:** `docs/superpowers/specs/2026-09-16-incidenty-design.md` (Části 4d, 4e, 7f)

## Global Constraints

- Větev `testing`. **Nikdy** push ani merge na `main`.
- Migrace **žádná**.
- Žádný prázdný catch. Server `logger.warn({ module: "…" }, "popis", e)` nebo `logger.error`.
- Texty pro hráče česky, **nikdy dlouhá pomlčka „—"**, jméno hráče jen v 1. pádě jako podmět nebo za dvojtečkou, věta končí `.` nebo `!`.
- UI: minimum `text-sm`, jména `text-base` a klikatelná, cena nikdy v tlačítku, mobil od 400 px.
- Determinismus: každý los z `createRng(seedFromString("…|id"))`, nikdy `Math.random`.
- Idempotence: `INSERT OR IGNORE` s odvozeným id, hlídané `UPDATE` s kontrolou `meta.changes`.
- **Pořadí losů je závazné.** Nové položky se přidávají na konec `KATALOG` a losují se vlastní šancí, ne v poolu problémů. Žádný existující seedovaný test se nesmí upravovat.
- Commit po každém tasku, trailer `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- Po každém tasku `cd apps/api && npx vitest run && npx tsc --noEmit`. Sada je na začátku zelená (1714 testů).

---

## Co v kódu existuje a na co se to věší

| Potřeba | Co už je | Kde |
|---|---|---|
| oprava škody zdarma | **NEEXISTUJE**, je jen placená `opravVybaveni` | `apps/api/src/stadium/stadium-damage.ts:200` |
| seznam škod klubu | `nactiPoskozeni(db, teamId)` | `stadium-damage.ts:183` |
| peníze klubu | `recordTransaction(db, teamId, type, amount, popis, gameDate, ref?)` | `apps/api/src/season/finance-processor.ts:134` |
| typ transakce `incident_gift` | **NEEXISTUJE** | `finance-processor.ts` + obě mapy v `apps/web/src/app/dashboard/finances/page.tsx` |
| reputace | `applyReputationDelta(db, teamId, delta, "incident", popis, { referenceId })`, zdroj `incident` už v unii | `apps/api/src/lib/reputation.ts:73` |
| morálka kádru | `posunKadru(db, teamId, delta)` vrací statement | `apps/api/src/incidents/hraci.ts:31` |
| morálka jednoho hráče | `posunHrace(db, teamId, playerId, { morale, vztah })` | `hraci.ts:20` |
| přízeň obce | `ensureGlobalFavor(db, villageId, teamId)` vrací `{ favor, trust }`, tabulka `village_team_favor` má oba sloupce | `apps/api/src/villages/officials-store.ts:114` |
| povolání hráče | `HracKlubu.povolani`, hodnoty z `apps/api/src/generators/occupations.ts` | `incidents/typy.ts` |
| vybavení klubu | `StavKlubu.vybaveni` (`balls`, `balls_condition`, …) | `incidents/typy.ts` |

---

### Task 1: Základ — typ daru, oprava zdarma, konstanty a texty

**Files:**
- Modify: `apps/api/src/season/finance-processor.ts`
- Modify: `apps/web/src/app/dashboard/finances/page.tsx`
- Modify: `apps/api/src/stadium/stadium-damage.ts`
- Modify: `apps/api/src/incidents/nastaveni.ts`
- Modify: `apps/api/src/incidents/texty.ts`
- Test: `apps/api/src/stadium/stadium-damage.test.ts` (vytvoř, pokud není)

**Interfaces:**
- Produces: `TransactionType` o `"incident_gift"`, `opravZdarma(db, { teamId, damageId, gameDate })`, konstanty pozitivních incidentů, texty osmi kindů

- [ ] **Step 1: Typ transakce**

Do `TransactionType` k ostatním `incident_*`:

```ts
  // Dar klubu z pozitivního incidentu (spec 4d). Příjem, ne nákup.
  | "incident_gift"
```

Do obou map v `finances/page.tsx` vedle `incident_recovery`: ikona `"🎁"`, popisek `"Dar klubu"`.

⚠️ `apps/api/src/season/transaction-labels.test.ts` hlídá, že každý typ má ikonu i popisek. Bez obojího spadne.

- [ ] **Step 2: Oprava zdarma**

Do `stadium-damage.ts` vedle `opravVybaveni`. Přečti si ji celou a zopakuj její hlídaný zápis, jen bez peněz:

```ts
/**
 * Oprava, kterou nikdo neplatí (spec 4d, `remeslnik_opravil`). Stejně hlídaná jako placená
 * oprava: kdo přijde druhý, nedostane nic, aby se jedna škoda neopravila dvakrát.
 */
export async function opravZdarma(
  db: D1Database,
  opts: { teamId: string; damageId: string; gameDate: string },
): Promise<VysledekOpravy>
```

Vrací tentýž `VysledekOpravy`, `cost: 0`. Test: dvě volání po sobě, druhé vrátí `uz_opraveno` a nezmění nic.

- [ ] **Step 3: Konstanty**

```ts
/** Denní šance pozitivního incidentu na lidský klub (spec 4e). */
export const SANCE_POZITIVNIHO_ZA_DEN = 0.025;
/** Hrdina: povolání, která se k tomu hodí, a jejich náskok v losu (spec 4d). */
export const POVOLANI_HRDINY = ["Hasič", "Záchranář", "Policista"] as const;
export const VAHA_HRDINY = 3;
export const HRDINA_REPUTACE = 2;
export const HRDINA_PRIZEN = 3;
export const HRDINA_MORALKA_KADRU = 2;
export const NALEZCE_REPUTACE = 1;
export const NALEZCE_PRIZEN = 1;
/** Řemeslník opraví, co je rozbité, nebo srovná stav vybavení. */
export const REMESLNIK_STAV = 30;
export const POVOLANI_REMESLNIKU = [
  "Zedník", "Tesař", "Truhlář", "Stolař", "Instalatér", "Pokrývač",
  "Elektrikář", "Svářeč", "Kovář", "Malíř pokojů", "Opravář",
] as const;
export const POVOLANI_MECHANIKA = "Automechanik";
export const MECHANIK_STAV = 40;
export const DODAVKA_STAV_PRAH = 70;
/** Dar zaměstnavatele: buď levná kategorie, nebo peníze. */
export const POVOLANI_DARCE = ["Podnikatel", "Obchodník", "Mistr v továrně"] as const;
export const LEVNE_KATEGORIE = ["bibs", "water_bottles", "coffee_maker", "training_cones"] as const;
export const DAR_MIN_KC = 3000;
export const DAR_MAX_KC = 10000;
/** Anonymní obálka ve schránce. */
export const OBALKA_MIN_KC = 1000;
export const OBALKA_MAX_KC = 5000;
/** Omluvný dopis vrátí část toho, co kdysi zmizelo. */
export const DOPIS_PODIL_MIN = 20;
export const DOPIS_PODIL_MAX = 50;
```

Ověř skutečné názvy povolání v `apps/api/src/generators/occupations.ts` a použij přesně ty, které tam jsou. Co tam není, z konstant vyhoď a napiš to do reportu.

- [ ] **Step 4: Texty**

Do `texty.ts` osm klíčů po 4 variantách: `remeslnik_opravil`, `mechanik_dodavka`, `hrdina`, `poctivy_nalezce`, `dedictvi`, `dar_zamestnavatele`, `anonymni_obalka`, `omluvny_dopis`.

Značky: `{hrac}` (1. pád jako podmět), `{castka}`, `{vec}`. U `hrdina` ať je z textu poznat, co se stalo, ne jen že je hrdina. U `omluvny_dopis` ať je cítit, že dopis přišel po letech od někoho, kdo klub okradl.

- [ ] **Step 5: Testy a typecheck**

Run: `cd apps/api && npx vitest run && npx tsc --noEmit`, pak `cd ../web && npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/season/finance-processor.ts apps/web/src/app/dashboard/finances/page.tsx apps/api/src/stadium/stadium-damage.ts apps/api/src/incidents/nastaveni.ts apps/api/src/incidents/texty.ts apps/api/src/stadium/stadium-damage.test.ts
git commit -F - <<'EOF'
feat(incidenty): zaklad pozitivnich incidentu

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 2: Řemeslník, automechanik a dědictví

**Files:**
- Modify: `apps/api/src/incidents/typy.ts`
- Modify: `apps/api/src/incidents/stav-klubu.ts`
- Modify: `apps/api/src/incidents/katalog.ts`
- Modify: `apps/api/src/incidents/dopady.ts`
- Test: `apps/api/src/incidents/katalog.test.ts`

**Interfaces:**
- Consumes: `opravZdarma` (Task 1), `StavKlubu.vybaveni`, `HracKlubu.povolani`
- Produces: `Ztrata` o opačné varianty (`{ typ: "oprava" }`, `{ typ: "vybaveni_nahoru" }`), katalogové položky `remeslnik_opravil`, `mechanik_dodavka`, `dedictvi`, `StavKlubu.poskozeni`

- [ ] **Step 1: Kladné „ztráty"**

Pozitivní incident potřebuje zapsat, co se **zlepšilo**. Do unie `Ztrata` v `typy.ts`:

```ts
  /** Opravená škoda na stadionu (spec 4d). Záporná ztráta: něco se spravilo. */
  | { typ: "oprava"; damageId: string; zarizeni: string }
  /** Vybavení šlo nahoru, ne dolů: úroveň nebo stav (spec 4d). */
  | { typ: "vybaveni_nahoru"; kategorie: string; urovniNahoru?: number; stavNahoru?: number }
```

⚠️ Nad `Ztrata` větví **čtyři** místa a jen jedno má strážce `never`. Projdi všechna: `provedZtratu` (`dopady.ts`), `hodnotaSkody` (`tresty.ts`), `popisZtraty` (`popis.ts`), `kmenyZtraty` (`tema.ts`). U `hodnotaSkody` vrací obě nové varianty `0` — pozitivní incident není škoda, ze které se platí pokuta.

- [ ] **Step 2: Poškození do stavu klubu**

`remeslnik_opravil` potřebuje vědět, co je rozbité. Do `StavKlubu`:

```ts
  /** Neopravené škody na stadionu, kandidáti na opravu zdarma (spec 4d). */
  poskozeni: Array<{ id: string; zarizeni: string }>;
```

Naplň v `nactiStavKlubu` **z existující dávky** dotazem na `stadium_damage WHERE team_id = ? AND repaired_at IS NULL`. Statement přidej na **konec** pole a destrukturalizaci rozšiř ve stejném pořadí. Fixturu v `testovaci-stav.ts` doplň o prázdné pole.

- [ ] **Step 3: Katalogové položky**

Všechny tři `category: "pozitivni"`, `status: "uzavreny"`, `culpritType: "nikdo"`, `culpritPlayerId: null`, `culpritRevealed: false`, `spousteny: false`, a **`vaha: 0`** — losují se vlastní cestou (Task 5), ne v poolu problémů.

- `remeslnik_opravil`: `muze` = klub má neopravenou škodu **nebo** vybavení se stavem < 60, a v kádru je někdo z `POVOLANI_REMESLNIKU`. `vytvor` vybere řemeslníka a buď škodu (ztráta `oprava`), nebo kategorii se špatným stavem (ztráta `vybaveni_nahoru` se `stavNahoru: REMESLNIK_STAV`).
- `mechanik_dodavka`: `muze` = `team_van >= 1` a `team_van_condition < DODAVKA_STAV_PRAH` a automechanik v kádru. Stav +`MECHANIK_STAV`, strop 100.
- `dedictvi`: `muze` = úroveň `jerseys` < 3. Ztráta `vybaveni_nahoru` s `urovniNahoru: 1` a `stavNahoru: 100`.

- [ ] **Step 4: Dopady**

Ve `provedZtratu` (`dopady.ts`) doplň obě nové větve:

```ts
    case "oprava": {
      const { opravZdarma } = await import("../stadium/stadium-damage");
      const r = await opravZdarma(db, { teamId: stav.teamId, damageId: z.damageId, gameDate: stav.gameDate })
        .catch((e) => { logger.error({ module: M }, `oprava zdarma ${incidentId}`, e); return null; });
      return r?.ok ? z : null;
    }
```

`vybaveni_nahoru` zvedne úroveň nebo stav hlídaným `UPDATE` a vrátí `null`, když se nic nezměnilo. Podívej se, jak to dělá sousední větev `vybaveni`, a drž stejný tvar.

⚠️ Úspěch se pozná podle toho, že to **nevyhodilo chybu** nebo že `meta.changes > 0`, nikdy podle návratové hodnoty, která může být legitimní nula.

- [ ] **Step 5: Testy a typecheck**

- [ ] **Step 6: Commit**

```bash
git commit -F - <<'EOF'
feat(incidenty): remeslnik, automechanik a dedictvi

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 3: Hrdina a poctivý nálezce

**Files:**
- Modify: `apps/api/src/incidents/katalog.ts`
- Modify: `apps/api/src/incidents/dopady.ts`
- Modify: `apps/api/src/incidents/typy.ts`
- Modify: `apps/api/src/engine/fan-reactions.ts`
- Test: `apps/api/src/incidents/katalog.test.ts`, `apps/api/src/incidents/dopady.test.ts`

**Interfaces:**
- Consumes: `applyReputationDelta` (`lib/reputation.ts:73`, zdroj `incident` v unii už je), `posunKadru` (`incidents/hraci.ts:31`), `ensureGlobalFavor` (`villages/officials-store.ts:114`), `zapisClubEvent` (`fans/club-events.ts:40`)
- Produces: katalogové položky `hrdina` a `poctivy_nalezce`, `NavrhIncidentu.subjectPlayerId` u obou, `ClubEventKind` o `"hrdina_v_kadru"`

- [ ] **Step 1: Kdo je hrdina**

`hrdina`: `muze` = kádr není prázdný. Hráče vyber váženě — kdo má povolání z `POVOLANI_HRDINY`, má váhu `VAHA_HRDINY`, ostatní 1. Použij `rng.weighted`, stejně jako to dělá výběr kategorie u krádeže.

`poctivy_nalezce`: bez podmínky, hráč se vybere rovnoměrně.

Oba `category: "pozitivni"`, `status: "uzavreny"`, `vaha: 0`, `spousteny: false`, `culpritType: "nikdo"`. Hráče nes v `subjectPlayerId` (to pole už existuje kvůli životním situacím) — **ne** v `culpritPlayerId`, hrdina není pachatel a nesmí spadnout do vyšetřovací ani trestní logiky.

- [ ] **Step 2: Dopady**

V `zapisIncident` za zápis ztrát, podle kindu:

- `hrdina`: `applyReputationDelta(db, teamId, HRDINA_REPUTACE, "incident", popis, { referenceId: "hrdina-" + id, gameDate })`, `posunKadru(db, teamId, HRDINA_MORALKA_KADRU)`, přízeň obce +`HRDINA_PRIZEN`, a `zapisClubEvent` s novým kindem.
- `poctivy_nalezce`: reputace +`NALEZCE_REPUTACE`, přízeň obce +`NALEZCE_PRIZEN`.

`applyReputationDelta` má vestavěnou pojistku přes `referenceId` — předej ji, aby dvojí běh dne nepřipsal reputaci dvakrát. Totéž u `zapisClubEvent`.

Přízeň obce: nejdřív `ensureGlobalFavor`, pak hlídaný `UPDATE village_team_favor SET favor = MAX(0, MIN(100, favor + ?)) WHERE team_id = ? AND official_id IS NULL`. Bez existujícího řádku by `UPDATE` tiše neudělal nic, proto to `ensureGlobalFavor` musí předcházet.

Každý krok má vlastní `.catch(logger.error)` — incident stojí i tehdy, když se některý dopad nepovede.

- [ ] **Step 3: Klubová událost**

Do `ClubEventKind` v `engine/fan-reactions.ts` přidej `"hrdina_v_kadru"` a k tomu záznam v `CLUB_EVENTS` podle tvaru `prodej_opory`, ale kladný: všech pět part nahoru, `pise: "stamgasti"`, tři texty se značkou `{co}`. Nic jiného v tom souboru neměň.

- [ ] **Step 4: Testy a typecheck**

Test, že hrdina padne častěji na hasiče než na účetního (300 seedů), a že `subjectPlayerId` je vyplněné, kdežto `culpritPlayerId` je `null`.

- [ ] **Step 5: Commit**

```bash
git commit -F - <<'EOF'
feat(incidenty): hrdina v kadru a poctivy nalezce

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 4: Dar zaměstnavatele, anonymní obálka a omluvný dopis

**Files:**
- Modify: `apps/api/src/incidents/typy.ts`
- Modify: `apps/api/src/incidents/stav-klubu.ts`
- Modify: `apps/api/src/incidents/katalog.ts`
- Modify: `apps/api/src/incidents/dopady.ts`
- Test: `apps/api/src/incidents/katalog.test.ts`

**Interfaces:**
- Consumes: `recordTransaction` s `"incident_gift"` (Task 1)
- Produces: `Ztrata` o `{ typ: "dar"; castka: number }`, `StavKlubu.utekBezDopisu`, tři katalogové položky

- [ ] **Step 1: Dar jako kladná částka**

Do `Ztrata`:

```ts
  /** Peníze, které klubu někdo dal (spec 4d). Opak `penize`. */
  | { typ: "dar"; castka: number }
```

Ošetři ji ve všech čtyřech místech, která nad `Ztrata` větví. `hodnotaSkody` vrací `0`.

Ve `provedZtratu`:

```ts
    case "dar": {
      if (z.castka <= 0) return null;
      const { recordTransaction } = await import("../season/finance-processor");
      const ok = await recordTransaction(db, stav.teamId, "incident_gift", z.castka, `Dar klubu: ${popis}`, stav.gameDate, `dar-${incidentId}`)
        .then(() => true)
        .catch((e) => { logger.error({ module: M }, `dar klubu ${incidentId}`, e); return false; });
      return ok ? z : null;
    }
```

- [ ] **Step 2: Útěk bez dopisu do stavu klubu**

`omluvny_dopis` potřebuje vědět, jestli klubu někdy někdo utekl a dopis ještě nepřišel. Do `StavKlubu`:

```ts
  /** Útěk s penězi, ke kterému ještě nepřišel omluvný dopis (spec 4d). `null`, když žádný není. */
  utekBezDopisu: { id: string; castka: number } | null;
```

Dotaz **na konec** existující dávky: najdi nejstarší `club_incidents` s `kind = 'utek_s_penezi'`, ke kterému v tomtéž klubu neexistuje `kind = 'omluvny_dopis'` s odvozeným id. Částku vytáhni z `loss` (JSON) — parsuj ji v paměti přes `nactiZtraty`, ne v SQL.

- [ ] **Step 3: Katalogové položky**

- `dar_zamestnavatele`: `muze` = v kádru je někdo z `POVOLANI_DARCE`. `vytvor` losem rozhodne mezi levnou kategorií (ztráta `vybaveni_nahoru`, `urovniNahoru: 1`) a penězi (`dar`, `DAR_MIN_KC` až `DAR_MAX_KC`).
- `anonymni_obalka`: bez podmínky, `dar` mezi `OBALKA_MIN_KC` a `OBALKA_MAX_KC`.
- `omluvny_dopis`: `muze` = `!!s.utekBezDopisu`. Částka `DOPIS_PODIL_MIN` až `DOPIS_PODIL_MAX` procent z tehdejší ztráty. Id incidentu odvoď z id toho útěku (`dopis-{idUteku}`), aby dopis nemohl přijít dvakrát.

- [ ] **Step 4: Testy a typecheck**

Test, že `omluvny_dopis` nepřijde bez útěku, že částka je v pásmu 20 až 50 % tehdejší ztráty, a že dvakrát ke stejnému útěku nepřijde.

- [ ] **Step 5: Commit**

```bash
git commit -F - <<'EOF'
feat(incidenty): dar zamestnavatele, anonymni obalka a omluvny dopis

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 5: Losování pozitivního incidentu a zařazení do dne

**Files:**
- Modify: `apps/api/src/incidents/losovani.ts`
- Modify: `apps/api/src/incidents/denni-krok.ts`
- Test: `apps/api/src/incidents/losovani.test.ts`, `apps/api/src/incidents/denni-krok.test.ts`

**Interfaces:**
- Produces: `vylosujPozitivni(stav, rng): NavrhIncidentu | null`

- [ ] **Step 1: Los**

Do `losovani.ts` vedle `vylosujIncident`:

```ts
/**
 * Pozitivní incident (spec 4d). Vlastní denní šance, vlastní pool: nesoupeří s průšvihy,
 * protože hezká věc se může stát i ve dni, kdy se zrovna něco ukradlo.
 */
export function vylosujPozitivni(stav: StavKlubu, rng: Rng): NavrhIncidentu | null {
  if (stav.odehranychZapasu < MIN_ODEHRANYCH_ZAPASU) return null;
  if (rng.random() >= SANCE_POZITIVNIHO_ZA_DEN) return null;
  const kandidati = KATALOG.filter((d) => d.category === "pozitivni" && !d.spousteny && !naCooldownu(stav, d.kind) && d.muze(stav));
  if (kandidati.length === 0) return null;
  const kind = rng.weighted(Object.fromEntries(kandidati.map((d) => [d.kind, 1])));
  return kandidati.find((d) => d.kind === kind)?.vytvor(stav, rng) ?? null;
}
```

`alarm_vyplasil` má `spousteny: false` a `vaha: 0`, ale **nesmí** se do tohohle poolu dostat — vzniká jen místo krádeže. Vyluč ho jménem a napiš k tomu proč.

⚠️ Ochrana nového klubu platí i tady, ale **strop otevřených problémů ne** — pozitivní incident se zakládá rovnou uzavřený a nikomu nepřekáží.

- [ ] **Step 2: Denní krok**

V `denni-krok.ts` zavolej `vylosujPozitivni` **až za** vším ostatním, tedy i za losem problému a životní situace, a to **bez ohledu na to, jestli se něco vylosovalo** — hezká věc a průšvih se nevylučují. Nepouštěj ho ale ve dnech, kdy funkce skončila dřív kvůli útěku nebo splněné hrozbě; tam je ta zpráva dne jediná.

Zapiš ho stejnou cestou jako ostatní: `zapisIncident` a `oznamIncident`.

- [ ] **Step 3: Testy a typecheck**

Test, že klub bez řemeslníka, bez rozbité dodávky a s dresy na úrovni 3 nedostane nic, a že se pozitivní incident může stát i v den, kdy padl problém.

- [ ] **Step 4: Commit**

```bash
git commit -F - <<'EOF'
feat(incidenty): denni los pozitivniho incidentu

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 6: Frontend, admin a spec

**Files:**
- Modify: `apps/api/src/routes/incidents.ts`
- Modify: `apps/web/src/app/dashboard/incidenty/page.tsx`
- Modify: `apps/web/src/app/dashboard/incidenty/DetailIncidentu.tsx`
- Modify: `docs/superpowers/specs/2026-09-16-incidenty-design.md`

- [ ] **Step 1: Stránka incidentů**

Pozitivní incident se nesmí tvářit jako průšvih. Na kartě i v detailu ať je poznat, že je to dobrá zpráva: žádné „Řeší se", žádné vyšetřování, žádní podezřelí. Zkontroluj, že `vysetruje` v `DetailIncidentu.tsx` je pro `category === "pozitivni"` nepravdivé — jestli není, oprav to.

Dotčeného hráče (`subjectPlayerId`) zobraz stejně jako u životních situací, jménem a klikatelně.

- [ ] **Step 2: Admin**

`POST /api/admin/incidents/force` musí umět i osm nových kindů. Jsou v `KATALOG`, takže projdou stávající větví — ověř to a dolož v reportu.

⚠️ `apps/api/src/routes/incidents.test.ts:48` porovnává celý objekt `akce` přes `toEqual`. Jestli se změnil, doplň ho tam.

- [ ] **Step 3: Spec**

Do Části 4d zapiš, co se od tabulky liší: `mechanik_dodavka` přibyl mezi implementované, `omluvny_dopis` už na nic nečeká, kladné varianty `Ztrata` (`oprava`, `vybaveni_nahoru`, `dar`), typ transakce `incident_gift`, `ClubEventKind` `hrdina_v_kadru`, a že pozitivní incident má vlastní denní los mimo pool problémů. Z Části 16 vyškrtni, že pozitivní katalog čeká na fázi 11.

- [ ] **Step 4: Typecheck a build**

Run: `cd apps/api && npx vitest run && npx tsc --noEmit`, pak `cd ../web && npx tsc --noEmit && npx next build --no-lint`

- [ ] **Step 5: Commit**

```bash
git commit -F - <<'EOF'
feat(incidenty): pozitivni incidenty na strance a ve specu

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 7: Nasazení na testing a ověření (controller)

- [ ] Celá sada, oba typechecky, build webu
- [ ] `git push origin testing`, počkat na zelené CI
- [ ] Na testovacím klubu projít přes admin `force` všech osm kindů a u každého ověřit skutečný dopad: opravená škoda, stav dodávky, úroveň dresů, připsané peníze v transakcích, reputace, přízeň obce, morálka kádru
- [ ] Ověřit, že se pozitivní incident na stránce netváří jako průšvih
- [ ] Uklidit testovací data
- [ ] Doplnit do `project_prod_deploy_pending.md`

✋ **STOP.** Na produkci nic bez výslovného „nasaď na main".
