# SMS od majitelů firem: plán implementace

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Majitelé firem (sponzorů) píšou trenérovi do herního telefonu jako hráči nebo vůdce fanoušků: den před domácím zápasem, na který přijali pozvání, po výhře nebo prohře, kterou viděli, po sérii proher, po výtržnosti, při ztrátě nebo změně hlavního sponzora, na konci sezóny a (opatrný majitel) po průšvihu v klubu. Trenér odpoví jedním ze tří tlačítek (vlídně, věcně, odbýt) nebo vlastními slovy a odpověď pohne náklonností majitele. Mlčení u zpráv, které čekají odpověď, náklonnost mírně sníží.

**Architecture:** Spouštěče jen zapisují do fronty `sponsor_owner_sms` (migrace 0220, idempotentně přes `reference_id`). Doručuje jediná funkce `deliverOwnerSmsForTeam` (nejvýš jedna SMS od majitelů na klub a herní den, každý majitel pak 5 herních dní mlčí), volaná z match-runneru, ze sponzorských rout a z denního ticku. Zpráva jde přes nový helper `sendOwnerSMS` do systémové konverzace s `participant_id = so-{sponsorId}` a otevřeným vláknem `ai_thread_state.kind = "sponsor_owner"`, přesně jako `sendLeaderSMS` u vůdce fanoušků. Nabídka odpovědí leží v `messages.metadata`, telefon z ní dělá tlačítka. Odpověď zpracuje `handleOwnerSmsReply` bez modelu (iMessage, zdarma) a změnu náklonnosti zapíše přes `favorDeltaStmts`, tedy s deníkem `sponsor_favor_log`, takže je vidět v záložce Oblíbenost.

**Tech Stack:** Hono + Cloudflare D1 (SQLite), vitest, Next.js 15 (client komponenta telefonu), Tailwind.

**Spec:** Schválený návrh v konverzaci 2026-09-23, shrnut v sekci Design níže.

## Design

**Příležitosti** (klíč `occasion`, kdo píše, jestli se čeká odpověď):

| Klíč | Kdy | Kdo | Čeká odpověď | Priorita | Lhůta doručení |
|---|---|---|---|---|---|
| `riot` | výtržnost domácích fanoušků (`resolveMatchIncidents`) | majitel se vztahem, přednost opatrný | ano | 1 | 2 dny |
| `scandal` | krádež nebo poškození v klubu (`club_incidents`, severity ≥ 2, ne `hrozi`) | jen opatrný majitel se vztahem | ano | 2 | 3 dny |
| `main_lost` | klub ukončil hlavní smlouvu, nebo hlavní smlouva vypršela v rolloveru | majitel odcházející firmy | ano | 3 | 3 dny |
| `after_loss` | prohra na domácím zápase, na kterém majitel seděl | ten majitel | ano | 4 | 1 den |
| `after_win` | výhra na domácím zápase, na kterém majitel seděl | ten majitel | ne | 5 | 1 den |
| `losing_streak` | 3 a víc proher v řadě (jednou za sérii) | majitel se vztahem | ano | 6 | 2 dny |
| `match_eve` | den před domácím zápasem, na který přijal pozvání | ten majitel | ne | 7 | jen ten den |
| `main_new` | klub podepsal hlavní smlouvu | majitel nové firmy | ne | 8 | 3 dny |
| `season_complaint` | rollover, klub měl v sezóně < 1,2 bodu na zápas | hlavní sponzor, jinak majitel s nejvyšší náklonností | ano | 9 | 3 dny |
| `season_thanks` | rollover, klub měl ≥ 1,2 bodu na zápas | dtto | ne | 10 | 3 dny |

„Majitel se vztahem" = má řádek v `sponsor_team_favor`, nebo aktivní smlouvu s klubem. Remíza po zápase SMS nevyvolá.

**Limity:** jen lidské kluby (`user_id != 'ai'`, ne U21, ne `DELETED-`). Nejvýš jedna SMS od majitelů na klub a herní den (drží podmíněný UPDATE, takže i souběh match-runneru a ticku). Každý majitel pak vůči klubu 5 herních dní mlčí; jediná výjimka je dvojice „den před zápasem" a „po zápase" téhož majitele. Když se sejde víc kandidátů, vyhraje nižší číslo priority; nedoručené položky po lhůtě propadnou (`dropped`).

