"use client";

/**
 * DOČASNÁ náhledová stránka pro vizuální kontrolu trávníku.
 * Není součástí hry — po odsouhlasení vzhledu se smaže.
 *
 * /pitch-preview?condition=15&weather=rain&heating=0
 */

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Stadium3D } from "@/components/stadium/stadium-3d/Stadium3D";

const FACILITIES = {
  changing_rooms: 2, showers: 2, refreshments: 2, lighting: 2,
  stands: 2, parking: 1, fence: 1, roof: 1,
};

function Preview() {
  const q = useSearchParams();
  const condition = Number(q.get("condition") ?? 15);
  const weather = (q.get("weather") ?? "rain") as never;
  const heating = Number(q.get("heating") ?? 0);
  const irrigation = Number(q.get("irrigation") ?? 0);
  const moisture = Number(q.get("moisture") ?? 50);
  const pitchType = q.get("pitchType") ?? "natural";
  const timeOfDay = (q.get("time") ?? "day") as never;

  return (
    <div className="w-screen h-screen">
      <div className="absolute top-2 left-2 z-10 bg-white/90 rounded px-3 py-1.5 text-sm font-bold">
        stav {condition} · {weather} · vyhřívání Lv{heating} · zavlažování Lv{irrigation} · vlhkost {moisture} · {pitchType}
      </div>
      <Stadium3D
        pitchCondition={condition}
        pitchType={pitchType}
        facilities={FACILITIES}
        pitchHeating={heating}
        pitchIrrigation={irrigation}
        pitchMoisture={moisture}
        weather={weather}
        teamColor="#2E7D32"
        secondaryColor="#FFFFFF"
        stadiumName="Náhled"
        initialTimeOfDay={timeOfDay}
      />
    </div>
  );
}

export default function PitchPreviewPage() {
  return (
    <Suspense fallback={<div className="p-8">Načítám…</div>}>
      <Preview />
    </Suspense>
  );
}
