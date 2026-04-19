"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { SectionLabel, Spinner, Card, CardBody } from "@/components/ui";

interface Challenge {
  id: string;
  challengerName?: string;
  challengedName?: string;
  message: string | null;
  createdAt: string;
  matchId?: string | null;
  matchStatus?: string | null;
  status?: string;
  homeScore?: number;
  awayScore?: number;
}

interface TeamOption {
  id: string;
  name: string;
  village: string;
}

interface ChallengesData {
  incoming: Challenge[];
  outgoing: Challenge[];
  played: Challenge[];
  cooldownDaysLeft: number;
  canChallenge: boolean;
  teams: TeamOption[];
}

export default function FriendlyPage() {
  const { teamId } = useTeam();
  const [data, setData] = useState<ChallengesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  const load = () => {
    if (!teamId) return;
    apiFetch<ChallengesData>(`/api/teams/${teamId}/challenges`)
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, [teamId]);

  const sendChallenge = async (opponentId: string) => {
    if (!teamId || sending) return;
    setSending(opponentId);
    try {
      await apiFetch(`/api/teams/${teamId}/challenge/${opponentId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      setStatus("Výzva odeslána!");
      setTimeout(() => setStatus(""), 3000);
      load();
    } catch (e: any) {
      setStatus(e.message ?? "Chyba");
      setTimeout(() => setStatus(""), 3000);
    }
    setSending(null);
  };

  const acceptChallenge = async (challengeId: string) => {
    if (!teamId || sending) return;
    setSending(challengeId);
    try {
      await apiFetch(`/api/teams/${teamId}/challenge/${challengeId}/accept`, { method: "POST" });
      setStatus("Výzva přijata! Nastav sestavu.");
      setTimeout(() => setStatus(""), 4000);
      load();
    } catch (e: any) {
      setStatus(e.message ?? "Chyba");
      setTimeout(() => setStatus(""), 3000);
    }
    setSending(null);
  };

  const declineChallenge = async (challengeId: string) => {
    if (!teamId || sending) return;
    setSending(challengeId);
    try {
      await apiFetch(`/api/teams/${teamId}/challenge/${challengeId}/decline`, { method: "POST" });
      setStatus("Výzva odmítnuta.");
      setTimeout(() => setStatus(""), 3000);
      load();
    } catch (e: any) {
      setStatus(e.message ?? "Chyba");
    }
    setSending(null);
  };

  if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>;
  if (!data) return <div className="page-container"><div className="text-center text-muted py-8">Chyba načítání</div></div>;

  return (
    <div className="page-container space-y-5">
      {status && <div className="text-sm font-heading font-bold text-pitch-500">{status}</div>}

      {/* Incoming challenges */}
      {data.incoming.length > 0 && (
        <div>
          <SectionLabel>Příchozí výzvy</SectionLabel>
          <div className="space-y-2">
            {data.incoming.map((ch) => (
              <Card key={ch.id}>
                <CardBody>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">⚽</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-heading font-bold text-base">{ch.challengerName}</div>
                      {ch.message && <div className="text-sm text-muted italic">"{ch.message}"</div>}
                      <div className="text-xs text-muted">Přátelský zápas • 1 000 Kč</div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => acceptChallenge(ch.id)} disabled={sending === ch.id}
                        className="px-3 py-1.5 bg-pitch-500 text-white rounded-lg font-heading font-bold text-xs disabled:opacity-50">
                        Přijmout
                      </button>
                      <button onClick={() => declineChallenge(ch.id)} disabled={sending === ch.id}
                        className="px-3 py-1.5 bg-gray-200 text-ink rounded-lg font-heading font-bold text-xs disabled:opacity-50">
                        Odmítnout
                      </button>
                    </div>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Outgoing challenges */}
      {data.outgoing.length > 0 && (
        <div>
          <SectionLabel>Odeslané výzvy</SectionLabel>
          <div className="space-y-2">
            {data.outgoing.map((ch) => {
              const isAccepted = ch.status === "accepted";
              return (
                <Card key={ch.id}>
                  <CardBody>
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{isAccepted ? "✅" : "📨"}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-heading font-bold text-base">{ch.challengedName}</div>
                        <div className={`text-xs ${isAccepted ? "text-pitch-600 font-bold" : "text-muted"}`}>
                          {isAccepted ? "Přijato! Nastav sestavu." : "Čeká na odpověď"}
                        </div>
                      </div>
                      {isAccepted && ch.matchId && (
                        <Link href={`/dashboard/match?calendarId=${ch.matchId}`}
                          className="px-3 py-1.5 bg-pitch-500 text-white rounded-lg font-heading font-bold text-xs shrink-0">
                          Sestava ▶
                        </Link>
                      )}
                    </div>
                  </CardBody>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Send challenge */}
      <div>
        <SectionLabel>Vyzvat soupeře</SectionLabel>
        {!data.canChallenge ? (
          <div className="text-sm text-muted">Cooldown: ještě {data.cooldownDaysLeft} {data.cooldownDaysLeft === 1 ? "den" : "dny"}</div>
        ) : (
          <div className="space-y-2">
            {data.teams.map((t) => (
              <Card key={t.id}>
                <CardBody>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-heading font-bold text-base">{t.name}</div>
                      <div className="text-xs text-muted">{t.village}</div>
                    </div>
                    <button onClick={() => sendChallenge(t.id)} disabled={sending === t.id}
                      className="px-3 py-1.5 bg-pitch-500 text-white rounded-lg font-heading font-bold text-xs disabled:opacity-50 shrink-0">
                      Vyzvat ⚽
                    </button>
                  </div>
                </CardBody>
              </Card>
            ))}
            {data.teams.length === 0 && (
              <div className="text-sm text-muted">Žádní další hráčští manažeři v lize.</div>
            )}
          </div>
        )}
      </div>

      {/* Played friendlies */}
      {data.played.length > 0 && (
        <div>
          <SectionLabel>Odehrané přáteláky</SectionLabel>
          <div className="space-y-2">
            {data.played.map((ch) => (
              <Card key={ch.id}>
                <CardBody>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">🏆</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-heading font-bold text-sm">
                        {ch.challengerName} {ch.homeScore}:{ch.awayScore} {ch.challengedName}
                      </div>
                    </div>
                    {ch.matchId && (
                      <Link href={`/dashboard/match/${ch.matchId}/replay`}
                        className="text-xs text-pitch-600 hover:underline shrink-0">
                        Replay ▶
                      </Link>
                    )}
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
