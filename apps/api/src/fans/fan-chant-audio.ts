/**
 * Nahrávky chorálů.
 *
 * Přečtený chorál a slyšený chorál jsou dvě různé věci. Text je zadarmo,
 * nahrávka stojí kredity u Suna, takže se nahrává jen to, co za to stojí:
 *
 *   1. DOMÁCÍ CHORÁL každého klubu, který někdo opravdu hraje. Uvítání, aby
 *      měl stadion co pouštět od začátku.
 *   2. Chorál, který kotel skutečně přijal, tedy síla 80 a víc. Nahrávka se
 *      nekupuje, ale vyzpívá: musíš držet kotel spokojený dost dlouho.
 *
 * Suno vrací za jednu platbu DVĚ verze a liší se. Měřením čtyř nahrávek vyšel
 * podíl energie pod 120 Hz mezi 9,6 % a 25,8 % při naprosto stejném zadání,
 * takže někdy prosáknou nástroje a někdy ne. Vybrat čistší podle spektra na
 * workeru nejde (mp3 se tam nedekóduje), proto se uloží obě a rozhodne ucho.
 */

import { logger } from "../lib/logger";
import type { Bindings } from "../index";

const M = "fan-chant-audio";
const SUNO_API = "https://api.sunoapi.org/api/v1";

/** Síla, od které si kotel nahrávku zaslouží. Odpovídá „zpívá celý kotel". */
export const SILA_NA_NAHRAVKU = 80;

/** Kolik dní zpět musí být majitel klubu k vidění, aby se za něj platilo. */
export const DNU_AKTIVITY = 30;

/**
 * Strop na jeden běh.
 *
 * Pojistka proti tomu, aby jediná chyba v podmínce vysypala celý kredit.
 * Rozjezd se tak rozloží do několika dní, což nikomu nevadí.
 */
export const MAX_ZA_BEH = 10;

/** Kolik kreditů stojí jedna generace. Změřeno: 798 → 786 za jedno volání. */
export const KREDITU_ZA_NAHRAVKU = 12;

const STYL = "football terrace chant, a cappella, male crowd shouting in unison, "
  + "stadium reverb, no instruments";
const PROTI = "drums, percussion, guitar, bass, synth, piano, strings, melody, "
  + "instrumental backing, music, beat";

/**
 * Text pro Suno.
 *
 * Chorál má jeden řádek, nahrávka dvacet vteřin. Kotel se opakuje, tak se
 * opakuje i text. Bez toho Suno začne dozpívávat vlastní slova.
 */
export function textProNahravku(text: string): string {
  return Array.from({ length: 4 }, () => text).join("\n");
}

export interface ChoralKNahrani {
  id: string;
  team_id: string;
  kind: string;
  text: string;
  sila: number;
}

/**
 * Chorály, které mají na nahrávku nárok a ještě ji nemají.
 *
 * Domácí chorál jen u klubů s živým trenérem: mrtvý klub nemá komu hrát.
 * Silný chorál kdekoliv, protože síla 80 znamená, že tam ti lidé chodí.
 */
export async function kandidatiNaNahravku(
  db: D1Database,
  limit = MAX_ZA_BEH,
): Promise<ChoralKNahrani[]> {
  const rows = await db.prepare(
    `SELECT c.id, c.team_id, c.kind, c.text, c.sila
       FROM fan_chants c
       JOIN teams t ON t.id = c.team_id
       LEFT JOIN users u ON u.id = t.user_id
      WHERE c.status = 'zpiva'
        AND c.audio_a IS NULL
        AND c.audio_task_id IS NULL
        -- Rezerva se neplatí. Nemá vlastní kotel a hraje na stejném hřišti
        -- jako áčko, jehož chorál už nahraný je.
        AND COALESCE(t.team_type, 'senior') <> 'u21'
        AND (
          (c.kind = 'domov' AND u.last_activity_at > date('now', ?))
          OR c.sila >= ?
        )
      ORDER BY (c.kind = 'domov') DESC, c.sila DESC
      LIMIT ?`,
  ).bind(`-${DNU_AKTIVITY} day`, SILA_NA_NAHRAVKU, limit)
    .all<ChoralKNahrani>()
    .catch((e) => { logger.warn({ module: M }, "kandidáti na nahrávku", e); return { results: [] as ChoralKNahrani[] }; });
  return rows.results ?? [];
}

