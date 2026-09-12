/**
 * Tribuna — zápis příspěvků z toho, co se opravdu stalo.
 *
 * Nic se tu nevymýšlí: každý příspěvek má za sebou řádek v `club_events`,
 * `fan_incidents`, výsledek zápasu, změnu oblíbence nebo kampaň. Kdyby se
 * generovaly „nálady bez příčiny", byla by to kulisa — a přesně tomu se tady
 * vyhýbáme.
 *
 * Výběr šablony je deterministický (seed z reference_id), takže opakovaný běh
 * napíše totéž a `reference_id` s partial UNIQUE zabrání duplicitě.
 */

import { createRng } from "../generators/rng";
import { seedFromString } from "../lib/seed";
import { logger } from "../lib/logger";
import {
  HLAS_PARTY, PREZDIVKY, PRISPEVKY_K_UDALOSTEM, PRISPEVKY_K_VYTRZNOSTEM,
  PRISPEVKY_K_ZAPASU, PRISPEVKY_K_OBLIBENCUM, PRISPEVKY_K_RIVALITE,
  PRISPEVKY_K_TAKTICE, PRISPEVKY_KE_STRELBE,
  doplnText, lajky,
  type PostSablona, type PostTone, type PostTopic, type AuthorKind,
} from "../engine/fan-posts";
import type { FanGroupKind } from "../engine/fan-groups";
import type { ClubEventKind } from "../engine/fan-reactions";
import type { FanGroupRow, FanLeaderRow } from "./fan-group-generator";
import { fanLeaderFullName } from "./fan-group-generator";
import type { KampanRow } from "./fan-campaigns";

const M = "fan-feed";

export interface NovyPrispevek {
  referenceId: string;
  teamId: string;
  authorName: string;
  authorHandle: string;
  authorKind: AuthorKind;
  authorAvatar?: string | null;
  groupId?: string | null;
  body: string;
  tone: PostTone;
  likes: number;
  topic: PostTopic;
  gameDate: string;
}

