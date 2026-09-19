/**
 * Incidenty v klubu: přehled pro manažera a ruční spuštění pro testování.
 * Spec docs/superpowers/specs/2026-09-16-incidenty-design.md, Část 7 a 11.
 */

import { Hono, type Context } from "hono";
import { tymyDivaka } from "../auth/divak";
import { requireAdmin, requireTeamOwnership } from "../auth/middleware";
import { cryptoSeed, createRng } from "../generators/rng";
import { obvinHrace, promluvSi, rozhodni, zavolejPolicii, zeptejSe, type VysledekAkce } from "../incidents/akce";
import { udalostiHospody, zapisHospody } from "../incidents/hospoda-db";
import { promluvil } from "../incidents/hrozi";
import { vyhodnotHrozici } from "../incidents/hrozi-db";
import { dopisDoHospody } from "../season/pub";
import { vystavHned } from "../incidents/bazar-db";
import { oznamIncident, zapisIncident } from "../incidents/dopady";
import { SLOUPCE_INCIDENTU, proAkce, type IncidentRadek } from "../incidents/incident-db";
import { KATALOG_PODLE_KIND } from "../incidents/katalog";
import { ozviSeObvineni } from "../incidents/krivda";
import { MAX_OBVINENI, SRAZKA_TYDNU, UTEK_MIN_ROZPOCET } from "../incidents/nastaveni";
import { nactiZtraty, popisZtraty } from "../incidents/popis";
import { SITUACE_PODLE_KIND } from "../incidents/situace";
import { rozhodniZalohu, ukonciSituace, zalozSituaci } from "../incidents/situace-db";
import { nactiStavKlubu } from "../incidents/stav-klubu";
import { nactiStopy } from "../incidents/stopy-db";
import { text } from "../incidents/texty";
import { castkaPokuty, castkaSrazky, hodnotaSkody } from "../incidents/tresty";
import type { NavrhIncidentu } from "../incidents/typy";
import { provedUtek } from "../incidents/utek-db";
import { zpracujVysetrovani } from "../incidents/vysetrovani-den";
import { AKCE_TRESTU, dostupneAkce, lzeVyslychat, nactiObvineni, stavVysetrovani } from "../incidents/vysetrovani";
import type { Bindings } from "../index";
import { logger } from "../lib/logger";

export const incidentsRouter = new Hono<{ Bindings: Bindings }>();
incidentsRouter.use("/admin/incidents/*", requireAdmin);
// Akce nad incidentem smí jen vlastník týmu. GET middleware pustí, detail si vlastnictví ověří sám.
incidentsRouter.use("/teams/:teamId/incidents/*", requireTeamOwnership);

const M = "incidents-api";

interface IncidentRow {
  id: string; kind: string; category: string; status: string; severity: number;
  game_date: string; deadline: string | null; culprit_player_id: string | null;
  culprit_staff_id: string | null;
  culprit_revealed: number; subject_player_id: string | null; ends_on: string | null;
  loss: string; text: string;
  resolution: string | null; resolved_on: string | null;
  jmeno: string | null; prijmeni: string | null;
  reporter_player_id: string | null;
  reporter_jmeno: string | null; reporter_prijmeni: string | null;
  subject_jmeno: string | null; subject_prijmeni: string | null;
  staff_jmeno: string | null; staff_prijmeni: string | null;
}

