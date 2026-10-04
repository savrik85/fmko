"use client";

/**
 * Jednání s cizím klubem o přestupu (spec 2026-10-04). Klub odpovídá s prodlevou
 * a smlouvá nahoru; po dohodě kupující podepíše a teprve pak rozhoduje hráč.
 */

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { apiFetch, apiAction } from "@/lib/api";
import { Spinner, PositionBadge, SheetDialog, useConfirm } from "@/components/ui";
import { FaceAvatar } from "@/components/players/face-avatar";
import { MoneyInput, formatAmount } from "@/components/ui/money-input";
import { TransferTermsFields, TermsBreakdown, type TermsValue } from "@/components/transfers/transfer-terms";
import { WillingnessBadge, ratingText } from "@/components/scouting/WillingnessBadge";
import { TeamSide, type TeamSummary, type ManagerSummary } from "../../nabidka/[id]/components/TeamSide";
import { OfferTimeline, type OfferEvent } from "../../nabidka/[id]/components/OfferTimeline";
import { AI_NEGOTIATION_STATUS_LABELS, formatTermsSummary, type AiNegotiationStatus, type TransferTerms } from "@okresni-masina/shared";

interface Detail {
  negotiation: {
    id: string;
    status: AiNegotiationStatus;
    source: "listing" | "scout_report";
    playerName: string;
    clubName: string;
    clubCity: string | null;
    clubDistrict: string | null;
    terms: TransferTerms;
    lastActionBy: "buyer" | "club";
    waiting: boolean;
    onTurn: boolean;
    expiresAt: string;
    playerId: string | null;
    stance: "listed" | "poached";
    scoutReportId: string | null;
  };
  player: {
    firstName: string; lastName: string; age: number | null; position: string | null;
    avatar: Record<string, unknown>;
    ratingLo: number | null; ratingHi: number | null;
    potentialLo: number | null; potentialHi: number | null;
    distanceKm: number | null;
    willingness: { level: number; label: string } | null;
  };
  myTeam: TeamSummary | null;
  manager: ManagerSummary | null;
  events: Array<{ id: string; actor: "buyer" | "club" | "player"; event_type: OfferEvent["event_type"]; amount: number | null; upfront_pct: number | null; installments: number | null; message: string | null; created_at: string }>;
  payNow: number;
  canAfford: boolean;
  squadCount: number;
  squadCap: number;
}

type SignResponse = { ok: true; signed: true; playerId: string } | { ok: true; signed: false; explanation: string };

const STATUS_STYLE: Record<AiNegotiationStatus, string> = {
  open: "bg-gray-100 text-muted",
  agreed: "bg-pitch-50 text-pitch-600",
  signed: "bg-pitch-500 text-white",
  refused: "bg-red-50 text-red-700",
  broken_off: "bg-red-50 text-red-700",
  withdrawn: "bg-gray-100 text-muted",
  expired: "bg-gray-100 text-muted",
};

