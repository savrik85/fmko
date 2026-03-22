(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/Projects/fmko/apps/web/src/components/onboarding/step-location.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "StepLocation",
    ()=>StepLocation
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$apps$2f$web$2f$src$2f$lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/apps/web/src/lib/api.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
function getSizeBadge(size) {
    switch(size){
        case "hamlet":
            return {
                label: "Hardcore",
                emoji: "\u{1F525}",
                bg: "bg-card-red/10",
                text: "text-card-red"
            };
        case "village":
            return {
                label: "Výzva",
                emoji: "\u2B50",
                bg: "bg-gold-500/10",
                text: "text-gold-600"
            };
        case "town":
            return {
                label: "Dobrý start",
                emoji: "\u2705",
                bg: "bg-pitch-500/8",
                text: "text-pitch-500"
            };
        default:
            return {
                label: "Easy",
                emoji: "\u{1F7E2}",
                bg: "bg-pitch-100",
                text: "text-pitch-400"
            };
    }
}
function getSizeIcon(size) {
    switch(size){
        case "hamlet":
            return "\u{1F3D5}"; // camping (vesnice)
        case "village":
            return "\u{1F3E0}"; // house (obec)
        case "town":
            return "\u{1F3D8}"; // houses (městys)
        case "small_city":
            return "\u{1F3EB}"; // school (malé město)
        case "city":
            return "\u{1F3D9}"; // cityscape (město)
        default:
            return "\u{1F3DF}";
    }
}
function StepLocation(param) {
    let { onSelect } = param;
    _s();
    const [villages, setVillages] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const [loading, setLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(true);
    const [search, setSearch] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [selectedRegion, setSelectedRegion] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "StepLocation.useEffect": ()=>{
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$apps$2f$web$2f$src$2f$lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiFetch"])("/api/villages").then({
                "StepLocation.useEffect": (data)=>{
                    setVillages(data);
                    setLoading(false);
                }
            }["StepLocation.useEffect"]).catch({
                "StepLocation.useEffect": ()=>setLoading(false)
            }["StepLocation.useEffect"]);
        }
    }["StepLocation.useEffect"], []);
    const regions = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "StepLocation.useMemo[regions]": ()=>[
                ...new Set(villages.map({
                    "StepLocation.useMemo[regions]": (v)=>v.region
                }["StepLocation.useMemo[regions]"]))
            ].sort({
                "StepLocation.useMemo[regions]": (a, b)=>a.localeCompare(b, "cs")
            }["StepLocation.useMemo[regions]"])
    }["StepLocation.useMemo[regions]"], [
        villages
    ]);
    const filteredVillages = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "StepLocation.useMemo[filteredVillages]": ()=>{
            let result = villages;
            if (selectedRegion) result = result.filter({
                "StepLocation.useMemo[filteredVillages]": (v)=>v.region === selectedRegion
            }["StepLocation.useMemo[filteredVillages]"]);
            if (search) {
                const q = search.toLowerCase();
                result = result.filter({
                    "StepLocation.useMemo[filteredVillages]": (v)=>v.name.toLowerCase().includes(q)
                }["StepLocation.useMemo[filteredVillages]"]);
            }
            return result.sort({
                "StepLocation.useMemo[filteredVillages]": (a, b)=>a.name.localeCompare(b.name, "cs")
            }["StepLocation.useMemo[filteredVillages]"]);
        }
    }["StepLocation.useMemo[filteredVillages]"], [
        villages,
        selectedRegion,
        search
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex-1 flex flex-col p-5 sm:p-8 w-full max-w-5xl mx-auto",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "text-label mb-2",
                                children: "Krok 1 ze 3"
                            }, void 0, false, {
                                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-location.tsx",
                                lineNumber: 71,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                className: "text-h1 text-ink",
                                children: "Kde hraješ?"
                            }, void 0, false, {
                                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-location.tsx",
                                lineNumber: 72,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "text-muted mt-1",
                                children: "Klikni na obec kde chceš založit tým"
                            }, void 0, false, {
                                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-location.tsx",
                                lineNumber: 73,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-location.tsx",
                        lineNumber: 70,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex gap-3 sm:items-center",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "relative flex-1 sm:w-60",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                                        className: "absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-light",
                                        fill: "none",
                                        stroke: "currentColor",
                                        viewBox: "0 0 24 24",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                            strokeLinecap: "round",
                                            strokeLinejoin: "round",
                                            strokeWidth: 2,
                                            d: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                                        }, void 0, false, {
                                            fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-location.tsx",
                                            lineNumber: 79,
                                            columnNumber: 15
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-location.tsx",
                                        lineNumber: 78,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                        type: "text",
                                        placeholder: "Hledat obec...",
                                        value: search,
                                        onChange: (e)=>setSearch(e.target.value),
                                        className: "input !py-2.5 pl-10 text-sm"
                                    }, void 0, false, {
                                        fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-location.tsx",
                                        lineNumber: 81,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-location.tsx",
                                lineNumber: 77,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                value: selectedRegion,
                                onChange: (e)=>setSelectedRegion(e.target.value),
                                className: "select",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                        value: "",
                                        children: "Všechny kraje"
                                    }, void 0, false, {
                                        fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-location.tsx",
                                        lineNumber: 94,
                                        columnNumber: 13
                                    }, this),
                                    regions.map((r)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                            value: r,
                                            children: r
                                        }, r, false, {
                                            fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-location.tsx",
                                            lineNumber: 96,
                                            columnNumber: 15
                                        }, this))
                                ]
                            }, void 0, true, {
                                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-location.tsx",
                                lineNumber: 89,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-location.tsx",
                        lineNumber: 76,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-location.tsx",
                lineNumber: 69,
                columnNumber: 7
            }, this),
            !loading && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "text-xs text-muted mb-3",
                children: [
                    filteredVillages.length,
                    " ",
                    filteredVillages.length === 1 ? "obec" : filteredVillages.length < 5 ? "obce" : "obcí"
                ]
            }, void 0, true, {
                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-location.tsx",
                lineNumber: 104,
                columnNumber: 9
            }, this),
            loading ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex-1 flex items-center justify-center py-20",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "w-8 h-8 border-3 border-pitch-500 border-t-transparent rounded-full animate-spin"
                }, void 0, false, {
                    fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-location.tsx",
                    lineNumber: 112,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-location.tsx",
                lineNumber: 111,
                columnNumber: 9
            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2",
                children: [
                    filteredVillages.slice(0, 60).map((v)=>{
                        const badge = getSizeBadge(v.size);
                        const icon = getSizeIcon(v.size);
                        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            onClick: ()=>onSelect({
                                    id: v.id,
                                    name: v.name,
                                    district: v.district,
                                    region: v.region,
                                    population: v.population,
                                    size: v.size
                                }),
                            className: "group bg-surface rounded-xl p-3 text-left flex items-center gap-3 border border-transparent hover:border-pitch-400/30 hover:shadow-hover transition-all active:scale-[0.99]",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "text-xl shrink-0 w-8 text-center",
                                    children: icon
                                }, void 0, false, {
                                    fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-location.tsx",
                                    lineNumber: 128,
                                    columnNumber: 17
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "flex-1 min-w-0",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "font-semibold text-ink text-sm truncate group-hover:text-pitch-600 transition-colors",
                                            children: v.name
                                        }, void 0, false, {
                                            fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-location.tsx",
                                            lineNumber: 130,
                                            columnNumber: 19
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "text-xs text-muted truncate",
                                            children: [
                                                v.district,
                                                " · ",
                                                v.population.toLocaleString("cs"),
                                                " obyv."
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-location.tsx",
                                            lineNumber: 131,
                                            columnNumber: 19
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-location.tsx",
                                    lineNumber: 129,
                                    columnNumber: 17
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "text-[10px] font-heading font-bold px-2 py-1 rounded-md shrink-0 ".concat(badge.bg, " ").concat(badge.text),
                                    children: badge.label
                                }, void 0, false, {
                                    fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-location.tsx",
                                    lineNumber: 133,
                                    columnNumber: 17
                                }, this)
                            ]
                        }, v.id, true, {
                            fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-location.tsx",
                            lineNumber: 120,
                            columnNumber: 15
                        }, this);
                    }),
                    filteredVillages.length === 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "col-span-full text-center text-muted py-16",
                        children: "Žádná obec nenalezena"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-location.tsx",
                        lineNumber: 141,
                        columnNumber: 13
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-location.tsx",
                lineNumber: 115,
                columnNumber: 9
            }, this),
            filteredVillages.length > 60 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "text-center text-muted py-3 text-xs",
                children: [
                    "Zobrazeno 60 z ",
                    filteredVillages.length,
                    ". Upřesni hledání."
                ]
            }, void 0, true, {
                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-location.tsx",
                lineNumber: 147,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-location.tsx",
        lineNumber: 67,
        columnNumber: 5
    }, this);
}
_s(StepLocation, "2AdYg5NMClzlSL5OQqVx8J8chpo=");
_c = StepLocation;
var _c;
__turbopack_context__.k.register(_c, "StepLocation");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "StepTeam",
    ()=>StepTeam
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
const COLORS = [
    {
        hex: "#2D5F2D",
        name: "Zelená"
    },
    {
        hex: "#D94032",
        name: "Červená"
    },
    {
        hex: "#2563EB",
        name: "Modrá"
    },
    {
        hex: "#F59E0B",
        name: "Žlutá"
    },
    {
        hex: "#7C3AED",
        name: "Fialová"
    },
    {
        hex: "#0891B2",
        name: "Tyrkysová"
    },
    {
        hex: "#1D4ED8",
        name: "Tmavě modrá"
    },
    {
        hex: "#047857",
        name: "Smaragdová"
    },
    {
        hex: "#B45309",
        name: "Hnědá"
    },
    {
        hex: "#1A1A1A",
        name: "Černá"
    },
    {
        hex: "#DC2626",
        name: "Tmavě červená"
    },
    {
        hex: "#FFFFFF",
        name: "Bílá"
    }
];
function generateSponsors(villageName) {
    const surnames = [
        "Novotný",
        "Kuchař",
        "Dvořák",
        "Procházka",
        "Kovář",
        "Sedláček"
    ];
    const picked = surnames.sort(()=>Math.random() - 0.5).slice(0, 3);
    return [
        {
            name: "Autoservis ".concat(picked[0]),
            teamName: "SK Autoservis ".concat(picked[0]),
            bonus: 25000,
            extra: "Požadavek: top 8 v tabulce"
        },
        {
            name: "Řeznictví ".concat(picked[1]),
            teamName: "FK Řeznictví ".concat(picked[1], " ").concat(villageName),
            bonus: 15000
        },
        {
            name: "Hospoda U ".concat(picked[2], "ů"),
            teamName: "TJ U ".concat(picked[2], "ů ").concat(villageName),
            bonus: 8000,
            extra: "Pivo po zápase zdarma"
        }
    ];
}
function StepTeam(param) {
    let { village, teamName: initialName, primaryColor: initialPrimary, secondaryColor: initialSecondary, onBack, onSubmit } = param;
    _s();
    const [namingChoice, setNamingChoice] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("classic");
    const [teamName, setTeamName] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(initialName);
    const [customName, setCustomName] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [selectedSponsor, setSelectedSponsor] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [primaryColor, setPrimaryColor] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(initialPrimary);
    const [secondaryColor, setSecondaryColor] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(initialSecondary);
    const sponsors = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "StepTeam.useMemo[sponsors]": ()=>generateSponsors(village.name)
    }["StepTeam.useMemo[sponsors]"], [
        village.name
    ]);
    const displayName = namingChoice === "sponsor" && selectedSponsor !== null ? sponsors[selectedSponsor].teamName : namingChoice === "custom" ? customName || "Můj tým" : teamName;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex-1 p-5 sm:p-8 w-full max-w-4xl mx-auto",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                onClick: onBack,
                className: "btn btn-ghost btn-sm mb-4 -ml-2",
                children: "← Zpět"
            }, void 0, false, {
                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                lineNumber: 66,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "mb-6",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "text-label mb-2",
                        children: "Krok 2 ze 3"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                        lineNumber: 69,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                        className: "text-h1 text-ink",
                        children: "Tvůj tým"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                        lineNumber: 70,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "text-muted mt-1",
                        children: [
                            village.name,
                            ", ",
                            village.district
                        ]
                    }, void 0, true, {
                        fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                        lineNumber: 71,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                lineNumber: 68,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "space-y-6",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "text-label mb-3",
                                        children: "Název klubu"
                                    }, void 0, false, {
                                        fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                                        lineNumber: 79,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "grid grid-cols-3 gap-2 mb-4",
                                        children: [
                                            {
                                                key: "classic",
                                                icon: "\u{1F3DB}",
                                                label: "Klasický",
                                                desc: "Tradice"
                                            },
                                            {
                                                key: "sponsor",
                                                icon: "\u{1F4B0}",
                                                label: "Sponzorský",
                                                desc: "Peníze navíc"
                                            },
                                            {
                                                key: "custom",
                                                icon: "\u270F\uFE0F",
                                                label: "Vlastní",
                                                desc: "Tvůj výběr"
                                            }
                                        ].map((opt)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                onClick: ()=>setNamingChoice(opt.key),
                                                className: "p-3 rounded-xl text-center transition-all border-2 ".concat(namingChoice === opt.key ? "border-pitch-500 bg-pitch-500/5" : "border-transparent bg-surface hover:border-pitch-500/20"),
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "text-xl mb-1",
                                                        children: opt.icon
                                                    }, void 0, false, {
                                                        fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                                                        lineNumber: 95,
                                                        columnNumber: 19
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "text-sm font-semibold",
                                                        children: opt.label
                                                    }, void 0, false, {
                                                        fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                                                        lineNumber: 96,
                                                        columnNumber: 19
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "text-[10px] text-muted",
                                                        children: opt.desc
                                                    }, void 0, false, {
                                                        fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                                                        lineNumber: 97,
                                                        columnNumber: 19
                                                    }, this)
                                                ]
                                            }, opt.key, true, {
                                                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                                                lineNumber: 86,
                                                columnNumber: 17
                                            }, this))
                                    }, void 0, false, {
                                        fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                                        lineNumber: 80,
                                        columnNumber: 13
                                    }, this),
                                    namingChoice === "classic" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "grid grid-cols-4 gap-1.5",
                                            children: [
                                                "SK",
                                                "FK",
                                                "TJ",
                                                "Sokol",
                                                "Slavoj",
                                                "Spartak",
                                                "Jiskra",
                                                "FC"
                                            ].map((prefix)=>{
                                                const name = "".concat(prefix, " ").concat(village.name);
                                                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                    onClick: ()=>setTeamName(name),
                                                    className: "py-2 px-3 rounded-lg text-sm font-medium transition-all ".concat(teamName === name ? "bg-pitch-500 text-white" : "bg-surface hover:bg-pitch-50 text-ink-light"),
                                                    children: prefix
                                                }, prefix, false, {
                                                    fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                                                    lineNumber: 109,
                                                    columnNumber: 23
                                                }, this);
                                            })
                                        }, void 0, false, {
                                            fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                                            lineNumber: 105,
                                            columnNumber: 17
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                                        lineNumber: 104,
                                        columnNumber: 15
                                    }, this),
                                    namingChoice === "sponsor" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "space-y-2",
                                        children: sponsors.map((s, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                onClick: ()=>setSelectedSponsor(i),
                                                className: "w-full p-3 rounded-xl text-left transition-all border-2 flex items-start gap-3 ".concat(selectedSponsor === i ? "border-gold-500 bg-gold-500/5" : "border-transparent bg-surface hover:border-gold-500/20"),
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: "text-lg mt-0.5",
                                                        children: i === 0 ? "\u{1F527}" : i === 1 ? "\u{1F356}" : "\u{1F37A}"
                                                    }, void 0, false, {
                                                        fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                                                        lineNumber: 129,
                                                        columnNumber: 21
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "flex-1",
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: "font-semibold text-sm",
                                                                children: s.name
                                                            }, void 0, false, {
                                                                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                                                                lineNumber: 131,
                                                                columnNumber: 23
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: "text-xs text-muted mt-0.5",
                                                                children: [
                                                                    "„",
                                                                    s.teamName,
                                                                    "“"
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                                                                lineNumber: 132,
                                                                columnNumber: 23
                                                            }, this),
                                                            s.extra && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: "text-xs text-muted",
                                                                children: s.extra
                                                            }, void 0, false, {
                                                                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                                                                lineNumber: 133,
                                                                columnNumber: 35
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                                                        lineNumber: 130,
                                                        columnNumber: 21
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "text-right shrink-0",
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: "text-sm font-heading font-bold text-gold-600",
                                                                children: [
                                                                    "+",
                                                                    (s.bonus / 1000).toFixed(0),
                                                                    "k"
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                                                                lineNumber: 136,
                                                                columnNumber: 23
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: "text-[10px] text-muted",
                                                                children: "Kč/sez."
                                                            }, void 0, false, {
                                                                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                                                                lineNumber: 137,
                                                                columnNumber: 23
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                                                        lineNumber: 135,
                                                        columnNumber: 21
                                                    }, this)
                                                ]
                                            }, i, true, {
                                                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                                                lineNumber: 125,
                                                columnNumber: 19
                                            }, this))
                                    }, void 0, false, {
                                        fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                                        lineNumber: 123,
                                        columnNumber: 15
                                    }, this),
                                    namingChoice === "custom" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                        type: "text",
                                        value: customName,
                                        onChange: (e)=>setCustomName(e.target.value),
                                        placeholder: "Dynamo Kebab, FC Kocouři...",
                                        maxLength: 30,
                                        className: "input"
                                    }, void 0, false, {
                                        fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                                        lineNumber: 146,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                                lineNumber: 78,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "text-label mb-3",
                                        children: "Barvy dresu"
                                    }, void 0, false, {
                                        fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                                        lineNumber: 159,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "flex gap-6",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "text-xs text-muted mb-2",
                                                        children: "Hlavní"
                                                    }, void 0, false, {
                                                        fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                                                        lineNumber: 162,
                                                        columnNumber: 17
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "flex gap-1.5 flex-wrap max-w-[210px]",
                                                        children: COLORS.filter((c)=>c.hex !== "#FFFFFF").map((c)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                onClick: ()=>setPrimaryColor(c.hex),
                                                                title: c.name,
                                                                className: "w-7 h-7 rounded-md transition-all hover:scale-110 ".concat(primaryColor === c.hex ? "ring-2 ring-pitch-500 ring-offset-1 scale-110" : ""),
                                                                style: {
                                                                    backgroundColor: c.hex
                                                                }
                                                            }, "p-".concat(c.hex), false, {
                                                                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                                                                lineNumber: 165,
                                                                columnNumber: 21
                                                            }, this))
                                                    }, void 0, false, {
                                                        fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                                                        lineNumber: 163,
                                                        columnNumber: 17
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                                                lineNumber: 161,
                                                columnNumber: 15
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "text-xs text-muted mb-2",
                                                        children: "Doplňková"
                                                    }, void 0, false, {
                                                        fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                                                        lineNumber: 172,
                                                        columnNumber: 17
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "flex gap-1.5 flex-wrap max-w-[210px]",
                                                        children: COLORS.map((c)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                onClick: ()=>setSecondaryColor(c.hex),
                                                                title: c.name,
                                                                className: "w-7 h-7 rounded-md transition-all hover:scale-110 ".concat(c.hex === "#FFFFFF" ? "border border-gray-200" : "", " ").concat(secondaryColor === c.hex ? "ring-2 ring-pitch-500 ring-offset-1 scale-110" : ""),
                                                                style: {
                                                                    backgroundColor: c.hex
                                                                }
                                                            }, "s-".concat(c.hex), false, {
                                                                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                                                                lineNumber: 175,
                                                                columnNumber: 21
                                                            }, this))
                                                    }, void 0, false, {
                                                        fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                                                        lineNumber: 173,
                                                        columnNumber: 17
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                                                lineNumber: 171,
                                                columnNumber: 15
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                                        lineNumber: 160,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                                lineNumber: 158,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                        lineNumber: 76,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "lg:sticky lg:top-8 self-start",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "card p-6 text-center",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                                        width: "140",
                                        height: "160",
                                        viewBox: "0 0 120 140",
                                        className: "mx-auto mb-4",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                                d: "M30,35 L15,50 L15,130 L105,130 L105,50 L90,35 L80,25 C75,22 65,20 60,20 C55,20 45,22 40,25Z",
                                                fill: primaryColor,
                                                stroke: "rgba(0,0,0,0.1)",
                                                strokeWidth: "1"
                                            }, void 0, false, {
                                                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                                                lineNumber: 189,
                                                columnNumber: 15
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                                d: "M40,25 C45,22 55,20 60,20 C65,20 75,22 80,25 L75,30 C70,27 65,25 60,25 C55,25 50,27 45,30Z",
                                                fill: secondaryColor
                                            }, void 0, false, {
                                                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                                                lineNumber: 191,
                                                columnNumber: 15
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("rect", {
                                                x: "15",
                                                y: "50",
                                                width: "18",
                                                height: "8",
                                                fill: secondaryColor,
                                                opacity: "0.8"
                                            }, void 0, false, {
                                                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                                                lineNumber: 193,
                                                columnNumber: 15
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("rect", {
                                                x: "87",
                                                y: "50",
                                                width: "18",
                                                height: "8",
                                                fill: secondaryColor,
                                                opacity: "0.8"
                                            }, void 0, false, {
                                                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                                                lineNumber: 194,
                                                columnNumber: 15
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("text", {
                                                x: "60",
                                                y: "92",
                                                textAnchor: "middle",
                                                fontSize: "34",
                                                fontWeight: "bold",
                                                fill: secondaryColor,
                                                fontFamily: "var(--font-heading)",
                                                opacity: "0.85",
                                                children: "10"
                                            }, void 0, false, {
                                                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                                                lineNumber: 195,
                                                columnNumber: 15
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                                        lineNumber: 188,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "font-heading font-bold text-lg text-ink leading-tight",
                                        children: displayName
                                    }, void 0, false, {
                                        fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                                        lineNumber: 199,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "text-xs text-muted mt-1",
                                        children: [
                                            village.name,
                                            " · ",
                                            village.district
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                                        lineNumber: 200,
                                        columnNumber: 13
                                    }, this),
                                    namingChoice === "sponsor" && selectedSponsor !== null && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "mt-3 inline-flex items-center gap-1 text-xs font-heading font-bold text-gold-600 bg-gold-500/10 px-3 py-1 rounded-full",
                                        children: [
                                            "+",
                                            (sponsors[selectedSponsor].bonus / 1000).toFixed(0),
                                            "k Kč/sezóna"
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                                        lineNumber: 203,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                                lineNumber: 187,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                onClick: ()=>onSubmit(displayName, primaryColor, secondaryColor),
                                disabled: !displayName.trim() || namingChoice === "sponsor" && selectedSponsor === null,
                                className: "btn btn-primary btn-lg w-full mt-4",
                                children: "Založit tým"
                            }, void 0, false, {
                                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                                lineNumber: 209,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                        lineNumber: 186,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                lineNumber: 74,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
        lineNumber: 65,
        columnNumber: 5
    }, this);
}
_s(StepTeam, "stmeBUO8Jc2vh20BO9184RbHsN0=");
_c = StepTeam;
var _c;
__turbopack_context__.k.register(_c, "StepTeam");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
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
"[project]/Projects/fmko/apps/web/src/components/players/reveal-card.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "PlayerRevealCard",
    ()=>PlayerRevealCard
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$packages$2f$ui$2f$src$2f$avatar$2f$index$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/Projects/fmko/packages/ui/src/avatar/index.ts [app-client] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$packages$2f$ui$2f$src$2f$avatar$2f$PlayerAvatar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/packages/ui/src/avatar/PlayerAvatar.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
const POS_SHORT = {
    GK: "BRA",
    DEF: "OBR",
    MID: "ZÁL",
    FWD: "ÚTO"
};
const POS_CSS = {
    GK: "pos-gk",
    DEF: "pos-def",
    MID: "pos-mid",
    FWD: "pos-fwd"
};
function getRatingColor(rating) {
    if (rating >= 70) return "#C4A035";
    if (rating >= 50) return "#3A7A3A";
    if (rating >= 30) return "#8B8578";
    return "#D94032";
}
function getTopStats(player) {
    const skills = player.skills;
    if (!skills) return [];
    const labels = {
        speed: "RYC",
        technique: "TEC",
        shooting: "STŘ",
        passing: "PŘI",
        heading: "HLA",
        defense: "OBR",
        goalkeeping: "BRA"
    };
    return Object.entries(skills).filter((param)=>{
        let [, v] = param;
        return typeof v === "number";
    }).map((param)=>{
        let [k, v] = param;
        var _labels_k;
        return {
            label: (_labels_k = labels[k]) !== null && _labels_k !== void 0 ? _labels_k : k,
            value: v
        };
    }).sort((a, b)=>b.value - a.value).slice(0, 3);
}
function PlayerRevealCard(param) {
    let { player, teamColor, delay = 0, onRevealed } = param;
    var _player_lifeContext;
    _s();
    const [phase, setPhase] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("hidden");
    const [displayRating, setDisplayRating] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(0);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "PlayerRevealCard.useEffect": ()=>{
            const t1 = setTimeout({
                "PlayerRevealCard.useEffect.t1": ()=>setPhase("flipping")
            }["PlayerRevealCard.useEffect.t1"], delay);
            const t2 = setTimeout({
                "PlayerRevealCard.useEffect.t2": ()=>setPhase("revealed")
            }["PlayerRevealCard.useEffect.t2"], delay + 600);
            const t3 = setTimeout({
                "PlayerRevealCard.useEffect.t3": ()=>setPhase("rating")
            }["PlayerRevealCard.useEffect.t3"], delay + 1000);
            return ({
                "PlayerRevealCard.useEffect": ()=>{
                    clearTimeout(t1);
                    clearTimeout(t2);
                    clearTimeout(t3);
                }
            })["PlayerRevealCard.useEffect"];
        }
    }["PlayerRevealCard.useEffect"], [
        delay
    ]);
    // Animate rating count-up
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "PlayerRevealCard.useEffect": ()=>{
            if (phase !== "rating") return;
            const target = player.overall_rating;
            const duration = 600;
            const steps = 15;
            const stepTime = duration / steps;
            let step = 0;
            const interval = setInterval({
                "PlayerRevealCard.useEffect.interval": ()=>{
                    step++;
                    const progress = step / steps;
                    // Ease-out
                    const eased = 1 - Math.pow(1 - progress, 3);
                    setDisplayRating(Math.round(target * eased));
                    if (step >= steps) {
                        clearInterval(interval);
                        setDisplayRating(target);
                        onRevealed === null || onRevealed === void 0 ? void 0 : onRevealed();
                    }
                }
            }["PlayerRevealCard.useEffect.interval"], stepTime);
            return ({
                "PlayerRevealCard.useEffect": ()=>clearInterval(interval)
            })["PlayerRevealCard.useEffect"];
        }
    }["PlayerRevealCard.useEffect"], [
        phase,
        player.overall_rating,
        onRevealed
    ]);
    const ratingColor = getRatingColor(player.overall_rating);
    const topStats = getTopStats(player);
    const hasAvatar = player.avatar && typeof player.avatar === "object" && Object.keys(player.avatar).length > 0;
    // Phase: hidden
    if (phase === "hidden") {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "w-full aspect-[3/4] rounded-2xl flex items-center justify-center",
            style: {
                background: "linear-gradient(145deg, #0d220d 0%, #153615 100%)",
                border: "1px solid rgba(45,95,45,0.3)"
            },
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "text-center",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "w-8 h-8 rounded-full border-2 border-pitch-500/40 border-t-pitch-400 animate-spin mx-auto mb-2"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/apps/web/src/components/players/reveal-card.tsx",
                        lineNumber: 95,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-pitch-500/40 text-[10px] font-heading uppercase tracking-wider",
                        children: "Odhaluji..."
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/apps/web/src/components/players/reveal-card.tsx",
                        lineNumber: 96,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/Projects/fmko/apps/web/src/components/players/reveal-card.tsx",
                lineNumber: 94,
                columnNumber: 9
            }, this)
        }, void 0, false, {
            fileName: "[project]/Projects/fmko/apps/web/src/components/players/reveal-card.tsx",
            lineNumber: 92,
            columnNumber: 7
        }, this);
    }
    var _POS_CSS_player_position, _player_lifeContext_occupation;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "w-full rounded-2xl overflow-hidden transition-all duration-500 ".concat(phase === "flipping" ? "animate-[cardFlip_0.6s_ease-out]" : "", " ").concat(phase === "rating" ? "animate-[cardGlow_0.8s_ease-out]" : ""),
        style: {
            background: "linear-gradient(165deg, ".concat(teamColor, "15 0%, #FFFFFF 50%, ").concat(teamColor, "08 100%)"),
            border: "1px solid ".concat(teamColor, "18"),
            boxShadow: "0 4px 20px rgba(0,0,0,0.06)"
        },
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-start justify-between px-3 pt-3 pb-1",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "pos-badge ".concat((_POS_CSS_player_position = POS_CSS[player.position]) !== null && _POS_CSS_player_position !== void 0 ? _POS_CSS_player_position : ""),
                        children: POS_SHORT[player.position]
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/apps/web/src/components/players/reveal-card.tsx",
                        lineNumber: 115,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "text-right min-w-[2.5rem]",
                        children: phase === "rating" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "font-heading font-[800] text-[2rem] leading-none tabular-nums transition-all",
                            style: {
                                color: ratingColor
                            },
                            children: displayRating
                        }, void 0, false, {
                            fileName: "[project]/Projects/fmko/apps/web/src/components/players/reveal-card.tsx",
                            lineNumber: 122,
                            columnNumber: 13
                        }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "font-heading font-[800] text-[2rem] leading-none tabular-nums text-black/5",
                            children: "?"
                        }, void 0, false, {
                            fileName: "[project]/Projects/fmko/apps/web/src/components/players/reveal-card.tsx",
                            lineNumber: 127,
                            columnNumber: 13
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/apps/web/src/components/players/reveal-card.tsx",
                        lineNumber: 120,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/Projects/fmko/apps/web/src/components/players/reveal-card.tsx",
                lineNumber: 114,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex justify-center py-2",
                children: hasAvatar ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "w-[72px] h-[72px]",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$packages$2f$ui$2f$src$2f$avatar$2f$PlayerAvatar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PlayerAvatar"], {
                        config: player.avatar,
                        size: "md",
                        jerseyColor: teamColor
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/apps/web/src/components/players/reveal-card.tsx",
                        lineNumber: 138,
                        columnNumber: 13
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/Projects/fmko/apps/web/src/components/players/reveal-card.tsx",
                    lineNumber: 137,
                    columnNumber: 11
                }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "w-16 h-16 rounded-full flex items-center justify-center text-white font-heading font-bold text-2xl",
                    style: {
                        backgroundColor: teamColor
                    },
                    children: player.first_name[0]
                }, void 0, false, {
                    fileName: "[project]/Projects/fmko/apps/web/src/components/players/reveal-card.tsx",
                    lineNumber: 141,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/Projects/fmko/apps/web/src/components/players/reveal-card.tsx",
                lineNumber: 135,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "text-center px-3 pb-1.5",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "font-heading font-bold text-[0.85rem] text-ink leading-tight truncate",
                        children: [
                            player.first_name,
                            " ",
                            player.last_name
                        ]
                    }, void 0, true, {
                        fileName: "[project]/Projects/fmko/apps/web/src/components/players/reveal-card.tsx",
                        lineNumber: 150,
                        columnNumber: 9
                    }, this),
                    player.nickname && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "text-[0.75rem] mt-0.5 font-medium truncate",
                        style: {
                            color: teamColor
                        },
                        children: [
                            "„",
                            player.nickname,
                            "“"
                        ]
                    }, void 0, true, {
                        fileName: "[project]/Projects/fmko/apps/web/src/components/players/reveal-card.tsx",
                        lineNumber: 154,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/Projects/fmko/apps/web/src/components/players/reveal-card.tsx",
                lineNumber: 149,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "mx-3 h-px",
                style: {
                    backgroundColor: "".concat(teamColor, "10")
                }
            }, void 0, false, {
                fileName: "[project]/Projects/fmko/apps/web/src/components/players/reveal-card.tsx",
                lineNumber: 161,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "px-3 py-2",
                children: topStats.map((stat, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center gap-2 py-0.5",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-[10px] text-muted w-7 text-right font-heading font-semibold",
                                children: stat.label
                            }, void 0, false, {
                                fileName: "[project]/Projects/fmko/apps/web/src/components/players/reveal-card.tsx",
                                lineNumber: 167,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex-1 h-1 bg-black/[0.04] rounded-full overflow-hidden",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "h-full rounded-full transition-all duration-700",
                                    style: {
                                        width: phase === "rating" ? "".concat(stat.value, "%") : "0%",
                                        backgroundColor: teamColor,
                                        opacity: 0.6 - i * 0.15,
                                        transitionDelay: "".concat(i * 100, "ms")
                                    }
                                }, void 0, false, {
                                    fileName: "[project]/Projects/fmko/apps/web/src/components/players/reveal-card.tsx",
                                    lineNumber: 169,
                                    columnNumber: 15
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/Projects/fmko/apps/web/src/components/players/reveal-card.tsx",
                                lineNumber: 168,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-[10px] tabular-nums font-heading font-bold w-5 text-right transition-opacity duration-500 ".concat(phase === "rating" ? "opacity-100" : "opacity-0"),
                                style: {
                                    color: teamColor,
                                    transitionDelay: "".concat(i * 100 + 200, "ms")
                                },
                                children: stat.value
                            }, void 0, false, {
                                fileName: "[project]/Projects/fmko/apps/web/src/components/players/reveal-card.tsx",
                                lineNumber: 177,
                                columnNumber: 13
                            }, this)
                        ]
                    }, stat.label, true, {
                        fileName: "[project]/Projects/fmko/apps/web/src/components/players/reveal-card.tsx",
                        lineNumber: 166,
                        columnNumber: 11
                    }, this))
            }, void 0, false, {
                fileName: "[project]/Projects/fmko/apps/web/src/components/players/reveal-card.tsx",
                lineNumber: 164,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "px-3 pb-2.5 flex items-center justify-center gap-1.5 text-[10px] text-muted",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        children: [
                            player.age,
                            " let"
                        ]
                    }, void 0, true, {
                        fileName: "[project]/Projects/fmko/apps/web/src/components/players/reveal-card.tsx",
                        lineNumber: 187,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        children: "·"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/apps/web/src/components/players/reveal-card.tsx",
                        lineNumber: 188,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "truncate",
                        children: (_player_lifeContext_occupation = (_player_lifeContext = player.lifeContext) === null || _player_lifeContext === void 0 ? void 0 : _player_lifeContext.occupation) !== null && _player_lifeContext_occupation !== void 0 ? _player_lifeContext_occupation : ""
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/apps/web/src/components/players/reveal-card.tsx",
                        lineNumber: 189,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/Projects/fmko/apps/web/src/components/players/reveal-card.tsx",
                lineNumber: 186,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/Projects/fmko/apps/web/src/components/players/reveal-card.tsx",
        lineNumber: 103,
        columnNumber: 5
    }, this);
}
_s(PlayerRevealCard, "SbgGyshbhhvV1mEGl4t6EZtXIoI=");
_c = PlayerRevealCard;
var _c;
__turbopack_context__.k.register(_c, "PlayerRevealCard");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/Projects/fmko/apps/web/src/components/onboarding/step-reveal.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "StepReveal",
    ()=>StepReveal
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$apps$2f$web$2f$src$2f$components$2f$players$2f$reveal$2d$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/apps/web/src/components/players/reveal-card.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
function StepReveal(param) {
    let { teamName, primaryColor, players, onComplete } = param;
    _s();
    const [revealedCount, setRevealedCount] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(0);
    const [isComplete, setIsComplete] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [skipped, setSkipped] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "StepReveal.useEffect": ()=>{
            if (skipped) {
                setRevealedCount(players.length);
                setIsComplete(true);
                return;
            }
            if (revealedCount >= players.length) {
                setIsComplete(true);
                return;
            }
            const t = setTimeout({
                "StepReveal.useEffect.t": ()=>setRevealedCount({
                        "StepReveal.useEffect.t": (c)=>c + 1
                    }["StepReveal.useEffect.t"])
            }["StepReveal.useEffect.t"], 500);
            return ({
                "StepReveal.useEffect": ()=>clearTimeout(t)
            })["StepReveal.useEffect"];
        }
    }["StepReveal.useEffect"], [
        revealedCount,
        players.length,
        skipped
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex-1 flex flex-col p-5 sm:p-8 w-full max-w-6xl mx-auto",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center justify-between mb-6",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "text-label mb-2",
                                children: "Krok 3 ze 3"
                            }, void 0, false, {
                                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-reveal.tsx",
                                lineNumber: 41,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                className: "text-h1 text-ink",
                                children: teamName
                            }, void 0, false, {
                                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-reveal.tsx",
                                lineNumber: 42,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "text-muted mt-1",
                                children: isComplete ? "".concat(players.length, " hráčů v kádru") : "Odhalování kádru... ".concat(revealedCount, "/").concat(players.length)
                            }, void 0, false, {
                                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-reveal.tsx",
                                lineNumber: 43,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-reveal.tsx",
                        lineNumber: 40,
                        columnNumber: 9
                    }, this),
                    !isComplete && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        onClick: ()=>setSkipped(true),
                        className: "btn btn-ghost btn-sm",
                        children: "Přeskočit →"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-reveal.tsx",
                        lineNumber: 51,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-reveal.tsx",
                lineNumber: 39,
                columnNumber: 7
            }, this),
            !isComplete && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "h-1 bg-pitch-500/10 rounded-full mb-6 overflow-hidden",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "h-full bg-pitch-500 rounded-full transition-all duration-300",
                    style: {
                        width: "".concat(revealedCount / players.length * 100, "%")
                    }
                }, void 0, false, {
                    fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-reveal.tsx",
                    lineNumber: 60,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-reveal.tsx",
                lineNumber: 59,
                columnNumber: 9
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 mb-8",
                children: [
                    players.slice(0, revealedCount).map((player, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$apps$2f$web$2f$src$2f$components$2f$players$2f$reveal$2d$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PlayerRevealCard"], {
                            player: player,
                            teamColor: primaryColor,
                            delay: 0
                        }, player.id || i, false, {
                            fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-reveal.tsx",
                            lineNumber: 68,
                            columnNumber: 11
                        }, this)),
                    !isComplete && Array.from({
                        length: Math.min(3, players.length - revealedCount)
                    }).map((_, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "aspect-[3/4] rounded-2xl border-2 border-dashed border-pitch-500/10 flex items-center justify-center",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "w-8 h-8 rounded-full border-2 border-pitch-500/20 border-t-pitch-500/60 animate-spin"
                            }, void 0, false, {
                                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-reveal.tsx",
                                lineNumber: 80,
                                columnNumber: 13
                            }, this)
                        }, "ph-".concat(i), false, {
                            fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-reveal.tsx",
                            lineNumber: 78,
                            columnNumber: 11
                        }, this))
                ]
            }, void 0, true, {
                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-reveal.tsx",
                lineNumber: 66,
                columnNumber: 7
            }, this),
            isComplete && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "text-center animate-slide-up",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "text-muted mb-4",
                        children: "Tvůj kádr je kompletní!"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-reveal.tsx",
                        lineNumber: 88,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        onClick: onComplete,
                        className: "btn btn-primary btn-xl",
                        children: "Jdeme na to! →"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-reveal.tsx",
                        lineNumber: 89,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-reveal.tsx",
                lineNumber: 87,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-reveal.tsx",
        lineNumber: 37,
        columnNumber: 5
    }, this);
}
_s(StepReveal, "fbXjO2oTFUiHPrEh3mlwWtL+DCM=");
_c = StepReveal;
var _c;
__turbopack_context__.k.register(_c, "StepReveal");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/Projects/fmko/apps/web/src/app/onboarding/page.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>OnboardingPage
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/node_modules/next/navigation.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$apps$2f$web$2f$src$2f$context$2f$team$2d$context$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/apps/web/src/context/team-context.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$apps$2f$web$2f$src$2f$lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/apps/web/src/lib/api.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$apps$2f$web$2f$src$2f$components$2f$onboarding$2f$step$2d$location$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/apps/web/src/components/onboarding/step-location.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$apps$2f$web$2f$src$2f$components$2f$onboarding$2f$step$2d$team$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$apps$2f$web$2f$src$2f$components$2f$onboarding$2f$step$2d$reveal$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/apps/web/src/components/onboarding/step-reveal.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
;
;
;
;
function OnboardingPage() {
    _s();
    const [step, setStep] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(1);
    const [creating, setCreating] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [error, setError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const { token, setTeam } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$apps$2f$web$2f$src$2f$context$2f$team$2d$context$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTeam"])();
    const router = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRouter"])();
    const [state, setState] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])({
        village: null,
        teamName: "",
        primaryColor: "#2D5F2D",
        secondaryColor: "#FFFFFF",
        createdTeamId: null,
        players: []
    });
    async function handleCreateTeam(teamName, primary, secondary) {
        if (!state.village) return;
        setCreating(true);
        setError("");
        try {
            // Create team via API
            const headers = {
                "Content-Type": "application/json"
            };
            if (token) headers["Authorization"] = "Bearer ".concat(token);
            const result = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$apps$2f$web$2f$src$2f$lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiFetch"])("/api/teams", {
                method: "POST",
                headers,
                body: JSON.stringify({
                    villageId: state.village.id,
                    name: teamName,
                    primaryColor: primary,
                    secondaryColor: secondary
                })
            });
            // Fetch generated players
            const players = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$apps$2f$web$2f$src$2f$lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiFetch"])("/api/teams/".concat(result.id, "/players"));
            // Save team
            setTeam(result.id, result.name);
            setState((s)=>({
                    ...s,
                    teamName,
                    primaryColor: primary,
                    secondaryColor: secondary,
                    createdTeamId: result.id,
                    players
                }));
            setStep(3);
        } catch (e) {
            setError(e.message);
        } finally{
            setCreating(false);
        }
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("main", {
        className: "min-h-screen flex flex-col bg-paper",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "bg-pitch-800 px-5 py-3 flex items-center justify-between",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "font-heading font-bold text-white/80 text-sm tracking-wide uppercase",
                        children: "Prales"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/apps/web/src/app/onboarding/page.tsx",
                        lineNumber: 97,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center gap-2",
                        children: [
                            1,
                            2,
                            3
                        ].map((s)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "w-8 h-1.5 rounded-full transition-all ".concat(s <= step ? "bg-pitch-400" : "bg-white/10")
                            }, s, false, {
                                fileName: "[project]/Projects/fmko/apps/web/src/app/onboarding/page.tsx",
                                lineNumber: 100,
                                columnNumber: 13
                            }, this))
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/apps/web/src/app/onboarding/page.tsx",
                        lineNumber: 98,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/Projects/fmko/apps/web/src/app/onboarding/page.tsx",
                lineNumber: 96,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex-1 flex flex-col",
                children: [
                    step === 1 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$apps$2f$web$2f$src$2f$components$2f$onboarding$2f$step$2d$location$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["StepLocation"], {
                        onSelect: (village)=>{
                            setState((s)=>({
                                    ...s,
                                    village,
                                    teamName: "SK ".concat(village.name)
                                }));
                            setStep(2);
                        }
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/apps/web/src/app/onboarding/page.tsx",
                        lineNumber: 107,
                        columnNumber: 11
                    }, this),
                    step === 2 && state.village && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$apps$2f$web$2f$src$2f$components$2f$onboarding$2f$step$2d$team$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["StepTeam"], {
                                village: state.village,
                                teamName: state.teamName,
                                primaryColor: state.primaryColor,
                                secondaryColor: state.secondaryColor,
                                onBack: ()=>setStep(1),
                                onSubmit: handleCreateTeam
                            }, void 0, false, {
                                fileName: "[project]/Projects/fmko/apps/web/src/app/onboarding/page.tsx",
                                lineNumber: 121,
                                columnNumber: 13
                            }, this),
                            creating && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "fixed inset-0 bg-black/50 flex items-center justify-center z-50",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "bg-white rounded-card p-8 text-center",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "w-8 h-8 border-3 border-pitch-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"
                                        }, void 0, false, {
                                            fileName: "[project]/Projects/fmko/apps/web/src/app/onboarding/page.tsx",
                                            lineNumber: 132,
                                            columnNumber: 19
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: "font-heading font-bold text-pitch-500",
                                            children: "Generuji tým..."
                                        }, void 0, false, {
                                            fileName: "[project]/Projects/fmko/apps/web/src/app/onboarding/page.tsx",
                                            lineNumber: 133,
                                            columnNumber: 19
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/Projects/fmko/apps/web/src/app/onboarding/page.tsx",
                                    lineNumber: 131,
                                    columnNumber: 17
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/Projects/fmko/apps/web/src/app/onboarding/page.tsx",
                                lineNumber: 130,
                                columnNumber: 15
                            }, this),
                            error && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "fixed bottom-4 left-4 right-4 bg-card-red text-white p-4 rounded-card text-center",
                                children: error
                            }, void 0, false, {
                                fileName: "[project]/Projects/fmko/apps/web/src/app/onboarding/page.tsx",
                                lineNumber: 138,
                                columnNumber: 15
                            }, this)
                        ]
                    }, void 0, true),
                    step === 3 && state.createdTeamId && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$apps$2f$web$2f$src$2f$components$2f$onboarding$2f$step$2d$reveal$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["StepReveal"], {
                        village: state.village,
                        teamName: state.teamName,
                        primaryColor: state.primaryColor,
                        secondaryColor: state.secondaryColor,
                        players: state.players,
                        onComplete: ()=>router.push("/dashboard")
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/apps/web/src/app/onboarding/page.tsx",
                        lineNumber: 146,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/Projects/fmko/apps/web/src/app/onboarding/page.tsx",
                lineNumber: 105,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/Projects/fmko/apps/web/src/app/onboarding/page.tsx",
        lineNumber: 94,
        columnNumber: 5
    }, this);
}
_s(OnboardingPage, "NfWh5LYs9iLTLZNWntsV6kMKvv4=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$apps$2f$web$2f$src$2f$context$2f$team$2d$context$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTeam"],
        __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRouter"]
    ];
});
_c = OnboardingPage;
var _c;
__turbopack_context__.k.register(_c, "OnboardingPage");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=Projects_fmko_055a4448._.js.map