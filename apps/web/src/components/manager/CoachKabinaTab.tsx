"use client";

/**
 * Kabina — jak trenéra berou vlastní hráči a proč.
 * Jen na vlastním profilu trenéra; cizí kluby vztah hráčů k trenérovi nevidí.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { coachRelationBand, coachRelationBandByKey, COACH_RELATION_BAND_ORDER, type CoachRelationBandKey } from "@okresni-masina/shared";
import { apiFetch } from "@/lib/api";
import { SectionLabel, Spinner, PositionBadge } from "@/components/ui";
import { FaceAvatar } from "@/components/players/face-avatar";

interface KabinaPlayer {
  id: string;
  firstName: string;
  lastName: string;
  position: string;
  age: number;
  avatar: Record<string, unknown> | null;
  relationship: number;
  band: CoachRelationBandKey;
  morale: number;
  sulking: boolean;
  leftOutStreak: number;
  unrestLevel: number;
  wantsOut: boolean;
  lowMorale: boolean;
  injuredDays: number | null;
  lastChange: { delta: number; description: string; date: string } | null;
}

interface KabinaFeedItem {
  playerId: string;
  playerName: string;
  delta: number;
  newValue: number;
  source: string;
  description: string;
  date: string;
}

interface Kabina {
  summary: {
    total: number;
    avgRelationship: number;
    bands: Record<CoachRelationBandKey, number>;
    sulking: number;
    wantsOut: number;
    lowMorale: number;
  };
  players: KabinaPlayer[];
  feed: KabinaFeedItem[];
}

/** Sloveso k počtu hráčů v pásmu: [1, 2–4, 5+]. */
const BAND_VERB: Record<CoachRelationBandKey, [string, string, string]> = {
  idol: ["je tvůj kamarád", "jsou tvoji kamarádi", "je tvých kamarádů"],
  loyal: ["za tebou stojí", "za tebou stojí", "za tebou stojí"],
  neutral: ["tě bere", "tě berou", "tě bere"],
  skeptic: ["tě nemusí", "tě nemusí", "tě nemusí"],
  hostile: ["tě nesnáší", "tě nesnáší", "tě nesnáší"],
};

function pick(n: number, forms: [string, string, string]): string {
  return n === 1 ? forms[0] : n >= 2 && n <= 4 ? forms[1] : forms[2];
}

function bandVerb(key: CoachRelationBandKey, n: number): string {
  return pick(n, BAND_VERB[key]);
}

const TONE_BAR: Record<string, string> = { good: "bg-pitch-500", neutral: "bg-amber-400", bad: "bg-red-500" };
const TONE_TEXT: Record<string, string> = { good: "text-pitch-700", neutral: "text-amber-700", bad: "text-red-700" };

/** Datum z logu: herní den `YYYY-MM-DD` nebo `YYYY-MM-DD HH:MM:SS` z SQLite. */
export function formatLogDate(raw: string): string {
  const d = new Date(raw.length > 10 ? raw.replace(" ", "T") + (raw.includes("Z") ? "" : "Z") : `${raw}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    console.warn("format kabina date:", raw);
    return "";
  }
  return d.toLocaleDateString("cs", { day: "numeric", month: "numeric" });
}

const BIG_CHANGE = 10;

/** Šipka místo čísla změny: velká změna má šipky dvě. Vztah je simulace, body hráč nevidí. */
function trendArrows(delta: number): string {
  if (delta === 0) return "•";
  const arrow = delta > 0 ? "▲" : "▼";
  return Math.abs(delta) >= BIG_CHANGE ? arrow + arrow : arrow;
}

export function RelationTrend({ delta }: { delta: number }) {
  const label = delta > 0 ? "Vztah se zlepšil" : delta < 0 ? "Vztah se zhoršil" : "Beze změny";
  return (
    <span aria-label={label} title={label}
      className={`shrink-0 w-7 text-xs leading-5 font-heading font-bold ${delta > 0 ? "text-pitch-600" : delta < 0 ? "text-card-red" : "text-muted"}`}>
      {trendArrows(delta)}
    </span>
  );
}

function DeltaBubble({ delta }: { delta: number }) {
  return (
    <div aria-label={delta > 0 ? "Vztah se zlepšil" : delta < 0 ? "Vztah se zhoršil" : "Beze změny"}
      className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-heading font-bold text-xs ${
      delta > 0 ? "bg-pitch-50 text-pitch-600" : delta < 0 ? "bg-red-50 text-card-red" : "bg-gray-50 text-muted"
    }`}>
      {trendArrows(delta)}
    </div>
  );
}

