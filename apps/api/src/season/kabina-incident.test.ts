import { describe, expect, it } from "vitest";
import { incidentyVKabine } from "./kabina";

const HRACI = ["p", "k", "a", "b", "o", "ko"];

describe("incidenty v kabině", () => {
  it("odhalený pachatel: ostatní −1, jeho kamarádi nic, tahounem být nesmí", () => {
    const { delta, nesmiBytTahoun } = incidentyVKabine(HRACI, new Map([["p", ["pachatel"]]]), new Map([["p", new Set(["k"])]]));
    expect(Object.fromEntries(delta)).toEqual({ a: -1, b: -1, o: -1, ko: -1 });
    expect([...nesmiBytTahoun]).toEqual(["p"]);
  });

  it("neprávem obviněný: sám −2, kamarádi −1", () => {
    const { delta, nesmiBytTahoun } = incidentyVKabine(HRACI, new Map([["o", ["obvineny"]]]), new Map([["o", new Set(["ko", "mimo-kadr"])]]));
    expect(Object.fromEntries(delta)).toEqual({ o: -2, ko: -1 });
    expect(nesmiBytTahoun.size).toBe(0);
  });

  it("bez vlivů nic", () => {
    expect(incidentyVKabine(HRACI, new Map(), new Map()).delta.size).toBe(0);
  });
});
