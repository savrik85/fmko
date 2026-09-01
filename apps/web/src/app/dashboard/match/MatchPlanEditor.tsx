"use client";

import {
  MAX_PLAN_RULES,
  PLAN_MINUTE_MIN,
  PLAN_MINUTE_MAX,
  PLAN_TACTICS,
  PLAN_HARDNESS,
  PLAN_TACTIC_LABELS,
  PLAN_HARDNESS_LABELS,
  type MatchPlanRule,
  type PlanTrigger,
  type PlanAction,
} from "@okresni-masina/shared";
import { CollapsibleCard } from "@/components/ui";

/**
 * Pokyny na lavičce — přednastavené scénáře, které engine za běhu zápasu
 * vyhodnotí sám.
 *
 * Podmínka je v UI schválně jeden select, ne dva: rozpad na „typ podmínky"
 * a „stav" by na mobilu zabral dva řádky a nic nepřidal. Rozdíl gólů a hranice
 * kondice se dopočítávají až podle zvolené podmínky.
 */

interface PlayerOption {
  id: string;
  name: string;
}

interface Props {
  plan: MatchPlanRule[];
  onChange: (plan: MatchPlanRule[]) => void;
  /** Základní jedenáctka — odtud se střídá ven. */
  starters: PlayerOption[];
  /** Zbytek kádru — odtud se střídá dovnitř. */
  bench: PlayerOption[];
}

/** Klíč do selectu podmínky. Skládá druh a stav do jedné hodnoty. */
type TriggerKey = "minute" | "score:losing" | "score:drawing" | "score:winning" | "men:down" | "men:up" | "condition";

const TRIGGER_OPTIONS: Array<{ key: TriggerKey; label: string }> = [
  { key: "minute", label: "Nastane minuta" },
  { key: "score:losing", label: "Prohráváme" },
  { key: "score:drawing", label: "Je remíza" },
  { key: "score:winning", label: "Vedeme" },
  { key: "men:down", label: "Hrajeme v oslabení" },
  { key: "men:up", label: "Máme přesilovku" },
  { key: "condition", label: "Dojdou síly" },
];

const ACTION_OPTIONS: Array<{ key: PlanAction["kind"]; label: string }> = [
  { key: "tactic", label: "Změnit taktiku" },
  { key: "hardness", label: "Změnit tvrdost hry" },
  { key: "sub", label: "Vystřídat hráče" },
];

function triggerKeyOf(t: PlanTrigger): TriggerKey {
  if (t.kind === "score") return `score:${t.state}` as TriggerKey;
  if (t.kind === "men") return `men:${t.state}` as TriggerKey;
  return t.kind;
}

function triggerFromKey(key: TriggerKey, previous: PlanTrigger): PlanTrigger {
  if (key === "minute") return { kind: "minute" };
  if (key === "condition") {
    return { kind: "condition", below: previous.kind === "condition" ? previous.below : 30 };
  }
  if (key.startsWith("men:")) {
    return { kind: "men", state: key === "men:up" ? "up" : "down" };
  }
  const state = key.split(":")[1] as "losing" | "drawing" | "winning";
  if (state === "drawing") return { kind: "score", state };
  const byAtLeast = previous.kind === "score" && previous.state !== "drawing" ? previous.byAtLeast ?? 1 : 1;
  return { kind: "score", state, byAtLeast };
}

function defaultAction(kind: PlanAction["kind"], starters: PlayerOption[], bench: PlayerOption[]): PlanAction | null {
  if (kind === "tactic") return { kind: "tactic", tactic: "offensive" };
  if (kind === "hardness") return { kind: "hardness", hardness: "hard" };
  if (starters.length === 0 || bench.length === 0) return null;
  return { kind: "sub", outPlayerId: starters[0].id, inPlayerId: bench[0].id };
}

/**
 * Nabídka hráčů do střídání. Když uložený hráč v nabídce chybí (mezitím se dostal
 * do základu, zranil se nebo se omluvil), přidá se jako výslovně nedostupná
 * položka. Bez toho by select ukázal prvního hráče ze seznamu, uložená hodnota by
 * zůstala jiná a uživatel by na obrazovce viděl někoho jiného, než co se uloží.
 */
function optionsWithCurrent(options: PlayerOption[], currentId: string): PlayerOption[] {
  if (options.some((p) => p.id === currentId)) return options;
  return [{ id: currentId, name: "— hráč není k dispozici —" }, ...options];
}

const selectClass =
  "w-full min-w-0 px-2.5 py-2 rounded-soft border-2 border-gray-200 bg-white text-sm font-heading text-ink";

