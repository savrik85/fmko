/** Pravidla SMS od majitelů: limity doručení, dopady odpovědí, výběr majitele, verdikt sezóny. */
import { describe, expect, it } from "vitest";
import {
  addDays, classifyFreeReply, dayDiff, ignoreFavorDelta, leadingLosses, occasionForResult, pickDeliverable,
  pickRelationshipOwner, replyFavorDelta, seasonVerdict, type PendingOwnerSms, type RelationshipOwner,
} from "./owner-sms-rules";

const TODAY = "2026-09-23";
const p = (id: string, sponsorId: number, occasion: PendingOwnerSms["occasion"]): PendingOwnerSms =>
  ({ id, sponsorId, occasion, createdDay: TODAY });

describe("pickDeliverable", () => {
  it("vybere nejvyšší prioritu", () => {
    expect(pickDeliverable([p("a", 2, "after_win"), p("b", 1, "riot")], [], TODAY)?.id).toBe("b");
  });

  it("dnes už SMS od majitele přišla: nic", () => {
    expect(pickDeliverable([p("a", 1, "riot")], [{ sponsorId: 9, occasion: "after_win", sentDay: TODAY }], TODAY)).toBeNull();
  });

  it("majitel psal před dvěma dny: mlčí", () => {
    expect(pickDeliverable([p("a", 1, "after_loss")], [{ sponsorId: 1, occasion: "riot", sentDay: "2026-09-21" }], TODAY)).toBeNull();
  });

  it("po pěti dnech smí zase", () => {
    expect(pickDeliverable([p("a", 1, "after_loss")], [{ sponsorId: 1, occasion: "riot", sentDay: "2026-09-18" }], TODAY)?.id).toBe("a");
  });

  it("den před zápasem nebrání zprávě po zápase", () => {
    expect(pickDeliverable([p("a", 1, "after_win")], [{ sponsorId: 1, occasion: "match_eve", sentDay: "2026-09-22" }], TODAY)?.id).toBe("a");
  });

  it("majitel v pauze přeskočí na dalšího kandidáta", () => {
    const sent = [{ sponsorId: 1, occasion: "after_win" as const, sentDay: "2026-09-21" }];
    expect(pickDeliverable([p("a", 1, "riot"), p("b", 2, "after_win")], sent, TODAY)?.id).toBe("b");
  });
});

describe("dopady odpovědí", () => {
  it("fanoušek vlídně +3, odbytí −4", () => {
    expect(replyFavorDelta("fan", "warm")).toBe(3);
    expect(replyFavorDelta("fan", "dismissive")).toBe(-4);
  });

  it("podnikateli sedí věcnost víc než vlídnost", () => {
    expect(replyFavorDelta("businessman", "neutral")).toBe(2);
    expect(replyFavorDelta("businessman", "warm")).toBe(1);
  });

  it("mlčení je malý postih", () => {
    expect(ignoreFavorDelta("businessman")).toBe(-1);
    expect(ignoreFavorDelta("cautious")).toBe(-2);
  });
});

describe("classifyFreeReply", () => {
  it("smířlivě = vlídně", () => expect(classifyFreeReply("Chápu, mrzí mě to, napravíme to.")).toBe("warm"));
  it("tvrdě = odbýt", () => expect(classifyFreeReply("Konec debaty, rozhoduju já.")).toBe("dismissive"));
  it("krátké ok = odbýt", () => expect(classifyFreeReply("ok")).toBe("dismissive"));
  it("jinak věcně", () => expect(classifyFreeReply("Uvidíme po víkendu, co se dá dělat.")).toBe("neutral"));
});

describe("pickRelationshipOwner", () => {
  const owners: RelationshipOwner[] = [
    { sponsorId: 1, personality: "fan", favor: 80, hasContract: false, isMain: false },
    { sponsorId: 2, personality: "businessman", favor: 30, hasContract: true, isMain: true },
    { sponsorId: 3, personality: "cautious", favor: 40, hasContract: false, isMain: false },
  ];
  it("hlavní sponzor má přednost před vyšší náklonností", () => expect(pickRelationshipOwner(owners)?.sponsorId).toBe(2));
  it("jen opatrný", () => expect(pickRelationshipOwner(owners, { only: "cautious" })?.sponsorId).toBe(3));
  it("přednost opatrnému", () => expect(pickRelationshipOwner(owners, { prefer: "cautious" })?.sponsorId).toBe(3));
  it("nikdo", () => expect(pickRelationshipOwner([], {})).toBeNull());
});

describe("drobnosti", () => {
  it("verdikt sezóny", () => {
    expect(seasonVerdict(10, 5, 26)).toBe("season_thanks");
    expect(seasonVerdict(4, 4, 26)).toBe("season_complaint");
    expect(seasonVerdict(0, 0, 0)).toBeNull();
  });
  it("výsledek zápasu", () => {
    expect(occasionForResult(2, 1)).toBe("after_win");
    expect(occasionForResult(0, 1)).toBe("after_loss");
    expect(occasionForResult(1, 1)).toBeNull();
  });
  it("prohry v řadě", () => {
    expect(leadingLosses(["L", "L", "L", "W", "L"])).toBe(3);
    expect(leadingLosses(["W", "L"])).toBe(0);
  });
  it("dny", () => {
    expect(addDays("2026-09-23", 3)).toBe("2026-09-26");
    expect(addDays("2026-09-23T16:00:00.000Z", 1)).toBe("2026-09-24");
    expect(dayDiff("2026-09-18", TODAY)).toBe(5);
  });
});

describe("priority slibů sponzorům", () => {
  it("porušený slib předběhne splněný", () => {
    expect(pickDeliverable([p("a", 1, "promise_kept"), p("b", 1, "promise_broken")], [], TODAY)?.id).toBe("b");
  });

  it("výpověď předběhne porušený slib i skandál, výtržnost má pořád přednost", () => {
    expect(pickDeliverable([p("a", 1, "promise_broken"), p("b", 2, "sponsor_terminates"), p("c", 3, "scandal")], [], TODAY)?.id).toBe("b");
    expect(pickDeliverable([p("a", 1, "sponsor_terminates"), p("b", 2, "riot")], [], TODAY)?.id).toBe("b");
  });
});
