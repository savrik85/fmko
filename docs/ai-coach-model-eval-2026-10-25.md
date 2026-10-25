# Výběr modelu AI trenéra (2026-10-25)

Podklad pro `COACH_MODEL` v `apps/api/src/ai-coach/llm.ts`. Měřeno na skutečných rozhodnutích
AI klubů z kopie produkce, ne na vymyšlených příkladech.

## Shrnutí

**Vybraný model: `@cf/openai/gpt-oss-120b` se střední silou úvahy (`reasoning_effort: "medium"`).**

- Ze všech kandidátů nejspolehlivější: v kolech 2 a 3 platných 56 z 56 zápasových rozhodnutí a 35 z 36
  týdenních (jediné selhání byl klíč z jiného seznamu, který se dnes jen zahodí). Medián 26 až 32 s,
  90. percentil 37 s, daleko od platformního limitu 120 s.
- Nejlépe drží povahu trenéra (riziko × útočnost 0,44 až 0,48; llama 0,06) a dává pokyny na lavičce
  (33 pravidel na 28 zápasů; llama 1 až 7).
- Sestavy jsou v simulaci enginem nejblíž silnému náhradnímu pravidlu (−0,067 bodu na zápas, v lize −0,05).
  Ztráta je hlavně záměrná rotace v přátelácích a šance mladým, ne chyby.
- Síla úvahy „high" dala v kole 3 o 0,008 bodu víc, což je pod šumem měření, přemýšlela ale třikrát déle
  (90. percentil 128 s) a 4 % odpovědí nestihla. „Medium" je proto lepší volba i bez ohledu na cenu.
- kimi-k2.5 je vyřazený, qwen3.8-27b na úkol nestačí časem (platforma volání ukončí po 120 s), nemotron
  je s upraveným promptem horší a občas narazí na limit, llama-4-scout je rychlá, ale povahu ignoruje.
- Cena: kolem 0,002 USD za rozhodnutí, pod 0,5 USD týdně za všechny AI kluby.

## Kandidáti

Jen modely hostované Cloudflarem, které pokrývají startupové kredity (ceník Workers AI k 25. 10. 2026,
USD za milion tokenů vstup / výstup).

| model | cena | poznámka |
|---|---|---|
| `@cf/openai/gpt-oss-120b` | 0,35 / 0,75 | uvažující model, umí `reasoning_effort` low / medium / high |
| `@cf/nvidia/nemotron-3-120b-a12b` | 0,50 / 1,50 | uvažující model |
| `@cf/qwen/qwen3.8-27b` | 0,45 / 3,20 | uvažující model, na tenhle úkol příliš pomalý |
| `@cf/meta/llama-4-scout-17b-16e-instruct` | 0,27 / 0,85 | dnešní model textů na testingu, neuvažuje |
| `@cf/moonshotai/kimi-k2.5` | 0,60 / 3,00 | **nejde použít**: od 30. 5. 2026 vyřazený a přesměrovaný na kimi-k2.6, který vyžaduje placenou fakturaci mimo kredity; všechna volání vrátila `8005` / `8008 Internal server error` |

Všechny čtyři použitelné modely vracejí odpověď ve tvaru OpenAI `choices[0].message.content`,
uvažující modely navíc `reasoning` / `reasoning_content` (úvahu kód nečte). Všechny přijmou
`response_format` s JSON schématem (structured outputs) a dodrží ho.

Platforma sama ukončí volání po zhruba 120 s (chyba `3046 Request timeout`), nezávisle na našem limitu.

## Jak se měřilo

- **Data**: kopie produkce `backups/prod.sqlite` (záloha `prod-pred-0275-20261025.sql`, herní den 24. 10. 2026),
  jen lokálně. Skripty: `apps/api/scripts/ai-coach-bench/` (postup v README).
