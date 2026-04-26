# Prales/fmko — návrhy vylepšení

> Roadmapa nápadů na nové featury, řazené pro **feature-per-feature implementaci**.
> Každá položka je atomická — má popis, důvod, implementační poznámky, reuse, status.

## Stav

- 🟦 TODO — nezačato
- 🟧 IN PROGRESS — rozpracované
- ✅ DONE — hotovo a deployed na test
- 🟥 BLOCKED — čeká na něco

## Filosofie

Hra simuluje **český okresní fotbal**. Každý feature musí splňovat alespoň 1:

1. **VESNICKÁ IDENTITA** (V) — hospoda, kostel, rodina, soused, dechovka, posvícení
2. **AKTIVACE MRTVÝCH ATRIBUTŮ** (A) — alcohol, temper, occupation, patriotism, relationships mají dnes nulový impact
3. **DRAMA & LORE** (D) — hra by měla generovat příběhy, ne čísla
4. **DAILY HOOK** (H) — důvod otevřít appku každé ráno

## Doporučené pořadí

**Vlna 1** (rychlé výhry, oživuje DB strukturu): #2, #5, #8, #9, #10, #16, #20, #21
**Vlna 2** (lore, identita): #1, #3, #4, #7, #11, #13, #18, #19, #25
**Vlna 3** (dlouhý ohon, multiplayer): #14, #15, #22, #23, #24

---

# A. Hospoda jako srdce hry

## #1 — Hospoda U Pralesa (perzistentní obrazovka) ⭐
**Status:** 🟦 TODO
**Pilíř:** V+H | **Náročnost:** M

**Co:** Nová sekce v menu vedle Kabiny. List "kdo dnes večer v hospodě" + "co se tam stalo". AI generuje 1 incident denně, postavený na hráčích s vysokým `alcohol` nebo `temper`. Ráno trenér otevře appku → nejdřív čte gossip.

**Proč to bavilo:** Hospoda je srdce vesnice. Daily hook = otevřu appku abych si přečetl co se včera v Pralesu sběhlo. Lore identity.

**Implementace:**
- Nová route `/dashboard/hospoda` (Next.js)
- Nový API endpoint `GET /api/teams/:id/pub` (vrací včerejší/dnešní incidenty + kdo je tam)
- Daily tick task: pro každý tým vyber 2-5 hráčů s vysokým `alcohol` nebo `drinking_buddies` relationship → generuj 1 incident
- AI prompt s charakterem hospodského Mlejnka

**Reuse:**
- `events` tabulka (nový type `pub_incident`)
- `relationships.drinking_buddies`
- `players.alcohol`, `players.temper`
- `apps/api/src/news/ai-reporter.ts`
- daily-tick

**Akceptace:** ráno otevřu hru → vidím incident z včerejška + list 3-5 lidí co tam dnes večer mají být.

---

## #2 — Ranní kocovina po výhře ⭐
**Status:** 🟧 IN PROGRESS (implementováno, čeká deploy + verify)
**Pilíř:** A | **Náročnost:** S

**Implementace:**
- `apps/api/src/multiplayer/match-runner.ts` — po persist condition přidán hangover hook: pro hráče vítězného týmu s `personality.alcohol >= 50` RNG check (10–30 % dle alcohol), trigger snižuje condition o 15 a setuje `life_context.hangover = 1`
- `apps/api/src/season/daily-tick.ts` — clear `life_context.hangover` na začátku tick (analogicky k absence, jednodenní flag)
- `apps/api/src/routes/game.ts` — `availablePlayers` vrací nové pole `hangover: !!lc.hangover`
- `apps/web/src/app/dashboard/match/page.tsx` — ikona 🍺 v lineup tabulce (player picker + XI tabulka) s tooltipem
- `apps/web/src/app/dashboard/squad/page.tsx` — ikona 🍺 vedle jména v Kádru

Typecheck ✅, build ✅. Není potřeba migrace (jen JSON fieldy v `life_context`).

**Co:** Hráč s `alcohol ≥ 14` má po výhře 25-35% šanci přijít na další tréning/zápas s `−15 condition`. V lineup se zobrazí ikona půllitru.

**Proč to bavilo:** Konečně využije `alcohol` atribut. Drama: dáš ho do sestavy s rizikem, nebo posadíš?

