/**
 * Transparent v kotli, když si ho píšou fanoušci.
 *
 * Posbírá stav, který o partách stejně víme (nálada, kampaně, rivalita,
 * miláček, série, střelba, taktika), a nechá `engine/fan-banner.ts` vybrat
 * heslo. Přepočítává se v denním ticku, ne při zobrazení: nápis na plachtě se
 * nemá měnit pokaždé, když někdo otevře stránku stadionu.
 */

import { createRng } from "../generators/rng";
import { seedFromString } from "../lib/seed";
import { logger } from "../lib/logger";
import {
  vyberTransparent, prijmeni, MAX_DELKA_TRANSPARENTU, type StavProTransparent,
} from "../engine/fan-banner";
import { promptTransparentu, vzorecPlachty, type BannerTon } from "../engine/fan-banner-ai";
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
  /**
   * Když je k dispozici, heslo napíše model. Šablona zůstává zálohou pro
   * případ, že je generování vypnuté nebo vrátí patvar.
   */
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

  const protiHraci = kampane.results.find((k) => k.kind === "hrac_ven");
  const stav: StavProTransparent = {
    naladaKotle: parta.mood,
    heatKotle: parta.heat,
    kampanProtiTreneru: kampane.results.some((k) => k.kind === "trener_ven"),
    kampanProtiHraci: protiHraci?.target_name ?? null,
    oblibenec: oblibenec ? `${oblibenec.first_name} ${oblibenec.last_name}` : null,
    trener: trener?.name ?? null,
    rival: rivalove[0] ? { nazev: rivalove[0].name, heat: rivalove[0].heat } : null,
    serie: forma.serie,
    golyPoslednich5: forma.goly,
    taktika: taktika?.tactic ?? null,
    kind: parta.kind as FanGroupKind,
  };

  // Seed z herního dne, ne z času: nápis se smí měnit ze dne na den, ne mezi
  // dvěma načteními stránky.
  const rng = createRng(seedFromString(`banner|${teamId}|${gameDate.slice(0, 10)}`));
  const sablona = vyberTransparent(stav, rng.random());

  // Plachta visí, dokud platí důvod. Model vrací pokaždé jiný text, takže bez
  // téhle podmínky by se heslo měnilo KAŽDÝ DEN, každý den by o tom přišel
  // příspěvek na Tribunu a každý den by to stálo volání modelu. Plachta se
  // přepisuje, když se změní důvod, ne když se přetočí kalendář.
  if (stadion.ultras_text && stadion.ultras_text_duvod === sablona.duvod) return null;

  const okres = (await db.prepare(
    "SELECT v.district FROM teams t JOIN villages v ON v.id = t.village_id WHERE t.id = ?",
  ).bind(teamId).first<{ district: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "okres pro transparent", e); return null; }))?.district ?? null;
  const klub = (await db.prepare("SELECT name FROM teams WHERE id = ?").bind(teamId)
    .first<{ name: string }>()
    .catch((e) => { logger.warn({ module: M }, "název klubu pro transparent", e); return null; }))?.name ?? "náš klub";

  const t = {
    ...sablona,
    text: await napisTransparent(env, {
      ton: sablona.tone, stav, klub, okres, zaloha: sablona.text,
      seed: seedFromString(`plachta|${teamId}|${sablona.tone}`),
    }),
  };

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

/**
 * Heslo na plachtu od modelu.
 *
 * Proč model a ne jen šablona: šablona je vázaná na podmínku, takže je vždycky
 * pravdivá, ale dva kluby ve stejné situaci vyvěsí doslova totéž. Plachta je
 * přitom to první, co je na stadionu vidět.
 *
 * Fakta si model nedomýšlí, dostane hotové věty ze stavu part. Když vrátí
 * cokoli podezřelého, vrací se šablona, takže na plachtě nikdy nevisí patvar.
 */
