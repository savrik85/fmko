/**
 * Kalibrace šíření (plán Task 12, Kabina má uši): skutečné SMS trenérů a skutečné kádry a vazby
 * z produ, hodinový `spreadStep` po dobu dat + 7 dní. Kolik zpráv „slyšel jsem…“ by aktivní
 * klub dostal za týden a jestli pochvaly došly k dotčeným stejně často jako kritiky.
 *
 * Model se nevolá (stovky volání): z kandidátů síta se stane věc s pravděpodobností
 * POSITIVE_RATE (Workers AI na 10 větách z produ: 3 z 10), druh podle KIND_MIX.
 *
 * Vstupy (JSON z `wrangler d1 execute --json`, viz skript níže v komentáři):
 *   coach_msgs.json  — SELECT c.team_id, c.participant_id, m.body, m.sent_at (1:1, sender_type = 'user')
 *   sim_players.json — SELECT p.id, p.team_id, p.personality (+ jména z players.json)
 *   players.json     — SELECT p.id, p.team_id, p.first_name, p.last_name, p.nickname
 *   sim_ties.json    — SELECT a, b, type, strength FROM relationships
 *
 * Běh:
 *   npx esbuild scripts/hearsay-sim.ts --bundle --platform=node --format=esm --outfile=/tmp/hearsay-sim.mjs "--external:cloudflare:*" \
 *     --alias:@okresni-masina/shared=../../packages/shared/src/index.ts
 *   node /tmp/hearsay-sim.mjs <adresář s JSON> 2026-11-07
 */
import { readFileSync } from "node:fs";
import { createRng } from "../src/generators/rng";
import { seedFromString } from "../src/lib/seed";
import { mentionCandidates } from "../src/hearsay/detect";
import { learningEffect } from "../src/hearsay/effects";
import { HOURLY_BASE, spreadStep, type SpreadPlayer, type SpreadTie } from "../src/hearsay/spread";
import type { HearsayItem, HearsayKind, HearsayKnowledge } from "../src/hearsay/types";

const POSITIVE_RATE = 0.3;
const KIND_MIX: Array<[HearsayKind, number]> = [["criticism", 0.4], ["praise", 0.3], ["decision_against", 0.2], ["decision_for", 0.1]];
const CAP_PER_DAY = 2;

const dir = process.argv[2];
const since = process.argv[3] ?? "2026-11-07";
const load = <T>(f: string): T[] => (JSON.parse(readFileSync(`${dir}/${f}`, "utf8")) as Array<{ results: T[] }>)[0].results;

const msgs = load<{ team_id: string; participant_id: string; body: string; sent_at: string }>("coach_msgs.json").filter((m) => m.sent_at >= since);
const names = new Map(load<{ id: string; team_id: string; first_name: string; last_name: string; nickname: string | null }>("players.json").map((p) => [p.id, p]));
const personalities = load<{ id: string; team_id: string; personality: string | null }>("sim_players.json");
const ties = load<SpreadTie>("sim_ties.json");

const byTeam = new Map<string, SpreadPlayer[]>();
for (const p of personalities) {
  let x: Record<string, number> = {};
  try { x = p.personality ? JSON.parse(p.personality) : {}; } catch (e) { console.error("povaha", e); }
  byTeam.set(p.team_id, [...(byTeam.get(p.team_id) ?? []), { id: p.id, temper: x.temper ?? 40, discipline: x.discipline ?? 50, leadership: x.leadership ?? 30 }]);
}

function pragueHour(d: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Prague", hour: "2-digit", hour12: false }).format(d)) % 24;
}

const start = Date.parse(`${since}T00:00:00Z`);
const lastMsg = Math.max(...msgs.map((m) => Date.parse(m.sent_at)));
const end = lastMsg + 7 * 86_400_000;
const weeks = (end - start) / (7 * 86_400_000);

const written: Record<string, number> = {};
const reached: Record<string, number> = {};
const perClub: Array<{ team: string; items: number; learned: number; messages: number }> = [];

