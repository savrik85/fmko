# Prales Ultras Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Po každém odehraném kole vyjde v Zpravodaji rubrika „Prales Ultras" — fan-voice článek hodnotící atmosféru ligy (kam přišlo nejvíc/nejmíň lidí, nejnabitější kotel) + galerie 2D „fotek" kotlů s reálným textem plachty.

**Architecture:** API (Hono Worker) po kole vygeneruje článek přes Gemini a metadata galerie, uloží do `news` (`type='ultras_report'`) + nové tabulky `ultras_reports`. Web vykreslí fotku on-the-fly přes `next/og` route `/kotel-foto` (deterministická URL, CDN cache). 3D kotel na serveru vyrenderovat nelze (`ssr:false`), proto 2D PNG.

**Tech Stack:** Hono + Cloudflare D1 (raw SQL, ne Drizzle) + Gemini 2.5 Flash (inline REST fetch) na backendu; Next.js 15 (App Router, edge runtime) + `next/og` (satori) na frontendu.

## Global Constraints

- **Branch: `testing` only.** Nikdy push/merge/deploy na `main` bez výslovného souhlasu.
- **UI výhradně česky** — žádná angličtina v textech ani popiscích.
- **Žádný prázdný catch.** Server: `logger.warn({ module: "ultras-report" }, "popis", e)` / `logger.error`. Client: `console.error`.
- **Zdroj pravdy = raw SQL migrace**, ne `packages/db` Drizzle (je zastaralý). Všechny PK jsou `TEXT` přes `crypto.randomUUID()`. Timestampy přes `strftime('%Y-%m-%dT%H:%M:%SZ','now')`.
- **Migrace aplikovat MANUÁLNĚ**, nejdřív `prales-db-test`, prod až po výslovném souhlasu: `npx wrangler d1 execute prales-db-test --remote --file <soubor>`.
- **D1 escaping:** vnější `'`, vnitřní `"`, nikdy backslash před `$`.
- **Verifikace = build + typecheck + curl + D1 query + MCP browser** (projekt nemá unit-test runner pro Workers; TDD cyklus tady znamená integrační ověření, ne Jest). Nikdy netvrdit „funguje" bez ověření.
- **Rubrika je per-liga za kolo** — jeden `ultras_report` na `(league_id, game_week)`, idempotentní.
- **Gemini:** model `gemini-2.5-flash`, inline `fetch` (vzor `ai-reporter.ts`), volný text, **první řádek = headline**. Nikdy nevymýšlet jména/čísla — jen dodaná data. Při selhání deterministický fallback text.

---

## Task 1: Migrace — tabulka `ultras_reports`

**Files:**
- Create: `apps/api/migrations/0119_ultras_reports.sql`

**Interfaces:**
- Produces: tabulka `ultras_reports(id, league_id, calendar_id, game_week, season_number, news_id, photos_json, created_at)` s `UNIQUE(league_id, game_week)`. Používá ji Task 2 (zápis), Task 4 (LEFT JOIN čtení galerie).

- [ ] **Step 1: Napsat migraci**

```sql
-- apps/api/migrations/0119_ultras_reports.sql
-- Rubrika "Prales Ultras": idempotence + metadata galerie fotek kotlů (per liga/kolo).
CREATE TABLE IF NOT EXISTS ultras_reports (
  id            TEXT PRIMARY KEY,
  league_id     TEXT NOT NULL,
  calendar_id   TEXT,
  game_week     INTEGER NOT NULL,
  season_number INTEGER NOT NULL DEFAULT 0,
  news_id       TEXT,
  photos_json   TEXT NOT NULL DEFAULT '[]',
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE(league_id, game_week)
);
CREATE INDEX IF NOT EXISTS idx_ultras_reports_news ON ultras_reports(news_id);
```

- [ ] **Step 2: Aplikovat na testovací DB**