**Implementace:**
- Match post-hook: po výhře iteruj přes hráče v lineup, RNG check podle alcohol
- Pokud trigger → zápis do `events` (type `hangover`) + `life_context.absence` nebo `condition -= 15`
- Frontend lineup: ikona půllitru u hráčů s aktivní kocovinou
- Trvá 1 herní den

**Reuse:**
- match engine post-match hook (`apps/api/src/engine/simulation.ts`)
- daily tick (recovery)
- `players.alcohol`
- match lineup UI (`apps/web/app/dashboard/match/page.tsx`)

**Akceptace:** Po výhře 4:1 vidím, že 2 hráči mají kocovinu. Když je nasadím, mají reduced performance ten zápas.

---

## #3 — "Pojedeme na jedno" — rituál po zápase
**Status:** 🟦 TODO
**Pilíř:** V+A | **Náročnost:** S

**Co:** Po zápase modal s 3 volbami:
- Pojedeme na jedno (+5 morale celý tým, riziko 1-2 kocovin)
- Domů (nic)
- Smutný flám (po prohře, +5 chemistry, −2 morale)

**Proč to bavilo:** Aktivní rozhodnutí trenéra. Vibe.

**Implementace:**
- Match post-result modal/CTA na frontendu
- POST `/api/teams/:id/post-match-action` { action: pub|home|sad_pub }
- Aplikuj morale delta + RNG kocovinu

**Reuse:** matchday flow, `events`

**Akceptace:** Po zápase vidím modal, kliknu "Na jedno", druhý den 1-2 hráči s kocovinou + tým má boost morale.

---

## #4 — Rvačka v hospodě
**Status:** 🟦 TODO
**Pilíř:** A+D | **Náročnost:** S

**Co:** Když dva hráči s vysokým `temper` (a `relationships.rivals`) jsou v hospodě → 8% šance že se poperou. Oba 1 zápas off, −10 morale. Trenér řeší kdo s kým může pít.

