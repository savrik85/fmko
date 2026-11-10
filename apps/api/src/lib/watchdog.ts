/**
 * Hlídač zpracování.
 *
 * Cloudflare umí poslat upozornění, když Worker vyhodí chybu. Neumí ale
 * upozornit na TICHO — a „zápasový tick vůbec neproběhl" nebo „nedohraná kola
 * se hromadí" žádnou výjimku nevyhodí. Přesně tyhle případy jsou přitom
 * nejzákeřnější: hra se tváří, že běží, jen se v ní nic neděje.
 *
 * Hlídač proto sám kontroluje, co se DĚLO, ne co spadlo. Když najde problém:
 *   1. zaloguje ho jako `console.error` s výrazným prefixem — tím ho zachytí
 *      Workers Logs i případné upozornění Cloudflare na chyby
 *   2. pošle notifikaci adminům (mají push subscriptions jako každý manažer)
 */

import type { Bindings } from "../index";
import { logger } from "./logger";

/** Prefix, na který se dá navěsit upozornění v Cloudflare. */
export const WATCHDOG_MARKER = "PRALES_WATCHDOG_ALERT";

export interface WatchdogProblem {
  kod: string;
  popis: string;
  hodnota: number | string;
}

export interface WatchdogResult {
  ok: boolean;
  problemy: WatchdogProblem[];
}

async function scalar(db: D1Database, sql: string, popis: string): Promise<number | null> {
  const row = await db.prepare(sql).first<{ n: number }>().catch((e) => {
    logger.warn({ module: "watchdog" }, `dotaz "${popis}" selhal`, e);
    return null;
  });
  return row?.n ?? null;
}

/** Od kolika milisekund se běh z fronty hlásí jako příliš dlouhý. */
export const QUEUE_RUN_ALARM_MS = 600_000;

/**
 * Stojí herní datum? Očekávaný herní den je dnešní den (UTC) plus posun z game_clock,
 * stejně jako ho počítá denní tick. Bez game_clock nebo bez týmů s datem se nehlásí nic.
 */
export async function staleGameDateProblem(db: D1Database, now: Date): Promise<WatchdogProblem | null> {
  const row = await db.prepare(
    `SELECT (SELECT offset_days FROM game_clock WHERE id = 1) AS offset_days,
            (SELECT MAX(game_date) FROM teams WHERE game_date IS NOT NULL) AS game_date`,
  ).first<{ offset_days: number | null; game_date: string | null }>()
    .catch((e) => { logger.warn({ module: "watchdog" }, "kontrola herního data selhala", e); return null; });
  if (!row || row.offset_days == null || !row.game_date) return null;
  const expected = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  expected.setUTCDate(expected.getUTCDate() + row.offset_days);
  const expectedDay = expected.toISOString().slice(0, 10);
  const actualDay = row.game_date.slice(0, 10);
  if (actualDay >= expectedDay) return null;
  return {
    kod: "herni_datum",
    popis: "Herní datum týmů není dnešní, denní tick nedoběhl k posunu data (večerní kolo nebude splatné)",
    hodnota: `${actualDay} místo ${expectedDay}`,
  };
}

/**
 * Projde kontroly a vrátí nalezené problémy. Nic nemění — jen čte a hlásí.
 */
