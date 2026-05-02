"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { apiFetch, apiAction } from "@/lib/api";
import { Spinner } from "@/components/ui";
import { TeamSide, type TeamSummary, type ManagerSummary } from "./components/TeamSide";
import { PlayerHero, type PlayerSummary } from "./components/PlayerHero";
import { OfferTimeline, type OfferEvent } from "./components/OfferTimeline";
import { ActionBar } from "./components/ActionBar";
import { MessageDialog } from "./components/MessageDialog";

interface OfferDetail {
  offer: {
    id: string;
    player_id: string;
    from_team_id: string;
    to_team_id: string;
    offer_type: "transfer" | "loan";
    loan_duration: number | null;
    offer_amount: number;
    counter_amount: number | null;
    message: string | null;
    reject_message: string | null;
    status: "pending" | "countered" | "accepted" | "rejected" | "withdrawn" | "expired";
    last_action_by: string | null;
    expires_at: string;
    created_at: string;
    resolved_at: string | null;
    offered_player_id: string | null;
  };
  role: "buyer" | "seller";
  on_turn: boolean;
  player: PlayerSummary | null;
  offeredPlayer: PlayerSummary | null;
  fromTeam: TeamSummary | null;
  toTeam: TeamSummary | null;
  fromManager: ManagerSummary | null;
  toManager: ManagerSummary | null;
  events: OfferEvent[];
  currentAmount: number;
  crossLeague: boolean;
  adminFee: number;
}

const statusLabel: Record<OfferDetail["offer"]["status"], string> = {
  pending: "Čeká na odpověď",
  countered: "Protinabídka",
  accepted: "Přijato",
  rejected: "Zamítnuto",
  withdrawn: "Staženo",
  expired: "Vypršelo",
};