export function MatchPlanEditor({ plan, onChange, starters, bench }: Props) {
  const canSub = starters.length > 0 && bench.length > 0;

  const update = (index: number, rule: MatchPlanRule) => {
    onChange(plan.map((r, i) => (i === index ? rule : r)));
  };

  const add = () => {
    if (plan.length >= MAX_PLAN_RULES) return;
    onChange([
      ...plan,
      {
        id: `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        fromMinute: 60,
        trigger: { kind: "score", state: "losing", byAtLeast: 1 },
        action: { kind: "tactic", tactic: "offensive" },
      },
    ]);
  };

  const summary = plan.length === 0
    ? "Zatím žádné — zápas odřídí asistent"
    : `${plan.length} ${plan.length === 1 ? "pokyn" : plan.length < 5 ? "pokyny" : "pokynů"}`;

  return (
    <CollapsibleCard title="Pokyny na lavičce" summary={summary} startCollapsed>
      <p className="text-sm text-muted mb-3">
        Co má tým udělat, když zápas nejde podle plánu. Trenér pokyn provede sám v okamžiku,
        kdy podmínka nastane — každý pokyn jen jednou za zápas.
      </p>

      <div className="flex flex-col gap-3">
        {plan.map((rule, i) => (
          <RuleRow
            key={rule.id}
            poradi={i + 1}
            rule={rule}
            starters={starters}
            bench={bench}
            canSub={canSub}
            onChange={(next) => update(i, next)}
            onRemove={() => onChange(plan.filter((_, j) => j !== i))}
          />
        ))}
      </div>

      {plan.length < MAX_PLAN_RULES ? (
        <button
          type="button"
          onClick={add}
          className="mt-2 w-full py-2 rounded-soft border-2 border-dashed border-gray-200 text-sm font-heading font-bold text-muted hover:text-pitch-600 hover:border-pitch-500/40 transition-colors"
        >
          + Přidat pokyn
        </button>
      ) : (
        <p className="mt-2 text-sm text-muted text-center">Víc než {MAX_PLAN_RULES} pokynů si trenér nezapamatuje.</p>
      )}
    </CollapsibleCard>
  );
}

function RuleRow({
  poradi, rule, starters, bench, canSub, onChange, onRemove,
}: {
  poradi: number;
  rule: MatchPlanRule;
  starters: PlayerOption[];
  bench: PlayerOption[];
  canSub: boolean;
  onChange: (rule: MatchPlanRule) => void;
  onRemove: () => void;
}) {
  const trigger = rule.trigger;
  const action = rule.action;
  const chybiHrac = action.kind === "sub"
    && (!starters.some((p) => p.id === action.outPlayerId) || !bench.some((p) => p.id === action.inPlayerId));

  return (
    // Rámeček a vlastní hlavička s pořadím: bez nich splývaly čtyři řádky selectů
    // v jednu plochu a nebylo poznat, kde jeden pokyn končí a další začíná.
    <div className="rounded-soft bg-gray-50 border border-gray-200 p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-micro font-heading uppercase tracking-wide text-muted-light">
          Pokyn {poradi}
        </span>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Smazat pokyn ${poradi}`}
          className="shrink-0 w-7 h-7 rounded-soft text-muted hover:text-card-red hover:bg-white transition-colors text-base leading-none"
        >
          ✕
        </button>
      </div>
      <div className="flex flex-col gap-2">
        {/* Podmínka */}
        <div className="flex flex-col sm:flex-row gap-2">
          <label className="flex-1 min-w-0">
            <span className="block text-micro text-muted font-heading uppercase tracking-wide mb-1">Když</span>
            <select
              className={selectClass}
              value={triggerKeyOf(trigger)}
              onChange={(e) => onChange({ ...rule, trigger: triggerFromKey(e.target.value as TriggerKey, trigger) })}
            >
              {TRIGGER_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
          </label>

          {trigger.kind === "score" && trigger.state !== "drawing" && (
            <label className="sm:w-32 shrink-0">
              <span className="block text-micro text-muted font-heading uppercase tracking-wide mb-1">Rozdíl</span>
              <select
                className={selectClass}
                value={trigger.byAtLeast ?? 1}
                onChange={(e) => onChange({ ...rule, trigger: { ...trigger, byAtLeast: Number(e.target.value) } })}
              >
                <option value={1}>o gól a víc</option>
                <option value={2}>o dva a víc</option>
                <option value={3}>o tři a víc</option>
              </select>
            </label>
          )}

          {trigger.kind === "condition" && (
            <label className="sm:w-32 shrink-0">
              <span className="block text-micro text-muted font-heading uppercase tracking-wide mb-1">Kondice pod</span>
              <select
                className={selectClass}
                value={trigger.below}
                onChange={(e) => onChange({ ...rule, trigger: { kind: "condition", below: Number(e.target.value) } })}
              >
                {/* Uložená hodnota mimo nabídku (nastavená přes API) by se jinak
                    zobrazila jako první položka a při uložení se tiše změnila. */}
                {[...new Set([20, 30, 40, 50, 60, trigger.below])].sort((a, b) => a - b).map((v) => (
                  <option key={v} value={v}>{v} %</option>
                ))}
              </select>
            </label>
          )}

          <label className="sm:w-28 shrink-0">
            <span className="block text-micro text-muted font-heading uppercase tracking-wide mb-1">Od minuty</span>
            {/* Číselné pole, ne výběr: select nabízející jen kulaté minuty by uloženou
                padesátou tiše zobrazil jako první položku a při dalším uložení ji přepsal. */}
            <input
              type="number"
              inputMode="numeric"
              min={PLAN_MINUTE_MIN}
              max={PLAN_MINUTE_MAX}
              className={selectClass}
              value={rule.fromMinute}
              onChange={(e) => {
                const raw = Number(e.target.value);
                if (!Number.isFinite(raw)) return;
                const minute = Math.min(PLAN_MINUTE_MAX, Math.max(PLAN_MINUTE_MIN, Math.round(raw)));
                onChange({ ...rule, fromMinute: minute });
              }}
            />
          </label>
        </div>

        {/* Akce */}
        <div className="flex flex-col sm:flex-row gap-2">
          <label className="flex-1 min-w-0">
            <span className="block text-micro text-muted font-heading uppercase tracking-wide mb-1">Pak</span>
            <select
              className={selectClass}
              value={action.kind}
              onChange={(e) => {
                const next = defaultAction(e.target.value as PlanAction["kind"], starters, bench);
                if (next) onChange({ ...rule, action: next });
              }}
            >
              {ACTION_OPTIONS.map((o) => (
                <option key={o.key} value={o.key} disabled={o.key === "sub" && !canSub}>{o.label}</option>
              ))}
            </select>
          </label>

          {action.kind === "tactic" && (
            <label className="flex-1 min-w-0">
              <span className="block text-micro text-muted font-heading uppercase tracking-wide mb-1">Na</span>
              <select
                className={selectClass}
                value={action.tactic}
                onChange={(e) => onChange({ ...rule, action: { kind: "tactic", tactic: e.target.value as typeof PLAN_TACTICS[number] } })}
              >
                {PLAN_TACTICS.map((t) => (
                  <option key={t} value={t}>{PLAN_TACTIC_LABELS[t]}</option>
                ))}
              </select>
            </label>
          )}

          {action.kind === "hardness" && (
            <label className="flex-1 min-w-0">
              <span className="block text-micro text-muted font-heading uppercase tracking-wide mb-1">Na</span>
              <select
                className={selectClass}
                value={action.hardness}
                onChange={(e) => onChange({ ...rule, action: { kind: "hardness", hardness: e.target.value as typeof PLAN_HARDNESS[number] } })}
              >
                {PLAN_HARDNESS.map((h) => (
                  <option key={h} value={h}>{PLAN_HARDNESS_LABELS[h]}</option>
                ))}
              </select>
            </label>
          )}

          {action.kind === "sub" && (
            <>
              <label className="flex-1 min-w-0">
                <span className="block text-micro text-muted font-heading uppercase tracking-wide mb-1">Stáhnout</span>
                <select
                  className={selectClass}
                  value={action.outPlayerId}
                  onChange={(e) => onChange({ ...rule, action: { ...action, outPlayerId: e.target.value } })}
                >
                  {optionsWithCurrent(starters, action.outPlayerId).map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </label>
              <label className="flex-1 min-w-0">
                <span className="block text-micro text-muted font-heading uppercase tracking-wide mb-1">Poslat na hřiště</span>
                <select
                  className={selectClass}
                  value={action.inPlayerId}
                  onChange={(e) => onChange({ ...rule, action: { ...action, inPlayerId: e.target.value } })}
                >
                  {optionsWithCurrent(bench, action.inPlayerId).map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </label>
            </>
          )}
        </div>
      </div>

      {chybiHrac && (
        <p className="text-sm text-card-red mt-2">
          Hráč z tohohle pokynu už není v sestavě — vyber jiného, jinak se pokyn v zápase neprovede.
        </p>
      )}
    </div>
  );
}
