"use client";

import { useState, useEffect } from "react";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { Card, CardBody, Spinner, SectionLabel, useConfirm } from "@/components/ui";

interface EventEffect {
  type: string;
  value: number;
  description: string;
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
}

const EVENT_ICONS: Record<string, string> = {
  zabijacka: "\u{1F416}",
  ples: "\u{1F483}",
  vanocni_turnaj: "\u{1F384}",
  silvestr: "\u{1F386}",
  letni_soustredeni: "\u26FA",
  obecni_zpravodaj: "\u{1F4F0}",
  den_obce: "\u{1F3AA}",
  pout: "\u{1F3A0}",
  brigada_hriste: "\u{1F528}",
  sponzorsky_den: "\u{1F454}",
  konec_skoly: "\u{1F393}",
  hospoda: "\u{1F37A}",
  pratele: "\u26BD",
  adhoc_brigada: "\u{1F528}",
  stolni_fotbalek: "\u{1F3AF}",
  sponzor_vecere: "\u{1F37D}\uFE0F",
  obecni_slavnost: "\u{1F3AA}",
  exligovec: "\u2B50",
  narozeniny: "\u{1F382}",
  vylet_zapas: "\u{1F3DF}\uFE0F",
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

function effectColor(type: string, value: number): string {
  if (type === "budget" && value > 0) return "text-pitch-500";
  if (type === "budget" && value < 0) return "text-card-red";
  if (type === "morale" && value > 0) return "text-pitch-500";
  if (type === "morale" && value < 0) return "text-card-red";
  if (type === "reputation") return "text-gold-600";
  return "text-ink";
}

export default function EventsPage() {
  const { teamId } = useTeam();
  const [events, setEvents] = useState<SeasonalEvent[]>([]);
  const [currentGameWeek, setCurrentGameWeek] = useState(0);
  const [loading, setLoading] = useState(true);
  const [choosing, setChoosing] = useState<string | null>(null);
  const [appliedEffects, setAppliedEffects] = useState<Record<string, EventEffect[]>>({});

  useEffect(() => {
    if (!teamId) return;
    apiFetch<{ events: SeasonalEvent[]; currentGameWeek: number }>(`/api/teams/${teamId}/seasonal-events`)
      .then((d) => { setEvents(d.events); setCurrentGameWeek(d.currentGameWeek ?? 0); setLoading(false); })
      .catch(() => setLoading(false));
  }, [teamId]);

  const { confirm, dialog: confirmDialog } = useConfirm();

  const handleChoice = async (eventId: string, choiceId: string, choiceLabel: string, effects: EventEffect[]) => {
    if (!teamId || choosing) return;
    const ok = await confirm({
      title: "Potvrdit rozhodnutí?",
      description: choiceLabel,
      details: effects.map((e) => ({
        label: e.type === "budget" ? "Rozpočet" : e.type === "morale" ? "Morálka" : e.type === "reputation" ? "Reputace" : e.type,
        value: e.description,
        color: e.value >= 0 ? "text-pitch-500" : "text-card-red",
      })),
      confirmLabel: "Potvrdit",
    });
    if (!ok) return;
    setChoosing(eventId);
    try {
      const res = await apiFetch<{ ok: boolean; appliedEffects: EventEffect[] }>(
        `/api/teams/${teamId}/seasonal-events/${eventId}/choose`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ choiceId }) },
      );
      setEvents((prev) => prev.map((e) => e.id === eventId ? { ...e, status: "resolved" } : e));
      setAppliedEffects((prev) => ({ ...prev, [eventId]: res.appliedEffects }));
    } catch { /* ignore */ }
    setChoosing(null);
  };

  if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>;

  const pending = events.filter((e) => e.status === "pending" && e.gameWeek <= currentGameWeek);
  const upcoming = events.filter((e) => e.status !== "resolved" && e.gameWeek > currentGameWeek);
  const past = events.filter((e) => e.status === "resolved" || (e.status === "active" && e.gameWeek <= currentGameWeek));

  return (
    <div className="page-container space-y-5">
      {confirmDialog}

      {/* Permanent actions */}
      <PubAction teamId={teamId} />

      {/* Pending — needs decision */}
      {pending.length > 0 && (
        <div>
          <SectionLabel>Čeká na rozhodnutí</SectionLabel>
          <div className="space-y-4">
            {pending.map((ev) => (
              <div key={ev.id} className={`card border-2 p-5 ${EVENT_COLORS[ev.type] ?? "bg-surface border-gray-200"}`}>
                <div className="flex items-start gap-3 mb-3">
                  <span className="text-3xl">{EVENT_ICONS[ev.type] ?? "\u{1F3C6}"}</span>
                  <div>
                    <h3 className="font-heading font-bold text-lg">{ev.title}</h3>
                    <p className="text-sm text-ink-light mt-1">{ev.description}</p>
                    <div className="text-xs text-muted mt-1">Týden {ev.gameWeek}</div>
                  </div>
                </div>

                {appliedEffects[ev.id] ? (
                  <div className="bg-white/60 rounded-xl p-3 mt-3">
                    <div className="text-sm font-heading font-bold text-pitch-500 mb-1">Rozhodnuto!</div>
                    {appliedEffects[ev.id].map((eff, i) => (
                      <div key={i} className={`text-sm font-medium ${effectColor(eff.type, eff.value)}`}>
                        {eff.description}
                      </div>
                    ))}
                  </div>
                ) : ev.choices && (
                  <div className="space-y-2 mt-3">
                    {ev.choices.map((ch) => (
                      <button
                        key={ch.id}
                        onClick={() => handleChoice(ev.id, ch.id, ch.label, ch.effects)}
                        disabled={choosing === ev.id}
                        className="w-full text-left p-3 rounded-xl bg-white/70 hover:bg-white transition-colors border border-transparent hover:border-pitch-500/20"
                      >
                        <div className="font-heading font-bold text-sm">{ch.label}</div>
                        <div className="flex flex-wrap gap-3 mt-1">
                          {ch.effects.map((eff, i) => (
                            <span key={i} className={`text-xs font-medium ${effectColor(eff.type, eff.value)}`}>
                              {eff.description}
                            </span>
                          ))}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upcoming events */}
      {upcoming.length > 0 && (
        <div>
          <SectionLabel>Nadcházející</SectionLabel>
          <div className="space-y-2">
            {upcoming.map((ev) => (
              <Card key={ev.id}>
                <CardBody>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{EVENT_ICONS[ev.type] ?? "\u{1F3C6}"}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-heading font-bold text-sm">{ev.title}</div>
                      <div className="text-xs text-muted">Týden {ev.gameWeek}</div>
                    </div>
                    <div className="text-xs text-muted italic">za {ev.gameWeek - currentGameWeek} {ev.gameWeek - currentGameWeek === 1 ? "kolo" : "kol"}</div>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Past events */}
      {past.length > 0 && (
        <div>
          <SectionLabel>Proběhlé</SectionLabel>
          <div className="space-y-2">
            {past.map((ev) => (
              <Card key={ev.id}>
                <CardBody>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl shrink-0">{EVENT_ICONS[ev.type] ?? "\u{1F3C6}"}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-heading font-bold text-sm">{ev.title}</div>
                      <div className="text-xs text-muted">Týden {ev.gameWeek}</div>
                      {(appliedEffects[ev.id] ?? ev.effects).length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-1">
                          {(appliedEffects[ev.id] ?? ev.effects).map((eff, i) => (
                            <span key={i} className={`text-xs font-medium ${effectColor(eff.type, eff.value)}`}>
                              {eff.description}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        </div>
      )}

      {events.length === 0 && (
        <Card>
          <CardBody>
            <p className="text-center text-muted py-4">Zatím žádné události v této sezóně.</p>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

/* ── Pub Action ── */

function PubAction({ teamId }: { teamId: string | null }) {
  const [available, setAvailable] = useState(false);
  const [daysLeft, setDaysLeft] = useState(0);
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<Array<{ type: string; value: number; description: string }> | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!teamId) return;
    apiFetch<{ available: boolean; daysLeft?: number }>(`/api/teams/${teamId}/pub-status`)
      .then((d) => { setAvailable(d.available); setDaysLeft(d.daysLeft ?? 0); })
      .catch(() => {});
  }, [teamId]);

  const visit = async (choice: "all" | "one" | "no") => {
    if (!teamId || sending) return;
    setSending(true);
    setAvailable(false);
    try {
      const res = await apiFetch<{ ok: boolean; effects: Array<{ type: string; value: number; description: string }> }>(
        `/api/teams/${teamId}/pub-visit`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ choice }) },
      );
      setResult(res.effects);
      setOpen(false);
    } catch {
      setAvailable(true);
    }
    setSending(false);
  };

  return (
    <div>
      <SectionLabel>Akce</SectionLabel>
      <Card>
        <CardBody>
          <div className="flex items-center gap-3">
            <span className="text-2xl shrink-0">🍺</span>
            <div className="flex-1 min-w-0">
              <div className="font-heading font-bold text-sm">Posezení v hospodě</div>
              <div className="text-xs text-muted">Vezmi kluky na pivo. Morálka nahoru, kondice dolů.</div>
              {result && (
                <div className="flex flex-wrap gap-2 mt-1">
                  {result.map((eff, i) => (
                    <span key={i} className={`text-xs font-medium ${eff.value >= 0 ? "text-pitch-500" : "text-card-red"}`}>
                      {eff.description}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {available && !result ? (
              <button onClick={() => setOpen(!open)}
                className="px-3 py-1.5 bg-amber-500 text-white rounded-lg font-heading font-bold text-xs shrink-0">
                Do hospody
              </button>
            ) : (
              <span className="text-xs text-muted italic shrink-0">
                {result ? "Hotovo" : `za ${daysLeft} ${daysLeft === 1 ? "den" : "dny"}`}
              </span>
            )}
          </div>
          {open && (
            <div className="space-y-2 mt-3 pt-3 border-t border-gray-100">
              <button onClick={() => visit("all")} disabled={sending}
                className="w-full text-left p-3 rounded-xl bg-amber-50 hover:bg-amber-100 transition-colors border border-amber-200">
                <div className="font-heading font-bold text-sm">Celý tým jde</div>
                <div className="flex flex-wrap gap-2 mt-1">
                  <span className="text-xs font-medium text-pitch-500">+8 morálka</span>
                  <span className="text-xs font-medium text-card-red">-15 kondice</span>
                  <span className="text-xs font-medium text-card-red">-1 500 Kč</span>
                </div>
              </button>
              <button onClick={() => visit("one")} disabled={sending}
                className="w-full text-left p-3 rounded-xl bg-amber-50/50 hover:bg-amber-50 transition-colors border border-amber-100">
                <div className="font-heading font-bold text-sm">Jen jedno pivo</div>
                <div className="flex flex-wrap gap-2 mt-1">
                  <span className="text-xs font-medium text-pitch-500">+3 morálka</span>
                  <span className="text-xs font-medium text-card-red">-5 kondice</span>
                  <span className="text-xs font-medium text-card-red">-500 Kč</span>
                </div>
              </button>
              <button onClick={() => visit("no")} disabled={sending}
                className="w-full text-left p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors border border-gray-200">
                <div className="font-heading font-bold text-sm">Zakázat</div>
                <div className="flex flex-wrap gap-2 mt-1">
                  <span className="text-xs font-medium text-card-red">-3 morálka</span>
                </div>
              </button>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
