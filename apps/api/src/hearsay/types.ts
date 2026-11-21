/**
 * Kabina má uši: typy vrstvy „kdo co ví“ (spec docs/superpowers/specs/2026-11-21-squad-ripple-conversations-design.md).
 *
 * Věc (`HearsayItem`) je to, co se o hráči (`subjectPlayerId`) může roznést: co o něm trenér
 * napsal jinému hráči nebo do kabiny. Znalost (`HearsayKnowledge`) říká, kdo ji ví, od koho a jak.
 */

export type HearsayKind = "praise" | "criticism" | "decision_against" | "decision_for";

export type HearsayOrigin = "coach_sms" | "coach_squad" | "captain_change" | "lineup_armband";

/**
 * Jak se to hráč dozvěděl. `direct` = trenér to napsal jemu, `squad_chat` = trenér to napsal
 * do kabiny, `teammate` = od spoluhráče bez vazby, `pub` = v hospodě, jinak typ vazby
 * (`relationships.type`), přes kterou se to k němu dostalo.
 */
export type KnowledgeVia = "direct" | "squad_chat" | "teammate" | "pub"
  | "brothers" | "father_son" | "in_laws" | "classmates" | "coworkers" | "neighbors"
  | "drinking_buddies" | "rivals" | "mentor_pupil";

/** Stav zprávy „slyšel jsem…“ u dotčeného hráče. */
export type MessageState = "none" | "pending" | "sent" | "skipped" | "expired";

export interface HearsayItem {
  id: string;
  clubTeamId: string;
  subjectPlayerId: string;
  kind: HearsayKind;
  origin: HearsayOrigin;
  recipientPlayerId: string | null;
  conversationId: string | null;
  quote: string;
  createdAt: string;
  expiresAt: string;
}

export interface HearsayKnowledge {
  hearsayId: string;
  playerId: string;
  via: KnowledgeVia;
  fromPlayerId: string | null;
  learnedAt: string;
  messageState: MessageState;
  messagedAt: string | null;
}

/** Jak dlouho si to hráči pamatují. */
export const HEARSAY_TTL_DAYS = 21;
/** Jak dlouho se o tom ještě mluví (šíří se). */
export const SPREAD_WINDOW_DAYS = 7;

export const DAY_MS = 86_400_000;
