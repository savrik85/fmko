/**
 * Tlačítka přes obraz záznamu (přepínač Video/Tracker vlevo, pohled a celá obrazovka vpravo): bílá na černé,
 * u krajů okna pod horními nápisy videa.
 */
export const OVERLAY_BUTTON = "absolute h-7 rounded-md bg-black text-white text-xs font-heading font-bold shadow-md";
/** V okně jsou tlačítka vidět pořád, ale průsvitná, ať nepřekáží obrazu; plná jsou pod myší. */
export const OVERLAY_FAINT = "opacity-40 hover:opacity-100 transition-opacity";
/**
 * Na celé obrazovce se tlačítka ukážou při pohybu myši nebo klepnutí do obrazu a po chvíli klidu
 * (OVERLAY_SHOWN_MS) zase zmizí, jako ovládání v přehrávači videa.
 */
export const OVERLAY_HIDDEN = "opacity-0 pointer-events-none transition-opacity";
export const OVERLAY_SHOWN_MS = 2500;
/** Horní nápisy videa končí v tomhle podílu šířky obrazu od jeho horního kraje (grafika se zmenšuje s obrazem). */
export const BANNERS_BOTTOM = 52 / 848;
/** Od bočních krajů obrazu jsou nápisy odsazené o tenhle podíl jeho šířky; tlačítka stejně. */
export const BANNERS_INSET = 8 / 848;
/** Mezera mezi nápisy a tlačítky a mezi tlačítky vedle sebe (px); tlačítko celé obrazovky je široké 28 px. */
export const OVERLAY_GAP = 4;
