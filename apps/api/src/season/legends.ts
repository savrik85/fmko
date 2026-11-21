/**
 * Druhý život legend (F5): hráč, který na konci sezóny odešel ze souboje „kdo zůstane“
 * (season-duels.ts) a byl v klubu legendou, se stane postavou v okrese: sudím, vůdcem kotle,
 * hospodským nebo trenérem žáků. Píše pak bývalému trenérovi přes Telefon (předpona `ex-`).
 *
 * Tady jsou čisté funkce: kdo je legenda, pravidlo pro roli (když model mlčí), prompty
 * a kontrola textů od modelu, připravené texty. Databáze je v legends-db.ts.
 */
import { parseModelJson } from "../ai-coach/llm";
import { cleanDashes } from "../lib/dashes";
import { logger } from "../lib/logger";

export const LEGEND_PARTICIPANT_PREFIX = "ex-";
export const LEGEND_MIN_AGE = 30;
export const LEGEND_MIN_SEASONS = 2;

export const LEGEND_ROLES = ["referee", "fan_leader", "pub_owner", "youth_coach"] as const;
export type LegendRole = (typeof LEGEND_ROLES)[number];

export function isLegendRole(v: unknown): v is LegendRole {
  return typeof v === "string" && (LEGEND_ROLES as readonly string[]).includes(v);
}

/** Povaha hráče (players.personality), osy 0–100. Chybějící osa = průměr. */
export interface LegendTraits {
  discipline: number;
  patriotism: number;
  alcohol: number;
  temper: number;
  leadership: number;
  workRate: number;
  aggression: number;
}

const TRAIT_KEYS: Array<keyof LegendTraits> = ["discipline", "patriotism", "alcohol", "temper", "leadership", "workRate", "aggression"];

export function legendParticipantId(departedPlayerId: string): string {
  return `${LEGEND_PARTICIPANT_PREFIX}${departedPlayerId}`;
}

export function isLegend(p: { age: number; seasonsInClub: number }): boolean {
  return p.age >= LEGEND_MIN_AGE || p.seasonsInClub >= LEGEND_MIN_SEASONS;
}

/**
 * Kolik sezón hráč v klubu odehrál: od sezóny, ve které mu začala smlouva s klubem
 * (player_contracts → seasons.number), do právě skončené sezóny včetně. Bez smlouvy 0.
 */
export function seasonsInClub(finishedSeason: number, joinedSeason: number | null): number {
  if (joinedSeason == null || !Number.isFinite(joinedSeason)) return 0;
  return Math.max(0, finishedSeason - joinedSeason + 1);
}

/** Kdo z odcházejících je v klubu větší legenda: věrnost víc než věk, výkonnost jen dorovná. */
export function legendRank(c: { seasonsInClub: number; age: number; overallRating: number }): number {
  return c.seasonsInClub * 10 + c.age + c.overallRating / 10;
}

export function parseTraits(raw: unknown): LegendTraits {
  let obj: Record<string, unknown> = {};
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) obj = parsed as Record<string, unknown>;
    } catch (e) {
      // Nečitelná povaha = průměrný člověk, volající to nemá jak opravit.
      logger.warn({ module: "legends" }, "nečitelná povaha legendy, beru průměr", e);
      obj = {};
    }
  } else if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    obj = raw as Record<string, unknown>;
  }
  const out = {} as LegendTraits;
  for (const k of TRAIT_KEYS) {
    const v = obj[k];
    out[k] = typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 50;
  }
  return out;
}

/** Povaha slovy (do promptu i textů). Čísla nikdy. */
export function traitWords(t: LegendTraits): string {
  const words: string[] = [];
  if (t.discipline >= 70) words.push("disciplinovaný");
  else if (t.discipline <= 30) words.push("nespolehlivý a bere to s nadhledem");
  if (t.patriotism >= 70) words.push("patriot, klub má v srdci");
  else if (t.patriotism <= 30) words.push("ke klubu nijak zvlášť nepřilnul");
  if (t.temper >= 70) words.push("horká hlava");
  else if (t.temper <= 30) words.push("klidný");
  if (t.alcohol >= 70) words.push("rád si dá pivo, spíš víc");
  else if (t.alcohol <= 20) words.push("skoro nepije");
  if (t.leadership >= 70) words.push("přirozený vůdce");
  if (t.workRate >= 70) words.push("dříč");
  if (t.aggression >= 75) words.push("tvrdý chlap");
  return words.length > 0 ? words.join(", ") : "obyčejný kluk do party";
}

