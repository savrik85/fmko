"use client";

/**
 * Panely grémia: pokladna, vedení s volbami, zápisy, disciplinárka, listina rozhodčích.
 *
 * Všechno je stavěné na mobil: karty místo tabulek, žádný vodorovný scroll,
 * akce jsou přes celou šířku a dlouhá jména se lámou.
 */

import { useState } from "react";
import { apiAction, apiFetch } from "@/lib/api";
import { Modal } from "@/components/ui";
import { EntityLink } from "@/components/ui";
import {
  Empty, GOLD, Ornament, PersonLine, Portrait, Row, czk, formatDate, plural, signed,
} from "./ui";
import type { BoardData, Election, LedgerEntry, Meeting, State } from "./types";

const LEDGER_LABEL: Record<string, string> = {
  subsidy: "Svazová dotace", entry_fee: "Startovné", sponsor: "Sponzor",
  match_bonus: "Prémie za zápasy", referee_fee: "Odměny rozhodčím",
  place_reward: "Odměny za umístění", fine_referee: "Pokuty za výroky o rozhodčím",
  fine_admin: "Administrativní pokuty", sanction: "Pokuty disciplinární rady",
  interleague_fee: "Meziligové poplatky", levy_transfer: "Odvod z přestupů",
  levy_concession: "Odvod z občerstvení", levy_gate: "Odvod ze vstupného",
  levy_cup: "Odvod z poháru", grant: "Dotace klubům", deposit: "Kauce", other: "Ostatní",
};

