# Přístavby tribun (část 3): návrh a plán

Navazuje na `2026-10-04-tribuny-po-stranach.md` (části 1 a 2 hotové: čtyři strany a 3D po stranách).
Spec: `docs/superpowers/specs/2026-10-04-tribuny-pristavby-design.md`. Uživatel schválil celý rozsah včetně náhledu.

## Model

- **8 míst k zastavění** (`stadium_extensions`, PK `team_id + slot`): 4 postranní (`ext_main`, `ext_opposite`,
  `ext_goal_west`, `ext_goal_east`) a 4 rohová (`corner_main_goal_east`, `corner_main_goal_west`,
  `corner_opposite_goal_east`, `corner_opposite_goal_west`). V jednom místě stojí jedna přístavba;
  vylepšuje se na úroveň 1–3, druh se nemění.
- **13 druhů**: length, second_tier, double_stand, stilts, tower, footbridge, terrace, round_stand, mobile
  (postranní místa); corner, curved_corner, wing, bridge, mobile (rohy).
- **Kapacita** přístaveb je součet kapacit postavených kusů, drží ji sloupec `stadiums.stand_ext_capacity`
  (přepočítá se při každé stavbě), aby všechna čtecí místa mohla kapacitu číst bez dalšího dotazu.
- **Ceny** za úroveň = přírůstek míst × cena za místo na dané úrovni × násobek druhu. Cena za místo
  (611 / 850 / 2143 Kč) je odvozená ze stávajících cen tribun (55 000 / 170 000 / 450 000 Kč za 90 / 200 / 210 míst přírůstku),
  takže přístavby nejsou levnější ani dražší než tribuny samotné.
- **Podmínky**: úroveň sousedních tribun (viz katalog) + stávající pravidla odemykání úrovní
  (`STADIUM_UNLOCK`: reputace, odehrané zápasy, sezóna), lokálně přepínatelná jako u ostatních zařízení.
- **Náhled**: čistě klientský. Průhledný 3D tvar na místě stavby + kapacita před a po + cena. Nic se nezapisuje.
- **Beze změny**: střecha, lóže, kotel. Škody výtržností se přístavbám nepřičítají (mimo rozsah).

## Kroky

1. Katalog (čistá logika) + testy: `apps/api/src/stadium/extension-catalog.ts`.
2. Migrace 0240, DB vrstva (`extensions-db.ts`), napojení kapacity do čtecích míst, API (GET v odpovědi stadionu, POST stavby) + testy.
3. 3D: `StandExtensions.tsx` (všech 13 tvarů + průhledný náhled), napojení do `Stadium3D`.
4. UI: sekce „Přístavby tribun" na stránce stadionu, náhled, stavba, mobil.
5. Ověření na localhostu, připravené kombinace pro uživatele.
