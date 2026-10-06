"use client";

import Link from "next/link";
import type { ClubWebsitePlayerProfile } from "@okresni-masina/shared";
import { ClubSubpageShell } from "../../templates/skins";
import { ManagerFace } from "../../ManagerFace";
import {
  EMPTY,
  TeamLink,
  contractJoinLabel,
  contractLeaveLabel,
  formatDate,
} from "../../templates/shared";

const COUNTRIES: Record<string, string> = {
  CZ: "Česko", SK: "Slovensko", PL: "Polsko", DE: "Německo", AT: "Rakousko",
  HU: "Maďarsko", HR: "Chorvatsko", RO: "Rumunsko", UA: "Ukrajina", VN: "Vietnam",
};

function ageLabel(age: number): string {
  if (age >= 2 && age <= 4) return `${age} roky`;
  return age === 1 ? "1 rok" : `${age} let`;
}

const FOOT_LABELS: Record<"left" | "right" | "both", string> = {
  right: "pravá",
  left: "levá",
  both: "obě",
};

/** Karty v jednom zápase jako v zápisu: „ŽK“, „2× ŽK, ČK“; bez karty „-“. */
function cardsLabel(yellow: number, red: number): string {
  const parts: string[] = [];
  if (yellow === 1) parts.push("ŽK");
  if (yellow > 1) parts.push(`${yellow}× ŽK`);
  if (red > 0) parts.push(red > 1 ? `${red}× ČK` : "ČK");
  return parts.length > 0 ? parts.join(", ") : EMPTY;
}