**Odpovědi:** každá doručená SMS otevře vlákno a nabídne tři tlačítka: vlídně / věcně / odbýt (texty podle druhu příležitosti). Psát jde i vlastními slovy; tón se pak pozná lexikálně přes stávající `klasifikujOdpoved` (smířlivě → vlídně, tvrdě → odbýt, krátké „ok" → odbýt, jinak věcně). Stejný přístup jako u vůdce fanoušků, bez modelu, bez kreditu, kanál iMessage.

| Povaha | vlídně | věcně | odbýt | mlčení (jen „čeká odpověď") |
|---|---|---|---|---|
| fan | +3 | 0 | −4 | −2 |
| patriot | +2 | 0 | −3 | −2 |
| businessman | +1 | +2 | −2 | −1 |
| cautious | +2 | 0 | −3 | −2 |

(Podnikateli sedí věcná odpověď víc než vlídná; správná volba tedy záleží na povaze.) Lhůta na odpověď 3 herní dny. Pak se vlákno zavře; u zpráv, které čekají odpověď, s postihem „neodpověděl na SMS". Majitel na odpověď odepíše krátkou větou podle povahy a výsledné změny.

**Důvody v deníku:** „odpověď na SMS" (kladná změna), „odbytá SMS" (odbytí), „neodpověděl na SMS" (mlčení). Nulová skutečná změna se nezapisuje (chování `favorLogStmt`).

**Texty:** pooly po třech větách na příležitost a povahu (u `scandal` pět vět, jen opatrný), výběr deterministicky podle `reference_id` a s vynecháním posledních šesti těl SMS klubu. Majitel je odesílatel, jméno ve větě nestojí; majitelé jsou vždy muži (`generateSponsorOwner`), mužský rod v první osobě sedí; trenéra texty neoslovují v minulém čase (jeho rod neznáme); počty lepí `proherTvar`; žádná dlouhá pomlčka. Fanoušek a patriot tykají, podnikatel a opatrný vykají.

**AI:** žádné volání modelu. Srovnatelná zpráva (vůdce fanoušků) je deterministická a zdarma, stejně tak tady; přepínač `ai_provider` ani telefonní kredit se proto netýkají.

**Rollover:** vynulování `game_clock` vrací herní datum zpátky, takže lhůty ze staré osy by nikdy nevypršely (stejná past jako u `coach_interviews`). Rollover proto před novými zprávami všechna otevřená vlákna majitelů tiše zavře a frontu vyprázdní. Cooldown se počítá přes `ABS(julianday(...))`, aby ho posun času nezablokoval.

## Global Constraints

- Identifikátory v kódu anglicky, texty pro hráče a komentáře česky.
- V textech pro hráče nikdy dlouhá pomlčka (—). Znaménko minus (−) v komentářích a tabulkách plánu je v pořádku, do textů pro hráče nepatří.
- Nikdy prázdný `catch`. Server `logger.warn/error({ module }, "popis", e)`; `logger` serializuje z kontextu jen `teamId`, `matchId`, `playerId`, `reqId`, ostatní id patří do textu zprávy. Klient `console.error("popis:", e)`.
- Každá změna náklonnosti jde přes `favorDeltaStmts` / `applySponsorFavorDelta` (deník v tomtéž batchi, log PŘED změnou). Žádný přímý `UPDATE sponsor_team_favor`.
- UI: minimum `text-sm`, mobil nejdřív, ceny nikdy v tlačítkách, vše česky, jen barvy, které projekt už používá (`blue-50/200/700`, `blue-500`).
- Testovací DB `prales-db-test`; produkce jen po výslovném souhlasu. D1 dotazy: vnější `'`, vnitřní `"`, žádný backslash před `$`.
- Pracuje se na větvi `testing`. V úlohách 1–6 se NEPUSHUJE; push na `testing` jen v úloze 7. Nic na `main`.
- Commit zprávy končí prázdným řádkem a `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Souborová struktura

| Soubor | Odpovědnost |
|---|---|
| `apps/api/migrations/0220_sponsor_owner_sms.sql` (nový) | tabulka fronty a historie SMS od majitelů |
| `apps/api/src/sponsors/owner-sms-texts.ts` (nový) | příležitosti, tóny, pooly zpráv, nabídka odpovědí, odpověď majitele, `proherTvar` |
| `apps/api/src/sponsors/owner-sms-rules.ts` (nový) | pravidla příležitostí, dopady odpovědí a mlčení, výběr doručitelné SMS, výběr majitele, verdikt sezóny |
| `apps/api/src/sponsors/owner-sms-texts.test.ts`, `owner-sms-rules.test.ts` (nové) | unit testy čistých funkcí |
| `apps/api/src/sponsors/owner-sms.ts` (nový) | DB vrstva: fronta, doručení, odpověď, mlčení, úklid v rolloveru |
| `apps/api/src/sponsors/owner-sms.test.ts` (nový) | testy DB vrstvy nad `FalesnaD1` |
| `apps/api/src/sponsors/owner-sms-triggers.ts` (nový) | spouštěče: po zápase, výtržnost, den před zápasem, série proher, průšvih, hlavní sponzor, konec sezóny, denní běh |
| `apps/api/src/sponsors/favor-math.ts` | tři nové důvody ve `FAVOR_REASONS` |
| `apps/api/src/messaging/system-sms.ts` | `sendOwnerSMS` |
| `apps/api/src/sponsors/hooks.ts` | `settleSponsorInvitations` zařadí SMS po zápase |
| `apps/api/src/fans/resolve-match-incidents.ts` | SMS po výtržnosti |
| `apps/api/src/multiplayer/match-runner.ts` | doručení SMS domácímu lidskému klubu po zápase |
| `apps/api/src/season/daily-tick.ts` | denní běh ve vlastním try/catch |
| `apps/api/src/season/season-rollover.ts` | úklid vláken, konec sezóny, vypršelý hlavní sponzor |
| `apps/api/src/routes/game.ts` | podpis a ukončení hlavní smlouvy |
| `apps/api/src/routes/teams.ts` | úklid tabulky při převzetí AI klubu |
| `apps/api/src/messaging/ai-player-spawn.ts` | vlákno majitele nepřebírá kontrola hráčských vláken ani neblokuje jejich spawn |
| `apps/api/src/routes/messaging.ts` | `optionId` v odeslání, `handleOwnerSmsReply`, nápověda a štítek odkazu po uzavření |
| `apps/web/src/app/(hra)/telefon/[id]/page.tsx` | tlačítka odpovědí, štítek odkazu z nápovědy |

---

### Task 1: Migrace 0220 (fronta SMS od majitelů)

**Files:**
- Create: `apps/api/migrations/0220_sponsor_owner_sms.sql`

**Interfaces:**
- Consumes: `district_sponsors(id)`, `teams(id)` (FK jako u 0217/0219).
- Produces: tabulka `sponsor_owner_sms` se sloupci `id, sponsor_id, team_id, occasion, reference_id (UNIQUE), expects_reply, status, vars, created_day, deliver_by, sent_day, reply_by, conversation_id, body, reply_tone, created_at`.

- [ ] **Step 1: Ověřit, že číslo 0220 je volné**

Run: `ls /Users/savrik/Projects/fmko/apps/api/migrations | tail -3`
Expected: poslední je `0219_sponsor_favor_log.sql`, žádná `0220_*`.

- [ ] **Step 2: Napsat migraci**

```sql
-- 0220: SMS od majitelů firem (docs/superpowers/plans/2026-09-23-sms-majitelu-firem.md).
-- Fronta i historie: spouštěče zapisují 'pending', doručení mění na 'awaiting',
-- odpověď na 'replied', mlčení na 'ignored' (čekala se odpověď) nebo 'closed'.
-- Aplikovat ručně PŘED nasazením kódu:
--   npx wrangler d1 execute prales-db-test --remote --file apps/api/migrations/0220_sponsor_owner_sms.sql

CREATE TABLE IF NOT EXISTS sponsor_owner_sms (
  id TEXT PRIMARY KEY,
  sponsor_id INTEGER NOT NULL REFERENCES district_sponsors(id),
  team_id TEXT NOT NULL REFERENCES teams(id),
  -- Klíč příležitosti (OWNER_SMS_OCCASIONS v sponsors/owner-sms-texts.ts).
  occasion TEXT NOT NULL,
  -- Stabilní klíč spouštěče: tatáž událost nesmí zařadit SMS dvakrát.
  reference_id TEXT NOT NULL,
  expects_reply INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','awaiting','replied','ignored','closed','dropped')),
  -- Proměnné šablony (skóre, délka série) jako JSON.
  vars TEXT NOT NULL DEFAULT '{}',
  -- Herní dny ve tvaru YYYY-MM-DD.
  created_day TEXT NOT NULL,
  deliver_by TEXT NOT NULL,
  sent_day TEXT,
  reply_by TEXT,
  conversation_id TEXT,
  body TEXT,
  reply_tone TEXT CHECK(reply_tone IS NULL OR reply_tone IN ('warm','neutral','dismissive')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_sponsor_owner_sms_ref ON sponsor_owner_sms(reference_id);
CREATE INDEX IF NOT EXISTS idx_sponsor_owner_sms_team ON sponsor_owner_sms(team_id, status);
CREATE INDEX IF NOT EXISTS idx_sponsor_owner_sms_sent ON sponsor_owner_sms(team_id, sent_day);
```

- [ ] **Step 3: Aplikovat na testovací DB**

Run (z `/Users/savrik/Projects/fmko`): `npx wrangler d1 execute prales-db-test --remote --file apps/api/migrations/0220_sponsor_owner_sms.sql`
Expected: `🚣 Executed 4 commands` (nebo obdobné hlášení o úspěchu), žádná chyba.

- [ ] **Step 4: Ověřit tabulku**

Run: `npx wrangler d1 execute prales-db-test --remote --json --command 'SELECT group_concat(name, ",") AS c FROM pragma_table_info("sponsor_owner_sms")'`
Expected: `"c": "id,sponsor_id,team_id,occasion,reference_id,expects_reply,status,vars,created_day,deliver_by,sent_day,reply_by,conversation_id,body,reply_tone,created_at"`

- [ ] **Step 5: Commit**

```bash
git add apps/api/migrations/0220_sponsor_owner_sms.sql
git commit -m "$(cat <<'EOF'
feat(sponzori): migrace 0220 fronta SMS od majitelu firem

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Čisté funkce: texty, pravidla, dopady (s testy)

**Files:**
- Create: `apps/api/src/sponsors/owner-sms-texts.ts`
- Create: `apps/api/src/sponsors/owner-sms-rules.ts`
- Create: `apps/api/src/sponsors/owner-sms-texts.test.ts`
- Create: `apps/api/src/sponsors/owner-sms-rules.test.ts`
- Modify: `apps/api/src/sponsors/favor-math.ts` (`FAVOR_REASONS`)

**Interfaces:**
- Consumes: `OwnerPersonality`, `OWNER_PERSONALITIES` (`./owners`), `createRng` (`../generators/rng`), `seedFromString` (`../lib/seed`), `gameExpiry` (`../lib/game-time`), `klasifikujOdpoved` (`../engine/fan-reactions`).
- Produces:
  - `owner-sms-texts.ts`: `OWNER_SMS_OCCASIONS`, `OwnerSmsOccasion`, `isOwnerSmsOccasion`, `REPLY_TONES`, `ReplyTone`, `isReplyTone`, `OwnerSmsVars`, `OWNER_SMS_TEXTS`, `proherTvar`, `renderOwnerSms(occasion, personality, vars, seedKey, recent): string | null`, `ReplyOption`, `replyOptions(occasion): ReplyOption[]`, `OWNER_REPLY_BACK`, `ownerReplyBack(personality, favorDelta, seedKey): string`.
  - `owner-sms-rules.ts`: `OWNER_SMS_COOLDOWN_DAYS`, `OWNER_SMS_REPLY_DAYS`, `LOSING_STREAK_MIN`, `OCCASION_RULES`, `replyFavorDelta`, `ignoreFavorDelta`, `classifyFreeReply`, `addDays`, `dayDiff`, `PendingOwnerSms`, `SentOwnerSms`, `pickDeliverable`, `RelationshipOwner`, `pickRelationshipOwner`, `seasonVerdict`, `occasionForResult`, `leadingLosses`.
  - `FAVOR_REASONS.smsReply`, `.smsDismissed`, `.smsIgnored`.

- [ ] **Step 1: Napsat test textů (selže, modul neexistuje)**

`apps/api/src/sponsors/owner-sms-texts.test.ts`:

```ts
/**
 * Šablony SMS od majitelů: úplnost poolů, žádné zbylé značky, žádná dlouhá pomlčka,
 * výběr bez opakování a správné tvary počtů.
 */
import { describe, expect, it } from "vitest";
import { OWNER_PERSONALITIES } from "./owners";
import {
  OWNER_REPLY_BACK, OWNER_SMS_OCCASIONS, OWNER_SMS_TEXTS, ownerReplyBack, proherTvar, renderOwnerSms, replyOptions,
} from "./owner-sms-texts";

const VARS = { skore: "2:1", serie: 4 };

describe("OWNER_SMS_TEXTS", () => {
  it("každá příležitost má pro každou povahu aspoň tři věty (skandál jen opatrný)", () => {
    for (const o of OWNER_SMS_OCCASIONS) {
      for (const p of OWNER_PERSONALITIES) {
        const pool = OWNER_SMS_TEXTS[o][p];
        if (o === "scandal" && p !== "cautious") {
          expect(pool, `${o}/${p}`).toBeUndefined();
          continue;
        }
        expect(pool?.length ?? 0, `${o}/${p}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("vyrenderovaný text nemá zbylé značky ani dlouhou pomlčku", () => {
    for (const o of OWNER_SMS_OCCASIONS) {
      for (const p of OWNER_PERSONALITIES) {
        for (const t of OWNER_SMS_TEXTS[o][p] ?? []) {
          const out = renderOwnerSms(o, p, VARS, `test|${t}`, (OWNER_SMS_TEXTS[o][p] ?? []).filter((x) => x !== t)
            .map((x) => x.replace("{skore}", "2:1").replace("{serie}", "4 prohry")));
          expect(out, `${o}/${p}`).not.toBeNull();
          expect(out).not.toMatch(/[{}]/);
          expect(out).not.toContain("—");
        }
      }
    }
  });

  it("skandál od neopatrného majitele nevznikne", () => {
    expect(renderOwnerSms("scandal", "fan", {}, "k", [])).toBeNull();
  });

  it("zpráva po zápase bez skóre nevznikne", () => {
    expect(renderOwnerSms("after_win", "fan", {}, "k", [])).toBeNull();
  });

  it("vynechá nedávno odeslané texty", () => {
    const pool = OWNER_SMS_TEXTS.match_eve.fan ?? [];
    const recent = pool.slice(0, pool.length - 1);
    expect(renderOwnerSms("match_eve", "fan", {}, "cokoli", recent)).toBe(pool[pool.length - 1]);
  });

  it("je deterministický podle klíče", () => {
    expect(renderOwnerSms("riot", "cautious", {}, "riot:m1", [])).toBe(renderOwnerSms("riot", "cautious", {}, "riot:m1", []));
  });
});

describe("proherTvar", () => {
  it("skloňuje počet proher", () => {
    expect(proherTvar(3)).toBe("3 prohry");
    expect(proherTvar(4)).toBe("4 prohry");
    expect(proherTvar(5)).toBe("5 proher");
    expect(proherTvar(11)).toBe("11 proher");
  });
});

describe("replyOptions", () => {
  it("vždy tři možnosti v pořadí vlídně, věcně, odbýt, bez dlouhé pomlčky", () => {
    for (const o of OWNER_SMS_OCCASIONS) {
      const opts = replyOptions(o);
      expect(opts.map((x) => x.id)).toEqual(["warm", "neutral", "dismissive"]);
      for (const x of opts) {
        expect(x.text.length).toBeGreaterThan(3);
        expect(x.text).not.toContain("—");
      }
    }
  });
});

describe("ownerReplyBack", () => {
  it("má odpověď pro každou povahu a směr", () => {
    for (const p of OWNER_PERSONALITIES) {
      for (const d of [3, 0, -3]) {
        const t = ownerReplyBack(p, d, `k|${p}|${d}`);
        expect(t.length).toBeGreaterThan(0);
        expect(t).not.toContain("—");
      }
      expect(OWNER_REPLY_BACK[p].up.length).toBeGreaterThanOrEqual(3);
    }
  });
});
```

- [ ] **Step 2: Napsat test pravidel (selže, modul neexistuje)**

`apps/api/src/sponsors/owner-sms-rules.test.ts`:

```ts
/** Pravidla SMS od majitelů: limity doručení, dopady odpovědí, výběr majitele, verdikt sezóny. */
import { describe, expect, it } from "vitest";
import {
  addDays, classifyFreeReply, dayDiff, ignoreFavorDelta, leadingLosses, occasionForResult, pickDeliverable,
  pickRelationshipOwner, replyFavorDelta, seasonVerdict, type PendingOwnerSms, type RelationshipOwner,
} from "./owner-sms-rules";

const TODAY = "2026-09-23";
const p = (id: string, sponsorId: number, occasion: PendingOwnerSms["occasion"]): PendingOwnerSms =>
  ({ id, sponsorId, occasion, createdDay: TODAY });

describe("pickDeliverable", () => {
  it("vybere nejvyšší prioritu", () => {
    expect(pickDeliverable([p("a", 2, "after_win"), p("b", 1, "riot")], [], TODAY)?.id).toBe("b");
  });

  it("dnes už SMS od majitele přišla: nic", () => {
    expect(pickDeliverable([p("a", 1, "riot")], [{ sponsorId: 9, occasion: "after_win", sentDay: TODAY }], TODAY)).toBeNull();
  });

  it("majitel psal před dvěma dny: mlčí", () => {
    expect(pickDeliverable([p("a", 1, "after_loss")], [{ sponsorId: 1, occasion: "riot", sentDay: "2026-09-21" }], TODAY)).toBeNull();
  });

  it("po pěti dnech smí zase", () => {
    expect(pickDeliverable([p("a", 1, "after_loss")], [{ sponsorId: 1, occasion: "riot", sentDay: "2026-09-18" }], TODAY)?.id).toBe("a");
  });

  it("den před zápasem nebrání zprávě po zápase", () => {
    expect(pickDeliverable([p("a", 1, "after_win")], [{ sponsorId: 1, occasion: "match_eve", sentDay: "2026-09-22" }], TODAY)?.id).toBe("a");
  });

  it("majitel v pauze přeskočí na dalšího kandidáta", () => {
    const sent = [{ sponsorId: 1, occasion: "after_win" as const, sentDay: "2026-09-21" }];
    expect(pickDeliverable([p("a", 1, "riot"), p("b", 2, "after_win")], sent, TODAY)?.id).toBe("b");
  });
});

describe("dopady odpovědí", () => {
  it("fanoušek vlídně +3, odbytí −4", () => {
    expect(replyFavorDelta("fan", "warm")).toBe(3);
    expect(replyFavorDelta("fan", "dismissive")).toBe(-4);
  });

  it("podnikateli sedí věcnost víc než vlídnost", () => {
    expect(replyFavorDelta("businessman", "neutral")).toBe(2);
    expect(replyFavorDelta("businessman", "warm")).toBe(1);
  });

  it("mlčení je malý postih", () => {
    expect(ignoreFavorDelta("businessman")).toBe(-1);
    expect(ignoreFavorDelta("cautious")).toBe(-2);
  });
});

describe("classifyFreeReply", () => {
  it("smířlivě = vlídně", () => expect(classifyFreeReply("Chápu, mrzí mě to, napravíme to.")).toBe("warm"));
  it("tvrdě = odbýt", () => expect(classifyFreeReply("Konec debaty, rozhoduju já.")).toBe("dismissive"));
  it("krátké ok = odbýt", () => expect(classifyFreeReply("ok")).toBe("dismissive"));
  it("jinak věcně", () => expect(classifyFreeReply("Uvidíme po víkendu, co se dá dělat.")).toBe("neutral"));
});

describe("pickRelationshipOwner", () => {
  const owners: RelationshipOwner[] = [
    { sponsorId: 1, personality: "fan", favor: 80, hasContract: false, isMain: false },
    { sponsorId: 2, personality: "businessman", favor: 30, hasContract: true, isMain: true },
    { sponsorId: 3, personality: "cautious", favor: 40, hasContract: false, isMain: false },
  ];
  it("hlavní sponzor má přednost před vyšší náklonností", () => expect(pickRelationshipOwner(owners)?.sponsorId).toBe(2));
  it("jen opatrný", () => expect(pickRelationshipOwner(owners, { only: "cautious" })?.sponsorId).toBe(3));
  it("přednost opatrnému", () => expect(pickRelationshipOwner(owners, { prefer: "cautious" })?.sponsorId).toBe(3));
  it("nikdo", () => expect(pickRelationshipOwner([], {})).toBeNull());
});

describe("drobnosti", () => {
  it("verdikt sezóny", () => {
    expect(seasonVerdict(10, 5, 26)).toBe("season_thanks");
    expect(seasonVerdict(4, 4, 26)).toBe("season_complaint");
    expect(seasonVerdict(0, 0, 0)).toBeNull();
  });
  it("výsledek zápasu", () => {
    expect(occasionForResult(2, 1)).toBe("after_win");
    expect(occasionForResult(0, 1)).toBe("after_loss");
    expect(occasionForResult(1, 1)).toBeNull();
  });
  it("prohry v řadě", () => {
    expect(leadingLosses(["L", "L", "L", "W", "L"])).toBe(3);
    expect(leadingLosses(["W", "L"])).toBe(0);
  });
  it("dny", () => {
    expect(addDays("2026-09-23", 3)).toBe("2026-09-26");
    expect(addDays("2026-09-23T16:00:00.000Z", 1)).toBe("2026-09-24");
    expect(dayDiff("2026-09-18", TODAY)).toBe(5);
  });
});
```

- [ ] **Step 3: Spustit testy, ověřit že selžou**

Run: `cd /Users/savrik/Projects/fmko/apps/api && npx vitest run src/sponsors/owner-sms-texts.test.ts src/sponsors/owner-sms-rules.test.ts`
Expected: FAIL, `Failed to resolve import "./owner-sms-texts"` / `"./owner-sms-rules"`.

- [ ] **Step 4: Napsat `owner-sms-texts.ts`**

```ts
/**
 * SMS od majitelů firem: šablony zpráv, nabídka odpovědí trenéra a odpověď majitele.
 * Čisté funkce bez DB.
 *
 * Pravidla šablon (viz paměť „generované české texty"):
 * - majitel je odesílatel, ne podmět ve větě, jeho jméno se do textu nevkládá;
 *   majitelé jsou vždy muži (generateSponsorOwner), mužský rod v první osobě sedí,
 * - trenéra texty neoslovují v minulém čase, jeho rod neznáme,
 * - počty lepí helper (`proherTvar`), ne šablona,
 * - žádná dlouhá pomlčka,
 * - fanoušek a patriot tykají, podnikatel a opatrný vykají.
 */
import { createRng } from "../generators/rng";
import { seedFromString } from "../lib/seed";
import type { OwnerPersonality } from "./owners";

export const OWNER_SMS_OCCASIONS = [
  "match_eve", "after_win", "after_loss", "losing_streak", "riot",
  "main_lost", "main_new", "season_thanks", "season_complaint", "scandal",
] as const;
export type OwnerSmsOccasion = (typeof OWNER_SMS_OCCASIONS)[number];

export function isOwnerSmsOccasion(v: unknown): v is OwnerSmsOccasion {
  return typeof v === "string" && (OWNER_SMS_OCCASIONS as readonly string[]).includes(v);
}

export const REPLY_TONES = ["warm", "neutral", "dismissive"] as const;
export type ReplyTone = (typeof REPLY_TONES)[number];

export function isReplyTone(v: unknown): v is ReplyTone {
  return typeof v === "string" && (REPLY_TONES as readonly string[]).includes(v);
}

/** Proměnné šablon: `{skore}` z pohledu domácích („2:1"), `{serie}` = počet proher v řadě. */
export interface OwnerSmsVars {
  skore?: string;
  serie?: number;
}

type Pools = Partial<Record<OwnerPersonality, readonly string[]>>;

export const OWNER_SMS_TEXTS: Record<OwnerSmsOccasion, Pools> = {
  match_eve: {
    fan: [
      "Zítra jsem na tribuně! Šálu mám vypranou, hlas připravenej. Ať to kluci roztočí.",
      "Nemůžu dospat, zítra domácí zápas. Počítám s výhrou, jinak mě žena nepustí domů.",
      "Zítra fandím od první minuty. Pivo platím já, góly vy.",
    ],
    patriot: [
      "Zítra přijdu na náš plac. Domácí hřiště je svatý, ať to kluci ví.",
      "Těším se na zítřek. Na domácí zápasy chodím od malička a pořád mě to bere.",
      "Zítra se ukážu na tribuně. Ať vidí celá vesnice, že za klubem stojíme.",
    ],
    businessman: [
      "Potvrzuji zítřek. Dorazím před výkopem, po zápase bych rád probral pár věcí.",
      "Zítra jsem na zápase. Vezmu s sebou obchodního partnera, ať je na co koukat.",
      "Zítřek mám v kalendáři. Doufám, že tým předvede, za co firma platí.",
    ],
    cautious: [
      "Zítra přijdu, jak jsem slíbil. Snad bude na tribuně klid.",
      "Na zítřek se chystám. Je tam dobře zajištěné parkování a pořadatelé?",
      "Zítra dorazím. Doufám, že to bude slušné sportovní odpoledne bez průšvihů.",
    ],
  },
  after_win: {
    fan: [
      "{skore}! Ještě teď se mi třesou ruce. Tohle byl zápas, na kterej se nezapomíná.",
      "To bylo něco! {skore} a já řval jak na lesy. Díky za pozvání.",
      "Hlas nemám, ale {skore} za to stálo. Příště beru celou rodinu.",
    ],
    patriot: [
      "{skore}, takhle se hraje doma. Celá vesnice o tom bude mluvit týden.",
      "Krásná výhra {skore}. Na takový kluky může bejt obec hrdá.",
      "{skore} před domácími lidmi. Přesně kvůli tomuhle klub podporuju.",
    ],
    businessman: [
      "Výhra {skore}, dobrá reklama pro firmu i pro klub. Spokojenost.",
      "{skore}. Partner, který šel se mnou, byl nadšený. To se počítá.",
      "Solidní výkon, {skore}. Takhle si představuji návratnost.",
    ],
    cautious: [
      "{skore}, pěkné a hlavně klidné odpoledne. Děkuji za pozvání.",
      "Výhra {skore} a žádné problémy kolem. Tak to má vypadat.",
      "Příjemný zápas, {skore}. Rád jsem se přišel podívat.",
    ],
  },
  after_loss: {
    fan: [
      "{skore}. Bolí to jak kopačka do holeně. Co se to tam dneska dělo?",
      "Prohra {skore}, to jsem teda nečekal. Řekni mi, že příště to bude jinak.",
      "{skore}... Cestou domů jsem nepromluvil ani slovo. Co na to kabina?",
    ],
    patriot: [
      "{skore} doma, to zamrzí. Lidi od nás chtějí vidět bojovat. Co s tím?",
      "Prohra {skore} před vlastníma lidma. Na návsi se o tom už mluví.",
      "{skore}. Domácí hřiště má bejt pevnost. Co se pokazilo?",
    ],
    businessman: [
      "{skore}. Partnera jsem zval na výhru, ne na tohle. Jaký je plán?",
      "Prohra {skore}. Potřebuji vědět, jestli je to výkyv, nebo trend.",
      "{skore} není dobrá vizitka. Jak to chcete napravit?",
    ],
    cautious: [
      "Prohra {skore}. Nechci panikařit, ale jak to vidíte dál?",
      "{skore}. Trochu mě to znejistělo. Je to jen špatný den?",
      "Ta prohra {skore} mi leží v hlavě. Máte to pod kontrolou?",
    ],
  },
  losing_streak: {
    fan: [
      "{serie} v řadě. Já tomu klubu fandím, ale tohle mě ubíjí. Co bude dál?",
      "Už {serie} za sebou. V hospodě se mi smějou. Řekni, že to otočíme.",
      "{serie} v řadě, to je na infarkt. Potřebuju slyšet, že věříte.",
    ],
    patriot: [
      "{serie} v řadě. Obec si nezaslouží koukat se na klub s lítostí.",
      "Lidi se mě ptají, co se děje. {serie} v řadě tu dlouho nebylo.",
      "{serie} za sebou. Klub je srdce vesnice, tak ať zase bije.",
    ],
    businessman: [
      "{serie} v řadě. Jméno mé firmy je na klubu vidět. Chci slyšet plán.",
      "Už {serie} za sebou. Začínám přemýšlet, jestli jsem vsadil dobře.",
      "{serie} v řadě se v kanceláři špatně vysvětluje. Co s tím uděláte?",
    ],
    cautious: [
      "{serie} v řadě. Dělám si starosti. Je v kabině všechno v pořádku?",
      "Už {serie} za sebou. Nerad bych, aby se to táhlo dál. Co plánujete?",
      "{serie} v řadě mě znepokojuje. Můžete mě uklidnit?",
    ],
  },
  riot: {
    fan: [
      "Fandit se má nahlas, ale tohle už bylo moc. Ti blázni kazí jméno nám všem.",
      "Na tribuně to ujelo. Já chci fandit, ne se krčit před lahvema.",
      "Chápu vášeň, sám jsem blázen do fotbalu. Ale výtržnosti? To ne.",
    ],
    patriot: [
      "Výtržnost na našem hřišti. Tohle se o vesnici bude vyprávět ještě dlouho.",
      "Stydím se. Na návsi se mluví jen o tom, co vyváděli fanoušci.",
      "Naše hřiště není místo pro rvačky. Ať si to ti kluci srovnají.",
    ],
    businessman: [
      "Výtržnost na stadionu je pro moji značku problém. Jak to vyřešíte?",
      "Zákazníci se mě ptají na ty výtržnosti. Tohle mi dělá ostudu.",
      "Potřebuji ujištění, že se to nebude opakovat. Jinak to bude těžké.",
    ],
    cautious: [
      "Po té výtržnosti nevím, jestli je bezpečné tam chodit. Co s tím uděláte?",
      "Tohle mě vyděsilo. Nechci, aby moje firma byla spojená s násilím.",
      "Výtržnosti jsou přesně to, čeho jsem se bál. Jak to chcete zajistit?",
    ],
  },
  main_lost: {
    fan: [
      "Tak to je konec, co? Klubu budu fandit dál, ale mrzí mě to.",
      "Nečekal jsem, že skončíme. Srdce mám pořád u vás, jen peníze půjdou jinam.",
      "Konec smlouvy mě zamrzel. Na tribunu chodit nepřestanu.",
    ],
    patriot: [
      "Končíme. Škoda, bral jsem to jako službu vesnici, ne jako obchod.",
      "Že už nejsem hlavní sponzor, mě mrzí. Klub je pořád náš, to si pamatuj.",
      "Naše spolupráce skončila. Doufám, že se klub o sebe postará.",
    ],
    businessman: [
      "Beru na vědomí, že spolupráce končí. Obchod je obchod.",
      "Konec smlouvy. Kdyby se situace změnila, víte, kde mě najdete.",
      "Takže končíme. Věřím, že máte lepší nabídku, jinak bych to nechápal.",
    ],
    cautious: [
      "Takže konec. Asi to tak mělo být, ale trochu mě to zaskočilo.",
      "Spolupráce skončila. Doufám, že jsem vám nic neudělal špatně.",
      "Beru to. Přeji klubu, ať se daří i beze mě.",
    ],
  },
  main_new: {
    fan: [
      "Jsem hlavní sponzor! Splnil se mi klukovskej sen. Jdeme na to!",
      "Moje firma na dresu, to je paráda. Budu na každým zápase.",
      "Tak jsme partneři! Slibuju, že budu řvát nejvíc z celý tribuny.",
    ],
    patriot: [
      "Je mi ctí podporovat náš klub. Pro vesnici udělám, co bude v mých silách.",
      "Hlavní sponzor našeho klubu, to je závazek. Nezklamu vás.",
      "Konečně pomáhám tam, kde jsem vyrostl. Ať se klubu daří.",
    ],
    businessman: [
      "Smlouva je podepsaná. Těším se na spolupráci a na viditelnost.",
      "Vítejte v partnerství. Očekávám slušnou reprezentaci značky.",
      "Tak jsme partneři. Dobré výsledky pomůžou nám oběma.",
    ],
    cautious: [
      "Podepsáno. Snad jsem udělal dobře. Věřím, že klub bude v klidu.",
      "Tak jsme spolu. Doufám, že to bude spolupráce bez nepříjemných překvapení.",
      "Jsem rád za dohodu. Hlavně ať je kolem klubu klid a pořádek.",
    ],
  },
  season_thanks: {
    fan: [
      "Jaká sezóna! Každej zápas stál za to. Díky za všechno.",
      "Tuhle sezónu budu vyprávět vnoučatům. Díky moc.",
      "Sezóna jak z pohádky. Už se nemůžu dočkat další.",
    ],
    patriot: [
      "Díky za sezónu. Vesnice byla na klub zase pyšná.",
      "Tahle sezóna udělala obci radost. Takhle dál.",
      "Poctivá sezóna, na kterou se v obci bude vzpomínat. Díky.",
    ],
    businessman: [
      "Sezóna splnila očekávání. Spolupráce se vyplácí, děkuji.",
      "Dobrá sezóna, dobrá čísla. Rád pokračuji.",
      "Z pohledu firmy povedená sezóna. Děkuji za reprezentaci.",
    ],
    cautious: [
      "Klidná a povedená sezóna. Přesně tak to mám rád. Děkuji.",
      "Žádné velké průšvihy a slušné výsledky. Děkuji za sezónu.",
      "Jsem spokojený. Děkuji, že to celou sezónu drželo pohromadě.",
    ],
  },
  season_complaint: {
    fan: [
      "Sezóna na zapomenutí. Pořád fandím, ale bolí to. Co bude příště?",
      "Tolik proher jsem nečekal. Řekni mi, že se to změní.",
      "Tahle sezóna mě stála nervy. Potřebuju slyšet, že věříte v lepší.",
    ],
    patriot: [
      "Obec si zaslouží víc, než co jsme letos viděli. Co s tím?",
      "Lidi v obci jsou ze sezóny zklamaní. Jak to chceš napravit?",
      "Letos to klubu nešlo. Vesnice čeká, že se zvedne.",
    ],
    businessman: [
      "Sezóna pod očekávání. Potřebuji vidět plán na tu další.",
      "Čísla nejsou dobrá. Zvažuji, jestli pokračovat.",
      "Letos jsem za své peníze neviděl moc. Co se změní?",
    ],
    cautious: [
      "Sezóna mi dělala starosti. Jak to vidíte dál?",
      "Nebyla to dobrá sezóna. Nechci panikařit, ale potřebuji ujištění.",
      "Letos to bylo nejisté. Máte plán, jak to zklidnit?",
    ],
  },
  scandal: {
    cautious: [
      "Slyšel jsem, co se u vás stalo. Tohle mi dělá velké starosti. Jak to řešíte?",
      "Ta aféra v klubu mě znepokojuje. Nechci být spojovaný s průšvihy.",
      "Co se to u vás děje? Potřebuji vědět, že to máte pod kontrolou.",
      "Lidi už o tom mluví. Moje firma si nemůže dovolit ostudu. Co s tím?",
      "Tohle je přesně to, čeho se bojím. Vysvětlíte mi to?",
    ],
  },
};

/** „3 prohry" / „5 proher". Šablona počet neohýbá, jinak vzniká „5 prohry". */
export function proherTvar(n: number): string {
  const k = Math.max(0, Math.round(n));
  return k >= 2 && k <= 4 ? `${k} prohry` : `${k} proher`;
}

function fill(t: string, vars: OwnerSmsVars): string {
  return t.replace(/\{skore\}/g, vars.skore ?? "").replace(/\{serie\}/g, proherTvar(vars.serie ?? 3));
}

/**
 * Text SMS. Deterministicky podle `seedKey` (reference spouštěče), s vynecháním
 * textů, které klub nedávno dostal (`recent` = vyrenderovaná těla). `null` = majitel
 * s touhle povahou k téhle příležitosti nepíše, nebo chybí proměnná šablony.
 */
export function renderOwnerSms(
  occasion: OwnerSmsOccasion, personality: OwnerPersonality, vars: OwnerSmsVars, seedKey: string, recent: readonly string[],
): string | null {
  const pool = OWNER_SMS_TEXTS[occasion][personality];
  if (!pool || pool.length === 0) return null;
  if (pool.some((t) => t.includes("{skore}")) && !vars.skore) return null;
  const rendered = pool.map((t) => fill(t, vars));
  const fresh = rendered.filter((t) => !recent.includes(t));
  return createRng(seedFromString(seedKey)).pick(fresh.length > 0 ? fresh : rendered);
}

type ReplyKind = "positive" | "concern" | "trouble" | "farewell";

const OCCASION_REPLY_KIND: Record<OwnerSmsOccasion, ReplyKind> = {
  match_eve: "positive",
  after_win: "positive",
  main_new: "positive",
  season_thanks: "positive",
  after_loss: "concern",
  losing_streak: "concern",
  season_complaint: "concern",
  riot: "trouble",
  scandal: "trouble",
  main_lost: "farewell",
};

const REPLY_OPTION_TEXTS: Record<ReplyKind, Record<ReplyTone, string>> = {
  positive: {
    warm: "Díky moc, vážíme si vás. Bez vás by to nešlo.",
    neutral: "Díky za zprávu.",
    dismissive: "Jo, jasně.",
  },
  concern: {
    warm: "Chápu vás. Makáme na tom a věřím, že to otočíme.",
    neutral: "Víme o tom a řešíme to.",
    dismissive: "Fotbal je fotbal, to se stává.",
  },
  trouble: {
    warm: "Mrzí mě to. Beru to vážně a zjednám pořádek.",
    neutral: "Situaci řešíme.",
    dismissive: "To se vás netýká.",
  },
  farewell: {
    warm: "Děkujeme za všechno, dveře u nás máte otevřené.",
    neutral: "Beru na vědomí, díky za spolupráci.",
    dismissive: "Tak nic, sbohem.",
  },
};

const TONE_LABELS: Record<ReplyTone, string> = { warm: "Vlídně", neutral: "Věcně", dismissive: "Odbýt" };

export interface ReplyOption {
  id: ReplyTone;
  label: string;
  text: string;
}

/** Tři hotové odpovědi trenéra. Jdou do `messages.metadata.options`, telefon z nich dělá tlačítka. */
export function replyOptions(occasion: OwnerSmsOccasion): ReplyOption[] {
  const kind = OCCASION_REPLY_KIND[occasion];
  return REPLY_TONES.map((id) => ({ id, label: TONE_LABELS[id], text: REPLY_OPTION_TEXTS[kind][id] }));
}

export const OWNER_REPLY_BACK: Record<OwnerPersonality, Record<"up" | "flat" | "down", readonly string[]>> = {
  fan: {
    up: ["To rád slyším! Jdeme dál.", "Paráda, na vás je spoleh.", "Díky, hned je mi líp."],
    flat: ["Dobře.", "Hm, tak jo.", "Beru."],
    down: ["Tak to mě mrzí. Čekal jsem víc.", "Aha. Tak nic.", "To jsem slyšet nechtěl."],
  },
  patriot: {
    up: ["Díky. Pro obec je to důležitý.", "Tak to je řeč. Držím palce.", "To rád slyším, vesnice to ocení."],
    flat: ["Dobře, uvidíme.", "Beru na vědomí.", "Tak jo."],
    down: ["Takhle se o klub nestará. Zapamatuju si to.", "To mě zklamalo.", "Škoda. Čekal jsem víc zájmu."],
  },
  businessman: {
    up: ["Výborně, to je jasná řeč.", "Děkuji, tohle potřebuji vědět.", "Dobře, s tím se dá pracovat."],
    flat: ["Rozumím.", "Beru na vědomí.", "Dobře."],
    down: ["To mi nestačí.", "S takovým přístupem těžko budeme pokračovat.", "Poznamenám si to."],
  },
  cautious: {
    up: ["Děkuji, to mě uklidnilo.", "Jsem rád, že to berete vážně.", "Dobře, věřím vám."],
    flat: ["Dobře. Uvidíme.", "Rozumím.", "Snad to tak bude."],
    down: ["To mě moc neuklidnilo.", "Tak to mám ještě větší obavy.", "Hm. Budu opatrnější."],
  },
};

/** Co majitel odepíše na trenérovu odpověď, podle toho, kam se náklonnost pohnula. */
export function ownerReplyBack(personality: OwnerPersonality, favorDelta: number, seedKey: string): string {
  const mood = favorDelta > 0 ? "up" : favorDelta < 0 ? "down" : "flat";
  return createRng(seedFromString(seedKey)).pick(OWNER_REPLY_BACK[personality][mood]);
}
```

- [ ] **Step 5: Napsat `owner-sms-rules.ts`**

```ts
/**
 * SMS od majitelů firem: pravidla bez DB. Kdy smí zpráva odejít, kolik stojí
 * odpověď a mlčení, kterého majitele vybrat.
 */
import { klasifikujOdpoved } from "../engine/fan-reactions";
import { gameExpiry } from "../lib/game-time";
import type { OwnerPersonality } from "./owners";
import type { OwnerSmsOccasion, ReplyTone } from "./owner-sms-texts";

/** Kolik herních dní majitel vůči jednomu klubu mlčí po odeslané SMS. */
export const OWNER_SMS_COOLDOWN_DAYS = 5;
/** Kolik herních dní má trenér na odpověď. */
export const OWNER_SMS_REPLY_DAYS = 3;
/** Od kolika proher v řadě se majitel ozve. */
export const LOSING_STREAK_MIN = 3;

export interface OccasionRule {
  /** Čeká majitel odpověď? Jen pak mlčení stojí náklonnost. */
  expectsReply: boolean;
  /** Nižší = důležitější, vyhrává při souběhu více kandidátů. */
  priority: number;
  /** Kolik herních dní po zařazení smí SMS ještě odejít (0 = jen ten den). */
  deliverDays: number;
}

export const OCCASION_RULES: Record<OwnerSmsOccasion, OccasionRule> = {
  riot: { expectsReply: true, priority: 1, deliverDays: 2 },
  scandal: { expectsReply: true, priority: 2, deliverDays: 3 },
  main_lost: { expectsReply: true, priority: 3, deliverDays: 3 },
  after_loss: { expectsReply: true, priority: 4, deliverDays: 1 },
  after_win: { expectsReply: false, priority: 5, deliverDays: 1 },
  losing_streak: { expectsReply: true, priority: 6, deliverDays: 2 },
  match_eve: { expectsReply: false, priority: 7, deliverDays: 0 },
  main_new: { expectsReply: false, priority: 8, deliverDays: 3 },
  season_complaint: { expectsReply: true, priority: 9, deliverDays: 3 },
  season_thanks: { expectsReply: false, priority: 10, deliverDays: 3 },
};

/** Není správná odpověď pro všechny: podnikateli sedí věcnost, fanouškovi srdce. */
const REPLY_FAVOR: Record<OwnerPersonality, Record<ReplyTone, number>> = {
  fan: { warm: 3, neutral: 0, dismissive: -4 },
  patriot: { warm: 2, neutral: 0, dismissive: -3 },
  businessman: { warm: 1, neutral: 2, dismissive: -2 },
  cautious: { warm: 2, neutral: 0, dismissive: -3 },
};

const IGNORE_FAVOR: Record<OwnerPersonality, number> = { fan: -2, patriot: -2, businessman: -1, cautious: -2 };

export function replyFavorDelta(personality: OwnerPersonality, tone: ReplyTone): number {
  return REPLY_FAVOR[personality][tone];
}

export function ignoreFavorDelta(personality: OwnerPersonality): number {
  return IGNORE_FAVOR[personality];
}

/**
 * Tón odpovědi napsané vlastními slovy. Stejný lexikální klasifikátor jako u vůdce
 * fanoušků (`klasifikujOdpoved`), bez modelu.
 */
export function classifyFreeReply(text: string): ReplyTone {
  const postoj = klasifikujOdpoved(text);
  if (postoj === "uklidnit") return "warm";
  if (postoj === "postavit_se") return "dismissive";
  return text.trim().length < 8 ? "dismissive" : "neutral";
}

/** Herní den + N dní, výstup YYYY-MM-DD. Vstup YYYY-MM-DD i celé ISO. */
export function addDays(day: string, n: number): string {
  return gameExpiry(`${day.slice(0, 10)}T00:00:00.000Z`, n).slice(0, 10);
}

/** Vzdálenost dvou herních dní v dnech, bez znaménka (rollover vrací čas zpátky). */
export function dayDiff(a: string, b: string): number {
  return Math.abs(Date.parse(`${a.slice(0, 10)}T00:00:00.000Z`) - Date.parse(`${b.slice(0, 10)}T00:00:00.000Z`)) / 86_400_000;
}

export interface PendingOwnerSms {
  id: string;
  sponsorId: number;
  occasion: OwnerSmsOccasion;
  createdDay: string;
}

export interface SentOwnerSms {
  sponsorId: number;
  occasion: OwnerSmsOccasion;
  sentDay: string;
}

function blockedByCooldown(c: PendingOwnerSms, s: SentOwnerSms, today: string): boolean {
  if (s.sponsorId !== c.sponsorId) return false;
  if (dayDiff(s.sentDay, today) >= OWNER_SMS_COOLDOWN_DAYS) return false;
  // Den před zápasem a zpráva po něm patří k sobě: „zítra jsem tam" i „to byl zápas".
  const afterMatch = c.occasion === "after_win" || c.occasion === "after_loss";
  return !(afterMatch && s.occasion === "match_eve");
}

/**
 * Která čekající SMS smí dnes odejít. Nejvýš jedna SMS od majitelů na klub a den,
 * majitel po své SMS OWNER_SMS_COOLDOWN_DAYS dní mlčí. Při souběhu vyhraje priorita.
 */
export function pickDeliverable(
  pending: readonly PendingOwnerSms[], sent: readonly SentOwnerSms[], today: string,
): PendingOwnerSms | null {
  const day = today.slice(0, 10);
  if (sent.some((s) => s.sentDay.slice(0, 10) === day)) return null;
  const sorted = [...pending].sort((a, b) =>
    OCCASION_RULES[a.occasion].priority - OCCASION_RULES[b.occasion].priority
    || a.createdDay.localeCompare(b.createdDay)
    || a.id.localeCompare(b.id));
  return sorted.find((c) => !sent.some((s) => blockedByCooldown(c, s, day))) ?? null;
}

export interface RelationshipOwner {
  sponsorId: number;
  personality: OwnerPersonality;
  favor: number;
  hasContract: boolean;
  isMain: boolean;
}

/**
 * Kdo z majitelů, se kterými má klub vztah, se ozve. Hlavní sponzor má přednost,
 * pak kdokoli se smlouvou, pak vyšší náklonnost. `only` zúží na jednu povahu,
 * `prefer` jí dá přednost i před hlavním sponzorem.
 */
export function pickRelationshipOwner(
  owners: readonly RelationshipOwner[], opts: { only?: OwnerPersonality; prefer?: OwnerPersonality } = {},
): RelationshipOwner | null {
  const pool = opts.only ? owners.filter((o) => o.personality === opts.only) : owners;
  const score = (o: RelationshipOwner) =>
    (opts.prefer && o.personality === opts.prefer ? 1000 : 0) + (o.isMain ? 500 : 0) + (o.hasContract ? 200 : 0) + o.favor;
  return [...pool].sort((a, b) => score(b) - score(a) || a.sponsorId - b.sponsorId)[0] ?? null;
}

/** Poděkování, nebo stížnost za sezónu: hranice 1,2 bodu na zápas. */
export function seasonVerdict(wins: number, draws: number, played: number): "season_thanks" | "season_complaint" | null {
  if (played <= 0) return null;
  return (3 * wins + draws) / played >= 1.2 ? "season_thanks" : "season_complaint";
}

/** Zápas z pohledu domácích. Remíza SMS nevyvolá. */
export function occasionForResult(our: number, their: number): "after_win" | "after_loss" | null {
  if (our > their) return "after_win";
  if (our < their) return "after_loss";
  return null;
}

/** Kolik proher v řadě od posledního zápasu (výsledky od nejnovějšího). */
export function leadingLosses(results: readonly ("W" | "D" | "L")[]): number {
  let n = 0;
  for (const r of results) {
    if (r !== "L") break;
    n++;
  }
  return n;
}
```

- [ ] **Step 6: Přidat důvody do `FAVOR_REASONS`**

V `apps/api/src/sponsors/favor-math.ts` nahradit:

```ts
  seasonPartnership: "sezóna spolupráce s hlavním sponzorem",
} as const;
```

za:

```ts
  seasonPartnership: "sezóna spolupráce s hlavním sponzorem",
  smsReply: "odpověď na SMS",
  smsDismissed: "odbytá SMS",
  smsIgnored: "neodpověděl na SMS",
} as const;
```

- [ ] **Step 7: Spustit testy**

Run: `cd /Users/savrik/Projects/fmko/apps/api && npx vitest run src/sponsors/owner-sms-texts.test.ts src/sponsors/owner-sms-rules.test.ts src/sponsors/favor-math.test.ts`
Expected: `Test Files  3 passed (3)`, žádný FAIL.

- [ ] **Step 8: Typecheck**

Run: `cd /Users/savrik/Projects/fmko && npm run typecheck`
Expected: všechny balíčky bez chyby (`Tasks: … successful`).

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/sponsors/owner-sms-texts.ts apps/api/src/sponsors/owner-sms-rules.ts \
  apps/api/src/sponsors/owner-sms-texts.test.ts apps/api/src/sponsors/owner-sms-rules.test.ts \
  apps/api/src/sponsors/favor-math.ts
git commit -m "$(cat <<'EOF'
feat(sponzori): sablony, pravidla a dopady SMS od majitelu firem

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: DB vrstva: fronta, doručení, odpověď, mlčení (s testy)

**Files:**
- Create: `apps/api/src/sponsors/owner-sms.ts`
- Create: `apps/api/src/sponsors/owner-sms.test.ts`
- Modify: `apps/api/src/messaging/system-sms.ts` (nový export `sendOwnerSMS` na konec souboru)

**Interfaces:**
- Consumes: Task 2 (vše z `owner-sms-texts.ts`, `owner-sms-rules.ts`, `FAVOR_REASONS`), `ensureSponsorOwner`, `ensureSponsorOwners`, `favorDeltaStmts` (`./favor`), `DEFAULT_FAVOR` (`./favor-math`), `isOwnerPersonality` (`./owners`), `logger`, `FalesnaD1`/`jakoD1` (`../incidents/testovaci-d1`, jen testy).
- Produces:
  - `sendOwnerSMS(db, teamId, owner: { sponsorId; name; firmName; avatar }, body, opts: { smsId; options }): Promise<string | null>`
  - `teamGameDay(db, teamId): Promise<string | null>`
  - `OwnerSmsRequest`, `enqueueOwnerSms(db, r): Promise<boolean>`
  - `loadRelationshipOwners(db, teamId): Promise<RelationshipOwner[]>`
  - `deliverOwnerSmsForTeam(db, teamId, todayIso?): Promise<boolean>`
  - `handleOwnerSmsReply(db, convId, text, optionId): Promise<boolean>`
  - `expireOwnerSmsReplies(db, today): Promise<number>`
  - `closeOwnerSmsForRollover(db): Promise<void>`
  - Stav vlákna v `conversations.ai_thread_state`: `{ kind: "sponsor_owner", smsId, sponsorId, awaiting: "coach" }`; metadata zprávy `{ type: "sponsor_owner", smsId, options: ReplyOption[] }`; `participant_id = "so-{sponsorId}"`.

- [ ] **Step 1: Napsat test (selže, modul neexistuje)**

`apps/api/src/sponsors/owner-sms.test.ts`:

```ts
/**
 * DB vrstva SMS od majitelů nad falešnou D1: odpověď zapisuje náklonnost přes deník,
 * dvojí odpověď dopad nezdvojí, mlčení stojí jen tam, kde se čekala odpověď,
 * a denní limit zastaví doručení.
 */
