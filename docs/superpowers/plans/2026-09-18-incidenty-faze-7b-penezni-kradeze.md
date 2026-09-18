# Incidenty fáze 7b — Peněžní krádeže

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Klubu se dají ukrást peníze: kasa s občerstvením, tombola, zpronevěra od ekonoma a útěk zadluženého hráče s hotovostí. Policie část hotovosti vrací, pachatel v hospodě platí rundy.

**Architecture:** Nová varianta ztráty `{ typ: "penize" }` v `Ztrata`, kterou umí zapsat `provedZtratu` (odepíše peníze transakcí `incident_loss`), ocenit `hodnotaSkody` a vrátit policejní `vratZtraty`. Kasa a tombola jsou spouštěné katalogové položky nad včerejším domácím zápasem, zpronevěra je katalogová položka nad najatým ekonomem, útěk s penězi je samostatný krok denního běhu nad běžící situací `dluhy`. V hospodě přibývá příhoda `utraci_za_rundy`.

**Tech Stack:** Hono + D1 na Cloudflare Workers (`apps/api`), Next.js 15 (`apps/web`), Vitest, wrangler.

**Spec:** `docs/superpowers/specs/2026-09-16-incidenty-design.md` (Části 4a, 4e, 5a, 7c, 7d, 9, 13, 14, 16 bod 7b)

## Global Constraints

- Větev `testing`. **Nikdy** push ani merge na `main`.
- Migrace v této fázi **žádná** — peněžní ztráty se vejdou do `club_incidents.loss` (TEXT s JSON polem).
- Žádný prázdný catch. Server `logger.warn({ module: "…" }, "popis", e)` nebo `logger.error`, klient `console.error("popis:", e)`.
- Texty pro hráče česky, **nikdy dlouhá pomlčka „—"**, jméno hráče jen v 1. pádě jako podmět nebo za dvojtečkou, věta končí `.` nebo `!`.
- UI: minimum `text-sm`, jména `text-base` a klikatelná, cena nikdy v tlačítku, mobil od 400 px, žádné `confirm`/`alert`, do tabulek nepřidávat sloupce.
- Determinismus: každý los z `createRng(seedFromString("…|id"))`, nikdy `Math.random`.
- Idempotence: zápisy `INSERT OR IGNORE` s odvozeným id, změny stavu hlídaným `UPDATE … WHERE status = …` a kontrolou `meta.changes`.
- Denní krok musí snést dvojí spuštění téhož herního dne a selhání jednoho klubu nesmí shodit ostatní.
- Hospodský deník (`GET /teams/:id/pub-sessions`) čte kdokoli — nesmí pojmenovat neodhaleného pachatele.
- Commit po každém tasku, trailer `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`. Nikdy `git add -A`, nikdy `git stash`.
- Po každém tasku `cd apps/api && npx vitest run && npx tsc --noEmit`. Sada je na začátku fáze zelená (1650 testů) — cokoli červeného je tvoje.

---

## Odchylky od specu (zapsat do specu v Tasku 9)

