/**
 * Prodej AI klubu na trhu (spec 3.7): inzeráty na přebytečné hráče a nabídky hráčů k poptávkám.
 *
 * Model navrhuje, kód hlídá (market-decision.ts):
 * - Inzerát: kód pustí jen přebytečné hráče áčka, které jde prodat (žádná pojistka kádru, ne
 *   hostující, ne dvakrát za 30 dní neprodaní) a nejvýš tolik, kolik dovolí limit rozjetých
 *   obchodů. Model vybere koho a za kolik: od rezervace (nikdy pod 60 % tržní hodnoty) do
 *   jedenapůlnásobku rezervace.
 * - Nabídka k poptávce: kód najde poptávky, na které přebytečný hráč sedí (post, věk, u klubu
 *   ve hře i hodnocení), model vybere jednu dvojici, nebo nic.
 *
 * Bez modelu (výpadek, režim off, neplatná odpověď) platí dosavadní pravidla: vystavuje hlavně
 * přeplněný kádr, obchodník a kurz „prodávat“, za `openingAsk`, mladé si mládežník nechá;
 * k poptávce nabídne obchodník prvního hráče, který sedí. Všechno přes stejné služby jako člověk.
 */

import { marketValue } from "@okresni-masina/shared";
import { createRng } from "../generators/rng";
import type { Bindings } from "../index";
import { logger } from "../lib/logger";
import { listPlayerOnMarket } from "../services/transfer-actions";
import { decideByModel, recordDecision, type MarketTrace, type ModelUse } from "./buy-model";
import type { DecisionMode } from "./decision-log";
import {
  listingPriceBounds, listingSchema, MARKET_SYSTEM_PROMPT, marketClubLine, pitchSchema, renderListingPrompt, renderPitchPrompt,
  validateListing, validatePitch,
  type ListingContext, type ListingDecision, type PitchContext, type PitchDecision, type PitchOption,
} from "./market-decision";
import { TARGET_SENIOR_SQUAD, type SquadMember } from "./squad";
import { pragueDay, type AiClubState } from "./transfer-club";
import type { MarketAction, WeeklyTransferPlan } from "./transfer-market";
import { hashString, openDealLimit, openingAsk, reservationPrice } from "./valuation";

const M = "ai-market-selling";

/** Hráče, jehož inzerát tolikrát propadl bez prodeje za posledních `UNSOLD_WINDOW_DAYS`, AI znovu nevystaví. */
const MAX_UNSOLD_LISTINGS = 2;
const UNSOLD_WINDOW_DAYS = 30;
/** Kolik přebytečných hráčů model nejvýš uvidí (k nim vždy ti, které by vystavilo pravidlo). */
const MAX_LISTING_OPTIONS = 8;
/** Kolik dvojic poptávka a hráč model nejvýš uvidí, z jedné poptávky nejvýš dva hráče. */
const MAX_PITCH_OPTIONS = 6;
const MAX_PITCH_PLAYERS_PER_DEMAND = 2;

/**
 * Inzeráty na přebytečné hráče, dokud je volné místo pro rozjeté obchody. Koho a za kolik
 * rozhodne model, bez něj pravidlo (přeplněný kádr, obchodník, kurz „prodávat“).
 */