function verejnyIncident(r: IncidentRow) {
  // Životní situace mají vlastní katalog (dluhy, rozvod, ...), krádeže a poškození ten hlavní.
  const def = KATALOG_PODLE_KIND.get(r.kind) ?? SITUACE_PODLE_KIND.get(r.kind);
  const odhalenHrac = r.culprit_revealed === 1 && !!r.culprit_player_id;
  // Pachatel typu `zamestnanec` nemá `culprit_player_id` (není to hráč), proto se odhalení
  // pozná přes `culprit_staff_id`. Nikdy nejde o hráče, takže `playerId` v odpovědi je `null`
  // - FE z toho jméno nesmí udělat klikatelný odkaz na hráče (žádný neexistuje).
  const odhalenZamestnanec = r.culprit_revealed === 1 && !r.culprit_player_id && !!r.culprit_staff_id;
  // Kdo čin donesl trenérovi (spec 9a) - spoluhráč, který byl v hospodě u toho. Když čin
  // donesl hospodský, `reporter_player_id` je prázdné a řádek se neukazuje vůbec.
  const ohlasil = (r.status === "hrozi" || r.resolution === "nestalo_se") && r.reporter_player_id
    ? { playerId: r.reporter_player_id, jmeno: [r.reporter_jmeno, r.reporter_prijmeni].filter(Boolean).join(" ") || null }
    : null;
  // Koho se životní situace týká (spec 4c), nebo koho se týká pozitivní incident - hrdina,
  // nálezce, dárce (spec 4d). Ostatní pozitivní kindy nemají subjekt, subject_player_id je
  // u nich `null`.
  const dotceny = (r.category === "zivotni" || r.category === "pozitivni") && r.subject_player_id
    ? { playerId: r.subject_player_id, jmeno: [r.subject_jmeno, r.subject_prijmeni].filter(Boolean).join(" ") || null }
    : null;
  return {
    id: r.id, kind: r.kind, label: def?.label ?? r.kind, emoji: def?.emoji ?? "❗",
    category: r.category, status: r.status, severity: r.severity,
    gameDate: r.game_date, deadline: r.deadline, text: r.text,
    ztraty: nactiZtraty(r.loss).map(popisZtraty),
    // Neodhaleného pachatele API nevrací nikdy.
    pachatel: odhalenHrac
      ? { playerId: r.culprit_player_id as string, jmeno: [r.jmeno, r.prijmeni].filter(Boolean).join(" ") || null }
      : odhalenZamestnanec
        ? { playerId: null, jmeno: [r.staff_jmeno, r.staff_prijmeni].filter(Boolean).join(" ") || null }
        : null,
    ohlasil,
    dotceny,
    endsOn: r.ends_on ?? null,
    resolution: r.resolution, resolvedOn: r.resolved_on,
  };
}

// ── GET /api/teams/:teamId/incidents ─────────────────────────────────────────
incidentsRouter.get("/teams/:teamId/incidents", async (c) => {
  const teamId = c.req.param("teamId");
  if (!(await tymyDivaka(c)).has(teamId)) return c.json({ error: "Přístup odepřen" }, 403);

  const rows = await c.env.DB.prepare(
    `SELECT i.id, i.kind, i.category, i.status, i.severity, i.game_date, i.deadline,
            i.culprit_player_id, i.culprit_staff_id, i.culprit_revealed, i.reporter_player_id, i.subject_player_id, i.ends_on, i.loss, i.text, i.resolution, i.resolved_on,
            COALESCE(p.first_name, d.first_name) AS jmeno, COALESCE(p.last_name, d.last_name) AS prijmeni,
            rp.first_name AS reporter_jmeno, rp.last_name AS reporter_prijmeni,
            sp.first_name AS subject_jmeno, sp.last_name AS subject_prijmeni,
            st.first_name AS staff_jmeno, st.last_name AS staff_prijmeni
       FROM club_incidents i
       LEFT JOIN players p ON p.id = i.culprit_player_id
       LEFT JOIN departed_players d ON d.id = i.culprit_player_id
       LEFT JOIN players rp ON rp.id = i.reporter_player_id
       LEFT JOIN players sp ON sp.id = i.subject_player_id
       LEFT JOIN staff_members st ON st.id = i.culprit_staff_id
      WHERE i.team_id = ?
        AND COALESCE(i.resolution, '') != 'bez_skody'
        AND (i.status != 'uzavreny'
             OR (i.season_number = (SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1)
                 AND i.game_date >= date((SELECT game_date FROM teams WHERE id = ?), '-30 days')))
      ORDER BY i.game_date DESC
      LIMIT 50`,
  ).bind(teamId, teamId).all<IncidentRow>()
    .catch((e) => { logger.warn({ module: M }, `incidenty ${teamId}`, e); return null; });
  if (!rows) return c.json({ error: "Incidenty se nepodařilo načíst" }, 500);

  return c.json({ incidents: rows.results.map(verejnyIncident) });
});

type RadekDetailu = IncidentRadek & {
  culprit_staff_id: string | null;
  jmeno: string | null; prijmeni: string | null;
  reporter_jmeno: string | null; reporter_prijmeni: string | null;
  subject_jmeno: string | null; subject_prijmeni: string | null;
  staff_jmeno: string | null; staff_prijmeni: string | null;
};
type HracKadruRadek = { id: string; first_name: string; last_name: string; weekly_wage: number | null };

