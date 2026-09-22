# Sponzoři: majitelé firem, vyjednávání smluv, sliby a sankce

Schváleno 2026-09-22. Implementace ve třech etapách, každá samostatně na testing.
Etapy 2 a 3 jdou na produkci najednou (sliby bez následků nedávají smysl).

## Proč

Sponzorská stránka byla seznam pevných nabídek „vezmi, nebo nech být". Nabídky vycházely často
horší než stávající smlouvy (ty vznikly náhodně v rozmezí a za nižší reputace), takže nikdo
neměl důvod měnit sponzora a tím ani název. Uživatel chce, aby vyjednat dobrou smlouvu byla
zábava: sponzor má požadavky, klub může slibovat výsledky, licenci, modernizaci a sponzor za to
dává peníze průběžně, jednorázově, bonusy nebo rovnou zaplatí stavbu.

## Výchozí stav (hotovo před touto specifikací)

- Sponzor je entita: řádek `district_sponsors`, smlouvy na něj odkazují přes `sponsor_contracts.sponsor_id`.
- Hlavní sponzor je exkluzivní, logika v `apps/api/src/sponsors/exclusivity.ts`. Po vypršení
  má přednost klub s nejvyšší reputací (`district_sponsors.priority_team_id/priority_season`).
- Obory jsou klíče (`apps/api/src/sponsors/types.ts`), české popisky v `apps/web/src/lib/sponsor-types.ts`.
- Prodloužit jde jen smlouvu v poslední sezóně nebo po vypršení.
- Stránka sponzora `/sponzor/[id]`. Migrace 0215 a 0216.

## Rozhodnutí uživatele

- Majitel firmy je postava s povahou a **náklonností** ke každému klubu, stejně jako zastupitelé obce.
  Zvát ho jde i od firmy, která sponzoruje jiný klub.
- Jednání je **skládání balíčku** s pevnými pravidly (ne AI chat). Povaha a texty dávají barvu.
- Vyjednává se o **hlavním sponzorovi a názvu stadionu**. Bannery zůstávají jako dnes.
- Sliby: výsledky, trenér a stadion, reklama a vidět, klub a lidi (všechny čtyři skupiny).
- Plnění sponzora: peníze průběžně, jednorázově, bonusy za cíle, stavba a věci (všechny čtyři).
- **Sezónní sliby platí až od příští sezóny.** Termínové sliby (licence, stavba, logo, exkluzivita oboru) platí hned.
- Nové nabídky mají být lepší než dnešní smlouvy, aby lákaly ke změně.
- Za nesplněné sliby jsou sankce, až výpověď smlouvy sponzorem.
- AI kluby nevyjednávají, smlouvy dostávají jako dnes.

## Etapa 1: Majitelé firem a náklonnost

### Data (migrace 0217)

- `sponsor_owners(sponsor_id PK → district_sponsors.id, first_name, last_name, age, face_config, personality, created_at)`.
  Jeden majitel na sponzora, generuje se líně při prvním čtení (`ensureSponsorOwner`),
  deterministicky ze seedu `sponsor_id` (stejný majitel na testu i produkci).
- `sponsor_team_favor(sponsor_id, team_id, favor INTEGER 0–100, updated_at, PK(sponsor_id, team_id))`.
  Chybějící řádek = výchozí náklonnost 40.
- `sponsor_invitations(id, sponsor_id, team_id, match_id, match_day, status accepted|declined|attended, gift_cost, created_at)`,
  unikátní částečný index `(sponsor_id, match_day) WHERE status IN ('accepted','attended')`.

### Povahy

| Klíč | Popisek | Co chce při jednání | Co mu zvedá náklonnost |
|---|---|---|---|
| `patriot` | Patriot | mladí hráči, žádné výtržnosti, reputace | pozvání na domácí zápas (+2 navíc), dlouhá spolupráce |
| `businessman` | Obchodník | návštěva, logo, exkluzivita oboru | plný stadion, velké zápasy |
| `fan` | Fanoušek | umístění, postup, pohár | výhry, když sedí na tribuně |
| `cautious` | Opatrný | nesestup, reputace, žádné výtržnosti | klid, dlouhá spolupráce; skandál bolí dvojnásob |

