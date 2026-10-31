"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { Card, CardBody, Spinner, SectionLabel, Modal, Button, Tabs, useTabParam } from "@/components/ui";
import { DistrictMap, clubBadgeSvg, villageSizeLabel, type MapVillage } from "@/components/map/DistrictMap";
import { DistrictVillages } from "./DistrictVillages";
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
  lat: number;
  lng: number;
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

// České názvy cílů investičních nabídek obce (target_facility / type)
const INVESTMENT_TARGET_LABEL: Record<string, string> = {
  showers: "Sprchy",
  stands: "Tribuny",
  parking: "Parkoviště",
  changing_rooms: "Šatny",
  refreshments: "Občerstvení",
  fence: "Oplocení",
  pitch: "Hřiště",
  youth: "Mládežnická akademie",
  stadium_upgrade: "Modernizace stadionu",
  pitch_renovation: "Renovace hřiště",
  youth_facility: "Mládežnická akademie",
  bus_subsidy: "Příspěvek na autobus",
};

function investmentTargetLabel(facility: string | null, type: string): string {
  if (facility && INVESTMENT_TARGET_LABEL[facility]) return INVESTMENT_TARGET_LABEL[facility];
  if (INVESTMENT_TARGET_LABEL[type]) return INVESTMENT_TARGET_LABEL[type];
  return facility ?? type;
}

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
      {/* Popisek i cislo se skryji, kdyz je label prazdny — volajici uz
          hodnotu vypsal velkym pismem nad pruhem a opakovala se dvakrat. */}
      {label !== "" && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">{label ?? "Přízeň"}</span>
          <span className="font-semibold tabular-nums">{value}/100</span>
        </div>
      )}
      <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
        <div className={`h-full ${favorColor(value)}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

/**
 * Volby proběhnou při každém konci sezóny (season-rollover), takže uložený konec mandátu
 * (volby ho píšou o 4 roky dál) neříká, jak dlouho zastupitel zůstane.
 */
function termRemaining(termEndAt: string): string {
  return new Date(termEndAt).getTime() > Date.now() ? "Ve funkci do konce sezóny" : "Funkční období skončilo";
}

/** Stránka Obec: správa vlastní obce a prohlížení obcí okresu s mapou. */
export default function ObecPage() {
  const [tab, setTab] = useTabParam(["obec", "okres"] as const);
  return (
    <div className="max-w-5xl mx-auto">
      <div className="px-4 pt-4">
        <Tabs
          value={tab}
          onChange={setTab}
          ariaLabel="Obec"
          items={[{ key: "obec", label: "Moje obec", count: null }, { key: "okres", label: "Obce okresu", count: null }]}
        />
      </div>
      {tab === "obec" ? <OwnVillage /> : <div className="p-4"><DistrictVillages /></div>}
    </div>
  );
}

function OwnVillage() {
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
      const res = await apiFetch<{ outcome?: string; beerCost?: number; favorDelta?: number; officialName?: string }>(
        `/api/villages/pub-encounters/${id}/respond`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );
      let msg = "";
      if (action === "ignore") msg = "Nechal jsi ho být.";
      else if (res.outcome === "scandal") msg = `Skandál! ${res.officialName} odešel znechucen.`;
      else msg = `Pivo s ${res.officialName}, přízeň +${res.favorDelta}, cena ${res.beerCost} Kč.`;
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
        ? `Hotovo, obec přispěla ${res.offeredAmount?.toLocaleString("cs")} Kč.`
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


  const facts = parseFacts(village.flavor_facts);
  const myTeam = teams.find((t) => t.id === teamId) ?? null;
  const mapVillage: MapVillage = {
    id: village.id, name: village.name, population: village.population, size: village.size,
    lat: village.lat, lng: village.lng, events: 0,
    clubs: teams.map((t) => ({
      id: t.id, name: t.name, isAi: t.user_id === "ai", leagueName: null, primaryColor: t.primary_color, secondaryColor: t.secondary_color,
      badge: { pattern: null, primary: null, secondary: null, initials: null, symbol: null },
    })),
  };
  const waiting = pubEncounters.length + investments.length + petitions.length;

  return (
    <div className="space-y-6 p-4">
      {/* Hlavička jako v profilu obce: kde jsme, jak nás obec bere, mapa */}
      <div className="grid gap-4 md:grid-cols-[1fr_300px] md:items-start">
        <Card>
          <CardBody className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h1 className="font-heading font-bold text-2xl leading-tight">{village.name}</h1>
                <div className="text-sm text-muted">
                  {villageSizeLabel(village.size)} · {village.population.toLocaleString("cs-CZ")} obyvatel · okres {village.district}
                </div>
              </div>
              <Link href={`/obec/${village.id}`} className="text-sm font-heading font-bold text-pitch-700 hover:text-pitch-500">
                Veřejný profil obce →
              </Link>
            </div>
            <div className="rounded-xl bg-surface p-3">
              <div className="flex items-baseline justify-between gap-2 mb-2">
                <span className="text-sm text-ink-light">Jak nás obec bere</span>
                <span className="font-heading font-bold">{favorLabel(favor.global.favor)} <span className="text-muted font-normal tabular-nums text-sm">{favor.global.favor}/100</span></span>
              </div>
              <FavorBar value={favor.global.favor} label="" />
              <div className="text-xs text-muted mt-1.5">Dotace od obce ×{(0.5 + favor.global.favor / 100).toFixed(2)}</div>
            </div>
            {facts.length > 0 && (
              <ul className="space-y-1.5 text-sm text-ink-light">
                {facts.map((f, i) => <li key={i} className="flex gap-2"><span aria-hidden>·</span><span>{f}</span></li>)}
              </ul>
            )}
          </CardBody>
        </Card>
        <DistrictMap villages={[mapVillage]} selectedId={null} onSelect={() => undefined} className="h-[240px] shadow-[var(--shadow-card)]" />
      </div>

      {/* Co čeká na rozhodnutí: hospoda, investice, petice */}
      {waiting > 0 && (
        <div>
          <SectionLabel>Čeká na tebe</SectionLabel>
          <div className="space-y-3">
            {pubEncounters.map((p) => (
              <div key={p.id} className="card border-2 border-amber-300 bg-amber-50 p-4">
                <div className="flex items-start gap-3">
                  <FaceAvatar faceConfig={parseFace(p.face_config)} size={52} className="shrink-0 rounded-full bg-white overflow-hidden" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-muted">🍺 V hospodě · {ROLE_LABEL[p.role]}</div>
                    <div className="font-heading font-bold">{p.first_name} {p.last_name}</div>
                    <p className="text-sm text-ink-light mt-0.5">Zaškoupil si pivo a čeká, jestli ho přemluvíš na další. Buď se sblížíte, nebo je z toho skandál.</p>
                    <div className="text-xs text-muted mt-1">{PERSONALITY_LABEL[p.personality]} · vyprší {formatDay(p.expires_at)}</div>
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-3">
                  <Button variant="secondary" size="sm" disabled={respondingPubId === p.id} onClick={() => respondPub(p.id, "ignore")}>Nechat být</Button>
                  <Button size="sm" disabled={respondingPubId === p.id} onClick={() => respondPub(p.id, "invite_beer")}>Pozvat na pivo</Button>
                </div>
              </div>
            ))}
            {investments.map((i) => (
              <div key={i.id} className="card border-2 border-green-200 bg-green-50 p-4">
                <div className="text-xs text-muted">💰 Obec nabízí investici</div>
                <div className="font-heading font-bold">{investmentTargetLabel(i.target_facility, i.type)}</div>
                <Chips items={[
                  { text: `obec dá ${i.offered_amount.toLocaleString("cs-CZ")} Kč`, tone: "good" },
                  { text: `ty doplatíš ${i.required_contribution.toLocaleString("cs-CZ")} Kč`, tone: "bad" },
                  ...(i.political_cost > 0 ? [{ text: `opozice −${i.political_cost} přízeň`, tone: "bad" as const }] : []),
                ]} />
                <div className="flex items-center justify-between gap-2 mt-3">
                  <span className="text-xs text-muted">vyprší {formatDay(i.expires_at)}</span>
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" disabled={respondingInvId === i.id} onClick={() => respondInvestment(i.id, "decline")}>Odmítnout</Button>
                    <Button size="sm" disabled={respondingInvId === i.id} onClick={() => respondInvestment(i.id, "accept")}>Přijmout</Button>
                  </div>
                </div>
              </div>
            ))}
            {petitions.map((p) => (
              <div key={p.id} className="card border-2 border-amber-200 bg-amber-50/60 p-4">
                <div className="text-xs text-muted">📜 Petice občanů</div>
                <div className="font-heading font-bold">{p.title}</div>
                <p className="text-sm text-ink-light mt-0.5">{p.description}</p>
                <Chips items={[
                  { text: `−${p.cost_money.toLocaleString("cs-CZ")} Kč`, tone: "bad" },
                  { text: `+${p.reward_favor} přízeň`, tone: "good" },
                  { text: `když ji přejdeš ${p.ignore_penalty} přízeň`, tone: "neutral" },
                ]} />
                <div className="flex items-center justify-between gap-2 mt-3">
                  <span className="text-xs text-muted">vyprší {formatDay(p.expires_at)}</span>
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" disabled={respondingPetitionId === p.id} onClick={() => respondPetition(p.id, "ignore")}>Přejít</Button>
                    <Button size="sm" disabled={respondingPetitionId === p.id} onClick={() => respondPetition(p.id, "accept")}>Vyhovět</Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Zastupitelstvo */}
      <div>
        <SectionLabel>Zastupitelstvo</SectionLabel>
        <div className="grid gap-3 sm:grid-cols-2">
          {officials.map((o) => {
            const f = favor.perOfficial.find((p) => p.officialId === o.id)?.favor ?? 50;
            const rivals = teams.filter((t) => t.id !== teamId);
            return (
              <Card key={o.id}>
                <CardBody>
                  <div className="flex gap-3">
                    <FaceAvatar faceConfig={o.faceConfig} size={64} className="shrink-0 rounded-full bg-surface overflow-hidden" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-muted">{ROLE_LABEL[o.role]}</div>
                      <div className="font-heading font-bold leading-tight">{o.firstName} {o.lastName}</div>
                      <div className="text-xs text-muted truncate">{o.age} let · {o.occupation}</div>
                      <span className="inline-block mt-1 text-xs font-medium px-1.5 py-0.5 rounded bg-surface text-ink-light" title={PERSONALITY_DESC[o.personality]}>
                        {PERSONALITY_LABEL[o.personality]}
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-ink-light">K nám</span>
                      <span className="font-heading font-bold">{favorLabel(f)}</span>
                    </div>
                    <FavorBar value={f} label="" />
                    {rivals.length > 0 && (
                      <ul className="pt-1 space-y-1">
                        {rivals.map((t) => {
                          const tf = favorMatrix[t.id]?.[o.id] ?? 50;
                          return (
                            <li key={t.id} className="flex items-center gap-2 text-xs text-muted">
                              <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: t.primary_color }} aria-hidden />
                              <span className="truncate flex-1">{t.name}</span>
                              <span>{favorLabel(tf)}</span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    <div className="text-xs text-muted pt-1">{PERSONALITY_DESC[o.personality]}. {termRemaining(o.termEndAt)}.</div>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Pozvánky na zápas */}
      {upcoming?.match && (
        <div>
          <SectionLabel>Pozvi zastupitele na zápas</SectionLabel>
          <Card>
            <CardBody className="space-y-3">
              <p className="text-sm text-ink-light">
                <span className="font-heading font-bold text-ink">{upcoming.match.home_name} vs. {upcoming.match.away_name}</span>
                {" · "}{new Date(upcoming.match.scheduled_at).toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "numeric" })}.
                {" "}Jestli přijde, záleží na vztahu a povaze. Dárek platíš vždy.
              </p>
              <ul className="divide-y divide-gray-100">
                {upcoming.officials.map((o) => {
                  const myInv = upcoming.myInvitations.find((i) => i.official_id === o.id);
                  const slotTakenByOther = o.slot_taken_by && o.slot_taken_by !== teamId;
                  const slotTakenByMe = o.slot_taken_by === teamId;
                  const giftCost = Math.max(300, 500 + (50 - o.favor) * 10);
                  const isInviting = invitingOfficialId === o.id;
                  let reason: string | null = null;
                  if (myInv?.status === "declined" && myInv.attendance_effects) {
                    try { reason = (JSON.parse(myInv.attendance_effects) as { rejectReason?: string }).rejectReason ?? null; }
                    catch (e) { console.warn("Důvod odmítnutí pozvánky:", e); }
                  }
                  return (
                    <li key={o.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <div className="text-xs text-muted">{ROLE_LABEL[o.role as OfficialRole]}</div>
                        <div className="text-sm font-heading font-bold truncate">{o.first_name} {o.last_name}</div>
                        <div className="text-xs text-muted">{favorLabel(o.favor)} · {PERSONALITY_LABEL[o.personality as Personality]}</div>
                      </div>
                      <div className="text-right shrink-0 max-w-[55%]">
                        {slotTakenByMe ? <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-pitch-50 text-pitch-700">Přijde ✓</span>
                          : slotTakenByOther ? <span className="text-xs text-muted">Jde k {o.slot_taken_by_name}</span>
                          : myInv?.status === "declined" ? (
                            <span className="block text-xs text-card-red">Odmítl{reason && <span className="block text-muted italic">„{reason}"</span>}</span>
                          ) : (
                            <Button size="sm" disabled={isInviting || !!myInv} onClick={() => handleInvite(o.id)}>
                              {isInviting ? "…" : myInv ? "Pozváno" : "Pozvat"}
                            </Button>
                          )}
                        {!slotTakenByMe && !slotTakenByOther && !myInv && <div className="text-xs text-muted mt-0.5">dárek {giftCost.toLocaleString("cs-CZ")} Kč</div>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardBody>
          </Card>
        </div>
      )}

      {/* Brigády */}
      <div>
        <SectionLabel>Brigády pro obec</SectionLabel>
        {brigades.length === 0 ? (
          <Card><CardBody><p className="text-sm text-muted">Teď žádná brigáda není. Nové obec vyhlašuje v pondělí.</p></CardBody></Card>
        ) : (
          <div className="space-y-3">
            {brigades.map((b) => {
              const isOpen = b.status === "open";
              const isMine = !!b.taken_team_name && myTeam?.name === b.taken_team_name;
              return (
                <div key={b.id} className={`card p-4 ${isOpen ? "border-2 border-green-200 bg-green-50" : "opacity-70"}`}>
                  <div className="text-xs text-muted">🛠️ {b.offering_official_name ? `Vyhlásil ${b.offering_official_name}` : "Obec"} · {b.required_player_count} hráčů · {b.duration_hours} h</div>
                  <div className="font-heading font-bold">{b.title}</div>
                  <p className="text-sm text-ink-light mt-0.5">{b.description}</p>
                  <Chips items={[
                    { text: `+${b.reward_favor} přízeň`, tone: "good" },
                    { text: `−${b.condition_drain} kondice`, tone: "bad" },
                    ...(b.morale_change !== 0 ? [{ text: `${b.morale_change > 0 ? "+" : ""}${b.morale_change} nálada`, tone: (b.morale_change > 0 ? "good" : "bad") as "good" | "bad" }] : []),
                  ]} />
                  <div className="flex items-center justify-between gap-2 mt-3">
                    <span className="text-xs text-muted">
                      {isOpen ? "Kdo dřív přijde, ten bere. Ostatní kluby v obci ji vidí taky." : `Vzal ${isMine ? "náš klub" : b.taken_team_name ?? "jiný klub"}${b.taken_at ? `, ${formatDay(b.taken_at)}` : ""}`}
                    </span>
                    {isOpen && <Button size="sm" onClick={() => setTakeBrigade(b)}>Vzít brigádu</Button>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Kluby v obci */}
      <div>
        <SectionLabel>{teams.length === 1 ? "Klub v obci" : `Kluby v obci (${teams.length})`}</SectionLabel>
        <Card>
          <CardBody>
            {teams.length === 1 && <p className="text-sm text-muted mb-2">V obci jsme jediný klub, o přízeň radnice se nedělíme.</p>}
            <ul className="divide-y divide-gray-100">
              {[...teams].sort((a, b) => b.global_favor - a.global_favor).map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-2.5">
                  <span className="shrink-0" dangerouslySetInnerHTML={{ __html: clubBadgeSvg(mapVillage.clubs.find((c) => c.id === t.id)!, 30) }} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/tym/${t.id}`} className={`font-heading font-bold text-sm hover:text-pitch-600 ${t.id === teamId ? "text-pitch-700" : ""}`}>
                      {t.name}{t.id === teamId && " (my)"}
                    </Link>
                    <div className="mt-1 max-w-[220px]"><FavorBar value={t.global_favor} label="" /></div>
                  </div>
                  <span className="text-sm font-heading font-bold shrink-0">{favorLabel(t.global_favor)}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>

      {/* Místní hrdost */}
      {localPride && (
        <div>
          <SectionLabel>Místní hrdost</SectionLabel>
          <Card>
            <CardBody className="space-y-3">
              <p className="text-sm text-ink-light">Kluci z {localPride.villageName} v kádru. Čím víc jich hraje, tím víc to obec ocení.</p>
              {localPride.totalLocalCount === 0 ? (
                <p className="text-sm text-muted">Zatím tu nemáme žádného místního. Zkus nábor mládeže nebo přestup kluka odsud.</p>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {[
                      { v: localPride.totalLocalCount, l: "místních v kádru" },
                      { v: localPride.recentStartersTotal, l: "startů za 90 dní" },
                      { v: localPride.avgRating ?? "?", l: "průměrný rating" },
                    ].map((x) => (
                      <div key={x.l} className="rounded-xl bg-surface p-2">
                        <div className="text-2xl font-heading font-bold tabular-nums">{x.v}</div>
                        <div className="text-xs text-muted">{x.l}</div>
                      </div>
                    ))}
                  </div>
                  <ul className="divide-y divide-gray-100">
                    {localPride.locals.map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                        <Link href={`/hrac/${p.id}`} className="font-heading font-bold hover:text-pitch-600 underline decoration-pitch-500/20 truncate">
                          {p.firstName} {p.lastName}
                        </Link>
                        <span className="text-xs text-muted shrink-0 tabular-nums">
                          {p.position} {p.overallRating} · {p.recentStarts} zápasů · {p.recentGoals}+{p.recentAssists}{p.recentAvgRating ? ` · známka ${p.recentAvgRating}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </CardBody>
          </Card>
        </div>
      )}

      {/* Kronika obce */}
      <div>
        <SectionLabel>Kronika obce</SectionLabel>
        <Card>
          <CardBody>
            {feed.length === 0 ? (
              <p className="text-sm text-muted">Zatím se v obci nic nezapsalo.</p>
            ) : (
              <ul className="space-y-2.5">
                {feed.map((e) => (
                  <li key={e.id} className="flex items-start gap-2.5 text-sm">
                    <span className="shrink-0 leading-5" aria-hidden>{CHRONICLE_ICON[e.event_type] ?? "\u{1F4DC}"}</span>
                    <div className="min-w-0">
                      <p className="leading-snug">{withoutLongDash(e.description)}</p>
                      <div className="text-xs text-muted">
                        {formatDay(e.game_date || e.created_at)}
                        {e.team_name && ` · ${e.team_name}`}
                        {e.official_name && ` · ${e.official_name}`}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Jak to s obcí funguje */}
      <details className="card p-4 sm:p-5 group">
        <summary className="cursor-pointer font-heading font-bold text-sm flex items-center justify-between">
          <span>💡 Jak to s obcí funguje</span>
          <span className="text-xs text-muted group-open:hidden">rozbalit</span>
          <span className="text-xs text-muted hidden group-open:inline">sbalit</span>
        </summary>
        <div className="mt-3 space-y-3 text-sm leading-relaxed text-ink-light">
          <p>Klub žije v obci a s její radnicí. <strong className="text-ink">Přízeň obce</strong> rozhoduje o dotaci: při nejhorším dostaneš polovinu, při nejlepším jeden a půl násobek. Za sezónu jsou to tisíce korun.</p>
          <p>V <strong className="text-ink">zastupitelstvu</strong> sedí starosta a tři zastupitelé. Každý má svou povahu a svůj vztah k tobě. Když je v obci víc klubů, rozhodují se podle toho, koho mají radši.</p>
          <ul className="space-y-1.5 ml-4 list-disc">
            <li><strong className="text-ink">Brigády</strong> 🛠️: obec potřebuje pomoct (úklid, plot, kulturák). Pošleš 3 až 7 hráčů, ti ztratí kondici, klub získá přízeň.</li>
            <li><strong className="text-ink">Pozvánky na zápas</strong> 🎟️: dárek a pozvání na domácí zápas. Přijdou podle povahy a vztahu, dárek platíš vždy.</li>
            <li><strong className="text-ink">Hospoda</strong> 🍺: zastupitel se občas objeví v hospodě. Pivo vás sblíží, aktivista se ale umí naštvat.</li>
            <li><strong className="text-ink">Petice</strong> 📜: občané žádají třeba dětský den. Vyhovíš a zaplatíš, nebo přejdeš a přízeň klesne.</li>
            <li><strong className="text-ink">Investice</strong> 💰: při dobré přízni obec zaplatí větší část modernizace stadionu.</li>
          </ul>
          <p><strong className="text-ink">Místní hrdost</strong> 🏡: místní v kádru a jejich výkony obec sleduje. Hat-trick místního zvedne přízeň, prodej místního jí ublíží.</p>
          <p><strong className="text-ink">Volby</strong> 🗳️: na konci každé sezóny se vymění celé vedení obce a přízeň u všech klubů začíná znovu napůl.</p>
          <p><strong className="text-ink">Krize</strong> ⚠️: když přízeň spadne hodně nízko, obec se otočí proti klubu. Cesta zpátky vede přes brigády a petice.</p>
        </div>
      </details>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[var(--z-sheet)] bg-gray-900 text-white px-4 py-2 rounded-soft shadow-lg text-sm">
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

const CHRONICLE_ICON: Record<string, string> = {
  election_held: "\u{1F5F3}\uFE0F",
  local_sensation: "\u2B50",
  petition_ignored: "\u{1F4DD}",
  petition_accepted: "\u{1F4DD}",
  investment_offered: "\u{1F4B0}",
  investment_accepted: "\u{1F3D7}\uFE0F",
  brigade_completed: "\u{1F528}",
  brigade_taken: "\u{1F528}",
  pub_scandal: "\u{1F37A}",
};

const CHIP_TONE: Record<string, string> = {
  good: "bg-pitch-50 text-pitch-700",
  bad: "bg-red-50 text-card-red",
  neutral: "bg-white/70 text-ink-light",
};

function Chips({ items }: { items: Array<{ text: string; tone: "good" | "bad" | "neutral" }> }) {
  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {items.map((c) => <span key={c.text} className={`text-xs font-medium px-1.5 py-0.5 rounded ${CHIP_TONE[c.tone]}`}>{c.text}</span>)}
    </div>
  );
}

function formatDay(d: string): string {
  return new Date(d).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" });
}

/** Starší zápisy v kronice mají dlouhé pomlčky; v textech pro hráče je nechceme. */
function withoutLongDash(s: string): string {
  return s.replace(/\s*[\u2014\u2013]\s*/g, ", ");
}

function parseFacts(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map(withoutLongDash) : [];
  } catch (e) {
    console.warn("Zajímavosti obce:", e);
    return [];
  }
}

function parseFace(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch (e) {
    console.warn("Obličej zastupitele:", e);
    return {};
  }
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

        <div className="grid grid-cols-2 gap-3 text-sm bg-gray-50 rounded-soft p-3">
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
            <div className="max-h-72 overflow-y-auto border rounded-soft divide-y divide-gray-100">
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
