# Bezpečnostní, logický a technický audit — implementační dokument

- **Datum dokumentu:** 2026-08-04
- **Auditní snapshot:** 2026-08-03 až 2026-08-04
- **Branch:** `testing`
- **Stav:** potvrzené nálezy, čeká na schválení a implementaci
- **Rozsah:** `apps/api`, `apps/web`, `packages`, D1 migrace, Cloudflare konfigurace,
  CI/CD, závislosti a lokální provozní data

---

## 1. Účel dokumentu

Tento dokument převádí potvrzené nálezy z auditu do implementačního backlogu. U každé
skupiny problémů popisuje:

- důkaz a dotčený kód,
- bezpečnostní nebo funkční dopad,
- okamžitou mitigaci, pokud je potřebná,
- cílový návrh implementace,
- databázové a rollout dopady,
- minimální akceptační a regresní testy.

Registr obsahuje 62 samostatně identifikovaných root-cause položek. Některé položky dále
obsahují více konkrétních call-site nebo exploitů, které mají společnou cílovou opravu.

Dokument sám neprovádí žádnou opravu, migraci, mazání dat ani deploy. Produkční databáze
nebyla při auditu měněna.

### Omezení auditu

Audit zahrnoval kompletní statickou kontrolu repozitáře, selektivní read-only ověření
testovacího API a veřejných HTTP hlaviček, produkční build, TypeScript kontrolu a audit
závislostí. Nezahrnoval plný black-box pentest, fuzzing všech payloadů, zatěžovací test
produkce ani kontrolu externích Cloudflare WAF pravidel. Nelze proto tvrdit, že mimo tento
seznam neexistuje další chyba.

### Ověřený stav

- `npm run typecheck` prošel ve všech workspacech.
- `npm run build` prošel.
- Na testovacím API vrátily vybrané citlivé týmové GET endpointy bez bearer tokenu
  HTTP 200 a reálná data.
- Ve webových odpovědích chyběly CSP, `frame-ancestors`/X-Frame-Options a HSTS.
- `npm audit --omit=dev --json` v auditním snapshotu našel 36 produkčních advisories:
  1 critical, 18 high, 14 moderate a 3 low.
- V projektu nebyly nalezeny automatické testy ani `test`/`lint` script použitelný jako
  release gate.
- Zdrojové soubory neobsahovaly nalezený hardcoded privátní klíč nebo skutečný API secret.
- Lokální `backups/` obsahuje neignorované produkční dumpy a produkční dumpy byly potvrzeny
  také v historii Gitu.

---

## 2. Priorita a release rozhodnutí

| Priorita | Význam | Doporučený termín |
|---|---|---|
| **P0** | Přímé převzetí účtu, anonymní změna cizích dat nebo systémová ztráta integrity | okamžitě; blokuje release |
| **P1** | Významný únik dat, ekonomický exploit, race condition nebo slabé obnovení účtu | před dalším veřejným releasem |
| **P2** | Potvrzená funkční chyba nebo provozní riziko s omezenějším dopadem | nejbližší opravná iterace |
| **P3** | Hardening, technický dluh nebo nekritická UX chyba | plánovaný backlog |

### Release gate

Další veřejný release by měl být zablokován minimálně do uzavření následujících tříd:

1. `SEC-001` stored XSS přes avatar.
2. `SEC-002` až `SEC-006` default-allow autorizace a anonymní write endpointy.
3. `SEC-014` produkční dumpy v Gitu a související incident response.
4. `MAT-001`, `MAT-002` a `FIN-001` opakované/částečné zpracování zápasů a peněz.
5. `TRF-001` a `FIN-005` klientem nebo souběhem manipulovatelná ekonomika.

---

## 3. Okamžitý containment před plnou opravou

Tyto kroky jsou záměrně malé a reverzibilní. Mají snížit riziko do doby, než vznikne
kompletní cílová implementace.

1. Dočasně vypnout editaci avataru manažera nebo na veřejných stránkách zobrazovat pouze
   bezpečný placeholder. Nevykreslovat existující nevalidované JSON avatary.
2. Dočasně vyžadovat session pro všechny `/api/teams/:teamId/**` endpointy a veřejné čtení
   vrátit až přes explicitní public router a DTO.
3. Odpojit nebo přímo chránit cash-loan, bus-order a match-backfill write endpointy.
4. Zneplatnit všechny existující session po zavedení `session_version`; incident s dumpy
   znamená, že pouhé odhlášení aktuálního tokenu není dostačující.
5. Přidat `/backups/` do `.gitignore`, přesunout dumpy mimo pracovní kopii do šifrovaného
   úložiště a omezit jejich filesystem oprávnění. Historii Gitu čistit až koordinovaně a
   po explicitním souhlasu, protože vyžaduje přepis historie a force-push.
6. Do vyřešení souběhu provozovat jeden autoritativní match/daily runner a administrativní
   ruční spuštění buď vypnout, nebo serializovat.
7. Přidat alespoň report-only CSP a následně přejít na vynucenou CSP po ověření Next.js
   assetů a inline scriptů.

---

## 4. Cílové implementační principy

Následující principy řeší více nálezů současně a měly by vzniknout před jednotlivými
feature opravami.

### 4.1 Default-deny API

- Všechny routy jsou ve výchozím stavu privátní.
- `OPTIONS` je řešeno samostatně CORS middlewarem; `GET` ani `HEAD` nemají automatickou
  výjimku.
- Veřejné routy jsou v samostatném `publicRouter` a používají explicitní DTO bez
  `SELECT *`.
- Ownership se odvozuje z autentizované session a kontroluje se ve stejném SQL dotazu,
  který objekt čte nebo mění.
- Admin middleware je připojen přímo k admin routeru, ne nepřímo přes pořadí mountů.
- Každá mutace kontroluje počet změněných řádků; nula není úspěch.

### 4.2 Jednotná runtime validace

- Zavést jednu schema knihovnu pro API payloady a query parametry, například Zod nebo
  Valibot.
- Schémata umístit do `packages/shared`, pokud je používá i frontend; server však zůstává
  autoritativní.
- Používat exact/strict objekty, limity délek, enumy, rozsahy čísel a normalizaci barev.
- Klient nikdy neposílá odvozenou cenu, bonus nebo oprávnění. Posílá pouze ID nabídky či
  požadované akce; server načte autoritativní hodnoty.

### 4.3 Atomický command pattern

Každá ekonomická nebo vlastnická operace má tento tvar:

1. validace vstupu,
2. atomický claim nebo podmíněný update,
3. všechny související D1 statements v jednom atomickém `batch`, případně serializace přes
   Durable Object tam, kde je nutné větvení mezi kroky,
4. idempotency key s unikátním indexem,
5. kontrola `changes === 1`/`RETURNING`,
6. doménová událost nebo auditní log až po úspěšném commitu.

Pozor: nulový počet změněných řádků v jednom statementu D1 `batch()` automaticky
nerollbackne další statements. Guard proto musí vyvolat SQL chybu, všechny následné
statements musí být podmíněné stejným claim tokenem, nebo musí operaci serializovat Durable
Object. Kontrola `changes` až po dokončení batch je pro ochranu peněz příliš pozdě.

Pro debit použít například podmínku `UPDATE teams SET budget = budget - ? WHERE id = ? AND
budget >= ? RETURNING budget`. Samostatný read-before-write není ochrana před souběhem.

### 4.4 Lease pro background joby

Zavést perzistentní tabulku job runů se sloupci minimálně:

- `job_type`, `scope_id`, `game_date` nebo `calendar_id`,
- `status` (`pending`, `running`, `completed`, `failed`),
- `lock_owner`, `locked_at`, `lease_until`, `attempt`, `last_error`,
- unikátní klíč pro logický běh.

Claim musí být jediný podmíněný update s `RETURNING`. Retry smí převzít jen expirovaný
lease. Stav `completed` se zapisuje až po všech doménových efektech.

### 4.5 Jeden herní čas

- Všechny herní operace přijímají explicitní `gameDate`/`gameClock`.
- `new Date()` je vyhrazeno pro auditní `created_at`, expiraci reálné session a technické
  lease.
