"use client";

import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { builtExtensionsOf } from "@/components/stadium/stadium-3d/stand-levels";
import type { WeatherType } from "@/components/stadium/stadium-3d/constants";
import { Stadium3D } from "@/components/stadium/stadium-3d/Stadium3D";
import { venueExtensions, venueFacilities } from "@/app/(hra)/turnaj/venue-scene";
import { ReplayScene, type ReplayStep } from "./ReplayScene";
import { CoachCard, EventCard, EventLabel, initials, ReplayMark, ScoreBug } from "./graphics";
import { BANNERS_BOTTOM, BANNERS_INSET, OVERLAY_BUTTON, OVERLAY_FAINT, OVERLAY_GAP, OVERLAY_HIDDEN, OVERLAY_SHOWN_MS } from "./overlay";
import { Replay, shootoutScore, sideOf, type ReplayCoach, type ReplayEvent, type ReplayKit, type ReplayLineup } from "./scenes";

/** Šířka okna záznamu, pro kterou je grafika navržená (px); v jiném okně se zmenší nebo zvětší celá, jako obraz videa. */
const GRAPHICS_WIDTH = 848;

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
  /** Hráč o přestávce pustil druhý poločas tlačítkem v obraze (na celé obrazovce není tlačítko stránky vidět). */
  onSecondHalf: () => void;
}

/** Chyba ve 3D záznamu nesmí hráči vzít celou stránku: ohlásí se stránce záznamu, ta místo obrazu ukáže zprávu. */
class FailureGuard extends Component<{ onFailure: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) {
    console.error("3D záznam selhal:", error);
    this.props.onFailure();
  }
  render() { return this.state.failed ? null : this.props.children; }
}

/** 3D záznam zápasu na stadionu domácích, řízený stavem záznamu. Vyplní rodiče, do kterého se vloží. */
export function Replay3D({ onFailure, ...props }: Replay3DProps & { /** 3D záznam spadl. */ onFailure: () => void }) {
  return <FailureGuard onFailure={onFailure}><Replay3DView {...props} /></FailureGuard>;
}

