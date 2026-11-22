/**
 * Generátor automatických zpráv do telefonu.
 * Hráči píšou SMS trenérovi, do skupiny "Kabina" se řeší docházka.
 */

import type { Rng } from "../generators/rng";
import { seedFromString } from "../lib/seed";

// ── Docházka před zápasem (skupinový chat "Kabina") ──
//
// Pooly pokryjí i 35členný kádr bez opakování (final3, ticky 2. a 4. 12.: FC AppYours Čkyně
// s 31 hráči měla v kabině jen 24 různých vět, „Jo, dorazím i s kopačkama“ 3×).

export const ATTENDANCE_YES: readonly string[] = [
  "Jsem tam! 💪",
  "Počítejte se mnou",
  "Dorazím",
  "Jasně, přijdu",
  "V pohodě, budu",
  "Jo, jsem fit",
  "Na místě budu v čas",
  "Přijdu rovnou z práce",
  "Budu tam, klidně od začátku",
  "Ano, těším se",
  "Jdu do toho",
  "Budu tam včas",
  "Jo, přijedu",
  "Hlásím se, jsem k dispozici",
  "Jasný, jdu hrát",
  "Nohy jsou v pohodě, budu",
  "Přijdu, už se těším",
  "Beru, budu tam",
  "Jo, dorazím i s kopačkama",
  "Tady, jsem připravenej",
  "Jsem v pohodě, přijdu",
  "Budu tam o půl hodiny dřív",
  "Přijdu, kopačky už mám v tašce",
  "Platí, dorazím",
  "Jo, s tím počítám",
  "Jasně, tohle si nenechám ujít",
  "Budu, zítra to rozbalíme 🔥",
  "Přijedu i se švagrem, bude fandit",
  "Jdu, už se nemůžu dočkat",
  "Budu tam, hlava je v pohodě",
  "Jo, přijdu i na rozcvičku",
  "Přijdu, tentokrát to dáme",
  "Zítra jsem k mání",
  "Počítám s tím, budu",
  "Dorazím autem, můžu někoho svézt",
  "Budu, ať to stojí za to 💪",
  "Přijdu, ať nás je dost",
  "Dorazím, máte mě",
  "Jsem nachystanej, budu tam",
  "Zítra nechybím",
];

export const ATTENDANCE_LATE: readonly string[] = [
  "Přijdu pozdě, mám směnu do 14:00",
  "Dorazím až na druhej poločas, sorry",
  "Budu tam kolem 15:30, jde to?",
  "Přijdu o trochu pozdějc, mám doktora",
  "Přiběhnu rovnou z roboty, možná 10 min zpoždění",
  "Dorazím trochu později, vezu babičku z nemocnice",
  "Přijedu na poslední chvíli, v práci končím v půl",
  "Budu tam, jen nestihnu úvodní poradu",
  "Přijdu, ale až po rozcvičce, mám služebku",
  "Dorazím s menším zpožděním, autobus jede pozdějc",
  "Budu tam, jen o čtvrt hodiny později",
];

export const ATTENDANCE_NO: readonly string[] = [
  "Sorry, nemůžu. Mám směnu.",
  "Dneska ne, hlídám děti",
  "Bohužel musím na svatbu",
  "Nemůžu, jedu s rodinou pryč",
  "Mám problém se záda, radši vynechám",
  "Odpustíš, trenére? Mám raut v práci",
  "Nejde to, mám noční",
  "Promiň, slíbil jsem ženě že pomůžu s přestavbou",
  "Dneska fakt nejde, příště určitě",
  "Nepočítej se mnou, rozhodil jsem si koleno",
  "Zítra nemůžu, jsem na školení",
  "Bohužel, máme v práci inventuru",
  "Musím k zubaři, nejde to",
  "Jedu za mámou do nemocnice, sorry",
  "Zítra to nedám, stěhujeme bráchu",
];

/**
 * Citoslovce a oslovení na začátek věty, když už v kabině padla doslova (`varyLine`). Jen takové,
 * které sednou k „přijdu“ i k omluvence („Hele, musím do práce…“), žádné „jasně“ ani 👍.
 */
