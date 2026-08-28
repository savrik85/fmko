/**
 * Výhled hráče nad SKUTEČNÝMI daty, ne nad vymyšlenými čísly.
 *
 * `verdikt.test.ts` projíždí prostor věků a stropů křížem, ale hraje si s hodnotami, které
 * si vymyslí sám. Tenhle test bere lokální D1 a pouští výhled na každého hráče, který v ní
 * je — s laťkami jeho vlastního klubu. Právě takhle vyplavaly věci, které syntetický test
 * minul: hráči bez `skills_max` po starších generacích, brankáři s vlastními názvy
 * dovedností, odchovanci bez jediného řádku tréninkové historie.
 *
 * Bez lokální databáze se test přeskočí — na čistém klonu repozitáře nemá co číst.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { vyhledHrace, teoretickyStropHrace } from "./vyhled-hrace";
import { pasmo, type LatkyKadru } from "./verdikt";

const ADRESAR_D1 = join(__dirname, "../../.wrangler/state/v3/d1/miniflare-D1DatabaseObject");

interface HracRadek {
  id: string; age: number; position: string; overall_rating: number;
  hidden_talent: number | null; skills_max: string | null; team_id: string;
}

/**
 * Dotaz do lokální D1 přes `sqlite3` z systému. Node nemá vestavěný SQLite bez experimentální
 * vlajky a kvůli jednomu testu nemá cenu tahat do projektu nativní závislost.
 *
 * Do souboru zároveň zapisuje běžící `wrangler dev`, takže čtení občas skončí na
 * „unable to open database file (14)". Volající to musí ustát a databázi přeskočit —
 * test má hlídat rozpory ve výhledu, ne kdo zrovna drží zámek.
 */
function dotaz<T>(cesta: string, sql: string, ...parametry: string[]): T[] {
  // `sqlite3` neumí vázané parametry z příkazové řádky — všechno za dotazem bere jako další
  // SQL. Zástupné `?1` se proto nahradí uvozeným literálem.
  const hotoveSql = sql.replace(/\?(\d+)/g, (_, cislo: string) => {
    const hodnota = parametry[Number(cislo) - 1];
    if (hodnota === undefined) throw new Error(`chybí parametr ?${cislo}`);
    return `'${hodnota.replace(/'/g, "''")}'`;
  });
  const vystup = execFileSync("sqlite3", ["-json", "-readonly", cesta, hotoveSql], {
    encoding: "utf-8", maxBuffer: 64 * 1024 * 1024,
  });
  return vystup.trim() ? (JSON.parse(vystup) as T[]) : [];
}

/** Všechny lokální D1 databáze, které obsahují hráče. */
function najdiDatabaze(): string[] {
  if (!existsSync(ADRESAR_D1)) return [];
  return readdirSync(ADRESAR_D1)
    .filter((f) => f.endsWith(".sqlite"))
    .map((f) => join(ADRESAR_D1, f))
    .filter((cesta) => {
      try {
        return (dotaz<{ n: number }>(cesta, "SELECT COUNT(*) AS n FROM players")[0]?.n ?? 0) > 0;
      } catch {
        // Nezajímá nás PROČ soubor nejde přečíst — KV, rozpracovaná migrace, cokoli.
        // Do testu patří jen databáze, ze kterých se dají přečíst hráči.
        return false;
      }
    });
}

/** Laťky klubu — táž definice jako `nactiLatkyKadru` v routeru. */
function latkyTymu(cesta: string, teamId: string): LatkyKadru & { nejlepsi: number } {
  const r = dotaz<{ prumer: number | null; sestava: number | null; nejlepsi: number | null }>(
    cesta,
    `SELECT ROUND(AVG(overall_rating)) AS prumer,
            MIN(CASE WHEN poradi <= 11 THEN overall_rating END) AS sestava,
            MAX(overall_rating) AS nejlepsi
       FROM (SELECT overall_rating, ROW_NUMBER() OVER (ORDER BY overall_rating DESC) AS poradi
               FROM players WHERE team_id = ?1 AND (status IS NULL OR status = 'active'))`,
    teamId,
  )[0];

  const sestava = r?.sestava ?? 45;
  return {
    prumerKadru: r?.prumer ?? sestava - 5,
    sestavaDnes: sestava,
    nejlepsi: r?.nejlepsi ?? sestava + 5,
    latkaKlenotu: 0, // doplní se z klubu níž
  };
}

