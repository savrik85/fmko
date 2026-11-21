# Kabina má uši, fáze 1 (jádro) – plán implementace

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Co trenér v SMS nebo v kabině napíše o jiném hráči (pochvala, kritika, rozhodnutí na jeho úkor nebo v jeho prospěch), se zapíše, samo se roznese po skutečných vazbách a dotčený přijde k dopadu, napíše „slyšel jsem…“ a pamatuje si to. K tomu dvě drobné úpravy UI od uživatele.

**Architecture:** Nová složka `apps/api/src/hearsay/` s jednou odpovědností na soubor: typy a tabulka dopadů (čisté), rozpoznání zmínek (síto + model), úložiště (D1), šíření (čistý krok + běh nad D1 v hodinovém běhu Telefonu), reakce a doručení zpráv. Napojení: `routes/messaging.ts` (zpráva trenéra), `runPhoneHourly`, paměť hráče do promptu, dvě místa změny kapitána, truc za vynechání.

**Tech Stack:** Hono + Cloudflare Workers + D1, vitest (+ Miniflare pro `*.db.test.ts`), Next.js 15 + Tailwind (web).

**Spec:** `docs/superpowers/specs/2026-11-21-squad-ripple-conversations-design.md` (části 1–3, 10 a body „Omezení“; části 4–9 jsou další fáze).

## Global Constraints

- Identifikátory, názvy souborů, klíče a id v testech anglicky; česky jen texty pro hráče, komentáře a `describe`/`it`.
- Žádný prázdný catch: server `logger.warn({ module: "…" }, "popis", e)`, web `console.error("popis:", e)`.
- V UI žádná čísla nálady, vztahu ani síly šíření; hráč mluví jen přes SMS.
- Texty pro hráče bez dlouhé pomlčky (—, –).
- Jen kluby, které vede člověk (`teams.user_id != 'ai'`); AI kluby nic nespouští.
- Migrace jen přidávací (`CREATE TABLE/INDEX`), číslo `0335`.
- Prod D1: žádné korelované poddotazy přes velké tabulky v hodinovém běhu; data klubu načíst předem, počítat v paměti.
- Model se volá nejvýš jednou na zprávu trenéra a jen když síto najde jméno hráče klubu.
- Strop zpráv „slyšel jsem…“: **2 na klub a herní den**; jen klubům, jejichž manažer byl aktivní v posledních **3 dnech**; jen 7–22 h v Praze.
- Pochvala a kritika mají **stejnou základní šanci šíření**; liší se jen vazbami.
- UI nejdřív lokální náhled, testing až po OK uživatele; push jen na výslovný pokyn.

## Review Focus

1. Jméno v SMS, které je zároveň běžné slovo („pořádně“ × Pořádek, „pivko“ × přezdívka Pivko, „Německo“ × Němec): model musí vrátit `none`, nic se nezapíše. Test v Task 4.
2. Dva hráči se stejným příjmením (dva Tomanové): zmínka bez křestního jména nesmí připsat věc náhodně jednomu. Kandidáti jdou do modelu oba a ten vrátí toho, koho citace jednoznačně určuje, jinak `none`. Test v Task 4.
3. Trenér pochválí X pěti různým hráčům během dne: X dostane kladný dopad jen jednou za herní den. Test v Task 6.
4. Hráč odejde z klubu nebo je na hostování: nešíří, nedozví se a nepíše. Test v Task 7.
5. Model je mimo provoz (`GeminiUnavailableError`) při doručení: zpráva zůstane `pending` a zkusí se znovu, po 48 h `expired`; dopad už je zapsaný. Test v Task 8.

---

### Task 1: Mobilní menu bez záře za ikonami

**Files:**
- Modify: `apps/web/src/app/(hra)/vice/page.tsx:56-80` (`MenuSection`)

Uživatel (screenshot dlaždic Zaměstnanci / Přestupy): „dej pryč na mobilním menu ty stíny/background“. Výklad: barevná kruhová záře za emoji (`radial-gradient` ve `style`). Bílá dlaždice a její stín zůstávají; když bude chtít pryč i stín dlaždice, je to jedna třída `shadow-[…]`.

