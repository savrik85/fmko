# Přestup na splátky a procenta z příštího přestupu

Datum: 2026-10-03 · Stav: návrh ke schválení

## Proč

Přestupy mezi lidskými kluby se dnes platí jen celou částkou najednou. Klub s menším rozpočtem
nemá jak koupit hráče, na kterého by časem měl, a prodávající nemá čím přistoupit na nižší cenu.
Football Manager na to má splátky a procenta z příštího přestupu. Obojí má být součástí
vyjednávání a splácení musí opravdu proběhnout.

## Rozhodnutí uživatele (2026-10-03)

- Splátka se strhne **vždy, i do minusu**. Prodávající dostane peníze vždycky.
- Platí se **záloha + týdenní splátky**, každé pondělí spolu s mzdami.
- Když koupený hráč odejde dřív: **při prodeji dál se zbytek doplatí hned z peněz za prodej,
  jinak splátky běží dál**.
- K tomu **procenta z příštího přestupu**.
- Všechno musí být **dobře zapracované do vyjednávání**.

## Podmínky nabídky

Každá nabídka na trvalý přestup mezi lidskými kluby má čtyři podmínky:

| Podmínka | Rozsah | Výchozí |
|---|---|---|
| Cena celkem | 1 až 10 000 000 Kč (`MAX_TRANSFER_AMOUNT`) | – |
| Záloha | 20–100 % ceny; 100 % = jednorázově | 100 % |
| Počet týdenních splátek | 0 (jednorázově) nebo 2–10 | 0 |
| Procenta z příštího přestupu | 0–50 %, po 5 % | 0 % |

- Záloha < 100 % vyžaduje počet splátek 2–10 a naopak.
- Úroky nejsou. Splácí se přesně sjednaná cena.
- Hostování, výměnný hráč a odkup hostujícího hráče zůstávají, jak jsou. Splátky a procenta
  jdou jen k trvalému přestupu (u odkupu hostujícího hráče taky).

## Vyjednávání

- Nabídku podává kupující se všemi čtyřmi podmínkami.
- Protinávrh může na tahu podat kterákoli strana a změnit kteroukoli podmínku. Pořadí tahů
  (`last_action_by`) zůstává.
- Podepíše se to, co je v posledním návrhu.
- Každý krok vyjednávání si ukládá podmínky. Historie u každého kroku ukazuje, co se proti
  předchozímu změnilo (např. „cena 40 000 → 45 000 · splátky 5 → 3 · procenta 10 % → 15 %").
- Seznam nabídek (Příchozí, Moje nabídky, Historie) ukazuje u každé nabídky souhrn podmínek,
  ne jen cenu, např. „45 000 Kč · záloha 30 % + 3× 10 500 Kč · 15 % z dalšího prodeje".
- Detail nabídky ukazuje: co se zaplatí hned (záloha + mezikrajský poplatek), kolik a kolikrát
  každé pondělí, cenu celkem a procenta z dalšího prodeje. U prodávajícího i odhad poplatku soutěži.
- Rychlé přijetí v seznamu nabídek používá stejnou kontrolu jako detail. Rychlý protinávrh
  otevírá dialog se všemi podmínkami.
- SMS a upozornění o nabídce, protinávrhu a přijetí uvádějí podmínky.
- Seznam přestupů pro vedení soutěže (`competition/integrity.ts`) ukazuje i splátky a procenta.

## Přehlednost (všechno vidět na první pohled)

Kdekoli se obchod ukazuje, je rozepsaný celý. Žádné číslo se nedopočítává v hlavě.

**Rozpis obchodu** (stejný blok všude, kde je místo):

```
Cena celkem            45 000 Kč
Záloha (30 %)          13 500 Kč   zaplaceno při podpisu
Splátky                3× 10 500 Kč   každé pondělí
Procenta z dalšího prodeje   15 %
Mezikrajský poplatek    9 000 Kč   (jen kupující, při podpisu)
```

U probíhající dohody navíc:

```
Zaplaceno              24 000 Kč z 45 000 Kč   (záloha + 1 ze 3 splátek)
Zbývá                  21 000 Kč   2 splátky po 10 500 Kč
Další splátka          pondělí 12. 10.
```

Kde to je:

- **Formulář nabídky:** při vyplňování se rozpis počítá živě (co zaplatíš hned, kolik a kolikrát
  každé pondělí, cena celkem, poplatek).
- **Dialog protinávrhu:** stejný živý rozpis.
- **Detail nabídky:** rozpis aktuálního návrhu. Historie vyjednávání u každého kroku ukazuje
  podmínky i to, co se proti předchozímu změnilo.
- **Seznam nabídek:** jeden řádek souhrnu, např. „45 000 Kč · záloha 13 500 + 3× 10 500 · 15 %".
- **Finance → Splátky přestupů:** každá dohoda zvlášť, pro kupujícího „splácím" a pro
  prodávajícího „chodí mi". U každé: hráč, druhý klub, rozpis, průběh (zaplaceno / zbývá,
  ukazatel 1 ze 3) a další splátka. Nahoře součet: kolik tento týden zaplatím a dostanu
  a kolik ještě celkem dlužím a kolik mi dluží.
- **Detail hráče** (kupující i prodávající klub): řádek „Splácí se: zbývá 2× 10 500 Kč klubu X"
  a „15 % z dalšího prodeje pro klub X", aby bylo před dalším prodejem jasné, co z ceny odejde.
