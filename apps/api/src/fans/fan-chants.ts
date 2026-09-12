/**
 * Chorály v databázi.
 *
 * Denní tick se podívá, co z dnešního stavu dává smysl, a porovná to s tím, co
 * se už zpívá. Nové založí, těm, jejichž důvod trvá, přidá na síle, a ty, na
 * které se zapomnělo, uzavře.
 *
 * Chorál je záměrně trvalejší než příspěvek na Tribuně: „tohle se u nás zpívá
 * od podzimu" je jiná informace než „někdo to jednou napsal".
 */

import { createRng } from "../generators/rng";
import { seedFromString } from "../lib/seed";
import { logger } from "../lib/logger";
import {
  vymysliChoraly, silaPo, PRAH_ZAPOMENUTI, chantSilaWord,
  type ChantStav, type ChantKind,
} from "../engine/fan-chants";
import { rivaloveKlubu } from "./fan-rivalries";
import { promptChoralu, zkontrolujChoral, vzorecPro, type ChantTema } from "../engine/fan-chant-inspirace";
import type { FanGroupRow } from "./fan-group-generator";
import type { Bindings } from "../index";

const M = "fan-chants";

export interface ChantRow {
  id: string;
  team_id: string;
  group_id: string | null;
  kind: string;
  text: string;
  duvod: string;
  sila: number;
  since_game_date: string | null;
  status: string;
}

/** Co se u klubu zpívá. Seřazeno od nejhlasitějšího. */
export async function nactiChoraly(db: D1Database, teamId: string): Promise<Array<ChantRow & { silaWord: string }>> {
  const rows = await db
    .prepare("SELECT * FROM fan_chants WHERE team_id = ? AND status = 'zpiva' ORDER BY sila DESC")
    .bind(teamId)
    .all<ChantRow>()
    .catch((e) => { logger.warn({ module: M }, `chorály ${teamId}`, e); return { results: [] as ChantRow[] }; });
  return rows.results.map((r) => ({ ...r, silaWord: chantSilaWord(r.sila) }));
}

/**
 * Jeden herní den chorálů.
 *
 * Vrací nově vzniklé, aby se o nich dalo napsat na Tribunu. Zapomenuté se
 * nehlásí: na to, že se něco přestalo zpívat, nikdo transparent nevěší.
 */
export async function tikChoralu(
  db: D1Database,
  teamId: string,
  groups: readonly FanGroupRow[],
  gameDate: string,
  /**
   * Když je k dispozici, nový chorál napíše model. Šablona zůstává zálohou pro
   * případ, že je generování vypnuté nebo vrátí něco nepoužitelného.
   */
  env?: Pick<Bindings, "CACHE_KV" | "GEMINI_API_KEY" | "AI" | "AI_GATEWAY_URL">,
): Promise<Array<{ kind: ChantKind; text: string; duvod: string }>> {
  const kotel = groups.find((g) => g.kind === "kotel") ?? groups[0];
  if (!kotel) return [];

  const stav = await sestavStav(db, teamId, kotel, gameDate);
  const okres = (await db.prepare(
    "SELECT v.district FROM teams t JOIN villages v ON v.id = t.village_id WHERE t.id = ?",
  ).bind(teamId).first<{ district: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "okres pro chorál", e); return null; }))?.district ?? null;
  const rng = createRng(seedFromString(`chorál|${teamId}|${gameDate.slice(0, 10)}`));
  const navrhy = vymysliChoraly(stav, rng.random());
  const podleDruhu = new Map(navrhy.map((n) => [n.kind, n]));

  const zive = await db
    .prepare("SELECT * FROM fan_chants WHERE team_id = ? AND status = 'zpiva'")
    .bind(teamId).all<ChantRow>()
    .catch((e) => { logger.warn({ module: M }, `živé chorály ${teamId}`, e); return { results: [] as ChantRow[] }; });

  const stmts: D1PreparedStatement[] = [];
  const nove: Array<{ kind: ChantKind; text: string; duvod: string }> = [];

  // Co se už zpívá: buď důvod trvá a sílí, nebo slábne a zapomene se.
  for (const z of zive.results) {
    const navrh = podleDruhu.get(z.kind as ChantKind);
    const trva = !!navrh;
    const sila = silaPo(z.sila, trva);

    if (sila < PRAH_ZAPOMENUTI) {
      stmts.push(db.prepare(
        "UPDATE fan_chants SET status = 'zapomenut', sila = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?",
      ).bind(sila, z.id));
      continue;
    }
    // Text se mění, jen když se změnil důvod: jinak by se chorál přepisoval
    // každý den a „zpívá se od podzimu" by nic neznamenalo.
    const novyText = navrh && navrh.duvod !== z.duvod ? navrh.text : z.text;
    const novyDuvod = navrh?.duvod ?? z.duvod;
    stmts.push(db.prepare(
      `UPDATE fan_chants SET sila = ?, text = ?, duvod = ?, last_game_date = ?,
         updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?`,
    ).bind(sila, novyText, novyDuvod, gameDate, z.id));
    podleDruhu.delete(z.kind as ChantKind);
  }

  // Co zbylo, je nové. Text napíše model, šablona je záloha.
  //
  // Generuje se JEN při vzniku, ne každý den: chorál pak žije měsíce, takže
  // jeden klub spotřebuje pár vygenerovaných vět za sezónu, ne za zápas.
  for (const [kind, n] of podleDruhu) {
    const text = await napisChoral(env, {
      tema: kind as ChantTema, stav, klub: stav.klub, okres, zaloha: n.text,
      seed: seedFromString(`vzorec|${teamId}|${kind}`),
    });
    stmts.push(db.prepare(
      `INSERT OR IGNORE INTO fan_chants
         (id, team_id, group_id, kind, text, duvod, sila, since_game_date, last_game_date, status)
       VALUES (?,?,?,?,?,?,?,?,?, 'zpiva')`,
    ).bind(
      `chant-${teamId}-${kind}-${gameDate.slice(0, 10)}`, teamId, kotel.id,
      kind, text, n.duvod, n.sila, gameDate, gameDate,
    ));
    nove.push({ kind, text, duvod: n.duvod });
  }

  if (stmts.length > 0) {
    await db.batch(stmts).catch((e) => { logger.warn({ module: M }, `zápis chorálů ${teamId}`, e); });
  }
  return nove;
}