/**
 * Pravidlo, když model nejede nebo odpověděl mimo nabídku: role podle povahy a věku.
 * Bere jen volné role; bez nich null.
 */
export function fallbackLegendRole(age: number, t: LegendTraits, available: readonly LegendRole[]): LegendRole | null {
  const score: Record<LegendRole, number> = {
    referee: t.discipline + (100 - t.temper) * 0.6 - t.alcohol * 0.4 + (age <= 45 ? 15 : -25),
    youth_coach: t.leadership + t.patriotism * 0.5 + t.workRate * 0.3 - t.alcohol * 0.3,
    pub_owner: t.alcohol + (age >= 35 ? 20 : 0) + (100 - t.discipline) * 0.3,
    fan_leader: t.patriotism * 0.7 + t.temper * 0.6 + t.aggression * 0.3,
  };
  let best: LegendRole | null = null;
  for (const role of LEGEND_ROLES) {
    if (!available.includes(role)) continue;
    if (best === null || score[role] > score[best]) best = role;
  }
  return best;
}

export const POSITION_WORDS: Record<string, string> = {
  GK: "brankář",
  DEF: "obránce",
  MID: "záložník",
  FWD: "útočník",
};

/** Co legenda v okrese dělá a kde: `place` je okres, název hospody, nebo klub. */
export interface LegendFacts {
  firstName: string;
  lastName: string;
  nickname: string | null;
  age: number;
  position: string;
  seasonsInClub: number;
  teamName: string;
  role: LegendRole | null;
  place: string;
  traits: LegendTraits;
}

export function legendName(f: Pick<LegendFacts, "firstName" | "lastName">): string {
  return `${f.firstName} ${f.lastName}`;
}

function seasonsWord(n: number): string {
  if (n === 1) return "jednu sezónu";
  if (n >= 2 && n <= 4) return `${n} sezóny`;
  return `${n} sezón`;
}

/** Nová role jednou větou: `you` = v promptu legendě (ty), jinak ve třetí osobě. */
export function roleSentence(role: LegendRole, place: string, teamName: string, you: boolean): string {
  switch (role) {
    case "referee":
      return you ? `Teď pískáš okresní soutěže jako rozhodčí (${place}).` : `Nově bude pískat okresní soutěže jako rozhodčí.`;
    case "fan_leader":
      return you ? `Teď vedeš kotel klubu ${teamName} za brankou.` : `Nově povede kotel klubu ${teamName} za brankou.`;
    case "pub_owner":
      return you ? `Teď vedeš hospodu ${place}.` : `Nově převzal hospodu ${place}.`;
    case "youth_coach":
      return you ? `Teď zadarmo trénuješ žáky v klubu ${teamName}.` : `Nově bude zadarmo trénovat žáky v klubu ${teamName}.`;
  }
}

const ROLE_OPTIONS: Record<LegendRole, (place: string, teamName: string) => string> = {
  referee: () => "bude pískat okresní soutěže jako rozhodčí (sedí disciplinovaným a klidným)",
  fan_leader: (_p, team) => `povede kotel klubu ${team} (sedí vášnivým patriotům a horkým hlavám)`,
  pub_owner: (place) => `převezme hospodu ${place} (sedí společenským a těm, kdo si rádi dají pivo)`,
  youth_coach: (_p, team) => `bude zadarmo trénovat žáky v klubu ${team} (sedí vůdčím typům a patriotům)`,
};

