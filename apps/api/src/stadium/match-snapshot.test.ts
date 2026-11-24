import { describe, expect, it } from "vitest";
import { buildStadiumSnapshot } from "./match-snapshot";

describe("podoba stadionu při zápase", () => {
  const stadium = {
    id: "s1", team_id: "t1", capacity: 200, pitch_type: "hybrid", pitch_moisture: 70, pitch_condition: 64,
    stands: 2, stand_main: 2, fence: 1, lighting: 0, stand_ext_capacity: 40,
    stand_color: "#112233", scoreboard_level: 2, mowing_pattern: null, pitch_snow_clearing_ordered: 1,
  };
  const extensions = [{ slot: "corner_nw", kind: "seats", level: 1 }];

  it("drží zařízení, přístavby, povrch, vzhled areálu a péči, která se na zápas zapnula", () => {
    const snapshot = buildStadiumSnapshot(stadium, 3, extensions, ["Pila Novák"], "snow_clearing");
    expect(snapshot).toMatchObject({
      pitchType: "hybrid", pitchMoisture: 70, mowerLevel: 3, care: "snow_clearing", extensions, sponsors: ["Pila Novák"],
      facilities: { stands: 2, stand_main: 2, fence: 1, lighting: 0, stand_ext_capacity: 40 },
      customization: { standColor: "#112233", scoreboardLevel: 2, mowingPattern: "stripes", fenceColor: null },
    });
    // Jen zařízení: stav trávníku a objednávky do nich nepatří.
    expect(Object.keys(snapshot.facilities).sort()).toEqual(["fence", "lighting", "stand_ext_capacity", "stand_main", "stands"]);
    // Kapacita je i s tribunami a přístavbami, jako na stránce Stadion.
    expect(snapshot.capacity).toBeGreaterThan(200);
  });

  it("bez péče a s prázdným stadionem má výchozí hodnoty", () => {
    expect(buildStadiumSnapshot({}, 0, [], [], null)).toMatchObject({ capacity: 200, pitchType: "natural", pitchMoisture: 50, care: null, facilities: {}, extensions: [] });
  });
});
