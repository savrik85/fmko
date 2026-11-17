# Sjednocení ovládacích prvků: plán pro vykonavatele

> Tento dokument je zadání pro model, který bude změnu provádět. Je psaný tak, aby
> šel splnit bez doptávání. Kde něco chybí nebo nesedí se skutečným kódem, zastav
> se a zeptej se uživatele; nehádej.

Navazuje na redesign seznamů (`docs/redesign-seznamu/plan.md`), který je hotový.
Seznamy a tabulky už stojí na sdílených dílech; tenhle plán řeší prvky, ze kterých
se skládá zbytek obrazovek.

Podklady ve stejné složce:

- `inventar.md`: všechna místa v kódu, kde se prvek staví ručně, se souborem a řádkem.
- `inventar.py`: skript, který inventář vytvořil. Po každé vlně ho spusť znovu
  (`python3 -I docs/redesign-prvku/inventar.py`) a čísla porovnej.
- `maketa.html`: vznikne v kroku 0. Do té doby nic nepřepisuj.

## 1. Cíl

Mimo seznamy si každá obrazovka pořád skládá drobné prvky sama. Hráč to vidí jako
nejednotnost: kolečko načítání jednou uprostřed obrazovky, jindy nahoře v kartě;
vybraná volba jednou plná tmavě zelená, jindy jen zelený rámeček; potvrzení
jednou jako spodní plachta, jindy jako okno prohlížeče. Cílem je, aby každý z
devíti druhů prvků stál na jednom sdíleném dílu.

| Oblast (`inventar.md`) | Co to je | Sdílený díl |
|---|---|---|
| `loading` | Načítání stránky nebo její části | `PageLoading`, `SectionLoading` (nové) |
| `errors` | Chybová hláška, červené tlačítko | `ErrorBox` (je), `Button variant="danger"` (opravit) |
| `money` | Částka v Kč | `formatKc`, `formatSigned` v `lib/format.ts` (nové) |
| `chips` | Malý štítek se stavem | `StatusChip` (je) |
| `progress` | Proužek průběhu | `ProgressBar` (nový) |
| `choices` | Výběr jedné nebo více voleb | `ChoiceGroup`, `ChoiceCard` (nové) |
| `dialogs` | Dialog, potvrzení, překrytí obrazovky | `Sheet`, `SheetDialog`, `useConfirm({ sheet: true })` (jsou) |
| `forms` | Textové pole, výběr, víceřádkový text | `Input`, `.select`, `AutoGrowTextarea` (jsou) |
| `collapsible` | Sbalitelný blok | `CollapsibleCard` (je), `Disclosure` (nový) |

### Co cílem není

- Neměnit, **co** obrazovka ukazuje a dělá. Žádné nové údaje, texty, tlačítka ani
  změny API. Mění se jen vzhled a chování prvku (třeba že dialog jde zavřít Escapem).
- Nesahat na seznamy a tabulky (`ListRow`, `DataTable` a spol.). Ty jsou hotové.
- Nesahat na místa, která vynechával i plán seznamů: tmavé obrazovky zápasu
  (`components/match/MatchReplayViewer.tsx`, `app/zapasovy-den/**`,
  `app/(hra)/zapas/[id]/zaznam/**`, `components/stadium/**`), klubový web
  `app/klub/**`, `app/(hra)/admin/**`, Telefon, Zpravodaj a Redakce (mají vlastní
  vzhled záměrně). Vynechaná je i úvodní stránka `components/landing/**`.
- Neměnit existující sdílené třídy v `globals.css` (`.card`, `.input`, `.select`,
  `.error-box`, `.btn-*`). Nová třída smí přibýt jen tam, kde to plán výslovně říká.
- Tlačítka (`btn-primary`, `btn-secondary`, `Button`) jsou jednotná už dnes,
  kromě červených (oblast `errors`, druh „tlačítko“).

## 2. Tvrdá pravidla (platí při každém kroku)

Stejná jako v plánu seznamů, sekce 2. Porušení znamená vrátit práci. Nejdůležitější:

1. **Větev `testing`.** Nikdy `main`. Na produkci nasazuje jen uživatel výslovným pokynem.
2. **Nejdřív lokální náhled.** Každou vlnu ukaž uživateli na `localhost:3000`
   a počkej na souhlas. Teprve pak push na `testing`, a jen na jeho výslovný pokyn.