- Trénink, hostování, splátky, finance zápasu, sezona a eventy používají výhradně herní
  datum.

### 4.6 Observabilita

- Strukturované logy obsahují `operationId`, `teamId`, `matchId`, `calendarId`, `jobRunId`
  a `idempotencyKey`, nikdy token nebo heslo.
- Alertovat `failed` job runy, překročené lease, constraint konflikty a rozdíl mezi skóre
  zápasu a dokončenými side effects.
- Finanční ledger musí umožnit rekonstruovat rozpočet a musí mít periodickou kontrolu
  `teams.budget == opening_balance + SUM(transactions.amount)`.

---

## 5. Detailní bezpečnostní nálezy

### SEC-001 — Stored XSS přes avatar manažera

**Priorita:** P0

**Důkaz:** `apps/api/src/routes/teams.ts:120-139,388-410,1128-1232`;
`apps/web/src/components/players/face-avatar.tsx:19-31`;
`apps/web/src/app/invite/[teamId]/client.tsx:71-75`;
`apps/web/src/app/klub/[teamId]/page.tsx:412-423`.

API přijme libovolný objekt s nedostatečnou top-level kontrolou a uloží jej jako JSON.
`facesjs.display` interpoluje hodnoty do SVG a vloží výsledný markup jako HTML. Lokální
proof potvrdil, že útočníkem řízená hodnota vytvoří aktivní SVG element s event handlerem.
Veřejná pozvánka i profil klubu renderují stejný avatar na originu dashboardu. Bearer token
je uložen v `localStorage` (`apps/web/src/context/team-context.tsx:77-78,191-195`) a platí
30 dní (`apps/api/src/auth/session.ts:8`).

**Dopad:** převzetí účtu návštěvníka, akce jeho jménem a čtení privátních dat.

**Návrh implementace:**

1. Zavést serverový `ManagerAvatarSchema` s exact keys, enumy/číselnými indexy a barvami
   omezenými na `^#[0-9A-Fa-f]{6}$`. Neakceptovat raw SVG, URL ani libovolné stringy.
2. Ukládat kanonický objekt vytvořený serverem, nikoli původní request object.
3. Sdílet stejný normalizér mezi create a PATCH cestou; create dnes obchází pozdější
   částečnou validaci.
4. Připravit read-only report nevalidních DB řádků, potom schválený backfill na bezpečný
   default. Backfill musí nejdřív běžet na test DB.
5. Obalit nebo nahradit `facesjs.display`. Bezpečná varianta je renderovat pouze
   kanonická data do DOM/SVG atributů, ne přes `insertAdjacentHTML`.
6. Přidat CSP bez `unsafe-inline` pro skripty; Next.js nonce/hash řešit centrálně.

**Akceptace:**

- Payload corpus s uvozovkou, tagem, `onerror`, URL, CSS a neznámým klíčem vrací 400.
- Historický škodlivý JSON se zobrazí jako placeholder a nevytvoří DOM element mimo
  očekávanou SVG strukturu.
- Veřejná invite a club stránka nemají spustitelný inline handler.
- CSP e2e test prokáže, že inline script je zablokován.

### SEC-002 — Globální bypass ownership pro GET/HEAD

**Priorita:** P0

**Důkaz:** `apps/api/src/auth/middleware.ts:28-54`, `apps/api/src/index.ts:37`.

`requireTeamOwnership` propouští `GET`, `HEAD` a `OPTIONS`. Citlivé routy proto zveřejňují
konverzace, group chat, budget, mzdy, transakce, nabídky, staff a další data. Některé GETy
dokonce označují zprávy jako přečtené nebo zakládají záznamy. Wildcard CORS dovoluje
odpověď číst z libovolného webu.

**Návrh implementace:**

1. Odstranit method bypass z ownership middleware; výjimku ponechat pouze pro CORS
   preflight před auth vrstvou.
2. Rozdělit současné routy na `publicTeamRouter` a `privateTeamRouter`.
3. Public router má pouze read-only endpointy s explicitním veřejným DTO.
4. Přesunout všechny stavové GETy na autentizované POST/PATCH.
5. CORS omezit na přesný allowlist produkčního a testovacího webu; bez credentials, pokud
   nejsou potřeba.
6. Vytvořit route-level autorizační matici jako testovaný seznam, ne implicitní konvenci.

**Akceptace:** pro každý privátní endpoint testovat anonymous = 401, cizí owner = 403,
owner = očekávaný výsledek; `HEAD` musí mít stejnou ochranu jako `GET`. Veřejné DTO nesmí
obsahovat privátní pole.

### SEC-003 — Public DTO vrací interní a skrytá pole

**Priorita:** P1

**Důkaz:** `apps/api/src/routes/teams.ts:912-955`,
`apps/api/migrations/0003_skill_system_v2.sql:10`.

Veřejné endpointy používají `SELECT t.*` a `SELECT * FROM players`. Uniká rozpočet,
`user_id`, morálka, condition, personality a explicitně skrytý talent.

**Návrh implementace:** vytvořit `PublicTeamDto`, `PublicPlayerDto`, `OwnerTeamDto` a
`ScoutedPlayerDto`; SQL select musí explicitně jmenovat sloupce. Scouting viditelnost se
odvozuje z identity volajícího. Přidat snapshot/contract test zakazující privátní keys.

### SEC-004 — Cash loans bez autentizace

**Priorita:** P0

**Důkaz:** `apps/api/src/routes/cash-loans.ts:1-6,51-97,105-163`.

Anonymní uživatel může číst finance týmu a vytvořit cizímu týmu dluh. Router musí používat
stejné auth a ownership primitives jako ostatní privátní týmové commandy. Atomický a
idempotentní návrh půjčky je popsán v `FIN-003`.

**Akceptace:** všechny metody bez tokenu vrací 401; cizí tým 403; paralelních 20 validních
POSTů vytvoří právě jednu půjčku a právě jeden přípis.

### SEC-005 — Anonymní objednání autobusu na účet cizího týmu

**Priorita:** P0

**Důkaz:** `apps/api/src/routes/teams.ts:3272-3401`.

Přidat auth, ownership, runtime schema, autoritativní serverovou cenu a atomický debit s
kontrolou zůstatku. Objednávka musí mít idempotency key a unikátní constraint pro stejné
logické období/službu. Podle současného modelu přidat po preflightu duplicit UNIQUE
`(team_id, match_id, source_village_id)` nad `bus_subsidies`; současný index v
`apps/api/migrations/0090_bus_subsidies.sql` unikátní není. Debit, ledger a insert objednávky
musí být jeden atomický command.

### SEC-006 — Veřejné admin backfill endpointy

**Priorita:** P0

**Důkaz:** `apps/api/src/routes/matches.ts:964-975`, `apps/api/src/index.ts:66-68`.

Middleware připojený k jinému routeru tyto endpointy nechrání. Přesunout všechny admin
routy pod samostatný router s `requireAuth` + `requireAdmin` na router rootu. Pro destruktivní
nebo globální operace přidat audit log, dry-run, operation ID a idempotenci.

### SEC-007 — Object-level IDOR v několika mutacích

**Priorita:** P1

**Důkaz:**

- seasonal event podle samotného ID: `apps/api/src/routes/game.ts:643-797`,
- odmítnutí nabídek cizího listingu: `apps/api/src/routes/game.ts:4294-4299`,
- označení cizího zápasu jako viděného: `apps/api/src/routes/matches.ts:789-809`,
- označení libovolné konverzace jako přečtené:
  `apps/api/src/routes/messaging.ts:308-319`.

**Návrh implementace:** objekt a jeho oprávněného vlastníka ověřovat ve stejném SQL
statementu. Následný side effect nesmí běžet, pokud claim/update změnil nula řádků. Event
navíc svázat s `league_id`, existujícím `season`, `game_week` a aktuálním game clockem.
Případný přechod na FK
`season_id` proto vyžaduje explicitní migraci a backfill.

### SEC-008 — Změna hesla nerevokuje všechny session

**Priorita:** P1

**Důkaz:** `apps/api/src/auth/session.ts:8,29-45`,
`apps/api/src/routes/auth.ts:275-328`.

**Návrh implementace:**

