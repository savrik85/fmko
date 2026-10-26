/**
 * Hlavní sponzor a název stadionu AI klubu.
 *
 * Lidský manažer otevře jednání s místní firmou, majitel udělá úvodní nabídku a manažer ji
 * podepíše, nebo smlouvá. AI trenér jde stejnou cestou: když klub v kategorii sponzora nemá,
 * osloví v pondělní správě firmu z vlastního okresu (`openNegotiation`) a jednání vede tah po
 * tahu (sponsor-negotiation.ts: podepsat, vlastní návrh, odejít) stejnými funkcemi jako člověk.
 * Bez SMS a hospody, stejná pravidla (okres, exkluzivita hlavního sponzora, přednost, cooldown,
 * změna hlavního sponzora jednou za sezónu).
 *
 * Model navrhuje, kód hlídá (main-sponsor-decision.ts): kód nabídne jen firmy, se kterými jde teď
 * jednat (stejná kontrola jako u člověka), s odhadem peněz, jaký manažer vidí u firmy na webu.
 * Model vybere, kterou oslovit, nebo že tento týden nikoho. Když vybraná firma mezitím jednat
 * nejde nebo její podmínky nejde podepsat, pokračuje se v pořadí náhradního pravidla. Bez modelu
 * (výpadek, neplatná odpověď, režim off) rozhodne pořadí podle povahy: ambiciózní trenér jde
 * za firmou s největším rozpočtem, ostatní spíš za firmou, která klub má nejradši; jednání pak
 * podepíše úvodní nabídku majitele.
 */

import type { Bindings } from "../index";
import { logger } from "../lib/logger";
import { budgetEstimateRange, sponsorBudgetB } from "../sponsors/budget";
import { blockedMainSponsorIds } from "../sponsors/exclusivity";
import { ensureSponsorOwners, getFavorsForTeam, type SponsorOwner } from "../sponsors/favor";
import { DEFAULT_FAVOR } from "../sponsors/favor-math";
import { BASE_WILLINGNESS, WILLINGNESS_CAP, type NegotiationCategory } from "../sponsors/negotiation";
import {
  activeSeason, categoryContracts, loadNegotiationTeam, negotiationAvailability, openNegotiation, teamGameDate,
  type NegotiationSponsor, type NegotiationTeam,
} from "../sponsors/negotiation-db";
import { logDecision } from "./decision-log";
import { callCoachModel } from "./llm";
import {
  mainSponsorSchema, NO_SPONSOR_CHOICE, renderMainSponsorPrompt, sponsorChoiceSystemPrompt, validateMainSponsorChoice,
  type MainSponsorClubInfo, type MainSponsorContext, type MainSponsorDecision, type MainSponsorOption,
} from "./main-sponsor-decision";
import type { CoachMode } from "./mode";
import type { AiCoachProfile } from "./profile";
import { MAX_MODEL_TURNS, negotiateWithOwner, shadowFirstTurn, type TalksModelUse, type TalksResult } from "./sponsor-negotiation";

const M = "ai-coach-main-sponsor";
/** Kolik firem za jednu pondělní správu nejvýš osloví. */
const MAX_ATTEMPTS = 3;
/**
 * Firma bez záznamu náklonnosti v pořadí náhradního pravidla: neutrální 50, jako dosud.
 * Model vidí skutečnou výchozí náklonnost hry (DEFAULT_FAVOR), stejnou jako manažer na webu.
 */
const RANKING_DEFAULT_FAVOR = 50;
/** Kolik firem model nejvýš uvidí. */
const MAX_OPTIONS = 8;
/** Kolik firem se nejvýš ověří, jestli s nimi jde jednat (každé ověření je pár dotazů do D1). */
const MAX_AVAILABILITY_CHECKS = 16;
/** Výběr firmy je krátké rozhodnutí: pondělní správa na model nemá čekat dlouho. */
const MODEL_TIMEOUT_MS = 60_000;

/** Druh záznamu v deníku a název schématu pro výběr firmy podle kategorie. */
const CHOICE_KIND: Record<NegotiationCategory, string> = { main: "main_sponsor", stadium: "stadium_sponsor" };
const CATEGORY_LABEL: Record<NegotiationCategory, string> = { main: "hlavní sponzor", stadium: "sponzor stadionu" };

