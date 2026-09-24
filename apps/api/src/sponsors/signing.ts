/**
 * Podpis smlouvy vyjednané s majitelem firmy (etapa 2). Podepisují se jen podmínky uložené
 * v jednání (přijatý návrh klubu, nebo protinabídka majitele); klient neposílá nic.
 * Před podpisem se znovu ověří, že podmínky pořád jdou splnit a firma je pořád volná.
 *
 * Pořadí: zámek jednání → smlouva (hlavní sponzor atomicky přes MAIN_SPONSOR_FREE_SQL)
 * → stará smlouva → platby → zaplacená stavba → sliby → úklid jednání → přejmenování a SMS.
 *
 * Jednorázová plnění sponzora (příspěvek za podpis, zaplacená stavba a vybavení, zaplacená
 * výpovědní pokuta u předchozího sponzora, vyplacené bonusy za termínové sliby) jsou ZÁLOHA
 * na celou smlouvu. Když klub smlouvu ukončí předčasně, vrací nesplacenou část
 * (advanceClawback). Co je potřeba k výpočtu, drží smlouva:
 *  - `signing_bonus`: příspěvek za podpis,
 *  - `paid_construction`: JSON ContractAdvance `{ items, startOffsetMonths }`: stavba, vybavení
 *    a zaplacená pokuta s cenou, a kolik měsíců sezóny podpisu už v den podpisu uplynulo,
 *  - vyplacené bonusy za termínové sliby = součet `reward` řádků `sponsor_promises` té smlouvy
 *    se `status = 'fulfilled'` u termínových druhů (etapa 3 bonus vyplácí právě při splnění).
 *
 * Všechny peníze, konec staré smlouvy, nová smlouva, stavba a sliby jdou v JEDNÉ dávce
 * (D1 batch = transakce). Platby jsou podmíněné existencí nové smlouvy, platby za starou
 * smlouvu navíc tím, že je stará smlouva v tu chvíli pořád aktivní: souběžná výpověď
 * nebo rollover ji nestrhnou podruhé.
 */
import { logger } from "../lib/logger";
import { CATEGORIES } from "../equipment/equipment-generator";
import type { TransactionType } from "../season/finance-processor";
import { FACILITY_LABELS } from "../stadium/stadium-generator";
import { MONTHS_PER_SEASON } from "./ambition";
import { MAIN_SPONSOR_FREE_SQL, mainSponsorFreeParams } from "./exclusivity";
import {
  advanceClawback, buildPromiseRows, constructionCost, earlyTerminationFee, effectiveContractMonths, equipmentCost, oneTimeTotal,
  type NegotiationContext, type Proposal,
} from "./negotiation";
import {
  contractBlock, loadNegotiationState, negotiationView, pendingTerms, pendingTermsProgress, prorataTerminationFee, teamGameDate, type Fail,
  type NegotiationState, type NegotiationView,
} from "./negotiation-db";
import { DEADLINE_KINDS } from "./promise-kinds";
import { validateProposal } from "./proposal";

export interface PaidConstruction { kind: "stadium" | "equipment"; key: string; level: number; cost: number }
/** Výpovědní pokuta u předchozího sponzora, kterou zaplatil nový sponzor (key = id staré smlouvy). */
export interface PaidFee { kind: "current_fee"; key: string; level: 0; cost: number }
/** Položka `sponsor_contracts.paid_construction`: věcné a jednorázové plnění sponzora s cenou. */
export type AdvanceItem = PaidConstruction | PaidFee;

/** Co sponzor klubu zaplatí věcně (stavba, vybavení), s cenou podle ceníku. Ukládá se do paid_construction. */
export function paidConstructionItems(p: Proposal, ctx: NegotiationContext): PaidConstruction[] {
  const out: PaidConstruction[] = [];
  if (p.demands.construction) {
    const f = ctx.facilities.find((x) => x.facility === p.demands.construction);
    if (f) out.push({ kind: "stadium", key: f.facility, level: f.currentLevel + 1, cost: constructionCost(ctx, f.facility) });
  }
  if (p.demands.equipment) {
    const e = ctx.equipment.find((x) => x.category === p.demands.equipment);
    if (e) out.push({ kind: "equipment", key: e.category, level: e.nextLevel, cost: equipmentCost(ctx, e.category) });
  }
  return out;
}

/** Název stadionu podle sponzora, stejně jako dřívější pevné nabídky: bez „s.r.o.", s „Arena". */
export function stadiumSponsorName(name: string): string {
  return `${name.replace(/\s*s\.r\.o\.?\s*/gi, "").trim()} Arena`;
}


