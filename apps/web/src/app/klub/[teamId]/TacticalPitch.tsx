"use client";

import type { ClubWebsitePlayer } from "@okresni-masina/shared";

const POSITION_LABELS_CZ: Record<string, string> = {
  GK: "Brankář",
  BRA: "Brankář",
  DEF: "Obránce",
  OBR: "Obránce",
  CB: "Stoper",
  LB: "Levý obránce",
  RB: "Pravý obránce",
  LWB: "Krajní obránce",
  RWB: "Krajní obránce",
  MID: "Záložník",
  ZAL: "Záložník",
  ZÁL: "Záložník",
  CM: "Záložník",
  LM: "Levý záložník",
  RM: "Pravý záložník",
  CDM: "Def. záložník",
  CAM: "Of. záložník",
  DM: "Def. záložník",
  AM: "Of. záložník",
  FWD: "Útočník",
  UTO: "Útočník",
  ÚTO: "Útočník",
  ST: "Útočník",
  CF: "Útočník",
  LW: "Levé křídlo",
  RW: "Pravé křídlo",
};

function formatPositionLabel(pos?: string): string {
  if (!pos) return "";
  return POSITION_LABELS_CZ[pos.toUpperCase()] || pos;
}

interface TacticalPitchProps {
  players: ClubWebsitePlayer[];
  primaryColor: string;
  secondaryColor: string;
}

