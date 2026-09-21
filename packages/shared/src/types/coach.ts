/**
 * Trenér: vztah hráčů k němu, dopady jeho vlastností, licence a kurzy.
 *
 * Sdílené mezi serverem a webem, aby profil trenéra ukazoval přesně ta čísla,
 * se kterými počítá hra. Správné odpovědi testů sem NEPATŘÍ (web by je viděl).
 */

// ── Vztah hráče k trenérovi (players.coach_relationship, 0–100) ──

export type CoachRelationBandKey = "idol" | "loyal" | "neutral" | "skeptic" | "hostile";

export interface CoachRelationBand {
  key: CoachRelationBandKey;
  label: string;
  icon: string;
  tone: "good" | "neutral" | "bad";
}

const COACH_RELATION_BANDS: Array<CoachRelationBand & { min: number }> = [
  { min: 80, key: "idol", label: "Idol", icon: "❤️", tone: "good" },
  { min: 60, key: "loyal", label: "Loajální", icon: "👍", tone: "good" },
  { min: 40, key: "neutral", label: "Neutrální", icon: "🤝", tone: "neutral" },
  { min: 20, key: "skeptic", label: "Skeptický", icon: "🙄", tone: "bad" },
  { min: 0, key: "hostile", label: "Nepřátelský", icon: "💢", tone: "bad" },
];

/** Slovní pásmo vztahu. Hranice 80/60/40/20 platí v kádru, na profilu hráče i v Kabině. */
export function coachRelationBand(value: number): CoachRelationBand {
  const band = COACH_RELATION_BANDS.find((b) => value >= b.min) ?? COACH_RELATION_BANDS[COACH_RELATION_BANDS.length - 1];
  return { key: band.key, label: band.label, icon: band.icon, tone: band.tone };
}

export const COACH_RELATION_BAND_ORDER: CoachRelationBandKey[] = ["idol", "loyal", "neutral", "skeptic", "hostile"];

export function coachRelationBandByKey(key: CoachRelationBandKey): CoachRelationBand {
  const band = COACH_RELATION_BANDS.find((b) => b.key === key) ?? COACH_RELATION_BANDS[2];
  return { key: band.key, label: band.label, icon: band.icon, tone: band.tone };
}
