"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { Card, CardBody, useConfirm } from "@/components/ui";
import { FaceAvatar } from "@/components/players/face-avatar";
import { favorLabel, formatCZK, personalityHint, personalityLabel } from "@/lib/sponsor-owners";

export interface OwnerInfo {
  firstName: string;
  lastName: string;
  age: number;
  faceConfig: Record<string, unknown>;
  personality: string;
}

export interface MyTeamInfo {
  favor: number;
  budgetEstimate: { low: number; high: number };
  nextHomeMatch: null | {
    matchId: string;
    scheduledAt: string;
    opponentName: string;
    giftCost: number;
    invitation: null | { status: "accepted" | "declined" | "attended"; rejectReason: string | null };
    slotTakenBy: string | null;
  };
}

export function OwnerCard({ sponsorId, teamId, owner, myTeam, onChanged }: {
  sponsorId: number;
  teamId: string | null;
  owner: OwnerInfo;
  myTeam: MyTeamInfo | null;
  onChanged: () => void;
}) {
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();
  const name = `${owner.firstName} ${owner.lastName}`;
  const match = myTeam?.nextHomeMatch ?? null;
  const date = match ? new Date(match.scheduledAt).toLocaleDateString("cs", { day: "numeric", month: "numeric" }) : "";

  const invite = async () => {
    if (!teamId || !match || acting) return;
    const ok = await confirm({
      title: `Pozvat ${name} na zápas?`,
      description: `Domácí zápas ${date} proti ${match.opponentName}. Když pozvání přijme, náklonnost stoupne a po zápase se promítne i výsledek.`,
      details: [{ label: "Dárek a občerstvení", value: `-${formatCZK(match.giftCost)}`, color: "text-card-red" }],
      confirmLabel: "Pozvat",
    });
    if (!ok) return;
    setActing(true); setError(null); setMessage(null);
    const res = await apiFetch<{ status: "accepted" | "declined"; rejectReason: string | null }>(
      `/api/teams/${teamId}/sponsor-owners/${sponsorId}/invite`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ matchId: match.matchId }) },
    ).catch((e) => { console.error("sponsor invite:", e); setError((e as Error).message); return null; });
    if (res) {
      setMessage(res.status === "accepted" ? `${name} pozvání přijal.` : `${name} odmítl: „${res.rejectReason ?? ""}“`);
      onChanged();
    }
    setActing(false);
  };

  return (
    <Card>
      <CardBody>
        {dialog}
        <div className="flex items-start gap-4">
          <FaceAvatar faceConfig={owner.faceConfig} size={72} className="shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm text-muted font-heading uppercase tracking-wide">Majitel</div>
            <div className="font-heading font-bold text-base">{name}, {owner.age} let</div>
            <div className="text-sm text-muted">{personalityLabel(owner.personality)}. {personalityHint(owner.personality)}</div>
          </div>
        </div>

        {myTeam && (
          <div className="mt-4 space-y-3">
            <div>
              <div className="flex justify-between text-sm">
                <span className="text-muted">Náklonnost k vašemu klubu</span>
                <span className="font-heading font-bold">{favorLabel(myTeam.favor)} ({myTeam.favor})</span>
              </div>
              <div className="h-2 rounded-full bg-gray-100 mt-1 overflow-hidden">
                <div className="h-full bg-pitch-500" style={{ width: `${myTeam.favor}%` }} />
              </div>
            </div>
            <div className="text-sm text-muted">
              Jako hlavní sponzor by dal zhruba {formatCZK(myTeam.budgetEstimate.low)} až {formatCZK(myTeam.budgetEstimate.high)} měsíčně.
              Čím lepší vztah, tím přesnější odhad.
            </div>

            {match ? (
              <div className="pt-3 border-t border-gray-100">
                <div className="text-sm">
                  Nejbližší domácí zápas {date} proti {match.opponentName}. Dárek {formatCZK(match.giftCost)}.
                </div>
                {match.invitation ? (
                  <div className="text-sm text-muted mt-1">
                    {match.invitation.status === "declined"
                      ? `Pozvání odmítl: „${match.invitation.rejectReason ?? ""}“`
                      : match.invitation.status === "attended"
                        ? "Byl na zápase."
                        : "Pozvání přijal, přijde na zápas."}
                  </div>
                ) : match.slotTakenBy ? (
                  <div className="text-sm text-muted mt-1">Ten den už jde na zápas klubu {match.slotTakenBy}.</div>
                ) : (
                  <button onClick={invite} disabled={acting} className="btn btn-primary btn-sm mt-2">Pozvat na zápas</button>
                )}
              </div>
            ) : (
              <div className="text-sm text-muted pt-3 border-t border-gray-100">Žádný domácí zápas, na který by šlo pozvat.</div>
            )}
            {message && <div className="text-sm text-pitch-600">{message}</div>}
            {error && <div className="text-sm text-card-red">{error}</div>}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