/** Obsah `sponsor_contracts.paid_construction` u smlouvy z jednání. */
export interface ContractAdvance {
  /** Věcná a jednorázová plnění sponzora s cenou. */
  items: AdvanceItem[];
  /** Kolik měsíců sezóny podpisu v den podpisu už uplynulo: tu část smlouva nepokrývá. */
  startOffsetMonths: number;
}

function isAdvanceItem(v: unknown): v is AdvanceItem {
  const i = v as { kind?: unknown; key?: unknown; cost?: unknown } | null;
  return !!i && (i.kind === "stadium" || i.kind === "equipment" || i.kind === "current_fee")
    && typeof i.key === "string" && typeof i.cost === "number" && Number.isFinite(i.cost);
}

/** Přečte `paid_construction` (neplatný JSON = prázdná záloha a varování v logu). */
export function parseAdvance(raw: string | null | undefined, contractId: string): ContractAdvance {
  const empty: ContractAdvance = { items: [], startOffsetMonths: 0 };
  if (!raw) return empty;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch (e) {
    logger.warn({ module: "sponsors" }, `neplatný paid_construction u smlouvy ${contractId}`, e);
    return empty;
  }
  const obj = (Array.isArray(v) ? { items: v } : v && typeof v === "object" ? v : {}) as { items?: unknown; startOffsetMonths?: unknown };
  const items = Array.isArray(obj.items) ? obj.items.filter(isAdvanceItem) : [];
  const off = typeof obj.startOffsetMonths === "number" && Number.isFinite(obj.startOffsetMonths)
    ? Math.min(MONTHS_PER_SEASON, Math.max(0, obj.startOffsetMonths)) : 0;
  return { items, startOffsetMonths: off };
}

/** Součty cen zálohy podle druhu, ve tvaru pro oneTimeTotal. */
export function advanceItemsTotals(items: readonly AdvanceItem[]): { construction: number; equipment: number; paidFee: number } {
  const out = { construction: 0, equipment: 0, paidFee: 0 };
  for (const i of items) {
    if (i.kind === "stadium") out.construction += i.cost;
    else if (i.kind === "equipment") out.equipment += i.cost;
    else out.paidFee += i.cost;
  }
  return out;
}

// Postup sezóny žije v negotiation-db.ts (potřebuje ho už kontext jednání), tady re-export pro volající.
export { loadTeamSeasonProgress, seasonProgressMonths, type SeasonBounds } from "./negotiation-db";

/**
 * Nesplacená část zálohy. Smlouva běží od podpisu (startOffsetMonths do sezóny podpisu) do konce
 * poslední sezóny; uplynulo (odehrané sezóny) − offset + postup aktuální sezóny. Délka je stejná
 * jako ta, na kterou jednání jednorázové položky rozpočítalo (effectiveContractMonths).
 */
export function clawbackAmount(i: {
  oneTimeTotal: number; seasonsTotal: number; seasonsRemaining: number; startOffsetMonths: number; progressMonths: number;
}): number {
  const length = effectiveContractMonths(i.seasonsTotal, i.startOffsetMonths);
  const elapsed = (i.seasonsTotal - i.seasonsRemaining) * MONTHS_PER_SEASON - i.startOffsetMonths + i.progressMonths;
  return advanceClawback({ oneTimeTotal: i.oneTimeTotal, contractMonths: length, monthsElapsed: Math.min(length, Math.max(0, elapsed)) });
}

export interface AdvanceContract {
  id: string; seasons_total: number; seasons_remaining: number;
  signing_bonus: number | null; paid_construction: string | null; negotiation_id: string | null;
}

/** Vyplacené bonusy za splnění termínových slibů smlouvy (etapa 3 je vyplácí při splnění). */
export async function paidDeadlineGoalBonuses(db: D1Database, contractId: string): Promise<number> {
  const kinds = [...DEADLINE_KINDS];
  const row = await db.prepare(
    `SELECT COALESCE(SUM(reward), 0) AS total FROM sponsor_promises
     WHERE contract_id = ? AND status = 'fulfilled' AND kind IN (${kinds.map(() => "?").join(", ")})`,
  ).bind(contractId, ...kinds).first<{ total: number }>();
  return row?.total ?? 0;
}

/**
 * Vratka zálohy při předčasném konci smlouvy klubem (výpověď, přechod k jiné firmě, prodloužení).
 * Smlouvy z dřívějších pevných nabídek (bez jednání) žádnou zálohu nemají, vratka je 0.
 * `progressMonths` = loadTeamSeasonProgress klubu.
 */
