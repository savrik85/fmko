"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useTeam } from "@/context/team-context";
import { Spinner, SectionLabel, EntityLink } from "@/components/ui";

interface Fine {
  id: string;
  teamId: string;
  teamName: string;
  kind: "rozhovor" | "svaz";
  amount: number;
  reason: string;
  gameDate: string;
  createdAt: string;
}

/** Herní datum bez času — pokuta se váže ke dni, ne k minutě zaúčtování. */
function denPokuty(gameDate: string): string {
  const d = new Date(gameDate);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("cs", { day: "numeric", month: "numeric", year: "numeric" });
}

export default function DisciplinarkaPage() {
  const { teamId } = useTeam();
  const [fines, setFines] = useState<Fine[]>([]);
  const [district, setDistrict] = useState("");
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamId) return;
    apiFetch<{ district: string; fines: Fine[]; total: number }>(`/api/teams/${teamId}/disciplinary`)
      .then((d) => { setDistrict(d.district); setFines(d.fines ?? []); setTotal(d.total ?? 0); })
      .catch((e) => console.error("fetch disciplinary:", e))
      .finally(() => setLoading(false));
  }, [teamId]);

  if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner size="lg" /></div>;

  // Kolik zaplatil který klub — trestní rejstřík okresu je zajímavější než samotný seznam.
  const podleTymu = Object.values(
    fines.reduce<Record<string, { teamId: string; teamName: string; count: number; sum: number }>>((acc, f) => {
      const zaznam = acc[f.teamId] ?? { teamId: f.teamId, teamName: f.teamName, count: 0, sum: 0 };
      zaznam.count += 1;
      zaznam.sum += f.amount;
      acc[f.teamId] = zaznam;
      return acc;
    }, {}),
  ).sort((a, b) => b.sum - a.sum);

  return (
    <div className="page-container pb-24">
      <h1 className="font-heading font-bold text-2xl mb-1">Disciplinární komise</h1>
      <p className="text-sm text-muted mb-4">
        Pokuty udělené klubům okresu {district || "—"}. Komise trestá výroky o rozhodčích
        v okresním zpravodaji, svaz pak administrativní prohřešky kolem zápasu.
      </p>

      <Link href="/dashboard/rozhodci" className="card card-hover p-3 mb-4 flex items-center gap-2">
        <span className="text-base">⚖️</span>
        <span className="font-heading font-bold text-base">Zpět na komisi rozhodčích</span>
      </Link>

      {fines.length === 0 ? (
        <div className="card p-4">
          <p className="text-sm">
            Zatím žádná pokuta. Komise se ozve, až někdo v novinách přestřelí s kritikou sudího.
          </p>
        </div>
      ) : (
        <>
          <div className="card p-3 mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm text-muted">Uloženo celkem</div>
              <div className="font-heading font-bold text-lg tabular-nums">
                {total.toLocaleString("cs")} Kč
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-muted">Případů</div>
              <div className="font-heading font-bold text-lg tabular-nums">{fines.length}</div>
            </div>
          </div>

          <SectionLabel>Kdo zaplatil nejvíc</SectionLabel>
          <div className="space-y-2 mb-6">
            {podleTymu.map((t) => (
              <div key={t.teamId} className="card p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <EntityLink type="team" id={t.teamId} className="font-heading font-bold text-base">
                    {t.teamName}
                  </EntityLink>
                  <div className="text-sm text-muted">
                    {t.count}× {t.count === 1 ? "pokuta" : t.count < 5 ? "pokuty" : "pokut"}
                  </div>
                </div>
                <div className="font-heading font-bold text-base tabular-nums text-card-red shrink-0">
                  −{t.sum.toLocaleString("cs")} Kč
                </div>
              </div>
            ))}
          </div>

          <SectionLabel>Listina pokut</SectionLabel>
          <div className="space-y-2">
            {fines.map((f) => (
              <div key={f.id} className="card p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <EntityLink type="team" id={f.teamId} className="font-heading font-bold text-base">
                      {f.teamName}
                    </EntityLink>
                    <div className="text-sm text-muted">
                      {denPokuty(f.gameDate)}
                      {" · "}
                      {f.kind === "rozhovor" ? "výroky o rozhodčím" : "svazová pokuta"}
                    </div>
                  </div>
                  <div className="font-heading font-bold text-base tabular-nums text-card-red shrink-0">
                    −{f.amount.toLocaleString("cs")} Kč
                  </div>
                </div>
                <p className="text-sm mt-2">{f.reason}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
