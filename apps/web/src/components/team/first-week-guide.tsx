"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";

interface GuideStep { key: string; label: string; hint: string; href: string; done: boolean }
interface GuideState { active: boolean; steps: GuideStep[]; rewardPaid: boolean }

/** Stránka kroku „podívej se“ (stadion, vybavení): otevřením je krok splněný. */
export function useGuideVisit(step: "stadium" | "equipment") {
  const { teamId } = useTeam();
  useEffect(() => {
    if (!teamId) return;
    apiFetch(`/api/teams/${teamId}/first-week/visit?step=${step}`, { method: "POST" })
      .catch((e) => console.warn("guide visit:", e));
  }, [teamId, step]);
}

/**
 * Karta „První týden“ pro nový klub: kroky, které hra pozná sama z toho, co trenér udělal.
 * Kapitán k nim posílá SMS (api onboarding/first-week.ts). Po splnění všeho karta zmizí
 * a starosta pošle do kasy odměnu.
 */
export function FirstWeekGuide() {
  const { teamId } = useTeam();
  const [state, setState] = useState<GuideState | null>(null);

  useEffect(() => {
    if (!teamId) return;
    let alive = true;
    apiFetch<GuideState>(`/api/teams/${teamId}/first-week`)
      .then((s) => { if (alive) setState(s); })
      .catch((e) => console.error("load first week guide:", e));
    return () => { alive = false; };
  }, [teamId]);

  if (!state?.active || state.steps.length === 0) return null;
  const done = state.steps.filter((s) => s.done).length;

  return (
    <section className="card p-4" aria-labelledby="first-week-title">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="first-week-title" className="font-heading font-bold text-base">První týden</h2>
        <span className="text-sm text-muted tabular-nums">{done} z {state.steps.length}</span>
      </div>
      <p className="text-sm text-muted mt-1">Kapitán ti napíše, co kluci potřebují. Za splnění všeho pošle starosta do kasy 5 000 Kč.</p>
      <ol className="mt-3 space-y-2.5">
        {state.steps.map((s) => (
          <li key={s.key} className="flex items-start gap-2 text-sm">
            <span aria-hidden="true" className={`w-5 shrink-0 text-center leading-5 ${s.done ? "text-pitch-600" : "text-muted"}`}>{s.done ? "✓" : "○"}</span>
            <div className="min-w-0">
              {s.done
                ? <span className="text-muted line-through">{s.label}</span>
                : <Link href={s.href} className="font-semibold hover:underline">{s.label}</Link>}
              {!s.done && <p className="text-muted mt-0.5">{s.hint}</p>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
