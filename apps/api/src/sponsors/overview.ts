/**
 * Přehled oblíbenosti klubu u firem v okrese a odvození sezóny podpisu smlouvy (čisté funkce, bez DB).
 */
import { DEFAULT_FAVOR } from "./favor-math";

export type FavorBand = "loves" | "friendly" | "neutral" | "cold" | "hostile";
export const FAVOR_BANDS: readonly FavorBand[] = ["loves", "friendly", "neutral", "cold", "hostile"];

/** Hranice pásem shodné s favorLabel na webu (apps/web/src/lib/sponsor-owners.ts). */
export function favorBand(f: number): FavorBand {
  if (f >= 80) return "loves";
  if (f >= 60) return "friendly";
  if (f >= 40) return "neutral";
  if (f >= 20) return "cold";
  return "hostile";
}

export function countBands(favors: number[]): Record<FavorBand, number> {
  const out: Record<FavorBand, number> = { loves: 0, friendly: 0, neutral: 0, cold: 0, hostile: 0 };
  for (const f of favors) out[favorBand(f)]++;
  return out;
}

export function averageFavor(favors: number[]): number | null {
  if (favors.length === 0) return null;
  return Math.round((favors.reduce((s, f) => s + f, 0) / favors.length) * 10) / 10;
}

export interface ClubAverage { teamId: string; avgFavor: number }

/** Pořadí klubu podle průměrné náklonnosti. Průměry se porovnávají na desetiny, shodný průměr = shodné pořadí. */
export function rankAmongClubs(clubs: ClubAverage[], teamId: string): { rank: number; clubsInDistrict: number } | null {
  const me = clubs.find((c) => c.teamId === teamId);
  if (!me) return null;
  const mine = Math.round(me.avgFavor * 10);
  const better = clubs.filter((c) => Math.round(c.avgFavor * 10) > mine).length;
  return { rank: better + 1, clubsInDistrict: clubs.length };
}

export interface FirmFavor { sponsorId: number; name: string; ownerName: string | null; favor: number }

/**
 * Nejoblíbenější = jen firmy nad výchozí náklonností, nejchladnější = jen pod ní.
 * Firma, která klub ještě nepoznala (výchozí 40), nepatří ani do jednoho seznamu.
 */
export function pickExtremes(firms: FirmFavor[], n = 3): { top: FirmFavor[]; coldest: FirmFavor[] } {
  const byName = (a: FirmFavor, b: FirmFavor) => a.name.localeCompare(b.name, "cs");
  const top = firms.filter((f) => f.favor > DEFAULT_FAVOR)
    .sort((a, b) => b.favor - a.favor || byName(a, b)).slice(0, n);
  const coldest = firms.filter((f) => f.favor < DEFAULT_FAVOR)
    .sort((a, b) => a.favor - b.favor || byName(a, b)).slice(0, n);
  return { top, coldest };
}

/**
 * Sezóna, ve které byla smlouva podepsána: poslední sezóna založená nejpozději v okamžiku podpisu.
 * Obě hodnoty jsou `datetime('now')` ve formátu `YYYY-MM-DD HH:MM:SS`, porovnávají se jako řetězce.
 * Podpis těsně před založením první sezóny (seed klubu) patří do první sezóny.
 */
export function seasonAtDate(seasons: Array<{ number: number; createdAt: string }>, signedAt: string): number | null {
  if (seasons.length === 0) return null;
  const sorted = [...seasons].sort((a, b) => a.number - b.number);
  let found: number | null = null;
  for (const s of sorted) if (s.createdAt <= signedAt) found = s.number;
  return found ?? sorted[0].number;
}
