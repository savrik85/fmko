"use client";

import { useEffect, useState } from "react";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { Card, CardBody, CardHeader, Spinner, SectionLabel, Badge } from "@/components/ui";
import { FaceAvatar } from "@/components/players/face-avatar";

type OfficialRole = "starosta" | "mistostarosta" | "zastupitel_1" | "zastupitel_2";
type Personality = "podnikatel" | "aktivista" | "sportovec" | "tradicionalista" | "populista";

interface Official {
  id: string;
  villageId: string;
  role: OfficialRole;
  firstName: string;
  lastName: string;
  age: number;
  occupation: string;
  faceConfig: Record<string, unknown>;
  personality: Personality;
  portfolio: string[];
  preferences: Record<string, number>;
  termStartAt: string;
  termEndAt: string;
}

interface Favor {
  global: { favor: number; trust: number };
  perOfficial: Array<{ officialId: string; favor: number; trust: number; lastInteractionAt: string | null }>;
}

interface VillageTeam {
  id: string;
  name: string;
  user_id: string;
  primary_color: string;
  secondary_color: string;
  reputation: number;
  global_favor: number;
}

interface VillageDetail {
  id: string;
  name: string;
  district: string;
  region: string;
  population: number;
  size: string;
  flavor_facts: string | null;
}

interface FeedEvent {
  id: string;
  team_id: string | null;
  team_name: string | null;
  official_id: string | null;
  official_name: string | null;
  official_role: string | null;
  event_type: string;
  description: string;
  game_date: string;
  created_at: string;
}

interface TeamWithVillage {
  id: string;
  village_id: string;
  name: string;
}

const ROLE_LABEL: Record<OfficialRole, string> = {
  starosta: "Starosta",
  mistostarosta: "Místostarosta",
  zastupitel_1: "Zastupitel",
  zastupitel_2: "Zastupitel",
};

const PERSONALITY_LABEL: Record<Personality, string> = {
  podnikatel: "Podnikatel",
  aktivista: "Aktivista",
  sportovec: "Sportovec",
  tradicionalista: "Tradicionalista",
  populista: "Populista",
};

const PERSONALITY_DESC: Record<Personality, string> = {
  podnikatel: "Sleduje finance a sponzorské vazby",
  aktivista: "Brání kulturní a sociální projekty",
  sportovec: "Hodnotí výsledky a místní hráče",
  tradicionalista: "Drží se zvyklostí a místních kořenů",
  populista: "Reaguje na nálady a gesta",
};

const SIZE_LABEL: Record<string, string> = {
  hamlet: "Vesnička",
  village: "Vesnice",
  town: "Městys",
  small_city: "Menší město",
  city: "Město",
};

function favorColor(favor: number): string {
  if (favor >= 70) return "bg-pitch-500";
  if (favor >= 50) return "bg-pitch-400";
  if (favor >= 30) return "bg-amber-400";
  return "bg-card-red";
}

function favorLabel(favor: number): string {
  if (favor >= 80) return "Vynikající";
  if (favor >= 60) return "Dobrá";
  if (favor >= 40) return "Neutrální";
  if (favor >= 20) return "Slabá";
  return "Krize";
}

