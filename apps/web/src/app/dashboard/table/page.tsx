"use client";

import { useState, useEffect } from "react";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { Spinner, Card, Button } from "@/components/ui";

interface Standing {
  pos: number;
  team: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  gf: number;
  ga: number;
  points: number;
  form: string[];
  isPlayer?: boolean;
}

const FORM_COLORS: Record<string, string> = { W: "bg-pitch-500", D: "bg-card-yellow", L: "bg-card-red" };

export default function TablePage() {
  const { teamId } = useTeam();
  const [leagueName, setLeagueName] = useState("");
  const [standings, setStandings] = useState<Standing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamId) return;
    apiFetch<{ leagueName: string; standings: Standing[] }>(`/api/teams/${teamId}/standings`)
      .then((data) => {
        setLeagueName(data.leagueName);
        setStandings(data.standings);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [teamId]);

  if (loading) return <div className="page-container flex justify-center min-h-[50vh] items-center"><Spinner /></div>;

  return (
    <div className="page-container">
      <h1 className="text-h1 text-pitch-500 mb-1">{leagueName || "Tabulka"}</h1>
      <p className="text-sm text-muted mb-4">{standings.length > 0 ? `${standings[0].played} odehraných kol` : "Zatím žádné zápasy"}</p>

      {standings.length === 0 ? (
        <Card className="p-8 text-center text-muted">
          <p className="text-lg mb-2">Zatím žádné výsledky</p>
          <p className="text-sm mb-4">Odehraj první zápas!</p>
          <a href="/dashboard/match"><Button>Hrát zápas</Button></a>
        </Card>
      ) : (
        <div className="bg-white rounded-card shadow-card overflow-hidden">
          <div className="grid grid-cols-[2rem_1fr_2rem_2rem_2rem_2rem_3rem_2.5rem_4rem] gap-1 px-3 py-2 bg-gray-50 border-b border-gray-200 text-[10px] text-muted font-heading font-bold">
            <div className="text-center">#</div>
            <div>Tým</div>
            <div className="text-center">Z</div>
            <div className="text-center">V</div>
            <div className="text-center">R</div>
            <div className="text-center">P</div>
            <div className="text-center">Skóre</div>
            <div className="text-center font-extrabold">B</div>
            <div className="text-center">Forma</div>
          </div>

          {standings.map((row) => (
            <div key={row.pos} className={`grid grid-cols-[2rem_1fr_2rem_2rem_2rem_2rem_3rem_2.5rem_4rem] gap-1 px-3 py-2.5 border-b border-gray-50 items-center text-xs ${row.isPlayer ? "bg-pitch-500/5 font-bold" : "hover:bg-gray-50"}`}>
              <div className={`text-center font-heading font-bold text-sm ${row.pos <= 2 ? "text-pitch-500" : row.pos >= standings.length ? "text-card-red" : "text-muted"}`}>{row.pos}</div>
              <div className={`truncate ${row.isPlayer ? "text-pitch-600" : ""}`}>{row.team}</div>
              <div className="text-center tabular-nums">{row.played}</div>
              <div className="text-center tabular-nums">{row.wins}</div>
              <div className="text-center tabular-nums">{row.draws}</div>
              <div className="text-center tabular-nums">{row.losses}</div>
              <div className="text-center tabular-nums text-xs">{row.gf}:{row.ga}</div>
              <div className="text-center font-heading font-extrabold tabular-nums">{row.points}</div>
              <div className="flex gap-0.5 justify-center">
                {(row.form ?? []).slice(0, 5).map((f, i) => (
                  <div key={i} className={`w-3.5 h-3.5 rounded-full ${FORM_COLORS[f] ?? "bg-gray-300"} flex items-center justify-center text-white text-[8px] font-bold`}>{f}</div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
