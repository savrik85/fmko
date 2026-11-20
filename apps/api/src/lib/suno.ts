/**
 * Čtení odpovědí Suna (api.sunoapi.org), společné pro hymny i nahrávky chorálů.
 *
 * Suno odmítá zadání i s HTTP 200: v těle je `code` jiný než 200, `msg` s důvodem
 * a `data` bez taskId. Nejčastěji 429, když dojde kredit. Dřív se kód nikde
 * nelogoval a manažer viděl „Suno nevrátilo task ID" (20. 11. 2026, na účtu
 * zbylo 10 kreditů, generace stojí 12).
 */

/** Pod tímhle zůstatkem hlásí hlídač provozu, ať se kredit stihne dobít. */
export const SUNO_CREDIT_ALARM = 100;

export interface SunoTaskReply {
  taskId: string | null;
  code: number | null;
  msg: string | null;
}

/** Vytáhne z odpovědi na zadání taskId, a když chybí, i kód a důvod odmítnutí. */
export function readSunoTaskReply(json: unknown): SunoTaskReply {
  const body = (json ?? {}) as { code?: unknown; msg?: unknown; data?: { taskId?: unknown } | null };
  const taskId = body.data?.taskId;
  return {
    taskId: typeof taskId === "string" && taskId ? taskId : null,
    code: typeof body.code === "number" ? body.code : null,
    msg: typeof body.msg === "string" ? body.msg : null,
  };
}

/**
 * Hláška pro manažera, když studio hymnu nepřijme. Pokus se v tu chvíli nepočítá,
 * protože se odečítá až po přijetí zadání.
 */
export function anthemRejectedMessage(code: number | null): string {
  switch (code) {
    case 413:
      return "Text hymny je na studio moc dlouhý. Zkrať ho a zkus to znovu, pokus se ti nepočítá.";
    case 405:
    case 430:
      return "Studio má teď moc zakázek. Pokus se ti nepočítá, zkus to za pár minut.";
    default:
      return "Hudební studio teď nenahrává. Pokus se ti nepočítá, zkus to prosím později.";
  }
}
