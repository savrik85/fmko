"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { ClubWebsitePlayerProfile, ClubWebsiteTemplate } from "@okresni-masina/shared";
import { ManagerFace } from "../../ManagerFace";
import { ShareButton } from "../../ShareButton";
import {
  ClubBasePathContext,
  TeamSlugsContext,
  TeamLink,
  clubPaletteStyle,
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

/**
 * Vzhled profilu převzatý z šablony webu klubu. Třídy jsou zkopírované z jejích sekcí
 * (rám stránky, lišty, tabulka soutěže), aby profil vypadal jako další stránka téhož webu,
 * ne jako cizí aplikace.
 */
interface Skin {
  root: string;
  rootStyle?: CSSProperties;
  frame: string;
  header: string;
  kicker: string;
  name: string;
  meta: string;
  body: string;
  section: string;
  sectionHead: (title: string) => ReactNode;
  table: string;
  thead: string;
  th: string;
  td: string;
  row: string;
  link: string;
  muted: string;
  quote: string;
  faceBox: string;
}

const LIGHT_TONES = {
  "--club-ink": "color-mix(in srgb, var(--club-accent-light) 75%, black)",
  "--club-frame": "color-mix(in srgb, var(--club-accent-light) 50%, #cbb092)",
} as CSSProperties;

const SKINS: Record<ClubWebsiteTemplate, Skin> = {
  retro_2004: {
    root: "min-h-screen bg-[#d8d6ce] text-[#111111] font-sans pb-16",
    rootStyle: LIGHT_TONES,
    frame: "max-w-5xl mx-auto my-3 bg-white border-2 border-black shadow-[6px_6px_0px_rgba(0,0,0,0.5)]",
    header: "bg-[var(--club-bar)] text-[var(--club-on-bar)] p-3 sm:p-4 border-b-4 border-[var(--club-secondary)]",
    kicker: "text-sm tracking-wide font-mono uppercase",
    name: "text-2xl sm:text-3xl font-serif font-black tracking-tight break-words",
    meta: "text-sm mt-0.5",
    body: "p-3 space-y-3",
    section: "border border-gray-400 bg-white",
    sectionHead: (title) => (
      <div className="bg-[var(--club-bar)] text-[var(--club-on-bar)] px-3 py-1.5 font-bold text-sm uppercase">{title}</div>
    ),
    table: "w-full text-left text-sm border-collapse",
    thead: "bg-[#f0f0e8] border-b border-gray-400 text-gray-700 font-bold",
    th: "py-1 px-2",
    td: "py-1 px-2",
    row: "border-b border-gray-200",
    link: "text-blue-800 underline",
    muted: "text-gray-600",
    quote: "font-serif italic text-base",
    faceBox: "p-1 bg-white border border-[var(--club-secondary)] shadow shrink-0",
  },
  village_patriot: {
    root: "min-h-screen bg-[#f3ebe1] text-[#2c1b0e] font-sans pb-16",
    rootStyle: LIGHT_TONES,
    frame: "",
    header: "bg-[#3b2010] text-[#ffebd4] border-b-8 border-[var(--club-primary)] shadow-2xl",
    kicker: "text-sm font-serif font-bold uppercase tracking-widest",
    name: "text-3xl sm:text-4xl font-serif font-black break-words",
    meta: "text-base font-serif mt-1",
    body: "max-w-5xl mx-auto px-4 sm:px-8 py-8 space-y-8",
    section: "bg-[#fffdfa] border-2 border-[var(--club-frame)] rounded-3xl p-6 sm:p-8 shadow-md relative font-serif",
    sectionHead: (title) => (
      <>
        <span className="absolute -top-3 left-8 text-2xl" aria-hidden="true">📌</span>
        <div className="border-b-2 border-dashed border-[#d8be9f] pb-3 mb-4">
          <div className="text-sm uppercase tracking-widest text-[var(--club-ink)] font-bold">{title}</div>
        </div>
      </>
    ),
    table: "w-full text-left text-sm border-collapse",
    thead: "bg-[#ede2d2] border-b-2 border-[#b89a7a] text-[#3e2211] font-bold",
    th: "py-2 px-2",
    td: "py-2 px-2",
    row: "border-b border-[#e5d5c0]",
    link: "text-[var(--club-ink)] font-bold hover:underline",
    muted: "text-[#6b4f36]",
    quote: "font-serif italic text-base",
    faceBox: "p-2 bg-[#2a160b] border-2 border-[#5c371e] rounded-xl shadow-inner shrink-0",
  },
  regional_standard: {
    root: "min-h-screen bg-slate-50 text-slate-900 font-sans pb-16",
    rootStyle: LIGHT_TONES,
    frame: "",
    header: "bg-[var(--club-bar)] text-[var(--club-on-bar)] border-b border-black/10 shadow-sm",
    kicker: "text-sm font-bold uppercase tracking-wider",
    name: "font-heading font-black text-2xl sm:text-4xl tracking-tight break-words",
    meta: "text-base mt-1",
    body: "max-w-6xl mx-auto px-4 sm:px-8 py-8 space-y-8",
    section: "bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm",
    sectionHead: (title) => (
      <div className="mb-4 border-b border-slate-100 pb-3">
        <h2 className="text-xl sm:text-2xl font-heading font-black text-slate-900">{title}</h2>
      </div>
    ),
    table: "w-full text-left text-sm border-collapse",
    thead: "bg-slate-50 border-b border-slate-200 text-slate-600 font-heading font-bold text-sm uppercase tracking-wider",
    th: "py-2.5 px-3",
    td: "py-2.5 px-3",
    row: "border-b border-slate-100",
    link: "text-[var(--club-ink)] font-bold hover:underline",
    muted: "text-slate-500",
    quote: "italic text-base text-slate-700",
    faceBox: "shrink-0 rounded-xl bg-white/90 p-1.5",
  },
  profi_league: {
    root: "min-h-screen bg-[#070a12] text-white font-sans pb-16",
    frame: "",
    header: "bg-[var(--club-bar)] text-[var(--club-on-bar)] border-b border-white/10 shadow-2xl",
    kicker: "text-sm font-heading font-black uppercase tracking-wide",
    name: "font-heading font-black text-3xl sm:text-5xl tracking-tight uppercase break-words",
    meta: "text-base font-heading font-bold mt-1",
    body: "max-w-6xl mx-auto px-4 sm:px-8 py-8 space-y-8",
    section: "bg-[#0e1320] border border-white/10 rounded-3xl p-4 sm:p-8 shadow-2xl",
    sectionHead: (title) => (
      <div className="mb-6 border-b border-white/10 pb-4">
        <h2 className="text-xl sm:text-3xl font-heading font-black text-white tracking-tight uppercase">{title}</h2>
      </div>
    ),
    table: "w-full text-left text-sm border-collapse",
    thead: "bg-white/5 text-white/60 font-heading font-black text-sm uppercase tracking-wide border-b border-white/10",
    th: "py-3 px-2 sm:px-3",
    td: "py-3 px-2 sm:px-3",
    row: "border-b border-white/5",
    link: "text-[var(--club-accent-dark)] font-bold hover:underline",
    muted: "text-white/60",
    quote: "italic text-base text-white/80",
    faceBox: "shrink-0 drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]",
  },
  champions: {
    root: "min-h-screen bg-[#020510] text-white font-sans pb-20",
    frame: "",
    header: "backdrop-blur-2xl bg-white/5 border-b border-[color-mix(in_srgb,var(--club-accent-dark)_25%,transparent)] shadow-[0_10px_30px_rgba(0,0,0,0.5)]",
    kicker: "text-sm font-heading font-bold uppercase tracking-wider text-[var(--club-accent-dark)]",
    name: "font-heading font-black text-3xl sm:text-5xl tracking-tight uppercase break-words",
    meta: "text-base font-heading font-bold mt-1 text-[color-mix(in_srgb,var(--club-accent-dark)_20%,#ffffffa6)]",
    body: "max-w-6xl mx-auto px-4 sm:px-8 py-8 space-y-8",
    section: "bg-white/5 border border-[color-mix(in_srgb,var(--club-accent-dark)_25%,transparent)] rounded-3xl p-4 sm:p-8 shadow-2xl backdrop-blur-xl",
    sectionHead: (title) => (
      <div className="mb-6 border-b border-[color-mix(in_srgb,var(--club-accent-dark)_25%,transparent)] pb-4">
        <h2 className="text-xl sm:text-3xl font-heading font-black text-white tracking-tight uppercase">{title}</h2>
      </div>
    ),
    table: "w-full text-left text-sm border-collapse",
    thead: "bg-white/5 text-[color-mix(in_srgb,var(--club-accent-dark)_20%,#ffffffa6)] font-heading font-black text-sm uppercase tracking-wide border-b border-[color-mix(in_srgb,var(--club-accent-dark)_25%,transparent)]",
    th: "py-3 px-2 sm:px-3",
    td: "py-3 px-2 sm:px-3",
    row: "border-b border-white/5",
    link: "text-[var(--club-accent-dark)] font-bold hover:underline",
    muted: "text-white/60",
    quote: "italic text-base text-white/80",
    faceBox: "shrink-0 drop-shadow-[0_0_20px_color-mix(in_srgb,var(--club-accent-dark)_40%,transparent)]",
  },
};

/** Veřejný profil hráče: vypadá jako další stránka webu klubu (stejná šablona), bez odkazů do hry. */
export function PlayerProfileClient({ profile, siteUrl }: { profile: ClubWebsitePlayerProfile; siteUrl: string }) {
  const { club, player, currentTeam, playsForClub, seasons, career } = profile;
  const skin = SKINS[club.template] ?? SKINS.retro_2004;
  const clubPath = `/klub/${club.slug || club.id}`;
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
  const pad = skin.frame ? "p-3" : "";

  const content = (
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
        {player.description && (
          <section className={skin.section}>
            {skin.sectionHead("Pár slov o hráči")}
            <p className={`${pad} ${skin.quote}`}>„{player.description}“</p>
          </section>
        )}

        <section className={skin.section}>
          {skin.sectionHead(`Bilance v dresu klubu ${club.name}`)}
          <div className={`overflow-x-auto ${skin.frame ? "p-2" : ""}`}>
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

        <section className={skin.section}>
          {skin.sectionHead("Statistiky po sezónách")}
          {seasons.length === 0 ? (
            <p className={`text-base ${skin.muted} ${pad}`}>Zatím neodehrál žádný soutěžní zápas.</p>
          ) : (
            <div className={`overflow-x-auto ${skin.frame ? "p-2" : ""}`}>
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
                      <td className={`${skin.td} text-center tabular-nums`}>{s.avgRating ? s.avgRating.toFixed(1) : "-"}</td>
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
            <div className={`overflow-x-auto ${skin.frame ? "p-2" : ""}`}>
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

  return (
    <ClubBasePathContext.Provider value={clubPath}>
      <TeamSlugsContext.Provider value={profile.teamSlugs ?? {}}>
      <div style={clubPaletteStyle(club.primaryColor, club.secondaryColor)}>
        <div className="bg-[#0b0f17] text-slate-300 border-b border-white/10 px-3 sm:px-6 py-2 text-sm flex items-center justify-between gap-2 sticky top-0 z-50 shadow-md min-h-[52px]">
          <Link
            href={clubPath}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-slate-200 font-heading font-bold text-sm min-w-0"
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
        <div className={skin.root} style={skin.rootStyle}>
          {skin.frame ? <div className={skin.frame}>{content}</div> : content}
        </div>
      </div>
      </TeamSlugsContext.Provider>
    </ClubBasePathContext.Provider>
  );
}
