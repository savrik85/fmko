# Redesign seznamů: plán pro vykonavatele

> Tento dokument je zadání pro model, který bude změnu provádět. Je psaný tak, aby
> šel splnit bez doptávání. Kde něco chybí nebo nesedí se skutečným kódem, zastav
> se a zeptej se uživatele; nehádej.

Podklady ve stejné složce:

- `maketa.html`: cílový vzhled. Otevři ji v prohlížeči před prací a měj ji vedle sebe.
- `reference/list-kit.tsx` a `reference/data-table.tsx`: hotové sdílené díly.
  Prošly typovou kontrolou a byly vykreslené v aplikaci proti maketě. Do repa se
  kopírují beze změny (krok 0).
- `inventar.md`: seznam všech míst, kde se ve hře vykresluje seznam, s řádky v kódu.

## 1. Cíl

Ve hře je přes sto míst, kde se vykresluje seznam, a každé si ho skládá samo:
jiné záhlaví, jiná výška řádku, jinak zarovnaná čísla, na telefonu někde druhá
verze z karet, jinde schované rolování do strany. Cílem je, aby všechny seznamy
stály na dvou sdílených dílech a vypadaly a chovaly se stejně.

- **Tabulka** (`DataTable`): když hráč porovnává čísla ve sloupcích (ligová
  tabulka, kádr s atributy, střelci).
- **Řádkový seznam** (`ListRow`): když hráč vybírá položku a kliká na ni
  (zápasy, nabídky, pohyby na účtu, hráči na telefonu).

### Co cílem není

- Neměnit, **co** seznam ukazuje. Žádné nové sloupce, žádné nové údaje, žádné
  změny API. Výjimka: sloupec schovaný na telefonu se smí objevit jako druhý
  řádek pod názvem (viz 3.2).
- Nesahat na tmavé seznamy: `components/match/MatchReplayViewer.tsx`,
  `app/zapasovy-den/**`, `app/(hra)/zapas/[id]/zaznam/**`, `components/stadium/**`.
- Nesahat na klubový web `app/klub/**` (má vlastní šablony záměrně) ani na
  `app/(hra)/admin/**`.
- Neměnit sdílené třídy v `globals.css` (`.card`, `.section-label`, `.table-scroll`).
- Nepřepisovat stránky, které v inventáři nejsou.

## 2. Tvrdá pravidla projektu (platí při každém kroku)

Tato pravidla jsou z `CLAUDE.md` a z dřívějších chyb. Porušení znamená vrátit práci.

1. **Větev `testing`.** Nikdy `main`. Na produkci nasazuje jen uživatel výslovným pokynem.
2. **Nejdřív lokální náhled.** Každou vlnu ukaž uživateli na `localhost:3000`
   a počkej na souhlas. Teprve pak commit a push na `testing`.
3. **Anglické identifikátory.** Proměnné, funkce, typy, props, soubory. Česky jen
   texty pro hráče a komentáře.
4. **Žádný prázdný `catch`.** Na klientu `console.error("popis:", e)`.
5. **V textech pro hráče žádné dlouhé pomlčky** (`—`, `–`). Výjimka: `–` jako
   pomlčka mezi názvy dvou týmů a znak `−` u záporné částky.
6. **Nikdy neschovat rolování.** Třída `no-scrollbar` a `overflow-x-auto` bez
   viditelného vodítka se v seznamech nesmí objevit. Do strany se posouvá jen
   `DataTable` s `scroll` (má vlastní vodítko).
7. **Hlavní text se neořezává.** Jméno hráče, název klubu a titulek nesmí dostat
   `truncate` ani pevné `max-w-[…]`. Díly to řeší samy; nepřidávej to do buněk.
7a. **Název klubu vždy `<TeamName … wrap />`.** Bez `wrap` má AI klub název na jednom
    řádku s `truncate` a roztáhne tabulku za okraj karty (karta to ořízne a poslední
    sloupec zmizí, aniž by stránka přetekla). Po každé tabulce změř
    `table.getBoundingClientRect().width <= card.getBoundingClientRect().width`.
