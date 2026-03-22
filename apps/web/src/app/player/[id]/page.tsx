"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch, type Player, type Team } from "@/lib/api";
import { useTeam } from "@/context/team-context";
import { FaceAvatar } from "@/components/players/face-avatar";
import { StatBar, PositionBadge, SectionLabel, Button, EntityLink, Spinner } from "@/components/ui";

function getMoraleEmoji(morale: number): string {
  if (morale >= 80) return "\u{1F60A}";
  if (morale >= 60) return "\u{1F642}";
  if (morale >= 40) return "\u{1F610}";
  if (morale >= 20) return "\u{1F61E}";
  return "\u{1F621}";
}

function getTraitLevel(value: number): { label: string; color: string } {
  if (value >= 80) return { label: "Velmi vysoký", color: "text-pitch-500" };
  if (value >= 60) return { label: "Vysoký", color: "text-pitch-400" };
  if (value >= 40) return { label: "Průměrný", color: "text-muted" };
  if (value >= 20) return { label: "Nízký", color: "text-gold-600" };
  return { label: "Velmi nízký", color: "text-card-red" };
}

export default function PlayerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { teamId } = useTeam();
  const playerId = params.id as string;

  const [player, setPlayer] = useState<Player | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamId) return;
    Promise.all([
      apiFetch<Player>(`/api/teams/${teamId}/players/${playerId}`),
      apiFetch<Team>(`/api/teams/${teamId}`),
    ]).then(([p, t]) => {
      setPlayer(p);
      setTeam(t);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [teamId, playerId]);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Spinner size="lg" /></div>;
  if (!player || !team) return <div className="page-container">Hráč nenalezen.</div>;

  const color = team.primary_color || "#2D5F2D";
  const ratingClass = player.overall_rating >= 70 ? "rating-gold" : player.overall_rating >= 50 ? "rating-good" : player.overall_rating >= 30 ? "rating-avg" : "rating-poor";

  return (
    <div className="min-h-screen bg-paper">
      {/* Hero header */}
      <div className="hero-gradient text-white" style={{ backgroundColor: color }}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
          {/* Back button */}
          <button onClick={() => router.back()} className="text-white/60 hover:text-white text-sm mb-4 flex items-center gap-1 transition-colors">
            &#8592; Zpět
          </button>

          <div className="flex items-center gap-6">
            {/* Avatar */}
            <div className="shrink-0 bg-white/10 rounded-2xl p-2">
              {player.avatar && typeof player.avatar === "object" && Object.keys(player.avatar).length > 2 ? (
                <FaceAvatar faceConfig={player.avatar} size={120} />
              ) : (
                <div className="w-[120px] h-[156px] rounded-xl bg-white/20 flex items-center justify-center text-white font-heading font-bold text-5xl">
                  {player.first_name[0]}
                </div>
              )}
            </div>

            {/* Name + meta */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1">
                <PositionBadge position={player.position} />
                <span className={`font-heading font-[800] text-4xl tabular-nums ${ratingClass}`}>
                  {player.overall_rating}
                </span>
              </div>
              <h1 className="text-h1 text-white text-3xl">
                {player.first_name} {player.last_name}
              </h1>
              {player.nickname && (
                <div className="text-white/60 text-lg mt-0.5">&bdquo;{player.nickname}&ldquo;</div>
              )}
              <p className="text-white/50 text-sm mt-2 italic">{player.description}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* Quick stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <QuickStat label="Věk" value={`${player.age} let`} />
          <QuickStat label="Výška" value={player.physical?.height ? `${player.physical.height} cm` : "—"} />
          <QuickStat label="Váha" value={player.physical?.weight ? `${player.physical.weight} kg` : "—"} />
          <QuickStat label="Povolání" value={player.lifeContext?.occupation ?? "—"} />
        </div>

        {/* Two columns on desktop */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Left — skills */}
          <div className="card p-5">
            <SectionLabel>Fotbalové dovednosti</SectionLabel>
            <div className="space-y-3">
              <StatBar label="Rychlost" value={player.skills?.speed ?? 0} max={100} />
              <StatBar label="Technika" value={player.skills?.technique ?? 0} max={100} />
              <StatBar label="Střelba" value={player.skills?.shooting ?? 0} max={100} />
              <StatBar label="Přihrávky" value={player.skills?.passing ?? 0} max={100} />
              <StatBar label="Hlavičky" value={player.skills?.heading ?? 0} max={100} />
              <StatBar label="Obrana" value={player.skills?.defense ?? 0} max={100} />
              {player.position === "GK" && <StatBar label="Brankář" value={player.skills?.goalkeeping ?? 0} max={100} />}
            </div>

            <SectionLabel>Fyzické</SectionLabel>
            <div className="space-y-3">
              <StatBar label="Kondice" value={player.physical?.stamina ?? 0} max={100} />
              <StatBar label="Síla" value={player.physical?.strength ?? 0} max={100} />
            </div>
          </div>

          {/* Right — personality + context */}
          <div className="space-y-4">
            {/* Morale */}
            <div className="card p-5">
              <SectionLabel>Morálka</SectionLabel>
              <div className="flex items-center gap-3">
                <span className="text-2xl">{getMoraleEmoji(player.lifeContext?.morale ?? 50)}</span>
                <div className="flex-1">
                  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{
                      width: `${player.lifeContext?.morale ?? 50}%`,
                      backgroundColor: (player.lifeContext?.morale ?? 50) >= 70 ? "var(--color-pitch-500)" : (player.lifeContext?.morale ?? 50) >= 40 ? "var(--color-gold-500)" : "var(--color-card-red)",
                    }} />
                  </div>
                </div>
                <span className="font-heading font-bold tabular-nums">{player.lifeContext?.morale ?? 50}</span>
              </div>
            </div>

            {/* Personality traits */}
            <div className="card p-5">
              <SectionLabel>Charakter</SectionLabel>
              <div className="space-y-2.5">
                <TraitRow icon="\u{1F4CB}" label="Disciplína" value={player.personality?.discipline ?? 50} />
                <TraitRow icon="\u{1F3E0}" label="Patriotismus" value={player.personality?.patriotism ?? 50} />
                <TraitRow icon="\u{1F37A}" label="Alkohol" value={player.personality?.alcohol ?? 30} inverted />
                <TraitRow icon="\u{1F525}" label="Temperament" value={player.personality?.temper ?? 40} inverted />
              </div>
            </div>

            {/* Team */}
            <div className="card p-5">
              <SectionLabel>Tým</SectionLabel>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg" style={{ backgroundColor: color }} />
                <div>
                  <div className="font-semibold">
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

function QuickStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4 text-center">
      <div className="text-label mb-1">{label}</div>
      <div className="font-heading font-bold text-lg">{value}</div>
    </div>
  );
}

function TraitRow({ icon, label, value, inverted }: { icon: string; label: string; value: number; inverted?: boolean }) {
  const trait = getTraitLevel(inverted ? 100 - value : value);
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span>{icon}</span>
        <span className="text-sm">{label}</span>
      </div>
      <span className={`text-sm font-heading font-bold ${trait.color}`}>{trait.label}</span>
    </div>
  );
}