1. Migrace `users.session_version INTEGER NOT NULL DEFAULT 1`.
2. KV session ukládá `{ userId, sessionVersion, issuedAt }`, ne pouze user ID.
3. Zavést jediný `getVerifiedSession(DB, SESSION_KV, token)`, který porovná verzi se
   současnou hodnotou uživatele. Všechny přímé `getSession()` call-site musí přejít přes něj.
4. Change password, admin reset a security incident atomicky zvýší `session_version`.
5. Change password může až po úspěšném commitu vydat nový token pro aktuální zařízení;
   ostatní tokeny okamžitě přestanou platit.
6. Přidat možnost „odhlásit všechna zařízení“ a bezpečnostní audit event.

**Akceptace:** dva současné tokeny fungují; po změně/resetu hesla oba vracejí 401; případný
nově vydaný token funguje. Race mezi requestem a revoke nesmí znovu aktivovat starou verzi.

### SEC-009 — Chybí rate limiting a důsledná validace auth vstupů

**Priorita:** P1

**Důkaz:** `apps/api/src/routes/auth.ts:94-199`,
`apps/api/src/auth/password.ts:6-22`.

Login/registrace jsou bez limitu, registrace provádí nákladný PBKDF2 a payload nemá
runtime typy ani délkové limity. Login pro neexistující účet a chybné heslo používá stejný
status/text, ale liší se pracovní cestou a časováním. Registrace explicitním 409 potvrzuje
existenci adresy. Email se neověřuje, takže lze cizí adresu předem zabrat.

**Návrh implementace:** rate limit per IP i normalizovaný účet přes Cloudflare Rate
Limiting binding nebo konzistentní Durable Object; exponenciální backoff; Turnstile pro
registraci a podezřelé login pokusy; dummy password verify pro neexistující účet; obecná
login odpověď; limity emailu a hesla před hashováním; verzovaný hash formát umožňující
budoucí rehash. Odvozené password bytes porovnávat konstantním porovnáním; legacy
`salt:hash` při úspěšném loginu transparentně přehashovat do verzovaného formátu. Registraci
dokončit až po email verification; pro existující i novou adresu používat odpověď, která
neprozradí stav účtu, a bezpečný resend/recovery flow.

### SEC-010 — Blind SSRF / libovolný outbound POST přes push endpoint

**Priorita:** P1/P2 podle dosažitelnosti runtime sítě

**Důkaz:** `apps/api/src/routes/push.ts:27-47`,
`apps/api/src/community/web-push.ts:177-185,264-285`.

**Návrh implementace:** URL parser s povinným HTTPS, bez credentials, bez vlastního portu,
bez IP literalů a s přesným allowlistem podporovaných push providerů. Subdoménu ověřovat
jako `host === allowed || host.endsWith("." + allowed)`, nikdy prostým
`endsWith(allowed)`. Zakázat redirecty, přidat krátký timeout a rate limit test endpointu.
Případný provider challenge je pouze doplňková kontrola, ne bezpečnostní hranice, protože
útočník může ovládat vlastní endpoint. Base64url klíče dekódovat a
ověřit očekávanou délku P-256 public key a auth secretu. Historické nevalidované subscriptions
před enforcementem inventarizovat podle provider hostname a dát do karantény; celé URL
nelogovat.

### SEC-011 — Push subscription zůstává svázaná s předchozím účtem

**Priorita:** P1

**Důkaz:** `apps/web/src/components/PushNotificationManager.tsx:32-39`,
`apps/web/src/context/team-context.tsx:213-219`,
`apps/api/src/community/web-push.ts:30-40`.

Logout nemaže serverový binding ani browser subscription. Na sdíleném prohlížeči tak může
další účet přijímat obsah předchozího uživatele.

**Návrh implementace:** při logoutu zavolat autentizovaný DELETE subscription, poté
`subscription.unsubscribe()` a smazat lokální flag. Při každém loginu subscription
explicitně rebindnout na současný účet/team. DB musí mít unikátní endpoint a auditovat
změnu vlastníka; `push_subscriptions.endpoint` už UNIQUE je, nový redundantní index není
potřeba. Do opravy neposílat citlivý obsah přímo v push payloadu.

### SEC-012 — Stored CSS injection přes týmové barvy

**Priorita:** P2

**Důkaz:** create payload `apps/api/src/routes/teams.ts:120-139`; veřejné inline styly
`apps/web/src/app/klub/[teamId]/page.tsx:103-159` a invite komponenta.

Create cesta musí používat stejný hex schema normalizér jako všechny pozdější změny.
Frontend dostane již kanonické `#RRGGBB`; při chybě použije konstantní fallback. Testovat
semicolon, `url()`, CSS variable, closing quote a extrémní délku.

### SEC-013 — Chybějící security headers a clickjacking ochrana

**Priorita:** P1/P2

**Důkaz:** `apps/web/next.config.ts:1-7`; live kontrola prod/test odpovědí.

**Návrh implementace:** centrálně nastavit minimálně HSTS pro produkci,
`X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` a CSP s
`frame-ancestors 'none'`. X-Frame-Options `DENY` ponechat jako legacy defense. CSP nejprve
report-only, sesbírat porušení, potom vynutit. API nastavit úzký CORS allowlist.

### SEC-014 — Produkční databázové dumpy ve workspace a historii Gitu

**Priorita:** P0 incident

**Důkaz:** neignorované `backups/prod-*.sql` s oprávněním `0644`; Git commity `da29dab`
(přidání produkčních dumpů) a `300d121` (jejich pozdější smazání). Současné dumpy obsahují
citlivé uživatelské a push údaje a password hash sloupce.

**Dopad:** kdokoliv s přístupem ke klonu nebo historickým objektům mohl data získat. Smazání
v pozdějším commitu data z Git historie neodstranilo.

**Návrh incident response:**

1. Zjistit viditelnost repozitáře, seznam collaboratorů, CI artifactů, mirrorů, forků a
   stažených klonů v době expozice.
2. Předpokládat expozici obsahu historických dumpů; zneplatnit session, rotovat skutečné
   secrets nalezené v dumpech a podle rozsahu zvážit nucený reset hesel.
3. Push endpointy ze starých dumpů považovat za citlivé identifikátory a rebindnout/revokovat.
4. Po záloze a explicitním schválení použít `git filter-repo --path backups --invert-paths`
   na všechny refs/tags, koordinovaně force-pushnout a požádat hosting o purge cache.
5. Všechny klony musí být znovu vytvořeny nebo pečlivě vyčištěny; jinak lze staré objekty
   znovu pushnout.
6. Přidat `/backups/` do `.gitignore`, secret/PII scan v pre-commit a CI a zálohy ukládat
   šifrovaně mimo repo s least-privilege přístupem.

Přepis historie, force-push, mazání lokálních dumpů ani reset uživatelů nesmí proběhnout
bez samostatného schválení a komunikačního plánu.

### SEC-015 — Production a testing sdílejí zapisovatelný R2 bucket

**Priorita:** P2

**Důkaz:** `apps/api/wrangler.toml:25-27,70-72`.

Vytvořit samostatný test bucket, přesunout/copy pouze potřebné test fixtures a nastavit
oddělené bindingy. Test deploy nesmí mít write oprávnění k produkčnímu bucketu. Ověřit
seed, hymny a mascot objekty i cleanup joby.

### SEC-016 — Syrové interní chyby v API odpovědi

**Priorita:** P2

**Důkaz:** například `apps/api/src/routes/teams.ts:905-907`.

Zavést centrální error mapper s veřejným stabilním `code`, bezpečnou zprávou a request ID.
Stack, SQL a interní message pouze do strukturovaného logu. 4xx doménové chyby odlišit od
5xx, ale neposílat DB detaily.

### SEC-017 — Dlouhodobý bearer token v `localStorage` zesiluje dopad XSS

**Priorita:** P2 hardening; při existenci `SEC-001` je dopad prakticky P0

**Důkaz:** `apps/web/src/lib/api.ts:4-19`,
`apps/web/src/context/team-context.tsx:77-78,191-195`,
`apps/api/src/auth/session.ts:8,29-45`.

