"use client";

/**
 * Záložka Rozbor v Kádru: asistent trenéra rozebere kádr podle toho, jak se v zápase
 * doopravdy hraje (model rolí v enginu). Jen radí, nic nemění.
 *
 * Kompozice: nahoře verdikt asistenta dvěma až třemi větami, pod ním hřiště se čtyřmi
 * řadami obarvenými podle síly proti lize. Klik na řadu ukáže, co ji drží a co brzdí.
 * Pod tím hlavní posila, styl ve třech dlaždicích a sbalená upozornění. Jediný výrazný
 * prvek je hřiště, ostatní je tiché.
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

/**
 * Tón řady na hřišti. Silná řada je čistý trávník, průměrná dostane zlatý nádech
 * a slabá červený: na první pohled je vidět, kde to hoří.
 */
const ZONE: Record<Tone, { wash: string; pill: string }> = {
  good: { wash: "", pill: "bg-white text-pitch-700" },
  mid: { wash: "bg-gold-400/35", pill: "bg-gold-100 text-gold-700" },
  bad: { wash: "bg-card-red/40", pill: "bg-white text-card-red" },
};

/** Řady na hřišti odshora: útočíme nahoru, brankář stojí dole u své branky. */
const PITCH_ORDER: Slot[] = ["FWD", "MID", "DEF", "GK"];

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

function pct(v: number): string {
  return `${Math.round(Math.max(0, Math.min(1, v)) * 1000) / 10}%`;
}

/**
 * Měřák na trávníku: kde řada stojí na škále ligy (od nejslabšího po nejlepší tým).
 * Bílý úsek = odhad asistenta (slabší asistent = širší rozmezí), čárka = průměr ligy.
 */
function ZoneMeter({ bar }: { bar: LineReport["bar"] }) {
  const width = Math.max(0.03, bar.high - bar.low);
  return (
    <div className="relative h-2 rounded-full bg-black/20" aria-hidden>
      <div className="absolute inset-y-0 rounded-full bg-white" style={{ left: pct(bar.low), width: pct(width) }} />
      <div className="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-white/70" style={{ left: pct(bar.average) }} />
    </div>
  );
}

/**
 * Hřiště: čtyři pásma od útoku po branku. Čáry jsou jen náznak (vápna, půlicí čára,
 * výkopový kruh), aby to bylo hřiště a ne tabulka, ale nepřebily text v pásmech.
 */
function Pitch({ lines, selected, onSelect }: { lines: LineReport[]; selected: Slot; onSelect: (s: Slot) => void }) {
  const bySlot = new Map(lines.map((l) => [l.line, l]));
  return (
    <div
      className="relative rounded-card overflow-hidden select-none"
      style={{ background: "repeating-linear-gradient(180deg, var(--color-pitch-600) 0 44px, var(--color-pitch-700) 44px 88px)" }}
    >
      {/* Čáry hřiště */}
      <div className="pointer-events-none absolute inset-2 border-2 border-white/40 rounded-tight" aria-hidden />
      <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-2 w-1/2 h-10 border-2 border-t-0 border-white/40" aria-hidden />
      <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-2 w-1/2 h-10 border-2 border-b-0 border-white/40" aria-hidden />
      <div className="pointer-events-none absolute left-2 right-2 top-1/2 h-0.5 bg-white/40" aria-hidden />
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full border-2 border-white/40" aria-hidden />

      <div className="relative grid grid-rows-4 p-2 gap-1.5" role="tablist" aria-label="Řady týmu">
        {PITCH_ORDER.map((slot) => {
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
              aria-label={`${l.label}: ${label}`}
              onClick={() => onSelect(slot)}
              className={`relative text-left rounded-control px-3 py-3 min-h-[76px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${ZONE[v.tone].wash} ${
                active ? "ring-2 ring-white bg-white/15" : "hover:bg-white/10"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-heading font-[800] text-lg text-white leading-none drop-shadow-sm">{l.label}</span>
                <span className={`shrink-0 px-2 py-0.5 rounded-tight text-sm font-heading font-bold ${ZONE[v.tone].pill}`}>{label}</span>
              </div>
              <div className="mt-2.5"><ZoneMeter bar={l.bar} /></div>
            </button>
          );
        })}
      </div>
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

/** Detail vybrané řady: co o ní asistent řekl, co ji drží a co brzdí. */
function LineDetail({ line, strengths, weaknesses }: { line: LineReport; strengths: Insight[]; weaknesses: Insight[] }) {
  const empty = strengths.length === 0 && weaknesses.length === 0;
  return (
    <section className="card p-4 sm:p-5" aria-live="polite">
      <div className="flex items-center gap-2">
        <PositionBadge position={line.line} />
        <h3 className="font-heading font-bold text-lg leading-tight">{line.label}</h3>
      </div>
      <p className="text-base text-ink-light leading-snug mt-2"><RichText parts={line.text} /></p>
      {line.bestTeam && (
        <p className="text-sm text-muted mt-1">
          Nejlíp ji má{" "}
          <Link href={`/tym/${line.bestTeam.id}`} className="font-heading font-bold text-base text-ink hover:text-pitch-500 underline decoration-pitch-500/20">
            {line.bestTeam.name}
          </Link>
          .
        </p>
      )}
      {empty ? (
        <p className="text-sm text-muted mt-4">K téhle řadě asistent nic zvláštního nemá.</p>
      ) : (
        <ul className="space-y-3.5 mt-4 pt-4 border-t border-gray-100">
          {strengths.map((s) => <InsightRow key={`s-${s.scope}-${s.aspect}`} item={s} positive />)}
          {weaknesses.map((w) => <InsightRow key={`w-${w.scope}-${w.aspect}`} item={w} positive={false} />)}
        </ul>
      )}
    </section>
  );
}

/** Postřehy, které se netýkají jedné řady (třeba zkušenost celého týmu). */
function TeamWide({ strengths, weaknesses }: { strengths: Insight[]; weaknesses: Insight[] }) {
  if (strengths.length === 0 && weaknesses.length === 0) return null;
  return (
    <section className="card p-4 sm:p-5">
      <h3 className="font-heading font-bold text-base">Celý tým</h3>
      <ul className="space-y-3.5 mt-3">
        {strengths.map((s) => <InsightRow key={`s-${s.scope}-${s.aspect}`} item={s} positive />)}
        {weaknesses.map((w) => <InsightRow key={`w-${w.scope}-${w.aspect}`} item={w} positive={false} />)}
      </ul>
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

export function SquadAnalysisTab({ teamId }: { teamId: string }) {
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
  return (
    <div className="space-y-3">
      <Verdict r={r} />

      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,340px)_minmax(0,1fr)] gap-3 items-start">
        <div className="space-y-1.5">
          <Pitch lines={r.lines} selected={slot} onSelect={setSelected} />
          <p className="text-sm text-muted px-1">
            Bílý úsek ukazuje, kde řada stojí mezi týmy ligy, čárka je průměr. Klepni na řadu pro detail.
          </p>
        </div>
        {line && byLine && <LineDetail line={line} strengths={byLine.strengths} weaknesses={byLine.weaknesses} />}
      </div>

      {byLine && <TeamWide strengths={byLine.teamStrengths} weaknesses={byLine.teamWeaknesses} />}

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
