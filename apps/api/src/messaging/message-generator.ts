/**
 * Generátor automatických zpráv do telefonu.
 * Hráči píšou SMS trenérovi, do skupiny "Kabina" se řeší docházka.
 */

import type { Rng } from "../generators/rng";

// ── Docházka před zápasem (skupinový chat "Kabina") ──

const ATTENDANCE_YES = [
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
];

const ATTENDANCE_LATE = [
  "Přijdu pozdě, mám směnu do 14:00",
  "Dorazím až na druhej poločas, sorry",
  "Budu tam kolem 15:30, jde to?",
  "Přijdu o trochu pozdějc, mám doktora",
  "Přiběhnu rovnou z roboty, možná 10 min zpoždění",
];

const ATTENDANCE_NO = [
  "Sorry, nemůžu. Mám směnu.",
  "Dneska ne, hlídám děti",
  "Bohužel musím na svatbu",
  "Nemůžu, jedu s rodinou pryč",
  "Mám problém se záda, radši vynechám",
  "Odpustíš, šéfe? Mám raut v práci",
  "Nejde to, mám noční",
  "Promiň, slíbil jsem ženě že pomůžu s přestavbou",
  "Dneska fakt nejde, příště určitě",
  "Nepočítej se mnou, rozhodil jsem si koleno",
];

/** Vygeneruje docházkovou zprávu pro hráče */
export function generateAttendanceMessage(
  playerName: string,
  available: boolean,
  condition: number,
  rng: Rng,
): { senderName: string; body: string; metadata: { type: "attendance"; response: "yes" | "no" | "late" } } {
  if (!available) {
    return {
      senderName: playerName,
      body: ATTENDANCE_NO[rng.int(0, ATTENDANCE_NO.length - 1)],
      metadata: { type: "attendance", response: "no" },
    };
  }
  // 15% šance na zpoždění
  if (rng.int(0, 100) < 15) {
    return {
      senderName: playerName,
      body: ATTENDANCE_LATE[rng.int(0, ATTENDANCE_LATE.length - 1)],
      metadata: { type: "attendance", response: "late" },
    };
  }
  return {
    senderName: playerName,
    body: ATTENDANCE_YES[rng.int(0, ATTENDANCE_YES.length - 1)],
    metadata: { type: "attendance", response: "yes" },
  };
}

// ── Zprávy od hráčů 1:1 ──

const PLAYER_MORALE_LOW = [
  "Šéfe, nějak mě to nebaví. Pořád sedím na lavičce.",
  "Chtěl bych hrát víc, cítím se připravenej.",
  "Dneska jsem měl špatnej den. Snad to bude lepší.",
  "Přemýšlím, jestli mám vůbec chodit na tréninky...",
  "Nálada v kabině je dole. Musíme s tím něco udělat.",
];

const PLAYER_MORALE_HIGH = [
  "Šéfe, cítím se skvěle! Těším se na zápas! 🔥",
  "Dneska na tréninku jsem dal všechno. Forma je dobrá.",
  "Myslím že jsme silnější než loni. Dáme to!",
  "Díky za šanci, nezklamů!",
];

const PLAYER_INJURY = [
  "Šéfe, zranil jsem se na tréninku. Doktor říká {days} dní pauza.",
  "Mám natažený sval, asi {days} dní budu mimo.",
  "Podvrtl jsem si kotník, {days} dní to potrvá.",
  "Potáhlo mě v zádech, doktor doporučil {days} dní klid.",
];

const POST_WIN = [
  "Super zápas! Piva jsou na mě! 🍺",
  "To byla pecka! Kluci makali jako šílený.",
  "Konečně výhra! Takhle dál!",
  "Porazili jsme je! Musíme slavit.",
  "Šéfe, dneska to klaplo na jedničku 👏",
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
  "🗓️ ZÁPAS: {opponent} — {when}. Kdo může? Napište!",
  "📋 Docházka na {when} vs {opponent} — potvrďte účast!",
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
