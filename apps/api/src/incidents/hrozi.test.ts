import { describe, expect, it } from "vitest";
import { promluvil, sanceHroziciho } from "./hrozi";

const ZAKLAD = { promluvil: false, vztahKTrenerovi: 50, kind: "vitrina", zabezpeceni: 0, nepritomen: false };

describe("šance, že hráč ohlášený čin udělá (spec 9a)", () => {
  it("výchozí 50 %", () => {
    expect(sanceHroziciho(ZAKLAD)).toBe(50);
  });

  it("rozhovor ubere 30 + vztah k trenérovi / 5", () => {
    expect(sanceHroziciho({ ...ZAKLAD, promluvil: true })).toBe(10);
    expect(sanceHroziciho({ ...ZAKLAD, promluvil: true, vztahKTrenerovi: 100 })).toBe(0);
    expect(sanceHroziciho({ ...ZAKLAD, promluvil: true, vztahKTrenerovi: 0 })).toBe(20);
  });

  it("zabezpečení pomáhá jen u skladu", () => {
    expect(sanceHroziciho({ ...ZAKLAD, kind: "vloupani_sklad", zabezpeceni: 1 })).toBe(35);
    expect(sanceHroziciho({ ...ZAKLAD, zabezpeceni: 3 })).toBe(50);
  });

  it("zraněný nebo nepřítomný nic neudělá", () => {
    expect(sanceHroziciho({ ...ZAKLAD, nepritomen: true })).toBe(0);
  });
});

describe("rozhovor v datech incidentu", () => {
  it("promluvil jen s vyplněným dnem, rozbitý JSON nevadí", () => {
    expect(promluvil(null)).toBe(false);
    expect(promluvil("{}")).toBe(false);
    expect(promluvil(JSON.stringify({ promluvil: "2026-09-17" }))).toBe(true);
    expect(promluvil("rozbité")).toBe(false);
  });
});
