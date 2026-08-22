"use client";

/**
 * Panely grémia: pokladna, vedení s volbami, zápisy, disciplinárka, listina rozhodčích.
 *
 * Všechno je stavěné na mobil: karty místo tabulek, žádný vodorovný scroll,
 * akce jsou přes celou šířku a dlouhá jména se lámou.
 */

import { useEffect, useMemo, useState } from "react";
import { apiAction, apiFetch } from "@/lib/api";
import { Modal } from "@/components/ui";
import { EntityLink } from "@/components/ui";
import {
  Empty, GOLD, GOLD_SOFT, OpenProposalNote, Ornament, PersonLine, Portrait, Row,
  czk, formatDate, plural, signed,
} from "./ui";
import type {
  BoardData, Election, GrantsData, LedgerEntry, Meeting, Rules, SponsorData, State,
} from "./types";

const LEDGER_LABEL: Record<string, string> = {
  subsidy: "Svazová dotace", entry_fee: "Startovné", sponsor: "Sponzor",
  match_bonus: "Prémie za zápasy", referee_fee: "Odměny rozhodčím",
  place_reward: "Odměny za umístění", fine_referee: "Pokuty za výroky o rozhodčím",
  fine_admin: "Administrativní pokuty", sanction: "Pokuty disciplinární rady",
  interleague_fee: "Meziligové poplatky", levy_transfer: "Odvod z přestupů",
  levy_concession: "Odvod z občerstvení", levy_gate: "Odvod ze vstupného",
  levy_cup: "Odvod z poháru", levy_bet: "Odvod ze sázek",
  grant: "Dotace klubům", loan_repaid: "Splátky půjček",
  deposit: "Kauce", other: "Ostatní",
};