- [ ] **Step 1:** Odstranit `style={{ background: radial-gradient… }}` ze `<span>` ikony a upravit komentář nad `MenuSection` („velká barevná ikona v měkké záři“ → bez záře). `MenuItem.color` nechat, jen pokud ho ještě něco používá; jinak odstranit pole i hodnoty.
- [ ] **Step 2:** `cd apps/web && npx tsc --noEmit -p .` → bez chyb.
- [ ] **Step 3:** Lokální náhled 375 px (`/vice`): screenshot, ikony bez kruhu, dlaždice beze změny.
- [ ] **Step 4:** Commit `fix(menu): mobilní menu bez barevné záře za ikonami`.

### Task 2: Jména v konverzacích jako odkazy na profily

**Files:**
- Modify: `apps/web/src/app/(hra)/telefon/[id]/page.tsx:663-671` (hlavička), `:785-787` (jméno odesílatele ve skupině)

- [ ] **Step 1:** Hlavička: `conv.type === "player"` a `participantId` → `<Link href={`/hrac/${participantId}`}>` se stejnými třídami jako dnešní `<span>` + `hover:underline`; `conv.type === "manager"` → `/manazer/${participantId}` (route bere id týmu). Majitel firmy zůstává `SponsorLink`. Ostatní (systém, kabina) beze změny.
- [ ] **Step 2:** Bublina v `squad_group`: když `msg.senderType === "player"` a `msg.senderId`, jméno je `<Link href={`/hrac/${msg.senderId}`}>` se stejnou barvou (`nameColor`) a `truncate`.
- [ ] **Step 3:** `npx tsc --noEmit -p .` → bez chyb.
- [ ] **Step 4:** Lokální náhled 375 px: klepnutí na jméno v hlavičce hráče → profil hráče; jméno v kabině → profil; hlavička konverzace s manažerem → profil manažera; zpět tlačítkem zpět do konverzace. Screenshot.
- [ ] **Step 5:** Commit `feat(telefon): jména v konverzacích vedou na profil`.

### Task 3: Tabulky a úložiště „kdo co ví“

**Files:**
- Create: `apps/api/migrations/0335_squad_hearsay.sql`
- Create: `apps/api/src/hearsay/types.ts`, `apps/api/src/hearsay/store.ts`
- Test: `apps/api/src/hearsay/store.db.test.ts`

**Interfaces:**
- Produces (`types.ts`):
  ```ts
  export type HearsayKind = "praise" | "criticism" | "decision_against" | "decision_for";
  export type HearsayOrigin = "coach_sms" | "coach_squad" | "captain_change" | "lineup_armband";
  export type KnowledgeVia = "direct" | "squad_chat" | "teammate" | "pub"
    | "brothers" | "father_son" | "in_laws" | "classmates" | "coworkers" | "neighbors"
    | "drinking_buddies" | "rivals" | "mentor_pupil";
  export type MessageState = "none" | "pending" | "sent" | "skipped" | "expired";
  export interface HearsayItem {
    id: string; clubTeamId: string; subjectPlayerId: string; kind: HearsayKind; origin: HearsayOrigin;
    recipientPlayerId: string | null; conversationId: string | null; quote: string; createdAt: string; expiresAt: string;
  }
  export interface HearsayKnowledge {
    hearsayId: string; playerId: string; via: KnowledgeVia; fromPlayerId: string | null;
    learnedAt: string; messageState: MessageState; messagedAt: string | null;
  }
  export const HEARSAY_TTL_DAYS = 21;   // jak dlouho si to hráči pamatují
  export const SPREAD_WINDOW_DAYS = 7;  // jak dlouho se o tom ještě mluví
  ```
- Produces (`store.ts`):
  ```ts
  recordHearsay(db, item: Omit<HearsayItem, "id" | "expiresAt">, knowers: Array<{ playerId: string; via: KnowledgeVia }>): Promise<string>
  knowledgeStmts(db, rows: HearsayKnowledge[]): D1PreparedStatement[]   // INSERT OR IGNORE
  loadClubHearsay(db, clubTeamId: string, now: Date): Promise<{ items: HearsayItem[]; knowledge: HearsayKnowledge[] }>  // jen nevypršelé
  loadPlayerHearsay(db, playerId: string, now: Date): Promise<Array<HearsayItem & { knowledge: HearsayKnowledge }>>  // co hráč ví, nejnovější první, max 5
  ```