/**
 * Objedná nahrávky. Vrací, kolik jich odešlo.
 *
 * Zámek je `audio_task_id`: nejdřív se atomicky zabere řádek značkou, teprve
 * pak se volá Suno. Dva souběžné ticky tak nezaplatí totéž dvakrát.
 */
export async function objednejNahravky(
  env: Pick<Bindings, "SUNO_API_KEY" | "DB">,
  limit = MAX_ZA_BEH,
): Promise<{ objednano: number; preskoceno: number; chyby: string[] }> {
  const chyby: string[] = [];
  if (!env.SUNO_API_KEY) return { objednano: 0, preskoceno: 0, chyby: ["chybí SUNO_API_KEY"] };

  const kandidati = await kandidatiNaNahravku(env.DB, limit);
  let objednano = 0;
  let preskoceno = 0;

  for (const ch of kandidati) {
    const znacka = `zadano-${ch.id}`;
    const zabral = await env.DB.prepare(
      "UPDATE fan_chants SET audio_task_id = ? WHERE id = ? AND audio_task_id IS NULL",
    ).bind(znacka, ch.id).run()
      .catch((e) => { logger.warn({ module: M }, `zámek ${ch.id}`, e); return null; });
    if (!zabral || zabral.meta.changes === 0) { preskoceno++; continue; }

    const taskId = await zadejSunu(env.SUNO_API_KEY, ch.text).catch((e) => {
      logger.warn({ module: M }, `Suno zadání ${ch.id}`, e);
      return null;
    });

    if (!taskId) {
      // Zámek se musí pustit, jinak by chorál zůstal navěky „rozpracovaný".
      await env.DB.prepare("UPDATE fan_chants SET audio_task_id = NULL WHERE id = ? AND audio_task_id = ?")
        .bind(ch.id, znacka).run()
        .catch((e) => logger.warn({ module: M }, `uvolnění zámku ${ch.id}`, e));
      chyby.push(ch.id);
      continue;
    }

    await env.DB.prepare(
      `UPDATE fan_chants SET audio_task_id = ?, audio_zadano_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
        WHERE id = ?`,
    ).bind(taskId, ch.id).run()
      .catch((e) => logger.warn({ module: M }, `uložení taskId ${ch.id}`, e));
    objednano++;
  }

  return { objednano, preskoceno, chyby };
}

async function zadejSunu(key: string, text: string): Promise<string | null> {
  const res = await fetch(`${SUNO_API}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      prompt: textProNahravku(text),
      style: STYL,
      title: "Choral",
      customMode: true,
      instrumental: false,
      // `duration` bere jen V6 a novější. Bez něj by z chorálu byla písnička.
      model: "V6",
      duration: 20,
      negativeTags: PROTI,
      vocalGender: "m",
      styleWeight: 0.9,
      callBackUrl: "https://example.com/suno-callback",
    }),
  });
  if (!res.ok) {
    logger.warn({ module: M }, `Suno ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return null;
  }
  const j = await res.json() as { data?: { taskId?: string } };
  return j.data?.taskId ?? null;
}

/**
 * Dotáhne rozpracované objednávky.
 *
 * Hotové stáhne do R2 a uloží klíče. Nehotové nechá být, zkusí se příště.
 * Trvale selhané pustí zpátky do fronty, ať se dají objednat znovu.
 */
