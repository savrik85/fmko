/**
 * Disciplinární řízení soutěže.
 *
 * Návrh na pokutu jde podat jen na skutek, který se dá v datech DOLOŽIT. Bez toho
 * by se sedm klubů domluvilo a jeden cíl praly celou sezónu — a nikdo by nepoznal,
 * jestli se něco stalo, nebo se jen někdo nudil. Důkaz vidí všichni při hlasování.
 *
 * Jediná výjimka je volná položka „nesportovní chování": nemá důkaz, a proto má
 * tvrdší podmínky — dvoutřetinovou většinu, jednou za sezónu na klub, a kdo ji
 * podá neúspěšně, přijde o kauci.
 */

import { logger } from "../lib/logger";
import { QUALIFIED_MAJORITY, SIMPLE_MAJORITY } from "./defaults";
import { recordCompetitionEntry } from "./ledger";

const M = "competition-discipline";

/** Kolik pokut smí jeden klub schytat za sezónu, než ho soutěž nechá být. */
export const MAX_FINES_PER_TEAM = 2;
/** Do kolika zasedání se dá proti pokutě odvolat. */
export const APPEAL_WINDOW_MEETINGS = 2;
/** Strop pokuty, kterou předseda disciplinární rady uloží sám. */
export const CHAIR_FINE_LIMIT = 3_000;
/** Kolikrát za sezónu to smí udělat. */
export const CHAIR_FINE_COUNT = 4;
/** Nad tímhle heatem je vztah tak vyhrocený, že předseda musí na hlasování. */
export const CHAIR_HEAT_LIMIT = 60;

export const FINE_MIN = 1_000;
export const FINE_MAX = 15_000;

export interface Offence {
  kind: string;
  label: string;
  /** Co přesně se dokládá — jde do karty návrhu, aby to viděli všichni. */
  evidenceLabel: string;
  majority: number;
  /** Bez důkazu = tvrdší podmínky. */
  freeText?: boolean;
}

export const OFFENCES: Record<string, Offence> = {
  pitch: {
    kind: "pitch",
    label: "Neudržované hřiště",
    evidenceLabel: "stav trávníku pod 30",
    majority: QUALIFIED_MAJORITY,
  },
  cards: {
    kind: "cards",
    label: "Hrubá nedisciplinovanost",
    evidenceLabel: "tři a více červených karet za sezónu",
    majority: QUALIFIED_MAJORITY,
  },
  transfer: {
    kind: "transfer",
    label: "Podezřelý přestup",
    evidenceLabel: "přestup mezi kluby stejného majitele",
    majority: QUALIFIED_MAJORITY,
  },
  referee_abuse: {
    kind: "referee_abuse",
    label: "Opakované napadání rozhodčích",
    evidenceLabel: "dvakrát a víckrát kritika sudího v pozápasovém rozhovoru",
    majority: QUALIFIED_MAJORITY,
  },
  bet_manipulation: {
    kind: "bet_manipulation",
    label: "Manipulace se sázkami",
    // Strojová detekce domluvy nefunguje a falešné obvinění je horší než
    // přehlédnutý obchod. Navrhovatel doloží sám z knihy sázek.
    evidenceLabel: "bez strojového důkazu — navrhovatel doloží sám",
    majority: QUALIFIED_MAJORITY,
    freeText: true,
  },
  other: {
    kind: "other",
    label: "Nesportovní chování",
    evidenceLabel: "bez důkazu — rozhodne zasedání",
    majority: QUALIFIED_MAJORITY,
    freeText: true,
  },
};

const PITCH_THRESHOLD = 30;
const RED_CARD_THRESHOLD = 3;
const CRITICISM_THRESHOLD = 2;

export interface EvidenceItem {
  kind: string;
  label: string;
  /** Konkrétní doložení, které uvidí hlasující. */
  detail: string;
}

/**
 * Co se dá klubu právě teď doložit. Vrací jen skutky, které opravdu nastaly —
 * formulář z toho udělá seznam a nic jiného nabídnout nemůže.
 */
