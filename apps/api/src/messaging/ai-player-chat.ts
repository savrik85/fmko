/**
 * Gemini-driven AI player chat service.
 * Generuje úvodní zprávu hráče, jeho odpověď v threadu, a vyhodnocení dopadu na atributy.
 *
 * Žádný fallback na šablony — pokud Gemini selže nebo chybí klíč, funkce vyhodí výjimku
 * a volající (cron / reply hook) má za úkol thread čistě skipnout / nechat pro pozdější retry.
 */

import { foreignSpeechRule, romaniSpeechRule } from "./foreign-speech";
import { logger } from "../lib/logger";
import { COACH_CHAT_MAX_MORALE, COACH_CHAT_MAX_RELATION } from "../lib/coach-relation";
import { seedFromString } from "../lib/seed";
import { getOccupationByName, smenaProPovolani } from "../generators/occupations";
import { domacnostSeSituaci, kontextCasu, popisSituace, pravidloEmoji, type CasovyKontext } from "./chat-kontext";
import { blokZnalosti } from "../incidents/znalosti";
import type { PlayerSnapshot, AiScenario } from "./ai-player-scenarios";
import { weightTalkPrompt } from "../season/weight-talk";
import { memoryPromptLines, type OfferStance } from "./player-memory";


export interface ThreadMessage {
  sender: "player" | "coach";
  body: string;
  /** Zpráva z dřívějšího rozhovoru: pro odpověď jen kontext, do vyhodnocení se nepočítá. */
  earlier?: boolean;
}

/**
 * Historie do promptu. Starší rozhovory jdou zvlášť jako kontext, aby si hráč
 * nepletl dávná témata (sliby, stížnosti) s tím, o čem se píše teď.
 */
function formatHistory(history: ThreadMessage[], firstName: string): string {
  const line = (m: ThreadMessage) => `${m.sender === "player" ? firstName : "TRENÉR"}: ${m.body}`;
  const earlier = history.filter((m) => m.earlier);
  const current = history.filter((m) => !m.earlier);
  return [
    ...(earlier.length > 0
      ? ["DŘÍVĚJŠÍ HOVOR (jen kontext, NEODPOVÍDEJ na něj a neopakuj ho):", ...earlier.map(line), "", "TEĎ:"]
      : []),
    ...current.map(line),
  ].join("\n");
}

export interface TeamContext {
  teamName: string;
  villageName?: string;
  leaguePosition?: number;
  lastMatchResult?: string;
  /** Příští mistrovský zápas, např. „dnes (čtvrtek 29. 10.) v 18:00 venku s X“. Bez něj hráč tvrdil, že se nehraje. */
  nextMatch?: string;
  managerName?: string;
  /** Jména spoluhráčů — bez nich si model vymýšlí neexistující hráče. */
  squadNames?: string[];
  /** Spoluhráč, o kterého v konverzaci jde (konflikt / pochvala za asistenci). */
  subjectPlayerName?: string;
  /** Praha nebo město. Venku je pod hlasovkou slyšet ulice, ne vesnice. */
  urban?: boolean;
}

/**
 * Co hráč v danou chvíli dělá a kde je. Jeden výpočet pro text zprávy i zvuk
 * pod hlasovkou, aby hráč, který píše z práce, nebyl slyšet z gauče.
 */
export function playerTimeContext(player: PlayerSnapshot, kdy: Date): CasovyKontext {
  const k = kontextCasu(
    kdy, smenaProPovolani(player.occupation), seedFromString(player.id),
    player.alcohol, player.age, player.lastOwnMessageAt,
  );
  // Píše z hospody (pozvánka, fotka stolu s pivy): sedí tam a je opilý, i když by podle hodin byl
  // doma. Uživatel chtěl, ať z hospody píše opile (2026-10-24), proto rovnou nejvyšší podnapilost.
  if (player.atPub) return { ...k, situace: "pije", kdePije: "hospoda", podnapilost: 3 };
  return k;
}

export interface ResolutionResult {
  morale_delta: number;        // -15..+15
  condition_delta: number;     // -5..+5
  relationship_delta: number;  // -15..+15
  /** Počet herních dní, po které hráč nebude k dispozici (osobní volno schválené trenérem). 0 = bez absence. Max 5. */
  absence_days: number;
  /** Krátký důvod absence (zapíše se do injuries.description). Použije se jen pokud absence_days > 0. */
  absence_reason: string;
  summary: string;             // krátké česky shrnutí (~1 věta)
  tone: "positive" | "negative" | "neutral";
}

/**
 * Životní situace drží DB (fáze 7). Dokud hráč žádnou nemá, model si ji nesmí vymyslet:
 * porod nebo rozvod v SMS by neseděl s ničím dalším ve hře.
 */
export const ZAKAZ_ZIVOTNICH_SITUACI = "- NEVYMÝŠLEJ si narození dítěte, rozvod, ztrátu práce ani nemoc rodiče. Nic takového se ti teď neděje.";

class GeminiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiUnavailableError";
  }
}

function buildPersonalityHints(p: PlayerSnapshot): string {
  const hints: string[] = [];
  const flag = (label: string, value: number, threshold = 65) => {
    if (value >= threshold) hints.push(`vysoký ${label} (${value})`);
    else if (value <= 100 - threshold) hints.push(`nízký ${label} (${value})`);
  };
  flag("temperament", p.temper);
  flag("disciplína", p.discipline);
  flag("alkohol", p.alcohol);
  flag("vůdcovství", p.leadership);
  flag("pracovitost", p.workRate);
  flag("agresivita", p.aggression);
  flag("vlastenectví", p.patriotism);
  return hints.length > 0 ? hints.join(", ") : "průměrná povaha";
}

/**
 * Co se hráči stalo v posledním zápase. Bez toho by scénář o gólu nebo červené kartě
 * psal naslepo a model si počty i vlastní výkon domyslel.
 */