/** Laťka klenotu — táž definice jako `latkaKlenotuKlubu`. */
function klenotKlubu(cesta: string, clubId: string, zaloha: number): number {
  const rows = dotaz<{ position: string; skills_max: string; hidden_talent: number | null }>(
    cesta,
    `SELECT p.position, p.skills_max, p.hidden_talent
       FROM players p JOIN teams t ON t.id = p.team_id
      WHERE (t.id = ?1 OR t.parent_team_id = ?1)
        AND (p.status IS NULL OR p.status = 'active') AND p.skills_max IS NOT NULL`,
    clubId,
  );

  const stropy: number[] = [];
  for (const r of rows) {
    let sm: Record<string, { maxPotential?: number }>;
    try { sm = JSON.parse(r.skills_max) as Record<string, { maxPotential?: number }>; }
    catch { continue; }
    const s = teoretickyStropHrace(r.position, sm, r.hidden_talent ?? 0);
    if (s !== null) stropy.push(s);
  }
  if (stropy.length === 0) return zaloha;
  return Math.round(Math.max(...stropy) * 0.92);
}

const databaze = najdiDatabaze();

describe.skipIf(databaze.length === 0)("výhled nad skutečnými daty z lokální D1", () => {
  it("žádný hráč nedostane dvě protichůdná tvrzení", () => {
    const rozpory: string[] = [];
    let prosetreno = 0;

    let precteno = 0;
    for (const cesta of databaze) {
      let hraci: Array<HracRadek & { club_id: string }>;
      try {
        hraci = dotaz<HracRadek & { club_id: string }>(
        cesta,
        `SELECT p.id, p.age, p.position, p.overall_rating, p.hidden_talent, p.skills_max,
                p.team_id, COALESCE(t.parent_team_id, t.id) AS club_id
           FROM players p JOIN teams t ON t.id = p.team_id
          WHERE (p.status IS NULL OR p.status = 'active')`,
        );
      } catch { continue; }
      precteno++;

      const cacheLatek = new Map<string, LatkyKadru>();

      for (const h of hraci) {
        let latky = cacheLatek.get(h.club_id);
        if (!latky) {
          const zaklad = latkyTymu(cesta, h.club_id);
          latky = {
            prumerKadru: zaklad.prumerKadru,
            sestavaDnes: zaklad.sestavaDnes,
            latkaKlenotu: klenotKlubu(cesta, h.club_id, zaklad.nejlepsi + 10),
          };
          cacheLatek.set(h.club_id, latky);
        }

        let sm: Record<string, { maxPotential?: number }> = {};
        try { sm = h.skills_max ? JSON.parse(h.skills_max) as typeof sm : {}; } catch { sm = {}; }

        // Projet celý rozsah přesnosti skauta i posunů odhadu — manažer bez skauta vidí
        // mlhu ±18, špičkový skaut ±4, a odhad se posouvá podle ID hráče. Rozpor, který
        // vyleze jen při jednom konkrétním posunu, je pořád rozpor.
        for (const rozptyl of [4, 8, 12, 18]) {
          for (const posun of [-1, -0.5, 0, 0.5, 1]) {
            const v = vyhledHrace({
              vek: h.age, hodnoceni: h.overall_rating, pozice: h.position,
              talent: h.hidden_talent ?? 0, stropyDovednosti: sm,
              latky, rozptyl, posun,
            });
            prosetreno++;
            if (v.verdikt === null) continue;

            const kdo = `${h.id.slice(0, 8)} ${h.age}let ${h.overall_rating}→${v.realnyStrop} ±${rozptyl}`;
            const slibujeSestavu = v.verdikt.uroven === "hvezda" || v.verdikt.uroven === "nadejny";

            // A. Odznak nesmí slibovat sestavu tomu, kdo se na ni podle prognózy nedotáhne
            if (slibujeSestavu && v.sezonDoSestavy === null && !v.jizNaSestavu) {
              rozpory.push(`${kdo}: "${v.verdikt.slovne}" ale nedotáhne se`);
            }
            // B. „Na áčko nemá" nesmí dostat hráč, který se do sestavy dostane
            if (v.verdikt.uroven === "slaby" && (v.sezonDoSestavy !== null || v.jizNaSestavu)) {
              rozpory.push(`${kdo}: "${v.verdikt.slovne}" ale ${v.jizNaSestavu ? "už na to má" : `dotáhne za ${v.sezonDoSestavy}`}`);
            }
            // C. Strop nesmí být pod dnešním hodnocením ani nad odhadem
            if (v.realnyStrop! < h.overall_rating) rozpory.push(`${kdo}: strop pod hodnocením`);
            if (v.realnyStrop! > v.odhadStropu!) rozpory.push(`${kdo}: reálný strop nad odhadem`);
            // D. Rozpětí musí strop obsahovat, jinak zobrazená čísla nedávají smysl
            if (v.realnyStrop! < v.dolniOdhad! || v.realnyStrop! > v.horniOdhad!) {
              rozpory.push(`${kdo}: strop mimo rozpětí ${v.dolniOdhad}–${v.horniOdhad}`);
            }
            // E. Odznak se ukazuje jen tehdy, když hráče posune výš, než kde dnes je
            if (v.verdikt.zobrazit && pasmo(v.realnyStrop!, latky) <= pasmo(h.overall_rating, latky)) {
              rozpory.push(`${kdo}: odznak se ukazuje, ale žádný posun neslibuje`);
            }
          }
        }
      }
    }

    expect(precteno, "žádnou lokální D1 se nepodařilo přečíst").toBeGreaterThan(0);
    expect(prosetreno).toBeGreaterThan(0);
    expect(rozpory.slice(0, 8), `${rozpory.length} rozporů z ${prosetreno} kombinací`).toEqual([]);
  });

  it("brankáři mají spočítaný strop stejně jako hráči v poli", () => {
    const bezStropu: string[] = [];
    let brankaru = 0;

    for (const cesta of databaze) {
      let gk: Array<{ id: string; position: string; skills_max: string; hidden_talent: number | null }>;
      try {
        gk = dotaz(
          cesta,
          `SELECT id, position, skills_max, hidden_talent FROM players
            WHERE position = 'GK' AND (status IS NULL OR status = 'active') AND skills_max IS NOT NULL`,
        );
      } catch { continue; }

      for (const g of gk) {
        brankaru++;
        let sm: Record<string, { maxPotential?: number }> = {};
        try { sm = JSON.parse(g.skills_max) as typeof sm; } catch { sm = {}; }
        // Brankář bez spočítaného stropu = prázdné hvězdy a pomlčka v kádru. Přesně tohle
        // způsobovaly ploché vs. brankářské názvy dovedností.
        if (teoretickyStropHrace(g.position, sm, g.hidden_talent ?? 0) === null) {
          bezStropu.push(`${g.id.slice(0, 8)}: ${Object.keys(sm).slice(0, 4).join(",")}`);
        }
      }
    }

    expect(brankaru).toBeGreaterThan(0);
    expect(bezStropu.slice(0, 5), `${bezStropu.length} brankářů z ${brankaru} bez stropu`).toEqual([]);
  });

  it("nikdo nemá strop dovednosti pod její současnou hodnotou", () => {
    const chybne: string[] = [];

    for (const cesta of databaze) {
      let hraci: Array<{ id: string; skills_max: string }>;
      try {
        hraci = dotaz(
          cesta,
          `SELECT id, skills_max FROM players
            WHERE (status IS NULL OR status = 'active') AND skills_max IS NOT NULL`,
        );
      } catch { continue; }

      for (const h of hraci) {
        let sm: Record<string, { current?: number; maxPotential?: number }> = {};
        try { sm = JSON.parse(h.skills_max) as typeof sm; } catch { continue; }
        for (const [dovednost, hodnoty] of Object.entries(sm)) {
          const { current, maxPotential } = hodnoty ?? {};
          if (typeof current === "number" && typeof maxPotential === "number" && maxPotential < current) {
            chybne.push(`${h.id.slice(0, 8)} ${dovednost}: ${current} > strop ${maxPotential}`);
          }
        }
      }
    }

    expect(chybne.slice(0, 8), `${chybne.length} dovedností nad vlastním stropem`).toEqual([]);
  });

  it("kdo stojí v základní sestavě, ten na ni podle výhledu má", () => {
    // Laťka „hraje už za áčko?" musí být hranice VSTUPU do sestavy, ne její průměr.
    // S průměrem pod ní skončila zhruba půlka vlastních opor: naměřeno na produkci
    // 499 z 946 hráčů základních sestav, kterým výhled tvrdil „možná sestava áčka",
    // přestože v té sestavě stáli. Stačí jeden vytáhlý hráč a laťka uteče nad zbytek.
    const rozpory: string[] = [];

    for (const cesta of databaze) {
      let tymy: Array<{ team_id: string }>;
      try {
        tymy = dotaz(cesta, "SELECT DISTINCT team_id FROM players WHERE team_id IS NOT NULL");
      } catch { continue; }

      for (const { team_id } of tymy) {
        const sestava = dotaz<{ id: string; overall_rating: number }>(
          cesta,
          `SELECT id, overall_rating FROM players
            WHERE team_id = ?1 AND (status IS NULL OR status = 'active')
            ORDER BY overall_rating DESC LIMIT 11`,
          team_id,
        );
        if (sestava.length === 0) continue;

        const latka = latkyTymu(cesta, team_id).sestavaDnes;
        for (const h of sestava) {
          if (h.overall_rating < latka) {
            rozpory.push(`${h.id.slice(0, 8)} hodnocení ${h.overall_rating} < laťka ${latka}`);
          }
        }
      }
    }

    expect(rozpory.slice(0, 8), `${rozpory.length} hráčů základní sestavy pod vlastní laťkou`).toEqual([]);
  });
});