export async function contractClawback(db: D1Database, c: AdvanceContract, progressMonths: number): Promise<number> {
  if (!c.negotiation_id) return 0;
  const adv = parseAdvance(c.paid_construction, c.id);
  const total = oneTimeTotal({
    signingBonus: c.signing_bonus ?? 0,
    ...advanceItemsTotals(adv.items),
    deadlineGoalBonuses: await paidDeadlineGoalBonuses(db, c.id),
  });
  return clawbackAmount({
    oneTimeTotal: total, seasonsTotal: c.seasons_total, seasonsRemaining: c.seasons_remaining,
    startOffsetMonths: adv.startOffsetMonths, progressMonths,
  });
}

export async function loadAdvanceContract(db: D1Database, contractId: string): Promise<AdvanceContract | null> {
  return db.prepare(
    "SELECT id, seasons_total, seasons_remaining, signing_bonus, paid_construction, negotiation_id FROM sponsor_contracts WHERE id = ?",
  ).bind(contractId).first<AdvanceContract>();
}

/** Vratka zálohy současné smlouvy v kategorii jednání (0 bez smlouvy nebo u smlouvy bez jednání). */
async function currentContractClawback(db: D1Database, st: NegotiationState): Promise<number> {
  const current = st.contracts.active;
  if (!current) return 0;
  const adv = await loadAdvanceContract(db, current.id);
  return adv ? contractClawback(db, adv, st.ctx.seasonProgressMonths) : 0;
}

/**
 * Pokuta za sliby současné smlouvy, které při přechodu k jiné firmě propadnou (promise-forfeit.ts).
 * Prodloužení sliby nepropadá (přesouvají se na novou smlouvu), proto 0.
 */
async function currentContractForfeit(db: D1Database, st: NegotiationState) {
  const current = st.contracts.active;
  if (!current || st.isRenewal) return null;
  const { prepareForfeit } = await import("./promise-forfeit");
  return prepareForfeit(db, current.id, st.season);
}

/**
 * Pohled na jednání pro klienta i s vratkou zálohy současné smlouvy a pokutou za propadlé sliby,
 * které klub při podpisu zaplatí.
 */
export async function viewWithClawback(db: D1Database, st: NegotiationState): Promise<NegotiationView> {
  const [clawback, forfeit] = await Promise.all([currentContractClawback(db, st), currentContractForfeit(db, st)]);
  return negotiationView(st, { currentClawback: clawback, currentForfeitPenalty: forfeit?.total ?? 0 });
}

/**
 * Nový hlavní sponzor: klub nese jeho jméno, pohár, U21 a zpráva do ligy.
 * `freeSwitch`: přechod od legacy smlouvy (bez jednání) je zdarma — bez −3 reputace za přejmenování,
 * motivuje kluby přejít na nový systém sponzorů (signFromState počítá legacySwitch).
 */
export async function applyMainSponsorRename(
  db: D1Database, teamId: string, sponsorName: string, season: number, opts: { freeSwitch?: boolean } = {},
): Promise<{ oldName: string; newName: string }> {
  const teamInfo = await db.prepare("SELECT name, village_id FROM teams WHERE id = ?")
    .bind(teamId).first<{ name: string; village_id: string }>();
  const village = teamInfo
    ? await db.prepare("SELECT name FROM villages WHERE id = ?").bind(teamInfo.village_id).first<{ name: string }>()
      .catch((e) => { logger.warn({ module: "sponsors", teamId }, "fetch village for sponsor rename", e); return null; })
    : null;
  const oldName = teamInfo?.name ?? "";
  const newName = `FK ${sponsorName} ${village?.name ?? ""}`.trim();
  await db.prepare("UPDATE teams SET name = ?, last_main_sponsor_change_season = ? WHERE id = ?")
    .bind(newName, season, teamId).run();
  if (!opts.freeSwitch) {
    // Přejmenování podle sponzora fanoušky nepotěší (-3).
    const { applyReputationDelta } = await import("../lib/reputation");
    await applyReputationDelta(db, teamId, -3, "sponsor", "Přejmenování klubu podle sponzora",
      { referenceId: `sponsor-rename-${teamId}-s${season}` });
  }
  // Pamětníci to nesou nejhůř, jméno klubu neslo tři generace.
  const { recordClubEvent } = await import("../fans/club-events");
  await recordClubEvent(db, {
    teamId, kind: "prejmenovani_klubu", severity: 1,
    payload: { co: `Teď jsme ${newName}` },
    referenceId: `fan-rename-${teamId}-s${season}`,
  });
  // Přejmenování promítnout i do poháru a do U21 týmu klubu (jinak drží starý název).
  await db.prepare("UPDATE cup_teams SET name = ? WHERE team_id = ?").bind(newName, teamId).run()
    .catch((e) => logger.warn({ module: "sponsors", teamId }, "rename cup_teams on sponsor change", e));
  await db.prepare("UPDATE teams SET name = ? WHERE parent_team_id = ? AND team_type = 'u21'").bind(`${newName} U21`, teamId).run()
    .catch((e) => logger.warn({ module: "sponsors", teamId }, "rename U21 on sponsor change", e));
  const newsBody = opts.freeSwitch
    ? `Klub ${oldName} podepsal sponzorskou smlouvu s firmou ${sponsorName} a mění svůj název na ${newName}. Přechod ze staré smlouvy byl zdarma, reputaci to nestálo.`
    : `Klub ${oldName} podepsal sponzorskou smlouvu s firmou ${sponsorName} a mění svůj název na ${newName}. Fanoušci nejsou nadšení (-3 reputace).`;
  await db.prepare(
    "INSERT INTO news (id, league_id, type, headline, body, created_at) VALUES (?, (SELECT league_id FROM teams WHERE id = ?), 'rename', ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))",
  ).bind(crypto.randomUUID(), teamId, `${oldName} mění název na ${newName}`, newsBody)
    .run().catch((e) => logger.warn({ module: "sponsors", teamId }, "insert sponsor rename news", e));
  return { oldName, newName };
}

