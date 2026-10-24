"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { BadgePreview, type BadgePattern } from "@/components/ui";

export interface CostLine { label: string; amount: number }

export interface Crest { primary: string; secondary: string; pattern: string; initials: string; symbol: string | null }

export interface FriendlyView {
  id: string;
  direction: "in" | "out";
  opponent: { id: string; name: string; crest: Crest | null };
  /** null jen u čekající výzvy z doby před termíny, ta se hraje nejbližší volný den po přijetí. */
  date: string | null;
  venue: "home" | "away" | "neutral";
  neutralVillage: string | null;
  costPayer: "each" | "me" | "opponent";
  stake: number;
  message: string | null;
  status: string;
  fromOffer: boolean;
  matchId: string | null;
  matchStatus: string | null;
  myScore: number | null;
  opponentScore: number | null;
  cancelReason: string | null;
  myCosts: CostLine[] | null;
  clash?: string | null;
}

export interface OfferView {
  id: string;
  date: string;
  venue: "poster" | "taker" | "neutral";
  costPayer: "each" | "poster";
  stake: number;
  message: string | null;
  team: { id: string; name: string; village: string; district: string | null; crest: Crest | null };
  myCosts?: CostLine[] | null;
  neutralVillage?: string | null;
  distanceKm?: number | null;
  blocked?: string | null;
}

export interface DayOption { date: string; busy: string | null }
export interface TeamOption { id: string; name: string; village: string; district: string | null; linked: boolean }

export type MatchResult = "W" | "D" | "L";
export interface Streak { kind: MatchResult; length: number }

export interface HeadToHead {
  teamId: string; name: string; crest: Crest | null; played: number; won: number; drawn: number; lost: number;
  goalsFor: number; goalsAgainst: number; stakeNet: number; lastDate: string | null; lastScore: string | null;
  lastResult: MatchResult | null; streak: Streak | null;
}

export interface FriendlyTableRow {
  pos: number; teamId: string; name: string; crest: Crest;
  played: number; won: number; drawn: number; lost: number; goalsFor: number; goalsAgainst: number; points: number;
}

export interface FriendlyLimits {
  maxStake: number; stakeStep: number; daysAhead: number; maxOpenOffers: number; maxMessage: number;
  restDays: number; refereeFee: number; rentalFee: number; travelBase: number; travelPerKm: number;
}

export interface FriendliesData {
  today: string;
  budget: number;
  days: DayOption[];
  incoming: FriendlyView[];
  outgoing: FriendlyView[];
  upcoming: FriendlyView[];
  played: FriendlyView[];
  cancelled: FriendlyView[];
  offers: OfferView[];
  myOffers: OfferView[];
  teams: TeamOption[];
  me: { id: string; name: string; crest: Crest } | null;
  record: {
    overall: { played: number; won: number; drawn: number; lost: number; goalsFor: number; goalsAgainst: number; stakeNet: number };
    form: MatchResult[];
    streak: Streak | null;
    unbeaten: number;
    biggestWin: { opponent: string; teamId: string; goalsFor: number; goalsAgainst: number; date: string } | null;
    opponents: HeadToHead[];
  };
  table: FriendlyTableRow[];
  limits: FriendlyLimits;
}

export const formatCZK = (v: number) => `${v.toLocaleString("cs")} Kč`;

/** „úterý 27. 10." */
export function dayLabel(date: string): string {
  const d = new Date(`${date}T12:00:00.000Z`);
  const weekday = new Intl.DateTimeFormat("cs", { weekday: "long", timeZone: "UTC" }).format(d);
  return `${weekday} ${d.getUTCDate()}. ${d.getUTCMonth() + 1}.`;
}

/** Části data pro čipy a dlaždice. */
export function dayShort(date: string): { weekday: string; day: string; dayNumber: number; month: number } {
  const d = new Date(`${date}T12:00:00.000Z`);
  return {
    weekday: new Intl.DateTimeFormat("cs", { weekday: "short", timeZone: "UTC" }).format(d),
    day: `${d.getUTCDate()}. ${d.getUTCMonth() + 1}.`,
    dayNumber: d.getUTCDate(),
    month: d.getUTCMonth() + 1,
  };
}