// ── GET /api/teams/:teamId/incidents/:id ─────────────────────────────────────
incidentsRouter.get("/teams/:teamId/incidents/:id", async (c) => {
  const teamId = c.req.param("teamId");
  const incidentId = c.req.param("id");
  if (!(await tymyDivaka(c)).has(teamId)) return c.json({ error: "Přístup odepřen" }, 403);
  const db = c.env.DB;

  const row = await db.prepare(
    `SELECT ${SLOUPCE_INCIDENTU.map((s) => `i.${s}`).join(", ")},
            i.culprit_staff_id,
            COALESCE(p.first_name, d.first_name) AS jmeno, COALESCE(p.last_name, d.last_name) AS prijmeni,
            rp.first_name AS reporter_jmeno, rp.last_name AS reporter_prijmeni,
            sp.first_name AS subject_jmeno, sp.last_name AS subject_prijmeni,
            st.first_name AS staff_jmeno, st.last_name AS staff_prijmeni
       FROM club_incidents i
       LEFT JOIN players p ON p.id = i.culprit_player_id
       LEFT JOIN departed_players d ON d.id = i.culprit_player_id
       LEFT JOIN players rp ON rp.id = i.reporter_player_id
       LEFT JOIN players sp ON sp.id = i.subject_player_id
       LEFT JOIN staff_members st ON st.id = i.culprit_staff_id
      WHERE i.id = ? AND i.team_id = ?`,
  ).bind(incidentId, teamId).first<RadekDetailu>()
    .catch((e) => { logger.warn({ module: M }, `detail incidentu ${incidentId}`, e); return null; });
  if (!row) return c.json({ error: "Incident nenalezen" }, 404);

  const stopy = await nactiStopy(db, incidentId);
  const kadr = await db.prepare(
    "SELECT id, first_name, last_name, weekly_wage FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active') ORDER BY last_name, first_name",
  ).bind(teamId).all<HracKadruRadek>()
    .catch((e) => { logger.warn({ module: M }, `kádr k incidentu ${incidentId}`, e); return { results: [] as HracKadruRadek[] }; });
  const jmena = new Map(kadr.results.map((h) => [h.id, `${h.first_name} ${h.last_name}`]));

  const odhalen = row.culprit_revealed === 1;
  const pachatelVKadru = odhalen && !!row.culprit_player_id && jmena.has(row.culprit_player_id);
  const akce = dostupneAkce(proAkce(row, pachatelVKadru));
  const zeptat = lzeVyslychat(proAkce(row, pachatelVKadru));
  const vysetrovani = stavVysetrovani(stopy, odhalen);

  // Hrozící čin (spec 9a): promluvit jde jen s hráčem, který je pořád v kádru.
  const hrozi = row.status === "hrozi" && !!row.culprit_player_id;
  const promluvit = hrozi && jmena.has(row.culprit_player_id as string);

  let castky: { srazka: number; pokuta: number; tydnu: number } | null = null;
  if (akce.tresty.length > 0) {
    const mzda = kadr.results.find((h) => h.id === row.culprit_player_id)?.weekly_wage ?? 0;
    const skoda = hodnotaSkody(nactiZtraty(row.loss));
    castky = { srazka: castkaSrazky(skoda, mzda), pokuta: castkaPokuty(skoda, mzda), tydnu: SRAZKA_TYDNU };
  }

  const zalohaStav = nactiZalohu(row.resolution_data);
  const situace = row.category === "zivotni"
    ? { kind: row.kind, endsOn: row.ends_on ?? null, zaloha: zalohaStav.zaloha, castka: zalohaStav.celkem }
    : null;

  return c.json({
    incident: verejnyIncident(row),
    vysetrovani: {
      stav: vysetrovani.stav,
      podezreli: vysetrovani.podezreli.map((playerId) => ({ playerId, jmeno: jmena.get(playerId) ?? null })),
    },
    // Jen nalezené stopy a bez držitelů: kdo co ví, zjistí manažer až vyšetřováním.
    stopy: stopy.filter((s) => s.nalezena).map((s) => ({ zdroj: s.zdroj, text: s.text, sila: s.sila })),
    obvineni: nactiObvineni(row.accused),
    policie: { vysledekOn: row.status === "policie" ? row.police_result_on : null, vysledek: row.police_success },
    hrozi: hrozi ? { promluvil: promluvil(row.resolution_data) } : null,
    situace,
    akce: { ...akce, zeptat, promluvit, zaloha: row.kind === "dluhy" && row.status === "probiha" && zalohaStav.zaloha === null },
    zbyvaObvineni: Math.max(0, MAX_OBVINENI - row.accusations),
    kadr: akce.obvinit || zeptat ? kadr.results.map((h) => ({ playerId: h.id, jmeno: `${h.first_name} ${h.last_name}` })) : [],
    castky,
  });
});

