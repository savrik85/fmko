/**
 * Co hráč ví o tom, co trenér o kom řekl, do promptu (spec část 3: „pamatuje si to“).
 * Načítá `loadChatMemory` (messaging/player-memory.ts), vypisuje `memoryPromptLines`.
 */
import type { HearsayKind, HearsayOrigin, KnowledgeVia } from "./types";
import { heardFact, sourceSentence } from "./words";

export interface HearsayMemoryLine {
  aboutMe: boolean;
  origin: HearsayOrigin;
  subjectName: string;
  recipientName: string | null;
  quote: string;
  kind: HearsayKind;
  via: KnowledgeVia;
  fromName: string | null;
  learnedAt: string;
}

const MAX_LINES = 3;

function line(l: HearsayMemoryLine): string {
  if (l.aboutMe) {
    if (l.via === "squad_chat") return `- Trenér o tobě napsal do kabiny před všemi: „${l.quote}“.`;
    if (l.origin === "transfer") return `- PŘESTUP, KTERÝ SE TĚ TÝKÁ: ${heardFact({ origin: l.origin, quote: l.quote, recipientName: null, via: l.via, fromName: null })}`;
    return `- VÍŠ, CO O TOBĚ TRENÉR ŘÍKAL: ${heardFact({ origin: l.origin, quote: l.quote, recipientName: l.recipientName, via: l.via, fromName: l.fromName })}`;
  }
  if (l.via === "direct") return `- Trenér ti napsal o spoluhráči (${l.subjectName}): „${l.quote}“.`;
  if (l.via === "squad_chat") return `- Trenér napsal do kabiny o spoluhráči (${l.subjectName}): „${l.quote}“.`;
  return `- Doslechl ses, co trenér napsal o spoluhráči (${l.subjectName}): „${l.quote}“. ${sourceSentence(l.via, l.fromName)}`;
}

export function hearsayPromptLines(lines: HearsayMemoryLine[] | undefined): string[] {
  if (!lines || lines.length === 0) return [];
  const ordered = [...lines].sort((a, b) => Number(b.aboutMe) - Number(a.aboutMe) || b.learnedAt.localeCompare(a.learnedAt));
  return [
    ...ordered.slice(0, MAX_LINES).map(line),
    "- Nic dalšího o tom, co kdo o kom říkal, si nevymýšlej. Když se trenér zeptá, od koho to víš, řekni pravdu.",
  ];
}

/**
 * Co hráč ví (nejvýš pět posledních věcí) i se jmény v 1. pádě. Jména jen hráčů, kteří jsou
 * pořád v klubu: prompt jiná jména zakazuje. Věc o hráči, který odešel, vypadne celá.
 */
export async function loadHearsayMemory(
  db: D1Database,
  playerId: string,
  teamId: string,
  now: Date = new Date(),
): Promise<HearsayMemoryLine[]> {
  const { loadPlayerHearsay } = await import("./store");
  // Jen věci z klubu, kterému hráč teď píše. Po přestupu by jinak novému trenérovi (jinému
  // hráči hry) vyklopil, co o kom psal ten bývalý.
  const club = await db.prepare("SELECT COALESCE(parent_team_id, id) AS id FROM teams WHERE id = ?").bind(teamId).first<{ id: string }>();
  if (!club) return [];
  const known = (await loadPlayerHearsay(db, playerId, now)).filter((k) => k.clubTeamId === club.id);
  if (known.length === 0) return [];
  const ids = [...new Set(known.flatMap((k) => [k.subjectPlayerId, k.recipientPlayerId, k.knowledge.fromPlayerId]).filter((x): x is string => !!x))];
  const names = await db.prepare(
    `SELECT p.id, p.first_name, p.last_name FROM players p JOIN teams t ON t.id = p.team_id
      WHERE p.id IN (${ids.map(() => "?").join(",")})
        AND COALESCE(t.parent_team_id, t.id) = (SELECT COALESCE(parent_team_id, id) FROM teams WHERE id = ?)`,
  ).bind(...ids, teamId).all<{ id: string; first_name: string; last_name: string }>();
  const name = (id: string | null) => {
    const p = id ? names.results.find((n) => n.id === id) : undefined;
    return p ? `${p.first_name} ${p.last_name}` : null;
  };
  return known.flatMap((k): HearsayMemoryLine[] => {
    const subjectName = name(k.subjectPlayerId);
    if (!subjectName) return [];
    return [{
      aboutMe: k.subjectPlayerId === playerId, origin: k.origin, subjectName, recipientName: name(k.recipientPlayerId),
      quote: k.quote, kind: k.kind, via: k.knowledge.via, fromName: name(k.knowledge.fromPlayerId), learnedAt: k.knowledge.learnedAt,
    }];
  });
}