import { describe, expect, it } from "vitest";
import { FalesnaD1, jakoD1 } from "../incidents/testovaci-d1";
import { deliverOwnerSmsForTeam, expireOwnerSmsReplies, handleOwnerSmsReply } from "./owner-sms";

const STAV = JSON.stringify({ kind: "sponsor_owner", smsId: "s1", sponsorId: 7, awaiting: "coach" });
const MAJITEL = {
  sql: /FROM sponsor_owners WHERE sponsor_id IN/,
  all: [{ sponsor_id: 7, first_name: "Jan", last_name: "Novák", age: 50, face_config: "{}", personality: "fan" }],
};

function logDeniku(db: FalesnaD1) {
  return db.davky.flat().filter((d) => /INSERT INTO sponsor_favor_log/.test(d.sql));
}

describe("handleOwnerSmsReply", () => {
  it("vlídná odpověď fanouškovi: +3 s důvodem do deníku a zavřené vlákno", async () => {
    const db = new FalesnaD1([
      { sql: /SELECT team_id, ai_thread_state FROM conversations/, first: { team_id: "t1", ai_thread_state: STAV } },
      { sql: /UPDATE sponsor_owner_sms SET status = 'replied'/, changes: 1 },
      MAJITEL,
    ]);
    expect(await handleOwnerSmsReply(jakoD1(db), "c1", "Díky moc", "warm")).toBe(true);
    const log = logDeniku(db);
    expect(log).toHaveLength(1);
    expect(log[0].params.slice(0, 4)).toEqual([7, "t1", 3, "odpověď na SMS"]);
    expect(db.pocet(/ai_thread_active = 0, ai_thread_state = NULL/)).toBe(1);
    expect(db.pocet(/INSERT INTO messages/)).toBe(1);
  });

  it("odpověď vlastními slovy se klasifikuje lexikálně", async () => {
    const db = new FalesnaD1([
      { sql: /SELECT team_id, ai_thread_state FROM conversations/, first: { team_id: "t1", ai_thread_state: STAV } },
      { sql: /UPDATE sponsor_owner_sms SET status = 'replied'/, changes: 1 },
      MAJITEL,
    ]);
    await handleOwnerSmsReply(jakoD1(db), "c1", "Konec debaty, rozhoduju já.", null);
    expect(logDeniku(db)[0].params.slice(2, 4)).toEqual([-4, "odbytá SMS"]);
  });

  it("SMS už je vyřízená: náklonnost se nepohne", async () => {
    const db = new FalesnaD1([
      { sql: /SELECT team_id, ai_thread_state FROM conversations/, first: { team_id: "t1", ai_thread_state: STAV } },
      { sql: /UPDATE sponsor_owner_sms SET status = 'replied'/, changes: 0 },
      MAJITEL,
    ]);
    expect(await handleOwnerSmsReply(jakoD1(db), "c1", "Díky", "warm")).toBe(true);
    expect(logDeniku(db)).toHaveLength(0);
  });

  it("cizí vlákno (vůdce fanoušků) nechá být", async () => {
    const db = new FalesnaD1([
      { sql: /SELECT team_id, ai_thread_state FROM conversations/, first: { team_id: "t1", ai_thread_state: JSON.stringify({ kind: "fan_leader" }) } },
    ]);
    expect(await handleOwnerSmsReply(jakoD1(db), "c1", "Díky", "warm")).toBe(false);
    expect(db.pocet(/UPDATE sponsor_owner_sms/)).toBe(0);
  });
});