/** Stav zálohy z `resolution_data` situace `dluhy` (spec 7c). Neplatný JSON se bere jako „zatím nerozhodnuto". */
function nactiZalohu(resolutionData: string | null): { zaloha: "pujceno" | "odmitnuto" | null; celkem: number | null } {
  if (!resolutionData) return { zaloha: null, celkem: null };
  try {
    const d = JSON.parse(resolutionData) as { zaloha?: unknown; celkem?: unknown };
    const zaloha = d.zaloha === "pujceno" || d.zaloha === "odmitnuto" ? d.zaloha : null;
    return { zaloha, celkem: typeof d.celkem === "number" ? d.celkem : null };
  } catch (e) {
    logger.warn({ module: M }, "parse zálohy z resolution_data", e);
    return { zaloha: null, celkem: null };
  }
}

function odpovedAkce(c: Context<{ Bindings: Bindings }>, v: VysledekAkce) {
  return v.ok ? c.json(v) : c.json({ error: v.chyba }, v.kod);
}

async function teloPozadavku<T>(c: Context<{ Bindings: Bindings }>, co: string): Promise<T | null> {
  return c.req.json<T>().catch((e) => { logger.warn({ module: M }, `${co}: neplatné tělo`, e); return null; });
}

// ── POST /api/teams/:teamId/incidents/:id/obvinit ───────────────────────────
incidentsRouter.post("/teams/:teamId/incidents/:id/obvinit", async (c) => {
  const body = await teloPozadavku<{ playerId?: string }>(c, "obvinění");
  if (!body?.playerId) return c.json({ error: "Vyber hráče, kterého chceš obvinit" }, 400);
  return odpovedAkce(c, await obvinHrace(c.env, c.req.param("teamId"), c.req.param("id"), body.playerId));
});

// ── POST /api/teams/:teamId/incidents/:id/zeptat ────────────────────────────
// Otevře konverzaci s hráčem a nastaví téma rozhovoru (spec 7a).
incidentsRouter.post("/teams/:teamId/incidents/:id/zeptat", async (c) => {
  const body = await teloPozadavku<{ playerId?: string }>(c, "zeptat se");
  if (!body?.playerId) return c.json({ error: "Vyber hráče, kterého se chceš zeptat" }, 400);
  return odpovedAkce(c, await zeptejSe(c.env, c.req.param("teamId"), c.req.param("id"), body.playerId));
});

// ── POST /api/teams/:teamId/incidents/:id/promluvit ─────────────────────────────────
// Otevře konverzaci s hráčem, který v hospodě ohlásil čin (spec 9a).
incidentsRouter.post("/teams/:teamId/incidents/:id/promluvit", async (c) =>
  odpovedAkce(c, await promluvSi(c.env, c.req.param("teamId"), c.req.param("id"))));

// ── POST /api/teams/:teamId/incidents/:id/policie ───────────────────────────
incidentsRouter.post("/teams/:teamId/incidents/:id/policie", async (c) =>
  odpovedAkce(c, await zavolejPolicii(c.env, c.req.param("teamId"), c.req.param("id"))));

// ── POST /api/teams/:teamId/incidents/:id/rozhodnuti ────────────────────────
incidentsRouter.post("/teams/:teamId/incidents/:id/rozhodnuti", async (c) => {
  const body = await teloPozadavku<{ akce?: string; zapasu?: number | string }>(c, "rozhodnutí");
  const akce = AKCE_TRESTU.find((a) => a === body?.akce);
  if (!akce) return c.json({ error: "Neznámé rozhodnutí" }, 400);
  const zapasu = body?.zapasu === undefined || body.zapasu === "" ? undefined : Number(body.zapasu);
  return odpovedAkce(c, await rozhodni(c.env, c.req.param("teamId"), c.req.param("id"), akce, { zapasu }));
});

// ── POST /api/teams/:teamId/incidents/:id/zaloha ────────────────────────────
// Půjčit zálohu na mzdu, nebo odmítnout (spec 7c).
incidentsRouter.post("/teams/:teamId/incidents/:id/zaloha", async (c) => {
  const body = await teloPozadavku<{ akce?: string }>(c, "záloha");
  const akce = body?.akce === "pujcit" || body?.akce === "odmitnout" ? body.akce : null;
  if (!akce) return c.json({ error: "Neznámé rozhodnutí" }, 400);
  return odpovedAkce(c, await rozhodniZalohu(c.env, c.req.param("teamId"), c.req.param("id"), akce));
});