export async function runWatchdog(env: Bindings): Promise<WatchdogResult> {
  const problemy: WatchdogProblem[] = [];

  // ── 1. TICHO: leží někde kolo, které se mělo dávno odehrát? ──
  // Nejdůležitější kontrola. Cloudflare tenhle stav nikdy nenahlásí, protože
  // se nic nepokazilo, prostě se nic nestalo.
  //
  // Dřív se tu měřil čas od posledního odehraného kola a cokoli přes 26 hodin
  // se hlásilo jako porucha. To bylo špatně: rozpis má volné dny. Mezi koly
  // 12. a 14. září je osmačtyřicet hodin, takže hlídač křičel po každém
  // volnu, i když tick běžel normálně.
  //
  // Správná otázka není „kdy se naposledy hrálo", ale „nezůstalo viset kolo,
  // které mělo být dávno odehrané". Dvě hodiny odkladu na doběhnutí simulace.
  // Počítá se jen aktuální sezóna, staré nedohrané ročníky by jinak hlásily
  // poruchu navždycky.
  const hodinPoTerminu = await scalar(
    env.DB,
    // Od kalendáře (index na termín), ne od zápasů: dotaz od neodehraných zápasů četl
    // při každém běhu 200 tisíc řádků.
    `SELECT CAST((julianday('now') - julianday(MIN(sc.scheduled_at))) * 24 AS INTEGER) AS n
       FROM season_calendar sc
      WHERE sc.scheduled_at < datetime('now', '-2 hours')
        AND sc.season_number = (
          SELECT MAX(sc2.season_number) FROM season_calendar sc2 WHERE sc2.league_id = sc.league_id
        )
        AND EXISTS (SELECT 1 FROM matches m WHERE m.calendar_id = sc.id AND m.status != 'simulated')`,
    "hodin od zmeškaného kola",
  );
  if (hodinPoTerminu !== null && hodinPoTerminu > 0) {
    problemy.push({
      kod: "zadne_kolo",
      popis: "Kolo mělo být dávno odehrané a pořád visí, tick zřejmě neběží",
      hodnota: `${hodinPoTerminu} h po termínu`,
    });
  }

  // ── 2. Zaseklá kola ──
  // Simulace spadla v půlce a kolo zůstalo v 'lineup_locked'. recoverStuckRounds
  // to sice příště dohraje, ale opakovaný výskyt znamená, že něco padá pravidelně.
  const zaseklá = await scalar(
    env.DB,
    "SELECT COUNT(*) AS n FROM season_calendar WHERE status = 'lineup_locked'",
    "zaseklá kola",
  );
  if (zaseklá && zaseklá > 0) {
    problemy.push({ kod: "zaseklá_kola", popis: "Kola uvízlá v 'lineup_locked'", hodnota: zaseklá });
  }

  // ── 3. Dead-letter fronta ──
  const dlq = await scalar(
    env.DB,
    "SELECT COUNT(*) AS n FROM queue_failures WHERE resolved = 0",
    "dead-letter fronta",
  );
  if (dlq && dlq > 0) {
    problemy.push({ kod: "dlq", popis: "Zprávy, které selhaly i po opakování", hodnota: dlq });
  }

  // ── 4. Rostoucí backlog ──
  // Ligy bez ligy v `leagues` se nepočítají — producent je stejně nikdy nezařadí.
  const backlog = await scalar(
    env.DB,
    `SELECT COUNT(*) AS n FROM season_calendar sc
       JOIN leagues l ON l.id = sc.league_id
      WHERE sc.status = 'scheduled'
        AND sc.season_number = (SELECT MAX(season_number) FROM season_calendar x WHERE x.league_id = sc.league_id)
        AND sc.scheduled_at <= (SELECT MAX(game_date) FROM teams t WHERE t.league_id = sc.league_id)`,
    "nedohraná splatná kola",
  );
  if (backlog !== null && backlog > 15) {
    problemy.push({
      kod: "backlog",
      popis: "Nedohraných splatných kol je moc, tick nestíhá tempo herního času",
      hodnota: backlog,
    });
  }

  // ── 4b. Zápasy, které se neodehrály nebo nedozpracovaly ──
  // Kolo je označené za odehrané, ale zápas v něm zůstal viset (spadl na chybě).
  const unplayed = await scalar(
    env.DB,
    `SELECT COUNT(*) AS n FROM matches m JOIN season_calendar sc ON sc.id = m.calendar_id
      WHERE sc.status = 'simulated' AND m.status IN ('scheduled', 'lineups_open')
        AND sc.season_number = (SELECT MAX(season_number) FROM season_calendar x WHERE x.league_id = sc.league_id)`,
    "neodehrané zápasy v odehraných kolech",
  );
  if (unplayed && unplayed > 0) {
    problemy.push({ kod: "neodehrany_zapas", popis: "V odehraném kole zůstal neodehraný zápas (sázky kola se nevypořádají)", hodnota: unplayed });
  }
  // Zápas má výsledek, ale jeho následky (statistiky, finance, kondice) nedoběhly.
  const halfDone = await scalar(
    env.DB,
    `SELECT COUNT(*) AS n FROM matches m JOIN season_calendar sc ON sc.id = m.calendar_id
      WHERE m.status = 'simulated' AND m.aftermath_done_at IS NULL
        AND m.simulated_at > (SELECT MIN(aftermath_done_at) FROM matches)
        AND m.simulated_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-30 minutes')
        AND m.simulated_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-3 days')`,
    "napůl zpracované zápasy",
  );
  if (halfDone && halfDone > 0) {
    problemy.push({ kod: "zapas_napul", popis: "Zápas má výsledek, ale jeho zpracování spadlo uprostřed", hodnota: halfDone });
  }

  // ── 4c. Herní datum nestojí ──
  // Denní tick posouvá teams.game_date na dnešek (reálný den plus posun z game_clock). Když
  // tick spadne před posunem, datum zůstane včerejší, večerní kolo není splatné a nic to
  // nenahlásí. Hlídač běží tři hodiny po ticku, takže rozdíl znamená nedoběhlý tick.
  const staleGameDate = await staleGameDateProblem(env.DB, new Date());
  if (staleGameDate) problemy.push(staleGameDate);

  // ── 4d. Běh z fronty trvá moc dlouho ──
  // Kolo se hraje kolem pěti minut. Běh nad deset minut je na hraně limitu Workeru
  // a příště spadne v půlce.
  const slowRun = await env.DB.prepare(
    `SELECT kind, league_id, duration_ms FROM queue_runs
      WHERE duration_ms > ? AND created_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1 day')
      ORDER BY duration_ms DESC LIMIT 1`,
  ).bind(QUEUE_RUN_ALARM_MS).first<{ kind: string; league_id: string | null; duration_ms: number }>()
    .catch((e) => { logger.warn({ module: "watchdog" }, "kontrola délky běhů z fronty selhala", e); return null; });
  if (slowRun) {
    problemy.push({
      kod: "pomaly_beh",
      popis: `Běh z fronty (${slowRun.kind}${slowRun.league_id ? `, liga ${slowRun.league_id}` : ""}) trval přes ${QUEUE_RUN_ALARM_MS / 1000} s`,
      hodnota: `${Math.round(slowRun.duration_ms / 1000)} s`,
    });
  }

  // ── 5. Opakované pokusy ──
  const retry = await scalar(
    env.DB,
    // „busy“ není porucha: zpráva jen čeká, až běžící kolo doběhne (fronta ji vrací schválně).
    "SELECT COUNT(*) AS n FROM queue_runs WHERE attempts > 1 AND status <> 'busy' AND created_at > datetime('now', '-1 day')",
    "retry za 24 h",
  );
  if (retry && retry > 0) {
    problemy.push({ kod: "retry", popis: "Zprávy se musely doručovat opakovaně", hodnota: retry });
  }

  // ── 6. Sázková kancelář prodělává ──
  // Taky ticho: nic nespadne, jen se hráčům vyplácí víc, než vsadí. V září 2026
  // to trvalo měsíc a stálo přes 600 tisíc, než si toho někdo všiml.
  try {
    const { calibrationAlerts } = await import("../betting/calibration");
    const alerts = await calibrationAlerts(env.DB);
    for (const m of alerts.overpriced) {
      problemy.push({
        kod: "kurzy",
        popis: `Kurzy na trh „${m.label}" jsou podhodnocené, sázení se hráčům vyplácí`,
        hodnota: `${m.meanReturn.toFixed(2).replace(".", ",")} Kč za korunu z ${m.n} tipů`,
      });
    }
    // Trh jako celek může vypadat v pořádku, i když „1" vrací dvojnásobek a „2" polovinu.
    // Proto ještě výběry po kurzových pásmech: počet výher proti tomu, co čekal model.
    for (const b of alerts.bands) {
      problemy.push({
        kod: "kurzy_pasmo",
        popis: `Kurzový model se plete v pásmu „${b.label}": tip vychází ${b.z > 0 ? "častěji" : "méně často"}, než model čekal`,
        hodnota: `${b.wins} výher z ${b.n} tipů, model čekal ${b.expectedWins.toFixed(1).replace(".", ",")}; `
          + `návratnost ${b.meanReturn.toFixed(2).replace(".", ",")} Kč za korunu`,
      });
    }
  } catch (e) {
    logger.warn({ module: "watchdog" }, "kontrola kurzů selhala", e);
  }

  // ── 7. AI trenéři rozhodují bez modelu ──
  // Taky ticho: výpadek modelu nic neshodí (rozhodne náhradní pravidlo), jen AI kluby
  // přestanou rozhodovat podle povahy. V režimu off je náhradní pravidlo záměr, nepočítá se.
  const aiCoach = await env.DB.prepare(
    `SELECT COUNT(*) AS n, COALESCE(SUM(used_fallback), 0) AS f FROM ai_coach_decisions
      WHERE created_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1 day') AND mode != 'off'`,
  ).first<{ n: number; f: number }>()
    .catch((e) => { logger.warn({ module: "watchdog" }, "kontrola AI trenérů selhala", e); return null; });
  if (aiCoach && aiCoach.n >= 10 && aiCoach.f / aiCoach.n > 0.34) {
    problemy.push({
      kod: "ai_coach_fallback",
      popis: "AI trenéři často rozhodují bez modelu (výpadek, překročený čas nebo nesmyslné odpovědi)",
      hodnota: `${aiCoach.f} z ${aiCoach.n} rozhodnutí za 24 h`,
    });
  }

  // ── 8. AI trenéři mlčí ──
  // AI kluby v soutěži jsou, trenéři nejsou vypnutí, a přesto za 24 h žádné rozhodnutí:
  // neběží cron nebo fronta. Trh a odpovědi se zapisují denně, takže ticho není normální.
  const aiClubs = await scalar(
    env.DB,
    "SELECT COUNT(*) AS n FROM teams WHERE user_id = 'ai' AND parent_team_id IS NULL AND league_id IS NOT NULL",
    "AI kluby v soutěži",
  );
  if (aiClubs && aiClubs > 0 && aiCoach && aiCoach.n === 0) {
    const { readAllCoachModes } = await import("../ai-coach/mode");
    const modes = await readAllCoachModes(env.CACHE_KV);
    const decisionsAny = await scalar(
      env.DB,
      "SELECT COUNT(*) AS n FROM ai_coach_decisions WHERE created_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1 day')",
      "rozhodnutí AI trenérů za 24 h",
    );
    if (Object.values(modes).some((m) => m !== "off") && decisionsAny === 0) {
      problemy.push({
        kod: "ai_coach_silent",
        popis: "AI trenéři za 24 hodin nic nerozhodli, ačkoli nejsou vypnutí (neběží cron nebo fronta)",
        hodnota: `${aiClubs} AI klubů`,
      });
    }
  }

  // ── 9. AI klub v mínusu ──
  // AI si drží rezervu, záporný rozpočet znamená chybu v jeho hospodaření.
  const aiDebt = await env.DB.prepare(
    `SELECT name, budget FROM teams WHERE user_id = 'ai' AND parent_team_id IS NULL AND league_id IS NOT NULL AND budget < 0
      ORDER BY budget LIMIT 5`,
  ).all<{ name: string; budget: number }>()
    .catch((e) => { logger.warn({ module: "watchdog" }, "kontrola rozpočtů AI klubů selhala", e); return null; });
  if (aiDebt && aiDebt.results.length > 0) {
    problemy.push({
      kod: "ai_club_debt",
      popis: "AI klub je v mínusu",
      hodnota: aiDebt.results.map((t) => `${t.name} ${t.budget} Kč`).join(", "),
    });
  }

  // ── 10. Převzetí opuštěných klubů zabrzděné ──
  // Víc opuštěných klubů naráz noční převzetí neprovede (ai-clubs/abandoned.ts) a čeká na
  // ruční potvrzení. Bez hlášení by brzda tiše držela a nikdo by o ní nevěděl.
  try {
    const { findAbandonedClubs, isTakeoverEnabled, MAX_TAKEOVERS_PER_RUN } = await import("../ai-clubs/abandoned");
    if (await isTakeoverEnabled(env.CACHE_KV)) {
      const waiting = await findAbandonedClubs(env.DB, new Date());
      if (waiting.length > MAX_TAKEOVERS_PER_RUN) {
        problemy.push({
          kod: "ai_takeover_brake",
          popis: `Převzetí opuštěných klubů zabrzděno (víc než ${MAX_TAKEOVERS_PER_RUN} naráz), zkontroluj seznam v adminu a potvrď ručně`,
          hodnota: `${waiting.length} klubů`,
        });
      }
    }
  } catch (e) {
    logger.warn({ module: "watchdog" }, "kontrola převzetí klubů selhala", e);
  }

  return { ok: problemy.length === 0, problemy };
}

