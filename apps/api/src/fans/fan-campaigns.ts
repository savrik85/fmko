/**
 * Kampaně fanoušků — „X ven!"
 *
 * Když je nálada na dně, lidi nechtějí lepší náladu, chtějí konkrétní hlavu.
 * Kampaň je proces, ne okamžik: každý herní den, kdy důvod trvá, přibere
 * podpisy; když důvod pomine, vyšumí. Teprve po překročení prahu má následky.
 *
 * Práh se odvozuje od velikosti základny, aby padesát podpisů neznamenalo
 * v Kunraticích totéž co ve velkém klubu.
 */

import { logger } from "../lib/logger";
import type { FanGroupRow } from "./fan-group-generator";

const M = "fan-campaigns";

/** Pod tuhle náladu party už lidi nechtějí trpělivost, ale změnu. */
export const NALADA_PRO_KAMPAN = 32;
/** A takhle naštvaní musí být na vedení, aby šli po trenérovi. */
export const HEAT_PRO_TRENERA = 62;
/** Kolik herních dní bez přírůstku znamená, že to vyšumělo. */
export const DNU_DO_VYSUMENI = 10;

export type KampanKind = "hrac_ven" | "trener_ven";

export interface KampanRow {
  id: string;
  team_id: string;
  kind: KampanKind;
  target_player_id: string | null;
  target_name: string;
  duvod: string;
  podpisy: number;
  prah: number;
  status: string;
  last_game_date: string | null;
  started_game_date: string | null;
}

/** Kolik podpisů kampaň potřebuje. Desetina základny, nikdy míň než 40. */
export function prahPodpisu(velikostZakladny: number): number {
  return Math.max(40, Math.round(velikostZakladny * 0.1));
}

/**
 * Kolik podpisů přibude za herní den.
 *
 * Roste s tím, jak moc jsou naštvaní — pár otrávených lidí sbírá pomalu,
 * celý stadion rychle.
 */
export function podpisyZaDen(opts: { velikostParty: number; nalada: number; heat: number }): number {
  const naladovyTlak = Math.max(0, (NALADA_PRO_KAMPAN - opts.nalada) / NALADA_PRO_KAMPAN);
  const heatTlak = Math.max(0, opts.heat - 40) / 60;
  const tlak = Math.min(1, naladovyTlak * 0.7 + heatTlak * 0.5);
  return Math.max(1, Math.round(opts.velikostParty * 0.18 * tlak));
}

export interface StavKampani {
  zalozene: KampanRow[];
  splnene: KampanRow[];
  vysumele: KampanRow[];
}

/**
 * Jeden herní den kampaní jednoho klubu.
 *
 * Zakládá nové, přisypává podpisy běžícím, uzavírá ty, co dosáhly prahu nebo
 * vyšuměly. Vrací, co se změnilo — volající z toho udělá zprávy a dopady.
 */