export function TacticalPitch({ players, primaryColor, secondaryColor }: TacticalPitchProps) {
  if (!players || players.length === 0) {
    return (
      <div className="p-8 text-center text-white/50 bg-black/20 rounded-2xl border border-white/10">
        Žádní hráči nejsou v kádru k dispozici.
      </div>
    );
  }

  // Pick starting 11 in a 4-4-2 or 4-3-3 formation
  const gks = players.filter((p) => p.position === "GK");
  const defs = players.filter((p) => ["CB", "LB", "RB", "DEF"].includes(p.position));
  const mids = players.filter((p) => ["CM", "LM", "RM", "DM", "AM", "MID"].includes(p.position));
  const fwds = players.filter((p) => ["ST", "CF", "LW", "RW", "FWD"].includes(p.position));

  const pickedGk = gks[0] || players[0];
  const remainingAfterGk = players.filter((p) => p.id !== pickedGk.id);

  const pickedDefs = (defs.length >= 4 ? defs.slice(0, 4) : remainingAfterGk.slice(0, 4));
  const pickedDefIds = new Set(pickedDefs.map((p) => p.id));
  const remainingAfterDefs = remainingAfterGk.filter((p) => !pickedDefIds.has(p.id));

  const pickedMids = (mids.length >= 4 ? mids.slice(0, 4) : remainingAfterDefs.slice(0, 4));
  const pickedMidIds = new Set(pickedMids.map((p) => p.id));
  const remainingAfterMids = remainingAfterDefs.filter((p) => !pickedMidIds.has(p.id));

  const pickedFwds = (fwds.length >= 2 ? fwds.slice(0, 2) : remainingAfterMids.slice(0, 2));

  const renderPlayerNode = (player: ClubWebsitePlayer | undefined, labelPos: string) => {
    if (!player) return null;
    const czPos = player.positionName || formatPositionLabel(player.position || labelPos);
    return (
      <div className="flex flex-col items-center group relative cursor-pointer">
        {/* Shirt / Node Circle */}
        <div
          className="w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center font-heading font-black text-sm sm:text-base border-2 border-white shadow-lg transition-transform group-hover:scale-110"
          style={{
            background: `radial-gradient(circle at 30% 30%, ${secondaryColor}44, ${primaryColor})`,
            color: "#ffffff",
          }}
        >
          {player.squadNumber ? `#${player.squadNumber}` : "⚽"}
        </div>

        {/* Name pill */}
        <div className="mt-1 px-2 py-0.5 rounded bg-black/80 text-white font-heading font-bold text-[10px] sm:text-xs max-w-[80px] sm:max-w-[100px] truncate text-center shadow">
          {player.lastName}
        </div>

        {/* Position tag */}
        <div className="text-[9px] font-heading font-semibold text-white/80 flex items-center gap-1 mt-0.5 uppercase tracking-wide">
          <span>{czPos}</span>
        </div>

        {/* Hover detail tooltip */}
        <div className="absolute bottom-full mb-2 hidden group-hover:flex flex-col bg-gray-900 border border-white/20 rounded-xl p-2.5 text-xs text-white shadow-2xl z-20 w-36 pointer-events-none">
          <div className="font-bold text-white border-b border-white/10 pb-1 mb-1">
            <div>{player.firstName} {player.lastName}</div>
            <div className="text-[10px] text-slate-300 font-semibold">{czPos}</div>
          </div>
          <div className="flex justify-between text-white/70">
            <span>Zápasy:</span>
            <span className="font-bold text-white">{player.stats.appearances}</span>
          </div>
          <div className="flex justify-between text-white/70">
            <span>Góly:</span>
            <span className="font-bold text-emerald-400">{player.stats.goals}</span>
          </div>
          <div className="flex justify-between text-white/70">
            <span>Asistence:</span>
            <span className="font-bold text-yellow-400">{player.stats.assists}</span>
          </div>
          <div className="flex justify-between text-white/70">
            <span>Věk:</span>
            <span className="font-bold text-white">{player.age} let</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="relative w-full max-w-2xl mx-auto aspect-[4/3] rounded-3xl overflow-hidden border-2 border-white/20 shadow-2xl bg-[#1b431b]">
      {/* Pitch Lines SVG */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none opacity-40"
        viewBox="0 0 400 300"
        fill="none"
        stroke="white"
        strokeWidth="2"
      >
        {/* Outer border */}
        <rect x="15" y="15" width="370" height="270" />
        {/* Halfway line */}
        <line x1="200" y1="15" x2="200" y2="285" />
        {/* Center circle */}
        <circle cx="200" cy="150" r="45" />
        <circle cx="200" cy="150" r="3" fill="white" />
        {/* Left penalty box */}
        <rect x="15" y="65" width="65" height="170" />
        <rect x="15" y="105" width="25" height="90" />
        <circle cx="65" cy="150" r="2.5" fill="white" />
        {/* Right penalty box */}
        <rect x="320" y="65" width="65" height="170" />
        <rect x="360" y="105" width="25" height="90" />
        <circle cx="335" cy="150" r="2.5" fill="white" />
      </svg>

      {/* Field Grass Stripes */}
      <div
        className="absolute inset-0 opacity-15 pointer-events-none"
        style={{
          backgroundImage: "repeating-linear-gradient(90deg, #000, #000 40px, transparent 40px, transparent 80px)",
        }}
      />

      {/* Tactical Formations Nodes (Vertical / Horizontal Layout) */}
      <div className="relative h-full flex flex-col justify-between py-6 px-4 z-10">
        {/* Goalkeeper */}
        <div className="flex justify-center">
          {renderPlayerNode(pickedGk, "GK")}
        </div>

        {/* Defenders (4) */}
        <div className="flex justify-around px-2">
          {pickedDefs.map((p, i) => (
            <div key={p.id}>{renderPlayerNode(p, `DEF`)}</div>
          ))}
        </div>

        {/* Midfielders (4) */}
        <div className="flex justify-around px-4">
          {pickedMids.map((p, i) => (
            <div key={p.id}>{renderPlayerNode(p, `MID`)}</div>
          ))}
        </div>

        {/* Forwards (2) */}
        <div className="flex justify-center gap-16 sm:gap-24">
          {pickedFwds.map((p, i) => (
            <div key={p.id}>{renderPlayerNode(p, `FWD`)}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
