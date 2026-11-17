"use client";

import { triggerMenuBadgesRefresh } from "@/hooks/use-menu-badges";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { apiFetch, apiAction } from "@/lib/api";
import { Card, CardBody, SectionLabel, useConfirm, ListCard, ListRow, RowIcon, RowGroup, PageLoading } from "@/components/ui";
import { DistrictEvents } from "./DistrictEvents";

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
    <span className="flex flex-wrap gap-1 mt-1.5">
      {effects.map((e, i) => (
        <span key={i} className={`text-xs font-medium px-1.5 py-0.5 rounded ${TONE_CHIP[effectTone(e)]}`}>{e.description}</span>
      ))}
    </span>
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
      triggerMenuBadgesRefresh();
    }
    setChoosing(null);
  };

  if (loading) return <PageLoading />;

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
        <div className="space-y-4">
          {pending.map((ev) => {
            const left = decisionWindow - (currentGameWeek - ev.gameWeek);
            // Každá událost je karta: nahoře co se stalo, pod tím volby jako klikací řádky.
            return (
              <ListCard key={ev.id} title="Čeká na tvoje rozhodnutí">
                <ListRow tone={left <= 1 ? "danger" : "warn"}
                  leading={<RowIcon>{EVENT_ICONS[ev.type] ?? "\u{1F4C5}"}</RowIcon>}
                  title={ev.title}
                  detail={<>
                    <span className="block">{ev.description}</span>
                    <span className={`block mt-1.5 font-heading font-bold ${left <= 1 ? "text-card-red" : "text-muted"}`}>
                      {left <= 1 ? "Rozhodni se ještě před dalším kolem, pak to propadne." : `Na rozhodnutí máš ${left} ${kola(left)}.`}
                    </span>
                  </>} />
                <div className={choosing === ev.id ? "opacity-50 pointer-events-none" : ""}>
                  {ev.choices!.map((ch) => (
                    <ListRow key={ch.id}
                      onClick={() => handleChoice(ev, ch)}
                      leading={<span className="w-9" aria-hidden="true" />}
                      title={ch.label}
                      detail={ch.effects.length > 0 ? <EffectChips effects={ch.effects} /> : undefined} />
                  ))}
                </div>
              </ListCard>
            );
          })}
        </div>
      )}

      <DistrictEvents teamId={teamId} />

      {loadError && (
        <Card>
          <CardBody>
            <p className="text-center text-card-red py-2">Události se nepodařilo načíst. Zkus stránku obnovit.</p>
          </CardBody>
        </Card>
      )}

      {soon.length > 0 && (
        <ListCard title="Brzy" count={soon.length}>
          {soon.map((ev) => {
            const inRounds = ev.gameWeek - currentGameWeek;
            return (
              <ListRow key={ev.id}
                leading={<RowIcon>{EVENT_ICONS[ev.type] ?? "\u{1F4C5}"}</RowIcon>}
                title={ev.title}
                detail={ev.description}
                trailing={<span className="text-meta text-muted whitespace-nowrap">za {inRounds} {kola(inRounds)}</span>} />
            );
          })}
        </ListCard>
      )}

      {diaryByWeek.length > 0 && (
        <ListCard title="Deník klubu">
          {diaryByWeek.map(({ week, items }) => (
            <div key={week}>
              <RowGroup label={week === 0 ? "Před sezónou" : `${week}. kolo`} />
              {items.map((ev) => <DiaryItem key={ev.id} ev={ev} applied={appliedEffects[ev.id]} />)}
            </div>
          ))}
        </ListCard>
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
  const icon = ev.type === "between_round" ? "\u{1F4AC}" : (EVENT_ICONS[ev.type] ?? "\u{1F4C5}");
  return (
    // Propadlé rozhodnutí nese zlatý proužek; dřív se jen ztlumilo.
    <ListRow tone={missed ? "warn" : undefined}
      leading={<RowIcon>{icon}</RowIcon>}
      title={ev.title}
      detail={
        <>
          {ev.type === "between_round" && <span className="block">{ev.description}</span>}
          {chosen && <span className="block">Rozhodl jsi: <span className="text-ink font-medium">{chosen.label}</span></span>}
          {missed && <span className="block text-muted">{ev.choices ? "Nerozhodl ses včas, propadlo." : "Prošlo bez tebe."}</span>}
          <EffectChips effects={effects} />
        </>
      } />
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
            <div className={`-mx-5 -mb-4 mt-3 border-t border-line ${sending ? "opacity-50 pointer-events-none" : ""}`}>
              {PUB_CHOICES.map((c) => (
                <ListRow key={c.id} onClick={() => visit(c.id)}
                  title={c.label}
                  meta={c.hint || undefined}
                  detail={
                    <span className="flex flex-wrap gap-1 mt-1">
                      {c.effects.map((e, i) => (
                        <span key={i} className={`text-xs font-medium px-1.5 py-0.5 rounded ${TONE_CHIP[e.tone]}`}>{e.text}</span>
                      ))}
                    </span>
                  } />
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