3. **Anglické identifikátory.** Proměnné, funkce, typy, props, soubory. Česky jen
   texty pro hráče a komentáře. Existující české názvy nenapodobuj; ty, na které
   při převodu sáhneš, přejmenuj (viz `zavritKlikemVedle` v 3.7).
4. **Žádný prázdný `catch`.** Na klientu `console.error("popis:", e)`.
5. **V textech pro hráče žádné dlouhé pomlčky** (`—`, `–`), kromě pomlčky mezi
   názvy dvou týmů a znaku `−` u záporné částky.
6. **Na telefonu nesmí obrazovka narůst.** Před převodem a po něm změř na 375 px
   výšku bloku, do kterého jsi sáhl. Když je nová vyšší o víc než 15 %, zmenši
   obsah, ne odsazení dílu.
7. **Nemaž `.next`, nezabíjej běžící servery, nezavírej taby s testem.**
8. **Build před pushem v odděleném git worktree**, ne v hlavním stromu.
9. **Commit po každém souboru nebo malé skupině souborů** jedné oblasti, s popisem
   `refactor(prvky): <oblast> v <stránka>`.
10. **Nepřihlašuj se heslem.** Když se rozšíření Chrome nepřipojí, řekni to
    uživateli a počkej; nehledej cestu kolem.

## 3. Sdílené díly

Vzhled všech nových dílů a variant ukazuje `maketa.html` (krok 0). Tokeny barev a
písma jsou stejné jako v plánu seznamů, sekce 3.1. Nové barvy ani velikosti nezaváděj.

### 3.1 Načítání (`loading`)

Dnes 6 různých obalů kolem `<Spinner>` (`min-h-[50vh]`, `min-h-[40vh]`, `py-8`,
`py-10`, `py-12`, `py-20`, `h-40`, `min-h-[120px]`, s kartou i bez).

Nové díly v `components/ui/spinner.tsx`:

```tsx
/** Celá stránka se načítá: kolečko uprostřed horní poloviny obrazovky. */
export function PageLoading() {
  return <div className="page-container flex items-center justify-center min-h-[50vh]" role="status" aria-label="Načítám"><Spinner size="lg" /></div>;
}
/** Načítá se část stránky (karta, záložka). */
export function SectionLoading() {
  return <div className="flex justify-center py-8" role="status" aria-label="Načítám"><Spinner /></div>;
}
```

- Druh „stránka“ v inventáři → `PageLoading`. Druh „sekce“ → `SectionLoading`;
  když byl spinner uvnitř `.card`, zůstane karta a uvnitř `SectionLoading`.
- Druh „v textu nebo tlačítku“ (spinner vedle textu „Ukládám…“, v tlačítku) nech být.

### 3.2 Chyby a červená tlačítka (`errors`)

- Druh **„hláška“** → `<ErrorBox message={…} />`. Když hláška obsahuje odkaz nebo
  tučné slovo, `ErrorBox` dostane `children` místo `message` (rozšíření dílu je
  součást kroku 1: `message?: string; children?: ReactNode`).
- Druh **„tlačítko“**: dnes `Button variant="danger"` kreslí **zelené** tlačítko
  (`danger: "btn-primary"` v `button.tsx`), proto si každé červené tlačítko staví
  vlastní třídy. Krok 1 přidá do `globals.css` třídu `.btn-danger` a `button.tsx`
  ji použije. **Rozhodnuto 17. 11. 2026: varianta R2**, plné červené
  (`card-red`) s bílým textem a stínem karty. Pak ruční červená
  tlačítka → `<Button variant="danger">` nebo třída `btn btn-danger`.
- Druh **„tón (mapa nebo podmínka)“**: červený podklad ve stavové mapě nebo podmínce
  (`broken_off: "bg-red-50 text-red-700"`). To není chybová hláška, ale štítek:
  patří do oblasti `chips` (`StatusChip tone="danger"`). Když to štítek není
  (podbarvený řádek, buňka), nech být.

### 3.3 Částky (`money`)

