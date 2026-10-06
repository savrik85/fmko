"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { ClubWebsiteProgramPage, ClubWebsiteProgramTeam, ClubWebsiteTemplate } from "@okresni-masina/shared";
import { ClubSubpageShell, type Skin } from "../templates/skins";
import { EMPTY, PlayerLink, TeamLink, formatDate, formatDateTime } from "../templates/shared";

type FormResult = "V" | "R" | "P";
type FormBox = { base: string } & Record<FormResult, string>;

const RESULT_LABEL: Record<FormResult, string> = { V: "výhra", R: "remíza", P: "prohra" };

/** Rámečky formy převzaté z výsledkových prvků jednotlivých šablon (štítky, filtry, forma v Champions). */
const FORM_BOX: Record<ClubWebsiteTemplate, FormBox> = {
  retro_2004: {
    base: "w-7 h-7 border border-black font-mono font-bold",
    V: "bg-emerald-700 text-white",
    R: "bg-[#f0f0e8] text-black",
    P: "bg-red-700 text-white",
  },
  village_patriot: {
    base: "w-8 h-8 rounded-lg border font-serif font-black",
    V: "bg-emerald-100 text-emerald-900 border-emerald-300",
    R: "bg-amber-100 text-amber-900 border-amber-300",
    P: "bg-red-100 text-red-900 border-red-300",
  },
  regional_standard: {
    base: "w-8 h-8 rounded-lg border font-heading font-black",
    V: "bg-emerald-100 text-emerald-800 border-emerald-200",
    R: "bg-slate-100 text-slate-700 border-slate-200",
    P: "bg-red-100 text-red-800 border-red-200",
  },
  profi_league: {
    base: "w-8 h-8 rounded-full border font-heading font-black",
    V: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    R: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    P: "bg-red-500/20 text-red-400 border-red-500/30",
  },
  champions: {
    base: "w-7 h-7 rounded border font-heading font-black",
    V: "bg-emerald-500/20 text-emerald-400 border-emerald-400/30",
    R: "bg-amber-500/20 text-amber-400 border-amber-400/30",
    P: "bg-red-500/20 text-red-400 border-red-400/30",
  },
};

/**
 * Tisk na A4 u pokladny: všechno černé na bílém papíře, bez stínů a rozostření. Lišty v barvách
 * klubu i tmavé šablony by jinak vytiskly světlý text bez pozadí (prohlížeč pozadí netiskne).
 * Tmavým šablonám se průsvitné rámečky přebarví na šedé, aby tabulky měly čáry.
 */
const PRINT_RESET = [
  "print:[&_*]:!bg-transparent",
  "print:[&_*]:!text-black",
  "print:[&_*]:!shadow-none",
  "print:[&_*]:![backdrop-filter:none]",
  "print:[&_*]:![text-shadow:none]",
  "print:[&_.min-h-screen]:!min-h-0",
  "print:[&_.min-h-screen]:!pb-0",
].join(" ");
const PRINT_DARK_BORDERS = "print:[&_*]:!border-gray-400";
const DARK_TEMPLATES: ReadonlySet<ClubWebsiteTemplate> = new Set(["profi_league", "champions"]);

/** Formát stránky a bílé pozadí dokumentu se třídami nastavit nedají. */
const PAGE_CSS =
  "@page { size: A4; margin: 12mm; } @media print { html, body { background: #fff !important; } body::before, body::after { display: none !important; } }";

function countLabel(n: number, one: string, few: string, many: string): string {
  return `${n} ${n === 1 ? one : n >= 2 && n <= 4 ? few : many}`;
}

/** „3. místo, 18 bodů po 9 zápasech“ */
function standingLabel(team: ClubWebsiteProgramTeam): string | null {
  if (team.position == null) return null;
  let label = `${team.position}. místo`;
  if (team.points != null) label += `, ${countLabel(team.points, "bod", "body", "bodů")}`;
  if (team.played != null && team.played > 0) label += ` po ${team.played} ${team.played === 1 ? "zápase" : "zápasech"}`;
  return label;
}