describe("expireOwnerSmsReplies", () => {
  it("mlčení u zprávy, která čekala odpověď, stojí náklonnost", async () => {
    const db = new FalesnaD1([
      { sql: /WHERE s.status = 'awaiting' AND s.reply_by/, all: [
        { id: "s1", sponsor_id: 7, team_id: "t1", expects_reply: 1, conversation_id: "c1", personality: "fan" },
        { id: "s2", sponsor_id: 8, team_id: "t1", expects_reply: 0, conversation_id: "c2", personality: "fan" },
      ] },
    ]);
    expect(await expireOwnerSmsReplies(jakoD1(db), "2026-09-23")).toBe(2);
    const log = logDeniku(db);
    expect(log).toHaveLength(1);
    expect(log[0].params.slice(0, 4)).toEqual([7, "t1", -2, "neodpověděl na SMS"]);
  });
});

describe("deliverOwnerSmsForTeam", () => {
  const FRONTA = {
    sql: /SELECT id, sponsor_id, occasion, created_day, reference_id, vars FROM sponsor_owner_sms/,
    all: [{ id: "s1", sponsor_id: 7, occasion: "riot", created_day: "2026-09-23", reference_id: "riot:m1", vars: "{}" }],
  };

  it("dnes už majitel psal: nic neodejde", async () => {
    const db = new FalesnaD1([
      FRONTA,
      { sql: /SELECT sponsor_id, occasion, sent_day FROM sponsor_owner_sms/, all: [{ sponsor_id: 9, occasion: "after_win", sent_day: "2026-09-23" }] },
    ]);
    expect(await deliverOwnerSmsForTeam(jakoD1(db), "t1", "2026-09-23T16:00:00.000Z")).toBe(false);
    expect(db.pocet(/INSERT INTO messages/)).toBe(0);
  });

  it("doručí SMS s nabídkou odpovědí do vlákna majitele", async () => {
    const db = new FalesnaD1([
      FRONTA,
      { sql: /SELECT sponsor_id, occasion, sent_day FROM sponsor_owner_sms/, all: [] },
      { sql: /SET status = 'awaiting', sent_day/, changes: 1 },
      { sql: /FROM sponsor_owners WHERE sponsor_id IN/, all: [
        { sponsor_id: 7, first_name: "Jan", last_name: "Novák", age: 50, face_config: "{}", personality: "cautious" },
      ] },
      { sql: /SELECT name FROM district_sponsors/, first: { name: "Pekařství Novák" } },
    ]);
    expect(await deliverOwnerSmsForTeam(jakoD1(db), "t1", "2026-09-23T16:00:00.000Z")).toBe(true);
    const msg = db.dotazy.find((d) => /INSERT INTO messages/.test(d.sql));
    expect(msg?.params[2]).toBe("so-7");
    expect(String(msg?.params[5])).toContain("\"type\":\"sponsor_owner\"");
    expect(String(msg?.params[5])).toContain("\"id\":\"dismissive\"");
  });
});
```

- [ ] **Step 2: Spustit test, ověřit že selže**

Run: `cd /Users/savrik/Projects/fmko/apps/api && npx vitest run src/sponsors/owner-sms.test.ts`
Expected: FAIL, `Failed to resolve import "./owner-sms"`.

- [ ] **Step 3: Přidat `sendOwnerSMS` na konec `apps/api/src/messaging/system-sms.ts`**

```ts
/**
 * Pošle zprávu OD MAJITELE FIRMY (sponzora) a otevře vlákno pro odpověď.
 *
 * Stejný princip jako `sendLeaderSMS`: konverzace klíčovaná `participant_id`
 * (`so-{sponsorId}`), avatar z obličeje majitele, odpověď zpracuje
 * `handleOwnerSmsReply` bez modelu (iMessage, zdarma). Nabídka odpovědí jde do
 * `messages.metadata`, telefon z ní dělá tlačítka.
 */
