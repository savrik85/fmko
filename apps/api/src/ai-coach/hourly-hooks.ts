/**
 * Hodinová práce AI trenéra skládaná z více částí (přáteláky, odpovědi na nabídky, trh).
 *
 * Každá část exportuje funkci se stejným podpisem a zapíše se sem. Úloha `hourly`
 * z fronty je projde postupně; chyba jedné části nezastaví ostatní.
 */

import type { Bindings } from "../index";
import { friendliesHourlyHook } from "./friendlies";
import { incidentsHourlyHook } from "./incidents";
import type { AiCoachProfile } from "./profile";
import { transferMarketHourlyHook } from "./transfer-market";
import { transferRepliesHourlyHook } from "./transfer-replies";
import { unrestHourlyHook } from "./unhappy-players";

export type HourlyHook = (env: Bindings, teamId: string, profile: AiCoachProfile, now: Date) => Promise<void>;

export interface HourlyHookEntry {
  name: string;
  run: HourlyHook;
}

// Odpovědi na nabídky před vlastními nákupy: klub nejdřív vyřídí, co mu kdo nabízí.
// Nespokojení hráči až po přestupech: odmítnutá nabídka z téže hodiny se řeší hned.
export const HOURLY_HOOKS: HourlyHookEntry[] = [
  { name: "transfer_replies", run: transferRepliesHourlyHook },
  { name: "transfer_market", run: transferMarketHourlyHook },
  { name: "friendlies", run: friendliesHourlyHook },
  { name: "unrest", run: unrestHourlyHook },
  { name: "incidents", run: incidentsHourlyHook },
];
