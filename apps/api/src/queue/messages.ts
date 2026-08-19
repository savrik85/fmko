/**
 * Typy zpráv pro Cloudflare Queues.
 *
 * PRAVIDLO: zpráva nese vždy jen ID a herní datum, NIKDY calendarId.
 * Fronty doručují "aspoň jednou" — zpráva může přijít dvakrát. Konzumer si kolo
 * musí sám najít a atomicky zamknout, jinak hrozí zdvojení financí (incident 2026-04).
 * Viz docs/analyza-fronty-2026-08-16.md, riziko 4.1.
 */

/** Zprávy zápasové fronty (MATCH_QUEUE). */
export type MatchQueueMessage =
  | {
      kind: "league_round";
      leagueId: string;
      /** Herní datum v okamžiku zařazení — konzumer ho porovná a zastaralou zprávu zahodí. */
      gameDate: string;
      /** Kdy byla zpráva vyrobena (ISO) — jen pro logy. */
      enqueuedAt: string;
    }
  | {
      kind: "league_maintenance";
      leagueId: string;
      gameDate: string;
      enqueuedAt: string;
    }
  | {
      /** Denní tick pro všechny týmy jedné ligy (finance, trénink, kabina, zprávy). */
      kind: "league_day";
      leagueId: string;
      gameDate: string;
      enqueuedAt: string;
    }
  | {
      /**
       * Zpráva, která vždy selže. Slouží VÝHRADNĚ k ověření retry + DLQ na testingu.
       * Nesahá na herní data — jediný její následek je záznam v queue_failures.
       * Bez ní by se cesta selhání dala testovat jen rozbitím reálné ligy.
       */
      kind: "selftest_fail";
      leagueId: string;
      gameDate: string;
      enqueuedAt: string;
    };

/** Zprávy fronty na AI články (REPORTS_QUEUE). */
export type ReportQueueMessage =
  | {
      kind: "round_report";
      leagueId: string;
      calendarId: string;
      gameWeek: number;
      /** Tabulka PŘED kolem — reportér ji potřebuje pro srovnání. */
      standingsBefore: unknown;
      enqueuedAt: string;
    }
  | {
      kind: "ultras_report";
      calendarId: string;
      enqueuedAt: string;
    }
  | {
      kind: "matchday_preview";
      leagueId: string;
      calendarId: string;
      enqueuedAt: string;
    };

/** Režim zpracování zápasového ticku — přepínač v KV pod klíčem MATCH_TICK_MODE_KEY. */
export type MatchTickMode = "loop" | "queue";

export const MATCH_TICK_MODE_KEY = "match_tick_mode";

/**
 * Načte režim z KV. Default "loop" — dokud se fronta neověří, běží stará cesta.
 * Rollback je přepnutí klíče, ne deploy.
 */
export async function readMatchTickMode(kv: KVNamespace | undefined): Promise<MatchTickMode> {
  if (!kv) return "loop";
  const raw = await kv.get(MATCH_TICK_MODE_KEY).catch((e) => {
    console.warn(JSON.stringify({ level: "warn", mod: "queue", msg: "read match tick mode failed", err: String(e) }));
    return null;
  });
  return raw === "queue" ? "queue" : "loop";
}