- **Transakce ve Financích:** každá splátka má popisek s hráčem a pořadím („Splátka za Novák 2/3").
- **Výhled rozpočtu:** budoucí splátky jako výdaj kupujícího a příjem prodávajícího.

## Kontroly

- **Peníze při nabídce, protinávrhu kupujícího a přijetí:** kupující musí mít na zálohu
  + mezikrajský poplatek (ne na celou cenu). Klub v minusu nakupovat nemůže (už dnes).
- **Limit:** kupující může mít najednou nejvýš **3 aktivní splátkové přestupy**. Kontroluje se
  u nabídky, u protinávrhu, který splátky zavádí, a při přijetí.
- Server odmítne podmínky mimo rozsahy výš (stejně jako dnes odmítá částku nad strop).

## Peníze při podpisu

- Kupující zaplatí zálohu a celý mezikrajský poplatek (z celé ceny). Atomicky, jako dnes.
- Prodávající dostane zálohu a zaplatí poplatek soutěži z celé ceny (jako dnes).
- Vznikne splátková dohoda (když jsou splátky) a doložka o procentech (když jsou procenta).

## Týdenní splátky

- V pondělních financích (`processWeeklyFinances`) se kupujícímu u každé aktivní dohody strhne
  jedna splátka a připíše se prodávajícímu. Poslední splátka doplatí přesný zbytek.
- Strhne se i do minusu (typ transakce není v `PURCHASE_TYPES`).
- Každá splátka má vlastní klíč (`reference_id = inst-{dohoda}-{pořadí}`) a dohoda se posouvá
  optimisticky (`WHERE installments_paid = ?`), takže se nikdy nestrhne dvakrát.
- Po poslední splátce je dohoda splacená.
- Přelom sezóny splátky nepřerušuje.

## Když hráč odejde dřív

- **Kupující hráče prodá dál** (komukoli, i cizímu CPU klubu): zbytek dluhu se původnímu
  klubu zaplatí hned při tom prodeji. Kupujícímu se strhne i do minusu. Dohoda je vyrovnaná.
- **Propuštění, konec kariéry, odchod z dorostu, zmizení:** splátky běží dál podle plánu.

## Procenta z příštího přestupu

- Když kupující hráče prodá dál za peníze (komukoli, i cizímu CPU klubu), původní klub dostane
  sjednaná procenta z ceny toho prodeje. Strhnou se kupujícímu z peněz za prodej.
- Platí jen pro nejbližší prodej. Pak je doložka vyplacená.
- Když hráč odejde bez peněz (propuštění, konec kariéry, odchod z dorostu, zmizení), doložka propadne.
- Hostování doložku nespouští ani neruší.

## Data (migrace 0235, jen přidávání)

- `transfer_offers` + `upfront_pct INTEGER DEFAULT 100`, `installments INTEGER DEFAULT 0`,
  `sell_on_pct INTEGER DEFAULT 0` (aktuální podmínky).
- `transfer_offer_events` + stejné tři sloupce (podmínky v daném kroku, u starých řádků NULL).
- Nová `transfer_installments`: `id, offer_id, player_id, buyer_team_id, seller_team_id,
  total_amount, upfront_amount, installment_amount, installments_total, installments_paid,
  remaining, status CHECK(active|paid|settled), created_game_date, created_at, closed_at`.
  Bez FK na `players`, protože odchod hráče řádek maže (`removePlayer`).
- Nová `sell_on_clauses`: `id, offer_id, player_id, beneficiary_team_id, owner_team_id, pct,
  status CHECK(active|paid|lapsed), paid_amount, paid_offer_id, created_at, resolved_at`.
- Nové typy transakcí (s popiskem a ikonou na stránce Finance): `transfer_installment`,
  `transfer_installment_income`, `transfer_installment_settlement`,
  `transfer_installment_settlement_income`, `sell_on_fee`, `sell_on_income`.

## Kde se to v kódu děje

- Vytvoření nabídky a protinávrh (`routes/game.ts` `/offers`, `/offers/:id/counter`):
  podmínky, kontroly, uložení do nabídky i události.
- Přijetí (`routes/game.ts` accept, větev trvalého přestupu): záloha místo celé ceny,
  vznik dohody a doložky; vyrovnání dohody a výplata doložky prodávajícího hráče.
- Přijetí CPU nabídky (prodej cizímu klubu): vyrovnání dohody a výplata doložky.
- `removePlayer`: propadnutí doložky při odchodu bez peněz.
- Pondělní finance: splátky.
- Výhled rozpočtu (`/budget` forecast): splátky jako výdaj kupujícího a příjem prodávajícího.
- Web: formulář nabídky (detail hráče), dialog protinávrhu (detail nabídky i seznam), detail
  nabídky, historie vyjednávání, seznam nabídek, Finance (sekce „Splátky přestupů", popisky
  transakcí, výhled).

## Mimo rozsah

- Cizí CPU kluby a jejich inzeráty dál platí celou částku najednou a splátky ani procenta nenabízejí.
- Úroky, sankce za minus (hra už v minusu blokuje nákupy), předčasné doplacení.

## Testy

- Splátka se strhne každé pondělí, i do minusu; prodávající dostane peníze.
- Žádné dvojité stržení při opakovaném zpracování dne.
- Poslední splátka doplatí přesný zbytek.
- Prodej dál: zbytek dluhu se doplatí, procenta se vyplatí; i při prodeji cizímu klubu.
- Propuštění: splátky běží dál, procenta propadnou.
- Limit 3 aktivních splátkových přestupů a kontrola peněz na zálohu.
- Podmínky mimo rozsah server odmítne.
- Historie vyjednávání ukazuje změny podmínek.
- Ověření na testu: API (nabídka → protinávrh → přijetí → pondělí → prodej dál) a web
  (formulář, detail, seznam, Finance) na počítači i v 375 px.