// ── POST /api/admin/incidents/force ──────────────────────────────────────────
// Jen pro ověření na testingu. Obchází šanci, cooldown, ochranu nového týmu
// a limit otevřených problémů. Podmínky (co klub má) neobchází nikdy.
incidentsRouter.post("/admin/incidents/force", async (c) => {
  const body = await c.req.json<{ teamId?: string; kind?: string; playerId?: string; castka?: number }>()
    .catch((e) => { logger.warn({ module: M }, "admin force: neplatné tělo", e); return null; });
  if (!body?.teamId || !body.kind) return c.json({ error: "Chybí teamId nebo kind" }, 400);

  const team = await c.env.DB.prepare("SELECT id, league_id, game_date FROM teams WHERE id = ?")
    .bind(body.teamId).first<{ id: string; league_id: string | null; game_date: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "admin force: tým", e); return null; });
  if (!team?.game_date) return c.json({ error: "Tým nenalezen nebo nemá herní datum" }, 404);

  const sezona = await c.env.DB.prepare("SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1")
    .first<{ number: number }>()
    .catch((e) => { logger.warn({ module: M }, "admin force: sezóna", e); return null; });
  if (!sezona) return c.json({ error: "Není aktivní sezóna" }, 500);

  // Životní situace mají vlastní katalog (spec 4c).
  const situace = SITUACE_PODLE_KIND.get(body.kind);
  if (situace) {
    const stav = await nactiStavKlubu(c.env.DB, team, team.game_date, sezona.number);
    if (!stav) return c.json({ error: "Stav klubu se nepodařilo načíst" }, 500);
    const hrac = body.playerId ? stav.kadr.find((h) => h.id === body.playerId) : stav.kadr.find((h) => situace.muze(h));
    if (!hrac) return c.json({ error: "Pro tuhle situaci se v kádru nikdo nehodí" }, 409);
    const rng = createRng(cryptoSeed());
    const navrh: NavrhIncidentu = {
      kind: situace.kind, category: "zivotni", status: "probiha", severity: 1,
      culpritType: "nikdo", culpritPlayerId: null, culpritRevealed: false,
      subjectPlayerId: hrac.id, dniTrvani: situace.trvani(rng), ztraty: [],
      text: text(rng, `situace_${situace.kind}` as never, { hrac: hrac.jmeno }),
    };
    const id = await zalozSituaci(c.env, stav, navrh, `inc-${team.id}-${situace.kind}-${stav.den}-admin-${Date.now()}`);
    return id ? c.json({ ok: true, id, incident: navrh }) : c.json({ error: "Situaci se nepodařilo založit" }, 409);
  }

  const def = KATALOG_PODLE_KIND.get(body.kind);
  if (!def) return c.json({ error: `Neznámý typ incidentu ${body.kind}` }, 400);

  const stav = await nactiStavKlubu(c.env.DB, team, team.game_date, sezona.number);
  if (!stav) return c.json({ error: "Stav klubu se nepodařilo načíst" }, 500);

  // Testovací obejití jen pro tři peněžní kindy: jejich `muze` vyžaduje včerejší tržbu
  // (kasa, tombola), nebo najatého ekonoma (zpronevěra) — na testovacím klubu obojí
  // často chybí. `castka` v těle requestu tenhle chybějící stav vyrobí jen pro los a
  // podmínku i výpočet škody (`vytvor`); do DB se pořád zapisuje skutečný `stav`
  // (níž `zapisIncident(c.env.DB, stav, ...)`), takže se tím nic reálného neobchází.
  // Horní mez je jen rozumná pojistka proti překlepu (nekonečno, NaN, omylem o pár nul
  // víc) — hodnota jde do `trzby.kasa`/`trzby.tombola`, ne přímo do žádné skutečné škody.
  const ADMIN_CASTKA_STROP_KC = 1_000_000;
  if (body.castka !== undefined
    && (typeof body.castka !== "number" || !Number.isFinite(body.castka) || body.castka <= 0 || body.castka > ADMIN_CASTKA_STROP_KC)) {
    return c.json({ error: `Částka musí být kladné číslo nejvýš ${ADMIN_CASTKA_STROP_KC.toLocaleString("cs-CZ")} Kč` }, 400);
  }
  let stavProLos = stav;
  if (body.castka !== undefined) {
    if (def.kind === "kasa_obcerstveni" || def.kind === "tombola") {
      stavProLos = {
        ...stav,
        vcera: {
          vyhra: stav.vcera?.vyhra ?? false, doma: stav.vcera?.doma ?? false,
          cervenaKarta: stav.vcera?.cervenaKarta ?? [], zapasId: stav.vcera?.zapasId ?? null,
          trzby: {
            kasa: def.kind === "kasa_obcerstveni" ? body.castka : (stav.vcera?.trzby.kasa ?? 0),
            tombola: def.kind === "tombola" ? body.castka : (stav.vcera?.trzby.tombola ?? 0),
          },
        },
      };
    } else if (def.kind === "zpronevera_ekonoma") {
      // Tady je `castka` jen přepínač („je vyplněná a kladná" → vyrob ekonoma), ne částka
      // zpronevěry: tu si `vytvor` losuje samo (ZPRONEVERA_MIN_KC až ZPRONEVERA_MAX_KC,
      // se stropem podílu rozpočtu), nezávisle na téhle hodnotě.
      stavProLos = { ...stav, ekonom: stav.ekonom ?? { id: "admin-test-ekonom", jmeno: "Testovací ekonom", judgement: 0 } };
    }
  }

  if (!def.muze(stavProLos)) return c.json({ error: "Klub podmínky pro tenhle incident nesplňuje", kind: def.kind }, 409);

  // Volitelně vynutit pachatele z kádru: je jediným kandidátem s nejhorší povahou.
  if (body.playerId) {
    const hrac = stavProLos.kadr.find((h) => h.id === body.playerId);
    if (!hrac) return c.json({ error: "Hráč není v kádru klubu" }, 400);
    stavProLos = { ...stavProLos, kadr: [{ ...hrac, alkohol: 100, disciplina: 0, vernost: 0, vztahKTrenerovi: 0 }] };
  }

  let navrh: NavrhIncidentu | null = null;
  for (let pokus = 0; pokus < 50 && !navrh; pokus++) {
    navrh = def.vytvor(stavProLos, createRng(cryptoSeed()));
    if (navrh && body.playerId && navrh.culpritPlayerId !== body.playerId) navrh = null;
  }
  if (!navrh) return c.json({ error: "Incident se nestal ani na 50 pokusů (odradil zámek, chybí kandidát, nebo tenhle typ nemá pachatele z kádru)" }, 409);

  // Omluvný dopis musí i tady dostat id odvozené z útěku, na který odpovídá. Jinak by se
  // dal vynutit opakovaně: pojistka v `nactiStavKlubu` hledá právě `dopis-{id útěku}` a s
  // administrátorským id by ten útěk dál viděla jako nevyřízený.
  const idIncidentu = navrh.kind === "omluvny_dopis" && stav.utekBezDopisu
    ? `dopis-${stav.utekBezDopisu.id}`
    : `inc-${team.id}-${navrh.kind}-${stav.den}-admin-${Date.now()}`;

  // Stopy se počítají se skutečným kádrem, ne s upraveným pro los.
  const zapsany = await zapisIncident(c.env.DB, stav, navrh, idIncidentu);
  if (!zapsany) return c.json({ error: "Škodu se nepodařilo provést", incident: navrh }, 409);

  await oznamIncident(c.env, team.id, navrh, zapsany);
  return c.json({ ok: true, id: zapsany.id, odhalen: zapsany.odhalen, nalezeneStopy: zapsany.nalezeneStopy, incident: navrh });
});

