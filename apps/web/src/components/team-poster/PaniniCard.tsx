"use client";

import Link from "next/link";
import type { Player } from "@/lib/api";
import { FaceAvatar } from "@/components/players/face-avatar";

interface PaniniCardProps {
  player: Player;
  teamColor: string;
  secondaryColor?: string;
  isCaptain?: boolean;
  isTopPlayer?: boolean;
  onClick?: () => void;
}

const POS_COLORS: Record<string, { badge: string; bg: string; text: string }> = {
  GK: { badge: "bg-amber-500", bg: "from-amber-950/80 via-slate-900 to-amber-950/90", text: "text-amber-400" },
  DEF: { badge: "bg-blue-600", bg: "from-blue-950/80 via-slate-900 to-blue-950/90", text: "text-blue-400" },
  MID: { badge: "bg-emerald-600", bg: "from-emerald-950/80 via-slate-900 to-emerald-950/90", text: "text-emerald-400" },
  FWD: { badge: "bg-rose-600", bg: "from-rose-950/80 via-slate-900 to-rose-950/90", text: "text-rose-400" },
};

const POS_LABELS: Record<string, string> = {
  GK: "BRANKÁŘ",
  DEF: "OBRÁNCE",
  MID: "ZÁLOŽNÍK",
  FWD: "ÚTOČNÍK",
};

