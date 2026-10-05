"use client";

import Link from "next/link";
import type { ClubWebsitePlayerProfile } from "@okresni-masina/shared";
import { ManagerFace } from "../../ManagerFace";
import { ShareButton } from "../../ShareButton";
import {
  ClubBasePathContext,
  TeamLink,
  clubPaletteStyle,
  contractJoinLabel,
  contractLeaveLabel,
  formatDate,
} from "../../templates/shared";

const COUNTRIES: Record<string, { name: string; flag: string }> = {
  CZ: { name: "Česko", flag: "🇨🇿" },
  SK: { name: "Slovensko", flag: "🇸🇰" },
  PL: { name: "Polsko", flag: "🇵🇱" },
  DE: { name: "Německo", flag: "🇩🇪" },
  AT: { name: "Rakousko", flag: "🇦🇹" },
  HU: { name: "Maďarsko", flag: "🇭🇺" },
  HR: { name: "Chorvatsko", flag: "🇭🇷" },
  RO: { name: "Rumunsko", flag: "🇷🇴" },
  UA: { name: "Ukrajina", flag: "🇺🇦" },
  VN: { name: "Vietnam", flag: "🇻🇳" },
};

function ageLabel(age: number): string {
  if (age === 1) return "1 rok";
  if (age >= 2 && age <= 4) return `${age} roky`;
  return `${age} let`;
}

/**
 * Veřejný profil hráče na klubovém webu: v barvách klubu, bez odkazů do hry.
 * Ukazuje jen veřejné údaje (post, věk, statistiky, kariéra), žádné skryté atributy.
 */
