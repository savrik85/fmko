"use client";

import { useState, useEffect } from "react";
import { useTeam } from "@/context/team-context";
import { apiFetch, type Player } from "@/lib/api";
import { Spinner, Button } from "@/components/ui";
import { SmsRoulette, type SmsMessage } from "@/components/match/sms-roulette";
import { LiveMatch } from "@/components/match/live-match";

type MatchPhase = "loading" | "sms" | "lineup" | "simulating" | "live" | "pub";

interface MatchResult {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  events: Array<{ minute: number; type: string; description: string; commentary?: string; isGoal?: boolean }>;
  commentary: string[];
  absences: Array<{ playerName: string; reason: string; emoji: string; smsText: string }>;
}

export default function MatchPage() {
  const { teamId, teamName } = useTeam();
  const [phase, setPhase] = useState<MatchPhase>("loading");
  const [smsMessages, setSmsMessages] = useState<SmsMessage[]>([]);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);

  // Load absences on mount
  useEffect(() => {
    if (!teamId) return;
    apiFetch<Array<{ id: string; firstName: string; lastName: string; nickname: string; position: string; available: boolean; absence: { reason: string; emoji: string; smsText: string } | null }>>(`/api/teams/${teamId}/absences`)
      .then((data) => {
        const messages: SmsMessage[] = data.map((p) => ({
          playerName: `${p.firstName} ${p.lastName}`,
          nickname: p.nickname || null,
          status: p.available ? "available" as const : "unavailable" as const,
          message: p.available
            ? ["Jasně, tam budu.", "Jo.", "Počítej se mnou.", "\u{1F44D}"][Math.floor(Math.random() * 4)]
            : p.absence?.smsText ?? "Nemůžu.",
          avatarInitial: p.firstName[0],
        }));
        setSmsMessages(messages);
        setPhase("sms");
      })
      .catch(() => {
        // Fallback: load players and treat all as available
        apiFetch<Player[]>(`/api/teams/${teamId}/players`)
          .then((players) => {
            const messages: SmsMessage[] = players.map((p) => ({
              playerName: `${p.first_name} ${p.last_name}`,
              nickname: p.nickname || null,
              status: "available" as const,
              message: ["Jasně, tam budu.", "Jo.", "Počítej se mnou.", "\u{1F44D}"][Math.floor(Math.random() * 4)],
              avatarInitial: p.first_name[0],
            }));
            setSmsMessages(messages);
            setPhase("sms");
          })
          .catch(() => setPhase("sms"));
      });
  }, [teamId]);

  async function handleSimulate() {
    if (!teamId) return;
    setPhase("simulating");

    try {
      const result = await apiFetch<MatchResult>(`/api/teams/${teamId}/simulate-match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tactic: "balanced" }),
      });
      setMatchResult(result);

      // Convert events for LiveMatch
      setPhase("live");
    } catch {
      setPhase("lineup");
    }
  }

  if (phase === "loading") {
    return <div className="flex items-center justify-center min-h-[50vh]"><Spinner /></div>;
  }

  return (
    <div className="h-[calc(100vh-4rem)] sm:h-screen flex flex-col">
      {phase === "sms" && (
        <SmsRoulette
          messages={smsMessages}
          onComplete={() => setPhase("lineup")}
        />
      )}

      {phase === "lineup" && (
        <div className="flex-1 flex flex-col p-6 max-w-lg mx-auto w-full justify-center text-center">
          <h2 className="text-h1 text-pitch-500 mb-2">Sestava připravena</h2>
          <p className="text-muted mb-8">
            {smsMessages.filter((m) => m.status === "available").length} hráčů dostupných
          </p>
          <div className="flex gap-3">
            <Button variant="ghost" size="lg" onClick={() => setPhase("sms")} className="flex-1">Zpět</Button>
            <Button size="lg" onClick={handleSimulate} className="flex-1">Hrát zápas!</Button>
          </div>
        </div>
      )}

      {phase === "simulating" && (
        <div className="flex-1 flex flex-col items-center justify-center">
          <Spinner size="lg" />
          <p className="font-heading font-bold text-pitch-500">Simuluji zápas...</p>
        </div>
      )}

      {phase === "live" && matchResult && (
        <LiveMatch
          homeTeam={matchResult.homeTeam}
          awayTeam={matchResult.awayTeam}
          events={matchResult.commentary.map((text, i) => {
            const ev = matchResult.events[i];
            return {
              minute: ev?.minute ?? i * 6,
              type: ev?.type ?? "special",
              description: text,
              commentary: text,
              isGoal: ev?.type === "goal",
            };
          })}
          onComplete={() => setPhase("pub")}
        />
      )}

      {phase === "pub" && matchResult && (
        <div className="flex-1 bg-amber-950 text-amber-100 p-6 flex flex-col max-w-lg mx-auto w-full">
          <h2 className="text-h1 text-amber-200 mb-1">Hospoda</h2>
          <p className="text-amber-400 text-sm mb-6">Po zápase</p>
          <div className="bg-amber-900/50 rounded-card p-5 text-center mb-6">
            <div className="font-heading font-extrabold text-4xl text-amber-100 tabular-nums">
              {matchResult.homeScore} : {matchResult.awayScore}
            </div>
            <div className="text-amber-400 text-sm mt-1">
              {matchResult.homeTeam} vs {matchResult.awayTeam}
            </div>
            <div className="text-amber-300 font-heading font-bold mt-2">
              {matchResult.homeScore > matchResult.awayScore ? "Výhra!" : matchResult.homeScore < matchResult.awayScore ? "Prohra..." : "Remíza"}
            </div>
          </div>
          <a href="/dashboard" className="w-full py-3 rounded-card bg-amber-700 text-amber-100 font-heading font-bold text-center hover:bg-amber-600 transition-colors mt-auto block">
            Zpět na dashboard
          </a>
        </div>
      )}
    </div>
  );
}
