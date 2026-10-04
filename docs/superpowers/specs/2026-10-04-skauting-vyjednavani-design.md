# Skauting mimo vlastní ligu + skutečné vyjednávání o přestupu

## Kontext

Manažer dnes vidí hráče jen ve své lize a svém okrese. Skaut existuje jen jako role v personálu
(týdenní mzda, pondělní SMS tip na volného hráče z vlastního okresu, zpřesňuje odhad potenciálu
vlastních hráčů). Nákup od cizího klubu na trhu je zjednodušený: nabídneš požadovanou cenu,
hráč projde jedním náhodným hodem a přestup je hotový. Klub vůbec nesmlouvá
(`routes/game.ts` „Virtuální klub o ceně nejedná“).

Cíl: zaplatit si skauta, dát mu úkol a okruh, kam má jezdit, a postupně od něj dostávat tipy.
Koupě nesmí být jistota, klub naproti chce vytáhnout maximum. Zároveň to nesmí rozbít ligu:
bohatý klub nesmí nakoupit spoustu hráčů výrazně nad úrovní soutěže.

### Rozhodnutí uživatele (2026-10-04)
- **Zdroj hráčů:** kluby mimo hru v obcích v okruhu + volní hráči z jiných okresů v okruhu.
- **Úkoly skautovi:** formulář na stránce skauta (Zaměstnanci → Skaut).
- **Vyjednávání:** nabídka a protinávrhy v Přestupech (stávající formulář a časová osa),
  protistranu hraje AI klub.
- **Stávající CPU trh:** zůstává, ale i tam se vyjednává. Klub, který hráče sám nabízí,
  začíná níž a povolí dřív než klub, kterému hráče vyfukuješ.
- **Balanc:** jen měkké brzdy, žádný pevný strop. Kvalita klubů mimo hru podle dat
  + zvláštní režim pro mladé (do 21) s potenciálem.

## Jak to hráč zažije

1. **Zaměstnanci → Skaut → „Úkol a hlášení“** (nová stránka `/zamestnanci/skaut`). Formulář:
   pozice, věk od–do, okruh (do 15 / 30 / 50 km od vlastní obce), délka (2 / 4 / 8 týdnů).
   Cestovné je napsané v info řádku pod volbou, ne v tlačítku. Tlačítko „Poslat skauta“.
   Jeden aktivní úkol, jde ukončit (bez vrácení peněz).
2. **Skaut jezdí a hlásí.** Každý týden objede 2–4 kluby v okruhu, v pondělí pošle nejvýš
   1 SMS do konverzace „Skaut“ s tlačítkem „Otevřít hlášení“. Když nic nenajde, mlčí, případně
   to v pondělí krátce napíše.
3. **Hlášení** (seznam na stránce skauta + podzáložka „Od skauta“ v Přestupy → Hledat):
   jméno, věk, pozice, klub a obec, vzdálenost, **hodnocení jako rozmezí** (např. 46–58),
   u mladých názor na potenciál, plusy a minusy, ochota hráče (dojíždění), postoj klubu
   (prodá / nerad / opora). Hlášení platí 10 dní, mezitím ho může sebrat jiný klub.
   „Podívej se na něj znovu“ zúží rozmezí, stojí cestovné a týden práce skauta.
4. **Vyjednávání** z hlášení („Začít jednat“) nebo z inzerátu na trhu („Nabídnout“) vede na
   stávající detail nabídky `/prestupy/nabidka/[id]`. Částka, záloha a splátky, bez procent
   z dalšího přestupu (cizí klub je nebere). Klub odpoví **s prodlevou 1–4 hodiny** (v noci
   až ráno): souhlasí, protinávrh, odmítne, nebo jednání ukončí. Časová osa ukazuje tahy obou
   stran. Klub smlouvá nahoru, opora je dražší, urážlivá nabídka ubere trpělivost.
5. **Klub souhlasí → „Podepsat“.** Teprve pak se rozhodne hráč (ochota dojíždět, síla klubu,
   plný kádr). Peníze se strhnou atomicky až při podpisu. Odmítnutí hráče = žádné peníze, konec.
6. **Volný hráč z jiného okresu** z hlášení se podepisuje rovnou (bez klubu) přes stávající
   podpis volného hráče, platí jen souhlas hráče.

## Balanční model (každé číslo se zdrojem)