Run: `cd /Users/savrik/Projects/fmko/apps/api && npx wrangler d1 execute prales-db-test --remote --file migrations/0119_ultras_reports.sql`
Expected: `Executed ... commands` bez chyby (nebo „table already exists" při re-run — OK).

- [ ] **Step 3: Ověřit existenci tabulky**

Run: `npx wrangler d1 execute prales-db-test --remote --json --command 'SELECT name FROM sqlite_master WHERE type="table" AND name="ultras_reports"'`
Expected: JSON s jedním řádkem `{"name":"ultras_reports"}`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/migrations/0119_ultras_reports.sql
git commit -m "feat(ultras): migrace tabulky ultras_reports (idempotence + galerie)"
```

---

## Task 2: Generátor `ultras-report.ts` + dev endpoint

**Files:**
- Create: `apps/api/src/news/ultras-report.ts`
- Modify: `apps/api/src/routes/game.ts` (přidat dev endpoint vedle `/admin/generate-round-summary` na ~ř. 6055)

**Interfaces:**
- Consumes: `calculateFacilityEffects` z `../stadium/stadium-generator`; D1 tabulky `matches`, `teams`, `stadiums`, `season_calendar`, `news`, `ultras_reports`.
- Produces: `export async function generateUltrasReport(db: D1Database, geminiApiKey: string, calendarId: string): Promise<{ newsId: string | null; photos: number; skipped: boolean }>`. Volá ji Task 3 (cron + run-matches) a tento dev endpoint. Zapisuje `photos_json` (pole `UltrasPhoto`) do `ultras_reports`.

- [ ] **Step 1: Zkopírovat přesné importy z `round-summary.ts`**

Otevři `apps/api/src/news/round-summary.ts` (prvních ~15 řádků) a zkopíruj přesný import `logger` a typ `D1Database` (jak ho projekt používá v signatuře). Použij je v novém souboru identicky (nehádej cestu).

- [ ] **Step 2: Napsat modul `ultras-report.ts`**

```ts
// apps/api/src/news/ultras-report.ts
// Rubrika "Prales Ultras" — fan-voice hodnocení atmosféry kola + výběr kotlů pro galerii fotek.
// Model: ai-reporter.ts (inline Gemini fetch, volný text, 1. řádek = headline).
import { logger } from "../logger"; // ⚠ nahraď přesným importem z round-summary.ts (Step 1)
import { calculateFacilityEffects } from "../stadium/stadium-generator";

export interface UltrasPhoto {
  teamId: string;
  teamName: string;
  ultrasText: string;
  bannerColor: string;
  textColor: string;
  level: number;
  attendance: number;
  capacity: number;
  fillPct: number;
  caption: string;
}

interface HomeMatch {
  homeTeamId: string;
  homeName: string;
  awayName: string;
  homeScore: number;
  awayScore: number;
  attendance: number;
  weather: string | null;
  capacity: number;
  fillPct: number;
  ultrasStand: number;
  ultrasText: string | null;
  bannerColor: string;
  textColor: string;
  primaryColor: string;
  secondaryColor: string;
}

const FACILITY_KEYS = ["changing_rooms", "showers", "refreshments", "stands", "parking", "fence", "roof", "ultras_stand", "toilets"];

function isLightHex(hex: string): boolean {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16) || 0;
  const g = parseInt(c.substring(2, 4), 16) || 0;
  const b = parseInt(c.substring(4, 6), 16) || 0;
  return (r * 299 + g * 587 + b * 114) / 1000 > 150;
}