K přáním podle povahy přidá obor jedno přání: `brewery`, `pub` a `restaurant` chtějí návštěvu,
`construction` a `woodwork` modernizaci stadionu, `it` a `ecommerce` výsledky, ostatní nic navíc.
Přání se ukážou 2–3.

### Mechaniky

- **Pozvání na domácí zápas:** stejný vzorec jako `POST /api/villages/invitations`
  (šance 30 % + 0,8 % za bod náklonnosti nad 50, doma +10 %, povaha, šum ±10 %, rozmezí 5–95 %).
  Dárek `max(300, 500 + (50 − favor) × 10)` Kč. Jeden klub na majitele a zápasový den.
  Přijaté pozvání +3 náklonnost hned, po zápase výhra +4, remíza +1, prohra −1 (fanoušek ×2).
- **Hospoda:** majitel se občas objeví mezi setkáními v hospodě (vzor `village_pub_encounters`),
  pivo zaplatíš, +2 náklonnost.
- **Automatické změny:** výtržnost fanoušků klubu −2 (opatrný −4), sezóna jako hlavní
  sponzor klubu +5 (odemyká výhodu stávajícímu sponzorovi při prodloužení).
- Každá změna náklonnosti přes jednu funkci `applySponsorFavorDelta(db, sponsorId, teamId, delta, reason)`
  s ořezem 0–100.

### API a obrazovky

- `GET /api/sponsors/:id` rozšířit o majitele a náklonnost přihlášeného klubu.
- `POST /api/sponsors/:id/invitations` (body `{ matchId }`), vlastník týmu.
- `/sponzor/[id]`: blok Majitel (portrét, jméno, povaha, náklonnost jako pruh a slovo), tlačítko Pozvat na zápas
  s výběrem nejbližšího domácího zápasu.
- `/sponzori`: sekce „Firmy v okrese" (volné nahoře, u každé náklonnost a odhad rozpočtu B jako rozmezí).

## Etapa 2: Jednání o smlouvě

### Rozpočet a ochota

- `B = monthly_max × (reputace / 50) × velikost obce × kategorie × náklonnost`,
  kategorie hlavní 3, stadion 1,5; velikost obce jako dnes (`mesto` 1,3, `mestys` 1,1, `obec` 1,0, jinak 0,8);
  náklonnost `0,8 + 0,4 × favor / 100`.
- Holý podpis: `O = 0,7 × B`. Každý slib přidá `základ × zájem × ambice` z B,
  zájem 1,5 (přání), 1,0 (jinak), 0,5 (povaze je to jedno: `opatrný` a výsledky nad nesestup, `obchodník` a mladí hráči).
- Strop ochoty `1,5 × B`.

### Katalog slibů

| Druh | Parametr | Základ | Ambice | Typ |
|---|---|---|---|---|
| `league_position` | do X. místa | 15 % | `clamp(1 + (očekávané − X) / počet týmů × 2, 0,3, 2)` | sezónní |
| `promotion` | postup | 20 % | podle očekávaného místa (0,3–2) | sezónní |
| `no_relegation` | nesestup | 8 % | vyšší, když je klub v ohrožení | sezónní |
| `cup_round` | pohár do X. kola | 8 % | podle kola | sezónní |
| `coach_licence` | licence úrovně L do termínu | 5 % za stupeň nad současnou | — | termínový |
| `stadium_upgrade` | zařízení na úroveň X do termínu | 5 % (10 % u `stands`, `lighting`, `roof`) za úroveň | — | termínový |
| `jersey_logo` | logo na rukávu | 10 % | — | termínový (jen sponzor stadionu) |
| `sector_exclusivity` | žádný banner stejného oboru | 5 % | — | po dobu smlouvy |
| `attendance` | průměrná domácí návštěva nad X | 5–10 % | podle poměru X k průměru poslední sezóny | sezónní |
| `youth` | průměrně N hráčů do 21 let v sestavě | 5 % | — | sezónní |
| `reputation` | reputace na konci sezóny nad X | 5 % | — | sezónní |
| `no_riots` | žádná výtržnost fanoušků (`fan_incidents`) | 5 % | — | sezónní |

