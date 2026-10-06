"use client";

import { Fragment } from "react";
import Link from "next/link";
import type { ClubWebsiteFixture, ClubWebsiteMatchesPage, ClubWebsiteTemplate } from "@okresni-masina/shared";
import { ClubSubpageShell, type Skin } from "../templates/skins";
import { EMPTY, PlayerLink, TeamLink, formatDate, formatDateTime } from "../templates/shared";

/**
 * Segment adresy podstránky za adresou klubu (pro sdílení). Lomítko se skládá až v šabloně:
 * literál „/zapasy“ by check-links bral jako odkaz na neexistující stránku.
 */
const SUBPAGE = "zapasy";

type Outcome = "V" | "R" | "P";

/**
 * Barvy výhry, remízy a prohry převzaté ze sloupců V/R/P v „Tabulce soutěže“ každé šablony,
 * aby výsledky vypadaly jako zbytek téhož webu.
 */
const OUTCOME_TONE: Record<ClubWebsiteTemplate, Record<Outcome, string>> = {
  retro_2004: { V: "text-emerald-800", R: "text-gray-600", P: "text-red-800" },
  village_patriot: { V: "text-emerald-800", R: "text-gray-700", P: "text-red-800" },
  regional_standard: { V: "text-emerald-700", R: "text-slate-600", P: "text-red-600" },
  profi_league: { V: "text-emerald-400", R: "text-white/60", P: "text-red-400" },
  champions: { V: "text-emerald-400", R: "text-white/60", P: "text-red-400" },
};

const OUTCOME_LABEL: Record<Outcome, string> = { V: "výhra", R: "remíza", P: "prohra" };

/** Výsledek z pohledu klubu. Pohárový zápas rozhodnutý penaltami je postup, nebo vyřazení. */
function outcome(f: ClubWebsiteFixture): Outcome | null {
  if (!f.played || f.goalsFor === null || f.goalsAgainst === null) return null;
  if (f.goalsFor !== f.goalsAgainst) return f.goalsFor > f.goalsAgainst ? "V" : "P";
  if (f.pensFor !== null && f.pensAgainst !== null && f.pensFor !== f.pensAgainst) {
    return f.pensFor > f.pensAgainst ? "V" : "P";
  }
  return "R";
}

interface FixtureGroup {
  key: string;
  title: string;
  fixtures: ClubWebsiteFixture[];
}

/** Mistrovská utkání napřed, pak pohár (každá soutěž zvlášť), uvnitř podle kol. */
function groupFixtures(fixtures: ClubWebsiteFixture[], leagueName: string | null): FixtureGroup[] {
  const byRound = (a: ClubWebsiteFixture, b: ClubWebsiteFixture) => a.round - b.round;
  const groups: FixtureGroup[] = [];
  const league = fixtures.filter((f) => f.competition === "league").sort(byRound);
  if (league.length > 0) {
    groups.push({ key: "league", title: league[0].competitionName || leagueName || "Mistrovská soutěž", fixtures: league });
  }
  const cups = new Map<string, ClubWebsiteFixture[]>();
  for (const f of fixtures) {
    if (f.competition !== "cup") continue;
    const list = cups.get(f.competitionName) ?? [];
    list.push(f);
    cups.set(f.competitionName, list);
  }
  for (const [name, list] of cups) {
    groups.push({ key: `cup-${name}`, title: name || "Pohár", fixtures: list.sort(byRound) });
  }
  return groups;
}

