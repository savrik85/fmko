"use client";

/**
 * Záložka Rozbor v Kádru: asistent trenéra rozebere kádr podle toho, jak se v zápase
 * doopravdy hraje (model rolí v enginu). Jen radí, nic nemění.
 *
 * Kompozice: nahoře verdikt asistenta, pod ním přepínač řad a u vybrané řady tabulka
 * klíčových vlastností (liga, špička, naše řada, hráči) s větou, co řadě chybí. Pak
 * perspektiva kádru (věk, zkušenost, kdo roste), posila, styl a sbalená upozornění.
 *
 * Přesnost počítá server podle asistenta; tady se jen kreslí. Bez asistenta je záložka
 * zamčená a odkazuje do Zaměstnanců.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Spinner, PositionBadge } from "@/components/ui";
import { FaceAvatar } from "@/components/players/face-avatar";

type Slot = "GK" | "DEF" | "MID" | "FWD";
type LineVerdict = "best" | "top" | "aboveAverage" | "average" | "belowAverage" | "bottom" | "worst";
type FitVerdict = "great" | "good" | "manageable" | "poor";
type AssistantLevel = "weak" | "average" | "good" | "excellent";
type WarningKind = "injured" | "outOfPosition" | "overweight" | "tired" | "lowStamina" | "inexperienced";

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
  bar: { low: number; high: number; average: number; best: number };
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

type AnalysisResponse =
  | { status: "locked" }
  | { status: "shortSquad" | "noLeague"; assistant: AssistantInfo }
  | ReadyAnalysis;

// ── Slovník ─────────────────────────────────────────────────────────────────

type Tone = "good" | "mid" | "bad";

const VERDICT: Record<LineVerdict, { label: string; tone: Tone }> = {
  best: { label: "Nejlepší v lize", tone: "good" },
  top: { label: "Mezi nejlepšími", tone: "good" },
  aboveAverage: { label: "Nad průměrem", tone: "good" },
  average: { label: "Průměr", tone: "mid" },
  belowAverage: { label: "Pod průměrem", tone: "bad" },
  bottom: { label: "Mezi nejslabšími", tone: "bad" },
  worst: { label: "Nejslabší v lize", tone: "bad" },
};

/** Slabý asistent mluví jen třemi stupni. */
const VAGUE_VERDICT: Partial<Record<LineVerdict, string>> = {
  aboveAverage: "Spíš silná",
  average: "Asi průměr",
  belowAverage: "Spíš slabá",
};

const PLAYER_NOM: Record<Slot, string> = { GK: "brankář", DEF: "obránce", MID: "záložník", FWD: "útočník" };

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
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

/** Verdikt asistenta: jediný text na stránce, který má velké písmo. */
function Verdict({ r }: { r: ReadyAnalysis }) {
  const headline = r.headline && r.headline.length > 0 ? r.headline : null;
  return (
    <section className="card p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <AssistantFace assistant={r.assistant} size={44} />
        <div className="min-w-0">
          <div className="font-heading font-bold text-base leading-tight truncate">{r.assistant.name}</div>
          <LevelDots level={r.assistant.level} />
        </div>
      </div>
      {headline && (
        <p className="font-heading font-bold text-lg sm:text-xl leading-snug text-ink mt-3 max-w-[60ch]">
          „<RichText parts={headline} />“
        </p>
      )}
      <p className="text-sm text-muted mt-2">
        {r.basis.source === "lineup" ? "Podle tvé uložené sestavy" : "Podle nejlepší jedenáctky, sestavu zatím nemáš uloženou"},{" "}
        rozestavění <span className="whitespace-nowrap">{r.basis.formation}</span>. {r.assistant.note}
      </p>
    </section>
  );
}

type AttrVerdict = "strong" | "even" | "weak";