export async function sendOwnerSMS(
  db: D1Database,
  teamId: string,
  owner: { sponsorId: number; name: string; firmName: string | null; avatar: string },
  body: string,
  opts: { smsId: string; options: Array<{ id: string; label: string; text: string }> },
): Promise<string | null> {
  const participantId = `so-${owner.sponsorId}`;
  const title = owner.firmName ? `${owner.name} (${owner.firmName})` : owner.name;
  try {
    let convId = await db
      .prepare("SELECT id FROM conversations WHERE team_id = ? AND type = 'system' AND participant_id = ?")
      .bind(teamId, participantId).first<{ id: string }>().then((r) => r?.id);

    if (!convId) {
      convId = crypto.randomUUID();
      await db.prepare(
        `INSERT INTO conversations
          (id, team_id, type, title, participant_id, participant_avatar, pinned, unread_count,
           last_message_text, last_message_at, created_at)
         VALUES (?, ?, 'system', ?, ?, ?, 0, 0, '', strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now'))`,
      ).bind(convId, teamId, title, participantId, owner.avatar).run();
    }

    await db.prepare(
      `INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, metadata, sent_at)
       VALUES (?, ?, 'system', ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))`,
    ).bind(crypto.randomUUID(), convId, participantId, owner.name, body,
      JSON.stringify({ type: "sponsor_owner", smsId: opts.smsId, options: opts.options })).run();

    await db.prepare(
      `UPDATE conversations SET unread_count = unread_count + 1, last_message_text = ?, title = ?,
         last_message_at = strftime('%Y-%m-%dT%H:%M:%SZ','now'),
         ai_thread_active = 1, ai_thread_state = ?
       WHERE id = ?`,
    ).bind(
      body.slice(0, 100), title,
      JSON.stringify({ kind: "sponsor_owner", smsId: opts.smsId, sponsorId: owner.sponsorId, awaiting: "coach" }),
      convId,
    ).run();

    return convId;
  } catch (e) {
    logger.warn({ module: "system-sms", teamId }, `SMS od majitele firmy ${owner.sponsorId}`, e);
    return null;
  }
}
```

Poznámka k testu: parametry `INSERT INTO messages` jsou `(id, convId, participantId, name, body, metadata)`, test proto čte `params[2]` a `params[5]`.

- [ ] **Step 4: Napsat `apps/api/src/sponsors/owner-sms.ts`**

```ts
/**
 * SMS od majitelů firem: fronta, doručení do telefonu, odpověď trenéra a mlčení.
 *
 * Spouštěče jen zapisují do fronty (`enqueueOwnerSms`, idempotentně přes reference_id).
 * Doručuje `deliverOwnerSmsForTeam`: nejvýš jedna SMS od majitelů na klub a herní den,
 * majitel pak OWNER_SMS_COOLDOWN_DAYS dní mlčí. Bez modelu a bez kreditu, stejně jako
 * vůdce fanoušků (fans/fan-leader-reply.ts). Každá změna náklonnosti jde přes
 * `favorDeltaStmts`, tedy s deníkem pro záložku Oblíbenost.
 */
import { logger } from "../lib/logger";
import { sendOwnerSMS } from "../messaging/system-sms";
import { ensureSponsorOwner, ensureSponsorOwners, favorDeltaStmts } from "./favor";
import { DEFAULT_FAVOR, FAVOR_REASONS } from "./favor-math";
import {
  addDays, classifyFreeReply, ignoreFavorDelta, OCCASION_RULES, OWNER_SMS_COOLDOWN_DAYS, OWNER_SMS_REPLY_DAYS,
  pickDeliverable, replyFavorDelta, type RelationshipOwner,
} from "./owner-sms-rules";
import {
  isOwnerSmsOccasion, isReplyTone, ownerReplyBack, renderOwnerSms, replyOptions,
  type OwnerSmsOccasion, type OwnerSmsVars, type ReplyTone,
} from "./owner-sms-texts";
import { isOwnerPersonality, type OwnerPersonality } from "./owners";

const M = "owner-sms";

/** Herní den klubu (YYYY-MM-DD) z `teams.game_date`. */
export async function teamGameDay(db: D1Database, teamId: string): Promise<string | null> {
  const row = await db.prepare("SELECT game_date FROM teams WHERE id = ?")
    .bind(teamId).first<{ game_date: string | null }>();
  return row?.game_date ? row.game_date.slice(0, 10) : null;
}

export interface OwnerSmsRequest {
  sponsorId: number;
  teamId: string;
  occasion: OwnerSmsOccasion;
  /** Stabilní klíč spouštěče, např. `riot:{matchId}`. */
  referenceId: string;
  /** Herní den zařazení (YYYY-MM-DD nebo ISO). */
  day: string;
  vars?: OwnerSmsVars;
}

/** Zařadí SMS do fronty. Jen lidský seniorský klub; tatáž reference podruhé nic nezapíše. */
export async function enqueueOwnerSms(db: D1Database, r: OwnerSmsRequest): Promise<boolean> {
  const rule = OCCASION_RULES[r.occasion];
  const day = r.day.slice(0, 10);
  const res = await db.prepare(
    `INSERT OR IGNORE INTO sponsor_owner_sms
       (id, sponsor_id, team_id, occasion, reference_id, expects_reply, status, vars, created_day, deliver_by)
     SELECT ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?
     WHERE EXISTS (SELECT 1 FROM teams t WHERE t.id = ? AND t.user_id != 'ai'
                     AND COALESCE(t.team_type, 'senior') != 'u21' AND t.name NOT LIKE 'DELETED-%')`,
  ).bind(
    crypto.randomUUID(), r.sponsorId, r.teamId, r.occasion, r.referenceId, rule.expectsReply ? 1 : 0,
    JSON.stringify(r.vars ?? {}), day, addDays(day, rule.deliverDays), r.teamId,
  ).run();
  return (res.meta?.changes ?? 0) > 0;
}

/** Majitelé, se kterými má klub vztah: řádek náklonnosti nebo aktivní smlouva. */
export async function loadRelationshipOwners(db: D1Database, teamId: string): Promise<RelationshipOwner[]> {
  const rows = await db.prepare(
    `WITH rel AS (
       SELECT sponsor_id FROM sponsor_team_favor WHERE team_id = ?1
       UNION
       SELECT sponsor_id FROM sponsor_contracts WHERE team_id = ?1 AND status = 'active' AND sponsor_id IS NOT NULL
     )
     SELECT rel.sponsor_id,
            COALESCE((SELECT favor FROM sponsor_team_favor f WHERE f.sponsor_id = rel.sponsor_id AND f.team_id = ?1), ?2) AS favor,
            EXISTS (SELECT 1 FROM sponsor_contracts sc WHERE sc.sponsor_id = rel.sponsor_id AND sc.team_id = ?1
                      AND sc.status = 'active') AS has_contract,
            EXISTS (SELECT 1 FROM sponsor_contracts sc WHERE sc.sponsor_id = rel.sponsor_id AND sc.team_id = ?1
                      AND sc.status = 'active' AND COALESCE(sc.category, 'main') = 'main') AS is_main
     FROM rel`,
  ).bind(teamId, DEFAULT_FAVOR).all<{ sponsor_id: number; favor: number; has_contract: number; is_main: number }>();
  if (rows.results.length === 0) return [];
  const owners = await ensureSponsorOwners(db, rows.results.map((r) => r.sponsor_id));
  const out: RelationshipOwner[] = [];
  for (const r of rows.results) {
    const o = owners.get(r.sponsor_id);
    if (!o) continue;
    out.push({ sponsorId: r.sponsor_id, personality: o.personality, favor: r.favor, hasContract: r.has_contract === 1, isMain: r.is_main === 1 });
  }
  return out;
}

function parseVars(raw: string | null): OwnerSmsVars {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as OwnerSmsVars;
  } catch (e) {
    logger.warn({ module: M }, "nečitelné proměnné SMS majitele", e);
    return {};
  }
}

interface PendingRow {
  id: string; sponsor_id: number; occasion: string; created_day: string; reference_id: string; vars: string | null;
}

/**
 * Pošle klubu nejvýš jednu čekající SMS od majitele. `todayIso` = herní den ticku;
 * bez něj se vezme `teams.game_date` (match-runner, routy). Vrací, jestli SMS odešla.
 */
export async function deliverOwnerSmsForTeam(db: D1Database, teamId: string, todayIso?: string): Promise<boolean> {
  const today = (todayIso ?? (await teamGameDay(db, teamId)) ?? "").slice(0, 10);
  if (!today) return false;

  await db.prepare("UPDATE sponsor_owner_sms SET status = 'dropped' WHERE team_id = ? AND status = 'pending' AND deliver_by < ?")
    .bind(teamId, today).run();

  const pending = await db.prepare(
    "SELECT id, sponsor_id, occasion, created_day, reference_id, vars FROM sponsor_owner_sms WHERE team_id = ? AND status = 'pending'",
  ).bind(teamId).all<PendingRow>();
  if (pending.results.length === 0) return false;

  // ABS: rollover vrací herní čas zpátky, starší odeslání pak leží „v budoucnu".
  const sent = await db.prepare(
    `SELECT sponsor_id, occasion, sent_day FROM sponsor_owner_sms
     WHERE team_id = ? AND sent_day IS NOT NULL AND ABS(julianday(sent_day) - julianday(?)) < ?`,
  ).bind(teamId, today, OWNER_SMS_COOLDOWN_DAYS).all<{ sponsor_id: number; occasion: string; sent_day: string }>();

  const pick = pickDeliverable(
    pending.results.filter((p) => isOwnerSmsOccasion(p.occasion))
      .map((p) => ({ id: p.id, sponsorId: p.sponsor_id, occasion: p.occasion as OwnerSmsOccasion, createdDay: p.created_day })),
    sent.results.filter((s) => isOwnerSmsOccasion(s.occasion))
      .map((s) => ({ sponsorId: s.sponsor_id, occasion: s.occasion as OwnerSmsOccasion, sentDay: s.sent_day })),
    today,
  );
  if (!pick) return false;
  const row = pending.results.find((p) => p.id === pick.id);
  if (!row) return false;

  // Nárok: podmíněný UPDATE drží denní limit i při souběhu match-runneru a denního ticku.
  const claim = await db.prepare(
    `UPDATE sponsor_owner_sms SET status = 'awaiting', sent_day = ?1, reply_by = ?2
     WHERE id = ?3 AND status = 'pending'
       AND NOT EXISTS (SELECT 1 FROM sponsor_owner_sms x WHERE x.team_id = ?4 AND x.sent_day = ?1 AND x.id != ?3)`,
  ).bind(today, addDays(today, OWNER_SMS_REPLY_DAYS), pick.id, teamId).run();
  if ((claim.meta?.changes ?? 0) !== 1) return false;

  const drop = () => db.prepare("UPDATE sponsor_owner_sms SET status = 'dropped', sent_day = NULL, reply_by = NULL WHERE id = ?")
    .bind(pick.id).run();

  const owner = await ensureSponsorOwner(db, pick.sponsorId);
  const firm = await db.prepare("SELECT name FROM district_sponsors WHERE id = ?")
    .bind(pick.sponsorId).first<{ name: string }>();
  const recent = await db.prepare(
    "SELECT body FROM sponsor_owner_sms WHERE team_id = ? AND body IS NOT NULL ORDER BY sent_day DESC, created_at DESC LIMIT 6",
  ).bind(teamId).all<{ body: string }>();
  const text = owner
    ? renderOwnerSms(pick.occasion, owner.personality, parseVars(row.vars), `owner-sms|${row.reference_id}`, recent.results.map((r) => r.body))
    : null;
  if (!owner || !text) {
    await drop();
    return false;
  }

  // Předchozí nezodpovězená SMS téhož majitele (den před zápasem) tímhle končí, bez postihu.
  await db.prepare(
    "UPDATE sponsor_owner_sms SET status = 'closed' WHERE team_id = ? AND sponsor_id = ? AND status = 'awaiting' AND id != ?",
  ).bind(teamId, pick.sponsorId, pick.id).run();

  const name = `${owner.firstName} ${owner.lastName}`;
  const convId = await sendOwnerSMS(db, teamId, {
    sponsorId: pick.sponsorId, name, firmName: firm?.name ?? null, avatar: JSON.stringify(owner.faceConfig),
  }, text, { smsId: pick.id, options: replyOptions(pick.occasion) });
  if (!convId) {
    await drop();
    return false;
  }
  await db.prepare("UPDATE sponsor_owner_sms SET body = ?, conversation_id = ? WHERE id = ?")
    .bind(text, convId, pick.id).run();
  logger.info({ module: M, teamId }, `SMS od majitele ${pick.sponsorId}: ${pick.occasion}`);
  return true;
}

interface OwnerThreadState {
  kind?: string;
  smsId?: string;
  sponsorId?: number;
  awaiting?: string;
}

/**
 * Odpověď trenéra v konverzaci s majitelem. `optionId` = tlačítko (warm/neutral/dismissive),
 * bez něj se tón pozná z textu. Vrací `false`, když vlákno majiteli nepatří. Nikdy nehází.
 */