/** Nový sponzor stadionu: stadion nese jeho jméno, fanoušci si toho všimnou. */
export async function applyStadiumRename(db: D1Database, teamId: string, stadiumName: string, contractId: string): Promise<void> {
  const old = await db.prepare("SELECT stadium_name FROM teams WHERE id = ?").bind(teamId).first<{ stadium_name: string | null }>()
    .catch((e) => { logger.warn({ module: "sponsors", teamId }, "starý název stadionu", e); return null; });
  await db.prepare("UPDATE teams SET stadium_name = ? WHERE id = ?").bind(stadiumName, teamId).run();
  const { recordClubEvent } = await import("../fans/club-events");
  await recordClubEvent(db, {
    teamId, kind: "prejmenovani_stadionu", severity: 1,
    payload: { co: `${old?.stadium_name ?? "Hřiště"} je teď ${stadiumName}` },
    referenceId: `fan-stadion-${contractId}`,
  });
}


/** Podmínka příkazu v dávce: výraz s pozičními `?` a jeho hodnoty. */
export interface Guard { sql: string; params: unknown[] }

/**
 * Podmínka INSERTu nové smlouvy: klub (?1) nemá v kategorii (?2) jinou aktivní smlouvu než tu,
 * kterou podpis nahrazuje (?3, '' když žádnou). Dva souběžné podpisy v téže kategorii (dvě
 * jednání s různými firmami) by jinak oba vložily aktivní smlouvu; dávky D1 běží jedna po druhé,
 * takže druhá už první smlouvu uvidí.
 */
export const OTHER_ACTIVE_IN_CATEGORY_FREE_SQL =
  `NOT EXISTS (SELECT 1 FROM sponsor_contracts y WHERE y.team_id = ? AND y.status = 'active' AND COALESCE(y.category, 'main') = ? AND y.id != ?)`;

/** Totéž co recordTransaction, ale jako příkazy do dávky a jen když platí `guard`. */
export function moneyStatements(
  db: D1Database, teamId: string, type: TransactionType, amount: number, description: string, gameDate: string,
  referenceId: string, guard: Guard,
): D1PreparedStatement[] {
  return [
    db.prepare(`UPDATE teams SET budget = budget + ? WHERE id = ? AND ${guard.sql}`).bind(amount, teamId, ...guard.params),
    db.prepare(
      `INSERT INTO transactions (id, team_id, type, amount, balance_after, description, reference_id, game_date)
       SELECT ?, ?, ?, ?, (SELECT budget FROM teams WHERE id = ?), ?, ?, ? WHERE ${guard.sql}`,
    ).bind(crypto.randomUUID(), teamId, type, amount, teamId, description, referenceId, gameDate, ...guard.params),
  ];
}

/** Stavba nebo vybavení zaplacené sponzorem jako příkaz do dávky (úroveň o stupeň výš), nebo null u neznámého klíče. */
function paidConstructionStatement(db: D1Database, teamId: string, item: PaidConstruction, guard: Guard): D1PreparedStatement | null {
  // Sloupec jen z whitelistu (FACILITY_LABELS, CATEGORIES), stejně jako POST /stadium/upgrade a /equipment/upgrade.
  if (item.kind === "stadium") {
    if (!(item.key in FACILITY_LABELS)) return null;
    return db.prepare(`UPDATE stadiums SET ${item.key} = ? WHERE team_id = ? AND ${item.key} = ? AND ${guard.sql}`)
      .bind(item.level, teamId, item.level - 1, ...guard.params);
  }
  if (!(CATEGORIES as readonly string[]).includes(item.key)) return null;
  return db.prepare(`UPDATE equipment SET ${item.key} = ?, ${item.key}_condition = 100 WHERE team_id = ? AND ${item.key} = ? AND ${guard.sql}`)
    .bind(item.level, teamId, item.level - 1, ...guard.params);
}

