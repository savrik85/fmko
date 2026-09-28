"use client";

import { AccumulativeShadows, RandomizedLight } from "@react-three/drei";
import type { TimeOfDay, WeatherType } from "./constants";

/**
 * Stíny pro mobil, spočítané jednou a pak jen zobrazené.
 *
 * Na mobilu jsou stínové mapy v reálném čase vypnuté (výkon), takže stadion vypadal
 * placatě: tribuny, budovy ani stromy nevrhaly stín. Areál se ale nehýbe, a tak stačí
 * stíny nasčítat jednou do průhledné vrstvy na zemi. Znovu se počítají jen při změně
 * denní doby nebo počasí (jiné slunce, jiná měkkost).
 *
 * Směr světla odpovídá slunci z LightingAndAtmosphere; v noci se stíny nekreslí,
 * areál tam osvětlují reflektory.
 */
export function BakedShadows({ timeOfDay, weather }: { timeOfDay: TimeOfDay; weather: WeatherType }) {
  if (timeOfDay === "night") return null;

  const overcast = weather === "rain" || weather === "cloudy" || weather === "snow";
  const sun: [number, number, number] = timeOfDay === "sunset" ? [50, 14, -35] : [30, 50, 20];

  return (
    <AccumulativeShadows
      key={`${timeOfDay}-${weather}`}
      frames={30}
      temporal={false}
      scale={150}
      resolution={1024}
      position={[0, 0.07, 0]}
      color="#10200e"
      opacity={overcast ? 0.45 : 0.75}
      alphaTest={0.7}
    >
      <RandomizedLight
        amount={6}
        radius={overcast ? 18 : 5}
        intensity={1}
        ambient={overcast ? 0.6 : 0.3}
        position={sun}
        size={140}
        mapSize={1024}
        bias={0.001}
        near={1}
        far={220}
      />
    </AccumulativeShadows>
  );
}
