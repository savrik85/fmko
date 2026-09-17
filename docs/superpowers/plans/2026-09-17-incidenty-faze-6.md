# Incidenty v klubu, fáze 6 (Hospoda) — implementační plán

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** V hospodě se o incidentech mluví a má to následky. Opilý svědek prozradí, co ví, pachatel se pochlubí a tím se odhalí, cizí chlap nabízí kradené zboží, obviněný si stěžuje kamarádům, odhalený zloděj se popere s rivalem, vůdce fanoušků mu vynadá a drb si odnese host z jiného klubu. Hráč může v opilosti ohlásit čin: vznikne hrozící incident, trenér si s ním může promluvit a po lhůtě se čin buď stane, nebo hráč vystřízliví.

**Architecture:** Čisté jádro `incidents/hospoda.ts` rozhoduje z návštěvníků a kontextu klubu, jaké příhody padnou a co se zapíše. `incidents/hospoda-db.ts` kontext načte, nad stavem klubu vybere ohlášený čin a následky zapíše jednou dávkou (SMS až po zápisu). `season/pub.ts` volá obojí v denní session i v návštěvě s trenérem. `incidents/hrozi.ts` a `incidents/hrozi-db.ts` vyhodnotí hrozící čin v denním kroku; `zapisIncident` umí hrozící záznam přepsat na skutečný incident. Rozhovor s hráčem (tlačítko „Promluvit si" nebo řeči o hospodě v chatu) se zapíše do `resolution_data.promluvil`.

**Tech Stack:** TypeScript, Hono, Cloudflare Workers, D1, Vitest, Next.js 15

**Spec:** `docs/superpowers/specs/2026-09-16-incidenty-design.md` (Části 5b stopa `hospoda`, 9 Hospoda, 9a Hrozící incident, 10a role `drb`, 10b prompt, 17d, 17h vůdce fanoušků v hospodě)

## Global Constraints

- **Branch:** `testing`. Push dělá až controller v posledním tasku. Push na `main` je zakázaný bez výslovného souhlasu uživatele.
- **UI a texty pro hráče česky**, s diakritikou, minimálně `text-sm`, jména `text-base` a klikatelná, ceny nikdy v tlačítkách, mobile-first, do tabulek nepřidávat sloupce, žádné `confirm()`/`alert()` prohlížeče.
- **V textech pro hráče nikdy dlouhá pomlčka „—".** Jméno jen v 1. pádě jako podmět nebo za dvojtečkou, nikdy za předložkou. Každá šablona v `TEXTY` končí tečkou nebo vykřičníkem (hlídá `texty.test.ts`). Pooly vět v hospodském deníku mají 5 variant.
- **Žádný prázdný catch.** Server `logger.warn({ module: "xyz" }, "popis", e)` nebo `logger.error`, klient `console.error("popis:", e)`.
- **Tajné údaje:** hospodský deník (`GET /teams/:id/pub-sessions`) vrací API komukoli. Text příhody nikdy nejmenuje neodhaleného pachatele. Jméno pachatele nese jen stopa (stránka incidentu, jen vlastník) a SMS manažerovi.
- **Hospoda nevytváří škody.** Odhaluje, varuje a dohrává následky. Jediný nový záznam `club_incidents` je hrozící čin (`status = 'hrozi'`), a ten nesmí mít `culprit_revealed = 1`: absence, trénink a zápas (17a–17c) by hráče počítaly jako odhaleného pachatele.
- **Determinismus a idempotence:** každá příhoda má vlastní seed `hospoda|{teamId}|{den}|{typ}|…`. Stopa z hospody má id `{incidentId}-hospoda-{klíč}` a zapisuje se `INSERT OR IGNORE`. Přechody stavů jen hlídaným `UPDATE … WHERE status = …` s kontrolou `meta.changes`.
- **Hospoda nesmí spadnout kvůli incidentům:** `udalostiHospody` nikdy nehází.
- **Názvy sloupců do SQL jen z konstant**, parametry jen `?`.
- **Testy:** `cd apps/api && npx vitest run <cesta>`. **Typecheck:** `cd apps/api && npx tsc --noEmit`, FE `cd apps/web && npx tsc --noEmit`.
- **Commit** po každém tasku: `git add <soubory> && git commit -F - <<'EOF'` se zprávou a posledním řádkem `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`. Nikdy `git add -A`, nikdy `git stash`.
- **Migrace:** žádná. Stav `hrozi`, zdroj stopy `hospoda` a role `drb` jsou v CHECK už od migrací 0204 a 0205.

---

## Odchylky od specu (zapsat do specu v Tasku 9)

| Místo ve specu | Plán | Proč |
|---|---|---|
| 9 `utraci_za_rundy`, `pije_na_sekeru`, odmítnutá záloha v `ohlasuje_cin`, rozvod ×1,5 v docházce | fáze 7 | peněžní incidenty, dluhy, zálohy a rozvod ve fázi 6 neexistují |
| 9 `drby_o_incidentu` | deník jmenuje jen toho, kdo mluvil. Jeho nenalezené stopy (svědek, kamarád, rival) se smažou a nahradí jednou stopou `hospoda` (síla 2, bonus policie jako svědek, `points_to`, jméno pachatele v textu), výslech `prozradil`, SMS od hospodského. Vztahy se neposouvají. | deník vidí kdokoli; jedna informace = jedna stopa, jinak by policie dostala bonus dvakrát; vztahy řeší jen výslech |
| 9 drby „ještě nic neprozradil" | jen hráč, který ještě nebyl vyslechnut (`interrogation IS NULL`) | kdo trenérovi informaci zatajil, by v promptu kryl a v hospodě práskal |
| 9 `nabizi_zbozi` | jen neuzavřená krádež cizího zloděje, s kradeným vybavením, bez inzerátu, nevrácená, jednou za incident, síla 1, bez jména; jeden prodejce za večer | stopy u uzavřených nevznikají (5b) |
| 9 `stezuje_si_na_trenera` | každý, kdo obvinění zapřel (kromě odhaleného pachatele), do 60 dní, jen s kamarádem u stolu, šance 20 %, jedna stížnost za večer | stejné pravidlo jako křivda (17d), jinak by deník prozradil nevinu; spec šanci neuvádí |
| 9 `rvacka_kvuli_kradezi` | jen krádež, odhalený pachatel, neuzavřená nebo uzavřená nejvýš před 14 dny, šance 30 %, jedna za večer; dopady jako `cross_team_fight` | spec šanci ani okno neuvádí |
| 9 `cela_hospoda_resi` | nejzávažnější incident do 3 dnů, o kterém ještě nepadla jiná příhoda, šance 40 %, text bez jmen | spec šanci neuvádí |
| 9 `chlubi_se` | jen neuzavřený incident; u odhaleného pachatele text bez stopy a bez SMS | stopy u uzavřených a odhalených nevznikají (5b) |
| 9 `ohlasuje_cin` | alkohol ≥ 70 platí i pro obviněného; „neprávem obviněný" = každý, kdo zapřel; čin jen z `vloupani_sklad`, `vitrina`, `dodavka_pujcena`, `koleje_trakturek` a `kopnute_dvere` (jen obviněný, váha 3, bez podmínky červené karty) | cizí krádeže a spouštěné incidenty hráč ohlásit nemůže; obviněný jinak prozradí nevinu |
| 9a hrozící incident | `culprit_revealed = 0`, jméno v API jako `ohlasil`; id `inc-{tým}-{kind}-{den}-hrozi-{hráč}`; znalost `pachatel` jen pro něj do lhůty; posel = hráč klubu u stolu s nejvyšším vztahem k trenérovi ≥ 50, jinak hospodský | viz Global Constraints; spec „ochota ≥ 50" u kamaráda bez znalosti nemá z čeho brát |
| 9a rozhovor | `resolution_data.promluvil` = den rozhovoru. Zapíše se při zprávě trenéra hráči, který čin ohlásil, když je téma vlákna ten incident (tlačítko „Promluvit si") nebo zpráva mluví o hospodě či o místě činu | `club_incidents` nemá jiné místo pro stav |
| 9a stane se | hlídaný `UPDATE` ze stavu `hrozi` na skutečný incident (stejné id), znalosti hrozby se smažou, zapíšou se znalosti činu, stopa `hospoda` síly 3 s id `{id}-hospoda-ohlasil`, SMS Kustoda; nový problém se ten den nelosuje | jeden incident = jeden záznam; limit jednoho problému denně |
| 9a vystřízliví | `uzavreny` / `nestalo_se`, znalost `kadr` na 7 dní celému kádru, SMS Kustoda | manažer má vědět, že hrozba skončila |
| 9 trenér poslouchá | jen `createCoachLedSession`; příhody o incidentech z dnešní session v deníku zůstanou a stejné `typ|incident` se nezopakují | náhodný trenér v deníku (`coach_*`) je jen text; opakovaná rvačka by dvakrát zranila |
| 9 drb | host z jiného klubu dostane `drb`, když v session padla jakákoli příhoda o incidentu kromě ohlášení činu | ohlášený čin se nestal |
| 10b prompt | `drb`: fakt, kdy, jméno odhaleného pachatele, bez výsledku; hrozba: vlastní pokyn; `nestalo_se` bez „kdo to byl, se neví" | výsledek cizího klubu by model vztáhl na vlastního trenéra |
| 17h vůdce fanoušků | `vudce_zlodej`: jen odhalený zloděj (krádež) u stolu, stejná čerstvost jako rvačka, přednost před zápasem a hráči; hrdina ve fázi 11 | pozitivní incidenty přijdou ve fázi 11 |
| 9 oslava v kabině ze skutečných návštěvníků | beze změny, hotové od fáze 1 (`hospodaVcera`) | — |
| ověření | admin `POST /api/admin/incidents/hospoda` (posadí hráče a hosty do dnešní hospody, `jiste`, `ohlasi`, `trener`) a `hroziTed` v `POST /api/admin/incidents/vysetrovani` | losy 10–25 % a lhůty 1–3 dny se na testingu čekat nedají |

**Nalezené chyby mimo fázi 6 (neopravovat, nahlásit uživateli):**
- `season/pub.ts: pridejVudceDoHospody` počítá `trenerJeTu` z návštěvníků dřív, než se trenér mezi ně přidá, a návštěva s trenérem (`createCoachLedSession`) vůdce nevolá vůbec. `scenaSTrenerem` se tak nikdy nespustí.
- `routes/villages.ts` (NPC v hospodě) má prázdné `catch { atts = []; }` a `catch { incs = []; }`.

---

## Struktura souborů

| Soubor | Odpovědnost |
|---|---|
| `apps/api/src/incidents/nastaveni.ts` | konstanty hospody a hrozícího činu, `BONUS_POLICIE.hospodaNabizi` |
| `apps/api/src/incidents/texty.ts` | věty deníku, stop, SMS a znalostí |
| `apps/api/src/incidents/katalog.ts` | `CINY_HRACE`, `muzeOhlasit`, `cinHrace` (škoda činu se zadaným pachatelem) |
| `apps/api/src/incidents/stopy-db.ts` | `prikazStopyHospody` (id s klíčem) |
| `apps/api/src/incidents/hospoda.ts` 🆕 | čisté: příhody, zápisy, kandidát na ohlášení, výběr činu, hrozící čin |
| `apps/api/src/incidents/hospoda-db.ts` 🆕 | kontext z DB, `udalostiHospody`, `zapisHospody` |
| `apps/api/src/season/pub.ts` | volání v denní session a v návštěvě s trenérem, efekt `vztah`, `zachovanePribehy`, `dopisDoHospody` |
| `apps/api/src/season/pub-fan-leaders.ts` | `scenaOIncidentu` |
| `apps/api/src/incidents/dopady.ts` | `zapisIncident(…, { zHroziciho })` |
| `apps/api/src/incidents/hrozi.ts` 🆕 | čisté: šance činu, `promluvil` |
| `apps/api/src/incidents/hrozi-db.ts` 🆕 | `vyhodnotHrozici`, `zaznamenejPromluvu` |
| `apps/api/src/incidents/denni-krok.ts` | vyhodnocení hrozících činů před losem |
| `apps/api/src/incidents/tema.ts` | `jeRecOHrozicim` |
| `apps/api/src/incidents/zprava-trenera.ts` | téma a rozhovor o hrozbě |
| `apps/api/src/incidents/akce.ts` | `promluvSi`, společné `otevriRozhovor` |
| `apps/api/src/incidents/znalosti.ts` | prompt: `drb`, hrozba, `nestalo_se` |
| `apps/api/src/routes/incidents.ts` | `ohlasil`, `hrozi`, `akce.promluvit`, POST `promluvit`, admin `hospoda`, `hroziTed` |
| `apps/web/src/app/dashboard/incidenty/{typy.ts,DetailIncidentu.tsx,page.tsx}` | hrozící čin, Promluvit si |
| `apps/web/src/app/dashboard/hospoda/page.tsx` | ikony nových příhod, odkaz na incident |

---
## Task 1: Konstanty, texty, čin ohlášený hráčem a stopa z hospody

**Files:**
- Modify: `apps/api/src/incidents/nastaveni.ts` (na konec; `BONUS_POLICIE` o `hospodaNabizi`)
- Modify: `apps/api/src/incidents/texty.ts` (nové klíče za `policie_bazar`)
- Modify: `apps/api/src/incidents/katalog.ts`
- Modify: `apps/api/src/incidents/stopy-db.ts`
- Test: `apps/api/src/incidents/katalog.test.ts`, `apps/api/src/incidents/stopy-db.test.ts`

**Interfaces:**
- Produces:
  - konstanty z kroku 1
  - `CINY_HRACE`, `type CinHrace`, `muzeOhlasit(kind: CinHrace, s: StavKlubu, obvineny: boolean): boolean`, `cinHrace(kind: CinHrace, s: StavKlubu, hrac: HracKlubu, rng: Rng): NavrhIncidentu | null`
  - `prikazStopyHospody(db, teamId, incidentId, klic: string, stopa: NavrhStopy, gameDate): D1PreparedStatement` s id `{incidentId}-hospoda-{klic}`
  - klíče `TEXTY` z kroku 2

- [ ] **Step 1: Konstanty**

Do `BONUS_POLICIE` za `bazar: 0.3,` přidat:

```ts
  /** Cizí chlap v hospodě nabízel poznatelné kradené zboží (spec 9). */
  hospodaNabizi: 0.15,
```

Na konec `nastaveni.ts`:

```ts
/** Hospoda (spec Část 9). Šance jsou na jednu hospodskou session. */
export const DRBY_ALKOHOL = 60;
export const DRBY_SANCE = 0.25;
/** Trenér, který vzal kluky do hospody, poslouchá: šance na drby se násobí (spec 9, návaznosti). */
export const TRENER_V_HOSPODE_NASOBEK = 2;
export const NABIZI_SANCE = 0.2;
export const STEZUJE_SANCE = 0.2;
export const STEZUJE_VZTAH = -3;
export const STEZUJE_MORALKA = -1;
export const RVACKA_SANCE = 0.3;
export const CELA_HOSPODA_SANCE = 0.4;
export const CELA_HOSPODA_DNI = 3;
export const CELA_HOSPODA_ZAVAZNOST = 2;
export const CHLUBI_ALKOHOL = 60;
export const CHLUBI_SANCE = 0.2;
export const CHLUBI_DNI = 10;
export const CHLUBI_TEMPERAMENT = 65;
export const CHLUBI_TEMPERAMENT_NASOBEK = 1.5;
export const OHLASUJE_ALKOHOL = 70;
export const OHLASUJE_SANCE = 0.1;
/** Odhalený zloděj dráždí (rvačka, vůdce fanoušků) jen chvíli po odhalení nebo uzavření. */
export const CERSTVY_ZLODEJ_DNI = 14;
/** Hráč, který manažerovi napíše o ohlášeném činu, musí mít k trenérovi aspoň takový vztah (spec 9a). */
export const OCHOTA_POSLA = 50;
export const ZNALOST_DRB_DNI = 14;
export const SMS_ROLE_HOSPODSKY = "Hospodský";

/** Hrozící čin z opileckých řečí (spec 9a). Šance v procentech. */
export const HROZI_LHUTA_MIN = 1;
export const HROZI_LHUTA_MAX = 3;
export const HROZI_ZAKLAD = 50;
/** Rozhovor sníží šanci o `HROZI_PROMLUVA + vztah k trenérovi / HROZI_PROMLUVA_VZTAH_DELITEL`. */
export const HROZI_PROMLUVA = 30;
export const HROZI_PROMLUVA_VZTAH_DELITEL = 5;
/** Zabezpečení areálu aspoň 1 u krádeže ze skladu. */
export const HROZI_ZABEZPECENI = 15;
/** Jak dlouho kádr ví, že to byly jen řeči. */
export const HROZI_NESTALO_SE_DNI = 7;
```

- [ ] **Step 2: Texty**

Do `TEXTY` za `policie_bazar` (před `} as const`):

```ts
  hospoda_drby: [
    "{svedek} po třetím pivu vykládal, co ví o průšvihu v klubu. Pak si objednal ještě jedno.",
    "{svedek} se u výčepu rozpovídal o tom, co se v klubu stalo. Hospodský poslouchal pozorně.",
    "{svedek} po pár pivech pustil pusu na špacír a řekl víc, než chtěl.",
    "{svedek} u stolu vykládal, že ví, kdo za tím průšvihem v klubu stojí.",
    "{svedek} to v hospodě nevydržel a řekl nahlas, co ví.",
  ],
  stopa_hospoda_videl: [
    "{svedek} v hospodě po třetím pivu vykládal, že ten večer viděl {misto} hráče: {hrac}.",
    "{svedek} u výčepu povídal, že tu noc {misto} zahlédl hráče: {hrac}.",
    "{svedek} se v hospodě prořekl, že ten večer {misto} potkal hráče: {hrac}.",
  ],
  stopa_hospoda_tusi: [
    "{svedek} v hospodě po pár pivech prořekl, že za tím podle něj stojí hráč: {hrac}.",
    "{svedek} u výčepu vykládal, že ví, kdo to udělal. Jmenoval hráče: {hrac}.",
    "{svedek} se v hospodě nechal slyšet, že to má na svědomí hráč: {hrac}.",
  ],
  hospoda_nabizi: [
    "Nějaký chlap nabízel u výčepu levně vybavení: {vec}. Nikdo ho neznal.",
    "Cizí chlap obcházel stoly a nabízel vybavení za pár stovek: {vec}.",
    "U pultu se objevil neznámý chlap s taškou a nabízel vybavení: {vec}.",
    "Někdo cizí zkoušel v hospodě prodat vybavení: {vec}. Hospodský ho vyprovodil.",
    "Neznámý chlap nabízel po hospodě vybavení, prý levně a bez otázek: {vec}.",
  ],
  stopa_hospoda_nabizi_poznane: [
    "V hospodě nabízel cizí chlap vybavení, které vypadá jako naše: {vec}.",
    "Hospodský viděl cizího chlapa, jak nabízí vybavení podobné našemu: {vec}.",
    "Po hospodě chodil neznámý chlap s vybavením, které hodně připomíná naše: {vec}.",
  ],
  stopa_hospoda_nabizi: [
    "V hospodě nabízel cizí chlap levně vybavení: {vec}. Jestli je naše, se poznat nedá.",
    "Hospodský viděl cizího chlapa, jak nabízí vybavení: {vec}. Poznat se nedá, jestli je naše.",
    "Po hospodě chodil neznámý chlap a prodával vybavení: {vec}. Žádné poznávací znamení.",
  ],
  hospoda_stezuje: [
    "{hrac} si u piva stěžoval, že ho trenér obvinil. Kamarádi u stolu přikyvovali.",
    "{hrac} celý večer vykládal, jak ho trenér podezíral. Kamarádi mu dali za pravdu.",
    "{hrac} se u stolu rozčiloval kvůli obvinění od trenéra. Kamarádi to vzali za své.",
    "{hrac} si postěžoval kamarádům, že ho trenér obvinil, a oni se ho zastali.",
    "{hrac} nemohl přenést přes srdce, že ho trenér obvinil. Kamarádi u stolu se přidali.",
  ],
  hospoda_rvacka: [
    "{rival} vyčetl u stolu krádež a {zlodej} se neudržel. Hospodský je rozdělil koštětem.",
    "{rival} řekl nahlas, že se zloději nepije. {zlodej} po něm skočil a letěly židle.",
    "{zlodej} nesnesl poznámky o krádeži a {rival} dostal ránu. Skončilo to rvačkou před hospodou.",
    "{rival} a {zlodej} se chytli kvůli krádeži v klubu. Hospodský je musel roztrhnout.",
    "{rival} si neodpustil narážku na krádež. {zlodej} vstal od stolu a bylo zle.",
  ],
  hospoda_cela: [
    "Celá hospoda probírala průšvih v klubu: {nazev}.",
    "U každého stolu se mluvilo o jediném: {nazev}.",
    "V hospodě se nemluvilo o ničem jiném než o průšvihu v klubu: {nazev}.",
    "Hospodský celý večer poslouchal jen jednu historku: {nazev}.",
    "Štamgasti rozebírali, co se stalo v klubu: {nazev}.",
  ],
  hospoda_chlubi_zbozi: [
    "Po šestém pivu se {hrac} pochlubil, že za to vybavení dostal pěkné peníze: {vec}.",
    "{hrac} se u výčepu vytahoval, jak snadno přišel k penězům. Mluvil o vybavení: {vec}.",
    "{hrac} v opilosti vykládal, že si ze skladu vzal, co chtěl, a prodal to: {vec}.",
    "Po pár pivech {hrac} vyprávěl, komu prodal vybavení z klubu: {vec}.",
    "{hrac} platil rundu z peněz, o kterých tvrdil, že je dostal za vybavení: {vec}.",
  ],
  hospoda_chlubi: [
    "Po šestém pivu se {hrac} pochlubil, že to byl on: {nazev}.",
    "{hrac} u výčepu vykládal, že ten průšvih v klubu má na svědomí on: {nazev}.",
    "{hrac} se v opilosti vytahoval, jak to celé provedl: {nazev}.",
    "Po pár pivech {hrac} vyprávěl celé hospodě, jak to bylo: {nazev}.",
    "{hrac} se u stolu smál, že na něj nikdo nepřišel: {nazev}.",
  ],
  stopa_hospoda_chlubi: [
    "{hrac} se v hospodě opilý pochlubil, že to byl on.",
    "{hrac} to v hospodě sám vykecal před celým lokálem.",
    "{hrac} se u výčepu vytahoval, že to udělal on.",
  ],
  ohlaseni_vloupani_sklad: [
    "{hrac} u výčepu vykládal, že si ze skladu něco odnese, stejně to tam jen leží.",
    "{hrac} po pár pivech tvrdil, že klíč od skladu má a klub si ani nevšimne, když něco zmizí.",
    "{hrac} u stolu prohlásil, že si ze skladu vezme, co mu klub dluží.",
    "{hrac} se chlubil, že sklad otevře kdykoli a vezme si, co bude chtít.",
    "{hrac} vykládal, že ve skladu se válí věci, které by doma využil líp.",
  ],
  ohlaseni_vitrina: [
    "{hrac} po pár pivech tvrdil, že poháry z vitríny by doma vypadaly líp.",
    "{hrac} u výčepu vykládal, že si z vitríny jeden pohár odnese na památku.",
    "{hrac} prohlásil, že ty poháry ve vitríně stejně nikdo nečistí, tak si je vezme.",
    "{hrac} se u stolu smál, že vitrínu v klubovně otevře i vidličkou.",
    "{hrac} vykládal, že za poháry z vitríny by v bazaru dostal pěkné peníze.",
  ],
  ohlaseni_dodavka_pujcena: [
    "{hrac} se u pultu chlubil, že si klubovou dodávku půjčí na víkend, klíče ví kde jsou.",
    "{hrac} vykládal, že klubovou dodávkou pojede stěhovat švagra, nikdo se ptát nebude.",
    "{hrac} u stolu prohlásil, že si v noci vezme dodávku a projede se.",
    "{hrac} tvrdil, že dodávka stejně celý týden stojí, tak si ji půjčí.",
    "{hrac} po pár pivech sliboval kamarádům odvoz klubovou dodávkou.",
  ],
  ohlaseni_koleje_trakturek: [
    "{hrac} vykládal, že si v noci projede hřiště traktůrkem, ať je aspoň sranda.",
    "{hrac} u výčepu tvrdil, že s traktůrkem udělá na hřišti kolečka.",
    "{hrac} po pár pivech sázel, že traktůrkem objede hřiště rychleji než brankář.",
    "{hrac} prohlásil, že traktůrek nastartuje i bez klíče a hřiště projede.",
    "{hrac} se u stolu smál, že hřiště by chtělo pár pořádných kolejí.",
  ],
  ohlaseni_kopnute_dvere: [
    "{hrac} u stolu hulákal, že trenérovi rozmlátí kabinu, když ho má za zloděje.",
    "{hrac} po pár pivech křičel, že dveře od kabiny zítra vykopne.",
    "{hrac} vykládal, že za to obvinění si trenér kabinu spraví sám.",
    "{hrac} u výčepu bouchal pěstí do stolu, že kabinu rozmlátí na třísky.",
    "{hrac} prohlásil, že kvůli obvinění nechá v kabině pořádnou spoušť.",
  ],
  sms_ohlaseni_kamarad: [
    "Trenére, radši ať to víte. Včera to v hospodě padlo nahlas.",
    "Trenére, nechci práskat, ale tohle byste měl vědět.",
    "Trenére, v hospodě jsem slyšel řeči, které se mi nelíbí.",
  ],
  sms_ohlaseni_hospodsky: [
    "Pane trenére, u výčepu jsem slyšel řeči, které byste měl znát.",
    "Pane trenére, tohle se u mě v hospodě říkalo nahlas.",
    "Pane trenére, jeden z vašich u pultu vykládal nepěkné věci.",
  ],
  znalost_hrozi: [
    "V hospodě jsi opilý vykládal, že provedeš tohle: {nazev}.",
  ],
  hrozi_splnil: [
    "{hrac} v hospodě nekecal, co vykládal, to udělal.",
    "{hrac} to v hospodě ohlásil a slovo dodržel.",
    "Řeči z hospody se naplnily, {hrac} to opravdu udělal.",
  ],
  hrozi_nestalo_se: [
    "{hrac} v hospodě vykládal, že provede průšvih, ale nic z toho nebylo.",
    "{hrac} to v hospodě přehnal s řečmi, ale nakonec nic neudělal.",
    "{hrac} v hospodě kecal, ale vystřízlivěl a nic se nestalo.",
  ],
  stopa_hospoda_ohlasil: [
    "{hrac} to předem ohlásil v hospodě.",
    "{hrac} to den předem vykládal v hospodě.",
    "{hrac} se tím v hospodě chlubil ještě předtím, než to udělal.",
  ],
  znalost_drb: [
    "V hospodě jsi slyšel drb, klub {klub} má průšvih: {nazev}.",
  ],
```

- [ ] **Step 3: Failing testy katalogu a stopy**

Do `katalog.test.ts`: import rozšířit na `import { CINY_HRACE, cinHrace, KATALOG, KATALOG_PODLE_KIND, muzeOhlasit } from "./katalog";` a na konec souboru:

```ts
describe("čin ohlášený v hospodě (spec 9a)", () => {
  const FRANTA = hrac({ id: "f", jmeno: "Franta Novák" });

  it("ohlásit jde jen čin, na který klub má", () => {
    const prazdny = stavKlubu();
    for (const kind of CINY_HRACE) expect(muzeOhlasit(kind, prazdny, true), kind).toBe(false);
    const vsechno = stavKlubu({
      vybaveni: { balls: 1, trophy_case: 2, team_van: 1, mower: 2 }, stadion: { changing_rooms: 1, pitch_condition: 70 },
    });
    for (const kind of CINY_HRACE) expect(muzeOhlasit(kind, vsechno, true), kind).toBe(true);
    expect(muzeOhlasit("vitrina", stavKlubu({ vybaveni: { trophy_case: 1 } }), false)).toBe(false);
    expect(muzeOhlasit("koleje_trakturek", stavKlubu({ vybaveni: { mower: 1 } }), false)).toBe(false);
  });

  it("kopnout do dveří ohlásí jen obviněný, červená karta ani domácí zápas potřeba není", () => {
    const s = stavKlubu({ stadion: { changing_rooms: 1, pitch_condition: 70 } });
    expect(muzeOhlasit("kopnute_dvere", s, false)).toBe(false);
    expect(muzeOhlasit("kopnute_dvere", s, true)).toBe(true);
    const n = cinHrace("kopnute_dvere", s, FRANTA, createRng(1));
    expect(n).toMatchObject({ kind: "kopnute_dvere", culpritPlayerId: "f", culpritRevealed: true });
    expect(n?.text).toContain("Franta Novák");
  });

  it("čin má pachatele, kterého ohlásil, a je hned známý", () => {
    const s = stavKlubu({ vybaveni: { jerseys: 2, jerseys_condition: 70 } });
    proSeedy((rng) => {
      const n = cinHrace("vloupani_sklad", s, FRANTA, rng);
      expect(n).toMatchObject({ kind: "vloupani_sklad", culpritType: "hrac", culpritPlayerId: "f", culpritRevealed: true });
      expect(n?.ztraty).toEqual([{ typ: "vybaveni", kategorie: "jerseys", uroven: 2, stav: 70, urovniDolu: 2 }]);
    }, 20);
  });

  it("v den činu platí podmínky znovu: bez věci nebo před zápasem se nestane", () => {
    expect(cinHrace("vitrina", stavKlubu({ vybaveni: { trophy_case: 1 } }), FRANTA, createRng(1))).toBeNull();
    expect(cinHrace("dodavka_pujcena", stavKlubu({ vybaveni: { team_van: 1, team_van_condition: 80 }, zapasDnesNeboZitra: true }), FRANTA, createRng(1))).toBeNull();
    expect(cinHrace("koleje_trakturek", stavKlubu({ vybaveni: { mower: 1 } }), FRANTA, createRng(1))).toBeNull();
  });
});
```

Do `stopy-db.test.ts`: import rozšířit o `prikazStopyHospody` a do `describe("zápis stop")`:

```ts
  it("stopa z hospody má místo pořadí klíč příhody", () => {
    const p = prikazStopyHospody(jakoD1(new FalesnaD1()), "tym-a", "inc-1", "drb-s", { ...SVEDEK, zdroj: "hospoda", nalezena: true }, DNES);
    expect((p as unknown as { params: unknown[] }).params).toEqual(
      ["inc-1-hospoda-drb-s", "inc-1", "tym-a", "hospoda", "p", null, "a", 2, 0.1, "Adam viděl Pepu.", 1, DNES],
    );
  });
```

- [ ] **Step 4: Spustit, musí selhat**

Run: `cd apps/api && npx vitest run src/incidents/katalog.test.ts src/incidents/stopy-db.test.ts`
Expected: FAIL, `cinHrace`, `muzeOhlasit`, `CINY_HRACE` a `prikazStopyHospody` neexistují.

- [ ] **Step 5: `katalog.ts`**

Pod `type Pokus = …` přidat `type Kdo = { typ: "hrac"; hrac: HracKlubu } | { typ: "cizi" };` a `function pachatel(p: Pokus & { typ: "hrac" | "cizi" })` změnit na `function pachatel(p: Kdo)`.

Nad `export const KATALOG` vložit stavitele škody. Pořadí volání `rng` musí zůstat stejné jako v původních `vytvor`, na tom stojí existující testy:

```ts
function skladNavrh(s: StavKlubu, rng: Rng, kdo: Kdo): NavrhIncidentu | null {
  const vlastnene = PRENOSNE.filter((k) => uroven(s, k) >= 1);
  if (vlastnene.length === 0) return null;
  // Zloděj bere to, co za něco stojí.
  const kategorie = rng.weighted(Object.fromEntries(vlastnene.map((k) => [k, cumulativeInvestment(k, uroven(s, k))])));
  const lv = uroven(s, kategorie);
  return {
    kind: "vloupani_sklad", category: "kradez", status: "otevreny",
    severity: zavaznostPodleHodnoty(kategorie, lv), ...pachatel(kdo),
    ztraty: [{ typ: "vybaveni", kategorie, uroven: lv, stav: stavVeci(s, kategorie), urovniDolu: lv }],
    text: text(rng, kdo.typ === "hrac" ? "vloupani_zevnitr" : "vloupani_zvenku", { vec: CATEGORY_LABELS[kategorie] ?? kategorie }),
  };
}

function vitrinaNavrh(s: StavKlubu, rng: Rng, kdo: Kdo): NavrhIncidentu | null {
  const lv = uroven(s, "trophy_case");
  if (lv < 2) return null;
  // Síň slávy se neukradne, poháry ano: vitrína přijde jen o jednu úroveň.
  return {
    kind: "vitrina", category: "kradez", status: "otevreny", severity: 2, ...pachatel(kdo),
    ztraty: [{ typ: "vybaveni", kategorie: "trophy_case", uroven: lv, stav: stavVeci(s, "trophy_case"), urovniDolu: 1 }],
    text: text(rng, "vitrina"),
  };
}

function dodavkaPujcenaNavrh(s: StavKlubu, rng: Rng, hrac: HracKlubu): NavrhIncidentu | null {
  if (s.zapasDnesNeboZitra || uroven(s, "team_van") < 1) return null;
  const pred = stavVeci(s, "team_van");
  const po = Math.max(5, pred - rng.int(30, 60));
  if (po >= pred) return null;
  return {
    kind: "dodavka_pujcena", category: "kradez", status: "otevreny", severity: 2,
    culpritType: "hrac", culpritPlayerId: hrac.id, culpritRevealed: false,
    ztraty: [{ typ: "vybaveni_stav", kategorie: "team_van", stavPred: pred, stavPo: po }],
    text: text(rng, "dodavka_pujcena"),
  };
}

function kolejeNavrh(s: StavKlubu, rng: Rng, hrac: HracKlubu): NavrhIncidentu | null {
  if (uroven(s, "mower") < 2) return null;
  const pred = zarizeni(s, "pitch_condition") || 50;
  const po = Math.max(5, pred - rng.int(8, 15));
  if (po >= pred) return null;
  return {
    kind: "koleje_trakturek", category: "poskozeni", status: "otevreny", severity: 1,
    culpritType: "hrac", culpritPlayerId: hrac.id, culpritRevealed: false,
    ztraty: [{ typ: "travnik", pred, po }],
    text: text(rng, "koleje_trakturek"),
  };
}

function kopnuteDvereNavrh(s: StavKlubu, rng: Rng, hrac: HracKlubu): NavrhIncidentu | null {
  if (zarizeni(s, "changing_rooms") < 1) return null;
  // Všichni viděli, kdo to byl: pachatel je známý hned.
  return {
    kind: "kopnute_dvere", category: "poskozeni", status: "otevreny", severity: 2,
    culpritType: "hrac", culpritPlayerId: hrac.id, culpritRevealed: true,
    ztraty: [{ typ: "stadion", zarizeni: "changing_rooms", urovni: 1 }],
    text: text(rng, "kopnute_dvere", { hrac: hrac.jmeno, zarizeni: FACILITY_LABELS.changing_rooms }),
  };
}
```

V `KATALOG` nahradit těla `vytvor` pěti typů:

```ts
    // vloupani_sklad
    vytvor: (s, rng) => {
      if (!PRENOSNE.some((k) => uroven(s, k) >= 1)) return null;
      const kdo = pokusOKradez(s, rng, 2);
      if (!kdo) return null;
      if (kdo.typ === "alarm") return alarmNavrh(rng);
      return skladNavrh(s, rng, kdo);
    },
    // vitrina
    vytvor: (s, rng) => {
      if (uroven(s, "trophy_case") < 2) return null;
      const kdo = pokusOKradez(s, rng, 2);
      if (!kdo) return null;
      if (kdo.typ === "alarm") return alarmNavrh(rng);
      return vitrinaNavrh(s, rng, kdo);
    },
    // dodavka_pujcena
    vytvor: (s, rng) => {
      if (s.zapasDnesNeboZitra || uroven(s, "team_van") < 1) return null;
      const hrac = vyberHrace(s.kadr, rng);
      return hrac ? dodavkaPujcenaNavrh(s, rng, hrac) : null;
    },
    // koleje_trakturek
    vytvor: (s, rng) => {
      if (uroven(s, "mower") < 2) return null;
      const hrac = vyberHrace(s.kadr, rng);
      return hrac ? kolejeNavrh(s, rng, hrac) : null;
    },
    // kopnute_dvere
    vytvor: (s, rng) => {
      const h = vzteklounSCervenou(s);
      if (!h || !s.vcera?.doma) return null;
      return kopnuteDvereNavrh(s, rng, h);
    },
```

(Komentáře `// vloupani_sklad` atd. do kódu nepsat, jen označují, které `vytvor` se mění.)

Na konec `katalog.ts`:

```ts
/** Co může hráč z kádru v opilosti ohlásit, že udělá (spec 9a). Krádeže zvenku a spouštěné incidenty ne. */
export const CINY_HRACE = ["vloupani_sklad", "vitrina", "dodavka_pujcena", "koleje_trakturek", "kopnute_dvere"] as const;
export type CinHrace = (typeof CINY_HRACE)[number];

/**
 * Klub má na čin podmínky. Zápas dnes nebo zítra se v den ohlášení neřeší, platí až v den činu
 * (`cinHrace`). Kopnuté dveře ohlásí jen obviněný a bez červené karty (spec 9a).
 */
export function muzeOhlasit(kind: CinHrace, s: StavKlubu, obvineny: boolean): boolean {
  switch (kind) {
    case "vloupani_sklad": return PRENOSNE.some((k) => uroven(s, k) >= 1);
    case "vitrina": return uroven(s, "trophy_case") >= 2;
    case "dodavka_pujcena": return uroven(s, "team_van") >= 1;
    case "koleje_trakturek": return uroven(s, "mower") >= 2;
    case "kopnute_dvere": return obvineny && zarizeni(s, "changing_rooms") >= 1;
  }
}

/** Škoda činu, který hráč ohlásil. `null`, když klub v den činu podmínky nesplňuje. Ohlásil to sám, je známý hned. */
export function cinHrace(kind: CinHrace, s: StavKlubu, hrac: HracKlubu, rng: Rng): NavrhIncidentu | null {
  const navrh = kind === "vloupani_sklad" ? skladNavrh(s, rng, { typ: "hrac", hrac })
    : kind === "vitrina" ? vitrinaNavrh(s, rng, { typ: "hrac", hrac })
    : kind === "dodavka_pujcena" ? dodavkaPujcenaNavrh(s, rng, hrac)
    : kind === "koleje_trakturek" ? kolejeNavrh(s, rng, hrac)
    : kopnuteDvereNavrh(s, rng, hrac);
  return navrh ? { ...navrh, culpritRevealed: true } : null;
}
```

- [ ] **Step 6: `stopy-db.ts`**

Nahradit `prikazyStop` a přidat `prikazStopyHospody`:

```ts
const VLOZ_STOPU = `INSERT OR IGNORE INTO club_incident_clues
   (id, incident_id, team_id, source, points_to_player_id, suspects, holder_player_id, strength, police_bonus, text, found, found_on)
 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

function prikazStopy(db: D1Database, id: string, teamId: string, incidentId: string, s: NavrhStopy, gameDate: string): D1PreparedStatement {
  return db.prepare(VLOZ_STOPU).bind(
    id, incidentId, teamId, s.zdroj, s.ukazujeNa, s.podezreli ? JSON.stringify(s.podezreli) : null, s.drzitel,
    s.sila, s.bonusPolicie, s.text, s.nalezena ? 1 : 0, s.nalezena ? gameDate : null,
  );
}

/**
 * Příkazy pro `db.batch`. Id `{incidentId}-{zdroj}-{n}`, `n` od `prvniPoradi` v rámci zdroje.
 * `INSERT OR IGNORE`: opakované zpracování dne stopy nezdvojí. Stopa téhož zdroje zapisovaná
 * později (druhá stopa z bazaru) potřebuje `prvniPoradi` 2, jinak by ji zápis tiše zahodil.
 */
export function prikazyStop(
  db: D1Database, teamId: string, incidentId: string, stopy: readonly NavrhStopy[], gameDate: string, prvniPoradi = 1,
): D1PreparedStatement[] {
  const poradi: Record<string, number> = {};
  return stopy.map((s) => {
    poradi[s.zdroj] = (poradi[s.zdroj] ?? prvniPoradi - 1) + 1;
    return prikazStopy(db, `${incidentId}-${s.zdroj}-${poradi[s.zdroj]}`, teamId, incidentId, s, gameDate);
  });
}

/** Stopa z hospody: místo pořadí klíč příhody (`drb-{hráč}`, `nabizi`, `chlubi`, `ohlasil`), stejná příhoda se nezapíše dvakrát. */
export function prikazStopyHospody(
  db: D1Database, teamId: string, incidentId: string, klic: string, stopa: NavrhStopy, gameDate: string,
): D1PreparedStatement {
  return prikazStopy(db, `${incidentId}-hospoda-${klic}`, teamId, incidentId, stopa, gameDate);
}
```

- [ ] **Step 7: Testy a typecheck**

Run: `cd apps/api && npx vitest run src/incidents && npx tsc --noEmit`
Expected: PASS, žádná chyba typů (existující testy katalogu, dopadů a stop beze změny).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/incidents/nastaveni.ts apps/api/src/incidents/texty.ts apps/api/src/incidents/katalog.ts apps/api/src/incidents/katalog.test.ts apps/api/src/incidents/stopy-db.ts apps/api/src/incidents/stopy-db.test.ts
git commit -F - <<'EOF'
feat(incidenty): cin ohlaseny hracem, texty hospody a stopa z hospody

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 2: Čisté jádro hospody

**Files:**
- Create: `apps/api/src/incidents/hospoda.ts`
- Test: `apps/api/src/incidents/hospoda.test.ts`

**Interfaces:**
- Consumes (Task 1): konstanty hospody a hrozby, `BONUS_POLICIE.hospodaNabizi`, `CINY_HRACE`, `CinHrace`, `muzeOhlasit`, klíče `TEXTY`. Existující: `nazevIncidentu` (katalog), `jePoznatelne`, `jeProdejnaKradez`, `kradeneZbozi` (bazar), `pozdejsi` (incident-db), `vahaPachatele` (pachatel), `MISTO_INCIDENTU`, `MISTO_TEXT` (stopy), `NovaZnalost`, `RoleSvedka`, `VysledekVyslechu` (znalosti), `Obvineni`, `NavrhStopy`, `HracKlubu`, `StavKlubu` (typy).
- Produces (typy a funkce přesně takto):

```ts
export type TypPribehu = "drby_o_incidentu" | "nabizi_zbozi" | "stezuje_si_na_trenera" | "rvacka_kvuli_kradezi" | "cela_hospoda_resi" | "chlubi_se" | "ohlasuje_cin";
export const TYPY_PRIBEHU: readonly TypPribehu[];
export interface HostHospody { playerId; krestni; prijmeni; alkohol: number; teamId; host: boolean }
export interface IncidentVHospode { id; kind; category; status; severity; den; culpritType; culpritPlayerId; odhalen; deadline; ztraty; recovered; inzerat; uzavrenoDne; obvineni; stopyHospody }
export interface SvedekVHospode { incidentId; playerId; role: RoleSvedka; vyslech: VysledekVyslechu | null }
export interface KontextHospody { teamId; leagueId; seasonNumber; nazevKlubu; den; gameDate; incidenty; svedci; kadr; kamaradi; rivalove; hrozi }
export interface VolbyHospody { trener: boolean; jiste: boolean; ohlasi?: string; uzZaznelo?: ReadonlySet<string> }
export interface EfektHospody { playerId; type: "condition" | "injury" | "morale" | "vztah"; delta?; injuryDays?; injuryDescription?; label }
export interface PribehHospody { type: TypPribehu; playerIds: string[]; text: string; effects: EfektHospody[]; incidentId: string }
export interface HroziciCin { id; kind: CinHrace; playerId; text; deadline; znalost: NovaZnalost; posel: { id; firstName; lastName } | null }
export type ZapisHospody = prozradil | stopa | odhaleni | drb | hrozi | sms;   // viz kód
export interface VysledekHospody { pribehy; zapisy; ohlaseni: { playerId; obvineny } | null; zlodeji: Array<{ playerId; jmeno }> }
export function pribehyHospody(hoste: readonly HostHospody[], k: KontextHospody, v: VolbyHospody): VysledekHospody;
export function vyberCin(stav: StavKlubu, obvineny: boolean, rng: Rng): CinHrace | null;
export function idHroziciho(teamId: string, kind: string, den: string, playerId: string): string;
export function hroziciCin(k: KontextHospody, hoste: readonly HostHospody[], playerId: string, kind: CinHrace, rng: Rng): HroziciCin | null;
```

- [ ] **Step 1: Failing test**

`apps/api/src/incidents/hospoda.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createRng } from "../generators/rng";
import { gameExpiry } from "../lib/game-time";
import {
  hroziciCin, idHroziciho, pribehyHospody, vyberCin,
  type HostHospody, type IncidentVHospode, type KontextHospody, type VolbyHospody,
} from "./hospoda";
import { BONUS_POLICIE } from "./nastaveni";
import { PROBLEMOVY, hrac, stavKlubu } from "./testovaci-stav";
import type { HracKlubu, Obvineni } from "./typy";

const DNES = "2026-09-16T16:00:00.000Z";
const SVEDEK = hrac({ id: "s", jmeno: "Pepa Kos", alkohol: 80 });
const PACHATEL = hrac({ id: "p", jmeno: "Franta Novák", alkohol: 80 });
const KAMARAD = hrac({ id: "k", jmeno: "Karel Vrba", alkohol: 40 });
const JISTE: VolbyHospody = { trener: false, jiste: true };

function kontext(o: Partial<KontextHospody> = {}): KontextHospody {
  return {
    teamId: "tym-a", leagueId: "liga-1", seasonNumber: 4, nazevKlubu: "TJ Dvory",
    den: "2026-09-16", gameDate: DNES, incidenty: [], svedci: [],
    kadr: new Map([SVEDEK, PACHATEL, KAMARAD].map((h) => [h.id, h])),
    kamaradi: new Map(), rivalove: new Map(), hrozi: new Set(), ...o,
  };
}

function incident(o: Partial<IncidentVHospode> = {}): IncidentVHospode {
  return {
    id: "inc-1", kind: "vloupani_sklad", category: "kradez", status: "otevreny", severity: 1, den: "2026-09-14",
    culpritType: "hrac", culpritPlayerId: "p", odhalen: false, deadline: "2026-09-21T16:00:00.000Z",
    ztraty: [{ typ: "vybaveni", kategorie: "jerseys", uroven: 2, stav: 70, urovniDolu: 2 }],
    recovered: false, inzerat: false, uzavrenoDne: null, obvineni: [], stopyHospody: [], ...o,
  };
}

function host(h: HracKlubu, o: Partial<HostHospody> = {}): HostHospody {
  const [krestni, ...prijmeni] = h.jmeno.split(" ");
  return { playerId: h.id, krestni, prijmeni: prijmeni.join(" "), alkohol: h.alkohol, teamId: "tym-a", host: false, ...o };
}

const vztah = (a: string, b: string) => new Map([[a, new Set([b])], [b, new Set([a])]]);
const SVEDCI = [{ incidentId: "inc-1", playerId: "s", role: "svedek" as const, vyslech: null }];
const CIZI = { playerId: "v", krestni: "Vašek", prijmeni: "Host", alkohol: 50, teamId: "tym-b", host: true };

describe("hospoda mluví jen o tom, co se stalo", () => {
  it("bez hráčů klubu u stolu se o incidentech nemluví", () => {
    const r = pribehyHospody([CIZI], kontext({ incidenty: [incident({ severity: 3 })] }), JISTE);
    expect(r).toEqual({ pribehy: [], zapisy: [], ohlaseni: null, zlodeji: [] });
  });

  it("o dnešním incidentu hospoda ještě neví", () => {
    const r = pribehyHospody([host(PACHATEL)], kontext({ incidenty: [incident({ den: "2026-09-16", severity: 2 })] }), JISTE);
    expect(r.pribehy).toEqual([]);
  });
});

describe("drby", () => {
  it("opilý svědek prozradí, co ví: deník jmenuje jen jeho, stopa a SMS i pachatele", () => {
    const r = pribehyHospody([host(SVEDEK)], kontext({ incidenty: [incident()], svedci: SVEDCI }), JISTE);
    expect(r.pribehy).toHaveLength(1);
    expect(r.pribehy[0]).toMatchObject({ type: "drby_o_incidentu", playerIds: ["s"], incidentId: "inc-1" });
    expect(r.pribehy[0].text).toContain("Pepa Kos");
    expect(r.pribehy[0].text).not.toContain("Franta Novák");
    const prozradil = r.zapisy.find((z) => z.typ === "prozradil");
    expect(prozradil).toMatchObject({
      incidentId: "inc-1", svedekId: "s",
      stopa: { zdroj: "hospoda", ukazujeNa: "p", drzitel: "s", sila: 2, bonusPolicie: BONUS_POLICIE.svedek, nalezena: true },
    });
    expect(prozradil?.typ === "prozradil" && prozradil.stopa.text).toContain("Franta Novák");
    expect(prozradil?.typ === "prozradil" && prozradil.stopa.text).toContain("u skladu");
    expect(r.zapisy.find((z) => z.typ === "sms")).toMatchObject({ incidentId: "inc-1", text: expect.stringContaining("Franta Novák") });
  });

  it("vyslechnutý nebo střízlivý svědek ani svědek odhaleného pachatele drby nedají", () => {
    const vyslechnuty = pribehyHospody([host(SVEDEK)], kontext({ incidenty: [incident()], svedci: [{ ...SVEDCI[0], vyslech: "kryje" }] }), JISTE);
    const strizlivy = pribehyHospody([host(SVEDEK, { alkohol: 50 })], kontext({ incidenty: [incident()], svedci: SVEDCI }), JISTE);
    const odhaleny = pribehyHospody([host(SVEDEK)], kontext({ incidenty: [incident({ odhalen: true })], svedci: SVEDCI }), JISTE);
    for (const r of [vyslechnuty, strizlivy, odhaleny]) expect(r.zapisy.filter((z) => z.typ === "prozradil")).toEqual([]);
  });

  it("trenér v hospodě drby zdvojnásobí: co vyjde bez něj, vyjde i s ním", () => {
    let bez = 0;
    let sTrenerem = 0;
    for (let d = 1; d <= 300; d++) {
      const den = new Date(Date.UTC(2026, 9, 1) + d * 86_400_000).toISOString().slice(0, 10);
      const k = kontext({ den, gameDate: `${den}T16:00:00.000Z`, incidenty: [incident({ den: "2026-09-01" })], svedci: SVEDCI });
      const b = pribehyHospody([host(SVEDEK)], k, { trener: false, jiste: false }).pribehy.length;
      const t = pribehyHospody([host(SVEDEK)], k, { trener: true, jiste: false }).pribehy.length;
      if (b > 0) expect(t).toBeGreaterThan(0);
      bez += b;
      sTrenerem += t;
    }
    expect(bez).toBeGreaterThan(30);
    expect(sTrenerem).toBeGreaterThan(bez * 1.4);
  });
});

describe("cizí chlap nabízí zboží", () => {
  const cizi = (o: Partial<IncidentVHospode> = {}) => incident({ culpritType: "cizi", culpritPlayerId: null, ...o });

  it("nevystavené zboží cizího zloděje dá stopu bez jména, poznatelné přidá policii", () => {
    const r = pribehyHospody([host(KAMARAD)], kontext({ incidenty: [cizi()] }), JISTE);
    expect(r.pribehy.map((p) => p.type)).toEqual(["nabizi_zbozi"]);
    expect(r.zapisy.find((z) => z.typ === "stopa")).toMatchObject({
      incidentId: "inc-1", klic: "nabizi", stopa: { zdroj: "hospoda", ukazujeNa: null, sila: 1, bonusPolicie: BONUS_POLICIE.hospodaNabizi },
    });
    const nepoznatelne = pribehyHospody([host(KAMARAD)], kontext({
      incidenty: [cizi({ ztraty: [{ typ: "vybaveni", kategorie: "jerseys", uroven: 1, stav: 70, urovniDolu: 1 }] })],
    }), JISTE);
    expect(nepoznatelne.zapisy.find((z) => z.typ === "stopa")).toMatchObject({ stopa: { bonusPolicie: 0 } });
  });

  it("zboží v bazaru, vrácené, už jednou nabízené nebo u uzavřeného incidentu se nenabízí", () => {
    for (const o of [{ inzerat: true }, { recovered: true }, { stopyHospody: ["nabizi"] }, { status: "uzavreny" as const }]) {
      expect(pribehyHospody([host(KAMARAD)], kontext({ incidenty: [cizi(o)] }), JISTE).pribehy).toEqual([]);
    }
  });
});

describe("chlubení", () => {
  it("neodhalený pachatel se pochlubí a tím se prozradí", () => {
    const r = pribehyHospody([host(PACHATEL)], kontext({ incidenty: [incident()] }), JISTE);
    expect(r.pribehy.map((p) => p.type)).toEqual(["chlubi_se"]);
    expect(r.pribehy[0].text).toContain("Franta Novák");
    expect(r.zapisy.find((z) => z.typ === "stopa")).toMatchObject({ klic: "chlubi", stopa: { zdroj: "hospoda", ukazujeNa: "p", sila: 3 } });
    // Pozdější ze stávající lhůty a dneška + 3 dny.
    expect(r.zapisy.find((z) => z.typ === "odhaleni")).toEqual({ typ: "odhaleni", incidentId: "inc-1", deadline: "2026-09-21T16:00:00.000Z" });
    expect(r.zapisy.some((z) => z.typ === "sms")).toBe(true);
  });

  it("pochlubit se může jen skutečný pachatel z kádru", () => {
    expect(pribehyHospody([host(SVEDEK)], kontext({ incidenty: [incident()] }), JISTE).pribehy).toEqual([]);
    expect(pribehyHospody([host(PACHATEL)], kontext({ incidenty: [incident({ culpritType: "cizi", culpritPlayerId: null, ztraty: [] })] }), JISTE).pribehy).toEqual([]);
  });

  it("známý pachatel se chlubí bez nové stopy, po deseti dnech ani u uzavřeného už ne", () => {
    const znamy = pribehyHospody([host(PACHATEL)], kontext({ incidenty: [incident({ odhalen: true })] }), JISTE);
    expect(znamy.pribehy.map((p) => p.type)).toContain("chlubi_se");
    expect(znamy.zapisy.filter((z) => z.typ === "stopa" || z.typ === "odhaleni" || z.typ === "sms")).toEqual([]);
    expect(pribehyHospody([host(PACHATEL)], kontext({ incidenty: [incident({ den: "2026-09-05" })] }), JISTE).pribehy).toEqual([]);
    expect(pribehyHospody([host(PACHATEL)], kontext({ incidenty: [incident({ status: "uzavreny", uzavrenoDne: "2026-09-15" })] }), JISTE).pribehy).toEqual([]);
  });
});

describe("stížnost na trenéra", () => {
  const OBV: Obvineni = { playerId: "s", jmeno: "Pepa Kos", den: "2026-09-10", vysledek: "zapira" };

  it("kdo zapřel obvinění, stěžuje si kamarádům a těm klesne vztah k trenérovi i morálka", () => {
    const k = kontext({ incidenty: [incident({ culpritType: "cizi", culpritPlayerId: null, ztraty: [], obvineni: [OBV] })], kamaradi: vztah("s", "k") });
    const r = pribehyHospody([host(SVEDEK), host(KAMARAD)], k, JISTE);
    const p = r.pribehy.find((x) => x.type === "stezuje_si_na_trenera");
    expect(p?.text).toContain("Pepa Kos");
    expect(p?.effects).toEqual([
      { playerId: "k", type: "vztah", delta: -3, label: "−3 vztah k trenérovi" },
      { playerId: "k", type: "morale", delta: -1, label: "−1 morálka" },
    ]);
  });

  it("bez kamaráda u stolu, u odhaleného pachatele ani po 60 dnech si nestěžuje", () => {
    const zaklad = { culpritType: "cizi" as const, culpritPlayerId: null, ztraty: [] };
    const bezKamarada = pribehyHospody([host(SVEDEK)], kontext({ incidenty: [incident({ ...zaklad, obvineni: [OBV] })], kamaradi: vztah("s", "k") }), JISTE);
    const odhaleny = pribehyHospody([host(SVEDEK), host(KAMARAD)], kontext({
      incidenty: [incident({ culpritPlayerId: "s", odhalen: true, ztraty: [], obvineni: [OBV] })], kamaradi: vztah("s", "k"),
    }), JISTE);
    const davno = pribehyHospody([host(SVEDEK), host(KAMARAD)], kontext({
      incidenty: [incident({ ...zaklad, den: "2026-07-01", obvineni: [{ ...OBV, den: "2026-07-10" }] })], kamaradi: vztah("s", "k"),
    }), JISTE);
    for (const r of [bezKamarada, odhaleny, davno]) expect(r.pribehy.filter((p) => p.type === "stezuje_si_na_trenera")).toEqual([]);
  });
});

describe("rvačka", () => {
  it("odhalený zloděj a jeho rival u jednoho stolu se poperou", () => {
    const k = kontext({ incidenty: [incident({ odhalen: true, den: "2026-09-01" })], rivalove: vztah("p", "s") });
    const p = pribehyHospody([host(PACHATEL), host(SVEDEK)], k, JISTE).pribehy.find((x) => x.type === "rvacka_kvuli_kradezi");
    expect(p?.playerIds).toEqual(["s", "p"]);
    expect(p?.effects.map((e) => e.playerId)).toEqual(["s", "p"]);
    for (const e of p?.effects ?? []) expect(["injury", "condition"]).toContain(e.type);
  });

  it("neodhalený zloděj ani dávno uzavřená krádež rvačku nevyvolá", () => {
    const rivalove = vztah("p", "s");
    const hoste = [host(PACHATEL), host(SVEDEK)];
    const neodhaleny = pribehyHospody(hoste, kontext({ incidenty: [incident({ den: "2026-09-01" })], rivalove }), JISTE);
    const davno = pribehyHospody(hoste, kontext({
      incidenty: [incident({ odhalen: true, den: "2026-08-01", status: "uzavreny", uzavrenoDne: "2026-08-10" })], rivalove,
    }), JISTE);
    for (const r of [neodhaleny, davno]) expect(r.pribehy.filter((p) => p.type === "rvacka_kvuli_kradezi")).toEqual([]);
  });
});

describe("celá hospoda řeší", () => {
  const zavazny = (o: Partial<IncidentVHospode> = {}) => incident({ severity: 2, culpritType: "cizi", culpritPlayerId: null, ztraty: [], ...o });

  it("závažný incident do tří dnů, bez jmen", () => {
    const r = pribehyHospody([host(KAMARAD)], kontext({ incidenty: [zavazny()] }), JISTE);
    expect(r.pribehy.map((p) => p.type)).toEqual(["cela_hospoda_resi"]);
  });

  it("drobnost ani starší incident ne", () => {
    expect(pribehyHospody([host(KAMARAD)], kontext({ incidenty: [zavazny({ severity: 1 })] }), JISTE).pribehy).toEqual([]);
    expect(pribehyHospody([host(KAMARAD)], kontext({ incidenty: [zavazny({ den: "2026-09-12" })] }), JISTE).pribehy).toEqual([]);
  });
});

describe("vůdci fanoušků poznají zloděje", () => {
  it("odhalený čerstvý zloděj u stolu jde do seznamu", () => {
    const r = pribehyHospody([host(PACHATEL)], kontext({ incidenty: [incident({ odhalen: true, den: "2026-09-01" })] }), JISTE);
    expect(r.zlodeji).toEqual([{ playerId: "p", jmeno: "Franta Novák" }]);
  });
});

describe("ohlášení činu", () => {
  const SVATY = hrac({ id: "x", jmeno: "Jan Svatý", alkohol: 90, disciplina: 95, vernost: 95, vztahKTrenerovi: 90 });

  it("opilý hráč s povahou pachatele čin ohlásí, disciplinovaný ne", () => {
    const k = kontext({ kadr: new Map([[PROBLEMOVY.id, PROBLEMOVY], [SVATY.id, SVATY]]) });
    expect(pribehyHospody([host(PROBLEMOVY)], k, JISTE).ohlaseni).toEqual({ playerId: "p", obvineny: false });
    expect(pribehyHospody([host(SVATY)], k, JISTE).ohlaseni).toBeNull();
  });

  it("zapřené obvinění stačí i bez povahy pachatele, alkohol ale musí být", () => {
    const obv: Obvineni = { playerId: "x", jmeno: "Jan Svatý", den: "2026-09-10", vysledek: "zapira" };
    const k = kontext({ kadr: new Map([[SVATY.id, SVATY]]), incidenty: [incident({ culpritType: "cizi", culpritPlayerId: null, ztraty: [], obvineni: [obv] })] });
    expect(pribehyHospody([host(SVATY, { alkohol: 75 })], k, JISTE).ohlaseni).toEqual({ playerId: "x", obvineny: true });
    expect(pribehyHospody([host(SVATY, { alkohol: 60 })], k, JISTE).ohlaseni).toBeNull();
  });

  it("kdo už jeden čin ohlásil, druhý neohlásí; admin může ohlášení vynutit", () => {
    const k = kontext({ kadr: new Map([[PROBLEMOVY.id, PROBLEMOVY], [KAMARAD.id, KAMARAD]]) });
    expect(pribehyHospody([host(PROBLEMOVY)], { ...k, hrozi: new Set(["p"]) }, JISTE).ohlaseni).toBeNull();
    expect(pribehyHospody([host(PROBLEMOVY), host(KAMARAD)], k, { ...JISTE, ohlasi: "k" }).ohlaseni).toEqual({ playerId: "k", obvineny: false });
  });
});

describe("jaký čin a kdo o něm dá vědět", () => {
  it("nikdy neohlásí čin, na který klub nemá", () => {
    const jenDresy = stavKlubu({ vybaveni: { jerseys: 2 } });
    for (let s = 1; s <= 50; s++) expect(vyberCin(jenDresy, true, createRng(s))).toBe("vloupani_sklad");
    expect(vyberCin(stavKlubu(), true, createRng(1))).toBeNull();
  });

  it("kopnout do dveří jde jen obviněnému a jen s šatnami", () => {
    const s = stavKlubu({ stadion: { changing_rooms: 1, pitch_condition: 70 } });
    expect(vyberCin(s, false, createRng(1))).toBeNull();
    expect(vyberCin(s, true, createRng(1))).toBe("kopnute_dvere");
  });

  it("hrozící čin: lhůta 1 až 3 dny, znalost jen pro něj, posel kamarád s dobrým vztahem", () => {
    const dobry = hrac({ id: "d", jmeno: "Dan Dobrý", vztahKTrenerovi: 70 });
    const zly = hrac({ id: "z", jmeno: "Zdeněk Zlý", vztahKTrenerovi: 30 });
    const k = kontext({ kadr: new Map([PACHATEL, dobry, zly].map((h) => [h.id, h])) });
    const cin = hroziciCin(k, [host(PACHATEL), host(dobry), host(zly)], "p", "vitrina", createRng(3));
    expect(cin?.id).toBe(idHroziciho("tym-a", "vitrina", "2026-09-16", "p"));
    expect(cin?.id).toBe("inc-tym-a-vitrina-2026-09-16-hrozi-p");
    expect([1, 2, 3].map((n) => gameExpiry(DNES, n))).toContain(cin?.deadline);
    expect(cin?.text).toContain("Franta Novák");
    expect(cin?.znalost).toMatchObject({ playerId: "p", role: "pachatel", until: cin?.deadline });
    expect(cin?.posel).toEqual({ id: "d", firstName: "Dan", lastName: "Dobrý" });
    expect(hroziciCin(kontext(), [host(PACHATEL)], "p", "vitrina", createRng(3))?.posel).toBeNull();
    expect(hroziciCin(kontext(), [], "nikdo", "vitrina", createRng(3))).toBeNull();
  });
});

describe("drb do cizích klubů", () => {
  it("host z jiného klubu si drb odnese, jen veřejný fakt na 14 dní", () => {
    const k = kontext({ incidenty: [incident({ severity: 2, culpritType: "cizi", culpritPlayerId: null, ztraty: [] })] });
    const drb = pribehyHospody([host(KAMARAD), CIZI], k, JISTE).zapisy.find((z) => z.typ === "drb");
    expect(drb).toMatchObject({ incidentId: "inc-1", teamId: "tym-b", znalost: { playerId: "v", role: "drb", until: gameExpiry(DNES, 14) } });
    expect(drb?.typ === "drb" && drb.znalost.fact).toContain("TJ Dvory");
  });

  it("bez příhody žádný drb", () => {
    expect(pribehyHospody([host(KAMARAD), CIZI], kontext(), JISTE).zapisy).toEqual([]);
  });
});

describe("co už dnes zaznělo, se nezopakuje", () => {
  it("klíč typ|incident příhodu přeskočí", () => {
    const r = pribehyHospody([host(PACHATEL)], kontext({ incidenty: [incident()] }), { ...JISTE, uzZaznelo: new Set(["chlubi_se|inc-1"]) });
    expect(r.pribehy).toEqual([]);
    expect(r.zapisy).toEqual([]);
  });
});
```

- [ ] **Step 2: Spustit, musí selhat**

Run: `cd apps/api && npx vitest run src/incidents/hospoda.test.ts`
Expected: FAIL, modul `./hospoda` neexistuje.

- [ ] **Step 3: Implementace `apps/api/src/incidents/hospoda.ts`**

```ts
/**
 * Incidenty v hospodě (spec Část 9). Čisté funkce bez DB: co se v hospodě o incidentech
 * řekne a co z toho plyne. Načtení kontextu a zápis: `hospoda-db.ts`.
 *
 * Tvrdá pravidla:
 * - Hospoda nevytváří škody. Odhaluje, varuje a dohrává následky; jediný nový záznam je
 *   hrozící čin, který si hráč sám ohlásil (9a).
 * - Hospodský deník vrací API komukoli (`GET /teams/:id/pub-sessions`), takže text příhody
 *   neodhaleného pachatele nejmenuje. Jméno nese stopa na stránce incidentu a SMS manažerovi.
 * - Každá příhoda má vlastní seed. Trenér, který vezme kluky do hospody týž den, dostane
 *   stejné losy (jen drby s vyšší šancí) a příhody z `uzZaznelo` se nezopakují.
 */

import { CATEGORY_LABELS } from "../equipment/equipment-generator";
import { createRng, type Rng } from "../generators/rng";
import { gameExpiry } from "../lib/game-time";
import { seedFromString } from "../lib/seed";
import { jePoznatelne, jeProdejnaKradez, kradeneZbozi } from "./bazar";
import { pozdejsi } from "./incident-db";
import { CINY_HRACE, muzeOhlasit, nazevIncidentu, type CinHrace } from "./katalog";
import {
  BONUS_POLICIE, CELA_HOSPODA_DNI, CELA_HOSPODA_SANCE, CELA_HOSPODA_ZAVAZNOST, CERSTVY_ZLODEJ_DNI, CHLUBI_ALKOHOL,
  CHLUBI_DNI, CHLUBI_SANCE, CHLUBI_TEMPERAMENT, CHLUBI_TEMPERAMENT_NASOBEK, DRBY_ALKOHOL, DRBY_SANCE, HROZI_LHUTA_MAX,
  HROZI_LHUTA_MIN, LHUTA_PO_ODHALENI_DNI, NABIZI_SANCE, OBVINENI_PAMET_DNI, OCHOTA_POSLA, OHLASUJE_ALKOHOL,
  OHLASUJE_SANCE, PRAH_VAHY_PACHATELE, RVACKA_SANCE, STEZUJE_MORALKA, STEZUJE_SANCE, STEZUJE_VZTAH,
  TRENER_V_HOSPODE_NASOBEK, ZNALOST_DRB_DNI,
} from "./nastaveni";
import { vahaPachatele } from "./pachatel";
import { MISTO_INCIDENTU, MISTO_TEXT } from "./stopy";
import { text, TEXTY, vypln, type KlicTextu } from "./texty";
import type {
  HracKlubu, KategorieIncidentu, NavrhStopy, Obvineni, StavIncidentu, StavKlubu, TypPachatele, Ztrata,
} from "./typy";
import type { NovaZnalost, RoleSvedka, VysledekVyslechu } from "./znalosti";

export type TypPribehu =
  | "drby_o_incidentu" | "nabizi_zbozi" | "stezuje_si_na_trenera" | "rvacka_kvuli_kradezi"
  | "cela_hospoda_resi" | "chlubi_se" | "ohlasuje_cin";

/** Příhody o incidentech. Návštěva s trenérem je z dnešní session převezme (`season/pub.ts`). */
export const TYPY_PRIBEHU: readonly TypPribehu[] = [
  "drby_o_incidentu", "nabizi_zbozi", "stezuje_si_na_trenera", "rvacka_kvuli_kradezi",
  "cela_hospoda_resi", "chlubi_se", "ohlasuje_cin",
];

export interface HostHospody {
  playerId: string;
  krestni: string;
  prijmeni: string;
  /** Alkohol z povahy 0–100. */
  alkohol: number;
  teamId: string;
  /** Hráč jiného klubu (`isVisitor`). */
  host: boolean;
}

export interface IncidentVHospode {
  id: string;
  kind: string;
  category: KategorieIncidentu;
  status: StavIncidentu;
  severity: number;
  /** `YYYY-MM-DD` herního dne incidentu. */
  den: string;
  culpritType: TypPachatele | null;
  culpritPlayerId: string | null;
  odhalen: boolean;
  deadline: string | null;
  ztraty: Ztrata[];
  recovered: boolean;
  /** Kradené zboží už má inzerát v bazaru. */
  inzerat: boolean;
  /** `YYYY-MM-DD` uzavření, `null` u neuzavřeného. */
  uzavrenoDne: string | null;
  obvineni: Obvineni[];
  /** Klíče stop z hospody, které incident už má (`nabizi`, `chlubi`, `drb-{hráč}`). */
  stopyHospody: string[];
}

export interface SvedekVHospode {
  incidentId: string;
  playerId: string;
  role: RoleSvedka;
  vyslech: VysledekVyslechu | null;
}

export interface KontextHospody {
  teamId: string;
  leagueId: string | null;
  seasonNumber: number;
  nazevKlubu: string;
  /** `YYYY-MM-DD` dne hospody. */
  den: string;
  /** Herní datum dne hospody, od něj se počítají lhůty. */
  gameDate: string;
  /** Incidenty klubu za posledních 60 dní, bez hrozících a bez těch, které se nestaly. */
  incidenty: IncidentVHospode[];
  /** Tajné role (svědek, kamarád, rival) hráčů klubu, kteří v hospodě sedí. */
  svedci: SvedekVHospode[];
  kadr: ReadonlyMap<string, HracKlubu>;
  /** Kamarádské vztahy (5b) a rivalové, oběma směry. */
  kamaradi: ReadonlyMap<string, ReadonlySet<string>>;
  rivalove: ReadonlyMap<string, ReadonlySet<string>>;
  /** Hráči, kteří už jeden hrozící čin ohlásili (9a: nejvýš jeden na hráče). */
  hrozi: ReadonlySet<string>;
}

export interface VolbyHospody {
  /** Trenér vzal kluky do hospody sám a poslouchá (spec 9, návaznosti). */
  trener: boolean;
  /** Jen admin na testingu: každý los vyjde. */
  jiste: boolean;
  /** Jen admin na testingu: tenhle hráč ohlásí čin bez ohledu na alkohol, povahu a los. */
  ohlasi?: string;
  /** Klíče `typ|incidentId` příhod, které už dnes v hospodě zazněly. */
  uzZaznelo?: ReadonlySet<string>;
}

export interface EfektHospody {
  playerId: string;
  type: "condition" | "injury" | "morale" | "vztah";
  delta?: number;
  injuryDays?: number;
  injuryDescription?: string;
  label: string;
}

export interface PribehHospody {
  type: TypPribehu;
  playerIds: string[];
  text: string;
  effects: EfektHospody[];
  /** Incident, o kterém se mluví. Deník podle něj ukáže odkaz. */
  incidentId: string;
}

export interface HroziciCin {
  id: string;
  kind: CinHrace;
  playerId: string;
  /** Ohlášení: věta do deníku, text incidentu a SMS. */
  text: string;
  deadline: string;
  znalost: NovaZnalost;
  /** Kdo manažerovi napíše: hráč klubu od stolu, jinak hospodský (`null`). */
  posel: { id: string; firstName: string; lastName: string } | null;
}

export type ZapisHospody =
  /** Svědek se prořekl: jeho nenalezené stopy nahradí stopa z hospody a výslech je rozhodnutý (17d). */
  | { typ: "prozradil"; incidentId: string; svedekId: string; stopa: NavrhStopy }
  | { typ: "stopa"; incidentId: string; klic: string; stopa: NavrhStopy }
  | { typ: "odhaleni"; incidentId: string; deadline: string }
  | { typ: "drb"; incidentId: string; teamId: string; znalost: NovaZnalost }
  | { typ: "hrozi"; cin: HroziciCin }
  | { typ: "sms"; incidentId: string; text: string };

export interface VysledekHospody {
  pribehy: PribehHospody[];
  zapisy: ZapisHospody[];
  /** Kdo ohlásí čin. Jaký, se rozhodne až nad stavem klubu (`vyberCin`). */
  ohlaseni: { playerId: string; obvineny: boolean } | null;
  /** Odhalení zloději u stolu, pro vůdce fanoušků (17h). */
  zlodeji: Array<{ playerId: string; jmeno: string }>;
}

const DEN_MS = 86_400_000;

function dnyMezi(od: string, do_: string): number {
  return Math.round((Date.parse(do_.slice(0, 10)) - Date.parse(od.slice(0, 10))) / DEN_MS);
}

const jmeno = (h: HostHospody) => `${h.krestni} ${h.prijmeni}`;
const resiSe = (i: IncidentVHospode) => i.status === "otevreny" || i.status === "policie";
const vysetrovany = (i: IncidentVHospode) => i.category === "kradez" || i.category === "poskozeni";
const nazvyZbozi = (zbozi: ReadonlyArray<{ kategorie: string }>) => zbozi.map((z) => CATEGORY_LABELS[z.kategorie] ?? z.kategorie).join(", ");

function los(k: KontextHospody, ...casti: string[]): Rng {
  return createRng(seedFromString(["hospoda", k.teamId, k.den, ...casti].join("|")));
}

/** Hod se táhne vždy, ať `jiste` nemění další čísla z generátoru (výběr věty). */
function vyjde(rng: Rng, sance: number, v: VolbyHospody): boolean {
  const hod = rng.random();
  return v.jiste || hod < sance;
}

function zaznelo(v: VolbyHospody, typ: TypPribehu, incidentId: string): boolean {
  return v.uzZaznelo?.has(`${typ}|${incidentId}`) ?? false;
}

/** Obvinění, které hráč zapřel a ještě ho bolí. Ne u pachatele, kterého už všichni znají (17d). */
function zapreneObvineni(k: KontextHospody, playerId: string): IncidentVHospode | null {
  return k.incidenty.find((i) => !(i.odhalen && i.culpritPlayerId === playerId) && i.obvineni.some((o) =>
    o.playerId === playerId && o.vysledek === "zapira" && o.den < k.den && dnyMezi(o.den, k.den) <= OBVINENI_PAMET_DNI)) ?? null;
}

/** Odhalený zloděj z kádru, o kterém se ještě mluví: neuzavřená krádež, nebo uzavřená nedávno. */
function cerstvyZlodej(k: KontextHospody, i: IncidentVHospode): boolean {
  if (i.category !== "kradez" || !i.odhalen || i.culpritType !== "hrac" || !i.culpritPlayerId) return false;
  return i.status !== "uzavreny" || (i.uzavrenoDne !== null && dnyMezi(i.uzavrenoDne, k.den) <= CERSTVY_ZLODEJ_DNI);
}

export function pribehyHospody(hoste: readonly HostHospody[], k: KontextHospody, v: VolbyHospody): VysledekHospody {
  const out: VysledekHospody = { pribehy: [], zapisy: [], ohlaseni: null, zlodeji: [] };
  const mistni = hoste.filter((h) => !h.host && h.teamId === k.teamId && k.kadr.has(h.playerId));
  if (mistni.length === 0) return out;
  const tady = new Map(mistni.map((h) => [h.playerId, h]));
  // Hospoda běží před krokem incidentů: mluví se o včerejšku a starším (spec 9).
  const incidenty = k.incidenty.filter((i) => i.den < k.den);

  drby(k, v, tady, incidenty, out);
  nabizi(k, v, incidenty, out);
  chlubi(k, v, tady, incidenty, out);
  stezuje(k, v, mistni, out);
  rvacka(k, v, mistni, tady, incidenty, out);
  celaHospoda(k, v, incidenty, out);
  out.zlodeji = zlodejiUStolu(k, tady, incidenty);
  out.ohlaseni = kdoOhlasi(k, v, mistni);
  out.zapisy.push(...drbyDoCizichKlubu(k, hoste, out.pribehy));
  return out;
}

function drby(k: KontextHospody, v: VolbyHospody, tady: ReadonlyMap<string, HostHospody>, incidenty: readonly IncidentVHospode[], out: VysledekHospody): void {
  // Hráč s víc rolemi u jednoho incidentu (kamarád, který i něco viděl) mluví jednou.
  const probrano = new Set<string>();
  for (const s of k.svedci) {
    const klic = `${s.incidentId}|${s.playerId}`;
    if (s.vyslech !== null || probrano.has(klic)) continue;
    const inc = incidenty.find((i) => i.id === s.incidentId);
    if (!inc || !resiSe(inc) || !vysetrovany(inc) || inc.odhalen || inc.culpritType !== "hrac" || !inc.culpritPlayerId) continue;
    if (zaznelo(v, "drby_o_incidentu", inc.id)) continue;
    const svedek = tady.get(s.playerId);
    const pachatel = k.kadr.get(inc.culpritPlayerId);
    if (!svedek || !pachatel || svedek.alkohol < DRBY_ALKOHOL) continue;
    probrano.add(klic);
    const rng = los(k, "drby", inc.id, s.playerId);
    if (!vyjde(rng, DRBY_SANCE * (v.trener ? TRENER_V_HOSPODE_NASOBEK : 1), v)) continue;

    const misto = MISTO_INCIDENTU[inc.kind];
    const stopaText = s.role === "svedek"
      ? text(rng, "stopa_hospoda_videl", { svedek: jmeno(svedek), hrac: pachatel.jmeno, misto: misto ? MISTO_TEXT[misto] : "u hřiště" })
      : text(rng, "stopa_hospoda_tusi", { svedek: jmeno(svedek), hrac: pachatel.jmeno });
    out.zapisy.push(
      {
        typ: "prozradil", incidentId: inc.id, svedekId: svedek.playerId,
        stopa: {
          zdroj: "hospoda", ukazujeNa: pachatel.id, podezreli: null, drzitel: svedek.playerId,
          sila: 2, bonusPolicie: BONUS_POLICIE.svedek, text: stopaText, nalezena: true,
        },
      },
      { typ: "sms", incidentId: inc.id, text: `🍺 ${stopaText}` },
    );
    // Deník jmenuje jen toho, kdo mluvil.
    out.pribehy.push({
      type: "drby_o_incidentu", playerIds: [svedek.playerId], effects: [], incidentId: inc.id,
      text: text(rng, "hospoda_drby", { svedek: jmeno(svedek) }),
    });
  }
}

function nabizi(k: KontextHospody, v: VolbyHospody, incidenty: readonly IncidentVHospode[], out: VysledekHospody): void {
  for (const inc of incidenty) {
    if (inc.culpritType !== "cizi" || !resiSe(inc) || inc.recovered || inc.inzerat || !jeProdejnaKradez(inc.kind)) continue;
    if (inc.stopyHospody.includes("nabizi") || zaznelo(v, "nabizi_zbozi", inc.id)) continue;
    const zbozi = kradeneZbozi(inc.ztraty);
    if (zbozi.length === 0) continue;
    const rng = los(k, "nabizi", inc.id);
    if (!vyjde(rng, NABIZI_SANCE, v)) continue;

    const vec = nazvyZbozi(zbozi);
    const poznane = zbozi.some((z) => jePoznatelne(z.kategorie, z.uroven));
    const stopaText = text(rng, poznane ? "stopa_hospoda_nabizi_poznane" : "stopa_hospoda_nabizi", { vec });
    out.zapisy.push(
      {
        typ: "stopa", incidentId: inc.id, klic: "nabizi",
        stopa: {
          zdroj: "hospoda", ukazujeNa: null, podezreli: null, drzitel: null, sila: 1,
          bonusPolicie: poznane ? BONUS_POLICIE.hospodaNabizi : 0, text: stopaText, nalezena: true,
        },
      },
      { typ: "sms", incidentId: inc.id, text: `🍺 ${stopaText}` },
    );
    out.pribehy.push({ type: "nabizi_zbozi", playerIds: [], effects: [], incidentId: inc.id, text: text(rng, "hospoda_nabizi", { vec }) });
    // Jeden podomní prodejce za večer.
    return;
  }
}

function chlubi(k: KontextHospody, v: VolbyHospody, tady: ReadonlyMap<string, HostHospody>, incidenty: readonly IncidentVHospode[], out: VysledekHospody): void {
  for (const inc of incidenty) {
    if (!vysetrovany(inc) || !resiSe(inc) || inc.culpritType !== "hrac" || !inc.culpritPlayerId) continue;
    if (dnyMezi(inc.den, k.den) > CHLUBI_DNI || zaznelo(v, "chlubi_se", inc.id)) continue;
    const host = tady.get(inc.culpritPlayerId);
    const hrac = k.kadr.get(inc.culpritPlayerId);
    if (!host || !hrac || host.alkohol < CHLUBI_ALKOHOL) continue;
    const rng = los(k, "chlubi", inc.id);
    const sance = CHLUBI_SANCE * (hrac.temperament >= CHLUBI_TEMPERAMENT ? CHLUBI_TEMPERAMENT_NASOBEK : 1);
    if (!vyjde(rng, sance, v)) continue;

    const zbozi = inc.category === "kradez" ? kradeneZbozi(inc.ztraty) : [];
    const veta = zbozi.length > 0
      ? text(rng, "hospoda_chlubi_zbozi", { hrac: hrac.jmeno, vec: nazvyZbozi(zbozi) })
      : text(rng, "hospoda_chlubi", { hrac: hrac.jmeno, nazev: nazevIncidentu(inc.kind) });
    out.pribehy.push({ type: "chlubi_se", playerIds: [hrac.id], effects: [], incidentId: inc.id, text: veta });
    // Známého pachatele chlubení jen potvrdí, stopy u odhaleného nevznikají (5b).
    if (inc.odhalen || inc.stopyHospody.includes("chlubi")) continue;
    out.zapisy.push(
      {
        typ: "stopa", incidentId: inc.id, klic: "chlubi",
        stopa: {
          zdroj: "hospoda", ukazujeNa: hrac.id, podezreli: null, drzitel: null, sila: 3, bonusPolicie: 0,
          text: text(rng, "stopa_hospoda_chlubi", { hrac: hrac.jmeno }), nalezena: true,
        },
      },
      { typ: "odhaleni", incidentId: inc.id, deadline: pozdejsi(inc.deadline, gameExpiry(k.gameDate, LHUTA_PO_ODHALENI_DNI)) },
      { typ: "sms", incidentId: inc.id, text: `🍺 ${veta}` },
    );
  }
}

function stezuje(k: KontextHospody, v: VolbyHospody, mistni: readonly HostHospody[], out: VysledekHospody): void {
  for (const h of mistni) {
    const inc = zapreneObvineni(k, h.playerId);
    if (!inc || zaznelo(v, "stezuje_si_na_trenera", inc.id)) continue;
    const kamaradi = mistni.filter((m) => m.playerId !== h.playerId && (k.kamaradi.get(h.playerId)?.has(m.playerId) ?? false));
    if (kamaradi.length === 0) continue;
    const rng = los(k, "stezuje", inc.id, h.playerId);
    if (!vyjde(rng, STEZUJE_SANCE, v)) continue;
    out.pribehy.push({
      type: "stezuje_si_na_trenera",
      playerIds: [h.playerId, ...kamaradi.map((m) => m.playerId)],
      text: text(rng, "hospoda_stezuje", { hrac: jmeno(h) }),
      effects: kamaradi.flatMap((m): EfektHospody[] => [
        { playerId: m.playerId, type: "vztah", delta: STEZUJE_VZTAH, label: `−${Math.abs(STEZUJE_VZTAH)} vztah k trenérovi` },
        { playerId: m.playerId, type: "morale", delta: STEZUJE_MORALKA, label: `−${Math.abs(STEZUJE_MORALKA)} morálka` },
      ]),
      incidentId: inc.id,
    });
    // Jedna stížnost za večer, jinak by kamarádi pykali za každého zvlášť.
    return;
  }
}

function rvacka(
  k: KontextHospody, v: VolbyHospody, mistni: readonly HostHospody[], tady: ReadonlyMap<string, HostHospody>,
  incidenty: readonly IncidentVHospode[], out: VysledekHospody,
): void {
  for (const inc of incidenty) {
    if (!cerstvyZlodej(k, inc) || zaznelo(v, "rvacka_kvuli_kradezi", inc.id)) continue;
    const zlodej = tady.get(inc.culpritPlayerId as string);
    if (!zlodej) continue;
    const rival = mistni.find((m) => k.rivalove.get(zlodej.playerId)?.has(m.playerId) ?? false);
    if (!rival) continue;
    const rng = los(k, "rvacka", inc.id);
    if (!vyjde(rng, RVACKA_SANCE, v)) continue;
    // Stejné dopady jako rvačka s hostem (`cross_team_fight` v season/pub.ts).
    const effects = [rival, zlodej].map((h): EfektHospody => {
      if (rng.random() < 0.5) {
        const dni = rng.int(1, 3);
        return {
          playerId: h.playerId, type: "injury", injuryDays: dni, injuryDescription: "Rvačka v hospodě kvůli krádeži",
          label: `Lehké zranění (${dni} ${dni === 1 ? "den" : "dny"})`,
        };
      }
      return { playerId: h.playerId, type: "condition", delta: -12, label: "−12 kondice (modřiny)" };
    });
    out.pribehy.push({
      type: "rvacka_kvuli_kradezi", playerIds: [rival.playerId, zlodej.playerId], effects, incidentId: inc.id,
      text: text(rng, "hospoda_rvacka", { rival: jmeno(rival), zlodej: jmeno(zlodej) }),
    });
    return;
  }
}

function celaHospoda(k: KontextHospody, v: VolbyHospody, incidenty: readonly IncidentVHospode[], out: VysledekHospody): void {
  const cerstvy = incidenty
    .filter((i) => i.severity >= CELA_HOSPODA_ZAVAZNOST && dnyMezi(i.den, k.den) <= CELA_HOSPODA_DNI)
    .filter((i) => !out.pribehy.some((p) => p.incidentId === i.id) && !zaznelo(v, "cela_hospoda_resi", i.id))
    .sort((a, b) => b.severity - a.severity || b.den.localeCompare(a.den) || a.id.localeCompare(b.id))[0];
  if (!cerstvy) return;
  const rng = los(k, "cela", cerstvy.id);
  if (!vyjde(rng, CELA_HOSPODA_SANCE, v)) return;
  out.pribehy.push({
    type: "cela_hospoda_resi", playerIds: [], effects: [], incidentId: cerstvy.id,
    text: text(rng, "hospoda_cela", { nazev: nazevIncidentu(cerstvy.kind) }),
  });
}

function zlodejiUStolu(k: KontextHospody, tady: ReadonlyMap<string, HostHospody>, incidenty: readonly IncidentVHospode[]): Array<{ playerId: string; jmeno: string }> {
  const zlodeji = new Map<string, string>();
  for (const inc of incidenty) {
    if (!cerstvyZlodej(k, inc)) continue;
    const h = tady.get(inc.culpritPlayerId as string);
    if (h) zlodeji.set(h.playerId, jmeno(h));
  }
  return [...zlodeji].map(([playerId, j]) => ({ playerId, jmeno: j }));
}

function kdoOhlasi(k: KontextHospody, v: VolbyHospody, mistni: readonly HostHospody[]): { playerId: string; obvineny: boolean } | null {
  for (const h of mistni) {
    const hrac = k.kadr.get(h.playerId);
    if (!hrac || k.hrozi.has(h.playerId)) continue;
    const obvineny = zapreneObvineni(k, h.playerId) !== null;
    if (v.ohlasi !== undefined) {
      if (v.ohlasi === h.playerId) return { playerId: h.playerId, obvineny };
      continue;
    }
    if (h.alkohol < OHLASUJE_ALKOHOL) continue;
    if (!obvineny && vahaPachatele(hrac) < PRAH_VAHY_PACHATELE) continue;
    if (vyjde(los(k, "ohlasuje", h.playerId), OHLASUJE_SANCE, v)) return { playerId: h.playerId, obvineny };
  }
  return null;
}

function drbyDoCizichKlubu(k: KontextHospody, hoste: readonly HostHospody[], pribehy: readonly PribehHospody[]): ZapisHospody[] {
  const zvenku = hoste.filter((h) => h.host && h.teamId !== k.teamId);
  const zapisy: ZapisHospody[] = [];
  for (const id of new Set(pribehy.map((p) => p.incidentId))) {
    const inc = k.incidenty.find((i) => i.id === id);
    if (!inc) continue;
    // Jen veřejný fakt: název klubu a co se stalo, nikdy jméno neodhaleného pachatele.
    const fact = vypln(TEXTY.znalost_drb[0], { klub: k.nazevKlubu, nazev: nazevIncidentu(inc.kind) });
    for (const h of zvenku) {
      zapisy.push({
        typ: "drb", incidentId: id, teamId: h.teamId,
        znalost: { playerId: h.playerId, role: "drb", fact, ochota: 50, until: gameExpiry(k.gameDate, ZNALOST_DRB_DNI) },
      });
    }
  }
  return zapisy;
}

/** Jaký čin hráč ohlásí: jen takový, na který klub má (spec 9a). Obviněný spíš kopne do dveří. */
export function vyberCin(stav: StavKlubu, obvineny: boolean, rng: Rng): CinHrace | null {
  const mozne = CINY_HRACE.filter((kind) => muzeOhlasit(kind, stav, obvineny));
  if (mozne.length === 0) return null;
  const kind = rng.weighted(Object.fromEntries(mozne.map((x) => [x, x === "kopnute_dvere" ? 3 : 1])));
  return mozne.find((x) => x === kind) ?? null;
}

const KLIC_OHLASENI: Record<CinHrace, KlicTextu> = {
  vloupani_sklad: "ohlaseni_vloupani_sklad",
  vitrina: "ohlaseni_vitrina",
  dodavka_pujcena: "ohlaseni_dodavka_pujcena",
  koleje_trakturek: "ohlaseni_koleje_trakturek",
  kopnute_dvere: "ohlaseni_kopnute_dvere",
};

export function idHroziciho(teamId: string, kind: string, den: string, playerId: string): string {
  return `inc-${teamId}-${kind}-${den}-hrozi-${playerId}`;
}

/**
 * Hrozící čin (spec 9a). Posel je hráč klubu, který u toho seděl a má k trenérovi aspoň
 * `OCHOTA_POSLA`; když takový není, napíše hospodský.
 */
export function hroziciCin(
  k: KontextHospody, hoste: readonly HostHospody[], playerId: string, kind: CinHrace, rng: Rng,
): HroziciCin | null {
  const hrac = k.kadr.get(playerId);
  if (!hrac) return null;
  const deadline = gameExpiry(k.gameDate, rng.int(HROZI_LHUTA_MIN, HROZI_LHUTA_MAX));
  const posel = hoste
    .filter((h) => !h.host && h.teamId === k.teamId && h.playerId !== playerId)
    .map((h) => ({ h, vztah: k.kadr.get(h.playerId)?.vztahKTrenerovi ?? -1 }))
    .filter((x) => x.vztah >= OCHOTA_POSLA)
    .sort((a, b) => b.vztah - a.vztah || a.h.playerId.localeCompare(b.h.playerId))[0]?.h ?? null;
  return {
    id: idHroziciho(k.teamId, kind, k.den, playerId),
    kind, playerId, deadline,
    text: text(rng, KLIC_OHLASENI[kind], { hrac: hrac.jmeno }),
    znalost: {
      playerId, role: "pachatel", ochota: 0, until: deadline,
      fact: vypln(TEXTY.znalost_hrozi[0], { nazev: nazevIncidentu(kind) }),
    },
    posel: posel ? { id: posel.playerId, firstName: posel.krestni, lastName: posel.prijmeni } : null,
  };
}
```

- [ ] **Step 4: Testy a typecheck**

Run: `cd apps/api && npx vitest run src/incidents/hospoda.test.ts && npx tsc --noEmit`
Expected: PASS. Když test „trenér v hospodě drby zdvojnásobí" padne jen na hranici poměru, nezvyšovat šanci ani neměnit seedy: ověřit, že `trener` opravdu násobí `DRBY_SANCE`, a nahlásit to v reportu.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/incidents/hospoda.ts apps/api/src/incidents/hospoda.test.ts
git commit -F - <<'EOF'
feat(incidenty): pribehy o incidentech v hospode (ciste jadro)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 3: Hospoda v DB: kontext, ohlášený čin a zápis následků

**Files:**
- Create: `apps/api/src/incidents/hospoda-db.ts`
- Test: `apps/api/src/incidents/hospoda-db.test.ts`

**Interfaces:**
- Consumes: Task 1 (`prikazStopyHospody`, `SMS_ROLE_HOSPODSKY`, klíče `sms_ohlaseni_*`), Task 2 (`pribehyHospody`, `vyberCin`, `hroziciCin`, typy). Existující: `nactiStavKlubu`, `hracZRadku`, `SLOUPCE_HRACE` (stav-klubu), `prikazyZnalosti` (znalosti-db), `nactiObvineni` (vysetrovani), `nactiZtraty` (popis), `KATALOG_PODLE_KIND`, `smsIncidentu`, `sendSystemSMS`, `sendPlayerSMS`.
- Produces:

```ts
export interface NavstevnikHospody { playerId: string; firstName: string; lastName: string; alcohol: number; teamId: string; isVisitor: boolean; isCoach?: boolean }
export interface TymHospody { teamId: string; leagueId: string | null; /** herní datum ISO nebo YYYY-MM-DD */ gameDate: string }
export interface UdalostiHospody { pribehy: PribehHospody[]; zapisy: ZapisHospody[]; zlodeji: Array<{ playerId: string; jmeno: string }>; seasonNumber: number | null }
export async function nactiKontextHospody(db: D1Database, t: TymHospody, hraciIds: readonly string[]): Promise<KontextHospody | null>;
export async function udalostiHospody(db: D1Database, t: TymHospody, attendees: readonly NavstevnikHospody[], v: VolbyHospody): Promise<UdalostiHospody>;
export async function zapisHospody(db: D1Database, t: TymHospody & { seasonNumber: number }, zapisy: readonly ZapisHospody[]): Promise<void>;
```

- [ ] **Step 1: Failing test**

`apps/api/src/incidents/hospoda-db.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../messaging/system-sms", () => ({
  sendSystemSMS: vi.fn(async () => undefined),
  sendPlayerSMS: vi.fn(async () => "konv-1"),
}));
vi.mock("./stav-klubu", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./stav-klubu")>()),
  nactiStavKlubu: vi.fn(async () => null),
}));