/** Prompt pro výběr role. `places` = kde by roli dělal (hospoda podle nabídky v okrese). */
export function buildRolePrompt(f: LegendFacts, available: readonly LegendRole[], places: Partial<Record<LegendRole, string>>): string {
  const lines = available.map((r) => `- ${r}: ${ROLE_OPTIONS[r](places[r] ?? "", f.teamName)}`);
  return `Bývalý hráč amatérského fotbalového klubu ${f.teamName} na konci sezóny odešel z kádru a s aktivním fotbalem končí. Rozhodni, čím bude v okrese dál.

Hráč: ${legendName(f)}, ${f.age} let, ${POSITION_WORDS[f.position] ?? "hráč"}${f.seasonsInClub > 0 ? `, za klub hrál ${seasonsWord(f.seasonsInClub)}` : ""}.
Povaha: ${traitWords(f.traits)}.

Možnosti (vyber právě jednu z nich):
${lines.join("\n")}

Rozhoduj podle věku a povahy.
Odpověz jen JSON: {"role": "${available.join('" | "')}", "reason": "krátce česky"}`;
}

/** Odpověď modelu na roli: jen role z nabídky, jinak null (zaskočí pravidlo). */
export function parseRoleAnswer(raw: unknown, available: readonly LegendRole[]): { role: LegendRole; reason: string } | null {
  const parsed = parseModelJson(raw);
  if (!parsed) return null;
  const role = typeof parsed.role === "string" ? parsed.role.trim() : null;
  if (!isLegendRole(role) || !available.includes(role)) return null;
  const reason = typeof parsed.reason === "string" ? cleanDashes(parsed.reason.trim()).slice(0, 200) : "";
  return { role, reason };
}

export function buildFarewellPrompt(f: LegendFacts): string {
  const facts = [
    `- ${legendName(f)}${f.nickname ? ` (přezdívka ${f.nickname})` : ""}, ${f.age} let, ${POSITION_WORDS[f.position] ?? "hráč"}`,
    f.seasonsInClub > 0 ? `- za klub ${f.teamName} odehrál ${seasonsWord(f.seasonsInClub)}` : `- hrál za klub ${f.teamName}`,
    "- na konci sezóny odešel z kádru, s aktivním fotbalem končí",
    f.role ? `- ${roleSentence(f.role, f.place, f.teamName, false)}` : "",
  ].filter(Boolean);
  return `Jsi redaktor okresního Zpravodaje. Napiš krátký článek na rozloučenou s legendou klubu ${f.teamName}.

Fakta (nic jiného si nevymýšlej, žádné góly, výsledky ani jiná jména):
${facts.join("\n")}

Pravidla:
- titulek do 90 znaků, ve kterém je příjmení ${f.lastName}
- text dva krátké odstavce, dohromady 60 až 120 slov, česky
- vesnický fotbal, s úctou a lehkým humorem
- nepoužívej dlouhou pomlčku (—)

Odpověz jen JSON: {"headline": "titulek", "body": "text"}`;
}

/** Článek od modelu: musí jmenovat legendu a mít rozumnou délku. Jinak null a platí náhradní. */
export function checkFarewell(raw: unknown, f: LegendFacts): { headline: string; body: string } | null {
  const parsed = parseModelJson(raw);
  if (!parsed) return null;
  const headline = typeof parsed.headline === "string" ? cleanDashes(parsed.headline.trim().replace(/^["„“]+|["“”]+$/g, "")).trim() : "";
  const body = typeof parsed.body === "string" ? cleanDashes(parsed.body.trim()) : "";
  if (headline.length < 8 || headline.length > 120) return null;
  if (body.length < 80 || body.length > 1500) return null;
  if (!`${headline} ${body}`.includes(f.lastName)) return null;
  return { headline, body };
}

const FAREWELL_ROLE_TEXT: Record<LegendRole, (f: LegendFacts) => string> = {
  referee: () => "Fotbal ale neopouští: přihlásil se do okresní komise rozhodčích a bude pískat. Na hřišti ho tedy uvidíme dál, jen s píšťalkou a v černém.",
  fan_leader: (f) => `Fotbal ale neopouští: postaví se do kotle klubu ${f.teamName} za brankou a povede ho. Kdo ho znal z hřiště, ví, že bude slyšet.`,
  pub_owner: (f) => `Fotbal ale neopouští: převzal hospodu ${f.place} a u výčepu se o fotbale bude mluvit dál, teď z druhé strany pípy.`,
  youth_coach: (f) => `Fotbal ale neopouští: bude zadarmo trénovat žáky v klubu ${f.teamName}. Kluci dostanou trenéra, který to hřiště zná líp než kdokoli jiný.`,
};