export async function tikKampani(
  db: D1Database,
  teamId: string,
  groups: readonly FanGroupRow[],
  gameDate: string,
): Promise<StavKampani> {
  const out: StavKampani = { zalozene: [], splnene: [], vysumele: [] };
  if (groups.length === 0) return out;

  const zive = await db
    .prepare("SELECT * FROM fan_campaigns WHERE team_id = ? AND status = 'sbira'")
    .bind(teamId).all<KampanRow>()
    .catch((e) => { logger.warn({ module: M }, `živé kampaně ${teamId}`, e); return { results: [] as KampanRow[] }; });

  const zakladna = groups.reduce((s, g) => s + Math.max(0, g.size), 0);
  const prah = prahPodpisu(zakladna);
  const naStadionu = groups.filter((g) => g.closed_matches === 0);
  const prumernaNalada = naStadionu.length > 0
    ? naStadionu.reduce((s, g) => s + g.mood, 0) / naStadionu.length
    : 50;
  const prumernyHeat = groups.length > 0
    ? groups.reduce((s, g) => s + g.heat, 0) / groups.length
    : 0;

  // ── Kdo si o to říká ──
  // Otloukánek party, která je pod náladou. Bere se ten, na kterém se shodne
  // nejvíc part — jedna naštvaná parta ještě není hlas stadionu.
  const nasrane = groups.filter((g) => g.mood <= NALADA_PRO_KAMPAN);
  const hlasy = new Map<string, { jmeno: string; duvod: string; sila: number }>();
  if (nasrane.length > 0) {
    const otloukanci = await db
      .prepare(
        `SELECT fgp.player_id, fgp.group_id, fgp.duvod, p.first_name, p.last_name
         FROM fan_group_players fgp JOIN players p ON p.id = fgp.player_id
         WHERE fgp.team_id = ? AND fgp.stance = 'otloukanek' AND p.status = 'active'`,
      )
      .bind(teamId)
      .all<{ player_id: string; group_id: string; duvod: string; first_name: string; last_name: string }>()
      .catch((e) => { logger.warn({ module: M }, `otloukánci ${teamId}`, e); return { results: [] as never[] }; });

    for (const o of otloukanci.results) {
      const g = nasrane.find((x) => x.id === o.group_id);
      if (!g) continue;
      const stav = hlasy.get(o.player_id) ?? { jmeno: `${o.first_name} ${o.last_name}`, duvod: o.duvod, sila: 0 };
      stav.sila += g.size;
      hlasy.set(o.player_id, stav);
    }
  }

  const stmts: D1PreparedStatement[] = [];

  // ── Nové kampaně ──
  const zalozit: Array<{ kind: KampanKind; playerId: string | null; jmeno: string; duvod: string }> = [];
  for (const [playerId, h] of hlasy) {
    if (zive.results.some((k) => k.target_player_id === playerId)) continue;
    // Musí za ním stát aspoň pětina základny, jinak je to remcání dvou lidí.
    if (h.sila < zakladna * 0.2) continue;
    zalozit.push({ kind: "hrac_ven", playerId, jmeno: h.jmeno, duvod: h.duvod });
  }

  const jeProtiTreneru = zive.results.some((k) => k.kind === "trener_ven");
  if (!jeProtiTreneru && prumernyHeat >= HEAT_PRO_TRENERA && prumernaNalada <= NALADA_PRO_KAMPAN) {
    const trener = await db
      .prepare("SELECT name FROM managers WHERE team_id = ?")
      .bind(teamId).first<{ name: string }>()
      .catch((e) => { logger.warn({ module: M }, "jméno trenéra", e); return null; });
    zalozit.push({
      kind: "trener_ven", playerId: null,
      jmeno: trener?.name ?? "trenér",
      duvod: "Nálada na stadionu je dlouhodobě pod bodem mrazu a lidi to dávají za vinu lavičce.",
    });
  }

  for (const z of zalozit) {
    const id = `kmp-${teamId}-${z.kind}-${z.playerId ?? "trener"}-${gameDate.slice(0, 10)}`;
    const start = podpisyZaDen({ velikostParty: zakladna, nalada: prumernaNalada, heat: prumernyHeat });
    stmts.push(
      db.prepare(
        `INSERT OR IGNORE INTO fan_campaigns
           (id, team_id, kind, target_player_id, target_name, duvod, podpisy, prah,
            status, last_game_date, started_game_date)
         VALUES (?,?,?,?,?,?,?,?,'sbira',?,?)`,
      ).bind(id, teamId, z.kind, z.playerId, z.jmeno, z.duvod, start, prah, gameDate, gameDate),
    );
    out.zalozene.push({
      id, team_id: teamId, kind: z.kind, target_player_id: z.playerId, target_name: z.jmeno,
      duvod: z.duvod, podpisy: start, prah, status: "sbira",
      last_game_date: gameDate, started_game_date: gameDate,
    });
  }

  // ── Běžící kampaně ──
  for (const k of zive.results) {
    const duvodTrva = k.kind === "trener_ven"
      ? prumernyHeat >= HEAT_PRO_TRENERA * 0.8 && prumernaNalada <= NALADA_PRO_KAMPAN + 8
      : hlasy.has(k.target_player_id ?? "");

    if (!duvodTrva) {
      if (dnyMezi(k.last_game_date, gameDate) >= DNU_DO_VYSUMENI) {
        stmts.push(
          db.prepare(
            "UPDATE fan_campaigns SET status = 'vyzumela', ended_game_date = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?",
          ).bind(gameDate, k.id),
        );
        out.vysumele.push(k);
      }
      continue;
    }

    const pridat = podpisyZaDen({ velikostParty: zakladna, nalada: prumernaNalada, heat: prumernyHeat });
    const nove = k.podpisy + pridat;
    if (nove >= k.prah) {
      stmts.push(
        db.prepare(
          "UPDATE fan_campaigns SET podpisy = ?, status = 'splnena', ended_game_date = ?, last_game_date = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?",
        ).bind(nove, gameDate, gameDate, k.id),
      );
      out.splnene.push({ ...k, podpisy: nove });
    } else {
      stmts.push(
        db.prepare(
          "UPDATE fan_campaigns SET podpisy = ?, last_game_date = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?",
        ).bind(nove, gameDate, k.id),
      );
    }
  }

  if (stmts.length > 0) {
    await db.batch(stmts).catch((e) => { logger.warn({ module: M }, `zápis kampaní ${teamId}`, e); });
  }
  return out;
}