/** Odkud slovo trenéra je: rozhovor před tímto kolem, jinak poslední zodpovězený. */
function coachWordHeadline(word: NonNullable<ClubWebsiteProgramPage["coachWord"]>, round: number): string {
  const gw = word.gameWeek;
  if (word.kind === "pre_match" && gw === round) return "Rozhovor před zápasem";
  if (word.kind === "season_wrap" || (gw >= 100 && gw % 100 === 0)) {
    return `Z ohlédnutí za ${Math.max(1, Math.round(gw / 100))}. sezónou`;
  }
  if (word.kind === "pre_match") return `Z rozhovoru před ${gw}. kolem`;
  if (word.kind === "post_match") return `Z rozhovoru po ${gw}. kole`;
  return `Z rozhovoru, ${gw}. kolo`;
}

function FactRow({ skin, label, children }: { skin: Skin; label: string; children: ReactNode }) {
  return (
    <tr className={skin.row}>
      <th scope="row" className={`${skin.td} ${skin.muted} text-left font-bold align-top w-[40%]`}>
        {label}
      </th>
      <td className={`${skin.td} text-base`}>{children}</td>
    </tr>
  );
}

/** Obec, trenér, tabulka, forma a střelec týmu, jak to bývá v programu u pokladny. */
function TeamFacts({ team, skin, box, pad }: { team: ClubWebsiteProgramTeam; skin: Skin; box: FormBox; pad: string }) {
  const standing = standingLabel(team);
  return (
    <div className={pad}>
      <p className="text-lg sm:text-xl font-bold break-words mb-3">
        <TeamLink id={team.id} name={team.name} className={skin.link} />
      </p>
      <table className={skin.table}>
        <tbody>
          {team.village && <FactRow skin={skin} label="Obec">{team.village}</FactRow>}
          {team.coachName && <FactRow skin={skin} label="Trenér">{team.coachName}</FactRow>}
          <FactRow skin={skin} label="V tabulce">{standing ?? "zatím bez zápasu"}</FactRow>
          <FactRow skin={skin} label="Forma">
            {team.form.length > 0 ? (
              <span className="inline-flex flex-wrap gap-1.5">
                {team.form.map((r, i) => (
                  <span
                    key={i}
                    title={RESULT_LABEL[r]}
                    className={`${box.base} ${box[r]} inline-flex items-center justify-center text-sm`}
                  >
                    {r}
                  </span>
                ))}
              </span>
            ) : (
              "zatím bez zápasu"
            )}
          </FactRow>
          <FactRow skin={skin} label="Nejlepší střelec">
            {team.topScorer ? (
              <>
                {team.topScorer.playerId ? (
                  <PlayerLink id={team.topScorer.playerId} className={`${skin.link} print:no-underline`}>
                    {team.topScorer.name}
                  </PlayerLink>
                ) : (
                  team.topScorer.name
                )}
                {`, ${countLabel(team.topScorer.goals, "gól", "góly", "gólů")}`}
              </>
            ) : (
              "zatím bez gólu"
            )}
          </FactRow>
        </tbody>
      </table>
    </div>
  );
}

