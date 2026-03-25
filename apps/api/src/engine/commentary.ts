/**
 * FMK-34: Komentářový systém — šablony z DB ve stylu obecního rozhlasu.
 */

import type { Rng } from '../generators/rng';
import type { MatchEvent, EventType } from '@okresni-masina/shared';

// In-memory cache (per-worker, refreshes on deploy)
let cachedTemplates: Array<{ event_type: string; template: string; tags: string[] }> | null = null;
let cachedReactions: string[] | null = null;

async function loadTemplates(db: D1Database) {
  if (cachedTemplates) return;
  const [tRes, rRes] = await Promise.all([
    db.prepare("SELECT event_type, template, tags FROM commentary_templates").all().catch(() => ({ results: [] })),
    db.prepare("SELECT text FROM crowd_reactions").all().catch(() => ({ results: [] })),
  ]);
  cachedTemplates = tRes.results.map((r) => ({
    event_type: r.event_type as string,
    template: r.template as string,
    tags: (() => { try { return JSON.parse(r.tags as string); } catch { return []; } })(),
  }));
  cachedReactions = rRes.results.map((r) => r.text as string);
  if (cachedReactions.length === 0) cachedReactions = ['Na tribuně ticho.'];
}

// Fallback templates if DB is empty or unavailable
const FALLBACK_REACTIONS = ['Na tribuně ticho.'];
const FALLBACK_TEMPLATES = [
  { event_type: 'goal', template: 'GÓÓÓL! {player} skóruje!', tags: [] },
  { event_type: 'chance', template: '{player} střílí — mimo!', tags: [] },
  { event_type: 'foul', template: 'Faul {player}.', tags: [] },
  { event_type: 'card', template: 'Karta pro {player}.', tags: [] },
  { event_type: 'injury', template: '{player} je zraněný.', tags: [] },
  { event_type: 'substitution', template: 'Střídání: {player}.', tags: [] },
  { event_type: 'special', template: '{player} na míči.', tags: ['possession'] },
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
): string {
  const templates = cachedTemplates ?? FALLBACK_TEMPLATES;
  const reactions = cachedReactions ?? FALLBACK_REACTIONS;

  let matching = templates.filter((t) => t.event_type === event.type);
  if (event.detail && matching.length > 0) {
    const tagSpecific = matching.filter((t) => t.tags.includes(event.detail!));
    if (tagSpecific.length > 0) matching = tagSpecific;
  }
  if (matching.length === 0) return event.description;

  const template = rng.pick(matching);
  const crowdReaction = rng.pick(reactions);
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
    return `${event.minute}' — ${generateCommentary(rng, event, homeTeamName, awayTeamName, homeScore, awayScore)}`;
  });
}

/**
 * Load commentary templates from DB into cache.
 * Call this once before match simulation.
 */
export async function loadCommentaryFromDB(db: D1Database): Promise<void> {
  await loadTemplates(db);
}
