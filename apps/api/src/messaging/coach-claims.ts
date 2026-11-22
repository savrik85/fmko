/**
 * Trenér v SMS hráči oznámí akci, kterou ve hře neudělal (rozbor SMS 2026-11-18, C7).
 *
 * Na produkci trenéři psali „Vrať poháry, sbal se a vypadni“ a „Tady už si nezahraješ“
 * (conv 12921ca5, 8. 10.), „Tak půjdeš z týmu“ (77afc9f7), „Predal jsem to policii“
 * (8f5296bd, 13. 10.), „Beru ti pásku“ (237e2f26, 30. 10.), „Dávám tě na seznam … k prodeji.
 * S platem nepočítej“ (a3cb8747, 7. 10.). Hráč odpověděl, jako by se to stalo, a ve hře se
 * nezměnilo nic: dál byl v kádru, s páskou, s platem a bez policie.
 *
 * Hra to sama neprovede (je to nevratné a rozhoduje trenér). Místo toho:
 *  1. `detectCoachClaims` pozná oznámení v SMS (věta po větě, bez otázek, výhrůžek
 *     s podmínkou „jestli…, tak letíš“ a zápory „nebudu tě dávat na prodej“).
 *  2. `loadClaimState` přečte, jak to ve hře doopravdy je (kádr, přestupová listina,
 *     incidenty a policie, kapitán, srážky).
 *  3. Hráč v promptu dostane fakt (`claimPromptLines`): stalo se, nebo „zatím se nic nestalo,
 *     ber to jako výhrůžku“. Fakt se počítá z aktuálního stavu při každé odpovědi, takže když
 *     trenér akci pak opravdu udělá, hráč to ví hned.
 *  4. Trenér pod svou zprávou uvidí poznámku jen pro sebe s odkazem, kde to udělá
 *     (`noteUnbackedClaims`), pro hráče a druh nejvýš jednou za `NOTE_REPEAT_DAYS`.
 *
 * „Nebudu tě stavět“ a „nepočítám s tebou“ jsou rozhodnutí trenéra, ne akce: poznámku
 * nedostanou, hráč je jen ví. Slova sdílí s `NOT_COUNTED_ON_RE` (hearsay/effects.ts), podle
 * kterého hráč po zápase neposílá stížnost „počítá se se mnou?“ (multiplayer/left-out.ts).
 */

import { logger } from "../lib/logger";
import { loadActiveListing } from "../transfers/listing-status";

const M = "coach-claims";
const DAY_MS = 86_400_000;

export type ClaimKind = "dismissal" | "transfer_list" | "loan_list" | "police" | "captaincy" | "wage_cut" | "not_counted_on";

// ─── Slova ──────────────────────────────────────────────────────────────────
// Části regulárního výrazu nad původním textem (s diakritikou i bez), bez rozlišení velikosti.

/** Prodej: „dávám tě na seznam nepotřebných … k prodeji“, „dám tě na přestupovou listinu“. */
export const SALE_PHRASES = [
  "k prodeji", "na prodej", "prod[aá]m t[eě]", "prod[aá]me t[eě]", "p[rř]estupov\\S* listin", "seznam\\S* nepot[rř]ebn",
];
/**
 * Hostování: „půjčím tě“, „půjdeš na hostování“. Samotné „na hostování“ ne: „jsi tu na
 * hostování“ píše trenér hráči, kterého si sám půjčil (prod 11/2026).
 */
