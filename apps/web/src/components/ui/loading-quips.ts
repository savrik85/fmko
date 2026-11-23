// Načítání se skákajícím míčem: kdy se co ukáže a jaké hlášky běží pod míčem.
// Čistá logika bez Reactu, ať jde otestovat ve vitestu bez prohlížeče.

/** Do 300 ms nic: rychlé načtení nemá problikávat. */
export const BALL_DELAY_MS = 300;
/** Od 1,5 s je jasné, že to trvá, a pod míčem naskočí hláška. */
export const QUIP_DELAY_MS = 1500;
/** Jak dlouho jedna hláška vydrží, než přijde další. */
export const QUIP_INTERVAL_MS = 2600;

/** Hlášky ze skutečných chvil na okresním hřišti před zápasem. Max. 34 znaků, ať se na mobilu vejdou na řádek. */
export const LOADING_QUIPS: readonly string[] = [
  "Správce ještě lajnuje hřiště…",
  "Hledám klíče od kabiny…",
  "Pumpuju míče…",
  "Dresy ještě schnou na šňůře…",
  "Rozhodčí ještě parkuje…",
  "Vytahuju branky z kůlny…",
  "Natahuju sítě na branky…",
  "Zapichuju rohové praporky…",
  "Na stánku se rozpaluje gril…",
  "Paní u okýnka vydává párky…",
  "Kluci se ještě převlíkají…",
  "Ještě se seče trávník…",
  "Pokladník přepočítává drobné…",
  "Rozhodčí hledá píšťalku…",
];

export type LoadingPhase = "hidden" | "ball" | "quip";

export function loadingPhase(elapsedMs: number): LoadingPhase {
  if (elapsedMs < BALL_DELAY_MS) return "hidden";
  if (elapsedMs < QUIP_DELAY_MS) return "ball";
  return "quip";
}

/** Hláška pro daný čas: začíná na `startIndex` a každých 2,6 s posune o jednu, dokola. */
export function quipAt(startIndex: number, elapsedMs: number): string {
  const shown = Math.max(0, Math.floor((elapsedMs - QUIP_DELAY_MS) / QUIP_INTERVAL_MS));
  return LOADING_QUIPS[(startIndex + shown) % LOADING_QUIPS.length];
}
