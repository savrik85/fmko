"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { apiFetch, type Team, type Player } from "@/lib/api";
import { useTeam } from "@/context/team-context";
import { StammtischCard } from "@/components/relations/StammtischCard";
import { TipGameCard } from "@/components/pub/TipGameCard";
import { ListCard, ListRow, type BadgePattern, PageLoading } from "@/components/ui";
import { FaceAvatar } from "@/components/players/face-avatar";
import { ClubScarf, type ScarfPattern } from "@/components/team/club-scarf";

interface PubAttendee {
  playerId: string;
  firstName: string;
  lastName: string;
  alcohol: number;
  teamId: string;
  isVisitor: boolean;
  fromTeamName?: string;
  avatar?: Record<string, unknown> | null;
  isCoach?: boolean;
}

interface PubEffect {
  playerId: string;
  type: string;
  delta?: number;
  injuryDays?: number;
  label: string;
}

interface PubIncident {
  type: string;
  playerIds: string[];
  text: string;
  effects?: PubEffect[];
  incidentId?: string;
}

interface PubSession {
  id: number;
  gameDate: string;
  dailySpecial?: string | null;
  attendees: PubAttendee[];
  incidents: PubIncident[];
  createdAt: string;
}

const INCIDENT_ICON: Record<string, string> = {
  cross_team_fight: "🥊",
  cross_team_brotherhood: "🍻",
  cross_team_provocation: "👊",
  drink_record: "🍺",
  automat_win: "💰",
  story: "📰",
  lone_drinker: "🪑",
  nobody: "🌙",
  coach_led_visit: "🧑‍🏫",
  coach_led_one: "🧑‍🏫",
  coach_invited: "🧑‍🏫",
  cat: "🐈",
  priest: "⛪",
  scout: "🕵️",
  wife_call: "📞",
  bad_food: "🍲",
  pub_accident: "🩹",
  drunk_fight: "🤜",
  tab: "📒",
  jackpot: "🎰",
  free_round: "🍻",
  bar_champion: "🎯",
  village_hero: "🏆",
  friendly_reunion: "🤗",
  coach_tactics: "📋",
  coach_joins: "🍻",
  coach_praise: "👏",
  coach_scold: "😡",
  coach_lost_bet: "🎲",
  coach_naps: "😴",
  official_visit: "🤵",
  official_scandal: "🚨",
  hunters: "🦌",
  pig_slaughter: "🐷",
  lost_tourist: "🥾",
  firefighters: "🚒",
  village_fair: "🎪",
  storm_blackout: "⚡",
  mushroom_brag: "🍄",
  manager_meetup: "🍻",
  manager_round: "🍺",
  drby_o_incidentu: "🗣️",
  nabizi_zbozi: "🛍️",
  stezuje_si_na_trenera: "😤",
  rvacka_kvuli_kradezi: "🥊",
  cela_hospoda_resi: "📣",
  chlubi_se: "🦚",
  ohlasuje_cin: "⚠️",
  vudce_zlodej: "🧣",
};

/**
 * Vykreslí text incidentu a obarví zápisy typu „(+N atribut)" / „(−N atribut)".
 * Plus/zelená = pozitivní efekt, mínus/červená = negativní.
 */
