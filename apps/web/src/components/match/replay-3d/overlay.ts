/**
 * Tlačítka přes obraz záznamu (přepínač Video/Tracker vlevo, pohled a celá obrazovka vpravo): bílá na černé,
 * u krajů okna pod horními nápisy videa.
 */
/**
 * Poměr stran obrazu záznamu (šířka : výška). Video ho drží i na celé obrazovce: kamera má pevný úhel záběru
 * na výšku, takže v jiném poměru by ukazovala jiný výřez hřiště.
 */
export const VIEWER_ASPECT = 2.2;
export const OVERLAY_BUTTON = "absolute h-7 rounded-md bg-black text-white text-xs font-heading font-bold shadow-md";
/**
 * Tlačítka se ukážou při pohybu myši nad obrazem nebo po klepnutí do něj a po chvíli klidu (OVERLAY_SHOWN_MS)
 * zase zmizí, jako ovládání v přehrávači videa. Objeví se plynule, zmizí naráz. Platí v okně i na celé obrazovce.
 */
export const OVERLAY_HIDDEN = "opacity-0 pointer-events-none";
export const OVERLAY_SHOWN_MS = 2500;
/** Horní nápisy videa končí v tomhle podílu šířky obrazu od jeho horního kraje (grafika se zmenšuje s obrazem). */
export const BANNERS_BOTTOM = 52 / 848;
/** Od bočních krajů obrazu jsou nápisy odsazené o tenhle podíl jeho šířky; tlačítka stejně. */
export const BANNERS_INSET = 8 / 848;
/** Mezera mezi nápisy a tlačítky a mezi tlačítky vedle sebe (px); tlačítko celé obrazovky je široké 28 px. */
export const OVERLAY_GAP = 4;
