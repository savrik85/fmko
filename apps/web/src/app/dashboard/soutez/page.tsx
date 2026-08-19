"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTeam } from "@/context/team-context";
import { apiAction, apiFetch } from "@/lib/api";
import { EntityLink, Modal, SectionLabel, Spinner, Tabs, useTabParam } from "@/components/ui";

// ── Typy odpovědí API ──
interface Rules {
  win_bonus: number; draw_bonus: number; place_top: number; place_decay: number;
  place_floor: number; entry_fee: number; referee_fee: number; fine_mult: number;
  interleague_fee_pct: number; ban_own_owner_transfers: number;
  levy_concession_pct: number; levy_gate_pct: number;
  levy_transfer_pct: number; levy_cup_pct: number;
}

interface ProposalKind {
  kind: string; label: string; gesce: string; majority: number;
  min: number | null; max: number | null; nextSeason: boolean; current: number | null;
}

interface Official {
  role: string; roleLabel: string; teamId: string; teamName: string; status: string;
}

interface State {
  league: { id: string; name: string; district: string; level: string; seasonNumber: number; sponsoredName: string | null };
  enabled: boolean;
  threshold: number;
  humanClubs: number;
  totalClubs: number;
  balance: number;
  subsidy: number;
  rules: Rules;
  projection: { cost: { placement: number; bonus: number; referees: number; total: number }; income: number; projected: number; ok: boolean };
  voters: number;
  activeVoters: number;
  quorumNeeded: number;
  officials: Official[];
  proposalKinds: ProposalKind[];
  deposit: number;
}

interface Proposal {
  id: string; kind: string; title: string; body: string; gesce: string;
  status: string; majority: number;
  payload: { value?: number; from?: number; budgetNote?: string | null };
  proposedByTeamId: string; proposerName: string | null;
  openedGameDate: string; closedGameDate: string | null;
  effectiveFromSeason: number | null;
  resultNote: string | null;
  myAnswer: string | null;
  castCount: number;
  tally: { pro: number; proti: number; zdrzel: number } | null;
  voters: Array<{ teamId: string; teamName: string; answer: string }> | null;
}

interface LedgerEntry {
  id: string; type: string; amount: number; balance_after: number | null;
  description: string; team_id: string | null; team_name: string | null; game_date: string;
}

interface Meeting {
  id: string; gameDate: string; seasonNumber: number; closed: number; passed: number;
  balanceAfter: number | null;
  attendance: { voters?: number; active?: number; quorum?: number };
  items: Array<{ title: string; status: string; pro: number; proti: number; zdrzel: number }>;
}

interface Impact {
  expectedPos: number; expectedWins: number; expectedDraws: number; played: number;
  delta: { matchBonus: number; placeReward: number; entryFee: number; net: number };
}

const TAB_KEYS = ["schuze", "pokladna", "vedeni", "zapisy"] as const;

const LEDGER_LABEL: Record<string, string> = {
  subsidy: "Svazová dotace", entry_fee: "Startovné", sponsor: "Sponzor",
  match_bonus: "Prémie za zápasy", referee_fee: "Odměny rozhodčím",
  place_reward: "Odměny za umístění", fine_referee: "Pokuty za výroky o rozhodčím",
  fine_admin: "Administrativní pokuty", sanction: "Pokuty disciplinárky",
  interleague_fee: "Meziligové poplatky", levy_transfer: "Odvod z přestupů",
  levy_concession: "Odvod z občerstvení", levy_gate: "Odvod ze vstupného",
  levy_cup: "Odvod z poháru", grant: "Dotace klubům", deposit: "Kauce", other: "Ostatní",
};

const ANSWER_LABEL: Record<string, string> = { pro: "Pro", proti: "Proti", zdrzel: "Zdržel se" };

function czk(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `${Math.round(n).toLocaleString("cs")} Kč`;
}

function signed(n: number): string {
  if (n === 0) return "0 Kč";
  return `${n > 0 ? "+" : "−"}${Math.abs(Math.round(n)).toLocaleString("cs")} Kč`;
}

function fmtValue(kind: string, v: number): string {
  if (kind === "place_decay") return v.toFixed(2);
  if (kind === "fine_mult") return `${v.toFixed(1)}×`;
  if (kind.endsWith("_pct")) return `${v} %`;
  if (kind === "ban_own_owner_transfers") return v ? "zavést" : "zrušit";
  return czk(v);
}

