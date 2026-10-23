import { describe, expect, it } from "vitest";
import { isTransientDbError } from "./transient-db-error";

describe("přechodné chyby D1", () => {
  it("export databáze a přetížení jsou přechodné (texty z produkce)", () => {
    expect(isTransientDbError(new Error("D1_ERROR: Currently processing a long-running export."))).toBe(true);
    expect(isTransientDbError(new Error("D1_ERROR: D1 DB is overloaded. Requests queued for too long."))).toBe(true);
    expect(isTransientDbError(new Error("D1_ERROR: D1 DB is overloaded. Too many requests queued."))).toBe(true);
  });

  it("výpadek spojení a reset úložiště jsou přechodné", () => {
    expect(isTransientDbError(new Error("D1_ERROR: Network connection lost."))).toBe(true);
    expect(isTransientDbError(new Error("D1 DB storage operation exceeded timeout which caused object to be reset."))).toBe(true);
  });

  it("chyba v SQL nebo v kódu přechodná není", () => {
    expect(isTransientDbError(new Error("D1_ERROR: no such column: match_date: SQLITE_ERROR"))).toBe(false);
    expect(isTransientDbError(new TypeError("Cannot read properties of undefined (reading 'id')"))).toBe(false);
    expect(isTransientDbError(null)).toBe(false);
  });
});
