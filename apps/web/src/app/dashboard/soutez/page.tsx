"use client";

/**
 * Grémium soutěže — samospráva ligy.
 *
 * Čtyři hlavní záložky: Zasedání (program po odborech), Pokladna, Vedení, Zápisy.
 * Program se dělí po odborech, protože každý má svou agendu i svého předsedu —
 * návrh na pokutu nemá co dělat v hospodářské komisi.
 *
 * Stavěno na mobil: nic se nescrolluje do strany, akce jsou přes celou šířku,
 * dlouhá jména se lámou a portréty drží poměr i v úzkém sloupci.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTeam } from "@/context/team-context";
import { apiAction, apiFetch } from "@/lib/api";
import { EntityLink, Modal, Spinner, Tabs, useTabParam } from "@/components/ui";
import {
  Empty, GOLD, OpenProposalNote, Ornament, PersonLine, Portrait, Row, StatusPill, czk, plural, signed,
} from "./ui";
import { GrantsPanel, OdborInbox, PokladnaPanel, SponsorPanel, VedeniPanel, ZapisyPanel } from "./panels";
import { DisciplinePanel } from "./discipline";
import { RefereesPanel } from "./referees-panel";
import type {
  BoardData, DisciplineData, Election, LedgerEntry, Meeting, Proposal, ProposalKind,
  GrantsData, RefereeData, SponsorData, State,
} from "./types";

const TAB_KEYS = ["zasedani", "pokladna", "vedeni", "zapisy"] as const;

/** Pořadí určuje pořadí podzáložek. „zadna" je koš pro návrhy mimo gesce. */
const GESCE_ORDER = ["soutez", "hospodarska", "disciplinarni", "rozhodcich", "zadna"] as const;

/**
 * Záložky nesou jméno funkce, která odbor vede — zkrácené, aby se čtyři vešly
 * na mobil vedle sebe. Plný titul i s agendou je v hlavičce odboru pod nimi.
 */
const GESCE_LABEL: Record<string, string> = {
  soutez: "Prezident", hospodarska: "Sekretář",
  disciplinarni: "Disciplinárka", rozhodcich: "Rozhodčí", zadna: "Ostatní",
};

const GESCE_PLNY: Record<string, string> = {
  soutez: "Prezident soutěže", hospodarska: "Generální sekretář",
  disciplinarni: "Předseda disciplinární rady", rozhodcich: "Komisař rozhodčích", zadna: "Ostatní",
};

const GESCE_POPIS: Record<string, string> = {
  soutez: "Pravidla soutěže, přijetí sponzora a personální věci.",
  hospodarska: "Odměny za zápasy i za umístění, startovné, odvody z tržeb a dotace klubům.",
  disciplinarni: "Pokuty klubům, sazebník trestů a odvolání proti nim.",
  rozhodcich: "Listina rozhodčích a jejich odměna za odpískaný zápas.",
  zadna: "Návrhy, které nespadají pod žádný odbor.",
};

/** Komu se návrh podává — třetí pád, ať věta drží pohromadě. */
const GESCE_KOMU: Record<string, string> = {
  soutez: "prezidentovi soutěže", hospodarska: "generálnímu sekretáři",
  disciplinarni: "předsedovi disciplinární rady", rozhodcich: "komisaři rozhodčích", zadna: "mimo odbory",
};

const ROLE_OF_GESCE: Record<string, string> = {
  soutez: "predseda", hospodarska: "hospodarska",
  disciplinarni: "disciplinarni", rozhodcich: "rozhodcich",
};

const ANSWER_LABEL: Record<string, string> = { pro: "Pro", proti: "Proti", zdrzel: "Zdržel se" };

/**
 * Hodnota návrhu v řeči, kterou hráč čte. Zrcadlí formatRuleValue na serveru —
 * řídí se jednotkou, ne názvem typu, jinak by se vypínač zase ptal číslem.
 */
function fmtValue(spec: ProposalKind | undefined, v: number): string {
  switch (spec?.unit) {
    case "switch": return v ? "zavést" : "zrušit";
    case "pct": return `${v} %`;
    case "ratio": return v.toFixed(2);
    case "count": {
      if (v === 0) return "bez omezení";
      const [one, few, many] = spec.counted ?? ["", "", ""];
      const slovo = v === 1 ? one : v <= 4 ? few : many;
      return slovo ? `${v} ${slovo}` : String(v);
    }
    default: return czk(v);
  }
}

