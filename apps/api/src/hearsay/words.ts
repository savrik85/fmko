/**
 * Jak hráč řekne, odkud to ví. Sdílí zpráva „slyšel jsem…“ (messages.ts) i paměť v promptu (prompt.ts).
 * Jména jen v 1. pádě (reference_generovane_ceske_texty), proto „Řekl ti to Radek Šíma (tvůj brácha)“.
 */
import type { HearsayOrigin, KnowledgeVia } from "./types";

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
  competitor: "konkurent na tvém postu",
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

/** Co se hráč doslechl, jednou větou pro model (jména v 1. pádě). */
export function heardFact(o: { origin: HearsayOrigin; quote: string; recipientName: string | null; via: KnowledgeVia; fromName: string | null }): string {
  // Přestup ví celá kabina, zdroj není potřeba. Jen kdo to je.
  if (o.origin === "transfer") {
    return `${o.quote}. ${o.via === "competitor" ? "Hraje na stejném postu jako ty." : `Je to ${viaWord(o.via)}.`}`;
  }
  // Výslovně „přišel jsi“: s „Trenér změnil kapitána: Kapitánem je teď X“ si to model
  // naživo vyložil obráceně („Že jsem už kapitánem?“).
  const what = o.origin === "captain_change" ? `Přišel jsi o kapitánskou pásku. ${o.quote}.`
    : o.origin === "lineup_armband" ? `Na zápas jsi přišel o kapitánskou pásku. ${o.quote}.`
      : o.recipientName ? `Spoluhráč ${o.recipientName} dostal od trenéra SMS, kde o tobě stojí: „${o.quote}“.`
        : `Trenér o tobě napsal: „${o.quote}“.`;
  return `${what} ${sourceSentence(o.via, o.fromName)}`;
}
