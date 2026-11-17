"use client";
import { HeroBackdrop } from "@/components/ui/hero-backdrop";

import { useState } from "react";
import { pocet } from "@/lib/referee-info";
import { isLightColor, isNeutralExtreme } from "@/lib/team-color";
import { HeroStat, HeroStats, heroTone } from "@/components/ui/hero-kit";
import { DataTable, EntityCell, ListCard, ListRow, ScoreChip, ShowMore } from "@/components/ui";
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

/**
 * Rival jako řádek: vpravo kdo vede, pod jménem přetahovaná, bilance, příběh a výzva.
 * Řádek nemá href, protože v něm je odkaz na klub i tlačítko.
 */
function RivalryRow({ h, me, onChallenge }: { h: HeadToHead; me: FriendliesData["me"]; onChallenge: (teamId: string) => void }) {
  const head = rivalryHeadline(h);
  const myColor = barColor(me?.crest, "#2D5F2D");
  let theirColor = barColor(h.crest, "#9CA3AF");
  if (theirColor.toLowerCase() === myColor.toLowerCase()) theirColor = h.crest?.secondary && h.crest.secondary.toLowerCase() !== myColor.toLowerCase() ? h.crest.secondary : "#9CA3AF";
  const pct = (n: number) => `${(n / Math.max(1, h.played)) * 100}%`;
  const stake = stakeText(h.stakeNet);
  return (
    <ListRow
      title={<TeamLink id={h.teamId} name={h.name} />}
      trailing={<span className={`text-body font-extrabold whitespace-nowrap tabular-nums ${head.tone}`}>{head.text}</span>}
      detail={
        <>
          {/* Přetahovaná: vlevo moje výhry v mé barvě, vpravo jejich v jejich, uprostřed remízy. */}
          <span className="flex items-center gap-2 mt-1.5" aria-label={`${h.won} výher, ${h.drawn} remíz, ${h.lost} proher`}>
            <ClubCrest crest={me?.crest} size={24} />
            <span className="flex-1 h-3 rounded-full overflow-hidden flex bg-black/5">
              <span style={{ width: pct(h.won), backgroundColor: myColor }} />
              <span style={{ width: pct(h.drawn) }} className="bg-gray-300" />
              <span style={{ width: pct(h.lost), backgroundColor: theirColor }} />
            </span>
            <ClubCrest crest={h.crest} size={24} />
          </span>
          <span className="flex justify-between gap-2 mt-1 tabular-nums">
            <span><span className="font-bold text-ink">{h.won}</span> {h.won === 1 ? "výhra" : h.won >= 2 && h.won <= 4 ? "výhry" : "výher"}</span>
            <span className="text-muted text-center">{pocet(h.drawn, "remíza", "remízy", "remíz")} · skóre {h.goalsFor}:{h.goalsAgainst}</span>
            <span><span className="font-bold text-ink">{h.lost}</span> {h.lost === 1 ? "prohra" : h.lost >= 2 && h.lost <= 4 ? "prohry" : "proher"}</span>
          </span>
          <span className="block mt-1.5 text-ink">
            {rivalryStory(h)}
            {stake && <span className="text-muted"> Celkem {stake}.</span>}
          </span>
          <span className="block mt-2.5">
            <button onClick={() => onChallenge(h.teamId)} className={h.lastResult === "L" ? PRIMARY_BUTTON : SECONDARY_BUTTON}>
              {h.lastResult === "L" ? "Vyzvat na odvetu" : "Vyzvat znovu"}
            </button>
          </span>
        </>
      } />
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
  const tone = heroTone(color);
  const meId = data.me?.id;
  const shownTable = data.table.slice(0, 10);
  const mineOutside = data.table.find((t) => t.teamId === meId && t.pos > 10);

  return (
    <div className="space-y-5">
      {/* Karta v barvě klubu: kde stojím a co se teď děje */}
      <div className="card p-0 overflow-hidden">
        <div className="hero-gradient hero-detail px-4 sm:px-5 py-3 sm:py-5" style={{ backgroundColor: color }}>
        <HeroBackdrop primary={color} secondary={data.me?.crest.secondary} pattern={data.me?.crest.pattern ?? null} />
          <div className="flex flex-wrap items-center gap-x-3 sm:gap-x-4 gap-y-2 sm:gap-y-3">
            <ClubCrest crest={data.me?.crest} size={52} />
            <div className="flex-1 min-w-0">
              <div className={`font-heading font-extrabold text-lg sm:text-2xl leading-tight ${tone.text}`}>Přáteláky {data.me?.name ?? ""}</div>
              <div className={`text-sm mt-0.5 ${tone.muted}`}>{streakSentence(r)}</div>
            </div>
            <HeroStats tone={tone}>
              {[
                { value: o.won, label: o.won === 1 ? "výhra" : o.won >= 2 && o.won <= 4 ? "výhry" : "výher" },
                { value: o.drawn, label: o.drawn === 1 ? "remíza" : o.drawn >= 2 && o.drawn <= 4 ? "remízy" : "remíz" },
                { value: o.lost, label: o.lost === 1 ? "prohra" : o.lost >= 2 && o.lost <= 4 ? "prohry" : "proher" },
              ].map((x) => (
                <HeroStat key={x.label} tone={tone} label={x.label}>
                  <span className="font-heading font-extrabold text-xl sm:text-3xl tabular-nums leading-none">{x.value}</span>
                </HeroStat>
              ))}
            </HeroStats>
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
        <ListCard title="Žebříček přáteláků v sezóně">
          <div className="px-4 py-3 text-body font-bold text-ink border-b border-line-soft">{tableMotivation(data)}</div>
          <DataTable
            rows={[...shownTable, ...(mineOutside ? [mineOutside] : [])]} rowKey={(t) => t.teamId}
            rowHref={(t) => `/tym/${t.teamId}`}
            rowTone={(t) => ({ own: t.teamId === meId })}
            empty="V téhle sezóně se zatím žádný přátelák nehrál. Vyzvi někoho a žebříček otevřeš ty."
            columns={[
              { key: "pos", header: "#", width: "w-10", align: "center",
                cell: (t) => <span className={`font-bold ${t.pos === 1 ? "text-gold-700" : "text-muted"}`}>{t.pos}</span> },
              { key: "team", header: "Klub", align: "left",
                cell: (t) => <EntityCell leading={<ClubCrest crest={t.crest} size={24} />} name={t.name} bold={t.teamId === meId}
                  meta={`${t.won}-${t.drawn}-${t.lost} · ${t.goalsFor}:${t.goalsAgainst}`} metaMobileOnly /> },
              { key: "played", header: "Z", title: "Zápasy", width: "w-10", cell: (t) => t.played },
              { key: "record", header: "V-R-P", width: "w-20", priority: 2, cell: (t) => `${t.won}-${t.drawn}-${t.lost}` },
              { key: "score", header: "Skóre", width: "w-16", priority: 2, cell: (t) => `${t.goalsFor}:${t.goalsAgainst}` },
              { key: "points", header: "Body", width: "w-14", emphasis: true, cell: (t) => t.points },
            ]} />
        </ListCard>
      </div>

      {r.opponents.length > 0 && (
        <ListCard title="Rivalové" count={r.opponents.length} className="overflow-hidden">
          {/* Od 640 px po dvou vedle sebe jako dřív karty, jinak by se pruh přetahované roztáhl přes celou šířku. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 -mb-px sm:[&>*:nth-child(odd)]:border-r sm:[&>*:nth-child(odd)]:border-line-soft">
            {(showAllRivals ? r.opponents : r.opponents.slice(0, RIVALS_SHOWN)).map((h) => (
              <RivalryRow key={h.teamId} h={h} me={data.me} onChallenge={onChallenge} />
            ))}
          </div>
          {/* Zbytek najednou, jako dřív tlačítko „Všichni rivalové“. */}
          <ShowMore shown={showAllRivals ? r.opponents.length : Math.min(RIVALS_SHOWN, r.opponents.length)}
            total={r.opponents.length} step={r.opponents.length - RIVALS_SHOWN}
            onMore={() => setShowAllRivals(true)} />
        </ListCard>
      )}

      {data.played.length > 0 && (
        <ListCard title="Poslední odehrané" count={data.played.length}>
          {data.played.map((f) => {
            const result = f.myScore == null || f.opponentScore == null ? null
              : f.myScore > f.opponentScore ? "W" : f.myScore < f.opponentScore ? "L" : "D";
            return (
              <ListRow key={f.id} href={f.matchId ? `/zapas/${f.matchId}/zaznam` : undefined}
                leading={<ClubCrest crest={f.opponent.crest} size={30} />}
                title={f.opponent.name}
                meta={`${f.date ? `${dayShort(f.date).day} · ` : ""}${venueText(f.venue, f.neutralVillage)}${f.stake > 0 ? ` · o ${formatCZK(f.stake)}` : ""}`}
                trailing={result
                  ? <ScoreChip result={result}>{f.myScore}:{f.opponentScore}</ScoreChip>
                  : <span className="text-meta text-muted">-</span>} />
            );
          })}
        </ListCard>
      )}
    </div>
  );
}

