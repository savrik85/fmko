/**
 * Rozvoj hráče — kolik už natrénoval a kam až může dojít.
 *
 * Potenciál (`skills_max`) je v datech přesné číslo, hráči se ale nikdy neukazuje přesně:
 * odhad je tím užší, čím lepšího má klub skauta. Bez skauta manažer vidí jen mlhu, což je
 * záměr — skaut se má vyplatit právě tím, že pozná, do koho stojí za to investovat.
 */

import { Hono } from "hono";
import { logger } from "../lib/logger";
import { requireTeamOwnership, requireAdmin } from "../auth/middleware";
import { getSession, getTokenFromRequest } from "../auth/session";
import { ratingWeightsFor } from "@okresni-masina/shared";

type Env = { Bindings: { DB: D1Database; SESSION_KV: KVNamespace } };

export const developmentRouter = new Hono<Env>();
// Pozor: `requireTeamOwnership` propouští GET bez kontroly (většina herních dat je veřejná).
// Tady to nestačí — odhad stropu je konkurenční výhoda, za kterou klub platí skauta, a bez
// vlastní kontroly by kdokoli se známým ID viděl potenciál cizích hráčů. Proto si GETy
// ověřují vlastnictví samy přes `overSiVlastnictvi`.
developmentRouter.use("/teams/:teamId/*", requireTeamOwnership);

/**
 * Ověří, že volající je přihlášený vlastník daného týmu. Vrací chybovou odpověď, nebo null
 * když je všechno v pořádku.
 */
async function overSiVlastnictvi(
  c: { req: { param: (k: string) => string | undefined }; env: { DB: D1Database; SESSION_KV: KVNamespace }; json: (o: unknown, s?: number) => Response },
  teamId: string,
): Promise<Response | null> {
  const token = getTokenFromRequest(c as never);
  if (!token) return c.json({ error: "Nepřihlášen" }, 401);

  const session = await getSession(c.env.SESSION_KV, token);
  if (!session) return c.json({ error: "Neplatná session" }, 401);

  const vlastni = await c.env.DB.prepare("SELECT id FROM teams WHERE id = ? AND user_id = ?")
    .bind(teamId, session.userId).first()
    .catch((e) => { logger.warn({ module: "development", teamId }, "check ownership", e); return null; });
  if (!vlastni) return c.json({ error: "Přístup odepřen" }, 403);

  return null;
}

/** České názvy atributů — do UI nikdy neposílat holý klíč. */
const NAZVY_ATRIBUTU: Record<string, string> = {
  speed: "Rychlost", technique: "Technika", shooting: "Střelba", passing: "Přihrávka",
  heading: "Hlavičky", defense: "Obrana", goalkeeping: "Chytání", stamina: "Výdrž",
  strength: "Síla", vision: "Přehled", creativity: "Kreativita", setPieces: "Standardky",
  experience: "Zkušenost",
};

/**
 * Jak přesně klub odhaduje strop. Bez skauta ±18 bodů (prakticky "nevíme"),
 * špičkový skaut ±4 (skoro jistota).
 */
function rozptylOdhadu(kvalitaSkauta: number): number {
  return Math.round(18 - Math.max(0, Math.min(1, kvalitaSkauta)) * 14);
}

/**
 * Skrytý talent říká, jak RYCHLE se hráč učí — ne kam až dojde. To určuje strop.
 *
 * Odznak dřív hlásil „velký talent" a hned vedle stálo „Na střídání to bude stačit",
 * což si protiřečilo. Tempo a strop jsou dvě různé věci: kluk se může učit rychle a přesto
 * skončit nízko (dojde na svůj strop dřív), nebo se plazit k vysokému stropu půl kariéry.
 */
function slovneTempoRozvoje(talent: number): string {
  if (talent >= 61) return "učí se bleskově";
  if (talent >= 36) return "učí se rychle";
  if (talent >= 16) return "průměrné tempo";
  return "rozvíjí se pomalu";
}

// Verdikt, pásma i prognóza sezón žijí v `skills/verdikt.ts` — jedno místo, otestované
// křížem přes věky, hodnocení a talenty. Dřív si je počítal každý endpoint po svém a
// výsledkem byly dvojice jako „Výhled: sestava" vedle „Nedotáhne se".
import { tempoPodleVeku, type LatkyKadru } from "../skills/verdikt";
import { vyhledHrace, teoretickyStropHrace } from "../skills/vyhled-hrace";
import { bodyDospivani, DOSPIVANI_DO_VEKU } from "../season/dospivani";

/**
 * Laťky kádru, jak vypadá DNES — proti nim se poměřuje výhled hráče.
 * Manažer porovnává s tím, co na hřišti vidí, ne s teoretickým maximem za pět sezón.
 */
async function nactiLatkyKadru(db: D1Database, teamId: string): Promise<{ prumerKadru: number; sestava: number; nejlepsi: number }> {
  const row = await db.prepare(
    `SELECT ROUND(AVG(overall_rating)) AS prumer,
            ROUND(AVG(CASE WHEN poradi <= 11 THEN overall_rating END)) AS sestava,
            MAX(overall_rating) AS nejlepsi
       FROM (SELECT overall_rating, ROW_NUMBER() OVER (ORDER BY overall_rating DESC) AS poradi
               FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active'))`,
  ).bind(teamId).first<{ prumer: number | null; sestava: number | null; nejlepsi: number | null }>()
    .catch((e) => { logger.warn({ module: "development", teamId }, "load latky", e); return null; });

  const sestava = row?.sestava ?? 45;
  return {
    prumerKadru: row?.prumer ?? sestava - 5,
    sestava,
    nejlepsi: row?.nejlepsi ?? sestava + 5,
  };
}

