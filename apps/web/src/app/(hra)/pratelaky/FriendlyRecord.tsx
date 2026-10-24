"use client";

import { useState } from "react";
import Link from "next/link";
import { pocet } from "@/lib/referee-info";
import { bestTextOn, isLightColor, isNeutralExtreme } from "@/lib/team-color";
import { SectionLabel } from "@/components/ui";
import {
  ClubCrest, FormChip, PRIMARY_BUTTON, SECONDARY_BUTTON, TeamLink, dayShort, formatCZK, venueText,
  type Crest, type FriendliesData, type HeadToHead,
} from "./friendly-ui";

/** Věta pod erbem: co se teď děje a co dál. Bez čísel tam, kde nejsou potřeba. */
function streakSentence(r: FriendliesData["record"]): string {
  const s = r.streak;
  if (!s) return "Zatím žádný přátelák. První výhra čeká.";
  if (s.kind === "W" && s.length >= 2) return `${pocet(s.length, "výhra", "výhry", "výher")} v řadě. Kdo tě zastaví?`;
  if (s.kind === "L" && s.length >= 2) return `${pocet(s.length, "prohra", "prohry", "proher")} v řadě. Je čas to otočit.`;
  if (r.unbeaten >= 2) return `${pocet(r.unbeaten, "zápas", "zápasy", "zápasů")} bez porážky.`;
  if (s.kind === "W") return "Poslední přátelák jsi vyhrál.";
  if (s.kind === "D") return "Poslední přátelák skončil remízou.";
  return "Poslední přátelák nevyšel. Vyzvi někoho a oprav to.";
}

function stakeText(v: number): string | null {
  if (v === 0) return null;
  return v > 0 ? `na sázkách +${formatCZK(v)}` : `na sázkách −${formatCZK(-v)}`;
}

/** Barva klubu do pruhu. Bílá nebo skoro bílá by na světlém pozadí zmizela, vezme se druhá barva. */
function barColor(crest: Crest | null | undefined, fallback: string): string {
  if (!crest) return fallback;
  const nearWhite = (hex: string) => isNeutralExtreme(hex) && isLightColor(hex);
  if (!nearWhite(crest.primary)) return crest.primary;
  if (!nearWhite(crest.secondary)) return crest.secondary;
  return fallback;
}

function rivalryHeadline(h: HeadToHead): { text: string; tone: string } {
  if (h.won > h.lost) return { text: `Vedeš ${h.won}:${h.lost}`, tone: "text-pitch-600" };
  if (h.won < h.lost) return { text: `Prohráváš ${h.won}:${h.lost}`, tone: "text-card-red" };
  return { text: `Vyrovnáno ${h.won}:${h.lost}`, tone: "text-muted" };
}

function rivalryStory(h: HeadToHead): string {
  const s = h.streak;
  if (s && s.kind === "W" && s.length >= 2) return `Porazil jsi je ${s.length}× za sebou. Jsi jejich postrach.`;
  if (s && s.kind === "L" && s.length >= 2) return `Prohrál jsi s nimi ${s.length}× za sebou. Dlužíš jim to.`;
  if (h.lastResult === "L") return `Poslední zápas skončil ${h.lastScore} pro ně. Odveta čeká.`;
  if (h.lastResult === "W") return `Poslední zápas jsi vyhrál ${h.lastScore}.`;
  if (h.lastResult === "D") return `Naposledy remíza ${h.lastScore}. Rozhodne příští zápas.`;
  return "";
}

