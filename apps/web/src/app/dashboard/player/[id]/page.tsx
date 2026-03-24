"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch, type Player, type Team, type CareerStats } from "@/lib/api";
import { useTeam } from "@/context/team-context";
import { FaceAvatar } from "@/components/players/face-avatar";
import { PositionBadge, SectionLabel, EntityLink, Spinner, BadgePreview, PageHeader } from "@/components/ui";
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

/** Attribute color for 0-100 skills scale */
function attrColor(value: number): string {
  if (value >= 70) return "text-pitch-400 font-bold";
  if (value >= 50) return "text-pitch-500";
  if (value >= 30) return "text-ink";
  if (value >= 15) return "text-gold-600";
  return "text-card-red";
}

/** Trait level label for personality 0-100 */
function traitLevel(value: number): { label: string; color: string } {
  if (value >= 80) return { label: "Velmi vysoký", color: "text-pitch-400" };
  if (value >= 60) return { label: "Vysoký", color: "text-pitch-500" };
  if (value >= 40) return { label: "Průměrný", color: "text-muted" };
  if (value >= 20) return { label: "Nízký", color: "text-gold-600" };
  return { label: "Velmi nízký", color: "text-card-red" };
}

function footLabel(foot?: string): string {
  if (foot === "left") return "Levá";
  if (foot === "right") return "Pravá";
  if (foot === "both") return "Oboumožka";
  return "—";
}

