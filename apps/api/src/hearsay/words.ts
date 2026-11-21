/**
 * Jak hráč řekne, odkud to ví. Sdílí zpráva „slyšel jsem…“ (messages.ts) i paměť v promptu (prompt.ts).
 * Jména jen v 1. pádě (reference_generovane_ceske_texty), proto „Řekl ti to Radek Šíma (tvůj brácha)“.
 */
import type { KnowledgeVia } from "./types";

const VIA_WORDS: Record<KnowledgeVia, string> = {
  direct: "trenér to napsal přímo jemu",
  squad_chat: "trenér to napsal do kabiny",
  teammate: "spoluhráč",
  pub: "v hospodě se o tom mluvilo",
  brothers: "tvůj brácha",
  father_son: "z rodiny",
  in_laws: "švagr",
  classmates: "spolužák",
  coworkers: "kolega z práce",
  neighbors: "soused",
  drinking_buddies: "kámoš od piva",
  rivals: "ten, kdo tě nemusí",
  mentor_pupil: "parťák, se kterým trénuješ",
};

export function viaWord(via: KnowledgeVia): string {
  return VIA_WORDS[via] ?? "spoluhráč";
}

/** „Řekl ti to Radek Šíma (tvůj brácha).“ / „Řekl ti to v hospodě Radek Šíma.“ */
export function sourceSentence(via: KnowledgeVia, fromName: string | null): string {
  if (!fromName) return via === "pub" ? "V hospodě se o tom mluvilo." : "Kluci to říkali.";
  if (via === "pub") return `Řekl ti to v hospodě ${fromName}.`;
  return `Řekl ti to ${fromName} (${viaWord(via)}).`;
}
