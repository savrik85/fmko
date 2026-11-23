/**
 * Předvolby zobrazení účtu (API /api/me/ui-prefs), zatím jen výchozí pohled záznamu zápasu.
 * Zdrojem pravdy je API, takže volba z Nastavení platí na mobilu i na počítači. Prohlížeč si drží
 * poslední známou hodnotu, ať se záznam může rozběhnout hned a nečeká na odpověď.
 */
import { apiFetch } from "@/lib/api";

/** Plánek (2D tracker), nebo Video (3D). */
export type ReplayView = "2d" | "3d";

export const DEFAULT_REPLAY_VIEW: ReplayView = "2d";

const REPLAY_VIEW_CACHE_KEY = "replayView";

interface UiPrefs {
  replayView: ReplayView;
}

function isReplayView(value: unknown): value is ReplayView {
  return value === "2d" || value === "3d";
}

/** Poslední známá předvolba v tomhle prohlížeči; null, když tu ještě není nebo úložiště nejde číst. */
export function cachedReplayView(): ReplayView | null {
  try {
    const value = localStorage.getItem(REPLAY_VIEW_CACHE_KEY);
    return isReplayView(value) ? value : null;
  } catch (e) {
    console.warn("Předvolbu záznamu zápasu se nepodařilo přečíst z prohlížeče:", e);
    return null;
  }
}

function cacheReplayView(view: ReplayView): void {
  try {
    localStorage.setItem(REPLAY_VIEW_CACHE_KEY, view);
  } catch (e) {
    console.warn("Předvolbu záznamu zápasu se nepodařilo uložit do prohlížeče:", e);
  }
}

/** Předvolba účtu z API; zapíše se i do prohlížeče pro příští rychlý start. Chyba API se vyhodí. */
export async function fetchReplayView(): Promise<ReplayView> {
  const prefs = await apiFetch<UiPrefs>("/api/me/ui-prefs");
  const view = isReplayView(prefs.replayView) ? prefs.replayView : DEFAULT_REPLAY_VIEW;
  cacheReplayView(view);
  return view;
}

/** Uloží předvolbu účtu. Chyba se vyhodí s hláškou z API, prohlížeč si pak drží původní hodnotu. */
export async function saveReplayView(view: ReplayView): Promise<ReplayView> {
  const prefs = await apiFetch<UiPrefs>("/api/me/ui-prefs", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ replayView: view }),
  });
  const saved = isReplayView(prefs.replayView) ? prefs.replayView : view;
  cacheReplayView(saved);
  return saved;
}
