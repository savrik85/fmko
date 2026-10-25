# AI kluby: ověření na localhostu nad kopií produkce (noc 25. 10. 2026)

Kopie produkce: záloha `prod-pred-0275-20261025.sql` (25. 10. 00:42) + migrace 0275, 0276 a další z této větve.
Lokální API `http://localhost:8790` (`wrangler dev --env testing --persist-to backups/local-state`),
web `http://localhost:3300`. Nic se nepushovalo, do produkční ani testovací DB se nic nezapisovalo.

Simulace více dní: `backups/sim/sim-ai.ts` (skutečný denní tick, AI trenéři, pohár, kola lig a přáteláky
nad `node:sqlite`, hodiny simulace přes podvržený `Date`).

## Výchozí stav (kopie produkce před změnami)

| Liga | AI kluby: síla jedenáctky | Lidské kluby: síla jedenáctky |
|---|---|---|
| Přebor Prahy | 29,2–34,5 (5 klubů) | 36,9–66,1 (9, z toho 3 opuštěné) |
| OP České Budějovice | 28,8–37,4 (13 klubů) | 60,4 (Řeznictví Černý) |
| OP Prachatice | žádné | 51,3–62,7 |

Bez řádku stadionu 33 klubů, bez vybavení 46 klubů. AI trenéři bez povahy (22), žádné rozhodnutí.

## Nastavení (pořadí, jak poběží na produkci)

Všechno přes admin rozhraní (`/api/admin/ai-clubs/*`), nejdřív nanečisto, pak naostro, seed 20261025.

1. Noční tick (cron `0 3`): denní tick + převzetí opuštěných klubů. AI převzal přesně
   **Autolakovku, Kobylisy a Kebab** (+ jejich U21), každý dostal trenéra s povahou. Rohlík Podolí ne.
2. Narovnání Prahy (`league-humans`) a U21 Prahy, ČB (`newcomer`) a U21 ČB. 0 chybných příkazů.
3. III. třída Prachatice (`lower-league`): 14 klubů, U21 liga se 182 zápasy, bez postupu v okrese.
4. Stadion a vybavení všem klubům (28 stadionů, 26 vybavení), úklid 2 AI trenérů u U21, otevření ČB.

| Liga | Síla jedenáctky AI klubů po nastavení | Rozpočty AI klubů |
|---|---|---|
| Přebor Prahy (8 AI: 5 původních + 3 převzaté) | 52,2–65,2 (lidé 45,7–66,3) | 53–153 tis., převzaté beze změny |
| OP České Budějovice (13 AI) | 34,3–45,6 | 21–100 tis. |
| III. třída Prachatice (14 AI) | 39,5–50,7 | 20–51 tis. |

Rozpis III. třídy: 26 kol ve středy a neděle 18:00, 28. 10. 2026 až 24. 1. 2027, U21 vždy o den později.

## Scénáře

| # | Scénář | Výsledek |
|---|---|---|
| 1 | Otevření ČB | ✅ okres `preparing` → `ready`, registrace v ČB projde, ČB ve výběru lig |
| 2 | III. třída | ✅ 14 klubů, 26 kol st/ne, U21 +24 h, v simulaci se kola hrají ve správné dny |
| 3 | Nová registrace přepíše AI klub | ✅ „FK Lišov Test“ v ČB: místo AI klubu, nový kádr 22 hráčů (průměr 35,2), rozpočet 40 tis., žádní zaměstnanci ani AI trenér po předchůdci, AI klubů v ČB 13 → 12 |
| 3b | Návrat vlastníka opuštěného klubu | ✅ bývalý vlastník Kobylis dostane nabídku a klub zpět i se svým trenérem, AI trenér zmizí |
| 4 | Převzetí opuštěných | ✅ přesně 3 pražské kluby, Podolí (34 dní) ne |
| 5 | Narovnání | ✅ viz tabulka; hráčům zůstane prostor k růstu (oprava v noci: strop potenciálu se posouvá s dovedností) |
| 7 | Pokusy obrat AI klub | ✅ viz níže |

### Scénář 7: pokusy obrat AI klub (přes API jako lidský manažer)

- Dvorce nabídly 20 000 Kč za Lukáše Horáka (Řeporyje, tržní hodnota zhruba 64 000): AI odmítla
  (pod pojistkou 60 %, sama by chtěla 104 800, je to opora). Druhou nabídku hned zablokovala pauza 10 dní.
- Klamovka nabídla 70 000 Kč s 10% zálohou a 20 splátkami za Matěje Veselého (tržní hodnota zhruba 46 500):
  dnešní hodnota po srážce za riziko 53 089, AI chce 84 500 → odmítnuto.
- Klamovka nabídla 9 000 Kč za náhradníka Pavla Kučeru (37 let, AI chce aspoň 6 000): AI přijala,
  hráč přešel, Klamovka −9 000, Řeporyje +9 000.

## Nalezené chyby mimo rozsah (jen nahlášeno, neopraveno)

- `apps/api/src/fans/fan-banner.ts:73` čte `SELECT tactic FROM teams`, sloupec `teams.tactic` neexistuje
  (taktika je v `lineups`). Každý přepočet plachty zaloguje varování „taktika pro transparent“ a plachty
  s výtkou k taktice nevznikají. Na produkci to běží denně u každého lidského klubu.