export const LOAN_PHRASES = [
  "p[uů]j[cč][ií]m t[eě]", "t[eě] p[uů]j[cč][ií]m",
  "(d[aá]m|d[aá]v[aá]m|po[sš]lu|pos[ií]l[aá]m|nab[ií]dnu|nab[ií]z[ií]m|nab[ií]dl jsem|dal jsem) t[eě] na hostov[aá]n[ií]",
  "t[eě] (d[aá]m|d[aá]v[aá]m|po[sš]lu|pos[ií]l[aá]m|nab[ií]dnu|nab[ií]z[ií]m) na hostov[aá]n[ií]",
  "(p[uů]jde[sš]|jde[sš]) na hostov[aá]n[ií]",
];
/** Nestavění: rozhodnutí o sestavě, ne akce. */
export const BENCH_PHRASES = [
  "nebudu t[eě] stav[eě]t", "t[eě] (u[zž] )?nebudu stav[eě]t", "u[zž] t[eě] stav[eě]t nebudu", "nepostav[ií]m t[eě]", "nebude[sš] hr[aá]t",
];
/** Nepočítá s ním, ať si hledá klub. */
export const LEAVE_PHRASES = [
  "nepo[cč][ií]t[aá]m s tebou", "nepo[cč][ií]t[aá]me s tebou", "s tebou (u[zž] )?nepo[cč][ií]t[aá]",
  "hledej si (klub|jin|nov|m[ií]sto|angaž)", "najdi si (klub|jin|nov|m[ií]sto)", "hledat (si )?(m[ií]sto|klub|jin|nov)",
  "m[uů][zž]e[sš] (odej[ií]t|j[ií]t jinam)", "jsi nav[ií]c", "nepot[rř]ebuj(eme|u) t[eě]",
  "na tr[eé]nink(y)? (chodit )?nemus[ií][sš]",
];
/** Vyhazov: „sbal se a vypadni“, „tady už si nezahraješ“, „půjdeš z týmu“. */
export const DISMISSAL_PHRASES = [
  "sbal se", "vypadni z (t[yý]mu|klubu|kabiny)", "vypadni\\s*[.!]*\\s*$",
  "(p[uů]jde[sš]|jde[sš]|let[ií][sš]|vylet[ií][sš]|pad[aá][sš]) z t[yý]mu", "z t[yý]mu (let[ií][sš]|jde[sš]|vylet[ií][sš])",
  "(jsi|seš|si) (propu[sš]t[eě]n|vyhozen)", "vyhazuj(u|eme) t[eě]", "vyhodil jsem t[eě]", "vyhod[ií]m t[eě]", "t[eě] vyhod[ií]m",
  "propou[sš]t[ií]m t[eě]", "propustil jsem t[eě]", "propust[ií]m t[eě]", "t[eě] propust[ií]m",
  "kon[cč][ií][sš] (v t[yý]mu|v klubu|u n[aá]s)", "tady kon[cč][ií][sš]",
  "(tady|u n[aá]s) (u[zž] )?si nezahraje[sš]", "u[zž] si (tady |u n[aá]s )?nezahraje[sš]", "u[zž] za n[aá]s nehraje[sš]",
  "ru[sš][ií]m ti smlouvu", "vypov[ií]d[aá]m ti smlouvu", "kon[cč][ií] ti smlouva",
];
/** Předání policii, hotové nebo právě teď (budoucí „zavolám policii“ je taktika výslechu). */
export const POLICE_PHRASES = [
  "(p[rř]edal|nahl[aá]sil|ohl[aá]sil|ozn[aá]mil|dal) jsem (to |t[eě] |v[aá]s |celou v[eě]c )?(na )?polic",
  "jsem (to |t[eě] |v[aá]s )?(p[rř]edal|nahl[aá]sil|ohl[aá]sil|ozn[aá]mil|dal) (to )?(na )?polic",
  "polici[ií]? jsem (to |t[eě] )?(p[rř]edal|nahl[aá]sil|ohl[aá]sil|ozn[aá]mil|dal)",
  "(za)?volal jsem (na )?polic", "vol[aá]m polic", "udal jsem t[eě]", "ud[aá]v[aá]m t[eě]",
  "polici[ea] (u[zž] )?(to )?(u[zž] )?([rř]e[sš][ií]|vy[sš]et[rř]uje|[sš]et[rř][ií]|pro[sš]et[rř])",
  "([rř]e[sš][ií]|vy[sš]et[rř]uje|[sš]et[rř][ií]) (to |p[rř][ií]pad )?polici",
  "polici[ea] o tob[eě] v[ií]", "policajti (u[zž] )?(to )?([rř]e[sš][ií]|vy[sš]et[rř]uj)", "p[rř]ijdou (si pro tebe )?policajt",
];
/** Odebrání kapitánské pásky. */
export const CAPTAINCY_PHRASES = [
  "ber[uů] ti (kapit[aá]nskou )?p[aá]sk", "sebral jsem ti (kapit[aá]nskou )?p[aá]sk", "odeb(er[uů]|ral jsem) ti (kapit[aá]nskou )?p[aá]sk",
  "p[aá]sk[ua] (u[zž] )?nem[aá][sš]", "u[zž] nejsi kapit[aá]n", "nejsi u[zž] kapit[aá]n", "kapit[aá]nem (u[zž] )?nebude[sš]",
  "p[rř]ich[aá]z[ií][sš] o (kapit[aá]nskou )?p[aá]sk", "p[rř]i[sš]el jsi o (kapit[aá]nskou )?p[aá]sk", "konec s p[aá]skou",
  "p[aá]sk[ua] (je |jde )?pry[cč]", "zbavuj(i|u) t[eě] (kapit[aá]nsk|p[aá]sk)",
];
/**
 * Plat: „s platem nepočítej“. Pokuta a „strhnu ti to z výplaty“ sem nepatří, ty rozpoznává
 * coach-commitments.ts (`fine`) a tlačítko „Udělit pokutu“ trenér dostane tam.
 */