export function buildLastMatchFacts(p: PlayerSnapshot, lastMatchResult?: string): string {
  if (!p.lastMatchOutcome) return "";
  const verdict = lastMatchResult
    ?? (p.lastMatchOutcome === "win" ? "vyhráli jsme" : p.lastMatchOutcome === "loss" ? "prohráli jsme" : "remizovali jsme");
  if (p.playedLastMatch === false) {
    // Dřív tu stálo vždycky „seděl jsi na lavičce", i u hráče, kterého trenér vůbec nenominoval.
    const where = p.lastMatchSquad === "bench"
      ? "jen jsi seděl na lavičce a nenastoupil jsi"
      : p.lastMatchSquad === "out"
        ? "nebyl jsi ani na lavičce, trenér tě do nominace nedal"
        : "nenastoupil jsi";
    return `- V posledním zápase (${verdict}) jsi NEHRÁL, ${where}. NIKDY netvrď, že jsi hrál nebo byl na hřišti. Nemluv o svém výkonu, góly ani karty jsi mít nemohl.`;
  }
  const bits: string[] = [];
  if ((p.lastMatchGoals ?? 0) > 0) bits.push(`dal jsi ${p.lastMatchGoals} ${p.lastMatchGoals === 1 ? "gól" : (p.lastMatchGoals ?? 0) < 5 ? "góly" : "gólů"}`);
  if ((p.lastMatchAssists ?? 0) > 0) bits.push(`${p.lastMatchAssists}× jsi asistoval`);
  if (p.lastMatchRedCard) bits.push("dostal jsi ČERVENOU kartu");
  else if (p.lastMatchYellow) bits.push("dostal jsi žlutou kartu");
  if (p.lastMatchRating != null) bits.push(`známka za výkon ${p.lastMatchRating.toFixed(1)}/10`);
  const detail = bits.length > 0 ? ` Tvoje bilance: ${bits.join(", ")}.` : " Gól jsi nedal a kartu nedostal.";
  return `- V posledním zápase jsi nastoupil, ${verdict}.${detail} Jiné góly, karty ani statistiky si NEVYMÝŠLEJ.`;
}

/**
 * `kdy` je normálně teď. Jde předat kvůli testům a kvůli tomu, aby dvě volání
 * v jednom zpracování nespadla každé do jiné hodiny.
 */
/**
 * Fakt o zdraví hráče pro prompt. Bez něj model ochotně přikyvoval trenérovi
 * („byl jsi zraněný" → „jo, to je fakt, zapomněl jsem"), i když hráč zraněný nebyl.
 * Prázdný řetězec = zdraví nenačtené, prompt o něm mlčí.
 */
export function popisZdravi(player: PlayerSnapshot): string {
  const inj = player.injury;
  if (inj === undefined) return "";
  if (inj === null) {
    const last = player.recentInjury;
    if (last) {
      const detail = last.description ? ` (${last.description})` : "";
      if (last.volno) return `Zdraví: jsi fit. Nedávno jsi měl od trenéra osobní volno${detail}, to už skončilo.`;
      if (last.fake) return `Zdraví: jsi fit. Nedávno jsi trenérovi hlásil zranění${detail}, které jsi jen hrál, a teď jsi zpátky. Nepřiznáš to.`;
      return `Zdraví: jsi zase fit. Nedávno jsi byl zraněný${detail}, už je to dobré. Když se trenér ptá, jak ti je, víš, na co se ptá.`;
    }
    return "Zdraví: jsi fit, nejsi zraněný ani nemáš volno. Když trenér tvrdí, že jsi byl zraněný, nepřikyvuj mu a oprav ho.";
  }
  const popis = inj.description ? ` (${inj.description})` : "";
  const dny = `ještě ${inj.daysLeft} ${inj.daysLeft === 1 ? "den" : inj.daysLeft < 5 ? "dny" : "dní"}`;
  if (inj.volno) return `Zdraví: máš od trenéra osobní volno${popis}, ${dny}.`;
  if (inj.fake) return `Zdraví: trenérovi hlásíš zranění${popis}, ${dny}. Ve skutečnosti ti nic není, ale nepřiznáš to.`;
  return `Zdraví: jsi zraněný${popis}, ${dny} nemůžeš hrát.`;
}

