"use client";

/**
 * Záložka Rozbor v Kádru: asistent trenéra rozebere kádr podle toho, jak se v zápase
 * doopravdy hraje (model rolí v enginu). Síla řad proti lize, co tým drží a brzdí, kde
 * posílit, jaký styl sedí a na co si dát pozor. Jen radí, nic nemění.
 *
 * Přesnost závisí na asistentovi (počítá server, tady se jen kreslí). Bez asistenta je
 * záložka zamčená a odkazuje do Zaměstnanců.
 *
 * Vzhled převzatý z ostatních záložek Kádru: souhrnné karty jako v hlavičce, seznamy jako
 * v TOP, zvýraznění klíčových vlastností jako v profilu hráče (bg-pitch-50/70 a tečka).
 */

import { useEffect, useState } from "react";
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

const VERDICT: Record<LineVerdict, { label: string; tone: "good" | "mid" | "bad" }> = {
  best: { label: "Nejlepší v lize", tone: "good" },
  top: { label: "Mezi nejlepšími", tone: "good" },
  aboveAverage: { label: "Nadprůměr", tone: "good" },
  average: { label: "Průměr", tone: "mid" },
  belowAverage: { label: "Podprůměr", tone: "bad" },
  bottom: { label: "Mezi nejslabšími", tone: "bad" },
  worst: { label: "Nejslabší v lize", tone: "bad" },
};

/** Slabý asistent mluví jen třemi stupni. */
const VAGUE_VERDICT: Partial<Record<LineVerdict, string>> = {
  aboveAverage: "Spíš silná",
  average: "Asi průměr",
  belowAverage: "Spíš slabá",
};

/** Barvy jako StatBar: zelená, zlatá, červená. */
const TONE: Record<"good" | "mid" | "bad", { text: string; band: string }> = {
  good: { text: "text-pitch-600", band: "bg-pitch-400" },
  mid: { text: "text-gold-600", band: "bg-gold-500" },
  bad: { text: "text-card-red", band: "bg-card-red" },
};

const FIT: Record<FitVerdict, { label: string; className: string }> = {
  great: { label: "Sedí výborně", className: "bg-pitch-100 text-pitch-800" },
  good: { label: "Sedí", className: "bg-pitch-50 text-pitch-700" },
  manageable: { label: "Zvládneme", className: "bg-gold-100 text-gold-700" },
  poor: { label: "Nesedí", className: "bg-red-100 text-card-red" },
};

/** Tvrdost hry čte stejný verdikt jinak: „sedí“ tu znamená „jde to, ale opatrně“. */
const HARDNESS: Record<FitVerdict, { label: string; className: string }> = {
  great: { label: "Máme na to", className: "bg-pitch-100 text-pitch-800" },
  good: { label: "Opatrně", className: "bg-pitch-50 text-pitch-700" },
  manageable: { label: "Spíš ne", className: "bg-gold-100 text-gold-700" },
  poor: { label: "Nehrát", className: "bg-red-100 text-card-red" },
};

const FAMILIARITY: Record<"high" | "medium" | "low", { label: string; className: string }> = {
  high: { label: "Sehrané", className: "bg-pitch-100 text-pitch-800" },
  medium: { label: "Napůl", className: "bg-gold-100 text-gold-700" },
  low: { label: "Nesehrané", className: "bg-red-100 text-card-red" },
};