function formatDeadline(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function AiNegotiationPage() {
  const params = useParams<{ id: string }>();
  const { teamId } = useTeam();
  const { confirm, dialog: confirmDialog } = useConfirm({ sheet: true });
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [counterOpen, setCounterOpen] = useState(false);

  const refresh = useCallback(async () => {
    if (!teamId || !params.id) return;
    try {
      setData(await apiFetch<Detail>(`/api/teams/${teamId}/negotiations/${params.id}`));
      setError(null);
    } catch (e) {
      console.error("Načtení jednání selhalo:", e);
      setError(e instanceof Error ? e.message : "Jednání se nepodařilo načíst");
    } finally {
      setLoading(false);
    }
  }, [teamId, params.id]);

  useEffect(() => { refresh(); }, [refresh]);

  // Když klub přemýšlí, stránka se sama podívá, jestli už neodpověděl.
  useEffect(() => {
    if (!data?.negotiation.waiting) return;
    const t = setInterval(() => { refresh(); }, 60_000);
    return () => clearInterval(t);
  }, [data?.negotiation.waiting, refresh]);

  if (loading && !data) {
    return <div className="min-h-[40vh] flex items-center justify-center"><Spinner /></div>;
  }
  if (error || !data) {
    return (
      <div className="max-w-3xl mx-auto p-4 sm:p-6">
        <Link href="/prestupy?tab=offers" className="inline-flex items-center gap-1 text-sm font-heading font-bold text-muted hover:text-pitch-500 mb-4">← Zpět na přestupy</Link>
        <div className="card p-6 text-center text-red-600 font-heading font-bold">{error ?? "Jednání nenalezeno"}</div>
      </div>
    );
  }

  const { negotiation: n, player, myTeam, manager, events, payNow, canAfford, squadCount, squadCap } = data;
  const playerName = `${player.firstName} ${player.lastName}`.trim() || n.playerName;
  const isOpen = n.status === "open" || n.status === "agreed";
  const squadFull = squadCount >= squadCap;
  const club: TeamSummary = {
    id: "club", name: n.clubName, primary_color: "#4a5d43", secondary_color: "#e8e4d8",
    badge_pattern: "plain", badge_symbol: null,
    initials: n.clubName.split(" ").map((w) => w[0]).join("").slice(0, 3).toUpperCase(),
    budget: null, reputation: null, is_virtual: true, city: n.clubCity,
  };

  const timeline: OfferEvent[] = events.map((e) => ({
    id: e.id,
    event_type: e.event_type,
    team_id: e.actor === "buyer" ? (myTeam?.id ?? "me") : e.actor,
    team_name: e.actor === "buyer" ? (myTeam?.name ?? "My") : e.actor === "club" ? n.clubName : playerName,
    amount: e.amount, message: e.message, created_at: e.created_at,
    upfront_pct: e.upfront_pct, installments: e.installments, sell_on_pct: 0,
  }));

  const sign = async () => {
    const ok = await confirm({
      title: `Podepsat ${playerName}?`,
      description: `${formatTermsSummary(n.terms)}. Teď se rozhodne hráč. Když odmítne, nic neplatíš.`,
      confirmLabel: "Podepsat",
    });
    if (!ok || !teamId) return;
    const out: { res: SignResponse | null } = { res: null };
    const done = await apiAction(
      apiFetch<SignResponse>(`/api/teams/${teamId}/negotiations/${n.id}/sign`, { method: "POST" }).then((r) => { out.res = r; }),
      "Podpis se nezdařil",
    );
    const r = out.res;
    if (done && r) {
      if (r.signed) {
        await confirm({ title: `${playerName} podepsal!`, description: "Hráč je v kádru. Najdeš ho v sestavě.", confirmLabel: "Paráda" });
      } else {
        await confirm({ title: `${playerName} odmítl`, description: r.explanation, confirmLabel: "Škoda" });
      }
    }
    await refresh();
  };

  const withdraw = async () => {
    const ok = await confirm({ title: "Stáhnout se z jednání?", description: `S ${n.clubName} o hráči skončíš. Nový pokus začne od začátku a klub bude netrpělivější.`, confirmLabel: "Stáhnout", variant: "danger" });
    if (!ok || !teamId) return;
    await apiAction(apiFetch(`/api/teams/${teamId}/negotiations/${n.id}`, { method: "DELETE" }), "Stažení se nezdařilo");
    await refresh();
  };

  const sendOffer = async (terms: TransferTerms) => {
    if (!teamId) return;
    if (await apiAction(apiFetch(`/api/teams/${teamId}/negotiations/${n.id}/offer`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: terms.amount, upfrontPct: terms.upfrontPct, installments: terms.installments }),
    }), "Návrh se nepodařilo poslat")) {
      setCounterOpen(false);
      await refresh();
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-4">
      <Link href="/prestupy?tab=offers" className="inline-flex items-center gap-1 text-sm font-heading font-bold text-muted hover:text-pitch-500 transition-colors">
        ← Zpět na přestupy
      </Link>

      <div className="card p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h1 className="font-heading font-[900] text-2xl sm:text-3xl">Jednání o přestupu</h1>
          <span className={`px-3 py-1 rounded-full text-sm font-heading font-bold shrink-0 ${STATUS_STYLE[n.status]}`}>
            {AI_NEGOTIATION_STATUS_LABELS[n.status]}
          </span>
        </div>

        {/* Hráč */}
        <div className="flex items-center gap-4">
          <div className="rounded-full overflow-hidden w-20 h-20 bg-paper ring-2 ring-white shadow-sm flex items-center justify-center shrink-0">
            {Object.keys(player.avatar ?? {}).length > 0 ? <FaceAvatar faceConfig={player.avatar} size={72} /> : <span className="text-3xl">👤</span>}
          </div>
          <div className="min-w-0">
            {n.playerId ? (
              <Link href={`/hrac/${n.playerId}`} className="font-heading font-bold text-xl hover:text-pitch-500 underline decoration-pitch-500/20">{playerName}</Link>
            ) : n.scoutReportId ? (
              <Link href={`/zamestnanci/skaut?hlaseni=${n.scoutReportId}`} className="font-heading font-bold text-xl hover:text-pitch-500 underline decoration-pitch-500/20">{playerName}</Link>
            ) : (
              <div className="font-heading font-bold text-xl">{playerName}</div>
            )}
            <div className="flex items-center gap-2 flex-wrap mt-1 text-sm">
              {player.position && <PositionBadge position={player.position as "GK" | "DEF" | "MID" | "FWD"} />}
              {player.age != null && <span className="text-muted">{player.age} let</span>}
              <span className="font-heading font-bold tabular-nums">Hodnocení {ratingText(player.ratingLo, player.ratingHi)}</span>
              {player.potentialLo != null && (
                <span className="text-muted tabular-nums">dotáhne to na {ratingText(player.potentialLo, player.potentialHi)}</span>
              )}
            </div>
            <div className="text-sm text-muted mt-1">
              {n.clubName}{n.clubCity ? `, ${n.clubCity}` : ""}{player.distanceKm != null ? ` · ${player.distanceKm} km od vás` : ""}
            </div>
            {player.willingness && isOpen && (
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <span className="text-sm text-muted">Ochota přejít:</span>
                <WillingnessBadge level={player.willingness.level} />
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-gray-100 pt-4 mt-4">
          {myTeam && <TeamSide team={myTeam} manager={manager} label="Já (kupec)" alignment="left" />}
          <TeamSide team={club} manager={null} label="Prodávající" alignment="right" />
        </div>
      </div>

      <div className="card p-4 sm:p-6">
        <h2 className="font-heading font-bold text-sm uppercase tracking-wider text-muted mb-3">Historie vyjednávání</h2>
        <OfferTimeline
          events={timeline}
          myTeamId={myTeam?.id ?? "me"}
          fromTeamId={myTeam?.id ?? "me"}
          toTeamId="club"
          fromManager={manager ? { avatar: manager.avatar, name: manager.name } : null}
          toManager={null}
        />
      </div>

      <div className="card p-4 sm:p-6 space-y-3">
        {n.waiting && (
          <div className="text-center py-2">
            <div className="font-heading font-bold text-muted">⏳ {n.clubName} si to rozmýšlí</div>
            <div className="text-sm text-muted mt-1">Odpověď přijde do pár hodin, dáme ti vědět SMS. V noci předseda nepíše.</div>
          </div>
        )}

        {isOpen && !n.waiting && (
          <>
            <div className="text-center">
              <div className="text-sm text-muted font-heading uppercase tracking-wider">
                {n.status === "agreed" ? "Klub souhlasí s tvou nabídkou" : `${n.clubName} chce`}
              </div>
              <div className="font-heading font-[900] text-2xl tabular-nums mt-1">{n.terms.amount.toLocaleString("cs")} Kč</div>
            </div>
            <div className="max-w-sm mx-auto w-full"><TermsBreakdown terms={n.terms} /></div>
            {n.status === "agreed" && (
              <div className="text-center text-sm text-muted">Souhlas platí do {formatDeadline(n.expiresAt)}. Pak klub na podpis nečeká.</div>
            )}
            {squadFull && (
              <div className="text-center text-sm text-red-600">Kádr je plný ({squadCount}/{squadCap}). Než podepíšeš, někoho pusť.</div>
            )}
            {!canAfford && (
              <div className="text-center text-sm text-red-600">
                {n.terms.installments > 0 ? "Nemáš dost peněz ani na zálohu." : "Nemáš dost peněz."}
              </div>
            )}
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                onClick={sign}
                disabled={!canAfford || squadFull}
                className="flex-1 sm:flex-none min-w-[140px] px-4 py-2.5 rounded-soft font-heading font-bold bg-pitch-500 text-white hover:bg-pitch-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {n.status === "agreed" ? "Podepsat" : "Přijmout a podepsat"}
              </button>
              {n.status === "open" && (
                <button
                  onClick={() => setCounterOpen(true)}
                  className="flex-1 sm:flex-none min-w-[120px] px-4 py-2.5 rounded-soft font-heading font-bold bg-gold-500 text-white hover:bg-gold-600 transition-colors"
                >
                  Protinávrh
                </button>
              )}
            </div>
            <div className="text-center text-sm text-muted tabular-nums">
              Podpisem zaplatíš hned {payNow.toLocaleString("cs")} Kč{n.terms.installments > 0 ? `, zbytek ve ${n.terms.installments} týdenních splátkách` : ""}.
            </div>
          </>
        )}

        {n.status === "signed" && <div className="text-center py-2 font-heading font-bold text-pitch-500">✍️ Hráč podepsal a je v kádru</div>}
        {n.status === "refused" && <div className="text-center py-2 font-heading font-bold text-red-600">🙅 Hráč přestup odmítl</div>}
        {n.status === "broken_off" && (
          <div className="text-center py-2">
            <div className="font-heading font-bold text-red-600">🚪 {n.clubName} jednání ukončil</div>
            <div className="text-sm text-muted mt-1">O tomhle hráči se s vámi dva týdny bavit nebudou.</div>
          </div>
        )}
        {n.status === "withdrawn" && <div className="text-center py-2 font-heading font-bold text-muted">↩️ Stáhl ses z jednání</div>}
        {n.status === "expired" && <div className="text-center py-2 font-heading font-bold text-muted">⌛ Jednání vypršelo</div>}

        {isOpen && (
          <div className="text-center pt-1">
            <button onClick={withdraw} className="text-sm text-muted hover:text-red-600 underline transition-colors">Stáhnout se z jednání</button>
          </div>
        )}
      </div>

      {counterOpen && (
        <CounterSheet initial={n.terms} onCancel={() => setCounterOpen(false)} onConfirm={sendOffer} />
      )}
      {confirmDialog}
    </div>
  );
}

function CounterSheet({ initial, onCancel, onConfirm }: {
  initial: TransferTerms;
  onCancel: () => void;
  onConfirm: (terms: TransferTerms) => Promise<void>;
}) {
  // Výchozí návrh kousek pod tím, co klub chce: smlouvá se zdola.
  const start = Math.max(100, Math.round((initial.amount * 0.9) / 100) * 100);
  const [amount, setAmount] = useState<number | null>(start);
  const [terms, setTerms] = useState<TermsValue>({ upfrontPct: initial.upfrontPct, installments: initial.installments, sellOnPct: 0 });

  return (
    <SheetDialog open title="Protinávrh" confirmLabel="Poslat" variant="gold" confirmDisabled={!amount}
      onCancel={onCancel}
      onConfirm={async () => { if (amount) await onConfirm({ amount, upfrontPct: terms.upfrontPct, installments: terms.installments, sellOnPct: 0 }); }}>
      <label className="text-sm text-muted font-heading uppercase">Kolik nabízíš (Kč)</label>
      <MoneyInput
        value={amount}
        onChange={setAmount}
        autoFocus
        className="w-full mt-1 px-3 py-2.5 rounded-xl border border-gray-200 bg-white font-heading font-bold text-lg tabular-nums text-center focus:outline-none focus:ring-2 focus:ring-pitch-500/30 focus:border-pitch-500"
      />
      <div className="flex justify-center gap-2 mt-2">
        {[0.8, 0.9, 0.95, 1].map((mul) => Math.round((initial.amount * mul) / 100) * 100).map((preset, i) => (
          <button key={i} type="button" onClick={() => setAmount(preset)}
            className={`px-2.5 py-1 rounded text-sm font-heading font-bold tabular-nums transition-colors ${amount === preset ? "bg-pitch-500 text-white" : "bg-black/5 text-muted hover:bg-black/10"}`}>
            {formatAmount(preset)}
          </button>
        ))}
      </div>
      <div className="mt-4">
        <TransferTermsFields amount={amount} value={terms} onChange={setTerms} allowSellOn={false} />
      </div>
      <p className="text-sm text-muted mt-3">
        Klub počítá splátky méně než hotovost. Urážlivě nízká nabídka nebo pořád stejné číslo mu bere trpělivost.
      </p>
    </SheetDialog>
  );
}
