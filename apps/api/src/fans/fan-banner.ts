/**
 * Transparent v kotli, když si ho píšou fanoušci.
 *
 * Posbírá stav, který o partách stejně víme (nálada, kampaně, rivalita,
 * miláček, série, střelba, taktika). Situaci a důvod určí katalog
 * (`engine/fan-banner.ts`), samotné heslo napíše model podle skutečných
 * nápisů (`engine/fan-banner-ai.ts`). Když model selže, visí heslo z katalogu.
 * Přepočítává se v denním ticku, ne při zobrazení: nápis na plachtě se nemá
 * měnit pokaždé, když někdo otevře stránku stadionu.
 */

import { createRng } from "../generators/rng";
import { seedFromString } from "../lib/seed";
import { logger } from "../lib/logger";
import {
  MAX_DELKA_TRANSPARENTU, mozneTransparenty, prijmeni, vyberTransparent, type StavProTransparent, type Transparent,
} from "../engine/fan-banner";
import {
  korektorSchvalil, promptKorektor, promptPlachty, slovaSponzoru, vadaPlachty, vyberVzory, type BannerTon,
} from "../engine/fan-banner-ai";
import { zkontrolujChoral } from "../engine/fan-chant-inspirace";
import type { Bindings } from "../index";
import { rivaloveKlubu } from "./fan-rivalries";
import type { FanGroupRow } from "./fan-group-generator";
import type { FanGroupKind } from "../engine/fan-groups";

const M = "fan-banner";

/**
 * Přepočte nápis v kotli.
 *
 * Vrací nový text, když se změnil, jinak `null` — volající z toho udělá
 * příspěvek na Tribunu. Tichá výměna plachty by hráči utekla.
 */
