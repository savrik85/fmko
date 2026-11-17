"use client";


import { seasonsAccusative, weeklyAmount } from "@/lib/sponsor-format";
import {
  allowedSeasonsOf, findOption, PROMISE_LABELS, proposalOneTimeTotal, type Demands, type NegotiationView, type Proposal,
} from "@/lib/sponsor-negotiation";
import { formatKc } from "@/lib/format";
import { ChoiceGroup } from "@/components/ui";

function MoneyInput({ label, hint, value, onChange }: { label: string; hint?: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="block text-sm font-heading font-bold">{label}</span>
      {hint && <span className="block text-sm text-muted">{hint}</span>}
      <input
        type="number" inputMode="numeric" min={0} step={100} value={value}
        onChange={(e) => onChange(Math.max(0, Math.round(Number(e.target.value) || 0)))}
        className="input !w-full min-h-11 text-base mt-1 tabular-nums"
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
  const oneTime = proposalOneTimeTotal(view, proposal);
  const allowedSeasons = allowedSeasonsOf(view);

  return (
    <div className="space-y-4">
      <MoneyInput
        label="Měsíčně"
        hint={`Na účet přijde ${formatKc(weeklyAmount(d.monthly))} každé pondělí.`}
        value={d.monthly}
        onChange={(v) => set({ monthly: v })}
      />
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
            className="select w-full min-h-11 !text-base mt-1"
          >
            <option value="">Nic</option>
            {view.construction.map((o) => (
              <option key={o.key} value={o.key}>{o.label} na úroveň {o.level} ({formatKc(o.cost)})</option>
            ))}
          </select>
        </label>
      )}

      {view.equipment.length > 0 && (
        <label className="block">
          <span className="block text-sm font-heading font-bold">Vybavení od sponzora</span>
          <select
            value={d.equipment ?? ""} onChange={(e) => set({ equipment: e.target.value || null })}
            className="select w-full min-h-11 !text-base mt-1"
          >
            <option value="">Nic</option>
            {view.equipment.map((o) => (
              <option key={o.key} value={o.key}>{o.label} na úroveň {o.level} ({formatKc(o.cost)})</option>
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
            Ať sponzor zaplatí výpovědní pokutu u {view.current.sponsorName} ({formatKc(view.current.terminationFee)}).
          </span>
        </label>
      )}

      {oneTime > 0 && (
        <p className="text-sm text-muted">
          Jednorázové peníze jsou záloha, při předčasném konci smlouvy se nesplacená část vrací.
        </p>
      )}

      <div>
        <div className="text-sm font-heading font-bold mb-1">Délka smlouvy</div>
        <ChoiceGroup ariaLabel="Délka smlouvy" columns={allowedSeasons.length <= 2 ? 2 : allowedSeasons.length === 3 ? 3 : 4}
          value={String(proposal.seasons)} onChange={(v) => onChange({ ...proposal, seasons: Number(v) })}
          options={allowedSeasons.map((n) => ({ value: String(n), label: seasonsAccusative(n) }))} />
        {!allowedSeasons.includes(1) && (
          <p className="text-sm text-muted mt-1">Do konce sezóny zbývá méně než měsíc, smlouvu jde podepsat nejméně na 2 sezóny.</p>
        )}
      </div>
    </div>
  );
}