8. **Na telefonu nesmí seznam zabrat víc místa než dřív.** Před úpravou a po ní
   změř výšku prvních pěti řádků na šířce 375 px. Když je nová vyšší o víc než
   15 %, zúž obsah druhého řádku, nezvětšuj řádek.
9. **Nemaž `.next`, nezabíjej běžící servery, nezavírej taby s testem.**
10. **Build před pushem dělej v odděleném git worktree**, ne v hlavním stromu:
    `next build` by přepsal `.next` běžícího dev serveru.
11. **Barva hodnocení se neurčuje absolutními prahy.** Škála hodnocení není
    stovková. Použij `ratingToneIn(value, allValuesInList)` nebo nech neutrální.
    Atributy hráčů (rychlost, střelba…) dál barví existující `attrBg` z
    `@/lib/player-attrs`; to se nemění.
12. **Slovo „Rating“ se v textech pro hráče nepoužívá.** Je to „Hodnocení“,
    zkratka ve sloupci „Hod.“.

## 3. Vzhled: přesná specifikace

Obrázek je v `maketa.html`. Tady jsou hodnoty, které musí sedět.

### 3.1 Tokeny

Používej jen tyto třídy. Nové barvy ani velikosti nezaváděj.

| Role | Třída |
|---|---|
| Hlavní text | `text-ink` |
| Běžný text v buňce | `text-ink-light` |
| Podrobnosti, záhlaví | `text-muted` |
| Linka mezi řádky | `border-line-soft` |
| Linka pod záhlavím, nad patičkou | `border-line` |
| Podklad záhlaví, hover řádku, nadpis skupiny | `bg-surface-2` |
| Podklad ikony a neutrálního štítku | `bg-surface-3` |
| Vlastní klub nebo hráč | `bg-pitch-50` |
| Hlavní text řádku | `text-body` (15 px) `font-bold` |
| Druhý řádek | `text-meta` (13 px) |
| Záhlaví, drobné štítky | `text-micro` (11 px) `font-bold uppercase tracking-wider` |
| Zaoblení štítku / tlačítka / karty | `rounded-tight` / `rounded-control` / třída `.card` |
| Čísla | vždy `tabular-nums` |

Pozor na písmo: třída `font-heading` v této aplikaci písmo nemění (dává Outfit
jako zbytek stránky). Zúžené písmo Barlow Condensed má jen třída `.section-label`.
Nadpis seznamu proto vždy přes `ListCard title=…`, ne vlastním `<h3>`.

### 3.2 Tabulka

| Prvek | Hodnota |
|---|---|
| Záhlaví | výška 36 px, `bg-surface-2`, `text-micro` tučně verzálkami, `text-muted`, pod ním `border-line` |
| Řádek | 52 px na telefonu, 48 px od 640 px; mezi řádky `border-line-soft`; poslední bez linky |
| Hover | `bg-surface-2` (vlastní řádek hover nemění) |
| První sloupec | zarovnaný vlevo, odsazení 16 px od kraje karty |
| Ostatní sloupce | na střed; částky vpravo |
| Hlavní číslo řádku | poslední sloupec, `emphasis: true` (15 px tučně, `text-ink`) |
| Vlastní klub / hráč | `rowTone → { own: true }`: podklad `bg-pitch-50`, název `font-extrabold` |
| Zóny | `rowTone → { bar: "up" | "down" | "warn" }`: 3px proužek vlevo |
| Řazení | klik na záhlaví; aktivní sloupec `text-pitch-600` se šipkou |
| Dlouhá tabulka | `pageSize={20}` a tlačítko „Zobrazit dalších 20 z N“ |

**Telefon.** Tabulka se do strany neposouvá. Každý sloupec má `priority`:

- `1` (výchozí): vždy vidět. Na telefonu smí být nejvýš **4 sloupce** s prioritou 1
  včetně názvu.