export async function prepoctiTransparent(
  db: D1Database,
  teamId: string,
  groups: readonly FanGroupRow[],
  gameDate: string,
  /** Bez env (nebo s vypnutou AI) visí heslo z katalogu. */
  env?: Pick<Bindings, "CACHE_KV" | "GEMINI_API_KEY" | "AI" | "AI_GATEWAY_URL">,
): Promise<{ text: string; duvod: string } | null> {
  const stadion = await db
    .prepare("SELECT ultras_text, ultras_text_duvod, ultras_stand FROM stadiums WHERE team_id = ?")
    .bind(teamId)
    .first<{ ultras_text: string | null; ultras_text_duvod: string | null; ultras_stand: number }>()
    .catch((e) => { logger.warn({ module: M }, `stadion ${teamId}`, e); return null; });
  if (!stadion) return null;
  // Bez kotle není kam plachtu pověsit. Ve 3D se sektor při úrovni 0 vůbec
  // nekreslí, takže by se počítal nápis, který nikdo nikdy neuvidí.
  if ((stadion.ultras_stand ?? 0) <= 0) return null;

  // Kotel drží plachtu. Když ho klub nemá, vezme se nejvášnivější parta.
  const parta = groups.find((g) => g.kind === "kotel")
    ?? [...groups].sort((a, b) => b.passion - a.passion)[0];
  if (!parta) return null;

  const [kampane, oblibenec, trener, rivalove, forma, taktika] = await Promise.all([
    db.prepare(
      "SELECT kind, target_name FROM fan_campaigns WHERE team_id = ? AND status IN ('sbira','splnena')",
    ).bind(teamId).all<{ kind: string; target_name: string }>()
      .catch((e) => { logger.warn({ module: M }, "kampaně pro transparent", e); return { results: [] as never[] }; }),
    db.prepare(
      `SELECT p.first_name, p.last_name FROM fan_group_players fgp
       JOIN players p ON p.id = fgp.player_id
       WHERE fgp.group_id = ? AND fgp.stance = 'oblibenec' AND p.status = 'active'`,
    ).bind(parta.id).first<{ first_name: string; last_name: string }>()
      .catch((e) => { logger.warn({ module: M }, "miláček pro transparent", e); return null; }),
    db.prepare("SELECT name FROM managers WHERE team_id = ?").bind(teamId).first<{ name: string }>()
      .catch((e) => { logger.warn({ module: M }, "trenér pro transparent", e); return null; }),
    rivaloveKlubu(db, teamId, gameDate, 1),
    formaKlubu(db, teamId),
    db.prepare("SELECT tactic FROM teams WHERE id = ?").bind(teamId).first<{ tactic: string | null }>()
      .catch((e) => { logger.warn({ module: M }, "taktika pro transparent", e); return null; }),
  ]);

  // Na plachtě se klub i rival jmenují podle obce. Celý název nese sponzora.
  const obce = await obceKlubu(db, [teamId, ...(rivalove[0] ? [rivalove[0].teamId] : [])]);
  const rivalObec = rivalove[0] ? (obce.get(rivalove[0].teamId) ?? rivalove[0].name) : null;

  const protiHraci = kampane.results.find((k) => k.kind === "hrac_ven");
  const stav: StavProTransparent = {
    naladaKotle: parta.mood,
    heatKotle: parta.heat,
    kampanProtiTreneru: kampane.results.some((k) => k.kind === "trener_ven"),
    kampanProtiHraci: protiHraci?.target_name ?? null,
    oblibenec: oblibenec ? `${oblibenec.first_name} ${oblibenec.last_name}` : null,
    trener: trener?.name ?? null,
    rival: rivalove[0] && rivalObec ? { nazev: rivalObec, heat: rivalove[0].heat } : null,
    serie: forma.serie,
    golyPoslednich5: forma.goly,
    taktika: taktika?.tactic ?? null,
    kind: parta.kind as FanGroupKind,
    obec: obce.get(teamId) ?? null,
  };

  // Seed z herního dne, ne z času: nápis se smí měnit ze dne na den, ne mezi
  // dvěma načteními stránky.
  const rng = createRng(seedFromString(`banner|${teamId}|${gameDate.slice(0, 10)}`));
  const sablona = vyberTransparent(stav, rng.random());

  // Co v lize už visí a kdo v ní hraje. Plachta se nesmí opakovat po
  // stadionech („X. NÁŠ KLUK.“ na půlce okresu) a nesmí nést sponzora.
  const liga = await klubyLigy(db, teamId);
  const obsazene = liga.filter((k) => k.teamId !== teamId && k.plachta).map((k) => k.plachta!);
  const sponzori = slovaSponzoru(liga.map((k) => k.nazev), liga.map((k) => k.obec));

  const ai = env ? await aiKontext(env) : null;
  const stary = stadion.ultras_text;
  const staryPlati = !!stary && stadion.ultras_text_duvod === sablona.duvod && !vadaPlachty(stary, sponzori, obsazene);
  // Plachta visí, dokud platí důvod. Heslo se losuje každý den znovu, takže bez
  // téhle podmínky by se měnilo KAŽDÝ DEN a každý den by o tom přišel příspěvek
  // na Tribunu. Výjimka: heslo z katalogu se zkusí nahradit vlastním, když je
  // AI k dispozici. Katalogová hesla se po stadionech opakují.
  const zKatalogu = !!stary && mozneTransparenty(stav).includes(stary);
  if (staryPlati && !(zKatalogu && ai)) return null;

  const odModelu = ai
    ? await napisPlachtu(ai, {
        ton: sablona.tone, stav, sablona, obec: stav.obec ?? "naše obec", sponzori, obsazene,
        seed: seedFromString(`vzory|${teamId}|${gameDate.slice(0, 10)}`),
      })
    : null;
  // Model nic použitelného nenapsal a stará plachta pořád platí: nechá se viset,
  // aby se kvůli výpadku nestřídala katalogová hesla.
  if (!odModelu && staryPlati) return null;
  const t = { ...sablona, text: odModelu ?? zalozniHeslo(stav, sablona, obsazene) };

  await db
    .prepare("UPDATE stadiums SET ultras_text = ?, ultras_text_duvod = ? WHERE team_id = ?")
    .bind(t.text, t.duvod, teamId)
    .run()
    .catch((e) => { logger.warn({ module: M }, `zápis transparentu ${teamId}`, e); });

  logger.info({ module: M, teamId }, `nový transparent: „${t.text}" (${t.tone})`);
  return { text: t.text, duvod: t.duvod };
}

