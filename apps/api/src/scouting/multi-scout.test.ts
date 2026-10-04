import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  createScoutAssignment,
  createPlayerScoutAssignment,
  createMatchScoutAssignment,
  cancelScoutAssignment,
  loadTeamScouts,
  loadActiveAssignments,
} from "./scout-work";

// Falešná in-memory D1 databáze
function createMockDb(initialData?: {
  scouts?: Array<{ id: string; team_id: string; role: string; first_name: string; last_name: string; judgement: number; communication: number }>;
  assignments?: Array<{ id: string; team_id: string; staff_id: string; status: string; assignment_type?: string }>;
  players?: Array<{ id: string; first_name: string; last_name: string; team_id: string | null }>;
  teams?: Array<{ id: string; name: string; budget: number }>;
}) {
  const scouts = [...(initialData?.scouts ?? [])];
  const assignments = [...(initialData?.assignments ?? [])];
  const players = [...(initialData?.players ?? [])];
  const teams = [...(initialData?.teams ?? [])];

  const db: any = {
    prepare: (query: string) => {
      let boundArgs: any[] = [];
      const stmt = {
        bind: (...args: any[]) => {
          boundArgs = args;
          return stmt;
        },
        first: async <T>() => {
          if (query.includes("FROM staff_members WHERE team_id = ? AND role = 'skaut' AND id = ?")) {
            const s = scouts.find((x) => x.team_id === boundArgs[0] && x.id === boundArgs[1]);
            return (s ?? null) as T;
          }
          if (query.includes("FROM staff_members WHERE team_id = ? AND role = 'skaut'")) {
            const s = scouts.find((x) => x.team_id === boundArgs[0]);
            return (s ?? null) as T;
          }
          if (query.includes("FROM scout_assignments WHERE team_id = ? AND staff_id = ? AND status = 'active'")) {
            const a = assignments.find((x) => x.team_id === boundArgs[0] && x.staff_id === boundArgs[1] && x.status === "active");
            return (a ?? null) as T;
          }
          if (query.includes("FROM scout_assignments WHERE team_id = ? AND status = 'active'")) {
            const a = assignments.find((x) => x.team_id === boundArgs[0] && x.status === "active");
            return (a ?? null) as T;
          }
          if (query.includes("FROM players WHERE id = ?")) {
            const p = players.find((x) => x.id === boundArgs[0]);
            return (p ?? null) as T;
          }
          if (query.includes("FROM teams WHERE id = ?")) {
            const t = teams.find((x) => x.id === boundArgs[0]);
            return (t ?? null) as T;
          }
          return null as T;
        },
        all: async <T>() => {
          if (query.includes("FROM staff_members WHERE team_id = ? AND role = 'skaut'")) {
            const list = scouts.filter((x) => x.team_id === boundArgs[0]);
            return { results: list as T[] };
          }
          if (query.includes("FROM scout_assignments WHERE team_id = ? AND status = 'active'")) {
            const list = assignments.filter((x) => x.team_id === boundArgs[0] && x.status === "active");
            return { results: list as T[] };
          }
          return { results: [] as T[] };
        },
        run: async () => {
          if (query.includes("INSERT INTO scout_assignments")) {
            const id = boundArgs[0];
            const team_id = boundArgs[1];
            const staff_id = boundArgs[2];
            assignments.push({ id, team_id, staff_id, status: "active" });
            return { meta: { changes: 1 } };
          }
          if (query.includes("UPDATE scout_assignments SET status = 'cancelled'")) {
            let changes = 0;
            for (const a of assignments) {
              if (boundArgs.length === 3) {
                // team_id, staff_id
                if (a.team_id === boundArgs[1] && a.staff_id === boundArgs[2] && a.status === "active") {
                  a.status = "cancelled";
                  changes++;
                }
              } else {
                if (a.team_id === boundArgs[1] && a.status === "active") {
                  a.status = "cancelled";
                  changes++;
                }
              }
            }
            return { meta: { changes } };
          }
          if (query.includes("INSERT INTO transactions")) {
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 1 } };
        },
      };
      return stmt;
    },
  };
  return { db, scouts, assignments, players, teams };
}

