"use client";

import Link from "next/link";
import { FaceAvatar } from "@/components/players/face-avatar";
import { CollapsibleCard } from "@/components/ui";
import {
  REFEREE_AXES, axisWord, axisColor, refereeAdviceCz, formatGrade, gradeColor, gradeWord,
  memoryWord, memoryColor, pocet,
  type RefereeProfileView, type RefereeStatsView, type RefereeMemoryView,
} from "@/lib/referee-info";

interface VsTeam {
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  yellow_cards?: number;
  red_cards?: number;
}

interface Props {
  referee: (RefereeProfileView & {
    stats: RefereeStatsView | null;
    vsTeam?: VsTeam | null;
    memory?: RefereeMemoryView | null;
  }) | null;
  isHome: boolean;
}

export function RefereeCard({ referee, isHome }: Props) {
  if (!referee) {
    return (
      <CollapsibleCard title="🧑‍⚖️ Rozhodčí" summary="Zatím nedelegován">
        <p className="text-sm text-muted">
          Delegace přijde dva herní dny před výkopem. Pak bude podle povahy sudího vidět,
          jestli se vyplatí hrát opatrně, nebo do toho jít naplno.
        </p>
      </CollapsibleCard>
    );
  }

  const advice = refereeAdviceCz(referee, isHome);
  const s = referee.stats;

  return (
    <CollapsibleCard
      title="🧑‍⚖️ Rozhodčí utkání"
      summary={`${referee.name} · ${referee.archetypeLabel}`}
    >
      <div className="flex items-start gap-3">
        {referee.avatar && (
          <FaceAvatar faceConfig={referee.avatar} size={56} className="border border-ink/20 bg-white shrink-0 rounded-lg" />
        )}
        <div className="min-w-0 flex-1">
          <Link href={`/dashboard/rozhodci/${referee.id}`} className="font-heading font-bold text-base hover:underline block truncate">
            {referee.name}
          </Link>
          <div className="text-sm text-muted">
            {referee.archetypeLabel} · {referee.age} let · {referee.occupation}
          </div>
        </div>
      </div>

      {referee.hlaska && (
        <p className="text-sm italic text-muted mt-2">„{referee.hlaska}"</p>
      )}

      {/* Sezónní čísla — kdo je v okrese nejlepší, se pozná podle známky. */}
      {s && s.matches > 0 && (
        <div className="grid grid-cols-3 gap-2 mt-3">
          <Stat label="Známka" value={formatGrade(s.avgGrade)} className={gradeColor(s.avgGrade)}
            hint={s.avgGrade != null ? gradeWord(s.avgGrade) : undefined} />
          <Stat label="Karet/zápas" value={s.cardsPerMatch != null ? s.cardsPerMatch.toFixed(1).replace(".", ",") : "—"} />
          <Stat label="Odpískal" value={`${s.matches}×`} />
        </div>
      )}

      {/* Osy povahy — vysoká hodnota není sama o sobě dobrá ani špatná. */}
      <div className="mt-3 space-y-1.5">
        {REFEREE_AXES.map((axis) => {
          const value = referee[axis.key] as number;
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

      {referee.vsTeam && referee.vsTeam.matches > 0 && (
        <p className="text-sm mt-3 pt-3 border-t border-ink/10">
          <span className="font-heading font-bold">Vám už pískal {referee.vsTeam.matches}×</span>
          {" — "}
          {pocet(referee.vsTeam.wins, "výhra", "výhry", "výher")},{" "}
          {pocet(referee.vsTeam.draws, "remíza", "remízy", "remíz")},{" "}
          {pocet(referee.vsTeam.losses, "prohra", "prohry", "proher")}
          {referee.vsTeam.red_cards ? ` · ${referee.vsTeam.red_cards}× červená` : ""}
        </p>
      )}

      {/* Paměť z pozápasových rozhovorů — ukazuje se spočítané číslo i důvod,
          aby to nebyl skrytý modifikátor. */}
      {referee.memory && (
        <div className="mt-3 pt-3 border-t border-ink/10">
          <p className="text-sm">
            <span className="font-heading font-bold">Sudí {referee.name.split(" ").slice(-1)[0]} si tě pamatuje:</span>{" "}
            <span className={`font-heading font-bold ${memoryColor(referee.memory.sentiment)}`}>
              {memoryWord(referee.memory.sentiment)}
            </span>
            <span className="text-muted tabular-nums"> ({referee.memory.sentiment > 0 ? "+" : ""}{referee.memory.sentiment})</span>
          </p>
          <p className="text-sm text-ink-light mt-0.5">
            Hraniční verdikty rozhodne o {referee.memory.biasPct.toFixed(1).replace(".", ",")} % častěji{" "}
            {referee.memory.sentiment < 0 ? "proti tobě" : "ve tvůj prospěch"}.
            {referee.memory.duvod ? ` Důvod: ${referee.memory.duvod}` : ""}
          </p>
        </div>
      )}

      {advice.length > 0 && (
        <ul className="mt-3 space-y-1">
          {advice.map((a, i) => (
            <li key={i} className="text-sm flex gap-2">
              <span className="text-muted shrink-0">›</span>
              <span>{a}</span>
            </li>
          ))}
        </ul>
      )}
    </CollapsibleCard>
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
