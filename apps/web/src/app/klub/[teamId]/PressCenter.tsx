"use client";

import { useState } from "react";
import type { ClubWebsiteData } from "@okresni-masina/shared";
import { ManagerFace } from "./ManagerFace";
import { formatDate } from "./templates/shared";

type Interview = ClubWebsiteData["interviews"][number];
type Tone = "light" | "dark";

/**
 * Zprávy, které patří na veřejný web klubu, a jejich štítek. Ostatní typy zůstávají jen ve hře:
 * přestupy mají na webu vlastní sekci (a nabídka na přestup prozrazuje požadovanou cenu),
 * výhry v sázkovce jsou klubové peníze, rozhovory mají v `body` JSON s herními čísly
 * (vztah s redakcí, dopad na morálku) a rozhovor trenéra je tu už jako otázky a odpovědi.
 * Nový typ zprávy se na web nedostane, dokud ho sem někdo vědomě nepřidá.
 */
export const PRESS_NEWS_TYPES: ReadonlyMap<string, string> = new Map([
  ["promotion", "Pozvánka na zápas"],
  ["manager_arrival", "Nový trenér"],
  ["manager_feud", "Slovo trenéra"],
  ["legend_farewell", "Rozlučka"],
]);

// Třídy musí být celé řetězce, jinak je Tailwind nevygeneruje.
const TONES = {
  light: {
    surface: "bg-white",
    line: "border-gray-300",
    strong: "text-gray-900",
    body: "text-gray-800",
    muted: "text-gray-600",
    accentText: "text-[var(--club-accent-light)]",
    accentLine: "border-[color-mix(in_srgb,var(--club-accent-light)_40%,transparent)]",
    accentHover: "hover:bg-[color-mix(in_srgb,var(--club-accent-light)_10%,transparent)]",
  },
  dark: {
    surface: "bg-white/5",
    line: "border-white/10",
    strong: "text-white",
    body: "text-slate-200",
    muted: "text-slate-300",
    accentText: "text-[var(--club-accent-dark)]",
    accentLine: "border-[color-mix(in_srgb,var(--club-accent-dark)_40%,transparent)]",
    accentHover: "hover:bg-[color-mix(in_srgb,var(--club-accent-dark)_15%,transparent)]",
  },
} as const;

type ToneClasses = (typeof TONES)[Tone];

/**
 * SQLite `datetime('now')` ukládá UTC bez pásma („2026-10-05 16:13:07“). Bez „Z“ by ho server
 * četl jako UTC a prohlížeč jako místní čas (Safari vůbec), datum by kolem půlnoci nesedělo.
 */
function utcIso(value: string): string {
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(value) ? `${value.replace(" ", "T")}Z` : value;
}

function pressContent(data: ClubWebsiteData) {
  return {
    interviews: (data.interviews ?? []).filter((iv) => iv.questions.length > 0),
    news: (data.news ?? []).filter(
      (n) => PRESS_NEWS_TYPES.has(n.type) && n.headline.trim() && !n.body.trimStart().startsWith("{"),
    ),
  };
}

/** Šablona podle toho pozná, jestli sekci (i s nadpisem) vůbec vykreslit. */
export function hasPressCenterContent(data: ClubWebsiteData): boolean {
  const { interviews, news } = pressContent(data);
  return interviews.length > 0 || news.length > 0;
}

function interviewTitle(gameWeek: number, kind?: string | null): string {
  // Ohlédnutí za sezónou má v game_week číslo sezóny × 100
  if (kind === "season_wrap" || (gameWeek >= 100 && gameWeek % 100 === 0)) {
    return `Ohlédnutí za ${Math.max(1, Math.round(gameWeek / 100))}. sezónou`;
  }
  if (kind === "pre_match") return `Před ${gameWeek}. kolem`;
  if (kind === "post_match") return `Po ${gameWeek}. kole`;
  return `${gameWeek}. kolo`;
}

/** Kdo rozhovor dal: trenér, který tehdy vedl tým, ne nutně ten dnešní. */
function interviewCoach(interview: Interview, data: ClubWebsiteData): string {
  return interview.managerName || data.manager?.name || "Trenér";
}

