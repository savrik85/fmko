import { describe, expect, it } from "vitest";
import {
  applyMutes, buildFeedItems, normalizeTime, parseInterviewBody, parseTargetKey, rankTime,
  sortFeed, splitResults, cleanUserText,
  type NewsRow, type PostRow, type Viewer,
} from "./feed-model";
import { cleanReply, plannedReplies } from "./ai-replies";

const viewer: Viewer = { teamId: "t-me", userId: "u-me", teamName: "AC Jitona Spůle" };

function news(over: Partial<NewsRow>): NewsRow {
  return {
    id: "n1", type: "transfer", headline: "Přestup! Jan Novák míří z FK A do FK B", body: "Jan Novák odchází z FK A do FK B.",
    team_id: null, team_name: null, league_id: "l1", league_name: "Schwan liga", district: "Prachatice",
    game_week: null, created_at: "2026-11-07 10:00:00", ...over,
  };
}

function post(over: Partial<PostRow>): PostRow {
  return {
    id: "p1", user_id: "u-other", team_id: "t-other", team_name: "FK Engel Vimperk", district: "Prachatice",
    manager_name: "Petr K.", manager_avatar: null, body: "Kdo jede v sobotu?", created_at: "2026-11-07T09:00:00Z", ...over,
  };
}

describe("klíče příspěvků", () => {
  it("rozloží souhrn přestupů i s okresem, ve kterém je mezera", () => {
    expect(parseTargetKey("bundle:transfers:Praha U21:2026-11-07")).toEqual({ kind: "bundle", district: "Praha U21", date: "2026-11-07" });
  });

  it("odmítne neznámý druh i rozbitý tvar", () => {
    expect(parseTargetKey("nic:1")).toBeNull();
    expect(parseTargetKey("post:")).toBeNull();
    expect(parseTargetKey("post:a:b")).toBeNull();
    expect(parseTargetKey("bundle:transfers:Praha:7.11.")).toBeNull();
  });

  it("sjednotí oba tvary času z tabulky news", () => {
    expect(normalizeTime("2026-11-07 10:00:00")).toBe("2026-11-07T10:00:00Z");
    expect(normalizeTime("2026-11-07T10:00:00Z")).toBe("2026-11-07T10:00:00Z");
  });
});

describe("skládání zdi", () => {
  it("přestupy jednoho okresu a dne sloučí do jednoho souhrnu, jiný okres zvlášť", () => {
    const items = buildFeedItems([
      news({ id: "a", headline: "Přestup! Jan Novák míří z FK A do FK B" }),
      news({ id: "b", headline: "Petr Malý posílí kádr FK C", created_at: "2026-11-07T15:00:00Z" }),
      news({ id: "c", headline: "Hostování: Karel Vrba zamířil do FK D", district: "Praha" }),
      news({ id: "d", headline: "Josef Dlouhý posílí kádr FK E", created_at: "2026-11-06 12:00:00" }),
    ], [], viewer);
    const bundles = items.filter((i) => i.kind === "bundle");
    expect(bundles.map((b) => b.key).sort()).toEqual([
      "bundle:transfers:Prachatice:2026-11-06",
      "bundle:transfers:Prachatice:2026-11-07",
      "bundle:transfers:Praha:2026-11-07",
    ]);
    const today = bundles.find((b) => b.key === "bundle:transfers:Prachatice:2026-11-07")!;
    expect(today.lines).toEqual(["Petr Malý posílí kádr FK C", "Jan Novák míří z FK A do FK B"]);
    expect(today.headline).toBe("Přestupy dne · 7. 11.");
  });

  it("přestup vlastního klubu zůstane samostatně, i když článek nemá team_id", () => {
    const items = buildFeedItems([news({ id: "mine", headline: "Ondřej Šťastný posílí kádr AC Jitona Spůle" })], [], viewer);
    expect(items).toHaveLength(1);
    expect(items[0].key).toBe("news:mine");
  });

  it("stejný titulek dvakrát za den ukáže v souhrnu jednou", () => {
    const items = buildFeedItems([
      news({ id: "a", headline: "FK C nabízí Davida Zocha na přestup" }),
      news({ id: "b", headline: "FK C nabízí Davida Zocha na přestup" }),
    ], [], viewer);
    expect(items[0].lines).toEqual(["FK C nabízí Davida Zocha na přestup"]);
  });

  it("článek mimo seznam typů (propagace zápasu, sázky) na zeď nejde", () => {
    expect(buildFeedItems([news({ type: "promotion" }), news({ type: "betting" })], [], viewer)).toHaveLength(0);
  });

  it("výsledky kola rozdělí po zápasech", () => {
    expect(splitResults("FK A porazil FK B 6:0. FK C remizoval s FK D 2:2. FK E zvítězil nad FK F 10:1.")).toEqual([
      "FK A porazil FK B 6:0", "FK C remizoval s FK D 2:2", "FK E zvítězil nad FK F 10:1",
    ]);
  });

  it("rozhovor přečte z JSONu i s odpověďmi", () => {
    const body = JSON.stringify({ managerName: "Karel", teamName: "FK A", article: "Úvod", qa: [{ q: "Otázka?", a: "Odpověď." }, { q: 1 }] });
    expect(parseInterviewBody("interview", body)).toEqual({
      personName: "Karel", personAvatar: null, teamName: "FK A", article: "Úvod", qa: [{ q: "Otázka?", a: "Odpověď." }],
    });
    expect(parseInterviewBody("interview", "není JSON")).toBeNull();
  });
});

