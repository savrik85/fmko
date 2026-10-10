"use client";

/**
 * Záložka Rozbor v Kádru: asistent trenéra rozebere kádr podle toho, jak se v zápase
 * doopravdy hraje (model rolí v enginu). Jen radí, nic nemění.
 *
 * Kompozice: krátký přehled, podrobnosti až na klepnutí (karta pod přehledem, žádné okno).
 *  1. Verdikt asistenta: dvě tři věty, co s kádrem udělat.
 *  2. Řady proti lize: čtyři řádky (měřák síly, verdikt, co chybí). Klepnutím se pod
 *     přehledem ukáže karta řady: vlastnosti proti lize, všichni hráči postu, posila.
 *  3. Kádr ve čtyřech číslech; klepnutím věkový graf, kdo roste, mladí a opory.
 *  4. Styl a upozornění, obojí sbalené.
 *
 * Rozbor je o kádru, ne o tom, kdo zrovna hraje: řady měří server na nejlepší jedenáctce
 * ze zdravých hráčů, hráči postu jsou seřazení od nejlepšího.
 *
 * Přesnost počítá server podle asistenta; tady se jen kreslí. Bez asistenta je záložka
 * zamčená a odkazuje do Zaměstnanců.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Spinner } from "@/components/ui";
import { FaceAvatar } from "@/components/players/face-avatar";
import { RATING_WEIGHTS } from "@okresni-masina/shared";

type Slot = "GK" | "DEF" | "MID" | "FWD";
type LineVerdict = "best" | "top" | "aboveAverage" | "average" | "belowAverage" | "bottom" | "worst";
type FitVerdict = "great" | "good" | "manageable" | "poor";
type AssistantLevel = "weak" | "average" | "good" | "excellent";
type WarningKind = "injured" | "outOfPosition" | "overweight" | "tired" | "lowStamina" | "inexperienced";
type AttrVerdict = "strong" | "even" | "weak";

type TextPart =
  | { kind: "text"; text: string }
  | { kind: "player"; id: string; name: string }
  | { kind: "team"; id: string; name: string };

interface AssistantInfo {
  name: string;
  female: boolean;
  level: AssistantLevel;
  note: string;
  avatar: Record<string, unknown> | null;
}

interface LineReport {
  line: Slot;
  label: string;
  verdict: LineVerdict;
  vague: boolean;
  text: TextPart[];
  bestTeam: { id: string; name: string } | null;
}

interface Insight {
  aspect: string;
  line: Slot | null;
  scope: "league" | "top" | "bottom";
  title: string;
  text: TextPart[];
}

interface Reinforcement {
  line: Slot;
  priority: "high" | "medium" | "low";
  text: TextPart[];
  attributes: string[];
}

interface LinePlayer {
  id: string;
  name: string;
  age: number | null;
  starter: boolean;
  injured: boolean;
  outOfPosition: boolean;
  values: Array<{ skill: string; value: number; verdict: AttrVerdict }>;
}

interface LineTable {
  line: Slot;
  attributes: Array<{ skill: string; ours: number; league: number; top: number | null; verdict: AttrVerdict }>;
  players: LinePlayer[];
  lookFor: TextPart[];
}

interface Outlook {
  verdict: TextPart[];
  ages: { under21: number; prime: number; over30: number; average: number; leagueAverage: number };
  experience: { ours: number; league: number; verdict: AttrVerdict };
  growing: Array<{ id: string; name: string; age: number | null; pace: "fast" | "steady" }>;
  veterans: Array<{ id: string; name: string; age: number | null }>;
  youngsters: Array<{ id: string; name: string; age: number | null; starter: boolean }>;
  squadAges?: Array<{ age: number; starter: boolean }>;
}

interface ReadyAnalysis {
  status: "ready";
  assistant: AssistantInfo;
  headline?: TextPart[];
  basis: { source: "lineup" | "best11"; formation: string };
  lines: LineReport[];
  strengths: Insight[];
  weaknesses: Insight[];
  reinforcements: Reinforcement[];
  style: {
    summary: string;
    tactics: Array<{ tactic: string; label: string; verdict: FitVerdict; recommended: boolean; reason: string | null }>;
    hardness: { verdict: FitVerdict; text: string };
    formation: { formation: string; familiarity: "high" | "medium" | "low"; text: string };
  };
  warnings: Array<{ kind: WarningKind; text: TextPart[] }>;
  lineTables?: LineTable[];
  outlook?: Outlook;
}

export type SquadAnalysisResponse =
  | { status: "locked" }
  | { status: "shortSquad" | "noLeague"; assistant: AssistantInfo }
  | ReadyAnalysis;

/** Odhad skauta z Kádru (`potencial-kadru`), třeba „Výhled: sestava áčka“. */
export type SquadPotential = Map<string, { slovne: string | null }>;

// ── Slovník ─────────────────────────────────────────────────────────────────

type Tone = "good" | "mid" | "bad";

/** Síla řady: text, tón a počet dílků na měřáku (1 až 5). */
const VERDICT: Record<LineVerdict, { label: string; tone: Tone; level: number }> = {
  best: { label: "Nejlepší v lize", tone: "good", level: 5 },
  top: { label: "Mezi nejlepšími", tone: "good", level: 5 },
  aboveAverage: { label: "Nad průměrem", tone: "good", level: 4 },
  average: { label: "Průměr ligy", tone: "mid", level: 3 },
  belowAverage: { label: "Pod průměrem", tone: "bad", level: 2 },
  bottom: { label: "Mezi nejslabšími", tone: "bad", level: 1 },
  worst: { label: "Nejslabší v lize", tone: "bad", level: 1 },
};

