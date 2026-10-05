import type {
  ClubWebsiteHistory,
  ClubWebsiteHistoryAward,
  ClubWebsiteHistoryCupRun,
  ClubWebsiteHistoryTrophy,
} from "@okresni-masina/shared";
import type { ReactNode } from "react";
import { PlayerLink, TeamLink } from "./templates/shared";

/**
 * Síň slávy klubu: trofeje, sezóny, ocenění, pohár, střelci všech dob a Kořaly.
 * Ukazuje jen to, co přišlo z API (`loadClubHistory`); prázdné části se nevykreslí.
 * Barvy klubu přes CSS proměnné z `clubPaletteStyle`, medaile zůstávají zlato/stříbro/bronz.
 */

interface ClubHallOfFameProps {
  history: ClubWebsiteHistory;
  tone?: "light" | "dark";
}

const TONES = {
  light: {
    text: "text-gray-900",
    muted: "text-gray-600",
    card: "bg-white border border-gray-300",
    accent: "text-[var(--club-accent-light)]",
    accentSoft: "bg-[color-mix(in_srgb,var(--club-accent-light)_12%,transparent)]",
    accentFill: "bg-[var(--club-accent-light)]",
    track: "bg-gray-200",
    gold: "text-amber-700",
    silver: "text-slate-500",
    bronze: "text-orange-800",
    goldBorder: "border-l-amber-500",
    silverBorder: "border-l-slate-400",
    bronzeBorder: "border-l-orange-700",
  },
  dark: {
    text: "text-white",
    muted: "text-slate-300",
    card: "bg-white/5 border border-white/10",
    accent: "text-[var(--club-accent-dark)]",
    accentSoft: "bg-[color-mix(in_srgb,var(--club-accent-dark)_15%,transparent)]",
    accentFill: "bg-[var(--club-accent-dark)]",
    track: "bg-white/15",
    gold: "text-amber-400",
    silver: "text-slate-300",
    bronze: "text-orange-400",
    goldBorder: "border-l-amber-400",
    silverBorder: "border-l-slate-300",
    bronzeBorder: "border-l-orange-500",
  },
} as const;

type Tone = (typeof TONES)[keyof typeof TONES];

function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  if (n >= 2 && n <= 4) return few;
  return many;
}

const TROPHY_LABELS: Record<ClubWebsiteHistoryTrophy["kind"], { icon: string; title: string; medal: "gold" | "silver" | "bronze" }> = {
  league_champion: { icon: "🏆", title: "Mistr ligy", medal: "gold" },
  cup_winner: { icon: "🏆", title: "Vítěz poháru", medal: "gold" },
  league_runner_up: { icon: "🥈", title: "2. místo v lize", medal: "silver" },
  league_third: { icon: "🥉", title: "3. místo v lize", medal: "bronze" },
};

const AWARD_LABELS: Record<ClubWebsiteHistoryAward["kind"], { icon: string; title: string }> = {
  player_of_season: { icon: "⭐", title: "Hráč sezóny" },
  top_scorer: { icon: "⚽", title: "Král střelců" },
  manager_of_season: { icon: "📋", title: "Trenér sezóny" },
  discovery: { icon: "🌱", title: "Objev sezóny" },
  best_eleven: { icon: "👕", title: "Nejlepší jedenáctka" },
};

function medalText(t: Tone, position: number): string {
  if (position === 1) return t.gold;
  if (position === 2) return t.silver;
  if (position === 3) return t.bronze;
  return t.accent;
}

function medalBorder(t: Tone, medal: "gold" | "silver" | "bronze"): string {
  if (medal === "gold") return t.goldBorder;
  if (medal === "silver") return t.silverBorder;
  return t.bronzeBorder;
}

function SectionTitle({ t, children, note }: { t: Tone; children: ReactNode; note?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-3">
      <h3 className={`font-heading font-bold text-lg ${t.accent}`}>{children}</h3>
      {note && <span className={`text-sm ${t.muted}`}>{note}</span>}
    </div>
  );
}