Dnes 18 místních funkcí (`kc`, `czk`, `CZK`, `formatCZK`, `fmtCZK`, `formatPrice`…)
a 57 míst s `toLocaleString(…) Kč` přímo v textu. Jen jedna (`DemandsTab.tsx`) dává
před „Kč“ nezlomitelnou mezeru, všude jinde může „Kč“ spadnout na další řádek sám.

Nový soubor `apps/web/src/lib/format.ts`:

```ts
const NBSP = " ";

/** „1 200 Kč“. Mezera před Kč je nezlomitelná, „Kč“ nikdy nezůstane na řádku sám. */
export function formatKc(amount: number): string {
  return `${amount.toLocaleString("cs")}${NBSP}Kč`;
}

/** „+8 175 Kč“ / „−3 995 Kč“. Minus je matematický znak, ne spojovník. */
export function formatSigned(amount: number): string {
  const sign = amount > 0 ? "+" : amount < 0 ? "−" : "";
  return `${sign}${formatKc(Math.abs(amount))}`;
}
```

- Místní funkce smaž a import přesměruj na `formatKc`. Funkce s jiným výstupem
  (`formatValue` → „cca 1 200 Kč“) zůstanou jako tenký obal: `` `cca ${formatKc(v)}` ``.
- `signed` v `app/(hra)/soutez/ui.tsx` a `formatCZK` v `lib/sponsor-owners.ts`
  nahraď stejně; jejich exporty smaž, až je nikdo nepoužívá.
- `formatAmount` v `money-input.tsx` (číslo bez „Kč“ do pole) nech být.
- Rozsah „500–2 500 Kč“ (3 místa) obsahuje pomlčku `–`, kterou pravidlo 5 zakazuje.
  Nepřepisuj ho sám; uveď ho ve zprávě uživateli jako nález.

### 3.4 Štítky (`chips`)

Dnes 57 ručních pilulek (`rounded-full`, malé písmo) s 18 různými barvami podkladu
a komponenta `Badge`, použitá dvakrát. Cíl: všechno `StatusChip` z `list-kit.tsx`.

| Ruční štítek | `StatusChip tone` |
|---|---|
| zelený (`bg-pitch-*`, i plný „AKTUÁLNÍ“) | `ok` |
| zlatý, oranžový, žlutý | `warn` |
| červený | `danger` |
| šedý, béžový | `neutral` |

- Štítek pozice hráče je `PositionBadge`, erb `BadgePreview`: nech být.
- Když štítek potřebuje tón, který `StatusChip` nemá (třeba modrý), nepřidávej ho;
  napiš to uživateli a místo nech.
- Po převodu obou míst s `Badge` navrhni uživateli smazání `badge.tsx`.

### 3.5 Proužky průběhu (`progress`)

Dnes 40 ručních proužků (výšky `h-1.5`, `h-2`, `h-2.5`, `h-3`; dráha `bg-gray-100`,
`bg-gray-200`, `bg-ink/10`, `bg-surface-3`). Nový díl `components/ui/progress-bar.tsx`:

```tsx
type ProgressTone = "ok" | "warn" | "danger" | "neutral";
const FILL: Record<ProgressTone, string> = {
  ok: "bg-pitch-500", warn: "bg-gold-500", danger: "bg-card-red", neutral: "bg-muted",
};

/** Proužek průběhu. `label` je pro čtečku obrazovky, nezobrazuje se. */
export function ProgressBar({ value, max = 100, tone = "ok", size = "md", label }: {
  value: number; max?: number; tone?: ProgressTone; size?: "sm" | "md"; label: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <span className={`block w-full rounded-full overflow-hidden bg-surface-3 ${size === "sm" ? "h-1.5" : "h-2"}`}
      role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
      <span className={`block h-full rounded-full ${FILL[tone]}`} style={{ width: `${pct}%` }} />
    </span>
  );
}
```

- Barva podle hodnoty zůstává na stránce (stránka spočítá `tone`); díl prahy nezná.
  Pravidlo z plánu seznamů platí dál: barva hodnocení se neurčuje absolutními prahy.
- `StatBar` (atributy s popiskem a číslem) nech, jak je.

### 3.6 Výběr z voleb (`choices`)