export async function collectEvidence(
  db: D1Database, teamId: string,
): Promise<EvidenceItem[]> {
  const out: EvidenceItem[] = [];

  const pitch = await db.prepare("SELECT pitch_condition FROM stadiums WHERE team_id = ?")
    .bind(teamId).first<{ pitch_condition: number }>()
    .catch((e) => { logger.warn({ module: M }, "stav hřiště", e); return null; });
  if (pitch && pitch.pitch_condition < PITCH_THRESHOLD) {
    out.push({
      kind: "pitch", label: OFFENCES.pitch.label,
      detail: `Stav trávníku ${pitch.pitch_condition} ze 100 — pod hranicí ${PITCH_THRESHOLD}.`,
    });
  }

  const reds = await db.prepare(
    "SELECT COALESCE(SUM(red_cards), 0) AS n FROM referee_team_relations WHERE team_id = ?"
  ).bind(teamId).first<{ n: number }>()
    .catch((e) => { logger.warn({ module: M }, "červené karty", e); return null; });
  if (reds && reds.n >= RED_CARD_THRESHOLD) {
    out.push({
      kind: "cards", label: OFFENCES.cards.label,
      detail: `${reds.n} ${reds.n < 5 ? "červené karty" : "červených karet"} v sezóně.`,
    });
  }

  // Přestup mezi kluby stejného majitele — přesně to, co se v soutěži hlídá.
  const suspicious = await db.prepare(
    `SELECT COUNT(*) AS n FROM transfer_offers o
       JOIN teams f ON f.id = o.from_team_id
       JOIN teams t ON t.id = o.to_team_id
      WHERE o.status = 'accepted' AND f.user_id = t.user_id AND f.user_id != 'ai'
        AND (o.from_team_id = ? OR o.to_team_id = ?)`
  ).bind(teamId, teamId).first<{ n: number }>()
    .catch((e) => { logger.warn({ module: M }, "podezřelé přestupy", e); return null; });
  if (suspicious && suspicious.n > 0) {
    out.push({
      kind: "transfer", label: OFFENCES.transfer.label,
      detail: `${suspicious.n}× obchod s klubem stejného majitele.`,
    });
  }

  const criticism = await db.prepare(
    `SELECT COUNT(*) AS n FROM coach_interviews
      WHERE team_id = ? AND kind = 'post_match' AND analysis IS NOT NULL
        AND json_extract(analysis, '$.rozhodci.postoj') = 'kritika'`
  ).bind(teamId).first<{ n: number }>()
    .catch((e) => { logger.warn({ module: M }, "kritika rozhodčích", e); return null; });
  if (criticism && criticism.n >= CRITICISM_THRESHOLD) {
    out.push({
      kind: "referee_abuse", label: OFFENCES.referee_abuse.label,
      detail: `${criticism.n}× kritika sudího v pozápasovém rozhovoru.`,
    });
  }

  return out;
}

export interface FineCheck { ok: boolean; reason?: string }

/**
 * Smí se na tenhle klub podat návrh na pokutu?
 *
 * Strop dvou pokut za sezónu je brzda proti tomu, aby se soutěž sesypala na jeden
 * terč. Kdo už dvě má, je pro tuhle sezónu vyřízený — ať udělal cokoliv.
 */
export async function canFine(
  db: D1Database, leagueId: string, targetTeamId: string, seasonNumber: number, kind: string,
): Promise<FineCheck> {
  const offence = OFFENCES[kind];
  if (!offence) return { ok: false, reason: "Neznámý skutek." };

  // Pokuty z kontroly pravidel se do stropu nepočítají — jinak by stačilo dvakrát
  // porušit pravidlo a klub by byl na zbytek sezóny nedotknutelný pro hlasování.
  //
  // Manipulace se sázkami je ze stropu vyjmutá ze stejného důvodu: klub, který
  // dostal dvě pokuty za neposekaný trávník, nesmí být nedotknutelný pro
  // obvinění z domluvy. Je to jiná váha provinění.
  if (kind !== "bet_manipulation") {
    const issued = await db.prepare(
      `SELECT COUNT(*) AS n FROM competition_sanctions
        WHERE league_id = ? AND team_id = ? AND season_number = ?
          AND status IN ('issued','appealed','paid') AND issued_by IN ('vote','chair')
          AND kind <> 'bet_manipulation'`
    ).bind(leagueId, targetTeamId, seasonNumber).first<{ n: number }>()
      .catch((e) => { logger.warn({ module: M }, "počet pokut klubu", e); return null; });
    if ((issued?.n ?? 0) >= MAX_FINES_PER_TEAM) {
      return { ok: false, reason: `Tenhle klub už letos dostal ${MAX_FINES_PER_TEAM} pokuty. Víc jich soutěž v jedné sezóně neuloží.` };
    }
  }

  const pending = await db.prepare(
    `SELECT COUNT(*) AS n FROM competition_proposals
      WHERE league_id = ? AND target_team_id = ? AND status = 'open' AND kind LIKE 'sanction%'`
  ).bind(leagueId, targetTeamId).first<{ n: number }>()
    .catch((e) => { logger.warn({ module: M }, "otevřené návrhy na pokutu", e); return null; });
  if ((pending?.n ?? 0) > 0) {
    return { ok: false, reason: "Na tenhle klub už jeden návrh na pokutu na programu je." };
  }

  if (offence.freeText) {
    // Strop se počítá pro KAŽDÝ volný skutek zvlášť. Dřív tu bylo natvrdo
    // kind = 'other', takže by manipulace se sázkami sdílela počítadlo
    // s nesportovním chováním a jedno by blokovalo druhé.
    const used = await db.prepare(
      `SELECT COUNT(*) AS n FROM competition_sanctions
        WHERE league_id = ? AND team_id = ? AND season_number = ? AND kind = ?`
    ).bind(leagueId, targetTeamId, seasonNumber, kind).first<{ n: number }>()
      .catch((e) => { logger.warn({ module: M }, `volné pokuty (${kind})`, e); return null; });
    if ((used?.n ?? 0) > 0) {
      return { ok: false, reason: `${offence.label} se dá tomuhle klubu vytknout jen jednou za sezónu.` };
    }
  }

  return { ok: true };
}