/** Slabý asistent mluví jen třemi stupni. */
const VAGUE_VERDICT: Partial<Record<LineVerdict, string>> = {
  aboveAverage: "Spíš silná",
  average: "Asi průměr",
  belowAverage: "Spíš slabá",
};

const TONE_TEXT: Record<Tone, string> = { good: "text-pitch-600", mid: "text-gold-700", bad: "text-card-red" };
const TONE_FILL: Record<Tone, string> = { good: "bg-pitch-400", mid: "bg-gold-500", bad: "bg-card-red" };

const LINE_LABEL: Record<Slot, string> = { GK: "Brankář", DEF: "Obrana", MID: "Záloha", FWD: "Útok" };
const LINE_ORDER: Slot[] = ["GK", "DEF", "MID", "FWD"];

/** Názvy vlastností jako v profilu hráče; u brankáře fotbalově (obrana = postavení…). */
const SKILL_NAME: Record<string, string> = {
  speed: "Rychlost", technique: "Technika", shooting: "Střelba", passing: "Přihrávky", heading: "Hlavičky",
  defense: "Obrana", goalkeeping: "Chytání", vision: "Přehled", experience: "Zkušenost", creativity: "Kreativita",
  setPieces: "Standardky", stamina: "Výdrž", strength: "Síla",
};
const KEEPER_SKILL_NAME: Record<string, string> = {
  defense: "Postavení", speed: "Vybíhání", heading: "Hra ve vzduchu", creativity: "Komunikace", passing: "Rozehrávka",
};
/** Server posílá u posily názvy z profilu; u brankáře se přeloží na brankářské. */
const KEEPER_UI_NAME: Record<string, string> = {
  Obrana: "Postavení", Rychlost: "Vybíhání", Hlavičky: "Hra ve vzduchu", Kreativita: "Komunikace", Přihrávky: "Rozehrávka",
};
function skillName(skill: string, line: Slot): string {
  return (line === "GK" && KEEPER_SKILL_NAME[skill]) || SKILL_NAME[skill] || skill;
}

const FIT: Record<FitVerdict, { label: string; className: string }> = {
  great: { label: "Sedí výborně", className: "bg-pitch-100 text-pitch-800" },
  good: { label: "Sedí", className: "bg-pitch-50 text-pitch-700" },
  manageable: { label: "Zvládneme", className: "bg-gold-100 text-gold-700" },
  poor: { label: "Nesedí", className: "bg-card-red/10 text-card-red" },
};

/** Tvrdost hry čte stejný verdikt jinak: „sedí“ tu znamená „jde to, ale opatrně“. */
const HARDNESS: Record<FitVerdict, { label: string; className: string }> = {
  great: { label: "Máme na to", className: "bg-pitch-100 text-pitch-800" },
  good: { label: "Opatrně", className: "bg-pitch-50 text-pitch-700" },
  manageable: { label: "Spíš ne", className: "bg-gold-100 text-gold-700" },
  poor: { label: "Nehrát", className: "bg-card-red/10 text-card-red" },
};

const FAMILIARITY: Record<"high" | "medium" | "low", { label: string; className: string }> = {
  high: { label: "Sehrané", className: "bg-pitch-100 text-pitch-800" },
  medium: { label: "Napůl sehrané", className: "bg-gold-100 text-gold-700" },
  low: { label: "Nesehrané", className: "bg-card-red/10 text-card-red" },
};

const WARNING_ICON: Record<WarningKind, { icon: string; label: string }> = {
  injured: { icon: "🩹", label: "Zranění" },
  outOfPosition: { icon: "🔀", label: "Mimo post" },
  overweight: { icon: "⚖️", label: "Nadváha" },
  tired: { icon: "😮‍💨", label: "Únava" },
  lowStamina: { icon: "🔋", label: "Výdrž" },
  inexperienced: { icon: "🐣", label: "Nováček" },
};

const LEVEL: Record<AssistantLevel, { label: string; dots: number }> = {
  weak: { label: "hrubý odhad", dots: 1 },
  average: { label: "slušný odhad", dots: 2 },
  good: { label: "dobrý odhad", dots: 3 },
  excellent: { label: "přesný odhad", dots: 4 },
};

const PILL = "inline-flex items-center px-2 py-0.5 rounded-tight text-sm font-heading font-bold whitespace-nowrap";

// ── Drobné komponenty ──────────────────────────────────────────────────────

/** Věta s odkazy na hráče a týmy, jména tučně a v plné velikosti jako jinde v Kádru. */
function RichText({ parts }: { parts: TextPart[] }) {
  return (
    <>
      {parts.map((p, i) => {
        if (p.kind === "text") return <span key={i}>{p.text}</span>;
        const href = p.kind === "player" ? `/hrac/${p.id}` : `/tym/${p.id}`;
        return (
          <Link key={i} href={href}
            className="font-heading font-bold text-base text-ink hover:text-pitch-500 underline decoration-pitch-500/20 transition-colors">
            {p.name}
          </Link>
        );
      })}
    </>
  );
}