Největší a nejviditelnější oblast: 115 míst v 53 souborech. Vybraná volba má dnes
nejméně pět vzhledů (plná `bg-pitch-500` s bílým textem, `bg-pitch-50` se zeleným
rámečkem, jen zelený rámeček, `ring`, tmavá `bg-pitch-700`).

**Rozhodnuto 17. 11. 2026: varianta C.** Uživatel vybíral ze tří variant v `maketa.html`:

- **A, plná:** vybraná volba `bg-pitch-500 text-white`, ostatní `bg-surface-2`.
- **B, světlá:** vybraná `bg-pitch-50 border-2 border-pitch-500 text-pitch-700`,
  ostatní bílé s `border-line`.
- **C, bílá s fajfkou (vybraná):** vybraná bílá s dvoupixelovým zeleným rámečkem
  (`pitch-500`) a ✓ v pravém horním rohu, ostatní `bg-surface-3` bez rámečku.
  Nedostupná volba přeškrtnutá, `text-muted-light`, bez podkladu.

Nové díly `components/ui/choice.tsx`:

```tsx
export interface ChoiceOption<T extends string> { value: T; label: ReactNode; hint?: ReactNode; disabled?: boolean }

/** Řada nebo mřížka voleb. Jedna volba (`role="radiogroup"`) nebo víc (`multiple`, tlačítka s `aria-pressed`). */
export function ChoiceGroup<T extends string>(props: {
  options: ReadonlyArray<ChoiceOption<T>>;
  value: T | T[];
  onChange: (value: T) => void;   // u multiple dostane přepnutou volbu
  multiple?: boolean;
  columns?: 2 | 3 | 4 | 6;         // bez columns řada, která se zalamuje
  size?: "sm" | "md";              // sm = filtry (h-8), md = formuláře (h-11)
  ariaLabel: string;
}): JSX.Element;

/** Velká volba s ikonou, názvem, popisem a cenou (velikost autobusu, kurz, úroveň). */
export function ChoiceCard(props: {
  selected: boolean; onSelect: () => void; disabled?: boolean;
  icon?: ReactNode; title: ReactNode; detail?: ReactNode; aside?: ReactNode;
}): JSX.Element;
```

| Situace | Díl |
|---|---|
| 2 až 6 krátkých voleb vedle sebe (místo zápasu, sázka, formace) | `ChoiceGroup` |
| Filtry, které jde zapnout víc najednou (pozice) | `ChoiceGroup multiple size="sm"` |
| Volba s víc údaji (ikona, popis, cena) | `ChoiceCard` v mřížce |
| Výběr dne v kalendáři (přáteláky) | `ChoiceGroup columns={6}`; přeškrtnutý den = `disabled` |
| Záložky stránky | **není volba**, to je `Tabs`; nech být |
| Uložené sestavy A/B/C, taktika s ikonou | `ChoiceCard` |

### 3.7 Dialogy (`dialogs`)

Projekt už rozhodl, že překrytí obrazovky je `Sheet` (komentář v `sheet.tsx`:
spodní plachta na telefonu, dialog na desktopu, Escape, vrácení zaměření, zámek
scrollu). Zbytek ho zatím nepoužívá.

- `window.confirm` (5 míst) → `useConfirm({ sheet: true })`.
- `useConfirm()` bez plachty (19 míst) → `useConfirm({ sheet: true })`. Až žádné
  místo nevolá `useConfirm()` bez parametru, navrhni uživateli, aby se plachta
  stala výchozí a `ConfirmDialog` zmizel.
- `<Modal>` a `<ConfirmDialog>` (17 míst) → `<Sheet>` a `<SheetDialog>`.
- Vlastní překrytí `fixed inset-0` (10 míst) → `<Sheet>`. Výjimky, na které se
  **zeptej** před převodem: celoobrazovkové kroky v `app/onboarding/page.tsx` a
  `app/konec-sezony/page.tsx`, zvětšená fotka v `app/(hra)/hrac/[id]/page.tsx`.
- Prop `zavritKlikemVedle` (`modal.tsx`, `sheet.tsx`) je český identifikátor.
  Při převodu dialogů ho přejmenuj na `closeOnBackdrop` ve všech voláních najednou.

### 3.8 Formulářová pole (`forms`)