Migrace (kind/via/origin bez CHECK, další fáze přidají druhy):
```sql
CREATE TABLE IF NOT EXISTS squad_hearsay (
  id TEXT PRIMARY KEY, club_team_id TEXT NOT NULL, subject_player_id TEXT NOT NULL,
  kind TEXT NOT NULL, origin TEXT NOT NULL, recipient_player_id TEXT, conversation_id TEXT,
  quote TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_squad_hearsay_club ON squad_hearsay(club_team_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_squad_hearsay_subject ON squad_hearsay(subject_player_id, created_at);
CREATE TABLE IF NOT EXISTS squad_hearsay_knowledge (
  hearsay_id TEXT NOT NULL, player_id TEXT NOT NULL, via TEXT NOT NULL, from_player_id TEXT,
  learned_at TEXT NOT NULL, message_state TEXT NOT NULL DEFAULT 'none', messaged_at TEXT,
  PRIMARY KEY (hearsay_id, player_id)
);
CREATE INDEX IF NOT EXISTS idx_hearsay_knowledge_player ON squad_hearsay_knowledge(player_id, learned_at);
CREATE INDEX IF NOT EXISTS idx_hearsay_knowledge_pending ON squad_hearsay_knowledge(message_state) WHERE message_state = 'pending';
```

- [ ] **Step 1: Failing testy** (`store.db.test.ts`, Miniflare jako `coach-commitments.db.test.ts`, migrace načtená ze souboru):
  - `it("zapíše věc a adresát ji ví přímo")`: `recordHearsay` s knowers `[{ playerId: "p1", via: "direct" }]` → `loadPlayerHearsay(db, "p1")` má 1 položku, `knowledge.via === "direct"`, `expiresAt` = `createdAt` + 21 dní.
  - `it("dvojí zápis znalosti nic nezdvojí")`: `knowledgeStmts` se stejným `(hearsayId, playerId)` dvakrát → 1 řádek, první `via` zůstane.
  - `it("vypršelé věci klub nenačte")`: položka s `expiresAt` < now → `loadClubHearsay` ji nevrátí.
- [ ] **Step 2:** `cd apps/api && npx vitest run src/hearsay/store.db.test.ts` → FAIL (modul chybí).
- [ ] **Step 3:** Migrace, `types.ts`, `store.ts`.
- [ ] **Step 4:** Test → PASS.
- [ ] **Step 5:** Migrace na lokální D1 (`reference_lokalni_vyvoj`) a na `prales-db-test` (`npx wrangler d1 execute prales-db-test --remote --file apps/api/migrations/0335_squad_hearsay.sql`). Prod až s nasazením, se zálohou.
- [ ] **Step 6:** Commit `feat(hearsay): tabulky a úložiště toho, kdo co ví (0335)`.

### Task 4: Rozpoznání, o kom trenér mluví

**Files:**
- Create: `apps/api/src/hearsay/detect.ts`
- Test: `apps/api/src/hearsay/detect.test.ts`

**Interfaces:**
- Consumes: `addressedPlayers`, `plainWords` (`messaging/squad-talk.ts`), `askModelJson`, `COACH_TEXT_RULE`, `coachQuote` (`messaging/ai-player-chat.ts`).
- Produces:
  ```ts
  export interface MentionCandidate { id: string; firstName: string; lastName: string; nickname?: string | null }
  export interface DetectedMention { playerId: string; kind: HearsayKind; quote: string }
  export function mentionCandidates(club: MentionCandidate[], message: string, excludeIds: string[]): MentionCandidate[]
  export function buildMentionPrompt(o: { message: string; recipientName: string | null; squadChat: boolean; candidates: MentionCandidate[] }): string
  export function parseMentions(raw: unknown, candidates: MentionCandidate[], message: string): DetectedMention[]
  export async function detectMentions(env: ChatEnv, o: { message: string; recipientName: string | null; squadChat: boolean; club: MentionCandidate[]; excludeIds: string[] }): Promise<DetectedMention[]>
  ```
- Síto: `mentionCandidates` = `addressedPlayers(club, message)` **bez** pravidla „křestní jméno jen jednou v kádru“ (pro zmínku stačí i nejednoznačné, rozhodne model), minus `excludeIds`. Prázdné → `detectMentions` vrátí `[]` bez volání modelu.
- Prompt: seznam kandidátů s id a celým jménem a přezdívkou; druhy s českými příklady z produ („Šmejkal se fláká“ = criticism, „pásku budeš mít ty místo Straky“ = decision_against pro Straku, „v základu vedle Szaba“ = nic o Szabóovi, „Grillak podle mě nebude“ = none); pravidlo: jméno, které je běžné slovo („pořádně“, „pivko“, „Německo“), není zmínka; u dvou hráčů se stejným příjmením bez křestního jména vrať `none`. JSON `{"mentions":[{"player_id":"…","kind":"praise|criticism|decision_against|decision_for|none","quote":"…"}]}`, max 3.
- `parseMentions`: zahodí `none`, neznámé id, citaci, která ve zprávě není (normalizace `plainWords`), duplicitní dvojici (id, kind).