import { sendPlayerSMS, sendSystemSMS } from "../messaging/system-sms";
import type { HroziciCin } from "./hospoda";
import { nactiKontextHospody, udalostiHospody, zapisHospody, type NavstevnikHospody } from "./hospoda-db";
import { nactiStavKlubu } from "./stav-klubu";
import { FalesnaD1, jakoD1, type Pravidlo } from "./testovaci-d1";
import { hrac, hracRadek, stavKlubu } from "./testovaci-stav";

const DNES = "2026-09-16T16:00:00.000Z";
const TYM = { teamId: "tym-a", leagueId: "liga-1", gameDate: DNES };
const SMS_INCIDENTU = (incidentId: string) => ({ type: "incident", incidentId });

const RADEK_INCIDENTU = {
  id: "inc-1", kind: "vloupani_sklad", category: "kradez", status: "otevreny", severity: 1, game_date: "2026-09-14T16:00:00.000Z",
  deadline: "2026-09-21T16:00:00.000Z", culprit_type: "hrac", culprit_player_id: "p", culprit_revealed: 0,
  loss: JSON.stringify([{ typ: "vybaveni", kategorie: "jerseys", uroven: 2, stav: 70, urovniDolu: 2 }]),
  recovered: 0, resolved_on: null, accused: JSON.stringify([{ playerId: "s", jmeno: "Pepa Kos", den: "2026-09-15", vysledek: "zapira" }]),
  inzerat: 0, stopy_hospody: "nabizi,drb-s",
};