/** Zápasový program k příštímu zápasu, jak ho klub tiskne a rozdává u pokladny. */
export function ProgramClient({ program, siteUrl }: { program: ClubWebsiteProgramPage; siteUrl: string }) {
  const { club, match, home, away, headToHead, coachWord, ticketPrice, partners } = program;
  const ours = match ? (match.isHome ? home : away) : null;
  const opponent = match ? (match.isHome ? away : home) : null;
  const box = FORM_BOX[club.template] ?? FORM_BOX.retro_2004;
  const host = siteUrl.replace(/^https?:\/\//, "");
  const shareTitle = match ? `Zpravodaj ke ${match.round}. kolu · ${club.name}` : `Zpravodaj · ${club.name}`;
  const printClass = `${PRINT_RESET} ${DARK_TEMPLATES.has(club.template) ? PRINT_DARK_BORDERS : ""}`;
  // Vzájemné zápasy mají jen jména; klikatelná jsou ta, která patří dnešním soupeřům
  const teamIdByName = new Map<string, string>();
  for (const t of [home, away]) if (t) teamIdByName.set(t.name, t.id);

  return (
    <div className={printClass}>
      <style>{PAGE_CSS}</style>
      <ClubSubpageShell club={club} teamSlugs={program.teamSlugs} siteUrl={siteUrl} path="/zpravodaj" shareTitle={shareTitle}>
        {(skin, clubPath) => {
          const framed = !!skin.frame;
          const pad = framed ? "p-3" : "";
          const section = `${skin.section} ${framed ? "" : "print:p-4"}`;
          const headInner = `${framed ? "" : "max-w-6xl mx-auto px-4 sm:px-8 print:px-0"} py-6 print:py-2 text-center`;
          const body = `${skin.body} ${framed ? "" : "print:max-w-none print:px-0 print:py-4 print:space-y-5"}`;
          const backLink = (
            <>
              <p className={`text-center text-sm ${skin.muted} ${pad} print:hidden`}>
                <Link href={clubPath} className={skin.link}>Zpět na web klubu {club.name}</Link>
              </p>
              <p className={`hidden print:block text-center text-sm ${pad}`}>
                Vydává {club.name} · {host}{clubPath}
              </p>
            </>
          );

          if (!match) {
            return (
              <>
                <header className={skin.header}>
                  <div className={headInner}>
                    <div className={skin.kicker}>{club.name}</div>
                    <h1 className={skin.name}>Zpravodaj</h1>
                    {club.leagueName && <div className={skin.meta}>{club.leagueName}</div>}
                  </div>
                </header>
                <div className={body}>
                  <section className={section}>
                    {skin.sectionHead("Příští zápas")}
                    <p className={`text-base ${pad}`}>Příští zápas zatím není naplánovaný.</p>
                  </section>
                  {backLink}
                </div>
              </>
            );
          }

          const homeName = home?.name ?? "Domácí";
          const awayName = away?.name ?? "Hosté";
          const rosters = [
            { label: "Domácí", team: home },
            { label: "Hosté", team: away },
          ].filter((r): r is { label: string; team: ClubWebsiteProgramTeam } => r.team != null);

          return (
            <>
              <header className={skin.header}>
                <div className={headInner}>
                  <div className={skin.kicker}>{club.name}</div>
                  <h1 className={skin.name}>Zpravodaj ke {match.round}. kolu</h1>
                  <div className={skin.meta}>{match.competitionName}</div>

                  <div className="mt-6 grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] print:grid-cols-[1fr_auto_1fr] items-center gap-2 md:gap-6 print:gap-6">
                    <div className="min-w-0">
                      <div className={skin.kicker}>Domácí</div>
                      <div className={skin.name}>
                        <TeamLink id={home?.id} name={homeName} />
                      </div>
                    </div>
                    <div className={skin.name} aria-hidden="true">–</div>
                    <div className="min-w-0">
                      <div className={skin.kicker}>Hosté</div>
                      <div className={skin.name}>
                        <TeamLink id={away?.id} name={awayName} />
                      </div>
                    </div>
                  </div>

                  <div className="mt-5">
                    <div className={`${skin.meta} flex flex-wrap justify-center gap-x-6 gap-y-1`}>
                      <span>Výkop: <strong>{formatDateTime(match.date)}</strong></span>
                      {match.stadiumName && <span>Hřiště: <strong>{match.stadiumName}</strong></span>}
                      {ticketPrice != null && (
                        <span>Vstupné: <strong>{ticketPrice > 0 ? `${ticketPrice} Kč` : "zdarma"}</strong></span>
                      )}
                    </div>
                  </div>
                </div>
              </header>

              <div className={body}>
                <div className={`flex justify-end ${pad} print:hidden`}>
                  <button type="button" onClick={() => window.print()} className={`${skin.link} text-base cursor-pointer`}>
                    {club.template === "retro_2004" ? "[ Vytisknout zpravodaj ]" : "Vytisknout zpravodaj"}
                  </button>
                </div>

                {coachWord && coachWord.pairs.length > 0 && (
                  <section className={section}>
                    {skin.sectionHead("Slovo trenéra")}
                    <div className={pad}>
                      <p className={`text-sm ${skin.muted}`}>
                        {coachWordHeadline(coachWord, match.round)}
                        {" · "}
                        {coachWord.coachName === "Trenér" ? (
                          "Odpovídá trenér klubu"
                        ) : (
                          <>Odpovídá trenér <strong className="text-base">{coachWord.coachName}</strong></>
                        )}
                      </p>
                      <div className="mt-4 space-y-4">
                        {coachWord.pairs.map((pair, i) => (
                          <div key={i} className="print:break-inside-avoid">
                            <p className="font-bold text-base break-words">{pair.question}</p>
                            <p className={`${skin.quote} leading-relaxed mt-1 break-words`}>{pair.answer}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </section>
                )}

                {(opponent || ours) && (
                  <div className={`grid grid-cols-1 lg:grid-cols-2 print:grid-cols-2 ${framed ? "gap-3" : "gap-8 print:gap-5"}`}>
                    {opponent && (
                      <section className={`${section} print:break-inside-avoid`}>
                        {skin.sectionHead("Představujeme soupeře")}
                        <TeamFacts team={opponent} skin={skin} box={box} pad={pad} />
                      </section>
                    )}
                    {ours && (
                      <section className={`${section} print:break-inside-avoid`}>
                        {skin.sectionHead("Naše forma")}
                        <TeamFacts team={ours} skin={skin} box={box} pad={pad} />
                      </section>
                    )}
                  </div>
                )}

                {headToHead.length > 0 && (
                  <section className={`${section} print:break-inside-avoid`}>
                    {skin.sectionHead("Vzájemné zápasy")}
                    <div className={`overflow-x-auto ${framed ? "p-2" : ""}`}>
                      <table className={skin.table}>
                        <thead>
                          <tr className={skin.thead}>
                            <th className={`${skin.th} text-left`}>Datum</th>
                            <th className={`${skin.th} text-left`}>Utkání</th>
                            <th className={`${skin.th} text-center`}>Výsledek</th>
                          </tr>
                        </thead>
                        <tbody>
                          {headToHead.map((m, i) => (
                            <tr key={`${m.date}-${i}`} className={skin.row}>
                              <td className={`${skin.td} whitespace-nowrap tabular-nums`}>{m.date ? formatDate(m.date) : EMPTY}</td>
                              <td className={`${skin.td} text-base`}>
                                <TeamLink id={teamIdByName.get(m.homeName)} name={m.homeName} className={`${skin.link} print:no-underline`} />
                                {" – "}
                                <TeamLink id={teamIdByName.get(m.awayName)} name={m.awayName} className={`${skin.link} print:no-underline`} />
                              </td>
                              <td className={`${skin.td} text-center text-base font-bold tabular-nums whitespace-nowrap`}>
                                {m.homeScore}:{m.awayScore}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}

                {rosters.length > 0 && (
                  <section className={section}>
                    {skin.sectionHead("Soupisky")}
                    <div className={`grid grid-cols-1 md:grid-cols-2 print:grid-cols-2 gap-6 print:gap-4 ${pad}`}>
                      {rosters.map(({ label, team }) => (
                        <div key={label} className="min-w-0 print:break-inside-avoid">
                          <div className={skin.kicker}>{label}</div>
                          <p className="text-lg font-bold break-words mb-2">
                            <TeamLink id={team.id} name={team.name} className={skin.link} />
                          </p>
                          {team.roster.length === 0 ? (
                            <p className={`text-base ${skin.muted}`}>Soupiska zatím není zveřejněná.</p>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className={skin.table}>
                                <thead>
                                  <tr className={skin.thead}>
                                    <th className={`${skin.th} text-center w-12`}>Č.</th>
                                    <th className={`${skin.th} text-left`}>Jméno</th>
                                    <th className={`${skin.th} text-left`}>Post</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {team.roster.map((p) => (
                                    <tr key={p.id} className={skin.row}>
                                      <td className={`${skin.td} text-center font-bold tabular-nums`}>{p.number ?? EMPTY}</td>
                                      <td className={`${skin.td} text-base`}>
                                        <PlayerLink id={p.id} className={`${skin.link} print:no-underline`}>{p.name}</PlayerLink>
                                      </td>
                                      <td className={`${skin.td} ${skin.muted}`}>{p.position}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {partners.length > 0 && (
                  <section className={`${section} print:break-inside-avoid`}>
                    {skin.sectionHead("Partneři klubu")}
                    <div className={pad}>
                      <p className={`text-base ${skin.muted}`}>Děkujeme partnerům, kteří podporují klub {club.name}.</p>
                      <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-base font-bold">
                        {partners.map((name) => (
                          <li key={name}>{name}</li>
                        ))}
                      </ul>
                    </div>
                  </section>
                )}

                {backLink}
              </div>
            </>
          );
        }}
      </ClubSubpageShell>
    </div>
  );
}
