// Popisy taktik a formací — pro tooltipy v lineup composeru.

export type TacticKey = "offensive" | "balanced" | "defensive" | "long_ball" | "possession" | "pressing";

export const TACTIC_INFO: Record<TacticKey, { label: string; description: string }> = {
  offensive: {
    label: "Útočná",
    description: "Posiluje útok (~1.3× šance na gól), oslabuje obranu (~0.8×). Vhodné když potřebuješ vyhrát a máš silnější útok.",
  },
  balanced: {
    label: "Vyrovnaná",
    description: "Bez modifikátorů. Solidní volba při vyrovnaném souboji.",
  },
  defensive: {
    label: "Defenzivní",
    description: "Posiluje obranu (~1.3×), oslabuje útok (~0.8×). Snižuje šance soupeře o ~15 %. Vhodné proti silnějšímu týmu.",
  },
  long_ball: {
    label: "Nakopávané",
    description: "Bonusy pro hlavičky a sílu. Vhodné pro vysoké útočníky, na hrubém pažitu nebo v dešti.",
  },
  possession: {
    label: "Držení míče",
    description: "Bonusy pro techniku a přihrávky. Vyžaduje technicky vyspělé záložníky.",
  },
  pressing: {
    label: "Vysoký presink",
    description: "Bonus pro obranu a získávání míče. Spotřebovává více kondice — vhodné jen pro tým s vysokou výdrží.",
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