function pravidlaKontextu(): Pravidlo[] {
  return [
    { sql: /SELECT t\.name/, all: [{ name: "TJ Dvory", sezona: 4 }] },
    { sql: /status = 'hrozi' AND culprit_player_id IS NOT NULL/, all: [{ id: "h" }] },
    { sql: /EXISTS \(SELECT 1 FROM equipment_listings/, all: [RADEK_INCIDENTU] },
    { sql: /SELECT DISTINCT culprit_player_id/, all: [{ id: "p" }] },
    { sql: /FROM club_incident_knowledge/, all: [{ incident_id: "inc-1", player_id: "s", role: "svedek", interrogation: null }] },
    { sql: /FROM relationships/, all: [
      { player_a_id: "s", player_b_id: "k", type: "drinking_buddies" },
      { player_a_id: "p", player_b_id: "s", type: "rivals" },
    ] },
    { sql: /FROM players WHERE team_id = \?/, all: [hracRadek("s", "Pepa", "Kos"), hracRadek("p", "Franta", "Novák"), hracRadek("k", "Karel", "Vrba")] },
  ];
}

const navstevnik = (id: string, jmeno: string, prijmeni: string, o: Partial<NavstevnikHospody> = {}): NavstevnikHospody => ({
  playerId: id, firstName: jmeno, lastName: prijmeni, alcohol: 80, teamId: "tym-a", isVisitor: false, ...o,
});

beforeEach(() => vi.clearAllMocks());

describe("kontext hospody z DB", () => {
  it("načte incidenty, svědky, vztahy oběma směry, recidivisty a hrozící hráče", async () => {
    const db = new FalesnaD1(pravidlaKontextu());
    const k = await nactiKontextHospody(jakoD1(db), TYM, ["s", "p"]);
    expect(k).toMatchObject({ teamId: "tym-a", leagueId: "liga-1", seasonNumber: 4, nazevKlubu: "TJ Dvory", den: "2026-09-16", gameDate: DNES });
    expect(k?.incidenty[0]).toMatchObject({
      id: "inc-1", den: "2026-09-14", odhalen: false, inzerat: false, recovered: false, uzavrenoDne: null, stopyHospody: ["nabizi", "drb-s"],
    });
    expect(k?.incidenty[0].obvineni[0].playerId).toBe("s");
    expect(k?.incidenty[0].ztraty).toHaveLength(1);
    expect(k?.svedci).toEqual([{ incidentId: "inc-1", playerId: "s", role: "svedek", vyslech: null }]);
    expect(k?.kamaradi.get("k")?.has("s")).toBe(true);
    expect(k?.rivalove.get("s")?.has("p")).toBe(true);
    expect(k?.hrozi.has("h")).toBe(true);
    expect(k?.kadr.get("p")?.recidivista).toBe(true);
    const dotaz = db.davky[0].find((d) => /EXISTS \(SELECT 1 FROM equipment_listings/.test(d.sql));
    expect(dotaz?.sql).toContain("status != 'hrozi'");
    expect(dotaz?.sql).toContain("'nestalo_se'");
  });

  it("bez hráčů klubu v hospodě nic nenačítá a nic nevrací", async () => {
    const db = new FalesnaD1(pravidlaKontextu());
    const r = await udalostiHospody(jakoD1(db), TYM, [
      navstevnik("coach-m1", "Trenér", "Novák", { isCoach: true }),
      navstevnik("fan-l1", "Vůdce", "Kotle"),
      navstevnik("v", "Vašek", "Host", { teamId: "tym-b", isVisitor: true }),
    ], { trener: false, jiste: true });
    expect(r).toEqual({ pribehy: [], zapisy: [], zlodeji: [], seasonNumber: null });
    expect(db.dotazy).toHaveLength(0);
    expect(db.davky).toHaveLength(0);
  });

  it("spadlé načtení hospodu neshodí", async () => {
    const db = new FalesnaD1();
    db.batch = async () => { throw new Error("D1 nedostupná"); };
    expect(await udalostiHospody(jakoD1(db), TYM, [navstevnik("s", "Pepa", "Kos")], { trener: false, jiste: true }))
      .toEqual({ pribehy: [], zapisy: [], zlodeji: [], seasonNumber: null });
  });

  it("vynucené ohlášení vybere čin nad stavem klubu a přidá příhodu do deníku", async () => {
    vi.mocked(nactiStavKlubu).mockResolvedValueOnce(stavKlubu({ gameDate: DNES, den: "2026-09-16", vybaveni: { trophy_case: 2 }, kadr: [hrac({ id: "k", jmeno: "Karel Vrba" })] }));
    const db = new FalesnaD1(pravidlaKontextu());
    const r = await udalostiHospody(jakoD1(db), TYM, [navstevnik("k", "Karel", "Vrba")], { trener: false, jiste: false, ohlasi: "k" });
    const hrozi = r.zapisy.find((z) => z.typ === "hrozi");
    expect(hrozi?.typ === "hrozi" && hrozi.cin.kind).toBe("vitrina");
    expect(r.pribehy.find((p) => p.type === "ohlasuje_cin")).toMatchObject({ playerIds: ["k"], incidentId: "inc-tym-a-vitrina-2026-09-16-hrozi-k" });
    expect(r.seasonNumber).toBe(4);
  });
});

describe("zápis následků hospody", () => {
  const PROZRADIL = {
    typ: "prozradil" as const, incidentId: "inc-1", svedekId: "s",
    stopa: { zdroj: "hospoda" as const, ukazujeNa: "p", podezreli: null, drzitel: "s", sila: 2 as const, bonusPolicie: 0.1, text: "Pepa Kos vykládal.", nalezena: true },
  };

  it("prozrazení: svědkova stopa se promění ve stopu z hospody, výslech je rozhodnutý, SMS až po zápisu", async () => {
    const db = new FalesnaD1();
    await zapisHospody(jakoD1(db), { ...TYM, seasonNumber: 4 }, [PROZRADIL, { typ: "sms", incidentId: "inc-1", text: "🍺 Pepa Kos vykládal." }]);
    const [smazani, stopa, vyslech] = db.davky[0];
    expect(smazani.sql).toMatch(/DELETE FROM club_incident_clues/);
    expect(smazani.sql).toContain("found = 0");
    expect(smazani.params).toEqual(["inc-1", "s"]);
    expect(stopa.params[0]).toBe("inc-1-hospoda-drb-s");
    expect(vyslech.sql).toContain("interrogation IS NULL");
    expect(vyslech.params).toEqual([DNES, "inc-1", "s", "tym-a"]);
    expect(sendSystemSMS).toHaveBeenCalledWith(expect.anything(), "tym-a", "Hospodský", "🍺 Pepa Kos vykládal.", SMS_INCIDENTU("inc-1"));
  });

  it("spadlá dávka: žádná SMS o něčem, co se nezapsalo", async () => {
    const db = new FalesnaD1();
    db.batch = async () => { throw new Error("D1 spadla"); };
    await zapisHospody(jakoD1(db), { ...TYM, seasonNumber: 4 }, [PROZRADIL, { typ: "sms", incidentId: "inc-1", text: "🍺 Pepa Kos vykládal." }]);
    expect(sendSystemSMS).not.toHaveBeenCalled();
  });

  it("odhalení jen neodhaleného a neuzavřeného; drb se zapíše klubu hosta", async () => {
    const db = new FalesnaD1();
    await zapisHospody(jakoD1(db), { ...TYM, seasonNumber: 4 }, [
      { typ: "odhaleni", incidentId: "inc-1", deadline: "2026-09-21T16:00:00.000Z" },
      { typ: "drb", incidentId: "inc-1", teamId: "tym-b", znalost: { playerId: "v", role: "drb", fact: "Drb.", ochota: 50, until: "2026-09-30T16:00:00.000Z" } },
    ]);
    const [odhaleni, drb] = db.davky[0];
    expect(odhaleni.sql).toContain("culprit_revealed = 0");
    expect(odhaleni.sql).toContain("status IN ('otevreny', 'policie')");
    expect(odhaleni.params).toEqual(["2026-09-21T16:00:00.000Z", "inc-1", "tym-a"]);
    expect(drb.params.slice(0, 4)).toEqual(["inc-1", "v", "tym-b", "drb"]);
  });

  it("hrozící čin: záznam ve stavu hrozi bez odhalení, znalost pro něj, SMS od kamaráda, bez kamaráda od hospodského", async () => {
    const cin: HroziciCin = {
      id: "inc-h", kind: "vitrina", playerId: "p", text: "Franta Novák tvrdil, že poháry by doma vypadaly líp.",
      deadline: "2026-09-18T16:00:00.000Z",
      znalost: { playerId: "p", role: "pachatel", fact: "V hospodě jsi opilý vykládal.", ochota: 0, until: "2026-09-18T16:00:00.000Z" },
      posel: { id: "d", firstName: "Dan", lastName: "Dobrý" },
    };
    const db = new FalesnaD1();
    await zapisHospody(jakoD1(db), { ...TYM, seasonNumber: 4 }, [{ typ: "hrozi", cin }]);
    const vlozeni = db.davky[0].find((d) => /INSERT OR IGNORE INTO club_incidents/.test(d.sql));
    expect(vlozeni?.sql).toContain("'hrozi'");
    expect(vlozeni?.params).toEqual(["inc-h", "tym-a", "liga-1", 4, "vitrina", "kradez", DNES, "2026-09-18T16:00:00.000Z", "p", cin.text]);
    expect(db.davky[0].some((d) => /club_incident_knowledge/.test(d.sql) && d.params.includes("pachatel"))).toBe(true);
    expect(sendPlayerSMS).toHaveBeenCalledWith(expect.anything(), "tym-a", cin.posel, expect.stringContaining(cin.text), SMS_INCIDENTU("inc-h"));

    await zapisHospody(jakoD1(new FalesnaD1()), { ...TYM, seasonNumber: 4 }, [{ typ: "hrozi", cin: { ...cin, posel: null } }]);
    expect(sendSystemSMS).toHaveBeenCalledWith(expect.anything(), "tym-a", "Hospodský", expect.stringContaining(cin.text), SMS_INCIDENTU("inc-h"));
  });
});
```

- [ ] **Step 2: Spustit, musí selhat**

Run: `cd apps/api && npx vitest run src/incidents/hospoda-db.test.ts`
Expected: FAIL, modul `./hospoda-db` neexistuje.

- [ ] **Step 3: Implementace `apps/api/src/incidents/hospoda-db.ts`**

```ts
/**
 * Incidenty v hospodě a DB (spec Část 9): kontext pro `hospoda.ts`, výběr ohlášeného činu
 * nad stavem klubu a zápis následků. `udalostiHospody` nikdy nehází: hospoda nesmí spadnout
 * kvůli incidentům.
 */

import { createRng } from "../generators/rng";
import { gameExpiry } from "../lib/game-time";
import { logger } from "../lib/logger";
import { seedFromString } from "../lib/seed";
import { sendPlayerSMS, sendSystemSMS } from "../messaging/system-sms";
import {
  hroziciCin, pribehyHospody, vyberCin,
  type HostHospody, type KontextHospody, type PribehHospody, type VolbyHospody, type ZapisHospody,
} from "./hospoda";
import { smsIncidentu } from "./incident-db";
import { KATALOG_PODLE_KIND } from "./katalog";
import { KAMARADSKE_VZTAHY, OBVINENI_PAMET_DNI, RECIDIVA_DNI, SILA_KAMARADSTVI, SMS_ROLE_HOSPODSKY } from "./nastaveni";
import { nactiZtraty } from "./popis";
import { hracZRadku, nactiStavKlubu, SLOUPCE_HRACE } from "./stav-klubu";
import { prikazStopyHospody } from "./stopy-db";
import { text } from "./texty";
import type { KategorieIncidentu, StavIncidentu, TypPachatele } from "./typy";
import { nactiObvineni } from "./vysetrovani";
import type { RoleSvedka, VysledekVyslechu } from "./znalosti";
import { prikazyZnalosti } from "./znalosti-db";

const M = "incidents-hospoda";

/** Návštěvník hospody, jak ho zná `season/pub.ts` (`PubAttendee`). */
export interface NavstevnikHospody {
  playerId: string;
  firstName: string;
  lastName: string;
  alcohol: number;
  teamId: string;
  isVisitor: boolean;
  isCoach?: boolean;
}

export interface TymHospody {
  teamId: string;
  leagueId: string | null;
  /** Herní datum dne hospody, ISO nebo `YYYY-MM-DD` (klíč `pub_sessions.game_date`). */
  gameDate: string;
}

export interface UdalostiHospody {
  pribehy: PribehHospody[];
  zapisy: ZapisHospody[];
  zlodeji: Array<{ playerId: string; jmeno: string }>;
  /** Aktivní sezóna pro zápis, `null`, když se nic nenačetlo. */
  seasonNumber: number | null;
}

const prazdne = (): UdalostiHospody => ({ pribehy: [], zapisy: [], zlodeji: [], seasonNumber: null });

/** Sezóna jako poddotaz, ať celé načtení zůstane jednou dávkou. */
const SEZONA = "(SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1)";

type RadekIncidentu = {
  id: string; kind: string; category: KategorieIncidentu; status: StavIncidentu; severity: number; game_date: string;
  deadline: string | null; culprit_type: TypPachatele | null; culprit_player_id: string | null; culprit_revealed: number;
  loss: string; recovered: number; resolved_on: string | null; accused: string; inzerat: number; stopy_hospody: string | null;
};

function pridejVztah(mapa: Map<string, Set<string>>, a: string, b: string): void {
  if (!mapa.has(a)) mapa.set(a, new Set());
  mapa.get(a)?.add(b);
}

/** Kontext jedné hospody. `hraciIds` = hráči klubu u stolu, nesmí být prázdné. */
export async function nactiKontextHospody(db: D1Database, t: TymHospody, hraciIds: readonly string[]): Promise<KontextHospody | null> {
  if (hraciIds.length === 0) return null;
  const ph = hraciIds.map(() => "?").join(", ");
  const kamaradske = KAMARADSKE_VZTAHY.map((typ) => `'${typ}'`).join(", ");
  const vysledky = await db.batch([
    db.prepare(`SELECT t.name, ${SEZONA} AS sezona FROM teams t WHERE t.id = ?`).bind(t.teamId),
    db.prepare(
      `SELECT i.id, i.kind, i.category, i.status, i.severity, i.game_date, i.deadline, i.culprit_type, i.culprit_player_id,
              i.culprit_revealed, i.loss, i.recovered, i.resolved_on, i.accused,
              EXISTS (SELECT 1 FROM equipment_listings el WHERE el.incident_id = i.id) AS inzerat,
              (SELECT group_concat(replace(c.id, i.id || '-hospoda-', ''), ',') FROM club_incident_clues c
                WHERE c.incident_id = i.id AND c.source = 'hospoda') AS stopy_hospody
         FROM club_incidents i
        WHERE i.team_id = ? AND i.season_number = ${SEZONA}
          AND i.status != 'hrozi' AND COALESCE(i.resolution, '') NOT IN ('bez_skody', 'nestalo_se')
          AND i.game_date >= ?
        ORDER BY i.game_date DESC
        LIMIT 30`,
    ).bind(t.teamId, gameExpiry(t.gameDate, -OBVINENI_PAMET_DNI)),
    db.prepare("SELECT culprit_player_id AS id FROM club_incidents WHERE team_id = ? AND status = 'hrozi' AND culprit_player_id IS NOT NULL").bind(t.teamId),
    db.prepare(`SELECT ${SLOUPCE_HRACE} FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active')`).bind(t.teamId),
    db.prepare(
      `SELECT DISTINCT culprit_player_id AS id FROM club_incidents
        WHERE team_id = ? AND season_number = ${SEZONA} AND culprit_type = 'hrac' AND culprit_player_id IS NOT NULL
          AND status = 'uzavreny' AND COALESCE(resolution, '') NOT IN ('bez_skody', 'nestalo_se', 'konec_sezony')
          AND resolved_on >= ?`,
    ).bind(t.teamId, gameExpiry(t.gameDate, -RECIDIVA_DNI)),
    db.prepare(
      `SELECT incident_id, player_id, role, interrogation FROM club_incident_knowledge
        WHERE team_id = ? AND role IN ('svedek', 'kamarad', 'rival') AND player_id IN (${ph})`,
    ).bind(t.teamId, ...hraciIds),
    db.prepare(
      `SELECT player_a_id, player_b_id, type FROM relationships
        WHERE (player_a_id IN (${ph}) OR player_b_id IN (${ph}))
          AND (type = 'rivals' OR (type IN (${kamaradske}) AND COALESCE(strength, 50) >= ?))`,
    ).bind(...hraciIds, ...hraciIds, SILA_KAMARADSTVI),
  ]).catch((e) => { logger.warn({ module: M }, `kontext hospody ${t.teamId}`, e); return null; });
  if (!vysledky) return null;
  const [tymRes, incRes, hroziRes, kadrRes, recidRes, svedciRes, vztahyRes] = vysledky;

  const tym = tymRes.results[0] as { name: string; sezona: number | null } | undefined;
  if (!tym || tym.sezona == null) return null;

  const recidiviste = new Set((recidRes.results as Array<{ id: string }>).map((r) => String(r.id)));
  const kadr = new Map((kadrRes.results as Array<Record<string, unknown>>).map((r) => {
    const h = hracZRadku(r, recidiviste);
    return [h.id, h] as const;
  }));
  const kamaradi = new Map<string, Set<string>>();
  const rivalove = new Map<string, Set<string>>();
  for (const r of vztahyRes.results as Array<{ player_a_id: string; player_b_id: string; type: string }>) {
    const mapa = r.type === "rivals" ? rivalove : kamaradi;
    pridejVztah(mapa, r.player_a_id, r.player_b_id);
    pridejVztah(mapa, r.player_b_id, r.player_a_id);
  }

  return {
    teamId: t.teamId, leagueId: t.leagueId, seasonNumber: tym.sezona, nazevKlubu: tym.name,
    den: t.gameDate.slice(0, 10), gameDate: t.gameDate,
    incidenty: (incRes.results as RadekIncidentu[]).map((r) => ({
      id: r.id, kind: r.kind, category: r.category, status: r.status, severity: r.severity, den: r.game_date.slice(0, 10),
      culpritType: r.culprit_type, culpritPlayerId: r.culprit_player_id, odhalen: r.culprit_revealed === 1,
      deadline: r.deadline, ztraty: nactiZtraty(r.loss), recovered: r.recovered === 1, inzerat: r.inzerat === 1,
      uzavrenoDne: r.status === "uzavreny" && r.resolved_on ? r.resolved_on.slice(0, 10) : null,
      obvineni: nactiObvineni(r.accused),
      stopyHospody: r.stopy_hospody ? r.stopy_hospody.split(",") : [],
    })),
    svedci: (svedciRes.results as Array<{ incident_id: string; player_id: string; role: RoleSvedka; interrogation: VysledekVyslechu | null }>)
      .map((r) => ({ incidentId: r.incident_id, playerId: r.player_id, role: r.role, vyslech: r.interrogation })),
    kadr, kamaradi, rivalove,
    hrozi: new Set((hroziRes.results as Array<{ id: string }>).map((r) => String(r.id))),
  };
}

/** Trenér, vůdci fanoušků a NPC (starosta) nejsou hráči: o incidentech nemluví. */
function jeHrac(a: NavstevnikHospody): boolean {
  return !a.isCoach && !/^(coach|fan|npc)-/.test(a.playerId);
}

/** Příhody o incidentech pro jednu hospodskou session. `attendees` = všichni u stolu včetně hostů. */
export async function udalostiHospody(
  db: D1Database, t: TymHospody, attendees: readonly NavstevnikHospody[], v: VolbyHospody,
): Promise<UdalostiHospody> {
  try {
    const hoste: HostHospody[] = attendees.filter(jeHrac).map((a) => ({
      playerId: a.playerId, krestni: a.firstName, prijmeni: a.lastName,
      alkohol: typeof a.alcohol === "number" ? a.alcohol : 30, teamId: a.teamId, host: a.isVisitor,
    }));
    const mistni = hoste.filter((h) => !h.host && h.teamId === t.teamId).map((h) => h.playerId);
    if (mistni.length === 0) return prazdne();

    const k = await nactiKontextHospody(db, t, mistni);
    if (!k) return prazdne();
    const r = pribehyHospody(hoste, k, v);
    const vysledek: UdalostiHospody = { pribehy: r.pribehy, zapisy: r.zapisy, zlodeji: r.zlodeji, seasonNumber: k.seasonNumber };

    if (r.ohlaseni) {
      // Co ohlásí, rozhoduje stav klubu: nikdy čin, na který klub nemá (spec 9a).
      const stav = await nactiStavKlubu(db, { id: t.teamId, league_id: t.leagueId }, t.gameDate, k.seasonNumber);
      const rng = createRng(seedFromString(`hospoda|${t.teamId}|${k.den}|cin|${r.ohlaseni.playerId}`));
      const kind = stav ? vyberCin(stav, r.ohlaseni.obvineny, rng) : null;
      const cin = kind ? hroziciCin(k, hoste, r.ohlaseni.playerId, kind, rng) : null;
      if (cin) {
        vysledek.pribehy.push({ type: "ohlasuje_cin", playerIds: [cin.playerId], text: cin.text, effects: [], incidentId: cin.id });
        vysledek.zapisy.push({ typ: "hrozi", cin });
      }
    }
    return vysledek;
  } catch (e) {
    logger.warn({ module: M }, `incidenty v hospodě ${t.teamId}`, e);
    return prazdne();
  }
}

/** Následky příhod jednou dávkou. SMS až po zápisu: manažer nesmí číst o stopě, která v DB není. */
export async function zapisHospody(
  db: D1Database, t: TymHospody & { seasonNumber: number }, zapisy: readonly ZapisHospody[],
): Promise<void> {
  const prikazy: D1PreparedStatement[] = [];
  for (const z of zapisy) {
    switch (z.typ) {
      case "prozradil":
        prikazy.push(
          // Co svědek řekl v hospodě, se výslechem znovu najít nedá: jeho stopy nahradí stopa z hospody.
          db.prepare(
            `DELETE FROM club_incident_clues
              WHERE incident_id = ? AND holder_player_id = ? AND source IN ('svedek', 'kamarad', 'rival') AND found = 0`,
          ).bind(z.incidentId, z.svedekId),
          prikazStopyHospody(db, t.teamId, z.incidentId, `drb-${z.svedekId}`, z.stopa, t.gameDate),
          db.prepare(
            `UPDATE club_incident_knowledge SET interrogation = 'prozradil', interrogated_on = ?
              WHERE incident_id = ? AND player_id = ? AND team_id = ? AND role IN ('svedek', 'kamarad', 'rival') AND interrogation IS NULL`,
          ).bind(t.gameDate, z.incidentId, z.svedekId, t.teamId),
        );
        break;
      case "stopa":
        prikazy.push(prikazStopyHospody(db, t.teamId, z.incidentId, z.klic, z.stopa, t.gameDate));
        break;
      case "odhaleni":
        prikazy.push(db.prepare(
          `UPDATE club_incidents SET culprit_revealed = 1, deadline = ?
            WHERE id = ? AND team_id = ? AND culprit_revealed = 0 AND status IN ('otevreny', 'policie')`,
        ).bind(z.deadline, z.incidentId, t.teamId));
        break;
      case "drb":
        prikazy.push(...prikazyZnalosti(db, z.teamId, z.incidentId, t.seasonNumber, [z.znalost]));
        break;
      case "hrozi":
        // Bez odhalení: `culprit_revealed = 1` by z hráče udělalo odhaleného pachatele v zápase i tréninku (17a–17c).
        prikazy.push(
          db.prepare(
            `INSERT OR IGNORE INTO club_incidents
               (id, team_id, league_id, season_number, kind, category, status, severity, game_date, deadline,
                culprit_type, culprit_player_id, culprit_revealed, loss, text)
             VALUES (?, ?, ?, ?, ?, ?, 'hrozi', 1, ?, ?, 'hrac', ?, 0, '[]', ?)`,
          ).bind(
            z.cin.id, t.teamId, t.leagueId, t.seasonNumber, z.cin.kind, KATALOG_PODLE_KIND.get(z.cin.kind)?.category ?? "kradez",
            t.gameDate, z.cin.deadline, z.cin.playerId, z.cin.text,
          ),
          ...prikazyZnalosti(db, t.teamId, z.cin.id, t.seasonNumber, [z.cin.znalost]),
        );
        break;
      case "sms":
        break;
    }
  }
  if (prikazy.length > 0) {
    const zapsano = await db.batch(prikazy).then(() => true)
      .catch((e) => { logger.error({ module: M }, `následky hospody ${t.teamId}`, e); return false; });
    if (!zapsano) return;
  }

  for (const z of zapisy) {
    if (z.typ === "sms") {
      await sendSystemSMS(db, t.teamId, SMS_ROLE_HOSPODSKY, z.text, smsIncidentu(z.incidentId))
        .catch((e) => logger.warn({ module: M }, `SMS hospodského ${z.incidentId}`, e));
    } else if (z.typ === "hrozi") {
      const rng = createRng(seedFromString(`hospoda-sms|${z.cin.id}`));
      if (z.cin.posel) {
        await sendPlayerSMS(db, t.teamId, z.cin.posel, `${text(rng, "sms_ohlaseni_kamarad")} ${z.cin.text}`, smsIncidentu(z.cin.id))
          .catch((e) => logger.warn({ module: M }, `SMS kamaráda o ohlášeném činu ${z.cin.id}`, e));
      } else {
        await sendSystemSMS(db, t.teamId, SMS_ROLE_HOSPODSKY, `🍺 ${text(rng, "sms_ohlaseni_hospodsky")} ${z.cin.text}`, smsIncidentu(z.cin.id))
          .catch((e) => logger.warn({ module: M }, `SMS hospodského o ohlášeném činu ${z.cin.id}`, e));
      }
    }
  }
}
```

- [ ] **Step 4: Testy a typecheck**

Run: `cd apps/api && npx vitest run src/incidents/hospoda-db.test.ts src/incidents/hospoda.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/incidents/hospoda-db.ts apps/api/src/incidents/hospoda-db.test.ts
git commit -F - <<'EOF'
feat(incidenty): hospoda nacte kontext incidentu a zapise nasledky

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 4: Hospoda volá incidenty, trenér poslouchá, vůdce fanoušků vynadá zloději

**Files:**
- Modify: `apps/api/src/season/pub.ts`
- Modify: `apps/api/src/season/pub-fan-leaders.ts`
- Test: `apps/api/src/season/pub-incidenty.test.ts` (nový), `apps/api/src/season/pub-fan-leaders.test.ts`

**Interfaces:**
- Consumes (Task 2, 3): `TYPY_PRIBEHU`, `udalostiHospody`, `zapisHospody`.
- Produces:
  - `export interface PubAttendee`, `export interface PubEffect` (typ navíc `"vztah"`), `export interface PubIncident` (navíc `incidentId?: string`)
  - `export function zachovanePribehy(raw: string | undefined): PubIncident[]`
  - `export async function dopisDoHospody(db: D1Database, teamId: string, gameDate: string, attendees: PubAttendee[], incidents: PubIncident[]): Promise<void>` (admin v Tasku 7)
  - `export function scenaOIncidentu(v: VudceVHospode, zlodeji: ReadonlyArray<{ playerId: string; jmeno: string }>, opts: { roll: number; vyber: number } & TextOpts): HospodskaScena | null`

- [ ] **Step 1: Failing testy**

`apps/api/src/season/pub-incidenty.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { FalesnaD1, jakoD1 } from "../incidents/testovaci-d1";
import { dopisDoHospody, zachovanePribehy } from "./pub";

describe("příhody o incidentech v hospodě", () => {
  it("návštěva s trenérem převezme z dnešní session jen příhody o incidentech", () => {
    const raw = JSON.stringify([
      { type: "story", playerIds: [], text: "Historka.", effects: [] },
      { type: "chlubi_se", playerIds: ["p"], text: "Chlubil se.", effects: [], incidentId: "inc-1" },
      { type: "drby_o_incidentu", playerIds: ["s"], text: "Bez incidentu.", effects: [] },
    ]);
    expect(zachovanePribehy(raw).map((p) => p.type)).toEqual(["chlubi_se"]);
    expect(zachovanePribehy("rozbité")).toEqual([]);
    expect(zachovanePribehy(undefined)).toEqual([]);
  });

  it("admin dopíše příhodu do dnešní hospody, přisadí hosty a posune vztah k trenérovi", async () => {
    const pepa = { playerId: "s", firstName: "Pepa", lastName: "Kos", alcohol: 80, teamId: "tym-a", isVisitor: false };
    const karel = { playerId: "k", firstName: "Karel", lastName: "Vrba", alcohol: 40, teamId: "tym-a", isVisitor: false };
    const db = new FalesnaD1([
      { sql: /SELECT attendees, incidents FROM pub_sessions/, first: { attendees: JSON.stringify([pepa]), incidents: "[]" } },
      { sql: /FROM players WHERE id IN/, all: [{ id: "k", team_id: "tym-a", cond: 80, morale: 50 }] },
    ]);
    await dopisDoHospody(jakoD1(db), "tym-a", "2026-09-16", [pepa, karel], [{
      type: "stezuje_si_na_trenera", playerIds: ["s", "k"], text: "Stěžoval si.", incidentId: "inc-1",
      effects: [{ playerId: "k", type: "vztah", delta: -3, label: "−3 vztah k trenérovi" }],
    }]);
    const update = db.dotazy.find((d) => /UPDATE pub_sessions SET attendees/.test(d.sql));
    expect((JSON.parse(String(update?.params[0])) as Array<{ playerId: string }>).map((a) => a.playerId)).toEqual(["s", "k"]);
    expect((JSON.parse(String(update?.params[1])) as Array<{ type: string }>).map((i) => i.type)).toEqual(["stezuje_si_na_trenera"]);
    const vztah = db.davky.flat().find((d) => /coach_relationship/.test(d.sql));
    expect(vztah?.params).toEqual([-3, "k"]);
  });
});
```

Do `pub-fan-leaders.test.ts`: import rozšířit o `scenaOIncidentu`. Ve funkci `vzorek()` v `describe("čeština v hospodských větách")` za `scenaSTrenerem(vud({ heat: 10 }), 0.1, o),` přidat do pole `scenky`:

```ts
            scenaOIncidentu(vud({ radikalnost: 80 }), hrac, { roll: 0.1, vyber: 0, ...o }),
            scenaOIncidentu(vud({ radikalnost: 20 }), hrac, { roll: 0.1, vyber: 0, ...o }),
```

a na konec souboru:

```ts
describe("zloděj u stolu (spec incidentů 17h)", () => {
  const zlodej = [{ playerId: "p1", jmeno: "Franta Novák" }];

  it("vůdce odhalenému zloději vynadá, radikál ostřeji", () => {
    const ostry = scenaOIncidentu(v({ radikalnost: 80 }), zlodej, { roll: 0.1, vyber: 0, varianta: 0 });
    const mirny = scenaOIncidentu(v({ radikalnost: 20 }), zlodej, { roll: 0.1, vyber: 0, varianta: 0 });
    expect(ostry).toMatchObject({ type: "vudce_zlodej", playerIds: ["p1"] });
    expect(ostry?.text).toContain("Franta Novák");
    expect(mirny?.moraleDelta).toBeLessThan(0);
    expect(ostry!.moraleDelta).toBeLessThan(mirny!.moraleDelta);
  });

  it("bez zloděje nebo s vysokým hodem nic", () => {
    expect(scenaOIncidentu(v(), [], { roll: 0.1, vyber: 0 })).toBeNull();
    expect(scenaOIncidentu(v(), zlodej, { roll: 0.9, vyber: 0 })).toBeNull();
  });

  it("vůdkyně mluví v ženském rodě a věty se střídají", () => {
    const texty = new Set<string>();
    for (let varianta = 0; varianta < 10; varianta++) {
      const s = scenaOIncidentu(v({ radikalnost: 80, gender: "f" }), zlodej, { roll: 0.1, vyber: 0, varianta });
      expect(s?.text).not.toMatch(/\{|\}/);
      texty.add(s?.text ?? "");
    }
    expect(texty.size).toBeGreaterThanOrEqual(5);
  });
});
```

- [ ] **Step 2: Spustit, musí selhat**

Run: `cd apps/api && npx vitest run src/season/pub-incidenty.test.ts src/season/pub-fan-leaders.test.ts`
Expected: FAIL, `zachovanePribehy`, `dopisDoHospody` a `scenaOIncidentu` neexistují.

- [ ] **Step 3: `pub-fan-leaders.ts`**

Za pool `KLID` přidat (pravidla ze záhlaví sekce Texty: jméno jen jako podmět v 1. pádě, sloveso vůdce na `{l}`/`{a}`, žádné tvary od „jít" u vůdce):

```ts
const ZLODEJ_OSTRE: DistrictPool<string> = {
  core: [
    "{v} si stoupl{a} k výčepu a řekl{a} nahlas, co si tribuna myslí o zlodějích v dresu. {h} zíral do piva.",
    "{v} oznámil{a} celé hospodě, že se zlodějem u jednoho stolu pít nebude. {h} zaplatil a zmizel.",
    "{h} si chtěl objednat. {v} hospodskému řekl{a}, ať zlodějům nenalévá, a hospoda ztichla.",
    "{v} vytáhl{a} před celým lokálem, co se v klubu ztratilo. {h} u toho seděl a mlčel.",
    "{h} dlouho snášel pohledy od výčepu. {v} nakonec řekl{a} nahlas, co si všichni mysleli.",
  ],
};

const ZLODEJ_MIRNE: DistrictPool<string> = {
  core: [
    "{v} se zastavil{a} u stolu a jen řekl{a}, že kotel si pamatuje. {h} přikývl.",
    "{v} poslal{a} ke stolu vzkaz přes hospodského, že v dresu se nekrade. {h} ho dostal i s pivem.",
    "{h} se u výčepu dozvěděl, že tribuna o krádeži ví. {v} to řekl{a} klidně, ale jasně.",
    "{v} si přisedl{a} a zeptal{a} se, jestli to stálo za to. {h} neodpověděl.",
    "{v} zavrtěl{a} hlavou, když {h} vešel do hospody. Víc nebylo potřeba.",
  ],
};
```

Za funkci `scenaSTrenerem` přidat:

```ts
/**
 * Odhalený zloděj z kádru u stolu (spec incidentů 17h). Kotel mu to dá sežrat a trochu se mu
 * uleví. Hrdinové, kterým vůdce platí rundu, přibudou s pozitivními incidenty.
 */
export function scenaOIncidentu(
  v: VudceVHospode,
  zlodeji: ReadonlyArray<{ playerId: string; jmeno: string }>,
  opts: { roll: number; vyber: number } & TextOpts,
): HospodskaScena | null {
  if (zlodeji.length === 0 || opts.roll >= 0.6) return null;
  const zlodej = zlodeji[Math.abs(opts.vyber) % zlodeji.length];
  const ostry = v.radikalnost >= 55;
  return {
    type: "vudce_zlodej",
    text: veta(ostry ? ZLODEJ_OSTRE : ZLODEJ_MIRNE, v, opts, { v: v.jmeno, h: zlodej.jmeno }),
    playerIds: [zlodej.playerId],
    moraleDelta: ostry ? -6 : -3,
    fan: { groupId: v.groupId, leaderId: v.leaderId, mood: 0, heat: -2, sentiment: -1,
      duvod: "V hospodě si podal zloděje z kádru." },
  };
}
```

- [ ] **Step 4: `pub.ts` typy a efekty**

Na začátek (k ostatním importům):

```ts
import { TYPY_PRIBEHU } from "../incidents/hospoda";
import { udalostiHospody, zapisHospody } from "../incidents/hospoda-db";
```

`interface PubAttendee`, `interface PubEffect` a `interface PubIncident` změnit na `export interface …`. V `PubEffect` typ na `type: "condition" | "injury" | "morale" | "hangover" | "vztah";`. Do `PubIncident` za `effects: PubEffect[];` přidat:

```ts
  /** Příhoda o incidentu v klubu (spec incidentů, Část 9). Deník podle něj ukáže odkaz. */
  incidentId?: string;
```

V `applyIncidentEffects` za větev `else if (ef.type === "injury" …) { … }` přidat:

```ts
      } else if (ef.type === "vztah" && ef.delta != null) {
        stmts.push(db.prepare(
          `UPDATE players SET coach_relationship = MAX(0, MIN(100, COALESCE(coach_relationship, 50) + ?)) WHERE id = ?`,
        ).bind(ef.delta, ef.playerId));
      }
```

(tj. poslední `}` větve `injury` se nahradí tímto blokem, který končí `}`).

Nad `function pickRandom` přidat:

```ts
function poleZJson<T>(raw: string | null | undefined, co: string): T[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? (v as T[]) : [];
  } catch (e) {
    logger.warn({ module: "pub" }, `nečitelný JSON (${co})`, e);
    return [];
  }
}

/**
 * Příhody o incidentech z dnešní session. Návštěva s trenérem je převezme beze změny:
 * stopy a SMS se už zapsaly a dopady proběhly, znovu se nesmí (spec incidentů 9).
 */
export function zachovanePribehy(raw: string | undefined): PubIncident[] {
  return poleZJson<PubIncident>(raw, "dnešní příhody")
    .filter((i) => typeof i?.incidentId === "string" && (TYPY_PRIBEHU as readonly string[]).includes(i.type));
}

/**
 * Přidá příhody a jejich účastníky do dnešní session a provede dopady.
 * Jen pro admin ověření incidentů v hospodě na testingu (`POST /api/admin/incidents/hospoda`).
 */
export async function dopisDoHospody(
  db: D1Database, teamId: string, gameDate: string, attendees: PubAttendee[], incidents: PubIncident[],
): Promise<void> {
  const dnesni = await db.prepare("SELECT attendees, incidents FROM pub_sessions WHERE team_id = ? AND game_date = ?")
    .bind(teamId, gameDate).first<{ attendees: string; incidents: string }>()
    .catch((e) => { logger.warn({ module: "pub" }, "dnešní session pro admin příhody", e); return null; });
  if (dnesni) {
    const sedi = poleZJson<PubAttendee>(dnesni.attendees, "návštěvníci");
    const uzSedi = new Set(sedi.map((a) => a.playerId));
    await db.prepare("UPDATE pub_sessions SET attendees = ?, incidents = ? WHERE team_id = ? AND game_date = ?")
      .bind(
        JSON.stringify([...sedi, ...attendees.filter((a) => !uzSedi.has(a.playerId))]),
        JSON.stringify([...poleZJson<PubIncident>(dnesni.incidents, "příhody"), ...incidents]),
        teamId, gameDate,
      ).run()
      .catch((e) => logger.warn({ module: "pub" }, "doplnění dnešní session", e));
  } else {
    await db.prepare("INSERT INTO pub_sessions (team_id, game_date, attendees, incidents, daily_special) VALUES (?, ?, ?, ?, NULL)")
      .bind(teamId, gameDate, JSON.stringify(attendees), JSON.stringify(incidents)).run()
      .catch((e) => logger.warn({ module: "pub" }, "session pro admin příhody", e));
  }
  const stmts = await applyIncidentEffects(db, incidents);
  if (stmts.length > 0) await db.batch(stmts).catch((e) => logger.warn({ module: "pub" }, "dopady admin příhod", e));
}
```

- [ ] **Step 5: Denní session**

V `generatePubSessionsForAllTeams` nahradit:

```ts
    // Generate incidents
    const incidents = generateIncidents(attendees, rivalsMap, buddiesMap, coachName, team.district ?? undefined, hangoverMod);

    // Vůdci fanoušků. Hospoda je jediné místo, kde se v okrese potkává kabina
    // s tribunou, takže se tam potkat musí i v číslech: hráči si odnesou
    // morálku, parta náladu a vůdce vztah k trenérovi.
    const fanStmts = await pridejVudceDoHospody(db, team.id, gameDate, attendees, incidents, team.district ?? undefined);
```

za:

```ts
    // Generate incidents
    const incidents = generateIncidents(attendees, rivalsMap, buddiesMap, coachName, team.district ?? undefined, hangoverMod);

    // Incidenty v klubu: drby, chlubení, ohlášené činy (spec incidentů, Část 9). Nikdy nehází.
    const hospoda = await udalostiHospody(db, { teamId: team.id, leagueId: team.league_id, gameDate }, attendees, { trener: false, jiste: false });
    incidents.push(...hospoda.pribehy);

    // Vůdci fanoušků. Hospoda je jediné místo, kde se v okrese potkává kabina
    // s tribunou, takže se tam potkat musí i v číslech: hráči si odnesou
    // morálku, parta náladu a vůdce vztah k trenérovi.
    const fanStmts = await pridejVudceDoHospody(db, team.id, gameDate, attendees, incidents, team.district ?? undefined, hospoda.zlodeji);
```

a za `if (vsechny.length > 0) await db.batch(vsechny)…;` přidat:

```ts
    if (hospoda.seasonNumber !== null) {
      await zapisHospody(db, { teamId: team.id, leagueId: team.league_id, gameDate, seasonNumber: hospoda.seasonNumber }, hospoda.zapisy);
    }
```

- [ ] **Step 6: Návštěva s trenérem**

V `createCoachLedSession` dotaz na okres rozšířit o ligu:

```ts
  const districtRow = await db.prepare(
    "SELECT v.district, t.league_id FROM teams t LEFT JOIN villages v ON t.village_id = v.id WHERE t.id = ?",
  ).bind(teamId).first<{ district: string | null; league_id: string | null }>()
    .catch((e) => { logger.warn({ module: "pub" }, "load district for coach-led", e); return null; });
```

Před komentář `// Idempotentně: pokud už dnes existuje (emergent), přepiš ji coach-led variantou.` vložit:

```ts
  // Trenér poslouchá (spec incidentů 9): drby padají s dvojnásobnou šancí. Co dnes o incidentech
  // už zaznělo, zůstane v deníku a nezopakuje se: stopy, SMS i dopady se už zapsaly.
  const dnesni = await db.prepare("SELECT incidents FROM pub_sessions WHERE team_id = ? AND game_date = ?")
    .bind(teamId, gameDate).first<{ incidents: string }>()
    .catch((e) => { logger.warn({ module: "pub" }, "dnešní session před návštěvou s trenérem", e); return null; });
  const zachovane = zachovanePribehy(dnesni?.incidents);
  const hospoda = await udalostiHospody(db, { teamId, leagueId: districtRow?.league_id ?? null, gameDate }, attendees, {
    trener: true, jiste: false, uzZaznelo: new Set(zachovane.map((i) => `${i.type}|${i.incidentId}`)),
  });
  incidents.push(...hospoda.pribehy);
```

V `INSERT INTO pub_sessions` téže funkce nahradit `JSON.stringify(incidents)` za `JSON.stringify([...incidents, ...zachovane])`. `applyIncidentEffects(db, incidents)` zůstává jen nad novými příhodami. Za `if (effectStmts.length > 0) await db.batch(effectStmts)…;` přidat:

```ts
  if (hospoda.seasonNumber !== null) {
    await zapisHospody(db, { teamId, leagueId: districtRow?.league_id ?? null, gameDate, seasonNumber: hospoda.seasonNumber }, hospoda.zapisy);
  }
```

- [ ] **Step 7: Vůdci v hospodě**

Podpis `pridejVudceDoHospody` rozšířit o poslední parametr:

```ts
  okres?: string,
  zlodeji: ReadonlyArray<{ playerId: string; jmeno: string }> = [],
): Promise<D1PreparedStatement[]> {
```

V destrukturaci importu přidat `scenaOIncidentu`:

```ts
    const { dorazilDoHospody, scenaSVudcem, scenaSTrenerem, scenaOZapase, scenaOIncidentu } = await import("./pub-fan-leaders");
```

Za blok `const kandidati: Array<HospodskaScena | null> = trenerJeTu ? … : [ … ];` přidat (nové hody se táhnou až po stávajících, ať se stávajícím scénám nezmění čísla z generátoru):

```ts
      // Zloděj u stolu má přednost před rozborem zápasu (spec incidentů 17h).
      if (!trenerJeTu && zlodeji.length > 0) {
        kandidati.unshift(scenaOIncidentu(v, zlodeji, { roll: rng.random(), vyber: rng.int(0, 999), ...text }));
      }
```

- [ ] **Step 8: Testy a typecheck**

Run: `cd apps/api && npx vitest run src/season src/incidents && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/season/pub.ts apps/api/src/season/pub-fan-leaders.ts apps/api/src/season/pub-incidenty.test.ts apps/api/src/season/pub-fan-leaders.test.ts
git commit -F - <<'EOF'
feat(incidenty): hospoda mluvi o incidentech, trener posloucha, vudce vynada zlodeji

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 5: Hrozící čin po lhůtě

**Files:**
- Modify: `apps/api/src/incidents/dopady.ts`
- Create: `apps/api/src/incidents/hrozi.ts`, `apps/api/src/incidents/hrozi-db.ts`
- Modify: `apps/api/src/incidents/denni-krok.ts`
- Test: `apps/api/src/incidents/dopady.test.ts`, `apps/api/src/incidents/hrozi.test.ts` (nový), `apps/api/src/incidents/hrozi-db.test.ts` (nový)

**Interfaces:**
- Consumes (Task 1): `CINY_HRACE`, `cinHrace`, `prikazStopyHospody`, konstanty `HROZI_*`, klíče `hrozi_splnil`, `hrozi_nestalo_se`, `stopa_hospoda_ohlasil`. Existující: `nactiIncidentniAbsence`, `oznamIncident`, `prikazyZnalosti`, `smsIncidentu`, `sendSystemSMS`.
- Produces:
  - `zapisIncident(db, stav, navrh, id?, opts?: { zHroziciho?: boolean }): Promise<ZapsanyIncident | null>`
  - `hrozi.ts`: `interface OkolnostiHroziciho { promluvil: boolean; vztahKTrenerovi: number; kind: string; zabezpeceni: number; nepritomen: boolean }`, `sanceHroziciho(o): number` (0–100), `promluvil(resolutionData: string | null): boolean`
  - `hrozi-db.ts`: `vyhodnotHrozici(env: Bindings, stav: StavKlubu): Promise<number>` (kolik činů se stalo), `zaznamenejPromluvu(db, o: { teamId; incidentId; playerId; den }): Promise<boolean>`

- [ ] **Step 1: Failing testy**

Do `dopady.test.ts` na konec:

```ts
describe("hrozící čin se stane (spec 9a)", () => {
  it("přechod ze stavu hrozi místo nového řádku a znalosti hrozby se nahradí znalostmi činu", async () => {
    const db = new FalesnaD1([{ sql: /FROM staff_members/, first: { usudek: null } }]);
    const stav = stavKlubu({ kadr: [PROBLEMOVY], vybaveni: { jerseys: 2, jerseys_condition: 70 } });
    const zapsany = await zapisIncident(jakoD1(db), stav, { ...NAVRH, culpritRevealed: true }, "inc-h", { zHroziciho: true });
    expect(zapsany).toMatchObject({ id: "inc-h", odhalen: true });
    expect(db.pocet(/INSERT OR IGNORE INTO club_incidents/)).toBe(0);
    const prechod = db.dotazy.find((d) => /UPDATE club_incidents SET category = \?/.test(d.sql));
    expect(prechod?.sql).toContain("status = 'hrozi'");
    expect(prechod?.params.slice(-2)).toEqual(["inc-h", "tym-a"]);
    const smazani = db.dotazy.find((d) => /DELETE FROM club_incident_knowledge/.test(d.sql));
    expect(smazani?.params).toEqual(["inc-h"]);
    expect(db.davky.some((b) => b.some((d) => /INSERT OR IGNORE INTO club_incident_knowledge/.test(d.sql)))).toBe(true);
  });

  it("už vyhodnocený hrozící čin se nezapíše; bez škody skončí jako nestalo se, ne bez škody", async () => {
    const hotovo = new FalesnaD1([{ sql: /UPDATE club_incidents SET category = \?/, changes: 0 }]);
    expect(await zapisIncident(jakoD1(hotovo), stavKlubu(), NAVRH, "inc-h", { zHroziciho: true })).toBeNull();
    expect(hotovo.pocet(/UPDATE equipment/)).toBe(0);
    expect(hotovo.pocet(/DELETE FROM club_incident_knowledge/)).toBe(0);

    const bezSkody = new FalesnaD1([{ sql: /UPDATE equipment SET/, changes: 0 }]);
    expect(await zapisIncident(jakoD1(bezSkody), stavKlubu({ vybaveni: { jerseys: 2 } }), NAVRH, "inc-h", { zHroziciho: true })).toBeNull();
    expect(bezSkody.dotazy.find((d) => /SET status = 'uzavreny'/.test(d.sql))?.params[0]).toBe("nestalo_se");
  });
});
```

`apps/api/src/incidents/hrozi.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { promluvil, sanceHroziciho } from "./hrozi";

const ZAKLAD = { promluvil: false, vztahKTrenerovi: 50, kind: "vitrina", zabezpeceni: 0, nepritomen: false };

describe("šance, že hráč ohlášený čin udělá (spec 9a)", () => {
  it("výchozí 50 %", () => {
    expect(sanceHroziciho(ZAKLAD)).toBe(50);
  });

  it("rozhovor ubere 30 + vztah k trenérovi / 5", () => {
    expect(sanceHroziciho({ ...ZAKLAD, promluvil: true })).toBe(10);
    expect(sanceHroziciho({ ...ZAKLAD, promluvil: true, vztahKTrenerovi: 100 })).toBe(0);
    expect(sanceHroziciho({ ...ZAKLAD, promluvil: true, vztahKTrenerovi: 0 })).toBe(20);
  });

  it("zabezpečení pomáhá jen u skladu", () => {
    expect(sanceHroziciho({ ...ZAKLAD, kind: "vloupani_sklad", zabezpeceni: 1 })).toBe(35);
    expect(sanceHroziciho({ ...ZAKLAD, zabezpeceni: 3 })).toBe(50);
  });

  it("zraněný nebo nepřítomný nic neudělá", () => {
    expect(sanceHroziciho({ ...ZAKLAD, nepritomen: true })).toBe(0);
  });
});

describe("rozhovor v datech incidentu", () => {
  it("promluvil jen s vyplněným dnem, rozbitý JSON nevadí", () => {
    expect(promluvil(null)).toBe(false);
    expect(promluvil("{}")).toBe(false);
    expect(promluvil(JSON.stringify({ promluvil: "2026-09-17" }))).toBe(true);
    expect(promluvil("rozbité")).toBe(false);
  });
});
```

`apps/api/src/incidents/hrozi-db.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../messaging/system-sms", () => ({ sendSystemSMS: vi.fn(async () => undefined) }));
vi.mock("../community/notifications", () => ({ createNotification: vi.fn(async () => undefined) }));

import { createRng } from "../generators/rng";
import type { Bindings } from "../index";
import { seedFromString } from "../lib/seed";
import { sendSystemSMS } from "../messaging/system-sms";
import { vyhodnotHrozici, zaznamenejPromluvu } from "./hrozi-db";
import { FalesnaD1, jakoD1, type Pravidlo } from "./testovaci-d1";
import { hrac, stavKlubu } from "./testovaci-stav";

const DNES = "2026-09-18T16:00:00.000Z";
const FRANTA = hrac({ id: "p", jmeno: "Franta Novák", vztahKTrenerovi: 50 });
const STAV = stavKlubu({ gameDate: DNES, den: "2026-09-18", kadr: [FRANTA], vybaveni: { jerseys: 2, jerseys_condition: 70 } });

/** Id hrozícího činu, jehož los (první číslo seedu × 100) padne do [od, do). */
function idSLosem(od: number, do_: number): string {
  for (let n = 0; ; n++) {
    const id = `inc-h${n}`;
    const los = createRng(seedFromString(`hrozi|${id}`)).random() * 100;
    if (los >= od && los < do_) return id;
  }
}

const radek = (id: string, o: Record<string, unknown> = {}) => ({
  id, kind: "vloupani_sklad", culprit_player_id: "p", resolution_data: null, first_name: "Franta", last_name: "Novák", ...o,
});

function prostredi(r: Record<string, unknown>, dalsi: Pravidlo[] = []) {
  const db = new FalesnaD1([
    ...dalsi,
    { sql: /i\.status = 'hrozi' AND i\.deadline <= \?/, all: [r] },
    { sql: /FROM club_incident_absences/, all: [] },
    { sql: /FROM injuries/, all: [] },
    { sql: /FROM staff_members/, first: { usudek: null } },
  ]);
  return { db, env: { DB: jakoD1(db) } as unknown as Bindings };
}

beforeEach(() => vi.clearAllMocks());

describe("hrozící čin po lhůtě", () => {
  it("když los vyjde, čin se stane jako skutečný incident se stopou z hospody", async () => {
    const id = idSLosem(0, 50);
    const { db, env } = prostredi(radek(id));
    expect(await vyhodnotHrozici(env, STAV)).toBe(1);
    expect(db.pocet(/INSERT OR IGNORE INTO club_incidents/)).toBe(0);
    expect(db.dotazy.find((d) => /UPDATE club_incidents SET category = \?/.test(d.sql))?.sql).toContain("status = 'hrozi'");
    expect(db.pocet(/UPDATE equipment SET jerseys/)).toBe(1);
    expect(db.davky.flat().some((d) => d.params[0] === `${id}-hospoda-ohlasil`)).toBe(true);
    expect(sendSystemSMS).toHaveBeenCalledWith(expect.anything(), "tym-a", "Kustod", expect.stringContaining("Franta Novák"), { type: "incident", incidentId: id });
  });

  it("rozhovor s dobrým vztahem šanci srazí: los, který by jinak vyšel, skončí vystřízlivěním", async () => {
    // Bez rozhovoru 50 %, po rozhovoru při vztahu 50 jen 10 %.
    const id = idSLosem(10, 50);
    const { db, env } = prostredi(radek(id, { resolution_data: JSON.stringify({ promluvil: "2026-09-17" }) }));
    expect(await vyhodnotHrozici(env, STAV)).toBe(0);
    expect(db.pocet(/UPDATE equipment/)).toBe(0);
    expect(db.dotazy.find((d) => /resolution = 'nestalo_se'/.test(d.sql))?.sql).toContain("status = 'hrozi'");
    const znalosti = db.davky.flat().filter((d) => /club_incident_knowledge/.test(d.sql));
    expect(znalosti.map((d) => d.params[3])).toEqual(["kadr"]);
    expect(sendSystemSMS).toHaveBeenCalledWith(expect.anything(), "tym-a", "Kustod", expect.stringContaining("Franta Novák"), { type: "incident", incidentId: id });
  });

  it("zraněný hráč ani hráč, který z klubu odešel, nic neudělá", async () => {
    const id = idSLosem(0, 1);
    const zraneny = prostredi(radek(id), [{ sql: /FROM injuries/, all: [{ player_id: "p" }] }]);
    expect(await vyhodnotHrozici(zraneny.env, STAV)).toBe(0);
    expect(zraneny.db.pocet(/UPDATE equipment/)).toBe(0);
    const odesel = prostredi(radek(id));
    expect(await vyhodnotHrozici(odesel.env, { ...STAV, kadr: [] })).toBe(0);
    expect(odesel.db.pocet(/resolution = 'nestalo_se'/)).toBe(1);
  });

  it("už vyhodnocený čin (souběh) se neoznámí znovu", async () => {
    const { env } = prostredi(radek(idSLosem(50, 100)), [{ sql: /resolution = 'nestalo_se'/, changes: 0 }]);
    expect(await vyhodnotHrozici(env, STAV)).toBe(0);
    expect(sendSystemSMS).not.toHaveBeenCalled();
  });
});

describe("rozhovor o hrozbě", () => {
  it("zapíše se jen k hrozícímu činu toho hráče", async () => {
    const db = new FalesnaD1();
    expect(await zaznamenejPromluvu(jakoD1(db), { teamId: "tym-a", incidentId: "inc-h", playerId: "p", den: "2026-09-17" })).toBe(true);
    expect(db.dotazy[0].sql).toContain("status = 'hrozi' AND culprit_player_id = ?");
    expect(db.dotazy[0].params).toEqual(["2026-09-17", "inc-h", "tym-a", "p"]);
    const jinyHrac = new FalesnaD1([{ sql: /UPDATE club_incidents/, changes: 0 }]);
    expect(await zaznamenejPromluvu(jakoD1(jinyHrac), { teamId: "tym-a", incidentId: "inc-h", playerId: "x", den: "2026-09-17" })).toBe(false);
  });
});
```

- [ ] **Step 2: Spustit, musí selhat**

Run: `cd apps/api && npx vitest run src/incidents/dopady.test.ts src/incidents/hrozi.test.ts src/incidents/hrozi-db.test.ts`
Expected: FAIL, `hrozi.ts` a `hrozi-db.ts` neexistují, `zapisIncident` neumí `zHroziciho`.

- [ ] **Step 3: `dopady.ts`**

Podpis a začátek `zapisIncident`:

```ts
/**
 * Zapíše incident, teprve potom provede škody a nakonec zapíše stopy.
 *
 * Vrací `null`, když incident už existoval (opakované zpracování dne)
 * nebo se žádná škoda nepovedla (vybavení mezitím prodáno, zařízení už na nule).
 * `zHroziciho`: čin ohlášený v hospodě (spec 9a) se stal. Záznam už existuje ve stavu `hrozi`
 * a přepíše se hlídaným UPDATE, znalosti hrozby se nahradí znalostmi činu.
 */
export async function zapisIncident(
  db: D1Database,
  stav: StavKlubu,
  navrh: NavrhIncidentu,
  id: string = idIncidentu(stav.teamId, navrh.kind, stav.den),
  opts: { zHroziciho?: boolean } = {},
): Promise<ZapsanyIncident | null> {
  const deadline = navrh.status === "otevreny" ? gameExpiry(stav.gameDate, LHUTA_ROZHODNUTI_DNI) : null;
  const resolvedOn = navrh.status === "uzavreny" ? stav.gameDate : null;

  const vlozeno = opts.zHroziciho
    ? await db.prepare(
      `UPDATE club_incidents SET category = ?, status = ?, severity = ?, game_date = ?, deadline = ?,
          culprit_type = ?, culprit_player_id = ?, culprit_revealed = ?, loss = ?, text = ?, resolved_on = ?
        WHERE id = ? AND team_id = ? AND status = 'hrozi'`,
    ).bind(
      navrh.category, navrh.status, navrh.severity, stav.gameDate, deadline, navrh.culpritType, navrh.culpritPlayerId,
      navrh.culpritRevealed ? 1 : 0, JSON.stringify(navrh.ztraty), navrh.text, resolvedOn, id, stav.teamId,
    ).run().catch((e) => { logger.error({ module: M }, `přechod hrozícího incidentu ${id}`, e); return null; })
    : await db.prepare(
      `INSERT OR IGNORE INTO club_incidents
         (id, team_id, league_id, season_number, kind, category, status, severity, game_date, deadline,
          culprit_type, culprit_player_id, culprit_revealed, loss, text, resolved_on)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id, stav.teamId, stav.leagueId, stav.seasonNumber, navrh.kind, navrh.category, navrh.status,
      navrh.severity, stav.gameDate, deadline, navrh.culpritType, navrh.culpritPlayerId,
      navrh.culpritRevealed ? 1 : 0, JSON.stringify(navrh.ztraty), navrh.text, resolvedOn,
    ).run().catch((e) => { logger.error({ module: M }, `zápis incidentu ${id}`, e); return null; });
  if ((vlozeno?.meta?.changes ?? 0) === 0) return null;

  if (opts.zHroziciho) {
    // „V hospodě jsi vykládal…" už neplatí, čin se stal: znalosti se zapíšou znovu podle činu.
    await db.prepare("DELETE FROM club_incident_knowledge WHERE incident_id = ?").bind(id).run()
      .catch((e) => logger.warn({ module: M }, `znalosti hrozby ${id}`, e));
  }
```

Zbytek funkce beze změny až na uzavření bez škody:

```ts
  if (provedene.length === 0) {
    // Hrozící čin, který nakonec nic nerozbil, se nestal. Obyčejný incident je bez škody (v přehledu skrytý).
    await db.prepare("UPDATE club_incidents SET status = 'uzavreny', resolution = ?, resolved_on = ?, loss = '[]' WHERE id = ?")
      .bind(opts.zHroziciho ? "nestalo_se" : "bez_skody", stav.gameDate, id).run()
      .catch((e) => logger.warn({ module: M }, `uzavření incidentu bez škody ${id}`, e));
    return null;
  }
```

- [ ] **Step 4: `apps/api/src/incidents/hrozi.ts`**

```ts
/**
 * Hrozící čin z opileckých řečí po lhůtě (spec 9a). Čisté funkce.
 */

import { logger } from "../lib/logger";
import { HROZI_PROMLUVA, HROZI_PROMLUVA_VZTAH_DELITEL, HROZI_ZABEZPECENI, HROZI_ZAKLAD } from "./nastaveni";

export interface OkolnostiHroziciho {
  /** Trenér si s hráčem promluvil (`resolution_data.promluvil`). */
  promluvil: boolean;
  vztahKTrenerovi: number;
  kind: string;
  /** Úroveň zabezpečení areálu. */
  zabezpeceni: number;
  /** V den činu je na incidentní absenci nebo zraněný. */
  nepritomen: boolean;
}

/** Šance v procentech (0–100), že hráč ohlášený čin opravdu udělá. */
export function sanceHroziciho(o: OkolnostiHroziciho): number {
  let sance = HROZI_ZAKLAD;
  if (o.promluvil) sance -= HROZI_PROMLUVA + o.vztahKTrenerovi / HROZI_PROMLUVA_VZTAH_DELITEL;
  if (o.kind === "vloupani_sklad" && o.zabezpeceni >= 1) sance -= HROZI_ZABEZPECENI;
  if (o.nepritomen) sance -= 100;
  return Math.max(0, Math.min(100, sance));
}

/** Promluvil si trenér s hráčem? V datech incidentu je den rozhovoru. */
export function promluvil(resolutionData: string | null): boolean {
  if (!resolutionData) return false;
  try {
    const v = JSON.parse(resolutionData) as { promluvil?: unknown };
    return typeof v.promluvil === "string" && v.promluvil !== "";
  } catch (e) {
    logger.warn({ module: "incidents-hrozi" }, "nečitelná data hrozícího činu", e);
    return false;
  }
}
```

- [ ] **Step 5: `apps/api/src/incidents/hrozi-db.ts`**

```ts
/**
 * Hrozící čin v DB (spec 9a): vyhodnocení po lhůtě v denním kroku a záznam rozhovoru s hráčem.
 */

import { createRng } from "../generators/rng";
import type { Bindings } from "../index";
import { gameExpiry } from "../lib/game-time";
import { logger } from "../lib/logger";
import { seedFromString } from "../lib/seed";
import { sendSystemSMS } from "../messaging/system-sms";
import { nactiIncidentniAbsence } from "./absence-hracu";
import { oznamIncident, zapisIncident } from "./dopady";
import { promluvil, sanceHroziciho } from "./hrozi";
import { smsIncidentu } from "./incident-db";
import { CINY_HRACE, cinHrace } from "./katalog";
import { HROZI_NESTALO_SE_DNI, SMS_ROLE_KUSTOD } from "./nastaveni";
import { prikazStopyHospody } from "./stopy-db";
import { text } from "./texty";
import type { StavKlubu } from "./typy";
import { prikazyZnalosti } from "./znalosti-db";

const M = "incidents-hrozi";

type RadekHroziciho = {
  id: string; kind: string; culprit_player_id: string | null; resolution_data: string | null;
  first_name: string | null; last_name: string | null;
};

/**
 * Hrozící činy, kterým vypršela lhůta: buď se stanou (skutečná škoda, pachatel známý, stopa z hospody),
 * nebo hráč vystřízliví. Vrací, kolik se jich stalo; denní krok pak nový problém nelosuje.
 */
export async function vyhodnotHrozici(env: Bindings, stav: StavKlubu): Promise<number> {
  const db = env.DB;
  const rows = await db.prepare(
    `SELECT i.id, i.kind, i.culprit_player_id, i.resolution_data,
            COALESCE(p.first_name, d.first_name) AS first_name, COALESCE(p.last_name, d.last_name) AS last_name
       FROM club_incidents i
       LEFT JOIN players p ON p.id = i.culprit_player_id
       LEFT JOIN departed_players d ON d.id = i.culprit_player_id
      WHERE i.team_id = ? AND i.status = 'hrozi' AND i.deadline <= ?`,
  ).bind(stav.teamId, stav.gameDate).all<RadekHroziciho>()
    .catch((e) => { logger.warn({ module: M }, `hrozící činy ${stav.teamId}`, e); return null; });
  if (!rows || rows.results.length === 0) return 0;

  const absence = await nactiIncidentniAbsence(db, stav.teamId, stav.den);
  const zraneni = await db.prepare("SELECT DISTINCT player_id FROM injuries WHERE team_id = ? AND days_remaining > 0")
    .bind(stav.teamId).all<{ player_id: string }>()
    .catch((e) => { logger.warn({ module: M }, `zranění ${stav.teamId}`, e); return { results: [] as Array<{ player_id: string }> }; });
  const zraneny = new Set(zraneni.results.map((r) => r.player_id));

  let stalo = 0;
  for (const r of rows.results) {
    const rng = createRng(seedFromString(`hrozi|${r.id}`));
    // První číslo z generátoru je los, na tom stojí determinismus i testy.
    const los = rng.random();
    const hrac = stav.kadr.find((h) => h.id === r.culprit_player_id) ?? null;
    const kind = CINY_HRACE.find((k) => k === r.kind) ?? null;
    const sance = hrac && kind ? sanceHroziciho({
      promluvil: promluvil(r.resolution_data), vztahKTrenerovi: hrac.vztahKTrenerovi, kind,
      zabezpeceni: stav.vybaveni.area_security ?? 0, nepritomen: absence.has(hrac.id) || zraneny.has(hrac.id),
    }) : 0;
    const navrh = hrac && kind && los * 100 < sance ? cinHrace(kind, stav, hrac, rng) : null;

    if (hrac && navrh) {
      const cin = { ...navrh, text: `${text(rng, "hrozi_splnil", { hrac: hrac.jmeno })} ${navrh.text}` };
      const zapsany = await zapisIncident(db, stav, cin, r.id, { zHroziciho: true });
      if (!zapsany) continue;
      await db.batch([prikazStopyHospody(db, stav.teamId, r.id, "ohlasil", {
        zdroj: "hospoda", ukazujeNa: hrac.id, podezreli: null, drzitel: null, sila: 3, bonusPolicie: 0,
        text: text(rng, "stopa_hospoda_ohlasil", { hrac: hrac.jmeno }), nalezena: true,
      }, stav.gameDate)]).catch((e) => logger.warn({ module: M }, `stopa ohlášeného činu ${r.id}`, e));
      await oznamIncident(env, stav.teamId, cin, zapsany);
      stalo++;
      continue;
    }

    const uzavreno = await db.prepare(
      "UPDATE club_incidents SET status = 'uzavreny', resolution = 'nestalo_se', resolved_on = ? WHERE id = ? AND status = 'hrozi'",
    ).bind(stav.gameDate, r.id).run()
      .catch((e) => { logger.error({ module: M }, `uzavření hrozícího činu ${r.id}`, e); return null; });
    if ((uzavreno?.meta?.changes ?? 0) === 0) continue;

    const jmeno = [r.first_name, r.last_name].filter(Boolean).join(" ") || "Hráč z kádru";
    const fakt = text(rng, "hrozi_nestalo_se", { hrac: jmeno });
    // Kádr týden ví, že to byly jen řeči (spec 9a).
    const until = gameExpiry(stav.gameDate, HROZI_NESTALO_SE_DNI);
    if (stav.kadr.length > 0) {
      await db.batch(prikazyZnalosti(db, stav.teamId, r.id, stav.seasonNumber,
        stav.kadr.map((h) => ({ playerId: h.id, role: "kadr" as const, fact: fakt, ochota: 50, until }))))
        .catch((e) => logger.warn({ module: M }, `znalost nesplněné hrozby ${r.id}`, e));
    }
    await sendSystemSMS(db, stav.teamId, SMS_ROLE_KUSTOD, `🍺 ${fakt}`, smsIncidentu(r.id))
      .catch((e) => logger.warn({ module: M }, `SMS nesplněné hrozby ${r.id}`, e));
  }
  return stalo;
}

/** Trenér mluví s hráčem, který čin ohlásil. `true`, když hrozba je jeho a pořád trvá. */
export async function zaznamenejPromluvu(
  db: D1Database, o: { teamId: string; incidentId: string; playerId: string; den: string },
): Promise<boolean> {
  const r = await db.prepare(
    `UPDATE club_incidents SET resolution_data = json_set(
        CASE WHEN json_valid(resolution_data) THEN resolution_data ELSE '{}' END, '$.promluvil', ?)
      WHERE id = ? AND team_id = ? AND status = 'hrozi' AND culprit_player_id = ?`,
  ).bind(o.den, o.incidentId, o.teamId, o.playerId).run()
    .catch((e) => { logger.warn({ module: M }, `rozhovor o hrozbě ${o.incidentId}`, e); return null; });
  return (r?.meta?.changes ?? 0) > 0;
}
```

- [ ] **Step 6: `denni-krok.ts`**

Import `import { vyhodnotHrozici } from "./hrozi-db";`. Za `if (!stav) return;` vložit:

```ts
  // Činy ohlášené v hospodě, kterým vypršela lhůta (spec 9a). Stal-li se některý, dnes se nový problém nelosuje.
  const splneno = await vyhodnotHrozici(env, stav)
    .catch((e) => { logger.warn({ module: M, teamId }, "hrozící činy", e); return 0; });
  if (splneno > 0) return;
```

- [ ] **Step 7: Testy a typecheck**

Run: `cd apps/api && npx vitest run src/incidents && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/incidents/dopady.ts apps/api/src/incidents/dopady.test.ts apps/api/src/incidents/hrozi.ts apps/api/src/incidents/hrozi.test.ts apps/api/src/incidents/hrozi-db.ts apps/api/src/incidents/hrozi-db.test.ts apps/api/src/incidents/denni-krok.ts
git commit -F - <<'EOF'
feat(incidenty): hrozici cin z hospody se po lhute stane nebo hrac vystrizlivi

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 6: Rozhovor s hráčem, který čin ohlásil, a prompt

**Files:**
- Modify: `apps/api/src/incidents/tema.ts`, `apps/api/src/incidents/zprava-trenera.ts`, `apps/api/src/incidents/akce.ts`, `apps/api/src/incidents/znalosti.ts`
- Test: `apps/api/src/incidents/tema.test.ts`, `apps/api/src/incidents/zprava-trenera.test.ts`, `apps/api/src/incidents/akce-zeptat.test.ts`, `apps/api/src/incidents/znalosti.test.ts`

**Interfaces:**
- Consumes (Task 5): `zaznamenejPromluvu`.
- Produces:
  - `jeRecOHrozicim(textZpravy: string, kind: string): boolean` (tema.ts)
  - `promluvSi(env: Bindings, teamId: string, incidentId: string): Promise<VysledekAkce<{ conversationId: string }>>` (akce.ts)
  - `zpracujZpravuTrenera` vrací u hrozícího činu `{ incidentId, vyslech: null }`

- [ ] **Step 1: Failing testy**

Do `tema.test.ts`: import rozšířit o `jeRecOHrozicim` a na konec:

```ts
describe("řeči z hospody (spec 9a)", () => {
  it.each([
    "Co to bylo včera v hospodě za řeči?",
    "Slyšel jsem, co jsi vykládal.",
    "Neblbni, jo?",
    "Ke skladu ani nechoď.",
  ])("%s", (zprava) => {
    expect(jeRecOHrozicim(zprava, "vloupani_sklad")).toBe(true);
  });

  it.each(["Zdar, jak se máš?", "Zítra trénink v šest.", "Dobrý gól včera."])("běžná zpráva: %s", (zprava) => {
    expect(jeRecOHrozicim(zprava, "vloupani_sklad")).toBe(false);
  });

  it("místo činu platí jen pro ten čin", () => {
    expect(jeRecOHrozicim("Ta vitrína zůstane, kde je.", "vitrina")).toBe(true);
    expect(jeRecOHrozicim("Ta vitrína zůstane, kde je.", "vloupani_sklad")).toBe(false);
  });
});
```

Do `zprava-trenera.test.ts` do `describe("zpráva trenéra hráči")`:

```ts
  it("řeči z hospody: zpráva hráči, který ohlásil čin, nastaví téma a zapíše rozhovor", async () => {
    vi.mocked(vyslechni).mockResolvedValueOnce(null);
    const d = db(null, [{ sql: /status = 'hrozi' AND culprit_player_id = \?/, first: { id: "inc-h", kind: "vitrina" } }]);
    expect(await zprava(d, "Co to bylo včera v hospodě za řeči?")).toEqual({ incidentId: "inc-h", vyslech: null });
    expect(d.dotazy.find((q) => /UPDATE conversations/.test(q.sql))?.params.slice(0, 2)).toEqual(["inc-h", "2026-09-16"]);
    expect(d.dotazy.find((q) => /\$\.promluvil/.test(q.sql))?.params).toEqual(["2026-09-16", "inc-h", "tym-a", "s"]);
  });

  it("hráč bez ohlášeného činu: řeči o hospodě nic nenastaví", async () => {
    const d = db(null);
    expect(await zprava(d, "Co to bylo včera v hospodě?")).toBeNull();
    expect(d.pocet(/UPDATE club_incidents/)).toBe(0);
    expect(d.pocet(/UPDATE conversations/)).toBe(0);
  });

  it("téma z tlačítka u hrozícího činu: výslech nic nevrátí, zapíše se rozhovor", async () => {
    vi.mocked(vyslechni).mockResolvedValueOnce(null);
    const d = db({ incidentId: "inc-h", incidentDen: "2026-09-16" });
    expect(await zprava(d, "Tak co, Franto?")).toEqual({ incidentId: "inc-h", vyslech: null });
    expect(d.pocet(/\$\.promluvil/)).toBe(1);
  });
```

Do `akce-zeptat.test.ts`: import `import { promluvSi, zeptejSe } from "./akce";` a na konec:

```ts
describe("promluvit si s tím, kdo v hospodě ohlásil čin (spec 9a)", () => {
  it("otevře konverzaci s ním a nastaví téma", async () => {
    const { db, env } = prostredi(incidentRadek({ status: "hrozi", culprit_player_id: "s", loss: "[]" }));
    expect(await promluvSi(env, "tym-a", "inc-1")).toEqual({ ok: true, conversationId: "konv-1" });
    expect(db.dotazy.find((d) => /FROM players/.test(d.sql))?.params[0]).toBe("s");
    expect(db.pocet(/UPDATE conversations SET ai_thread_state/)).toBe(1);
  });

  it("jen u hrozícího činu a jen s hráčem, který je pořád v kádru", async () => {
    expect(await promluvSi(prostredi(incidentRadek()).env, "tym-a", "inc-1")).toMatchObject({ ok: false, kod: 409 });
    const odesel = prostredi(incidentRadek({ status: "hrozi" }), [{ sql: /FROM players/, first: null }]);
    expect(await promluvSi(odesel.env, "tym-a", "inc-1")).toMatchObject({ ok: false, kod: 409 });
    expect(getOrCreatePlayerConversation).not.toHaveBeenCalled();
  });
});
```

Do `znalosti.test.ts` do `describe("blok znalostí v promptu")`:

```ts
  it("hrozba z hospody: hráč to zlehčuje a může slíbit, že nic neudělá", () => {
    const r = radekDoPromptu(radek({ role: "pachatel", status: "hrozi", fact: "V hospodě jsi opilý vykládal, že provedeš tohle: Poháry z vitríny." }, "p"));
    expect(r).toContain("Poháry z vitríny");
    expect(r).toContain("slib, že nic neuděláš");
    expect(r).not.toContain("Zapírej");
  });

  it("řeči, ze kterých nic nebylo: bez „kdo to byl, se neví“", () => {
    const r = radekDoPromptu(radek({ status: "uzavreny", resolution: "nestalo_se", fact: "Franta Novák v hospodě kecal, ale nic neudělal." }));
    expect(r).toContain("Nakonec z toho nic nebylo.");
    expect(r).not.toContain("Kdo to byl");
  });

  it("drb z cizího klubu: co, kdy a jméno odhaleného, bez výsledku", () => {
    const zaklad = { role: "drb" as const, fact: "V hospodě jsi slyšel drb, klub TJ Dvory má průšvih: Vloupání do skladu." };
    const neodhaleny = radekDoPromptu(radek({ ...zaklad, status: "uzavreny", resolution: "pokuta" }));
    expect(neodhaleny).toBe(`- ${zaklad.fact} Stalo se to před 3 dny.`);
    expect(radekDoPromptu(radek({ ...zaklad, ...ODHALENY }))).toContain("Udělal to Pepa Průšvih.");
  });
```

- [ ] **Step 2: Spustit, musí selhat**

Run: `cd apps/api && npx vitest run src/incidents/tema.test.ts src/incidents/zprava-trenera.test.ts src/incidents/akce-zeptat.test.ts src/incidents/znalosti.test.ts`
Expected: FAIL (chybí `jeRecOHrozicim`, `promluvSi`, pokyn hrozby a formát drbu).

- [ ] **Step 3: `tema.ts`**

Za `najdiIncidentVTextu` přidat:

```ts
/** Slova, podle kterých trenér mluví o řečech z hospody (spec 9a). Bez diakritiky. */
const RECI_Z_HOSPODY = ["hospod", "hospud", "kecal", "keca", "vyklad", "reci", "opil", "ozral", "blbost", "neblbni", "nedelej", "vyhroz"] as const;

/**
 * Mluví zpráva o činu, který hráč ohlásil v hospodě? Stačí zmínka o hospodě a řečech,
 * nebo začátek slova o místě činu (sklad, vitrína…). Signál průšvihu tu potřeba není:
 * zpráva jde jen hráči, který čin ohlásil.
 */
export function jeRecOHrozicim(textZpravy: string, kind: string): boolean {
  const t = normalizuj(textZpravy);
  if (RECI_Z_HOSPODY.some((s) => t.includes(s))) return true;
  const slova = t.split(/[^a-z]+/).filter(Boolean);
  return (SLOVA_DRUHU[kind] ?? []).some((k) => slova.some((s) => s.startsWith(k)));
}
```

- [ ] **Step 4: `zprava-trenera.ts`**

Importy: `import { zaznamenejPromluvu } from "./hrozi-db";` a `import { jeRecOHrozicim, najdiIncidentVTextu, temaZeStavu } from "./tema";`. Blok od `let incidentId = …` do konce funkce nahradit:

```ts
  let incidentId = temaZeStavu(zaklad.ai_thread_state, den)?.incidentId ?? null;
  if (!incidentId) {
    const kandidati = await db.prepare(
      `SELECT id, kind, loss FROM club_incidents
        WHERE team_id = ? AND season_number = ? AND status IN ('otevreny', 'policie') AND culprit_revealed = 0
          AND category IN ('kradez', 'poskozeni')
        ORDER BY game_date DESC LIMIT 10`,
    ).bind(opts.teamId, zaklad.sezona).all<{ id: string; kind: string; loss: string }>()
      .catch((e) => { logger.warn({ module: M }, `incidenty k otázce ${opts.teamId}`, e); return null; });
    incidentId = najdiIncidentVTextu(
      opts.text,
      (kandidati?.results ?? []).map((r) => ({ id: r.id, kind: r.kind, ztraty: nactiZtraty(r.loss) })),
    );
    if (!incidentId) {
      // Řeči z hospody: trenér píše hráči, který v hospodě ohlásil čin (spec 9a).
      const hrozici = await db.prepare(
        `SELECT id, kind FROM club_incidents
          WHERE team_id = ? AND status = 'hrozi' AND culprit_player_id = ?
          ORDER BY game_date DESC LIMIT 1`,
      ).bind(opts.teamId, opts.playerId).first<{ id: string; kind: string }>()
        .catch((e) => { logger.warn({ module: M }, `hrozící čin hráče ${opts.playerId}`, e); return null; });
      if (hrozici && jeRecOHrozicim(opts.text, hrozici.kind)) incidentId = hrozici.id;
    }
    if (!incidentId) return null;
    // Navazující otázka („a kde?") klíčová slova mít nemusí, téma proto platí do konce dne.
    await nastavTema(db, opts.convId, incidentId, den);
  }

  const vyslech = await vyslechni(db, { teamId: opts.teamId, incidentId, playerId: opts.playerId, gameDate: zaklad.game_date });
  if (vyslech) return { incidentId, vyslech: vyslech.vysledek };
  // Hrozící čin se nevyslýchá. Rozhovor s tím, kdo ho ohlásil, sníží šanci, že to udělá (spec 9a).
  // U jiného incidentu nebo jiného hráče hlídaný UPDATE nic nezmění.
  await zaznamenejPromluvu(db, { teamId: opts.teamId, incidentId, playerId: opts.playerId, den });
  return { incidentId, vyslech: null };
}
```

V `zprava-trenera.test.ts` zkontrolovat, že existující test „hledá jen otevřené neodhalené krádeže…" pořád hledá první dotaz na `club_incidents` s parametry `["tym-a", 4]`: dotaz na hrozící čin běží až po neúspěšném hledání, takže v tom testu nepadne.

- [ ] **Step 5: `akce.ts`**

Tělo `zeptejSe` od `const hrac = await db.prepare(` po `return { ok: true, conversationId };` přesunout do nové funkce a obě akce postavit na ní:

```ts
/** Konverzace s hráčem kádru s tématem na zbytek herního dne (spec 7a, 9a). Otázku píše trenér sám. */
async function otevriRozhovor(
  db: D1Database, teamId: string, incidentId: string, playerId: string, gameDate: string,
): Promise<VysledekAkce<{ conversationId: string }>> {
  const hrac = await db.prepare(
    "SELECT id, first_name, last_name, nickname, avatar FROM players WHERE id = ? AND team_id = ? AND (status IS NULL OR status = 'active')",
  ).bind(playerId, teamId).first<{ id: string; first_name: string; last_name: string; nickname: string | null; avatar: string | null }>()
    .catch((e) => { logger.warn({ module: M }, `hráč k otázce ${playerId}`, e); return null; });
  if (!hrac) return { ok: false, kod: 400, chyba: "Hráč není v kádru" };

  const { getOrCreatePlayerConversation } = await import("../messaging/ai-player-spawn");
  const conversationId = await getOrCreatePlayerConversation(db, teamId, {
    id: hrac.id, firstName: hrac.first_name, lastName: hrac.last_name, nickname: hrac.nickname, avatar: hrac.avatar,
  }).catch((e) => { logger.error({ module: M }, `konverzace k incidentu ${incidentId}`, e); return null; });
  if (!conversationId) return { ok: false, kod: 500, chyba: "Konverzaci s hráčem se nepodařilo otevřít" };

  if (!(await nastavTema(db, conversationId, incidentId, gameDate.slice(0, 10)))) {
    return { ok: false, kod: 500, chyba: "Téma rozhovoru se nepodařilo uložit" };
  }
  return { ok: true, conversationId };
}

/** Otevře konverzaci s hráčem a nastaví téma na zbytek herního dne (spec 7a). Otázku píše trenér sám. */
export async function zeptejSe(
  env: Bindings, teamId: string, incidentId: string, playerId: string,
): Promise<VysledekAkce<{ conversationId: string }>> {
  const db = env.DB;
  const [inc, gameDate] = await Promise.all([nactiIncident(db, teamId, incidentId), herniDatum(db, teamId)]);
  if (!inc || !gameDate) return NENALEZENO;
  if (!lzeVyslychat(proAkce(inc, false))) return { ok: false, kod: 409, chyba: "Na tenhle incident se už ptát nejde" };
  return otevriRozhovor(db, teamId, incidentId, playerId, gameDate);
}

/**
 * Promluvit si s hráčem, který v hospodě ohlásil čin (spec 9a). Rozhovor se do incidentu zapíše
 * až zprávou trenéra (`zpracujZpravuTrenera`), samotné otevření konverzace šanci nesníží.
 */
export async function promluvSi(
  env: Bindings, teamId: string, incidentId: string,
): Promise<VysledekAkce<{ conversationId: string }>> {
  const db = env.DB;
  const [inc, gameDate] = await Promise.all([nactiIncident(db, teamId, incidentId), herniDatum(db, teamId)]);
  if (!inc || !gameDate) return NENALEZENO;
  if (inc.status !== "hrozi" || !inc.culprit_player_id) return { ok: false, kod: 409, chyba: "Tady už není o čem mluvit" };
  const r = await otevriRozhovor(db, teamId, incidentId, inc.culprit_player_id, gameDate);
  return !r.ok && r.kod === 400 ? { ok: false, kod: 409, chyba: "Hráč už v kádru není" } : r;
}
```

- [ ] **Step 6: `znalosti.ts`**

Do `VYSLEDEK_V_PROMPTU` přidat:

```ts
  nestalo_se: ["Nakonec z toho nic nebylo.", "Nakonec jsi nic neudělal."],
```

Ve `verejnyFakt` podmínku „kdo to byl, se neví" rozšířit:

```ts
  else if (vysetruje && r.vysledek !== "vyreseno_policii" && r.vysledek !== "nehoda" && r.vysledek !== "nestalo_se") {
    casti.push("Kdo to byl, se v klubu neví.");
  }
```

`pokynPachatele` začít hrozbou:

```ts
function pokynPachatele(r: RadekZnalosti): string {
  // Čin ohlášený v hospodě se ještě nestal (spec 9a).
  if (r.stav === "hrozi") return "Byl jsi v hospodě opilý a vykládal jsi to. Zlehčuj to, a když ti trenér domluví, slib, že nic neuděláš.";
  if (r.odhalen) return "Už se na to přišlo, nezapírej.";
  return r.vyslech === "priznal" ? "Přiznej se trenérovi." : "Zapírej, nic nepřiznávej.";
}
```

V `radekDoPromptu` rozdělit `kadr` a `drb`:

```ts
    case "kadr":
      return `- ${verejnyFakt(r)}`;
    case "drb":
      // Drb z cizího klubu: co a kdy, případně kdo. Výsledek ne, model by ho vztáhl na vlastního trenéra.
      return `- ${[r.fact, `Stalo se to ${kdy(r.predDny)}.`, ...(r.pachatel ? [`Udělal to ${r.pachatel}.`] : [])].join(" ")}`;
```

- [ ] **Step 7: Testy a typecheck**

Run: `cd apps/api && npx vitest run src/incidents src/messaging && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/incidents/tema.ts apps/api/src/incidents/tema.test.ts apps/api/src/incidents/zprava-trenera.ts apps/api/src/incidents/zprava-trenera.test.ts apps/api/src/incidents/akce.ts apps/api/src/incidents/akce-zeptat.test.ts apps/api/src/incidents/znalosti.ts apps/api/src/incidents/znalosti.test.ts
git commit -F - <<'EOF'
feat(incidenty): promluvit si s hracem, ktery v hospode ohlasil cin

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 7: API incidentů: hrozící čin, Promluvit si a admin pro ověření

**Files:**
- Modify: `apps/api/src/routes/incidents.ts`

**Interfaces:**
- Consumes: `promluvSi` (Task 6), `promluvil` (Task 5), `vyhodnotHrozici` (Task 5), `udalostiHospody`, `zapisHospody` (Task 3), `dopisDoHospody` (Task 4).
- Produces (FE v Tasku 8):
  - seznam i detail: `incident.ohlasil: { playerId: string; jmeno: string | null } | null` (jen `status = 'hrozi'` nebo `resolution = 'nestalo_se'`)
  - detail: `hrozi: { promluvil: boolean } | null`, `akce.promluvit: boolean`
  - `POST /api/teams/:teamId/incidents/:id/promluvit` → `{ ok: true, conversationId }` nebo `{ error }` s 404/409/500
  - `POST /api/admin/incidents/hospoda` `{ teamId, hraci: string[], hoste?: string[], jiste?, ohlasi?, trener? }` → `{ ok, pribehy: [{ type, text, incidentId }], zapisy: string[] }`
  - `POST /api/admin/incidents/vysetrovani` přijme `hroziTed` a vrací navíc `hrozici`

Routy nemají unit testy (stejně jako ve fázi 5), ověří je Task 10 na testingu přes curl a prohlížeč.

- [ ] **Step 1: Importy**

```ts
import { obvinHrace, promluvSi, rozhodni, zavolejPolicii, zeptejSe, type VysledekAkce } from "../incidents/akce";
import { udalostiHospody, zapisHospody } from "../incidents/hospoda-db";
import { promluvil } from "../incidents/hrozi";
import { vyhodnotHrozici } from "../incidents/hrozi-db";
import { dopisDoHospody } from "../season/pub";
```

- [ ] **Step 2: `verejnyIncident`**

Před `return {` přidat a do vraceného objektu za `pachatel: …,` přidat `ohlasil,`:

```ts
  // Kdo čin ohlásil v hospodě (spec 9a). Řekl to sám nahlas, jméno tajné není.
  const ohlasil = (r.status === "hrozi" || r.resolution === "nestalo_se") && r.culprit_player_id
    ? { playerId: r.culprit_player_id, jmeno: [r.jmeno, r.prijmeni].filter(Boolean).join(" ") || null }
    : null;
```

- [ ] **Step 3: Detail**

Za `const vysetrovani = stavVysetrovani(stopy, odhalen);` přidat:

```ts
  // Hrozící čin (spec 9a): promluvit jde jen s hráčem, který je pořád v kádru.
  const hrozi = row.status === "hrozi" && !!row.culprit_player_id;
  const promluvit = hrozi && jmena.has(row.culprit_player_id as string);
```

V odpovědi `akce: { ...akce, zeptat },` změnit na `akce: { ...akce, zeptat, promluvit },` a za `policie: { … },` přidat:

```ts
    hrozi: hrozi ? { promluvil: promluvil(row.resolution_data) } : null,
```

- [ ] **Step 4: Promluvit si**

Za routu `/zeptat`:

```ts
// ── POST /api/teams/:teamId/incidents/:id/promluvit ─────────────────────────
// Otevře konverzaci s hráčem, který v hospodě ohlásil čin (spec 9a).
incidentsRouter.post("/teams/:teamId/incidents/:id/promluvit", async (c) =>
  odpovedAkce(c, await promluvSi(c.env, c.req.param("teamId"), c.req.param("id"))));
```

- [ ] **Step 5: Admin `hroziTed`**

V `POST /admin/incidents/vysetrovani`: typ těla rozšířit o `hroziTed?: boolean`, dotaz na tým o `league_id`:

```ts
  const team = await db.prepare("SELECT id, league_id, game_date FROM teams WHERE id = ?").bind(body.teamId)
    .first<{ id: string; league_id: string | null; game_date: string | null }>()
```

Před `return c.json({ ok: true, ...vysledek, krivdy, bazar });`:

```ts
  let hrozici = 0;
  if (body.hroziTed) {
    // Lhůta hrozících činů na dnešek a hned vyhodnotit (spec 9a), jinak se čeká 1 až 3 dny.
    await db.prepare("UPDATE club_incidents SET deadline = ? WHERE team_id = ? AND status = 'hrozi'")
      .bind(team.game_date, team.id).run()
      .catch((e) => logger.warn({ module: M }, "admin vyšetřování: lhůta hrozících činů", e));
    const stav = await nactiStavKlubu(db, team, team.game_date, sezona.number);
    if (stav) hrozici = await vyhodnotHrozici(c.env, stav);
  }
```

a návrat na `return c.json({ ok: true, ...vysledek, krivdy, bazar, hrozici });`. Komentář nad routou doplnit o větu: „`hroziTed` posune lhůtu hrozících činů na dnešek a vyhodnotí je."

- [ ] **Step 6: Admin hospoda**

Na konec souboru:

```ts
// ── POST /api/admin/incidents/hospoda ────────────────────────────────────────
// Jen pro ověření na testingu (spec 9): posadí hráče klubu (`hraci`) a hosty z jiných klubů
// (`hoste`) do dnešní hospody a vyhodnotí příhody o incidentech. `jiste` = každý los vyjde,
// `ohlasi` = tenhle hráč ohlásí čin bez ohledu na alkohol a povahu, `trener` = trenér poslouchá.
// Podmínky (kdo co ví, co klub má) neobchází.
incidentsRouter.post("/admin/incidents/hospoda", async (c) => {
  const body = await teloPozadavku<{
    teamId?: string; hraci?: unknown; hoste?: unknown; jiste?: boolean; ohlasi?: string; trener?: boolean;
  }>(c, "admin hospoda");
  const seznam = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const hraci = seznam(body?.hraci);
  if (!body?.teamId || hraci.length === 0) return c.json({ error: "Chybí teamId nebo hraci" }, 400);
  const db = c.env.DB;

  const team = await db.prepare("SELECT id, league_id, game_date FROM teams WHERE id = ?").bind(body.teamId)
    .first<{ id: string; league_id: string | null; game_date: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "admin hospoda: tým", e); return null; });
  if (!team?.game_date) return c.json({ error: "Tým nenalezen nebo nemá herní datum" }, 404);

  const ids = [...new Set([...hraci, ...seznam(body.hoste)])].slice(0, 40);
  const rows = await db.prepare(
    `SELECT p.id, p.team_id, p.first_name, p.last_name, json_extract(p.personality, '$.alcohol') AS alcohol, t.name AS team_name
       FROM players p JOIN teams t ON t.id = p.team_id
      WHERE p.id IN (${ids.map(() => "?").join(", ")}) AND (p.status IS NULL OR p.status = 'active')`,
  ).bind(...ids).all<{ id: string; team_id: string; first_name: string; last_name: string; alcohol: number | null; team_name: string }>()
    .catch((e) => { logger.warn({ module: M }, "admin hospoda: hráči", e); return null; });
  if (!rows) return c.json({ error: "Hráče se nepodařilo načíst" }, 500);

  const attendees = rows.results.map((r) => ({
    playerId: r.id, firstName: r.first_name, lastName: r.last_name, alcohol: r.alcohol ?? 30, teamId: r.team_id,
    isVisitor: r.team_id !== team.id, fromTeamName: r.team_id !== team.id ? r.team_name : undefined,
  }));
  // Klíč hospodské session je den bez času, stejně jako v denním ticku.
  const t = { teamId: team.id, leagueId: team.league_id, gameDate: team.game_date.slice(0, 10) };
  const r = await udalostiHospody(db, t, attendees, { trener: !!body.trener, jiste: !!body.jiste, ohlasi: body.ohlasi });
  await dopisDoHospody(db, team.id, t.gameDate, attendees, r.pribehy);
  if (r.seasonNumber !== null) await zapisHospody(db, { ...t, seasonNumber: r.seasonNumber }, r.zapisy);

  return c.json({
    ok: true,
    pribehy: r.pribehy.map((p) => ({ type: p.type, text: p.text, incidentId: p.incidentId })),
    zapisy: r.zapisy.map((z) => z.typ),
  });
});
```

- [ ] **Step 7: Typecheck a testy**

Run: `cd apps/api && npx tsc --noEmit && npx vitest run src/incidents src/season`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/routes/incidents.ts
git commit -F - <<'EOF'
feat(incidenty): API hroziciho cinu, promluvit si a admin hospoda pro testing

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 8: Frontend: hrozící čin, Promluvit si, příhody v hospodě

**Files:**
- Modify: `apps/web/src/app/dashboard/incidenty/typy.ts`
- Modify: `apps/web/src/app/dashboard/incidenty/DetailIncidentu.tsx`
- Modify: `apps/web/src/app/dashboard/incidenty/page.tsx`
- Modify: `apps/web/src/app/dashboard/hospoda/page.tsx`

**Interfaces:**
- Consumes (Task 7): `incident.ohlasil`, `hrozi`, `akce.promluvit`, `POST …/promluvit`; příhody hospody s `incidentId` (Task 4).

- [ ] **Step 1: `typy.ts`**

Do `Incident` za `pachatel: …;`:

```ts
  /** Kdo čin ohlásil v hospodě (hrozící čin, nebo řeči, ze kterých nic nebylo). */
  ohlasil: { playerId: string; jmeno: string | null } | null;
```

V `DetailIncidentuData`: `akce: { obvinit: boolean; policie: boolean; zeptat: boolean; promluvit: boolean; tresty: AkceTrestu[] };` a za `policie: …;` přidat `hrozi: { promluvil: boolean } | null;`.

Do `VYSLEDEK_LABEL` přidat `nestalo_se: "Nakonec se nic nestalo",`.

- [ ] **Step 2: `DetailIncidentu.tsx`**

Nahradit funkci `zeptatSe` obecnou funkcí pro obě tlačítka:

```tsx
  async function otevritRozhovor(akceApi: "zeptat" | "promluvit", telo: Record<string, string>) {
    setPracuje(true);
    setZprava(null);
    try {
      const o = await apiFetch<{ conversationId: string }>(`${cesta}/${akceApi}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(telo),
      });
      router.push(`/dashboard/phone/${o.conversationId}`);
    } catch (e) {
      console.error(`incident ${akceApi}:`, e);
      setZprava({ typ: "chyba", text: e instanceof Error ? e.message : "Konverzaci se nepodařilo otevřít." });
      setPracuje(false);
    }
  }
```

Tlačítko „Zeptat se" volá `onClick={() => void otevritRozhovor("zeptat", { playerId: tazanyId })}`.

Proměnné nad `return` upravit:

```tsx
  const hrozi = i.status === "hrozi";
  // Hrozící čin ani řeči, ze kterých nic nebylo, se nevyšetřují.
  const vysetruje = (i.category === "kradez" || i.category === "poskozeni") && !hrozi && i.resolution !== "nestalo_se";
  const maAkce = akce.obvinit || akce.policie || akce.zeptat || akce.promluvit || akce.tresty.length > 0;
```

V hlavičce za řádek s `uzavře se` přidat:

```tsx
            {hrozi && i.deadline && ` · rozhodne se ${datum(i.deadline)}`}
```

Za seznam `i.ztraty` (před `{vysetruje && (`) vložit:

```tsx
      {i.ohlasil?.jmeno && (
        <div>
          <SectionLabel>Řeči z hospody</SectionLabel>
          <p className="text-sm">Ohlásil to: <Hrac playerId={i.ohlasil.playerId} jmeno={i.ohlasil.jmeno} /></p>
          {hrozi && (
            <p className="text-sm text-muted mt-1">
              {detail.hrozi?.promluvil
                ? "Už jste spolu mluvili. Jestli to udělá, se ukáže po lhůtě."
                : "Jestli to opravdu udělá, se ukáže po lhůtě. Když si s ním promluvíš, šance výrazně klesne."}
            </p>
          )}
        </div>
      )}
```

V bloku `{maAkce && (` jako první sekci před `{akce.zeptat && (` vložit:

```tsx
          {akce.promluvit && (
            <div className="space-y-2">
              <SectionLabel>Promluvit si s ním</SectionLabel>
              <p className="text-sm text-muted">
                Napiš mu, ať nedělá hlouposti. Čím lepší má k tobě vztah, tím spíš poslechne. Odpověď stojí kredit jako každá SMS.
              </p>
              <button
                onClick={() => void otevritRozhovor("promluvit", {})}
                disabled={pracuje}
                className="w-full sm:w-auto px-4 py-2 rounded-soft text-sm font-heading font-bold bg-pitch-500 text-white disabled:opacity-50"
              >
                Promluvit si
              </button>
            </div>
          )}
```

- [ ] **Step 3: `page.tsx` (karta v seznamu)**

V `Karta` do řádku s datem za `uzavře se` přidat `{i.status === "hrozi" && i.deadline && \` · rozhodne se ${datum(i.deadline)}\`}`. Za blok `{i.pachatel?.jmeno && (…)}` přidat:

```tsx
          {i.ohlasil?.jmeno && (
            <div className="text-sm mt-2">
              Ohlásil to:{" "}
              <Link href={`/dashboard/player/${i.ohlasil.playerId}`} className="text-base font-heading font-bold underline decoration-pitch-500/20 hover:text-pitch-500">
                {i.ohlasil.jmeno}
              </Link>
            </div>
          )}
```

Text odkazu:

```tsx
              {i.status === "otevreny" ? "Vyšetřovat a rozhodnout →" : i.status === "hrozi" ? "Promluvit si →" : "Otevřít →"}
```

- [ ] **Step 4: `hospoda/page.tsx`**

Do `interface PubIncident` přidat `incidentId?: string;`. Do `INCIDENT_ICON` přidat:

```ts
  drby_o_incidentu: "🗣️",
  nabizi_zbozi: "🛍️",
  stezuje_si_na_trenera: "😤",
  rvacka_kvuli_kradezi: "🥊",
  cela_hospoda_resi: "📣",
  chlubi_se: "🦚",
  ohlasuje_cin: "⚠️",
  vudce_zlodej: "🧣",
```

V seznamu příhod za blok `{inc.effects && inc.effects.length > 0 && (…)}` přidat:

```tsx
                          {inc.incidentId && (
                            <Link
                              href={`/dashboard/incidenty?id=${encodeURIComponent(inc.incidentId)}`}
                              className="ml-7 mt-1 inline-block text-sm font-heading font-bold text-pitch-600 hover:text-pitch-500"
                            >
                              Otevřít incident →
                            </Link>
                          )}
```

- [ ] **Step 5: Typecheck a build**

Run: `cd apps/web && npx tsc --noEmit && npx next build --no-lint`
Expected: bez chyb.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/dashboard/incidenty/typy.ts apps/web/src/app/dashboard/incidenty/DetailIncidentu.tsx apps/web/src/app/dashboard/incidenty/page.tsx apps/web/src/app/dashboard/hospoda/page.tsx
git commit -F - <<'EOF'
feat(incidenty): hrozici cin a promluvit si na strance incidentu, pribehy v hospode

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 9: Spec podle fáze 6

**Files:**
- Modify: `docs/superpowers/specs/2026-09-16-incidenty-design.md`

- [ ] **Step 1: Odchylky**

Každou odchylku z tabulky „Odchylky od specu" tohoto plánu (`docs/superpowers/plans/2026-09-17-incidenty-faze-6.md`) zapiš na své místo: Část 9 (tabulka příhod: šance, okna a pravidla jmen v deníku; odstavec, že deník vrací API komukoli; `utraci_za_rundy`, `pije_na_sekeru`, odmítnutá záloha a rozvod ve fázi 7), 9a (id, `culprit_revealed = 0`, `ohlasil`, `promluvil`, posel, přechod na skutečný incident, `nestalo_se`), návaznosti v Části 9 (trenér poslouchá jen při návštěvě s trenérem, zachované příhody, drb), 5b (stopa `hospoda`: klíče `drb-{hráč}`, `nabizi`, `chlubi`, `ohlasil`; drby nahradí svědkovy stopy), 10b (řádek `drb`, pokyn hrozby, `nestalo_se`), 17d tabulka „Co zůstává" (řádek fáze 6 hotový) a 17h (vůdce: jen zloděj, hrdina ve fázi 11). Do Části 13 doplň nové soubory `incidents/hospoda-db.ts`, `incidents/hrozi.ts`, `incidents/hrozi-db.ts`. Admin `POST /api/admin/incidents/hospoda` a `hroziTed` zapiš k ověření (Část 14, Na testingu). Ověř hodnoty proti kódu (`incidents/nastaveni.ts`, `incidents/hospoda.ts`, `incidents/hrozi-db.ts`).

- [ ] **Step 2: Pořadí implementace (Část 16)**

Za bod 6 doplň „(hotovo na testingu, plán `docs/superpowers/plans/2026-09-17-incidenty-faze-6.md`)".

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-09-16-incidenty-design.md
git commit -F - <<'EOF'
docs(incidenty): spec podle faze 6 hospoda

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 10: Nasazení na testing a ověření (controller)

Tenhle task dělá controller. Migrace žádná.

- [ ] **Step 1: Celá sada testů a build**

```bash
cd apps/api && npx vitest run && npx tsc --noEmit
cd ../web && npx tsc --noEmit && npx next build --no-lint
```

- [ ] **Step 2: Push a CI**

`git push origin testing`, počkat na `conclusion: success` běhu pro pushnutý commit.

- [ ] **Step 3: Scénář (testovací klub FK Duplex Břevnov, existující session, heslo nezadávat)**

Před zásahy do povahy hráčů na `prales-db-test` zapsat původní hodnoty a na konci je vrátit.

1. **Drby:** `POST /api/admin/incidents/force` (`vloupani_sklad` s `playerId` hráče, který má v kádru kamaráda nebo rivala). DB: najít držitele znalosti `svedek|kamarad|rival` s `interrogation IS NULL`; když má alkohol pod 60, dočasně ho zvednout. `POST /api/admin/incidents/hospoda {teamId, hraci: [držitel], jiste: true}` → příhoda `drby_o_incidentu`. DB: svědkova stopa pryč, stopa `{incident}-hospoda-drb-{hráč}` nalezená, znalost `prozradil`. SMS od Hospodského se jménem pachatele. MCP: Hospoda ukáže příhodu s ikonou 🗣️, textem bez jména pachatele a odkazem „Otevřít incident"; detail incidentu ukáže podezřelého a stopu 🍺.
2. **Drb do cizího klubu:** stejné volání s `hoste: [hráč jiného klubu ligy]` na jiném incidentu (nebo `cela_hospoda_resi` u závažného incidentu) → znalost `drb` s `team_id` hostova klubu a textem bez jména neodhaleného pachatele.
3. **Chlubení:** pachatel (alkohol dočasně ≥ 60) v `hraci`, `jiste: true` → `chlubi_se`, incident `culprit_revealed = 1`, stopa `-hospoda-chlubi` síly 3, lhůta aspoň +3 dny. MCP: detail ukáže pachatele a tresty.
4. **Ohlášení a promluva:** `POST /api/admin/incidents/hospoda {teamId, hraci: [hráč], ohlasi: hráč}` → incident `status = 'hrozi'`, `culprit_revealed = 0`, znalost `pachatel` do lhůty, SMS od kamaráda nebo Hospodského. MCP: seznam incidentů ukáže „Hrozí", „Ohlásil to" a „rozhodne se"; detail „Promluvit si" → otevře telefon. Poslat hráči zprávu (dočasně `ai_provider = workers-ai`, pak vrátit na původní hodnotu) → `resolution_data.promluvil` vyplněné, detail „Už jste spolu mluvili", hráč odpoví k tématu.
5. **Po lhůtě:** `POST /api/admin/incidents/vysetrovani {teamId, hroziTed: true}` → `hrozici` 0 nebo 1. Buď `nestalo_se` se SMS Kustoda a znalostí `kadr`, nebo skutečný incident se škodou, stopou `-hospoda-ohlasil` a SMS. Když po promluvě vyšlo `nestalo_se`, zopakovat bod 4 bez promluvy pro druhou větev (los je deterministický podle id, druhá větev nemusí vyjít; pak zapsat jako ověřenou jen jednu).
6. **Návštěva s trenérem:** `POST /api/teams/:id/pub-visit {choice: "all"}` (cooldown 2 dny, pokud blokuje, zapsat jako neověřené) → dnešní příhody o incidentech v deníku zůstanou a nezdvojí se.
7. **Mobil 400 px:** detail hrozícího činu a hospoda s odkazem bez přetečení.
8. **Úklid:** vrátit povahy hráčů a `ai_provider`, otevřené testovací incidenty nechat doběhnout lhůtou.

- [ ] **Step 4: Paměť**

Do `project_prod_deploy_pending.md` doplnit: incidenty fáze 6 na testingu, bez migrace, co zůstalo neověřené, nalezené chyby mimo fázi (vůdce a trenér v hospodě, prázdné catch v `routes/villages.ts`).

✋ **STOP.** Na produkci nic bez výslovného „nasaď na main".

---

## Co zůstává na další fáze

| Fáze | Navazuje na fázi 6 |
|---|---|
| 7 Peníze a životní situace | `utraci_za_rundy` (pachatel peněžního incidentu, hospodský v kádru ×2, trenér poslouchá ×2), `pije_na_sekeru` (dluhy), ohlášení činu po odmítnuté záloze, rozvod ×1,5 v docházce do hospody |
| 8 Obec | starosta v hospodě při veřejném incidentu (`village_pub_encounters.incident_id`) |
| 11 Sezóna a pozitivní incidenty | vůdce fanoušků platí rundu hrdinovi |