export interface MainSponsorResult {
  signed: boolean;
  detail: string;
}

export interface MainSponsorOpts {
  /** Režim přepínače (oblast weekly). `shadow` rozhodne a zapíše do deníku, ale nic neotevře ani nepodepíše. */
  mode?: CoachMode;
  /** Nanečisto (admin): rozhodne jako v režimu `mode`, ale nic neprovede a do deníku jde jako shadow. */
  dryRun?: boolean;
  /** Binding Workers AI. Bez něj rozhoduje náhradní pravidlo. */
  ai?: Pick<Bindings, "AI"> | null;
  /** Jiný model (srovnání v adminu). */
  model?: string;
  /** Tabulka a finance z pondělní správy. */
  club?: MainSponsorClubInfo;
  /** Na co se rozhodnutí v deníku vztahuje (týden pondělní správy). */
  contextRef?: string;
}

export interface SponsorCandidate {
  id: number;
  name: string;
  monthlyMax: number;
  favor: number;
}

/** Pořadí firem k oslovení podle povahy trenéra: náhradní pravidlo (čistá funkce, testovaná zvlášť). */
export function rankSponsorCandidates(candidates: SponsorCandidate[], profile: AiCoachProfile): SponsorCandidate[] {
  const moneyWeight = profile.ambition / 100;
  const maxMonthly = Math.max(1, ...candidates.map((c) => c.monthlyMax));
  const score = (c: SponsorCandidate) =>
    moneyWeight * (c.monthlyMax / maxMonthly) + (1 - moneyWeight) * (c.favor / 100);
  return [...candidates].sort((a, b) => score(b) - score(a) || a.id - b.id);
}

/**
 * V jakém pořadí ověřit, se kterými firmami jde jednat: nejdřív `firstId` (dosavadní sponzor
 * v kategorii, prodloužení), pak střídavě z každého seznamu (pořadí pravidla, peníze, náklonnost)
 * bez opakování. Model tak uvidí firmy z obou konců, ne jen to, co by vybralo pravidlo.
 */
export function optionCheckOrder<T extends { id: number }>(lists: T[][], firstId: number | null): T[] {
  const out: T[] = [];
  const seen = new Set<number>();
  const add = (item: T | undefined) => {
    if (!item || seen.has(item.id)) return;
    seen.add(item.id);
    out.push(item);
  };
  if (firstId !== null) add(lists.flat().find((item) => item.id === firstId));
  const longest = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < longest; i++) for (const list of lists) add(list[i]);
  return out;
}

/** Co model dostal a vrátil (do deníku). */
interface ModelTrace {
  model: string | null;
  raw: string | null;
  error: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  latencyMs: number | null;
  prompt: string | null;
}

const NO_TRACE: ModelTrace = { model: null, raw: null, error: null, tokensIn: null, tokensOut: null, latencyMs: null, prompt: null };

/** Zeptá se modelu, kterou firmu oslovit. Neplatná odpověď (i výpadek) = decision null a důvod v trace. */
async function decideWithModel(
  ai: Pick<Bindings, "AI">, ctx: MainSponsorContext, model: string | undefined,
): Promise<{ decision: MainSponsorDecision | null; trace: ModelTrace }> {
  const prompt = renderMainSponsorPrompt(ctx);
  const res = await callCoachModel(ai, {
    system: sponsorChoiceSystemPrompt(ctx.category), user: prompt, maxTokens: 300,
    schema: { name: CHOICE_KIND[ctx.category], schema: mainSponsorSchema(ctx) }, model, timeoutMs: MODEL_TIMEOUT_MS,
  });
  const trace: ModelTrace = {
    model: res.model, raw: res.raw, error: res.error ?? null, tokensIn: res.tokensIn ?? null, tokensOut: res.tokensOut ?? null,
    latencyMs: res.latencyMs, prompt,
  };
  const decision = res.json ? validateMainSponsorChoice(res.json, ctx) : null;
  if (decision) return { decision, trace };
  const picked = (res.json as Record<string, unknown> | null)?.choice;
  const invalid = typeof picked === "string" ? `neplatná volba modelu: ${picked.slice(0, 80)}` : "neplatná odpověď modelu";
  return { decision: null, trace: { ...trace, error: trace.error ?? invalid } };
}

