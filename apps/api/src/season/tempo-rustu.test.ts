/**
 * Měření SKUTEČNÉHO tempa růstu na produkčních kádrech.
 *
 * Předchozí měření běželo na fixtuře s jedním hráčem, kondicí sto a bez absencí — dalo
 * 2,8 bodu hodnocení za sezónu, zatímco produkce ukazuje 0,5. Tenhle harness proto bere
 * skutečné kádry z produkční zálohy a nejdřív MUSÍ reprodukovat naměřenou realitu
 * (5,9 bodu dovedností na hráče za 120 dní). Dokud ji nereprodukuje, jeho čísla neplatí.
 */
import { it, expect } from "vitest";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { simulateTraining, type TrainingPlayer } from "./training";
import { createRng } from "../generators/rng";
import { overallRatingFromFlat } from "../skills/generator";

const DB = "/private/tmp/claude-501/-Users-savrik-Projects-fmko/16b68775-2459-4de9-ae1b-2b7e396e425e/scratchpad/prod.sqlite";
const VYSTUP = process.env.VYSTUP ?? "/private/tmp/claude-501/-Users-savrik-Projects-fmko/16b68775-2459-4de9-ae1b-2b7e396e425e/scratchpad/harness.txt";

/** Kolik tréninkových dní klub za sezónu odehraje: 16 týdnů × 3, minus zápasové dny. */
const TRENINKU_ZA_SEZONU = 40;

interface Radek {
  id: string; age: number; position: string; skills: string; physical: string | null;
  personality: string | null; life_context: string | null; skills_max: string | null;
  hidden_talent: number | null; klub: string; typ: string;
}

function q<T>(sql: string): T[] {
  const out = execFileSync("sqlite3", ["-json", "-readonly", DB, sql], { encoding: "utf-8", maxBuffer: 256 * 1024 * 1024 });
  return out.trim() ? (JSON.parse(out) as T[]) : [];
}

const ATRIBUTY = ["speed","technique","shooting","passing","heading","defense","goalkeeping",
                  "stamina","strength","vision","creativity","setPieces"] as const;

/** Skutečný hráč z produkce ve tvaru, který `simulateTraining` očekává. */
function naHrace(r: Radek): TrainingPlayer {
  const sk = JSON.parse(r.skills || "{}") as Record<string, number>;
  const fz = JSON.parse(r.physical || "{}") as Record<string, number>;
  const os = JSON.parse(r.personality || "{}") as Record<string, number>;
  const zivot = JSON.parse(r.life_context || "{}") as Record<string, number>;
  let stropy: Record<string, number> = {};
  try {
    const sm = JSON.parse(r.skills_max || "{}") as Record<string, { maxPotential?: number }>;
    for (const [k, v] of Object.entries(sm)) if (typeof v?.maxPotential === "number") stropy[k] = v.maxPotential;
  } catch { stropy = {}; }

  const p: Record<string, unknown> = {
    firstName: "X", lastName: r.id.slice(0, 6), age: r.age, position: r.position,
    occupation: "Zedník", bodyType: "athletic", avatarConfig: {},
    preferredFoot: "right", preferredSide: "center",
    // Kondice a morálka ze skutečného života hráče — ne paušální stovka
    condition: zivot.condition ?? 100, morale: zivot.morale ?? 50,
    injuryProneness: fz.injuryProneness ?? 20,
    discipline: os.discipline ?? 50, patriotism: os.patriotism ?? 50,
    alcohol: os.alcohol ?? 20, temper: os.temper ?? 40,
    leadership: os.leadership ?? 30, workRate: os.workRate ?? 50,
    aggression: os.aggression ?? 40, consistency: os.consistency ?? 50, clutch: os.clutch ?? 50,
    hiddenTalent: r.hidden_talent ?? 0, skillCaps: stropy,
  };
  for (const a of ATRIBUTY) p[a] = fz[a] ?? sk[a] ?? 0;
  return p as unknown as TrainingPlayer;
}

function bodyCelkem(h: TrainingPlayer): number {
  const r = h as unknown as Record<string, number>;
  return ATRIBUTY.reduce((s, a) => s + (typeof r[a] === "number" ? r[a] : 0), 0);
}

/** Celkové hodnocení hráče — týmž vzorcem, jakým ho počítá hra. */
function hodnoceni(h: TrainingPlayer, poz: string, talent: number): number {
  const r = h as unknown as Record<string, number>;
  const sk: Record<string, number> = {};
  for (const a of ATRIBUTY) sk[a] = r[a] ?? 0;
  sk.experience = r.experience ?? 30;
  return overallRatingFromFlat(poz, sk, { stamina: r.stamina, strength: r.strength }, talent) ?? 0;
}

/**
 * Bez produkční kopie se test přeskočí — na cizím klonu i v CI ji nikdo nemá.
 * Kopii vyrobíš: `npx wrangler d1 export prales-db-prod --remote --output zaloha.sql`
 * a `sqlite3 prod.sqlite < zaloha.sql`.
 */