- Textové a číselné pole → `<Input>` (nebo třída `input`, když pole potřebuje
  vlastní obal). Částky dál `MoneyInput`.
- `<select>` → třída `select` (už je v `globals.css`). Nový díl nevzniká.
- `<textarea>` → `AutoGrowTextarea`, když text roste; jinak `textarea` s třídou `input`.
- Zaškrtávací políčka, přepínače a posuvníky do převodu nepatří.

### 3.9 Sbalitelné bloky (`collapsible`)

- Celá karta, která jde sbalit → `CollapsibleCard` (na telefonu sbalená, na
  desktopu rozbalená).
- Malé „Podrobnosti“ uvnitř karty → nový `Disclosure` v `components/ui/disclosure.tsx`:
  `<details>` a `<summary>` se stejnou šipkou ▾ jako `CollapsibleCard`, písmo
  `text-meta font-bold`, bez vlastního rámečku. Zachovává chování `<details>`.

## 4. Postup

### Krok 0: maketa a rozhodnutí uživatele

1. Napiš `docs/redesign-prvku/maketa.html` (samostatná stránka bez buildu,
   barvy a písma z `globals.css`). Ukaž v ní na 375 px i na šířce 1024 px:
   načítání stránky a sekce, `ErrorBox`, červené tlačítko, všechny tóny
   `StatusChip`, `ProgressBar` ve všech tónech, `ChoiceGroup` a `ChoiceCard`
   **ve třech variantách A, B, C**, otevřenou `Sheet` s potvrzením, `Input`,
   `select`, `Disclosure`.
2. Ukaž ji uživateli a zeptej se na dvě věci: variantu vybrané volby (A, B, C)
   a vzhled červeného tlačítka. Dokud neodpoví, nepokračuj krokem 1.

### Krok 1: sdílené díly

1. Napiš nové díly podle sekce 3 (`PageLoading`, `SectionLoading`, `ErrorBox`
   s `children`, `.btn-danger`, `lib/format.ts`, `ProgressBar`, `ChoiceGroup`,
   `ChoiceCard`, `Disclosure`) a exportuj je z `components/ui/index.ts`.
2. `cd apps/web && npx tsc --noEmit -p .` bez výpisu.
3. Commit: `feat(prvky): sdílené díly pro načítání, částky, proužky, volby a rozbalení`.

Díly neupravuj kvůli jednomu místu. Když místo potřebuje něco, co díl neumí,
napiš to uživateli a místo nech.

### Vlny

Pořadí je dané. Další vlnu začni až po souhlasu uživatele s předchozí.

| Vlna | Oblasti | Proč v tomto pořadí |
|---|---|---|
| 1 | `loading`, `errors` (hláška, tlačítko), `money` | bez vizuálního rozhodnutí, malé riziko, vidět skoro všude |
| 2 | `chips` (včetně tónů z `errors`), `progress` | stejný princip: ruční třídy → díl s tónem |
| 3 | `choices` | až po volbě varianty; nejvíc míst, dělat po stránkách |
| 4 | `dialogs` | mění chování (Escape, plachta), ověřit klikáním |
| 5 | `forms`, `collapsible` | nejméně viditelné |

V každé vlně postupuj po souborech podle `inventar.md`, ne po řádcích: jeden
soubor = jedno otevření, převod všech jeho míst dané oblasti, kontrola, commit.

### Postup pro jeden soubor

1. **Změř stav před.** Otevři stránku na `localhost:3000` na 375 px (iframe, plán
   seznamů sekce 6) a na desktopu. Snímek obou. Zapiš výšku bloků, kterých se
   převod týká.
2. **Rozhodni u každého místa**, jestli do převodu patří (sekce 3 a 5). Co nepatří,
   zapiš jako „ponecháno“ s důvodem.
3. **Přepiš.** Zachovej texty, odkazy, `onClick`, `disabled` a podmínky zobrazení.
4. **Ukliď** importy a pomocné funkce, které v souboru nikdo nepoužívá.
5. **Zkontroluj:** `npx tsc --noEmit -p .` a `node check-links.mjs` v `apps/web`.
6. **Ověř v prohlížeči** podle sekce 7. Snímek po.
7. **Commit** souboru.

