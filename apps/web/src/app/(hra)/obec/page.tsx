"use client";

import { triggerMenuBadgesRefresh } from "@/hooks/use-menu-badges";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { Card, CardBody, SectionLabel, Modal, Button, Tabs, useTabParam, ListCard, ListRow, ListEmpty, RowIcon, RowValue, SectionLoading, ProgressBar, type ProgressTone } from "@/components/ui";
import { DistrictMap, clubBadgeSvg, villageSizeLabel, type MapVillage } from "@/components/map/DistrictMap";
import { DistrictVillages } from "./DistrictVillages";
import { FaceAvatar } from "@/components/players/face-avatar";
import { formatKc } from "@/lib/format";

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

function favorTone(favor: number): ProgressTone {
  if (favor >= 50) return "ok";
  if (favor >= 30) return "warn";
  return "danger";
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
      <ProgressBar value={Math.max(0, Math.min(100, value))} tone={favorTone(value)} label="Přízeň" />
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
      triggerMenuBadgesRefresh();
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
        ? `Hotovo, obec přispěla ${formatKc(res.offeredAmount ?? 0)}.`
        : "Nabídka odmítnuta.";
      setToast(msg);
      setTimeout(() => setToast(null), 4000);
      if (villageId) await refresh(villageId);
      triggerMenuBadgesRefresh();
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
      triggerMenuBadgesRefresh();
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
      triggerMenuBadgesRefresh();
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
    return <SectionLoading />;
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
        <ListCard title="Čeká na tebe" count={waiting}>
          {pubEncounters.map((p) => (
            <ListRow key={p.id} tone="warn"
              leading={<FaceAvatar faceConfig={parseFace(p.face_config)} size={36} className="rounded-full bg-white overflow-hidden" />}
              title={`${p.first_name} ${p.last_name}`}
              meta={`🍺 V hospodě · ${ROLE_LABEL[p.role]}`}
              detail={<>
                <span className="block">Zaškoupil si pivo a čeká, jestli ho přemluvíš na další. Buď se sblížíte, nebo je z toho skandál.</span>
                <span className="block text-muted mt-1">{PERSONALITY_LABEL[p.personality]} · vyprší {formatDay(p.expires_at)}</span>
                <span className="flex gap-2 mt-2">
                  <Button variant="secondary" size="sm" disabled={respondingPubId === p.id} onClick={() => respondPub(p.id, "ignore")}>Nechat být</Button>
                  <Button size="sm" disabled={respondingPubId === p.id} onClick={() => respondPub(p.id, "invite_beer")}>Pozvat na pivo</Button>
                </span>
              </>} />
          ))}
          {investments.map((i) => (
            <ListRow key={i.id} tone="new"
              leading={<RowIcon>💰</RowIcon>}
              title={investmentTargetLabel(i.target_facility, i.type)}
              meta={`Obec nabízí investici · vyprší ${formatDay(i.expires_at)}`}
              detail={<>
                <Chips items={[
                  { text: `obec dá ${formatKc(i.offered_amount)}`, tone: "good" },
                  { text: `ty doplatíš ${formatKc(i.required_contribution)}`, tone: "bad" },
                  ...(i.political_cost > 0 ? [{ text: `opozice −${i.political_cost} přízeň`, tone: "bad" as const }] : []),
                ]} />
                <span className="flex gap-2 mt-2">
                  <Button variant="secondary" size="sm" disabled={respondingInvId === i.id} onClick={() => respondInvestment(i.id, "decline")}>Odmítnout</Button>
                  <Button size="sm" disabled={respondingInvId === i.id} onClick={() => respondInvestment(i.id, "accept")}>Přijmout</Button>
                </span>
              </>} />
          ))}
          {petitions.map((p) => (
            <ListRow key={p.id} tone="warn"
              leading={<RowIcon>📜</RowIcon>}
              title={p.title}
              meta={`Petice občanů · vyprší ${formatDay(p.expires_at)}`}
              detail={<>
                <span className="block">{p.description}</span>
                <Chips items={[
                  { text: `−${formatKc(p.cost_money)}`, tone: "bad" },
                  { text: `+${p.reward_favor} přízeň`, tone: "good" },
                  { text: `když ji přejdeš ${p.ignore_penalty} přízeň`, tone: "neutral" },
                ]} />
                <span className="flex gap-2 mt-2">
                  <Button variant="secondary" size="sm" disabled={respondingPetitionId === p.id} onClick={() => respondPetition(p.id, "ignore")}>Přejít</Button>
                  <Button size="sm" disabled={respondingPetitionId === p.id} onClick={() => respondPetition(p.id, "accept")}>Vyhovět</Button>
                </span>
              </>} />
          ))}
        </ListCard>
      )}

      {/* Zastupitelstvo */}
      <ListCard title="Zastupitelstvo" count={officials.length}>
        {officials.map((o) => {
          const f = favor.perOfficial.find((p) => p.officialId === o.id)?.favor ?? 50;
          const rivals = teams.filter((t) => t.id !== teamId);
          return (
            <ListRow key={o.id}
              leading={<FaceAvatar faceConfig={o.faceConfig} size={36} className="rounded-full bg-surface overflow-hidden" />}
              title={`${o.firstName} ${o.lastName}`}
              meta={`${ROLE_LABEL[o.role]} · ${o.age} let`}
              trailing={<span className="text-meta font-bold whitespace-nowrap" title="Jak to má s námi">{favorLabel(f)}</span>}
              detail={<>
                <span className="block text-muted">{o.occupation}</span>
                <span className="inline-block mt-1 text-xs font-medium px-1.5 py-0.5 rounded bg-surface text-ink-light" title={PERSONALITY_DESC[o.personality]}>
                  {PERSONALITY_LABEL[o.personality]}
                </span>
                <span className="block mt-2 max-w-[260px]"><FavorBar value={f} label="" /></span>
                {rivals.length > 0 && (
                  <span className="block pt-1.5 space-y-1">
                    {rivals.map((t) => {
                      const tf = favorMatrix[t.id]?.[o.id] ?? 50;
                      return (
                        <span key={t.id} className="flex items-center gap-2 text-xs text-muted">
                          <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: t.primary_color }} aria-hidden />
                          <span className="truncate flex-1">{t.name}</span>
                          <span>{favorLabel(tf)}</span>
                        </span>
                      );
                    })}
                  </span>
                )}
                <span className="block text-xs text-muted pt-1.5">{PERSONALITY_DESC[o.personality]}. {termRemaining(o.termEndAt)}.</span>
              </>} />
          );
        })}
      </ListCard>

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
              <div className="-mx-5 -mb-4 border-t border-line">
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
                    <ListRow key={o.id}
                      title={`${o.first_name} ${o.last_name}`}
                      meta={`${ROLE_LABEL[o.role as OfficialRole]} · ${favorLabel(o.favor)} · ${PERSONALITY_LABEL[o.personality as Personality]}`}
                      trailing={<span className="block text-right max-w-[150px]">
                        {slotTakenByMe ? <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-pitch-50 text-pitch-700">Přijde ✓</span>
                          : slotTakenByOther ? <span className="text-xs text-muted">Jde k {o.slot_taken_by_name}</span>
                          : myInv?.status === "declined" ? (
                            <span className="block text-xs text-card-red">Odmítl{reason && <span className="block text-muted italic">„{reason}"</span>}</span>
                          ) : (
                            <Button size="sm" disabled={isInviting || !!myInv} onClick={() => handleInvite(o.id)}>
                              {isInviting ? "…" : myInv ? "Pozváno" : "Pozvat"}
                            </Button>
                          )}
                        {!slotTakenByMe && !slotTakenByOther && !myInv && <span className="block text-xs text-muted mt-0.5">dárek {formatKc(giftCost)}</span>}
                      </span>} />
                  );
                })}
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* Brigády */}
      <ListCard title="Brigády pro obec" count={brigades.length || undefined}>
        {brigades.length === 0 ? (
          <ListEmpty icon="🛠️">Teď žádná brigáda není. Nové obec vyhlašuje v pondělí.</ListEmpty>
        ) : (
          brigades.map((b) => {
            const isOpen = b.status === "open";
            const isMine = !!b.taken_team_name && myTeam?.name === b.taken_team_name;
            return (
              <div key={b.id} className={isOpen ? "" : "opacity-70"}>
                <ListRow tone={isOpen ? "new" : undefined}
                  leading={<RowIcon>🛠️</RowIcon>}
                  title={b.title}
                  meta={`${b.offering_official_name ? `Vyhlásil ${b.offering_official_name}` : "Obec"} · ${b.required_player_count} hráčů`}
                  detail={<>
                    <span className="block">{b.description}</span>
                    <Chips items={[
                      { text: `+${b.reward_favor} přízeň`, tone: "good" },
                      { text: `−${b.condition_drain} kondice`, tone: "bad" },
                      ...(b.morale_change !== 0 ? [{ text: `${b.morale_change > 0 ? "+" : ""}${b.morale_change} nálada`, tone: (b.morale_change > 0 ? "good" : "bad") as "good" | "bad" }] : []),
                    ]} />
                    <span className="block text-muted mt-1.5">
                      {isOpen ? "Kdo dřív přijde, ten bere. Ostatní kluby v obci ji vidí taky." : `Vzal ${isMine ? "náš klub" : b.taken_team_name ?? "jiný klub"}${b.taken_at ? `, ${formatDay(b.taken_at)}` : ""}`}
                    </span>
                    {isOpen && <span className="block mt-2"><Button size="sm" onClick={() => setTakeBrigade(b)}>Vzít brigádu</Button></span>}
                  </>} />
              </div>
            );
          })
        )}
      </ListCard>

      {/* Kluby v obci */}
      <ListCard title={teams.length === 1 ? "Klub v obci" : "Kluby v obci"} count={teams.length > 1 ? teams.length : undefined}>
        {teams.length === 1 && <p className="px-4 pt-3 text-meta text-muted">V obci jsme jediný klub, o přízeň radnice se nedělíme.</p>}
        {[...teams].sort((a, b) => b.global_favor - a.global_favor).map((t) => (
          <ListRow key={t.id} href={`/tym/${t.id}`} chevron={false}
            tone={t.id === teamId ? "new" : undefined}
            leading={<span dangerouslySetInnerHTML={{ __html: clubBadgeSvg(mapVillage.clubs.find((c) => c.id === t.id)!, 30) }} />}
            title={<>{t.name}{t.id === teamId && <span className="font-normal text-muted"> (my)</span>}</>}
            detail={<span className="block max-w-[220px]"><FavorBar value={t.global_favor} label="" /></span>}
            trailing={<span className="text-meta font-bold whitespace-nowrap">{favorLabel(t.global_favor)}</span>} />
        ))}
      </ListCard>

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
                      { v: localPride.avgRating ?? "?", l: "průměrné hodnocení" },
                    ].map((x) => (
                      <div key={x.l} className="rounded-xl bg-surface p-2">
                        <div className="text-2xl font-heading font-bold tabular-nums">{x.v}</div>
                        <div className="text-xs text-muted">{x.l}</div>
                      </div>
                    ))}
                  </div>
                  <div className="-mx-5 -mb-4 border-t border-line">
                    {localPride.locals.map((p) => (
                      <ListRow key={p.id} href={`/hrac/${p.id}`}
                        title={`${p.firstName} ${p.lastName}`}
                        meta={`${p.recentStarts} zápasů · ${p.recentGoals}+${p.recentAssists}${p.recentAvgRating ? ` · známka ${p.recentAvgRating}` : ""}`}
                        trailing={<RowValue sub={p.position}>{p.overallRating}</RowValue>} />
                    ))}
                  </div>
                </>
              )}
            </CardBody>
          </Card>
        </div>
      )}

      {/* Kronika obce */}
      <ListCard title="Kronika obce">
        {feed.length === 0 && <ListEmpty icon="📜">Zatím se v obci nic nezapsalo. Kronikář zapíše brigády, pozvánky i petice.</ListEmpty>}
        {feed.map((e) => (
          <ListRow key={e.id}
            leading={<RowIcon>{CHRONICLE_ICON[e.event_type] ?? "\u{1F4DC}"}</RowIcon>}
            title={formatDay(e.game_date || e.created_at)}
            meta={[e.team_name, e.official_name].filter(Boolean).join(" · ") || undefined}
            detail={withoutLongDash(e.description)} />
        ))}
      </ListCard>

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
      triggerMenuBadgesRefresh();
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
            <SectionLoading />
          ) : eligible.length < brigade.required_player_count ? (
            <div className="text-sm text-card-red">
              Nemáš dost způsobilých hráčů (potřeba ≥ 60 kondice, bez zranění).
            </div>
          ) : (
            <div className="max-h-72 overflow-y-auto border border-line rounded-soft divide-y divide-line-soft">
              {/* Celý řádek je popisek zaškrtávátka. */}
              {eligible.map((p) => {
                let lc: { condition?: number; morale?: number } = {};
                try { lc = JSON.parse(p.life_context); } catch { lc = {}; }
                const isSelected = selected.has(p.id);
                const disabled = !isSelected && selected.size >= brigade.required_player_count;
                return (
                  <label key={p.id} className={`block ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer hover:bg-surface-2"}`}>
                    <ListRow dense
                      leading={<input type="checkbox" checked={isSelected} onChange={() => toggle(p.id)} disabled={disabled} className="w-4 h-4" />}
                      title={<>{p.first_name} {p.last_name} <span className="text-meta font-normal text-muted">({p.position})</span></>}
                      trailing={<span className="text-meta text-muted tabular-nums">{lc.condition ?? 100} k · {lc.morale ?? 50} m</span>} />
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