// ── Pokladna ────────────────────────────────────────────────────────────────
export function PokladnaPanel({ state, ledger }: {
  state: State;
  ledger: { entries: LedgerEntry[]; summary: Array<{ type: string; total: number }> } | null;
}) {
  const p = state.projection;

  // Co už je odhlasované a od příští sezóny se změní. Bez toho hráč koukal na
  // sazebník, který za pár týdnů neplatí, a nechápal, proč strop nesedí.
  const zmeny = useMemo(() => {
    const next = state.nextRules;
    if (!next) return [];
    const popis: Array<[keyof Rules, string, (v: number) => string]> = [
      ["win_bonus", "Odměna za výhru", czk],
      ["draw_bonus", "Odměna za remízu", czk],
      ["place_top", "Odměna za 1. místo", czk],
      ["place_decay", "Klíč rozdělení odměn", (v) => v.toFixed(2)],
      ["entry_fee", "Startovné", czk],
      ["referee_fee", "Odměna rozhodčímu za zápas", czk],
      ["fine_referee_abuse", "Pokuta za kritiku rozhodčího", czk],
      ["fine_admin", "Svazová pokuta", czk],
      ["fine_rule", "Pokuta za porušení pravidla", czk],
      ["interleague_fee_pct", "Meziligový poplatek", (v) => `${v} %`],
      ["levy_gate_pct", "Odvod ze vstupného", (v) => `${v} %`],
      ["levy_concession_pct", "Odvod z občerstvení", (v) => `${v} %`],
      ["levy_transfer_pct", "Odvod z přestupů v soutěži", (v) => `${v} %`],
      ["levy_cup_pct", "Odvod z pohárových odměn", (v) => `${v} %`],
    ];
    return popis
      .filter(([k]) => next[k] !== state.rules[k])
      .map(([k, label, fmt]) => ({ label, ted: fmt(state.rules[k]), pak: fmt(next[k]) }));
  }, [state.rules, state.nextRules]);

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
        <Row label="Meziligový poplatek" value={`${state.rules.interleague_fee_pct} %`} />
        <Row label="Odvod ze vstupného" value={`${state.rules.levy_gate_pct} %`} />
        <Row label="Odvod z občerstvení" value={`${state.rules.levy_concession_pct} %`} />
        <Row label="Odvod z přestupů v soutěži" value={`${state.rules.levy_transfer_pct} %`} />
        <Row label="Odvod z pohárových odměn" value={`${state.rules.levy_cup_pct} %`} />
      </div>

      {zmeny.length > 0 && (
        <div className="card p-5" style={{ background: "rgba(196,160,53,0.10)" }}>
          <Ornament>Od příští sezóny</Ornament>
          <p className="text-sm text-muted mb-2">
            Tohle už kluby odhlasovaly. Rozpočet s tím počítá, i když to zatím neplatí.
          </p>
          {zmeny.map((z) => (
            <Row key={z.label} label={z.label} value={`${z.ted} → ${z.pak}`} />
          ))}
        </div>
      )}

      <div className="card p-5">
        <Ornament>Pokuty, které padají samy</Ornament>
        <p className="text-sm text-muted mb-2">
          Tyhle částky nikdo neschvaluje po jedné — udělí se automaticky a rovnou putují do pokladny.
        </p>
        <Row label="Za kritiku rozhodčího" value={czk(state.rules.fine_referee_abuse)} />
        <Row label="Za nepořádek (svazová)" value={czk(state.rules.fine_admin)} />
        <Row label="Za porušení pravidla soutěže" value={czk(state.rules.fine_rule)} />
      </div>

      <div className="card p-5">
        <Ornament>Pravidla soutěže</Ornament>
        <p className="text-sm text-muted mb-2">
          Kontrola běží před každým zasedáním a co najde, jde rovnou do zápisu.
        </p>
        <Row label="Transfery mezi kluby stejného majitele"
          value={state.rules.ban_own_owner_transfers ? "zakázané" : "povolené"} />
        <Row label="Minimální stav hřiště"
          value={state.rules.min_pitch_condition > 0 ? `${state.rules.min_pitch_condition} ze 100` : "nehlídá se"} />
        <Row label="Nejméně hráčů na soupisce"
          value={state.rules.squad_min > 0 ? String(state.rules.squad_min) : "bez omezení"} />
        <Row label="Nejvíc hráčů na soupisce"
          value={state.rules.squad_max > 0 ? String(state.rules.squad_max) : "bez omezení"} />
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
  onPost: (text: string, scope: "kabinet" | "verejne") => Promise<void>;
}) {
  const open = elections.filter((e) => e.status === "open");
  const done = elections.filter((e) => e.status !== "open");
  const [busy, setBusy] = useState<string | null>(null);
  const [suspendRole, setSuspendRole] = useState<{ role: string; label: string } | null>(null);
  const [resignRole, setResignRole] = useState<{ role: string; label: string } | null>(null);

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
              <div key={r.role} className="space-y-2">
                <div className="flex items-center gap-3">
                <Portrait avatar={r.holder ? avatars[r.holder.teamId] : null}
                  name={r.holder?.managerName ?? r.holder?.teamName} size={48}
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
                {r.holder?.teamId === teamId && (
                  <button className="btn btn-md btn-secondary shrink-0"
                    onClick={() => setResignRole({ role: r.role, label: r.label })}>
                    Rezignovat
                  </button>
                )}
                </div>

                {/* Co ta funkce spravuje a co doopravdy smí — ať se nikdo neptá,
                    proč tam někdo sedí. Text jde ze serveru, aby v UI nemohla
                    viset pravomoc, kterou kód neumí. */}
                <div className="rounded-lg p-3 text-sm" style={{ background: "var(--color-paper)" }}>
                  <div className="font-semibold">Co má na starost</div>
                  <p className="text-muted mt-0.5">{r.agenda}</p>
                  <div className="font-semibold mt-2">Co smí</div>
                  <ul className="mt-0.5 space-y-1">
                    {r.powers.map((v, i) => (
                      <li key={i} className="text-muted flex gap-2">
                        <span aria-hidden="true" style={{ color: GOLD }}>◆</span>
                        <span className="min-w-0">{v}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>

        {jsemPrezident && (
          <div className="mt-4 rounded-lg p-3 text-sm" style={{ background: "rgba(196,160,53,0.14)" }}>
            <div className="font-semibold">Jsi prezident soutěže.</div>
            Při rovnosti hlasů rozhoduje tvůj hlas, zastupuješ každou neobsazenou funkci
            a kdykoli můžeš jinému předsedovi pozastavit pravomoc — tím rovnou
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
          <Ornament>Volba grémia</Ornament>

          {/* Volební řád. Pravidla musí být vidět dřív, než se hlasuje — jinak se
              hráč ptá pokaždé znovu a hlasuje naslepo. */}
          <div className="rounded-lg p-4" style={{ background: "rgba(196,160,53,0.10)" }}>
            <div className="section-label mb-2" style={{ color: "var(--color-gold-700)" }}>Volební řád</div>
            <ul className="space-y-1.5 text-sm">
              {[
                "Kandidují trenéři, ne kluby. Jeden trenér smí zastávat nejvýš jednu funkci — a kandidovat taky jen na jednu.",
                "Hlasuje se do zahájení středečního zasedání. Do té chvíle můžeš hlas kdykoli změnit i stáhnout kandidaturu.",
                "Volba je tajná. Svůj hlas vidíš jen ty, a nezveřejní se ani po uzavření — do zápisu jde jen jméno zvoleného a poměr hlasů.",
                "Volit sám sebe smíš. Kdo kandiduje, hlasuje jako každý jiný.",
                "Vyhrává prostá většina odevzdaných hlasů. Při rovnosti rozhoduje vyšší reputace trenéra.",
                "Hlas pro kandidáta, který mezitím odstoupil, propadá.",
                "Když nikdo nekandiduje, funkce zůstane neobsazená a na nejbližším zasedání se vypíše znovu.",
              ].map((v, i) => (
                <li key={i} className="flex gap-2">
                  <span aria-hidden="true" style={{ color: GOLD }}>◆</span>
                  <span className="min-w-0">{v}</span>
                </li>
              ))}
            </ul>
          </div>
          {open.map((e) => {
            const jsemKandidat = e.candidates.some((k) => k.teamId === teamId);
            return (
              <div key={e.id} className="rounded-lg overflow-hidden"
                style={{ background: "var(--color-paper)", boxShadow: `inset 0 0 0 1px ${GOLD_SOFT}` }}>
                <div className="h-1" style={{ background: `linear-gradient(90deg, ${GOLD}, transparent)` }} />
                <div className="p-4">
                <div className="text-xl font-heading">{e.roleLabel}</div>
                <div className="text-sm text-muted mb-3">
                  {e.candidates.length === 0
                    ? "Zatím nikdo nekandiduje."
                    : `${e.candidates.length} ${plural(e.candidates.length, "kandidát", "kandidáti", "kandidátů")}`}
                  {e.votesCast > 0
                    && ` · hlasovalo ${e.votesCast} ${plural(e.votesCast, "klub", "kluby", "klubů")}`}
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
                        <Portrait avatar={avatars[k.teamId]} name={k.managerName ?? k.teamName} size={40}
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

      {resignRole && teamId && (
        <ResignForm
          role={resignRole} teamId={teamId}
          hrozbaOdvolani={state.officials.some((o) => o.role === resignRole.role && o.status === "suspended")}
          onClose={() => setResignRole(null)}
          onSaved={() => { setResignRole(null); onChanged(); }}
        />
      )}

      {board?.seat && (
        <Vlakno
          title="Kabinet"
          right={board.seat.roleLabel}
          subtitle="Neveřejné vlákno vedení soutěže. Kluby ho nevidí a v zápisu ze zasedání se neobjeví."
          messages={board.messages} maxLength={board.maxLength}
          canPost placeholder="Napiš ostatním do vedení…"
          teamId={teamId} avatars={avatars}
          onPost={(t) => onPost(t, "kabinet")}
        />
      )}

      {board && (
        <Vlakno
          title="Stížnosti a vzkazy"
          subtitle="Veřejná nástěnka soutěže. Čte ji každý klub včetně toho, kterého se stížnost týká."
          messages={board.publicMessages} maxLength={board.maxLength}
          canPost={board.canPost}
          placeholder="Co ti v soutěži vadí? Uvidí to všichni…"
          teamId={teamId} avatars={avatars}
          onPost={(t) => onPost(t, "verejne")}
        />
      )}

      {done.length > 0 && (
        <div className="card p-5">
          <Ornament>Výsledky voleb</Ornament>
          <div className="space-y-3">
            {done.map((e) => (
              <div key={e.id} className="flex items-center gap-3">
                <Portrait avatar={e.winnerTeamId ? avatars[e.winnerTeamId] : null}
                  name={e.winnerManager ?? e.winnerName} size={40}
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
    <Modal isOpen onClose={onClose} title="Pozastavit pravomoc" zavritKlikemVedle={false}>
      <div className="p-5 space-y-4">
        <div className="text-lg font-heading">Pozastavit pravomoc — {role.label}</div>

        <div className="rounded-lg p-3 text-sm" style={{ background: "#FBEAE8" }}>
          <div className="font-semibold">Není to jen tak.</div>
          Pravomoc mu odebereš okamžitě, ale zároveň se tím otevře hlasování o jeho
          odvolání. Když kluby odvolání neschválí, pravomoc se mu vrátí a ty přijdeš
          o pět bodů reputace.
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
 * Demise. Bez hlasování a hned, ale s cenou — a ta se musí říct dopředu, ne až
 * v odpovědi serveru.
 */
function ResignForm({ role, teamId, hrozbaOdvolani, onClose, onSaved }: {
  role: { role: string; label: string }; teamId: string;
  hrozbaOdvolani: boolean;
  onClose: () => void; onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    const ok = await apiAction(
      apiFetch(`/api/teams/${teamId}/competition/officials/${role.role}/resign`, { method: "POST" }),
      "Demisi se nepodařilo podat",
    );
    setSaving(false);
    if (ok) onSaved();
  };

  return (
    <Modal isOpen onClose={onClose} title="Rezignovat na funkci" zavritKlikemVedle={false}>
      <div className="p-5 space-y-4">
        <div className="text-lg font-heading">Rezignovat — {role.label}</div>

        <p className="text-sm">
          Funkce se uvolní okamžitě, bez hlasování. Do nejbližšího zasedání ji zastupuje
          prezident soutěže, pak se na ni vypíše doplňovací volba.
        </p>

        <div className="rounded-lg p-3 text-sm" style={{ background: "#FBEAE8" }}>
          <div className="font-semibold">Zpátky to nejde.</div>
          Na tuhle funkci už letos kandidovat nemůžeš. Odchod v první půlce sezóny stojí
          tři body reputace; kdo odslouží půlku, odchází bez postihu.
          {hrozbaOdvolani && (
            <div className="mt-2 font-semibold">
              Zrovna teď se o tvém odvolání hlasuje — demise se proto počítá jako odvolání
              a přijdeš o deset bodů reputace.
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <button className="btn btn-lg btn-secondary flex-1" onClick={onClose}>Zrušit</button>
          <button className="btn btn-lg btn-primary flex-1" disabled={saving} onClick={submit}>
            {saving ? "Odesílám…" : "Rezignovat"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Dotace z pokladny. Rozdat jde jen volné peníze — to, co zbude po dohrání
 * rozehrané sezóny, protože odměny za umístění se platí až po posledním kole.
 */
export function GrantsPanel({ data, teamId, myOpen, onChanged }: {
  data: GrantsData; teamId: string;
  myOpen: { title: string } | null;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="card p-5">
      <Ornament right={`volných ${czk(data.freeBalance)}`}>Dotace klubům</Ornament>
      <p className="text-sm text-muted">
        Soutěž může rozdat část pokladny zpátky klubům — na vybavení, na opravu hřiště,
        jako cenu nebo jako bezúročnou půjčku tomu, kdo je v mínusu. Rozdává se jen
        z volných peněz; zbytek padne na odměny za umístění.
      </p>

      {myOpen ? (
        <div className="mt-3">
          <OpenProposalNote p={myOpen} />
        </div>
      ) : data.freeBalance < data.min ? (
        <p className="text-sm mt-3" style={{ color: "#A32B1F" }}>
          Volných peněz je {czk(data.freeBalance)} — na dotaci to nestačí.
        </p>
      ) : (
        <button className="btn btn-lg btn-primary w-full mt-3" onClick={() => setOpen(true)}>
          Navrhnout dotaci
        </button>
      )}

      {open && (
        <GrantForm
          data={data} teamId={teamId}
          onClose={() => setOpen(false)}
          onSaved={() => { setOpen(false); onChanged(); }}
        />
      )}
    </div>
  );
}

function GrantForm({ data, teamId, onClose, onSaved }: {
  data: GrantsData; teamId: string; onClose: () => void; onSaved: () => void;
}) {
  const [kind, setKind] = useState(data.kinds[0]?.kind ?? "equipment");
  const [amount, setAmount] = useState(String(Math.min(data.max, Math.max(data.min, 10_000))));
  const [target, setTarget] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const spec = data.kinds.find((k) => k.kind === kind);
  const jePrebytek = kind === "surplus";

  // Půjčka dává smysl jen klubu v mínusu — nabídka to musí říct dřív, než ji server odmítne.
  const cile = useMemo(
    () => (kind === "loan" ? data.teams.filter((t) => t.vMinusu) : data.teams),
    [kind, data.teams],
  );

  useEffect(() => {
    setTarget(cile[0]?.teamId ?? "");
  }, [cile]);

  const submit = async () => {
    setSaving(true);
    const ok = await apiAction(
      apiFetch(`/api/teams/${teamId}/competition/grants`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind, amount: Number(amount),
          targetTeamId: spec?.targeted ? target : undefined,
          note,
        }),
      }),
      "Návrh se nepodařilo podat",
    );
    setSaving(false);
    if (ok) onSaved();
  };

  const podHranici = data.teams.filter((t) => t.hristePodHranici).length;

  return (
    <Modal isOpen onClose={onClose} title="Návrh na dotaci" zavritKlikemVedle={false}>
      <div className="p-5 space-y-4">
        <div className="text-lg font-heading">Návrh na dotaci</div>

        <div>
          <label className="text-sm text-muted">Na co</label>
          <select className="select w-full mt-1" value={kind} onChange={(e) => setKind(e.target.value)}>
            {data.kinds.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
          </select>
          {kind === "pitch" && (
            <div className="text-sm text-muted mt-1">
              {podHranici === 0
                ? `Nikdo teď nemá hřiště pod ${data.pitchThreshold} — dotace by neměla komu jít.`
                : `Rozdělí se rovným dílem mezi kluby pod hranicí ${data.pitchThreshold}. Teď jich je ${podHranici}.`}
            </div>
          )}
          {kind === "equipment" && (
            <div className="text-sm text-muted mt-1">
              Rozdělí se rovným dílem mezi všechny kluby soutěže.
            </div>
          )}
          {spec?.seasonEnd && (
            <div className="text-sm text-muted mt-1">
              Vyplácí se až na konci sezóny{kind === "award"
                ? " — cena za fair play, za návštěvnost a pro nejlepšího střelce."
                : "."}
            </div>
          )}
        </div>

        {spec?.targeted && (
          <div>
            <label className="text-sm text-muted">Komu</label>
            {cile.length === 0 ? (
              <div className="text-sm mt-1" style={{ color: "#A32B1F" }}>
                Žádný klub soutěže není v mínusu. Půjčka je pro kluby v nouzi.
              </div>
            ) : (
              <select className="select w-full mt-1" value={target} onChange={(e) => setTarget(e.target.value)}>
                {cile.map((t) => (
                  <option key={t.teamId} value={t.teamId}>
                    {t.managerName ? `${t.managerName} (${t.teamName})` : t.teamName}
                    {t.vMinusu ? " — v mínusu" : ""}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        <div>
          <label className="text-sm text-muted">
            {jePrebytek
              ? `Kolik procent přebytku (nejvýš ${data.surplusMaxPct} %)`
              : `Částka (${czk(data.min)} – ${czk(Math.min(data.max, data.freeBalance))})`}
          </label>
          <input className="input w-full mt-1 tabular-nums" type="number"
            step={jePrebytek ? "5" : "1000"}
            min={jePrebytek ? 0 : data.min}
            max={jePrebytek ? data.surplusMaxPct : Math.min(data.max, data.freeBalance)}
            value={amount} onChange={(e) => setAmount(e.target.value)} />
          {!jePrebytek && (
            <div className="text-sm text-muted mt-1">
              V pokladně je volných {czk(data.freeBalance)}.
            </div>
          )}
        </div>

        <div>
          <label className="text-sm text-muted">Odůvodnění (nepovinné)</label>
          <textarea className="input w-full mt-1" rows={3} maxLength={500}
            value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="Proč by to kluby měly podpořit?" />
        </div>

        <p className="text-sm text-muted">
          Za podání se skládá kauce {czk(500)}. Vrátí se, až návrh projde.
        </p>

        <div className="flex gap-2">
          <button className="btn btn-lg btn-secondary flex-1" onClick={onClose}>Zrušit</button>
          <button className="btn btn-lg btn-primary flex-1"
            disabled={saving || (!!spec?.targeted && !target)} onClick={submit}>
            {saving ? "Podávám…" : "Podat návrh"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Sponzor soutěže. Nabídky chodí v zimní přestávce, přijmout jde jednu — a soutěž
 * se tím přejmenuje, takže je to rozhodnutí na dvě třetiny hlasů.
 */
export function SponsorPanel({ data, teamId, onChanged }: {
  data: SponsorData; teamId: string | null; onChanged: () => void;
}) {
  const [saving, setSaving] = useState<string | null>(null);

  // Nabídky předkládá hlasování prezident. Neobsazenou funkci nikdo nezastupuje,
  // aby se sponzor nedal protlačit potichu — pak smí kterýkoli klub.
  const smim = !!teamId && (data.gatekeeperTeamId === null || data.gatekeeperTeamId === teamId);

  const predloz = async (offerId: string) => {
    if (!teamId) return;
    setSaving(offerId);
    const ok = await apiAction(
      apiFetch(`/api/teams/${teamId}/competition/sponsor-offers/${offerId}/propose`, { method: "POST" }),
      "Nabídku se nepodařilo předložit",
    );
    setSaving(null);
    if (ok) onChanged();
  };

  const TIER: Record<string, string> = {
    mistni: "místní firma",
    okresni: "okresní firma",
    regionalni: "regionální značka",
  };

  if (data.current) {
    const s = data.current;
    return (
      <div className="card p-5">
        <Ornament right={`spokojenost ${s.satisfaction} ze 100`}>Sponzor soutěže</Ornament>
        <div className="text-xl font-heading">{s.name}</div>
        <div className="text-sm text-muted mt-0.5">
          {czk(s.amount)} za sezónu{s.untilSeason ? ` · smlouva do ${s.untilSeason}. sezóny` : ""}
        </div>
        <p className="text-sm text-muted mt-3">
          Soutěž nese jeho jméno. Když spokojenost na konci sezóny klesne pod 30, sponzor
          odejde a název se vrátí na „{s.originalName ?? "původní"}". Sráží ji každá pokuta,
          klid v soutěži ji naopak zvedá.
        </p>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <Ornament>Sponzorské nabídky</Ornament>
      {data.offers.filter((o) => o.status === "open").length === 0 ? (
        <p className="text-sm text-muted">
          Zatím se nikdo nehlásí. Nabídky chodí na začátku sezóny.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted mb-3">
            Přijmout jde jen jednu a soutěž se tím přejmenuje. Rozhoduje se
            dvoutřetinovou většinou.
          </p>
          <div className="space-y-3">
            {data.offers.filter((o) => o.status === "open").map((o) => (
              <div key={o.id} className="rounded-lg p-3" style={{ background: "var(--color-paper)" }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-base font-semibold break-words">
                      {o.name} liga
                    </div>
                    <div className="text-sm text-muted">
                      {TIER[o.tier]} · {czk(o.amount)} za sezónu · na {o.seasons}{" "}
                      {o.seasons === 1 ? "sezónu" : o.seasons <= 4 ? "sezóny" : "sezón"}
                    </div>
                  </div>
                  {smim && (
                    <button className="btn btn-md btn-secondary shrink-0"
                      disabled={saving === o.id} onClick={() => predloz(o.id)}>
                      {saving === o.id ? "Odesílám…" : "Dát hlasovat"}
                    </button>
                  )}
                </div>
                {o.conditions.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {o.conditions.map((c, i) => (
                      <li key={i} className="text-sm text-muted flex gap-2">
                        <span aria-hidden="true" style={{ color: GOLD }}>◆</span>
                        <span className="min-w-0">{c}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
          {!smim && (
            <p className="text-sm text-muted mt-3">
              Nabídku předkládá hlasování prezident soutěže.
            </p>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Soukromá schránka odboru — stížnost nebo nápad adresovaný jednomu předsedovi.
 *
 * Zobrazuje se na záložce odboru. Vzkazy jsou už ořezané serverem: obyčejný klub
 * vidí jen svoje, předseda odboru a prezident vidí všechny.
 */
export function OdborInbox({ roleKey, roleLabel, roleAkuzativ, messages, maxLength, canPost,
  teamId, avatars, onPost }: {
  roleKey: string; roleLabel: string; roleAkuzativ: string;
  messages: BoardData["messages"]; maxLength: number; canPost: boolean;
  teamId: string | null;
  avatars: Record<string, Record<string, unknown> | null>;
  onPost: (text: string) => Promise<void>;
}) {
  return (
    <Vlakno
      title="Vzkazy odboru"
      right={roleLabel || undefined}
      subtitle={
        `Soukromá linka na ${roleAkuzativ || "vedoucího odboru"}. `
        + "Čte to on a prezident soutěže — ostatní kluby ne. Sem patří stížnost nebo nápad, "
        + "který ještě nemá být návrhem na zasedání."
      }
      messages={messages} maxLength={maxLength}
      canPost={canPost}
      placeholder="Co ti vadí, nebo co bys zlepšil?"
      teamId={teamId} avatars={avatars} onPost={onPost}
      key={roleKey}
    />
  );
}

/**
 * Vlákno soutěže. Tři podoby téhož: neveřejný kabinet vedení, veřejná nástěnka
 * a soukromá schránka jednoho odboru. Liší se jen publikem.
 */
function Vlakno({ title, subtitle, right, messages, maxLength, canPost, placeholder,
  teamId, avatars, onPost }: {
  title: string; subtitle: string; right?: string;
  messages: BoardData["messages"]; maxLength: number;
  canPost: boolean; placeholder: string;
  teamId: string | null;
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
      <Ornament right={right}>{title}</Ornament>
      <p className="text-sm text-muted -mt-1">{subtitle}</p>

      <div className="mt-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-sm text-muted">Zatím tu nikdo nic nenapsal.</div>
        )}
        {messages.map((m) => {
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

      {canPost && (
        <div className="mt-4">
          <textarea className="input w-full" rows={3} maxLength={maxLength}
            value={text} onChange={(e) => setText(e.target.value)}
            placeholder={placeholder} />
          <div className="flex items-center justify-between gap-3 mt-2">
            <span className="text-sm text-muted tabular-nums">
              {text.length} / {maxLength}
            </span>
            <button className="btn btn-md btn-primary" disabled={saving || !text.trim()} onClick={send}>
              {saving ? "Odesílám…" : "Odeslat"}
            </button>
          </div>
        </div>
      )}
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