interface Approach {
  signed: { sponsor: NegotiationSponsor; contractId: string; newTeamName: string | null } | null;
  /** Firmy, se kterými se jednalo (jednat šlo), v pořadí. */
  tried: string[];
  /** Jak skončilo poslední jednání (null = žádné se neotevřelo). */
  last: TalksResult["outcome"] | null;
}

/**
 * Osloví firmy v daném pořadí stejnou cestou jako člověk: kontrola, jestli jde jednat, otevření
 * jednání a jednání tah po tahu. Nejvýš MAX_ATTEMPTS firem, se kterými jednat šlo. Další firma
 * přijde na řadu, jen když jednání selže (podmínky nejde podepsat); když od něj odejde AI nebo
 * majitel, tento týden už nikdo.
 */
async function approachInOrder(
  db: D1Database, team: NegotiationTeam, season: number, order: NegotiationSponsor[], category: NegotiationCategory,
  profile: AiCoachProfile, use: TalksModelUse,
): Promise<Approach> {
  const tried: string[] = [];
  let last: TalksResult["outcome"] | null = null;
  for (const sponsor of order) {
    if (tried.length >= MAX_ATTEMPTS) break;
    const availability = await negotiationAvailability(db, team, sponsor, category, season);
    if (!availability.canOpen) continue;
    tried.push(sponsor.name);

    const opened = await openNegotiation(db, team.id, sponsor.id, category);
    if (!opened.ok) {
      logger.info({ module: M, teamId: team.id }, `jednání s ${sponsor.name} nejde otevřít: ${opened.error}`);
      continue;
    }
    const talks = await negotiateWithOwner(db, team.id, opened.id, profile, use);
    last = talks.outcome;
    if (talks.outcome === "signed" && talks.contractId) {
      logger.info({ module: M, teamId: team.id }, `${CATEGORY_LABEL[category]} ${sponsor.name} podepsán (smlouva ${talks.contractId})`);
      return { signed: { sponsor, contractId: talks.contractId, newTeamName: talks.newTeamName }, tried, last };
    }
    logger.info({ module: M, teamId: team.id }, `${CATEGORY_LABEL[category]} ${sponsor.name}: bez dohody (${talks.outcome}: ${talks.detail})`);
    if (talks.outcome !== "failed") break;
  }
  return { signed: null, tried, last };
}

export async function maybeSignMainSponsor(
  db: D1Database, teamId: string, profile: AiCoachProfile, opts: MainSponsorOpts = {},
): Promise<MainSponsorResult> {
  return maybeSignSponsor(db, teamId, profile, "main", opts);
}

/** Název stadionu: stejná cesta jako hlavní sponzor, jen bez exkluzivity a přejmenování klubu. */
export async function maybeSignStadiumSponsor(
  db: D1Database, teamId: string, profile: AiCoachProfile, opts: MainSponsorOpts = {},
): Promise<MainSponsorResult> {
  return maybeSignSponsor(db, teamId, profile, "stadium", opts);
}