export async function listSurplus(
  env: Bindings, club: AiClubState, now: Date, mode: DecisionMode, actions: MarketAction[], plan: WeeklyTransferPlan | null,
  trace: MarketTrace, use: ModelUse,
): Promise<void> {
  const db = env.DB;
  const active = await db.prepare(
    "SELECT player_id FROM transfer_listings WHERE team_id = ? AND status = 'active'",
  ).bind(club.teamId).all<{ player_id: string }>()
    .catch((e) => { logger.warn({ module: M }, `inzeráty klubu ${club.teamId}`, e); return { results: [] as { player_id: string }[] }; });
  const listed = new Set(active.results.map((r) => r.player_id));
  const slots = openDealLimit(club.profile) - listed.size;
  if (slots <= 0) return;
  // Koho trenér v pondělí vybral, ten jde na listinu první (i při kurzu „držet“, když se vystavuje).
  const chosen = new Set(plan?.sellIds ?? []);

  // Koho nikdo nechce, toho člověk taky nenabízí donekonečna. Podle konce platnosti, ne vzniku
  // inzerátu: `created_at` píše databáze, konec platnosti stejné hodiny jako `now`.
  const unsold = await db.prepare(
    `SELECT player_id FROM transfer_listings WHERE team_id = ? AND status = 'expired' AND expires_at >= ?
      GROUP BY player_id HAVING COUNT(*) >= ?`,
  ).bind(club.teamId, new Date(now.getTime() - UNSOLD_WINDOW_DAYS * 86_400_000).toISOString(), MAX_UNSOLD_LISTINGS)
    .all<{ player_id: string }>()
    .catch((e) => { logger.warn({ module: M }, `neprodané inzeráty klubu ${club.teamId}`, e); return { results: [] as { player_id: string }[] }; });
  const unsoldIds = new Set(unsold.results.map((r) => r.player_id));

  const candidates = club.members
    .filter((m) => !m.isU21Roster && !m.loanedIn && !listed.has(m.id) && !unsoldIds.has(m.id) && club.analysis.importanceOf(m.id) === "surplus")
    .filter((m) => club.analysis.sellBlock(m.id) === null)
    // Nejdřív hráči, které trenér v pondělí vybral, pak starší a slabší.
    .sort((a, b) => (Number(chosen.has(b.id)) - Number(chosen.has(a.id))) || (b.age - a.age) || (a.rating - b.rating));
  if (candidates.length === 0) return;

  const valueOf = (m: SquadMember) => marketValue(m.rating, m.age, m.position);
  // Pravidlo: trh pročišťuje hlavně přeplněný kádr; obchodník a kurz „prodávat“ prodávají přebytek
  // i jinak. Mladé si mládežník nechá. Cena je první požadavek (`openingAsk`).
  const crowded = club.analysis.seniorOwnCount > TARGET_SENIOR_SQUAD;
  const rulePicks: Array<{ id: string; price: number }> = [];
  if (crowded || club.profile.trading >= 50 || plan?.stance === "sell") {
    for (const m of candidates) {
      if (rulePicks.length >= slots) break;
      if (m.age <= 21 && club.profile.youthFocus >= 50) continue;
      rulePicks.push({ id: m.id, price: openingAsk({ marketValue: valueOf(m), age: m.age, importance: "surplus", profile: club.profile, playerId: m.id, now }) });
    }
  }

  // Model vidí přebytek v pořadí pravidla a vždy i hráče, které by vystavilo pravidlo.
  const shown = candidates.filter((m, i) => i < MAX_LISTING_OPTIONS || rulePicks.some((p) => p.id === m.id));
  const options = shown.map((m, i) => ({
    key: `s${i + 1}`, member: m,
    option: {
      key: `s${i + 1}`, position: m.position, age: m.age, rating: m.rating, marketValue: valueOf(m), chosen: chosen.has(m.id),
      ...listingPriceBounds(reservationPrice({ marketValue: valueOf(m), age: m.age, importance: "surplus", profile: club.profile, playerId: m.id, now })),
    },
  }));
  const ctx: ListingContext = {
    ...marketClubLine(club, plan, TARGET_SENIOR_SQUAD), slots, options: options.map((o) => o.option),
  };
  const rule = (): ListingDecision => ({
    picks: rulePicks.map((p) => ({ key: options.find((o) => o.member.id === p.id)?.key ?? "", price: p.price })),
    reason: "rules",
  });
  const decided = await decideByModel({
    name: "transfer_listing", system: MARKET_SYSTEM_PROMPT, maxTokens: 400,
    prompt: () => renderListingPrompt(ctx), schema: () => listingSchema(ctx), validate: (raw) => validateListing(raw, ctx), rule,
  }, use);
  recordDecision(trace, "inzeráty", decided.by, decided.trace);

  const meta = { decidedBy: decided.by, reason: decided.decision.reason };
  if (decided.decision.picks.length === 0) {
    // Pravidlo nevystaví nikoho, když nemá proč; zápis „nikoho“ má smysl jen u modelu.
    if (decided.by === "model") actions.push({ kind: "no_list", ...meta, result: "none" });
    return;
  }
  for (const pick of decided.decision.picks) {
    const member = options.find((o) => o.key === pick.key)?.member;
    if (!member) continue;
    if (mode === "shadow") {
      actions.push({ kind: "list", playerId: member.id, amount: pick.price, position: member.position, ...meta, result: "shadow" });
      continue;
    }
    const res = await listPlayerOnMarket(env, club.teamId, member.id, pick.price);
    actions.push({
      kind: "list", playerId: member.id, amount: pick.price, position: member.position, ...meta,
      result: res.ok ? "listed" : "failed", error: res.ok ? undefined : res.error,
    });
  }
}

interface DemandRow {
  id: string;
  position: string;
  age_min: number;
  age_max: number;
  min_rating: number | null;
  max_price: number | null;
  team_id: string | null;
  owner_user_id: string | null;
}

/**
 * Přebytečného hráče nabídne k poptávce (klubu mimo hru z okresu nebo klubu ve hře). Kterou
 * dvojici, nebo žádnou, rozhodne model; bez něj obchodník nabídne prvního hráče, který sedí.
 */
