# Prales Ultras — rubrika hodnocení atmosféry + galerie fotek kotlů

**Datum:** 2026-07-07
**Stav:** Schválený návrh, čeká na implementační plán
**Branch:** testing

---

## 1. Cíl

Po každém odehraném kole vyjde v Zpravodaji nová rubrika **„Prales Ultras"** — fanouškovský
souhrn, který **hodnotí atmosféru zápasů napříč ligou**. Páteří článku je žebříček
návštěvnosti a nabití stadionů (kam přišlo nejvíc / nejmíň lidí, nejnabitější kotel,
poloprázdné ochozy), doplněný o kontext (rekordy, derby, počasí, nálada fanoušků).

K článku patří **galerie 2D „fotek" kotlů** — server vygeneruje obrázek stadionu pohledem
na kotel, s **reálným textem plachty**, barvami klubu a číslem návštěvnosti. Fotky ilustrují
žebříček (nejvyšší návštěva, nejnabitější kotel, výrazná plachta).

Rubrika je **per-liga za kolo** — jeden článek na ligu na kolo, přesně jako stávající
`ai_report`.

---

## 2. Non-goals (v1 scope)

- **Choreo/tifo jako herní feature** — „chorea" se v článku jen zmíní popisem stávajících
  prvků kotle (plachta, vlajky, buben). Žádná nová herní mechanika.
- **Generické akční fotky ze zápasu** — v1 dělá jen fotky kotlů (vázané na domácí zápas).
- **AI-generované fotky (Replicate/difuze)** — zamítnuto: difuzní modely nevykreslí
  spolehlivě konkrétní český text plachty.
- **R2 perzistence obrázků** — fotky jsou on-the-fly `next/og` s deterministickou URL,
  cachované na CDN. Žádné ukládání blobů.
- **Samostatná stránka / sidebar položka** — rubrika je sekce uvnitř Zpravodaje.
- **Reálný 3D screenshot** — 3D kotel žije jen v prohlížeči (`ssr:false`), na serveru/cronu
  ho nevyrenderujeme; proto 2D PNG přes satori.

---

## 3. Architektura a datový tok

Práce se dělí mezi **API** (Hono Worker, generuje text + vybírá kotle po kole) a **web**
(Next.js, renderuje PNG přes `next/og`). API na Workeru satori spustit neumí; web to už dělá
pro OG obrázky.

```
KOLO DOHRÁNO (cron / manuální run-matches)
        │
        ▼
  API: generateUltrasReport(db, geminiApiKey, calendarId)
        │  1. idempotence check (ultras_reports UNIQUE league_id+game_week)
        │  2. načíst zápasy kola + návštěvnosti + kapacity + stadiums.ultras_*
        │  3. spočítat žebříček atmosféry (fill ratio, max/min návštěva)
        │  4. vybrat top ≤3 kotle (mají ultras_stand>0) pro galerii
        │  5. Gemini: fan-voice článek grounded na žebříčku
        │  6. INSERT news (type='ultras_report') + INSERT ultras_reports (photos_json)
        │  7. notifikace „Redakce Zpravodaje" (stávající vzor)
        ▼
  WEB: dashboard/news → sekce „🔥 Prales Ultras"
        │  headline + tělo článku
        │  galerie: <img src="/kotel-foto?text=...&att=...&...">
        ▼
  WEB: /kotel-foto route → ImageResponse(PNG)  ← deterministická URL, CDN cache
```

Fotka je **snapshot kola**: všechny vstupy (text plachty, barvy, návštěvnost) jsou zapečené
do URL parametrů při generování článku, takže se v čase nerozjede a URL je cachovatelná.

---

## 4. Datový model

### Nová tabulka `ultras_reports` (idempotence + metadata galerie)

Vzor: `round_awards` (`0103_season_end.sql`). Migrace `apps/api/migrations/0119_ultras_reports.sql`,
**aplikovat manuálně** (`wrangler d1 execute --file`), nejdřív na `prales-db-test`, na prod
až po výslovném souhlasu.

```sql
CREATE TABLE IF NOT EXISTS ultras_reports (
  id            TEXT PRIMARY KEY,
  league_id     TEXT NOT NULL,
  calendar_id   TEXT,
  game_week     INTEGER NOT NULL,
  season_number INTEGER NOT NULL,
  news_id       TEXT,
  photos_json   TEXT NOT NULL DEFAULT '[]',
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE(league_id, game_week)
);
```

`photos_json` = pole objektů:
```ts
type UltrasPhoto = {
  teamId: string;
  teamName: string;
  ultrasText: string;      // text plachty (může být prázdný)
  bannerColor: string;     // hex, fallback team primary
  textColor: string;       // hex, fallback auto-kontrast
  level: number;           // ultras_stand 1..3
  attendance: number;      // návštěvnost toho zápasu
  capacity: number;        // efektivní kapacita
  fillPct: number;         // 0..100
  caption: string;         // „1 240 diváků — nejvíc v kole" apod.
};
```

