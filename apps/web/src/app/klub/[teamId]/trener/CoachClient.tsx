"use client";

import Link from "next/link";
import { ROLE_DEFS, type ClubWebsiteCoachPage } from "@okresni-masina/shared";
import { ClubSubpageShell, type Skin } from "../templates/skins";
import { ManagerFace } from "../ManagerFace";
import { formatDate } from "../templates/shared";

type StaffMember = ClubWebsiteCoachPage["staff"][number];
type CoachInterview = ClubWebsiteCoachPage["interviews"][number];

function ageLabel(age: number): string {
  if (age >= 2 && age <= 4) return `${age} roky`;
  return age === 1 ? "1 rok" : `${age} let`;
}

/** Titulek rozhovoru jako v tiskovém středisku webu klubu: „Rozhovor po 10. kole“. */
function interviewTitle(iv: CoachInterview): string {
  const gw = iv.gameWeek;
  if (iv.kind === "season_wrap" || (gw >= 100 && gw % 100 === 0)) {
    return gw >= 100 ? `Ohlédnutí za ${Math.round(gw / 100)}. sezónou` : "Ohlédnutí za sezónou";
  }
  if (iv.kind === "pre_match") return `Rozhovor před ${gw}. kolem`;
  if (iv.kind === "post_match") return `Rozhovor po ${gw}. kole`;
  return `Rozhovor, ${gw}. kolo`;
}

function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase("cs-CZ") + text.slice(1);
}

/** Popis člověka ze štábu jako věta: velké písmeno a tečka. */
function sentence(text: string): string {
  const t = text.trim();
  if (!t) return t;
  const capital = capitalize(t);
  return /[.!?…]$/.test(capital) ? capital : `${capital}.`;
}

// Pořadí funkcí jako na webech klubů: trenéři, zdravotníci, pak zázemí
const ROLE_ORDER = Object.values(ROLE_DEFS).map((d) => d.label);
const BACKROOM_LABELS = new Set(
  Object.values(ROLE_DEFS)
    .filter((d) => d.group === "trenerske" || d.group === "zdravi")
    .map((d) => d.label),
);

function roleRank(label: string): number {
  const i = ROLE_ORDER.indexOf(label);
  return i === -1 ? ROLE_ORDER.length : i;
}

