# Postava hráče: přehled kádru a páky na váhu (část 3)

Datum: 2026-10-08. Navazuje na části 1 a 2 (`2026-10-08-player-body-design.md`,
`2026-10-08-player-body-drift-design.md`). Uživatel vybral: přehled Postava kádru, úkol
„Plán hubnutí“, vybavení „Váha a jídelníček“, domluva přes SMS. Výživový poradce, pivní pravidlo,
kabinová sázka a soustředění s vážením jsou na později.

## Proč

Váha se po části 2 hýbe, ale manažer nemá přehled o celém kádru a nemá jak ji ovlivnit.

## 1. Přehled „Postava kádru“

Nová stránka `/postava` v menu Klub (desktop i mobilní „Více“), titulek „Postava kádru“.

`GET /api/teams/:teamId/body-overview`, jen vlastní tým (`tymyDivaka`), áčko bez U21:

- `summary`: průměrná váha nad ideálem (kg, 1 desetina), počty podle `weightCategory`
  (under, ideal, muscular, over, obese), průměrný `trend30d` hráčů, kteří ho mají, a součet
  postihu rychlosti a výdrže základní jedenáctky (sestava na nejbližší ligový zápas, jinak
  11 hráčů s nejvyšším hodnocením).
- `players`: id, jméno, post, váha, `weightCategory`, `trend30d`, `effects`, `cause`
  (`pub` | `idle` | `injury` | null, jen u hráčů, kteří přibírají), aktivní plán hubnutí
  (`planUntil`), slib z SMS (`pledgeUntil`). Pořadí: velká nadváha, nadváha, podváha, pak podle
  trendu; hráči bez problému na konci.

Web: souhrn nahoře (karty), pod ním „Kdo má problém“ jako karty pod sebou (mobile-first, min
`text-sm`), u každého tlačítko „Napsat SMS“ (otevře konverzaci jako profil hráče) a odkaz
„Plán hubnutí“ na Zaměstnance. Jméno je odkaz na profil.

## 2. Úkol kondičního trenéra „Plán hubnutí“

- `weight_plan`: role `kondicni_trener`, týdenní, cíl jeden hráč, 14 nebo 28 dní, 400 Kč / 7 dní.
- Jen hráč s `weightCategory` over nebo obese. Při založení se uloží `params.startWeight`.
- Účinek v denní změně váhy: v den, kdy hráč na plánu trénoval,
  `−(0,10 + 0,15 × síla trenéra) × (0,75 + pracovitost / 200)` kg. Síla trenéra je
  `rowEffectiveness / 20` (0–1). Měsíc s 13 tréninky, trenér 0,5, pracovitost 50 ≈ −2,3 kg.
  Kdo na trénink nechodí, nehubne.
- Na konci SMS od kondičního trenéra: kolik hráč shodil, nebo že nechodil.
- Web Zaměstnanci (`StaffTaskBox`): nabídne jen hráče s nadváhou, u hráče ukáže kg a popisek,
  seřadí podle nadváhy.

## 3. Vybavení „Váha a jídelníček“ (`nutrition`)

- Migrace 0257: `ALTER TABLE equipment ADD COLUMN nutrition INTEGER NOT NULL DEFAULT 0`,
  `nutrition_condition INTEGER NOT NULL DEFAULT 50`.
- Ceny `[0, 3000, 12000, 35000]`. Opotřebení a opravy jako ostatní vybavení.
- Úrovně: 1 váha v kabině, 2 ovoce a pitný režim, 3 nutriční plán klubu.
- Účinek (× stav / 100): přírůstek z hospody −20 / −35 / −50 %, tah k přirozené váze
  ×1 / ×1,25 / ×1,5. U21 bere vybavení áčka.

## 4. Domluva přes SMS

- Trenér napíše hráči do telefonu. Když text obsahuje řeč o váze (kořeny: hubn, váh/vah, kil,
  břich/brich, tlust, nadváh, pivo/piv, hospod, jídel, diet, makat na kondici) a hráč má nadváhu
  nebo přibírá (`trend30d` ≥ 1,5 kg), rozhodne se výsledek deterministicky (seed hráč + herní den),
  bez ohledu na AI:
  - slíbí: šance `0,3 + disciplína/200 + (morálka − 50)/200 − (vznětlivost − 50)/200`,
    oříznutá na 0,1–0,9; `life_context.dietPledgeUntil` = dnes + 14 dní;
  - urazí se: morálka −5.
- Jednou za 14 dní (`life_context.dietTalkAt`), další zprávy už jsou běžný rozhovor.
- Výsledek jde do `ai_thread_state` (`weightTalk`), prompt odpovědi ho dostane jako pokyn, aby hráč
  odpověděl podle něj. Při vypnuté AI hráč neodpoví, ale účinek platí.
- Účinek: dokud slib platí, přírůstek z hospody ×0,25.

## 5. Péče (doplněno po simulaci 2026-10-08)

Uživatel: „když necháš být, nic zásadního se nestane, když se staráš, máš výhodu“.

- Tah k přirozené váze působí jen shora. Běžný trénink srazí váhu nejvýš na přirozenou váhu.
- Hráč, o kterého se klub stará (vybavení Váha a jídelníček úrovně 1+ ve stavu nad 0, platný slib
  z SMS, nebo plán hubnutí), smí tréninkem a jídelníčkem hubnout až na **váhu bez postihu**
  `fitWeight = ideál + 4 kg + muscleToleranceKg(síla)`, nejvýš na přirozenou váhu.
- Jídelníček ubírá každý den `[0, 0, 0,01, 0,02] × stav` kg, jen nad váhou bez postihu.
- Plán hubnutí dno nemá.

Simulace 120 dní skutečného denního ticku nad kopií testovací DB (54 lidských klubů):

| Skupina | Změna váhy | Postih rychlost + výdrž (Ø na hráče) |
|---|---|---|
| bez zásahu (283 hráčů áčka) | +0,57 kg | −5,07 → −5,40 |
| jen vybavení L3 (113 hráčů) | −0,94 kg | −4,92 → −3,84 |
| plná péče: L3, SMS, plán (22 hráčů) | −1,59 kg | −3,18 → −1,18, velká nadváha 4 → 0 |

SMS od štábu o váze: 0 za 120 dní. Podváha se péčí nezvětšuje.

## Testování

- Jednotkové: účinek plánu a vybavení na denní změnu, rozpoznání řeči o váze, výpočet šance,
  souhrn přehledu (pořadí, příčiny, postih jedenáctky).
- DB testy (Miniflare): přehled, založení a vyhodnocení plánu, SMS hook (slib i urážka, pauza).
- Test prostředí: migrace 0257, přehled na desktopu a 375 px, založení plánu v Zaměstnancích,
  koupě vybavení, SMS hráči a zápis slibu.

## Mimo rozsah

Výživový poradce, pivní pravidlo, kabinová sázka, soustředění a vážení.
