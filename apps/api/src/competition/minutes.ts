/**
 * Zápis ze zasedání grémia do Zpravodaje.
 *
 * Píše ho redaktor okresní redakce, takže tonalita se liší podle toho, kdo zrovna
 * dostal službu — ale kostra a čísla jsou pevná: kdo přišel, jak co dopadlo,
 * kdo hlasoval proti, jedna citace a stav pokladny. Bulvár z toho udělá aféru,
 * seriózní redaktor tabulku, ale odhlasovaná částka je v obou případech stejná.
 *
 * Text se skládá ručně, ne přes AI: zasedání je jednou týdně v každé soutěži
 * a zápis musí vzniknout i tehdy, když je jazykový model vypnutý nebo mimo kvótu.
 */

import { logger } from "../lib/logger";
import { druhyPad } from "../lib/league-name";
import { hlasovanyBod } from "./defaults";
import { jmenoRedaktora, redaktorProRubriku, type Journalist } from "../news/journalists";

const M = "competition-minutes";

/** Jeden projednaný bod tak, jak ho zasedání vrátí. */
export interface MinutesItem {
  kind?: string;
  title: string;
  status: string;
  pro?: number;
  proti?: number;
  zdrzel?: number;
  resultNote?: string | null;
  /** U volby: jméno zvoleného a název funkce, ať se dá napsat slavnostní lead. */
  zvolen?: string | null;
  roleLabel?: string | null;
}

export interface MinutesInput {
  leagueId: string;
  leagueName: string;
  seasonNumber: number;
  gameDate: string;
  items: MinutesItem[];
  attendance: { voters: number; active: number; quorum: number };
  hlasovalo: number;
  balance: number;
  /** Kdo byl proti, po jednotlivých bodech. Volba se sem nikdy nedostane — je tajná. */
  protiHlasy: Record<string, string[]>;
  /** Prezident soutěže, jehož citace jde do článku. Null, když je funkce neobsazená. */
  prezident: { managerName: string | null; teamName: string } | null;
}

const czk = (n: number) => `${Math.round(n).toLocaleString("cs")} Kč`;

/**
 * České skloňování po číslovce i se slovesem: 1 klub nehlasoval, 2 kluby
 * nehlasovaly, 5 klubů nehlasovalo. Bez toho v novinách stálo „3 klubů
 * nehlasovalo", což je hláška z překladače, ne z okresního plátku.
 */
function tvar(n: number, jeden: string, dva: string, pet: string): string {
  return `${n} ${n === 1 ? jeden : n >= 2 && n <= 4 ? dva : pet}`;
}

function vysledek(status: string): string {
  switch (status) {
    case "passed": return "prošlo";
    case "rejected": return "neprošlo";
    case "no_quorum": return "spadlo pod stůl, protože se nesešlo dost hlasů";
    case "withdrawn": return "navrhovatel stáhl";
    default: return status;
  }
}

/** Titulek podle toho, jak zasedání dopadlo — a podle povahy redaktora. */
function titulek(j: Journalist | null, vstup: MinutesInput, prijato: number): string {
  // Název soutěže je proměnná — po přijetí sponzora se z „Přeboru Prahy" stane
  // „Gambrinus liga", takže se do věty musí ohnout, ne vlepit.
  const liga = druhyPad(vstup.leagueName);
  const style = j?.style ?? "seriozni";
  const nic = prijato === 0;

  if (style === "bulvar") {
    return nic
      ? `Grémium ${liga} se sešlo a nedohodlo se na ničem`
      : `Zasedání grémia ${liga}: padlo ${tvar(prijato, "rozhodnutí", "rozhodnutí", "rozhodnutí")}, a ne všem se líbí`;
  }
  if (style === "vycurany") {
    return nic
      ? `Grémium ${liga} zasedalo. Výsledek? Posuďte sami`
      : `Grémium ${liga} rozhodlo. Kdo na tom vydělá, se ukáže`;
  }
  if (style === "patriot") {
    return nic
      ? "Naše grémium jednalo, rozhodnutí ale nepadlo"
      : `Grémium ${liga} má jasno: ${tvar(prijato, "bod schválen", "body schváleny", "bodů schváleno")}`;
  }
  return nic
    ? `Zasedání grémia ${liga} skončilo bez usnesení`
    : `Grémium ${liga} schválilo ${tvar(prijato, "bod", "body", "bodů")}`;
}