**Hlavní zjištění z dat:** peníze bohatý klub nebrzdí (median Prachatice ~85 tis./týden čistě,
AppYours ~196 tis./týden, 816 tis. na účtu; data, transakce 6. 9.–3. 10.). Brzdou je
**kvalita klubů mimo hru**, **ochota hráče** a **velikost kádru**.

| Veličina | Hodnota | Zdroj |
|---|---|---|
| Průměr kádru klubu mimo hru | 4,71 · ln(počet obyvatel obce) | fit na ručně nastavené ratingy `VIRTUAL_TEAMS` (virtual-teams.ts:27-35) ↔ populace; ne fotbalová data |
| Rozptyl v kádru | sd 4,5 | data: rozptyl AI inzerátů v rámci klubu (prod) |
| Vznik hráče | `createPlayer` s cílem průměr + N(0; 3,1), generátor sám přidá ~3,3 | vzor virtual-teams.ts:140, ověřeno replikou |
| Klubů navštívených za týden | round(2 × `scoutChanceMultiplier`) = 2–4 | staff-effects.ts:154 |
| Tipů za týden | max 1, jen když odhad ≥ 11. nejlepší v kádru kupce | staff-tick.ts (pondělní tip), development.ts:76 |
| Režim mladých (věk do 21) | tip, když skautův odhad potenciálu ≥ 11. nejlepší v kádru | rozhodnutí uživatele |
| Mlha hodnocení | ±max(2, round((18 − 14·eff/20)/√návštěv)) | `rozptylOdhadu` development.ts:58 + statistické √n |
| Cestovné | 100 Kč za km okruhu za týden → 1 500 / 3 000 / 5 000 | **odhad**, ukotvený cenou fanbusu 1 200–3 500 (fanbase-config.ts:52-75) |
| Platnost hlášení / denní šance, že ho sebere jiný | 10 dní / 3 % | **odhad** |
| Prodleva odpovědi klubu | 1–4 h, noc až ráno | **odhad** (vzor realistické prodlevy postav) |

**AI prodejce.** Skrytá rezervační cena R = tržní cena × M × e^N(0; 0,25), šum je **odhad**.

| Typ prodejce | M | První požadavek | Trpělivost | Zdroj M |
|---|---|---|---|---|
| Inzerát (sám prodává) | 0,85 × inzerát | stávající `calcAskingPrice` | 3 | data: lidské přestupy, přijato/tržní p25 = 0,77; konečná/první protinávrh p25 = 0,85 |
| Vyfouknutí, náhradník | 1,03 | R × U(1,0; 1,35) | 2 | data: medián přijato/tržní (≥ 5 tis., od 15. 9., n = 22) |
| Vyfouknutí, hráč základu | 1,35 | R × U(1,0; 1,35) | 2 | data: p75 |
| Vyfouknutí, nejlepší hráč klubu | 1,87 | R × U(1,0; 1,35) | 1 | data: p90 |

Kolo (PV = současná hodnota nabídky, poměr = požadavek / PV):
- PV ≥ požadavek → souhlas.
- R ≤ PV < požadavek → souhlas. Vyfukovaný klub v 1. kole s p = 0,38 ještě přitlačí
  protinávrhem v půlce (data: 46 ze 120 dohod mělo protinávrh).
- poměr < 1,5 → protinávrh max(R; požadavek × 0,93), trpělivost se nemění
  (data: krok protinávrhu p25 = 0,93).
- 1,5 ≤ poměr < 3 → protinávrh, trpělivost −1. Poměr ≥ 3 → urážka, trpělivost −2.
- Trpělivost 0 → konec jednání, 14 dní pauza (vzor `COOLDOWN_DAYS` sponzorů,
  virtual-teams.ts:297). Nový pokus začíná s trpělivostí o 1 nižší (paměť).
- **Splátky** se diskontují 2,06 % týdně, takže splátky nejsou levnější než bankovní půjčka
  15 % (defaults.ts:51) a nejde trik „záloha 10 % + 20 drobných splátek“.

**Souhlas hráče:** `evaluateSigningChance` (player-agency.ts:33) + síla klubu
clamp((průměr kádru kupce − průměr klubu mimo hru) × 1,3; −20; +30) (player-interest.ts:65).
Náhoda ±10 je **seedovaná na (hráč, kupec, sezóna)**, aby nešla přehazovat. Velký kádr
(35 hráčů = −15) je skutečná brzda hromadění.

