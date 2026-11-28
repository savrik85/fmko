"use client";

/**
 * Sestavení sazebníku pokut z hotových položek (packages/shared fine-schedule.ts).
 * Nic se nepíše volně: prohřešek, částka a opakování se vybírají. Jedna položka = jeden
 * řádek seznamu, ať se sazebník na telefonu vejde na obrazovku.
 */

import {
  CLASSIC_FINE_SCHEDULE, FINE_CZK_AMOUNTS, FINE_GROUP_LABELS, FINE_ITEMS, FINE_REPEAT_LABELS,
  MAX_FINE_ITEMS, fineCzkEquivalent, fineItemDef,
  type FineItemGroup, type FineItemKey, type FineRepeatMode, type FineScheduleItemInput,
} from "@okresni-masina/shared";
import { Button } from "@/components/ui";
import { formatKc } from "@/lib/format";

const GROUP_ORDER: FineItemGroup[] = ["training", "match", "off_pitch"];
const SELECT = "select w-full min-h-11 text-base";

/** Prohřešek a podmínka v jednom výběru („training_missed|pub“). */
const offenceKey = (it: { itemKey: string; conditionKey: string }) => `${it.itemKey}|${it.conditionKey}`;

/** Název prohřešku i s podmínkou („Vynechaný trénink: kvůli hospodě“). */
export function offenceTitle(it: { itemKey: string; conditionKey: string }): string {
  const def = fineItemDef(it.itemKey);
  if (!def) return it.itemKey;
  const cond = def.conditions.find((c) => c.key === it.conditionKey);
  return def.conditions.length > 1 && cond ? `${def.label}: ${cond.label.toLowerCase()}` : def.label;
}

/** Varování slovy, bez čísel: co kabinu na položce štve. */
export function itemWarning(it: FineScheduleItemInput): string | null {
  const def = fineItemDef(it.itemKey);
  const cond = def?.conditions.find((c) => c.key === it.conditionKey);
  if (it.itemKey === "penalty_miss") return "Pokuta za chybu ve hře. Na okrese se za fotbal neplatí, kabina to nesnese.";
  if (it.itemKey === "yellow_card" && it.conditionKey !== "dissent") return "I za faul, kterým hráč zastavil brejk. To kluci berou jako trest za práci pro tým.";
  if (cond && cond.harshness >= 2) return "Trestá i práci, rodinu a školu. Hráči s dětmi a na směny to ponesou těžce.";
  const czk = fineCzkEquivalent(it.valueKind, it.amountCzk);
  if (czk >= 500) return "Pro většinu kluků je to víc než týdenní odměna z klubu.";
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
  const used = new Set(items.map(offenceKey));
  const add = () => {
    const next = FINE_ITEMS.flatMap((d) => d.conditions.map((c) => ({ d, c }))).find(({ d, c }) => !used.has(`${d.key}|${c.key}`));
    if (!next) return;
    onChange([...items, { itemKey: next.d.key, conditionKey: next.c.key, valueKind: "czk", amountCzk: 50, repeatMode: "flat" }]);
  };

  return (
    <div>
      {items.length === 0 ? (
        <p className="px-4 py-5 text-base text-muted">Sazebník je prázdný. Přidej položku, nebo začni předvolbou Klasika okresu.</p>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((it, i) => {
            const def = fineItemDef(it.itemKey);
            const warn = itemWarning(it);
            return (
              <li key={i} className="px-4 py-3 space-y-2">
                <div className="flex items-end gap-2">
                  <label className="block flex-1 min-w-0">
                    <span className="text-sm text-muted">Za co</span>
                    <select className={SELECT} value={offenceKey(it)} onChange={(e) => {
                      const [itemKey, conditionKey] = e.target.value.split("|");
                      update(i, { itemKey: itemKey as FineItemKey, conditionKey });
                    }}>
                      {GROUP_ORDER.map((g) => (
                        <optgroup key={g} label={FINE_GROUP_LABELS[g]}>
                          {FINE_ITEMS.filter((d) => d.group === g).flatMap((d) => d.conditions.map((c) => {
                            const key = `${d.key}|${c.key}`;
                            return <option key={key} value={key} disabled={key !== offenceKey(it) && used.has(key)}>{offenceTitle({ itemKey: d.key, conditionKey: c.key })}</option>;
                          }))}
                        </optgroup>
                      ))}
                    </select>
                  </label>
                  <Button size="sm" variant="ghost" onClick={() => remove(i)} aria-label={`Odebrat ${offenceTitle(it)}`}>Odebrat</Button>
                </div>
                <div className="grid grid-cols-[7rem_1fr] gap-2">
                  <label className="block">
                    <span className="text-sm text-muted">Kolik</span>
                    <select className={SELECT} value={it.amountCzk ?? 50} onChange={(e) => update(i, { valueKind: "czk", amountCzk: Number(e.target.value) })}>
                      {FINE_CZK_AMOUNTS.map((a) => <option key={a} value={a}>{formatKc(a)}</option>)}
                    </select>
                  </label>
                  <label className="block min-w-0">
                    <span className="text-sm text-muted">Opakování</span>
                    <select className={SELECT} value={it.repeatMode} onChange={(e) => update(i, { repeatMode: e.target.value as FineRepeatMode })}>
                      {(Object.keys(FINE_REPEAT_LABELS) as FineRepeatMode[]).map((k) => <option key={k} value={k}>{FINE_REPEAT_LABELS[k]}</option>)}
                    </select>
                  </label>
                </div>
                {def && <p className="text-sm text-muted">{def.hint}</p>}
                {warn && <p className="text-sm text-warn">{warn}</p>}
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap gap-2 px-4 py-3 border-t border-line">
        <Button variant="secondary" onClick={add} disabled={items.length >= MAX_FINE_ITEMS}>Přidat položku</Button>
        <Button variant="secondary" onClick={() => onChange(CLASSIC_FINE_SCHEDULE.map((x) => ({ ...x })))}>Klasika okresu</Button>
      </div>
      {items.length >= MAX_FINE_ITEMS && <p className="px-4 pb-3 text-sm text-muted">Víc než {MAX_FINE_ITEMS} položek si kabina nezapamatuje.</p>}
    </div>
  );
}