export default function SoutezPage() {
  const { teamId } = useTeam();
  const [tab, setTab] = useTabParam(TAB_KEYS);
  const [state, setState] = useState<State | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [elections, setElections] = useState<Election[]>([]);
  const [ledger, setLedger] = useState<{ entries: LedgerEntry[]; summary: Array<{ type: string; total: number }> } | null>(null);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [discipline, setDiscipline] = useState<DisciplineData | null>(null);
  const [referees, setReferees] = useState<RefereeData | null>(null);
  const [board, setBoard] = useState<BoardData | null>(null);
  const [sponsor, setSponsor] = useState<SponsorData | null>(null);
  const [grants, setGrants] = useState<GrantsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [gesce, setGesce] = useState<string>("hospodarska");

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

  const loadElections = useCallback(() => {
    if (!leagueId) return;
    apiFetch<{ elections: Election[] }>(`/api/competition/${leagueId}/elections`)
      .then((d) => setElections(d.elections ?? []))
      .catch((e) => console.error("načtení voleb:", e));
  }, [leagueId]);

  const loadDiscipline = useCallback(() => {
    if (!leagueId) return;
    apiFetch<DisciplineData>(`/api/competition/${leagueId}/discipline`)
      .then(setDiscipline).catch((e) => console.error("načtení disciplinárky:", e));
  }, [leagueId]);

  const loadGrants = useCallback(() => {
    if (!teamId) return;
    apiFetch<GrantsData>(`/api/teams/${teamId}/competition/grants`)
      .then(setGrants).catch((e) => console.error("načtení dotací:", e));
  }, [teamId]);

  const loadSponsor = useCallback(() => {
    if (!leagueId) return;
    apiFetch<SponsorData>(`/api/competition/${leagueId}/sponsor`)
      .then(setSponsor).catch((e) => console.error("načtení sponzora:", e));
  }, [leagueId]);

  /** Kabinet vidí jen ten, kdo má funkci — server u ostatních vrátí seat: null. */
  const loadBoard = useCallback(() => {
    if (!teamId) return;
    apiFetch<BoardData>(`/api/teams/${teamId}/competition/board`)
      .then(setBoard).catch((e) => console.error("načtení kabinetu:", e));
  }, [teamId]);

  const postToBoard = useCallback(async (
    text: string, scope: "kabinet" | "verejne" | "odbor", targetRole?: string,
  ) => {
    if (!teamId) return;
    const ok = await apiAction(
      apiFetch(`/api/teams/${teamId}/competition/board`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, scope, targetRole }),
      }),
      "Zprávu se nepodařilo odeslat",
    );
    if (ok) loadBoard();
  }, [teamId, loadBoard]);

  const loadReferees = useCallback(() => {
    if (!leagueId) return;
    apiFetch<RefereeData>(`/api/competition/${leagueId}/referees`)
      .then(setReferees).catch((e) => console.error("načtení listiny rozhodčích:", e));
  }, [leagueId]);

  useEffect(loadState, [loadState]);
  useEffect(loadProposals, [loadProposals]);
  useEffect(loadElections, [loadElections]);
  // Disciplinárka nese avatary všech trenérů, takže se hodí i pro volby a vedení.
  useEffect(loadDiscipline, [loadDiscipline]);
  useEffect(loadBoard, [loadBoard]);

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
    if (tab === "zasedani" && gesce === "rozhodcich" && !referees) loadReferees();
  }, [tab, gesce, leagueId, ledger, meetings.length, referees, loadReferees]);

  /** Portréty trenérů podle klubu — sdílené napříč volbami, vedením i disciplinárkou. */
  const avatars = useMemo(() => {
    const out: Record<string, Record<string, unknown> | null> = {};
    for (const t of discipline?.targets ?? []) out[t.teamId] = t.managerAvatar;
    return out;
  }, [discipline]);

  /**
   * Odbory se ukazují VŽDY, i když v malé soutěži nemají voleného předsedu —
   * agenda existuje tak jako tak a rozhoduje o ní hlasování. Kdyby se záložka
   * objevila až s prvním návrhem, nešel by ten první návrh nikde podat.
   * „Ostatní" je jediná výjimka: bez obsahu je prázdná záložka jen na obtíž.
   */
  const gesceList = useMemo(() => {
    const withProposals = new Set(proposals.map((p) => p.gesce));
    return GESCE_ORDER.filter((g) => g !== "zadna" || withProposals.has(g));
  }, [proposals]);

  useEffect(() => {
    if (gesceList.length > 0 && !gesceList.includes(gesce as never)) setGesce(gesceList[0]);
  }, [gesceList, gesce]);

  const open = useMemo(
    () => proposals.filter((p) => p.status === "open" && p.gesce === gesce), [proposals, gesce]);
  const closed = useMemo(
    () => proposals.filter((p) => p.status !== "open" && p.gesce === gesce), [proposals, gesce]);
  const openAll = useMemo(() => proposals.filter((p) => p.status === "open"), [proposals]);

  // Server pustí na program jen jeden návrh od klubu. Tlačítko proto musí zmizet,
  // jinak by hráč vyplnil formulář a odpovědí by mu bylo 409.
  const myOpen = useMemo(
    () => openAll.find((p) => p.proposedByTeamId === teamId) ?? null,
    [openAll, teamId],
  );

  const isChair = useMemo(
    () => !!state?.officials.find((o) => o.role === "disciplinarni" && o.teamId === teamId && o.status === "active"),
    [state, teamId]);

  const refreshAll = useCallback(() => {
    loadState(); loadProposals(); loadElections(); loadDiscipline(); loadBoard(); loadSponsor(); loadGrants();
    if (referees) loadReferees();
  }, [loadState, loadProposals, loadElections, loadDiscipline, loadBoard, loadSponsor, loadGrants, loadReferees, referees]);

  const vote = async (proposalId: string, answer: string) => {
    if (!teamId) return;
    const ok = await apiAction(
      apiFetch(`/api/teams/${teamId}/competition/proposals/${proposalId}/ballot`, {
        method: "POST", headers: { "Content-Type": "application/json" },
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
    if (ok) refreshAll();
  };

  const defend = async (proposalId: string, text: string) => {
    if (!teamId) return;
    const ok = await apiAction(
      apiFetch(`/api/teams/${teamId}/competition/proposals/${proposalId}/defence`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      }),
      "Obhajobu se nepodařilo uložit",
    );
    if (ok) loadProposals();
  };

  if (loading) {
    return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>;
  }
  if (!state) {
    return <div className="page-container"><Empty>Soutěž se nepodařilo načíst.</Empty></div>;
  }

  const displayName = state.league.sponsoredName ?? state.league.name;

  return (
    // Grémium se čte jako dokument, ne jako tabulka. Bez stropu šířky se na širokém
    // okně roztáhnou tlačítka i řádky kandidátů přes 1 280 px a stránka vypadá prázdně.
    <div className="page-container space-y-4 pb-10" style={{ maxWidth: 820 }}>
      {/* Hlavička — slavnostní, ale mobilně krotká */}
      <div className="card overflow-hidden">
        <div className="h-1" style={{ background: `linear-gradient(90deg, ${GOLD}, #866D1E)` }} />
        <div className="p-5">
          <div className="section-label mb-1">Grémium soutěže</div>
          <div className="text-2xl font-heading leading-tight break-words">{displayName}</div>
          <div className="text-sm text-muted mt-1">
            okres {state.league.district} · {state.league.seasonNumber}. sezóna ·{" "}
            {state.humanClubs} z {state.totalClubs} klubů má trenéra
          </div>

          {state.enabled ? (
            <div className="mt-4 grid grid-cols-3 gap-3">
              <Stat label="Pokladna" value={czk(state.balance)} />
              <Stat label="Hlasujících" value={String(state.voters)} />
              <Stat label="Kvórum" value={`${state.quorumNeeded} ${plural(state.quorumNeeded, "hlas", "hlasy", "hlasů")}`} />
            </div>
          ) : (
            <div className="mt-4 text-sm">
              {/* Dva různé důvody, proč samospráva neběží — a hráč musí poznat který.
                  Splněný práh a přesto vypnuto znamená, že se čeká na přelom sezóny;
                  psát tam „sežeňte víc klubů" by byl nesmysl, když jich má dost. */}
              {state.humanClubs >= state.threshold ? (
                <>
                  <div className="font-semibold text-base">Samospráva se spustí od příští sezóny.</div>
                  <p className="mt-1 text-muted">
                    Podmínku máte splněnou — {state.humanClubs} klubů s trenérem, potřeba je{" "}
                    {state.threshold}. Na přelomu sezóny dostane soutěž vlastní pokladnu, vypíšou se
                    volby do vedení a kluby začnou rozhodovat o odměnách, pokutách i pravidlech.
                    Do té doby běží všechno postaru.
                  </p>
                </>
              ) : (
                <>
                  <div className="font-semibold text-base">Soutěž je ve správě svazu.</div>
                  <p className="mt-1 text-muted">
                    Hlasovací právo dostane soutěž, až v ní bude aspoň {state.threshold} klubů
                    s trenérem. Teď je jich {state.humanClubs}.
                  </p>
                  <a href="/dashboard/invite" className="entity-link mt-2 inline-block">
                    Pozvi kamaráda do soutěže →
                  </a>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <Tabs
        items={[
          { key: "zasedani", label: "Zasedání", count: openAll.length || null },
          { key: "pokladna", label: "Pokladna" },
          { key: "vedeni", label: "Vedení" },
          { key: "zapisy", label: "Zápisy" },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "zasedani" && (
        <div className="space-y-4">
          <div className="card p-5 text-sm">
            <div className="font-semibold text-base">Grémium zasedá každou středu.</div>
            <p className="mt-1 text-muted">
              Návrhy i hlasy můžeš podávat kdykoli až do jeho zahájení. Během zasedání vidíš jen
              kolik klubů už hlasovalo — kdo jak hlasoval se odkryje až v zápisu. Změny odměn
              a sazeb platí vždy až od příští sezóny, nikdy na rozehranou.
            </p>
          </div>

          <Tabs
            items={gesceList.map((g) => ({
              key: g, label: GESCE_LABEL[g],
              count: proposals.filter((p) => p.status === "open" && p.gesce === g).length || null,
            }))}
            value={gesce}
            onChange={setGesce}
          />

          <GesceHeader gesce={gesce} state={state} avatars={avatars} />

          {gesce === "disciplinarni" && (
            <DisciplinePanel
              data={discipline} state={state} teamId={teamId}
              isChair={isChair} myOpen={myOpen} onChanged={refreshAll}
            />
          )}

          {gesce === "rozhodcich" && (
            <RefereesPanel data={referees} state={state} teamId={teamId} myOpen={myOpen} onChanged={refreshAll} />
          )}

          {open.length === 0 ? (
            <Empty>V tomhle odboru není na programu žádný bod.</Empty>
          ) : (
            open.map((p) => (
              <ProposalCard key={p.id} p={p} myTeamId={teamId} avatars={avatars}
                onVote={vote} onWithdraw={withdraw} onDefend={defend} canVote={state.enabled} />
            ))
          )}

          {state.enabled && gesce !== "zadna" && gesce !== "disciplinarni" && gesce !== "rozhodcich" && (
            myOpen ? (
              <OpenProposalNote p={myOpen} />
            ) : (
              <>
                <button className="btn btn-lg btn-primary w-full" onClick={() => setFormOpen(true)}>
                  Podat návrh {GESCE_KOMU[gesce]}
                </button>
                <p className="text-sm text-muted">
                  Za podání se skládá kauce {czk(state.deposit)}. Vrátí se, když návrh projde.
                </p>
              </>
            )
          )}

          {gesce === "hospodarska" && grants && state.enabled && teamId && (
            <GrantsPanel data={grants} teamId={teamId} myOpen={myOpen} onChanged={refreshAll} />
          )}

          {gesce === "soutez" && sponsor && (
            <SponsorPanel
              data={sponsor} teamId={teamId}
              onChanged={refreshAll}
            />
          )}

          {board && ROLE_OF_GESCE[gesce] && (
            <OdborInbox
              roleKey={ROLE_OF_GESCE[gesce]}
              roleLabel={state.roles?.find((r) => r.role === ROLE_OF_GESCE[gesce])?.label ?? ""}
              roleAkuzativ={state.roles?.find((r) => r.role === ROLE_OF_GESCE[gesce])?.labelAkuzativ ?? ""}
              messages={board.inbox?.[ROLE_OF_GESCE[gesce]] ?? []}
              maxLength={board.maxLength}
              canPost={board.canPost}
              teamId={teamId}
              avatars={avatars}
              onPost={(t) => postToBoard(t, "odbor", ROLE_OF_GESCE[gesce])}
            />
          )}

          {closed.length > 0 && (
            <div className="pt-2">
              <Ornament>Projednané body</Ornament>
              <div className="space-y-4">
                {closed.map((p) => (
                  <ProposalCard key={p.id} p={p} myTeamId={teamId} avatars={avatars}
                    onVote={vote} onWithdraw={withdraw} onDefend={defend} canVote={false} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "pokladna" && <PokladnaPanel state={state} ledger={ledger} />}

      {tab === "vedeni" && (
        <VedeniPanel state={state} elections={elections} avatars={avatars}
          board={board} teamId={teamId} onChanged={refreshAll} onPost={postToBoard} />
      )}

      {tab === "zapisy" && <ZapisyPanel meetings={meetings} />}

      {formOpen && teamId && (
        <ProposalForm
          teamId={teamId} state={state} gesce={gesce}
          onClose={() => setFormOpen(false)}
          onSaved={() => { setFormOpen(false); refreshAll(); }}
        />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg p-2.5 text-center" style={{ background: "var(--color-paper)" }}>
      <div className="text-xs text-muted uppercase tracking-wide">{label}</div>
      <div className="text-base font-semibold tabular-nums mt-0.5 break-words">{value}</div>
    </div>
  );
}

function GesceHeader({ gesce, state, avatars }: {
  gesce: string; state: State; avatars: Record<string, Record<string, unknown> | null>;
}) {
  const slot = state.roles?.find((r) => r.role === ROLE_OF_GESCE[gesce]);
  return (
    <div className="card p-5">
      <div className="text-lg font-heading">{GESCE_PLNY[gesce]}</div>
      <p className="text-sm text-muted mt-0.5">{GESCE_POPIS[gesce]}</p>
      {slot && (
        <div className="mt-3 flex items-center gap-3">
          <Portrait avatar={slot.holder ? avatars[slot.holder.teamId] : null} name={slot.holder?.managerName} size={44}
            ring={slot.holder ? GOLD : "var(--color-muted-light)"} />
          {slot.holder ? (
            <PersonLine managerName={slot.holder.managerName}
              teamId={slot.holder.teamId} teamName={slot.holder.teamName}
              note={
                slot.holder.status === "suspended"
                  ? <span className="text-danger">pravomoc pozastavena — odbor vede prezident</span>
                  : slot.label.toLowerCase()
              } />
          ) : (
            <div className="text-sm text-muted">
              Odbor nemá zvoleného vedoucího ({slot.label.toLowerCase()}) — rozhoduje o něm
              hlasování klubů.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Karta návrhu ────────────────────────────────────────────────────────────
function ProposalCard({ p, myTeamId, avatars, onVote, onWithdraw, onDefend, canVote }: {
  p: Proposal; myTeamId: string | null;
  avatars: Record<string, Record<string, unknown> | null>;
  onVote: (id: string, answer: string) => void;
  onWithdraw: (id: string) => void;
  onDefend: (id: string, text: string) => void;
  canVote: boolean;
}) {
  const mine = p.proposedByTeamId === myTeamId;
  const jsemDotceny = !!p.targetTeamId && p.targetTeamId === myTeamId;
  const [defence, setDefence] = useState("");

  return (
    <div className="card overflow-hidden">
      {p.status !== "open" && (
        <div className="h-0.5" style={{ background: p.status === "passed" ? "#3B7A3B" : "#D94032" }} />
      )}
      <div className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="text-base font-semibold leading-snug break-words min-w-0">{p.title}</div>
          {p.status !== "open" && <StatusPill status={p.status} />}
        </div>

        <div className="flex items-center gap-2 text-sm text-muted">
          <Portrait avatar={avatars[p.proposedByTeamId]} name={p.proposerName} size={28} ring="var(--color-muted-light)" />
          <div className="min-w-0 break-words">
            Navrhuje {p.proposerName
              ? <EntityLink type="team" id={p.proposedByTeamId}>{p.proposerName}</EntityLink>
              : "neznámý klub"}
            {p.majority > 0.5 && " · dvoutřetinová většina"}
            {p.effectiveFromSeason && ` · platí od ${p.effectiveFromSeason}. sezóny`}
          </div>
        </div>

        {p.body && <p className="text-sm break-words">{p.body}</p>}
        {p.evidence && (
          <div className="text-sm rounded-lg p-3" style={{ background: "var(--color-paper)" }}>
            <span className="font-semibold">Doloženo: </span>{p.evidence}
          </div>
        )}
        {p.payload?.budgetNote && <p className="text-sm text-muted">{p.payload.budgetNote}</p>}

        {p.defence && (
          <div className="text-sm rounded-lg p-3" style={{ background: "#FBF6E6" }}>
            <span className="font-semibold">Obhajoba dotčeného klubu: </span>„{p.defence}"
          </div>
        )}

        {p.status === "open" ? (
          <>
            <div className="text-sm text-muted">
              Hlasovalo {p.castCount} {plural(p.castCount, "klub", "kluby", "klubů")}.
            </div>

            {jsemDotceny ? (
              <div className="space-y-2">
                <div className="text-sm">
                  O návrhu, který se týká tvého klubu, nehlasuješ. Můžeš ale napsat obhajobu —
                  uvidí ji všichni před hlasováním.
                </div>
                {!p.defence && (
                  <>
                    <textarea className="input w-full" rows={2} maxLength={150}
                      value={defence} onChange={(e) => setDefence(e.target.value)}
                      placeholder="Co na svou obranu…" />
                    <button className="btn btn-lg btn-secondary w-full"
                      disabled={!defence.trim()} onClick={() => onDefend(p.id, defence)}>
                      Odeslat obhajobu
                    </button>
                  </>
                )}
              </div>
            ) : canVote ? (
              <div className="grid grid-cols-3 gap-2">
                {(["pro", "proti", "zdrzel"] as const).map((a) => (
                  <button key={a} onClick={() => onVote(p.id, a)}
                    className={`btn btn-md ${p.myAnswer === a ? "btn-primary" : "btn-secondary"}`}>
                    {ANSWER_LABEL[a]}
                  </button>
                ))}
              </div>
            ) : null}

            {p.myAnswer && (
              <div className="text-sm text-muted">
                Tvůj hlas: {ANSWER_LABEL[p.myAnswer]} — do zahájení zasedání ho můžeš změnit.
              </div>
            )}
            {mine && (
              <button className="btn btn-md btn-ghost w-full" onClick={() => onWithdraw(p.id)}>
                Stáhnout návrh
              </button>
            )}
          </>
        ) : (
          <>
            {p.resultNote && <div className="text-sm">{p.resultNote}</div>}
            {p.voters && p.voters.length > 0 && (
              <div className="text-sm space-y-1">
                {(["pro", "proti", "zdrzel"] as const).map((a) => {
                  const list = p.voters!.filter((v) => v.answer === a);
                  if (list.length === 0) return null;
                  return (
                    <div key={a} className="break-words">
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
    </div>
  );
}

// ── Formulář rozpočtového návrhu ────────────────────────────────────────────
interface Impact {
  expectedPos: number; expectedWins: number; expectedDraws: number; played: number;
  delta: { matchBonus: number; placeReward: number; entryFee: number; net: number };
}

function ProposalForm({ teamId, state, gesce, onClose, onSaved }: {
  teamId: string; state: State; gesce: string; onClose: () => void; onSaved: () => void;
}) {
  // Formulář nabízí jen typy spadající pod otevřený odbor.
  const kinds = useMemo(
    () => state.proposalKinds.filter((k) => k.gesce === gesce), [state.proposalKinds, gesce]);
  const [kind, setKind] = useState(kinds[0]?.kind ?? "");
  const spec = kinds.find((k) => k.kind === kind);
  const [value, setValue] = useState<string>(String(spec?.current ?? 0));
  // Formulář se otevírá s platnou hodnotou, takže dokud s ní nikdo nehne, byla by
  // kalkulačka samá nula — a to vypadá jako rozbitá stránka, ne jako informace.
  const zmeneno = Number(value) !== (spec?.current ?? 0);
  const [body, setBody] = useState("");
  const [impact, setImpact] = useState<Impact | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const s = kinds.find((k) => k.kind === kind);
    setValue(String(s?.current ?? 0));
    setImpact(null);
  }, [kind, kinds]);

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
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, value: Number(value), body }),
      }),
      "Návrh se nepodařilo podat",
    );
    setSaving(false);
    if (ok) onSaved();
  };

  return (
    <Modal isOpen onClose={onClose} title="Nový návrh" zavritKlikemVedle={false}>
      <div className="p-5 space-y-4">
        <div className="text-lg font-heading">Nový návrh {GESCE_KOMU[gesce]}</div>

        <div>
          <label className="text-sm text-muted">Čeho se návrh týká</label>
          <select className="select w-full mt-1" value={kind} onChange={(e) => setKind(e.target.value)}>
            {kinds.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
          </select>
        </div>

        {spec && (
          <div>
            {spec.note && <p className="text-sm text-muted mb-2">{spec.note}</p>}

            {spec.unit === "switch" ? (
              <>
                <label className="text-sm text-muted">Co se má stát</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {[
                    { v: "1", label: "Zavést pravidlo" },
                    { v: "0", label: "Zrušit pravidlo" },
                  ].map((o) => (
                    <button key={o.v} type="button"
                      className={`btn btn-lg ${value === o.v ? "btn-primary" : "btn-secondary"}`}
                      onClick={() => setValue(o.v)}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <label className="text-sm text-muted">
                  Nová hodnota
                  {spec.min !== null && spec.max !== null
                    && ` (${fmtValue(spec, spec.min)} – ${fmtValue(spec, spec.max)})`}
                </label>
                <input className="input w-full mt-1 tabular-nums" type="number"
                  step={spec.unit === "ratio" ? "0.01" : "1"}
                  min={spec.min ?? undefined} max={spec.max ?? undefined}
                  value={value} onChange={(e) => setValue(e.target.value)} />
              </>
            )}

            <div className="text-sm text-muted mt-2">
              Teď platí {fmtValue(spec, spec.current ?? 0)}
              {spec.nextSeason
                ? " · změna se projeví až od příští sezóny"
                : " · změna platí hned po zasedání"}
              {spec.majority > 0.5 && " · potřeba dvoutřetinová většina"}
            </div>
          </div>
        )}

        {impact && zmeneno && (
          <div className="rounded-lg p-3 text-sm space-y-1" style={{ background: "var(--color-paper)" }}>
            <div className="font-semibold">Dopad na tvůj klub při současné formě</div>
            <div className="text-muted">
              {impact.played > 0
                ? `Odhad ${impact.expectedPos}. místo, ${impact.expectedWins} výher a ${impact.expectedDraws} remíz`
                : "Sezóna ještě nezačala — počítá se s průměrným klubem"}
            </div>
            <Row label="Prémie za zápasy" value={signed(impact.delta.matchBonus)} />
            <Row label="Odměna za umístění" value={signed(impact.delta.placeReward)} />
            <Row label="Startovné" value={signed(-impact.delta.entryFee)} />
            <div className="border-t border-gray-200 pt-1 mt-1">
              <Row label="Netto za sezónu" value={signed(impact.delta.net)} strong />
            </div>
          </div>
        )}

        <div>
          <label className="text-sm text-muted">Odůvodnění (nepovinné)</label>
          <textarea className="input w-full mt-1" rows={3} maxLength={500}
            value={body} onChange={(e) => setBody(e.target.value)}
            placeholder="Proč by to kluby měly podpořit?" />
        </div>

        <p className="text-sm text-muted">
          Za podání se skládá kauce {czk(state.deposit)}. Vrátí se, až návrh projde.
        </p>

        <div className="flex gap-2">
          <button className="btn btn-lg btn-secondary flex-1" onClick={onClose}>Zrušit</button>
          <button className="btn btn-lg btn-primary flex-1" onClick={submit} disabled={saving || !kind || !zmeneno}>
            {saving
              ? "Podávám…"
              : zmeneno
                ? "Podat návrh"
                : spec?.unit === "switch" ? "Tohle už platí" : "Změň hodnotu"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