/**
 * Spustí kontrolu a když najde problém, zaloguje ho a pošle adminům notifikaci.
 * Nikdy nevyhodí — hlídač nesmí shodit tick, který hlídá.
 */
export async function runWatchdogAndAlert(env: Bindings): Promise<WatchdogResult> {
  const vysledek = await runWatchdog(env).catch((e) => {
    logger.error({ module: "watchdog" }, "hlídač sám selhal", e);
    return { ok: true, problemy: [] as WatchdogProblem[] };
  });

  if (vysledek.ok) {
    logger.info({ module: "watchdog" }, "kontrola v pořádku");
    return vysledek;
  }

  const souhrn = vysledek.problemy.map((p) => `${p.kod}=${p.hodnota}`).join(", ");
  // Výrazný prefix, ať se na něj dá navěsit upozornění v Cloudflare.
  console.error(`${WATCHDOG_MARKER}: ${souhrn}`);
  for (const p of vysledek.problemy) {
    logger.error({ module: "watchdog" }, `${p.popis}: ${p.hodnota}`);
  }

  // Notifikace adminům — mají tým jako každý jiný manažer, takže i push.
  try {
    const admini = await env.DB.prepare(
      "SELECT t.id AS team_id FROM teams t JOIN users u ON u.id = t.user_id WHERE u.is_admin = 1 AND t.user_id != 'ai'",
    ).all<{ team_id: string }>();

    if (admini.results.length === 0) {
      logger.warn({ module: "watchdog" }, "žádný admin s týmem, notifikace nemá kam jít");
      return vysledek;
    }

    const { createNotification } = await import("../community/notifications");
    const pushEnv = {
      VAPID_PUBLIC_KEY: env.VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY: env.VAPID_PRIVATE_KEY,
      VAPID_SUBJECT: env.VAPID_SUBJECT,
      DB: env.DB,
    };
    for (const a of admini.results) {
      await createNotification(
        env.DB,
        a.team_id,
        "event",
        "⚠️ Zpracování hry hlásí problém",
        vysledek.problemy.map((p) => `${p.popis} (${p.hodnota})`).join(" · "),
        "/prehled",
        pushEnv,
      ).catch((e) => logger.warn({ module: "watchdog" }, "notifikace adminovi selhala", e));
    }
  } catch (e) {
    logger.error({ module: "watchdog" }, "rozeslání notifikací selhalo", e);
  }

  return vysledek;
}