async function maybeSignSponsor(
  db: D1Database, teamId: string, profile: AiCoachProfile, category: NegotiationCategory, opts: MainSponsorOpts,
): Promise<MainSponsorResult> {
  const mode = opts.mode ?? "on";
  // Režim off: bez modelu, ale provede. Shadow a nanečisto: rozhodne (i modelem), nic neprovede.
  const logMode: CoachMode = opts.dryRun ? "shadow" : mode;
  const team = await loadNegotiationTeam(db, teamId);
  if (!team) return { signed: false, detail: "tým nenalezen" };
  const contracts = await categoryContracts(db, teamId, category);
  if (contracts.active) return { signed: false, detail: `${CATEGORY_LABEL[category]} už je: ${contracts.active.sponsor_name}` };

  const rows = await db.prepare("SELECT id, name, type, district, monthly_max FROM district_sponsors WHERE district = ?")
    .bind(team.district).all<NegotiationSponsor>()
    .catch((e) => {
      logger.warn({ module: M, teamId }, "firmy okresu", e);
      return { results: [] as NegotiationSponsor[] };
    });
  if (rows.results.length === 0) return { signed: false, detail: "v okrese nejsou firmy" };
  const season = await activeSeason(db);
  const favors = await getFavorsForTeam(db, teamId);
  // Hlavní sponzor jiného klubu a přednostní jednání s jiným klubem jedním dotazem (stejné
  // pravidlo jako mainSponsorBlock); zbytek pravidel ověří negotiationAvailability níž.
  // Název stadionu exkluzivní není (stadion se sdílet smí).
  const blocked = category === "main"
    ? await blockedMainSponsorIds(db, team.district, teamId, season)
      .catch((e) => {
        logger.warn({ module: M, teamId }, "obsazené firmy okresu", e);
        return new Set<number>();
      })
    : new Set<number>();
  const pool = rows.results.filter((r) => !blocked.has(r.id));
  const byId = new Map(pool.map((r) => [r.id, r]));
  const sponsorsOf = (ids: number[]): NegotiationSponsor[] => ids.flatMap((id) => byId.get(id) ?? []);

  // Náhradní pravidlo: pořadí podle povahy.
  const ranked = sponsorsOf(rankSponsorCandidates(pool.map((r) => ({
    id: r.id, name: r.name, monthlyMax: r.monthly_max, favor: favors.get(r.id) ?? RANKING_DEFAULT_FAVOR,
  })), profile).map((c) => c.id));

  // Nabídka pro model: firmy, se kterými jde teď jednat, se stejným odhadem peněz jako na webu.
  const favorOf = (id: number) => favors.get(id) ?? DEFAULT_FAVOR;
  const budgetOf = (s: NegotiationSponsor) => sponsorBudgetB({
    monthlyMax: s.monthly_max, reputation: team.reputation, villageSize: team.size, category, favor: favorOf(s.id),
  });
  const byMoney = [...pool].sort((a, b) => budgetOf(b) - budgetOf(a) || a.id - b.id);
  const byFavor = [...pool].sort((a, b) => favorOf(b.id) - favorOf(a.id) || budgetOf(b) - budgetOf(a) || a.id - b.id);
  const available: Array<{ sponsor: NegotiationSponsor; renewal: boolean }> = [];
  let checks = 0;
  for (const sponsor of optionCheckOrder([ranked, byMoney, byFavor], contracts.lastExpired?.sponsor_id ?? null)) {
    if (available.length >= MAX_OPTIONS || checks >= MAX_AVAILABILITY_CHECKS) break;
    checks++;
    const availability = await negotiationAvailability(db, team, sponsor, category, season);
    if (availability.canOpen) available.push({ sponsor, renewal: availability.isRenewal });
  }
  // Není z čeho vybírat: model se neptá, do deníku se nic nepíše.
  if (available.length === 0) return { signed: false, detail: "žádná firma teď nejedná" };

  const owners = await ensureSponsorOwners(db, available.map((a) => a.sponsor.id))
    .catch((e) => {
      logger.warn({ module: M, teamId }, "majitelé firem", e);
      return new Map<number, SponsorOwner>();
    });
  const options: MainSponsorOption[] = available
    .map(({ sponsor, renewal }) => {
      const favor = favorOf(sponsor.id);
      const b = budgetOf(sponsor);
      const base = budgetEstimateRange(BASE_WILLINGNESS * b, favor);
      return {
        sponsorId: sponsor.id, name: sponsor.name, type: sponsor.type, ownerPersonality: owners.get(sponsor.id)?.personality ?? null,
        favor, monthlyLow: base.low, monthlyHigh: base.high, monthlyCap: budgetEstimateRange(WILLINGNESS_CAP * b, favor).high, renewal,
      };
    })
    // Jako na webu: větší firmy nahoře.
    .sort((a, b) => b.monthlyHigh - a.monthlyHigh || a.sponsorId - b.sponsorId)
    .map((o, i) => ({ key: `F${i + 1}`, ...o }));
  const ctx: MainSponsorContext = {
    category, teamName: team.name, profile, budget: team.budget, reputation: team.reputation,
    league: opts.club?.league ?? null, weeklyRunningCost: opts.club?.weeklyRunningCost ?? null, weeklyIncome: opts.club?.weeklyIncome ?? null,
    options,
  };

  const { decision, trace } = mode !== "off" && opts.ai
    ? await decideWithModel(opts.ai, ctx, opts.model)
    : { decision: null, trace: NO_TRACE };
  const decidedBy: "model" | "fallback" = decision ? "model" : "fallback";

  // Bez platné volby modelu rozhodne pravidlo: první firma jeho pořadí, se kterou jde jednat.
  const ruleFirst = ranked.flatMap((r) => options.filter((o) => o.sponsorId === r.id))[0] ?? null;
  const choice: MainSponsorDecision = decision
    ?? { key: ruleFirst?.key ?? NO_SPONSOR_CHOICE, sponsorId: ruleFirst?.sponsorId ?? null, reason: "fallback" };
  const chosen = options.find((o) => o.sponsorId === choice.sponsorId) ?? null;
  // Volba modelu jde první, za ní pořadí pravidla (kdyby s vybranou firmou jednat nešlo). „none“ = nikdo.
  const pickedId = decision?.sponsorId;
  const order: NegotiationSponsor[] = !decision
    ? ranked
    : pickedId == null ? [] : [...sponsorsOf([pickedId]), ...ranked.filter((s) => s.id !== pickedId)];

  const contextRef = opts.contextRef ?? teamGameDate(team).slice(0, 10);
  const log = (executed: Record<string, unknown> | null) => logDecision(db, {
    teamId, kind: CHOICE_KIND[category], mode: logMode, model: trace.model, contextRef,
    inputSummary: trace.prompt ?? `firmy: ${options.map((o) => `${o.key} ${o.name} (${o.monthlyLow}-${o.monthlyHigh})`).join(", ")}`,
    rawOutput: trace.raw,
    actions: {
      choice: choice.key, sponsorId: choice.sponsorId, sponsorName: chosen?.name ?? null, reason: choice.reason, decidedBy,
      options: options.map((o) => ({ key: o.key, sponsorId: o.sponsorId, name: o.name })),
    },
    executed, usedFallback: decidedBy === "fallback", error: trace.error,
    tokensIn: trace.tokensIn, tokensOut: trace.tokensOut, latencyMs: trace.latencyMs,
  });

  // Tahy v jednání: model jen v režimu on/shadow s bindingem. Každé jednání má celý počet tahů:
  // když podpis selže (firmu mezitím vzal jiný klub) a AI jde k další firmě, rozhoduje dál model,
  // ne pravidlo (simulace 25. 10.: další firmu podepsalo pravidlo, protože model tahy vyčerpal).
  const talksUse: TalksModelUse = { mode, ai: opts.ai, model: opts.model, turnsLeft: { n: MAX_MODEL_TURNS * MAX_ATTEMPTS } };

  if (logMode === "shadow") {
    await log(null);
    // Nanečisto i první tah jednání s vybranou firmou nad úvodní nabídkou, jak by ji majitel dal.
    const sponsor = chosen ? byId.get(chosen.sponsorId) ?? null : null;
    const firstMove = sponsor && chosen
      ? await shadowFirstTurn(db, { team, sponsor, category, season, renewal: chosen.renewal, profile, use: talksUse, contextRef })
      : null;
    return { signed: false, detail: `nanečisto: ${chosen?.name ?? "tento týden nikoho"}${firstMove ? `, první tah ${firstMove.move}` : ""}` };
  }
  if (order.length === 0) {
    await log({ signed: false, tried: [] });
    return { signed: false, detail: "tento týden nikoho" };
  }

  const approach = await approachInOrder(db, team, season, order, category, profile, talksUse);
  const signed = approach.signed;
  await log(signed
    ? {
      signed: true, sponsorId: signed.sponsor.id, sponsorName: signed.sponsor.name, contractId: signed.contractId,
      newTeamName: signed.newTeamName, asChosen: signed.sponsor.id === choice.sponsorId, tried: approach.tried,
    }
    : { signed: false, tried: approach.tried, ...(approach.last ? { talks: approach.last } : {}) });
  if (signed) {
    return { signed: true, detail: signed.newTeamName ? `${signed.sponsor.name}, nový název ${signed.newTeamName}` : signed.sponsor.name };
  }
  return { signed: false, detail: approach.tried.length ? `bez dohody (${approach.tried.join(", ")})` : "žádná firma teď nejedná" };
}