/** Stav, ze kterého se chorály rodí. */
async function sestavStav(
  db: D1Database,
  teamId: string,
  kotel: FanGroupRow,
  gameDate: string,
): Promise<ChantStav> {
  const [tym, oblibenec, trener, kampan, rivalove, forma, stiznost] = await Promise.all([
    db.prepare("SELECT name FROM teams WHERE id = ?").bind(teamId).first<{ name: string }>()
      .catch((e) => { logger.warn({ module: M }, "název klubu", e); return null; }),
    db.prepare(
      `SELECT p.first_name, p.last_name FROM fan_group_players fgp
       JOIN players p ON p.id = fgp.player_id
       WHERE fgp.group_id = ? AND fgp.stance = 'oblibenec' AND p.status = 'active'`,
    ).bind(kotel.id).first<{ first_name: string; last_name: string }>()
      .catch((e) => { logger.warn({ module: M }, "miláček pro chorál", e); return null; }),
    db.prepare("SELECT name FROM managers WHERE team_id = ?").bind(teamId).first<{ name: string }>()
      .catch((e) => { logger.warn({ module: M }, "trenér pro chorál", e); return null; }),
    db.prepare(
      "SELECT 1 AS x FROM fan_campaigns WHERE team_id = ? AND kind = 'trener_ven' AND status IN ('sbira','splnena')",
    ).bind(teamId).first<{ x: number }>()
      .catch((e) => { logger.warn({ module: M }, "kampaň pro chorál", e); return null; }),
    rivaloveKlubu(db, teamId, gameDate, 1),
    (await import("./fan-banner")).formaKlubu(db, teamId),
    nejvetsiStiznost(db, teamId),
  ]);

  return {
    oblibenec: oblibenec ? `${oblibenec.first_name} ${oblibenec.last_name}` : null,
    rival: rivalove[0] ? { nazev: rivalove[0].name, heat: rivalove[0].heat } : null,
    trener: trener?.name ?? null,
    kampanProtiTreneru: !!kampan,
    serie: forma.serie,
    nalada: kotel.mood,
    heat: kotel.heat,
    stiznostNaVybaveni: stiznost,
    klub: tym?.name ?? "náš klub",
  };
}

/**
 * Co na stadionu chybí nejvíc.
 *
 * Bere první nepostavenou věc z pořadí, na kterém lidem opravdu záleží, když
 * stojí v dešti u díry v zemi. Zastřešení a sociálky před parkovištěm.
 */
async function nejvetsiStiznost(db: D1Database, teamId: string): Promise<string | null> {
  const s = await db
    .prepare("SELECT toilets, roof, refreshments, stands, ultras_stand, pitch_condition FROM stadiums WHERE team_id = ?")
    .bind(teamId)
    .first<Record<string, number>>()
    .catch((e) => { logger.warn({ module: M }, "stadion pro stížnost", e); return null; });
  if (!s) return null;

  if ((s.toilets ?? 0) === 0) return "záchody";
  if ((s.roof ?? 0) === 0) return "střechu nad hlavou";
  if ((s.refreshments ?? 0) === 0) return "pivo na stadionu";
  if ((s.stands ?? 0) === 0) return "tribunu";
  if ((s.ultras_stand ?? 0) === 0) return "pořádnej kotel";
  if ((s.pitch_condition ?? 100) < 35) return "hřiště, ne oraniště";
  return null;
}


