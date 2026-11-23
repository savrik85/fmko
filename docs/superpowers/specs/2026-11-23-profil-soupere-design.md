# Profil soupeře (záložka Soupeř na profilu týmu)

Schváleno uživatelem v chatu 2026-11-23 („jo, udělej to“).

## Proč
Trenér si chce před zápasem prohlédnout soupeře ze svého úhlu: jak spolu hráli, kdo komu dává góly,
jak na tom soupeř je v sezóně. Otevřít to jde kdykoli z profilu cizího týmu. Z karty Další zápas
na Přehledu vede odkaz rovnou na tuhle záložku.

## Co ukazuje (jen u cizího týmu, záložka Soupeř)
1. Vzájemná bilance (V/R/P, skóre) a seznam všech vzájemných zápasů ze všech soutěží
   (liga, pohár, přátelák, turnaj) s proklikem na záznam.
2. Střelci ve vzájemných zápasech: jejich hráči proti nám, naši proti nim.
3. Srovnání sezóny (ligová tabulka aktuální sezóny): místo, body, V/R/P, skóre, forma,
   bilance doma a venku. Zvýrazní se ta, která platí pro příští vzájemný zápas.
4. Kdy soupeř dává a dostává góly (šest čtvrthodin) a jeho karty v sezóně.
5. Srovnání řad (průměrné hodnocení podle postu, jako karta Další zápas) a jeho nejlepší hráči.
   Hodnocení přesně, vlastnosti cizích hráčů se neukazují (zůstávají na pětky jinde).
6. Rozestavení a taktika z jeho posledních pěti zápasů (veřejné i dnes v záznamech).
   Hotový skautský rozbor soupeře se zobrazí taky, jinak odkaz na skauta.

Karta Před zápasem (špičkování, sázka o bečku) se ukáže i v záložce Soupeř.

## Mimo rozsah
Žádné nové mechaniky, žádné nové sázky ani bonusy. Rivalita fanoušků se nepřidává.

## Jak
- API: `GET /api/teams/:teamId/rival/:rivalId`, jen pro majitele `teamId` (obsahuje jeho skautský rozbor).
  Výpočty v `apps/api/src/rival/` (čisté funkce + načtení z D1).
- Příští vzájemný zápas si web vezme z rozpisu (`/api/teams/:id/schedule`), ať se nezdvojuje logika termínů.
- Web: profil týmu dostane záložky Tým / Soupeř (`?tab=souper`), nová komponenta `RivalTab`.
  Widget Další zápas dostane odkaz „Profil soupeře“.

## Přístupy
- (zvoleno) Jeden endpoint, který spočítá vše na serveru: jedna cesta pro web, testovatelné na D1.
- Skládat z existujících endpointů na webu: vzájemné zápasy ani střelci proti sobě nikde nejsou,
  stejně by vznikl nový endpoint a web by tahal celé kádry a výsledky.
