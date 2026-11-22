"use client";

import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { clientOnly } from "@/components/client-only";
import { apiFetch } from "@/lib/api";
import { builtExtensionsOf } from "@/components/stadium/stadium-3d/stand-levels";
import type { WeatherType } from "@/components/stadium/stadium-3d/constants";
import { venueExtensions, venueFacilities } from "@/app/(hra)/turnaj/venue-scene";
import { ReplayScene, type ReplayStep } from "./ReplayScene";
import { CoachCard, EventCard, EventLabel, initials, ReplayChip, ScoreBug } from "./graphics";
import { OVERLAY_CONTROL } from "./overlay";
import { Replay, shootoutScore, type ReplayCoach, type ReplayEvent, type ReplayKit, type ReplayLineup } from "./scenes";

const Stadium3D = clientOnly(() => import("@/components/stadium/stadium-3d/Stadium3D").then((m) => m.Stadium3D));

/** Stav záznamu (zaznam/page.tsx); 3D kreslí totéž, co právě ukazuje on. */
interface ReplayProgress {
  /** Kolikrát se záznam pustil od začátku (tlačítko „předchozí“ až na úvod). */
  take: number;
  /** Kolik událostí už záznam ukázal. */
  idx: number;
  flash: "goal" | "card" | "chance" | "attacking" | "injury" | "penalty" | null;
  /** Před výkopem: představení trenéra domácích, hostů a podání rukou. */
  intro: "home" | "away" | "handshake" | null;
  kickoff: "1st" | "2nd" | null;
  halfTime: boolean;
  finished: boolean;
  /** Pauza: obraz stojí celý, i sníh, vlajky a diváci. */
  paused: boolean;
  /** Po skoku na akci: událost, jejíž scéna má chvíli stát na prvním snímku. */
  cue: number | null;
  fast: boolean;
  homeGoals: number;
  awayGoals: number;
}

interface StadiumData {
  capacity?: number;
  facilities: Record<string, number>;
  standExtensions?: { slots: { slot: string; built?: { kind: string; level: number } | null }[] };
}

interface Replay3DProps {
  detail: Record<string, unknown>;
  events: ReplayEvent[];
  progress: ReplayProgress;
  /** Scéna se poprvé vykreslila; záznam do té doby čeká s výkopem. */
  onReady: () => void;
}

/**
 * Chyba ve 3D záznamu nesmí hráči vzít celou stránku: místo obrazu se ukáže zpráva a zápas si dohraje ve 2D
 * (přepínač je v rohu okna). Přepnutí zpět na 3D ho zkusí načíst znovu.
 */
class FailureGuard extends Component<{ onFailure: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) {
    console.error("3D záznam selhal:", error);
    this.props.onFailure();
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-1 px-6 bg-[#0a0a0a]/90 text-center font-heading text-white">
        <div className="font-[900] text-base sm:text-2xl">Video se nepodařilo přehrát</div>
        <div className="text-xs sm:text-base text-white/75">Přepněte vlevo nahoře na Tracker a zápas dohrajte tam.</div>
      </div>
    );
  }
}

/** 3D záznam zápasu na stadionu domácích, řízený stavem záznamu. Vyplní rodiče, do kterého se vloží. */
export function Replay3D({ onFailure, ...props }: Replay3DProps & { /** 3D záznam spadl a místo obrazu je zpráva. */ onFailure: () => void }) {
  return <FailureGuard onFailure={onFailure}><Replay3DView {...props} /></FailureGuard>;
}

