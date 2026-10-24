/**
 * Hodinová práce AI trenéra skládaná z více částí (přáteláky, odpovědi na nabídky, trh).
 *
 * Každá část exportuje funkci se stejným podpisem a zapíše se sem. Úloha `hourly`
 * z fronty je projde postupně; chyba jedné části nezastaví ostatní.
 */

import type { Bindings } from "../index";
import type { AiCoachProfile } from "./profile";

export type HourlyHook = (env: Bindings, teamId: string, profile: AiCoachProfile, now: Date) => Promise<void>;

export interface HourlyHookEntry {
  name: string;
  run: HourlyHook;
}

export const HOURLY_HOOKS: HourlyHookEntry[] = [];
