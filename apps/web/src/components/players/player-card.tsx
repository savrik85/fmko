"use client";

import Link from "next/link";
import { FaceAvatar } from "@/components/players/face-avatar";
import { PositionBadge } from "@/components/ui";
import type { Player } from "@/lib/api";

/* ── Helpers ── */

function getMoraleEmoji(morale: number): string {
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

function attrColor(value: number): string {
  if (value >= 70) return "text-pitch-400 font-bold";
  if (value >= 50) return "text-pitch-500";
  if (value >= 30) return "text-ink";
  if (value >= 15) return "text-gold-600";
  return "text-card-red";
}

function traitLevel(value: number): { label: string; color: string } {
  if (value >= 80) return { label: "Velmi vysoký", color: "text-pitch-400" };
  if (value >= 60) return { label: "Vysoký", color: "text-pitch-500" };
  if (value >= 40) return { label: "Průměrný", color: "text-muted" };
  if (value >= 20) return { label: "Nízký", color: "text-gold-600" };
  return { label: "Velmi nízký", color: "text-card-red" };
}

/* ── Compact card — squad list row ── */

export function PlayerCardCompact({
  player,
  teamColor,
}: {
  player: Player;
  teamColor: string;
}) {
  const cond = conditionLabel(player.lifeContext?.condition ?? 100);
  const hasAvatar = player.avatar && typeof player.avatar === "object" && Object.keys(player.avatar).length > 2;

  return (
    <Link
      href={`/dashboard/player/${player.id}`}
      className="card card-hover w-full p-4 text-left flex gap-3 items-center block"
    >
      {/* Avatar */}
      <div className="w-11 h-11 shrink-0 flex items-center justify-center">
        {hasAvatar ? (
          <FaceAvatar faceConfig={player.avatar} size={36} />
        ) : (
          <div
            className="w-11 h-11 rounded-full flex items-center justify-center text-white font-heading font-bold"
            style={{ backgroundColor: teamColor }}
          >
            {player.first_name[0]}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5">
          <span className="font-heading font-bold truncate">
            {player.first_name} {player.last_name}
          </span>
          {player.nickname && (
            <span className="text-xs text-gold-500 shrink-0">&bdquo;{player.nickname}&ldquo;</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted mt-0.5">
          <PositionBadge position={player.position} />
          <span>{player.age} let</span>
          <span>&middot;</span>
          <span className={cond.color}>{cond.text}</span>
          <span>{getMoraleEmoji(player.lifeContext?.morale ?? 50)}</span>
        </div>
      </div>

      {/* Rating */}
      <div className="text-right shrink-0">
        <div className="font-heading font-bold text-xl tabular-nums" style={{ color: teamColor }}>
          {player.overall_rating}
        </div>
      </div>
    </Link>
  );
}

function AttrRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-b-0">
      <span className="text-base text-muted">{label}</span>
      <span className={`text-base font-heading tabular-nums ${attrColor(value)}`}>{value}</span>
    </div>
  );
}

/* ── FM-style trait row ── */

function TraitRow({ label, value, inverted }: { label: string; value: number; inverted?: boolean }) {
  const effective = inverted ? 100 - value : value;
  const trait = traitLevel(effective);
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-b-0">
      <span className="text-base text-muted">{label}</span>
      <span className={`text-sm font-heading font-bold ${trait.color}`}>{trait.label}</span>
    </div>
  );
}

/* ── Info label+value ── */

function InfoItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-label">{label}</div>
      <div className="font-heading font-bold text-base">{value}</div>
    </div>
  );
}

/* ── Full profile modal — FM style ── */

