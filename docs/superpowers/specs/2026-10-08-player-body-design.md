# Postava hráče: výška a váha ve hře (část 1 ze 3)

Datum: 2026-10-08. Stav: návrh ke schválení.

## Proč

Výška a váha se hráčům generují a ukazují v profilu, ale na hru nemají žádný vliv. Engine je
vůbec nezná (`MatchPlayer`, `engine/types.ts`). Váha na výšce nezávisí: na produkci je výška
168–194 cm a váha 61–108 kg bez vztahu, takže hráč se 170 cm klidně váží 100 kg a hráč se
194 cm 65 kg. Rychlost a výdrž s váhou nesouvisí. Typ postavy (`bodyType`) se při vytvoření
hráče použije a zahodí, při načtení se všude dosazuje natvrdo `"normal"`.

Uživatel chce, aby postava ovlivňovala vlastnosti (váha hlavně pohybové) a aby šlo hráče dostat
do formy. Zvolená varianta je B + C, rozdělená na tři části:

1. **Postava a její vliv** (tento dokument): uložit typ postavy, nadváha ubírá rychlost a výdrž,
   hmotnost přidává v soubojích, výška působí na hlavičky a dosah brankáře.
2. **Váha v čase**: týdenní posun váhy (pivo, trénink, zranění, léto, věk), růst dorostu.
3. **Cesty do formy**: individuální plán, kondiční trenér, posilovna, domluva přes SMS, pivní
   pravidlo a kabinová sázka, soustředění a předsezónní vážení.

Části 2 a 3 dostanou vlastní specifikaci. Tato část musí fungovat sama, i když se váha zatím nemění.

## Rozhodnutí

- Postava mění **vlastnosti v zápase a v profilu**, ne celkové hodnocení. `overallRatingFromFlat`,
  tržní cena, mzdy, trénink i vývoj pracují dál s natrénovanými hodnotami. Na produkci tak nic
  neskočí a kdo zhubne, má vlastnosti zpátky hned.
- Stávajícím hráčům se **výška ani váha nemění**. Typ postavy se dopočítá z dnešního BMI.
- Hodnoty v tabulce níž jsou výchozí. Doladí se simulací (viz Testování), stejně jako kalibrace
  gólů u formy a únavy.

## Data

`players.physical` (JSON) dostane klíč `bodyType`: `"thin" | "normal" | "athletic" | "stocky" | "obese"`
(stávající typ `BodyType` v `generators/physicals.ts`). Nový sloupec není potřeba.

Pohárové velkokluby (`cup_club_players`) mají výšku a váhu u všech 504 hráčů, typ postavy dostanou
stejným převodem.

## Vzorce

Ideální váha: `IDEAL_BMI × (výška v m)²`, `IDEAL_BMI = 23,5` (180 cm → 76 kg, 190 cm → 85 kg).
`excess = váha − ideál`. Tolerance `WEIGHT_TOLERANCE_KG = 4`: do ±4 kg se nic neděje.

| Vliv | Vzorec | Strop | Příklad |
|---|---|---|---|
| Nadváha → rychlost | −1 za každé 2 kg nad `excess − 4` | −12 | 180 cm / 90 kg: −5 |
| Nadváha → výdrž | stejně jako rychlost | −12 | 180 cm / 90 kg: −5 |
| Hmotnost → síla | +1 za každé 4 kg `excess` nad 0 | +4 | 180 cm / 90 kg: +3 |
| Podváha → síla | když `excess < −4`: −1 za každé 2 kg z `(−excess − 4)` | −6 | 190 cm / 70 kg: −5 |
| Výška → hlavičky | `(výška − 180) × 0,4` | ±5 | 192 cm: +5, 170 cm: −4 |
| Výška brankáře → dosah | násobek `1 + (výška − 185) × 0,008` | 0,9–1,1 | 193 cm: ×1,064 |

- Úpravy se zaokrouhlí na celé body (`Math.round`) a výsledná vlastnost nesmí klesnout pod 1.
- Hráč s nadváhou je zároveň pomalejší a silnější v soubojích. To je záměr: těžký stoper se hůř
  obchází, ale nestíhá.
- Chybí-li výška nebo váha, žádná úprava (neutrální).
- Dosah brankáře působí jen tam, kde jde o vysoké míče: `calcAerialProb` (rohy a centry ze
  standardek, složka brankáře v `cover`) a hlavičkové šance ze hry v `calcGoalProb`
  (`isHeader`, složka brankáře v `defenseVal`).

## Kód

### Jeden zdroj vzorců

`generators/physicals.ts`:

- `idealWeight(heightCm: number): number`
- `bodyEffects(physical): { speed, stamina, strength, heading, gkReach }`. Celá čísla pro
  vlastnosti, násobek pro dosah, vše neutrální při chybějících údajích.
- `applyBodyEffects(player: MatchPlayer, physical): void` přičte úpravy k vlastnostem hráče
  pro engine a nastaví `height`.

### Kde se úpravy použijí

| Místo | Soubor | Co pokryje |
|---|---|---|
| Stavba hráčů pro zápas | `multiplayer/match-runner.ts`, `buildMatchPlayers` | liga, pohár, turnaj, přátelák |
| Náhled sestavy | `engine/lineup-loader.ts`, `mapRowToMatchPlayer` | náhled síly, AI sestava soupeře |
| Detail hráče v API | `routes/teams.ts:1022` | profil na webu |