export default function OfferDetailPage() {
  const params = useParams<{ id: string }>();
  const { teamId } = useTeam();
  const [data, setData] = useState<OfferDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [withdrawDialog, setWithdrawDialog] = useState(false);

  const refresh = useCallback(async () => {
    if (!teamId || !params.id) return;
    try {
      const res = await apiFetch<OfferDetail>(`/api/teams/${teamId}/offers/${params.id}`);
      setData(res);
      setError(null);
    } catch (e) {
      console.error("Failed to load offer detail:", e);
      setError(e instanceof Error ? e.message : "Nepodařilo se načíst nabídku");
    } finally {
      setLoading(false);
    }
  }, [teamId, params.id]);

  useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh]);

  if (loading && !data) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <Link href="/dashboard/transfers" className="inline-flex items-center gap-1 text-sm font-heading font-bold text-muted hover:text-pitch-500 transition-colors mb-4">
          ← Zpět na přestupy
        </Link>
        <div className="card p-6 text-center">
          <div className="text-red-600 font-heading font-bold">{error ?? "Nabídka nenalezena"}</div>
        </div>
      </div>
    );
  }

  const { offer, role, on_turn, player, offeredPlayer, fromTeam, toTeam, fromManager, toManager, events, currentAmount, crossLeague, adminFee } = data;
  const isActive = offer.status === "pending" || offer.status === "countered";
  const myTeam = role === "buyer" ? fromTeam : toTeam;
  const myBudget = myTeam?.budget ?? null;
  const canAfford = role === "buyer"
    ? myBudget != null && myBudget >= currentAmount + adminFee
    : true;

  const playerName = player ? `${player.first_name} ${player.last_name}` : "hráče";

  const accept = async (message: string) => {
    if (await apiAction(apiFetch(`/api/teams/${teamId}/offers/${offer.id}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: message || undefined }),
    }), "Přijetí nabídky se nezdařilo")) {
      await refresh();
    }
  };

  const counter = async (amount: number, message: string) => {
    if (await apiAction(apiFetch(`/api/teams/${teamId}/offers/${offer.id}/counter`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount, message: message || undefined }),
    }), "Protinabídka se nezdařila")) {
      await refresh();
    }
  };

  const reject = async (message: string) => {
    if (await apiAction(apiFetch(`/api/teams/${teamId}/offers/${offer.id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: message || undefined }),
    }), "Odmítnutí se nezdařilo")) {
      await refresh();
    }
  };

  const withdraw = async (message: string) => {
    if (await apiAction(apiFetch(`/api/teams/${teamId}/offers/${offer.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: message || undefined }),
    }), "Stažení se nezdařilo")) {
      await refresh();
    }
  };

  const defaultCounterAmount = role === "seller"
    ? Math.max(1, Math.round(currentAmount * 1.25))
    : Math.max(1, Math.round(currentAmount * 0.85));

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-4">
      <Link href="/dashboard/transfers" className="inline-flex items-center gap-1 text-sm font-heading font-bold text-muted hover:text-pitch-500 transition-colors">
        ← Zpět na přestupy
      </Link>

      <div className="card p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="font-heading font-[900] text-2xl sm:text-3xl">Jednání o přestupu</h1>
          <span className="px-3 py-1 rounded-full bg-gray-100 text-xs font-heading font-bold uppercase tracking-wider text-muted">
            {statusLabel[offer.status]}
          </span>
        </div>

        {/* Mobile: hráč nahoře přes celou šířku, trenéři pod ním v gridu 2 sloupce */}
        <div className="sm:hidden space-y-4">
          {player && (
            <div className="flex justify-center">
              <PlayerHero
                player={player}
                offeredPlayer={offeredPlayer}
                currentAmount={currentAmount}
                offerType={offer.offer_type}
                loanDuration={offer.loan_duration}
                crossLeague={crossLeague}
                adminFee={adminFee}
                message={offer.message}
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 border-t border-gray-100 pt-4">
            {fromTeam && (
              <TeamSide
                team={fromTeam}
                manager={fromManager}
                label={role === "buyer" ? "Já (kupec)" : "Soupeř (kupec)"}
                alignment="left"
              />
            )}
            {toTeam && (
              <TeamSide
                team={toTeam}
                manager={toManager}
                label={role === "seller" ? "Já (prodávající)" : "Soupeř (prodávající)"}
                alignment="right"
              />
            )}
          </div>
        </div>

        {/* Desktop: face-off horizontální */}
        <div className="hidden sm:flex sm:items-start sm:justify-between sm:gap-6">
          {fromTeam && (
            <TeamSide
              team={fromTeam}
              manager={fromManager}
              label={role === "buyer" ? "Já (kupec)" : "Soupeř (kupec)"}
              alignment="left"
            />
          )}
          {player && (
            <PlayerHero
              player={player}
              offeredPlayer={offeredPlayer}
              currentAmount={currentAmount}
              offerType={offer.offer_type}
              loanDuration={offer.loan_duration}
              crossLeague={crossLeague}
              adminFee={adminFee}
              message={offer.message}
            />
          )}
          {toTeam && (
            <TeamSide
              team={toTeam}
              manager={toManager}
              label={role === "seller" ? "Já (prodávající)" : "Soupeř (prodávající)"}
              alignment="right"
            />
          )}
        </div>
      </div>

      <div className="card p-4 sm:p-6">
        <h2 className="font-heading font-bold text-sm uppercase tracking-wider text-muted mb-3">Historie vyjednávání</h2>
        <OfferTimeline
          events={events}
          myTeamId={teamId ?? ""}
          fromTeamId={offer.from_team_id}
          toTeamId={offer.to_team_id}
          fromManager={fromManager ? { avatar: fromManager.avatar, name: fromManager.name } : null}
          toManager={toManager ? { avatar: toManager.avatar, name: toManager.name } : null}
        />
      </div>

      <div className="card p-4 sm:p-6">
        {offer.status === "accepted" && (
          <div className="text-center py-2 font-heading font-bold text-pitch-500">
            ✅ Nabídka přijata {offer.resolved_at ? "" : ""}
          </div>
        )}
        {offer.status === "rejected" && (
          <div className="text-center py-2 font-heading font-bold text-red-600">
            ❌ Nabídka odmítnuta
            {offer.reject_message && <div className="text-sm italic text-muted font-normal mt-1">&ldquo;{offer.reject_message}&rdquo;</div>}
          </div>
        )}
        {offer.status === "withdrawn" && (
          <div className="text-center py-2 font-heading font-bold text-muted">↩️ Nabídka stažena</div>
        )}
        {offer.status === "expired" && (
          <div className="text-center py-2 font-heading font-bold text-muted">⌛ Nabídka vypršela</div>
        )}
        {isActive && (
          <ActionBar
            role={role}
            waiting={!on_turn}
            currentAmount={currentAmount}
            defaultCounter={defaultCounterAmount}
            canAfford={canAfford}
            onAccept={accept}
            onCounter={counter}
            onReject={reject}
          />
        )}
        {isActive && (
          <div className="mt-4 text-center">
            <button onClick={() => setWithdrawDialog(true)} className="text-xs text-muted hover:text-red-600 underline transition-colors">
              {role === "buyer" ? "Stáhnout svou nabídku" : "Ukončit jednání"}
            </button>
          </div>
        )}
      </div>

      {withdrawDialog && (
        <MessageDialog
          title={role === "buyer" ? "Stáhnout nabídku?" : "Ukončit jednání?"}
          description={role === "buyer"
            ? "Nabídka bude zrušena. Krátká zpráva protistraně (volitelné)."
            : "Jednání bude ukončeno. Krátká zpráva protistraně (volitelné)."}
          confirmLabel={role === "buyer" ? "Stáhnout" : "Ukončit"}
          confirmColor="red"
          onCancel={() => setWithdrawDialog(false)}
          onConfirm={async (msg) => { await withdraw(msg); setWithdrawDialog(false); }}
        />
      )}
    </div>
  );
}
