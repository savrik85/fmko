"use client";

import { useEffect, useState } from "react";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { Card, CardBody, CardHeader, Spinner, SectionLabel, Badge, Modal, Button } from "@/components/ui";
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

interface VillageTeamsResp {
  teams: VillageTeam[];
  favorMatrix: Record<string, Record<string, number>>;
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

interface Brigade {
  id: string;
  village_id: string;
  type: string;
  title: string;
  description: string;
  offered_at: string;
  expires_at: string;
  status: "open" | "taken" | "expired" | "completed";
  required_player_count: number;
  duration_hours: number;
  reward_favor: number;
  condition_drain: number;
  morale_change: number;
  taken_team_name: string | null;
  taken_at: string | null;
  offering_official_name: string | null;
  offering_official_role: string | null;
}

interface RosterPlayer {
  id: string;
  first_name: string;
  last_name: string;
  position: string;
  life_context: string;
  status: string | null;
}

interface LocalPride {
  villageName: string;
  totalLocalCount: number;
  avgRating: number | null;
  recentStartersTotal: number;
  locals: Array<{
    id: string;
    firstName: string;
    lastName: string;
    position: string;
    overallRating: number;
    recentStarts: number;
    recentGoals: number;
    recentAssists: number;
    recentAvgRating: number | null;
  }>;
}

interface PubEncounter {
  id: string;
  official_id: string;
  first_name: string;
  last_name: string;
  role: OfficialRole;
  personality: Personality;
  face_config: string;
  expires_at: string;
}

interface Investment {
  id: string;
  village_id: string;
  team_id: string;
  type: string;
  target_facility: string | null;
  offered_amount: number;
  required_contribution: number;
  favor_threshold: number;
  expires_at: string;
  political_cost: number;
}

interface Petition {
  id: string;
  village_id: string;
  team_id: string;
  topic: string;
  title: string;
  description: string;
  cost_money: number;
  reward_favor: number;
  ignore_penalty: number;
  expires_at: string;
}

interface UpcomingMatch {
  match: {
    id: string;
    scheduled_at: string;
    home_name: string;
    away_name: string;
  } | null;
  officials: Array<{
    id: string;
    first_name: string;
    last_name: string;
    role: string;
    personality: string;
    favor: number;
    slot_taken_by: string | null;
    slot_taken_by_name: string | null;
  }>;
  myInvitations: Array<{
    id: string;
    official_id: string;
    status: "sent" | "accepted" | "declined" | "attended";
    gift_cost: number;
    attendance_effects: string | null;
  }>;
}

interface InviteResponse {
  status: string;
  giftCost: number;
  officialName: string;
  probability: number;
  rejectReason?: string | null;
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
  const { teamId: ctxTeamId } = useTeam();
  // Authentický teamId získáme z /api/auth/me — chrání před nekonzistentním
  // localStorage (om_team z jiného přihlášení než aktuální om_token).
  const [teamId, setTeamId] = useState<string | null>(null);
  useEffect(() => {
    apiFetch<{ teamId: string | null }>(`/auth/me`)
      .then((me) => setTeamId(me.teamId))
      .catch((e) => {
        console.error("auth/me load:", e);
        setTeamId(ctxTeamId);
      });
  }, [ctxTeamId]);
  const [village, setVillage] = useState<VillageDetail | null>(null);
  const [officials, setOfficials] = useState<Official[]>([]);
  const [favor, setFavor] = useState<Favor | null>(null);
  const [teams, setTeams] = useState<VillageTeam[]>([]);
  const [favorMatrix, setFavorMatrix] = useState<Record<string, Record<string, number>>>({});
  const [feed, setFeed] = useState<FeedEvent[]>([]);
  const [brigades, setBrigades] = useState<Brigade[]>([]);
  const [petitions, setPetitions] = useState<Petition[]>([]);
  const [respondingPetitionId, setRespondingPetitionId] = useState<string | null>(null);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [respondingInvId, setRespondingInvId] = useState<string | null>(null);
  const [pubEncounters, setPubEncounters] = useState<PubEncounter[]>([]);
  const [respondingPubId, setRespondingPubId] = useState<string | null>(null);
  const [localPride, setLocalPride] = useState<LocalPride | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [upcoming, setUpcoming] = useState<UpcomingMatch | null>(null);
  const [invitingOfficialId, setInvitingOfficialId] = useState<string | null>(null);
  const [villageId, setVillageId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [takeBrigade, setTakeBrigade] = useState<Brigade | null>(null);

  const refresh = async (vid: string) => {
    if (!teamId) return;
    const [v, o, f, ts, fd, bg, up, pe, inv, pub, lp] = await Promise.all([
      apiFetch<VillageDetail>(`/api/villages/${vid}`),
      apiFetch<Official[]>(`/api/villages/${vid}/officials`),
      apiFetch<Favor>(`/api/villages/${vid}/favor?teamId=${teamId}`),
      apiFetch<VillageTeamsResp>(`/api/villages/${vid}/teams`),
      apiFetch<FeedEvent[]>(`/api/villages/${vid}/feed?limit=20`),
      apiFetch<Brigade[]>(`/api/villages/${vid}/brigades`),
      apiFetch<UpcomingMatch>(`/api/villages/upcoming-match?teamId=${teamId}`),
      apiFetch<Petition[]>(`/api/villages/petitions?teamId=${teamId}`),
      apiFetch<Investment[]>(`/api/villages/investments?teamId=${teamId}`),
      apiFetch<PubEncounter[]>(`/api/villages/pub-encounters?teamId=${teamId}`),
      apiFetch<LocalPride>(`/api/villages/local-pride?teamId=${teamId}`),
    ]);
    setVillage(v); setOfficials(o); setFavor(f); setFeed(fd); setBrigades(bg);
    setTeams(ts.teams); setFavorMatrix(ts.favorMatrix);
    setUpcoming(up); setPetitions(pe); setInvestments(inv); setPubEncounters(pub);
    setLocalPride(lp);
  };

  const respondPub = async (id: string, action: "invite_beer" | "ignore") => {
    if (respondingPubId) return;
    setRespondingPubId(id);
    try {
      const res = await apiFetch<{ outcome?: string; beerCost?: number; trustGain?: number; officialName?: string }>(
        `/api/villages/pub-encounters/${id}/respond`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );
      let msg = "";
      if (action === "ignore") msg = "Ignoroval(a) jsi NPC.";
      else if (res.outcome === "scandal") msg = `Skandál! ${res.officialName} odešel znechucen.`;
      else msg = `Pivo s ${res.officialName} — trust +${res.trustGain}, cena ${res.beerCost} Kč.`;
      setToast(msg);
      setTimeout(() => setToast(null), 5000);
      if (villageId) await refresh(villageId);
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : "Chyba";
      setToast(`Hospoda: ${m}`);
      setTimeout(() => setToast(null), 4000);
    } finally {
      setRespondingPubId(null);
    }
  };

  const respondInvestment = async (id: string, action: "accept" | "decline") => {
    if (respondingInvId) return;
    setRespondingInvId(id);
    try {
      const res = await apiFetch<{ action: string; offeredAmount?: number; contribution?: number }>(
        `/api/villages/investments/${id}/respond`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );
      const msg = res.action === "accept"
        ? `Hotovo — obec přispěla ${res.offeredAmount?.toLocaleString("cs")} Kč.`
        : "Nabídka odmítnuta.";
      setToast(msg);
      setTimeout(() => setToast(null), 4000);
      if (villageId) await refresh(villageId);
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : "Chyba";
      setToast(`Investice: ${m}`);
      setTimeout(() => setToast(null), 4000);
    } finally {
      setRespondingInvId(null);
    }
  };

  const respondPetition = async (id: string, action: "accept" | "ignore") => {
    if (respondingPetitionId) return;
    setRespondingPetitionId(id);
    try {
      await apiFetch(`/api/villages/petitions/${id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (villageId) await refresh(villageId);
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : "Chyba";
      setToast(`Petice: ${m}`);
      setTimeout(() => setToast(null), 4000);
    } finally {
      setRespondingPetitionId(null);
    }
  };

  const handleInvite = async (officialId: string) => {
    if (!upcoming?.match || invitingOfficialId) return;
    setInvitingOfficialId(officialId);
    console.log("[obec] invite", { matchId: upcoming.match.id, officialId, ctxTeamId, authTeamId: teamId });
    try {
      const res = await apiFetch<InviteResponse>(
        `/api/villages/invitations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ matchId: upcoming.match.id, officialId }),
        },
      );
      const msg = res.status === "accepted"
        ? `${res.officialName} pozvání přijal (cena ${res.giftCost} Kč)`
        : `${res.officialName}: „${res.rejectReason ?? "Bohužel ne."}" (cena ${res.giftCost} Kč zaplacena)`;
      setToast(msg);
      setTimeout(() => setToast(null), 7000);
      if (villageId) await refresh(villageId);
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : "Chyba";
      setToast(`Pozvánka selhala: ${m}`);
      setTimeout(() => setToast(null), 4000);
    } finally {
      setInvitingOfficialId(null);
    }
  };

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!teamId) return;
      try {
        const team = await apiFetch<TeamWithVillage>(`/api/teams/${teamId}`);
        if (cancelled) return;
        setVillageId(team.village_id);
        await refresh(team.village_id);
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


  return (
    <div className="space-y-6 p-4 max-w-5xl mx-auto">
      {/* Jak to s obcí funguje — onboarding */}
      <details className="card p-4 sm:p-5 group">
        <summary className="cursor-pointer font-heading font-bold text-sm flex items-center justify-between">
          <span>💡 Jak to s obcí funguje</span>
          <span className="text-xs text-muted group-open:hidden">rozbalit</span>
          <span className="text-xs text-muted hidden group-open:inline">sbalit</span>
        </summary>
        <div className="mt-3 space-y-3 text-sm leading-relaxed">
          <p>
            Klub funguje v rámci obce a její radnice. <strong>Globální přízeň obce</strong> (0–100) ovlivňuje, kolik dotace dostaneš každý měsíc — od poloviny (favor 0, ×0.50) až po jeden a půl násobek (favor 100, ×1.50). Dlouhodobě je to tisíce korun rozdíl.
          </p>

          <p>V <strong>zastupitelstvu</strong> jsou starosta + 3 zastupitelé. Každý má svou osobnost (sportovec, podnikatel, aktivista, tradicionalista, populista) a vztah s tebou (0–100). Když má obec víc týmů, zastupitelé se rozhodují podle vztahu s každým z nich — tvůj favor vidíš v matici „Týmy v obci".</p>

          <p className="pt-1">Co s nimi můžeš dělat:</p>
          <ul className="space-y-1.5 ml-4 list-disc">
            <li><strong>Brigády</strong> 🛠️ — obec vyhlásí veřejnou výpomoc (úklid, oprava plotu, kulturák…). Vezmeš ji se 3-7 hráči, kteří ztratí kondici a morálku, ale klub získá přízeň. Žádné peníze, jen vztah.</li>
            <li><strong>Pozvánky na zápas</strong> 🎟️ — dárek + pozvání na domácí zápas. Přijetí není zaručené, závisí na osobnosti a tvém vztahu. Když přijdou, atmosféra na stadionu roste. Cena se platí vždy, i když odmítnou.</li>
            <li><strong>Hospoda</strong> 🍺 — někdy se zastupitel objeví v hospodě. Můžeš ho pozvat na pivo (+trust), ale aktivista by se mohl naštvat → skandál.</li>
            <li><strong>Petice občanů</strong> 📜 — občas pošlou petici (dětský den, oprava šaten…). Vyhovíš → zaplatíš a získáš přízeň. Ignoruješ → po 14 dnech klesne přízeň.</li>
            <li><strong>Investice obce</strong> 💰 — když máš dostatek přízně, obec ti spolufinancuje modernizaci stadionu (50–70 % částky). Aktivuje se automaticky.</li>
          </ul>

          <p className="pt-1"><strong>Místní hrdost</strong> 🏡 — kolik rodáků z obce máš v kádru a jak hrají. Když místní zaboduje (hat-trick / hráč zápasu), přízeň skočí nahoru a celý kádr dostane +5 morálku. Pokud místní hráče prodáš, sportovec a tradicionalista to neodpustí.</p>

          <p><strong>Volby</strong> 🗳️ — každé 4 sezóny. Zastupitelé s vysokou přízní mandát obhájí, ostatní vystřídá nový. Pak začínáš znovu na 50.</p>

          <p><strong>Krize</strong> ⚠️ — když přízeň klesne pod 20, obec se otočí proti klubu. Vandalismus, sponzor exit, kontrola. Cesta zpět je dlouhá — brigády, petice, charity.</p>

          <p className="pt-2 text-xs text-muted italic">
            Všechno, co dělají ostatní týmy v obci, vidíš transparentně — kdo vzal jakou brigádu, kdo pozval starostu, kdo dostal investiční nabídku. Není to o tajné konspiraci, je to vesnice.
          </p>
        </div>
      </details>

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
                      <div className="mt-3 space-y-1.5">
                        {teams.map((t) => {
                          const tf = t.id === teamId ? f : (favorMatrix[t.id]?.[o.id] ?? 50);
                          const isUs = t.id === teamId;
                          return (
                            <div key={t.id} className="flex items-center gap-2 text-xs">
                              <span
                                className="inline-block w-2 h-2 rounded-full border border-gray-200 shrink-0"
                                style={{ backgroundColor: t.primary_color }}
                              />
                              <span className={`truncate flex-1 ${isUs ? "font-semibold" : "text-gray-600"}`}>
                                {t.name}{isUs && " (my)"}
                              </span>
                              <span className="tabular-nums text-gray-500 w-10 text-right">{tf}/100</span>
                              <div className="h-1.5 w-16 rounded-full bg-gray-100 overflow-hidden shrink-0">
                                <div className={`h-full ${favorColor(tf)}`} style={{ width: `${Math.max(0, Math.min(100, tf))}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="text-xs text-gray-500 mt-2" title={PERSONALITY_DESC[o.personality]}>
                        {termRemaining(o.termEndAt)} · {PERSONALITY_DESC[o.personality]}
                      </div>
                    </div>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      </div>

      {/* NPC v hospodě */}
      {pubEncounters.length > 0 && (
        <Card>
          <CardHeader>
            <SectionLabel>Náhodné setkání v hospodě</SectionLabel>
            <div className="text-xs text-gray-500 mt-1">
              Zastupitel se objevil v hospodě. Můžeš ho pozvat na pivo (cena podle nálady) — buď to posílí vztah, nebo bude skandál.
            </div>
          </CardHeader>
          <CardBody>
            <div className="space-y-3">
              {pubEncounters.map((p) => {
                let face: Record<string, unknown> = {};
                try { face = JSON.parse(p.face_config); } catch { face = {}; }
                return (
                  <div key={p.id} className="flex items-center gap-3 border border-amber-300 bg-amber-50/40 rounded-lg p-3">
                    <FaceAvatar faceConfig={face} size={64} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs uppercase tracking-wider text-gray-500">{ROLE_LABEL[p.role]}</div>
                      <div className="font-semibold text-sm">{p.first_name} {p.last_name}</div>
                      <div className="text-xs text-gray-600 mt-0.5">
                        Zaškoupil si pivo a podívá se, jestli ho přemluvíš na další.
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        Vyprší {new Date(p.expires_at).toLocaleDateString("cs")} · {PERSONALITY_LABEL[p.personality]}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <Button
                        size="sm"
                        disabled={respondingPubId === p.id}
                        onClick={() => respondPub(p.id, "invite_beer")}
                      >
                        Pozvat na pivo
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={respondingPubId === p.id}
                        onClick={() => respondPub(p.id, "ignore")}
                      >
                        Ignorovat
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Pozvánky na zápas */}
      {upcoming?.match && (
        <Card>
          <CardHeader>
            <SectionLabel>Pozvi zastupitele na zápas</SectionLabel>
            <div className="text-xs text-gray-500 mt-1">
              {upcoming.match.home_name} vs {upcoming.match.away_name} · {new Date(upcoming.match.scheduled_at).toLocaleString("cs", { weekday: "short", day: "numeric", month: "numeric" })}
              {" — "}přijetí pozvánky není zaručené, závisí na vztahu, povaze a tvém týmu. Cena dárku se platí vždy.
            </div>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {upcoming.officials.map((o) => {
                const myInv = upcoming.myInvitations.find((i) => i.official_id === o.id);
                const slotTakenByOther = o.slot_taken_by && o.slot_taken_by !== teamId;
                const slotTakenByMe = o.slot_taken_by === teamId;
                const giftCost = Math.max(300, 500 + (50 - o.favor) * 10);
                const isInviting = invitingOfficialId === o.id;

                let statusEl: React.ReactNode = null;
                if (slotTakenByMe) {
                  statusEl = <Badge>Přijal pozvání ✓</Badge>;
                } else if (slotTakenByOther) {
                  statusEl = <span className="text-xs text-gray-500">Pozván {o.slot_taken_by_name}</span>;
                } else if (myInv?.status === "declined") {
                  let reason: string | null = null;
                  if (myInv.attendance_effects) {
                    try { reason = (JSON.parse(myInv.attendance_effects) as { rejectReason?: string }).rejectReason ?? null; }
                    catch { reason = null; }
                  }
                  statusEl = (
                    <div className="text-right max-w-[180px]">
                      <span className="text-xs text-card-red">Odmítl pozvání</span>
                      {reason && (
                        <div className="text-[10px] text-gray-500 italic mt-0.5 leading-tight">„{reason}"</div>
                      )}
                    </div>
                  );
                }

                return (
                  <div key={o.id} className="border border-gray-200 rounded-lg p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs uppercase tracking-wider text-gray-500">{ROLE_LABEL[o.role as OfficialRole]}</div>
                      <div className="text-sm font-semibold truncate">{o.first_name} {o.last_name}</div>
                      <div className="text-xs text-gray-500">přízeň {o.favor}/100 · {PERSONALITY_LABEL[o.personality as Personality]}</div>
                    </div>
                    <div className="text-right shrink-0 space-y-1">
                      {statusEl ?? (
                        <>
                          <Button
                            size="sm"
                            disabled={isInviting || !!myInv}
                            onClick={() => handleInvite(o.id)}
                          >
                            {isInviting ? "..." : myInv ? "Pozváno" : `Pozvat (${giftCost} Kč)`}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Investiční nabídky obce */}
      {investments.length > 0 && (
        <Card>
          <CardHeader>
            <SectionLabel>Investiční nabídky obce</SectionLabel>
            <div className="text-xs text-gray-500 mt-1">
              Obec nabízí spolufinancování modernizace stadionu. Zaplatíš jen zbytek, dostaneš upgrade.
            </div>
          </CardHeader>
          <CardBody>
            <div className="space-y-3">
              {investments.map((i) => (
                <div key={i.id} className="border border-pitch-300 bg-pitch-50/30 rounded-lg p-3">
                  <div className="flex justify-between items-start gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-sm">{i.target_facility ?? i.type}</div>
                      <div className="text-xs text-gray-700 mt-0.5">
                        Obec uhradí {i.offered_amount.toLocaleString("cs")} Kč, ty doplatíš {i.required_contribution.toLocaleString("cs")} Kč.
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        Vyprší {new Date(i.expires_at).toLocaleDateString("cs")}
                        {i.political_cost > 0 && ` · politická cena: -${i.political_cost} u opozičních zastupitelů`}
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 mt-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={respondingInvId === i.id}
                      onClick={() => respondInvestment(i.id, "decline")}
                    >
                      Odmítnout
                    </Button>
                    <Button
                      size="sm"
                      disabled={respondingInvId === i.id}
                      onClick={() => respondInvestment(i.id, "accept")}
                    >
                      Přijmout
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Petice občanů */}
      {petitions.length > 0 && (
        <Card>
          <CardHeader>
            <SectionLabel>Petice občanů</SectionLabel>
            <div className="text-xs text-gray-500 mt-1">
              Občané posílají žádosti — když vyhovíš, zaplatíš a získáš přízeň. Ignoruj a po expiraci ti přízeň klesne.
            </div>
          </CardHeader>
          <CardBody>
            <div className="space-y-3">
              {petitions.map((p) => (
                <div key={p.id} className="border border-amber-200 bg-amber-50/40 rounded-lg p-3">
                  <div className="flex justify-between items-start gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-sm">{p.title}</div>
                      <div className="text-xs text-gray-700 mt-0.5">{p.description}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        Vyprší {new Date(p.expires_at).toLocaleDateString("cs")}
                      </div>
                    </div>
                    <div className="text-right text-xs space-y-0.5 shrink-0">
                      <div className="text-card-red">-{p.cost_money.toLocaleString("cs")} Kč</div>
                      <div className="text-pitch-700">+{p.reward_favor} přízeň</div>
                      <div className="text-gray-500">při ignorování {p.ignore_penalty}</div>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 mt-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={respondingPetitionId === p.id}
                      onClick={() => respondPetition(p.id, "ignore")}
                    >
                      Ignorovat
                    </Button>
                    <Button
                      size="sm"
                      disabled={respondingPetitionId === p.id}
                      onClick={() => respondPetition(p.id, "accept")}
                    >
                      Vyhovět
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Brigády */}
      <Card>
        <CardHeader>
          <SectionLabel>Brigády vyhlášené obcí</SectionLabel>
          <div className="text-xs text-gray-500 mt-1">
            Hráči ztratí kondici a morálku, ale tým získá přízeň obce. Slot je sdílený s ostatními týmy v obci — kdo dřív přijde.
          </div>
        </CardHeader>
        <CardBody>
          {brigades.length === 0 ? (
            <div className="text-sm text-gray-500 italic">Žádné aktuální brigády. Nové se vyhlásí v pondělí.</div>
          ) : (
            <div className="space-y-3">
              {brigades.map((b) => {
                const isOpen = b.status === "open";
                const isMine = b.taken_team_name && teams.find((t) => t.id === teamId)?.name === b.taken_team_name;
                return (
                  <div key={b.id} className={`border rounded-lg p-3 ${isOpen ? "border-pitch-300 bg-pitch-50/30" : "border-gray-200 bg-gray-50/40 opacity-80"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm">{b.title}</div>
                        <div className="text-xs text-gray-600 mt-0.5">{b.description}</div>
                        {b.offering_official_name && (
                          <div className="text-xs text-gray-500 mt-1">
                            Vyhlásil: {b.offering_official_name}
                          </div>
                        )}
                      </div>
                      <div className="text-right text-xs space-y-0.5 shrink-0">
                        <div className="font-semibold text-pitch-700">+{b.reward_favor} přízeň</div>
                        <div className="text-card-red">-{b.condition_drain} kondice</div>
                        {b.morale_change !== 0 && (
                          <div className={b.morale_change > 0 ? "text-pitch-600" : "text-card-red"}>
                            {b.morale_change > 0 ? "+" : ""}{b.morale_change} morálka
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-3">
                      <div className="text-xs text-gray-500">
                        {b.required_player_count} hráčů · {b.duration_hours} h
                        {!isOpen && b.taken_team_name && (
                          <span className="ml-2 font-medium">
                            · Vzal {isMine ? "náš tým" : b.taken_team_name}
                            {b.taken_at && ` (${new Date(b.taken_at).toLocaleDateString("cs")})`}
                          </span>
                        )}
                      </div>
                      {isOpen && (
                        <Button onClick={() => setTakeBrigade(b)} size="sm">
                          Vzít brigádu
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Týmy v obci — vždy viditelné (i pokud je jen jeden), s matricí favor per NPC */}
      <Card>
        <CardHeader>
          <SectionLabel>Týmy v obci</SectionLabel>
          <div className="text-xs text-gray-500 mt-1">
            {teams.length === 1
              ? "V obci je jen jeden tým — žádná konkurence."
              : `${teams.length} týmů soutěží o přízeň zastupitelstva. Vidíš obliby všech týmů u každého zastupitele.`}
          </div>
        </CardHeader>
        <CardBody>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="py-2 pr-3 sticky left-0 bg-white">Tým</th>
                  <th className="py-2 px-2 text-right">Globální</th>
                  {officials.map((o) => (
                    <th key={o.id} className="py-2 px-2 text-right whitespace-nowrap">
                      {ROLE_LABEL[o.role]}<br/>
                      <span className="text-[10px] font-normal normal-case text-gray-400">
                        {o.firstName.charAt(0)}. {o.lastName}
                      </span>
                    </th>
                  ))}
                  <th className="py-2 pl-2 text-right">Rep</th>
                </tr>
              </thead>
              <tbody>
                {teams
                  .slice()
                  .sort((a, b) => b.global_favor - a.global_favor)
                  .map((t) => (
                    <tr key={t.id} className={t.id === teamId ? "font-semibold bg-pitch-50/30" : ""}>
                      <td className="py-2 pr-3 sticky left-0 bg-inherit">
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="inline-block w-3 h-3 rounded-full border border-gray-200 shrink-0"
                            style={{ backgroundColor: t.primary_color }}
                          />
                          <span className="truncate max-w-[140px]">{t.name}</span>
                          {t.id === teamId && <span className="text-xs text-gray-500">(my)</span>}
                          {t.user_id === "ai" && <span className="text-xs text-gray-400">(AI)</span>}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums font-semibold">
                        {t.global_favor}
                      </td>
                      {officials.map((o) => {
                        const f = favorMatrix[t.id]?.[o.id] ?? 50;
                        return (
                          <td key={o.id} className="py-2 px-2 text-right tabular-nums">
                            <span className={
                              f >= 70 ? "text-pitch-700"
                              : f >= 40 ? "text-gray-700"
                              : "text-card-red"
                            }>
                              {f}
                            </span>
                          </td>
                        );
                      })}
                      <td className="py-2 pl-2 text-right tabular-nums text-gray-500">
                        {t.reputation}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

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

      {/* Místní hrdost */}
      {localPride && (
        <Card>
          <CardHeader>
            <SectionLabel>Místní hrdost</SectionLabel>
            <div className="text-xs text-gray-500 mt-1">
              Rodáci z {localPride.villageName} v kádru. Pokud jich víc nastoupí do zápasu, obec to ocení (+favor po každém zápase).
            </div>
          </CardHeader>
          <CardBody>
            {localPride.totalLocalCount === 0 ? (
              <div className="text-sm text-gray-500 italic">
                Zatím žádný hráč z {localPride.villageName} v kádru. Zvaž nábor mládeže nebo přestup místního talentu.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3 mb-3 text-center">
                  <div className="bg-gray-50 rounded-lg p-2">
                    <div className="text-2xl font-bold tabular-nums">{localPride.totalLocalCount}</div>
                    <div className="text-xs text-gray-500">rodáků v kádru</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2">
                    <div className="text-2xl font-bold tabular-nums">{localPride.recentStartersTotal}</div>
                    <div className="text-xs text-gray-500">nastoupilo (90 dní)</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2">
                    <div className="text-2xl font-bold tabular-nums">{localPride.avgRating ?? "—"}</div>
                    <div className="text-xs text-gray-500">průměrný rating</div>
                  </div>
                </div>
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wider text-gray-500">
                    <tr>
                      <th className="py-1.5">Hráč</th>
                      <th className="py-1.5 text-right">Pos / Rat</th>
                      <th className="py-1.5 text-right">Zápasů</th>
                      <th className="py-1.5 text-right">G+A</th>
                      <th className="py-1.5 text-right">Známka</th>
                    </tr>
                  </thead>
                  <tbody>
                    {localPride.locals.map((p) => (
                      <tr key={p.id} className="border-t border-gray-100">
                        <td className="py-1.5">{p.firstName} {p.lastName}</td>
                        <td className="py-1.5 text-right tabular-nums">{p.position} {p.overallRating}</td>
                        <td className="py-1.5 text-right tabular-nums">{p.recentStarts}</td>
                        <td className="py-1.5 text-right tabular-nums">{p.recentGoals}+{p.recentAssists}</td>
                        <td className="py-1.5 text-right tabular-nums">{p.recentAvgRating ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </CardBody>
        </Card>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white px-4 py-2 rounded-lg shadow-lg text-sm">
          {toast}
        </div>
      )}

      {takeBrigade && villageId && (
        <BrigadeTakeDialog
          brigade={takeBrigade}
          teamId={teamId!}
          onClose={() => setTakeBrigade(null)}
          onSuccess={async () => {
            setTakeBrigade(null);
            if (villageId) await refresh(villageId);
          }}
        />
      )}
    </div>
  );
}

interface BrigadeTakeDialogProps {
  brigade: Brigade;
  teamId: string;
  onClose: () => void;
  onSuccess: () => void;
}

function BrigadeTakeDialog({ brigade, teamId, onClose, onSuccess }: BrigadeTakeDialogProps) {
  const [roster, setRoster] = useState<RosterPlayer[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<RosterPlayer[]>(`/api/teams/${teamId}/players`)
      .then((rs) => setRoster(rs))
      .catch((e) => {
        console.error("load roster:", e);
        setErrMsg("Nepodařilo se načíst kádr");
      })
      .finally(() => setLoading(false));
  }, [teamId]);

  const eligible = roster.filter((p) => {
    if (p.status === "released") return false;
    let lc: { condition?: number; injury?: unknown } = {};
    try { lc = JSON.parse(p.life_context); } catch { lc = {}; }
    if (lc.injury) return false;
    return (typeof lc.condition === "number" ? lc.condition : 100) >= 60;
  });

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else if (next.size < brigade.required_player_count) next.add(id);
    setSelected(next);
  };

  const submit = async () => {
    if (selected.size !== brigade.required_player_count || submitting) return;
    setSubmitting(true);
    setErrMsg(null);
    try {
      await apiFetch(`/api/villages/brigades/${brigade.id}/take`, {
        method: "POST",
        body: JSON.stringify({ playerIds: Array.from(selected) }),
      });
      onSuccess();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Neznámá chyba";
      setErrMsg(msg);
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} maxWidth="640px">
      <div className="p-5 space-y-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-gray-500">Brigáda</div>
          <h2 className="text-xl font-bold mt-0.5">{brigade.title}</h2>
          <div className="text-sm text-gray-600 mt-1">{brigade.description}</div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm bg-gray-50 rounded-lg p-3">
          <div>
            <div className="text-xs text-gray-500">Odměna</div>
            <div className="font-semibold text-pitch-700">+{brigade.reward_favor} přízeň obce</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Cena pro hráče</div>
            <div className="font-semibold text-card-red">-{brigade.condition_drain} kondice</div>
            {brigade.morale_change !== 0 && (
              <div className={`text-xs ${brigade.morale_change > 0 ? "text-pitch-600" : "text-card-red"}`}>
                {brigade.morale_change > 0 ? "+" : ""}{brigade.morale_change} morálka
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="flex items-baseline justify-between mb-2">
            <div className="text-sm font-semibold">
              Vyber {brigade.required_player_count} hráčů
            </div>
            <div className="text-xs text-gray-500">
              Zvoleno: {selected.size}/{brigade.required_player_count}
            </div>
          </div>
          {loading ? (
            <Spinner />
          ) : eligible.length < brigade.required_player_count ? (
            <div className="text-sm text-card-red">
              Nemáš dost způsobilých hráčů (potřeba ≥ 60 kondice, bez zranění).
            </div>
          ) : (
            <div className="max-h-72 overflow-y-auto border rounded-lg divide-y divide-gray-100">
              {eligible.map((p) => {
                let lc: { condition?: number; morale?: number } = {};
                try { lc = JSON.parse(p.life_context); } catch { lc = {}; }
                const isSelected = selected.has(p.id);
                const disabled = !isSelected && selected.size >= brigade.required_player_count;
                return (
                  <label
                    key={p.id}
                    className={`flex items-center gap-3 px-3 py-2 cursor-pointer ${disabled ? "opacity-40 cursor-not-allowed" : "hover:bg-gray-50"}`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggle(p.id)}
                      disabled={disabled}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {p.first_name} {p.last_name} <span className="text-xs text-gray-500">({p.position})</span>
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 tabular-nums">
                      {lc.condition ?? 100} k · {lc.morale ?? 50} m
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {errMsg && <div className="text-sm text-card-red">{errMsg}</div>}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Zrušit</Button>
          <Button
            onClick={submit}
            disabled={selected.size !== brigade.required_player_count || submitting}
          >
            {submitting ? "Odesílám..." : "Vzít brigádu"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
