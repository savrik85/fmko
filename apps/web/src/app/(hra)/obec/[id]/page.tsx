"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { API_BASE, apiFetch } from "@/lib/api";
import { Card, CardBody, SectionLabel, ListCard, ListRow, RowIcon, RowGroup, RowValue, ListEmpty, PageLoading } from "@/components/ui";
import { FaceAvatar } from "@/components/players/face-avatar";
import { DistrictMap, clubBadgeSvg, villageSizeLabel, type MapVillage } from "@/components/map/DistrictMap";
import { StadiumPreview } from "./StadiumPreview";
import { HeroBackdrop } from "@/components/ui/hero-backdrop";
import { HeroNavButton, HeroStat, HeroStats, heroTone } from "@/components/ui/hero-kit";
import { readableOnLight } from "@/lib/team-color";

type Face = Record<string, unknown> | null;

interface Club {
  id: string;
  name: string;
  isAi: boolean;
  leagueName: string | null;
  position: number | null;
  teamsInLeague: number | null;
  points: number | null;
  fans: number | null;
  colors: { primary: string; secondary: string };
  badge: MapVillage["clubs"][number]["badge"];
  coach: { name: string; avatar: Face } | null;
  stadium: {
    name: string | null; capacity: number | null; pitchType: string | null; pitchCondition: number | null;
    lighting: number | null; stands: number | null; roof: number | null; changingRooms: number | null;
    refreshments: number | null; parking: number | null; photoUrl: string | null;
  };
  recentHomeMatches: Array<{ id: string; home: string; away: string; score: string; attendance: number | null }>;
}

type RecordMatch = { id: string; home: string; away: string; homeId: string; awayId: string; score: string; attendance: number | null } | null;

interface Records {
  homeMatches: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  averageAttendance: number | null;
  topAttendance: RecordMatch;
  biggestWin: RecordMatch;
  mostGoals: RecordMatch;
}

interface VillageProfile {
  records: Records;
  village: { id: string; name: string; district: string; region: string; population: number; size: string; lat: number; lng: number; facts: unknown };
  officials: Array<{ role: string; name: string; age: number; occupation: string; personality: string; face: Face }>;
  coachesFrom: Array<{ name: string; avatar: Face; teamId: string; teamName: string | null; isAi: boolean }>;
  chronicle: Array<{ type: string; text: string; date: string; teamName: string | null }>;
  busFans: Array<{ teamId: string; teamName: string; fans: number }>;
  clubs: Club[];
  events: Array<{ id: string; title: string; place: string; date: string; headline: string | null; body: string | null; scenes: string[] }>;
  residents: Array<{ id: string; name: string; age: number; position: string; avatar: Face; teamId: string; teamName: string }>;
}

const ROLE_LABEL: Record<string, string> = {
  starosta: "Starosta",
  mistostarosta: "Místostarosta",
  zastupitel_1: "Zastupitel",
  zastupitel_2: "Zastupitel",
};

const PERSONALITY_LABEL: Record<string, string> = {
  podnikatel: "podnikatel",
  aktivista: "aktivista",
  sportovec: "sportovec",
  tradicionalista: "tradicionalista",
  populista: "populista",
};

const CHRONICLE_ICON: Record<string, string> = {
  election_held: "\u{1F5F3}️",
  local_sensation: "⭐",
  petition_ignored: "\u{1F4DD}",
  investment_offered: "\u{1F4B0}",
  investment_accepted: "\u{1F3D7}️",
  brigade_completed: "\u{1F528}",
  pub_scandal: "\u{1F37A}",
};

const PITCH_LABEL: Record<string, string> = { natural: "přírodní tráva", hybrid: "hybridní trávník", artificial: "umělá tráva" };
const POS_LABEL: Record<string, string> = { GK: "BRA", DEF: "OBR", MID: "ZÁL", FWD: "ÚTO" };

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("cs-CZ", { day: "numeric", month: "long", timeZone: "UTC" });
}

function Avatar({ face, size, fallback }: { face: Face; size: number; fallback: string }) {
  return face
    ? <FaceAvatar faceConfig={face} size={size} className="shrink-0 rounded-full bg-surface overflow-hidden" />
    : <div className="shrink-0 rounded-full bg-surface text-muted font-heading font-bold flex items-center justify-center" style={{ width: size, height: size * 1.2 }} aria-hidden>{fallback.charAt(0)}</div>;
}

