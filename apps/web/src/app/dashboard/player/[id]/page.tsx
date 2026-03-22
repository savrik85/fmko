"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch, type Player, type Team } from "@/lib/api";
import { useTeam } from "@/context/team-context";
import { FaceAvatar } from "@/components/players/face-avatar";
import { PositionBadge, SectionLabel, EntityLink, Spinner, BadgePreview } from "@/components/ui";
import type { BadgePattern } from "@/components/ui";

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

/* ── Page ── */

export default function PlayerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { teamId } = useTeam();
  const playerId = params.id as string;

  const [player, setPlayer] = useState<Player | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamId) return;
    Promise.all([
      apiFetch<Player>(`/api/teams/${teamId}/players/${playerId}`),
      apiFetch<Team>(`/api/teams/${teamId}`),
      apiFetch<Player[]>(`/api/teams/${teamId}/players`),
    ]).then(([p, t, all]) => {
      setPlayer(p);
      setTeam(t);
      setAllPlayers(all);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [teamId, playerId]);

  const currentIndex = allPlayers.findIndex((p) => p.id === playerId);
  const prevPlayer = allPlayers.length > 1 ? allPlayers[(currentIndex - 1 + allPlayers.length) % allPlayers.length] : null;
  const nextPlayer = allPlayers.length > 1 ? allPlayers[(currentIndex + 1) % allPlayers.length] : null;

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Spinner size="lg" /></div>;
  if (!player || !team) return <div className="page-container">Hráč nenalezen.</div>;

  const color = team.primary_color || "#2D5F2D";
  const ratingClass = player.overall_rating >= 70 ? "rating-gold" : player.overall_rating >= 50 ? "rating-good" : player.overall_rating >= 30 ? "rating-avg" : "rating-poor";
  const cond = conditionLabel(player.lifeContext?.condition ?? 50);

  return (
    <div className="min-h-screen bg-paper">
      {/* ═══ Hero header ═══ */}
      <div className="hero-gradient text-white" style={{ backgroundColor: color }}>
        <div className="page-container py-5">
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => router.back()} className="text-white/60 hover:text-white text-sm flex items-center gap-1 transition-colors">
              &#8592; Zpět
            </button>

            {/* Prev / Next navigation */}
            {allPlayers.length > 1 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => prevPlayer && router.push(`/dashboard/player/${prevPlayer.id}`)}
                  className="w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                >
                  &#9664;
                </button>
                <span className="text-white/50 text-xs font-heading tabular-nums px-1">
                  {currentIndex + 1}/{allPlayers.length}
                </span>
                <button
                  onClick={() => nextPlayer && router.push(`/dashboard/player/${nextPlayer.id}`)}
                  className="w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                >
                  &#9654;
                </button>
              </div>
            )}
          </div>

          <div className="flex items-start gap-5">
            {/* Avatar */}
            {player.avatar && typeof player.avatar === "object" && Object.keys(player.avatar).length > 2 ? (
              <FaceAvatar faceConfig={player.avatar} size={80} className="shrink-0 bg-white/10 rounded-xl" />
            ) : (
              <div className="shrink-0 w-[80px] h-[104px] rounded-xl bg-white/10 flex items-center justify-center text-white font-heading font-bold text-4xl">
                {player.first_name[0]}
              </div>
            )}

            {/* Info */}
            <div className="flex-1 min-w-0 pt-1">
              <h1 className="font-heading font-[800] text-white text-2xl sm:text-3xl leading-tight">
                {player.first_name} {player.last_name}
              </h1>
              {player.nickname && (
                <div className="text-white/90 text-base mt-0.5">&bdquo;{player.nickname}&ldquo;</div>
              )}
              <div className="flex items-center gap-3 mt-2">
                <PositionBadge position={player.position} />
                <span className="text-white/90 text-sm">{player.age} let</span>
                <span className="text-white/60">&middot;</span>
                <span className="text-white/90 text-sm">{player.lifeContext?.occupation ?? ""}</span>
              </div>
              {player.description && (
                <p className="text-white/70 text-sm mt-2 italic">&bdquo;{player.description}&ldquo;</p>
              )}
            </div>

            {/* Rating */}
            <div className="shrink-0 text-center pt-1">
              <div className="font-heading font-[800] text-5xl tabular-nums leading-none text-white">
                {player.overall_rating}
              </div>
              <div className="text-white/80 text-[11px] font-heading font-bold uppercase mt-1">Hodnocení</div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ Content ═══ */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-5">

        {/* ── Info grid ── */}
        <div className="card p-4 sm:p-5">
          <SectionLabel>Informace</SectionLabel>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-y-3 gap-x-6">
            <InfoRow label="Věk" value={`${player.age} let`} />
            <InfoRow label="Pozice" value={<PositionBadge position={player.position} />} />
            <InfoRow label="Povolání" value={player.lifeContext?.occupation ?? "—"} />
            <InfoRow label="Tým" value={
              <EntityLink type="team" id={team.id}>{team.name}</EntityLink>
            } />
            <InfoRow label="Výška" value={player.physical?.height ? `${player.physical.height} cm` : "—"} />
            <InfoRow label="Váha" value={player.physical?.weight ? `${player.physical.weight} kg` : "—"} />
            <InfoRow label="Kondice" value={
              <span className={cond.color}>{player.lifeContext?.condition ?? 50}% — {cond.text}</span>
            } />
            <InfoRow label="Morálka" value={
              <span>{getMoraleEmoji(player.lifeContext?.morale ?? 50)} {player.lifeContext?.morale ?? 50}</span>
            } />
          </div>
        </div>

        {/* ── Two columns: Attributes + Character ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">

          {/* Left — Football attributes */}
          <div className="card p-4 sm:p-5">
            <SectionLabel>Fotbalové atributy</SectionLabel>
            <div className="grid grid-cols-2 gap-x-6">
              <AttrRow label="Rychlost" value={player.skills?.speed ?? 0} />
              <AttrRow label="Technika" value={player.skills?.technique ?? 0} />
              <AttrRow label="Střelba" value={player.skills?.shooting ?? 0} />
              <AttrRow label="Přihrávky" value={player.skills?.passing ?? 0} />
              <AttrRow label="Hlavičky" value={player.skills?.heading ?? 0} />
              <AttrRow label="Obrana" value={player.skills?.defense ?? 0} />
              {player.position === "GK" && <AttrRow label="Brankář" value={player.skills?.goalkeeping ?? 0} />}
            </div>

            <div className="mt-4">
              <SectionLabel>Fyzické</SectionLabel>
              <div className="grid grid-cols-2 gap-x-6">
                <AttrRow label="Kondice" value={player.physical?.stamina ?? 0} />
                <AttrRow label="Síla" value={player.physical?.strength ?? 0} />
              </div>
            </div>
          </div>

          {/* Right — Character + team */}
          <div className="space-y-5">
            <div className="card p-4 sm:p-5">
              <SectionLabel>Charakter</SectionLabel>
              <div className="grid grid-cols-2 gap-x-6">
                <TraitRow label="Disciplína" value={player.personality?.discipline ?? 50} />
                <TraitRow label="Patriotismus" value={player.personality?.patriotism ?? 50} />
                <TraitRow label="Alkohol" value={player.personality?.alcohol ?? 30} inverted />
                <TraitRow label="Temperament" value={player.personality?.temper ?? 40} inverted />
              </div>
            </div>

            {/* Team card */}
            <div className="card p-4 sm:p-5">
              <SectionLabel>Tým</SectionLabel>
              <div className="flex items-center gap-3">
                <BadgePreview
                  primary={team.primary_color || "#2D5F2D"}
                  secondary={team.secondary_color || "#FFFFFF"}
                  pattern={(team.badge_pattern as BadgePattern) || "shield"}
                  initials={team.name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 3).join("").toUpperCase()}
                  size={40}
                />
                <div>
                  <div className="font-heading font-bold">
                    <EntityLink type="team" id={team.id}>{team.name}</EntityLink>
                  </div>
                  <div className="text-xs text-muted">
                    <EntityLink type="village" id={team.village_name}>{team.village_name}</EntityLink>
                    {" "}&middot; {team.district}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ── */

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-label">{label}</div>
      <div className="font-heading font-bold text-base">{value}</div>
    </div>
  );
}

function AttrRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-b-0">
      <span className="text-base text-ink-light">{label}</span>
      <span className={`text-base font-heading tabular-nums ${attrColor(value)}`}>{value}</span>
    </div>
  );
}

function TraitRow({ label, value, inverted }: { label: string; value: number; inverted?: boolean }) {
  const effective = inverted ? 100 - value : value;
  const trait = traitLevel(effective);
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-b-0">
      <span className="text-base text-ink-light">{label}</span>
      <span className={`text-sm font-heading font-bold ${trait.color}`}>{trait.label}</span>
    </div>
  );
}
