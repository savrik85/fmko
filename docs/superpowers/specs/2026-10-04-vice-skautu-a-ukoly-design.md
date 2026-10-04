# Více skautů a úkoly skautingu (design)

Stav: návrh ke schválení. Datum: 2026-10-04.

## 1. Cíl a motivace

V současném stavu je skaut v FMKO pouze pasivní položkou v realizačním týmu:
- Klub může mít maximálně **1 skauta** (unikátní slot jako u asistenta či lékaře).
- Skaut vykonává pouze dvě pasivní činnosti:
  1. Jednou týdně (v pondělním `staff-tick.ts`) pošle do zpráv 1 tip na volného hráče z okresu.
  2. Pasivně snižuje rozptyl odhadu stropů v kádru a U21 (`development.ts`).
- Manažer nemá možnost poslat skauta na konkrétního hráče, prozkoumat příštího soupeře ani zadat cílené hledání (např. talenty v U21 nebo chybějící levý bek).

**Cíl této featury:**
1. Umožnit mít **více skautů současně** (základ 2 skauti, další sloty se odemykají s licencí hlavního trenéra).
2. Dát skautům **aktivní úkoly (mise)**:
   - **Skautovat konkrétního hráče** (odkrytí mlhy, přesný strop, povaha, alkohol, zájem o přestup).
   - **Skautovat zápas / soupeře** (taktický rozbor, odhalení slabiny, zápasový bonus).
   - **Obecné hledání talentů / postu** (pročesávání okresu, ligy nebo U21 soutěží).
3. Zachovat a prohloubit **vesnickou atmosféru Pralesu** (zprávy psané lidsky, vesnické drby, historky z cest).

---

## 2. Kapacita skautů podle licence trenéra

Hlavní trenér si v Trenérské škole dělá kurzy a licence (`0: Bez licence`, `1: Licence C`, `2: UEFA B`, `3: UEFA A`, `4: UEFA Pro`).
Počet povolených skautů se odvíjí od jeho licence:

| Úroveň licence | Název licence | Max. skautů | Herní význam |
|:---:|---|:---:|---|
| **0** | Bez licence | **2** | Základní síť: dva místní pozorovatelé (např. bývalý hráč a štamgast). |
| **1** | Licence C | **2** | Standardní okresní přebor, možnost rotovat 2 různé mise. |
| **2** | UEFA B | **3** | Krajská úroveň, otevření 3. skauta pro trvalé sledování U21 / mládeže. |
| **3** | UEFA A | **4** | Poloprofesionální struktura, pokrytí soupeřů i přestupového trhu. |
| **4** | UEFA Pro | **5** | Maximální skautská síť pro velkoklub s rezervou i dorostem. |

### Ekonomický balanc
- Každý najatý skaut pobírá standardní týdenní plat (`weekly_wage`, typicky 600 až 4 500 Kč/týden dle kvalit).
- Mít 3 nebo 4 skauty je dobrovolné strategické rozhodnutí manažera a představuje stálou zátěž pro klubovou pokladnu.
- Za jednorázové výjezdy (konkrétní hráč / zápas) se může platit drobný příspěvek na cestu a diety (např. 200–500 Kč dle vzdálenosti obce).

---

## 3. Typy úkolů (Mise skautů)

Skaut může být ve dvou stavech:
- `idle` (volný v klubu – generuje týdenní tipy do schránky jako dnes).
- `on_assignment` (v terénu na zadané misi).

### A. Hráčský skauting (Konkrétní hráč)
- **Cíl:** Jakýkoli hráč v databázi, který nepatří našemu týmu (z přestupové listiny, z cizího týmu, volný hráč, junior v U21).
- **Trvání:** 2 až 3 herní dny (nebo do odehrání nejbližšího zápasu hráče).
- **Výsledek mise (Skautský report hráče):**
  1. **Odstranění mlhy u atributů:** Místo širokého intervalu (např. 35–55) manažer vidí přesné číslo s rozptylem max ±1 bod.
  2. **Skutečný strop a talent:** Přesný odhad, kde je hráčův strop a kolik sezón mu zbývá do jeho dosažení.
  3. **Osobnost a morálka:** Odhalení skrytých parametrů – `alcohol` (jak moc pije), `temper` (vznětlivost / karty), `workRate` (ochota trénovat).
  4. **Přestupová nálada:** Odhad skauta, zda by hráč měl zájem přestoupit, jaké může mít finanční nároky a jaké má vazby na svůj současný klub.