function stadiumChips(s: Club["stadium"]): string[] {
  const chips: string[] = [];
  if (s.capacity) chips.push(`kapacita ${s.capacity.toLocaleString("cs-CZ")} diváků`);
  if (s.pitchType) chips.push(PITCH_LABEL[s.pitchType] ?? s.pitchType);
  if (s.stands) chips.push(s.roof ? "krytá tribuna" : "tribuna");
  if (s.lighting) chips.push("osvětlení");
  if (s.refreshments) chips.push("občerstvení");
  if (s.parking) chips.push("parkoviště");
  return chips;
}

function ClubCard({ club }: { club: Club }) {
  const mapClub = { id: club.id, name: club.name, isAi: club.isAi, leagueName: club.leagueName, primaryColor: club.colors.primary, secondaryColor: club.colors.secondary, badge: club.badge };
  const chips = stadiumChips(club.stadium);
  // Karta klubu zůstává kartou (fotka stadionu), řádky v ní jsou ze sdílených dílů.
  return (
    <ListCard>
      <ListRow href={`/tym/${club.id}`}
        leading={<span dangerouslySetInnerHTML={{ __html: clubBadgeSvg(mapClub, 32) }} />}
        title={club.name}
        meta={[club.leagueName, club.position && club.teamsInLeague ? `${club.position}. místo z ${club.teamsInLeague}` : null]
          .filter(Boolean).join(" · ") || "bez soutěže"}
        trailing={club.fans != null ? <RowValue sub="fanoušků">{club.fans.toLocaleString("cs-CZ")}</RowValue> : undefined} />

      {club.coach && (
        <ListRow
          leading={<Avatar face={club.coach.avatar} size={36} fallback={club.coach.name} />}
          title={club.coach.name}
          meta={club.isAi ? "trenér · klub vede AI" : "trenér"} />
      )}

      <div className="px-4 py-3">
        <div className="rounded-xl bg-surface overflow-hidden">
          {club.stadium.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`${API_BASE}${club.stadium.photoUrl}`} alt={`Stadion ${club.stadium.name ?? club.name}`} className="w-full aspect-[16/9] object-cover" loading="lazy" />
          ) : (
            <StadiumPreview teamId={club.id} alt={`Stadion ${club.stadium.name ?? club.name}`} />
          )}
          <div className="p-3">
            <div className="font-heading font-bold text-sm">🏟️ {club.stadium.name ?? "Hřiště"}</div>
            {chips.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {chips.map((c) => <span key={c} className="text-xs px-1.5 py-0.5 rounded bg-white text-ink-light">{c}</span>)}
              </div>
            )}
          </div>
        </div>
      </div>

      {club.recentHomeMatches.length > 0 && (
        <>
          <RowGroup label="Naposledy na tomhle hřišti" />
          {club.recentHomeMatches.map((m) => (
            <ListRow key={m.id} dense href={`/zapas/${m.id}`}
              title={`${m.home} – ${m.away}`}
              trailing={<RowValue sub={m.attendance ? `${m.attendance} diváků` : undefined}>{m.score}</RowValue>} />
          ))}
        </>
      )}
    </ListCard>
  );
}

const LINK = "underline decoration-pitch-500/30 hover:text-pitch-600";

function RecordRow({ label, value, match }: { label: string; value: React.ReactNode; match?: RecordMatch }) {
  return (
    <li className="flex items-baseline justify-between gap-3 py-1.5 border-b border-gray-100 last:border-b-0">
      <span className="text-sm text-ink-light shrink-0">{label}</span>
      <span className="text-sm text-right min-w-0">
        <span className="font-heading font-bold tabular-nums">{value}</span>
        {match && (
          <span className="block text-xs text-ink-light">
            <Link href={`/tym/${match.homeId}`} className={LINK}>{match.home}</Link>
            {" "}<Link href={`/zapas/${match.id}`} className={`font-heading font-bold tabular-nums ${LINK}`}>{match.score}</Link>{" "}
            <Link href={`/tym/${match.awayId}`} className={LINK}>{match.away}</Link>
          </span>
        )}
      </span>
    </li>
  );
}

function PlayerValue({ p }: { p: VillageProfile["residents"][number] }) {
  return (
    <>
      <Link href={`/hrac/${p.id}`} className={LINK}>{p.name}</Link>, {p.age} let
      <span className="block text-xs font-normal text-ink-light">
        <Link href={`/tym/${p.teamId}`} className={LINK}>{p.teamName}</Link>
      </span>
    </>
  );
}