export function buildSystemPrompt(player: PlayerSnapshot, team: TeamContext, kdy: Date = new Date()): string {
  const positionLabel: Record<string, string> = {
    GK: "brankář",
    DEF: "obránce",
    MID: "záložník",
    FWD: "útočník",
  };
  // Apozice, ne pád: „z Dvory" by se z promptu propsalo i do zpráv.
  const village = team.villageName ? ` z obce ${team.villageName}` : "";
  const positionStr = positionLabel[player.position] ?? player.position;

  // Kolik je hodin a co dělá. Bez toho psal každý ve dvě ráno stejně ochotně
  // jako v neděli odpoledne, což je na SMS od vesnického fotbalisty poznat.
  const cas = playerTimeContext(player, kdy);
  const occ = player.occupation ? getOccupationByName(player.occupation) : undefined;
  // Výmluvy bez vazby na počasí: tady o něm nic nevíme.
  const vymluvy = (occ?.excuses ?? []).filter((e) => !e.weather).map((e) => e.text);
  const vymluva = vymluvy.length > 0
    ? [vymluvy[(seedFromString(player.id) + cas.hodina) % vymluvy.length]]
    : [];

  // Situace v DB (fáze 7): kdo ji má, ten o ní smí mluvit a zákaz vymýšlení si na něj neplatí.
  const situace = player.zivotniSituace
    ? `TVOJE ŽIVOTNÍ SITUACE (mluv o ní, když se hodí, nic dalšího si nevymýšlej): ${player.zivotniSituace.label}.`
    : "";
  const zakaz = player.zivotniSituace ? "" : ZAKAZ_ZIVOTNICH_SITUACI;
  const language = foreignSpeechRule(player.nationality);

  return [
    `Jsi ${player.firstName} ${player.lastName}, ${player.age}letý ${positionStr} amatérského týmu ${team.teamName}${village} v české vesnické soutěži.`,
    `Tvoje povaha: ${buildPersonalityHints(player)}.`,
    `Aktuální nálada: ${player.morale}/100, kondice: ${player.condition}/100, vztah s trenérem: ${player.coachRelationship}/100.`,
    popisZdravi(player),
    domacnostSeSituaci(player.age, player.zivotniSituace?.kind),
    popisSituace(cas, player.occupation, vymluva),
    // Kdo je na druhé straně, musí být jasné TADY, ne až mezi fakty o klubu.
    // Dokud trenérovo jméno leželo v seznamu vedle spoluhráčů, model ho bral
    // jako dalšího člověka z klubu a posílal trenéra za trenérem:
    // „To si řešte s Klementem, ne se mnou" — Klement byl přitom on sám.
    `Píšeš SMS PŘÍMO svému trenérovi. Jmenuje se ${team.managerName ?? "trenér"} a je to ten, komu právě píšeš — nikdo jiný.`,
    // Cizinec píše lámaně (Slovák slovensky): pokyn nahrazuje českou hovorovou mluvu i oslovení.
    language ?? "Mluv neformálně česky, jako vesničan z malého klubu, používej hovorové výrazy, klidně i nadávku nebo povzdech.",
    language ? "" : (romaniSpeechRule(player.romani) ?? ""),
    "PRAVIDLA STYLU:",
    language
      ? "- Oslovuj trenéra podle pokynu JAZYK (případně jeho jménem). NIKDY nepoužívej slovo 'šéfe'."
      : "- Oslovuj trenéra slovem 'trenére' (případně jeho jménem). NIKDY nepoužívej slovo 'šéfe' — to neříkáme.",
    `- O trenérovi NIKDY nemluv ve třetí osobě a neposílej ho za ním samým. Když napíšeš „${team.managerName ?? "trenér"}", oslovuješ toho, s kým si píšeš.`,
    cas.podnapilost >= 3
      ? "- Krátce: 1-2 věty, do 200 znaků. Gramatiku ani pravopis teď neřeš, jsi opilý."
      : "- Krátce: 1-2 věty, do 200 znaků.",
    // Opakuje se schválně i tady, mezi ostatními pravidly stylu. Model má sklon
    // instrukci o opilosti ze začátku promptu přejít a napsat slušnou větu.
    cas.podnapilost >= 3
      ? "- NEJDŮLEŽITĚJŠÍ PRAVIDLO: piš úplně bez diakritiky a s překlepy, jako když se do klávesnice trefuješ opilý. Místo trenére napiš trenere, místo neděli napiš nedeli, klidně zdvoj písmeno (dikyy) nebo vynech mezeru. Žádná tečka na konci."
      : "",
    "- UKAZUJ EMOCE: když tě něco štve, dej to najevo (sarkasmus, frustrace, povzdech). Když jsi rád, projev to. Nebuď monotónní.",
    "- NIKDY se neopakuj, nepoužívej stejné fráze nebo slova jako v předchozí své zprávě.",
    pravidloEmoji(player.age, player.temper, cas.podnapilost),
    "- Do emoji nepatří ⚽ ani 🥅, jsi hráč, ne fanoušek.",
    zakaz,
    "- Denní dobu a to, co zrovna děláš, zmiňuj jen když to má důvod. Nezačínej každou zprávu hlášením, kolik je hodin.",
    "- NIKDY nepiš jako AI nebo formálně.",
    "",
    "FAKTA O KLUBU, smíš se opírat VÝHRADNĚ o ně:",
    team.lastMatchResult
      ? `- Poslední zápas: ${team.lastMatchResult}. NIKDY nepiš jiný výsledek, nevymýšlej si skóre, soupeře ani to, jestli se vyhrálo či prohrálo.`
      : "- O posledním zápase nic nevíš. NEZMIŇUJ žádný výsledek, skóre ani soupeře.",
    team.nextMatch
      ? `- Příští mistrovský zápas: ${team.nextMatch}.`
      : "- Termín dalšího zápasu neznáš.",
    team.leaguePosition ? `- Tým je v tabulce na ${team.leaguePosition}. místě.` : "",
    team.squadNames && team.squadNames.length > 0
      ? `- Spoluhráči (JEDINÁ povolená jména, o kterých smíš mluvit): ${team.squadNames.join(", ")}. NIKOHO jiného nejmenuj — žádná vymyšlená jména.`
      : "- Jména spoluhráčů neznáš. NIKOHO nejmenuj.",
    buildLastMatchFacts(player, team.lastMatchResult),
    "- O termínech zápasů, sestavě a o tom, kdo hrál, víš JEN to, co stojí v těchto faktech. NEVYMÝŠLEJ si, kdy se hraje, že se nehraje, ani kdo nastoupil. Když to nevíš, řekni to nebo se zeptej trenéra.",
    team.subjectPlayerName
      ? `- Konverzace je o konkrétním spoluhráči: ${team.subjectPlayerName}. Mluv VÝHRADNĚ o něm, nikoho jiného nejmenuj.`
      : "",
    situace,
    blokZnalosti(player.znalostiIncidentu),
    player.weightTalk ? weightTalkPrompt(player.weightTalk) : "",
    ...memoryPromptLines(player),
    player.lateReply === "offline"
      ? "- Na trenérovu poslední zprávu odpovídáš až teď, po pár hodinách, telefon jsi neměl u sebe. Klidně to jednou větou řekni."
      : "",
  ].filter(Boolean).join("\n");
}

/**
 * Pole JSON odpovědi, která hra potřebuje vědět navíc (odložená odpověď, postoj k nabídce).
 * Postoj k nabídce se ptá jen u hráče, na kterého nějaká nabídka čeká.
 */
function replyFlagFields(player: PlayerSnapshot): { schema: string; rules: string[] } {
  const offers = (player.pendingOffers?.length ?? 0) > 0;
  return {
    schema: `, "write_later": <true|false>${offers ? `, "transfer_stance": "stay"|"leave"|"none"` : ""}`,
    rules: [
      "- write_later: true JEN když v téhle zprávě trenérovi slibuješ, že se ozveš později (teď nemáš čas). Jinak false.",
      ...(offers
        // Dohoda „teď zůstanu, na jaře mě pustíš“ dřív spadla do "none" a platilo staré "leave",
        // takže odmítnutí hráče potrestalo, i když s ním souhlasil (Tomáš Bláha, prod 2026-10-29).
        ? ["- transfer_stance: \"stay\", když v téhle zprávě jasně říkáš, že zůstaneš nebo ať trenér nabídku odmítne, i když jen výměnou za slib (pustí tě později, víc peněz, místo v sestavě), na který jsi kývl; \"leave\", když jasně chceš odejít nebo ať ji přijme; jinak \"none\"."]
        : []),
    ],
  };
}