### Reuse `news`

Bez změny schématu. Nový `type='ultras_report'`, `league_id`, `game_week`, `headline`,
`body`. Galerie se čte z `ultras_reports` (LEFT JOIN přes `news_id` v čtecím endpointu).

**Pozn.:** `packages/db/src/schema/*.ts` (Drizzle) je zastaralé a runtime ho nepoužívá —
zdroj pravdy jsou raw migrace + `c.env.DB.prepare()`. Všechna PK jsou TEXT (`crypto.randomUUID()`).

---

## 5. API — generování

Nový modul **`apps/api/src/news/ultras-report.ts`**, modelovaný podle `ai-reporter.ts`.

### 5.1 Vstupní data (grounding)
Za dané kolo (`calendar_id` → `league_id` + `game_week`) načíst per domácí zápas:
- `matches`: `home_team_id`, `away_team_id`, `home_score`, `away_score`, `attendance`,
  `weather`, `stadium_name`.
- efektivní kapacita: `stadiums.capacity` + facility `capacityBonus` (viz `match-runner.ts:311`).
- `stadiums`: `ultras_stand`, `ultras_text`, `ultras_banner_color`, `ultras_text_color`,
  `primary_color`/`secondary_color` týmu.
- volitelně: `fans.satisfaction` / `last_match_delta`, derby heat
  (`community/manager-relations.ts`), rekord sezóny (`season-stats.ts`).

### 5.2 Žebříček atmosféry (deterministický, v kódu — ne v Gemini)
Spočítat a předat Gemini jako **fakta**, ať nic nevymýšlí:
- `fillPct = round(100 * attendance / capacity)`.
- Absolutní žebříček návštěvnosti: **max** (kam nejvíc) a **min** (kam nejmíň).
- Žebříček nabití: **max fillPct** (nejnabitější) a **min fillPct** (nejprázdnější).
- Příznaky: rekord kola/sezóny, derby (heat ≥ 60), vliv počasí (déšť/sníh), skok spokojenosti.

### 5.3 Výběr galerie (≤3 fotek)
Kandidáti = domácí týmy kola s `ultras_stand > 0` (musí být plachta k vyfocení).
Vybrat, ať fotky **doprovodí žebříček** (bez duplicit, pořadí dle priority):
1. Tým s **nejvyšší návštěvností** (má-li kotel).
2. Tým s **nejnabitějším kotlem** (max fillPct).
3. **Výrazná plachta / největší kotel** (level 3, jinak nejvyšší level / neprázdný text).

Popisek každé fotky = konkrétní číslo ze žebříčku. Míň kandidátů → míň fotek. Žádný kandidát
→ prázdná galerie, text to zmíní.