/**
 * Od jakého stropu je hráč klenot.
 *
 * Bere špičku potenciálu CELÉHO klubu — áčka i dorostu. Kdyby se laťka odvíjela od dnešní
 * výkonnosti áčka, byl by klenotem každý dorostenec (naměřeno 18 z 18): mladí mají stropy
 * vysoko, zatímco hráči v áčku už na své dorostli. Takhle vyjde pár kluků bez ohledu na to,
 * jak silný kádr zrovna je.
 */
async function latkaKlenotuKlubu(db: D1Database, clubId: string, zaloha: number): Promise<number> {
  const rows = await db.prepare(
    `SELECT p.position, p.skills_max, p.hidden_talent
       FROM players p JOIN teams t ON t.id = p.team_id
      WHERE (t.id = ? OR t.parent_team_id = ?)
        AND (p.status IS NULL OR p.status = 'active') AND p.skills_max IS NOT NULL`,
  ).bind(clubId, clubId).all<{ position: string; skills_max: string; hidden_talent: number | null }>()
    .catch((e) => { logger.warn({ module: "development", teamId: clubId }, "load club caps", e); return { results: [] as never[] }; });

  const stropy: number[] = [];
  for (const r of rows.results) {
    let sm: Record<string, { maxPotential?: number }>;
    try { sm = JSON.parse(r.skills_max) as Record<string, { maxPotential?: number }>; }
    catch (e) { logger.warn({ module: "development" }, "parse club skills_max", e); continue; }

    const strop = teoretickyStropHrace(r.position, sm, r.hidden_talent ?? 0);
    if (strop !== null) stropy.push(strop);
  }

  if (stropy.length === 0) return zaloha;
  // 92 % nejvyššího stropu — klenotem je špička, ne kdokoli nadprůměrný
  return Math.round(Math.max(...stropy) * 0.92);
}

/**
 * Strop základní jedenáctky A-týmu — kam dojdou současné opory, když se vytrénují,
 * a kam dojde ten úplně nejlepší z nich.
 * Počítá se z `skills_max`, proto se JSON musí rozbalit tady a ne v SQL.
 */
async function stropZakladniSestavy(db: D1Database, teamId: string, zaloha: number): Promise<{ sestava: number; nejvyssi: number }> {
  const rows = await db.prepare(
    `SELECT position, skills_max FROM players
      WHERE team_id = ? AND (status IS NULL OR status = 'active') AND skills_max IS NOT NULL`,
  ).bind(teamId).all<{ position: string; skills_max: string }>()
    .catch((e) => { logger.warn({ module: "development", teamId }, "load squad caps", e); return { results: [] as never[] }; });

  const stropy: number[] = [];
  for (const r of rows.results) {
    let sm: Record<string, { maxPotential?: number }>;
    try { sm = JSON.parse(r.skills_max) as Record<string, { maxPotential?: number }>; }
    catch (e) { logger.warn({ module: "development" }, "parse squad skills_max", e); continue; }

    const strop = teoretickyStropHrace(r.position, sm, 0);
    if (strop !== null) stropy.push(strop);
  }

  if (stropy.length === 0) return { sestava: zaloha, nejvyssi: zaloha + 5 };
  const serazene = stropy.sort((a, b) => b - a);
  const prvnich11 = serazene.slice(0, 11);
  return {
    sestava: Math.round(prvnich11.reduce((s, v) => s + v, 0) / prvnich11.length),
    nejvyssi: Math.round(serazene[0]),
  };
}

/**
 * Kam dojde JEDNA dovednost, než hráče dožene věk.
 *
 * Obdoba `realneDosazitelnyStrop`, jen na úrovni dovednosti. Bez ní karta u 44letého
 * hráče slibovala „Obrana 33 / 51–63", přestože celkový odhad správně říkal, že skončí
 * na 33 — jednotlivé atributy ukazovaly čistý potenciál bez ohledu na zbývající kariéru.
 *
 * Trénink rozděluje přírůstky mezi zhruba třináct atributů, dospívání do 21 let zvedá
 * všechny naráz — proto se tu dělí jen tréninková část.
 */
const POCET_TRENOVANYCH_ATRIBUTU = 13;

function realneDosazitelnaHodnota(vek: number, soucasna: number, strop: number, talent: number): number {
  const KONEC_KARIERY = 37;
  let hodnota = soucasna;

  for (let v = vek; v < KONEC_KARIERY; v++) {
    const bodyZaSezonu = v < 20 ? 37 : v < 25 ? 30 : v < 30 ? 20 : v < 34 ? 14 : 6;
    const zTreninku = bodyZaSezonu / POCET_TRENOVANYCH_ATRIBUTU;
    const zDospivani = v <= DOSPIVANI_DO_VEKU ? bodyDospivani(v, talent) : 0;
    hodnota += zTreninku + zDospivani;
    if (hodnota >= strop) return strop;
  }
  return Math.min(strop, Math.round(hodnota));
}

