/**
 * Společné typy a popisky AI trenérů pro přehled i záložku AI kluby.
 * Odpověď `/api/admin/ai-coach/status` odpovídá `apps/api/src/ai-coach/status.ts`.
 */

export type CoachMode = "off" | "shadow" | "on";
export type CoachArea = "match" | "weekly" | "market";

export const COACH_AREAS: Array<{ key: CoachArea; label: string; note: string }> = [
  { key: "match", label: "Zápas", note: "sestava, taktika, tvrdost, pokyny" },
  { key: "weekly", label: "Týdenní správa", note: "trénink, stadion, vybavení, zaměstnanci" },
  { key: "market", label: "Trh", note: "přestupy a nabídky" },
];

export const COACH_MODES: Array<{ key: CoachMode; label: string }> = [
  { key: "off", label: "Bez modelu" },
  { key: "shadow", label: "Nanečisto" },
  { key: "on", label: "Zapnuto" },
];

export const MODE_LABEL: Record<CoachMode, string> = { off: "bez modelu", shadow: "nanečisto", on: "zapnuto" };

export const KIND_LABELS: Record<string, string> = {
  match: "zápas",
  weekly: "týden",
  concession_topup: "doplnění bufetu",
  transfer_reply: "odpověď na nabídku",
  transfer_market: "trh",
  transfer_negotiation: "jednání o nákupu",
  demand_pitch: "hráč na poptávku",
  friendly_offer: "nabídka přáteláku",
  friendly_reply: "odpověď na přátelák",
  main_sponsor: "hlavní sponzor",
  unrest: "nespokojený hráč",
  incident: "incident v klubu",
  season_duels: "kdo zůstane",
};

export interface StatusClub {
  teamId: string;
  name: string;
}

export interface CoachStatus {
  model: string;
  modes: Record<CoachArea, CoachMode>;
  clubs: {
    total: number;
    byLeague: Array<{ league: string; count: number }>;
    orphaned: number;
    inDebt: Array<StatusClub & { budget: number }>;
  };
  last24h: {
    decisions: number;
    /** Kolik z nich měl rozhodnout model (bez režimu off). */
    modelDecisions: number;
    fallback: number;
    errors: number;
    avgLatencyMs: number | null;
    tokensIn: number;
    tokensOut: number;
    byKind: Array<{ kind: string; decisions: number; fallback: number; errors: number }>;
  };
  last7d: { decisions: number; fallback: number; errors: number };
  lastDecisionAt: string | null;
  recentErrors: Array<{ id: string; teamId: string; teamName: string | null; kind: string; error: string; createdAt: string }>;
  takeover: {
    enabled: boolean;
    brake: number;
    waitingCount: number;
    waiting: StatusClub[];
    soon: StatusClub[];
    recent: Array<StatusClub & { since: string }>;
  };
}

/** Čas z databáze: ISO s `Z`, nebo SQLite `YYYY-MM-DD HH:MM:SS` v UTC. */
export function parseDbTime(raw: string): Date {
  const iso = raw.includes("T") ? raw : `${raw.replace(" ", "T")}Z`;
  return new Date(/[zZ]|[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`);
}

export function formatTime(raw: string | null): string {
  if (!raw) return "—";
  const d = parseDbTime(raw);
  return Number.isNaN(d.getTime()) ? raw : d.toLocaleString("cs", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** „před 12 min", „před 3 h", „před 2 dny". */
export function relativeTime(raw: string | null, now = new Date()): string {
  if (!raw) return "zatím nikdy";
  const d = parseDbTime(raw);
  if (Number.isNaN(d.getTime())) return raw;
  const minutes = Math.max(0, Math.round((now.getTime() - d.getTime()) / 60_000));
  if (minutes < 1) return "právě teď";
  if (minutes < 60) return `před ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `před ${hours} h`;
  const days = Math.round(hours / 24);
  return `před ${days} ${days === 1 ? "dnem" : "dny"}`;
}

/** Jména klubů do jednoho řádku: prvních pár a „a další N". */
export function clubList(clubs: StatusClub[], max = 5): string {
  if (clubs.length <= max) return clubs.map((c) => c.name).join(", ");
  return `${clubs.slice(0, max).map((c) => c.name).join(", ")} a další ${clubs.length - max}`;
}