function RivalryCard({ h, me, onChallenge }: { h: HeadToHead; me: FriendliesData["me"]; onChallenge: (teamId: string) => void }) {
  const head = rivalryHeadline(h);
  const myColor = barColor(me?.crest, "#2D5F2D");
  let theirColor = barColor(h.crest, "#9CA3AF");
  if (theirColor.toLowerCase() === myColor.toLowerCase()) theirColor = h.crest?.secondary && h.crest.secondary.toLowerCase() !== myColor.toLowerCase() ? h.crest.secondary : "#9CA3AF";
  const pct = (n: number) => `${(n / Math.max(1, h.played)) * 100}%`;
  const stake = stakeText(h.stakeNet);
  return (
    <div className="card p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <TeamLink id={h.teamId} name={h.name} />
        <span className={`font-heading font-[800] text-base whitespace-nowrap tabular-nums ${head.tone}`}>{head.text}</span>
      </div>

      {/* Přetahovaná: vlevo moje výhry v mé barvě, vpravo jejich v jejich, uprostřed remízy. */}
      <div className="flex items-center gap-2" aria-label={`${h.won} výher, ${h.drawn} remíz, ${h.lost} proher`}>
        <ClubCrest crest={me?.crest} size={30} />
        <div className="flex-1 h-3 rounded-full overflow-hidden flex bg-black/5">
          <div style={{ width: pct(h.won), backgroundColor: myColor }} />
          <div style={{ width: pct(h.drawn) }} className="bg-gray-300" />
          <div style={{ width: pct(h.lost), backgroundColor: theirColor }} />
        </div>
        <ClubCrest crest={h.crest} size={30} />
      </div>
      <div className="flex justify-between text-sm tabular-nums -mt-1">
        <span><span className="font-heading font-bold">{h.won}</span> {h.won === 1 ? "výhra" : h.won >= 2 && h.won <= 4 ? "výhry" : "výher"}</span>
        <span className="text-muted">{pocet(h.drawn, "remíza", "remízy", "remíz")} · skóre {h.goalsFor}:{h.goalsAgainst}</span>
        <span><span className="font-heading font-bold">{h.lost}</span> {h.lost === 1 ? "prohra" : h.lost >= 2 && h.lost <= 4 ? "prohry" : "proher"}</span>
      </div>

      <p className="text-sm text-ink">
        {rivalryStory(h)}
        {stake && <span className="text-muted"> Celkem {stake}.</span>}
      </p>
      <button onClick={() => onChallenge(h.teamId)} className={`self-start ${h.lastResult === "L" ? PRIMARY_BUTTON : SECONDARY_BUTTON}`}>
        {h.lastResult === "L" ? "Vyzvat na odvetu" : "Vyzvat znovu"}
      </button>
    </div>
  );
}

/** Kolik chybí na místo nad sebou. Motivace, ne statistika. */
function tableMotivation(data: FriendliesData): string {
  const meId = data.me?.id;
  const mine = data.table.find((r) => r.teamId === meId);
  if (!mine) return "Odehraj přátelák a zapiš se do žebříčku.";
  if (mine.pos === 1) {
    const second = data.table[1];
    if (!second) return "Vedeš žebříček přáteláků.";
    const lead = mine.points - second.points;
    return lead > 0 ? `Vedeš žebříček o ${pocet(lead, "bod", "body", "bodů")}. Udrž to.` : "Vedeš žebříček, ale jen na skóre. Druhý ti dýchá na záda.";
  }
  const above = data.table[mine.pos - 2];
  const gap = above.points - mine.points;
  if (gap === 0) return `Na ${above.pos}. místo ti stačí lepší skóre.`;
  if (gap <= 3) return `Na ${above.pos}. místo ti chybí ${pocet(gap, "bod", "body", "bodů")}. Stačí jedna výhra.`;
  return `Na ${above.pos}. místo ti chybí ${pocet(gap, "bod", "body", "bodů")}.`;
}

/** Kolik rivalů ukázat hned; zbytek po rozbalení, ať žebříček a výsledky nezapadnou. */
const RIVALS_SHOWN = 6;

