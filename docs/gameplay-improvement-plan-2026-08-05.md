# Herní vylepšení: dokončený Pohár, osobní rozhodčí, zápasový plán a civilní zaměstnání

Datum: 2026-08-05  
Rozsah: seniorská liga i Pohár

## Produktové rozhodnutí

Pohár je release gate. Nové systémy se nepovažují za hotové, dokud fungují v lize i v Poháru a pohárový zápas lze kompletně připravit, odehrát, zobrazit v detailu i zopakovat v replayi.

V první verzi zůstává zápas jednorázovou simulací celého utkání. Podmíněný plán proto není živé koučování v průběhu zápasu, ale deterministický autopilot vyhodnocovaný simulátorem v určených minutách.

## Etapa 0 — skutečně dokončit Pohár

### 0.1 Životní cyklus zápasu

Pohárový zápas musí procházet stejným řízeným životním cyklem jako ligový zápas:

`scheduled → lineups_open → lineup_locked → simulated → published`

- Ranní denní tick pouze otevře přípravu a odešle notifikace.
- Sestavy a plán se uzamknou před výkopem.
- Simulace proběhne v jednotném match ticku (navrženě v 18:00 herního času), ne při pouhém posunu kalendáře.
- Opakované spuštění ticku nesmí zápas simulovat podruhé.
- Před simulací se uloží deterministický `simulation_seed`, aby byl výsledek reprodukovatelný.

### 0.2 Parita simulace

`apps/api/src/cup/cup.ts` dnes používá zjednodušený vstup. Pohár musí dostat stejný kontext jako liga:

- uloženou formaci, taktiku, kapitána a lavičku,
- podmíněný zápasový plán,
- kondici, absenci a civilní pracovní konflikt,
- znalost formace i taktiky,
- týmové vztahy/chemii, vybavení, realizační tým a manažera,
- stadion, domácí výhodu, počasí a návštěvnost,
- přiřazeného rozhodčího a jeho snapshot profilu,
- stejné post-match statistiky, únavu, morálku, zranění, finance a odměny.

Zruší se fallback, který slabému nebo neúplnému pohárovému týmu pouze dopočítá sílu a vygeneruje zjednodušený výsledek. Každý pohárový klub musí mít stabilní soupisku nebo explicitně vytvořenou generovanou soupisku s uloženými hráči.

### 0.3 Pohárové UI a API

Pohár musí být dostupný ve všech běžných obrazovkách:

- náhled zápasu a příprava sestavy,
- výběr základní jedenáctky, lavičky a plánu,
- detail výsledku a „Co rozhodlo“ se statistikami,
- replay (`/dashboard/match/[id]/replay`) bez předpokladu, že ID existuje jen v tabulce `matches`,
- notifikace před zápasem, po zápase a při postupu,
- označení zápasu jako zobrazeného,
- penaltový rozstřel včetně detailu výsledku.

`GET /api/teams/:teamId/match-summary/:matchId` a frontendové komponenty musí umět rozlišit ligový a pohárový zdroj bez duplicitní logiky.

### 0.4 Pravidla soutěže

Před implementací se uzamknou a otestují pravidla Poháru:

- postup po základní hrací době,
- pravidlo prodloužení, pokud má být součástí soutěže,
- penaltový rozstřel a určení střelců,
- losování a založení dalšího kola,
- odměny a idempotentní finanční reference,
- stav zápasu při kontumaci nebo chybě v sestavě.

## Etapa 1 — datový základ

### 1.1 Rozhodčí

Nová tabulka `referees` obsahuje stabilní osobu a její parametry. Do `matches` i `cup_matches` se uloží `referee_id` a neměnný `referee_snapshot`, aby pozdější změna profilu nezměnila odehraný zápas.

Minimální atributy:

- přísnost v soubojích,
- tolerance protestů,
- způsob pouštění výhody,
- konzistence rozhodování,
- název/persona a textové vysvětlení dopadu.

### 1.2 Sestava, lavička a plán

Rozšířit `lineups` o verzovaná data:

- `players_data`: základní jedenáctka,
- `bench_data`: až 7 náhradníků v pořadí,
- `match_plan_data`: nejvýše 3 jednorázová pravidla,
- verze/čas uzamčení a případně důvod neplatnosti.

Validace probíhá serverově: hráč je právě v jednom seznamu, všichni patří týmu, lavička má nejvýše sedm míst a plán obsahuje pouze podporované typy pravidel.

### 1.3 Civilní zaměstnání

Pro MVP stačí abstrahovaný zaměstnavatel:

- stabilní zaměstnání hráče,
- dobrá vůle zaměstnavatele v rozsahu 0–100,
- pracovní směna/povinnost,
- historie konfliktů a rozhodnutí hráče.

Přidat `player_employment` a `employment_events` (nebo ekvivalentní JSON se stejnou auditovatelností). Změna stavu musí být transakční a idempotentní.

## Etapa 2 — okresní rozhodčí s osobností

### Pravidla pro hráče

Rozhodčí se odhalí 48 herních hodin před zápasem. Před utkáním manažer nastaví dvě osy:

1. **Intenzita soubojů:** opatrně / normálně / tvrdě.
2. **Komunikace:** bez řečí / pouze kapitán / tlak na rozhodčího.

UI u každé volby slovně popíše dopad na hru. Například tvrdá hra zvyšuje šanci vyhraných soubojů a faulů; tlak na rozhodčího může pomoci u hraničních situací, ale zvyšuje riziko protestu a karty.

### Technická pravidla

- Přiřazení rozhodčího je deterministické, bez skrytého domácího bonusu.
- Vliv komunikace na marginální verdikty je malý, symetrický a zastropovaný přibližně na 2–3 %.
- Přísnost upravuje pravděpodobnost odpískání faulu a karty; tolerance protestů upravuje reakci na protest; výhoda upravuje pokračování hry po faulu.
- Profil se ukládá do zápasu a zobrazí se v reportu včetně vysvětlení klíčových verdiktů.
- Liga i Pohár používají stejnou funkci `resolveRefereeEffect` a stejné testy.

## Etapa 3 — podmíněný zápasový plán

Manažer před zápasem vytvoří nejvýše tři pravidla. Každé je jednorázové, má podmínku, akci a stav `pending/triggered/skipped/invalid`.

Příklady podporovaných pravidel:

- „Pokud v 70. minutě prohráváme, přepni na ofenzivu.“
- „Pokud hráč klesne pod 25 % kondice, vystřídej ho.“
- „Pokud vedeme po 75. minutě, přepni na defenzivu.“
- „Pokud dostaneme červenou kartu, použij konzervativní taktiku.“

### Vyhodnocení

Pořadí je pevné:

1. vynucené zranění/nezpůsobilost,
2. podmíněný plán,
3. automatický asistent pouze jako volitelná záloha.

Plán nesmí obejít pravidla o počtu střídání, způsobilosti hráče ani velikosti lavičky. Každé vyhodnocení se zapíše do event logu, aby bylo v replayi vidět, proč se akce provedla nebo přeskočila.

Změna taktiky má přechodovou penalizaci. Její velikost se odvíjí od atributu manažera „Taktika“ a znalosti nové taktiky týmem; vysoká znalost a dobrý manažer penalizaci zkrátí, nikoli zcela odstraní. Stávající `tactic_familiarity` se proto aktivuje stejným způsobem pro ligu i Pohár.

## Etapa 4 — civilní zaměstnání hráčů

Zaměstnání má vytvářet rozhodování a příběhy, ne čistý trest za přihlášení.

### Tok konfliktu

- Den před zápasem může vzniknout pracovní konflikt.
- Hráč dostane volbu: splnit směnu, požádat o výjimku, nebo riskovat konflikt a jet na zápas.
- Výsledek se projeví dostupností, kondicí, morálkou a goodwill zaměstnavatele.
- Vzácně může vzniknout neřešitelná povinnost v den zápasu; systém ji nesmí tiše přepsat manažerovou sestavou.
- Maximálně jedna placená/kompenzační výjimka na hráče a zápas, s jasným limitem a auditní stopou.

Pravděpodobnosti a texty se zobrazují v intervalech („nízká/střední/vysoká šance“), nikoli jako falešně přesná čísla. Zaměstnání nesmí být pay-to-win a všechny volby musí fungovat shodně v lize i Poháru.

## Etapa 5 — testování a vyvážení

Povinné testy:

- idempotence denního ticku a simulace,
- deterministický seed stejného zápasu,
- validace sestavy/lavičky/plánu proti manipulovaným ID,
- parita ligového a pohárového vstupu do simulátoru,
- všechny přechody pravidel plánu a limity střídání,
- snapshot rozhodčího a reprodukce reportu,
- pracovní konflikt bez dvojího odečtu peněz nebo goodwillu,
- postup Pohárem, rozstřel, odměny a opakované zpracování,
- replay/detail pro oba typy zápasu.

Balancování se provede na simulovaných sezonách. Sledují se zejména fauly/karty podle rozhodčího, četnost aktivace plánů, dopad taktické změny, počet pracovních absencí, finanční dopad a rozdíl domácí/hostující výhody.

## Definition of Done

Plán je hotový, když:

- Pohár lze od losu až po finále odehrát bez ručního zásahu,
- každý pohárový zápas má stejnou přípravu, simulaci, detail a replay jako ligový,
- žádný zápas se nespustí dvakrát ani s náhodným výsledkem při opakovaném ticku,
- rozhodčí, lavička, plán a zaměstnání mají uložené výsledky a vysvětlení,
- server validuje všechny vstupy a klient pouze zobrazuje povolené možnosti,
- automatické testy pokrývají kritické přechody a CI je spouští.

## Doporučené pořadí realizace

1. Pohárová parita a dokončení pohárového životního cyklu.
2. Společná fixture/match vrstva pro ligu a Pohár.
3. Rozhodčí a snapshot jejich profilu.
4. Lavička a podmíněný zápasový plán.
5. Civilní zaměstnání a pracovní konflikty.
6. Integrační testy, simulované sezony, balancing a release kontrola.