Samotné uložení tokenu v `localStorage` není v současném Authorization-header modelu
samostatně potvrzený exploit, ale libovolné same-origin XSS přečte token s platností až
30 dní. Cílově přejít na host-only cookie, například `__Host-session`, s `HttpOnly`,
`Secure`, `SameSite=Lax` a `Path=/`. API a web potom používají `credentials: "include"`,
unsafe requesty kontrolují povolený `Origin` a podle výsledného threat modelu CSRF token.
Cookie číst standardním Hono helperem, ne vlastní regex logikou.

Migrace musí být koordinovaná: krátký dual-mode rollout, pevné datum odstranění bearer
fallbacku, revokace starých bearer session a smazání `om_token`. Pouhé přesunutí tokenu do
cookie bez CORS/origin/CSRF ochrany by vytvořilo nový problém.

**Akceptace:** JavaScript credential nepřečte; cross-site write z nepovoleného originu
selže; login, refresh a logout fungují bez `om_token`; logout zneplatní cookie i serverovou
session.

---

## 6. Finance a ekonomická integrita

### FIN-001 — Budget a ledger nejsou atomické ani idempotentní

**Priorita:** P0

**Důkaz:** `apps/api/src/season/finance-processor.ts:95-129`,
`apps/api/migrations/0034_transactions.sql:2-16`.

Budget se změní před insertem transakce a chyba ledger insertu se pouze zaloguje. Retry
může peníze změnit podruhé. Bez idempotency klíče nelze bezpečně poznat, zda operace už
proběhla.

**Návrh implementace:**

- rozšířit `transactions` o `reference_type`, `reference_id`, `operation_key` a vytvořit
  unikátní index na logickou operaci,
- debit/credit a ledger insert provést v jednom D1 batchi,
- chybu nikdy nepřevést na úspěch,
- `recordTransaction` nahradit doménovým `applyFinancialOperation(command)`, který vyžaduje
  idempotency key,
- pro existující typy definovat stabilní klíče, například
  `match:<matchId>:gate`, `loan:<loanId>:installment:<n>`,
  `transfer:<offerId>:buyer-debit`.

**Akceptace:** failure injection mezi každými dvěma statements nezmění budget bez ledgeru;
100 opakování stejného klíče vytvoří jednu transakci a jeden finanční efekt. Reconciliation
query musí mít nulový rozdíl.

### FIN-002 — Nákup neověřuje dostatečný zůstatek atomicky

**Priorita:** P1

**Důkaz:** `apps/api/src/season/finance-processor.ts:104-120`.

Kontroluje se jen, zda byl budget záporný před nákupem. Všechny purchase cesty musí použít
podmíněný debit `budget >= cost` a selhat, pokud `RETURNING` nevrátí řádek. Cena musí být
nezáporné serverové celé číslo v nejmenší měnové jednotce. Povinné poplatky, které podle
doménových pravidel smějí vytvořit dluh, musí používat explicitně jiný command/policy;
nesmějí nechtěně sdílet guard volitelného nákupu.

### FIN-003 — Cash-loan creation a repayment race

**Priorita:** P0/P1

**Důkaz:** `apps/api/src/routes/cash-loans.ts:116-163`,
`apps/api/migrations/0067_cash_loans.sql:5-27`,
`apps/api/src/season/finance-processor.ts:569-607`.

**Návrh implementace:** povinný plný UNIQUE `(team_id, season_id)` podle pravidla jedna
půjčka za sezonu. Pouhý partial index aktivní půjčky by po splacení dovolil druhou půjčku
ve stejné sezoně. Insert půjčky a credit provést v jednom batchi;
splátka claimuje přesný `installment_number`, používá unikátní operation key a v jednom
commitu provede debit, ledger a posun čítače. Pro vazbu na zápas lze použít
`cash_loan_installments` s PRIMARY KEY `(loan_id, match_id)`. Odstranit neurčité `LIMIT 1`.

### FIN-004 — Season rewards mohou být duplicitní nebo částečné

**Priorita:** P1

**Důkaz:** `apps/api/src/season/season-rewards.ts:55-78`.

Reward, reputation a ledger musí být jediný idempotentní command s unikátním klíčem
`season:<seasonId>:team:<teamId>:reward:<type>`. Stav „awarded“ se zapisuje ve stejném
commitu, neodvozuje se pouze z potenciálně chybějící transaction row.

### FIN-005 — Sponzorské parametry a sloty řídí klient/souběh

**Priorita:** P0/P1

**Důkaz:** onboarding `apps/api/src/routes/teams.ts:120-138,209-226`; další podpis
`apps/api/src/routes/game.ts:1872-1926`; sloty `:1885-1898,1940-1947`;
`apps/api/migrations/0063_sponsor_banner_category.sql:24-26`.

**Návrh implementace:** server perzistuje nabídku se všemi částkami, expirací a nonce;
klient posílá pouze offer ID. Accept atomicky claimne `pending -> accepted`. Main/stadium
sloty chránit partial UNIQUE indexem pro active contract. Banner kapacitu modelovat jako
šest explicitních slotů nebo serializovat accept command; samotný `COUNT(*)` check nestačí.
Termination fee počítat z `seasons_total` a zbývajícího období, ne pevně dělit třemi.

### FIN-006 — Paralelní upgrade stadionu poruší level/capacity/budget

**Priorita:** P1

**Důkaz:** `apps/api/src/routes/game.ts:1414-1465`.

Command musí atomicky claimnout očekávaný `current_level`, odečíst serverovou cenu a odvodit
kapacitu z cílového levelu, nikoli přičítat delta bez CAS. Doporučeno neukládat redundantní
kapacitu, pokud ji lze deterministicky vypočítat; jinak přidat DB CHECK/invariant test.

### FIN-007 — Concession quality umožňuje cenovou arbitráž

**Priorita:** P1

**Důkaz:** `apps/api/src/routes/game.ts:7157-7236`,
`apps/api/src/season/finance-processor.ts:358-405`.

Inventory musí být veden per produkt a quality lot, případně změna quality vynuluje/zakáže
prodej starého skladu. Purchase uloží nákupní quality/cost a match sale spotřebuje přesné
loty. Nastavení kvality není retroaktivní transformace zásob.

---

## 7. Zápasy, joby a herní engine

### MAT-001 — Stejný zápas lze paralelně odehrát vícekrát

**Priorita:** P0

**Důkaz:** `apps/api/src/multiplayer/match-runner.ts:50-67,97-106`.

`lineup_locked` je bez časového prahu považován za stuck. Crony v blízkých časech nebo
admin run mohou oba zpracovat stejný zápas.

**Návrh implementace:** stav runu `simulating`, `lock_owner`, `locked_at`, `lease_until`,
`attempt` a uložený `simulation_seed`; atomický CAS claim s `RETURNING`; retry jen po
expiraci lease; unikátní match-run operation ID. Seed nebo již vypočtený výsledek zajistí,
že recovery nezmění skóre. Veškeré statistiky, finance, zranění a kondice musí být
idempotentní podle `match_id` a effect typu.

Současný CHECK `matches.status` hodnoty `simulating`, `effects_pending` ani `failed`
nepovoluje. Preferovaně ukládat processing stav do `job_runs`/`match_runs` a finální
doménový stav zápasu ponechat v `matches`; alternativou je rebuild `matches` se zachováním
všech později přidaných sloupců a indexů. Pouhé zapisování nového stringu bez migrace selže.

### MAT-002 — Zápas/kalendář se označí hotový před dokončením efektů

**Priorita:** P0

**Důkaz:** `apps/api/src/multiplayer/match-runner.ts:638-665,866-889,1042-1044`;
`apps/api/src/index.ts:198-204`; `apps/api/src/routes/game.ts:2676-2680`.

**Návrh implementace:** oddělit výpočet výsledku od commitu. Commit buď atomicky zapíše
výsledek a všechny deterministické effects, nebo job zůstane retryable. Pokud některé
externí efekty nelze dát do transakce, použít outbox s unikátním `(match_id,effect_type)`.
Praktická varianta je `match_effects(match_id, effect_key, subject_id, status, operation_key)`
s unikátním `(match_id,effect_key,subject_id)`.
Calendar může přejít do `simulated` jen pokud všechny jeho matches/effects jsou completed.
Per-match exception nesmí být spolknuta; agregátor vrací failed calendar a konkrétní IDs.

