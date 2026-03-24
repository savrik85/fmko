"use client";

import { useState, useEffect } from "react";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { Card, CardBody, Spinner, SectionLabel, PositionBadge, useConfirm } from "@/components/ui";

interface TransferPlayer {
  firstName: string;
  lastName: string;
  age: number;
  position: string;
  positionLabel: string;
  occupation: string;
}

interface TransferOffer {
  channel: string;
  description: string;
  cost: number;
  expiresInRounds: number;
  player: TransferPlayer;
}

interface DepartureRisk {
  playerIndex: number;
  playerId: string;
  playerName: string;
  reason: string;
  probability: number;
  description: string;
}

const CHANNEL_ICONS: Record<string, string> = {
  free_agent: "\u{1F6B6}",
  recommendation: "\u{1F91D}",
  pub: "\u{1F37A}",
  scouting: "\u{1F50D}",
  departure: "\u{1F6A8}",
};

const CHANNEL_LABELS: Record<string, string> = {
  free_agent: "Volný hráč",
  recommendation: "Doporučení",
  pub: "Hospoda",
  scouting: "Scouting",
};

const RISK_COLORS: Record<string, string> = {
  low_patriotism: "text-gold-600",
  low_morale: "text-card-red",
  better_offer: "text-pitch-500",
  moving_away: "text-muted",
};

function formatCZK(v: number): string { return v.toLocaleString("cs") + " Kč"; }

export default function TransfersPage() {
  const { teamId } = useTeam();
  const [offers, setOffers] = useState<TransferOffer[]>([]);
  const [risks, setRisks] = useState<DepartureRisk[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamId) return;
    apiFetch<{ offers: TransferOffer[]; departureRisks: DepartureRisk[] }>(`/api/teams/${teamId}/transfers`)
      .then((data) => {
        setOffers(data.offers);
        setRisks(data.departureRisks);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [teamId]);

  const { confirm, dialog: confirmDialog } = useConfirm();

  if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>;

  return (
    <div className="page-container space-y-5">
      {confirmDialog}
      {/* Incoming offers */}
      <div>
        <SectionLabel>Příchozí nabídky ({offers.length})</SectionLabel>
        {offers.length === 0 ? (
          <Card>
            <CardBody>
              <p className="text-center text-muted py-4">Zatím žádné nabídky. Zkus nábor nebo počkej na další kolo.</p>
            </CardBody>
          </Card>
        ) : (
          <div className="space-y-3">
            {offers.map((offer, i) => (
              <Card key={i}>
                <CardBody>
                  <div className="flex items-start gap-4">
                    <div className="shrink-0 w-12 h-12 rounded-xl bg-surface flex items-center justify-center text-2xl">
                      {CHANNEL_ICONS[offer.channel] ?? "\u{1F464}"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-heading font-bold text-base">
                          {offer.player.firstName} {offer.player.lastName}
                        </span>
                        <PositionBadge position={offer.player.position as "GK" | "DEF" | "MID" | "FWD"} />
                        <span className="text-sm text-muted">{offer.player.age} let</span>
                      </div>
                      <p className="text-sm text-ink-light">{offer.description}</p>
                      <div className="flex items-center gap-4 mt-2">
                        <span className="text-xs text-muted">
                          {CHANNEL_LABELS[offer.channel] ?? offer.channel}
                        </span>
                        <span className="text-xs text-muted">
                          {offer.player.occupation}
                        </span>
                        {offer.cost > 0 && (
                          <span className="text-xs font-heading font-bold text-card-red">
                            -{formatCZK(offer.cost)}
                          </span>
                        )}
                        <span className="text-xs text-muted">
                          Platí {offer.expiresInRounds} kol
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        const ok = await confirm({
                          title: `Přijmout ${offer.player.firstName} ${offer.player.lastName}?`,
                          description: `${offer.player.positionLabel}, ${offer.player.age} let — ${offer.player.occupation}`,
                          details: offer.cost > 0 ? [{ label: "Cena", value: `-${formatCZK(offer.cost)}`, color: "text-card-red" }] : undefined,
                          confirmLabel: "Přijmout do kádru",
                        });
                        if (!ok) return;
                        // TODO: implement accept transfer API
                      }}
                      className="shrink-0 btn btn-primary btn-sm"
                    >
                      Přijmout
                    </button>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Departure risks */}
      {risks.length > 0 && (
        <div>
          <SectionLabel>Hrozí odchod ({risks.length})</SectionLabel>
          <div className="space-y-2">
            {risks.map((risk, i) => (
              <Card key={i}>
                <CardBody>
                  <div className="flex items-center gap-3">
                    <span className="text-xl shrink-0">{"\u{1F6A8}"}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-heading font-bold text-sm">{risk.playerName}</div>
                      <p className="text-sm text-ink-light mt-0.5">{risk.description}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className={`font-heading font-bold text-lg tabular-nums ${risk.probability > 15 ? "text-card-red" : "text-gold-600"}`}>
                        {risk.probability}%
                      </div>
                      <div className="text-xs text-muted">riziko</div>
                    </div>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Recruitment actions */}
      <div>
        <SectionLabel>Aktivní nábor</SectionLabel>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { key: "poster", label: "Plakát", cost: 200, icon: "\u{1F4CB}", desc: "Vylepíš plakát po vesnici" },
            { key: "newsletter", label: "Zpravodaj", cost: 500, icon: "\u{1F4F0}", desc: "Inzerát v obecním zpravodaji" },
            { key: "visit_villages", label: "Obchůzka", cost: 1500, icon: "\u{1F6B6}", desc: "Obejdeš okolní vesnice" },
            { key: "contact_player", label: "Oslovení", cost: 500, icon: "\u{1F4DE}", desc: "Kontaktuješ konkrétního hráče" },
          ].map((action) => (
            <button
              key={action.key}
              onClick={() => recruitWithConfirm(action.key, action.label, action.cost, action.desc)}
              className="card p-4 text-center hover:bg-gray-50 transition-colors"
            >
              <div className="text-2xl mb-1">{action.icon}</div>
              <div className="font-heading font-bold text-sm">{action.label}</div>
              <div className="text-xs text-muted mt-0.5">{action.desc}</div>
              <div className="text-xs font-heading font-bold text-card-red mt-1">-{formatCZK(action.cost)}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  async function recruitWithConfirm(action: string, label: string, cost: number, desc: string) {
    if (!teamId) return;
    const ok = await confirm({
      title: `${label}?`,
      description: desc,
      details: cost > 0 ? [{ label: "Cena", value: `-${formatCZK(cost)}`, color: "text-card-red" }] : undefined,
      confirmLabel: "Provést",
    });
    if (!ok) return;
    try {
      const res = await apiFetch<{ success: boolean; message: string }>(`/api/teams/${teamId}/recruit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      // Refresh
      const data = await apiFetch<{ offers: TransferOffer[]; departureRisks: DepartureRisk[] }>(`/api/teams/${teamId}/transfers`);
      setOffers(data.offers);
      setRisks(data.departureRisks);
    } catch { /* ignore */ }
  }
}