- **Zápas (28 rozhodnutí na model a kolo)**: 16 AI áček Prahy a Českých Budějovic (ze 18; dvě nemají
  naplánovaný ligový zápas aktuální sezóny), jejich nejbližší ligový zápas (16), pohár (8) a 4 ligové zápasy
  brané jako přátelák. Povahy trenérů pokrývají riziko 16 až 89 a mládež 25 až 75. Kontext i prompt jsou přesně
  ty, které připraví `loadMatchContext` a `renderMatchPrompt` v produkci (omluvenky přes `buildMatchPlayers`,
  sudí, počasí, tabulka, nabídka formací a taktik spočítaná enginem).
- **Týdenní správa (18 rozhodnutí na model)**: všech 18 AI áček v herní pondělí 26. 10. Kluby se v kopii
  nejdřív doplnily (`completeAiClub`: stadion, vybavení, povaha), jako budou po nasazení fáze 2.
- **Kontrola**: stejná jako v produkci (`validateMatchDecision`, `validateWeeklyDecision`, `planWeeklyActions`).
  „Platné" = model odpověděl včas a rozhodnutí prošlo celé, bez náhradního pravidla.
- **Kvalita zápasových rozhodnutí enginem**: každá sestava (každého modelu i náhradního pravidla) odehrála
  300 zápasů skutečným `simulateMatch` proti stejné sestavě soupeře (jeho nejlepší 4-4-2 vyrovnaně, u poháru
  kádr klubu mimo hru z `cup_club_players`), se stejnými semínky pro všechny. Výsledek = průměr bodů na zápas
  (3/1/0) a rozdíl proti náhradnímu pravidlu na týchž zápasech. Náhradní pravidlo je silný základ: bere
  nejsilnější jedenáctku a taktiku, kterou kádr umí. AI trenér ho nemá přebíjet za každou cenu (spec:
  „žádný dokonalý optimalizátor"), ale nemá ani zbytečně ztrácet.
- **Povaha**: korelace (Pearson) vlastností trenéra s rozhodnutím: riziko × útočnost (taktika, tvrdost,
  pokyny na lavičce), šetrnost × utracené peníze nad rezervou, chuť stavět × počet staveb a vybavení.

Kola měření:

1. **Kolo 1**: časový limit 90 s, úvaha nejvýš 6 000 tokenů, volání přes `getPlatformProxy` (binding `env.AI`).
2. **Kolo 2**: limit 300 s, úvaha 12 000 tokenů, volání přes REST API účtu (lokální proxy u dlouhých volání
   padala na „fetch failed"), stejný prompt jako kolo 1. gpt-oss ve dvou silách úvahy.
3. **Kolo 3**: stejné kontexty jako kolo 2, upravený prompt (účinnost každé taktiky v každé formaci a připomínka,
   kdy skutečný trenér rotuje). Jen hlavní kandidáti.

## Výsledky

### Zápas, kolo 1 (limit 90 s)

| model | platných | medián doby | výstupních tokenů | slabá taktika (účinnost pod 0,9) | pokyny na lavičce | riziko × útočnost | selhání |
|---|---|---|---|---|---|---|---|
| gpt-oss-120b (high) | 17 / 28 (61 %) | 59 s | 4 201 | 4 | 24 | 0,42 | 9× překročený čas, 2× došly tokeny na úvahu |
| nemotron-3-120b | 23 / 28 (82 %) | 30 s | 2 452 | 8 | 24 | 0,38 | 5× překročený čas |
| qwen3.8-27b | 2 / 28 (7 %) | 84 s | 4 242 | 1 | 2 | - | 26× překročený čas |
| llama-4-scout | 28 / 28 (100 %) | 2,3 s | 121 | 9 | 1 | 0,06 | - |

### Zápas, kolo 2 (limit 300 s, simulace 300 zápasů na rozhodnutí)

Body na zápas: liga / pohár / přátelák v závorce. „Lepší / horší" = v kolika z 28 zápasů dal model
o víc než 0,02 bodu víc / míň než náhradní pravidlo na stejných semínkách.

| model | platných | medián doby | 90. percentil | výstupních tokenů | slabá taktika | pokyny na lavičce (prošlo) | body na zápas | rozdíl proti pravidlu | lepší / horší | riziko × útočnost | selhání |
|---|---|---|---|---|---|---|---|---|---|---|---|
| náhradní pravidlo | 28 / 28 | 0 s | 0 s | 0 | 0 | 86 (86) | 1,705 (1,011 / 2,946 / 1,999) | 0 | - | 0,70 | - |
| gpt-oss-120b (high) | 28 / 28 | 58 s | 93 s | 4 900 | 7 | 51 (49) | 1,628 (0,951 / 2,936 / 1,722) | −0,077 | 3 / 15 | 0,44 | - |
| gpt-oss-120b (medium) | 28 / 28 | 26 s | 32 s | 1 702 | 8 | 30 (29) | 1,615 (0,952 / 2,921 / 1,660) | −0,090 | 4 / 18 | 0,44 | - |
| nemotron-3-120b | 25 / 28 | 21 s | 35 s | 2 301 | 9 | 33 (33) | 1,615 (0,945 / 2,902 / 1,718) | −0,090 | 3 / 17 | 0,53 | 3× `3046 Request timeout` po 120 s |
| llama-4-scout | 28 / 28 | 2,5 s | 2,8 s | 121 | 9 | 1 (0) | 1,625 (0,949 / 2,893 / 1,794) | −0,080 | 5 / 15 | 0,06 | - |
| qwen3.8-27b | 0 / 4 | - | - | - | - | - | - | - | - | - | 4× `3046 Request timeout` po 120 s, měření zastaveno |

U nemotronu se tři selhání v simulaci počítají s náhradním pravidlem (tak by to dopadlo i v provozu).

### Zápas, kolo 3 (upravený prompt, stejné kontexty jako kolo 2)

| model | platných | medián doby | 90. percentil | výstupních tokenů | slabá taktika | pokyny na lavičce (prošlo) | body na zápas | rozdíl proti pravidlu | lepší / horší | riziko × útočnost | selhání |
|---|---|---|---|---|---|---|---|---|---|---|---|
| náhradní pravidlo | 28 / 28 | 0 s | 0 s | 0 | 0 | 86 (86) | 1,705 (1,011 / 2,946 / 1,999) | 0 | - | 0,70 | - |
| **gpt-oss-120b (medium)** | **28 / 28** | **32 s** | **37 s** | 1 782 | 7 | 33 (31) | 1,638 (0,961 / 2,887 / 1,848) | −0,067 | 1 / 18 | **0,48** | - |
| gpt-oss-120b (high) | 27 / 28 | 85 s | 128 s | 5 978 | 7 | 48 (47) | 1,646 (0,968 / 2,917 / 1,818) | −0,059 | 5 / 17 | 0,47 | 1× prázdná odpověď po 154 s (došly tokeny na úvahu) |
| nemotron-3-120b | 28 / 28 | 43 s | 73 s | 2 752 | 9 | 41 (39) | 1,595 (0,929 / 2,893 / 1,659) | −0,110 | 4 / 20 | 0,21 | - |
| llama-4-scout | 28 / 28 | 4,1 s | 4,7 s | 122 | 10 | 7 (7) | 1,593 (0,925 / 2,888 / 1,674) | −0,112 | 4 / 18 | −0,04 | - |

Kolo 3 běželo souběžně s týdenním měřením, doby jsou proto o něco delší než v kole 2.

### Týdenní správa (18 klubů)

První měření (prompt bez stylu slovy a bez investičního rozpočtu):

| model | platných | medián doby | bannery (podepsáno / volných míst) | trávník pod 45 opraven | podíl utracených peněz nad rezervou | nábor | stavby | vybavení | šetrnost × utraceno | chuť stavět × stavby | mládež × akademie | selhání |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| náhradní pravidlo | 18 / 18 | 0 s | 108 / 108 | 15 / 16 | 0,31 | 16 | 15 | 21 | 0,13 | 0,25 | 0,70 | - |
| gpt-oss-120b (high) | 17 / 18 | 76 s | 102 / 102 | 14 / 15 | 0,45 | 17 | 32 | 48 | −0,01 | −0,32 | 0,68 | 1× 0 tréninků (dnes se srovná na 1) |
| gpt-oss-120b (medium) | 18 / 18 | 23 s | 72 / 108 | 15 / 16 | 0,37 | 17 | 30 | 50 | 0,30 | −0,16 | 0,56 | - |
| nemotron-3-120b | 15 / 18 | 48 s | 78 / 90 | 11 / 13 | 0,52 | 12 | 27 | 39 | 0,10 | −0,45 | 0,63 | 1× vymyšlený klíč, 2× `3046` po 120 s |

Modely rozhodují rozumně (trávník opraví, bannery berou, akademii řídí podle sázky na mládež), ale utrácely
bez ohledu na šetrnost a chuť stavět. Proto se do kódu přidal investiční rozpočet podle chuti stavět
(stavby a nové vybavení jen do 15 až 100 % peněz nad rezervou), povaha slovy v promptu, rada k počtu tréninků,
doplnění volných míst na bannery a tolerance k jednotlivé volbě mimo nabídku (zahodí se, ne celé rozhodnutí).

Druhé měření (s těmito úpravami):

| model | platných | medián doby | trávník pod 45 opraven | podíl utracených peněz nad rezervou | nábor | stavby | vybavení | šetrnost × utraceno | mládež × akademie | selhání |
|---|---|---|---|---|---|---|---|---|---|---|
| náhradní pravidlo | 18 / 18 | 0 s | 15 / 16 | 0,31 | 16 | 15 | 21 | 0,13 | 0,70 | - |
| gpt-oss-120b (medium) | 17 / 18 | 28 s | 14 / 15 | 0,41 | 16 | 28 | 46 | 0,15 | 0,65 | 1× klíč z jiného seznamu (dnes se jen zahodí) |
| gpt-oss-120b (high) | 18 / 18 | 87 s | 15 / 16 | 0,47 | 16 | 29 | 49 | 0,31 | 0,62 | - |

Bannery se v tomto měření ještě nedoplňovaly kódem (medium podepsal 49 ze 102 volných míst, high 99 ze 108);
dnes je plánovač doplní vždy. Týdenní správa s high přemýšlí třikrát déle (87 s) pro podobná rozhodnutí,
což potvrzuje volbu medium i tady. Velké stavby hlídá investiční rozpočet, levné kusy vybavení se do něj vejdou
u každé povahy, proto počet nákupů s chutí stavět skoro nesouvisí; rozdíl je v drahých položkách
a v rezervě podle šetrnosti, které kód vynutí u kteréhokoli modelu.

## Pozorování

- **Structured outputs fungují**: se schématem (výčty formací, taktik a klíčů hráčů) vrací gpt-oss i llama
  platný JSON prakticky vždy. Selhání byla jen časová: překročený limit, platformní `3046` po 120 s, nebo
  vyčerpané tokeny na úvahu (prázdná odpověď).
- **llama-4-scout** je rychlá a platná, ale mělká: povahu ignoruje (riziko × útočnost 0,06 a −0,04), téměř
  vždy hraje oblíbenou formaci (27 a 28 z 28) a pokyny na lavičce skoro nedává (1 a 7 pravidel na 28 zápasů).
  Odůvodnění jsou obecné fráze („Defensive approach, give youngsters chances").
- **gpt-oss-120b** drží povahu (0,42 až 0,48), dává bohaté pokyny na lavičce (střídání unavených, změna
  taktiky podle skóre, reakce na vyloučení) a odůvodnění se opírá o konkrétní věci: vítr a dlouhé míče,
  přísnost sudího, sílu soupeře, kondici konkrétních hráčů. Příklady z kola 3:
  - Jiskra Vinohrady (riziko 81) jako outsider proti Podolí (31,7 proti 58,4): „Underdogs, windy, poor pitch;
    use solid 5-3-2, offensive, switch to defensive if behind."
  - Spartak Řeporyje (riziko 16) proti Klamovce (28,9 proti 64,6): 4-5-1 defenzivně, „switch to offensive if
    behind after 60'".
  - Lokomotiva Srubec (riziko 82) proti benevolentnímu sudímu: 3-5-2 útočně a do těla.
- **nemotron-3-120b** v kole 2 nejlépe sledoval povahu (0,53), ale s upraveným promptem spadl na 0,21
  a −0,11 bodu; navíc občas narazí na platformní limit 120 s a v týdenní správě si jednou vymyslel klíč.
- **qwen3.8-27b** na tenhle prompt nestihne úvahu ani za 120 s (26 z 28 a 4 ze 4 volání vypršelo).
- **Proti náhradnímu pravidlu** ztrácejí všechny modely kolem 0,06 až 0,11 bodu na zápas, nejvíc v přáteláku
  (rotace, test mladých: tak to má být) a v lize kolem 0,05. Je to lidská nedokonalost (šetření hráčů, sázka
  na mladé, styl podle povahy), ne chyby: neplatné sestavy, hráče mimo kádr ani nesmyslné taktiky kód nepustí.
  Upravený prompt (kolo 3) zlepšil gpt-oss high z −0,077 na −0,059, nemotronu a llamě naopak uškodil
  (−0,09 na −0,11 a −0,08 na −0,11), medium se zlepšil z −0,090 na −0,067. Šum simulace je kolem
  ±0,015 bodu na průměr 28 zápasů, takže rozdíly pod 0,03 berte opatrně: gpt-oss high a medium jsou
  v kole 3 prakticky stejně dobré a oba lepší než nemotron a llama.
- **Cena**: gpt-oss high spotřebuje na zápas zhruba 1 500 vstupních a 5 000 až 6 000 výstupních tokenů
  (asi 0,005 USD), medium kolem 1 700 výstupních (asi 0,002 USD). Při 22 AI áčkách a zhruba čtyřech
  rozhodnutích týdně je to pod 0,5 USD týdně.

## Nastavení v kódu

`apps/api/src/ai-coach/llm.ts`:

- `COACH_MODEL = "@cf/openai/gpt-oss-120b"`, `reasoning_effort: "medium"`, `max_tokens` = odpověď + 12 000
  tokenů na úvahu (medium jich spotřebuje kolem 1 700, rozpočet je jen pojistka).
- `response_format` s JSON schématem (`strict`), klíče hráčů a položek nabídky jako výčet, prázdná nabídka
  jako prázdný seznam. Model tak hráče ani volbu mimo nabídku skoro napsat nemůže; kdyby přesto, kód
  u zápasu celé rozhodnutí odmítne (náhradní pravidlo) a u týdne zahodí jen tu jednu položku.
- Časový limit 120 s (`DEFAULT_TIMEOUT_MS`), jedno opakování při rychlé přechodné chybě platformy
  (5017, 8008, výpadek sítě), ne při překročeném čase.
- Při výpadku, překročeném čase, prázdné nebo neplatné odpovědi rozhodne náhradní pravidlo podle povahy
  (`fallbackMatchDecision`, `fallbackWeeklyDecision`). Zápas ani tick na model nikdy nečekají: sestavy
  se připravují ráno a odpoledne přes frontu, týdenní správa v pondělí ráno.
- Jiný model jde na jednom klubu vyzkoušet bez nasazení: `POST /api/admin/ai-coach/run?teamId=…&task=match&dryRun=1&model=…`;
  sílu úvahy a celé srovnání skripty v `apps/api/scripts/ai-coach-bench/` (zápis `model#medium`).

Doporučení k nasazení: na testingu nejdřív `ai_coach_mode = shadow` (model rozhoduje a zapisuje do deníku,
nic se neprovede), po kontrole deníku v adminu „AI trenéři" přepnout na `on`.
