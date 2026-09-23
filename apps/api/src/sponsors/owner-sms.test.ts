/**
 * DB vrstva SMS od majitelů nad falešnou D1: odpověď zapisuje náklonnost přes deník,
 * dvojí odpověď dopad nezdvojí, mlčení stojí jen tam, kde se čekala odpověď,
 * a denní limit zastaví doručení.
 */
import { describe, expect, it } from "vitest";
import { FalesnaD1, jakoD1 } from "../incidents/testovaci-d1";
import { closeOwnerSmsForRollover, deliverOwnerSmsForTeam, expireOwnerSmsReplies, handleOwnerSmsReply } from "./owner-sms";
import { OWNER_REPLY_BACK } from "./owner-sms-texts";

const STAV = JSON.stringify({ kind: "sponsor_owner", smsId: "s1", sponsorId: 7, awaiting: "coach" });
const MAJITEL = {
  sql: /FROM sponsor_owners WHERE sponsor_id IN/,
  all: [{ sponsor_id: 7, first_name: "Jan", last_name: "Novák", age: 50, face_config: "{}", personality: "fan" }],
};

function logDeniku(db: FalesnaD1) {
  return db.davky.flat().filter((d) => /INSERT INTO sponsor_favor_log/.test(d.sql));
}

function zpravaMajitele(db: FalesnaD1) {
  return db.davky.flat().find((d) => /INSERT INTO messages/.test(d.sql));
}

describe("handleOwnerSmsReply", () => {
  it("vlídná odpověď fanouškovi na SMS 'riot': +3 s důvodem do deníku, odpověď ze záporné nálady", async () => {
    const db = new FalesnaD1([
      { sql: /SELECT team_id, ai_thread_state FROM conversations/, first: { team_id: "t1", ai_thread_state: STAV } },
      { sql: /UPDATE sponsor_owner_sms SET status = 'replied'/, all: [{ occasion: "riot" }] },
      MAJITEL,
    ]);
    expect(await handleOwnerSmsReply(jakoD1(db), "c1", "Díky moc", "warm")).toBe(true);
    const log = logDeniku(db);
    expect(log).toHaveLength(1);
    expect(log[0].params.slice(0, 4)).toEqual([7, "t1", 3, "odpověď na SMS"]);
    expect(db.pocet(/ai_thread_active = 0, ai_thread_state = NULL/)).toBe(1);
    expect(db.pocet(/INSERT INTO messages/)).toBe(1);
    // "riot" je záporná nálada (OCCASION_REPLY_KIND.riot = "trouble"), delta +3 = směr "up".
    expect(OWNER_REPLY_BACK.fan.negative.up).toContain(zpravaMajitele(db)?.params[4]);
  });

  it("odpověď vlastními slovy se klasifikuje lexikálně, odpověď z kladné nálady", async () => {
    const db = new FalesnaD1([
      { sql: /SELECT team_id, ai_thread_state FROM conversations/, first: { team_id: "t1", ai_thread_state: STAV } },
      { sql: /UPDATE sponsor_owner_sms SET status = 'replied'/, all: [{ occasion: "after_win" }] },
      MAJITEL,
    ]);
    await handleOwnerSmsReply(jakoD1(db), "c1", "Konec debaty, rozhoduju já.", null);
    expect(logDeniku(db)[0].params.slice(2, 4)).toEqual([-4, "odbytá SMS"]);
    // "after_win" je kladná nálada, delta -4 = směr "down".
    expect(OWNER_REPLY_BACK.fan.positive.down).toContain(zpravaMajitele(db)?.params[4]);
  });

  it("SMS už je vyřízená: náklonnost se nepohne", async () => {
    const db = new FalesnaD1([
      { sql: /SELECT team_id, ai_thread_state FROM conversations/, first: { team_id: "t1", ai_thread_state: STAV } },
      { sql: /UPDATE sponsor_owner_sms SET status = 'replied'/, all: [] },
      MAJITEL,
    ]);
    expect(await handleOwnerSmsReply(jakoD1(db), "c1", "Díky", "warm")).toBe(true);
    expect(logDeniku(db)).toHaveLength(0);
  });

  it("cizí vlákno (vůdce fanoušků) nechá být", async () => {
    const db = new FalesnaD1([
      { sql: /SELECT team_id, ai_thread_state FROM conversations/, first: { team_id: "t1", ai_thread_state: JSON.stringify({ kind: "fan_leader" }) } },
    ]);
    expect(await handleOwnerSmsReply(jakoD1(db), "c1", "Díky", "warm")).toBe(false);
    expect(db.pocet(/UPDATE sponsor_owner_sms/)).toBe(0);
  });
});

