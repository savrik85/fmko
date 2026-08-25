/**
 * Počasí kola pro zpravodaj.
 *
 * Do 2026-08-25 nevěděly generátory článků o počasí vůbec nic: zápas rozhodl
 * liják, hráči se na něj vymlouvali v SMS — a v novinách o něm nebyla řádka.
 * Přitom počasí ovlivňuje techniku, zranění i návštěvu, takže článek, který ho
 * mlčky přejde, popisuje jiný zápas, než se hrál.
 *
 * Text se AI předává HOTOVÝ a s pokynem nevymýšlet si jiné — jinak by si redaktor
 * počasí přibarvil podle nálady a rozešel se s tím, co hráč vidí v předpovědi.
 */

import { logger } from "../lib/logger";
import { resolveRoundWeather } from "../season/season-weather";
import { describeWeather } from "../season/weather";

/** Počasí, které stojí za zmínku. Zataženo a vítr článek neobohatí. */
const ZAJIMAVE = new Set(["rain", "snow", "sunny"]);

export interface RoundWeatherContext {
  /** Řádek do promptu, např. „déšť, 12 °C — Vytrvalý déšť, bahno". */
  line: string;
  /** Má na počasí redaktor sáhnout, nebo ho může nechat být? */
  worthMentioning: boolean;
}

/**
 * Počasí kola jako věta do promptu. `null` = nedá se odvodit (chybí termín kola
 * nebo hranice sezóny), pak se do promptu nepřidává nic.
 */
export async function roundWeatherContext(
  db: D1Database,
  calendarId: string,
): Promise<RoundWeatherContext | null> {
  const w = await resolveRoundWeather(db, calendarId).catch((e) => {
    logger.warn({ module: "news-weather" }, `počasí kola ${calendarId} se neodvodilo`, e);
    return null;
  });
  if (!w) return null;

  const { description } = describeWeather(w.weather, calendarId);
  return {
    line: `${description}, ${w.temperature} °C`,
    worthMentioning: ZAJIMAVE.has(w.weather),
  };
}

/**
 * Blok do promptu i s pokynem. Prázdný řetězec, když se počasí neodvodí —
 * dá se vložit do template literálu bez podmínek okolo.
 */
export function weatherPromptBlock(ctx: RoundWeatherContext | null, jePredpoved = false): string {
  if (!ctx) return "";
  const nadpis = jePredpoved ? "PŘEDPOVĚĎ NA KOLO" : "POČASÍ V KOLE";
  const pokyn = ctx.worthMentioning
    ? "Počasí zmiň — jednou větou, tam kde to dává smysl (ovlivnilo hru, návštěvu, kondici)."
    : "Počasí bylo nevýrazné; zmiňuj ho jen když se to samo nabídne.";
  return `\n${nadpis}: ${ctx.line}\n${pokyn} Jiné počasí si NEVYMÝŠLEJ — tohle je to, co hráči vidí ve hře.\n`;
}