describe("pořadí: příspěvky lidí se neztratí", () => {
  it("příspěvek manažera má náskok před o pár hodin novějšími články", () => {
    const items = buildFeedItems(
      [news({ id: "r", type: "round_results", headline: "5. kolo", body: "FK A porazil FK B 1:0.", created_at: "2026-11-07 17:00:00" })],
      [post({ created_at: "2026-11-07T09:00:00Z" })],
      viewer,
    );
    expect(sortFeed(items, new Map()).map((i) => i.key)).toEqual(["post:p1", "news:r"]);
  });

  it("starý článek s čerstvou diskusí vyplave nad nový", () => {
    const items = buildFeedItems([
      news({ id: "old", type: "interview", body: "{}", created_at: "2026-11-05 10:00:00" }),
      news({ id: "new", type: "interview", body: "{}", created_at: "2026-11-07 10:00:00" }),
    ], [], viewer);
    const sorted = sortFeed(items, new Map([["news:old", "2026-11-07T12:00:00Z"]]));
    expect(sorted[0].key).toBe("news:old");
    expect(rankTime(sorted[0], "2026-11-07T12:00:00Z")).toBe(Date.parse("2026-11-07T12:00:00Z"));
  });
});

describe("skrývání", () => {
  const items = buildFeedItems([
    news({ id: "t", district: "Praha" }),
    news({ id: "i", type: "interview", body: "{}", team_id: "t-noisy", district: "Prachatice" }),
    news({ id: "r", type: "round_results", body: "", district: "Prachatice" }),
  ], [post({ id: "mine", user_id: "u-me", team_id: "t-me", district: "Praha" }), post({ id: "noisy", team_id: "t-noisy" })], viewer);

  it("okres, klub, kategorie i jednotlivý příspěvek", () => {
    const left = applyMutes(items, [
      { kind: "district", value: "Praha" },
      { kind: "team", value: "t-noisy" },
      { kind: "item", value: "news:r" },
    ], viewer).map((i) => i.key);
    expect(left).toEqual(["post:mine"]);
  });

  it("kategorie přestupů skryje i souhrny", () => {
    const left = applyMutes(items, [{ kind: "category", value: "transfers" }], viewer).map((i) => i.key);
    expect(left.some((k) => k.startsWith("bundle:"))).toBe(false);
    expect(left).toContain("news:i");
  });

  it("vlastní příspěvek zůstane vidět, i když je z okresu, který si skryl", () => {
    expect(applyMutes(items, [{ kind: "district", value: "Praha" }], viewer).map((i) => i.key)).toContain("post:mine");
  });
});

describe("text od lidí a od modelu", () => {
  it("prázdný text odmítne, dlouhý ořízne", () => {
    expect(cleanUserText("   ", 10)).toBeNull();
    expect(cleanUserText(42, 10)).toBeNull();
    expect(cleanUserText("a\n\n\n\nb", 10)).toBe("a\n\nb");
    expect(cleanUserText("x".repeat(20), 10)).toBe("x".repeat(10));
  });

  it("odpověď modelu bez uvozovek, hashtagů a dlouhých pomlček", () => {
    expect(cleanReply("„Trenére — tohle se ti fakt nepovedlo #prales“")).toBe("Trenére, tohle se ti fakt nepovedlo");
    const long = `${"Slovo ".repeat(30)}konec věty. ${"další ".repeat(40)}`;
    expect(cleanReply(long)!.length).toBeLessThanOrEqual(281);
    expect(cleanReply("   ")).toBeNull();
  });

  it("na nový příspěvek přijdou dvě odpovědi, na komentář jen občas", () => {
    expect(plannedReplies({ commentId: null, repliedPersonaId: null }, 0.99)).toBe(2);
    expect(plannedReplies({ commentId: "c", repliedPersonaId: null }, 0.1)).toBe(1);
    expect(plannedReplies({ commentId: "c", repliedPersonaId: null }, 0.9)).toBe(0);
    expect(plannedReplies({ commentId: "c", repliedPersonaId: "fl-1" }, 0.5)).toBe(1);
  });
});