export async function handleOwnerSmsReply(
  db: D1Database, convId: string, text: string, optionId: string | null,
): Promise<boolean> {
  try {
    const conv = await db
      .prepare("SELECT team_id, ai_thread_state FROM conversations WHERE id = ? AND ai_thread_active = 1")
      .bind(convId).first<{ team_id: string; ai_thread_state: string | null }>();
    if (!conv?.ai_thread_state) return false;

    let state: OwnerThreadState;
    try {
      state = JSON.parse(conv.ai_thread_state) as OwnerThreadState;
    } catch (e) {
      logger.warn({ module: M }, `nečitelné vlákno konverzace ${convId}`, e);
      return false;
    }
    if (state.kind !== "sponsor_owner" || !state.smsId || typeof state.sponsorId !== "number") return false;

    const tone: ReplyTone = isReplyTone(optionId) ? optionId : classifyFreeReply(text);
    // Nárok na SMS: dvě rychlé odpovědi za sebou nesmí dopad zdvojit.
    const claim = await db.prepare(
      "UPDATE sponsor_owner_sms SET status = 'replied', reply_tone = ? WHERE id = ? AND status = 'awaiting' AND team_id = ?",
    ).bind(tone, state.smsId, conv.team_id).run();
    if ((claim.meta?.changes ?? 0) !== 1) {
      // Vlákno přežilo svou SMS (vypršela nebo ji nahradila novější): jen ho zavřít.
      await db.prepare(
        "UPDATE conversations SET ai_thread_active = 0, ai_thread_state = NULL WHERE id = ? AND json_extract(ai_thread_state, '$.smsId') = ?",
      ).bind(convId, state.smsId).run();
      return true;
    }

    const owner = await ensureSponsorOwner(db, state.sponsorId);
    const personality: OwnerPersonality = owner?.personality ?? "businessman";
    const delta = replyFavorDelta(personality, tone);
    const back = ownerReplyBack(personality, delta, `owner-reply|${state.smsId}`);
    const senderName = owner ? `${owner.firstName} ${owner.lastName}` : "Majitel firmy";
    const reason = tone === "dismissive" ? FAVOR_REASONS.smsDismissed : FAVOR_REASONS.smsReply;

    await db.batch([
      ...(delta !== 0 ? favorDeltaStmts(db, state.sponsorId, conv.team_id, delta, reason) : []),
      db.prepare(
        `INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, sent_at)
         VALUES (?, ?, 'system', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))`,
      ).bind(crypto.randomUUID(), convId, `so-${state.sponsorId}`, senderName, back),
      db.prepare(
        `UPDATE conversations SET unread_count = unread_count + 1, last_message_text = ?,
           last_message_at = strftime('%Y-%m-%dT%H:%M:%SZ','now'), ai_thread_active = 0, ai_thread_state = NULL
         WHERE id = ?`,
      ).bind(back.slice(0, 100), convId),
    ]);
    logger.info({ module: M, teamId: conv.team_id }, `odpověď majiteli ${state.sponsorId}: ${tone}, náklonnost ${delta}`);
    return true;
  } catch (e) {
    logger.warn({ module: M }, `odpověď majiteli v konverzaci ${convId}`, e);
    return false;
  }
}

/**
 * Lhůta na odpověď vypršela. Kde se odpověď čekala, stojí mlčení náklonnost
 * („neodpověděl na SMS"), jinak se vlákno jen zavře. Vrací počet vyřízených SMS.
 */
export async function expireOwnerSmsReplies(db: D1Database, today: string): Promise<number> {
  const rows = await db.prepare(
    `SELECT s.id, s.sponsor_id, s.team_id, s.expects_reply, s.conversation_id, so.personality
     FROM sponsor_owner_sms s LEFT JOIN sponsor_owners so ON so.sponsor_id = s.sponsor_id
     WHERE s.status = 'awaiting' AND s.reply_by < ?`,
  ).bind(today.slice(0, 10)).all<{
    id: string; sponsor_id: number; team_id: string; expects_reply: number; conversation_id: string | null; personality: string | null;
  }>();
  let n = 0;
  for (const r of rows.results) {
    const claim = await db.prepare("UPDATE sponsor_owner_sms SET status = ? WHERE id = ? AND status = 'awaiting'")
      .bind(r.expects_reply === 1 ? "ignored" : "closed", r.id).run();
    if ((claim.meta?.changes ?? 0) !== 1) continue;
    n++;
    const p: OwnerPersonality = isOwnerPersonality(r.personality) ? r.personality : "businessman";
    const stmts: D1PreparedStatement[] = [];
    if (r.expects_reply === 1) {
      stmts.push(...favorDeltaStmts(db, r.sponsor_id, r.team_id, ignoreFavorDelta(p), FAVOR_REASONS.smsIgnored));
    }
    if (r.conversation_id) {
      stmts.push(db.prepare(
        "UPDATE conversations SET ai_thread_active = 0, ai_thread_state = NULL WHERE id = ? AND json_extract(ai_thread_state, '$.smsId') = ?",
      ).bind(r.conversation_id, r.id));
    }
    if (stmts.length > 0) await db.batch(stmts);
  }
  return n;
}

/**
 * Rollover vrací herní čas na reálné datum: lhůty ze staré osy by nikdy nevypršely.
 * Otevřená vlákna se proto tiše zavřou a fronta se vyprázdní, bez postihu.
 */
export async function closeOwnerSmsForRollover(db: D1Database): Promise<void> {
  await db.batch([
    db.prepare("UPDATE sponsor_owner_sms SET status = 'closed' WHERE status = 'awaiting'"),
    db.prepare("UPDATE sponsor_owner_sms SET status = 'dropped' WHERE status = 'pending'"),
    db.prepare(
      `UPDATE conversations SET ai_thread_active = 0, ai_thread_state = NULL
       WHERE ai_thread_active = 1 AND participant_id LIKE 'so-%'`,
    ),
  ]);
}
```

- [ ] **Step 5: Spustit testy**

Run: `cd /Users/savrik/Projects/fmko/apps/api && npx vitest run src/sponsors/owner-sms.test.ts src/sponsors/owner-sms-texts.test.ts src/sponsors/owner-sms-rules.test.ts`
Expected: `Test Files  3 passed (3)`.

- [ ] **Step 6: Typecheck**

Run: `cd /Users/savrik/Projects/fmko && npm run typecheck`
Expected: bez chyby.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/sponsors/owner-sms.ts apps/api/src/sponsors/owner-sms.test.ts apps/api/src/messaging/system-sms.ts
git commit -m "$(cat <<'EOF'
feat(sponzori): fronta, doruceni a odpoved na SMS od majitelu firem

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Spouštěče v existujících háčcích

**Files:**
- Create: `apps/api/src/sponsors/owner-sms-triggers.ts`
- Modify: `apps/api/src/sponsors/hooks.ts` (`settleSponsorInvitations`)
- Modify: `apps/api/src/fans/resolve-match-incidents.ts` (blok výtržnosti)
- Modify: `apps/api/src/multiplayer/match-runner.ts` (za „vyhodnocení výtržností")
- Modify: `apps/api/src/season/daily-tick.ts` (za blokem „Setkání s majiteli firem v hospodě")
- Modify: `apps/api/src/season/season-rollover.ts` (krok 4b a nový krok za ním)
- Modify: `apps/api/src/routes/game.ts` (podpis a ukončení hlavní smlouvy)
- Modify: `apps/api/src/routes/teams.ts` (úklid při převzetí AI klubu)
- Modify: `apps/api/src/messaging/ai-player-spawn.ts` (kontrola zaseklých vláken a spawn)

**Interfaces:**
- Consumes: Task 3 (`enqueueOwnerSms`, `deliverOwnerSmsForTeam`, `expireOwnerSmsReplies`, `closeOwnerSmsForRollover`, `loadRelationshipOwners`, `teamGameDay`), Task 2 (`addDays`, `LOSING_STREAK_MIN`, `leadingLosses`, `occasionForResult`, `pickRelationshipOwner`, `seasonVerdict`).
- Produces: `enqueueAfterMatchSms`, `enqueueRiotSms`, `enqueueMatchEveSms`, `enqueueLosingStreakSms`, `enqueueScandalSms`, `enqueueMainSponsorSms`, `enqueueSeasonEndSms`, `runOwnerSmsDaily`. Reference: `match:{matchId}:{sponsorId}`, `riot:{matchId}`, `eve:{invitationId}`, `streak:{teamId}:{firstLossMatchId}`, `scandal:{incidentId}`, `main-new:{contractId}`, `main-lost:{contractId}`, `main-expired:{teamId}:{sponsorId}:s{season}`, `season:{season}:{teamId}`.

- [ ] **Step 1: Napsat `apps/api/src/sponsors/owner-sms-triggers.ts`**

```ts
/**
 * Spouštěče SMS od majitelů firem. Každý jen zařadí zprávu do fronty (idempotentně);
 * doručení a limity řeší `deliverOwnerSmsForTeam`. Háčky volají tyhle funkce ve vlastním
 * try/catch: SMS je koření, nesmí shodit zápas, rollover ani tick.
 */
import { logger } from "../lib/logger";
import {
  deliverOwnerSmsForTeam, enqueueOwnerSms, expireOwnerSmsReplies, loadRelationshipOwners, teamGameDay,
} from "./owner-sms";
import {
  addDays, LOSING_STREAK_MIN, leadingLosses, occasionForResult, pickRelationshipOwner, seasonVerdict,
} from "./owner-sms-rules";

const M = "owner-sms";

const HUMAN_TEAMS_SQL = `SELECT id FROM teams
  WHERE user_id != 'ai' AND COALESCE(team_type, 'senior') != 'u21' AND name NOT LIKE 'DELETED-%'`;

/** Po domácím zápase: majitelé, kteří seděli na tribuně (claim v settleSponsorInvitations). */
export async function enqueueAfterMatchSms(
  db: D1Database, matchId: string, homeTeamId: string, homeScore: number, awayScore: number, sponsorIds: readonly number[],
): Promise<number> {
  const occasion = occasionForResult(homeScore, awayScore);
  if (!occasion || sponsorIds.length === 0) return 0;
  const day = await teamGameDay(db, homeTeamId);
  if (!day) return 0;
  let n = 0;
  for (const sponsorId of sponsorIds) {
    const ok = await enqueueOwnerSms(db, {
      sponsorId, teamId: homeTeamId, occasion, referenceId: `match:${matchId}:${sponsorId}`, day,
      vars: { skore: `${homeScore}:${awayScore}` },
    });
    if (ok) n++;
  }
  return n;
}

/** Výtržnost domácích fanoušků: ozve se majitel se vztahem, přednost má opatrný. */
export async function enqueueRiotSms(db: D1Database, teamId: string, matchId: string): Promise<boolean> {
  const day = await teamGameDay(db, teamId);
  if (!day) return false;
  const owner = pickRelationshipOwner(await loadRelationshipOwners(db, teamId), { prefer: "cautious" });
  if (!owner) return false;
  return enqueueOwnerSms(db, { sponsorId: owner.sponsorId, teamId, occasion: "riot", referenceId: `riot:${matchId}`, day });
}

/** Den před domácím zápasem: majitelé, kteří na zítřek přijali pozvání. */
export async function enqueueMatchEveSms(db: D1Database, today: string): Promise<number> {
  const rows = await db.prepare(
    `SELECT si.id, si.sponsor_id, si.team_id FROM sponsor_invitations si
     JOIN teams t ON t.id = si.team_id
     WHERE si.status = 'accepted' AND si.match_day = ? AND t.user_id != 'ai'`,
  ).bind(addDays(today, 1)).all<{ id: string; sponsor_id: number; team_id: string }>();
  let n = 0;
  for (const r of rows.results) {
    const ok = await enqueueOwnerSms(db, {
      sponsorId: r.sponsor_id, teamId: r.team_id, occasion: "match_eve", referenceId: `eve:${r.id}`, day: today,
    });
    if (ok) n++;
  }
  return n;
}

/** Série proher: jednou za sérii (reference = první prohra série). */
export async function enqueueLosingStreakSms(db: D1Database, teamId: string, today: string): Promise<boolean> {
  const recent = await db.prepare(
    `SELECT id, CASE
              WHEN (home_team_id = ?1 AND home_score > away_score) OR (away_team_id = ?1 AND away_score > home_score) THEN 'W'
              WHEN home_score = away_score THEN 'D' ELSE 'L' END AS res
     FROM matches WHERE (home_team_id = ?1 OR away_team_id = ?1) AND status = 'simulated'
     ORDER BY simulated_at DESC LIMIT 10`,
  ).bind(teamId).all<{ id: string | number; res: "W" | "D" | "L" }>();
  const n = leadingLosses(recent.results.map((r) => r.res));
  if (n < LOSING_STREAK_MIN) return false;
  const owner = pickRelationshipOwner(await loadRelationshipOwners(db, teamId));
  if (!owner) return false;
  const firstLoss = String(recent.results[n - 1].id);
  return enqueueOwnerSms(db, {
    sponsorId: owner.sponsorId, teamId, occasion: "losing_streak", referenceId: `streak:${teamId}:${firstLoss}`,
    day: today, vars: { serie: n },
  });
}

/** Průšvih v klubu (krádež, poškození): ozve se jen opatrný majitel. */
export async function enqueueScandalSms(db: D1Database, teamId: string, today: string): Promise<boolean> {
  const inc = await db.prepare(
    `SELECT id FROM club_incidents
     WHERE team_id = ? AND category IN ('kradez','poskozeni') AND status != 'hrozi' AND severity >= 2
       AND ABS(julianday(substr(game_date, 1, 10)) - julianday(?)) <= 2
     ORDER BY game_date DESC LIMIT 1`,
  ).bind(teamId, today.slice(0, 10)).first<{ id: string }>();
  if (!inc) return false;
  const owner = pickRelationshipOwner(await loadRelationshipOwners(db, teamId), { only: "cautious" });
  if (!owner) return false;
  return enqueueOwnerSms(db, { sponsorId: owner.sponsorId, teamId, occasion: "scandal", referenceId: `scandal:${inc.id}`, day: today });
}

/** Hlavní sponzor: nový se přivítá, odcházející se rozloučí. Routy doručují hned. */
export async function enqueueMainSponsorSms(
  db: D1Database, teamId: string, sponsorId: number, occasion: "main_lost" | "main_new", referenceId: string,
  opts: { day?: string; deliverNow?: boolean } = {},
): Promise<boolean> {
  const day = opts.day ?? (await teamGameDay(db, teamId));
  if (!day) return false;
  const queued = await enqueueOwnerSms(db, { sponsorId, teamId, occasion, referenceId, day });
  if (queued && opts.deliverNow) await deliverOwnerSmsForTeam(db, teamId);
  return queued;
}

/** Konec sezóny: poděkování, nebo stížnost podle bodů na zápas ve staré sezóně. */
export async function enqueueSeasonEndSms(db: D1Database, oldSeasonNumber: number, day: string): Promise<number> {
  const rows = await db.prepare(
    `SELECT t.id AS team_id,
            SUM(CASE WHEN (m.home_team_id = t.id AND m.home_score > m.away_score)
                       OR (m.away_team_id = t.id AND m.away_score > m.home_score) THEN 1 ELSE 0 END) AS wins,
            SUM(CASE WHEN m.home_score = m.away_score THEN 1 ELSE 0 END) AS draws,
            COUNT(m.id) AS played
     FROM teams t
     JOIN matches m ON (m.home_team_id = t.id OR m.away_team_id = t.id) AND m.status = 'simulated'
     JOIN season_calendar sc ON sc.id = m.calendar_id AND sc.season_number = ?
     WHERE t.user_id != 'ai' AND COALESCE(t.team_type, 'senior') != 'u21' AND t.name NOT LIKE 'DELETED-%'
     GROUP BY t.id`,
  ).bind(oldSeasonNumber).all<{ team_id: string; wins: number; draws: number; played: number }>();
  let n = 0;
  for (const r of rows.results) {
    try {
      const verdict = seasonVerdict(r.wins, r.draws, r.played);
      if (!verdict) continue;
      const owner = pickRelationshipOwner(await loadRelationshipOwners(db, r.team_id));
      if (!owner) continue;
      const ok = await enqueueOwnerSms(db, {
        sponsorId: owner.sponsorId, teamId: r.team_id, occasion: verdict,
        referenceId: `season:${oldSeasonNumber}:${r.team_id}`, day,
      });
      if (ok) n++;
    } catch (e) {
      logger.warn({ module: M, teamId: r.team_id }, "SMS majitele ke konci sezóny", e);
    }
  }
  return n;
}

