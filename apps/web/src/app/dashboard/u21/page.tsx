"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { Spinner, PageHeader, PositionBadge, BadgePreview, useConfirm } from "@/components/ui";
import type { BadgePattern } from "@/components/ui";

interface U21Player {
  id: string;
  first_name: string;
  last_name: string;
  nickname: string | null;
  age: number;
  position: "GK" | "DEF" | "MID" | "FWD";
  overall_rating: number;
  weekly_wage: number;
  status: string | null;
  parent_club_id: string | null;
  next_match_return: number;
}

interface SeniorPlayer {
  id: string;
  first_name: string;
  last_name: string;
  nickname: string;
  age: number;
  position: "GK" | "DEF" | "MID" | "FWD";
  overall_rating: number;
  weekly_wage: number | null;
  loan_from_team_id: string | null;
}

interface Standing {
  pos: number;
  team: string;
  teamId: string | null;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  gf: number;
  ga: number;
  points: number;
  isPlayer?: boolean;
  primaryColor?: string;
  secondaryColor?: string;
  badgePattern?: string;
}

interface LeagueRound {
  round: number;
  scheduledAt: string | null;
  matches: Array<{
    id: string;
    status: string;
    homeName: string;
    homeColor?: string;
    homeSecondary?: string;
    homeBadge?: string;
    homeScore: number | null;
    awayName: string;
    awayColor?: string;
    awaySecondary?: string;
    awayBadge?: string;
    awayScore: number | null;
  }>;
}

type Tab = "kadr" | "tabulka" | "rozpis";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("cs", { day: "numeric", month: "numeric" });
}

