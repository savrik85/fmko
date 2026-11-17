"use client";

/**
 * Vývěska grémia soutěže.
 *
 * Visí na stránce Liga, kam hráč chodí tak jako tak. Zápisy v sekci Grémium
 * jsou protokol po zasedáních; tohle je opak — plochý sled toho, co grémium
 * rozhodlo. Bez ní se rozhodnutí schovávala tři prokliky hluboko a soutěž si
 * měnila sazebník, aniž si toho kdokoli všiml.
 *
 * Výsledek musí být čitelný slovem, ne poměrem: „4:3" u kvalifikované většiny
 * znamená zamítnutí, u prosté přijetí, a z čísel se to nepozná.
 */

import { ListRow, StatusChip, ChipTone } from "@/components/ui";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { triggerMenuBadgesRefresh } from "@/hooks/use-menu-badges";

export interface Decision {
  gameDate: string;
  seasonNumber: number;
  kind: string | null;
  title: string;
  status: string;
  resultNote: string | null;
  pro: number | null;
  proti: number | null;
  zdrzel: number | null;
  effectiveFromSeason: number | null;
}

/**
 * Jak se bod jmenuje ve výsledku.
 *
 * Pokuta za porušené pravidlo ani uvolněná funkce nejsou usnesení — nikdo o nich
 * nehlasoval. Dokud se rozlišovaly jen podle `status`, četla se pokuta v zápisu
 * jako „zvoleno".
 */
export function decisionPill(
  kind: string | null | undefined, status: string,
): { label: string; tone: ChipTone } {
  if (kind === "compliance") {
    return status === "passed"
      ? { label: "Pokuta", tone: "danger" }
      : { label: "Napomenutí", tone: "neutral" };
  }
  if (kind === "vacated") return { label: "Uvolněno", tone: "neutral" };
  if (kind === "election") {
    return status === "passed"
      ? { label: "Zvolen", tone: "ok" }
      : { label: "Neobsazeno", tone: "neutral" };
  }
  switch (status) {
    case "passed": return { label: "Přijato", tone: "ok" };
    case "rejected": return { label: "Zamítnuto", tone: "danger" };
    case "no_quorum": return { label: "Neusnášeníschopné", tone: "neutral" };
    case "withdrawn": return { label: "Staženo", tone: "neutral" };
    default: return { label: status, tone: "neutral" };
  }
}

export function DecisionPill({ kind, status }: { kind?: string | null; status: string }) {
  const s = decisionPill(kind, status);
  return (
    <StatusChip tone={s.tone}>
      {s.label}
    </StatusChip>
  );
}

function formatDate(v: string): string {
  const d = new Date(v.endsWith("Z") ? v : `${v}Z`);
  if (isNaN(d.getTime())) return v.slice(0, 10);
  return d.toLocaleDateString("cs", { day: "numeric", month: "numeric" });
}

/** Poměr hlasů. U voleb a pokut chybí schválně — tam by lhal. */
function pomer(d: Decision): string | null {
  if (d.pro === null || d.proti === null) return null;
  return `${d.pro}:${d.proti}${d.zdrzel ? ` (${d.zdrzel})` : ""}`;
}

export function GremiumVyveska({ limit = 6 }: { limit?: number }) {
  const { teamId } = useTeam();
  const [decisions, setDecisions] = useState<Decision[] | null>(null);
  const [leagueId, setLeagueId] = useState<string | null>(null);

  useEffect(() => {
    if (!teamId) return;
    apiFetch<{ league: { id: string }; enabled: boolean }>(`/api/teams/${teamId}/competition`)
      .then((d) => { if (d.enabled) setLeagueId(d.league.id); else setDecisions([]); })
      .catch((e) => { console.error("načtení soutěže pro vývěsku:", e); setDecisions([]); });
  }, [teamId]);

  useEffect(() => {
    if (!leagueId) return;
    apiFetch<{ decisions: Decision[] }>(`/api/competition/${leagueId}/decisions?limit=${limit}`)
      .then((d) => setDecisions(d.decisions ?? []))
      .catch((e) => { console.error("načtení vývěsky grémia:", e); setDecisions([]); });
  }, [leagueId, limit]);

  // Odklepnutí až po zobrazení — badge nesmí zhasnout dřív, než hráč data uvidí.
  useEffect(() => {
    if (!teamId || !decisions || decisions.length === 0) return;
    apiFetch(`/api/teams/${teamId}/competition/decisions/seen`, { method: "POST" })
      .then(() => triggerMenuBadgesRefresh())
      .catch((e) => console.error("odklepnutí vývěsky:", e));
  }, [teamId, decisions]);

  // Soutěž bez samosprávy žádnou vývěsku nemá — prázdná karta by jen mátla.
  if (!decisions || decisions.length === 0) return null;

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <span className="font-heading font-semibold text-sm uppercase tracking-wide text-muted">
          Vývěska grémia
        </span>
        <Link
          href="/soutez?tab=zapisy"
          className="text-sm font-heading font-bold shrink-0 hover:text-pitch-500 transition-colors"
        >
          Všechna rozhodnutí →
        </Link>
      </div>

      <div className="-mx-5 -mb-5 border-t border-line">
        {decisions.map((d, i) => {
          const p = pomer(d);
          return (
            /* Štítek stavu je pod názvem, ne vpravo: „Neusnášeníschopné" je široké
               a název návrhu by se na telefonu usekl i s částkou a klubem. */
            <ListRow key={`${d.gameDate}-${i}`}
              title={d.title}
              meta={`${formatDate(d.gameDate)}${p ? ` · ${p}` : ""}${d.effectiveFromSeason ? ` · platí od ${d.effectiveFromSeason}. sezóny` : ""}`}
              detail={
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5">
                  <DecisionPill kind={d.kind} status={d.status} />
                  {d.resultNote && <span>{d.resultNote}</span>}
                </span>
              } />
          );
        })}
      </div>
    </div>
  );
}