### B. Zápasový skauting (Příští soupeř)
- **Cíl:** Nadcházející ligový nebo pohárový soupeř (případně konkrétní zápas v lize).
- **Trvání:** Do odehrání nejbližšího zápasu soupeře (nebo 3 dny před naším vzájemným duelem).
- **Výsledek mise (Taktický report):**
  1. **Rozestavení a styl:** V jakém rozestavení soupeř nastoupil a jaký herní styl hraje (např. zatažený protiútok, tvrdá hra, nakopávané míče).
  2. **Klíčový hráč soupeře:** Identifikace nejnebezpečnějšího hráče a doporučení (např. *„Střelec Vodička dává góly z vápna, nesmí dostat prostor.“*).
  3. **Odhalená slabina:** Identifikace nejslabšího článku (např. *„Pravý obránce má slabou rychlost a nestíhá návraty.“*).
  4. **Herní bonus:** V samotném zápase náš tým získá taktický bonus (+2 až +4 k taktické efektivitě týmu a lepší reakci na soupeřovu formaci).

### C. Plošný / Sektorový skauting (Hledání v terénu)
- **Cíl:** Dlouhodobé sledování určitého segmentu trhu:
  - **Talenty do 21 let:** Pročesávání dorostu, U21 a mladých hráčů v okrese/kraji.
  - **Hledání na konkrétní post:** Hledání posily na pozici (brankář, stoper, střední záložník, hrotový útočník).
  - **Volní hráči v okrese:** Sledování neregistrovaných borců a odpadlíků.
- **Trvání:** 7 až 14 herních dní (nebo trvalý úkol do odvolání).
- **Výsledek:** Pravidelný report každé pondělí obsahující 2 až 3 konkrétní kandidáty s detailním zdůvodněním, proč by zapadli do našeho kádru (podle potřeb a mezer v sestavě).

---

## 4. Vliv atributů skauta na výsledek mise

Kvalita odevzdaného reportu závisí na vlastnostech konkrétního skauta:

- **Úsudek (`judgement` — 1 až 20):**
  - Rozhoduje o přesnosti odhadu talentu a stropu. Skaut s úsudkem 18 vidí strop bezchybně; skaut s úsudkem 6 může přecenit průměrného hráče.
  - V zápasovém reportu odhalí skutečnou taktickou slabinu soupeře.
- **Komunikace (`communication` — 1 až 20):**
  - Rozhoduje o zjištění zákulisních informací: charakter hráče, alkohol, ochota přestoupit, rodinné poměry, atmosféra v soupeřově kabině.
- **Pracovitost (`work_rate` — 1 až 20):**
  - Zkracuje dobu trvání mise (např. rychlý výjezd za 1–2 dny místo 3).
  - Při plošném skautingu přináší více tipů za kratší čas.
- **Šarm (`charm` — 1 až 20):**
  - Skaut dokáže v soupeřově klubovně či hospodě vyzvědět informace, které nejsou na hřišti vidět (např. interní spory, hrozící absence).

---

## 5. Datový model a migrace

### 1. Změna v `staff_members`
V tabulce `staff_members` se role `skaut` může vyskytovat u jednoho týmu vícekrát:
- Sloupec `assignment_id TEXT` (volitelně pro přímou vazbu na aktivní úkol, nebo řešeno přes tabulku úkolů).

### 2. Nová tabulka `scout_assignments`
```sql
CREATE TABLE scout_assignments (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  staff_id TEXT NOT NULL REFERENCES staff_members(id),
  type TEXT NOT NULL,                  -- 'player' | 'match' | 'area'
  target_player_id TEXT,               -- cíl pro typ 'player'
  target_team_id TEXT,                 -- sledovaný soupeř pro typ 'match'
  target_match_id TEXT,                -- konkrétní zápas pro typ 'match'
  filter_focus TEXT,                   -- 'talents' | 'position' | 'free_agents' (pro 'area')
  filter_position TEXT,                -- 'GK' | 'DEF' | 'MID' | 'FWD' (pokud focus = 'position')
  status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'completed' | 'cancelled'
  days_total INTEGER NOT NULL,         -- celková délka mise
  days_remaining INTEGER NOT NULL,     -- odpočet dní do dokončení
  cost INTEGER NOT NULL DEFAULT 0,     -- jednorázové cestovní náklady
  report_title TEXT,                   -- titulek vygenerovaného reportu
  report_body TEXT,                    -- textový souhrn reportu (v lidském / vesnickém tónu)
  report_data TEXT,                    -- JSON se strukturovanými daty (odkryté skilly, taktická data)
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX idx_scout_assignments_team ON scout_assignments(team_id, status);
CREATE INDEX idx_scout_assignments_staff ON scout_assignments(staff_id, status);
```

