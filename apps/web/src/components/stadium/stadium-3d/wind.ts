import { createContext, useContext } from "react";
import type { WeatherType } from "./constants";

/**
 * Síla větru 0–1 podle počasí. Řídí vlání vlajek a transparentů, kývání stromů
 * a poletující listí. Vítr fouká vždy ve směru +X, aby vlajky i listí držely jeden směr.
 */
export function windStrength(weather: WeatherType): number {
  switch (weather) {
    case "wind":
      return 1;
    case "rain":
      return 0.55;
    case "cloudy":
      return 0.35;
    case "snow":
      return 0.3;
    default:
      return 0.2;
  }
}

export const WindContext = createContext(0.2);

export function useWind(): number {
  return useContext(WindContext);
}