const VARY_PREFIXES = ["Jo, ", "No, ", "Hele, ", "Tak ", "Kluci, ", "Trenére, "] as const;
/** Oslovení na konec věty, jen za písmeno (ne za tečku nebo emoji). */
const VARY_SUFFIXES = [", trenére", ", kluci"] as const;

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/**
 * Věta, která v kabině už padla, s drobnou obměnou (citoslovce nebo oslovení navíc), ať tam dva
 * hráči nenapíšou doslova totéž. Bez losu: stejná věta a stejné zabrané věty dají stejnou obměnu.
 * Oslovení „trenére“ se nepřidá do věty, která ho už má, a citoslovce, kterým věta začíná, taky ne.
 */
export function varyLine(text: string, taken: ReadonlySet<string>): string {
  const lower = text.toLowerCase();
  const hasCoach = lower.includes("trenér");
  const prefixes = VARY_PREFIXES.filter((p) => !(hasCoach && p.startsWith("Trenér")) && !lower.startsWith(p.trim().replace(",", "").toLowerCase()));
  const suffixes = /\p{L}$/u.test(text) ? VARY_SUFFIXES.filter((x) => !(hasCoach && x.includes("trenér"))) : [];
  const candidates = [...prefixes.map((p) => p + lowerFirst(text)), ...suffixes.map((x) => text + x)];
  const start = candidates.length > 0 ? seedFromString(text) % candidates.length : 0;
  for (let k = 0; k < candidates.length; k++) {
    const c = candidates[(start + k) % candidates.length];
    if (!taken.has(c)) return c;
  }
  // Všechny jednoduché obměny zabrané (kabina o desítkách stejných vět): citoslovce i oslovení.
  for (const p of prefixes) for (const x of VARY_SUFFIXES) {
    const c = /\p{L}$/u.test(text) ? p + lowerFirst(text) + x : p + lowerFirst(text);
    if (!taken.has(c)) return c;
  }
  return text;
}

/**
 * Věta z poolu podle losu, a když ji v téhle kabině už někdo napsal (`used`), nejbližší další,
 * kterou ještě ne, pak z náhradních poolů (`spare`, třeba „přijdu“ místo „přijdu pozdě“). Když
 * dojdou všechny, obměna (`varyLine`). Los se volá pořád jednou, ať se nezmění, co dál vychází
 * ze stejného semínka.
 */
function pickUnused(pool: readonly string[], rng: Rng, used?: Set<string>, spare: readonly (readonly string[])[] = []): string {
  const start = rng.int(0, pool.length - 1);
  if (!used) return pool[start];
  for (const list of [pool, ...spare]) {
    for (let k = 0; k < list.length; k++) {
      const text = list[(start + k) % list.length];
      if (!used.has(text)) {
        used.add(text);
        return text;
      }
    }
  }
  const varied = varyLine(pool[start], used);
  used.add(varied);
  return varied;
}

/**
 * Vygeneruje docházkovou zprávu pro hráče. `used`: věty, které v kabině zápasu už padly
 * (sdílená sada pro celou kabinu), ať tam dva hráči nenapíšou totéž.
 */
export function generateAttendanceMessage(
  playerName: string,
  available: boolean,
  condition: number,
  rng: Rng,
  used?: Set<string>,
): { senderName: string; body: string; metadata: { type: "attendance"; response: "yes" | "no" | "late" } } {
  if (!available) {
    return {
      senderName: playerName,
      body: pickUnused(ATTENDANCE_NO, rng, used),
      metadata: { type: "attendance", response: "no" },
    };
  }
  // 15% šance na zpoždění
  if (rng.int(0, 100) < 15) {
    return {
      senderName: playerName,
      body: pickUnused(ATTENDANCE_LATE, rng, used, [ATTENDANCE_YES]),
      metadata: { type: "attendance", response: "late" },
    };
  }
  return {
    senderName: playerName,
    body: pickUnused(ATTENDANCE_YES, rng, used),
    metadata: { type: "attendance", response: "yes" },
  };
}

/** Hráč v kabině zápasu den předem: přijde, nebo ne, a jestli má vlastní text. */
export interface SquadChatAttendee {
  name: string;
  available: boolean;
  condition: number;
  /** Vlastní text: omluvenka z losu (`generateAbsences`) nebo slib ze SMS. */
  ownText?: string;
}

