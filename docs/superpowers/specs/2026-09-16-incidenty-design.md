# Incidenty v klubu — návrh

**Datum:** 2026-09-16
**Stav:** návrh schválen uživatelem v konverzaci, spec čeká na revizi
**Branch:** testing

---

## 1. Motivace

Klub dnes „zažívá" jen ploché náhodné události. `events/between-rounds.ts` má
„Vykradení kabiny" (−800 až −3000 Kč) a „Vandalizmus", ale nikdo nic neukradl,
vybavení nezmizelo, pachatel neexistuje a za týden si na to nikdo nevzpomene.
`season/random-events.ts` mění jen kondici.

Cíl: **incidenty se skutečnými následky a pamětí.**

- Hráč něco ukradne, poškodí, uteče s penězi, prožívá životní situaci — nebo udělá něco dobrého.
- Pachatel je známý, podezřelý, nebo neznámý podle toho, **jaké stopy klub reálně může mít**.
- Manažer vyšetřuje (výslech přes chat, obvinění, policie) a trestá.
- Ukradené a poškozené vybavení **opravdu zmizí nebo se rozbije**.
- Ostatní hráči o incidentu vědí a v chatu i v hospodě o něm mluví — jen po dobu, kdy je relevantní.

### Tvrdé pravidlo konzistence

**Nic se nestane s věcí, kterou klub nemá, a žádná stopa nevznikne ze zdroje, který klub nemá.**
Bez dodávky se nedá ukrást dodávka, bez kamery nic nenatočí kamera, bez správce hřiště
nic neviděl správce. Každý typ incidentu i každý druh stopy má explicitní podmínku
a na každou podmínku existuje test.

### Rozhodnutí uživatele (2026-09-16)

1. Kradené zboží v bazaru smí koupit i jiný manažer ligy. Koupil v dobré víře — nic neztrácí a policie mu nic nezabaví.
2. Udání vlastního hráče = podmínka a absence kvůli soudu. Hráč v klubu zůstává; vyhodit ho musí manažer sám.
3. Hráč, který uteče s penězi, zmizí úplně — nejde na trh volných hráčů.
4. Zabezpečení areálu je nová kategorie vybavení.
5. Incidenty jsou provázané s hospodou (řeči, stopy, návaznosti) — viz Část 9.
6. Chyby nalezené při průzkumu se opravují zvlášť, mimo tuto práci.
7. Incidenty se propojí **všude, kde to dává smysl**: absence na zápas i trénink, obec
   (přízeň, důvěra, petice, investice, brigády, starosta), tisk, fanoušci, sponzoři,
   grémium, přestupy, kabina, zaměstnanci, sezónní přehled — viz Část 17.

---

## 2. Zamítnuté varianty

| Varianta | Proč ne |
|---|---|
| Rozšířit `between-rounds.ts` | Bez stavu. Nejde vyšetřovat, nejde si pamatovat, běží jen v den zápasu a jen pro tým, který hrál (v PvP navíc jen domácí). |
| Incidenty generuje AI | Porušuje tvrdé pravidlo: model „ukradne" věc, kterou klub nemá, nebo „najde záznam z kamery". AI smí jen formulovat text z hotových faktů. |
| Nová oblast v `seasonal_events` | `choices` JSON neunese pachatele, stopy ani znalosti hráčů a nemá expiraci. Přebírá se jen vzor atomického výběru volby. |

**Zvoleno:** samostatný modul `apps/api/src/incidents/` s vlastními tabulkami. Pravdu
drží DB a deterministická pravidla, AI jen mluví.

---

## 3. Datový model

Migrace `apps/api/migrations/0202_incidenty.sql` (číslo = další volné v době implementace).

Názvy: v kódu už „incident" znamená výtržnost fanoušků (`fan_incidents`,
`fans/resolve-match-incidents.ts`) a příhodu v hospodě (`pub_sessions.incidents`).
Proto prefix `club_`.

### `club_incidents`

```sql
CREATE TABLE IF NOT EXISTS club_incidents (
  id                TEXT PRIMARY KEY,        -- deterministické: inc-{teamId}-{kind}-{YYYY-MM-DD}
  team_id           TEXT NOT NULL,
  league_id         TEXT,
  season_number     INTEGER NOT NULL,
  kind              TEXT NOT NULL,           -- klíč z katalogu (Část 4)
  category          TEXT NOT NULL CHECK(category IN ('kradez','poskozeni','zivotni','pozitivni')),
  status            TEXT NOT NULL CHECK(status IN ('hrozi','otevreny','policie','probiha','uzavreny')),
  severity          INTEGER NOT NULL DEFAULT 1 CHECK(severity BETWEEN 1 AND 3),
  game_date         TEXT NOT NULL,           -- herní den vzniku
  deadline          TEXT,                    -- herní den, do kdy manažer rozhodne
  ends_on           TEXT,                    -- životní situace: herní den konce
  culprit_type      TEXT CHECK(culprit_type IN ('hrac','cizi','zamestnanec','nikdo')),
  culprit_player_id TEXT,                    -- PRAVDA, na FE jen když culprit_revealed = 1
  culprit_staff_id  TEXT,
  culprit_revealed  INTEGER NOT NULL DEFAULT 0,
  subject_player_id TEXT,                    -- o kom je veřejně řeč (životní situace, hrdina)
  loss              TEXT,                    -- JSON, viz níže
  recovered         INTEGER NOT NULL DEFAULT 0,
  accusations       INTEGER NOT NULL DEFAULT 0,
  police_result_on  TEXT,                    -- herní den výsledku šetření
  police_success    INTEGER,                 -- NULL = nešetřeno
  bazar_on          TEXT,                    -- herní den, kdy se zboží objeví v bazaru (NULL = nikdy)
  resolution        TEXT,                    -- klíč rozhodnutí (Část 7)
  resolution_data   TEXT,                    -- JSON (srážka: {celkem, tydnuZbyva}, pokuta: {castka})
  text              TEXT NOT NULL,           -- veřejný popis, česky
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  resolved_on       TEXT                     -- herní den uzavření
);
CREATE INDEX IF NOT EXISTS idx_club_incidents_team ON club_incidents(team_id, status, game_date DESC);
CREATE INDEX IF NOT EXISTS idx_club_incidents_player ON club_incidents(culprit_player_id);
```

`accused` (fáze 2): JSON pole `Obvineni[]` `{playerId, jmeno, den, vysledek}`, výsledek
`priznal | usvedcen | zapira`.

`loss` je **JSON pole** `Ztrata[]` podle druhu škody:

```ts
type Ztrata =
  | { typ: "vybaveni"; kategorie: string; uroven: number; stav: number; urovniDolu: number }
  | { typ: "vybaveni_stav"; kategorie: string; stavPred: number; stavPo: number }
  | { typ: "stadion"; damageId?: string; zarizeni: string; urovni: number; cena?: number }
  | { typ: "travnik"; pred: number; po: number }
  | { typ: "penize"; castka: number; zdrojZapasId?: string }
  | { typ: "hrac_odesel"; playerId: string; castka: number };
```

### `club_incident_clues` (stopy)

```sql
CREATE TABLE IF NOT EXISTS club_incident_clues (
  id                  TEXT PRIMARY KEY,      -- {incidentId}-{zdroj}-{n}
  incident_id         TEXT NOT NULL,
  team_id             TEXT NOT NULL,
  source              TEXT NOT NULL CHECK(source IN
    ('kamera','spravce','soused','svedek','kamarad','rival','hospoda','bazar','policie','priznani')),
  points_to_player_id TEXT,                  -- ukazuje na jednoho hráče
  suspects            TEXT,                  -- JSON [playerId] — zúží na pár lidí
  holder_player_id    TEXT,                  -- hráč, od kterého se stopa dá získat (svědek)
  strength            INTEGER NOT NULL DEFAULT 1 CHECK(strength BETWEEN 1 AND 3), -- 3 = usvědčující
  police_bonus        REAL NOT NULL DEFAULT 0,  -- o kolik nalezená stopa zvedne šanci policie
  text                TEXT NOT NULL,
  found               INTEGER NOT NULL DEFAULT 0,
  found_on            TEXT
);
CREATE INDEX IF NOT EXISTS idx_clues_incident ON club_incident_clues(incident_id, found);
```

**Stopy nelžou.** Lže jen hráč (pachatel zapírá, kamarád kryje). Falešná stopa by hráče
frustrovala a nešla by odlišit od chyby hry.

### `club_incident_knowledge` (co kdo ví)

```sql
CREATE TABLE IF NOT EXISTS club_incident_knowledge (
  incident_id    TEXT NOT NULL,
  player_id      TEXT NOT NULL,
  team_id        TEXT NOT NULL,              -- tým hráče (host z jiného klubu má svůj)
  role           TEXT NOT NULL CHECK(role IN ('kadr','svedek','kamarad','rival','pachatel','obvineny','drb')),
  fact           TEXT NOT NULL,              -- česky, připravené do promptu
  willingness    INTEGER NOT NULL DEFAULT 50, -- 0–100 ochota říct trenérovi
  interrogation  TEXT CHECK(interrogation IN ('prozradil','kryje','zapira','priznal')),
  interrogated_on TEXT,
  until          TEXT NOT NULL,              -- herní den, do kdy si to pamatuje
  season_number  INTEGER NOT NULL,
  PRIMARY KEY (incident_id, player_id, role)
);
CREATE INDEX IF NOT EXISTS idx_knowledge_player ON club_incident_knowledge(player_id, until);
```

Jeden řádek na hráče, incident **a roli** — fáze 4 přidá k témuž hráči a incidentu další role
(`svedek`, `kamarad`, `kadr`), a o ty by dvousloupcový klíč (incident_id, player_id) přišel.

Tabulka vzniká ve fázi 2 (migrace 0205), ve fázi 2 se zapisuje jen role `obvineny`
(`INSERT OR REPLACE` — opětovné obvinění téhož nevinného hráče přepíše jen jeho vlastní řádek `obvineny`).

### `club_incident_absences` (kdy hráč kvůli incidentu nemůže)

Tabulka vzniká migrací `0206_incidenty_absence.sql` ve fázi 3.

```sql
CREATE TABLE IF NOT EXISTS club_incident_absences (
  id             TEXT PRIMARY KEY,           -- {incidentId}-abs-{1 výslech | 2 soud | 3 vyřazení}
  incident_id    TEXT NOT NULL,
  team_id        TEXT NOT NULL,
  player_id      TEXT NOT NULL,
  kind           TEXT NOT NULL,              -- vyslech | soud | vyrazen (fáze 7: porod, nemocna_mama, stehovani)
  od_dne         TEXT,                       -- herní den (datum. absence); NULL u vyřazení. Sloupce `od_dne`/`do_dne`: `DO` je v SQLite klíčové slovo.
  do_dne         TEXT,
  zapasu_zbyva   INTEGER,                    -- jen vyřazení: kolik soutěžních zápasů ještě
  announced_on   TEXT NOT NULL,              -- herní den ohlášení; od_dne >= announced_on + 2
  duvod          TEXT NOT NULL,              -- krátký důvod do sestavy („Soud")
  sms            TEXT NOT NULL               -- věta hráče do omluvenky, česky
);
CREATE INDEX IF NOT EXISTS idx_incident_abs_team ON club_incident_absences(team_id, od_dne, do_dne);
```

### Úpravy existujících tabulek

```sql
ALTER TABLE equipment ADD COLUMN area_security INTEGER NOT NULL DEFAULT 0;
ALTER TABLE equipment ADD COLUMN area_security_condition INTEGER NOT NULL DEFAULT 50;
ALTER TABLE equipment_listings ADD COLUMN incident_id TEXT;
CREATE INDEX IF NOT EXISTS idx_listings_incident ON equipment_listings(incident_id) WHERE incident_id IS NOT NULL;
-- obec (Část 17e)
ALTER TABLE village_brigades ADD COLUMN team_id TEXT;          -- brigáda jen pro jeden klub (úklid po vandalech)
ALTER TABLE village_brigades ADD COLUMN incident_id TEXT;
ALTER TABLE village_pub_encounters ADD COLUMN incident_id TEXT; -- starosta se v hospodě ptá na incident
```