function PlayerName({ id, name, className }: { id: string | null; name: string; className: string }) {
  return id ? <PlayerLink id={id} className={className}>{name}</PlayerLink> : <span className={className}>{name}</span>;
}

function scoreText(m: NonNullable<ClubWebsiteHistoryCupRun["decidingMatch"]>): string {
  const pens = m.pensFor !== null && m.pensAgainst !== null ? `, na penalty ${m.pensFor}:${m.pensAgainst}` : "";
  return `${m.goalsFor}:${m.goalsAgainst}${pens} (${m.isHome ? "doma" : "venku"})`;
}

export function ClubHallOfFame({ history, tone = "light" }: ClubHallOfFameProps) {
  const t = TONES[tone];
  const { seasons, trophies, awards, cup, topScorers, achievements, achievementsTotal } = history;

  const isEmpty = seasons.length === 0 && trophies.length === 0 && awards.length === 0
    && cup.length === 0 && topScorers.length === 0 && achievements.length === 0;
  if (isEmpty) {
    return <p className={`text-base ${t.muted}`}>Historie klubu se teprve píše.</p>;
  }

  // Souhrn jen z toho, co v datech je
  const titles = trophies.filter((x) => x.kind === "league_champion").length;
  const cupWins = trophies.filter((x) => x.kind === "cup_winner").length;
  const bestPosition = seasons.length > 0 ? Math.min(...seasons.map((s) => s.position)) : null;
  // Nejdál v poháru jen z dohraných tažení (běžící ročník ještě neskončil)
  const bestCup = cup.filter((run) => run.status !== "running").reduce<ClubWebsiteHistoryCupRun | null>((best, run) => {
    if (!best) return run;
    if (run.status === "won" && best.status !== "won") return run;
    if (best.status === "won") return best;
    return run.reachedRound > best.reachedRound ? run : best;
  }, null);
  const facts = [
    seasons.length > 0 ? { label: "Odehrané sezóny", value: String(seasons.length) } : null,
    titles > 0 ? { label: "Ligové tituly", value: String(titles) } : null,
    bestPosition !== null ? { label: "Nejlepší umístění", value: `${bestPosition}. místo` } : null,
    cupWins > 0
      ? { label: "Vítězství v poháru", value: String(cupWins) }
      : bestCup
        ? { label: "Nejdál v poháru", value: bestCup.reachedRoundName }
        : null,
  ].filter((f): f is { label: string; value: string } => f !== null);

  const individualAwards = awards.filter((a) => a.kind !== "best_eleven");
  const elevenBySeason = new Map<number, { leagueName: string; players: ClubWebsiteHistoryAward[] }>();
  for (const a of awards) {
    if (a.kind !== "best_eleven") continue;
    const entry = elevenBySeason.get(a.seasonNumber) ?? { leagueName: a.leagueName, players: [] };
    entry.players.push(a);
    elevenBySeason.set(a.seasonNumber, entry);
  }

  return (
    <div className={`space-y-8 ${t.text}`}>
      {facts.length > 0 && (
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {facts.map((f) => (
            <div key={f.label} className={`rounded-lg px-3 py-2 ${t.card}`}>
              <dt className={`text-sm ${t.muted}`}>{f.label}</dt>
              <dd className={`text-lg font-heading font-bold ${t.accent}`}>{f.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {trophies.length > 0 && (
        <section>
          <SectionTitle t={t}>Trofejní vitrína</SectionTitle>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {trophies.map((tr) => {
              const label = TROPHY_LABELS[tr.kind];
              return (
                <li
                  key={`${tr.seasonNumber}-${tr.kind}-${tr.competitionName}`}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 border-l-4 ${t.card} ${medalBorder(t, label.medal)}`}
                >
                  <span className="text-3xl shrink-0" aria-hidden="true">{label.icon}</span>
                  <div className="min-w-0">
                    <div className="text-base font-heading font-bold">{label.title}</div>
                    <div className={`text-sm ${t.muted} break-words`}>
                      {tr.competitionName}, {tr.seasonNumber}. sezóna
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {seasons.length > 0 && (
        <section>
          <SectionTitle t={t}>Sezóna po sezóně</SectionTitle>
          <ul className="space-y-2">
            {seasons.map((s) => (
              <li key={s.seasonNumber} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${t.card}`}>
                <div className="min-w-0 flex-1">
                  <div className="text-base font-heading font-bold">{s.seasonNumber}. sezóna</div>
                  <div className={`text-sm ${t.muted} break-words`}>
                    {s.leagueName}
                    {s.teams !== null && ` · ${s.teams} ${plural(s.teams, "tým", "týmy", "týmů")}`}
                  </div>
                  {s.points !== null && (
                    <div className={`text-sm ${t.muted}`}>
                      {s.points} {plural(s.points, "bod", "body", "bodů")}
                      {s.wins !== null && s.draws !== null && s.losses !== null && (
                        <>
                          {" · "}
                          {s.wins} {plural(s.wins, "výhra", "výhry", "výher")}, {s.draws} {plural(s.draws, "remíza", "remízy", "remíz")}, {s.losses} {plural(s.losses, "prohra", "prohry", "proher")}
                        </>
                      )}
                      {s.goalsFor !== null && s.goalsAgainst !== null && ` · skóre ${s.goalsFor}:${s.goalsAgainst}`}
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className={`text-2xl font-heading font-black tabular-nums ${medalText(t, s.position)}`}>{s.position}.</div>
                  <div className={`text-sm ${t.muted}`}>{s.position === 1 ? "mistr" : "místo"}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(individualAwards.length > 0 || elevenBySeason.size > 0) && (
        <section>
          <SectionTitle t={t}>Ocenění</SectionTitle>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {individualAwards.map((a, i) => {
              const label = AWARD_LABELS[a.kind];
              return (
                <li key={`${a.seasonNumber}-${a.kind}-${i}`} className={`rounded-lg px-3 py-2.5 ${t.card}`}>
                  <div className={`flex items-center gap-2 text-sm font-heading font-bold ${t.accent}`}>
                    <span aria-hidden="true">{label.icon}</span>
                    <span>{label.title}</span>
                  </div>
                  <div className="mt-0.5">
                    {a.name ? (
                      <PlayerName id={a.playerId} name={a.name} className="text-base font-heading font-bold" />
                    ) : (
                      <span className="text-base font-heading font-bold">Trenér klubu</span>
                    )}
                  </div>
                  <div className={`text-sm ${t.muted} break-words`}>
                    {a.seasonNumber}. sezóna, {a.leagueName}
                  </div>
                  {a.detail && <p className={`text-sm ${t.muted} mt-1 break-words`}>{a.detail}</p>}
                </li>
              );
            })}
            {[...elevenBySeason.entries()].map(([seasonNumber, group]) => (
              <li key={`eleven-${seasonNumber}`} className={`rounded-lg px-3 py-2.5 ${t.card}`}>
                <div className={`flex items-center gap-2 text-sm font-heading font-bold ${t.accent}`}>
                  <span aria-hidden="true">{AWARD_LABELS.best_eleven.icon}</span>
                  <span>{AWARD_LABELS.best_eleven.title}</span>
                </div>
                <div className={`text-sm ${t.muted} break-words`}>
                  {seasonNumber}. sezóna, {group.leagueName}
                </div>
                <ul className="mt-1 space-y-0.5">
                  {group.players.map((p, i) => (
                    <li key={`${p.playerId ?? p.name}-${i}`} className="flex flex-wrap items-baseline gap-x-2">
                      <PlayerName id={p.playerId} name={p.name ?? "Neznámý hráč"} className="text-base font-heading font-bold" />
                      {p.detail && <span className={`text-sm ${t.muted}`}>{p.detail}</span>}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}

      {cup.length > 0 && (
        <section>
          <SectionTitle t={t}>Pohárová tažení</SectionTitle>
          <ul className="space-y-2">
            {cup.map((run) => {
              const m = run.decidingMatch;
              const finalist = run.status === "eliminated" && run.reachedRound === run.totalRounds;
              return (
                <li key={`${run.seasonNumber}-${run.cupName}`} className={`rounded-lg px-3 py-2.5 ${t.card}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <div className="text-base font-heading font-bold">{run.seasonNumber}. sezóna</div>
                    <div
                      className={`text-sm font-heading font-bold ${
                        run.status === "won" ? t.gold : finalist ? t.silver : t.accent
                      }`}
                    >
                      {run.status === "won" && "🏆 Vítěz poháru"}
                      {finalist && "🥈 Finalista"}
                      {run.status === "eliminated" && !finalist && `Vypadli jsme: ${run.reachedRoundName}`}
                      {run.status === "running" && `Stále ve hře: ${run.reachedRoundName}`}
                    </div>
                  </div>
                  <div className={`text-sm ${t.muted} break-words`}>{run.cupName}</div>
                  <div
                    className="flex gap-1 mt-2"
                    role="img"
                    aria-label={`Kolo ${run.reachedRound} z ${run.totalRounds}`}
                  >
                    {Array.from({ length: run.totalRounds }, (_, i) => (
                      <span
                        key={i}
                        className={`h-2 flex-1 rounded-full ${
                          i < run.reachedRound ? (run.status === "won" ? "bg-amber-400" : t.accentFill) : t.track
                        }`}
                      />
                    ))}
                  </div>
                  {m && (
                    <p className="text-sm mt-2 break-words">
                      {run.status === "won" ? "Ve finále jsme porazili " : finalist ? "Ve finále nás porazil " : "Vyřadil nás "}
                      <TeamLink id={m.opponentTeamId} name={m.opponentName} className="text-base font-heading font-bold" />
                      <span className={t.muted}>, {scoreText(m)}</span>
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {topScorers.length > 0 && (
        <section>
          <SectionTitle t={t} note="liga i pohár">Nejlepší střelci všech dob</SectionTitle>
          <ol className="space-y-1.5">
            {topScorers.map((s, i) => (
              <li key={`${s.playerId ?? s.name}-${i}`} className={`flex items-center gap-3 rounded-lg px-3 py-2 ${t.card}`}>
                <span className={`w-7 shrink-0 text-base font-heading font-black tabular-nums ${medalText(t, i + 1)}`}>{i + 1}.</span>
                <div className="min-w-0 flex-1">
                  <PlayerName id={s.playerId} name={s.name} className="text-base font-heading font-bold break-words" />
                  <div className={`text-sm ${t.muted}`}>
                    {s.appearances} {plural(s.appearances, "zápas", "zápasy", "zápasů")}
                    {" · "}
                    {s.stillAtClub ? <span className={`rounded px-1.5 font-bold ${t.accent} ${t.accentSoft}`}>v kádru</span> : "bývalý hráč"}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`text-xl font-heading font-black tabular-nums ${t.accent}`}>{s.goals}</div>
                  <div className={`text-sm ${t.muted}`}>{plural(s.goals, "gól", "góly", "gólů")}</div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {achievements.length > 0 && (
        <section>
          <SectionTitle t={t} note={`získáno ${achievements.length} z ${achievementsTotal}`}>Kořaly klubu</SectionTitle>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {achievements.map((a) => (
              <li
                key={a.key}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 border-l-4 ${t.card} ${medalBorder(t, a.tier)}`}
              >
                <span className="text-2xl shrink-0" aria-hidden="true">{a.icon}</span>
                <div className="min-w-0">
                  <div className="text-base font-heading font-bold break-words">{a.title}</div>
                  <div className={`text-sm ${t.muted} break-words`}>{a.desc}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
