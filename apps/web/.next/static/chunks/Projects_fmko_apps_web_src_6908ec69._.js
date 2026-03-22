(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/Projects/fmko/apps/web/src/components/ui/button.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Button",
    ()=>Button
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
;
const variants = {
    primary: "bg-pitch-500 hover:bg-pitch-400 text-white shadow-card hover:shadow-hover",
    secondary: "bg-white hover:bg-gray-50 text-pitch-500 border border-pitch-500/20 shadow-card",
    danger: "bg-card-red hover:bg-red-600 text-white shadow-card",
    ghost: "bg-transparent hover:bg-black/5 text-pitch-500"
};
const sizes = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-5 py-2.5 text-base",
    lg: "px-8 py-4 text-lg"
};
function Button(param) {
    let { variant = "primary", size = "md", className = "", children, ...props } = param;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
        className: "font-heading font-bold rounded-card transition-all inline-flex items-center justify-center ".concat(variants[variant], " ").concat(sizes[size], " ").concat(className),
        ...props,
        children: children
    }, void 0, false, {
        fileName: "[project]/Projects/fmko/apps/web/src/components/ui/button.tsx",
        lineNumber: 32,
        columnNumber: 5
    }, this);
}
_c = Button;
var _c;
__turbopack_context__.k.register(_c, "Button");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/Projects/fmko/apps/web/src/components/ui/card.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Card",
    ()=>Card,
    "CardBody",
    ()=>CardBody,
    "CardHeader",
    ()=>CardHeader
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
;
function Card(param) {
    let { hover = false, className = "", children, ...props } = param;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "bg-white rounded-card shadow-card ".concat(hover ? "hover:shadow-hover transition-shadow cursor-pointer" : "", " ").concat(className),
        ...props,
        children: children
    }, void 0, false, {
        fileName: "[project]/Projects/fmko/apps/web/src/components/ui/card.tsx",
        lineNumber: 9,
        columnNumber: 5
    }, this);
}
_c = Card;
function CardHeader(param) {
    let { className = "", children, ...props } = param;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "px-5 py-4 border-b border-gray-100 ".concat(className),
        ...props,
        children: children
    }, void 0, false, {
        fileName: "[project]/Projects/fmko/apps/web/src/components/ui/card.tsx",
        lineNumber: 20,
        columnNumber: 5
    }, this);
}
_c1 = CardHeader;
function CardBody(param) {
    let { className = "", children, ...props } = param;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "px-5 py-4 ".concat(className),
        ...props,
        children: children
    }, void 0, false, {
        fileName: "[project]/Projects/fmko/apps/web/src/components/ui/card.tsx",
        lineNumber: 28,
        columnNumber: 5
    }, this);
}
_c2 = CardBody;
var _c, _c1, _c2;
__turbopack_context__.k.register(_c, "Card");
__turbopack_context__.k.register(_c1, "CardHeader");
__turbopack_context__.k.register(_c2, "CardBody");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/Projects/fmko/apps/web/src/components/ui/badge.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Badge",
    ()=>Badge
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
;
const variantStyles = {
    position: "bg-pitch-500/10 text-pitch-500 font-heading font-bold",
    status: "bg-gold-500/10 text-gold-600",
    league: "bg-pitch-500 text-white font-heading",
    default: "bg-gray-100 text-gray-600"
};
function Badge(param) {
    let { variant = "default", className = "", children } = param;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
        className: "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ".concat(variantStyles[variant], " ").concat(className),
        children: children
    }, void 0, false, {
        fileName: "[project]/Projects/fmko/apps/web/src/components/ui/badge.tsx",
        lineNumber: 20,
        columnNumber: 5
    }, this);
}
_c = Badge;
var _c;
__turbopack_context__.k.register(_c, "Badge");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/Projects/fmko/apps/web/src/components/ui/stat-bar.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "StatBar",
    ()=>StatBar
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
;
function getBarColor(value) {
    if (value >= 16) return "bg-pitch-400";
    if (value >= 12) return "bg-pitch-500";
    if (value >= 8) return "bg-gold-500";
    if (value >= 5) return "bg-orange-400";
    return "bg-card-red";
}
function StatBar(param) {
    let { label, value, max = 20 } = param;
    const pct = value / max * 100;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex items-center gap-3",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: "text-xs font-medium text-muted w-12 text-right uppercase",
                children: label
            }, void 0, false, {
                fileName: "[project]/Projects/fmko/apps/web/src/components/ui/stat-bar.tsx",
                lineNumber: 22,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "h-full rounded-full transition-all ".concat(getBarColor(value)),
                    style: {
                        width: "".concat(pct, "%")
                    }
                }, void 0, false, {
                    fileName: "[project]/Projects/fmko/apps/web/src/components/ui/stat-bar.tsx",
                    lineNumber: 26,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/Projects/fmko/apps/web/src/components/ui/stat-bar.tsx",
                lineNumber: 25,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: "text-sm font-heading font-bold tabular-nums w-6 text-right",
                children: value
            }, void 0, false, {
                fileName: "[project]/Projects/fmko/apps/web/src/components/ui/stat-bar.tsx",
                lineNumber: 31,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/Projects/fmko/apps/web/src/components/ui/stat-bar.tsx",
        lineNumber: 21,
        columnNumber: 5
    }, this);
}
_c = StatBar;
var _c;
__turbopack_context__.k.register(_c, "StatBar");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/Projects/fmko/apps/web/src/components/ui/index.ts [app-client] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([]);
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$apps$2f$web$2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/apps/web/src/components/ui/button.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$apps$2f$web$2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/apps/web/src/components/ui/card.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$apps$2f$web$2f$src$2f$components$2f$ui$2f$badge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/apps/web/src/components/ui/badge.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$apps$2f$web$2f$src$2f$components$2f$ui$2f$stat$2d$bar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/apps/web/src/components/ui/stat-bar.tsx [app-client] (ecmascript)");
;
;
;
;
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/Projects/fmko/apps/web/src/components/players/player-card.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "PlayerCardCompact",
    ()=>PlayerCardCompact,
    "PlayerCardFull",
    ()=>PlayerCardFull
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$apps$2f$web$2f$src$2f$components$2f$ui$2f$index$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/Projects/fmko/apps/web/src/components/ui/index.ts [app-client] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$apps$2f$web$2f$src$2f$components$2f$ui$2f$badge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/apps/web/src/components/ui/badge.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$apps$2f$web$2f$src$2f$components$2f$ui$2f$stat$2d$bar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/apps/web/src/components/ui/stat-bar.tsx [app-client] (ecmascript)");
"use client";
;
;
const POS_LABELS = {
    GK: "BRA",
    DEF: "OBR",
    MID: "ZÁL",
    FWD: "ÚTO"
};
function overallRating(p) {
    const main = p.position === "GK" ? p.goalkeeping * 2 + p.defense + p.passing : p.position === "DEF" ? p.defense * 2 + p.heading + p.speed : p.position === "MID" ? p.technique + p.passing * 2 + p.stamina : p.shooting * 2 + p.speed + p.technique;
    return Math.round(main / 4);
}
function moodEmoji(morale) {
    if (morale >= 80) return "\u{1F60A}";
    if (morale >= 60) return "\u{1F642}";
    if (morale >= 40) return "\u{1F610}";
    if (morale >= 20) return "\u{1F61E}";
    return "\u{1F621}";
}
function conditionLabel(condition) {
    if (condition >= 80) return {
        text: "Fit",
        color: "text-pitch-500"
    };
    if (condition >= 50) return {
        text: "OK",
        color: "text-gold-500"
    };
    if (condition >= 20) return {
        text: "Unavený",
        color: "text-orange-500"
    };
    return {
        text: "Vyčerpaný",
        color: "text-card-red"
    };
}
function PlayerCardCompact(param) {
    let { player, onClick } = param;
    const rating = overallRating(player);
    const cond = conditionLabel(player.condition);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
        onClick: onClick,
        className: "w-full bg-white rounded-card shadow-card hover:shadow-hover p-4 text-left transition-all flex gap-3 items-center",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "w-11 h-11 rounded-full shrink-0 flex items-center justify-center text-white font-heading font-bold",
                style: {
                    backgroundColor: player.primaryColor
                },
                children: player.firstName[0]
            }, void 0, false, {
                fileName: "[project]/Projects/fmko/apps/web/src/components/players/player-card.tsx",
                lineNumber: 69,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex-1 min-w-0",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-baseline gap-1.5",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "font-heading font-bold truncate",
                                children: [
                                    player.firstName,
                                    " ",
                                    player.lastName
                                ]
                            }, void 0, true, {
                                fileName: "[project]/Projects/fmko/apps/web/src/components/players/player-card.tsx",
                                lineNumber: 79,
                                columnNumber: 11
                            }, this),
                            player.nickname && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-xs text-gold-500 shrink-0",
                                children: [
                                    "„",
                                    player.nickname,
                                    "“"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/Projects/fmko/apps/web/src/components/players/player-card.tsx",
                                lineNumber: 83,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/Projects/fmko/apps/web/src/components/players/player-card.tsx",
                        lineNumber: 78,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center gap-2 text-xs text-muted mt-0.5",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$apps$2f$web$2f$src$2f$components$2f$ui$2f$badge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Badge"], {
                                variant: "position",
                                children: POS_LABELS[player.position]
                            }, void 0, false, {
                                fileName: "[project]/Projects/fmko/apps/web/src/components/players/player-card.tsx",
                                lineNumber: 87,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                children: player.age
                            }, void 0, false, {
                                fileName: "[project]/Projects/fmko/apps/web/src/components/players/player-card.tsx",
                                lineNumber: 88,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                children: "·"
                            }, void 0, false, {
                                fileName: "[project]/Projects/fmko/apps/web/src/components/players/player-card.tsx",
                                lineNumber: 89,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: cond.color,
                                children: cond.text
                            }, void 0, false, {
                                fileName: "[project]/Projects/fmko/apps/web/src/components/players/player-card.tsx",
                                lineNumber: 90,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                children: moodEmoji(player.morale)
                            }, void 0, false, {
                                fileName: "[project]/Projects/fmko/apps/web/src/components/players/player-card.tsx",
                                lineNumber: 91,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/Projects/fmko/apps/web/src/components/players/player-card.tsx",
                        lineNumber: 86,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/Projects/fmko/apps/web/src/components/players/player-card.tsx",
                lineNumber: 77,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "text-right shrink-0",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "font-heading font-bold text-xl tabular-nums",
                    style: {
                        color: player.primaryColor
                    },
                    children: rating
                }, void 0, false, {
                    fileName: "[project]/Projects/fmko/apps/web/src/components/players/player-card.tsx",
                    lineNumber: 97,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/Projects/fmko/apps/web/src/components/players/player-card.tsx",
                lineNumber: 96,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/Projects/fmko/apps/web/src/components/players/player-card.tsx",
        lineNumber: 64,
        columnNumber: 5
    }, this);
}
_c = PlayerCardCompact;
function PlayerCardFull(param) {
    let { player, onClose } = param;
    const rating = overallRating(player);
    const cond = conditionLabel(player.condition);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center",
        onClick: onClose,
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "bg-paper w-full sm:max-w-md sm:rounded-card rounded-t-2xl max-h-[90vh] overflow-y-auto",
            onClick: (e)=>e.stopPropagation(),
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "p-5 text-white rounded-t-2xl sm:rounded-t-card",
                    style: {
                        backgroundColor: player.primaryColor
                    },
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex justify-between items-start",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "font-heading text-2xl font-bold",
                                        children: [
                                            player.firstName,
                                            " ",
                                            player.lastName
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/Projects/fmko/apps/web/src/components/players/player-card.tsx",
                                        lineNumber: 120,
                                        columnNumber: 15
                                    }, this),
                                    player.nickname && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "text-white/70",
                                        children: [
                                            "„",
                                            player.nickname,
                                            "“"
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/Projects/fmko/apps/web/src/components/players/player-card.tsx",
                                        lineNumber: 124,
                                        columnNumber: 17
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "text-white/70 text-sm mt-1",
                                        children: [
                                            player.age,
                                            " let · ",
                                            player.occupation
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/Projects/fmko/apps/web/src/components/players/player-card.tsx",
                                        lineNumber: 126,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/Projects/fmko/apps/web/src/components/players/player-card.tsx",
                                lineNumber: 119,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "text-right",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "font-heading font-bold text-4xl tabular-nums",
                                        children: rating
                                    }, void 0, false, {
                                        fileName: "[project]/Projects/fmko/apps/web/src/components/players/player-card.tsx",
                                        lineNumber: 131,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$apps$2f$web$2f$src$2f$components$2f$ui$2f$badge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Badge"], {
                                        variant: "position",
                                        children: POS_LABELS[player.position]
                                    }, void 0, false, {
                                        fileName: "[project]/Projects/fmko/apps/web/src/components/players/player-card.tsx",
                                        lineNumber: 132,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/Projects/fmko/apps/web/src/components/players/player-card.tsx",
                                lineNumber: 130,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/Projects/fmko/apps/web/src/components/players/player-card.tsx",
                        lineNumber: 118,
                        columnNumber: 11
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/Projects/fmko/apps/web/src/components/players/player-card.tsx",
                    lineNumber: 117,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "px-5 py-3 flex gap-4 border-b border-gray-100",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "text-center",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "text-sm font-heading font-bold",
                                    children: [
                                        player.condition,
                                        "%"
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/Projects/fmko/apps/web/src/components/players/player-card.tsx",
                                    lineNumber: 140,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "text-xs ".concat(cond.color),
                                    children: cond.text
                                }, void 0, false, {
                                    fileName: "[project]/Projects/fmko/apps/web/src/components/players/player-card.tsx",
                                    lineNumber: 141,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/Projects/fmko/apps/web/src/components/players/player-card.tsx",
                            lineNumber: 139,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "text-center",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "text-sm font-heading font-bold",
                                    children: [
                                        moodEmoji(player.morale),
                                        " ",
                                        player.morale
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/Projects/fmko/apps/web/src/components/players/player-card.tsx",
                                    lineNumber: 144,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "text-xs text-muted",
                                    children: "Morálka"
                                }, void 0, false, {
                                    fileName: "[project]/Projects/fmko/apps/web/src/components/players/player-card.tsx",
                                    lineNumber: 145,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/Projects/fmko/apps/web/src/components/players/player-card.tsx",
                            lineNumber: 143,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "text-center",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "text-sm font-heading font-bold",
                                    children: player.alcohol > 14 ? "\u{1F37A}" : player.discipline > 14 ? "\u{1F3C6}" : "\u2796"
                                }, void 0, false, {
                                    fileName: "[project]/Projects/fmko/apps/web/src/components/players/player-card.tsx",
                                    lineNumber: 148,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "text-xs text-muted",
                                    children: player.alcohol > 14 ? "Pivátor" : player.discipline > 14 ? "Profík" : "Normál"
                                }, void 0, false, {
                                    fileName: "[project]/Projects/fmko/apps/web/src/components/players/player-card.tsx",
                                    lineNumber: 149,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/Projects/fmko/apps/web/src/components/players/player-card.tsx",
                            lineNumber: 147,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/Projects/fmko/apps/web/src/components/players/player-card.tsx",
                    lineNumber: 138,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "px-5 py-4 space-y-2.5",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "text-xs text-muted uppercase font-heading font-bold mb-1",
                            children: "Fotbalové atributy"
                        }, void 0, false, {
                            fileName: "[project]/Projects/fmko/apps/web/src/components/players/player-card.tsx",
                            lineNumber: 155,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$apps$2f$web$2f$src$2f$components$2f$ui$2f$stat$2d$bar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["StatBar"], {
                            label: "RYC",
                            value: player.speed
                        }, void 0, false, {
                            fileName: "[project]/Projects/fmko/apps/web/src/components/players/player-card.tsx",
                            lineNumber: 156,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$apps$2f$web$2f$src$2f$components$2f$ui$2f$stat$2d$bar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["StatBar"], {
                            label: "TEC",
                            value: player.technique
                        }, void 0, false, {
                            fileName: "[project]/Projects/fmko/apps/web/src/components/players/player-card.tsx",
                            lineNumber: 157,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$apps$2f$web$2f$src$2f$components$2f$ui$2f$stat$2d$bar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["StatBar"], {
                            label: "STŘ",
                            value: player.shooting
                        }, void 0, false, {
                            fileName: "[project]/Projects/fmko/apps/web/src/components/players/player-card.tsx",
                            lineNumber: 158,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$apps$2f$web$2f$src$2f$components$2f$ui$2f$stat$2d$bar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["StatBar"], {
                            label: "PŘI",
                            value: player.passing
                        }, void 0, false, {
                            fileName: "[project]/Projects/fmko/apps/web/src/components/players/player-card.tsx",
                            lineNumber: 159,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$apps$2f$web$2f$src$2f$components$2f$ui$2f$stat$2d$bar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["StatBar"], {
                            label: "HLA",
                            value: player.heading
                        }, void 0, false, {
                            fileName: "[project]/Projects/fmko/apps/web/src/components/players/player-card.tsx",
                            lineNumber: 160,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$apps$2f$web$2f$src$2f$components$2f$ui$2f$stat$2d$bar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["StatBar"], {
                            label: "OBR",
                            value: player.defense
                        }, void 0, false, {
                            fileName: "[project]/Projects/fmko/apps/web/src/components/players/player-card.tsx",
                            lineNumber: 161,
                            columnNumber: 11
                        }, this),
                        player.position === "GK" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$apps$2f$web$2f$src$2f$components$2f$ui$2f$stat$2d$bar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["StatBar"], {
                            label: "BRA",
                            value: player.goalkeeping
                        }, void 0, false, {
                            fileName: "[project]/Projects/fmko/apps/web/src/components/players/player-card.tsx",
                            lineNumber: 162,
                            columnNumber: 40
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "text-xs text-muted uppercase font-heading font-bold mt-4 mb-1",
                            children: "Fyzické"
                        }, void 0, false, {
                            fileName: "[project]/Projects/fmko/apps/web/src/components/players/player-card.tsx",
                            lineNumber: 163,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$apps$2f$web$2f$src$2f$components$2f$ui$2f$stat$2d$bar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["StatBar"], {
                            label: "KON",
                            value: player.stamina
                        }, void 0, false, {
                            fileName: "[project]/Projects/fmko/apps/web/src/components/players/player-card.tsx",
                            lineNumber: 164,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/Projects/fmko/apps/web/src/components/players/player-card.tsx",
                    lineNumber: 154,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "p-5 pt-0",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        onClick: onClose,
                        className: "w-full py-3 rounded-card bg-gray-100 hover:bg-gray-200 font-heading font-bold text-muted transition-colors",
                        children: "Zavřít"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/apps/web/src/components/players/player-card.tsx",
                        lineNumber: 169,
                        columnNumber: 11
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/Projects/fmko/apps/web/src/components/players/player-card.tsx",
                    lineNumber: 168,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/Projects/fmko/apps/web/src/components/players/player-card.tsx",
            lineNumber: 112,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/Projects/fmko/apps/web/src/components/players/player-card.tsx",
        lineNumber: 111,
        columnNumber: 5
    }, this);
}
_c1 = PlayerCardFull;
var _c, _c1;
__turbopack_context__.k.register(_c, "PlayerCardCompact");
__turbopack_context__.k.register(_c1, "PlayerCardFull");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/Projects/fmko/apps/web/src/app/dashboard/squad/page.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>SquadPage
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$apps$2f$web$2f$src$2f$components$2f$players$2f$player$2d$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/apps/web/src/components/players/player-card.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
// Mock squad data
const MOCK_SQUAD = [
    {
        id: 1,
        firstName: "Zdeněk",
        lastName: "Novák",
        nickname: "Buřtík",
        age: 42,
        position: "GK",
        occupation: "Řezník",
        speed: 3,
        technique: 4,
        shooting: 2,
        passing: 5,
        heading: 4,
        defense: 6,
        goalkeeping: 12,
        stamina: 5,
        condition: 85,
        morale: 60,
        alcohol: 16,
        discipline: 8,
        primaryColor: "#2D5F2D"
    },
    {
        id: 2,
        firstName: "Petr",
        lastName: "Dvořák",
        nickname: "Prochás",
        age: 34,
        position: "DEF",
        occupation: "Zedník",
        speed: 7,
        technique: 6,
        shooting: 4,
        passing: 7,
        heading: 9,
        defense: 12,
        goalkeeping: 1,
        stamina: 8,
        condition: 90,
        morale: 70,
        alcohol: 10,
        discipline: 14,
        primaryColor: "#2D5F2D"
    },
    {
        id: 3,
        firstName: "Milan",
        lastName: "Černý",
        nickname: "Tank",
        age: 38,
        position: "DEF",
        occupation: "Traktorista",
        speed: 5,
        technique: 4,
        shooting: 3,
        passing: 5,
        heading: 11,
        defense: 13,
        goalkeeping: 1,
        stamina: 6,
        condition: 75,
        morale: 55,
        alcohol: 14,
        discipline: 10,
        primaryColor: "#2D5F2D"
    },
    {
        id: 4,
        firstName: "Radek",
        lastName: "Sedláček",
        nickname: "Sedla",
        age: 29,
        position: "DEF",
        occupation: "Policista",
        speed: 9,
        technique: 7,
        shooting: 5,
        passing: 8,
        heading: 8,
        defense: 11,
        goalkeeping: 1,
        stamina: 10,
        condition: 95,
        morale: 75,
        alcohol: 5,
        discipline: 17,
        primaryColor: "#2D5F2D"
    },
    {
        id: 5,
        firstName: "Tomáš",
        lastName: "Veselý",
        nickname: "Veselej",
        age: 28,
        position: "MID",
        occupation: "Automechanik",
        speed: 8,
        technique: 10,
        shooting: 7,
        passing: 11,
        heading: 6,
        defense: 7,
        goalkeeping: 1,
        stamina: 9,
        condition: 100,
        morale: 85,
        alcohol: 8,
        discipline: 12,
        primaryColor: "#2D5F2D"
    },
    {
        id: 6,
        firstName: "David",
        lastName: "Kučera",
        nickname: "Ajťák",
        age: 31,
        position: "MID",
        occupation: "Programátor",
        speed: 6,
        technique: 9,
        shooting: 6,
        passing: 12,
        heading: 5,
        defense: 6,
        goalkeeping: 1,
        stamina: 7,
        condition: 80,
        morale: 65,
        alcohol: 4,
        discipline: 15,
        primaryColor: "#2D5F2D"
    },
    {
        id: 7,
        firstName: "Ondřej",
        lastName: "Marek",
        nickname: "Šnek",
        age: 36,
        position: "MID",
        occupation: "Účetní",
        speed: 3,
        technique: 8,
        shooting: 5,
        passing: 9,
        heading: 4,
        defense: 5,
        goalkeeping: 1,
        stamina: 5,
        condition: 70,
        morale: 50,
        alcohol: 6,
        discipline: 16,
        primaryColor: "#2D5F2D"
    },
    {
        id: 8,
        firstName: "Martin",
        lastName: "Horák",
        nickname: "Dělo",
        age: 25,
        position: "FWD",
        occupation: "Hasič",
        speed: 10,
        technique: 8,
        shooting: 14,
        passing: 7,
        heading: 8,
        defense: 3,
        goalkeeping: 1,
        stamina: 11,
        condition: 95,
        morale: 80,
        alcohol: 9,
        discipline: 11,
        primaryColor: "#2D5F2D"
    },
    {
        id: 9,
        firstName: "Filip",
        lastName: "Jelínek",
        nickname: null,
        age: 20,
        position: "FWD",
        occupation: "Skladník",
        speed: 12,
        technique: 9,
        shooting: 10,
        passing: 6,
        heading: 7,
        defense: 2,
        goalkeeping: 1,
        stamina: 10,
        condition: 100,
        morale: 70,
        alcohol: 12,
        discipline: 6,
        primaryColor: "#2D5F2D"
    },
    {
        id: 10,
        firstName: "Jakub",
        lastName: "Svoboda",
        nickname: null,
        age: 17,
        position: "FWD",
        occupation: "Student",
        speed: 11,
        technique: 8,
        shooting: 9,
        passing: 7,
        heading: 5,
        defense: 3,
        goalkeeping: 1,
        stamina: 9,
        condition: 100,
        morale: 90,
        alcohol: 2,
        discipline: 8,
        primaryColor: "#2D5F2D"
    },
    {
        id: 11,
        firstName: "Jaroslav",
        lastName: "Procházka",
        nickname: "Děda",
        age: 48,
        position: "DEF",
        occupation: "Důchodce",
        speed: 2,
        technique: 6,
        shooting: 3,
        passing: 7,
        heading: 8,
        defense: 10,
        goalkeeping: 1,
        stamina: 3,
        condition: 60,
        morale: 45,
        alcohol: 15,
        discipline: 7,
        primaryColor: "#2D5F2D"
    }
];
function SquadPage() {
    _s();
    const [filter, setFilter] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("all");
    const [selectedPlayer, setSelectedPlayer] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const filtered = filter === "all" ? MOCK_SQUAD : MOCK_SQUAD.filter((p)=>p.position === filter);
    const posOrder = {
        GK: 0,
        DEF: 1,
        MID: 2,
        FWD: 3
    };
    const sorted = [
        ...filtered
    ].sort((a, b)=>posOrder[a.position] - posOrder[b.position]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "p-4 sm:p-6 max-w-3xl mx-auto",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
                className: "font-heading text-2xl font-bold text-pitch-500 mb-4",
                children: [
                    "Kádr (",
                    MOCK_SQUAD.length,
                    " hráčů)"
                ]
            }, void 0, true, {
                fileName: "[project]/Projects/fmko/apps/web/src/app/dashboard/squad/page.tsx",
                lineNumber: 36,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex gap-2 mb-4",
                children: [
                    "all",
                    "GK",
                    "DEF",
                    "MID",
                    "FWD"
                ].map((pos)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        onClick: ()=>setFilter(pos),
                        className: "px-3 py-1.5 rounded-full text-sm font-heading font-bold transition-colors ".concat(filter === pos ? "bg-pitch-500 text-white" : "bg-white text-muted hover:text-pitch-500 shadow-card"),
                        children: pos === "all" ? "Všichni" : pos === "GK" ? "BRA" : pos === "DEF" ? "OBR" : pos === "MID" ? "ZÁL" : "ÚTO"
                    }, pos, false, {
                        fileName: "[project]/Projects/fmko/apps/web/src/app/dashboard/squad/page.tsx",
                        lineNumber: 43,
                        columnNumber: 11
                    }, this))
            }, void 0, false, {
                fileName: "[project]/Projects/fmko/apps/web/src/app/dashboard/squad/page.tsx",
                lineNumber: 41,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "space-y-2",
                children: sorted.map((player)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$apps$2f$web$2f$src$2f$components$2f$players$2f$player$2d$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PlayerCardCompact"], {
                        player: player,
                        onClick: ()=>setSelectedPlayer(player)
                    }, player.id, false, {
                        fileName: "[project]/Projects/fmko/apps/web/src/app/dashboard/squad/page.tsx",
                        lineNumber: 60,
                        columnNumber: 11
                    }, this))
            }, void 0, false, {
                fileName: "[project]/Projects/fmko/apps/web/src/app/dashboard/squad/page.tsx",
                lineNumber: 58,
                columnNumber: 7
            }, this),
            selectedPlayer && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$apps$2f$web$2f$src$2f$components$2f$players$2f$player$2d$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PlayerCardFull"], {
                player: selectedPlayer,
                onClose: ()=>setSelectedPlayer(null)
            }, void 0, false, {
                fileName: "[project]/Projects/fmko/apps/web/src/app/dashboard/squad/page.tsx",
                lineNumber: 70,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/Projects/fmko/apps/web/src/app/dashboard/squad/page.tsx",
        lineNumber: 35,
        columnNumber: 5
    }, this);
}
_s(SquadPage, "3KH4dHEFnXg2Nk96wR2/xWwe52U=");
_c = SquadPage;
var _c;
__turbopack_context__.k.register(_c, "SquadPage");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=Projects_fmko_apps_web_src_6908ec69._.js.map