/**
 * Stabilní pseudonáhoda z textu — aby se odhad stropu neměnil při každém načtení stránky.
 * Manažer nesmí odhad "vyrolovat" opakovaným refreshem.
 */
function stabilniPosun(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) / 4294967296) * 2 - 1; // -1..1
}

// GET /api/teams/:teamId/players/:playerId/development
developmentRouter.get("/teams/:teamId/players/:playerId/development", async (c) => {
  const teamId = c.req.param("teamId");
  const playerId = c.req.param("playerId");

  const odmitnuto = await overSiVlastnictvi(c, teamId);
  if (odmitnuto) return odmitnuto;

  const player = await c.env.DB.prepare(
    "SELECT id, team_id, first_name, last_name, age, position, overall_rating, skills, physical, skills_max, hidden_talent FROM players WHERE id = ?",
  ).bind(playerId).first<{
    id: string; team_id: string; first_name: string; last_name: string; age: number;
    position: string; overall_rating: number; skills: string; physical: string | null;
    skills_max: string | null; hidden_talent: number | null;
  }>().catch((e) => { logger.warn({ module: "development", playerId }, "load player", e); return null; });

  if (!player) return c.json({ error: "Hráč nenalezen" }, 404);

  // Hráč musí patřit týmu nebo jeho U21 — jinak by šlo koukat soupeři do karet.
  const patriKlubu = await c.env.DB.prepare(
    "SELECT 1 AS ok FROM teams WHERE id = ? AND (id = ? OR parent_team_id = ?)",
  ).bind(player.team_id, teamId, teamId).first<{ ok: number }>()
    .catch((e) => { logger.warn({ module: "development", teamId }, "check club ownership", e); return null; });
  if (!patriKlubu) return c.json({ error: "Hráč není z tvého klubu" }, 403);

  // Skaut visí na A-týmu, i když hráč hraje za U21
  const clubRow = await c.env.DB.prepare("SELECT COALESCE(parent_team_id, id) AS club_id FROM teams WHERE id = ?")
    .bind(player.team_id).first<{ club_id: string }>()
    .catch((e) => { logger.warn({ module: "development" }, "load club id", e); return null; });
  const clubId = clubRow?.club_id ?? teamId;

  const staff = await c.env.DB.prepare(
    "SELECT role, coaching, medicine, maintenance, judgement, communication, work_rate, charm FROM staff_members WHERE team_id = ?",
  ).bind(clubId).all<{ role: string; coaching: number; medicine: number; maintenance: number; judgement: number; communication: number; work_rate: number; charm: number }>()
    .catch((e) => { logger.warn({ module: "development", teamId: clubId }, "load staff", e); return { results: [] as never[] }; });

  const { scoutChanceMultiplier } = await import("../staff/staff-effects");
  const kvalitaSkauta = Math.max(0, scoutChanceMultiplier(staff.results) - 1); // 0..1
  const maSkauta = staff.results.some((r) => r.role === "skaut");
  const rozptyl = rozptylOdhadu(kvalitaSkauta);

  const skills = (() => {
    try { return JSON.parse(player.skills) as Record<string, number>; }
    catch (e) { logger.warn({ module: "development", playerId }, "parse skills", e); return {}; }
  })();
  const physical = (() => {
    try { return player.physical ? JSON.parse(player.physical) as Record<string, number> : {}; }
    catch (e) { logger.warn({ module: "development", playerId }, "parse physical", e); return {}; }
  })();
  const skillsMax = (() => {
    try { return player.skills_max ? JSON.parse(player.skills_max) as Record<string, { maxPotential?: number }> : {}; }
    catch (e) { logger.warn({ module: "development", playerId }, "parse skills_max", e); return {}; }
  })();

  // Brankář používá tytéž ploché názvy jako hráči v poli, takže žádný překlad není potřeba.
  const vahyPodleNazvu = ratingWeightsFor(player.position);
  const vahaAtributu = (attr: string): number => vahyPodleNazvu[attr] ?? 0;
  const stropAtributu = (attr: string): number | undefined => skillsMax[attr]?.maxPotential;

  // Talent musí být deklarovaný PŘED mapou atributů — používá ho odhad dosažitelné hodnoty
  const talent = player.hidden_talent ?? 0;

  // Atributy, které dávají smysl ukazovat: co hráč má a co se dá trénovat.
  // Zkušenost se vynechává — neroste tréninkem ale odehranými minutami a strop má vždy 100,
  // takže by se u ní ukazovalo nesmyslné „2 / 94–100".
  const atributy = Object.keys(NAZVY_ATRIBUTU)
    .filter((attr) => attr !== "experience")
    .filter((attr) => typeof skills[attr] === "number" || typeof physical[attr] === "number")
    .map((attr) => {
      const soucasna = skills[attr] ?? physical[attr] ?? 0;
      const strop = stropAtributu(attr);

      let odhadMin: number | null = null;
      let odhadMax: number | null = null;
      if (maSkauta && typeof strop === "number") {
        // Nejdřív ořezat věkem — na teoretický strop nemusí zbývat dost sezón
        const dosazitelny = realneDosazitelnaHodnota(player.age, soucasna, strop, talent);
        // Střed odhadu je posunutý stabilně podle hráče a atributu, ne náhodně při každém načtení
        const posun = Math.round(stabilniPosun(`${playerId}:${attr}`) * rozptyl * 0.5);
        const stred = dosazitelny + posun;
        odhadMin = Math.max(soucasna, Math.round(stred - rozptyl));
        odhadMax = Math.min(100, Math.round(stred + rozptyl));
      }

      return {
        atribut: attr,
        nazev: NAZVY_ATRIBUTU[attr],
        soucasna,
        odhadMin,
        odhadMax,
        /** Kolik váhy má atribut v hodnocení na téhle pozici (0 = do ratingu nevstupuje). */
        vahaVHodnoceni: vahaAtributu(attr),
      };
    })
    .sort((a, b) => b.vahaVHodnoceni - a.vahaVHodnoceni);

  // Kolik hráč natrénoval za posledních 30 herních dní — a v čem
  const rust = await c.env.DB.prepare(
    `SELECT attribute, SUM(change) AS zmena, COUNT(*) AS kroku
       FROM training_log
      WHERE player_id = ? AND created_at > datetime('now', '-30 days')
      GROUP BY attribute HAVING zmena != 0 ORDER BY zmena DESC`,
  ).bind(playerId).all<{ attribute: string; zmena: number; kroku: number }>()
    .catch((e) => { logger.warn({ module: "development", playerId }, "load growth", e); return { results: [] as never[] }; });

  const historie = await c.env.DB.prepare(
    `SELECT attribute, old_value, new_value, change, training_type, game_date
       FROM training_log WHERE player_id = ? ORDER BY created_at DESC LIMIT 30`,
  ).bind(playerId).all<{ attribute: string; old_value: number; new_value: number; change: number; training_type: string; game_date: string }>()
    .catch((e) => { logger.warn({ module: "development", playerId }, "load history", e); return { results: [] as never[] }; });


  // Potenciál se ukazuje u KAŽDÉHO hráče, ne jen u mladíků — manažer potřebuje vědět
  // i to, jestli ze třicátníka ještě něco bude, nebo jestli je hotový.
  // Počítá se z odhadovaných stropů, tedy z toho, co manažer vidí, ne z databáze.
  let nadejnost: {
    slovne: string; uroven: string; zobrazitOdznak: boolean;
    odhadStropu: number; realnyStrop: number;
    stropOpor: number; zbyvaDoStropu: number;
  } | null = null;
  if (maSkauta) {
    const latkyDnes = await nactiLatkyKadru(c.env.DB, clubId);
    const stropSestavy = await stropZakladniSestavy(c.env.DB, clubId, latkyDnes.sestava + 15);
    const klenot = await latkaKlenotuKlubu(c.env.DB, clubId, latkyDnes.nejlepsi + 10);

    const vyhled = vyhledHrace({
      vek: player.age, hodnoceni: player.overall_rating, pozice: player.position, talent,
      stropyDovednosti: skillsMax,
      latky: { prumerKadru: latkyDnes.prumerKadru, sestavaDnes: latkyDnes.sestava, latkaKlenotu: klenot },
      rozptyl, posun: stabilniPosun(`${playerId}:strop`),
    });

    if (vyhled.verdikt !== null) {
      // Ukazuje se strop OPOR, ne jejich dnešní hodnocení — jinak by text lhal o tom,
      // proti čemu se ten verdikt vlastně měří.
      // `zobrazitOdznak` je false u hráče, který v tom pásmu už dnes je — odznak by jen
      // opakoval to, co říkají ostatní charakteristiky („Hvězda týmu" + „možná sestava").
      nadejnost = {
        slovne: vyhled.verdikt.slovne,
        uroven: vyhled.verdikt.uroven,
        zobrazitOdznak: vyhled.verdikt.zobrazit,
        odhadStropu: vyhled.odhadStropu!,
        realnyStrop: vyhled.realnyStrop!,
        stropOpor: stropSestavy.sestava,
        zbyvaDoStropu: vyhled.zbyvaDoStropu,
      };
    }
  }

  return c.json({
    hrac: {
      id: player.id,
      jmeno: `${player.first_name} ${player.last_name}`,
      vek: player.age,
      pozice: player.position,
      hodnoceni: player.overall_rating,
    },
    skaut: {
      /** Bez skauta se strop ani talent neukazují — od toho ten skaut v realizačním týmu je. */
      maSkauta,
      presnost: maSkauta ? (rozptyl <= 6 ? "přesný" : rozptyl <= 12 ? "solidní" : "hrubý") : null,
      rozptyl: maSkauta ? rozptyl : null,
    },
    talent: maSkauta ? { slovne: slovneTempoRozvoje(talent), hodnota: talent } : null,
    nadejnost,
    atributy,
    rustZa30Dni: {
      celkem: rust.results.reduce((s, r) => s + r.zmena, 0),
      podleAtributu: rust.results.map((r) => ({
        atribut: r.attribute, nazev: NAZVY_ATRIBUTU[r.attribute] ?? r.attribute, zmena: r.zmena,
      })),
    },
    historie: historie.results.map((h) => ({
      atribut: h.attribute,
      nazev: NAZVY_ATRIBUTU[h.attribute] ?? h.attribute,
      z: h.old_value, na: h.new_value, zmena: h.change,
      zdroj: h.training_type, datum: h.game_date,
    })),
  });
});