const FAREWELL_HEADLINES: Record<LegendRole, (f: LegendFacts) => string> = {
  referee: (f) => `${f.firstName} ${f.lastName} končí s kopačkami, teď bude pískat okres`,
  fan_leader: (f) => `${f.firstName} ${f.lastName} končí v kádru, teď povede kotel`,
  pub_owner: (f) => `${f.firstName} ${f.lastName} pověsil kopačky, teď stojí za pípou`,
  youth_coach: (f) => `Legenda ${f.lastName} končí, žáky ale neopustí`,
};

/** Náhradní článek bez modelu: jen fakta. */
export function fallbackFarewell(f: LegendFacts): { headline: string; body: string } {
  const role = f.role ?? "referee";
  const position = POSITION_WORDS[f.position] ?? "hráč";
  const tenure = f.seasonsInClub > 0 ? `po ${f.seasonsInClub === 1 ? "jedné sezóně" : `${f.seasonsInClub} sezónách`}` : "po letech";
  const first = `${f.firstName} ${f.lastName}${f.nickname ? `, kterému nikdo neřekne jinak než ${f.nickname},` : ""} se ${tenure} loučí s kádrem klubu ${f.teamName}. `
    + `${f.age > 0 ? `Ve ${f.age} letech` : "Teď"} ${position} pověsil kopačky na hřebík a v kabině po něm zůstane prázdné místo i pár historek, které se budou vyprávět ještě dlouho.`;
  const second = f.role ? FAREWELL_ROLE_TEXT[role](f) : "S fotbalem se ale úplně nerozloučí, v okrese o něm ještě uslyšíme.";
  return { headline: cleanDashes(FAREWELL_HEADLINES[role](f)), body: cleanDashes(`${first}\n\n${second}`) };
}

export type LegendTopic = "first" | "whistle" | "chat";

export interface LegendSmsContext {
  /** Sudí-legenda je delegovaný na zápas bývalého klubu. */
  whistle?: { opponent: string; day: string };
  /** Příští zápas bývalého klubu, když je známý. */
  nextOpponent?: string;
  /** Rozhovor od nejstaršího. */
  history?: Array<{ from: "coach" | "legend"; body: string }>;
}

const CHAT_TOPICS: Record<LegendRole, string[]> = {
  referee: [
    "napiš, jak se ti v okrese píská a co si od hráčů na hřišti vyslechneš",
    "postěžuj si s humorem, že sudí to má těžší, než sis jako hráč myslel",
  ],
  fan_leader: [
    "napiš, co kotel chystá na příští domácí zápas (vlajky, buben, chorál)",
    "napiš, jak se v kotli mluví o klubu a o trenérovi, slovy, bez čísel",
  ],
  pub_owner: [
    "pozvi ho na pivo k sobě do hospody",
    "napiš, co se u výčepu povídá o klubu, jen obecně a bez vymyšlených jmen",
  ],
  youth_coach: [
    "napiš, jak se daří žákům na tréninku, bez jmen a bez výsledků",
    "napiš, že mezi žáky je kluk s talentem, jaký jsi měl ty, ale jméno neprozrazuj",
  ],
};

const COMMON_TOPICS = [
  "zavzpomínej na starou dobu v kabině, bez vymyšlených výsledků a jmen",
  "napiš, že klubu držíš palce na příští zápas",
];

function chatTopic(role: LegendRole, seed: number): string {
  const pool = [...CHAT_TOPICS[role], ...COMMON_TOPICS];
  return pool[Math.abs(seed) % pool.length];
}