// ── Pokladna ────────────────────────────────────────────────────────────────
export function PokladnaPanel({ state, ledger }: {
  state: State;
  ledger: { entries: LedgerEntry[]; summary: Array<{ type: string; total: number }> } | null;
}) {
  const p = state.projection;
  return (
    <div className="space-y-4">
      <div className="card p-5" style={{ background: "var(--color-paper)" }}>
        <Ornament>Pokladna soutěže</Ornament>
        <div className="text-3xl font-heading tabular-nums">{czk(state.balance)}</div>
        <div className="mt-3 space-y-1">
          <Row label="Závazky rozehrané sezóny" value={signed(-state.outstanding.total)} danger />
          <div className="border-t pt-2 mt-2" style={{ borderColor: "rgba(196,160,53,0.35)" }}>
            <Row label="Volných peněz" value={czk(state.freeBalance)} strong />
          </div>
        </div>
        <p className="text-sm text-muted mt-3">
          Odměny za umístění se vyplácejí až po posledním kole, takže část zůstatku je už
          fakticky utracená. Trvalé zvýšení sazeb se posuzuje jen proti volným penězům.
        </p>
      </div>

      <div className="card p-5">
        <Ornament>Projekce na příští sezónu</Ornament>
        <Row label="Svazová dotace" value={signed(state.subsidy)} />
        <Row label={`Startovné ${state.totalClubs} × ${czk(state.rules.entry_fee)}`} value={signed(state.totalClubs * state.rules.entry_fee)} />
        <Row label="Odměny za umístění" value={signed(-p.cost.placement)} />
        <Row label="Prémie za zápasy" value={signed(-p.cost.bonus)} />
        <Row label="Odměny rozhodčím" value={signed(-p.cost.referees)} />
        <div className="border-t border-gray-200 pt-2 mt-2">
          <Row label="Bilance" value={signed(p.income - p.cost.total)} strong />
        </div>
        <p className="text-sm text-muted mt-2">
          Pokuty se do projekce nepočítají — na příjem z vlastní hlouposti se plánovat nedá.
        </p>
      </div>

      <div className="card p-5">
        <Ornament>Platný sazebník</Ornament>
        <Row label="Odměna za výhru" value={czk(state.rules.win_bonus)} />
        <Row label="Odměna za remízu" value={czk(state.rules.draw_bonus)} />
        <Row label="Odměna za 1. místo" value={czk(state.rules.place_top)} />
        <Row label="Klíč rozdělení odměn" value={state.rules.place_decay.toFixed(2)} />
        <Row label="Startovné" value={czk(state.rules.entry_fee)} />
        <Row label="Odměna rozhodčímu za zápas" value={czk(state.rules.referee_fee)} />
        <Row label="Sazebník pokut" value={`${state.rules.fine_mult.toFixed(1)}×`} />
        <Row label="Meziligový poplatek" value={`${state.rules.interleague_fee_pct} %`} />
        <Row label="Odvod ze vstupného" value={`${state.rules.levy_gate_pct} %`} />
        <Row label="Odvod z občerstvení" value={`${state.rules.levy_concession_pct} %`} />
        <Row label="Odvod z přestupů v soutěži" value={`${state.rules.levy_transfer_pct} %`} />
        <Row label="Odvod z pohárových odměn" value={`${state.rules.levy_cup_pct} %`} />
      </div>

      {ledger && ledger.summary.length > 0 && (
        <div className="card p-5">
          <Ornament>Sezóna podle položek</Ornament>
          {ledger.summary.map((s) => (
            <Row key={s.type} label={LEDGER_LABEL[s.type] ?? s.type} value={signed(s.total)} />
          ))}
        </div>
      )}

      {ledger && (
        <div className="card p-5">
          <Ornament right={`${ledger.entries.length} posledních`}>Pohyby</Ornament>
          {ledger.entries.length === 0 && <div className="text-sm text-muted">Zatím žádné pohyby.</div>}
          <div className="divide-y" style={{ borderColor: "var(--color-line)" }}>
            {ledger.entries.map((e) => (
              <div key={e.id} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <div className="text-sm break-words">{e.description}</div>
                  <div className="text-xs text-muted break-words">
                    {LEDGER_LABEL[e.type] ?? e.type}
                    {e.team_name && e.team_id && <> · <EntityLink type="team" id={e.team_id}>{e.team_name}</EntityLink></>}
                  </div>
                </div>
                <div className={`text-sm tabular-nums shrink-0 ${e.amount < 0 ? "text-danger" : ""}`}>
                  {signed(e.amount)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Vedení a volby ──────────────────────────────────────────────────────────
export function VedeniPanel({ state, elections, avatars, board, teamId, onChanged, onPost }: {
  state: State; elections: Election[];
  avatars: Record<string, Record<string, unknown> | null>;
  board: BoardData | null;
  teamId: string | null; onChanged: () => void;
  onPost: (text: string) => Promise<void>;
}) {
  const open = elections.filter((e) => e.status === "open");
  const done = elections.filter((e) => e.status !== "open");
  const [busy, setBusy] = useState<string | null>(null);
  const [suspendRole, setSuspendRole] = useState<{ role: string; label: string } | null>(null);

  /** Prezident je nadřízený ostatním předsedům — pozastavení vidí jen on. */
  const jsemPrezident = !!teamId && state.presidentTeamId === teamId;

  const candidate = async (id: string, on: boolean) => {
    if (!teamId) return;
    setBusy(id);
    const ok = await apiAction(
      apiFetch(`/api/teams/${teamId}/competition/elections/${id}/candidacy`, { method: on ? "POST" : "DELETE" }),
      on ? "Kandidaturu se nepodařilo podat" : "Kandidaturu se nepodařilo stáhnout",
    );
    setBusy(null);
    if (ok) onChanged();
  };

  const vote = async (id: string, candidateTeamId: string) => {
    if (!teamId) return;
    setBusy(id);
    const ok = await apiAction(
      apiFetch(`/api/teams/${teamId}/competition/elections/${id}/vote`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateTeamId }),
      }),
      "Hlas se nepodařilo odevzdat",
    );
    setBusy(null);
    if (ok) onChanged();
  };

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <Ornament>Složení grémia</Ornament>
        <div className="space-y-3">
          {(state.roles ?? []).map((r) => {
            const suspended = state.officials.find((o) => o.role === r.role)?.status === "suspended";
            return (
              <div key={r.role} className="flex items-center gap-3">
                <Portrait avatar={r.holder ? avatars[r.holder.teamId] : null} name={r.holder?.managerName} size={48}
                  ring={r.holder ? GOLD : "var(--color-muted-light)"} />
                <div className="min-w-0 flex-1">
                  <div className="section-label mb-0" style={{ fontSize: "0.6875rem" }}>{r.label}</div>
                  {r.holder ? (
                    <PersonLine
                      managerName={r.holder.managerName}
                      teamId={r.holder.teamId} teamName={r.holder.teamName}
                      note={suspended ? <span className="text-danger">pravomoc pozastavena</span> : undefined}
                    />
                  ) : (
                    <div className="text-base text-muted">
                      neobsazeno{jsemPrezident ? " — zastupuješ ji" : ""}
                    </div>
                  )}
                </div>
                {jsemPrezident && r.holder && r.role !== "predseda" && !suspended && (
                  <button className="btn btn-md btn-secondary shrink-0"
                    onClick={() => setSuspendRole({ role: r.role, label: r.label })}>
                    Pozastavit
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {jsemPrezident && (
          <div className="mt-4 rounded-lg p-3 text-sm" style={{ background: "rgba(196,160,53,0.14)" }}>
            <div className="font-semibold">Jsi prezident soutěže.</div>
            Při rovnosti hlasů rozhoduje tvůj hlas, zastupuješ každou neobsazenou funkci
            a jednou za sezónu můžeš jinému předsedovi pozastavit pravomoc — tím rovnou
            otevřeš hlasování o jeho odvolání. Když neprojde, pravomoc se mu vrátí
            a ty přijdeš o pět bodů reputace.
          </div>
        )}
        <p className="text-sm text-muted mt-4">
          Soutěž s devíti a více kluby s trenérem má všechny čtyři odbory. Menší jen prezidenta
          a generálního sekretáře — pokuty i škrtání rozhodčích se tam řeší vždycky hlasováním.
          Jeden trenér může zastávat nejvýš jednu funkci.
        </p>
      </div>

      {open.length > 0 && (
        <div className="card p-5 space-y-5">
          <Ornament>Probíhající volby</Ornament>
          <p className="text-sm text-muted -mt-2">
            Kandidují trenéři, ne kluby. Volba je tajná — neuvidí se ani po uzavření, kdo koho volil.
          </p>
          {open.map((e) => {
            const jsemKandidat = e.candidates.some((k) => k.teamId === teamId);
            return (
              <div key={e.id} className="rounded-lg p-4" style={{ background: "var(--color-paper)" }}>
                <div className="text-lg font-heading">{e.roleLabel}</div>
                <div className="text-sm text-muted mb-3">
                  {e.candidates.length === 0
                    ? "Zatím nikdo nekandiduje."
                    : `${e.candidates.length} ${plural(e.candidates.length, "kandidát", "kandidáti", "kandidátů")}`}
                </div>

                <div className="space-y-2">
                  {e.candidates.map((k) => {
                    const mine = e.myVote === k.teamId;
                    return (
                      <div key={k.teamId}
                        className="flex items-center gap-3 rounded-lg p-3"
                        style={{
                          background: mine ? "rgba(196,160,53,0.14)" : "var(--color-surface)",
                          boxShadow: mine ? `inset 0 0 0 1px ${GOLD}` : "inset 0 0 0 1px var(--color-line)",
                        }}>
                        <Portrait avatar={avatars[k.teamId]} name={k.managerName} size={40}
                          ring={mine ? GOLD : "var(--color-muted-light)"} />
                        <div className="min-w-0 flex-1">
                          <PersonLine managerName={k.managerName} teamId={k.teamId} teamName={k.teamName} />
                        </div>
                        <button
                          className={`btn btn-md shrink-0 ${mine ? "btn-primary" : "btn-secondary"}`}
                          style={{ minWidth: 108 }}
                          disabled={busy === e.id}
                          onClick={() => vote(e.id, k.teamId)}
                        >
                          {mine ? "✓ Tvůj hlas" : "Dát hlas"}
                        </button>
                      </div>
                    );
                  })}
                </div>

                <button
                  className={`btn btn-lg w-full mt-3 ${jsemKandidat ? "btn-ghost" : "btn-secondary"}`}
                  disabled={busy === e.id}
                  onClick={() => candidate(e.id, !jsemKandidat)}
                >
                  {jsemKandidat ? "Stáhnout kandidaturu" : "Kandidovat"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {suspendRole && teamId && (
        <SuspendForm
          role={suspendRole} teamId={teamId}
          onClose={() => setSuspendRole(null)}
          onSaved={() => { setSuspendRole(null); onChanged(); }}
        />
      )}

      {board?.seat && (
        <Kabinet board={board} teamId={teamId} avatars={avatars} onPost={onPost} />
      )}

      {done.length > 0 && (
        <div className="card p-5">
          <Ornament>Výsledky voleb</Ornament>
          <div className="space-y-3">
            {done.map((e) => (
              <div key={e.id} className="flex items-center gap-3">
                <Portrait avatar={e.winnerTeamId ? avatars[e.winnerTeamId] : null} name={e.winnerManager} size={40}
                  ring={e.winnerTeamId ? GOLD : "var(--color-muted-light)"} />
                <div className="min-w-0 flex-1">
                  <div className="section-label mb-0" style={{ fontSize: "0.6875rem" }}>{e.roleLabel}</div>
                  {e.winnerTeamId ? (
                    <PersonLine managerName={e.winnerManager} teamId={e.winnerTeamId}
                      teamName={e.winnerName ?? "?"} note={e.resultNote ?? undefined} />
                  ) : (
                    <div className="text-base text-muted">neobsazeno — {e.resultNote}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Pozastavení pravomoci jinému předsedovi — nese riziko, tak ať je to vidět. */
function SuspendForm({ role, teamId, onClose, onSaved }: {
  role: { role: string; label: string }; teamId: string;
  onClose: () => void; onSaved: () => void;
}) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    const ok = await apiAction(
      apiFetch(`/api/teams/${teamId}/competition/officials/${role.role}/suspend`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      }),
      "Pravomoc se nepodařilo pozastavit",
    );
    setSaving(false);
    if (ok) onSaved();
  };

  return (
    <Modal isOpen onClose={onClose} title="Pozastavit pravomoc">
      <div className="p-5 space-y-4">
        <div className="text-lg font-heading">Pozastavit pravomoc — {role.label}</div>

        <div className="rounded-lg p-3 text-sm" style={{ background: "#FBEAE8" }}>
          <div className="font-semibold">Není to jen tak.</div>
          Pravomoc mu odebereš okamžitě, ale zároveň se tím otevře hlasování o jeho
          odvolání. Když kluby odvolání neschválí, pravomoc se mu vrátí a ty přijdeš
          o pět bodů reputace. Udělat to můžeš jednou za sezónu.
        </div>

        <div>
          <label className="text-sm text-muted">Proč mu pravomoc bereš</label>
          <textarea className="input w-full mt-1" rows={3} maxLength={300}
            value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="Uvidí to celé grémium i on sám." />
        </div>

        <div className="flex gap-2">
          <button className="btn btn-lg btn-secondary flex-1" onClick={onClose}>Zrušit</button>
          <button className="btn btn-lg btn-primary flex-1"
            disabled={saving || reason.trim().length < 10} onClick={submit}>
            {saving ? "Odesílám…" : "Pozastavit"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Kabinet — interní vlákno vedení. Zobrazuje se jen tomu, kdo v soutěži zastává
 * funkci; kdo ji nemá, o něm ani neví.
 */
function Kabinet({ board, teamId, avatars, onPost }: {
  board: BoardData; teamId: string | null;
  avatars: Record<string, Record<string, unknown> | null>;
  onPost: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  const send = async () => {
    const t = text.trim();
    if (!t) return;
    setSaving(true);
    await onPost(t);
    setSaving(false);
    setText("");
  };

  return (
    <div className="card p-5" style={{ background: "var(--color-paper)" }}>
      <Ornament right={board.seat ? board.seat.roleLabel : undefined}>Kabinet</Ornament>
      <p className="text-sm text-muted -mt-1">
        Neveřejné vlákno vedení soutěže. Kluby ho nevidí a v zápisu ze zasedání se neobjeví.
      </p>

      <div className="mt-4 space-y-3">
        {board.messages.length === 0 && (
          <div className="text-sm text-muted">Zatím tu nikdo nic nenapsal.</div>
        )}
        {board.messages.map((m) => {
          const mine = m.teamId === teamId;
          return (
            <div key={m.id} className="flex gap-3">
              <Portrait avatar={avatars[m.teamId]} name={m.senderName} size={34}
                ring={mine ? GOLD : "var(--color-muted-light)"} />
              <div className="min-w-0 flex-1 rounded-lg p-3"
                style={{
                  background: "var(--color-surface)",
                  boxShadow: mine ? `inset 0 0 0 1px ${GOLD}` : "inset 0 0 0 1px var(--color-line)",
                }}>
                <div className="text-sm font-semibold break-words">
                  {m.senderName}
                  <span className="text-muted font-normal"> · {m.senderRole}</span>
                </div>
                <div className="text-sm mt-0.5 whitespace-pre-wrap break-words">{m.body}</div>
                <div className="text-xs text-muted mt-1">{formatDate(m.sentAt)}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4">
        <textarea className="input w-full" rows={3} maxLength={board.maxLength}
          value={text} onChange={(e) => setText(e.target.value)}
          placeholder="Napiš ostatním do vedení…" />
        <div className="flex items-center justify-between gap-3 mt-2">
          <span className="text-xs text-muted tabular-nums">
            {text.length} / {board.maxLength}
          </span>
          <button className="btn btn-md btn-primary" disabled={saving || !text.trim()} onClick={send}>
            {saving ? "Odesílám…" : "Odeslat"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Zápisy ──────────────────────────────────────────────────────────────────
export function ZapisyPanel({ meetings }: { meetings: Meeting[] }) {
  if (meetings.length === 0) return <Empty>Grémium se zatím nesešlo.</Empty>;
  return (
    <div className="space-y-4">
      {meetings.map((m) => (
        <div key={m.id} className="card p-5">
          <Ornament right={czk(m.balanceAfter)}>Zasedání {formatDate(m.gameDate)}</Ornament>
          <div className="text-sm text-muted mb-2">
            Projednáno {m.closed}, přijato {m.passed}
            {m.attendance?.quorum
              ? ` · k usnesení bylo potřeba ${m.attendance.quorum} ${plural(m.attendance.quorum, "hlas", "hlasy", "hlasů")}, aktivních klubů ${m.attendance.active ?? 0}`
              : ""}
          </div>
          <div className="divide-y" style={{ borderColor: "var(--color-line)" }}>
            {m.items?.map((it, i) => (
              <div key={i} className="flex items-start justify-between gap-3 py-2">
                <div className="text-sm min-w-0 break-words">
                  {it.title}
                  {/* Volba je tajná — do zápisu jde jen jméno vítěze, nikdy poměr hlasů. */}
                  {it.resultNote && <div className="text-muted break-words">{it.resultNote}</div>}
                </div>
                <div className="text-sm tabular-nums text-muted shrink-0">
                  {typeof it.pro === "number" && typeof it.proti === "number"
                    ? `${it.pro}:${it.proti}${it.zdrzel ? ` (${it.zdrzel})` : ""}`
                    : it.status === "passed" ? "zvoleno" : "nerozhodnuto"}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
