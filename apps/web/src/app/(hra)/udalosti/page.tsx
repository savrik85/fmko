"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { apiFetch, apiAction } from "@/lib/api";
import { Card, CardBody, Spinner, SectionLabel, useConfirm } from "@/components/ui";
import { DistrictEvents } from "./DistrictEvents";
import { Interviews } from "./Interviews";

interface EventEffect {
  type: string;
  value: number;
  description: string;
  chance?: number;
}

interface EventChoice {
  id: string;
  label: string;
  effects: EventEffect[];
}

interface SeasonalEvent {
  id: string;
  type: string;
  title: string;
  description: string;
  effects: EventEffect[];
  choices: EventChoice[] | null;
  gameWeek: number;
  status: "pending" | "active" | "resolved";
  /** Id zvolené možnosti, `missed` = propadlo, `auto` = stalo se samo. */
  chosenChoiceId: string | null;
}

const EVENT_ICONS: Record<string, string> = {
  zabijacka: "\u{1F416}",
  ples: "\u{1F483}",
  vanocni_turnaj: "\u{1F384}",
  silvestr: "\u{1F386}",
  letni_soustredeni: "⛺",
  obecni_zpravodaj: "\u{1F4F0}",
  den_obce: "\u{1F3AA}",
  pout: "\u{1F3A0}",
  brigada_hriste: "\u{1F528}",
  sponzorsky_den: "\u{1F454}",
  konec_skoly: "\u{1F393}",
  hospoda: "\u{1F37A}",
  pratele: "⚽",
  adhoc_brigada: "\u{1F528}",
  stolni_fotbalek: "\u{1F3AF}",
  sponzor_vecere: "\u{1F37D}️",
  obecni_slavnost: "\u{1F3AA}",
  exligovec: "⭐",
  narozeniny: "\u{1F382}",
  vylet_zapas: "\u{1F3DF}️",
  kontrola_svaz: "\u{1F4CB}",
};

const EVENT_COLORS: Record<string, string> = {
  zabijacka: "bg-amber-100 border-amber-300",
  ples: "bg-purple-50 border-purple-200",
  vanocni_turnaj: "bg-red-50 border-red-200",
  silvestr: "bg-yellow-50 border-yellow-200",
  letni_soustredeni: "bg-green-50 border-green-200",
  obecni_zpravodaj: "bg-blue-50 border-blue-200",
  hospoda: "bg-amber-50 border-amber-200",
  pratele: "bg-green-50 border-green-200",
  adhoc_brigada: "bg-orange-50 border-orange-200",
  stolni_fotbalek: "bg-blue-50 border-blue-200",
  sponzor_vecere: "bg-indigo-50 border-indigo-200",
  obecni_slavnost: "bg-pink-50 border-pink-200",
  exligovec: "bg-yellow-50 border-yellow-200",
  narozeniny: "bg-rose-50 border-rose-200",
  vylet_zapas: "bg-emerald-50 border-emerald-200",
  kontrola_svaz: "bg-gray-100 border-gray-300",
};

const EFFECT_NAMES: Record<string, string> = {
  budget: "Peníze",
  morale: "Nálada",
  reputation: "Reputace",
  condition: "Kondice",
  stamina: "Výdrž",
  stamina_boost: "Výdrž",
  experience: "Zkušenosti",
  alcohol_event: "Kocovina",
  pitch_condition: "Trávník",
  injury: "Zranění",
  player_leave: "Hráč",
};

function effectTone(e: EventEffect): "good" | "bad" | "neutral" {
  if (e.chance !== undefined) return "neutral";
  if (e.type === "alcohol_event" || e.type === "injury" || e.type === "player_leave") return "bad";
  if (e.value > 0) return "good";
  if (e.value < 0) return "bad";
  return "neutral";
}

const TONE_TEXT: Record<string, string> = {
  good: "text-pitch-600",
  bad: "text-card-red",
  neutral: "text-ink-light",
};

const TONE_CHIP: Record<string, string> = {
  good: "bg-pitch-50 text-pitch-700",
  bad: "bg-red-50 text-card-red",
  neutral: "bg-surface text-ink-light",
};

function kola(n: number): string {
  return n === 1 ? "kolo" : n >= 2 && n <= 4 ? "kola" : "kol";
}

function EffectChips({ effects }: { effects: EventEffect[] }) {
  if (!effects.length) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {effects.map((e, i) => (
        <span key={i} className={`text-xs font-medium px-1.5 py-0.5 rounded ${TONE_CHIP[effectTone(e)]}`}>{e.description}</span>
      ))}
    </div>
  );
}