- [ ] **Step 1: Failing testy** (`detect.test.ts`, čistě bez modelu):
  - `it("síto najde Šmejkala i ve tvaru Šmejkalem")`: `mentionCandidates([{id:"x",firstName:"Rostislav",lastName:"Šmejkal"}], "Se Šmejkalem si promluvím", [])` → `[x]`.
  - `it("bez jména spoluhráče se model nevolá")`: `detectMentions` s `askModelJson` zamockovaným → mock nevolán, výsledek `[]`.
  - `it("adresát sám není zmínka")`: `excludeIds: ["x"]` → `[]`.
  - `it("model vymyslí citaci, zahodí se")`: `parseMentions({mentions:[{player_id:"x",kind:"criticism",quote:"je to lempl"}]}, cand, "Se Šmejkalem si promluvím")` → `[]`.
  - `it("neznámé id a none se zahodí")`.
  - `it("dva Tomanové jdou do modelu oba")`: candidates obsahuje Miroslava i Martina Tomana pro „mezi Růžičkou a Tomanem“.
- [ ] **Step 2:** `npx vitest run src/hearsay/detect.test.ts` → FAIL.
- [ ] **Step 3:** Implementace.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Ruční ověření promptu na lokálu proti Workers AI na 8 větách z produ (rozbor ve specu, bod 1–5 a Review Focus 1–2); výsledek zapsat do komentáře testu jako „ověřeno na …“.
- [ ] **Step 6:** Commit `feat(hearsay): rozpoznání zmínek o spoluhráčích ve zprávách trenéra`.

### Task 5: Dopady, když se to hráč dozví

**Files:**
- Create: `apps/api/src/hearsay/effects.ts`
- Modify: `apps/api/src/lib/coach-relation.ts` (nový `CoachRelationSource` `"hearsay"`)
- Test: `apps/api/src/hearsay/effects.test.ts`, `apps/api/src/hearsay/effects.db.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface LearningEffect { relation: number; morale: number; unrest: number; message: boolean }
  export function learningEffect(kind: HearsayKind, via: KnowledgeVia, o: { coachTalkedFirst: boolean; seededRoll: number }): LearningEffect
  export async function learningEffectStmts(db: D1Database, o: {
    item: HearsayItem; playerId: string; via: KnowledgeVia; gameDay: string; now: Date;
  }): Promise<{ stmts: D1PreparedStatement[]; message: boolean }>
  /** Psal trenér hráči v jejich konverzaci 1:1 od `sinceIso`? (zpráva `sender_type = 'user'`) */
  export async function coachTalkedSince(db: D1Database, o: { clubTeamId: string; playerId: string; sinceIso: string }): Promise<boolean>
  ```
- Hodnoty (pinned; `via` = cokoli kromě `direct`/`squad_chat` je „za zády“):

  | kind | za zády | před kabinou (`squad_chat`, čte to sám) |
  |---|---|---|
  | praise | vztah +3, nálada +2, zpráva při `seededRoll < 0.5` | vztah +4, nálada +3, bez zprávy |
  | criticism | vztah −4, nálada −3, zpráva | vztah −5, nálada −4, bez zprávy |
  | decision_against | vztah −3, nálada −4, nespokojenost +10 (jen když `transferUnrest` existuje), zpráva | vztah −2, nálada −3 |
  | decision_for | nálada +2, bez zprávy | nálada +3 |

  `coachTalkedFirst` (trenér psal dotčenému 1:1 od 24 h před vznikem věci do teď) → záporné hodnoty ×0,5 (zaokrouhlit k nule). `via === "direct"` u dotčeného nenastane (adresát není předmět).
- `learningEffectStmts`:
  - **Deduplikace:** dotčený už má znalost stejného `kind` o sobě za poslední 3 dny → žádný dopad, `message: false`.
  - **Strop kladného:** `squad_chat` jde přes `dopadRozhovoru` (`messaging/coach-initiated.ts`, sdílí strop s 1:1, zdroj `sms_coach`); „za zády“ kladné nejvýš jednou za herní den (`coach_relation_log` `source = 'hearsay' AND delta > 0` v daný `game_date`), jinak kladné složky 0.
  - Vztah přes `coachRelationStmts` (`source: "hearsay"`, popis česky bez čísel, např. „Slyšel, žes ho za zády kritizoval“), nálada stejným SQL jako `dopadRozhovoru`, nespokojenost `json_set(... '$.transferUnrest.level', MIN(100, level + ?))` jen `WHERE json_extract(life_context,'$.transferUnrest') IS NOT NULL`.