/** Úvodní odstavec o účasti. */
function ucast(j: Journalist | null, v: MinutesInput): string {
  const { hlasovalo, attendance } = v;
  const chybelo = Math.max(0, attendance.voters - hlasovalo);
  const style = j?.style ?? "seriozni";

  const zaklad = `Hlasovací právo mělo ${tvar(attendance.voters, "klub", "kluby", "klubů")}`
    + `, do hlasování se ${hlasovalo === 1 ? "zapojil" : hlasovalo >= 2 && hlasovalo <= 4 ? "zapojily" : "zapojilo"} ${hlasovalo}.`
    + ` K usnesení ${attendance.quorum === 1 ? "byl potřeba" : attendance.quorum <= 4 ? "byly potřeba" : "bylo potřeba"}`
    + ` ${tvar(attendance.quorum, "hlas", "hlasy", "hlasů")}.`;

  if (chybelo === 0) return `${zaklad} Nechyběl nikdo.`;
  if (style === "bulvar") {
    return `${zaklad} ${tvar(chybelo, "klub si zasedání odpustil", "kluby si zasedání odpustily", "klubů si zasedání odpustilo")}`
      + " — a pak se prý diví.";
  }
  if (style === "patriot") {
    return `${zaklad} Mrzí, že ${tvar(chybelo, "klub nedorazil", "kluby nedorazily", "klubů nedorazilo")}.`;
  }
  return `${zaklad} ${tvar(chybelo, "klub nehlasoval", "kluby nehlasovaly", "klubů nehlasovalo")}.`;
}

/** Jeden bod programu v řeči novin. */
function bod(v: MinutesInput, it: MinutesItem): string {
  const pomer = typeof it.pro === "number" && typeof it.proti === "number"
    ? ` (${it.pro}:${it.proti}${it.zdrzel ? `, ${it.zdrzel} se zdrželo` : ""})`
    : "";

  // Volba je tajná, kontrola pravidel není hlasování — u obou by poměr lhal.
  if (it.kind === "election" || it.kind === "compliance" || it.kind === "vacated") {
    return `• ${it.title}. ${it.resultNote ?? ""}`.trim();
  }

  const proti = v.protiHlasy[it.title];
  const jmenovite = proti && proti.length > 0
    ? ` Proti byli: ${proti.join(", ")}.`
    : "";

  return `• ${it.title} — ${vysledek(it.status)}${pomer}.${jmenovite}`;
}

/** Citace. Mluvčím je prezident soutěže; když funkce není obsazená, mluví redaktor. */
function citace(j: Journalist | null, v: MinutesInput, prijato: number): string {
  const style = j?.style ?? "seriozni";
  const vety = prijato > 0
    ? [
      "Kluby se dohodly a to je hlavní. Kdo chce něco změnit, ať přijde s návrhem.",
      "Rozhodli jsme se podle toho, co soutěži prospěje. Ne podle toho, co se komu líbí.",
      "Peníze soutěže nejsou ničí kapsa. Každá koruna má svůj řádek.",
    ]
    : [
      "Nic se nedohodlo. Příště snad dorazí víc klubů.",
      "Když se nehlasuje, rozhoduje za nás nikdo. To není dobrý stav.",
    ];

  const idx = Math.abs(v.gameDate.length + v.leagueName.length) % vety.length;
  const veta = vety[idx];

  if (!v.prezident) {
    const redakce = style === "bulvar"
      ? "Prezident soutěže není zvolený, takže se k výsledkům nemá kdo vyjádřit. Příznačné."
      : "Prezident soutěže zatím zvolený není, oficiální vyjádření tedy chybí.";
    return redakce;
  }

  const kdo = v.prezident.managerName ?? v.prezident.teamName;
  return `„${veta}" řekl po zasedání prezident soutěže ${kdo} (${v.prezident.teamName}).`;
}

/**
 * Zasedání, na kterém se volilo, není běžná schůze. Zvolení vedení je událost
 * a článek tak musí vypadat — jménem v titulku a jmény v prvním odstavci, ne
 * odrážkou mezi ostatními body.
 */
function zvoleni(v: MinutesInput): Array<{ role: string; kdo: string; title: string }> {
  return v.items
    .filter((i) => i.kind === "election" && i.status === "passed" && i.zvolen)
    .map((i) => ({ role: i.roleLabel ?? "ve vedení soutěže", kdo: i.zvolen as string, title: i.title }));
}

