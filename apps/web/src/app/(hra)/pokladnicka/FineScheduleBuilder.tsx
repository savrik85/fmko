"use client";

/**
 * Sestavení sazebníku pokut z hotových položek (packages/shared fine-schedule.ts).
 * Nic se nepíše volně: položka, podmínka, hodnota, opakování a pro koho platí se vybírají.
 */

import {
  CLASSIC_FINE_SCHEDULE, FINE_CZK_AMOUNTS, FINE_GROUP_LABELS, FINE_ITEMS, FINE_REPEAT_LABELS, FINE_SCOPE_LABELS,
  FINE_VALUES, MAX_FINE_ITEMS, fineCzkEquivalent, fineItemDef,
  type FineItemGroup, type FineRepeatMode, type FineScheduleItemInput, type FineScope, type FineValueKind,
} from "@okresni-masina/shared";

const GROUP_ORDER: FineItemGroup[] = ["training", "match", "off_pitch", "manual"];
const SELECT = "select w-full min-h-11 text-base";

/** Hodnota položky v jednom výběru: „czk:50“, „keg“. */
function valueKey(it: FineScheduleItemInput): string {
  return it.valueKind === "czk" ? `czk:${it.amountCzk ?? 50}` : it.valueKind;
}

function parseValue(v: string): { valueKind: FineValueKind; amountCzk: number | null } {
  if (v.startsWith("czk:")) return { valueKind: "czk", amountCzk: Number(v.slice(4)) };
  return { valueKind: v as FineValueKind, amountCzk: null };
}

/** Varování slovy, bez čísel: co kabinu na položce štve. */
export function itemWarning(it: FineScheduleItemInput): string | null {
  const def = fineItemDef(it.itemKey);
  const cond = def?.conditions.find((c) => c.key === it.conditionKey);
  if (it.itemKey === "penalty_miss") return "Pokuta za chybu ve hře. Na okrese se za fotbal neplatí, kabina to nesnese.";
  if (it.itemKey === "yellow_card" && it.conditionKey !== "dissent") return "I za faul, kterým hráč zastavil brejk. To kluci berou jako trest za práci pro tým.";
  if (cond && cond.harshness >= 2) return "Trestá i práci, rodinu a nemoc. Hráči s dětmi a na směny to ponesou těžce.";
  const czk = fineCzkEquivalent(it.valueKind, it.amountCzk);
  if (czk >= 500) return "Pro většinu kluků je to víc než týdenní výplata z klubu.";
  if (czk >= 200) return "Pro kluky z učiliště a studenty je to dost peněz.";
  if (it.repeatMode === "double_from_second" && czk >= 100) return "Dvojnásobek se rychle nasčítá.";
  return null;
}

export function FineScheduleBuilder({ items, onChange }: {
  items: FineScheduleItemInput[];
  onChange: (items: FineScheduleItemInput[]) => void;
}) {
  const update = (i: number, patch: Partial<FineScheduleItemInput>) => onChange(items.map((it, n) => (n === i ? { ...it, ...patch } : it)));
  const remove = (i: number) => onChange(items.filter((_, n) => n !== i));
  const add = () => {
    const used = new Set(items.map((it) => `${it.itemKey}|${it.conditionKey}`));
    const next = FINE_ITEMS.flatMap((d) => d.conditions.map((c) => ({ d, c }))).find(({ d, c }) => !used.has(`${d.key}|${c.key}`));
    if (!next) return;
    onChange([...items, { itemKey: next.d.key, conditionKey: next.c.key, valueKind: "czk", amountCzk: 50, repeatMode: "flat", scope: "senior" }]);
  };

  return (
    <div className="space-y-3">
      {items.length === 0 && (
        <p className="text-base text-muted">Sazebník je prázdný. Přidej položku, nebo začni předvolbou Klasika okresu.</p>
      )}
      {items.map((it, i) => {
        const def = fineItemDef(it.itemKey);
        const warn = itemWarning(it);
        return (
          <div key={i} className="rounded-xl border border-gray-200 bg-surface p-3 space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-heading font-bold text-muted uppercase">Položka {i + 1}</span>
              <button type="button" onClick={() => remove(i)} className="text-sm font-bold text-card-red hover:underline">Odebrat</button>
            </div>
            <label className="block">
              <span className="text-sm text-muted">Za co</span>
              <select className={SELECT} value={it.itemKey} onChange={(e) => {
                const d = fineItemDef(e.target.value);
                if (d) update(i, { itemKey: d.key, conditionKey: d.conditions[0].key });
              }}>
                {GROUP_ORDER.map((g) => (
                  <optgroup key={g} label={FINE_GROUP_LABELS[g]}>
                    {FINE_ITEMS.filter((d) => d.group === g).map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
                  </optgroup>
                ))}
              </select>
            </label>
            {def && def.conditions.length > 1 && (
              <label className="block">
                <span className="text-sm text-muted">Kdy</span>
                <select className={SELECT} value={it.conditionKey} onChange={(e) => update(i, { conditionKey: e.target.value })}>
                  {def.conditions.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </label>
            )}
            {def && <p className="text-sm text-muted">{def.hint}</p>}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <label className="block">
                <span className="text-sm text-muted">Kolik</span>
                <select className={SELECT} value={valueKey(it)} onChange={(e) => update(i, parseValue(e.target.value))}>
                  {FINE_CZK_AMOUNTS.map((a) => <option key={a} value={`czk:${a}`}>{a.toLocaleString("cs-CZ")} Kč</option>)}
                  {Object.values(FINE_VALUES).map((v) => <option key={v.kind} value={v.kind}>{v.label}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-sm text-muted">Opakování</span>
                <select className={SELECT} value={it.repeatMode} onChange={(e) => update(i, { repeatMode: e.target.value as FineRepeatMode })}>
                  {(Object.keys(FINE_REPEAT_LABELS) as FineRepeatMode[]).map((k) => <option key={k} value={k}>{FINE_REPEAT_LABELS[k]}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-sm text-muted">Pro koho</span>
                <select className={SELECT} value={it.scope} onChange={(e) => update(i, { scope: e.target.value as FineScope })}>
                  {(Object.keys(FINE_SCOPE_LABELS) as FineScope[]).map((k) => <option key={k} value={k}>{FINE_SCOPE_LABELS[k]}</option>)}
                </select>
              </label>
            </div>
            {warn && <p className="text-sm text-warn">⚠️ {warn}</p>}
          </div>
        );
      })}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={add} disabled={items.length >= MAX_FINE_ITEMS}
          className="px-3 py-2.5 rounded-control text-base font-bold border border-pitch-500 text-pitch-600 hover:bg-pitch-50 disabled:opacity-50">
          Přidat položku
        </button>
        <button type="button" onClick={() => onChange(CLASSIC_FINE_SCHEDULE.map((x) => ({ ...x })))}
          className="px-3 py-2.5 rounded-control text-base font-bold border border-gray-300 text-ink hover:bg-surface-3">
          Klasika okresu
        </button>
      </div>
      {items.length >= MAX_FINE_ITEMS && <p className="text-sm text-muted">Víc než {MAX_FINE_ITEMS} položek si kabina nezapamatuje.</p>}
    </div>
  );
}