function PlayerLink({ id, name, className = "" }: { id: string; name: string; className?: string }) {
  return (
    <Link href={`/hrac/${id}`} className={`font-heading font-bold text-base text-ink hover:text-pitch-500 transition-colors ${className}`}>
      {name}
    </Link>
  );
}

function AssistantFace({ assistant, size }: { assistant: AssistantInfo; size: number }) {
  return (
    <div className="shrink-0 rounded-control overflow-hidden bg-paper flex items-center justify-center" style={{ width: size, height: size }}>
      {assistant.avatar
        ? <FaceAvatar faceConfig={assistant.avatar} size={size - 6} />
        : <span className="font-heading font-bold text-lg">{assistant.name.charAt(0)}</span>}
    </div>
  );
}

function LevelDots({ level }: { level: AssistantLevel }) {
  const l = LEVEL[level];
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-muted" title="Jak přesně asistent kádr odhaduje">
      <span className="tracking-[0.2em] text-pitch-500" aria-hidden>
        {"●".repeat(l.dots)}<span className="text-muted-light">{"●".repeat(4 - l.dots)}</span>
      </span>
      {l.label}
    </span>
  );
}

/** Měřák síly řady: pět dílků jako signál, plné podle místa v lize. */
function PowerMeter({ verdict }: { verdict: LineVerdict }) {
  const v = VERDICT[verdict];
  return (
    <span className="inline-flex items-end gap-[3px] h-5" aria-hidden>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={`w-[5px] rounded-[2px] ${i <= v.level ? TONE_FILL[v.tone] : "bg-gray-200"}`}
          style={{ height: `${8 + i * 2.4}px` }}
        />
      ))}
    </span>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 20 20" className={`w-5 h-5 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden>
      <path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Plus a minus řady: dvě nejsilnější a dvě nejslabší klíčové vlastnosti proti lize,
 * vážené tím, jak moc vlastnost na postu rozhoduje (stejně jako věta, co řadě chybí).
 */
function lineHighlights(table: LineTable | undefined): { plus: string[]; minus: string[] } {
  if (!table) return { plus: [], minus: [] };
  const weights = RATING_WEIGHTS[table.line] as Record<string, number>;
  const gap = (a: LineTable["attributes"][number]) => (a.ours - a.league) * (weights[a.skill] ?? 1);
  const byGap = [...table.attributes].sort((a, b) => gap(b) - gap(a));
  return {
    plus: byGap.filter((a) => a.verdict === "strong").slice(0, 2).map((a) => a.skill),
    minus: byGap.filter((a) => a.verdict === "weak").reverse().slice(0, 2).map((a) => a.skill),
  };
}