/** "1240" -> "1 240" (bez Intl, který je na Workers omezený). */
function fmtNum(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** Vybere ≤3 kotle doprovázející žebříček (nejvyšší návštěva, nejnabitější kotel, výrazná plachta). */
function pickGallery(homeMatches: HomeMatch[]): UltrasPhoto[] {
  const cands = homeMatches.filter((m) => m.ultrasStand > 0);
  if (cands.length === 0) return [];
  const used = new Set<string>();
  const chosen: UltrasPhoto[] = [];
  const add = (m: HomeMatch | undefined, caption: string) => {
    if (!m || used.has(m.homeTeamId) || chosen.length >= 3) return;
    used.add(m.homeTeamId);
    chosen.push({
      teamId: m.homeTeamId,
      teamName: m.homeName,
      ultrasText: m.ultrasText ?? "",
      bannerColor: m.bannerColor,
      textColor: m.textColor,
      level: m.ultrasStand,
      attendance: m.attendance,
      capacity: m.capacity,
      fillPct: m.fillPct,
      caption,
    });
  };
  const byAtt = [...cands].sort((a, b) => b.attendance - a.attendance);
  add(byAtt[0], `${fmtNum(byAtt[0].attendance)} diváků — nejvíc v kole`);

  const byFill = [...cands].sort((a, b) => b.fillPct - a.fillPct).find((m) => !used.has(m.homeTeamId));
  add(byFill, byFill ? `kotel nabitý na ${byFill.fillPct} %` : "");

  const byLevel = [...cands]
    .sort((a, b) => b.ultrasStand - a.ultrasStand || (b.ultrasText ? 1 : 0) - (a.ultrasText ? 1 : 0))
    .find((m) => !used.has(m.homeTeamId));
  add(byLevel, byLevel ? (byLevel.ultrasStand >= 3 ? "největší kotel v lize" : byLevel.ultrasText ? `plachta „${byLevel.ultrasText}"` : "kotel v plné palbě") : "");

  return chosen;
}

/** Deterministický fallback text (když Gemini selže / chybí klíč). Rubrika vyjde vždy. */
function fallbackArticle(gameWeek: number, homeMatches: HomeMatch[]): string {
  if (homeMatches.length === 0) return `Kotel po ${gameWeek}. kole\nToto kolo se doma nehrálo, tak jsme si dali pauzu na pivo.`;
  const byAtt = [...homeMatches].sort((a, b) => b.attendance - a.attendance);
  const top = byAtt[0];
  const bottom = byAtt[byAtt.length - 1];
  const parts: string[] = [];
  parts.push(`Kotel hodnotí ${gameWeek}. kolo`);
  parts.push(`Nejvíc lidí dorazilo na **${top.homeName}** — ${fmtNum(top.attendance)} diváků. Naopak nejprázdněji bylo u **${bottom.homeName}** (${fmtNum(bottom.attendance)}).`);
  const byFill = [...homeMatches].sort((a, b) => b.fillPct - a.fillPct)[0];
  parts.push(`Nejnabitější stadion kola: **${byFill.homeName}** (${byFill.fillPct} % kapacity).`);
  return parts.join("\n");
}

export async function generateUltrasReport(
  db: D1Database,
  geminiApiKey: string,
  calendarId: string,
): Promise<{ newsId: string | null; photos: number; skipped: boolean }> {
  // 1. Odvodit league_id, game_week, season_number z kalendáře.
  const cal = await db
    .prepare("SELECT league_id, game_week, season_number FROM season_calendar WHERE id = ?")
    .bind(calendarId)
    .first<{ league_id: string; game_week: number; season_number: number }>();
  if (!cal) {
    logger.warn({ module: "ultras-report" }, `calendar not found: ${calendarId}`);
    return { newsId: null, photos: 0, skipped: true };
  }
  const { league_id: leagueId, game_week: gameWeek, season_number: seasonNumber } = cal;

  // 2. Idempotence — existuje už report pro tuto ligu+kolo?
  const existing = await db
    .prepare("SELECT 1 FROM ultras_reports WHERE league_id = ? AND game_week = ?")
    .bind(leagueId, gameWeek)
    .first();
  if (existing) return { newsId: null, photos: 0, skipped: true };

  // 3. Načíst domácí zápasy kola + stadion + barvy klubu.
  const rows = await db
    .prepare(
      `SELECT m.home_team_id, m.home_score, m.away_score, m.attendance, m.weather,
              t1.name AS home_name, t2.name AS away_name,
              t1.primary_color AS home_primary, t1.secondary_color AS home_secondary,
              s.capacity, s.changing_rooms, s.showers, s.refreshments, s.stands, s.parking, s.fence, s.roof, s.ultras_stand, s.toilets,
              s.ultras_text, s.ultras_banner_color, s.ultras_text_color
       FROM matches m
       JOIN teams t1 ON m.home_team_id = t1.id
       JOIN teams t2 ON m.away_team_id = t2.id
       LEFT JOIN stadiums s ON s.team_id = m.home_team_id
       WHERE m.calendar_id = ? AND m.status = 'simulated'`,
    )
    .bind(calendarId)
    .all();

  const homeMatches: HomeMatch[] = (rows.results as Record<string, unknown>[]).map((r) => {
    const facilities: Record<string, number> = {};
    for (const k of FACILITY_KEYS) facilities[k] = (r[k] as number) ?? 0;
    const capacity = Math.max(1, ((r.capacity as number) ?? 200) + calculateFacilityEffects(facilities).capacityBonus);
    const attendance = (r.attendance as number) ?? 0;
    const primary = (r.home_primary as string) ?? "#2D5F2D";
    const bannerColor = (r.ultras_banner_color as string | null) ?? primary;
    const textColor = (r.ultras_text_color as string | null) ?? (isLightHex(bannerColor) ? "#1a1a1a" : "#ffffff");
    return {
      homeTeamId: r.home_team_id as string,
      homeName: r.home_name as string,
      awayName: r.away_name as string,
      homeScore: (r.home_score as number) ?? 0,
      awayScore: (r.away_score as number) ?? 0,
      attendance,
      weather: (r.weather as string | null) ?? null,
      capacity,
      fillPct: Math.round((100 * attendance) / capacity),
      ultrasStand: (r.ultras_stand as number) ?? 0,
      ultrasText: (r.ultras_text as string | null) ?? null,
      bannerColor,
      textColor,
      primaryColor: primary,
      secondaryColor: (r.home_secondary as string) ?? "#ffffff",
    };
  });

  // 4. Galerie kotlů.
  const photos = pickGallery(homeMatches);

  // 5. Článek přes Gemini (fallback při selhání).
  let article = "";
  try {
    article = await callGeminiUltras(geminiApiKey, gameWeek, homeMatches, photos);
  } catch (e) {
    logger.warn({ module: "ultras-report" }, "gemini failed, using fallback", e);
  }
  if (!article || article.trim().length < 10) article = fallbackArticle(gameWeek, homeMatches);

  const lines = article.trim().split("\n");
  const headline = (lines.shift() ?? `Kotel hodnotí ${gameWeek}. kolo`).replace(/^#+\s*/, "").trim();
  const body = lines.join("\n").trim() || headline;

  // 6. Zápis news + ultras_reports.
  const newsId = crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO news (id, league_id, type, headline, body, game_week, created_at) VALUES (?, ?, 'ultras_report', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))",
    )
    .bind(newsId, leagueId, headline, body, gameWeek)
    .run();
  await db
    .prepare(
      "INSERT OR IGNORE INTO ultras_reports (id, league_id, calendar_id, game_week, season_number, news_id, photos_json) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(crypto.randomUUID(), leagueId, calendarId, gameWeek, seasonNumber ?? 0, newsId, JSON.stringify(photos))
    .run();

  return { newsId, photos: photos.length, skipped: false };
}

/** Inline Gemini REST volání (vzor ai-reporter.ts). Volný text, 1. řádek = headline. */
async function callGeminiUltras(
  apiKey: string,
  gameWeek: number,
  homeMatches: HomeMatch[],
  photos: UltrasPhoto[],
): Promise<string> {
  const facts = homeMatches
    .map((m) => `- ${m.homeName} (doma) vs ${m.awayName}: ${m.homeScore}:${m.awayScore}, návštěva ${m.attendance}/${m.capacity} (${m.fillPct} %), kotel level ${m.ultrasStand}${m.ultrasText ? `, plachta „${m.ultrasText}"` : ""}${m.weather ? `, počasí ${m.weather}` : ""}`)
    .join("\n");
  const galleryNote = photos.length
    ? `Na fotkách budou kotle: ${photos.map((p) => `${p.teamName} (${p.caption})`).join("; ")}.`
    : "V tomto kole neměl doma pořádný kotel nikdo — zmiň to s nadhledem.";

  const prompt = `Jsi pisatel fanouškovského zpravodaje "Prales Ultras" v amatérské fotbalové lize. Píšeš z pohledu lidí na kotli, zaujatě pro atmosféru, s vtipem a nadsázkou, ale VÝHRADNĚ z dodaných dat — NIKDY nevymýšlej jména ani čísla.

Napiš krátký článek (120–200 slov) hodnotící ATMOSFÉRU ${gameWeek}. kola. Páteří je žebříček:
- kam přišlo NEJVÍC lidí a kam NEJMÍŇ,
- který stadion byl nejvíc nabitý (fill %), který zel prázdnotou,
- zmiň prvky kotlů (plachta s nápisem, vlajky, buben) u týmů, co je mají.

DATA (jen tato smíš použít):
${facts}

${galleryNote}

Formát: PRVNÍ ŘÁDEK je úderný titulek (bez markdownu). Další řádky jsou tělo článku. V těle smíš zvýraznit **tučně** názvy týmů a klíčová čísla. Piš česky.`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 2048, temperature: 0.6 },
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!text) throw new Error("Gemini empty response");
  return text;
}
```

> ⚠ **Verify před buildem:** otevři `apps/api/src/news/ai-reporter.ts` ř. 377–387 a srovnej tvar Gemini fetch (URL, `generationConfig`, parsování `candidates[0].content.parts[0].text`). Pokud se liší (jiný model/parametr), sjednoť `callGeminiUltras` s ním.

- [ ] **Step 3: Přidat dev endpoint do `game.ts`**

Vlož vedle `POST /admin/generate-round-summary` (za blok na ~ř. 6064):

```ts
// POST /api/admin/generate-ultras-report?calendarId=X — dev trigger rubriky Prales Ultras
gameRouter.post("/admin/generate-ultras-report", async (c) => {
  const calendarId = c.req.query("calendarId");
  if (!calendarId) return c.json({ error: "calendarId query parameter required" }, 400);
  if (!c.env.GEMINI_API_KEY) return c.json({ error: "GEMINI_API_KEY není nastaven" }, 503);
  const { generateUltrasReport } = await import("../news/ultras-report");
  const result = await generateUltrasReport(c.env.DB, c.env.GEMINI_API_KEY, calendarId);
  return c.json({ ok: true, ...result });
});
```

- [ ] **Step 4: Typecheck + build**

Run: `cd /Users/savrik/Projects/fmko && npm run typecheck`
Expected: bez chyb v `apps/api`. Oprav případné type mismatch (hlavně `D1Database` import ze Step 1).

- [ ] **Step 5: Deploy na testing + ověřit generování**

Push na testing (viz `/ship-test`), počkej ~80 s na deploy. Najdi odehraný `calendar_id`:

Run: `npx wrangler d1 execute prales-db-test --remote --json --command 'SELECT id, league_id, game_week FROM season_calendar WHERE status="simulated" ORDER BY game_week DESC LIMIT 1'`

Zavolej dev endpoint (s admin/om_token dle zvyklostí projektu):
Run: `curl -s -X POST "https://api-test.prales.fun/api/admin/generate-ultras-report?calendarId=<ID>" | python3 -m json.tool`
Expected: `{"ok": true, "newsId": "...", "photos": N, "skipped": false}`.

- [ ] **Step 6: Ověřit data v D1**

Run: `npx wrangler d1 execute prales-db-test --remote --json --command 'SELECT type, headline, game_week FROM news WHERE type="ultras_report" ORDER BY created_at DESC LIMIT 1'`
Expected: řádek s `type=ultras_report` a smysluplným českým titulkem.
Run: `npx wrangler d1 execute prales-db-test --remote --json --command 'SELECT game_week, photos_json FROM ultras_reports ORDER BY created_at DESC LIMIT 1'`
Expected: `photos_json` = validní JSON pole (0–3 objekty s `teamName`, `ultrasText`, `caption`).

- [ ] **Step 7: Ověřit idempotenci**

Zavolej Step 5 curl znovu se stejným `calendarId`.
Expected: `{"ok": true, "newsId": null, "photos": 0, "skipped": true}` a v D1 stále jen JEDEN řádek pro dané `(league_id, game_week)`.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/news/ultras-report.ts apps/api/src/routes/game.ts
git commit -m "feat(ultras): generátor Prales Ultras + dev endpoint"
```