// ── POST /api/admin/incidents/utek ───────────────────────────────────────────
// Jen pro ověření na testingu: útěk s penězi (`zpracujUtek`, utek-db.ts) má vlastní los
// a tři povinné varovné signály (dluhy 7+ dní, žádost o zálohu, řeči v hospodě) — čekat
// na jejich souběh by ověření zbytečně natahovalo. Tahle route obojí obchází a útěk
// provede rovnou přes sdílené jádro `provedUtek`, takže pořadí zápisu (incident je zámek,
// hráč odchází z kádru až po něm) zůstává stejné jako u organického běhu. Skutečné
// podmínky klubu (roční limit `utekLetos`, minimální rozpočet) se neobcházejí.
incidentsRouter.post("/admin/incidents/utek", async (c) => {
  const body = await teloPozadavku<{ teamId?: string; playerId?: string }>(c, "admin útěk");
  if (!body?.teamId) return c.json({ error: "Chybí teamId" }, 400);

  const team = await c.env.DB.prepare("SELECT id, league_id, game_date FROM teams WHERE id = ?")
    .bind(body.teamId).first<{ id: string; league_id: string | null; game_date: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "admin útěk: tým", e); return null; });
  if (!team?.game_date) return c.json({ error: "Tým nenalezen nebo nemá herní datum" }, 404);

  const sezona = await c.env.DB.prepare("SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1")
    .first<{ number: number }>()
    .catch((e) => { logger.warn({ module: M }, "admin útěk: sezóna", e); return null; });
  if (!sezona) return c.json({ error: "Není aktivní sezóna" }, 500);

  const stav = await nactiStavKlubu(c.env.DB, team, team.game_date, sezona.number);
  if (!stav) return c.json({ error: "Stav klubu se nepodařilo načíst" }, 500);
  if (stav.utekLetos) return c.json({ error: "Klubu letos už jednou hráč s penězi utekl" }, 409);
  if (stav.rozpocet <= UTEK_MIN_ROZPOCET) return c.json({ error: "Klub nemá dost rozpočtu, aby se útěk vyplatil" }, 409);

  const kdo = body.playerId ? stav.kadr.find((h) => h.id === body.playerId) : stav.kadr[0];
  if (!kdo) return c.json({ error: body.playerId ? "Hráč není v kádru klubu" : "Klub nemá žádného hráče v kádru" }, body.playerId ? 400 : 409);

  const utekl = await provedUtek(c.env, stav, kdo, createRng(cryptoSeed()));
  return utekl
    ? c.json({ ok: true, playerId: kdo.id })
    : c.json({ error: "Útěk se zapsat nepodařilo (incident dnes už existuje?)" }, 409);
});

