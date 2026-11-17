"use client";

/**
 * Vztahy mezi manažery — sekce na profilu manažera.
 *
 * RelationCard    — detail vztahu můj tým × cizí tým + interakce (pivo, sázka, inzerát, dárek, gesto)
 * RelationsOverview — přehled všech trenérů v lize ve skupinách spojenci / rivalové / ostatní
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { apiFetch, showError } from "@/lib/api";
import { SectionLabel, ListCard, ListRow, ListEmpty, SectionLoading, StatusChip, useConfirm } from "@/components/ui";
import { FaceAvatar } from "@/components/players/face-avatar";
import { LicenceBadge } from "@/components/manager/LicenceBadge";
import { CoachName } from "@/components/manager/coach-name";

interface RelationMoment {
  date: string;
  icon: string;
  text: string;
  rd: number;
  hd: number;
}

interface RelationStatus {
  key: string;
  label: string;
}

interface RelationDetail {
  respect: number;
  heat: number;
  status: RelationStatus | null;
  label: string;
  loyalAlly: boolean;
  history: RelationMoment[];
  otherIsAi: boolean;
  archetypeLabel: string | null;
  interactions: {
    gesture: { matchId: string; score: string; won: boolean } | null;
    gift: { matchId: string; score: string } | null;
    beer: { available: boolean; minRespect: number; cooldownDaysLeft: number; cost: number };
    bet: { matchId: string; round: number | null; amount: number } | null;
    pendingBet: { matchId: string; status: string; offeredByMe: boolean } | null;
    statement: { matchId: string; round: number | null } | null;
    praise: { available: boolean; cooldownDaysLeft: number };
    ad: { available: boolean; cooldownDaysLeft: number; cost: number };
  };
}

interface RelationListItem {
  teamId: string;
  teamName: string;
  primaryColor: string | null;
  managerName: string;
  isAi: boolean;
  archetypeLabel: string | null;
  respect: number;
  heat: number;
  status: RelationStatus | null;
  label: string;
  loyalAlly: boolean;
  group: "allies" | "rivals" | "others";
  managerAvatar: Record<string, unknown> | null;
  licenceLevel?: number;
}

function LoyalAllyBadge() {
  return (
    <StatusChip tone="warn" title="Trvalý spojenec. 3+ společných posezení v hospodě">
      🏅 Trvalý spojenec
    </StatusChip>
  );
}

const BTN = "text-sm font-heading font-bold px-3 py-2 rounded-soft border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed";

const STATUS_STYLES: Record<string, string> = {
  rival: "bg-red-50 text-red-700 border border-red-200",
  ally: "bg-green-50 text-green-700 border border-green-200",
  enemy: "bg-gray-800 text-white",
};

function StatusBadge({ status }: { status: RelationStatus | null }) {
  if (!status) return null;
  return (
    <span className={`text-xs font-heading font-bold px-2 py-0.5 rounded-full ${STATUS_STYLES[status.key] ?? "bg-gray-100"}`}>
      {status.key === "rival" ? "🔥 " : status.key === "ally" ? "🤝 " : "⚔️ "}{status.label}
    </span>
  );
}

function AxisBar({ label, value, min, max, color }: { label: string; value: number; min: number; max: number; color: string }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="py-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-heading font-bold">{label}</span>
        <span className="text-sm font-heading font-bold tabular-nums">{value}</span>
      </div>
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden relative">
        {min < 0 && <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-300" />}
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(2, pct)}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function momentAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days < 1) return "dnes";
  if (days === 1) return "včera";
  return `před ${days} dny`;
}

/* ── Detail vztahu s cizím manažerem ───────────────────────────────────── */