function SkillChip({ label, positive }: { label: string; positive: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-tight text-sm font-bold whitespace-nowrap ${
      positive ? "bg-pitch-50 text-pitch-700" : "bg-card-red/10 text-card-red"
    }`}>
      <span aria-hidden>{positive ? "+" : "−"}</span>
      {label}
    </span>
  );
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0";
}

// ── 1. Verdikt ─────────────────────────────────────────────────────────────

function Verdict({ r }: { r: ReadyAnalysis }) {
  const headline = r.headline && r.headline.length > 0 ? r.headline : null;
  return (
    <section className="card p-4 sm:p-6">
      <div className="flex items-center gap-3">
        <AssistantFace assistant={r.assistant} size={48} />
        <div className="min-w-0">
          <div className="text-sm text-muted leading-tight">Asistent trenéra</div>
          <div className="font-heading font-bold text-base leading-tight truncate">{r.assistant.name}</div>
          <LevelDots level={r.assistant.level} />
        </div>
      </div>
      {headline && (
        <p className="font-heading font-bold text-lg sm:text-xl leading-snug text-ink mt-4 max-w-[62ch]">
          <RichText parts={headline} />
        </p>
      )}
    </section>
  );
}

// ── 2. Řady ────────────────────────────────────────────────────────────────

/**
 * Klíčové vlastnosti řady proti lize. Pruh = průměr naší nejlepší jedenáctky (0 až 100),
 * svislá čárka = průměr ligy na stejném postu. Seřazeno od největšího náskoku po
 * největší ztrátu, takže slabiny jsou vždy dole a nemusí se hledat.
 */
function AttributeBars({ table }: { table: LineTable }) {
  const rows = [...table.attributes].sort((a, b) => (b.ours - b.league) - (a.ours - a.league));
  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h4 className="font-heading font-bold text-base">Nejlepší jedenáctka proti lize</h4>
        <span className="flex items-center gap-1.5 text-sm text-muted whitespace-nowrap">
          <span className="relative inline-block w-5 h-2.5" aria-hidden>
            <span className="absolute left-1/2 top-0 w-[2px] h-full rounded-full bg-ink" />
          </span>
          liga
        </span>
      </div>
      <ul className="space-y-3">
        {rows.map((a) => {
          const diff = a.ours - a.league;
          const fill = a.verdict === "strong" ? "bg-pitch-400" : a.verdict === "weak" ? "bg-card-red" : "bg-gray-400";
          const diffClass = a.verdict === "strong" ? "text-pitch-600" : a.verdict === "weak" ? "text-card-red" : "text-muted";
          return (
            <li key={a.skill} className="grid grid-cols-[7rem_minmax(0,1fr)_1.75rem_2.25rem] items-center gap-2">
              <span className="text-sm text-ink-light truncate">{skillName(a.skill, table.line)}</span>
              <span className="relative h-2.5 rounded-full bg-gray-200/70" title={`Průměr ligy ${a.league}`}>
                <span className={`absolute inset-y-0 left-0 rounded-full ${fill}`} style={{ width: `${Math.min(100, Math.max(2, a.ours))}%` }} />
                <span className="absolute -top-[3px] w-[2px] h-4 rounded-full bg-ink" style={{ left: `calc(${Math.min(100, a.league)}% - 1px)` }} />
              </span>
              <span className="text-right font-heading font-bold text-base tabular-nums">{a.ours}</span>
              <span className={`text-right text-sm font-bold tabular-nums ${diffClass}`}>{signed(diff)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Hráč postu: dvě vlastnosti, ve kterých nad ligou nejvíc vyniká, a dvě, ve kterých
 * nejvíc ztrácí. Rozdíl proti lize se váží tím, jak moc vlastnost na postu rozhoduje.
 */
function PlayerRow({ p, table }: { p: LinePlayer; table: LineTable }) {
  const weights = RATING_WEIGHTS[table.line] as Record<string, number>;
  const league = new Map(table.attributes.map((a) => [a.skill, a.league]));
  const gap = (v: LinePlayer["values"][number]) => (v.value - (league.get(v.skill) ?? v.value)) * (weights[v.skill] ?? 1);
  const byGap = [...p.values].sort((a, b) => gap(b) - gap(a));
  const plus = byGap.filter((v) => v.verdict === "strong").slice(0, 2);
  const minus = byGap.filter((v) => v.verdict === "weak").reverse().slice(0, 2);
  return (
    <li className="py-2.5 border-t border-gray-200/70 first:border-t-0">
      <div className="flex items-baseline gap-2 min-w-0">
        <PlayerLink id={p.id} name={p.name} className="truncate" />
        <span className="shrink-0 text-sm text-muted">{p.age !== null ? `${p.age} let` : ""}</span>
        {p.injured && <span className={`${PILL} shrink-0 bg-card-red/10 text-card-red`}>Zraněný</span>}
      </div>
      {(plus.length > 0 || minus.length > 0) && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {plus.map((v) => <SkillChip key={v.skill} label={`${skillName(v.skill, table.line)} ${v.value}`} positive />)}
          {minus.map((v) => <SkillChip key={v.skill} label={`${skillName(v.skill, table.line)} ${v.value}`} positive={false} />)}
        </div>
      )}
    </li>
  );
}

const PLAYERS_TITLE: Record<Slot, string> = { GK: "Brankáři v kádru", DEF: "Obránci v kádru", MID: "Záložníci v kádru", FWD: "Útočníci v kádru" };

function LinePlayers({ table }: { table: LineTable }) {
  return (
    <div>
      <h4 className="font-heading font-bold text-base">{PLAYERS_TITLE[table.line]}</h4>
      <ul>{table.players.map((p) => <PlayerRow key={p.id} p={p} table={table} />)}</ul>
      <p className="text-sm text-muted mt-2">Od nejlepšího. Zeleně co má hráč nad průměrem ligy na svém postu, červeně co pod ním.</p>
    </div>
  );
}

function InsightRow({ item, positive }: { item: Insight; positive: boolean }) {
  return (
    <li className="flex gap-2.5">
      <span
        className={`shrink-0 mt-0.5 w-5 h-5 rounded-full flex items-center justify-center font-heading font-[800] text-sm leading-none ${
          positive ? "bg-pitch-100 text-pitch-700" : "bg-card-red/10 text-card-red"
        }`}
        aria-label={positive ? "Síla" : "Slabina"}
      >
        {positive ? "+" : "−"}
      </span>
      <div className="min-w-0">
        <div className="font-heading font-bold text-base leading-tight">{item.title}</div>
        <p className="text-base text-ink-light leading-snug mt-0.5"><RichText parts={item.text} /></p>
      </div>
    </li>
  );
}

function Insights({ title, strengths, weaknesses }: { title: string; strengths: Insight[]; weaknesses: Insight[] }) {
  if (strengths.length === 0 && weaknesses.length === 0) return null;
  return (
    <div>
      <h4 className="font-heading font-bold text-base mb-2.5">{title}</h4>
      <ul className="space-y-3">
        {weaknesses.map((w) => <InsightRow key={`w-${w.scope}-${w.aspect}`} item={w} positive={false} />)}
        {strengths.map((s) => <InsightRow key={`s-${s.scope}-${s.aspect}`} item={s} positive />)}
      </ul>
    </div>
  );
}

/** Rozbalená řada: diagnóza, vlastnosti proti lize, hráči postu, posila. */
function LineDetail({ line, table, signing, strengths, weaknesses }: {
  line: LineReport;
  table: LineTable | undefined;
  signing: Reinforcement | undefined;
  strengths: Insight[];
  weaknesses: Insight[];
}) {
  return (
    <div className="px-4 sm:px-6 pb-5 pt-2 space-y-5">
      <div className="space-y-1">
        {table && <p className="font-heading font-bold text-base leading-snug"><RichText parts={table.lookFor} /></p>}
        <p className="text-sm text-muted"><RichText parts={line.text} /></p>
      </div>

      {table && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-6">
          <AttributeBars table={table} />
          <LinePlayers table={table} />
        </div>
      )}

      {signing && (
        <div className="rounded-card bg-paper p-3 sm:p-4">
          <h4 className="font-heading font-bold text-base">
            {signing.priority === "high" ? "Posila sem by přidala nejvíc" : "Kdyby posila"}
          </h4>
          <p className="text-base text-ink-light leading-snug mt-1"><RichText parts={signing.text} /></p>
          {signing.attributes.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {signing.attributes.map((a) => <SkillChip key={a} label={line.line === "GK" ? KEEPER_UI_NAME[a] ?? a : a} positive />)}
            </div>
          )}
        </div>
      )}

      <Insights title="Čeho si asistent všiml" strengths={strengths} weaknesses={weaknesses} />
    </div>
  );
}

/** Řádek přehledu: název, měřák a verdikt, pod tím jednou větou co chybí. Klepnutím detail. */
function LineRow({ line, table, selected, onSelect }: {
  line: LineReport; table: LineTable | undefined; selected: boolean; onSelect: () => void;
}) {
  const v = VERDICT[line.verdict];
  const label = (line.vague && VAGUE_VERDICT[line.verdict]) || v.label;
  const { minus } = lineHighlights(table);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-expanded={selected}
      className={`w-full text-left px-4 sm:px-6 py-3 block transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pitch-500 ${
        selected ? "bg-pitch-50" : "hover:bg-paper/60"
      }`}
    >
      <span className="flex items-center gap-3">
        <span className="font-heading font-bold text-base w-[4.5rem] shrink-0">{LINE_LABEL[line.line]}</span>
        <PowerMeter verdict={line.verdict} />
        <span className={`ml-auto text-sm font-heading font-bold whitespace-nowrap ${TONE_TEXT[v.tone]}`}>{label}</span>
        <Chevron open={selected} />
      </span>
      <span className="block mt-0.5 text-sm text-ink-light">
        {minus.length > 0
          ? <>Chybí: {minus.map((s) => skillName(s, line.line).toLowerCase()).join(", ")}</>
          : <span className="text-pitch-600">Bez slabin proti lize</span>}
      </span>
    </button>
  );
}

/** Detail vybrané řady jako samostatná karta pod přehledem. */
function LineCard({ line, children, onClose }: { line: LineReport; children: React.ReactNode; onClose: () => void }) {
  const v = VERDICT[line.verdict];
  const label = (line.vague && VAGUE_VERDICT[line.verdict]) || v.label;
  return (
    <section className="card">
      <div className="px-4 sm:px-6 pt-4 flex items-center gap-3">
        <h3 className="font-heading font-bold text-lg leading-tight">{LINE_LABEL[line.line]}</h3>
        <span className={`text-sm font-heading font-bold ${TONE_TEXT[v.tone]}`}>{label}</span>
        <button type="button" onClick={onClose} aria-label="Zavřít detail" className="ml-auto text-muted hover:text-ink text-xl leading-none px-1">✕</button>
      </div>
      {children}
    </section>
  );
}

// ── 3. Perspektiva kádru ───────────────────────────────────────────────────

const AGE_GROUP = {
  young: { full: "bg-pitch-300" },
  prime: { full: "bg-pitch-500" },
  old: { full: "bg-gold-500" },
};
function ageGroup(age: number) {
  return age <= 21 ? AGE_GROUP.young : age >= 30 ? AGE_GROUP.old : AGE_GROUP.prime;
}

/**
 * Věkový graf kádru: sloupec za každý ročník. Plná čára = průměrný věk naší nejlepší
 * jedenáctky, čárkovaná = jedenáctek soupeřů.
 */
function AgeChart({ ages, xiAverage, leagueAverage }: { ages: Array<{ age: number; starter: boolean }>; xiAverage: number; leagueAverage: number }) {
  const minAge = Math.min(17, ...ages.map((a) => a.age));
  const maxAge = Math.max(35, ...ages.map((a) => a.age));
  const years = Array.from({ length: maxAge - minAge + 1 }, (_, i) => minAge + i);
  const counts = new Map(years.map((y) => [y, { starters: 0, others: 0 }]));
  for (const a of ages) {
    const c = counts.get(a.age);
    if (c) { if (a.starter) c.starters++; else c.others++; }
  }
  const peak = Math.max(3, ...[...counts.values()].map((c) => c.starters + c.others));
  const span = years.length;
  const pos = (age: number) => `${((age - minAge + 0.5) / span) * 100}%`;
  const height = 88;
  return (
    <div>
      <div className="relative" style={{ height }}>
        <div className="absolute inset-0 flex items-end gap-[2px]">
          {years.map((y) => {
            const c = counts.get(y)!;
            const g = ageGroup(y);
            const total = c.starters + c.others;
            return (
              <div key={y} className="flex-1 h-full flex flex-col justify-end" title={total > 0 ? `${y} let: ${total}` : undefined}>
                {total > 0 && <div className={`${g.full} rounded-t-[3px]`} style={{ height: (total / peak) * height }} />}
              </div>
            );
          })}
        </div>
        <div className="absolute top-0 bottom-0 border-l-2 border-dashed border-muted" style={{ left: pos(leagueAverage) }} />
        <div className="absolute top-0 bottom-0 border-l-2 border-ink" style={{ left: pos(xiAverage) }} />
      </div>
      <div className="relative h-5 border-t border-gray-200 text-sm text-muted">
        {years.filter((y) => y % 5 === 0).map((y) => (
          <span key={y} className="absolute top-0.5 -translate-x-1/2 tabular-nums" style={{ left: pos(y) }}>{y}</span>
        ))}
      </div>
    </div>
  );
}

function PersonList({ title, items, empty }: { title: string; items: Array<{ id: string; name: string; note: string; accent?: string }>; empty: string }) {
  return (
    <div className="min-w-0">
      <h4 className="font-heading font-bold text-base mb-1">{title}</h4>
      {items.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <ul>
          {items.map((p) => (
            <li key={p.id} className="flex items-baseline gap-2 py-1.5 border-t border-gray-100 first:border-t-0 min-w-0">
              <PlayerLink id={p.id} name={p.name} className="truncate" />
              <span className="ml-auto shrink-0 text-sm text-right">
                <span className="text-muted">{p.note}</span>
                {p.accent && <span className="text-pitch-600 font-bold"> {p.accent}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function yearsCs(v: number): string {
  return v.toFixed(1).replace(".", ",");
}

/** „Výhled: možná sestava áčka“ → „možná sestava áčka“: odhad skauta k mladému hráči. */
function potentialNote(slovne: string | null | undefined): string | undefined {
  if (!slovne) return undefined;
  return slovne.replace(/^Výhled:\s*/, "");
}

/** Kádr ve čtyřech číslech; klepnutím se pod ním otevře věkový graf a jména. */
function SquadSummary({ outlook, open, onToggle }: { outlook: Outlook; open: boolean; onToggle: () => void }) {
  const { ages, experience } = outlook;
  const expColor = experience.verdict === "strong" ? "text-pitch-600" : experience.verdict === "weak" ? "text-card-red" : "text-ink";
  const stats = [
    { value: yearsCs(ages.average), label: "věk", sub: `liga ${yearsCs(ages.leagueAverage)}`, className: "text-ink" },
    { value: String(experience.ours), label: "zkušenost", sub: `liga ${experience.league}`, className: expColor },
    { value: String(ages.under21), label: "do 21 let", sub: "hráčů", className: "text-pitch-600" },
    { value: String(ages.over30), label: "30 a víc", sub: "hráčů", className: "text-gold-700" },
  ];
  return (
    <section className="card">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={`w-full text-left px-4 sm:px-6 py-4 block transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pitch-500 ${
          open ? "bg-pitch-50" : "hover:bg-paper/60"
        }`}
      >
        <span className="flex items-center gap-3">
          <span className="font-heading font-bold text-lg leading-tight">Kádr</span>
          <span className="text-sm text-muted">věk, zkušenost, mladí</span>
          <span className="ml-auto"><Chevron open={open} /></span>
        </span>
        <span className="mt-3 grid grid-cols-4 gap-2">
          {stats.map((s) => (
            <span key={s.label} className="block min-w-0 text-center">
              <span className={`block font-heading font-[800] text-xl sm:text-2xl leading-tight tabular-nums ${s.className}`}>{s.value}</span>
              <span className="block text-sm text-ink-light leading-tight">{s.label}</span>
              <span className="block text-sm text-muted leading-tight">{s.sub}</span>
            </span>
          ))}
        </span>
      </button>
    </section>
  );
}

function OutlookDetail({ outlook, potential, teamStrengths, teamWeaknesses, onClose }: {
  outlook: Outlook; potential: SquadPotential | undefined; teamStrengths: Insight[]; teamWeaknesses: Insight[]; onClose: () => void;
}) {
  const { ages } = outlook;
  const hasScout = potential ? [...potential.values()].some((p) => p.slovne) : false;
  const groups = [
    { label: "do 21 let", n: ages.under21, className: AGE_GROUP.young.full },
    { label: "22 až 29", n: ages.prime, className: AGE_GROUP.prime.full },
    { label: "30 a víc", n: ages.over30, className: AGE_GROUP.old.full },
  ];
  return (
    <section className="card px-4 sm:px-6 pt-4 pb-5 space-y-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0">
          <h3 className="font-heading font-bold text-lg leading-tight">Perspektiva kádru</h3>
          <p className="text-base text-ink-light leading-snug mt-1 max-w-[70ch]"><RichText parts={outlook.verdict} /></p>
        </div>
        <button type="button" onClick={onClose} aria-label="Zavřít detail" className="ml-auto text-muted hover:text-ink text-xl leading-none px-1">✕</button>
      </div>

      {outlook.squadAges && outlook.squadAges.length > 0 && (
        <div className="max-w-2xl">
          <AgeChart ages={outlook.squadAges} xiAverage={ages.average} leagueAverage={ages.leagueAverage} />
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-light">
            {groups.map((g) => (
              <span key={g.label} className="inline-flex items-center gap-1.5">
                <span className={`w-2.5 h-2.5 rounded-[2px] ${g.className}`} aria-hidden />
                <b className="text-ink tabular-nums">{g.n}</b> {g.label}
              </span>
            ))}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
            <span className="inline-flex items-center gap-1.5"><span className="w-0 h-3 border-l-2 border-ink" aria-hidden />průměr naší jedenáctky</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-0 h-3 border-l-2 border-dashed border-muted" aria-hidden />soupeřů</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 pt-5 border-t border-gray-100">
        <PersonList
          title="Na tréninku rostou"
          items={outlook.growing.map((g) => ({
            id: g.id, name: g.name, note: `${g.age ?? "?"} let,`, accent: g.pace === "fast" ? "rychle" : "pozvolna",
          }))}
          empty="Za poslední čtyři týdny nikdo výrazně nepovyrostl."
        />
        <PersonList
          title="Mladí do 21 let"
          items={outlook.youngsters.map((y) => {
            const scout = potentialNote(potential?.get(y.id)?.slovne);
            return { id: y.id, name: y.name, note: `${y.age ?? "?"} let${scout ? "," : ""}`, accent: scout };
          })}
          empty="Nikoho do 21 let v kádru nemáme."
        />
        <PersonList
          title="Opory přes 30"
          items={outlook.veterans.map((v) => ({ id: v.id, name: v.name, note: `${v.age ?? "?"} let` }))}
          empty="V nejlepší jedenáctce nikoho přes 30 nemáme."
        />
      </div>
      {!hasScout && outlook.youngsters.length > 0 && (
        <p className="text-sm text-muted">
          Kam to mladí můžou dotáhnout, odhadne skaut. Najmeš ho v{" "}
          <Link href="/zamestnanci?tab=market" className="text-pitch-600 underline decoration-pitch-500/30">Zaměstnancích</Link>.
        </p>
      )}

      {(teamStrengths.length > 0 || teamWeaknesses.length > 0) && (
        <div className="pt-5 border-t border-gray-100">
          <Insights title="Celý tým" strengths={teamStrengths} weaknesses={teamWeaknesses} />
        </div>
      )}
    </section>
  );
}

// ── 4. Styl a upozornění ───────────────────────────────────────────────────

function StyleRow({ label, value, pill }: { label: string; value: string; pill: { label: string; className: string } }) {
  return (
    <li className="py-2.5 border-t border-gray-100 first:border-t-0 grid grid-cols-[5.75rem_minmax(0,1fr)_auto] items-center gap-2">
      <span className="text-sm text-muted">{label}</span>
      <span className="font-heading font-bold text-base leading-tight">{value}</span>
      <span className={`${PILL} ${pill.className}`}>{pill.label}</span>
    </li>
  );
}

function StyleSection({ style }: { style: ReadyAnalysis["style"] }) {
  const recommended = style.tactics.find((t) => t.recommended) ?? style.tactics[0];
  return (
    <details className="card group">
      <summary className="list-none cursor-pointer px-4 sm:px-6 py-3.5 flex items-center gap-3">
        <span className="font-heading font-bold text-base">Styl</span>
        <span className="text-sm text-ink-light truncate">{recommended ? `sedí taktika „${recommended.label}“` : style.summary}</span>
        <span className="ml-auto transition-transform group-open:rotate-180"><Chevron open={false} /></span>
      </summary>
      <div className="px-4 sm:px-6 pb-4">
        <p className="text-base text-ink-light leading-snug">{style.summary}</p>
        <ul className="mt-2">
          <StyleRow label="Tvrdost" value="Hra do těla" pill={HARDNESS[style.hardness.verdict]} />
          <StyleRow label="Rozestavění" value={style.formation.formation} pill={FAMILIARITY[style.formation.familiarity]} />
        </ul>
        <h4 className="font-heading font-bold text-base mt-3">Všechny taktiky</h4>
        <ul className="mt-1">
          {style.tactics.map((t) => (
            <li key={t.tactic} className="flex items-start justify-between gap-3 py-2 border-t border-gray-100 first:border-t-0">
              <div className="min-w-0">
                <div className={`text-base ${t.recommended ? "font-bold text-pitch-700" : "text-ink"}`}>{t.label}</div>
                {t.reason && <div className="text-sm text-muted">{t.reason}</div>}
              </div>
              <span className={`${PILL} ${FIT[t.verdict].className}`}>{FIT[t.verdict].label}</span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted mt-2">{style.hardness.text} {style.formation.text}</p>
      </div>
    </details>
  );
}

function Warnings({ items }: { items: ReadyAnalysis["warnings"] }) {
  if (items.length === 0) return null;
  return (
    <details className="card group">
      <summary className="list-none cursor-pointer px-4 sm:px-6 py-3.5 flex items-center justify-between gap-2">
        <span className="font-heading font-bold text-base">
          Na co si dát pozor{" "}
          <span className="ml-1 inline-flex items-center justify-center min-w-6 h-6 px-1.5 rounded-full bg-gold-100 text-gold-700 text-sm">{items.length}</span>
        </span>
        <span className="transition-transform group-open:rotate-180"><Chevron open={false} /></span>
      </summary>
      <ul className="px-4 sm:px-6 pb-4 space-y-2.5">
        {items.map((w, i) => (
          <li key={i} className="flex items-start gap-2.5 pt-2.5 border-t border-gray-100">
            <span className="text-base shrink-0 w-6 text-center" title={WARNING_ICON[w.kind].label} aria-label={WARNING_ICON[w.kind].label}>
              {WARNING_ICON[w.kind].icon}
            </span>
            <p className="text-base text-ink-light leading-snug"><RichText parts={w.text} /></p>
          </li>
        ))}
      </ul>
    </details>
  );
}

// ── Stavy bez rozboru ──────────────────────────────────────────────────────

function LockedAnalysis() {
  return (
    <section className="card p-5 sm:p-6 space-y-3">
      <h3 className="font-heading font-bold text-lg">Rozbor kádru dělá asistent trenéra</h3>
      <p className="text-base text-ink-light">
        Klub zatím asistenta nemá. Až ho najmeš, rozebere kádr podle toho, jak se v zápasech doopravdy hraje:
        jak silné máš řady proti lize, co tým drží a co brzdí, kde by posila pomohla nejvíc a jaký styl kádru sedí.
      </p>
      <p className="text-sm text-muted">Čím lepší asistent, tím přesnější rozbor a víc postřehů.</p>
      <Link href="/zamestnanci?tab=market" className="btn btn-primary btn-md inline-flex">Najmout asistenta</Link>
    </section>
  );
}

// ── Záložka ────────────────────────────────────────────────────────────────

type Open = Slot | "squad" | null;

/** Celý rozbor z hotových dat, bez načítání. Nahoře krátký přehled, detail jen na klepnutí. */
export function SquadAnalysisView({ data, potential }: { data: SquadAnalysisResponse; potential?: SquadPotential }) {
  const ready = data.status === "ready" ? data : null;
  const [open, setOpen] = useState<Open>(null);
  const lineDetailRef = useRef<HTMLDivElement>(null);
  const squadDetailRef = useRef<HTMLDivElement>(null);

  // Po otevření detailu ho posunout do zorného pole, na mobilu by jinak zůstal pod okrajem.
  useEffect(() => {
    if (!open) return;
    const el = open === "squad" ? squadDetailRef.current : lineDetailRef.current;
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [open]);

  const team = useMemo(() => {
    if (!ready) return null;
    return {
      strengths: ready.strengths.filter((i) => i.line === null),
      weaknesses: ready.weaknesses.filter((i) => i.line === null),
    };
  }, [ready]);

  if (data.status === "locked") return <LockedAnalysis />;
  if (data.status !== "ready") {
    return (
      <section className="card p-4 sm:p-5 space-y-3">
        <div className="flex items-center gap-3">
          <AssistantFace assistant={data.assistant} size={44} />
          <div className="font-heading font-bold text-base">{data.assistant.name}</div>
        </div>
        <p className="text-base text-ink-light">
          {data.status === "shortSquad"
            ? "Na rozbor potřebuju aspoň jedenáct zdravých hráčů. Doplň kádr a podívám se na to."
            : "Tým zatím nehraje v žádné lize, není s kým ho srovnat. Rozbor bude po zařazení do soutěže."}
        </p>
      </section>
    );
  }

  const r = data;
  const lines = LINE_ORDER.map((s) => r.lines.find((l) => l.line === s)).filter((l): l is LineReport => !!l);
  const selectedLine = open && open !== "squad" ? lines.find((l) => l.line === open) : undefined;
  const toggle = (next: Exclude<Open, null>) => setOpen((cur) => (cur === next ? null : next));
  return (
    <div className="space-y-3">
      <Verdict r={r} />

      <section className="card">
        <div className="px-4 sm:px-6 pt-4 pb-2.5 flex items-baseline justify-between gap-3">
          <h3 className="font-heading font-bold text-lg leading-tight">Řady proti lize</h3>
          <span className="text-sm text-muted">nejlepší jedenáctka, {r.basis.formation}</span>
        </div>
        <div className="divide-y divide-gray-100 border-t border-gray-100">
          {lines.map((l) => (
            <LineRow
              key={l.line}
              line={l}
              table={r.lineTables?.find((t) => t.line === l.line)}
              selected={open === l.line}
              onSelect={() => toggle(l.line)}
            />
          ))}
        </div>
      </section>

      {selectedLine && (
        <div ref={lineDetailRef} className="scroll-mt-4">
          <LineCard line={selectedLine} onClose={() => setOpen(null)}>
            <LineDetail
              line={selectedLine}
              table={r.lineTables?.find((t) => t.line === selectedLine.line)}
              signing={r.reinforcements.find((x) => x.line === selectedLine.line)}
              strengths={r.strengths.filter((i) => i.line === selectedLine.line)}
              weaknesses={r.weaknesses.filter((i) => i.line === selectedLine.line)}
            />
          </LineCard>
        </div>
      )}

      {r.outlook && team && (
        <>
          <SquadSummary outlook={r.outlook} open={open === "squad"} onToggle={() => toggle("squad")} />
          {open === "squad" && (
            <div ref={squadDetailRef} className="scroll-mt-4">
              <OutlookDetail
                outlook={r.outlook}
                potential={potential}
                teamStrengths={team.strengths}
                teamWeaknesses={team.weaknesses}
                onClose={() => setOpen(null)}
              />
            </div>
          )}
        </>
      )}

      <StyleSection style={r.style} />
      <Warnings items={r.warnings} />

      <p className="text-sm text-muted px-1">
        {r.assistant.note} Asistent jen radí, rozhoduješ ty.
      </p>
    </div>
  );
}

export function SquadAnalysisTab({ teamId, potential }: { teamId: string; potential?: SquadPotential }) {
  const [data, setData] = useState<SquadAnalysisResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    apiFetch<SquadAnalysisResponse>(`/api/teams/${teamId}/squad-analysis`)
      .then(setData)
      .catch((e) => { console.error("squad-analysis fetch:", e); setError("Rozbor se nepodařilo načíst."); })
      .finally(() => setLoading(false));
  }, [teamId]);

  if (loading) return <div className="card p-6 flex items-center justify-center min-h-[120px]"><Spinner /></div>;
  if (error || !data) return <div className="card p-4 text-sm text-card-red text-center">{error ?? "Rozbor se nepodařilo načíst."}</div>;
  return <SquadAnalysisView data={data} potential={potential} />;
}
