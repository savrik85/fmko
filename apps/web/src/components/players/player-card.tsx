"use client";

import { Badge, StatBar } from "@/components/ui";

export interface PlayerCardData {
  id: number;
  firstName: string;
  lastName: string;
  nickname: string | null;
  age: number;
  position: "GK" | "DEF" | "MID" | "FWD";
  occupation: string;
  speed: number;
  technique: number;
  shooting: number;
  passing: number;
  heading: number;
  defense: number;
  goalkeeping: number;
  stamina: number;
  condition: number;
  morale: number;
  alcohol: number;
  discipline: number;
  primaryColor: string;
}

const POS_LABELS: Record<string, string> = {
  GK: "BRA", DEF: "OBR", MID: "ZÁL", FWD: "ÚTO",
};

function overallRating(p: PlayerCardData): number {
  const main = p.position === "GK"
    ? p.goalkeeping * 2 + p.defense + p.passing
    : p.position === "DEF"
      ? p.defense * 2 + p.heading + p.speed
      : p.position === "MID"
        ? p.technique + p.passing * 2 + p.stamina
        : p.shooting * 2 + p.speed + p.technique;
  return Math.round(main / 4);
}

function moodEmoji(morale: number): string {
  if (morale >= 80) return "\u{1F60A}";
  if (morale >= 60) return "\u{1F642}";
  if (morale >= 40) return "\u{1F610}";
  if (morale >= 20) return "\u{1F61E}";
  return "\u{1F621}";
}

function conditionLabel(condition: number): { text: string; color: string } {
  if (condition >= 80) return { text: "Fit", color: "text-pitch-500" };
  if (condition >= 50) return { text: "OK", color: "text-gold-500" };
  if (condition >= 20) return { text: "Unavený", color: "text-orange-500" };
  return { text: "Vyčerpaný", color: "text-card-red" };
}

/** Compact card — for squad list */
export function PlayerCardCompact({ player, onClick }: { player: PlayerCardData; onClick?: () => void }) {
  const rating = overallRating(player);
  const cond = conditionLabel(player.condition);

  return (
    <button
      onClick={onClick}
      className="card card-hover w-full p-4 text-left flex gap-3 items-center"
    >
      {/* Avatar placeholder */}
      <div
        className="w-11 h-11 rounded-full shrink-0 flex items-center justify-center text-white font-heading font-bold"
        style={{ backgroundColor: player.primaryColor }}
      >
        {player.firstName[0]}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5">
          <span className="font-heading font-bold truncate">
            {player.firstName} {player.lastName}
          </span>
          {player.nickname && (
            <span className="text-xs text-gold-500 shrink-0">&bdquo;{player.nickname}&ldquo;</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted mt-0.5">
          <Badge variant="position">{POS_LABELS[player.position]}</Badge>
          <span>{player.age}</span>
          <span>&middot;</span>
          <span className={cond.color}>{cond.text}</span>
          <span>{moodEmoji(player.morale)}</span>
        </div>
      </div>

      {/* Rating */}
      <div className="text-right shrink-0">
        <div className="font-heading font-bold text-xl tabular-nums" style={{ color: player.primaryColor }}>
          {rating}
        </div>
      </div>
    </button>
  );
}

/** Full profile card — detail view */
export function PlayerCardFull({ player, onClose }: { player: PlayerCardData; onClose: () => void }) {
  const rating = overallRating(player);
  const cond = conditionLabel(player.condition);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="bg-paper w-full sm:max-w-md sm:rounded-card rounded-t-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 text-white rounded-t-2xl sm:rounded-t-card" style={{ backgroundColor: player.primaryColor }}>
          <div className="flex justify-between items-start">
            <div>
              <div className="text-h2 text-white">
                {player.firstName} {player.lastName}
              </div>
              {player.nickname && (
                <div className="text-white/70">&bdquo;{player.nickname}&ldquo;</div>
              )}
              <div className="text-white/70 text-sm mt-1">
                {player.age} let &middot; {player.occupation}
              </div>
            </div>
            <div className="text-right">
              <div className="font-heading font-bold text-4xl tabular-nums">{rating}</div>
              <Badge variant="position">{POS_LABELS[player.position]}</Badge>
            </div>
          </div>
        </div>

        {/* Status */}
        <div className="px-5 py-3 flex gap-4 border-b border-gray-100">
          <div className="text-center">
            <div className="text-sm font-heading font-bold">{player.condition}%</div>
            <div className={`text-xs ${cond.color}`}>{cond.text}</div>
          </div>
          <div className="text-center">
            <div className="text-sm font-heading font-bold">{moodEmoji(player.morale)} {player.morale}</div>
            <div className="text-xs text-muted">Morálka</div>
          </div>
          <div className="text-center">
            <div className="text-sm font-heading font-bold">{player.alcohol > 14 ? "\u{1F37A}" : player.discipline > 14 ? "\u{1F3C6}" : "\u2796"}</div>
            <div className="text-xs text-muted">{player.alcohol > 14 ? "Pivátor" : player.discipline > 14 ? "Profík" : "Normál"}</div>
          </div>
        </div>

        {/* Stats */}
        <div className="px-5 py-4 space-y-2.5">
          <div className="text-xs text-muted uppercase font-heading font-bold mb-1">Fotbalové atributy</div>
          <StatBar label="RYC" value={player.speed} />
          <StatBar label="TEC" value={player.technique} />
          <StatBar label="STŘ" value={player.shooting} />
          <StatBar label="PŘI" value={player.passing} />
          <StatBar label="HLA" value={player.heading} />
          <StatBar label="OBR" value={player.defense} />
          {player.position === "GK" && <StatBar label="BRA" value={player.goalkeeping} />}
          <div className="text-xs text-muted uppercase font-heading font-bold mt-4 mb-1">Fyzické</div>
          <StatBar label="KON" value={player.stamina} />
        </div>

        {/* Close */}
        <div className="p-5 pt-0">
          <button
            onClick={onClose}
            className="w-full py-3 rounded-card bg-gray-100 hover:bg-gray-200 font-heading font-bold text-muted transition-colors"
          >
            Zavřít
          </button>
        </div>
      </div>
    </div>
  );
}