// ── Mládežnická akademie ─────────────────────────────────────────────────────

// GET /api/teams/:teamId/academy — stav akademie a nabídka úrovní
developmentRouter.get("/teams/:teamId/academy", async (c) => {
  const teamId = c.req.param("teamId");

  const odmitnuto = await overSiVlastnictvi(c, teamId);
  if (odmitnuto) return odmitnuto;

  const { YOUTH_LABELS, YOUTH_POPISY, YOUTH_POCET_POKUSU, ocekavanyPocetOdchovancu, sanceJednohoPokusu, youthMonthlyCost } = await import("../season/youth");

  const team = await c.env.DB.prepare(
    `SELECT t.youth_investment, v.population FROM teams t
       JOIN villages v ON v.id = t.village_id WHERE t.id = ?`,
  ).bind(teamId).first<{ youth_investment: string | null; population: number }>()
    .catch((e) => { logger.warn({ module: "development", teamId }, "load academy", e); return null; });

  if (!team) return c.json({ error: "Tým nenalezen" }, 404);

  // Větší obec = víc kluků = vyšší šance. Týž vzorec, jaký používá tryGraduateYouth.
  const popMod = Math.max(0.5, Math.min(1.5, (team.population ?? 500) / 3000));

  // Sezónní náklad se počítá ze SKUTEČNÉ délky sezóny. Dřív tu bylo natvrdo ×26 podle počtu
  // kol, jenže kol není 26 týdnů — ročník trvá 14 až 24 týdnů podle rozpisu, takže to číslo
  // manažera mátlo o desítky procent.
  const kalendar = await c.env.DB.prepare(
    `SELECT MIN(scheduled_at) AS od, MAX(scheduled_at) AS do FROM season_calendar
      WHERE season_number = (SELECT MAX(season_number) FROM season_calendar)`,
  ).first<{ od: string | null; do: string | null }>()
    .catch((e) => { logger.warn({ module: "development" }, "load season length", e); return null; });

  let tydnuVSezone = 20; // rozumný odhad, když kalendář chybí
  if (kalendar?.od && kalendar?.do) {
    const dnu = (new Date(kalendar.do).getTime() - new Date(kalendar.od).getTime()) / 86_400_000;
    if (dnu > 0) tydnuVSezone = Math.max(1, Math.round(dnu / 7));
  }

  const urovne = (["none", "minimal", "medium", "high"] as const).map((u) => {
    const tydne = Math.round(youthMonthlyCost(u) / 4.3);
    return {
      klic: u,
      nazev: YOUTH_LABELS[u],
      popis: YOUTH_POPISY[u],
      mesicne: youthMonthlyCost(u),
      tydne,
      zaSezonu: tydne * tydnuVSezone,
      /** Kolik kluků se o postup pokusí. */
      pokusu: YOUTH_POCET_POKUSU[u],
      /** Šance jednoho pokusu (0–1). UI z ní skládá text, ať nemusí ukazovat půlky hráčů. */
      sanceNaPokus: sanceJednohoPokusu(u, popMod),
      /** Kolik jich průměrně opravdu projde — střední hodnota, do UI jen zaokrouhleně. */
      ocekavaneOdchovancu: ocekavanyPocetOdchovancu(u, popMod),
    };
  });

  const maU21 = await c.env.DB.prepare("SELECT 1 AS ok FROM teams WHERE parent_team_id = ? AND team_type = 'u21'")
    .bind(teamId).first<{ ok: number }>()
    .catch((e) => { logger.warn({ module: "development", teamId }, "check u21", e); return null; });

  return c.json({
    aktualni: team.youth_investment ?? "none",
    populace: team.population,
    tydnuVSezone,
    /** Bez U21 týmu nemá odchovanec kam jít — na to musí manažer vidět dřív, než začne platit. */
    maU21Tym: !!maU21,
    urovne,
  });
});