### 3. Perzistence odkrytých dat hráče
Aby zjištěná data o hráči nezmizela hned po přečtení reportu:
- Záznam v `scout_assignments` s typem `player` a `status = 'completed'` slouží jako trvalý audit reportu.
- Při zobrazení profilu hráče (`/hrac/[id]`) se zkontroluje, zda má náš tým dokončený skautský report na tohoto hráče ne starší než např. 1 sezónu. Pokud ano, profil zobrazuje odkrytá čísla a štítek *„Oskautováno [Jméno Skauta], [Datum]“*.

---

## 6. Herní cyklus (Staff Tick a Zápas)

### Denní odpočet (v `staff-tick.ts`)
1. Cron každé ráno projde všechny `scout_assignments` se `status = 'active'`.
2. Sníží `days_remaining = MAX(0, days_remaining - 1)`.
3. Pokud `days_remaining === 0`:
   - Vygeneruje se report podle typu mise a vlastností skauta (`judgement`, `communication`, `work_rate`).
   - Nastaví se `status = 'completed'`, `completed_at = datetime('now')`.
   - Odešle se zpráva do interní pošty / Kabiny týmu od daného skauta s odkazem na report.

### Využití v zápasovém enginu (`match-runner.ts`)
- Před výkopem se ověří, zda domácí či hostující tým má aktivní dokončený zápasový report na soupeře z posledních 14 dní.
- Pokud ano, aplikuje se `scoutMatchBonus` (+2 až +4 k taktické disciplíně a mírné snížení šancí soupeře z jeho hlavní silné stránky).

---

## 7. Uživatelské rozhraní (UI/UX)

1. **Obrazovka Realizační tým (`/zamestnanci`):**
   - V sekci *Scouting* se zobrazují všechny karty najatých skautů (1 až 5 podle licence).
   - Indikátor kapacity: např. `Skauti: 2 / 3 (UEFA B umožňuje až 3 skauty)`.
   - Stav skauta:
     - 🟢 *Volný v klubu* → Tlačítko **[Zadat úkol]**.
     - 🟡 *Na misi: Sledování FK Horní Lhota (zbývají 2 dny)* → Tlačítko **[Zrušit misi]**.
     - 🔵 *Dokončeno* → Odkaz na poslední report.

2. **Profil cizího hráče (`/hrac/[id]`):**
   - U cizích hráčů a volných hráčů přibude akční tlačítko **„Poslat skauta“**.
   - Modal nabídne výběr z dostupných (volných) skautů s porovnáním jejich úsudku a odhadované doby trvání mise.

3. **Detail zápasu / Rozlosování:**
   - U budoucího soupeře tlačítko **„Vyslat skauta na soupeře“**.

4. **Nová sekce / Záložka „Skautské reporty“:**
   - Archiv všech dokončených reportů s filtry (Hráči, Soupeři, Nalezené talenty).

---

## 8. Fáze implementace

1. **Fáze 1 — Kapacita a hiring více skautů (API + DB + UI):**
   - Uvolnění unikátnosti role `skaut` v `apps/api/src/routes/staff.ts`.
   - Výpočet `maxScouts` podle licence manažera (`loadCoachLicence`).
   - Úprava UI v `/zamestnanci` pro zobrazení více karet skautů a jejich celkového limitu.

2. **Fáze 2 — Databáze úkolů a Hráčský skauting:**
   - Vytvoření tabulky `scout_assignments`.
   - Endpointy: zadání mise na hráče (`POST /teams/:teamId/scout/player`), zrušení mise, čtení reportů.
   - Odpočet a dokončení mise ve `staff-tick.ts`.
   - Napojení na detail hráče (`/hrac/[id]`) — zobrazení přesných čísel a skautské zprávy.

3. **Fáze 3 — Zápasový skauting (Příští soupeř):**
   - Zadání mise na zápas/soupeře.
   - Generátor taktického reportu (silné stránky, slabiny, klíčový hráč).
   - Napojení taktického bonusu do zápasové simulace (`match-runner.ts`).

4. **Fáze 4 — Plošné hledání talentů a postů:**
   - Dlouhodobé mise na vyhledávání talentů v U21 a na konkrétní posty.
   - Pravidelné týdenní reporty s doporučenými posilami.
