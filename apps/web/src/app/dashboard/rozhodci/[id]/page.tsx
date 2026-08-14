"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useTeam } from "@/context/team-context";
import { Spinner, SectionLabel } from "@/components/ui";
import { FaceAvatar } from "@/components/players/face-avatar";
import {
  REFEREE_AXES, axisWord, axisColor, formatGrade, gradeColor, gradeWord, incidentLabel,
  memoryWord, memoryColor, pocet,
  type RefereeProfileView, type RefereeStatsView, type RefereeIncidentView,
} from "@/lib/referee-info";

interface RecentMatch {
  matchId: string;
  gameWeek: number | null;
  homeName: string;
  awayName: string;
  homeScore: number | null;
  awayScore: number | null;
  grade: number | null;
  incidents: RefereeIncidentView[];
}

interface VsTeam {
  matches: number; wins: number; draws: number; losses: number;
  yellowCards: number; redCards: number;
  penaltiesFor: number; penaltiesAgainst: number;
  incidentsFor: number; incidentsAgainst: number;
  sentiment: number; duvod: string | null; biasPct: number;
}

type Detail = RefereeProfileView & {
  stats: RefereeStatsView;
  recentMatches: RecentMatch[];
  vsTeam: VsTeam | null;
};

export default function RozhodciDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { teamId } = useTeam();
  const [ref, setRef] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const url = teamId ? `/api/referees/${id}?teamId=${teamId}` : `/api/referees/${id}`;
    apiFetch<Detail>(url)
      .then(setRef)
      .catch((e) => console.error("fetch referee:", e))
      .finally(() => setLoading(false));
  }, [id, teamId]);

  if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner size="lg" /></div>;
  if (!ref) return <div className="page-container">Rozhodčí nenalezen.</div>;

  const s = ref.stats;

  return (
    <div className="page-container pb-24">
      <Link href="/dashboard/rozhodci" className="text-sm text-muted hover:underline">← Rozhodčí okresu</Link>

      <div className="card p-4 mt-3">
        <div className="flex items-start gap-3">
          {ref.avatar && (
            <FaceAvatar faceConfig={ref.avatar} size={72} className="border border-ink/20 bg-white shrink-0 rounded-lg" />
          )}
          <div className="min-w-0 flex-1">
            <h1 className="font-heading font-bold text-xl leading-tight">{ref.name}</h1>
            <div className="text-sm text-muted">{ref.archetypeLabel} · {ref.age} let</div>
            <div className="text-sm text-muted">V civilu: {ref.occupation}</div>
          </div>
        </div>
        <p className="text-sm mt-3">{ref.bio}</p>
        {ref.hlaska && <p className="text-sm italic text-muted mt-1">„{ref.hlaska}"</p>}
      </div>

      <SectionLabel>Sezónní bilance</SectionLabel>
      <div className="card p-4">
        {s.matches > 0 ? (
          <>
            {/* Jedna mřížka pro všechno — dvě různé (3 a 4 sloupce) dělaly cikcak. */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Stat label="Průměrná známka" value={formatGrade(s.avgGrade)} className={gradeColor(s.avgGrade)}
                hint={s.avgGrade != null ? gradeWord(s.avgGrade) : undefined} />
              <Stat label="Odpískal" value={`${s.matches}×`} />
              <Stat label="Faulů/zápas" value={formatGrade(s.foulsPerMatch, 1)} />
              <Stat label="Žluté" value={`${s.yellowCards ?? 0}`} />
              <Stat label="Červené" value={`${s.redCards ?? 0}`} />
              <Stat label="Penalty" value={`${s.penalties ?? 0}`} />
              <Stat label="Sporné" value={`${s.incidents ?? 0}`} />
            </div>
          </>
        ) : (
          <p className="text-sm text-muted">V téhle sezóně zatím nepískal.</p>
        )}
      </div>

      <SectionLabel>Povaha</SectionLabel>
      <div className="card p-4 space-y-1.5">
        {REFEREE_AXES.map((axis) => {
          const value = ref[axis.key] as number;
          return (
            <div key={axis.key}>
              <div className="flex items-center gap-2">
                <span className="text-sm w-36 shrink-0">{axis.label}</span>
                <div className="flex-1 h-2 rounded-full bg-ink/10 overflow-hidden">
                  <div className={`h-full rounded-full ${axisColor(value)}`} style={{ width: `${value}%` }} />
                </div>
                <span className="text-sm text-muted w-28 shrink-0 text-right">{axisWord(value)}</span>
              </div>
              <p className="text-sm text-ink-light mt-0.5 mb-2">{axis.popis}</p>
            </div>
          );
        })}
      </div>

      {ref.vsTeam && (
        <>
          <SectionLabel>Vůči tvému týmu</SectionLabel>
          <div className="card p-4">
            {ref.vsTeam.matches > 0 && (
              <>
                <p className="text-sm">
                  Pískal vám <span className="font-heading font-bold">{ref.vsTeam.matches}×</span> —{" "}
                  {pocet(ref.vsTeam.wins, "výhra", "výhry", "výher")},{" "}
                  {pocet(ref.vsTeam.draws, "remíza", "remízy", "remíz")},{" "}
                  {pocet(ref.vsTeam.losses, "prohra", "prohry", "proher")}.
                </p>
                <p className="text-sm text-muted mt-1">
                  Rozdal vám {pocet(ref.vsTeam.yellowCards, "žlutou", "žluté", "žlutých")} a{" "}
                  {pocet(ref.vsTeam.redCards, "červenou", "červené", "červených")} ·
                  penalty {ref.vsTeam.penaltiesFor}:{ref.vsTeam.penaltiesAgainst} pro vás
                  {ref.vsTeam.incidentsAgainst > 0 && ` · ${ref.vsTeam.incidentsAgainst}× sporná situace proti vám`}
                </p>
              </>
            )}
            {ref.vsTeam.sentiment !== 0 && (
              <p className={`text-sm mt-2 ${ref.vsTeam.matches > 0 ? "pt-2 border-t border-ink/10" : ""}`}>
                Co si o vás myslí:{" "}
                <span className={`font-heading font-bold ${memoryColor(ref.vsTeam.sentiment)}`}>
                  {memoryWord(ref.vsTeam.sentiment, "vy")}
                </span>
                <span className="text-muted tabular-nums"> ({ref.vsTeam.sentiment > 0 ? "+" : ""}{ref.vsTeam.sentiment})</span>
                {" — "}hraniční verdikty rozhodne o {ref.vsTeam.biasPct.toFixed(1).replace(".", ",")} % častěji{" "}
                {ref.vsTeam.sentiment < 0 ? "proti vám" : "ve váš prospěch"}.
                {ref.vsTeam.duvod ? ` Důvod: ${ref.vsTeam.duvod}` : ""}
              </p>
            )}
          </div>
        </>
      )}

      <SectionLabel>Známky z jednotlivých zápasů</SectionLabel>
      {ref.recentMatches.length === 0 ? (
        <div className="card p-4"><p className="text-sm text-muted">Zatím žádný odpískaný zápas.</p></div>
      ) : (
        <div className="space-y-2">
          {ref.recentMatches.map((m) => (
            <Link key={m.matchId} href={`/dashboard/match/${m.matchId}`} className="card card-hover p-3 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-heading font-bold text-base truncate">
                  {m.homeName} {m.homeScore}:{m.awayScore} {m.awayName}
                </div>
                <div className="text-sm text-muted truncate">
                  {m.gameWeek != null ? `${m.gameWeek}. kolo` : "Pohár"}
                  {m.incidents.length > 0 && ` · ${incidentLabel(m.incidents[0].kind)}`}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className={`font-heading font-bold text-lg tabular-nums ${gradeColor(m.grade)}`}>
                  {formatGrade(m.grade, 1)}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, className = "", hint }: { label: string; value: string; className?: string; hint?: string }) {
  return (
    <div className="text-center rounded-lg bg-ink/[0.03] py-2 px-1">
      <div className={`font-heading font-bold text-base tabular-nums ${className}`}>{value}</div>
      <div className="text-[11px] text-muted leading-tight">{label}</div>
      {hint && <div className="text-[11px] text-muted leading-tight">{hint}</div>}
    </div>
  );
}
