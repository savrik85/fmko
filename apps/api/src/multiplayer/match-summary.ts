/**
 * Match summary — "Co rozhodlo o výsledku".
 *
 * Pure post-mortem analyzer: vezme uložená data zápasu (lineup_data, player_ratings,
 * events) a vrátí top 3 faktory které rozhodly. Vysvětluje hráči, proč vyhrál/prohrál.
 *
 * Neslouží jako JIT compute pro existující zápasy — žádný DB write.
 */

import type { MatchEvent } from "@okresni-masina/shared";

interface LineupPlayer {
  id: string;
  name: string;
  position: string;
  naturalPosition: string;
  rating: number;  // pre-match rating ze skill atributů, ne match rating
}

interface LineupData {
  starters: LineupPlayer[];
  subs: LineupPlayer[];
  formation: string;
  tactic: string;
  captainId: string | null;
}

type Impact = "HIGH_NEGATIVE" | "MEDIUM_NEGATIVE" | "LOW_NEGATIVE" | "NEUTRAL" | "LOW_POSITIVE" | "MEDIUM_POSITIVE" | "HIGH_POSITIVE";

export type FactorType = "key_matchup" | "tactic" | "discipline" | "captain" | "goalkeeper" | "absences";

export interface SummaryFactor {
  type: FactorType;
  label: string;       // krátký nadpis ("Brankář", "Taktika")
  description: string; // 1 věta vysvětlující dopad
  impact: Impact;      // jak velký vliv to mělo
  ownValue?: number;   // číselná hodnota pro vlastní tým
  oppValue?: number;   // pro soupeře
}

export interface MatchSummary {
  factors: SummaryFactor[];          // top 3 faktory
  ownStrength: { gk: number; def: number; mid: number; fwd: number };
  opponentStrength: { gk: number; def: number; mid: number; fwd: number };
  ownTactic: string;
  opponentTactic: string;
  outcome: "WIN" | "DRAW" | "LOSS";
  summaryText: string;
}

const TACTIC_LABEL: Record<string, string> = {
  offensive: "Útočná",
  balanced: "Vyrovnaná",
  defensive: "Defenzivní",
  long_ball: "Nakopávané",
  possession: "Držení míče",
  pressing: "Vysoký presink",
};

const TACTIC_VS_TACTIC: Record<string, Record<string, string>> = {
  offensive: {
    defensive: "Útok proti pevné obraně — nevyhrávající kombinace.",
    balanced: "Útočná taktika tě posílila v útoku, ale otevřela obranu.",
  },
  defensive: {
    offensive: "Defenzivní postoj proti silnému útoku — solidní volba.",
    balanced: "Defenzivní taktika omezila útok i obranu.",
  },
};

