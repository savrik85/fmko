"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Card, CardBody, SectionLabel } from "@/components/ui";
import { FaceAvatar } from "@/components/players/face-avatar";

/** Okresní akce (pouť, bál…): co se na ní stalo lidem klubu. Data z GET /teams/:id/district-events. */
interface EventPerson {
  kind: "coach" | "player";
  id: string;
  name: string;
  teamName: string;
  own: boolean;
  avatar: Record<string, unknown> | null;
  effects: Array<{ label: string; tone: "good" | "bad" | "neutral" }>;
}

interface DistrictEvent {
  id: string;
  title: string;
  place: string;
  eventDate: string;
  status: string;
  myChoice: "alone" | "with_players" | "skip" | null;
  headline: string | null;
  scenes: Array<{ text: string; people: EventPerson[] }>;
}

const CHOICE_TEXT: Record<string, string> = {
  with_players: "Byl jsi tam s hráči",
  alone: "Byl jsi tam sám",
  skip: "Nešel jsi",
  none: "Neodpověděl jsi",
};

const PENDING_TEXT: Record<string, string> = {
  with_players: "Přijdeš s hráči",
  alone: "Přijdeš sám",
  skip: "Nepřijdeš",
  none: "Čeká na tvou odpověď v telefonu",
};

const TONE_CLASS: Record<string, string> = {
  good: "bg-pitch-50 text-pitch-700",
  bad: "bg-red-50 text-card-red",
  neutral: "bg-surface text-muted",
};

function formatDate(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("cs-CZ", { day: "numeric", month: "long", timeZone: "UTC" });
}

function Avatar({ person, size }: { person: EventPerson; size: number }) {
  if (person.avatar) {
    return <FaceAvatar faceConfig={person.avatar} size={size} className="shrink-0 rounded-full bg-surface overflow-hidden" />;
  }
  return (
    <div
      className="shrink-0 rounded-full bg-surface text-muted font-heading font-bold flex items-center justify-center"
      style={{ width: size, height: size * 1.2 }}
      aria-hidden
    >
      {person.name.replace(/^trenér\s+/, "").charAt(0)}
    </div>
  );
}

function PersonRow({ person }: { person: EventPerson }) {
  return (
    <li className="flex items-start gap-2.5">
      <Avatar person={person} size={34} />
      <div className="min-w-0 flex-1">
        <div className="text-sm leading-tight">
          {person.kind === "player" ? (
            <Link href={`/hrac/${person.id}`} className="font-heading font-bold text-ink hover:text-pitch-500 underline decoration-pitch-500/20">
              {person.name}
            </Link>
          ) : (
            <span className="font-heading font-bold text-ink">{person.name}</span>
          )}
          <span className="text-muted"> · {person.own ? "tvůj klub" : person.teamName}</span>
        </div>
        {person.effects.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {person.effects.map((e, i) => (
              <span key={i} className={`text-xs font-medium px-1.5 py-0.5 rounded ${TONE_CLASS[e.tone]}`}>{e.label}</span>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

function EventCard({ ev }: { ev: DistrictEvent }) {
  const done = ev.status === "done";
  return (
    <Card>
      <CardBody className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="text-3xl leading-none shrink-0" aria-hidden>{"\u{1F3A1}"}</span>
          <div className="min-w-0 flex-1">
            <div className="font-heading font-bold text-lg leading-tight">{ev.title}</div>
            <div className="text-sm text-muted">{ev.place} · {formatDate(ev.eventDate)}</div>
            <span className="inline-block mt-1.5 text-xs font-heading font-bold px-2 py-0.5 rounded-full bg-surface text-ink">
              {(done ? CHOICE_TEXT : PENDING_TEXT)[ev.myChoice ?? "none"]}
            </span>
          </div>
        </div>

        {!done && (
          <p className="text-sm text-muted">Co se na akci stane, uvidíš tady, až proběhne.</p>
        )}

        {done && ev.scenes.length === 0 && (
          <p className="text-sm text-muted">
            {ev.myChoice === "skip" || ev.myChoice === null
              ? "Z tvého klubu tam nikdo nebyl, nebo se drželi stranou."
              : "Tvoji lidé tam byli, ale drželi se stranou. Nic se nestalo."}
          </p>
        )}

        {ev.scenes.map((sc, i) => {
          const people = [...sc.people].sort((a, b) => Number(b.own) - Number(a.own));
          return (
            <div key={i} className="border-t border-gray-100 pt-3 space-y-2.5">
              <p className="text-[15px] leading-relaxed text-ink">{sc.text}</p>
              {people.length > 0 && (
                <ul className="space-y-2">
                  {people.map((p) => <PersonRow key={`${p.kind}-${p.id}`} person={p} />)}
                </ul>
              )}
            </div>
          );
        })}

        {done && ev.headline && (
          <Link href="/zpravodaj" className="block text-sm border-t border-gray-100 pt-3 text-pitch-700 hover:text-pitch-500">
            Ve Zpravodaji: <span className="font-heading font-bold underline decoration-pitch-500/30">{ev.headline}</span>
          </Link>
        )}
      </CardBody>
    </Card>
  );
}

export function DistrictEvents({ teamId }: { teamId: string | null }) {
  const [events, setEvents] = useState<DistrictEvent[]>([]);

  useEffect(() => {
    if (!teamId) return;
    apiFetch<{ events: DistrictEvent[] }>(`/api/teams/${teamId}/district-events`)
      .then((r) => setEvents(r.events))
      .catch((e) => console.error("Načtení okresních akcí se nezdařilo:", e));
  }, [teamId]);

  if (!events.length) return null;
  return (
    <div>
      <SectionLabel>Okresní akce</SectionLabel>
      <div className="space-y-4">
        {events.map((ev) => <EventCard key={ev.id} ev={ev} />)}
      </div>
    </div>
  );
}
