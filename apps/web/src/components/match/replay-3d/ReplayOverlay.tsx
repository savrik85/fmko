"use client";

import { useEffect, useState } from "react";
import type { ReplayPlan } from "./timeline";
import type { ReplayClock } from "./ReplayActors";

/** Stejné volby jako 2D záznam: Živě, Rychle, Konec. */
const SPEEDS = [{ value: 1, label: "▶ Živě", short: "▶" }, { value: 3, label: "▶▶ Rychle", short: "▶▶" }] as const;

const BANNERS = {
  goal: { text: "GÓÓÓL!", className: "text-5xl sm:text-7xl text-white" },
  penalty: { text: "PENALTA!", className: "text-3xl sm:text-5xl text-white" },
  yellow: { text: "ŽLUTÁ", className: "text-3xl sm:text-5xl text-yellow-300" },
  red: { text: "ČERVENÁ!", className: "text-3xl sm:text-5xl text-red-500" },
  injury: { text: "✚ ZRANĚNÍ", className: "text-3xl sm:text-5xl text-red-400" },
  sub: { text: "⇅ STŘÍDÁNÍ", className: "text-3xl sm:text-5xl text-sky-300" },
};

const BUTTON = "px-2 py-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/15 text-xs font-heading font-bold";

/** Tabule se skóre, titulek komentáře a ovládání přehrávání nad 3D scénou. */
export function ReplayOverlay({ plan, clock, matchId }: { plan: ReplayPlan; clock: ReplayClock; matchId: string }) {
  const go = (path: string) => () => { window.location.href = `/zapas/${matchId}${path}`; };
  // Čas běží ve scéně; lišta si ho jen pár krát za vteřinu přečte.
  const [t, setT] = useState(clock.t);
  const [, rerender] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setT(clock.t), 150);
    return () => clearInterval(id);
  }, [clock]);

  const ended = t >= plan.duration;
  const score = plan.scoreAt(t);
  const caption = plan.captionAt(t);
  const banner = caption?.banner && t - caption.t < 2.6 ? BANNERS[caption.banner] : null;
  const update = (change: Partial<ReplayClock>) => {
    Object.assign(clock, change);
    setT(clock.t);
    rerender((n) => n + 1);
  };

  return (
    <>
      <div className="absolute top-3 inset-x-0 z-30 flex justify-center pointer-events-none px-3">
        <div className="flex items-center gap-2 sm:gap-3 bg-black/80 backdrop-blur-md border border-white/15 rounded-xl px-3 py-1.5 text-white shadow-2xl max-w-full">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: plan.home.kit.shirt }} />
          <span className="font-heading font-bold text-xs sm:text-sm truncate max-w-[28vw]">{plan.home.name}</span>
          <span className="font-heading font-black text-base sm:text-lg tabular-nums">{score.home}:{score.away}</span>
          <span className="font-heading font-bold text-xs sm:text-sm truncate max-w-[28vw]">{plan.away.name}</span>
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: plan.away.kit.shirt }} />
          <span className="font-mono text-xs text-amber-300 tabular-nums pl-1 border-l border-white/20">{plan.minuteAt(t)}&apos;</span>
        </div>
      </div>

      {banner && (
        <div className="absolute inset-x-0 top-[22%] z-30 flex justify-center pointer-events-none">
          <div className={`font-heading font-black tracking-wider drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)] animate-in zoom-in-75 fade-in duration-300 ${banner.className}`}>
            {banner.text}
          </div>
        </div>
      )}

      <div className="absolute bottom-3 sm:bottom-5 inset-x-0 z-30 flex flex-col items-center gap-2 px-3 pointer-events-none">
        {(caption || ended) && (
          <div className="max-w-xl w-full bg-black/80 backdrop-blur-md border border-white/15 rounded-xl px-3 py-2 text-white text-xs sm:text-sm shadow-2xl">
            {ended ? `Konec zápasu · ${plan.home.name} ${score.home}:${score.away} ${plan.away.name}${plan.shootout ? ` (pen. ${plan.shootout.home}:${plan.shootout.away})` : ""}` : caption?.text}
          </div>
        )}
        <div className="flex items-center gap-1 sm:gap-1.5 bg-black/85 backdrop-blur-xl border border-white/20 rounded-2xl px-2 py-1.5 shadow-2xl pointer-events-auto">
          <button onClick={() => update(ended ? { t: 0, playing: true } : { playing: !clock.playing })} className={`${BUTTON} text-sm`}
            title={ended ? "Přehrát znovu" : clock.playing ? "Pozastavit" : "Pokračovat"}>
            {ended ? "↺" : clock.playing ? "⏸" : "▶"}
          </button>
          <div className="flex items-center gap-0.5 bg-white/10 p-0.5 rounded-xl">
            {SPEEDS.map((s) => (
              <button key={s.value} onClick={() => update({ speed: s.value })} className={`px-2 py-1 rounded-lg text-[11px] sm:text-xs font-heading font-bold ${
                clock.speed === s.value ? "bg-pitch-500 text-white" : "text-white/70 hover:text-white hover:bg-white/10"}`}>
                <span className="sm:hidden">{s.short}</span>
                <span className="hidden sm:inline">{s.label}</span>
              </button>
            ))}
          </div>
          <button onClick={() => update({ t: plan.duration })} disabled={ended} className={`${BUTTON} disabled:opacity-40`} title="Přeskočit na konec">
            ▶▶▶<span className="hidden sm:inline"> Konec</span>
          </button>
          <button onClick={go("/zaznam")} className={BUTTON} title="Přepnout na 2D záznam">2D</button>
          <button onClick={go("")} title="Detail zápasu"
            className={ended ? "px-2.5 py-1.5 rounded-lg text-xs font-heading font-bold bg-pitch-500 hover:bg-pitch-600 text-white" : BUTTON}>
            {ended ? "Detail zápasu ➔" : "✕"}
          </button>
        </div>
      </div>
    </>
  );
}