/** Zápis. `INSERT OR IGNORE` na reference_id drží idempotenci. */
export async function zapisPrispevky(db: D1Database, prispevky: NovyPrispevek[]): Promise<number> {
  if (prispevky.length === 0) return 0;
  const stmts = prispevky.map((p) =>
    db.prepare(
      `INSERT OR IGNORE INTO fan_posts
         (id, reference_id, team_id, author_name, author_handle, author_kind,
          author_avatar, group_id, body, tone, likes, topic, game_date)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      `post-${p.referenceId}`, p.referenceId, p.teamId, p.authorName, p.authorHandle,
      p.authorKind, p.authorAvatar ?? null, p.groupId ?? null, p.body, p.tone,
      p.likes, p.topic, p.gameDate,
    ),
  );
  const res = await db.batch(stmts)
    .catch((e) => { logger.warn({ module: M }, "zápis příspěvků", e); return null; });
  return res ? prispevky.length : 0;
}

/**
 * Kdo to píše.
 *
 * Vůdce party mluví pod svým jménem a s vlastním obličejem — je to ta samá
 * osoba, co posílá SMS, takže musí být poznat. Ostatní jsou běžní fanoušci
 * s přezdívkou; ta se vybírá deterministicky, aby „Pepa od plotu" byl pořád
 * tentýž Pepa a ne pokaždé někdo jiný.
 */
function autor(
  group: FanGroupRow,
  leader: FanLeaderRow | undefined,
  seed: string,
  zaVudce: boolean,
): { name: string; handle: string; kind: AuthorKind; avatar: string | null } {
  const hlas = HLAS_PARTY[group.kind as FanGroupKind] ?? { handle: "fanousek", podpis: "" };
  if (zaVudce && leader) {
    return {
      name: fanLeaderFullName(leader),
      handle: `${odstranDiakritiku(leader.last_name).toLowerCase()}_${hlas.handle}`,
      kind: "vudce",
      avatar: leader.avatar ?? null,
    };
  }
  const rng = createRng(seedFromString(`autor|${seed}|${group.kind}`));
  const prezdivka = rng.pick(PREZDIVKY);
  return {
    name: prezdivka,
    handle: `${odstranDiakritiku(prezdivka).toLowerCase().replace(/[^a-z0-9]+/g, "")}_${hlas.handle}`,
    kind: "fanousek",
    avatar: null,
  };
}

/** Šablona, která sedí téhle partě. `null`, když se k tomu ta parta nevyjadřuje. */
function vyberSablonu(
  sablony: readonly PostSablona[],
  kind: FanGroupKind,
  roll: number,
): PostSablona | null {
  const vhodne = sablony.filter((s) => !s.party || s.party.includes(kind));
  if (vhodne.length === 0) return null;
  return vhodne[Math.floor(roll * vhodne.length) % vhodne.length];
}

interface Kontext {
  teamId: string;
  groups: readonly FanGroupRow[];
  leaders: Map<string, FanLeaderRow>;
  gameDate: string;
}

/** Jeden příspěvek od jedné party na dané téma. */
function slozPrispevek(
  ctx: Kontext,
  group: FanGroupRow,
  opts: {
    referenceId: string;
    sablony: readonly PostSablona[];
    topic: PostTopic;
    data: Record<string, string | undefined>;
    /** Vůdce se ozývá u věcí, co se týkají jeho party přímo. */
    zaVudce?: boolean;
  },
): NovyPrispevek | null {
  const rng = createRng(seedFromString(`post|${opts.referenceId}|${group.kind}`));
  const sablona = vyberSablonu(opts.sablony, group.kind as FanGroupKind, rng.random());
  if (!sablona) return null;

  const text = doplnText(rng.pick(sablona.texty), opts.data);
  if (!text) return null;

  const leader = group.leader_id ? ctx.leaders.get(group.leader_id) : undefined;
  const a = autor(group, leader, opts.referenceId, opts.zaVudce === true);

  return {
    referenceId: `${opts.referenceId}-${group.kind}`,
    teamId: ctx.teamId,
    authorName: a.name,
    authorHandle: `@${a.handle}`,
    authorKind: a.kind,
    authorAvatar: a.avatar,
    groupId: group.id,
    body: text,
    tone: sablona.tone,
    likes: lajky({ size: group.size, tone: sablona.tone, mood: group.mood, roll: rng.random() }),
    topic: opts.topic,
    gameDate: ctx.gameDate,
  };
}

/**
 * Kolik part se k jedné věci ozve.
 *
 * Ne všechny — zeď, kde po každé události přistane pět příspěvků, se nedá číst.
 * Vybírají se ty, kterým na tom nejvíc záleží (vášeň) a které to nejvíc cítí.
 */
function kdoSeOzve(groups: readonly FanGroupRow[], max: number, seed: string): FanGroupRow[] {
  const rng = createRng(seedFromString(`kdo|${seed}`));
  return [...groups]
    .map((g) => ({ g, vaha: g.passion + Math.abs(50 - g.mood) + rng.random() * 30 }))
    .sort((a, b) => b.vaha - a.vaha)
    .slice(0, max)
    .map((x) => x.g);
}

async function nactiKontext(db: D1Database, teamId: string, gameDate: string): Promise<Kontext | null> {
  const groups = await db
    .prepare("SELECT * FROM fan_groups WHERE team_id = ? ORDER BY kind")
    .bind(teamId).all<FanGroupRow>()
    .catch((e) => { logger.warn({ module: M }, `party ${teamId}`, e); return null; });
  if (!groups || groups.results.length === 0) return null;

  const leaders = await db
    .prepare("SELECT * FROM fan_leaders WHERE team_id = ? AND status = 'active'")
    .bind(teamId).all<FanLeaderRow>()
    .catch((e) => { logger.warn({ module: M }, `vůdci ${teamId}`, e); return { results: [] as FanLeaderRow[] }; });

  return {
    teamId,
    groups: groups.results,
    leaders: new Map(leaders.results.map((l) => [l.id, l])),
    gameDate,
  };
}

// ── Jednotlivé zdroje ────────────────────────────────────────────────────────

/** Reakce na dění kolem klubu. Volá se ze stejného místa, co hýbe náladou. */
export async function prispevkyKUdalosti(
  db: D1Database,
  opts: { teamId: string; kind: ClubEventKind; eventId: string; co?: string; gameDate: string },
): Promise<number> {
  const sablony = PRISPEVKY_K_UDALOSTEM[opts.kind];
  if (!sablony || sablony.length === 0) return 0;

  const ctx = await nactiKontext(db, opts.teamId, opts.gameDate);
  if (!ctx) return 0;

  const prispevky: NovyPrispevek[] = [];
  for (const g of kdoSeOzve(ctx.groups, 2, opts.eventId)) {
    const p = slozPrispevek(ctx, g, {
      referenceId: `ev-${opts.eventId}`,
      sablony, topic: "club_event",
      data: { co: opts.co },
      zaVudce: g.kind === "kotel",
    });
    if (p) prispevky.push(p);
  }
  return zapisPrispevky(db, prispevky);
}

/** Reakce na výtržnost — píší i ti, kdo ji neudělali. */
export async function prispevkyKVytrznosti(
  db: D1Database,
  opts: {
    teamId: string; incidentId: string; kind: string;
    vinikGroupId: string | null; co?: string; gameDate: string;
  },
): Promise<number> {
  const sablony = PRISPEVKY_K_VYTRZNOSTEM[opts.kind];
  if (!sablony || sablony.length === 0) return 0;

  const ctx = await nactiKontext(db, opts.teamId, opts.gameDate);
  if (!ctx) return 0;

  const prispevky: NovyPrispevek[] = [];
  for (const g of kdoSeOzve(ctx.groups, 3, opts.incidentId)) {
    const p = slozPrispevek(ctx, g, {
      referenceId: `inc-${opts.incidentId}`,
      sablony, topic: "incident",
      data: { co: opts.co },
      zaVudce: g.id === opts.vinikGroupId,
    });
    if (p) prispevky.push(p);
  }
  return zapisPrispevky(db, prispevky);
}

/** Po zápase. Výsledek zná každý, jde o to, jak ho kdo vezme. */
export async function prispevkyKZapasu(
  db: D1Database,
  opts: {
    teamId: string; matchId: string; gf: number; ga: number;
    souper: string; gameDate: string;
  },
): Promise<number> {
  const rozdil = opts.gf - opts.ga;
  const typ = rozdil <= -3 ? "debakl" : rozdil < 0 ? "prohra" : rozdil === 0 ? "remiza" : "vyhra";
  const ctx = await nactiKontext(db, opts.teamId, opts.gameDate);
  if (!ctx) return 0;

  const vysledek = `${opts.gf}:${opts.ga} s ${opts.souper}`;
  const prispevky: NovyPrispevek[] = [];
  for (const g of kdoSeOzve(ctx.groups, 2, opts.matchId)) {
    const p = slozPrispevek(ctx, g, {
      referenceId: `zap-${opts.matchId}`,
      sablony: PRISPEVKY_K_ZAPASU[typ], topic: "zapas",
      data: { co: vysledek, souper: opts.souper },
    });
    if (p) prispevky.push(p);
  }
  return zapisPrispevky(db, prispevky);
}

/** Když parta někoho vezme za svého — nebo ho přestane trávit. */
export async function prispevkyKOblibencum(
  db: D1Database,
  teamId: string,
  zmeny: Array<{ groupId: string; stance: "oblibenec" | "otloukanek"; playerName: string; duvod: string }>,
  gameDate: string,
): Promise<number> {
  if (zmeny.length === 0) return 0;
  const ctx = await nactiKontext(db, teamId, gameDate);
  if (!ctx) return 0;

  const prispevky: NovyPrispevek[] = [];
  for (const z of zmeny) {
    const g = ctx.groups.find((x) => x.id === z.groupId);
    if (!g) continue;
    const p = slozPrispevek(ctx, g, {
      referenceId: `obl-${z.groupId}-${z.stance}-${z.playerName.replace(/\s+/g, "")}`,
      sablony: PRISPEVKY_K_OBLIBENCUM[z.stance], topic: "oblibenec",
      data: { kdo: z.playerName, co: z.duvod },
      zaVudce: z.stance === "oblibenec",
    });
    if (p) prispevky.push(p);
  }
  return zapisPrispevky(db, prispevky);
}

/** Když se rozhoří rivalita. Píše se na zeď obou klubů — týká se obou. */
export async function prispevkyKRivalite(
  db: D1Database,
  opts: { teamA: string; teamB: string; nazevA: string; nazevB: string; matchId: string; gameDate: string },
): Promise<number> {
  let celkem = 0;
  for (const [teamId, souper] of [[opts.teamA, opts.nazevB], [opts.teamB, opts.nazevA]] as const) {
    const ctx = await nactiKontext(db, teamId, opts.gameDate);
    if (!ctx) continue;
    const prispevky: NovyPrispevek[] = [];
    for (const g of kdoSeOzve(ctx.groups.filter((x) => x.kind === "kotel" || x.kind === "parta_z_okoli"), 1, opts.matchId)) {
      const p = slozPrispevek(ctx, g, {
        referenceId: `riv-${opts.matchId}-${teamId}`,
        sablony: PRISPEVKY_K_RIVALITE, topic: "rivalita",
        data: { souper },
        zaVudce: true,
      });
      if (p) prispevky.push(p);
    }
    celkem += await zapisPrispevky(db, prispevky);
  }
  return celkem;
}

/** Kampaň „X ven" — transparent musí být vidět, jinak to není kampaň. */
export async function prispevkyKeKampani(
  db: D1Database,
  kampan: KampanRow,
  faze: "zalozena" | "splnena",
  gameDate: string,
): Promise<number> {
  const ctx = await nactiKontext(db, kampan.team_id, gameDate);
  if (!ctx) return 0;

  const jePlneni = faze === "splnena";
  const texty = kampan.kind === "trener_ven"
    ? (jePlneni
      ? [`Hotovo. ${kampan.podpisy} podpisů pod „${kampan.target_name}, konči". Předáno na výbor. ✍️`]
      : [`Zakládám podpisovku: ${kampan.target_name} ven. Kdo je pro? ✍️`, `Už toho bylo dost. ${kampan.target_name} musí skončit.`])
    : (jePlneni
      ? [`${kampan.podpisy} lidí podepsalo, že ${kampan.target_name} nemá co dělat v sestavě. Trenére?`]
      : [`Podpisovka: ${kampan.target_name} ven ze sestavy. ${kampan.duvod}`, `Nechci být zlý, ale ${kampan.target_name} už ne. ${kampan.duvod}`]);

  const g = kdoSeOzve(ctx.groups, 1, kampan.id)[0];
  if (!g) return 0;

  const rng = createRng(seedFromString(`kmp|${kampan.id}|${faze}`));
  const leader = g.leader_id ? ctx.leaders.get(g.leader_id) : undefined;
  const a = autor(g, leader, kampan.id, true);

  return zapisPrispevky(db, [{
    referenceId: `kmp-${kampan.id}-${faze}`,
    teamId: kampan.team_id,
    authorName: a.name, authorHandle: `@${a.handle}`, authorKind: a.kind,
    authorAvatar: a.avatar, groupId: g.id,
    body: rng.pick(texty),
    tone: "negativni",
    likes: Math.max(kampan.podpisy, 1),
    topic: "club_event",
    gameDate,
  }]);
}

/**
 * Jak se hraje a kolik se dává.
 *
 * Nechodí to po každém zápase, ale až když je z toho trend: pět zápasů se
 * stejnou taktikou nebo pět zápasů bez gólů. Jinak by zeď zaplavily hlášky
 * k jedné prohře.
 */
export async function prispevkyKHre(
  db: D1Database,
  opts: {
    teamId: string; taktika: string | null; golyPoslednich5: number;
    zapasu: number; gameDate: string;
  },
): Promise<number> {
  if (opts.zapasu < 5) return 0;
  const ctx = await nactiKontext(db, opts.teamId, opts.gameDate);
  if (!ctx) return 0;

  const prispevky: NovyPrispevek[] = [];
  // Klíč na herní týden, ne na den: jinak by totéž viselo každé ráno znovu.
  const tyden = `${opts.gameDate.slice(0, 10)}`;

  const taktickeSablony = opts.taktika ? PRISPEVKY_K_TAKTICE[opts.taktika] : undefined;
  if (taktickeSablony) {
    for (const g of kdoSeOzve(ctx.groups, 1, `takt-${opts.teamId}-${tyden}`)) {
      const p = slozPrispevek(ctx, g, {
        referenceId: `takt-${opts.teamId}-${tyden}`,
        sablony: taktickeSablony, topic: "zapas",
        data: {},
      });
      if (p) prispevky.push(p);
    }
  }

  const strelba = opts.golyPoslednich5 === 0 ? "sucho"
    : opts.golyPoslednich5 <= 3 ? "bida"
      : opts.golyPoslednich5 >= 12 ? "smrst" : null;
  if (strelba) {
    for (const g of kdoSeOzve(ctx.groups, 1, `strel-${opts.teamId}-${tyden}`)) {
      const p = slozPrispevek(ctx, g, {
        referenceId: `strel-${opts.teamId}-${tyden}`,
        sablony: PRISPEVKY_KE_STRELBE[strelba], topic: "zapas",
        data: { co: String(opts.golyPoslednich5) },
      });
      if (p) prispevky.push(p);
    }
  }

  return zapisPrispevky(db, prispevky);
}

/** Nová plachta v kotli. Vyvěsit ji a nikomu to neříct by byla škoda. */
export async function prispevekKTransparentu(
  db: D1Database,
  teamId: string,
  plachta: { text: string; duvod: string },
  gameDate: string,
): Promise<number> {
  const ctx = await nactiKontext(db, teamId, gameDate);
  if (!ctx) return 0;
  const g = ctx.groups.find((x) => x.kind === "kotel") ?? ctx.groups[0];
  if (!g) return 0;

  const leader = g.leader_id ? ctx.leaders.get(g.leader_id) : undefined;
  const a = autor(g, leader, `banner-${teamId}`, true);
  return zapisPrispevky(db, [{
    referenceId: `banner-${teamId}-${gameDate.slice(0, 10)}`,
    teamId,
    authorName: a.name, authorHandle: `@${a.handle}`, authorKind: a.kind,
    authorAvatar: a.avatar, groupId: g.id,
    body: `Na plachtě v kotli od teď visí: „${plachta.text}"`,
    tone: "neutralni",
    likes: Math.max(1, Math.round(g.size * 0.15)),
    topic: "club_event",
    gameDate,
  }]);
}

/** Zeď klubu. */
export async function nactiZed(
  db: D1Database,
  teamId: string,
  limit = 40,
): Promise<Array<Record<string, unknown>>> {
  const rows = await db
    .prepare(
      `SELECT id, author_name, author_handle, author_kind, author_avatar, group_id,
              body, tone, likes, topic, game_date, created_at
       FROM fan_posts WHERE team_id = ? ORDER BY created_at DESC, id DESC LIMIT ?`,
    )
    .bind(teamId, Math.max(1, Math.min(100, limit)))
    .all<Record<string, unknown>>()
    .catch((e) => { logger.warn({ module: M }, `zeď ${teamId}`, e); return { results: [] as never[] }; });
  return rows.results;
}

/** Handle bez diakritiky — @pametnik, ne @pamětník. */
function odstranDiakritiku(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}
