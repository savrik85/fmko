import { trackEvent } from "@/lib/analytics";

// API_BASE is inlined at build time from .env.production
export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

/**
 * Prodlevy před opakováním čtení, když API vrátí 503. Tak hlásí databázi, která
 * na chvíli odmítá dotazy (záloha, přetížení při kole v 18 h).
 */
const RETRY_DELAYS_MS = [800, 2500];

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Událost pro TeamProvider: API odmítlo požadavek s 401. Jestli je přihlášení
 * opravdu pryč, rozhodne až TeamProvider, 401 má i pár jiných důvodů.
 */
export const AUTH_REJECTED_EVENT = "auth-rejected";

export interface AuthRejectedDetail {
  path: string;
  error: string;
}

/** 401 z přihlášení znamená špatné heslo, ne ztracenou session. */
const LOGIN_PATH = "/auth/login";

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  // Automaticky přidáme Authorization header pokud je token v localStorage
  const token = typeof window !== "undefined" ? localStorage.getItem("om_token") : null;
  const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  const mergedInit: RequestInit = {
    ...init,
    headers: {
      ...authHeaders,
      ...(init?.headers as Record<string, string> | undefined),
    },
  };
  const method = (mergedInit.method ?? "GET").toUpperCase();
  // Opakovat jde jen čtení, zápis by se mohl provést dvakrát.
  const canRetry = method === "GET" || method === "HEAD";

  let res: Response;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetch(`${API_BASE}${path}`, mergedInit);
    } catch {
      // Network error (API unreachable) — throw with status 0
      const error = new Error("Network error");
      (error as Error & { status: number }).status = 0;
      throw error;
    }
    if (res.status === 503 && canRetry && attempt < RETRY_DELAYS_MS.length) {
      await wait(RETRY_DELAYS_MS[attempt]);
      continue;
    }
    break;
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    const error = new Error((err as { error: string }).error ?? "API error");
    (error as Error & { status: number }).status = res.status;
    if (res.status === 401 && path !== LOGIN_PATH && typeof window !== "undefined") {
      const detail: AuthRejectedDetail = { path, error: error.message };
      window.dispatchEvent(new CustomEvent(AUTH_REJECTED_EVENT, { detail }));
    }
    if (res.status >= 500 && typeof window !== "undefined") {
      trackEvent("api_server_error", {
        endpoint: path,
        status: res.status,
        error: (err as { error?: string })?.error,
        page: window.location.pathname,
      });
    }
    throw error;
  }
  // Po úspěšné write operaci probudit team-context aby se aktualizoval
  // rozpočet/sezona/atd. v topbaru (jinak by tam visely staré hodnoty
  // až do dalšího 60s pollingu).
  if (typeof window !== "undefined" && method !== "GET" && method !== "HEAD") {
    window.dispatchEvent(new Event("team-budget-changed"));
  }
  return res.json() as Promise<T>;
}

/**
 * Stáhne binární data (nahrávku) s přihlášením. `<audio src>` neumí poslat
 * hlavičku s tokenem, takže soukromé nahrávky se přehrávají z blobu.
 */