---

## Task 3: Napojení triggerů (cron + run-matches)

**Files:**
- Modify: `apps/api/src/index.ts` (post-round blok, vedle `generateAiRoundReport`, ~ř. 284–289)
- Modify: `apps/api/src/routes/game.ts` (`/game/run-matches`, vedle `generateAiRoundReport`, ~ř. 2692–2699)

**Interfaces:**
- Consumes: `generateUltrasReport(db, geminiApiKey, calendarId)` z Tasku 2.

- [ ] **Step 1: Cron trigger v `index.ts`**

Za blok `// AI zpravodajský článek (async, neblokuje)` (hned po `ctx.waitUntil(generateAiRoundReport(...))`, uvnitř `if (env.GEMINI_API_KEY) {`), přidej:

```ts
                // Prales Ultras — fan-voice hodnocení atmosféry + galerie kotlů (async, neblokuje)
                try {
                  const { generateUltrasReport } = await import("./news/ultras-report");
                  ctx.waitUntil(
                    generateUltrasReport(env.DB, env.GEMINI_API_KEY, matchCal.id as string)
                      .catch((e) => log("error", "Ultras report failed", e))
                  );
                } catch (e) { log("error", "Ultras reporter import failed", e); }
```

- [ ] **Step 2: run-matches trigger v `game.ts`**