export function FriendlyRecord({ data, onChallenge }: { data: FriendliesData; onChallenge: (teamId: string) => void }) {
  const [showAllRivals, setShowAllRivals] = useState(false);
  const r = data.record;
  const o = r.overall;
  const color = data.me?.crest.primary ?? "#2D5F2D";
  const light = bestTextOn(color) === "dark";
  const txt = light ? "text-gray-900" : "text-white";
  const txtMuted = light ? "text-gray-600" : "text-white/70";
  const boxBg = light ? "bg-black/5" : "bg-white/10";
  const meId = data.me?.id;
  const shownTable = data.table.slice(0, 10);
  const mineOutside = data.table.find((t) => t.teamId === meId && t.pos > 10);

  return (
    <div className="space-y-5">
      {/* Karta v barvě klubu: kde stojím a co se teď děje */}
      <div className="card p-0 overflow-hidden">
        <div className="hero-gradient px-4 sm:px-5 py-4 sm:py-5" style={{ backgroundColor: color }}>
          <div className="flex items-center gap-3">
            <ClubCrest crest={data.me?.crest} size={52} />
            <div className="min-w-0">
              <div className={`font-heading font-extrabold text-xl leading-tight ${txt}`}>Přáteláky {data.me?.name ?? ""}</div>
              <div className={`text-sm mt-0.5 ${txtMuted}`}>{streakSentence(r)}</div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-4">
            {[
              { value: o.won, label: o.won === 1 ? "výhra" : o.won >= 2 && o.won <= 4 ? "výhry" : "výher" },
              { value: o.drawn, label: o.drawn === 1 ? "remíza" : o.drawn >= 2 && o.drawn <= 4 ? "remízy" : "remíz" },
              { value: o.lost, label: o.lost === 1 ? "prohra" : o.lost >= 2 && o.lost <= 4 ? "prohry" : "proher" },
            ].map((x) => (
              <div key={x.label} className={`${boxBg} rounded-soft py-2.5 text-center`}>
                <div className={`font-heading font-[800] text-3xl leading-none tabular-nums ${txt}`}>{x.value}</div>
                <div className={`text-sm mt-1 ${txtMuted}`}>{x.label}</div>
              </div>
            ))}
          </div>
        </div>
        {o.played > 0 && (
          <div className="px-4 sm:px-5 py-3 space-y-2.5">
            <div>
              <div className="text-sm text-muted mb-1">{r.form.length === 1 ? "Poslední přátelák" : `Posledních ${r.form.length} přáteláků`}</div>
              <div className="flex items-center gap-1 sm:gap-1.5">
                {r.form.map((f, i) => <FormChip key={i} result={f} />)}
              </div>
            </div>
            <div className="text-sm text-muted">
              Skóre <span className="font-heading font-bold text-ink tabular-nums">{o.goalsFor}:{o.goalsAgainst}</span>
              {r.biggestWin && (
                <> · nejvyšší výhra <span className="font-heading font-bold text-pitch-600 tabular-nums">{r.biggestWin.goalsFor}:{r.biggestWin.goalsAgainst}</span> s {r.biggestWin.opponent}</>
              )}
              {stakeText(o.stakeNet) && <> · <span className={`font-heading font-bold ${o.stakeNet > 0 ? "text-gold-700" : "text-card-red"}`}>{stakeText(o.stakeNet)}</span></>}
            </div>
          </div>
        )}
      </div>

      <div>
        <SectionLabel>Žebříček přáteláků v sezóně</SectionLabel>
        <div className="card p-0 overflow-hidden">
          <div className="px-4 py-3 text-sm font-heading font-bold text-ink border-b border-gray-100">{tableMotivation(data)}</div>
          {data.table.length === 0 ? (
            <div className="px-4 py-4 text-sm text-muted">V téhle sezóně se zatím žádný přátelák nehrál.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-gray-200 text-muted">
                  <th className="py-2.5 px-1.5 text-sm font-heading text-center w-9">#</th>
                  <th className="py-2.5 px-2 text-sm font-heading text-left">Klub</th>
                  <th className="py-2.5 px-1.5 text-sm font-heading text-center hidden sm:table-cell">Z</th>
                  <th className="py-2.5 px-1.5 text-sm font-heading text-center">V-R-P</th>
                  <th className="py-2.5 px-1.5 text-sm font-heading text-center hidden sm:table-cell">Skóre</th>
                  <th className="py-2.5 px-2 text-sm font-heading text-center w-10">B</th>
                </tr>
              </thead>
              <tbody>
                {[...shownTable, ...(mineOutside ? [mineOutside] : [])].map((t) => {
                  const mine = t.teamId === meId;
                  return (
                    <tr key={t.teamId} className={`border-b border-gray-50 ${mine ? "bg-pitch-50/60" : ""}`}>
                      <td className="py-2.5 px-1.5 text-center">
                        <span className={`font-heading font-[800] text-base tabular-nums ${t.pos === 1 ? "text-gold-500" : t.pos <= 3 ? "text-pitch-500" : "text-muted"}`}>{t.pos}</span>
                      </td>
                      <td className="py-2.5 px-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <ClubCrest crest={t.crest} size={24} />
                          <Link href={`/tym/${t.teamId}`} className={`font-heading text-base truncate hover:text-pitch-500 ${mine ? "font-[800] text-ink" : "font-bold text-ink"}`}>{t.name}</Link>
                        </div>
                      </td>
                      <td className="py-2.5 px-1.5 text-center tabular-nums text-muted hidden sm:table-cell">{t.played}</td>
                      <td className="py-2.5 px-1.5 text-center tabular-nums text-muted whitespace-nowrap">{t.won}-{t.drawn}-{t.lost}</td>
                      <td className="py-2.5 px-1.5 text-center tabular-nums hidden sm:table-cell">{t.goalsFor}:{t.goalsAgainst}</td>
                      <td className="py-2.5 px-2 text-center"><span className="font-heading font-[800] text-lg tabular-nums">{t.points}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {r.opponents.length > 0 && (
        <div>
          <SectionLabel>Rivalové</SectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(showAllRivals ? r.opponents : r.opponents.slice(0, RIVALS_SHOWN)).map((h) => (
              <RivalryCard key={h.teamId} h={h} me={data.me} onChallenge={onChallenge} />
            ))}
          </div>
          {r.opponents.length > RIVALS_SHOWN && (
            <button onClick={() => setShowAllRivals((v) => !v)} className={`w-full mt-3 ${SECONDARY_BUTTON}`}>
              {showAllRivals ? "Jen hlavní rivalové" : `Všichni rivalové (${r.opponents.length})`}
            </button>
          )}
        </div>
      )}

      {data.played.length > 0 && (
        <div>
          <SectionLabel>Poslední odehrané</SectionLabel>
          <div className="card p-0 overflow-hidden divide-y divide-gray-100">
            {data.played.map((f) => {
              const result = f.myScore == null || f.opponentScore == null ? null
                : f.myScore > f.opponentScore ? "W" : f.myScore < f.opponentScore ? "L" : "D";
              const tone = result === "W" ? "bg-pitch-500" : result === "L" ? "bg-card-red" : "bg-gray-400";
              return (
                <div key={f.id} className="flex items-center gap-3 px-3 py-2.5">
                  <div className={`w-14 shrink-0 rounded-control py-1.5 text-center font-heading font-[800] text-lg tabular-nums text-white ${tone}`}>
                    {f.myScore}:{f.opponentScore}
                  </div>
                  <ClubCrest crest={f.opponent.crest} size={28} />
                  <div className="flex-1 min-w-0">
                    <TeamLink id={f.opponent.id} name={f.opponent.name} />
                    <div className="text-sm text-muted truncate">
                      {f.date ? `${dayShort(f.date).day} · ` : ""}{venueText(f.venue, f.neutralVillage)}{f.stake > 0 ? ` · o ${formatCZK(f.stake)}` : ""}
                    </div>
                  </div>
                  {f.matchId && (
                    <Link href={`/zapas/${f.matchId}/zaznam`} className="text-sm font-heading font-bold text-pitch-600 hover:underline shrink-0">Záznam</Link>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