- `2`: od 640 px.
- `3`: od 1024 px.

Údaje ze schovaných sloupců, bez kterých řádek nedává smysl, dej do druhého řádku
pod název přes `EntityCell meta=… metaMobileOnly`. Příklad ligové tabulky:
na telefonu `# · Klub · Z · Body`, pod názvem `17-3-2 · 61:19`.

**Výjimka s posuvem.** Jen tabulky atributů hráčů (víc než 8 číselných sloupců,
které hráč porovnává mezi sebou). Použij `scroll={{ minWidth: … }}`: první sloupec
se přilepí vlevo a pod tabulkou je na telefonu věta „Tabulku lze posunout do strany“.
V přilepeném sloupci zkrať křestní jméno na iniciálu (`A. Petrášek`).

### 3.3 Řádkový seznam

Stavba řádku je vždy stejná a nemění se mezi telefonem a desktopem:

```
[ 36px vlevo ]  Název (15 px tučně, max. 2 řádky)            [ hodnota / štítek / tlačítko ] [›]
                podrobnosti (13 px, jeden řádek)
```

| Prvek | Hodnota |
|---|---|
| Výška | nejmíň 56 px, odsazení `px-4 py-2.5` |
| Vlevo | portrét (`FaceAvatar size={30}` v kruhu), znak klubu (`BadgePreview size={32}`) nebo `RowIcon` s emoji. Nic jiného. |
| Název | hlavní informace řádku: jméno, soupeř, název položky |
| Podrobnosti | údaje oddělené ` · ` (mezera, středová tečka, mezera). Nejvýš tři. |
| Vpravo | jedna věc: `RowValue`, `ScoreChip`, `RatingPill`, `StatusChip`, nebo jedno tlačítko |
| Šipka | automaticky, když je řádek odkaz. S tlačítkem vpravo šipka není a řádek není odkaz. |
| Stav | `tone="new" | "warn" | "danger"`: 3px proužek vlevo. Podklad řádku se nebarví. |
| Skupiny | `RowGroup label="Kolo 22" aside="12. 11."` nad řádky skupiny |
| Dlouhý seznam | prvních 10, pak `ShowMore` |

Význam proužku: `new` = nepřečtené nebo čeká na reakci hráče, `warn` = upozornění
(únava, blíží se termín), `danger` = problém (zranění, stopka, propadlá lhůta).

### 3.4 Prázdný stav

Vždy `ListEmpty` (v tabulce prop `empty`). Text je celá věta: co prázdný seznam
znamená a co může hráč udělat. Když existuje další krok, přidej `action` s odkazem.

- Špatně: „Žádná data“, „Nic k zobrazení“, „Prázdné“.
- Dobře: „Zatím ti nikdo nenabídl přestup. Dej hráče na trh a kluby se ozvou samy.“

Existující texty prázdných stavů ponech, pokud jsou celou větou. Přepiš jen ty
jedno- a dvouslovné, a nový text napiš podle toho, co stránka dělá.

### 3.5 Štítky

| Co | Díl | Poznámka |
|---|---|---|
| Výsledek V/R/P | `ResultChip result="W"` | nahrazuje ručně psané čtverečky; `FormChip` v přátelácích nech být |
| Skóre zápasu | `ScoreChip result="W"` | podklad podle výsledku z pohledu zobrazeného týmu |
| Hodnocení hráče | `RatingPill value tone` | tón přes `ratingToneIn`, viz pravidlo 11 |
| Částka | `RowValue tone="plus" | "minus"` | záporná se znakem `−` (U+2212), formát `toLocaleString("cs")` + ` Kč` |
| Stav | `StatusChip tone` | krátký text, nejvýš tři slova |
| Pozice hráče | existující `PositionBadge` z `@/components/ui` | beze změny |

## 4. Postup

### Krok 0: sdílené díly (jednou, před první vlnou)