function StaffList({ people, skin }: { people: StaffMember[]; skin: Skin }) {
  return (
    <ul className={skin.frame ? "px-3 pb-1" : ""}>
      {people.map((s) => (
        <li key={s.id} className={`${skin.row} py-3 flex items-start gap-3`}>
          <div className={skin.faceBox}>
            <ManagerFace faceConfig={s.avatar} size={56} />
          </div>
          <div className="min-w-0">
            <div className={`text-sm font-bold uppercase ${skin.muted}`}>{s.roleLabel}</div>
            <div className="text-base font-bold break-words">{s.name}</div>
            {s.age !== null && <div className={`text-sm ${skin.muted}`}>{ageLabel(s.age)}</div>}
            {s.description && <p className="text-sm mt-1 break-words">{sentence(s.description)}</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Podstránka webu klubu „Trenér a realizační tým“: vzhled šablony klubu, bez odkazů do hry. */
export function CoachClient({ page, siteUrl }: { page: ClubWebsiteCoachPage; siteUrl: string }) {
  const { club, coach, record, interviews } = page;
  const staff = [...(page.staff ?? [])].sort(
    (a, b) => roleRank(a.roleLabel) - roleRank(b.roleLabel) || a.name.localeCompare(b.name, "cs"),
  );
  const backroom = staff.filter((s) => BACKROOM_LABELS.has(s.roleLabel));
  const support = staff.filter((s) => !BACKROOM_LABELS.has(s.roleLabel));

  const licence = coach
    ? coach.licence === "Bez licence" ? "Bez trenérské licence" : `Trenérská licence ${coach.licence}`
    : null;
  const metaPersonal = coach
    ? [coach.age !== null ? ageLabel(coach.age) : null, coach.birthplace ? `rodiště ${coach.birthplace}` : null].filter(Boolean)
    : [];
  const metaCareer = coach ? [licence, coach.background].filter(Boolean) : [];

  return (
    <ClubSubpageShell
      club={club}
      teamSlugs={page.teamSlugs ?? {}}
      siteUrl={siteUrl}
      path="/trener"
      shareTitle={coach ? `${coach.name}, trenér · ${club.name}` : `Realizační tým · ${club.name}`}
    >
      {(skin, clubPath) => {
        const pad = skin.frame ? "p-3" : "";
        const tableWrap = `overflow-x-auto ${skin.frame ? "p-2" : ""}`;
        return (
          <>
            <header className={skin.header}>
              <div className={`${skin.frame ? "" : "max-w-6xl mx-auto px-4 sm:px-8"} py-5 flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left`}>
                {coach && (
                  <div className={skin.faceBox}>
                    <ManagerFace faceConfig={coach.avatar} size={96} />
                  </div>
                )}
                <div className="min-w-0">
                  <div className={skin.kicker}>{coach ? "Hlavní trenér" : "Trenér a realizační tým"}</div>
                  <h1 className={skin.name}>{coach ? coach.name : club.name}</h1>
                  {metaPersonal.length > 0 && <div className={skin.meta}>{capitalize(metaPersonal.join(" · "))}</div>}
                  {metaCareer.length > 0 && <div className={skin.meta}>{metaCareer.join(" · ")}</div>}
                  {coach?.since && <div className={skin.meta}>U klubu od {formatDate(coach.since)}</div>}
                </div>
              </div>
            </header>

            <div className={skin.body}>
              {!coach && (
                <section className={skin.section}>
                  {skin.sectionHead("Hlavní trenér")}
                  <p className={`text-base ${skin.muted} ${pad}`}>Klub zatím nemá trenéra.</p>
                </section>
              )}

              {coach?.bio && (
                <section className={skin.section}>
                  {skin.sectionHead("Slovo o trenérovi")}
                  <p className={`${pad} ${skin.quote}`}>„{coach.bio}“</p>
                </section>
              )}

              {coach && (
                <section className={skin.section}>
                  {skin.sectionHead("Bilance u klubu")}
                  {!record || record.played === 0 ? (
                    <p className={`text-base ${skin.muted} ${pad}`}>Pod jeho vedením tým zatím neodehrál soutěžní zápas.</p>
                  ) : (
                    <>
                      <div className={tableWrap}>
                        <table className={skin.table}>
                          <thead>
                            <tr className={skin.thead}>
                              <th className={`${skin.th} text-center`}>Zápasy</th>
                              <th className={`${skin.th} text-center`}>Výhry</th>
                              <th className={`${skin.th} text-center`}>Remízy</th>
                              <th className={`${skin.th} text-center`}>Prohry</th>
                              <th className={`${skin.th} text-center`}>Skóre</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr className={skin.row}>
                              <td className={`${skin.td} text-center text-base font-bold tabular-nums`}>{record.played}</td>
                              <td className={`${skin.td} text-center text-base font-bold tabular-nums`}>{record.wins}</td>
                              <td className={`${skin.td} text-center text-base font-bold tabular-nums`}>{record.draws}</td>
                              <td className={`${skin.td} text-center text-base font-bold tabular-nums`}>{record.losses}</td>
                              <td className={`${skin.td} text-center text-base font-bold tabular-nums whitespace-nowrap`}>
                                {record.goalsFor}:{record.goalsAgainst}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      <p className={`text-sm mt-2 ${skin.muted} ${skin.frame ? "px-3 pb-3" : ""}`}>
                        Soutěžní zápasy pod jeho vedením, liga i pohár.
                      </p>
                    </>
                  )}
                </section>
              )}

              {coach && interviews.length > 0 && (
                <section className={skin.section}>
                  {skin.sectionHead("Rozhovory")}
                  <ul className={skin.frame ? "px-3 pb-1" : ""}>
                    {interviews.map((iv) => (
                      <li key={iv.id} className={`${skin.row} py-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5`}>
                        <Link href={`${clubPath}#tisk`} className={`${skin.link} text-base break-words min-w-0`}>
                          {interviewTitle(iv)}
                        </Link>
                        <span className={`text-sm ${skin.muted} tabular-nums whitespace-nowrap`}>{formatDate(iv.createdAt)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section className={skin.section}>
                {skin.sectionHead("Realizační tým")}
                {backroom.length === 0 ? (
                  <p className={`text-base ${skin.muted} ${pad}`}>Realizační tým se teprve skládá.</p>
                ) : (
                  <StaffList people={backroom} skin={skin} />
                )}
              </section>

              {support.length > 0 && (
                <section className={skin.section}>
                  {skin.sectionHead("Zázemí klubu")}
                  <StaffList people={support} skin={skin} />
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
