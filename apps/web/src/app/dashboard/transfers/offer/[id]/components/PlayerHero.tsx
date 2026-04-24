"use client";

import Link from "next/link";
import { FaceAvatar } from "@/components/players/face-avatar";
import { PositionBadge } from "@/components/ui";

export interface PlayerSummary {
  id: string;
  first_name: string;
  last_name: string;
  age: number;
  position: string;
  overall_rating: number;
  avatar: Record<string, unknown>;
  skills: Record<string, number>;
  isOwn: boolean;
}

function skillColor(v: number): string {
  if (v >= 80) return "text-pitch-500";
  if (v >= 65) return "text-pitch-600";
  if (v >= 50) return "text-ink";
  if (v >= 35) return "text-muted";
  return "text-red-600";
}

function positionSkills(pos: string, skills: Record<string, number>): Array<[string, number]> {
  const pick = (keys: string[]) => keys.map<[string, number]>((k) => [k, skills[k] ?? 0]);
  const map: Record<string, Array<[string, string]>> = {
    GK: [["Brank.", "goalkeeping"]],
    DEF: [["Obrana", "defense"], ["Hlava", "heading"], ["Rychl.", "speed"]],
    MID: [["Přihr.", "passing"], ["Tech.", "technique"], ["Kreat.", "creativity"]],
    FWD: [["Střela", "shooting"], ["Rychl.", "speed"], ["Tech.", "technique"]],
  };
  const picks = map[pos] ?? map.MID;
  return picks.map<[string, number]>(([label, key]) => [label, skills[key] ?? 0]);
}

export function PlayerHero({
  player, offeredPlayer, currentAmount, offerType, loanDuration,
  crossLeague, adminFee, message,
}: {
  player: PlayerSummary;
  offeredPlayer: PlayerSummary | null;
  currentAmount: number;
  offerType: "transfer" | "loan";
  loanDuration: number | null;
  crossLeague: boolean;
  adminFee: number;
  message: string | null;
}) {
  const hasAvatar = player.avatar && Object.keys(player.avatar).length > 0;
  const swapHasAvatar = offeredPlayer?.avatar && Object.keys(offeredPlayer.avatar).length > 0;
  const blurPrefix = player.isOwn ? "" : "~";
  const posSkills = positionSkills(player.position, player.skills);

  return (
    <div className="flex flex-col items-center gap-3 flex-shrink-0">
      <div className="flex items-center gap-2">
        {hasAvatar ? (
          <FaceAvatar faceConfig={player.avatar} size={140} />
        ) : (
          <div className="w-[140px] h-[168px] bg-gray-100 rounded-lg" />
        )}
        {offeredPlayer && (
          <>
            <div className="text-2xl text-muted shrink-0">⇄</div>
            <Link href={`/dashboard/player/${offeredPlayer.id}`} className="flex flex-col items-center gap-1 group">
              {swapHasAvatar ? (
                <FaceAvatar faceConfig={offeredPlayer.avatar} size={72} />
              ) : (
                <div className="w-[72px] h-[86px] bg-gray-100 rounded-lg" />
              )}
              <span className="text-[9px] font-heading font-bold text-muted uppercase tracking-wider">Na výměnu</span>
              <span className="font-heading font-bold text-xs group-hover:text-pitch-500 transition-colors text-center max-w-[80px] truncate">
                {offeredPlayer.first_name} {offeredPlayer.last_name}
              </span>
            </Link>
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Link href={`/dashboard/player/${player.id}`} className="font-heading font-bold text-xl hover:text-pitch-500 underline decoration-pitch-500/20 transition-colors">
          {player.first_name} {player.last_name}
        </Link>
        <PositionBadge position={player.position as "GK" | "DEF" | "MID" | "FWD"} />
      </div>
      <div className="flex items-center gap-2 text-sm text-muted tabular-nums">
        <span>{player.age} let</span>
        <span>•</span>
        <span>{blurPrefix}{player.overall_rating} OVR</span>
      </div>
      <div className="flex gap-3 text-xs">
        {posSkills.map(([label, value]) => (
          <div key={label} className="flex flex-col items-center tabular-nums">
            <span className="text-[10px] text-muted font-heading uppercase">{label}</span>
            <span className={`font-heading font-bold ${skillColor(value)}`}>{blurPrefix}{value}</span>
          </div>
        ))}
      </div>
      {!player.isOwn && (
        <div className="text-[10px] italic text-muted">Hodnoty ze scoutingu, zaokrouhleno na 5</div>
      )}

      <div className="mt-2 text-center">
        <div className="text-[10px] font-heading font-bold text-muted uppercase tracking-wider">
          {offerType === "loan"
            ? `Hostování${loanDuration ? ` na ${loanDuration} dní` : ""}`
            : offeredPlayer ? "Nabídka + výměna" : "Aktuální nabídka"}
        </div>
        <div className="font-heading font-[900] text-3xl tabular-nums text-pitch-500 mt-1">
          {currentAmount > 0 ? `${currentAmount.toLocaleString("cs")} Kč` : "Zdarma"}
        </div>
        {crossLeague && adminFee > 0 && (
          <div className="text-xs text-muted mt-1 tabular-nums">
            + admin poplatek {adminFee.toLocaleString("cs")} Kč (20 %)
          </div>
        )}
        {message && (
          <div className="text-xs text-muted italic mt-2 max-w-[280px]">&ldquo;{message}&rdquo;</div>
        )}
      </div>
    </div>
  );
}