export default function EventsPage() {
  const { teamId } = useTeam();
  const [events, setEvents] = useState<SeasonalEvent[]>([]);
  const [currentGameWeek, setCurrentGameWeek] = useState(0);
  const [decisionWindow, setDecisionWindow] = useState(2);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [choosing, setChoosing] = useState<string | null>(null);
  const [appliedEffects, setAppliedEffects] = useState<Record<string, EventEffect[]>>({});

  useEffect(() => {
    if (!teamId) return;
    apiFetch<{ events: SeasonalEvent[]; currentGameWeek: number; decisionWindow?: number }>(`/api/teams/${teamId}/seasonal-events`)
      .then((d) => {
        setEvents(d.events);
        setCurrentGameWeek(d.currentGameWeek ?? 0);
        if (d.decisionWindow) setDecisionWindow(d.decisionWindow);
        setLoading(false);
      })
      .catch((e) => { console.error("seasonal-events fetch:", e); setLoadError(true); setLoading(false); });
  }, [teamId]);

  const { confirm, dialog: confirmDialog } = useConfirm();

  const handleChoice = async (ev: SeasonalEvent, choice: EventChoice) => {
    if (!teamId || choosing) return;
    const ok = await confirm({
      title: "Potvrdit rozhodnutí?",
      description: choice.label,
      details: choice.effects.map((e) => ({
        label: EFFECT_NAMES[e.type] ?? "Dopad",
        value: e.description,
        color: TONE_TEXT[effectTone(e)],
      })),
      confirmLabel: "Potvrdit",
    });
    if (!ok) return;
    setChoosing(ev.id);
    const result: { applied: EventEffect[] | null } = { applied: null };
    const done = await apiAction(
      apiFetch<{ ok: boolean; appliedEffects: EventEffect[] }>(
        `/api/teams/${teamId}/seasonal-events/${ev.id}/choose`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ choiceId: choice.id }) },
      ).then((r) => { result.applied = r.appliedEffects; }),
      "Rozhodnutí se nepodařilo uložit",
    );
    if (done) {
      setEvents((prev) => prev.map((e) => e.id === ev.id ? { ...e, status: "resolved", chosenChoiceId: choice.id } : e));
      if (result.applied) setAppliedEffects((prev) => ({ ...prev, [ev.id]: result.applied! }));
    }
    setChoosing(null);
  };

  if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>;

  // K rozhodnutí jsou jen události s volbami. Události bez voleb jsou taky "pending",
  // ale vyřeší je denní tick sám — do sekce "čeká na tebe" nepatří.
  const pending = events
    .filter((e) => e.status === "pending" && e.choices !== null && e.gameWeek <= currentGameWeek)
    .sort((a, b) => a.gameWeek - b.gameWeek);
  // Dopředu se ukáže jen nejbližší akce, ne celý zbytek sezóny.
  const upcoming = events
    .filter((e) => e.status !== "resolved" && e.gameWeek > currentGameWeek)
    .sort((a, b) => a.gameWeek - b.gameWeek);
  const nextWeek = upcoming[0]?.gameWeek;
  const soon = upcoming.filter((e) => e.gameWeek === nextWeek);
  // Okresní akce mají vlastní sekci; starší záznamy z testu sem nepatří.
  const diary = events
    .filter((e) => e.type !== "district_event" && e.type !== "hospoda_action")
    .filter((e) => e.status === "resolved" || (e.status !== "pending" && e.gameWeek <= currentGameWeek))
    .sort((a, b) => b.gameWeek - a.gameWeek);
  const diaryByWeek = diary.reduce<Array<{ week: number; items: SeasonalEvent[] }>>((acc, e) => {
    const last = acc[acc.length - 1];
    if (last && last.week === e.gameWeek) last.items.push(e);
    else acc.push({ week: e.gameWeek, items: [e] });
    return acc;
  }, []);

  return (
    <div className="page-container space-y-6">
      {confirmDialog}

      {pending.length > 0 && (
        <div>
          <SectionLabel>Čeká na tvoje rozhodnutí</SectionLabel>
          <div className="space-y-4">
            {pending.map((ev) => {
              const left = decisionWindow - (currentGameWeek - ev.gameWeek);
              return (
                <div key={ev.id} className={`card border-2 p-4 sm:p-5 ${EVENT_COLORS[ev.type] ?? "bg-surface border-gray-200"}`}>
                  <div className="flex items-start gap-3">
                    <span className="text-3xl leading-none shrink-0" aria-hidden>{EVENT_ICONS[ev.type] ?? "\u{1F4C5}"}</span>
                    <div className="min-w-0">
                      <h3 className="font-heading font-bold text-lg leading-tight">{ev.title}</h3>
                      <p className="text-sm text-ink-light mt-1">{ev.description}</p>
                      <div className={`text-xs mt-1.5 font-heading font-bold ${left <= 1 ? "text-card-red" : "text-muted"}`}>
                        {left <= 1 ? "Rozhodni se ještě před dalším kolem, pak to propadne." : `Na rozhodnutí máš ${left} ${kola(left)}.`}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2 mt-3">
                    {ev.choices!.map((ch) => (
                      <button
                        key={ch.id}
                        onClick={() => handleChoice(ev, ch)}
                        disabled={choosing === ev.id}
                        className="w-full text-left p-3 rounded-xl bg-white/80 hover:bg-white transition-colors border border-transparent hover:border-pitch-500/30 disabled:opacity-50"
                      >
                        <div className="font-heading font-bold text-sm">{ch.label}</div>
                        <EffectChips effects={ch.effects} />
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Interviews />

      <DistrictEvents teamId={teamId} />

      {loadError && (
        <Card>
          <CardBody>
            <p className="text-center text-card-red py-2">Události se nepodařilo načíst. Zkus stránku obnovit.</p>
          </CardBody>
        </Card>
      )}

      {soon.length > 0 && (
        <div>
          <SectionLabel>Brzy</SectionLabel>
          <div className="space-y-2">
            {soon.map((ev) => {
              const inRounds = ev.gameWeek - currentGameWeek;
              return (
                <Card key={ev.id}>
                  <CardBody>
                    <div className="flex items-center gap-3">
                      <span className="text-2xl shrink-0" aria-hidden>{EVENT_ICONS[ev.type] ?? "\u{1F4C5}"}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-heading font-bold text-sm">{ev.title}</div>
                        <div className="text-xs text-muted">{ev.description}</div>
                      </div>
                      <div className="text-xs text-muted shrink-0">za {inRounds} {kola(inRounds)}</div>
                    </div>
                  </CardBody>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {diaryByWeek.length > 0 && (
        <div>
          <SectionLabel>Deník klubu</SectionLabel>
          <Card>
            <CardBody className="space-y-5">
              {diaryByWeek.map(({ week, items }) => (
                <div key={week}>
                  <div className="text-xs font-heading font-bold uppercase tracking-wide text-muted mb-2">
                    {week === 0 ? "Před sezónou" : `${week}. kolo`}
                  </div>
                  <ul className="space-y-3">
                    {items.map((ev) => <DiaryItem key={ev.id} ev={ev} applied={appliedEffects[ev.id]} />)}
                  </ul>
                </div>
              ))}
            </CardBody>
          </Card>
        </div>
      )}

      {!loadError && events.length === 0 && (
        <Card>
          <CardBody>
            <p className="text-center text-muted py-4">Zatím se v klubu nic nestalo.</p>
          </CardBody>
        </Card>
      )}

      <PubAction teamId={teamId} />
    </div>
  );
}

/** Jedna položka deníku: co se stalo a jak to dopadlo. */
function DiaryItem({ ev, applied }: { ev: SeasonalEvent; applied?: EventEffect[] }) {
  const chosen = ev.choices?.find((c) => c.id === ev.chosenChoiceId) ?? null;
  const missed = ev.chosenChoiceId === "missed";
  const effects = applied ?? (chosen ? chosen.effects : missed ? [] : ev.effects);
  const icon = ev.type === "between_round" ? null : (EVENT_ICONS[ev.type] ?? "\u{1F4C5}");
  return (
    <li className={`flex items-start gap-3 ${missed ? "opacity-60" : ""}`}>
      {icon && <span className="text-xl leading-none shrink-0 mt-0.5" aria-hidden>{icon}</span>}
      <div className="min-w-0 flex-1">
        <div className="font-heading font-bold text-sm leading-tight">{ev.title}</div>
        {ev.type === "between_round" && <p className="text-sm text-ink-light mt-0.5">{ev.description}</p>}
        {chosen && <div className="text-sm text-ink-light mt-0.5">Rozhodl jsi: <span className="text-ink font-medium">{chosen.label}</span></div>}
        {missed && <div className="text-sm text-muted mt-0.5">{ev.choices ? "Nerozhodl ses včas, propadlo." : "Prošlo bez tebe."}</div>}
        <EffectChips effects={effects} />
      </div>
    </li>
  );
}

/* ── Hospoda ── */

interface PubResult {
  choice: "all" | "one" | "no";
  attendees: number;
  stories: string[];
}

const PUB_CHOICES: Array<{ id: "all" | "one" | "no"; label: string; hint: string; effects: Array<{ text: string; tone: "good" | "bad" }> }> = [
  { id: "all", label: "Celý tým jde", hint: "Pijáci můžou přebrat a ráno mít kocovinu.", effects: [
    { text: "+8 nálada", tone: "good" }, { text: "−15 kondice", tone: "bad" }, { text: "−1 500 Kč", tone: "bad" },
  ] },
  { id: "one", label: "Pozvat na pivo kluka s nejhorší náladou", hint: "", effects: [
    { text: "+3 nálada", tone: "good" }, { text: "−5 kondice", tone: "bad" }, { text: "−500 Kč", tone: "bad" },
  ] },
  { id: "no", label: "Zakázat hospodu", hint: "", effects: [{ text: "−3 nálada celé kabině", tone: "bad" }] },
];

function PubAction({ teamId }: { teamId: string | null }) {
  const [available, setAvailable] = useState(false);
  const [daysLeft, setDaysLeft] = useState(0);
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<PubResult | null>(null);
  const [sending, setSending] = useState(false);
  const { confirm, dialog } = useConfirm();

  useEffect(() => {
    if (!teamId) return;
    apiFetch<{ available: boolean; daysLeft?: number }>(`/api/teams/${teamId}/pub-status`)
      .then((d) => { setAvailable(d.available); setDaysLeft(d.daysLeft ?? 0); })
      .catch((e) => { console.error("pub-status fetch:", e); });
  }, [teamId]);

  const visit = async (choice: "all" | "one" | "no") => {
    if (!teamId || sending) return;
    if (choice === "no" && !(await confirm({ title: "Zakázat hospodu?", description: "Celé kabině klesne nálada.", confirmLabel: "Zakázat" }))) return;
    setSending(true);
    const holder: { r: PubResult | null } = { r: null };
    const ok = await apiAction(
      apiFetch<PubResult & { ok: boolean }>(`/api/teams/${teamId}/pub-visit`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ choice }),
      }).then((r) => { holder.r = { choice, attendees: r.attendees ?? 0, stories: r.stories ?? [] }; }),
      "Do hospody to dnes nevyšlo",
    );
    if (ok && holder.r) {
      setResult(holder.r);
      setAvailable(false);
      setDaysLeft(2);
      setOpen(false);
    }
    setSending(false);
  };

  return (
    <div>
      {dialog}
      <SectionLabel>Hospoda</SectionLabel>
      <Card>
        <CardBody>
          <div className="flex items-center gap-3">
            <span className="text-2xl shrink-0" aria-hidden>🍺</span>
            <div className="flex-1 min-w-0">
              <div className="font-heading font-bold text-sm">Posezení s klukama</div>
              <div className="text-xs text-muted">Nálada nahoru, kondice dolů. Jednou za dva dny.</div>
            </div>
            {available && !result ? (
              <button onClick={() => setOpen(!open)} aria-expanded={open}
                className="px-3 min-h-9 bg-amber-500 text-white rounded-control font-heading font-bold text-sm shrink-0">
                Do hospody
              </button>
            ) : !result && (
              <span className="text-xs text-muted shrink-0">
                {daysLeft > 0 ? `znovu za ${daysLeft} ${daysLeft === 1 ? "den" : "dny"}` : "dnes už ne"}
              </span>
            )}
          </div>

          {result && (
            <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5 text-sm">
              <div className="font-heading font-bold">
                {result.choice === "no" ? "Hospoda je zakázaná, kluci brblají." : `Šlo ${result.attendees} ${result.attendees === 1 ? "kluk" : result.attendees < 5 ? "kluci" : "kluků"}.`}
              </div>
              {result.stories.map((s, i) => <p key={i} className="text-ink-light">{s}</p>)}
              {result.choice !== "no" && (
                <Link href="/hospoda" className="inline-block text-pitch-700 underline decoration-pitch-500/30 hover:text-pitch-500">
                  Celý večer v Hospodě
                </Link>
              )}
            </div>
          )}

          {open && (
            <div className="space-y-2 mt-3 pt-3 border-t border-gray-100">
              {PUB_CHOICES.map((c) => (
                <button key={c.id} onClick={() => visit(c.id)} disabled={sending}
                  className="w-full text-left p-3 rounded-xl bg-amber-50 hover:bg-amber-100 transition-colors border border-amber-200 disabled:opacity-50">
                  <div className="font-heading font-bold text-sm">{c.label}</div>
                  {c.hint && <div className="text-xs text-muted mt-0.5">{c.hint}</div>}
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {c.effects.map((e, i) => (
                      <span key={i} className={`text-xs font-medium px-1.5 py-0.5 rounded ${TONE_CHIP[e.tone]}`}>{e.text}</span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
