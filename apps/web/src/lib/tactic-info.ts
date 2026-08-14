// Popisy taktik a formací — pro tooltipy v lineup composeru.

export type TacticKey = "offensive" | "balanced" | "defensive" | "long_ball" | "possession" | "pressing";

export const TACTIC_INFO: Record<TacticKey, { label: string; description: string }> = {
  offensive: {
    label: "Útočná",
    description: "Útok +15 %, obrana −15 %, o něco víc vytvořených šancí. Vhodné, když potřebuješ vyhrát a máš silnější útok. Naplno se projeví, jen když na ni máš hráče — rychlé a střelecky slušné útočníky.",
  },
  balanced: {
    label: "Vyrovnaná",
    description: "Bez modifikátorů — nic neposiluje ani neoslabuje. Solidní volba při vyrovnaném souboji.",
  },
  defensive: {
    label: "Defenzivní",
    description: "Obrana +15 %, útok −25 % a výrazně méně vlastních šancí. Umí ale chytit soupeře na protiútoku. Vhodné proti silnějšímu týmu.",
  },
  long_ball: {
    label: "Nakopávané",
    description: "Mírně posiluje útok. Odměňuje vysoké a silné útočníky s dobrou hlavou; v dešti a ve větru se vyplatí nejvíc.",
  },
  possession: {
    label: "Držení míče",
    description: "Útok +5 % a nejvíc vytvořených šancí ze všech taktik. Vyžaduje technicky vyspělé záložníky s přehledem — bez nich je to spíš postih.",
  },
  pressing: {
    label: "Vysoký presink",
    description: "Útok i obrana +8 %. Spotřebovává o 30 % víc kondice — vhodné jen pro tým s vysokou výdrží a pracovitostí.",
  },
};

export const FORMATION_INFO: Record<string, { label: string; description: string; style: "offensive" | "balanced" | "defensive" }> = {
  "4-4-2": {
    label: "4-4-2",
    description: "Klasická vyrovnaná formace. 4 obránci, 4 záložníci, 2 útočníci.",
    style: "balanced",
  },
  "4-3-3": {
    label: "4-3-3",
    description: "Útočná formace s 3 útočníky a širokým útokem. Vyžaduje rychlá křídla.",
    style: "offensive",
  },
  "3-5-2": {
    label: "3-5-2",
    description: "Záloha dominuje — 5 záložníků. Vhodné pro držení míče a tlak ve středu.",
    style: "balanced",
  },
  "4-5-1": {
    label: "4-5-1",
    description: "Hluboká záloha s jedním osamoceným útočníkem. Defenzivní volba.",
    style: "defensive",
  },
  "5-3-2": {
    label: "5-3-2",
    description: "Defenzivní formace s 5 obránci. Vhodné proti silnému soupeři, plus rychlé protiútoky.",
    style: "defensive",
  },
  "3-4-3": {
    label: "3-4-3",
    description: "Velmi útočná formace. 3 útočníci a jen 3 obránci — riskantní, ale efektivní proti slabšímu soupeři.",
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
    description: "Nikdo se nepere, hraje se na míč. O třetinu míň faulů a skoro polovina karet — soupeř za to má víc prostoru. Volba, když máš půl kádru na kartách nebo tenkou lavičku.",
  },
  normal: {
    label: "Normálně",
    icon: "⚽",
    description: "Jak to přijde. Žádný modifikátor — výchozí nastavení.",
  },
  hard: {
    label: "Do těla",
    icon: "💪",
    description: "Souboje se hrají naostro. Zpevní obranu, vyrobí protiútoky a technickému soupeři podlomí koleno — zaplatíš to fauly, kartami a zraněními. Proti přísnému sudímu sebevražda, proti benevolentnímu zlato. Funguje jen s agresivním a silným kádrem.",
  },
};

export function getHardnessTooltip(key: HardnessKey): string {
  const info = HARDNESS_INFO[key];
  if (!info) return "";
  return `${info.label} — ${info.description}`;
}