export function PaniniCard({
  player,
  teamColor,
  secondaryColor = "#FFFFFF",
  isCaptain = false,
  isTopPlayer = false,
}: PaniniCardProps) {
  const rating = player.overall_rating ?? 50;
  const isGold = rating >= 70 || isTopPlayer;
  const isSilver = rating >= 50 && rating < 70;

  const posStyle = POS_COLORS[player.position] || POS_COLORS.MID;
  const occupation = (player.lifeContext as any)?.occupation || "Okresní fotbalista";

  // Získání klíčových 4 atributů
  const skills = player.skills || ({} as any);
  const physical = player.physical || ({} as any);

  const speed = skills.speed ?? 50;
  const shooting = skills.shooting ?? 50;
  const passing = skills.passing ?? 50;
  const technique = skills.technique ?? 50;
  const defense = skills.defense ?? 50;
  const strength = physical.strength ?? 50;

  const stats = [
    { label: "RYC", val: speed },
    { label: "STŘ", val: shooting },
    { label: "PŘI", val: passing },
    { label: "TEC", val: technique },
    { label: "OBR", val: defense },
    { label: "SÍL", val: strength },
  ];

  const borderGradient = isGold
    ? "from-amber-300 via-yellow-500 to-amber-600 shadow-amber-500/20"
    : isSilver
    ? "from-slate-300 via-slate-400 to-slate-500 shadow-slate-500/20"
    : "from-amber-700 via-amber-800 to-amber-950 shadow-amber-900/20";

  return (
    <Link
      href={`/dashboard/player/${player.id}`}
      className="group relative block w-full max-w-[210px] sm:max-w-[230px] mx-auto select-none transition-all duration-300 hover:-translate-y-2 hover:scale-[1.03] cursor-pointer"
    >
      {/* ─── Vnější sběratelský rámeček karty ─── */}
      <div
        className={`relative rounded-2xl p-[3px] bg-gradient-to-b ${borderGradient} shadow-xl hover:shadow-2xl transition-all overflow-hidden`}
      >
        {/* Holografický odlesk při najetí myší */}
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/15 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

        {/* ─── Tělo karty ─── */}
        <div className={`relative rounded-[14px] bg-gradient-to-b ${posStyle.bg} p-3.5 flex flex-col gap-2.5 overflow-hidden border border-white/10`}>
          
          {/* Horní hlavička karty: OVR, Pozice, Číslo, Kapitán */}
          <div className="flex items-start justify-between">
            <div className="flex flex-col items-center">
              {/* Celkový Rating (OVR) */}
              <div
                className={`font-heading font-black text-2xl sm:text-3xl leading-none tabular-nums tracking-tighter ${
                  isGold ? "text-amber-300 drop-shadow-[0_2px_4px_rgba(245,158,11,0.5)]" : "text-white"
                }`}
              >
                {rating}
              </div>
              {/* Pozice */}
              <span className={`text-[11px] font-black tracking-wider uppercase ${posStyle.text} mt-0.5`}>
                {player.position}
              </span>
            </div>

            {/* Speciální odznaky: Kapitán / Top Player / Číslo dresu */}
            <div className="flex flex-col items-end gap-1">
              {player.squad_number && (
                <span className="text-xs font-mono font-bold text-slate-400 bg-black/40 px-1.5 py-0.5 rounded border border-white/10">
                  #{player.squad_number}
                </span>
              )}
              {isCaptain && (
                <span className="text-[10px] font-black bg-amber-400 text-black px-1.5 py-0.5 rounded-full shadow-sm flex items-center gap-0.5">
                  <span>👑</span>
                  <span>KAPITÁN</span>
                </span>
              )}
              {isTopPlayer && !isCaptain && (
                <span className="text-[10px] font-black bg-yellow-400 text-black px-1.5 py-0.5 rounded-full shadow-sm flex items-center gap-0.5">
                  <span>⭐</span>
                  <span>STAR</span>
                </span>
              )}
            </div>
          </div>

          {/* ─── Střed: Avatar hráče v medailonu ─── */}
          <div className="relative mx-auto flex items-center justify-center my-0.5">
            {/* Klubová aura za avatarem */}
            <div
              className="absolute w-24 h-24 rounded-full blur-md opacity-35"
              style={{ backgroundColor: teamColor || "#1E40AF" }}
            />
            {/* Ozdobný kruhový rámeček */}
            <div className="relative rounded-full p-1 bg-gradient-to-b from-white/30 to-black/60 border border-white/20 shadow-inner">
              <div className="rounded-full bg-slate-900/90 overflow-hidden flex items-center justify-center">
                {player.avatar && typeof player.avatar === "object" && Object.keys(player.avatar).length > 2 ? (
                  <FaceAvatar faceConfig={player.avatar} size={76} />
                ) : (
                  <div className="w-[76px] h-[91px] flex items-center justify-center text-3xl font-black text-slate-500">
                    {player.last_name?.charAt(0) || "⚽"}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ─── Jméno hráče ─── */}
          <div className="text-center">
            <div className="text-[11px] font-medium text-slate-300 truncate">
              {player.first_name}
            </div>
            <div className="font-heading font-black text-sm sm:text-base text-white tracking-wide uppercase truncate leading-tight group-hover:text-amber-300 transition-colors">
              {player.last_name}
            </div>
            {player.nickname && (
              <div className="text-[10px] text-amber-400/90 italic truncate">
                „{player.nickname}“
              </div>
            )}
          </div>

          {/* Dělící linka */}
          <div className="h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent my-0.5" />

          {/* ─── Mini statistiky (FIFA stat grid) ─── */}
          <div className="grid grid-cols-3 gap-1 text-center bg-black/35 rounded-xl p-1.5 border border-white/5">
            {stats.map((st) => (
              <div key={st.label} className="flex flex-col items-center">
                <span className="text-[9px] font-bold text-slate-400">{st.label}</span>
                <span
                  className={`text-[11px] font-black tabular-nums ${
                    st.val >= 70 ? "text-emerald-400" : st.val >= 50 ? "text-slate-200" : "text-amber-400"
                  }`}
                >
                  {st.val}
                </span>
              </div>
            ))}
          </div>

          {/* ─── Spodní štítek: Povolání (Okresní kouzlo) ─── */}
          <div className="text-center mt-0.5">
            <span className="text-[10px] font-semibold text-slate-400 bg-white/5 px-2 py-0.5 rounded-full border border-white/5 truncate max-w-full inline-block">
              💼 {occupation}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
