"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useTeam } from "@/context/team-context";
import { Spinner, SectionLabel } from "@/components/ui";
import { FaceAvatar } from "@/components/players/face-avatar";
import {
  formatGrade, gradeColor, gradeWord,
  type RefereeProfileView, type RefereeStatsView,
} from "@/lib/referee-info";

type RefereeRow = RefereeProfileView & { stats: RefereeStatsView };

export default function RozhodciPage() {
  const { teamId } = useTeam();
  const [rows, setRows] = useState<RefereeRow[]>([]);
  const [district, setDistrict] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamId) return;
    apiFetch<{ district: string; referees: RefereeRow[] }>(`/api/teams/${teamId}/referees`)
      .then((d) => { setDistrict(d.district); setRows(d.referees ?? []); })
      .catch((e) => console.error("fetch referees:", e))
      .finally(() => setLoading(false));
  }, [teamId]);

  if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner size="lg" /></div>;

  const odpiskali = rows.filter((r) => r.stats.matches > 0);

  return (
    <div className="page-container pb-24">
      <h1 className="font-heading font-bold text-2xl mb-1">Rozhodčí</h1>
      <p className="text-sm text-muted mb-4">
        Komise rozhodčích okresu {district || "—"}. Známka 1–5 se počítá za každý odpískaný zápas
        podle toho, jak ho sudí zvládl — čím níž v tabulce, tím hůř.
      </p>

      {odpiskali.length === 0 && (
        <div className="card p-4 mb-4">
          <p className="text-sm">
            Zatím nikdo z nich nepískal. Známky se objeví po prvním odehraném kole.
          </p>
        </div>
      )}

      <SectionLabel>Pořadí podle průměrné známky</SectionLabel>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <Link
            key={r.id}
            href={`/dashboard/rozhodci/${r.id}`}
            className="card card-hover p-3 flex items-center gap-3"
          >
            <span className="font-heading font-bold text-base text-muted w-6 text-right tabular-nums shrink-0">
              {r.stats.matches > 0 ? i + 1 : "–"}
            </span>
            {r.avatar && (
              <FaceAvatar faceConfig={r.avatar} size={40} className="border border-ink/20 bg-white shrink-0 rounded-soft" />
            )}
            <div className="min-w-0 flex-1">
              <div className="font-heading font-bold text-base truncate">{r.name}</div>
              {/* Doplňková čísla pod jméno — v tabulce na mobilu by přetekla */}
              <div className="text-sm text-muted truncate">
                {r.archetypeLabel}
                {r.stats.matches > 0 && (
                  <>
                    {" · "}{r.stats.matches}× · {formatGrade(r.stats.cardsPerMatch, 1)} karty
                    {r.stats.incidents ? ` · ${r.stats.incidents}× sporná situace` : ""}
                  </>
                )}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className={`font-heading font-bold text-lg tabular-nums ${gradeColor(r.stats.avgGrade)}`}>
                {formatGrade(r.stats.avgGrade)}
              </div>
              <div className="text-micro text-muted leading-tight">
                {r.stats.avgGrade != null ? gradeWord(r.stats.avgGrade) : "nepískal"}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
