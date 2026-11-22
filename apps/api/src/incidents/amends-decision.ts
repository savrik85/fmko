/**
 * Rozhodnutí hry o nápravě (vrátit, zaplatit, opravit) jako pevný pokyn do odpovědi hráče.
 *
 * E2E 22. 11. (Sedlecký, Akcent): na „Ty peníze zaplatíš, rozumíš?“ hra rozhodla „odmítl
 * napravit (šance 78 %)“, odpověď spadla do retry a na druhou výzvu „zaplatíš to, nebo ne?“
 * hráč napsal „Trenére, jo, zaplatím to. Dám to zítra.“ Nezapsalo se nic: trenér četl slib,
 * za kterým ve hře nic nebylo. Fakt „Nechce se ti a vymlouváš se“ ve znalostech model přešel.
 *
 * Teď stejně jako u přemlouvání (messaging/persuasion.ts): restitution.ts rozhodnutí uloží do
 * `life_context.amendsDecision` a model dostane pevný pokyn „Rozhodl ses: …“. Rozhodnutí padá
 * jednou na incident; další výzva (téhož dne i později) dostane stejné rozhodnutí znovu
 * (`repeated`), nový los není. Pokyn platí pro odpověď na výzvu, i opožděnou po výpadku modelu.
 *
 * Lehký modul bez DB: čte ho prompt (ai-player-chat.ts) i snapshot hráče (ai-player-spawn.ts).
 */

/** Rozhodnutí k žádosti trenéra platí pro odpověď na ni, i opožděnou (retry_reply za ~50 min). */
export const AMENDS_DECISION_FRESH_MS = 3 * 3600_000;

export type AmendsDecisionOutcome = "returned" | "paid" | "promised" | "refused";

/** `life_context.amendsDecision`: jak hra rozhodla o poslední žádosti trenéra, ať to napraví. */
export interface AmendsDecision {
  incidentId: string;
  outcome: AmendsDecisionOutcome;
  /** Co trenér chtěl: sloveso do pokynu („vrátíš“, „zaplatíš“, „opravíš“, „vrátíš nebo zaplatíš“). */
  asked: string;
  /** U slibu: úkol a lhůta slovy („nejpozději v sobotu 14. 11.“). */
  task?: "task_return" | "task_repair";
  dueText?: string;
  /** Kdy hra rozhodla (ISO), podle toho pokyn vyprší. */
  at: string;
}

/** Platné (čerstvé) rozhodnutí z `life_context`, jinak undefined. */
export function amendsDecisionFromLife(life: Record<string, unknown>, now: Date = new Date()): AmendsDecision | undefined {
  const d = life.amendsDecision as Partial<AmendsDecision> | undefined;
  if (!d || typeof d.incidentId !== "string" || typeof d.at !== "string" || typeof d.asked !== "string") return undefined;
  if (d.outcome !== "returned" && d.outcome !== "paid" && d.outcome !== "promised" && d.outcome !== "refused") return undefined;
  const at = Date.parse(d.at);
  if (!Number.isFinite(at) || now.getTime() - at > AMENDS_DECISION_FRESH_MS || at - now.getTime() > AMENDS_DECISION_FRESH_MS) return undefined;
  return d as AmendsDecision;
}

/** Pevný pokyn do promptu podle rozhodnutí hry. */
export function amendsDecisionLine(d: AmendsDecision): string {
  switch (d.outcome) {
    case "refused":
      return `- Trenér po tobě chce, ať to ${d.asked}. Rozhodl ses: NEUDĚLÁŠ to. Vymluv se po svém a nic neslibuj: `
        + "nepiš, že to vrátíš, zaplatíš nebo opravíš, ani kdy. Netvrď, že je to vyřízené.";
    case "returned":
      return "- Trenér tě přemluvil a ty jsi to klubu VRÁTIL, už je to zpátky. Mluv o tom jako o hotové věci, nepiš, že to teprve vrátíš.";
    case "paid":
      return "- Trenér tě přemluvil a škodu jsi ZAPLATIL ze svého, je to vyřízené. Mluv o tom jako o hotové věci, nepiš, že to teprve zaplatíš.";
    case "promised":
      return d.task === "task_repair"
        ? `- Trenér chce, ať to opravíš. Rozhodl ses: OPRAVÍŠ to s brigádou ${d.dueText ?? "do dvou dnů"}. Řekni mu to jasně a jiný termín si nevymýšlej.`
        : `- Trenér chce, ať to vrátíš. Rozhodl ses: VRÁTÍŠ to ${d.dueText ?? "do dvou dnů"}. Řekni mu to jasně a jiný termín si nevymýšlej.`;
  }
}