1. Zkopíruj `docs/redesign-seznamu/reference/list-kit.tsx` do
   `apps/web/src/components/ui/list-kit.tsx` a `reference/data-table.tsx` do
   `apps/web/src/components/ui/data-table.tsx`. **Beze změny obsahu.**
2. Do `apps/web/src/components/ui/index.ts` přidej na konec:
   ```ts
   export { DataTable, EntityCell, type DataColumn, type DataRowTone } from "./data-table";
   export {
     ListCard, ListRow, RowGroup, RowIcon, RowValue, ListEmpty, ShowMore,
     ResultChip, ScoreChip, RatingPill, StatusChip, ratingToneIn,
     type RowTone, type RatingTone, type MatchOutcome,
   } from "./list-kit";
   ```
3. `cd apps/web && npx tsc --noEmit -p .` musí projít bez výpisu.
4. Commit: `feat(seznamy): sdílené díly pro tabulku a řádkový seznam`.

Díly neupravuj kvůli jedné stránce. Když stránka potřebuje něco, co díl neumí,
zapiš to uživateli a počkej; nepřidávej prop „na míru“.

### Vlny

Pořadí je dané. Další vlnu začni až po souhlasu uživatele s předchozí.
Přesné soubory a řádky každé vlny jsou v `inventar.md`.

| Vlna | Oddíly v `inventar.md` | Proč v tomto pořadí |
|---|---|---|
| 1 | `/liga`, `/kadr`, `/tym/[id]` | nejnavštěvovanější; ověří oba díly |
| 2 | `/prestupy`, `/rozpis`, `/pohar`, `/turnaj`, `/pratelaky`, `/soutez`, `/u21` | stejné druhy seznamů jako vlna 1 |
| 3 | `/zapas (lineup)`, `/zapas/[id]`, `/hrac/[id]`, `/manazer/[id]`, `/akademie` | sestava a detaily |
| 4 | `/finance`, `/sponzori`, `/zamestnanci`, `/trenink`, `/vybaveni, /stadion, /incidenty` | řádky s částkou a akcí |
| 5 | `/fanousci`, `/hospoda`, `/udalosti`, `/reputace`, `/obec`, `/sazky`, `/sin-slavy, /napoveda, /rozhodci, /hlasovani` | řádky s ikonou a stavem |
| 6 | `/prehled` (widgety) a oddíl `/vice, /trener, misc` | malé seznamy v dlaždicích; až nakonec |

Vynechat úplně: oddíly `/telefon` (vypadá záměrně jako telefon) a `/zpravodaj, /redakce`
(vypadá záměrně jako noviny). Položky označené v inventáři `(?)` neřeš sám:
vypiš je uživateli na začátku vlny a zeptej se, jestli je brát jako seznam.

Tabulky v `/kadr` už dnes mají přilepený první sloupec a `table-scroll`. Tam jde
o převod na `DataTable scroll`, vzhled se má změnit jen na hodnoty z 3.2.

Mrtvý kód z inventáře (`squad-table.tsx`, `player-card.tsx`, `live-match.tsx`,
`sms-roulette.tsx`) nepřepisuj. Smazání navrhni uživateli zvlášť.

### Postup pro jednu stránku

Každou stránku dělej samostatně, v tomto pořadí. Nepřeskakuj body.

1. **Změř stav před.** Otevři stránku na `localhost:3000` v šířce 375 px (přes
   `iframe`, viz 6) a v 1366 px. Udělej snímek obou. Na 375 px si zapiš výšku
   prvních pěti řádků seznamu.
2. **Rozhodni díl** podle tabulky v 5. Když si nejsi jistý, je to řádkový seznam.
3. **Sepiš sloupce nebo stavbu řádku** do komentáře v PR popisu nebo do zprávy
   uživateli: co je název, co podrobnosti, co vpravo, které sloupce mají jakou
   prioritu. U tabulky zkontroluj, že na telefonu zůstanou nejvýš 4 sloupce.