**Implementace:**
- Daily tick: pro hráče v hospodě (#1), zkontroluj páry s rivalrels + temper > 14
- Pokud trigger → `events` (type `pub_fight`), `life_context.absence` 1 zápas, morale -10
- Kabina notifikace

**Reuse:** `relationships.rivals`, `players.temper`, events, daily tick, messaging

**Akceptace:** Vidím v Kabině: "Pepa a Honza se v Pralesu poprali. Oba dnes do sestavy nemůžou."

---

# B. Práce a život hráčů (`occupation`)

## #5 — Pracovní směny ovlivňují trénink ⭐
**Status:** 🟦 TODO
**Pilíř:** V+A | **Náročnost:** M

**Co:**
- Zedník po dlouhém týdnu na šichtě má −10 condition v pátek
- Učitel získává +1 taktická disciplína při tréninku taktiky
- Zemědělec během žní (15.7.–20.8.) má 30% šanci absence
- Hospodský má v pátek/sobotu večer absence (provoz)

**Proč:** `occupation` se konečně projevuje v gameplay.

**Implementace:**
- Daily tick: per occupation handler logika (mapa: occupation → daily_modifier)
- Sezónní okna pro některé profese
- Frontend: zobrazit "důvod" v life_context.absence ("Dnes na šichtě")

**Reuse:**
- `players.occupation`
- daily tick (`apps/api/src/engine/daily-tick.ts`)
- `life_context.absence`
- season config

**Akceptace:** V srpnu se mi zemědělci omlouvají z žní, učitelé profitují z taktického tréninku.

---

## #6 — "Šéf mě nepustí" zpráva
**Status:** 🟦 TODO
**Pilíř:** V+D | **Náročnost:** S

**Co:** 1× za 2 týdny náhodný hráč píše: "Šéf mě v úterý nepustí na trénink." Trenér: zatlačím (-morale, ale přijde) / nechám (chybí).

**Implementace:**
- Daily tick: 7% pravděpodobnost na hráče s occupation != "důchodce"
- Messaging 1:1 + 2 quick-reply tlačítka
- Resolve podle volby

**Reuse:** messaging 1:1, training engine, `life_context`

**Akceptace:** Dostanu SMS od Honzy, kliknu "Zatlačím!", Honza přijde s -3 morale.

---

## #7 — Český sezónní kalendář
**Status:** 🟦 TODO
**Pilíř:** V | **Náročnost:** M

**Co:** Reálné vesnické rytmy:
- 30.4. čarodějnice — celý tým auto kocovina
- 15.7.–20.8. žně — zemědělci absence
- 1.5. masopust — slavnost, +reputation
- Posvícení (per vesnice, datum z `villages`) — celá vesnice oslavuje
- Vánoce — winter break + family events

**Implementace:**
- `apps/api/src/season/calendar.ts` — kalendář eventů
- Daily tick check + spuštění odpovídajících handlerů
- Notifikace dopředu ("Za týden je posvícení!")

**Reuse:** season config, daily tick, events, push

**Akceptace:** 30.4. vidím auto event "Čarodějnice — celý tým má kocovinu" a hráči mají -condition.

---

# C. Patriotism & loajalita

## #8 — Rodák vs náplava ⭐
**Status:** 🟦 TODO
**Pilíř:** A+V | **Náročnost:** S

**Co:**
- High `patriotism` (≥70): odmítá nabídky < 2× cena, +10 morale v derby
- Low `patriotism` (≤30): odejde za 1.2× cenu, není motivovaný v derby
- Rodák po 5 letech: badge "Rodák", +1 reputation týmu, neodejde nikdy

**Implementace:**
- Transfer offer logic: zakomponovat patriotism faktor
- Match engine: derby modifier dle průměrného patriotismu sestavy
- Achievement systém: badge "Rodák" po 5 sezónách

**Reuse:** `players.patriotism`, transfer offers, match engine, badges

**Akceptace:** Zkusím prodat hráče s patriotism 85 → odmítne; zkusím s 25 → přijme za nízkou cenu.

---

## #9 — Hymna před derby
**Status:** 🟦 TODO
**Pilíř:** V+D | **Náročnost:** S

**Co:** Před derby trenér klikne "Zazpíváme si hymnu". Hráči s `patriotism > 70` dostanou +10 morale ten zápas. Patriotism < 30 hrají normálně.

**Implementace:**
- Pre-match modal volba (pouze pro derby)
- Match engine boost
- 1× max za zápas

**Reuse:** matchday flow, `players.patriotism`, derby logic (z #13)

**Akceptace:** Před derby kliknu "Hymna", ve statu zápasu vidím že 7 hráčů má morale boost.

---

# D. Rodina, vztahy, drama

## #10 — Bratři na hřišti — chemistry ⭐
**Status:** 🟦 TODO
**Pilíř:** A | **Náročnost:** S

**Co:**
- Když oba bratři v sestavě: +3 passing accuracy mezi nimi
- Když jeden střídá druhého: −5 morale střídaného
- Otec-syn duo na hřišti: 1× za zápas garantovaná spolupráce (event)

**Implementace:**
- Match engine: před simulací načti relationships, aplikuj modifikátory na pair-wise eventy
- Lineup UI: vizuálně zobrazit chemistry boosts (ikonka srdce mezi bratry)

**Reuse:** `relationships`, match engine, lineup UI

**Akceptace:** V match logu vidím "Jirka přihrál Tondovi (bratr) — gól!" s ikonou.

---

## #11 — Manželka napsala do Kabiny
**Status:** 🟦 TODO
**Pilíř:** D+V | **Náročnost:** S

**Co:** Random event 1× za měsíc: "Marcelova manželka napsala: jestli zase dorazí v noci opilý, dělám rozvod." Hráč 2 dny mimo. Low alcohol = bonus, high alcohol = drama eskaluje.

**Implementace:**
- Daily tick: 3% chance na ženatého hráče (nový atribut nebo z life_context)
- Příspěvek do Kabiny od fake účtu "Manželka X"
- 2 dny absence, follow-up event s rozhodnutím trenéra

**Reuse:** Kabina messaging, life_context, events

**Akceptace:** V Kabině se objeví zpráva od manželky, hráč 2 dny chybí.

---

## #12 — Křtiny / svatba / pohřeb
**Status:** 🟦 TODO
**Pilíř:** V+D | **Náročnost:** M

**Co:** Random life event — hráč X má křtiny, celý tým je pozván. Hráči co jdou +morale, kdo nepřijde má −morale s ostatními.

**Implementace:**
- Daily tick: 1% chance pro hráče
- Event s decision UI ("Jdeš na křtiny?")
- Resolve: morale delta + chemistry update

**Reuse:** events, life_context, messaging, relationships

**Akceptace:** Pozvánka v Kabině, kliknu "Jdu", přijdou tam i ostatní co jsou s ním v relationship → +morale.

---

# E. Místní rivalita & turnaje

## #13 — Sousedské derby ⭐
**Status:** 🟦 TODO
**Pilíř:** V+D | **Náročnost:** M

**Co:** Vesnice mají souřadnice (lat/long). Sousední (do X km) automaticky derby. +50% vstupné, special matchday styling, post-match risk rvačky s fanoušky.

**Implementace:**
- Migrace `villages` přidat lat/long
- Pre-compute derby pairs (cron 1× sezónu)
- Match modifier: vstupné, atmosféra, post-match event RNG
- UI: derby badge na rozpisu

**Reuse:** `villages`, match engine, events

**Akceptace:** Sousední vesnice má v rozpisu 🔥 emoji a "Derby!" label, vstupné je vyšší.

---

## #14 — MČR vesnic ⭐
**Status:** 🟦 TODO
**Pilíř:** D+H | **Náročnost:** L

**Co:** 1× ročně otevřený pohár pro všechny týmy, single-elimination. Vítěz: bronzová soška do Hall of Fame + permanent badge.

**Implementace:**
- Nový cup system (možná i obecnější)
- Bracket generator
- UI nová sekce `/dashboard/mistrovstvi`
- Sezónní timing v calendar

**Reuse:** matches, league standings (jako template), Hall of Fame, season

**Akceptace:** V dubnu se spustí MČR, vidím bracket, hraju kola, vítěz dostane badge.

---

## #15 — Memoriál Jardy Šedivého
**Status:** 🟦 TODO
**Pilíř:** V | **Náročnost:** M

**Co:** Annual exhibition turnaj na začátku sezóny, pojmenovaný po legendárním hráči generovaném per vesnice.

**Implementace:**
- Per vesnice generuj "legendu" (jméno, příběh, ročník) — 1× při setupu
- Annual exhibition cup
- Trofej s jménem legendy

**Reuse:** cups (#14), `players` retired/legends, `villages`

**Akceptace:** Začátek sezóny — "Memoriál Pepy Cvrčka" turnaj, 4 týmy z okresu.

---

# F. Matchday rituály

## #16 — Live komentář ve stylu "Tatík Mlejnek" ⭐
**Status:** 🟦 TODO
**Pilíř:** V+H | **Náročnost:** M

**Co:** Místo generického "scored a goal" — zaujatý vesnický komentátor, hláškuje, urazí soudce, fandí domácím. AI-generated per zápas s konzistentním charakterem.

**Implementace:**
- Rozšíření AI reporteru (`apps/api/src/news/ai-reporter.ts`)
- System prompt s charakterem Mlejnka
- Per match event lokální komentář (ne celý zápas najednou)

**Reuse:** match engine events, AI generator, existing commentary

**Akceptace:** V match logu čtu "Tonda dal gól, ten soudce ho měl odpískat, ale ten chlap z Plzně hraje na nás!"

---

## #17 — Catering den zápasu
**Status:** 🟦 TODO
**Pilíř:** V | **Náročnost:** S

**Co:** Před zápasem nakoupíš klobásy/pivo/utopence. Víc lidí přijde, vyšší vstupné. Risk: zkažené klobásy → −5 morale + −20% příští návštěva.

**Implementace:**
- Pre-match modal s nákupem
- Náklady, atmosférický bonus, RNG zkažení
- Resolve po zápase

**Reuse:** monetization, matchday economy, events

**Akceptace:** Před zápasem kliknu "200 klobás + 5 sudů piva" za 3000 Kč, +400 fanoušků.

---

## #18 — Dechovka, soudce, farář
**Status:** 🟦 TODO
**Pilíř:** V | **Náročnost:** S

**Co:** 3 mikro-volby před zápasem:
- Dechovka (najmout = +200 fanoušků, −1500 Kč)
- Soudce ("od nás" = méně karet, "z města" = přísný)
- Pan farář žehná (+1 luck, max 3× sezónu)

**Implementace:**
- Pre-match modal s 3 volbami
- Match engine modifiers
- Counter na faráře (3 / sezónu)

**Reuse:** matchday flow, match engine modifiers

**Akceptace:** Před každým zápasem můžu volit dechovku/soudce/faráře, vliv vidím v zápase.

---

# G. Dopamine micro-loops

## #19 — Mlejnkův týdeník ⭐
**Status:** 🟦 TODO
**Pilíř:** H | **Náročnost:** M

**Co:** Pondělní AI-generovaný newsletter v appce: "Co se stalo v okrese minulý týden." Top scorer, biggest upset, nejdivočejší event, mention pro každý lidský tým.

**Implementace:**
- Cron pondělí 7:00 — generování per liga/region
- AI prompt s charakterem Mlejnka (#16)
- Push notifikace s teaserem
- UI sekce "Týdeník"

**Reuse:** existing news/round-summary, AI reporter, push

**Akceptace:** V pondělí ráno mám notifikaci "Mlejnkův týdeník: Pražská bije zase rekordy!", otevřu, čtu.

---

## #20 — Ranní gossip push (7:30) ⭐
**Status:** 🟦 TODO
**Pilíř:** H | **Náročnost:** S

**Co:** Push notifikace s 1-line gossipem: "Honza se včera v Pralesu pohádal s Tondou. Dnes na tréninku to bude napjaté." Reason to open the app.

**Implementace:**
- Cron 7:30 ráno
- Generování gossip lines z `events` posledních 24h + AI fallback
- Per uživatel (jeho tým events)

**Reuse:** push notifications, AI generator, events, daily tick

**Akceptace:** Ráno mi pípne mobil, vidím catchy větu o mém týmu, otevřu hru.

---

## #21 — Watchlist widget na dashboardu
**Status:** 🟦 TODO
**Pilíř:** H | **Náročnost:** S

**Co:** Mini-widget na `/dashboard` "3 hráči ve vašem hledáčku" + jejich aktuální stav, cena, zájem konkurence.

**Implementace:**
- Komponenta `WatchlistDashboardCard.tsx`
- Reuse existujícího watchlist API
- Click → detail hráče

**Reuse:** existing watchlist API, `apps/web/app/dashboard/page.tsx`

**Akceptace:** Otevřu dashboard, vidím 3 watched hráče s aktuální cenou + "Pražská má taky zájem".

---

## #22 — Týdenní 1:1 chat s hráčem
**Status:** 🟦 TODO
**Pilíř:** H+A | **Náročnost:** M

**Co:** Každý pátek 1 random hráč chce krátký rozhovor. 3 možnosti odpovědi, ovlivňují morale/loyalty. Tamagotchi-like.

**Implementace:**
- Cron pátek odpoledne
- Random pick z hráčů (priorita low morale, blízká expirace smlouvy)
- AI generated prompt + 3 quick-reply
- Resolve dopady

**Reuse:** messaging 1:1, AI dialog, life_context

**Akceptace:** V pátek dostanu SMS od Honzy "Šéfe, můžem si na chvíli?", odpovím, vidím dopad.

---

# H. Multiplayer

## #23 — Aukční den ⭐
**Status:** 🟦 TODO
**Pilíř:** D | **Náročnost:** L

**Co:** 1× měsíčně všichni free agents jdou do live aukce. 60min okno, lidští trenéři přihazují real-time.

**Implementace:**
- Real-time bidding (WebSocket nebo polling)
- Time-boxed event 1× měsíc
- UI live aukce + countdown
- Anti-snipe (poslední 30s prodlužuje)

**Reuse:** transfer market, free agents, multiplayer infra

**Akceptace:** Mám notifikaci "Aukce začíná za 1h", otevřu, dražím proti dvěma lidem.

---

## #24 — Sázení mezi trenéry
**Status:** 🟦 TODO
**Pilíř:** D | **Náročnost:** M

**Co:** Trenér A vyzve B na liga zápas + sází 1000 Kč rozpočtu.

**Implementace:**
- Challenge endpoint
- Pre-match dvou-stranný handshake
- Post-match transfer rozpočtu

**Reuse:** multiplayer challenges, monetization, match results

**Akceptace:** Pošlu výzvu, soupeř přijme, po zápase peníze přejdou.

---

# I. Lore quirks

## #25 — Hřiště quirks ⭐
**Status:** 🟦 TODO
**Pilíř:** V+D | **Náročnost:** M

**Co:** Každá vesnice má 1 unikátní quirk hřiště:
- "Krtek na 16-tce" (random shot deflection)
- "Lampa svítí jen půlka" (večerní zápasy −2 passing)
- "Kráva přejde hřiště" (5 min zpoždění)
- "Stříbrný smrk za bránou" (mladí hráči +morale)

**Implementace:**
- Migrace `villages` přidat `pitchQuirk` (enum)
- Procedural assignment při setup
- Match engine modifiers per quirk
- Frontend zobrazit v stadium info

**Reuse:** `villages.pitchType` rozšířit, match engine

**Akceptace:** Hraju venku v Lhotce, vidím "Lampa svítí jen půlka" → v match logu se to projevuje.

---

# Bonus — další nápady (zatím jen názvy)

Pokud Vlna 1-3 dopadne, tady je další pool nápadů zachycených v brainstormu, ze kterého
lze brát:

- **Hospodská sázka** — sponzor hospoda nabízí "vsadíme 5000 že vyhrajete o 2 góly"
- **Pivní liga** — vedlejší stat kolik piv hráč týdně vypil, žebříček
- **Druhá práce / brigáda** — trenér nabídne hráči práci u sponzora
- **Bývalka v sousední vesnici** — extra motivace v derby
- **Odveta — AI týmy si pamatují** — soupeř po prohře má +odhodlání proti tobě
- **Trénink v lese** — speciální typ, kondice +3 ale risk zranění
- **Sekání trávy = trénink** — hráči-zemědělci sekají trávník zdarma, šetří peníze
- **Brankář-trenér Pepa** — najatý starý důchodce, boost goalkeeping +1 trvalý
- **Tactic presety s názvy** — ukládat sestavy ("Železňák domácí", "Co děláme když hraje Plzeň")
- **Skaut Frantík** — denně tipuje 1 hidden talent
- **Slibovačky** — při kontraktu slíbíš "do play-off", nesplníš = -morale
- **Tombola na zápase** — losy, drobné příjmy, RNG meme
- **Granty od obce** — starosta dá grant, podmínka high-patriotism hráči v sestavě 5×
- **Komentář pod cizí výsledek** — Reddit-like layer pod zápasy soupeřů
- **"Půjčíš mi Honzu na sobotu?"** — P2P krátkodobá půjčka mezi lidskými trenéry
- **Streak achievementy** — "10 zápasů bez kocoviny", "5 zápasů 100% docházka"
- **Daily login obálka** — drobný dárek za otevření hry
- **Žádost ČT o reportáž** — sezónní lore moment, +reputation
- **Slepice/koza/pes maskot** — random vběhne na hřiště, +morale obou týmů
- **Lodní kapitán Ladislav** — AI interim když je trenér 2 týdny offline
- **Pomník hráči** — > 200 zápasů = bronzový pomník na profilu vesnice
- **Pivovarský pohár** — mini turnaj sponzorovaný hospodami
- **Babi v okně** — random event "babi nahlásila Honzu policii za fauly"
- **Sáňky / běžky off-season mini-game** — winter retention
- **"Můj oblíbenec" volba** — bonus jednomu hráči, ostatní žárlí
- **Strejda Karel** — onboarding charakter místo nudného tutoriálu
- **První rok guided cíle** — onboarding objectives s lore
- **Mapa ČR pro výběr vesnice** — interaktivní first-impression
- **Síň slávy hráče** — časová osa kariéry každého hráče
- **Roční fotka týmu** — generated obrázek konec sezóny, sdílitelný
- **Veterán-meeting v hospodě** — bývalí hráči se 1× sezónu sejdou

---

# Co schválně NEDOPORUČUJU

- **Generic "achievement system"** — Hall of Fame stačí. Specifické streaky napojené na lore (ne "vyhraj 10 zápasů") jsou lepší.
- **Větší match engine sofistikace** (víc atributů, víc pozic) — gameplay loop se zlepší víc tím, že přidáme hloubku **mimo** zápas.
- **Naming rights / korporační sponzoring** — neodpovídá vibe hry. Hospoda jako sponzor je lepší.
- **Rebranding na klub místo vesnice** — celá identita, nikdy.

---

# Workflow pro implementaci feature-per-feature

1. Vyber 1 položku, změň status na 🟧 IN PROGRESS
2. Vytvoř branch `feature/idea-NN-short-name`
3. Implementuj podle "Implementace" sekce
4. Otestuj podle "Akceptace" + standardní `/verify` (curl + MCP browser)
5. Push na testing, ověř deploy
6. Status → ✅ DONE
7. Pokud user řekne "nasad na main" → produkce

**Průběžně updatuj tento soubor:**
- Přidávej nové nápady jak vyplynou
- Pohybuj prioritami v "Doporučené pořadí"
- Doplňuj poznámky z implementace pod položku
