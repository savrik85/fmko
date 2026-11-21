/**
 * Rozpoznání, o kom trenér ve zprávě mluví: levné síto podle jmen, model jen když je koho
 * zvažovat, a kontrola toho, co model vrátí (citace musí ve zprávě být, id jen ze seznamu).
 *
 * Ověřeno 2026-11-21 na Workers AI (slabší než prod Gemini) na 10 větách z produ: Šmejkal = kritika,
 * Straka = na úkor, Szabó / pořádně / pivko / Německo / dva Tomanové = nic, „doufám, že bude Šimek“ = nic,
 * „Grillak nebude“ = na úkor (přijatelné). Pešl (decision_for) propadl: model připsal za JSON text
 * a společný `tryParseJson` ho nepřečetl (nahlášeno zvlášť).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../messaging/ai-player-chat", async (orig) => ({
  ...(await orig<typeof import("../messaging/ai-player-chat")>()),
  askModelJson: vi.fn(),
}));

import { askModelJson } from "../messaging/ai-player-chat";
import { buildMentionPrompt, detectMentions, mentionCandidates, parseMentions, type MentionCandidate } from "./detect";

const smejkal: MentionCandidate = { id: "smejkal", firstName: "Rostislav", lastName: "Šmejkal" };
const sima: MentionCandidate = { id: "sima", firstName: "Radek", lastName: "Šíma", nickname: "Zeď" };
const miroslavToman: MentionCandidate = { id: "mtoman", firstName: "Miroslav", lastName: "Toman" };
const martinToman: MentionCandidate = { id: "ttoman", firstName: "Martin", lastName: "Toman" };
const ruzicka: MentionCandidate = { id: "ruzicka", firstName: "Jakub", lastName: "Růžička" };
const poradek: MentionCandidate = { id: "poradek", firstName: "Miroslav", lastName: "Pořádek" };
const club = [smejkal, sima, miroslavToman, martinToman, ruzicka, poradek];

beforeEach(() => { vi.mocked(askModelJson).mockReset(); });

describe("síto jmen", () => {
  it("síto najde Šmejkala i ve tvaru Šmejkalem", () => {
    expect(mentionCandidates(club, "Díky, Radku. Se Šmejkalem si promluvím, flákání trpět nebudu.", ["sima"]).map((c) => c.id))
      .toEqual(["smejkal"]);
  });

  it("adresát sám není zmínka", () => {
    expect(mentionCandidates(club, "Šímo, makal jsi dobře", ["sima"])).toEqual([]);
  });

  it("dva Tomanové jdou do modelu oba", () => {
    const ids = mentionCandidates(club, "co se stalo po zapase v kabine mezi jakubem ruzickou a miroslavem tomanem", []).map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(["ruzicka", "mtoman", "ttoman"]));
  });
});

describe("volání modelu", () => {
  it("bez jména spoluhráče se model nevolá", async () => {
    const out = await detectMentions({}, { message: "Zítra hraješ od začátku", recipientName: "Radek", squadChat: false, club, excludeIds: ["sima"] });
    expect(out).toEqual([]);
    expect(askModelJson).not.toHaveBeenCalled();
  });

  it("model rozhodne o běžném slově: pořádně není Pořádek", async () => {
    vi.mocked(askModelJson).mockResolvedValue({ mentions: [{ player_id: "poradek", kind: "none", quote: "pořádně" }] });
    const out = await detectMentions({}, { message: "Hoši, zítra to tam pořádně rozjedem", recipientName: null, squadChat: true, club, excludeIds: [] });
    expect(askModelJson).toHaveBeenCalledTimes(1);
    expect(out).toEqual([]);
  });

  it("prompt zná vazbu kandidáta na adresáta: tvůj brácha Lukáš je Novotný", () => {
    const lukasN: MentionCandidate = { id: "lnovotny", firstName: "Lukáš", lastName: "Novotný", tieToRecipient: "brothers" };
    const lukasK: MentionCandidate = { id: "lkratochvil", firstName: "Lukáš", lastName: "Kratochvíl" };
    const p = buildMentionPrompt({ message: "tvůj brácha Lukáš se fláká", recipientName: "Tomáš Novotný", squadChat: false, candidates: [lukasN, lukasK] });
    expect(p).toContain("lnovotny: Lukáš Novotný (brácha adresáta)");
    expect(p).toContain("lkratochvil: Lukáš Kratochvíl");
    expect(p).not.toContain("Kratochvíl (");
    expect(p).toContain("Tomáš Novotný");
    expect(p).toMatch(/stejné křestní jméno/i);
  });

  it("prompt zná kandidáty s id a pravidla pro shodná příjmení a běžná slova", () => {
    const p = buildMentionPrompt({ message: "mezi Růžičkou a Tomanem", recipientName: null, squadChat: true, candidates: [miroslavToman, martinToman] });
    expect(p).toContain("mtoman");
    expect(p).toContain("ttoman");
    expect(p).toMatch(/stejn\S* příjmení/);
    expect(p).toMatch(/běžné slovo/);
  });
});

describe("kontrola odpovědi modelu", () => {
  const msg = "Díky, Radku, že to říkáš na rovinu. Se Šmejkalem si promluvím, flákání trpět nebudu.";

  it("model vymyslí citaci, zahodí se", () => {
    expect(parseMentions({ mentions: [{ player_id: "smejkal", kind: "criticism", quote: "je to lempl" }] }, [smejkal], msg)).toEqual([]);
  });

  it("neznámé id a none se zahodí", () => {
    expect(parseMentions({ mentions: [
      { player_id: "nikdo", kind: "criticism", quote: "flákání trpět nebudu" },
      { player_id: "smejkal", kind: "none", quote: "Se Šmejkalem si promluvím" },
    ] }, [smejkal], msg)).toEqual([]);
  });

  it("platná zmínka projde, i když se citace liší diakritikou a velikostí písmen", () => {
    expect(parseMentions({ mentions: [{ player_id: "smejkal", kind: "criticism", quote: "se smejkalem si promluvim, flakani trpet nebudu" }] }, [smejkal], msg))
      .toEqual([{ playerId: "smejkal", kind: "criticism", quote: "se smejkalem si promluvim, flakani trpet nebudu" }]);
  });

  it("stejná dvojice hráč a druh jen jednou, nejvýš tři zmínky", () => {
    const many = { mentions: [
      { player_id: "smejkal", kind: "criticism", quote: "Se Šmejkalem si promluvím" },
      { player_id: "smejkal", kind: "criticism", quote: "flákání trpět nebudu" },
    ] };
    expect(parseMentions(many, [smejkal], msg)).toHaveLength(1);
    expect(parseMentions(null, [smejkal], msg)).toEqual([]);
  });
});