- [ ] **Step 1: Failing testy:**
  - `effects.test.ts`: `it("tabulka dopadů za zády")`: `learningEffect("praise","brothers",{coachTalkedFirst:false,seededRoll:0.3})` → `{relation:3, morale:2, unrest:0, message:true}`, `learningEffect("criticism","rivals",…)` → `{relation:-4, morale:-3, unrest:0, message:true}`, `it("když to trenér řekl první, kritika bolí polovinu")` → `criticism` s `coachTalkedFirst: true` → `{relation:-2, morale:-1}` (−1,5 → −1), `it("před kabinou žádná zpráva")`, `it("decision_for nepíše")`.
  - `effects.db.test.ts`: `it("pět pochval za den zvedne vztah jednou")` (Review Focus 3), `it("druhá kritika do tří dnů nic neudělá")`, `it("nespokojenost roste jen hráči, který ji má")`.
- [ ] **Step 2:** FAIL. **Step 3:** implementace. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(hearsay): dopad na hráče, který se dozví, co o něm trenér řekl`.

### Task 6: Zpráva trenéra → zápis věci (1:1 i kabina)

**Files:**
- Create: `apps/api/src/hearsay/coach-message.ts`
- Modify: `apps/api/src/routes/messaging.ts:785-792` (vedle `handleCoachMessageForCommitment`) a `:877-884` (kabina)
- Test: `apps/api/src/hearsay/coach-message.db.test.ts`

**Interfaces:**
- Consumes: `detectMentions` (Task 4), `recordHearsay` (Task 3), `learningEffectStmts` (Task 5).
- Produces:
  ```ts
  export async function handleCoachMessageForHearsay(db: D1Database, env: ChatEnv, o: {
    teamId: string; convId: string; convType: "player" | "squad_group"; recipientPlayerId: string | null; text: string; now?: Date;
  }): Promise<number>  // počet zapsaných věcí
  ```
- Klub = `COALESCE(parent_team_id, id)`; kádr = aktivní hráči klubu a jeho U21 (`team_id IN (club, u21)`, `status IS NULL OR 'active'`). AI klub → `0`.
- 1:1: věc s `origin: "coach_sms"`, `recipientPlayerId` = adresát, knowers `[{ adresát, "direct" }]`.
- Kabina (jen konverzace s názvem `Kabina`, ne zápasový chat `⚽ vs …`): `origin: "coach_squad"`, knowers = celý kádr áčka s `via: "squad_chat"` (včetně dotčeného) a pro dotčeného hned `learningEffectStmts(..., via: "squad_chat")`.
- Route: volat přes `c.executionCtx.waitUntil(...)` s `.catch((e) => logger.error({ module: "messaging" }, "zmínky o spoluhráčích", e))`; u 1:1 jen `!body.optionId && hasText`; nesmí zdržet odpověď hráče (nečeká na ni `commitmentReady`).

- [ ] **Step 1: Failing testy** (model zamockovaný přes `vi.mock("./detect")`):
  - `it("SMS Šímovi o Šmejkalovi zapíše věc, kterou zná jen Šíma")`.
  - `it("kritika v kabině: ví ji celá kabina a Šmejkalovi klesne nálada hned")`.
  - `it("zápasový chat ⚽ vs se nezpracuje")`.
  - `it("AI klub nic nezapíše")`.
- [ ] **Step 2:** FAIL. **Step 3:** implementace + route. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(hearsay): co trenér napíše o spoluhráči, hra si zapíše`.

### Task 7: Šíření po vazbách

**Files:**
- Create: `apps/api/src/hearsay/spread.ts`
- Modify: `apps/api/src/messaging/casual-messages.ts` (`runPhoneHourly`: volat `spreadHearsay` před doručením zpráv; exportovat `ACTIVE_MANAGER_DAYS`)
- Test: `apps/api/src/hearsay/spread.test.ts`, `apps/api/src/hearsay/spread.db.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface SpreadPlayer { id: string; temper: number; discipline: number; leadership: number }
  export interface SpreadTie { a: string; b: string; type: string; strength: number }
  export interface SpreadInput {
    items: HearsayItem[]; knowledge: HearsayKnowledge[]; players: SpreadPlayer[]; ties: SpreadTie[];
    pubPairs: Set<string>;  // "idA|idB" seřazeně, seděli spolu v hospodě za posledních 24 h
    hourKey: string;        // ISO hodina běhu, součást seedu
  }
  export function spreadStep(input: SpreadInput): HearsayKnowledge[]   // jen nové řádky
  export async function spreadHearsay(db: D1Database, now: Date): Promise<{ learned: number; clubs: number }>
  ```