function colorizeIncidentText(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /\(([+\-−]\d+)\s+([^)]+)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    const sign = match[1][0];
    const isPositive = sign === "+";
    parts.push(
      <span
        key={`fx-${i++}`}
        className={`font-heading font-bold ${isPositive ? "text-pitch-600" : "text-card-red"}`}
      >
        ({match[1]} {match[2]})
      </span>,
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length > 0 ? parts : text;
}

function effectColor(ef: PubEffect): string {
  if (ef.type === "injury" || ef.type === "hangover") return "text-card-red";
  if (ef.delta != null && ef.delta < 0) return "text-card-red";
  if (ef.delta != null && ef.delta > 0) return "text-pitch-500";
  return "text-muted";
}

export default function HospodaPage() {
  const { teamId } = useTeam();
  const [sessions, setSessions] = useState<PubSession[]>([]);
  const [team, setTeam] = useState<Team | null>(null);
  const [avatarsById, setAvatarsById] = useState<Record<string, Record<string, unknown>>>({});
  const [npcEncounters, setNpcEncounters] = useState<Array<{
    id: string; first_name: string; last_name: string; role: string;
    personality: string; face_config: string; expires_at: string;
  }>>([]);
  const [respondingNpc, setRespondingNpc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async (tid: string) => {
    const [s, t, players, npcs] = await Promise.all([
      apiFetch<{ sessions: PubSession[] }>(`/api/teams/${tid}/pub-sessions?limit=30`).catch((e) => { console.error("pub-sessions fetch:", e); return { sessions: [] as PubSession[] }; }),
      apiFetch<Team>(`/api/teams/${tid}`).catch((e) => { console.error("team fetch:", e); return null; }),
      apiFetch<Player[]>(`/api/teams/${tid}/players`).catch((e) => { console.error("players fetch:", e); return [] as Player[]; }),
      apiFetch<Array<{ id: string; first_name: string; last_name: string; role: string; personality: string; face_config: string; expires_at: string; }>>(
        `/api/villages/pub-encounters?teamId=${tid}`,
      ).catch((e) => { console.error("npc encounters fetch:", e); return []; }),
    ]);
    setSessions(s.sessions);
    setTeam(t);
    const map: Record<string, Record<string, unknown>> = {};
    for (const p of players) map[p.id] = p.avatar as Record<string, unknown>;
    setAvatarsById(map);
    setNpcEncounters(npcs);
  };

  useEffect(() => {
    if (!teamId) return;
    refresh(teamId).finally(() => setLoading(false));
  }, [teamId]);

  const respondNpc = async (id: string, action: "invite_beer" | "ignore") => {
    if (respondingNpc) return;
    setRespondingNpc(id);
    try {
      await apiFetch(`/api/villages/pub-encounters/${id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (teamId) await refresh(teamId);
    } catch (e: unknown) {
      console.error("npc respond:", e);
    } finally {
      setRespondingNpc(null);
    }
  };

  if (loading) return <PageLoading />;

  // Top pijani — kolikrát byl v hospodě. Hráče, kteří už v týmu nejsou
  // (prodáni/uvolněni), do Síně slávy nepouštíme — odkaz na profil by byl 404.
  const drinkerCounts = new Map<string, { name: string; count: number }>();
  for (const s of sessions) {
    for (const a of s.attendees) {
      if (a.isVisitor) continue;
      if (a.isCoach || a.playerId.startsWith("coach-") || a.playerId.startsWith("npc-")) continue;
      if (!avatarsById[a.playerId]) continue;
      const key = a.playerId;
      const cur = drinkerCounts.get(key) ?? { name: `${a.firstName} ${a.lastName}`, count: 0 };
      cur.count++;
      drinkerCounts.set(key, cur);
    }
  }
  const topDrinkers = [...drinkerCounts.entries()]
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  const scarfPrimary = team?.badge_primary_color || team?.primary_color || "#2D5F2D";
  const scarfSecondary = team?.badge_secondary_color || team?.secondary_color || "#FFF";
  const badgeInit = team?.badge_initials || (team?.name ?? "").split(" ").map((w) => w[0]).filter(Boolean).slice(0, 3).join("").toUpperCase();

  // Helper: kontrast textu na šále podle světlosti primary barvy
  const isLight = (() => {
    const c = (scarfPrimary || "").replace("#", "");
    if (c.length < 6) return false;
    const r = parseInt(c.slice(0, 2), 16); const g = parseInt(c.slice(2, 4), 16); const b = parseInt(c.slice(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 160;
  })();
  const textColor = isLight ? "#222" : "#FFF";

  return (
    <div className="page-container space-y-5">
      {/* Header — klubová šála + nadpis + bar atmosféra (béžová) */}
      <div className="rounded-xl overflow-hidden shadow-sm" style={{ background: "#F5EDDF" }}>
        <div className="h-1" style={{ background: scarfPrimary }} />
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-7 px-3 sm:px-6 py-4 sm:py-5">
          {/* Šála: na mobilu full-width 200×60, na desktopu fixed 220×80 */}
          <div className="w-full sm:w-auto">
            <ClubScarf
              primary={scarfPrimary}
              secondary={scarfSecondary}
              pattern={(team?.badge_pattern as BadgePattern) || "shield"}
              scarfPattern={(team?.scarf_pattern as ScarfPattern) || "classic"}
              initials={badgeInit}
              symbol={team?.badge_symbol}
              className="block sm:hidden h-16 w-full"
            />
            <ClubScarf
              primary={scarfPrimary}
              secondary={scarfSecondary}
              pattern={(team?.badge_pattern as BadgePattern) || "shield"}
              scarfPattern={(team?.scarf_pattern as ScarfPattern) || "classic"}
              initials={badgeInit}
              symbol={team?.badge_symbol}
              width={460}
              height={110}
              className="hidden sm:block"
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="font-heading font-[800] text-2xl sm:text-3xl leading-none text-ink">U nás v hospodě</h1>
                <p className="text-sm text-muted mt-1">Kdo tam byl, co se dělo, co to stálo.</p>
              </div>
              <Link href="/prehled" className="text-sm font-heading font-bold text-pitch-500 hover:text-pitch-600 whitespace-nowrap shrink-0">← Domů</Link>
            </div>
          </div>
        </div>
        <div className="h-1" style={{ background: scarfSecondary }} />
      </div>

      {/* Trenérský stůl — posezení s trenéry a runda pro hospodu */}
      {teamId && <StammtischCard teamId={teamId} />}

      {/* Tipovačka u výčepu — lístek na nejbližší kolo okresu */}
      {teamId && <TipGameCard teamId={teamId} />}

      {/* NPC v hospodě — náhodné setkání se zastupitelem obce */}
      {npcEncounters.length > 0 && (
        <ListCard title="Někdo z radnice je dnes tady">
          {npcEncounters.map((p) => {
            let face: Record<string, unknown> = {};
            try { face = JSON.parse(p.face_config); } catch { face = {}; }
            const ROLE_LABEL: Record<string, string> = {
              starosta: "Starosta", mistostarosta: "Místostarosta",
              zastupitel_1: "Zastupitel", zastupitel_2: "Zastupitel",
            };
            return (
              <ListRow key={p.id} tone="warn"
                leading={<FaceAvatar faceConfig={face} size={36} />}
                title={`${p.first_name} ${p.last_name}`}
                meta={`${ROLE_LABEL[p.role] ?? "Zastupitel"} · vyprší ${new Date(p.expires_at).toLocaleDateString("cs")}`}
                detail={
                  <>
                    <span className="block">Sedí u baru a popíjí sám. Řeší se, jestli si k němu sedneš.</span>
                    <span className="flex flex-wrap gap-2 mt-2">
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={respondingNpc === p.id}
                        onClick={() => respondNpc(p.id, "invite_beer")}
                      >
                        Pozvat na pivo
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        disabled={respondingNpc === p.id}
                        onClick={() => respondNpc(p.id, "ignore")}
                      >
                        Ignorovat
                      </button>
                    </span>
                  </>
                } />
            );
          })}
        </ListCard>
      )}

      {/* Síň slávy štamgastů */}
      {topDrinkers.length > 0 && (
        <ListCard title="Síň slávy štamgastů">
          {topDrinkers.map((d, i) => {
            const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉";
            const avatar = avatarsById[d.id];
            return (
              <ListRow key={d.id} href={`/hrac/${d.id}`}
                leading={
                  <span className="relative">
                    {avatar
                      ? <FaceAvatar faceConfig={avatar} size={36} className="rounded-full bg-white" />
                      : <span className="rounded-full bg-surface-3 flex items-center justify-center text-meta font-heading font-bold text-muted" style={{ width: 36, height: 36 }}>{d.name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("")}</span>}
                    <span className="absolute -bottom-1 -right-1.5 text-sm leading-none drop-shadow-sm" aria-hidden="true">{medal}</span>
                  </span>
                }
                title={d.name}
                meta={`${d.count}× ${d.count === 1 ? "večer" : d.count < 5 ? "večery" : "večerů"} v hospodě`} />
            );
          })}
        </ListCard>
      )}

      {/* Sessions history */}
      {sessions.length === 0 ? (
        <div className="card p-4 sm:p-5">
          <p className="text-sm text-muted">Zatím žádné hospodské večery. První přijde s novým herním dnem.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => {
            const localCount = s.attendees.filter((a) => !a.isVisitor).length;
            const visitorCount = s.attendees.filter((a) => a.isVisitor).length;
            return (
              <div key={s.id} className="card p-4 sm:p-5">
                <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                  <div className="font-heading font-bold text-sm capitalize">
                    {new Date(s.gameDate).toLocaleDateString("cs", { weekday: "long" })} večer
                  </div>
                  <div className="text-micro text-muted uppercase font-heading">
                    {localCount} {localCount === 1 ? "místní" : localCount < 5 ? "místní" : "místních"}
                    {visitorCount > 0 && <span className="text-amber-600">, {visitorCount} {visitorCount === 1 ? "host" : "hosté"}</span>}
                  </div>
                </div>

                {s.dailySpecial && (
                  <div className="mb-3 -mx-4 sm:-mx-5 px-4 sm:px-5 py-2 text-micro uppercase font-heading tracking-wider text-amber-800 bg-amber-50 border-y border-amber-100">
                    📋 {s.dailySpecial}
                  </div>
                )}

                {s.attendees.length > 0 && (
                  <div className="mb-3">
                    <div className="text-micro uppercase text-muted font-heading mb-1.5">V hospodě</div>
                    <div className="flex flex-wrap gap-2">
                      {s.attendees.map((a) => {
                        const avatar = avatarsById[a.playerId] ?? a.avatar;
                        const initials = `${a.firstName[0] ?? ""}${a.lastName[0] ?? ""}`.toUpperCase();
                        const palette = a.isCoach
                          ? "bg-pitch-50 text-pitch-800 ring-1 ring-pitch-200"
                          : a.isVisitor
                          ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100"
                          : "bg-gray-50 hover:bg-pitch-50 text-ink";
                        const inner = (
                          <>
                            {avatar
                              ? <FaceAvatar faceConfig={avatar} size={28} className="rounded-full bg-white ring-1 ring-black/5" />
                              : <span className="rounded-full bg-gray-200 ring-1 ring-black/5 flex items-center justify-center text-micro font-heading font-bold text-muted shrink-0" style={{ width: 28, height: 28 }}>{initials}</span>}
                            <span className="font-heading font-bold whitespace-nowrap">
                              {a.firstName} {a.lastName}
                            </span>
                            {a.isCoach && <span className="text-micro text-pitch-700">(trenér)</span>}
                            {a.isVisitor && <span className="text-micro text-amber-700">({a.fromTeamName})</span>}
                          </>
                        );
                        // Bývalý vlastní hráč (prodán/uvolněn) → není v current squadu,
                        // /hrac/:id by skončil 404. NPC jsou neklikatelní.
                        const isFormer = !a.isVisitor && !a.isCoach
                          && !a.playerId.startsWith("coach-") && !a.playerId.startsWith("npc-")
                          && !avatarsById[a.playerId];
                        // Trenér → profil manažera (managerId == teamId)
                        if (a.isCoach && a.teamId) {
                          return (
                            <Link
                              key={a.playerId}
                              href={`/manazer/${a.teamId}`}
                              className={`flex items-center gap-2 pl-1 pr-3 py-1 rounded-full text-xs ${palette}`}
                            >
                              {inner}
                            </Link>
                          );
                        }
                        if (a.playerId.startsWith("coach-") || a.playerId.startsWith("npc-") || isFormer) {
                          return (
                            <span key={a.playerId} className={`flex items-center gap-2 pl-1 pr-3 py-1 rounded-full text-xs ${palette}${isFormer ? " opacity-60" : ""}`} title={isFormer ? "Bývalý hráč" : undefined}>
                              {inner}
                            </span>
                          );
                        }
                        return (
                          <Link
                            key={a.playerId}
                            href={`/hrac/${a.playerId}`}
                            className={`flex items-center gap-2 pl-1 pr-3 py-1 rounded-full text-xs ${palette}`}
                          >
                            {inner}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                )}

                {s.incidents.length > 0 && (
                  <ul className="-mx-4 sm:-mx-5 -mb-4 sm:-mb-5 mt-2 border-t border-line divide-y divide-line-soft">
                    {s.incidents.map((inc, i) => {
                      const playerNameById = (id: string) => {
                        const a = s.attendees.find((x) => x.playerId === id);
                        return a ? `${a.firstName} ${a.lastName}` : "?";
                      };
                      return (
                        <li key={i}>
                          {/* Výtržnost je celá jednou větou, proto řádek bez názvu. Hustý řádek
                              a ikona bez dlaždice: večer jich má i deset a s běžným řádkem by
                              karta na telefonu narostla o 40 %. */}
                          <ListRow dense
                            leading={<span className="text-base leading-none" aria-hidden="true">{INCIDENT_ICON[inc.type] ?? "•"}</span>}
                            detail={
                              <>
                                <span className="block">{colorizeIncidentText(inc.text)}</span>
                                {inc.effects && inc.effects.length > 0 && (
                                  <span className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-micro">
                                    {inc.effects.map((ef, ei) => (
                                      <span key={ei} className={effectColor(ef)}>
                                        <span className="text-muted">{playerNameById(ef.playerId)}:</span> <span className="font-heading font-bold">{ef.label}</span>
                                      </span>
                                    ))}
                                  </span>
                                )}
                                {inc.incidentId && (
                                  <Link
                                    href={`/incidenty?id=${encodeURIComponent(inc.incidentId)}`}
                                    className="mt-1 inline-block text-meta font-heading font-bold text-pitch-600 hover:text-pitch-500"
                                  >
                                    Otevřít incident →
                                  </Link>
                                )}
                              </>
                            } />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

