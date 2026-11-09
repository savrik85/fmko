/**
 * Dvoufázová značka denního ticku a záznam dokončených kroků.
 *
 * Dřív se značka `daily-tick:<den>` uložila hned na začátku a herní datum se posunulo
 * až po obci, sponzorech a tréninku. Pád mezi tím znamenal, že datum zůstalo včerejší,
 * večerní kolo nebylo splatné a další spuštění téhož dne skončilo na značce.
 *
 * Teď má značka dva stavy: `started` (s časem) a `done`. Další spuštění téhož dne smí
 * pokračovat, když je `started` starší než 20 minut (běh zjevně spadl) a tick není `done`.
 * Aby se při pokračování nic neprovedlo dvakrát, má každý krok vlastní záznam v tabulce
 * `daily_tick_steps` (migrace 0308):
 *
 *  - `once`: krok, který se nesmí opakovat (peníze, trénink, opotřebení, náhoda). Záznam
 *    vzniká PŘED krokem. Když běh spadne uprostřed, zbytek kroku se ten den už neprovede;
 *    je to menší škoda než dvojí stržení peněz nebo dvojí trénink.
 *  - `run`: krok, který opakování snese (má vlastní pojistky). Záznam vzniká PO kroku,
 *    takže přerušený krok se při pokračování dokončí.
 *
 * Bez tabulky kroků (migrace ještě neběžela) se pokračovat nesmí: všechno by proběhlo
 * znovu. Tick se pak chová jako dřív, značka `started` den zamkne.
 */

import { logger } from "../lib/logger";

const M = "daily-tick";

/** Po jak dlouhé době od `started` se běh bere jako spadlý a smí se v něm pokračovat. */
export const TICK_RESUME_AFTER_MS = 20 * 60_000;
/** Značka žije 36 hodin, pokryje i posun na další den. */
export const TICK_MARK_TTL_S = 60 * 60 * 36;
/** Jak dlouho se drží záznamy kroků. */
const STEP_RETENTION_DAYS = 14;

export interface TickMark {
  state: "started" | "done";
  /** ISO čas zápisu značky. */
  at: string;
}

export function tickMarkKey(day: string): string {
  return `daily-tick:${day}`;
}

/** Přečte značku z KV. Starý formát („1") znamená hotový tick. */
export function parseTickMark(raw: string | null | undefined): TickMark | null {
  if (!raw) return null;
  if (raw === "1") return { state: "done", at: "" };
  try {
    const parsed = JSON.parse(raw) as Partial<TickMark>;
    if ((parsed.state === "started" || parsed.state === "done") && typeof parsed.at === "string") {
      return { state: parsed.state, at: parsed.at };
    }
  } catch (e) {
    logger.warn({ module: M }, `nečitelná značka ticku: ${raw.slice(0, 40)}`, e);
  }
  // Nečitelná značka se bere jako hotový tick: bezpečnější než pustit den podruhé.
  return { state: "done", at: "" };
}

export type TickDecision = "fresh" | "resume" | "skip_done" | "skip_running";

/**
 * Smí tick běžet? `force` (jen ruční spuštění adminem) obejde značku, i hotovou;
 * provedou se ale jen kroky bez záznamu o dokončení.
 */
export function decideTick(mark: TickMark | null, nowMs: number, force: boolean): TickDecision {
  if (!mark) return "fresh";
  if (force) return "resume";
  if (mark.state === "done") return "skip_done";
  const startedMs = Date.parse(mark.at);
  if (!Number.isFinite(startedMs)) return "skip_running";
  return nowMs - startedMs >= TICK_RESUME_AFTER_MS ? "resume" : "skip_running";
}

export class TickSteps {
  /** Kroky, které vyhodily chybu. Tick s nimi neskončí jako `done`. */
  readonly failed: string[] = [];
  /** Kroky přeskočené, protože už byly hotové (při pokračování). */
  readonly skipped: string[] = [];

  private constructor(
    private readonly db: D1Database,
    private readonly day: string,
    private readonly done: Set<string>,
    /** false = tabulka kroků není k dispozici, záznamy se nevedou. */
    readonly available: boolean,
  ) {}

  static async load(db: D1Database, day: string): Promise<TickSteps> {
    try {
      const rows = await db.prepare("SELECT step FROM daily_tick_steps WHERE day = ?").bind(day).all<{ step: string }>();
      return new TickSteps(db, day, new Set(rows.results.map((r) => r.step)), true);
    } catch (e) {
      logger.warn({ module: M }, "tabulka daily_tick_steps není k dispozici, kroky se nezaznamenávají", e);
      return new TickSteps(db, day, new Set(), false);
    }
  }

  isDone(step: string): boolean {
    return this.done.has(step);
  }

  /** Kolik kroků už má záznam (pro hlášení). */
  get doneCount(): number {
    return this.done.size;
  }

  private async record(step: string): Promise<boolean> {
    if (!this.available) return true;
    try {
      const res = await this.db.prepare("INSERT OR IGNORE INTO daily_tick_steps (day, step, done_at) VALUES (?, ?, ?)")
        .bind(this.day, step, new Date().toISOString()).run();
      this.done.add(step);
      return (res.meta?.changes ?? 0) > 0;
    } catch (e) {
      logger.warn({ module: M }, `záznam kroku ${step} se nezapsal`, e);
      return true;
    }
  }

  /**
   * Zabere krok, který se smí provést nejvýš jednou. Vrací false, když už ho zabral
   * dřívější (i souběžný) běh. Pro smyčky, kde se krok dělí po klubech.
   */
  async claim(step: string): Promise<boolean> {
    if (this.done.has(step)) { this.skipped.push(step); return false; }
    const mine = await this.record(step);
    if (!mine) this.skipped.push(step);
    return mine;
  }

  /** Krok nejvýš jednou: záznam před provedením. Chyba se zaloguje a tick pokračuje. */
  async once(step: string, fn: () => Promise<void>): Promise<void> {
    if (!(await this.claim(step))) return;
    try {
      await fn();
    } catch (e) {
      this.failed.push(step);
      logger.error({ module: M }, `krok ${step} selhal (znovu se sám nespustí)`, e);
    }
  }

  /** Krok, který opakování snese: záznam až po dokončení. Chyba se zaloguje a tick pokračuje. */
  async run(step: string, fn: () => Promise<void>): Promise<void> {
    if (this.done.has(step)) { this.skipped.push(step); return; }
    try {
      await fn();
      await this.record(step);
    } catch (e) {
      this.failed.push(step);
      logger.error({ module: M }, `krok ${step} selhal (při pokračování se zopakuje)`, e);
    }
  }

  /** Smaže záznamy starší než dva týdny, ať tabulka neroste. */
  async prune(): Promise<void> {
    if (!this.available) return;
    const cutoff = new Date(Date.parse(`${this.day}T00:00:00.000Z`) - STEP_RETENTION_DAYS * 86_400_000).toISOString().slice(0, 10);
    await this.db.prepare("DELETE FROM daily_tick_steps WHERE day < ?").bind(cutoff).run()
      .catch((e) => logger.warn({ module: M }, "úklid daily_tick_steps", e));
  }
}
