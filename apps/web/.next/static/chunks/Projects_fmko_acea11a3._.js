(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/Projects/fmko/packages/ui/src/avatar/parts/heads.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Head",
    ()=>Head
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
;
const HEAD_PATHS = {
    // 1: Kulatá
    1: "M50,15 C72,15 85,30 85,55 C85,78 72,90 50,90 C28,90 15,78 15,55 C15,30 28,15 50,15Z",
    // 2: Oválná
    2: "M50,12 C70,12 82,28 82,52 C82,80 70,92 50,92 C30,92 18,80 18,52 C18,28 30,12 50,12Z",
    // 3: Hranatá
    3: "M22,18 L78,18 C83,18 86,22 86,28 L86,72 C86,82 78,90 68,90 L32,90 C22,90 14,82 14,72 L14,28 C14,22 17,18 22,18Z",
    // 4: Úzká/dlouhá
    4: "M50,10 C68,10 78,25 78,48 C78,75 68,95 50,95 C32,95 22,75 22,48 C22,25 32,10 50,10Z",
    // 5: Široká
    5: "M50,18 C76,18 90,32 90,52 C90,74 76,88 50,88 C24,88 10,74 10,52 C10,32 24,18 50,18Z",
    // 6: Trojúhelníková (úzké čelo, široká čelist)
    6: "M50,14 C66,14 76,26 78,45 C80,68 72,88 50,88 C28,88 20,68 22,45 C24,26 34,14 50,14Z"
};
function Head(param) {
    let { variant, fill, shadow } = param;
    var _HEAD_PATHS_variant;
    const path = (_HEAD_PATHS_variant = HEAD_PATHS[variant]) !== null && _HEAD_PATHS_variant !== void 0 ? _HEAD_PATHS_variant : HEAD_PATHS[1];
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("g", {
        className: "avatar-head",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
            d: path,
            fill: fill,
            stroke: shadow,
            strokeWidth: "1.5"
        }, void 0, false, {
            fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/heads.tsx",
            lineNumber: 28,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/heads.tsx",
        lineNumber: 27,
        columnNumber: 5
    }, this);
}
_c = Head;
var _c;
__turbopack_context__.k.register(_c, "Head");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/Projects/fmko/packages/ui/src/avatar/parts/eyes.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Eyes",
    ()=>Eyes
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
;
function Eyes(param) {
    let { variant } = param;
    const y = 45;
    const lx = 37;
    const rx = 63;
    switch(variant){
        case 1:
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("g", {
                className: "avatar-eyes",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                        cx: lx,
                        cy: y,
                        r: "3",
                        fill: "#1A1A1A"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/eyes.tsx",
                        lineNumber: 16,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                        cx: rx,
                        cy: y,
                        r: "3",
                        fill: "#1A1A1A"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/eyes.tsx",
                        lineNumber: 17,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/eyes.tsx",
                lineNumber: 15,
                columnNumber: 9
            }, this);
        case 2:
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("g", {
                className: "avatar-eyes",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ellipse", {
                        cx: lx,
                        cy: y,
                        rx: "5",
                        ry: "5.5",
                        fill: "white",
                        stroke: "#333",
                        strokeWidth: "1"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/eyes.tsx",
                        lineNumber: 23,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                        cx: lx,
                        cy: y,
                        r: "2.5",
                        fill: "#1A1A1A"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/eyes.tsx",
                        lineNumber: 24,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ellipse", {
                        cx: rx,
                        cy: y,
                        rx: "5",
                        ry: "5.5",
                        fill: "white",
                        stroke: "#333",
                        strokeWidth: "1"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/eyes.tsx",
                        lineNumber: 25,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                        cx: rx,
                        cy: y,
                        r: "2.5",
                        fill: "#1A1A1A"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/eyes.tsx",
                        lineNumber: 26,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/eyes.tsx",
                lineNumber: 22,
                columnNumber: 9
            }, this);
        case 3:
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("g", {
                className: "avatar-eyes",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                        d: "M".concat(lx - 5, ",").concat(y, " Q").concat(lx, ",").concat(y - 3, " ").concat(lx + 5, ",").concat(y, " Q").concat(lx, ",").concat(y + 1, " ").concat(lx - 5, ",").concat(y, "Z"),
                        fill: "#1A1A1A"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/eyes.tsx",
                        lineNumber: 32,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                        d: "M".concat(rx - 5, ",").concat(y, " Q").concat(rx, ",").concat(y - 3, " ").concat(rx + 5, ",").concat(y, " Q").concat(rx, ",").concat(y + 1, " ").concat(rx - 5, ",").concat(y, "Z"),
                        fill: "#1A1A1A"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/eyes.tsx",
                        lineNumber: 33,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/eyes.tsx",
                lineNumber: 31,
                columnNumber: 9
            }, this);
        case 4:
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("g", {
                className: "avatar-eyes",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ellipse", {
                        cx: lx,
                        cy: y,
                        rx: "5",
                        ry: "2",
                        fill: "white",
                        stroke: "#333",
                        strokeWidth: "1"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/eyes.tsx",
                        lineNumber: 39,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                        cx: lx,
                        cy: y + 0.5,
                        r: "1.5",
                        fill: "#1A1A1A"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/eyes.tsx",
                        lineNumber: 40,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ellipse", {
                        cx: rx,
                        cy: y,
                        rx: "5",
                        ry: "2",
                        fill: "white",
                        stroke: "#333",
                        strokeWidth: "1"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/eyes.tsx",
                        lineNumber: 41,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                        cx: rx,
                        cy: y + 0.5,
                        r: "1.5",
                        fill: "#1A1A1A"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/eyes.tsx",
                        lineNumber: 42,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/eyes.tsx",
                lineNumber: 38,
                columnNumber: 9
            }, this);
        case 5:
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("g", {
                className: "avatar-eyes",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                        d: "M".concat(lx - 5, ",").concat(y + 1, " L").concat(lx, ",").concat(y - 3, " L").concat(lx + 5, ",").concat(y + 1),
                        fill: "none",
                        stroke: "#1A1A1A",
                        strokeWidth: "2",
                        strokeLinecap: "round"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/eyes.tsx",
                        lineNumber: 48,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                        cx: lx,
                        cy: y + 1,
                        r: "1.5",
                        fill: "#1A1A1A"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/eyes.tsx",
                        lineNumber: 49,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                        d: "M".concat(rx - 5, ",").concat(y + 1, " L").concat(rx, ",").concat(y - 3, " L").concat(rx + 5, ",").concat(y + 1),
                        fill: "none",
                        stroke: "#1A1A1A",
                        strokeWidth: "2",
                        strokeLinecap: "round"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/eyes.tsx",
                        lineNumber: 50,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                        cx: rx,
                        cy: y + 1,
                        r: "1.5",
                        fill: "#1A1A1A"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/eyes.tsx",
                        lineNumber: 51,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/eyes.tsx",
                lineNumber: 47,
                columnNumber: 9
            }, this);
        case 6:
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("g", {
                className: "avatar-eyes",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ellipse", {
                        cx: lx,
                        cy: y,
                        rx: "6",
                        ry: "7",
                        fill: "white",
                        stroke: "#333",
                        strokeWidth: "1"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/eyes.tsx",
                        lineNumber: 57,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                        cx: lx,
                        cy: y,
                        r: "3",
                        fill: "#1A1A1A"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/eyes.tsx",
                        lineNumber: 58,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                        cx: lx - 1,
                        cy: y - 2,
                        r: "1",
                        fill: "white"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/eyes.tsx",
                        lineNumber: 59,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ellipse", {
                        cx: rx,
                        cy: y,
                        rx: "6",
                        ry: "7",
                        fill: "white",
                        stroke: "#333",
                        strokeWidth: "1"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/eyes.tsx",
                        lineNumber: 60,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                        cx: rx,
                        cy: y,
                        r: "3",
                        fill: "#1A1A1A"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/eyes.tsx",
                        lineNumber: 61,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                        cx: rx - 1,
                        cy: y - 2,
                        r: "1",
                        fill: "white"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/eyes.tsx",
                        lineNumber: 62,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/eyes.tsx",
                lineNumber: 56,
                columnNumber: 9
            }, this);
        case 7:
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("g", {
                className: "avatar-eyes",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("line", {
                        x1: lx - 5,
                        y1: y - 5,
                        x2: lx + 4,
                        y2: y - 3,
                        stroke: "#333",
                        strokeWidth: "2.5",
                        strokeLinecap: "round"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/eyes.tsx",
                        lineNumber: 68,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                        cx: lx,
                        cy: y,
                        r: "3",
                        fill: "#1A1A1A"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/eyes.tsx",
                        lineNumber: 69,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("line", {
                        x1: rx + 5,
                        y1: y - 5,
                        x2: rx - 4,
                        y2: y - 3,
                        stroke: "#333",
                        strokeWidth: "2.5",
                        strokeLinecap: "round"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/eyes.tsx",
                        lineNumber: 70,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                        cx: rx,
                        cy: y,
                        r: "3",
                        fill: "#1A1A1A"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/eyes.tsx",
                        lineNumber: 71,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/eyes.tsx",
                lineNumber: 67,
                columnNumber: 9
            }, this);
        case 8:
        default:
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("g", {
                className: "avatar-eyes",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                        d: "M".concat(lx - 4, ",").concat(y, " Q").concat(lx, ",").concat(y - 5, " ").concat(lx + 4, ",").concat(y),
                        fill: "none",
                        stroke: "#1A1A1A",
                        strokeWidth: "2.5",
                        strokeLinecap: "round"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/eyes.tsx",
                        lineNumber: 78,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                        d: "M".concat(rx - 4, ",").concat(y, " Q").concat(rx, ",").concat(y - 5, " ").concat(rx + 4, ",").concat(y),
                        fill: "none",
                        stroke: "#1A1A1A",
                        strokeWidth: "2.5",
                        strokeLinecap: "round"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/eyes.tsx",
                        lineNumber: 79,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/eyes.tsx",
                lineNumber: 77,
                columnNumber: 9
            }, this);
    }
}
_c = Eyes;
var _c;
__turbopack_context__.k.register(_c, "Eyes");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/Projects/fmko/packages/ui/src/avatar/parts/noses.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Nose",
    ()=>Nose
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
;
function Nose(param) {
    let { variant, fill } = param;
    const cx = 50;
    const cy = 57;
    switch(variant){
        case 1:
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                cx: cx,
                cy: cy,
                r: "3",
                fill: fill,
                stroke: "#00000020",
                strokeWidth: "0.5"
            }, void 0, false, {
                fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/noses.tsx",
                lineNumber: 14,
                columnNumber: 14
            }, this);
        case 2:
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("g", {
                className: "avatar-nose",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ellipse", {
                        cx: cx,
                        cy: cy,
                        rx: "5",
                        ry: "4.5",
                        fill: fill,
                        stroke: "#00000020",
                        strokeWidth: "0.5"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/noses.tsx",
                        lineNumber: 18,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                        cx: cx - 2.5,
                        cy: cy + 1,
                        r: "1.5",
                        fill: "#00000010"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/noses.tsx",
                        lineNumber: 19,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                        cx: cx + 2.5,
                        cy: cy + 1,
                        r: "1.5",
                        fill: "#00000010"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/noses.tsx",
                        lineNumber: 20,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/noses.tsx",
                lineNumber: 17,
                columnNumber: 9
            }, this);
        case 3:
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                d: "M".concat(cx, ",").concat(cy - 6, " Q").concat(cx + 3, ",").concat(cy - 2, " ").concat(cx + 2, ",").concat(cy + 2, " Q").concat(cx, ",").concat(cy + 4, " ").concat(cx - 2, ",").concat(cy + 2, " Q").concat(cx - 3, ",").concat(cy - 2, " ").concat(cx, ",").concat(cy - 6, "Z"),
                fill: fill,
                stroke: "#00000020",
                strokeWidth: "0.5"
            }, void 0, false, {
                fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/noses.tsx",
                lineNumber: 25,
                columnNumber: 9
            }, this);
        case 4:
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("g", {
                className: "avatar-nose",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ellipse", {
                    cx: cx,
                    cy: cy,
                    rx: "6",
                    ry: "3",
                    fill: fill,
                    stroke: "#00000020",
                    strokeWidth: "0.5"
                }, void 0, false, {
                    fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/noses.tsx",
                    lineNumber: 35,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/noses.tsx",
                lineNumber: 34,
                columnNumber: 9
            }, this);
        case 5:
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                d: "M".concat(cx, ",").concat(cy - 5, " L").concat(cx + 3, ",").concat(cy + 3, " L").concat(cx - 3, ",").concat(cy + 3, "Z"),
                fill: fill,
                stroke: "#00000020",
                strokeWidth: "0.5"
            }, void 0, false, {
                fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/noses.tsx",
                lineNumber: 40,
                columnNumber: 9
            }, this);
        case 6:
        default:
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                d: "M".concat(cx, ",").concat(cy - 5, " Q").concat(cx + 4, ",").concat(cy, " ").concat(cx + 2, ",").concat(cy + 4, " Q").concat(cx, ",").concat(cy + 5, " ").concat(cx - 2, ",").concat(cy + 4, " Q").concat(cx - 4, ",").concat(cy, " ").concat(cx, ",").concat(cy - 5, "Z"),
                fill: fill,
                stroke: "#00000020",
                strokeWidth: "0.5"
            }, void 0, false, {
                fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/noses.tsx",
                lineNumber: 50,
                columnNumber: 9
            }, this);
    }
}
_c = Nose;
var _c;
__turbopack_context__.k.register(_c, "Nose");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/Projects/fmko/packages/ui/src/avatar/parts/mouths.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Mouth",
    ()=>Mouth
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
;
function Mouth(param) {
    let { variant } = param;
    const cx = 50;
    const cy = 68;
    switch(variant){
        case 1:
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                d: "M".concat(cx - 8, ",").concat(cy, " Q").concat(cx, ",").concat(cy + 8, " ").concat(cx + 8, ",").concat(cy),
                fill: "none",
                stroke: "#333",
                strokeWidth: "2",
                strokeLinecap: "round"
            }, void 0, false, {
                fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/mouths.tsx",
                lineNumber: 14,
                columnNumber: 9
            }, this);
        case 2:
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("line", {
                x1: cx - 6,
                y1: cy,
                x2: cx + 6,
                y2: cy,
                stroke: "#333",
                strokeWidth: "2",
                strokeLinecap: "round"
            }, void 0, false, {
                fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/mouths.tsx",
                lineNumber: 24,
                columnNumber: 9
            }, this);
        case 3:
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                d: "M".concat(cx - 8, ",").concat(cy + 3, " Q").concat(cx, ",").concat(cy - 5, " ").concat(cx + 8, ",").concat(cy + 3),
                fill: "none",
                stroke: "#333",
                strokeWidth: "2",
                strokeLinecap: "round"
            }, void 0, false, {
                fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/mouths.tsx",
                lineNumber: 33,
                columnNumber: 9
            }, this);
        case 4:
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("g", {
                className: "avatar-mouth",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ellipse", {
                        cx: cx,
                        cy: cy,
                        rx: "5",
                        ry: "6",
                        fill: "#333"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/mouths.tsx",
                        lineNumber: 44,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ellipse", {
                        cx: cx,
                        cy: cy - 1,
                        rx: "4",
                        ry: "3",
                        fill: "#8B0000"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/mouths.tsx",
                        lineNumber: 45,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/mouths.tsx",
                lineNumber: 43,
                columnNumber: 9
            }, this);
        case 5:
        default:
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("g", {
                className: "avatar-mouth",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                        d: "M".concat(cx - 9, ",").concat(cy, " Q").concat(cx, ",").concat(cy + 9, " ").concat(cx + 9, ",").concat(cy),
                        fill: "white",
                        stroke: "#333",
                        strokeWidth: "1.5"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/mouths.tsx",
                        lineNumber: 52,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                        d: "M".concat(cx - 9, ",").concat(cy, " Q").concat(cx, ",").concat(cy + 2, " ").concat(cx + 9, ",").concat(cy),
                        fill: "none",
                        stroke: "#333",
                        strokeWidth: "1"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/mouths.tsx",
                        lineNumber: 58,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/mouths.tsx",
                lineNumber: 51,
                columnNumber: 9
            }, this);
    }
}
_c = Mouth;
var _c;
__turbopack_context__.k.register(_c, "Mouth");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/Projects/fmko/packages/ui/src/avatar/parts/ears.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Ears",
    ()=>Ears
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
;
function Ears(param) {
    let { variant, fill, shadow } = param;
    switch(variant){
        case 1:
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("g", {
                className: "avatar-ears",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ellipse", {
                        cx: 14,
                        cy: 50,
                        rx: "4",
                        ry: "6",
                        fill: fill,
                        stroke: shadow,
                        strokeWidth: "1"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/ears.tsx",
                        lineNumber: 14,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ellipse", {
                        cx: 86,
                        cy: 50,
                        rx: "4",
                        ry: "6",
                        fill: fill,
                        stroke: shadow,
                        strokeWidth: "1"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/ears.tsx",
                        lineNumber: 15,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/ears.tsx",
                lineNumber: 13,
                columnNumber: 9
            }, this);
        case 2:
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("g", {
                className: "avatar-ears",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ellipse", {
                        cx: 12,
                        cy: 50,
                        rx: "5",
                        ry: "8",
                        fill: fill,
                        stroke: shadow,
                        strokeWidth: "1"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/ears.tsx",
                        lineNumber: 21,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ellipse", {
                        cx: 88,
                        cy: 50,
                        rx: "5",
                        ry: "8",
                        fill: fill,
                        stroke: shadow,
                        strokeWidth: "1"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/ears.tsx",
                        lineNumber: 22,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/ears.tsx",
                lineNumber: 20,
                columnNumber: 9
            }, this);
        case 3:
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("g", {
                className: "avatar-ears",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ellipse", {
                        cx: 8,
                        cy: 50,
                        rx: "8",
                        ry: "10",
                        fill: fill,
                        stroke: shadow,
                        strokeWidth: "1"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/ears.tsx",
                        lineNumber: 28,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                        d: "M10,45 Q13,50 10,55",
                        fill: "none",
                        stroke: shadow,
                        strokeWidth: "0.8"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/ears.tsx",
                        lineNumber: 29,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ellipse", {
                        cx: 92,
                        cy: 50,
                        rx: "8",
                        ry: "10",
                        fill: fill,
                        stroke: shadow,
                        strokeWidth: "1"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/ears.tsx",
                        lineNumber: 30,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                        d: "M90,45 Q87,50 90,55",
                        fill: "none",
                        stroke: shadow,
                        strokeWidth: "0.8"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/ears.tsx",
                        lineNumber: 31,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/ears.tsx",
                lineNumber: 27,
                columnNumber: 9
            }, this);
        case 4:
        default:
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("g", {
                className: "avatar-ears",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                        d: "M16,42 L8,48 L16,58",
                        fill: fill,
                        stroke: shadow,
                        strokeWidth: "1"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/ears.tsx",
                        lineNumber: 38,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                        d: "M84,42 L92,48 L84,58",
                        fill: fill,
                        stroke: shadow,
                        strokeWidth: "1"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/ears.tsx",
                        lineNumber: 39,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/ears.tsx",
                lineNumber: 37,
                columnNumber: 9
            }, this);
    }
}
_c = Ears;
var _c;
__turbopack_context__.k.register(_c, "Ears");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/Projects/fmko/packages/ui/src/avatar/parts/bodies.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Body",
    ()=>Body
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
;
const BODY_PATHS = {
    thin: "M35,90 L33,130 Q32,145 38,150 L62,150 Q68,145 67,130 L65,90",
    athletic: "M30,90 L28,130 Q27,145 36,150 L64,150 Q73,145 72,130 L70,90",
    normal: "M28,90 L26,130 Q25,148 35,152 L65,152 Q75,148 74,130 L72,90",
    stocky: "M24,90 L22,130 Q20,148 33,155 L67,155 Q80,148 78,130 L76,90",
    obese: "M20,90 L16,130 Q14,150 30,158 L70,158 Q86,150 84,130 L80,90"
};
function Body(param) {
    let { bodyType, fill, jerseyColor } = param;
    const path = BODY_PATHS[bodyType];
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("g", {
        className: "avatar-body",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("rect", {
                x: 43,
                y: 85,
                width: 14,
                height: 10,
                rx: 3,
                fill: fill
            }, void 0, false, {
                fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/bodies.tsx",
                lineNumber: 23,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                d: path,
                fill: jerseyColor,
                stroke: "#00000020",
                strokeWidth: "1"
            }, void 0, false, {
                fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/bodies.tsx",
                lineNumber: 25,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/bodies.tsx",
        lineNumber: 21,
        columnNumber: 5
    }, this);
}
_c = Body;
var _c;
__turbopack_context__.k.register(_c, "Body");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/Projects/fmko/packages/ui/src/avatar/parts/hair.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Hair",
    ()=>Hair
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
;
/** SVG hair paths mapped by style name */ const HAIR_PATHS = {
    short_classic: (c)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
            d: "M22,35 Q25,12 50,10 Q75,12 78,35 L75,30 Q72,18 50,16 Q28,18 25,30Z",
            fill: c
        }, void 0, false, {
            fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/hair.tsx",
            lineNumber: 11,
            columnNumber: 5
        }, ("TURBOPACK compile-time value", void 0)),
    buzz_cut: (c)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
            d: "M20,40 Q22,14 50,12 Q78,14 80,40 L78,38 Q76,18 50,16 Q24,18 22,38Z",
            fill: c,
            opacity: "0.7"
        }, void 0, false, {
            fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/hair.tsx",
            lineNumber: 14,
            columnNumber: 5
        }, ("TURBOPACK compile-time value", void 0)),
    bald: ()=>null,
    receding: (c)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("g", {
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                d: "M28,32 Q35,16 50,15 Q65,16 72,32 L70,28 Q64,20 50,19 Q36,20 30,28Z",
                fill: c
            }, void 0, false, {
                fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/hair.tsx",
                lineNumber: 19,
                columnNumber: 7
            }, ("TURBOPACK compile-time value", void 0))
        }, void 0, false, {
            fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/hair.tsx",
            lineNumber: 18,
            columnNumber: 5
        }, ("TURBOPACK compile-time value", void 0)),
    bald_top: (c)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("g", {
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                    d: "M15,50 Q14,38 20,35 L22,40 Q18,42 17,50Z",
                    fill: c
                }, void 0, false, {
                    fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/hair.tsx",
                    lineNumber: 24,
                    columnNumber: 7
                }, ("TURBOPACK compile-time value", void 0)),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                    d: "M85,50 Q86,38 80,35 L78,40 Q82,42 83,50Z",
                    fill: c
                }, void 0, false, {
                    fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/hair.tsx",
                    lineNumber: 25,
                    columnNumber: 7
                }, ("TURBOPACK compile-time value", void 0))
            ]
        }, void 0, true, {
            fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/hair.tsx",
            lineNumber: 23,
            columnNumber: 5
        }, ("TURBOPACK compile-time value", void 0)),
    medium: (c)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
            d: "M18,50 Q18,10 50,8 Q82,10 82,50 L80,45 Q78,16 50,14 Q22,16 20,45Z",
            fill: c
        }, void 0, false, {
            fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/hair.tsx",
            lineNumber: 29,
            columnNumber: 5
        }, ("TURBOPACK compile-time value", void 0)),
    long: (c)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("g", {
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                    d: "M16,55 Q15,8 50,6 Q85,8 84,55 L82,50 Q80,14 50,12 Q20,14 18,50Z",
                    fill: c
                }, void 0, false, {
                    fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/hair.tsx",
                    lineNumber: 33,
                    columnNumber: 7
                }, ("TURBOPACK compile-time value", void 0)),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                    d: "M16,55 Q15,70 18,80 L20,75 Q18,65 18,55Z",
                    fill: c
                }, void 0, false, {
                    fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/hair.tsx",
                    lineNumber: 34,
                    columnNumber: 7
                }, ("TURBOPACK compile-time value", void 0)),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                    d: "M84,55 Q85,70 82,80 L80,75 Q82,65 82,55Z",
                    fill: c
                }, void 0, false, {
                    fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/hair.tsx",
                    lineNumber: 35,
                    columnNumber: 7
                }, ("TURBOPACK compile-time value", void 0))
            ]
        }, void 0, true, {
            fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/hair.tsx",
            lineNumber: 32,
            columnNumber: 5
        }, ("TURBOPACK compile-time value", void 0)),
    dreads: (c)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("g", {
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                    d: "M18,45 Q18,10 50,8 Q82,10 82,45",
                    fill: c
                }, void 0, false, {
                    fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/hair.tsx",
                    lineNumber: 40,
                    columnNumber: 7
                }, ("TURBOPACK compile-time value", void 0)),
                [
                    20,
                    30,
                    40,
                    50,
                    60,
                    70,
                    80
                ].map((x)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("line", {
                        x1: x * 0.85 + 5,
                        y1: 45,
                        x2: x * 0.85 + 3,
                        y2: 75,
                        stroke: c,
                        strokeWidth: "3",
                        strokeLinecap: "round"
                    }, x, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/hair.tsx",
                        lineNumber: 42,
                        columnNumber: 9
                    }, ("TURBOPACK compile-time value", void 0)))
            ]
        }, void 0, true, {
            fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/hair.tsx",
            lineNumber: 39,
            columnNumber: 5
        }, ("TURBOPACK compile-time value", void 0)),
    sideburns: (c)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("g", {
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                    d: "M22,35 Q25,14 50,12 Q75,14 78,35 L75,30 Q72,18 50,16 Q28,18 25,30Z",
                    fill: c
                }, void 0, false, {
                    fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/hair.tsx",
                    lineNumber: 48,
                    columnNumber: 7
                }, ("TURBOPACK compile-time value", void 0)),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("rect", {
                    x: 16,
                    y: 40,
                    width: 5,
                    height: 18,
                    rx: 2,
                    fill: c
                }, void 0, false, {
                    fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/hair.tsx",
                    lineNumber: 49,
                    columnNumber: 7
                }, ("TURBOPACK compile-time value", void 0)),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("rect", {
                    x: 79,
                    y: 40,
                    width: 5,
                    height: 18,
                    rx: 2,
                    fill: c
                }, void 0, false, {
                    fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/hair.tsx",
                    lineNumber: 50,
                    columnNumber: 7
                }, ("TURBOPACK compile-time value", void 0))
            ]
        }, void 0, true, {
            fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/hair.tsx",
            lineNumber: 47,
            columnNumber: 5
        }, ("TURBOPACK compile-time value", void 0)),
    fringe: (c)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("g", {
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                    d: "M20,38 Q22,12 50,10 Q78,12 80,38 L78,34 Q76,16 50,14 Q24,16 22,34Z",
                    fill: c
                }, void 0, false, {
                    fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/hair.tsx",
                    lineNumber: 55,
                    columnNumber: 7
                }, ("TURBOPACK compile-time value", void 0)),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                    d: "M22,34 Q30,28 42,36 Q35,30 28,35Z",
                    fill: c
                }, void 0, false, {
                    fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/hair.tsx",
                    lineNumber: 56,
                    columnNumber: 7
                }, ("TURBOPACK compile-time value", void 0))
            ]
        }, void 0, true, {
            fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/hair.tsx",
            lineNumber: 54,
            columnNumber: 5
        }, ("TURBOPACK compile-time value", void 0)),
    mohawk: (c)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
            d: "M42,30 Q44,4 50,2 Q56,4 58,30 L56,25 Q54,8 50,6 Q46,8 44,25Z",
            fill: c
        }, void 0, false, {
            fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/hair.tsx",
            lineNumber: 60,
            columnNumber: 5
        }, ("TURBOPACK compile-time value", void 0)),
    mullet: (c)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("g", {
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                    d: "M22,35 Q25,14 50,12 Q75,14 78,35 L75,30 Q72,18 50,16 Q28,18 25,30Z",
                    fill: c
                }, void 0, false, {
                    fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/hair.tsx",
                    lineNumber: 64,
                    columnNumber: 7
                }, ("TURBOPACK compile-time value", void 0)),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                    d: "M25,35 Q22,55 24,80 L28,75 Q26,55 28,38Z",
                    fill: c
                }, void 0, false, {
                    fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/hair.tsx",
                    lineNumber: 65,
                    columnNumber: 7
                }, ("TURBOPACK compile-time value", void 0)),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                    d: "M75,35 Q78,55 76,80 L72,75 Q74,55 72,38Z",
                    fill: c
                }, void 0, false, {
                    fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/hair.tsx",
                    lineNumber: 66,
                    columnNumber: 7
                }, ("TURBOPACK compile-time value", void 0))
            ]
        }, void 0, true, {
            fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/hair.tsx",
            lineNumber: 63,
            columnNumber: 5
        }, ("TURBOPACK compile-time value", void 0)),
    combover: (c)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
            d: "M20,40 Q22,18 50,16 Q60,16 72,22 L68,20 Q58,18 50,18 Q26,20 24,38Z",
            fill: c
        }, void 0, false, {
            fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/hair.tsx",
            lineNumber: 70,
            columnNumber: 5
        }, ("TURBOPACK compile-time value", void 0)),
    curly: (c)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("g", {
            children: [
                [
                    25,
                    33,
                    41,
                    50,
                    59,
                    67,
                    75
                ].map((x)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                        cx: x,
                        cy: 18 + Math.sin(x) * 3,
                        r: "7",
                        fill: c
                    }, x, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/hair.tsx",
                        lineNumber: 75,
                        columnNumber: 9
                    }, ("TURBOPACK compile-time value", void 0))),
                [
                    28,
                    38,
                    48,
                    58,
                    68,
                    72
                ].map((x)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                        cx: x,
                        cy: 12 + Math.cos(x) * 2,
                        r: "5",
                        fill: c
                    }, x, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/hair.tsx",
                        lineNumber: 78,
                        columnNumber: 9
                    }, ("TURBOPACK compile-time value", void 0)))
            ]
        }, void 0, true, {
            fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/hair.tsx",
            lineNumber: 73,
            columnNumber: 5
        }, ("TURBOPACK compile-time value", void 0)),
    spiky: (c)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("g", {
            children: [
                [
                    30,
                    38,
                    46,
                    54,
                    62,
                    70
                ].map((x)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                        d: "M".concat(x - 3, ",25 L").concat(x, ",").concat(6 + x % 7, " L").concat(x + 3, ",25Z"),
                        fill: c
                    }, x, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/hair.tsx",
                        lineNumber: 85,
                        columnNumber: 9
                    }, ("TURBOPACK compile-time value", void 0))),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                    d: "M22,35 Q25,20 50,18 Q75,20 78,35 L75,32 Q72,22 50,20 Q28,22 25,32Z",
                    fill: c
                }, void 0, false, {
                    fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/hair.tsx",
                    lineNumber: 87,
                    columnNumber: 7
                }, ("TURBOPACK compile-time value", void 0))
            ]
        }, void 0, true, {
            fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/hair.tsx",
            lineNumber: 83,
            columnNumber: 5
        }, ("TURBOPACK compile-time value", void 0))
};
function Hair(param) {
    let { style, color } = param;
    const renderer = HAIR_PATHS[style];
    if (!renderer) return null;
    const result = renderer(color);
    return result ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("g", {
        className: "avatar-hair",
        children: result
    }, void 0, false, {
        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/hair.tsx",
        lineNumber: 96,
        columnNumber: 19
    }, this) : null;
}
_c = Hair;
var _c;
__turbopack_context__.k.register(_c, "Hair");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/Projects/fmko/packages/ui/src/avatar/parts/facial-hair.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "FacialHair",
    ()=>FacialHair
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
;
const FACIAL_HAIR_RENDERERS = {
    none: ()=>null,
    stubble_1day: (c)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("g", {
            opacity: "0.3",
            children: Array.from({
                length: 20
            }, (_, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                    cx: 35 + i % 5 * 6 + Math.sin(i) * 2,
                    cy: 65 + Math.floor(i / 5) * 4,
                    r: "0.5",
                    fill: c
                }, i, false, {
                    fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/facial-hair.tsx",
                    lineNumber: 13,
                    columnNumber: 9
                }, ("TURBOPACK compile-time value", void 0)))
        }, void 0, false, {
            fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/facial-hair.tsx",
            lineNumber: 11,
            columnNumber: 5
        }, ("TURBOPACK compile-time value", void 0)),
    stubble_3day: (c)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("g", {
            opacity: "0.5",
            children: Array.from({
                length: 35
            }, (_, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                    cx: 33 + i % 7 * 5 + Math.sin(i) * 1.5,
                    cy: 62 + Math.floor(i / 7) * 4,
                    r: "0.7",
                    fill: c
                }, i, false, {
                    fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/facial-hair.tsx",
                    lineNumber: 20,
                    columnNumber: 9
                }, ("TURBOPACK compile-time value", void 0)))
        }, void 0, false, {
            fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/facial-hair.tsx",
            lineNumber: 18,
            columnNumber: 5
        }, ("TURBOPACK compile-time value", void 0)),
    mustache: (c)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
            d: "M40,63 Q45,60 50,62 Q55,60 60,63 Q55,66 50,65 Q45,66 40,63Z",
            fill: c
        }, void 0, false, {
            fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/facial-hair.tsx",
            lineNumber: 25,
            columnNumber: 5
        }, ("TURBOPACK compile-time value", void 0)),
    mustache_goatee: (c)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("g", {
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                    d: "M40,63 Q45,60 50,62 Q55,60 60,63 Q55,66 50,65 Q45,66 40,63Z",
                    fill: c
                }, void 0, false, {
                    fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/facial-hair.tsx",
                    lineNumber: 29,
                    columnNumber: 7
                }, ("TURBOPACK compile-time value", void 0)),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ellipse", {
                    cx: 50,
                    cy: 76,
                    rx: 5,
                    ry: 6,
                    fill: c
                }, void 0, false, {
                    fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/facial-hair.tsx",
                    lineNumber: 30,
                    columnNumber: 7
                }, ("TURBOPACK compile-time value", void 0))
            ]
        }, void 0, true, {
            fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/facial-hair.tsx",
            lineNumber: 28,
            columnNumber: 5
        }, ("TURBOPACK compile-time value", void 0)),
    full_short: (c)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("g", {
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                d: "M35,62 Q35,58 50,60 Q65,58 65,62 L65,78 Q65,85 50,86 Q35,85 35,78Z",
                fill: c,
                opacity: "0.7"
            }, void 0, false, {
                fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/facial-hair.tsx",
                lineNumber: 35,
                columnNumber: 7
            }, ("TURBOPACK compile-time value", void 0))
        }, void 0, false, {
            fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/facial-hair.tsx",
            lineNumber: 34,
            columnNumber: 5
        }, ("TURBOPACK compile-time value", void 0)),
    full_long: (c)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("g", {
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                d: "M33,60 Q33,56 50,58 Q67,56 67,60 L68,85 Q68,95 50,96 Q32,95 32,85Z",
                fill: c,
                opacity: "0.7"
            }, void 0, false, {
                fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/facial-hair.tsx",
                lineNumber: 40,
                columnNumber: 7
            }, ("TURBOPACK compile-time value", void 0))
        }, void 0, false, {
            fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/facial-hair.tsx",
            lineNumber: 39,
            columnNumber: 5
        }, ("TURBOPACK compile-time value", void 0)),
    goatee: (c)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ellipse", {
            cx: 50,
            cy: 76,
            rx: 6,
            ry: 8,
            fill: c,
            opacity: "0.8"
        }, void 0, false, {
            fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/facial-hair.tsx",
            lineNumber: 44,
            columnNumber: 5
        }, ("TURBOPACK compile-time value", void 0)),
    sideburns_beard: (c)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("g", {
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("rect", {
                    x: 16,
                    y: 45,
                    width: 5,
                    height: 25,
                    rx: 2,
                    fill: c,
                    opacity: "0.7"
                }, void 0, false, {
                    fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/facial-hair.tsx",
                    lineNumber: 48,
                    columnNumber: 7
                }, ("TURBOPACK compile-time value", void 0)),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("rect", {
                    x: 79,
                    y: 45,
                    width: 5,
                    height: 25,
                    rx: 2,
                    fill: c,
                    opacity: "0.7"
                }, void 0, false, {
                    fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/facial-hair.tsx",
                    lineNumber: 49,
                    columnNumber: 7
                }, ("TURBOPACK compile-time value", void 0))
            ]
        }, void 0, true, {
            fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/facial-hair.tsx",
            lineNumber: 47,
            columnNumber: 5
        }, ("TURBOPACK compile-time value", void 0)),
    unkempt: (c)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("g", {
            opacity: "0.6",
            children: Array.from({
                length: 40
            }, (_, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                    cx: 32 + i % 8 * 5 + Math.sin(i * 3) * 2,
                    cy: 60 + Math.floor(i / 8) * 5 + Math.cos(i * 2),
                    r: 0.6 + i % 3 * 0.3,
                    fill: c
                }, i, false, {
                    fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/facial-hair.tsx",
                    lineNumber: 55,
                    columnNumber: 9
                }, ("TURBOPACK compile-time value", void 0)))
        }, void 0, false, {
            fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/facial-hair.tsx",
            lineNumber: 53,
            columnNumber: 5
        }, ("TURBOPACK compile-time value", void 0))
};
function FacialHair(param) {
    let { style, color } = param;
    const renderer = FACIAL_HAIR_RENDERERS[style];
    if (!renderer) return null;
    const result = renderer(color);
    return result ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("g", {
        className: "avatar-facial-hair",
        children: result
    }, void 0, false, {
        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/facial-hair.tsx",
        lineNumber: 65,
        columnNumber: 19
    }, this) : null;
}
_c = FacialHair;
var _c;
__turbopack_context__.k.register(_c, "FacialHair");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/Projects/fmko/packages/ui/src/avatar/parts/glasses.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Glasses",
    ()=>Glasses
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
;
function Glasses(param) {
    let { style } = param;
    const y = 44;
    const lx = 37;
    const rx = 63;
    switch(style){
        case "none":
            return null;
        case "classic":
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("g", {
                className: "avatar-glasses",
                fill: "none",
                stroke: "#333",
                strokeWidth: "1.5",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("rect", {
                        x: lx - 8,
                        y: y - 6,
                        width: 16,
                        height: 12,
                        rx: 2
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/glasses.tsx",
                        lineNumber: 18,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("rect", {
                        x: rx - 8,
                        y: y - 6,
                        width: 16,
                        height: 12,
                        rx: 2
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/glasses.tsx",
                        lineNumber: 19,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("line", {
                        x1: lx + 8,
                        y1: y,
                        x2: rx - 8,
                        y2: y
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/glasses.tsx",
                        lineNumber: 20,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("line", {
                        x1: lx - 8,
                        y1: y,
                        x2: 14,
                        y2: y - 2
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/glasses.tsx",
                        lineNumber: 21,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("line", {
                        x1: rx + 8,
                        y1: y,
                        x2: 86,
                        y2: y - 2
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/glasses.tsx",
                        lineNumber: 22,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/glasses.tsx",
                lineNumber: 17,
                columnNumber: 9
            }, this);
        case "round":
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("g", {
                className: "avatar-glasses",
                fill: "none",
                stroke: "#333",
                strokeWidth: "1.5",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                        cx: lx,
                        cy: y,
                        r: "8"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/glasses.tsx",
                        lineNumber: 28,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                        cx: rx,
                        cy: y,
                        r: "8"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/glasses.tsx",
                        lineNumber: 29,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("line", {
                        x1: lx + 8,
                        y1: y,
                        x2: rx - 8,
                        y2: y
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/glasses.tsx",
                        lineNumber: 30,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("line", {
                        x1: lx - 8,
                        y1: y,
                        x2: 14,
                        y2: y - 2
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/glasses.tsx",
                        lineNumber: 31,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("line", {
                        x1: rx + 8,
                        y1: y,
                        x2: 86,
                        y2: y - 2
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/glasses.tsx",
                        lineNumber: 32,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/glasses.tsx",
                lineNumber: 27,
                columnNumber: 9
            }, this);
        case "thick":
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("g", {
                className: "avatar-glasses",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("rect", {
                        x: lx - 9,
                        y: y - 7,
                        width: 18,
                        height: 14,
                        rx: 3,
                        fill: "#33333320",
                        stroke: "#222",
                        strokeWidth: "2.5"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/glasses.tsx",
                        lineNumber: 38,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("rect", {
                        x: rx - 9,
                        y: y - 7,
                        width: 18,
                        height: 14,
                        rx: 3,
                        fill: "#33333320",
                        stroke: "#222",
                        strokeWidth: "2.5"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/glasses.tsx",
                        lineNumber: 39,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("line", {
                        x1: lx + 9,
                        y1: y,
                        x2: rx - 9,
                        y2: y,
                        stroke: "#222",
                        strokeWidth: "2.5"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/glasses.tsx",
                        lineNumber: 40,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("line", {
                        x1: lx - 9,
                        y1: y,
                        x2: 12,
                        y2: y - 2,
                        stroke: "#222",
                        strokeWidth: "2"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/glasses.tsx",
                        lineNumber: 41,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("line", {
                        x1: rx + 9,
                        y1: y,
                        x2: 88,
                        y2: y - 2,
                        stroke: "#222",
                        strokeWidth: "2"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/glasses.tsx",
                        lineNumber: 42,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/glasses.tsx",
                lineNumber: 37,
                columnNumber: 9
            }, this);
        case "sport":
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("g", {
                className: "avatar-glasses",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                    d: "M12,".concat(y - 2, " L").concat(lx - 10, ",").concat(y - 5, " Q").concat(lx, ",").concat(y - 8, " ").concat(lx + 10, ",").concat(y - 3, " L").concat(rx - 10, ",").concat(y - 3, " Q").concat(rx, ",").concat(y - 8, " ").concat(rx + 10, ",").concat(y - 5, " L88,").concat(y - 2),
                    fill: "#33333340",
                    stroke: "#555",
                    strokeWidth: "1.5"
                }, void 0, false, {
                    fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/glasses.tsx",
                    lineNumber: 48,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/glasses.tsx",
                lineNumber: 47,
                columnNumber: 9
            }, this);
        case "square":
        default:
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("g", {
                className: "avatar-glasses",
                fill: "none",
                stroke: "#333",
                strokeWidth: "1.5",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("rect", {
                        x: lx - 9,
                        y: y - 6,
                        width: 18,
                        height: 12,
                        rx: 1
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/glasses.tsx",
                        lineNumber: 56,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("rect", {
                        x: rx - 9,
                        y: y - 6,
                        width: 18,
                        height: 12,
                        rx: 1
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/glasses.tsx",
                        lineNumber: 57,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("line", {
                        x1: lx + 9,
                        y1: y,
                        x2: rx - 9,
                        y2: y
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/glasses.tsx",
                        lineNumber: 58,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("line", {
                        x1: lx - 9,
                        y1: y,
                        x2: 14,
                        y2: y - 2
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/glasses.tsx",
                        lineNumber: 59,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("line", {
                        x1: rx + 9,
                        y1: y,
                        x2: 86,
                        y2: y - 2
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/glasses.tsx",
                        lineNumber: 60,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/Projects/fmko/packages/ui/src/avatar/parts/glasses.tsx",
                lineNumber: 55,
                columnNumber: 9
            }, this);
    }
}
_c = Glasses;
var _c;
__turbopack_context__.k.register(_c, "Glasses");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/Projects/fmko/packages/ui/src/avatar/parts/index.ts [app-client] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([]);
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$packages$2f$ui$2f$src$2f$avatar$2f$parts$2f$heads$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/packages/ui/src/avatar/parts/heads.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$packages$2f$ui$2f$src$2f$avatar$2f$parts$2f$eyes$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/packages/ui/src/avatar/parts/eyes.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$packages$2f$ui$2f$src$2f$avatar$2f$parts$2f$noses$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/packages/ui/src/avatar/parts/noses.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$packages$2f$ui$2f$src$2f$avatar$2f$parts$2f$mouths$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/packages/ui/src/avatar/parts/mouths.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$packages$2f$ui$2f$src$2f$avatar$2f$parts$2f$ears$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/packages/ui/src/avatar/parts/ears.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$packages$2f$ui$2f$src$2f$avatar$2f$parts$2f$bodies$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/packages/ui/src/avatar/parts/bodies.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$packages$2f$ui$2f$src$2f$avatar$2f$parts$2f$hair$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/packages/ui/src/avatar/parts/hair.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$packages$2f$ui$2f$src$2f$avatar$2f$parts$2f$facial$2d$hair$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/packages/ui/src/avatar/parts/facial-hair.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$packages$2f$ui$2f$src$2f$avatar$2f$parts$2f$glasses$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/packages/ui/src/avatar/parts/glasses.tsx [app-client] (ecmascript)");
;
;
;
;
;
;
;
;
;
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/Projects/fmko/packages/ui/src/avatar/palettes.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/** Skin tone color palettes */ __turbopack_context__.s([
    "HAIR_COLORS",
    ()=>HAIR_COLORS,
    "SKIN_TONES",
    ()=>SKIN_TONES
]);
const SKIN_TONES = {
    light: {
        base: "#FDDCB5",
        shadow: "#E8C29A",
        highlight: "#FFF0DC"
    },
    medium_light: {
        base: "#E8B88A",
        shadow: "#D09E6E",
        highlight: "#F5D4AA"
    },
    medium: {
        base: "#C89060",
        shadow: "#A8724A",
        highlight: "#DEB080"
    },
    medium_dark: {
        base: "#8D5524",
        shadow: "#6E3F18",
        highlight: "#A8703A"
    },
    dark: {
        base: "#5C3310",
        shadow: "#42240A",
        highlight: "#7A4820"
    }
};
const HAIR_COLORS = {
    brown: "#5B3A1A",
    dark_brown: "#3B2210",
    black: "#1A1A1A",
    blonde: "#D4A843",
    light_brown: "#8B6E3E",
    red: "#A0330A",
    gray: "#8E8E8E",
    white: "#D0D0D0"
};
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/Projects/fmko/packages/ui/src/avatar/PlayerAvatar.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "PlayerAvatar",
    ()=>PlayerAvatar
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$packages$2f$ui$2f$src$2f$avatar$2f$parts$2f$index$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/Projects/fmko/packages/ui/src/avatar/parts/index.ts [app-client] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$packages$2f$ui$2f$src$2f$avatar$2f$parts$2f$heads$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/packages/ui/src/avatar/parts/heads.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$packages$2f$ui$2f$src$2f$avatar$2f$parts$2f$eyes$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/packages/ui/src/avatar/parts/eyes.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$packages$2f$ui$2f$src$2f$avatar$2f$parts$2f$noses$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/packages/ui/src/avatar/parts/noses.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$packages$2f$ui$2f$src$2f$avatar$2f$parts$2f$mouths$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/packages/ui/src/avatar/parts/mouths.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$packages$2f$ui$2f$src$2f$avatar$2f$parts$2f$ears$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/packages/ui/src/avatar/parts/ears.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$packages$2f$ui$2f$src$2f$avatar$2f$parts$2f$bodies$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/packages/ui/src/avatar/parts/bodies.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$packages$2f$ui$2f$src$2f$avatar$2f$parts$2f$hair$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/packages/ui/src/avatar/parts/hair.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$packages$2f$ui$2f$src$2f$avatar$2f$parts$2f$facial$2d$hair$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/packages/ui/src/avatar/parts/facial-hair.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$packages$2f$ui$2f$src$2f$avatar$2f$parts$2f$glasses$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/packages/ui/src/avatar/parts/glasses.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$packages$2f$ui$2f$src$2f$avatar$2f$palettes$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/packages/ui/src/avatar/palettes.ts [app-client] (ecmascript)");
;
;
;
const SIZES = {
    sm: 40,
    md: 80,
    lg: 200
};
function PlayerAvatar(param) {
    let { config, jerseyColor = "#2563eb", size = "md" } = param;
    var _SKIN_TONES_config_skinTone;
    const skin = (_SKIN_TONES_config_skinTone = __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$packages$2f$ui$2f$src$2f$avatar$2f$palettes$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SKIN_TONES"][config.skinTone]) !== null && _SKIN_TONES_config_skinTone !== void 0 ? _SKIN_TONES_config_skinTone : __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$packages$2f$ui$2f$src$2f$avatar$2f$palettes$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SKIN_TONES"].medium_light;
    var _HAIR_COLORS_config_hairColor;
    const hairColor = (_HAIR_COLORS_config_hairColor = __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$packages$2f$ui$2f$src$2f$avatar$2f$palettes$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["HAIR_COLORS"][config.hairColor]) !== null && _HAIR_COLORS_config_hairColor !== void 0 ? _HAIR_COLORS_config_hairColor : __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$packages$2f$ui$2f$src$2f$avatar$2f$palettes$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["HAIR_COLORS"].brown;
    const px = SIZES[size];
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
        width: px,
        height: px,
        viewBox: "0 0 100 160",
        xmlns: "http://www.w3.org/2000/svg",
        role: "img",
        "aria-label": "Player avatar",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$packages$2f$ui$2f$src$2f$avatar$2f$parts$2f$bodies$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Body"], {
                bodyType: config.bodyType,
                fill: skin.base,
                jerseyColor: jerseyColor
            }, void 0, false, {
                fileName: "[project]/Projects/fmko/packages/ui/src/avatar/PlayerAvatar.tsx",
                lineNumber: 46,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$packages$2f$ui$2f$src$2f$avatar$2f$parts$2f$ears$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Ears"], {
                variant: config.ears,
                fill: skin.base,
                shadow: skin.shadow
            }, void 0, false, {
                fileName: "[project]/Projects/fmko/packages/ui/src/avatar/PlayerAvatar.tsx",
                lineNumber: 49,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$packages$2f$ui$2f$src$2f$avatar$2f$parts$2f$heads$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Head"], {
                variant: config.head,
                fill: skin.base,
                shadow: skin.shadow
            }, void 0, false, {
                fileName: "[project]/Projects/fmko/packages/ui/src/avatar/PlayerAvatar.tsx",
                lineNumber: 52,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$packages$2f$ui$2f$src$2f$avatar$2f$parts$2f$eyes$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Eyes"], {
                variant: config.eyes
            }, void 0, false, {
                fileName: "[project]/Projects/fmko/packages/ui/src/avatar/PlayerAvatar.tsx",
                lineNumber: 55,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$packages$2f$ui$2f$src$2f$avatar$2f$parts$2f$noses$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Nose"], {
                variant: config.nose,
                fill: skin.shadow
            }, void 0, false, {
                fileName: "[project]/Projects/fmko/packages/ui/src/avatar/PlayerAvatar.tsx",
                lineNumber: 58,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$packages$2f$ui$2f$src$2f$avatar$2f$parts$2f$mouths$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Mouth"], {
                variant: config.mouth
            }, void 0, false, {
                fileName: "[project]/Projects/fmko/packages/ui/src/avatar/PlayerAvatar.tsx",
                lineNumber: 61,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$packages$2f$ui$2f$src$2f$avatar$2f$parts$2f$hair$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Hair"], {
                style: config.hair,
                color: hairColor
            }, void 0, false, {
                fileName: "[project]/Projects/fmko/packages/ui/src/avatar/PlayerAvatar.tsx",
                lineNumber: 64,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$packages$2f$ui$2f$src$2f$avatar$2f$parts$2f$facial$2d$hair$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["FacialHair"], {
                style: config.facialHair,
                color: hairColor
            }, void 0, false, {
                fileName: "[project]/Projects/fmko/packages/ui/src/avatar/PlayerAvatar.tsx",
                lineNumber: 67,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$packages$2f$ui$2f$src$2f$avatar$2f$parts$2f$glasses$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Glasses"], {
                style: config.glasses
            }, void 0, false, {
                fileName: "[project]/Projects/fmko/packages/ui/src/avatar/PlayerAvatar.tsx",
                lineNumber: 70,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/Projects/fmko/packages/ui/src/avatar/PlayerAvatar.tsx",
        lineNumber: 37,
        columnNumber: 5
    }, this);
}
_c = PlayerAvatar;
var _c;
__turbopack_context__.k.register(_c, "PlayerAvatar");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/Projects/fmko/packages/ui/src/avatar/index.ts [app-client] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([]);
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$packages$2f$ui$2f$src$2f$avatar$2f$PlayerAvatar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/packages/ui/src/avatar/PlayerAvatar.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$packages$2f$ui$2f$src$2f$avatar$2f$palettes$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/packages/ui/src/avatar/palettes.ts [app-client] (ecmascript)");
;
;
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
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
function getBarColor(value, max) {
    const pct = value / max;
    if (pct >= 0.75) return "bg-pitch-400";
    if (pct >= 0.55) return "bg-pitch-500";
    if (pct >= 0.35) return "bg-gold-500";
    if (pct >= 0.2) return "bg-orange-400";
    return "bg-card-red";
}
function StatBar(param) {
    let { label, value, max = 100 } = param;
    const pct = value / max * 100;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex items-center gap-3",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: "text-xs font-medium text-muted w-20 text-right truncate",
                children: label
            }, void 0, false, {
                fileName: "[project]/Projects/fmko/apps/web/src/components/ui/stat-bar.tsx",
                lineNumber: 23,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "h-full rounded-full transition-all ".concat(getBarColor(value, max)),
                    style: {
                        width: "".concat(pct, "%")
                    }
                }, void 0, false, {
                    fileName: "[project]/Projects/fmko/apps/web/src/components/ui/stat-bar.tsx",
                    lineNumber: 27,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/Projects/fmko/apps/web/src/components/ui/stat-bar.tsx",
                lineNumber: 26,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: "text-sm font-heading font-bold tabular-nums w-8 text-right",
                children: Math.round(value)
            }, void 0, false, {
                fileName: "[project]/Projects/fmko/apps/web/src/components/ui/stat-bar.tsx",
                lineNumber: 32,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/Projects/fmko/apps/web/src/components/ui/stat-bar.tsx",
        lineNumber: 22,
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
"[project]/Projects/fmko/apps/web/src/app/dashboard/page.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>DashboardPage
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$apps$2f$web$2f$src$2f$context$2f$team$2d$context$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/apps/web/src/context/team-context.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$apps$2f$web$2f$src$2f$lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/apps/web/src/lib/api.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$packages$2f$ui$2f$src$2f$avatar$2f$index$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/Projects/fmko/packages/ui/src/avatar/index.ts [app-client] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$packages$2f$ui$2f$src$2f$avatar$2f$PlayerAvatar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/packages/ui/src/avatar/PlayerAvatar.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$apps$2f$web$2f$src$2f$components$2f$ui$2f$index$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/Projects/fmko/apps/web/src/components/ui/index.ts [app-client] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$apps$2f$web$2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/apps/web/src/components/ui/card.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
;
;
function DashboardPage() {
    _s();
    const { teamId } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$apps$2f$web$2f$src$2f$context$2f$team$2d$context$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTeam"])();
    const [team, setTeam] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [players, setPlayers] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const [loading, setLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(true);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "DashboardPage.useEffect": ()=>{
            if (!teamId) return;
            Promise.all([
                (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$apps$2f$web$2f$src$2f$lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiFetch"])("/api/teams/".concat(teamId)),
                (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$apps$2f$web$2f$src$2f$lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiFetch"])("/api/teams/".concat(teamId, "/players"))
            ]).then({
                "DashboardPage.useEffect": (param)=>{
                    let [t, p] = param;
                    setTeam(t);
                    setPlayers(p);
                    setLoading(false);
                }
            }["DashboardPage.useEffect"]).catch({
                "DashboardPage.useEffect": ()=>setLoading(false)
            }["DashboardPage.useEffect"]);
        }
    }["DashboardPage.useEffect"], [
        teamId
    ]);
    if (loading) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "p-6 flex items-center justify-center min-h-[50vh]",
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "w-8 h-8 border-3 border-pitch-500 border-t-transparent rounded-full animate-spin"
            }, void 0, false, {
                fileName: "[project]/Projects/fmko/apps/web/src/app/dashboard/page.tsx",
                lineNumber: 30,
                columnNumber: 9
            }, this)
        }, void 0, false, {
            fileName: "[project]/Projects/fmko/apps/web/src/app/dashboard/page.tsx",
            lineNumber: 29,
            columnNumber: 7
        }, this);
    }
    if (!team) return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "p-6",
        children: "Tým nenalezen."
    }, void 0, false, {
        fileName: "[project]/Projects/fmko/apps/web/src/app/dashboard/page.tsx",
        lineNumber: 35,
        columnNumber: 21
    }, this);
    const fitCount = players.filter((p)=>{
        var _p_physical;
        var _p_physical_stamina;
        return ((_p_physical_stamina = (_p_physical = p.physical) === null || _p_physical === void 0 ? void 0 : _p_physical.stamina) !== null && _p_physical_stamina !== void 0 ? _p_physical_stamina : 0) > 3;
    }).length;
    const injuredCount = players.length - fitCount;
    var _team_budget;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "p-4 sm:p-6 max-w-3xl mx-auto space-y-4",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "rounded-card p-5 text-white",
                style: {
                    backgroundColor: team.primary_color || "#2D5F2D"
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
                        className: "font-heading text-2xl font-bold",
                        children: team.name
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/apps/web/src/app/dashboard/page.tsx",
                        lineNumber: 44,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "text-white/70 text-sm mt-1",
                        children: [
                            team.village_name,
                            " · ",
                            team.district
                        ]
                    }, void 0, true, {
                        fileName: "[project]/Projects/fmko/apps/web/src/app/dashboard/page.tsx",
                        lineNumber: 45,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "text-white/70 text-sm",
                        children: [
                            "Rozpočet: ",
                            ((_team_budget = team.budget) !== null && _team_budget !== void 0 ? _team_budget : 0).toLocaleString("cs"),
                            " Kč · ",
                            players.length,
                            " hráčů"
                        ]
                    }, void 0, true, {
                        fileName: "[project]/Projects/fmko/apps/web/src/app/dashboard/page.tsx",
                        lineNumber: 48,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/Projects/fmko/apps/web/src/app/dashboard/page.tsx",
                lineNumber: 43,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$apps$2f$web$2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Card"], {
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$apps$2f$web$2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CardBody"], {
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "text-xs text-muted uppercase font-heading font-bold mb-3",
                            children: "Stav kádru"
                        }, void 0, false, {
                            fileName: "[project]/Projects/fmko/apps/web/src/app/dashboard/page.tsx",
                            lineNumber: 56,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "grid grid-cols-3 gap-3 text-center",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(StatusItem, {
                                    value: players.length,
                                    label: "Celkem",
                                    color: "text-pitch-500"
                                }, void 0, false, {
                                    fileName: "[project]/Projects/fmko/apps/web/src/app/dashboard/page.tsx",
                                    lineNumber: 60,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(StatusItem, {
                                    value: fitCount,
                                    label: "Fit",
                                    color: "text-pitch-500"
                                }, void 0, false, {
                                    fileName: "[project]/Projects/fmko/apps/web/src/app/dashboard/page.tsx",
                                    lineNumber: 61,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(StatusItem, {
                                    value: injuredCount,
                                    label: "Mimo",
                                    color: "text-card-red"
                                }, void 0, false, {
                                    fileName: "[project]/Projects/fmko/apps/web/src/app/dashboard/page.tsx",
                                    lineNumber: 62,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/Projects/fmko/apps/web/src/app/dashboard/page.tsx",
                            lineNumber: 59,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/Projects/fmko/apps/web/src/app/dashboard/page.tsx",
                    lineNumber: 55,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/Projects/fmko/apps/web/src/app/dashboard/page.tsx",
                lineNumber: 54,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$apps$2f$web$2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Card"], {
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$apps$2f$web$2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CardBody"], {
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "text-xs text-muted uppercase font-heading font-bold mb-3",
                            children: "Nejlepší hráči"
                        }, void 0, false, {
                            fileName: "[project]/Projects/fmko/apps/web/src/app/dashboard/page.tsx",
                            lineNumber: 70,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "space-y-2",
                            children: [
                                ...players
                            ].sort((a, b)=>b.overall_rating - a.overall_rating).slice(0, 5).map((p)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "flex items-center gap-3",
                                    children: [
                                        p.avatar ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "w-8 h-8 shrink-0",
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$packages$2f$ui$2f$src$2f$avatar$2f$PlayerAvatar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PlayerAvatar"], {
                                                config: p.avatar,
                                                size: "sm",
                                                jerseyColor: team.primary_color || "#2D5F2D"
                                            }, void 0, false, {
                                                fileName: "[project]/Projects/fmko/apps/web/src/app/dashboard/page.tsx",
                                                lineNumber: 77,
                                                columnNumber: 53
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/Projects/fmko/apps/web/src/app/dashboard/page.tsx",
                                            lineNumber: 77,
                                            columnNumber: 19
                                        }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs",
                                            style: {
                                                backgroundColor: team.primary_color || "#2D5F2D"
                                            },
                                            children: p.first_name[0]
                                        }, void 0, false, {
                                            fileName: "[project]/Projects/fmko/apps/web/src/app/dashboard/page.tsx",
                                            lineNumber: 79,
                                            columnNumber: 19
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "flex-1 min-w-0",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "text-sm font-medium truncate",
                                                    children: [
                                                        p.first_name,
                                                        " ",
                                                        p.last_name,
                                                        p.nickname && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            className: "text-gold-500 ml-1",
                                                            children: [
                                                                "„",
                                                                p.nickname,
                                                                "“"
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/Projects/fmko/apps/web/src/app/dashboard/page.tsx",
                                                            lineNumber: 84,
                                                            columnNumber: 36
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/Projects/fmko/apps/web/src/app/dashboard/page.tsx",
                                                    lineNumber: 82,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "text-xs text-muted",
                                                    children: [
                                                        p.position,
                                                        " · ",
                                                        p.age,
                                                        " let"
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/Projects/fmko/apps/web/src/app/dashboard/page.tsx",
                                                    lineNumber: 86,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/Projects/fmko/apps/web/src/app/dashboard/page.tsx",
                                            lineNumber: 81,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "font-heading font-bold tabular-nums",
                                            style: {
                                                color: team.primary_color || "#2D5F2D"
                                            },
                                            children: p.overall_rating
                                        }, void 0, false, {
                                            fileName: "[project]/Projects/fmko/apps/web/src/app/dashboard/page.tsx",
                                            lineNumber: 88,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, p.id, true, {
                                    fileName: "[project]/Projects/fmko/apps/web/src/app/dashboard/page.tsx",
                                    lineNumber: 75,
                                    columnNumber: 15
                                }, this))
                        }, void 0, false, {
                            fileName: "[project]/Projects/fmko/apps/web/src/app/dashboard/page.tsx",
                            lineNumber: 73,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/Projects/fmko/apps/web/src/app/dashboard/page.tsx",
                    lineNumber: 69,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/Projects/fmko/apps/web/src/app/dashboard/page.tsx",
                lineNumber: 68,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "grid grid-cols-2 gap-3",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                        href: "/dashboard/squad",
                        className: "bg-white rounded-card shadow-card p-4 text-center hover:shadow-hover transition-all",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "text-2xl mb-1",
                                children: "👥"
                            }, void 0, false, {
                                fileName: "[project]/Projects/fmko/apps/web/src/app/dashboard/page.tsx",
                                lineNumber: 100,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "font-heading font-bold text-sm",
                                children: "Kádr"
                            }, void 0, false, {
                                fileName: "[project]/Projects/fmko/apps/web/src/app/dashboard/page.tsx",
                                lineNumber: 101,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/Projects/fmko/apps/web/src/app/dashboard/page.tsx",
                        lineNumber: 99,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                        href: "/dashboard/match",
                        className: "bg-white rounded-card shadow-card p-4 text-center hover:shadow-hover transition-all",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "text-2xl mb-1",
                                children: "⚽"
                            }, void 0, false, {
                                fileName: "[project]/Projects/fmko/apps/web/src/app/dashboard/page.tsx",
                                lineNumber: 104,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "font-heading font-bold text-sm",
                                children: "Zápas"
                            }, void 0, false, {
                                fileName: "[project]/Projects/fmko/apps/web/src/app/dashboard/page.tsx",
                                lineNumber: 105,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/Projects/fmko/apps/web/src/app/dashboard/page.tsx",
                        lineNumber: 103,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                        href: "/dashboard/table",
                        className: "bg-white rounded-card shadow-card p-4 text-center hover:shadow-hover transition-all",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "text-2xl mb-1",
                                children: "📊"
                            }, void 0, false, {
                                fileName: "[project]/Projects/fmko/apps/web/src/app/dashboard/page.tsx",
                                lineNumber: 108,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "font-heading font-bold text-sm",
                                children: "Tabulka"
                            }, void 0, false, {
                                fileName: "[project]/Projects/fmko/apps/web/src/app/dashboard/page.tsx",
                                lineNumber: 109,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/Projects/fmko/apps/web/src/app/dashboard/page.tsx",
                        lineNumber: 107,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                        href: "/dashboard/squad",
                        className: "bg-white rounded-card shadow-card p-4 text-center hover:shadow-hover transition-all",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "text-2xl mb-1",
                                children: "🏋"
                            }, void 0, false, {
                                fileName: "[project]/Projects/fmko/apps/web/src/app/dashboard/page.tsx",
                                lineNumber: 112,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "font-heading font-bold text-sm",
                                children: "Tréninky"
                            }, void 0, false, {
                                fileName: "[project]/Projects/fmko/apps/web/src/app/dashboard/page.tsx",
                                lineNumber: 113,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/Projects/fmko/apps/web/src/app/dashboard/page.tsx",
                        lineNumber: 111,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/Projects/fmko/apps/web/src/app/dashboard/page.tsx",
                lineNumber: 98,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/Projects/fmko/apps/web/src/app/dashboard/page.tsx",
        lineNumber: 41,
        columnNumber: 5
    }, this);
}
_s(DashboardPage, "TwC3Gdfnfsc7A0WVd7/OPmey/QI=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$apps$2f$web$2f$src$2f$context$2f$team$2d$context$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTeam"]
    ];
});
_c = DashboardPage;
function StatusItem(param) {
    let { value, label, color } = param;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "font-heading font-bold text-2xl tabular-nums ".concat(color),
                children: value
            }, void 0, false, {
                fileName: "[project]/Projects/fmko/apps/web/src/app/dashboard/page.tsx",
                lineNumber: 123,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "text-xs text-muted",
                children: label
            }, void 0, false, {
                fileName: "[project]/Projects/fmko/apps/web/src/app/dashboard/page.tsx",
                lineNumber: 124,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/Projects/fmko/apps/web/src/app/dashboard/page.tsx",
        lineNumber: 122,
        columnNumber: 5
    }, this);
}
_c1 = StatusItem;
var _c, _c1;
__turbopack_context__.k.register(_c, "DashboardPage");
__turbopack_context__.k.register(_c1, "StatusItem");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=Projects_fmko_acea11a3._.js.map