/**
 * Co se stane, když kampaň projde.
 *
 * Hráč přestane hrát sám za sebe — vypískaný fotbalista ztrácí morálku a chuť.
 * U trenéra to schytá jeho reputace: okres si přečte, že po něm vlastní lidi
 * volají. Odvolat sám sebe hráč nemůže, ale fanoušci to umí udělat drahé.
 */
export async function dopadSplneneKampane(
  db: D1Database,
  k: KampanRow,
  gameDate: string,
): Promise<void> {
  if (k.kind === "hrac_ven" && k.target_player_id) {
    await db
      .prepare(
        `UPDATE players SET life_context = json_set(life_context, '$.morale',
           MAX(0, COALESCE(json_extract(life_context, '$.morale'), 50) - 15))
         WHERE id = ?`,
      )
      .bind(k.target_player_id)
      .run()
      .catch((e) => { logger.warn({ module: M }, `morálka vypískaného ${k.target_player_id}`, e); });

    const { sendSystemSMS } = await import("../lib/sms");
    await sendSystemSMS(
      db, k.team_id, "Kapitán", "Kapitán týmu",
      `😬 Kluci to řeší v kabině — na tribuně se skanduje „${k.target_name} ven". `
      + `${k.target_name} je z toho úplně mimo. Tohle se musí nějak vyřešit.`,
    ).catch((e) => { logger.warn({ module: M }, "SMS o kampani proti hráči", e); });
    return;
  }

  const { applyManagerAttrDelta } = await import("../lib/manager-attrs");
  await applyManagerAttrDelta(
    db, k.team_id, "reputation", -3, "party",
    "Vlastní fanoušci veřejně volali po odvolání",
    { referenceId: `kmp-rep-${k.id}`, gameDate },
  ).catch((e) => { logger.warn({ module: M }, "reputace po kampani", e); });

  const { sendSystemSMS } = await import("../lib/sms");
  await sendSystemSMS(
    db, k.team_id, "Vedení klubu", "Vedení",
    `📣 Na tribuně visel transparent s tvým jménem a slovem „konči". `
    + `Podepsalo se pod to ${k.podpisy} lidí. Výbor to zatím nekomentuje.`,
  ).catch((e) => { logger.warn({ module: M }, "SMS o kampani proti trenérovi", e); });
}

/** Živé kampaně klubu — pro stránku fanoušků a Tribunu. */
export async function nactiKampane(db: D1Database, teamId: string): Promise<KampanRow[]> {
  const rows = await db
    .prepare(
      "SELECT * FROM fan_campaigns WHERE team_id = ? AND status IN ('sbira','splnena') ORDER BY podpisy DESC LIMIT 10",
    )
    .bind(teamId).all<KampanRow>()
    .catch((e) => { logger.warn({ module: M }, `kampaně ${teamId}`, e); return { results: [] as KampanRow[] }; });
  return rows.results;
}

/**
 * Cíl kampaně z klubu odešel — kampaň tím skončila a lidem se ulevilo.
 * Volá se z odchodové cesty hráče, aby transparent nevisel za někým, kdo tu není.
 */
export async function uzavriKampaneNaHrace(
  db: D1Database,
  teamId: string,
  playerId: string,
  gameDate: string,
): Promise<boolean> {
  const res = await db
    .prepare(
      `UPDATE fan_campaigns SET status = 'vyresena', ended_game_date = ?,
         updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
       WHERE team_id = ? AND target_player_id = ? AND status IN ('sbira','splnena')`,
    )
    .bind(gameDate, teamId, playerId)
    .run()
    .catch((e) => { logger.warn({ module: M }, `uzavření kampaně na ${playerId}`, e); return null; });
  return (res?.meta?.changes ?? 0) > 0;
}

function dnyMezi(od: string | null, do_: string): number {
  if (!od) return 0;
  const a = Date.parse(od); const b = Date.parse(do_);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}