**Simulace sezóny (4 000×, data model):**
- Top klub (jedenáctka 60,9, skaut 19, 50 km): ~4 tipy, výrazná posila 0,07/sezónu.
- Střední klub (56,2): ~13 tipů, ~3 koupě.
- Slabý klub (48,4): ~14 tipů, ~5 koupí, dotáhne se k průměru.

Kluby mimo hru končí kolem mediánu jedenáctek ligy. Top klubům dává smysl hlavně režim mladých.

**Názvosloví:** „klenot“ už v kódu znamená mladíka s vysokým potenciálem (GEM_CHANCE,
generator.ts:284), tak to zůstane. Silnému hotovému hráči se v textech říká „posila“.

## Architektura

### Nalezené překážky (ověřeno v kódu / na produ)
- `transfer_offer_events.team_id` má cizí klíč na `teams` (0077, ověřeno i na produ) a dotaz
  na časovou osu dělá inner join na `teams` (game.ts:6730). Tah AI klubu teď nejde uložit ani
  zobrazit.
- `transfer_offers` cizí klíč na hráče ani na prodejce nemá (ověřeno na produ), takže nabídky
  AI klubu jsou možné.
- Seznamy v `GET /offers` (game.ts:6434, 6453) inner joinují `players`/`teams` přes
  `to_team_id`, takže nabídky AI prodejci by v nich chyběly.
- Counter/reject/withdraw posílají SMS a notifikace „druhé straně“. Pro `'cpu'` by insert
  spadl (FK `conversations`/`notifications`).
- Accept handler načítá hráče z `players` (game.ts:6861). Větev pro AI prodejce musí být před tím.
- Nabídky ve stavu `countered` nikdy nevyprší (`transfer-pressure-tick.ts` řeší jen `pending`).

### Migrace (0236–0238)
- **0236_scouting.sql**
  - `scout_assignments`: tým, skaut, pozice, věk, `radius_km`, týdny, `weekly_cost`,
    `last_charged_game_date`, stav, data. Unikátní aktivní úkol na tým.
  - `scout_reports`: hráč před koupí jako JSON `player_data` (stejný tvar jako `ai_player_data`,
    klientovi se neposílá), zdroj `village_club|free_agent`, obec, klub, vzdálenost,
    `rating_lo/hi`, `potential_lo/hi`, návštěvy, plusy a minusy, ochota, postoj klubu, stav,
    `offer_id`, `ai_memory`, `expires_at`. `id` = budoucí `players.id`.
- **0237_ai_seller_offers.sql:** `transfer_offers` + `listing_id`, `scout_report_id`,
  `ai_state` JSON (skrytá R, požadavek, trpělivost, kolo, seed), `ai_pending_reply` JSON,
  `ai_reply_due_at`. AI prodejce = `to_team_id = 'cpu'` (`CPU_CLUB_ID`), identita klubu ve
  `virtual_team_data`.
- **0238_offer_events_actor.sql:** přestavba `transfer_offer_events` bez FK na `teams`,
  + `actor_name`, typy událostí + `agree`, `break_off`. **Na produ před ní záloha**
  (`wrangler d1 export`), spouští uživatel přes `!`.

### Server (nové moduly)
- `packages/shared/src/types/scouting.ts`: okruhy a cestovné, délky úkolů, hranice věku (sdílí API i web).
- Čisté funkce s testy:
  - `apps/api/src/scouting/balance.ts`: konstanty z tabulek výše.
  - `apps/api/src/scouting/fog.ts`: rozmezí hodnocení a názor na potenciál. Stabilní na seed,
    pravda je vždy uvnitř. `stabilniPosun` se přesune do `lib/stable-random.ts`
    a `rozptylOdhadu` ze `development.ts` se sdílí.
  - `apps/api/src/scouting/candidates.ts`: obce v okruhu (`haversineKm` z player-agency.ts:23,
    předfiltr bounding boxem), jen obce bez týmu, název klubu (`CLUB_PREFIXES` z virtual-teams.ts),
    filtr úkolu.
  - `apps/api/src/scouting/report-text.ts`: české texty plusů a minusů, ochoty a SMS, bez dlouhé pomlčky.
  - `apps/api/src/transfers/ai-seller.ts` + `ai-seller-balance.ts`: `initAiSellerState`,
    `decideAiSellerReply` (souhlas / protinávrh / odmítnutí / konec), `effectiveBidValue`
    (diskont splátek), `aiReplyDelayMinutes`.