Ve `POST /api/game/run-matches`, hned za blok volající `generateAiRoundReport` (uvnitř `if (c.env.GEMINI_API_KEY) {`, ~ř. 2699), přidej:

```ts
            try {
              const { generateUltrasReport } = await import("../news/ultras-report");
              await generateUltrasReport(c.env.DB, c.env.GEMINI_API_KEY, matchCal.id);
            } catch (e: any) {
              logger.warn({ module: "game" }, `ultras report error: ${e.message}`);
            }
```

- [ ] **Step 3: Typecheck + build**

Run: `cd /Users/savrik/Projects/fmko && npm run typecheck`
Expected: bez chyb.

- [ ] **Step 4: Deploy + ověřit přes run-matches**

Push na testing, počkej ~80 s. Odehraj kolo přes existující admin trigger (viz jak se volá `/api/game/run-matches` v projektu). Pak:
Run: `npx wrangler d1 execute prales-db-test --remote --json --command 'SELECT game_week, created_at FROM ultras_reports ORDER BY created_at DESC LIMIT 3'`
Expected: nový `ultras_reports` řádek pro právě odehrané kolo (bez ručního dev endpointu).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/index.ts apps/api/src/routes/game.ts
git commit -m "feat(ultras): trigger rubriky po kole (cron + run-matches)"
```

---

## Task 4: Čtecí endpointy — icon + galerie do news

**Files:**
- Modify: `apps/api/src/routes/game.ts` (`GET /teams/:teamId/news`: SELECT ~ř. 988, iconMap ~ř. 1013–1030, push ~ř. 1031–1039)
- Modify: `apps/api/src/routes/league.ts` (`GET /leagues/:leagueId/news`: SELECT ~ř. 338, iconMap ~ř. 341–346, map ~ř. 348–353)

**Interfaces:**
- Consumes: `ultras_reports.photos_json`, `ultras_reports.news_id` z Tasku 1/2.
- Produces: v API odpovědi u článků `type='ultras_report'` pole `photos: UltrasPhoto[]` a ikonu 🔥. Konzumuje Task 6 (FE).

- [ ] **Step 1: `game.ts` — LEFT JOIN + sloupec do `newsRows` SELECT (ř. 987–992)**

Nahraď `newsRows` dotaz (přidán alias `ur` a `ur.photos_json`):

```ts
    const newsRows = await c.env.DB.prepare(
      `SELECT n.id, n.type, n.headline, n.body, n.game_week, n.created_at, ur.photos_json FROM news n
       LEFT JOIN matches m ON n.match_id = m.id AND n.type = 'promotion'
       LEFT JOIN ultras_reports ur ON ur.news_id = n.id
       WHERE (n.league_id = ? OR n.team_id = ?)
         AND (n.type != 'promotion' OR COALESCE(m.status, 'upcoming') != 'simulated')
       ORDER BY n.created_at DESC LIMIT 20`
    ).bind(team.league_id, teamId).all().catch((e) => { logger.warn({ module: "game" }, "fetch news articles", e); return { results: [] }; });
```

> `pinnedRows` (ř. 997–1002) neměň — `ultras_report` do `season_opener/season_wrap` filtru nespadá, takže `n.photos_json` tam bude `undefined` (OK).

- [ ] **Step 2: `game.ts` — iconMap + push (ř. 1013–1039)**

Do `iconMap` (ř. 1013–1030) přidej řádek:

```ts
        ultras_report: "\u{1F525}",
```

V `articles.push({...})` (ř. 1031–1039) přidej za `gameWeek`:

```ts
        photos: n.photos_json ? JSON.parse(n.photos_json as string) : undefined,
```

- [ ] **Step 3: `league.ts` — alias + JOIN (ř. 337–339)**

Nahraď `newsRows` dotaz (přidán alias `n` + JOIN):

```ts
  const newsRows = await c.env.DB.prepare(
    "SELECT n.id, n.type, n.headline, n.body, n.game_week, n.created_at, ur.photos_json FROM news n LEFT JOIN ultras_reports ur ON ur.news_id = n.id WHERE n.league_id = ? ORDER BY n.created_at DESC LIMIT 30"
  ).bind(leagueId).all().catch((e) => { logger.error({ module: "league" }, "fetch league news", e); return { results: [] }; });