/** Souhrn celé kabiny podle průměrného pásma. */
const TEAM_BAND_LABEL: Record<CoachRelationBandKey, string> = {
  idol: "Kabina tě zbožňuje",
  loyal: "Kabina za tebou stojí",
  neutral: "Kabina tě bere",
  skeptic: "Kabina o tobě pochybuje",
  hostile: "Kabina tě nesnáší",
};

function Flag({ children, tone }: { children: React.ReactNode; tone: "bad" | "warn" }) {
  return (
    <span className={`text-sm font-heading font-bold px-2 py-0.5 rounded-full border ${
      tone === "bad" ? "bg-red-50 text-red-700 border-red-200" : "bg-amber-50 text-amber-800 border-amber-200"
    }`}>
      {children}
    </span>
  );
}

function isTrouble(p: KabinaPlayer): boolean {
  return p.band === "skeptic" || p.band === "hostile" || p.sulking || p.wantsOut || p.lowMorale;
}

export function CoachKabinaTab({ teamId }: { teamId: string }) {
  const [data, setData] = useState<Kabina | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyTrouble, setOnlyTrouble] = useState(false);

  useEffect(() => {
    apiFetch<Kabina>(`/api/teams/${teamId}/coach/kabina`)
      .then(setData)
      .catch((e) => {
        console.error("kabina load:", e);
        setError((e as Error)?.message || "Kabinu se nepodařilo načíst.");
      });
  }, [teamId]);

  if (error) return <div className="card p-4 text-sm text-card-red">{error}</div>;
  if (!data) return <div className="flex justify-center py-10"><Spinner /></div>;

  const { summary } = data;
  const avgBand = coachRelationBand(summary.avgRelationship);
  const troubleCount = data.players.filter(isTrouble).length;
  const shown = onlyTrouble ? data.players.filter(isTrouble) : data.players;

  return (
    <div className="space-y-5">
      {/* ═══ Souhrn ═══ */}
      <div className="card p-4 sm:p-5">
        <SectionLabel>Jak tě bere kabina</SectionLabel>
        <div className="flex items-center gap-4 mt-1">
          <div className="text-4xl leading-none">{avgBand.icon}</div>
          <div className="flex-1 min-w-0">
            <div className={`text-lg font-heading font-extrabold ${TONE_TEXT[avgBand.tone]}`}>{TEAM_BAND_LABEL[avgBand.key]}</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          {COACH_RELATION_BAND_ORDER.map((key) => {
            const n = summary.bands[key] ?? 0;
            if (n === 0) return null;
            return (
              <span key={key} className="text-sm font-heading font-bold px-2.5 py-1 rounded-full bg-surface border border-gray-100">
                {coachRelationBandByKey(key).icon} {n} {bandVerb(key, n)}
              </span>
            );
          })}
        </div>
        {(summary.sulking > 0 || summary.wantsOut > 0 || summary.lowMorale > 0) && (
          <div className="flex flex-wrap gap-2 mt-2">
            {summary.sulking > 0 && <Flag tone="bad">😤 {summary.sulking} {pick(summary.sulking, ["trucuje", "trucují", "trucuje"])}</Flag>}
            {summary.wantsOut > 0 && <Flag tone="warn">✈️ {summary.wantsOut} {pick(summary.wantsOut, ["chce pryč", "chtějí pryč", "chce pryč"])}</Flag>}
            {summary.lowMorale > 0 && <Flag tone="warn">📉 {summary.lowMorale} nízká morálka</Flag>}
          </div>
        )}
      </div>

      {/* ═══ Hráči ═══ */}
      <div className="card p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 mb-2">
          <SectionLabel>Hráči ({summary.total})</SectionLabel>
          {troubleCount > 0 && (
            <button type="button" onClick={() => setOnlyTrouble((v) => !v)}
              className={`text-sm font-heading font-bold px-3 py-1.5 rounded-full border transition-colors ${
                onlyTrouble ? "bg-red-50 text-red-700 border-red-200" : "bg-surface text-muted border-gray-100 hover:text-ink"
              }`}>
              {onlyTrouble ? "Ukázat všechny" : `Jen problémy (${troubleCount})`}
            </button>
          )}
        </div>
        <div>
          {shown.map((p) => {
            const band = coachRelationBand(p.relationship);
            return (
              <div key={p.id} className="py-3 sm:py-3.5 border-b border-gray-100/80 last:border-b-0">
                <div className="flex items-start sm:items-center gap-3">
                  {p.avatar && Object.keys(p.avatar).length > 2 ? (
                    <FaceAvatar faceConfig={p.avatar} size={40} className="shrink-0 bg-surface rounded-xl border border-gray-100 shadow-2xs mt-0.5 sm:mt-0" />
                  ) : (
                    <div className="shrink-0 w-10 h-10 rounded-xl bg-surface flex items-center justify-center font-heading font-bold text-sm text-ink border border-gray-100 mt-0.5 sm:mt-0">{p.lastName[0]}</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Link href={`/hrac/${p.id}`} className="entity-link text-base font-heading font-bold truncate">
                          {p.firstName} {p.lastName}
                        </Link>
                        <PositionBadge position={p.position} />
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={`text-sm font-heading font-bold ${TONE_TEXT[band.tone]}`}>{band.icon} {band.label}</span>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden mt-1.5">
                      <div className={`h-full rounded-full ${TONE_BAR[band.tone]}`} style={{ width: `${Math.max(3, p.relationship)}%` }} />
                    </div>
                    {(p.sulking || p.wantsOut || p.lowMorale || p.injuredDays || p.leftOutStreak >= 2) && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {p.sulking && <Flag tone="bad">😤 Trucuje</Flag>}
                        {p.wantsOut && <Flag tone="warn">✈️ Chce pryč</Flag>}
                        {p.lowMorale && <Flag tone="warn">📉 Nízká morálka</Flag>}
                        {p.leftOutStreak >= 2 && !p.sulking && <Flag tone="warn">🪑 {p.leftOutStreak}× nejel na zápas</Flag>}
                        {p.injuredDays ? <Flag tone="warn">🩹 Zraněný {p.injuredDays} d</Flag> : null}
                      </div>
                    )}
                    {p.lastChange && (
                      <div className="text-sm text-muted mt-1.5 flex items-start gap-1">
                        <RelationTrend delta={p.lastChange.delta} />
                        <span className="flex-1 min-w-0">
                          <span className="text-ink-light">{p.lastChange.description}</span>
                          <span className="text-muted"> · {formatLogDate(p.lastChange.date)}</span>
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ═══ Co se v kabině dělo ═══ */}
      <div className="card p-4 sm:p-5">
        <SectionLabel>Co se v kabině dělo</SectionLabel>
        {data.feed.length === 0 ? (
          <p className="text-sm text-muted">
            Zatím nic. Vztah hráčů k tobě se mění rozhovory v telefonu, nominací na zápasy,
            odmítnutými přestupy, řešením incidentů a tím, co se řekne v hospodě.
          </p>
        ) : (
          <div>
            {data.feed.map((f, i) => (
              <div key={i} className="flex items-start gap-3 py-2.5 border-b border-gray-50 last:border-b-0">
                <DeltaBubble delta={f.delta} />
                <div className="flex-1 min-w-0">
                  <Link href={`/hrac/${f.playerId}`} className="entity-link text-base font-heading font-bold">{f.playerName}</Link>
                  <div className="text-sm text-ink-light">{f.description}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm text-muted tabular-nums">{formatLogDate(f.date)}</div>
                  <div className="text-sm" title={coachRelationBand(f.newValue).label}>{coachRelationBand(f.newValue).icon}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