export const WAGE_PHRASES = [
  "s platem nepo[cč][ií]tej", "s v[yý]platou nepo[cč][ií]tej", "plat ti (sn[ií][zž][ií]m|seberu|beru|st[aá]hnu|zastav[ií]m|zkr[aá]t[ií]m)",
  "(sn[ií][zž][ií]m|seberu|beru|st[aá]hnu|zastav[ií]m|zkr[aá]t[ií]m) ti plat", "nedostane[sš] (ani korunu|zaplaceno|v[yý]platu|plat\\b)",
  "(v[yý]platu|plat) (u[zž] )?nedostane[sš]", "bez v[yý]platy", "bez platu", "nebudu ti platit",
];

/** Trenér napsal, že s hráčem nepočítá: prodej, hostování, nestavění, hledej si klub, vyhazov. */
export const NOT_COUNTED_ON_PHRASES = [...SALE_PHRASES, ...LOAN_PHRASES, ...BENCH_PHRASES, ...LEAVE_PHRASES, ...DISMISSAL_PHRASES];

/**
 * Regulární výraz z částí. Před částí nesmí být písmeno: „neprodám tě“ není „prodám tě“.
 * `multiline`: „vypadni“ na konci věty.
 */
export function phraseRegex(phrases: readonly string[]): RegExp {
  return new RegExp(`(?<!\\p{L})(?:${phrases.join("|")})`, "imu");
}

const CLAIM_RE: ReadonlyArray<[ClaimKind, RegExp]> = [
  ["dismissal", phraseRegex(DISMISSAL_PHRASES)],
  ["transfer_list", phraseRegex(SALE_PHRASES)],
  ["loan_list", phraseRegex(LOAN_PHRASES)],
  ["police", phraseRegex(POLICE_PHRASES)],
  ["captaincy", phraseRegex(CAPTAINCY_PHRASES)],
  ["wage_cut", phraseRegex(WAGE_PHRASES)],
  ["not_counted_on", phraseRegex([...BENCH_PHRASES, ...LEAVE_PHRASES])],
];

