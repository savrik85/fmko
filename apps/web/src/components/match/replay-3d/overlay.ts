/**
 * Ovládání přes obraz záznamu (přepínač Video/Tracker, pohled, celá obrazovka): je vidět, jen když je myš nad
 * oknem záznamu; na dotykovém zařízení po klepnutí do okna a zmizí po klepnutí jinam. Okno záznamu je
 * `group/viewer` a dá se zaměřit (tabIndex).
 */
export const OVERLAY_CONTROL = "opacity-0 pointer-events-none transition-opacity group-hover/viewer:opacity-100 group-hover/viewer:pointer-events-auto [@media(hover:none)]:group-focus-within/viewer:opacity-100 [@media(hover:none)]:group-focus-within/viewer:pointer-events-auto";