Engine: `MatchPlayer` dostane `height?: number`. Úpravy rychlosti, výdrže, síly a hlaviček jdou přes
vlastnosti, takže se samy promítnou do únavy (`updateCondition`), útoku a brejků, soubojů, výběru
hlavičkáře, shody taktiky (pressing, nakopávaná) i náhledu sestavy. Nová logika v enginu je jen
dosah brankáře.

Úpravy se **nepoužijí** v tréninku, ročním vývoji, `overallRatingFromFlat`, tržní ceně ani mzdách.

### API

`GET /api/teams/:id/players/:playerId` přidá:

```json
"body": {
  "bodyType": "stocky",
  "idealWeight": 76,
  "effects": { "speed": -5, "stamina": -5, "strength": 3, "heading": 0 }
}
```

### Web

`apps/web/src/app/(hra)/hrac/[id]/page.tsx`:

- Řádky „Výška“ a „Váha“ (`DetailRow`, dnes ř. 1029–1030): váha s ideálem, např. „90 kg (ideál 76 kg)“,
  a nový řádek „Postava“ (hubená, normální, atletická, zavalitá, obézní).
- `AttrRow` pro rychlost, výdrž, sílu a hlavičky ukáže hodnotu po úpravě a za ní poznámku
  „(−5 nadváha)“, „(+3 hmotnost)“, „(−5 podváha)“, „(+4 výška)“. Bez úpravy beze změny.
- Žádný nový sloupec v tabulkách (mobile-first), písmo poznámky min. `text-sm`.

### Generátor

`generateHeightWeight(rng, position, bodyType)`: výška beze změny (podle postu ±8 cm), váha
`idealWeight(výška) × koeficient ± 3 kg`:

| Postava | Koeficient | BMI zhruba |
|---|---|---|
| thin | 0,88 | 21 |
| athletic | 1,00 | 23,5 |
| normal | 1,05 | 25 |
| stocky | 1,15 | 27 |
| obese | 1,32 | 31 |

`create-player.ts` a `season/celebrity-spawn.ts` uloží `bodyType` do `physical`. Místa s natvrdo
dosazeným `"normal"` budou číst `physical.bodyType ?? "normal"`: `season/daily-tick.ts:401`,
`season/league-round.ts:517`, `routes/game.ts:1342`.

## Převod dat (migrace 0255)

`migrations/0255_player_body_type.sql`. Číslo ověřit těsně před commitem, souběžně pracují jiné sessions.

1. `players` a `cup_club_players` s výškou a váhou: `bodyType` z BMI.
   - pod 20: `thin`
   - 20–25: `athletic`, když `speed + stamina ≥ 70`, jinak `normal`
   - 25–30: `stocky`
   - 30 a víc: `obese`

   Odhad na produkci: 65 hubených, 785 atletických nebo normálních, 692 zavalitých, 105 obézních.
2. Hráči bez výšky (na produkci 54): výška podle postu ±8 cm, typ `normal`, váha
   `ideál × 1,05` ± 3 kg (SQLite `random()`).
3. Nikomu jinému se výška ani váha nemění.

Postup: lokální SQLite kopie, pak `prales-db-test`, pak produkce. Na produkci záloha
(`wrangler d1 export`), převod spustí uživatel přes `!` (hook `block-prod-d1-write` UPDATE blokuje).
Převod musí být idempotentní, aby opakované spuštění nic nezměnilo.

## Testování

**Jednotkové testy**
- `bodyEffects`: tolerance, příklady z tabulky, stropy, chybějící údaje, vlastnost nepadne pod 1.
- Generátor: průměrné BMI podle postavy sedí s tabulkou, váha roste s výškou.
- `applyBodyEffects` mění jen vlastnosti engine hráče, nesahá do vstupního JSON.

**Převodní SQL**
- Lokální SQLite: rozdělení typů, nikomu se nezmění výška ani váha (kromě 54 bez výšky), druhé
  spuštění nic nezmění.

**Rovnováha** (srovnání s verzí před změnou, 3000 zápasů na scénář, jako u formy)
- Vyrovnané týmy: gólovost a poměr výher beze změny víc než ±3 %. Jinak doladit konstanty.
- Tým s nadváhou (všichni +12 kg) ztrácí v závěru víc než tým v normě.
- Vysoký útočník vyhrává víc hlaviček, vysoký brankář chytá víc rohů.

**Test prostředí**
- Převod na `prales-db-test`, kontrola rozdělení dotazem.
- `curl` / browser fetch detailu hráče: pole `body`.
- Profil hráče v prohlížeči na desktopu i v 375 px: poznámky u vlastností, řádky váhy a postavy.
- Náhled sestavy a odehraný zápas (přátelák nebo kolo) bez chyb v logu.

**Produkce**: až po „nasaď na main“. Záloha, převod přes `!`, cherry-pick schválených commitů.

## Mimo rozsah

- Změny váhy v čase a růst dorostu (část 2).
- Akce manažera pro hubnutí (část 3).
- Vliv postavy na hodnocení, cenu a mzdu (zamítnuto).
- Silnější noha a strana.