/**
 * Text chorálu od modelu.
 *
 * Proč model a ne jen šablona: šablon může být šedesát a pořád je to losování
 * z mého seznamu. Dva kluby ve stejné situaci zpívaly doslova totéž. Chorál je
 * přitom to nejosobitější, co kotel má.
 *
 * Proč se to vyplatí: chorál vzniká VZÁCNĚ. Jeden na důvod, pak se zpívá
 * měsíce, dokud ten důvod trvá. Jde tedy o jednotky vět na klub za sezónu,
 * ne o generování při každém zobrazení.
 *
 * Když je generování vypnuté nebo model vrátí patvar, vrátí se šablona. Nikdy
 * to nespadne a nikdy na stadionu nevisí nic rozbitého.
 */
async function napisChoral(
  env: Pick<Bindings, "CACHE_KV" | "GEMINI_API_KEY" | "AI" | "AI_GATEWAY_URL"> | undefined,
  opts: {
    tema: ChantTema; stav: ChantStav; klub: string; okres: string | null; zaloha: string;
    /** Urcuje, kterou stavbu chorálu dostane tenhle klub. */
    seed: number;
  },
): Promise<string> {
  if (!env) return opts.zaloha;
  try {
    const { aiContextFromEnv, generateText } = await import("../lib/ai-provider");
    const ctx = await aiContextFromEnv(env);
    if (ctx.provider === "off") return opts.zaloha;

    const fakta = faktaProTema(opts.tema, opts.stav);
    if (fakta.length === 0) return opts.zaloha;
    const povinne = povinneSlovo(opts.tema, opts.stav);

    const raw = await generateText(
      ctx,
      promptChoralu({
        tema: opts.tema, fakta, klub: opts.klub, okres: opts.okres,
        vzorec: vzorecPro(opts.seed), povinneSlovo: povinne,
      }),
      // 120 tokenu misto 80: cesky text se tokenizuje hustě a na 80 model
      // dojel uprostřed věty. Usečený chorál stejně kontrola zahodí, takže
      // šetření na stropu jen zahazovalo hotová volání.
      { maxTokens: 120, temperature: 1.0, module: M },
    );

    const jmena = [opts.stav.oblibenec, opts.stav.trener].filter(Boolean) as string[];
    const kontrola = zkontrolujChoral(raw, { jmena, musiObsahovat: povinne, tema: opts.tema });
    if (!kontrola.ok) {
      logger.info({ module: M }, `chorál od modelu zahozen (${kontrola.duvod}), beru šablonu`);
      return opts.zaloha;
    }
    return kontrola.text;
  } catch (e) {
    logger.warn({ module: M }, "generování chorálu selhalo, beru šablonu", e);
    return opts.zaloha;
  }
}

/**
 * Slovo, bez kterého chorál na dané téma není chorál na to téma.
 *
 * Model bez téhle pojistky odběhne k obecnému fandění: na stížnost „chybí
 * záchody“ vrátil „Hej, Hot Peppers, do toho!“. U výhry a vzdoru se nic
 * povinného nevyžaduje, tam žádné konkrétní jméno být nemá.
 */
function povinneSlovo(tema: ChantTema, s: ChantStav): string | null {
  switch (tema) {
    case "oblibenec": return s.oblibenec ? prijmeni(s.oblibenec) : null;
    case "rival": return s.rival?.nazev ?? null;
    case "trener_pro":
    case "trener_proti": return s.trener ? prijmeni(s.trener) : null;
    case "vybaveni": return s.stiznostNaVybaveni;
    default: return null;
  }
}

/** Příjmení: na tribuně se křestní nekřičí. */
function prijmeni(jmeno: string): string {
  const c = jmeno.trim().split(/\s+/);
  return c[c.length - 1] ?? jmeno;
}

/** Hotová fakta k tématu. Model nesmí nic domýšlet, takže dostane jen tohle. */
function faktaProTema(tema: ChantTema, s: ChantStav): string[] {
  switch (tema) {
    case "oblibenec":
      return s.oblibenec ? [`Miláček kotle se jmenuje ${s.oblibenec}.`] : [];
    case "rival":
      return s.rival ? [`Nesnášíme klub ${s.rival.nazev}, je to mezi námi dlouhodobě vyhrocené.`] : [];
    case "trener_proti":
      return s.trener ? [`Trenér se jmenuje ${s.trener} a sbíráme podpisy za jeho odvolání.`] : [];
    case "trener_pro":
      return s.trener ? [`Trenér se jmenuje ${s.trener} a vyhráli jsme ${s.serie} zápasy po sobě.`] : [];
    case "vyhra":
      return [`Vyhráli jsme ${s.serie} zápasy po sobě.`];
    case "vzdor":
      return [
        s.heat >= 60 ? "Jsme naštvaní na vedení klubu." : "Nálada je na dně, ale chodíme dál.",
        "Chodíme na stadion za každého počasí a nehodláme přestat.",
      ];
    case "vybaveni":
      return s.stiznostNaVybaveni
        ? [`Na stadionu nám chybí tohle: ${s.stiznostNaVybaveni}.`]
        : [];
  }
}
