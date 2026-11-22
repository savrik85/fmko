/**
 * Model nevrátil použitelný text (nejede, vypršel rozpočet, nevalidní JSON, nebo by hráč jen
 * zopakoval, co už napsal). Volající mají pro tenhle případ náhradu: předem napsanou variantu,
 * nebo odpověď později (retry_reply). Vlastní modul, ať ho může hodit i hlídání opakování
 * (repetition.ts), které ai-player-chat.ts importuje.
 */
export class GeminiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiUnavailableError";
  }
}