function sideLabel(side?: string): string {
  if (side === "left") return "Levá";
  if (side === "right") return "Pravá";
  if (side === "center") return "Střed";
  if (side === "any") return "Všechny";
  return "—";
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
  const [careerStats, setCareerStats] = useState<CareerStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamId) return;
    Promise.all([
      apiFetch<Player>(`/api/teams/${teamId}/players/${playerId}`),
      apiFetch<Team>(`/api/teams/${teamId}`),
      apiFetch<Player[]>(`/api/teams/${teamId}/players`),
      apiFetch<CareerStats>(`/api/teams/${teamId}/players/${playerId}/career-stats`).catch(() => null),
    ]).then(([p, t, all, stats]) => {
      setPlayer(p);
      setTeam(t);
      setAllPlayers(all);
      setCareerStats(stats);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [teamId, playerId]);

  const currentIndex = allPlayers.findIndex((p) => p.id === playerId);
  const prevPlayer = allPlayers.length > 1 ? allPlayers[(currentIndex - 1 + allPlayers.length) % allPlayers.length] : null;
  const nextPlayer = allPlayers.length > 1 ? allPlayers[(currentIndex + 1) % allPlayers.length] : null;

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Spinner size="lg" /></div>;
  if (!player || !team) return <div className="page-container">Hráč nenalezen.</div>;

  const cond = conditionLabel(player.lifeContext?.condition ?? 50);
  const color = team.primary_color || "#2D5F2D";

  return (
    <>
      {/* ═══ Player header — full width, team color ═══ */}
      <div className="hero-gradient px-5 sm:px-8 py-5" style={{ backgroundColor: color }}>
        <div className="flex items-center gap-4 max-w-5xl mx-auto">
          {allPlayers.length > 1 && (
            <button
              onClick={() => prevPlayer && router.push(`/dashboard/player/${prevPlayer.id}`)}
              className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white shrink-0 transition-colors"
            >
              &#9664;
            </button>
          )}

          {player.avatar && typeof player.avatar === "object" && Object.keys(player.avatar).length > 2 ? (
            <FaceAvatar faceConfig={player.avatar} size={64} className="shrink-0 bg-white/10 rounded-xl" />
          ) : (
            <div className="shrink-0 w-16 h-16 rounded-xl bg-white/10 flex items-center justify-center text-white font-heading font-bold text-2xl">
              {player.first_name[0]}
            </div>
          )}

          <div className="flex-1 min-w-0">
            <h1 className="font-heading font-extrabold text-white text-xl sm:text-2xl leading-tight truncate">
              {player.first_name} {player.last_name}
            </h1>
            {player.nickname && (
              <div className="text-white/70 text-sm">&bdquo;{player.nickname}&ldquo;</div>
            )}
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <PositionBadge position={player.position} />
              <span className="text-white/80 text-sm">{player.age} let</span>
              <span className="text-white/40">&middot;</span>
              <span className="text-white/80 text-sm">{player.lifeContext?.occupation ?? ""}</span>
              <span className="text-white/40">&middot;</span>
              <a href={`/dashboard/team/${team.id}`} className="text-white/90 text-sm hover:text-white underline decoration-white/30 transition-colors">
                {team.name}
              </a>
            </div>
          </div>

          <div className="shrink-0 text-center">
            <div className="font-heading font-extrabold text-5xl tabular-nums leading-none text-white">
              {player.overall_rating}
            </div>
            <div className="text-white/50 text-[10px] font-heading font-bold uppercase mt-1">Hodnocení</div>
          </div>

          {allPlayers.length > 1 && (
            <button
              onClick={() => nextPlayer && router.push(`/dashboard/player/${nextPlayer.id}`)}
              className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white shrink-0 transition-colors"
            >
              &#9654;
            </button>
          )}
        </div>
      </div>

    <div className="page-container space-y-5">

      {/* ── Info grid ── */}
      <div className="card p-4 sm:p-5">
        <SectionLabel>Informace</SectionLabel>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-y-3 gap-x-6">
          <InfoRow label="Věk" value={`${player.age} let`} />
          <InfoRow label="Pozice" value={<PositionBadge position={player.position} />} />
          <InfoRow label="Povolání" value={player.lifeContext?.occupation ?? "—"} />
          <InfoRow label="Tým" value={
            <div className="flex items-center gap-2">
              <BadgePreview primary={color} secondary={team.secondary_color || "#FFF"} pattern={(team.badge_pattern as BadgePattern) || "shield"} initials={team.name.split(" ").map((w: string) => w[0]).filter(Boolean).slice(0, 3).join("").toUpperCase()} size={32} />
              <EntityLink type="team" id={team.id}>{team.name}</EntityLink>
            </div>
          } />
          <InfoRow label="Bydliště" value={player.residence ?? "—"} />
          <InfoRow label="Dojíždění" value={player.commute_km != null ? `${player.commute_km} km` : "—"} />
          <InfoRow label="Noha" value={footLabel(player.physical?.preferredFoot)} />
          <InfoRow label="Strana" value={sideLabel(player.physical?.preferredSide)} />
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

      {/* ── Two columns: Left (attributes) + Right (personality, stats, team) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5">

        {/* Left column — All attributes in one card */}
        <div className="card p-4 sm:p-5">
          <SectionLabel>Fotbalové atributy</SectionLabel>
          <div>
            <AttrRow label="Rychlost" value={player.skills?.speed ?? 0} />
            <AttrRow label="Technika" value={player.skills?.technique ?? 0} />
            <AttrRow label="Střelba" value={player.skills?.shooting ?? 0} />
            <AttrRow label="Přihrávky" value={player.skills?.passing ?? 0} />
            <AttrRow label="Hlavičky" value={player.skills?.heading ?? 0} />
            <AttrRow label="Obrana" value={player.skills?.defense ?? 0} />
            <AttrRow label="Kreativita" value={player.skills?.creativity ?? 0} />
            <AttrRow label="Standardky" value={player.skills?.setPieces ?? 0} />
            {player.position === "GK" && <AttrRow label="Brankář" value={player.skills?.goalkeeping ?? 0} />}
          </div>

          <div className="mt-5">
            <SectionLabel>Fyzické atributy</SectionLabel>
            <div>
              <AttrRow label="Kondice" value={player.physical?.stamina ?? 0} />
              <AttrRow label="Síla" value={player.physical?.strength ?? 0} />
              <AttrRow label="Náchylnost" value={player.physical?.injuryProneness ?? 0} inverted />
            </div>
          </div>
        </div>

        {/* Right column — Personality + Career stats + Team */}
        <div className="space-y-5">
          <div className="card p-4 sm:p-5">
            <SectionLabel>Charakter</SectionLabel>
            <div className="space-y-0">
              <TraitRow label="Vůdcovství" value={player.personality?.leadership ?? 30} />
              <TraitRow label="Disciplína" value={player.personality?.discipline ?? 50} />
              <TraitRow label="Pracovitost" value={player.personality?.workRate ?? 50} />
              <TraitRow label="Konzistence" value={player.personality?.consistency ?? 50} />
              <TraitRow label="Pod tlakem" value={player.personality?.clutch ?? 50} />
              <TraitRow label="Patriotismus" value={player.personality?.patriotism ?? 50} />
              <TraitRow label="Agresivita" value={player.personality?.aggression ?? 40} />
              <TraitRow label="Alkohol" value={player.personality?.alcohol ?? 30} inverted />
              <TraitRow label="Temperament" value={player.personality?.temper ?? 40} inverted />
            </div>
          </div>

          {/* Career stats */}
          {careerStats && careerStats.totals.appearances > 0 && (
            <div className="card p-4 sm:p-5">
              <SectionLabel>Kariérní statistiky</SectionLabel>

              {/* Totals */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <StatBox label="Zápasy" value={careerStats.totals.appearances} />
                <StatBox label="Góly" value={careerStats.totals.goals} />
                <StatBox label="Asistence" value={careerStats.totals.assists} />
              </div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <StatBox label="Žluté karty" value={careerStats.totals.yellowCards} color="text-gold-500" />
                <StatBox label="Červené karty" value={careerStats.totals.redCards} color="text-card-red" />
              </div>

              {/* Per-season breakdown */}
              {careerStats.seasons.length > 0 && (
                <div className="mt-3">
                  <div className="text-label mb-2">Po sezónách</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-label border-b border-gray-100">
                          <th className="pb-1 pr-2">Sez.</th>
                          <th className="pb-1 pr-2 text-center">Z</th>
                          <th className="pb-1 pr-2 text-center">G</th>
                          <th className="pb-1 pr-2 text-center">A</th>
                          <th className="pb-1 text-center">Hod.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {careerStats.seasons.map((s) => (
                          <tr key={s.season} className="border-b border-gray-50">
                            <td className="py-1 pr-2 font-heading tabular-nums">{s.season}</td>
                            <td className="py-1 pr-2 text-center tabular-nums">{s.appearances}</td>
                            <td className="py-1 pr-2 text-center tabular-nums">{s.goals}</td>
                            <td className="py-1 pr-2 text-center tabular-nums">{s.assists}</td>
                            <td className="py-1 text-center tabular-nums">{typeof s.avgRating === "number" ? s.avgRating.toFixed(1) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
    </>
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

function AttrRow({ label, value, inverted }: { label: string; value: number; inverted?: boolean }) {
  const colorValue = inverted ? 100 - value : value;
  const barColor = colorValue >= 70 ? "#22c55e" : colorValue >= 50 ? "#6b7280" : colorValue >= 30 ? "#d97706" : "#ef4444";
  return (
    <div className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-b-0">
      <span className="text-sm text-ink-light w-28 shrink-0">{label}</span>
      <div className="flex-1 h-2.5 rounded-full bg-gray-100 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${value}%`, backgroundColor: barColor }} />
      </div>
      <span className={`text-sm font-heading font-bold tabular-nums w-8 text-right ${attrColor(colorValue)}`}>{value}</span>
    </div>
  );
}

function TraitRow({ label, value, inverted }: { label: string; value: number; inverted?: boolean }) {
  const effective = inverted ? 100 - value : value;
  const trait = traitLevel(effective);
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-b-0">
      <span className="text-base text-ink-light">{label}</span>
      <div className="flex items-center gap-2">
        <span className={`text-sm font-heading font-bold ${trait.color}`}>{trait.label}</span>
        <span className="text-xs text-muted tabular-nums w-6 text-right">{value}</span>
      </div>
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="text-center p-2 rounded-lg bg-gray-50">
      <div className={`font-heading font-[800] text-2xl tabular-nums ${color ?? "text-ink"}`}>{value}</div>
      <div className="text-label text-[10px] uppercase">{label}</div>
    </div>
  );
}