4. **Přepiš.** Zachovej všechna data, odkazy, řazení, filtry a `onClick`. Smaž
   starou mobilní verzi (`md:hidden` karty), pokud byla; nový díl je jeden pro obě šířky.
5. **Ukliď.** Smaž importy a pomocné funkce, které po přepisu nikdo nepoužívá
   (`SortHeader`, místní `conditionLabel`…), ale jen ty z tohoto souboru.
6. **Zkontroluj.** `npx tsc --noEmit -p .` a `node check-links.mjs` (obojí v `apps/web`).
7. **Ověř v prohlížeči** podle kontrolního seznamu v 7. Snímek po.
8. **Commit** jedné stránky: `refactor(seznamy): <stránka> na sdílené díly`.

Po poslední stránce vlny: ukaž uživateli snímky před/po a počkej na souhlas.
Po souhlasu build ve worktree, `git push origin testing`, počkat na CI
(`gh run list --branch testing --limit 1 --json status,conclusion`) a ověřit
na `https://test.prales.fun`.

## 5. Který díl kdy

| Situace | Díl |
|---|---|
| Hráč porovnává 3 a víc čísel mezi řádky (body, skóre, atributy) | `DataTable` |
| Pořadí s jedním číslem (střelci, žebříček) | `DataTable` se sloupci `#`, název, číslo |
| Položky, na které se kliká, s jedním hlavním údajem vpravo | `ListRow` |
| Položky v čase (zápasy, pohyby na účtu, události) | `ListRow` + `RowGroup` podle dne nebo kola |
| Položka s tlačítkem akce (nabídka, výzva) | `ListRow` s tlačítkem v `trailing` |
| Seznam hráčů kádru na telefonu | `ListRow` (portrét, jméno, pozice a věk, hodnocení) |
| Seznam hráčů s atributy na desktopu | `DataTable` s `scroll` |
| Dvojice štítek a hodnota (Věk: 29 let) | **není seznam**, nech být |
| Dlaždice se statistikou | **není seznam**, nech být |

Kádr je jediné místo, kde smí být dva díly pro jeden obsah: do 768 px `ListRow`,
od 768 px `DataTable` s atributy. Je to tak už dnes a hráč tam chce na telefonu
něco jiného (rychle najít hráče) než na desktopu (porovnat atributy).

## 6. Jak testovat šířku 375 px

Okno prohlížeče v MCP často nejde zmenšit. Použij `iframe` vložený do stránky:

```js
const f = document.createElement("iframe");
f.id = "pv"; f.src = location.pathname;
f.style.cssText = "position:fixed;left:0;top:0;width:375px;height:812px;z-index:99999;border:0;background:#fff";
document.body.appendChild(f);
```

Lokální API běží proti testingu a odpovídá pomalu (5 až 10 s na dotaz). Čekej na
obsah smyčkou, ne pevnou pauzou. Po testu `document.getElementById("pv").remove()`.

Měření, které má projít na každé stránce (spusť v `iframe` dokumentu `d`):

```js
({
  overflows: d.documentElement.scrollWidth > 375,              // musí být false
  truncatedTitles: [...d.querySelectorAll(".line-clamp-2")]    // hlavní texty useknuté přes 2 řádky
    .filter((e) => e.scrollHeight > e.clientHeight + 1).length, // má být 0; když ne, zkrať podrobnosti nebo text
  hiddenScroll: [...d.querySelectorAll(".no-scrollbar, .overflow-x-auto")]
    .filter((e) => !e.classList.contains("table-scroll") && e.scrollWidth > e.clientWidth).length, // musí být 0
})
```

## 7. Kontrolní seznam pro každou stránku

Odškrtni vše, než stránku označíš za hotovou. Výsledek napiš uživateli po bodech,
včetně toho, co jsi neověřil.