/**
 * Věty den před zápasem do kabiny zápasu, jedna na hráče v pořadí kádru. Obecná věta („Jsem
 * tam!“) nezopakuje vlastní text nikoho jiného ani jinou obecnou; vlastní text (omluvenka, slib),
 * který už v kabině padl, dostane obměnu (`varyLine`). final3 (ticky 2. a 4. 12.): v Jitoně 2×
 * „Musím do práce, nemůžu přijít“, omluvenky se mezi sebou nehlídaly.
 *
 * Los se volá pro každého hráče stejně jako dřív (i pro toho s vlastním textem): kdo je omluvený,
 * rozhodl `generateAbsences` předem, tady se mění jen text. Stejné semínko = stejné věty.
 */
export function dayBeforeSquadLines(attendees: readonly SquadChatAttendee[], rng: Rng): string[] {
  const used = new Set(attendees.flatMap((a) => (a.ownText ? [a.ownText] : [])));
  const posted = new Set<string>();
  return attendees.map((a) => {
    const generic = generateAttendanceMessage(a.name, a.available, a.condition, rng, a.ownText ? undefined : used).body;
    let text = a.ownText ?? generic;
    if (posted.has(text)) {
      text = varyLine(text, new Set([...used, ...posted]));
      used.add(text);
    }
    posted.add(text);
    return text;
  });
}

// ── Zprávy od hráčů 1:1 ──

const PLAYER_MORALE_LOW = [
  "Trenére, nějak mě to nebaví. Pořád sedím na lavičce.",
  "Chtěl bych hrát víc, cítím se připravenej.",
  "Dneska jsem měl špatnej den. Snad to bude lepší.",
  "Přemýšlím, jestli mám vůbec chodit na tréninky...",
  "Nálada v kabině je dole. Musíme s tím něco udělat.",
];

const PLAYER_MORALE_HIGH = [
  "Trenére, cítím se skvěle! Těším se na zápas! 🔥",
  "Dneska na tréninku jsem dal všechno. Forma je dobrá.",
  "Myslím že jsme silnější než loni. Dáme to!",
  "Díky za šanci, nezklamů!",
];

const PLAYER_INJURY = [
  "Trenére, zranil jsem se na tréninku. Doktor říká {days} dní pauza.",
  "Mám natažený sval, asi {days} dní budu mimo.",
  "Podvrtl jsem si kotník, {days} dní to potrvá.",
  "Potáhlo mě v zádech, doktor doporučil {days} dní klid.",
];

const POST_WIN = [
  "Super zápas! Piva jsou na mě! 🍺",
  "To byla pecka! Kluci makali jako šílený.",
  "Konečně výhra! Takhle dál!",
  "Porazili jsme je! Musíme slavit.",
  "Trenére, dneska to klaplo na jedničku 👏",
];

const POST_LOSS = [
  "To byla hrůza. Musíme přidat.",
  "Příště to dáme, hlavu vzhůru.",
  "Škoda, měli jsme šance. Chyběl nám kousek štěstí.",
  "Nejsem z toho nadšenej, ale jedeme dál.",
  "Musíme víc trénovat, tohle nestačí.",
];

const POST_DRAW = [
  "Remíza... mohlo to být i lepší.",
  "Škoda, bod se ale hodí.",
  "Neprohráli jsme, to se počítá.",
  "Byli jsme lepší, škoda že to tam nepadlo.",
];

const RANDOM_CHAT = [
  "Byl jsem včera na rybach, chytil jsem kapra! 🐟",
  "Viděl jsi ten zápas v televizi? To byl gól!",
  "Kluci říkali že jdou v pátek do hospody, jdeš taky?",
  "Moje ženská říká ať s tím fotbalem přestanu. 😅",
  "Slyšel jsem že {rivalTeam} přivedli nového útočníka.",
  "Nemáš tip na dobrýho fyzioterapeuta?",
  "Schody po včerejšku mi dělaj problém 😂",
  "Počasí je na hov*o, snad se hřiště nezalije.",
];

export interface PlayerMessage {
  trigger: "morale_low" | "morale_high" | "injury" | "post_win" | "post_loss" | "post_draw" | "random";
  body: string;
}

export function generatePlayerMessage(
  trigger: PlayerMessage["trigger"],
  rng: Rng,
  context?: { days?: number; rivalTeam?: string },
): string {
  let pool: string[];
  switch (trigger) {
    case "morale_low": pool = PLAYER_MORALE_LOW; break;
    case "morale_high": pool = PLAYER_MORALE_HIGH; break;
    case "injury": pool = PLAYER_INJURY; break;
    case "post_win": pool = POST_WIN; break;
    case "post_loss": pool = POST_LOSS; break;
    case "post_draw": pool = POST_DRAW; break;
    case "random": pool = RANDOM_CHAT; break;
  }
  let msg = pool[rng.int(0, pool.length - 1)];
  if (context?.days) msg = msg.replace("{days}", String(context.days));
  if (context?.rivalTeam) msg = msg.replace("{rivalTeam}", context.rivalTeam);
  return msg;
}