```

- [ ] **Step 4: `league.ts` — iconMap + map (ř. 341–353)**

Do `iconMap` (ř. 341–346) přidej `ultras_report: "\u{1F525}",`. V `.map((n) => ({...}))` (ř. 348–353) přidej za `gameWeek`:

```ts
    photos: n.photos_json ? JSON.parse(n.photos_json as string) : undefined,
```

- [ ] **Step 5: Typecheck + build**

Run: `cd /Users/savrik/Projects/fmko && npm run typecheck`
Expected: bez chyb (pole `photos` je navíc; oba pushe už používají `as any` / plain objekt, takže projde).

- [ ] **Step 6: Deploy + ověřit API**

Push na testing, počkej ~80 s. Zjisti `teamId` v lize, kde je `ultras_report`:
Run: `curl -s "https://api-test.prales.fun/api/teams/<TEAMID>/news" | python3 -c "import sys,json; a=[x for x in json.load(sys.stdin)['articles'] if x['type']=='ultras_report']; print(json.dumps(a[0] if a else {}, ensure_ascii=False, indent=2))"`
Expected: článek s `icon: "🔥"` a polem `photos` (0–3 objekty s `teamName`, `ultrasText`, `caption`).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/game.ts apps/api/src/routes/league.ts
git commit -m "feat(ultras): galerie + ikona do news read endpointů"
```

---

## Task 5: Image route `/kotel-foto` (next/og)

**Files:**
- Create: `apps/web/src/app/kotel-foto/route.tsx`

**Interfaces:**
- Consumes: query params `text, bg, fg, p, s, lvl, att, team, cap`.
- Produces: `GET /kotel-foto?...` → PNG 1200×630, `Cache-Control: public, max-age=86400, immutable`. Konzumuje Task 6 (`<img src>`).

- [ ] **Step 1: Napsat route handler**

```tsx
// apps/web/src/app/kotel-foto/route.tsx
// 2D "fotka" kotle pohledem ze hřiště — plachta s reálným textem, dav v barvách klubu.
// next/og (satori): jen CSS/flex, žádný canvas/WebGL. Deterministické z query paramů → CDN cache.
import { ImageResponse } from "next/og";

export const runtime = "edge";

function isLight(hex: string): boolean {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16) || 0;
  const g = parseInt(c.substring(2, 4), 16) || 0;
  const b = parseInt(c.substring(4, 6), 16) || 0;
  return (r * 299 + g * 587 + b * 114) / 1000 > 150;
}
function hex(v: string | null, fallback: string): string {
  return v && /^#[0-9A-Fa-f]{6}$/.test(v) ? v : fallback;
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const text = (q.get("text") ?? "").slice(0, 22).toUpperCase();
  const primary = hex(q.get("p"), "#2D5F2D");
  const secondary = hex(q.get("s"), "#ffffff");
  const bannerBg = hex(q.get("bg"), primary);
  const bannerFg = hex(q.get("fg"), isLight(bannerBg) ? "#1a1a1a" : "#ffffff");
  const lvl = Math.max(1, Math.min(3, parseInt(q.get("lvl") ?? "1", 10) || 1));
  const att = parseInt(q.get("att") ?? "0", 10) || 0;
  const team = (q.get("team") ?? "").slice(0, 40);
  const cap = (q.get("cap") ?? "").slice(0, 60);
  const flags = [0, 4, 6, 8][lvl];

  // Dav: deterministický počet teček dle levelu (stabilní URL → stabilní obrázek → cache).
  const dotCount = 60 + lvl * 40;
  const dots = Array.from({ length: dotCount }, (_, i) => (i % 3 === 0 ? secondary : primary));

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "linear-gradient(180deg, #1b2a4a 0%, #2f4a6b 45%, #0e1a2e 100%)", fontFamily: "system-ui, sans-serif" }}>
        {/* Kicker */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "24px 40px 8px", color: "rgba(255,255,255,0.6)", fontSize: 22, letterSpacing: 4, textTransform: "uppercase" }}>
          🔥 Prales Ultras
        </div>
        {/* Kotel: dav + vlajky + buben */}
        <div style={{ display: "flex", flex: 1, flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 40px" }}>
          <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
            {Array.from({ length: flags }, (_, i) => (
              <span key={i} style={{ fontSize: 40 }}>🚩</span>
            ))}
            {lvl >= 2 && <span style={{ fontSize: 40 }}>🥁</span>}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", width: 900, justifyContent: "center", gap: 8, marginBottom: 22 }}>
            {dots.map((c, i) => (
              <div key={i} style={{ width: 18, height: 18, borderRadius: 9, background: c, opacity: 0.55 + ((i * 7) % 5) * 0.09 }} />
            ))}
          </div>
          {/* Plachta */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 1000, minHeight: 130, background: bannerBg, borderRadius: 14, boxShadow: "0 16px 50px rgba(0,0,0,0.5)", padding: "18px 30px" }}>
            <div style={{ fontSize: text.length > 14 ? 58 : 78, fontWeight: 900, color: bannerFg, textAlign: "center", lineHeight: 1.05 }}>
              {text || team.toUpperCase()}
            </div>
          </div>
        </div>
        {/* Spodní lišta */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 40px 26px", background: "rgba(0,0,0,0.35)" }}>
          <div style={{ display: "flex", fontSize: 34, fontWeight: 800, color: "#fff" }}>{team}</div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <div style={{ display: "flex", fontSize: 40, fontWeight: 900, color: "#fff" }}>{att.toLocaleString("cs-CZ")} diváků</div>
            {cap && <div style={{ display: "flex", fontSize: 22, color: "rgba(255,255,255,0.7)" }}>{cap}</div>}
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, headers: { "Cache-Control": "public, max-age=86400, immutable" } },
  );
}
```