### MAT-003 — Friendly a cup processing nemají claim/idempotenci

**Priorita:** P1

**Důkaz:** `apps/api/src/multiplayer/friendly-runner.ts:13-16,162-314`;
`apps/api/src/cup/cup.ts:663-725,747-765`.

Použít stejnou job/lease infrastrukturu jako ligový runner. Cup bracket musí mít unikátní
souřadnice kola/zápasu a další kolo vzniknout pouze po atomickém claimu předchozího kola.
Reward a finance používají operation keys.

### MAT-004 — Engine zaměňuje natural a lineup position; prázdný MID dává NaN

**Priorita:** P1

**Důkaz:** `apps/api/src/engine/simulation.ts:21-25,67-74,101-105,180-186,230-232,346-360`;
`apps/api/src/engine/lineup-strength.ts:67-95,150-185`.

**Návrh implementace:** vytvořit jeden normalizovaný `LineupPlayer` s `naturalPosition` a
validovanou `assignedPosition`; všechny taktické filtry používají assigned position,
penalty za nepřirozenou pozici je explicitní samostatný faktor. Validovat přesný enum a
požadovanou formaci. Funkce průměru musí mít definovaný fallback, ale validace má prázdné
nutné skupiny odmítnout dřív.

**Akceptace:** property test nikdy nevrátí NaN/Infinity; GK postavený do pole není vybrán
jako brankář; hráč v bráně se počítá jako brankář s out-of-position penalizací.

### MAT-005 — Sestava nemá databázovou unikátnost

**Priorita:** P1

**Důkaz:** `apps/api/src/routes/game.ts:3477-3493`,
`apps/api/migrations/0047_lineups_drop_calendar_fk.sql:3-14`.

Současný `lineups.calendar_id` navíc přetěžuje ID ligového kalendáře a v části friendly
flow přímo ID zápasu. Cílová migrace proto nemá pouze přidat index:

1. přidat nullable `lineups.match_id`,
2. backfillnout friendly řádky, kde legacy hodnota odpovídá `matches.id`,
3. ligové řádky navázat na zápas daného kalendáře, jehož účastníkem je tým,
4. po reportu nejednoznačných řádků přidat FK a UNIQUE `(team_id, match_id)`,
5. save route změnit na jediný upsert a ověřit, že tým je účastníkem otevřeného zápasu,
6. legacy `calendar_id` odstranit až v následné cleanup migraci.

Runner musí načíst právě jednu sestavu a při porušení invarianty selhat nahlas.

### JOB-001 — Daily-tick lock není atomický a blokuje partial recovery

**Priorita:** P1

**Důkaz:** `apps/api/src/season/daily-tick.ts:53-61`.

KV `get` + `put` nahradit D1/Durable Object lease z oddílu 4.4. Stav completed až po všech
krocích. Kroky ticku mají vlastní idempotency keys, aby retry nepřepočítal dokončenou část.
Admin recovery musí zobrazit přesný stav a umožnit retry failed scope, ne globální rerun.

### TIME-001 — Směšování reálného a herního času

**Priorita:** P1/P2

**Důkaz:** training match check `apps/api/src/season/daily-tick.ts:33-50,177-182`;
loan expiry `:1174-1187` a `apps/api/src/routes/game.ts:5347-5352`;
match finance `apps/api/src/multiplayer/match-runner.ts:866-886`.

Zavést `GameClock` předávaný do všech doménových služeb. Přidat testy pro pozitivní i
negativní offset, půlnoc a přechod týdne/sezony. Technické timestampy zůstávají UTC;
doménové datum je explicitní string/date-only typ.

### SEA-001 — Season rollover a schedule generation nejsou resumable

**Priorita:** P1

**Důkaz:** `apps/api/src/season/season-rollover.ts:28-35,56-59,134-139,163-182`.

Novou sezonu neaktivovat před dokončením všech kroků. Použít state machine
`preparing -> schedule_created -> rewards_done -> ready`, perzistentní checkpoint a
idempotentní kroky. Současný CHECK `seasons.status` hodnotu `preparing` nepovoluje; použít
separátní progress tabulku, nebo bezpečný rebuild `seasons`. Finální změna staré sezony
`active -> finished` a nové `preparing -> active` musí být jeden commit, jinak vznikne okno
se dvěma aktivními sezonami. Přidat invariant nejvýše jedné globální active season.
Schedule completeness ověřit očekávaným počtem a unikátními coordinates, nikoli existencí
jediného zápasu.

### SEA-002 — Departures cursor se posune před neatomickými mutacemi

**Priorita:** P1/P2

**Důkaz:** `apps/api/src/season/end-season.ts:199-218`;
`apps/api/src/season/season-departures.ts`.

Tým je označen jako zpracovaný před `processTeamDepartures()` a `captureDepartures()`.
Pád uprostřed zabrání dvojímu stárnutí, ale retry tým přeskočí a trvale ponechá pouze část
odchodů, developmentu nebo recap dat. Komentář v kódu tento partial stav explicitně přijímá.

**Návrh implementace:** buď zpracovat jeden tým v atomickém batchi a cursor posunout až po
commitu, nebo jednotlivé neatomické player effects opatřit deterministickými klíči
`season:<season>:team:<team>:player:<player>:<effect>`. Potom lze retry bezpečně spustit a
cursor zapsat až po úplném dokončení týmu. Přidat fail-injection test po každém playerovi a
mezi departures/capture fází.

---

## 8. Trénink

### TRN-001 — Tréninková konfigurace přijímá libovolné hodnoty

**Priorita:** P1

**Důkaz:** `apps/api/src/routes/game.ts:115-130`,
`apps/api/src/season/training.ts:221-299`.

Schema musí omezit dny na enum, sessions na doménové maximum, intenzitu/focus na známé
hodnoty a odmítnout neznámé keys. Server musí mít i vlastní CPU/work budget guard bez
ohledu na uložená historická data.

### TRN-002 — `sessionsPerWeek` se aplikuje každý vybraný den

**Priorita:** P1/P2

**Důkaz:** `apps/api/src/season/daily-tick.ts:157-175,290-295`;
`apps/api/src/season/training.ts:221-248`.

Nejdřív potvrdit doménovou interpretaci. Doporučený model: `trainingDays` určuje možné dny
a `sessionsPerWeek` je celkový týdenní budget rozdělený deterministicky mezi ně. Alternativně
pole `sessionsByDay`. UI text, API schema a simulace musí sdílet stejnou definici.

### TRN-003 — Více improvements stejného hráče se přepisuje

**Priorita:** P1/P2

**Důkaz:** `apps/api/src/season/training.ts:275-312`,
`apps/api/src/season/daily-tick.ts:361-421`.

Agregovat všechny změny per player in-memory a udělat jeden update z výsledného snapshotu,
případně použít atomické JSON/column increments. Log a DB musí vzniknout ze stejného
agregovaného výsledku. Retry chránit `training:<team>:<gameDate>:<session>` klíčem.

---

## 9. Přestupy, smlouvy a squad

### TRF-001 — Více transfer offers na hráče způsobí double charge

**Priorita:** P0

**Důkaz:** `apps/api/src/routes/game.ts:5247-5259,5363-5381,5403-5446`.

Accept musí jako první atomicky claimnout nabídku i hráče se současným ownerem. Teprve
potom v jednom commandu proběhne buyer debit, seller credit, ownership update, kontrakt a
zamítnutí ostatních nabídek. Každý update kontroluje jeden změněný řádek. Při konfliktu
vrátit 409 bez finančního efektu.

### TRF-002 — AI listing a legacy bid lze zpracovat paralelně vícekrát

**Priorita:** P1

**Důkaz:** AI listing `apps/api/src/routes/game.ts:4413-4514`; legacy bid `:4599-4649`.

Obě cesty převést na stejný transfer command/state machine. Listing/bid se atomicky mění
`pending -> processing -> completed`; clone/create player až po úspěšném claimu; payment
a ownership v jednom batchi; unikátní player origin/listing ID brání klonům. Aktivní
handlery jsou v `apps/api/src/routes/game.ts`; existující `apps/api/src/routes/transfers.ts`
není v `index.ts` mountnutý. Implementace má nejdřív extrahovat společnou doménovou službu
a legacy router následně buď vědomě připojit, nebo odstranit — neopravovat pouze mrtvou cestu.