Nic dalšího z incidentu **nesmí** ležet v `players.life_context` kromě veřejné poznámky
`povest` (17g). `transfers/player-view.ts:45` maže cizímu klubu jen `transferUnrest`,
takže cokoli jiného (dluhy, obvinění) by viděli ostatní manažeři.

### Herní čas a sezóny

- Všechna data (`game_date`, `deadline`, `ends_on`, `until`, `police_result_on`, `bazar_on`) jsou **herní** a porovnávají se jen s herním datem (`teams.game_date`). Reálný čas se nemíchá.
- Rollover sezóny resetuje `game_clock.offset_days`, herní datum může skočit **dozadu**. Proto `season_number` na incidentu i znalosti: platná znalost = stejná sezóna **a** `until >= gameDate`. Incidenty z minulé sezóny ve stavu `otevreny|policie|probiha` zavře denní krok jako `konec_sezony`.
- Výjimka: expirace inzerátu v bazaru jede v reálném čase, shodně s ostatními inzeráty (`routes/equipment-market.ts:291`).

---

## 4. Katalog incidentů

Soubor `incidents/katalog.ts`. Čistá data a čisté funkce, bez DB — testovatelné.

```ts
interface DefiniceIncidentu {
  kind: string;
  category: "kradez" | "poskozeni" | "zivotni" | "pozitivni";
  /** Vrátí null, pokud klub podmínky nesplňuje. Jediné místo, kde se podmínky vyhodnocují. */
  podminky: (stav: StavKlubu) => PripravenyIncident | null;
  vaha: number;
  cooldownDni: number;          // stejný typ u stejného týmu
  jenLidskeTymy: boolean;
}
```

`StavKlubu` načte `incidents/stav-klubu.ts` jedním během: vybavení, stadion, zaměstnanci,
aktivní kádr s povahou a `life_context`, vztahy, včerejší zápas (výsledek, karty, příjmy
podle `transactions.reference_id = matchId`), včerejší hospoda (`pub_sessions.attendees`),
otevřené incidenty, neopravené `stadium_damage`, rozpočet.

### 4a) Krádeže

| kind | Podmínka | Skutečný dopad |
|---|---|---|
| `vloupani_sklad` | kategorie z `PRENOSNE` má úroveň ≥ 1 | kategorie → úroveň 0 (stav 50), stejně jako prodej v bazaru (`equipment-market.ts:489`). Do `loss` úroveň + stav. |
| `vitrina` | `trophy_case` ≥ 2 | úroveň −1 (síň slávy se neukradne, poháry ano) |
| `dodavka_pujcena` | `team_van` ≥ 1, pachatel hráč, ne v den zápasu ani den před ním | stav −30 až −60 (min. 5) |
| `dodavka_ukradena` | `team_van` ≥ 1, pachatel cizí, velmi vzácné, ne v den zápasu ani den před ním | úroveň → 0 |
| `kasa_obcerstveni` | včera domácí zápas **a** transakce `concession_income_self` > 0 | 20–50 % **skutečné** tržby → `recordTransaction(..., "incident_loss", -x)` |
| `tombola` | včera domácí zápas **a** `raffle_income` > 0 | 30–100 % skutečného příjmu z tomboly |
| `utek_s_penezi` | hráč s aktivní situací `dluhy`, věrnost < 50, rozpočet > 20 000 Kč, max. 1× za sezónu na tým | min(10 % rozpočtu, 40 000 Kč); hráč odchází (Část 7d) |
| `zpronevera_ekonoma` | najatý `ekonom`, váha roste s nízkým `judgement` | 3 000–15 000 Kč (max. 5 % rozpočtu); ekonom odchází z klubu |
| `kradez_kamery` | `area_security` ≥ 2, pachatel cizí | `area_security` → 0; k tomuto incidentu nevzniká stopa z kamery |

`PRENOSNE = balls, jerseys, boots_stock, goalkeeper_gear, bibs, training_cones, first_aid,
sports_drinks, water_bottles, coffee_maker, video_setup, pa_system, fan_drums, winter_gear`.
Výběr kategorie váženě podle hodnoty (`cumulativeInvestment`) — zloděj bere to, co za něco stojí.

### 4b) Poškození

