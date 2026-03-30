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
};

const EVENT_COLORS: Record<string, string> = {
  zabijacka: "bg-amber-100 border-amber-300",
  ples: "bg-purple-50 border-purple-200",
  vanocni_turnaj: "bg-red-50 border-red-200",
  silvestr: "bg-yellow-50 border-yellow-200",
  letni_soustredeni: "bg-green-50 border-green-200",
  obecni_zpravodaj: "bg-blue-50 border-blue-200",
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
