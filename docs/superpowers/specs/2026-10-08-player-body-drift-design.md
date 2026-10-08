# Postava hráče: váha v čase a růst dorostu (část 2 ze 3)

Datum: 2026-10-08. Navazuje na `2026-10-08-player-body-design.md` (část 1: postava mění vlastnosti).
Schváleno uživatelem po oddílech: denní posun (varianta 1), realistické tempo, trend + SMS od štábu.

## Proč

Po části 1 nadváha ubírá rychlost a výdrž, ale váha se nikdy nemění. Hospoda, trénink ani
zranění se na postavě neprojeví a dorost neroste. Část 3 (cesty do formy) bez toho nemá co měnit.

## Data

- `players.physical.weight` se ukládá s přesností na 0,01 kg, zobrazuje se na desetiny s čárkou (96,4 kg).
- `physical.bodyType` (část 1) je konstituce a nemění se.
- Přirozená váha: `idealWeight(výška) × BODY_WEIGHT_FACTOR[bodyType] × (1 + max(0, věk − 28) × 0,005)`.
  Bez `bodyType` nebo výšky se tah k přirozené váze nepočítá.
- Nová tabulka `weight_log` (migrace 0256): `id, player_id, team_id, game_date, weight REAL, source TEXT
  ('weekly' | 'summer' | 'growth'), created_at`, index `(player_id, game_date)`. Záznamy starší než
  365 dní se mažou v pondělním ticku. `remove-player` maže i záznamy hráče.

## Denní změna (denní tick)

Jen hráči týmů, které denní tick trénuje (lidské týmy a jejich U21). AI váhu nemění.

| Vliv | Změna za den |
|---|---|
| Tah k přirozené váze (jen shora, od 2026-10-08) | `0,006 × (přirozená − váha)`, když je váha nad přirozenou; pod ní 0 |
| Byl dnes v hospodě (`pub_sessions.attendees` dnešního dne) | `+0,08 × (0,5 + alkohol / 100)` |
| Byl dnes na tréninku | `−0,03`, kondiční trénink `−0,07`; bez plánu hubnutí nejvýš na přirozenou váhu |
| Je zraněný (`injuries.days_remaining > 0`, ne `osobni_volno`) | `+0,03` |

Výsledek se zaokrouhlí na 0,01 a drží v rozsahu 50–140 kg. Běží po vygenerování dnešní hospody;
docházku a druh tréninku dne si tick zapamatuje v tréninkové části. Zápis dávkou po týmech.

Cíle za 30 dní (pevné testy měsíční simulace; konstanty se ladí jen podle nich):

| Hráč | Za 30 dní |
|---|---|
| Štamgast: hospoda 13× za měsíc, alkohol 80, netrénuje, start na přirozené váze | +1,0 až +1,5 kg |
| Průměr: hospoda 6×, alkohol 50, 8 tréninků (2 kondiční), start na přirozené | −0,3 až +0,3 kg |
| Dříč 5 kg nad přirozenou: bez hospody, 17 tréninků (4 kondiční) | −1,0 až −1,8 kg |
| Zraněný celý měsíc, start na přirozené | +0,6 až +1,0 kg |

## Léto

V letním souhrnu (`season-recap.ts`, větev `applyEffects`, jednou za sezónu díky `summerApplied`)
každý hráč kádru lidského týmu:

| Co | Změna |
|---|---|
| Léto bez fotbalu | +1 kg |
| Alkohol nad 60 | +1 kg |
| Věk 30+ | +0,5 kg |
| Letní příběh `fit` | −2,5 kg |
| Letní příběh `rusty` nebo `injury` | +1 kg |

Součet se ořízne na ±3 kg. Zapíše se záznam `weight_log` se zdrojem `summer`.

## Růst dorostu

Hned po dospívání (`dospejMladeHrace`) na obou místech, kde přibývá věk (`season-departures.ts`
`bumpAges`, `season-rollover.ts` U21). Podle nového věku:

| Nový věk | Výška |
|---|---|
| do 17 | +2 až +4 cm |
| 18 | +1 až +2 cm |
| 19+ | 0 |

Náhoda deterministicky ze `seedFromString(playerId + ":growth:" + nový věk)`. Váha roste se zachováním
BMI: `váha × (nová výška / stará výška)²`. Záznam `weight_log` se zdrojem `growth`.

## Viditelnost

**Týdenní záznam:** v pondělí herního týdne (`dayOfWeek === 1`) po denní změně se pro každého hráče
z denní změny zapíše `weight_log` se zdrojem `weekly`.

**Trend:** `trend30d = aktuální váha − váha záznamu nejbližšího 28 dnům zpět`, bere se jen záznam
staný 14 až 42 dní. Jinak `null`. Detail hráče ho vrací v `body.trend30d`, jen u vlastních hráčů
(cizí `null`).

**Endpoint:** `GET /api/teams/:id/players/:playerId/weight-log` (posledních 12 záznamů), stejná
autorizace jako `condition-log`.

**Profil:** řádek Váha „96,4 kg (ideál 76 kg)“, pod ním řádek „Za měsíc“ s trendem: červeně, když
hráč přibírá a je nad ideálem o víc než toleranci, zeleně, když se k ideálu blíží, jinak neutrálně.
Na záložce Historie karta „Vývoj váhy“ (seznam záznamů se změnou a zdrojem Týden / Léto / Růst).
Mobile-first, nejméně `text-sm`.

**SMS od štábu:** po pondělním záznamu, když `trend` proti záznamu 21–35 dní starému je ≥ 3 kg
a hráč nedostal váhovou SMS 30 dní (`life_context.weightSmsAt`, herní datum). Odesílatel: role
`kondicni_trener` → „Kondiční trenér“, jinak `maser` → „Masér“, jinak „Kapitán“. Text podle příčiny
(aktivní zranění → zranění; aspoň 6 návštěv hospody za 28 dní → hospoda; jinak netrénuje), z každé
aspoň tři varianty, bez dlouhé pomlčky.

## Testování

- Jednotkové: denní změna, měsíční cíle, přirozená váha s věkem, léto se stropem, růst a BMI,
  trend, podmínky SMS a výběr textu.
- Test routy nad SQLite (Miniflare): `weight-log` a `body.trend30d`, u cizího hráče `null`.
- Test prostředí: migrace 0256, ruční denní tick (váhy v desetinách, pondělní záznam), vynucená SMS
  na připraveném hráči, profil na desktopu a 375 px.
- Produkce: až s částí 1 a po „nasaď na main“; záloha před 0256.

## Mimo rozsah

Akce manažera pro hubnutí (část 3). Změna `bodyType` v čase. AI týmy.