async function napisTransparent(
  env: Pick<Bindings, "CACHE_KV" | "GEMINI_API_KEY" | "AI" | "AI_GATEWAY_URL"> | undefined,
  opts: {
    ton: BannerTon; stav: StavProTransparent; klub: string; okres: string | null; zaloha: string;
    /** Určuje, kterou stavbu plachty dostane tenhle klub. */
    seed: number;
  },
): Promise<string> {
  if (!env) return opts.zaloha;
  try {
    const { aiContextFromEnv, generateText } = await import("../lib/ai-provider");
    const ctx = await aiContextFromEnv(env);
    if (ctx.provider === "off") return opts.zaloha;

    const fakta = faktaProTon(opts.ton, opts.stav);
    if (fakta.length === 0) return opts.zaloha;
    const povinne = povinneSlovoTonu(opts.ton, opts.stav);

    const raw = await generateText(
      ctx,
      promptTransparentu({
        ton: opts.ton, fakta, klub: opts.klub, okres: opts.okres,
        maxDelka: MAX_DELKA_TRANSPARENTU, povinneSlovo: povinne,
        vzorec: vzorecPlachty(opts.seed),
      }),
      { maxTokens: 100, temperature: 1.0, module: M },
    );

    const jmena = [opts.stav.oblibenec, opts.stav.trener, opts.stav.kampanProtiHraci]
      .filter(Boolean) as string[];
    const kontrola = zkontrolujChoral(raw, {
      jmena,
      musiObsahovat: povinne,
      maxDelka: MAX_DELKA_TRANSPARENTU,
      // Heslo proti soupeři nesmí soupeři fandit, stejná past jako u chorálů.
      tema: opts.ton === "proti_soupefi" ? "rival" : undefined,
    });
    if (!kontrola.ok) {
      logger.info({ module: M }, `heslo od modelu zahozeno (${kontrola.duvod}), beru šablonu`);
      return opts.zaloha;
    }
    return kontrola.text;
  } catch (e) {
    logger.warn({ module: M }, "generování hesla selhalo, beru šablonu", e);
    return opts.zaloha;
  }
}

/** Slovo, bez kterého heslo na dané téma nedává smysl. */
function povinneSlovoTonu(ton: BannerTon, s: StavProTransparent): string | null {
  switch (ton) {
    case "proti_soupefi": return s.rival?.nazev ?? null;
    case "proti_treneru":
    case "pro_trenera": return s.trener ? prijmeni(s.trener) : null;
    case "proti_hraci": return s.kampanProtiHraci ? prijmeni(s.kampanProtiHraci) : null;
    default: return null;
  }
}

/** Hotová fakta k tónu. Model nesmí nic domýšlet, dostane jen tohle. */
function faktaProTon(ton: BannerTon, s: StavProTransparent): string[] {
  switch (ton) {
    case "proti_soupefi":
      return s.rival ? [`Nesnášíme klub ${s.rival.nazev}, je to mezi námi dlouhodobě vyhrocené.`] : [];
    case "proti_treneru":
      return s.trener ? [`Trenér se jmenuje ${s.trener} a chceme, aby skončil.`] : [];
    case "pro_trenera":
      return s.trener
        ? [`Trenér se jmenuje ${s.trener}.`, `Vyhráli jsme ${Math.abs(s.serie)} zápasy po sobě.`]
        : [];
    case "proti_hraci":
      return s.kampanProtiHraci ? [`Hráč ${s.kampanProtiHraci} má podle nás v týmu skončit.`] : [];
    case "vytka":
      return [
        s.heatKotle >= 60 ? "Jsme naštvaní na vedení klubu." : "Nálada v kotli je mizerná.",
        "Pořád je to náš klub a chodíme dál.",
      ];
    case "podpora":
    default: {
      // Schválně BEZ jména miláčka. Když ho model dostal, začal na hráče
      // mluvit („Vojtěchu Bartoši, buď už konečně doma!“), což je u plachty
      // o identitě klubu nesmysl. Na hráče má kotel chorál, ne plachtu.
      const f = ["Chodíme na fotbal za každého počasí a jsme odsud."];
      if (s.serie > 0) f.push(`Vyhráli jsme ${s.serie} zápasy po sobě.`);
      return f;
    }
  }
}