function FixtureRows({ f, clubName, skin, tone }: { f: ClubWebsiteFixture; clubName: string; skin: Skin; tone: Record<Outcome, string> }) {
  const result = outcome(f);
  const when = f.played ? formatDate(f.date) : formatDateTime(f.date);
  const ours = <span className="font-bold">{clubName}</span>;
  const opponent = <TeamLink id={f.opponent.id} name={f.opponent.name} className={skin.link} />;
  // Skóre jako všude na webu: domácí vlevo, hosté vpravo
  const scoreHome = f.isHome ? f.goalsFor : f.goalsAgainst;
  const scoreAway = f.isHome ? f.goalsAgainst : f.goalsFor;
  const pensHome = f.isHome ? f.pensFor : f.pensAgainst;
  const pensAway = f.isHome ? f.pensAgainst : f.pensFor;
  const hasPens = pensHome !== null && pensAway !== null;
  const scorers = f.scorers.filter((s) => s.ours);
  const hasDetail = f.played && (scorers.length > 0 || !!f.attendance || !!f.manOfMatch);

  return (
    <>
      <tr className={hasDetail ? "" : skin.row}>
        <td className={`${skin.td} hidden sm:table-cell whitespace-nowrap tabular-nums`}>
          {f.competition === "league" ? `${f.round}.` : f.roundName}
        </td>
        <td className={`${skin.td} hidden sm:table-cell tabular-nums ${f.played ? "whitespace-nowrap" : ""}`}>{when}</td>
        <td className={skin.td}>
          <div className={`sm:hidden text-sm ${skin.muted}`}>
            {f.roundName} · {when}
          </div>
          <div className="text-base break-words">
            {f.isHome ? ours : opponent}
            {" - "}
            {f.isHome ? opponent : ours}
          </div>
        </td>
        <td className={`${skin.td} text-center whitespace-nowrap`}>
          {result ? (
            <>
              <span className={`text-base font-bold tabular-nums ${tone[result]}`} title={OUTCOME_LABEL[result]}>
                {scoreHome}:{scoreAway}
              </span>
              <span className="sr-only"> ({OUTCOME_LABEL[result]})</span>
              {hasPens && (
                <div className={`text-sm tabular-nums ${skin.muted}`}>
                  pen. {pensHome}:{pensAway}
                </div>
              )}
            </>
          ) : (
            <span className={skin.muted}>{EMPTY}</span>
          )}
        </td>
      </tr>
      {hasDetail && (
        <tr className={skin.row}>
          <td colSpan={4} className={`${skin.td} pt-0 text-sm ${skin.muted}`}>
            {scorers.length > 0 && (
              <div>
                Naši střelci:{" "}
                {scorers.map((s, i) => (
                  <Fragment key={`${s.minute}-${s.name}-${i}`}>
                    {i > 0 && ", "}
                    <span className="tabular-nums">{s.minute}.</span>{" "}
                    {s.playerId ? (
                      <PlayerLink id={s.playerId} className={`${skin.link} text-base`}>{s.name}</PlayerLink>
                    ) : (
                      <span className="text-base">{s.name}</span>
                    )}
                    {s.penalty && " (pen.)"}
                  </Fragment>
                ))}
              </div>
            )}
            {(!!f.attendance || f.manOfMatch) && (
              <div>
                {f.attendance ? `Diváků: ${f.attendance.toLocaleString("cs-CZ")}` : null}
                {f.attendance && f.manOfMatch ? " · " : null}
                {f.manOfMatch && (
                  <>
                    Hráč zápasu:{" "}
                    <PlayerLink id={f.manOfMatch.id} className={`${skin.link} text-base`}>{f.manOfMatch.name}</PlayerLink>
                  </>
                )}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

/** Bilance odehraných zápasů soutěže: zápasy, výhry, remízy, prohry, skóre. */
function SeasonRecord({ fixtures, skin, tone }: { fixtures: ClubWebsiteFixture[]; skin: Skin; tone: Record<Outcome, string> }) {
  const record = { played: 0, V: 0, R: 0, P: 0, goalsFor: 0, goalsAgainst: 0 };
  for (const f of fixtures) {
    const result = outcome(f);
    if (!result) continue;
    record.played += 1;
    record[result] += 1;
    record.goalsFor += f.goalsFor ?? 0;
    record.goalsAgainst += f.goalsAgainst ?? 0;
  }
  if (record.played === 0) return null;

  return (
    <div className={`mt-4 overflow-x-auto ${skin.frame ? "p-2 pt-0" : ""}`}>
      <table className={skin.table}>
        <caption className={`text-left text-sm font-bold pb-1 ${skin.muted}`}>Bilance v sezóně</caption>
        <thead>
          <tr className={skin.thead}>
            <th className={`${skin.th} text-center`} title="Odehrané zápasy">Z</th>
            <th className={`${skin.th} text-center`} title="Výhry">V</th>
            <th className={`${skin.th} text-center`} title="Remízy">R</th>
            <th className={`${skin.th} text-center`} title="Prohry">P</th>
            <th className={`${skin.th} text-center`}>Skóre</th>
          </tr>
        </thead>
        <tbody>
          <tr className={skin.row}>
            <td className={`${skin.td} text-center text-base font-bold tabular-nums`}>{record.played}</td>
            <td className={`${skin.td} text-center text-base font-bold tabular-nums ${tone.V}`}>{record.V}</td>
            <td className={`${skin.td} text-center text-base font-bold tabular-nums ${tone.R}`}>{record.R}</td>
            <td className={`${skin.td} text-center text-base font-bold tabular-nums ${tone.P}`}>{record.P}</td>
            <td className={`${skin.td} text-center text-base font-bold tabular-nums whitespace-nowrap`}>
              {record.goalsFor}:{record.goalsAgainst}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** Rozpis a výsledky sezóny: další stránka webu klubu ve vzhledu jeho šablony, bez odkazů do hry. */
export function MatchesClient({ page, siteUrl }: { page: ClubWebsiteMatchesPage; siteUrl: string }) {
  const { club, seasonNumber, fixtures } = page;
  const groups = groupFixtures(fixtures, club.leagueName);
  const tone = OUTCOME_TONE[club.template] ?? OUTCOME_TONE.retro_2004;

  return (
    <ClubSubpageShell
      club={club}
      teamSlugs={page.teamSlugs}
      siteUrl={siteUrl}
      path={`/${SUBPAGE}`}
      shareTitle={`Zápasy a výsledky · ${club.name}`}
    >
      {(skin, clubPath) => {
        const pad = skin.frame ? "p-3" : "";
        return (
          <>
            <header className={skin.header}>
              <div className={`${skin.frame ? "" : "max-w-6xl mx-auto px-4 sm:px-8"} py-5 text-center sm:text-left`}>
                <div className={skin.kicker}>{club.name}</div>
                <h1 className={skin.name}>Zápasy a výsledky</h1>
                <div className={skin.meta}>
                  {[seasonNumber ? `${seasonNumber}. sezóna` : null, club.leagueName].filter(Boolean).join(" · ")}
                </div>
              </div>
            </header>

            <div className={skin.body}>
              {groups.length === 0 ? (
                <section className={skin.section}>
                  {skin.sectionHead("Rozpis zápasů")}
                  <p className={`text-base ${skin.muted} ${pad}`}>Rozpis zápasů zatím není.</p>
                </section>
              ) : (
                groups.map((group) => (
                  <section key={group.key} className={skin.section}>
                    {skin.sectionHead(group.title)}
                    <div className={`overflow-x-auto ${skin.frame ? "p-2" : ""}`}>
                      <table className={skin.table}>
                        <thead>
                          <tr className={skin.thead}>
                            <th className={`${skin.th} hidden sm:table-cell`}>Kolo</th>
                            <th className={`${skin.th} hidden sm:table-cell`}>Datum</th>
                            <th className={skin.th}>Utkání</th>
                            <th className={`${skin.th} text-center`}>Výsledek</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.fixtures.map((f) => (
                            <FixtureRows key={f.id} f={f} clubName={club.name} skin={skin} tone={tone} />
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <SeasonRecord fixtures={group.fixtures} skin={skin} tone={tone} />
                  </section>
                ))
              )}

              <p className={`text-center text-sm ${skin.muted} ${pad}`}>
                <Link href={clubPath} className={skin.link}>Zpět na web klubu {club.name}</Link>
              </p>
            </div>
          </>
        );
      }}
    </ClubSubpageShell>
  );
}