interface LineTable {
  line: Slot;
  attributes: Array<{ skill: string; ours: number; league: number; top: number | null; verdict: AttrVerdict }>;
  players: Array<{
    id: string;
    name: string;
    age: number | null;
    starter: boolean;
    injured: boolean;
    outOfPosition: boolean;
    values: Array<{ skill: string; value: number; verdict: AttrVerdict }>;
  }>;
  lookFor: TextPart[];
}

interface Outlook {
  verdict: TextPart[];
  ages: { under21: number; prime: number; over30: number; average: number; leagueAverage: number };
  experience: { ours: number; league: number; verdict: AttrVerdict };
  growing: Array<{ id: string; name: string; age: number | null; pace: "fast" | "steady" }>;
  veterans: Array<{ id: string; name: string; age: number | null }>;
  youngsters: Array<{ id: string; name: string; age: number | null; starter: boolean }>;
}

/** Odhad skauta z Kádru (`potencial-kadru`), třeba „Výhled: sestava áčka“. */
export type SquadPotential = Map<string, { slovne: string | null }>;

/** Stejné zkratky jako v tabulce Atributy, aby se nemusely učit nové. */
const SKILL_LABEL: Record<string, { short: string; full: string }> = {
  speed: { short: "Rch", full: "rychlost" },
  technique: { short: "Tch", full: "technika" },
  shooting: { short: "Stř", full: "střelba" },
  passing: { short: "Přh", full: "přihrávky" },
  heading: { short: "Hlv", full: "hlavičky" },
  defense: { short: "Obr", full: "obrana" },
  goalkeeping: { short: "Brk", full: "chytání" },
  vision: { short: "Pře", full: "přehled" },
  experience: { short: "Zku", full: "zkušenost" },
  creativity: { short: "Kre", full: "kreativita" },
  setPieces: { short: "Std", full: "standardky" },
  stamina: { short: "Výd", full: "výdrž" },
  strength: { short: "Síl", full: "síla" },
};

/** Barva hodnoty proti průměru ligy na stejném postu. */
const CELL: Record<AttrVerdict, string> = {
  strong: "bg-pitch-100 text-pitch-800",
  even: "bg-gray-100 text-ink",
  weak: "bg-card-red/10 text-card-red",
};

const VALUE_BADGE = "inline-flex items-center justify-center w-full max-w-10 h-7 rounded-tight text-sm font-heading font-bold tabular-nums";

const TONE_DOT: Record<Tone, string> = { good: "bg-pitch-400", mid: "bg-gold-500", bad: "bg-card-red" };