export async function dotahniNahravky(
  env: Pick<Bindings, "SUNO_API_KEY" | "DB" | "SEED_DATA">,
): Promise<{ hotovo: number; ceka: number; selhalo: number }> {
  if (!env.SUNO_API_KEY) return { hotovo: 0, ceka: 0, selhalo: 0 };

  const rozpracovane = await env.DB.prepare(
    "SELECT id, audio_task_id FROM fan_chants WHERE audio_task_id IS NOT NULL AND audio_a IS NULL",
  ).all<{ id: string; audio_task_id: string }>()
    .catch((e) => { logger.warn({ module: M }, "rozpracované nahrávky", e); return { results: [] as Array<{ id: string; audio_task_id: string }> }; });

  const SELHANI = ["SENSITIVE_WORD_ERROR", "CREDIT_INSUFFICIENT", "GENERATE_FAILED", "PARAM_ERROR", "CALLBACK_EXCEPTION"];
  let hotovo = 0, ceka = 0, selhalo = 0;

  for (const row of rozpracovane.results ?? []) {
    // Značka zámku, Suno o ní nic neví. Objednávka ještě neproběhla.
    if (row.audio_task_id.startsWith("zadano-")) { ceka++; continue; }

    const res = await fetch(`${SUNO_API}/generate/record-info?taskId=${encodeURIComponent(row.audio_task_id)}`, {
      headers: { Authorization: `Bearer ${env.SUNO_API_KEY}` },
    }).catch((e) => { logger.warn({ module: M }, `stav ${row.id}`, e); return null; });
    if (!res?.ok) { ceka++; continue; }

    const j = await res.json() as {
      data?: { status?: string; response?: { sunoData?: Array<{ audioUrl?: string; streamAudioUrl?: string }> } };
    };
    const stav = j.data?.status;
    const skladby = j.data?.response?.sunoData ?? [];

    if (stav && SELHANI.includes(stav)) {
      logger.warn({ module: M }, `nahrávka ${row.id} selhala: ${stav}`);
      await env.DB.prepare("UPDATE fan_chants SET audio_task_id = NULL WHERE id = ?")
        .bind(row.id).run()
        .catch((e) => logger.warn({ module: M }, `reset ${row.id}`, e));
      selhalo++;
      continue;
    }

    const urls = skladby.map((sk) => sk.audioUrl ?? sk.streamAudioUrl).filter(Boolean) as string[];
    if (stav !== "SUCCESS" || urls.length === 0) { ceka++; continue; }

    const klice: Array<string | null> = [null, null];
    for (let i = 0; i < Math.min(2, urls.length); i++) {
      const varianta = i === 0 ? "a" : "b";
      const klic = `choral/${row.id}-${varianta}.mp3`;
      const ok = await ulozDoR2(env.SEED_DATA, klic, urls[i]).catch((e) => {
        logger.warn({ module: M }, `uložení ${klic}`, e);
        return false;
      });
      if (ok) klice[i] = klic;
    }

    if (!klice[0]) { ceka++; continue; }

    await env.DB.prepare(
      `UPDATE fan_chants
          SET audio_a = ?, audio_b = ?, audio_vybrana = COALESCE(audio_vybrana, 'a'), audio_task_id = NULL,
              updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
        WHERE id = ?`,
    ).bind(klice[0], klice[1], row.id).run()
      .catch((e) => logger.warn({ module: M }, `zápis nahrávek ${row.id}`, e));
    hotovo++;
  }

  return { hotovo, ceka, selhalo };
}

async function ulozDoR2(bucket: R2Bucket, klic: string, url: string): Promise<boolean> {
  const res = await fetch(url);
  if (!res.ok) {
    logger.warn({ module: M }, `stažení mp3 ${res.status}`);
    return false;
  }
  await bucket.put(klic, await res.arrayBuffer(), { httpMetadata: { contentType: "audio/mpeg" } });
  return true;
}

/** Zbývající kredit u Suna. Null když se nedá přečíst. */
export async function zbyvajiciKredit(key: string | undefined): Promise<number | null> {
  if (!key) return null;
  const res = await fetch(`${SUNO_API}/generate/credit`, {
    headers: { Authorization: `Bearer ${key}` },
  }).catch((e) => { logger.warn({ module: M }, "kredit", e); return null; });
  if (!res?.ok) return null;
  const j = await res.json() as { data?: number | { credits?: number } };
  return typeof j.data === "number" ? j.data : j.data?.credits ?? null;
}