function RecordsCard({ records, residents }: { records: Records; residents: VillageProfile["residents"] }) {
  const oldest = [...residents].sort((a, b) => b.age - a.age)[0];
  const youngest = [...residents].sort((a, b) => a.age - b.age)[0];
  const r = records;
  if (r.homeMatches === 0 && residents.length === 0) return null;
  return (
    <div>
      <SectionLabel>Rekordy a zajímavosti</SectionLabel>
      <Card>
        <CardBody>
          <ul>
            {r.homeMatches > 0 && (
              <>
                <RecordRow label="Odehraných zápasů na hřišti" value={String(r.homeMatches)} />
                <RecordRow label="Domácí bilance" value={`${r.wins} výher · ${r.draws} remíz · ${r.losses} proher`} />
                <RecordRow label="Skóre doma" value={`${r.goalsFor}:${r.goalsAgainst}`} />
              </>
            )}
            {r.averageAttendance && <RecordRow label="Průměrná návštěva" value={`${r.averageAttendance.toLocaleString("cs-CZ")} diváků`} />}
            {r.topAttendance?.attendance && <RecordRow label="Rekordní návštěva" value={`${r.topAttendance.attendance.toLocaleString("cs-CZ")} diváků`} match={r.topAttendance} />}
            {r.biggestWin && <RecordRow label="Nejvyšší domácí výhra" value={r.biggestWin.score} match={r.biggestWin} />}
            {r.mostGoals && <RecordRow label="Nejvíc gólů v zápase" value={r.mostGoals.score} match={r.mostGoals} />}
            {residents.length > 0 && <RecordRow label="Hráčů z obce v okrese" value={String(residents.length)} />}
            {oldest && residents.length > 1 && <RecordRow label="Nejstarší hráč odtud" value={<PlayerValue p={oldest} />} />}
            {youngest && residents.length > 1 && <RecordRow label="Nejmladší hráč odtud" value={<PlayerValue p={youngest} />} />}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}

/** Profil obce na prohlížení: kluby a stadiony, lidé odtud, akce a kronika. */
export default function VillageProfilePage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id ?? "");
  const [data, setData] = useState<VillageProfile | null>(null);
  const [error, setError] = useState(false);
  const [siblings, setSiblings] = useState<Array<{ id: string; name: string; hasClub: boolean }>>([]);

  useEffect(() => {
    if (!id) return;
    apiFetch<VillageProfile>(`/api/villages/${encodeURIComponent(id)}/profile`)
      .then(setData)
      .catch((e) => { console.error("Načtení profilu obce se nezdařilo:", e); setError(true); });
  }, [id]);

  // Listování obcemi okresu jako u stadionů a klubů (seznam z mapy okresu).
  const district = data?.village.district ?? null;
  useEffect(() => {
    if (!district) return;
    apiFetch<{ villages: MapVillage[] }>(`/api/villages/district/${encodeURIComponent(district)}/map`)
      .then((r) => setSiblings(r.villages.map((v) => ({ id: v.id, name: v.name, hasClub: v.clubs.length > 0 }))))
      .catch((e) => console.error("Načtení obcí okresu pro listování se nezdařilo:", e));
  }, [district]);

  if (error) return <div className="page-container"><Card><CardBody><p className="text-center text-card-red">Obec se nepodařilo načíst.</p></CardBody></Card></div>;
  if (!data) return <PageLoading />;

  const v = data.village;
  // S klubem se listuje obcemi s klubem, jinak všemi; abecedně.
  const pool = siblings.filter((x) => siblings.find((y) => y.id === id)?.hasClub ? x.hasClub : true)
    .sort((a, b) => a.name.localeCompare(b.name, "cs"));
  const idx = pool.findIndex((x) => x.id === id);
  const prev = pool.length > 1 && idx >= 0 ? pool[(idx - 1 + pool.length) % pool.length] : null;
  const next = pool.length > 1 && idx >= 0 ? pool[(idx + 1) % pool.length] : null;
  const facts = Array.isArray(v.facts) ? (v.facts as unknown[]).filter((f): f is string => typeof f === "string") : [];
  const mapVillage: MapVillage = {
    id: v.id, name: v.name, population: v.population, size: v.size, lat: v.lat, lng: v.lng, events: data.events.length,
    clubs: data.clubs.map((c) => ({ id: c.id, name: c.name, isAi: c.isAi, leagueName: c.leagueName, primaryColor: c.colors.primary, secondaryColor: c.colors.secondary, badge: c.badge })),
  };

  // Obec vlastní barvu nemá. S jediným klubem si půjčí jeho, jinak zůstane zelená.
  const onlyClub = data.clubs.length === 1 ? data.clubs[0] : null;
  const color = onlyClub?.colors.primary || "#2D5F2D";
  const tone = heroTone(color);
  const plateText = tone.light ? "#FFFFFF" : readableOnLight(color);
  const statNumber = "font-heading font-extrabold text-lg sm:text-3xl tabular-nums leading-none";

  return (
    <>
      {/* Hlavička jako u hráče a týmu: název, ukazatele vpravo, listování obcemi okresu. */}
      <div className="hero-gradient hero-detail px-3 sm:px-8 py-3 sm:py-5" style={{ backgroundColor: color }}>
        <HeroBackdrop primary={color} secondary={onlyClub?.colors.secondary} />
        <div className="max-w-[1280px] mx-auto">
          <div className="flex flex-wrap items-center gap-x-3 sm:gap-x-4 gap-y-2 sm:gap-y-3">
            {prev && (
              <HeroNavButton tone={tone} direction="prev" label={`Předchozí obec: ${prev.name}`} className="hidden sm:flex"
                onClick={() => router.push(`/obec/${prev.id}`)} />
            )}
            <div className="flex-1 min-w-0">
              <h1 className={`font-heading font-extrabold ${tone.text} text-lg sm:text-3xl leading-tight`}>{v.name}</h1>
              <div className={`${tone.muted} text-[13px] sm:text-sm sm:mt-0.5`}>
                {villageSizeLabel(v.size)} &middot;{" "}
                <Link href="/obec?tab=okres" className="underline decoration-current/30 hover:decoration-current">okres {v.district}</Link>
                {prev && next && <> &middot; <span className="tabular-nums">{idx + 1} / {pool.length}</span></>}
              </div>
            </div>
            {prev && next && (
              <div className="flex sm:hidden gap-1.5 shrink-0">
                <HeroNavButton tone={tone} direction="prev" label={`Předchozí obec: ${prev.name}`} className="flex"
                  onClick={() => router.push(`/obec/${prev.id}`)} />
                <HeroNavButton tone={tone} direction="next" label={`Další obec: ${next.name}`} className="flex"
                  onClick={() => router.push(`/obec/${next.id}`)} />
              </div>
            )}
            <HeroStats tone={tone}>
              <HeroStat tone={tone} label="Obyvatel">
                <span className={`min-w-[38px] sm:min-w-[54px] h-7 sm:h-11 px-1.5 sm:px-2 rounded-control flex items-center justify-center font-heading font-extrabold text-lg sm:text-3xl tabular-nums leading-none ${tone.plate}`}
                  style={{ color: plateText }}>
                  {v.population.toLocaleString("cs-CZ")}
                </span>
              </HeroStat>
              <HeroStat tone={tone} label={data.clubs.length === 1 ? "Klub" : data.clubs.length >= 2 && data.clubs.length <= 4 ? "Kluby" : "Klubů"}>
                <span className={statNumber}>{data.clubs.length}</span>
              </HeroStat>
              <HeroStat tone={tone} label="Hráčů odtud">
                <span className={statNumber}>{data.residents.length}</span>
              </HeroStat>
            </HeroStats>
            {next && (
              <HeroNavButton tone={tone} direction="next" label={`Další obec: ${next.name}`} className="hidden sm:flex"
                onClick={() => router.push(`/obec/${next.id}`)} />
            )}
          </div>
        </div>
      </div>

    <div className="page-container space-y-6">
      <div className="grid gap-4 md:grid-cols-[1fr_300px] md:items-start">
        <Card>
          <CardBody className="space-y-3">
            <SectionLabel>O obci</SectionLabel>
            {facts.length > 0 ? (
              <ul className="space-y-1.5 text-sm text-ink-light">
                {facts.map((f, i) => <li key={i} className="flex gap-2"><span aria-hidden>·</span><span>{f}</span></li>)}
              </ul>
            ) : (
              <p className="text-sm text-muted">O téhle obci zatím kronika mlčí.</p>
            )}
          </CardBody>
        </Card>
        <DistrictMap villages={[mapVillage]} selectedId={null} onSelect={() => undefined} className="h-[220px] shadow-[var(--shadow-card)]" />
      </div>

      {data.officials.length > 0 && (
        <ListCard title="Zastupitelstvo" className="overflow-hidden">
          {/* Po dvou vedle sebe jako dřív dlaždice: pod sebou by sekce na telefonu narostla o třetinu. */}
          <div className="grid grid-cols-2 -mb-px [&>*:nth-child(odd)]:border-r [&>*:nth-child(odd)]:border-line-soft">
            {data.officials.map((o) => (
              <ListRow key={o.role} dense
                leading={<Avatar face={o.face} size={24} fallback={o.name} />}
                title={o.name}
                meta={ROLE_LABEL[o.role] ?? o.role}
                detail={`${o.occupation}, ${PERSONALITY_LABEL[o.personality] ?? o.personality}`} />
            ))}
          </div>
        </ListCard>
      )}

      <div>
        <SectionLabel>{data.clubs.length === 1 ? "Klub" : `Kluby (${data.clubs.length})`}</SectionLabel>
        {data.clubs.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {data.clubs.map((c) => <ClubCard key={c.id} club={c} />)}
          </div>
        ) : (
          <ListCard><ListEmpty icon="🏟️">V obci teď nehraje žádný klub.</ListEmpty></ListCard>
        )}
      </div>

      <RecordsCard records={data.records} residents={data.residents} />

      {data.events.length > 0 && (
        <ListCard title="Akce v obci">
          {data.events.map((e) => (
            <ListRow key={e.id}
              leading={<RowIcon>{"\u{1F3A1}"}</RowIcon>}
              title={e.title}
              meta={`${e.place} · ${formatDate(e.date)}`}
              detail={e.headline || e.body || e.scenes.length > 0 ? (
                <>
                  {e.headline && <span className="block font-bold text-ink">{e.headline}</span>}
                  {e.body && <span className="block mt-1 leading-relaxed">{e.body}</span>}
                  {e.scenes.map((s, i) => <span key={i} className="block mt-1.5 leading-relaxed border-l-2 border-pitch-500/30 pl-3">{s}</span>)}
                </>
              ) : undefined} />
          ))}
        </ListCard>
      )}

      {(data.residents.length > 0 || data.coachesFrom.length > 0) && (
        // Dřív mřížka portrétů; husté řádky drží na telefonu skoro stejnou výšku.
        // Řádek nemá href: jméno hráče i klub jsou dva různé odkazy.
        <ListCard title="Lidé odtud">
          {data.coachesFrom.length > 0 && (
            <>
              <RowGroup label="Trenéři, kteří tu bydlí" />
              {data.coachesFrom.map((m) => (
                <ListRow key={`${m.teamId}-${m.name}`} dense
                  leading={<Avatar face={m.avatar} size={20} fallback={m.name} />}
                  title={m.name}
                  meta={m.teamName ? <Link href={`/tym/${m.teamId}`} className="hover:text-pitch-600">{m.teamName}</Link> : undefined} />
              ))}
            </>
          )}
          {data.residents.length > 0 && (
            <>
              <RowGroup label="Hráči, kteří tu bydlí" />
              {data.residents.map((p) => (
                <ListRow key={p.id} dense
                  leading={<Avatar face={p.avatar} size={20} fallback={p.name} />}
                  title={<Link href={`/hrac/${p.id}`} className="hover:text-pitch-600 underline decoration-pitch-500/20">{p.name}</Link>}
                  meta={<>
                    {POS_LABEL[p.position] ?? p.position} · {p.age} let · <Link href={`/tym/${p.teamId}`} className="hover:text-pitch-600 underline decoration-pitch-500/20">{p.teamName}</Link>
                  </>} />
              ))}
            </>
          )}
        </ListCard>
      )}

      {data.busFans.length > 0 && (
        <ListCard title="Odsud se jezdí fandit">
          {data.busFans.map((b) => (
            <ListRow key={b.teamId} dense href={`/tym/${b.teamId}`}
              leading={<span className="text-base leading-none" aria-hidden="true">🚌</span>}
              title={b.teamName}
              trailing={<RowValue sub="fanoušků">{b.fans}</RowValue>} />
          ))}
        </ListCard>
      )}

      {data.chronicle.length > 0 && (
        <ListCard title="Kronika obce">
          {data.chronicle.map((h, i) => (
            <ListRow key={i}
              leading={<RowIcon>{CHRONICLE_ICON[h.type] ?? "\u{1F4DC}"}</RowIcon>}
              title={formatDate(h.date)}
              meta={h.teamName ?? undefined}
              detail={h.text} />
          ))}
        </ListCard>
      )}
    </div>
    </>
  );
}