// ── POST /api/admin/incidents/situace ───────────────────────────────────────
// Jen pro ověření na testingu: `ukoncitTed` posune konec běžících situací na dnešek a ukončí je.
incidentsRouter.post("/admin/incidents/situace", async (c) => {
  const body = await teloPozadavku<{ teamId?: string; ukoncitTed?: boolean }>(c, "admin situace");
  if (!body?.teamId) return c.json({ error: "Chybí teamId" }, 400);
  const db = c.env.DB;
  const team = await db.prepare("SELECT id, game_date FROM teams WHERE id = ?").bind(body.teamId)
    .first<{ id: string; game_date: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "admin situace: tým", e); return null; });
  if (!team?.game_date) return c.json({ error: "Tým nenalezen nebo nemá herní datum" }, 404);
  if (body.ukoncitTed) {
    await db.prepare("UPDATE club_incidents SET ends_on = ? WHERE team_id = ? AND status = 'probiha'")
      .bind(team.game_date, team.id).run()
      .catch((e) => logger.warn({ module: M }, "admin situace: konec situací", e));
  }
  const ukonceno = await ukonciSituace(c.env, { teamId: team.id, gameDate: team.game_date });
  return c.json({ ok: true, ukonceno });
});

// ── POST /api/admin/incidents/vysetrovani ────────────────────────────────────
// Jen pro ověření na testingu: spustí denní vyšetřování klubu hned. `policieTed`
// posune výsledky probíhajících šetření na dnešek, `srazky` zaúčtuje srážky i mimo pondělí.
// `krivdy` otevře vlákna křivdy pro dnešní obvinění (jinak až další den). `bazarTed`
// vystaví kradené zboží otevřených prodejných krádeží hned, bez losu.
// `hroziTed` posune lhůtu hrozících činů na dnešek a vyhodnotí je.
incidentsRouter.post("/admin/incidents/vysetrovani", async (c) => {
  const body = await teloPozadavku<{ teamId?: string; policieTed?: boolean; srazky?: boolean; krivdy?: boolean; bazarTed?: boolean; hroziTed?: boolean }>(c, "admin vyšetřování");
  if (!body?.teamId) return c.json({ error: "Chybí teamId" }, 400);
  const db = c.env.DB;

  const team = await db.prepare("SELECT id, league_id, game_date FROM teams WHERE id = ?").bind(body.teamId)
    .first<{ id: string; league_id: string | null; game_date: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "admin vyšetřování: tým", e); return null; });
  if (!team?.game_date) return c.json({ error: "Tým nenalezen nebo nemá herní datum" }, 404);
  const sezona = await db.prepare("SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1")
    .first<{ number: number }>()
    .catch((e) => { logger.warn({ module: M }, "admin vyšetřování: sezóna", e); return null; });
  if (!sezona) return c.json({ error: "Není aktivní sezóna" }, 500);

  if (body.policieTed) {
    await db.prepare("UPDATE club_incidents SET police_result_on = ? WHERE team_id = ? AND status = 'policie'")
      .bind(team.game_date, team.id).run()
      .catch((e) => logger.warn({ module: M }, "admin vyšetřování: posun výsledku policie", e));
  }
  const t = { teamId: team.id, gameDate: team.game_date, seasonNumber: sezona.number };
  const vysledek = await zpracujVysetrovani(c.env, t, { pondeli: !!body.srazky });
  const krivdy = body.krivdy ? await ozviSeObvineni(c.env, t, { denObvineni: team.game_date.slice(0, 10) }) : 0;
  const bazar = body.bazarTed ? await vystavHned(c.env, t) : 0;

  let hrozici = 0;
  if (body.hroziTed) {
    // Lhůta hrozících činů na dnešek a hned vyhodnotit (spec 9a), jinak se čeká 1 až 3 dny.
    await db.prepare("UPDATE club_incidents SET deadline = ? WHERE team_id = ? AND status = 'hrozi'")
      .bind(team.game_date, team.id).run()
      .catch((e) => logger.warn({ module: M }, "admin vyšetřování: lhůta hrozících činů", e));
    const stav = await nactiStavKlubu(db, team, team.game_date, sezona.number);
    if (stav) hrozici = await vyhodnotHrozici(c.env, stav);
  }

  return c.json({ ok: true, ...vysledek, krivdy, bazar, hrozici });
});