Po vlně: spusť `inventar.py` znovu a napiš uživateli, kolik míst v oblasti zbylo
a proč. Ukaž snímky před a po. Počkej na souhlas. Po souhlasu a pokynu k pushi
build ve worktree, `git push origin testing`, počkat na CI a ověřit na
`https://test.prales.fun`.

## 5. Kdy místo do převodu nepatří

| Situace | Co s tím |
|---|---|
| Spinner vedle textu nebo v tlačítku | nech |
| Červený podklad řádku nebo buňky (zranění, dluh) | nech; není to hláška ani štítek |
| Pilulka v barvě klubu, pozice hráče, erb | nech (`BadgePreview`, `PositionBadge`) |
| Proužek, který je součást grafu nebo hřiště | nech |
| Přepínač záložek | nech; je to `Tabs` |
| Volba, která po kliknutí hned odešle akci (tlačítko „Beru termín“) | nech; je to tlačítko, ne volba |
| Celoobrazovkový krok (onboarding, konec sezóny) | zeptej se |
| Pole v tmavém prostředí (`input-dark`) | nech |
| Místo v souboru, který plán v sekci 1 vynechává | nech |

## 6. Testování

Stejně jako v plánu seznamů, sekce 6 (iframe 375 px, měření přetečení). Navíc:

- **Volby:** klikni na každou volbu, vybraná se zvýrazní a ostatní ne; klávesnicí
  Tab a mezerník; u `multiple` zapni dvě najednou.
- **Dialogy:** otevři, zavři Escapem, zavři kliknutím vedle (když to dialog
  dovoluje), potvrď. Na 375 px je plachta dole a nepřekrývá ji spodní lišta.
- **Částky:** vyhledej na stránce `/ Kč/` na začátku řádku; „Kč“ nesmí stát samo.
- **Načítání:** zpomal síť v DevTools (Slow 3G) a podívej se, kde kolečko stojí.

## 7. Kontrolní seznam pro každý soubor

- [ ] Obrazovka ukazuje stejné údaje a texty jako před převodem (porovnej se snímkem).
- [ ] Všechny volby, tlačítka a dialogy dělají totéž co dřív.
- [ ] 375 px: nic nepřetéká, blok nenarostl o víc než 15 %.
- [ ] 375 px i desktop: převedený prvek vypadá jako v `maketa.html`.
- [ ] Chybový stav ověřený, pokud jde vyvolat (vypnutá síť, neplatný vstup).
- [ ] `npx tsc --noEmit -p .` bez výpisu, `node check-links.mjs` hlásí „odkazy v pořádku“.
- [ ] V diffu není prázdný `catch`, český identifikátor ani dlouhá pomlčka v textu pro hráče.

## 8. Vzory přepisu

### 8.1 Načítání a chyba

```tsx
// Před
if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>;
if (error) return <div className="text-sm text-card-red bg-red-50 border border-red-200 rounded-soft px-3 py-2">Historii se nepodařilo načíst: {error}</div>;

// Po
if (loading) return <PageLoading />;
if (error) return <ErrorBox message={`Historii se nepodařilo načíst: ${error}`} />;
```

### 8.2 Částka

```tsx
// Před
const kc = (v: number) => `${v.toLocaleString("cs-CZ")} Kč`;
<span>{kc(deal.remaining)}</span>

// Po
import { formatKc } from "@/lib/format";
<span>{formatKc(deal.remaining)}</span>
```

### 8.3 Štítek a proužek

```tsx
// Před
{isYouth && <span className="text-xs bg-pitch-100 text-pitch-700 px-2 py-0.5 rounded-full font-heading font-bold">Odchovanec</span>}
<span className="block h-2 mt-1.5 rounded-full bg-gray-100 overflow-hidden"><span className="block h-full bg-pitch-500" style={{ width: `${pct}%` }} /></span>

// Po
{isYouth && <StatusChip tone="ok">Odchovanec</StatusChip>}
<ProgressBar value={pct} label={`Splaceno ${pct} %`} />
```

### 8.4 Volba