- Konstanty (pinned, kalibrace v Task 11):
  `HOURLY_BASE = 0.05`; `KIND_FACTOR = { praise: 1, criticism: 1, decision_for: 1, decision_against: 1.4 }`;
  `TIE_FACTOR = { brothers: 1, father_son: 1, drinking_buddies: 0.8, mentor_pupil: 0.6, in_laws: 0.5, neighbors: 0.5, classmates: 0.5, coworkers: 0.3 }`, bez vazby `teammate: 0.12`;
  rival: 0.9, když cíl je dotčený a věc je `criticism`/`decision_against`, jinak 0.1;
  síla `strength / 50` (bez vazby 1); povaha předávajícího `0.6 + 0.6·temper/100 + 0.4·(100 − discipline)/100`, u `leadership ≥ 70` a záporné věci ×0.6; spolu v hospodě ×2.
  Šance = součin, oříznout na 0,9. Seed `seedFromString(`${itemId}:${fromId}:${toId}:${hourKey}`)`.
- Pravidla: dotčený o sobě nešíří; jen věci mladší než `SPREAD_WINDOW_DAYS`; nejvýš 3 noví na věc a běh; cíl musí být v kádru klubu (áčko + U21, aktivní, ne na hostování jinde); `via` = typ vazby (nejsilnější, když jich je víc), `pub` když rozhodla hospoda, `teammate` bez vazby.
- `spreadHearsay`: jen 7–22 h v Praze, jen kluby s nevypršelou věcí a `user_id != 'ai'`; po klubu načíst hráče (personality JSON → temper/discipline/leadership), vazby (`relationships` přes oba sloupce), `pub_sessions.attendees` z posledních 24 h; nové řádky zapsat `knowledgeStmts` a pro dotčeného připojit `learningEffectStmts` (Task 5), u `message: true` zapsat `message_state = 'pending'`. Jeden `db.batch` na klub, chyba klubu → `logger.warn` a další klub.

- [ ] **Step 1: Failing testy:**
  - `spread.test.ts`: `it("bratr předá kritiku dotčenému častěji než kolega")` (1 000 hodin se seedem → podíl bratr > 2× kolega), `it("pochvala a kritika po stejné vazbě stejně často")` (rozdíl < 10 %), `it("rival nese kritiku, pochvalu skoro ne")`, `it("dotčený o sobě nešíří")`, `it("hráč mimo kádr se nedozví")` (Review Focus 4), `it("deterministické pro stejný hourKey")`, `it("nejvýš tři noví na věc a běh")`.
  - `spread.db.test.ts`: `it("Šmejkal se to dozví od bráchy Šímy, má dopad a čekající zprávu")`.