// POST /api/teams/:teamId/academy — nastavit úroveň investice
developmentRouter.post("/teams/:teamId/academy", async (c) => {
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{ investment?: string }>().catch((e) => {
    logger.warn({ module: "development", teamId }, "parse academy body", e);
    return null;
  });

  const povolene = ["none", "minimal", "medium", "high"];
  if (!body?.investment || !povolene.includes(body.investment)) {
    return c.json({ error: "Neplatná úroveň investice" }, 400);
  }

  await c.env.DB.prepare("UPDATE teams SET youth_investment = ? WHERE id = ?")
    .bind(body.investment, teamId).run();

  logger.info({ module: "development", teamId }, `akademie nastavena na ${body.investment}`);
  return c.json({ ok: true, investment: body.investment });
});

// GET /api/teams/:teamId/u21/rozvoj — žebříček dorostu s prognózou průrazu do áčka
developmentRouter.get("/teams/:teamId/u21/rozvoj", async (c) => {
  const teamId = c.req.param("teamId");

  const odmitnuto = await overSiVlastnictvi(c, teamId);
  if (odmitnuto) return odmitnuto;

  const u21 = await c.env.DB.prepare("SELECT id FROM teams WHERE parent_team_id = ? AND team_type = 'u21'")
    .bind(teamId).first<{ id: string }>()
    .catch((e) => { logger.warn({ module: "development", teamId }, "load u21", e); return null; });
  if (!u21) return c.json({ maU21: false, hraci: [], latka: null });

  // Laťka: na co se musí dotáhnout, aby to k něčemu bylo. Jedno načtení pro cíl, verdikt
  // i prognózu — dřív tu stála dvakrát táž SQL pod jinými názvy sloupců a stačilo změnit
  // jednu, aby si stránka odporovala sama se sebou.
  const latkyAcka = await nactiLatkyKadru(c.env.DB, teamId);
  const cil = latkyAcka.sestava;
  const stropSestavyAcka = await stropZakladniSestavy(c.env.DB, teamId, cil + 15);
  const klenotKlubu = await latkaKlenotuKlubu(c.env.DB, teamId, latkyAcka.nejlepsi + 10);

  const hraci = await c.env.DB.prepare(
    `SELECT p.id, p.first_name, p.last_name, p.age, p.position, p.overall_rating,
            p.hidden_talent, p.skills, p.physical, p.skills_max, p.avatar
       FROM players p WHERE p.team_id = ? AND (p.status IS NULL OR p.status = 'active')
      ORDER BY p.overall_rating DESC`,
  ).bind(u21.id).all<{
    id: string; first_name: string; last_name: string; age: number; position: string;
    overall_rating: number; hidden_talent: number | null;
    skills: string; physical: string | null; skills_max: string | null; avatar: string | null;
  }>().catch((e) => { logger.warn({ module: "development", teamId }, "load u21 squad", e); return { results: [] as never[] }; });

  // Skaut rozhoduje, jestli manažer vidí strop a talent
  const staff = await c.env.DB.prepare(
    "SELECT role, coaching, medicine, maintenance, judgement, communication, work_rate, charm FROM staff_members WHERE team_id = ?",
  ).bind(teamId).all<{ role: string; coaching: number; medicine: number; maintenance: number; judgement: number; communication: number; work_rate: number; charm: number }>()
    .catch((e) => { logger.warn({ module: "development", teamId }, "load staff", e); return { results: [] as never[] }; });
  const maSkauta = staff.results.some((r) => r.role === "skaut");
  const { scoutChanceMultiplier: kvalitaSkautaFn } = await import("../staff/staff-effects");
  const rozptylStropu = rozptylOdhadu(Math.max(0, kvalitaSkautaFn(staff.results) - 1));

  // Skutečný přírůstek hodnocení za posledních 120 dní — základ prognózy
  const rustRows = await c.env.DB.prepare(
    `SELECT tl.player_id, SUM(tl.change) AS body, COUNT(*) AS kroku
       FROM training_log tl JOIN players p ON p.id = tl.player_id
      WHERE p.team_id = ? AND tl.created_at > datetime('now', '-120 days')
      GROUP BY tl.player_id`,
  ).bind(u21.id).all<{ player_id: string; body: number; kroku: number }>()
    .catch((e) => { logger.warn({ module: "development", teamId }, "load growth", e); return { results: [] as never[] }; });
  const rustMap = new Map(rustRows.results.map((r) => [r.player_id, r.body]));

  const { bodyDospivani, DOSPIVANI_DO_VEKU } = await import("../season/dospivani");
  const { ratingWeightsFor } = await import("@okresni-masina/shared");

  const vysledek = hraci.results.map((h) => {
    const talent = h.hidden_talent ?? 0;
    const stropy = (() => {
      try { return h.skills_max ? JSON.parse(h.skills_max) as Record<string, { maxPotential?: number }> : {}; }
      catch (e) { logger.warn({ module: "development", playerId: h.id }, "parse skills_max", e); return {}; }
    })();

    // Přírůstek z tréninku. Historie je přesnější (jeden bod atributu ≈ 0,087 bodu
    // hodnocení), hráč ji ale nemusí mít vůbec — odchovanec, čerstvá posila, kdokoli po
    // rolloveru. Bez zálohy podle věku prognóza tvrdila „nedotáhne" i dvacetiletému se
    // stropem 74.
    const zHistorie = (rustMap.get(h.id) ?? 0) * 0.087;
    const vyhled = vyhledHrace({
      vek: h.age, hodnoceni: h.overall_rating, pozice: h.position, talent,
      stropyDovednosti: stropy,
      latky: { prumerKadru: latkyAcka.prumerKadru, sestavaDnes: latkyAcka.sestava, latkaKlenotu: klenotKlubu },
      rozptyl: rozptylStropu, posun: stabilniPosun(`${h.id}:strop`),
      tempoZHistorie: zHistorie > 0 ? zHistorie : tempoPodleVeku(h.age),
    });

    return {
      id: h.id,
      jmeno: `${h.first_name} ${h.last_name}`,
      vek: h.age,
      pozice: h.position,
      hodnoceni: h.overall_rating,
      avatar: h.avatar,
      /** Kam reálně dojde, než ho dožene věk — ne teoretický strop ze `skills_max`. */
      strop: maSkauta ? vyhled.realnyStrop : null,
      /** Teoretický strop, kdyby měl nekonečně sezón — do doplňujícího textu. */
      stropNadani: maSkauta ? vyhled.odhadStropu : null,
      rozptylStropu: maSkauta ? rozptylStropu : null,
      talent: maSkauta ? talent : null,
      /** Slovní verdikt, taky jen odhad. */
      nadejnost: maSkauta ? vyhled.verdikt : null,
      rustZa120Dni: rustMap.get(h.id) ?? 0,
      /** Kolik sezón do úrovně základní sestavy; null = za zbytek kariéry to nestihne. */
      sezonDoAcka: vyhled.sezonDoSestavy,
      /** Už je na úrovni sestavy — připravený k povýšení. Táž laťka jako u prognózy. */
      pripravenyDoAcka: vyhled.jizNaSestavu,
      /** Kolik bodů letos povyroste dospíváním (0 = už na to má moc let). */
      dospivaniLetos: bodyDospivani(h.age, talent),
    };
  });

  return c.json({
    maU21: true,
    latka: {
      prumerKadru: latkyAcka.prumerKadru,
      zakladniSestava: latkyAcka.sestava,
      cil,
      /** Strop opor A-týmu — škála pro hvězdičkové hodnocení. */
      stropOpor: stropSestavyAcka.sestava,
    },
    maSkauta,
    hraci: vysledek,
  });
});