### 5.4 Gemini prompt
- Tón: fanzin kotle, první osoba množná („my na kotli"), zaujatý pro atmosféru.
- **První řádek = headline**, zbytek = tělo (`**bold**` markdown povolen).
- Striktní pravidla z `ai-reporter.ts`: **nikdy nevymýšlet jména ani čísla**, používat jen
  dodaná data. Grounding = žebříček + prvky kotlů notable týmů (plachta, vlajky dle levelu,
  buben od L2).
- Volání přes `callGemini` z `apps/api/src/news/gemini-helper.ts` (Gemini 2.5 Flash).
- **Fallback:** když Gemini selže/chybí klíč → deterministický šablonový text ze žebříčku
  (vzor `season-wrap.ts`). Rubrika vyjde vždy, žádný prázdný catch — logovat `logger.warn`.

### 5.5 Trigger a idempotence
- Hook: `apps/api/src/index.ts` cron blok po zpracování kola, přes `ctx.waitUntil`
  (neblokuje tick — vzor `generateAiRoundReport` na ~ř. 284). Napojit i na manuální
  `/game/run-matches` (`routes/game.ts`) pro test.
- Idempotence: před generováním `SELECT 1 FROM ultras_reports WHERE league_id=? AND game_week=?`;
  `UNIQUE(league_id, game_week)` jako pojistka. Bezpečné pro recovery/retry.

### 5.6 Notifikace
Po insertu upsert `conversations` („Redakce Zpravodaje") + `messages` per lidský tým —
stávající vzor z `round-summary.ts:301-337`.

---

## 6. Web — obrázek kotle

Nová route **`apps/web/src/app/kotel-foto/route.tsx`** (Route Handler, `ImageResponse`
z `next/og`), edge runtime jako stávající OG routes.

### 6.1 Vstup (query params — deterministická, cachovatelná URL)
`text` (plachta), `bg` (barva plachty), `fg` (barva textu), `p` (primary klubu),
`s` (secondary), `lvl` (level kotle 1..3), `att` (návštěvnost), `team` (jméno),
`cap` (popisek). Rozměr 1200×630 (OG poměr).

### 6.2 Kompozice (čistě CSS/flex — satori neumí WebGL ani `<canvas>`)
Pohled ze hřiště na kotel:
- pozadí: gradient (obloha + reflektory),
- tribuna/ochozy s „davem" = mřížka barevných bloků v barvách klubu, hustota dle
  `lvl` + `att`,
- velká **plachta** (zaoblený obdélník, `bg`, vycentrovaný VELKÝ text `fg`) —
  reálný text, vždy čitelný (port logiky z `StadiumExtras.tsx:17-42`),
- pár vlajek (trojúhelníky), počet dle levelu (`[0,4,6,8][lvl]`),
- spodní lišta: `{team} · {att} diváků` + `cap`.

### 6.3 Riziko: české diakritiky v satori
Výchozí satori font nemusí mít `ř/ů/ě/…`. **Reuse font-loadingu ze stávajících OG routes**
(`apps/web/src/app/klub/[teamId]/opengraph-image.tsx` už české texty renderuje) — přiložit
stejný TTF přes `fetch`+`ArrayBuffer` do `ImageResponse({ fonts })`. **Ověřit vizuálně**
(screenshot s diakritikou) před tvrzením, že funguje.

---

## 7. Web — zobrazení rubriky

`apps/web/src/app/dashboard/news/page.tsx`:
- Nová sekce **„🔥 Prales Ultras"** (vzor sekce „Rozhovory kola", ~ř. 448): headline,
  tělo (`renderMarkdown`), pod tím **galerie** `<img>` fotek (URL sestavená z `photos_json`).
- Jména týmů klikatelná (`EntityLink`).
- Přidat `'ultras_report'` do exclusion listu (`news/page.tsx:281`), ať nespadne do misc feedu.

Čtecí endpointy:
- `apps/api/src/routes/game.ts` `GET /api/teams/:teamId/news` — icon mapa ~ř. 1030
  → `ultras_report: "🔥"`; LEFT JOIN `ultras_reports` a přiložit `photos` k řádku.
- `apps/api/src/routes/league.ts` `GET /api/leagues/:leagueId/news` — icon mapa ~ř. 344.

---

## 8. Error handling

- Žádný prázdný catch. Server: `logger.warn/error({ module: "ultras-report" }, ...)`.
  Client: `console.error`.
- Gemini selhání → deterministický fallback text (§5.4), rubrika vyjde vždy.
- Chybí kandidáti na fotky → prázdná galerie, žádný crash.
- `/kotel-foto` s neúplnými params → sensible defaults (team primary, prázdná plachta).
- Idempotence chrání před dvojitým generováním při recovery/retry kola.

---

## 9. Testing (povinné dle CLAUDE.md)

**Backend (API):**
- Spustit kolo na testu (manuální `/game/run-matches` nebo seed) → ověřit
  `SELECT * FROM ultras_reports` + `SELECT ... FROM news WHERE type='ultras_report'` (D1 remote).
- Ověřit idempotenci (druhý běh nezaloží duplicitu).
- Ověřit fallback (dočasně bez Gemini klíče → vyjde šablonový text).

**Frontend (MCP browser):**
- Login test účet → `/dashboard/news` → screenshot sekce „Prales Ultras".
- Ověřit galerii — obrázky se načtou, **plachta má český text čitelně** (diakritika).
- Otevřít `/kotel-foto?...` přímo → PNG s diakritikou.

**Hybrid:** oboje ověřit, nikdy netvrdit „funguje" bez verifikace.

---

## 10. Deploy poznámky

- Migrace `0119_ultras_reports.sql` **manuálně**, nejdřív `prales-db-test`, prod až po souhlasu.
- Build web: `cd apps/web && npx next build --no-lint`.
- Testing branch auto-deploy na `*-test.prales.fun`. Na `main` **nikdy bez výslovného OK**.
- Cron: žádný nový cron trigger — háček je uvnitř stávajícího match-ticku (`ctx.waitUntil`).
- Při shipu na prod přidat záznam do „Co je nového" (`apps/web/src/data/release-notes.ts`).

---

## 11. Dotčené soubory (přehled)

**Nové:**
- `apps/api/migrations/0119_ultras_reports.sql`
- `apps/api/src/news/ultras-report.ts`
- `apps/web/src/app/kotel-foto/route.tsx`

**Upravené:**
- `apps/api/src/index.ts` — trigger v cron bloku (`ctx.waitUntil`)
- `apps/api/src/routes/game.ts` — trigger v `/game/run-matches`, icon mapa, JOIN galerie do news
- `apps/api/src/routes/league.ts` — icon mapa
- `apps/web/src/app/dashboard/news/page.tsx` — sekce „Prales Ultras" + galerie + exclusion list
- `apps/web/src/data/release-notes.ts` — release note (při shipu)