/** Denní běh: mlčení, den před zápasem, série proher, průšvihy a doručení všem lidským klubům. */
export async function runOwnerSmsDaily(
  db: D1Database, todayIso: string,
): Promise<{ expired: number; eve: number; queued: number; delivered: number }> {
  const today = todayIso.slice(0, 10);
  const expired = await expireOwnerSmsReplies(db, today);
  const eve = await enqueueMatchEveSms(db, today);
  const teams = await db.prepare(HUMAN_TEAMS_SQL).all<{ id: string }>();
  let queued = 0;
  let delivered = 0;
  for (const t of teams.results) {
    try {
      if (await enqueueLosingStreakSms(db, t.id, today)) queued++;
      if (await enqueueScandalSms(db, t.id, today)) queued++;
      if (await deliverOwnerSmsForTeam(db, t.id, today)) delivered++;
    } catch (e) {
      logger.warn({ module: M, teamId: t.id }, "SMS od majitelů pro klub", e);
    }
  }
  return { expired, eve, queued, delivered };
}
```

- [ ] **Step 2: `settleSponsorInvitations` zařadí SMS po zápase**

V `apps/api/src/sponsors/hooks.ts` nahradit:

```ts
  let claimed = 0;
  for (const r of rows.results) {
```

za:

```ts
  let claimed = 0;
  const claimedIds: number[] = [];
  for (const r of rows.results) {
```

nahradit:

```ts
    if ((claim.meta?.changes ?? 0) !== 1) continue;
    claimed++;
```

za:

```ts
    if ((claim.meta?.changes ?? 0) !== 1) continue;
    claimed++;
    claimedIds.push(r.sponsor_id);
```

a nahradit:

```ts
  logger.info({ module: "sponsors", matchId }, `majitelé na tribuně: ${claimed}, bonus lóže ${vipBonus}`);
}
```

za:

```ts
  logger.info({ module: "sponsors", matchId }, `majitelé na tribuně: ${claimed}, bonus lóže ${vipBonus}`);

  // SMS od majitele po výhře nebo prohře, kterou viděl. Jen zařazení do fronty,
  // doručí match-runner. Chyba nesmí shodit vyhodnocení náklonnosti.
  try {
    const { enqueueAfterMatchSms } = await import("./owner-sms-triggers");
    await enqueueAfterMatchSms(db, matchId, homeTeamId, homeScore, awayScore, claimedIds);
  } catch (e) {
    logger.warn({ module: "sponsors", matchId }, "SMS majitelů po zápase", e);
  }
}
```

- [ ] **Step 3: Výtržnost zařadí SMS**

V `apps/api/src/fans/resolve-match-incidents.ts` nahradit:

```ts
    await applyRiotFavorPenalty(db, opts.homeTeamId)
      .catch((e) => { logger.warn({ module: M, teamId: opts.homeTeamId }, "náklonnost sponzorů po výtržnosti", e); });
  }
```

za:

```ts
    await applyRiotFavorPenalty(db, opts.homeTeamId)
      .catch((e) => { logger.warn({ module: M, teamId: opts.homeTeamId }, "náklonnost sponzorů po výtržnosti", e); });
    // Majitel, se kterým má klub vztah, se ozve SMS (přednost má opatrný). Doručí match-runner.
    const { enqueueRiotSms } = await import("../sponsors/owner-sms-triggers");
    await enqueueRiotSms(db, opts.homeTeamId, opts.matchId)
      .catch((e) => { logger.warn({ module: M, teamId: opts.homeTeamId }, "SMS majitele po výtržnosti", e); });
  }
```

- [ ] **Step 4: Match-runner doručí SMS domácímu lidskému klubu**

V `apps/api/src/multiplayer/match-runner.ts` nahradit (výskyt je v souboru jediný):

```ts
            } catch (e) {
                logger.warn({module: "match-runner"}, "vyhodnocení výtržností", e);
            }
```

za:

```ts
            } catch (e) {
                logger.warn({module: "match-runner"}, "vyhodnocení výtržností", e);
            }

            // SMS od majitelů firem (po zápase, po výtržnosti). Až za oběma háčky výše,
            // aby se z fronty vybrala ta nejdůležitější, a až za zámkem zápasu (continue výše).
            if (homeIsHuman) {
                try {
                    const {deliverOwnerSmsForTeam} = await import("../sponsors/owner-sms");
                    await deliverOwnerSmsForTeam(db, homeTeamId);
                } catch (e) {
                    logger.warn({module: "match-runner", matchId}, "SMS od majitelů firem", e);
                }
            }
```

- [ ] **Step 5: Denní tick s vlastním try/catch**

V `apps/api/src/season/daily-tick.ts` nahradit:

```ts
  } catch (e) {
    logger.error({ module: "daily-tick" }, "setkání s majiteli firem selhalo", e);
  }
```

za:

```ts
  } catch (e) {
    logger.error({ module: "daily-tick" }, "setkání s majiteli firem selhalo", e);
  }

  // ── SMS od majitelů firem (vlastní try: chyba nesmí shodit zbytek ticku) ──
  // effectiveDate, ne teams.game_date: posun herního data v teams přijde až níž v ticku.
  try {
    const { runOwnerSmsDaily } = await import("../sponsors/owner-sms-triggers");
    const r = await runOwnerSmsDaily(env.DB, effectiveDate.toISOString());
    if (r.expired + r.eve + r.queued + r.delivered > 0) {
      logger.info({ module: "daily-tick" }, `SMS majitelů: ${r.delivered} doručeno, ${r.eve + r.queued} zařazeno, ${r.expired} vypršelo`);
    }
  } catch (e) {
    logger.error({ module: "daily-tick" }, "SMS od majitelů firem selhaly", e);
  }
```

- [ ] **Step 6: Rollover: vypršelý hlavní sponzor, úklid vláken, konec sezóny**

V `apps/api/src/season/season-rollover.ts` nahradit:

```ts
  // 4b. Sponzorské smlouvy: nová sezóna = o sezónu méně platnosti; na nule smlouva vyprší.
```

za:

```ts
  // Hlavní smlouvy, které teď vyprší: jejich majitelé se v kroku 4b-sms rozloučí.
  let expiringMain: Array<{ team_id: string; sponsor_id: number }> = [];

  // 4b. Sponzorské smlouvy: nová sezóna = o sezónu méně platnosti; na nule smlouva vyprší.
```

nahradit:

```ts
    await db.prepare("UPDATE sponsor_contracts SET seasons_remaining = seasons_remaining - 1 WHERE status = 'active'").run();
```

za:

```ts
    expiringMain = (await db.prepare(
      `SELECT sc.team_id, sc.sponsor_id FROM sponsor_contracts sc JOIN teams t ON t.id = sc.team_id
       WHERE sc.status = 'active' AND sc.seasons_remaining <= 1 AND COALESCE(sc.category, 'main') = 'main'
         AND sc.sponsor_id IS NOT NULL AND t.user_id != 'ai'`,
    ).all<{ team_id: string; sponsor_id: number }>()
      .catch((e) => { logger.warn({ module: "season-rollover" }, "vypršelé hlavní smlouvy pro SMS", e); return { results: [] as Array<{ team_id: string; sponsor_id: number }> }; })).results;

    await db.prepare("UPDATE sponsor_contracts SET seasons_remaining = seasons_remaining - 1 WHERE status = 'active'").run();
```

a nahradit:

```ts
    logger.error({ module: "season-rollover" }, "sponsor contracts rollover", e);
  }
```

za:

```ts
    logger.error({ module: "season-rollover" }, "sponsor contracts rollover", e);
  }

  // 4b-sms. SMS od majitelů firem. Herní čas se právě vrátil na reálné datum, lhůty
  // ze staré osy by nikdy nevypršely, proto se otevřená vlákna nejdřív tiše zavřou.
  // Pak poděkování nebo stížnost za sezónu a rozloučení majitelů vypršelých hlavních
  // smluv. Doručí je denní tick (nejvýš jedna SMS denně na klub).
  try {
    const { closeOwnerSmsForRollover } = await import("../sponsors/owner-sms");
    const { enqueueMainSponsorSms, enqueueSeasonEndSms } = await import("../sponsors/owner-sms-triggers");
    await closeOwnerSmsForRollover(db);
    const day = startIso.slice(0, 10);
    const seasonSms = await enqueueSeasonEndSms(db, oldSeasonNumber, day);
    for (const m of expiringMain) {
      await enqueueMainSponsorSms(db, m.team_id, m.sponsor_id, "main_lost",
        `main-expired:${m.team_id}:${m.sponsor_id}:s${oldSeasonNumber}`, { day });
    }
    logger.info({ module: "season-rollover" }, `SMS majitelů: ${seasonSms} ke konci sezóny, ${expiringMain.length} rozloučení`);
  } catch (e) {
    logger.error({ module: "season-rollover" }, "SMS od majitelů firem", e);
  }
```

- [ ] **Step 7: Podpis a ukončení hlavní smlouvy (`routes/game.ts`)**

Nahradit (podpis, blok `if (category === "main")`):

```ts
    ).run().catch((e) => logger.warn({ module: "game" }, "insert sponsor rename news", e));

    return c.json({ ok: true, contractId: id, newTeamName: newName, reputationPenalty: 3 });
```

za:

```ts
    ).run().catch((e) => logger.warn({ module: "game" }, "insert sponsor rename news", e));

    // Majitel nové hlavní firmy se ozve SMS (jen lidský klub, limity hlídá fronta).
    try {
      const { enqueueMainSponsorSms } = await import("../sponsors/owner-sms-triggers");
      await enqueueMainSponsorSms(c.env.DB, teamId, Number(spRow.id), "main_new", `main-new:${id}`, { deliverNow: true });
    } catch (e) {
      logger.warn({ module: "game" }, "SMS od nového hlavního sponzora", e);
    }

    return c.json({ ok: true, contractId: id, newTeamName: newName, reputationPenalty: 3 });
```

Nahradit (ukončení, načtení smluv):

```ts
    "SELECT id, early_termination_fee, seasons_remaining, category FROM sponsor_contracts WHERE team_id = ? AND status = 'active'"
```

za:

```ts
    "SELECT id, early_termination_fee, seasons_remaining, category, sponsor_id FROM sponsor_contracts WHERE team_id = ? AND status = 'active'"
```

a nahradit:

```ts
  await c.env.DB.prepare("UPDATE sponsor_contracts SET status = 'terminated' WHERE id = ?").bind(contract.id).run();
```

za:

```ts
  await c.env.DB.prepare("UPDATE sponsor_contracts SET status = 'terminated' WHERE id = ?").bind(contract.id).run();

  // Majitel firmy, se kterou klub ukončil hlavní smlouvu, se ozve SMS.
  const terminatedSponsorId = (contractRow?.sponsor_id as number | null | undefined) ?? null;
  if (category === "main" && terminatedSponsorId !== null) {
    try {
      const { enqueueMainSponsorSms } = await import("../sponsors/owner-sms-triggers");
      await enqueueMainSponsorSms(c.env.DB, teamId, terminatedSponsorId, "main_lost", `main-lost:${contract.id}`, { deliverNow: true });
    } catch (e) {
      logger.warn({ module: "game" }, "SMS od odcházejícího hlavního sponzora", e);
    }
  }
