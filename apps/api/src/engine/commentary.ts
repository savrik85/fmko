import { logger } from "../lib/logger";
/**
 * FMK-34: Komentářový systém — šablony z DB ve stylu obecního rozhlasu.
 */

import type { Rng } from '../generators/rng';
import type { MatchEvent, EventType } from '@okresni-masina/shared';

// In-memory cache (per-worker, refreshes on deploy).
// Načítá se JEDNOU všechny řádky (včetně district). Filtr dle okresu je až při
// generování — NE při načtení: cron zpracuje víc okresů v jedné invokaci a
// district-filtrovaná cache by prosákla flavor mezi okresy.
let cachedTemplates: Array<{ event_type: string; template: string; tags: string[]; district: string | null }> | null = null;
let cachedReactions: Array<{ text: string; district: string | null }> | null = null;

async function loadTemplates(db: D1Database) {
  if (cachedTemplates) return;
  const [tRes, rRes] = await Promise.all([
    db.prepare("SELECT event_type, template, tags, district FROM commentary_templates").all().catch((e) => { logger.warn({ module: "commentary" }, "load templates", e); return { results: [] }; }),
    db.prepare("SELECT text, district FROM crowd_reactions").all().catch((e) => { logger.warn({ module: "commentary" }, "load templates", e); return { results: [] }; }),
  ]);
  cachedTemplates = tRes.results.map((r) => ({
    event_type: r.event_type as string,
    template: r.template as string,
    tags: (() => { try { return JSON.parse(r.tags as string); } catch { return []; } })(),
    district: (r.district as string | null) ?? null,
  }));
  cachedReactions = rRes.results.map((r) => ({ text: r.text as string, district: (r.district as string | null) ?? null }));
  if (cachedReactions.length === 0) cachedReactions = [{ text: 'Na tribuně ticho.', district: null }];
}

// Fallback templates if DB is empty or unavailable
const FALLBACK_REACTIONS = [{ text: 'Na tribuně ticho.', district: null }];
const FALLBACK_TEMPLATES = [
  { event_type: 'goal', template: 'GÓÓÓL! {player} skóruje!', tags: [], district: null },
  { event_type: 'chance', template: '{player} střílí — mimo!', tags: [], district: null },
  { event_type: 'foul', template: 'Faul {player}.', tags: [], district: null },
  { event_type: 'card', template: 'Karta pro {player}.', tags: [], district: null },
  { event_type: 'injury', template: '{player} je zraněný.', tags: [], district: null },
  { event_type: 'substitution', template: 'Střídání: {player}.', tags: [], district: null },
  { event_type: 'special', template: '{player} na míči.', tags: ['possession'], district: null },
];

/**
 * Generate a commentary line for a match event.
 */
export function generateCommentary(
  rng: Rng,
  event: MatchEvent,
  homeTeamName: string,
  awayTeamName: string,
  homeScore: number,
  awayScore: number,
  district?: string,
): string {
  const templates = cachedTemplates ?? FALLBACK_TEMPLATES;
  const reactions = cachedReactions ?? FALLBACK_REACTIONS;

  // Okresový filtr: univerzální (district == null) + řádky daného okresu. Neznámý okres → jen univerzální.
  let matching = templates.filter((t) => t.event_type === event.type && (t.district == null || t.district === district));
  if (event.detail && matching.length > 0) {
    const tagSpecific = matching.filter((t) => t.tags.includes(event.detail!));
    if (tagSpecific.length > 0) matching = tagSpecific;
  }
  if (matching.length === 0) return event.description;

  const districtReactions = reactions.filter((r) => r.district == null || r.district === district);
  const template = rng.pick(matching);
  const crowdReaction = rng.pick(districtReactions.length > 0 ? districtReactions : reactions).text;
  const teamName = event.teamId === 1 ? homeTeamName : awayTeamName;

  return template.template
    .replace('{player}', event.playerName)
    .replace('{team}', teamName)
    .replace('{minute}', String(event.minute))
    .replace('{score}', `${homeScore}:${awayScore}`)
    .replace('{crowd_reaction}', crowdReaction);
}

/**
 * Generate full commentary for all events in a match.
 * Must be called after loadCommentaryFromDB().
 */
export function generateMatchCommentary(
  rng: Rng,
  events: MatchEvent[],
  homeTeamName: string,
  awayTeamName: string,
  district?: string,
): string[] {
  let homeScore = 0;
  let awayScore = 0;

  return events.map((event) => {
    if (event.type === 'goal') {
      const scores = event.detail?.split(':').map(Number);
      if (scores && scores.length === 2) {
        homeScore = scores[0];
        awayScore = scores[1];
      }
    }
    return `${event.minute}' — ${generateCommentary(rng, event, homeTeamName, awayTeamName, homeScore, awayScore, district)}`;
  });
}

/**
 * Load commentary templates from DB into cache.
 * Call this once before match simulation.
 */
export async function loadCommentaryFromDB(db: D1Database): Promise<void> {
  await loadTemplates(db);
}