- Funkce nad DB:
  - `apps/api/src/scouting/assignment.ts`: založení úkolu (1. týden cestovného hned),
    zrušení, týdenní stržení v `processWeeklyFinances` (finance-processor.ts:202, typ `scout_travel`).
  - `apps/api/src/scouting/scout-tick.ts` `runScoutWork`, zavěšený do `executeStaffTick`
    (05:00 UTC, idempotentní přes KV). Postup: návštěvy, vznik hráče přes `createPlayer`,
    hlášení + SMS (`metadata {type:'scout_report'}`), opakované návštěvy, expirace
    a „sebral ho jiný“, konec úkolu se shrnutím. Pasivní pondělní `vyberTip` zůstane pro týmy
    bez aktivního úkolu.
  - `apps/api/src/transfers/ai-negotiation.ts`:
    - `startAiNegotiation`, plánování odpovědi po každém tahu kupce (rozhodnutí se spočítá
      hned, uloží se s časem odhalení, takže obnovení stránky nic nepřehodí).
    - `revealDueAiReplies` odhalí odpověď atomicky (`UPDATE … WHERE ai_pending_reply IS NOT NULL
      AND ai_reply_due_at <= ?`, jen při `changes = 1` událost + SMS „Sportovní ředitel“ + push).
      Volá se líně v `GET /offers`, `GET /offers/:id` a při každém cronu.
    - `expireAiOffers`.
  - `apps/api/src/transfers/virtual-purchase.ts`: jedna funkce „virtuální hráč → skutečný“,
    vytažená z dnešního CPU nákupu (game.ts:5816–5928) a společná pro inzeráty i hlášení.
    Pořadí: claim nabídky, claim zdroje, atomické stržení rozpočtu, batch (hráč, splátky
    s `'cpu'` + `seller_name`, stažení ostatních nabídek, smlouva, transakce), při chybě
    rollback. Hráč dostane `residence` = obec a `commute_km` = vzdálenost. Výjimka v
    `generators/jediny-generator.test.ts`.
- Drobné refaktory:
  - Pomocníci splátek (`installmentLimitError`, `installmentBudgetError`) z game.ts do
    `transfers/installments.ts`.
  - `sendSystemSMS` dostane parametr `metadata`.
  - Nový `isAiClub(id)` (`'virtual_ai'`, `'cpu'`) pro všechny větve SMS a notifikací.

### API
Nový `apps/api/src/routes/scouting.ts`, vše jen pro vlastní klub:
- `GET /teams/:teamId/scout`, `POST|DELETE /teams/:teamId/scout/assignment`
- `GET /teams/:teamId/scout/reports[?status]`, `GET …/reports/:id`
- `POST …/reports/:id/revisit`, `POST …/reports/:id/negotiate`, `POST …/reports/:id/dismiss`
- admin `POST /admin/scout/run`, `POST /admin/ai-replies/reveal?force=1` (testování)

Změny stávajících endpointů:
- `/market/:listingId/bid` u AI inzerátu založí jednání místo okamžitého nákupu.
- `GET /offers` a `/offers/:id` ukazují AI prodejce a rozmezí hodnocení.
- `counter` je povolený vůči `'cpu'` a naplánuje odpověď.
- `accept` má pro `'cpu'` vlastní větev: jen po `agree`, strop kádru 30, souhlas hráče, `virtual-purchase`.
- `reject`/`withdraw` neposílají SMS AI klubu.
- `/free-agents/:id/sign` označí hlášení.
- Propuštění nebo přeřazení skauta zruší úkol.
- `GET /budget` počítá s cestovným.

### Web
- `apps/web/src/app/(hra)/zamestnanci/page.tsx`: karta Skaut ukazuje aktivní úkol + odkaz „Úkol a hlášení“.
- Nová `apps/web/src/app/(hra)/zamestnanci/skaut/page.tsx`: formulář úkolu, aktivní úkol,
  seznam hlášení; `?hlaseni=ID` otevře plachtu.
- `apps/web/src/components/scouting/ScoutReportCard.tsx`, `ScoutReportSheet.tsx`:
  - Hlášení: rozmezí, potenciál, plusy a minusy, ochota přes `InterestBadge`, postoj klubu.
  - Akce: „Podívej se znovu“, „Začít jednat“ (SheetDialog s `TransferTermsFields`,
    `allowSellOn={false}`, volba U21) a u volného hráče „Podepsat“.