export function RelationCard({ myTeamId, otherTeamId, otherManagerName }: {
  myTeamId: string;
  otherTeamId: string;
  otherManagerName: string;
}) {
  const [detail, setDetail] = useState<RelationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirm({ sheet: true });

  const load = useCallback(() => {
    apiFetch<RelationDetail>(`/api/teams/${myTeamId}/relations/${otherTeamId}`)
      .then(setDetail)
      .catch((e) => console.error("relation detail load:", e))
      .finally(() => setLoading(false));
  }, [myTeamId, otherTeamId]);

  useEffect(() => { load(); }, [load]);

  const interact = async (body: Record<string, unknown>, confirmText?: string) => {
    if (confirmText && !(await confirm({ title: "Opravdu?", description: confirmText, confirmLabel: "Pokračovat" }))) return;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await apiFetch<{ ok: boolean; message: string; aiResponse?: string | null; darts?: string | null }>(
        `/api/teams/${myTeamId}/relations/${otherTeamId}/interact`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      );
      const parts = [res.message, res.aiResponse, res.darts].filter(Boolean);
      setFeedback(parts.join(" "));
      load();
    } catch (e) {
      console.error("relation interact:", e);
      showError("Interakce se nepovedla", (e as Error)?.message || "Zkus to znovu.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="card"><SectionLoading /></div>;
  if (!detail) return null;

  const { interactions: ix } = detail;

  return (
    <div className="card p-4 sm:p-5">
      {confirmDialog}
      <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
        <SectionLabel>Vztah s trenérem</SectionLabel>
        <div className="flex items-center gap-2">
          {detail.archetypeLabel && (
            <span className="text-xs text-muted">{detail.archetypeLabel}</span>
          )}
          {detail.loyalAlly && <LoyalAllyBadge />}
          <StatusBadge status={detail.status} />
        </div>
      </div>

      <div className={`font-heading font-bold text-base ${detail.heat >= 40 || detail.respect <= -10 ? "text-card-red" : detail.respect >= 30 ? "text-pitch-600" : "text-ink"}`}>
        {detail.label}
      </div>

      <AxisBar label="Respekt" value={detail.respect} min={-100} max={100} color={detail.respect >= 0 ? "#22c55e" : "#ef4444"} />
      <AxisBar label="Napětí" value={detail.heat} min={0} max={100} color={detail.heat >= 60 ? "#ef4444" : "#d97706"} />

      {feedback && (
        <div className="mt-3 text-sm bg-amber-50 border border-amber-200 rounded-soft p-3 leading-relaxed">{feedback}</div>
      )}

      {/* Interakce */}
      <div className="mt-4 flex flex-wrap gap-2">
        {ix.gesture && (
          <>
            <button disabled={busy} onClick={() => interact({ type: "gesture", matchId: ix.gesture!.matchId, choice: "handshake" })}
              className={`${BTN} bg-green-50 border-green-200 hover:bg-green-100`}>
              🤝 Podat ruku <span className="text-muted">({ix.gesture.score})</span>
            </button>
            <button disabled={busy} onClick={() => interact({ type: "gesture", matchId: ix.gesture!.matchId, choice: "silent" })}
              className={`${BTN} bg-gray-50 border-gray-200 hover:bg-gray-100`}>
              🚪 Mlčky odejít
            </button>
            <button disabled={busy} onClick={() => interact({ type: "gesture", matchId: ix.gesture!.matchId, choice: "jab" },
              "Rýpnutí vyjde v novinách a zvedne napětí. Pokračovat?")}
              className={`${BTN} bg-red-50 border-red-200 hover:bg-red-100`}>
              🗞️ Rýpnout si do novin
            </button>
          </>
        )}

        {ix.statement && (
          <>
            <button disabled={busy}
              title="Respekt +5, kabina hraje bez tlaku"
              onClick={() => interact({ type: "statement", matchId: ix.statement!.matchId, tone: "respect" })}
              className={`${BTN} bg-green-50 border-green-200 hover:bg-green-100`}>
              🫡 Uznat v novinách
            </button>
            <button disabled={busy}
              title="Napětí +10, obě kabiny se nabudí"
              onClick={() => interact({ type: "statement", matchId: ix.statement!.matchId, tone: "provoke" },
                "Provokace vyjde v novinách a zvedne napětí. Soupeř nejspíš odpoví. Do toho?")}
              className={`${BTN} bg-red-50 border-red-200 hover:bg-red-100`}>
              😏 Provokovat v novinách
            </button>
            <button disabled={busy}
              title="Bez okamžitého efektu, ale výhra o 3+ pak pořádně zabolí (napětí +15)"
              onClick={() => interact({ type: "statement", matchId: ix.statement!.matchId, tone: "humble" })}
              className={`${BTN} bg-gray-50 border-gray-200 hover:bg-gray-100`}>
              🎭 Hrát chudáčka
            </button>
          </>
        )}

        <button disabled={busy || !ix.praise?.available}
          title={ix.praise && !ix.praise.available && ix.praise.cooldownDaysLeft > 0
            ? `Chválil jsi nedávno, znovu za ${ix.praise.cooldownDaysLeft} dní`
            : "Respekt +4, nic to nestojí"}
          onClick={() => interact({ type: "praise" })}
          className={`${BTN} bg-green-50 border-green-200 hover:bg-green-100`}>
          👏 Pochválit
        </button>

        <button disabled={busy || !ix.beer.available}
          title={!ix.beer.available
            ? (ix.beer.cooldownDaysLeft > 0 ? `Znovu za ${ix.beer.cooldownDaysLeft} dní` : `Na pivo spolu zajdete až od respektu ${ix.beer.minRespect}`)
            : undefined}
          onClick={() => interact({ type: "beer" })}
          className={`${BTN} bg-amber-50 border-amber-200 hover:bg-amber-100`}>
          🍻 Pozvat na pivo{!ix.beer.available && ix.beer.cooldownDaysLeft === 0 ? ` (respekt ${ix.beer.minRespect}+)` : ""}
        </button>

        {ix.bet && (
          <button disabled={busy} onClick={() => interact({ type: "bet", matchId: ix.bet!.matchId },
            `Sázka o bečku na váš vzájemný zápas. Prohra stojí ${ix.bet!.amount} Kč. Jdeš do toho?`)}
            className={`${BTN} bg-amber-50 border-amber-200 hover:bg-amber-100`}>
            🍺 Vsadit se o bečku{ix.bet.round != null ? ` (${ix.bet.round}. kolo)` : ""}
          </button>
        )}
        {ix.pendingBet && ix.pendingBet.status === "pending" && (
          <span className="text-sm text-muted self-center">🍺 Sázka o bečku běží, rozhodne hřiště</span>
        )}
        {ix.pendingBet && ix.pendingBet.status === "offered" && ix.pendingBet.offeredByMe && (
          <span className="text-sm text-muted self-center">🍺 Nabídka sázky čeká na odpověď</span>
        )}
        {ix.pendingBet && ix.pendingBet.status === "offered" && !ix.pendingBet.offeredByMe && (
          <>
            <button disabled={busy} onClick={() => interact({ type: "bet_accept" })}
              className={`${BTN} bg-green-50 border-green-200 hover:bg-green-100`}>
              🍺 Přijmout sázku o bečku
            </button>
            <button disabled={busy} onClick={() => interact({ type: "bet_decline" })}
              className={`${BTN} bg-gray-50 border-gray-200 hover:bg-gray-100`}>
              Odmítnout sázku
            </button>
          </>
        )}

        <button disabled={busy || !ix.ad.available}
          title={!ix.ad.available && ix.ad.cooldownDaysLeft > 0 ? `Znovu za ${ix.ad.cooldownDaysLeft} dní` : undefined}
          onClick={() => interact({ type: "ad" },
            `Anonymní jedovatý inzerát do novin (${ix.ad.cost} Kč). Pozor, může se provalit, kdo ho podal. Pokračovat?`)}
          className={`${BTN} bg-red-50 border-red-200 hover:bg-red-100`}>
          📰 Anonymní inzerát
        </button>

        {ix.gift && (
          <>
            <button disabled={busy} onClick={() => interact({ type: "gift", matchId: ix.gift!.matchId, tone: "sincere" })}
              className={`${BTN} bg-green-50 border-green-200 hover:bg-green-100`}>
              🎁 Poslat upřímný koš <span className="text-muted">({ix.gift.score})</span>
            </button>
            <button disabled={busy} onClick={() => interact({ type: "gift", matchId: ix.gift!.matchId, tone: "poison" },
              "Jedovatý koš pořádně zvedne napětí. Kabina se ale zasměje. Pokračovat?")}
              className={`${BTN} bg-red-50 border-red-200 hover:bg-red-100`}>
              🎁 Poslat jedovatý koš
            </button>
          </>
        )}
      </div>

      {/* Historie momentů */}
      {detail.history.length > 0 && (
        <div className="mt-4">
          <div className="text-micro text-muted uppercase tracking-wide font-heading font-bold mb-1.5">
            Společná historie s trenérem {otherManagerName}
          </div>
          {/* Moment je celý jednou větou, proto hustý řádek bez názvu a ikona bez dlaždice. */}
          <div className="-mx-4 sm:-mx-5 max-h-64 overflow-y-auto border-y border-line-soft">
            {detail.history.map((m, i) => (
              <ListRow key={i} dense
                leading={<span className="text-base leading-none" aria-hidden="true">{m.icon}</span>}
                detail={m.text}
                trailing={<span className="text-meta text-muted whitespace-nowrap">{momentAgo(m.date)}</span>} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Předzápasová karta (profil týmu) ──────────────────────────────────── */

export function PreMatchCard({ myTeamId, otherTeamId, otherTeamName }: {
  myTeamId: string;
  otherTeamId: string;
  otherTeamName: string;
}) {
  const [detail, setDetail] = useState<RelationDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirm({ sheet: true });

  const load = useCallback(() => {
    apiFetch<RelationDetail>(`/api/teams/${myTeamId}/relations/${otherTeamId}`)
      .then(setDetail)
      .catch((e) => console.error("pre-match card load:", e));
  }, [myTeamId, otherTeamId]);

  useEffect(() => { load(); }, [load]);

  if (!detail) return null;
  const ix = detail.interactions;
  const hasContent = ix.statement || ix.bet || ix.pendingBet;
  if (!hasContent && !feedback) return null;

  const interact = async (body: Record<string, unknown>, confirmText?: string) => {
    if (confirmText && !(await confirm({ title: "Opravdu?", description: confirmText, confirmLabel: "Pokračovat" }))) return;
    setBusy(true);
    try {
      const res = await apiFetch<{ ok: boolean; message: string; aiResponse?: string | null }>(
        `/api/teams/${myTeamId}/relations/${otherTeamId}/interact`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      );
      setFeedback([res.message, res.aiResponse].filter(Boolean).join(" "));
      load();
    } catch (e) {
      console.error("pre-match interact:", e);
      showError("Akce se nepovedla", (e as Error)?.message || "Zkus to znovu.");
    } finally {
      setBusy(false);
    }
  };

  const roundLabel = ix.statement?.round != null ? `${ix.statement.round}. kolo` : ix.bet?.round != null ? `${ix.bet.round}. kolo` : "vzájemný zápas";

  return (
    <div className="card p-4 sm:p-5 border-l-4 border-l-amber-400">
      {confirmDialog}
      <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
        <SectionLabel>Před zápasem · {roundLabel}</SectionLabel>
        <div className="flex items-center gap-3 text-sm tabular-nums">
          <span title="Respekt" className={detail.respect >= 0 ? "text-pitch-600" : "text-card-red"}>
            🤝 {detail.respect >= 0 ? "+" : ""}{detail.respect}
          </span>
          <span title="Napětí" className={detail.heat >= 60 ? "text-card-red font-bold" : "text-ink"}>🔥 {detail.heat}</span>
          <StatusBadge status={detail.status} />
        </div>
      </div>

      {feedback && (
        <div className="mb-3 text-sm bg-amber-50 border border-amber-200 rounded-soft p-3 leading-relaxed">
          {feedback}{" "}
          <Link href={`/manazer/${otherTeamId}`} className="underline text-pitch-600 hover:text-pitch-500">
            Vztah s trenérem →
          </Link>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {ix.statement && (
          <>
            <button disabled={busy}
              title="Respekt +5, kabina hraje bez tlaku (+1 morálka)"
              onClick={() => interact({ type: "statement", matchId: ix.statement!.matchId, tone: "respect" })}
              className={`${BTN} bg-green-50 border-green-200 hover:bg-green-100`}>
              🫡 Uznat soupeře v novinách
            </button>
            <button disabled={busy}
              title="Napětí +10, kabina i fanoušci hoří (+2 morálka), ale nabudí to i soupeře"
              onClick={() => interact({ type: "statement", matchId: ix.statement!.matchId, tone: "provoke" },
                `Provokace vyjde v novinách, zvedne napětí a nabudí obě kabiny. Trenér ${otherTeamName} nejspíš odpoví. Do toho?`)}
              className={`${BTN} bg-red-50 border-red-200 hover:bg-red-100`}>
              😏 Provokovat
            </button>
            <button disabled={busy}
              title="Žádný okamžitý efekt. Ale když pak vyhraješ o 3+, soupeř ti to nezapomene (napětí +15)"
              onClick={() => interact({ type: "statement", matchId: ix.statement!.matchId, tone: "humble" })}
              className={`${BTN} bg-gray-50 border-gray-200 hover:bg-gray-100`}>
              🎭 Hrát chudáčka
            </button>
          </>
        )}

        {ix.bet && (
          <button disabled={busy} onClick={() => interact({ type: "bet", matchId: ix.bet!.matchId },
            `Sázka o bečku na ${roundLabel}. Prohra stojí ${ix.bet!.amount} Kč. Jdeš do toho?`)}
            className={`${BTN} bg-amber-50 border-amber-200 hover:bg-amber-100`}>
            🍺 Vsadit se o bečku
          </button>
        )}
        {ix.pendingBet && ix.pendingBet.status === "pending" && (
          <span className="text-sm text-muted self-center">🍺 Sázka o bečku běží, rozhodne hřiště</span>
        )}
        {ix.pendingBet && ix.pendingBet.status === "offered" && !ix.pendingBet.offeredByMe && (
          <>
            <button disabled={busy} onClick={() => interact({ type: "bet_accept" })}
              className={`${BTN} bg-green-50 border-green-200 hover:bg-green-100`}>
              🍺 Přijmout sázku o bečku
            </button>
            <button disabled={busy} onClick={() => interact({ type: "bet_decline" })}
              className={`${BTN} bg-gray-50 border-gray-200 hover:bg-gray-100`}>
              Odmítnout
            </button>
          </>
        )}
        {ix.pendingBet && ix.pendingBet.status === "offered" && ix.pendingBet.offeredByMe && (
          <span className="text-sm text-muted self-center">🍺 Nabídka sázky čeká na odpověď</span>
        )}
      </div>
    </div>
  );
}

/* ── Pozápasové gesto (detail zápasu) ──────────────────────────────────── */

export function PostMatchGestureCard({ myTeamId, opponentTeamId, opponentName, matchId }: {
  myTeamId: string;
  opponentTeamId: string;
  opponentName: string;
  matchId: string;
}) {
  const [detail, setDetail] = useState<RelationDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirm({ sheet: true });

  useEffect(() => {
    apiFetch<RelationDetail>(`/api/teams/${myTeamId}/relations/${opponentTeamId}`)
      .then(setDetail)
      .catch((e) => console.error("gesture card load:", e));
  }, [myTeamId, opponentTeamId]);

  const gesture = detail?.interactions.gesture;
  if (!feedback && (!gesture || gesture.matchId !== matchId)) return null;

  const choose = async (choice: "handshake" | "silent" | "jab") => {
    if (choice === "jab" && !(await confirm({ title: "Opravdu?", description: "Rýpnutí vyjde v novinách a zvedne napětí. Pokračovat?", confirmLabel: "Pokračovat" }))) return;
    setBusy(true);
    try {
      const res = await apiFetch<{ ok: boolean; message: string; aiResponse?: string | null }>(
        `/api/teams/${myTeamId}/relations/${opponentTeamId}/interact`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "gesture", matchId, choice }) },
      );
      setFeedback([res.message, res.aiResponse].filter(Boolean).join(" "));
      setDetail(null);
    } catch (e) {
      console.error("gesture interact:", e);
      showError("Gesto se nepovedlo", (e as Error)?.message || "Zkus to znovu.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-4 sm:p-5">
      {confirmDialog}
      <SectionLabel>Po zápase</SectionLabel>
      {feedback ? (
        <div className="text-sm bg-amber-50 border border-amber-200 rounded-soft p-3 leading-relaxed">
          {feedback}{" "}
          <Link href={`/manazer/${opponentTeamId}`} className="underline text-pitch-600 hover:text-pitch-500">
            Vztah s trenérem →
          </Link>
        </div>
      ) : (
        <>
          <p className="text-sm text-ink-light mb-3">
            U kabin postává trenér {opponentName}. Jak se zachováš?
          </p>
          <div className="flex flex-wrap gap-2">
            <button disabled={busy} onClick={() => choose("handshake")}
              className={`${BTN} bg-green-50 border-green-200 hover:bg-green-100`}>
              🤝 Podat ruku
            </button>
            <button disabled={busy} onClick={() => choose("silent")}
              className={`${BTN} bg-gray-50 border-gray-200 hover:bg-gray-100`}>
              🚪 Mlčky odejít
            </button>
            <button disabled={busy} onClick={() => choose("jab")}
              className={`${BTN} bg-red-50 border-red-200 hover:bg-red-100`}>
              🗞️ Rýpnout si do novin
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Rodina: bratři mezi trenéry (vlastní i cizí profil) ────────────────── */

interface FamilyMember {
  kind: string;
  label: string;
  managerName: string;
  teamId: string;
  teamName: string;
}

export function FamilyCard({ teamId }: { teamId: string }) {
  const [family, setFamily] = useState<FamilyMember[]>([]);

  useEffect(() => {
    apiFetch<{ family: FamilyMember[] }>(`/api/teams/${teamId}/family`)
      .then((res) => setFamily(res.family))
      .catch((e) => console.error("family load:", e));
  }, [teamId]);

  // Většina trenérů v okrese příbuzné nemá, prázdnou kartu nemá smysl ukazovat.
  if (family.length === 0) return null;

  return (
    // Řádek nemá href: trenér i klub jsou dva různé odkazy.
    <ListCard title="Rodina">
      {family.map((f) => (
        <ListRow key={f.teamId}
          title={<><span className="font-normal text-muted">{f.label}: </span><Link href={`/manazer/${f.teamId}`} className="entity-link">{f.managerName}</Link></>}
          meta={<Link href={`/tym/${f.teamId}`} className="hover:text-ink">{f.teamName}</Link>} />
      ))}
    </ListCard>
  );
}

/* ── Přehled všech vztahů (vlastní profil) ─────────────────────────────── */

const GROUPS: Array<{ key: RelationListItem["group"]; title: string; empty: string }> = [
  { key: "allies", title: "Spojenci", empty: "Zatím nikdo. Pochvala, pivo nebo společné posezení v hospodě to změní." },
  { key: "rivals", title: "Rivalové", empty: "Nikdo tě zatím nemá v žaludku." },
  { key: "others", title: "Ostatní trenéři v lize", empty: "" },
];

function PeerRow({ r }: { r: RelationListItem }) {
  const tone = r.group === "rivals" ? "text-card-red" : r.group === "allies" ? "text-pitch-600" : "text-muted";
  return (
    <ListRow href={`/manazer/${r.teamId}`} chevron={false}
      leading={r.managerAvatar && Object.keys(r.managerAvatar).length > 2
        ? <FaceAvatar faceConfig={r.managerAvatar} size={30} className="rounded-full bg-surface-3" />
        : <span className="w-9 h-9 rounded-full bg-surface-3 flex items-center justify-center text-meta font-bold text-ink">{r.managerName[0]}</span>}
      title={<><CoachName name={r.managerName} isAi={r.isAi} /><span className="ml-2 align-middle"><LicenceBadge level={r.licenceLevel ?? 0} /></span></>}
      meta={
        <>
          <span className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle" style={{ backgroundColor: r.primaryColor ?? "#999" }} />
          {r.teamName}{r.archetypeLabel ? ` · ${r.archetypeLabel}` : ""}
        </>
      }
      detail={<span className={`font-bold ${tone}`}>{r.label}{r.loyalAlly && <span className="ml-1.5">🏅</span>}</span>}
      trailing={
        <span className="block text-right text-meta tabular-nums">
          <span title="Respekt" className={`block ${r.respect >= 0 ? "text-pitch-600" : "text-card-red"}`}>🤝 {r.respect >= 0 ? "+" : ""}{r.respect}</span>
          <span title="Napětí" className={`block ${r.heat >= 60 ? "text-card-red font-bold" : "text-ink"}`}>🔥 {r.heat}</span>
        </span>
      } />
  );
}

export function RelationsOverview({ teamId }: { teamId: string }) {
  const [relations, setRelations] = useState<RelationListItem[] | null>(null);
  const [error, setError] = useState(false);
  const [showOthers, setShowOthers] = useState(false);

  useEffect(() => {
    apiFetch<{ relations: RelationListItem[] }>(`/api/teams/${teamId}/relations`)
      .then((res) => setRelations(res.relations))
      .catch((e) => { console.error("relations overview load:", e); setError(true); });
  }, [teamId]);

  if (error) return <div className="card p-4 text-sm text-card-red">Vztahy s trenéry se nepodařilo načíst.</div>;
  if (!relations) return <SectionLoading />;
  if (relations.length === 0) return <div className="card p-4 text-sm text-muted">V lize zatím nejsou další trenéři.</div>;

  return (
    <div className="space-y-5">
      {GROUPS.map((g) => {
        const list = relations.filter((r) => r.group === g.key);
        const collapsible = g.key === "others";
        const open = !collapsible || showOthers;
        return (
          <ListCard key={g.key} title={g.title} count={list.length}
            controls={collapsible && list.length > 0 ? (
              <button type="button" onClick={() => setShowOthers((v) => !v)}
                className="text-meta font-bold text-pitch-600 hover:underline min-h-11 px-2">
                {showOthers ? "Skrýt" : "Ukázat"}
              </button>
            ) : undefined}>
            {list.length === 0 && g.empty && <ListEmpty icon={g.key === "allies" ? "🍺" : "🤝"}>{g.empty}</ListEmpty>}
            {open && list.map((r) => <PeerRow key={r.teamId} r={r} />)}
          </ListCard>
        );
      })}
    </div>
  );
}
