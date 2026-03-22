"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { Spinner, SectionLabel, Button } from "@/components/ui";

interface Standing {
  pos: number;
  teamId: string | null;
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

const FORM_COLORS: Record<string, string> = {
  W: "bg-pitch-400",
  D: "bg-gold-500",
  L: "bg-card-red",
};

const FORM_LABELS: Record<string, string> = {
  W: "V",
  D: "R",
  L: "P",
};

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

  const maxPlayed = Math.max(...standings.map((s) => s.played), 0);

  return (
    <div className="page-container">
      <h1 className="text-h1 text-pitch-500 mb-1">{leagueName || "Tabulka"}</h1>
      <p className="text-base text-muted mb-5">
        {maxPlayed > 0 ? `${maxPlayed} odehraných kol` : "Zatím žádné zápasy"}
      </p>

      {standings.length === 0 ? (
        <div className="card p-8 text-center text-muted">
          <p className="text-lg mb-2">Zatím žádné výsledky</p>
          <p className="text-base mb-4">Odehraj první zápas!</p>
          <a href="/dashboard/match"><Button>Hrát zápas</Button></a>
        </div>
      ) : (
        <div className="card overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[2.5rem_1fr_3rem_3rem_3rem_3rem_4.5rem_3.5rem_7.5rem] gap-0 px-4 py-2.5 border-b border-gray-200">
            <div className="text-label text-center">#</div>
            <div className="text-label">Tým</div>
            <div className="text-label text-center">Z</div>
            <div className="text-label text-center">V</div>
            <div className="text-label text-center">R</div>
            <div className="text-label text-center">P</div>
            <div className="text-label text-center">Skóre</div>
            <div className="text-label text-center">B</div>
            <div className="text-label text-center">Forma</div>
          </div>

          {/* Rows */}
          {standings.map((row) => {
            const teamName = row.teamId ? (
              <Link href={`/dashboard/team/${row.teamId}`} className="entity-link">
                {row.team}
              </Link>
            ) : (
              <span>{row.team}</span>
            );

            return (
              <div
                key={row.pos}
                className={`grid grid-cols-[2.5rem_1fr_3rem_3rem_3rem_3rem_4.5rem_3.5rem_7.5rem] gap-0 px-4 py-4 border-b border-gray-200 items-center transition-colors ${
                  row.isPlayer ? "bg-pitch-50/50" : "hover:bg-gray-50/50"
                }`}
              >
                {/* Position */}
                <div className={`text-center font-heading font-bold tabular-nums ${
                  row.pos === 1 ? "text-gold-500" : row.pos <= 2 ? "text-pitch-500" : row.pos >= standings.length ? "text-card-red" : "text-muted"
                }`}>
                  {row.pos}
                </div>

                {/* Team name */}
                <div className={`font-heading font-bold text-base truncate ${row.isPlayer ? "text-pitch-600" : ""}`}>
                  {teamName}
                </div>

                {/* Stats */}
                <div className="text-center tabular-nums text-base text-muted">{row.played}</div>
                <div className="text-center tabular-nums text-base">{row.wins}</div>
                <div className="text-center tabular-nums text-base">{row.draws}</div>
                <div className="text-center tabular-nums text-base">{row.losses}</div>
                <div className="text-center tabular-nums text-base">{row.gf}:{row.ga}</div>

                {/* Points — prominent */}
                <div className="text-center font-heading font-[800] tabular-nums text-xl">
                  {row.points}
                </div>

                {/* Form */}
                <div className="flex gap-1 justify-center">
                  {(row.form ?? []).slice(0, 5).map((f, i) => (
                    <div
                      key={i}
                      className={`w-6 h-6 rounded-full ${FORM_COLORS[f] ?? "bg-gray-200"} flex items-center justify-center text-white text-[10px] font-bold leading-none`}
                    >
                      {FORM_LABELS[f] ?? f}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
