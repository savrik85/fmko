"use client";

/** Widgety kolem zápasů — dnešní program, náhled dalšího zápasu, rozpis, poslední výsledky. */

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { apiFetch, showError } from "@/lib/api";
import { BadgePreview, useConfirm, type BadgePattern } from "@/components/ui";
import { WidgetSkeleton, WidgetError } from "../widget-frame";
import type { WidgetProps, ScheduleMatch } from "../types";
import { rowsForHeight, ROW_PX } from "../widget-heights";
import { initials } from "./shared";

// ── Dnešní program ──────────────────────────────────────────────────────────

export function TodayProgramWidget({ data }: WidgetProps) {
  const team = data.team.data;
  const matches = data.schedule.data?.matches ?? [];
  if (data.team.loading || data.schedule.loading) return <WidgetSkeleton rows={2} />;
  if (!team) return <WidgetError />;

  const gameDate = team.game_date ? new Date(team.game_date) : null;
  const dayOfWeek = gameDate?.getUTCDay() ?? 0;
  const isTrainingDay = dayOfWeek >= 0 && dayOfWeek <= 6;
  const nextMatch = matches.find((m) => m.status !== "simulated");

  // Zápasový den = zápas má stejné kalendářní datum jako herní čas. Pending zápas,
  // jehož termín už uplynul (match-tick zaostává), se počítá taky — jinak by karta
  // hlásila „DNES!" a program mlčel.
  const isMatchDay = (() => {
    if (!nextMatch?.scheduledAt || !gameDate) return false;
    const matchDate = new Date(nextMatch.scheduledAt);
    const sameDay = matchDate.getUTCFullYear() === gameDate.getUTCFullYear()
      && matchDate.getUTCMonth() === gameDate.getUTCMonth()
      && matchDate.getUTCDate() === gameDate.getUTCDate();
    return sameDay || matchDate.getTime() <= gameDate.getTime();
  })();

  const matchOpponent = nextMatch ? (nextMatch.isHome ? nextMatch.awayName : nextMatch.homeName) : null;
  const dayName = gameDate ? gameDate.toLocaleDateString("cs", { weekday: "long" }) : "";

  return (
    // Zvýraznění zápasového dne zůstává uvnitř karty — kdyby se roztáhlo přes
    // celou kartu zápornými okraji, prošel by rámeček skrz nadpis widgetu.
    <div className={`flex items-center gap-4 ${isMatchDay ? "rounded-xl ring-2 ring-pitch-400 bg-pitch-50/30 p-3 mt-1" : ""}`}>
      <div className="text-3xl">{isMatchDay ? "⚽" : isTrainingDay ? "🏋️" : "🌴"}</div>
      <div className="flex-1">
        <div className="font-heading font-bold text-lg">
          {isMatchDay ? "Zápasový den!" : isTrainingDay ? "Tréninkový den" : "Volný den"}
        </div>
        <div className="text-sm text-muted">
          {dayName && <span className="capitalize">{dayName}</span>}
          {isMatchDay && matchOpponent && (
            <span> · <span className="font-heading font-bold text-pitch-600">{matchOpponent}</span> · výkop v 18:00</span>
          )}
          {isTrainingDay && !isMatchDay && <span> · Trénink dle plánu</span>}
          {!isTrainingDay && !isMatchDay && <span> · Regenerace, žádný program</span>}
        </div>
      </div>
      {isMatchDay && (
        <Link href="/dashboard/match" className="py-2 px-4 rounded-soft bg-pitch-500 text-white font-heading font-bold text-sm hover:bg-pitch-600 transition-colors">
          Sestava →
        </Link>
      )}
    </div>
  );
}

// ── Další zápas ─────────────────────────────────────────────────────────────