export interface IssueSanctionOpts {
  leagueId: string;
  seasonNumber: number;
  teamId: string;
  amount: number;
  kind: string;
  reason: string;
  evidence: string | null;
  issuedBy: "vote" | "chair" | "rule";
  issuedByTeamId: string | null;
  proposalId: string | null;
  gameDate: string;
  /**
   * Stabilní klíč pro pokuty, které padají samy (kontrola pravidel). Bez něj by
   * opakovaný běh téhož zasedání udělil pokutu podruhé.
   */
  referenceId?: string | null;
}

/**
 * Uloží pokutu: záznam, stržení klubu, příjem pokladny a SMS.
 *
 * Peníze se strhnou i při záporném rozpočtu — pokuta není nákup a nezaplatit ji nejde.
 * Idempotence drží na id sankce, které je zároveň reference_id obou zápisů.
 */
export async function issueSanction(db: D1Database, opts: IssueSanctionOpts): Promise<string | null> {
  const id = crypto.randomUUID();
  const amount = Math.max(0, Math.round(opts.amount));
  if (amount <= 0) return null;

  const res = await db.prepare(
    `INSERT OR IGNORE INTO competition_sanctions
      (id, league_id, season_number, team_id, kind, amount, reason, evidence,
       issued_by, issued_by_team_id, proposal_id, appeal_deadline_gd, game_date, reference_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    id, opts.leagueId, opts.seasonNumber, opts.teamId, opts.kind, amount,
    opts.reason, opts.evidence, opts.issuedBy, opts.issuedByTeamId,
    opts.proposalId, null, opts.gameDate, opts.referenceId ?? null,
  ).run().catch((e) => { logger.error({ module: M }, "zápis sankce", e); return null; });
  if (!res) return null;
  // Klíč už v tabulce byl — tuhle pokutu někdo udělil dřív a peníze se hnuly s ní.
  if ((res.meta?.changes ?? 0) === 0) return null;

  const { recordTransaction } = await import("../season/finance-processor");
  await recordTransaction(
    db, opts.teamId, "disciplinary_fine", -amount,
    `Pokuta disciplinární rady: ${opts.reason}`, opts.gameDate, `sanc-${id}`,
  ).catch((e) => logger.error({ module: M }, `stržení pokuty klubu ${opts.teamId}`, e));

  await recordCompetitionEntry(db, {
    leagueId: opts.leagueId, seasonNumber: opts.seasonNumber, type: "sanction",
    amount, description: `Pokuta: ${opts.reason}`, teamId: opts.teamId,
    gameDate: opts.gameDate, referenceId: `sanc-${id}`,
  });

  try {
    const { sendSystemSMS } = await import("../messaging/system-sms");
    await sendSystemSMS(db, opts.teamId, "Disciplinární rada",
      `Byla vám uložena pokuta ${amount.toLocaleString("cs")} Kč — ${opts.reason}. `
      + `Proti rozhodnutí se můžeš odvolat na nejbližším zasedání grémia.`);
  } catch (e) {
    logger.warn({ module: M }, "SMS o pokutě", e);
  }

  await afterSanction(db, opts.leagueId, opts.teamId, opts.seasonNumber);
  return id;
}

/**
 * Následky pro potrestaný klub. Kdo schytá druhou pokutu v sezóně, má u rozhodčích
 * kredit — soutěž ho zjevně pere a sudí to vidí taky.
 */
async function afterSanction(
  db: D1Database, leagueId: string, teamId: string, seasonNumber: number,
): Promise<void> {
  const count = await db.prepare(
    `SELECT COUNT(*) AS n FROM competition_sanctions
      WHERE league_id = ? AND team_id = ? AND season_number = ?`
  ).bind(leagueId, teamId, seasonNumber).first<{ n: number }>()
    .catch(() => null);
  if ((count?.n ?? 0) < MAX_FINES_PER_TEAM) return;

  await db.prepare(
    `UPDATE referee_team_relations
        SET sentiment = MIN(100, sentiment + 10),
            duvod = 'Kluky z okresu zjevně perou, budu shovívavější.'
      WHERE team_id = ?`
  ).bind(teamId).run()
    .catch((e) => logger.warn({ module: M }, "sentiment rozhodčích po druhé pokutě", e));
}

/** Vrátí pokutu při úspěšném odvolání. Peníze putují z pokladny zpátky klubu. */
export async function refundSanction(
  db: D1Database, sanctionId: string, gameDate: string,
): Promise<boolean> {
  const s = await db.prepare(
    "SELECT * FROM competition_sanctions WHERE id = ? AND status IN ('issued','appealed')"
  ).bind(sanctionId).first<{
    id: string; league_id: string; season_number: number; team_id: string; amount: number; reason: string;
  }>().catch((e) => { logger.warn({ module: M }, "načtení sankce", e); return null; });
  if (!s) return false;

  const locked = await db.prepare(
    "UPDATE competition_sanctions SET status = 'overturned' WHERE id = ? AND status IN ('issued','appealed')"
  ).bind(sanctionId).run()
    .catch((e) => { logger.warn({ module: M }, "zrušení sankce", e); return null; });
  if (!locked || (locked.meta?.changes ?? 0) === 0) return false;

  const entry = await recordCompetitionEntry(db, {
    leagueId: s.league_id, seasonNumber: s.season_number, type: "sanction",
    amount: -s.amount, description: `Vrácení pokuty po odvolání: ${s.reason}`,
    teamId: s.team_id, gameDate, referenceId: `sanc-refund-${s.id}`,
  });
  if (!entry.written) return true;   // už vráceno dřív

  const { recordTransaction } = await import("../season/finance-processor");
  await recordTransaction(
    db, s.team_id, "disciplinary_fine", s.amount,
    `Vrácení pokuty po úspěšném odvolání`, gameDate, `sanc-refund-${s.id}`,
  ).catch((e) => logger.error({ module: M }, `vrácení pokuty klubu ${s.team_id}`, e));

  try {
    const { sendSystemSMS } = await import("../messaging/system-sms");
    await sendSystemSMS(db, s.team_id, "Disciplinární rada",
      `Odvolání vyhověno — pokuta ${s.amount.toLocaleString("cs")} Kč vám byla vrácena.`);
  } catch (e) {
    logger.warn({ module: M }, "SMS o vrácení pokuty", e);
  }
  return true;
}

/**
 * Smí předseda disciplinární rady uložit pokutu sám?
 *
 * Nesmí trestat vlastní klub ani klub, se kterým má vyhrocený vztah — bez toho
 * je z funkce jen zbraň proti rivalovi.
 */
export async function canChairFine(
  db: D1Database, leagueId: string, chairTeamId: string, targetTeamId: string,
  seasonNumber: number, amount: number, asPresident = false,
): Promise<FineCheck> {
  if (chairTeamId === targetTeamId) {
    return { ok: false, reason: "Vlastní klub potrestat nemůžeš. Podej návrh a nech rozhodnout zasedání." };
  }
  if (amount > CHAIR_FINE_LIMIT) {
    return { ok: false, reason: `Sám můžeš uložit nejvýš ${CHAIR_FINE_LIMIT.toLocaleString("cs")} Kč. Vyšší pokuta patří na zasedání.` };
  }

  // Prezident, který zastupuje neobsazenou disciplinárku, čerpá vlastní počítadlo.
  const role = asPresident ? "predseda" : "disciplinarni";
  const used = await db.prepare(
    `SELECT used_fines FROM competition_officials
      WHERE league_id = ? AND role = ? AND team_id = ? AND season_number = ? AND status = 'active'`
  ).bind(leagueId, role, chairTeamId, seasonNumber).first<{ used_fines: number }>()
    .catch((e) => { logger.warn({ module: M }, "čerpání pravomoci", e); return null; });
  if (!used) return { ok: false, reason: "Tuhle pravomoc má jen předseda disciplinární rady." };
  if (used.used_fines >= CHAIR_FINE_COUNT) {
    return { ok: false, reason: `Letos jsi tuhle pravomoc vyčerpal (${CHAIR_FINE_COUNT}×). Dál už jen přes zasedání.` };
  }

  // Vyhrocený vztah = konflikt zájmů. Existující systém vztahů manažerů to ví.
  const heat = await db.prepare(
    `SELECT heat FROM manager_relations
      WHERE (team_a = ? AND team_b = ?) OR (team_a = ? AND team_b = ?)`
  ).bind(chairTeamId, targetTeamId, targetTeamId, chairTeamId).first<{ heat: number }>()
    .catch((e) => { logger.warn({ module: M }, "vztah předsedy k cíli", e); return null; });
  if ((heat?.heat ?? 0) >= CHAIR_HEAT_LIMIT) {
    return { ok: false, reason: "S tímhle klubem máš příliš vyhrocený vztah. Návrh musí projít zasedáním." };
  }

  return { ok: true };
}

export { SIMPLE_MAJORITY };