function InterviewQA({ interview, coach, t }: { interview: Interview; coach: string; t: ToneClasses }) {
  return (
    <dl className="space-y-4">
      {interview.questions.map((question, i) => {
        const answer = interview.answers[i]?.trim();
        return (
          <div key={i}>
            <dt className={`text-base font-bold break-words ${t.accentText}`}>{question}</dt>
            <dd className={`mt-1 text-base break-words ${t.body}`}>
              <span className={`font-bold ${t.strong}`}>{coach}:</span>{" "}
              {answer || <em className={t.muted}>Bez komentáře.</em>}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/**
 * Tiskové středisko klubového webu: rozhovory trenéra pro Zpravodaj (nejnovější rozbalený,
 * starší na klepnutí) a veřejné zprávy klubu. Nadpis sekce dodává šablona.
 */
export function PressCenter({ data, tone = "dark" }: { data: ClubWebsiteData; tone?: Tone }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const t = TONES[tone];

  const { interviews, news } = pressContent(data);
  if (interviews.length === 0 && news.length === 0) return null;

  const [latest, ...older] = interviews;
  const latestCoach = latest ? interviewCoach(latest, data) : "Trenér";
  // Obličej jen když rozhovor dal současný trenér (jiného obličej nemáme)
  const avatar = latest && data.manager?.name === latestCoach ? data.manager.avatar : null;
  const hasFace = !!avatar && Object.keys(avatar).length > 0;

  return (
    <div className="space-y-8">
      {latest && (
        <div className="space-y-3">
          <h3 className={`font-heading font-bold text-lg ${t.accentText}`}>Rozhovory s trenérem</h3>

          <article className={`overflow-hidden rounded-xl border ${t.surface} ${t.line}`}>
            <header className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 bg-[var(--club-bar)] text-[var(--club-on-bar)]">
              <span className="font-heading font-bold text-base">
                <span aria-hidden="true">🎙️ </span>
                {interviewTitle(latest.gameWeek, latest.kind)}
              </span>
              <time dateTime={utcIso(latest.createdAt)} className="text-sm">
                {formatDate(utcIso(latest.createdAt))}
              </time>
            </header>
            <div className="p-4 sm:p-5 space-y-4">
              <div className="flex items-center gap-3">
                {hasFace && <ManagerFace faceConfig={avatar} size={48} />}
                <div className="min-w-0">
                  <div className={`text-sm ${t.muted}`}>Odpovídá trenér</div>
                  <div className={`font-heading font-bold text-base break-words ${t.strong}`}>{latestCoach}</div>
                </div>
              </div>
              <InterviewQA interview={latest} coach={latestCoach} t={t} />
            </div>
          </article>

          {older.length > 0 && (
            <ul className="space-y-2">
              {older.map((iv) => {
                const open = !!expanded[iv.id];
                const panelId = `rozhovor-${iv.id}`;
                return (
                  <li key={iv.id} className={`rounded-xl border ${t.surface} ${t.line}`}>
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-controls={panelId}
                      onClick={() => setExpanded((s) => ({ ...s, [iv.id]: !s[iv.id] }))}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left rounded-xl transition-colors ${t.accentHover}`}
                    >
                      <span className="flex-1 min-w-0">
                        <span className={`block font-heading font-bold text-base ${t.strong}`}>
                          {interviewTitle(iv.gameWeek, iv.kind)}
                        </span>
                        <span className={`block text-sm ${t.muted}`}>{formatDate(utcIso(iv.createdAt))}</span>
                        {!open && (
                          <span className={`block mt-1 text-sm line-clamp-2 break-words ${t.muted}`}>{iv.questions[0]}</span>
                        )}
                      </span>
                      <span
                        aria-hidden="true"
                        className={`shrink-0 text-xl leading-none transition-transform ${open ? "rotate-180" : ""} ${t.accentText}`}
                      >
                        ▾
                      </span>
                    </button>
                    <div id={panelId} hidden={!open} className="px-4 pb-4 pt-1">
                      <InterviewQA interview={iv} coach={interviewCoach(iv, data)} t={t} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {news.length > 0 && (
        <div className="space-y-3">
          <h3 className={`font-heading font-bold text-lg ${t.accentText}`}>Zprávy z klubu</h3>
          <ul className="grid gap-3 sm:grid-cols-2">
            {news.map((n) => (
              <li key={n.id} className={`rounded-xl border p-4 ${t.surface} ${t.accentLine}`}>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <span className={`font-bold ${t.accentText}`}>{PRESS_NEWS_TYPES.get(n.type)}</span>
                  <span aria-hidden="true" className={t.muted}>·</span>
                  <time dateTime={utcIso(n.created_at)} className={t.muted}>
                    {formatDate(utcIso(n.created_at))}
                  </time>
                </div>
                <h4 className={`mt-1 font-heading font-bold text-base break-words ${t.strong}`}>{n.headline}</h4>
                <p className={`mt-2 text-base whitespace-pre-line break-words ${t.body}`}>{n.body}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