for (const [teamId, squad] of byTeam) {
  const club = squad.map((p) => ({ id: p.id, firstName: names.get(p.id)?.first_name ?? "", lastName: names.get(p.id)?.last_name ?? "", nickname: names.get(p.id)?.nickname ?? null }));
  const items: HearsayItem[] = [];
  let knowledge: HearsayKnowledge[] = [];
  for (const m of msgs.filter((x) => x.team_id === teamId)) {
    for (const c of mentionCandidates(club, m.body, [m.participant_id])) {
      const rng = createRng(seedFromString(`${m.sent_at}:${c.id}`));
      if (rng.random() >= POSITIVE_RATE) continue;
      let r = rng.random(); let kind: HearsayKind = "criticism";
      for (const [k, w] of KIND_MIX) { if ((r -= w) < 0) { kind = k; break; } }
      const id = `${m.sent_at}:${c.id}`;
      items.push({ id, clubTeamId: teamId, subjectPlayerId: c.id, kind, origin: "coach_sms", recipientPlayerId: m.participant_id, conversationId: null, quote: "", createdAt: new Date(m.sent_at).toISOString(), expiresAt: new Date(Date.parse(m.sent_at) + 21 * 86_400_000).toISOString() });
      knowledge.push({ hearsayId: id, playerId: m.participant_id, via: "direct", fromPlayerId: null, learnedAt: m.sent_at, messageState: "none", messagedAt: null });
      written[kind] = (written[kind] ?? 0) + 1;
    }
  }
  const ids = new Set(squad.map((p) => p.id));
  const teamTies = ties.filter((t) => ids.has(t.a) && ids.has(t.b));
  let learned = 0;
  const pendingAt: number[] = [];
  for (let t = start; t <= end; t += 3_600_000) {
    const h = pragueHour(new Date(t));
    if (h < 7 || h >= 22) continue;
    const live = items.filter((i) => Date.parse(i.createdAt) <= t);
    if (live.length === 0) continue;
    const fresh = spreadStep({ items: live, knowledge, players: squad, ties: teamTies, pubPairs: new Set(), hourKey: new Date(t).toISOString().slice(0, 13) });
    knowledge = [...knowledge, ...fresh];
    for (const k of fresh) {
      const item = live.find((i) => i.id === k.hearsayId)!;
      if (k.playerId !== item.subjectPlayerId) continue;
      learned++;
      reached[item.kind] = (reached[item.kind] ?? 0) + 1;
      const roll = createRng(seedFromString(`${item.id}:${k.playerId}`)).random();
      if (learningEffect(item.kind, k.via, { coachTalkedFirst: false, seededRoll: roll }).message) pendingAt.push(t);
    }
  }
  // Doručení se stropem 2 za 24 h (zpráva čeká nejvýš 48 h).
  const sent: number[] = [];
  for (const p of pendingAt.sort((a, b) => a - b)) {
    for (let t = p; t < p + 48 * 3_600_000; t += 3_600_000) {
      if (sent.filter((s) => s > t - 86_400_000).length < CAP_PER_DAY) { sent.push(t); break; }
    }
  }
  if (items.length > 0) perClub.push({ team: teamId.slice(0, 8), items: items.length, learned, messages: sent.length });
}

const active = perClub.length;
const sum = (k: "items" | "learned" | "messages") => perClub.reduce((s, c) => s + c[k], 0);
console.log(`HOURLY_BASE ${HOURLY_BASE}, období ${weeks.toFixed(1)} týdne, klubů s věcí ${active}`);
console.log(`věcí ${sum("items")}, dotčený se dozvěděl ${sum("learned")}, zpráv „slyšel jsem“ ${sum("messages")}`);
console.log(`na klub a týden: věcí ${(sum("items") / active / weeks).toFixed(2)}, zpráv ${(sum("messages") / active / weeks).toFixed(2)}`);
console.log("napsáno:", JSON.stringify(written), "došlo k dotčenému:", JSON.stringify(reached));
for (const k of ["praise", "criticism"]) console.log(`  ${k}: došlo ${(((reached[k] ?? 0) / (written[k] ?? 1)) * 100).toFixed(0)} %`);
console.log("nejvíc zpráv:", perClub.sort((a, b) => b.messages - a.messages).slice(0, 5).map((c) => `${c.team} ${c.messages}`).join(", "));
