/**
 * Redakce okresního zpravodaje — kdo píše články a jak.
 *
 * Každý okres má svou partu čtyř redaktorů. Styl není jen štítek: každý má
 * povahové osy (bulvárnost, zlomyslnost, odbornost), které se překlápějí do
 * pokynů pro AI, takže bulvár píše o knírech a sázkách, zatímco seriózní
 * rozebírá rozestavení. Rubriky jsou rozdělené podle toho, komu sedí.
 *
 * Vzor generování jména a tváře: `apps/api/src/staff/staff-generator.ts`.
 */

import { logger } from "../lib/logger";
import { createRng, type Rng } from "../generators/rng";
import { getDistrictDataFromDB } from "../data/districts";
import { feminizeSurname } from "../staff/staff-generator";

export type JournalistStyle = "bulvar" | "seriozni" | "vycurany" | "patriot";

export interface Journalist {
  id: string;
  league_id: string;
  first_name: string;
  last_name: string;
  nickname: string | null;
  gender: "m" | "f";
  age: number;
  avatar: string;
  style: JournalistStyle;
  bulvarnost: number;
  zlomyslnost: number;
  odbornost: number;
  bio: string;
  hlaska: string;
}

/** Celé jméno i s přezdívkou, jak se podepisuje pod článek. */
export function jmenoRedaktora(j: Pick<Journalist, "first_name" | "last_name" | "nickname">): string {
  return j.nickname ? `${j.first_name} „${j.nickname}" ${j.last_name}` : `${j.first_name} ${j.last_name}`;
}

interface StyleDef {
  label: string;
  bulvarnost: [number, number];
  zlomyslnost: [number, number];
  odbornost: [number, number];
  prezdivky: string[];
  prezdivkyF: string[];
  bio: string[];
  hlasky: string[];
  /** Rubriky, které tenhle typ obvykle dostane. */
  rubriky: string[];
}

const STYLY: Record<JournalistStyle, StyleDef> = {
  bulvar: {
    label: "bulvární",
    bulvarnost: [80, 95],
    zlomyslnost: [60, 85],
    odbornost: [15, 35],
    prezdivky: ["Drb", "Slídil", "Šťoural", "Blesk", "Chobot"],
    prezdivkyF: ["Drbna", "Slídilka", "Šťouralka", "Bleskovka", "Chobotnice"],
    // Bio je schválně v přítomném čase — čeština v minulém rodí a redaktorem
    // může být stejně tak žena; jedna sada textů tak sedí na obě pohlaví.
    bio: [
      "Do redakce míří rovnou z okresního plátku, kde vede rubriku o rozvodech zastupitelů.",
      "Tvrdí, že nejlepší zprávy se rodí v hospodě po zápase, ne na tiskovce.",
      "Fotoaparát nosí i na pohřby. Prý nikdy nevíš.",
    ],
    hlasky: ["A teď to hlavní!", "Zdroje blízké kabině tvrdí…", "Co na to říkáte vy?"],
    rubriky: ["player_interview", "transfer"],
  },
  seriozni: {
    label: "seriózní",
    bulvarnost: [5, 20],
    zlomyslnost: [5, 20],
    odbornost: [80, 95],
    prezdivky: ["Doktor", "Profesor", "Taktik"],
    prezdivkyF: ["Doktorka", "Profesorka", "Taktička"],
    bio: [
      "Třicet let si vede sešit s rozestavením každého zápasu v okrese.",
      "Od dorostenecké lavičky k zápisníku — a se zápisníkem už napořád.",
      "Tvrzení bez opory v datech se do článku nedostane.",
    ],
    hlasky: ["Podívejme se na to střízlivě.", "Čísla mluví jasně.", "Bez emocí, prosím."],
    rubriky: ["ai_report", "round_summary", "matchday_preview"],
  },
  vycurany: {
    label: "vyčůraný",
    bulvarnost: [45, 70],
    zlomyslnost: [70, 90],
    odbornost: [45, 70],
    prezdivky: ["Liška", "Kliďas", "Pavouk", "Šibal"],
    prezdivkyF: ["Liška", "Kliďaska", "Šibalka", "Sova"],
    bio: [
      "Ptá se přátelsky a mile. Odpověď pak otočí tak, že se divíte, co jste to řekli.",
      "Nikdy nezvýší hlas. Nemusí — otázku si připraví tak, že vás dostane sama.",
      "V redakci se říká, že nejlepší citáty vyrobí z toho, co jste zamlčeli.",
    ],
    hlasky: ["Jen abych rozuměl…", "To jste myslel vážně?", "A to říkáte po té prohře?"],
    rubriky: ["interview", "manager_feud"],
  },
  patriot: {
    label: "patriot",
    bulvarnost: [35, 55],
    zlomyslnost: [10, 30],
    odbornost: [30, 50],
    prezdivky: ["Kotel", "Bubeník", "Fanda", "Srdcař"],
    prezdivkyF: ["Bubenice", "Fanynka", "Srdcařka", "Vlajka"],
    bio: [
      "Na zápasy chodí od šesti let a fandí okresu jako celku, ne jednomu klubu.",
      "Zná jménem každého člena kotle a půlku hospodských v okrese.",
      "Píše srdcem. V redakci je to terč vtipů, u čtenářů trhák.",
    ],
    hlasky: ["To byla atmosféra!", "Klobouk dolů, lidi.", "Tohle je náš fotbal!"],
    rubriky: ["ultras_report", "season_opener", "season_wrap"],
  },
};

