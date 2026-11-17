"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { SectionLabel, ListCard, ListRow, ListEmpty, StatusChip } from "@/components/ui";
import { FaceAvatar } from "@/components/players/face-avatar";
import { CoachName } from "@/components/manager/coach-name";

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
    /** Trenér AI klubu: k jménu patří odznak s robotem. */
    coach_is_ai?: boolean;
    manager_avatar: Record<string, unknown> | null;
    answer: "ano" | "ne";
  }>;
}

function formatDate(val: string | null | undefined): string {
  if (!val) return "-";
  const d = new Date(val.endsWith("Z") ? val : val + "Z");
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleString("cs", { day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function VoteRow({ vote, teamId, token, onVoted }: { vote: Vote; teamId: string | null; token: string | null; onVoted: () => void }) {
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
    <ListRow
      title={vote.title}
      detail={<>
        {/* Štítek pod názvem, ne vpravo: vedle dlouhé otázky by ji usekl. */}
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
          <StatusChip tone={vote.status === "open" ? "ok" : "neutral"}>
            {vote.status === "open" ? "🟢 Probíhá" : "⚫ Ukončeno"}
          </StatusChip>
        </span>

        {vote.description && (
          <span className="block mt-2 text-muted leading-relaxed">{vote.description}</span>
        )}

        {/* Progress bary */}
        <span className="block space-y-2 mt-3">
          {/* ANO */}
          <span className="block">
            <span className="flex justify-between text-sm mb-1">
              <span className={`font-heading font-bold ${vote.my_answer === "ano" ? "text-pitch-600" : "text-ink"}`}>
                ANO {vote.my_answer === "ano" && "✓"}
              </span>
              <span className="text-muted tabular-nums">{vote.ano_count} hlasů · {anoPercent}%</span>
            </span>
            <span className="block h-2 bg-gray-100 rounded-full overflow-hidden">
              <span
                className="block h-full bg-pitch-400 rounded-full transition-all duration-500"
                style={{ width: `${anoPercent}%` }}
              />
            </span>
          </span>
          {/* NE */}
          <span className="block">
            <span className="flex justify-between text-sm mb-1">
              <span className={`font-heading font-bold ${vote.my_answer === "ne" ? "text-card-red" : "text-ink"}`}>
                NE {vote.my_answer === "ne" && "✓"}
              </span>
              <span className="text-muted tabular-nums">{vote.ne_count} hlasů · {nePercent}%</span>
            </span>
            <span className="block h-2 bg-gray-100 rounded-full overflow-hidden">
              <span
                className="block h-full bg-card-red rounded-full transition-all duration-500"
                style={{ width: `${nePercent}%` }}
              />
            </span>
          </span>
        </span>

        {/* Hlasující týmy: pás portrétů s odkazy, proto řádek sám odkazem není. */}
        {vote.voters.length > 0 && (
          <span className="block space-y-3 mt-3">
            {(["ano", "ne"] as const).map((side) => {
              const group = vote.voters.filter((v) => v.answer === side);
              if (group.length === 0) return null;
              return (
                <span key={side} className="flex items-start gap-2 flex-wrap">
                  <span className={`text-micro font-heading font-bold uppercase tracking-wide w-7 shrink-0 mt-1 ${side === "ano" ? "text-pitch-500" : "text-card-red"}`}>
                    {side}
                  </span>
                  {group.map((voter) => (
                    <Link
                      key={voter.team_id}
                      href={`/tym/${voter.team_id}`}
                      className="flex flex-col items-center gap-0.5 w-14 hover:opacity-80 active:scale-95 transition-all"
                    >
                      {voter.manager_avatar && Object.keys(voter.manager_avatar).length > 2 ? (
                        <FaceAvatar faceConfig={voter.manager_avatar} size={36} className="rounded-full" />
                      ) : (
                        <span className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-500">
                          {(voter.manager_name ?? voter.team_name)[0]}
                        </span>
                      )}
                      <span className="text-micro text-muted text-center leading-tight line-clamp-1 w-full">{voter.manager_name ? <CoachName name={voter.manager_name} isAi={voter.coach_is_ai === true} /> : "-"}</span>
                      <span className="text-micro font-heading font-bold text-ink text-center leading-tight line-clamp-2 w-full">{voter.team_name}</span>
                    </Link>
                  ))}
                </span>
              );
            })}
          </span>
        )}

        {/* Footer */}
        <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mt-3">
          <span className="text-xs text-muted">
            Hlasovalo {total} z {vote.total_teams} týmů
            {vote.status === "closed" && vote.closed_at && (
              <span> · Ukončeno {formatDate(vote.closed_at)}</span>
            )}
          </span>

          {canVote && (
            <span className="flex gap-2 shrink-0">
              <button
                onClick={() => castVote("ano")}
                disabled={voting}
                className="px-4 py-1.5 bg-pitch-500 text-white rounded-soft font-heading font-bold text-sm hover:bg-pitch-600 disabled:opacity-50 transition-colors"
              >
                ANO
              </button>
              <button
                onClick={() => castVote("ne")}
                disabled={voting}
                className="px-4 py-1.5 bg-card-red text-white rounded-soft font-heading font-bold text-sm hover:opacity-80 disabled:opacity-50 transition-colors"
              >
                NE
              </button>
            </span>
          )}

          {vote.my_answer !== null && vote.status === "open" && (
            <span className="text-xs font-heading font-bold text-pitch-500 shrink-0">Hlasoval jsi</span>
          )}
        </span>
      </>} />
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
        <ListCard>
          <ListEmpty icon="🗳️">Žádná usnesení Sněmu zatím neprobíhají.</ListEmpty>
        </ListCard>
      )}

      {/* Bez vlastního nadpisu: nad seznamem je nadpis stránky. */}
      {openVotes.length > 0 && (
        <ListCard>
          {openVotes.map((v) => (
            <VoteRow key={v.id} vote={v} teamId={teamId} token={token} onVoted={loadVotes} />
          ))}
        </ListCard>
      )}

      {closedVotes.length > 0 && (
        <ListCard title="Archiv ukončených sněmů">
          {closedVotes.map((v) => (
            <VoteRow key={v.id} vote={v} teamId={teamId} token={token} onVoted={loadVotes} />
          ))}
        </ListCard>
      )}
    </div>
  );
}
