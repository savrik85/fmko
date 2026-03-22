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
"[project]/Projects/fmko/apps/web/src/context/team-context.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "TeamProvider",
    ()=>TeamProvider,
    "useTeam",
    ()=>useTeam
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/node_modules/next/navigation.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$apps$2f$web$2f$src$2f$lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/apps/web/src/lib/api.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature(), _s1 = __turbopack_context__.k.signature();
"use client";
;
;
;
const TeamContext = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createContext"])(null);
const STORAGE_TOKEN = "om_token";
const PUBLIC_PATHS = [
    "/",
    "/login",
    "/register"
];
function TeamProvider(param) {
    let { children } = param;
    _s();
    const [state, setState] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])({
        token: null,
        userId: null,
        email: null,
        teamId: null,
        teamName: null,
        isLoading: true
    });
    const router = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRouter"])();
    const pathname = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["usePathname"])();
    // Load token on mount, verify with /auth/me
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "TeamProvider.useEffect": ()=>{
            const stored = localStorage.getItem(STORAGE_TOKEN);
            if (!stored) {
                setState({
                    "TeamProvider.useEffect": (s)=>({
                            ...s,
                            isLoading: false
                        })
                }["TeamProvider.useEffect"]);
                return;
            }
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$apps$2f$web$2f$src$2f$lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiFetch"])("/auth/me", {
                headers: {
                    Authorization: "Bearer ".concat(stored)
                }
            }).then({
                "TeamProvider.useEffect": (user)=>{
                    setState({
                        token: stored,
                        userId: user.id,
                        email: user.email,
                        teamId: user.teamId,
                        teamName: user.teamName,
                        isLoading: false
                    });
                }
            }["TeamProvider.useEffect"]).catch({
                "TeamProvider.useEffect": ()=>{
                    localStorage.removeItem(STORAGE_TOKEN);
                    setState({
                        token: null,
                        userId: null,
                        email: null,
                        teamId: null,
                        teamName: null,
                        isLoading: false
                    });
                }
            }["TeamProvider.useEffect"]);
        }
    }["TeamProvider.useEffect"], []);
    // Redirect logic
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "TeamProvider.useEffect": ()=>{
            if (state.isLoading) return;
            const isPublic = PUBLIC_PATHS.includes(pathname);
            const isOnboarding = pathname.startsWith("/onboarding");
            if (!state.token && !isPublic) {
                router.replace("/login");
            } else if (state.token && !state.teamId && !isOnboarding && !isPublic) {
                router.replace("/onboarding");
            }
        }
    }["TeamProvider.useEffect"], [
        state.token,
        state.teamId,
        state.isLoading,
        pathname,
        router
    ]);
    function login(token, user) {
        localStorage.setItem(STORAGE_TOKEN, token);
        setState({
            token,
            userId: user.id,
            email: user.email,
            teamId: user.teamId,
            teamName: user.teamName,
            isLoading: false
        });
    }
    function setTeam(id, name) {
        setState((s)=>({
                ...s,
                teamId: id,
                teamName: name
            }));
    }
    function logout() {
        const t = state.token;
        if (t) (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$apps$2f$web$2f$src$2f$lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiFetch"])("/auth/logout", {
            method: "POST",
            headers: {
                Authorization: "Bearer ".concat(t)
            }
        }).catch(()=>{});
        localStorage.removeItem(STORAGE_TOKEN);
        setState({
            token: null,
            userId: null,
            email: null,
            teamId: null,
            teamName: null,
            isLoading: false
        });
        router.replace("/login");
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(TeamContext.Provider, {
        value: {
            ...state,
            login,
            setTeam,
            logout
        },
        children: children
    }, void 0, false, {
        fileName: "[project]/Projects/fmko/apps/web/src/context/team-context.tsx",
        lineNumber: 88,
        columnNumber: 5
    }, this);
}
_s(TeamProvider, "DkHndpbdEKhGWJ8UawuX0j/M8Mc=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRouter"],
        __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["usePathname"]
    ];
});
_c = TeamProvider;
function useTeam() {
    _s1();
    const ctx = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useContext"])(TeamContext);
    if (!ctx) throw new Error("useTeam must be used within TeamProvider");
    return ctx;
}
_s1(useTeam, "/dMy7t63NXD4eYACoT93CePwGrg=");
var _c;
__turbopack_context__.k.register(_c, "TeamProvider");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=Projects_fmko_apps_web_src_9ef80b44._.js.map