# Audit nevyužitého potenciálu — 2026-10-08

Třetí audit. Předchozí dva (`audit-nefunkcni-mechanismy-2026-08-10.md`, `-2026-10-03.md`) hledaly bugy.
Tenhle hledá **data a mechanismy, které existují, ale na hru nemají vliv** nebo jsou napůl.

Základ: main/testing @54792573, 4 read-only průchody kódem + dotazy do prod DB (jen SELECT).
Cesty jsou relativní k `apps/api/src/`, pokud není řečeno jinak.

## Stav oprav (2026-10-08, testing bfee8032, na produkci NE)

| Bod | Commit | Stav |
|---|---|---|
| 2.1 náchylnost mimo zápas | a0886983 | opraveno |
| 2.2 reklamní lišta webu | e4ff208e (jiná session, už na produ) | audit vycházel ze starší verze, lišta už vyplácí 5 % bannerů+stadionu |
| 2.3 délka zranění ze zápasu | 66627be9 | opraveno (liga, pohár, turnaj) |
| 2.4 zkušenost v ročním vývoji (+ strop potenciálu, physical) | d353a4e5 | opraveno |
| 2.5 návrat po zranění | 48669cdb | opraveno (kondice 90/70/50 podle délky) |
| 2.6 mezikolové prahy 0–20 | ac3616b7 | opraveno; „chce odejít" = truc 55 místo okamžitého odchodu |
| 2.7 players.experience u pamětníků | d353a4e5 | opraveno |
| 2.8 stárnutí jen přítomných | d353a4e5 | opraveno |
| C prahy taktik | 84a946d6 | medián týmů z produkce + náhled ukazuje skutečný efekt |
| D forma | 2ed35ad1 | ±15 % kostka × forma sestavy ±10 % z posledních hodnocení |
| E kondice jednotlivce | a5209b37 | zakončení, brankář, obrana, zranění; gólovost vyrovnaná (0,855 → 0,82) |
| F povolání a alkohol do docházky | bfee8032 | zápasy i trénink, průměry vyrovnané podle produkce |
| B, G výška/váha | — | čeká na rozhovor s uživatelem |
| H–L | — | neotevřeno |

Značky: ✅ = ověřeno ručně v kódu nebo v prod DB, ostatní = z průchodu kódem s file:line.

---

## 1. Výška, váha, postava

### Stav
- ✅ Výška a váha jsou v `players.physical` (JSON). Generuje je `generators/physicals.ts:6-15`:
  výška = základ podle postu ±8 cm (GK 185, DEF 180, FWD 178, MID 176), váha = základ podle
  `bodyType` −5/+8 kg. **Váha nezávisí na výšce.**
- ✅ Prod (1 703 hráčů): výška 168–194 cm, váha 61–108 kg, průměrné BMI 25, váha na všech postech
  stejná (~80 kg). 54 hráčů výšku nemá vůbec, 119 nemá `injuryProneness`.
- ✅ `bodyType` se **neukládá**. Při načtení se dosazuje natvrdo `"normal"`
  (`season/daily-tick.ts:398`, `season/league-round.ts:512`, `routes/game.ts:1336`).
  Při vzniku ovlivní jen váhu, tloušťku avataru (`routes/teams.ts:75-79`), agresivitu
  (`generators/player.ts:252`), přezdívku a popis.
- Engine výšku ani váhu nemá — `MatchPlayer` je neobsahuje (`engine/types.ts:13-53`).
  Čte je jen FE profil (`apps/web/.../hrac/[id]/page.tsx:1002-1003`) a náhled zápasu
  `routes/matches.ts:119-120`, který ale FE nepoužívá (`match-widgets.tsx:210-221`).
- Nic je nepřepisuje: dorost neroste, nikdo nepřibírá. Stárnutí mění jen staminu a sílu.
- Tooltip nakopávané hry slibuje „vysoké a silné útočníky“ (`apps/web/src/lib/tactic-info.ts:18`),
  long_ball ale čte jen `heading` a `strength` (`engine/tactics.ts:70-72`).
- `apps/web/src/components/players/squad-table.tsx` (sloupce výška/váha) nikde není importovaná.

### Kam by šly zapojit
| Kam | Místo v kódu | Co by dělala |
|---|---|---|
| Výběr hlavičkáře na centr | `engine/simulation.ts:421` `(heading*0.65 + strength*0.35)` | výška jako násobek |
| Vzdušný souboj útočník × obránce | `engine/simulation.ts:488-491` | rozdíl výšek |
| Obrana proti hlavičce | `engine/simulation.ts:281` | výška obránců |
| Brankář na vysoké míče | `engine/simulation.ts:446` (`calcGoalProb`) | dosah = výška |
| Podíl hlavičkových šancí | `engine/simulation.ts:279` (pevně 30 %) | podle taktiky a výšky útočníků |
| Únava | `engine/simulation.ts:505-515` (`updateCondition`) | nadváha → rychlejší úbytek |
| Rychlost v útoku | `engine/simulation.ts:228` | nadváha brzdí |
| Zranění | `engine/simulation.ts:1383-1384` | nadváha + únava + věk |
| Vývoj | `season/season-development.ts` | dorost roste do ~19, s věkem a alkoholem přibírání |