interface BuildInput {
  homeLineupData: LineupData | null;
  awayLineupData: LineupData | null;
  playerRatings: Record<string, number>;
  events: MatchEvent[];
  homeScore: number;
  awayScore: number;
  isOwnHome: boolean;  // jestli "vlastní" tým je domácí
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function avgRatingForPosition(starters: LineupPlayer[], ratings: Record<string, number>, pos: string): number {
  const players = starters.filter((p) => (p.position ?? p.naturalPosition) === pos);
  const matchRatings = players.map((p) => ratings[p.id]).filter((r): r is number => typeof r === "number" && r > 0);
  // Pokud máme match ratingy, použij je. Jinak fallback na pre-match rating ze skill.
  if (matchRatings.length > 0) return avg(matchRatings);
  return avg(players.map((p) => p.rating / 10)); // pre-match rating je 0-100, normalizuj na 0-10
}

function deltaToImpact(delta: number): Impact {
  if (delta >= 2.0) return "HIGH_POSITIVE";
  if (delta >= 1.0) return "MEDIUM_POSITIVE";
  if (delta >= 0.3) return "LOW_POSITIVE";
  if (delta <= -2.0) return "HIGH_NEGATIVE";
  if (delta <= -1.0) return "MEDIUM_NEGATIVE";
  if (delta <= -0.3) return "LOW_NEGATIVE";
  return "NEUTRAL";
}

export function buildMatchSummary(input: BuildInput): MatchSummary | null {
  const { homeLineupData, awayLineupData, playerRatings, events, homeScore, awayScore, isOwnHome } = input;
  if (!homeLineupData || !awayLineupData) return null;

  const ownLineup = isOwnHome ? homeLineupData : awayLineupData;
  const oppLineup = isOwnHome ? awayLineupData : homeLineupData;
  const ownScore = isOwnHome ? homeScore : awayScore;
  const oppScore = isOwnHome ? awayScore : homeScore;

  const ownStrength = {
    gk: round1(avgRatingForPosition(ownLineup.starters, playerRatings, "GK")),
    def: round1(avgRatingForPosition(ownLineup.starters, playerRatings, "DEF")),
    mid: round1(avgRatingForPosition(ownLineup.starters, playerRatings, "MID")),
    fwd: round1(avgRatingForPosition(ownLineup.starters, playerRatings, "FWD")),
  };
  const opponentStrength = {
    gk: round1(avgRatingForPosition(oppLineup.starters, playerRatings, "GK")),
    def: round1(avgRatingForPosition(oppLineup.starters, playerRatings, "DEF")),
    mid: round1(avgRatingForPosition(oppLineup.starters, playerRatings, "MID")),
    fwd: round1(avgRatingForPosition(oppLineup.starters, playerRatings, "FWD")),
  };

  const outcome: "WIN" | "DRAW" | "LOSS" =
    ownScore > oppScore ? "WIN" : ownScore < oppScore ? "LOSS" : "DRAW";

  // ── Generuj kandidáty faktorů ────────────────────────────────────────────
  const candidates: SummaryFactor[] = [];

  // 1. Key matchup — největší rozdíl po liniích
  const matchups: Array<{ line: keyof typeof ownStrength; label: string; emoji: string }> = [
    { line: "gk", label: "Brankář", emoji: "🧤" },
    { line: "def", label: "Obrana", emoji: "🛡️" },
    { line: "mid", label: "Záloha", emoji: "🎯" },
    { line: "fwd", label: "Útok", emoji: "⚔️" },
  ];

  for (const { line, label } of matchups) {
    const ownVal = ownStrength[line];
    const oppVal = opponentStrength[line];
    if (ownVal === 0 || oppVal === 0) continue;
    const delta = ownVal - oppVal;
    if (Math.abs(delta) < 0.3) continue; // nezajímavé
    const impact = deltaToImpact(delta);
    const description = delta > 0
      ? `${label} byl o ${Math.abs(delta).toFixed(1)} bodu lepší než soupeř (${ownVal.toFixed(1)} vs ${oppVal.toFixed(1)}).`
      : `${label} byl o ${Math.abs(delta).toFixed(1)} bodu slabší než soupeř (${ownVal.toFixed(1)} vs ${oppVal.toFixed(1)}).`;
    candidates.push({
      type: line === "gk" ? "goalkeeper" : "key_matchup",
      label,
      description,
      impact,
      ownValue: ownVal,
      oppValue: oppVal,
    });
  }

  // 2. Tactic matchup
  const ownTactic = ownLineup.tactic;
  const oppTactic = oppLineup.tactic;
  if (ownTactic !== oppTactic) {
    const note = TACTIC_VS_TACTIC[ownTactic]?.[oppTactic];
    if (note) {
      // Heuristika: pokud výhra a taktika doporučená → positive, jinak negative
      const goodCombo =
        (ownTactic === "defensive" && oppTactic === "offensive") ||
        (ownTactic === "offensive" && oppTactic === "balanced");
      const impact: Impact = outcome === "WIN"
        ? (goodCombo ? "MEDIUM_POSITIVE" : "LOW_POSITIVE")
        : (goodCombo ? "LOW_NEGATIVE" : "MEDIUM_NEGATIVE");
      candidates.push({
        type: "tactic",
        label: "Taktika",
        description: `${TACTIC_LABEL[ownTactic]} vs ${TACTIC_LABEL[oppTactic]} — ${note}`,
        impact,
      });
    }
  }

  // 3. Karty a disciplína — type "card" + detail "red"
  const isRedCard = (e: MatchEvent): boolean => e.type === "card" && e.detail === "red";
  const ownRed = events.filter((e) => isRedCard(e) && playerIsInLineup(e, ownLineup)).length;
  const oppRed = events.filter((e) => isRedCard(e) && playerIsInLineup(e, oppLineup)).length;
  if (ownRed > 0 || oppRed > 0) {
    const netRed = oppRed - ownRed;
    if (Math.abs(netRed) >= 1) {
      candidates.push({
        type: "discipline",
        label: "Disciplína",
        description: ownRed > 0
          ? `Vyloučení (${ownRed}) ve tvém týmu významně ovlivnilo zápas.`
          : `Soupeř dostal ${oppRed} červen${oppRed === 1 ? "ou kartu" : "é karty"} a ty jsi toho využil.`,
        impact: ownRed > 0 ? "HIGH_NEGATIVE" : "MEDIUM_POSITIVE",
      });
    }
  }

  // ── Vyber top 3 podle |impact| ────────────────────────────────────────────
  const impactOrder: Record<Impact, number> = {
    HIGH_NEGATIVE: 6, HIGH_POSITIVE: 6,
    MEDIUM_NEGATIVE: 4, MEDIUM_POSITIVE: 4,
    LOW_NEGATIVE: 2, LOW_POSITIVE: 2,
    NEUTRAL: 0,
  };
  candidates.sort((a, b) => impactOrder[b.impact] - impactOrder[a.impact]);
  const factors = candidates.slice(0, 3);

  // ── Generuj souhrnný text ─────────────────────────────────────────────────
  const summaryText = buildSummaryText(outcome, factors, ownStrength, opponentStrength);

  return {
    factors,
    ownStrength,
    opponentStrength,
    ownTactic: TACTIC_LABEL[ownTactic] ?? ownTactic,
    opponentTactic: TACTIC_LABEL[oppTactic] ?? oppTactic,
    outcome,
    summaryText,
  };
}

function buildSummaryText(
  outcome: "WIN" | "DRAW" | "LOSS",
  factors: SummaryFactor[],
  own: { gk: number; def: number; mid: number; fwd: number },
  opp: { gk: number; def: number; mid: number; fwd: number },
): string {
  if (factors.length === 0) {
    return outcome === "WIN"
      ? "Vyrovnaný zápas — výhru přinesly drobné rozdíly v jednotlivých duelech."
      : outcome === "DRAW"
        ? "Vyrovnaný souboj bez výrazných rozdílů. Remíza odpovídá síle obou týmů."
        : "Soupeř byl celkově silnější — bez výrazné slabiny v jedné konkrétní linii.";
  }

  const topFactor = factors[0];
  if (outcome === "WIN") {
    return `Vyhráli jste díky **${topFactor.label.toLowerCase()}** — ${topFactor.description}`;
  } else if (outcome === "LOSS") {
    return `Klíčový rozdíl: **${topFactor.label.toLowerCase()}**. ${topFactor.description}`;
  } else {
    return `Vyrovnaný souboj. Tvoje silnější ${strongLines(own, opp).join(" a ")} stačila jen na remízu.`;
  }
}

function strongLines(own: { gk: number; def: number; mid: number; fwd: number }, opp: typeof own): string[] {
  const lines: Array<[keyof typeof own, string]> = [
    ["gk", "brankář"], ["def", "obrana"], ["mid", "záloha"], ["fwd", "útok"],
  ];
  return lines.filter(([k]) => own[k] - opp[k] > 0.5).map(([, l]) => l);
}

function playerIsInLineup(event: MatchEvent, lineup: LineupData): boolean {
  const ids = new Set([...lineup.starters, ...lineup.subs].map((p) => p.id));
  // MatchEvent.playerId může být engineId (number) nebo dbId. Posíláme dbId v lineup,
  // takže porovnání musí ladit s tím, jak match-runner ukládá events.
  // Pro tuto JIT funkci stačí kontrolovat existenci jako string match.
  const eventPlayerId = (event as { playerId?: string | number }).playerId;
  if (eventPlayerId == null) return false;
  return ids.has(String(eventPlayerId));
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
