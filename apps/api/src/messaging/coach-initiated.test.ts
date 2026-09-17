import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./ai-player-chat", () => ({
  generateCoachInitiatedReply: vi.fn(),
  generateSquadGroupReaction: vi.fn(async () => "Jasně, trenére."),
  GeminiUnavailableError: class GeminiUnavailableError extends Error {},
}));
vi.mock("./ai-player-spawn", () => ({
  loadPlayerSnapshot: vi.fn((r: Record<string, unknown>) => ({
    id: r.id, firstName: "Jan", lastName: "Svědek", temper: 50, leadership: 50, morale: 50, coachRelationship: 50,
  })),
  loadTeamContext: vi.fn(async () => ({ teamName: "TJ Dvory" })),
  pockejNezDopise: vi.fn(async () => undefined),
  nactiSituaceTymu: vi.fn(async () => new Map()),
}));
vi.mock("../incidents/znalosti-db", () => ({ nactiZnalostiHrace: vi.fn(async () => []) }));

import { FalesnaD1, jakoD1 } from "../incidents/testovaci-d1";
import { nactiZnalostiHrace } from "../incidents/znalosti-db";
import { generateCoachInitiatedReply, generateSquadGroupReaction } from "./ai-player-chat";
import { nactiSituaceTymu } from "./ai-player-spawn";
import { replyInSquadGroup, startCoachThread } from "./coach-initiated";

const TEMA = { incidentId: "inc-1", incidentDen: "2026-09-16" };

function db(stav: unknown) {
  return new FalesnaD1([
    { sql: /FROM players p/, first: { id: "s" }, all: [{ id: "s" }] },
    { sql: /SELECT ai_thread_state FROM conversations/, first: { ai_thread_state: stav === null ? null : JSON.stringify(stav) } },
  ]);
}

const zacni = (d: FalesnaD1) =>
  startCoachThread(jakoD1(d), {}, { convId: "konv-1", teamId: "tym-a", playerId: "s", coachMessage: "Kdo ukradl dresy?" });
const stavVlakna = (d: FalesnaD1) =>
  d.davky.flat().find((q) => /UPDATE conversations SET ai_thread_active/.test(q.sql))?.params[1];

beforeEach(() => vi.clearAllMocks());

describe("konverzace začatá trenérem a téma incidentu", () => {
  it("načte znalosti s tématem z vlákna", async () => {
    vi.mocked(generateCoachInitiatedReply).mockResolvedValue({ body: "Nic nevím.", conversationComplete: false });
    await zacni(db(TEMA));
    expect(nactiZnalostiHrace).toHaveBeenCalledWith(expect.anything(), {
      teamId: "tym-a", playerId: "s", tema: { incidentId: "inc-1", den: "2026-09-16" },
    });
  });

  it("pokračující vlákno si téma nese dál", async () => {
    vi.mocked(generateCoachInitiatedReply).mockResolvedValue({ body: "Nic nevím.", conversationComplete: false });
    const d = db(TEMA);
    await zacni(d);
    expect(JSON.parse(String(stavVlakna(d)))).toMatchObject({ awaiting: "coach", ...TEMA });
  });

  it("uzavřená výměna téma nezahodí; bez tématu zůstane stav prázdný", async () => {
    vi.mocked(generateCoachInitiatedReply).mockResolvedValue({ body: "Nic nevím.", conversationComplete: true });
    const s = db(TEMA);
    await zacni(s);
    expect(JSON.parse(String(stavVlakna(s)))).toEqual(TEMA);
    const bez = db(null);
    await zacni(bez);
    expect(stavVlakna(bez)).toBeNull();
  });
});

describe("kabina", () => {
  it("mluvčí dostane jen veřejné znalosti", async () => {
    await replyInSquadGroup(jakoD1(db(null)), {}, { teamId: "tym-a", convId: "kabina", coachMessage: "Kdo ukradl dresy?" });
    expect(nactiZnalostiHrace).toHaveBeenCalledWith(expect.anything(), { teamId: "tym-a", playerId: "s" });
  });
});

describe("hráč zná svou životní situaci", () => {
  it("1:1 konverzace ji naplní ze stejného zdroje jako spawn", async () => {
    vi.mocked(generateCoachInitiatedReply).mockResolvedValue({ body: "Nic nevím.", conversationComplete: false });
    vi.mocked(nactiSituaceTymu).mockResolvedValueOnce(new Map([["s", "dluhy"]]));
    await zacni(db(null));
    const player = vi.mocked(generateCoachInitiatedReply).mock.calls[0][1] as { zivotniSituace?: unknown };
    expect(player.zivotniSituace).toEqual({ kind: "dluhy", label: "Dluhy" });
  });

  it("reakce v kabině ji naplní mluvčímu taky", async () => {
    vi.mocked(nactiSituaceTymu).mockResolvedValueOnce(new Map([["s", "rozvod"]]));
    await replyInSquadGroup(jakoD1(db(null)), {}, { teamId: "tym-a", convId: "kabina", coachMessage: "Ahoj" });
    const mluvci = vi.mocked(generateSquadGroupReaction).mock.calls[0][1] as { zivotniSituace?: unknown };
    expect(mluvci.zivotniSituace).toEqual({ kind: "rozvod", label: "Rozvod" });
  });
});