- **Očekávané místo** = pořadí klubu v lize podle průměrného ratingu nejlepší jedenáctky.
- Sezónní sliby se nabízí pro každou sezónu smlouvy, počínaje příští. Smlouva podepsaná v sezóně N
  na 2 sezóny má sezónní sliby jen pro N+1.
- Jeden druh slibu jen jednou na smlouvu.

### Požadavky klubu a jejich cena pro sponzora

Cena je měsíční ekvivalent za dobu smlouvy (`m` = počet měsíců smlouvy, sezóna = 16 týdnů = 16/4,3 měsíce):

| Požadavek | Cena |
|---|---|
| měsíční podpora M | M |
| bonus za výhru W | W × očekávané výhry za sezónu / měsíce sezóny |
| podpisový příspěvek S | S / m |
| bonus za splnění slibu G | G × odhad šance sponzora / m |
| zaplacená modernizace | cena modernizace podle ceníku stadionu / m |
| vybavení (míče, dresy o úroveň) | cena podle ceníku vybavení / m |
| zaplacení výpovědní pokuty u současného sponzora | pokuta / m |

Odhad šance sponzora u sezónních slibů vychází z ambice (vysoká ambice = nízká šance), u termínových 70 %.

### Kolo jednání

- Cena ≤ O: **přijme**.
- O < cena ≤ 1,15 O: **protinabídka**. Sponzor buď sníží nejdražší peněžní položku tak, aby cena = O,
  nebo (když má nesplněné přání) nabídne původní návrh výměnou za jeden slib ze svých přání.
- Cena > 1,15 O: odmítne, trpělivost −1. Cena > 1,5 O: navíc náklonnost −3.
- Trpělivost `2 + floor(favor / 25)`. Při nule sponzor odchází a 14 herních dní nejedná (`cooldown_until`).
- Otevřené jednání vyprší 7 herních dní od otevření (`expires_game_date`), stav `expired`.
- Délka smlouvy 1–3 sezóny volí klub. Opatrný přidá +5 % ochoty za každou sezónu nad jednu.

### Co klub vidí

- Přání sponzora, trpělivost, odhad ochoty jako rozmezí `O × (1 ± šířka)`,
  šířka lineárně od 30 % (náklonnost 0) po 5 % (náklonnost 100).
- U každého slibu přínos k ochotě a pokutu za nesplnění.
- Srovnání se současnou smlouvou včetně výpovědní pokuty.

### Obrazovka `/sponzor/[id]/jednani` (mobil nejdřív)

1. Majitel, přání, trpělivost, odhad ochoty.
2. Sliby jako karty, klepnutím přidat, parametr vybrat (místo, zařízení a úroveň, licence).
3. Požadavky: měsíčně, za výhru, za podpis, bonusy za cíle, stavba/vybavení, zaplatit pokutu u současného.
4. Délka smlouvy.
5. Tlačítko Navrhnout na konci stránky, bez ceny v textu.
6. Odpověď majitele (šablony podle povahy, bez dlouhých pomlček), historie kol.
7. Po přijetí potvrzení se shrnutím všech slibů, odměn a pokut, pak podpis.

Podpis používá stávající tok (`sponsors/sign`): exkluzivita, přejmenování, reputace −3, zpráva do ligy.
Klient neposílá žádné částky mimo aktuální návrh; server přepočítá cenu a ochotu sám.

### API