// GET /api/teams/:teamId/potencial-kadru — potenciál všech hráčů kádru najednou.
// Jedním dotazem místo N — přehled kádru by jinak střílel request na každý řádek.
developmentRouter.get("/teams/:teamId/potencial-kadru", async (c) => {
  const teamId = c.req.param("teamId");

  const odmitnuto = await overSiVlastnictvi(c, teamId);
  if (odmitnuto) return odmitnuto;

  const staff = await c.env.DB.prepare(
    "SELECT role, coaching, medicine, maintenance, judgement, communication, work_rate, charm FROM staff_members WHERE team_id = ?",
  ).bind(teamId).all<{ role: string; coaching: number; medicine: number; maintenance: number; judgement: number; communication: number; work_rate: number; charm: number }>()
    .catch((e) => { logger.warn({ module: "development", teamId }, "load staff", e); return { results: [] as never[] }; });

  const maSkauta = staff.results.some((r) => r.role === "skaut");
  if (!maSkauta) return c.json({ maSkauta: false, stropOpor: null, hraci: [] });

  const { scoutChanceMultiplier } = await import("../staff/staff-effects");
  const rozptyl = rozptylOdhadu(Math.max(0, scoutChanceMultiplier(staff.results) - 1));

  const latka = await c.env.DB.prepare(
    `SELECT ROUND(AVG(CASE WHEN poradi <= 11 THEN overall_rating END)) AS sestava
       FROM (SELECT overall_rating, ROW_NUMBER() OVER (ORDER BY overall_rating DESC) AS poradi
               FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active'))`,
  ).bind(teamId).first<{ sestava: number | null }>()
    .catch((e) => { logger.warn({ module: "development", teamId }, "load latka", e); return null; });
  const hodnoceniSestavy = latka?.sestava ?? 45;
  const stropy = await stropZakladniSestavy(c.env.DB, teamId, hodnoceniSestavy + 15);
  const latkyDnes = await nactiLatkyKadru(c.env.DB, teamId);
  const klenotKadru = await latkaKlenotuKlubu(c.env.DB, teamId, latkyDnes.nejlepsi + 10);

  const hraci = await c.env.DB.prepare(
    `SELECT id, age, position, overall_rating, hidden_talent, skills_max
       FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active')`,
  ).bind(teamId).all<{
    id: string; age: number; position: string; overall_rating: number;
    hidden_talent: number | null; skills_max: string | null;
  }>().catch((e) => { logger.warn({ module: "development", teamId }, "load squad", e); return { results: [] as never[] }; });

  const vysledek = hraci.results.map((h) => {
    const talent = h.hidden_talent ?? 0;
    let sm: Record<string, { maxPotential?: number }> = {};
    try { sm = h.skills_max ? JSON.parse(h.skills_max) as Record<string, { maxPotential?: number }> : {}; }
    catch (e) { logger.warn({ module: "development", playerId: h.id }, "parse skills_max", e); }

    const vyhled = vyhledHrace({
      vek: h.age, hodnoceni: h.overall_rating, pozice: h.position, talent,
      stropyDovednosti: sm,
      latky: { prumerKadru: latkyDnes.prumerKadru, sestavaDnes: latkyDnes.sestava, latkaKlenotu: klenotKadru },
      rozptyl, posun: stabilniPosun(`${h.id}:strop`),
    });
    if (vyhled.verdikt === null) return { id: h.id, strop: null, uroven: null, slovne: null };

    return { id: h.id, strop: vyhled.realnyStrop, uroven: vyhled.verdikt.uroven, slovne: vyhled.verdikt.slovne };
  });

  return c.json({ maSkauta: true, stropOpor: stropy.sestava, hraci: vysledek });
});

