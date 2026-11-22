/**
 * Hospoda platí jen ten večer a noc, kdy vlákno začalo.
 *
 * Scénáře s `atPub` (opilá hlasovka, pozvánka do hospody, „pojď na jedno“, narozeniny trenéra)
 * dřív platily po celé vlákno: hráč z hospody psal opile i druhý den v poledne. Prod 22. 11.:
 * hlasovka pub_voice odešla ve 23:40 UTC, hráč ráno sám napsal střízlivou omluvu „hlava mi
 * třeští“, a na odpověď trenéra v 10:50 zase „trenere moc to neres… doraz za nama na jednoo 🍺🍺“
 * (Hrdlička, Lauda, Beran, Žiga a dalších 37 otevřených vláken).
 *
 * Od první zprávy vlákna sedí v hospodě nejdéle do 4:00 v Praze a nejvýš 8 hodin. Potom má
 * skutečný časový kontext (práce, doma, spánek) a scénář je „ráno potom“: o hospodě mluví jako
 * o včerejšku a do hospody nezve.
 */

import type { AiScenario } from "./ai-player-scenarios";

const TZ = "Europe/Prague";
/** Do kolika hodin ráno (v Praze) hráč ještě sedí v hospodě. */
const PUB_NIGHT_END_HOUR = 4;
/** Nejdéle tak dlouho od první zprávy vlákna. */
const PUB_NIGHT_MAX_MS = 8 * 3600_000;
const DAY_MS = 86_400_000;

/** Pražský čas jako části (rok, měsíc 1–12, den, hodina). */
function pragueParts(at: Date): { year: number; month: number; day: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}

/** O kolik ms je Praha v daný okamžik napřed před UTC (zimní čas 1 h, letní 2 h). */
function pragueOffsetMs(at: Date): number {
  const p = pragueParts(at);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(at.getTime() / 60_000) * 60_000;
}

/** Okamžik, kdy je v Praze daný den a hodina. */
function pragueTime(year: number, month: number, day: number, hour: number): Date {
  const local = Date.UTC(year, month - 1, day, hour);
  const guess = local - pragueOffsetMs(new Date(local));
  // Přes přechod času se posun mezi odhadem a výsledkem liší: druhý krok ho dorovná.
  return new Date(local - pragueOffsetMs(new Date(guess)));
}

/** Do kdy hráč sedí v hospodě, když z ní napsal v `startedAt`: nejbližší 4:00 v Praze, nejvýš 8 hodin. */
export function pubNightUntil(startedAt: Date): Date {
  const p = pragueParts(startedAt);
  let end = pragueTime(p.year, p.month, p.day, PUB_NIGHT_END_HOUR);
  if (end.getTime() <= startedAt.getTime()) {
    const next = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
    end = pragueTime(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), PUB_NIGHT_END_HOUR);
  }
  return new Date(Math.min(end.getTime(), startedAt.getTime() + PUB_NIGHT_MAX_MS));
}

/** Kolik pražských kalendářních dní uplynulo od `from` do `to`. */
function pragueDaysBetween(from: Date, to: Date): number {
  const a = pragueParts(from);
  const b = pragueParts(to);
  return Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / DAY_MS);
}

/**
 * Popis scénáře „ráno potom“: střízlivý, nezve, o hospodě jen na řeč. Dřív pokyn „na včerejšek
 * se odkazuj jako na včerejšek“ tlačil úvod „včera jsem…“ do 5 ze 7 odpovědí (E2E 22. 11.)
 * a hráč s opitím spojoval i krádež („včera jsem byl namol. Ty dresy jsem opravdu vzal“).
 */
function morningAfterDescription(daysAgo: number): string {
  const when = daysAgo <= 1 ? "Včera večer nebo v noci" : "Před pár dny večer";
  const ref = daysAgo <= 1 ? "jako o včerejšku" : "jako o tom večeru v hospodě";
  return `${when} jsi byl s partou v hospodě a poslal jsi trenérovi zprávu nebo hlasovku (je v historii). `
    + `Teď je ${daysAgo <= 1 ? "další den" : "už pár dní potom"}, jsi střízlivý, ${daysAgo <= 1 ? "možná máš kocovinu" : "kocovina je dávno pryč"}. `
    + `O hospodě a té zprávě mluv jen když na to přijde řeč nebo k tomu trenér míří, a pak ${ref}: podle povahy se stydíš, zlehčuješ, nebo si za tím stojíš. `
    + "Zprávu nezačínej tím, co bylo v hospodě. Když se trenér ptá na něco jiného, odpověz na to. "
    + "Co se stalo jindy (krádež, průšvih, zápas), nespojuj s pitím ani s tím večerem. "
    + "Do hospody teď nezveš, pokud tam opravdu zase nejsi. "
    + "O žádném konkrétním zápase, výsledku ani tabulce nemluv, pokud se na ně trenér neptá.";
}

/**
 * Ráno potom je vlastně nový rozhovor: trenér se ptá, jak se má, a pak na další věci. Se dvěma
 * výměnami ze scénáře hlasovky byla druhá otázka trenéra vždy poslední replikou (E2E 22. 11.).
 */
export const MORNING_AFTER_TURNS = 3;

/**
 * Scénář vlákna a jestli hráč pořád sedí v hospodě. Scénář bez `atPub` se nemění. Po skončení
 * noci (`pubNightUntil`) hráč v hospodě nesedí a scénář je „ráno potom“ bez pozvánky a aspoň
 * s `MORNING_AFTER_TURNS` výměnami.
 */
export function pubThreadScenario(
  scenario: AiScenario, startedAt: string | undefined, now: Date = new Date(),
): { scenario: AiScenario; atPub: boolean } {
  if (!scenario.atPub) return { scenario, atPub: false };
  const start = startedAt ? new Date(startedAt) : null;
  if (!start || !Number.isFinite(start.getTime())) return { scenario, atPub: true };
  if (now.getTime() < pubNightUntil(start).getTime()) return { scenario, atPub: true };
  return {
    scenario: {
      ...scenario, atPub: false, invite: undefined, expectedTurns: Math.max(scenario.expectedTurns, MORNING_AFTER_TURNS) as 2 | 3,
      description: morningAfterDescription(Math.max(1, pragueDaysBetween(start, now))),
    },
    atPub: false,
  };
}