export type SignResult =
  | { ok: true; contractId: string; newTeamName: string | null; reputationPenalty: number }
  | ({ ok: false } & Fail);

export async function signNegotiation(db: D1Database, teamId: string, negotiationId: string): Promise<SignResult> {
  const st = await loadNegotiationState(db, teamId, negotiationId);
  if ("error" in st) return { ok: false, ...st };
  return signFromState(db, st);
}

/** Podpis nad načteným stavem jednání (loadNegotiationState skládá kontext čerstvě, ne z doby návrhu). */
export async function signFromState(db: D1Database, st: NegotiationState): Promise<SignResult> {
  const { neg, team, sponsor, season, ctx } = st;
  const teamId = team.id;
  if (neg.status === "expired") return { ok: false, error: "Jednání vypršelo", status: 410 };
  if (neg.status === "signed") return { ok: false, error: "Smlouva už je podepsaná", status: 409 };
  if (neg.status === "walked_away") return { ok: false, error: "Majitel od jednání odešel", status: 409 };
  const terms = pendingTerms(neg);
  if (!terms) return { ok: false, error: "Majitel zatím nic nepřijal", status: 409 };

  // Stav klubu se od návrhu mohl změnit (postavená tribuna, nový banner, licence): znovu ověřit.
  // Cena (rozpočet na jednorázové položky, nejkratší délka) ale s postupem sezóny z kola, ve kterém
  // majitel podmínky přijal: skutečná délka smlouvy se každým herním dnem zkracuje a podmínky
  // přijaté na hraně by o den později neprošly, jednání ve stavu 'accepted' by pak viselo do
  // vypršení. Jednání se při rolloveru zavírají, uložený postup je vždycky z téže sezóny.
  const acceptedProgress = pendingTermsProgress(neg);
  const priceCtx: NegotiationContext = acceptedProgress === null ? ctx : { ...ctx, seasonProgressMonths: acceptedProgress };
  const valid = validateProposal(terms, priceCtx);
  if (!valid.ok) return { ok: false, error: `Tyhle podmínky už podepsat nejde: ${valid.error}`, status: 409 };
  // Otevřené jednání negotiationAvailability znovu neověřuje: okres, okno prodloužení,
  // změna hlavního sponzora jednou za sezónu a exkluzivita se proto kontrolují až tady.
  const block = await contractBlock(db, team, sponsor, neg.category, season, st.contracts);
  if (block) return { ok: false, error: block, status: 409 };

  const proposal = valid.proposal;
  const d = proposal.demands;
  const gameDate = teamGameDate(team);
  // Skutečný postup sezóny v den podpisu: smlouva běží od dneška, vratka zálohy (clawbackAmount)
  // i pokuty slibů (buildPromiseRows s čerstvým ctx) se počítají ze skutečné délky smlouvy.
  const progress = ctx.seasonProgressMonths;
  // Nahrazovaná smlouva v kategorii. Přechod k jiné firmě: výpověď s poměrnou pokutou. Prodloužení:
  // stará smlouva vyprší. V obou případech klub vrací nesplacenou zálohu staré smlouvy (jinak by šlo
  // prodloužením hned po podpisu brát příspěvek za podpis znovu a znovu).
  const replaced = st.contracts.active;
  const old = replaced && !st.isRenewal ? replaced : null;
  // Legacy smlouva (bez jednání, z dřívějších pevných nabídek) nemá výpovědní pokutu ani zálohu:
  // přechod na nový systém sponzorů je zdarma, ať kluby motivuje přejít (negotiationView počítá stejně).
  const legacySwitch = old !== null && old.negotiation_id === null;
  // Žádnou aktivní smlouvu v kategorii klub nemá (první hlavní sponzor vůbec): přejmenování nikoho
  // nenahrazuje, penalizovat fanoušky za první jméno klubu se sponzorem nedává smysl (negotiationView počítá stejně).
  const noReplacedContract = replaced === null;
  const freeRename = legacySwitch || noReplacedContract;
  const switchFee = old && !legacySwitch ? prorataTerminationFee(old) : 0;
  const clawback = await currentContractClawback(db, st);
  // Přechod k jiné firmě: sliby aktuální sezóny a termínové sliby staré smlouvy propadnou s plnou pokutou.
  const forfeit = await currentContractForfeit(db, st);
  const forfeitTotal = forfeit?.total ?? 0;
  const feePaidBySponsor = d.payCurrentFee ? switchFee : 0;
  if (team.budget + d.signingBonus + feePaidBySponsor < switchFee + clawback + forfeitTotal) {
    const kc = (n: number) => `${Math.round(n).toLocaleString("cs-CZ")} Kč`;
    const parts = [
      ...(switchFee > 0 || (clawback === 0 && forfeitTotal === 0) ? ["výpovědní pokutu"] : []),
      ...(clawback > 0 ? ["vrácení zálohy"] : []),
      ...(forfeitTotal > 0 ? ["pokuty za propadlé sliby"] : []),
    ];
    const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} a ${parts[parts.length - 1]}` : parts[0];
    return { ok: false, error: `Na ${list} (${kc(switchFee + clawback + forfeitTotal)}) u ${replaced?.sponsor_name ?? "současného sponzora"} nemáš peníze`, status: 400 };
  }

  // Zámek: podepsat jde jen jednou a jen to, co klient viděl (stav ani kola se nezměnily).
  // Protinabídka majitele se podepisuje ze stavu 'open', přijatý návrh klubu ze stavu 'accepted'.
  const claim = await db.prepare(
    "UPDATE sponsor_negotiations SET status = 'signed' WHERE id = ? AND team_id = ? AND status = ? AND rounds = ?",
  ).bind(neg.id, teamId, neg.status, neg.roundsRaw).run();
  if ((claim.meta?.changes ?? 0) !== 1) return { ok: false, error: "Smlouva se už podepisuje, načti stránku znovu", status: 409 };
  const releaseClaim = () => db.prepare("UPDATE sponsor_negotiations SET status = ? WHERE id = ? AND status = 'signed'")
    .bind(neg.status, neg.id).run()
    .catch((e) => logger.error({ module: "sponsors", teamId }, `jednání ${neg.id} zůstalo podepsané bez smlouvy`, e));

  const contractId = crypto.randomUUID();
  const contractName = neg.category === "stadium" ? stadiumSponsorName(sponsor.name) : sponsor.name;
  const construction = paidConstructionItems(proposal, ctx);
  const feeItem: PaidFee | null = old && feePaidBySponsor > 0 ? { kind: "current_fee", key: old.id, level: 0, cost: feePaidBySponsor } : null;
  const advance = (items: AdvanceItem[]): string => JSON.stringify({ items, startOffsetMonths: progress } satisfies ContractAdvance);

  const newExists: Guard = { sql: "EXISTS (SELECT 1 FROM sponsor_contracts WHERE id = ?)", params: [contractId] };
  const oldActive: Guard | null = replaced ? {
    sql: `${newExists.sql} AND EXISTS (SELECT 1 FROM sponsor_contracts WHERE id = ? AND status = 'active')`,
    params: [contractId, replaced.id],
  } : null;

  const stmts: D1PreparedStatement[] = [
    db.prepare(
      `INSERT INTO sponsor_contracts (id, team_id, sponsor_name, sponsor_type, monthly_amount, win_bonus, seasons_total,
         seasons_remaining, early_termination_fee, is_naming_rights, category, sponsor_id, signing_bonus, paid_construction, negotiation_id)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?
       WHERE (? != 'main' OR ${MAIN_SPONSOR_FREE_SQL}) AND ${OTHER_ACTIVE_IN_CATEGORY_FREE_SQL}`,
    ).bind(
      contractId, teamId, contractName, sponsor.type, d.monthly, d.winBonus, proposal.seasons, proposal.seasons,
      earlyTerminationFee({ monthly: d.monthly, seasons: proposal.seasons }), neg.category, sponsor.id, d.signingBonus,
      advance([...construction, ...(feeItem ? [feeItem] : [])]), neg.id,
      neg.category, ...mainSponsorFreeParams(sponsor.id, teamId),
      teamId, neg.category, replaced?.id ?? "",
    ),
  ];
  // Peníze: nejdřív příjmy, potom výdaje. Za starou smlouvu jen dokud je pořád aktivní.
  if (oldActive && feePaidBySponsor > 0) {
    stmts.push(...moneyStatements(db, teamId, "sponsor_signing", feePaidBySponsor,
      `${sponsor.name} zaplatil výpovědní pokutu za ${replaced?.sponsor_name ?? "předchozího sponzora"}`, gameDate, `sponsor-fee-${contractId}`, oldActive));
  }
  if (d.signingBonus > 0) {
    stmts.push(...moneyStatements(db, teamId, "sponsor_signing", d.signingBonus,
      `Příspěvek za podpis: ${sponsor.name}`, gameDate, `sponsor-bonus-${contractId}`, newExists));
  }
  if (oldActive && switchFee > 0) {
    stmts.push(...moneyStatements(db, teamId, "sponsor_termination", -switchFee,
      `Výpovědní pokuta: ${replaced?.sponsor_name ?? ""}`, gameDate, `sponsor-switch-${contractId}`, oldActive));
  }
  if (oldActive && clawback > 0) {
    stmts.push(...moneyStatements(db, teamId, "sponsor_termination", -clawback,
      `Vrácení nesplacené zálohy: ${replaced?.sponsor_name ?? ""}`, gameDate, `sponsor-clawback-${replaced?.id ?? ""}`, oldActive));
  }
  // Zaplacená stavba a vybavení: podmíněně na úroveň, výsledek se čte z dávky.
  const constructionIdx: Array<{ item: PaidConstruction; idx: number | null }> = construction.map((item) => {
    const stmt = paidConstructionStatement(db, teamId, item, newExists);
    if (!stmt) {
      logger.error({ module: "sponsors", teamId }, `neznámé zařízení nebo vybavení ${item.key} v podmínkách sponzora`);
      return { item, idx: null };
    }
    stmts.push(stmt);
    return { item, idx: stmts.length - 1 };
  });
  // Sliby pro etapu 3: se smlouvou, nebo vůbec.
  const rows = buildPromiseRows(proposal, ctx, gameDate);
  for (const r of rows) {
    stmts.push(db.prepare(
      `INSERT INTO sponsor_promises (id, contract_id, team_id, sponsor_id, kind, params, season, deadline_game_date, value_share, reward, penalty)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${newExists.sql}`,
    ).bind(crypto.randomUUID(), contractId, teamId, sponsor.id, r.kind, JSON.stringify(r.params), r.season,
      r.deadlineGameDate, r.valueShare, r.reward, r.penalty, ...newExists.params));
  }
  // Ostatní běžící jednání v téže kategorii ztratila smysl.
  stmts.push(db.prepare(
    `UPDATE sponsor_negotiations SET status = 'expired'
     WHERE team_id = ? AND category = ? AND status IN ('open','accepted') AND id != ? AND ${newExists.sql}`,
  ).bind(teamId, neg.category, neg.id, ...newExists.params));
  // Sliby staré smlouvy (jen dokud je pořád aktivní, stejně jako platby za ni). Neaktivní smlouvu
  // už nikdo nevyhodnotí, takže by prodloužení nebo přechod sliby poslední sezóny obešly.
  // Prodloužení: čekající sliby (kromě exkluzivity oboru, tu má každá smlouva vlastní) přejdou
  // na novou smlouvu a vyhodnotí se normálně — ale jen ty, které nová smlouva ještě nemá vlastní:
  // termínové (season IS NULL) a sezónní do aktuální sezóny včetně. Sezónní sliby nové smlouvy
  // (buildPromiseRows) totiž začínají až sezónou season + 1 (viz negotiation.ts), takže sliby staré
  // smlouvy pro pozdější sezóny by se přesunem zdvojily. Zůstanou na staré (teď 'expired') smlouvě
  // a nikdy se nevyhodnotí (PENDING_SELECT v promise-runs.ts bere jen sc.status = 'active') — což je
  // v pořádku, novou smlouvu na tytéž budoucí sezóny už pokrývají její vlastní čerstvé sliby.
  // Přechod k jiné firmě: sliby aktuální sezóny a termínové sliby propadnou s plnou pokutou,
  // bez počítání porušení (promise-forfeit.ts).
  let movedIdx: number | null = null;
  if (replaced && oldActive && st.isRenewal) {
    stmts.push(db.prepare(
      `UPDATE sponsor_promises SET contract_id = ?
       WHERE contract_id = ? AND status = 'pending' AND kind != 'sector_exclusivity'
         AND (season IS NULL OR season <= ?) AND ${oldActive.sql}`,
    ).bind(contractId, replaced.id, season, ...oldActive.params));
    movedIdx = stmts.length - 1;
  }
  if (old && oldActive && forfeit && forfeit.rows.length > 0) {
    const { forfeitStatements } = await import("./promise-forfeit");
    stmts.push(...forfeitStatements(db, {
      teamId, sponsorName: old.sponsor_name, rows: forfeit.rows, gameDate, guard: oldActive, cupTotalRounds: forfeit.cupTotalRounds,
    }));
  }
  // Stará smlouva končí až po platbách a slibech (ty se ptají, jestli je pořád aktivní).
  let oldIdx: number | null = null;
  if (replaced && oldActive) {
    stmts.push(db.prepare(`UPDATE sponsor_contracts SET status = ? WHERE id = ? AND status = 'active' AND ${newExists.sql}`)
      .bind(st.isRenewal ? "expired" : "terminated", replaced.id, ...newExists.params));
    oldIdx = stmts.length - 1;
  }

  let results: D1Result[];
  try {
    results = await db.batch(stmts);
  } catch (e) {
    logger.error({ module: "sponsors", teamId }, `podpis z jednání ${neg.id} selhal, nic se nezapsalo, jednání se vrací do stavu ${neg.status}`, e);
    await releaseClaim();
    throw e;
  }
  const changed = (i: number | null) => i !== null && (results[i]?.meta?.changes ?? 0) === 1;
  if (!changed(0)) {
    await releaseClaim();
    const other = await db.prepare(
      `SELECT sponsor_name FROM sponsor_contracts WHERE team_id = ? AND status = 'active' AND COALESCE(category, 'main') = ? AND id != ? LIMIT 1`,
    ).bind(teamId, neg.category, replaced?.id ?? "").first<{ sponsor_name: string }>()
      .catch((e) => { logger.warn({ module: "sponsors", teamId }, "zjištění souběžně podepsané smlouvy", e); return null; });
    if (other) return { ok: false, error: `Mezitím jsi podepsal smlouvu s firmou ${other.sponsor_name}, načti stránku znovu`, status: 409 };
    return { ok: false, error: `${sponsor.name} právě podepsal s jiným klubem`, status: 409 };
  }
  const oldEnded = changed(oldIdx);
  if (replaced && !oldEnded) {
    logger.warn({ module: "sponsors", teamId }, `stará smlouva ${replaced.id} už mezitím skončila, pokuta ani vratka se neúčtovaly`);
  }

  const applied: PaidConstruction[] = [];
  for (const { item, idx } of constructionIdx) {
    if (changed(idx)) {
      applied.push(item);
    } else if (idx !== null) {
      logger.error({ module: "sponsors", teamId }, `${item.kind === "stadium" ? "stavba" : "vybavení"} od sponzora ${item.key} na ${item.level} se nezapsalo, úroveň se mezitím změnila`);
    }
  }
  const keptFee = feeItem && oldEnded ? [feeItem] : [];
  if (applied.length !== construction.length || (feeItem && !oldEnded)) {
    // Co se nezapsalo nebo nezaplatilo, nepatří do zálohy, kterou by klub při výpovědi vracel.
    await db.prepare("UPDATE sponsor_contracts SET paid_construction = ? WHERE id = ?")
      .bind(advance([...applied, ...keptFee]), contractId).run()
      .catch((e) => logger.error({ module: "sponsors", teamId }, `oprava paid_construction smlouvy ${contractId} selhala`, e));
  }
  for (const item of applied.filter((i) => i.kind === "equipment")) {
    // Inzerát v bazaru se váže na konkrétní úroveň, po vylepšení už nesedí (stejně jako POST /equipment/upgrade).
    await db.prepare("UPDATE equipment_listings SET status = 'withdrawn', resolved_at = ? WHERE team_id = ? AND category = ? AND status = 'active'")
      .bind(new Date().toISOString(), teamId, item.key).run()
      .catch((e) => logger.warn({ module: "sponsors", teamId }, "stažení inzerátu po vybavení od sponzora", e));
  }

  let newTeamName: string | null = null;
  let reputationPenalty = 0;
  if (neg.category === "main" && !st.isRenewal) {
    newTeamName = (await applyMainSponsorRename(db, teamId, sponsor.name, season, { freeSwitch: freeRename })).newName;
    reputationPenalty = freeRename ? 0 : 3;
  }
  if (neg.category === "stadium" && !st.isRenewal) await applyStadiumRename(db, teamId, contractName, contractId);

  if (neg.category === "main") {
    // Odcházející majitel se rozloučí, nový přivítá. Doručení hlídá denní limit fronty.
    try {
      const { enqueueMainSponsorSms } = await import("./owner-sms-triggers");
      if (old && oldEnded && old.sponsor_id != null) await enqueueMainSponsorSms(db, teamId, old.sponsor_id, "main_lost", `main-lost:${old.id}`);
      if (!st.isRenewal) await enqueueMainSponsorSms(db, teamId, sponsor.id, "main_new", `main-new:${contractId}`, { deliverNow: true });
    } catch (e) {
      logger.warn({ module: "sponsors", teamId }, "SMS majitelů při podpisu hlavního sponzora", e);
    }
  }

  const moved = movedIdx !== null ? (results[movedIdx]?.meta?.changes ?? 0) : 0;
  logger.info({ module: "sponsors", teamId },
    `podpis z jednání ${neg.id}: smlouva ${contractId}, ${neg.category}, ${proposal.seasons} sez., ${d.monthly} Kč/měs, slibů ${rows.length}`
    + `${st.isRenewal ? `, prodloužení (přesunuto slibů ${moved})` : ""}${oldEnded && clawback > 0 ? `, vratka zálohy ${clawback}` : ""}`
    + `${oldEnded && forfeitTotal > 0 ? `, propadlé sliby ${forfeit?.rows.length ?? 0} za ${forfeitTotal}` : ""}`);
  return { ok: true, contractId, newTeamName, reputationPenalty };
}