function Replay3DView({ detail, events, progress, onReady }: Replay3DProps) {
  const { take, idx, flash, intro, kickoff, halfTime, finished, paused, cue, fast, homeGoals, awayGoals } = progress;
  const homeName = detail.home_name as string;
  const kits = useMemo(() => ({ home: detail.home_kit as ReplayKit, away: detail.away_kit as ReplayKit }), [detail]);
  const pens = shootoutScore(detail);
  const margin = (detail.home_score as number) - (detail.away_score as number) || (pens ? pens.home - pens.away : 0);
  const replay = useMemo(() => new Replay({
    matchId: detail.id as string, events, winner: margin > 0 ? "home" : margin < 0 ? "away" : null, goodTerms: detail.coaches_on_good_terms === true,
    home: { coach: detail.home_coach as ReplayCoach | null, ...(detail.home_lineup_data as ReplayLineup) },
    away: { coach: detail.away_coach as ReplayCoach | null, ...(detail.away_lineup_data as ReplayLineup) },
  }), [detail, events, margin]);

  // Krok záznamu → záběr: „ŠANCE“ je útočná fáze události, která teprve přijde; jinak je v obraze poslední akce
  // (nebo výkop) a běží dál. Po skoku stojí cílová akce na prvním snímku (u šance na začátku útoku).
  const shot = flash === "attacking";
  /** Událost, které patří grafika. */
  const index = cue ?? (shot ? idx : idx - 1);
  const scene = useMemo(() => (cue !== null ? replay.scene(cue) : intro ? replay.intro() : finished ? replay.finale() : shot ? replay.scene(idx) : replay.before(idx)), [replay, cue, intro !== null, finished, shot, idx]); // eslint-disable-line react-hooks/exhaustive-deps
  const attack = cue !== null ? scene.split > scene.start : shot;
  // Skok začíná nový záběr, i když míří na akci, která zrovna běží.
  const play = useMemo(() => ({ scene, attack }), [scene, attack, cue !== null, take]); // eslint-disable-line react-hooks/exhaustive-deps
  // O přestávce stojí týmy připravené na výkop druhého poločasu.
  const step = useRef<ReplayStep>({ play, rate: 1, hold: false });
  step.current = { play, rate: fast ? 2 : 1, hold: halfTime || cue !== null };

  // Stadion domácích; turnaj se hraje na hřišti z losu a velkoklub z poháru stadion ve hře nemá.
  const venue = detail.isTournament === true ? (detail.venue as { capacity?: number; look?: Record<string, unknown> } | null) : null;
  const homeTeamId = detail.home_team_id as string | null;
  const [stadium, setStadium] = useState<StadiumData | null>(null);
  useEffect(() => {
    if (venue?.look) {
      const look = venue.look;
      setStadium({ capacity: venue.capacity, facilities: venueFacilities(look), standExtensions: { slots: venueExtensions(look).map((e) => ({ slot: e.slot, built: { kind: e.kind, level: e.level } })) } });
    } else if (homeTeamId) {
      apiFetch<StadiumData>(`/api/teams/${homeTeamId}/stadium`).then(setStadium).catch((e) => console.error("stadion pro 3D záznam:", e));
    }
  }, [venue, homeTeamId]);

  const [fullscreen, setFullscreen] = useState(false);
  // Pohled: televizní kamera z tribuny, nebo celý stadion z výšky.
  const [overview, setOverview] = useState(false);
  const finalScore = `${detail.home_score} : ${detail.away_score}${pens ? ` (pen. ${pens.home}:${pens.away})` : ""}`;
  const frame = useRef<HTMLDivElement>(null);
  const veil = useRef<HTMLCanvasElement>(null);
  // Představení trenérů, výkop, přestávka a konec zápasu grafiku události nemají.
  const event = cue === null && (intro !== null || kickoff !== null || halfTime || finished) ? undefined : events[index];
  const coachSide = intro === "home" || intro === "away" ? intro : null;
  const attendance = detail.attendance as number | null;
  const graphics = { detail, events, index, event, attack };
  const fixedLabel = finished ? { text: "KONEC ZÁPASU", sub: finalScore, tone: "info" as const }
    : coachSide ? { text: coachSide === "home" ? "TRENÉR DOMÁCÍCH" : "TRENÉR HOSTŮ", tone: "info" as const }
    : kickoff ? { text: "VÝKOP", sub: kickoff === "2nd" ? "2. poločas" : undefined, tone: "info" as const } : undefined;

  // Gól se na výsledkovou tabulku připíše s animací: ve chvíli, kdy ho záznam počítá, patří poslední ukázané události.
  const scored = flash === "goal" && cue === null ? (events[index].teamId === 1 ? "home" as const : "away" as const) : null;

  return (
    <div ref={frame} className={`group/shot bg-black ${fullscreen ? "fixed inset-0 z-50" : "absolute inset-0 z-20"}`}>
      <Stadium3D
        pitchCondition={(detail.pitch_condition as number | null) ?? 85}
        pitchType={(venue?.look?.pitch_type as string) ?? (detail.pitch_type as string) ?? "natural"}
        facilities={stadium?.facilities ?? { stands: 1, fence: 1, entrance_gate: 1 }}
        standExtensions={builtExtensionsOf(stadium?.standExtensions)}
        teamColor={(venue?.look?.primary as string) ?? (detail.home_color as string)}
        secondaryColor={(venue?.look?.secondary as string) ?? (detail.home_secondary as string)}
        badgePattern={venue ? "shield" : (detail.home_badge as string)}
        badgeInitials={venue ? "PM" : initials(homeName)}
        sponsors={venue ? ["P-Mobile"] : undefined}
        adBoardColor={venue ? "#C8006A" : undefined}
        stadiumName={(detail.stadium_name as string | null) ?? `Stadion ${homeName}`}
        // Na tribunách tolik lidí, kolik na zápas přišlo.
        attendanceRatio={attendance !== null && stadium?.capacity ? Math.min(1, attendance / stadium.capacity) : undefined}
        initialWeather={(detail.weather as WeatherType | null) ?? "sunny"}
        showControls={false}
        frozen={paused}
        // Pohled „z tribuny“ nemá rozostření okrajů, které stadion používá u pohledů z dálky.
        initialViewpoint="main_stand"
        replay={<ReplayScene replay={replay} kits={kits} snow={detail.weather === "snow"} overview={overview} step={step} frame={frame} veil={veil} onReady={onReady} />}
      />
      {/* Při střihu tu doznívá poslední snímek starého záběru (kreslí a zprůhledňuje ho scéna); grafika zůstává nad ním. */}
      <canvas ref={veil} style={{ opacity: 0 }} className="absolute inset-0 z-10 w-full h-full pointer-events-none" />

      {/* Nahoře vedle sebe: vlevo výsledková tabulka, vpravo nápis akce, při opakovaném záběru gólu mezi nimi jeho
          nápis. V úzkém okně (telefon) se nápis akce vedle tabulky nevejde a je pod ní. */}
      <div className="absolute top-2 inset-x-2 z-30 flex flex-wrap sm:flex-nowrap items-start gap-2 pointer-events-none">
        <ScoreBug detail={detail} homeGoals={homeGoals} awayGoals={awayGoals} minute={events[index]?.minute} scored={scored} fast={fast} />
        <ReplayChip />
        <EventLabel {...graphics} override={fixedLabel} />
      </div>
      <EventCard {...graphics} />
      {coachSide && <CoachCard detail={detail} side={coachSide} />}
      {/* Opakovaný záběr gólu má kolem obrazu rámeček (atribut `data-replaying` zapíná scéna sama). */}
      <div className="hidden group-data-[replaying]/shot:block absolute inset-0 z-30 pointer-events-none border-4 border-white/70" />
      {/* O přestávce stojí týmy připravené na výkop a obraz je ztmavený. */}
      {halfTime && (
        <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none bg-black/45">
          <div className="text-center font-heading text-white">
            <div className="font-[900] text-4xl sm:text-6xl tracking-widest">POLOČAS</div>
            <div className="font-[800] text-xl sm:text-3xl text-white/80 mt-1 tabular-nums">{homeGoals} : {awayGoals}</div>
          </div>
        </div>
      )}
      {/* Pohled se dá volit až od výkopu; představení trenérů má vlastní kameru. */}
      {intro === null && (
        <button onClick={() => setOverview((v) => !v)} title={overview ? "Pohled z tribuny" : "Pohled z výšky"}
          className={`absolute top-12 right-2 z-40 h-8 px-2.5 rounded-lg bg-black/85 hover:bg-black text-white text-xs font-heading font-bold ${OVERLAY_CONTROL}`}>
          {overview ? "Z tribuny" : "Z výšky"}
        </button>
      )}
      <button onClick={() => setFullscreen((v) => !v)} title={fullscreen ? "Zmenšit" : "Na celou obrazovku"}
        className={`absolute top-2 right-2 z-40 w-8 h-8 rounded-lg bg-black/85 hover:bg-black text-white text-base leading-none ${OVERLAY_CONTROL}`}>
        {fullscreen ? "✕" : "⛶"}
      </button>
    </div>
  );
}