export function NextMatchWidget({ data, teamId }: WidgetProps) {
  const team = data.team.data;
  const preview = data.preview.data;
  const matches = data.schedule.data?.matches ?? [];
  const promotionPrice = data.schedule.data?.promotionPrice ?? null;
  const [promoting, setPromoting] = useState(false);
  const [localMatches, setLocalMatches] = useState<ScheduleMatch[] | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();

  const list = localMatches ?? matches;
  const nextMatch = list.find((m) => m.status !== "simulated");

  if (data.schedule.loading || data.team.loading) return <WidgetSkeleton rows={5} />;
  if (data.schedule.error) return <WidgetError />;
  if (!nextMatch || !team) return <div className="text-center text-muted py-4">Žádný naplánovaný zápas</div>;

  const gameDate = team.game_date ? new Date(team.game_date) : null;
  const color = team.primary_color || "#2D5F2D";

  const promoteMatch = async (m: ScheduleMatch) => {
    if (!teamId || promoting) return;
    const priceStr = promotionPrice != null ? `${promotionPrice.toLocaleString("cs")} Kč` : "500–2 500 Kč";
    const ok = await confirm({
      title: `Propagovat zápas proti ${m.awayName}?`,
      description: `Doma · ${m.scheduledAt ? new Date(m.scheduledAt).toLocaleDateString("cs") : ""}. Vyjde článek ve Zpravodaji a přijde +25 % diváků.`,
      details: [{ label: "Cena", value: `-${priceStr}`, color: "text-card-red" }],
      confirmLabel: promotionPrice != null ? `Propagovat za ${priceStr}` : "Propagovat",
    });
    if (!ok) return;
    setPromoting(true);
    const res = await apiFetch<{ ok?: boolean; cost?: number; error?: string }>(
      `/api/teams/${teamId}/matches/${m.id}/promote`,
      { method: "POST" },
    ).catch((e) => { console.error("propagace zápasu:", e); return { error: "Chyba při propagaci" }; });
    setPromoting(false);
    if (res?.error) { showError("Chyba", res.error ?? "Zkus to prosím znovu."); return; }
    const refreshed = await apiFetch<{ matches: ScheduleMatch[] }>(`/api/teams/${teamId}/schedule`)
      .catch((e) => { console.error("obnovení rozpisu:", e); return null; });
    if (refreshed) setLocalMatches(refreshed.matches);
  };

  const my = preview?.isHome ? preview.home : preview?.away;
  const opp = preview?.isHome ? preview.away : preview?.home;
  const oppName = nextMatch.isHome ? nextMatch.awayName : nextMatch.homeName;
  const oppColor = nextMatch.isHome ? (nextMatch.awayColor || "#666") : (nextMatch.homeColor || "#666");
  const oppSecondary = nextMatch.isHome ? (nextMatch.awaySecondary || "#FFF") : (nextMatch.homeSecondary || "#FFF");
  const oppBadge = ((nextMatch.isHome ? nextMatch.awayBadge : nextMatch.homeBadge) as BadgePattern) || "shield";

  const myTeamData = {
    id: teamId, name: team.name,
    color: team.badge_primary_color || color,
    secondary: team.badge_secondary_color || team.secondary_color || "#FFF",
    badge: (team.badge_pattern as BadgePattern) || "shield",
    customInitials: team.badge_initials, symbol: team.badge_symbol, pos: my,
  };
  const oppTeamData = {
    id: (nextMatch.isHome ? preview?.away?.id : preview?.home?.id)
      ?? (nextMatch.isHome ? nextMatch.awayTeamId : nextMatch.homeTeamId) ?? "",
    name: oppName, color: oppColor, secondary: oppSecondary, badge: oppBadge,
    customInitials: null as string | null, symbol: null as string | null, pos: opp,
  };
  const homeTeam = nextMatch.isHome ? myTeamData : oppTeamData;
  const awayTeam = nextMatch.isHome ? oppTeamData : myTeamData;
  const homeForm = preview ? (nextMatch.isHome ? my : opp) : null;
  const awayForm = preview ? (nextMatch.isHome ? opp : my) : null;

  // Velkokluby v poháru nemají vlastní stránku (chybí reálné team id) → nelinkovat.
  const TeamCell = ({ t, children }: { t: { id: string }; children: ReactNode }) =>
    t.id
      ? <Link href={`/dashboard/team/${t.id}`} className="flex-1 text-center hover:opacity-80 transition-opacity">{children}</Link>
      : <div className="flex-1 text-center">{children}</div>;

  return (
    <>
      {confirmDialog}
      <div className="overflow-hidden rounded-xl border border-gray-100">
        <div className="bg-gradient-to-b from-[#1e2d1e] to-[#2a3f2a] px-4 py-3 text-white">
          <div className="text-center mb-2 flex items-center justify-center gap-2">
            <span className="text-micro font-heading font-bold uppercase tracking-widest text-white/40">
              {/* Trofej i k nazvu kola — roundName vraci u strednich kol holé „N. kolo",
                  ktere je jinak k nerozeznani od ligoveho. */}
              {nextMatch.isCup ? `🏆 ${nextMatch.roundName ?? "Pohár"}` : nextMatch.round != null ? `${nextMatch.round}. kolo` : "Přátelák"}
            </span>
            {nextMatch.scheduledAt && gameDate && (() => {
              const daysUntil = Math.max(0, Math.round((new Date(nextMatch.scheduledAt).getTime() - gameDate.getTime()) / 86400000));
              const label = daysUntil === 0 ? "dnes!" : daysUntil === 1 ? "zítra" : `za ${daysUntil} dní`;
              return (
                <>
                  <span className="text-white/20">•</span>
                  <span className={`text-micro font-heading font-bold uppercase tracking-widest ${daysUntil === 0 ? "text-pitch-400" : "text-white/60"}`}>{label}</span>
                </>
              );
            })()}
          </div>
          <div className="flex items-start gap-3">
            <TeamCell t={homeTeam}>
              <div className="flex justify-center mb-1.5">
                <BadgePreview primary={homeTeam.color} secondary={homeTeam.secondary} pattern={homeTeam.badge}
                  initials={homeTeam.customInitials || initials(homeTeam.name)} symbol={homeTeam.symbol} size={38} />
              </div>
              <div className="font-heading font-bold text-sm leading-tight">{homeTeam.name}</div>
              {homeTeam.pos && (
                <div className="text-micro text-white/40 tabular-nums leading-tight">{homeTeam.pos.position}. místo</div>
              )}
            </TeamCell>
            <div className="shrink-0 flex flex-col items-center pt-2">
              <div className="w-8 h-8 rounded-full border-2 border-white/10 flex items-center justify-center">
                <span className="font-heading font-[800] text-micro text-white/30">VS</span>
              </div>
            </div>
            <TeamCell t={awayTeam}>
              <div className="flex justify-center mb-1.5">
                <BadgePreview primary={awayTeam.color} secondary={awayTeam.secondary} pattern={awayTeam.badge}
                  initials={awayTeam.customInitials || initials(awayTeam.name)} symbol={awayTeam.symbol} size={38} />
              </div>
              <div className="font-heading font-bold text-sm leading-tight">{awayTeam.name}</div>
              {awayTeam.pos && (
                <div className="text-micro text-white/40 tabular-nums leading-tight">{awayTeam.pos.position}. místo</div>
              )}
            </TeamCell>
          </div>
        </div>

        {homeForm && awayForm && (homeForm.form.length > 0 || awayForm.form.length > 0) && (
          <div className="flex items-center px-4 py-2 border-b border-gray-100 overflow-hidden">
            <div className="flex-1 min-w-0 flex gap-1 justify-end overflow-hidden">
              {homeForm.form.slice(0, 5).map((f, i) => <MiniForm key={i} f={f} />)}
            </div>
            <div className="shrink-0 w-12 text-center text-micro text-muted uppercase font-heading">Forma</div>
            <div className="flex-1 min-w-0 flex gap-1 overflow-hidden">
              {awayForm.form.slice(0, 5).map((f, i) => <MiniForm key={i} f={f} />)}
            </div>
          </div>
        )}

        {preview && my && opp && (() => {
          const home = nextMatch.isHome ? my : opp;
          const away = nextMatch.isHome ? opp : my;
          const avgByPos = (squad: typeof home.squad, pos: string) => {
            const ps = (squad ?? []).filter((p) => p.position === pos);
            return ps.length ? Math.round(ps.reduce((s, p) => s + (p.rating ?? 0), 0) / ps.length) : 0;
          };
          const homeAge = home.squad?.length ? Math.round(home.squad.reduce((s, p) => s + p.age, 0) / home.squad.length) : 0;
          const awayAge = away.squad?.length ? Math.round(away.squad.reduce((s, p) => s + p.age, 0) / away.squad.length) : 0;
          const stats = [
            { label: "Rating", h: home.avgRating, a: away.avgRating, higherBetter: true },
            { label: "BRA", h: avgByPos(home.squad, "GK"), a: avgByPos(away.squad, "GK"), higherBetter: true },
            { label: "OBR", h: avgByPos(home.squad, "DEF"), a: avgByPos(away.squad, "DEF"), higherBetter: true },
            { label: "ZÁL", h: avgByPos(home.squad, "MID"), a: avgByPos(away.squad, "MID"), higherBetter: true },
            { label: "ÚTO", h: avgByPos(home.squad, "FWD"), a: avgByPos(away.squad, "FWD"), higherBetter: true },
            { label: "Věk", h: homeAge, a: awayAge, higherBetter: false },
          ];
          return (
            <div className="px-4 py-3 space-y-2.5 border-b border-gray-100">
              {stats.map((s) => {
                const total = (s.h + s.a) || 1;
                const hPct = Math.round((s.h / total) * 100);
                const hBetter = s.higherBetter ? s.h > s.a : s.h < s.a;
                const aBetter = s.higherBetter ? s.a > s.h : s.a < s.h;
                return (
                  <div key={s.label}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-sm font-heading font-bold tabular-nums ${hBetter ? "text-pitch-600" : aBetter ? "text-card-red" : "text-ink"}`}>{s.h}</span>
                      <span className="text-micro text-muted uppercase font-heading">{s.label}</span>
                      <span className={`text-sm font-heading font-bold tabular-nums ${aBetter ? "text-pitch-600" : hBetter ? "text-card-red" : "text-ink"}`}>{s.a}</span>
                    </div>
                    <div className="flex h-1.5 rounded-full overflow-hidden">
                      <div className="transition-all" style={{ width: `${hPct}%`, background: hBetter ? "#3D7A3D" : "#dc6b6b" }} />
                      <div className="transition-all flex-1" style={{ background: aBetter ? "#3D7A3D" : "#dc6b6b" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {preview?.odds?.home && preview.odds.draw && preview.odds.away && (() => {
          // Vlastní zápas — sázet na něj nejde, takže je to čistě informace, jak
          // tým vidí kancelář. Zvýrazněný je favorit. Vysvětlovat to v UI netřeba,
          // hráč vidí kurzy a rozumí jim.
          const k = (x: number) => (x / 100).toFixed(2).replace(".", ",");
          const domaci = preview.odds.home!, remiza = preview.odds.draw!, hoste = preview.odds.away!;
          const nej = Math.min(domaci, remiza, hoste);
          const bunka = (popis: string, kurz: number) => (
            <div className={`text-center py-1 rounded-tight ${kurz === nej ? "bg-pitch-50" : ""}`}>
              <div className="text-micro text-muted font-heading font-bold uppercase leading-none">{popis}</div>
              <div className={`text-sm font-heading font-bold tabular-nums leading-none mt-0.5
                               ${kurz === nej ? "text-pitch-600" : ""}`}>{k(kurz)}</div>
            </div>
          );
          return (
            <div className="px-4 py-2.5 border-b border-gray-100">
              <div className="grid grid-cols-3 gap-1.5">
                {bunka(nextMatch.isHome ? "Vy" : "Domácí", domaci)}
                {bunka("Remíza", remiza)}
                {bunka(nextMatch.isHome ? "Soupeř" : "Vy", hoste)}
              </div>
            </div>
          );
        })()}

        {preview && (
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
            <div className="flex items-center gap-1.5 text-sm text-muted">
              <span className="text-base">{preview.weather.icon}</span>
              <span>{preview.weather.temperature} °C</span>
            </div>
            {/* Dějiště je proklik na areál: doma na vlastní stadion, venku na
                stadion soupeře. Bez odkazu se hráč o hřišti, na kterém za dva dny
                nastoupí, nedozvěděl nic. */}
            <Link
              href={nextMatch.isHome ? "/dashboard/stadium" : `/dashboard/team/${homeTeam.id}/stadium`}
              className="text-sm text-muted truncate ml-2 hover:text-pitch-600 hover:underline"
            >
              {preview.venue.name}
            </Link>
          </div>
        )}

        <div className="text-center px-4 py-2">
          <Link href="/dashboard/match" className="inline text-sm text-pitch-500 font-heading font-bold hover:underline">Sestava →</Link>
          {nextMatch.isHome && nextMatch.promoted && (
            <span className="inline ml-4 text-sm text-gold-600 font-heading font-bold">📢 Propagováno</span>
          )}
          {nextMatch.isHome && !nextMatch.promoted && (
            <button
              onClick={() => promoteMatch(nextMatch)}
              disabled={promoting}
              className="inline ml-4 text-sm text-gold-600 font-heading font-bold hover:underline disabled:opacity-50"
            >
              {promoting ? "..." : "📢 Propagovat"}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

function MiniForm({ f }: { f: string }) {
  return (
    <span className={`shrink-0 w-5 h-5 rounded-control text-micro flex items-center justify-center font-bold text-white ${
      f === "W" ? "bg-pitch-500" : f === "L" ? "bg-card-red" : "bg-gray-300"
    }`}>{f === "W" ? "V" : f === "L" ? "P" : "R"}</span>
  );
}

// ── Rozpis ──────────────────────────────────────────────────────────────────

export function FixturesWidget({ data, height }: WidgetProps) {
  if (data.schedule.loading) return <WidgetSkeleton />;
  if (data.schedule.error) return <WidgetError />;
  const upcoming = (data.schedule.data?.matches ?? []).filter((m) => m.status !== "simulated").slice(0, rowsForHeight(height, ROW_PX.list, 32));

  return (
    <>
      {upcoming.length > 0 ? (
        <div className="space-y-2">
          {upcoming.map((m) => {
            const opp = m.isHome ? m.awayName : m.homeName;
            const date = m.scheduledAt ? new Date(m.scheduledAt).toLocaleDateString("cs", { day: "numeric", month: "numeric" }) : "";
            // Rozpis vrací calendarId pro ligový zápas, u přáteláku je id = match.id
            const switchId = m.calendarId ?? m.id;
            return (
              <Link key={m.id} href={`/dashboard/match?calendarId=${switchId}`} className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-b-0 hover:bg-gray-50 -mx-2 px-2 rounded transition-colors">
                <span className="text-sm text-muted tabular-nums w-5">{m.round}.</span>
                <span className="text-sm font-heading font-bold flex-1 truncate">{opp}</span>
                <span className={`text-micro font-heading font-bold uppercase ${m.isHome ? "text-pitch-600" : "text-muted"}`}>{m.isHome ? "D" : "V"}</span>
                <LineupFlag m={m} />
                <span className="text-micro text-muted tabular-nums">{date}</span>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="text-center text-muted py-4 text-sm">Žádné naplánované</div>
      )}
      <div className="text-center pt-2">
        <Link href="/dashboard/schedule" className="text-sm text-pitch-500 font-heading font-bold hover:underline">Celý rozpis →</Link>
      </div>
    </>
  );
}

function LineupFlag({ m }: { m: ScheduleMatch }) {
  if (m.presetSlot) {
    return <span className="text-micro font-heading font-bold px-1.5 py-0.5 rounded bg-pitch-100 text-pitch-700">{m.presetSlot}</span>;
  }
  if (m.hasLineup) return <span className="text-micro text-pitch-600" title="Sestava nastavena">✓</span>;
  if (m.isDefaultLineup) {
    return m.defaultPresetSlot
      ? <span className="text-micro font-heading font-bold px-1.5 py-0.5 rounded bg-gray-100 text-muted" title="Výchozí sestava">{m.defaultPresetSlot}</span>
      : <span className="text-micro text-muted" title="Použije se výchozí sestava">✓</span>;
  }
  return <span className="text-micro text-card-red font-bold" title="Bez sestavy — použije se auto">!</span>;
}

// ── Poslední zápasy ─────────────────────────────────────────────────────────

export function RecentMatchesWidget({ data, height }: WidgetProps) {
  if (data.matchResults.loading) return <WidgetSkeleton />;
  if (data.matchResults.error) return <WidgetError />;
  const matches = data.matchResults.data?.matches ?? [];
  if (matches.length === 0) return <div className="text-sm text-muted py-4 text-center">Zatím žádný odehraný zápas.</div>;

  return (
    <>
      <div className="overflow-x-auto -mx-4 sm:-mx-5 table-scroll">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-label border-b border-gray-200 text-micro uppercase tracking-wide">
              <th className="pb-2 pl-4 sm:pl-5 pr-2 w-10">Kolo</th>
              <th className="pb-2 pr-2">Soupeř</th>
              <th className="pb-2 pr-4 sm:pr-5 text-center w-20">Výsledek</th>
            </tr>
          </thead>
          <tbody>
            {matches.slice(0, rowsForHeight(height, ROW_PX.tableBadge, 60)).map((m) => {
              const resultBg = m.result === "W" ? "bg-pitch-50" : m.result === "L" ? "bg-red-50" : "bg-gray-50";
              const resultText = m.result === "W" ? "text-pitch-600" : m.result === "L" ? "text-card-red" : "text-muted";
              return (
                <tr key={m.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                  <td className="py-2 pl-4 sm:pl-5 pr-2 tabular-nums text-muted">{m.round ?? "—"}</td>
                  <td className="py-2 pr-2">
                    <a href={`/dashboard/match/${m.id}`} className="flex items-center gap-2 hover:underline">
                      <BadgePreview primary={m.opponentColor} secondary={m.opponentSecondary}
                        pattern={(m.opponentBadge as BadgePattern) || "shield"}
                        initials={initials(m.opponent ?? "")} size={20} />
                      <span className="font-heading font-bold text-ink truncate max-w-[200px]">{m.opponent}</span>
                      <span className="text-micro text-muted uppercase">{m.isHome ? "D" : "V"}</span>
                    </a>
                  </td>
                  <td className="py-2 pr-4 sm:pr-5 text-center">
                    <a href={`/dashboard/match/${m.id}`} className={`inline-flex items-center px-2 py-0.5 rounded-control text-sm font-heading font-bold hover:opacity-80 transition-opacity ${resultBg} ${resultText}`}>
                      {m.homeScore}:{m.awayScore}
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="text-center pt-2">
        <Link href="/dashboard/schedule" className="text-sm text-pitch-500 font-heading font-bold hover:underline">Všechny zápasy →</Link>
      </div>
    </>
  );
}