it.skipIf(!existsSync(DB))("tempo rustu na produkcnich kadrech", () => {
  const kluby = q<{ klub: string }>(
    `SELECT DISTINCT r.name AS klub FROM teams t JOIN teams r ON r.id = COALESCE(t.parent_team_id, t.id)
      WHERE r.user_id != 'ai' AND t.team_type = 'senior' LIMIT 6`);

  const radky: string[] = [];
  let bodyMladi = 0, pocetMladi = 0, bodyDospeli = 0, pocetDospeli = 0;
  let ratingMladi = 0, ratingDospeli = 0;
  const podleTalentu = new Map<string, { rating: number; body: number; n: number }>();
  const podleVeku = new Map<string, { rating: number; n: number }>();

  for (const { klub } of kluby) {
    // Klub trénuje SPOLEČNĚ — áčko i dorost v jednom kádru, jak to dělá denní tick
    const hraci = q<Radek>(
      `SELECT p.id, p.age, p.position, p.skills, p.physical, p.personality, p.life_context,
              p.skills_max, p.hidden_talent, r.name AS klub, t.team_type AS typ
         FROM players p JOIN teams t ON t.id = p.team_id
         JOIN teams r ON r.id = COALESCE(t.parent_team_id, t.id)
        WHERE r.name = '${klub.replace(/'/g, "''")}' AND (p.status IS NULL OR p.status = 'active')`);
    if (hraci.length === 0) continue;

    const kadr = hraci.map(naHrace);
    const pred = kadr.map(bodyCelkem);
    const predRating = kadr.map((h, i) => hodnoceni(h, hraci[i].position, hraci[i].hidden_talent ?? 0));

    const rng = createRng(20260826);
    let dorazilo = 0, prilezitosti = 0, zlepseniCelkem = 0;
    for (let den = 0; den < TRENINKU_ZA_SEZONU; den++) {
      const v = simulateTraining(rng, kadr, { sessionsPerWeek: 3, type: "tactics", approach: "balanced" } as never);
      dorazilo += v.attendance.filter((a) => a.attended).length;
      prilezitosti += kadr.length;
      zlepseniCelkem += v.improvements.length;
      for (const z of v.improvements) {
        const rec = kadr[z.playerIndex] as unknown as Record<string, number>;
        if (typeof rec[z.attribute] === "number") rec[z.attribute] += z.change;
      }
    }
    radky.push(`  ${klub}: dochazka ${(100*dorazilo/prilezitosti).toFixed(0)} %, zlepseni ${zlepseniCelkem}, na hrace a den ${(zlepseniCelkem/(kadr.length*TRENINKU_ZA_SEZONU)).toFixed(3)}`);

    for (let i = 0; i < kadr.length; i++) {
      const zisk = bodyCelkem(kadr[i]) - pred[i];
      const ziskR = hodnoceni(kadr[i], hraci[i].position, hraci[i].hidden_talent ?? 0) - predRating[i];
      if (hraci[i].age < 22) {
        bodyMladi += zisk; ratingMladi += ziskR; pocetMladi++;
        const t = hraci[i].hidden_talent ?? 0;
        const pasmo = t < 20 ? "0-19" : t < 40 ? "20-39" : t < 60 ? "40-59" : "60+";
        const b = podleTalentu.get(pasmo) ?? { rating: 0, body: 0, n: 0 };
        b.rating += ziskR; b.body += zisk; b.n++;
        podleTalentu.set(pasmo, b);
      } else {
        bodyDospeli += zisk; ratingDospeli += ziskR; pocetDospeli++;
        const v = hraci[i].age;
        const p2 = v < 25 ? "22-24" : v < 28 ? "25-27" : v < 31 ? "28-30" : v < 35 ? "31-34" : "35+";
        const b2 = podleVeku.get(p2) ?? { rating: 0, n: 0 };
        b2.rating += ziskR; b2.n++;
        podleVeku.set(p2, b2);
      }
    }
  }

  radky.push(`kadru: ${kluby.length}, hracu do 22 let: ${pocetMladi}, od 22: ${pocetDospeli}`);
  radky.push(`ZISK BODU DOVEDNOSTI ZA SEZONU (${TRENINKU_ZA_SEZONU} treninku):`);
  radky.push(`   do 22 let: ${(bodyMladi / Math.max(1, pocetMladi)).toFixed(2)} bodu/hrace`);
  radky.push(`   od 22 let: ${(bodyDospeli / Math.max(1, pocetDospeli)).toFixed(2)} bodu/hrace`);
  const rM = ratingMladi / Math.max(1, pocetMladi);
  const rD = ratingDospeli / Math.max(1, pocetDospeli);
  radky.push("");
  radky.push(`ZISK CELKOVEHO HODNOCENI ZA SEZONU (skutecny prepocet, ne odhad):`);
  radky.push(`   do 22 let: ${rM.toFixed(2)}  (na produkci po opravnem faktoru 3x: ${(rM/3).toFixed(2)})`);
  radky.push(`   od 22 let: ${rD.toFixed(2)}  (na produkci: ${(rD/3).toFixed(2)})`);
  radky.push("");
  radky.push("DOSPELI PODLE VEKU (zisk hodnoceni za sezonu):");
  for (const p2 of ["22-24", "25-27", "28-30", "31-34", "35+"]) {
    const b2 = podleVeku.get(p2);
    if (!b2 || !b2.n) continue;
    radky.push(`   ${p2.padEnd(6)} ${String(b2.n).padStart(3)} hracu | ${(b2.rating/b2.n).toFixed(2)} (produkce ${(b2.rating/b2.n/3).toFixed(2)})`);
  }
  radky.push("");
  radky.push("PODLE TALENTU (jen hraci do 22 let, trenink):");
  for (const pasmo of ["0-19", "20-39", "40-59", "60+"]) {
    const b = podleTalentu.get(pasmo);
    if (!b || !b.n) continue;
    radky.push(`   talent ${pasmo.padEnd(6)} ${String(b.n).padStart(3)} hracu | body ${(b.body/b.n).toFixed(1).padStart(5)} | hodnoceni ${(b.rating/b.n).toFixed(2)}`);
  }
  radky.push("");
  radky.push("NAMERENO NA PRODUKCI: 5,9 bodu dovednosti na hrace za 120 dni (~1 sezona)");
  writeFileSync(VYSTUP, radky.join("\n"));
  expect(pocetMladi).toBeGreaterThan(0);
}, 600_000);