Současné CHECK constraints `transfer_listings` a `transfer_bids` hodnoty `processing` ani
`completed` nepovolují. Processing claim proto ukládat do samostatné `operation_claims`
tabulky, nebo tabulky rebuildnout se zachováním všech pozdějších sloupců/indexů.

### TRF-003 — Free-agent signing obchází pravidla a může vytvořit ghost contract

**Priorita:** P1

**Důkaz:** listing filtry `apps/api/src/routes/game.ts:3808-3820`; signing
`:3903-3978`; `apps/api/migrations/0032_player_contracts.sql:2-17`.

Server znovu ověří district, expiry, rejection, status, squad limit a wage rozsah přímo v
accept commandu. Wage musí být kladná serverem vypočtená/omezená hodnota. Nejdřív claim FA,
potom atomicky vytvořit player + contract + payment. Po vyčištění orphanů přidat skutečnou
referenční integritu nebo alespoň pravidelný invariant check. Bez dalšího však nepřidávat
obecný FK s blokujícím delete: release/retirement maže player row, zatímco historie kontraktu
může zůstávat. Nejdřív definovat archivní/`ON DELETE` strategii; okamžitý bezpečný invariant
je partial UNIQUE `player_contracts(player_id) WHERE is_active = 1` a kontrola, že aktivní
kontrakt odkazuje na existujícího hráče.

### TRF-004 — Squad limit a expirace nejsou vynucené ve všech cestách

**Priorita:** P1

**Důkaz:** FA check `apps/api/src/routes/game.ts:3922-3924`; player offer
`:5777-5814` a další accept cesty.

Všechny způsoby přidání hráče musí volat jedinou `addPlayerToSquad` doménovou operaci.
Kapacitu nelze bezpečně chránit jen `COUNT(*)`. Command musí být serializovaný per team,
používat explicitní roster slots, nebo trigger pro všechny insert/update ownership cesty.
Samotný `squad_count` s CHECK pouze hlídá rozsah counteru, nikoli jeho shodu s tabulkou
`players`; vždy je nutná reconciliation kontrola. Offer claim kontroluje `expires_at` podle
game clocku. Stav accepted až po dokončení celé operace.

### TRF-005 — Paralelní release klonuje FA; U21 loan destination se ignoruje

**Priorita:** P1/P2

**Důkaz:** `apps/api/src/transfers/remove-player.ts:57-67,93-141`;
loan create/accept `apps/api/src/routes/game.ts:4857-4868,5335-5345`.

Release nejprve atomicky claimne player ownership/status, pak vytvoří právě jeden FA s
unikátním `source_player_id`. Nulový delete/update je konflikt. Loan contract musí mít
explicitní destination squad enum, který accept i expiry respektují; přidat round-trip test
senior i U21 hostování.

### TRF-006 — Counter nabídky zapisuje status zakázaný DB constraintem

**Priorita:** P1/P2

**Důkaz:** `apps/api/src/routes/game.ts:4779` zapisuje
`transfer_bids.status = 'countered'`, ale CHECK v
`apps/api/migrations/0037_transfer_system.sql:75-76` povoluje jen `pending`, `accepted`,
`rejected`, `withdrawn`. Migrace `apps/api/migrations/0079_transfer_bid_counter.sql` přidává
sloupce, ale CHECK neopravuje.

**Návrh implementace:** rebuild `transfer_bids` s rozšířeným CHECK a se zachováním všech
indexů i pozdějších sloupců, případně reprezentovat turn/counter stav odděleně bez změny
statusu. Migrační test musí postavit DB od nuly přes celý řetězec a skutečně provést counter
flow; pouhý typecheck tuto chybu neodhalí.

---

## 10. Onboarding a ostatní herní logika

### ONB-001 — Team onboarding může zanechat partial tým

**Priorita:** P1

**Důkaz:** `apps/api/src/routes/teams.ts:202-226`.

Validovat sponzora a všechny vstupy před prvním write. Celý onboarding provést jako
idempotentní saga/command s `onboarding_status` a operation key. Retry stejného requestu
vrátí existující dokončený tým nebo bezpečně pokračuje z checkpointu. Chyba při insertu
vybraného sponsor contractu se dnes pouze zaloguje přes `.catch()` a onboarding může
pokračovat bez slíbené smlouvy; tuto chybu je nutné propagovat a workflow ponechat retryable.

### ONB-002 — AI takeover nepřesune player contracts

**Priorita:** P1

**Důkaz:** `apps/api/src/routes/teams.ts:429-433,443-480,508-519`.

Přesun musí v jednom batchi změnit team ID ve všech tabulkách inventarizovaných přes FK a
query reference mapu, včetně `player_contracts`. Dočasný tým smazat až po invariant checku,
že na něj nic neodkazuje. Přidat takeover fixture s hráči, kontrakty, managerem a financemi.

### ONB-003 — Jeden uživatel může souběhem vytvořit více týmů

**Priorita:** P1

**Důkaz:** `apps/api/src/routes/teams.ts:165-207,443-458`;
`apps/api/migrations/0001_initial.sql:26-39`.

Přidat partial UNIQUE index pouze pro lidský seniorní tým, například
`teams(user_id) WHERE team_type = 'senior' AND user_id IS NOT NULL AND user_id <> 'ai'`;
obecný index na `user_id` by rozbil U21 tým stejného uživatele i sdílené AI identity. Před
migrací vyřešit duplicity. AI slot claimnout atomickým update se současným AI stavem.
Onboarding operation key brání duplicitnímu retry.

### GME-001 — Seasonal eventy jsou globální/cross-league a jeden effect je no-op

**Priorita:** P1/P2

**Důkaz:** `apps/api/src/routes/game.ts:643-797`;
`apps/api/src/season/seasonal-events.ts:629-631`.

Event instance musí být per league/team podle zamýšlené mechaniky, vázaná na existující
pole `season`, week a game clock. Volbu ukládat do
`seasonal_event_resolutions(event_id, team_id, choice_id, status, effect_reference_id)` s
PRIMARY KEY `(event_id, team_id)`; globální `seasonal_events.status` nemůže reprezentovat
volbu každého týmu. Choice command ověří membership a atomicky claimne unresolved
resolution. Effect typy sdílejí diskriminovanou union/schema; `stamina` vs
`stamina_boost` nesmí být volný string. Exhaustive switch musí při neznámém typu selhat,
ne tiše pokračovat.

### GME-002 — Hospoda cooldown je sdílený celou ligou

**Priorita:** P2

**Důkaz:** `apps/api/src/routes/game.ts:812-823,863-870`.

Pokud má být cooldown per team, klíč/constraint musí obsahovat `team_id`; check a insert
provést atomicky. Jestli je league-wide chování záměr, změnit UI a doménový název — auditní
chování je v rozporu se současným uživatelským očekáváním.

### GME-003 — Youth/recruit endpointy hlásí úspěch bez side effects

**Priorita:** P2

**Důkaz:** `apps/api/src/routes/game.ts:873-912`.

Buď endpointy odstranit/vracet `501 Not Implemented`, nebo implementovat jeden atomický
command: serverová cena, debit, persisted investment/result a případný player creation.
Nikdy nevracet success před commitem.

---

## 11. Frontend a UX chyby

### FE-001 — Invite SSR používá natvrdo produkční API

**Priorita:** P2

**Důkaz:** `apps/web/src/app/invite/[teamId]/page.tsx:4-6,28-51`;
OG route používá jiné env chování.

Vytvořit jediný server-safe config modul validující `NEXT_PUBLIC_API_URL` a
`NEXT_PUBLIC_SITE_URL` při buildu. Žádná route nesmí obsahovat produkční literal. Přidat
build test pro production/testing env a contract test, že page i OG používají stejný origin.

### FE-002 — Pozvánka ztratí team/district kontext při registraci

**Priorita:** P2

**Důkaz:** `apps/web/src/app/dashboard/invite/page.tsx:61-96`;
`apps/web/src/app/invite/[teamId]/client.tsx:86-93`;
`apps/web/src/app/register/page.tsx:46-49`.

