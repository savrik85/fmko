/**
 * Hlavní sponzor AI klubu.
 *
 * Lidský manažer otevře jednání s místní firmou, majitel udělá úvodní nabídku a manažer ji
 * podepíše, nebo smlouvá. AI trenér jde stejnou cestou (`openNegotiation` + `signNegotiation`):
 * když klub hlavního sponzora nemá, osloví firmy z vlastního okresu a podepíše úvodní nabídku
 * prvního majitele, se kterým se dá jednat. Pořadí firem řídí povaha: ambiciózní trenér jde
 * za firmou s největším rozpočtem, ostatní spíš za firmou, která klub má nejradši.
 * Bez SMS a hospody, jen jednání a podpis, stejná pravidla (okres, exkluzivita, cooldown).
 */

import { logger } from "../lib/logger";
import { getFavorsForTeam } from "../sponsors/favor";
import {
  activeSeason, categoryContracts, closeNegotiation, loadNegotiationSponsor, loadNegotiationTeam,
  negotiationAvailability, openNegotiation,
} from "../sponsors/negotiation-db";
import { signNegotiation } from "../sponsors/signing";
import type { AiCoachProfile } from "./profile";

const M = "ai-coach-main-sponsor";
/** Kolik firem za jednu pondělní správu nejvýš osloví. */
const MAX_ATTEMPTS = 3;
const DEFAULT_FAVOR = 50;

export interface MainSponsorResult {
  signed: boolean;
  detail: string;
}

export interface SponsorCandidate {
  id: number;
  name: string;
  monthlyMax: number;
  favor: number;
}

/** Pořadí firem k oslovení podle povahy trenéra (čistá funkce, testovaná zvlášť). */
export function rankSponsorCandidates(candidates: SponsorCandidate[], profile: AiCoachProfile): SponsorCandidate[] {
  const moneyWeight = profile.ambition / 100;
  const maxMonthly = Math.max(1, ...candidates.map((c) => c.monthlyMax));
  const score = (c: SponsorCandidate) =>
    moneyWeight * (c.monthlyMax / maxMonthly) + (1 - moneyWeight) * (c.favor / 100);
  return [...candidates].sort((a, b) => score(b) - score(a) || a.id - b.id);
}

export async function maybeSignMainSponsor(db: D1Database, teamId: string, profile: AiCoachProfile): Promise<MainSponsorResult> {
  const team = await loadNegotiationTeam(db, teamId);
  if (!team) return { signed: false, detail: "tým nenalezen" };
  const contracts = await categoryContracts(db, teamId, "main");
  if (contracts.active) return { signed: false, detail: `hlavní sponzor už je: ${contracts.active.sponsor_name}` };

  const rows = await db.prepare("SELECT id, name, monthly_max FROM district_sponsors WHERE district = ?")
    .bind(team.district).all<{ id: number; name: string; monthly_max: number }>()
    .catch((e) => {
      logger.warn({ module: M, teamId }, "firmy okresu", e);
      return { results: [] as Array<{ id: number; name: string; monthly_max: number }> };
    });
  if (rows.results.length === 0) return { signed: false, detail: "v okrese nejsou firmy" };
  const favors = await getFavorsForTeam(db, teamId);
  const ranked = rankSponsorCandidates(rows.results.map((r) => ({
    id: r.id, name: r.name, monthlyMax: r.monthly_max, favor: favors.get(r.id) ?? DEFAULT_FAVOR,
  })), profile);

  const season = await activeSeason(db);
  const tried: string[] = [];
  for (const candidate of ranked) {
    if (tried.length >= MAX_ATTEMPTS) break;
    const sponsor = await loadNegotiationSponsor(db, candidate.id);
    if (!sponsor) continue;
    const availability = await negotiationAvailability(db, team, sponsor, "main", season);
    if (!availability.canOpen) continue;
    tried.push(candidate.name);

    const opened = await openNegotiation(db, teamId, candidate.id, "main");
    if (!opened.ok) continue;
    const signed = await signNegotiation(db, teamId, opened.id);
    if (signed.ok) {
      logger.info({ module: M, teamId }, `hlavní sponzor ${candidate.name} podepsán (smlouva ${signed.contractId})`);
      return { signed: true, detail: signed.newTeamName ? `${candidate.name}, nový název ${signed.newTeamName}` : candidate.name };
    }
    // Úvodní nabídka nejde podepsat (např. sliby, které klub nesplní): jednání se zavře,
    // ať nevisí, a zkusí se další firma.
    await closeNegotiation(db, teamId, opened.id);
    logger.info({ module: M, teamId }, `úvodní nabídka ${candidate.name} nejde podepsat: ${signed.error}`);
  }
  return { signed: false, detail: tried.length ? `bez dohody (${tried.join(", ")})` : "žádná firma teď nejedná" };
}