- [ ] Seznam ukazuje stejné položky a stejné údaje jako před změnou (porovnej se snímkem).
- [ ] Všechny odkazy a tlačítka v řádcích vedou tam, kam vedly.
- [ ] Řazení a filtry fungují jako dřív (klikni na každý).
- [ ] 375 px: nic nepřetéká, žádné posouvání do strany mimo `DataTable scroll`.
- [ ] 375 px: jména a názvy nejsou useknuté; nejdelší název na stránce se zalomil.
- [ ] 375 px: výška prvních pěti řádků není o víc než 15 % větší než před změnou.
- [ ] 1366 px: záhlaví 36 px, řádek 48 px, čísla pod sebou.
- [ ] Prázdný stav má celou větu (vyzkoušej, pokud jde: jiný filtr, jiný klub).
- [ ] Vlastní klub nebo hráč je zvýrazněný, pokud byl zvýrazněný dřív.
- [ ] Světlý i tmavý klub: pokud řádek používá barvu klubu, zkus oba
      (zelený `/tym/302a0ce7-428a-4da8-b4ac-40f27eb9a7d1`, oranžový `/tym/d429bb15-310f-48b8-99e6-34f8a304b673`).
- [ ] `npx tsc --noEmit -p .` bez výpisu, `node check-links.mjs` hlásí „odkazy v pořádku“.
- [ ] V diffu není `truncate` na hlavním textu, `no-scrollbar`, `max-w-[` u názvu ani český identifikátor.

## 8. Vzory přepisu

### 8.1 Tabulka: ligová tabulka

```tsx
const columns: DataColumn<StandingRow>[] = [
  { key: "pos", header: "#", width: "w-10", align: "center",
    cell: (r) => <span className={`font-bold ${r.pos === 1 ? "text-gold-700" : "text-muted"}`}>{r.pos}</span> },
  { key: "team", header: "Klub", align: "left",
    cell: (r) => (
      <EntityCell
        leading={<BadgePreview primary={r.color} secondary={r.secondary} pattern={r.badge} initials={r.initials} size={24} />}
        name={r.name} bold={r.teamId === myTeamId}
        meta={`${r.won}-${r.drawn}-${r.lost} · ${r.goalsFor}:${r.goalsAgainst}`} metaMobileOnly />
    ) },
  { key: "played", header: "Z", title: "Zápasy", width: "w-10", cell: (r) => r.played },
  { key: "won", header: "V", title: "Výhry", width: "w-10", priority: 2, cell: (r) => r.won },
  { key: "drawn", header: "R", title: "Remízy", width: "w-10", priority: 2, cell: (r) => r.drawn },
  { key: "lost", header: "P", title: "Prohry", width: "w-10", priority: 2, cell: (r) => r.lost },
  { key: "score", header: "Skóre", width: "w-16", priority: 2, cell: (r) => `${r.goalsFor}:${r.goalsAgainst}` },
  { key: "form", header: "Forma", priority: 3,
    cell: (r) => <span className="inline-flex gap-1">{r.form.map((f, i) => <ResultChip key={i} result={f} />)}</span> },
  { key: "points", header: "Body", width: "w-14", emphasis: true, cell: (r) => r.points },
];

<ListCard title={leagueName} count={`${rows.length} týmů`}>
  <DataTable columns={columns} rows={rows} rowKey={(r) => r.teamId}
    rowHref={(r) => `/tym/${r.teamId}`}
    rowTone={(r) => ({ own: r.teamId === myTeamId, bar: r.pos <= promotionSpots ? "up" : r.pos > rows.length - relegationSpots ? "down" : undefined })}
    empty="Tabulka se naplní po prvním odehraném kole." />
</ListCard>
```

Názvy polí (`r.won`, `promotionSpots`…) jsou ilustrační. Použij ta, která stránka
už má; nic nepřejmenovávej v API ani v typech.

### 8.2 Řádkový seznam: výsledky týmu

Před (zkráceno, `app/(hra)/tym/[id]/page.tsx`): tabulka se sloupci Kolo, Soupeř,
Výsledek, Diváci, `min-w-[480px]` a `overflow-x-auto`.

Po:

```tsx
const [shownResults, setShownResults] = useState(10);

<ListCard title="Výsledky" count={`${matches.length} zápasů`}>
  {matches.slice(0, shownResults).map((m) => (
    <ListRow key={m.id} href={`/zapas/${m.id}/zaznam`}
      leading={<BadgePreview primary={m.opponentColor} secondary={m.opponentSecondary}
        pattern={(m.opponentBadge as BadgePattern) || "shield"} initials={initialsOf(m.opponent)} size={32} />}
      title={m.opponent ?? "Soupeř"}
      meta={[m.round != null ? `${m.round}. kolo` : null, m.isHome ? "doma" : "venku",
        m.attendance != null ? `${m.attendance.toLocaleString("cs")} diváků` : null].filter(Boolean).join(" · ")}
      trailing={<ScoreChip result={m.result}>{m.homeScore}:{m.awayScore}</ScoreChip>} />
  ))}
  <ShowMore shown={Math.min(shownResults, matches.length)} total={matches.length} step={10}
    onMore={() => setShownResults((n) => n + 10)} />
</ListCard>
```

### 8.3 Řádkový seznam s částkami po dnech

```tsx
<ListCard title="Pohyby na účtu" controls={filterSwitch}>
  {days.map((day) => (
    <Fragment key={day.date}>
      <RowGroup label={day.label} aside={formatSigned(day.total)} />
      {day.items.map((t) => (
        <ListRow key={t.id} leading={<RowIcon>{iconFor(t.category)}</RowIcon>}
          title={t.title} meta={t.detail}
          trailing={<RowValue tone={t.amount >= 0 ? "plus" : "minus"}>{formatSigned(t.amount)}</RowValue>} />
      ))}
    </Fragment>
  ))}
  {days.length === 0 && <ListEmpty icon="🧾">Na účtu se zatím nic nepohnulo. První pohyby přijdou po domácím zápase.</ListEmpty>}
</ListCard>
```

`formatSigned` napiš jednou do `apps/web/src/lib/format.ts`, pokud tam podobná
funkce ještě není (nejdřív hledej: `grep -rn "toLocaleString(\"cs\")" apps/web/src/lib`):

```ts
/** „+8 175 Kč“ / „−3 995 Kč“. Minus je matematický znak, ne spojovník. */
export function formatSigned(amount: number): string {
  const sign = amount > 0 ? "+" : amount < 0 ? "−" : "";
  return `${sign}${Math.abs(amount).toLocaleString("cs")} Kč`;
}
```

### 8.4 Hráči kádru na telefonu

```tsx
const ratings = players.map((p) => p.overall_rating);

{players.map((p) => (
  <ListRow key={p.id} href={`/hrac/${p.id}`}
    tone={p.injury ? "danger" : (p.lifeContext?.condition ?? 100) < 50 ? "warn" : undefined}
    leading={<FaceAvatar faceConfig={p.avatar} size={30} className="rounded-full bg-surface-3" />}
    title={`${p.first_name} ${p.last_name}`}
    meta={<><PositionBadge position={p.position} /> {p.age} let{p.injury ? ` · zraněn ${p.injury.daysRemaining} d` : ""}</>}
    trailing={<RatingPill value={p.overall_rating} tone={ratingToneIn(p.overall_rating, ratings)} />} />
))}
```

## 9. Co hlásit uživateli

Po každé vlně jedna krátká zpráva česky:

1. Které stránky jsou hotové (lokálně / na testingu).
2. Snímky před a po pro telefon i desktop.
3. Co ses rozhodl sám a proč (například které sloupce jsi na telefonu schoval).
4. Co jsi neověřil (například prázdný stav, který nejde na testovacích datech vyvolat).
5. Na co jsi narazil mimo zadání (chyba, nesrovnalost v datech). Neopravuj to; jen to napiš.

Když narazíš na chybu ve hře, která s redesignem nesouvisí, platí protokol z
`CLAUDE.md`: reprodukuj, najdi příčinu, popiš, počkej na souhlas.
