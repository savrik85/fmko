"use client";

/**
 * DOČASNÁ náhledová stránka pro vizuální kontrolu trávníku a údržbového vybavení.
 * Není součástí ostré hry — slouží pro pohodlné testování všech úrovní.
 */

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Stadium3D } from "@/components/stadium/stadium-3d/Stadium3D";
import type { WeatherType, TimeOfDay } from "@/components/stadium/stadium-3d/constants";

/** Povrchy výběhové zóny kolem hřiště — hodnoty odpovídají SurroundTrack. */
const SURROUND_LABEL: Record<string, string> = {
  grass: "Tráva",
  cinders: "Antuka",
  paving: "Dlažba",
  astro: "Umělka",
  tartan: "Koberec",
};

function Preview() {
  const q = useSearchParams();
  const [condition, setCondition] = useState(Number(q.get("condition") ?? 75));
  const [weather, setWeather] = useState<WeatherType>((q.get("weather") ?? "sunny") as WeatherType);
  const [heating, setHeating] = useState(Number(q.get("heating") ?? 2));
  const [irrigation, setIrrigation] = useState(Number(q.get("irrigation") ?? 2));
  const [mower, setMower] = useState(Number(q.get("mower") ?? 2));
  const [snowClearing, setSnowClearing] = useState(q.get("snow") === "1");
  const [moisture, setMoisture] = useState(Number(q.get("moisture") ?? 50));
  const [standsLevel, setStandsLevel] = useState(Number(q.get("stands") ?? 2));
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>((q.get("time") ?? "day") as TimeOfDay);
  const [surround, setSurround] = useState(q.get("surround") ?? "grass");

  const facilities = {
    changing_rooms: 2,
    showers: 2,
    refreshments: 2,
    lighting: 2,
    stands: standsLevel,
    parking: 1,
    fence: 1,
    roof: standsLevel > 0 ? 1 : 0,
  };

  return (
    <div className="w-screen h-screen relative bg-slate-900 overflow-hidden font-sans">
      {/* Ovládací panel vlevo nahoře */}
      <div className="absolute top-3 left-3 z-30 bg-slate-950/85 backdrop-blur-md border border-white/20 text-white rounded-xl p-3 shadow-2xl space-y-2.5 max-w-sm text-xs">
        <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
          <span className="font-heading font-extrabold text-sm tracking-wide text-pitch-400">
            🌱 Test Údržby Trávníku
          </span>
          <span className="text-[10px] text-white/50">3D Preview</span>
        </div>

        {/* Sekačka & Lajnování */}
        <div>
          <div className="text-[11px] font-bold text-white/70 mb-1">
            🚜 Sekačka & údržba: Lv{mower} (
            {mower === 0 ? "Koza" : mower === 1 ? "Ruční sekačka" : mower === 2 ? "Traktůrek" : "Profi válec & lajnovačka"}
            )
          </div>
          <div className="grid grid-cols-4 gap-1">
            {[0, 1, 2, 3].map((lv) => (
              <button
                key={lv}
                onClick={() => setMower(lv)}
                className={`py-1 rounded font-bold transition-all ${
                  mower === lv ? "bg-pitch-500 text-white shadow" : "bg-white/10 hover:bg-white/20 text-white/80"
                }`}
              >
                Lv {lv}
              </button>
            ))}
          </div>
        </div>

        {/* Zavlažování */}
        <div>
          <div className="text-[11px] font-bold text-white/70 mb-1">
            💧 Zavlažování: Lv{irrigation} (
            {irrigation === 0 ? "Konev" : irrigation === 1 ? "Hadice" : irrigation === 2 ? "Postřikovače" : "Automatické trysky + meteo"}
            )
          </div>
          <div className="grid grid-cols-4 gap-1">
            {[0, 1, 2, 3].map((lv) => (
              <button
                key={lv}
                onClick={() => setIrrigation(lv)}
                className={`py-1 rounded font-bold transition-all ${
                  irrigation === lv ? "bg-blue-600 text-white shadow" : "bg-white/10 hover:bg-white/20 text-white/80"
                }`}
              >
                Lv {lv}
              </button>
            ))}
          </div>
        </div>

        {/* Vyhřívání */}
        <div>
          <div className="text-[11px] font-bold text-white/70 mb-1">
            🔥 Vyhřívání: Lv{heating} (
            {heating === 0 ? "Bez topení" : heating === 1 ? "Plachta & sláma" : heating === 2 ? "Elektro-rozvaděč" : "Výměníková stanice"}
            )
          </div>
          <div className="grid grid-cols-4 gap-1">
            {[0, 1, 2, 3].map((lv) => (
              <button
                key={lv}
                onClick={() => setHeating(lv)}
                className={`py-1 rounded font-bold transition-all ${
                  heating === lv ? "bg-amber-600 text-white shadow" : "bg-white/10 hover:bg-white/20 text-white/80"
                }`}
              >
                Lv {lv}
              </button>
            ))}
          </div>
        </div>

        {/* Počasí & Úklid sněhu */}
        <div className="flex gap-2">
          <div className="flex-1">
            <div className="text-[11px] font-bold text-white/70 mb-1">Počasí</div>
            <div className="grid grid-cols-3 gap-1">
              {(["sunny", "rain", "snow"] as WeatherType[]).map((w) => (
                <button
                  key={w}
                  onClick={() => setWeather(w)}
                  className={`py-1 rounded text-[10px] font-bold transition-all ${
                    weather === w ? "bg-purple-600 text-white" : "bg-white/10 hover:bg-white/20"
                  }`}
                >
                  {w === "sunny" ? "☀️ Slunce" : w === "rain" ? "🌧️ Déšť" : "❄️ Sníh"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-bold text-white/70 mb-1">Úklid sněhu</div>
            <button
              onClick={() => setSnowClearing(!snowClearing)}
              className={`py-1 px-2.5 rounded font-bold text-[10px] transition-all h-[24px] ${
                snowClearing ? "bg-orange-600 text-white" : "bg-white/10 hover:bg-white/20 text-white/80"
              }`}
            >
              {snowClearing ? "🧹 Objednáno" : "Neobjednáno"}
            </button>
          </div>
        </div>

        {/* Povrch okolí — kontrola prosvítání skrz trávník (z-fighting) */}
        <div>
          <div className="text-[11px] font-bold text-white/70 mb-1">
            Povrch areálu: {SURROUND_LABEL[surround] ?? surround}
          </div>
          <div className="grid grid-cols-5 gap-1">
            {Object.keys(SURROUND_LABEL).map((sf) => (
              <button
                key={sf}
                onClick={() => setSurround(sf)}
                className={`py-1 rounded text-[10px] font-bold transition-all ${
                  surround === sf ? "bg-stone-500 text-white shadow" : "bg-white/10 hover:bg-white/20 text-white/80"
                }`}
              >
                {SURROUND_LABEL[sf]}
              </button>
            ))}
          </div>
        </div>

        {/* Tribuny (kolizní test) */}
        <div>
          <div className="text-[11px] font-bold text-white/70 mb-1">
            🏟️ Tribuny (test uspořádání budov): {standsLevel === 0 ? "Bez tribun (kratší plocha)" : `Tribuny Lv${standsLevel}`}
          </div>
          <div className="grid grid-cols-2 gap-1">
            <button
              onClick={() => setStandsLevel(0)}
              className={`py-1 rounded font-bold ${
                standsLevel === 0 ? "bg-emerald-600 text-white" : "bg-white/10 hover:bg-white/20"
              }`}
            >
              Bez tribun (Lv 0)
            </button>
            <button
              onClick={() => setStandsLevel(2)}
              className={`py-1 rounded font-bold ${
                standsLevel === 2 ? "bg-emerald-600 text-white" : "bg-white/10 hover:bg-white/20"
              }`}
            >
              S tribunami (Lv 2)
            </button>
          </div>
        </div>
      </div>

      {/* 3D Stadion Canvas */}
      <Stadium3D
        pitchCondition={condition}
        pitchType="natural"
        facilities={facilities}
        pitchHeating={heating}
        pitchIrrigation={irrigation}
        mowerLevel={mower}
        snowClearingOrdered={snowClearing}
        pitchMoisture={moisture}
        weather={weather}
        teamColor="#1E3A8A"
        secondaryColor="#FACC15"
        stadiumName="TJ Sokol Trávník"
        customization={{ surroundSurface: surround }}
        initialTimeOfDay={timeOfDay}
      />
    </div>
  );
}

export default function PitchPreviewPage() {
  return (
    <Suspense fallback={<div className="p-8 text-white">Načítám 3D areál…</div>}>
      <Preview />
    </Suspense>
  );
}