- [ ] **Step 2: Lokální build**

Run: `cd /Users/savrik/Projects/fmko/apps/web && npx next build --no-lint`
Expected: build projde, route `/kotel-foto` se objeví ve výpisu.

- [ ] **Step 3: Deploy + vizuální ověření diakritiky (KRITICKÉ)**

Push na testing, počkej ~80 s. Přes MCP browser otevři:
`https://test.prales.fun/kotel-foto?text=NIKDY%20NEP%C5%98ESTA%C5%88&p=%232D5F2D&s=%23ffffff&lvl=3&att=1240&team=Prachatice&cap=1%20240%20div%C3%A1k%C5%AF%20%E2%80%94%20nejv%C3%ADc%20v%20kole`
Screenshot. Expected: PNG s davem, vlajkami, bubnem a plachtou **„NIKDY NEPŘESTAŇ"** s korektními `Ř`/`Ě`/`Ň`.

- [ ] **Step 4: (Podmíněně) fallback font při rozbité diakritice**

Pokud Step 3 ukáže tofu/□ místo `ř/ě/ň`, přidej načtení fontu s Latin-Extended. Nahoře v handleru:

```ts
  const fontData = await fetch(
    "https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-ext-700-normal.ttf",
  ).then((r) => r.arrayBuffer());
```

a v options `ImageResponse` přidej:

```ts
    { width: 1200, height: 630, headers: { "Cache-Control": "public, max-age=86400, immutable" }, fonts: [{ name: "Inter", data: fontData, weight: 700, style: "normal" }] },
```

+ ve stylech změň `fontFamily` na `"Inter, system-ui, sans-serif"`. Znovu deploy + Step 3.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/kotel-foto/route.tsx
git commit -m "feat(ultras): next/og route /kotel-foto — 2D fotka kotle s plachtou"
```

---

## Task 6: Zobrazení rubriky v Zpravodaji

**Files:**
- Modify: `apps/web/src/app/dashboard/news/page.tsx` (Article interface ř. 31–38, exclusion list ř. 280–284, nová sekce u „Rozhovory kola" ř. 448+)

**Interfaces:**
- Consumes: článek `type='ultras_report'` s polem `photos: UltrasPhoto[]` z Tasku 4; route `/kotel-foto` z Tasku 5.

- [ ] **Step 1: Rozšířit `Article` interface (ř. 31–38)**

```tsx
interface UltrasPhoto {
  teamId: string;
  teamName: string;
  ultrasText: string;
  bannerColor: string;
  textColor: string;
  level: number;
  attendance: number;
  capacity: number;
  fillPct: number;
  caption: string;
}
interface Article {
  id: string;
  type: string;
  headline: string;
  body: string;
  icon: string;
  date: string;
  gameWeek?: number | null;
  photos?: UltrasPhoto[];
}
```

- [ ] **Step 2: Přidat `ultras_report` do exclusion listu (ř. 280–284)**

Do pole typů v `otherArticles.filter` přidej `"ultras_report"`:

```tsx
  const otherArticles = articles.filter(
    (a) => !["match", "round_results", "round_summary", "standing", "ai_report", "matchday_preview", "promotion", "transfer", "celebrity_arrival", "celebrity_signing", "interview", "player_interview", "ultras_report"].includes(a.type)
      && a.id !== leadStory?.id && a.id !== secondaryStory?.id,
  );
```

- [ ] **Step 3: Odvodit ultras článek kola (vedle `currentWeekInterviews`, ~ř. 254)**

```tsx
  const ultrasReport = articles.find((a) => a.type === "ultras_report") ?? null;