/** Malá písmena bez diakritiky. */
function plain(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Výhrůžka, ne oznámení: podmínka nebo poslední varování ve stejné větě („jestli…, tak
 * letíš“, „zkus to znovu a volám policii“, „ještě jednou a končíš“, „buď…, nebo policie“).
 */
const THREAT_RE = /\b(jestli|jestlize|pokud|kdyz|kdyby|jinak|nebo|jakmile|zkus\w*|jeste jednou|posledni sanc\w*|varuj\w*|az (se|budes|das|udelas|zase))\b/;
/** Zápor před oznámením: „nebudu tě dávat na prodej“, „neboj, pásku ti nevezmu“. */
const NEGATION_RE = /\b(nebudu|nechci|nehodlam|nikdy|neboj\w*|nemam v planu)\b/;

/** Věty zprávy (konec věty, nový řádek). */
function sentences(text: string): string[] {
  return text.split(/(?<=[.!?…])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
}

export interface CoachClaim {
  kind: ClaimKind;
  /** Věta, ve které oznámení je (nejvýš 160 znaků). */
  quote: string;
}

/** Oznámení akce ve zprávě trenéra hráči. Každý druh nejvýš jednou. */
export function detectCoachClaims(text: string): CoachClaim[] {
  const found = new Map<ClaimKind, string>();
  for (const sentence of sentences(text)) {
    if (sentence.endsWith("?")) continue;
    if (THREAT_RE.test(plain(sentence))) continue;
    for (const [kind, re] of CLAIM_RE) {
      if (found.has(kind)) continue;
      const m = re.exec(sentence);
      if (!m) continue;
      // Zápor před oznámením ho ruší. U „nepočítám s tebou“ je zápor součástí slov
      // („Já tě nebudu stavět a ani na trénink chodit nemusíš“).
      if (kind !== "not_counted_on" && NEGATION_RE.test(plain(sentence.slice(0, m.index)))) continue;
      const q = sentence.replace(/\s+/g, " ");
      found.set(kind, q.length > 160 ? `${q.slice(0, 157)}…` : q);
    }
  }
  // Vyhazov nebo prodej „nepočítám s tebou“ v sobě mají, zvlášť se neuvádí.
  if (found.has("not_counted_on") && (found.has("dismissal") || found.has("transfer_list") || found.has("loan_list"))) {
    found.delete("not_counted_on");
  }
  return [...found].map(([kind, quote]) => ({ kind, quote }));
}

// ─── Stav ve hře ────────────────────────────────────────────────────────────

/** Jak to s hráčem ve hře je. `null` = nevíme (dotaz selhal): takové oznámení se neposuzuje. */
export interface ClaimState {
  firstName: string;
  lastName: string;
  /** Je v klubu (áčko, U21, nebo půjčený jinam). */
  inClub: boolean | null;
  listing: "transfer" | "loan" | null;
  /** Klub ho půjčil jinam. */
  loanedOut: boolean;
  /**
   * Policie případ řeší: teď vyšetřuje (status `policie`), nebo trenér předal policii právě jeho.
   * Bez otevřeného incidentu stačí, že nedávný incident policie řešila.
   */
  policeOnCase: boolean | null;
  /** Otevřený incident, u kterého jde policii zavolat (nejdřív ten, kde je hráč odhalený pachatel). */
  openIncidentId: string | null;
  /** Odhalený pachatel otevřeného incidentu: tresty (srážka, pokuta) jdou u něj. */
  culpritIncidentId: string | null;
  /** Má kapitánskou pásku: v uložené sestavě na příští zápas, jinak kapitán klubu. */
  wearsArmband: boolean | null;
  /** Strhávají se mu peníze: běžící srážka za incident, nebo pokuta z SMS za posledních 14 dní. */
  wageCut: boolean | null;
}

/** Jak nedávno musí incident být, aby se policie „řešila“. */
const POLICE_WINDOW_DAYS = 45;

/** Výsledek dotazu, `undefined` = dotaz selhal (`null` je „řádek není“). */
async function safe<T>(what: string, run: () => Promise<T>): Promise<T | undefined> {
  try {
    return await run();
  } catch (e) {
    logger.warn({ module: M }, what, e);
    return undefined;
  }
}

/** `clubTeamId` smí být i U21: porovnává se klub (áčko), ke kterému tým patří. */
export async function loadClaimState(db: D1Database, o: { clubTeamId: string; playerId: string; now?: Date }): Promise<ClaimState | null> {
  const club = await safe("klub pro oznámení trenéra", () => db.prepare("SELECT COALESCE(parent_team_id, id) AS id FROM teams WHERE id = ?")
    .bind(o.clubTeamId).first<{ id: string }>());
  const clubTeamId = club?.id ?? o.clubTeamId;
  const p = await safe("hráč pro oznámení trenéra", () => db.prepare(
    `SELECT p.first_name, p.last_name, p.status, p.team_id,
            (SELECT COALESCE(t.parent_team_id, t.id) FROM teams t WHERE t.id = p.team_id) AS club_id,
            (SELECT COALESCE(t.parent_team_id, t.id) FROM teams t WHERE t.id = p.loan_from_team_id) AS loan_club_id
       FROM players p WHERE p.id = ?`,
  ).bind(o.playerId).first<{
    first_name: string; last_name: string; status: string | null; team_id: string | null; club_id: string | null; loan_club_id: string | null;
  }>());
  if (!p) return null;
  const active = p.status === null || p.status === "active";
  const loanedOut = p.loan_club_id === clubTeamId && p.club_id !== clubTeamId;
  const inClub = active && (p.club_id === clubTeamId || loanedOut);
  // Pásku nosí v týmu, za který hraje (áčko, U21); půjčený jinam ji u nás nemá.
  const rosterTeamId = loanedOut ? clubTeamId : p.team_id ?? clubTeamId;
  const now = o.now ?? new Date();
  const since = new Date(now.getTime() - POLICE_WINDOW_DAYS * DAY_MS).toISOString();

  const [listing, incidents, captain, lineupCaptain, deduction, fine] = await Promise.all([
    loadActiveListing(db, o.playerId).then((l) => l?.kind ?? null),
    safe("incidenty pro oznámení trenéra", () => db.prepare(
      `SELECT id, status, resolution, police_result_on, culprit_player_id, culprit_revealed FROM club_incidents
        WHERE team_id = ? AND category IN ('kradez', 'poskozeni') AND julianday(created_at) >= julianday(?)
        ORDER BY created_at DESC LIMIT 30`,
    ).bind(clubTeamId, since).all<{
      id: string; status: string; resolution: string | null; police_result_on: string | null;
      culprit_player_id: string | null; culprit_revealed: number;
    }>().then((r) => r.results)),
    safe("kapitán klubu", () => db.prepare("SELECT captain_id FROM teams WHERE id = ?").bind(rosterTeamId)
      .first<{ captain_id: string | null }>()),
    safe("kapitán v sestavě na příští zápas", () => db.prepare(
      `SELECT l.captain_id FROM lineups l JOIN season_calendar c ON c.id = l.calendar_id
        WHERE l.team_id = ? AND l.is_auto = 0 AND c.status = 'scheduled' AND c.scheduled_at >= ?
        ORDER BY c.scheduled_at LIMIT 1`,
    ).bind(rosterTeamId, new Date(now.getTime() - 3600_000).toISOString()).first<{ captain_id: string | null }>()),
    safe("srážka hráči", () => db.prepare(
      `SELECT 1 AS x FROM club_incidents WHERE team_id = ? AND culprit_player_id = ? AND resolution = 'srazka'
          AND COALESCE(json_extract(resolution_data, '$.tydnuZbyva'), 0) > 0 LIMIT 1`,
    ).bind(clubTeamId, o.playerId).first<{ x: number }>()),
    safe("pokuta hráči z SMS", () => db.prepare(
      `SELECT 1 AS x FROM coach_commitments WHERE player_id = ? AND kind = 'fine' AND status = 'kept'
          AND julianday(resolved_at) >= julianday(?) LIMIT 1`,
    ).bind(o.playerId, new Date(now.getTime() - 14 * DAY_MS).toISOString()).first<{ x: number }>()),
  ]);

  const open = (incidents ?? []).filter((i) => i.status === "otevreny");
  // Kapitán: uložená sestava na příští zápas má přednost (tam trenér pásku mění), bez ní kapitán klubu.
  const armbandHolder = lineupCaptain ? lineupCaptain.captain_id
    : lineupCaptain === undefined || captain === undefined ? undefined
    : captain?.captain_id ?? null;
  const culprit = open.find((i) => i.culprit_player_id === o.playerId && i.culprit_revealed === 1) ?? null;
  return {
    firstName: p.first_name,
    lastName: p.last_name,
    inClub,
    listing,
    loanedOut,
    policeOnCase: incidents === undefined ? null
      : incidents.some((i) => i.status === "policie" || (i.resolution === "policie" && i.culprit_player_id === o.playerId))
        || (open.length === 0 && incidents.some((i) => i.resolution === "policie" || i.police_result_on !== null)),
    openIncidentId: (culprit ?? open[0])?.id ?? null,
    culpritIncidentId: culprit?.id ?? null,
    wearsArmband: armbandHolder === undefined ? null : armbandHolder === o.playerId,
    wageCut: deduction === undefined || fine === undefined ? null : !!deduction || !!fine,
  };
}

/** Stalo se ve hře, co trenér oznámil? `null` = nevíme. „Nepočítám s tebou“ platí vždy (je to rozhodnutí). */
export function claimHolds(kind: ClaimKind, s: ClaimState): boolean | null {
  switch (kind) {
    case "dismissal": return s.inClub === null ? null : !s.inClub;
    case "transfer_list": return s.listing === "transfer";
    case "loan_list": return s.listing === "loan" || s.loanedOut;
    case "police": return s.policeOnCase;
    case "captaincy": return s.wearsArmband === null ? null : !s.wearsArmband;
    case "wage_cut": return s.wageCut;
    case "not_counted_on": return true;
  }
}

// ─── Co hráč ví ─────────────────────────────────────────────────────────────

export interface CoachClaimMemory {
  kind: ClaimKind;
  quote: string;
  /** `YYYY-MM-DD`, kdy to trenér napsal. */
  on: string;
  holds: boolean;
}

/** Jak dlouho hráč pamatuje oznámení, které se nestalo; „nepočítám s tebou“ jako left-out (14 dní). */
const CLAIM_MEMORY_DAYS = 7;
const NOT_COUNTED_ON_MEMORY_DAYS = 14;

/**
 * Oznámení trenéra z posledních dnů a jestli se stala, pro prompt hráče. Nejnovější
 * oznámení každého druhu. Stav se čte teď, takže když trenér akci mezitím udělal, hráč to ví.
 */
export async function loadCoachClaimMemory(
  db: D1Database, o: { clubTeamId: string; playerId: string; convId: string; now?: Date },
): Promise<CoachClaimMemory[]> {
  const now = o.now ?? new Date();
  const rows = await safe("zprávy trenéra pro oznámení", () => db.prepare(
    `SELECT body, sent_at FROM messages WHERE conversation_id = ? AND sender_type = 'user'
        AND julianday(sent_at) >= julianday(?)
      ORDER BY julianday(sent_at) DESC LIMIT 40`,
  ).bind(o.convId, new Date(now.getTime() - NOT_COUNTED_ON_MEMORY_DAYS * DAY_MS).toISOString())
    .all<{ body: string | null; sent_at: string }>().then((r) => r.results));
  const latest = new Map<ClaimKind, { quote: string; on: string; at: number }>();
  for (const r of rows ?? []) {
    const at = Date.parse(r.sent_at.includes("T") ? r.sent_at : `${r.sent_at.replace(" ", "T")}Z`);
    for (const c of detectCoachClaims(r.body ?? "")) {
      const maxDays = c.kind === "not_counted_on" ? NOT_COUNTED_ON_MEMORY_DAYS : CLAIM_MEMORY_DAYS;
      if (latest.has(c.kind) || now.getTime() - at > maxDays * DAY_MS) continue;
      latest.set(c.kind, { quote: c.quote, on: new Date(at).toISOString().slice(0, 10), at });
    }
  }
  if (latest.size === 0) return [];
  const state = await loadClaimState(db, { clubTeamId: o.clubTeamId, playerId: o.playerId, now });
  if (!state) return [];
  const out: CoachClaimMemory[] = [];
  for (const [kind, c] of latest) {
    const holds = claimHolds(kind, state);
    if (holds !== null) out.push({ kind, quote: c.quote, on: c.on, holds });
  }
  return out;
}

function dayCz(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return m && d ? `${d}. ${m}.` : "";
}

/** Řádky do promptu. Hotová akce na listině nebo u policie se neopakuje (řeší ji jiné řádky). */
export function claimPromptLines(claims: readonly CoachClaimMemory[] | undefined): string[] {
  const lines: string[] = [];
  const said = (c: CoachClaimMemory) => `Trenér ti ${dayCz(c.on)} napsal „${c.quote.replace(/[„“"]/g, "")}“`;
  const threat = "Ber to jako výhrůžku nebo výlev vzteku, ne jako hotovou věc, a netvrď opak.";
  for (const c of claims ?? []) {
    switch (c.kind) {
      case "dismissal":
        lines.push(c.holds
          ? "- Trenér tě vyhodil z klubu, už v týmu nejsi."
          : `- ${said(c)}. Ve hře se ale nic nestalo: pořád jsi v kádru a hraješ za klub. ${threat} Nepiš, že jsi vyhozený nebo že si balíš věci.`);
        break;
      case "transfer_list":
        if (!c.holds) lines.push(`- ${said(c)}. Na přestupové listině ale zatím nejsi. ${threat}`);
        break;
      case "loan_list":
        if (!c.holds) lines.push(`- ${said(c)}. Na hostování tě ale zatím nikdo nenabízí. ${threat}`);
        break;
      case "police":
        lines.push(c.holds
          ? `- ${said(c)} a je to pravda: případ řeší policie.`
          : `- ${said(c)}. Ve hře to ale policie neřeší: nikdo z policie se neozval a na výslech jsi nemusel. ${threat} Nevymýšlej si policajty ani výslech.`);
        break;
      case "captaincy":
        lines.push(c.holds
          ? "- Trenér ti vzal kapitánskou pásku, kapitánem už nejsi."
          : `- ${said(c)}. Kapitánskou pásku ale zatím pořád máš ty. ${threat}`);
        break;
      case "wage_cut":
        lines.push(c.holds
          ? "- Trenér ti strhává peníze (srážka nebo pokuta), víš o tom."
          : `- ${said(c)}. Plat ti ale chodí pořád stejný, nic ti nestrhl. ${threat}`);
        break;
      case "not_counted_on":
        lines.push(`- ${said(c)}: nepočítá s tebou a nebude tě stavět. Víš o tom, nediv se, že nehraješ, a netvrď, že nevíš proč.`);
        break;
    }
  }
  return lines;
}

// ─── Poznámka pro trenéra ───────────────────────────────────────────────────

/** Poznámka pro stejného hráče a druh nejvýš jednou za tolik dní. */
export const NOTE_REPEAT_DAYS = 3;

/** Druhy, ke kterým má trenér co udělat (nestavění je jen rozhodnutí). */
const NOTED_KINDS: ReadonlySet<ClaimKind> = new Set(["dismissal", "transfer_list", "loan_list", "police", "captaincy", "wage_cut"]);

export interface ClaimNote {
  body: string;
  href: string | null;
  label: string | null;
}

/** Text poznámky a kam vede. Jméno v 1. pádě na začátku věty, jiný pád generovat neumíme. */
export function claimNote(kind: ClaimKind, s: ClaimState, playerId: string): ClaimNote | null {
  const name = `${s.firstName} ${s.lastName}`;
  const card = { href: `/hrac/${playerId}`, label: "Otevřít kartu hráče" };
  const incident = (id: string | null) => (id ? { href: `/incidenty?id=${encodeURIComponent(id)}`, label: "Otevřít incident" } : { href: null, label: null });
  switch (kind) {
    case "dismissal":
      return { body: `ℹ️ Ve hře se zatím nic nezměnilo, ${name} je pořád v kádru. Propustit ho můžeš na jeho kartě.`, ...card };
    case "transfer_list":
      return { body: `ℹ️ Ve hře se zatím nic nezměnilo, ${name} na přestupové listině není. Na trh ho dáš na jeho kartě.`, ...card };
    case "loan_list":
      return { body: `ℹ️ Ve hře se zatím nic nezměnilo, ${name} na hostování nabídnutý není. Nabídnout ho můžeš na jeho kartě.`, ...card };
    case "police":
      return s.openIncidentId
        ? { body: "ℹ️ Ve hře se zatím nic nezměnilo, policie nic neřeší. Zavolat ji můžeš u incidentu.", ...incident(s.openIncidentId) }
        : { body: "ℹ️ Ve hře policie nic neřeší a otevřený incident, který by mohla vyšetřovat, teď nemáš.", href: null, label: null };
    case "captaincy":
      return { body: `ℹ️ Ve hře má ${name} kapitánskou pásku pořád. Kapitána na příští zápas vybereš v sestavě.`, href: "/zapas", label: "Otevřít sestavu" };
    case "wage_cut":
      return {
        body: `ℹ️ Ve hře má ${name} plat pořád stejný. Snížit ho nejde, peníze mu strhneš jen pokutou (napiš mu ji v SMS i s částkou) nebo srážkou za incident.`,
        ...incident(s.culpritIncidentId),
      };
    case "not_counted_on":
      return null;
  }
}

/**
 * Pod zprávu trenéra přidá poznámku jen pro něj, když oznámil akci, která se ve hře nestala.
 * Volá se ve waitUntil po odeslání SMS a nikdy nehází. Vrací druhy, ke kterým poznámku přidal.
 */
export async function noteUnbackedClaims(
  db: D1Database,
  o: { teamId: string; convId: string; playerId: string; text: string; now?: Date },
): Promise<ClaimKind[]> {
  try {
    const claims = detectCoachClaims(o.text).filter((c) => NOTED_KINDS.has(c.kind));
    if (claims.length === 0) return [];
    const now = o.now ?? new Date();
    const state = await loadClaimState(db, { clubTeamId: o.teamId, playerId: o.playerId, now });
    if (!state) return [];
    const noted: ClaimKind[] = [];
    for (const c of claims) {
      if (claimHolds(c.kind, state) !== false) continue;
      const recent = await db.prepare(
        `SELECT 1 AS x FROM messages WHERE conversation_id = ? AND sender_type = 'system'
            AND json_extract(metadata, '$.type') = 'coach_claim_note' AND json_extract(metadata, '$.kind') = ?
            AND julianday(sent_at) >= julianday(?) LIMIT 1`,
      ).bind(o.convId, c.kind, new Date(now.getTime() - NOTE_REPEAT_DAYS * DAY_MS).toISOString()).first<{ x: number }>();
      if (recent) continue;
      const note = claimNote(c.kind, state, o.playerId);
      if (!note) continue;
      // O sekundu později než zpráva trenéra, ať je v konverzaci pod ní. Přečtená: je pro trenéra.
      await db.prepare(
        `INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, metadata, sent_at, read)
         VALUES (?, ?, 'system', 'Systém', ?, ?, ?, 1)`,
      ).bind(crypto.randomUUID(), o.convId, note.body,
        JSON.stringify({ type: "coach_claim_note", kind: c.kind, href: note.href, label: note.label }),
        new Date(now.getTime() + 1000).toISOString()).run();
      noted.push(c.kind);
    }
    if (noted.length > 0) logger.info({ module: M, teamId: o.teamId }, `oznámení bez akce ve hře (${noted.join(", ")}) u hráče ${o.playerId}`);
    return noted;
  } catch (e) {
    logger.warn({ module: M, teamId: o.teamId }, `oznámení trenéra v konverzaci ${o.convId}`, e);
    return [];
  }
}