```

- [ ] **Step 8: Převzetí AI klubu uklidí i SMS majitelů (`routes/teams.ts`)**

Nahradit:

```ts
      for (const t of ["sponsor_favor_log", "sponsor_team_favor", "sponsor_invitations", "sponsor_pub_encounters", "equipment", "stadiums", "conversations", "sponsor_contracts", "transactions"]) {
```

za:

```ts
      for (const t of ["sponsor_owner_sms", "sponsor_favor_log", "sponsor_team_favor", "sponsor_invitations", "sponsor_pub_encounters", "equipment", "stadiums", "conversations", "sponsor_contracts", "transactions"]) {
```

- [ ] **Step 9: Vlákno majitele mimo logiku hráčských vláken (`messaging/ai-player-spawn.ts`)**

Kontrola zaseklých vláken bere každé `ai_thread_active = 1` jako hráčské a po 3 reálných dnech by vlákno majitele zavřela s „Hráč už není dostupný." Lhůtu majitelů hlídá `expireOwnerSmsReplies` v herním čase. Nahradit (řádek 907, v cyklu `for (const conv of stale.results)`):

```ts
    const state = parseState(conv.ai_thread_state);
    if (!state) continue;
```

za:

```ts
    const state = parseState(conv.ai_thread_state);
    if (!state) continue;
    // Vlákno majitele firmy si hlídá vlastní lhůtu v herním čase (sponsors/owner-sms.ts).
    if ((state as { kind?: string }).kind === "sponsor_owner") continue;
```

Otevřená SMS od majitele nesmí zablokovat spawn hráčských vláken. Nahradit:

```ts
       AND NOT EXISTS (
         SELECT 1 FROM conversations c WHERE c.team_id = t.id AND c.ai_thread_active = 1
       )`,
```

za:

```ts
       AND NOT EXISTS (
         SELECT 1 FROM conversations c WHERE c.team_id = t.id AND c.ai_thread_active = 1
           AND COALESCE(c.participant_id, '') NOT LIKE 'so-%'
       )`,
```

- [ ] **Step 10: Testy sponzorů a zpráv**

Run: `cd /Users/savrik/Projects/fmko/apps/api && npx vitest run src/sponsors src/messaging src/fans`
Expected: všechny soubory `passed`, žádný FAIL (`hooks.test.ts` a `favor-log.test.ts` beze změny očekávání: zařazení SMS po zápase v jejich falešné DB nenajde herní datum a nic nezapíše).

- [ ] **Step 11: Typecheck**

Run: `cd /Users/savrik/Projects/fmko && npm run typecheck`
Expected: bez chyby.

- [ ] **Step 12: Commit**

```bash
git add apps/api/src/sponsors/owner-sms-triggers.ts apps/api/src/sponsors/hooks.ts \
  apps/api/src/fans/resolve-match-incidents.ts apps/api/src/multiplayer/match-runner.ts \
  apps/api/src/season/daily-tick.ts apps/api/src/season/season-rollover.ts apps/api/src/routes/game.ts \
  apps/api/src/routes/teams.ts apps/api/src/messaging/ai-player-spawn.ts
git commit -m "$(cat <<'EOF'
feat(sponzori): spoustece SMS od majitelu (zapas, vytrznost, serie, prusvih, sezona, hlavni sponzor)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: API odpovědi (odeslání zprávy, nápověda po uzavření)

**Files:**
- Modify: `apps/api/src/routes/messaging.ts`

**Interfaces:**
- Consumes: `handleOwnerSmsReply(db, convId, text, optionId)` (Task 3).
- Produces:
  - `POST /api/teams/:teamId/conversations/:convId` přijímá `{ body: string; optionId?: "warm" | "neutral" | "dismissive" }`.
  - `GET /api/teams/:teamId/conversations/:convId` vrací navíc `replyHintLabel?: string` (text odkazu nápovědy); pro uzavřenou konverzaci s majitelem `replyHintHref: "/sponzori"`.

- [ ] **Step 1: Štítek odkazu v `odpovidatLze`**

Nahradit:

```ts
  canReply: boolean;
  channel: "sms" | "imessage" | null;
  replyHint?: string;
  replyHintHref?: string;
} {
```

za:

```ts
  canReply: boolean;
  channel: "sms" | "imessage" | null;
  replyHint?: string;
  replyHintHref?: string;
  /** Text odkazu k nápovědě. Dřív byl na frontendu natvrdo „Otevřít Fanoušky". */
  replyHintLabel?: string;
} {
```

Nahradit:

```ts
      replyHint: "Tahle výměna skončila. Domluvit se s partou můžeš na stránce Fanoušci.",
      replyHintHref: "/fanousci",
    };
  }
```

za:

```ts
      replyHint: "Tahle výměna skončila. Domluvit se s partou můžeš na stránce Fanoušci.",
      replyHintHref: "/fanousci",
      replyHintLabel: "Otevřít Fanoušky",
    };
  }

  // Majitel firmy píše sám, když se něco stane. Mimo jeho SMS se s ním jedná na Sponzorech.
  if (opts.participantId?.startsWith("so-")) {
    return {
      canReply: false,
      channel: null,
      replyHint: "Tahle výměna skončila. Majitele můžeš pozvat na zápas na stránce Sponzoři.",
      replyHintHref: "/sponzori",
      replyHintLabel: "Otevřít Sponzory",
    };
  }
```

- [ ] **Step 2: `optionId` v odeslání**

Nahradit:

```ts
  const body = await c.req.json<{ body: string }>();

  if (!body.body?.trim()) return c.json({ error: "Empty message" }, 400);
```

za:

```ts
  // `optionId` = tlačítko hotové odpovědi (SMS od majitele firmy). Tón z něj bere jen server.
  const body = await c.req.json<{ body: string; optionId?: string }>();

  if (!body.body?.trim()) return c.json({ error: "Empty message" }, 400);
```

- [ ] **Step 3: Zpracování odpovědi majiteli**

Nahradit:

```ts
    const { handleFanLeaderReply } = await import("../fans/fan-leader-reply");
    await handleFanLeaderReply(c.env.DB, convId, body.body.trim())
      .catch((e) => logger.warn({ module: "messaging" }, "odpověď vůdci fanoušků", e));
  }
```

za:

```ts
    const { handleFanLeaderReply } = await import("../fans/fan-leader-reply");
    await handleFanLeaderReply(c.env.DB, convId, body.body.trim())
      .catch((e) => logger.warn({ module: "messaging" }, "odpověď vůdci fanoušků", e));
    // Majitel firmy: stejné sloupce, `kind = "sponsor_owner"`, bez modelu. Cizí vlákno obě
    // funkce poznají a vrátí false, pořadí proto nevadí.
    const { handleOwnerSmsReply } = await import("../sponsors/owner-sms");
    await handleOwnerSmsReply(c.env.DB, convId, body.body.trim(), typeof body.optionId === "string" ? body.optionId : null)
      .catch((e) => logger.warn({ module: "messaging" }, "odpověď majiteli firmy", e));
  }
```

- [ ] **Step 4: Typecheck a testy**

Run: `cd /Users/savrik/Projects/fmko && npm run typecheck`
Expected: bez chyby.

Run: `cd /Users/savrik/Projects/fmko/apps/api && npx vitest run src/sponsors src/messaging`
Expected: vše `passed`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/messaging.ts
git commit -m "$(cat <<'EOF'
feat(telefon): odpoved na SMS majitele firmy tlacitkem i vlastnimi slovy

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Telefon na webu: tlačítka odpovědí

**Files:**
- Modify: `apps/web/src/app/(hra)/telefon/[id]/page.tsx`

**Interfaces:**
- Consumes: `messages[].metadata = { type: "sponsor_owner", smsId, options: [{ id, label, text }] }`, `aiThreadActive`, `canReply`, `replyHintLabel` (Task 3, 5); `POST` s `{ body, optionId }`.
- Produces: pod poslední SMS majitele tři tlačítka (celá šířka, pod sebou, modrá iMessage); po uzavření vlákna nápověda s odkazem „Otevřít Sponzory".

- [ ] **Step 1: Typ odpovědi detailu**

Nahradit:

```ts
  replyHint?: string;
  replyHintHref?: string;
  aiThreadActive: boolean;
```

za:

```ts
  replyHint?: string;
  replyHintHref?: string;
  /** Text odkazu k nápovědě, formuluje server. */
  replyHintLabel?: string;
  aiThreadActive: boolean;
```

- [ ] **Step 2: Pomocník pro nabídku odpovědí**

Nahradit:

```ts
function isGroupChatId(id: string): boolean {
  return id === "global" || id.startsWith("league:");
}
```

za:

```ts
function isGroupChatId(id: string): boolean {
  return id === "global" || id.startsWith("league:");
}

/** Hotová odpověď na SMS od majitele firmy (`messages.metadata.options`). */
interface OwnerOption {
  id: string;
  label: string;
  text: string;
}

function ownerOptionsOf(msg: Message | undefined): OwnerOption[] {
  const meta = msg?.metadata;
  if (!meta || meta.type !== "sponsor_owner" || !Array.isArray(meta.options)) return [];
  return (meta.options as unknown[]).filter((o): o is OwnerOption => {
    const x = o as Partial<OwnerOption> | null;
    return !!x && typeof x.id === "string" && typeof x.label === "string" && typeof x.text === "string";
  });
}
```

- [ ] **Step 3: Štítek v nápovědě**

Nahradit:

```ts
  const [replyHint, setReplyHint] = useState<{ text: string; href?: string } | null>(null);
```

za:

```ts
  const [replyHint, setReplyHint] = useState<{ text: string; href?: string; label?: string } | null>(null);
```

Nahradit:

```ts
        setReplyHint(res.replyHint ? { text: res.replyHint, href: res.replyHintHref } : null);
```

za:

```ts
        setReplyHint(res.replyHint ? { text: res.replyHint, href: res.replyHintHref, label: res.replyHintLabel } : null);
```

Nahradit:

```tsx
              Otevřít Fanoušky
```

za:

```tsx
              {replyHint.label ?? "Otevřít"}
```

- [ ] **Step 4: Nabídka a odeslání tlačítkem**

Nahradit:

```ts
  const lzePsat = isGroup || canReply;
```

za:

```ts
  const lzePsat = isGroup || canReply;
  // Tlačítka jen pod poslední zprávou, dokud majitel čeká odpověď.
  const nabidkaOdpovedi = !isGroup && aiThreadActive && canReply ? ownerOptionsOf(messages[messages.length - 1]) : [];
```

Za funkci `handleUnrestAction` (před `const grouped: Array<...> = [];`) vložit:

```ts
  const handleOwnerOption = async (opt: OwnerOption) => {
    if (!teamId || sending) return;
    setSending(true);
    setCreditError(null);
    try {
      await apiFetch(messagesUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: opt.text, optionId: opt.id }),
      });
      // Odpověď majitele vložil server hned, stačí načíst detail znovu.
      const fresh = await apiFetch<ConvDetailResponse>(messagesUrl);
      setMessages(fresh.messages);
      setAiThreadActive(fresh.aiThreadActive);
      setAiThreadState(fresh.aiThreadState);
      setCanReply(fresh.canReply !== false);
      setChannel(fresh.channel ?? null);
      setReplyHint(fresh.replyHint ? { text: fresh.replyHint, href: fresh.replyHintHref, label: fresh.replyHintLabel } : null);
    } catch (e) {
      console.error("odpověď majiteli firmy:", e);
      setCreditError("Odpověď se nepodařilo odeslat.");
    }
    setSending(false);
  };
```

- [ ] **Step 5: Vykreslit tlačítka nad vstupním polem**

Nahradit:

```tsx
      <div className="bg-white border-t border-gray-100 px-3 py-2 shrink-0">
        {creditError && (
```

za:

```tsx
      <div className="bg-white border-t border-gray-100 px-3 py-2 shrink-0">
        {nabidkaOdpovedi.length > 0 && (
          <div className="flex flex-col gap-1.5 mb-2">
            {nabidkaOdpovedi.map((o) => (
              <button
                key={o.id}
                onClick={() => handleOwnerOption(o)}
                disabled={sending}
                title={o.label}
                className="w-full text-left text-sm bg-blue-50 border border-blue-200 text-blue-700 rounded-2xl px-3 py-2 hover:bg-blue-100 transition-colors disabled:opacity-50"
              >
                {o.text}
              </button>
            ))}
          </div>
        )}
        {creditError && (
```

- [ ] **Step 6: Build webu**

Run: `cd /Users/savrik/Projects/fmko/apps/web && npx next build --no-lint`
Expected: `✓ Compiled successfully`, stránka `/telefon/[id]` ve výpisu, žádná chyba typů.

- [ ] **Step 7: Typecheck celého repa**

Run: `cd /Users/savrik/Projects/fmko && npm run typecheck`
Expected: bez chyby.

- [ ] **Step 8: Commit**

```bash
git add "apps/web/src/app/(hra)/telefon/[id]/page.tsx"
git commit -m "$(cat <<'EOF'
feat(telefon): tlacitka odpovedi na SMS od majitelu firem

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Nasazení na testing a ověření

**Files:** žádné změny kódu.

**Interfaces:**
- Consumes: vše z úloh 1–6, migrace 0220 aplikovaná na `prales-db-test` (Task 1).
- Produces: ověřené chování na `test.prales.fun` / `api-test.prales.fun`. Na `main` nic.

- [ ] **Step 1: Kontrola větve a stromu**

Run: `cd /Users/savrik/Projects/fmko && git branch --show-current && git status --short`
Expected: `testing`; ve stromu nanejvýš cizí rozpracované soubory (`.serena/project.yml`, `packages/db/tsconfig.tsbuildinfo`), které se nepřidávají.

- [ ] **Step 2: Celé testy API**

Run: `cd /Users/savrik/Projects/fmko/apps/api && npx vitest run`
Expected: všechny soubory `passed`. Pokud padá test, který s touhle změnou nesouvisí, nahlásit ho uživateli, neopravovat.

- [ ] **Step 3: Push na testing a čekání na deploy**

Run: `cd /Users/savrik/Projects/fmko && git push origin testing`
Run: `sleep 80 && gh run list --branch testing --limit 2 --json status,conclusion,name`
Expected: běhy API i webu `"conclusion": "success"`. U API s červeným během kvůli CF 10013 ověřit `npx wrangler deployments list --env testing` (paměť `reference_cf_queue_consumer_10013.md`).

- [ ] **Step 4: Připravit spouštěč na testovací DB**

Testovací účet: `claude-test@t.cz`, tým FK Duplex Břevnov `302a0ce7-428a-4da8-b4ac-40f27eb9a7d1` (heslo do formuláře zadává uživatel). Nejrychlejší spouštěč, který doručuje hned, je podpis hlavního sponzora. Zjistit stav:

Run: `npx wrangler d1 execute prales-db-test --remote --json --command 'SELECT last_main_sponsor_change_season, (SELECT COUNT(*) FROM sponsor_contracts WHERE team_id = "302a0ce7-428a-4da8-b4ac-40f27eb9a7d1" AND status = "active" AND COALESCE(category, "main") = "main") AS main_active FROM teams WHERE id = "302a0ce7-428a-4da8-b4ac-40f27eb9a7d1"'`
Expected: čísla. Když limit „jednou za sezónu" podpis blokuje, na TESTOVACÍ DB ho uvolnit:
`npx wrangler d1 execute prales-db-test --remote --json --command 'UPDATE teams SET last_main_sponsor_change_season = 0 WHERE id = "302a0ce7-428a-4da8-b4ac-40f27eb9a7d1"'`

- [ ] **Step 5: MCP browser: podpis, SMS, odpověď**

1. `mcp__claude-in-chrome__tabs_context_mcp` (createIfEmpty), navigate `https://test.prales.fun/login`, přihlášení testovacím účtem (heslo zadá uživatel).
2. `/sponzori`: když má klub hlavního sponzora, ukončit ho (ověří `main_lost`), jinak podepsat hlavního sponzora (ověří `main_new`).
3. `/telefon`: nová konverzace „Jméno Příjmení (Firma)" s obličejem majitele; otevřít ji. Pod zprávou tři modrá tlačítka, vstupní pole s „iMessage · přes data, zdarma". Screenshot.
4. Kliknout „vlídně" (první tlačítko). Očekávání: odejde modrá bublina s textem odpovědi, majitel odepíše, tlačítka zmizí, místo pole nápověda „Tahle výměna skončila…" s odkazem „Otevřít Sponzory". Screenshot.
5. Chybový případ: v téže konverzaci zkusit psát (pole nesmí být); přímé volání API bez otevřeného vlákna vrátí 400:
   `mcp__claude-in-chrome__javascript_tool` s `fetch("https://api-test.prales.fun/api/teams/302a0ce7-428a-4da8-b4ac-40f27eb9a7d1/conversations/<convId>", {method:"POST", credentials:"include", headers:{"Content-Type":"application/json"}, body: JSON.stringify({body:"test", optionId:"warm"})}).then(r => r.status)`
   Expected: `400`. (Výsledek async fetch ověřit čtením, neopakovat naslepo, paměť `reference_browser_async_fetch.md`.)
6. `/sponzori` záložka Oblíbenost: u majitele řádek „odpověď na SMS" s kladnou změnou (u podnikatele +1 za vlídnou). Screenshot.

- [ ] **Step 6: Ověřit data v testovací DB**

Run: `npx wrangler d1 execute prales-db-test --remote --json --command 'SELECT occasion, status, reply_tone, sent_day, reply_by FROM sponsor_owner_sms WHERE team_id = "302a0ce7-428a-4da8-b4ac-40f27eb9a7d1" ORDER BY created_at DESC LIMIT 5'`
Expected: řádek `main_new` nebo `main_lost` se `status = "replied"`, `reply_tone = "warm"`.

Run: `npx wrangler d1 execute prales-db-test --remote --json --command 'SELECT delta, reason FROM sponsor_favor_log WHERE team_id = "302a0ce7-428a-4da8-b4ac-40f27eb9a7d1" ORDER BY id DESC LIMIT 3'`
Expected: nahoře `reason = "odpověď na SMS"` s deltou podle povahy.

- [ ] **Step 7: Ověřit denní běh po nejbližším nočním ticku**

Druhý den ráno (po cronu `0 3`) v logu workeru testing hledat `SMS majitelů:` (ne povinné, když nebyly spouštěče), a v DB, že řádky starší tří herních dní se stavem `awaiting` přešly na `ignored`/`closed`:

Run: `npx wrangler d1 execute prales-db-test --remote --json --command 'SELECT status, COUNT(*) AS n FROM sponsor_owner_sms GROUP BY status'`
Expected: žádný řádek `awaiting` s `reply_by` starším než dnešní herní den.

- [ ] **Step 8: STOP**

Nahlásit uživateli výsledky (screenshoty, dotazy) a čekat. Na `main` a na produkční DB (migrace 0220 na `prales-db-prod`, se zálohou před migrací) jen po výslovném „nasaď na main".