const JMENA_M = [
  "Jaromír", "Bohumil", "Květoslav", "Radomír", "Vlastimil", "Ctirad", "Přemysl",
  "Svatopluk", "Břetislav", "Slavomír", "Otakar", "Bedřich", "Vojtěch", "Řehoř",
];
const JMENA_F = [
  "Květoslava", "Blažena", "Vlasta", "Jarmila", "Dobromila", "Miloslava",
  "Bohumila", "Ludmila", "Zdislava", "Radmila",
];

/** Tvář redaktora. Stejné schéma jako u personálu, jen o něco starší ročníky. */
function tvar(rng: Rng, isFemale: boolean): Record<string, unknown> {
  const r01 = () => rng.int(0, 1000) / 1000;
  const pick = <T,>(arr: T[]): T => rng.pick(arr);
  const skinColors = ["#f2d6cb", "#ddb7a0", "#eeceb3", "#e0b48f"];
  const hairColors = ["#aaa", "#5e3b1f", "#3d2314", "#8a6a45", "#d8d8d8"];

  const headIds = isFemale
    ? ["head9", "head11", "head13", "head14", "head15"]
    : ["head1", "head2", "head3", "head5", "head8", "head16"];
  const eyeIds = isFemale
    ? ["female1", "female2", "female5", "female8"]
    : ["eye1", "eye3", "eye6", "eye9"];
  const eyebrowIds = isFemale
    ? ["female1", "female3", "female5", "female8"]
    : ["eyebrow2", "eyebrow3", "eyebrow10", "eyebrow14"];
  const femaleHair = ["female1", "female3", "female6", "female10", "longHair", "curly"];
  const maleHair = ["short-fade", "crop-fade2", "short-bald", "short3"];

  const skinColor = pick(skinColors);
  const plesatost = !isFemale && r01() < 0.45;

  return {
    fatness: isFemale ? 0.3 + r01() * 0.3 : 0.4 + r01() * 0.4,
    teamColors: ["#555555", "#FFFFFF", "#333333"],
    hairBg: { id: "none" },
    body: { id: isFemale ? pick(["body2", "body4"]) : pick(["body", "body2", "body3"]), color: skinColor, size: (isFemale ? 0.85 : 0.95) + r01() * 0.1 },
    jersey: { id: "jersey" },
    ear: { id: pick(["ear1", "ear2", "ear3"]), size: 0.6 + r01() * 0.4 },
    head: { id: pick(headIds), shave: "rgba(0,0,0,0)", fatness: 0.35 + r01() * 0.35 },
    eyeLine: { id: "none" },
    smileLine: { id: pick(["line1", "line2"]), size: 0.9 + r01() * 0.3 },
    miscLine: { id: "none" },
    facialHair: { id: !isFemale && r01() < 0.5 ? pick(["goatee3", "fullgoatee2", "mustache"]) : "none" },
    eye: { id: pick(eyeIds), angle: -3 + r01() * 6 },
    eyebrow: { id: pick(eyebrowIds), angle: -3 + r01() * 6 },
    hair: { id: isFemale ? pick(femaleHair) : (plesatost ? "short-bald" : pick(maleHair)), color: pick(hairColors), flip: r01() < 0.5 },
    mouth: { id: pick(["mouth", "mouth3", "mouth5"]), flip: r01() < 0.5 },
    nose: { id: pick(["nose2", "nose3", "nose6"]), flip: r01() < 0.5, size: 0.8 + r01() * 0.4 },
    // Novinář s brýlemi je klišé, které tu chceme — ale ne u všech.
    glasses: { id: r01() < 0.45 ? "glasses1" : "none" },
    accessories: { id: "none" },
  };
}

