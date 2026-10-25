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
| Přebor Prahy (8 AI: 5 původních + 3 převzaté) | 52,2–64,9 (lidé 45,7–66,3) | 53–153 tis., převzaté beze změny |
| OP České Budějovice (13 AI) | 34,3–45,6 | 21–100 tis. |
| III. třída Prachatice (14 AI) | 39,5–50,7 | 20–51 tis. |

Po opravách v noci (níže) narovnání v Praze srovná i rezervu hráčů do stropu dovedností
(AI 8–14 bodů na dovednost, lidé 5,4–17,6, dřív AI 20–25) a vlastnosti AI trenérů
(např. Meteor Žižkov koučování/taktika/disciplína 33/40/28 → 45/51/54). Celé nastavení
jde zopakovat skriptem `backups/sim/setup.ts` nad čerstvou kopií (`backups/prod-base.sqlite`).

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
| 6 | Mobil 375 px | ✅ tabulka OP Prachatice a III. třídy (bez barev postupu a sestupu), stránka AI klubu s kartou trenéra „Jakub Kučera (AI)“, admin „AI trenéři“ (režimy, statistika, povaha); nic nepřetéká (šířka obsahu 371 = okno) |
| 7 | Pokusy obrat AI klub | ✅ viz níže |
| 8 | 14 dní se skutečným Workers AI | ✅ viz níže |
| 9 | 96 dní, konec sezóny a nová sezóna | ✅ viz níže |
| 10 | Hlavní sponzor AI klubu | ✅ 34 z 35 AI klubů podepsalo (35. už sponzora měl), průměr 25,6 tis. Kč/měs (lidé 33,3 tis.), přejmenování a −3 reputace jako u člověka; volných firem zůstává dost (Prachatice 47, Praha 28, ČB 12) |
| 11 | Trh 30 dní s denním přestupovým cronem | ✅ viz níže |

### Scénář 7: pokusy obrat AI klub (přes API jako lidský manažer)

- Dvorce nabídly 20 000 Kč za Lukáše Horáka (Řeporyje, tržní hodnota zhruba 64 000): AI odmítla
  (pod pojistkou 60 %, sama by chtěla 104 800, je to opora). Druhou nabídku hned zablokovala pauza 10 dní.
- Klamovka nabídla 70 000 Kč s 10% zálohou a 20 splátkami za Matěje Veselého (tržní hodnota zhruba 46 500):
  dnešní hodnota po srážce za riziko 53 089, AI chce 84 500 → odmítnuto.
- Klamovka nabídla 9 000 Kč za náhradníka Pavla Kučeru (37 let, AI chce aspoň 6 000): AI přijala,
  hráč přešel, Klamovka −9 000, Řeporyje +9 000.

### Scénář 8: 14 dní se skutečným Workers AI (`@cf/openai/gpt-oss-120b`)

- Zápasová rozhodnutí: 137 od modelu, 4 náhradním pravidlem (model nestihl 120 s, 2,8 %).
  Týdenní správa: 70 od modelu, žádné náhradní pravidlo.
- Týdenní správa provedla 630 akcí, žádná neselhala: bannery 210, opravy vybavení 162, trénink 70,
  vylepšení vybavení 48, přesuny do U21 40, trávník 33, povýšení z U21 16, akademie 15, vstupné 14,
  nábor 12, stadion 10.
- Peníze: žádný klub v mínusu. Pražské AI kluby investovaly (převzatá Autolakovka −117 tis. a Kebab
  −77 tis. do stadionu z peněz po předchozích majitelích, Meteor −66 tis. do vybavení), rezervu drží.

### Scénář 9: 96 dní, konec sezóny, nová sezóna

- Všech 8 lig (4 áčka, 4 U21) odehrálo 26 z 26 kol, bez chyb. Konec sezóny čeká na finále poháru
  (so 30. 1.), pak proběhne celý (119 kroků): postupy a sestupy v 0 okresech (III. třída je má
  vypnuté), rozpis 4 lig a 4 U21 lig. Sezóna 4: přebory po a čt, U21 út a pá, III. třída st a ne
  (U21 po a čt), 7. 2. až 14. 5. 2027.
