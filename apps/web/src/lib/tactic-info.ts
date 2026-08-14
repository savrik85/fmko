// Popisy taktik a formací — pro tooltipy v lineup composeru.

export type TacticKey = "offensive" | "balanced" | "defensive" | "long_ball" | "possession" | "pressing";

export const TACTIC_INFO: Record<TacticKey, { label: string; description: string }> = {
  offensive: {
    label: "Útočná",
    description: "Všechno dopředu, vzadu zůstane tenko. Když potřebuješ tři body a máš vepředu koho poslat, dává to smysl. Bez rychlých a střelecky slušných útočníků z toho ale nic nebude.",
  },
  balanced: {
    label: "Vyrovnaná",
    description: "Poctivý okresní fotbal. Nic se nepřehání dopředu ani dozadu — rozumná volba, když je soupeř na papíře stejně daleko jako ty.",
  },
  defensive: {
    label: "Defenzivní",
    description: "Zatáhnete se před vlastní vápno a čekáte na brejk. Vepředu toho moc nevytvoříte, zato se přes vás tak snadno neprojde. Klasika na favorita.",
  },
  long_ball: {
    label: "Nakopávané",
    description: "Míč nakopnout dopředu a doufat v hlavu. Chce to vysoké a silné útočníky; v dešti a ve větru, kdy kombinace stejně nedrží, je to nejrozumnější volba.",
  },
  possession: {
    label: "Držení míče",
    description: "Míč si necháte a soupeř běhá. Vytvoříte nejvíc příležitostí ze všech taktik — ale jen když máš ve středu hráče, co umí přihrát. Bez nich to skončí ztrátou na vlastní půlce.",
  },
  pressing: {
    label: "Vysoký presink",
    description: "Napadáte soupeře hned u jeho vápna a nenecháte ho vydechnout. Sebere to ale spoustu sil — po hodině hry to poznáš. Jen pro mužstvo, které to uběhá.",
  },
};

export const FORMATION_INFO: Record<string, { label: string; description: string; style: "offensive" | "balanced" | "defensive" }> = {
  "4-4-2": {
    label: "4-4-2",
    description: "Klasika, na které stojí půlka okresu. Čtyři vzadu, čtyři v řadě, dva na hrotu — nikde díra, nikde přebytek.",
    style: "balanced",
  },
  "4-3-3": {
    label: "4-3-3",
    description: "Tři nahoře a hra do šířky. Bez rychlých krajních hráčů se z toho stane běhání naprázdno.",
    style: "offensive",
  },
  "3-5-2": {
    label: "3-5-2",
    description: "Pět v záloze, střed hřiště je váš. Míč se přes vás nedostane — ale vzadu jsou jen tři a krajní obránce nikdo nezaskočí.",
    style: "balanced",
  },
  "4-5-1": {
    label: "4-5-1",
    description: "Devět hráčů před vlastním vápnem a jeden vpředu, ať má kdo podržet míč. Nudné, ale funguje.",
    style: "defensive",
  },
  "5-3-2": {
    label: "5-3-2",
    description: "Pět vzadu, beton a rychlý výpad. Proti silnějšímu soupeři nejjistější způsob, jak zůstat ve hře.",
    style: "defensive",
  },
  "3-4-3": {
    label: "3-4-3",
    description: "Tři vzadu, tři vpředu, žádné brzdy. Proti slabšímu soupeři pastva pro oči, proti silnějšímu debakl.",
    style: "offensive",
  },
};

export function getTacticTooltip(key: TacticKey): string {
  const info = TACTIC_INFO[key];
  if (!info) return "";
  return `${info.label} — ${info.description}`;
}

export function getFormationTooltip(key: string): string {
  const info = FORMATION_INFO[key];
  if (!info) return key;
  return `${info.label} — ${info.description}`;
}

// ── Tvrdost hry ──

export type HardnessKey = "fair" | "normal" | "hard";

export const HARDNESS_INFO: Record<HardnessKey, { label: string; icon: string; description: string }> = {
  fair: {
    label: "Na férovku",
    icon: "🤝",
    description: "Hraje se na míč, ne na nohy. Sudí nemá co pískat a z kabiny odejdou všichni po svých — jenže soupeř dostane v soubojích prostor, který mu jinak nedáš. Volba na kolo, kdy máš půlku mužstva na kartách a na lavičce dva dorostence.",
  },
  normal: {
    label: "Normálně",
    icon: "⚽",
    description: "Nikdo nikoho nešetří, ale ani nekosí. Jak to v okrese chodí.",
  },
  hard: {
    label: "Do těla",
    icon: "💪",
    description: "Do soubojů se chodí naplno a nohu nikdo nestahuje. Soupeř se do vápna prokousává hůř, po odebraných míčích létáte do brejků a technickému mužstvu se proti vám hrát nechce. Zaplatíš to kartami, stopkami a marodkou. U benevolentního sudího zlato, u přísného cesta do deseti — a funguje to jen s partou, která na to má postavu i povahu.",
  },
};

export function getHardnessTooltip(key: HardnessKey): string {
  const info = HARDNESS_INFO[key];
  if (!info) return "";
  return `${info.label} — ${info.description}`;
}
