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
 *  - `paid_construction`: JSON pole AdvanceItem (stavba, vybavení a zaplacená pokuta s cenou),
 *  - vyplacené bonusy za termínové sliby = součet `reward` řádků `sponsor_promises` té smlouvy
 *    se `status = 'fulfilled'` u termínových druhů (etapa 3 bonus vyplácí právě při splnění).
 */
import { logger } from "../lib/logger";
import { CATEGORIES } from "../equipment/equipment-generator";
import { recordTransaction } from "../season/finance-processor";
import { FACILITY_LABELS } from "../stadium/stadium-generator";
import { MONTHS_PER_SEASON } from "./ambition";
import { MAIN_SPONSOR_FREE_SQL } from "./exclusivity";
import {
  advanceClawback, buildPromiseRows, constructionCost, contractMonths, earlyTerminationFee, equipmentCost, oneTimeTotal,
  type NegotiationContext, type Proposal,
} from "./negotiation";
import {
  contractBlock, loadNegotiationState, pendingTerms, prorataTerminationFee, teamGameDate, type Fail, type NegotiationState,
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

/** Součty cen v `paid_construction` podle druhu (neplatný JSON = nuly a varování v logu). */
export function advanceItemsTotals(raw: string | null | undefined, contractId: string): { construction: number; equipment: number; paidFee: number } {
  const out = { construction: 0, equipment: 0, paidFee: 0 };
  if (!raw) return out;
  let items: unknown;
  try {
    items = JSON.parse(raw);
  } catch (e) {
    logger.warn({ module: "sponsors" }, `neplatný paid_construction u smlouvy ${contractId}`, e);
    return out;
  }
  if (!Array.isArray(items)) return out;
  for (const i of items as Array<{ kind?: unknown; cost?: unknown } | null>) {
    const cost = typeof i?.cost === "number" && Number.isFinite(i.cost) ? i.cost : 0;
    if (i?.kind === "stadium") out.construction += cost;
    else if (i?.kind === "equipment") out.equipment += cost;
    else if (i?.kind === "current_fee") out.paidFee += cost;
  }
  return out;
}

/** Kolik měsíců smlouvy uplynulo: celé sezóny od podpisu (rollover snižuje seasons_remaining). */
export function contractMonthsElapsed(seasonsTotal: number, seasonsRemaining: number): number {
  return Math.max(0, seasonsTotal - seasonsRemaining) * MONTHS_PER_SEASON;
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
 * Vratka zálohy při předčasném konci smlouvy klubem. Smlouvy z dřívějších pevných nabídek
 * (bez jednání) žádnou zálohu nemají, vratka je 0.
 */
export async function contractClawback(db: D1Database, c: AdvanceContract): Promise<number> {
  if (!c.negotiation_id) return 0;
  const total = oneTimeTotal({
    signingBonus: c.signing_bonus ?? 0,
    ...advanceItemsTotals(c.paid_construction, c.id),
    deadlineGoalBonuses: await paidDeadlineGoalBonuses(db, c.id),
  });
  return advanceClawback({
    oneTimeTotal: total,
    contractMonths: contractMonths(c.seasons_total),
    monthsElapsed: contractMonthsElapsed(c.seasons_total, c.seasons_remaining),
  });
}

async function loadAdvanceContract(db: D1Database, contractId: string): Promise<AdvanceContract | null> {
  return db.prepare(
    "SELECT id, seasons_total, seasons_remaining, signing_bonus, paid_construction, negotiation_id FROM sponsor_contracts WHERE id = ?",
  ).bind(contractId).first<AdvanceContract>();
}

/** Nový hlavní sponzor: klub nese jeho jméno, −3 reputace, pohár, U21 a zpráva do ligy. */
export async function applyMainSponsorRename(
  db: D1Database, teamId: string, sponsorName: string, season: number,
): Promise<{ oldName: string; newName: string }> {
  const teamInfo = await db.prepare("SELECT name, village_id FROM teams WHERE id = ?")
    .bind(teamId).first<{ name: string; village_id: string }>();
  const village = teamInfo
    ? await db.prepare("SELECT name FROM villages WHERE id = ?").bind(teamInfo.village_id).first<{ name: string }>()
      .catch((e) => { logger.warn({ module: "sponsors", teamId }, "fetch village for sponsor rename", e); return null; })
    : null;
  const oldName = teamInfo?.name ?? "";
  const newName = `FK ${sponsorName} ${village?.name ?? ""}`.trim();
  // Přejmenování podle sponzora fanoušky nepotěší (-3).
  await db.prepare("UPDATE teams SET name = ?, last_main_sponsor_change_season = ? WHERE id = ?")
    .bind(newName, season, teamId).run();
  const { applyReputationDelta } = await import("../lib/reputation");
  await applyReputationDelta(db, teamId, -3, "sponsor", "Přejmenování klubu podle sponzora",
    { referenceId: `sponsor-rename-${teamId}-s${season}` });
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
  await db.prepare(
    "INSERT INTO news (id, league_id, type, headline, body, created_at) VALUES (?, (SELECT league_id FROM teams WHERE id = ?), 'rename', ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))",
  ).bind(crypto.randomUUID(), teamId,
    `${oldName} mění název na ${newName}`,
    `Klub ${oldName} podepsal sponzorskou smlouvu s ${sponsorName} a mění svůj název na ${newName}. Fanoušci nejsou nadšení (-3 reputace).`,
  ).run().catch((e) => logger.warn({ module: "sponsors", teamId }, "insert sponsor rename news", e));
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

/** Stavba nebo vybavení zaplacené sponzorem: úroveň o stupeň výš, bez účtování klubu. Vrací, jestli se zapsala. */
async function applyPaidConstruction(db: D1Database, teamId: string, item: PaidConstruction): Promise<boolean> {
  if (item.kind === "stadium") {
    // Sloupec jen z whitelistu FACILITY_LABELS, stejně jako POST /stadium/upgrade.
    if (!(item.key in FACILITY_LABELS)) {
      logger.error({ module: "sponsors", teamId }, `neznámé zařízení ${item.key} v podmínkách sponzora`);
      return false;
    }
    const res = await db.prepare(`UPDATE stadiums SET ${item.key} = ? WHERE team_id = ? AND ${item.key} = ?`)
      .bind(item.level, teamId, item.level - 1).run();
    if ((res.meta?.changes ?? 0) !== 1) {
      logger.error({ module: "sponsors", teamId }, `stavba od sponzora ${item.key} na ${item.level} se nezapsala, úroveň se mezitím změnila`);
      return false;
    }
    return true;
  }
  if (!(CATEGORIES as readonly string[]).includes(item.key)) {
    logger.error({ module: "sponsors", teamId }, `neznámé vybavení ${item.key} v podmínkách sponzora`);
    return false;
  }
  const res = await db.prepare(`UPDATE equipment SET ${item.key} = ?, ${item.key}_condition = 100 WHERE team_id = ? AND ${item.key} = ?`)
    .bind(item.level, teamId, item.level - 1).run();
  if ((res.meta?.changes ?? 0) !== 1) {
    logger.error({ module: "sponsors", teamId }, `vybavení od sponzora ${item.key} na ${item.level} se nezapsalo, úroveň se mezitím změnila`);
    return false;
  }
  // Inzerát v bazaru se váže na konkrétní úroveň, po vylepšení už nesedí (stejně jako POST /equipment/upgrade).
  await db.prepare("UPDATE equipment_listings SET status = 'withdrawn', resolved_at = ? WHERE team_id = ? AND category = ? AND status = 'active'")
    .bind(new Date().toISOString(), teamId, item.key).run()
    .catch((e) => logger.warn({ module: "sponsors", teamId }, "stažení inzerátu po vybavení od sponzora", e));
  return true;
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
  const valid = validateProposal(terms, ctx);
  if (!valid.ok) return { ok: false, error: `Tyhle podmínky už podepsat nejde: ${valid.error}`, status: 409 };
  // Otevřené jednání negotiationAvailability znovu neověřuje: okres, okno prodloužení,
  // změna hlavního sponzora jednou za sezónu a exkluzivita se proto kontrolují až tady.
  const block = await contractBlock(db, team, sponsor, neg.category, season, st.contracts);
  if (block) return { ok: false, error: block, status: 409 };

  const proposal = valid.proposal;
  const d = proposal.demands;
  const gameDate = teamGameDate(team);
  // Přechod k jiné firmě: stará smlouva končí výpovědí, klub platí poměrnou pokutu a vrací
  // nesplacenou zálohu, když ji stará smlouva měla (stejně jako výpověď klubem).
  const old = st.contracts.active && !st.isRenewal ? st.contracts.active : null;
  const switchFee = old ? prorataTerminationFee(old) : 0;
  const oldAdvance = old ? await loadAdvanceContract(db, old.id) : null;
  const oldClawback = oldAdvance ? await contractClawback(db, oldAdvance) : 0;
  const feePaidBySponsor = d.payCurrentFee ? switchFee : 0;
  if (team.budget + d.signingBonus + feePaidBySponsor < switchFee + oldClawback) {
    const what = oldClawback > 0 ? `výpovědní pokutu a vrácení zálohy (${switchFee + oldClawback} Kč)` : `výpovědní pokutu ${switchFee} Kč`;
    return { ok: false, error: `Na ${what} u ${old?.sponsor_name ?? "současného sponzora"} nemáš peníze`, status: 400 };
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
  const advanceItems: AdvanceItem[] = [...construction, ...(feeItem ? [feeItem] : [])];
  let inserted: boolean;
  try {
    const ins = await db.prepare(
      `INSERT INTO sponsor_contracts (id, team_id, sponsor_name, sponsor_type, monthly_amount, win_bonus, seasons_total,
         seasons_remaining, early_termination_fee, is_naming_rights, category, sponsor_id, signing_bonus, paid_construction, negotiation_id)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?
       WHERE ? != 'main' OR ${MAIN_SPONSOR_FREE_SQL}`,
    ).bind(
      contractId, teamId, contractName, sponsor.type, d.monthly, d.winBonus, proposal.seasons, proposal.seasons,
      earlyTerminationFee({ monthly: d.monthly, seasons: proposal.seasons }), neg.category, sponsor.id, d.signingBonus,
      advanceItems.length > 0 ? JSON.stringify(advanceItems) : null, neg.id,
      neg.category, sponsor.id, teamId,
    ).run();
    inserted = (ins.meta?.changes ?? 0) === 1;
  } catch (e) {
    logger.error({ module: "sponsors", teamId }, `zápis smlouvy z jednání ${neg.id} selhal, jednání se vrací do stavu ${neg.status}`, e);
    await releaseClaim();
    throw e;
  }
  if (!inserted) {
    await releaseClaim();
    return { ok: false, error: `${sponsor.name} právě podepsal s jiným klubem`, status: 409 };
  }

  // Stará smlouva v kategorii: při prodloužení vyprší (nahrazena), při přechodu je vypovězená.
  const replaced = st.contracts.active;
  if (replaced) {
    await db.prepare("UPDATE sponsor_contracts SET status = ? WHERE id = ? AND status = 'active'")
      .bind(st.isRenewal ? "expired" : "terminated", replaced.id).run();
  }
  // Nejdřív příjmy, potom výdaje: klub, kterému sponzor pokutu platí, nesmí na chvíli spadnout do mínusu.
  if (feePaidBySponsor > 0) {
    await recordTransaction(db, teamId, "sponsor_signing", feePaidBySponsor,
      `${sponsor.name} zaplatil výpovědní pokutu za ${old?.sponsor_name ?? "předchozího sponzora"}`, gameDate, `sponsor-fee-${contractId}`);
  }
  if (d.signingBonus > 0) {
    await recordTransaction(db, teamId, "sponsor_signing", d.signingBonus,
      `Příspěvek za podpis: ${sponsor.name}`, gameDate, `sponsor-bonus-${contractId}`);
  }
  if (old && switchFee > 0) {
    await recordTransaction(db, teamId, "sponsor_termination", -switchFee,
      `Výpovědní pokuta: ${old.sponsor_name}`, gameDate, `sponsor-switch-${contractId}`);
  }
  if (old && oldClawback > 0) {
    await recordTransaction(db, teamId, "sponsor_termination", -oldClawback,
      `Vrácení nesplacené zálohy: ${old.sponsor_name}`, gameDate, `sponsor-clawback-${old.id}`);
  }

  const applied: PaidConstruction[] = [];
  for (const item of construction) {
    if (await applyPaidConstruction(db, teamId, item)) applied.push(item);
  }
  if (applied.length !== construction.length) {
    // Co se nezapsalo, sponzor nezaplatil: nepatří do zálohy, kterou by klub při výpovědi vracel.
    const kept: AdvanceItem[] = [...applied, ...(feeItem ? [feeItem] : [])];
    await db.prepare("UPDATE sponsor_contracts SET paid_construction = ? WHERE id = ?")
      .bind(kept.length > 0 ? JSON.stringify(kept) : null, contractId).run()
      .catch((e) => logger.error({ module: "sponsors", teamId }, `oprava paid_construction smlouvy ${contractId} selhala`, e));
  }

  // Sliby pro etapu 3. Smlouva už platí; když zápis selže, musí to být v logu, ne tiše pryč.
  const rows = buildPromiseRows(proposal, ctx, gameDate);
  if (rows.length > 0) {
    try {
      await db.batch(rows.map((r) => db.prepare(
        `INSERT INTO sponsor_promises (id, contract_id, team_id, sponsor_id, kind, params, season, deadline_game_date, value_share, reward, penalty)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(crypto.randomUUID(), contractId, teamId, sponsor.id, r.kind, JSON.stringify(r.params), r.season,
        r.deadlineGameDate, r.valueShare, r.reward, r.penalty)));
    } catch (e) {
      logger.error({ module: "sponsors", teamId }, `sliby ke smlouvě ${contractId} se nezapsaly (${rows.length} řádků)`, e);
    }
  }

  // Ostatní běžící jednání v téže kategorii ztratila smysl.
  await db.prepare(
    "UPDATE sponsor_negotiations SET status = 'expired' WHERE team_id = ? AND category = ? AND status IN ('open','accepted') AND id != ?",
  ).bind(teamId, neg.category, neg.id).run()
    .catch((e) => logger.warn({ module: "sponsors", teamId }, `úklid ostatních jednání po podpisu ${neg.id}`, e));

  let newTeamName: string | null = null;
  let reputationPenalty = 0;
  if (neg.category === "main" && !st.isRenewal) {
    newTeamName = (await applyMainSponsorRename(db, teamId, sponsor.name, season)).newName;
    reputationPenalty = 3;
  }
  if (neg.category === "stadium" && !st.isRenewal) await applyStadiumRename(db, teamId, contractName, contractId);

  if (neg.category === "main") {
    // Odcházející majitel se rozloučí, nový přivítá. Doručení hlídá denní limit fronty.
    try {
      const { enqueueMainSponsorSms } = await import("./owner-sms-triggers");
      if (old?.sponsor_id != null) await enqueueMainSponsorSms(db, teamId, old.sponsor_id, "main_lost", `main-lost:${old.id}`);
      if (!st.isRenewal) await enqueueMainSponsorSms(db, teamId, sponsor.id, "main_new", `main-new:${contractId}`, { deliverNow: true });
    } catch (e) {
      logger.warn({ module: "sponsors", teamId }, "SMS majitelů při podpisu hlavního sponzora", e);
    }
  }

  logger.info({ module: "sponsors", teamId },
    `podpis z jednání ${neg.id}: smlouva ${contractId}, ${neg.category}, ${proposal.seasons} sez., ${d.monthly} Kč/měs, slibů ${rows.length}${st.isRenewal ? ", prodloužení" : ""}${oldClawback > 0 ? `, vratka zálohy ${oldClawback}` : ""}`);
  return { ok: true, contractId, newTeamName, reputationPenalty };
}