- [ ] **Step 2:** FAIL. **Step 3:** implementace + napojení do `runPhoneHourly` (s `.catch` + `logger.warn`). **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(hearsay): šíření po vazbách v hodinovém běhu Telefonu`.

### Task 8: Zpráva „slyšel jsem…“

**Files:**
- Create: `apps/api/src/hearsay/messages.ts`
- Modify: `apps/api/src/messaging/ai-player-scenarios.ts` (scénáře `heard_criticism`, `heard_decision` (category `complaint`), `heard_praise` (category `casual`), všechny `weight: () => 0`), `apps/api/src/messaging/casual-messages.ts` (`runPhoneHourly` volá `deliverHearsayMessages` po šíření)
- Test: `apps/api/src/hearsay/messages.db.test.ts`

**Interfaces:**
- Consumes: `generateInitialMessage`, `getOrCreatePlayerConversation`, `postPlayerMessageStmts`, `pushPhoneMessage`, `playerTimeContext`, `loadPlayerSnapshot`/`loadTeamContext`/`loadLastMatchContext`.
- Produces: `export async function deliverHearsayMessages(db: D1Database, env: PhoneEnv, now: Date): Promise<{ sent: number; skipped: number; expired: number }>`
- Výběr: `message_state = 'pending'`; klub s manažerem aktivním do `ACTIVE_MANAGER_DAYS` (jinak `skipped`); dnes (herní den klubu) odesláno < 2 (`messaged_at`); priorita `decision_against` > `criticism` > `praise`; hráč nespí (`situace !== "spi"`); konverzace nemá `ai_thread_active = 1` (jinak počká); `pending` starší 48 h → `expired`; model nedostupný → zůstává `pending` (Review Focus 5).
- Vlákno: stav ve tvaru `AiThreadStateData` jako ve `spawnForTeam` (`ai-player-spawn.ts:911`), `scenario_id` podle druhu + `hearsay_id`; první zpráva přes `generateInitialMessage` se scénářem; prompt ví, co přesně trenér napsal, komu a od koho to hráč má (zajistí Task 9). Zpráva se odešle jen hráčům klubu (`playerInClub`).
- Texty scénářů (popis pro model): heard_criticism: „Od spoluhráče ses dozvěděl, co o tobě trenér napsal někomu jinému (máš to v paměti). Jsi dotčený, chceš to slyšet do očí. Řekni, od koho to víš.“; heard_decision: „Od spoluhráče ses dozvěděl rozhodnutí trenéra na tvůj úkor (máš to v paměti). Mrzí tě, že ti to neřekl sám. Řekni, od koho to víš.“; heard_praise: „Kluci ti řekli, že tě trenér chválil. Potěšilo tě to, poděkuj po svém, klidně s vtipem.“

- [ ] **Step 1: Failing testy** (model zamockovaný):
  - `it("pošle nejvýš dvě zprávy na klub a den, rozhodnutí první")`.
  - `it("neaktivnímu manažerovi nepíše, dopad zůstává")`.
  - `it("spícímu hráči počká")`, `it("po 48 hodinách propadne")`, `it("výpadek modelu nechá zprávu čekat")`.
  - `it("otevře vlákno se scénářem heard_criticism a hearsay_id")`.
- [ ] **Step 2:** FAIL. **Step 3:** implementace. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(hearsay): hráč se ozve, co se o sobě doslechl`.

### Task 9: Hráč si pamatuje, co slyšel

**Files:**
- Create: `apps/api/src/hearsay/prompt.ts`
- Modify: `apps/api/src/messaging/ai-player-scenarios.ts` (`PlayerSnapshot.hearsay?: HearsayMemoryLine[]`), `apps/api/src/messaging/player-memory.ts` (`loadChatMemory` načte `loadPlayerHearsay`, `memoryPromptLines` přidá `hearsayPromptLines`)
- Test: `apps/api/src/hearsay/prompt.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface HearsayMemoryLine {
    aboutMe: boolean; subjectName: string; recipientName: string | null; quote: string;
    kind: HearsayKind; via: KnowledgeVia; fromName: string | null; learnedAt: string;
  }
  export function hearsayPromptLines(lines: HearsayMemoryLine[] | undefined): string[]
  ```
- Řádky (nejvýš 3, o sobě první): o sobě „- Víš od {fromName} ({via slovy: brácha, táta, kámoš od piva, soused, spolužák, kolega z práce, rival, v hospodě se povídalo, trenér to napsal do kabiny}), že trenér napsal {recipientName}: „{quote}“.“; o jiném „- Slyšel jsi, že trenér napsal {recipientName} o {subjectName}: „{quote}“.“ Na konec pravidlo: „Nic dalšího o tom, co kdo říkal, si nevymýšlej. Když se trenér zeptá, od koho to víš, řekni pravdu.“ Jména vždy v 1. pádě (`reference_generovane_ceske_texty`).
- `fromName`/`recipientName` musí být v `team.squadNames`, jinak řádek vynechat (prompt jiná jména zakazuje).

- [ ] **Step 1: Failing testy:** `it("o sobě má přednost a zdroj je slovy")`, `it("nejvýš tři řádky")`, `it("bez znalostí nic")`, `it("texty bez dlouhé pomlčky")`.
- [ ] **Step 2:** FAIL. **Step 3:** implementace + napojení. **Step 4:** PASS + `npx vitest run src/messaging` (stávající testy promptu zelené).
- [ ] **Step 5:** Commit `feat(hearsay): hráč v rozhovoru ví, co se doslechl`.

### Task 10: Kapitáni a „řekl mi to sám“ u truce