/**
 * Forma klubu: série výher nebo proher a kolik dal gólů za posledních pět
 * zápasů. Kotel má názor na obojí.
 */
export async function formaKlubu(db: D1Database, teamId: string): Promise<{ serie: number; goly: number; zapasu: number }> {
  const rows = await db
    .prepare(
      `SELECT home_team_id, away_team_id, home_score, away_score
       FROM matches
       WHERE (home_team_id = ? OR away_team_id = ?) AND home_score IS NOT NULL
       ORDER BY COALESCE(simulated_at, created_at) DESC LIMIT 5`,
    )
    .bind(teamId, teamId)
    .all<{ home_team_id: string; away_team_id: string; home_score: number; away_score: number }>()
    .catch((e) => { logger.warn({ module: M }, `forma ${teamId}`, e); return { results: [] as never[] }; });

  let serie = 0;
  let goly = 0;
  let ukoncena = false;
  for (const m of rows.results) {
    const doma = m.home_team_id === teamId;
    const gf = doma ? m.home_score : m.away_score;
    const ga = doma ? m.away_score : m.home_score;
    goly += gf;
    if (ukoncena) continue;
    if (gf > ga) {
      if (serie < 0) { ukoncena = true; continue; }
      serie++;
    } else if (gf < ga) {
      if (serie > 0) { ukoncena = true; continue; }
      serie--;
    } else {
      ukoncena = true;
    }
  }
  return { serie, goly, zapasu: rows.results.length };
}

/** Kluby ze stejné ligy: název, obec a co jim visí na plachtě. */
async function klubyLigy(db: D1Database, teamId: string): Promise<Array<{ teamId: string; nazev: string; obec: string; plachta: string | null }>> {
  const rows = await db.prepare(
    `SELECT t.id AS teamId, t.name AS nazev, v.name AS obec, s.ultras_text AS plachta
       FROM teams t JOIN villages v ON v.id = t.village_id LEFT JOIN stadiums s ON s.team_id = t.id
      WHERE t.league_id = (SELECT league_id FROM teams WHERE id = ?)`,
  ).bind(teamId).all<{ teamId: string; nazev: string; obec: string; plachta: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "kluby ligy pro transparent", e); return { results: [] as never[] }; });
  return rows.results;
}

/**
 * Heslo z katalogu, které v lize ještě nevisí. Bere jen varianty se stejným
 * důvodem, aby text seděl k vysvětlení v UI.
 */
function zalozniHeslo(stav: StavProTransparent, sablona: Transparent, obsazene: readonly string[]): string {
  const varianty = new Set<string>([sablona.text]);
  for (let i = 0; i < 200; i++) {
    const v = vyberTransparent(stav, i / 200);
    if (v.duvod === sablona.duvod) varianty.add(v.text);
  }
  return [...varianty].find((v) => !vadaPlachty(v, [], obsazene)) ?? sablona.text;
}

type AiKontext = Awaited<ReturnType<typeof import("../lib/ai-provider").aiContextFromEnv>>;

async function aiKontext(env: NonNullable<Parameters<typeof prepoctiTransparent>[4]>): Promise<AiKontext | null> {
  try {
    const { aiContextFromEnv } = await import("../lib/ai-provider");
    const ctx = await aiContextFromEnv(env);
    return ctx.provider === "off" ? null : ctx;
  } catch (e) {
    logger.warn({ module: M }, "AI kontext pro plachtu", e);
    return null;
  }
}

/**
 * Heslo od modelu. Dva pokusy, každý s jiným výběrem skutečných nápisů.
 * Projde jen to, co přežije kontrolu kódu i korektora. Jinak null.
 */