export default function SoutezPage() {
  const { teamId } = useTeam();
  const [tab, setTab] = useTabParam(TAB_KEYS);
  const [state, setState] = useState<State | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [ledger, setLedger] = useState<{ entries: LedgerEntry[]; summary: Array<{ type: string; total: number }> } | null>(null);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);

  const leagueId = state?.league.id ?? null;

  const loadState = useCallback(() => {
    if (!teamId) return;
    apiFetch<State>(`/api/teams/${teamId}/competition`)
      .then((d) => { setState(d); setLoading(false); })
      .catch((e) => { console.error("načtení soutěže:", e); setLoading(false); });
  }, [teamId]);

  const loadProposals = useCallback(() => {
    if (!leagueId) return;
    apiFetch<{ proposals: Proposal[] }>(`/api/competition/${leagueId}/proposals`)
      .then((d) => setProposals(d.proposals ?? []))
      .catch((e) => console.error("načtení návrhů:", e));
  }, [leagueId]);

  useEffect(loadState, [loadState]);
  useEffect(loadProposals, [loadProposals]);

  useEffect(() => {
    if (!leagueId) return;
    if (tab === "pokladna" && !ledger) {
      apiFetch<{ entries: LedgerEntry[]; summary: Array<{ type: string; total: number }> }>(`/api/competition/${leagueId}/ledger`)
        .then(setLedger).catch((e) => console.error("načtení pokladny:", e));
    }
    if (tab === "zapisy" && meetings.length === 0) {
      apiFetch<{ meetings: Meeting[] }>(`/api/competition/${leagueId}/meetings`)
        .then((d) => setMeetings(d.meetings ?? [])).catch((e) => console.error("načtení zápisů:", e));
    }
  }, [tab, leagueId, ledger, meetings.length]);

  const open = useMemo(() => proposals.filter((p) => p.status === "open"), [proposals]);
  const closed = useMemo(() => proposals.filter((p) => p.status !== "open"), [proposals]);

  const vote = async (proposalId: string, answer: string) => {
    if (!teamId) return;
    const ok = await apiAction(
      apiFetch(`/api/teams/${teamId}/competition/proposals/${proposalId}/ballot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer }),
      }),
      "Hlasování se nezdařilo",
    );
    if (ok) loadProposals();
  };

  const withdraw = async (proposalId: string) => {
    if (!teamId) return;
    const ok = await apiAction(
      apiFetch(`/api/teams/${teamId}/competition/proposals/${proposalId}`, { method: "DELETE" }),
      "Stažení návrhu se nezdařilo",
    );
    if (ok) loadProposals();
  };

  if (loading) {
    return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>;
  }
  if (!state) {
    return <div className="page-container"><div className="card p-4 text-base">Soutěž se nepodařilo načíst.</div></div>;
  }

  const displayName = state.league.sponsoredName ?? state.league.name;

  return (
    <div className="page-container space-y-4 pb-8">
      <div className="card p-4">
        <div className="text-xl font-heading">{displayName}</div>
        <div className="text-sm text-muted mt-0.5">
          okres {state.league.district} · {state.league.seasonNumber}. sezóna · {state.humanClubs} z {state.totalClubs} klubů má trenéra
        </div>
        {state.enabled ? (
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span>Pokladna <strong className="tabular-nums">{czk(state.balance)}</strong></span>
            <span>Hlasovacích klubů <strong className="tabular-nums">{state.voters}</strong></span>
            <span>Kvórum <strong className="tabular-nums">{state.quorumNeeded}</strong> hlasů</span>
          </div>
        ) : (
          <div className="mt-3 text-sm">
            <div className="font-semibold">Soutěž je ve správě svazu.</div>
            <p className="mt-1 text-muted">
              Hlasovací právo dostane soutěž, až v ní bude aspoň {state.threshold} klubů s trenérem.
              Teď je jich {state.humanClubs}. Pokladnu a sazebník si můžeš prohlédnout i tak.
            </p>
            <a href="/dashboard/invite" className="entity-link mt-2 inline-block">Pozvi kamaráda do soutěže →</a>
          </div>
        )}
      </div>

      <Tabs
        items={[
          { key: "schuze", label: "Schůze", count: open.length || null },
          { key: "pokladna", label: "Pokladna" },
          { key: "vedeni", label: "Vedení" },
          { key: "zapisy", label: "Zápisy" },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "schuze" && (
        <div className="space-y-4">
          <div className="card p-4 text-sm">
            <div className="font-semibold text-base">Schůze se koná každou středu.</div>
            <p className="mt-1 text-muted">
              Návrhy i hlasy můžeš podávat kdykoli až do jejího zahájení. Během schůze vidíš jen kolik
              klubů už hlasovalo — kdo jak hlasoval se odkryje až v zápisu. Změny odměn a sazeb platí
              vždy až od příští sezóny, nikdy na rozehranou.
            </p>
          </div>

          {open.length === 0 && (
            <div className="card p-4 text-base text-muted">
              Na programu nejsou žádné body. Schůze bez návrhu se nekoná.
            </div>
          )}

          {open.map((p) => (
            <ProposalCard
              key={p.id} p={p} myTeamId={teamId} onVote={vote} onWithdraw={withdraw}
              canVote={state.enabled}
            />
          ))}

          {state.enabled && (
            <button className="btn btn-primary w-full" onClick={() => setFormOpen(true)}>
              Podat návrh
            </button>
          )}
          {state.enabled && (
            <p className="text-sm text-muted">
              Za podání se skládá kauce {czk(state.deposit)}. Vrátí se, když návrh projde.
            </p>
          )}

          {closed.length > 0 && (
            <>
              <SectionLabel>Projednané body</SectionLabel>
              {closed.map((p) => (
                <ProposalCard key={p.id} p={p} myTeamId={teamId} onVote={vote} onWithdraw={withdraw} canVote={false} />
              ))}
            </>
          )}
        </div>
      )}

      {tab === "pokladna" && <PokladnaTab state={state} ledger={ledger} />}

      {tab === "vedeni" && <VedeniTab state={state} />}

      {tab === "zapisy" && <ZapisyTab meetings={meetings} />}

      {formOpen && teamId && (
        <ProposalForm
          teamId={teamId}
          state={state}
          onClose={() => setFormOpen(false)}
          onSaved={() => { setFormOpen(false); loadProposals(); loadState(); }}
        />
      )}
    </div>
  );
}

// ── Karta návrhu ──
function ProposalCard({ p, myTeamId, onVote, onWithdraw, canVote }: {
  p: Proposal; myTeamId: string | null;
  onVote: (id: string, answer: string) => void;
  onWithdraw: (id: string) => void;
  canVote: boolean;
}) {
  const mine = p.proposedByTeamId === myTeamId;
  const statusLabel: Record<string, string> = {
    passed: "Přijato", rejected: "Zamítnuto", no_quorum: "Neusnášeníschopné",
    withdrawn: "Staženo", gatekept: "Nezařazeno na program",
  };
  const statusColor: Record<string, string> = {
    passed: "#3B7A3B", rejected: "#D94032", no_quorum: "#B5AFA5",
    withdrawn: "#B5AFA5", gatekept: "#B5AFA5",
  };

  return (
    <div className="card p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="text-base font-semibold">{p.title}</div>
        {p.status !== "open" && (
          <span className="text-sm font-semibold shrink-0" style={{ color: statusColor[p.status] ?? "#5B5348" }}>
            {statusLabel[p.status] ?? p.status}
          </span>
        )}
      </div>

      <div className="text-sm text-muted">
        Navrhuje{" "}
        {p.proposerName
          ? <EntityLink type="team" id={p.proposedByTeamId}>{p.proposerName}</EntityLink>
          : "neznámý klub"}
        {p.majority > 0.5 && " · vyžaduje dvoutřetinovou většinu"}
        {p.effectiveFromSeason && ` · platí od ${p.effectiveFromSeason}. sezóny`}
      </div>

      {p.body && <p className="text-sm">{p.body}</p>}
      {p.payload?.budgetNote && <p className="text-sm text-muted">{p.payload.budgetNote}</p>}

      {p.status === "open" ? (
        <>
          <div className="text-sm text-muted">Hlasovalo {p.castCount} klubů.</div>
          {canVote && (
            <div className="flex gap-2 pt-1">
              {(["pro", "proti", "zdrzel"] as const).map((a) => (
                <button
                  key={a}
                  onClick={() => onVote(p.id, a)}
                  className={`btn flex-1 ${p.myAnswer === a ? "btn-primary" : "btn-secondary"}`}
                >
                  {ANSWER_LABEL[a]}
                </button>
              ))}
            </div>
          )}
          {p.myAnswer && <div className="text-sm text-muted">Tvůj hlas: {ANSWER_LABEL[p.myAnswer]} (můžeš ho ještě změnit)</div>}
          {mine && (
            <button className="btn btn-ghost w-full mt-1" onClick={() => onWithdraw(p.id)}>
              Stáhnout návrh
            </button>
          )}
        </>
      ) : (
        <>
          {p.resultNote && <div className="text-sm">{p.resultNote}</div>}
          {p.voters && p.voters.length > 0 && (
            <div className="text-sm space-y-0.5 pt-1">
              {(["pro", "proti", "zdrzel"] as const).map((a) => {
                const list = p.voters!.filter((v) => v.answer === a);
                if (list.length === 0) return null;
                return (
                  <div key={a}>
                    <span className="text-muted">{ANSWER_LABEL[a]}: </span>
                    {list.map((v, i) => (
                      <span key={v.teamId}>
                        {i > 0 && ", "}
                        <EntityLink type="team" id={v.teamId}>{v.teamName}</EntityLink>
                      </span>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Pokladna ──
function PokladnaTab({ state, ledger }: { state: State; ledger: { entries: LedgerEntry[]; summary: Array<{ type: string; total: number }> } | null }) {
  const p = state.projection;
  return (
    <div className="space-y-4">
      <div className="card p-4">
        <SectionLabel>Zůstatek</SectionLabel>
        <div className="text-2xl font-heading tabular-nums mt-1">{czk(state.balance)}</div>
      </div>

      <div className="card p-4 space-y-2">
        <SectionLabel>Projekce na příští sezónu</SectionLabel>
        <Row label="Svazová dotace" value={signed(state.subsidy)} />
        <Row label={`Startovné ${state.totalClubs} × ${czk(state.rules.entry_fee)}`} value={signed(state.totalClubs * state.rules.entry_fee)} />
        <Row label="Odměny za umístění" value={signed(-p.cost.placement)} />
        <Row label="Prémie za zápasy" value={signed(-p.cost.bonus)} />
        <Row label="Odměny rozhodčím" value={signed(-p.cost.referees)} />
        <div className="border-t border-gray-200 pt-2">
          <Row label="Bilance" value={signed(p.income - p.cost.total)} strong />
        </div>
        <p className="text-sm text-muted">
          Pokuty se do projekce nepočítají — na příjem z vlastní hlouposti se plánovat nedá.
        </p>
      </div>

      <div className="card p-4 space-y-2">
        <SectionLabel>Platný sazebník</SectionLabel>
        <Row label="Odměna za výhru" value={czk(state.rules.win_bonus)} />
        <Row label="Odměna za remízu" value={czk(state.rules.draw_bonus)} />
        <Row label="Odměna za 1. místo" value={czk(state.rules.place_top)} />
        <Row label="Klíč rozdělení odměn" value={state.rules.place_decay.toFixed(2)} />
        <Row label="Startovné" value={czk(state.rules.entry_fee)} />
        <Row label="Odměna rozhodčímu za zápas" value={czk(state.rules.referee_fee)} />
        <Row label="Sazebník pokut" value={`${state.rules.fine_mult.toFixed(1)}×`} />
        <Row label="Meziligový poplatek" value={`${state.rules.interleague_fee_pct} %`} />
        <Row label="Odvod z občerstvení" value={`${state.rules.levy_concession_pct} %`} />
        <Row label="Odvod ze vstupného" value={`${state.rules.levy_gate_pct} %`} />
        <Row label="Odvod z přestupů v soutěži" value={`${state.rules.levy_transfer_pct} %`} />
        <Row label="Odvod z pohárových odměn" value={`${state.rules.levy_cup_pct} %`} />
      </div>

      {ledger && ledger.summary.length > 0 && (
        <div className="card p-4 space-y-2">
          <SectionLabel>Sezóna podle položek</SectionLabel>
          {ledger.summary.map((s) => (
            <Row key={s.type} label={LEDGER_LABEL[s.type] ?? s.type} value={signed(s.total)} />
          ))}
        </div>
      )}

      {ledger && (
        <div className="card overflow-x-auto table-scroll">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-gray-200 text-muted">
                <th className="py-2.5 px-3 text-xs font-heading uppercase text-left">Položka</th>
                <th className="py-2.5 px-3 text-xs font-heading uppercase text-right">Částka</th>
              </tr>
            </thead>
            <tbody>
              {ledger.entries.length === 0 && (
                <tr><td colSpan={2} className="py-4 px-3 text-muted">Zatím žádné pohyby.</td></tr>
              )}
              {ledger.entries.map((e, i) => (
                <tr key={e.id} className={`border-b border-gray-50 ${i % 2 === 1 ? "bg-gray-50/30" : ""}`}>
                  <td className="py-2 px-3">
                    <div>{e.description}</div>
                    <div className="text-xs text-muted">
                      {LEDGER_LABEL[e.type] ?? e.type}
                      {e.team_name && e.team_id && <> · <EntityLink type="team" id={e.team_id}>{e.team_name}</EntityLink></>}
                    </div>
                  </td>
                  <td className={`py-2 px-3 text-right tabular-nums ${e.amount < 0 ? "text-danger" : ""}`}>
                    {signed(e.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className={strong ? "font-semibold" : "text-muted"}>{label}</span>
      <span className={`tabular-nums ${strong ? "font-semibold" : ""}`}>{value}</span>
    </div>
  );
}

// ── Vedení ──
function VedeniTab({ state }: { state: State }) {
  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-2">
        <SectionLabel>Vedení soutěže</SectionLabel>
        {state.officials.length === 0 ? (
          <p className="text-sm text-muted">
            Zatím se nevolilo. Funkce se obsazují při přechodu na novou sezónu; do té doby o všem
            rozhodují kluby hlasováním.
          </p>
        ) : (
          state.officials.map((o) => (
            <div key={o.role} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-muted">{o.roleLabel}</span>
              <span>
                <EntityLink type="team" id={o.teamId}>{o.teamName}</EntityLink>
                {o.status === "suspended" && <span className="text-danger"> · pozastaven</span>}
              </span>
            </div>
          ))
        )}
      </div>

      <div className="card p-4 space-y-2">
        <SectionLabel>Hlasování</SectionLabel>
        <Row label="Klubů s hlasovacím právem" value={String(state.voters)} />
        <Row label="Z toho aktivních" value={String(state.activeVoters)} />
        <Row label="Kvórum" value={`${state.quorumNeeded} hlasů`} />
        <p className="text-sm text-muted pt-1">
          Aktivní je klub, který hlasoval aspoň na jedné ze tří posledních schůzí. Kdo nehlasuje,
          kvórum neblokuje — ale jakmile se vrátí, hlas má hned.
        </p>
      </div>
    </div>
  );
}

// ── Zápisy ──
function ZapisyTab({ meetings }: { meetings: Meeting[] }) {
  if (meetings.length === 0) {
    return <div className="card p-4 text-base text-muted">Zatím se žádná schůze nekonala.</div>;
  }
  return (
    <div className="space-y-4">
      {meetings.map((m) => (
        <div key={m.id} className="card p-4 space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-base font-semibold">Schůze {formatDate(m.gameDate)}</div>
            <div className="text-sm text-muted tabular-nums">{czk(m.balanceAfter)}</div>
          </div>
          <div className="text-sm text-muted">
            Projednáno {m.closed}, přijato {m.passed}
            {m.attendance?.quorum ? ` · kvórum ${m.attendance.quorum} z ${m.attendance.active ?? "?"} aktivních` : ""}
          </div>
          {m.items?.map((it, i) => (
            <div key={i} className="text-sm border-t border-gray-50 pt-2">
              <div>{it.title}</div>
              <div className="text-muted">
                {it.status === "passed" ? "Přijato" : it.status === "rejected" ? "Zamítnuto" : "Neusnášeníschopné"}
                {" "}{it.pro}:{it.proti}{it.zdrzel ? ` (${it.zdrzel} se zdrželo)` : ""}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function formatDate(v: string): string {
  const d = new Date(v.endsWith("Z") ? v : `${v}Z`);
  if (isNaN(d.getTime())) return v.slice(0, 10);
  return d.toLocaleDateString("cs", { day: "numeric", month: "numeric", year: "numeric" });
}

// ── Formulář návrhu ──
function ProposalForm({ teamId, state, onClose, onSaved }: {
  teamId: string; state: State; onClose: () => void; onSaved: () => void;
}) {
  const [kind, setKind] = useState(state.proposalKinds[0]?.kind ?? "");
  const spec = state.proposalKinds.find((k) => k.kind === kind);
  const [value, setValue] = useState<string>(String(spec?.current ?? 0));
  const [body, setBody] = useState("");
  const [impact, setImpact] = useState<Impact | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const s = state.proposalKinds.find((k) => k.kind === kind);
    setValue(String(s?.current ?? 0));
    setImpact(null);
  }, [kind, state.proposalKinds]);

  useEffect(() => {
    const v = Number(value);
    if (!kind || !Number.isFinite(v)) { setImpact(null); return; }
    const t = setTimeout(() => {
      apiFetch<Impact>(`/api/teams/${teamId}/competition/impact?kind=${kind}&value=${v}`)
        .then(setImpact)
        .catch((e) => { console.warn("kalkulačka dopadu:", e); setImpact(null); });
    }, 350);
    return () => clearTimeout(t);
  }, [kind, value, teamId]);

  const submit = async () => {
    setSaving(true);
    const ok = await apiAction(
      apiFetch(`/api/teams/${teamId}/competition/proposals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, value: Number(value), body }),
      }),
      "Návrh se nepodařilo podat",
    );
    setSaving(false);
    if (ok) onSaved();
  };

  return (
    <Modal isOpen onClose={onClose} title="Nový návrh">
      <div className="space-y-4">
        <div>
          <label className="text-sm text-muted">Čeho se návrh týká</label>
          <select className="select w-full mt-1" value={kind} onChange={(e) => setKind(e.target.value)}>
            {state.proposalKinds.map((k) => (
              <option key={k.kind} value={k.kind}>{k.label}</option>
            ))}
          </select>
        </div>

        {spec && (
          <div>
            <label className="text-sm text-muted">
              Nová hodnota
              {spec.min !== null && spec.max !== null && ` (${fmtValue(kind, spec.min)} – ${fmtValue(kind, spec.max)})`}
            </label>
            <input
              className="input w-full mt-1 tabular-nums"
              type="number"
              step={kind === "place_decay" ? "0.01" : kind === "fine_mult" ? "0.1" : "1"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <div className="text-sm text-muted mt-1">
              Teď platí {fmtValue(kind, spec.current ?? 0)}
              {spec.nextSeason && " · změna se projeví až od příští sezóny"}
              {spec.majority > 0.5 && " · potřeba dvoutřetinová většina"}
            </div>
          </div>
        )}

        {impact && (
          <div className="card p-3 text-sm space-y-1" style={{ background: "var(--color-paper)" }}>
            <div className="font-semibold">Dopad na tvůj klub při současné formě</div>
            <div className="text-muted">
              {impact.played > 0
                ? `Odhad ${impact.expectedPos}. místo, ${impact.expectedWins} výher a ${impact.expectedDraws} remíz`
                : "Sezóna ještě nezačala — počítá se s průměrným klubem"}
            </div>
            <Row label="Prémie za zápasy" value={signed(impact.delta.matchBonus)} />
            <Row label="Odměna za umístění" value={signed(impact.delta.placeReward)} />
            <Row label="Startovné" value={signed(-impact.delta.entryFee)} />
            <div className="border-t border-gray-200 pt-1">
              <Row label="Netto za sezónu" value={signed(impact.delta.net)} strong />
            </div>
          </div>
        )}

        <div>
          <label className="text-sm text-muted">Odůvodnění (nepovinné)</label>
          <textarea
            className="input w-full mt-1"
            rows={3}
            maxLength={500}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Proč by to kluby měly podpořit?"
          />
        </div>

        <p className="text-sm text-muted">
          Za podání se skládá kauce {czk(state.deposit)}. Vrátí se, až návrh projde.
        </p>

        <div className="flex gap-2">
          <button className="btn btn-secondary flex-1" onClick={onClose}>Zrušit</button>
          <button className="btn btn-primary flex-1" onClick={submit} disabled={saving || !kind}>
            {saving ? "Podávám…" : "Podat návrh"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