export async function pitchSurplus(
  env: Bindings, club: AiClubState, now: Date, mode: DecisionMode, actions: MarketAction[], plan: WeeklyTransferPlan | null,
  trace: MarketTrace, use: ModelUse,
): Promise<void> {
  const db = env.DB;
  const surplus = club.members.filter((m) => !m.loanedIn && club.analysis.importanceOf(m.id) === "surplus" && club.analysis.sellBlock(m.id) === null);
  if (surplus.length === 0) return;
  const demands = await db.prepare(
    `SELECT d.id, d.position, d.age_min, d.age_max, d.min_rating, d.max_price, d.team_id, t.user_id AS owner_user_id
       FROM transfer_demands d LEFT JOIN teams t ON t.id = d.team_id
      WHERE d.status = 'active' AND d.expires_at > ? AND (d.team_id IS NULL OR d.team_id != ?)
        AND ((d.team_id IS NULL AND d.district = ?) OR d.team_id IS NOT NULL)
        AND NOT EXISTS (SELECT 1 FROM transfer_demand_pitches dp WHERE dp.demand_id = d.id AND dp.team_id = ?)
      ORDER BY d.created_at DESC LIMIT 30`,
  ).bind(now.toISOString(), club.teamId, club.district ?? "", club.teamId).all<DemandRow>()
    .catch((e) => { logger.warn({ module: M }, "poptávky pro nabídnutí hráče", e); return { results: [] as DemandRow[] }; });

  // Dvojice poptávka a hráč, který na ni sedí. U klubu ve hře poptávka hodnocení hlídá sama,
  // u klubu mimo hru je práh skrytý. Propojeným klubům služba hráče nabídnout nedovolí.
  const pairs: Array<{ demand: DemandRow; member: SquadMember; option: PitchOption }> = [];
  for (const d of demands.results) {
    if (pairs.length >= MAX_PITCH_OPTIONS) break;
    const fits = surplus.filter((m) => m.position === d.position && m.age >= d.age_min && m.age <= d.age_max
      && (d.team_id == null || m.rating >= (d.min_rating ?? 0)));
    if (fits.length === 0) continue;
    if (d.team_id) {
      const { areClubsLinked } = await import("../competition/club-links");
      const linked = await areClubsLinked(db, club.teamId, d.team_id)
        .catch((e) => { logger.warn({ module: M }, `propojení s klubem poptávky ${d.id}`, e); return false; });
      if (linked) continue;
    }
    for (const m of fits.slice(0, MAX_PITCH_PLAYERS_PER_DEMAND)) {
      if (pairs.length >= MAX_PITCH_OPTIONS) break;
      const key = `p${pairs.length + 1}`;
      pairs.push({
        demand: d, member: m,
        option: {
          key,
          demand: {
            position: d.position, ageMin: d.age_min, ageMax: d.age_max, minRating: d.team_id ? d.min_rating : null, maxPrice: d.max_price,
            club: d.team_id ? (d.owner_user_id === "ai" ? "ai" : "human") : "outside",
          },
          player: { position: m.position, age: m.age, rating: m.rating, marketValue: marketValue(m.rating, m.age, m.position) },
        },
      });
    }
  }
  if (pairs.length === 0) return;

  const ctx: PitchContext = { ...marketClubLine(club, plan, TARGET_SENIOR_SQUAD), options: pairs.map((p) => p.option) };
  // Pravidlo: obchodník nabídne prvního hráče k první poptávce, na kterou sedí; ostatní nikoho.
  const rule = (): PitchDecision => ({ key: club.profile.trading >= 30 ? pairs[0].option.key : null, reason: "rules" });
  const decided = await decideByModel({
    name: "demand_pitch_offer", system: MARKET_SYSTEM_PROMPT, maxTokens: 300,
    prompt: () => renderPitchPrompt(ctx), schema: () => pitchSchema(ctx), validate: (raw) => validatePitch(raw, ctx), rule,
  }, use);
  recordDecision(trace, "nabídka k poptávce", decided.by, decided.trace);

  const meta = { decidedBy: decided.by, reason: decided.decision.reason };
  const chosen = pairs.find((p) => p.option.key === decided.decision.key);
  if (!chosen) {
    if (decided.by === "model") actions.push({ kind: "no_pitch", ...meta, result: "none" });
    return;
  }
  const base = { kind: "pitch" as const, playerId: chosen.member.id, demandId: chosen.demand.id, position: chosen.member.position, ...meta };
  if (mode === "shadow") {
    actions.push({ ...base, result: "shadow" });
    return;
  }
  const { pitchPlayer } = await import("../transfers/demands");
  const res = await pitchPlayer(db, club.teamId, chosen.demand.id, chosen.member.id, createRng(hashString(`pitch|${club.teamId}|${chosen.demand.id}|${pragueDay(now)}`)));
  actions.push({ ...base, result: res.ok ? res.status : "failed", error: res.ok ? undefined : res.error });
}