const PRIORITY: Record<Reinforcement["priority"], { label: string; className: string }> = {
  high: { label: "Hlavní priorita", className: "bg-pitch-100 text-pitch-800" },
  medium: { label: "Taky by pomohlo", className: "bg-gold-100 text-gold-700" },
  low: { label: "Tady to nehoří", className: "bg-gray-100 text-muted" },
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

function AssistantFace({ assistant }: { assistant: AssistantInfo }) {
  return (
    <div className="shrink-0 w-11 h-11 rounded-soft overflow-hidden bg-white flex items-center justify-center">
      {assistant.avatar
        ? <FaceAvatar faceConfig={assistant.avatar} size={36} />
        : <span className="font-heading font-bold text-base">{assistant.name.charAt(0)}</span>}
    </div>
  );
}

function AssistantHeader({ assistant, basis }: { assistant: AssistantInfo; basis?: ReadyAnalysis["basis"] }) {
  const level = LEVEL[assistant.level];
  return (
    <div className="card p-3 sm:p-4 flex items-start gap-3">
      <AssistantFace assistant={assistant} />
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="font-heading font-bold text-base leading-tight">
          Rozbor {assistant.female ? "připravila asistentka" : "připravil asistent"} {assistant.name}
        </div>
        <div className="text-sm text-muted flex items-center gap-1.5" title="Jak přesně asistent kádr odhaduje">
          <span className="tracking-widest text-pitch-500" aria-hidden>
            {"●".repeat(level.dots)}<span className="text-gray-200">{"●".repeat(4 - level.dots)}</span>
          </span>
          {level.label}
        </div>
        {basis && (
          <div className="text-sm text-muted">
            {basis.source === "lineup" ? "Podle tvé uložené sestavy" : "Podle nejlepší jedenáctky, sestavu zatím nemáš uloženou"}, rozestavění{" "}
            <span className="whitespace-nowrap">{basis.formation}</span>
          </div>
        )}
        <div className="text-sm text-ink-light">{assistant.note}</div>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-micro font-heading font-bold text-muted uppercase tracking-wider mt-1">{children}</div>;
}

function pct(v: number): string {
  return `${Math.round(Math.max(0, Math.min(1, v)) * 1000) / 10}%`;
}

/** Pruh síly řady: odhad asistenta jako rozmezí, čárka = průměr ligy, zlatá čárka = nejlepší tým. */
function LineBar({ bar, tone }: { bar: LineReport["bar"]; tone: "good" | "mid" | "bad" }) {
  const width = Math.max(0.02, bar.high - bar.low);
  return (
    <div className="relative h-2.5 bg-gray-100 rounded-full mt-2" aria-hidden>
      <div className={`absolute inset-y-0 rounded-full opacity-80 ${TONE[tone].band}`} style={{ left: pct(bar.low), width: pct(width) }} />
      <div className="absolute -top-1 -bottom-1 w-0.5 bg-ink/50 rounded-full" style={{ left: pct(bar.average) }} />
      <div className="absolute -top-1 -bottom-1 w-0.5 bg-gold-500 rounded-full" style={{ left: pct(bar.best) }} />
    </div>
  );
}

function LineCard({ line }: { line: LineReport }) {
  const v = VERDICT[line.verdict];
  const label = (line.vague && VAGUE_VERDICT[line.verdict]) || v.label;
  // Text pro čtečky obrazovky: celá věta, kterou asistent řekl.
  const sentence = line.text.map((p) => (p.kind === "text" ? p.text : p.name)).join("");
  return (
    <div className="card p-3" aria-label={sentence}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-micro text-muted uppercase tracking-wide">{line.label}</span>
        <PositionBadge position={line.line} />
      </div>
      <div className={`font-heading font-[800] text-base leading-tight mt-1 ${TONE[v.tone].text}`}>{label}</div>
      <LineBar bar={line.bar} tone={v.tone} />
      {line.bestTeam && (
        <div className="text-sm text-muted mt-2 break-words">
          Nejlepší:{" "}
          <Link href={`/tym/${line.bestTeam.id}`} className="font-heading font-bold text-base text-ink hover:text-pitch-500 underline decoration-pitch-500/20">
            {line.bestTeam.name}
          </Link>
        </div>
      )}
    </div>
  );
}

function InsightList({ title, items, empty }: { title: string; items: Insight[]; empty: string }) {
  return (
    <div className="card p-4">
      <div className="font-heading font-bold text-sm text-ink mb-3">{title}</div>
      {items.length === 0 ? (
        <div className="text-sm text-muted">{empty}</div>
      ) : (
        <ul className="space-y-3">
          {items.map((it) => (
            <li key={`${it.scope}-${it.aspect}`} className="space-y-0.5">
              <div className="flex items-center gap-2">
                {it.line && <PositionBadge position={it.line} />}
                <span className="font-heading font-bold text-base leading-tight">{it.title}</span>
              </div>
              <p className="text-base text-ink-light leading-snug"><RichText parts={it.text} /></p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Vlastnosti, na které se u posily dívat — stejné zvýraznění jako klíčové atributy v profilu hráče. */
function AttributeChips({ names }: { names: string[] }) {
  if (names.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {names.map((n) => (
        <span key={n} className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-pitch-50/70 text-pitch-700 font-bold text-sm">
          <span className="text-pitch-500 text-micro leading-none" aria-hidden>●</span>
          {n}
        </span>
      ))}
    </div>
  );
}

// ── Stavy bez rozboru ──────────────────────────────────────────────────────

function LockedAnalysis() {
  return (
    <div className="card p-6 text-center space-y-3">
      <div className="text-3xl" aria-hidden>🔒</div>
      <div className="font-heading font-bold text-lg">Rozbor kádru dělá asistent trenéra</div>
      <p className="text-sm text-muted">
        Klub zatím asistenta nemá. Až ho najmeš, rozebere ti kádr podle toho, jak se v zápasech doopravdy hraje:
      </p>
      <ul className="text-sm text-ink-light text-left max-w-md mx-auto space-y-1.5">
        <li>📊 jak silné máš řady proti ostatním v lize,</li>
        <li>💪 co tým drží a co ho brzdí, i s konkrétními hráči,</li>
        <li>🛒 kde by posila pomohla nejvíc a jakého hráče hledat,</li>
        <li>🧭 jaká taktika, tvrdost a rozestavění kádru sedí,</li>
        <li>⚠️ na co si dát pozor: nadváha, únava, nováčci, hráči mimo post.</li>
      </ul>
      <p className="text-sm text-muted">Čím lepší asistent, tím přesnější rozbor a víc postřehů.</p>
      <Link href="/zamestnanci?tab=market" className="btn btn-primary btn-md inline-flex">Najmout asistenta</Link>
    </div>
  );
}

// ── Záložka ────────────────────────────────────────────────────────────────

export function SquadAnalysisTab({ teamId }: { teamId: string }) {
  const [data, setData] = useState<AnalysisResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    apiFetch<AnalysisResponse>(`/api/teams/${teamId}/squad-analysis`)
      .then(setData)
      .catch((e) => { console.error("squad-analysis fetch:", e); setError("Rozbor se nepodařilo načíst."); })
      .finally(() => setLoading(false));
  }, [teamId]);

  if (loading) return <div className="card p-6 flex items-center justify-center min-h-[120px]"><Spinner /></div>;
  if (error || !data) return <div className="card p-4 text-sm text-card-red text-center">{error ?? "Rozbor se nepodařilo načíst."}</div>;
  if (data.status === "locked") return <LockedAnalysis />;
  if (data.status !== "ready") {
    return (
      <>
        <AssistantHeader assistant={data.assistant} />
        <div className="card p-4 text-sm text-muted text-center">
          {data.status === "shortSquad"
            ? "Na rozbor potřebuju aspoň jedenáct zdravých hráčů. Doplň kádr a podívám se na to."
            : "Tým zatím nehraje v žádné lize, není s kým ho srovnat. Rozbor bude po zařazení do soutěže."}
        </div>
      </>
    );
  }

  const r = data;
  return (
    <>
      <AssistantHeader assistant={r.assistant} basis={r.basis} />

      <SectionTitle>📊 Síla řad proti lize</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {r.lines.map((l) => <LineCard key={l.line} line={l} />)}
      </div>
      <div className="text-sm text-muted flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block w-5 h-2.5 rounded-full bg-pitch-400 opacity-80" aria-hidden />odhad asistenta</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block w-0.5 h-3.5 bg-ink/50 rounded-full" aria-hidden />průměr ligy</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block w-0.5 h-3.5 bg-gold-500 rounded-full" aria-hidden />nejlepší tým</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <InsightList title="💪 Co nás drží" items={r.strengths} empty="Nic, čím bychom soupeře v lize převyšovali." />
        <InsightList title="🧱 Co nás brzdí" items={r.weaknesses} empty="Nic, v čem bychom za soupeři výrazně zaostávali." />
      </div>

      <div className="card p-4">
        <div className="font-heading font-bold text-sm text-ink mb-1">🛒 Kde posílit</div>
        {r.reinforcements.length === 0 ? (
          <div className="text-sm text-muted mt-2">Posila by teď nikde moc nepřidala, kádr je vyrovnaný.</div>
        ) : (
          <ol>
            {r.reinforcements.map((x, i) => (
              <li key={x.line} className="flex gap-3 py-3 border-b border-gray-50 last:border-b-0">
                <div className="shrink-0 flex flex-col items-center gap-1.5 w-9">
                  <span className="font-heading font-[800] text-base tabular-nums text-muted">{i + 1}.</span>
                  <PositionBadge position={x.line} />
                </div>
                <div className="min-w-0 flex-1">
                  <span className={`inline-block px-2 py-0.5 rounded text-sm font-heading font-bold ${PRIORITY[x.priority].className}`}>
                    {PRIORITY[x.priority].label}
                  </span>
                  <p className="text-base text-ink-light leading-snug mt-1"><RichText parts={x.text} /></p>
                  <AttributeChips names={x.attributes} />
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="card p-4">
        <div className="font-heading font-bold text-sm text-ink mb-1">🧭 Jaký styl nám sedí</div>
        <p className="text-base text-ink-light leading-snug mb-3">{r.style.summary}</p>
        <ul>
          {r.style.tactics.map((t) => (
            <li key={t.tactic}
              className={`flex items-start justify-between gap-3 py-2 border-b border-gray-50 last:border-b-0 ${
                t.recommended ? "-mx-2 px-2 bg-pitch-50/70 rounded border-b-pitch-100" : ""
              }`}>
              <div className="min-w-0">
                <div className={`text-base flex items-center gap-1.5 ${t.recommended ? "text-pitch-700 font-bold" : "text-ink-light"}`}>
                  {t.recommended && <span className="text-pitch-500 text-micro leading-none" aria-hidden>●</span>}
                  {t.label}
                </div>
                {t.reason && <div className="text-sm text-muted">{t.reason}</div>}
              </div>
              <span className={`shrink-0 px-2 py-0.5 rounded text-sm font-heading font-bold ${FIT[t.verdict].className}`}>
                {FIT[t.verdict].label}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-base text-ink-light">💪 Do těla</div>
              <div className="text-sm text-muted">{r.style.hardness.text}</div>
            </div>
            <span className={`shrink-0 px-2 py-0.5 rounded text-sm font-heading font-bold ${HARDNESS[r.style.hardness.verdict].className}`}>
              {HARDNESS[r.style.hardness.verdict].label}
            </span>
          </div>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-base text-ink-light">Rozestavění <span className="whitespace-nowrap">{r.style.formation.formation}</span></div>
              <div className="text-sm text-muted">{r.style.formation.text}</div>
            </div>
            <span className={`shrink-0 px-2 py-0.5 rounded text-sm font-heading font-bold ${FAMILIARITY[r.style.formation.familiarity].className}`}>
              {FAMILIARITY[r.style.formation.familiarity].label}
            </span>
          </div>
        </div>
      </div>

      <div className="card p-4">
        <div className="font-heading font-bold text-sm text-ink mb-3">⚠️ Na co si dát pozor</div>
        {r.warnings.length === 0 ? (
          <div className="text-sm text-muted">Nic, co by hořelo.</div>
        ) : (
          <ul className="space-y-2.5">
            {r.warnings.map((w, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="text-base shrink-0" title={WARNING_ICON[w.kind].label} aria-label={WARNING_ICON[w.kind].label}>
                  {WARNING_ICON[w.kind].icon}
                </span>
                <p className="text-base text-ink-light leading-snug"><RichText parts={w.text} /></p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card p-3 text-sm text-muted space-y-1">
        <div>
          Asistent jen radí: sestavu, taktiku i přestupy volíš ty. Jeho pohled na kádr se během herního týdne nemění,
          rozbor se posune jen se změnou kádru nebo sestavy.
        </div>
        <div>
          Nadváhu řešíš v záložce Postava, únavu tréninkem a rotací. Lepší asistent v{" "}
          <Link href="/zamestnanci" className="text-pitch-600 underline decoration-pitch-500/30">Zaměstnancích</Link>{" "}
          uvidí víc a přesněji.
        </div>
      </div>
    </>
  );
}