function ini(name: string): string {
  return name.replace(/ U21$/, "").split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

function stripU21(name: string): string {
  return name.replace(/ U21$/, "");
}

export default function U21Page() {
  const { teamId } = useTeam();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [tab, setTab] = useState<Tab>("kadr");
  const [u21TeamId, setU21TeamId] = useState<string | null>(null);
  const [u21LeagueId, setU21LeagueId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [seniorPlayers, setSeniorPlayers] = useState<SeniorPlayer[]>([]);
  const [u21Players, setU21Players] = useState<U21Player[]>([]);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [rounds, setRounds] = useState<LeagueRound[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadKadr = useCallback(async () => {
    if (!teamId || !u21TeamId) return;
    try {
      const senior = await apiFetch<SeniorPlayer[]>(`/api/teams/${teamId}/players`);
      const u21 = await apiFetch<{ players: U21Player[] }>(`/api/teams/${teamId}/u21/players`);
      setSeniorPlayers(Array.isArray(senior) ? senior : []);
      setU21Players(u21.players ?? []);
    } catch (e) {
      console.error("u21 kadr load:", e);
      setError("Nepodařilo se načíst kádry.");
    }
  }, [teamId, u21TeamId]);

  // Init: zjistit U21 tým a ligu
  useEffect(() => {
    if (!teamId) return;
    apiFetch<{ u21TeamId: string | null; u21LeagueId: string | null }>(`/api/teams/${teamId}/u21`)
      .then((r) => {
        setU21TeamId(r.u21TeamId);
        setU21LeagueId(r.u21LeagueId);
        setLoading(false);
      })
      .catch((e) => {
        console.error("fetch u21 info:", e);
        setLoading(false);
      });
  }, [teamId]);

  // Load kádr tab
  useEffect(() => {
    if (tab === "kadr") loadKadr();
  }, [tab, loadKadr]);

  // Load tabulka
  useEffect(() => {
    if (tab !== "tabulka" || !u21LeagueId) return;
    apiFetch<{ standings: Standing[] }>(`/api/leagues/${u21LeagueId}/standings`)
      .then((r) => setStandings(r.standings ?? []))
      .catch((e) => console.error("fetch u21 standings:", e));
  }, [tab, u21LeagueId]);

  // Load rozpis
  useEffect(() => {
    if (tab !== "rozpis" || !u21LeagueId || !teamId) return;
    apiFetch<{ rounds: LeagueRound[] }>(`/api/teams/${teamId}/league-schedule?leagueId=${u21LeagueId}`)
      .then((r) => setRounds(r.rounds ?? []))
      .catch((e) => console.error("fetch u21 rounds:", e));
  }, [tab, u21LeagueId, teamId]);

  const sendToU21 = async (playerId: string, mode: "permanent" | "next_match") => {
    if (!teamId) return;
    setBusy(playerId);
    setError(null);
    try {
      await apiFetch(`/api/teams/${teamId}/players/${playerId}/send-to-u21`, {
        method: "POST",
        body: JSON.stringify({ mode }),
        headers: { "Content-Type": "application/json" },
      });
      await loadKadr();
    } catch (e) {
      console.error("send to u21:", e);
      setError(e instanceof Error ? e.message : "Přesun do U21 selhal.");
    } finally {
      setBusy(null);
    }
  };

  const promoteToA = async (player: U21Player) => {
    if (!teamId) return;
    const ok = await confirm({
      title: "Povolat do A-týmu?",
      description: `${player.first_name} ${player.last_name} (${player.age} let, ${player.position}) přejde z U21 trvale do A-týmu.`,
      confirmLabel: "Povolat",
    });
    if (!ok) return;
    setBusy(player.id);
    setError(null);
    try {
      await apiFetch(`/api/teams/${teamId}/u21/players/${player.id}/promote`, {
        method: "POST",
      });
      await loadKadr();
    } catch (e) {
      console.error("promote:", e);
      setError(e instanceof Error ? e.message : "Povolání do A selhalo.");
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <PageHeader name="U21" detail="Rezervní tým mladých hráčů" />
        <div className="flex items-center justify-center py-12"><Spinner /></div>
      </div>
    );
  }

  if (!u21TeamId) {
    return (
      <div className="p-6">
        <PageHeader name="U21" detail="Rezervní tým mladých hráčů" />
        <div className="card p-6 text-center text-gray-600">
          Tvůj klub zatím nemá U21 tým. Kontaktuj správce hry.
        </div>
      </div>
    );
  }

  const young = seniorPlayers.filter((p) => p.age <= 21 && !p.loan_from_team_id);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <PageHeader name="U21" detail="Rezervní tým mladých hráčů (do 21 let)" />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {([
          { id: "kadr", label: "Kádr" },
          { id: "tabulka", label: "Tabulka" },
          { id: "rozpis", label: "Rozpis" },
        ] as Array<{ id: Tab; label: string }>).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id
                ? "border-pitch-500 text-pitch-700"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="card border-l-4 border-card-red bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {tab === "kadr" && (
        <div className="grid md:grid-cols-2 gap-4">
          {/* A-tým — mladí hráči k odeslání */}
          <section className="card p-4">
            <h2 className="font-heading font-bold text-base mb-3">
              A-tým: mladí hráči ({young.length})
            </h2>
            {young.length === 0 ? (
              <p className="text-sm text-gray-500">Žádný hráč do 21 let v A-týmu.</p>
            ) : (
              <ul className="space-y-2">
                {young.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 p-2 border border-gray-100 rounded">
                    <PositionBadge position={p.position} />
                    <Link
                      href={`/dashboard/player/${p.id}`}
                      className="flex-1 min-w-0 text-sm font-medium hover:text-pitch-600"
                    >
                      {p.last_name} {p.first_name}
                      <span className="text-xs text-gray-500 ml-2">{p.age} let · {p.overall_rating}</span>
                    </Link>
                    <button
                      disabled={busy === p.id}
                      onClick={() => sendToU21(p.id, "permanent")}
                      className="px-2 py-1 text-xs bg-pitch-500 hover:bg-pitch-600 text-white rounded disabled:opacity-50"
                      title="Trvale do U21 dokud ho nepovýšíš zpět"
                    >
                      → U21
                    </button>
                    <button
                      disabled={busy === p.id}
                      onClick={() => sendToU21(p.id, "next_match")}
                      className="px-2 py-1 text-xs bg-gold-500 hover:bg-gold-600 text-white rounded disabled:opacity-50"
                      title="Jen na nejbližší U21 zápas, pak zpět"
                    >
                      → 1 zápas
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* U21 kádr — povýšení */}
          <section className="card p-4">
            <h2 className="font-heading font-bold text-base mb-3">
              U21 kádr ({u21Players.length})
            </h2>
            {u21Players.length === 0 ? (
              <p className="text-sm text-gray-500">Kádr je prázdný.</p>
            ) : (
              <ul className="space-y-2">
                {u21Players.map((p) => {
                  const overstayed = p.age >= 22;
                  return (
                    <li
                      key={p.id}
                      className={`flex items-center gap-3 p-2 border rounded ${
                        overstayed ? "border-amber-300 bg-amber-50" : "border-gray-100"
                      }`}
                    >
                      <PositionBadge position={p.position} />
                      <Link
                        href={`/dashboard/player/${p.id}`}
                        className="flex-1 min-w-0 text-sm font-medium hover:text-pitch-600"
                      >
                        {p.last_name} {p.first_name}
                        <span className="text-xs text-gray-500 ml-2">{p.age} let · {p.overall_rating}</span>
                      </Link>
                      {p.next_match_return === 1 && (
                        <span className="text-[10px] bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded">
                          ↩ vrátí se
                        </span>
                      )}
                      {overstayed && (
                        <span className="text-[10px] bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded">
                          přestárlý
                        </span>
                      )}
                      <button
                        disabled={busy === p.id}
                        onClick={() => promoteToA(p)}
                        className="px-2 py-1 text-xs bg-pitch-500 hover:bg-pitch-600 text-white rounded disabled:opacity-50"
                        title="Povolat do A-týmu"
                      >
                        ↑ A-tým
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}

      {tab === "tabulka" && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs text-gray-500 uppercase">
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Tým</th>
                <th className="px-3 py-2 text-center">Z</th>
                <th className="px-3 py-2 text-center">V</th>
                <th className="px-3 py-2 text-center">R</th>
                <th className="px-3 py-2 text-center">P</th>
                <th className="px-3 py-2 text-center">Skóre</th>
                <th className="px-3 py-2 text-center font-bold">B</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s) => (
                <tr
                  key={s.pos}
                  className={`border-b border-gray-100 ${s.isPlayer ? "bg-pitch-50 font-semibold" : ""}`}
                >
                  <td className="px-3 py-2">{s.pos}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <BadgePreview
                        primary={s.primaryColor || "#2D5F2D"}
                        secondary={s.secondaryColor || "#FFFFFF"}
                        pattern={(s.badgePattern as BadgePattern) || "shield"}
                        initials={ini(s.team)}
                        size={22}
                      />
                      <span>{stripU21(s.team)}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums">{s.played}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{s.wins}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{s.draws}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{s.losses}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{s.gf}:{s.ga}</td>
                  <td className="px-3 py-2 text-center tabular-nums font-bold">{s.points}</td>
                </tr>
              ))}
              {standings.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center text-gray-500 py-6">
                    Žádné odehrané zápasy
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {confirmDialog}

      {tab === "rozpis" && (
        <div className="space-y-3">
          {rounds.length === 0 && (
            <div className="card p-6 text-center text-gray-500">Rozpis se načítá nebo není k dispozici.</div>
          )}
          {rounds.map((r) => (
            <div key={r.round} className="card p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-sm">Kolo {r.round}</span>
                <span className="text-xs text-gray-500">{formatDate(r.scheduledAt)}</span>
              </div>
              <ul className="space-y-1">
                {r.matches.map((m) => (
                  <li key={m.id} className="flex items-center justify-between text-sm py-1 border-t border-gray-100 first:border-0">
                    <span className="flex-1 flex items-center justify-end gap-2 min-w-0">
                      <span className="truncate">{stripU21(m.homeName)}</span>
                      <BadgePreview
                        primary={m.homeColor || "#2D5F2D"}
                        secondary={m.homeSecondary || "#FFFFFF"}
                        pattern={(m.homeBadge as BadgePattern) || "shield"}
                        initials={ini(m.homeName)}
                        size={20}
                      />
                    </span>
                    <span className="px-3 tabular-nums font-semibold">
                      {m.status === "simulated" ? `${m.homeScore} : ${m.awayScore}` : "—"}
                    </span>
                    <span className="flex-1 flex items-center justify-start gap-2 min-w-0">
                      <BadgePreview
                        primary={m.awayColor || "#2D5F2D"}
                        secondary={m.awaySecondary || "#FFFFFF"}
                        pattern={(m.awayBadge as BadgePattern) || "shield"}
                        initials={ini(m.awayName)}
                        size={20}
                      />
                      <span className="truncate">{stripU21(m.awayName)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