| kind | Podmínka | Skutečný dopad |
|---|---|---|
| `oslava_v_kabine` | včera výhra **a** ve včerejší hospodě ≥ 2 hráči s alkoholem ≥ 60 **a** šatny/sprchy/sociálky ≥ 1 | `stadium_damage` −1 úroveň na šatny/sprchy/sociálky (jen ty, nikdy na refreshments). Pachatel = ten z včerejších návštěvníků hospody s nejvyšším alkoholem. |
| `kopnute_dvere` | hráč dostal v posledním zápase červenou **a** temperament ≥ 65 **a** šatny ≥ 1 **a** domácí zápas | šatny −1; 40 %: pokuta od svazu přes `issueSanction` (`competition/discipline.ts:351`, `issuedBy: "rule"`), až ve fázi 10 |
| `koleje_trakturek` | `mower` ≥ 2 („Zahradní traktůrek") | `stadiums.pitch_condition` −8 až −15 |
| `pozar_grilu` | `club_grill` ≥ 1 | úroveň 1–2 → 0, úroveň 3 → 2; 30 %: druhá položka pole ztrát, `stadium_damage` na `refreshments`, pokud ≥ 1 |
| `svetlice` | včera výhra | `pitch_condition` −5 až −10; pachatel hráč nebo cizí 50:50; jen po domácím zápase |
| `vandal` | vždy (pachatel cizí) | `stadium_damage` na `fence|stands|entrance_gate` (≥ 1), jinak trávník −5 |

**Úprava `stadium/stadium-damage.ts`:** dnešní `ROZBITNE` schválně neobsahuje kabiny
(fanoušek se do nich nedostane). Hráč ano. Přibude `ROZBITNE_ZEVNITR = changing_rooms,
showers, toilets, refreshments` a funkce `poskodZarizeni(db, {teamId, incidentId, facility, levels, gameDate, popis})`
se stejnou idempotencí (`INSERT OR IGNORE` na `incident_id`). `opravVybaveni` přijme
sjednocený whitelist — dnes by oprava šaten skončila „neznámé zařízení" (`:163`).
Přibude `opravZdarma` (bez transakce) pro řemeslníka.

### 4c) Životní situace

Stav `probiha` do `ends_on`. Jeden hráč max. 1 aktivní situace, tým max. 2.

| kind | Kdo | Trvání | Dopad |
|---|---|---|---|
| `dluhy` | váha: nezaměstnaný/sezonní dělník/bezdomovec ×2, alkohol ≥ 60 ×1,5 | 21–35 dní | hráč pošle SMS s prosbou o **zálohu** (rozhodnutí, Část 7c). Odmítnutí: jeho váha pachatele ×3 do konce situace. Brigády: vyšší absence na trénink. |
| `prisel_o_praci` | povolání ≠ student/důchodce/nezaměstnaný | 21 dní | morálka −6; 30 % → do 7 dní `dluhy`; docházka na trénink +0,15; žádné pracovní výmluvy |
| `rozvod` | věk ≥ 24 | 28 dní | morálka −10; spí v kabině: docházka +0,15; `oslava_v_kabine` u týmu váha ×2; častěji v hospodě (Část 9); první týden stěhování (incidentní absence) |
| `zabaveny_ridicak` | alkohol ≥ 60 | 30 dní | vyšší šance absence na **venkovních** zápasech; `team_van` ≥ 1 to ruší |
| `svatba_spoluhrace` | ženatý/v páru podle `domacnost()` | 1 den | kocovina: hosté s alkoholem ≥ 50 kondice −10 až −20 (`condition_log`) |
| `narozeni_ditete` | věk 22–40 | ohlášeno ≥ 2 dny dopředu, 1–3 dny | incidentní absence (17a), morálka +8 |
| `nemocny_rodic` | věk ≥ 25 | ohlášeno ≥ 2 dny dopředu, 2–4 dny | incidentní absence (17a); morálka −4 |

Háčky do absencí, tréninku, zápasu a chatu jsou v Části 17a–17d.

### 4d) Pozitivní

| kind | Podmínka | Dopad |
|---|---|---|
| `remeslnik_opravil` | neopravené `stadium_damage` **nebo** vybavení se stavem < 60 **a** v kádru řemeslník (zedník, tesař, truhlář, stolař, instalatér, pokrývač, elektrikář, svářeč, kovář, malíř pokojů, opravář) | `opravZdarma` / stav vybavení +30 |
| `mechanik_dodavka` | `team_van` ≥ 1 se stavem < 70 **a** automechanik v kádru | stav +40 (max. 100) |
| `alarm_vyplasil` | **není losovaný** — vzniká místo krádeže zvenku, když zabere alarm (Část 5) | nic nezmizí |
| `hrdina` | váha hasič/záchranář/policista ×3 | reputace +2 (`applyReputationDelta`, zdroj `incident`), přízeň obce +3, morálka kádru +2, `club_events` |
| `poctivy_nalezce` | — | reputace +1, přízeň obce +1 |
| `dedictvi` | úroveň dresů < 3 | `jerseys` +1, stav 100 |
| `dar_zamestnavatele` | podnikatel/obchodník/mistr v továrně v kádru | levná kategorie (`bibs, water_bottles, coffee_maker, training_cones`) +1, jinak 3 000–10 000 Kč (`incident_gift`) |
| `anonymni_obalka` | — | 1 000–5 000 Kč |
| `omluvny_dopis` | klubu dříve **utekl hráč s penězi** (`club_incidents` kind `utek_s_penezi`) a dopis ještě nepřišel | 20–50 % tehdejší ztráty |

Řemeslník se nekříží se specem povolání (`2026-08-25-povolani-design.md`, Část 5): ten
dává pasivní slevu na opravy, tady jde o jednorázovou opravu. Pokud tamní část bude
implementována, `remeslnik_opravil` se nemění.

### 4e) Četnost a pojistky

Konstanty v `incidents/nastaveni.ts`:

| Pravidlo | Výchozí |
|---|---|
| denní šance problému (krádež/poškození) na lidský klub | 4 % |
| denní šance nové životní situace | 3 % |
| denní šance pozitivního incidentu | 2,5 % |
| spouštěné incidenty (oslava, dveře, světlice, kasa, tombola) | vlastní šance 15–35 % při splnění spouštěče |
| max. otevřených problémů (`otevreny|policie`) | 1 — další problém se nevylosuje |
| cooldown stejného typu | 21 dní |
| ochrana nového týmu | žádný problém do 3 odehraných zápasů |
| strop peněžní ztráty | min(10 % rozpočtu, 40 000 Kč), nikdy pod nulu |
| lhůta na rozhodnutí | 7 herních dní |

---

## 5. Pachatel, stopy a zabezpečení

Soubor `incidents/pachatel.ts` a `incidents/stopy.ts`. Vše deterministicky:
`createRng(seedFromString("incident|" + teamId + "|" + den))` (vzor `messaging/missed-calls.ts:70`).

### 5a) Kdo to byl

Váha hráče jako pachatele:

```
alkohol/100 × 1,0
+ (100 − disciplína)/100 × 1,2
+ (100 − věrnost)/100 × 0,8
+ (100 − vztah k trenérovi)/100 × 0,6
+ transferUnrest/100 × 0,5
+ aktivní dluhy 2,0 (odmítnutá záloha dalších 1,5)
+ recidiva 1,0 (odvozeno dotazem: pachatel incidentu uzavřeného v posledních 60 dnech téže
  sezóny, kromě `bez_skody`, `nestalo_se` a `konec_sezony` — nic se navíc neukládá, platí i pro
  nevyřešené)
```

Hráči s váhou < 1,7 nejsou kandidáti — disciplinovaný věrný hráč nekrade. Kalibrace z testovacích
dat: při 1,2 byl kandidátem 89 % hráčů, při 1,7 zhruba polovina.

Pokus o krádež: nejdřív se vybere kandidát z kádru (`vyberHrace`). S pravděpodobností 50 % (nebo vždy, když kandidát není) jde o pokus zvenku. Pokus zvenku uspěje s pravděpodobností plot × osvětlení × `theftRiskMul`; když neuspěje, nestane se nic. Úspěšného zloděje ještě může vyplašit alarm (zabezpečení ≥ 2 u skladu a kabin, = 3 u parkoviště). Zabezpečení tak krádeže ubírá, nepřesouvá je na hráče.

Zaměstnanec jako pachatel: jen `kasa_obcerstveni` (najatá `obsluha`, 20 %) a `zpronevera_ekonoma`.

### 5b) Stopy a jejich zdroje

| Stopa | Podmínka zdroje | Co ukáže | Síla | Nalezená hned? |
|---|---|---|---|---|
| `kamera` | `area_security` ≥ 2, stav ≥ 40, **místo pokryté**: úroveň 2 = kabiny + sklad, úroveň 3 = + parkoviště, hřiště, stánek | vlastní hráč: `points_to` (šance 0,5 + stav/200, resp. 0,7 + stav/333). Cizí: „neznámý muž v kapuci" bez identity | 3 / 1 | ano, Kustod prošel záznam |
| `kamera` (nefunkční) | `area_security` ≥ 2, stav < 40 | „Kamera ten den nenahrávala, je sešlá (stav X %)" — info, nic neukazuje | — | ano |
| `spravce` | najatý `spravce_hriste`; šance 0,1 + judgement/40 | hráč: `points_to`; cizí: auto, SPZ z okresu | 2 | ano |
| `soused` | `stadiums.lighting` ≥ 1; šance 0,25 | hráč: `suspects` (2–3 lidé včetně pachatele); cizí: popis | 1 | ano |
| `svedek` | hráč byl **včera skutečně v hospodě** (`pub_sessions.attendees`) a pachatel je z kádru; šance 0,3 na návštěvníka | `points_to` nebo `suspects` | 2 | ne — `holder_player_id`, získá se výslechem |
| `kamarad` | vztah s pachatelem typu brothers/drinking_buddies/neighbors/coworkers/classmates/in_laws, síla ≥ 40 | ví, kryje (ochota 10–25) | 2 | ne |
| `rival` | vztah `rivals` s pachatelem; šance 0,4 | tuší, práskne (ochota 60–80) | 2 | ne |
| `hospoda` | Část 9 | podle řečí | 1–2 | ano, v den řečí |
| `bazar` | zboží v bazaru je poznatelné (Část 8) | „V bazaru jsou dresy, co vypadají jako naše" | 1 | ano |
| `policie` | výsledek šetření | pachatel / vrácené věci | 3 | ano |
| `priznani` | pachatel se přiznal | pachatel | 3 | ano |

**Místa incidentů.** Podle místa se pozná, jestli na incident vidí kamera: `vloupani_sklad`
sklad; `vitrina`, `oslava_v_kabine`, `kopnute_dvere`, `kradez_kamery` kabiny; `dodavka_pujcena`,
`dodavka_ukradena` parkoviště; `koleje_trakturek`, `svetlice`, `vandal` hřiště; `pozar_grilu`
stánek. Zabezpečení areálu úroveň 2 pokrývá kabiny a sklad, úroveň 3 celý areál (i parkoviště,
hřiště, stánek).

Doplňující pravidla ke stopám:
- Nefunkční záznam kamery se hlásí jen tehdy, kdyby kamera dané místo pokrývala — jinde incident kamerou vůbec neprochází.
- Hráč, kterého kamera nepoznala, je „postava bez obličeje" (síla 1, policii +0,2); poznaného hráče kamera ukáže rovnou (síla 3, policii +0,35).
- Ukradené kamery (`kradez_kamery`) nenatočí nic, k tomuto incidentu stopa z kamery nevzniká.
- Správce hřiště: u hráče `ukazujeNa` síla 2 a policii +0,1 (stejná cena jako svědek); u cizího pachatele popis auta, síla 2, policii +0,15.
- Kamarád a rival mají pro policii stejnou cenu jako svědek, +0,1, jen když je jejich stopa nalezená (výslechem).
- Stopy nevznikají u odhaleného pachatele (např. `kopnute_dvere`), u nehody (pachatel `nikdo`) ani u uzavřených incidentů — není co vyšetřovat.

**Stav vyšetřování pro manažera** (odvozeno z nalezených stop):
- **Pachatel známý** — nalezená stopa síly 3 s `points_to`, nebo přiznání. Nastaví `culprit_revealed = 1`.
- **Podezřelí** — nalezené `points_to` nižší síly nebo `suspects`; zobrazí se sjednocení jmen.
- **Neznámý** — nic z toho.

Pachatel známý hned při vzniku (bez vyšetřování): `kopnute_dvere` (všichni viděli), `dluhy`
a ostatní životní situace (nejsou to přestupky).

### 5c) Zabezpečení areálu — nová kategorie vybavení

Klíč `area_security`, název **„Zabezpečení areálu"**, ikona 🔒. Startovní úroveň je u všech klubů 0.

| Úroveň | Popis (`LEVEL_DESCRIPTIONS`) | Cena | `theftRiskMul` | Alarm | Kamera |
|---|---|---|---|---|---|
| 0 | Klíč je pod rohožkou | — | 1 | — | — |
| 1 | Nový zámek a mříže na skladu | 5 000 | 0,6 | — | — |
| 2 | Alarm a kamera nad vchodem do kabin | 25 000 | 0,35 | 50 % | kabiny, sklad |
| 3 | Kamerový systém s nahráváním, čidly a světly | 70 000 | 0,2 | 70 % | celý areál |

- `theftRiskMul` násobí **jen vloupání zvenku**. Hráč s klíčem od kabiny zámek neřeší.
- Alarm: když vyjde cizí pachatel a zabezpečení ≥ 2 se stavem ≥ 40, hodí se šance alarmu. Při úspěchu vznikne místo krádeže `alarm_vyplasil`.
- Stav: chátrá jako ostatní vybavení (smyčka přes `CATEGORIES` v `daily-tick.ts:813`), opravuje se standardně, dá se prodat i zastavit.
- Registrace kategorie: `equipment-generator.ts` — `CATEGORIES`, `CATEGORY_LABELS`, `LEVEL_DESCRIPTIONS`, `UPGRADE_COSTS`, `UPGRADE_EFFECT_LABELS`, `EquipmentEffects` (`theftRiskMul`, `alarmChance`, `cameraCoverage`), `calculateEffects`, `generateEquipment` (vesnice 90 % úroveň 0); FE `dashboard/equipment/types.ts`; `equipment-pricing.test.ts`.

---

## 6. Denní běh

### 6a) Kde to běží

Nový krok v `processTeamDay` (`season/team-day.ts`), **před blokem fanoušků** (`:411`),
aby `club_events` z incidentu fanoušci zpracovali týž den. Běží v loop i queue režimu.

- Lidské kluby: celý běh. Rezervy U21 se přeskakují — mají `user_id` áčka
  (`league/u21-generator.ts:288`), proto se do SELECTů `daily-tick.ts:1078` a `team-day.ts:663`
  přidá `t.team_type`. Vybavení i stadion patří áčku.
- AI kluby: ve fázi 1 se přeskakují úplně. Od fáze 11 jen `hrdina`, `poctivy_nalezce`, `vandal` s poloviční četností a zprávou do novin.
  Žádné stopy, znalosti ani rozhodnutí.

### 6b) Pořadí v kroku `zpracujIncidentyDne(env, team, gameDate)`

1. Zavřít incidenty z minulé sezóny.
2. Vyhodnotit hrozící incidenty s `deadline <= gameDate` (9a) a šetření policie s `police_result_on <= gameDate`.
3. Uzavřít propadlé lhůty (`deadline <= gameDate`) výchozím výsledkem (Část 7e).
4. Ukončit životní situace s `ends_on <= gameDate`.
5. V pondělí zaúčtovat srážky ze mzdy (Část 7d).
6. Vystavit kradené zboží s `bazar_on <= gameDate` (Část 8).
7. Vylosovat nové incidenty: spouštěné, pak náhodný problém / životní / pozitivní.
8. Zapsat incidentní absence nových incidentů (vždy `od >= dnes + 2`, 17a) a reakce obce, tisku, fanoušků a sponzorů (Část 17).

Odečet klubového vyřazení neběží tady, ale po soutěžním zápase v `match-runner.ts` (17a).

### 6c) Idempotence

Den týmu se zabírá **před** prací (`claimTeamDay`, `team-day.ts:44`) a transakce nemají
unikátní `reference_id`. Proto:

1. `INSERT OR IGNORE INTO club_incidents` s deterministickým id.
2. `changes === 0` → incident už existuje, **nic dalšího se nedělá**.
3. Teprve potom dopady. Každý dopad s vlastním guardem (`UPDATE equipment SET x = 0 WHERE team_id = ? AND x = ?`), `stadium_damage` přes `incident_id`, reputace přes `referenceId`, `club_events` přes `referenceId`.
4. Přechody stavů atomicky: `UPDATE club_incidents SET status = ? WHERE id = ? AND status = ?` a kontrola `changes`.

Náklad: ~5 dotazů na tým v klidném dni (stav klubu se načítá jen, když padne los nebo
spouštěč). Zápisy dávkou (`db.batch`), všechna `IN (...)` omezená na kádr jednoho týmu
(< 40 parametrů).

- Stav klubu se ve fázi 1 načítá pro každý lidský klub každý den (~10 dotazů), ne jen při losu.
  Při desítkách lidských klubů zanedbatelné; pokud klubů výrazně přibude, načítat až po losu.

---

## 7. Vyšetřování a rozhodnutí

API v `apps/api/src/routes/incidents.ts`, všechny routy `requireTeamOwnership`.
Middleware pouští GET bez kontroly vlastnictví (`auth/middleware.ts:34`), proto GET
routy ověří vlastnictví výslovně — incident obsahuje podezřelé a stopy.

| Metoda | Cesta | Co |
|---|---|---|
| GET | `/api/teams/:teamId/incidents` | otevřené + uzavřené za 30 dní, jen veřejná data |
| GET | `/api/teams/:teamId/incidents/:id` | detail: text, ztráta, nalezené stopy, podezřelí, pachatel (jen `revealed`), dostupné akce |
| POST | `/api/teams/:teamId/incidents/:id/zeptat` `{playerId}` | otevře konverzaci s hráčem a nastaví téma (7a) |
| POST | `/api/teams/:teamId/incidents/:id/obvinit` `{playerId}` | 7b |
| POST | `/api/teams/:teamId/incidents/:id/policie` | 7c |
| POST | `/api/teams/:teamId/incidents/:id/rozhodnuti` `{akce, zapasu?}` | 7d |
| POST | `/api/teams/:teamId/incidents/:id/zaloha` `{akce: "pujcit"|"odmitnout"}` | 7c |
| POST | `/api/teams/:teamId/equipment-market/:listingId/nahlasit` | Část 8 |
| POST | `/api/admin/incidents/force` `{teamId, kind, playerId?}` | jen admin, pro testování na testingu |

Veřejná data **nikdy** neobsahují `culprit_player_id` před odhalením, nenalezené stopy ani
`willingness`.

### 7a) Výslech

Výsledek výslechu **rozhoduje DB, ne model.**

- Spustí se, když trenér napíše hráči zprávu k incidentu:
  - tlačítkem „Zeptat se" (nastaví `conversations.ai_thread_state.incidentId` s platností do konce herního dne), nebo
  - volným textem, který `incidents/tema.ts: jeOtazkaNaIncident(text, incident)` pozná podle klíčových slov (ukrad, krádež, zloděj, zmizel, vykrad, kdo to byl, kamera, policie + tvary názvu věci/zařízení). Při více incidentech se bere nejnovější otevřený.
- Výsledek se spočítá **jednou** na hráče a incident a uloží do `club_incident_knowledge.interrogation`. Další otázky dostanou stejnou odpověď — hráč si neprotiřečí.

Pro hráče se znalostí `svedek|kamarad|rival`:

```
sance = ochota + (vztah k trenérovi − 50)/2 + (role == rival ? 15 : 0) − (role == kamarad ? 20 : 0)
los(seed "vyslech|incident|hrac") < sance → prozradil (stopa found = 1), jinak kryje
```

Pro pachatele:

```
sance = (disciplína + (100 − temperament) + vztah k trenérovi)/3 − 20 + (nalezená stopa na něj ? 30 : 0)
los < sance → priznal (stopa priznani, revealed = 1), jinak zapira
```

Hráč bez neveřejné znalosti odpovídá jen z veřejné znalosti kádru.

Model dostane hotový pokyn (Část 10): „Tohle trenérovi řekni" / „Víš to, ale kryješ kamaráda, vykrucuj se" /
„Zapírej" / „Přiznej se". Kredit telefonu platí jako u každé SMS.

### 7b) Obvinění

Max. 2 obvinění na incident. Rozhodnutí je deterministické v okamžiku kliknutí:

| Situace | Výsledek |
|---|---|
| obviněný je pachatel, ukazuje na něj nalezená stopa (přímo, nebo je mezi podezřelými) | přizná se nebo je usvědčen → `revealed = 1` |
| obviněný je pachatel, bez stopy | šance na přiznání jako v 7a bez bonusu; jinak zapírá, zůstává podezřelý; vztah k trenérovi −8 |
| obviněný je nevinný | morálka −12, vztah k trenérovi −20, znalost `obvineny` na 60 dní, kamarádi obviněného morálka −3, kádr morálka −2 (bez obviněného a jeho kamarádů — ti mají −3 zvlášť) |

Po odhalení (přiznáním i usvědčením) se lhůta na rozhodnutí prodlouží aspoň na dnes + 3 dny, aby
na manažera po pozdním obvinění zbyl čas vybrat trest.

Hráč odpoví SMS (`sendPlayerSMS`). **Odchylka od návrhu:** ve fázi 2 jen šablona (`texty.ts`,
klíč podle výsledku) — AI text přijde až s chatem ve fázi 4.

### 7c) Policie a záloha

**Policie:**
- Jen jednou na incident. `status = policie`, výsledek za 3–7 herních dní. SMS od „Policie ČR, obvodní oddělení".
- Šance: 0,15 + kamera s identifikací 0,35 + kamera bez identity 0,2 + soused 0,15 + aktivní poznaný inzerát 0,3 + nalezený svědek 0,1 + policista v kádru 0,1; strop 0,9.
- Výsledek se losuje v den výsledku (`seed "policie|" + id`) — první číslo z generátoru rozhoduje, jestli se šetření povedlo.
- **Úspěch, cizí pachatel:** vybavení se vrátí (úroveň a stav z `loss`), **jen když má klub nižší úroveň**, jinak SMS „věci máte na služebně, ale už máte lepší" a `recovered = 1` bez změny. Inzerát se stáhne. Zpravodaj.
- **Úspěch, pachatel z kádru:** `culprit_revealed = 1`, incident se vrací na `otevreny` s lhůtou dnes + 7 — trest volí manažer stejně jako po každém jiném odhalení (7d). K tomu vzniknou incidentní absence: výslech za 2 dny a soud za 5 dní od odhalení, ohlášené aspoň 2 dny dopředu (17a).
- **Pachatel `nikdo`:** výsledek `nehoda`, incident se rovnou uzavře.
- **Cizí pachatel, ukradené peníze** (typ `penize`, fáze 7, kdy existují peněžní ztráty): vrátí se 50–100 % ukradené hotovosti jako `incident_recovery`.
- **Cizí pachatel u poškození** (rozbité se na rozdíl od krádeže vrátit nedá): náhrada 50–100 % hodnoty škody jako `incident_recovery`.
- **Neúspěch:** zpět na `otevreny`, lhůta dnes + 3 dny.

**Udání vlastního hráče** (trest `policie`, 7d): `status = policie`, `resolution = policie`, výsledek
vždy za 3–7 dní „podmínka" — u vlastního udání se nic nešetří, jen se čeká na soud. Pokud je
pachatel oblíbený (vůdcovství ≥ 65 nebo ≥ 2 vztahy síly ≥ 50), kádr morálka −3 („trenér je práskač").
I tady vzniknou incidentní absence: výslech za 2 dny a soud v den výsledku šetření, ohlášené
aspoň 2 dny dopředu (17a).

**Záloha (situace `dluhy`):**
- `pujcit`: `recordTransaction(..., "incident_advance", −3 000 až −8 000)`, srážka zpět 4 týdny, morálka +6, vztah +8. Když hráč odejde dřív, zbytek propadá.
- `odmitnout`: morálka −5, vztah −5, váha pachatele ×3 (Část 5a).
- Bez odpovědi do lhůty = `odmitnout`.

### 7d) Tresty pro odhaleného pachatele

| Akce | Dopad |
|---|---|
| `odpustit` | pachatel morálka +5, vztah +8; při závažnosti ≥ 2 kádr morálka −2; recidiva 60 dní |
| `srazka` | min(škoda, 4 × týdenní mzda) rozložené do 4 pondělků, uložené jako `resolution_data = {celkem, tydnuZbyva}`; každé pondělí `recordTransaction(+x, "incident_deduction", reference "srazka-{id}-t{n}")`, poslední splátka doplatí zaokrouhlení; pachatel morálka −6, vztah −4; odchodem hráče srážka končí |
| `pokuta` | jednorázově min(škoda, 2 × týdenní mzda, 5 000 Kč) jako `incident_fine`, reference `pokuta-{id}`; morálka −8, vztah −6 |
| `vyradit` `{zapasu: 1–3}` | incidentní absence s počítadlem zápasů (17a), **ne** `suspended_matches`; platí ve všech zápasech (liga, pohár, přátelák), odečítá se po odehraném ligovém kole v `match-runner.ts` stejně jako `suspended_matches`; morálka −10; neoblíbený pachatel: kádr +1 |
| `vyhodit` | ve fázi 2 jen `removePlayer(db, id, "released", {toFreeAgent: true})`; `life_context.povest` (17g) a zpráva o vyhazovu zloděje (17g, ne obecné `player_released`) přijdou ve fázi 10; oblíbený: kádr morálka −4, jinak +1 |
| `policie` | tok 7c s jistým úspěchem — udání vlastního hráče vždy skončí „podmínkou" za 3–7 dní |
| `nechat_byt` | nic; recidiva 60 dní |

Reference transakcí incidentu: srážka `srazka-{id}-t{n}` (n = pořadí splátky), pokuta `pokuta-{id}`,
náhrada od policie (7c) `nahrada-{id}`.

`suspended_matches` se pro klubový trest nepoužívá: filtruje kádr **před** losem absencí,
takže změna mezi SMS den předem a simulací by posunula omluvenky všem ostatním (17a).

**Útěk s penězi** (`utek_s_penezi`): nic se nerozhoduje, jen se to stane.
`removePlayer(db, id, "zmizel", {toFreeAgent: false})` — `LeaveType` v
`transfers/remove-player.ts:19` rozšířen o `"zmizel"` (`departed_players.leave_type` je volný text).
Zpravodaj, `club_events`, reputace −2. **Warning signs jsou povinné:** situace `dluhy`
trvá ≥ 7 dní, hráč poslal SMS o zálohu a v hospodě se o něm mluvilo (Část 9).

Nepoužívá se `status = 'quit'`: takový hráč dál bere mzdu (`finance-processor.ts:195`).

### 7e) Uplynutí lhůty

| Situace | Výchozí výsledek |
|---|---|
| krádež/poškození, pachatel neodhalen | `nevyreseno`; věc zůstává pryč; pachateli recidiva; SMS od Kustoda |
| pachatel odhalen, bez trestu | `nechat_byt` |
| `dluhy` bez odpovědi | `odmitnout` |

Od fáze 2 platí recidiva (odvozená, 5a); tresty volí manažer v lhůtě, po ní `nechat_byt`.

Uzavřením se `until` veřejných znalostí posune na max(`until`, dnes + 7).

### 7f) Následky mimo kádr

| Kanál | Kdy | Jak |
|---|---|---|
| notifikace | vznik, výsledek policie, konec lhůty | `createNotification(..., "event", ..., "/dashboard/incidenty?id=")` |
| SMS | vznik a výsledky | `sendSystemSMS` role Kustod / Správce hřiště / Účetní klubu / Policie ČR; hráč `sendPlayerSMS` |
| fanoušci | závažnost ≥ 2, útěk, hrdina, vyhazov zloděje | nové `ClubEventKind`: `kradez_v_klubu`, `hrac_zlodej`, `hrac_utekl_s_penezi`, `hrdina_klubu` (`engine/fan-reactions.ts:13`, `CLUB_EVENTS`, invarianty v `fan-reactions.test.ts`) |
| reputace | útěk −2, usvědčený zloděj −1, hrdina +2, nálezce +1 | `applyReputationDelta`, nový zdroj `"incident"` (`lib/reputation.ts:14`) |
| obec | přízeň, důvěra, historie, petice, investice, brigády, starosta | Část 17e |
| Zpravodaj | závažnost ≥ 2, útěk, výsledek policie, hrdina | `news` typ `incident` (celá liga), `KVOTY` a `NEWS_ICONS` v `news/feed.ts` |
| finance | nové typy | `TransactionType`: `incident_loss`, `incident_recovery`, `incident_fine`, `incident_deduction`, `incident_advance`, `incident_gift` + `TXN_LABELS`/`TXN_ICONS` (FE), hlídá `transaction-labels.test.ts` |

Fáze 2: jen SMS, notifikace a transakce `incident_fine`, `incident_deduction`, `incident_recovery`.
Reputace, Zpravodaj, fanoušci, obec a atributy manažera přijdou ve fázích 3, 8 a 9.

---

## 8. Bazar

Pro krádeže prodejných kategorií (`vloupani_sklad`, `vitrina`, `dodavka_ukradena`, `kradez_kamery`):

- **Jestli:** 60 % (zbytek zloděj prodal jinde). **Kdy:** `bazar_on` = vznik + 1–5 herních dní.
- **Kde:** `equipment_listings` s `league_id` ligy okradeného klubu, `team_id = NULL`, `is_ai_listing = 0` (nesmí ubírat z cíle `TARGET_LISTINGS_PER_LEAGUE`, `ai-listings.ts:25`), `incident_id`, úroveň a stav z `loss`.
- **Prodejce:** `seller_name` z poolu soukromníků okresu („Láďa z Volar", „Soukromý inzerát, Vimperk"). Na kartě štítek „soukromý inzerát" místo „z okolí".
- **Cena:** `max(band.min, round(band.suggested × 0,55))`. **Invariant: nikdy pod `band.min`** (= výkup zastavárny při 100 %, `equipment-generator.ts:371`). Jinak koupě a okamžité zastavení tiskne peníze. Na to je test.
- **Poznání:** `jePoznatelne(kategorie, uroven)` — dresy ≥ 2 (čísla, logo), dodávka 3 (logo), vitrína ≥ 1 (poháry s nápisy), bubny a vlajky ≥ 2 (šály s logem). Ostatní nepozná nikdo.
  - poznatelné → okradený klub dostane u inzerátu `vypadaJakoVase: true`, SMS od Kustoda a stopu `bazar`.
  - nepoznatelné → nic; nápovědou je jen cena a načasování.
- **Nahlásit policii** (jen poznatelné, jen okradený klub): inzerát → `withdrawn` hned, incident → tok 7c s bonusem 0,3. Pachatel z kádru se při úspěchu odhalí.
- **Koupit zpět:** běžný nákup. Hook v `equipment-market.ts` buy: `listing.incident_id` a kupec = okradený klub → `recovered = 1`, SMS.
- **Koupí jiný klub:** běžný nákup, bez postihu. Okradený klub dostane stopu „Věci koupil klub X".
- AI kluby v bazaru nenakupují — beze změny.

GET `/equipment-market` vrací navíc `isPrivateListing`, `vypadaJakoVase`, `incidentId` (jen pro okradený klub).

---

## 9. Hospoda

`season/pub.ts` generuje session globálně před per-tým krokem. Hospoda proto pracuje
s incidenty ze **včerejška a starších**. Nové typy příhod (`PubIncident.type`) + ikony
na FE (`dashboard/hospoda/page.tsx:49`).

| Typ příhody | Kdy | Co se stane |
|---|---|---|
| `drby_o_incidentu` | v hospodě sedí hráč se znalostí `svedek|kamarad|rival`, alkohol ≥ 60, ještě nic neprozradil; šance 25 % | „Pepa po třetím pivu povídal, že ve čtvrtek viděl u skladu Frantovo auto." → stopa `hospoda` **nalezená**, `interrogation = prozradil` |
| `utraci_za_rundy` | pachatel peněžního incidentu v hospodě do 7 dní, alkohol ≥ 65; šance 40 % (**hospodský v kádru** ×2) | „Franta najednou platil rundu celé hospodě." → stopa síly 2 s `points_to` |
| `nabizi_zbozi` | cizí zloděj, zboží zatím nevystavené; šance 20 % | „Nějaký chlap nabízel u pultu dresy za pětikilo." → stopa; poznatelné zboží → policie +0,15 |
| `pije_na_sekeru` | aktivní `dluhy`, hráč v hospodě; šance 50 % | „Hospodský už Frantovi nechce nalévat na sekeru." — **viditelné varování** před útěkem |
| `stezuje_si_na_trenera` | neprávem obviněný v hospodě do 60 dní | kamarádi z téže session vztah k trenérovi −3, morálka −1 |
| `rvacka_kvuli_kradezi` | odhalený pachatel a jeho rival ve stejné session | efekty jako `cross_team_fight` (kondice, malé zranění) |
| `cela_hospoda_resi` | incident závažnosti ≥ 2 do 3 dnů | čistě atmosféra, text s názvem věci |
| `chlubi_se` | **odhalený i neodhalený pachatel** krádeže nebo poškození sedí v hospodě do 10 dnů od činu, alkohol ≥ 60; šance 20 % (temperament ≥ 65 ×1,5) | „Po šestém pivu se Franta pochlubil, že za ty dresy dostal pětikilo." → stopa `hospoda` síly **3** s `points_to` → pachatel známý |
| `ohlasuje_cin` | návštěvník s alkoholem ≥ 70 a váhou pachatele nad prahem (5a), nebo neprávem obviněný či hráč s odmítnutou zálohou; šance 10 % | „Franta u pultu vykládal, že si zítra ty míče ze skladu odnese, stejně je nikdo nepotřebuje." → **hrozící incident** (9a) |

### 9a) Hrozící incident z opileckých řečí

Ohlášený čin je skutečný záznam `club_incidents` se stavem `hrozi`:
- `kind` jen z typů, jejichž **podmínky klub splňuje** (4a, 4b) — nejde ohlásit krádež dodávky, když klub dodávku nemá. Pachatel je známý (ohlásil to sám), `deadline` = +1 až +3 herní dny.
- Manažer se to dozví z hospodského deníku a SMS: od kamaráda z kádru, který u toho seděl a je ochotný mluvit (ochota ≥ 50), jinak od hospodského.
- **Předejít tomu jde:** zpráva hráči v chatu (tlačítko „Promluvit si" nebo detekce tématu, 7a) sníží šanci o `30 + vztah k trenérovi / 5` procentních bodů; zabezpečení areálu ≥ 1 u krádeže ze skladu −15; hráč na incidentní absenci nebo zraněný −100.
- Při uplynutí lhůty deterministický los (`seed "hrozi|incident"`), výchozí šance 50 %:
  - **stane se** → incident přejde na `otevreny` se skutečnými dopady (6c) a stopou `hospoda` síly 3 na pachatele, nalezenou;
  - **vystřízliví** → `uzavreny` s výsledkem `nestalo_se`, znalost `kadr` „Franta v hospodě kecal, ale nic neudělal" na 7 dní.
- Hrozící incident se nepočítá do limitu otevřených problémů (4e), ale stejný hráč smí mít jen jeden.
- Neprávem obviněný může ohlásit i `kopnute_dvere` („rozmlátím mu tu kabinu") — podmínky 4b se pro tenhle případ neptají na červenou kartu.

Návaznosti:
- **Trenér v hospodě poslouchá.** Návštěva s trenérem (`createCoachLedSession`, `POST /teams/:id/pub-visit`) během otevřeného incidentu zdvojnásobí šance `drby_o_incidentu` a `utraci_za_rundy`. Manažer má aktivní nástroj.
- **Oslava v kabině** bere pachatele ze **skutečných** návštěvníků včerejší hospody (4b).
- **Rozvod:** šance návštěvy hospody (`attendanceProb`, `pub.ts:76`) ×1,5.
- **Drb se šíří do jiných klubů.** Host z jiného týmu (`isVisitor`) v session s drbem dostane znalost `drb` (jen veřejný fakt) na 14 dní — v chatu svého klubu o tom může mluvit.
- Hospoda nevytváří nové incidenty ani škody; jen odhaluje, varuje a dohrává následky.

---

## 10. Znalosti hráčů a chat

### 10a) Kdo co ví

Při vzniku incidentu se pro aktivní kádr zapíše (jedna dávka):

| Role | Kdo | `fact` | `until` |
|---|---|---|---|
| `kadr` | všichni | co se stalo a co zmizelo (veřejný text) | +14 dní, závažnost 3 a útěk +45; po uzavření max(until, uzavření + 7) |
| `svedek` | držitel stopy `svedek` | co viděl | uzavření + 7 |
| `kamarad` | vztah s pachatelem (5b) | „Tušíš, že to byl Franta, je to tvůj kamarád" | uzavření + 7 |
| `rival` | rival pachatele (40 %) | „Tušíš, že to byl Franta" | uzavření + 7 |
| `pachatel` | pachatel | pravda | +60 dní |
| `obvineny` | neprávem obviněný (vzniká v 7b) | „Trenér tě obvinil z krádeže, a nebyl jsi to ty" | +60 dní |
| `drb` | host z jiného klubu (Část 9) | veřejný fakt | +14 dní |

Hráč, který přišel do klubu až po incidentu, **neví nic** — záznam vzniká jen při vzniku incidentu.
U životních situací a pozitivních incidentů vzniká jen `kadr` (a `subject_player_id` ví o sobě).

### 10b) Prompt

`incidents/znalosti.ts: nactiZnalostiHrace(db, playerId, gameDate, seasonNumber, tema?)`
→ max. 3 nejzávažnější platné znalosti.

`PlayerSnapshot` (`messaging/ai-player-scenarios.ts:14`) dostane
`znalostiIncidentu?: RadekZnalosti[]`. `buildSystemPrompt` (`ai-player-chat.ts:92`) přidá blok:

```
CO VÍŠ O DĚNÍ V KLUBU (jen tohle, nic dalšího si nevymýšlej, nic jiného se nestalo):
- Před 3 dny někdo vykradl sklad, zmizely dresy. Kdo to byl, nevíš.
```

Neveřejné role (`svedek`, `kamarad`, `rival`, `pachatel`) se do promptu dostanou **jen
když je rozhovor o incidentu** (7a) a vždy s pokynem podle uloženého výsledku výslechu:

```
- Ve čtvrtek večer jsi viděl u skladu Frantovo auto. POKYN: Trenérovi to řekni.
- Dresy jsi ukradl TY. POKYN: Zapírej, nic nepřiznávej.
```

Jinak by model mohl sám „prozradit" něco, co v DB jako nalezená stopa není.

Plnění `znalostiIncidentu` na všech místech, kde se staví snapshot pro chat:
`messaging/ai-player-spawn.ts` (spawn i odpověď), `messaging/coach-initiated.ts` (SMS i kabina),
`transfers/unrest.ts:290`. **Skupinový chat kabiny dostává jen veřejné znalosti** — před
ostatními nikdo nic neprozradí.

Detekce tématu v `routes/messaging.ts` (POST zprávy, `:312`) před voláním generátoru:
výslech se vyhodnotí a uloží, pak se generuje odpověď.

---

## 11. Frontend

Mobile-first, česky, minimálně `text-sm`, jména klikatelná, ceny jen v info řádku, rozhodovací
tlačítka dole, v textech pro hráče **žádná dlouhá pomlčka**.

| Místo | Co |
|---|---|
| `app/dashboard/incidenty/page.tsx` 🆕 | seznam (čeká na rozhodnutí / probíhá / uzavřené) a detail: co se stalo, reálná ztráta s odkazem na vybavení/stadion, nalezené stopy, stav vyšetřování, podezřelí; akce Zeptat se (výběr hráče → telefon), Obvinit (výběr hráče), Policie; tresty po odhalení; záloha u dluhů; seznam rozbitého zařízení s opravou (přes /fans/groups a /fans/repair) |
| `fm-sidebar.tsx`, `more` | položka „Incidenty" 🚨 ve skupině Klub, odznak počtu čekajících rozhodnutí |
| Domů (dashboard widget) | karta, když incident čeká na rozhodnutí |
| `phone/[id]/page.tsx` | zpráva s `metadata.type === "incident"` → tlačítko „Otevřít incident" (vzor `interview_request`, `:446`) |
| `equipment/BazarTab.tsx` | štítek „soukromý inzerát", odznak „Vypadá to jako vaše …", tlačítko Nahlásit policii |
| `equipment/types.ts` | ikona a popisky `area_security` |
| `finances/page.tsx` | popisky a ikony nových typů transakcí |
| `hospoda/page.tsx` | ikony nových typů příhod |
| `napoveda.tsx` | sekce Incidenty a Zabezpečení areálu |
| obec, sestava, trénink, Zpravodaj, fanoušci, přestupy, sezónní přehled, reputace | viz Část 17 |

---

## 12. Odstranění starého

- `events/between-rounds.ts`: smazat pravidla „Vykradení kabiny" (`:196`) a „Vandalizmus" (`:258`) včetně pražských variant (`:325`). Jejich roli přebírá katalog.

---

## 13. Soubory

### Nové

```
apps/api/migrations/0202_incidenty.sql
apps/api/src/incidents/nastaveni.ts          — konstanty
apps/api/src/incidents/katalog.ts            — definice typů, podmínky (čisté)
apps/api/src/incidents/stav-klubu.ts         — načtení StavKlubu
apps/api/src/incidents/pachatel.ts           — váhy, výběr (čisté)
apps/api/src/incidents/stopy.ts              — generování stop a stav vyšetřování (čisté)
apps/api/src/incidents/dopady.ts             — zápis škod a návratů
apps/api/src/incidents/znalosti.ts           — zápis, expirace, prompt
apps/api/src/incidents/tema.ts               — detekce otázky na incident (čisté)
apps/api/src/incidents/vyslech.ts            — výslech, obvinění (čisté + zápis)
apps/api/src/incidents/policie.ts
apps/api/src/incidents/bazar.ts              — vystavení, poznání, cena (čisté + zápis)
apps/api/src/incidents/hospoda.ts            — příhody pro pub.ts (čisté)
apps/api/src/incidents/texty.ts              — šablony textů
apps/api/src/incidents/denni-krok.ts         — zpracujIncidentyDne
apps/api/src/routes/incidents.ts
apps/api/src/incidents/*.test.ts
apps/web/src/app/dashboard/incidenty/page.tsx (+ komponenty)
```

### Upravené

```
apps/api/src/season/team-day.ts              — volání kroku, team_type
apps/api/src/season/daily-tick.ts            — team_type v SELECTu
apps/api/src/season/training.ts              — docházka
apps/api/src/events/match-absences.ts        — řidičák
apps/api/src/season/pub.ts                   — příhody, attendance, trenér poslouchá
apps/api/src/events/between-rounds.ts        — odstranění dvou pravidel
apps/api/src/equipment/equipment-generator.ts — area_security
apps/api/src/routes/equipment-market.ts      — soukromé inzeráty, poznání, nahlásit, hook nákupu
apps/api/src/stadium/stadium-damage.ts       — ROZBITNE_ZEVNITR, opravZdarma, whitelist opravy
apps/api/src/transfers/remove-player.ts      — LeaveType "zmizel"
apps/api/src/season/finance-processor.ts     — TransactionType
apps/api/src/lib/reputation.ts               — ReputationSource "incident"
apps/api/src/engine/fan-reactions.ts         — ClubEventKind
apps/api/src/news/feed.ts                    — KVOTY, NEWS_ICONS
apps/api/src/messaging/ai-player-scenarios.ts — PlayerSnapshot
apps/api/src/messaging/ai-player-chat.ts     — blok znalostí
apps/api/src/messaging/ai-player-spawn.ts, coach-initiated.ts, transfers/unrest.ts — plnění znalostí
apps/api/src/routes/messaging.ts             — detekce tématu
apps/api/src/routes/game.ts                  — text „stopka" podle důvodu
apps/api/src/index.ts                        — registrace routeru
apps/web/src/app/dashboard/equipment/{types.ts,BazarTab.tsx}
apps/web/src/app/dashboard/finances/page.tsx
apps/web/src/app/dashboard/hospoda/page.tsx
apps/web/src/app/dashboard/phone/[id]/page.tsx
apps/web/src/components/dashboard/fm-sidebar.tsx (+ more, widget)
apps/web/src/components/ui/napoveda.tsx
```

Další upravené soubory napojení (absence, trénink, zápas, kabina, chat, hovory, zaměstnanci,
obec, tisk, přestupy, fanoušci, sponzoři, grémium, sezóna) jsou uvedené přímo u háčků v Části 17.

---

## 14. Testování

### Unit (vitest)

- **Konzistence podmínek** — pro každý kind: klub bez prerekvizity → `podminky()` vrací `null` (bez dodávky žádná dodávka, bez tržby žádná kasa, bez tomboly žádná tombola, bez poškození žádný řemeslník, bez výhry žádná oslava, bez návštěvníků hospody žádná oslava).
- **Stopy mají zdroj** — bez `area_security` ≥ 2 žádná `kamera`; stav < 40 jen nefunkční záznam; úroveň 2 nepokrývá parkoviště; bez správce žádná `spravce`; bez osvětlení žádný `soused`; svědek jen z `attendees`.
- **Stopy nelžou** — `points_to` vždy = skutečný pachatel.
- **Pachatel** — disciplinovaný věrný hráč pod prahem; dluhy váhu zvednou.
- **Determinismus** — stejný tým a den → stejný incident, pachatel, stopy i výsledek výslechu.
- **Bazar** — cena ≥ `band.min` pro všechny kategorie, úrovně a stavy; `jePoznatelne` podle tabulky.
- **Znalosti** — expirace podle herního data a sezóny; nový hráč bez záznamu; neveřejná role mimo téma se do promptu nedostane; kabina jen veřejné.
- **Téma** — `jeOtazkaNaIncident` pozná tvary („ukradl", „ukradené dresy", „kdo vykradl sklad") a nereaguje na běžné zprávy.
- **Peníze** — ztráta nikdy nesrazí rozpočet pod nulu, strop 10 % / 40 000 Kč.
- **Texty** — žádná šablona neobsahuje „—"; jména v 1. pádě.
- **Hospoda** — `ohlasuje_cin` nikdy neohlásí čin bez splněných podmínek (bez dodávky žádná dodávka); rozhovor s hráčem šanci skutečně sníží; `chlubi_se` odhalí jen skutečného pachatele.
- **Absence** — bez incidentu je výstup `generateAbsences` beze změny; post-pass nemění omluvenky ostatních hráčů; absence s `od < announced_on + 2` nejde zapsat; všech 6 míst používá `hracProAbsence`.
- **Obec** — druhé spuštění reakce na stejný přechod nezmění přízeň ani nepřidá historii; bez globálního řádku přízně se založí; historie nejmenuje neodhaleného pachatele.
- **Soukromí** — `player-view` cizímu klubu nevrátí z `life_context` nic mimo whitelist.
- **Chat** — bez aktivní situace prompt obsahuje zákaz vymýšlet životní situace.
- Existující: `fan-reactions.test.ts` (nové kinds), `fan-posts.test.ts`, `fan-banner.test.ts`, `fan-oblibenci.test.ts`, `missed-calls.test.ts`, `absence-determinism.test.ts`, `absence-weather.test.ts`, `transaction-labels.test.ts`, `equipment-pricing.test.ts`.

### Na testingu

- `POST /api/admin/incidents/force` pro každý kind, `curl` kontrola: incident, `equipment`/`stadiums`/`transactions` se reálně změnily, stopy odpovídají vybavení testovacího klubu.
- Klub bez zabezpečení vs. se zabezpečením 2 → kamera jen u druhého.
- MCP prohlížeč: stránka incidentu, obvinění (správně/špatně), policie, tresty, bazar (odznak, nahlásit, koupit zpět), hospoda (drby), chat s hráčem na krádež (dočasně `ai_provider = workers-ai`, pak zpět `off`).
- Mobilní šířka.

---

## 15. Rizika

| Riziko | Opatření |
|---|---|
| Frustrace („hra mě okradla") | stropy, max. 1 otevřený problém, ochrana nových týmů, zabezpečení jako protiopatření, útěk jen po viditelných varováních |
| Model prozradí něco mimo DB | neveřejné znalosti jen při tématu a s pokynem; výsledek vždy z DB |
| Dvojí zaúčtování | incident first + guardy (6c) |
| Tiskárna peněz přes bazar | invariant ceny + test |
| Zátěž ticku | načtení stavu jen při losu/spouštěči, dávky, žádné velké `IN` |
| Herní datum skočí dozadu | `season_number` na incidentech i znalostech |
| Náklad AI | žádná nová volání mimo existující chat; šablony bez modelu |
| Omluvenky nesedí se zápasem | incidentní absence jen dodatečným průchodem a ohlášené ≥ 2 dny dopředu (17a) |
| Únik tajných dat přes `life_context` | incidentní stav jen v `club_*` tabulkách, veřejná jen `povest`, whitelist v `player-view` |
| Rozsah | 11 fází, každá samostatně nasazená a ověřená; napojení (fáze 8–11) až nad hotovým jádrem |

---

## 16. Pořadí implementace

Každá fáze samostatně: build → commit → push testing → ověření API + MCP.

1. **Základ** — migrace, `area_security`, katalog krádeží a poškození, pachatel, dopady, notifikace/SMS, denní krok, admin force, stránka incidentu (jen zobrazení), odstranění starých pravidel.
2. **Vyšetřování** — stopy, stav vyšetřování, obvinění, policie, tresty, lhůty, srážky (hotovo na
   testingu, plán `docs/superpowers/plans/2026-09-16-incidenty-faze-2.md`).
3. **Absence, trénink a zápas** (17a–17c) — sdílený převod hráče pro absence, incidentní absence, výmluvy, trénink, zápasové modifikátory, klubové vyřazení (hotovo na testingu, plán
   `docs/superpowers/plans/2026-09-16-incidenty-faze-3.md`).
4. **Znalosti a chat** (Část 10, 17d) — znalosti, prompt, detekce tématu, výslech, vynucené scénáře, domácnost.
5. **Bazar** — soukromé inzeráty, poznání, nahlásit, koupit zpět.
6. **Hospoda** — příhody, chlubení a ohlašování činů, hrozící incidenty a jak jim předejít, trenér poslouchá, šíření drbů, vůdce fanoušků v hospodě.
7. **Peníze a životní situace** — kasa, tombola, útěk, ekonom, dluhy + záloha, ostatní situace.
8. **Obec** (17e) — přízeň a důvěra po osobnostech, historie, petice, investice, brigády, starosta v hospodě a na telefonu, pozvánky, krize jako skutečné incidenty, konec sezóny.
9. **Tisk, fanoušci, sponzoři** (17f, 17h) — rubrika Černá kronika, otázky v rozhovorech, reportér, fanouškovské události, kampaně, transparenty, chorály, oblíbenci, sponzoři.
10. **Přestupy, grémium, rivalové, kabina, zaměstnanci** (17g, 17i, 17j) — pověst, zájem hráčů, podpis volných hráčů, sankce, škodolibí rivalové, psycholog, atributy manažera.
11. **Sezóna a pozitivní incidenty** (17k) — pozitivní katalog, AI kluby, sezónní přehled, ocenění, úspěchy, reputační stránka, nápověda.

---

## 17. Napojení na ostatní systémy

Obecná pravidla pro všechny háčky:
- **Jen po úspěšném přechodu stavu incidentu** (6c). Řada existujících zápisů není idempotentní (`village_history`, `posunSentiment`, `applyRelationEvent`, přízeň obce) — proto deterministická id (`vh-inc-{id}-{co}`, `pet-{id}`, `inv-{id}`) s `INSERT OR IGNORE`, nebo volání až po `changes > 0`.
- **Veřejná místa nikdy nejmenují neodhaleného pachatele**: historie obce (`GET /villages/:id/feed` vidí všechny kluby obce), Zpravodaj, fanouškovská zeď, rozhovory, reportér.
- **Texty**: žádné „—", jméno jen v 1. pádě jako podmět, rod přes `{l}`/`{a}`, pooly ≥ 5 vět.
- **Pořadí dne**: obec běží globálně před týmy (`daily-tick.ts:134`), trénink taky (`:189`), rozhovory před zápasem v `team-day.ts:192` před krokem incidentů. Tyto systémy vidí incident **až další den**, pondělní generátory obce až další pondělí. Přímé reakce (přízeň, historie, SMS) proto běží v kroku incidentů.

### 17a) Absence na zápas

**Problém determinismu.** Omluvenky losuje `events/absence.ts` jedním `rng.random()` na
hráče v pořadí kádru (`seedFromString(matchKey:teamId)`, `lib/seed.ts:26`). Kádr se filtruje
na zraněné a vyloučené **před** losem. Stejný los proběhne ve třech časech: SMS den předem
(`team-day.ts:105`), SMS v den zápasu (`:556`) a simulace (`match-runner.ts:1385`). Přidání
„zranění" nebo `suspended_matches` mezi nimi posune pořadí a změní omluvenky i ostatním.

**Řešení: dodatečný průchod po losu.**
1. `nactiIncidentniKontext(db, teamId, datum)` (`incidents/absence-hracu.ts`) jedním voláním vrátí `{absence, druhy}`: `absence` je `Map<playerId, IncidentniAbsence>` z `club_incident_absences` (okno `od_dne..do_dne` obsahuje datum, nebo `kind = 'vyrazen'` a `zapasu_zbyva > 0`), `druhy` je `Map<playerId, DruhVlivu[]>` (`obvineny`, `pachatel`) z incidentů za posledních 45 dní (`OKNO_VLIVU_DNI`). `obvineny` platí pro **každé** obvinění, které skončilo „zapírá" — nevinného i vinného, který svou vinu zapřel (`vysledek === "zapira"`); porovnání s tajným `culprit_player_id` v tom nehraje roli, jinak by šlo poznat neodhaleného pachatele podle toho, že mu vliv „obvineny" chybí. `nactiIncidentniKontext` navíc počítá obvinění do losu omluvenek jen tehdy, když od něj do `datum` uplynuly aspoň `MIN_OHLASENI_ABSENCE_DNI` (2) dny (`druhyHracu(…, minOdstupObvineni)`) — jinak by pozdní obvinění (den před zápasem) měnilo vstup do už rozjetého losu. Na každém ze šesti míst los omluvenek potřebuje `druhy` (modifikátor pravděpodobnosti u `hracProAbsenci`) a dodatečný průchod hned po něm potřebuje `absence` — obojí pro stejné datum, tedy jedno volání místo dvou. Zápas (`nactiDruhyHracu`) a kabina (`nactiDruhyHracu`) čtou jen `druhy` samostatně bez tohohle odstupu (0 dní), absence na zápas se jich netýká.
2. Los omluvenek (`generateAbsences`) běží beze změny nad stejným kádrem; teprve **potom** `pridejIncidentniAbsence(vylosovane, hraciIds, kontext.absence, timing)` označí hráče z mapy `kontext.absence` jako chybějící s incidentním důvodem, zbytek vylosovaných omluvenek se nemění.
3. Datumové absence (výslech, soud) se smí vytvořit jen s `od_dne >= announced_on + MIN_OHLASENI_ABSENCE_DNI` (2 dny) — SMS den předem i simulace je pak vidí stejně. Příběhově: „předvolání na středu", „soud je v pátek".
4. Klubové vyřazení (`kind = vyrazen`, počítadlo `zapasu_zbyva`) platí ve **všech** zápasech týmu (liga, pohár, přátelák) — hráč je mimo sestavu, dokud počítadlo neklesne na 0. Počítadlo se odečítá jen po odehraném **ligovém kole** v `match-runner.ts`, ve stejném dotazu jako `suspended_matches` — shodné chování se stopkou, jedno místo odečtu. Manažerovo rozhodnutí po odeslání SMS se projeví jen u toho hráče. Když má hráč ve stejný den zároveň platné vyřazení i datumovou absenci (výslech, soud), vyhrává datumová — je konkrétnější a časově přesně ohraničená; `platneAbsence` ji proto vyhodnotí v prvním průchodu bez ohledu na pořadí řádků, vyřazení až ve druhém.

**Sdílený převod hráče.** Dřív 6 míst skládalo vstup do `generateAbsences` samostatně
(`team-day.ts:138`, `:593`, `match-absences.ts:140`, `match-runner.ts:1390`, `game.ts:3798`, `game.ts:9524`)
a rozcházela se (viz Chyby mimo incidenty). `hracProAbsenci(row, druhy?)` (`events/absence.ts`) sjednocuje
převod řádku hráče na `PlayerForAbsence`; `druhy` jsou vlivy toho hráče z `IncidentniKontext.druhy`
(`obvineny`, `pachatel`) a všech šest míst je předává stejně.

**Pravděpodobnost a výmluvy** (`absence.ts`):
- `PlayerForAbsence` + `incident?: { druhy: string[] }`. Ve fázi 3 jediný modifikátor: `obvineny` (do 14 dní) +0,03 (`OBVINENY_SANCE_NAVIC`). `dluhy`, `rozvod`, `zabaveny_ridicak` a `isAway` přibudou se životními situacemi ve fázi 7 — situace ještě neexistují.
- Nová kategorie `"incident"` s vlastní váhou (`OBVINENY_VAHA_VYMLUVY = 0,5`, dominantní mezi ostatními kategoriemi), pool `OBVINENY_EXCUSES` (výmluvy „Po obvinění", pět vět, „Po tom, co jste mě obvinil, nemám na fotbal náladu." a podobné). Pooly podle `dluhy`/`prisel_o_praci`/`zabaveny_ridicak` přibudou ve fázi 7.
- **Rozpory s existujícími pooly** se vyřeší až s životními situacemi ve fázi 7: teprve tehdy se „Manželka rodí! Ne teď, ale prý co kdyby" a „Nemůže, řídil opilý a vzali mu řidičák" vyřadí z obecných výmluv a přesunou do situací `narozeni_ditete` a `zabaveny_ridicak`. Ve fázi 3 zůstávají beze změny.
- Testy: `absence-determinism.test.ts` („bez incidentu beze změny", post-pass nemění ostatní), `absence-weather.test.ts`, `absence-hracu.test.ts`.
- Zobrazení: sestava a hráčská stránka čtou `reason` a `emoji` z výsledku dodatečného průchodu stejně jako u ostatních omluvenek. Rozpad docházky v `teams.ts` (`breakdown`) se nemění — incidentní absence se počítá jako běžná omluva (`excuse`); nový klíč by znamenal nový sloupec v tabulce na mobilu.

### 17b) Trénink

`season/training.ts` `simulateAttendance` (`:332`) a `simulateTraining` (`:433`):
- nový parametr `incidentniDuvody?: ReadonlyArray<string | undefined>` po indexech kádru; plní ho `daily-tick.ts` z `duvodyNaTrenink(hraciIds, nactiIncidentniAbsence(db, teamId, effectiveDate))` (`incidents/absence-hracu.ts`) — `effectiveDate` je kanonický herní den celého ticku (`executeDailyTick`), **ne** `teams.game_date`: dotaz na trénink (`daily-tick.ts` ~řádek 192) ten sloupec vůbec nenačítá, takže by byl `undefined` a `.slice` uvnitř `nactiIncidentniAbsence` shodil trénink do catch bloku pro každý lidský tým.
- den výslechu nebo soudu = hráč na trénink nepřijde bez ohledu na spočítanou docházku; vyřazení ze zápasů (`kind = vyrazen`) trénink nezakazuje.
- **Trénink čte absence podle vlastního `team_id` řádku** (áčko i U21 mají v `teams` každý svůj), ne podle `clubId` použitého vedle pro vybavení a personál. Incidenty vždy patří áčku, takže U21 hráči se v `nactiIncidentniAbsence` nikdy netrefí — to je v pořádku, incidenty se ve fázi 3 U21 týmu netýkají.
- důvod (`DUVOD_TRENINKU`, `incidents/absence-hracu.ts`): „Byl na výslechu na policii", „Byl u soudu".
- modifikátory `prisel_o_praci`/`rozvod` +0,15, `dluhy` −0,15 a zrcadlo náhledu tréninku (`routes/game.ts:484`, `:509`) přibudou se životními situacemi ve fázi 7 — náhled tréninku je týdenní průměr, jednodenní absence v něm nic neznamená.
- zobrazení beze změny FE: `teams.last_training_result` → „Omluvenky — {důvod}", `life_context.absence` → „Chybí dnes".

### 17c) Zápas a kabina

**Zápasové modifikátory** — `applyIncidentMatchMods(db, teamId, skupiny, idMap)` vedle
`applyManagerMatchBonus` (`match-runner.ts:579`, pohár `cup.ts:503`). Deterministické, vrací co použilo:
| Stav hráče | Dopad v zápase |
|---|---|
| neprávem obviněný, do 14 dní | morálka −8, konzistence −10 |
| odhalený pachatel v základní sestavě, do 14 dní | tým morálka −2 |

Tyhle úpravy platí jen v paměti nad kopií hráčů pro simulaci (`skupiny`) a **nesmí se propsat
do DB natrvalo** — je to dočasný handicap pro tenhle jeden zápas, ne trvalý pokles morálky.
`upravSestavuZIncidentu`/`applyIncidentMatchMods` proto vedle `obvinenych`/`pachatelVSestave`
vrací i `moraleDelta: Map<engineId, number>` — skutečně uplatněnou (zápornou) změnu po podlaze
na 0. Zápis morálky po zápase (`match-runner.ts`, `cup.ts`) tuhle deltu od výsledné morálky
odečte (`p.morale - delta`), takže do `players.life_context` jde jen morálka z herního výsledku
(výhra/prohra apod.), incidentní postih zmizí spolu se zápasem.

Rozvod, narození dítěte a hrdina přibudou se životními situacemi a pozitivními incidenty (fáze 7 a 11) — situace ještě neexistují.

**Kabina** — `season/kabina.ts` `processKabina(db, teamId, gameDate?)` načte `nactiDruhyHracu` a
`incidentyVKabine(hraci, druhy, kamaradi)` přičte před clamp týdenní delty (±6):
- odhalený pachatel v kádru, do 14 dní: ostatní −1 (kamarádi 0, drží s ním); **nesmí být tahoun**.
- neprávem obviněný, do 14 dní: sám −2 týdně, kamarádi −1.
- `KabinaResult.incident` (věta o incidentu) jde do pondělní notifikace (`team-day.ts`).
- **Text je neutrální vůči druhu incidentu** — `poskozeni` (poškození) není krádež, takže hlášení
  neříkají „zloděj"/„kradl": kabina nevěří hráči „kvůli kterému byl v klubu průšvih", obviněný nese
  „obvinění bez přiznání" (počítá se i u vinného, který zapřel, ne jen u nevinného — viz 17a).
  Stejně neutrální je i atribut trenéra po vyhazovu (`Vyhozen pachatel incidentu`, ne „zloděj").
- „spí v kabině" (rozvod, −1 pro hráče, +1 kumpánům z hospody) přibude se životními situacemi ve fázi 7 — okno 14 dní zůstane stejné jako u zápasu.

**Vztahy** — helper `posunVztah(db, a, b, {delta, vytvorJako?, smazPod?})` přibude s výslechem ve
fázi 4: ve fázi 3 nemá volajícího, protože reakce kamaráda/rivala se odvíjí od toho, jak se
zachoval při výslechu, a výslech ještě neexistuje. Až přibude, bude hledat pár v **obou** pořadích
a vracet příkazy pro `db.batch`:
- kamarád, který pachatele prozradil → síla −20, pod 10 se vztah smaže, vznikne `rivals` 40.
- kamarád, který kryl → síla +10.
- rival, který práskl → `rivals` +15.
- `posunVztahKTrenerovi` pro `coach_relationship`.

**Atributy manažera** (`lib/manager-attrs.ts`, zdroj `"incident"`, reference `inc-{id}-mgr-{attr}`):
- důsledný trest odhaleného pachatele — `srazka`, `pokuta`, `vyradit`, `vyhodit`, nebo udání `policie`: disciplína +1.
- odpuštění recidivistovi: disciplína −1.
- obvinění bez přiznání (`vysledek === "zapira"`, nevinný i vinný, který zapřel): motivace −1.
- udání oblíbeného hráče: reputace −1.
- útěk hráče, kterému byla odmítnuta záloha: reputace −1 — přibude se zálohou a dluhy ve fázi 7.

### 17d) Chat, zmeškané hovory, zaměstnanci

**Scénáře chatu** (`messaging/ai-player-scenarios.ts`):
- `PlayerSnapshot` + `zivotniSituace` a `znalostiIncidentu`; volající je načtou předem (`loadPlayerSnapshot` je synchronní).
- aktivní situace zvýší váhu hráče v `pickPlayerWeighted` (`ai-player-spawn.ts:450`) a scénáře `family_problem` (rozvod, nemocný rodič) a `personal_milestone` (narození dítěte) s popisem navázaným na incident.
- **bez situace** dostanou tyto scénáře i `evaluateResolution` (`ai-player-chat.ts:380`) pravidlo „nevymýšlej si narození dítěte, rozvod, ztrátu práce ani nemoc rodiče" — jinak model vyrobí životní situaci mimo DB.
- `domacnost(age)` (`chat-kontext.ts:122`) se při rozvodu nahradí („žena tě vyhodila, spíš v kabině").
- vynucené scénáře s `weight: () => 0` (vzor `rejected_offer`, `offer-rejection-impact.ts:210`): `zadost_o_zalohu` (start dluhů), `krivde_obvineny` (den po neprávem obvinění). U `zadost_o_zalohu` propadnutí vlákna **neuráží** (`expireStaleAiThreads` `:798`) — výchozí výsledek řeší lhůta incidentu (7e). Peníze nikdy neurčuje model.

**Zmeškané hovory** (`engine/missed-calls.ts`):
- nové `Volajici`: `policie`, `novinar_skandal` (vlastní klíč, `novinar` by kolidoval s voláním po sérii výher přes unikátní index).
- `StavHovoru` + `policieSetri`, `incidentProObec`, `skandal`; plní `messaging/missed-calls.ts:93`.
- starosta volá kvůli krádeži/útěku i poděkovat hrdinovi; sponzor po útěku nebo usvědčeném zloději; bulvár po incidentu závažnosti ≥ 2.
- `VOLAJICI_LABEL`, FE ikony `phone/Hovory.tsx:18`; `missed-calls.test.ts` — výchozí `KLID` s novými poli `null`.
- Hovory dnes vznikají jen klubům s fanouškovskými skupinami (`team-day.ts:417`) — incidentní volající se z té podmínky vyjmou.

**Zaměstnanci** (`staff/staff-tick.ts`):
- psycholog: po `:206` hráči s aktivní situací nebo rolí `obvineny` morálka +1 až +2; občas zpráva „Psycholog: Mluvil jsem s …" (vlastní guard `inc-psy-{player}-{týden}`).
- správce hřiště: stopa čte `staff_members.judgement` přímo (efekty surové atributy nemají).
- šéf fanklubu: `dopadUdalosti` skandálu × (1 − f × 0,3).
- obsluha: kandidát na pachatele `kasa_obcerstveni` (5a).

### 17e) Obec

**Přízeň a důvěra** — `incidents/obec.ts: reakceObce(db, incident, prechod)`:
- nejdřív `ensureGlobalFavor` (`villages/officials-store.ts:114`); bez řádku UPDATE tiše nic neudělá.
- globální přízeň + přízeň jednotlivých radních × váha osobnosti: skandál aktivista ×1,5, tradicionalista ×1,3, populista ×0,8; hrdina sportovec ×1,5, populista ×1,3. Váhy v kódu podle `personality`, ne z uložených `preferences`.
- **`trust`** (dnes nikdo nemění) = věří obec, že klub průšvihy řeší: nevyřešená krádež −3, zametení usvědčeného zloděje −5, neprávem obviněný po zveřejnění −3, případ vyřešený policií +4, vyhozený zloděj +2. Zobrazí se na stránce obce.
- místní rodák (`players.residence = village.name`, vzor `applyLocalSensations` `village-processor.ts:100`): hrdina ×2 a text „Místní rodák…", zloděj ×1,5.

| Incident | Přízeň | Důvěra | Historie obce |
|---|---|---|---|
| hrdina | +3 | +1 | `incident_hrdina` |
| poctivý nálezce | +1 | — | `incident_nalezce` |
| nevyřešená krádež závažnosti ≥ 2 | −1 | −3 | `incident_kradez_nevyresena` |
| útěk s penězi | −2 | −2 | `incident_utek` |
| vyhozený zloděj | +1 | +2 | `incident_zlodej_vyhozen` |
| vandal zvenku | 0 | — | `incident_vandal` |

**Petice** (`village-processor.ts:449`, deterministické id `pet-{incidentId}`):
- „Zabezpečte areál": druhé nevyřešené vloupání nebo vandal do 60 dní. Cena = zabezpečení úroveň 1. Přijetí v respond route (`routes/villages.ts:683`) nové větve podle `topic`: když klub už má `area_security` ≥ 1, přijme se bez platby.
- „Vyhoďte zloděje": odhalený pachatel zůstává v kádru > 7 dní. `vyhodit` ji automaticky přijme (`UPDATE … SET status='accepted' WHERE id='pet-{id}' AND status='active'`), ignorování = trest přízně.
- Incidentní petice blokuje měsíční (existující kontrola aktivní petice).

**Investice** (`village-processor.ts:547`, id `inv-{incidentId}`): po krádeži zvenku nebo vandalovi
obec nabídne spolufinancování `fence`, `lighting` nebo `area_security` bez podmínky nejvyšší
přízně. Accept (`routes/villages.ts:1220`): whitelist + `lighting`, nová větev `UPDATE equipment SET area_security = MIN(3, area_security + 1)`,
popisky `TARGET_LABEL_CZ` a FE `INVESTMENT_TARGET_LABEL` (`obec/page.tsx:229`).

**Brigády** (sloupec `team_id`, `incident_id`):
- „Úklid po vandalech" jen pro postižený klub; `take` (`routes/villages.ts:473`) zavolá `opravZdarma` na poškození.
- „Odpracovat ostudu" pro odhaleného pachatele (hráči = pachatel), důvěra +3, přízeň +1.

**Starosta v hospodě** (`village_pub_encounters.incident_id`): při otevřeném veřejném incidentu
generátor (`village-processor.ts:670`) vybere starostu nebo aktivistu s tématem incidentu.
Pozvat na pivo zmírní ztrátu důvěry, ignorovat = přízeň −2. Texty v `obec/page.tsx:618` a `hospoda/page.tsx:255` podle tématu.

**Pozvánky na zápas** (`routes/villages.ts:850`): po veřejném skandálu (útěk, usvědčený zloděj,
neprávem obviněný) aktivista/tradicionalista p −0,2 s důvodem „Po té krádeži u vás se ukazovat nebudu"; po hrdinovi sportovec/populista +0,1.

**Krize** (`village-processor.ts:734`) přestanou být fiktivní:
- „kdosi rozbil tribunu" → skutečný incident `vandal` (pachatel cizí).
- „sponzor odchází" → skutečné ukončení smlouvy `banner` nebo `stadium` (17h); bez takové smlouvy se vybere jiná krize.
- nápověda `obec/page.tsx:508` odpovídá skutečnosti.

**Konec sezóny** (`season/season-village.ts:20`): `favorDelta(pos, n) + bilanceIncidentu(teamId, sezona)` (hrdinové +, nevyřešené závažné krádeže a útěky −) ve stejném hlídaném UPDATE.

**FE obce**: ikony podle `event_type` v Historii obce (`obec/page.tsx:955`), ukazatel důvěry na kartě přízně (`:516`), odstavec v „Jak to s obcí funguje" (`:480`).


### 17f) Tisk

- **Redaktoři** (`news/journalists.ts:55`): rubrika `"incident"` pro bulvár (krádeže, útěk) a seriózního (výsledek policie, hrdina); podpis přes `redaktorProRubriku`. `posunSentiment` (neidempotentní) jen po přechodu: bulvár −5, když klub odmítne policii a nechá si usvědčeného zloděje; seriózní +5 za vyřešený případ nebo hrdinu. `dopadTisku` s referencí `press-{newsId}`.
- **Zpravodaj**: typ `incident`, `KVOTY`/`NEWS_ICONS` (`news/feed.ts:12`), FE rubrika „🚨 Černá kronika" (`news/page.tsx:943`).
- **Rozhovor před zápasem** (`news/interview-generator.ts:644`): `incidentFaktProRozhovor(db, teamId, gameDate)` vrátí jednu veřejnou větu a má přednost před fanouškovským faktem; bez odhalení žádné jméno.
- **Rozhovor na konci sezóny** (`news/season-interview.ts:31`): kontext „Průšvihy a hrdinové sezóny".
- **Rozhovor s hráčem** (`news/player-interview.ts:234`): hrdina do 7 dní +skóre výběru a řádek „Nedávno: …".
- **Reportér kola** (`news/ai-reporter.ts:123`): u zápasu řádek „z klubu: …" pro incidenty závažnosti ≥ 2 obou týmů za 7 dní + pravidlo „zmiň jen když zapadne".
- **Článek o sezóně** (`news/season-wrap.ts:54`): blok „KRONIKA SEZÓNY" s ověřenými fakty.
- Rozhovor po zápase se **nemění** — témata jsou svázaná s rozhodčím a hlídaná testem (`post-match-interview.test.ts:189`).

### 17g) Přestupy

- **Zájem hráče o odchod** (`transfers/player-interest.ts:48`): faktor „Průšvihy v klubu" +5 až +10 (útěk, usvědčený zloděj, neprávem obviněný v sezóně), „Klub má dobré jméno" −3 u hrdiny.
- **Podpis volného hráče** (`transfers/player-agency.ts:99`): faktor „Pověst" −10 po útěku/usvědčeném zloději do 30 dní („Slyšel, že vám kradou vlastní hráči."), +5 s hrdinou v kádru.
- **Pověst vyhozeného zloděje**: `life_context.povest = {typ: "usvedcen_zlodej", klub, sezona}` se zapíše před `removePlayer`, přejde do `free_agents` a při podpisu do nového hráče (`game.ts:5050`). FE štítek „⚠️ Pověst" u volného hráče (`transfers/page.tsx:1591`). `player-view.ts:45` cizímu klubu z `life_context` pustí jen whitelist.
- **Zprávy**: vyhazov zloděje nesmí jít přes `player_released` → `reakceNaPrestup` by u hráče 33+ spustil „konec éry" (`transfer-news.ts:227`). Nový typ `player_fired_thief` → `club_events` `hrac_zlodej`. Útěk nevolá `player_quit`.
- **Kampaň fanoušků**: `vyhodit` zavolá `uzavriKampaneNaHrace` (`fans/fan-campaigns.ts:290`).

### 17h) Fanoušci a sponzoři

**Fanoušci:**
- `ClubEventKind` (`engine/fan-reactions.ts:13`): `kradez_v_klubu`, `hrac_zlodej`, `hrac_utekl_s_penezi` (`ptaSe`: „Tak Franta vám vzal kasu. Co s tím uděláte?"), `hrdina_klubu`, `neprave_obvineni`, `klub_udal_hrace`. Invarianty `fan-reactions.test.ts:9`.
- příspěvky na zeď (`engine/fan-posts.ts:55`) ≥ 4 věty na blok; `PostTopic "incident"` už znamená výtržnosti — klubové incidenty jdou přes `club_event`.
- **rivalové se smějí**: `prispevkyKSkandaluRivala` na zeď rivalů (vzor `fan-feed.ts:310`, `rivaloveKlubu`): „U {soupeř} se prý kradou i vlastní dresy. 😂".
- **kampaň „hráč ven"** za odhaleného zloděje ponechaného v kádru (id `kmp-{team}-hrac_ven-{player}-{den}`), důvod přidat do `duvodTrva` (`fan-campaigns.ts:188`), jinak do 10 dní vyprchá.
- **oblíbenci** (`engine/fan-favourites.ts:65`): pole `povest` (hrdina +, zloděj −), důvody „Vytáhl dítě z rybníka." / „Ukradl klubu peníze."; fixtury `fan-oblibenci.test.ts`.
- **transparent** (`engine/fan-banner.ts:124`): po kampani větev `zlodejVKadru` „ZLODĚJE V DRESU NECHCEME" a `hrdina` „{PŘÍJMENÍ}, KLOBOUK DOLŮ"; max. 48 znaků, poslední varianta bez jména, stabilní `duvod` na incident, jen s kotlem.
- **chorály** (`engine/fan-chants.ts:18`): druhy `hrdina` a `zlodej`, jméno jen v 1. pádě.
- **vůdce fanoušků v hospodě** (`season/pub-fan-leaders.ts:495`): `scenaOIncidentu` — vynadá odhalenému zloději u stolu nebo zaplatí rundu hrdinovi.

**Sponzoři:**
- obnovení smlouvy (`routes/game.ts:2349` `computeRenewalTerms`): `× skandalMod` ze sezóny (útěk/usvědčený zloděj −10 až −20 %, hrdina +5 %).
- **morální doložka**: po incidentu závažnosti 3 (útěk, usvědčený zloděj) 25 % šance, že `banner` nebo `stadium` sponzor odstoupí — logika ukončení z `game.ts:2735` bez poplatku, bez přejmenování (hlavní sponzor se nevybírá), reputace −2, zpráva.
- expirace na konci sezóny (`season-rollover.ts:81`): sponzor po skandální sezóně neobnoví, varianta SMS.
- sponzor volá (17d); soutěžní sponzor reaguje přes sankce (`competition/sponsors.ts:231`) beze změny.
- `season/naming-rights.ts` je mrtvý kód — **nenapojovat**.

### 17i) Grémium a rivalové

- `kopnute_dvere`: `issueSanction` s `issuedBy: "rule"` a referencí `inc-fine-{incidentId}` (vzor `resolve-match-incidents.ts:330`).
- nový přestupek `poskozeni_jmena` „Poškození dobrého jména soutěže" v `OFFENCES` (`competition/discipline.ts:46`) s důkazy z `club_incidents` (útěk nebo usvědčený zloděj v sezóně) — grémium ho **může** udělit, automaticky se neuděluje. Jen ligy se samosprávou.
- **škodolibý rival**: po veřejném skandálu klubu A rival B s nejvyšším napětím (AI archetyp `provokater`) `applyRelationEvent(A, B, {heat: +8, icon: "🦊", text: …})` + zpráva `manager_feud`; hrdina: `ferovka`/`pohodar` respekt +5. Kontext se sám propíše do rozhovorů (`getRelationPromptContext`).
- anonymní inzerát (`community/relation-texts.ts:159`): při veřejné krádeži cíle za 14 dní varianty „Koupím zpět vlastní dresy, levně, nepoznáte je."

### 17j) Kabina, zaměstnanci, manažer — viz 17c a 17d.

### 17k) Sezóna a reputace

- **Sezónní přehled** (`season/season-recap.ts`): `computeClubFact` (`:237`) dá přednost incidentu; ceny na párty (`:407`) „Průšvih sezóny 🚨" a „Hrdina sezóny 🦸" (vyhozený nebo utečený hráč přes `departed_players`, `nameOf` `:397` zná jen aktivní); nová karta „🚨 Kronika sezóny" (`season-end/page.tsx:26` `RecapData`).
- **Rozpor**: `SUMMER_EVENTS` „{p}ovi se narodil syn" (`season-recap.ts:362`) nahradit větou, kterou incident nemodeluje.
- **Úspěchy** (`services/achievements.ts:22`): `hrdina_klubu` (stříbro), `vyreseny_pripad` (bronz, policie nebo přiznání).
- **Reputace** (`reputace/page.tsx:77`, `:120`): řádky „Hrdina v kádru +2", „Poctivý nálezce +1", „Útěk s penězi −2", „Usvědčený zloděj −1".

### 17l) Kde se incidenty **nenapojují** (a proč)

| Místo | Proč ne |
|---|---|
| rozhovor po zápase | témata svázaná s rozhodčím, test hlídá seznam klíčů |
| `season/naming-rights.ts` | mrtvý kód bez volajících |
| hlavní sponzor v morální doložce | odchod přejmenuje klub; nepřiměřený dopad náhody |
| automatická sankce grémia | grémium rozhoduje hlasováním; automat by obešel samosprávu |
| role radního „strážník" | vyžaduje přestavbu tabulky kvůli CHECK a volby; policie stačí jako odesílatel SMS |
| AI kluby: absence, obec, tisk | AI kluby mají jen zprávy o pozitivních incidentech a vandalovi (6a) |
