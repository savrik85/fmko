# Tribuny po jednotlivých kusech a přístavby (design)

Stav: návrh ke schválení. Datum: 2026-10-04.

## Cíl

Dnes jsou tribuny jedno číslo `stadiums.stands` (0–3). Hráč nemá žádnou volbu
tvaru ani místa a stadiony vypadají stejně. Chceme, aby každý klub rozvíjel
stadion jinak: tribuny se staví a vylepšují po jednotlivých stranách, k tomu
přibývají přístavby s různými tvary a hráč před stavbou vidí náhled.

Z prod dat (2026-10-04): z 48 klubů má 29 stadion bez tribun, 11 je na L2,
4 na L1, 1 na L3. L2 je tedy dnešní reálný strop a od něj musí vést víc cest.

## Rozsah

**Mění se:** tribuny (`stands`), jejich kapacita, nabídka upgradů, 3D scéna
tribun, náhled před stavbou.

**Beze změny:** střecha (`roof`, hodně klubů ji už koupilo), VIP lóže
(`vip_box`), sektor kotle (`ultras_stand`). Jen se přepojí podmínka
„jsou postavené tribuny" na „je postavená aspoň jedna tribuna".

## Model

### Čtyři tribuny

Strany: `main` (hlavní), `opposite` (protější), `goal_west`, `goal_east`
(za brankami). Každá má úroveň 0–3.

### Přístavby

Přístavba patří ke konkrétní tribuně nebo rohu a má úroveň 1–3.

| Přístavba | Kde | Podmínka |
|---|---|---|
| Prodloužení do délky | main, opposite | tribuna L1+ |
| Rohová tribuna (4 rohy) | roh | obě sousední strany L1+ |
| Zahnutá tribuna | roh | obě sousední strany L2+ |
| Druhé patro | libovolná strana | tribuna L3 |
| Dvojitá tribuna | main, opposite | tribuna L3 |
| Boční křídlo (tvar L) | boky | tribuna L2+ |
| Stupňovitý val / terasovitá tribuna | goal_* | bez podmínky (levné, nekryté) |
| Točená tribuna (půlkruh) | goal_* | tribuna L2+ |
| Tribuna na pilotech | main | tribuna L2+ |
| Tribuna s věží | main | tribuna L2+ |
| Dřevěná lávka u plotu | main, opposite | bez podmínky |
| Mobilní tribunka | libovolné volné místo | bez podmínky, nízká životnost |
| Napojovací most | mezi dvěma tribunami | obě L2+ |

Přesné kapacity, ceny a odemykání se doladí při plánu implementace podle
prod dat (zásada: konstanty z dat, ne z hlavy).

### Kapacita

Celková kapacita tribun = součet kapacit tribun a přístaveb. Měřítko zůstává
okresní: plně vybudovaný stadion zhruba 1 500–2 500 míst. Stávající
`STANDS_CAPACITY` ([0, 90, 290, 500]) se nahradí funkcí nad kusy, takže text
v nabídce upgradu a `capacityBonus` mají dál jediný zdroj.

## Převod stávajících dat

Jednorázová migrace: každá tribuna dostane dnešní úroveň `stands`
(L2 → čtyři tribuny L2). Součet kapacity se při převodu **zachová** (každá
tribuna dává zhruba čtvrtinu dnešního bonusu, zaokrouhlovací zbytek dostane
`main`). Nikdo nepřijde o místa ani peníze a nic se nezmění v poptávce,
tržbách ani sponzorech. Kapacita dál roste novými úrovněmi a přístavbami.

Migrace jde na test ručně přes `wrangler d1 execute` (migrace často selhávají
na existujících tabulkách). Na prod jen po výslovném souhlasu a po záloze.

## Náhled před stavbou

Při výběru přístavby se na místě stavby zobrazí průhledná 3D verze. K ní
patří kapacita před a po, cena a dopad na atmosféru. Stavbu hráč potvrdí
nebo zruší. Náhled je čistě klientský (bez zápisu), data bere z téhož
zdroje jako skutečná stavba.

## Napojení na stávající kód

- `apps/api/src/stadium/stadium-generator.ts`: `UPGRADE_COSTS.stands`,
  `STANDS_CAPACITY`, `getUpgradeOptions`, `calculateFacilityEffects`
  (`capacityBonus`).
- `apps/api/src/stadium/sektory.ts`: podíl hlavní tribuny a kotle podle `stands`.
- `apps/api/src/routes/game.ts`: stavba tribun (`stadium/upgrade`), čtení
  stadionu. Nový endpoint na stavbu přístavby.
- `routes/sponsors.ts`, `teams.ts`, `matches.ts`, `cup`, `match-runner`:
  místa, kde se čte `stands`.
- `apps/web/.../stadium-3d/Stand.tsx`, `Stadium3D.tsx`, `constants.ts`,
  `VipBox.tsx`: 3D tribuny, layout a pohledy.
- `apps/web/.../stadium/stadium-view.tsx`: nabídka upgradů a náhled.

## Rozdělení práce

Samostatné kroky, každý po dohodě otestovaný na localhostu:

1. Datový model, migrace a převod, kapacita (API) + testy.
2. Nabídka a stavba tribun po stranách (API + UI), bez nových tvarů.
3. 3D tribun po stranách, napojení layoutu na čtyři úrovně.
4. Přístavby: rohy, prodloužení, patra, křídla (API + 3D).
5. Přístavby: tvary (zahnutá, točená, val, piloty, věž, lávka, mobilní, most).
6. Náhled před stavbou.

## Testování

API: unit testy kapacity a převodu (součet kapacity před a po stejný),
curl na endpointy. FE: MCP browser na localhostu, mobil 375 px, všechny
větve (nedostatek peněz, nesplněná podmínka, zrušení náhledu). Hráči
nesmí zmizet místa ani peníze při převodu.

## Otevřené body

- Přesné kapacity, ceny a odemykání jednotlivých přístaveb.
- Zda se vedle sebe stojící tribuny stejného typu vizuálně spojují (zjednodušení
  3D vs. vzhled).
- Co se stane s VIP lóží (`vip_box`) a rohy při převodu, pokud klub už lóži má.