describe("multi-scout assignments", () => {
  it("loadTeamScouts načte všechny skauty týmu", async () => {
    const { db } = createMockDb({
      scouts: [
        { id: "s1", team_id: "t1", role: "skaut", first_name: "Karel", last_name: "Novák", judgement: 14, communication: 12 },
        { id: "s2", team_id: "t1", role: "skaut", first_name: "Josef", last_name: "Dvořák", judgement: 10, communication: 8 },
      ],
    });

    const scouts = await loadTeamScouts(db, "t1");
    expect(scouts.length).toBe(2);
    expect(scouts[0].first_name).toBe("Karel");
    expect(scouts[1].first_name).toBe("Josef");
  });

  it("dva různí skauti mohou mít každý svůj aktivní úkol", async () => {
    const { db } = createMockDb({
      scouts: [
        { id: "s1", team_id: "t1", role: "skaut", first_name: "Karel", last_name: "Novák", judgement: 14, communication: 12 },
        { id: "s2", team_id: "t1", role: "skaut", first_name: "Josef", last_name: "Dvořák", judgement: 10, communication: 8 },
      ],
      teams: [{ id: "t1", name: "FC Dolní Lhota", budget: 50000 }],
    });

    // Úkol pro skauta 1
    const res1 = await createScoutAssignment(db, {
      teamId: "t1",
      staffId: "s1",
      positions: ["DEF"],
      ageMin: 18,
      ageMax: 25,
      radiusKm: 30,
      weeks: 4,
      gameDate: "2026-10-04",
    });
    expect(res1.ok).toBe(true);

    // Úkol pro skauta 2
    const res2 = await createScoutAssignment(db, {
      teamId: "t1",
      staffId: "s2",
      positions: ["FWD"],
      ageMin: 16,
      ageMax: 21,
      radiusKm: 15,
      weeks: 2,
      gameDate: "2026-10-04",
    });
    expect(res2.ok).toBe(true);

    const active = await loadActiveAssignments(db, "t1");
    expect(active.length).toBe(2);
  });

  it("tentýž skaut nemůže mít dva aktivní úkoly naráz", async () => {
    const { db } = createMockDb({
      scouts: [
        { id: "s1", team_id: "t1", role: "skaut", first_name: "Karel", last_name: "Novák", judgement: 14, communication: 12 },
      ],
      teams: [{ id: "t1", name: "FC Dolní Lhota", budget: 50000 }],
    });

    const res1 = await createScoutAssignment(db, {
      teamId: "t1",
      staffId: "s1",
      positions: ["MID"],
      ageMin: 18,
      ageMax: 25,
      radiusKm: 30,
      weeks: 4,
      gameDate: "2026-10-04",
    });
    expect(res1.ok).toBe(true);

    const res2 = await createScoutAssignment(db, {
      teamId: "t1",
      staffId: "s1",
      positions: ["FWD"],
      ageMin: 18,
      ageMax: 25,
      radiusKm: 30,
      weeks: 4,
      gameDate: "2026-10-04",
    });
    expect(res2.ok).toBe(false);
    if (!res2.ok) {
      expect(res2.status).toBe(409);
    }
  });

  it("createPlayerScoutAssignment vytvoří úkol na konkrétního cizího hráče", async () => {
    const { db } = createMockDb({
      scouts: [
        { id: "s1", team_id: "t1", role: "skaut", first_name: "Karel", last_name: "Novák", judgement: 14, communication: 12 },
      ],
      players: [
        { id: "p1", first_name: "Petr", last_name: "Rychlý", team_id: "t2" },
      ],
      teams: [{ id: "t1", name: "FC Dolní Lhota", budget: 50000 }],
    });

    const res = await createPlayerScoutAssignment(db, {
      teamId: "t1",
      staffId: "s1",
      targetPlayerId: "p1",
      gameDate: "2026-10-04",
    });
    expect(res.ok).toBe(true);
  });

  it("createPlayerScoutAssignment zamítne skautování vlastního hráče", async () => {
    const { db } = createMockDb({
      scouts: [
        { id: "s1", team_id: "t1", role: "skaut", first_name: "Karel", last_name: "Novák", judgement: 14, communication: 12 },
      ],
      players: [
        { id: "p1", first_name: "Petr", last_name: "Rychlý", team_id: "t1" },
      ],
      teams: [{ id: "t1", name: "FC Dolní Lhota", budget: 50000 }],
    });

    const res = await createPlayerScoutAssignment(db, {
      teamId: "t1",
      staffId: "s1",
      targetPlayerId: "p1",
      gameDate: "2026-10-04",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(400);
      expect(res.error).toContain("vlastního hráče");
    }
  });

  it("createMatchScoutAssignment vytvoří úkol na zápasový rozbor soupeře", async () => {
    const { db } = createMockDb({
      scouts: [
        { id: "s1", team_id: "t1", role: "skaut", first_name: "Karel", last_name: "Novák", judgement: 14, communication: 12 },
      ],
      teams: [
        { id: "t1", name: "FC Dolní Lhota", budget: 50000 },
        { id: "t2", name: "FK Horní Lhota", budget: 30000 },
      ],
    });

    const res = await createMatchScoutAssignment(db, {
      teamId: "t1",
      staffId: "s1",
      targetTeamId: "t2",
      gameDate: "2026-10-04",
    });
    expect(res.ok).toBe(true);
  });

  it("cancelScoutAssignment zruší úkol pouze zvoleného skauta", async () => {
    const { db, assignments } = createMockDb({
      scouts: [
        { id: "s1", team_id: "t1", role: "skaut", first_name: "Karel", last_name: "Novák", judgement: 14, communication: 12 },
        { id: "s2", team_id: "t1", role: "skaut", first_name: "Josef", last_name: "Dvořák", judgement: 10, communication: 8 },
      ],
      assignments: [
        { id: "a1", team_id: "t1", staff_id: "s1", status: "active" },
        { id: "a2", team_id: "t1", staff_id: "s2", status: "active" },
      ],
    });

    await cancelScoutAssignment(db, "t1", "cancelled", "s1");
    expect(assignments.find((a) => a.id === "a1")?.status).toBe("cancelled");
    expect(assignments.find((a) => a.id === "a2")?.status).toBe("active");
  });
});
