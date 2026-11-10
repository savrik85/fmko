/**
 * Rollover nepolyká chyby (skutečná D1 přes Miniflare, jen tabulka stavu; samospráva
 * a komunální volby jsou nahrazené, ať jde chybu vyvolat přesně tam, kde je potřeba).
 *
 * Dřív fáze chybu chytila, vrátila text a zapsala se jako hotová: sazebník nové sezóny
 * nebo nové vedení obcí pak chybělo a rollover se tvářil dokončený.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { Miniflare } from "miniflare";

const governance = vi.hoisted(() => ({ failed: [] as string[], calls: 0 }));
const elections = vi.hoisted(() => ({ error: null as Error | null, calls: 0 }));

vi.mock("../competition/rollover", () => ({
  applyGovernanceRollover: async () => {
    governance.calls++;
    return { leagues: 1, enabled: 0, disabled: 0, feesCollected: 0, failed: governance.failed };
  },
}));
vi.mock("../villages/municipal-elections", () => ({
  holdMunicipalElections: async () => {
    elections.calls++;
    if (elections.error) throw elections.error;
    return { villagesProcessed: 3, officialsReplaced: 9, favorRowsReset: 3, articlesPublished: 1, teamsNotified: 2 };
  },
}));

import {
  PHASE_INTERRUPTED, ROLLOVER_PHASES, beginRollover, phaseErrorKey, resolveRolloverPhase, rolloverPhaseKey, runRolloverStep,
  type RolloverPhase,
} from "./season-rollover";
import { readProgress, writeProgress } from "./season-progress";

let mf: Miniflare;
let db: D1Database;

/** Všechny fáze před danou jsou hotové, rollover stojí přesně na ní. */
async function rolloverAt(phase: RolloverPhase): Promise<void> {
  await beginRollover(db, 1);
  for (const p of ROLLOVER_PHASES) {
    if (p === phase) return;
    await writeProgress(db, rolloverPhaseKey(p, 1), "done");
  }
}

beforeAll(async () => {
  mf = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
  db = await mf.getD1Database("DB");
  const migration = readFileSync(new URL("../../migrations/0103_season_end.sql", import.meta.url), "utf8");
  const table = migration.slice(migration.indexOf("CREATE TABLE IF NOT EXISTS season_end_progress"));
  await db.exec(table.slice(0, table.indexOf(";") + 1).replace(/--[^\n]*/g, "").replace(/\n/g, " "));
});

afterAll(async () => { await mf?.dispose(); });

beforeEach(async () => {
  await db.prepare("DELETE FROM season_end_progress").run();
  governance.failed = [];
  governance.calls = 0;
  elections.error = null;
  elections.calls = 0;
});

describe("opakovatelná fáze (samospráva)", () => {
  it("selhání soutěže fázi neuzavře, chyba se uloží a další krok fázi zopakuje", async () => {
    await rolloverAt("governance");
    governance.failed = ["liga-1"];

    const failed = await runRolloverStep(db, 1);
    expect(failed).toMatchObject({ phase: "governance", status: "error", finished: false });
    expect(failed.detail).toContain("liga-1");
    expect(failed.detail).toContain("další krok ji zopakuje");
    expect((await readProgress(db, rolloverPhaseKey("governance", 1)))?.status ?? null).not.toBe("done");
    const saved = await readProgress(db, phaseErrorKey(rolloverPhaseKey("governance", 1)));
    expect(saved?.status).toBe("error");
    expect(JSON.parse(saved!.cursor!).message).toContain("samospráva selhala u soutěží: liga-1");

    governance.failed = [];
    const retried = await runRolloverStep(db, 1);
    expect(retried).toMatchObject({ phase: "governance", status: "done" });
    expect(governance.calls).toBe(2);
    expect((await readProgress(db, rolloverPhaseKey("governance", 1)))?.status).toBe("done");
  });
});

describe("fáze nejvýš jednou (komunální volby)", () => {
  it("chyba ji nezapíše jako hotovou: zůstane přerušená a sama se nezopakuje", async () => {
    await rolloverAt("municipal_elections");
    elections.error = new Error("FOREIGN KEY constraint failed");

    const failed = await runRolloverStep(db, 1);
    expect(failed).toMatchObject({ phase: "municipal_elections", status: "error", finished: false });
    expect(failed.detail).toContain("FOREIGN KEY constraint failed");
    expect(failed.detail).toContain("action=retry nebo action=skip");
    expect((await readProgress(db, rolloverPhaseKey("municipal_elections", 1)))?.status).toBe(PHASE_INTERRUPTED);

    // Chyba je pryč, ale bez rozhodnutí se volby nepustí podruhé a rollover neskončí.
    elections.error = null;
    const blocked = await runRolloverStep(db, 1);
    expect(blocked).toMatchObject({ phase: "municipal_elections", status: "error", finished: false });
    expect(elections.calls).toBe(1);

    expect(await resolveRolloverPhase(db, 1, "municipal_elections", null, true))
      .toMatchObject({ waiting: true, status: PHASE_INTERRUPTED, lastError: "FOREIGN KEY constraint failed", changed: false });
  });

  it("retry volby pustí znovu, skip je uzavře bez dokončení; obojí odblokuje rollover", async () => {
    await rolloverAt("municipal_elections");
    elections.error = new Error("pád");
    await runRolloverStep(db, 1);
    elections.error = null;

    await resolveRolloverPhase(db, 1, "municipal_elections", "retry", false);
    expect(await runRolloverStep(db, 1)).toMatchObject({ phase: "municipal_elections", status: "done" });
    expect(elections.calls).toBe(2);
    expect((await runRolloverStep(db, 1)).finished).toBe(true);

    await db.prepare("DELETE FROM season_end_progress").run();
    await rolloverAt("municipal_elections");
    elections.error = new Error("pád");
    await runRolloverStep(db, 1);
    await resolveRolloverPhase(db, 1, "municipal_elections", "skip", false);
    const done = await runRolloverStep(db, 1);
    expect(done.finished).toBe(true);
    expect(elections.calls).toBe(3);
  });

  it("o fázi, která nečeká, se rozhodnout nedá; opakovatelná fáze ruční rozhodnutí nemá", async () => {
    await rolloverAt("municipal_elections");
    expect(await resolveRolloverPhase(db, 1, "municipal_elections", "skip", false)).toMatchObject({ waiting: false, changed: false });
    expect((await readProgress(db, rolloverPhaseKey("municipal_elections", 1)))?.status ?? null).toBeNull();
    expect(await resolveRolloverPhase(db, 1, "governance", "skip", false)).toMatchObject({ waiting: false, changed: false, status: "done" });
  });
});
