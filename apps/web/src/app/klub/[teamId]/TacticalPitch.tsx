"use client";

import { useState } from "react";
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

const GROUPS = {
  gk: new Set(["GK", "BRA"]),
  def: new Set(["DEF", "OBR", "CB", "LB", "RB", "LWB", "RWB"]),
  mid: new Set(["MID", "ZAL", "ZÁL", "CM", "LM", "RM", "CDM", "CAM", "DM", "AM"]),
  fwd: new Set(["FWD", "UTO", "ÚTO", "ST", "CF", "LW", "RW"]),
};

function formatPositionLabel(pos?: string): string {
  if (!pos) return "";
  return POSITION_LABELS_CZ[pos.toUpperCase()] || pos;
}

/** Nejvytíženější hráči napřed: základ je ten, kdo nejvíc hraje, ne kdo má nejnižší číslo. */
function byUsage(a: ClubWebsitePlayer, b: ClubWebsitePlayer) {
  return (b.stats.minutesPlayed - a.stats.minutesPlayed)
    || (b.stats.appearances - a.stats.appearances)
    || (b.overallRating - a.overallRating);
}

/**
 * Základní jedenáctka 4-4-2 podle odehraných minut. Každý hráč nejvýš jednou:
 * chybějící obránce/záložníka doplní nejvytíženější dosud nevybraný hráč z pole.
 * Brankáře nikdy nenahrazuje hráč z pole.
 */
function pickStartingEleven(players: ClubWebsitePlayer[]) {
  const sorted = [...players].sort(byUsage);
  const used = new Set<string>();
  const inGroup = (group: Set<string>) => (p: ClubWebsitePlayer) => group.has((p.position || "").toUpperCase());

  const take = (preferred: (p: ClubWebsitePlayer) => boolean, count: number) => {
    const picked: ClubWebsitePlayer[] = [];
    for (const p of sorted) {
      if (picked.length >= count) break;
      if (!used.has(p.id) && preferred(p)) {
        picked.push(p);
        used.add(p.id);
      }
    }
    // Doplnění z pole (nikdy brankář)
    for (const p of sorted) {
      if (picked.length >= count) break;
      if (!used.has(p.id) && !inGroup(GROUPS.gk)(p)) {
        picked.push(p);
        used.add(p.id);
      }
    }
    return picked;
  };

  const gk = sorted.find((p) => inGroup(GROUPS.gk)(p)) ?? null;
  if (gk) used.add(gk.id);
  const defs = take(inGroup(GROUPS.def), 4);
  const mids = take(inGroup(GROUPS.mid), 4);
  const fwds = take(inGroup(GROUPS.fwd), 2);
  return { gk, defs, mids, fwds };
}

interface TacticalPitchProps {
  players: ClubWebsitePlayer[];
  primaryColor: string;
  secondaryColor: string;
}

export function TacticalPitch({ players, primaryColor, secondaryColor }: TacticalPitchProps) {
  // Na mobilu není hover: detail hráče se ukáže klepnutím
  const [activeId, setActiveId] = useState<string | null>(null);

  if (!players || players.length === 0) {
    return (
      <div className="p-8 text-center text-base text-white/60 bg-black/20 rounded-2xl border border-white/10">
        Žádní hráči nejsou v kádru k dispozici.
      </div>
    );
  }

  const { gk, defs, mids, fwds } = pickStartingEleven(players);

  const renderPlayerNode = (player: ClubWebsitePlayer, tooltipBelow = false) => {
    const czPos = player.positionName || formatPositionLabel(player.position);
    const isActive = activeId === player.id;
    return (
      <button
        type="button"
        onClick={() => setActiveId(isActive ? null : player.id)}
        onBlur={() => setActiveId((id) => (id === player.id ? null : id))}
        className="flex flex-col items-center group relative cursor-pointer"
        aria-label={`${player.firstName} ${player.lastName}, ${czPos}`}
      >
        <div
          className="w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center font-heading font-black text-sm sm:text-base border-2 border-white shadow-lg transition-transform group-hover:scale-110"
          style={{
            background: `radial-gradient(circle at 30% 30%, ${secondaryColor}44, ${primaryColor})`,
            color: "#ffffff",
          }}
        >
          {player.squadNumber ? player.squadNumber : "⚽"}
        </div>

        <div className="mt-1 px-1.5 py-0.5 rounded bg-black/80 text-white font-heading font-bold text-sm max-w-[76px] sm:max-w-[110px] truncate text-center shadow">
          {player.lastName}
        </div>

        <div
          className={`absolute ${tooltipBelow ? "top-full mt-2" : "bottom-full mb-2"} ${
            isActive ? "flex" : "hidden group-hover:flex"
          } flex-col bg-gray-900 border border-white/20 rounded-xl p-2.5 text-sm text-white shadow-2xl z-20 w-40 pointer-events-none text-left`}
        >
          <div className="font-bold text-white border-b border-white/10 pb-1 mb-1">
            <div>{player.firstName} {player.lastName}</div>
            <div className="text-sm text-slate-300 font-semibold">{czPos}</div>
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
      </button>
    );
  };

  return (
    <div className="relative w-full max-w-2xl mx-auto aspect-[4/3] min-h-[340px] rounded-3xl border-2 border-white/20 shadow-2xl bg-[#1b431b]">
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none opacity-40 rounded-3xl"
        viewBox="0 0 400 300"
        fill="none"
        stroke="white"
        strokeWidth="2"
        preserveAspectRatio="none"
      >
        <rect x="15" y="15" width="370" height="270" />
        <line x1="15" y1="150" x2="385" y2="150" />
        <circle cx="200" cy="150" r="40" />
        <circle cx="200" cy="150" r="3" fill="white" />
        <rect x="115" y="15" width="170" height="55" />
        <rect x="160" y="15" width="80" height="22" />
        <rect x="115" y="230" width="170" height="55" />
        <rect x="160" y="263" width="80" height="22" />
      </svg>

      <div
        className="absolute inset-0 opacity-15 pointer-events-none rounded-3xl"
        style={{
          backgroundImage: "repeating-linear-gradient(0deg, #000, #000 30px, transparent 30px, transparent 60px)",
        }}
      />

      <div className="relative h-full flex flex-col justify-between py-4 px-2 sm:px-4 z-10">
        <div className="flex justify-center">
          {gk ? renderPlayerNode(gk, true) : (
            <div className="px-3 py-1 rounded bg-black/70 text-white text-sm font-heading font-bold">Bez brankáře</div>
          )}
        </div>

        <div className="flex justify-around">
          {defs.map((p) => <div key={p.id}>{renderPlayerNode(p)}</div>)}
        </div>

        <div className="flex justify-around">
          {mids.map((p) => <div key={p.id}>{renderPlayerNode(p)}</div>)}
        </div>

        <div className="flex justify-center gap-16 sm:gap-24">
          {fwds.map((p) => <div key={p.id}>{renderPlayerNode(p)}</div>)}
        </div>
      </div>
    </div>
  );
}