Použít serverem podepsaný krátkodobý invite token obsahující inviter/team/district a nonce.
CTA předá pouze token. Register token zachová, API jej ověří a onboarding serverově aplikuje
slibované omezení. Nepoužívat důvěryhodná data pouze z localStorage/query stringu.

### FE-003 — Admin UI považuje HTTP chyby za úspěch

**Priorita:** P1/P2

**Důkaz:** `apps/web/src/app/dashboard/admin/page.tsx:26-59,313-346,431-466,642-687`.

Všechny admin calls sjednotit přes typed `apiFetch`, který kontroluje `res.ok`, parsuje
stabilní error DTO a hází doménovou chybu. `advanceWeek` zastaví na prvním neúspěšném kroku,
ukáže konkrétní den/operaci a nabídne bezpečný retry. UI log „hotovo“ až po potvrzeném 2xx a
validním response body.

### FE-004 — Admin je po loginu dočasně považován za non-admin

**Priorita:** P3

**Důkaz:** login response `apps/api/src/routes/auth.ts:173-199`;
`apps/web/src/context/team-context.tsx:191-195`; admin guard.

Login/`/me` má vracet jednotné session DTO s roles a team. Frontend nesmí hardcodovat
`isAdmin=false`; role uloží pouze do paměťového auth state a ověřuje server při admin callu.

### FE-005 — Po změně hesla zůstává frontend ve falešně přihlášeném stavu

**Priorita:** P2

**Důkaz:** `apps/web/src/app/dashboard/settings/page.tsx:160-170`;
`apps/web/src/context/team-context.tsx:123-155`; backend `auth.ts:299-303`.

Po změně hesla backend buď vrátí novou session podle `SEC-008`, nebo frontend provede
centrální logout a redirect na login s potvrzením. Nelze ponechat zneplatněný token do
dalšího reloadu.

### FE-006 — Rozbité a chybně parametrizované routy

**Priorita:** P3

**Důkaz:**

- village odkaz používá jméno a route neexistuje:
  `apps/web/src/app/dashboard/team/[id]/page.tsx:183-187,254-258`,
- legacy create přesměruje na neexistující `/team/:id`:
  `apps/web/src/app/create/page.tsx:31-49`,
- daily notification vede na `/dashboard/kadr` místo `/dashboard/squad`:
  `apps/api/src/season/daily-tick.ts:966`,
- manager link používá manager PK, route očekává team ID:
  `apps/web/src/app/dashboard/transfers/offer/[id]/components/TeamSide.tsx:53-57`.

Zavést centralizovaný typed route builder a route smoke test nad všemi interními odkazy a
notification URL. Entity identifikátory pojmenovat `teamId`/`managerId`, ne obecné `id`.

### FE-007 — Deklarovaná offline PWA ve skutečnosti nefunguje

**Priorita:** P3

**Důkaz:** `apps/web/public/sw.js:1-13`, `apps/web/public/manifest.json:4-8`.

Service worker nemá fetch handler, precache ani `/offline` route. Buď odstranit tvrzení o
offline podpoře, nebo implementovat versioned precache, navigation fallback, cleanup starých
cache a bezpečnou update strategii. E2E test v offline režimu musí ověřit start URL i reload.

Pokud offline dashboard není produktový požadavek, bezpečnější varianta je ponechat service
worker pouze pro push a necachovat autentizované HTML ani API. Cache se nikdy nesmí přenést
mezi dvěma účty stejného browseru.

### FE-008 — Push settings hlásí úspěch i při chybě API

**Priorita:** P3

**Důkaz:** `apps/web/src/app/dashboard/settings/page.tsx:50-64,114-128`.

Load parsuje i chybovou odpověď a save optimisticky změní lokální stav bez kontroly
`res.ok`. Použít stejný checked `apiFetch` jako v `FE-003`; preferenci potvrdit až po 2xx,
při chybě vrátit původní stav a ukázat stabilní error message. Testovat 401, 409, 500,
nevalidní JSON a reload po úspěchu.

### FE-009 — Poškozená lokální cache může zablokovat inicializaci aplikace

**Priorita:** P3

**Důkaz:** `apps/web/src/context/team-context.tsx:105-115`.

Fallback větev používá nechráněný `JSON.parse` nad `om_team`. Čtení cache obalit bezpečným
parserem a runtime schématem, nevalidní hodnotu odstranit a `isLoading=false` nastavovat ve
`finally`. Malformed cache s offline API nesmí vytvořit nekonečný spinner.

---

## 12. Závislosti, CI a konfigurace

### DEP-001 — Archivovaný Next adapter blokuje bezpečnostní upgrade

**Priorita:** P1

**Důkaz:** `apps/web/package.json:11-23`, `.github/workflows/ci.yml:38-58,77-97`,
`apps/web/open-next.config.ts`, `apps/web/wrangler.toml`.

CI stále buildí přes archivovaný/deprecated `@cloudflare/next-on-pages` a deployuje
`.vercel/output/static`. Jeho peer range blokuje Next verzi s opravami nalezených advisories.
OpenNext už je v projektu, ale CI ho nepoužívá.

**Návrh implementace:**

1. Na samostatné testing větvi převést build/deploy na `@opennextjs/cloudflare` podle
   oficiálního Workers postupu.
2. Odstranit `@cloudflare/next-on-pages` a source-mutating `add-edge-runtime.sh` z CI.
3. Upgradovat Next alespoň na opravenou kompatibilní řadu; auditní snapshot ukazoval
   minimálně 15.5.21 pro relevantní větev.
4. Ověřit SSR, route handlers, OG image routes, service worker, cache headers a R2 bindings
   na testing doméně.
5. Až po funkční paritě odstranit starý Pages deploy job.

Reference: <https://github.com/cloudflare/next-on-pages> a
<https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/>.

### DEP-002 — Přímé a tranzitivní zranitelné závislosti

**Priorita:** P1/P2

**Důkaz:** auditní snapshot: Next 15.4.11, Hono 4.12.8, Drizzle 0.39.3, next-on-pages
1.13.16; critical `tar` převážně v build chainu.

Ne všechny advisories jsou v aktuálně používaných feature cestách dosažitelné, ale přímé
balíky musí být aktualizovány. Postup: nejdřív odstranit adapter blocker, upgradovat Hono nad
zasažený rozsah, posoudit Drizzle advisory proti reálným call-site a přejít alespoň na
opravenou 0.45.x řadu, znovu vytvořit lockfile přes `npm install`, spustit audit a celé smoke
testy. Build-only adaptéry přesunout do devDependencies, pokud je runtime skutečně
nepotřebuje.

### OPS-001 — Tracked production env/config ukazuje na testovací prostředí

**Priorita:** P2

**Důkaz:** `apps/web/.env`, `apps/web/.env.production`, `apps/web/wrangler.toml`; CI env je
přepisuje správně, ruční build však nemusí.

Mít jednoznačné `.env.example`, necommitovat matoucí `.env.production`, validovat domény při
buildu a odmítnout production deploy s `api-test`/`test.prales.fun`. Deploy command má
vypsat cílové origins před potvrzením.

### QA-001 — Chybí automatické testy, lint a audit gate

**Priorita:** P1 systémové riziko

**Důkaz:** root/API/web `package.json` neobsahují test script; CI spouští pouze typecheck
před deploy joby.

**Návrh implementace:**

- API: integrační testy Hono + lokální D1/Cloudflare Workers test pool,
- DB: migrations od prázdné DB i upgrade z produkčně podobného fixture,
- frontend: component testy a Playwright happy/error flow,
- security: route authorization matrix, XSS payload corpus, headers a CORS,
- concurrency: paralelní commandy a failure injection,
- CI gates: format/lint, typecheck, test, build, `npm audit` podle schválené severity policy,
  secret/PII scanner a `git diff --check`.

Deploy jobs smějí následovat až po všech gates. Test job musí být povinný pro `testing` i
`main`.

### QA-002 — Desítky tichých JSON/error fallbacků maskují poškozená data

**Priorita:** P2/P3

