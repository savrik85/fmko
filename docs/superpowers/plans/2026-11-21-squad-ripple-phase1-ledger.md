# SDD ledger — plan: /Users/savrik/Projects/fmko/docs/superpowers/plans/2026-11-21-squad-ripple-phase1.md
Spec: docs/superpowers/specs/2026-11-21-squad-ripple-conversations-design.md
Ruling: práce přímo na větvi testing, bez worktree — CLAUDE.md projektu: „Implement on testing branch“, worktree jen pro deploy na main — kdyby to vadilo: commity jsou lokální, nic se nepushuje.
Pre-flight:
- T3→T5/T6/T7/T8/T9: types+store (HearsayItem, HearsayKnowledge, recordHearsay, knowledgeStmts, loadClubHearsay, loadPlayerHearsay) — konzistentní.
- T5→T7/T10: learningEffectStmts, coachTalkedSince (přesunuto do T5 už v plánu) — konzistentní.
- T4→T6: detectMentions(env,{message,recipientName,squadChat,club,excludeIds}) — konzistentní.
- T7→T8: message_state='pending' zapisuje T7, čte T8 — konzistentní.
- T9 HearsayMemoryLine potřebuje jména (subject/recipient/from) — loadPlayerHearsay (T3) vrací jen id → Ruling: T9 si jména dočte samo (jeden dotaz na players podle id) — levné, nemění T3 rozhraní — kdyby špatně: o dotaz víc.
Task 1: Ruling: MenuItem.color v menu-structure ponechán (po odstranění záře ho nic nečte) — mazat ~50 hodnot je šum bez užitku — kdyby vadilo: mrtvé pole v datech.
Task 1: Ruling: vizuální kontrola 375 px Tasku 1 a 2 spojená do jedné session v prohlížeči po Tasku 2 — jedno spuštění localhostu — kdyby špatně: chyba Tasku 1 se pozná o krok později.
Ruling: nový požadavek uživatele uprostřed práce („ať taky reagujou na prodej nebo nákup pokud…“, věta useknutá) → výklad: reakce spoluhráčů s vazbou (rodina, kamarádi, rival) a konkurenta na post při prodeji/nákupu; přidáno do specu (část 3b) a plánu jako Task 11, kalibrace je Task 12 — kdyby výklad špatně: Task 11 se dá vyhodit samostatně.
Task 1: complete (commits 3327d75..97d063a, tests: bash -c 'cd apps/web && npx tsc --noEmit -p .' → (no output))
Task 2: Ruling: hlavička konverzace s manažerem (/manazer/{participantId}) ověřena jen kódem a typy, v testovacím účtu jsem ji v náhledu neotevíral — logika je stejná jako u hráče — kdyby špatně: odkaz vede na špatný profil manažera.
Task 2: complete (commits 837517b..03c1ff2, tests: bash -c 'cd apps/web && npx tsc --noEmit -p .' → (no output))
Task 3: Ruling: společné schéma testů v src/test-support/hearsay-db.ts (createHearsayDb/resetHearsayDb) — použijí ho db testy Tasků 5–11 — kdyby vadilo: jeden soubor navíc. Ruling: store.ts navíc exportuje hearsayItemStmt a newHearsayItem (zápis v cizím batchi pro šíření a přestupy) — rozhraní z plánu zůstává — cena: žádná.
Task 3: complete (commits 03c1ff2..d5c6ab6, tests: bash -c 'cd apps/api && npx vitest run src/hearsay' →    Duration  771ms (transform 58ms, setup 0ms, import 265ms, tests 409ms, environment 0ms))
Task 4: Ruling: do promptu přidáno pravidlo „přání/doufání není rozhodnutí“ — Workers AI bral „doufám, že bude Šimek“ jako decision_for — kdyby špatně: model občas přehlédne skutečné rozhodnutí formulované jako přání.
Task 4: Ruling: neopravuji společný tryParseJson (messaging/ai-player-chat.ts), i když Workers AI u jedné věty připíše za JSON text a zmínka propadne — CLAUDE.md pravidlo 2 (žádný fix bez investigace a schválení), prod jede Gemini JSON mód — kdyby špatně: na testu (Workers AI) občas chybí zmínka; NAHLÁSIT uživateli.
Task 4: complete (commits d5c6ab6..44f30f2, tests: bash -c 'cd apps/api && npx vitest run src/hearsay' →    Duration  688ms (transform 418ms, setup 0ms, import 699ms, tests 326ms, environment 0ms))
Task 5: Ruling: zkrácení na polovinu („trenér to řekl první“) platí i pro nespokojenost (+10 → +5) — je to taky záporný dopad — kdyby špatně: o 5 nižší nespokojenost. Ruling: strop kladného za zády hlídá jen záznam vztahu (source hearsay), decision_for (jen nálada +2) do stropu nespadá — malá hodnota, nedá se farmit (musí se to roznést) — cena: pár bodů nálady navíc.
Task 5: complete (commits 44f30f2..22f4672, tests: bash -c 'cd apps/api && npx vitest run src/hearsay' →    Duration  865ms (transform 674ms, setup 0ms, import 1.18s, tests 739ms, environment 0ms))
Task 6: pre-existing: src/routes/menu-badges.test.ts („aplikace ji obslouží pod /api…“) padá na timeout 5 s i bez mých změn (ověřeno git stash) — nahlásit, neopravovat.
Task 6: pozor: .github/workflows/ci.yml upravuje někdo jiný ve stejném pracovním stromu (není moje, necommitovat).
Task 6: complete (commits 22f4672..9b66b03, tests: bash -c 'cd apps/api && npx vitest run src/hearsay' →    Duration  1.83s (transform 1.60s, setup 0ms, import 2.70s, tests 2.84s, environment 0ms))
Task 7: Ruling: hourKey = „YYYY-MM-DDTHH“ (UTC) je seed i čas pro stáří věci; test vzorkuje různými id věcí uvnitř 7denního okna (původní test s 3000 hodinami vyběhl z okna) — kdyby špatně: nic, jen tvar klíče.
Task 7: Ruling: vazby načítám poddotazem `IN (SELECT id FROM players WHERE team_id IN (…))` místo seznamu id — limit 100 parametrů D1 — cena: žádná.
Task 7: pozor: jiná session commitla b2e0ef74 (ci) do testing mezi Task 6 a 7; rozsah Tasku 7 ho obsahuje, není můj.
Task 7: complete (commits 9b66b03..5395c63, tests: bash -c 'cd apps/api && npx vitest run src/hearsay' →    Duration  1.94s (transform 2.01s, setup 0ms, import 3.95s, tests 4.04s, environment 1ms))
Task 8: Ruling: strop „2 na klub a den“ počítán jako klouzavých 24 h (messaged_at), ne herní den — jednodušší a nezávislé na posunu game_date — kdyby špatně: hranice dne se posune o pár hodin.
Task 8: Ruling: konkrétní věta (kdo, komu, co) jde do popisu scénáře pro první zprávu („CO ZNÁŠ: …“), další odpovědi ji mají z paměti (Task 9) — Task 8 tak nezávisí na Tasku 9 — cena: žádná.
Task 8: Ruling: sdílené české výrazy pro „odkud to ví“ v hearsay/words.ts (viaWord, sourceSentence), použije je i Task 9 — cena: žádná.
Task 8: Ruling: pochvala (heard_praise) otevírá vlákno s casual: true → neodpovězená neurazí; kritika/rozhodnutí se urazí jako dnes — spec 10 — kdyby špatně: trenér, který neodpoví na „díky“, nic neztratí.
Task 8: Ruling: spánek hráče kontrolován playerTimeContext (situace „spi“) bez testu na denní spáče (noční směna) — test pokrývá jen noční hodiny 22–7 — cena: zpráva noční směně v den může počkat déle.
Task 8: complete (commits 5395c63..90509af, tests: bash -c 'cd apps/api && npx vitest run src/hearsay' →    Duration  2.19s (transform 2.12s, setup 0ms, import 4.00s, tests 5.29s, environment 0ms))
Task 9: Ruling: HearsayMemoryLine má navíc pole origin (kapitán/páska mají jinou větu) — cena: žádná.
Task 9: Ruling: kontrola „jméno musí být v squadNames“ přesunuta do loadHearsayMemory jako „hráč je pořád v klubu“ (memoryPromptLines nemá kontext týmu); věc o hráči mimo klub vypadne, adresát/zdroj mimo klub = null — kdyby špatně: hráč z U21 může být zmíněn, i když není v squadNames áčka.
Task 9: Ruling: heardFact přesunuto z messages.ts do words.ts (prompt.ts by jinak tahal casual-messages → hrozil kruh importů s player-memory) — cena: žádná.
Task 9: loadHearsayMemory napsán před testem → doplněn prompt.db.test.ts a ověřen mutací (bez filtru klubu test padá).
Task 9: complete (commits 90509af..8d8785a, tests: bash -c 'cd apps/api && npx vitest run src/hearsay src/messaging' →    Duration  32.36s (transform 10.97s, setup 0ms, import 41.90s, tests 209.04s, environment 7ms))
Task 9 (dodatek): bezpečnostní kontrola commitů našla únik mezi kluby v loadHearsayMemory (po přestupu by hráč prozradil citace bývalého trenéra) — opraveno filtrem h.club_team_id = klub konverzace, test „věc z jiného klubu…“ RED→GREEN. Mazat znalosti při přestupu nedělám: filtr stačí a znalosti klubu A zůstanou pro případný návrat — cena: žádná.
Task 10: Ruling: toldInAdvance je pole LeftOutPlayer (ne nový parametr funkcí) a znamená „trenér mu za posledních 48 h psal 1:1“ (od teď, ne od výkopu) — reactToLeftOut běží hned po zápase — cena: o pár hodin jiné okno.
Task 10: Ruling: první jmenování kapitána (dosud žádný) nic nespouští, jen výměna — nikdo o pásku nepřišel — cena: žádná.
Task 10: Ruling: id věci kapitána obsahuje datum (captain:team:old:new:den), páska na zápas id armband:matchKey:hráč → dvojí uložení nic nezdvojí — cena: žádná.
Task 10: complete (commits 8d8785a..589a044, tests: bash -c 'cd apps/api && npx vitest run src/hearsay src/multiplayer/left-out.test.ts' →    Duration  2.85s (transform 2.94s, setup 0ms, import 6.17s, tests 8.83s, environment 1ms))
Task 11: Ruling: odchod mezi skutečnými kluby se chytá v onPlayerTransferred přes nový volitelný opts.fromTeamId (prodávající ho znají: acceptListingBid, acceptTransferOffer i výměna); bez něj (vrácení z hostování) jen příchod — cena: volání bez fromTeamId nezachytí odchod.
Task 11: Ruling: plánovaný test „removePlayer: reakce vznikne dřív, než se smažou vazby“ nahrazen pořadím volání v kódu (recordTransferReactions přímo před removePlayer v acceptTransferOffer) + DB test recordTransferReactions — testovat celý acceptTransferOffer by znamenalo půl schématu hry — kdyby špatně: pořadí může někdo prohodit bez varování testu.
Task 11: Ruling: hostování nic hlídá onPlayerTransferred (`if (opts.permanent)`), ne samostatný test — cena: viz výš.
Task 11: Ruling: scénář zprávy u přestupu podle znaménka nálady (těší → transfer_reaction_good, casual; štve → transfer_reaction_bad, complaint) — cena: žádná.
Task 11: complete (commits 589a044..a367db7, tests: bash -c 'cd apps/api && npx vitest run src/hearsay src/services src/transfers' →    Duration  17.45s (transform 8.27s, setup 0ms, import 28.01s, tests 116.43s, environment 4ms))
Task 12: Ruling: cíl plánu „2–6 zpráv slyšel jsem týdně na aktivní klub“ se HOURLY_BASE nedá dosáhnout: dojde 82 % věcí, ale trenéři o spoluhráčích píšou ~0,75× týdně → ~0,5 zprávy/týden (+ přestupy a kapitáni, nesimulováno); HOURLY_BASE 0.05 ponechán — kdyby uživatel chtěl víc: zvednout podíl zmínek (širší rozpoznání), ne šíření.
Task 12: ověření jako hráč na localhostu (test DB, Workers AI): SMS Tomáši o bráchovi → věc zapsána; NAŠLA SE CHYBA: „tvůj brácha Lukáš“ připsáno Lukáši Kratochvílovi (3 Lukášové) → oprava: model dostává celé jméno adresáta a vazbu kandidáta na adresáta („brácha adresáta“) + pravidlo pro stejná křestní jména; test RED→GREEN, ověřeno živě (věc o Lukáši Novotném).
Task 12: doručení: výsledek šíření vložen ručně (šíření je po hodinách), admin POST /api/admin/phone-hourly nově pouští i spreadHearsay + deliverHearsayMessages → reálně se rozšířilo ke spoluhráči (teammate) a Lukáš napsal „…To jsem od Tomáše slyšel, že jsi mu to napsal“; na odpověď trenéra „Tomáš mi to řekl“ (paměť funguje).
Task 12: RIZIKO: v kabině se věc nezapsala — detekce na Workers AI trvá ~20 s a kabina souběžně pouští 3–4 další volání modelu; práce na pozadí má ~30 s → na testu se nestihne. Prod Gemini je rychlejší. Návrh: změřit na produ / případně zpracovat v hodinovém běhu. NAHLÁSIT.
Task 12: Ruling: kapitána a přestupy jsem živě neproklikal (mění testovací tým uživatele: kapitán, prodej) — pokryto DB testy — cena: neověřeno v UI.
Task 12: pozn.: na test DB zůstaly 2 chybné věci o Lukáši Kratochvílovi (před opravou) — neuklízím (feedback_test_neuklizet).
Task 12: celá sada API: 196/6281 pádů ve 32 souborech, skoro vše „TypeError: fetch failed“ (Miniflare pod zátěží, reference_ci_miniflare_flake); soubory se skutečnými asercemi (outside-sale-price, scout-work, abandoned) samostatně 33/33 zelené, friendlies 10/10 → nesouvisí se změnami. npm run typecheck zelený.
Task 12: complete (commits a9adc99..2058197, tests: bash -c 'cd apps/api && npx vitest run src/hearsay src/messaging/casual-messages.test.ts src/multiplayer/left-out.test.ts' →    Duration  4.00s (transform 2.41s, setup 0ms, import 6.09s, tests 12.67s, environment 1ms))
Final review (opus): Critical 0, Important 5, Minor 7. Fix pass: I1 proslov po zápase + hearsay dvojí dopad; I2 strop v jednom běhu; I3 vyrobená stížnost s čistým ziskem; I4 „řekl předem“ = jakákoli SMS; I5 oslovení křestním jménem stahuje jmenovce.
Final: minor (deferred): dopad prodeje do virtuálu se zapíše před removePlayer, který může selhat (409/500) a dopad zůstane.
Final: minor (deferred): odkup z hostování (permanent: true) spustí „příchod“ hráče, který už v klubu týdny je (konkurent „Další gólman?“).
Final: minor (deferred): čekající zpráva od hráče, který mezitím odešel na hostování jinam, se doručí (playerInClub bere kmenový klub).
Final: minor (deferred): páska na zápas se zapíše při uložení sestavy, i když ji trenér před výkopem vrátí.
Final: minor (deferred): výpadek modelu přeruší jen smyčku klubu, ostatní kluby v tom běhu zkusí znovu (1 marné volání na klub a hodinu).
Final: minor (deferred): podpis volného hráče se stejným příjmením = vazba bratr a +4/+5 se SMS, propuštění nic → smyčka (strop kladného 1× denně ji tlumí).
Final: minor (deferred): vypršelé řádky squad_hearsay se nemažou, dotaz klubů v hodinovém běhu je full scan; coachTalkedSince julianday(sent_at) obchází index.
Final: fixed I1 proslov po zápase + hearsay dvojí dopad — coach-message.db.test „proslov po zápase: jmenovaným dopad dává proslov…“ RED→GREEN, suite 809/809 (hearsay, messaging, multiplayer, services, transfers).
Final: fixed I2 strop kladného a „to už vím“ v jednom běhu (runState) — spread.db.test „dvě pochvaly dorazí v jednom běhu…“ RED→GREEN, suite 809/809.
Final: fixed I3 vyrobená stížnost s čistým ziskem — closesLikeCoachChat (vztah přes strop rozhovoru od trenéra) + resolutionMoraleDelta (kladná nálada max COACH_CHAT_MAX_MORALE) — coach-chat-cap.test RED→GREEN, suite 809/809.
Final: fixed I4 „řekl předem“ = jakákoli SMS — coachTalkedSince(aboutLineup) s LINEUP_TALK_RE, půlení jen u decision_against a truce; kritika se už nepůlí (spec 3 to říká jen o rozhodnutí) — effects.test + effects.db.test RED→GREEN, suite 809/809.
Final: fixed I5 oslovení křestním jménem stahuje jmenovce — detect.test „oslovení adresáta…“ RED→GREEN, suite 809/809.
Final: Ruling: v okně proslovu po zápase (zpráva ≥ 80 znaků do 12 h po zápase) hearsay nedává jmenovaným dopad vůbec, i když proslov už byl dřív nebo ho model nevyhodnotí — souběh s applyPostSpeech jinak nejde bezpečně rozhodnout — cena: občas chybí malý dopad pochvaly/výtky před kabinou po zápase.
Final: Ruling: kontrolorem odložené body (Declined to judge): jmenovaný v kabině odpovídá už dnes přes addressedPlayers; faktor dne zápasu, limit „na věc a den“, nespokojenost u čekající nabídky a srovnání pásky s minulou sestavou nechávám podle plánu — cena: drobné odchylky od specu, zapsané.