- Růst za 96 dní (síla jedenáctky, lidé v simulaci nic nedělají): Praha AI +2,8 až +5,1, lidé
  +1,4 až +2,5. Před opravou rezervy AI rostlo +3,6 až +7,6. Simulace lidi podceňuje: skutečný
  trénink lidí na produkci (30 dní před kopií) dává 5–50 bodů denně (medián 18), stejní lidé
  v simulaci 3–19, protože nikdo neřeší trucující hráče a docházka padá. AI v simulaci 6–16.
- Na konci: nejsilnější AI klub v Praze 68,0, Dvorce 68,55. Žádný AI klub v mínusu, medián
  rozpočtu AI v Praze +117 tis. za 96 dní (s hlavním sponzorem).

### Scénář 11: trh 30 dní s denním přestupovým cronem (`0 10`)

- Nabídky lidem bez odpovědi po 3 dnech propadají (25 propadlo; lidé v simulaci neodpovídají).
- Kluby mimo hru poslaly AI klubům 38 nabídek: 9 AI přijala (průměr 24,8 tis.), 29 odmítla
  (hlavně opory, hodnocení kolem 50). Mezi AI kluby 7 nabídek (4 odmítnuté, 3 stažené), záměrně vzácné.
- Inzeráty: žádný hráč vystavený víc než dvakrát za 30 dní (před opravou až 12×); aktivních
  AI inzerátů 54 na 36 klubů (1,5 na klub), lidé 36 na 20 klubů (1,8).

## Opravy v noci po testech

| Commit | Co | Proč |
|---|---|---|
| `b35a939e` | AI trenér v pondělní správě podepíše hlavního sponzora | AI kluby žádného neměly a nikdy by ho nepodepsaly |
| `a56e2f33` | Narovnání v Praze srovná rezervu do stropu dovedností podle lidí | AI hráči měli rezervu z generátoru a rostli 2–3× rychleji než lidé |
| `22071200` | AI trh: cílový kádr 24, neprodejné hráče znovu nevystavuje | s cílem 20 bylo AI trvale přeplněné, 91 hráčů vystavilo 730× |
| `912dc916` | Narovnání srovná vlastnosti AI trenérů s lidskými | v Praze o 3–10 bodů slabší (koučování zrychluje trénink, disciplína docházku) |
| `6230210e` | Přestupní kurz týdne volí model v pondělní správě (kupovat / držet / prodávat, posty, koho vystavit), trh se jím řídí | přestupy byly celé na pravidlech, model do nich nezasahoval; ceny dál jen kód |

Přestupní kurz se skutečným Workers AI (12 klubů z Prahy, ČB a III. třídy, kopie po nastavení):
11 rozhodl model, 1 náhradní pravidlo (limit 120 s), žádný chybný přestupní blok. Kurzy:
kupovat 2 (Řeporyje „aim to buy a better GK“ při potřebě brankáře 0,34), držet 5, prodávat 5.
Kód modelu nedovolí koupit tam, kde potřeba skoro není (Hluboká chtěla brankáře při potřebě 0,03).

## Známé rozdíly (záměr, nebo na později)

- Trucování po nenominaci u AI klubů nevzniká (končí přemlouváním v Telefonu, AI trenér nepíše);
  morálka a vztah k trenérovi platí stejně.
- AI trenér nechodí na kurzy a nezískává licence, lidský trenér se tak časem může zlepšit víc.
- Obchody mezi AI kluby jsou záměrně vzácné (20 % dní, jen při potřebě postu).
- Simulace neumí lidské chování: lidé v ní neodpovídají na nabídky, neřeší hráče ani trénink.
- V OP České Budějovice je pořád testovací klub FK Řeznictví Černý (účet `tvuj@`, síla 60,8,
  AI kluby 34–46). Podle poznámky z 29. 9. se měl před otevřením ČB vyčistit; smazání nebo předání AI
  je rozhodnutí pro uživatele, nic jsem s ním nedělal.

## Nalezené chyby mimo rozsah (jen nahlášeno, neopraveno)

- `apps/api/src/fans/fan-banner.ts:73` čte `SELECT tactic FROM teams`, sloupec `teams.tactic` neexistuje
  (taktika je v `lineups`). Každý přepočet plachty zaloguje varování „taktika pro transparent“ a plachty
  s výtkou k taktice nevznikají. Na produkci to běží denně u každého lidského klubu.
