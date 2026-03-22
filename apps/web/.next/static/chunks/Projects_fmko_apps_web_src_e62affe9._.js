(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/Projects/fmko/apps/web/src/lib/api.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "apiFetch",
    ()=>apiFetch
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = /*#__PURE__*/ __turbopack_context__.i("[project]/Projects/fmko/node_modules/next/dist/build/polyfills/process.js [app-client] (ecmascript)");
var _process_env_NEXT_PUBLIC_API_URL;
const API_BASE = (_process_env_NEXT_PUBLIC_API_URL = __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].env.NEXT_PUBLIC_API_URL) !== null && _process_env_NEXT_PUBLIC_API_URL !== void 0 ? _process_env_NEXT_PUBLIC_API_URL : "http://localhost:8787";
async function apiFetch(path, init) {
    const res = await fetch("".concat(API_BASE).concat(path), init);
    if (!res.ok) {
        const err = await res.json().catch(()=>({
                error: res.statusText
            }));
        var _error;
        throw new Error((_error = err.error) !== null && _error !== void 0 ? _error : "API error");
    }
    return res.json();
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
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
function getDifficultyStars(size) {
    switch(size){
        case "hamlet":
            return "\u2B50\u2B50\u2B50 Hardcore";
        case "village":
            return "\u2B50\u2B50 Výzva";
        case "town":
            return "\u2705 Dobrý start";
        case "small_city":
            return "\u{1F7E2} Easy mode";
        case "city":
            return "\u{1F7E2} Easy mode";
        default:
            return "";
    }
}
function StepLocation(param) {
    let { onSelect } = param;
    _s();
    const [villages, setVillages] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const [loading, setLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(true);
    const [search, setSearch] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [selectedRegion, setSelectedRegion] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [selectedDistrict, setSelectedDistrict] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
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
                ...new Map(villages.map({
                    "StepLocation.useMemo[regions]": (v)=>[
                            v.region,
                            v.region
                        ]
                }["StepLocation.useMemo[regions]"])).entries()
            ].map({
                "StepLocation.useMemo[regions]": (param)=>{
                    let [, name] = param;
                    return {
                        code: name,
                        name
                    };
                }
            }["StepLocation.useMemo[regions]"]).sort({
                "StepLocation.useMemo[regions]": (a, b)=>a.name.localeCompare(b.name, "cs")
            }["StepLocation.useMemo[regions]"])
    }["StepLocation.useMemo[regions]"], [
        villages
    ]);
    const districts = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "StepLocation.useMemo[districts]": ()=>{
            if (!selectedRegion) return [];
            const filtered = villages.filter({
                "StepLocation.useMemo[districts].filtered": (v)=>v.region === selectedRegion
            }["StepLocation.useMemo[districts].filtered"]);
            return [
                ...new Map(filtered.map({
                    "StepLocation.useMemo[districts]": (v)=>[
                            v.district,
                            v.district
                        ]
                }["StepLocation.useMemo[districts]"])).entries()
            ].map({
                "StepLocation.useMemo[districts]": (param)=>{
                    let [, name] = param;
                    return {
                        code: name,
                        name
                    };
                }
            }["StepLocation.useMemo[districts]"]).sort({
                "StepLocation.useMemo[districts]": (a, b)=>a.name.localeCompare(b.name, "cs")
            }["StepLocation.useMemo[districts]"]);
        }
    }["StepLocation.useMemo[districts]"], [
        selectedRegion,
        villages
    ]);
    const filteredVillages = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "StepLocation.useMemo[filteredVillages]": ()=>{
            let result = villages;
            if (selectedRegion) result = result.filter({
                "StepLocation.useMemo[filteredVillages]": (v)=>v.region === selectedRegion
            }["StepLocation.useMemo[filteredVillages]"]);
            if (selectedDistrict) result = result.filter({
                "StepLocation.useMemo[filteredVillages]": (v)=>v.district === selectedDistrict
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
        selectedRegion,
        selectedDistrict,
        search
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex-1 flex flex-col p-6 max-w-lg mx-auto w-full",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                className: "font-heading text-3xl font-bold text-pitch-500 mb-1",
                children: "Kde hraješ?"
            }, void 0, false, {
                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-location.tsx",
                lineNumber: 77,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "text-muted mb-6",
                children: "Vyber obec, kde založíš svůj tým."
            }, void 0, false, {
                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-location.tsx",
                lineNumber: 80,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                type: "text",
                placeholder: "Hledat obec...",
                value: search,
                onChange: (e)=>setSearch(e.target.value),
                className: "w-full px-4 py-3 rounded-card border border-gray-200 focus:border-pitch-500 focus:outline-none mb-4 text-base"
            }, void 0, false, {
                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-location.tsx",
                lineNumber: 83,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex gap-2 mb-4 flex-wrap",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                        value: selectedRegion,
                        onChange: (e)=>{
                            setSelectedRegion(e.target.value);
                            setSelectedDistrict("");
                        },
                        className: "px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                value: "",
                                children: "Všechny kraje"
                            }, void 0, false, {
                                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-location.tsx",
                                lineNumber: 98,
                                columnNumber: 11
                            }, this),
                            regions.map((r)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                    value: r.code,
                                    children: r.name
                                }, r.code, false, {
                                    fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-location.tsx",
                                    lineNumber: 100,
                                    columnNumber: 13
                                }, this))
                        ]
                    }, void 0, true, {
                        fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-location.tsx",
                        lineNumber: 93,
                        columnNumber: 9
                    }, this),
                    districts.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                        value: selectedDistrict,
                        onChange: (e)=>setSelectedDistrict(e.target.value),
                        className: "px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                value: "",
                                children: "Všechny okresy"
                            }, void 0, false, {
                                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-location.tsx",
                                lineNumber: 110,
                                columnNumber: 13
                            }, this),
                            districts.map((d)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                    value: d.code,
                                    children: d.name
                                }, d.code, false, {
                                    fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-location.tsx",
                                    lineNumber: 112,
                                    columnNumber: 15
                                }, this))
                        ]
                    }, void 0, true, {
                        fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-location.tsx",
                        lineNumber: 105,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-location.tsx",
                lineNumber: 92,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex-1 overflow-y-auto space-y-2",
                children: [
                    filteredVillages.slice(0, 50).map((v)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            onClick: ()=>onSelect({
                                    id: v.id,
                                    name: v.name,
                                    district: v.district,
                                    region: v.region,
                                    population: v.population,
                                    size: v.size
                                }),
                            className: "w-full bg-white rounded-card shadow-card hover:shadow-hover p-4 text-left transition-all flex justify-between items-center",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "font-heading font-bold text-lg",
                                            children: v.name
                                        }, void 0, false, {
                                            fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-location.tsx",
                                            lineNumber: 134,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "text-sm text-muted",
                                            children: [
                                                v.district,
                                                " · ",
                                                v.population.toLocaleString("cs"),
                                                " obyvatel"
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-location.tsx",
                                            lineNumber: 135,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-location.tsx",
                                    lineNumber: 133,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "text-xs text-right",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            children: getDifficultyStars(v.size)
                                        }, void 0, false, {
                                            fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-location.tsx",
                                            lineNumber: 140,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "text-muted mt-1",
                                            children: v.pitch_type === "hlinak" ? "Hlinkak" : v.pitch_type === "trava" ? "Trava" : "Umelka"
                                        }, void 0, false, {
                                            fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-location.tsx",
                                            lineNumber: 141,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-location.tsx",
                                    lineNumber: 139,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, v.id, true, {
                            fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-location.tsx",
                            lineNumber: 121,
                            columnNumber: 11
                        }, this)),
                    filteredVillages.length === 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "text-center text-muted py-8",
                        children: "Zádná obec nenalezena"
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-location.tsx",
                        lineNumber: 149,
                        columnNumber: 11
                    }, this),
                    filteredVillages.length > 50 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "text-center text-muted py-4 text-sm",
                        children: [
                            "Zobrazeno 50 z ",
                            filteredVillages.length,
                            " obcí. Zúži hledání."
                        ]
                    }, void 0, true, {
                        fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-location.tsx",
                        lineNumber: 153,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-location.tsx",
                lineNumber: 119,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-location.tsx",
        lineNumber: 76,
        columnNumber: 5
    }, this);
}
_s(StepLocation, "nRDqv7KxBPvRZW3nz1K8lPV9NIo=");
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
const COLOR_PRESETS = [
    "#2D5F2D",
    "#D94032",
    "#2563EB",
    "#F59E0B",
    "#7C3AED",
    "#0891B2",
    "#DC2626",
    "#1D4ED8",
    "#047857",
    "#B45309",
    "#1A1A1A",
    "#9F1239",
    "#4338CA",
    "#0E7490",
    "#92400E"
];
const TEAM_PREFIXES = [
    "SK",
    "FK",
    "TJ",
    "Sokol",
    "Slavoj",
    "Spartak",
    "Jiskra",
    "FC"
];
function StepTeam(param) {
    let { village, teamName: initialName, primaryColor: initialPrimary, secondaryColor: initialSecondary, onBack, onSubmit } = param;
    _s();
    const [teamName, setTeamName] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(initialName);
    const [primaryColor, setPrimaryColor] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(initialPrimary);
    const [secondaryColor, setSecondaryColor] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(initialSecondary);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex-1 flex flex-col p-6 max-w-lg mx-auto w-full",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                onClick: onBack,
                className: "text-muted hover:text-pitch-500 mb-4 text-sm self-start",
                children: "← Zpět na výběr obce"
            }, void 0, false, {
                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                lineNumber: 30,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                className: "font-heading text-3xl font-bold text-pitch-500 mb-1",
                children: "Tvůj tým"
            }, void 0, false, {
                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                lineNumber: 34,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "text-muted mb-6",
                children: [
                    village.name,
                    ", ",
                    village.district
                ]
            }, void 0, true, {
                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                lineNumber: 37,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                className: "text-sm font-medium text-muted mb-2 block",
                children: "Název týmu"
            }, void 0, false, {
                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                lineNumber: 40,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                type: "text",
                value: teamName,
                onChange: (e)=>setTeamName(e.target.value),
                className: "w-full px-4 py-3 rounded-card border border-gray-200 focus:border-pitch-500 focus:outline-none mb-2 text-base font-heading font-bold text-lg"
            }, void 0, false, {
                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                lineNumber: 41,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex gap-2 mb-6 flex-wrap",
                children: TEAM_PREFIXES.map((prefix)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        onClick: ()=>setTeamName("".concat(prefix, " ").concat(village.name)),
                        className: "px-3 py-1 text-xs rounded-full bg-gray-100 hover:bg-pitch-500/10 hover:text-pitch-500 transition-colors",
                        children: [
                            prefix,
                            " ",
                            village.name
                        ]
                    }, prefix, true, {
                        fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                        lineNumber: 49,
                        columnNumber: 11
                    }, this))
            }, void 0, false, {
                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                lineNumber: 47,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                className: "text-sm font-medium text-muted mb-3 block",
                children: "Barvy dresu"
            }, void 0, false, {
                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                lineNumber: 60,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center gap-8 mb-6",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                        width: "120",
                        height: "140",
                        viewBox: "0 0 120 140",
                        className: "shrink-0",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                d: "M30,35 L15,50 L15,130 L105,130 L105,50 L90,35 L80,25 C75,22 65,20 60,20 C55,20 45,22 40,25Z",
                                fill: primaryColor,
                                stroke: "#00000020",
                                strokeWidth: "1"
                            }, void 0, false, {
                                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                                lineNumber: 65,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                d: "M40,25 C45,22 55,20 60,20 C65,20 75,22 80,25 L75,30 C70,27 65,25 60,25 C55,25 50,27 45,30Z",
                                fill: secondaryColor
                            }, void 0, false, {
                                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                                lineNumber: 68,
                                columnNumber: 11
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
                                lineNumber: 71,
                                columnNumber: 11
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
                                lineNumber: 72,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("text", {
                                x: "60",
                                y: "90",
                                textAnchor: "middle",
                                fontSize: "32",
                                fontWeight: "bold",
                                fill: secondaryColor,
                                fontFamily: "var(--font-heading)",
                                opacity: "0.9",
                                children: "10"
                            }, void 0, false, {
                                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                                lineNumber: 74,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                        lineNumber: 63,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "space-y-4",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "text-xs text-muted mb-1",
                                        children: "Hlavní barva"
                                    }, void 0, false, {
                                        fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                                        lineNumber: 82,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "flex gap-1.5 flex-wrap",
                                        children: COLOR_PRESETS.map((c)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                onClick: ()=>setPrimaryColor(c),
                                                className: "w-8 h-8 rounded-full transition-transform ".concat(primaryColor === c ? "ring-2 ring-pitch-500 ring-offset-2 scale-110" : "hover:scale-110"),
                                                style: {
                                                    backgroundColor: c
                                                }
                                            }, "p-".concat(c), false, {
                                                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                                                lineNumber: 85,
                                                columnNumber: 17
                                            }, this))
                                    }, void 0, false, {
                                        fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                                        lineNumber: 83,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                                lineNumber: 81,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "text-xs text-muted mb-1",
                                        children: "Doplňková barva"
                                    }, void 0, false, {
                                        fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                                        lineNumber: 95,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "flex gap-1.5 flex-wrap",
                                        children: [
                                            "#FFFFFF",
                                            ...COLOR_PRESETS
                                        ].map((c)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                onClick: ()=>setSecondaryColor(c),
                                                className: "w-8 h-8 rounded-full border border-gray-200 transition-transform ".concat(secondaryColor === c ? "ring-2 ring-pitch-500 ring-offset-2 scale-110" : "hover:scale-110"),
                                                style: {
                                                    backgroundColor: c
                                                }
                                            }, "s-".concat(c), false, {
                                                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                                                lineNumber: 98,
                                                columnNumber: 17
                                            }, this))
                                    }, void 0, false, {
                                        fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                                        lineNumber: 96,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                                lineNumber: 94,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                        lineNumber: 80,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                lineNumber: 61,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "bg-white rounded-card shadow-card p-4 mb-6",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "font-heading font-bold text-lg",
                        children: teamName
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                        lineNumber: 112,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "text-sm text-muted",
                        children: [
                            village.name,
                            " · ",
                            village.population.toLocaleString("cs"),
                            " obyvatel · ",
                            village.district
                        ]
                    }, void 0, true, {
                        fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                        lineNumber: 113,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                lineNumber: 111,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                onClick: ()=>onSubmit(teamName, primaryColor, secondaryColor),
                disabled: !teamName.trim(),
                className: "w-full bg-pitch-500 hover:bg-pitch-400 disabled:bg-gray-300 text-white font-heading text-xl font-bold py-4 rounded-card shadow-card hover:shadow-hover transition-all",
                children: [
                    "Založit ",
                    teamName || "tým"
                ]
            }, void 0, true, {
                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
                lineNumber: 119,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-team.tsx",
        lineNumber: 29,
        columnNumber: 5
    }, this);
}
_s(StepTeam, "SpLFpXIy3wI6loajk0p6aqqHPi4=");
_c = StepTeam;
var _c;
__turbopack_context__.k.register(_c, "StepTeam");
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
;
var _s = __turbopack_context__.k.signature();
"use client";
;
const POS_LABEL = {
    GK: "Brankář",
    DEF: "Obránce",
    MID: "Záložník",
    FWD: "Útočník"
};
function StepReveal(param) {
    let { teamName, primaryColor, players, onComplete } = param;
    _s();
    const [revealedCount, setRevealedCount] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(0);
    const [isRevealing, setIsRevealing] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(true);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "StepReveal.useEffect": ()=>{
            if (revealedCount >= players.length) {
                setIsRevealing(false);
                return;
            }
            const timer = setTimeout({
                "StepReveal.useEffect.timer": ()=>setRevealedCount({
                        "StepReveal.useEffect.timer": (c)=>c + 1
                    }["StepReveal.useEffect.timer"])
            }["StepReveal.useEffect.timer"], 500);
            return ({
                "StepReveal.useEffect": ()=>clearTimeout(timer)
            })["StepReveal.useEffect"];
        }
    }["StepReveal.useEffect"], [
        revealedCount,
        players.length
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex-1 flex flex-col p-6 max-w-lg mx-auto w-full",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                className: "font-heading text-3xl font-bold text-pitch-500 mb-1",
                children: teamName
            }, void 0, false, {
                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-reveal.tsx",
                lineNumber: 35,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "text-muted mb-6",
                children: "Tady je tvůj kádr!"
            }, void 0, false, {
                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-reveal.tsx",
                lineNumber: 36,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex-1 overflow-y-auto space-y-3 mb-6",
                children: [
                    players.slice(0, revealedCount).map((player)=>{
                        var _player_lifeContext;
                        var _POS_LABEL_player_position, _player_lifeContext_occupation;
                        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "bg-white rounded-card shadow-card p-4 flex gap-4 items-start",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "w-12 h-12 rounded-full shrink-0 flex items-center justify-center text-white font-heading font-bold text-lg",
                                    style: {
                                        backgroundColor: primaryColor
                                    },
                                    children: player.first_name[0]
                                }, void 0, false, {
                                    fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-reveal.tsx",
                                    lineNumber: 41,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "flex-1 min-w-0",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "flex items-baseline gap-2",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "font-heading font-bold",
                                                    children: [
                                                        player.first_name,
                                                        " ",
                                                        player.last_name
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-reveal.tsx",
                                                    lineNumber: 49,
                                                    columnNumber: 17
                                                }, this),
                                                player.nickname && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "text-sm text-gold-500",
                                                    children: [
                                                        "„",
                                                        player.nickname,
                                                        "“"
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-reveal.tsx",
                                                    lineNumber: 50,
                                                    columnNumber: 37
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-reveal.tsx",
                                            lineNumber: 48,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "text-xs text-muted flex gap-2 mt-0.5",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "bg-pitch-500/10 text-pitch-500 px-1.5 py-0.5 rounded font-heading font-bold",
                                                    children: (_POS_LABEL_player_position = POS_LABEL[player.position]) !== null && _POS_LABEL_player_position !== void 0 ? _POS_LABEL_player_position : player.position
                                                }, void 0, false, {
                                                    fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-reveal.tsx",
                                                    lineNumber: 53,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    children: [
                                                        player.age,
                                                        " let"
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-reveal.tsx",
                                                    lineNumber: 56,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    children: "·"
                                                }, void 0, false, {
                                                    fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-reveal.tsx",
                                                    lineNumber: 57,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    children: (_player_lifeContext_occupation = (_player_lifeContext = player.lifeContext) === null || _player_lifeContext === void 0 ? void 0 : _player_lifeContext.occupation) !== null && _player_lifeContext_occupation !== void 0 ? _player_lifeContext_occupation : ""
                                                }, void 0, false, {
                                                    fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-reveal.tsx",
                                                    lineNumber: 58,
                                                    columnNumber: 17
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-reveal.tsx",
                                            lineNumber: 52,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: "text-sm text-muted mt-1.5",
                                            children: player.description
                                        }, void 0, false, {
                                            fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-reveal.tsx",
                                            lineNumber: 60,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-reveal.tsx",
                                    lineNumber: 47,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "text-right shrink-0",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "font-heading font-bold text-2xl tabular-nums",
                                        style: {
                                            color: primaryColor
                                        },
                                        children: player.overall_rating
                                    }, void 0, false, {
                                        fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-reveal.tsx",
                                        lineNumber: 63,
                                        columnNumber: 15
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-reveal.tsx",
                                    lineNumber: 62,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, player.id, true, {
                            fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-reveal.tsx",
                            lineNumber: 40,
                            columnNumber: 11
                        }, this);
                    }),
                    isRevealing && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "text-center py-4",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "inline-block w-6 h-6 border-2 border-pitch-500 border-t-transparent rounded-full animate-spin"
                        }, void 0, false, {
                            fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-reveal.tsx",
                            lineNumber: 67,
                            columnNumber: 59
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-reveal.tsx",
                        lineNumber: 67,
                        columnNumber: 25
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-reveal.tsx",
                lineNumber: 38,
                columnNumber: 7
            }, this),
            !isRevealing && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                onClick: onComplete,
                className: "w-full bg-pitch-500 hover:bg-pitch-400 text-white font-heading text-xl font-bold py-4 rounded-card shadow-card hover:shadow-hover transition-all",
                children: "Jdeme na to!"
            }, void 0, false, {
                fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-reveal.tsx",
                lineNumber: 71,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/Projects/fmko/apps/web/src/components/onboarding/step-reveal.tsx",
        lineNumber: 34,
        columnNumber: 5
    }, this);
}
_s(StepReveal, "UIl0f75pAt5Qo0lpaZCAcdzw/fs=");
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
    const { setTeam } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$apps$2f$web$2f$src$2f$context$2f$team$2d$context$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTeam"])();
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
            const result = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$apps$2f$web$2f$src$2f$lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiFetch"])("/api/teams", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
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
        className: "min-h-screen flex flex-col",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "h-1 bg-gray-200",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "h-full bg-pitch-500 transition-all duration-500",
                    style: {
                        width: "".concat(step / 3 * 100, "%")
                    }
                }, void 0, false, {
                    fileName: "[project]/Projects/fmko/apps/web/src/app/onboarding/page.tsx",
                    lineNumber: 94,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/Projects/fmko/apps/web/src/app/onboarding/page.tsx",
                lineNumber: 93,
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
                        lineNumber: 102,
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
                                lineNumber: 116,
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
                                            lineNumber: 127,
                                            columnNumber: 19
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: "font-heading font-bold text-pitch-500",
                                            children: "Generuji tým..."
                                        }, void 0, false, {
                                            fileName: "[project]/Projects/fmko/apps/web/src/app/onboarding/page.tsx",
                                            lineNumber: 128,
                                            columnNumber: 19
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/Projects/fmko/apps/web/src/app/onboarding/page.tsx",
                                    lineNumber: 126,
                                    columnNumber: 17
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/Projects/fmko/apps/web/src/app/onboarding/page.tsx",
                                lineNumber: 125,
                                columnNumber: 15
                            }, this),
                            error && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "fixed bottom-4 left-4 right-4 bg-card-red text-white p-4 rounded-card text-center",
                                children: error
                            }, void 0, false, {
                                fileName: "[project]/Projects/fmko/apps/web/src/app/onboarding/page.tsx",
                                lineNumber: 133,
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
                        lineNumber: 141,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/Projects/fmko/apps/web/src/app/onboarding/page.tsx",
                lineNumber: 100,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/Projects/fmko/apps/web/src/app/onboarding/page.tsx",
        lineNumber: 91,
        columnNumber: 5
    }, this);
}
_s(OnboardingPage, "zO9KKxkr4U7WAYcUtXLzfRJR+3E=", false, function() {
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

//# sourceMappingURL=Projects_fmko_apps_web_src_e62affe9._.js.map