Předpoklad: váhu odvodit z výšky (BMI) a postavu ukládat, jinak 170cm a 194cm hráč
mají stejnou váhu a „nadváha“ nedává smysl. To je datová migrace na prod.

---

## 2. Bugy nalezené cestou (nové, nejsou v předchozích auditech)

1. ✅ **Náchylnost ke zraněním se mimo zápas čte ze špatného místa.** Je uložená v `physical`
   (`generators/create-player.ts:113`), ale `season/daily-tick.ts:394`, `events/absence.ts:92`,
   `routes/game.ts:1333` ji čtou z `personality` → všichni mají 50. Prod: `personality` ji nemá
   nikdo (0/1 703), `physical` 1 584. Týká se tréninkových zranění a zdravotních absencí.
   Engine ji čte správně (`engine/lineup-loader.ts:58`, `multiplayer/match-runner.ts:1743`).
   Letní recap dosazuje 30 (`season/season-recap.ts:447,474`).
2. ✅ **Reklamní lišta na klubovém webu za 16 000 Kč nic nevydělává.** Popis slibuje „týdenní
   pasivní příjem z návštěvnosti“ (`packages/shared/src/types/club-website.ts:82-87`),
   `sponsor_banner_enabled` mimo `routes/club-website.ts` nikdo nečte. Prod: koupil ji 1 klub z 19.
3. ✅ **Délka zranění v zápase je náhoda 3–20 dní** přes `Math.random`
   (`multiplayer/match-runner.ts:1120`), nezávisle na druhu (křeče klidně 20 dní), věku i náchylnosti.
   Katalog 14 zranění s délkou podle typu (`injuries/injury-generator.ts:17-72`) volá jen letní recap.
4. **Roční vývoj škáluje i `skills.experience`** (`season/season-development.ts:66-74`) →
   veterán každé léto ztrácí zkušenost, mladík ji dostane zadarmo.
5. **Regenerace běží i zraněným** (`season/daily-tick.ts:974-976`, UPDATE bez WHERE) → po
   zranění se vrací na 100 % kondice.
6. **Mezikolové prahy ze staré škály 0–20**: `events/between-rounds.ts:136` `patriotism<=8`
   (patriotismus je ~25–95, „chce odejít“ skoro nenastane), `:157` `injuryProneness/20`,
   `:169` `temper>=14`. Tréninkové zranění mezi koly potká i hráče, který na tréninku nebyl (`:152`).
7. **Sloupec `players.experience` se po vložení nemění**, růst jde do `skills.experience`
   (`multiplayer/match-runner.ts:1317-1320`). `fans/fan-favourites.ts:164,212` čte ten mrtvý
   sloupec jako „odehrané zápasy za klub“.
8. **Kdo nechodí na trénink, nestárne**: úbytek 37+ platí jen přítomným (`season/training.ts:576-588`).

Z předchozích auditů stále platí: `season/aging.ts` a `skills/training.ts` mrtvé, potenciál
(`skills_max`) se v ročním vývoji ořezává na 99, `applyLocalSale` nikdo nevolá
(`season/village-processor.ts:283`), AI tvrdost `isDerby: false` (`multiplayer/match-runner.ts:696`),
počasí tréninku (`season/daily-tick.ts:247-256`), únava z tréninku smazaná regenerací ve stejném ticku.

