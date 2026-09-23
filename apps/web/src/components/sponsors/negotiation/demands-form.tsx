"use client";

import { formatCZK } from "@/lib/sponsor-owners";
import { seasonsAccusative } from "@/lib/sponsor-format";
import {
  bonusAwareOneTime, contractMonthsOf, findOption, minMonthlyFor, PROMISE_LABELS, type Demands, type NegotiationView, type Proposal,
} from "@/lib/sponsor-negotiation";

function MoneyInput({ label, hint, value, onChange }: { label: string; hint?: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="block text-sm font-heading font-bold">{label}</span>
      {hint && <span className="block text-sm text-muted">{hint}</span>}
      <input
        type="number" inputMode="numeric" min={0} step={100} value={value}
        onChange={(e) => onChange(Math.max(0, Math.round(Number(e.target.value) || 0)))}
        className="input w-full min-h-11 text-base mt-1 tabular-nums"
      />
    </label>
  );
}

export function DemandsForm({ view, proposal, onChange }: {
  view: NegotiationView; proposal: Proposal; onChange: (next: Proposal) => void;
}) {
  const d = proposal.demands;
  const set = (patch: Partial<Demands>) => onChange({ ...proposal, demands: { ...d, ...patch } });
  const switching = view.current && !view.current.sameSponsor && view.current.terminationFee > 0;
  // Pravidlo o měsíční polovině (server: meetsMonthlyShare) počítá se všemi jednorázovými
  // položkami a bonusy za splnění (bonusAwareOneTime): ukázat hned u darů, ať je jasné,
  // proč server návrh odmítne, když je měsíční podpora moc nízká.
  const months = contractMonthsOf(view, proposal.seasons);
  const oneTime = bonusAwareOneTime(view, proposal);
  const minMonthly = minMonthlyFor(oneTime, months);

  return (
    <div className="space-y-4">
      <MoneyInput label="Měsíčně" value={d.monthly} onChange={(v) => set({ monthly: v })} />
      {view.category === "main" && (
        <MoneyInput label="Za každou výhru" value={d.winBonus} onChange={(v) => set({ winBonus: v })} />
      )}
      <MoneyInput label="Za podpis" hint="Jednorázově hned při podpisu." value={d.signingBonus} onChange={(v) => set({ signingBonus: v })} />

      {proposal.promises.map((p) => {
        // Bonus za splnění jde nabídnout jen u slibů, které to katalog dovolí (server: GOAL_BONUS_KINDS).
        const opt = findOption(view, p);
        if (!opt?.goalBonus) return null;
        return (
          <MoneyInput
            key={p.kind} label={`Bonus za splnění: ${PROMISE_LABELS[p.kind]}`}
            hint="Vyplatí se za každý splněný slib."
            value={d.goalBonuses[p.kind] ?? 0}
            onChange={(v) => set({ goalBonuses: { ...d.goalBonuses, [p.kind]: v } })}
          />
        );
      })}

      {view.construction.length > 0 && (
        <label className="block">
          <span className="block text-sm font-heading font-bold">Stavba, kterou sponzor zaplatí</span>
          <select
            value={d.construction ?? ""} onChange={(e) => set({ construction: e.target.value || null })}
            className="input w-full min-h-11 text-base mt-1"
          >
            <option value="">Nic</option>
            {view.construction.map((o) => (
              <option key={o.key} value={o.key}>{o.label} na úroveň {o.level} ({formatCZK(o.cost)})</option>
            ))}
          </select>
        </label>
      )}

      {view.equipment.length > 0 && (
        <label className="block">
          <span className="block text-sm font-heading font-bold">Vybavení od sponzora</span>
          <select
            value={d.equipment ?? ""} onChange={(e) => set({ equipment: e.target.value || null })}
            className="input w-full min-h-11 text-base mt-1"
          >
            <option value="">Nic</option>
            {view.equipment.map((o) => (
              <option key={o.key} value={o.key}>{o.label} na úroveň {o.level} ({formatCZK(o.cost)})</option>
            ))}
          </select>
        </label>
      )}

      {switching && view.current && (
        <label className="flex items-start gap-3 min-h-11">
          <input
            type="checkbox" checked={d.payCurrentFee} onChange={(e) => set({ payCurrentFee: e.target.checked })}
            className="mt-1 h-5 w-5 shrink-0"
          />
          <span className="text-sm">
            Ať sponzor zaplatí výpovědní pokutu u {view.current.sponsorName} ({formatCZK(view.current.terminationFee)}).
          </span>
        </label>
      )}

      {oneTime > 0 && (
        <p className="text-sm text-muted">
          Podpis, dary a bonusy za splnění jsou jednorázové. Aby platilo pravidlo o měsíční podpoře, musí být měsíčně aspoň {formatCZK(minMonthly)}.
        </p>
      )}

      <div>
        <div className="text-sm font-heading font-bold mb-1">Délka smlouvy</div>
        <div className="flex gap-1.5" role="group" aria-label="Délka smlouvy">
          {[1, 2, 3].map((n) => (
            <button
              key={n} type="button" aria-pressed={proposal.seasons === n}
              onClick={() => onChange({ ...proposal, seasons: n })}
              className={`flex-1 min-h-11 rounded-control text-sm font-heading font-bold ${proposal.seasons === n ? "bg-pitch-500 text-white" : "bg-surface-2 text-muted"}`}
            >
              {seasonsAccusative(n)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
