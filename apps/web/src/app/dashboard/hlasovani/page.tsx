"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { SectionLabel } from "@/components/ui";
import { FaceAvatar } from "@/components/players/face-avatar";

interface Vote {
  id: string;
  title: string;
  description: string | null;
  status: "open" | "closed";
  created_at: string;
  closed_at: string | null;
  ano_count: number;
  ne_count: number;
  total_teams: number;
  my_answer: "ano" | "ne" | null;
  voters: Array<{
    team_id: string;
    team_name: string;
    manager_name: string | null;
    manager_avatar: Record<string, unknown> | null;
    answer: "ano" | "ne";
  }>;
}

function formatDate(val: string | null | undefined): string {
  if (!val) return "—";
  const d = new Date(val.endsWith("Z") ? val : val + "Z");
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("cs", { day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function VoteCard({ vote, teamId, token, onVoted }: { vote: Vote; teamId: string | null; token: string | null; onVoted: () => void }) {
  const [voting, setVoting] = useState(false);

  const total = vote.ano_count + vote.ne_count;
  const anoPercent = total > 0 ? Math.round((vote.ano_count / total) * 100) : 0;
  const nePercent = total > 0 ? Math.round((vote.ne_count / total) * 100) : 0;

  const castVote = async (answer: "ano" | "ne") => {
    if (!teamId || !token || voting) return;
    setVoting(true);
    try {
      await apiFetch(`/api/teams/${teamId}/votes/${vote.id}/ballot`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ answer }),
      });
      onVoted();
    } catch (e) {
      console.error("Chyba při hlasování:", e);
    }
    setVoting(false);
  };

  const canVote = vote.status === "open" && vote.my_answer === null && teamId !== null;

  return (
    <div className="card p-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <h3 className="font-heading font-bold text-base leading-tight">{vote.title}</h3>
        <span className={`shrink-0 text-xs font-heading font-bold px-2 py-0.5 rounded-full ${
          vote.status === "open"
            ? "bg-pitch-50 text-pitch-600"
            : "bg-gray-100 text-gray-500"
        }`}>
          {vote.status === "open" ? "🟢 Probíhá" : "⚫ Ukončeno"}
        </span>
      </div>

      {vote.description && (
        <p className="text-sm text-muted mb-4 leading-relaxed">{vote.description}</p>
      )}

      {/* Progress bary */}
      <div className="space-y-2 mb-4">
        {/* ANO */}
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className={`font-heading font-bold ${vote.my_answer === "ano" ? "text-pitch-600" : ""}`}>
              ANO {vote.my_answer === "ano" && "✓"}
            </span>
            <span className="text-muted tabular-nums">{vote.ano_count} hlasů · {anoPercent}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-pitch-400 rounded-full transition-all duration-500"
              style={{ width: `${anoPercent}%` }}
            />
          </div>
        </div>
        {/* NE */}
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className={`font-heading font-bold ${vote.my_answer === "ne" ? "text-card-red" : ""}`}>
              NE {vote.my_answer === "ne" && "✓"}
            </span>
            <span className="text-muted tabular-nums">{vote.ne_count} hlasů · {nePercent}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-card-red rounded-full transition-all duration-500"
              style={{ width: `${nePercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Hlasující týmy */}
      {vote.voters.length > 0 && (
        <div className="space-y-2 mb-4 pt-1">
          {(["ano", "ne"] as const).map((side) => {
            const group = vote.voters.filter((v) => v.answer === side);
            if (group.length === 0) return null;
            return (
              <div key={side} className="flex items-center gap-2 flex-wrap">
                <span className={`text-[11px] font-heading font-bold uppercase tracking-wide w-7 shrink-0 ${side === "ano" ? "text-pitch-500" : "text-card-red"}`}>
                  {side}
                </span>
                {group.map((voter) => (
                  <Link
                    key={voter.team_id}
                    href={`/dashboard/team/${voter.team_id}`}
                    title={voter.manager_name ?? voter.team_name}
                    className="transition-transform hover:scale-110 active:scale-95"
                  >
                    {voter.manager_avatar && Object.keys(voter.manager_avatar).length > 2 ? (
                      <FaceAvatar faceConfig={voter.manager_avatar} size={36} className="rounded-full" />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-500">
                        {(voter.manager_name ?? voter.team_name)[0]}
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted">
          Hlasovalo {total} z {vote.total_teams} týmů
          {vote.status === "closed" && vote.closed_at && (
            <span> · Ukončeno {formatDate(vote.closed_at)}</span>
          )}
        </span>

        {canVote && (
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => castVote("ano")}
              disabled={voting}
              className="px-4 py-1.5 bg-pitch-500 text-white rounded-lg font-heading font-bold text-sm hover:bg-pitch-600 disabled:opacity-50 transition-colors"
            >
              ANO
            </button>
            <button
              onClick={() => castVote("ne")}
              disabled={voting}
              className="px-4 py-1.5 bg-card-red text-white rounded-lg font-heading font-bold text-sm hover:opacity-80 disabled:opacity-50 transition-colors"
            >
              NE
            </button>
          </div>
        )}

        {vote.my_answer !== null && vote.status === "open" && (
          <span className="text-xs font-heading font-bold text-pitch-500 shrink-0">Hlasoval jsi</span>
        )}
      </div>
    </div>
  );
}

export default function HlasovaniPage() {
  const { teamId, token } = useTeam();
  const [votes, setVotes] = useState<Vote[]>([]);
  const [loading, setLoading] = useState(true);

  const loadVotes = useCallback(async () => {
    try {
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const data = await apiFetch<Vote[]>("/api/votes", { headers });
      setVotes(data);
    } catch (e) {
      console.error("Chyba při načítání hlasování:", e);
    }
    setLoading(false);
  }, [token]);

  useEffect(() => { loadVotes(); }, [loadVotes]);

  const openVotes = votes.filter((v) => v.status === "open");
  const closedVotes = votes.filter((v) => v.status === "closed");

  if (loading) {
    return (
      <div className="page-container">
        <div className="card p-8 text-center text-muted text-sm">Načítám sněm…</div>
      </div>
    );
  }

  return (
    <div className="page-container space-y-5">
      <SectionLabel>Sněm Pralesu</SectionLabel>

      {openVotes.length === 0 && closedVotes.length === 0 && (
        <div className="card p-8 text-center text-muted text-sm">
          Žádná usnesení Sněmu zatím neprobíhají.
        </div>
      )}

      {openVotes.length > 0 && (
        <div className="space-y-4">
          {openVotes.map((v) => (
            <VoteCard key={v.id} vote={v} teamId={teamId} token={token} onVoted={loadVotes} />
          ))}
        </div>
      )}

      {closedVotes.length > 0 && (
        <>
          <SectionLabel>Archiv ukončených sněmů</SectionLabel>
          <div className="space-y-4">
            {closedVotes.map((v) => (
              <VoteCard key={v.id} vote={v} teamId={teamId} token={token} onVoted={loadVotes} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