function parseReplyFlags(
  parsed: { write_later?: unknown; transfer_stance?: unknown },
  body: string,
  player: PlayerSnapshot,
): Pick<ReplyResult, "writeLater" | "transferStance"> {
  // Postoj platí jen tam, kde se na něj ptáme: „zůstávám" bez čekající nabídky by se jinak
  // přilepil k první nabídce, která přijde.
  const asked = (player.pendingOffers?.length ?? 0) > 0;
  return {
    // Model pole občas vynechá, i když napíše „ozvu se pak". Text je pojistka.
    writeLater: parsed.write_later === true || PROMISES_LATER_RE.test(body),
    transferStance: asked && (parsed.transfer_stance === "stay" || parsed.transfer_stance === "leave") ? parsed.transfer_stance : undefined,
  };
}

/** „Ozvu se pak", „napíšu potom", slovensky „ozvem sa", lámaně „ja ozvat potom". */
const PROMISES_LATER_RE = /\b(ozvu se|ozvem sa|ozvat se? potom|napíšu (ti |vám )?(pak|potom|později|večer)|zavolám (ti |vám )?(pak|potom|později)|ozvu (se )?(pak|potom|později|večer))/i;

/**
 * Rozhovor po zatrhnutém přestupu (2026-10-18): hráč zná svůj skutečný důvod odchodu
 * a dohody, které mu trenér nabídl. Dřív model znal jen obecný scénář, takže nepoznal,
 * jestli trenér trefil, co hráče štve, a výsledek působil jako loterie.
 */
function transferTalkLines(player: PlayerSnapshot): string[] {
  const t = player.transferTalk;
  if (!t) return [];
  return [
    t.reasons ? `PROČ JSI CHTĚL ODEJÍT: hlavně kvůli ${t.reasons}. Když se trenér ptá nebo to obchází, řekni mu to narovinu.` : "",
    t.offer ? `NABÍDKA: ${t.offer}` : "",
    t.league ? `SOUTĚŽ: ${t.league}` : "",
    t.deals.length > 0
      ? `DOHODA S TRENÉREM (platí, není to jen řeč): ${t.deals.join("; ")}. Když řeší tvůj hlavní důvod, uklidni se a dej mu to najevo.`
      : "",
    "Prázdné řeči bez konkrétního kroku tě neuklidní. Slušné vysvětlení, proč tě klub potřebuje, tě ale aspoň trochu usmíří.",
  ].filter(Boolean);
}

/** Totéž pro AI rozhodčího: hodnotí, jestli trenér řešil hlavní důvod. */
function transferJudgeLines(player: PlayerSnapshot): string[] {
  const t = player.transferTalk;
  if (!t) return [];
  return [
    `HLAVNÍ DŮVOD ODCHODU: ${t.reasons ?? "nezjištěn"}.`,
    ...(t.offer ? [`NABÍDKA (odstupné pro klub, ne pro hráče): ${t.offer}`] : []),
    ...(t.league ? [`SOUTĚŽ: ${t.league}`] : []),
    `UZAVŘENÉ DOHODY: ${t.deals.length > 0 ? t.deals.join("; ") : "žádná"}.`,
    "Tón (rozhoduje o tom, jestli se hráč přestane zlobit):",
    "- positive: trenér uzavřel dohodu, která řeší hlavní důvod, a nebyl hrubý. Nebo bez dohody, když hlavní důvod konkrétně a s respektem řešil a hráč v rozhovoru ustoupil.",
    "- neutral: trenér byl slušný a snažil se, ale hlavní důvod neřešil nebo jen sliboval bez konkrétního kroku, případně dohoda řeší jen vedlejší důvod.",
    "- negative: trenér hráče odbyl, byl hrubý, zesměšnil ho nebo jeho důvod ignoroval.",
    "",
  ];
}

/**
 * Env, který chat potřebuje.
 *
 * Není to jen klíč ke Gemini: chat musí vidět i `CACHE_KV`, protože v něm leží
 * přepínač `ai_provider`.
 */
export interface ChatEnv {
  GEMINI_API_KEY?: string;
  CACHE_KV?: KVNamespace;
  AI?: Ai;
  AI_GATEWAY_URL?: string;
}

/**
 * Zavolá model přes společnou vrstvu `lib/ai-provider`.
 *
 * Dřív tenhle soubor volal Gemini vlastním fetchem natvrdo a přepínač
 * `ai_provider` ho míjel. Testovací prostředí sdílí s produkcí `GEMINI_API_KEY`,
 * takže každá zpráva z testu ujídala produkční kvótu, i když byl přepínač
 * přepnutý na `workers-ai` nebo `off`. Přesně před tím varuje CLAUDE.md.
 *
 * Hází stejnou výjimku jako předtím, aby volající chybové větve zůstaly.
 */
async function callModel(
  env: ChatEnv,
  prompt: string,
  opts: { json?: boolean; maxTokens?: number; temperature?: number } = {},
): Promise<string> {
  const { aiContextFromEnv, generateText } = await import("../lib/ai-provider");
  const ctx = await aiContextFromEnv(env);
  if (ctx.provider === "off") {
    throw new GeminiUnavailableError("generování textu je vypnuté (ai_provider = off)");
  }

  const text = await generateText(ctx, prompt, {
    maxTokens: opts.maxTokens ?? 256,
    temperature: opts.temperature ?? 0.85,
    json: opts.json,
    module: "ai-player-chat",
  });
  if (!text) {
    throw new GeminiUnavailableError(`model (${ctx.provider}) nevrátil odpověď`);
  }
  return text;
}

/** Robustní parse JSON i když Gemini obalí do markdown bloku ```json...``` nebo přidá text okolo. */
function tryParseJson<T>(raw: string): T | null {
  const trimmed = raw.trim();
  // Zkouší se postupně: celý text, bez markdown bloku, první {...} v textu.
  const fenced = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  const match = trimmed.match(/\{[\s\S]*\}/);
  const candidates = [trimmed, fenced, match?.[0]].filter((x): x is string => !!x);
  let lastError: unknown = null;
  for (const candidate of candidates) {
    try { return JSON.parse(candidate) as T; } catch (e) { lastError = e; }
  }
  logger.warn({ module: "ai-player-chat" }, "odpověď modelu není JSON", lastError);
  return null;
}

