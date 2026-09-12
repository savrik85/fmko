/**
 * Katalog widgetů — jediné místo, kde se widget „existuje".
 *
 * Backend katalog nezná: validuje jen tvar layoutu. Nový widget je proto čistě
 * frontendová změna (soubor v items/ + řádek tady) a neznámé id z uloženého
 * layoutu se při renderu prostě přeskočí.
 */
import type { WidgetCategory, WidgetDef } from "./types";
export declare const CATEGORY_LABELS: Record<WidgetCategory, string>;
export declare const CATEGORY_ORDER: WidgetCategory[];
export declare const WIDGETS: WidgetDef[];
/** Definice widgetu, nebo undefined u neznámého id z uloženého layoutu. */
export declare function getWidget(id: string): WidgetDef | undefined;
//# sourceMappingURL=registry.d.ts.map