/** Přepínač řad: čtyři tlačítka vedle sebe, u každého verdikt asistenta. */
function LineSwitch({ lines, selected, onSelect }: { lines: LineReport[]; selected: Slot; onSelect: (s: Slot) => void }) {
  const order: Slot[] = ["GK", "DEF", "MID", "FWD"];
  const bySlot = new Map(lines.map((l) => [l.line, l]));
  return (
    <div className="grid grid-cols-4 gap-1 p-1 rounded-card bg-gray-100" role="tablist" aria-label="Řady týmu">
      {order.map((slot) => {
        const l = bySlot.get(slot);
        if (!l) return null;
        const v = VERDICT[l.verdict];
        const label = (l.vague && VAGUE_VERDICT[l.verdict]) || v.label;
        const active = slot === selected;
        return (
          <button
            key={slot}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(slot)}
            className={`min-w-0 rounded-control px-1 py-2 text-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-pitch-500 ${
              active ? "bg-white shadow-sm" : "hover:bg-white/60"
            }`}
          >
            <span className="block font-heading font-bold text-base leading-tight">{l.label}</span>
            <span className="mt-1 flex items-start justify-center gap-1 text-sm text-muted leading-tight">
              <span className={`shrink-0 mt-1 w-2 h-2 rounded-full ${TONE_DOT[v.tone]}`} aria-hidden />
              <span>{label}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function PlayerName({ id, name }: { id: string; name: string }) {
  return (
    <Link href={`/hrac/${id}`} className="font-heading font-bold text-base text-ink hover:text-pitch-500 truncate block">
      {name}
    </Link>
  );
}

/**
 * Klíčové vlastnosti řady: průměr ligy a špičky, naše řada a každý hráč zvlášť.
 * Barva = srovnání s průměrem ligy na stejném postu, takže je hned vidět, jestli útok
 * nemá třeba rychlost, ale chybí mu střelba, a co hledat u posily.
 *
 * Na mobilu má každý řádek jméno nahoře přes celou šířku a hodnoty pod ním, aby se
 * všech sedm osm vlastností vešlo bez posouvání do strany. Od `sm` je jméno vlevo.
 */
function AttributeTable({ table }: { table: LineTable }) {
  const cols = { "--cols": table.attributes.length } as React.CSSProperties;
  const row = "grid gap-x-1 gap-y-1 items-center grid-cols-[repeat(var(--cols),minmax(0,1fr))] sm:grid-cols-[11rem_repeat(var(--cols),minmax(0,1fr))]";
  const head = "col-span-full sm:col-span-1 min-w-0";
  const hasTop = table.attributes.some((a) => a.top !== null);
  const reference = (label: string, values: Array<number | null>) => (
    <div className={`${row} py-1`} style={cols}>
      <div className={`${head} text-sm text-muted`}>{label}</div>
      {values.map((v, i) => (
        <div key={table.attributes[i].skill} className="text-center text-sm text-muted tabular-nums">{v ?? "–"}</div>
      ))}
    </div>
  );
  const firstBench = table.players.findIndex((p) => !p.starter);
  return (
    <div>
      <div className={`${row} pb-1 border-b border-gray-200`} style={cols}>
        <div className="hidden sm:block text-sm text-muted">Hráč</div>
        {table.attributes.map((a) => (
          <div key={a.skill} className="text-center font-heading font-bold text-sm text-ink-light" title={SKILL_LABEL[a.skill]?.full ?? a.skill}>
            {SKILL_LABEL[a.skill]?.short ?? a.skill}
          </div>
        ))}
      </div>
      {reference("Průměr ligy", table.attributes.map((a) => a.league))}
      {hasTop && reference("Špička ligy", table.attributes.map((a) => a.top))}
      <div className={`${row} py-2 border-t border-gray-200`} style={cols}>
        <div className={`${head} font-heading font-bold text-base text-ink`}>Naše řada</div>
        {table.attributes.map((a) => (
          <div key={a.skill} className="flex justify-center">
            <span className={`${VALUE_BADGE} ${CELL[a.verdict]}`}>{a.ours}</span>
          </div>
        ))}
      </div>
      {table.players.map((p, idx) => (
        <div key={p.id}>
          {idx === firstBench && <div className="pt-3 pb-1 text-sm text-muted border-t border-gray-200">Na lavičce</div>}
          <div className={`${row} py-1.5 ${idx > 0 && idx !== firstBench ? "border-t border-gray-100" : idx === 0 ? "border-t border-gray-200" : ""}`} style={cols}>
            <div className={`${head} flex items-baseline gap-2 sm:block`}>
              <PlayerName id={p.id} name={p.name} />
              <span className="shrink-0 text-sm text-muted whitespace-nowrap">
                {p.age !== null ? `${p.age} let` : ""}
                {p.injured && <span title="Zraněný"> 🩹</span>}
                {p.outOfPosition && <span title="Hraje mimo svůj post"> 🔀</span>}
              </span>
            </div>
            {p.values.map((v) => (
              <div key={v.skill} className="flex justify-center">
                <span className={`${VALUE_BADGE} ${CELL[v.verdict]}`}>{v.value}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function SkillLegend({ skills }: { skills: string[] }) {
  return (
    <p className="text-sm text-muted leading-snug">
      {skills.map((k) => `${SKILL_LABEL[k]?.short ?? k} ${SKILL_LABEL[k]?.full ?? k}`).join(", ")}.{" "}
      <span className="whitespace-nowrap"><span className="inline-block w-2.5 h-2.5 rounded-full bg-pitch-200 align-middle" aria-hidden /> lepší</span>{" "}
      <span className="whitespace-nowrap"><span className="inline-block w-2.5 h-2.5 rounded-full bg-card-red/60 align-middle" aria-hidden /> horší</span>{" "}
      než průměr ligy na stejném postu.
    </p>
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

function Insights({ strengths, weaknesses }: { strengths: Insight[]; weaknesses: Insight[] }) {
  if (strengths.length === 0 && weaknesses.length === 0) return null;
  return (
    <ul className="space-y-3.5 pt-4 border-t border-gray-100">
      {strengths.map((s) => <InsightRow key={`s-${s.scope}-${s.aspect}`} item={s} positive />)}
      {weaknesses.map((w) => <InsightRow key={`w-${w.scope}-${w.aspect}`} item={w} positive={false} />)}
    </ul>
  );
}

/** Vybraná řada: jak je silná, co jí chybí, vlastnosti hráčů a postřehy asistenta. */
function LineSection({ line, table, strengths, weaknesses }: {
  line: LineReport; table: LineTable | undefined; strengths: Insight[]; weaknesses: Insight[];
}) {
  return (
    <section className="card p-4 sm:p-5 space-y-4" role="tabpanel">
      <div>
        <p className="text-base text-ink-light leading-snug"><RichText parts={line.text} /></p>
        {line.bestTeam && (
          <p className="text-sm text-muted mt-1">
            Nejlíp ji má{" "}
            <Link href={`/tym/${line.bestTeam.id}`} className="font-heading font-bold text-base text-ink hover:text-pitch-500">
              {line.bestTeam.name}
            </Link>
            .
          </p>
        )}
      </div>
      {table && (
        <>
          <p className="font-heading font-bold text-base leading-snug text-ink bg-paper rounded-control px-3 py-2.5">
            <RichText parts={table.lookFor} />
          </p>
          <AttributeTable table={table} />
          <SkillLegend skills={table.attributes.map((a) => a.skill)} />
        </>
      )}
      <Insights strengths={strengths} weaknesses={weaknesses} />
    </section>
  );
}

function PersonList({ title, items, empty }: { title: string; items: Array<{ id: string; name: string; note: string }>; empty: string }) {
  return (
    <div className="min-w-0">
      <h4 className="font-heading font-bold text-base mb-1.5">{title}</h4>
      {items.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((p) => (
            <li key={p.id} className="min-w-0">
              <PlayerName id={p.id} name={p.name} />
              <div className="text-sm text-ink-light leading-tight">{p.note}</div>
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

/** „Výhled: sestava áčka“ → „výhled sestava áčka“ do poznámky za věkem. */
function potentialNote(slovne: string | null | undefined): string | null {
  if (!slovne) return null;
  return slovne.replace(/^Výhled:\s*/, "výhled: ");
}

/** Perspektiva kádru: věk, zkušenost, kdo roste, mladí a stárnoucí opory. */
function OutlookSection({ outlook, potential, teamStrengths, teamWeaknesses }: {
  outlook: Outlook; potential: SquadPotential | undefined; teamStrengths: Insight[]; teamWeaknesses: Insight[];
}) {
  const { ages, experience } = outlook;
  const total = Math.max(1, ages.under21 + ages.prime + ages.over30);
  const segments = [
    { label: "Do 21 let", n: ages.under21, className: "bg-pitch-300" },
    { label: "22 až 29 let", n: ages.prime, className: "bg-pitch-500" },
    { label: "30 a víc", n: ages.over30, className: "bg-gold-400" },
  ];
  const hasScout = potential ? [...potential.values()].some((p) => p.slovne) : false;
  return (
    <section className="card p-4 sm:p-5 space-y-4">
      <div>
        <h3 className="font-heading font-bold text-lg leading-tight">Perspektiva kádru</h3>
        <p className="text-base text-ink-light leading-snug mt-1"><RichText parts={outlook.verdict} /></p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <div className="flex h-3 rounded-full overflow-hidden bg-gray-100" aria-hidden>
            {segments.map((s) => s.n > 0 && <div key={s.label} className={s.className} style={{ width: `${(s.n / total) * 100}%` }} />)}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-light">
            {segments.map((s) => (
              <span key={s.label} className="inline-flex items-center gap-1.5">
                <span className={`w-2.5 h-2.5 rounded-full ${s.className}`} aria-hidden />
                {s.label}: <b className="text-ink">{s.n}</b>
              </span>
            ))}
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-2">
          <div className="rounded-control bg-paper px-3 py-2">
            <dt className="text-sm text-muted">Věk sestavy</dt>
            <dd className="font-heading font-bold text-lg leading-tight">{yearsCs(ages.average)}</dd>
            <dd className="text-sm text-muted">liga {yearsCs(ages.leagueAverage)}</dd>
          </div>
          <div className="rounded-control bg-paper px-3 py-2">
            <dt className="text-sm text-muted">Zkušenost sestavy</dt>
            <dd className="mt-0.5"><span className={`inline-flex items-center justify-center w-10 h-7 rounded-tight text-sm font-heading font-bold tabular-nums ${CELL[experience.verdict]}`}>{experience.ours}</span></dd>
            <dd className="text-sm text-muted">liga {experience.league}</dd>
          </div>
        </dl>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-gray-100">
        <PersonList
          title="Mladí do 21 let"
          items={outlook.youngsters.map((y) => ({
            id: y.id,
            name: y.name,
            note: [`${y.age ?? "?"} let`, y.starter ? "hraje v sestavě" : null, potentialNote(potential?.get(y.id)?.slovne)].filter(Boolean).join(", "),
          }))}
          empty="Nikoho do 21 let v kádru nemáme."
        />
        <PersonList
          title="Na tréninku rostou"
          items={outlook.growing.map((g) => ({ id: g.id, name: g.name, note: `${g.age ?? "?"} let, ${g.pace === "fast" ? "roste rychle" : "pomalu se zlepšuje"}` }))}
          empty="Za poslední čtyři týdny nikdo výrazně nepovyrostl."
        />
        <PersonList
          title="Opory přes 30"
          items={outlook.veterans.map((v) => ({ id: v.id, name: v.name, note: `${v.age ?? "?"} let, brzy začne ztrácet` }))}
          empty="V sestavě nikoho přes 30 nemáme."
        />
      </div>
      {!hasScout && outlook.youngsters.length > 0 && (
        <p className="text-sm text-muted">
          Kam to mladí můžou dotáhnout, odhadne skaut. Najmeš ho v{" "}
          <Link href="/zamestnanci?tab=market" className="text-pitch-600 underline decoration-pitch-500/30">Zaměstnancích</Link>.
        </p>
      )}

      <Insights strengths={teamStrengths} weaknesses={teamWeaknesses} />
    </section>
  );
}

/** Vlastnosti, na které se u posily dívat: stejné zvýraznění jako klíčové atributy v profilu hráče. */
function AttributeChips({ names }: { names: string[] }) {
  if (names.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {names.map((n) => (
        <span key={n} className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-tight bg-pitch-50/70 text-pitch-700 font-bold text-sm">
          <span className="text-pitch-500 text-micro leading-none" aria-hidden>●</span>
          {n}
        </span>
      ))}
    </div>
  );
}

function Signings({ items }: { items: Reinforcement[] }) {
  if (items.length === 0) {
    return (
      <section className="card p-4 sm:p-5">
        <h3 className="font-heading font-bold text-base">Posila</h3>
        <p className="text-base text-ink-light mt-1">Posila by teď nikde moc nepřidala, kádr je vyrovnaný.</p>
      </section>
    );
  }
  const [main, ...rest] = items;
  return (
    <section className="card overflow-hidden">
      <div className="p-4 sm:p-5 border-l-4 border-pitch-500">
        <div className="flex items-center gap-2">
          <PositionBadge position={main.line} />
          <h3 className="font-heading font-bold text-lg leading-tight">
            {main.priority === "low" ? "Kdyby přece jen posila" : "Hlavní posila"}: {PLAYER_NOM[main.line]}
          </h3>
        </div>
        <p className="text-base text-ink-light leading-snug mt-2"><RichText parts={main.text} /></p>
        {main.attributes.length > 0 && (
          <div className="mt-3">
            <div className="text-sm text-muted mb-1.5">Hledej hráče, který vyniká v těchhle vlastnostech:</div>
            <AttributeChips names={main.attributes} />
          </div>
        )}
      </div>
      {rest.length > 0 && (
        <div className="border-t border-gray-100 px-4 sm:px-5 py-3 space-y-2.5 bg-paper/40">
          <div className="text-sm text-muted">Méně naléhavé</div>
          {rest.map((x) => (
            <div key={x.line} className="flex items-start gap-2.5">
              <PositionBadge position={x.line} />
              <div className="min-w-0">
                <div className="text-base font-heading font-bold leading-tight">{capitalize(PLAYER_NOM[x.line])}</div>
                {x.attributes.length > 0 && <div className="text-sm text-ink-light">{x.attributes.join(", ")}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function StyleTile({ label, value, pill }: { label: string; value: string; pill: { label: string; className: string } }) {
  return (
    <div className="card p-3 flex flex-col gap-1.5 min-w-0">
      <span className="text-sm text-muted">{label}</span>
      <span className="font-heading font-bold text-base leading-tight break-words">{value}</span>
      <span className={`self-start px-2 py-0.5 rounded-tight text-sm font-heading font-bold ${pill.className}`}>{pill.label}</span>
    </div>
  );
}

function Style({ style }: { style: ReadyAnalysis["style"] }) {
  const recommended = style.tactics.find((t) => t.recommended) ?? style.tactics[0];
  return (
    <section className="space-y-2">
      <h3 className="font-heading font-bold text-base px-1">Jaký styl nám sedí</h3>
      <div className="grid grid-cols-3 gap-2">
        {recommended && <StyleTile label="Taktika" value={recommended.label} pill={FIT[recommended.verdict]} />}
        <StyleTile label="Tvrdost" value="Do těla" pill={HARDNESS[style.hardness.verdict]} />
        <StyleTile label="Rozestavění" value={style.formation.formation} pill={FAMILIARITY[style.formation.familiarity]} />
      </div>
      <details className="card group">
        <summary className="list-none cursor-pointer p-3 sm:px-4 flex items-center justify-between gap-2 text-base text-ink-light">
          <span>{style.summary}</span>
          <span className="shrink-0 text-sm text-pitch-600 font-bold group-open:hidden">Všechny taktiky</span>
          <span className="shrink-0 text-sm text-pitch-600 font-bold hidden group-open:inline">Skrýt</span>
        </summary>
        <ul className="px-3 sm:px-4 pb-3">
          {style.tactics.map((t) => (
            <li key={t.tactic} className="flex items-start justify-between gap-3 py-2 border-t border-gray-100">
              <div className="min-w-0">
                <div className={`text-base ${t.recommended ? "font-bold text-pitch-700" : "text-ink"}`}>{t.label}</div>
                {t.reason && <div className="text-sm text-muted">{t.reason}</div>}
              </div>
              <span className={`shrink-0 px-2 py-0.5 rounded-tight text-sm font-heading font-bold ${FIT[t.verdict].className}`}>{FIT[t.verdict].label}</span>
            </li>
          ))}
          <li className="py-2 border-t border-gray-100 text-sm text-muted">{style.hardness.text} {style.formation.text}</li>
        </ul>
      </details>
    </section>
  );
}

function Warnings({ items }: { items: ReadyAnalysis["warnings"] }) {
  if (items.length === 0) return null;
  return (
    <details className="card group">
      <summary className="list-none cursor-pointer p-3 sm:px-4 flex items-center justify-between gap-2">
        <span className="font-heading font-bold text-base">
          Na co si dát pozor <span className="ml-1 inline-flex items-center justify-center min-w-6 h-6 px-1.5 rounded-full bg-gold-100 text-gold-700 text-sm">{items.length}</span>
        </span>
        <span className="shrink-0 text-sm text-pitch-600 font-bold group-open:hidden">Ukázat</span>
        <span className="shrink-0 text-sm text-pitch-600 font-bold hidden group-open:inline">Skrýt</span>
      </summary>
      <ul className="px-3 sm:px-4 pb-3 space-y-2.5">
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

/**
 * Výchozí řada po otevření: tam, kde asistent vidí slabinu, jinak kde má nejvíc
 * postřehů, a teprve pak ta nejslabší. Prázdný detail hned po otevření nic neřekne.
 */
function defaultSlot(r: ReadyAnalysis): Slot {
  const order: LineVerdict[] = ["worst", "bottom", "belowAverage", "average", "aboveAverage", "top", "best"];
  const score = (l: LineReport) => {
    const weak = r.weaknesses.filter((w) => w.line === l.line).length;
    const all = weak + r.strengths.filter((s) => s.line === l.line).length;
    return weak * 100 + all * 10 + (order.length - order.indexOf(l.verdict));
  };
  return [...r.lines].sort((a, b) => score(b) - score(a))[0]?.line ?? "MID";
}

export function SquadAnalysisTab({ teamId, potential }: { teamId: string; potential?: SquadPotential }) {
  const [data, setData] = useState<AnalysisResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Slot | null>(null);

  useEffect(() => {
    setLoading(true);
    apiFetch<AnalysisResponse>(`/api/teams/${teamId}/squad-analysis`)
      .then(setData)
      .catch((e) => { console.error("squad-analysis fetch:", e); setError("Rozbor se nepodařilo načíst."); })
      .finally(() => setLoading(false));
  }, [teamId]);

  const ready = data?.status === "ready" ? data : null;
  const slot = selected ?? (ready ? defaultSlot(ready) : "MID");
  const byLine = useMemo(() => {
    if (!ready) return null;
    const pick = (items: Insight[], s: Slot | null) => items.filter((i) => i.line === s);
    return {
      strengths: pick(ready.strengths, slot),
      weaknesses: pick(ready.weaknesses, slot),
      teamStrengths: pick(ready.strengths, null),
      teamWeaknesses: pick(ready.weaknesses, null),
    };
  }, [ready, slot]);

  if (loading) return <div className="card p-6 flex items-center justify-center min-h-[120px]"><Spinner /></div>;
  if (error || !data) return <div className="card p-4 text-sm text-card-red text-center">{error ?? "Rozbor se nepodařilo načíst."}</div>;
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
  const line = r.lines.find((l) => l.line === slot) ?? r.lines[0];
  const table = r.lineTables?.find((t) => t.line === slot);
  return (
    <div className="space-y-3">
      <Verdict r={r} />

      <LineSwitch lines={r.lines} selected={slot} onSelect={setSelected} />
      {line && byLine && <LineSection line={line} table={table} strengths={byLine.strengths} weaknesses={byLine.weaknesses} />}

      {r.outlook && byLine && (
        <OutlookSection outlook={r.outlook} potential={potential} teamStrengths={byLine.teamStrengths} teamWeaknesses={byLine.teamWeaknesses} />
      )}

      <Signings items={r.reinforcements} />
      <Style style={r.style} />
      <Warnings items={r.warnings} />

      <p className="text-sm text-muted px-1">
        Asistent jen radí, rozhoduješ ty. Pohled na kádr mění jen se změnou kádru nebo sestavy, lepší asistent v{" "}
        <Link href="/zamestnanci" className="text-pitch-600 underline decoration-pitch-500/30">Zaměstnancích</Link>{" "}
        uvidí víc a přesněji.
      </p>
    </div>
  );
}