Morálka (nález 08-10 #1) **už platí**: útok/obrana ×0,94–1,06, střelec ×0,95–1,05
(`engine/simulation.ts:208-209, 232, 240, 292`).

---

## 3. Zápasový engine — co vstupuje a co ne

### Vstupuje
technique, passing, shooting, speed (jen útok a výběr střelce), heading, defense, strength,
vision (záložníci), creativity, setPieces, goalkeeping, stamina (jen úbytek kondice);
osobnost workRate, aggression, discipline, temper, consistency, clutch, leadership, alcohol,
injuryProneness; taktika, tvrdost, match plan, mimo-pozice postih, exekutoři, formace (jen
synergie), kapitán (jen +1/+2 morálky po gólu); počasí, trávník, vlhkost, rozhodčí (7 os + paměť),
domácí výhoda (jen držení míče), chemie ±2 % + dvojice, vybavení, personál.

### Ignoruje
- **Zkušenost** — roste, má váhu v hodnocení (`packages/shared/src/types/rating-weights.ts:31-33`),
  engine ji nemá.
- **8 z 9 brankářských dovedností** (postavení, vybíhání, dosah, komunikace, výkop, rozehrávka…,
  `skills/types.ts:31-41`) — tvoří ~71 % hodnocení brankáře, zápas čte jen `goalkeeping`.
- **Výška, váha, postava** (viz 1).
- **Silnější noha a strana** — dojdou do `MatchPlayer` (`multiplayer/match-runner.ts:1744`),
  simulace je nečte. Sestava nemá levé/pravé sloty.
- **Teplota** — jen kategorie počasí (`multiplayer/match-runner.ts:159`).
- **Derby a vztahy napříč soupiskami** — jen ×1,35 návštěva (`multiplayer/match-runner.ts:464`).
- **Důležitost zápasu** — nikde.

### Nedotažené konstanty
1. ✅ **Forma = kostka 0,75–1,25 na útok týmu** (`engine/simulation.ts:678-680`). Rozptyl ±25 %
   je víc než útočná taktika (~+10 % po fitu) i morálka (±6 %). Skutečná hodnocení z posledních
   zápasů (`match_player_stats.rating`) leží nevyužitá.
2. ✅ **Shoda taktiky s kádrem je u většiny týmů na podlaze 0,70.** Prahy 55–65
   (`engine/tactics.ts:56-90`), prod průměr: útočník střelba 42 / rychlost 40, záložník
   technika 34 / přihrávky 39, obránce obrana 38. Poměr se ořízne na 0,6, fit na 0,7
   (`engine/tactics.ts:112,118`). Nejlepší lidské týmy (Vimperk 68/54, Dvorce 66/62) se dostanou
   ~1,0, takže rozlišují jen špička vs. zbytek. U tvrdosti se škála přepočítala
   (`engine/hardness.ts:85-93`), u taktik ne. Náhled síly ukazuje nominál bez fitu
   (`engine/lineup-strength.ts:182`).
3. **Kondice jednotlivce** nemění jeho výkon ani riziko zranění (`engine/simulation.ts:1383`).
   Únavu bránícího týmu zápas nevidí (`:1160`). Rotace a pressing tak nemají reálnou cenu.
4. **Slot vs. přirozená pozice**: držení a průměr obránců jdou podle slotu, útok, výběr střelce
   a asistenta podle přirozené pozice (`engine/simulation.ts:49-51` vs. `:199-203, 315, 338`) →
   útočník na obraně dál střílí s váhou útočníka.
5. Brankář ztrácí kondici jako hráči v poli (`engine/simulation.ts:506`), komentář
   `engine/match-plan.ts:66` tvrdí opak.
6. Tlak diváků na sudího `0,7 + návštěva/500` (`engine/simulation.ts:586`) — při kapacitě 150
   max 1,0, kotel nikdy nezesílí.

---

## 4. Životní cyklus hráče

- **Stárnutí** je plošné procento ze všech atributů podle věku a náhody
  (`season/season-development.ts:29-37`). Docházka, alkohol, disciplína, minuty ani zranění
  nehrají roli. Pokles po atributech (rychlost a výdrž rychle, technika pomalu) existuje jen
  v mrtvém `season/aging.ts:63-86`.
- **Konec kariéry** lidský tým nemá, pětačtyřicátník hraje dál (`season/season-departures.ts:144-149`).
  Důvody odchodu jsou náhodné texty (`:25-40`), přitom `commute_km` a životní situace existují.
- **Osobnost se nikdy nemění.** Vůdcovství a konzistence se spočítají z věku jen při vzniku
  (`generators/player.ts:232-263`).
- **Pozice je na celý život.**
- **Trénink**: zaměření na konkrétní atribut neexistuje, atribut se losuje z typu tréninku
  (`season/training.ts:320-328, 545`). Navržený `focusedSkill` leží mrtvý v `skills/training.ts:5-9,53-70`.
  Šance na zlepšení (`season/training.ts:562`) nezná pracovitost, disciplínu ani morálku.
  Přetížení stojí jen morálku, nikdy zranění. AI týmy netrénují (`season/daily-tick.ts:256`).
- **Zranění**: vyléčená se mažou (`season/daily-tick.ts:935`) → žádná historie, recidiva,
  náchylnost se nemění. Bez rehabilitace a nerozehranosti.
- **Regenerace** = výdrž + věk (`season/daily-tick.ts:947-961`), alkohol ani fyzická práce ne.
- **Povolání**: pod 20 let „Student“ navždy (`generators/occupations.ts:920`). `injuryRisk`
  a `strengthBonus` mrtvé (`generators/occupations.ts:36-38`), `overtimeRisk` jen vybírá text
  výmluvy (`events/absence.ts:796`), ne šanci na absenci. Hotová `smenaProPovolani`
  (`generators/occupations.ts:986`) se na docházku nepoužívá (`season/training.ts:350-385`,
  `events/absence.ts:749`).
- **Alkohol** zrychluje únavu a dává kocovinu, ale do šance na absenci u zápasu nevstupuje
  (`events/absence.ts:749`), jen mění text výmluvy (`:809`).
- **Rodina** se nevede (`messaging/chat-kontext.ts:202-213` to přiznává), svatba/dítě/rozvod
  jsou jen dočasné situace.
- **Dospívání** přidá stejné body do všech 12 atributů (`season/dospivani.ts:27-30,96-107`),
  trenér mládeže ani akademie nemají vliv, výška neroste. Odchovanec nic nedědí
  (`season/academy-graduation.ts:125-128`), archiv `departed_players` se nevyužívá.
- `identity.avatarConfig` (`generators/player.ts:180-202`) se spočítá a zahodí.

---

## 5. Systémy kolem klubu

Dobře propojené (všechny efekty někdo čte): vybavení (23 kategorií), personál (12 rolí),
stadion, globální přízeň obce, reputace, paměť rozhodčího, novináři, brigády/investice/pozvánky.

Slepé uličky a kosmetika:
- **Zastupitelé — `preferences`** (`likes_local_players`, `results_matter`, `derby_friendly`,
  `scandal_sensitive`, `sponsor_ties`, `party_friendly`, `hates_loaning_out`,
  `villages/officials-generator.ts:113-119`): čte je jen API výpis, FE je nezobrazuje.
- **Zastupitelé — `trust`**: píše se jen 50, nikdy se nemění, FE ho nezobrazuje.
- **Přízeň jednotlivých zastupitelů**: jen cena pozvánky a volby (na produ až 2027).
- **Petice**: šablona náhodně (`season/village-processor.ts:525`), „stížnost na šatny“ i se šatnami
  L3; „Dětský den“ a „Otevřený trénink“ nemají vliv na fanoušky ani trénink.
- **Vztahy hráčů ↔ přestupy**: při odchodu se vztahy tiše smažou (`transfers/remove-player.ts:98`),
  bratr ani kamarád nereaguje; `player-interest.ts` a `player-agency.ts` vztahy nečtou.
- **Statistiky hráče se při odchodu mažou** (`transfers/remove-player.ts:91`) → nejdou klubové
  rekordy ani legendy. Tržní hodnota jsou jen rating, věk a pozice (`season/economy.ts:278`).
- **Trofeje, achievementy, ocenění sezóny**: jen výpisy. Král střelců nedostane hodnotu ani zájem.
  Kronika (vybavení) nesouvisí se skutečnými trofejemi.
- **Prodej miláčka kotle**: závažnost `prodej_opory` se řídí jen `sila` hráče
  (`transfers/transfer-news.ts:226`), ne `fan_group_players`.

Sběrnice `fans/club-events.ts` už nese 20 druhů událostí (`prodej_opory`, `odchod_legendy`,
`posila`, `serie_vyher`, `rozhovor_kritika`…) — jeden další odběratel by oživil preference
zastupitelů a `trust` bez nových dat.

---

## 6. Doporučené pořadí (dopad / práce)

| # | Co | Dopad | Práce |
|---|---|---|---|
| A | Bugy 2.1–2.3 (náchylnost, reklamní lišta, délka zranění z katalogu) | střední | malá |
| B | Výška do vzdušných soubojů a brankáře | střední, viditelné | malá–střední |
| C | Prahy taktik přeškálovat jako u tvrdosti | vysoký | malá |
| D | Forma z posledních hodnocení + kocovina místo kostky ±25 % | vysoký | střední |
| E | Kondice jednotlivce do výkonu a rizika zranění | vysoký (rotace) | střední |
| F | Povolání do docházky (směny, sezónní práce) | vysoký, sedí na okres | střední |
| G | Váha/postava: ukládat, BMI, přibírání, únava a zranění | střední | střední + migrace |
| H | Stárnutí po atributech + konec kariéry + docházka/alkohol do vývoje | vysoký | střední–velká |
| I | Zkušenost a brankářské dovednosti do enginu | střední | střední |
| J | Preference zastupitelů přes `club_events` | střední | malá–střední |
| K | Vztahy ↔ přestupy, archiv statistik, legendy, „syn legendy“ | střední, příběh | střední |
| L | Silnější noha (exekutor standardek, střelba) | nízký | malá |