// POST /api/admin/academy-graduate/:teamId — ruční vychování odchovance.
// Stejný mechanismus, jaký spustí fáze `academy` na konci sezóny; slouží k ověření,
// že akademie funguje, bez čekání na konec ročníku.
developmentRouter.post("/admin/academy-graduate/:teamId", requireAdmin, async (c) => {
  const teamId = c.req.param("teamId");
  const { graduateAcademyClass, notifyAcademyGraduates } = await import("../season/academy-graduation");

  const season = await c.env.DB.prepare("SELECT id FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1")
    .first<{ id: string }>()
    .catch((e) => { logger.warn({ module: "development" }, "load active season", e); return null; });

  const odchovanci = await graduateAcademyClass(c.env.DB, teamId, season?.id ?? null);
  if (odchovanci.length > 0) await notifyAcademyGraduates(c.env.DB, teamId, odchovanci);

  return c.json({
    ok: true,
    pocet: odchovanci.length,
    odchovanci,
    // prázdné pole znamená „klub do mládeže nesype", „nemá U21", nebo „ročník nevyšel"
    poznamka: odchovanci.length > 0 ? null : "Žádný odchovanec — zkontroluj investici, U21 tým, nebo to prostě nevyšlo",
  });
});

// POST /api/admin/dospivani/:teamId — ruční spuštění dospívání mladých.
// Stejný mechanismus, jaký běží na konci sezóny po zestárnutí kádru; slouží k ověření,
// že rozvoj mládeže funguje, bez čekání na konec ročníku.
developmentRouter.post("/admin/dospivani/:teamId", requireAdmin, async (c) => {
  const teamId = c.req.param("teamId");
  const { dospejMladeHrace, oznamDospivani } = await import("../season/dospivani");

  const vyrostli = await dospejMladeHrace(c.env.DB, teamId);
  if (vyrostli.length > 0) await oznamDospivani(c.env.DB, teamId, vyrostli);

  return c.json({
    ok: true,
    pocet: vyrostli.length,
    hraci: vyrostli,
  });
});

