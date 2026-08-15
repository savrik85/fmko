"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { apiFetch, showError } from "@/lib/api";
import { Spinner, SectionLabel } from "@/components/ui";

interface CupSquadPlayer { name: string; position: string; rating: number; age: number; condition: number; morale: number; suspended: boolean }
interface CupTeamMatch {
  round: number; roundName: string; status: string;
  homeName: string; awayName: string;
  homeScore: number | null; awayScore: number | null; homePens: number | null; awayPens: number | null;
  won: boolean; isHome: boolean;
}
interface CupTeamDetail {
  team: { cupTeamId: string; teamId: string | null; name: string; strength: number; isBig: boolean; color: string | null; eliminatedRound: number | null; alive: boolean };
  squad: CupSquadPlayer[];
  matches: CupTeamMatch[];
}

const POS_LABEL: Record<string, string> = { GK: "BR", DEF: "OB", MID: "ZÁ", FWD: "ÚT" };

function strengthColor(s: number): string {
  if (s >= 55) return "bg-card-red/10 text-card-red";
  if (s >= 42) return "bg-amber-50 text-amber-700";
  return "bg-pitch-50 text-pitch-600";
}
function strengthLabel(s: number): string {
  if (s >= 60) return "velmi silný soupeř";
  if (s >= 50) return "silný soupeř";
  if (s >= 40) return "vyrovnaný soupeř";
  if (s >= 25) return "slabší soupeř";
  return "vyloženě slabý soupeř";
}
function initials(name: string): string {
  return name.split(" ").filter((w) => w[0] === w[0]?.toUpperCase()).slice(0, 2).map((w) => w[0]).join("");
}

export default function CupTeamDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { teamId } = useTeam();
  const [data, setData] = useState<CupTeamDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamId || !params.id) return;
    apiFetch<CupTeamDetail>(`/api/teams/${teamId}/cup/team/${params.id}`)
      .then(setData)
      .catch((e) => { console.error("fetch cup team:", e); showError("Pohár", "Pohárový tým se nepodařilo načíst"); })
      .finally(() => setLoading(false));
  }, [teamId, params.id]);

  if (loading) return <div className="flex items-center justify-center min-h-[50vh]"><Spinner size="lg" /></div>;
  if (!data?.team) return <div className="page-container py-10 text-center text-muted">Pohárový tým nenalezen.</div>;

  const t = data.team;

  return (
    <div className="page-container py-6 space-y-6">
      <button onClick={() => router.back()} className="text-sm text-muted hover:text-ink">← Zpět na pohár</button>

      {/* Hlavička týmu */}
      <div className="card p-5 flex items-center gap-4">
        <span className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-heading font-bold text-white shrink-0" style={{ background: t.color || "#9aa18c" }}>
          {initials(t.name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className={`text-2xl font-heading font-bold ${t.isBig ? "italic" : ""}`}>
            {t.teamId ? <Link href={`/dashboard/team/${t.teamId}`} className="hover:underline">{t.name}</Link> : t.name}
          </div>
          <div className="text-sm text-muted mt-0.5">
            {t.isBig ? "Velkoklub — hostující tým v poháru" : t.teamId ? "Ligový tým" : "Amatérský tým z předkola"}
            {" · "}
            {t.alive ? <span className="text-pitch-600 font-bold">stále ve hře</span> : <span className="text-card-red">vyřazen</span>}
          </div>
        </div>
        <div className="text-center shrink-0">
          <div className={`text-2xl font-heading font-[800] tabular-nums px-3 py-1.5 rounded-soft ${strengthColor(t.strength)}`}>{t.strength}</div>
          <div className="text-xs text-muted mt-1">{strengthLabel(t.strength)}</div>
        </div>
      </div>

      {/* Cesta pohárem */}
      {data.matches.length > 0 && (
        <div>
          <SectionLabel>Cesta pohárem</SectionLabel>
          <div className="card mt-2">
            {data.matches.map((m, i) => {
              const sim = m.status === "simulated" && m.homeScore != null;
              return (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 last:border-b-0">
                  <span className="text-xs text-muted shrink-0 w-24">{m.roundName}</span>
                  <span className="flex-1 min-w-0 text-sm truncate">{m.homeName} <span className="text-muted">vs</span> {m.awayName}</span>
                  {sim ? (
                    <>
                      <span className="font-heading font-bold text-sm tabular-nums shrink-0">
                        {m.homeScore}:{m.awayScore}{m.homePens != null ? <span className="text-muted text-xs"> (p {m.homePens}:{m.awayPens})</span> : null}
                      </span>
                      <span className={`shrink-0 text-xs font-heading font-bold px-1.5 py-0.5 rounded ${m.won ? "bg-pitch-50 text-pitch-600" : "bg-card-red/10 text-card-red"}`}>{m.won ? "POSTUP" : "KONEC"}</span>
                    </>
                  ) : (
                    <span className="text-xs text-muted shrink-0">naplánováno</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Soupiska */}
      <div>
        <SectionLabel>Soupiska</SectionLabel>
        {data.squad.length > 0 ? (
          <div className="card mt-2 overflow-x-auto table-scroll">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted uppercase font-heading">
                  <th className="text-left px-4 py-2 w-10">Poz</th>
                  <th className="text-left px-2 py-2">Hráč</th>
                  <th className="text-right px-2 py-2">Věk</th>
                  <th className="text-right px-2 py-2">Rating</th>
                  <th className="text-right px-2 py-2">Kondice</th>
                  <th className="text-right px-4 py-2">Morálka</th>
                </tr>
              </thead>
              <tbody>
                {data.squad.map((p, i) => (
                  <tr key={i} className="border-t border-gray-50">
                    <td className="px-4 py-1.5 text-xs font-heading font-bold text-muted">{POS_LABEL[p.position] ?? p.position}</td>
                    <td className="px-2 py-1.5 font-bold text-base">{p.name}{p.suspended && <span className="ml-2 text-xs text-card-red">🟥 trest</span>}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{p.age}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-heading font-bold">{p.rating}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{p.condition}</td>
                    <td className="px-4 py-1.5 text-right tabular-nums">{p.morale}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="card mt-2 p-4 text-sm text-muted">
            {t.isBig
              ? "Soupiska velkoklubu se teprve chystá — vygeneruje se před jeho vstupem do poháru."
              : t.teamId
                ? "Ligový tým — kompletní kádr najdeš na jeho klubové stránce."
                : `Amatérský tým z předkola nemá soupisku — hraje se silou ${t.strength}.`}
          </div>
        )}
      </div>
    </div>
  );
}