export async function apiFetchBlob(path: string): Promise<Blob> {
  const token = typeof window !== "undefined" ? localStorage.getItem("om_token") : null;
  const res = await fetch(`${API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const error = new Error(`Stažení se nezdařilo (${res.status})`);
    (error as Error & { status: number }).status = res.status;
    throw error;
  }
  return res.blob();
}

/** Zobrazí chybový dialog (náš ErrorDialogProvider); fallback na alert pokud dialog není mountnutý. */
export function showError(title: string, message: string): void {
  if (typeof window === "undefined") return;
  const fn = (window as unknown as { __showError?: (t: string, m: string) => void }).__showError;
  if (fn) fn(title, message);
  else alert(`${title}\n\n${message}`);
}

/**
 * Z chybové hlášky udělá neutrální název akce pro analytiku, aby úspěšná akce
 * nenesla popisek „…se nezdařilo". Hlášky mají tři tvary:
 *   „Propuštění hráče se nezdařilo"      → „Propuštění hráče"
 *   „Komentář se nepodařilo odeslat"     → „Odeslat komentář"
 *   „Nepodařilo se stáhnout z arény"     → „Stáhnout z arény"
 */
function actionLabel(message: string): string {
  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const failed = message.match(/^(.+?) se nezdařil[aoy]?$/);
  if (failed) return failed[1];
  const couldNot = message.match(/^(.+?) se (?:nepodařilo|nepovedlo) (.+)$/);
  if (couldNot) return `${capitalize(couldNot[2])} ${couldNot[1].charAt(0).toLowerCase()}${couldNot[1].slice(1)}`;
  const leading = message.match(/^(?:Nepodařilo|Nepovedlo) se (.+)$/);
  if (leading) return capitalize(leading[1]);
  return message;
}

// Wrapper pro user-iniciované akce: při chybě zobrazí dialog s API zprávou.
// Vrací true při úspěchu, false při chybě (caller se rozhodne, jestli refreshovat).
export async function apiAction<T>(promise: Promise<T>, fallbackMessage = "Akce se nezdařila"): Promise<boolean> {
  const currentPath = typeof window !== "undefined" ? window.location.pathname : "";
  // Vlastnost `result`, ne `status`: `status` má PostHog vedený jako číslo
  // (HTTP kód z api_server_error) a textové hodnoty by zahodil.
  const action = actionLabel(fallbackMessage);
  try {
    await promise;
    trackEvent("game_action", {
      action,
      result: "success",
      path: currentPath,
    });
    return true;
  } catch (e) {
    console.error(fallbackMessage + ":", e);
    const msg = (e as Error)?.message;
    trackEvent("game_action", {
      action,
      result: "failed",
      error: msg,
      path: currentPath,
    });
    showError(fallbackMessage, msg && msg !== "API error" ? msg : "Zkus to prosím znovu.");
    return false;
  }
}

export interface Village {
  id: string;
  name: string;
  district: string;
  region: string;
  population: number;
  size: string;
  lat: number;
  lng: number;
}

export interface Team {
  id: string;
  user_id?: string;
  name: string;
  /** Kluby se stejným majitelem, propojení zapisuje admin. */
  sameOwnerClubs?: Array<{ id: string; name: string }>;
  village_name: string;
  /** Obec klubu (profil obce na /obec/[id]). */
  village_id?: string;
  population: number;
  size: string;
  district: string;
  region: string;
  primary_color: string;
  secondary_color: string;
  budget: number;
  reputation: number;
  league_id?: string;
  jersey_pattern?: string;
  badge_pattern?: string;
  badge_primary_color?: string | null;
  badge_secondary_color?: string | null;
  badge_initials?: string | null;
  badge_symbol?: string | null;
  scarf_pattern?: string | null;
  game_date?: string;
  stadium_name?: string;
  captain_id?: string;
  penalty_taker_id?: string;
  freekick_taker_id?: string;
  team_type?: "senior" | "u21";
  parent_team_id?: string | null;
}

export interface Player {
  id: string;
  team_id: string;
  first_name: string;
  last_name: string;
  nickname: string;
  age: number;
  position: "GK" | "DEF" | "MID" | "FWD";
  overall_rating: number;
  skills: { speed: number; technique: number; shooting: number; passing: number; heading: number; defense: number; goalkeeping: number; creativity?: number; setPieces?: number };
  physical: { stamina: number; strength: number; injuryProneness: number; height?: number; weight?: number; bodyType?: "thin" | "normal" | "athletic" | "stocky" | "obese"; preferredFoot?: "left" | "right" | "both"; preferredSide?: "left" | "center" | "right" | "any" };
  /** Postava z detailu hráče: ideální váha a úpravy vlastností (API playerBodyView). */
  body?: {
    bodyType: "thin" | "normal" | "athletic" | "stocky" | "obese" | null;
    idealWeight: number | null;
    /** Váha proti ideálu slovy (API playerBodyView). */
    weightCategory?: "under" | "ideal" | "muscular" | "over" | "obese" | null;
    effects: { speed: number; stamina: number; strength: number; heading: number };
    /** Změna váhy za ~měsíc (kg), jen u vlastních hráčů a jen v detailu hráče. */
    trend30d?: number | null;
  };
  personality: { discipline: number; patriotism: number; alcohol: number; temper: number; leadership?: number; workRate?: number; aggression?: number; consistency?: number; clutch?: number; injuryProneness?: number };
  lifeContext: { occupation: string; condition: number; morale: number };
  avatar: Record<string, unknown>;
  description: string;
  residence?: string;
  commute_km?: number;
  loan_from_team_id?: string | null;
  loan_until?: string | null;
  /** Detail hostování z detailu hráče — kdo hráče vlastní, kde hraje a kdy se vrací. */
  loan?: {
    ownerTeamId: string; ownerTeamName: string;
    borrowerTeamId: string; borrowerTeamName: string;
    until: string; daysLeft: number; fee: number;
    /** Dívá se kmenový klub hráče. */
    isParentClub: boolean;
    /** Dívá se klub, u kterého hráč zrovna hostuje. */
    isBorrower: boolean;
    /** Povolat zpět jde jen z kmenového klubu a jen u hostování zdarma. */
    canRecall: boolean;
  } | null;
  squad_number?: number | null;
  weekly_wage?: number | null;
  is_celebrity?: number;
  coach_relationship?: number;
  injury?: { type: string; daysRemaining: number } | null;
  status?: string | null;
}

export interface CareerStats {
  seasons: {
    season: number;
    teamId: string;
    teamName: string;
    teamColor: string;
    teamSecondary: string;
    teamBadge: string;
    leagueName: string | null;
    appearances: number;
    goals: number;
    assists: number;
    yellowCards: number;
    redCards: number;
    avgRating: number;
    cleanSheets: number;
    minutesPlayed: number;
  }[];
  totals: {
    appearances: number;
    goals: number;
    assists: number;
    yellowCards: number;
    redCards: number;
  };
}

export interface PlayerContract {
  id: string;
  teamId: string;
  teamName: string;
  teamColor: string;
  teamSecondary: string;
  teamBadge: string;
  seasonNumber: number;
  joinedAt: string;
  leftAt: string | null;
  joinType: string;
  joinLabel: string;
  leaveType: string | null;
  fee: number;
  /** Druhý hráč výměny — u ní je `fee` jen doplatek, ne cena. */
  swapPartner: string | null;
  /** Přestup na splátky: počet týdenních splátek (0 = jednorázově). `fee` je i tak celková cena. */
  installments?: number;
  /** Procenta z dalšího prodeje pro předchozí klub. */
  sellOnPct?: number;
  isActive: boolean;
}

export interface PlayerMatchEntry {
  matchId: string;
  date: string;
  round: number;
  isHome: boolean;
  opponent: string;
  opponentId: string;
  opponentColor: string;
  opponentSecondary: string;
  opponentBadge: string;
  homeScore: number;
  awayScore: number;
  result: "W" | "D" | "L";
  position: string;
  started: boolean;
  minutesPlayed: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  rating: number;
  weather: string | null;
}

export interface TeamMatchResult {
  id: string;
  round: number;
  date: string;
  isHome: boolean;
  opponent: string;
  opponentId: string;
  opponentColor: string;
  opponentSecondary: string;
  opponentBadge: string;
  homeScore: number;
  awayScore: number;
  result: "W" | "D" | "L";
  weather: string | null;
  attendance: number | null;
  stadium: string | null;
}

export interface TeamMatchResults {
  matches: TeamMatchResult[];
  form: string[];
  summary: { played: number; wins: number; draws: number; losses: number; goalsFor: number; goalsAgainst: number };
  topPlayers: {
    playerId: string;
    name: string;
    isDeparted?: boolean;
    nickname: string | null;
    position: string;
    goals: number;
    assists: number;
    yellowCards: number;
    redCards: number;
    appearances: number;
    avgRating: number;
  }[];
}

export interface ManagerProfile {
  id: string;
  userId?: string;
  name: string;
  /** Trenér AI klubu: k jménu patří odznak s robotem (`CoachName`, v textu `coachDisplayName`). */
  coachIsAi?: boolean;
  backstory: string;
  avatar: Record<string, unknown>;
  age?: number;
  coaching?: number;
  motivation?: number;
  tactics?: number;
  youthDevelopment?: number;
  discipline?: number;
  reputation?: number;
  bio?: string;
  birthplace?: string;
  /** Obec bydliště (profil na /obec/[id]); u starších trenérů dohledaná podle názvu. */
  birthplaceVillageId?: string | null;
  licenceLevel?: number;
  licenceSource?: "derived" | "course" | "ai_upgrade";
  licenceObtainedAt?: string | null;
}