async function napisPlachtu(
  ctx: AiKontext,
  opts: {
    ton: BannerTon; stav: StavProTransparent; sablona: Transparent; obec: string;
    sponzori: string[]; obsazene: string[]; seed: number;
  },
): Promise<string | null> {
  const { generateText } = await import("../lib/ai-provider");
  const fakta = faktaProTon(opts.ton, opts.stav, opts.sablona);
  const povinne = povinneSlovoTonu(opts.ton, opts.stav);
  const jmena = [opts.stav.oblibenec, opts.stav.trener, opts.stav.kampanProtiHraci].filter(Boolean) as string[];

  for (let pokus = 0; pokus < 2; pokus++) {
    try {
      const raw = await generateText(ctx, promptPlachty({
        ton: opts.ton, fakta, obec: opts.obec, maxDelka: MAX_DELKA_TRANSPARENTU, povinneSlovo: povinne,
        vzory: vyberVzory(opts.ton, opts.seed + pokus * 7919), obsazene: opts.obsazene,
      }), { maxTokens: 60, temperature: 1.0, module: M });

      const kontrola = zkontrolujChoral(raw, {
        jmena, musiObsahovat: povinne, maxDelka: MAX_DELKA_TRANSPARENTU,
        tema: opts.ton === "proti_soupefi" ? "rival" : undefined,
        nazvyVPrvnimPade: [opts.obec, ...(opts.stav.rival ? [opts.stav.rival.nazev] : [])],
      });
      if (!kontrola.ok) { logger.info({ module: M }, `heslo zahozeno (${kontrola.duvod}): ${raw}`); continue; }
      const vada = vadaPlachty(kontrola.text, opts.sponzori, opts.obsazene);
      if (vada) { logger.info({ module: M }, `heslo zahozeno (${vada}): ${kontrola.text}`); continue; }

      const soud = await generateText(ctx, promptKorektor(kontrola.text), { maxTokens: 5, temperature: 0, module: M });
      if (!korektorSchvalil(soud)) { logger.info({ module: M }, `korektor neschválil: ${kontrola.text} (${soud})`); continue; }
      return kontrola.text.toUpperCase();
    } catch (e) {
      logger.warn({ module: M }, "generování hesla na plachtu selhalo", e);
    }
  }
  return null;
}

/** Slovo, bez kterého heslo na dané téma nedává smysl. */
function povinneSlovoTonu(ton: BannerTon, s: StavProTransparent): string | null {
  switch (ton) {
    case "proti_soupefi": return s.rival?.nazev ?? null;
    case "proti_treneru": return s.trener ? prijmeni(s.trener) : null;
    case "proti_hraci": return s.kampanProtiHraci ? prijmeni(s.kampanProtiHraci) : null;
    default: return null;
  }
}

/** Hotová fakta k situaci. Model nesmí nic domýšlet, dostane jen tohle. */
function faktaProTon(ton: BannerTon, s: StavProTransparent, sablona: Transparent): string[] {
  switch (ton) {
    case "proti_soupefi":
      return [`Náš rival je obec ${s.rival?.nazev ?? "od vedle"}. Je to mezi námi vyhrocené.`];
    case "proti_treneru":
      return [s.trener ? `Trenér se jmenuje ${s.trener} a chceme, aby skončil.` : "Chceme, aby trenér skončil."];
    case "pro_trenera":
      return [s.trener ? `Trenér se jmenuje ${s.trener}.` : "Trenér se drží.", "Tým teď vyhrává jeden zápas za druhým."];
    case "proti_hraci":
      return [`Hráč ${s.kampanProtiHraci} má podle nás v týmu skončit.`];
    case "vytka":
      return [sablona.duvod, s.golyPoslednich5 <= 2 ? "Tým nedává góly." : "Jsme naštvaní, ale chodíme dál."];
    case "podpora":
    default:
      // Důvod říká, proč visí podpora (miláček, taktika, klid). Jméno miláčka
      // tam je, model ho smí použít, ale jen v prvním pádě.
      return [sablona.duvod, "Chodíme na fotbal za každého počasí a jsme odsud."];
  }
}

/** Obce klubů podle id. Kluby bez obce ve výsledku chybí. */
async function obceKlubu(db: D1Database, teamIds: string[]): Promise<Map<string, string>> {
  const rows = await db.prepare(
    `SELECT t.id, v.name FROM teams t JOIN villages v ON v.id = t.village_id
      WHERE t.id IN (${teamIds.map(() => "?").join(",")})`,
  ).bind(...teamIds).all<{ id: string; name: string }>()
    .catch((e) => { logger.warn({ module: M }, "obce klubů pro transparent", e); return { results: [] as never[] }; });
  return new Map(rows.results.map((r) => [r.id, r.name]));
}