export const sumCosts = (lines: CostLine[] | null | undefined) => (lines ?? []).reduce((s, l) => s + l.amount, 0);

export function venueText(venue: FriendlyView["venue"], neutralVillage: string | null): string {
  if (venue === "home") return "Doma";
  if (venue === "away") return "U soupeře";
  return neutralVillage ? `Neutrální hřiště, ${neutralVillage}` : "Neutrální hřiště";
}

export const CHIP = "min-h-11 px-3 rounded-control text-sm font-heading font-bold transition-colors";
export const chipClass = (on: boolean, disabled = false) =>
  `${CHIP} ${disabled ? "bg-black/5 text-muted/60 line-through cursor-not-allowed" : on ? "bg-pitch-500 text-white" : "bg-black/5 text-ink hover:bg-black/10"}`;
export const TAG = "px-2 py-0.5 rounded-full bg-surface border border-gray-100 text-sm font-heading font-bold text-ink tabular-nums";
export const PRIMARY_BUTTON = "inline-flex items-center justify-center min-h-11 sm:min-h-0 py-1.5 px-4 rounded-soft text-sm font-heading font-bold bg-pitch-500 text-white hover:bg-pitch-600 transition-colors disabled:opacity-50";
export const SECONDARY_BUTTON = "inline-flex items-center justify-center min-h-11 sm:min-h-0 py-1.5 px-4 rounded-soft text-sm font-heading font-bold bg-black/5 text-ink hover:bg-black/10 transition-colors disabled:opacity-50";

export function ClubCrest({ crest, size = 36 }: { crest: Crest | null | undefined; size?: number }) {
  if (!crest) return <span className="rounded-full bg-black/5 shrink-0" style={{ width: size, height: size }} />;
  return <BadgePreview primary={crest.primary} secondary={crest.secondary} pattern={crest.pattern as BadgePattern}
    initials={crest.initials} symbol={crest.symbol} size={size} />;
}

export function TeamLink({ id, name }: { id: string; name: string }) {
  return (
    <Link href={`/tym/${id}`} className="font-heading font-bold text-base text-ink hover:text-pitch-500 underline decoration-pitch-500/20">
      {name}
    </Link>
  );
}

/** Dlaždice s datem jako v rozpisu na nástěnce: den v týdnu, velké číslo dne, měsíc. */
export function DateTile({ date, today }: { date: string | null; today?: boolean }) {
  if (!date) {
    return (
      <div className="w-16 shrink-0 flex flex-col items-center justify-center bg-black/5 text-muted px-1 text-center">
        <span className="text-sm font-heading font-bold leading-tight">první volný den</span>
      </div>
    );
  }
  const d = dayShort(date);
  return (
    <div className={`w-16 shrink-0 flex flex-col items-center justify-center py-3 ${today ? "bg-pitch-500 text-white" : "bg-black/5 text-ink"}`}>
      <span className={`text-sm font-heading font-bold ${today ? "text-white/80" : "text-muted"}`}>{today ? "dnes" : d.weekday}</span>
      <span className="font-heading font-[800] text-2xl leading-none tabular-nums">{d.dayNumber}</span>
      <span className={`text-sm font-heading font-bold tabular-nums ${today ? "text-white/80" : "text-muted"}`}>{d.month}.</span>
    </div>
  );
}

/** Sázka: zlatý štítek s mincí v barvách hry (emoji mince se v systémech kreslí šedě). */
export function StakeTag({ stake }: { stake: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-gold-50 border border-gold-200 text-sm font-heading font-bold text-gold-700 tabular-nums">
      <span aria-hidden className="w-3 h-3 rounded-full bg-gold-400 border border-gold-600" />
      o {formatCZK(stake)}
    </span>
  );
}

