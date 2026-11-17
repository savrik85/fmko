"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useTeam } from "@/context/team-context";
import { SectionLabel, Tabs, useTabParam, ListCard, ListRow, RowValue, PageLoading } from "@/components/ui";
import { FaceAvatar } from "@/components/players/face-avatar";
import { DisciplinaryPanel } from "@/components/referees/disciplinary-panel";
import {
  formatGrade, gradeColor, gradeWord,
  type RefereeProfileView, type RefereeStatsView,
} from "@/lib/referee-info";

type RefereeRow = RefereeProfileView & { stats: RefereeStatsView };

const ZALOZKY = ["komise", "disciplinarka"] as const;
type Zalozka = (typeof ZALOZKY)[number];

export default function RozhodciPage() {
  const { teamId } = useTeam();
  const [tab, setTab] = useTabParam<Zalozka>(ZALOZKY);
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

  if (loading) return <PageLoading />;

  const odpiskali = rows.filter((r) => r.stats.matches > 0);

  return (
    <div className="page-container pb-24">
      <h1 className="font-heading font-bold text-2xl mb-3">Rozhodčí</h1>

      <Tabs
        items={[
          { key: "komise", label: "Rozhodčí", icon: "\u{1F3C3}" },
          { key: "disciplinarka", label: "Disciplinárka", icon: "⚖️" },
        ]}
        value={tab}
        onChange={setTab}
        ariaLabel="Sekce komise"
        className="mb-4"
      />

      {tab === "disciplinarka" ? (
        <DisciplinaryPanel teamId={teamId} />
      ) : (
      <>
      <p className="text-sm text-muted mb-4">
        Komise rozhodčích okresu {district || "-"}. Známka 1–5 se počítá za každý odpískaný zápas
        podle toho, jak ho sudí zvládl, čím níž v tabulce, tím hůř.
      </p>

      {odpiskali.length === 0 && (
        <div className="card p-4 mb-4">
          <p className="text-sm">
            Zatím nikdo z nich nepískal. Známky se objeví po prvním odehraném kole.
          </p>
        </div>
      )}

      <ListCard title="Pořadí podle průměrné známky" count={rows.length}>
        {rows.map((r, i) => (
          <ListRow key={r.id} href={`/rozhodci/${r.id}`}
            leading={r.avatar
              ? <FaceAvatar faceConfig={r.avatar} size={30} className="border border-ink/20 bg-white rounded-full" />
              : <span className="text-body font-bold text-muted tabular-nums">{r.stats.matches > 0 ? i + 1 : "–"}</span>}
            title={<>{r.stats.matches > 0 && <span className="text-muted font-normal tabular-nums mr-1.5">{i + 1}.</span>}{r.name}</>}
            meta={[r.archetypeLabel, r.stats.matches > 0 ? `${r.stats.matches}× · ${formatGrade(r.stats.cardsPerMatch, 1)} karty` : null,
              r.stats.incidents ? `${r.stats.incidents}× sporná situace` : null].filter(Boolean).join(" · ")}
            trailing={
              <RowValue sub={r.stats.avgGrade != null ? gradeWord(r.stats.avgGrade) : "nepískal"}>
                <span className={gradeColor(r.stats.avgGrade)}>{formatGrade(r.stats.avgGrade)}</span>
              </RowValue>
            } />
        ))}
      </ListCard>
      </>
      )}
    </div>
  );
}