export function PlayerProfileClient({ profile, siteUrl }: { profile: ClubWebsitePlayerProfile; siteUrl: string }) {
  const { club, player, currentTeam, playsForClub, seasons, career } = profile;
  const clubPath = `/klub/${club.slug || club.id}`;
  const fullName = `${player.firstName} ${player.lastName}`;
  const country = player.nationality ? COUNTRIES[player.nationality] : null;
  const totals = seasons.reduce(
    (acc, s) => ({
      appearances: acc.appearances + s.appearances,
      goals: acc.goals + s.goals,
      assists: acc.assists + s.assists,
      cleanSheets: acc.cleanSheets + s.cleanSheets,
      manOfMatch: acc.manOfMatch + s.manOfMatch,
    }),
    { appearances: 0, goals: 0, assists: 0, cleanSheets: 0, manOfMatch: 0 },
  );
  const isKeeper = ["GK", "BRA"].includes((player.position || "").toUpperCase());

  const statusLine = playsForClub
    ? `Hráč klubu ${club.name}`
    : currentTeam
      ? null
      : "Momentálně bez klubu";

  return (
    <ClubBasePathContext.Provider value={clubPath}>
      <div className="min-h-screen bg-[#f4f1ea] text-gray-900" style={clubPaletteStyle(club.primaryColor, club.secondaryColor)}>
        <div className="sticky top-0 z-50 min-h-[52px] px-3 sm:px-6 py-2 flex items-center justify-between gap-2 bg-[#0b0f17] text-white shadow-md">
          <Link
            href={clubPath}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--club-bar)] text-[var(--club-on-bar)] font-heading font-bold text-sm min-w-0"
          >
            <span aria-hidden="true">←</span>
            <span className="truncate">Web klubu {club.name}</span>
          </Link>
          <ShareButton
            url={`${siteUrl}${clubPath}/hrac/${player.id}`}
            title={`${fullName} · ${club.name}`}
            textClass="text-slate-200 hover:text-white"
            bgClass="bg-white/10 hover:bg-white/20 border border-white/20"
          />
        </div>

        <header className="bg-[var(--club-bar)] text-[var(--club-on-bar)]">
          <div className="max-w-4xl mx-auto px-4 py-6 sm:py-10 flex flex-col sm:flex-row items-center sm:items-end gap-5">
            <div className="shrink-0 rounded-2xl bg-white/90 p-2 shadow-lg">
              <ManagerFace faceConfig={player.avatar} size={110} />
            </div>
            <div className="min-w-0 text-center sm:text-left">
              <div className="text-sm font-heading font-bold uppercase tracking-wider opacity-80">
                {player.positionName}
                {player.squadNumber ? ` · číslo ${player.squadNumber}` : ""}
              </div>
              <h1 className="font-heading font-black text-3xl sm:text-5xl leading-tight break-words">{fullName}</h1>
              {player.nickname && <div className="text-lg font-heading font-bold opacity-90">„{player.nickname}“</div>}
              <div className="mt-2 text-base opacity-90 flex flex-wrap gap-x-4 gap-y-1 justify-center sm:justify-start">
                <span>{ageLabel(player.age)}</span>
                {country && (
                  <span>
                    <span aria-hidden="true">{country.flag}</span> {country.name}
                  </span>
                )}
                {statusLine && <span>{statusLine}</span>}
                {!playsForClub && currentTeam && (
                  <span>
                    Nyní hraje za{" "}
                    <TeamLink id={currentTeam.id} name={currentTeam.name} className="underline font-bold" />
                  </span>
                )}
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
          {player.description && (
            <blockquote className="bg-white border-l-4 border-[var(--club-accent-light)] rounded-r-xl p-4 text-base italic shadow-sm">
              „{player.description}“
            </blockquote>
          )}

          <section aria-labelledby="kariera-souhrn" className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-gray-200">
            <h2 id="kariera-souhrn" className="font-heading font-black text-xl text-[var(--club-accent-light)] mb-3">
              Bilance
            </h2>
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Zápasy", value: totals.appearances },
                { label: "Góly", value: totals.goals },
                { label: "Asistence", value: totals.assists },
                isKeeper
                  ? { label: "Čistá konta", value: totals.cleanSheets }
                  : { label: "Muž zápasu", value: totals.manOfMatch },
              ].map((t) => (
                <div key={t.label} className="rounded-xl bg-[color-mix(in_srgb,var(--club-accent-light)_8%,white)] border border-gray-200 px-3 py-3 text-center">
                  <dd className="font-heading font-black text-3xl tabular-nums">{t.value}</dd>
                  <dt className="text-sm text-gray-600">{t.label}</dt>
                </div>
              ))}
            </dl>
          </section>

          <section aria-labelledby="sezony" className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-gray-200">
            <h2 id="sezony" className="font-heading font-black text-xl text-[var(--club-accent-light)] mb-3">
              Statistiky po sezónách
            </h2>
            {seasons.length === 0 ? (
              <p className="text-base text-gray-600">Zatím neodehrál žádný soutěžní zápas.</p>
            ) : (
              <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
                <table className="w-full text-sm min-w-[520px]">
                  <thead>
                    <tr className="text-left text-gray-600 border-b border-gray-200">
                      <th className="py-2 pr-2 font-heading">Sezóna</th>
                      <th className="py-2 pr-2 font-heading">Klub</th>
                      <th className="py-2 px-1 font-heading text-right" title="Zápasy">Záp.</th>
                      <th className="py-2 px-1 font-heading text-right">Góly</th>
                      <th className="py-2 px-1 font-heading text-right" title="Asistence">Asist.</th>
                      {isKeeper && <th className="py-2 px-1 font-heading text-right" title="Čistá konta">Č. konta</th>}
                      <th className="py-2 px-1 font-heading text-right" title="Žluté / červené karty">Karty</th>
                      <th className="py-2 pl-1 font-heading text-right" title="Průměrná známka">Známka</th>
                    </tr>
                  </thead>
                  <tbody>
                    {seasons.map((s) => (
                      <tr key={`${s.seasonNumber}-${s.teamId}`} className="border-b border-gray-100">
                        <td className="py-2 pr-2 tabular-nums">{s.seasonNumber}.</td>
                        <td className="py-2 pr-2 text-base">
                          <TeamLink id={s.teamId} name={s.teamName} className="text-[var(--club-accent-light)] font-bold" />
                        </td>
                        <td className="py-2 px-1 text-right tabular-nums">{s.appearances}</td>
                        <td className="py-2 px-1 text-right tabular-nums font-bold">{s.goals}</td>
                        <td className="py-2 px-1 text-right tabular-nums">{s.assists}</td>
                        {isKeeper && <td className="py-2 px-1 text-right tabular-nums">{s.cleanSheets}</td>}
                        <td className="py-2 px-1 text-right tabular-nums">{s.yellowCards} / {s.redCards}</td>
                        <td className="py-2 pl-1 text-right tabular-nums">{s.avgRating ? s.avgRating.toFixed(1) : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {career.length > 0 && (
            <section aria-labelledby="kariera" className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-gray-200">
              <h2 id="kariera" className="font-heading font-black text-xl text-[var(--club-accent-light)] mb-3">
                Kariéra
              </h2>
              <ol className="space-y-3">
                {career.map((c, i) => {
                  const leave = contractLeaveLabel(c.leaveType);
                  return (
                    <li key={`${c.teamId}-${c.joinedAt}-${i}`} className="flex gap-3">
                      <span className="mt-1.5 w-3 h-3 rounded-full shrink-0 bg-[var(--club-accent-light)]" aria-hidden="true" />
                      <div className="min-w-0">
                        <TeamLink id={c.teamId} name={c.teamName} className="text-base font-bold" />
                        <div className="text-sm text-gray-600">
                          {c.joinedAt ? `od ${formatDate(c.joinedAt)}` : "od založení"}
                          {` (${contractJoinLabel(c.joinType)})`}
                          {c.leftAt ? `, do ${formatDate(c.leftAt)}${leave ? ` (${leave})` : ""}` : ", dosud"}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          )}

          <footer className="text-center text-sm text-gray-600 pb-6">
            <Link href={clubPath} className="underline">Zpět na web klubu {club.name}</Link>
            {" · "}
            <Link href="/registrace" className="underline">Založ si vlastní klub na Pralesu</Link>
          </footer>
        </main>
      </div>
    </ClubBasePathContext.Provider>
  );
}