/** Sestaví text zápisu. Čistá funkce — jde otestovat bez databáze. */
export function sestavZapis(j: Journalist | null, v: MinutesInput): { headline: string; body: string } {
  // Jen usnesení, o kterých se hlasovalo. Pokuta za neposekané hřiště není bod,
  // který by grémium schválilo — a když se do počtu připočítávala, vyšel titulek
  // „Grémium schválilo 6 bodů" nad zasedáním, kde neprošlo vůbec nic.
  const prijato = v.items.filter((i) => hlasovanyBod(i.kind ?? "") && i.status === "passed").length;
  const volby = zvoleni(v);
  const liga = druhyPad(v.leagueName);

  // Z programu vypadnou jen ty volby, které se opravdu dostaly do úvodu. Volba
  // bez jména zvoleného tam nepatří, ale zmizet z článku taky nesmí.
  const vUvodu = new Set(volby.map((z) => z.title));
  const radky = v.items
    .filter((i) => !vUvodu.has(i.title))
    .map((it) => bod(v, it))
    .filter(Boolean);

  if (volby.length > 0) {
    const seznam = volby.map((z) => `${z.role}: ${z.kdo}`);
    const prvni = volby[0];
    const headline = volby.length >= 3
      ? `${liga.charAt(0).toUpperCase()}${liga.slice(1)} má nové vedení`
      : `${prvni.role} ${liga}: ${prvni.kdo}`;

    const uvod = volby.length === 1
      ? `Soutěž má nového funkcionáře. Do funkce ${prvni.role.toLowerCase()} byl zvolen ${prvni.kdo}.`
      : `Soutěž má vedení. Kluby si zvolily ${tvar(volby.length, "funkcionáře", "funkcionáře", "funkcionářů")}:`;

    const body = [
      uvod,
      ...(volby.length === 1 ? [] : seznam.map((r) => `• ${r}`)),
      "",
      ucast(j, v),
      ...(radky.length > 0 ? ["", "Dál se na programu zasedání objevilo:", ...radky] : []),
      "",
      citace(j, v, prijato),
      "",
      `V pokladně soutěže po zasedání zůstalo ${czk(v.balance)}.`,
    ].join("\n");

    return { headline, body };
  }

  const body = [
    ucast(j, v),
    "",
    radky.length > 0 ? "Z programu zasedání:" : "Na programu nebyl žádný bod.",
    ...radky,
    "",
    citace(j, v, prijato),
    "",
    `V pokladně soutěže po zasedání zůstalo ${czk(v.balance)}.`,
  ].join("\n");

  return { headline: titulek(j, v, prijato), body };
}

/**
 * Napíše zápis do Zpravodaje a vrátí id článku.
 *
 * Idempotence stojí na `competition_meetings.news_id`: volající si výsledek uloží
 * a podruhé už negeneruje. Sám o sobě zápis nic nekontroluje, protože zasedání
 * je proti dvojímu běhu chráněné vlastním claimem.
 */
export async function publikujZapis(db: D1Database, v: MinutesInput): Promise<string | null> {
  if (v.items.length === 0) return null;

  const redaktor = await redaktorProRubriku(db, v.leagueId, "governance_minutes", v.gameDate)
    .catch((e) => { logger.warn({ module: M }, "výběr redaktora", e); return null; });

  const { headline, body } = sestavZapis(redaktor, v);

  const gameWeek = await db.prepare(
    `SELECT MAX(game_week) AS w FROM season_calendar
      WHERE league_id = ? AND season_number = ? AND scheduled_at <= ?`
  ).bind(v.leagueId, v.seasonNumber, v.gameDate).first<{ w: number | null }>()
    .catch((e) => { logger.warn({ module: M }, "herní kolo pro zápis", e); return null; });

  const id = crypto.randomUUID();
  const res = await db.prepare(
    `INSERT INTO news (id, league_id, type, headline, body, game_week, season_number, journalist_id, created_at)
     VALUES (?, ?, 'governance_minutes', ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))`
  ).bind(id, v.leagueId, headline, body, gameWeek?.w ?? null, v.seasonNumber, redaktor?.id ?? null)
    .run()
    .catch((e) => { logger.error({ module: M }, "zápis do zpravodaje", e); return null; });
  if (!res) return null;

  logger.info(
    { module: M },
    `soutěž ${v.leagueId}: zápis ze zasedání do zpravodaje${redaktor ? ` (${jmenoRedaktora(redaktor)})` : ""}`,
  );
  return id;
}

/** Kdo hlasoval proti, po jednotlivých bodech. Volby se sem nikdy nedostanou. */
export async function nactiProtiHlasy(
  db: D1Database, leagueId: string, gameDate: string,
): Promise<Record<string, string[]>> {
  const rows = await db.prepare(
    `SELECT p.title, t.name AS team_name
       FROM competition_proposals p
       JOIN competition_ballots b ON b.proposal_id = p.id AND b.answer = 'proti'
       JOIN teams t ON t.id = b.team_id
      WHERE p.league_id = ? AND p.closed_game_date = ?
      ORDER BY t.name`
  ).bind(leagueId, gameDate).all<{ title: string; team_name: string }>()
    .catch((e) => { logger.warn({ module: M }, "hlasy proti", e); return { results: [] }; });

  const out: Record<string, string[]> = {};
  for (const r of rows.results) (out[r.title] ??= []).push(r.team_name);
  return out;
}

/** Prezident soutěže pro citaci. */
export async function mluvci(
  db: D1Database, leagueId: string, seasonNumber: number,
): Promise<{ managerName: string | null; teamName: string } | null> {
  const row = await db.prepare(
    `SELECT t.name AS team_name,
            (SELECT m.name FROM managers m WHERE m.team_id = t.id ORDER BY m.created_at LIMIT 1) AS manager_name
       FROM competition_officials o
       JOIN teams t ON t.id = o.team_id
      WHERE o.league_id = ? AND o.season_number = ? AND o.role = 'predseda' AND o.status = 'active'`
  ).bind(leagueId, seasonNumber).first<{ team_name: string; manager_name: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "mluvčí soutěže", e); return null; });
  if (!row) return null;
  return { managerName: row.manager_name, teamName: row.team_name };
}