function FavorBar({ value, label }: { value: number; label?: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-600">{label ?? "Přízeň"}</span>
        <span className="font-semibold tabular-nums">{value}/100</span>
      </div>
      <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
        <div className={`h-full ${favorColor(value)}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

function termRemaining(termEndAt: string): string {
  const now = new Date();
  const end = new Date(termEndAt);
  const diffMs = end.getTime() - now.getTime();
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) return "Funkční období skončilo";
  if (days < 90) return `Ve funkci ještě ${days} dní`;
  const years = days / 365;
  return `Ve funkci ještě ${years.toFixed(1)} let`;
}

export default function ObecPage() {
  const { teamId } = useTeam();
  const [village, setVillage] = useState<VillageDetail | null>(null);
  const [officials, setOfficials] = useState<Official[]>([]);
  const [favor, setFavor] = useState<Favor | null>(null);
  const [teams, setTeams] = useState<VillageTeam[]>([]);
  const [feed, setFeed] = useState<FeedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!teamId) return;
      try {
        const team = await apiFetch<TeamWithVillage>(`/api/teams/${teamId}`);
        if (cancelled) return;
        const villageId = team.village_id;
        const [v, o, f, ts, fd] = await Promise.all([
          apiFetch<VillageDetail>(`/api/villages/${villageId}`),
          apiFetch<Official[]>(`/api/villages/${villageId}/officials`),
          apiFetch<Favor>(`/api/villages/${villageId}/favor?teamId=${teamId}`),
          apiFetch<VillageTeam[]>(`/api/villages/${villageId}/teams`),
          apiFetch<FeedEvent[]>(`/api/villages/${villageId}/feed?limit=20`),
        ]);
        if (cancelled) return;
        setVillage(v);
        setOfficials(o);
        setFavor(f);
        setTeams(ts);
        setFeed(fd);
      } catch (e) {
        console.error("obec page load:", e);
        setError("Nepodařilo se načíst data o obci");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [teamId]);

  if (loading) {
    return <div className="p-8 flex justify-center"><Spinner /></div>;
  }

  if (error || !village || !favor) {
    return <div className="p-8 text-card-red">{error ?? "Obec nenalezena"}</div>;
  }

  const isMultiTeam = teams.length > 1;
  const localPlayersBonus = 0; // Sprint C přidá tracking

  return (
    <div className="space-y-6 p-4 max-w-5xl mx-auto">
      {/* Hero */}
      <Card>
        <CardBody>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-wider text-gray-500">{SIZE_LABEL[village.size] ?? village.size}</div>
              <h1 className="text-3xl font-bold mt-1">{village.name}</h1>
              <div className="text-gray-600 mt-1">
                {village.district}, {village.region} · {village.population.toLocaleString("cs")} obyv.
              </div>
            </div>
            <div className="md:w-72 w-full">
              <div className="text-sm text-gray-600 mb-1">Globální přízeň obce</div>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-4xl font-bold tabular-nums">{favor.global.favor}</span>
                <span className="text-gray-500">/ 100 · {favorLabel(favor.global.favor)}</span>
              </div>
              <FavorBar value={favor.global.favor} label="" />
              <div className="text-xs text-gray-500 mt-1">
                Násobič dotace: ×{(0.5 + favor.global.favor / 100).toFixed(2)}
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Zastupitelstvo */}
      <div>
        <SectionLabel>Zastupitelstvo</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
          {officials.map((o) => {
            const officialFavor = favor.perOfficial.find((p) => p.officialId === o.id);
            const f = officialFavor?.favor ?? 50;
            return (
              <Card key={o.id}>
                <CardBody>
                  <div className="flex gap-4">
                    <FaceAvatar faceConfig={o.faceConfig} size={88} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs uppercase tracking-wider text-gray-500">
                        {ROLE_LABEL[o.role]}
                      </div>
                      <div className="font-semibold text-base mt-0.5 truncate">
                        {o.firstName} {o.lastName}
                      </div>
                      <div className="text-sm text-gray-600 truncate">
                        {o.age} let · {o.occupation}
                      </div>
                      <div className="mt-2">
                        <Badge>{PERSONALITY_LABEL[o.personality]}</Badge>
                      </div>
                      <div className="mt-3">
                        <FavorBar value={f} label="Vztah s námi" />
                      </div>
                      <div className="text-xs text-gray-500 mt-1.5" title={PERSONALITY_DESC[o.personality]}>
                        {termRemaining(o.termEndAt)}
                      </div>
                    </div>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Konkurence (multi-team) */}
      {isMultiTeam && (
        <Card>
          <CardHeader>
            <SectionLabel>Konkurence v obci</SectionLabel>
            <div className="text-xs text-gray-500 mt-1">
              {teams.length} týmů soutěží o přízeň zastupitelstva
            </div>
          </CardHeader>
          <CardBody>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="py-2">Tým</th>
                  <th className="py-2 text-right">Přízeň obce</th>
                  <th className="py-2 text-right">Reputace</th>
                </tr>
              </thead>
              <tbody>
                {teams
                  .slice()
                  .sort((a, b) => b.global_favor - a.global_favor)
                  .map((t) => (
                    <tr key={t.id} className={t.id === teamId ? "font-semibold" : ""}>
                      <td className="py-2 flex items-center gap-2">
                        <span
                          className="inline-block w-3 h-3 rounded-full border border-gray-200"
                          style={{ backgroundColor: t.primary_color }}
                        />
                        {t.name}
                        {t.id === teamId && <span className="text-xs text-gray-500">(náš tým)</span>}
                      </td>
                      <td className="py-2 text-right tabular-nums">{t.global_favor}</td>
                      <td className="py-2 text-right tabular-nums">{t.reputation}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}

      {/* Historie obce */}
      <Card>
        <CardHeader>
          <SectionLabel>Historie obce</SectionLabel>
          <div className="text-xs text-gray-500 mt-1">
            Vidíš i akce konkurenčních týmů — žádné tajnosti.
          </div>
        </CardHeader>
        <CardBody>
          {feed.length === 0 ? (
            <div className="text-sm text-gray-500 italic">Zatím žádné události. Brigády a další akce se objeví po zavedení Sprintu B.</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {feed.map((e) => (
                <li key={e.id} className="py-2 text-sm">
                  <div className="flex justify-between items-baseline gap-2">
                    <span>{e.description}</span>
                    <span className="text-xs text-gray-500 shrink-0">{new Date(e.created_at).toLocaleDateString("cs")}</span>
                  </div>
                  {(e.team_name || e.official_name) && (
                    <div className="text-xs text-gray-500 mt-0.5">
                      {e.team_name && <span>tým: {e.team_name}</span>}
                      {e.team_name && e.official_name && <span> · </span>}
                      {e.official_name && <span>zastupitel: {e.official_name}</span>}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <div className="text-xs text-gray-500 px-1">
        Lokální hrdost: tracking aktivuje Sprint C (kolik místních hraje, kdo nastoupil v posledních zápasech).
      </div>
    </div>
  );
}