```

- [ ] **Step 4: Přidat sekci „Prales Ultras" (nad blok „Rozhovory kola", ~ř. 448)**

```tsx
          {/* ═══ Prales Ultras ═══ */}
          {ultrasReport && (
            <div id={`news-${ultrasReport.id}`} className="border-b border-gray-200 pb-5">
              <div className="flex items-center gap-2 mb-4 pb-2 border-b border-ink">
                <span className="text-base">🔥</span>
                <h3 className="font-heading font-[900] text-sm uppercase tracking-[0.15em]">Prales Ultras</h3>
              </div>
              <h4 className="font-heading font-[800] text-lg leading-snug mb-3">{ultrasReport.headline}</h4>
              <div className="text-sm text-ink-light leading-relaxed space-y-2 mb-4">
                {ultrasReport.body.split("\n").filter(Boolean).map((p, i) => (
                  <p key={i}>{renderMarkdown(p)}</p>
                ))}
              </div>
              {ultrasReport.photos && ultrasReport.photos.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {ultrasReport.photos.map((ph) => (
                    <figure key={ph.teamId} className="overflow-hidden rounded-lg border border-sand-200 bg-sand-50">
                      <img
                        src={`/kotel-foto?text=${encodeURIComponent(ph.ultrasText)}&bg=${encodeURIComponent(ph.bannerColor)}&fg=${encodeURIComponent(ph.textColor)}&p=${encodeURIComponent(ph.bannerColor)}&s=${encodeURIComponent(ph.textColor)}&lvl=${ph.level}&att=${ph.attendance}&team=${encodeURIComponent(ph.teamName)}&cap=${encodeURIComponent(ph.caption)}`}
                        alt={`Kotel ${ph.teamName}`}
                        width={1200}
                        height={630}
                        className="w-full h-auto"
                      />
                      <figcaption className="px-3 py-2 text-sm">
                        <EntityLink type="team" id={ph.teamId} className="font-heading font-bold text-base">
                          {ph.teamName}
                        </EntityLink>
                        <span className="text-muted ml-2">· {ph.caption}</span>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              )}
            </div>
          )}
```

> ⚠ **Verify:** otevři `apps/web/src/components/ui/entity-link.tsx` a potvrď, že `EntityLink` podporuje `type="team"` a cílí na `/klub/:id` (nebo dashboard team page). Pokud `type="team"` neexistuje, použij `<Link href={`/klub/${ph.teamId}`}>`.

- [ ] **Step 5: Lokální build**

Run: `cd /Users/savrik/Projects/fmko/apps/web && npx next build --no-lint`
Expected: build projde bez TS chyb.

- [ ] **Step 6: Deploy + MCP browser ověření (happy path)**

Push na testing, počkej ~80 s. MCP browser: login test účet → `/dashboard/news`. Screenshot.
Expected: sekce **„🔥 Prales Ultras"** s titulkem, textem hodnotícím atmosféru (nejvíc/nejmíň diváků) a galerií fotek kotlů; **plachty mají čitelný český text**, jména týmů jsou klikatelná.

- [ ] **Step 7: Error case ověření**

MCP browser: otevři ligu, kde kolo nemá žádný kotel (nebo dřívější kolo bez `ultras_report`).
Expected: buď sekce chybí (žádný `ultras_report`), nebo je bez galerie a text to zmiňuje — žádný rozbitý `<img>`, žádný JS error v konzoli.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/dashboard/news/page.tsx
git commit -m "feat(ultras): sekce Prales Ultras + galerie fotek v Zpravodaji"
```

---

## Task 7: Release note (až při shipu na prod)

**Files:**
- Modify: `apps/web/src/data/release-notes.ts`

- [ ] **Step 1: Přidat záznam na začátek `RELEASE_NOTES`**

```ts
  {
    date: "2026-07-07",
    emoji: "🔥",
    title: "Prales Ultras — pohled z kotle",
    items: [
      "Po každém kole vychází v Zpravodaji fanouškovská rubrika Prales Ultras hodnotící atmosféru.",
      "Kam přišlo nejvíc a nejmíň lidí, který kotel byl nejnabitější.",
      "Galerie fotek kotlů s vaší plachtou přímo v článku.",
    ],
  },
```

> Datum uprav na skutečný den prod deploye.

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/data/release-notes.ts
git commit -m "docs(ultras): release note Prales Ultras"
```

---

## Self-Review (provedeno)

**Spec coverage:**
- §2 článek `ultras_report` + Gemini fan-voice → Task 2. ✅
- §3 galerie 2D PNG, výběr top ≤3 dle žebříčku → Task 2 (`pickGallery`) + Task 5 (route) + Task 6 (zobrazení). ✅
- §4 tabulka `ultras_reports` + migrace → Task 1. ✅
- §5 trigger cron + run-matches, idempotence → Task 3 + Task 2 (idempotence check). ✅
- §6 zobrazení: sekce + iconMap + exclusion list → Task 4 + Task 6. ✅
- §7 image route + diakritika font risk → Task 5 (+ podmíněný Step 4). ✅
- §8 error handling: fallback text, prázdná galerie, logger → Task 2. ✅
- §9 testing API+browser → verifikační kroky v každém tasku. ✅
- §10 deploy: manuální migrace, testing-only, release note → Task 1 Step 2, Global Constraints, Task 7. ✅

**Odchylky od specu (vědomé):**
- **Notifikace „Redakce Zpravodaje" vypuštěny z v1** — nemáme verbatim schéma `conversations/messages`, není nezbytné (článek je vidět v Zpravodaji). Follow-up.
- **Čí kotel:** spec/brainstorm zvolil „galerie kotlů"; `pickGallery` vybírá top ≤3 doprovázející žebříček (nejvyšší návštěva / nejnabitější / výrazná plachta) — pokrývá i „standout kola".

**Placeholder scan:** žádné TBD/„handle errors" — kód kompletní; dvě `⚠ Verify` poznámky jsou explicitní kroky (Gemini fetch shape, EntityLink `type="team"`), ne placeholdery.

**Type consistency:** `UltrasPhoto` má stejný tvar v Tasku 2 (API), Tasku 4 (JSON.parse), Tasku 6 (FE interface). `generateUltrasReport(db, geminiApiKey, calendarId)` volána identicky v Tasku 2 (dev endpoint), Tasku 3 (cron `env.DB`, run-matches `c.env.DB`).