- `POST /api/teams/:teamId/sponsors/:sponsorId/negotiations` — otevřít (kategorie main|stadium), vrátí stav.
- `GET /api/teams/:teamId/sponsors/negotiations/:id` — stav.
- `POST /api/teams/:teamId/sponsors/negotiations/:id/propose` — návrh (sliby + požadavky + délka), vrátí odpověď.
- `POST /api/teams/:teamId/sponsors/negotiations/:id/accept` — podpis přijatého nebo protinabídky.
- Prodloužení je jednání se stávajícím sponzorem; náklonnost +5 za každou odehranou sezónu spolupráce.
- Dnešní pevné nabídky hlavního sponzora a stadionu zmizí (API i web).

### Data (migrace 0218)

- `sponsor_negotiations(id, team_id, sponsor_id, category, wishes JSON, budget_b, patience, rounds JSON,
  status open|accepted|walked_away|expired|signed, expires_game_date, cooldown_until, created_at)`.
- `sponsor_contracts` + `signing_bonus`, `paid_construction` JSON, `breaches_season`, `negotiation_id`.

## Etapa 3: Plnění slibů a sankce

### Data (migrace 0218 spolu s etapou 2)

`sponsor_promises(id, contract_id, team_id, sponsor_id, kind, params JSON, season INTEGER NULL,
deadline_game_date TEXT NULL, value_share REAL, reward INTEGER, penalty INTEGER,
status pending|fulfilled|partial|broken, resolved_at)`.

### Vyhodnocení

- **Denní tick:** `coach_licence`, `stadium_upgrade`, `jersey_logo` — splněno, jakmile platí; porušeno, když uplyne termín.
- **Rollover, před expirací smluv:** všechny sezónní sliby dané sezóny.
- **Exkluzivita oboru:** podpis banneru stejného oboru se zakáže s vysvětlením (nevzniká porušení).
- **Těsně vedle** (`partial`): umístění o jedno místo horší, návštěva do 10 % pod cílem, reputace do 3 bodů pod cílem.

### Důsledky

- Splněno: bonus (pokud byl vyjednán) jako transakce `sponsor_bonus`, náklonnost +5, SMS od majitele.
- `partial`: polovina pokuty, náklonnost −3.
- Porušeno: pokuta `value_share × B × měsíce sezóny` jako transakce `sponsor_penalty`, náklonnost −8, `breaches_season + 1`.
- Druhé porušení v sezóně, nebo porušený `no_relegation`/`promotion`: sponzor smlouvu vypoví.
  Stav `terminated`, návrat názvu (`SK <obec>` jako u ukončení klubem), reputace −5, zpráva do ligy, SMS.
  Klub neplatí výpovědní pokutu, ale pokuty za porušené sliby ano.
- Zaplacenou stavbu ani podpisový příspěvek sponzor zpět nechce.

### Obrazovky

- `/sponzori`: u aktivní smlouvy seznam slibů se stavem (čeká / splněno / těsně vedle / porušeno) a termínem.
- Finance: transakce bonusů a pokut s popisem slibu.

## Přechod stávajících smluv

- Stávající smlouvy běží dál beze slibů do konce své délky.
- Prodloužení už probíhá jednáním (etapa 2).

## Testování

- Unit testy čistých funkcí v `apps/api/src/sponsors/negotiation.ts` (bez DB):
  B, hodnota slibů, cena požadavků, přijetí / protinabídka / odmítnutí, trpělivost, sankce, `partial`.
- API přes curl na testu (otevřít jednání, návrhy, podpis, chyby: obsazený sponzor, cooldown, podvržené částky).
- Prohlížeč na testu: pozvání majitele, jednání, protinabídka, podpis, zobrazení slibů.
- Vyhodnocení slibů a rollover na lokální DB s posunutým herním časem (viz `reference_lokalni_beh_runneru`).

## Mimo rozsah

- AI chat s majitelem (možné později jako barva nad pevnými pravidly).
- Vyjednávání o bannerech.
- Konflikt oborů mezi hlavním sponzorem a bannery nad rámec slibu `sector_exclusivity`.