export function PlayerCardFull({
  player,
  teamColor,
  onClose,
}: {
  player: Player;
  teamColor: string;
  onClose: () => void;
}) {
  const cond = conditionLabel(player.lifeContext?.condition ?? 50);
  const hasAvatar = player.avatar && typeof player.avatar === "object" && Object.keys(player.avatar).length > 2;

  return (
    <Modal isOpen onClose={onClose} maxWidth="640px">
      {/* ── Header ── */}
      <div className="p-4 sm:p-5 text-white relative overflow-hidden rounded-t-[20px] sm:rounded-t-lg" style={{ backgroundColor: teamColor }}>
        <div className="hero-gradient" style={{ position: "absolute", inset: 0 }} />
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/20 hover:bg-black/40 flex items-center justify-center text-white/70 hover:text-white transition-colors"
        >
          &#10005;
        </button>

        <div className="relative flex items-start gap-4">
          {/* Avatar */}
          {hasAvatar ? (
            <FaceAvatar faceConfig={player.avatar} size={68} className="shrink-0 bg-white/10 rounded-xl" />
          ) : (
            <div className="shrink-0 w-[68px] h-[88px] rounded-xl bg-white/10 flex items-center justify-center text-white font-heading font-bold text-2xl">
              {player.first_name[0]}
            </div>
          )}

          {/* Info */}
          <div className="flex-1 min-w-0 pt-0.5">
            <h2 className="font-heading font-[800] text-xl leading-tight truncate">
              {player.first_name} {player.last_name}
            </h2>
            {player.nickname && (
              <div className="text-white/90 text-sm mt-0.5">&bdquo;{player.nickname}&ldquo;</div>
            )}
            <div className="flex items-center gap-2 mt-1.5">
              <span className="pos-badge" style={{ background: "rgba(255,255,255,0.15)", color: "white" }}>
                {player.position === "GK" ? "BRA" : player.position === "DEF" ? "OBR" : player.position === "MID" ? "ZÁL" : "ÚTO"}
              </span>
              <span className="text-white/90 text-sm">{player.age} let</span>
            </div>
          </div>

          {/* Rating */}
          <div className="shrink-0 text-center pt-0.5">
            <div className="font-heading font-[800] text-4xl tabular-nums text-white leading-none">
              {player.overall_rating}
            </div>
            <div className="text-white/80 text-[10px] font-heading font-bold uppercase mt-0.5">Hodnocení</div>
          </div>
        </div>
      </div>

      {/* ── Info strip ── */}
      <div className="px-4 sm:px-5 py-3 bg-surface border-b border-gray-100">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-3 gap-x-6">
          <InfoItem label="Věk" value={`${player.age} let`} />
          <InfoItem label="Povolání" value={player.lifeContext?.occupation ?? "—"} />
          <InfoItem label="Kondice" value={
            <span className={cond.color}>{player.lifeContext?.condition ?? 50}% — {cond.text}</span>
          } />
          <InfoItem label="Morálka" value={
            <span>{getMoraleEmoji(player.lifeContext?.morale ?? 50)} {player.lifeContext?.morale ?? 50}</span>
          } />
          {player.physical?.height && <InfoItem label="Výška" value={`${player.physical.height} cm`} />}
          {player.physical?.weight && <InfoItem label="Váha" value={`${player.physical.weight} kg`} />}
        </div>
      </div>

      {/* ── Description ── */}
      {player.description && (
        <div className="px-4 sm:px-5 py-2.5 border-b border-gray-100">
          <p className="text-sm text-muted italic">&bdquo;{player.description}&ldquo;</p>
        </div>
      )}

      {/* ── Attributes ── */}
      <div className="px-4 sm:px-5 py-4">
        <div className="text-label mb-2">Fotbalové atributy</div>
        <div className="grid grid-cols-2 gap-x-6">
          <AttrRow label="Rychlost" value={player.skills?.speed ?? 0} />
          <AttrRow label="Technika" value={player.skills?.technique ?? 0} />
          <AttrRow label="Střelba" value={player.skills?.shooting ?? 0} />
          <AttrRow label="Přihrávky" value={player.skills?.passing ?? 0} />
          <AttrRow label="Hlavičky" value={player.skills?.heading ?? 0} />
          <AttrRow label="Obrana" value={player.skills?.defense ?? 0} />
          {player.position === "GK" && <AttrRow label="Brankář" value={player.skills?.goalkeeping ?? 0} />}
        </div>

        <div className="text-label mt-4 mb-2">Fyzické</div>
        <div className="grid grid-cols-2 gap-x-6">
          <AttrRow label="Kondice" value={player.physical?.stamina ?? 0} />
          <AttrRow label="Síla" value={player.physical?.strength ?? 0} />
        </div>

        <div className="text-label mt-4 mb-2">Charakter</div>
        <div className="grid grid-cols-2 gap-x-6">
          <TraitRow label="Disciplína" value={player.personality?.discipline ?? 50} />
          <TraitRow label="Patriotismus" value={player.personality?.patriotism ?? 50} />
          <TraitRow label="Alkohol" value={player.personality?.alcohol ?? 30} inverted />
          <TraitRow label="Temperament" value={player.personality?.temper ?? 40} inverted />
        </div>
      </div>
    </Modal>
  );
}