function trimSms(body: string): string {
  // Gemini občas vrátí uvozovky, podpis nebo "Hráč:" prefix — očistíme.
  let cleaned = body.trim()
    .replace(/^["'„"]+/, "")
    .replace(/["'""]+$/, "")
    .replace(/^(Hráč|Player|SMS|Zpráva)\s*[:\-]\s*/i, "")
    .trim();
  if (cleaned.length > 280) cleaned = cleaned.slice(0, 277).trimEnd() + "…";
  return cleaned;
}

export async function generateInitialMessage(
  env: ChatEnv,
  player: PlayerSnapshot,
  scenario: AiScenario,
  team: TeamContext,
  /** Čas, ve kterém hráč píše. Ruční rozeslání v noci by jinak psalo, že je trenér vzbudil. */
  kdy: Date = new Date(),
  /** Fotka, kterou hráč k SMS přikládá (popis česky). Text k ní má sedět jako popisek. */
  photo?: { alt: string },
): Promise<string> {
  const system = buildSystemPrompt(player, team, kdy);
  const contextLine = team.lastMatchResult ? ` Poslední zápas: ${team.lastMatchResult}.` : "";
  const positionLine = team.leaguePosition ? ` Tým je v lize na ${team.leaguePosition}. místě.` : "";

  const prompt = [
    system,
    "",
    `SCÉNÁŘ: ${scenario.description}${contextLine}${positionLine}`,
    ...(photo
      ? ["", `K SMS přikládáš fotku z mobilu: ${photo.alt}. Text je popisek k ní jako ve WhatsAppu: fotku nepopisuj, jen na ni přirozeně navaž.`]
      : []),
    "",
    `Napiš trenérovi PRVNÍ SMS k tomuto scénáři. Drž tón odpovídající své povaze a vztahu s trenérem (${player.coachRelationship}/100). NEPIŠ podpis. Vrať POUZE text SMS.`,
  ].join("\n");

  const raw = await callModel(env, prompt, { maxTokens: 200, temperature: 0.9 });
  return trimSms(raw);
}

export interface ReplyResult {
  body: string;
  /** Pokud true, AI usoudila že téma je probrané a další výměna nedává smysl — handler spustí resolution. */
  conversationComplete: boolean;
  /**
   * Jen u rozhovoru, který začal trenér a který touhle odpovědí skončil: jak hovor
   * pohnul vztahem k trenérovi a morálkou. Vyhodnocuje se ve stejném volání modelu.
   */
  effect?: { relationshipDelta: number; moraleDelta: number; summary: string };
  /** Hráč v odpovědi slíbil, že se ozve později. Hra mu pak odpověď opravdu pošle (follow-ups.ts). */
  writeLater?: boolean;
  /** Co hráč v odpovědi řekl o čekající nabídce. Jen u hráče, na kterého nějaká čeká. */
  transferStance?: OfferStance;
}

export async function generateReply(
  env: ChatEnv,
  player: PlayerSnapshot,
  history: ThreadMessage[],
  scenario: AiScenario,
  team: TeamContext,
  isFinalTurn: boolean,
): Promise<ReplyResult> {
  const system = buildSystemPrompt(player, team);
  const histText = formatHistory(history, player.firstName);
  const flags = replyFlagFields(player);

  const closingHint = isFinalTurn
    ? "TOTO JE TVOJE POSLEDNÍ ZPRÁVA — uzavři ji (poděkuj / smiř se / rozluč se / nebo prásknout dveřmi pokud tě trenér naštval). Žádné nové otázky. Pole `conversation_complete` MUSÍ být true."
    : "";

  const contextLine = team.lastMatchResult ? ` Poslední zápas: ${team.lastMatchResult}.` : "";
  const prompt = [
    system,
    "",
    `SCÉNÁŘ: ${scenario.description}${contextLine}`,
    ...(scenario.id === "rejected_offer" ? transferTalkLines(player) : []),
    "",
    "HISTORIE KONVERZACE:",
    histText,
    "",
    "JAK ROZHODNOUT O conversation_complete:",
    "- TRUE (uzavři) když trenér VYŘEŠIL tvou žádost: souhlasil ('jasně, jdi domů', 'bud doma', 'odpočiň si'), zamítl ('hraj', 'tým je důležitější'), nebo dal jasnou radu/závěr. Krátká empatická odpověď ('držím palce', 'rozumím', 'chápu') je TAKY uzavření — poděkuj a skonči.",
    "- FALSE (pokračuj) jen když máš ještě KONKRÉTNÍ věc co vyřešit (trenér něco neřekl, je nejasno, máš dodatečnou otázku k tématu). Nepokračuj jen kvůli tomu abys řekl ještě jednu zprávu.",
    "",
    "JAK INTERPRETOVAT TÓN TRENÉRA:",
    "- Krátká odpověď NENÍ automaticky odbytí. 'Držím palce', 'Souhlas', 'Jasně' jsou pozitivní krátké odpovědi.",
    "- Sarkasmus/frustraci použij JEN když trenér byl skutečně odmítavý/hrubý ('Nesral bys', 'To je tvůj problém', 'Není čas') NEBO ti zamítl žádost po které jsi velmi toužil.",
    "- Když trenér souhlasil/podpořil → poděkuj upřímně, žádná ironie.",
    "",
    closingHint,
    // Na produkci trenér pozvání nejdřív odbyl („chlastám doma“) a za minutu napsal „už letím“.
    // Kdyby se konverzace zavřela po první odpovědi, hra by se o přijetí nedozvěděla.
    scenario.invite && !isFinalTurn
      ? "POZVÁNKA: conversation_complete dej true, až když trenér jasně řekne, jestli přijde. Když se vymlouvá, zkus ho jednou přemluvit."
      : "",
    // Slabší model pokyn o dohodě uprostřed promptu přešel a zopakoval svou předchozí
    // zprávu (test 2026-10-18), proto ještě jednou na konci, kde ho nepřehlédne.
    scenario.id === "rejected_offer" && player.transferTalk?.deals.length
      ? `NEJDŮLEŽITĚJŠÍ: trenér s tebou uzavřel dohodu (${player.transferTalk.deals[player.transferTalk.deals.length - 1]}). Zareaguj PŘÍMO na ni a nezačínej znovu svou stížnost.`
      : "",
    `Drž svou povahu (temperament ${player.temper}, vztah ${player.coachRelationship}/100). NEOPAKUJ slova ani fráze co jsi nebo trenér už použil v této konverzaci. NEPIŠ podpis.`,
    "",
    ...flags.rules,
    "Vrať POUZE JSON v tomto tvaru (žádný markdown, žádný komentář):",
    `{"body": "<text SMS, max 200 znaků>", "conversation_complete": <true pokud je téma vyřešené, jinak false>${flags.schema}}`,
  ].filter(Boolean).join("\n");

  const raw = await callModel(env, prompt, { json: true, maxTokens: 256, temperature: 1.0 });

  const parsed = tryParseJson<{ body?: unknown; conversation_complete?: unknown; write_later?: unknown; transfer_stance?: unknown }>(raw);
  if (!parsed) {
    logger.warn({ module: "ai-player-chat" }, `reply JSON parse failed: ${raw.slice(0, 300)}`);
    throw new GeminiUnavailableError("Reply JSON parse failed");
  }

  const body = typeof parsed.body === "string" ? trimSms(parsed.body) : "";
  if (!body) {
    logger.warn({ module: "ai-player-chat" }, `reply JSON missing body, raw: ${raw.slice(0, 300)}`);
    throw new GeminiUnavailableError("Reply JSON missing body");
  }

  return {
    body,
    conversationComplete: parsed.conversation_complete === true || isFinalTurn,
    ...parseReplyFlags(parsed, body, player),
  };
}

/**
 * Odpověď nespokojeného hráče na usmiřovací akci trenéra (unrest-talk).
 * Jediný levný Gemini call (text je jen kosmetika — efekty jsou deterministické).
 * Při selhání vyhazuje GeminiUnavailableError — volající MUSÍ mít fallback šablonu.
 */
export async function generateUnrestReply(
  env: ChatEnv,
  player: PlayerSnapshot,
  team: TeamContext,
  context: {
    coachMessage: string;       // co trenér hráči napsal (šablona akce)
    unrestReason: string;       // proč hráč trucuje (např. odmítnutá nabídka od X)
    outcome: "calmed" | "partial" | "backfired"; // deterministický výsledek akce
  },
): Promise<string> {
  const system = buildSystemPrompt(player, team);
  const outcomeHint = context.outcome === "calmed"
    ? "Trenérova nabídka tě UKLIDNILA, odpověz smířlivě, s úlevou nebo vděkem (dle povahy třeba i s rýpnutím)."
    : context.outcome === "partial"
      ? "Trenérova slova tě uklidnila JEN ČÁSTEČNĚ, odpověz zdrženlivě, dáš mu šanci, ale připomeneš že to sleduješ."
      : "Trenérova slova tě NEUKLIDNILA, spíš naštvala, odpověz odmítavě nebo sarkasticky, dle temperamentu.";

  const prompt = [
    system,
    "",
    `KONTEXT: Trucuješ, protože ${context.unrestReason}.`,
    `TRENÉR ti právě napsal: "${context.coachMessage}"`,
    "",
    outcomeHint,
    "NEPIŠ podpis. Vrať POUZE text SMS (1-2 věty, max 200 znaků).",
  ].join("\n");

  const raw = await callModel(env, prompt, { maxTokens: 200, temperature: 0.9 });
  return trimSms(raw);
}

export async function evaluateResolution(
  env: ChatEnv,
  player: PlayerSnapshot,
  history: ThreadMessage[],
  scenario: AiScenario,
): Promise<ResolutionResult> {
  // Hodnotí se jen tenhle rozhovor, starší zprávy by do výsledku zatáhly dávná témata.
  const histText = history
    .filter((m) => !m.earlier)
    .map((m) => `${m.sender === "player" ? player.firstName : "TRENÉR"}: ${m.body}`)
    .join("\n");

  const prompt = [
    `Vyhodnoť, jak konverzace dopadla pro hráče ${player.firstName} ${player.lastName} (${player.age} let, ${player.position}).`,
    `Scénář: ${scenario.description}`,
    `Aktuální stav hráče: morale ${player.morale}/100, kondice ${player.condition}/100, vztah s trenérem ${player.coachRelationship}/100.`,
    popisZdravi(player),
    `Povaha: ${buildPersonalityHints(player)}.`,
    "",
    "KONVERZACE:",
    histText,
    "",
    "Vrať POUZE JSON v tomto tvaru (žádný markdown, žádný komentář):",
    `{"morale_delta": <-15..+15>, "condition_delta": <-5..+5>, "relationship_delta": <-15..+15>, "absence_days": <0..5>, "absence_reason": "<krátký česky důvod, jen pokud absence_days > 0>", "summary": "<1 věta česky o tom jak hráč odchází>", "tone": "positive"|"negative"|"neutral"}`,
    "",
    ...(scenario.id === "rejected_offer" ? transferJudgeLines(player) : []),
    ...(scenario.category === "casual"
      ? ["- Hráč psal jen tak, o nic nežádal: absence_days = 0. Delty malé (-3..+3), přátelská odpověď trenéra kladně, odbytí záporně."]
      : []),
    "Pravidla:",
    "- Pokud trenér reagoval empaticky/správně → kladné delty (zvlášť relationship +5..+12, morale +3..+10).",
    "- Pokud trenér byl odmítavý/hrubý/lhostejný → záporné (relationship -5..-12, morale -3..-10).",
    "- Pokud trenér byl neutrální → malé delty kolem nuly (-3..+3).",
    "- condition_delta je vzácný, jen když scénář souvisí s kondicí (alkohol, zranění, vyčerpání).",
    "- Buď přísný, žádné +15 zadarmo, jen za skutečně skvělé chování.",
    // Situace v DB (fáze 7): kdo ji má, tomu se v shrnutí nezakazuje o ní psát.
    player.zivotniSituace
      ? ""
      : "- V shrnutí NEVYMÝŠLEJ narození dítěte, rozvod, ztrátu práce ani nemoc rodiče. Nic takového se hráči teď neděje.",
    "- absence_days > 0 NASTAV POUZE pokud:",
    "  a) Hráč žádal o volno (rodinné důvody, zdravotní, osobní milník) A trenér mu volno SCHVÁLIL → absence_days 1-3 podle scénáře (rodinný problém 1-2, svatba 1).",
    "  b) Hráč si stěžoval na bolest A trenér řekl ať si odpočine → absence_days 1-2.",
    "  Jinak absence_days = 0.",
    "- Pokud trenér řekl 'hraj' i když hráč žádal volno → absence_days = 0 ale relationship_delta záporné.",
  ].filter(Boolean).join("\n");

  const raw = await callModel(env, prompt, { json: true, maxTokens: 256, temperature: 0.4 });

  const parsed = tryParseJson<ResolutionResult>(raw);
  if (!parsed) {
    logger.warn({ module: "ai-player-chat" }, `resolution JSON parse failed: ${raw.slice(0, 300)}`);
    throw new GeminiUnavailableError("Resolution JSON parse failed");
  }

  // Validate + clamp
  const clamp = (v: unknown, min: number, max: number): number => {
    const n = typeof v === "number" ? v : 0;
    return Math.max(min, Math.min(max, Math.round(n)));
  };
  return {
    morale_delta: clamp(parsed.morale_delta, -15, 15),
    condition_delta: clamp(parsed.condition_delta, -5, 5),
    relationship_delta: clamp(parsed.relationship_delta, -15, 15),
    absence_days: clamp(parsed.absence_days, 0, 5),
    absence_reason: typeof parsed.absence_reason === "string" ? parsed.absence_reason.slice(0, 100) : "",
    summary: typeof parsed.summary === "string" && parsed.summary.length > 0
      ? parsed.summary.slice(0, 200)
      : "Konverzace skončila bez výrazného závěru.",
    tone: parsed.tone === "positive" || parsed.tone === "negative" ? parsed.tone : "neutral",
  };
}

/**
 * Přijal trenér pozvání? Ptá se jen na jeho poslední zprávu, pár hodin po pozvání
 * (casual-messages.ts). Na produkci psali „Ok jdu“, „už letím“, „počkej až usne žena
 * a pak vyrazím“, ale i „chlastám doma“, takže to slovník nepozná.
 */
export async function coachAcceptsInvite(
  env: ChatEnv,
  invite: { label: string; playerFirstName: string },
  coachMessage: string,
): Promise<boolean> {
  const prompt = [
    `Hráč ${invite.playerFirstName} trenéra zval nebo se ho ptal: ${invite.label}.`,
    `Trenér mu teď napsal: „${coachMessage}"`,
    "",
    "Souhlasil trenér v TÉHLE zprávě? Tedy slíbil, že přijde (\"jdu\", \"dorazím\", \"už letím\", \"počkej, za chvíli jsem tam\"),",
    "nebo hráči řekl, ať se staví (\"jasně, přijď\", \"stav se v šest\").",
    "Váhání, \"možná\", \"uvidím\", vtip bez slibu nebo odmítnutí = false.",
    "",
    "Vrať POUZE JSON: {\"accepted\": true|false}",
  ].join("\n");
  const raw = await callModel(env, prompt, { json: true, maxTokens: 40, temperature: 0 });
  return tryParseJson<{ accepted?: unknown }>(raw)?.accepted === true;
}

/**
 * Odpověď hráče na zprávu, kterou mu trenér napsal sám od sebe.
 *
 * Vlastní generátor, protože `generateReply` staví na scénáři, který si hráč
 * vybral — tady žádný není. Hráč jen reaguje na to, co dostal, a nesmí si
 * vymýšlet vlastní žádost; od toho jsou spawnované thready.
 */
export async function generateCoachInitiatedReply(
  env: ChatEnv,
  player: PlayerSnapshot,
  team: TeamContext,
  history: ThreadMessage[],
  isFinalTurn: boolean,
): Promise<ReplyResult> {
  const system = buildSystemPrompt(player, team);
  const histText = history
    .map((m) => `${m.sender === "player" ? player.firstName : "TRENÉR"}: ${m.body}`)
    .join("\n");
  const flags = replyFlagFields(player);

  const prompt = [
    system,
    "",
    "SITUACE: Trenér ti napsal sám od sebe. Ty jsi o nic nežádal, jen odpovídáš na to, co ti píše.",
    "NEVYMÝŠLEJ si vlastní stížnost ani žádost. Drž se tématu, které trenér nadhodil.",
    "Reaguj na jeho POSLEDNÍ zprávu; starší repliky jsou jen kontext, aby ses neopakoval.",
    "Když jen pozdravil nebo napsal běžnou větu, odpověz stejně krátce a obyčejně.",
    "",
    "HISTORIE KONVERZACE:",
    histText,
    "",
    isFinalTurn
      ? "TOTO JE TVOJE POSLEDNÍ ZPRÁVA — rozluč se. Pole `conversation_complete` MUSÍ být true."
      : "conversation_complete dej true, když je téma vyčerpané (trenér se jen zeptal a ty jsi odpověděl). False jen když máš na co konkrétního navázat.",
    "",
    "Když dáš conversation_complete = true, zhodnoť i dopad z tvého pohledu. Hodnoť JEN POSLEDNÍ zprávu trenéra (a to, co jsi na ni odpověděl). Starší repliky v historii se už započítaly dřív, nezapočítávej je znovu:",
    `- relationship_delta (-${COACH_CHAT_MAX_RELATION}..+${COACH_CHAT_MAX_RELATION}): jak se změnil tvůj vztah k trenérovi. Omluva, pochvala, zájem o tebe, pozvání na pivo, splněný slib → kladně. Urážka, výhrůžka, výsměch, přehlížení → záporně. Obyčejný pozdrav nebo pár slov o ničem → 0.`,
    `- morale_delta (-${COACH_CHAT_MAX_MORALE}..+${COACH_CHAT_MAX_MORALE}): jak ti rozhovor zvedl nebo zkazil náladu.`,
    "- summary: jedna krátká věta česky ve TŘETÍ osobě o tom, co trenér v poslední zprávě udělal, bez čísel (např. „Trenér se omluvil a pozval ho na pivo“, „Trenér ho seřval za výkon“, „Trenér jen pozdravil“).",
    "Při conversation_complete = false dej relationship_delta a morale_delta 0.",
    ...flags.rules,
    "",
    "Vrať POUZE JSON (žádný markdown):",
    `{"body": "<text SMS, max 200 znaků>", "conversation_complete": <true|false>, "relationship_delta": <číslo>, "morale_delta": <číslo>, "summary": "<věta>"${flags.schema}}`,
  ].filter(Boolean).join("\n");

  const raw = await callModel(env, prompt, { json: true, maxTokens: 320, temperature: 0.95 });
  const parsed = tryParseJson<{
    body?: unknown; conversation_complete?: unknown;
    relationship_delta?: unknown; morale_delta?: unknown; summary?: unknown;
    write_later?: unknown; transfer_stance?: unknown;
  }>(raw);
  if (!parsed || typeof parsed.body !== "string" || !parsed.body.trim()) {
    throw new GeminiUnavailableError("Coach-initiated reply JSON parse failed");
  }
  const complete = parsed.conversation_complete === true || isFinalTurn;
  const body = trimSms(parsed.body);
  return {
    body,
    conversationComplete: complete,
    effect: complete ? coachChatEffect(parsed) : undefined,
    ...parseReplyFlags(parsed, body, player),
  };
}

/**
 * Zpráva, kterou hráč pošle sám později (follow-ups.ts): odpověď po šichtě, ranní
 * omluva po opilé hlasovce, poděkování za přijaté pozvání. `instruction` říká, proč
 * píše teď; historie je, co si spolu psali naposledy.
 */
export async function generateFollowUpMessage(
  env: ChatEnv,
  player: PlayerSnapshot,
  team: TeamContext,
  history: ThreadMessage[],
  instruction: string,
  opts: { kdy?: Date; photo?: { alt: string } } = {},
): Promise<Pick<ReplyResult, "body" | "transferStance">> {
  const system = buildSystemPrompt(player, team, opts.kdy);
  const offers = (player.pendingOffers?.length ?? 0) > 0;
  const prompt = [
    system,
    "",
    `PROČ PÍŠEŠ TEĎ: ${instruction}`,
    ...(opts.photo
      ? [`K SMS přikládáš fotku z mobilu: ${opts.photo.alt}. Text je popisek k ní jako ve WhatsAppu: fotku nepopisuj, jen na ni přirozeně navaž.`]
      : []),
    "",
    "HISTORIE KONVERZACE (naposledy dole):",
    history.length > 0 ? formatHistory(history, player.firstName) : "(zatím nic)",
    "",
    "Napiš JEDNU SMS. Neslibuj, že se ozveš později, teď už píšeš. NEOPAKUJ věty z historie. NEPIŠ podpis.",
    ...(offers ? replyFlagFields(player).rules.slice(1) : []),
    "",
    "Vrať POUZE JSON (žádný markdown):",
    `{"body": "<text SMS, max 200 znaků>"${offers ? `, "transfer_stance": "stay"|"leave"|"none"` : ""}}`,
  ].filter(Boolean).join("\n");

  const raw = await callModel(env, prompt, { json: true, maxTokens: 256, temperature: 0.95 });
  const parsed = tryParseJson<{ body?: unknown; transfer_stance?: unknown }>(raw);
  if (!parsed || typeof parsed.body !== "string" || !parsed.body.trim()) {
    throw new GeminiUnavailableError("Follow-up JSON parse failed");
  }
  const body = trimSms(parsed.body);
  return { body, transferStance: parseReplyFlags(parsed, body, player).transferStance };
}

/** Dopad rozhovoru od trenéra z odpovědi modelu, oříznutý na povolené meze. */
export function coachChatEffect(parsed: { relationship_delta?: unknown; morale_delta?: unknown; summary?: unknown }): {
  relationshipDelta: number; moraleDelta: number; summary: string;
} {
  const num = (v: unknown, lim: number) => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? Math.max(-lim, Math.min(lim, Math.round(n))) || 0 : 0;
  };
  const summary = typeof parsed.summary === "string" && parsed.summary.trim()
    ? parsed.summary.trim().replace(/\s+/g, " ").slice(0, 140)
    : "Popovídali si";
  return {
    relationshipDelta: num(parsed.relationship_delta, COACH_CHAT_MAX_RELATION),
    moraleDelta: num(parsed.morale_delta, COACH_CHAT_MAX_MORALE),
    summary,
  };
}

/**
 * Reakce jednoho hráče na trenérovu zprávu do kabiny.
 *
 * Kabina je skupinový chat, ne rozhovor — proto jedna krátká reakce bez
 * navazování a bez dopadů na hráče. Kdo se ozve, rozhoduje volající.
 */
export async function generateSquadGroupReaction(
  env: ChatEnv,
  player: PlayerSnapshot,
  team: TeamContext,
  coachMessage: string,
  /** Posledních pár replik CHRONOLOGICKY, ve tvaru „TRENÉR: …" / „Jméno: …". */
  historie: string[],
): Promise<string> {
  const system = buildSystemPrompt(player, team);
  const kontext = historie.length > 0
    ? `\nDŘÍVĚJŠÍ HOVOR (jen kontext, NEODPOVÍDEJ na něj a neopakuj ho):\n${historie.join("\n")}`
    : "";

  const prompt = [
    system,
    "",
    `SITUACE: Tohle není SMS, ale SKUPINOVÝ CHAT celé kabiny. Trenér (${team.managerName ?? "trenér"}) je v něm taky a čte to — mluvíš PŘED ním, ne o něm za zády.`,
    kontext,
    "",
    "TRENÉR PRÁVĚ NAPSAL, a ty reaguješ VÝHRADNĚ na tohle:",
    `„${coachMessage}"`,
    "",
    "PRAVIDLA:",
    "- Odpovídej na to, co trenér napsal TEĎ. Starší repliky jsou jen kontext, aby ses neopakoval.",
    "- NEOTVÍREJ znovu témata z dřívějška (přestupy, stará zranění), pokud se na ně trenér neptá.",
    "- Když trenér jen pozdravil nebo napsal něco běžného, odpověz stejně krátce a obyčejně.",
    "  Na „Zdar\" se odpovídá „Zdar trenére\", ne projevem.",
    "- Nikoho neoslovuj jménem, pokud ho trenér nezmínil.",
    "- Trenéra nikdy nekomentuj ve třetí osobě. Když mu chceš něco vzkázat, řekni to jemu.",
    "",
    "Zareaguj jednou krátkou větou, jak by se ozval člověk v partě, souhlas, rýpnutí, vtip, povzdech.",
    "Maximálně 120 znaků. Žádný podpis. Vrať POUZE text.",
  ].filter(Boolean).join("\n");

  const raw = await callModel(env, prompt, { maxTokens: 120, temperature: 1.0 });
  return trimSms(raw);
}

export { GeminiUnavailableError };