```tsx
// Před (přáteláky, místo zápasu)
{VENUES.map((v) => (
  <button key={v.key} onClick={() => setVenue(v.key)}
    className={`... ${venue === v.key ? "bg-pitch-600 text-white" : "bg-surface-2 text-ink"}`}>{v.label}</button>
))}

// Po
<ChoiceGroup ariaLabel="Kde se hraje" columns={3} value={venue} onChange={setVenue}
  options={VENUES.map((v) => ({ value: v.key, label: v.label }))} />
```

### 8.5 Potvrzení

```tsx
// Před
if (!window.confirm("Opravdu zrušit smlouvu?")) return;

// Po
const { confirm, dialog } = useConfirm({ sheet: true });
if (!(await confirm({ title: "Opravdu zrušit smlouvu?", confirmLabel: "Zrušit smlouvu", variant: "danger" }))) return;
// … a {dialog} jednou v JSX komponenty
```

Stejně ho už používají `app/(hra)/pratelaky/page.tsx` a `zamestnanci/skaut/page.tsx`.

## 9. Co hlásit uživateli

Po každé vlně jedna krátká zpráva česky:

1. Které soubory jsou hotové (lokálně, na testingu).
2. Kolik míst v oblastech vlny zbylo podle `inventar.py` a proč (ponechaná místa).
3. Snímky před a po pro telefon i desktop.
4. Co ses rozhodl sám a proč.
5. Co jsi neověřil.
6. Na co jsi narazil mimo zadání. Neopravuj to; jen to napiš.

## 10. Stav (17. 11. 2026)

Krok 0 hotový: maketa v `maketa.html`, uživatel vybral volbu C a červené tlačítko R2.
Krok 1 hotový: `PageLoading`, `SectionLoading`, `ErrorBox` s `children`, `.btn-danger`
(`Button variant="danger"`), `lib/format.ts`, `ProgressBar`, `ChoiceGroup`, `ChoiceCard`,
`Disclosure`. Ověřené na dočasné stránce na 375 px i desktopu.
Vlna 1 hotová lokálně: částky (27 formátovačů a 80 ručních zápisů → `formatKc`,
spojovník před výdajem → minus), načítání (70 obalů → `PageLoading`/`SectionLoading`),
chyby (13 hlášek → `ErrorBox`, 7 destruktivních tlačítek → `btn-danger`).
Vlna 2 hotová lokálně: štítky (`StatusChip` s `ChipTone` a `title`), proužky (`ProgressBar`).
Vlna 3 hotová lokálně: `ChoiceGroup`/`ChoiceCard` v přátelácích, Sestavě, autobusu, Přestupech,
Poptávkách, Lize, hymně, identitě, vyjednávání, U21, kádru, u skauta, sponzorů a hostování;
`choiceClass` + `SelectedMark` pro výběry s náhledem (Dres, Maskot, styl hymny, úroveň akademie).
Ponecháno k rozhodnutí uživatele: řádky filtrů v Hledat (rolují do strany, zalomení by kartu
na telefonu zvětšilo o víc než 15 %). Ponecháno: záložky (mise skauta, Aktivní/Historie nabídek,
sekce mládeže), tlačítka otevírající panel (Filtrovat, Víc) a přepínače vedle nich, kvíz trenéra,
konfigurátor stadionu, ovládání dlaždic na Domů, sázková tabule, onboarding (vlastní vzhled),
volby s radiem v popisku (hostování podmínka, úkoly zaměstnanců).
Vlna 4 hotová lokálně: všechna potvrzení jako plachta (`useConfirm({ sheet: true })`),
`window.confirm` nahrazený, vlastní překrytí (nabídka na trh, skaut, hostování, odpověď majitele)
jsou `Sheet`, `zavritKlikemVedle` → `closeOnBackdrop`. Ponecháno: `Modal` (už obal nad `Sheet`),
výběr hráče v Sestavě (portál), odhalení hráče, oznámení novinek, onboarding, konec sezóny.
Vlna 5 hotová lokálně: 64 polí na třídách `input`/`select` (rozměry jako `!` přepsání),
karty „Jak to funguje“ jako `CollapsibleCard startCollapsed`, tři malá rozbalení `Disclosure`.
Ponecháno: pole na tmavém podkladu a s dynamickou třídou, karty v Tréninku a rozboru kádru
s vlastním záhlavím.
Vše lokálně, nepushnuté; push jen na pokyn uživatele.