- `apps/web/src/app/(hra)/prestupy/page.tsx`: podzáložka „Od skauta“, AI inzerát
  „Nabídnout“ → přesměrování na jednání, odstranit okamžitý nákup (`autoAccepted`).
- `apps/web/src/app/(hra)/prestupy/nabidka/[id]/`:
  - Hlavička s rozmezím a odkazem na hlášení.
  - `ActionBar`: po `agree` tlačítko „Podepsat“; během čekání „Klub si to rozmýšlí“.
  - Časová osa: události `agree` / `break_off`.
- `apps/web/src/app/(hra)/telefon/[id]/page.tsx`: tlačítka „Otevřít hlášení“ / „Otevřít jednání“ podle metadata.
- `apps/web/src/app/(hra)/finance/page.tsx`: popisky `scout_travel` „Cestovné skauta“, `scout_visit` „Návštěva skauta“.

## Postup (každý krok samostatně nasaditelný na testing)

0. Uložit tento návrh jako `docs/superpowers/specs/2026-10-04-skauting-vyjednavani-design.md`.
   Pracovat v novém worktree z `origin/testing` (větev `feat/skauting`). Hlavní checkout je
   na `main` se špinavým stromem a `testing` je vytažený v jiném worktree, takže na ně
   nesahat.
1. Základy bez změny chování: migrace 0236–0238, přesuny pomocníků, metadata SMS, `isAiClub`.
2. Čisté moduly + testy: `ai-seller`, `fog`, `candidates`, `report-text`, konstanty.
3. **Vyjednávání na stávajícím CPU trhu.** Engine se ověří na existujícím obsahu: inzerát →
   jednání, zpožděné odpovědi, podpis přes `virtual-purchase`, seznamy, detail, časová osa.
4. Úkoly skauta: endpointy, cestovné ve financích a předpovědi rozpočtu, stránka skauta s formulářem.
5. Hlášení: skautský tick, hlášení, opakované návštěvy, expirace, odkaz z telefonu, záložka „Od skauta“.
6. Jednání z hlášení: postoj „vyfouknutí“, volní hráči z jiných okresů, U21, paměť jednání.

## Ověření

- **Testy (vitest, `FalesnaD1` z `incidents/testovaci-d1.ts`):**
  - `scouting/fog.test.ts`: pravda vždy v rozmezí, zužování, stabilita seedu.
  - `transfers/ai-seller.test.ts`: inzerát začíná níž, opora dražší, urážka, konec po
    trpělivosti, požadavek neroste a neklesne pod R, diskont splátek, determinismus.
  - `scouting/candidates.test.ts`, `assignment.test.ts`, `scout-tick.test.ts`.
  - `transfers/ai-negotiation.test.ts`: odhalení jen jednou a až v čase, stažená nabídka se neodhalí.
  - `transfers/virtual-purchase.test.ts`: rollback, splátky s `'cpu'`, strop kádru,
    odmítnutí hráče = žádné peníze.
  - Úprava `jediny-generator.test.ts`; `transaction-labels.test.ts` pokryje nové typy transakcí.
- `npm run typecheck`, `cd apps/web && npx next build --no-lint`.
- **Test prostředí (API curl):**
  - Úkol skautovi → `POST /admin/scout/run` → hlášení s rozmezím.
  - Opakovaná návštěva zúží rozmezí.
  - Jednání → `POST /admin/ai-replies/reveal?force=1` → protinávrh v časové ose →
    dojednání → podpis → hráč v kádru, peníze a splátky sedí do koruny.
  - Urážlivá nabídka → konec jednání + 14 dní pauza.
  - Odmítnutí hráčem → žádné peníze.
  - Expirace hlášení → nabídka vyprší.
  - Pondělní cestovné strženo právě jednou.
- **MCP prohlížeč jako hráč, všechny větve:**
  - Formulář, SMS od skauta → hlášení, jednání z inzerátu i z hlášení, protinávrh, podpis,
    odmítnutí, konec jednání.
  - Celé v 375 px (iframe) a po čerstvém načtení.
- Na testu po testování nic neuklízet, v reportu jen říct, co se změnilo. Na main až po
  „nasaď na main“, cherry-pickem ve worktree, migrace na produ po záloze přes `!`.