// POST /api/admin/u21/cyklus — ruční spuštění dorostového cyklu.
// Stejný mechanismus, jaký běží při přechodu sezóny: přerostlí odejdou, přijde nový ročník.
developmentRouter.post("/admin/u21/cyklus", requireAdmin, async (c) => {
  const { dorostovyCyklusVsech } = await import("../season/u21-lifecycle");
  const souhrn = await dorostovyCyklusVsech(c.env.DB);
  return c.json({ ok: true, ...souhrn });
});

// POST /api/admin/u21/pregeneruj?scope=ai|all — přepíše soupisky dorostů dnešním generátorem.
//
// Dorostenci v rozehrané lize vznikli podle starých pravidel: s AI penalizací (−6 až −12
// z průměrů, −4 až −8 ze stropů) a bez šance na wonderkida. Naměřeno na 212 hráčích —
// průměrný strop 48 proti 59 u dnešního generátoru a talent 60+ jen u 2 z nich proti 6 %.
// Generátor je opravený, ale stará data se sama nepřepíšou.
//
// NEVRATNÉ: současní dorostenci zmizí.
//   `scope=ai`    (výchozí) jen kluby řízené počítačem
//   `scope=human` jen kluby skutečných hráčů
//   `scope=all`   všechny
developmentRouter.post("/admin/u21/pregeneruj", requireAdmin, async (c) => {
  const dotazScope = c.req.query("scope");
  const scope = dotazScope === "all" ? "all" : dotazScope === "human" ? "human" : "ai";
  const filtr = scope === "ai" ? " AND rodic.user_id = 'ai'"
    : scope === "human" ? " AND rodic.user_id != 'ai'" : "";

  const tymy = await c.env.DB.prepare(
    `SELECT t.id, t.parent_team_id FROM teams t JOIN teams rodic ON rodic.id = t.parent_team_id
      WHERE t.team_type = 'u21'` + filtr,
  ).all<{ id: string; parent_team_id: string }>()
    .catch((e) => { logger.warn({ module: "development" }, "load u21 teams", e); return { results: [] as never[] }; });

  const { pregenerujDorost } = await import("../season/u21-lifecycle");
  const vysledky: { teamId: string; smazano: number; vytvoreno: number }[] = [];
  for (const t of tymy.results) {
    vysledky.push(await pregenerujDorost(c.env.DB, t.id));
  }

  return c.json({
    ok: true, scope, tymu: vysledky.length,
    smazano: vysledky.reduce((s, v) => s + v.smazano, 0),
    vytvoreno: vysledky.reduce((s, v) => s + v.vytvoreno, 0),
  });
});

// POST /api/admin/u21/narovnej?scope=human|ai|all — narovná potenciál stávajících dorostenců.
//
// Na rozdíl od `pregeneruj` NIKOHO nemaže: kluci zůstávají i s tím, co dnes umí, jen se jim
// vrací strop, který jim sebrala stará AI penalizace, a 7 % ročníku dostane výrazný talent.
// Smyslem je, aby šlo současného dorostence vypiplat do áčka.
developmentRouter.post("/admin/u21/narovnej", requireAdmin, async (c) => {
  const q = c.req.query("scope");
  const scope = q === "all" ? "all" : q === "ai" ? "ai" : "human";
  const { narovnejDorosty } = await import("../season/narovnani-dorostu");
  const souhrn = await narovnejDorosty(c.env.DB, scope);
  return c.json({ ok: true, scope, ...souhrn });
});

export default developmentRouter;