/** Sázka jako zlatá mince, náklady jako běžný štítek. */
export function TermsTags({ stake, costPayer, myCosts }: { stake: number; costPayer: FriendlyView["costPayer"]; myCosts: CostLine[] | null }) {
  const total = sumCosts(myCosts);
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {stake > 0 && <StakeTag stake={stake} />}
      {costPayer === "me" && <span className={TAG}>platíš náklady za oba</span>}
      {costPayer === "opponent" && <span className={TAG}>náklady platí soupeř</span>}
      {myCosts && (
        <span className={TAG} title={myCosts.map((l) => `${l.label}: ${formatCZK(l.amount)}`).join(", ")}>
          {total > 0 ? `tvoje náklady ${formatCZK(total)}` : "neplatíš nic"}
        </span>
      )}
    </div>
  );
}

/** Přátelák v rozpisu: vlevo den, uprostřed soupeř s erbem a podmínky, akce pod tím. */
export function FixtureCard({ date, today, crest, title, status, place, tags, message, warning, actions }: {
  date: string | null;
  today?: boolean;
  crest: Crest | null | undefined;
  title: ReactNode;
  status?: ReactNode;
  place: ReactNode;
  tags?: ReactNode;
  message?: string | null;
  warning?: string | null;
  actions?: ReactNode;
}) {
  return (
    <div className="card p-0 overflow-hidden flex">
      <DateTile date={date} today={today} />
      <div className="flex-1 min-w-0 p-3 sm:p-4">
        <div className="flex flex-col sm:flex-row sm:items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5">
              <ClubCrest crest={crest} size={36} />
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">{title}{status}</div>
                <div className="text-sm text-muted">{place}</div>
              </div>
            </div>
            {tags}
            {message && <div className="text-sm text-muted italic mt-2">„{message}“</div>}
            {warning && <div className="text-sm text-card-red font-heading font-bold mt-2">{warning}</div>}
          </div>
          {actions && <div className="flex gap-2 sm:shrink-0 flex-wrap">{actions}</div>}
        </div>
      </div>
    </div>
  );
}

export function FriendlyCard({ f, status, children }: { f: FriendlyView; status?: ReactNode; children?: ReactNode }) {
  return (
    <FixtureCard
      date={f.date}
      today={f.matchStatus === "lineups_open"}
      crest={f.opponent.crest}
      title={<TeamLink id={f.opponent.id} name={f.opponent.name} />}
      status={status}
      place={`${f.date ? "18:00 · " : ""}${venueText(f.venue, f.neutralVillage)}`}
      tags={<TermsTags stake={f.stake} costPayer={f.costPayer} myCosts={f.myCosts} />}
      message={f.message}
      warning={f.clash}
      actions={children}
    />
  );
}

export function StatusPill({ tone, children }: { tone: "green" | "gold" | "muted" | "red"; children: ReactNode }) {
  const cls = {
    green: "bg-pitch-50 text-pitch-700 border-pitch-200",
    gold: "bg-gold-50 text-gold-700 border-gold-200",
    muted: "bg-black/5 text-muted border-transparent",
    red: "bg-red-50 text-card-red border-red-100",
  }[tone];
  return <span className={`px-2 py-0.5 rounded-full border text-sm font-heading font-bold ${cls}`}>{children}</span>;
}

/** Čtvereček formy stejně jako sezónní bilance na profilu týmu. */
export function FormChip({ result, size = "md" }: { result: MatchResult; size?: "md" | "lg" }) {
  const cls = result === "W" ? "bg-pitch-500" : result === "L" ? "bg-card-red" : "bg-gray-400";
  // Na telefonu menší, aby se deset výsledků vešlo do jednoho řádku.
  const dim = size === "lg" ? "w-8 h-8 text-sm" : "w-6 h-6 sm:w-7 sm:h-7 text-sm";
  return (
    <span className={`${dim} rounded-control flex items-center justify-center font-heading font-bold text-white ${cls}`}>
      {result === "W" ? "V" : result === "L" ? "P" : "R"}
    </span>
  );
}