**Důkaz:** opakované `catch { return {}; }`, `catch { return []; }` a `.catch(() => null)`
například v `apps/api/src/routes/game.ts`, `apps/api/src/season/daily-tick.ts`,
`apps/api/src/season/end-season.ts`, `apps/web/src/app/invite/[teamId]/opengraph-image.tsx`
a dalších call-site. Je to zároveň v rozporu s projektovým pravidlem proti prázdným/tichým
catchům.

Ne každý fallback je funkční chyba — u volitelného JSON může být bezpečný default správně —
ale bez logu/metryky nelze rozlišit očekávaně chybějící hodnotu od korupce DB či výpadku API.
Zavést `parseJsonWithSchema(value, schema, context, fallback)` se strukturovaným warningem,
bez citlivého raw payloadu, a metrikou podle contextu. Síťové chyby zachovat s `cause` a
request ID. Očekávané user-cancel případy mohou mít explicitní komentovanou výjimku, nikoli
obecně polykat chybu.

---

## 13. Návrh databázových migrací

Konkrétní čísla migrací se určí podle aktuálního posledního souboru až při implementaci.
Každá migrace nejdřív na `prales-db-test`, s read-only preflightem a rollback/restore plánem.

1. `users.session_version NOT NULL DEFAULT 1`.
2. Partial UNIQUE lidského seniorního `teams(user_id)` s vyloučením AI a U21 po vyřešení
   duplicit.
3. Plný UNIQUE cash loans `(team_id, season_id)`.
4. UNIQUE bus order `(team_id, match_id, source_village_id)` po finančním preflightu.
5. `cash_loan_installments` nebo ekvivalentní unikátní evidence provedených splátek.
6. `lineups.match_id`, backfill, FK a UNIQUE `(team_id, match_id)` po deduplikaci.
7. `transactions.operation_key`, reference columns a unikátní index.
8. Match/job lease a status columns nebo nová obecná `job_runs` tabulka.
9. Unikátní match/cup schedule coordinates a effect/outbox keys.
10. Sponsor active slot constraints; případně nová `sponsor_slots` tabulka.
11. Transfer/listing state/version, oprava `transfer_bids` counter CHECK a unique source IDs.
12. Partial UNIQUE jednoho aktivního player contractu; plný FK až po definování historické
    a `ON DELETE` strategie.
13. `seasonal_event_resolutions` s PRIMARY KEY `(event_id, team_id)` a unikátním effect key.
14. Push owner/version/audit metadata; `push_subscriptions.endpoint` již UNIQUE je.

Nové status stringy pro match, transfer nebo season nelze pouze začít zapisovat. Stávající
tabulky mají CHECK constraints. Implementace musí buď používat samostatné
`job_runs`/`operation_claims`, nebo provést rebuild tabulek a zachovat každý sloupec a index
přidaný pozdějšími migracemi. Migrační test musí projít celý řetězec od prázdné DB.

### Povinný preflight každé unique migrace

- vypsat všechny duplicity a orphan řádky,
- určit deterministické pravidlo zachování/merge,
- získat schválení pro cleanup dat,
- ověřit počet řádků před a po,
- po migraci spustit `PRAGMA integrity_check`, invariant queries a aplikační smoke test.

---

## 14. Regresní testovací matice

### Autorizace

Pro každý endpoint testovat role `anonymous`, `authenticated foreign owner`, `owner`,
`admin`. Testovat všechny HTTP metody včetně `HEAD`; public endpointy navíc kontrolovat na
zakázané keys. GET nesmí měnit DB.

### Souběh

Každý finanční, match, loan, sponsor, transfer, lineup a onboarding command spustit alespoň
20× paralelně se stejným logickým idempotency key. Očekávání: právě jeden úspěšný doménový
efekt, konzistentní ledger a žádný orphan.

### Failure injection

Simulovat selhání po každém statementu multi-step operace. Po retry musí stav odpovídat
jednomu kompletnímu provedení nebo nulovému provedení; nikdy partial success.

### XSS a vstupy

Corpus obsahuje HTML/SVG tagy, event handlery, closing quotes, `javascript:`/`data:` URL,
CSS `url()`, extrémní délky, záporná čísla, `NaN`, `Infinity`, neznámé enumy a extra keys.
API vrací konzistentní 400 bez interních detailů.

### Game clock

Testovat kladný/záporný offset, půlnoc, konec týdne, konec sezony, loan expiry a zápas ve
stejný herní den. Doménový výsledek nesmí záviset na wall clocku test runneru.

### Frontend

Playwright minimálně: login/logout mezi dvěma účty, změna hesla, invite registrace, admin
error flow, interní routy, veřejný klub s nevalidním historickým avatarem a offline PWA podle
zvoleného scope.

---

## 15. Implementační roadmap

### Vlna 0 — incident a containment

- `SEC-001`, `SEC-002`, `SEC-004`, `SEC-005`, `SEC-006`, `SEC-014`.
- Dočasné vypnutí rizikových funkcí, default-deny auth, revokace session po zavedení verze,
  plán vyčištění Git historie.

### Vlna 1 — bezpečnostní základ

- Runtime schema vrstva, public/private DTO, centrální error handling.
- Session version, rate limiting, CORS a security headers.
- Push validace a lifecycle.
- Základní autorizační a XSS test suite jako povinný CI gate.

### Vlna 2 — integritní infrastruktura

- `applyFinancialOperation`, operation keys a reconciliation.
- Obecný job lease/outbox pattern.
- DB unique constraints a preflight cleanup.
- Standardní command result s kontrolou affected rows.

### Vlna 3 — zápasy, finance a transfery

- Match/friendly/cup runner state machines.
- Loans, rewards, sponsors, stadium, concessions.
- Transfer/FA/player contract commandy a squad invarianty.

### Vlna 4 — game clock, season, training a onboarding

- `GameClock`, resumable daily tick/rollover.
- Engine positions, lineup invarianty, training aggregation.
- Idempotentní onboarding a AI takeover.

### Vlna 5 — frontend, závislosti a hardening

- Invite, admin error handling, auth state a broken routes.
- OpenNext migrace, dependency upgrades a plný audit gate.
- PWA rozhodnutí, env validace a provozní runbooky.

---

## 16. Definition of Done

Nález lze označit jako uzavřený pouze když:

1. je reprodukce zachycena automatickým testem, který před opravou selhává,
2. root cause je odstraněna na všech nalezených call-site, ne jen jeden symptom,
3. databázový invariant je podle potřeby vynucen constraintem,
4. testy pokrývají happy path, authorization/error path, retry a relevantní souběh,
5. typecheck, test, build, audit policy a `git diff --check` projdou,
6. backend změna je ověřena proti test API a frontend změna přes browser flow,
7. migrace byla nejdřív ověřena na test DB s preflight/postflight počty,
8. logy neobsahují tokeny, hesla ani citlivé payloady,
9. rollout má rollback nebo bezpečný feature flag,
10. produkční deploy proběhne až po samostatném výslovném schválení.

---

## 17. Doporučené rozdělení na implementační epiky

| Epika | Obsah | Blokuje |
|---|---|---|
| `E1 Security containment` | XSS, auth default-deny, anonymní writes, dumps incident | celý release |
| `E2 Identity & boundaries` | session version, schemas, DTO, CORS, headers, rate limits | bezpečné veřejné API |
| `E3 Financial integrity` | ledger, idempotency, conditional debit, reconciliation | finance, loans, sponsors, transfery |
| `E4 Job orchestration` | lease, outbox, retry, calendar completion | zápasy, daily tick, cup, season |
| `E5 Transfer domain` | offer/listing/FA state machines, squad a contracts | bezpečný transfer market |
| `E6 Game correctness` | engine, lineup, training, game clock, season rollover | konzistentní gameplay |
| `E7 Frontend reliability` | invite, admin errors, auth state, routes, PWA | důvěryhodné UX |
| `E8 Platform modernization` | OpenNext, upgrades, CI/test/security gates | dlouhodobý provoz |

Každá epika má být implementována na `testing`, po jednotlivých schválených bug-fix
balíčcích. Žádný bod tohoto dokumentu sám o sobě není souhlas k produkční DB write,
force-pushi historie, deployi nebo merge na `main`.