/**
 * Zajistí, že liga má svou redakci. Volá se líně — první článek, který chce
 * podpis, redakci založí. Opakované volání nic nepřidá.
 */
export async function ensureRedakce(db: D1Database, leagueId: string): Promise<Journalist[]> {
  const existujici = await db.prepare("SELECT * FROM journalists WHERE league_id = ?")
    .bind(leagueId).all<Journalist>()
    .catch((e) => { logger.warn({ module: "journalists" }, "load redakce", e); return { results: [] as Journalist[] }; });
  if (existujici.results.length > 0) return existujici.results;

  const liga = await db.prepare("SELECT district FROM leagues WHERE id = ?")
    .bind(leagueId).first<{ district: string }>()
    .catch((e) => { logger.warn({ module: "journalists" }, "load league", e); return null; });
  if (!liga) return [];

  const okres = await getDistrictDataFromDB(db, liga.district)
    .catch((e) => { logger.warn({ module: "journalists" }, "load district", e); return null; });
  const prijmeni = okres?.surnames ?? {};

  // Seed z ID ligy — redakce je pro daný okres stabilní, ne pokaždé jiná.
  let seed = 0;
  for (let i = 0; i < leagueId.length; i++) seed = ((seed << 5) - seed + leagueId.charCodeAt(i)) | 0;
  const rng = createRng(Math.abs(seed) + 7717);

  const styly: JournalistStyle[] = ["bulvar", "seriozni", "vycurany", "patriot"];
  const vytvoreni: Journalist[] = [];

  for (const style of styly) {
    const def = STYLY[style];
    // Ženy v okresní redakci ať nejsou raritou, ale ani většinou.
    const isFemale = rng.int(0, 100) < 30;
    const krestni = isFemale ? rng.pick(JMENA_F) : rng.pick(JMENA_M);
    const zaklad = Object.keys(prijmeni).length > 0 ? rng.weighted(prijmeni) : "Novák";
    const prijmeniFinal = isFemale ? feminizeSurname(zaklad) : zaklad;

    const j: Journalist = {
      id: crypto.randomUUID(),
      league_id: leagueId,
      first_name: krestni,
      last_name: prijmeniFinal,
      nickname: rng.int(0, 100) < 70 ? rng.pick(isFemale ? def.prezdivkyF : def.prezdivky) : null,
      gender: isFemale ? "f" : "m",
      age: rng.int(28, 64),
      avatar: JSON.stringify(tvar(rng, isFemale)),
      style,
      bulvarnost: rng.int(def.bulvarnost[0], def.bulvarnost[1]),
      zlomyslnost: rng.int(def.zlomyslnost[0], def.zlomyslnost[1]),
      odbornost: rng.int(def.odbornost[0], def.odbornost[1]),
      bio: rng.pick(def.bio),
      hlaska: rng.pick(def.hlasky),
    };

    await db.prepare(
      `INSERT INTO journalists (id, league_id, first_name, last_name, nickname, gender, age, avatar,
         style, bulvarnost, zlomyslnost, odbornost, bio, hlaska)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      j.id, j.league_id, j.first_name, j.last_name, j.nickname, j.gender, j.age, j.avatar,
      j.style, j.bulvarnost, j.zlomyslnost, j.odbornost, j.bio, j.hlaska,
    ).run().catch((e) => logger.warn({ module: "journalists" }, "insert redaktor", e));

    vytvoreni.push(j);
  }

  logger.info({ module: "journalists" }, `redakce založena pro ligu ${leagueId}: ${vytvoreni.length} redaktorů`);
  return vytvoreni;
}

/**
 * Redaktor pro daný typ článku. Rubriky jsou rozdělené podle stylu; když na typ
 * nikdo nesedí, rozhodne seed odvozený od článku, ať se podpisy střídají,
 * ale pro tentýž článek zůstanou stejné.
 */
export async function redaktorProRubriku(
  db: D1Database,
  leagueId: string,
  typ: string,
  seedText = "",
): Promise<Journalist | null> {
  const redakce = await ensureRedakce(db, leagueId);
  if (redakce.length === 0) return null;

  const sedici = redakce.filter((r) => STYLY[r.style].rubriky.includes(typ));
  const vyber = sedici.length > 0 ? sedici : redakce;

  let seed = 0;
  for (let i = 0; i < seedText.length; i++) seed = ((seed << 5) - seed + seedText.charCodeAt(i)) | 0;
  return vyber[Math.abs(seed) % vyber.length];
}

/** Jak se redaktor dívá na konkrétní klub. 0 = nemá důvod ho řešit. */
export async function sentimentKeKlubu(db: D1Database, journalistId: string, teamId: string): Promise<number> {
  const row = await db.prepare(
    "SELECT sentiment FROM journalist_relations WHERE journalist_id = ? AND team_id = ?"
  ).bind(journalistId, teamId).first<{ sentiment: number }>()
    .catch((e) => { logger.warn({ module: "journalists" }, "load sentiment", e); return null; });
  return row?.sentiment ?? 0;
}

/**
 * Pokyny pro AI: kdo článek píše a jak. Vrací blok do systémového promptu.
 * `sentiment` je vztah ke klubu, o kterém se zrovna píše (volitelný).
 */
export function pokynyProRedaktora(j: Journalist, sentiment = 0): string {
  const radky: string[] = [
    `Článek píše ${jmenoRedaktora(j)}, ${STYLY[j.style].label} redaktor okresního zpravodaje (${j.age} let).`,
    j.bio,
  ];

  if (j.bulvarnost >= 70) {
    radky.push("PIŠ BULVÁRNĚ: palcové titulky, vykřičníky, drby z kabiny a hospody, historky o hráčích mimo hřiště. Taktika tě nezajímá.");
  } else if (j.bulvarnost <= 25) {
    radky.push("PIŠ STŘÍZLIVĚ: rozestavení, čísla, formu, žádné vykřičníky ani senzace. Každé tvrzení opři o fakt ze zadání.");
  }

  if (j.zlomyslnost >= 70) {
    radky.push("Rád rýpeš. Kde je slabina, tam se opřeš — ale nikdy nelžeš, jen se ptáš nahlas.");
  } else if (j.zlomyslnost <= 25) {
    radky.push("Nerýpeš. I kritiku podáváš laskavě.");
  }

  if (j.odbornost >= 75) radky.push("Rozumíš fotbalu do hloubky, používej odbornou terminologii přesně.");
  if (j.style === "patriot") radky.push("Fandíš okresnímu fotbalu jako celku — atmosféra, kotel a lidi kolem tě zajímají víc než tabulka.");
  if (j.style === "vycurany") radky.push("Působíš přátelsky, ale otázky i formulace mají druhé dno.");

  radky.push(vztahKeKlubuText(sentiment));

  radky.push(`Tvoje oblíbená hláška: „${j.hlaska}" — použij ji nanejvýš jednou a jen když sedne.`);
  radky.push("Článek NEPODEPISUJ — podpis doplní sazba.");
  // Pokyny jsou psané po větách, ne po bodech: když dostal model odrážkový
  // blok, začal odrážkami odpovídat a místo článku vyplivl číslovaný seznam.
  radky.push("Piš souvislý text v odstavcích. Nikdy nečísluj věty ani odstavce a nepoužívej odrážky či nadpisy.");
  return radky.join(" ");
}

/**
 * Jak se vztah ke klubu propisuje do práce redaktora — do otázek i do článku.
 *
 * Odstupňované schválně jemně: dřív se pod ±40 nedělo vůbec nic, takže hráč
 * viděl pořád stejné neutrální otázky, i když si redaktora už znepřátelil.
 */
export function vztahKeKlubuText(sentiment: number): string {
  if (sentiment >= 70) {
    return "Tenhle klub je tvůj oblíbenec. V otázkách trenérovi nahráváš, dáváš mu prostor se pochlubit, nepříjemná témata obcházíš a v článku chyby omlouváš.";
  }
  if (sentiment >= 30) {
    return "K tomuhle klubu máš slabost. Otázky jsou vstřícné — spíš příležitost se předvést než past — a v článku píšeš s pochopením.";
  }
  if (sentiment <= -70) {
    return "Tenhle klub nesnášíš a je to znát. Otázky jsou ostré až provokativní: připomínáš prohry a trapné momenty, rýpeš do slabin, hledáš, kde se trenér chytne. V článku mu nic neodpustíš. Fakta si ale nevymýšlíš.";
  }
  if (sentiment <= -30) {
    return "S tímhle klubem máš spory. Otázky jsou nepříjemné — jdeš po slabinách a připomínáš, co se nepovedlo. V článku jsi kritický. Fakta si ale nevymýšlíš.";
  }
  return "K tomuhle klubu nemáš zvláštní vztah — ptáš se věcně.";
}

/** Slovní popis vztahu pro UI i pro log. */
export function popisVztahu(sentiment: number): string {
  if (sentiment >= 60) return "drží palce";
  if (sentiment >= 25) return "nakloněn";
  if (sentiment > -25) return "neutrální";
  if (sentiment > -60) return "kritický";
  return "jde po nich";
}

/**
 * Posune vztah redaktora ke klubu a vrátí novou hodnotu.
 *
 * Vztah se hýbe hlavně po rozhovorech — jak trenér odpoví, tak si ho redaktor
 * zařadí. Hodnota se drží v rozsahu -100..100.
 */
export async function posunSentiment(
  db: D1Database,
  journalistId: string,
  teamId: string,
  posun: number,
  duvod: string,
): Promise<number> {
  const stary = await sentimentKeKlubu(db, journalistId, teamId);
  const novy = Math.max(-100, Math.min(100, stary + Math.round(posun)));

  await db.prepare(
    `INSERT INTO journalist_relations (id, journalist_id, team_id, sentiment, duvod, updated_at)
     VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))
     ON CONFLICT(journalist_id, team_id) DO UPDATE
       SET sentiment = excluded.sentiment, duvod = excluded.duvod, updated_at = excluded.updated_at`
  ).bind(crypto.randomUUID(), journalistId, teamId, novy, duvod.slice(0, 160)).run()
    .catch((e) => logger.warn({ module: "journalists" }, "posun sentimentu", e));

  logger.info({ module: "journalists" }, `sentiment ${journalistId}→${teamId}: ${stary} → ${novy} (${duvod.slice(0, 60)})`);
  return novy;
}

export interface DopadTisku {
  reputace: number;
  fanousci: number;
  popis: string;
}

/**
 * Co pro klub znamená, jak o něm redakce píše.
 *
 * Vztah sám o sobě je jen číslo — teprve tady se překlápí do hry: nakloněný
 * redaktor klubu dělá dobré jméno a přivádí lidi na stadion, nepřátelský ho
 * sráží. Drží se to schválně nízko (±1 reputace, jednotky diváků), protože
 * článek vychází po každém kole a nemá přebít výsledky na hřišti.
 *
 * `referenceId` je klíč idempotence — opakované zpracování téhož článku
 * reputaci nepřipíše podruhé.
 */
export async function dopadTisku(
  db: D1Database,
  teamId: string,
  sentiment: number,
  referenceId: string,
): Promise<DopadTisku | null> {
  if (Math.abs(sentiment) < 40) return null;

  const kladny = sentiment > 0;
  const reputaceDelta = kladny ? 1 : -1;
  const fanousciDelta = kladny ? 3 : -3;

  const { applyReputationDelta } = await import("../lib/reputation");
  const popis = kladny
    ? "Příznivé články v okresním zpravodaji"
    : "Kritika v okresním zpravodaji";

  const zmena = await applyReputationDelta(db, teamId, reputaceDelta, "press", popis, { referenceId })
    .catch((e) => { logger.warn({ module: "journalists" }, "dopad na reputaci", e); return null; });

  // Duplicitní zpracování pozná reputační log; fanoušky pak taky nesaháme.
  if (!zmena || zmena.skipped === "duplicate") return null;

  await db.prepare(
    `UPDATE team_fanbase SET casual_count = MAX(0, casual_count + ?), updated_at = datetime('now')
     WHERE team_id = ?`
  ).bind(fanousciDelta, teamId).run()
    .catch((e) => logger.warn({ module: "journalists" }, "dopad na fanoušky", e));

  return {
    reputace: zmena.applied,
    fanousci: fanousciDelta,
    popis: kladny
      ? "Redakce o klubu píše hezky — reputace i zájem lidí rostou."
      : "Redakce klub nešetří — reputace i zájem lidí klesají.",
  };
}