| Místo ve specu | Plán | Proč |
|---|---|---|
| 3, typ `Ztrata` | varianta `{ typ: "hrac_odesel"; playerId; castka }` se **nezavádí**; útěk s penězi zapisuje jen `{ typ: "penize", castka }` a hráče nese `culprit_player_id` incidentu | řetězec `hrac_odesel` už znamená něco jiného (`resolution` u ukončené situace, `situace-db.ts`), a `castka` by se počítala dvakrát |
| 7f | nový typ transakce jen `incident_loss`; `incident_gift` **nepřibývá** | dary jsou pozitivní katalog, ten je až fáze 11 |
| 4d `omluvny_dopis` | **nepatří do 7b** | je to pozitivní incident, ty řeší fáze 11; `utek_s_penezi` po sobě nechá data, ze kterých dopis později vyjde |
| 7c policie | zpronevěra ekonoma **nejde k policii** a nemá tresty: peníze zmizí, ekonom odejde a incident se rovnou uzavře | `culpritType: "zamestnanec"` dnes neumí ani `vysledekPolicie`, ani `dostupneAkce`; rozšiřovat obě kvůli jedné položce je větší zásah než uzavřít incident hned |
| 4a `kasa_obcerstveni`, `tombola` | spouštěné (`spousteny: true`) s vlastní šancí, ne losované vahou | spec 4e je řadí mezi spouštěné („kasa, tombola" v tabulce četností) |
| 4a `utek_s_penezi` | není v `KATALOG`, ale samostatný krok denního běhu před losem incidentu | stojí na běžící situaci a na povinných varovných signálech, ne na jednom losu; a musí umět „jednou za sezónu" |
| 5a | `zpronevera_ekonoma` nepoužívá `vyberHrace` ani prahy váhy pachatele | pachatelem je zaměstnanec, ne hráč |

---

## Struktura souborů

| Soubor | Odpovědnost |
|---|---|
| `apps/api/src/incidents/typy.ts` | varianta `penize` v `Ztrata`, `StavKlubu` o včerejší tržby a útěk letos |
| `apps/api/src/incidents/nastaveni.ts` | šance a stropy peněžních krádeží |
| `apps/api/src/incidents/texty.ts` | texty kasy, tomboly, zpronevěry, útěku a rund |
| `apps/api/src/incidents/dopady.ts` | `provedZtratu` odepíše peníze transakcí `incident_loss` |
| `apps/api/src/incidents/tresty.ts` | `hodnotaSkody` ocení peněžní ztrátu |
| `apps/api/src/incidents/stav-klubu.ts` | včerejší tržby z kasy a tomboly, „už letos utekl" |
| `apps/api/src/incidents/katalog.ts` | `kasa_obcerstveni`, `tombola`, `zpronevera_ekonoma` |
| `apps/api/src/incidents/utek.ts` 🆕 | čistá pravidla útěku s penězi (podmínky, částka) |
| `apps/api/src/incidents/utek-db.ts` 🆕 | varovné signály z DB, odchod hráče, zápis incidentu |
| `apps/api/src/incidents/denni-krok.ts` | zařazení útěku před los incidentu |
| `apps/api/src/incidents/vysetrovani-den.ts` | policie vrací 50–100 % hotovosti |
| `apps/api/src/incidents/hospoda.ts` / `hospoda-db.ts` | příhoda `utraci_za_rundy` |
| `apps/api/src/season/finance-processor.ts` | typ transakce `incident_loss` |
| `apps/web/src/app/dashboard/finances/page.tsx` | popisek a ikona `incident_loss` |

---

### Task 1: Peněžní ztráta jako druh škody

**Files:**
- Modify: `apps/api/src/incidents/typy.ts`
- Modify: `apps/api/src/incidents/dopady.ts`
- Modify: `apps/api/src/incidents/tresty.ts`
- Modify: `apps/api/src/season/finance-processor.ts`
- Modify: `apps/web/src/app/dashboard/finances/page.tsx`
- Modify: `apps/api/src/incidents/nastaveni.ts`
- Test: `apps/api/src/incidents/dopady.test.ts`, `apps/api/src/incidents/tresty.test.ts`

**Interfaces:**
- Consumes: `recordTransaction` (`season/finance-processor.ts:134`), `Ztrata` (`incidents/typy.ts:11`)
- Produces:
  - `Ztrata` o `{ typ: "penize"; castka: number; zdrojZapasId?: string }`
  - `TransactionType` o `"incident_loss"`
  - konstanty `STROP_ZTRATY_PODIL`, `STROP_ZTRATY_KC`

- [ ] **Step 1: Failing test**

Do `apps/api/src/incidents/tresty.test.ts`:

```ts
describe("peněžní škoda (spec 3)", () => {
  it("hodnota peněžní ztráty je ukradená částka", () => {
    expect(hodnotaSkody([{ typ: "penize", castka: 4200 }])).toBe(4200);
  });

  it("sečte se s ostatními druhy škody", () => {
    const s = hodnotaSkody([{ typ: "penize", castka: 1000 }, { typ: "travnik", pred: 80, po: 60 }]);
    expect(s).toBeGreaterThan(1000);
  });
});
```

Do `apps/api/src/incidents/dopady.test.ts`:

```ts
describe("odepsání ukradených peněz (spec 4a)", () => {
  it("peněžní ztráta se zaúčtuje jako incident_loss v mínusu", async () => {
    const db = new FalesnaD1([{ sql: /FROM teams/, first: { budget: 50000 } }]);
    await zapisIncident(jakoD1(db), stavKlubu(), {
      kind: "kasa_obcerstveni", category: "kradez", status: "otevreny", severity: 2,
      culpritType: "cizi", culpritPlayerId: null, culpritRevealed: false,
      ztraty: [{ typ: "penize", castka: 3000 }], text: "Kasa je prázdná.",
    });
    expect(db.pocet(/INSERT INTO transactions/)).toBe(1);
  });
});
```

- [ ] **Step 2: Spustit, musí selhat**

Run: `cd apps/api && npx vitest run src/incidents/tresty.test.ts src/incidents/dopady.test.ts`
Expected: FAIL — `penize` není v typu.

- [ ] **Step 3: Typ a konstanty**

Do `apps/api/src/incidents/typy.ts` na konec unie `Ztrata`:

```ts
  /** Ukradená hotovost (spec 4a). `zdrojZapasId` u kasy a tomboly říká, ze kterého zápasu tržba byla. */
  | { typ: "penize"; castka: number; zdrojZapasId?: string };
```

Do `apps/api/src/incidents/nastaveni.ts` k ostatním konstantám incidentů:

```ts
/** Strop peněžní ztráty: nikdy víc než desetina rozpočtu (spec 4e). */
export const STROP_ZTRATY_PODIL = 0.1;
/** A nikdy víc než tolik korun, ať velký klub nepřijde o všechno naráz. */
export const STROP_ZTRATY_KC = 40000;
```

- [ ] **Step 4: Ocenění škody**

V `apps/api/src/incidents/tresty.ts` do `switch` ve `hodnotaSkody` před `default`:

```ts
    case "penize": return z.castka;
```

(`default` s `const nezname: never = z` zůstává — právě ten tě sem dovedl.)

- [ ] **Step 5: Odepsání peněz**

V `apps/api/src/incidents/dopady.ts` ve `provedZtratu` přidej větev. Peníze se odepisují transakcí, ne přímým zápisem do `teams.budget`:

```ts
    case "penize": {
      if (z.castka <= 0) return null;
      const { recordTransaction } = await import("../season/finance-processor");
      await recordTransaction(db, stav.teamId, "incident_loss", -z.castka, `Ukradená hotovost: ${nazev}`, stav.gameDate, `ztrata-${id}`)
        .catch((e) => { logger.error({ module: M }, `odepsání ukradené hotovosti ${id}`, e); });
      return z;
    }
```

Podívej se, jak sousední větve pracují s `nazev` a `id`, a drž se téhož; když ti chybí, protáhni je stejnou cestou jako u `stadion`.

- [ ] **Step 6: Typ transakce**

Do `TransactionType` v `apps/api/src/season/finance-processor.ts` k ostatním `incident_*`:

```ts
  // Hotovost, kterou klubu někdo ukradl (kasa, tombola, zpronevěra, útěk hráče). Čistá ztráta,
  // ne nákup — nesmí být v PURCHASE_TYPES, jinak by ji záporný rozpočet zablokoval.
  | "incident_loss"
```

Do `apps/web/src/app/dashboard/finances/page.tsx` do obou map vedle `incident_fine`: ikona `"💸"` a popisek `"Ukradená hotovost"`.

⚠️ `apps/api/src/season/transaction-labels.test.ts` hlídá, že každý typ má popisek i ikonu. Když ho nedoplníš do obou map, spadne.

- [ ] **Step 7: Testy a typecheck**

Run: `cd apps/api && npx vitest run && npx tsc --noEmit`, pak `cd ../web && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/incidents/typy.ts apps/api/src/incidents/nastaveni.ts apps/api/src/incidents/dopady.ts apps/api/src/incidents/tresty.ts apps/api/src/incidents/dopady.test.ts apps/api/src/incidents/tresty.test.ts apps/api/src/season/finance-processor.ts apps/web/src/app/dashboard/finances/page.tsx
git commit -F - <<'EOF'
feat(incidenty): penezni ztrata jako druh skody

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 2: Stav klubu ví o včerejší tržbě a o letošním útěku

**Files:**
- Modify: `apps/api/src/incidents/typy.ts`
- Modify: `apps/api/src/incidents/stav-klubu.ts`
- Modify: `apps/api/src/incidents/testovaci-stav.ts`
- Test: `apps/api/src/incidents/stav-klubu.test.ts`

**Interfaces:**
- Consumes: `nactiStavKlubu` a jeho jediná dávka dotazů (`stav-klubu.ts`), transakce `concession_income_self` / `raffle_income` (`finance-processor.ts:489,526`, `reference_id` = id zápasu)
- Produces: `StavKlubu.vcera` o `trzby: { kasa: number; tombola: number }`, `StavKlubu.utekLetos: boolean`

- [ ] **Step 1: Failing test**

Do `apps/api/src/incidents/stav-klubu.test.ts`:

```ts
describe("včerejší tržby a letošní útěk (spec 4a)", () => {
  it("načte kasu i tombolu ze včerejšího domácího zápasu", async () => {
    const db = new FalesnaD1([
      { sql: /FROM matches m JOIN season_calendar/, first: { id: "m1", home_team_id: "t1", home_score: 2, away_score: 1 } },
      { sql: /type IN \('concession_income_self', 'raffle_income'\)/, all: [
        { type: "concession_income_self", castka: 4000 },
        { type: "raffle_income", castka: 1500 },
      ] },
      { sql: /kind = 'utek_s_penezi'/, first: null },
    ]);
    const s = await nactiStavKlubu(jakoD1(db), tym(), "2026-09-18", 4);
    expect(s?.vcera?.trzby).toEqual({ kasa: 4000, tombola: 1500 });
    expect(s?.utekLetos).toBe(false);
  });

  it("bez včerejšího zápasu jsou tržby nulové", async () => {
    const db = new FalesnaD1([{ sql: /FROM matches m JOIN season_calendar/, first: null }]);
    const s = await nactiStavKlubu(jakoD1(db), tym(), "2026-09-18", 4);
    expect(s?.vcera).toBeNull();
  });
});
```

(`tym()` si vezmi z existujících testů v tomtéž souboru; pokud tam takový helper není, použij stejný objekt týmu jako sousední test.)

- [ ] **Step 2: Spustit, musí selhat**

Run: `cd apps/api && npx vitest run src/incidents/stav-klubu.test.ts`
Expected: FAIL.

- [ ] **Step 3: Typy**

V `apps/api/src/incidents/typy.ts` k `StavKlubu`:

```ts
  /** Jestli tomuhle klubu letos už jednou utekl hráč s penězi (spec 4a, max. 1× za sezónu). */
  utekLetos: boolean;
```

a k typu `vcera`:

```ts
  /** Kolik včerejší domácí zápas vydělal na občerstvení a na tombole. Bez zápasu nula. */
  trzby: { kasa: number; tombola: number };
```

- [ ] **Step 4: Dotazy**

Do jediné dávky v `nactiStavKlubu` přidej dva dotazy. Tržby se vážou na id včerejšího zápasu, jenže to v době sestavování dávky ještě neznáš — proto ber podle herního dne, `game_date` u obou transakcí je den zápasu:

```ts
    db.prepare(
      `SELECT type, SUM(amount) AS castka FROM transactions
        WHERE team_id = ? AND game_date = ? AND type IN ('concession_income_self', 'raffle_income')
        GROUP BY type`,
    ).bind(teamId, vcera),
    db.prepare(
      "SELECT 1 AS je FROM club_incidents WHERE team_id = ? AND season_number = ? AND kind = 'utek_s_penezi' LIMIT 1",
    ).bind(teamId, seasonNumber),
```

Destrukturalizaci výsledků dávky rozšiř ve **stejném pořadí**, v jakém dotazy stojí v poli — prohozená dvojice tady tiše nasype do stavu cizí čísla.

Sestavení:

```ts
  const trzby = { kasa: 0, tombola: 0 };
  for (const r of trzbyRes.results as Array<{ type: string; castka: number }>) {
    if (r.type === "concession_income_self") trzby.kasa = Math.max(0, r.castka ?? 0);
    if (r.type === "raffle_income") trzby.tombola = Math.max(0, r.castka ?? 0);
  }
```

`trzby` patří dovnitř objektu `vcera` (a když `vcera` vyjde `null`, nikam). `utekLetos: !!utekRes.first`.

- [ ] **Step 5: Fixtura**

V `apps/api/src/incidents/testovaci-stav.ts` doplň `utekLetos: false` a do `vcera` (kde je) `trzby: { kasa: 0, tombola: 0 }`, ať existující testy projdou beze změny.

- [ ] **Step 6: Testy a typecheck**

Run: `cd apps/api && npx vitest run && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/incidents/typy.ts apps/api/src/incidents/stav-klubu.ts apps/api/src/incidents/testovaci-stav.ts apps/api/src/incidents/stav-klubu.test.ts
git commit -F - <<'EOF'
feat(incidenty): stav klubu vi o vcerejsi trzbe a letosnim uteku

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 3: Kasa a tombola

**Files:**
- Modify: `apps/api/src/incidents/katalog.ts`
- Modify: `apps/api/src/incidents/nastaveni.ts`
- Modify: `apps/api/src/incidents/texty.ts`
- Test: `apps/api/src/incidents/katalog.test.ts`, `apps/api/src/incidents/texty.test.ts`

**Interfaces:**
- Consumes: `StavKlubu.vcera.trzby` (Task 2), `Ztrata` varianta `penize` (Task 1), `pokusOKradez` (`katalog.ts`), `SANCE_SPOUSTENYCH` (`nastaveni.ts:16`)
- Produces: katalogové položky `kasa_obcerstveni` a `tombola`

- [ ] **Step 1: Failing testy**

Do `apps/api/src/incidents/katalog.test.ts`:

```ts
describe("peněžní krádeže ze zápasu (spec 4a)", () => {
  const sVcerejskem = (kasa: number, tombola: number) =>
    stavKlubu({ vcera: { vyhra: true, zapasId: "m1", trzby: { kasa, tombola } } as never });

  it("bez včerejší tržby se kasa nekrade", () => {
    expect(def("kasa_obcerstveni").muze(sVcerejskem(0, 0))).toBe(false);
  });

  it("z kasy zmizí 20 až 50 procent skutečné tržby", () => {
    const castky: number[] = [];
    proSeedy((rng) => {
      const n = def("kasa_obcerstveni").vytvor(sVcerejskem(10000, 0), rng);
      const z = n?.ztraty[0];
      if (z && z.typ === "penize") castky.push(z.castka);
    }, 300);
    expect(castky.length).toBeGreaterThan(0);
    expect(Math.min(...castky)).toBeGreaterThanOrEqual(2000);
    expect(Math.max(...castky)).toBeLessThanOrEqual(5000);
  });

  it("z tomboly zmizí 30 až 100 procent a nese id zápasu", () => {
    const castky: number[] = [];
    proSeedy((rng) => {
      const n = def("tombola").vytvor(sVcerejskem(0, 2000), rng);
      const z = n?.ztraty[0];
      if (z && z.typ === "penize") { castky.push(z.castka); expect(z.zdrojZapasId).toBe("m1"); }
    }, 300);
    expect(Math.min(...castky)).toBeGreaterThanOrEqual(600);
    expect(Math.max(...castky)).toBeLessThanOrEqual(2000);
  });

  it("obě jsou spouštěné a nelosují se vahou", () => {
    for (const k of ["kasa_obcerstveni", "tombola"]) {
      expect(def(k).spousteny).toBe(true);
      expect(def(k).vaha).toBe(0);
    }
  });
});
```

- [ ] **Step 2: Spustit, musí selhat**

Run: `cd apps/api && npx vitest run src/incidents/katalog.test.ts`
Expected: FAIL.

- [ ] **Step 3: Konstanty a texty**

Do `nastaveni.ts` k `SANCE_SPOUSTENYCH` přidej `kasa_obcerstveni: 0.25` a `tombola: 0.25`, a vedle:

```ts
/** Kolik procent skutečné tržby zmizí z kasy s občerstvením (spec 4a). */
export const KASA_PODIL_MIN = 20;
export const KASA_PODIL_MAX = 50;
/** Tombola je v kase bokem, sebere se jí klidně celá (spec 4a). */
export const TOMBOLA_PODIL_MIN = 30;
export const TOMBOLA_PODIL_MAX = 100;
```

Do `texty.ts` klíče `kasa_obcerstveni` a `tombola`, každý 4 varianty. Značka `{castka}` nese už naformátovanou částku. Příklad tónu, ne doslovné znění:

```ts
  kasa_obcerstveni: [
    "Po zápase někdo vybral kasu u občerstvení. Chybí {castka} Kč.",
    "Kasa od stánku je prázdná. Z včerejší tržby chybí {castka} Kč.",
  ],
```

Jméno hráče do těchto textů nedávej — pachatel se v téhle chvíli neví.

- [ ] **Step 4: Katalogové položky**

Do `KATALOG` v `katalog.ts`. Pachatel se hledá stejně jako u ostatních krádeží přes `pokusOKradez` (kandidát z kádru, jinak pokus zvenku, alarm může vyplašit); u kasy má navíc šanci najatá obsluha, ale **tu neřeš** — ta patří k zaměstnancům a spec ji váže na `kasa_obcerstveni` až spolu se zpronevěrou. Pro tuhle fázi stačí `pokusOKradez` jako u skladu.

```ts
  {
    kind: "kasa_obcerstveni", label: "Vybraná kasa", emoji: "🧾", category: "kradez", vaha: 0, spousteny: true,
    muze: (s) => (s.vcera?.trzby.kasa ?? 0) > 0,
    vytvor: (s, rng) => {
      const trzba = s.vcera?.trzby.kasa ?? 0;
      if (trzba <= 0) return null;
      const kdo = pokusOKradez(s, rng, 2);
      if (!kdo) return null;
      if (kdo.typ === "alarm") return alarmNavrh(rng);
      const castka = castkaZTrzby(s, rng, trzba, KASA_PODIL_MIN, KASA_PODIL_MAX);
      if (castka <= 0) return null;
      return {
        kind: "kasa_obcerstveni", category: "kradez", status: "otevreny", severity: 2,
        culpritType: kdo.typ === "hrac" ? "hrac" : "cizi", culpritPlayerId: kdo.typ === "hrac" ? kdo.hrac.id : null,
        culpritRevealed: false,
        ztraty: [{ typ: "penize", castka, zdrojZapasId: s.vcera?.zapasId }],
        text: text(rng, "kasa_obcerstveni", { castka: castka.toLocaleString("cs-CZ") }),
      };
    },
  },
```

`tombola` je totéž s `TOMBOLA_PODIL_*`, textem `tombola`, emoji `🎟️` a labelem `"Okradená tombola"`.

Pomocná funkce vedle ostatních helperů v témže souboru:

```ts
/** Kolik hotovosti zmizí: podíl z tržby, ale nikdy přes strop ztráty (spec 4e). */
function castkaZTrzby(s: StavKlubu, rng: Rng, trzba: number, min: number, max: number): number {
  const hrube = Math.round((trzba * rng.int(min, max)) / 100);
  const strop = Math.min(Math.round(s.rozpocet * STROP_ZTRATY_PODIL), STROP_ZTRATY_KC);
  return Math.max(0, Math.min(hrube, strop));
}
```

Pozor na pořadí losů: `pokusOKradez` losuje první, teprve pak se losuje částka. Když to prohodíš, změní se všechny dosavadní seedy.

- [ ] **Step 5: Testy a typecheck**

Run: `cd apps/api && npx vitest run && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/incidents/katalog.ts apps/api/src/incidents/nastaveni.ts apps/api/src/incidents/texty.ts apps/api/src/incidents/katalog.test.ts
git commit -F - <<'EOF'
feat(incidenty): kradez kasy a tomboly po domacim zapase

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 4: Zpronevěra ekonoma

**Files:**
- Modify: `apps/api/src/incidents/typy.ts`
- Modify: `apps/api/src/incidents/stav-klubu.ts`
- Modify: `apps/api/src/incidents/katalog.ts`
- Modify: `apps/api/src/incidents/dopady.ts`
- Modify: `apps/api/src/incidents/nastaveni.ts`
- Modify: `apps/api/src/incidents/texty.ts`
- Test: `apps/api/src/incidents/katalog.test.ts`, `apps/api/src/incidents/dopady.test.ts`

**Interfaces:**
- Consumes: `staff_members` (role `ekonom`, sloupec `judgement`), `StavKlubu`
- Produces: `StavKlubu.ekonom: { id: string; jmeno: string; judgement: number } | null`, katalogová položka `zpronevera_ekonoma`

- [ ] **Step 1: Failing testy**

Do `katalog.test.ts`:

```ts
describe("zpronevěra ekonoma (spec 4a)", () => {
  const sEkonomem = (judgement: number) =>
    stavKlubu({ ekonom: { id: "e1", jmeno: "Karel Počet", judgement }, rozpocet: 200000 });

  it("bez ekonoma se nezpronevěřuje", () => {
    expect(def("zpronevera_ekonoma").muze(stavKlubu({ ekonom: null }))).toBe(false);
  });

  it("ekonom se špatným úsudkem má větší váhu než pečlivý", () => {
    expect(def("zpronevera_ekonoma").vahaEkonoma?.(2)).toBeGreaterThan(def("zpronevera_ekonoma").vahaEkonoma?.(9) ?? 0);
  });

  it("částka je 3 000 až 15 000 a nejvýš 5 procent rozpočtu", () => {
    const castky: number[] = [];
    proSeedy((rng) => {
      const n = def("zpronevera_ekonoma").vytvor(sEkonomem(3), rng);
      const z = n?.ztraty[0];
      if (z && z.typ === "penize") castky.push(z.castka);
    }, 300);
    expect(Math.min(...castky)).toBeGreaterThanOrEqual(3000);
    expect(Math.max(...castky)).toBeLessThanOrEqual(10000);
  });

  it("pachatelem je zaměstnanec a incident je rovnou uzavřený", () => {
    const n = def("zpronevera_ekonoma").vytvor(sEkonomem(3), createRng(1));
    expect(n?.culpritType).toBe("zamestnanec");
    expect(n?.status).toBe("uzavreny");
  });
});
```

(Pokud se ti `vahaEkonoma` na definici nehodí, otestuj váhu přes vlastní exportovanou funkci — test uprav, ale tvrzení „horší úsudek = větší váha" nech.)

Do `dopady.test.ts`:

```ts
it("zpronevěra pošle ekonoma zpátky do okresu", async () => {
  const db = new FalesnaD1([{ sql: /FROM teams/, first: { budget: 200000 } }]);
  await zapisIncident(jakoD1(db), stavKlubu({ ekonom: { id: "e1", jmeno: "Karel Počet", judgement: 3 } }), {
    kind: "zpronevera_ekonoma", category: "kradez", status: "uzavreny", severity: 2,
    culpritType: "zamestnanec", culpritPlayerId: null, culpritRevealed: true,
    ztraty: [{ typ: "penize", castka: 5000 }], text: "Ekonom si nechal peníze.",
  });
  expect(db.pocet(/UPDATE staff_members SET team_id = NULL/)).toBe(1);
});
```

- [ ] **Step 2: Spustit, musí selhat**

Run: `cd apps/api && npx vitest run src/incidents/katalog.test.ts src/incidents/dopady.test.ts`
Expected: FAIL.

- [ ] **Step 3: Ekonom do stavu klubu**

Do `StavKlubu` v `typy.ts`:

```ts
  /** Najatý ekonom, kandidát na zpronevěru (spec 4a). `null`, když klub žádného nemá. */
  ekonom: { id: string; jmeno: string; judgement: number } | null;
```

Do dávky v `nactiStavKlubu`:

```ts
    db.prepare(
      "SELECT id, first_name, last_name, judgement FROM staff_members WHERE team_id = ? AND role = 'ekonom' LIMIT 1",
    ).bind(teamId),
```

Sestavení: `ekonom: r ? { id: r.id, jmeno: `${r.first_name} ${r.last_name}`, judgement: r.judgement ?? 5 } : null`. Fixturu v `testovaci-stav.ts` doplň o `ekonom: null`.

- [ ] **Step 4: Konstanty a texty**

```ts
/** Zpronevěra: kolik si ekonom nechá (spec 4a), nikdy přes pětinu dvacetiny rozpočtu. */
export const ZPRONEVERA_MIN_KC = 3000;
export const ZPRONEVERA_MAX_KC = 15000;
export const ZPRONEVERA_STROP_PODIL = 0.05;
/** Denní šance, že se zpronevěra provalí. Ekonom s dobrým úsudkem krade míň. */
export const SANCE_ZPRONEVERY = 0.02;
```

Text `zpronevera_ekonoma`, 4 varianty se značkami `{jmeno}` (ekonom, 1. pád jako podmět) a `{castka}`.

- [ ] **Step 5: Katalogová položka**

Spouštěná (`spousteny: true`, `vaha: 0`), do `SANCE_SPOUSTENYCH` přidej `zpronevera_ekonoma: SANCE_ZPRONEVERY`. `muze: (s) => !!s.ekonom`. Ve `vytvor`:

- váha podle úsudku: čím nižší `judgement`, tím pravděpodobnější. Realizuj jako druhý los uvnitř `vytvor`, ne jako `vaha` položky — `vaha` u spouštěných nic nedělá. Například `if (rng.random() >= (10 - judgement) / 20) return null;`.
- částka `Math.min(rng.int(ZPRONEVERA_MIN_KC, ZPRONEVERA_MAX_KC), Math.round(s.rozpocet * ZPRONEVERA_STROP_PODIL))`; když vyjde pod `ZPRONEVERA_MIN_KC`, vrať `null` — chudý klub nemá co zpronevěřit.
- `culpritType: "zamestnanec"`, `culpritPlayerId: null`, `culpritRevealed: true`, `status: "uzavreny"`, `resolution` nech na `zapisIncident` (uzavřený incident bez vyšetřování).

- [ ] **Step 6: Odchod ekonoma**

V `dopady.ts` ve `zapisIncident` za zápis ztrát: když `navrh.kind === "zpronevera_ekonoma"` a `stav.ekonom`, vrať ekonoma do okresního poolu **stejným SQL, jaké používá výpověď** v `apps/api/src/routes/staff.ts:196-211` (přečti si ho a zopakuj, včetně `listed_until`). Chyba se loguje, incident kvůli ní nepadá.

- [ ] **Step 7: Testy a typecheck**

Run: `cd apps/api && npx vitest run && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/incidents/typy.ts apps/api/src/incidents/stav-klubu.ts apps/api/src/incidents/katalog.ts apps/api/src/incidents/dopady.ts apps/api/src/incidents/nastaveni.ts apps/api/src/incidents/texty.ts apps/api/src/incidents/testovaci-stav.ts apps/api/src/incidents/katalog.test.ts apps/api/src/incidents/dopady.test.ts
git commit -F - <<'EOF'
feat(incidenty): zpronevera ekonoma

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 5: Útěk s penězi

**Files:**
- Create: `apps/api/src/incidents/utek.ts`
- Create: `apps/api/src/incidents/utek-db.ts`
- Modify: `apps/api/src/incidents/denni-krok.ts`
- Modify: `apps/api/src/transfers/remove-player.ts`
- Modify: `apps/api/src/incidents/nastaveni.ts`
- Modify: `apps/api/src/incidents/texty.ts`
- Test: `apps/api/src/incidents/utek.test.ts`, `apps/api/src/incidents/utek-db.test.ts`

**Interfaces:**
- Consumes: `StavKlubu.utekLetos` (Task 2), běžící situace `dluhy` (`club_incidents`), `pub_sessions.incidents` (JSON `[{type, playerIds, text}]`), `removePlayer` (`transfers/remove-player.ts:55`)
- Produces: `kandidatiUteku(stav, signaly)`, `castkaUteku(stav, rng)`, `zpracujUtek(env, stav)`; `LeaveType` o `"zmizel"`

- [ ] **Step 1: Failing testy**

Do `apps/api/src/incidents/utek.test.ts`:

```ts
describe("kdo může utéct s penězi (spec 4a)", () => {
  const signal = (o: Partial<SignalyUteku> = {}): SignalyUteku =>
    ({ dluhyOdeDne: "2026-09-01", zadalOZalohu: true, mluviloSeVHospode: true, ...o });

  it("bez dluhů nikdo neutíká", () => {
    expect(kandidatiUteku(stavKlubu({ rozpocet: 100000 }), new Map())).toEqual([]);
  });

  it("věrný hráč neutíká ani s dluhy", () => {
    const h = hrac({ id: "a", vernost: 80 });
    const s = stavKlubu({ kadr: [h], rozpocet: 100000 });
    expect(kandidatiUteku(s, new Map([["a", signal()]]))).toEqual([]);
  });

  it("chybějící varovný signál útěk zakáže", () => {
    const h = hrac({ id: "a", vernost: 20 });
    const s = stavKlubu({ kadr: [h], rozpocet: 100000 });
    expect(kandidatiUteku(s, new Map([["a", signal({ zadalOZalohu: false })]]))).toEqual([]);
    expect(kandidatiUteku(s, new Map([["a", signal({ mluviloSeVHospode: false })]]))).toEqual([]);
    expect(kandidatiUteku(s, new Map([["a", signal()]])).map((x) => x.id)).toEqual(["a"]);
  });

  it("chudý klub nikoho neláká", () => {
    const h = hrac({ id: "a", vernost: 20 });
    expect(kandidatiUteku(stavKlubu({ kadr: [h], rozpocet: 5000 }), new Map([["a", signal()]]))).toEqual([]);
  });

  it("částka je nejvýš desetina rozpočtu a nejvýš 40 000", () => {
    expect(castkaUteku(stavKlubu({ rozpocet: 100000 }), createRng(1))).toBeLessThanOrEqual(10000);
    expect(castkaUteku(stavKlubu({ rozpocet: 9000000 }), createRng(1))).toBeLessThanOrEqual(40000);
  });
});
```

Do `apps/api/src/incidents/utek-db.test.ts` test, že `zpracujUtek` při splnění všeho zapíše incident, odepíše peníze a zavolá odchod hráče, a že podruhé týž den neudělá nic (`INSERT OR IGNORE`, `meta.changes === 0`).

- [ ] **Step 2: Spustit, musí selhat**

Run: `cd apps/api && npx vitest run src/incidents/utek.test.ts`
Expected: FAIL.

- [ ] **Step 3: Konstanty a texty**

```ts
/** Útěk s penězi (spec 4a): kdo je ochotný a kdy se to vyplatí. */
export const UTEK_MAX_VERNOST = 50;
export const UTEK_MIN_ROZPOCET = 20000;
export const UTEK_PODIL = 0.1;
export const UTEK_STROP_KC = 40000;
/** Situace `dluhy` musí běžet aspoň tak dlouho, aby se to dalo číst jako varování. */
export const UTEK_MIN_DNI_DLUHU = 7;
/** Denní šance útěku u hráče, který splnil všechno. */
export const SANCE_UTEKU = 0.08;
/** Útěk s penězi klubu sebere reputaci. */
export const UTEK_REPUTACE = -2;
```

Texty `utek_s_penezi` (4 varianty, `{hrac}` jako podmět, `{castka}`) a `sms_utek` (co přijde trenérovi).

- [ ] **Step 4: Čistá pravidla (`utek.ts`)**

```ts
/**
 * Útěk s penězi (spec 4a). Čistá pravidla bez DB: kdo přichází v úvahu a kolik si vezme.
 *
 * Varovné signály jsou povinné všechny tři. Hráč nesmí zmizet bez toho, aby trenér měl
 * šanci si toho všimnout: dluhy běží aspoň týden, hráč si řekl o zálohu a v hospodě se
 * o něm mluvilo. Bez nich by to byl trest za nic.
 */
export interface SignalyUteku {
  /** Herní den, kdy situace `dluhy` začala. */
  dluhyOdeDne: string;
  zadalOZalohu: boolean;
  mluviloSeVHospode: boolean;
}
```

`kandidatiUteku(stav, signaly: ReadonlyMap<string, SignalyUteku>): HracKlubu[]` vrátí hráče, kteří mají všechny tři signály, `vernost < UTEK_MAX_VERNOST`, dluhy běží aspoň `UTEK_MIN_DNI_DLUHU` dní k `stav.den`, a klub má `rozpocet > UTEK_MIN_ROZPOCET`. Pořadí kádru neměň — los nad ním musí být stabilní.

`castkaUteku(stav, rng)` = `Math.min(Math.round(stav.rozpocet * UTEK_PODIL), UTEK_STROP_KC)`.

- [ ] **Step 5: Zápis a odchod (`utek-db.ts`)**

`nactiSignalyUteku(db, teamId, gameDate)` jednou dávkou:
- běžící situace `dluhy`: `SELECT subject_player_id, game_date FROM club_incidents WHERE team_id = ? AND kind = 'dluhy' AND category = 'zivotni' AND status = 'probiha'`
- kdo žádal o zálohu: tytéž řádky, `json_extract(resolution_data, '$.zaloha')` nebo prostá existence žádosti — přečti, jak to zapisuje `situace-db.ts`, a použij stejný klíč
- hospoda: `SELECT incidents FROM pub_sessions WHERE team_id = ? AND game_date >= ?` a v paměti projdi JSON, jestli je tam příhoda `pije_na_sekeru` s tím hráčem v `playerIds`

`zpracujUtek(env, stav)`:
1. `if (stav.utekLetos) return false;`
2. `const kandidati = kandidatiUteku(stav, await nactiSignalyUteku(...)); if (!kandidati.length) return false;`
3. deterministický los `createRng(seedFromString("utek|" + stav.teamId + "|" + stav.den))`, `if (rng.random() >= SANCE_UTEKU) return false;`
4. `const kdo = rng.pick(kandidati); const castka = castkaUteku(stav, rng);`
5. `zapisIncident(...)` s id `inc-{team}-utek_s_penezi-{den}`, `status: "uzavreny"`, `culpritType: "hrac"`, `culpritPlayerId: kdo.id`, `culpritRevealed: true`, `ztraty: [{ typ: "penize", castka }]`. Když `zapisIncident` vrátí `null` (už tam je), **skonči a hráče neodebírej** — jinak by dvojí běh téhož dne odebral hráče dvakrát.
6. teprve pak `removePlayer(db, kdo.id, "zmizel", { toFreeAgent: false, teamId: stav.teamId })`
7. reputace `UTEK_REPUTACE` přes `applyReputationDelta` se zdrojem `incident`, zápis do `club_events`, SMS trenérovi
8. vrať `true`

Každý krok má vlastní `.catch(logger.error)`, ale pořadí drž: incident je zámek, odchod hráče až po něm.

- [ ] **Step 6: `LeaveType`**

V `apps/api/src/transfers/remove-player.ts` rozšiř unii:

```ts
export type LeaveType = "released" | "retired" | "quit" | "transfer" | "zmizel";
```

`departed_players.leave_type` je volný text, migrace není potřeba.

- [ ] **Step 7: Denní krok**

V `denni-krok.ts` zavolej `zpracujUtek` **po** `zretezDluhy` a **před** `vyhodnotHrozici`, a když vrátí `true`, ukonči den stejně, jako to dělá splněná hrozba (žádný další los). Útěk je dost velká událost na to, aby byl jedinou zprávou dne.

- [ ] **Step 8: Testy a typecheck**

Run: `cd apps/api && npx vitest run && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/incidents/utek.ts apps/api/src/incidents/utek-db.ts apps/api/src/incidents/utek.test.ts apps/api/src/incidents/utek-db.test.ts apps/api/src/incidents/denni-krok.ts apps/api/src/incidents/nastaveni.ts apps/api/src/incidents/texty.ts apps/api/src/transfers/remove-player.ts
git commit -F - <<'EOF'
feat(incidenty): utek zadluzeneho hrace s penezi

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 6: Policie vrací hotovost

**Files:**
- Modify: `apps/api/src/incidents/vysetrovani-den.ts`
- Modify: `apps/api/src/incidents/texty.ts`
- Test: `apps/api/src/incidents/vysetrovani-den.test.ts`

**Interfaces:**
- Consumes: `vratZtraty` (`vysetrovani-den.ts:57-85`), `Ztrata` varianta `penize` (Task 1)
- Produces: peněžní větev ve `vratZtraty`

- [ ] **Step 1: Failing test**

```ts
it("u dopadeného cizího zloděje se vrátí 50 až 100 procent hotovosti", async () => {
  const castky: number[] = [];
  for (let seed = 1; seed <= 100; seed++) {
    const db = new FalesnaD1([
      { sql: /FROM club_incidents/, all: [radekIncidentu({ loss: JSON.stringify([{ typ: "penize", castka: 10000 }]), culprit_type: "cizi" })] },
    ]);
    await vyhodnotPolicii(env(db), den(seed));
    const t = db.dotazy.find((d) => /INSERT INTO transactions/.test(d.sql));
    if (t) castky.push(Number(t.args[3]));
  }
  expect(Math.min(...castky)).toBeGreaterThanOrEqual(5000);
  expect(Math.max(...castky)).toBeLessThanOrEqual(10000);
});
```

Tvar `radekIncidentu`/`den`/`env` si vezmi z existujících testů v tomtéž souboru; když tam nejsou, postav je podle toho, co `vyhodnotPolicii` čte.

- [ ] **Step 2: Spustit, musí selhat**

Run: `cd apps/api && npx vitest run src/incidents/vysetrovani-den.test.ts`
Expected: FAIL.

- [ ] **Step 3: Peněžní větev**

Ve `vratZtraty` dnes všechno, co není `vybaveni`, spadne do „rozbité se vrátit nedá, pachatel zaplatí polovinu až celou škodu" a sečte se do `nahrada`. Pro `penize` to shodou okolností dává správné číslo (`hodnotaSkody` vrátí `castka`, `rng.int(50, 100)` je přesně 50–100 %), ale **špatný text**: není to náhrada škody, jsou to vrácené peníze. Rozděl to:

```ts
    if (z.typ === "penize") {
      // Hotovost se najde u zloděje, ale zřídka celá. Není to náhrada škody, je to vrácený lup.
      vracenaHotovost += Math.round((z.castka * rng.int(50, 100)) / 100);
      continue;
    }
```

a pro `vracenaHotovost > 0` vlastní `recordTransaction(..., "incident_recovery", ..., \`Vrácená hotovost: ${nazev}\`, ..., \`nahrada-${inc.id}\`)` s vlastním textem `policie_hotovost`. Pozor: `reference_id` `nahrada-{id}` je jedno na incident — když by v jednom incidentu byly obě věci, druhá transakce by mu vzala referenci. V téhle fázi peněžní incidenty jinou ztrátu nemají, tak to nech, ale napiš k tomu komentář.

⚠️ Nepřehazuj pořadí losů uvnitř smyčky — `rng.int(50, 100)` se dnes volá pro každou nevybavenou ztrátu a seedy policejních výsledků na tom visí.

- [ ] **Step 4: Testy a typecheck**

Run: `cd apps/api && npx vitest run && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/incidents/vysetrovani-den.ts apps/api/src/incidents/texty.ts apps/api/src/incidents/vysetrovani-den.test.ts
git commit -F - <<'EOF'
feat(incidenty): policie vraci ukradenou hotovost

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 7: Pachatel platí rundy

**Files:**
- Modify: `apps/api/src/incidents/hospoda.ts`
- Modify: `apps/api/src/incidents/hospoda-db.ts`
- Modify: `apps/api/src/incidents/nastaveni.ts`
- Modify: `apps/api/src/incidents/texty.ts`
- Test: `apps/api/src/incidents/hospoda.test.ts`

**Interfaces:**
- Consumes: `KontextHospody.incidenty`, `pribehyHospody` (`hospoda.ts:210`)
- Produces: `TypPribehu` o `"utraci_za_rundy"`, `PENEZNI_KINDY`

- [ ] **Step 1: Failing testy**

```ts
describe("pachatel peněžního incidentu platí rundy (spec 9)", () => {
  it("odhalený pachatel krádeže peněz kupuje rundu", () => {
    const k = kontext({ incidenty: [{ id: "i1", kind: "kasa_obcerstveni", culpritPlayerId: SVEDEK.id, odhalen: true, den: "2026-09-17" } as never] });
    const r = pribehyHospody([host(SVEDEK)], k, JISTE);
    expect(r.pribehy.find((p) => p.type === "utraci_za_rundy")?.text).toContain("Pepa Kos");
  });

  it("neodhalený pachatel se rundami neprozradí", () => {
    const k = kontext({ incidenty: [{ id: "i1", kind: "kasa_obcerstveni", culpritPlayerId: SVEDEK.id, odhalen: false, den: "2026-09-17" } as never] });
    expect(pribehyHospody([host(SVEDEK)], k, JISTE).pribehy.filter((p) => p.type === "utraci_za_rundy")).toEqual([]);
  });

  it("u nepeněžního incidentu se rundy neplatí", () => {
    const k = kontext({ incidenty: [{ id: "i1", kind: "vloupani_sklad", culpritPlayerId: SVEDEK.id, odhalen: true, den: "2026-09-17" } as never] });
    expect(pribehyHospody([host(SVEDEK)], k, JISTE).pribehy.filter((p) => p.type === "utraci_za_rundy")).toEqual([]);
  });
});
```

Druhý test je ten důležitý: hospodský deník čte kdokoli, takže neodhalený pachatel se v něm objevit nesmí.

- [ ] **Step 2: Spustit, musí selhat**

Run: `cd apps/api && npx vitest run src/incidents/hospoda.test.ts`
Expected: FAIL.

- [ ] **Step 3: Příhoda**

`TypPribehu` i pole `TYPY_PRIBEHU` rozšiř o `"utraci_za_rundy"` (drž je v souladu, hlídá je jen tvoje oko). Konstanty:

```ts
/** Šance, že se pachatel peněžní krádeže v hospodě neudrží (spec 9). */
export const RUNDY_SANCE = 0.3;
/** Hospodský v kádru a trenér v hospodě to vidí líp. */
export const RUNDY_NASOBEK_SVEDKA = 2;
/** Kindy, u kterých pachatel drží v ruce hotovost. */
export const PENEZNI_KINDY = ["kasa_obcerstveni", "tombola", "utek_s_penezi"] as const;
```

Funkce `rundy(k, v, mistni, out)` postavená přesně jako `sekera` (iterace hostů, `zaznelo`, `los`, `vyjde`, jeden příběh za večer, `return`): najdi mezi `k.incidenty` **odhalený** peněžní incident s `culpritPlayerId` rovným hostovi, do 10 dnů. Efekty žádné, jen text a odkaz na incident. Zavolej ji v `pribehyHospody` vedle `sekera`.

Text `hospoda_rundy`, 5 variant, `{hrac}` jako podmět.

- [ ] **Step 4: Kontext**

Jestli `IncidentVHospode` ještě nenese, co potřebuješ (kind, pachatel, jestli je odhalený, den), dober to v **téže dávce** v `nactiKontextHospody` — nepřidávej druhý round trip.

- [ ] **Step 5: Testy a typecheck**

Run: `cd apps/api && npx vitest run && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/incidents/hospoda.ts apps/api/src/incidents/hospoda-db.ts apps/api/src/incidents/nastaveni.ts apps/api/src/incidents/texty.ts apps/api/src/incidents/hospoda.test.ts
git commit -F - <<'EOF'
feat(incidenty): pachatel penezni kradeze plati rundy

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 8: API, frontend a admin

**Files:**
- Modify: `apps/api/src/incidents/popis.ts`
- Modify: `apps/api/src/routes/incidents.ts`
- Modify: `apps/web/src/app/dashboard/incidenty/typy.ts`
- Modify: `apps/web/src/app/dashboard/incidenty/DetailIncidentu.tsx`
- Test: `apps/api/src/routes/incidents.test.ts`

**Interfaces:**
- Consumes: `nactiZtraty` (`popis.ts`), `verejnyIncident` (`routes/incidents.ts`)
- Produces: peněžní ztráta v popisu škody, admin `force` umí peněžní kindy

- [ ] **Step 1: Popis škody**

Kdekoli se `Ztrata[]` převádí na text pro hráče (`popis.ts`), doplň větev pro `penize`: „Hotovost: 4 200 Kč". Projdi všechna místa, která nad `Ztrata` větví — `tsc` ti je neukáže všude, protože ne každé má `never` strážce.

- [ ] **Step 2: Detail incidentu**

V `DetailIncidentu.tsx` se peněžní ztráta zobrazí v bloku škody jako částka. Cena nepatří do tlačítka, jen do informačního řádku.

- [ ] **Step 3: Admin**

`POST /api/admin/incidents/force` musí umět i `kasa_obcerstveni`, `tombola` a `zpronevera_ekonoma` (jsou v `KATALOG`, takže projdou stávající větví — ověř, že `muze` nezhatí test tím, že klub nemá včerejší tržbu; když ano, přidej do těla volitelné `castka`, které podmínku obejde, a napiš k tomu komentář, že je to jen pro testing).

Pro útěk přidej `POST /api/admin/incidents/utek` `{ teamId, playerId? }`, které obejde los i varovné signály a útěk provede. Bez něj se na testingu čeká na souběh tří podmínek.

- [ ] **Step 4: Test akcí**

⚠️ `apps/api/src/routes/incidents.test.ts:48` porovnává **celý** objekt `akce` přes `toEqual`. Pokud jsi do něj v téhle fázi cokoli přidal, doplň to tam. `toEqual` neměkči na `toMatchObject` — dvakrát už chytil skutečnou regresi.

- [ ] **Step 5: Typecheck a build**

Run: `cd apps/api && npx vitest run && npx tsc --noEmit`, pak `cd ../web && npx tsc --noEmit && npx next build --no-lint`
Expected: bez chyb.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/incidents/popis.ts apps/api/src/routes/incidents.ts apps/api/src/routes/incidents.test.ts apps/web/src/app/dashboard/incidenty/typy.ts apps/web/src/app/dashboard/incidenty/DetailIncidentu.tsx
git commit -F - <<'EOF'
feat(incidenty): penezni ztraty v API a na strance incidentu

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 9: Spec podle fáze 7b

**Files:**
- Modify: `docs/superpowers/specs/2026-09-16-incidenty-design.md`

- [ ] **Step 1: Odchylky**

Každý řádek z tabulky „Odchylky od specu" tohoto plánu zapiš na jeho místo: Část 3 (varianta `penize`, proč `hrac_odesel` nevzniká), 4a (kasa, tombola, zpronevěra, útěk), 4e (šance spouštěných a strop ztráty), 7c (zpronevěra nejde k policii; policie vrací hotovost vlastním textem), 7f (`incident_loss`), 9 (`utraci_za_rundy`), 13 (`incidents/utek.ts`, `incidents/utek-db.ts`), 14 (admin `POST /api/admin/incidents/utek`), 16 bod 7b jako hotový.

- [ ] **Step 2: Co zůstává**

Do Části 4d u `omluvny_dopis` poznámku, že stojí na `utek_s_penezi` z 7b a přijde s pozitivním katalogem ve fázi 11.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-09-16-incidenty-design.md
git commit -F - <<'EOF'
docs(incidenty): spec podle faze 7b penezni kradeze

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 10: Nasazení na testing a ověření (controller)

Tenhle task dělá controller. Migrace žádná.

- [ ] **Step 1: Celá sada a build**

```bash
cd apps/api && npx vitest run && npx tsc --noEmit
cd ../web && npx tsc --noEmit && npx next build --no-lint
```

- [ ] **Step 2: Push a CI**

`git push origin testing`, počkat na `conclusion: success`.

- [ ] **Step 3: Scénář (FK Duplex Břevnov, existující session, heslo nezadávat)**

1. **Kasa:** admin `force {kind: "kasa_obcerstveni"}` → incident `otevreny`, `loss` s `{typ:"penize"}`, transakce `incident_loss` v mínusu, rozpočet dole, karta a detail s částkou.
2. **Tombola:** totéž, `zdrojZapasId` odkazuje na včerejší zápas.
3. **Zpronevěra:** klubu najmout ekonoma, `force {kind: "zpronevera_ekonoma"}` → incident rovnou `uzavreny`, peníze pryč, ekonom zpátky v okresním poolu (`staff_members.team_id IS NULL`).
4. **Útěk:** hráči založit `dluhy` a posunout `game_date` situace o 8 dní zpět, `force` zálohu odmítnout, vyrobit hospodskou příhodu `pije_na_sekeru`, pak admin `POST /admin/incidents/utek` → hráč zmizel (`departed_players.leave_type = 'zmizel'`, není mezi volnými hráči), peníze pryč, reputace dolů, zpráva ve zpravodaji.
5. **Policie:** u incidentu s `cizi` pachatelem projít policejní tok → `incident_recovery` mezi 50 a 100 % ukradené částky.
6. **Rundy:** hospoda s odhaleným pachatelem peněžní krádeže → příhoda `utraci_za_rundy` v deníku; ověřit, že u **neodhaleného** pachatele v deníku není.
7. **Mobil 400 px:** detail peněžního incidentu bez přetečení.
8. **Úklid:** uzavřít testovací incidenty, vrátit ekonoma, vrátit rozpočet do původní výše.

- [ ] **Step 4: Paměť**

Do `project_prod_deploy_pending.md` sekci fáze 7b: co přibylo, že migrace není potřeba, co zůstalo neověřené.

✋ **STOP.** Na produkci nic bez výslovného „nasaď na main".

---

## Co zůstává na další fáze

| Téma | Co chybí |
|---|---|
| `omluvny_dopis` | pozitivní incident nad `utek_s_penezi` (fáze 11) |
| Tresty a policie u zaměstnance | `culpritType: "zamestnanec"` incidenty (kasa_obsluha, zpronevera_ekonoma) vznikají rovnou uzavřené, do vyšetřování se nedostanou - `vysledekPolicie` ani `dostupneAkce` pro ně proto žádnou větev nemají. Zatím záměr, ne mezera. |