describe("expireOwnerSmsReplies", () => {
  it("mlčení u zprávy, která čekala odpověď, stojí náklonnost", async () => {
    const db = new FalesnaD1([
      { sql: /WHERE s.status = 'awaiting' AND s.reply_by/, all: [
        { id: "s1", sponsor_id: 7, team_id: "t1", expects_reply: 1, conversation_id: "c1", personality: "fan" },
        { id: "s2", sponsor_id: 8, team_id: "t1", expects_reply: 0, conversation_id: "c2", personality: "fan" },
      ] },
    ]);
    expect(await expireOwnerSmsReplies(jakoD1(db), "2026-09-23")).toBe(2);
    const log = logDeniku(db);
    expect(log).toHaveLength(1);
    expect(log[0].params.slice(0, 4)).toEqual([7, "t1", -2, "bez odpovědi na SMS"]);
  });
});

describe("deliverOwnerSmsForTeam", () => {
  const FRONTA = {
    sql: /SELECT id, sponsor_id, occasion, created_day, reference_id, vars FROM sponsor_owner_sms/,
    all: [{ id: "s1", sponsor_id: 7, occasion: "riot", created_day: "2026-09-23", reference_id: "riot:m1", vars: "{}" }],
  };

  it("dnes už majitel psal: nic neodejde", async () => {
    const db = new FalesnaD1([
      FRONTA,
      { sql: /SELECT sponsor_id, occasion, sent_day FROM sponsor_owner_sms/, all: [{ sponsor_id: 9, occasion: "after_win", sent_day: "2026-09-23" }] },
    ]);
    expect(await deliverOwnerSmsForTeam(jakoD1(db), "t1", "2026-09-23T16:00:00.000Z")).toBe(false);
    expect(db.pocet(/INSERT INTO messages/)).toBe(0);
  });

  it("doručí SMS s nabídkou odpovědí do vlákna majitele", async () => {
    const db = new FalesnaD1([
      FRONTA,
      { sql: /SELECT sponsor_id, occasion, sent_day FROM sponsor_owner_sms/, all: [] },
      { sql: /SET status = 'awaiting', sent_day/, changes: 1 },
      { sql: /FROM sponsor_owners WHERE sponsor_id IN/, all: [
        { sponsor_id: 7, first_name: "Jan", last_name: "Novák", age: 50, face_config: "{}", personality: "cautious" },
      ] },
      { sql: /SELECT name FROM district_sponsors/, first: { name: "Pekařství Novák" } },
    ]);
    expect(await deliverOwnerSmsForTeam(jakoD1(db), "t1", "2026-09-23T16:00:00.000Z")).toBe(true);
    const msg = db.dotazy.find((d) => /INSERT INTO messages/.test(d.sql));
    expect(msg?.params[2]).toBe("so-7");
    expect(String(msg?.params[5])).toContain("\"type\":\"sponsor_owner\"");
    expect(String(msg?.params[5])).toContain("\"id\":\"dismissive\"");
  });
});

describe("closeOwnerSmsForRollover", () => {
  it("dropne pending frontu, ale nechá season:/main-expired: referenci (rerun rolloveru o ně nesmí přijít)", async () => {
    const db = new FalesnaD1();
    await closeOwnerSmsForRollover(jakoD1(db));
    const davka = db.davky[0];
    const dropSql = davka.find((d) => /status = 'pending'/.test(d.sql) && /'dropped'/.test(d.sql));
    expect(dropSql?.sql).toContain("reference_id NOT LIKE 'season:%'");
    expect(dropSql?.sql).toContain("reference_id NOT LIKE 'main-expired:%'");
  });

  it("vynuluje sent_day u historických (nepending) řádků, aby staré datum ze staré sezóny neblokovalo cooldown po resetu herního času", async () => {
    const db = new FalesnaD1();
    await closeOwnerSmsForRollover(jakoD1(db));
    const davka = db.davky[0];
    const sentDaySql = davka.find((d) => /SET sent_day = NULL/.test(d.sql));
    expect(sentDaySql?.sql).toContain("status != 'pending'");
  });

  it("nechá ve frontě i SMS o slibech a výpovědi, které rollover zařadil před úklidem", async () => {
    const db = new FalesnaD1();
    await closeOwnerSmsForRollover(jakoD1(db));
    const dropSql = db.davky[0].find((d) => /status = 'pending'/.test(d.sql) && /'dropped'/.test(d.sql));
    expect(dropSql?.sql).toContain("reference_id NOT LIKE 'promise:%'");
    expect(dropSql?.sql).toContain("reference_id NOT LIKE 'sponsor-quit:%'");
  });
});
