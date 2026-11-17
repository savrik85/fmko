/**
 * Technické podrobnosti k hlášení chyby, aby se autor nemusel doptávat:
 * zařízení, okno, posledních pár chyb z konzole a navštívených stránek,
 * odkaz na nahrávku v PostHogu.
 *
 * Sběr chyb a stránek běží od prvního importu (nápověda v horní liště je na každé
 * stránce hry). Drží jen pár posledních záznamů v paměti, nic neodesílá.
 */

import { initPostHog } from "@/lib/analytics";

const MAX_ERRORS = 15;
const MAX_PAGES = 8;
const MAX_ERROR_LENGTH = 400;

interface LoggedError {
  at: string;
  message: string;
}

const errors: LoggedError[] = [];
const pages: string[] = [];
let installed = false;

function remember(message: string) {
  errors.push({ at: new Date().toISOString(), message: message.slice(0, MAX_ERROR_LENGTH) });
  if (errors.length > MAX_ERRORS) errors.shift();
}

function describe(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value !== "object" || value === null) return String(value);
  // Bez try/catch: kruhové odkazy a BigInt, na kterých JSON.stringify padá, ošetří náhrada.
  const seen = new WeakSet<object>();
  return JSON.stringify(value, (_key, v: unknown) => {
    if (typeof v === "bigint") return v.toString();
    if (typeof v === "object" && v !== null) {
      if (seen.has(v)) return "[kruhový odkaz]";
      seen.add(v);
    }
    return v;
  }) ?? String(value);
}

/** Zapne sběr chyb (jednou za běh aplikace). */
export function installDiagnostics(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (e) => remember(`error: ${e.message} (${e.filename}:${e.lineno})`));
  window.addEventListener("unhandledrejection", (e) => remember(`unhandledrejection: ${describe(e.reason)}`));
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    remember(`console.error: ${args.map(describe).join(" ")}`);
    original(...args);
  };
}

/** Zapíše navštívenou stránku (volá se při změně adresy). */
export function recordPageVisit(path: string): void {
  if (pages[pages.length - 1] === path) return;
  pages.push(path);
  if (pages.length > MAX_PAGES) pages.shift();
}

function replayUrl(): string | null {
  const client = initPostHog();
  if (!client) return null;
  try {
    return client.get_session_replay_url({ withTimestamp: true, timestampLookBack: 30 }) || null;
  } catch (e) {
    console.warn("Odkaz na nahrávku PostHog:", e);
    return null;
  }
}

export interface Diagnostics {
  userAgent: string;
  screen: { width: number; height: number; pixelRatio: number };
  installedApp: boolean;
  online: boolean;
  time: string;
  pages: string[];
  errors: LoggedError[];
  replayUrl: string | null;
  extra?: Record<string, unknown>;
}

export function collectDiagnostics(extra?: Record<string, unknown>): Diagnostics {
  return {
    userAgent: navigator.userAgent,
    screen: { width: window.innerWidth, height: window.innerHeight, pixelRatio: window.devicePixelRatio || 1 },
    installedApp: window.matchMedia?.("(display-mode: standalone)").matches ?? false,
    online: navigator.onLine,
    time: new Date().toISOString(),
    pages: [...pages],
    errors: [...errors],
    replayUrl: replayUrl(),
    ...(extra ? { extra } : {}),
  };
}