// ── Skupinové zprávy (Kabina) ──

const GROUP_POST_WIN = [
  "VÝHRA! 🎉🎉🎉",
  "Kluci, dneska to bylo super!",
  "Tak to se slaví! Kdo jde do hospody?",
  "3 body v kapse! 💪",
];

const GROUP_POST_LOSS = [
  "Hlavu vzhůru, příště to dáme.",
  "Musíme přidat na trénincích...",
  "Nebudem se v tom babrat, jedeme dál.",
];

const GROUP_EVENT = [
  "Kdo jde na zabijačku? 🐷",
  "Páteční trénink bude ve 4, ne v 5!",
  "Kdo má ještě dresy z minulýho zápasu? Vraťte to!",
  "Příští týden jedeme autobusem, sraz v 13:00 u hospody.",
];

const GROUP_ATTENDANCE_PROMPT = [
  "🗓️ ZÁPAS: {opponent}, {when}. Kdo může? Napište!",
  "📋 Docházka na {when} vs {opponent}, potvrďte účast!",
  "⚽ {when} hrajeme s {opponent}. Kdo dorazí?",
];

export function generateGroupMessage(
  trigger: "post_win" | "post_loss" | "event" | "attendance_prompt",
  rng: Rng,
  context?: { opponent?: string; when?: string },
): string {
  let pool: string[];
  switch (trigger) {
    case "post_win": pool = GROUP_POST_WIN; break;
    case "post_loss": pool = GROUP_POST_LOSS; break;
    case "event": pool = GROUP_EVENT; break;
    case "attendance_prompt": pool = GROUP_ATTENDANCE_PROMPT; break;
  }
  let msg = pool[rng.int(0, pool.length - 1)];
  if (context?.opponent) msg = msg.replace("{opponent}", context.opponent);
  if (context?.when) msg = msg.replace("{when}", context.when);
  return msg;
}

// ── Zprávy od soupeřových manažerů ──

const MANAGER_PRE_MATCH = [
  "Hodně štěstí v zápase! Snad to bude férový.",
  "Těšíme se na zápas, připravte se!",
  "Doufám že se potkáme na hřišti v plný síle.",
];

const MANAGER_POST_WIN_THEM = [
  "Gratuluju k výhře, zasloužili jste si to.",
  "Dobrý zápas, příště vás porazíme!",
  "Silný výkon, uznávám.",
];

const MANAGER_POST_LOSS_THEM = [
  "Měli jsme den... příště to bude jiný.",
  "No, mohlo to dopadnout i hůř 😅",
  "Příští zápas bude náš!",
];

const MANAGER_TRANSFER_OFFER = [
  "Ahoj, zajímal by mě tvůj hráč {player}. Měl bys zájem o jednání?",
  "Slyšel jsem že {player} není úplně spokojený. Co kdybysme se domluvili?",
  "Nechceš prodat {player}? Zaplatím slušně.",
];

const MANAGER_FRIENDLY = [
  "Nechceš v sobotu přátelák? Potřebujeme rozehrát nové kluky.",
  "Co takhle přátelský zápas příští týden?",
  "Nemáš chuť na přátelák? Bylo by to dobré pro oba.",
];

export function generateManagerMessage(
  trigger: "pre_match" | "post_win" | "post_loss" | "transfer_offer" | "friendly",
  rng: Rng,
  context?: { player?: string },
): string {
  let pool: string[];
  switch (trigger) {
    case "pre_match": pool = MANAGER_PRE_MATCH; break;
    case "post_win": pool = MANAGER_POST_WIN_THEM; break;
    case "post_loss": pool = MANAGER_POST_LOSS_THEM; break;
    case "transfer_offer": pool = MANAGER_TRANSFER_OFFER; break;
    case "friendly": pool = MANAGER_FRIENDLY; break;
  }
  let msg = pool[rng.int(0, pool.length - 1)];
  if (context?.player) msg = msg.replace("{player}", context.player);
  return msg;
}