function historyBlock(history: LegendSmsContext["history"]): string {
  const lines = (history ?? []).map((m) => `${m.from === "coach" ? "Trenér" : "Ty"}: ${m.body}`);
  return lines.length > 0 ? lines.join("\n") : "(zatím nic)";
}

function personaHeader(f: LegendFacts): string {
  const role = f.role ? roleSentence(f.role, f.place, f.teamName, true) : "";
  return `Jsi ${legendName(f)}, je ti ${f.age} let. ${f.seasonsInClub > 0 ? `Za klub ${f.teamName} jsi hrál ${seasonsWord(f.seasonsInClub)}` : `Hrál jsi za klub ${f.teamName}`} jako ${POSITION_WORDS[f.position] ?? "hráč"}. Na konci sezóny tě trenér v souboji o místo v kádru nechal odejít a s aktivním fotbalem jsi skončil. ${role}
Povaha: ${traitWords(f.traits)}. Podle povahy buď vůči trenérovi bez zášti, nebo s lehkým rýpnutím, ale slušně.`;
}

const SMS_RULES = `Pravidla:
- česky, jako obyčejná SMS: jedna až tři krátké věty, hovorově, podle své povahy
- trenéra oslovuj „trenére“, je to tvůj bývalý trenér
- nevymýšlej si výsledky, góly, jména hráčů ani zápasy, které nemáš v zadání
- žádná čísla kromě data a času
- nepoužívej dlouhou pomlčku (—)`;

export function buildLegendSmsPrompt(f: LegendFacts, topic: LegendTopic, ctx: LegendSmsContext, seed: number): string {
  let task: string;
  if (topic === "first") {
    task = "Ozýváš se mu poprvé od odchodu. Napiš, co teď děláš a jak to vidíš s klubem.";
  } else if (topic === "whistle" && ctx.whistle) {
    task = `Komise rozhodčích tě delegovala na zápas jeho klubu proti ${ctx.whistle.opponent} (${ctx.whistle.day}). Napiš mu, že jim budeš pískat a že žádná protekce nebude.`;
  } else {
    const role = f.role ?? "referee";
    task = `Napiš mu jen tak. Téma: ${chatTopic(role, seed)}.${ctx.nextOpponent ? ` Klub teď čeká zápas proti ${ctx.nextOpponent}.` : ""}`;
  }
  return `${personaHeader(f)}
Píšeš SMS svému bývalému trenérovi z klubu ${f.teamName}.

Rozhovor od nejstaršího:
${historyBlock(ctx.history)}

CO MÁŠ NAPSAT: ${task}

${SMS_RULES}

Odpověz jen JSON: {"body": "text SMS"}`;
}

export function buildLegendReplyPrompt(f: LegendFacts, history: LegendSmsContext["history"], coachText: string): string {
  return `${personaHeader(f)}
Píšeš si SMS se svým bývalým trenérem z klubu ${f.teamName}.

Rozhovor od nejstaršího:
${historyBlock(history)}

Poslední zpráva trenéra: "${coachText}"

CO MÁŠ NAPSAT: odpověz mu na to, co napsal. Nic neslibuj za klub ani za komisi rozhodčích, jsi teď jen ${f.role ? roleSentence(f.role, f.place, f.teamName, true).replace(/^Teď /, "").replace(/\.$/, "") : "bývalý hráč"}.

${SMS_RULES}

Odpověz jen JSON: {"body": "text SMS"}`;
}

/** SMS od modelu: očistit a ověřit délku. Jinak null a platí připravená věta. */
export function checkLegendSms(raw: unknown): string | null {
  const parsed = parseModelJson(raw);
  const text = typeof parsed?.body === "string" ? parsed.body : "";
  const body = cleanDashes(text.trim().replace(/^["„“]+|["“”]+$/g, "")).trim();
  if (body.length < 2 || body.length > 600) return null;
  return body;
}