function Replay3DView({ detail, events, progress, onReady, onSecondHalf }: Replay3DProps) {
  const { take, idx, flash, intro, kickoff, halfTime, finished, paused, cue, fast, homeGoals, awayGoals } = progress;
  const homeName = detail.home_name as string;
  const kits = useMemo(() => ({ home: detail.home_kit as ReplayKit, away: detail.away_kit as ReplayKit }), [detail]);
  const pens = shootoutScore(detail);
  const margin = (detail.home_score as number) - (detail.away_score as number) || (pens ? pens.home - pens.away : 0);
  const replay = useMemo(() => new Replay({
    matchId: detail.id as string, events, winner: margin > 0 ? "home" : margin < 0 ? "away" : null, goodTerms: detail.coaches_on_good_terms === true,
    refereeGrade: (detail.referee_grade as number | null | undefined) ?? null,
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
  // Scéna se staví, až je známo, jak stadion vypadá: jinak by se záznam rozběhl na výchozím hřišti a tribuny by
  // naskočily až během něj. Dokud se podoba nenačte, záznam čeká (hráč může přepnout na tracker). Velkoklub
  // z poháru stadion ve hře nemá, hraje se na výchozím.
  const stadiumKnown = stadium !== null || (!venue?.look && !homeTeamId);

  // Nápisy patří k videu: dokud se scéna načítá, nejsou vidět.
  const [ready, setReady] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  // Pohled: televizní kamera z tribuny, nebo celý stadion z výšky.
  const [overview, setOverview] = useState(false);
  const finalScore = `${detail.home_score} : ${detail.away_score}${pens ? ` (pen. ${pens.home}:${pens.away})` : ""}`;
  const frame = useRef<HTMLDivElement>(null);
  // Grafika je rozvržená na šířku GRAPHICS_WIDTH a s oknem se zvětšuje a zmenšuje celá.
  const [fit, setFit] = useState({ scale: 1, height: 0 });
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      const scale = entry.contentRect.width / GRAPHICS_WIDTH;
      setFit({ scale, height: entry.contentRect.height / scale });
    });
    observer.observe(frame.current!);
    return () => observer.disconnect();
  }, []);
  const buttonsTop = fit.scale * GRAPHICS_WIDTH * BANNERS_BOTTOM + OVERLAY_GAP, buttonsRight = fit.scale * GRAPHICS_WIDTH * BANNERS_INSET;
  // Na celé obrazovce jsou tlačítka vidět jen chvíli po pohybu myši nebo klepnutí.
  const [stirred, setStirred] = useState(false);
  const calm = useRef<ReturnType<typeof setTimeout>>(undefined);
  const stir = () => {
    setStirred(true);
    clearTimeout(calm.current);
    calm.current = setTimeout(() => setStirred(false), OVERLAY_SHOWN_MS);
  };
  useEffect(() => () => clearTimeout(calm.current), []);
  const buttonsShown = !fullscreen ? OVERLAY_FAINT : stirred ? "transition-opacity" : OVERLAY_HIDDEN;
  const veil = useRef<HTMLCanvasElement>(null);
  // Představení trenérů, výkop, přestávka a konec zápasu grafiku události nemají. Události bez scény taky ne: roh
  // nebo standardka bez zakončení by jinak na okamžik ukázaly „ŠANCE“ nad obrazem předchozí akce.
  const event = (cue === null && (intro !== null || kickoff !== null || halfTime || finished)) || !replay.scened[index] ? undefined : events[index];
  const coachSide = intro === "home" || intro === "away" ? intro : null;
  const attendance = detail.attendance as number | null;
  const graphics = { detail, events, index, event, attack };
  const fixedLabel = finished ? { text: "KONEC ZÁPASU", sub: finalScore, tone: "info" as const }
    : coachSide ? { text: coachSide === "home" ? "TRENÉR DOMÁCÍCH" : "TRENÉR HOSTŮ", tone: "info" as const }
    : kickoff ? { text: "VÝKOP", sub: kickoff === "2nd" ? "2. poločas" : undefined, tone: "info" as const } : undefined;

  // Gól se na výsledkovou tabulku připíše s animací: ve chvíli, kdy ho záznam počítá, patří poslední ukázané události.
  const scored = flash === "goal" && cue === null ? sideOf(events[index].teamId) : null;

  return (
    <div ref={frame} onPointerMove={stir} onPointerDown={stir} className={`group/shot bg-black ${fullscreen ? "fixed inset-0 z-50" : "absolute inset-0 z-20"}`}>
      {stadiumKnown && <Stadium3D
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
        replay={<ReplayScene replay={replay} kits={kits} snow={detail.weather === "snow"} overview={overview} step={step} root={frame} veil={veil} onReady={() => { setReady(true); onReady(); }} />}
      />}
      {/* Při střihu tu doznívá poslední snímek starého záběru (kreslí a zprůhledňuje ho scéna); grafika zůstává nad ním. */}
      <canvas ref={veil} style={{ opacity: 0 }} className="absolute inset-0 z-10 w-full h-full pointer-events-none" />

      {ready && <div className="absolute top-0 left-0 z-30 origin-top-left pointer-events-none" style={{ width: GRAPHICS_WIDTH, height: fit.height, transform: `scale(${fit.scale})` }}>
        {/* Nahoře vedle sebe: vlevo výsledková tabulka, vpravo nápis akce. */}
        <div className="absolute top-2 inset-x-2 flex items-start gap-2">
          <ScoreBug detail={detail} homeGoals={homeGoals} awayGoals={awayGoals} minute={events[index]?.minute} scored={scored} fast={fast} />
          <EventLabel {...graphics} override={fixedLabel} />
        </div>
        <ReplayMark />
        <EventCard {...graphics} />
        {coachSide && <CoachCard detail={detail} side={coachSide} />}
        {/* O přestávce stojí týmy připravené na výkop a obraz je ztmavený. */}
        {halfTime && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/45">
            <div className="text-center font-heading text-white">
              <div className="font-[900] text-6xl tracking-widest">POLOČAS</div>
              <div className="font-[800] text-3xl text-white/80 mt-1 tabular-nums">{homeGoals} : {awayGoals}</div>
              {fullscreen && (
                <button onClick={onSecondHalf} className="mt-6 px-8 py-3 rounded-xl bg-white hover:bg-gray-100 text-gray-900 text-2xl font-bold uppercase shadow-lg pointer-events-auto">2. poločas {"▶"}</button>
              )}
            </div>
          </div>
        )}
      </div>}
      {/* Tlačítka vpravo pod horními nápisy, vedle sebe: pohled a celá obrazovka. Pohled se dá volit až od výkopu;
          představení trenérů má vlastní kameru. */}
      {intro === null && (
        <button onClick={() => setOverview((v) => !v)} title={overview ? "Pohled z tribuny" : "Pohled z paneláku"}
          style={{ top: buttonsTop, right: buttonsRight + 28 + OVERLAY_GAP }} className={`${OVERLAY_BUTTON} ${buttonsShown} z-40 px-2`}>
          {overview ? "Pohled z tribuny" : "Pohled z paneláku"}
        </button>
      )}
      <button onClick={() => setFullscreen((v) => !v)} title={fullscreen ? "Zmenšit" : "Na celou obrazovku"}
        style={{ top: buttonsTop, right: buttonsRight }} className={`${OVERLAY_BUTTON} ${buttonsShown} z-40 w-7`}>
        <span className="text-base leading-none">{fullscreen ? "✕" : "⛶"}</span>
      </button>
    </div>
  );
}