/** Veřejný profil hráče: vypadá jako další stránka webu klubu (stejná šablona), bez odkazů do hry. */
export function PlayerProfileClient({ profile, siteUrl }: { profile: ClubWebsitePlayerProfile; siteUrl: string }) {
  const { club, player, currentTeam, playsForClub, seasons, career } = profile;
  const personal = profile.personal;
  const recentMatches = profile.recentMatches ?? [];
  const fullName = `${player.firstName} ${player.lastName}`;
  const country = player.nationality ? COUNTRIES[player.nationality] : null;
  const isKeeper = ["GK", "BRA"].includes((player.position || "").toUpperCase());
  const clubSeasons = seasons.filter((s) => s.teamId === club.id);
  const totals = clubSeasons.reduce(
    (acc, s) => ({
      appearances: acc.appearances + s.appearances,
      goals: acc.goals + s.goals,
      assists: acc.assists + s.assists,
      cleanSheets: acc.cleanSheets + s.cleanSheets,
      cards: acc.cards + s.yellowCards + s.redCards,
    }),
    { appearances: 0, goals: 0, assists: 0, cleanSheets: 0, cards: 0 },
  );

  const status = playsForClub
    ? `Hráč klubu ${club.name}`
    : currentTeam ? null : "Momentálně bez klubu";

  // Osobní údaje jako na webech klubů: jen řádky, které o hráči něco říkají
  const personalRows: Array<{ label: string; value: string }> = [];
  if (personal?.preferredFoot) personalRows.push({ label: "Noha", value: FOOT_LABELS[personal.preferredFoot] });
  if (personal?.occupation) personalRows.push({ label: "Povolání", value: personal.occupation });
  if (personal?.residence) personalRows.push({ label: "Bydliště", value: personal.residence });
  if (personal && personal.manOfMatchCount > 0) {
    personalRows.push({ label: "Hráč zápasu", value: `${personal.manOfMatchCount}×` });
  }

  return (
    <ClubSubpageShell
      club={club}
      teamSlugs={profile.teamSlugs ?? {}}
      siteUrl={siteUrl}
      path={`/hrac/${player.id}`}
      shareTitle={`${fullName} · ${club.name}`}
    >
      {(skin, clubPath) => {
        const pad = skin.frame ? "p-3" : "";
        const tableWrap = `overflow-x-auto ${skin.frame ? "p-2" : ""}`;
        return (
          <>
            <header className={skin.header}>
              <div className={`${skin.frame ? "" : "max-w-6xl mx-auto px-4 sm:px-8"} py-5 flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left`}>
                <div className={skin.faceBox}>
                  <ManagerFace faceConfig={player.avatar} size={96} />
                </div>
                <div className="min-w-0">
                  <div className={skin.kicker}>
                    {player.positionName}{player.squadNumber ? ` · číslo ${player.squadNumber}` : ""}
                  </div>
                  <h1 className={skin.name}>{fullName}</h1>
                  {player.nickname && <div className={skin.meta}>„{player.nickname}“</div>}
                  <div className={skin.meta}>
                    {[ageLabel(player.age), country, status].filter(Boolean).join(" · ")}
                    {!playsForClub && currentTeam && (
                      <>
                        {" · Nyní hraje za "}
                        <TeamLink id={currentTeam.id} name={currentTeam.name} className="underline font-bold" />
                      </>
                    )}
                  </div>
                </div>
              </div>
            </header>

            <div className={skin.body}>
              {personalRows.length > 0 && (
                <section className={skin.section}>
                  {skin.sectionHead("Osobní údaje")}
                  <div className={tableWrap}>
                    <table className={skin.table}>
                      <tbody>
                        {personalRows.map((r) => (
                          <tr key={r.label} className={skin.row}>
                            <th scope="row" className={`${skin.th} ${skin.muted} font-bold w-2/5 sm:w-1/3 align-top`}>{r.label}</th>
                            <td className={`${skin.td} text-base break-words`}>{r.value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {player.description && (
                <section className={skin.section}>
                  {skin.sectionHead("Pár slov o hráči")}
                  <p className={`${pad} ${skin.quote}`}>„{player.description}“</p>
                </section>
              )}

              <section className={skin.section}>
                {skin.sectionHead(`Bilance v dresu klubu ${club.name}`)}
                <div className={tableWrap}>
                  <table className={skin.table}>
                    <thead>
                      <tr className={skin.thead}>
                        <th className={`${skin.th} text-center`}>Zápasy</th>
                        <th className={`${skin.th} text-center`}>Góly</th>
                        <th className={`${skin.th} text-center`}>Asistence</th>
                        <th className={`${skin.th} text-center`}>{isKeeper ? "Čistá konta" : "Karty"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className={skin.row}>
                        <td className={`${skin.td} text-center text-base font-bold tabular-nums`}>{totals.appearances}</td>
                        <td className={`${skin.td} text-center text-base font-bold tabular-nums`}>{totals.goals}</td>
                        <td className={`${skin.td} text-center text-base font-bold tabular-nums`}>{totals.assists}</td>
                        <td className={`${skin.td} text-center text-base font-bold tabular-nums`}>{isKeeper ? totals.cleanSheets : totals.cards}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>

              {recentMatches.length > 0 && (
                <section className={skin.section}>
                  {skin.sectionHead("Poslední zápasy")}
                  <div className={tableWrap}>
                    <table className={`${skin.table} min-w-[600px]`}>
                      <thead>
                        <tr className={skin.thead}>
                          <th className={skin.th}>Datum</th>
                          <th className={skin.th}>Soupeř</th>
                          <th className={`${skin.th} text-center`}>Výsledek</th>
                          <th className={`${skin.th} text-center`} title="Odehrané minuty">Min.</th>
                          <th className={`${skin.th} text-center`} title="Góly">G</th>
                          <th className={`${skin.th} text-center`} title="Asistence">A</th>
                          <th className={`${skin.th} text-center`}>Karty</th>
                          <th className={`${skin.th} text-center`}>Známka</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentMatches.map((m) => (
                          <tr key={m.matchId} className={skin.row}>
                            <td className={`${skin.td} whitespace-nowrap tabular-nums`}>{m.date ? formatDate(m.date) : EMPTY}</td>
                            <td className={skin.td}>
                              <TeamLink id={m.opponentId} name={m.opponentName} className={`${skin.link} text-base`} />
                              <div className={`text-sm ${skin.muted}`}>
                                {m.isHome ? "doma" : "venku"}{m.competition === "cup" ? ", pohár" : ""}
                              </div>
                            </td>
                            <td className={`${skin.td} text-center font-bold tabular-nums whitespace-nowrap`}>
                              {m.goalsFor !== null && m.goalsAgainst !== null ? `${m.goalsFor}:${m.goalsAgainst}` : EMPTY}
                            </td>
                            <td className={`${skin.td} text-center tabular-nums`}>{m.minutes}</td>
                            <td className={`${skin.td} text-center tabular-nums font-bold`}>{m.goals}</td>
                            <td className={`${skin.td} text-center tabular-nums`}>{m.assists}</td>
                            <td className={`${skin.td} text-center whitespace-nowrap`}>{cardsLabel(m.yellowCards, m.redCards)}</td>
                            <td className={`${skin.td} text-center tabular-nums`}>{m.rating !== null ? m.rating.toFixed(1) : EMPTY}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              <section className={skin.section}>
                {skin.sectionHead("Statistiky po sezónách")}
                {seasons.length === 0 ? (
                  <p className={`text-base ${skin.muted} ${pad}`}>Zatím neodehrál žádný soutěžní zápas.</p>
                ) : (
                  <div className={tableWrap}>
                    <table className={`${skin.table} min-w-[520px]`}>
                      <thead>
                        <tr className={skin.thead}>
                          <th className={skin.th}>Sezóna</th>
                          <th className={skin.th}>Klub</th>
                          <th className={`${skin.th} text-center`} title="Zápasy">Z</th>
                          <th className={`${skin.th} text-center`} title="Góly">G</th>
                          <th className={`${skin.th} text-center`} title="Asistence">A</th>
                          {isKeeper && <th className={`${skin.th} text-center`} title="Čistá konta">ČK</th>}
                          <th className={`${skin.th} text-center`} title="Žluté / červené karty">Karty</th>
                          <th className={`${skin.th} text-center`} title="Průměrná známka">Známka</th>
                        </tr>
                      </thead>
                      <tbody>
                        {seasons.map((s) => (
                          <tr key={`${s.seasonNumber}-${s.teamId}`} className={skin.row}>
                            <td className={`${skin.td} tabular-nums`}>{s.seasonNumber}.</td>
                            <td className={`${skin.td} text-base`}>
                              <TeamLink id={s.teamId} name={s.teamName} className={skin.link} />
                            </td>
                            <td className={`${skin.td} text-center tabular-nums`}>{s.appearances}</td>
                            <td className={`${skin.td} text-center tabular-nums font-bold`}>{s.goals}</td>
                            <td className={`${skin.td} text-center tabular-nums`}>{s.assists}</td>
                            {isKeeper && <td className={`${skin.td} text-center tabular-nums`}>{s.cleanSheets}</td>}
                            <td className={`${skin.td} text-center tabular-nums`}>{s.yellowCards} / {s.redCards}</td>
                            <td className={`${skin.td} text-center tabular-nums`}>{s.avgRating ? s.avgRating.toFixed(1) : EMPTY}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {career.length > 0 && (
                <section className={skin.section}>
                  {skin.sectionHead("Kariéra")}
                  <div className={tableWrap}>
                    <table className={skin.table}>
                      <thead>
                        <tr className={skin.thead}>
                          <th className={skin.th}>Klub</th>
                          <th className={skin.th}>Příchod</th>
                          <th className={skin.th}>Odchod</th>
                        </tr>
                      </thead>
                      <tbody>
                        {career.map((c, i) => {
                          const leave = contractLeaveLabel(c.leaveType);
                          return (
                            <tr key={`${c.teamId}-${c.joinedAt}-${i}`} className={skin.row}>
                              <td className={`${skin.td} text-base`}>
                                <TeamLink id={c.teamId} name={c.teamName} className={skin.link} />
                              </td>
                              <td className={skin.td}>
                                {c.joinedAt ? formatDate(c.joinedAt) : "od založení"} ({contractJoinLabel(c.joinType)})
                              </td>
                              <td className={skin.td}>
                                {c.leftAt ? `${formatDate(c.leftAt)}${leave ? ` (${leave})` : ""}` : "dosud v klubu"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
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