const FIRST_SMS: Record<LegendRole, string[]> = {
  referee: [
    "Ahoj trenére, tak jsem se dal na píšťalku. Přihlásil jsem se do okresní komise, uvidíme se na hřišti, jen já budu v černém.",
    "Trenére, kopačky jsou ve skříni a já mám píšťalku. Pískám teď okres, tak ať na mě kluci moc neřvou.",
  ],
  fan_leader: [
    "Ahoj trenére, z kádru jsem sice letěl, ale z klubu ne. Teď stojím v kotli za brankou a povedu ho, tak ať je co slavit.",
    "Trenére, kopačky jsem pověsil, ale hlas mi zůstal. Od teď mě uslyšíte z kotle, kluci za brankou mě vzali za svého.",
  ],
  pub_owner: [
    "Ahoj trenére, tak jsem převzal hospodu. Kdybyste chtěl probrat sestavu u piva, víte, kde mě najdete.",
    "Trenére, kopačky na hřebík a já za pípu. Mám teď hospodu, první pivo pro vás bude na mě.",
  ],
  youth_coach: [
    "Ahoj trenére, nechal jste mě odejít, ale já od klubu neodešel. Vzal jsem žáky, trénuju je zadarmo, ať má kdo kopat.",
    "Trenére, s fotbalem jsem úplně neskončil. Mám teď na starosti žáky, za pár let vám pošlu do kádru pořádný kluky.",
  ],
};

const CHAT_SMS: Record<LegendRole, string[]> = {
  referee: [
    "Trenére, pískat je horší, než jsem si myslel. Za každý faul jsem zloděj, za každý neodpískaný taky.",
    "Ahoj trenére, včera jsem pískal a půlka hřiště mi radila, kde mám brýle. Teď vím, jak jsem dřív otravoval já.",
  ],
  fan_leader: [
    "Trenére, kotel na příště chystá novou vlajku a buben už je opravený. Tak ať kluci makaj.",
    "Ahoj trenére, v kotli se teď zpívá jako dřív. Kluci za brankou za vámi stojí, jen to nesmí moc drhnout.",
  ],
  pub_owner: [
    "Trenére, stavte se po zápase na pivo. U výčepu se o klubu mluví víc než v kabině.",
    "Ahoj trenére, štamgasti u mě rozebírají každou vaši sestavu. Přijďte jim to vysvětlit, pivo platím.",
  ],
  youth_coach: [
    "Trenére, žáci makaj, i když je venku zima. Jeden kluk má nohu jako já za mlada, uvidíte.",
    "Ahoj trenére, na tréninku žáků je víc dětí, než jsem čekal. Ještě to chce míče, ale jedeme.",
  ],
};

const COMMON_SMS = [
  "Trenére, držím palce na víkend. Ať to kluci urvou.",
  "Ahoj trenére, vzpomínal jsem na kabinu. Ty řeči po zápase mi chybí víc než samotný fotbal.",
];

/** Připravená SMS legendy (AI vypnutá nebo odpověď neprošla kontrolou). */
export function fallbackLegendSms(f: LegendFacts, topic: LegendTopic, seed: number, ctx: LegendSmsContext): string {
  const role = f.role ?? "referee";
  const pick = (pool: string[]) => pool[Math.abs(seed) % pool.length];
  if (topic === "whistle" && ctx.whistle) {
    return cleanDashes(`Trenére, ${ctx.whistle.day} vám pískám proti ${ctx.whistle.opponent}. Žádná protekce, ať se pak nikdo nezlobí.`);
  }
  if (topic === "first") return pick(FIRST_SMS[role]);
  return pick([...CHAT_SMS[role], ...COMMON_SMS]);
}

const REPLIES = [
  "Jasně, trenére. Teď nemám čas, ozvu se.",
  "Rozumím, trenére. Probereme to, až se uvidíme.",
  "Díky za zprávu, trenére. Musím běžet, napíšu později.",
  "To jo, trenére. Pozdravuj kluky v kabině.",
];

export function fallbackLegendReply(seed: number): string {
  return REPLIES[Math.abs(seed) % REPLIES.length];
}

/** První SMS přijde dva až čtyři dny po odchodu (podle id, ať je to stabilní). */
export function firstSmsDelayHours(seed: number): number {
  return 48 + (Math.abs(seed) % 49);
}