// ── POST /api/admin/incidents/hospoda ────────────────────────────────────────
// Jen pro ověření na testingu (spec 9): posadí hráče klubu (`hraci`) a hosty z jiných klubů
// (`hoste`) do dnešní hospody a vyhodnotí příhody o incidentech. `jiste` = každý los vyjde,
// `ohlasi` = tenhle hráč ohlásí čin bez ohledu na alkohol a povahu, `trener` = trenér poslouchá.
// Podmínky (kdo co ví, co klub má) neobchází.
incidentsRouter.post("/admin/incidents/hospoda", async (c) => {
  const body = await teloPozadavku<{
    teamId?: string; hraci?: unknown; hoste?: unknown; jiste?: boolean; ohlasi?: string; trener?: boolean;
  }>(c, "admin hospoda");
  const seznam = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const hraci = seznam(body?.hraci);
  if (!body?.teamId || hraci.length === 0) return c.json({ error: "Chybí teamId nebo hraci" }, 400);
  const db = c.env.DB;

  const team = await db.prepare("SELECT id, league_id, game_date FROM teams WHERE id = ?").bind(body.teamId)
    .first<{ id: string; league_id: string | null; game_date: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "admin hospoda: tým", e); return null; });
  if (!team?.game_date) return c.json({ error: "Tým nenalezen nebo nemá herní datum" }, 404);

  const ids = [...new Set([...hraci, ...seznam(body.hoste)])].slice(0, 40);
  const rows = await db.prepare(
    `SELECT p.id, p.team_id, p.first_name, p.last_name, json_extract(p.personality, '$.alcohol') AS alcohol, t.name AS team_name
       FROM players p JOIN teams t ON t.id = p.team_id
      WHERE p.id IN (${ids.map(() => "?").join(", ")}) AND (p.status IS NULL OR p.status = 'active')`,
  ).bind(...ids).all<{ id: string; team_id: string; first_name: string; last_name: string; alcohol: number | null; team_name: string }>()
    .catch((e) => { logger.warn({ module: M }, "admin hospoda: hráči", e); return null; });
  if (!rows) return c.json({ error: "Hráče se nepodařilo načíst" }, 500);

  const attendees = rows.results.map((r) => ({
    playerId: r.id, firstName: r.first_name, lastName: r.last_name, alcohol: r.alcohol ?? 30, teamId: r.team_id,
    isVisitor: r.team_id !== team.id, fromTeamName: r.team_id !== team.id ? r.team_name : undefined,
  }));
  // Klíč hospodské session je den bez času, stejně jako v denním ticku.
  const t = { teamId: team.id, leagueId: team.league_id, gameDate: team.game_date.slice(0, 10) };
  const r = await udalostiHospody(db, t, attendees, { trener: !!body.trener, jiste: !!body.jiste, ohlasi: body.ohlasi });
  await dopisDoHospody(db, team.id, t.gameDate, attendees, r.pribehy);
  if (r.seasonNumber !== null) await zapisHospody(db, { ...t, seasonNumber: r.seasonNumber }, r.zapisy);

  return c.json({
    ok: true,
    pribehy: r.pribehy.map((p) => ({ type: p.type, text: p.text, incidentId: p.incidentId })),
    zapisy: r.zapisy.map((z) => z.typ),
  });
});