**Files:**
- Create: `apps/api/src/hearsay/captain.ts`
- Modify: `apps/api/src/services/lineup.ts:182-200` (`setTeamRoles`), `apps/api/src/transfers/unrest.ts:448-452` (`captaincy`), `apps/api/src/services/lineup.ts:38` (`saveLineup`), `apps/api/src/multiplayer/left-out.ts` (`reactToLeftOut`)
- Test: `apps/api/src/hearsay/captain.db.test.ts`, doplnit `apps/api/src/multiplayer/left-out.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export async function recordCaptainChange(db: D1Database, o: { teamId: string; oldCaptainId: string | null; newCaptainId: string | null; now?: Date }): Promise<void>
  export async function recordArmbandSnub(db: D1Database, o: { teamId: string; clubCaptainId: string | null; matchCaptainId: string | null; starterIds: string[]; matchKey: string; now?: Date }): Promise<void>
  ```
- Consumes: `coachTalkedSince` (Task 5, `hearsay/effects.ts`).
- `recordCaptainChange`: starý kapitán ≠ nový a oba existují → věc `decision_against` o starém (`origin: "captain_change"`, `quote: "Kapitánem je teď {jméno nového}"`). Zpočátku ji ví jen nový kapitán (`via: "teammate"`), starý se to dozví šířením (rozhodnutí se šíří ×1,4). AI klub nic.
- `recordArmbandSnub`: klubový kapitán je v základu a kapitán zápasu je někdo jiný → `decision_against` o klubovém kapitánovi (`origin: "lineup_armband"`), jednou na `matchKey` (id věci `armband:{matchKey}:{playerId}`).
- Truc (`reactToLeftOut`): trenér hráči psal 1:1 za posledních 48 h před zápasem → `moraleLoss` a `sulkChance` ×0,5 (nová volitelná vstupní hodnota `toldInAdvance`), nezdvojuje dopad hearsay (vynechání ze sestavy hearsay nevytváří).

- [ ] **Step 1: Failing testy:** `it("nová páska: starý kapitán má věc na úkor a ví ji zatím jen nový")`, `it("stejný kapitán nic")`, `it("kapitán zápasu jiný než klubový v základu zapíše jednou na zápas")`, `it("AI klub nic")`, `left-out.test.ts`: `it("když mu to trenér předem napsal, zklamání je poloviční")`.
- [ ] **Step 2:** FAIL. **Step 3:** implementace + napojení (volat po úspěšném UPDATE, chyba → `logger.warn`, nesmí shodit uložení rolí ani sestavy). **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(hearsay): starý kapitán se ozve, truc menší, když to trenér řekl sám`.

### Task 11: Kalibrace a ověření jako hráč

**Files:**
- Create: `apps/api/scripts/hearsay-sim.ts` (necommitovaný výstup do scratchpadu)

- [ ] **Step 1:** Skript nad lokální kopií produ (`reference_lokalni_vyvoj`): vezme SMS trenérů z posledních 14 dní, pustí na ně síto + `parseMentions` s Workers AI, pak 7 dní hodinového `spreadStep`. Výstup: věcí na klub a týden, kolik se jich dozvěděl dotčený, kolik zpráv „slyšel jsem“ by šlo (po stropu 2/den), poměr pochval a kritik došlých k dotčenému.
- [ ] **Step 2:** Cíl: aktivní klub 2–6 zpráv „slyšel jsem“ týdně, pochvaly a kritiky došlé v poměru jako napsané (±20 %). Mimo cíl → upravit `HOURLY_BASE` (jediná páka), zapsat do komentáře konstanty datum a čísla.
- [ ] **Step 3:** Lokálně (localhost:8787 + web): jako trenér napsat Šímovi dlouhou přirozenou větou kritiku Šmejkala, pak pochvalu jiného hráče do kabiny, změnit kapitána. Pustit `runPhoneHourly` ručně (admin `POST /api/admin/phone-hourly`), zkontrolovat: zápis v `squad_hearsay*`, vztah/nálada Šmejkala, SMS „slyšel jsem…“ se skutečným zdrojem, odpověď na omluvu trenéra, paměť v dalším rozhovoru. 375 px.
- [ ] **Step 4:** Kontrolní tabulka ze specu (řádky fáze 1): ke každému „co hráč uvidí“ dohledat zápis i místo dopadu; nic, co jen mluví.
- [ ] **Step 5:** `npm run typecheck` a `cd apps/api && npx vitest run` → zelené (předem selhávající testy nahlásit, ne opravovat).
- [ ] **Step 6:** Commit skriptu `chore(hearsay): simulace šíření nad kopií produ`. Testing až na pokyn uživatele (`/ship-test`).
