module.exports = [
"[project]/Projects/fmko/node_modules/@swc/helpers/cjs/_interop_require_wildcard.cjs [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

function _getRequireWildcardCache(nodeInterop) {
    if (typeof WeakMap !== "function") return null;
    var cacheBabelInterop = new WeakMap();
    var cacheNodeInterop = new WeakMap();
    return (_getRequireWildcardCache = function(nodeInterop) {
        return nodeInterop ? cacheNodeInterop : cacheBabelInterop;
    })(nodeInterop);
}
function _interop_require_wildcard(obj, nodeInterop) {
    if (!nodeInterop && obj && obj.__esModule) return obj;
    if (obj === null || typeof obj !== "object" && typeof obj !== "function") return {
        default: obj
    };
    var cache = _getRequireWildcardCache(nodeInterop);
    if (cache && cache.has(obj)) return cache.get(obj);
    var newObj = {
        __proto__: null
    };
    var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor;
    for(var key in obj){
        if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) {
            var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null;
            if (desc && (desc.get || desc.set)) Object.defineProperty(newObj, key, desc);
            else newObj[key] = obj[key];
        }
    }
    newObj.default = obj;
    if (cache) cache.set(obj, newObj);
    return newObj;
}
exports._ = _interop_require_wildcard;
}),
"[project]/Projects/fmko/node_modules/next/dist/shared/lib/router/utils/querystring.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    assign: null,
    searchParamsToUrlQuery: null,
    urlQueryToSearchParams: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    assign: function() {
        return assign;
    },
    searchParamsToUrlQuery: function() {
        return searchParamsToUrlQuery;
    },
    urlQueryToSearchParams: function() {
        return urlQueryToSearchParams;
    }
});
function searchParamsToUrlQuery(searchParams) {
    const query = {};
    for (const [key, value] of searchParams.entries()){
        const existing = query[key];
        if (typeof existing === 'undefined') {
            query[key] = value;
        } else if (Array.isArray(existing)) {
            existing.push(value);
        } else {
            query[key] = [
                existing,
                value
            ];
        }
    }
    return query;
}
function stringifyUrlQueryParam(param) {
    if (typeof param === 'string') {
        return param;
    }
    if (typeof param === 'number' && !isNaN(param) || typeof param === 'boolean') {
        return String(param);
    } else {
        return '';
    }
}
function urlQueryToSearchParams(query) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(query)){
        if (Array.isArray(value)) {
            for (const item of value){
                searchParams.append(key, stringifyUrlQueryParam(item));
            }
        } else {
            searchParams.set(key, stringifyUrlQueryParam(value));
        }
    }
    return searchParams;
}
function assign(target) {
    for(var _len = arguments.length, searchParamsList = new Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++){
        searchParamsList[_key - 1] = arguments[_key];
    }
    for (const searchParams of searchParamsList){
        for (const key of searchParams.keys()){
            target.delete(key);
        }
        for (const [key, value] of searchParams.entries()){
            target.append(key, value);
        }
    }
    return target;
} //# sourceMappingURL=querystring.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/shared/lib/router/utils/format-url.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

// Format function modified from nodejs
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.
Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    formatUrl: null,
    formatWithValidation: null,
    urlObjectKeys: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    formatUrl: function() {
        return formatUrl;
    },
    formatWithValidation: function() {
        return formatWithValidation;
    },
    urlObjectKeys: function() {
        return urlObjectKeys;
    }
});
const _interop_require_wildcard = __turbopack_context__.r("[project]/Projects/fmko/node_modules/@swc/helpers/cjs/_interop_require_wildcard.cjs [app-ssr] (ecmascript)");
const _querystring = /*#__PURE__*/ _interop_require_wildcard._(__turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/shared/lib/router/utils/querystring.js [app-ssr] (ecmascript)"));
const slashedProtocols = /https?|ftp|gopher|file/;
function formatUrl(urlObj) {
    let { auth, hostname } = urlObj;
    let protocol = urlObj.protocol || '';
    let pathname = urlObj.pathname || '';
    let hash = urlObj.hash || '';
    let query = urlObj.query || '';
    let host = false;
    auth = auth ? encodeURIComponent(auth).replace(/%3A/i, ':') + '@' : '';
    if (urlObj.host) {
        host = auth + urlObj.host;
    } else if (hostname) {
        host = auth + (~hostname.indexOf(':') ? "[" + hostname + "]" : hostname);
        if (urlObj.port) {
            host += ':' + urlObj.port;
        }
    }
    if (query && typeof query === 'object') {
        query = String(_querystring.urlQueryToSearchParams(query));
    }
    let search = urlObj.search || query && "?" + query || '';
    if (protocol && !protocol.endsWith(':')) protocol += ':';
    if (urlObj.slashes || (!protocol || slashedProtocols.test(protocol)) && host !== false) {
        host = '//' + (host || '');
        if (pathname && pathname[0] !== '/') pathname = '/' + pathname;
    } else if (!host) {
        host = '';
    }
    if (hash && hash[0] !== '#') hash = '#' + hash;
    if (search && search[0] !== '?') search = '?' + search;
    pathname = pathname.replace(/[?#]/g, encodeURIComponent);
    search = search.replace('#', '%23');
    return "" + protocol + host + pathname + search + hash;
}
const urlObjectKeys = [
    'auth',
    'hash',
    'host',
    'hostname',
    'href',
    'path',
    'pathname',
    'port',
    'protocol',
    'query',
    'search',
    'slashes'
];
function formatWithValidation(url) {
    if ("TURBOPACK compile-time truthy", 1) {
        if (url !== null && typeof url === 'object') {
            Object.keys(url).forEach((key)=>{
                if (!urlObjectKeys.includes(key)) {
                    console.warn("Unknown key passed via urlObject into url.format: " + key);
                }
            });
        }
    }
    return formatUrl(url);
} //# sourceMappingURL=format-url.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/use-merged-ref.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "useMergedRef", {
    enumerable: true,
    get: function() {
        return useMergedRef;
    }
});
const _react = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
function useMergedRef(refA, refB) {
    const cleanupA = (0, _react.useRef)(null);
    const cleanupB = (0, _react.useRef)(null);
    // NOTE: In theory, we could skip the wrapping if only one of the refs is non-null.
    // (this happens often if the user doesn't pass a ref to Link/Form/Image)
    // But this can cause us to leak a cleanup-ref into user code (e.g. via `<Link legacyBehavior>`),
    // and the user might pass that ref into ref-merging library that doesn't support cleanup refs
    // (because it hasn't been updated for React 19)
    // which can then cause things to blow up, because a cleanup-returning ref gets called with `null`.
    // So in practice, it's safer to be defensive and always wrap the ref, even on React 19.
    return (0, _react.useCallback)((current)=>{
        if (current === null) {
            const cleanupFnA = cleanupA.current;
            if (cleanupFnA) {
                cleanupA.current = null;
                cleanupFnA();
            }
            const cleanupFnB = cleanupB.current;
            if (cleanupFnB) {
                cleanupB.current = null;
                cleanupFnB();
            }
        } else {
            if (refA) {
                cleanupA.current = applyRef(refA, current);
            }
            if (refB) {
                cleanupB.current = applyRef(refB, current);
            }
        }
    }, [
        refA,
        refB
    ]);
}
function applyRef(refA, current) {
    if (typeof refA === 'function') {
        const cleanup = refA(current);
        if (typeof cleanup === 'function') {
            return cleanup;
        } else {
            return ()=>refA(null);
        }
    } else {
        refA.current = current;
        return ()=>{
            refA.current = null;
        };
    }
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=use-merged-ref.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/shared/lib/utils.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    DecodeError: null,
    MiddlewareNotFoundError: null,
    MissingStaticPage: null,
    NormalizeError: null,
    PageNotFoundError: null,
    SP: null,
    ST: null,
    WEB_VITALS: null,
    execOnce: null,
    getDisplayName: null,
    getLocationOrigin: null,
    getURL: null,
    isAbsoluteUrl: null,
    isResSent: null,
    loadGetInitialProps: null,
    normalizeRepeatedSlashes: null,
    stringifyError: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    DecodeError: function() {
        return DecodeError;
    },
    MiddlewareNotFoundError: function() {
        return MiddlewareNotFoundError;
    },
    MissingStaticPage: function() {
        return MissingStaticPage;
    },
    NormalizeError: function() {
        return NormalizeError;
    },
    PageNotFoundError: function() {
        return PageNotFoundError;
    },
    SP: function() {
        return SP;
    },
    ST: function() {
        return ST;
    },
    WEB_VITALS: function() {
        return WEB_VITALS;
    },
    execOnce: function() {
        return execOnce;
    },
    getDisplayName: function() {
        return getDisplayName;
    },
    getLocationOrigin: function() {
        return getLocationOrigin;
    },
    getURL: function() {
        return getURL;
    },
    isAbsoluteUrl: function() {
        return isAbsoluteUrl;
    },
    isResSent: function() {
        return isResSent;
    },
    loadGetInitialProps: function() {
        return loadGetInitialProps;
    },
    normalizeRepeatedSlashes: function() {
        return normalizeRepeatedSlashes;
    },
    stringifyError: function() {
        return stringifyError;
    }
});
const WEB_VITALS = [
    'CLS',
    'FCP',
    'FID',
    'INP',
    'LCP',
    'TTFB'
];
function execOnce(fn) {
    let used = false;
    let result;
    return function() {
        for(var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++){
            args[_key] = arguments[_key];
        }
        if (!used) {
            used = true;
            result = fn(...args);
        }
        return result;
    };
}
// Scheme: https://tools.ietf.org/html/rfc3986#section-3.1
// Absolute URL: https://tools.ietf.org/html/rfc3986#section-4.3
const ABSOLUTE_URL_REGEX = /^[a-zA-Z][a-zA-Z\d+\-.]*?:/;
const isAbsoluteUrl = (url)=>ABSOLUTE_URL_REGEX.test(url);
function getLocationOrigin() {
    const { protocol, hostname, port } = window.location;
    return protocol + "//" + hostname + (port ? ':' + port : '');
}
function getURL() {
    const { href } = window.location;
    const origin = getLocationOrigin();
    return href.substring(origin.length);
}
function getDisplayName(Component) {
    return typeof Component === 'string' ? Component : Component.displayName || Component.name || 'Unknown';
}
function isResSent(res) {
    return res.finished || res.headersSent;
}
function normalizeRepeatedSlashes(url) {
    const urlParts = url.split('?');
    const urlNoQuery = urlParts[0];
    return urlNoQuery // first we replace any non-encoded backslashes with forward
    // then normalize repeated forward slashes
    .replace(/\\/g, '/').replace(/\/\/+/g, '/') + (urlParts[1] ? "?" + urlParts.slice(1).join('?') : '');
}
async function loadGetInitialProps(App, ctx) {
    if ("TURBOPACK compile-time truthy", 1) {
        var _App_prototype;
        if ((_App_prototype = App.prototype) == null ? void 0 : _App_prototype.getInitialProps) {
            const message = '"' + getDisplayName(App) + '.getInitialProps()" is defined as an instance method - visit https://nextjs.org/docs/messages/get-initial-props-as-an-instance-method for more information.';
            throw Object.defineProperty(new Error(message), "__NEXT_ERROR_CODE", {
                value: "E394",
                enumerable: false,
                configurable: true
            });
        }
    }
    // when called from _app `ctx` is nested in `ctx`
    const res = ctx.res || ctx.ctx && ctx.ctx.res;
    if (!App.getInitialProps) {
        if (ctx.ctx && ctx.Component) {
            // @ts-ignore pageProps default
            return {
                pageProps: await loadGetInitialProps(ctx.Component, ctx.ctx)
            };
        }
        return {};
    }
    const props = await App.getInitialProps(ctx);
    if (res && isResSent(res)) {
        return props;
    }
    if (!props) {
        const message = '"' + getDisplayName(App) + '.getInitialProps()" should resolve to an object. But found "' + props + '" instead.';
        throw Object.defineProperty(new Error(message), "__NEXT_ERROR_CODE", {
            value: "E394",
            enumerable: false,
            configurable: true
        });
    }
    if ("TURBOPACK compile-time truthy", 1) {
        if (Object.keys(props).length === 0 && !ctx.ctx) {
            console.warn("" + getDisplayName(App) + " returned an empty object from `getInitialProps`. This de-optimizes and prevents automatic static optimization. https://nextjs.org/docs/messages/empty-object-getInitialProps");
        }
    }
    return props;
}
const SP = typeof performance !== 'undefined';
const ST = SP && [
    'mark',
    'measure',
    'getEntriesByName'
].every((method)=>typeof performance[method] === 'function');
class DecodeError extends Error {
}
class NormalizeError extends Error {
}
class PageNotFoundError extends Error {
    constructor(page){
        super();
        this.code = 'ENOENT';
        this.name = 'PageNotFoundError';
        this.message = "Cannot find module for page: " + page;
    }
}
class MissingStaticPage extends Error {
    constructor(page, message){
        super();
        this.message = "Failed to load static file for page: " + page + " " + message;
    }
}
class MiddlewareNotFoundError extends Error {
    constructor(){
        super();
        this.code = 'ENOENT';
        this.message = "Cannot find the middleware module";
    }
}
function stringifyError(error) {
    return JSON.stringify({
        message: error.message,
        stack: error.stack
    });
} //# sourceMappingURL=utils.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/shared/lib/router/utils/parse-path.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

/**
 * Given a path this function will find the pathname, query and hash and return
 * them. This is useful to parse full paths on the client side.
 * @param path A path to parse e.g. /foo/bar?id=1#hash
 */ Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "parsePath", {
    enumerable: true,
    get: function() {
        return parsePath;
    }
});
function parsePath(path) {
    const hashIndex = path.indexOf('#');
    const queryIndex = path.indexOf('?');
    const hasQuery = queryIndex > -1 && (hashIndex < 0 || queryIndex < hashIndex);
    if (hasQuery || hashIndex > -1) {
        return {
            pathname: path.substring(0, hasQuery ? queryIndex : hashIndex),
            query: hasQuery ? path.substring(queryIndex, hashIndex > -1 ? hashIndex : undefined) : '',
            hash: hashIndex > -1 ? path.slice(hashIndex) : ''
        };
    }
    return {
        pathname: path,
        query: '',
        hash: ''
    };
} //# sourceMappingURL=parse-path.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/shared/lib/router/utils/add-path-prefix.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "addPathPrefix", {
    enumerable: true,
    get: function() {
        return addPathPrefix;
    }
});
const _parsepath = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/shared/lib/router/utils/parse-path.js [app-ssr] (ecmascript)");
function addPathPrefix(path, prefix) {
    if (!path.startsWith('/') || !prefix) {
        return path;
    }
    const { pathname, query, hash } = (0, _parsepath.parsePath)(path);
    return "" + prefix + pathname + query + hash;
} //# sourceMappingURL=add-path-prefix.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/shared/lib/router/utils/remove-trailing-slash.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

/**
 * Removes the trailing slash for a given route or page path. Preserves the
 * root page. Examples:
 *   - `/foo/bar/` -> `/foo/bar`
 *   - `/foo/bar` -> `/foo/bar`
 *   - `/` -> `/`
 */ Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "removeTrailingSlash", {
    enumerable: true,
    get: function() {
        return removeTrailingSlash;
    }
});
function removeTrailingSlash(route) {
    return route.replace(/\/$/, '') || '/';
} //# sourceMappingURL=remove-trailing-slash.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/normalize-trailing-slash.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "normalizePathTrailingSlash", {
    enumerable: true,
    get: function() {
        return normalizePathTrailingSlash;
    }
});
const _removetrailingslash = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/shared/lib/router/utils/remove-trailing-slash.js [app-ssr] (ecmascript)");
const _parsepath = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/shared/lib/router/utils/parse-path.js [app-ssr] (ecmascript)");
const normalizePathTrailingSlash = (path)=>{
    if (!path.startsWith('/') || ("TURBOPACK compile-time value", void 0)) {
        return path;
    }
    const { pathname, query, hash } = (0, _parsepath.parsePath)(path);
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    return "" + (0, _removetrailingslash.removeTrailingSlash)(pathname) + query + hash;
};
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=normalize-trailing-slash.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/add-base-path.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "addBasePath", {
    enumerable: true,
    get: function() {
        return addBasePath;
    }
});
const _addpathprefix = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/shared/lib/router/utils/add-path-prefix.js [app-ssr] (ecmascript)");
const _normalizetrailingslash = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/normalize-trailing-slash.js [app-ssr] (ecmascript)");
const basePath = ("TURBOPACK compile-time value", "") || '';
function addBasePath(path, required) {
    return (0, _normalizetrailingslash.normalizePathTrailingSlash)(("TURBOPACK compile-time falsy", 0) ? "TURBOPACK unreachable" : (0, _addpathprefix.addPathPrefix)(path, basePath));
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=add-base-path.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/shared/lib/utils/warn-once.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "warnOnce", {
    enumerable: true,
    get: function() {
        return warnOnce;
    }
});
let warnOnce = (_)=>{};
if ("TURBOPACK compile-time truthy", 1) {
    const warnings = new Set();
    warnOnce = (msg)=>{
        if (!warnings.has(msg)) {
            console.warn(msg);
        }
        warnings.add(msg);
    };
} //# sourceMappingURL=warn-once.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/router-reducer-types.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    ACTION_HMR_REFRESH: null,
    ACTION_NAVIGATE: null,
    ACTION_PREFETCH: null,
    ACTION_REFRESH: null,
    ACTION_RESTORE: null,
    ACTION_SERVER_ACTION: null,
    ACTION_SERVER_PATCH: null,
    PrefetchCacheEntryStatus: null,
    PrefetchKind: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    ACTION_HMR_REFRESH: function() {
        return ACTION_HMR_REFRESH;
    },
    ACTION_NAVIGATE: function() {
        return ACTION_NAVIGATE;
    },
    ACTION_PREFETCH: function() {
        return ACTION_PREFETCH;
    },
    ACTION_REFRESH: function() {
        return ACTION_REFRESH;
    },
    ACTION_RESTORE: function() {
        return ACTION_RESTORE;
    },
    ACTION_SERVER_ACTION: function() {
        return ACTION_SERVER_ACTION;
    },
    ACTION_SERVER_PATCH: function() {
        return ACTION_SERVER_PATCH;
    },
    PrefetchCacheEntryStatus: function() {
        return PrefetchCacheEntryStatus;
    },
    PrefetchKind: function() {
        return PrefetchKind;
    }
});
const ACTION_REFRESH = 'refresh';
const ACTION_NAVIGATE = 'navigate';
const ACTION_RESTORE = 'restore';
const ACTION_SERVER_PATCH = 'server-patch';
const ACTION_PREFETCH = 'prefetch';
const ACTION_HMR_REFRESH = 'hmr-refresh';
const ACTION_SERVER_ACTION = 'server-action';
var PrefetchKind = /*#__PURE__*/ function(PrefetchKind) {
    PrefetchKind["AUTO"] = "auto";
    PrefetchKind["FULL"] = "full";
    PrefetchKind["TEMPORARY"] = "temporary";
    return PrefetchKind;
}({});
var PrefetchCacheEntryStatus = /*#__PURE__*/ function(PrefetchCacheEntryStatus) {
    PrefetchCacheEntryStatus["fresh"] = "fresh";
    PrefetchCacheEntryStatus["reusable"] = "reusable";
    PrefetchCacheEntryStatus["expired"] = "expired";
    PrefetchCacheEntryStatus["stale"] = "stale";
    return PrefetchCacheEntryStatus;
}({});
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=router-reducer-types.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/components/app-router-headers.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    ACTION_HEADER: null,
    FLIGHT_HEADERS: null,
    NEXT_ACTION_NOT_FOUND_HEADER: null,
    NEXT_DID_POSTPONE_HEADER: null,
    NEXT_HMR_REFRESH_HASH_COOKIE: null,
    NEXT_HMR_REFRESH_HEADER: null,
    NEXT_IS_PRERENDER_HEADER: null,
    NEXT_REWRITTEN_PATH_HEADER: null,
    NEXT_REWRITTEN_QUERY_HEADER: null,
    NEXT_ROUTER_PREFETCH_HEADER: null,
    NEXT_ROUTER_SEGMENT_PREFETCH_HEADER: null,
    NEXT_ROUTER_STALE_TIME_HEADER: null,
    NEXT_ROUTER_STATE_TREE_HEADER: null,
    NEXT_RSC_UNION_QUERY: null,
    NEXT_URL: null,
    RSC_CONTENT_TYPE_HEADER: null,
    RSC_HEADER: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    ACTION_HEADER: function() {
        return ACTION_HEADER;
    },
    FLIGHT_HEADERS: function() {
        return FLIGHT_HEADERS;
    },
    NEXT_ACTION_NOT_FOUND_HEADER: function() {
        return NEXT_ACTION_NOT_FOUND_HEADER;
    },
    NEXT_DID_POSTPONE_HEADER: function() {
        return NEXT_DID_POSTPONE_HEADER;
    },
    NEXT_HMR_REFRESH_HASH_COOKIE: function() {
        return NEXT_HMR_REFRESH_HASH_COOKIE;
    },
    NEXT_HMR_REFRESH_HEADER: function() {
        return NEXT_HMR_REFRESH_HEADER;
    },
    NEXT_IS_PRERENDER_HEADER: function() {
        return NEXT_IS_PRERENDER_HEADER;
    },
    NEXT_REWRITTEN_PATH_HEADER: function() {
        return NEXT_REWRITTEN_PATH_HEADER;
    },
    NEXT_REWRITTEN_QUERY_HEADER: function() {
        return NEXT_REWRITTEN_QUERY_HEADER;
    },
    NEXT_ROUTER_PREFETCH_HEADER: function() {
        return NEXT_ROUTER_PREFETCH_HEADER;
    },
    NEXT_ROUTER_SEGMENT_PREFETCH_HEADER: function() {
        return NEXT_ROUTER_SEGMENT_PREFETCH_HEADER;
    },
    NEXT_ROUTER_STALE_TIME_HEADER: function() {
        return NEXT_ROUTER_STALE_TIME_HEADER;
    },
    NEXT_ROUTER_STATE_TREE_HEADER: function() {
        return NEXT_ROUTER_STATE_TREE_HEADER;
    },
    NEXT_RSC_UNION_QUERY: function() {
        return NEXT_RSC_UNION_QUERY;
    },
    NEXT_URL: function() {
        return NEXT_URL;
    },
    RSC_CONTENT_TYPE_HEADER: function() {
        return RSC_CONTENT_TYPE_HEADER;
    },
    RSC_HEADER: function() {
        return RSC_HEADER;
    }
});
const RSC_HEADER = 'rsc';
const ACTION_HEADER = 'next-action';
const NEXT_ROUTER_STATE_TREE_HEADER = 'next-router-state-tree';
const NEXT_ROUTER_PREFETCH_HEADER = 'next-router-prefetch';
const NEXT_ROUTER_SEGMENT_PREFETCH_HEADER = 'next-router-segment-prefetch';
const NEXT_HMR_REFRESH_HEADER = 'next-hmr-refresh';
const NEXT_HMR_REFRESH_HASH_COOKIE = '__next_hmr_refresh_hash__';
const NEXT_URL = 'next-url';
const RSC_CONTENT_TYPE_HEADER = 'text/x-component';
const FLIGHT_HEADERS = [
    RSC_HEADER,
    NEXT_ROUTER_STATE_TREE_HEADER,
    NEXT_ROUTER_PREFETCH_HEADER,
    NEXT_HMR_REFRESH_HEADER,
    NEXT_ROUTER_SEGMENT_PREFETCH_HEADER
];
const NEXT_RSC_UNION_QUERY = '_rsc';
const NEXT_ROUTER_STALE_TIME_HEADER = 'x-nextjs-stale-time';
const NEXT_DID_POSTPONE_HEADER = 'x-nextjs-postponed';
const NEXT_REWRITTEN_PATH_HEADER = 'x-nextjs-rewritten-path';
const NEXT_REWRITTEN_QUERY_HEADER = 'x-nextjs-rewritten-query';
const NEXT_IS_PRERENDER_HEADER = 'x-nextjs-prerender';
const NEXT_ACTION_NOT_FOUND_HEADER = 'x-nextjs-action-not-found';
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=app-router-headers.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/shared/lib/is-thenable.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

/**
 * Check to see if a value is Thenable.
 *
 * @param promise the maybe-thenable value
 * @returns true if the value is thenable
 */ Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "isThenable", {
    enumerable: true,
    get: function() {
        return isThenable;
    }
});
function isThenable(promise) {
    return promise !== null && typeof promise === 'object' && 'then' in promise && typeof promise.then === 'function';
} //# sourceMappingURL=is-thenable.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/next-devtools/userspace/use-app-dev-rendering-indicator.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "useAppDevRenderingIndicator", {
    enumerable: true,
    get: function() {
        return useAppDevRenderingIndicator;
    }
});
const _react = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
const _nextdevtools = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/compiled/next-devtools/index.js [app-ssr] (ecmascript)");
const useAppDevRenderingIndicator = ()=>{
    const [isPending, startTransition] = (0, _react.useTransition)();
    (0, _react.useEffect)(()=>{
        if (isPending) {
            _nextdevtools.dispatcher.renderingIndicatorShow();
        } else {
            _nextdevtools.dispatcher.renderingIndicatorHide();
        }
    }, [
        isPending
    ]);
    return startTransition;
};
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=use-app-dev-rendering-indicator.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/components/use-action-queue.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    dispatchAppRouterAction: null,
    useActionQueue: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    dispatchAppRouterAction: function() {
        return dispatchAppRouterAction;
    },
    useActionQueue: function() {
        return useActionQueue;
    }
});
const _interop_require_wildcard = __turbopack_context__.r("[project]/Projects/fmko/node_modules/@swc/helpers/cjs/_interop_require_wildcard.cjs [app-ssr] (ecmascript)");
const _react = /*#__PURE__*/ _interop_require_wildcard._(__turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)"));
const _isthenable = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/shared/lib/is-thenable.js [app-ssr] (ecmascript)");
// The app router state lives outside of React, so we can import the dispatch
// method directly wherever we need it, rather than passing it around via props
// or context.
let dispatch = null;
function dispatchAppRouterAction(action) {
    if (dispatch === null) {
        throw Object.defineProperty(new Error('Internal Next.js error: Router action dispatched before initialization.'), "__NEXT_ERROR_CODE", {
            value: "E668",
            enumerable: false,
            configurable: true
        });
    }
    dispatch(action);
}
function useActionQueue(actionQueue) {
    const [state, setState] = _react.default.useState(actionQueue.state);
    // Because of a known issue that requires to decode Flight streams inside the
    // render phase, we have to be a bit clever and assign the dispatch method to
    // a module-level variable upon initialization. The useState hook in this
    // module only exists to synchronize state that lives outside of React.
    // Ideally, what we'd do instead is pass the state as a prop to root.render;
    // this is conceptually how we're modeling the app router state, despite the
    // weird implementation details.
    if ("TURBOPACK compile-time truthy", 1) {
        const { useAppDevRenderingIndicator } = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/next-devtools/userspace/use-app-dev-rendering-indicator.js [app-ssr] (ecmascript)");
        // eslint-disable-next-line react-hooks/rules-of-hooks
        const appDevRenderingIndicator = useAppDevRenderingIndicator();
        dispatch = (action)=>{
            appDevRenderingIndicator(()=>{
                actionQueue.dispatch(action, setState);
            });
        };
    } else //TURBOPACK unreachable
    ;
    return (0, _isthenable.isThenable)(state) ? (0, _react.use)(state) : state;
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=use-action-queue.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/app-call-server.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "callServer", {
    enumerable: true,
    get: function() {
        return callServer;
    }
});
const _react = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
const _routerreducertypes = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/router-reducer-types.js [app-ssr] (ecmascript)");
const _useactionqueue = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/use-action-queue.js [app-ssr] (ecmascript)");
async function callServer(actionId, actionArgs) {
    return new Promise((resolve, reject)=>{
        (0, _react.startTransition)(()=>{
            (0, _useactionqueue.dispatchAppRouterAction)({
                type: _routerreducertypes.ACTION_SERVER_ACTION,
                actionId,
                actionArgs,
                resolve,
                reject
            });
        });
    });
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=app-call-server.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/app-find-source-map-url.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "findSourceMapURL", {
    enumerable: true,
    get: function() {
        return findSourceMapURL;
    }
});
const basePath = ("TURBOPACK compile-time value", "") || '';
const pathname = "" + basePath + "/__nextjs_source-map";
const findSourceMapURL = ("TURBOPACK compile-time truthy", 1) ? function findSourceMapURL(filename) {
    if (filename === '') {
        return null;
    }
    if (filename.startsWith(document.location.origin) && filename.includes('/_next/static')) {
        // This is a request for a client chunk. This can only happen when
        // using Turbopack. In this case, since we control how those source
        // maps are generated, we can safely assume that the sourceMappingURL
        // is relative to the filename, with an added `.map` extension. The
        // browser can just request this file, and it gets served through the
        // normal dev server, without the need to route this through
        // the `/__nextjs_source-map` dev middleware.
        return "" + filename + ".map";
    }
    const url = new URL(pathname, document.location.origin);
    url.searchParams.set('filename', filename);
    return url.href;
} : "TURBOPACK unreachable";
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=app-find-source-map-url.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/flight-data-helpers.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    getFlightDataPartsFromPath: null,
    getNextFlightSegmentPath: null,
    normalizeFlightData: null,
    prepareFlightRouterStateForRequest: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    getFlightDataPartsFromPath: function() {
        return getFlightDataPartsFromPath;
    },
    getNextFlightSegmentPath: function() {
        return getNextFlightSegmentPath;
    },
    normalizeFlightData: function() {
        return normalizeFlightData;
    },
    prepareFlightRouterStateForRequest: function() {
        return prepareFlightRouterStateForRequest;
    }
});
const _segment = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/shared/lib/segment.js [app-ssr] (ecmascript)");
function getFlightDataPartsFromPath(flightDataPath) {
    // Pick the last 4 items from the `FlightDataPath` to get the [tree, seedData, viewport, isHeadPartial].
    const flightDataPathLength = 4;
    // tree, seedData, and head are *always* the last three items in the `FlightDataPath`.
    const [tree, seedData, head, isHeadPartial] = flightDataPath.slice(-flightDataPathLength);
    // The `FlightSegmentPath` is everything except the last three items. For a root render, it won't be present.
    const segmentPath = flightDataPath.slice(0, -flightDataPathLength);
    var _segmentPath_;
    return {
        // TODO: Unify these two segment path helpers. We are inconsistently pushing an empty segment ("")
        // to the start of the segment path in some places which makes it hard to use solely the segment path.
        // Look for "// TODO-APP: remove ''" in the codebase.
        pathToSegment: segmentPath.slice(0, -1),
        segmentPath,
        // if the `FlightDataPath` corresponds with the root, there'll be no segment path,
        // in which case we default to ''.
        segment: (_segmentPath_ = segmentPath[segmentPath.length - 1]) != null ? _segmentPath_ : '',
        tree,
        seedData,
        head,
        isHeadPartial,
        isRootRender: flightDataPath.length === flightDataPathLength
    };
}
function getNextFlightSegmentPath(flightSegmentPath) {
    // Since `FlightSegmentPath` is a repeated tuple of `Segment` and `ParallelRouteKey`, we slice off two items
    // to get the next segment path.
    return flightSegmentPath.slice(2);
}
function normalizeFlightData(flightData) {
    // FlightData can be a string when the server didn't respond with a proper flight response,
    // or when a redirect happens, to signal to the client that it needs to perform an MPA navigation.
    if (typeof flightData === 'string') {
        return flightData;
    }
    return flightData.map((flightDataPath)=>getFlightDataPartsFromPath(flightDataPath));
}
function prepareFlightRouterStateForRequest(flightRouterState, isHmrRefresh) {
    // HMR requests need the complete, unmodified state for proper functionality
    if (isHmrRefresh) {
        return encodeURIComponent(JSON.stringify(flightRouterState));
    }
    return encodeURIComponent(JSON.stringify(stripClientOnlyDataFromFlightRouterState(flightRouterState)));
}
/**
 * Recursively strips client-only data from FlightRouterState while preserving
 * server-needed information for proper rendering decisions.
 */ function stripClientOnlyDataFromFlightRouterState(flightRouterState) {
    const [segment, parallelRoutes, _url, refreshMarker, isRootLayout, hasLoadingBoundary] = flightRouterState;
    // __PAGE__ segments are always fetched from the server, so there's
    // no need to send them up
    const cleanedSegment = stripSearchParamsFromPageSegment(segment);
    // Recursively process parallel routes
    const cleanedParallelRoutes = {};
    for (const [key, childState] of Object.entries(parallelRoutes)){
        cleanedParallelRoutes[key] = stripClientOnlyDataFromFlightRouterState(childState);
    }
    const result = [
        cleanedSegment,
        cleanedParallelRoutes,
        null,
        shouldPreserveRefreshMarker(refreshMarker) ? refreshMarker : null
    ];
    // Append optional fields if present
    if (isRootLayout !== undefined) {
        result[4] = isRootLayout;
    }
    if (hasLoadingBoundary !== undefined) {
        result[5] = hasLoadingBoundary;
    }
    return result;
}
/**
 * Strips search parameters from __PAGE__ segments to prevent sensitive
 * client-side data from being sent to the server.
 */ function stripSearchParamsFromPageSegment(segment) {
    if (typeof segment === 'string' && segment.startsWith(_segment.PAGE_SEGMENT_KEY + '?')) {
        return _segment.PAGE_SEGMENT_KEY;
    }
    return segment;
}
/**
 * Determines whether the refresh marker should be sent to the server
 * Client-only markers like 'refresh' are stripped, while server-needed markers
 * like 'refetch' and 'inside-shared-layout' are preserved.
 */ function shouldPreserveRefreshMarker(refreshMarker) {
    return Boolean(refreshMarker && refreshMarker !== 'refresh');
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=flight-data-helpers.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/app-build-id.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

// This gets assigned as a side-effect during app initialization. Because it
// represents the build used to create the JS bundle, it should never change
// after being set, so we store it in a global variable.
//
// When performing RSC requests, if the incoming data has a different build ID,
// we perform an MPA navigation/refresh to load the updated build and ensure
// that the client and server in sync.
// Starts as an empty string. In practice, because setAppBuildId is called
// during initialization before hydration starts, this will always get
// reassigned to the actual build ID before it's ever needed by a navigation.
// If for some reasons it didn't, due to a bug or race condition, then on
// navigation the build comparision would fail and trigger an MPA navigation.
Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    getAppBuildId: null,
    setAppBuildId: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    getAppBuildId: function() {
        return getAppBuildId;
    },
    setAppBuildId: function() {
        return setAppBuildId;
    }
});
let globalBuildId = '';
function setAppBuildId(buildId) {
    globalBuildId = buildId;
}
function getAppBuildId() {
    return globalBuildId;
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=app-build-id.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/shared/lib/hash.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

// http://www.cse.yorku.ca/~oz/hash.html
// More specifically, 32-bit hash via djbxor
// (ref: https://gist.github.com/eplawless/52813b1d8ad9af510d85?permalink_comment_id=3367765#gistcomment-3367765)
// This is due to number type differences between rust for turbopack to js number types,
// where rust does not have easy way to repreesnt js's 53-bit float number type for the matching
// overflow behavior. This is more `correct` in terms of having canonical hash across different runtime / implementation
// as can gaurantee determinstic output from 32bit hash.
Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    djb2Hash: null,
    hexHash: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    djb2Hash: function() {
        return djb2Hash;
    },
    hexHash: function() {
        return hexHash;
    }
});
function djb2Hash(str) {
    let hash = 5381;
    for(let i = 0; i < str.length; i++){
        const char = str.charCodeAt(i);
        hash = (hash << 5) + hash + char & 0xffffffff;
    }
    return hash >>> 0;
}
function hexHash(str) {
    return djb2Hash(str).toString(36).slice(0, 5);
} //# sourceMappingURL=hash.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/shared/lib/router/utils/cache-busting-search-param.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "computeCacheBustingSearchParam", {
    enumerable: true,
    get: function() {
        return computeCacheBustingSearchParam;
    }
});
const _hash = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/shared/lib/hash.js [app-ssr] (ecmascript)");
function computeCacheBustingSearchParam(prefetchHeader, segmentPrefetchHeader, stateTreeHeader, nextUrlHeader) {
    if ((prefetchHeader === undefined || prefetchHeader === '0') && segmentPrefetchHeader === undefined && stateTreeHeader === undefined && nextUrlHeader === undefined) {
        return '';
    }
    return (0, _hash.hexHash)([
        prefetchHeader || '0',
        segmentPrefetchHeader || '0',
        stateTreeHeader || '0',
        nextUrlHeader || '0'
    ].join(','));
} //# sourceMappingURL=cache-busting-search-param.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/set-cache-busting-search-param.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    setCacheBustingSearchParam: null,
    setCacheBustingSearchParamWithHash: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    setCacheBustingSearchParam: function() {
        return setCacheBustingSearchParam;
    },
    setCacheBustingSearchParamWithHash: function() {
        return setCacheBustingSearchParamWithHash;
    }
});
const _cachebustingsearchparam = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/shared/lib/router/utils/cache-busting-search-param.js [app-ssr] (ecmascript)");
const _approuterheaders = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/app-router-headers.js [app-ssr] (ecmascript)");
const setCacheBustingSearchParam = (url, headers)=>{
    const uniqueCacheKey = (0, _cachebustingsearchparam.computeCacheBustingSearchParam)(headers[_approuterheaders.NEXT_ROUTER_PREFETCH_HEADER], headers[_approuterheaders.NEXT_ROUTER_SEGMENT_PREFETCH_HEADER], headers[_approuterheaders.NEXT_ROUTER_STATE_TREE_HEADER], headers[_approuterheaders.NEXT_URL]);
    setCacheBustingSearchParamWithHash(url, uniqueCacheKey);
};
const setCacheBustingSearchParamWithHash = (url, hash)=>{
    /**
   * Note that we intentionally do not use `url.searchParams.set` here:
   *
   * const url = new URL('https://example.com/search?q=custom%20spacing');
   * url.searchParams.set('_rsc', 'abc123');
   * console.log(url.toString()); // Outputs: https://example.com/search?q=custom+spacing&_rsc=abc123
   *                                                                             ^ <--- this is causing confusion
   * This is in fact intended based on https://url.spec.whatwg.org/#interface-urlsearchparams, but
   * we want to preserve the %20 as %20 if that's what the user passed in, hence the custom
   * logic below.
   */ const existingSearch = url.search;
    const rawQuery = existingSearch.startsWith('?') ? existingSearch.slice(1) : existingSearch;
    // Always remove any existing cache busting param and add a fresh one to ensure
    // we have the correct value based on current request headers
    const pairs = rawQuery.split('&').filter((pair)=>pair && !pair.startsWith("" + _approuterheaders.NEXT_RSC_UNION_QUERY + "="));
    if (hash.length > 0) {
        pairs.push(_approuterheaders.NEXT_RSC_UNION_QUERY + "=" + hash);
    } else {
        pairs.push("" + _approuterheaders.NEXT_RSC_UNION_QUERY);
    }
    url.search = pairs.length ? "?" + pairs.join('&') : '';
};
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=set-cache-busting-search-param.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/shared/lib/segment-cache/segment-value-encoding.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    ROOT_SEGMENT_CACHE_KEY: null,
    ROOT_SEGMENT_REQUEST_KEY: null,
    appendSegmentCacheKeyPart: null,
    appendSegmentRequestKeyPart: null,
    convertSegmentPathToStaticExportFilename: null,
    createSegmentCacheKeyPart: null,
    createSegmentRequestKeyPart: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    ROOT_SEGMENT_CACHE_KEY: function() {
        return ROOT_SEGMENT_CACHE_KEY;
    },
    ROOT_SEGMENT_REQUEST_KEY: function() {
        return ROOT_SEGMENT_REQUEST_KEY;
    },
    appendSegmentCacheKeyPart: function() {
        return appendSegmentCacheKeyPart;
    },
    appendSegmentRequestKeyPart: function() {
        return appendSegmentRequestKeyPart;
    },
    convertSegmentPathToStaticExportFilename: function() {
        return convertSegmentPathToStaticExportFilename;
    },
    createSegmentCacheKeyPart: function() {
        return createSegmentCacheKeyPart;
    },
    createSegmentRequestKeyPart: function() {
        return createSegmentRequestKeyPart;
    }
});
const _segment = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/shared/lib/segment.js [app-ssr] (ecmascript)");
const ROOT_SEGMENT_REQUEST_KEY = '';
const ROOT_SEGMENT_CACHE_KEY = '';
function createSegmentRequestKeyPart(segment) {
    if (typeof segment === 'string') {
        if (segment.startsWith(_segment.PAGE_SEGMENT_KEY)) {
            // The Flight Router State type sometimes includes the search params in
            // the page segment. However, the Segment Cache tracks this as a separate
            // key. So, we strip the search params here, and then add them back when
            // the cache entry is turned back into a FlightRouterState. This is an
            // unfortunate consequence of the FlightRouteState being used both as a
            // transport type and as a cache key; we'll address this once more of the
            // Segment Cache implementation has settled.
            // TODO: We should hoist the search params out of the FlightRouterState
            // type entirely, This is our plan for dynamic route params, too.
            return _segment.PAGE_SEGMENT_KEY;
        }
        const safeName = // But params typically don't include the leading slash. We should use
        // a different encoding to avoid this special case.
        segment === '/_not-found' ? '_not-found' : encodeToFilesystemAndURLSafeString(segment);
        // Since this is not a dynamic segment, it's fully encoded. It does not
        // need to be "hydrated" with a param value.
        return safeName;
    }
    const name = segment[0];
    const paramType = segment[2];
    const safeName = encodeToFilesystemAndURLSafeString(name);
    const encodedName = '$' + paramType + '$' + safeName;
    return encodedName;
}
function appendSegmentRequestKeyPart(parentRequestKey, parallelRouteKey, childRequestKeyPart) {
    // Aside from being filesystem safe, segment keys are also designed so that
    // each segment and parallel route creates its own subdirectory. Roughly in
    // the same shape as the source app directory. This is mostly just for easier
    // debugging (you can open up the build folder and navigate the output); if
    // we wanted to do we could just use a flat structure.
    // Omit the parallel route key for children, since this is the most
    // common case. Saves some bytes (and it's what the app directory does).
    const slotKey = parallelRouteKey === 'children' ? childRequestKeyPart : "@" + encodeToFilesystemAndURLSafeString(parallelRouteKey) + "/" + childRequestKeyPart;
    return parentRequestKey + '/' + slotKey;
}
function createSegmentCacheKeyPart(requestKeyPart, segment) {
    if (typeof segment === 'string') {
        return requestKeyPart;
    }
    const paramValue = segment[1];
    const safeValue = encodeToFilesystemAndURLSafeString(paramValue);
    return requestKeyPart + '$' + safeValue;
}
function appendSegmentCacheKeyPart(parentSegmentKey, parallelRouteKey, childCacheKeyPart) {
    const slotKey = parallelRouteKey === 'children' ? childCacheKeyPart : "@" + encodeToFilesystemAndURLSafeString(parallelRouteKey) + "/" + childCacheKeyPart;
    return parentSegmentKey + '/' + slotKey;
}
// Define a regex pattern to match the most common characters found in a route
// param. It excludes anything that might not be cross-platform filesystem
// compatible, like |. It does not need to be precise because the fallback is to
// just base64url-encode the whole parameter, which is fine; we just don't do it
// by default for compactness, and for easier debugging.
const simpleParamValueRegex = /^[a-zA-Z0-9\-_@]+$/;
function encodeToFilesystemAndURLSafeString(value) {
    if (simpleParamValueRegex.test(value)) {
        return value;
    }
    // If there are any unsafe characters, base64url-encode the entire value.
    // We also add a ! prefix so it doesn't collide with the simple case.
    const base64url = btoa(value).replace(/\+/g, '-') // Replace '+' with '-'
    .replace(/\//g, '_') // Replace '/' with '_'
    .replace(/=+$/, '') // Remove trailing '='
    ;
    return '!' + base64url;
}
function convertSegmentPathToStaticExportFilename(segmentPath) {
    return "__next" + segmentPath.replace(/\//g, '.') + ".txt";
} //# sourceMappingURL=segment-value-encoding.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/route-params.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    doesStaticSegmentAppearInURL: null,
    getCacheKeyForDynamicParam: null,
    getParamValueFromCacheKey: null,
    getRenderedPathname: null,
    getRenderedSearch: null,
    parseDynamicParamFromURLPart: null,
    urlToUrlWithoutFlightMarker: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    doesStaticSegmentAppearInURL: function() {
        return doesStaticSegmentAppearInURL;
    },
    getCacheKeyForDynamicParam: function() {
        return getCacheKeyForDynamicParam;
    },
    getParamValueFromCacheKey: function() {
        return getParamValueFromCacheKey;
    },
    getRenderedPathname: function() {
        return getRenderedPathname;
    },
    getRenderedSearch: function() {
        return getRenderedSearch;
    },
    parseDynamicParamFromURLPart: function() {
        return parseDynamicParamFromURLPart;
    },
    urlToUrlWithoutFlightMarker: function() {
        return urlToUrlWithoutFlightMarker;
    }
});
const _segment = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/shared/lib/segment.js [app-ssr] (ecmascript)");
const _segmentvalueencoding = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/shared/lib/segment-cache/segment-value-encoding.js [app-ssr] (ecmascript)");
const _approuterheaders = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/app-router-headers.js [app-ssr] (ecmascript)");
function getRenderedSearch(response) {
    // If the server performed a rewrite, the search params used to render the
    // page will be different from the params in the request URL. In this case,
    // the response will include a header that gives the rewritten search query.
    const rewrittenQuery = response.headers.get(_approuterheaders.NEXT_REWRITTEN_QUERY_HEADER);
    if (rewrittenQuery !== null) {
        return rewrittenQuery === '' ? '' : '?' + rewrittenQuery;
    }
    // If the header is not present, there was no rewrite, so we use the search
    // query of the response URL.
    return urlToUrlWithoutFlightMarker(new URL(response.url)).search;
}
function getRenderedPathname(response) {
    // If the server performed a rewrite, the pathname used to render the
    // page will be different from the pathname in the request URL. In this case,
    // the response will include a header that gives the rewritten pathname.
    const rewrittenPath = response.headers.get(_approuterheaders.NEXT_REWRITTEN_PATH_HEADER);
    return rewrittenPath != null ? rewrittenPath : urlToUrlWithoutFlightMarker(new URL(response.url)).pathname;
}
function parseDynamicParamFromURLPart(paramType, pathnameParts, partIndex) {
    // This needs to match the behavior in get-dynamic-param.ts.
    switch(paramType){
        // Catchalls
        case 'c':
        case 'ci':
            {
                // Catchalls receive all the remaining URL parts. If there are no
                // remaining pathname parts, return an empty array.
                return partIndex < pathnameParts.length ? pathnameParts.slice(partIndex).map((s)=>encodeURIComponent(s)) : [];
            }
        // Optional catchalls
        case 'oc':
            {
                // Optional catchalls receive all the remaining URL parts, unless this is
                // the end of the pathname, in which case they return null.
                return partIndex < pathnameParts.length ? pathnameParts.slice(partIndex).map((s)=>encodeURIComponent(s)) : null;
            }
        // Dynamic
        case 'd':
        case 'di':
            {
                if (partIndex >= pathnameParts.length) {
                    // The route tree expected there to be more parts in the URL than there
                    // actually are. This could happen if the x-nextjs-rewritten-path header
                    // is incorrectly set, or potentially due to bug in Next.js. TODO:
                    // Should this be a hard error? During a prefetch, we can just abort.
                    // During a client navigation, we could trigger a hard refresh. But if
                    // it happens during initial render, we don't really have any
                    // recovery options.
                    return '';
                }
                return encodeURIComponent(pathnameParts[partIndex]);
            }
        default:
            paramType;
            return '';
    }
}
function doesStaticSegmentAppearInURL(segment) {
    // This is not a parameterized segment; however, we need to determine
    // whether or not this segment appears in the URL. For example, this route
    // groups do not appear in the URL, so they should be skipped. Any other
    // special cases must be handled here.
    // TODO: Consider encoding this directly into the router tree instead of
    // inferring it on the client based on the segment type. Something like
    // a `doesAppearInURL` flag in FlightRouterState.
    if (segment === _segmentvalueencoding.ROOT_SEGMENT_REQUEST_KEY || // For some reason, the loader tree sometimes includes extra __PAGE__
    // "layouts" when part of a parallel route. But it's not a leaf node.
    // Otherwise, we wouldn't need this special case because pages are
    // always leaf nodes.
    // TODO: Investigate why the loader produces these fake page segments.
    segment.startsWith(_segment.PAGE_SEGMENT_KEY) || // Route groups.
    segment[0] === '(' && segment.endsWith(')') || segment === _segment.DEFAULT_SEGMENT_KEY || segment === '/_not-found') {
        return false;
    } else {
        // All other segment types appear in the URL
        return true;
    }
}
function getCacheKeyForDynamicParam(paramValue, renderedSearch) {
    // This needs to match the logic in get-dynamic-param.ts, until we're able to
    // unify the various implementations so that these are always computed on
    // the client.
    if (typeof paramValue === 'string') {
        // TODO: Refactor or remove this helper function to accept a string rather
        // than the whole segment type. Also we can probably just append the
        // search string instead of turning it into JSON.
        const pageSegmentWithSearchParams = (0, _segment.addSearchParamsIfPageSegment)(paramValue, Object.fromEntries(new URLSearchParams(renderedSearch)));
        return pageSegmentWithSearchParams;
    } else if (paramValue === null) {
        return '';
    } else {
        return paramValue.join('/');
    }
}
function urlToUrlWithoutFlightMarker(url) {
    const urlWithoutFlightParameters = new URL(url);
    urlWithoutFlightParameters.searchParams.delete(_approuterheaders.NEXT_RSC_UNION_QUERY);
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    return urlWithoutFlightParameters;
}
function getParamValueFromCacheKey(paramCacheKey, paramType) {
    // Turn the cache key string sent by the server (as part of FlightRouterState)
    // into a value that can be passed to `useParams` and client components.
    const isCatchAll = paramType === 'c' || paramType === 'oc';
    if (isCatchAll) {
        // Catch-all param keys are a concatenation of the path segments.
        // See equivalent logic in `getSelectedParams`.
        // TODO: We should just pass the array directly, rather than concatenate
        // it to a string and then split it back to an array. It needs to be an
        // array in some places, like when passing a key React, but we can convert
        // it at runtime in those places.
        return paramCacheKey.split('/');
    }
    return paramCacheKey;
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=route-params.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/fetch-server-response.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    createFetch: null,
    createFromNextReadableStream: null,
    fetchServerResponse: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    createFetch: function() {
        return createFetch;
    },
    createFromNextReadableStream: function() {
        return createFromNextReadableStream;
    },
    fetchServerResponse: function() {
        return fetchServerResponse;
    }
});
const _client = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-server-dom-turbopack-client.js [app-ssr] (ecmascript)");
const _approuterheaders = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/app-router-headers.js [app-ssr] (ecmascript)");
const _appcallserver = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/app-call-server.js [app-ssr] (ecmascript)");
const _appfindsourcemapurl = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/app-find-source-map-url.js [app-ssr] (ecmascript)");
const _routerreducertypes = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/router-reducer-types.js [app-ssr] (ecmascript)");
const _flightdatahelpers = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/flight-data-helpers.js [app-ssr] (ecmascript)");
const _appbuildid = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/app-build-id.js [app-ssr] (ecmascript)");
const _setcachebustingsearchparam = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/set-cache-busting-search-param.js [app-ssr] (ecmascript)");
const _routeparams = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/route-params.js [app-ssr] (ecmascript)");
const createFromReadableStream = _client.createFromReadableStream;
function doMpaNavigation(url) {
    return {
        flightData: (0, _routeparams.urlToUrlWithoutFlightMarker)(new URL(url, location.origin)).toString(),
        canonicalUrl: undefined,
        couldBeIntercepted: false,
        prerendered: false,
        postponed: false,
        staleTime: -1
    };
}
let abortController = new AbortController();
if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
;
async function fetchServerResponse(url, options) {
    const { flightRouterState, nextUrl, prefetchKind } = options;
    const headers = {
        // Enable flight response
        [_approuterheaders.RSC_HEADER]: '1',
        // Provide the current router state
        [_approuterheaders.NEXT_ROUTER_STATE_TREE_HEADER]: (0, _flightdatahelpers.prepareFlightRouterStateForRequest)(flightRouterState, options.isHmrRefresh)
    };
    /**
   * Three cases:
   * - `prefetchKind` is `undefined`, it means it's a normal navigation, so we want to prefetch the page data fully
   * - `prefetchKind` is `full` - we want to prefetch the whole page so same as above
   * - `prefetchKind` is `auto` - if the page is dynamic, prefetch the page data partially, if static prefetch the page data fully
   */ if (prefetchKind === _routerreducertypes.PrefetchKind.AUTO) {
        headers[_approuterheaders.NEXT_ROUTER_PREFETCH_HEADER] = '1';
    }
    if (("TURBOPACK compile-time value", "development") === 'development' && options.isHmrRefresh) {
        headers[_approuterheaders.NEXT_HMR_REFRESH_HEADER] = '1';
    }
    if (nextUrl) {
        headers[_approuterheaders.NEXT_URL] = nextUrl;
    }
    try {
        var _res_headers_get;
        // When creating a "temporary" prefetch (the "on-demand" prefetch that gets created on navigation, if one doesn't exist)
        // we send the request with a "high" priority as it's in response to a user interaction that could be blocking a transition.
        // Otherwise, all other prefetches are sent with a "low" priority.
        // We use "auto" for in all other cases to match the existing default, as this function is shared outside of prefetching.
        const fetchPriority = prefetchKind ? prefetchKind === _routerreducertypes.PrefetchKind.TEMPORARY ? 'high' : 'low' : 'auto';
        if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
        ;
        const res = await createFetch(url, headers, fetchPriority, abortController.signal);
        const responseUrl = (0, _routeparams.urlToUrlWithoutFlightMarker)(new URL(res.url));
        const canonicalUrl = res.redirected ? responseUrl : undefined;
        const contentType = res.headers.get('content-type') || '';
        const interception = !!((_res_headers_get = res.headers.get('vary')) == null ? void 0 : _res_headers_get.includes(_approuterheaders.NEXT_URL));
        const postponed = !!res.headers.get(_approuterheaders.NEXT_DID_POSTPONE_HEADER);
        const staleTimeHeaderSeconds = res.headers.get(_approuterheaders.NEXT_ROUTER_STALE_TIME_HEADER);
        const staleTime = staleTimeHeaderSeconds !== null ? parseInt(staleTimeHeaderSeconds, 10) * 1000 : -1;
        let isFlightResponse = contentType.startsWith(_approuterheaders.RSC_CONTENT_TYPE_HEADER);
        if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
        ;
        // If fetch returns something different than flight response handle it like a mpa navigation
        // If the fetch was not 200, we also handle it like a mpa navigation
        if (!isFlightResponse || !res.ok || !res.body) {
            // in case the original URL came with a hash, preserve it before redirecting to the new URL
            if (url.hash) {
                responseUrl.hash = url.hash;
            }
            return doMpaNavigation(responseUrl.toString());
        }
        // We may navigate to a page that requires a different Webpack runtime.
        // In prod, every page will have the same Webpack runtime.
        // In dev, the Webpack runtime is minimal for each page.
        // We need to ensure the Webpack runtime is updated before executing client-side JS of the new page.
        if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
        ;
        // Handle the `fetch` readable stream that can be unwrapped by `React.use`.
        const flightStream = postponed ? createUnclosingPrefetchStream(res.body) : res.body;
        const response = await createFromNextReadableStream(flightStream);
        if ((0, _appbuildid.getAppBuildId)() !== response.b) {
            return doMpaNavigation(res.url);
        }
        return {
            flightData: (0, _flightdatahelpers.normalizeFlightData)(response.f),
            canonicalUrl: canonicalUrl,
            couldBeIntercepted: interception,
            prerendered: response.S,
            postponed,
            staleTime
        };
    } catch (err) {
        if (!abortController.signal.aborted) {
            console.error("Failed to fetch RSC payload for " + url + ". Falling back to browser navigation.", err);
        }
        // If fetch fails handle it like a mpa navigation
        // TODO-APP: Add a test for the case where a CORS request fails, e.g. external url redirect coming from the response.
        // See https://github.com/vercel/next.js/issues/43605#issuecomment-1451617521 for a reproduction.
        return {
            flightData: url.toString(),
            canonicalUrl: undefined,
            couldBeIntercepted: false,
            prerendered: false,
            postponed: false,
            staleTime: -1
        };
    }
}
async function createFetch(url, headers, fetchPriority, signal) {
    // TODO: In output: "export" mode, the headers do nothing. Omit them (and the
    // cache busting search param) from the request so they're
    // maximally cacheable.
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    const fetchOptions = {
        // Backwards compat for older browsers. `same-origin` is the default in modern browsers.
        credentials: 'same-origin',
        headers,
        priority: fetchPriority || undefined,
        signal
    };
    // `fetchUrl` is slightly different from `url` because we add a cache-busting
    // search param to it. This should not leak outside of this function, so we
    // track them separately.
    let fetchUrl = new URL(url);
    (0, _setcachebustingsearchparam.setCacheBustingSearchParam)(fetchUrl, headers);
    let browserResponse = await fetch(fetchUrl, fetchOptions);
    // If the server responds with a redirect (e.g. 307), and the redirected
    // location does not contain the cache busting search param set in the
    // original request, the response is likely invalid — when following the
    // redirect, the browser forwards the request headers, but since the cache
    // busting search param is missing, the server will reject the request due to
    // a mismatch.
    //
    // Ideally, we would be able to intercept the redirect response and perform it
    // manually, instead of letting the browser automatically follow it, but this
    // is not allowed by the fetch API.
    //
    // So instead, we must "replay" the redirect by fetching the new location
    // again, but this time we'll append the cache busting search param to prevent
    // a mismatch.
    //
    // TODO: We can optimize Next.js's built-in middleware APIs by returning a
    // custom status code, to prevent the browser from automatically following it.
    //
    // This does not affect Server Action-based redirects; those are encoded
    // differently, as part of the Flight body. It only affects redirects that
    // occur in a middleware or a third-party proxy.
    let redirected = browserResponse.redirected;
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    // Remove the cache busting search param from the response URL, to prevent it
    // from leaking outside of this function.
    const responseUrl = new URL(browserResponse.url, fetchUrl);
    responseUrl.searchParams.delete(_approuterheaders.NEXT_RSC_UNION_QUERY);
    const rscResponse = {
        url: responseUrl.href,
        // This is true if any redirects occurred, either automatically by the
        // browser, or manually by us. So it's different from
        // `browserResponse.redirected`, which only tells us whether the browser
        // followed a redirect, and only for the last response in the chain.
        redirected,
        // These can be copied from the last browser response we received. We
        // intentionally only expose the subset of fields that are actually used
        // elsewhere in the codebase.
        ok: browserResponse.ok,
        headers: browserResponse.headers,
        body: browserResponse.body,
        status: browserResponse.status
    };
    return rscResponse;
}
function createFromNextReadableStream(flightStream) {
    return createFromReadableStream(flightStream, {
        callServer: _appcallserver.callServer,
        findSourceMapURL: _appfindsourcemapurl.findSourceMapURL
    });
}
function createUnclosingPrefetchStream(originalFlightStream) {
    // When PPR is enabled, prefetch streams may contain references that never
    // resolve, because that's how we encode dynamic data access. In the decoded
    // object returned by the Flight client, these are reified into hanging
    // promises that suspend during render, which is effectively what we want.
    // The UI resolves when it switches to the dynamic data stream
    // (via useDeferredValue(dynamic, static)).
    //
    // However, the Flight implementation currently errors if the server closes
    // the response before all the references are resolved. As a cheat to work
    // around this, we wrap the original stream in a new stream that never closes,
    // and therefore doesn't error.
    const reader = originalFlightStream.getReader();
    return new ReadableStream({
        async pull (controller) {
            while(true){
                const { done, value } = await reader.read();
                if (!done) {
                    // Pass to the target stream and keep consuming the Flight response
                    // from the server.
                    controller.enqueue(value);
                    continue;
                }
                // The server stream has closed. Exit, but intentionally do not close
                // the target stream.
                return;
            }
        }
    });
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=fetch-server-response.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/create-href-from-url.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "createHrefFromUrl", {
    enumerable: true,
    get: function() {
        return createHrefFromUrl;
    }
});
function createHrefFromUrl(url, includeHash) {
    if (includeHash === void 0) includeHash = true;
    return url.pathname + url.search + (includeHash ? url.hash : '');
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=create-href-from-url.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/create-router-cache-key.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "createRouterCacheKey", {
    enumerable: true,
    get: function() {
        return createRouterCacheKey;
    }
});
const _segment = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/shared/lib/segment.js [app-ssr] (ecmascript)");
function createRouterCacheKey(segment, withoutSearchParameters) {
    if (withoutSearchParameters === void 0) withoutSearchParameters = false;
    // if the segment is an array, it means it's a dynamic segment
    // for example, ['lang', 'en', 'd']. We need to convert it to a string to store it as a cache node key.
    if (Array.isArray(segment)) {
        return segment[0] + "|" + segment[1] + "|" + segment[2];
    }
    // Page segments might have search parameters, ie __PAGE__?foo=bar
    // When `withoutSearchParameters` is true, we only want to return the page segment
    if (withoutSearchParameters && segment.startsWith(_segment.PAGE_SEGMENT_KEY)) {
        return _segment.PAGE_SEGMENT_KEY;
    }
    return segment;
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=create-router-cache-key.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/invalidate-cache-below-flight-segmentpath.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "invalidateCacheBelowFlightSegmentPath", {
    enumerable: true,
    get: function() {
        return invalidateCacheBelowFlightSegmentPath;
    }
});
const _createroutercachekey = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/create-router-cache-key.js [app-ssr] (ecmascript)");
const _flightdatahelpers = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/flight-data-helpers.js [app-ssr] (ecmascript)");
function invalidateCacheBelowFlightSegmentPath(newCache, existingCache, flightSegmentPath) {
    const isLastEntry = flightSegmentPath.length <= 2;
    const [parallelRouteKey, segment] = flightSegmentPath;
    const cacheKey = (0, _createroutercachekey.createRouterCacheKey)(segment);
    const existingChildSegmentMap = existingCache.parallelRoutes.get(parallelRouteKey);
    if (!existingChildSegmentMap) {
        // Bailout because the existing cache does not have the path to the leaf node
        // Will trigger lazy fetch in layout-router because of missing segment
        return;
    }
    let childSegmentMap = newCache.parallelRoutes.get(parallelRouteKey);
    if (!childSegmentMap || childSegmentMap === existingChildSegmentMap) {
        childSegmentMap = new Map(existingChildSegmentMap);
        newCache.parallelRoutes.set(parallelRouteKey, childSegmentMap);
    }
    // In case of last entry don't copy further down.
    if (isLastEntry) {
        childSegmentMap.delete(cacheKey);
        return;
    }
    const existingChildCacheNode = existingChildSegmentMap.get(cacheKey);
    let childCacheNode = childSegmentMap.get(cacheKey);
    if (!childCacheNode || !existingChildCacheNode) {
        // Bailout because the existing cache does not have the path to the leaf node
        // Will trigger lazy fetch in layout-router because of missing segment
        return;
    }
    if (childCacheNode === existingChildCacheNode) {
        childCacheNode = {
            lazyData: childCacheNode.lazyData,
            rsc: childCacheNode.rsc,
            prefetchRsc: childCacheNode.prefetchRsc,
            head: childCacheNode.head,
            prefetchHead: childCacheNode.prefetchHead,
            parallelRoutes: new Map(childCacheNode.parallelRoutes)
        };
        childSegmentMap.set(cacheKey, childCacheNode);
    }
    invalidateCacheBelowFlightSegmentPath(childCacheNode, existingChildCacheNode, (0, _flightdatahelpers.getNextFlightSegmentPath)(flightSegmentPath));
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=invalidate-cache-below-flight-segmentpath.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/components/match-segments.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "matchSegment", {
    enumerable: true,
    get: function() {
        return matchSegment;
    }
});
const matchSegment = (existingSegment, segment)=>{
    // segment is either Array or string
    if (typeof existingSegment === 'string') {
        if (typeof segment === 'string') {
            // Common case: segment is just a string
            return existingSegment === segment;
        }
        return false;
    }
    if (typeof segment === 'string') {
        return false;
    }
    return existingSegment[0] === segment[0] && existingSegment[1] === segment[1];
};
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=match-segments.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/fill-lazy-items-till-leaf-with-head.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "fillLazyItemsTillLeafWithHead", {
    enumerable: true,
    get: function() {
        return fillLazyItemsTillLeafWithHead;
    }
});
const _createroutercachekey = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/create-router-cache-key.js [app-ssr] (ecmascript)");
const _routerreducertypes = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/router-reducer-types.js [app-ssr] (ecmascript)");
function fillLazyItemsTillLeafWithHead(navigatedAt, newCache, existingCache, routerState, cacheNodeSeedData, head, prefetchEntry) {
    const isLastSegment = Object.keys(routerState[1]).length === 0;
    if (isLastSegment) {
        newCache.head = head;
        return;
    }
    // Remove segment that we got data for so that it is filled in during rendering of rsc.
    for(const key in routerState[1]){
        const parallelRouteState = routerState[1][key];
        const segmentForParallelRoute = parallelRouteState[0];
        const cacheKey = (0, _createroutercachekey.createRouterCacheKey)(segmentForParallelRoute);
        // TODO: We should traverse the cacheNodeSeedData tree instead of the router
        // state tree. Ideally, they would always be the same shape, but because of
        // the loading.js pattern, cacheNodeSeedData sometimes only represents a
        // partial tree. That's why this node is sometimes null. Once PPR lands,
        // loading.js will no longer have special behavior and we can traverse the
        // data tree instead.
        //
        // We should also consider merging the router state tree and the data tree
        // in the response format, so that we don't have to send the keys twice.
        // Then the client can convert them into separate representations.
        const parallelSeedData = cacheNodeSeedData !== null && cacheNodeSeedData[2][key] !== undefined ? cacheNodeSeedData[2][key] : null;
        if (existingCache) {
            const existingParallelRoutesCacheNode = existingCache.parallelRoutes.get(key);
            if (existingParallelRoutesCacheNode) {
                const hasReusablePrefetch = (prefetchEntry == null ? void 0 : prefetchEntry.kind) === 'auto' && prefetchEntry.status === _routerreducertypes.PrefetchCacheEntryStatus.reusable;
                let parallelRouteCacheNode = new Map(existingParallelRoutesCacheNode);
                const existingCacheNode = parallelRouteCacheNode.get(cacheKey);
                let newCacheNode;
                if (parallelSeedData !== null) {
                    // New data was sent from the server.
                    const seedNode = parallelSeedData[1];
                    const loading = parallelSeedData[3];
                    newCacheNode = {
                        lazyData: null,
                        rsc: seedNode,
                        // This is a PPR-only field. When PPR is enabled, we shouldn't hit
                        // this path during a navigation, but until PPR is fully implemented
                        // yet it's possible the existing node does have a non-null
                        // `prefetchRsc`. As an incremental step, we'll just de-opt to the
                        // old behavior — no PPR value.
                        prefetchRsc: null,
                        head: null,
                        prefetchHead: null,
                        loading,
                        parallelRoutes: new Map(existingCacheNode == null ? void 0 : existingCacheNode.parallelRoutes),
                        navigatedAt
                    };
                } else if (hasReusablePrefetch && existingCacheNode) {
                    // No new data was sent from the server, but the existing cache node
                    // was prefetched, so we should reuse that.
                    newCacheNode = {
                        lazyData: existingCacheNode.lazyData,
                        rsc: existingCacheNode.rsc,
                        // This is a PPR-only field. Unlike the previous branch, since we're
                        // just cloning the existing cache node, we might as well keep the
                        // PPR value, if it exists.
                        prefetchRsc: existingCacheNode.prefetchRsc,
                        head: existingCacheNode.head,
                        prefetchHead: existingCacheNode.prefetchHead,
                        parallelRoutes: new Map(existingCacheNode.parallelRoutes),
                        loading: existingCacheNode.loading
                    };
                } else {
                    // No data available for this node. This will trigger a lazy fetch
                    // during render.
                    newCacheNode = {
                        lazyData: null,
                        rsc: null,
                        prefetchRsc: null,
                        head: null,
                        prefetchHead: null,
                        parallelRoutes: new Map(existingCacheNode == null ? void 0 : existingCacheNode.parallelRoutes),
                        loading: null,
                        navigatedAt
                    };
                }
                // Overrides the cache key with the new cache node.
                parallelRouteCacheNode.set(cacheKey, newCacheNode);
                // Traverse deeper to apply the head / fill lazy items till the head.
                fillLazyItemsTillLeafWithHead(navigatedAt, newCacheNode, existingCacheNode, parallelRouteState, parallelSeedData ? parallelSeedData : null, head, prefetchEntry);
                newCache.parallelRoutes.set(key, parallelRouteCacheNode);
                continue;
            }
        }
        let newCacheNode;
        if (parallelSeedData !== null) {
            // New data was sent from the server.
            const seedNode = parallelSeedData[1];
            const loading = parallelSeedData[3];
            newCacheNode = {
                lazyData: null,
                rsc: seedNode,
                prefetchRsc: null,
                head: null,
                prefetchHead: null,
                parallelRoutes: new Map(),
                loading,
                navigatedAt
            };
        } else {
            // No data available for this node. This will trigger a lazy fetch
            // during render.
            newCacheNode = {
                lazyData: null,
                rsc: null,
                prefetchRsc: null,
                head: null,
                prefetchHead: null,
                parallelRoutes: new Map(),
                loading: null,
                navigatedAt
            };
        }
        const existingParallelRoutes = newCache.parallelRoutes.get(key);
        if (existingParallelRoutes) {
            existingParallelRoutes.set(cacheKey, newCacheNode);
        } else {
            newCache.parallelRoutes.set(key, new Map([
                [
                    cacheKey,
                    newCacheNode
                ]
            ]));
        }
        fillLazyItemsTillLeafWithHead(navigatedAt, newCacheNode, undefined, parallelRouteState, parallelSeedData, head, prefetchEntry);
    }
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=fill-lazy-items-till-leaf-with-head.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/invalidate-cache-by-router-state.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "invalidateCacheByRouterState", {
    enumerable: true,
    get: function() {
        return invalidateCacheByRouterState;
    }
});
const _createroutercachekey = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/create-router-cache-key.js [app-ssr] (ecmascript)");
function invalidateCacheByRouterState(newCache, existingCache, routerState) {
    // Remove segment that we got data for so that it is filled in during rendering of rsc.
    for(const key in routerState[1]){
        const segmentForParallelRoute = routerState[1][key][0];
        const cacheKey = (0, _createroutercachekey.createRouterCacheKey)(segmentForParallelRoute);
        const existingParallelRoutesCacheNode = existingCache.parallelRoutes.get(key);
        if (existingParallelRoutesCacheNode) {
            let parallelRouteCacheNode = new Map(existingParallelRoutesCacheNode);
            parallelRouteCacheNode.delete(cacheKey);
            newCache.parallelRoutes.set(key, parallelRouteCacheNode);
        }
    }
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=invalidate-cache-by-router-state.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/fill-cache-with-new-subtree-data.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    fillCacheWithNewSubTreeData: null,
    fillCacheWithNewSubTreeDataButOnlyLoading: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    fillCacheWithNewSubTreeData: function() {
        return fillCacheWithNewSubTreeData;
    },
    fillCacheWithNewSubTreeDataButOnlyLoading: function() {
        return fillCacheWithNewSubTreeDataButOnlyLoading;
    }
});
const _invalidatecachebyrouterstate = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/invalidate-cache-by-router-state.js [app-ssr] (ecmascript)");
const _filllazyitemstillleafwithhead = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/fill-lazy-items-till-leaf-with-head.js [app-ssr] (ecmascript)");
const _createroutercachekey = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/create-router-cache-key.js [app-ssr] (ecmascript)");
const _segment = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/shared/lib/segment.js [app-ssr] (ecmascript)");
/**
 * Common logic for filling cache with new sub tree data.
 */ function fillCacheHelper(navigatedAt, newCache, existingCache, flightData, prefetchEntry, fillLazyItems) {
    const { segmentPath, seedData: cacheNodeSeedData, tree: treePatch, head } = flightData;
    let newCacheNode = newCache;
    let existingCacheNode = existingCache;
    for(let i = 0; i < segmentPath.length; i += 2){
        const parallelRouteKey = segmentPath[i];
        const segment = segmentPath[i + 1];
        // segmentPath is a repeating tuple of parallelRouteKey and segment
        // we know we've hit the last entry we've reached our final pair
        const isLastEntry = i === segmentPath.length - 2;
        const cacheKey = (0, _createroutercachekey.createRouterCacheKey)(segment);
        const existingChildSegmentMap = existingCacheNode.parallelRoutes.get(parallelRouteKey);
        if (!existingChildSegmentMap) {
            continue;
        }
        let childSegmentMap = newCacheNode.parallelRoutes.get(parallelRouteKey);
        if (!childSegmentMap || childSegmentMap === existingChildSegmentMap) {
            childSegmentMap = new Map(existingChildSegmentMap);
            newCacheNode.parallelRoutes.set(parallelRouteKey, childSegmentMap);
        }
        const existingChildCacheNode = existingChildSegmentMap.get(cacheKey);
        let childCacheNode = childSegmentMap.get(cacheKey);
        if (isLastEntry) {
            if (cacheNodeSeedData && (!childCacheNode || !childCacheNode.lazyData || childCacheNode === existingChildCacheNode)) {
                const incomingSegment = cacheNodeSeedData[0];
                const rsc = cacheNodeSeedData[1];
                const loading = cacheNodeSeedData[3];
                childCacheNode = {
                    lazyData: null,
                    // When `fillLazyItems` is false, we only want to fill the RSC data for the layout,
                    // not the page segment.
                    rsc: fillLazyItems || incomingSegment !== _segment.PAGE_SEGMENT_KEY ? rsc : null,
                    prefetchRsc: null,
                    head: null,
                    prefetchHead: null,
                    loading,
                    parallelRoutes: fillLazyItems && existingChildCacheNode ? new Map(existingChildCacheNode.parallelRoutes) : new Map(),
                    navigatedAt
                };
                if (existingChildCacheNode && fillLazyItems) {
                    (0, _invalidatecachebyrouterstate.invalidateCacheByRouterState)(childCacheNode, existingChildCacheNode, treePatch);
                }
                if (fillLazyItems) {
                    (0, _filllazyitemstillleafwithhead.fillLazyItemsTillLeafWithHead)(navigatedAt, childCacheNode, existingChildCacheNode, treePatch, cacheNodeSeedData, head, prefetchEntry);
                }
                childSegmentMap.set(cacheKey, childCacheNode);
            }
            continue;
        }
        if (!childCacheNode || !existingChildCacheNode) {
            continue;
        }
        if (childCacheNode === existingChildCacheNode) {
            childCacheNode = {
                lazyData: childCacheNode.lazyData,
                rsc: childCacheNode.rsc,
                prefetchRsc: childCacheNode.prefetchRsc,
                head: childCacheNode.head,
                prefetchHead: childCacheNode.prefetchHead,
                parallelRoutes: new Map(childCacheNode.parallelRoutes),
                loading: childCacheNode.loading
            };
            childSegmentMap.set(cacheKey, childCacheNode);
        }
        // Move deeper into the cache nodes
        newCacheNode = childCacheNode;
        existingCacheNode = existingChildCacheNode;
    }
}
function fillCacheWithNewSubTreeData(navigatedAt, newCache, existingCache, flightData, prefetchEntry) {
    fillCacheHelper(navigatedAt, newCache, existingCache, flightData, prefetchEntry, true);
}
function fillCacheWithNewSubTreeDataButOnlyLoading(navigatedAt, newCache, existingCache, flightData, prefetchEntry) {
    fillCacheHelper(navigatedAt, newCache, existingCache, flightData, prefetchEntry, false);
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=fill-cache-with-new-subtree-data.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/apply-flight-data.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "applyFlightData", {
    enumerable: true,
    get: function() {
        return applyFlightData;
    }
});
const _filllazyitemstillleafwithhead = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/fill-lazy-items-till-leaf-with-head.js [app-ssr] (ecmascript)");
const _fillcachewithnewsubtreedata = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/fill-cache-with-new-subtree-data.js [app-ssr] (ecmascript)");
function applyFlightData(navigatedAt, existingCache, cache, flightData, prefetchEntry) {
    // The one before last item is the router state tree patch
    const { tree: treePatch, seedData, head, isRootRender } = flightData;
    // Handles case where prefetch only returns the router tree patch without rendered components.
    if (seedData === null) {
        return false;
    }
    if (isRootRender) {
        const rsc = seedData[1];
        const loading = seedData[3];
        cache.loading = loading;
        cache.rsc = rsc;
        // This is a PPR-only field. When PPR is enabled, we shouldn't hit
        // this path during a navigation, but until PPR is fully implemented
        // yet it's possible the existing node does have a non-null
        // `prefetchRsc`. As an incremental step, we'll just de-opt to the
        // old behavior — no PPR value.
        cache.prefetchRsc = null;
        (0, _filllazyitemstillleafwithhead.fillLazyItemsTillLeafWithHead)(navigatedAt, cache, existingCache, treePatch, seedData, head, prefetchEntry);
    } else {
        // Copy rsc for the root node of the cache.
        cache.rsc = existingCache.rsc;
        // This is a PPR-only field. Unlike the previous branch, since we're
        // just cloning the existing cache node, we might as well keep the
        // PPR value, if it exists.
        cache.prefetchRsc = existingCache.prefetchRsc;
        cache.parallelRoutes = new Map(existingCache.parallelRoutes);
        cache.loading = existingCache.loading;
        // Create a copy of the existing cache with the rsc applied.
        (0, _fillcachewithnewsubtreedata.fillCacheWithNewSubTreeData)(navigatedAt, cache, existingCache, flightData, prefetchEntry);
    }
    return true;
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=apply-flight-data.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/refetch-inactive-parallel-segments.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    addRefreshMarkerToActiveParallelSegments: null,
    refreshInactiveParallelSegments: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    addRefreshMarkerToActiveParallelSegments: function() {
        return addRefreshMarkerToActiveParallelSegments;
    },
    refreshInactiveParallelSegments: function() {
        return refreshInactiveParallelSegments;
    }
});
const _applyflightdata = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/apply-flight-data.js [app-ssr] (ecmascript)");
const _fetchserverresponse = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/fetch-server-response.js [app-ssr] (ecmascript)");
const _segment = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/shared/lib/segment.js [app-ssr] (ecmascript)");
async function refreshInactiveParallelSegments(options) {
    const fetchedSegments = new Set();
    await refreshInactiveParallelSegmentsImpl({
        ...options,
        rootTree: options.updatedTree,
        fetchedSegments
    });
}
async function refreshInactiveParallelSegmentsImpl(param) {
    let { navigatedAt, state, updatedTree, updatedCache, includeNextUrl, fetchedSegments, rootTree = updatedTree, canonicalUrl } = param;
    const [, parallelRoutes, refetchPath, refetchMarker] = updatedTree;
    const fetchPromises = [];
    if (refetchPath && refetchPath !== canonicalUrl && refetchMarker === 'refresh' && // it's possible for the tree to contain multiple segments that contain data at the same URL
    // we keep track of them so we can dedupe the requests
    !fetchedSegments.has(refetchPath)) {
        fetchedSegments.add(refetchPath) // Mark this URL as fetched
        ;
        // Eagerly kick off the fetch for the refetch path & the parallel routes. This should be fine to do as they each operate
        // independently on their own cache nodes, and `applyFlightData` will copy anything it doesn't care about from the existing cache.
        const fetchPromise = (0, _fetchserverresponse.fetchServerResponse)(new URL(refetchPath, location.origin), {
            // refetch from the root of the updated tree, otherwise it will be scoped to the current segment
            // and might not contain the data we need to patch in interception route data (such as dynamic params from a previous segment)
            flightRouterState: [
                rootTree[0],
                rootTree[1],
                rootTree[2],
                'refetch'
            ],
            nextUrl: includeNextUrl ? state.nextUrl : null
        }).then((param)=>{
            let { flightData } = param;
            if (typeof flightData !== 'string') {
                for (const flightDataPath of flightData){
                    // we only pass the new cache as this function is called after clearing the router cache
                    // and filling in the new page data from the server. Meaning the existing cache is actually the cache that's
                    // just been created & has been written to, but hasn't been "committed" yet.
                    (0, _applyflightdata.applyFlightData)(navigatedAt, updatedCache, updatedCache, flightDataPath);
                }
            } else {
            // When flightData is a string, it suggests that the server response should have triggered an MPA navigation
            // I'm not 100% sure of this decision, but it seems unlikely that we'd want to introduce a redirect side effect
            // when refreshing on-screen data, so handling this has been ommitted.
            }
        });
        fetchPromises.push(fetchPromise);
    }
    for(const key in parallelRoutes){
        const parallelFetchPromise = refreshInactiveParallelSegmentsImpl({
            navigatedAt,
            state,
            updatedTree: parallelRoutes[key],
            updatedCache,
            includeNextUrl,
            fetchedSegments,
            rootTree,
            canonicalUrl
        });
        fetchPromises.push(parallelFetchPromise);
    }
    await Promise.all(fetchPromises);
}
function addRefreshMarkerToActiveParallelSegments(tree, path) {
    const [segment, parallelRoutes, , refetchMarker] = tree;
    // a page segment might also contain concatenated search params, so we do a partial match on the key
    if (segment.includes(_segment.PAGE_SEGMENT_KEY) && refetchMarker !== 'refresh') {
        tree[2] = path;
        tree[3] = 'refresh';
    }
    for(const key in parallelRoutes){
        addRefreshMarkerToActiveParallelSegments(parallelRoutes[key], path);
    }
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=refetch-inactive-parallel-segments.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/apply-router-state-patch-to-tree.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "applyRouterStatePatchToTree", {
    enumerable: true,
    get: function() {
        return applyRouterStatePatchToTree;
    }
});
const _segment = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/shared/lib/segment.js [app-ssr] (ecmascript)");
const _flightdatahelpers = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/flight-data-helpers.js [app-ssr] (ecmascript)");
const _matchsegments = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/match-segments.js [app-ssr] (ecmascript)");
const _refetchinactiveparallelsegments = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/refetch-inactive-parallel-segments.js [app-ssr] (ecmascript)");
/**
 * Deep merge of the two router states. Parallel route keys are preserved if the patch doesn't have them.
 */ function applyPatch(initialTree, patchTree) {
    const [initialSegment, initialParallelRoutes] = initialTree;
    const [patchSegment, patchParallelRoutes] = patchTree;
    // if the applied patch segment is __DEFAULT__ then it can be ignored in favor of the initial tree
    // this is because the __DEFAULT__ segment is used as a placeholder on navigation
    if (patchSegment === _segment.DEFAULT_SEGMENT_KEY && initialSegment !== _segment.DEFAULT_SEGMENT_KEY) {
        return initialTree;
    }
    if ((0, _matchsegments.matchSegment)(initialSegment, patchSegment)) {
        const newParallelRoutes = {};
        for(const key in initialParallelRoutes){
            const isInPatchTreeParallelRoutes = typeof patchParallelRoutes[key] !== 'undefined';
            if (isInPatchTreeParallelRoutes) {
                newParallelRoutes[key] = applyPatch(initialParallelRoutes[key], patchParallelRoutes[key]);
            } else {
                newParallelRoutes[key] = initialParallelRoutes[key];
            }
        }
        for(const key in patchParallelRoutes){
            if (newParallelRoutes[key]) {
                continue;
            }
            newParallelRoutes[key] = patchParallelRoutes[key];
        }
        const tree = [
            initialSegment,
            newParallelRoutes
        ];
        // Copy over the existing tree
        if (initialTree[2]) {
            tree[2] = initialTree[2];
        }
        if (initialTree[3]) {
            tree[3] = initialTree[3];
        }
        if (initialTree[4]) {
            tree[4] = initialTree[4];
        }
        return tree;
    }
    return patchTree;
}
function applyRouterStatePatchToTree(flightSegmentPath, flightRouterState, treePatch, path) {
    const [segment, parallelRoutes, url, refetch, isRootLayout] = flightRouterState;
    // Root refresh
    if (flightSegmentPath.length === 1) {
        const tree = applyPatch(flightRouterState, treePatch);
        (0, _refetchinactiveparallelsegments.addRefreshMarkerToActiveParallelSegments)(tree, path);
        return tree;
    }
    const [currentSegment, parallelRouteKey] = flightSegmentPath;
    // Tree path returned from the server should always match up with the current tree in the browser
    if (!(0, _matchsegments.matchSegment)(currentSegment, segment)) {
        return null;
    }
    const lastSegment = flightSegmentPath.length === 2;
    let parallelRoutePatch;
    if (lastSegment) {
        parallelRoutePatch = applyPatch(parallelRoutes[parallelRouteKey], treePatch);
    } else {
        parallelRoutePatch = applyRouterStatePatchToTree((0, _flightdatahelpers.getNextFlightSegmentPath)(flightSegmentPath), parallelRoutes[parallelRouteKey], treePatch, path);
        if (parallelRoutePatch === null) {
            return null;
        }
    }
    const tree = [
        flightSegmentPath[0],
        {
            ...parallelRoutes,
            [parallelRouteKey]: parallelRoutePatch
        },
        url,
        refetch
    ];
    // Current segment is the root layout
    if (isRootLayout) {
        tree[4] = true;
    }
    (0, _refetchinactiveparallelsegments.addRefreshMarkerToActiveParallelSegments)(tree, path);
    return tree;
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=apply-router-state-patch-to-tree.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/should-hard-navigate.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "shouldHardNavigate", {
    enumerable: true,
    get: function() {
        return shouldHardNavigate;
    }
});
const _flightdatahelpers = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/flight-data-helpers.js [app-ssr] (ecmascript)");
const _matchsegments = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/match-segments.js [app-ssr] (ecmascript)");
function shouldHardNavigate(flightSegmentPath, flightRouterState) {
    const [segment, parallelRoutes] = flightRouterState;
    // TODO-APP: Check if `as` can be replaced.
    const [currentSegment, parallelRouteKey] = flightSegmentPath;
    // Check if current segment matches the existing segment.
    if (!(0, _matchsegments.matchSegment)(currentSegment, segment)) {
        // If dynamic parameter in tree doesn't match up with segment path a hard navigation is triggered.
        if (Array.isArray(currentSegment)) {
            return true;
        }
        // If the existing segment did not match soft navigation is triggered.
        return false;
    }
    const lastSegment = flightSegmentPath.length <= 2;
    if (lastSegment) {
        return false;
    }
    return shouldHardNavigate((0, _flightdatahelpers.getNextFlightSegmentPath)(flightSegmentPath), parallelRoutes[parallelRouteKey]);
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=should-hard-navigate.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/is-navigating-to-new-root-layout.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "isNavigatingToNewRootLayout", {
    enumerable: true,
    get: function() {
        return isNavigatingToNewRootLayout;
    }
});
function isNavigatingToNewRootLayout(currentTree, nextTree) {
    // Compare segments
    const currentTreeSegment = currentTree[0];
    const nextTreeSegment = nextTree[0];
    // If any segment is different before we find the root layout, the root layout has changed.
    // E.g. /same/(group1)/layout.js -> /same/(group2)/layout.js
    // First segment is 'same' for both, keep looking. (group1) changed to (group2) before the root layout was found, it must have changed.
    if (Array.isArray(currentTreeSegment) && Array.isArray(nextTreeSegment)) {
        // Compare dynamic param name and type but ignore the value, different values would not affect the current root layout
        // /[name] - /slug1 and /slug2, both values (slug1 & slug2) still has the same layout /[name]/layout.js
        if (currentTreeSegment[0] !== nextTreeSegment[0] || currentTreeSegment[2] !== nextTreeSegment[2]) {
            return true;
        }
    } else if (currentTreeSegment !== nextTreeSegment) {
        return true;
    }
    // Current tree root layout found
    if (currentTree[4]) {
        // If the next tree doesn't have the root layout flag, it must have changed.
        return !nextTree[4];
    }
    // Current tree didn't have its root layout here, must have changed.
    if (nextTree[4]) {
        return true;
    }
    // We can't assume it's `parallelRoutes.children` here in case the root layout is `app/@something/layout.js`
    // But it's not possible to be more than one parallelRoutes before the root layout is found
    // TODO-APP: change to traverse all parallel routes
    const currentTreeChild = Object.values(currentTree[1])[0];
    const nextTreeChild = Object.values(nextTree[1])[0];
    if (!currentTreeChild || !nextTreeChild) return true;
    return isNavigatingToNewRootLayout(currentTreeChild, nextTreeChild);
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=is-navigating-to-new-root-layout.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/shared/lib/page-path/ensure-leading-slash.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

/**
 * For a given page path, this function ensures that there is a leading slash.
 * If there is not a leading slash, one is added, otherwise it is noop.
 */ Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "ensureLeadingSlash", {
    enumerable: true,
    get: function() {
        return ensureLeadingSlash;
    }
});
function ensureLeadingSlash(path) {
    return path.startsWith('/') ? path : "/" + path;
} //# sourceMappingURL=ensure-leading-slash.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/shared/lib/router/utils/app-paths.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    normalizeAppPath: null,
    normalizeRscURL: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    normalizeAppPath: function() {
        return normalizeAppPath;
    },
    normalizeRscURL: function() {
        return normalizeRscURL;
    }
});
const _ensureleadingslash = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/shared/lib/page-path/ensure-leading-slash.js [app-ssr] (ecmascript)");
const _segment = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/shared/lib/segment.js [app-ssr] (ecmascript)");
function normalizeAppPath(route) {
    return (0, _ensureleadingslash.ensureLeadingSlash)(route.split('/').reduce((pathname, segment, index, segments)=>{
        // Empty segments are ignored.
        if (!segment) {
            return pathname;
        }
        // Groups are ignored.
        if ((0, _segment.isGroupSegment)(segment)) {
            return pathname;
        }
        // Parallel segments are ignored.
        if (segment[0] === '@') {
            return pathname;
        }
        // The last segment (if it's a leaf) should be ignored.
        if ((segment === 'page' || segment === 'route') && index === segments.length - 1) {
            return pathname;
        }
        return pathname + "/" + segment;
    }, ''));
}
function normalizeRscURL(url) {
    return url.replace(/\.rsc($|\?)/, '$1');
} //# sourceMappingURL=app-paths.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/shared/lib/router/utils/interception-routes.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    INTERCEPTION_ROUTE_MARKERS: null,
    extractInterceptionRouteInformation: null,
    isInterceptionRouteAppPath: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    INTERCEPTION_ROUTE_MARKERS: function() {
        return INTERCEPTION_ROUTE_MARKERS;
    },
    extractInterceptionRouteInformation: function() {
        return extractInterceptionRouteInformation;
    },
    isInterceptionRouteAppPath: function() {
        return isInterceptionRouteAppPath;
    }
});
const _apppaths = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/shared/lib/router/utils/app-paths.js [app-ssr] (ecmascript)");
const INTERCEPTION_ROUTE_MARKERS = [
    '(..)(..)',
    '(.)',
    '(..)',
    '(...)'
];
function isInterceptionRouteAppPath(path) {
    // TODO-APP: add more serious validation
    return path.split('/').find((segment)=>INTERCEPTION_ROUTE_MARKERS.find((m)=>segment.startsWith(m))) !== undefined;
}
function extractInterceptionRouteInformation(path) {
    let interceptingRoute, marker, interceptedRoute;
    for (const segment of path.split('/')){
        marker = INTERCEPTION_ROUTE_MARKERS.find((m)=>segment.startsWith(m));
        if (marker) {
            ;
            [interceptingRoute, interceptedRoute] = path.split(marker, 2);
            break;
        }
    }
    if (!interceptingRoute || !marker || !interceptedRoute) {
        throw Object.defineProperty(new Error("Invalid interception route: " + path + ". Must be in the format /<intercepting route>/(..|...|..)(..)/<intercepted route>"), "__NEXT_ERROR_CODE", {
            value: "E269",
            enumerable: false,
            configurable: true
        });
    }
    interceptingRoute = (0, _apppaths.normalizeAppPath)(interceptingRoute) // normalize the path, e.g. /(blog)/feed -> /feed
    ;
    switch(marker){
        case '(.)':
            // (.) indicates that we should match with sibling routes, so we just need to append the intercepted route to the intercepting route
            if (interceptingRoute === '/') {
                interceptedRoute = "/" + interceptedRoute;
            } else {
                interceptedRoute = interceptingRoute + '/' + interceptedRoute;
            }
            break;
        case '(..)':
            // (..) indicates that we should match at one level up, so we need to remove the last segment of the intercepting route
            if (interceptingRoute === '/') {
                throw Object.defineProperty(new Error("Invalid interception route: " + path + ". Cannot use (..) marker at the root level, use (.) instead."), "__NEXT_ERROR_CODE", {
                    value: "E207",
                    enumerable: false,
                    configurable: true
                });
            }
            interceptedRoute = interceptingRoute.split('/').slice(0, -1).concat(interceptedRoute).join('/');
            break;
        case '(...)':
            // (...) will match the route segment in the root directory, so we need to use the root directory to prepend the intercepted route
            interceptedRoute = '/' + interceptedRoute;
            break;
        case '(..)(..)':
            // (..)(..) indicates that we should match at two levels up, so we need to remove the last two segments of the intercepting route
            const splitInterceptingRoute = interceptingRoute.split('/');
            if (splitInterceptingRoute.length <= 2) {
                throw Object.defineProperty(new Error("Invalid interception route: " + path + ". Cannot use (..)(..) marker at the root level or one level up."), "__NEXT_ERROR_CODE", {
                    value: "E486",
                    enumerable: false,
                    configurable: true
                });
            }
            interceptedRoute = splitInterceptingRoute.slice(0, -2).concat(interceptedRoute).join('/');
            break;
        default:
            throw Object.defineProperty(new Error('Invariant: unexpected marker'), "__NEXT_ERROR_CODE", {
                value: "E112",
                enumerable: false,
                configurable: true
            });
    }
    return {
        interceptingRoute,
        interceptedRoute
    };
} //# sourceMappingURL=interception-routes.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/compute-changed-path.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    computeChangedPath: null,
    extractPathFromFlightRouterState: null,
    getSelectedParams: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    computeChangedPath: function() {
        return computeChangedPath;
    },
    extractPathFromFlightRouterState: function() {
        return extractPathFromFlightRouterState;
    },
    getSelectedParams: function() {
        return getSelectedParams;
    }
});
const _interceptionroutes = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/shared/lib/router/utils/interception-routes.js [app-ssr] (ecmascript)");
const _segment = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/shared/lib/segment.js [app-ssr] (ecmascript)");
const _matchsegments = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/match-segments.js [app-ssr] (ecmascript)");
const removeLeadingSlash = (segment)=>{
    return segment[0] === '/' ? segment.slice(1) : segment;
};
const segmentToPathname = (segment)=>{
    if (typeof segment === 'string') {
        // 'children' is not a valid path -- it's technically a parallel route that corresponds with the current segment's page
        // if we don't skip it, then the computed pathname might be something like `/children` which doesn't make sense.
        if (segment === 'children') return '';
        return segment;
    }
    return segment[1];
};
function normalizeSegments(segments) {
    return segments.reduce((acc, segment)=>{
        segment = removeLeadingSlash(segment);
        if (segment === '' || (0, _segment.isGroupSegment)(segment)) {
            return acc;
        }
        return acc + "/" + segment;
    }, '') || '/';
}
function extractPathFromFlightRouterState(flightRouterState) {
    const segment = Array.isArray(flightRouterState[0]) ? flightRouterState[0][1] : flightRouterState[0];
    if (segment === _segment.DEFAULT_SEGMENT_KEY || _interceptionroutes.INTERCEPTION_ROUTE_MARKERS.some((m)=>segment.startsWith(m))) return undefined;
    if (segment.startsWith(_segment.PAGE_SEGMENT_KEY)) return '';
    const segments = [
        segmentToPathname(segment)
    ];
    var _flightRouterState_;
    const parallelRoutes = (_flightRouterState_ = flightRouterState[1]) != null ? _flightRouterState_ : {};
    const childrenPath = parallelRoutes.children ? extractPathFromFlightRouterState(parallelRoutes.children) : undefined;
    if (childrenPath !== undefined) {
        segments.push(childrenPath);
    } else {
        for (const [key, value] of Object.entries(parallelRoutes)){
            if (key === 'children') continue;
            const childPath = extractPathFromFlightRouterState(value);
            if (childPath !== undefined) {
                segments.push(childPath);
            }
        }
    }
    return normalizeSegments(segments);
}
function computeChangedPathImpl(treeA, treeB) {
    const [segmentA, parallelRoutesA] = treeA;
    const [segmentB, parallelRoutesB] = treeB;
    const normalizedSegmentA = segmentToPathname(segmentA);
    const normalizedSegmentB = segmentToPathname(segmentB);
    if (_interceptionroutes.INTERCEPTION_ROUTE_MARKERS.some((m)=>normalizedSegmentA.startsWith(m) || normalizedSegmentB.startsWith(m))) {
        return '';
    }
    if (!(0, _matchsegments.matchSegment)(segmentA, segmentB)) {
        var _extractPathFromFlightRouterState;
        // once we find where the tree changed, we compute the rest of the path by traversing the tree
        return (_extractPathFromFlightRouterState = extractPathFromFlightRouterState(treeB)) != null ? _extractPathFromFlightRouterState : '';
    }
    for(const parallelRouterKey in parallelRoutesA){
        if (parallelRoutesB[parallelRouterKey]) {
            const changedPath = computeChangedPathImpl(parallelRoutesA[parallelRouterKey], parallelRoutesB[parallelRouterKey]);
            if (changedPath !== null) {
                return segmentToPathname(segmentB) + "/" + changedPath;
            }
        }
    }
    return null;
}
function computeChangedPath(treeA, treeB) {
    const changedPath = computeChangedPathImpl(treeA, treeB);
    if (changedPath == null || changedPath === '/') {
        return changedPath;
    }
    // lightweight normalization to remove route groups
    return normalizeSegments(changedPath.split('/'));
}
function getSelectedParams(currentTree, params) {
    if (params === void 0) params = {};
    const parallelRoutes = currentTree[1];
    for (const parallelRoute of Object.values(parallelRoutes)){
        const segment = parallelRoute[0];
        const isDynamicParameter = Array.isArray(segment);
        const segmentValue = isDynamicParameter ? segment[1] : segment;
        if (!segmentValue || segmentValue.startsWith(_segment.PAGE_SEGMENT_KEY)) continue;
        // Ensure catchAll and optional catchall are turned into an array
        const isCatchAll = isDynamicParameter && (segment[2] === 'c' || segment[2] === 'oc');
        if (isCatchAll) {
            params[segment[0]] = segment[1].split('/');
        } else if (isDynamicParameter) {
            params[segment[0]] = segment[1];
        }
        params = getSelectedParams(parallelRoute, params);
    }
    return params;
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=compute-changed-path.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/handle-mutable.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "handleMutable", {
    enumerable: true,
    get: function() {
        return handleMutable;
    }
});
const _computechangedpath = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/compute-changed-path.js [app-ssr] (ecmascript)");
function isNotUndefined(value) {
    return typeof value !== 'undefined';
}
function handleMutable(state, mutable) {
    var _mutable_shouldScroll;
    // shouldScroll is true by default, can override to false.
    const shouldScroll = (_mutable_shouldScroll = mutable.shouldScroll) != null ? _mutable_shouldScroll : true;
    let nextUrl = state.nextUrl;
    if (isNotUndefined(mutable.patchedTree)) {
        // If we received a patched tree, we need to compute the changed path.
        const changedPath = (0, _computechangedpath.computeChangedPath)(state.tree, mutable.patchedTree);
        if (changedPath) {
            // If the tree changed, we need to update the nextUrl
            nextUrl = changedPath;
        } else if (!nextUrl) {
            // if the tree ends up being the same (ie, no changed path), and we don't have a nextUrl, then we should use the canonicalUrl
            nextUrl = state.canonicalUrl;
        }
    // otherwise this will be a no-op and continue to use the existing nextUrl
    }
    var _mutable_scrollableSegments;
    return {
        // Set href.
        canonicalUrl: isNotUndefined(mutable.canonicalUrl) ? mutable.canonicalUrl === state.canonicalUrl ? state.canonicalUrl : mutable.canonicalUrl : state.canonicalUrl,
        pushRef: {
            pendingPush: isNotUndefined(mutable.pendingPush) ? mutable.pendingPush : state.pushRef.pendingPush,
            mpaNavigation: isNotUndefined(mutable.mpaNavigation) ? mutable.mpaNavigation : state.pushRef.mpaNavigation,
            preserveCustomHistoryState: isNotUndefined(mutable.preserveCustomHistoryState) ? mutable.preserveCustomHistoryState : state.pushRef.preserveCustomHistoryState
        },
        // All navigation requires scroll and focus management to trigger.
        focusAndScrollRef: {
            apply: shouldScroll ? isNotUndefined(mutable == null ? void 0 : mutable.scrollableSegments) ? true : state.focusAndScrollRef.apply : false,
            onlyHashChange: mutable.onlyHashChange || false,
            hashFragment: shouldScroll ? mutable.hashFragment && mutable.hashFragment !== '' ? decodeURIComponent(mutable.hashFragment.slice(1)) : state.focusAndScrollRef.hashFragment : null,
            segmentPaths: shouldScroll ? (_mutable_scrollableSegments = mutable == null ? void 0 : mutable.scrollableSegments) != null ? _mutable_scrollableSegments : state.focusAndScrollRef.segmentPaths : []
        },
        // Apply cache.
        cache: mutable.cache ? mutable.cache : state.cache,
        prefetchCache: mutable.prefetchCache ? mutable.prefetchCache : state.prefetchCache,
        // Apply patched router state.
        tree: isNotUndefined(mutable.patchedTree) ? mutable.patchedTree : state.tree,
        nextUrl
    };
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=handle-mutable.js.map
}),
"[project]/Projects/fmko/node_modules/@swc/helpers/cjs/_class_private_field_loose_base.cjs [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

function _class_private_field_loose_base(receiver, privateKey) {
    if (!Object.prototype.hasOwnProperty.call(receiver, privateKey)) {
        throw new TypeError("attempted to use private field on non-instance");
    }
    return receiver;
}
exports._ = _class_private_field_loose_base;
}),
"[project]/Projects/fmko/node_modules/@swc/helpers/cjs/_class_private_field_loose_key.cjs [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

var id = 0;
function _class_private_field_loose_key(name) {
    return "__private_" + id++ + "_" + name;
}
exports._ = _class_private_field_loose_key;
}),
"[project]/Projects/fmko/node_modules/next/dist/client/components/promise-queue.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

/*
    This is a simple promise queue that allows you to limit the number of concurrent promises
    that are running at any given time. It's used to limit the number of concurrent
    prefetch requests that are being made to the server but could be used for other
    things as well.
*/ Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "PromiseQueue", {
    enumerable: true,
    get: function() {
        return PromiseQueue;
    }
});
const _class_private_field_loose_base = __turbopack_context__.r("[project]/Projects/fmko/node_modules/@swc/helpers/cjs/_class_private_field_loose_base.cjs [app-ssr] (ecmascript)");
const _class_private_field_loose_key = __turbopack_context__.r("[project]/Projects/fmko/node_modules/@swc/helpers/cjs/_class_private_field_loose_key.cjs [app-ssr] (ecmascript)");
var _maxConcurrency = /*#__PURE__*/ _class_private_field_loose_key._("_maxConcurrency"), _runningCount = /*#__PURE__*/ _class_private_field_loose_key._("_runningCount"), _queue = /*#__PURE__*/ _class_private_field_loose_key._("_queue"), _processNext = /*#__PURE__*/ _class_private_field_loose_key._("_processNext");
class PromiseQueue {
    enqueue(promiseFn) {
        let taskResolve;
        let taskReject;
        const taskPromise = new Promise((resolve, reject)=>{
            taskResolve = resolve;
            taskReject = reject;
        });
        const task = async ()=>{
            try {
                _class_private_field_loose_base._(this, _runningCount)[_runningCount]++;
                const result = await promiseFn();
                taskResolve(result);
            } catch (error) {
                taskReject(error);
            } finally{
                _class_private_field_loose_base._(this, _runningCount)[_runningCount]--;
                _class_private_field_loose_base._(this, _processNext)[_processNext]();
            }
        };
        const enqueueResult = {
            promiseFn: taskPromise,
            task
        };
        // wonder if we should take a LIFO approach here
        _class_private_field_loose_base._(this, _queue)[_queue].push(enqueueResult);
        _class_private_field_loose_base._(this, _processNext)[_processNext]();
        return taskPromise;
    }
    bump(promiseFn) {
        const index = _class_private_field_loose_base._(this, _queue)[_queue].findIndex((item)=>item.promiseFn === promiseFn);
        if (index > -1) {
            const bumpedItem = _class_private_field_loose_base._(this, _queue)[_queue].splice(index, 1)[0];
            _class_private_field_loose_base._(this, _queue)[_queue].unshift(bumpedItem);
            _class_private_field_loose_base._(this, _processNext)[_processNext](true);
        }
    }
    constructor(maxConcurrency = 5){
        Object.defineProperty(this, _processNext, {
            value: processNext
        });
        Object.defineProperty(this, _maxConcurrency, {
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, _runningCount, {
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, _queue, {
            writable: true,
            value: void 0
        });
        _class_private_field_loose_base._(this, _maxConcurrency)[_maxConcurrency] = maxConcurrency;
        _class_private_field_loose_base._(this, _runningCount)[_runningCount] = 0;
        _class_private_field_loose_base._(this, _queue)[_queue] = [];
    }
}
function processNext(forced) {
    if (forced === void 0) forced = false;
    if ((_class_private_field_loose_base._(this, _runningCount)[_runningCount] < _class_private_field_loose_base._(this, _maxConcurrency)[_maxConcurrency] || forced) && _class_private_field_loose_base._(this, _queue)[_queue].length > 0) {
        var _class_private_field_loose_base__queue_shift;
        (_class_private_field_loose_base__queue_shift = _class_private_field_loose_base._(this, _queue)[_queue].shift()) == null ? void 0 : _class_private_field_loose_base__queue_shift.task();
    }
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=promise-queue.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/prefetch-cache-utils.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    DYNAMIC_STALETIME_MS: null,
    STATIC_STALETIME_MS: null,
    createSeededPrefetchCacheEntry: null,
    getOrCreatePrefetchCacheEntry: null,
    prunePrefetchCache: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    DYNAMIC_STALETIME_MS: function() {
        return DYNAMIC_STALETIME_MS;
    },
    STATIC_STALETIME_MS: function() {
        return STATIC_STALETIME_MS;
    },
    createSeededPrefetchCacheEntry: function() {
        return createSeededPrefetchCacheEntry;
    },
    getOrCreatePrefetchCacheEntry: function() {
        return getOrCreatePrefetchCacheEntry;
    },
    prunePrefetchCache: function() {
        return prunePrefetchCache;
    }
});
const _fetchserverresponse = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/fetch-server-response.js [app-ssr] (ecmascript)");
const _routerreducertypes = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/router-reducer-types.js [app-ssr] (ecmascript)");
const _prefetchreducer = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/reducers/prefetch-reducer.js [app-ssr] (ecmascript)");
const INTERCEPTION_CACHE_KEY_MARKER = '%';
/**
 * Creates a cache key for the router prefetch cache
 *
 * @param url - The URL being navigated to
 * @param nextUrl - an internal URL, primarily used for handling rewrites. Defaults to '/'.
 * @return The generated prefetch cache key.
 */ function createPrefetchCacheKeyImpl(url, includeSearchParams, prefix) {
    // Initially we only use the pathname as the cache key. We don't want to include
    // search params so that multiple URLs with the same search parameter can re-use
    // loading states.
    let pathnameFromUrl = url.pathname;
    // RSC responses can differ based on search params, specifically in the case where we aren't
    // returning a partial response (ie with `PrefetchKind.AUTO`).
    // In the auto case, since loading.js & layout.js won't have access to search params,
    // we can safely re-use that cache entry. But for full prefetches, we should not
    // re-use the cache entry as the response may differ.
    if (includeSearchParams) {
        // if we have a full prefetch, we can include the search param in the key,
        // as we'll be getting back a full response. The server might have read the search
        // params when generating the full response.
        pathnameFromUrl += url.search;
    }
    if (prefix) {
        return "" + prefix + INTERCEPTION_CACHE_KEY_MARKER + pathnameFromUrl;
    }
    return pathnameFromUrl;
}
function createPrefetchCacheKey(url, kind, nextUrl) {
    return createPrefetchCacheKeyImpl(url, kind === _routerreducertypes.PrefetchKind.FULL, nextUrl);
}
function getExistingCacheEntry(url, kind, nextUrl, prefetchCache, allowAliasing) {
    if (kind === void 0) kind = _routerreducertypes.PrefetchKind.TEMPORARY;
    // We first check if there's a more specific interception route prefetch entry
    // This is because when we detect a prefetch that corresponds with an interception route, we prefix it with nextUrl (see `createPrefetchCacheKey`)
    // to avoid conflicts with other pages that may have the same URL but render different things depending on the `Next-URL` header.
    for (const maybeNextUrl of [
        nextUrl,
        null
    ]){
        const cacheKeyWithParams = createPrefetchCacheKeyImpl(url, true, maybeNextUrl);
        const cacheKeyWithoutParams = createPrefetchCacheKeyImpl(url, false, maybeNextUrl);
        // First, we check if we have a cache entry that exactly matches the URL
        const cacheKeyToUse = url.search ? cacheKeyWithParams : cacheKeyWithoutParams;
        const existingEntry = prefetchCache.get(cacheKeyToUse);
        if (existingEntry && allowAliasing) {
            // We know we're returning an aliased entry when the pathname matches but the search params don't,
            const isAliased = existingEntry.url.pathname === url.pathname && existingEntry.url.search !== url.search;
            if (isAliased) {
                return {
                    ...existingEntry,
                    aliased: true
                };
            }
            return existingEntry;
        }
        // If the request contains search params, and we're not doing a full prefetch, we can return the
        // param-less entry if it exists.
        // This is technically covered by the check at the bottom of this function, which iterates over cache entries,
        // but lets us arrive there quicker in the param-full case.
        const entryWithoutParams = prefetchCache.get(cacheKeyWithoutParams);
        if (("TURBOPACK compile-time value", "development") !== 'development' && allowAliasing && url.search && kind !== _routerreducertypes.PrefetchKind.FULL && entryWithoutParams && // We shouldn't return the aliased entry if it was relocated to a new cache key.
        // Since it's rewritten, it could respond with a completely different loading state.
        !entryWithoutParams.key.includes(INTERCEPTION_CACHE_KEY_MARKER)) //TURBOPACK unreachable
        ;
    }
    // If we've gotten to this point, we didn't find a specific cache entry that matched
    // the request URL.
    // We attempt a partial match by checking if there's a cache entry with the same pathname.
    // Regardless of what we find, since it doesn't correspond with the requested URL, we'll mark it "aliased".
    // This will signal to the router that it should only apply the loading state on the prefetched data.
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    return undefined;
}
function getOrCreatePrefetchCacheEntry(param) {
    let { url, nextUrl, tree, prefetchCache, kind, allowAliasing = true } = param;
    const existingCacheEntry = getExistingCacheEntry(url, kind, nextUrl, prefetchCache, allowAliasing);
    if (existingCacheEntry) {
        // Grab the latest status of the cache entry and update it
        existingCacheEntry.status = getPrefetchEntryCacheStatus(existingCacheEntry);
        // when `kind` is provided, an explicit prefetch was requested.
        // if the requested prefetch is "full" and the current cache entry wasn't, we want to re-prefetch with the new intent
        const switchedToFullPrefetch = existingCacheEntry.kind !== _routerreducertypes.PrefetchKind.FULL && kind === _routerreducertypes.PrefetchKind.FULL;
        if (switchedToFullPrefetch) {
            // If we switched to a full prefetch, validate that the existing cache entry contained partial data.
            // It's possible that the cache entry was seeded with full data but has a cache type of "auto" (ie when cache entries
            // are seeded but without a prefetch intent)
            existingCacheEntry.data.then((prefetchResponse)=>{
                const isFullPrefetch = Array.isArray(prefetchResponse.flightData) && prefetchResponse.flightData.some((flightData)=>{
                    // If we started rendering from the root and we returned RSC data (seedData), we already had a full prefetch.
                    return flightData.isRootRender && flightData.seedData !== null;
                });
                if (!isFullPrefetch) {
                    return createLazyPrefetchEntry({
                        tree,
                        url,
                        nextUrl,
                        prefetchCache,
                        // If we didn't get an explicit prefetch kind, we want to set a temporary kind
                        // rather than assuming the same intent as the previous entry, to be consistent with how we
                        // lazily create prefetch entries when intent is left unspecified.
                        kind: kind != null ? kind : _routerreducertypes.PrefetchKind.TEMPORARY
                    });
                }
            });
        }
        // If the existing cache entry was marked as temporary, it means it was lazily created when attempting to get an entry,
        // where we didn't have the prefetch intent. Now that we have the intent (in `kind`), we want to update the entry to the more accurate kind.
        if (kind && existingCacheEntry.kind === _routerreducertypes.PrefetchKind.TEMPORARY) {
            existingCacheEntry.kind = kind;
        }
        // We've determined that the existing entry we found is still valid, so we return it.
        return existingCacheEntry;
    }
    // If we didn't return an entry, create a new one.
    return createLazyPrefetchEntry({
        tree,
        url,
        nextUrl,
        prefetchCache,
        kind: kind || _routerreducertypes.PrefetchKind.TEMPORARY
    });
}
/*
 * Used to take an existing cache entry and prefix it with the nextUrl, if it exists.
 * This ensures that we don't have conflicting cache entries for the same URL (as is the case with route interception).
 */ function prefixExistingPrefetchCacheEntry(param) {
    let { url, nextUrl, prefetchCache, existingCacheKey } = param;
    const existingCacheEntry = prefetchCache.get(existingCacheKey);
    if (!existingCacheEntry) {
        // no-op -- there wasn't an entry to move
        return;
    }
    const newCacheKey = createPrefetchCacheKey(url, existingCacheEntry.kind, nextUrl);
    prefetchCache.set(newCacheKey, {
        ...existingCacheEntry,
        key: newCacheKey
    });
    prefetchCache.delete(existingCacheKey);
    return newCacheKey;
}
function createSeededPrefetchCacheEntry(param) {
    let { nextUrl, tree, prefetchCache, url, data, kind } = param;
    // The initial cache entry technically includes full data, but it isn't explicitly prefetched -- we just seed the
    // prefetch cache so that we can skip an extra prefetch request later, since we already have the data.
    // if the prefetch corresponds with an interception route, we use the nextUrl to prefix the cache key
    const prefetchCacheKey = data.couldBeIntercepted ? createPrefetchCacheKey(url, kind, nextUrl) : createPrefetchCacheKey(url, kind);
    const prefetchEntry = {
        treeAtTimeOfPrefetch: tree,
        data: Promise.resolve(data),
        kind,
        prefetchTime: Date.now(),
        lastUsedTime: Date.now(),
        staleTime: data.staleTime,
        key: prefetchCacheKey,
        status: _routerreducertypes.PrefetchCacheEntryStatus.fresh,
        url
    };
    prefetchCache.set(prefetchCacheKey, prefetchEntry);
    return prefetchEntry;
}
/**
 * Creates a prefetch entry entry and enqueues a fetch request to retrieve the data.
 */ function createLazyPrefetchEntry(param) {
    let { url, kind, tree, nextUrl, prefetchCache } = param;
    const prefetchCacheKey = createPrefetchCacheKey(url, kind);
    // initiates the fetch request for the prefetch and attaches a listener
    // to the promise to update the prefetch cache entry when the promise resolves (if necessary)
    const data = _prefetchreducer.prefetchQueue.enqueue(()=>(0, _fetchserverresponse.fetchServerResponse)(url, {
            flightRouterState: tree,
            nextUrl,
            prefetchKind: kind
        }).then((prefetchResponse)=>{
            // TODO: `fetchServerResponse` should be more tighly coupled to these prefetch cache operations
            // to avoid drift between this cache key prefixing logic
            // (which is currently directly influenced by the server response)
            let newCacheKey;
            if (prefetchResponse.couldBeIntercepted) {
                // Determine if we need to prefix the cache key with the nextUrl
                newCacheKey = prefixExistingPrefetchCacheEntry({
                    url,
                    existingCacheKey: prefetchCacheKey,
                    nextUrl,
                    prefetchCache
                });
            }
            // If the prefetch was a cache hit, we want to update the existing cache entry to reflect that it was a full prefetch.
            // This is because we know that a static response will contain the full RSC payload, and can be updated to respect the `static`
            // staleTime.
            if (prefetchResponse.prerendered) {
                const existingCacheEntry = prefetchCache.get(newCacheKey != null ? newCacheKey : prefetchCacheKey);
                if (existingCacheEntry) {
                    existingCacheEntry.kind = _routerreducertypes.PrefetchKind.FULL;
                    if (prefetchResponse.staleTime !== -1) {
                        // This is the stale time that was collected by the server during
                        // static generation. Use this in place of the default stale time.
                        existingCacheEntry.staleTime = prefetchResponse.staleTime;
                    }
                }
            }
            return prefetchResponse;
        }));
    const prefetchEntry = {
        treeAtTimeOfPrefetch: tree,
        data,
        kind,
        prefetchTime: Date.now(),
        lastUsedTime: null,
        staleTime: -1,
        key: prefetchCacheKey,
        status: _routerreducertypes.PrefetchCacheEntryStatus.fresh,
        url
    };
    prefetchCache.set(prefetchCacheKey, prefetchEntry);
    return prefetchEntry;
}
function prunePrefetchCache(prefetchCache) {
    for (const [href, prefetchCacheEntry] of prefetchCache){
        if (getPrefetchEntryCacheStatus(prefetchCacheEntry) === _routerreducertypes.PrefetchCacheEntryStatus.expired) {
            prefetchCache.delete(href);
        }
    }
}
const DYNAMIC_STALETIME_MS = Number(("TURBOPACK compile-time value", "0")) * 1000;
const STATIC_STALETIME_MS = Number(("TURBOPACK compile-time value", "300")) * 1000;
function getPrefetchEntryCacheStatus(param) {
    let { kind, prefetchTime, lastUsedTime } = param;
    // We will re-use the cache entry data for up to the `dynamic` staletime window.
    if (Date.now() < (lastUsedTime != null ? lastUsedTime : prefetchTime) + DYNAMIC_STALETIME_MS) {
        return lastUsedTime ? _routerreducertypes.PrefetchCacheEntryStatus.reusable : _routerreducertypes.PrefetchCacheEntryStatus.fresh;
    }
    // For "auto" prefetching, we'll re-use only the loading boundary for up to `static` staletime window.
    // A stale entry will only re-use the `loading` boundary, not the full data.
    // This will trigger a "lazy fetch" for the full data.
    if (kind === _routerreducertypes.PrefetchKind.AUTO) {
        if (Date.now() < prefetchTime + STATIC_STALETIME_MS) {
            return _routerreducertypes.PrefetchCacheEntryStatus.stale;
        }
    }
    // for "full" prefetching, we'll re-use the cache entry data for up to `static` staletime window.
    if (kind === _routerreducertypes.PrefetchKind.FULL) {
        if (Date.now() < prefetchTime + STATIC_STALETIME_MS) {
            return _routerreducertypes.PrefetchCacheEntryStatus.reusable;
        }
    }
    return _routerreducertypes.PrefetchCacheEntryStatus.expired;
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=prefetch-cache-utils.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/reducers/prefetch-reducer.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    prefetchQueue: null,
    prefetchReducer: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    prefetchQueue: function() {
        return prefetchQueue;
    },
    prefetchReducer: function() {
        return prefetchReducer;
    }
});
const _promisequeue = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/promise-queue.js [app-ssr] (ecmascript)");
const _prefetchcacheutils = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/prefetch-cache-utils.js [app-ssr] (ecmascript)");
const prefetchQueue = new _promisequeue.PromiseQueue(5);
const prefetchReducer = ("TURBOPACK compile-time falsy", 0) ? "TURBOPACK unreachable" : prefetchReducerImpl;
function identityReducerWhenSegmentCacheIsEnabled(state) {
    // Unlike the old implementation, the Segment Cache doesn't store its data in
    // the router reducer state.
    //
    // This shouldn't be reachable because we wrap the prefetch API in a check,
    // too, which prevents the action from being dispatched. But it's here for
    // clarity + code elimination.
    return state;
}
function prefetchReducerImpl(state, action) {
    // let's prune the prefetch cache before we do anything else
    (0, _prefetchcacheutils.prunePrefetchCache)(state.prefetchCache);
    const { url } = action;
    (0, _prefetchcacheutils.getOrCreatePrefetchCacheEntry)({
        url,
        nextUrl: state.nextUrl,
        prefetchCache: state.prefetchCache,
        kind: action.kind,
        tree: state.tree,
        allowAliasing: true
    });
    return state;
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=prefetch-reducer.js.map
}),
"[project]/Projects/fmko/node_modules/@swc/helpers/cjs/_interop_require_default.cjs [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
exports._ = _interop_require_default;
}),
"[project]/Projects/fmko/node_modules/next/dist/shared/lib/router/utils/html-bots.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

// This regex contains the bots that we need to do a blocking render for and can't safely stream the response
// due to how they parse the DOM. For example, they might explicitly check for metadata in the `head` tag, so we can't stream metadata tags after the `head` was sent.
// Note: The pattern [\w-]+-Google captures all Google crawlers with "-Google" suffix (e.g., Mediapartners-Google, AdsBot-Google, Storebot-Google)
// as well as crawlers starting with "Google-" (e.g., Google-PageRenderer, Google-InspectionTool)
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "HTML_LIMITED_BOT_UA_RE", {
    enumerable: true,
    get: function() {
        return HTML_LIMITED_BOT_UA_RE;
    }
});
const HTML_LIMITED_BOT_UA_RE = /[\w-]+-Google|Google-[\w-]+|Chrome-Lighthouse|Slurp|DuckDuckBot|baiduspider|yandex|sogou|bitlybot|tumblr|vkShare|quora link preview|redditbot|ia_archiver|Bingbot|BingPreview|applebot|facebookexternalhit|facebookcatalog|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview|Yeti|googleweblight/i; //# sourceMappingURL=html-bots.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/shared/lib/router/utils/is-bot.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    HTML_LIMITED_BOT_UA_RE: null,
    HTML_LIMITED_BOT_UA_RE_STRING: null,
    getBotType: null,
    isBot: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    HTML_LIMITED_BOT_UA_RE: function() {
        return _htmlbots.HTML_LIMITED_BOT_UA_RE;
    },
    HTML_LIMITED_BOT_UA_RE_STRING: function() {
        return HTML_LIMITED_BOT_UA_RE_STRING;
    },
    getBotType: function() {
        return getBotType;
    },
    isBot: function() {
        return isBot;
    }
});
const _htmlbots = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/shared/lib/router/utils/html-bots.js [app-ssr] (ecmascript)");
// Bot crawler that will spin up a headless browser and execute JS.
// Only the main Googlebot search crawler executes JavaScript, not other Google crawlers.
// x-ref: https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers
// This regex specifically matches "Googlebot" but NOT "Mediapartners-Google", "AdsBot-Google", etc.
const HEADLESS_BROWSER_BOT_UA_RE = /Googlebot(?!-)|Googlebot$/i;
const HTML_LIMITED_BOT_UA_RE_STRING = _htmlbots.HTML_LIMITED_BOT_UA_RE.source;
function isDomBotUA(userAgent) {
    return HEADLESS_BROWSER_BOT_UA_RE.test(userAgent);
}
function isHtmlLimitedBotUA(userAgent) {
    return _htmlbots.HTML_LIMITED_BOT_UA_RE.test(userAgent);
}
function isBot(userAgent) {
    return isDomBotUA(userAgent) || isHtmlLimitedBotUA(userAgent);
}
function getBotType(userAgent) {
    if (isDomBotUA(userAgent)) {
        return 'dom';
    }
    if (isHtmlLimitedBotUA(userAgent)) {
        return 'html';
    }
    return undefined;
} //# sourceMappingURL=is-bot.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/components/app-router-announcer.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "AppRouterAnnouncer", {
    enumerable: true,
    get: function() {
        return AppRouterAnnouncer;
    }
});
const _react = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
const _reactdom = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-dom.js [app-ssr] (ecmascript)");
const ANNOUNCER_TYPE = 'next-route-announcer';
const ANNOUNCER_ID = '__next-route-announcer__';
function getAnnouncerNode() {
    var _existingAnnouncer_shadowRoot;
    const existingAnnouncer = document.getElementsByName(ANNOUNCER_TYPE)[0];
    if (existingAnnouncer == null ? void 0 : (_existingAnnouncer_shadowRoot = existingAnnouncer.shadowRoot) == null ? void 0 : _existingAnnouncer_shadowRoot.childNodes[0]) {
        return existingAnnouncer.shadowRoot.childNodes[0];
    } else {
        const container = document.createElement(ANNOUNCER_TYPE);
        container.style.cssText = 'position:absolute';
        const announcer = document.createElement('div');
        announcer.ariaLive = 'assertive';
        announcer.id = ANNOUNCER_ID;
        announcer.role = 'alert';
        announcer.style.cssText = 'position:absolute;border:0;height:1px;margin:-1px;padding:0;width:1px;clip:rect(0 0 0 0);overflow:hidden;white-space:nowrap;word-wrap:normal';
        // Use shadow DOM here to avoid any potential CSS bleed
        const shadow = container.attachShadow({
            mode: 'open'
        });
        shadow.appendChild(announcer);
        document.body.appendChild(container);
        return announcer;
    }
}
function AppRouterAnnouncer(param) {
    let { tree } = param;
    const [portalNode, setPortalNode] = (0, _react.useState)(null);
    (0, _react.useEffect)(()=>{
        const announcer = getAnnouncerNode();
        setPortalNode(announcer);
        return ()=>{
            const container = document.getElementsByTagName(ANNOUNCER_TYPE)[0];
            if (container == null ? void 0 : container.isConnected) {
                document.body.removeChild(container);
            }
        };
    }, []);
    const [routeAnnouncement, setRouteAnnouncement] = (0, _react.useState)('');
    const previousTitle = (0, _react.useRef)(undefined);
    (0, _react.useEffect)(()=>{
        let currentTitle = '';
        if (document.title) {
            currentTitle = document.title;
        } else {
            const pageHeader = document.querySelector('h1');
            if (pageHeader) {
                currentTitle = pageHeader.innerText || pageHeader.textContent || '';
            }
        }
        // Only announce the title change, but not for the first load because screen
        // readers do that automatically.
        if (previousTitle.current !== undefined && previousTitle.current !== currentTitle) {
            setRouteAnnouncement(currentTitle);
        }
        previousTitle.current = currentTitle;
    }, [
        tree
    ]);
    return portalNode ? /*#__PURE__*/ (0, _reactdom.createPortal)(routeAnnouncement, portalNode) : null;
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=app-router-announcer.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/components/redirect-boundary.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    RedirectBoundary: null,
    RedirectErrorBoundary: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    RedirectBoundary: function() {
        return RedirectBoundary;
    },
    RedirectErrorBoundary: function() {
        return RedirectErrorBoundary;
    }
});
const _interop_require_wildcard = __turbopack_context__.r("[project]/Projects/fmko/node_modules/@swc/helpers/cjs/_interop_require_wildcard.cjs [app-ssr] (ecmascript)");
const _jsxruntime = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-runtime.js [app-ssr] (ecmascript)");
const _react = /*#__PURE__*/ _interop_require_wildcard._(__turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)"));
const _navigation = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/navigation.js [app-ssr] (ecmascript)");
const _redirect = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/redirect.js [app-ssr] (ecmascript)");
const _redirecterror = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/redirect-error.js [app-ssr] (ecmascript)");
function HandleRedirect(param) {
    let { redirect, reset, redirectType } = param;
    const router = (0, _navigation.useRouter)();
    (0, _react.useEffect)(()=>{
        _react.default.startTransition(()=>{
            if (redirectType === _redirecterror.RedirectType.push) {
                router.push(redirect, {});
            } else {
                router.replace(redirect, {});
            }
            reset();
        });
    }, [
        redirect,
        redirectType,
        reset,
        router
    ]);
    return null;
}
class RedirectErrorBoundary extends _react.default.Component {
    static getDerivedStateFromError(error) {
        if ((0, _redirecterror.isRedirectError)(error)) {
            const url = (0, _redirect.getURLFromRedirectError)(error);
            const redirectType = (0, _redirect.getRedirectTypeFromError)(error);
            return {
                redirect: url,
                redirectType
            };
        }
        // Re-throw if error is not for redirect
        throw error;
    }
    // Explicit type is needed to avoid the generated `.d.ts` having a wide return type that could be specific to the `@types/react` version.
    render() {
        const { redirect, redirectType } = this.state;
        if (redirect !== null && redirectType !== null) {
            return /*#__PURE__*/ (0, _jsxruntime.jsx)(HandleRedirect, {
                redirect: redirect,
                redirectType: redirectType,
                reset: ()=>this.setState({
                        redirect: null
                    })
            });
        }
        return this.props.children;
    }
    constructor(props){
        super(props);
        this.state = {
            redirect: null,
            redirectType: null
        };
    }
}
function RedirectBoundary(param) {
    let { children } = param;
    const router = (0, _navigation.useRouter)();
    return /*#__PURE__*/ (0, _jsxruntime.jsx)(RedirectErrorBoundary, {
        router: router,
        children: children
    });
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=redirect-boundary.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/reducers/find-head-in-cache.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "findHeadInCache", {
    enumerable: true,
    get: function() {
        return findHeadInCache;
    }
});
const _segment = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/shared/lib/segment.js [app-ssr] (ecmascript)");
const _createroutercachekey = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/create-router-cache-key.js [app-ssr] (ecmascript)");
function findHeadInCache(cache, parallelRoutes) {
    return findHeadInCacheImpl(cache, parallelRoutes, '', '');
}
function findHeadInCacheImpl(cache, parallelRoutes, keyPrefix, keyPrefixWithoutSearchParams) {
    const isLastItem = Object.keys(parallelRoutes).length === 0;
    if (isLastItem) {
        // Returns the entire Cache Node of the segment whose head we will render.
        return [
            cache,
            keyPrefix,
            keyPrefixWithoutSearchParams
        ];
    }
    // First try the 'children' parallel route if it exists
    // when starting from the "root", this corresponds with the main page component
    const parallelRoutesKeys = Object.keys(parallelRoutes).filter((key)=>key !== 'children');
    // if we are at the root, we need to check the children slot first
    if ('children' in parallelRoutes) {
        parallelRoutesKeys.unshift('children');
    }
    for (const key of parallelRoutesKeys){
        const [segment, childParallelRoutes] = parallelRoutes[key];
        // If the parallel is not matched and using the default segment,
        // skip searching the head from it.
        if (segment === _segment.DEFAULT_SEGMENT_KEY) {
            continue;
        }
        const childSegmentMap = cache.parallelRoutes.get(key);
        if (!childSegmentMap) {
            continue;
        }
        const cacheKey = (0, _createroutercachekey.createRouterCacheKey)(segment);
        const cacheKeyWithoutSearchParams = (0, _createroutercachekey.createRouterCacheKey)(segment, true);
        const cacheNode = childSegmentMap.get(cacheKey);
        if (!cacheNode) {
            continue;
        }
        const item = findHeadInCacheImpl(cacheNode, childParallelRoutes, keyPrefix + '/' + cacheKey, keyPrefix + '/' + cacheKeyWithoutSearchParams);
        if (item) {
            return item;
        }
    }
    return null;
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=find-head-in-cache.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/components/unresolved-thenable.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

/**
 * Create a "Thenable" that does not resolve. This is used to suspend indefinitely when data is not available yet.
 */ Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "unresolvedThenable", {
    enumerable: true,
    get: function() {
        return unresolvedThenable;
    }
});
const unresolvedThenable = {
    then: ()=>{}
};
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=unresolved-thenable.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/shared/lib/router/utils/path-has-prefix.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "pathHasPrefix", {
    enumerable: true,
    get: function() {
        return pathHasPrefix;
    }
});
const _parsepath = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/shared/lib/router/utils/parse-path.js [app-ssr] (ecmascript)");
function pathHasPrefix(path, prefix) {
    if (typeof path !== 'string') {
        return false;
    }
    const { pathname } = (0, _parsepath.parsePath)(path);
    return pathname === prefix || pathname.startsWith(prefix + '/');
} //# sourceMappingURL=path-has-prefix.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/has-base-path.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "hasBasePath", {
    enumerable: true,
    get: function() {
        return hasBasePath;
    }
});
const _pathhasprefix = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/shared/lib/router/utils/path-has-prefix.js [app-ssr] (ecmascript)");
const basePath = ("TURBOPACK compile-time value", "") || '';
function hasBasePath(path) {
    return (0, _pathhasprefix.pathHasPrefix)(path, basePath);
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=has-base-path.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/remove-base-path.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "removeBasePath", {
    enumerable: true,
    get: function() {
        return removeBasePath;
    }
});
const _hasbasepath = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/has-base-path.js [app-ssr] (ecmascript)");
const basePath = ("TURBOPACK compile-time value", "") || '';
function removeBasePath(path) {
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    // Can't trim the basePath if it has zero length!
    if (basePath.length === 0) return path;
    path = path.slice(basePath.length);
    if (!path.startsWith('/')) path = "/" + path;
    return path;
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=remove-base-path.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/components/nav-failure-handler.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    handleHardNavError: null,
    useNavFailureHandler: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    handleHardNavError: function() {
        return handleHardNavError;
    },
    useNavFailureHandler: function() {
        return useNavFailureHandler;
    }
});
const _react = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
const _createhreffromurl = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/create-href-from-url.js [app-ssr] (ecmascript)");
function handleHardNavError(error) {
    if (error && "undefined" !== 'undefined' && window.next.__pendingUrl && (0, _createhreffromurl.createHrefFromUrl)(new URL(window.location.href)) !== (0, _createhreffromurl.createHrefFromUrl)(window.next.__pendingUrl)) //TURBOPACK unreachable
    ;
    return false;
}
function useNavFailureHandler() {
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=nav-failure-handler.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/components/errors/graceful-degrade-boundary.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    GracefulDegradeBoundary: null,
    default: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    GracefulDegradeBoundary: function() {
        return GracefulDegradeBoundary;
    },
    default: function() {
        return _default;
    }
});
const _jsxruntime = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-runtime.js [app-ssr] (ecmascript)");
const _react = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
function getDomNodeAttributes(node) {
    const result = {};
    for(let i = 0; i < node.attributes.length; i++){
        const attr = node.attributes[i];
        result[attr.name] = attr.value;
    }
    return result;
}
class GracefulDegradeBoundary extends _react.Component {
    static getDerivedStateFromError(_) {
        return {
            hasError: true
        };
    }
    componentDidMount() {
        const htmlNode = this.htmlRef.current;
        if (this.state.hasError && htmlNode) {
            // Reapply the cached HTML attributes to the root element
            Object.entries(this.htmlAttributes).forEach((param)=>{
                let [key, value] = param;
                htmlNode.setAttribute(key, value);
            });
        }
    }
    render() {
        const { hasError } = this.state;
        // Cache the root HTML content on the first render
        if ("undefined" !== 'undefined' && !this.rootHtml) //TURBOPACK unreachable
        ;
        if (hasError) {
            // Render the current HTML content without hydration
            return /*#__PURE__*/ (0, _jsxruntime.jsx)("html", {
                ref: this.htmlRef,
                suppressHydrationWarning: true,
                dangerouslySetInnerHTML: {
                    __html: this.rootHtml
                }
            });
        }
        return this.props.children;
    }
    constructor(props){
        super(props);
        this.state = {
            hasError: false
        };
        this.rootHtml = '';
        this.htmlAttributes = {};
        this.htmlRef = /*#__PURE__*/ (0, _react.createRef)();
    }
}
const _default = GracefulDegradeBoundary;
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=graceful-degrade-boundary.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/components/navigation-untracked.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "useUntrackedPathname", {
    enumerable: true,
    get: function() {
        return useUntrackedPathname;
    }
});
const _react = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
const _hooksclientcontextsharedruntime = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/server/route-modules/app-page/vendored/contexts/hooks-client-context.js [app-ssr] (ecmascript)");
/**
 * This checks to see if the current render has any unknown route parameters.
 * It's used to trigger a different render path in the error boundary.
 *
 * @returns true if there are any unknown route parameters, false otherwise
 */ function hasFallbackRouteParams() {
    if ("TURBOPACK compile-time truthy", 1) {
        // AsyncLocalStorage should not be included in the client bundle.
        const { workUnitAsyncStorage } = __turbopack_context__.r("[externals]/next/dist/server/app-render/work-unit-async-storage.external.js [external] (next/dist/server/app-render/work-unit-async-storage.external.js, cjs)");
        const workUnitStore = workUnitAsyncStorage.getStore();
        if (!workUnitStore) return false;
        switch(workUnitStore.type){
            case 'prerender':
            case 'prerender-client':
            case 'prerender-ppr':
                const fallbackParams = workUnitStore.fallbackRouteParams;
                return fallbackParams ? fallbackParams.size > 0 : false;
            case 'prerender-legacy':
            case 'request':
            case 'prerender-runtime':
            case 'cache':
            case 'private-cache':
            case 'unstable-cache':
                break;
            default:
                workUnitStore;
        }
        return false;
    }
    //TURBOPACK unreachable
    ;
}
function useUntrackedPathname() {
    // If there are any unknown route parameters we would typically throw
    // an error, but this internal method allows us to return a null value instead
    // for components that do not propagate the pathname to the static shell (like
    // the error boundary).
    if (hasFallbackRouteParams()) {
        return null;
    }
    // This shouldn't cause any issues related to conditional rendering because
    // the environment will be consistent for the render.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return (0, _react.useContext)(_hooksclientcontextsharedruntime.PathnameContext);
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=navigation-untracked.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/components/handle-isr-error.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "HandleISRError", {
    enumerable: true,
    get: function() {
        return HandleISRError;
    }
});
const workAsyncStorage = ("TURBOPACK compile-time truthy", 1) ? __turbopack_context__.r("[externals]/next/dist/server/app-render/work-async-storage.external.js [external] (next/dist/server/app-render/work-async-storage.external.js, cjs)").workAsyncStorage : "TURBOPACK unreachable";
function HandleISRError(param) {
    let { error } = param;
    if (workAsyncStorage) {
        const store = workAsyncStorage.getStore();
        if ((store == null ? void 0 : store.isRevalidate) || (store == null ? void 0 : store.isStaticGeneration)) {
            console.error(error);
            throw error;
        }
    }
    return null;
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=handle-isr-error.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/components/error-boundary.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    ErrorBoundary: null,
    ErrorBoundaryHandler: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    ErrorBoundary: function() {
        return ErrorBoundary;
    },
    ErrorBoundaryHandler: function() {
        return ErrorBoundaryHandler;
    }
});
const _interop_require_default = __turbopack_context__.r("[project]/Projects/fmko/node_modules/@swc/helpers/cjs/_interop_require_default.cjs [app-ssr] (ecmascript)");
const _jsxruntime = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-runtime.js [app-ssr] (ecmascript)");
const _react = /*#__PURE__*/ _interop_require_default._(__turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)"));
const _navigationuntracked = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/navigation-untracked.js [app-ssr] (ecmascript)");
const _isnextroutererror = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/is-next-router-error.js [app-ssr] (ecmascript)");
const _navfailurehandler = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/nav-failure-handler.js [app-ssr] (ecmascript)");
const _handleisrerror = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/handle-isr-error.js [app-ssr] (ecmascript)");
const _isbot = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/shared/lib/router/utils/is-bot.js [app-ssr] (ecmascript)");
const isBotUserAgent = "undefined" !== 'undefined' && (0, _isbot.isBot)(window.navigator.userAgent);
class ErrorBoundaryHandler extends _react.default.Component {
    static getDerivedStateFromError(error) {
        if ((0, _isnextroutererror.isNextRouterError)(error)) {
            // Re-throw if an expected internal Next.js router error occurs
            // this means it should be handled by a different boundary (such as a NotFound boundary in a parent segment)
            throw error;
        }
        return {
            error
        };
    }
    static getDerivedStateFromProps(props, state) {
        const { error } = state;
        // if we encounter an error while
        // a navigation is pending we shouldn't render
        // the error boundary and instead should fallback
        // to a hard navigation to attempt recovering
        if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
        ;
        /**
     * Handles reset of the error boundary when a navigation happens.
     * Ensures the error boundary does not stay enabled when navigating to a new page.
     * Approach of setState in render is safe as it checks the previous pathname and then overrides
     * it as outlined in https://react.dev/reference/react/useState#storing-information-from-previous-renders
     */ if (props.pathname !== state.previousPathname && state.error) {
            return {
                error: null,
                previousPathname: props.pathname
            };
        }
        return {
            error: state.error,
            previousPathname: props.pathname
        };
    }
    // Explicit type is needed to avoid the generated `.d.ts` having a wide return type that could be specific to the `@types/react` version.
    render() {
        //When it's bot request, segment level error boundary will keep rendering the children,
        // the final error will be caught by the root error boundary and determine wether need to apply graceful degrade.
        if (this.state.error && !isBotUserAgent) {
            return /*#__PURE__*/ (0, _jsxruntime.jsxs)(_jsxruntime.Fragment, {
                children: [
                    /*#__PURE__*/ (0, _jsxruntime.jsx)(_handleisrerror.HandleISRError, {
                        error: this.state.error
                    }),
                    this.props.errorStyles,
                    this.props.errorScripts,
                    /*#__PURE__*/ (0, _jsxruntime.jsx)(this.props.errorComponent, {
                        error: this.state.error,
                        reset: this.reset
                    })
                ]
            });
        }
        return this.props.children;
    }
    constructor(props){
        super(props), this.reset = ()=>{
            this.setState({
                error: null
            });
        };
        this.state = {
            error: null,
            previousPathname: this.props.pathname
        };
    }
}
function ErrorBoundary(param) {
    let { errorComponent, errorStyles, errorScripts, children } = param;
    // When we're rendering the missing params shell, this will return null. This
    // is because we won't be rendering any not found boundaries or error
    // boundaries for the missing params shell. When this runs on the client
    // (where these errors can occur), we will get the correct pathname.
    const pathname = (0, _navigationuntracked.useUntrackedPathname)();
    if (errorComponent) {
        return /*#__PURE__*/ (0, _jsxruntime.jsx)(ErrorBoundaryHandler, {
            pathname: pathname,
            errorComponent: errorComponent,
            errorStyles: errorStyles,
            errorScripts: errorScripts,
            children: children
        });
    }
    return /*#__PURE__*/ (0, _jsxruntime.jsx)(_jsxruntime.Fragment, {
        children: children
    });
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=error-boundary.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/components/errors/root-error-boundary.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "default", {
    enumerable: true,
    get: function() {
        return RootErrorBoundary;
    }
});
const _interop_require_default = __turbopack_context__.r("[project]/Projects/fmko/node_modules/@swc/helpers/cjs/_interop_require_default.cjs [app-ssr] (ecmascript)");
const _jsxruntime = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-runtime.js [app-ssr] (ecmascript)");
const _react = /*#__PURE__*/ _interop_require_default._(__turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)"));
const _gracefuldegradeboundary = /*#__PURE__*/ _interop_require_default._(__turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/errors/graceful-degrade-boundary.js [app-ssr] (ecmascript)"));
const _errorboundary = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/error-boundary.js [app-ssr] (ecmascript)");
const _isbot = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/shared/lib/router/utils/is-bot.js [app-ssr] (ecmascript)");
const isBotUserAgent = "undefined" !== 'undefined' && (0, _isbot.isBot)(window.navigator.userAgent);
function RootErrorBoundary(param) {
    let { children, errorComponent, errorStyles, errorScripts } = param;
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    return /*#__PURE__*/ (0, _jsxruntime.jsx)(_errorboundary.ErrorBoundary, {
        errorComponent: errorComponent,
        errorStyles: errorStyles,
        errorScripts: errorScripts,
        children: children
    });
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=root-error-boundary.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/components/builtin/global-error.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, // supplied custom global error signatures.
"default", {
    enumerable: true,
    get: function() {
        return _default;
    }
});
const _jsxruntime = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-runtime.js [app-ssr] (ecmascript)");
const _handleisrerror = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/handle-isr-error.js [app-ssr] (ecmascript)");
const styles = {
    error: {
        // https://github.com/sindresorhus/modern-normalize/blob/main/modern-normalize.css#L38-L52
        fontFamily: 'system-ui,"Segoe UI",Roboto,Helvetica,Arial,sans-serif,"Apple Color Emoji","Segoe UI Emoji"',
        height: '100vh',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center'
    },
    text: {
        fontSize: '14px',
        fontWeight: 400,
        lineHeight: '28px',
        margin: '0 8px'
    }
};
function DefaultGlobalError(param) {
    let { error } = param;
    const digest = error == null ? void 0 : error.digest;
    return /*#__PURE__*/ (0, _jsxruntime.jsxs)("html", {
        id: "__next_error__",
        children: [
            /*#__PURE__*/ (0, _jsxruntime.jsx)("head", {}),
            /*#__PURE__*/ (0, _jsxruntime.jsxs)("body", {
                children: [
                    /*#__PURE__*/ (0, _jsxruntime.jsx)(_handleisrerror.HandleISRError, {
                        error: error
                    }),
                    /*#__PURE__*/ (0, _jsxruntime.jsx)("div", {
                        style: styles.error,
                        children: /*#__PURE__*/ (0, _jsxruntime.jsxs)("div", {
                            children: [
                                /*#__PURE__*/ (0, _jsxruntime.jsxs)("h2", {
                                    style: styles.text,
                                    children: [
                                        "Application error: a ",
                                        digest ? 'server' : 'client',
                                        "-side exception has occurred while loading ",
                                        window.location.hostname,
                                        " (see the",
                                        ' ',
                                        digest ? 'server logs' : 'browser console',
                                        " for more information)."
                                    ]
                                }),
                                digest ? /*#__PURE__*/ (0, _jsxruntime.jsx)("p", {
                                    style: styles.text,
                                    children: "Digest: " + digest
                                }) : null
                            ]
                        })
                    })
                ]
            })
        ]
    });
}
const _default = DefaultGlobalError;
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=global-error.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/lib/framework/boundary-components.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    MetadataBoundary: null,
    OutletBoundary: null,
    RootLayoutBoundary: null,
    ViewportBoundary: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    MetadataBoundary: function() {
        return MetadataBoundary;
    },
    OutletBoundary: function() {
        return OutletBoundary;
    },
    RootLayoutBoundary: function() {
        return RootLayoutBoundary;
    },
    ViewportBoundary: function() {
        return ViewportBoundary;
    }
});
const _boundaryconstants = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/lib/framework/boundary-constants.js [app-ssr] (ecmascript)");
// We use a namespace object to allow us to recover the name of the function
// at runtime even when production bundling/minification is used.
const NameSpace = {
    [_boundaryconstants.METADATA_BOUNDARY_NAME]: function({ children }) {
        return children;
    },
    [_boundaryconstants.VIEWPORT_BOUNDARY_NAME]: function({ children }) {
        return children;
    },
    [_boundaryconstants.OUTLET_BOUNDARY_NAME]: function({ children }) {
        return children;
    },
    [_boundaryconstants.ROOT_LAYOUT_BOUNDARY_NAME]: function({ children }) {
        return children;
    }
};
const MetadataBoundary = // so it retains the name inferred from the namespace object
NameSpace[_boundaryconstants.METADATA_BOUNDARY_NAME.slice(0)];
const ViewportBoundary = // so it retains the name inferred from the namespace object
NameSpace[_boundaryconstants.VIEWPORT_BOUNDARY_NAME.slice(0)];
const OutletBoundary = // so it retains the name inferred from the namespace object
NameSpace[_boundaryconstants.OUTLET_BOUNDARY_NAME.slice(0)];
const RootLayoutBoundary = // so it retains the name inferred from the namespace object
NameSpace[_boundaryconstants.ROOT_LAYOUT_BOUNDARY_NAME.slice(0)]; //# sourceMappingURL=boundary-components.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/compiled/strip-ansi/index.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {

(()=>{
    "use strict";
    var e = {
        511: (e)=>{
            e.exports = ({ onlyFirst: e = false } = {})=>{
                const r = [
                    "[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)",
                    "(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))"
                ].join("|");
                return new RegExp(r, e ? undefined : "g");
            };
        },
        532: (e, r, _)=>{
            const t = _(511);
            e.exports = (e)=>typeof e === "string" ? e.replace(t(), "") : e;
        }
    };
    var r = {};
    function __nccwpck_require__(_) {
        var t = r[_];
        if (t !== undefined) {
            return t.exports;
        }
        var a = r[_] = {
            exports: {}
        };
        var n = true;
        try {
            e[_](a, a.exports, __nccwpck_require__);
            n = false;
        } finally{
            if (n) delete r[_];
        }
        return a.exports;
    }
    if (typeof __nccwpck_require__ !== "undefined") __nccwpck_require__.ab = ("TURBOPACK compile-time value", "/ROOT/Projects/fmko/node_modules/next/dist/compiled/strip-ansi") + "/";
    var _ = __nccwpck_require__(532);
    module.exports = _;
})();
}),
"[project]/Projects/fmko/node_modules/next/dist/shared/lib/format-webpack-messages.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

/**
MIT License

Copyright (c) 2015-present, Facebook, Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/ Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "default", {
    enumerable: true,
    get: function() {
        return formatWebpackMessages;
    }
});
const _interop_require_default = __turbopack_context__.r("[project]/Projects/fmko/node_modules/@swc/helpers/cjs/_interop_require_default.cjs [app-ssr] (ecmascript)");
const _stripansi = /*#__PURE__*/ _interop_require_default._(__turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/compiled/strip-ansi/index.js [app-ssr] (ecmascript)"));
// This file is based on https://github.com/facebook/create-react-app/blob/7b1a32be6ec9f99a6c9a3c66813f3ac09c4736b9/packages/react-dev-utils/formatWebpackMessages.js
// It's been edited to remove chalk and CRA-specific logic
const friendlySyntaxErrorLabel = 'Syntax error:';
const WEBPACK_BREAKING_CHANGE_POLYFILLS = '\n\nBREAKING CHANGE: webpack < 5 used to include polyfills for node.js core modules by default.';
function isLikelyASyntaxError(message) {
    return (0, _stripansi.default)(message).includes(friendlySyntaxErrorLabel);
}
let hadMissingSassError = false;
// Cleans up webpack error messages.
function formatMessage(message, verbose, importTraceNote) {
    // TODO: Replace this once webpack 5 is stable
    if (typeof message === 'object' && message.message) {
        const filteredModuleTrace = message.moduleTrace && message.moduleTrace.filter((trace)=>!/next-(middleware|client-pages|route|edge-function)-loader\.js/.test(trace.originName));
        let body = message.message;
        const breakingChangeIndex = body.indexOf(WEBPACK_BREAKING_CHANGE_POLYFILLS);
        if (breakingChangeIndex >= 0) {
            body = body.slice(0, breakingChangeIndex);
        }
        message = (message.moduleName ? (0, _stripansi.default)(message.moduleName) + '\n' : '') + (message.file ? (0, _stripansi.default)(message.file) + '\n' : '') + body + (message.details && verbose ? '\n' + message.details : '') + (filteredModuleTrace && filteredModuleTrace.length ? (importTraceNote || '\n\nImport trace for requested module:') + filteredModuleTrace.map((trace)=>"\n" + trace.moduleName).join('') : '') + (message.stack && verbose ? '\n' + message.stack : '');
    }
    let lines = message.split('\n');
    // Strip Webpack-added headers off errors/warnings
    // https://github.com/webpack/webpack/blob/master/lib/ModuleError.js
    lines = lines.filter((line)=>!/Module [A-z ]+\(from/.test(line));
    // Transform parsing error into syntax error
    // TODO: move this to our ESLint formatter?
    lines = lines.map((line)=>{
        const parsingError = /Line (\d+):(?:(\d+):)?\s*Parsing error: (.+)$/.exec(line);
        if (!parsingError) {
            return line;
        }
        const [, errorLine, errorColumn, errorMessage] = parsingError;
        return friendlySyntaxErrorLabel + " " + errorMessage + " (" + errorLine + ":" + errorColumn + ")";
    });
    message = lines.join('\n');
    // Smoosh syntax errors (commonly found in CSS)
    message = message.replace(/SyntaxError\s+\((\d+):(\d+)\)\s*(.+?)\n/g, "" + friendlySyntaxErrorLabel + " $3 ($1:$2)\n");
    // Clean up export errors
    message = message.replace(/^.*export '(.+?)' was not found in '(.+?)'.*$/gm, "Attempted import error: '$1' is not exported from '$2'.");
    message = message.replace(/^.*export 'default' \(imported as '(.+?)'\) was not found in '(.+?)'.*$/gm, "Attempted import error: '$2' does not contain a default export (imported as '$1').");
    message = message.replace(/^.*export '(.+?)' \(imported as '(.+?)'\) was not found in '(.+?)'.*$/gm, "Attempted import error: '$1' is not exported from '$3' (imported as '$2').");
    lines = message.split('\n');
    // Remove leading newline
    if (lines.length > 2 && lines[1].trim() === '') {
        lines.splice(1, 1);
    }
    // Cleans up verbose "module not found" messages for files and packages.
    if (lines[1] && lines[1].startsWith('Module not found: ')) {
        lines = [
            lines[0],
            lines[1].replace('Error: ', '').replace('Module not found: Cannot find file:', 'Cannot find file:'),
            ...lines.slice(2)
        ];
    }
    // Add helpful message for users trying to use Sass for the first time
    if (lines[1] && lines[1].match(/Cannot find module.+sass/)) {
        // ./file.module.scss (<<loader info>>) => ./file.module.scss
        const firstLine = lines[0].split('!');
        lines[0] = firstLine[firstLine.length - 1];
        lines[1] = "To use Next.js' built-in Sass support, you first need to install `sass`.\n";
        lines[1] += 'Run `npm i sass` or `yarn add sass` inside your workspace.\n';
        lines[1] += '\nLearn more: https://nextjs.org/docs/messages/install-sass';
        // dispose of unhelpful stack trace
        lines = lines.slice(0, 2);
        hadMissingSassError = true;
    } else if (hadMissingSassError && message.match(/(sass-loader|resolve-url-loader: CSS error)/)) {
        // dispose of unhelpful stack trace following missing sass module
        lines = [];
    }
    if (!verbose) {
        message = lines.join('\n');
        // Internal stacks are generally useless so we strip them... with the
        // exception of stacks containing `webpack:` because they're normally
        // from user code generated by Webpack. For more information see
        // https://github.com/facebook/create-react-app/pull/1050
        message = message.replace(/^\s*at\s((?!webpack:).)*:\d+:\d+[\s)]*(\n|$)/gm, '') // at ... ...:x:y
        ;
        message = message.replace(/^\s*at\s<anonymous>(\n|$)/gm, '') // at <anonymous>
        ;
        message = message.replace(/File was processed with these loaders:\n(.+[\\/](next[\\/]dist[\\/].+|@next[\\/]react-refresh-utils[\\/]loader)\.js\n)*You may need an additional loader to handle the result of these loaders.\n/g, '');
        lines = message.split('\n');
    }
    // Remove duplicated newlines
    lines = lines.filter((line, index, arr)=>index === 0 || line.trim() !== '' || line.trim() !== arr[index - 1].trim());
    // Reassemble the message
    message = lines.join('\n');
    return message.trim();
}
function formatWebpackMessages(json, verbose) {
    const formattedErrors = json.errors.map((message)=>{
        const isUnknownNextFontError = message.message.includes('An error occurred in `next/font`.');
        return formatMessage(message, isUnknownNextFontError || verbose);
    });
    const formattedWarnings = json.warnings.map((message)=>{
        return formatMessage(message, verbose);
    });
    // Reorder errors to put the most relevant ones first.
    let reactServerComponentsError = -1;
    for(let i = 0; i < formattedErrors.length; i++){
        const error = formattedErrors[i];
        if (error.includes('ReactServerComponentsError')) {
            reactServerComponentsError = i;
            break;
        }
    }
    // Move the reactServerComponentsError to the top if it exists
    if (reactServerComponentsError !== -1) {
        const error = formattedErrors.splice(reactServerComponentsError, 1);
        formattedErrors.unshift(error[0]);
    }
    const result = {
        ...json,
        errors: formattedErrors,
        warnings: formattedWarnings
    };
    if (!verbose && result.errors.some(isLikelyASyntaxError)) {
        // If there are any syntax errors, show just them.
        result.errors = result.errors.filter(isLikelyASyntaxError);
        result.warnings = [];
    }
    return result;
} //# sourceMappingURL=format-webpack-messages.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/dev/hot-reloader/shared.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    REACT_REFRESH_FULL_RELOAD: null,
    REACT_REFRESH_FULL_RELOAD_FROM_ERROR: null,
    reportInvalidHmrMessage: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    REACT_REFRESH_FULL_RELOAD: function() {
        return REACT_REFRESH_FULL_RELOAD;
    },
    REACT_REFRESH_FULL_RELOAD_FROM_ERROR: function() {
        return REACT_REFRESH_FULL_RELOAD_FROM_ERROR;
    },
    reportInvalidHmrMessage: function() {
        return reportInvalidHmrMessage;
    }
});
const REACT_REFRESH_FULL_RELOAD = '[Fast Refresh] performing full reload\n\n' + "Fast Refresh will perform a full reload when you edit a file that's imported by modules outside of the React rendering tree.\n" + 'You might have a file which exports a React component but also exports a value that is imported by a non-React component file.\n' + 'Consider migrating the non-React component export to a separate file and importing it into both files.\n\n' + 'It is also possible the parent component of the component you edited is a class component, which disables Fast Refresh.\n' + 'Fast Refresh requires at least one parent function component in your React tree.';
const REACT_REFRESH_FULL_RELOAD_FROM_ERROR = '[Fast Refresh] performing full reload because your application had an unrecoverable error';
function reportInvalidHmrMessage(message, err) {
    console.warn('[HMR] Invalid message: ' + JSON.stringify(message) + '\n' + (err instanceof Error && (err == null ? void 0 : err.stack) || ''));
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=shared.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/shared/lib/is-plain-object.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    getObjectClassLabel: null,
    isPlainObject: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    getObjectClassLabel: function() {
        return getObjectClassLabel;
    },
    isPlainObject: function() {
        return isPlainObject;
    }
});
function getObjectClassLabel(value) {
    return Object.prototype.toString.call(value);
}
function isPlainObject(value) {
    if (getObjectClassLabel(value) !== '[object Object]') {
        return false;
    }
    const prototype = Object.getPrototypeOf(value);
    /**
   * this used to be previously:
   *
   * `return prototype === null || prototype === Object.prototype`
   *
   * but Edge Runtime expose Object from vm, being that kind of type-checking wrongly fail.
   *
   * It was changed to the current implementation since it's resilient to serialization.
   */ return prototype === null || prototype.hasOwnProperty('isPrototypeOf');
} //# sourceMappingURL=is-plain-object.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/lib/is-error.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    default: null,
    getProperError: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    /**
 * Checks whether the given value is a NextError.
 * This can be used to print a more detailed error message with properties like `code` & `digest`.
 */ default: function() {
        return isError;
    },
    getProperError: function() {
        return getProperError;
    }
});
const _isplainobject = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/shared/lib/is-plain-object.js [app-ssr] (ecmascript)");
function isError(err) {
    return typeof err === 'object' && err !== null && 'name' in err && 'message' in err;
}
function safeStringify(obj) {
    const seen = new WeakSet();
    return JSON.stringify(obj, (_key, value)=>{
        // If value is an object and already seen, replace with "[Circular]"
        if (typeof value === 'object' && value !== null) {
            if (seen.has(value)) {
                return '[Circular]';
            }
            seen.add(value);
        }
        return value;
    });
}
function getProperError(err) {
    if (isError(err)) {
        return err;
    }
    if ("TURBOPACK compile-time truthy", 1) {
        // provide better error for case where `throw undefined`
        // is called in development
        if (typeof err === 'undefined') {
            return Object.defineProperty(new Error('An undefined error was thrown, ' + 'see here for more info: https://nextjs.org/docs/messages/threw-undefined'), "__NEXT_ERROR_CODE", {
                value: "E98",
                enumerable: false,
                configurable: true
            });
        }
        if (err === null) {
            return Object.defineProperty(new Error('A null error was thrown, ' + 'see here for more info: https://nextjs.org/docs/messages/threw-undefined'), "__NEXT_ERROR_CODE", {
                value: "E336",
                enumerable: false,
                configurable: true
            });
        }
    }
    return Object.defineProperty(new Error((0, _isplainobject.isPlainObject)(err) ? safeStringify(err) : err + ''), "__NEXT_ERROR_CODE", {
        value: "E394",
        enumerable: false,
        configurable: true
    });
} //# sourceMappingURL=is-error.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/lib/console.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    formatConsoleArgs: null,
    parseConsoleArgs: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    formatConsoleArgs: function() {
        return formatConsoleArgs;
    },
    parseConsoleArgs: function() {
        return parseConsoleArgs;
    }
});
const _interop_require_default = __turbopack_context__.r("[project]/Projects/fmko/node_modules/@swc/helpers/cjs/_interop_require_default.cjs [app-ssr] (ecmascript)");
const _iserror = /*#__PURE__*/ _interop_require_default._(__turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/lib/is-error.js [app-ssr] (ecmascript)"));
function formatObject(arg, depth) {
    switch(typeof arg){
        case 'object':
            if (arg === null) {
                return 'null';
            } else if (Array.isArray(arg)) {
                let result = '[';
                if (depth < 1) {
                    for(let i = 0; i < arg.length; i++){
                        if (result !== '[') {
                            result += ',';
                        }
                        if (Object.prototype.hasOwnProperty.call(arg, i)) {
                            result += formatObject(arg[i], depth + 1);
                        }
                    }
                } else {
                    result += arg.length > 0 ? '...' : '';
                }
                result += ']';
                return result;
            } else if (arg instanceof Error) {
                return arg + '';
            } else {
                const keys = Object.keys(arg);
                let result = '{';
                if (depth < 1) {
                    for(let i = 0; i < keys.length; i++){
                        const key = keys[i];
                        const desc = Object.getOwnPropertyDescriptor(arg, 'key');
                        if (desc && !desc.get && !desc.set) {
                            const jsonKey = JSON.stringify(key);
                            if (jsonKey !== '"' + key + '"') {
                                result += jsonKey + ': ';
                            } else {
                                result += key + ': ';
                            }
                            result += formatObject(desc.value, depth + 1);
                        }
                    }
                } else {
                    result += keys.length > 0 ? '...' : '';
                }
                result += '}';
                return result;
            }
        case 'string':
            return JSON.stringify(arg);
        case 'number':
        case 'bigint':
        case 'boolean':
        case 'symbol':
        case 'undefined':
        case 'function':
        default:
            return String(arg);
    }
}
function formatConsoleArgs(args) {
    let message;
    let idx;
    if (typeof args[0] === 'string') {
        message = args[0];
        idx = 1;
    } else {
        message = '';
        idx = 0;
    }
    let result = '';
    let startQuote = false;
    for(let i = 0; i < message.length; ++i){
        const char = message[i];
        if (char !== '%' || i === message.length - 1 || idx >= args.length) {
            result += char;
            continue;
        }
        const code = message[++i];
        switch(code){
            case 'c':
                {
                    // TODO: We should colorize with HTML instead of turning into a string.
                    // Ignore for now.
                    result = startQuote ? "" + result + "]" : "[" + result;
                    startQuote = !startQuote;
                    idx++;
                    break;
                }
            case 'O':
            case 'o':
                {
                    result += formatObject(args[idx++], 0);
                    break;
                }
            case 'd':
            case 'i':
                {
                    result += parseInt(args[idx++], 10);
                    break;
                }
            case 'f':
                {
                    result += parseFloat(args[idx++]);
                    break;
                }
            case 's':
                {
                    result += String(args[idx++]);
                    break;
                }
            default:
                result += '%' + code;
        }
    }
    for(; idx < args.length; idx++){
        result += (idx > 0 ? ' ' : '') + formatObject(args[idx], 0);
    }
    return result;
}
function parseConsoleArgs(args) {
    // See
    // https://github.com/facebook/react/blob/65a56d0e99261481c721334a3ec4561d173594cd/packages/react-devtools-shared/src/backend/flight/renderer.js#L88-L93
    //
    // Logs replayed from the server look like this:
    // [
    //   "%c%s%c%o\n\n%s\n\n%s\n",
    //   "background: #e6e6e6; ...",
    //   " Server ", // can also be e.g. " Prerender "
    //   "",
    //   Error,
    //   "The above error occurred in the <Page> component.",
    //   ...
    // ]
    if (args.length > 3 && typeof args[0] === 'string' && args[0].startsWith('%c%s%c') && typeof args[1] === 'string' && typeof args[2] === 'string' && typeof args[3] === 'string') {
        const environmentName = args[2];
        const maybeError = args[4];
        return {
            environmentName: environmentName.trim(),
            error: (0, _iserror.default)(maybeError) ? maybeError : null
        };
    }
    return {
        environmentName: null,
        error: null
    };
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=console.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/next-devtools/shared/console-error.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

// To distinguish from React error.digest, we use a different symbol here to determine if the error is from console.error or unhandled promise rejection.
Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    createConsoleError: null,
    isConsoleError: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    createConsoleError: function() {
        return createConsoleError;
    },
    isConsoleError: function() {
        return isConsoleError;
    }
});
const digestSym = Symbol.for('next.console.error.digest');
function createConsoleError(message, environmentName) {
    const error = typeof message === 'string' ? Object.defineProperty(new Error(message), "__NEXT_ERROR_CODE", {
        value: "E394",
        enumerable: false,
        configurable: true
    }) : message;
    error[digestSym] = 'NEXT_CONSOLE_ERROR';
    if (environmentName && !error.environmentName) {
        error.environmentName = environmentName;
    }
    return error;
}
const isConsoleError = (error)=>{
    return error && error[digestSym] === 'NEXT_CONSOLE_ERROR';
};
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=console-error.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/next-devtools/userspace/app/errors/stitched-error.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    coerceError: null,
    decorateDevError: null,
    getOwnerStack: null,
    setOwnerStack: null,
    setOwnerStackIfAvailable: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    coerceError: function() {
        return coerceError;
    },
    decorateDevError: function() {
        return decorateDevError;
    },
    getOwnerStack: function() {
        return getOwnerStack;
    },
    setOwnerStack: function() {
        return setOwnerStack;
    },
    setOwnerStackIfAvailable: function() {
        return setOwnerStackIfAvailable;
    }
});
const _interop_require_default = __turbopack_context__.r("[project]/Projects/fmko/node_modules/@swc/helpers/cjs/_interop_require_default.cjs [app-ssr] (ecmascript)");
const _react = /*#__PURE__*/ _interop_require_default._(__turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)"));
const _iserror = /*#__PURE__*/ _interop_require_default._(__turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/lib/is-error.js [app-ssr] (ecmascript)"));
const ownerStacks = new WeakMap();
function getOwnerStack(error) {
    return ownerStacks.get(error);
}
function setOwnerStack(error, stack) {
    ownerStacks.set(error, stack);
}
function coerceError(value) {
    return (0, _iserror.default)(value) ? value : Object.defineProperty(new Error('' + value), "__NEXT_ERROR_CODE", {
        value: "E394",
        enumerable: false,
        configurable: true
    });
}
function setOwnerStackIfAvailable(error) {
    // React 18 and prod does not have `captureOwnerStack`
    if ('captureOwnerStack' in _react.default) {
        setOwnerStack(error, _react.default.captureOwnerStack());
    }
}
function decorateDevError(thrownValue) {
    const error = coerceError(thrownValue);
    setOwnerStackIfAvailable(error);
    return error;
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=stitched-error.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/compiled/safe-stable-stringify/index.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {

(function() {
    "use strict";
    var e = {
        879: function(e, t) {
            const { hasOwnProperty: n } = Object.prototype;
            const r = configure();
            r.configure = configure;
            r.stringify = r;
            r.default = r;
            t.stringify = r;
            t.configure = configure;
            e.exports = r;
            const i = /[\u0000-\u001f\u0022\u005c\ud800-\udfff]/;
            function strEscape(e) {
                if (e.length < 5e3 && !i.test(e)) {
                    return `"${e}"`;
                }
                return JSON.stringify(e);
            }
            function sort(e, t) {
                if (e.length > 200 || t) {
                    return e.sort(t);
                }
                for(let t = 1; t < e.length; t++){
                    const n = e[t];
                    let r = t;
                    while(r !== 0 && e[r - 1] > n){
                        e[r] = e[r - 1];
                        r--;
                    }
                    e[r] = n;
                }
                return e;
            }
            const f = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Object.getPrototypeOf(new Int8Array)), Symbol.toStringTag).get;
            function isTypedArrayWithEntries(e) {
                return f.call(e) !== undefined && e.length !== 0;
            }
            function stringifyTypedArray(e, t, n) {
                if (e.length < n) {
                    n = e.length;
                }
                const r = t === "," ? "" : " ";
                let i = `"0":${r}${e[0]}`;
                for(let f = 1; f < n; f++){
                    i += `${t}"${f}":${r}${e[f]}`;
                }
                return i;
            }
            function getCircularValueOption(e) {
                if (n.call(e, "circularValue")) {
                    const t = e.circularValue;
                    if (typeof t === "string") {
                        return `"${t}"`;
                    }
                    if (t == null) {
                        return t;
                    }
                    if (t === Error || t === TypeError) {
                        return {
                            toString () {
                                throw new TypeError("Converting circular structure to JSON");
                            }
                        };
                    }
                    throw new TypeError('The "circularValue" argument must be of type string or the value null or undefined');
                }
                return '"[Circular]"';
            }
            function getDeterministicOption(e) {
                let t;
                if (n.call(e, "deterministic")) {
                    t = e.deterministic;
                    if (typeof t !== "boolean" && typeof t !== "function") {
                        throw new TypeError('The "deterministic" argument must be of type boolean or comparator function');
                    }
                }
                return t === undefined ? true : t;
            }
            function getBooleanOption(e, t) {
                let r;
                if (n.call(e, t)) {
                    r = e[t];
                    if (typeof r !== "boolean") {
                        throw new TypeError(`The "${t}" argument must be of type boolean`);
                    }
                }
                return r === undefined ? true : r;
            }
            function getPositiveIntegerOption(e, t) {
                let r;
                if (n.call(e, t)) {
                    r = e[t];
                    if (typeof r !== "number") {
                        throw new TypeError(`The "${t}" argument must be of type number`);
                    }
                    if (!Number.isInteger(r)) {
                        throw new TypeError(`The "${t}" argument must be an integer`);
                    }
                    if (r < 1) {
                        throw new RangeError(`The "${t}" argument must be >= 1`);
                    }
                }
                return r === undefined ? Infinity : r;
            }
            function getItemCount(e) {
                if (e === 1) {
                    return "1 item";
                }
                return `${e} items`;
            }
            function getUniqueReplacerSet(e) {
                const t = new Set;
                for (const n of e){
                    if (typeof n === "string" || typeof n === "number") {
                        t.add(String(n));
                    }
                }
                return t;
            }
            function getStrictOption(e) {
                if (n.call(e, "strict")) {
                    const t = e.strict;
                    if (typeof t !== "boolean") {
                        throw new TypeError('The "strict" argument must be of type boolean');
                    }
                    if (t) {
                        return (e)=>{
                            let t = `Object can not safely be stringified. Received type ${typeof e}`;
                            if (typeof e !== "function") t += ` (${e.toString()})`;
                            throw new Error(t);
                        };
                    }
                }
            }
            function configure(e) {
                e = {
                    ...e
                };
                const t = getStrictOption(e);
                if (t) {
                    if (e.bigint === undefined) {
                        e.bigint = false;
                    }
                    if (!("circularValue" in e)) {
                        e.circularValue = Error;
                    }
                }
                const n = getCircularValueOption(e);
                const r = getBooleanOption(e, "bigint");
                const i = getDeterministicOption(e);
                const f = typeof i === "function" ? i : undefined;
                const u = getPositiveIntegerOption(e, "maximumDepth");
                const o = getPositiveIntegerOption(e, "maximumBreadth");
                function stringifyFnReplacer(e, s, l, c, a, g) {
                    let p = s[e];
                    if (typeof p === "object" && p !== null && typeof p.toJSON === "function") {
                        p = p.toJSON(e);
                    }
                    p = c.call(s, e, p);
                    switch(typeof p){
                        case "string":
                            return strEscape(p);
                        case "object":
                            {
                                if (p === null) {
                                    return "null";
                                }
                                if (l.indexOf(p) !== -1) {
                                    return n;
                                }
                                let e = "";
                                let t = ",";
                                const r = g;
                                if (Array.isArray(p)) {
                                    if (p.length === 0) {
                                        return "[]";
                                    }
                                    if (u < l.length + 1) {
                                        return '"[Array]"';
                                    }
                                    l.push(p);
                                    if (a !== "") {
                                        g += a;
                                        e += `\n${g}`;
                                        t = `,\n${g}`;
                                    }
                                    const n = Math.min(p.length, o);
                                    let i = 0;
                                    for(; i < n - 1; i++){
                                        const n = stringifyFnReplacer(String(i), p, l, c, a, g);
                                        e += n !== undefined ? n : "null";
                                        e += t;
                                    }
                                    const f = stringifyFnReplacer(String(i), p, l, c, a, g);
                                    e += f !== undefined ? f : "null";
                                    if (p.length - 1 > o) {
                                        const n = p.length - o - 1;
                                        e += `${t}"... ${getItemCount(n)} not stringified"`;
                                    }
                                    if (a !== "") {
                                        e += `\n${r}`;
                                    }
                                    l.pop();
                                    return `[${e}]`;
                                }
                                let s = Object.keys(p);
                                const y = s.length;
                                if (y === 0) {
                                    return "{}";
                                }
                                if (u < l.length + 1) {
                                    return '"[Object]"';
                                }
                                let d = "";
                                let h = "";
                                if (a !== "") {
                                    g += a;
                                    t = `,\n${g}`;
                                    d = " ";
                                }
                                const $ = Math.min(y, o);
                                if (i && !isTypedArrayWithEntries(p)) {
                                    s = sort(s, f);
                                }
                                l.push(p);
                                for(let n = 0; n < $; n++){
                                    const r = s[n];
                                    const i = stringifyFnReplacer(r, p, l, c, a, g);
                                    if (i !== undefined) {
                                        e += `${h}${strEscape(r)}:${d}${i}`;
                                        h = t;
                                    }
                                }
                                if (y > o) {
                                    const n = y - o;
                                    e += `${h}"...":${d}"${getItemCount(n)} not stringified"`;
                                    h = t;
                                }
                                if (a !== "" && h.length > 1) {
                                    e = `\n${g}${e}\n${r}`;
                                }
                                l.pop();
                                return `{${e}}`;
                            }
                        case "number":
                            return isFinite(p) ? String(p) : t ? t(p) : "null";
                        case "boolean":
                            return p === true ? "true" : "false";
                        case "undefined":
                            return undefined;
                        case "bigint":
                            if (r) {
                                return String(p);
                            }
                        default:
                            return t ? t(p) : undefined;
                    }
                }
                function stringifyArrayReplacer(e, i, f, s, l, c) {
                    if (typeof i === "object" && i !== null && typeof i.toJSON === "function") {
                        i = i.toJSON(e);
                    }
                    switch(typeof i){
                        case "string":
                            return strEscape(i);
                        case "object":
                            {
                                if (i === null) {
                                    return "null";
                                }
                                if (f.indexOf(i) !== -1) {
                                    return n;
                                }
                                const e = c;
                                let t = "";
                                let r = ",";
                                if (Array.isArray(i)) {
                                    if (i.length === 0) {
                                        return "[]";
                                    }
                                    if (u < f.length + 1) {
                                        return '"[Array]"';
                                    }
                                    f.push(i);
                                    if (l !== "") {
                                        c += l;
                                        t += `\n${c}`;
                                        r = `,\n${c}`;
                                    }
                                    const n = Math.min(i.length, o);
                                    let a = 0;
                                    for(; a < n - 1; a++){
                                        const e = stringifyArrayReplacer(String(a), i[a], f, s, l, c);
                                        t += e !== undefined ? e : "null";
                                        t += r;
                                    }
                                    const g = stringifyArrayReplacer(String(a), i[a], f, s, l, c);
                                    t += g !== undefined ? g : "null";
                                    if (i.length - 1 > o) {
                                        const e = i.length - o - 1;
                                        t += `${r}"... ${getItemCount(e)} not stringified"`;
                                    }
                                    if (l !== "") {
                                        t += `\n${e}`;
                                    }
                                    f.pop();
                                    return `[${t}]`;
                                }
                                f.push(i);
                                let a = "";
                                if (l !== "") {
                                    c += l;
                                    r = `,\n${c}`;
                                    a = " ";
                                }
                                let g = "";
                                for (const e of s){
                                    const n = stringifyArrayReplacer(e, i[e], f, s, l, c);
                                    if (n !== undefined) {
                                        t += `${g}${strEscape(e)}:${a}${n}`;
                                        g = r;
                                    }
                                }
                                if (l !== "" && g.length > 1) {
                                    t = `\n${c}${t}\n${e}`;
                                }
                                f.pop();
                                return `{${t}}`;
                            }
                        case "number":
                            return isFinite(i) ? String(i) : t ? t(i) : "null";
                        case "boolean":
                            return i === true ? "true" : "false";
                        case "undefined":
                            return undefined;
                        case "bigint":
                            if (r) {
                                return String(i);
                            }
                        default:
                            return t ? t(i) : undefined;
                    }
                }
                function stringifyIndent(e, s, l, c, a) {
                    switch(typeof s){
                        case "string":
                            return strEscape(s);
                        case "object":
                            {
                                if (s === null) {
                                    return "null";
                                }
                                if (typeof s.toJSON === "function") {
                                    s = s.toJSON(e);
                                    if (typeof s !== "object") {
                                        return stringifyIndent(e, s, l, c, a);
                                    }
                                    if (s === null) {
                                        return "null";
                                    }
                                }
                                if (l.indexOf(s) !== -1) {
                                    return n;
                                }
                                const t = a;
                                if (Array.isArray(s)) {
                                    if (s.length === 0) {
                                        return "[]";
                                    }
                                    if (u < l.length + 1) {
                                        return '"[Array]"';
                                    }
                                    l.push(s);
                                    a += c;
                                    let e = `\n${a}`;
                                    const n = `,\n${a}`;
                                    const r = Math.min(s.length, o);
                                    let i = 0;
                                    for(; i < r - 1; i++){
                                        const t = stringifyIndent(String(i), s[i], l, c, a);
                                        e += t !== undefined ? t : "null";
                                        e += n;
                                    }
                                    const f = stringifyIndent(String(i), s[i], l, c, a);
                                    e += f !== undefined ? f : "null";
                                    if (s.length - 1 > o) {
                                        const t = s.length - o - 1;
                                        e += `${n}"... ${getItemCount(t)} not stringified"`;
                                    }
                                    e += `\n${t}`;
                                    l.pop();
                                    return `[${e}]`;
                                }
                                let r = Object.keys(s);
                                const g = r.length;
                                if (g === 0) {
                                    return "{}";
                                }
                                if (u < l.length + 1) {
                                    return '"[Object]"';
                                }
                                a += c;
                                const p = `,\n${a}`;
                                let y = "";
                                let d = "";
                                let h = Math.min(g, o);
                                if (isTypedArrayWithEntries(s)) {
                                    y += stringifyTypedArray(s, p, o);
                                    r = r.slice(s.length);
                                    h -= s.length;
                                    d = p;
                                }
                                if (i) {
                                    r = sort(r, f);
                                }
                                l.push(s);
                                for(let e = 0; e < h; e++){
                                    const t = r[e];
                                    const n = stringifyIndent(t, s[t], l, c, a);
                                    if (n !== undefined) {
                                        y += `${d}${strEscape(t)}: ${n}`;
                                        d = p;
                                    }
                                }
                                if (g > o) {
                                    const e = g - o;
                                    y += `${d}"...": "${getItemCount(e)} not stringified"`;
                                    d = p;
                                }
                                if (d !== "") {
                                    y = `\n${a}${y}\n${t}`;
                                }
                                l.pop();
                                return `{${y}}`;
                            }
                        case "number":
                            return isFinite(s) ? String(s) : t ? t(s) : "null";
                        case "boolean":
                            return s === true ? "true" : "false";
                        case "undefined":
                            return undefined;
                        case "bigint":
                            if (r) {
                                return String(s);
                            }
                        default:
                            return t ? t(s) : undefined;
                    }
                }
                function stringifySimple(e, s, l) {
                    switch(typeof s){
                        case "string":
                            return strEscape(s);
                        case "object":
                            {
                                if (s === null) {
                                    return "null";
                                }
                                if (typeof s.toJSON === "function") {
                                    s = s.toJSON(e);
                                    if (typeof s !== "object") {
                                        return stringifySimple(e, s, l);
                                    }
                                    if (s === null) {
                                        return "null";
                                    }
                                }
                                if (l.indexOf(s) !== -1) {
                                    return n;
                                }
                                let t = "";
                                const r = s.length !== undefined;
                                if (r && Array.isArray(s)) {
                                    if (s.length === 0) {
                                        return "[]";
                                    }
                                    if (u < l.length + 1) {
                                        return '"[Array]"';
                                    }
                                    l.push(s);
                                    const e = Math.min(s.length, o);
                                    let n = 0;
                                    for(; n < e - 1; n++){
                                        const e = stringifySimple(String(n), s[n], l);
                                        t += e !== undefined ? e : "null";
                                        t += ",";
                                    }
                                    const r = stringifySimple(String(n), s[n], l);
                                    t += r !== undefined ? r : "null";
                                    if (s.length - 1 > o) {
                                        const e = s.length - o - 1;
                                        t += `,"... ${getItemCount(e)} not stringified"`;
                                    }
                                    l.pop();
                                    return `[${t}]`;
                                }
                                let c = Object.keys(s);
                                const a = c.length;
                                if (a === 0) {
                                    return "{}";
                                }
                                if (u < l.length + 1) {
                                    return '"[Object]"';
                                }
                                let g = "";
                                let p = Math.min(a, o);
                                if (r && isTypedArrayWithEntries(s)) {
                                    t += stringifyTypedArray(s, ",", o);
                                    c = c.slice(s.length);
                                    p -= s.length;
                                    g = ",";
                                }
                                if (i) {
                                    c = sort(c, f);
                                }
                                l.push(s);
                                for(let e = 0; e < p; e++){
                                    const n = c[e];
                                    const r = stringifySimple(n, s[n], l);
                                    if (r !== undefined) {
                                        t += `${g}${strEscape(n)}:${r}`;
                                        g = ",";
                                    }
                                }
                                if (a > o) {
                                    const e = a - o;
                                    t += `${g}"...":"${getItemCount(e)} not stringified"`;
                                }
                                l.pop();
                                return `{${t}}`;
                            }
                        case "number":
                            return isFinite(s) ? String(s) : t ? t(s) : "null";
                        case "boolean":
                            return s === true ? "true" : "false";
                        case "undefined":
                            return undefined;
                        case "bigint":
                            if (r) {
                                return String(s);
                            }
                        default:
                            return t ? t(s) : undefined;
                    }
                }
                function stringify(e, t, n) {
                    if (arguments.length > 1) {
                        let r = "";
                        if (typeof n === "number") {
                            r = " ".repeat(Math.min(n, 10));
                        } else if (typeof n === "string") {
                            r = n.slice(0, 10);
                        }
                        if (t != null) {
                            if (typeof t === "function") {
                                return stringifyFnReplacer("", {
                                    "": e
                                }, [], t, r, "");
                            }
                            if (Array.isArray(t)) {
                                return stringifyArrayReplacer("", e, [], getUniqueReplacerSet(t), r, "");
                            }
                        }
                        if (r.length !== 0) {
                            return stringifyIndent("", e, [], r, "");
                        }
                    }
                    return stringifySimple("", e, []);
                }
                return stringify;
            }
        }
    };
    var t = {};
    function __nccwpck_require__(n) {
        var r = t[n];
        if (r !== undefined) {
            return r.exports;
        }
        var i = t[n] = {
            exports: {}
        };
        var f = true;
        try {
            e[n](i, i.exports, __nccwpck_require__);
            f = false;
        } finally{
            if (f) delete t[n];
        }
        return i.exports;
    }
    if (typeof __nccwpck_require__ !== "undefined") __nccwpck_require__.ab = ("TURBOPACK compile-time value", "/ROOT/Projects/fmko/node_modules/next/dist/compiled/safe-stable-stringify") + "/";
    var n = __nccwpck_require__(879);
    module.exports = n;
})();
}),
"[project]/Projects/fmko/node_modules/next/dist/shared/lib/error-source.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    decorateServerError: null,
    getErrorSource: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    decorateServerError: function() {
        return decorateServerError;
    },
    getErrorSource: function() {
        return getErrorSource;
    }
});
const symbolError = Symbol.for('NextjsError');
function getErrorSource(error) {
    return error[symbolError] || null;
}
function decorateServerError(error, type) {
    Object.defineProperty(error, symbolError, {
        writable: false,
        enumerable: false,
        configurable: false,
        value: type
    });
} //# sourceMappingURL=error-source.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/next-devtools/userspace/app/terminal-logging-config.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    getIsTerminalLoggingEnabled: null,
    getTerminalLoggingConfig: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    getIsTerminalLoggingEnabled: function() {
        return getIsTerminalLoggingEnabled;
    },
    getTerminalLoggingConfig: function() {
        return getTerminalLoggingConfig;
    }
});
function getTerminalLoggingConfig() {
    try {
        return JSON.parse(("TURBOPACK compile-time value", "false") || 'false');
    } catch (e) {
        return false;
    }
}
function getIsTerminalLoggingEnabled() {
    const config = getTerminalLoggingConfig();
    return Boolean(config);
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=terminal-logging-config.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/next-devtools/shared/forward-logs-shared.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    UNDEFINED_MARKER: null,
    patchConsoleMethod: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    UNDEFINED_MARKER: function() {
        return UNDEFINED_MARKER;
    },
    patchConsoleMethod: function() {
        return patchConsoleMethod;
    }
});
const UNDEFINED_MARKER = '__next_tagged_undefined';
function patchConsoleMethod(methodName, wrapper) {
    const descriptor = Object.getOwnPropertyDescriptor(console, methodName);
    if (descriptor && (descriptor.configurable || descriptor.writable) && typeof descriptor.value === 'function') {
        const originalMethod = descriptor.value;
        const originalName = Object.getOwnPropertyDescriptor(originalMethod, 'name');
        const wrapperMethod = function() {
            for(var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++){
                args[_key] = arguments[_key];
            }
            wrapper(methodName, ...args);
            originalMethod.apply(this, args);
        };
        if (originalName) {
            Object.defineProperty(wrapperMethod, 'name', originalName);
        }
        Object.defineProperty(console, methodName, {
            value: wrapperMethod
        });
        return ()=>{
            Object.defineProperty(console, methodName, {
                value: originalMethod,
                writable: descriptor.writable,
                configurable: descriptor.configurable
            });
        };
    }
    return ()=>{};
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=forward-logs-shared.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/next-devtools/userspace/app/forward-logs.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    PROMISE_MARKER: null,
    UNAVAILABLE_MARKER: null,
    forwardErrorLog: null,
    forwardUnhandledError: null,
    initializeDebugLogForwarding: null,
    isTerminalLoggingEnabled: null,
    logQueue: null,
    logStringify: null,
    logUnhandledRejection: null,
    preLogSerializationClone: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    PROMISE_MARKER: function() {
        return PROMISE_MARKER;
    },
    UNAVAILABLE_MARKER: function() {
        return UNAVAILABLE_MARKER;
    },
    forwardErrorLog: function() {
        return forwardErrorLog;
    },
    forwardUnhandledError: function() {
        return forwardUnhandledError;
    },
    initializeDebugLogForwarding: function() {
        return initializeDebugLogForwarding;
    },
    isTerminalLoggingEnabled: function() {
        return isTerminalLoggingEnabled;
    },
    logQueue: function() {
        return logQueue;
    },
    logStringify: function() {
        return logStringify;
    },
    logUnhandledRejection: function() {
        return logUnhandledRejection;
    },
    preLogSerializationClone: function() {
        return preLogSerializationClone;
    }
});
const _safestablestringify = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/compiled/safe-stable-stringify/index.js [app-ssr] (ecmascript)");
const _stitchederror = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/next-devtools/userspace/app/errors/stitched-error.js [app-ssr] (ecmascript)");
const _errorsource = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/shared/lib/error-source.js [app-ssr] (ecmascript)");
const _terminalloggingconfig = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/next-devtools/userspace/app/terminal-logging-config.js [app-ssr] (ecmascript)");
const _forwardlogsshared = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/next-devtools/shared/forward-logs-shared.js [app-ssr] (ecmascript)");
const terminalLoggingConfig = (0, _terminalloggingconfig.getTerminalLoggingConfig)();
const PROMISE_MARKER = 'Promise {}';
const UNAVAILABLE_MARKER = '[Unable to view]';
const maximumDepth = typeof terminalLoggingConfig === 'object' && terminalLoggingConfig.depthLimit ? terminalLoggingConfig.depthLimit : 5;
const maximumBreadth = typeof terminalLoggingConfig === 'object' && terminalLoggingConfig.edgeLimit ? terminalLoggingConfig.edgeLimit : 100;
const stringify = (0, _safestablestringify.configure)({
    maximumDepth,
    maximumBreadth
});
const isTerminalLoggingEnabled = (0, _terminalloggingconfig.getIsTerminalLoggingEnabled)();
const methods = [
    'log',
    'info',
    'warn',
    'debug',
    'table',
    'assert',
    'dir',
    'dirxml',
    'group',
    'groupCollapsed',
    'groupEnd',
    'trace'
];
function preLogSerializationClone(value, seen) {
    if (seen === void 0) seen = new WeakMap();
    if (value === undefined) return _forwardlogsshared.UNDEFINED_MARKER;
    if (value === null || typeof value !== 'object') return value;
    if (seen.has(value)) return seen.get(value);
    try {
        Object.keys(value);
    } catch (e) {
        return UNAVAILABLE_MARKER;
    }
    try {
        if (typeof value.then === 'function') return PROMISE_MARKER;
    } catch (e) {
        return UNAVAILABLE_MARKER;
    }
    if (Array.isArray(value)) {
        const out = [];
        seen.set(value, out);
        for (const item of value){
            try {
                out.push(preLogSerializationClone(item, seen));
            } catch (e) {
                out.push(UNAVAILABLE_MARKER);
            }
        }
        return out;
    }
    const proto = Object.getPrototypeOf(value);
    if (proto === Object.prototype || proto === null) {
        const out = {};
        seen.set(value, out);
        for (const key of Object.keys(value)){
            try {
                out[key] = preLogSerializationClone(value[key], seen);
            } catch (e) {
                out[key] = UNAVAILABLE_MARKER;
            }
        }
        return out;
    }
    return Object.prototype.toString.call(value);
}
const logStringify = (data)=>{
    try {
        const result = stringify(data);
        return result != null ? result : '"' + UNAVAILABLE_MARKER + '"';
    } catch (e) {
        return '"' + UNAVAILABLE_MARKER + '"';
    }
};
const afterThisFrame = (cb)=>{
    let timeout;
    const rafId = requestAnimationFrame(()=>{
        timeout = setTimeout(()=>{
            cb();
        });
    });
    return ()=>{
        cancelAnimationFrame(rafId);
        clearTimeout(timeout);
    };
};
let isPatched = false;
const serializeEntries = (entries)=>entries.map((clientEntry)=>{
        switch(clientEntry.kind){
            case 'any-logged-error':
            case 'console':
                {
                    return {
                        ...clientEntry,
                        args: clientEntry.args.map(stringifyUserArg)
                    };
                }
            case 'formatted-error':
                {
                    return clientEntry;
                }
            default:
                {
                    return null;
                }
        }
    });
const logQueue = {
    entries: [],
    flushScheduled: false,
    cancelFlush: null,
    socket: null,
    sourceType: undefined,
    router: null,
    scheduleLogSend: (entry)=>{
        logQueue.entries.push(entry);
        if (logQueue.flushScheduled) {
            return;
        }
        // safe to deref and use in setTimeout closure since we cancel on new socket
        const socket = logQueue.socket;
        if (!socket) {
            return;
        }
        // we probably dont need this
        logQueue.flushScheduled = true;
        // non blocking log flush, runs at most once per frame
        logQueue.cancelFlush = afterThisFrame(()=>{
            logQueue.flushScheduled = false;
            // just incase
            try {
                const payload = JSON.stringify({
                    event: 'browser-logs',
                    entries: serializeEntries(logQueue.entries),
                    router: logQueue.router,
                    // needed for source mapping, we just assign the sourceType from the last error for the whole batch
                    sourceType: logQueue.sourceType
                });
                socket.send(payload);
                logQueue.entries = [];
                logQueue.sourceType = undefined;
            } catch (e) {
            // error (make sure u don't infinite loop)
            /* noop */ }
        });
    },
    onSocketReady: (socket)=>{
        if (socket.readyState !== WebSocket.OPEN) {
            // invariant
            return;
        }
        // incase an existing timeout was going to run with a stale socket
        logQueue.cancelFlush == null ? void 0 : logQueue.cancelFlush.call(logQueue);
        logQueue.socket = socket;
        try {
            const payload = JSON.stringify({
                event: 'browser-logs',
                entries: serializeEntries(logQueue.entries),
                router: logQueue.router,
                sourceType: logQueue.sourceType
            });
            socket.send(payload);
            logQueue.entries = [];
            logQueue.sourceType = undefined;
        } catch (e) {
        /** noop just incase */ }
    }
};
const stringifyUserArg = (arg)=>{
    if (arg.kind !== 'arg') {
        return arg;
    }
    return {
        ...arg,
        data: logStringify(arg.data)
    };
};
const createErrorArg = (error)=>{
    const stack = stackWithOwners(error);
    return {
        kind: 'formatted-error-arg',
        prefix: error.message ? error.name + ": " + error.message : "" + error.name,
        stack
    };
};
const createLogEntry = (level, args)=>{
    // do not abstract this, it implicitly relies on which functions call it. forcing the inlined implementation makes you think about callers
    // error capture stack trace maybe
    const stack = stackWithOwners(new Error());
    const stackLines = stack == null ? void 0 : stack.split('\n');
    const cleanStack = stackLines == null ? void 0 : stackLines.slice(3).join('\n') // this is probably ignored anyways
    ;
    const entry = {
        kind: 'console',
        consoleMethodStack: cleanStack != null ? cleanStack : null,
        method: level,
        args: args.map((arg)=>{
            if (arg instanceof Error) {
                return createErrorArg(arg);
            }
            return {
                kind: 'arg',
                data: preLogSerializationClone(arg)
            };
        })
    };
    logQueue.scheduleLogSend(entry);
};
const forwardErrorLog = (args)=>{
    const errorObjects = args.filter((arg)=>arg instanceof Error);
    const first = errorObjects.at(0);
    if (first) {
        const source = (0, _errorsource.getErrorSource)(first);
        if (source) {
            logQueue.sourceType = source;
        }
    }
    /**
   * browser shows stack regardless of type of data passed to console.error, so we should do the same
   *
   * do not abstract this, it implicitly relies on which functions call it. forcing the inlined implementation makes you think about callers
   */ const stack = stackWithOwners(new Error());
    const stackLines = stack == null ? void 0 : stack.split('\n');
    const cleanStack = stackLines == null ? void 0 : stackLines.slice(3).join('\n');
    const entry = {
        kind: 'any-logged-error',
        method: 'error',
        consoleErrorStack: cleanStack != null ? cleanStack : '',
        args: args.map((arg)=>{
            if (arg instanceof Error) {
                return createErrorArg(arg);
            }
            return {
                kind: 'arg',
                data: preLogSerializationClone(arg)
            };
        })
    };
    logQueue.scheduleLogSend(entry);
};
const createUncaughtErrorEntry = (errorName, errorMessage, fullStack)=>{
    const entry = {
        kind: 'formatted-error',
        prefix: "Uncaught " + errorName + ": " + errorMessage,
        stack: fullStack,
        method: 'error'
    };
    logQueue.scheduleLogSend(entry);
};
const stackWithOwners = (error)=>{
    let ownerStack = '';
    (0, _stitchederror.setOwnerStackIfAvailable)(error);
    ownerStack = (0, _stitchederror.getOwnerStack)(error) || '';
    const stack = (error.stack || '') + ownerStack;
    return stack;
};
function logUnhandledRejection(reason) {
    if (reason instanceof Error) {
        createUnhandledRejectionErrorEntry(reason, stackWithOwners(reason));
        return;
    }
    createUnhandledRejectionNonErrorEntry(reason);
}
const createUnhandledRejectionErrorEntry = (error, fullStack)=>{
    const source = (0, _errorsource.getErrorSource)(error);
    if (source) {
        logQueue.sourceType = source;
    }
    const entry = {
        kind: 'formatted-error',
        prefix: "⨯ unhandledRejection: " + error.name + ": " + error.message,
        stack: fullStack,
        method: 'error'
    };
    logQueue.scheduleLogSend(entry);
};
const createUnhandledRejectionNonErrorEntry = (reason)=>{
    const entry = {
        kind: 'any-logged-error',
        // we can't access the stack since the event is dispatched async and creating an inline error would be meaningless
        consoleErrorStack: '',
        method: 'error',
        args: [
            {
                kind: 'arg',
                data: "⨯ unhandledRejection:",
                isRejectionMessage: true
            },
            {
                kind: 'arg',
                data: preLogSerializationClone(reason)
            }
        ]
    };
    logQueue.scheduleLogSend(entry);
};
const isHMR = (args)=>{
    const firstArg = args[0];
    if (typeof firstArg !== 'string') {
        return false;
    }
    if (firstArg.startsWith('[Fast Refresh]')) {
        return true;
    }
    if (firstArg.startsWith('[HMR]')) {
        return true;
    }
    return false;
};
const isIgnoredLog = (args)=>{
    if (args.length < 3) {
        return false;
    }
    const [format, styles, label] = args;
    if (typeof format !== 'string' || typeof styles !== 'string' || typeof label !== 'string') {
        return false;
    }
    // kinda hacky, we should define a common format for these strings so we can safely ignore
    return format.startsWith('%c%s%c') && styles.includes('background:');
};
function forwardUnhandledError(error) {
    createUncaughtErrorEntry(error.name, error.message, stackWithOwners(error));
}
const initializeDebugLogForwarding = (router)=>{
    // probably don't need this
    if (isPatched) {
        return;
    }
    // TODO(rob): why does this break rendering on server, important to know incase the same bug appears in browser
    if ("TURBOPACK compile-time truthy", 1) {
        return;
    }
    //TURBOPACK unreachable
    ;
};
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=forward-logs.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/next-devtools/userspace/app/errors/use-error-handler.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    handleClientError: null,
    handleConsoleError: null,
    handleGlobalErrors: null,
    useErrorHandler: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    handleClientError: function() {
        return handleClientError;
    },
    handleConsoleError: function() {
        return handleConsoleError;
    },
    handleGlobalErrors: function() {
        return handleGlobalErrors;
    },
    useErrorHandler: function() {
        return useErrorHandler;
    }
});
const _interop_require_default = __turbopack_context__.r("[project]/Projects/fmko/node_modules/@swc/helpers/cjs/_interop_require_default.cjs [app-ssr] (ecmascript)");
const _react = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
const _isnextroutererror = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/is-next-router-error.js [app-ssr] (ecmascript)");
const _console = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/lib/console.js [app-ssr] (ecmascript)");
const _iserror = /*#__PURE__*/ _interop_require_default._(__turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/lib/is-error.js [app-ssr] (ecmascript)"));
const _consoleerror = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/next-devtools/shared/console-error.js [app-ssr] (ecmascript)");
const _stitchederror = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/next-devtools/userspace/app/errors/stitched-error.js [app-ssr] (ecmascript)");
const _forwardlogs = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/next-devtools/userspace/app/forward-logs.js [app-ssr] (ecmascript)");
const queueMicroTask = globalThis.queueMicrotask || ((cb)=>Promise.resolve().then(cb));
const errorQueue = [];
const errorHandlers = [];
const rejectionQueue = [];
const rejectionHandlers = [];
function handleConsoleError(originError, consoleErrorArgs) {
    let error;
    const { environmentName } = (0, _console.parseConsoleArgs)(consoleErrorArgs);
    if ((0, _iserror.default)(originError)) {
        error = (0, _consoleerror.createConsoleError)(originError, environmentName);
    } else {
        error = (0, _consoleerror.createConsoleError)((0, _console.formatConsoleArgs)(consoleErrorArgs), environmentName);
    }
    (0, _stitchederror.setOwnerStackIfAvailable)(error);
    errorQueue.push(error);
    for (const handler of errorHandlers){
        // Delayed the error being passed to React Dev Overlay,
        // avoid the state being synchronously updated in the component.
        queueMicroTask(()=>{
            handler(error);
        });
    }
}
function handleClientError(error) {
    errorQueue.push(error);
    for (const handler of errorHandlers){
        // Delayed the error being passed to React Dev Overlay,
        // avoid the state being synchronously updated in the component.
        queueMicroTask(()=>{
            handler(error);
        });
    }
}
function useErrorHandler(handleOnUnhandledError, handleOnUnhandledRejection) {
    (0, _react.useEffect)(()=>{
        // Handle queued errors.
        errorQueue.forEach(handleOnUnhandledError);
        rejectionQueue.forEach(handleOnUnhandledRejection);
        // Listen to new errors.
        errorHandlers.push(handleOnUnhandledError);
        rejectionHandlers.push(handleOnUnhandledRejection);
        return ()=>{
            // Remove listeners.
            errorHandlers.splice(errorHandlers.indexOf(handleOnUnhandledError), 1);
            rejectionHandlers.splice(rejectionHandlers.indexOf(handleOnUnhandledRejection), 1);
            // Reset error queues.
            errorQueue.splice(0, errorQueue.length);
            rejectionQueue.splice(0, rejectionQueue.length);
        };
    }, [
        handleOnUnhandledError,
        handleOnUnhandledRejection
    ]);
}
function onUnhandledError(event) {
    const thrownValue = event.error;
    if ((0, _isnextroutererror.isNextRouterError)(thrownValue)) {
        event.preventDefault();
        return false;
    }
    // When there's an error property present, we log the error to error overlay.
    // Otherwise we don't do anything as it's not logging in the console either.
    if (thrownValue) {
        const error = (0, _stitchederror.coerceError)(thrownValue);
        (0, _stitchederror.setOwnerStackIfAvailable)(error);
        handleClientError(error);
        if (_forwardlogs.isTerminalLoggingEnabled) {
            (0, _forwardlogs.forwardUnhandledError)(error);
        }
    }
}
function onUnhandledRejection(ev) {
    const reason = ev == null ? void 0 : ev.reason;
    if ((0, _isnextroutererror.isNextRouterError)(reason)) {
        ev.preventDefault();
        return;
    }
    const error = (0, _stitchederror.coerceError)(reason);
    (0, _stitchederror.setOwnerStackIfAvailable)(error);
    rejectionQueue.push(error);
    for (const handler of rejectionHandlers){
        handler(error);
    }
    if (_forwardlogs.isTerminalLoggingEnabled) {
        (0, _forwardlogs.logUnhandledRejection)(reason);
    }
}
function handleGlobalErrors() {
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=use-error-handler.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/shared/lib/errors/constants.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "MISSING_ROOT_TAGS_ERROR", {
    enumerable: true,
    get: function() {
        return MISSING_ROOT_TAGS_ERROR;
    }
});
const MISSING_ROOT_TAGS_ERROR = 'NEXT_MISSING_ROOT_TAGS';
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=constants.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/next-devtools/userspace/app/errors/replay-ssr-only-errors.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "ReplaySsrOnlyErrors", {
    enumerable: true,
    get: function() {
        return ReplaySsrOnlyErrors;
    }
});
const _react = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
const _useerrorhandler = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/next-devtools/userspace/app/errors/use-error-handler.js [app-ssr] (ecmascript)");
const _isnextroutererror = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/is-next-router-error.js [app-ssr] (ecmascript)");
const _constants = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/shared/lib/errors/constants.js [app-ssr] (ecmascript)");
function readSsrError() {
    if (typeof document === 'undefined') {
        return null;
    }
    const ssrErrorTemplateTag = document.querySelector('template[data-next-error-message]');
    if (ssrErrorTemplateTag) {
        const message = ssrErrorTemplateTag.getAttribute('data-next-error-message');
        const stack = ssrErrorTemplateTag.getAttribute('data-next-error-stack');
        const digest = ssrErrorTemplateTag.getAttribute('data-next-error-digest');
        const error = Object.defineProperty(new Error(message), "__NEXT_ERROR_CODE", {
            value: "E394",
            enumerable: false,
            configurable: true
        });
        if (digest) {
            ;
            error.digest = digest;
        }
        // Skip Next.js SSR'd internal errors that which will be handled by the error boundaries.
        if ((0, _isnextroutererror.isNextRouterError)(error)) {
            return null;
        }
        error.stack = stack || '';
        return error;
    }
    return null;
}
function ReplaySsrOnlyErrors(param) {
    let { onBlockingError } = param;
    if ("TURBOPACK compile-time truthy", 1) {
        // Need to read during render. The attributes will be gone after commit.
        const ssrError = readSsrError();
        // eslint-disable-next-line react-hooks/rules-of-hooks
        (0, _react.useEffect)(()=>{
            if (ssrError !== null) {
                // TODO(veil): Include original Owner Stack (NDX-905)
                // TODO(veil): Mark as recoverable error
                // TODO(veil): console.error
                (0, _useerrorhandler.handleClientError)(ssrError);
                // If it's missing root tags, we can't recover, make it blocking.
                if (ssrError.digest === _constants.MISSING_ROOT_TAGS_ERROR) {
                    onBlockingError();
                }
            }
        }, [
            ssrError,
            onBlockingError
        ]);
    }
    return null;
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=replay-ssr-only-errors.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/dev/runtime-error-handler.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "RuntimeErrorHandler", {
    enumerable: true,
    get: function() {
        return RuntimeErrorHandler;
    }
});
const RuntimeErrorHandler = {
    hadRuntimeError: false
};
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=runtime-error-handler.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/next-devtools/userspace/app/segment-explorer-node.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    SEGMENT_EXPLORER_SIMULATED_ERROR_MESSAGE: null,
    SegmentBoundaryTriggerNode: null,
    SegmentStateProvider: null,
    SegmentViewNode: null,
    SegmentViewStateNode: null,
    useSegmentState: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    SEGMENT_EXPLORER_SIMULATED_ERROR_MESSAGE: function() {
        return SEGMENT_EXPLORER_SIMULATED_ERROR_MESSAGE;
    },
    SegmentBoundaryTriggerNode: function() {
        return SegmentBoundaryTriggerNode;
    },
    SegmentStateProvider: function() {
        return SegmentStateProvider;
    },
    SegmentViewNode: function() {
        return SegmentViewNode;
    },
    SegmentViewStateNode: function() {
        return SegmentViewStateNode;
    },
    useSegmentState: function() {
        return useSegmentState;
    }
});
const _jsxruntime = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-runtime.js [app-ssr] (ecmascript)");
const _react = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
const _nextdevtools = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/compiled/next-devtools/index.js [app-ssr] (ecmascript)");
const _notfound = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/not-found.js [app-ssr] (ecmascript)");
const SEGMENT_EXPLORER_SIMULATED_ERROR_MESSAGE = 'NEXT_DEVTOOLS_SIMULATED_ERROR';
function SegmentTrieNode(param) {
    let { type, pagePath } = param;
    const { boundaryType, setBoundaryType } = useSegmentState();
    const nodeState = (0, _react.useMemo)(()=>{
        return {
            type,
            pagePath,
            boundaryType,
            setBoundaryType
        };
    }, [
        type,
        pagePath,
        boundaryType,
        setBoundaryType
    ]);
    // Use `useLayoutEffect` to ensure the state is updated during suspense.
    // `useEffect` won't work as the state is preserved during suspense.
    (0, _react.useLayoutEffect)(()=>{
        _nextdevtools.dispatcher.segmentExplorerNodeAdd(nodeState);
        return ()=>{
            _nextdevtools.dispatcher.segmentExplorerNodeRemove(nodeState);
        };
    }, [
        nodeState
    ]);
    return null;
}
function NotFoundSegmentNode() {
    (0, _notfound.notFound)();
}
function ErrorSegmentNode() {
    throw Object.defineProperty(new Error(SEGMENT_EXPLORER_SIMULATED_ERROR_MESSAGE), "__NEXT_ERROR_CODE", {
        value: "E394",
        enumerable: false,
        configurable: true
    });
}
const forever = new Promise(()=>{});
function LoadingSegmentNode() {
    (0, _react.use)(forever);
    return null;
}
function SegmentViewStateNode(param) {
    let { page } = param;
    (0, _react.useLayoutEffect)(()=>{
        _nextdevtools.dispatcher.segmentExplorerUpdateRouteState(page);
        return ()=>{
            _nextdevtools.dispatcher.segmentExplorerUpdateRouteState('');
        };
    }, [
        page
    ]);
    return null;
}
function SegmentBoundaryTriggerNode() {
    const { boundaryType } = useSegmentState();
    let segmentNode = null;
    if (boundaryType === 'loading') {
        segmentNode = /*#__PURE__*/ (0, _jsxruntime.jsx)(LoadingSegmentNode, {});
    } else if (boundaryType === 'not-found') {
        segmentNode = /*#__PURE__*/ (0, _jsxruntime.jsx)(NotFoundSegmentNode, {});
    } else if (boundaryType === 'error') {
        segmentNode = /*#__PURE__*/ (0, _jsxruntime.jsx)(ErrorSegmentNode, {});
    }
    return segmentNode;
}
function SegmentViewNode(param) {
    let { type, pagePath, children } = param;
    const segmentNode = /*#__PURE__*/ (0, _jsxruntime.jsx)(SegmentTrieNode, {
        type: type,
        pagePath: pagePath
    }, type);
    return /*#__PURE__*/ (0, _jsxruntime.jsxs)(_jsxruntime.Fragment, {
        children: [
            segmentNode,
            children
        ]
    });
}
const SegmentStateContext = /*#__PURE__*/ (0, _react.createContext)({
    boundaryType: null,
    setBoundaryType: ()=>{}
});
function SegmentStateProvider(param) {
    let { children } = param;
    const [boundaryType, setBoundaryType] = (0, _react.useState)(null);
    const [errorBoundaryKey, setErrorBoundaryKey] = (0, _react.useState)(0);
    const reloadBoundary = (0, _react.useCallback)(()=>setErrorBoundaryKey((prev)=>prev + 1), []);
    const setBoundaryTypeAndReload = (0, _react.useCallback)((type)=>{
        if (type === null) {
            reloadBoundary();
        }
        setBoundaryType(type);
    }, [
        reloadBoundary
    ]);
    return /*#__PURE__*/ (0, _jsxruntime.jsx)(SegmentStateContext.Provider, {
        value: {
            boundaryType,
            setBoundaryType: setBoundaryTypeAndReload
        },
        children: children
    }, errorBoundaryKey);
}
function useSegmentState() {
    return (0, _react.useContext)(SegmentStateContext);
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=segment-explorer-node.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/next-devtools/userspace/app/app-dev-overlay-error-boundary.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "AppDevOverlayErrorBoundary", {
    enumerable: true,
    get: function() {
        return AppDevOverlayErrorBoundary;
    }
});
const _interop_require_default = __turbopack_context__.r("[project]/Projects/fmko/node_modules/@swc/helpers/cjs/_interop_require_default.cjs [app-ssr] (ecmascript)");
const _jsxruntime = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-runtime.js [app-ssr] (ecmascript)");
const _react = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
const _nextdevtools = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/compiled/next-devtools/index.js [app-ssr] (ecmascript)");
const _runtimeerrorhandler = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/dev/runtime-error-handler.js [app-ssr] (ecmascript)");
const _errorboundary = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/error-boundary.js [app-ssr] (ecmascript)");
const _globalerror = /*#__PURE__*/ _interop_require_default._(__turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/builtin/global-error.js [app-ssr] (ecmascript)"));
const _segmentexplorernode = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/next-devtools/userspace/app/segment-explorer-node.js [app-ssr] (ecmascript)");
function ErroredHtml(param) {
    let { globalError: [GlobalError, globalErrorStyles], error } = param;
    if (!error) {
        return /*#__PURE__*/ (0, _jsxruntime.jsxs)("html", {
            children: [
                /*#__PURE__*/ (0, _jsxruntime.jsx)("head", {}),
                /*#__PURE__*/ (0, _jsxruntime.jsx)("body", {})
            ]
        });
    }
    return /*#__PURE__*/ (0, _jsxruntime.jsxs)(_errorboundary.ErrorBoundary, {
        errorComponent: _globalerror.default,
        children: [
            globalErrorStyles,
            /*#__PURE__*/ (0, _jsxruntime.jsx)(GlobalError, {
                error: error
            })
        ]
    });
}
class AppDevOverlayErrorBoundary extends _react.PureComponent {
    static getDerivedStateFromError(error) {
        _runtimeerrorhandler.RuntimeErrorHandler.hadRuntimeError = true;
        return {
            reactError: error
        };
    }
    componentDidCatch(err) {
        if (("TURBOPACK compile-time value", "development") === 'development' && err.message === _segmentexplorernode.SEGMENT_EXPLORER_SIMULATED_ERROR_MESSAGE) {
            return;
        }
        _nextdevtools.dispatcher.openErrorOverlay();
    }
    render() {
        const { children, globalError } = this.props;
        const { reactError } = this.state;
        const fallback = /*#__PURE__*/ (0, _jsxruntime.jsx)(ErroredHtml, {
            globalError: globalError,
            error: reactError
        });
        return reactError !== null ? fallback : children;
    }
    constructor(...args){
        super(...args), this.state = {
            reactError: null
        };
    }
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=app-dev-overlay-error-boundary.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/shared/lib/normalized-asset-prefix.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "normalizedAssetPrefix", {
    enumerable: true,
    get: function() {
        return normalizedAssetPrefix;
    }
});
function normalizedAssetPrefix(assetPrefix) {
    // remove all leading slashes and trailing slashes
    const escapedAssetPrefix = (assetPrefix == null ? void 0 : assetPrefix.replace(/^\/+|\/+$/g, '')) || false;
    // if an assetPrefix was '/', we return empty string
    // because it could be an unnecessary trailing slash
    if (!escapedAssetPrefix) {
        return '';
    }
    if (URL.canParse(escapedAssetPrefix)) {
        const url = new URL(escapedAssetPrefix).toString();
        return url.endsWith('/') ? url.slice(0, -1) : url;
    }
    // assuming assetPrefix here is a pathname-style,
    // restore the leading slash
    return "/" + escapedAssetPrefix;
} //# sourceMappingURL=normalized-asset-prefix.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/dev/hot-reloader/get-socket-url.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "getSocketUrl", {
    enumerable: true,
    get: function() {
        return getSocketUrl;
    }
});
const _normalizedassetprefix = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/shared/lib/normalized-asset-prefix.js [app-ssr] (ecmascript)");
function getSocketProtocol(assetPrefix) {
    let protocol = window.location.protocol;
    try {
        // assetPrefix is a url
        protocol = new URL(assetPrefix).protocol;
    } catch (e) {}
    return protocol === 'http:' ? 'ws:' : 'wss:';
}
function getSocketUrl(assetPrefix) {
    const prefix = (0, _normalizedassetprefix.normalizedAssetPrefix)(assetPrefix);
    const protocol = getSocketProtocol(assetPrefix || '');
    if (URL.canParse(prefix)) {
        // since normalized asset prefix is ensured to be a URL format,
        // we can safely replace the protocol
        return prefix.replace(/^http/, 'ws');
    }
    const { hostname, port } = window.location;
    return protocol + "//" + hostname + (port ? ":" + port : '') + prefix;
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=get-socket-url.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/dev/hot-reloader/app/use-websocket.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    useSendMessage: null,
    useTurbopack: null,
    useWebsocket: null,
    useWebsocketPing: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    useSendMessage: function() {
        return useSendMessage;
    },
    useTurbopack: function() {
        return useTurbopack;
    },
    useWebsocket: function() {
        return useWebsocket;
    },
    useWebsocketPing: function() {
        return useWebsocketPing;
    }
});
const _react = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
const _approutercontextsharedruntime = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/server/route-modules/app-page/vendored/contexts/app-router-context.js [app-ssr] (ecmascript)");
const _getsocketurl = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/dev/hot-reloader/get-socket-url.js [app-ssr] (ecmascript)");
function useWebsocket(assetPrefix) {
    const webSocketRef = (0, _react.useRef)(undefined);
    (0, _react.useEffect)(()=>{
        if (webSocketRef.current) {
            return;
        }
        const url = (0, _getsocketurl.getSocketUrl)(assetPrefix);
        webSocketRef.current = new window.WebSocket("" + url + "/_next/webpack-hmr");
    }, [
        assetPrefix
    ]);
    return webSocketRef;
}
function useSendMessage(webSocketRef) {
    const sendMessage = (0, _react.useCallback)((data)=>{
        const socket = webSocketRef.current;
        if (!socket || socket.readyState !== socket.OPEN) {
            return;
        }
        return socket.send(data);
    }, [
        webSocketRef
    ]);
    return sendMessage;
}
function useTurbopack(sendMessage, onUpdateError) {
    const turbopackState = (0, _react.useRef)({
        init: false,
        // Until the dynamic import resolves, queue any turbopack messages which will be replayed.
        queue: [],
        callback: undefined
    });
    const processTurbopackMessage = (0, _react.useCallback)((msg)=>{
        const { callback, queue } = turbopackState.current;
        if (callback) {
            callback(msg);
        } else {
            queue.push(msg);
        }
    }, []);
    (0, _react.useEffect)(()=>{
        const { current: initCurrent } = turbopackState;
        // TODO(WEB-1589): only install if `process.turbopack` set.
        if (initCurrent.init) {
            return;
        }
        initCurrent.init = true;
        __turbopack_context__.A("[turbopack]/browser/dev/hmr-client/hmr-client.ts [app-ssr] (ecmascript, async loader)").then((param)=>{
            let { connect } = param;
            const { current } = turbopackState;
            connect({
                addMessageListener (cb) {
                    current.callback = cb;
                    // Replay all Turbopack messages before we were able to establish the HMR client.
                    for (const msg of current.queue){
                        cb(msg);
                    }
                    current.queue = undefined;
                },
                sendMessage,
                onUpdateError
            });
        });
    }, [
        sendMessage,
        onUpdateError
    ]);
    return processTurbopackMessage;
}
function useWebsocketPing(websocketRef) {
    const sendMessage = useSendMessage(websocketRef);
    const { tree } = (0, _react.useContext)(_approutercontextsharedruntime.GlobalLayoutRouterContext);
    (0, _react.useEffect)(()=>{
        // Never send pings when using Turbopack as it's not used.
        // Pings were originally used to keep track of active routes in on-demand-entries with webpack.
        if ("TURBOPACK compile-time truthy", 1) {
            return;
        }
        //TURBOPACK unreachable
        ;
        // Taken from on-demand-entries-client.js
        const interval = undefined;
    }, [
        tree,
        sendMessage
    ]);
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=use-websocket.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/server/dev/hot-reloader-types.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "HMR_ACTIONS_SENT_TO_BROWSER", {
    enumerable: true,
    get: function() {
        return HMR_ACTIONS_SENT_TO_BROWSER;
    }
});
var HMR_ACTIONS_SENT_TO_BROWSER = /*#__PURE__*/ function(HMR_ACTIONS_SENT_TO_BROWSER) {
    HMR_ACTIONS_SENT_TO_BROWSER["ADDED_PAGE"] = "addedPage";
    HMR_ACTIONS_SENT_TO_BROWSER["REMOVED_PAGE"] = "removedPage";
    HMR_ACTIONS_SENT_TO_BROWSER["RELOAD_PAGE"] = "reloadPage";
    HMR_ACTIONS_SENT_TO_BROWSER["SERVER_COMPONENT_CHANGES"] = "serverComponentChanges";
    HMR_ACTIONS_SENT_TO_BROWSER["MIDDLEWARE_CHANGES"] = "middlewareChanges";
    HMR_ACTIONS_SENT_TO_BROWSER["CLIENT_CHANGES"] = "clientChanges";
    HMR_ACTIONS_SENT_TO_BROWSER["SERVER_ONLY_CHANGES"] = "serverOnlyChanges";
    HMR_ACTIONS_SENT_TO_BROWSER["SYNC"] = "sync";
    HMR_ACTIONS_SENT_TO_BROWSER["BUILT"] = "built";
    HMR_ACTIONS_SENT_TO_BROWSER["BUILDING"] = "building";
    HMR_ACTIONS_SENT_TO_BROWSER["DEV_PAGES_MANIFEST_UPDATE"] = "devPagesManifestUpdate";
    HMR_ACTIONS_SENT_TO_BROWSER["TURBOPACK_MESSAGE"] = "turbopack-message";
    HMR_ACTIONS_SENT_TO_BROWSER["SERVER_ERROR"] = "serverError";
    HMR_ACTIONS_SENT_TO_BROWSER["TURBOPACK_CONNECTED"] = "turbopack-connected";
    HMR_ACTIONS_SENT_TO_BROWSER["ISR_MANIFEST"] = "isrManifest";
    HMR_ACTIONS_SENT_TO_BROWSER["DEV_INDICATOR"] = "devIndicator";
    HMR_ACTIONS_SENT_TO_BROWSER["DEVTOOLS_CONFIG"] = "devtoolsConfig";
    return HMR_ACTIONS_SENT_TO_BROWSER;
}({}); //# sourceMappingURL=hot-reloader-types.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/dev/report-hmr-latency.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, /**
 * Logs information about a completed HMR to the console, the server (via a
 * `client-hmr-latency` event), and to `self.__NEXT_HMR_LATENCY_CB` (a debugging
 * hook).
 *
 * @param hasUpdate Set this to `false` to avoid reporting the HMR event via a
 *   `client-hmr-latency` event or to `self.__NEXT_HMR_LATENCY_CB`. Used by
 *   turbopack when we must report a message to the browser console (because we
 *   already logged a "rebuilding" message), but it's not a real HMR, so we
 *   don't want to impact our telemetry.
 */ "default", {
    enumerable: true,
    get: function() {
        return reportHmrLatency;
    }
});
function reportHmrLatency(sendMessage, updatedModules, startMsSinceEpoch, endMsSinceEpoch, hasUpdate) {
    if (hasUpdate === void 0) hasUpdate = true;
    const latencyMs = endMsSinceEpoch - startMsSinceEpoch;
    console.log("[Fast Refresh] done in " + latencyMs + "ms");
    if (!hasUpdate) {
        return;
    }
    sendMessage(JSON.stringify({
        event: 'client-hmr-latency',
        id: window.__nextDevClientId,
        startTime: startMsSinceEpoch,
        endTime: endMsSinceEpoch,
        page: window.location.pathname,
        updatedModules,
        // Whether the page (tab) was hidden at the time the event occurred.
        // This can impact the accuracy of the event's timing.
        isPageHidden: document.visibilityState === 'hidden'
    }));
    if (self.__NEXT_HMR_LATENCY_CB) {
        self.__NEXT_HMR_LATENCY_CB(latencyMs);
    }
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=report-hmr-latency.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/dev/hot-reloader/turbopack-hot-reloader-common.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "TurbopackHmr", {
    enumerable: true,
    get: function() {
        return TurbopackHmr;
    }
});
const _class_private_field_loose_base = __turbopack_context__.r("[project]/Projects/fmko/node_modules/@swc/helpers/cjs/_class_private_field_loose_base.cjs [app-ssr] (ecmascript)");
const _class_private_field_loose_key = __turbopack_context__.r("[project]/Projects/fmko/node_modules/@swc/helpers/cjs/_class_private_field_loose_key.cjs [app-ssr] (ecmascript)");
// How long to wait before reporting the HMR start, used to suppress irrelevant
// `BUILDING` events. Does not impact reported latency.
const TURBOPACK_HMR_START_DELAY_MS = 100;
var _updatedModules = /*#__PURE__*/ _class_private_field_loose_key._("_updatedModules"), _startMsSinceEpoch = /*#__PURE__*/ _class_private_field_loose_key._("_startMsSinceEpoch"), _lastUpdateMsSinceEpoch = /*#__PURE__*/ _class_private_field_loose_key._("_lastUpdateMsSinceEpoch"), _deferredReportHmrStartId = /*#__PURE__*/ _class_private_field_loose_key._("_deferredReportHmrStartId"), _reportedHmrStart = /*#__PURE__*/ _class_private_field_loose_key._("_reportedHmrStart"), // as it reports *any* compilation, including fully no-op/cached compilations
// and those unrelated to HMR. Fixing this would require significant
// architectural changes.
//
// Work around this by deferring any "rebuilding" message by 100ms. If we get
// a BUILT event within that threshold and nothing has changed, just suppress
// the message entirely.
_runDeferredReportHmrStart = /*#__PURE__*/ _class_private_field_loose_key._("_runDeferredReportHmrStart"), _cancelDeferredReportHmrStart = /*#__PURE__*/ _class_private_field_loose_key._("_cancelDeferredReportHmrStart"), /** Helper for other `onEvent` methods. */ _onUpdate = /*#__PURE__*/ _class_private_field_loose_key._("_onUpdate");
class TurbopackHmr {
    onBuilding() {
        _class_private_field_loose_base._(this, _lastUpdateMsSinceEpoch)[_lastUpdateMsSinceEpoch] = undefined;
        _class_private_field_loose_base._(this, _cancelDeferredReportHmrStart)[_cancelDeferredReportHmrStart]();
        _class_private_field_loose_base._(this, _startMsSinceEpoch)[_startMsSinceEpoch] = Date.now();
        // report the HMR start after a short delay
        _class_private_field_loose_base._(this, _deferredReportHmrStartId)[_deferredReportHmrStartId] = setTimeout(()=>_class_private_field_loose_base._(this, _runDeferredReportHmrStart)[_runDeferredReportHmrStart](), self.__NEXT_HMR_TURBOPACK_REPORT_NOISY_NOOP_EVENTS ? 0 : TURBOPACK_HMR_START_DELAY_MS);
    }
    onTurbopackMessage(msg) {
        _class_private_field_loose_base._(this, _onUpdate)[_onUpdate]();
        const updatedModules = extractModulesFromTurbopackMessage(msg.data);
        for (const module1 of updatedModules){
            _class_private_field_loose_base._(this, _updatedModules)[_updatedModules].add(module1);
        }
    }
    onServerComponentChanges() {
        _class_private_field_loose_base._(this, _onUpdate)[_onUpdate]();
    }
    onReloadPage() {
        _class_private_field_loose_base._(this, _onUpdate)[_onUpdate]();
    }
    onPageAddRemove() {
        _class_private_field_loose_base._(this, _onUpdate)[_onUpdate]();
    }
    /**
   * @returns `null` if the caller should ignore the update entirely. Returns an
   *   object with `hasUpdates: false` if the caller should report the end of
   *   the HMR in the browser console, but the HMR was a no-op.
   */ onBuilt() {
        // Check that we got *any* `TurbopackMessageAction`, even if
        // `updatedModules` is empty (not everything gets recorded there).
        //
        // There's also a case where `onBuilt` gets called before `onBuilding`,
        // which can happen during initial page load. Ignore that too!
        const hasUpdates = _class_private_field_loose_base._(this, _lastUpdateMsSinceEpoch)[_lastUpdateMsSinceEpoch] != null && _class_private_field_loose_base._(this, _startMsSinceEpoch)[_startMsSinceEpoch] != null;
        if (!hasUpdates && !_class_private_field_loose_base._(this, _reportedHmrStart)[_reportedHmrStart]) {
            // suppress the update entirely
            _class_private_field_loose_base._(this, _cancelDeferredReportHmrStart)[_cancelDeferredReportHmrStart]();
            return null;
        }
        _class_private_field_loose_base._(this, _runDeferredReportHmrStart)[_runDeferredReportHmrStart]();
        var _class_private_field_loose_base__lastUpdateMsSinceEpoch;
        const result = {
            hasUpdates,
            updatedModules: _class_private_field_loose_base._(this, _updatedModules)[_updatedModules],
            startMsSinceEpoch: _class_private_field_loose_base._(this, _startMsSinceEpoch)[_startMsSinceEpoch],
            endMsSinceEpoch: (_class_private_field_loose_base__lastUpdateMsSinceEpoch = _class_private_field_loose_base._(this, _lastUpdateMsSinceEpoch)[_lastUpdateMsSinceEpoch]) != null ? _class_private_field_loose_base__lastUpdateMsSinceEpoch : Date.now()
        };
        _class_private_field_loose_base._(this, _updatedModules)[_updatedModules] = new Set();
        _class_private_field_loose_base._(this, _reportedHmrStart)[_reportedHmrStart] = false;
        return result;
    }
    constructor(){
        Object.defineProperty(this, _runDeferredReportHmrStart, {
            value: runDeferredReportHmrStart
        });
        Object.defineProperty(this, _cancelDeferredReportHmrStart, {
            value: cancelDeferredReportHmrStart
        });
        Object.defineProperty(this, _onUpdate, {
            value: onUpdate
        });
        Object.defineProperty(this, _updatedModules, {
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, _startMsSinceEpoch, {
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, _lastUpdateMsSinceEpoch, {
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, _deferredReportHmrStartId, {
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, _reportedHmrStart, {
            writable: true,
            value: void 0
        });
        _class_private_field_loose_base._(this, _updatedModules)[_updatedModules] = new Set();
        _class_private_field_loose_base._(this, _reportedHmrStart)[_reportedHmrStart] = false;
    }
}
function runDeferredReportHmrStart() {
    if (_class_private_field_loose_base._(this, _deferredReportHmrStartId)[_deferredReportHmrStartId] != null) {
        console.log('[Fast Refresh] rebuilding');
        _class_private_field_loose_base._(this, _reportedHmrStart)[_reportedHmrStart] = true;
        _class_private_field_loose_base._(this, _cancelDeferredReportHmrStart)[_cancelDeferredReportHmrStart]();
    }
}
function cancelDeferredReportHmrStart() {
    clearTimeout(_class_private_field_loose_base._(this, _deferredReportHmrStartId)[_deferredReportHmrStartId]);
    _class_private_field_loose_base._(this, _deferredReportHmrStartId)[_deferredReportHmrStartId] = undefined;
}
function onUpdate() {
    _class_private_field_loose_base._(this, _runDeferredReportHmrStart)[_runDeferredReportHmrStart]();
    _class_private_field_loose_base._(this, _lastUpdateMsSinceEpoch)[_lastUpdateMsSinceEpoch] = Date.now();
}
function extractModulesFromTurbopackMessage(data) {
    const updatedModules = new Set();
    const updates = Array.isArray(data) ? data : [
        data
    ];
    for (const update of updates){
        // TODO this won't capture changes to CSS since they don't result in a "merged" update
        if (update.type !== 'partial' || update.instruction.type !== 'ChunkListUpdate' || update.instruction.merged === undefined) {
            continue;
        }
        for (const mergedUpdate of update.instruction.merged){
            for (const name of Object.keys(mergedUpdate.entries)){
                const res = /(.*)\s+\[.*/.exec(name);
                if (res === null) {
                    console.error('[Turbopack HMR] Expected module to match pattern: ' + name);
                    continue;
                }
                updatedModules.add(res[1]);
            }
        }
    }
    return updatedModules;
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=turbopack-hot-reloader-common.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/next-devtools/userspace/app/errors/use-forward-console-log.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "useForwardConsoleLog", {
    enumerable: true,
    get: function() {
        return useForwardConsoleLog;
    }
});
const _react = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
const _forwardlogs = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/next-devtools/userspace/app/forward-logs.js [app-ssr] (ecmascript)");
const useForwardConsoleLog = (socketRef)=>{
    (0, _react.useEffect)(()=>{
        if (!_forwardlogs.isTerminalLoggingEnabled) {
            return;
        }
        const socket = socketRef.current;
        if (!socket) {
            return;
        }
        const onOpen = ()=>{
            _forwardlogs.logQueue.onSocketReady(socket);
        };
        socket.addEventListener('open', onOpen);
        return ()=>{
            socket.removeEventListener('open', onOpen);
        };
    }, [
        socketRef
    ]);
};
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=use-forward-console-log.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/dev/hot-reloader/app/hot-reloader-app.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

/// <reference types="webpack/module.d.ts" />
Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    default: null,
    waitForWebpackRuntimeHotUpdate: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    default: function() {
        return HotReload;
    },
    waitForWebpackRuntimeHotUpdate: function() {
        return waitForWebpackRuntimeHotUpdate;
    }
});
const _interop_require_default = __turbopack_context__.r("[project]/Projects/fmko/node_modules/@swc/helpers/cjs/_interop_require_default.cjs [app-ssr] (ecmascript)");
const _jsxruntime = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-runtime.js [app-ssr] (ecmascript)");
const _react = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
const _stripansi = /*#__PURE__*/ _interop_require_default._(__turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/compiled/strip-ansi/index.js [app-ssr] (ecmascript)"));
const _formatwebpackmessages = /*#__PURE__*/ _interop_require_default._(__turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/shared/lib/format-webpack-messages.js [app-ssr] (ecmascript)"));
const _navigation = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/navigation.js [app-ssr] (ecmascript)");
const _shared = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/dev/hot-reloader/shared.js [app-ssr] (ecmascript)");
const _nextdevtools = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/compiled/next-devtools/index.js [app-ssr] (ecmascript)");
const _replayssronlyerrors = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/next-devtools/userspace/app/errors/replay-ssr-only-errors.js [app-ssr] (ecmascript)");
const _appdevoverlayerrorboundary = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/next-devtools/userspace/app/app-dev-overlay-error-boundary.js [app-ssr] (ecmascript)");
const _useerrorhandler = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/next-devtools/userspace/app/errors/use-error-handler.js [app-ssr] (ecmascript)");
const _runtimeerrorhandler = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/dev/runtime-error-handler.js [app-ssr] (ecmascript)");
const _usewebsocket = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/dev/hot-reloader/app/use-websocket.js [app-ssr] (ecmascript)");
const _hotreloadertypes = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/server/dev/hot-reloader-types.js [app-ssr] (ecmascript)");
const _navigationuntracked = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/navigation-untracked.js [app-ssr] (ecmascript)");
const _reporthmrlatency = /*#__PURE__*/ _interop_require_default._(__turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/dev/report-hmr-latency.js [app-ssr] (ecmascript)"));
const _turbopackhotreloadercommon = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/dev/hot-reloader/turbopack-hot-reloader-common.js [app-ssr] (ecmascript)");
const _approuterheaders = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/app-router-headers.js [app-ssr] (ecmascript)");
const _useforwardconsolelog = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/next-devtools/userspace/app/errors/use-forward-console-log.js [app-ssr] (ecmascript)");
let mostRecentCompilationHash = null;
let __nextDevClientId = Math.round(Math.random() * 100 + Date.now());
let reloading = false;
let webpackStartMsSinceEpoch = null;
const turbopackHmr = ("TURBOPACK compile-time truthy", 1) ? new _turbopackhotreloadercommon.TurbopackHmr() : "TURBOPACK unreachable";
let pendingHotUpdateWebpack = Promise.resolve();
let resolvePendingHotUpdateWebpack = ()=>{};
function setPendingHotUpdateWebpack() {
    pendingHotUpdateWebpack = new Promise((resolve)=>{
        resolvePendingHotUpdateWebpack = ()=>{
            resolve();
        };
    });
}
function waitForWebpackRuntimeHotUpdate() {
    return pendingHotUpdateWebpack;
}
// There is a newer version of the code available.
function handleAvailableHash(hash) {
    // Update last known compilation hash.
    mostRecentCompilationHash = hash;
}
/**
 * Is there a newer version of this code available?
 * For webpack: Check if the hash changed compared to __webpack_hash__
 * For Turbopack: Always true because it doesn't have __webpack_hash__
 */ function isUpdateAvailable() {
    if ("TURBOPACK compile-time truthy", 1) {
        return true;
    }
    //TURBOPACK unreachable
    ;
}
// Webpack disallows updates in other states.
function canApplyUpdates() {
    return module.hot.status() === 'idle';
}
function afterApplyUpdates(fn) {
    if (canApplyUpdates()) {
        fn();
    } else {
        function handler(status) {
            if (status === 'idle') {
                module.hot.removeStatusHandler(handler);
                fn();
            }
        }
        module.hot.addStatusHandler(handler);
    }
}
function performFullReload(err, sendMessage) {
    const stackTrace = err && (err.stack && err.stack.split('\n').slice(0, 5).join('\n') || err.message || err + '');
    sendMessage(JSON.stringify({
        event: 'client-full-reload',
        stackTrace,
        hadRuntimeError: !!_runtimeerrorhandler.RuntimeErrorHandler.hadRuntimeError,
        dependencyChain: err ? err.dependencyChain : undefined
    }));
    if (reloading) return;
    reloading = true;
    window.location.reload();
}
// Attempt to update code on the fly, fall back to a hard reload.
function tryApplyUpdatesWebpack(sendMessage) {
    if (!isUpdateAvailable() || !canApplyUpdates()) {
        resolvePendingHotUpdateWebpack();
        _nextdevtools.dispatcher.onBuildOk();
        (0, _reporthmrlatency.default)(sendMessage, [], webpackStartMsSinceEpoch, Date.now());
        return;
    }
    function handleApplyUpdates(err, updatedModules) {
        if (err || _runtimeerrorhandler.RuntimeErrorHandler.hadRuntimeError || updatedModules == null) {
            if (err) {
                console.warn(_shared.REACT_REFRESH_FULL_RELOAD);
            } else if (_runtimeerrorhandler.RuntimeErrorHandler.hadRuntimeError) {
                console.warn(_shared.REACT_REFRESH_FULL_RELOAD_FROM_ERROR);
            }
            performFullReload(err, sendMessage);
            return;
        }
        _nextdevtools.dispatcher.onBuildOk();
        if (isUpdateAvailable()) {
            // While we were updating, there was a new update! Do it again.
            tryApplyUpdatesWebpack(sendMessage);
            return;
        }
        _nextdevtools.dispatcher.onRefresh();
        resolvePendingHotUpdateWebpack();
        (0, _reporthmrlatency.default)(sendMessage, updatedModules, webpackStartMsSinceEpoch, Date.now());
        if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
        ;
    }
    // https://webpack.js.org/api/hot-module-replacement/#check
    module.hot.check(/* autoApply */ false).then((updatedModules)=>{
        if (updatedModules == null) {
            return null;
        }
        // We should always handle an update, even if updatedModules is empty (but
        // non-null) for any reason. That's what webpack would normally do:
        // https://github.com/webpack/webpack/blob/3aa6b6bc3a64/lib/hmr/HotModuleReplacement.runtime.js#L296-L298
        _nextdevtools.dispatcher.onBeforeRefresh();
        // https://webpack.js.org/api/hot-module-replacement/#apply
        return module.hot.apply();
    }).then((updatedModules)=>{
        handleApplyUpdates(null, updatedModules);
    }, (err)=>{
        handleApplyUpdates(err, null);
    });
}
/** Handles messages from the server for the App Router. */ function processMessage(obj, sendMessage, processTurbopackMessage, router, appIsrManifestRef, pathnameRef) {
    if (!('action' in obj)) {
        return;
    }
    function handleErrors(errors) {
        // "Massage" webpack messages.
        const formatted = (0, _formatwebpackmessages.default)({
            errors: errors,
            warnings: []
        });
        // Only show the first error.
        _nextdevtools.dispatcher.onBuildError(formatted.errors[0]);
        // Also log them to the console.
        for(let i = 0; i < formatted.errors.length; i++){
            console.error((0, _stripansi.default)(formatted.errors[i]));
        }
        // Do not attempt to reload now.
        // We will reload on next success instead.
        if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
        ;
    }
    function handleHotUpdate() {
        if ("TURBOPACK compile-time truthy", 1) {
            const hmrUpdate = turbopackHmr.onBuilt();
            if (hmrUpdate != null) {
                (0, _reporthmrlatency.default)(sendMessage, [
                    ...hmrUpdate.updatedModules
                ], hmrUpdate.startMsSinceEpoch, hmrUpdate.endMsSinceEpoch, hmrUpdate.hasUpdates);
            }
            _nextdevtools.dispatcher.onBuildOk();
        } else //TURBOPACK unreachable
        ;
    }
    switch(obj.action){
        case _hotreloadertypes.HMR_ACTIONS_SENT_TO_BROWSER.ISR_MANIFEST:
            {
                if ("TURBOPACK compile-time truthy", 1) {
                    if (appIsrManifestRef) {
                        appIsrManifestRef.current = obj.data;
                        // handle initial status on receiving manifest
                        // navigation is handled in useEffect for pathname changes
                        // as we'll receive the updated manifest before usePathname
                        // triggers for new value
                        if (pathnameRef.current in obj.data) {
                            _nextdevtools.dispatcher.onStaticIndicator(true);
                        } else {
                            _nextdevtools.dispatcher.onStaticIndicator(false);
                        }
                    }
                }
                break;
            }
        case _hotreloadertypes.HMR_ACTIONS_SENT_TO_BROWSER.BUILDING:
            {
                _nextdevtools.dispatcher.buildingIndicatorShow();
                if ("TURBOPACK compile-time truthy", 1) {
                    turbopackHmr.onBuilding();
                } else //TURBOPACK unreachable
                ;
                break;
            }
        case _hotreloadertypes.HMR_ACTIONS_SENT_TO_BROWSER.BUILT:
        case _hotreloadertypes.HMR_ACTIONS_SENT_TO_BROWSER.SYNC:
            {
                _nextdevtools.dispatcher.buildingIndicatorHide();
                if (obj.hash) {
                    handleAvailableHash(obj.hash);
                }
                const { errors, warnings } = obj;
                // Is undefined when it's a 'built' event
                if ('versionInfo' in obj) _nextdevtools.dispatcher.onVersionInfo(obj.versionInfo);
                if ('debug' in obj && obj.debug) _nextdevtools.dispatcher.onDebugInfo(obj.debug);
                if ('devIndicator' in obj) _nextdevtools.dispatcher.onDevIndicator(obj.devIndicator);
                if ('devToolsConfig' in obj) _nextdevtools.dispatcher.onDevToolsConfig(obj.devToolsConfig);
                const hasErrors = Boolean(errors && errors.length);
                // Compilation with errors (e.g. syntax error or missing modules).
                if (hasErrors) {
                    sendMessage(JSON.stringify({
                        event: 'client-error',
                        errorCount: errors.length,
                        clientId: __nextDevClientId
                    }));
                    handleErrors(errors);
                    return;
                }
                const hasWarnings = Boolean(warnings && warnings.length);
                if (hasWarnings) {
                    sendMessage(JSON.stringify({
                        event: 'client-warning',
                        warningCount: warnings.length,
                        clientId: __nextDevClientId
                    }));
                    // Print warnings to the console.
                    const formattedMessages = (0, _formatwebpackmessages.default)({
                        warnings: warnings,
                        errors: []
                    });
                    for(let i = 0; i < formattedMessages.warnings.length; i++){
                        if (i === 5) {
                            console.warn('There were more warnings in other files.\n' + 'You can find a complete log in the terminal.');
                            break;
                        }
                        console.warn((0, _stripansi.default)(formattedMessages.warnings[i]));
                    }
                // No early return here as we need to apply modules in the same way between warnings only and compiles without warnings
                }
                sendMessage(JSON.stringify({
                    event: 'client-success',
                    clientId: __nextDevClientId
                }));
                if (obj.action === _hotreloadertypes.HMR_ACTIONS_SENT_TO_BROWSER.BUILT) {
                    handleHotUpdate();
                }
                return;
            }
        case _hotreloadertypes.HMR_ACTIONS_SENT_TO_BROWSER.TURBOPACK_CONNECTED:
            {
                processTurbopackMessage({
                    type: _hotreloadertypes.HMR_ACTIONS_SENT_TO_BROWSER.TURBOPACK_CONNECTED,
                    data: {
                        sessionId: obj.data.sessionId
                    }
                });
                break;
            }
        case _hotreloadertypes.HMR_ACTIONS_SENT_TO_BROWSER.TURBOPACK_MESSAGE:
            {
                turbopackHmr.onTurbopackMessage(obj);
                _nextdevtools.dispatcher.onBeforeRefresh();
                processTurbopackMessage({
                    type: _hotreloadertypes.HMR_ACTIONS_SENT_TO_BROWSER.TURBOPACK_MESSAGE,
                    data: obj.data
                });
                if (_runtimeerrorhandler.RuntimeErrorHandler.hadRuntimeError) {
                    console.warn(_shared.REACT_REFRESH_FULL_RELOAD_FROM_ERROR);
                    performFullReload(null, sendMessage);
                }
                _nextdevtools.dispatcher.onRefresh();
                break;
            }
        // TODO-APP: make server component change more granular
        case _hotreloadertypes.HMR_ACTIONS_SENT_TO_BROWSER.SERVER_COMPONENT_CHANGES:
            {
                turbopackHmr == null ? void 0 : turbopackHmr.onServerComponentChanges();
                sendMessage(JSON.stringify({
                    event: 'server-component-reload-page',
                    clientId: __nextDevClientId,
                    hash: obj.hash
                }));
                // Store the latest hash in a session cookie so that it's sent back to the
                // server with any subsequent requests.
                document.cookie = _approuterheaders.NEXT_HMR_REFRESH_HASH_COOKIE + "=" + obj.hash + ";path=/";
                if (_runtimeerrorhandler.RuntimeErrorHandler.hadRuntimeError || document.documentElement.id === '__next_error__') {
                    if (reloading) return;
                    reloading = true;
                    return window.location.reload();
                }
                (0, _react.startTransition)(()=>{
                    router.hmrRefresh();
                    _nextdevtools.dispatcher.onRefresh();
                });
                if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
                ;
                return;
            }
        case _hotreloadertypes.HMR_ACTIONS_SENT_TO_BROWSER.RELOAD_PAGE:
            {
                turbopackHmr == null ? void 0 : turbopackHmr.onReloadPage();
                sendMessage(JSON.stringify({
                    event: 'client-reload-page',
                    clientId: __nextDevClientId
                }));
                if (reloading) return;
                reloading = true;
                return window.location.reload();
            }
        case _hotreloadertypes.HMR_ACTIONS_SENT_TO_BROWSER.ADDED_PAGE:
        case _hotreloadertypes.HMR_ACTIONS_SENT_TO_BROWSER.REMOVED_PAGE:
            {
                turbopackHmr == null ? void 0 : turbopackHmr.onPageAddRemove();
                // TODO-APP: potentially only refresh if the currently viewed page was added/removed.
                return router.hmrRefresh();
            }
        case _hotreloadertypes.HMR_ACTIONS_SENT_TO_BROWSER.SERVER_ERROR:
            {
                const { errorJSON } = obj;
                if (errorJSON) {
                    const { message, stack } = JSON.parse(errorJSON);
                    const error = Object.defineProperty(new Error(message), "__NEXT_ERROR_CODE", {
                        value: "E394",
                        enumerable: false,
                        configurable: true
                    });
                    error.stack = stack;
                    handleErrors([
                        error
                    ]);
                }
                return;
            }
        case _hotreloadertypes.HMR_ACTIONS_SENT_TO_BROWSER.DEV_PAGES_MANIFEST_UPDATE:
            {
                return;
            }
        case _hotreloadertypes.HMR_ACTIONS_SENT_TO_BROWSER.DEVTOOLS_CONFIG:
            {
                _nextdevtools.dispatcher.onDevToolsConfig(obj.data);
                return;
            }
        default:
            {
                obj;
            }
    }
}
function HotReload(param) {
    let { assetPrefix, children, globalError } = param;
    (0, _useerrorhandler.useErrorHandler)(_nextdevtools.dispatcher.onUnhandledError, _nextdevtools.dispatcher.onUnhandledRejection);
    const webSocketRef = (0, _usewebsocket.useWebsocket)(assetPrefix);
    (0, _usewebsocket.useWebsocketPing)(webSocketRef);
    const sendMessage = (0, _usewebsocket.useSendMessage)(webSocketRef);
    (0, _useforwardconsolelog.useForwardConsoleLog)(webSocketRef);
    const processTurbopackMessage = (0, _usewebsocket.useTurbopack)(sendMessage, (err)=>performFullReload(err, sendMessage));
    const router = (0, _navigation.useRouter)();
    // We don't want access of the pathname for the dev tools to trigger a dynamic
    // access (as the dev overlay will never be present in production).
    const pathname = (0, _navigationuntracked.useUntrackedPathname)();
    const appIsrManifestRef = (0, _react.useRef)({});
    const pathnameRef = (0, _react.useRef)(pathname);
    if ("TURBOPACK compile-time truthy", 1) {
        // this conditional is only for dead-code elimination which
        // isn't a runtime conditional only build-time so ignore hooks rule
        // eslint-disable-next-line react-hooks/rules-of-hooks
        (0, _react.useEffect)(()=>{
            pathnameRef.current = pathname;
            const appIsrManifest = appIsrManifestRef.current;
            if (appIsrManifest) {
                if (pathname && pathname in appIsrManifest) {
                    try {
                        _nextdevtools.dispatcher.onStaticIndicator(true);
                    } catch (reason) {
                        let message = '';
                        if (reason instanceof DOMException) {
                            var _reason_stack;
                            // Most likely a SecurityError, because of an unavailable localStorage
                            message = (_reason_stack = reason.stack) != null ? _reason_stack : reason.message;
                        } else if (reason instanceof Error) {
                            var _reason_stack1;
                            message = 'Error: ' + reason.message + '\n' + ((_reason_stack1 = reason.stack) != null ? _reason_stack1 : '');
                        } else {
                            message = 'Unexpected Exception: ' + reason;
                        }
                        console.warn('[HMR] ' + message);
                    }
                } else {
                    _nextdevtools.dispatcher.onStaticIndicator(false);
                }
            }
        }, [
            pathname
        ]);
    }
    (0, _react.useEffect)(()=>{
        const websocket = webSocketRef.current;
        if (!websocket) return;
        const handler = (event)=>{
            try {
                const obj = JSON.parse(event.data);
                processMessage(obj, sendMessage, processTurbopackMessage, router, appIsrManifestRef, pathnameRef);
            } catch (err) {
                (0, _shared.reportInvalidHmrMessage)(event, err);
            }
        };
        websocket.addEventListener('message', handler);
        return ()=>websocket.removeEventListener('message', handler);
    }, [
        sendMessage,
        router,
        webSocketRef,
        processTurbopackMessage,
        appIsrManifestRef
    ]);
    return /*#__PURE__*/ (0, _jsxruntime.jsxs)(_appdevoverlayerrorboundary.AppDevOverlayErrorBoundary, {
        globalError: globalError,
        children: [
            /*#__PURE__*/ (0, _jsxruntime.jsx)(_replayssronlyerrors.ReplaySsrOnlyErrors, {
                onBlockingError: _nextdevtools.dispatcher.openErrorOverlay
            }),
            children
        ]
    });
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=hot-reloader-app.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/components/app-router.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    createEmptyCacheNode: null,
    createPrefetchURL: null,
    default: null,
    isExternalURL: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    createEmptyCacheNode: function() {
        return createEmptyCacheNode;
    },
    createPrefetchURL: function() {
        return createPrefetchURL;
    },
    default: function() {
        return AppRouter;
    },
    isExternalURL: function() {
        return isExternalURL;
    }
});
const _interop_require_default = __turbopack_context__.r("[project]/Projects/fmko/node_modules/@swc/helpers/cjs/_interop_require_default.cjs [app-ssr] (ecmascript)");
const _interop_require_wildcard = __turbopack_context__.r("[project]/Projects/fmko/node_modules/@swc/helpers/cjs/_interop_require_wildcard.cjs [app-ssr] (ecmascript)");
const _jsxruntime = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-runtime.js [app-ssr] (ecmascript)");
const _react = /*#__PURE__*/ _interop_require_wildcard._(__turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)"));
const _approutercontextsharedruntime = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/server/route-modules/app-page/vendored/contexts/app-router-context.js [app-ssr] (ecmascript)");
const _routerreducertypes = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/router-reducer-types.js [app-ssr] (ecmascript)");
const _createhreffromurl = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/create-href-from-url.js [app-ssr] (ecmascript)");
const _hooksclientcontextsharedruntime = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/server/route-modules/app-page/vendored/contexts/hooks-client-context.js [app-ssr] (ecmascript)");
const _useactionqueue = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/use-action-queue.js [app-ssr] (ecmascript)");
const _isbot = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/shared/lib/router/utils/is-bot.js [app-ssr] (ecmascript)");
const _addbasepath = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/add-base-path.js [app-ssr] (ecmascript)");
const _approuterannouncer = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/app-router-announcer.js [app-ssr] (ecmascript)");
const _redirectboundary = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/redirect-boundary.js [app-ssr] (ecmascript)");
const _findheadincache = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/reducers/find-head-in-cache.js [app-ssr] (ecmascript)");
const _unresolvedthenable = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/unresolved-thenable.js [app-ssr] (ecmascript)");
const _removebasepath = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/remove-base-path.js [app-ssr] (ecmascript)");
const _hasbasepath = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/has-base-path.js [app-ssr] (ecmascript)");
const _computechangedpath = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/compute-changed-path.js [app-ssr] (ecmascript)");
const _navfailurehandler = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/nav-failure-handler.js [app-ssr] (ecmascript)");
const _approuterinstance = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/app-router-instance.js [app-ssr] (ecmascript)");
const _redirect = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/redirect.js [app-ssr] (ecmascript)");
const _redirecterror = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/redirect-error.js [app-ssr] (ecmascript)");
const _links = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/links.js [app-ssr] (ecmascript)");
const _rooterrorboundary = /*#__PURE__*/ _interop_require_default._(__turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/errors/root-error-boundary.js [app-ssr] (ecmascript)"));
const _globalerror = /*#__PURE__*/ _interop_require_default._(__turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/builtin/global-error.js [app-ssr] (ecmascript)"));
const _boundarycomponents = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/lib/framework/boundary-components.js [app-ssr] (ecmascript)");
const globalMutable = {};
function isExternalURL(url) {
    return url.origin !== window.location.origin;
}
function createPrefetchURL(href) {
    // Don't prefetch for bots as they don't navigate.
    if ((0, _isbot.isBot)(window.navigator.userAgent)) {
        return null;
    }
    let url;
    try {
        url = new URL((0, _addbasepath.addBasePath)(href), window.location.href);
    } catch (_) {
        // TODO: Does this need to throw or can we just console.error instead? Does
        // anyone rely on this throwing? (Seems unlikely.)
        throw Object.defineProperty(new Error("Cannot prefetch '" + href + "' because it cannot be converted to a URL."), "__NEXT_ERROR_CODE", {
            value: "E234",
            enumerable: false,
            configurable: true
        });
    }
    // Don't prefetch during development (improves compilation performance)
    if ("TURBOPACK compile-time truthy", 1) {
        return null;
    }
    //TURBOPACK unreachable
    ;
}
function HistoryUpdater(param) {
    let { appRouterState } = param;
    (0, _react.useInsertionEffect)(()=>{
        if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
        ;
        const { tree, pushRef, canonicalUrl } = appRouterState;
        const historyState = {
            ...pushRef.preserveCustomHistoryState ? window.history.state : {},
            // Identifier is shortened intentionally.
            // __NA is used to identify if the history entry can be handled by the app-router.
            // __N is used to identify if the history entry can be handled by the old router.
            __NA: true,
            __PRIVATE_NEXTJS_INTERNALS_TREE: tree
        };
        if (pushRef.pendingPush && // Skip pushing an additional history entry if the canonicalUrl is the same as the current url.
        // This mirrors the browser behavior for normal navigation.
        (0, _createhreffromurl.createHrefFromUrl)(new URL(window.location.href)) !== canonicalUrl) {
            // This intentionally mutates React state, pushRef is overwritten to ensure additional push/replace calls do not trigger an additional history entry.
            pushRef.pendingPush = false;
            window.history.pushState(historyState, '', canonicalUrl);
        } else {
            window.history.replaceState(historyState, '', canonicalUrl);
        }
    }, [
        appRouterState
    ]);
    (0, _react.useEffect)(()=>{
        // The Next-Url and the base tree may affect the result of a prefetch
        // task. Re-prefetch all visible links with the updated values. In most
        // cases, this will not result in any new network requests, only if
        // the prefetch result actually varies on one of these inputs.
        if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
        ;
    }, [
        appRouterState.nextUrl,
        appRouterState.tree
    ]);
    return null;
}
function createEmptyCacheNode() {
    return {
        lazyData: null,
        rsc: null,
        prefetchRsc: null,
        head: null,
        prefetchHead: null,
        parallelRoutes: new Map(),
        loading: null,
        navigatedAt: -1
    };
}
function copyNextJsInternalHistoryState(data) {
    if (data == null) data = {};
    const currentState = window.history.state;
    const __NA = currentState == null ? void 0 : currentState.__NA;
    if (__NA) {
        data.__NA = __NA;
    }
    const __PRIVATE_NEXTJS_INTERNALS_TREE = currentState == null ? void 0 : currentState.__PRIVATE_NEXTJS_INTERNALS_TREE;
    if (__PRIVATE_NEXTJS_INTERNALS_TREE) {
        data.__PRIVATE_NEXTJS_INTERNALS_TREE = __PRIVATE_NEXTJS_INTERNALS_TREE;
    }
    return data;
}
function Head(param) {
    let { headCacheNode } = param;
    // If this segment has a `prefetchHead`, it's the statically prefetched data.
    // We should use that on initial render instead of `head`. Then we'll switch
    // to `head` when the dynamic response streams in.
    const head = headCacheNode !== null ? headCacheNode.head : null;
    const prefetchHead = headCacheNode !== null ? headCacheNode.prefetchHead : null;
    // If no prefetch data is available, then we go straight to rendering `head`.
    const resolvedPrefetchRsc = prefetchHead !== null ? prefetchHead : head;
    // We use `useDeferredValue` to handle switching between the prefetched and
    // final values. The second argument is returned on initial render, then it
    // re-renders with the first argument.
    return (0, _react.useDeferredValue)(head, resolvedPrefetchRsc);
}
/**
 * The global router that wraps the application components.
 */ function Router(param) {
    let { actionQueue, assetPrefix, globalError } = param;
    const state = (0, _useactionqueue.useActionQueue)(actionQueue);
    const { canonicalUrl } = state;
    // Add memoized pathname/query for useSearchParams and usePathname.
    const { searchParams, pathname } = (0, _react.useMemo)(()=>{
        const url = new URL(canonicalUrl, ("TURBOPACK compile-time truthy", 1) ? 'http://n' : "TURBOPACK unreachable");
        return {
            // This is turned into a readonly class in `useSearchParams`
            searchParams: url.searchParams,
            pathname: (0, _hasbasepath.hasBasePath)(url.pathname) ? (0, _removebasepath.removeBasePath)(url.pathname) : url.pathname
        };
    }, [
        canonicalUrl
    ]);
    if ("TURBOPACK compile-time truthy", 1) {
        // eslint-disable-next-line react-hooks/rules-of-hooks
        const { cache, prefetchCache, tree } = state;
        // This hook is in a conditional but that is ok because `process.env.NODE_ENV` never changes
        // eslint-disable-next-line react-hooks/rules-of-hooks
        (0, _react.useEffect)(()=>{
            // Add `window.nd` for debugging purposes.
            // This is not meant for use in applications as concurrent rendering will affect the cache/tree/router.
            // @ts-ignore this is for debugging
            window.nd = {
                router: _approuterinstance.publicAppRouterInstance,
                cache,
                prefetchCache,
                tree
            };
        }, [
            cache,
            prefetchCache,
            tree
        ]);
    }
    (0, _react.useEffect)(()=>{
        // If the app is restored from bfcache, it's possible that
        // pushRef.mpaNavigation is true, which would mean that any re-render of this component
        // would trigger the mpa navigation logic again from the lines below.
        // This will restore the router to the initial state in the event that the app is restored from bfcache.
        function handlePageShow(event) {
            var _window_history_state;
            if (!event.persisted || !((_window_history_state = window.history.state) == null ? void 0 : _window_history_state.__PRIVATE_NEXTJS_INTERNALS_TREE)) {
                return;
            }
            // Clear the pendingMpaPath value so that a subsequent MPA navigation to the same URL can be triggered.
            // This is necessary because if the browser restored from bfcache, the pendingMpaPath would still be set to the value
            // of the last MPA navigation.
            globalMutable.pendingMpaPath = undefined;
            (0, _useactionqueue.dispatchAppRouterAction)({
                type: _routerreducertypes.ACTION_RESTORE,
                url: new URL(window.location.href),
                tree: window.history.state.__PRIVATE_NEXTJS_INTERNALS_TREE
            });
        }
        window.addEventListener('pageshow', handlePageShow);
        return ()=>{
            window.removeEventListener('pageshow', handlePageShow);
        };
    }, []);
    (0, _react.useEffect)(()=>{
        // Ensure that any redirect errors that bubble up outside of the RedirectBoundary
        // are caught and handled by the router.
        function handleUnhandledRedirect(event) {
            const error = 'reason' in event ? event.reason : event.error;
            if ((0, _redirecterror.isRedirectError)(error)) {
                event.preventDefault();
                const url = (0, _redirect.getURLFromRedirectError)(error);
                const redirectType = (0, _redirect.getRedirectTypeFromError)(error);
                // TODO: This should access the router methods directly, rather than
                // go through the public interface.
                if (redirectType === _redirecterror.RedirectType.push) {
                    _approuterinstance.publicAppRouterInstance.push(url, {});
                } else {
                    _approuterinstance.publicAppRouterInstance.replace(url, {});
                }
            }
        }
        window.addEventListener('error', handleUnhandledRedirect);
        window.addEventListener('unhandledrejection', handleUnhandledRedirect);
        return ()=>{
            window.removeEventListener('error', handleUnhandledRedirect);
            window.removeEventListener('unhandledrejection', handleUnhandledRedirect);
        };
    }, []);
    // When mpaNavigation flag is set do a hard navigation to the new url.
    // Infinitely suspend because we don't actually want to rerender any child
    // components with the new URL and any entangled state updates shouldn't
    // commit either (eg: useTransition isPending should stay true until the page
    // unloads).
    //
    // This is a side effect in render. Don't try this at home, kids. It's
    // probably safe because we know this is a singleton component and it's never
    // in <Offscreen>. At least I hope so. (It will run twice in dev strict mode,
    // but that's... fine?)
    const { pushRef } = state;
    if (pushRef.mpaNavigation) {
        // if there's a re-render, we don't want to trigger another redirect if one is already in flight to the same URL
        if (globalMutable.pendingMpaPath !== canonicalUrl) {
            const location = window.location;
            if (pushRef.pendingPush) {
                location.assign(canonicalUrl);
            } else {
                location.replace(canonicalUrl);
            }
            globalMutable.pendingMpaPath = canonicalUrl;
        }
        // TODO-APP: Should we listen to navigateerror here to catch failed
        // navigations somehow? And should we call window.stop() if a SPA navigation
        // should interrupt an MPA one?
        // NOTE: This is intentionally using `throw` instead of `use` because we're
        // inside an externally mutable condition (pushRef.mpaNavigation), which
        // violates the rules of hooks.
        throw _unresolvedthenable.unresolvedThenable;
    }
    (0, _react.useEffect)(()=>{
        const originalPushState = window.history.pushState.bind(window.history);
        const originalReplaceState = window.history.replaceState.bind(window.history);
        // Ensure the canonical URL in the Next.js Router is updated when the URL is changed so that `usePathname` and `useSearchParams` hold the pushed values.
        const applyUrlFromHistoryPushReplace = (url)=>{
            var _window_history_state;
            const href = window.location.href;
            const tree = (_window_history_state = window.history.state) == null ? void 0 : _window_history_state.__PRIVATE_NEXTJS_INTERNALS_TREE;
            (0, _react.startTransition)(()=>{
                (0, _useactionqueue.dispatchAppRouterAction)({
                    type: _routerreducertypes.ACTION_RESTORE,
                    url: new URL(url != null ? url : href, href),
                    tree
                });
            });
        };
        /**
     * Patch pushState to ensure external changes to the history are reflected in the Next.js Router.
     * Ensures Next.js internal history state is copied to the new history entry.
     * Ensures usePathname and useSearchParams hold the newly provided url.
     */ window.history.pushState = function pushState(data, _unused, url) {
            // Avoid a loop when Next.js internals trigger pushState/replaceState
            if ((data == null ? void 0 : data.__NA) || (data == null ? void 0 : data._N)) {
                return originalPushState(data, _unused, url);
            }
            data = copyNextJsInternalHistoryState(data);
            if (url) {
                applyUrlFromHistoryPushReplace(url);
            }
            return originalPushState(data, _unused, url);
        };
        /**
     * Patch replaceState to ensure external changes to the history are reflected in the Next.js Router.
     * Ensures Next.js internal history state is copied to the new history entry.
     * Ensures usePathname and useSearchParams hold the newly provided url.
     */ window.history.replaceState = function replaceState(data, _unused, url) {
            // Avoid a loop when Next.js internals trigger pushState/replaceState
            if ((data == null ? void 0 : data.__NA) || (data == null ? void 0 : data._N)) {
                return originalReplaceState(data, _unused, url);
            }
            data = copyNextJsInternalHistoryState(data);
            if (url) {
                applyUrlFromHistoryPushReplace(url);
            }
            return originalReplaceState(data, _unused, url);
        };
        /**
     * Handle popstate event, this is used to handle back/forward in the browser.
     * By default dispatches ACTION_RESTORE, however if the history entry was not pushed/replaced by app-router it will reload the page.
     * That case can happen when the old router injected the history entry.
     */ const onPopState = (event)=>{
            if (!event.state) {
                // TODO-APP: this case only happens when pushState/replaceState was called outside of Next.js. It should probably reload the page in this case.
                return;
            }
            // This case happens when the history entry was pushed by the `pages` router.
            if (!event.state.__NA) {
                window.location.reload();
                return;
            }
            // TODO-APP: Ideally the back button should not use startTransition as it should apply the updates synchronously
            // Without startTransition works if the cache is there for this path
            (0, _react.startTransition)(()=>{
                (0, _approuterinstance.dispatchTraverseAction)(window.location.href, event.state.__PRIVATE_NEXTJS_INTERNALS_TREE);
            });
        };
        // Register popstate event to call onPopstate.
        window.addEventListener('popstate', onPopState);
        return ()=>{
            window.history.pushState = originalPushState;
            window.history.replaceState = originalReplaceState;
            window.removeEventListener('popstate', onPopState);
        };
    }, []);
    const { cache, tree, nextUrl, focusAndScrollRef } = state;
    const matchingHead = (0, _react.useMemo)(()=>{
        return (0, _findheadincache.findHeadInCache)(cache, tree[1]);
    }, [
        cache,
        tree
    ]);
    // Add memoized pathParams for useParams.
    const pathParams = (0, _react.useMemo)(()=>{
        return (0, _computechangedpath.getSelectedParams)(tree);
    }, [
        tree
    ]);
    const layoutRouterContext = (0, _react.useMemo)(()=>{
        return {
            parentTree: tree,
            parentCacheNode: cache,
            parentSegmentPath: null,
            // Root node always has `url`
            // Provided in AppTreeContext to ensure it can be overwritten in layout-router
            url: canonicalUrl
        };
    }, [
        tree,
        cache,
        canonicalUrl
    ]);
    const globalLayoutRouterContext = (0, _react.useMemo)(()=>{
        return {
            tree,
            focusAndScrollRef,
            nextUrl
        };
    }, [
        tree,
        focusAndScrollRef,
        nextUrl
    ]);
    let head;
    if (matchingHead !== null) {
        // The head is wrapped in an extra component so we can use
        // `useDeferredValue` to swap between the prefetched and final versions of
        // the head. (This is what LayoutRouter does for segment data, too.)
        //
        // The `key` is used to remount the component whenever the head moves to
        // a different segment.
        const [headCacheNode, headKey, headKeyWithoutSearchParams] = matchingHead;
        head = /*#__PURE__*/ (0, _jsxruntime.jsx)(Head, {
            headCacheNode: headCacheNode
        }, ("TURBOPACK compile-time truthy", 1) ? headKeyWithoutSearchParams : "TURBOPACK unreachable");
    } else {
        head = null;
    }
    let content = /*#__PURE__*/ (0, _jsxruntime.jsxs)(_redirectboundary.RedirectBoundary, {
        children: [
            head,
            /*#__PURE__*/ (0, _jsxruntime.jsx)(_boundarycomponents.RootLayoutBoundary, {
                children: cache.rsc
            }),
            /*#__PURE__*/ (0, _jsxruntime.jsx)(_approuterannouncer.AppRouterAnnouncer, {
                tree: tree
            })
        ]
    });
    if ("TURBOPACK compile-time truthy", 1) {
        // In development, we apply few error boundaries and hot-reloader:
        // - DevRootHTTPAccessFallbackBoundary: avoid using navigation API like notFound() in root layout
        // - HotReloader:
        //  - hot-reload the app when the code changes
        //  - render dev overlay
        //  - catch runtime errors and display global-error when necessary
        if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
        ;
        const HotReloader = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/dev/hot-reloader/app/hot-reloader-app.js [app-ssr] (ecmascript)").default;
        content = /*#__PURE__*/ (0, _jsxruntime.jsx)(HotReloader, {
            assetPrefix: assetPrefix,
            globalError: globalError,
            children: content
        });
    } else //TURBOPACK unreachable
    ;
    return /*#__PURE__*/ (0, _jsxruntime.jsxs)(_jsxruntime.Fragment, {
        children: [
            /*#__PURE__*/ (0, _jsxruntime.jsx)(HistoryUpdater, {
                appRouterState: state
            }),
            /*#__PURE__*/ (0, _jsxruntime.jsx)(RuntimeStyles, {}),
            /*#__PURE__*/ (0, _jsxruntime.jsx)(_hooksclientcontextsharedruntime.PathParamsContext.Provider, {
                value: pathParams,
                children: /*#__PURE__*/ (0, _jsxruntime.jsx)(_hooksclientcontextsharedruntime.PathnameContext.Provider, {
                    value: pathname,
                    children: /*#__PURE__*/ (0, _jsxruntime.jsx)(_hooksclientcontextsharedruntime.SearchParamsContext.Provider, {
                        value: searchParams,
                        children: /*#__PURE__*/ (0, _jsxruntime.jsx)(_approutercontextsharedruntime.GlobalLayoutRouterContext.Provider, {
                            value: globalLayoutRouterContext,
                            children: /*#__PURE__*/ (0, _jsxruntime.jsx)(_approutercontextsharedruntime.AppRouterContext.Provider, {
                                value: _approuterinstance.publicAppRouterInstance,
                                children: /*#__PURE__*/ (0, _jsxruntime.jsx)(_approutercontextsharedruntime.LayoutRouterContext.Provider, {
                                    value: layoutRouterContext,
                                    children: content
                                })
                            })
                        })
                    })
                })
            })
        ]
    });
}
function AppRouter(param) {
    let { actionQueue, globalErrorState, assetPrefix } = param;
    (0, _navfailurehandler.useNavFailureHandler)();
    const router = /*#__PURE__*/ (0, _jsxruntime.jsx)(Router, {
        actionQueue: actionQueue,
        assetPrefix: assetPrefix,
        globalError: globalErrorState
    });
    // At the very top level, use the default GlobalError component as the final fallback.
    // When the app router itself fails, which means the framework itself fails, we show the default error.
    return /*#__PURE__*/ (0, _jsxruntime.jsx)(_rooterrorboundary.default, {
        errorComponent: _globalerror.default,
        children: router
    });
}
const runtimeStyles = new Set();
let runtimeStyleChanged = new Set();
globalThis._N_E_STYLE_LOAD = function(href) {
    let len = runtimeStyles.size;
    runtimeStyles.add(href);
    if (runtimeStyles.size !== len) {
        runtimeStyleChanged.forEach((cb)=>cb());
    }
    // TODO figure out how to get a promise here
    // But maybe it's not necessary as react would block rendering until it's loaded
    return Promise.resolve();
};
function RuntimeStyles() {
    const [, forceUpdate] = _react.default.useState(0);
    const renderedStylesSize = runtimeStyles.size;
    (0, _react.useEffect)(()=>{
        const changed = ()=>forceUpdate((c)=>c + 1);
        runtimeStyleChanged.add(changed);
        if (renderedStylesSize !== runtimeStyles.size) {
            changed();
        }
        return ()=>{
            runtimeStyleChanged.delete(changed);
        };
    }, [
        renderedStylesSize,
        forceUpdate
    ]);
    const dplId = ("TURBOPACK compile-time falsy", 0) ? "TURBOPACK unreachable" : '';
    return [
        ...runtimeStyles
    ].map((href, i)=>/*#__PURE__*/ (0, _jsxruntime.jsx)("link", {
            rel: "stylesheet",
            href: "" + href + dplId,
            // @ts-ignore
            precedence: "next"
        }, i));
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=app-router.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/ppr-navigations.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    abortTask: null,
    listenForDynamicRequest: null,
    startPPRNavigation: null,
    updateCacheNodeOnPopstateRestoration: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    abortTask: function() {
        return abortTask;
    },
    listenForDynamicRequest: function() {
        return listenForDynamicRequest;
    },
    startPPRNavigation: function() {
        return startPPRNavigation;
    },
    updateCacheNodeOnPopstateRestoration: function() {
        return updateCacheNodeOnPopstateRestoration;
    }
});
const _segment = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/shared/lib/segment.js [app-ssr] (ecmascript)");
const _matchsegments = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/match-segments.js [app-ssr] (ecmascript)");
const _createroutercachekey = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/create-router-cache-key.js [app-ssr] (ecmascript)");
const _isnavigatingtonewrootlayout = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/is-navigating-to-new-root-layout.js [app-ssr] (ecmascript)");
const _prefetchcacheutils = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/prefetch-cache-utils.js [app-ssr] (ecmascript)");
const MPA_NAVIGATION_TASK = {
    route: null,
    node: null,
    dynamicRequestTree: null,
    children: null
};
function startPPRNavigation(navigatedAt, oldCacheNode, oldRouterState, newRouterState, prefetchData, prefetchHead, isPrefetchHeadPartial, isSamePageNavigation, scrollableSegmentsResult) {
    const segmentPath = [];
    return updateCacheNodeOnNavigation(navigatedAt, oldCacheNode, oldRouterState, newRouterState, false, prefetchData, prefetchHead, isPrefetchHeadPartial, isSamePageNavigation, segmentPath, scrollableSegmentsResult);
}
function updateCacheNodeOnNavigation(navigatedAt, oldCacheNode, oldRouterState, newRouterState, didFindRootLayout, prefetchData, prefetchHead, isPrefetchHeadPartial, isSamePageNavigation, segmentPath, scrollableSegmentsResult) {
    // Diff the old and new trees to reuse the shared layouts.
    const oldRouterStateChildren = oldRouterState[1];
    const newRouterStateChildren = newRouterState[1];
    const prefetchDataChildren = prefetchData !== null ? prefetchData[2] : null;
    if (!didFindRootLayout) {
        // We're currently traversing the part of the tree that was also part of
        // the previous route. If we discover a root layout, then we don't need to
        // trigger an MPA navigation. See beginRenderingNewRouteTree for context.
        const isRootLayout = newRouterState[4] === true;
        if (isRootLayout) {
            // Found a matching root layout.
            didFindRootLayout = true;
        }
    }
    const oldParallelRoutes = oldCacheNode.parallelRoutes;
    // Clone the current set of segment children, even if they aren't active in
    // the new tree.
    // TODO: We currently retain all the inactive segments indefinitely, until
    // there's an explicit refresh, or a parent layout is lazily refreshed. We
    // rely on this for popstate navigations, which update the Router State Tree
    // but do not eagerly perform a data fetch, because they expect the segment
    // data to already be in the Cache Node tree. For highly static sites that
    // are mostly read-only, this may happen only rarely, causing memory to
    // leak. We should figure out a better model for the lifetime of inactive
    // segments, so we can maintain instant back/forward navigations without
    // leaking memory indefinitely.
    const prefetchParallelRoutes = new Map(oldParallelRoutes);
    // As we diff the trees, we may sometimes modify (copy-on-write, not mutate)
    // the Route Tree that was returned by the server — for example, in the case
    // of default parallel routes, we preserve the currently active segment. To
    // avoid mutating the original tree, we clone the router state children along
    // the return path.
    let patchedRouterStateChildren = {};
    let taskChildren = null;
    // Most navigations require a request to fetch additional data from the
    // server, either because the data was not already prefetched, or because the
    // target route contains dynamic data that cannot be prefetched.
    //
    // However, if the target route is fully static, and it's already completely
    // loaded into the segment cache, then we can skip the server request.
    //
    // This starts off as `false`, and is set to `true` if any of the child
    // routes requires a dynamic request.
    let needsDynamicRequest = false;
    // As we traverse the children, we'll construct a FlightRouterState that can
    // be sent to the server to request the dynamic data. If it turns out that
    // nothing in the subtree is dynamic (i.e. needsDynamicRequest is false at the
    // end), then this will be discarded.
    // TODO: We can probably optimize the format of this data structure to only
    // include paths that are dynamic. Instead of reusing the
    // FlightRouterState type.
    let dynamicRequestTreeChildren = {};
    for(let parallelRouteKey in newRouterStateChildren){
        const newRouterStateChild = newRouterStateChildren[parallelRouteKey];
        const oldRouterStateChild = oldRouterStateChildren[parallelRouteKey];
        const oldSegmentMapChild = oldParallelRoutes.get(parallelRouteKey);
        const prefetchDataChild = prefetchDataChildren !== null ? prefetchDataChildren[parallelRouteKey] : null;
        const newSegmentChild = newRouterStateChild[0];
        const newSegmentPathChild = segmentPath.concat([
            parallelRouteKey,
            newSegmentChild
        ]);
        const newSegmentKeyChild = (0, _createroutercachekey.createRouterCacheKey)(newSegmentChild);
        const oldSegmentChild = oldRouterStateChild !== undefined ? oldRouterStateChild[0] : undefined;
        const oldCacheNodeChild = oldSegmentMapChild !== undefined ? oldSegmentMapChild.get(newSegmentKeyChild) : undefined;
        let taskChild;
        if (newSegmentChild === _segment.DEFAULT_SEGMENT_KEY) {
            // This is another kind of leaf segment — a default route.
            //
            // Default routes have special behavior. When there's no matching segment
            // for a parallel route, Next.js preserves the currently active segment
            // during a client navigation — but not for initial render. The server
            // leaves it to the client to account for this. So we need to handle
            // it here.
            if (oldRouterStateChild !== undefined) {
                // Reuse the existing Router State for this segment. We spawn a "task"
                // just to keep track of the updated router state; unlike most, it's
                // already fulfilled and won't be affected by the dynamic response.
                taskChild = spawnReusedTask(oldRouterStateChild);
            } else {
                // There's no currently active segment. Switch to the "create" path.
                taskChild = beginRenderingNewRouteTree(navigatedAt, oldRouterStateChild, newRouterStateChild, oldCacheNodeChild, didFindRootLayout, prefetchDataChild !== undefined ? prefetchDataChild : null, prefetchHead, isPrefetchHeadPartial, newSegmentPathChild, scrollableSegmentsResult);
            }
        } else if (isSamePageNavigation && // Check if this is a page segment.
        // TODO: We're not consistent about how we do this check. Some places
        // check if the segment starts with PAGE_SEGMENT_KEY, but most seem to
        // check if there any any children, which is why I'm doing it here. We
        // should probably encode an empty children set as `null` though. Either
        // way, we should update all the checks to be consistent.
        Object.keys(newRouterStateChild[1]).length === 0) {
            // We special case navigations to the exact same URL as the current
            // location. It's a common UI pattern for apps to refresh when you click a
            // link to the current page. So when this happens, we refresh the dynamic
            // data in the page segments.
            //
            // Note that this does not apply if the any part of the hash or search
            // query has changed. This might feel a bit weird but it makes more sense
            // when you consider that the way to trigger this behavior is to click
            // the same link multiple times.
            //
            // TODO: We should probably refresh the *entire* route when this case
            // occurs, not just the page segments. Essentially treating it the same as
            // a refresh() triggered by an action, which is the more explicit way of
            // modeling the UI pattern described above.
            //
            // Also note that this only refreshes the dynamic data, not static/
            // cached data. If the page segment is fully static and prefetched, the
            // request is skipped. (This is also how refresh() works.)
            taskChild = beginRenderingNewRouteTree(navigatedAt, oldRouterStateChild, newRouterStateChild, oldCacheNodeChild, didFindRootLayout, prefetchDataChild !== undefined ? prefetchDataChild : null, prefetchHead, isPrefetchHeadPartial, newSegmentPathChild, scrollableSegmentsResult);
        } else if (oldRouterStateChild !== undefined && oldSegmentChild !== undefined && (0, _matchsegments.matchSegment)(newSegmentChild, oldSegmentChild)) {
            if (oldCacheNodeChild !== undefined && oldRouterStateChild !== undefined) {
                // This segment exists in both the old and new trees. Recursively update
                // the children.
                taskChild = updateCacheNodeOnNavigation(navigatedAt, oldCacheNodeChild, oldRouterStateChild, newRouterStateChild, didFindRootLayout, prefetchDataChild, prefetchHead, isPrefetchHeadPartial, isSamePageNavigation, newSegmentPathChild, scrollableSegmentsResult);
            } else {
                // There's no existing Cache Node for this segment. Switch to the
                // "create" path.
                taskChild = beginRenderingNewRouteTree(navigatedAt, oldRouterStateChild, newRouterStateChild, oldCacheNodeChild, didFindRootLayout, prefetchDataChild !== undefined ? prefetchDataChild : null, prefetchHead, isPrefetchHeadPartial, newSegmentPathChild, scrollableSegmentsResult);
            }
        } else {
            // This is a new tree. Switch to the "create" path.
            taskChild = beginRenderingNewRouteTree(navigatedAt, oldRouterStateChild, newRouterStateChild, oldCacheNodeChild, didFindRootLayout, prefetchDataChild !== undefined ? prefetchDataChild : null, prefetchHead, isPrefetchHeadPartial, newSegmentPathChild, scrollableSegmentsResult);
        }
        if (taskChild !== null) {
            // Recursively propagate up the child tasks.
            if (taskChild.route === null) {
                // One of the child tasks discovered a change to the root layout.
                // Immediately unwind from this recursive traversal.
                return MPA_NAVIGATION_TASK;
            }
            if (taskChildren === null) {
                taskChildren = new Map();
            }
            taskChildren.set(parallelRouteKey, taskChild);
            const newCacheNodeChild = taskChild.node;
            if (newCacheNodeChild !== null) {
                const newSegmentMapChild = new Map(oldSegmentMapChild);
                newSegmentMapChild.set(newSegmentKeyChild, newCacheNodeChild);
                prefetchParallelRoutes.set(parallelRouteKey, newSegmentMapChild);
            }
            // The child tree's route state may be different from the prefetched
            // route sent by the server. We need to clone it as we traverse back up
            // the tree.
            const taskChildRoute = taskChild.route;
            patchedRouterStateChildren[parallelRouteKey] = taskChildRoute;
            const dynamicRequestTreeChild = taskChild.dynamicRequestTree;
            if (dynamicRequestTreeChild !== null) {
                // Something in the child tree is dynamic.
                needsDynamicRequest = true;
                dynamicRequestTreeChildren[parallelRouteKey] = dynamicRequestTreeChild;
            } else {
                dynamicRequestTreeChildren[parallelRouteKey] = taskChildRoute;
            }
        } else {
            // The child didn't change. We can use the prefetched router state.
            patchedRouterStateChildren[parallelRouteKey] = newRouterStateChild;
            dynamicRequestTreeChildren[parallelRouteKey] = newRouterStateChild;
        }
    }
    if (taskChildren === null) {
        // No new tasks were spawned.
        return null;
    }
    const newCacheNode = {
        lazyData: null,
        rsc: oldCacheNode.rsc,
        // We intentionally aren't updating the prefetchRsc field, since this node
        // is already part of the current tree, because it would be weird for
        // prefetch data to be newer than the final data. It probably won't ever be
        // observable anyway, but it could happen if the segment is unmounted then
        // mounted again, because LayoutRouter will momentarily switch to rendering
        // prefetchRsc, via useDeferredValue.
        prefetchRsc: oldCacheNode.prefetchRsc,
        head: oldCacheNode.head,
        prefetchHead: oldCacheNode.prefetchHead,
        loading: oldCacheNode.loading,
        // Everything is cloned except for the children, which we computed above.
        parallelRoutes: prefetchParallelRoutes,
        navigatedAt
    };
    return {
        // Return a cloned copy of the router state with updated children.
        route: patchRouterStateWithNewChildren(newRouterState, patchedRouterStateChildren),
        node: newCacheNode,
        dynamicRequestTree: needsDynamicRequest ? patchRouterStateWithNewChildren(newRouterState, dynamicRequestTreeChildren) : null,
        children: taskChildren
    };
}
function beginRenderingNewRouteTree(navigatedAt, oldRouterState, newRouterState, existingCacheNode, didFindRootLayout, prefetchData, possiblyPartialPrefetchHead, isPrefetchHeadPartial, segmentPath, scrollableSegmentsResult) {
    if (!didFindRootLayout) {
        // The route tree changed before we reached a layout. (The highest-level
        // layout in a route tree is referred to as the "root" layout.) This could
        // mean that we're navigating between two different root layouts. When this
        // happens, we perform a full-page (MPA-style) navigation.
        //
        // However, the algorithm for deciding where to start rendering a route
        // (i.e. the one performed in order to reach this function) is stricter
        // than the one used to detect a change in the root layout. So just because
        // we're re-rendering a segment outside of the root layout does not mean we
        // should trigger a full-page navigation.
        //
        // Specifically, we handle dynamic parameters differently: two segments are
        // considered the same even if their parameter values are different.
        //
        // Refer to isNavigatingToNewRootLayout for details.
        //
        // Note that we only have to perform this extra traversal if we didn't
        // already discover a root layout in the part of the tree that is unchanged.
        // In the common case, this branch is skipped completely.
        if (oldRouterState === undefined || (0, _isnavigatingtonewrootlayout.isNavigatingToNewRootLayout)(oldRouterState, newRouterState)) {
            // The root layout changed. Perform a full-page navigation.
            return MPA_NAVIGATION_TASK;
        }
    }
    return createCacheNodeOnNavigation(navigatedAt, newRouterState, existingCacheNode, prefetchData, possiblyPartialPrefetchHead, isPrefetchHeadPartial, segmentPath, scrollableSegmentsResult);
}
function createCacheNodeOnNavigation(navigatedAt, routerState, existingCacheNode, prefetchData, possiblyPartialPrefetchHead, isPrefetchHeadPartial, segmentPath, scrollableSegmentsResult) {
    // Same traversal as updateCacheNodeNavigation, but we switch to this path
    // once we reach the part of the tree that was not in the previous route. We
    // don't need to diff against the old tree, we just need to create a new one.
    // The head is assigned to every leaf segment delivered by the server. Based
    // on corresponding logic in fill-lazy-items-till-leaf-with-head.ts
    const routerStateChildren = routerState[1];
    const isLeafSegment = Object.keys(routerStateChildren).length === 0;
    // Even we're rendering inside the "new" part of the target tree, we may have
    // a locally cached segment that we can reuse. This may come from either 1)
    // the CacheNode tree, which lives in React state and is populated by previous
    // navigations; or 2) the prefetch cache, which is a separate cache that is
    // populated by prefetches.
    let rsc;
    let loading;
    let head;
    let cacheNodeNavigatedAt;
    if (existingCacheNode !== undefined && // DYNAMIC_STALETIME_MS defaults to 0, but it can be increased using
    // the experimental.staleTimes.dynamic config. When set, we'll avoid
    // refetching dynamic data if it was fetched within the given threshold.
    existingCacheNode.navigatedAt + _prefetchcacheutils.DYNAMIC_STALETIME_MS > navigatedAt) {
        // We have an existing CacheNode for this segment, and it's not stale. We
        // should reuse it rather than request a new one.
        rsc = existingCacheNode.rsc;
        loading = existingCacheNode.loading;
        head = existingCacheNode.head;
        // Don't update the navigatedAt timestamp, since we're reusing stale data.
        cacheNodeNavigatedAt = existingCacheNode.navigatedAt;
    } else if (prefetchData !== null) {
        // There's no existing CacheNode for this segment, but we do have prefetch
        // data. If the prefetch data is fully static (i.e. does not contain any
        // dynamic holes), we don't need to request it from the server.
        rsc = prefetchData[1];
        loading = prefetchData[3];
        head = isLeafSegment ? possiblyPartialPrefetchHead : null;
        // Even though we're accessing the data from the prefetch cache, this is
        // conceptually a new segment, not a reused one. So we should update the
        // navigatedAt timestamp.
        cacheNodeNavigatedAt = navigatedAt;
        const isPrefetchRscPartial = prefetchData[4];
        if (isPrefetchRscPartial || // Check if the head is partial (only relevant if this is a leaf segment)
        isPrefetchHeadPartial && isLeafSegment) {
            // We only have partial data from this segment. Like missing segments, we
            // must request the full data from the server.
            return spawnPendingTask(navigatedAt, routerState, prefetchData, possiblyPartialPrefetchHead, isPrefetchHeadPartial, segmentPath, scrollableSegmentsResult);
        } else {
        // The prefetch data is fully static, so we can omit it from the
        // navigation request.
        }
    } else {
        // There's no prefetch for this segment. Everything from this point will be
        // requested from the server, even if there are static children below it.
        // Create a terminal task node that will later be fulfilled by
        // server response.
        return spawnPendingTask(navigatedAt, routerState, null, possiblyPartialPrefetchHead, isPrefetchHeadPartial, segmentPath, scrollableSegmentsResult);
    }
    // We already have a full segment we can render, so we don't need to request a
    // new one from the server. Keep traversing down the tree until we reach
    // something that requires a dynamic request.
    const prefetchDataChildren = prefetchData !== null ? prefetchData[2] : null;
    const taskChildren = new Map();
    const existingCacheNodeChildren = existingCacheNode !== undefined ? existingCacheNode.parallelRoutes : null;
    const cacheNodeChildren = new Map(existingCacheNodeChildren);
    let dynamicRequestTreeChildren = {};
    let needsDynamicRequest = false;
    if (isLeafSegment) {
        // The segment path of every leaf segment (i.e. page) is collected into
        // a result array. This is used by the LayoutRouter to scroll to ensure that
        // new pages are visible after a navigation.
        // TODO: We should use a string to represent the segment path instead of
        // an array. We already use a string representation for the path when
        // accessing the Segment Cache, so we can use the same one.
        scrollableSegmentsResult.push(segmentPath);
    } else {
        for(let parallelRouteKey in routerStateChildren){
            const routerStateChild = routerStateChildren[parallelRouteKey];
            const prefetchDataChild = prefetchDataChildren !== null ? prefetchDataChildren[parallelRouteKey] : null;
            const existingSegmentMapChild = existingCacheNodeChildren !== null ? existingCacheNodeChildren.get(parallelRouteKey) : undefined;
            const segmentChild = routerStateChild[0];
            const segmentPathChild = segmentPath.concat([
                parallelRouteKey,
                segmentChild
            ]);
            const segmentKeyChild = (0, _createroutercachekey.createRouterCacheKey)(segmentChild);
            const existingCacheNodeChild = existingSegmentMapChild !== undefined ? existingSegmentMapChild.get(segmentKeyChild) : undefined;
            const taskChild = createCacheNodeOnNavigation(navigatedAt, routerStateChild, existingCacheNodeChild, prefetchDataChild, possiblyPartialPrefetchHead, isPrefetchHeadPartial, segmentPathChild, scrollableSegmentsResult);
            taskChildren.set(parallelRouteKey, taskChild);
            const dynamicRequestTreeChild = taskChild.dynamicRequestTree;
            if (dynamicRequestTreeChild !== null) {
                // Something in the child tree is dynamic.
                needsDynamicRequest = true;
                dynamicRequestTreeChildren[parallelRouteKey] = dynamicRequestTreeChild;
            } else {
                dynamicRequestTreeChildren[parallelRouteKey] = routerStateChild;
            }
            const newCacheNodeChild = taskChild.node;
            if (newCacheNodeChild !== null) {
                const newSegmentMapChild = new Map();
                newSegmentMapChild.set(segmentKeyChild, newCacheNodeChild);
                cacheNodeChildren.set(parallelRouteKey, newSegmentMapChild);
            }
        }
    }
    return {
        // Since we're inside a new route tree, unlike the
        // `updateCacheNodeOnNavigation` path, the router state on the children
        // tasks is always the same as the router state we pass in. So we don't need
        // to clone/modify it.
        route: routerState,
        node: {
            lazyData: null,
            // Since this segment is already full, we don't need to use the
            // `prefetchRsc` field.
            rsc,
            prefetchRsc: null,
            head,
            prefetchHead: null,
            loading,
            parallelRoutes: cacheNodeChildren,
            navigatedAt: cacheNodeNavigatedAt
        },
        dynamicRequestTree: needsDynamicRequest ? patchRouterStateWithNewChildren(routerState, dynamicRequestTreeChildren) : null,
        children: taskChildren
    };
}
function patchRouterStateWithNewChildren(baseRouterState, newChildren) {
    const clone = [
        baseRouterState[0],
        newChildren
    ];
    // Based on equivalent logic in apply-router-state-patch-to-tree, but should
    // confirm whether we need to copy all of these fields. Not sure the server
    // ever sends, e.g. the refetch marker.
    if (2 in baseRouterState) {
        clone[2] = baseRouterState[2];
    }
    if (3 in baseRouterState) {
        clone[3] = baseRouterState[3];
    }
    if (4 in baseRouterState) {
        clone[4] = baseRouterState[4];
    }
    return clone;
}
function spawnPendingTask(navigatedAt, routerState, prefetchData, prefetchHead, isPrefetchHeadPartial, segmentPath, scrollableSegmentsResult) {
    // Create a task that will later be fulfilled by data from the server.
    // Clone the prefetched route tree and the `refetch` marker to it. We'll send
    // this to the server so it knows where to start rendering.
    const dynamicRequestTree = patchRouterStateWithNewChildren(routerState, routerState[1]);
    dynamicRequestTree[3] = 'refetch';
    const newTask = {
        route: routerState,
        // Corresponds to the part of the route that will be rendered on the server.
        node: createPendingCacheNode(navigatedAt, routerState, prefetchData, prefetchHead, isPrefetchHeadPartial, segmentPath, scrollableSegmentsResult),
        // Because this is non-null, and it gets propagated up through the parent
        // tasks, the root task will know that it needs to perform a server request.
        dynamicRequestTree,
        children: null
    };
    return newTask;
}
function spawnReusedTask(reusedRouterState) {
    // Create a task that reuses an existing segment, e.g. when reusing
    // the current active segment in place of a default route.
    return {
        route: reusedRouterState,
        node: null,
        dynamicRequestTree: null,
        children: null
    };
}
function listenForDynamicRequest(task, responsePromise) {
    responsePromise.then((param)=>{
        let { flightData } = param;
        if (typeof flightData === 'string') {
            // Happens when navigating to page in `pages` from `app`. We shouldn't
            // get here because should have already handled this during
            // the prefetch.
            return;
        }
        for (const normalizedFlightData of flightData){
            const { segmentPath, tree: serverRouterState, seedData: dynamicData, head: dynamicHead } = normalizedFlightData;
            if (!dynamicData) {
                continue;
            }
            writeDynamicDataIntoPendingTask(task, segmentPath, serverRouterState, dynamicData, dynamicHead);
        }
        // Now that we've exhausted all the data we received from the server, if
        // there are any remaining pending tasks in the tree, abort them now.
        // If there's any missing data, it will trigger a lazy fetch.
        abortTask(task, null);
    }, (error)=>{
        // This will trigger an error during render
        abortTask(task, error);
    });
}
function writeDynamicDataIntoPendingTask(rootTask, segmentPath, serverRouterState, dynamicData, dynamicHead) {
    // The data sent by the server represents only a subtree of the app. We need
    // to find the part of the task tree that matches the server response, and
    // fulfill it using the dynamic data.
    //
    // segmentPath represents the parent path of subtree. It's a repeating pattern
    // of parallel route key and segment:
    //
    //   [string, Segment, string, Segment, string, Segment, ...]
    //
    // Iterate through the path and finish any tasks that match this payload.
    let task = rootTask;
    for(let i = 0; i < segmentPath.length; i += 2){
        const parallelRouteKey = segmentPath[i];
        const segment = segmentPath[i + 1];
        const taskChildren = task.children;
        if (taskChildren !== null) {
            const taskChild = taskChildren.get(parallelRouteKey);
            if (taskChild !== undefined) {
                const taskSegment = taskChild.route[0];
                if ((0, _matchsegments.matchSegment)(segment, taskSegment)) {
                    // Found a match for this task. Keep traversing down the task tree.
                    task = taskChild;
                    continue;
                }
            }
        }
        // We didn't find a child task that matches the server data. Exit. We won't
        // abort the task, though, because a different FlightDataPath may be able to
        // fulfill it (see loop in listenForDynamicRequest). We only abort tasks
        // once we've run out of data.
        return;
    }
    finishTaskUsingDynamicDataPayload(task, serverRouterState, dynamicData, dynamicHead);
}
function finishTaskUsingDynamicDataPayload(task, serverRouterState, dynamicData, dynamicHead) {
    if (task.dynamicRequestTree === null) {
        // Everything in this subtree is already complete. Bail out.
        return;
    }
    // dynamicData may represent a larger subtree than the task. Before we can
    // finish the task, we need to line them up.
    const taskChildren = task.children;
    const taskNode = task.node;
    if (taskChildren === null) {
        // We've reached the leaf node of the pending task. The server data tree
        // lines up the pending Cache Node tree. We can now switch to the
        // normal algorithm.
        if (taskNode !== null) {
            finishPendingCacheNode(taskNode, task.route, serverRouterState, dynamicData, dynamicHead);
            // Set this to null to indicate that this task is now complete.
            task.dynamicRequestTree = null;
        }
        return;
    }
    // The server returned more data than we need to finish the task. Skip over
    // the extra segments until we reach the leaf task node.
    const serverChildren = serverRouterState[1];
    const dynamicDataChildren = dynamicData[2];
    for(const parallelRouteKey in serverRouterState){
        const serverRouterStateChild = serverChildren[parallelRouteKey];
        const dynamicDataChild = dynamicDataChildren[parallelRouteKey];
        const taskChild = taskChildren.get(parallelRouteKey);
        if (taskChild !== undefined) {
            const taskSegment = taskChild.route[0];
            if ((0, _matchsegments.matchSegment)(serverRouterStateChild[0], taskSegment) && dynamicDataChild !== null && dynamicDataChild !== undefined) {
                // Found a match for this task. Keep traversing down the task tree.
                return finishTaskUsingDynamicDataPayload(taskChild, serverRouterStateChild, dynamicDataChild, dynamicHead);
            }
        }
    // We didn't find a child task that matches the server data. We won't abort
    // the task, though, because a different FlightDataPath may be able to
    // fulfill it (see loop in listenForDynamicRequest). We only abort tasks
    // once we've run out of data.
    }
}
function createPendingCacheNode(navigatedAt, routerState, prefetchData, prefetchHead, isPrefetchHeadPartial, segmentPath, scrollableSegmentsResult) {
    const routerStateChildren = routerState[1];
    const prefetchDataChildren = prefetchData !== null ? prefetchData[2] : null;
    const parallelRoutes = new Map();
    for(let parallelRouteKey in routerStateChildren){
        const routerStateChild = routerStateChildren[parallelRouteKey];
        const prefetchDataChild = prefetchDataChildren !== null ? prefetchDataChildren[parallelRouteKey] : null;
        const segmentChild = routerStateChild[0];
        const segmentPathChild = segmentPath.concat([
            parallelRouteKey,
            segmentChild
        ]);
        const segmentKeyChild = (0, _createroutercachekey.createRouterCacheKey)(segmentChild);
        const newCacheNodeChild = createPendingCacheNode(navigatedAt, routerStateChild, prefetchDataChild === undefined ? null : prefetchDataChild, prefetchHead, isPrefetchHeadPartial, segmentPathChild, scrollableSegmentsResult);
        const newSegmentMapChild = new Map();
        newSegmentMapChild.set(segmentKeyChild, newCacheNodeChild);
        parallelRoutes.set(parallelRouteKey, newSegmentMapChild);
    }
    // The head is assigned to every leaf segment delivered by the server. Based
    // on corresponding logic in fill-lazy-items-till-leaf-with-head.ts
    const isLeafSegment = parallelRoutes.size === 0;
    if (isLeafSegment) {
        // The segment path of every leaf segment (i.e. page) is collected into
        // a result array. This is used by the LayoutRouter to scroll to ensure that
        // new pages are visible after a navigation.
        // TODO: We should use a string to represent the segment path instead of
        // an array. We already use a string representation for the path when
        // accessing the Segment Cache, so we can use the same one.
        scrollableSegmentsResult.push(segmentPath);
    }
    const maybePrefetchRsc = prefetchData !== null ? prefetchData[1] : null;
    const maybePrefetchLoading = prefetchData !== null ? prefetchData[3] : null;
    return {
        lazyData: null,
        parallelRoutes: parallelRoutes,
        prefetchRsc: maybePrefetchRsc !== undefined ? maybePrefetchRsc : null,
        prefetchHead: isLeafSegment ? prefetchHead : [
            null,
            null
        ],
        // TODO: Technically, a loading boundary could contain dynamic data. We must
        // have separate `loading` and `prefetchLoading` fields to handle this, like
        // we do for the segment data and head.
        loading: maybePrefetchLoading !== undefined ? maybePrefetchLoading : null,
        // Create a deferred promise. This will be fulfilled once the dynamic
        // response is received from the server.
        rsc: createDeferredRsc(),
        head: isLeafSegment ? createDeferredRsc() : null,
        navigatedAt
    };
}
function finishPendingCacheNode(cacheNode, taskState, serverState, dynamicData, dynamicHead) {
    // Writes a dynamic response into an existing Cache Node tree. This does _not_
    // create a new tree, it updates the existing tree in-place. So it must follow
    // the Suspense rules of cache safety — it can resolve pending promises, but
    // it cannot overwrite existing data. It can add segments to the tree (because
    // a missing segment will cause the layout router to suspend).
    // but it cannot delete them.
    //
    // We must resolve every promise in the tree, or else it will suspend
    // indefinitely. If we did not receive data for a segment, we will resolve its
    // data promise to `null` to trigger a lazy fetch during render.
    const taskStateChildren = taskState[1];
    const serverStateChildren = serverState[1];
    const dataChildren = dynamicData[2];
    // The router state that we traverse the tree with (taskState) is the same one
    // that we used to construct the pending Cache Node tree. That way we're sure
    // to resolve all the pending promises.
    const parallelRoutes = cacheNode.parallelRoutes;
    for(let parallelRouteKey in taskStateChildren){
        const taskStateChild = taskStateChildren[parallelRouteKey];
        const serverStateChild = serverStateChildren[parallelRouteKey];
        const dataChild = dataChildren[parallelRouteKey];
        const segmentMapChild = parallelRoutes.get(parallelRouteKey);
        const taskSegmentChild = taskStateChild[0];
        const taskSegmentKeyChild = (0, _createroutercachekey.createRouterCacheKey)(taskSegmentChild);
        const cacheNodeChild = segmentMapChild !== undefined ? segmentMapChild.get(taskSegmentKeyChild) : undefined;
        if (cacheNodeChild !== undefined) {
            if (serverStateChild !== undefined && (0, _matchsegments.matchSegment)(taskSegmentChild, serverStateChild[0])) {
                if (dataChild !== undefined && dataChild !== null) {
                    // This is the happy path. Recursively update all the children.
                    finishPendingCacheNode(cacheNodeChild, taskStateChild, serverStateChild, dataChild, dynamicHead);
                } else {
                    // The server never returned data for this segment. Trigger a lazy
                    // fetch during render. This shouldn't happen because the Route Tree
                    // and the Seed Data tree sent by the server should always be the same
                    // shape when part of the same server response.
                    abortPendingCacheNode(taskStateChild, cacheNodeChild, null);
                }
            } else {
                // The server never returned data for this segment. Trigger a lazy
                // fetch during render.
                abortPendingCacheNode(taskStateChild, cacheNodeChild, null);
            }
        } else {
        // The server response matches what was expected to receive, but there's
        // no matching Cache Node in the task tree. This is a bug in the
        // implementation because we should have created a node for every
        // segment in the tree that's associated with this task.
        }
    }
    // Use the dynamic data from the server to fulfill the deferred RSC promise
    // on the Cache Node.
    const rsc = cacheNode.rsc;
    const dynamicSegmentData = dynamicData[1];
    if (rsc === null) {
        // This is a lazy cache node. We can overwrite it. This is only safe
        // because we know that the LayoutRouter suspends if `rsc` is `null`.
        cacheNode.rsc = dynamicSegmentData;
    } else if (isDeferredRsc(rsc)) {
        // This is a deferred RSC promise. We can fulfill it with the data we just
        // received from the server. If it was already resolved by a different
        // navigation, then this does nothing because we can't overwrite data.
        rsc.resolve(dynamicSegmentData);
    } else {
    // This is not a deferred RSC promise, nor is it empty, so it must have
    // been populated by a different navigation. We must not overwrite it.
    }
    // Check if this is a leaf segment. If so, it will have a `head` property with
    // a pending promise that needs to be resolved with the dynamic head from
    // the server.
    const head = cacheNode.head;
    if (isDeferredRsc(head)) {
        head.resolve(dynamicHead);
    }
}
function abortTask(task, error) {
    const cacheNode = task.node;
    if (cacheNode === null) {
        // This indicates the task is already complete.
        return;
    }
    const taskChildren = task.children;
    if (taskChildren === null) {
        // Reached the leaf task node. This is the root of a pending cache
        // node tree.
        abortPendingCacheNode(task.route, cacheNode, error);
    } else {
        // This is an intermediate task node. Keep traversing until we reach a
        // task node with no children. That will be the root of the cache node tree
        // that needs to be resolved.
        for (const taskChild of taskChildren.values()){
            abortTask(taskChild, error);
        }
    }
    // Set this to null to indicate that this task is now complete.
    task.dynamicRequestTree = null;
}
function abortPendingCacheNode(routerState, cacheNode, error) {
    // For every pending segment in the tree, resolve its `rsc` promise to `null`
    // to trigger a lazy fetch during render.
    //
    // Or, if an error object is provided, it will error instead.
    const routerStateChildren = routerState[1];
    const parallelRoutes = cacheNode.parallelRoutes;
    for(let parallelRouteKey in routerStateChildren){
        const routerStateChild = routerStateChildren[parallelRouteKey];
        const segmentMapChild = parallelRoutes.get(parallelRouteKey);
        if (segmentMapChild === undefined) {
            continue;
        }
        const segmentChild = routerStateChild[0];
        const segmentKeyChild = (0, _createroutercachekey.createRouterCacheKey)(segmentChild);
        const cacheNodeChild = segmentMapChild.get(segmentKeyChild);
        if (cacheNodeChild !== undefined) {
            abortPendingCacheNode(routerStateChild, cacheNodeChild, error);
        } else {
        // This shouldn't happen because we're traversing the same tree that was
        // used to construct the cache nodes in the first place.
        }
    }
    const rsc = cacheNode.rsc;
    if (isDeferredRsc(rsc)) {
        if (error === null) {
            // This will trigger a lazy fetch during render.
            rsc.resolve(null);
        } else {
            // This will trigger an error during rendering.
            rsc.reject(error);
        }
    }
    // Check if this is a leaf segment. If so, it will have a `head` property with
    // a pending promise that needs to be resolved. If an error was provided, we
    // will not resolve it with an error, since this is rendered at the root of
    // the app. We want the segment to error, not the entire app.
    const head = cacheNode.head;
    if (isDeferredRsc(head)) {
        head.resolve(null);
    }
}
function updateCacheNodeOnPopstateRestoration(oldCacheNode, routerState) {
    // A popstate navigation reads data from the local cache. It does not issue
    // new network requests (unless the cache entries have been evicted). So, we
    // update the cache to drop the prefetch data for any segment whose dynamic
    // data was already received. This prevents an unnecessary flash back to PPR
    // state during a back/forward navigation.
    //
    // This function clones the entire cache node tree and sets the `prefetchRsc`
    // field to `null` to prevent it from being rendered. We can't mutate the node
    // in place because this is a concurrent data structure.
    const routerStateChildren = routerState[1];
    const oldParallelRoutes = oldCacheNode.parallelRoutes;
    const newParallelRoutes = new Map(oldParallelRoutes);
    for(let parallelRouteKey in routerStateChildren){
        const routerStateChild = routerStateChildren[parallelRouteKey];
        const segmentChild = routerStateChild[0];
        const segmentKeyChild = (0, _createroutercachekey.createRouterCacheKey)(segmentChild);
        const oldSegmentMapChild = oldParallelRoutes.get(parallelRouteKey);
        if (oldSegmentMapChild !== undefined) {
            const oldCacheNodeChild = oldSegmentMapChild.get(segmentKeyChild);
            if (oldCacheNodeChild !== undefined) {
                const newCacheNodeChild = updateCacheNodeOnPopstateRestoration(oldCacheNodeChild, routerStateChild);
                const newSegmentMapChild = new Map(oldSegmentMapChild);
                newSegmentMapChild.set(segmentKeyChild, newCacheNodeChild);
                newParallelRoutes.set(parallelRouteKey, newSegmentMapChild);
            }
        }
    }
    // Only show prefetched data if the dynamic data is still pending.
    //
    // Tehnically, what we're actually checking is whether the dynamic network
    // response was received. But since it's a streaming response, this does not
    // mean that all the dynamic data has fully streamed in. It just means that
    // _some_ of the dynamic data was received. But as a heuristic, we assume that
    // the rest dynamic data will stream in quickly, so it's still better to skip
    // the prefetch state.
    const rsc = oldCacheNode.rsc;
    const shouldUsePrefetch = isDeferredRsc(rsc) && rsc.status === 'pending';
    return {
        lazyData: null,
        rsc,
        head: oldCacheNode.head,
        prefetchHead: shouldUsePrefetch ? oldCacheNode.prefetchHead : [
            null,
            null
        ],
        prefetchRsc: shouldUsePrefetch ? oldCacheNode.prefetchRsc : null,
        loading: oldCacheNode.loading,
        // These are the cloned children we computed above
        parallelRoutes: newParallelRoutes,
        navigatedAt: oldCacheNode.navigatedAt
    };
}
const DEFERRED = Symbol();
// This type exists to distinguish a DeferredRsc from a Flight promise. It's a
// compromise to avoid adding an extra field on every Cache Node, which would be
// awkward because the pre-PPR parts of codebase would need to account for it,
// too. We can remove it once type Cache Node type is more settled.
function isDeferredRsc(value) {
    return value && value.tag === DEFERRED;
}
function createDeferredRsc() {
    let resolve;
    let reject;
    const pendingRsc = new Promise((res, rej)=>{
        resolve = res;
        reject = rej;
    });
    pendingRsc.status = 'pending';
    pendingRsc.resolve = (value)=>{
        if (pendingRsc.status === 'pending') {
            const fulfilledRsc = pendingRsc;
            fulfilledRsc.status = 'fulfilled';
            fulfilledRsc.value = value;
            resolve(value);
        }
    };
    pendingRsc.reject = (error)=>{
        if (pendingRsc.status === 'pending') {
            const rejectedRsc = pendingRsc;
            rejectedRsc.status = 'rejected';
            rejectedRsc.reason = error;
            reject(error);
        }
    };
    pendingRsc.tag = DEFERRED;
    return pendingRsc;
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=ppr-navigations.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/clear-cache-node-data-for-segment-path.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "clearCacheNodeDataForSegmentPath", {
    enumerable: true,
    get: function() {
        return clearCacheNodeDataForSegmentPath;
    }
});
const _flightdatahelpers = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/flight-data-helpers.js [app-ssr] (ecmascript)");
const _createroutercachekey = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/create-router-cache-key.js [app-ssr] (ecmascript)");
function clearCacheNodeDataForSegmentPath(newCache, existingCache, flightSegmentPath) {
    const isLastEntry = flightSegmentPath.length <= 2;
    const [parallelRouteKey, segment] = flightSegmentPath;
    const cacheKey = (0, _createroutercachekey.createRouterCacheKey)(segment);
    const existingChildSegmentMap = existingCache.parallelRoutes.get(parallelRouteKey);
    let childSegmentMap = newCache.parallelRoutes.get(parallelRouteKey);
    if (!childSegmentMap || childSegmentMap === existingChildSegmentMap) {
        childSegmentMap = new Map(existingChildSegmentMap);
        newCache.parallelRoutes.set(parallelRouteKey, childSegmentMap);
    }
    const existingChildCacheNode = existingChildSegmentMap == null ? void 0 : existingChildSegmentMap.get(cacheKey);
    let childCacheNode = childSegmentMap.get(cacheKey);
    // In case of last segment start off the fetch at this level and don't copy further down.
    if (isLastEntry) {
        if (!childCacheNode || !childCacheNode.lazyData || childCacheNode === existingChildCacheNode) {
            childSegmentMap.set(cacheKey, {
                lazyData: null,
                rsc: null,
                prefetchRsc: null,
                head: null,
                prefetchHead: null,
                parallelRoutes: new Map(),
                loading: null,
                navigatedAt: -1
            });
        }
        return;
    }
    if (!childCacheNode || !existingChildCacheNode) {
        // Start fetch in the place where the existing cache doesn't have the data yet.
        if (!childCacheNode) {
            childSegmentMap.set(cacheKey, {
                lazyData: null,
                rsc: null,
                prefetchRsc: null,
                head: null,
                prefetchHead: null,
                parallelRoutes: new Map(),
                loading: null,
                navigatedAt: -1
            });
        }
        return;
    }
    if (childCacheNode === existingChildCacheNode) {
        childCacheNode = {
            lazyData: childCacheNode.lazyData,
            rsc: childCacheNode.rsc,
            prefetchRsc: childCacheNode.prefetchRsc,
            head: childCacheNode.head,
            prefetchHead: childCacheNode.prefetchHead,
            parallelRoutes: new Map(childCacheNode.parallelRoutes),
            loading: childCacheNode.loading
        };
        childSegmentMap.set(cacheKey, childCacheNode);
    }
    return clearCacheNodeDataForSegmentPath(childCacheNode, existingChildCacheNode, (0, _flightdatahelpers.getNextFlightSegmentPath)(flightSegmentPath));
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=clear-cache-node-data-for-segment-path.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/aliased-prefetch-navigations.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    addSearchParamsToPageSegments: null,
    handleAliasedPrefetchEntry: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    addSearchParamsToPageSegments: function() {
        return addSearchParamsToPageSegments;
    },
    handleAliasedPrefetchEntry: function() {
        return handleAliasedPrefetchEntry;
    }
});
const _segment = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/shared/lib/segment.js [app-ssr] (ecmascript)");
const _approuter = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/app-router.js [app-ssr] (ecmascript)");
const _applyrouterstatepatchtotree = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/apply-router-state-patch-to-tree.js [app-ssr] (ecmascript)");
const _createhreffromurl = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/create-href-from-url.js [app-ssr] (ecmascript)");
const _createroutercachekey = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/create-router-cache-key.js [app-ssr] (ecmascript)");
const _fillcachewithnewsubtreedata = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/fill-cache-with-new-subtree-data.js [app-ssr] (ecmascript)");
const _handlemutable = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/handle-mutable.js [app-ssr] (ecmascript)");
const _navigatereducer = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/reducers/navigate-reducer.js [app-ssr] (ecmascript)");
function handleAliasedPrefetchEntry(navigatedAt, state, flightData, url, mutable) {
    let currentTree = state.tree;
    let currentCache = state.cache;
    const href = (0, _createhreffromurl.createHrefFromUrl)(url);
    let applied;
    let scrollableSegments = [];
    if (typeof flightData === 'string') {
        return false;
    }
    for (const normalizedFlightData of flightData){
        // If the segment doesn't have a loading component, we don't need to do anything.
        if (!hasLoadingComponentInSeedData(normalizedFlightData.seedData)) {
            continue;
        }
        let treePatch = normalizedFlightData.tree;
        // Segments are keyed by searchParams (e.g. __PAGE__?{"foo":"bar"}). We might return a less specific, param-less entry,
        // so we ensure that the final tree contains the correct searchParams (reflected in the URL) are provided in the updated FlightRouterState tree.
        // We only do this on the first read, as otherwise we'd be overwriting the searchParams that may have already been set
        treePatch = addSearchParamsToPageSegments(treePatch, Object.fromEntries(url.searchParams));
        const { seedData, isRootRender, pathToSegment } = normalizedFlightData;
        // TODO-APP: remove ''
        const flightSegmentPathWithLeadingEmpty = [
            '',
            ...pathToSegment
        ];
        // Segments are keyed by searchParams (e.g. __PAGE__?{"foo":"bar"}). We might return a less specific, param-less entry,
        // so we ensure that the final tree contains the correct searchParams (reflected in the URL) are provided in the updated FlightRouterState tree.
        // We only do this on the first read, as otherwise we'd be overwriting the searchParams that may have already been set
        treePatch = addSearchParamsToPageSegments(treePatch, Object.fromEntries(url.searchParams));
        let newTree = (0, _applyrouterstatepatchtotree.applyRouterStatePatchToTree)(flightSegmentPathWithLeadingEmpty, currentTree, treePatch, href);
        const newCache = (0, _approuter.createEmptyCacheNode)();
        // The prefetch cache entry was aliased -- this signals that we only fill in the cache with the
        // loading state and not the actual parallel route seed data.
        if (isRootRender && seedData) {
            // Fill in the cache with the new loading / rsc data
            const rsc = seedData[1];
            const loading = seedData[3];
            newCache.loading = loading;
            newCache.rsc = rsc;
            // Construct a new tree and apply the aliased loading state for each parallel route
            fillNewTreeWithOnlyLoadingSegments(navigatedAt, newCache, currentCache, treePatch, seedData);
        } else {
            // Copy rsc for the root node of the cache.
            newCache.rsc = currentCache.rsc;
            newCache.prefetchRsc = currentCache.prefetchRsc;
            newCache.loading = currentCache.loading;
            newCache.parallelRoutes = new Map(currentCache.parallelRoutes);
            // copy the loading state only into the leaf node (the part that changed)
            (0, _fillcachewithnewsubtreedata.fillCacheWithNewSubTreeDataButOnlyLoading)(navigatedAt, newCache, currentCache, normalizedFlightData);
        }
        // If we don't have an updated tree, there's no reason to update the cache, as the tree
        // dictates what cache nodes to render.
        if (newTree) {
            currentTree = newTree;
            currentCache = newCache;
            applied = true;
        }
        for (const subSegment of (0, _navigatereducer.generateSegmentsFromPatch)(treePatch)){
            const scrollableSegmentPath = [
                ...normalizedFlightData.pathToSegment,
                ...subSegment
            ];
            // Filter out the __DEFAULT__ paths as they shouldn't be scrolled to in this case.
            if (scrollableSegmentPath[scrollableSegmentPath.length - 1] !== _segment.DEFAULT_SEGMENT_KEY) {
                scrollableSegments.push(scrollableSegmentPath);
            }
        }
    }
    if (!applied) {
        return false;
    }
    mutable.patchedTree = currentTree;
    mutable.cache = currentCache;
    mutable.canonicalUrl = href;
    mutable.hashFragment = url.hash;
    mutable.scrollableSegments = scrollableSegments;
    return (0, _handlemutable.handleMutable)(state, mutable);
}
function hasLoadingComponentInSeedData(seedData) {
    if (!seedData) return false;
    const parallelRoutes = seedData[2];
    const loading = seedData[3];
    if (loading) {
        return true;
    }
    for(const key in parallelRoutes){
        if (hasLoadingComponentInSeedData(parallelRoutes[key])) {
            return true;
        }
    }
    return false;
}
function fillNewTreeWithOnlyLoadingSegments(navigatedAt, newCache, existingCache, routerState, cacheNodeSeedData) {
    const isLastSegment = Object.keys(routerState[1]).length === 0;
    if (isLastSegment) {
        return;
    }
    for(const key in routerState[1]){
        const parallelRouteState = routerState[1][key];
        const segmentForParallelRoute = parallelRouteState[0];
        const cacheKey = (0, _createroutercachekey.createRouterCacheKey)(segmentForParallelRoute);
        const parallelSeedData = cacheNodeSeedData !== null && cacheNodeSeedData[2][key] !== undefined ? cacheNodeSeedData[2][key] : null;
        let newCacheNode;
        if (parallelSeedData !== null) {
            // New data was sent from the server.
            const rsc = parallelSeedData[1];
            const loading = parallelSeedData[3];
            newCacheNode = {
                lazyData: null,
                // copy the layout but null the page segment as that's not meant to be used
                rsc: segmentForParallelRoute.includes(_segment.PAGE_SEGMENT_KEY) ? null : rsc,
                prefetchRsc: null,
                head: null,
                prefetchHead: null,
                parallelRoutes: new Map(),
                loading,
                navigatedAt
            };
        } else {
            // No data available for this node. This will trigger a lazy fetch
            // during render.
            newCacheNode = {
                lazyData: null,
                rsc: null,
                prefetchRsc: null,
                head: null,
                prefetchHead: null,
                parallelRoutes: new Map(),
                loading: null,
                navigatedAt: -1
            };
        }
        const existingParallelRoutes = newCache.parallelRoutes.get(key);
        if (existingParallelRoutes) {
            existingParallelRoutes.set(cacheKey, newCacheNode);
        } else {
            newCache.parallelRoutes.set(key, new Map([
                [
                    cacheKey,
                    newCacheNode
                ]
            ]));
        }
        fillNewTreeWithOnlyLoadingSegments(navigatedAt, newCacheNode, existingCache, parallelRouteState, parallelSeedData);
    }
}
function addSearchParamsToPageSegments(flightRouterState, searchParams) {
    const [segment, parallelRoutes, ...rest] = flightRouterState;
    // If it's a page segment, modify the segment by adding search params
    if (segment.includes(_segment.PAGE_SEGMENT_KEY)) {
        const newSegment = (0, _segment.addSearchParamsIfPageSegment)(segment, searchParams);
        return [
            newSegment,
            parallelRoutes,
            ...rest
        ];
    }
    // Otherwise, recurse through the parallel routes and return a new tree
    const updatedParallelRoutes = {};
    for (const [key, parallelRoute] of Object.entries(parallelRoutes)){
        updatedParallelRoutes[key] = addSearchParamsToPageSegments(parallelRoute, searchParams);
    }
    return [
        segment,
        updatedParallelRoutes,
        ...rest
    ];
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=aliased-prefetch-navigations.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/components/segment-cache.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

/**
 * Entry point to the Segment Cache implementation.
 *
 * All code related to the Segment Cache lives `segment-cache-impl` directory.
 * Callers access it through this indirection.
 *
 * This is to ensure the code is dead code eliminated from the bundle if the
 * flag is disabled.
 *
 * TODO: This is super tedious. Since experimental flags are an essential part
 * of our workflow, we should establish a better pattern for dead code
 * elimination. Ideally it would be done at the bundler level, like how React's
 * build process works. In the React repo, you don't even need to add any extra
 * configuration per experiment — if the code is not reachable, it gets stripped
 * from the build automatically by Rollup. Or, shorter term, we could stub out
 * experimental modules at build time by updating the build config, i.e. a more
 * automated version of what I'm doing manually in this file.
 */ Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    FetchStrategy: null,
    NavigationResultTag: null,
    PrefetchPriority: null,
    cancelPrefetchTask: null,
    createCacheKey: null,
    getCurrentCacheVersion: null,
    isPrefetchTaskDirty: null,
    navigate: null,
    prefetch: null,
    reschedulePrefetchTask: null,
    revalidateEntireCache: null,
    schedulePrefetchTask: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    FetchStrategy: function() {
        return FetchStrategy;
    },
    NavigationResultTag: function() {
        return NavigationResultTag;
    },
    PrefetchPriority: function() {
        return PrefetchPriority;
    },
    cancelPrefetchTask: function() {
        return cancelPrefetchTask;
    },
    createCacheKey: function() {
        return createCacheKey;
    },
    getCurrentCacheVersion: function() {
        return getCurrentCacheVersion;
    },
    isPrefetchTaskDirty: function() {
        return isPrefetchTaskDirty;
    },
    navigate: function() {
        return navigate;
    },
    prefetch: function() {
        return prefetch;
    },
    reschedulePrefetchTask: function() {
        return reschedulePrefetchTask;
    },
    revalidateEntireCache: function() {
        return revalidateEntireCache;
    },
    schedulePrefetchTask: function() {
        return schedulePrefetchTask;
    }
});
const notEnabled = ()=>{
    throw Object.defineProperty(new Error('Segment Cache experiment is not enabled. This is a bug in Next.js.'), "__NEXT_ERROR_CODE", {
        value: "E654",
        enumerable: false,
        configurable: true
    });
};
const prefetch = ("TURBOPACK compile-time falsy", 0) ? "TURBOPACK unreachable" : notEnabled;
const navigate = ("TURBOPACK compile-time falsy", 0) ? "TURBOPACK unreachable" : notEnabled;
const revalidateEntireCache = ("TURBOPACK compile-time falsy", 0) ? "TURBOPACK unreachable" : notEnabled;
const getCurrentCacheVersion = ("TURBOPACK compile-time falsy", 0) ? "TURBOPACK unreachable" : notEnabled;
const schedulePrefetchTask = ("TURBOPACK compile-time falsy", 0) ? "TURBOPACK unreachable" : notEnabled;
const cancelPrefetchTask = ("TURBOPACK compile-time falsy", 0) ? "TURBOPACK unreachable" : notEnabled;
const reschedulePrefetchTask = ("TURBOPACK compile-time falsy", 0) ? "TURBOPACK unreachable" : notEnabled;
const isPrefetchTaskDirty = ("TURBOPACK compile-time falsy", 0) ? "TURBOPACK unreachable" : notEnabled;
const createCacheKey = ("TURBOPACK compile-time falsy", 0) ? "TURBOPACK unreachable" : notEnabled;
var NavigationResultTag = /*#__PURE__*/ function(NavigationResultTag) {
    NavigationResultTag[NavigationResultTag["MPA"] = 0] = "MPA";
    NavigationResultTag[NavigationResultTag["Success"] = 1] = "Success";
    NavigationResultTag[NavigationResultTag["NoOp"] = 2] = "NoOp";
    NavigationResultTag[NavigationResultTag["Async"] = 3] = "Async";
    return NavigationResultTag;
}({});
var PrefetchPriority = /*#__PURE__*/ function(PrefetchPriority) {
    /**
   * Assigned to the most recently hovered/touched link. Special network
   * bandwidth is reserved for this task only. There's only ever one Intent-
   * priority task at a time; when a new Intent task is scheduled, the previous
   * one is bumped down to Default.
   */ PrefetchPriority[PrefetchPriority["Intent"] = 2] = "Intent";
    /**
   * The default priority for prefetch tasks.
   */ PrefetchPriority[PrefetchPriority["Default"] = 1] = "Default";
    /**
   * Assigned to tasks when they spawn non-blocking background work, like
   * revalidating a partially cached entry to see if more data is available.
   */ PrefetchPriority[PrefetchPriority["Background"] = 0] = "Background";
    return PrefetchPriority;
}({});
var FetchStrategy = /*#__PURE__*/ function(FetchStrategy) {
    // Deliberately ordered so we can easily compare two segments
    // and determine if one segment is "more specific" than another
    // (i.e. if it's likely that it contains more data)
    FetchStrategy[FetchStrategy["LoadingBoundary"] = 0] = "LoadingBoundary";
    FetchStrategy[FetchStrategy["PPR"] = 1] = "PPR";
    FetchStrategy[FetchStrategy["PPRRuntime"] = 2] = "PPRRuntime";
    FetchStrategy[FetchStrategy["Full"] = 3] = "Full";
    return FetchStrategy;
}({});
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=segment-cache.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/reducers/navigate-reducer.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    generateSegmentsFromPatch: null,
    handleExternalUrl: null,
    navigateReducer: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    generateSegmentsFromPatch: function() {
        return generateSegmentsFromPatch;
    },
    handleExternalUrl: function() {
        return handleExternalUrl;
    },
    navigateReducer: function() {
        return navigateReducer;
    }
});
const _fetchserverresponse = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/fetch-server-response.js [app-ssr] (ecmascript)");
const _createhreffromurl = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/create-href-from-url.js [app-ssr] (ecmascript)");
const _invalidatecachebelowflightsegmentpath = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/invalidate-cache-below-flight-segmentpath.js [app-ssr] (ecmascript)");
const _applyrouterstatepatchtotree = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/apply-router-state-patch-to-tree.js [app-ssr] (ecmascript)");
const _shouldhardnavigate = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/should-hard-navigate.js [app-ssr] (ecmascript)");
const _isnavigatingtonewrootlayout = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/is-navigating-to-new-root-layout.js [app-ssr] (ecmascript)");
const _routerreducertypes = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/router-reducer-types.js [app-ssr] (ecmascript)");
const _handlemutable = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/handle-mutable.js [app-ssr] (ecmascript)");
const _applyflightdata = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/apply-flight-data.js [app-ssr] (ecmascript)");
const _prefetchreducer = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/reducers/prefetch-reducer.js [app-ssr] (ecmascript)");
const _approuter = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/app-router.js [app-ssr] (ecmascript)");
const _segment = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/shared/lib/segment.js [app-ssr] (ecmascript)");
const _pprnavigations = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/ppr-navigations.js [app-ssr] (ecmascript)");
const _prefetchcacheutils = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/prefetch-cache-utils.js [app-ssr] (ecmascript)");
const _clearcachenodedataforsegmentpath = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/clear-cache-node-data-for-segment-path.js [app-ssr] (ecmascript)");
const _aliasedprefetchnavigations = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/aliased-prefetch-navigations.js [app-ssr] (ecmascript)");
const _segmentcache = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/segment-cache.js [app-ssr] (ecmascript)");
function handleExternalUrl(state, mutable, url, pendingPush) {
    mutable.mpaNavigation = true;
    mutable.canonicalUrl = url;
    mutable.pendingPush = pendingPush;
    mutable.scrollableSegments = undefined;
    return (0, _handlemutable.handleMutable)(state, mutable);
}
function generateSegmentsFromPatch(flightRouterPatch) {
    const segments = [];
    const [segment, parallelRoutes] = flightRouterPatch;
    if (Object.keys(parallelRoutes).length === 0) {
        return [
            [
                segment
            ]
        ];
    }
    for (const [parallelRouteKey, parallelRoute] of Object.entries(parallelRoutes)){
        for (const childSegment of generateSegmentsFromPatch(parallelRoute)){
            // If the segment is empty, it means we are at the root of the tree
            if (segment === '') {
                segments.push([
                    parallelRouteKey,
                    ...childSegment
                ]);
            } else {
                segments.push([
                    segment,
                    parallelRouteKey,
                    ...childSegment
                ]);
            }
        }
    }
    return segments;
}
function triggerLazyFetchForLeafSegments(newCache, currentCache, flightSegmentPath, treePatch) {
    let appliedPatch = false;
    newCache.rsc = currentCache.rsc;
    newCache.prefetchRsc = currentCache.prefetchRsc;
    newCache.loading = currentCache.loading;
    newCache.parallelRoutes = new Map(currentCache.parallelRoutes);
    const segmentPathsToFill = generateSegmentsFromPatch(treePatch).map((segment)=>[
            ...flightSegmentPath,
            ...segment
        ]);
    for (const segmentPaths of segmentPathsToFill){
        (0, _clearcachenodedataforsegmentpath.clearCacheNodeDataForSegmentPath)(newCache, currentCache, segmentPaths);
        appliedPatch = true;
    }
    return appliedPatch;
}
function handleNavigationResult(url, state, mutable, pendingPush, result) {
    switch(result.tag){
        case _segmentcache.NavigationResultTag.MPA:
            {
                // Perform an MPA navigation.
                const newUrl = result.data;
                return handleExternalUrl(state, mutable, newUrl, pendingPush);
            }
        case _segmentcache.NavigationResultTag.NoOp:
            {
                // The server responded with no change to the current page. However, if
                // the URL changed, we still need to update that.
                const newCanonicalUrl = result.data.canonicalUrl;
                mutable.canonicalUrl = newCanonicalUrl;
                // Check if the only thing that changed was the hash fragment.
                const oldUrl = new URL(state.canonicalUrl, url);
                const onlyHashChange = // navigations are always same-origin.
                url.pathname === oldUrl.pathname && url.search === oldUrl.search && url.hash !== oldUrl.hash;
                if (onlyHashChange) {
                    // The only updated part of the URL is the hash.
                    mutable.onlyHashChange = true;
                    mutable.shouldScroll = result.data.shouldScroll;
                    mutable.hashFragment = url.hash;
                    // Setting this to an empty array triggers a scroll for all new and
                    // updated segments. See `ScrollAndFocusHandler` for more details.
                    mutable.scrollableSegments = [];
                }
                return (0, _handlemutable.handleMutable)(state, mutable);
            }
        case _segmentcache.NavigationResultTag.Success:
            {
                // Received a new result.
                mutable.cache = result.data.cacheNode;
                mutable.patchedTree = result.data.flightRouterState;
                mutable.canonicalUrl = result.data.canonicalUrl;
                mutable.scrollableSegments = result.data.scrollableSegments;
                mutable.shouldScroll = result.data.shouldScroll;
                mutable.hashFragment = result.data.hash;
                return (0, _handlemutable.handleMutable)(state, mutable);
            }
        case _segmentcache.NavigationResultTag.Async:
            {
                return result.data.then((asyncResult)=>handleNavigationResult(url, state, mutable, pendingPush, asyncResult), // TODO: This matches the current behavior but we need to do something
                // better here if the network fails.
                ()=>{
                    return state;
                });
            }
        default:
            {
                result;
                return state;
            }
    }
}
function navigateReducer(state, action) {
    const { url, isExternalUrl, navigateType, shouldScroll, allowAliasing } = action;
    const mutable = {};
    const { hash } = url;
    const href = (0, _createhreffromurl.createHrefFromUrl)(url);
    const pendingPush = navigateType === 'push';
    // we want to prune the prefetch cache on every navigation to avoid it growing too large
    (0, _prefetchcacheutils.prunePrefetchCache)(state.prefetchCache);
    mutable.preserveCustomHistoryState = false;
    mutable.pendingPush = pendingPush;
    if (isExternalUrl) {
        return handleExternalUrl(state, mutable, url.toString(), pendingPush);
    }
    // Handles case where `<meta http-equiv="refresh">` tag is present,
    // which will trigger an MPA navigation.
    if (document.getElementById('__next-page-redirect')) {
        return handleExternalUrl(state, mutable, href, pendingPush);
    }
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    const prefetchValues = (0, _prefetchcacheutils.getOrCreatePrefetchCacheEntry)({
        url,
        nextUrl: state.nextUrl,
        tree: state.tree,
        prefetchCache: state.prefetchCache,
        allowAliasing
    });
    const { treeAtTimeOfPrefetch, data } = prefetchValues;
    _prefetchreducer.prefetchQueue.bump(data);
    return data.then((param)=>{
        let { flightData, canonicalUrl: canonicalUrlOverride, postponed } = param;
        const navigatedAt = Date.now();
        let isFirstRead = false;
        // we only want to mark this once
        if (!prefetchValues.lastUsedTime) {
            // important: we should only mark the cache node as dirty after we unsuspend from the call above
            prefetchValues.lastUsedTime = navigatedAt;
            isFirstRead = true;
        }
        if (prefetchValues.aliased) {
            // When alias is enabled, search param may not be included in the canonicalUrl.
            // But we want to set url to canonicalUrl so that we use redirected path for fetching dynamic data.
            const urlWithCanonicalPathname = new URL(url.href);
            if (canonicalUrlOverride) {
                urlWithCanonicalPathname.pathname = canonicalUrlOverride.pathname;
            }
            const result = (0, _aliasedprefetchnavigations.handleAliasedPrefetchEntry)(navigatedAt, state, flightData, urlWithCanonicalPathname, mutable);
            // We didn't return new router state because we didn't apply the aliased entry for some reason.
            // We'll re-invoke the navigation handler but ensure that we don't attempt to use the aliased entry. This
            // will create an on-demand prefetch entry.
            if (result === false) {
                return navigateReducer(state, {
                    ...action,
                    allowAliasing: false
                });
            }
            return result;
        }
        // Handle case when navigating to page in `pages` from `app`
        if (typeof flightData === 'string') {
            return handleExternalUrl(state, mutable, flightData, pendingPush);
        }
        const updatedCanonicalUrl = canonicalUrlOverride ? (0, _createhreffromurl.createHrefFromUrl)(canonicalUrlOverride) : href;
        const onlyHashChange = !!hash && state.canonicalUrl.split('#', 1)[0] === updatedCanonicalUrl.split('#', 1)[0];
        // If only the hash has changed, the server hasn't sent us any new data. We can just update
        // the mutable properties responsible for URL and scroll handling and return early.
        if (onlyHashChange) {
            mutable.onlyHashChange = true;
            mutable.canonicalUrl = updatedCanonicalUrl;
            mutable.shouldScroll = shouldScroll;
            mutable.hashFragment = hash;
            mutable.scrollableSegments = [];
            return (0, _handlemutable.handleMutable)(state, mutable);
        }
        let currentTree = state.tree;
        let currentCache = state.cache;
        let scrollableSegments = [];
        for (const normalizedFlightData of flightData){
            const { pathToSegment: flightSegmentPath, seedData, head, isHeadPartial, isRootRender } = normalizedFlightData;
            let treePatch = normalizedFlightData.tree;
            // TODO-APP: remove ''
            const flightSegmentPathWithLeadingEmpty = [
                '',
                ...flightSegmentPath
            ];
            // Create new tree based on the flightSegmentPath and router state patch
            let newTree = (0, _applyrouterstatepatchtotree.applyRouterStatePatchToTree)(flightSegmentPathWithLeadingEmpty, currentTree, treePatch, href);
            // If the tree patch can't be applied to the current tree then we use the tree at time of prefetch
            // TODO-APP: This should instead fill in the missing pieces in `currentTree` with the data from `treeAtTimeOfPrefetch`, then apply the patch.
            if (newTree === null) {
                newTree = (0, _applyrouterstatepatchtotree.applyRouterStatePatchToTree)(flightSegmentPathWithLeadingEmpty, treeAtTimeOfPrefetch, treePatch, href);
            }
            if (newTree !== null) {
                if (// will send back a static response that's rendered from
                // the root. If for some reason it doesn't, we fall back to the
                // non-PPR implementation.
                // TODO: We should get rid of the else branch and do all navigations
                // via startPPRNavigation. The current structure is just
                // an incremental step.
                seedData && isRootRender && postponed) {
                    const task = (0, _pprnavigations.startPPRNavigation)(navigatedAt, currentCache, currentTree, treePatch, seedData, head, isHeadPartial, false, scrollableSegments);
                    if (task !== null) {
                        if (task.route === null) {
                            // Detected a change to the root layout. Perform an full-
                            // page navigation.
                            return handleExternalUrl(state, mutable, href, pendingPush);
                        }
                        // Use the tree computed by startPPRNavigation instead
                        // of the one computed by applyRouterStatePatchToTree.
                        // TODO: We should remove applyRouterStatePatchToTree
                        // from the PPR path entirely.
                        const patchedRouterState = task.route;
                        newTree = patchedRouterState;
                        const newCache = task.node;
                        if (newCache !== null) {
                            // We've created a new Cache Node tree that contains a prefetched
                            // version of the next page. This can be rendered instantly.
                            mutable.cache = newCache;
                        }
                        const dynamicRequestTree = task.dynamicRequestTree;
                        if (dynamicRequestTree !== null) {
                            // The prefetched tree has dynamic holes in it. We initiate a
                            // dynamic request to fill them in.
                            //
                            // Do not block on the result. We'll immediately render the Cache
                            // Node tree and suspend on the dynamic parts. When the request
                            // comes in, we'll fill in missing data and ping React to
                            // re-render. Unlike the lazy fetching model in the non-PPR
                            // implementation, this is modeled as a single React update +
                            // streaming, rather than multiple top-level updates. (However,
                            // even in the new model, we'll still need to sometimes update the
                            // root multiple times per navigation, like if the server sends us
                            // a different response than we expected. For now, we revert back
                            // to the lazy fetching mechanism in that case.)
                            const dynamicRequest = (0, _fetchserverresponse.fetchServerResponse)(new URL(updatedCanonicalUrl, url.origin), {
                                flightRouterState: dynamicRequestTree,
                                nextUrl: state.nextUrl
                            });
                            (0, _pprnavigations.listenForDynamicRequest)(task, dynamicRequest);
                        // We store the dynamic request on the `lazyData` property of the CacheNode
                        // because we're not going to await the dynamic request here. Since we're not blocking
                        // on the dynamic request, `layout-router` will
                        // task.node.lazyData = dynamicRequest
                        } else {
                        // The prefetched tree does not contain dynamic holes — it's
                        // fully static. We can skip the dynamic request.
                        }
                    } else {
                        // Nothing changed, so reuse the old cache.
                        // TODO: What if the head changed but not any of the segment data?
                        // Is that possible? If so, we should clone the whole tree and
                        // update the head.
                        newTree = treePatch;
                    }
                } else {
                    // The static response does not include any dynamic holes, so
                    // there's no need to do a second request.
                    // TODO: As an incremental step this just reverts back to the
                    // non-PPR implementation. We can simplify this branch further,
                    // given that PPR prefetches are always static and return the whole
                    // tree. Or in the meantime we could factor it out into a
                    // separate function.
                    if ((0, _isnavigatingtonewrootlayout.isNavigatingToNewRootLayout)(currentTree, newTree)) {
                        return handleExternalUrl(state, mutable, href, pendingPush);
                    }
                    const cache = (0, _approuter.createEmptyCacheNode)();
                    let applied = false;
                    if (prefetchValues.status === _routerreducertypes.PrefetchCacheEntryStatus.stale && !isFirstRead) {
                        // When we have a stale prefetch entry, we only want to re-use the loading state of the route we're navigating to, to support instant loading navigations
                        // this will trigger a lazy fetch for the actual page data by nulling the `rsc` and `prefetchRsc` values for page data,
                        // while copying over the `loading` for the segment that contains the page data.
                        // We only do this on subsequent reads, as otherwise there'd be no loading data to re-use.
                        // We skip this branch if only the hash fragment has changed, as we don't want to trigger a lazy fetch in that case
                        applied = triggerLazyFetchForLeafSegments(cache, currentCache, flightSegmentPath, treePatch);
                        // since we re-used the stale cache's loading state & refreshed the data,
                        // update the `lastUsedTime` so that it can continue to be re-used for the next 30s
                        prefetchValues.lastUsedTime = navigatedAt;
                    } else {
                        applied = (0, _applyflightdata.applyFlightData)(navigatedAt, currentCache, cache, normalizedFlightData, prefetchValues);
                    }
                    const hardNavigate = (0, _shouldhardnavigate.shouldHardNavigate)(flightSegmentPathWithLeadingEmpty, currentTree);
                    if (hardNavigate) {
                        // Copy rsc for the root node of the cache.
                        cache.rsc = currentCache.rsc;
                        cache.prefetchRsc = currentCache.prefetchRsc;
                        (0, _invalidatecachebelowflightsegmentpath.invalidateCacheBelowFlightSegmentPath)(cache, currentCache, flightSegmentPath);
                        // Ensure the existing cache value is used when the cache was not invalidated.
                        mutable.cache = cache;
                    } else if (applied) {
                        mutable.cache = cache;
                        // If we applied the cache, we update the "current cache" value so any other
                        // segments in the FlightDataPath will be able to reference the updated cache.
                        currentCache = cache;
                    }
                    for (const subSegment of generateSegmentsFromPatch(treePatch)){
                        const scrollableSegmentPath = [
                            ...flightSegmentPath,
                            ...subSegment
                        ];
                        // Filter out the __DEFAULT__ paths as they shouldn't be scrolled to in this case.
                        if (scrollableSegmentPath[scrollableSegmentPath.length - 1] !== _segment.DEFAULT_SEGMENT_KEY) {
                            scrollableSegments.push(scrollableSegmentPath);
                        }
                    }
                }
                currentTree = newTree;
            }
        }
        mutable.patchedTree = currentTree;
        mutable.canonicalUrl = updatedCanonicalUrl;
        mutable.scrollableSegments = scrollableSegments;
        mutable.hashFragment = hash;
        mutable.shouldScroll = shouldScroll;
        return (0, _handlemutable.handleMutable)(state, mutable);
    }, ()=>state);
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=navigate-reducer.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/reducers/server-patch-reducer.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "serverPatchReducer", {
    enumerable: true,
    get: function() {
        return serverPatchReducer;
    }
});
const _createhreffromurl = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/create-href-from-url.js [app-ssr] (ecmascript)");
const _applyrouterstatepatchtotree = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/apply-router-state-patch-to-tree.js [app-ssr] (ecmascript)");
const _isnavigatingtonewrootlayout = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/is-navigating-to-new-root-layout.js [app-ssr] (ecmascript)");
const _navigatereducer = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/reducers/navigate-reducer.js [app-ssr] (ecmascript)");
const _applyflightdata = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/apply-flight-data.js [app-ssr] (ecmascript)");
const _handlemutable = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/handle-mutable.js [app-ssr] (ecmascript)");
const _approuter = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/app-router.js [app-ssr] (ecmascript)");
function serverPatchReducer(state, action) {
    const { serverResponse: { flightData, canonicalUrl: canonicalUrlOverride }, navigatedAt } = action;
    const mutable = {};
    mutable.preserveCustomHistoryState = false;
    // Handle case when navigating to page in `pages` from `app`
    if (typeof flightData === 'string') {
        return (0, _navigatereducer.handleExternalUrl)(state, mutable, flightData, state.pushRef.pendingPush);
    }
    let currentTree = state.tree;
    let currentCache = state.cache;
    for (const normalizedFlightData of flightData){
        const { segmentPath: flightSegmentPath, tree: treePatch } = normalizedFlightData;
        const newTree = (0, _applyrouterstatepatchtotree.applyRouterStatePatchToTree)([
            '',
            ...flightSegmentPath
        ], currentTree, treePatch, state.canonicalUrl);
        // `applyRouterStatePatchToTree` returns `null` when it determined that the server response is not applicable to the current tree.
        // In other words, the server responded with a tree that doesn't match what the client is currently rendering.
        // This can happen if the server patch action took longer to resolve than a subsequent navigation which would have changed the tree.
        // Previously this case triggered an MPA navigation but it should be safe to simply discard the server response rather than forcing
        // the entire page to reload.
        if (newTree === null) {
            return state;
        }
        if ((0, _isnavigatingtonewrootlayout.isNavigatingToNewRootLayout)(currentTree, newTree)) {
            return (0, _navigatereducer.handleExternalUrl)(state, mutable, state.canonicalUrl, state.pushRef.pendingPush);
        }
        const canonicalUrlOverrideHref = canonicalUrlOverride ? (0, _createhreffromurl.createHrefFromUrl)(canonicalUrlOverride) : undefined;
        if (canonicalUrlOverrideHref) {
            mutable.canonicalUrl = canonicalUrlOverrideHref;
        }
        const cache = (0, _approuter.createEmptyCacheNode)();
        (0, _applyflightdata.applyFlightData)(navigatedAt, currentCache, cache, normalizedFlightData);
        mutable.patchedTree = newTree;
        mutable.cache = cache;
        currentCache = cache;
        currentTree = newTree;
    }
    return (0, _handlemutable.handleMutable)(state, mutable);
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=server-patch-reducer.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/reducers/restore-reducer.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "restoreReducer", {
    enumerable: true,
    get: function() {
        return restoreReducer;
    }
});
const _createhreffromurl = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/create-href-from-url.js [app-ssr] (ecmascript)");
const _computechangedpath = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/compute-changed-path.js [app-ssr] (ecmascript)");
const _pprnavigations = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/ppr-navigations.js [app-ssr] (ecmascript)");
function restoreReducer(state, action) {
    const { url, tree } = action;
    const href = (0, _createhreffromurl.createHrefFromUrl)(url);
    // This action is used to restore the router state from the history state.
    // However, it's possible that the history state no longer contains the `FlightRouterState`.
    // We will copy over the internal state on pushState/replaceState events, but if a history entry
    // occurred before hydration, or if the user navigated to a hash using a regular anchor link,
    // the history state will not contain the `FlightRouterState`.
    // In this case, we'll continue to use the existing tree so the router doesn't get into an invalid state.
    const treeToRestore = tree || state.tree;
    const oldCache = state.cache;
    const newCache = ("TURBOPACK compile-time falsy", 0) ? // prevents an unnecessary flash back to PPR state during a
    // back/forward navigation.
    "TURBOPACK unreachable" : oldCache;
    var _extractPathFromFlightRouterState;
    return {
        // Set canonical url
        canonicalUrl: href,
        pushRef: {
            pendingPush: false,
            mpaNavigation: false,
            // Ensures that the custom history state that was set is preserved when applying this update.
            preserveCustomHistoryState: true
        },
        focusAndScrollRef: state.focusAndScrollRef,
        cache: newCache,
        prefetchCache: state.prefetchCache,
        // Restore provided tree
        tree: treeToRestore,
        nextUrl: (_extractPathFromFlightRouterState = (0, _computechangedpath.extractPathFromFlightRouterState)(treeToRestore)) != null ? _extractPathFromFlightRouterState : url.pathname
    };
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=restore-reducer.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/handle-segment-mismatch.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "handleSegmentMismatch", {
    enumerable: true,
    get: function() {
        return handleSegmentMismatch;
    }
});
const _navigatereducer = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/reducers/navigate-reducer.js [app-ssr] (ecmascript)");
function handleSegmentMismatch(state, action, treePatch) {
    if ("TURBOPACK compile-time truthy", 1) {
        console.warn('Performing hard navigation because your application experienced an unrecoverable error. If this keeps occurring, please file a Next.js issue.\n\n' + 'Reason: Segment mismatch\n' + ("Last Action: " + action.type + "\n\n") + ("Current Tree: " + JSON.stringify(state.tree) + "\n\n") + ("Tree Patch Payload: " + JSON.stringify(treePatch)));
    }
    return (0, _navigatereducer.handleExternalUrl)(state, {}, state.canonicalUrl, true);
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=handle-segment-mismatch.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/reducers/has-interception-route-in-current-tree.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "hasInterceptionRouteInCurrentTree", {
    enumerable: true,
    get: function() {
        return hasInterceptionRouteInCurrentTree;
    }
});
const _interceptionroutes = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/shared/lib/router/utils/interception-routes.js [app-ssr] (ecmascript)");
function hasInterceptionRouteInCurrentTree(param) {
    let [segment, parallelRoutes] = param;
    // If we have a dynamic segment, it's marked as an interception route by the presence of the `i` suffix.
    if (Array.isArray(segment) && (segment[2] === 'di' || segment[2] === 'ci')) {
        return true;
    }
    // If segment is not an array, apply the existing string-based check
    if (typeof segment === 'string' && (0, _interceptionroutes.isInterceptionRouteAppPath)(segment)) {
        return true;
    }
    // Iterate through parallelRoutes if they exist
    if (parallelRoutes) {
        for(const key in parallelRoutes){
            if (hasInterceptionRouteInCurrentTree(parallelRoutes[key])) {
                return true;
            }
        }
    }
    return false;
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=has-interception-route-in-current-tree.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/reducers/refresh-reducer.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "refreshReducer", {
    enumerable: true,
    get: function() {
        return refreshReducer;
    }
});
const _fetchserverresponse = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/fetch-server-response.js [app-ssr] (ecmascript)");
const _createhreffromurl = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/create-href-from-url.js [app-ssr] (ecmascript)");
const _applyrouterstatepatchtotree = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/apply-router-state-patch-to-tree.js [app-ssr] (ecmascript)");
const _isnavigatingtonewrootlayout = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/is-navigating-to-new-root-layout.js [app-ssr] (ecmascript)");
const _navigatereducer = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/reducers/navigate-reducer.js [app-ssr] (ecmascript)");
const _handlemutable = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/handle-mutable.js [app-ssr] (ecmascript)");
const _filllazyitemstillleafwithhead = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/fill-lazy-items-till-leaf-with-head.js [app-ssr] (ecmascript)");
const _approuter = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/app-router.js [app-ssr] (ecmascript)");
const _handlesegmentmismatch = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/handle-segment-mismatch.js [app-ssr] (ecmascript)");
const _hasinterceptionrouteincurrenttree = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/reducers/has-interception-route-in-current-tree.js [app-ssr] (ecmascript)");
const _refetchinactiveparallelsegments = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/refetch-inactive-parallel-segments.js [app-ssr] (ecmascript)");
const _segmentcache = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/segment-cache.js [app-ssr] (ecmascript)");
function refreshReducer(state, action) {
    const { origin } = action;
    const mutable = {};
    const href = state.canonicalUrl;
    let currentTree = state.tree;
    mutable.preserveCustomHistoryState = false;
    const cache = (0, _approuter.createEmptyCacheNode)();
    // If the current tree was intercepted, the nextUrl should be included in the request.
    // This is to ensure that the refresh request doesn't get intercepted, accidentally triggering the interception route.
    const includeNextUrl = (0, _hasinterceptionrouteincurrenttree.hasInterceptionRouteInCurrentTree)(state.tree);
    // TODO-APP: verify that `href` is not an external url.
    // Fetch data from the root of the tree.
    cache.lazyData = (0, _fetchserverresponse.fetchServerResponse)(new URL(href, origin), {
        flightRouterState: [
            currentTree[0],
            currentTree[1],
            currentTree[2],
            'refetch'
        ],
        nextUrl: includeNextUrl ? state.nextUrl : null
    });
    const navigatedAt = Date.now();
    return cache.lazyData.then(async (param)=>{
        let { flightData, canonicalUrl: canonicalUrlOverride } = param;
        // Handle case when navigating to page in `pages` from `app`
        if (typeof flightData === 'string') {
            return (0, _navigatereducer.handleExternalUrl)(state, mutable, flightData, state.pushRef.pendingPush);
        }
        // Remove cache.lazyData as it has been resolved at this point.
        cache.lazyData = null;
        for (const normalizedFlightData of flightData){
            const { tree: treePatch, seedData: cacheNodeSeedData, head, isRootRender } = normalizedFlightData;
            if (!isRootRender) {
                // TODO-APP: handle this case better
                console.log('REFRESH FAILED');
                return state;
            }
            const newTree = (0, _applyrouterstatepatchtotree.applyRouterStatePatchToTree)([
                ''
            ], currentTree, treePatch, state.canonicalUrl);
            if (newTree === null) {
                return (0, _handlesegmentmismatch.handleSegmentMismatch)(state, action, treePatch);
            }
            if ((0, _isnavigatingtonewrootlayout.isNavigatingToNewRootLayout)(currentTree, newTree)) {
                return (0, _navigatereducer.handleExternalUrl)(state, mutable, href, state.pushRef.pendingPush);
            }
            const canonicalUrlOverrideHref = canonicalUrlOverride ? (0, _createhreffromurl.createHrefFromUrl)(canonicalUrlOverride) : undefined;
            if (canonicalUrlOverride) {
                mutable.canonicalUrl = canonicalUrlOverrideHref;
            }
            // Handles case where prefetch only returns the router tree patch without rendered components.
            if (cacheNodeSeedData !== null) {
                const rsc = cacheNodeSeedData[1];
                const loading = cacheNodeSeedData[3];
                cache.rsc = rsc;
                cache.prefetchRsc = null;
                cache.loading = loading;
                (0, _filllazyitemstillleafwithhead.fillLazyItemsTillLeafWithHead)(navigatedAt, cache, undefined, treePatch, cacheNodeSeedData, head, undefined);
                if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
                ;
                else {
                    mutable.prefetchCache = new Map();
                }
            }
            await (0, _refetchinactiveparallelsegments.refreshInactiveParallelSegments)({
                navigatedAt,
                state,
                updatedTree: newTree,
                updatedCache: cache,
                includeNextUrl,
                canonicalUrl: mutable.canonicalUrl || state.canonicalUrl
            });
            mutable.cache = cache;
            mutable.patchedTree = newTree;
            currentTree = newTree;
        }
        return (0, _handlemutable.handleMutable)(state, mutable);
    }, ()=>state);
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=refresh-reducer.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/reducers/hmr-refresh-reducer.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "hmrRefreshReducer", {
    enumerable: true,
    get: function() {
        return hmrRefreshReducer;
    }
});
const _fetchserverresponse = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/fetch-server-response.js [app-ssr] (ecmascript)");
const _createhreffromurl = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/create-href-from-url.js [app-ssr] (ecmascript)");
const _applyrouterstatepatchtotree = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/apply-router-state-patch-to-tree.js [app-ssr] (ecmascript)");
const _isnavigatingtonewrootlayout = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/is-navigating-to-new-root-layout.js [app-ssr] (ecmascript)");
const _navigatereducer = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/reducers/navigate-reducer.js [app-ssr] (ecmascript)");
const _handlemutable = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/handle-mutable.js [app-ssr] (ecmascript)");
const _applyflightdata = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/apply-flight-data.js [app-ssr] (ecmascript)");
const _approuter = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/app-router.js [app-ssr] (ecmascript)");
const _handlesegmentmismatch = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/handle-segment-mismatch.js [app-ssr] (ecmascript)");
const _hasinterceptionrouteincurrenttree = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/reducers/has-interception-route-in-current-tree.js [app-ssr] (ecmascript)");
// A version of refresh reducer that keeps the cache around instead of wiping all of it.
function hmrRefreshReducerImpl(state, action) {
    const { origin } = action;
    const mutable = {};
    const href = state.canonicalUrl;
    mutable.preserveCustomHistoryState = false;
    const cache = (0, _approuter.createEmptyCacheNode)();
    // If the current tree was intercepted, the nextUrl should be included in the request.
    // This is to ensure that the refresh request doesn't get intercepted, accidentally triggering the interception route.
    const includeNextUrl = (0, _hasinterceptionrouteincurrenttree.hasInterceptionRouteInCurrentTree)(state.tree);
    // TODO-APP: verify that `href` is not an external url.
    // Fetch data from the root of the tree.
    const navigatedAt = Date.now();
    cache.lazyData = (0, _fetchserverresponse.fetchServerResponse)(new URL(href, origin), {
        flightRouterState: [
            state.tree[0],
            state.tree[1],
            state.tree[2],
            'refetch'
        ],
        nextUrl: includeNextUrl ? state.nextUrl : null,
        isHmrRefresh: true
    });
    return cache.lazyData.then((param)=>{
        let { flightData, canonicalUrl: canonicalUrlOverride } = param;
        // Handle case when navigating to page in `pages` from `app`
        if (typeof flightData === 'string') {
            return (0, _navigatereducer.handleExternalUrl)(state, mutable, flightData, state.pushRef.pendingPush);
        }
        // Remove cache.lazyData as it has been resolved at this point.
        cache.lazyData = null;
        let currentTree = state.tree;
        let currentCache = state.cache;
        for (const normalizedFlightData of flightData){
            const { tree: treePatch, isRootRender } = normalizedFlightData;
            if (!isRootRender) {
                // TODO-APP: handle this case better
                console.log('REFRESH FAILED');
                return state;
            }
            const newTree = (0, _applyrouterstatepatchtotree.applyRouterStatePatchToTree)([
                ''
            ], currentTree, treePatch, state.canonicalUrl);
            if (newTree === null) {
                return (0, _handlesegmentmismatch.handleSegmentMismatch)(state, action, treePatch);
            }
            if ((0, _isnavigatingtonewrootlayout.isNavigatingToNewRootLayout)(currentTree, newTree)) {
                return (0, _navigatereducer.handleExternalUrl)(state, mutable, href, state.pushRef.pendingPush);
            }
            const canonicalUrlOverrideHref = canonicalUrlOverride ? (0, _createhreffromurl.createHrefFromUrl)(canonicalUrlOverride) : undefined;
            if (canonicalUrlOverride) {
                mutable.canonicalUrl = canonicalUrlOverrideHref;
            }
            const applied = (0, _applyflightdata.applyFlightData)(navigatedAt, currentCache, cache, normalizedFlightData);
            if (applied) {
                mutable.cache = cache;
                currentCache = cache;
            }
            mutable.patchedTree = newTree;
            mutable.canonicalUrl = href;
            currentTree = newTree;
        }
        return (0, _handlemutable.handleMutable)(state, mutable);
    }, ()=>state);
}
function hmrRefreshReducerNoop(state, _action) {
    return state;
}
const hmrRefreshReducer = ("TURBOPACK compile-time falsy", 0) ? "TURBOPACK unreachable" : hmrRefreshReducerImpl;
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=hmr-refresh-reducer.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/assign-location.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "assignLocation", {
    enumerable: true,
    get: function() {
        return assignLocation;
    }
});
const _addbasepath = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/add-base-path.js [app-ssr] (ecmascript)");
function assignLocation(location, url) {
    if (location.startsWith('.')) {
        const urlBase = url.origin + url.pathname;
        return new URL(// new URL('./relative', 'https://example.com/subdir').href -> 'https://example.com/relative'
        // new URL('./relative', 'https://example.com/subdir/').href -> 'https://example.com/subdir/relative'
        (urlBase.endsWith('/') ? urlBase : urlBase + '/') + location);
    }
    return new URL((0, _addbasepath.addBasePath)(location), url.href);
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=assign-location.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/shared/lib/server-reference-info.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    extractInfoFromServerReferenceId: null,
    omitUnusedArgs: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    extractInfoFromServerReferenceId: function() {
        return extractInfoFromServerReferenceId;
    },
    omitUnusedArgs: function() {
        return omitUnusedArgs;
    }
});
function extractInfoFromServerReferenceId(id) {
    const infoByte = parseInt(id.slice(0, 2), 16);
    const typeBit = infoByte >> 7 & 0x1;
    const argMask = infoByte >> 1 & 0x3f;
    const restArgs = infoByte & 0x1;
    const usedArgs = Array(6);
    for(let index = 0; index < 6; index++){
        const bitPosition = 5 - index;
        const bit = argMask >> bitPosition & 0x1;
        usedArgs[index] = bit === 1;
    }
    return {
        type: typeBit === 1 ? 'use-cache' : 'server-action',
        usedArgs: usedArgs,
        hasRestArgs: restArgs === 1
    };
}
function omitUnusedArgs(args, info) {
    const filteredArgs = new Array(args.length);
    for(let index = 0; index < args.length; index++){
        if (index < 6 && info.usedArgs[index] || // This assumes that the server reference info byte has the restArgs bit
        // set to 1 if there are more than 6 args.
        index >= 6 && info.hasRestArgs) {
            filteredArgs[index] = args[index];
        }
    }
    return filteredArgs;
} //# sourceMappingURL=server-reference-info.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/reducers/server-action-reducer.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "serverActionReducer", {
    enumerable: true,
    get: function() {
        return serverActionReducer;
    }
});
const _appcallserver = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/app-call-server.js [app-ssr] (ecmascript)");
const _appfindsourcemapurl = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/app-find-source-map-url.js [app-ssr] (ecmascript)");
const _approuterheaders = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/app-router-headers.js [app-ssr] (ecmascript)");
const _unrecognizedactionerror = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/unrecognized-action-error.js [app-ssr] (ecmascript)");
const _client = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-server-dom-turbopack-client.js [app-ssr] (ecmascript)");
const _routerreducertypes = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/router-reducer-types.js [app-ssr] (ecmascript)");
const _assignlocation = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/assign-location.js [app-ssr] (ecmascript)");
const _createhreffromurl = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/create-href-from-url.js [app-ssr] (ecmascript)");
const _navigatereducer = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/reducers/navigate-reducer.js [app-ssr] (ecmascript)");
const _applyrouterstatepatchtotree = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/apply-router-state-patch-to-tree.js [app-ssr] (ecmascript)");
const _isnavigatingtonewrootlayout = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/is-navigating-to-new-root-layout.js [app-ssr] (ecmascript)");
const _handlemutable = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/handle-mutable.js [app-ssr] (ecmascript)");
const _filllazyitemstillleafwithhead = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/fill-lazy-items-till-leaf-with-head.js [app-ssr] (ecmascript)");
const _approuter = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/app-router.js [app-ssr] (ecmascript)");
const _hasinterceptionrouteincurrenttree = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/reducers/has-interception-route-in-current-tree.js [app-ssr] (ecmascript)");
const _handlesegmentmismatch = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/handle-segment-mismatch.js [app-ssr] (ecmascript)");
const _refetchinactiveparallelsegments = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/refetch-inactive-parallel-segments.js [app-ssr] (ecmascript)");
const _flightdatahelpers = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/flight-data-helpers.js [app-ssr] (ecmascript)");
const _redirect = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/redirect.js [app-ssr] (ecmascript)");
const _redirecterror = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/redirect-error.js [app-ssr] (ecmascript)");
const _prefetchcacheutils = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/prefetch-cache-utils.js [app-ssr] (ecmascript)");
const _removebasepath = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/remove-base-path.js [app-ssr] (ecmascript)");
const _hasbasepath = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/has-base-path.js [app-ssr] (ecmascript)");
const _serverreferenceinfo = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/shared/lib/server-reference-info.js [app-ssr] (ecmascript)");
const _segmentcache = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/segment-cache.js [app-ssr] (ecmascript)");
const createFromFetch = _client.createFromFetch;
async function fetchServerAction(state, nextUrl, param) {
    let { actionId, actionArgs } = param;
    const temporaryReferences = (0, _client.createTemporaryReferenceSet)();
    const info = (0, _serverreferenceinfo.extractInfoFromServerReferenceId)(actionId);
    // TODO: Currently, we're only omitting unused args for the experimental "use
    // cache" functions. Once the server reference info byte feature is stable, we
    // should apply this to server actions as well.
    const usedArgs = info.type === 'use-cache' ? (0, _serverreferenceinfo.omitUnusedArgs)(actionArgs, info) : actionArgs;
    const body = await (0, _client.encodeReply)(usedArgs, {
        temporaryReferences
    });
    const res = await fetch(state.canonicalUrl, {
        method: 'POST',
        headers: {
            Accept: _approuterheaders.RSC_CONTENT_TYPE_HEADER,
            [_approuterheaders.ACTION_HEADER]: actionId,
            [_approuterheaders.NEXT_ROUTER_STATE_TREE_HEADER]: (0, _flightdatahelpers.prepareFlightRouterStateForRequest)(state.tree),
            ...("TURBOPACK compile-time falsy", 0) ? "TURBOPACK unreachable" : {},
            ...nextUrl ? {
                [_approuterheaders.NEXT_URL]: nextUrl
            } : {}
        },
        body
    });
    // Handle server actions that the server didn't recognize.
    const unrecognizedActionHeader = res.headers.get(_approuterheaders.NEXT_ACTION_NOT_FOUND_HEADER);
    if (unrecognizedActionHeader === '1') {
        throw Object.defineProperty(new _unrecognizedactionerror.UnrecognizedActionError('Server Action "' + actionId + '" was not found on the server. \nRead more: https://nextjs.org/docs/messages/failed-to-find-server-action'), "__NEXT_ERROR_CODE", {
            value: "E715",
            enumerable: false,
            configurable: true
        });
    }
    const redirectHeader = res.headers.get('x-action-redirect');
    const [location, _redirectType] = (redirectHeader == null ? void 0 : redirectHeader.split(';')) || [];
    let redirectType;
    switch(_redirectType){
        case 'push':
            redirectType = _redirecterror.RedirectType.push;
            break;
        case 'replace':
            redirectType = _redirecterror.RedirectType.replace;
            break;
        default:
            redirectType = undefined;
    }
    const isPrerender = !!res.headers.get(_approuterheaders.NEXT_IS_PRERENDER_HEADER);
    let revalidatedParts;
    try {
        const revalidatedHeader = JSON.parse(res.headers.get('x-action-revalidated') || '[[],0,0]');
        revalidatedParts = {
            paths: revalidatedHeader[0] || [],
            tag: !!revalidatedHeader[1],
            cookie: revalidatedHeader[2]
        };
    } catch (e) {
        revalidatedParts = NO_REVALIDATED_PARTS;
    }
    const redirectLocation = location ? (0, _assignlocation.assignLocation)(location, new URL(state.canonicalUrl, window.location.href)) : undefined;
    const contentType = res.headers.get('content-type');
    const isRscResponse = !!(contentType && contentType.startsWith(_approuterheaders.RSC_CONTENT_TYPE_HEADER));
    // Handle invalid server action responses.
    // A valid response must have `content-type: text/x-component`, unless it's an external redirect.
    // (external redirects have an 'x-action-redirect' header, but the body is an empty 'text/plain')
    if (!isRscResponse && !redirectLocation) {
        // The server can respond with a text/plain error message, but we'll fallback to something generic
        // if there isn't one.
        const message = res.status >= 400 && contentType === 'text/plain' ? await res.text() : 'An unexpected response was received from the server.';
        throw Object.defineProperty(new Error(message), "__NEXT_ERROR_CODE", {
            value: "E394",
            enumerable: false,
            configurable: true
        });
    }
    let actionResult;
    let actionFlightData;
    if (isRscResponse) {
        const response = await createFromFetch(Promise.resolve(res), {
            callServer: _appcallserver.callServer,
            findSourceMapURL: _appfindsourcemapurl.findSourceMapURL,
            temporaryReferences
        });
        // An internal redirect can send an RSC response, but does not have a useful `actionResult`.
        actionResult = redirectLocation ? undefined : response.a;
        actionFlightData = (0, _flightdatahelpers.normalizeFlightData)(response.f);
    } else {
        // An external redirect doesn't contain RSC data.
        actionResult = undefined;
        actionFlightData = undefined;
    }
    return {
        actionResult,
        actionFlightData,
        redirectLocation,
        redirectType,
        revalidatedParts,
        isPrerender
    };
}
const NO_REVALIDATED_PARTS = {
    paths: [],
    tag: false,
    cookie: false
};
function serverActionReducer(state, action) {
    const { resolve, reject } = action;
    const mutable = {};
    let currentTree = state.tree;
    mutable.preserveCustomHistoryState = false;
    // only pass along the `nextUrl` param (used for interception routes) if the current route was intercepted.
    // If the route has been intercepted, the action should be as well.
    // Otherwise the server action might be intercepted with the wrong action id
    // (ie, one that corresponds with the intercepted route)
    const nextUrl = state.nextUrl && (0, _hasinterceptionrouteincurrenttree.hasInterceptionRouteInCurrentTree)(state.tree) ? state.nextUrl : null;
    const navigatedAt = Date.now();
    return fetchServerAction(state, nextUrl, action).then(async (param)=>{
        let { actionResult, actionFlightData: flightData, redirectLocation, redirectType, isPrerender, revalidatedParts } = param;
        let redirectHref;
        // honor the redirect type instead of defaulting to push in case of server actions.
        if (redirectLocation) {
            if (redirectType === _redirecterror.RedirectType.replace) {
                state.pushRef.pendingPush = false;
                mutable.pendingPush = false;
            } else {
                state.pushRef.pendingPush = true;
                mutable.pendingPush = true;
            }
            redirectHref = (0, _createhreffromurl.createHrefFromUrl)(redirectLocation, false);
            mutable.canonicalUrl = redirectHref;
        }
        if (!flightData) {
            resolve(actionResult);
            // If there is a redirect but no flight data we need to do a mpaNavigation.
            if (redirectLocation) {
                return (0, _navigatereducer.handleExternalUrl)(state, mutable, redirectLocation.href, state.pushRef.pendingPush);
            }
            return state;
        }
        if (typeof flightData === 'string') {
            // Handle case when navigating to page in `pages` from `app`
            resolve(actionResult);
            return (0, _navigatereducer.handleExternalUrl)(state, mutable, flightData, state.pushRef.pendingPush);
        }
        const actionRevalidated = revalidatedParts.paths.length > 0 || revalidatedParts.tag || revalidatedParts.cookie;
        for (const normalizedFlightData of flightData){
            const { tree: treePatch, seedData: cacheNodeSeedData, head, isRootRender } = normalizedFlightData;
            if (!isRootRender) {
                // TODO-APP: handle this case better
                console.log('SERVER ACTION APPLY FAILED');
                resolve(actionResult);
                return state;
            }
            // Given the path can only have two items the items are only the router state and rsc for the root.
            const newTree = (0, _applyrouterstatepatchtotree.applyRouterStatePatchToTree)([
                ''
            ], currentTree, treePatch, redirectHref ? redirectHref : state.canonicalUrl);
            if (newTree === null) {
                resolve(actionResult);
                return (0, _handlesegmentmismatch.handleSegmentMismatch)(state, action, treePatch);
            }
            if ((0, _isnavigatingtonewrootlayout.isNavigatingToNewRootLayout)(currentTree, newTree)) {
                resolve(actionResult);
                return (0, _navigatereducer.handleExternalUrl)(state, mutable, redirectHref || state.canonicalUrl, state.pushRef.pendingPush);
            }
            // The server sent back RSC data for the server action, so we need to apply it to the cache.
            if (cacheNodeSeedData !== null) {
                const rsc = cacheNodeSeedData[1];
                const cache = (0, _approuter.createEmptyCacheNode)();
                cache.rsc = rsc;
                cache.prefetchRsc = null;
                cache.loading = cacheNodeSeedData[3];
                (0, _filllazyitemstillleafwithhead.fillLazyItemsTillLeafWithHead)(navigatedAt, cache, undefined, treePatch, cacheNodeSeedData, head, undefined);
                mutable.cache = cache;
                if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
                ;
                else {
                    mutable.prefetchCache = new Map();
                }
                if (actionRevalidated) {
                    await (0, _refetchinactiveparallelsegments.refreshInactiveParallelSegments)({
                        navigatedAt,
                        state,
                        updatedTree: newTree,
                        updatedCache: cache,
                        includeNextUrl: Boolean(nextUrl),
                        canonicalUrl: mutable.canonicalUrl || state.canonicalUrl
                    });
                }
            }
            mutable.patchedTree = newTree;
            currentTree = newTree;
        }
        if (redirectLocation && redirectHref) {
            if (!("TURBOPACK compile-time value", false) && !actionRevalidated) {
                // Because the RedirectBoundary will trigger a navigation, we need to seed the prefetch cache
                // with the FlightData that we got from the server action for the target page, so that it's
                // available when the page is navigated to and doesn't need to be re-fetched.
                // We only do this if the server action didn't revalidate any data, as in that case the
                // client cache will be cleared and the data will be re-fetched anyway.
                // NOTE: We don't do this in the Segment Cache implementation.
                // Dynamic data should never be placed into the cache, unless it's
                // "converted" to static data using <Link prefetch={true}>. What we
                // do instead is re-prefetch links and forms whenever the cache is
                // invalidated.
                (0, _prefetchcacheutils.createSeededPrefetchCacheEntry)({
                    url: redirectLocation,
                    data: {
                        flightData,
                        canonicalUrl: undefined,
                        couldBeIntercepted: false,
                        prerendered: false,
                        postponed: false,
                        // TODO: We should be able to set this if the server action
                        // returned a fully static response.
                        staleTime: -1
                    },
                    tree: state.tree,
                    prefetchCache: state.prefetchCache,
                    nextUrl: state.nextUrl,
                    kind: isPrerender ? _routerreducertypes.PrefetchKind.FULL : _routerreducertypes.PrefetchKind.AUTO
                });
                mutable.prefetchCache = state.prefetchCache;
            }
            // If the action triggered a redirect, the action promise will be rejected with
            // a redirect so that it's handled by RedirectBoundary as we won't have a valid
            // action result to resolve the promise with. This will effectively reset the state of
            // the component that called the action as the error boundary will remount the tree.
            // The status code doesn't matter here as the action handler will have already sent
            // a response with the correct status code.
            reject((0, _redirect.getRedirectError)((0, _hasbasepath.hasBasePath)(redirectHref) ? (0, _removebasepath.removeBasePath)(redirectHref) : redirectHref, redirectType || _redirecterror.RedirectType.push));
        } else {
            resolve(actionResult);
        }
        return (0, _handlemutable.handleMutable)(state, mutable);
    }, (e)=>{
        // When the server action is rejected we don't update the state and instead call the reject handler of the promise.
        reject(e);
        return state;
    });
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=server-action-reducer.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/router-reducer.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "reducer", {
    enumerable: true,
    get: function() {
        return reducer;
    }
});
const _routerreducertypes = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/router-reducer-types.js [app-ssr] (ecmascript)");
const _navigatereducer = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/reducers/navigate-reducer.js [app-ssr] (ecmascript)");
const _serverpatchreducer = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/reducers/server-patch-reducer.js [app-ssr] (ecmascript)");
const _restorereducer = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/reducers/restore-reducer.js [app-ssr] (ecmascript)");
const _refreshreducer = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/reducers/refresh-reducer.js [app-ssr] (ecmascript)");
const _prefetchreducer = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/reducers/prefetch-reducer.js [app-ssr] (ecmascript)");
const _hmrrefreshreducer = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/reducers/hmr-refresh-reducer.js [app-ssr] (ecmascript)");
const _serveractionreducer = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/reducers/server-action-reducer.js [app-ssr] (ecmascript)");
/**
 * Reducer that handles the app-router state updates.
 */ function clientReducer(state, action) {
    switch(action.type){
        case _routerreducertypes.ACTION_NAVIGATE:
            {
                return (0, _navigatereducer.navigateReducer)(state, action);
            }
        case _routerreducertypes.ACTION_SERVER_PATCH:
            {
                return (0, _serverpatchreducer.serverPatchReducer)(state, action);
            }
        case _routerreducertypes.ACTION_RESTORE:
            {
                return (0, _restorereducer.restoreReducer)(state, action);
            }
        case _routerreducertypes.ACTION_REFRESH:
            {
                return (0, _refreshreducer.refreshReducer)(state, action);
            }
        case _routerreducertypes.ACTION_HMR_REFRESH:
            {
                return (0, _hmrrefreshreducer.hmrRefreshReducer)(state, action);
            }
        case _routerreducertypes.ACTION_PREFETCH:
            {
                return (0, _prefetchreducer.prefetchReducer)(state, action);
            }
        case _routerreducertypes.ACTION_SERVER_ACTION:
            {
                return (0, _serveractionreducer.serverActionReducer)(state, action);
            }
        // This case should never be hit as dispatch is strongly typed.
        default:
            throw Object.defineProperty(new Error('Unknown action'), "__NEXT_ERROR_CODE", {
                value: "E295",
                enumerable: false,
                configurable: true
            });
    }
}
function serverReducer(state, _action) {
    return state;
}
const reducer = ("TURBOPACK compile-time truthy", 1) ? serverReducer : "TURBOPACK unreachable";
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=router-reducer.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/components/app-router-instance.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    createMutableActionQueue: null,
    dispatchNavigateAction: null,
    dispatchTraverseAction: null,
    getCurrentAppRouterState: null,
    publicAppRouterInstance: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    createMutableActionQueue: function() {
        return createMutableActionQueue;
    },
    dispatchNavigateAction: function() {
        return dispatchNavigateAction;
    },
    dispatchTraverseAction: function() {
        return dispatchTraverseAction;
    },
    getCurrentAppRouterState: function() {
        return getCurrentAppRouterState;
    },
    publicAppRouterInstance: function() {
        return publicAppRouterInstance;
    }
});
const _routerreducertypes = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/router-reducer-types.js [app-ssr] (ecmascript)");
const _routerreducer = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/router-reducer.js [app-ssr] (ecmascript)");
const _react = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
const _isthenable = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/shared/lib/is-thenable.js [app-ssr] (ecmascript)");
const _segmentcache = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/segment-cache.js [app-ssr] (ecmascript)");
const _useactionqueue = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/use-action-queue.js [app-ssr] (ecmascript)");
const _addbasepath = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/add-base-path.js [app-ssr] (ecmascript)");
const _approuter = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/app-router.js [app-ssr] (ecmascript)");
const _prefetchreducer = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/reducers/prefetch-reducer.js [app-ssr] (ecmascript)");
const _links = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/links.js [app-ssr] (ecmascript)");
function runRemainingActions(actionQueue, setState) {
    if (actionQueue.pending !== null) {
        actionQueue.pending = actionQueue.pending.next;
        if (actionQueue.pending !== null) {
            // eslint-disable-next-line @typescript-eslint/no-use-before-define
            runAction({
                actionQueue,
                action: actionQueue.pending,
                setState
            });
        } else {
            // No more actions are pending, check if a refresh is needed
            if (actionQueue.needsRefresh) {
                actionQueue.needsRefresh = false;
                actionQueue.dispatch({
                    type: _routerreducertypes.ACTION_REFRESH,
                    origin: window.location.origin
                }, setState);
            }
        }
    }
}
async function runAction(param) {
    let { actionQueue, action, setState } = param;
    const prevState = actionQueue.state;
    actionQueue.pending = action;
    const payload = action.payload;
    const actionResult = actionQueue.action(prevState, payload);
    function handleResult(nextState) {
        // if we discarded this action, the state should also be discarded
        if (action.discarded) {
            return;
        }
        actionQueue.state = nextState;
        runRemainingActions(actionQueue, setState);
        action.resolve(nextState);
    }
    // if the action is a promise, set up a callback to resolve it
    if ((0, _isthenable.isThenable)(actionResult)) {
        actionResult.then(handleResult, (err)=>{
            runRemainingActions(actionQueue, setState);
            action.reject(err);
        });
    } else {
        handleResult(actionResult);
    }
}
function dispatchAction(actionQueue, payload, setState) {
    let resolvers = {
        resolve: setState,
        reject: ()=>{}
    };
    // most of the action types are async with the exception of restore
    // it's important that restore is handled quickly since it's fired on the popstate event
    // and we don't want to add any delay on a back/forward nav
    // this only creates a promise for the async actions
    if (payload.type !== _routerreducertypes.ACTION_RESTORE) {
        // Create the promise and assign the resolvers to the object.
        const deferredPromise = new Promise((resolve, reject)=>{
            resolvers = {
                resolve,
                reject
            };
        });
        (0, _react.startTransition)(()=>{
            // we immediately notify React of the pending promise -- the resolver is attached to the action node
            // and will be called when the associated action promise resolves
            setState(deferredPromise);
        });
    }
    const newAction = {
        payload,
        next: null,
        resolve: resolvers.resolve,
        reject: resolvers.reject
    };
    // Check if the queue is empty
    if (actionQueue.pending === null) {
        // The queue is empty, so add the action and start it immediately
        // Mark this action as the last in the queue
        actionQueue.last = newAction;
        runAction({
            actionQueue,
            action: newAction,
            setState
        });
    } else if (payload.type === _routerreducertypes.ACTION_NAVIGATE || payload.type === _routerreducertypes.ACTION_RESTORE) {
        // Navigations (including back/forward) take priority over any pending actions.
        // Mark the pending action as discarded (so the state is never applied) and start the navigation action immediately.
        actionQueue.pending.discarded = true;
        // The rest of the current queue should still execute after this navigation.
        // (Note that it can't contain any earlier navigations, because we always put those into `actionQueue.pending` by calling `runAction`)
        newAction.next = actionQueue.pending.next;
        // if the pending action was a server action, mark the queue as needing a refresh once events are processed
        if (actionQueue.pending.payload.type === _routerreducertypes.ACTION_SERVER_ACTION) {
            actionQueue.needsRefresh = true;
        }
        runAction({
            actionQueue,
            action: newAction,
            setState
        });
    } else {
        // The queue is not empty, so add the action to the end of the queue
        // It will be started by runRemainingActions after the previous action finishes
        if (actionQueue.last !== null) {
            actionQueue.last.next = newAction;
        }
        actionQueue.last = newAction;
    }
}
let globalActionQueue = null;
function createMutableActionQueue(initialState, instrumentationHooks) {
    const actionQueue = {
        state: initialState,
        dispatch: (payload, setState)=>dispatchAction(actionQueue, payload, setState),
        action: async (state, action)=>{
            const result = (0, _routerreducer.reducer)(state, action);
            return result;
        },
        pending: null,
        last: null,
        onRouterTransitionStart: instrumentationHooks !== null && typeof instrumentationHooks.onRouterTransitionStart === 'function' ? instrumentationHooks.onRouterTransitionStart : null
    };
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    return actionQueue;
}
function getCurrentAppRouterState() {
    return globalActionQueue !== null ? globalActionQueue.state : null;
}
function getAppRouterActionQueue() {
    if (globalActionQueue === null) {
        throw Object.defineProperty(new Error('Internal Next.js error: Router action dispatched before initialization.'), "__NEXT_ERROR_CODE", {
            value: "E668",
            enumerable: false,
            configurable: true
        });
    }
    return globalActionQueue;
}
function getProfilingHookForOnNavigationStart() {
    if (globalActionQueue !== null) {
        return globalActionQueue.onRouterTransitionStart;
    }
    return null;
}
function dispatchNavigateAction(href, navigateType, shouldScroll, linkInstanceRef) {
    // TODO: This stuff could just go into the reducer. Leaving as-is for now
    // since we're about to rewrite all the router reducer stuff anyway.
    const url = new URL((0, _addbasepath.addBasePath)(href), location.href);
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    (0, _links.setLinkForCurrentNavigation)(linkInstanceRef);
    const onRouterTransitionStart = getProfilingHookForOnNavigationStart();
    if (onRouterTransitionStart !== null) {
        onRouterTransitionStart(href, navigateType);
    }
    (0, _useactionqueue.dispatchAppRouterAction)({
        type: _routerreducertypes.ACTION_NAVIGATE,
        url,
        isExternalUrl: (0, _approuter.isExternalURL)(url),
        locationSearch: location.search,
        shouldScroll,
        navigateType,
        allowAliasing: true
    });
}
function dispatchTraverseAction(href, tree) {
    const onRouterTransitionStart = getProfilingHookForOnNavigationStart();
    if (onRouterTransitionStart !== null) {
        onRouterTransitionStart(href, 'traverse');
    }
    (0, _useactionqueue.dispatchAppRouterAction)({
        type: _routerreducertypes.ACTION_RESTORE,
        url: new URL(href),
        tree
    });
}
const publicAppRouterInstance = {
    back: ()=>window.history.back(),
    forward: ()=>window.history.forward(),
    prefetch: ("TURBOPACK compile-time falsy", 0) ? // cache. So we don't need to dispatch an action.
    "TURBOPACK unreachable" : (href, options)=>{
        // Use the old prefetch implementation.
        const actionQueue = getAppRouterActionQueue();
        const url = (0, _approuter.createPrefetchURL)(href);
        if (url !== null) {
            var _options_kind;
            // The prefetch reducer doesn't actually update any state or
            // trigger a rerender. It just writes to a mutable cache. So we
            // shouldn't bother calling setState/dispatch; we can just re-run
            // the reducer directly using the current state.
            // TODO: Refactor this away from a "reducer" so it's
            // less confusing.
            (0, _prefetchreducer.prefetchReducer)(actionQueue.state, {
                type: _routerreducertypes.ACTION_PREFETCH,
                url,
                kind: (_options_kind = options == null ? void 0 : options.kind) != null ? _options_kind : _routerreducertypes.PrefetchKind.FULL
            });
        }
    },
    replace: (href, options)=>{
        (0, _react.startTransition)(()=>{
            var _options_scroll;
            dispatchNavigateAction(href, 'replace', (_options_scroll = options == null ? void 0 : options.scroll) != null ? _options_scroll : true, null);
        });
    },
    push: (href, options)=>{
        (0, _react.startTransition)(()=>{
            var _options_scroll;
            dispatchNavigateAction(href, 'push', (_options_scroll = options == null ? void 0 : options.scroll) != null ? _options_scroll : true, null);
        });
    },
    refresh: ()=>{
        (0, _react.startTransition)(()=>{
            (0, _useactionqueue.dispatchAppRouterAction)({
                type: _routerreducertypes.ACTION_REFRESH,
                origin: window.location.origin
            });
        });
    },
    hmrRefresh: ()=>{
        if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
        ;
        else {
            (0, _react.startTransition)(()=>{
                (0, _useactionqueue.dispatchAppRouterAction)({
                    type: _routerreducertypes.ACTION_HMR_REFRESH,
                    origin: window.location.origin
                });
            });
        }
    }
};
// Exists for debugging purposes. Don't use in application code.
if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
;
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=app-router-instance.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/components/links.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    IDLE_LINK_STATUS: null,
    PENDING_LINK_STATUS: null,
    mountFormInstance: null,
    mountLinkInstance: null,
    onLinkVisibilityChanged: null,
    onNavigationIntent: null,
    pingVisibleLinks: null,
    setLinkForCurrentNavigation: null,
    unmountLinkForCurrentNavigation: null,
    unmountPrefetchableInstance: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    IDLE_LINK_STATUS: function() {
        return IDLE_LINK_STATUS;
    },
    PENDING_LINK_STATUS: function() {
        return PENDING_LINK_STATUS;
    },
    mountFormInstance: function() {
        return mountFormInstance;
    },
    mountLinkInstance: function() {
        return mountLinkInstance;
    },
    onLinkVisibilityChanged: function() {
        return onLinkVisibilityChanged;
    },
    onNavigationIntent: function() {
        return onNavigationIntent;
    },
    pingVisibleLinks: function() {
        return pingVisibleLinks;
    },
    setLinkForCurrentNavigation: function() {
        return setLinkForCurrentNavigation;
    },
    unmountLinkForCurrentNavigation: function() {
        return unmountLinkForCurrentNavigation;
    },
    unmountPrefetchableInstance: function() {
        return unmountPrefetchableInstance;
    }
});
const _approuterinstance = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/app-router-instance.js [app-ssr] (ecmascript)");
const _approuter = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/app-router.js [app-ssr] (ecmascript)");
const _segmentcache = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/segment-cache.js [app-ssr] (ecmascript)");
const _react = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
const _routerreducertypes = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/router-reducer/router-reducer-types.js [app-ssr] (ecmascript)");
const _invarianterror = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/shared/lib/invariant-error.js [app-ssr] (ecmascript)");
// Tracks the most recently navigated link instance. When null, indicates
// the current navigation was not initiated by a link click.
let linkForMostRecentNavigation = null;
const PENDING_LINK_STATUS = {
    pending: true
};
const IDLE_LINK_STATUS = {
    pending: false
};
function setLinkForCurrentNavigation(link) {
    (0, _react.startTransition)(()=>{
        linkForMostRecentNavigation == null ? void 0 : linkForMostRecentNavigation.setOptimisticLinkStatus(IDLE_LINK_STATUS);
        link == null ? void 0 : link.setOptimisticLinkStatus(PENDING_LINK_STATUS);
        linkForMostRecentNavigation = link;
    });
}
function unmountLinkForCurrentNavigation(link) {
    if (linkForMostRecentNavigation === link) {
        linkForMostRecentNavigation = null;
    }
}
// Use a WeakMap to associate a Link instance with its DOM element. This is
// used by the IntersectionObserver to track the link's visibility.
const prefetchable = typeof WeakMap === 'function' ? new WeakMap() : new Map();
// A Set of the currently visible links. We re-prefetch visible links after a
// cache invalidation, or when the current URL changes. It's a separate data
// structure from the WeakMap above because only the visible links need to
// be enumerated.
const prefetchableAndVisible = new Set();
// A single IntersectionObserver instance shared by all <Link> components.
const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(handleIntersect, {
    rootMargin: '200px'
}) : null;
function observeVisibility(element, instance) {
    const existingInstance = prefetchable.get(element);
    if (existingInstance !== undefined) {
        // This shouldn't happen because each <Link> component should have its own
        // anchor tag instance, but it's defensive coding to avoid a memory leak in
        // case there's a logical error somewhere else.
        unmountPrefetchableInstance(element);
    }
    // Only track prefetchable links that have a valid prefetch URL
    prefetchable.set(element, instance);
    if (observer !== null) {
        observer.observe(element);
    }
}
function coercePrefetchableUrl(href) {
    try {
        return (0, _approuter.createPrefetchURL)(href);
    } catch (e) {
        // createPrefetchURL sometimes throws an error if an invalid URL is
        // provided, though I'm not sure if it's actually necessary.
        // TODO: Consider removing the throw from the inner function, or change it
        // to reportError. Or maybe the error isn't even necessary for automatic
        // prefetches, just navigations.
        const reportErrorFn = typeof reportError === 'function' ? reportError : console.error;
        reportErrorFn("Cannot prefetch '" + href + "' because it cannot be converted to a URL.");
        return null;
    }
}
function mountLinkInstance(element, href, router, fetchStrategy, prefetchEnabled, setOptimisticLinkStatus) {
    if (prefetchEnabled) {
        const prefetchURL = coercePrefetchableUrl(href);
        if (prefetchURL !== null) {
            const instance = {
                router,
                fetchStrategy,
                isVisible: false,
                prefetchTask: null,
                prefetchHref: prefetchURL.href,
                setOptimisticLinkStatus
            };
            // We only observe the link's visibility if it's prefetchable. For
            // example, this excludes links to external URLs.
            observeVisibility(element, instance);
            return instance;
        }
    }
    // If the link is not prefetchable, we still create an instance so we can
    // track its optimistic state (i.e. useLinkStatus).
    const instance = {
        router,
        fetchStrategy,
        isVisible: false,
        prefetchTask: null,
        prefetchHref: null,
        setOptimisticLinkStatus
    };
    return instance;
}
function mountFormInstance(element, href, router, fetchStrategy) {
    const prefetchURL = coercePrefetchableUrl(href);
    if (prefetchURL === null) {
        // This href is not prefetchable, so we don't track it.
        // TODO: We currently observe/unobserve a form every time its href changes.
        // For Links, this isn't a big deal because the href doesn't usually change,
        // but for forms it's extremely common. We should optimize this.
        return;
    }
    const instance = {
        router,
        fetchStrategy,
        isVisible: false,
        prefetchTask: null,
        prefetchHref: prefetchURL.href,
        setOptimisticLinkStatus: null
    };
    observeVisibility(element, instance);
}
function unmountPrefetchableInstance(element) {
    const instance = prefetchable.get(element);
    if (instance !== undefined) {
        prefetchable.delete(element);
        prefetchableAndVisible.delete(instance);
        const prefetchTask = instance.prefetchTask;
        if (prefetchTask !== null) {
            (0, _segmentcache.cancelPrefetchTask)(prefetchTask);
        }
    }
    if (observer !== null) {
        observer.unobserve(element);
    }
}
function handleIntersect(entries) {
    for (const entry of entries){
        // Some extremely old browsers or polyfills don't reliably support
        // isIntersecting so we check intersectionRatio instead. (Do we care? Not
        // really. But whatever this is fine.)
        const isVisible = entry.intersectionRatio > 0;
        onLinkVisibilityChanged(entry.target, isVisible);
    }
}
function onLinkVisibilityChanged(element, isVisible) {
    if ("TURBOPACK compile-time truthy", 1) {
        // Prefetching on viewport is disabled in development for performance
        // reasons, because it requires compiling the target page.
        // TODO: Investigate re-enabling this.
        return;
    }
    //TURBOPACK unreachable
    ;
    const instance = undefined;
}
function onNavigationIntent(element, unstable_upgradeToDynamicPrefetch) {
    const instance = prefetchable.get(element);
    if (instance === undefined) {
        return;
    }
    // Prefetch the link on hover/touchstart.
    if (instance !== undefined) {
        if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
        ;
        rescheduleLinkPrefetch(instance, _segmentcache.PrefetchPriority.Intent);
    }
}
function rescheduleLinkPrefetch(instance, priority) {
    const existingPrefetchTask = instance.prefetchTask;
    if (!instance.isVisible) {
        // Cancel any in-progress prefetch task. (If it already finished then this
        // is a no-op.)
        if (existingPrefetchTask !== null) {
            (0, _segmentcache.cancelPrefetchTask)(existingPrefetchTask);
        }
        // We don't need to reset the prefetchTask to null upon cancellation; an
        // old task object can be rescheduled with reschedulePrefetchTask. This is a
        // micro-optimization but also makes the code simpler (don't need to
        // worry about whether an old task object is stale).
        return;
    }
    if ("TURBOPACK compile-time truthy", 1) {
        // The old prefetch implementation does not have different priority levels.
        // Just schedule a new prefetch task.
        prefetchWithOldCacheImplementation(instance);
        return;
    }
    //TURBOPACK unreachable
    ;
    const appRouterState = undefined;
}
function pingVisibleLinks(nextUrl, tree) {
    // For each currently visible link, cancel the existing prefetch task (if it
    // exists) and schedule a new one. This is effectively the same as if all the
    // visible links left and then re-entered the viewport.
    //
    // This is called when the Next-Url or the base tree changes, since those
    // may affect the result of a prefetch task. It's also called after a
    // cache invalidation.
    for (const instance of prefetchableAndVisible){
        const task = instance.prefetchTask;
        if (task !== null && !(0, _segmentcache.isPrefetchTaskDirty)(task, nextUrl, tree)) {
            continue;
        }
        // Something changed. Cancel the existing prefetch task and schedule a
        // new one.
        if (task !== null) {
            (0, _segmentcache.cancelPrefetchTask)(task);
        }
        const cacheKey = (0, _segmentcache.createCacheKey)(instance.prefetchHref, nextUrl);
        instance.prefetchTask = (0, _segmentcache.schedulePrefetchTask)(cacheKey, tree, instance.fetchStrategy, _segmentcache.PrefetchPriority.Default, null);
    }
}
function prefetchWithOldCacheImplementation(instance) {
    // This is the path used when the Segment Cache is not enabled.
    if ("TURBOPACK compile-time truthy", 1) {
        return;
    }
    //TURBOPACK unreachable
    ;
    const doPrefetch = undefined;
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=links.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/shared/lib/router/utils/is-local-url.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "isLocalURL", {
    enumerable: true,
    get: function() {
        return isLocalURL;
    }
});
const _utils = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/shared/lib/utils.js [app-ssr] (ecmascript)");
const _hasbasepath = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/has-base-path.js [app-ssr] (ecmascript)");
function isLocalURL(url) {
    // prevent a hydration mismatch on href for url with anchor refs
    if (!(0, _utils.isAbsoluteUrl)(url)) return true;
    try {
        // absolute urls can be local if they are on the same origin
        const locationOrigin = (0, _utils.getLocationOrigin)();
        const resolved = new URL(url, locationOrigin);
        return resolved.origin === locationOrigin && (0, _hasbasepath.hasBasePath)(resolved.pathname);
    } catch (_) {
        return false;
    }
} //# sourceMappingURL=is-local-url.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/shared/lib/utils/error-once.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "errorOnce", {
    enumerable: true,
    get: function() {
        return errorOnce;
    }
});
let errorOnce = (_)=>{};
if ("TURBOPACK compile-time truthy", 1) {
    const errors = new Set();
    errorOnce = (msg)=>{
        if (!errors.has(msg)) {
            console.error(msg);
        }
        errors.add(msg);
    };
} //# sourceMappingURL=error-once.js.map
}),
"[project]/Projects/fmko/node_modules/next/dist/client/app-dir/link.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    default: null,
    useLinkStatus: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    /**
 * A React component that extends the HTML `<a>` element to provide
 * [prefetching](https://nextjs.org/docs/app/building-your-application/routing/linking-and-navigating#2-prefetching)
 * and client-side navigation. This is the primary way to navigate between routes in Next.js.
 *
 * @remarks
 * - Prefetching is only enabled in production.
 *
 * @see https://nextjs.org/docs/app/api-reference/components/link
 */ default: function() {
        return LinkComponent;
    },
    useLinkStatus: function() {
        return useLinkStatus;
    }
});
const _interop_require_wildcard = __turbopack_context__.r("[project]/Projects/fmko/node_modules/@swc/helpers/cjs/_interop_require_wildcard.cjs [app-ssr] (ecmascript)");
const _jsxruntime = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-runtime.js [app-ssr] (ecmascript)");
const _react = /*#__PURE__*/ _interop_require_wildcard._(__turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)"));
const _formaturl = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/shared/lib/router/utils/format-url.js [app-ssr] (ecmascript)");
const _approutercontextsharedruntime = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/server/route-modules/app-page/vendored/contexts/app-router-context.js [app-ssr] (ecmascript)");
const _usemergedref = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/use-merged-ref.js [app-ssr] (ecmascript)");
const _utils = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/shared/lib/utils.js [app-ssr] (ecmascript)");
const _addbasepath = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/add-base-path.js [app-ssr] (ecmascript)");
const _warnonce = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/shared/lib/utils/warn-once.js [app-ssr] (ecmascript)");
const _links = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/links.js [app-ssr] (ecmascript)");
const _islocalurl = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/shared/lib/router/utils/is-local-url.js [app-ssr] (ecmascript)");
const _approuterinstance = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/app-router-instance.js [app-ssr] (ecmascript)");
const _erroronce = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/shared/lib/utils/error-once.js [app-ssr] (ecmascript)");
const _segmentcache = __turbopack_context__.r("[project]/Projects/fmko/node_modules/next/dist/client/components/segment-cache.js [app-ssr] (ecmascript)");
function isModifiedEvent(event) {
    const eventTarget = event.currentTarget;
    const target = eventTarget.getAttribute('target');
    return target && target !== '_self' || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || // triggers resource download
    event.nativeEvent && event.nativeEvent.which === 2;
}
function linkClicked(e, href, as, linkInstanceRef, replace, scroll, onNavigate) {
    const { nodeName } = e.currentTarget;
    // anchors inside an svg have a lowercase nodeName
    const isAnchorNodeName = nodeName.toUpperCase() === 'A';
    if (isAnchorNodeName && isModifiedEvent(e) || e.currentTarget.hasAttribute('download')) {
        // ignore click for browser’s default behavior
        return;
    }
    if (!(0, _islocalurl.isLocalURL)(href)) {
        if (replace) {
            // browser default behavior does not replace the history state
            // so we need to do it manually
            e.preventDefault();
            location.replace(href);
        }
        // ignore click for browser’s default behavior
        return;
    }
    e.preventDefault();
    if (onNavigate) {
        let isDefaultPrevented = false;
        onNavigate({
            preventDefault: ()=>{
                isDefaultPrevented = true;
            }
        });
        if (isDefaultPrevented) {
            return;
        }
    }
    _react.default.startTransition(()=>{
        (0, _approuterinstance.dispatchNavigateAction)(as || href, replace ? 'replace' : 'push', scroll != null ? scroll : true, linkInstanceRef.current);
    });
}
function formatStringOrUrl(urlObjOrString) {
    if (typeof urlObjOrString === 'string') {
        return urlObjOrString;
    }
    return (0, _formaturl.formatUrl)(urlObjOrString);
}
function LinkComponent(props) {
    const [linkStatus, setOptimisticLinkStatus] = (0, _react.useOptimistic)(_links.IDLE_LINK_STATUS);
    let children;
    const linkInstanceRef = (0, _react.useRef)(null);
    const { href: hrefProp, as: asProp, children: childrenProp, prefetch: prefetchProp = null, passHref, replace, shallow, scroll, onClick, onMouseEnter: onMouseEnterProp, onTouchStart: onTouchStartProp, legacyBehavior = false, onNavigate, ref: forwardedRef, unstable_dynamicOnHover, ...restProps } = props;
    children = childrenProp;
    if (legacyBehavior && (typeof children === 'string' || typeof children === 'number')) {
        children = /*#__PURE__*/ (0, _jsxruntime.jsx)("a", {
            children: children
        });
    }
    const router = _react.default.useContext(_approutercontextsharedruntime.AppRouterContext);
    const prefetchEnabled = prefetchProp !== false;
    const fetchStrategy = prefetchProp !== false ? getFetchStrategyFromPrefetchProp(prefetchProp) : _segmentcache.FetchStrategy.PPR;
    if ("TURBOPACK compile-time truthy", 1) {
        function createPropError(args) {
            return Object.defineProperty(new Error("Failed prop type: The prop `" + args.key + "` expects a " + args.expected + " in `<Link>`, but got `" + args.actual + "` instead." + (("TURBOPACK compile-time falsy", 0) ? "TURBOPACK unreachable" : '')), "__NEXT_ERROR_CODE", {
                value: "E319",
                enumerable: false,
                configurable: true
            });
        }
        // TypeScript trick for type-guarding:
        const requiredPropsGuard = {
            href: true
        };
        const requiredProps = Object.keys(requiredPropsGuard);
        requiredProps.forEach((key)=>{
            if (key === 'href') {
                if (props[key] == null || typeof props[key] !== 'string' && typeof props[key] !== 'object') {
                    throw createPropError({
                        key,
                        expected: '`string` or `object`',
                        actual: props[key] === null ? 'null' : typeof props[key]
                    });
                }
            } else {
                // TypeScript trick for type-guarding:
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const _ = key;
            }
        });
        // TypeScript trick for type-guarding:
        const optionalPropsGuard = {
            as: true,
            replace: true,
            scroll: true,
            shallow: true,
            passHref: true,
            prefetch: true,
            unstable_dynamicOnHover: true,
            onClick: true,
            onMouseEnter: true,
            onTouchStart: true,
            legacyBehavior: true,
            onNavigate: true
        };
        const optionalProps = Object.keys(optionalPropsGuard);
        optionalProps.forEach((key)=>{
            const valType = typeof props[key];
            if (key === 'as') {
                if (props[key] && valType !== 'string' && valType !== 'object') {
                    throw createPropError({
                        key,
                        expected: '`string` or `object`',
                        actual: valType
                    });
                }
            } else if (key === 'onClick' || key === 'onMouseEnter' || key === 'onTouchStart' || key === 'onNavigate') {
                if (props[key] && valType !== 'function') {
                    throw createPropError({
                        key,
                        expected: '`function`',
                        actual: valType
                    });
                }
            } else if (key === 'replace' || key === 'scroll' || key === 'shallow' || key === 'passHref' || key === 'legacyBehavior' || key === 'unstable_dynamicOnHover') {
                if (props[key] != null && valType !== 'boolean') {
                    throw createPropError({
                        key,
                        expected: '`boolean`',
                        actual: valType
                    });
                }
            } else if (key === 'prefetch') {
                if (props[key] != null && valType !== 'boolean' && props[key] !== 'auto' && props[key] !== 'unstable_forceStale') {
                    throw createPropError({
                        key,
                        expected: '`boolean | "auto" | "unstable_forceStale"`',
                        actual: valType
                    });
                }
            } else {
                // TypeScript trick for type-guarding:
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const _ = key;
            }
        });
    }
    if ("TURBOPACK compile-time truthy", 1) {
        if (props.locale) {
            (0, _warnonce.warnOnce)('The `locale` prop is not supported in `next/link` while using the `app` router. Read more about app router internalization: https://nextjs.org/docs/app/building-your-application/routing/internationalization');
        }
        if (!asProp) {
            let href;
            if (typeof hrefProp === 'string') {
                href = hrefProp;
            } else if (typeof hrefProp === 'object' && typeof hrefProp.pathname === 'string') {
                href = hrefProp.pathname;
            }
            if (href) {
                const hasDynamicSegment = href.split('/').some((segment)=>segment.startsWith('[') && segment.endsWith(']'));
                if (hasDynamicSegment) {
                    throw Object.defineProperty(new Error("Dynamic href `" + href + "` found in <Link> while using the `/app` router, this is not supported. Read more: https://nextjs.org/docs/messages/app-dir-dynamic-href"), "__NEXT_ERROR_CODE", {
                        value: "E267",
                        enumerable: false,
                        configurable: true
                    });
                }
            }
        }
    }
    const { href, as } = _react.default.useMemo(()=>{
        const resolvedHref = formatStringOrUrl(hrefProp);
        return {
            href: resolvedHref,
            as: asProp ? formatStringOrUrl(asProp) : resolvedHref
        };
    }, [
        hrefProp,
        asProp
    ]);
    // This will return the first child, if multiple are provided it will throw an error
    let child;
    if (legacyBehavior) {
        if ("TURBOPACK compile-time truthy", 1) {
            if (onClick) {
                console.warn('"onClick" was passed to <Link> with `href` of `' + hrefProp + '` but "legacyBehavior" was set. The legacy behavior requires onClick be set on the child of next/link');
            }
            if (onMouseEnterProp) {
                console.warn('"onMouseEnter" was passed to <Link> with `href` of `' + hrefProp + '` but "legacyBehavior" was set. The legacy behavior requires onMouseEnter be set on the child of next/link');
            }
            try {
                child = _react.default.Children.only(children);
            } catch (err) {
                if (!children) {
                    throw Object.defineProperty(new Error("No children were passed to <Link> with `href` of `" + hrefProp + "` but one child is required https://nextjs.org/docs/messages/link-no-children"), "__NEXT_ERROR_CODE", {
                        value: "E320",
                        enumerable: false,
                        configurable: true
                    });
                }
                throw Object.defineProperty(new Error("Multiple children were passed to <Link> with `href` of `" + hrefProp + "` but only one child is supported https://nextjs.org/docs/messages/link-multiple-children" + (("TURBOPACK compile-time falsy", 0) ? "TURBOPACK unreachable" : '')), "__NEXT_ERROR_CODE", {
                    value: "E266",
                    enumerable: false,
                    configurable: true
                });
            }
        } else //TURBOPACK unreachable
        ;
    } else {
        if ("TURBOPACK compile-time truthy", 1) {
            if ((children == null ? void 0 : children.type) === 'a') {
                throw Object.defineProperty(new Error('Invalid <Link> with <a> child. Please remove <a> or use <Link legacyBehavior>.\nLearn more: https://nextjs.org/docs/messages/invalid-new-link-with-extra-anchor'), "__NEXT_ERROR_CODE", {
                    value: "E209",
                    enumerable: false,
                    configurable: true
                });
            }
        }
    }
    const childRef = legacyBehavior ? child && typeof child === 'object' && child.ref : forwardedRef;
    // Use a callback ref to attach an IntersectionObserver to the anchor tag on
    // mount. In the future we will also use this to keep track of all the
    // currently mounted <Link> instances, e.g. so we can re-prefetch them after
    // a revalidation or refresh.
    const observeLinkVisibilityOnMount = _react.default.useCallback((element)=>{
        if (router !== null) {
            linkInstanceRef.current = (0, _links.mountLinkInstance)(element, href, router, fetchStrategy, prefetchEnabled, setOptimisticLinkStatus);
        }
        return ()=>{
            if (linkInstanceRef.current) {
                (0, _links.unmountLinkForCurrentNavigation)(linkInstanceRef.current);
                linkInstanceRef.current = null;
            }
            (0, _links.unmountPrefetchableInstance)(element);
        };
    }, [
        prefetchEnabled,
        href,
        router,
        fetchStrategy,
        setOptimisticLinkStatus
    ]);
    const mergedRef = (0, _usemergedref.useMergedRef)(observeLinkVisibilityOnMount, childRef);
    const childProps = {
        ref: mergedRef,
        onClick (e) {
            if ("TURBOPACK compile-time truthy", 1) {
                if (!e) {
                    throw Object.defineProperty(new Error('Component rendered inside next/link has to pass click event to "onClick" prop.'), "__NEXT_ERROR_CODE", {
                        value: "E312",
                        enumerable: false,
                        configurable: true
                    });
                }
            }
            if (!legacyBehavior && typeof onClick === 'function') {
                onClick(e);
            }
            if (legacyBehavior && child.props && typeof child.props.onClick === 'function') {
                child.props.onClick(e);
            }
            if (!router) {
                return;
            }
            if (e.defaultPrevented) {
                return;
            }
            linkClicked(e, href, as, linkInstanceRef, replace, scroll, onNavigate);
        },
        onMouseEnter (e) {
            if (!legacyBehavior && typeof onMouseEnterProp === 'function') {
                onMouseEnterProp(e);
            }
            if (legacyBehavior && child.props && typeof child.props.onMouseEnter === 'function') {
                child.props.onMouseEnter(e);
            }
            if (!router) {
                return;
            }
            if ("TURBOPACK compile-time truthy", 1) {
                return;
            }
            //TURBOPACK unreachable
            ;
            const upgradeToDynamicPrefetch = undefined;
        },
        onTouchStart: ("TURBOPACK compile-time falsy", 0) ? "TURBOPACK unreachable" : function onTouchStart(e) {
            if (!legacyBehavior && typeof onTouchStartProp === 'function') {
                onTouchStartProp(e);
            }
            if (legacyBehavior && child.props && typeof child.props.onTouchStart === 'function') {
                child.props.onTouchStart(e);
            }
            if (!router) {
                return;
            }
            if (!prefetchEnabled) {
                return;
            }
            const upgradeToDynamicPrefetch = unstable_dynamicOnHover === true;
            (0, _links.onNavigationIntent)(e.currentTarget, upgradeToDynamicPrefetch);
        }
    };
    // If child is an <a> tag and doesn't have a href attribute, or if the 'passHref' property is
    // defined, we specify the current 'href', so that repetition is not needed by the user.
    // If the url is absolute, we can bypass the logic to prepend the basePath.
    if ((0, _utils.isAbsoluteUrl)(as)) {
        childProps.href = as;
    } else if (!legacyBehavior || passHref || child.type === 'a' && !('href' in child.props)) {
        childProps.href = (0, _addbasepath.addBasePath)(as);
    }
    let link;
    if (legacyBehavior) {
        if ("TURBOPACK compile-time truthy", 1) {
            (0, _erroronce.errorOnce)('`legacyBehavior` is deprecated and will be removed in a future ' + 'release. A codemod is available to upgrade your components:\n\n' + 'npx @next/codemod@latest new-link .\n\n' + 'Learn more: https://nextjs.org/docs/app/building-your-application/upgrading/codemods#remove-a-tags-from-link-components');
        }
        link = /*#__PURE__*/ _react.default.cloneElement(child, childProps);
    } else {
        link = /*#__PURE__*/ (0, _jsxruntime.jsx)("a", {
            ...restProps,
            ...childProps,
            children: children
        });
    }
    return /*#__PURE__*/ (0, _jsxruntime.jsx)(LinkStatusContext.Provider, {
        value: linkStatus,
        children: link
    });
}
const LinkStatusContext = /*#__PURE__*/ (0, _react.createContext)(_links.IDLE_LINK_STATUS);
const useLinkStatus = ()=>{
    return (0, _react.useContext)(LinkStatusContext);
};
function getFetchStrategyFromPrefetchProp(prefetchProp) {
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    else {
        return prefetchProp === null || prefetchProp === 'auto' ? _segmentcache.FetchStrategy.PPR : // (although invalid values should've been filtered out by prop validation in dev)
        _segmentcache.FetchStrategy.Full;
    }
}
if ((typeof exports.default === 'function' || typeof exports.default === 'object' && exports.default !== null) && typeof exports.default.__esModule === 'undefined') {
    Object.defineProperty(exports.default, '__esModule', {
        value: true
    });
    Object.assign(exports.default, exports);
    module.exports = exports.default;
} //# sourceMappingURL=link.js.map
}),
"[project]/Projects/fmko/node_modules/facesjs/build/override.js [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>__TURBOPACK__default__export__
]);
const override = (obj, overrides)=>{
    if (!overrides || !obj) {
        return;
    }
    for (const [key, value] of Object.entries(overrides)){
        if (typeof value === "boolean" || typeof value === "string" || typeof value === "number" || Array.isArray(value)) {
            obj[key] = value;
        } else {
            // @ts-expect-error
            override(obj[key], value);
        }
    }
};
const __TURBOPACK__default__export__ = override;
}),
"[project]/Projects/fmko/node_modules/facesjs/build/svgs.js [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// THIS IS A GENERATED FILE, DO NOT EDIT BY HAND!
// See tools/process-svgs.js
__turbopack_context__.s([
    "default",
    ()=>__TURBOPACK__default__export__
]);
const __TURBOPACK__default__export__ = {
    "accessories": {
        "eye-black": "<path d=\"m100 356 6-6h47l6 6v9l-6 5h-47l-6-6zm148 14-6-6v-8l6-6h47l6 6v8l-6 6z\" style=\"fill:#000\"/>",
        "hat": "<g fill=\"$[secondary]\" stroke=\"#000\"><path stroke-width=\"2\" d=\"M199.8 82c3.4 0 7.2.6 8.8 1.5 1.6.8 2.9 2 2.9 2.5s.2 1.7.5 2.5c.4 1.3-1.3 1.5-12 1.5s-12.4-.2-12-1.5c.3-.8.4-1.9.3-2.5-.1-.5 1.1-1.6 2.7-2.4 1.5-.9 5.4-1.5 8.8-1.6z\"/><path stroke-width=\"6\" d=\"M197.8 90.1c13.3-.1 23 .5 34.6 1.9 8.8 1.1 20.8 3 26.6 4.1s15.5 3.3 21.6 5c6 1.6 14.4 4.3 18.7 6 4.2 1.7 10.2 4.5 13.3 6.2 3.1 1.8 7.4 5 9.5 7.2 2.3 2.3 5.3 7.1 7.1 11.3 2 4.7 4 12 5.6 21 1.4 7.5 3.5 17.8 4.7 22.7s3.2 11.7 4.3 15c1.2 3.3 3 11.8 4 19 .9 7.2 1.7 17.9 1.7 24s-.3 11.8-.7 12.7c-.6 1.5-1.1 1.4-4.9-1.1-2.4-1.5-8.9-5.3-14.4-8.4-5.6-3-16.4-8.3-24-11.7-7.7-3.5-20.8-8.6-29.3-11.5-8.4-3-21.8-6.7-29.7-8.4-7.9-1.6-18.6-3.5-23.7-4.1-5.2-.5-15.4-1-22.8-1s-17.6.5-22.8 1c-5.1.6-15.8 2.5-23.7 4.1-7.9 1.7-22 5.7-31.2 8.9s-22.4 8.3-29.2 11.5c-6.9 3.1-17.9 8.6-24.5 12.2s-13.2 7.4-14.6 8.4c-2.3 1.6-2.7 1.7-3.1.4-.3-.8-.5-6.1-.5-11.7 0-5.7.6-15.5 1.3-21.8.8-6.3 1.9-13.5 2.5-16 .7-2.5 2.4-8.3 3.9-13s3.8-14.6 5.1-22 3.1-16.4 4-20 2.7-8.9 4.1-11.9 4.3-7.3 6.5-9.5c2.1-2.3 7.3-6 11.5-8.2 4.2-2.3 10.8-5.3 14.8-6.7s11.5-3.7 16.8-5.1 13.5-3.3 18.2-4.2 15.8-2.7 24.5-3.9c11.2-1.6 21.1-2.3 34.2-2.4z\"/><path stroke-width=\"4\" d=\"M69.6 237.7c-6.6 3.6-13.2 7.4-14.7 8.4-2.2 1.6-2.7 1.7-3.1.4-.2-.8-.4-6.1-.4-11.7-.1-5.7.6-15.5 1.3-21.8s1.9-13.5 2.5-16 2.4-8.3 3.9-13 3.8-14.6 5.1-22c0 0 12 72.1 5.4 75.7zM336.8 162c1.3 7.4 3.6 17.3 5.1 22s3.2 10.5 3.9 13c.6 2.5 1.7 9.7 2.5 16 .7 6.3 1.3 16.1 1.3 21.8 0 5.6-.2 10.9-.5 11.7-.4 1.3-.8 1.2-3.1-.4-1.4-1-8-4.8-14.6-8.4s5.4-75.7 5.4-75.7z\"/><path stroke-width=\"6\" d=\"M196.2 197c9.2 0 20.8.3 25.9.7 5 .4 13.6 1.5 19.1 2.4 5.6 1 14.4 2.8 19.7 4.1s13.7 3.7 18.7 5.2c5 1.6 14.7 5.1 21.6 7.9 6.8 2.7 17 7.3 22.5 10 5.6 2.8 14.9 7.9 20.6 11.2 5.8 3.4 12.4 7.5 14.6 9.2 3.2 2.4 4.1 3.6 4.1 5.6 0 1.6-.7 3.3-1.9 4.2-1.1.9-3.2 1.6-4.8 1.6-2.1 0-5.1-1.4-10.8-5.1-4.3-2.8-13.3-8-19.9-11.6s-19.3-9.5-28.3-13.1c-8.9-3.7-20.6-8-25.9-9.6-5.2-1.5-13.4-3.7-18.2-4.9-4.7-1.1-14.9-2.9-22.5-4-11.3-1.7-17.1-2-30.7-2s-19.4.3-30.7 2c-7.6 1.1-17.8 2.9-22.5 4-4.8 1.2-13 3.4-18.2 4.9-5.3 1.6-17 5.9-25.9 9.6-9 3.6-21.7 9.5-28.3 13.1s-15.6 8.8-19.9 11.6c-6.3 4.1-8.6 5.1-11.3 5.1-1.8 0-4-.5-4.8-1.2-.8-.6-1.4-2.4-1.4-4 0-2.2.8-3.4 3.8-5.9 2.1-1.8 7.4-5.3 11.7-7.8s12.8-7.2 18.9-10.4 17.6-8.4 25.5-11.7c7.9-3.2 18.7-7.2 24-8.8 5.3-1.7 14.7-4.2 21.1-5.7 6.3-1.5 17.3-3.6 24.4-4.6 10.3-1.5 16.5-2 29.8-2z\"/></g>",
        "hat2": "<g stroke=\"#000\"><path fill=\"$[primary]\" stroke-width=\"2\" d=\"M199.8 82c3.4 0 7.2.6 8.8 1.5 1.6.8 2.9 2 2.9 2.5s.2 1.7.5 2.5c.4 1.3-1.3 1.5-12 1.5s-12.4-.2-12-1.5c.3-.8.4-1.9.3-2.5-.1-.5 1.1-1.6 2.7-2.4 1.5-.9 5.4-1.5 8.8-1.6z\"/><path fill=\"$[secondary]\" stroke-width=\"6\" d=\"M197.8 90.1c13.3-.1 23 .5 34.6 1.9 8.8 1.1 20.8 3 26.6 4.1s15.5 3.3 21.6 5c6 1.6 14.4 4.3 18.7 6 4.2 1.7 10.2 4.5 13.3 6.2 3.1 1.8 7.4 5 9.5 7.2 2.3 2.3 5.3 7.1 7.1 11.3 2 4.7 4 12 5.6 21 1.4 7.5 3.5 17.8 4.7 22.7s3.2 11.7 4.3 15c1.2 3.3 3 11.8 4 19 .9 7.2 1.7 17.9 1.7 24s-.3 11.8-.7 12.7c-.6 1.5-1.1 1.4-4.9-1.1-2.4-1.5-8.9-5.3-14.4-8.4-5.6-3-16.4-8.3-24-11.7-7.7-3.5-20.8-8.6-29.3-11.5-8.4-3-21.8-6.7-29.7-8.4-7.9-1.6-18.6-3.5-23.7-4.1-5.2-.5-15.4-1-22.8-1s-17.6.5-22.8 1c-5.1.6-15.8 2.5-23.7 4.1-7.9 1.7-22 5.7-31.2 8.9s-22.4 8.3-29.2 11.5c-6.9 3.1-17.9 8.6-24.5 12.2s-13.2 7.4-14.6 8.4c-2.3 1.6-2.7 1.7-3.1.4-.3-.8-.5-6.1-.5-11.7 0-5.7.6-15.5 1.3-21.8.8-6.3 1.9-13.5 2.5-16 .7-2.5 2.4-8.3 3.9-13s3.8-14.6 5.1-22 3.1-16.4 4-20 2.7-8.9 4.1-11.9 4.3-7.3 6.5-9.5c2.1-2.3 7.3-6 11.5-8.2 4.2-2.3 10.8-5.3 14.8-6.7s11.5-3.7 16.8-5.1 13.5-3.3 18.2-4.2 15.8-2.7 24.5-3.9c11.2-1.6 21.1-2.3 34.2-2.4z\"/><path fill=\"$[secondary]\" stroke-width=\"4\" d=\"M69.6 237.7c-6.6 3.6-13.2 7.4-14.7 8.4-2.2 1.6-2.7 1.7-3.1.4-.2-.8-.4-6.1-.4-11.7-.1-5.7.6-15.5 1.3-21.8s1.9-13.5 2.5-16 2.4-8.3 3.9-13 3.8-14.6 5.1-22c0 0 12 72.1 5.4 75.7zM336.8 162c1.3 7.4 3.6 17.3 5.1 22s3.2 10.5 3.9 13c.6 2.5 1.7 9.7 2.5 16 .7 6.3 1.3 16.1 1.3 21.8 0 5.6-.2 10.9-.5 11.7-.4 1.3-.8 1.2-3.1-.4-1.4-1-8-4.8-14.6-8.4s5.4-75.7 5.4-75.7z\"/><path fill=\"$[primary]\" stroke-width=\"6\" d=\"M196.2 197c9.2 0 20.8.3 25.9.7 5 .4 13.6 1.5 19.1 2.4 5.6 1 14.4 2.8 19.7 4.1s13.7 3.7 18.7 5.2c5 1.6 14.7 5.1 21.6 7.9 6.8 2.7 17 7.3 22.5 10 5.6 2.8 14.9 7.9 20.6 11.2 5.8 3.4 12.4 7.5 14.6 9.2 3.2 2.4 4.1 3.6 4.1 5.6 0 1.6-.7 3.3-1.9 4.2-1.1.9-3.2 1.6-4.8 1.6-2.1 0-5.1-1.4-10.8-5.1-4.3-2.8-13.3-8-19.9-11.6s-19.3-9.5-28.3-13.1c-8.9-3.7-20.6-8-25.9-9.6-5.2-1.5-13.4-3.7-18.2-4.9-4.7-1.1-14.9-2.9-22.5-4-11.3-1.7-17.1-2-30.7-2s-19.4.3-30.7 2c-7.6 1.1-17.8 2.9-22.5 4-4.8 1.2-13 3.4-18.2 4.9-5.3 1.6-17 5.9-25.9 9.6-9 3.6-21.7 9.5-28.3 13.1s-15.6 8.8-19.9 11.6c-6.3 4.1-8.6 5.1-11.3 5.1-1.8 0-4-.5-4.8-1.2-.8-.6-1.4-2.4-1.4-4 0-2.2.8-3.4 3.8-5.9 2.1-1.8 7.4-5.3 11.7-7.8s12.8-7.2 18.9-10.4 17.6-8.4 25.5-11.7c7.9-3.2 18.7-7.2 24-8.8 5.3-1.7 14.7-4.2 21.1-5.7 6.3-1.5 17.3-3.6 24.4-4.6 10.3-1.5 16.5-2 29.8-2z\"/></g>",
        "hat3": "<g stroke=\"#000\"><path fill=\"$[accent]\" stroke-width=\"2\" d=\"M199.8 82c3.4 0 7.2.6 8.8 1.5 1.6.8 2.9 2 2.9 2.5s.2 1.7.5 2.5c.4 1.3-1.3 1.5-12 1.5s-12.4-.2-12-1.5c.3-.8.4-1.9.3-2.5-.1-.5 1.1-1.6 2.7-2.4 1.5-.9 5.4-1.5 8.8-1.6z\"/><path fill=\"$[secondary]\" stroke-width=\"6\" d=\"M197.8 90.1c13.3-.1 23 .5 34.6 1.9 8.8 1.1 20.8 3 26.6 4.1s15.5 3.3 21.6 5c6 1.6 14.4 4.3 18.7 6 4.2 1.7 10.2 4.5 13.3 6.2 3.1 1.8 7.4 5 9.5 7.2 2.3 2.3 5.3 7.1 7.1 11.3 2 4.7 4 12 5.6 21 1.4 7.5 3.5 17.8 4.7 22.7s3.2 11.7 4.3 15c1.2 3.3 3 11.8 4 19 .9 7.2 1.7 17.9 1.7 24s-.3 11.8-.7 12.7c-.6 1.5-1.1 1.4-4.9-1.1-2.4-1.5-8.9-5.3-14.4-8.4-5.6-3-16.4-8.3-24-11.7-7.7-3.5-20.8-8.6-29.3-11.5-8.4-3-21.8-6.7-29.7-8.4-7.9-1.6-18.6-3.5-23.7-4.1-5.2-.5-15.4-1-22.8-1s-17.6.5-22.8 1c-5.1.6-15.8 2.5-23.7 4.1-7.9 1.7-22 5.7-31.2 8.9s-22.4 8.3-29.2 11.5c-6.9 3.1-17.9 8.6-24.5 12.2s-13.2 7.4-14.6 8.4c-2.3 1.6-2.7 1.7-3.1.4-.3-.8-.5-6.1-.5-11.7 0-5.7.6-15.5 1.3-21.8.8-6.3 1.9-13.5 2.5-16 .7-2.5 2.4-8.3 3.9-13s3.8-14.6 5.1-22 3.1-16.4 4-20 2.7-8.9 4.1-11.9 4.3-7.3 6.5-9.5c2.1-2.3 7.3-6 11.5-8.2 4.2-2.3 10.8-5.3 14.8-6.7s11.5-3.7 16.8-5.1 13.5-3.3 18.2-4.2 15.8-2.7 24.5-3.9c11.2-1.6 21.1-2.3 34.2-2.4z\"/><path fill=\"$[primary]\" stroke-width=\"4\" d=\"M69.6 237.7c-6.6 3.6-13.2 7.4-14.7 8.4-2.2 1.6-2.7 1.7-3.1.4-.2-.8-.4-6.1-.4-11.7-.1-5.7.6-15.5 1.3-21.8s1.9-13.5 2.5-16 2.4-8.3 3.9-13 3.8-14.6 5.1-22c0 0 12 72.1 5.4 75.7zM336.8 162c1.3 7.4 3.6 17.3 5.1 22s3.2 10.5 3.9 13c.6 2.5 1.7 9.7 2.5 16 .7 6.3 1.3 16.1 1.3 21.8 0 5.6-.2 10.9-.5 11.7-.4 1.3-.8 1.2-3.1-.4-1.4-1-8-4.8-14.6-8.4s5.4-75.7 5.4-75.7z\"/><path fill=\"$[accent]\" stroke-width=\"6\" d=\"M196.2 197c9.2 0 20.8.3 25.9.7 5 .4 13.6 1.5 19.1 2.4 5.6 1 14.4 2.8 19.7 4.1s13.7 3.7 18.7 5.2c5 1.6 14.7 5.1 21.6 7.9 6.8 2.7 17 7.3 22.5 10 5.6 2.8 14.9 7.9 20.6 11.2 5.8 3.4 12.4 7.5 14.6 9.2 3.2 2.4 4.1 3.6 4.1 5.6 0 1.6-.7 3.3-1.9 4.2-1.1.9-3.2 1.6-4.8 1.6-2.1 0-5.1-1.4-10.8-5.1-4.3-2.8-13.3-8-19.9-11.6s-19.3-9.5-28.3-13.1c-8.9-3.7-20.6-8-25.9-9.6-5.2-1.5-13.4-3.7-18.2-4.9-4.7-1.1-14.9-2.9-22.5-4-11.3-1.7-17.1-2-30.7-2s-19.4.3-30.7 2c-7.6 1.1-17.8 2.9-22.5 4-4.8 1.2-13 3.4-18.2 4.9-5.3 1.6-17 5.9-25.9 9.6-9 3.6-21.7 9.5-28.3 13.1s-15.6 8.8-19.9 11.6c-6.3 4.1-8.6 5.1-11.3 5.1-1.8 0-4-.5-4.8-1.2-.8-.6-1.4-2.4-1.4-4 0-2.2.8-3.4 3.8-5.9 2.1-1.8 7.4-5.3 11.7-7.8s12.8-7.2 18.9-10.4 17.6-8.4 25.5-11.7c7.9-3.2 18.7-7.2 24-8.8 5.3-1.7 14.7-4.2 21.1-5.7 6.3-1.5 17.3-3.6 24.4-4.6 10.3-1.5 16.5-2 29.8-2z\"/></g>",
        "headband-high": "<g stroke=\"#000\"><path fill=\"$[primary]\" stroke-width=\"4\" d=\"M350 280c-10 0-30-90-150-90S60 280 50 280c-10-10-10-40 0-50 0 0 30-90 150-90s150 90 150 90c10 10 10 40 0 50Z\"/><path fill=\"$[secondary]\" d=\"M45 260v-10s35-90 155-90 155 90 155 90v10c-5 0-35-90-155-90S50 260 45 260Z\"/></g>",
        "headband": "<g stroke=\"#000\"><path fill=\"$[primary]\" stroke-width=\"4\" d=\"M350 280c-10 0-30-50-150-50S60 280 50 280c-10-10-10-40 0-50 0 0 30-50 150-50s150 50 150 50c10 10 10 40 0 50Z\"/><path fill=\"$[secondary]\" d=\"M45 260v-10s35-50 155-50 155 50 155 50v10c-5 0-35-50-155-50S50 260 45 260Z\"/></g>",
        "none": ""
    },
    "body": {
        "body": "<path fill=\"$[skinColor]\" stroke=\"#000\" stroke-width=\"6\" d=\"M10 600s0-50 60-70 70-50 70-50l60-180 60 180s10 30 70 50 60 70 60 70\"/>",
        "body2": "<path fill=\"$[skinColor]\" stroke=\"#000\" stroke-width=\"6\" d=\"M10 600s-10-65 50-65c5 0 25-15 70-35l70-200 70 200c45 20 65 35 70 35 60 0 50 65 50 65\"/>",
        "body3": "<path fill=\"$[skinColor]\" stroke=\"#000\" stroke-width=\"6\" d=\"M10 600s-10-70 50-70c10 0 0-10 60-20 0 0 50-210 80-210s80 210 80 210c60 10 50 20 60 20 60 0 50 70 50 70\"/><path d=\"M71 545s46.9-3 82.1 10M329 545s-46.9-3-82.1 10m77.1-18s5.5-7.5 22-7m-271 7s-5.5-7.5-22-7\"/>",
        "body4": "<path fill=\"$[skinColor]\" stroke=\"#000\" stroke-width=\"6\" d=\"M20 600s-5-60 40-70c15 0 45-15 90-35l50-195 50 195c45 20 75 35 90 35 45 10 45 70 45 70\"/>",
        "body5": "<path fill=\"$[skinColor]\" stroke=\"#000\" stroke-width=\"6\" d=\"M5 600s-5-60 35-70c0 0 40 0 90-30l70-200 70 200c50 30 90 30 90 30 40 10 35 70 35 70\"/>"
    },
    "ear": {
        "ear1": "<path fill=\"$[skinColor]\" stroke=\"#000\" stroke-width=\"6\" d=\"M43 13S23 3 13 3 3 23 3 33s3 20 13 30 27-10 27-10z\"/>",
        "ear2": "<path fill=\"$[skinColor]\" stroke=\"#000\" stroke-width=\"6\" d=\"M40 14S10-1 5 4s0 30 5 40-5 25 30 20z\"/>",
        "ear3": "<path fill=\"$[skinColor]\" stroke=\"#000\" stroke-width=\"6\" d=\"M43 8S3-12 3 28c0 45 40 30 40 30z\"/>"
    },
    "eye": {
        "eye1": "<path d=\"M63 43s-5 10-35 10S3 43 3 43 3 3 33 3s30 40 30 40Z\" style=\"fill:#fff;stroke:#000;stroke-width:5\"/><path d=\"M33 38c-10 0-10-20 0-20s10 20 0 20Z\" style=\"fill:#000;stroke:#000;stroke-width:5\"/>",
        "eye10": "<path d=\"M259.01 349.54c-13.866-.398-24.71-6.089-24.71-19.05 10.7-18.063 40.386-18.358 51.25-.275 4.415 12.208-11.607 19.753-26.54 19.325\" style=\"fill:#fff;stroke:#000;stroke-linecap:round;stroke-linejoin:round;stroke-width:5\"/><path d=\"M259.552 325.177c-10 0-10 15 0 15s10-15 0-15\" style=\"fill:#000;stroke:#000;stroke-linecap:round;stroke-linejoin:round;stroke-width:4\"/>",
        "eye11": "<path d=\"M259.01 349.54c-13.866-.398-24.58-15.35-24.58-28.312 14.975.007 34.492.1 51.25-.275.204 12.79-11.737 29.015-26.67 28.587\" style=\"fill:#fff;stroke:#000;stroke-linecap:round;stroke-linejoin:round;stroke-width:5\"/><path d=\"M259.552 325.177c-10 0-10 15 0 15s10-15 0-15\" style=\"fill:#000;stroke:#000;stroke-linecap:round;stroke-linejoin:round;stroke-width:4\"/>",
        "eye12": "<path d=\"M5.55 33.46S17.01 4.81 39.93 4.81s28.65 28.65 28.65 28.65-5.73 11.46-28.65 11.46S5.55 33.46 5.55 33.46\" style=\"fill:#f5f3ee\"/><path d=\"M5.55 33.46C2.68 30.6 17.08 4.1 40 4.1s31.44 26.5 28.58 29.36c-2.87 2.87-5.73-17.19-28.65-17.19S8.41 36.33 5.55 33.46\" style=\"fill:#000\"/><path d=\"M39.93 38.04c-6.34 0-11.46-5.12-11.46-11.46 0-6.33 5.12-11.46 11.46-11.46s11.46 5.13 11.46 11.46c0 6.34-5.12 11.46-11.46 11.46\" style=\"fill:#000\"/>",
        "eye13": "<path d=\"M5.55 28.46S17.08 11.77 40 11.77s28.58 16.69 28.58 16.69-5.73 11.46-28.65 11.46S5.55 28.46 5.55 28.46\" style=\"fill:#f5f3ee\"/><path d=\"M5.55 28.46C2.68 25.6 17.08 9.77 40 9.77S71.44 25.6 68.58 28.46C65.71 31.33 62.92 16.27 40 16.27S8.41 31.33 5.55 28.46\" style=\"fill:#000\"/><path d=\"M39.93 33.04c-6.34 0-11.46-5.12-11.46-11.46 0-6.33 5.12-11.46 11.46-11.46s11.46 5.13 11.46 11.46c0 6.34-5.12 11.46-11.46 11.46\" style=\"fill:#000\"/>",
        "eye14": "<path d=\"M5 20s12.08-8.23 35-8.23S70 30 70 30s-7.15 9.92-30.07 9.92S5 20 5 20\" style=\"fill:#f5f3ee\"/><path d=\"M5 20c-2.87-2.87 12.2-9.55 35-11.9C70 5 72.87 27.13 70 30s-7.08-13.73-30-13.73S7.87 22.87 5 20\"/><path d=\"M39.93 33.04c-6.34 0-11.46-5.12-11.46-11.46 0-6.33 5.12-11.46 11.46-11.46s11.46 5.13 11.46 11.46c0 6.34-5.12 11.46-11.46 11.46\"/>",
        "eye15": "<path d=\"M5 35S17.08 5 40 5s30 30 30 30-7.15 7.92-30.07 7.92S5 35 5 35\" style=\"fill:#f5f3ee\"/><path d=\"M5 35.6C2.13 32.73 17.08 1.88 40 1.88S72.87 32.13 70 35 62.92 6.73 40 6.73 7.87 38.46 5 35.6\" style=\"fill:#000\"/><path d=\"M39.93 33.78c-4.53 0-8.2-3.66-8.2-8.2 0-4.53 3.67-8.19 8.2-8.19s8.19 3.66 8.19 8.19c0 4.54-3.66 8.2-8.19 8.2\" style=\"fill:#000\"/>",
        "eye16": "<path d=\"m5 35 5-15s4.24-5 19.3-5c30 0 35.7 5 35.7 5l5 15z\" style=\"fill:#f5f3ee\"/><path d=\"M37.93 33.78c-4.53 0-8.2-3.66-8.2-8.2 0-4.53 3.67-8.19 8.2-8.19s8.19 3.66 8.19 8.19c0 4.54-3.66 8.2-8.19 8.2\" style=\"fill:#000\"/><path d=\"M5 35s0-10 5-15 55 0 55 0l5 15\" style=\"fill:none;stroke:#000;stroke-width:6\"/>",
        "eye17": "<path d=\"m6.19 40.49-.83-22.07s2.27-3.87 17.09.22c29.93 8.26 42.45 4.47 42.45 4.47l6.04 11.72s-7.05.61-29.88 2.61c-22.84 2-34.87 3.05-34.87 3.05\" style=\"fill:#f5f3ee\"/><path d=\"M38.86 36.14c-4.51.39-8.55-3.74-9.03-9.25s2.83-7.08 7.34-7.48c4.52-.39 8.51.54 8.99 6.05s-2.78 10.28-7.3 10.68\" style=\"fill:#000\"/><path d=\"M6.19 40.49S2.41 12.46 9.05 15.75c10.49 5.2 55.85 7.36 55.85 7.36l6.04 11.72\" style=\"fill:none;stroke:#000;stroke-width:6\"/>",
        "eye18": "<path d=\"M10 35 5 20s15-10 30-10 35 15 35 15l-5 10z\" style=\"fill:#f5f3ee\"/><path d=\"M37.93 32.78c-4.53 0-8.2-3.66-8.2-8.2 0-4.53 3.67-8.19 8.2-8.19s8.19 3.66 8.19 8.19c0 4.54-3.66 8.2-8.19 8.2\" style=\"fill:#000\"/><path d=\"M10 35 5 20.72S25 10 35 10s35 15 35 15l-5 10\" style=\"fill:none;stroke:#000;stroke-width:6\"/>",
        "eye19": "<path d=\"M10 35 5 20s15-5 30-5 35 10 35 10l-5 10z\" style=\"fill:#f5f3ee\"/><path d=\"M37.93 32.78c-4.53 0-8.2-3.66-8.2-8.2 0-4.53 3.67-8.19 8.2-8.19s8.19 3.66 8.19 8.19c0 4.54-3.66 8.2-8.19 8.2\" style=\"fill:#000\"/><path d=\"M10 35 5 20.72S25 15 35 15s35 10 35 10l-5 10\" style=\"fill:none;stroke:#000;stroke-width:6\"/>",
        "eye2": "<path d=\"M55.37 34.72S58.4 2.3 28.53 5.07C-1.35 7.83 7.21 35.16 7.21 35.16\" style=\"fill:#fff;stroke:#000;stroke-width:5\"/><path d=\"M30.74 28.97c-3.31.3-6.22-2.12-6.53-5.43a5.985 5.985 0 0 1 5.42-6.52 5.987 5.987 0 0 1 6.53 5.42c.3 3.3-2.12 6.22-5.42 6.53Z\" style=\"fill:#000;stroke:#000;stroke-width:5\"/>",
        "eye3": "<path d=\"M265 360c-13.8 0-25-11.2-25-25s11.2-25 25-25 25 11.2 25 25-11.2 25-25 25\" style=\"fill:none;stroke:#000;stroke-width:5;stroke-linecap:round;stroke-linejoin:round\"/><path d=\"M265 360c-13.8 0-25-11.2-25-25v-5h50v5c0 13.8-11.2 25-25 25\" style=\"fill:#fff;stroke:#000;stroke-width:5;stroke-linecap:round;stroke-linejoin:round\"/><path d=\"M265 330c-10 0-10 15 0 15s10-15 0-15\" style=\"stroke:#000;stroke-width:4;stroke-linecap:round;stroke-linejoin:round\"/>",
        "eye4": "<path d=\"M68.08 23.19s1.89 14.88-27.87 18.67C15.41 45.02 6.66 15.89 6.03 10.93 25.87 8.4 65.55 3.35 68.08 23.19Z\" style=\"fill:#fff;stroke:#000;stroke-width:5\"/><path d=\"M39.04 16.81c9.92-1.27 11.81 13.61 1.89 14.88-9.92 1.26-11.81-13.62-1.89-14.88\" style=\"fill:#000;stroke:#000;stroke-linecap:round;stroke-linejoin:round;stroke-width:4\"/>",
        "eye5": "<path d=\"M73.67 39.73c3.92-10.47 2.35-25.38 2.35-25.38s-35.86-6.27-45.8-5.22c-9.95 1.04-24.34 7.59-24.34 7.59s-1.44 10.21 7.6 24.34z\" style=\"fill:#fff\"/><path d=\"M45.8 37.65c-4.13.43-8.17-5.88-9.04-14.13s1.76-15.27 5.89-15.71c4.12-.43 8.16 5.88 9.03 14.13s-1.76 15.27-5.88 15.71\" style=\"fill:#000\"/><path d=\"M73.67 39.73c4.45-5.49 2.35-25.38 2.35-25.38s-35.86-6.27-45.8-5.22c-9.95 1.04-24.34 7.59-24.34 7.59s1.57 14.92 7.6 24.34\" style=\"fill:none;stroke:#000;stroke-width:5\"/>",
        "eye6": "<path d=\"M73.63 30.14S62.25 5.74 32.3 7.42C12.33 8.54 7.9 18.8 7.9 18.8l5.83 14.7c30.23 3.31 59.9-3.36 59.9-3.36\" style=\"fill:#fff\"/><path d=\"M40.63 30.99a9.99 9.99 0 0 0 9.42-10.55 9.985 9.985 0 0 0-10.54-9.42 10 10 0 0 0-9.43 10.54c.31 5.52 5.03 9.74 10.55 9.43\" style=\"fill:#000\"/><path d=\"M73.63 30.14S72.51 10.17 32.3 7.42C12.33 8.54 7.9 18.8 7.9 18.8l5.83 14.7\" style=\"fill:none;stroke:#000;stroke-width:5\"/>",
        "eye7": "<path d=\"M74 18 69 3H4l5 15z\" style=\"fill:#fff;stroke:#000;stroke-width:5\"/><path d=\"M38.5 18a7.49 7.49 0 0 1-7.5-7.5C31 6.35 34.35 3 38.5 3S46 6.35 46 10.5 42.65 18 38.5 18Z\" style=\"fill:#000;stroke:#000;stroke-width:5\"/>",
        "eye8": "<path d=\"M67 35c0-4 6-32-24-32S3 15 3 23s12 20 24 20 40-4 40-8Z\" style=\"fill:#fff;stroke:#000;stroke-width:5\"/><path d=\"M39 29c-3.32 0-6-2.68-6-6s2.68-6 6-6 6 2.68 6 6-2.68 6-6 6Z\" style=\"fill:#000;stroke:#000;stroke-width:5\"/>",
        "eye9": "<path d=\"M240 340c0-4-6-20 24-20 20 0 36 8 36 12s-12 12-20 12c-4 0-40 0-40-4Z\" style=\"fill:#fff;stroke:#000;stroke-width:5\"/><path d=\"M268 340c-3.32 0-6-3.58-6-8s2.68-8 6-8 6 3.58 6 8-2.68 8-6 8Z\" style=\"fill:#000;stroke:#000;stroke-width:5\"/>",
        "female1": "<path d=\"M208 315.3s-5 10-35 10-25-10-25-10 0-40 30-40 30 40 30 40z\" style=\"fill:#fff;stroke:#000;stroke-width:5\"/><path d=\"M178 310.3c-10 0-10-20 0-20s10 20 0 20z\" style=\"stroke:#000;stroke-width:5\"/><path d=\"M132.4 309.7c1.5 1.3 3.5 2.7 6 4 3.5 1.8 6.7 2.6 9 3m-9-24c1.1 1.8 2.2 3.1 3 4 2.1 2.5 4 4.2 5.3 5.3 1.2 1 2.2 1.9 3 2.4\" style=\"fill:#fff;stroke:#000;stroke-width:5\"/>",
        "female10": "<path d=\"M182.8 349.5c.6-1.5 5.9-15.2-2.5-25.3-2.9-3.5-6.7-5.6-7.7-6.2-2.9-1.5-8.9-4.1-16.6-3.5-7.6.6-12.7 4-14.5 5.2-12.5 8.5-12.1 23.4-12.1 25.3\" style=\"fill:#fff;stroke:#000;stroke-width:5;stroke-miterlimit:10\"/><path d=\"M151.4 345.8c-7.5-1.1-14.9-2.2-22.4-3.3\" style=\"fill:#fff;stroke:#000;stroke-width:5;stroke-miterlimit:10\"/><ellipse cx=\"163.3\" cy=\"333.8\" rx=\"11.9\" ry=\"10.4\" style=\"stroke:#000;stroke-width:5;stroke-miterlimit:10\"/><path d=\"M113.5 322.3c6 2.8 12.1 5.7 18.1 8.5m-20.6 4.6 18.3 3m-3.4-28.4c4 4.2 7.9 8.4 11.9 12.7\" style=\"fill:#fff;stroke:#000;stroke-width:5;stroke-miterlimit:10\"/>",
        "female11": "<circle cx=\"151.3\" cy=\"330.5\" r=\"23\" style=\"fill:#fff;stroke:#000;stroke-width:5;stroke-miterlimit:10\"/><circle cx=\"151.3\" cy=\"330.5\" r=\"11\" style=\"stroke:#000;stroke-width:5;stroke-miterlimit:10\"/><path d=\"M124.3 311.5c2 1.3 4 2.7 6 4m-10 6c3 1.3 6 2.7 9 4\" style=\"stroke:#000;stroke-width:5;stroke-miterlimit:10\"/>",
        "female12": "<circle cx=\"147.5\" cy=\"279.5\" r=\"23\" style=\"fill:#fff;stroke:#000;stroke-width:5;stroke-miterlimit:10\"/><circle cx=\"147.5\" cy=\"279.5\" r=\"11\" style=\"stroke:#000;stroke-width:5;stroke-miterlimit:10\"/><path d=\"M120.5 260.5c2 1.3 4 2.7 6 4m-10 6c3 1.3 6 2.7 9 4\" style=\"stroke:#000;stroke-width:5;stroke-miterlimit:10\"/><ellipse cx=\"147.5\" cy=\"280.9\" rx=\"23\" ry=\"24.6\" style=\"stroke:#000;stroke-width:5;stroke-miterlimit:10;fill:none\"/><ellipse cx=\"147.3\" cy=\"282.2\" rx=\"23\" ry=\"25.3\" style=\"stroke:#000;stroke-width:5;stroke-miterlimit:10;fill:none\"/>",
        "female13": "<path d=\"M174.4 258.5c48.8 6.4 58.7 10.5 58.6 13-.2 5.6-50.1 15.5-57.8-4-1.4-3.5-1.1-7.2-.8-9z\" style=\"fill:#fff;stroke:#000;stroke-width:5;stroke-miterlimit:10\"/><path d=\"M161.5 256.5c4 .7 8 1.3 12 2m-11.1 12c4.1-1.1 8.2-2.1 12.4-3.2\" style=\"fill:none;stroke:#000;stroke-width:5;stroke-miterlimit:10\"/><ellipse cx=\"204.8\" cy=\"270.6\" rx=\"7\" ry=\"12.9\" style=\"stroke:#000;stroke-width:5;stroke-miterlimit:10\" transform=\"rotate(-84.215 204.838 270.578)\"/>",
        "female14": "<path d=\"M188.3 273.4c-11.7 3.2-27.1-21.7-25.1-24 1.1-1.3 6.5 5.4 18.8 8 8.6 1.8 13.2.1 14.7 2.9 1.7 3.5-2.7 11.5-8.4 13.1z\" style=\"stroke:#000;stroke-miterlimit:10\"/><path d=\"M232.9 281c.8-2.3-1.8-5.2-7.1-10.9-4.8-5.2-7.2-7.7-10-9.4-10.7-6.5-22.3-3.6-27.9-2.2-4.4 1.1-8.2 2.1-9.3 5.1-1.4 4.1 3.3 9.1 5.7 11.6 7.4 7.8 16.7 9.7 19.3 10.2 3.9.7 8 .2 16.4-.7 11.6-1.3 12.6-2.9 12.9-3.7z\" style=\"fill:#fff;stroke:#000;stroke-width:5;stroke-miterlimit:10\"/><ellipse cx=\"206\" cy=\"268.2\" rx=\"8.8\" ry=\"8.5\" style=\"stroke:#000;stroke-width:5;stroke-miterlimit:10\"/>",
        "female15": "<path d=\"M212.9 211.3c-.5 4.1-4.5 7.6-8 9.1-5.4 2.3-8-.8-18.5-1.7-11.3-.9-14.7 2.1-19.7-1.2-3.3-2.2-6.4-6.6-5.9-10.8 1-8.4 15.8-14.7 27.8-13.6 14.4 1.3 25.3 9.4 24.3 18.2z\" style=\"fill:#fff;stroke:#000;stroke-width:5;stroke-miterlimit:10\"/><path d=\"M161.5 211.5c-2.6 1.6-5.1 3.2-7.7 4.8m11.6-.2c-2.4 2.1-4.9 4.2-7.3 6.3\" style=\"fill:#fff;stroke:#000;stroke-width:5;stroke-miterlimit:10\"/><ellipse cx=\"189.6\" cy=\"205.3\" rx=\"11\" ry=\"13.9\" style=\"stroke:#000;stroke-width:5;stroke-miterlimit:10\" transform=\"rotate(-78.399 189.565 205.257)\"/>",
        "female16": "<path d=\"M209.3 209.3c-.3 2.7-2.3 16.9-10.9 20.3-1.4.6-2.9.8-17-2.9-13-3.4-14.9-4.3-16.4-6.5-3.1-4.6-2-11-.7-15.2\" style=\"fill:#fff;stroke:#000;stroke-width:5;stroke-miterlimit:10\"/><path d=\"M212 209.3c-17.3-1.7-34.5-3.4-51.8-5.1\" style=\"stroke:#000;stroke-width:5;stroke-miterlimit:10\"/><path d=\"M153.4 197c.1.7.6 3.1 2.7 5.1 2.2 2.1 4.8 2.2 5.5 2.2m-10.6 1.8c.4.8 1.7 3.5 4.7 5.1 3.2 1.7 6.1.9 6.9.7\" style=\"fill:#fff;stroke:#000;stroke-width:5;stroke-miterlimit:10\"/><path d=\"m189.8 226.1-8.3-1.3c-2.9-.5-4.9-3.2-4.4-6.1l1-6.3c.5-2.9 3.2-4.9 6.1-4.4l8.3 1.3c2.9.5 4.9 3.2 4.4 6.1l-1 6.3c-.5 2.9-3.2 4.8-6.1 4.4z\" style=\"stroke:#000;stroke-width:5;stroke-miterlimit:10\"/>",
        "female2": "<path d=\"M207.5 315.9s3-32.4-26.8-29.6c-29.9 2.8-21.3 30.1-21.3 30.1\" style=\"fill:#fff;stroke:#000;stroke-width:5\"/><path d=\"M182.9 310.2c-3.3.3-6.2-2.1-6.5-5.4s2.1-6.2 5.4-6.5 6.2 2.1 6.5 5.4-2.1 6.2-5.4 6.5z\" style=\"stroke:#000;stroke-width:5\"/><path d=\"M137.5 310.5c1 1.2 3.3 3.6 7 5 .9.3 3.5 1.2 7 1 3.2-.2 5.7-1.3 7-2m-17-21c.6 2.2 1.4 3.8 2 5 .7 1.3 1.5 2.6 3 4 .2.2 1.4 1.2 3 2 3.7 1.8 7.5 1.3 9 1\" style=\"fill:none;stroke:#000;stroke-width:5\"/>",
        "female3": "<path d=\"M265 360c-13.8 0-25-11.2-25-25s11.2-25 25-25 25 11.2 25 25-11.2 25-25 25\" style=\"fill:none;stroke:#000;stroke-width:5;stroke-linecap:round;stroke-linejoin:round\"/><path d=\"M265 360c-13.8 0-25-11.2-25-25v-5h50v5c0 13.8-11.2 25-25 25\" style=\"stroke:#000;stroke-width:5;stroke-linecap:round;stroke-linejoin:round;fill:#fff\"/><path d=\"M265 330c-10 0-10 15 0 15s10-15 0-15\" style=\"stroke:#000;stroke-width:4;stroke-linecap:round;stroke-linejoin:round\"/><path d=\"M217.7 324.9c1 1.5 3.4 4.7 7.5 6 2.7.9 5.2.6 7.1.5 2.2-.2 4.1-.7 5.4-1.1\" style=\"fill:none;stroke:#000;stroke-width:5;stroke-linecap:round;stroke-linejoin:round\"/>",
        "female4": "<path d=\"M230.8 299.3s1.9 14.9-27.9 18.7c-24.8 3.2-33.6-26-34.2-30.9 19.9-2.6 59.6-7.6 62.1 12.2z\" style=\"fill:#fff;stroke:#000;stroke-width:5\"/><path d=\"M201.8 293c9.9-1.3 11.8 13.6 1.9 14.9-9.9 1.2-11.8-13.7-1.9-14.9\" style=\"stroke:#000;stroke-width:4;stroke-linecap:round;stroke-linejoin:round\"/><path d=\"M149.5 276.5c3.9 5.5 6.9 9.9 9 13 2.2 3.2 3.1 4.7 5 7 2 2.4 4 4.3 8 8 3.7 3.5 5.6 5.2 6 5 1.4-.8-12.8-18.5-9-23 1.4-1.7 4.5-.4 12 0 7.2.4 8.6-.9 16-1 3.5-.1 8.7.1 15 1\" style=\"stroke:#000\"/>",
        "female5": "<path d=\"M232.2 315.6c3.9-10.5 2.3-25.4 2.3-25.4s-35.9-6.3-45.8-5.2c-9.9 1-24.3 7.6-24.3 7.6s-1.4 10.2 7.6 24.3z\" style=\"fill:#fff\"/><path d=\"M204.4 313.5c-4.1.4-8.2-5.9-9-14.1-.9-8.2 1.8-15.3 5.9-15.7s8.2 5.9 9 14.1c.8 8.3-1.8 15.3-5.9 15.7\"/><path d=\"M232.2 315.6c4.4-5.5 2.3-25.4 2.3-25.4s-35.9-6.3-45.8-5.2c-9.9 1-24.3 7.6-24.3 7.6s1.6 14.9 7.6 24.3\" style=\"fill:none;stroke:#000;stroke-width:5\"/><path d=\"M140.5 287.5c2.1 1.5 5.8 3.8 11 5 5.7 1.3 10.4.6 13 0m3 13c-2 .8-5.1 1.8-9 2-.9 0-4.5.2-9-1-3.9-1-6.9-2.6-9-4\" style=\"fill:none;stroke:#000;stroke-width:5;stroke-miterlimit:10\"/>",
        "female6": "<path d=\"M232.6 309.6s-11.4-24.4-41.3-22.7c-20 1.1-24.4 11.4-24.4 11.4l5.8 14.7c30.3 3.3 59.9-3.4 59.9-3.4\" style=\"fill:#fff\"/><path d=\"M199.6 310.5c5.5-.3 9.7-5 9.4-10.5s-5-9.7-10.5-9.4-9.7 5-9.4 10.5 5 9.7 10.5 9.4\"/><path d=\"M232.6 309.6s-1.1-20-41.3-22.7c-20 1.1-24.4 11.4-24.4 11.4l5.8 14.7\" style=\"fill:none;stroke:#000;stroke-width:5\"/><path d=\"M151.5 289.5c.2.7 1.3 5.4 6 8 4.1 2.3 8.2 1.2 9 1m-17 6c.8.9 3.8 4.2 9 5 5.1.8 9-1.4 10-2\" style=\"fill:none;stroke:#000;stroke-width:5;stroke-miterlimit:10\"/>",
        "female7": "<path d=\"M229.6 340.2c-1.5-15-9.7-27.1-21.2-30.9-8.4-2.8-15.9-.4-19.1.7-20.3 6.8-26.8 30.1-27.6 33\" style=\"fill:#fff;stroke:#000;stroke-width:5;stroke-miterlimit:10\"/><path d=\"M151 321.9c5.4 2.6 10.9 5.1 16.3 7.7m-19.8 2.9c5.2 1.9 10.4 3.7 15.6 5.6\" style=\"stroke:#000;stroke-width:5;stroke-miterlimit:10;fill:none\"/><ellipse cx=\"202\" cy=\"325.6\" rx=\"18.2\" ry=\"14.9\" style=\"stroke:#000;stroke-width:5;stroke-miterlimit:10\"/><path d=\"M160.9 342.1c23.4-.9 46.7-1.9 70.1-2.8\" style=\"fill:#fff;stroke:#000;stroke-width:5;stroke-miterlimit:10\"/>",
        "female8": "<path d=\"M230 309.5c-.6-1.7-5.3-16-19.2-21-7.9-2.8-17.7-2.3-24.6 3-4.6 3.5-8.2 9-8.2 9-1.7 2.5-2.5 4.4-3.2 5.8 0 0-.2.2-2.3 3.2\" style=\"fill:#fff;stroke:#000;stroke-width:5;stroke-miterlimit:10\"/><ellipse cx=\"204.9\" cy=\"300\" rx=\"9.6\" ry=\"10.5\" style=\"stroke:#000;stroke-width:5;stroke-miterlimit:10\"/><path d=\"M162 300c.2.9 1.6 6.4 5.7 8.8 2.5 1.4 4.7 1.1 5.7.8\" style=\"fill:none;stroke:#000;stroke-width:5;stroke-miterlimit:10\"/>",
        "female9": "<path d=\"M224 379.5c-.9-2.3-2.7-6-6.2-9-4.3-3.8-8.6-4.4-13.2-5-11.9-1.6-21.1 2.7-23.8 4-5.4 2.7-9.4 6.1-12.3 9\" style=\"fill:none;stroke:#000;stroke-width:5;stroke-miterlimit:10\"/><ellipse cx=\"200.2\" cy=\"379.5\" rx=\"11.5\" ry=\"13\" style=\"stroke:#000;stroke-width:5;stroke-miterlimit:10\"/><path d=\"M161.5 368.5c2.7 2.3 5.3 4.7 8 7m0-15c3 3.3 6 6.7 9 10\" style=\"stroke:#000;stroke-width:5;stroke-miterlimit:10\"/>"
    },
    "eyeLine": {
        "line1": "<path fill=\"none\" stroke=\"#000\" stroke-width=\"2\" d=\"M220 270s-10 0-10-20m-30 20s10 0 10-20\"/>",
        "line2": "<path fill=\"none\" stroke=\"#000\" stroke-width=\"2\" d=\"M300 320s5 5 10 5m-13.25-2.47S300 335 305 335m-205-15s-5 5-10 5m13.25-2.47S100 335 95 335\"/>",
        "line3": "<path fill=\"none\" stroke=\"#000\" stroke-width=\"2\" d=\"M240 340s10 10 25 10m-105-10s-10 10-25 10\"/>",
        "line4": "<path fill=\"none\" stroke=\"#000\" stroke-width=\"2\" d=\"M240 340s25 10 40 0m-120 0s-25 10-40 0\"/>",
        "line5": "<path fill=\"none\" stroke=\"#000\" stroke-width=\"2\" d=\"M240 355s20-10 45 0m-125 0s-20-10-45 0\"/>",
        "line6": "<path fill=\"none\" stroke=\"#000\" stroke-width=\"2\" d=\"M235 285s10-10 45-10m-115 10s-10-10-45-10\"/>",
        "none": ""
    },
    "eyebrow": {
        "eyebrow1": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M83 13C83 3 73 3 73 3 48-2 17.46 8.36 3 18c40-5 50 5 75 5 0 0 5 0 5-10Z\"/>",
        "eyebrow10": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M71 17c8-8 0-12 0-12S43 9 35 9C25 9 7 1 7 1S-5 5 7 17c8 8 8 8 28 8s33-5 36-8Z\"/>",
        "eyebrow11": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M73 13c8-8 0-12 0-12S45 5 37 5H1s20 12 40 12c12 0 28 0 32-4Z\"/>",
        "eyebrow12": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M66 13c4-4 0-8 0-8H30C14 5 2 1 2 1s-4 0 8 12l-4 8h32c20 0 24-4 28-8Z\"/>",
        "eyebrow13": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M72.888 12.598c5.271-4.016 2.566-8.267 2.566-8.267-1.018-.86-27.007.663-35.814.759-9.087.098-35.151 9.7-38.194 12.84-.01 2.629 27.698-1.318 40.149-1.733 9.802-.326 26.406.125 31.293-3.6z\"/>",
        "eyebrow14": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M12.93 8.33C11.42 9.56 8.75 12.57 6.99 15s-3.38 5.16-3.61 6.06c-.22.91-.16 1.77.13 1.92.3.14 4.44-.51 9.21-1.46s11.58-1.96 15.13-2.23c3.55-.28 11.63-.52 17.94-.53 6.32-.02 14.56.22 18.32.53 3.75.31 8.39.47 10.29.36 1.91-.11 4.56-.5 5.89-.87 2.09-.59 2.33-.97 1.84-2.91-.42-1.66-1.74-2.85-5.18-4.66-2.54-1.34-7.86-3.18-11.83-4.09-3.97-.92-10.99-2.21-15.6-2.87-4.62-.66-11.91-1.33-16.22-1.49-6.13-.21-8.91.12-12.73 1.52-2.69.99-6.13 2.81-7.64 4.05Z\"/>",
        "eyebrow15": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M12.93 15.05c-1.51.67-4.18 2.29-5.94 3.61s-3.38 2.8-3.61 3.29c-.22.49-.16.96.13 1.04.3.08 4.44-.28 9.21-.79 4.77-.52 11.58-1.06 15.13-1.21s11.63-.28 17.94-.29c6.32-.01 14.56.12 18.32.29 3.75.17 8.39.25 10.29.19 1.91-.05 4.56-.27 5.89-.47 2.09-.32 2.33-.53 1.84-1.57-.42-.91-1.74-1.55-5.18-2.53-2.54-.73-7.86-1.72-11.83-2.22-3.97-.49-10.99-1.19-15.6-1.55-4.62-.36-11.91-.72-16.22-.81-6.13-.11-8.91.06-12.73.83-2.69.53-6.13 1.52-7.64 2.19Z\"/>",
        "eyebrow16": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M25.63 10.05c-1.19.67-3.29 2.29-4.68 3.61s-2.66 2.8-2.84 3.29-.13.96.1 1.04 3.5-.28 7.26-.79c3.76-.52 9.13-1.06 11.92-1.21 2.8-.15 9.17-.28 14.14-.29 4.98-.01 11.48.12 14.44.29s6.61.25 8.12.19c1.5-.05 3.59-.27 4.63-.47 1.65-.32 1.85-.53 1.46-1.57-.33-.91-1.38-1.55-4.09-2.53-2-.73-6.19-1.72-9.32-2.22-3.13-.49-8.67-1.19-12.3-1.55-3.64-.36-9.39-.72-12.78-.81-4.83-.11-7.02.06-10.04.83-2.12.53-4.83 1.52-6.02 2.19Z\"/><path d=\"M0 10h5v5H0z\" style=\"fill:none\"/>",
        "eyebrow17": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M22.1 6.48c-.96.74-2.71 2.33-3.9 3.5-1.23 1.17-2.47 2.63-2.7 3.13-.23.52-.26.96-.05.96.2 0 3.06-1.05 6.01-1.65 2.72-.11 6.42.27 8.3.66 1.87.43 6.07 1.67 9.35 2.77 3.39 1.08 7.94 2.5 10.06 3.19 2.23.61 5.3 1.02 6.7.99 1.43-.06 3.53-.35 4.62-.61 1.68-.41 1.9-.62 1.72-1.65-.12-.91-.85-1.63-2.76-2.9-1.36-1-4.3-2.66-6.56-3.72-2.26-1.13-6.33-3.1-9.03-4.35-2.71-1.31-7.02-3.02-9.57-3.73-3.6-.81-5.24-.65-7.53.51-1.61.77-3.71 2.09-4.66 2.9Z\"/><path d=\"M0 10h5v5H0z\" style=\"fill:none\"/>",
        "eyebrow18": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M79 12.9c0-6.11-7.5-6.11-7.5-6.11-18.75-3.05-41.65 3.28-52.5 9.16C49 12.9 56.5 19 75.25 19c0 0 3.75 0 3.75-6.1Z\"/><path d=\"M0 10h5v5H0z\" style=\"fill:none\"/>",
        "eyebrow19": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M76.4 16.1c2.85-2.24-.05-6.36-.05-6.36s-16.86.54-26.27-.02c-9.49-.6-35.33-.86-35.33-.86s-2.2 6.65.57 7.62c2.68.61 24.54-1.45 34.09-.89 9.6.59 24.04 2.16 26.99.51Z\"/><path d=\"M0 10h5v5H0z\" style=\"fill:none\"/>",
        "eyebrow2": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"m235 280 65 5-5-12.45-55 2.45z\"/>",
        "eyebrow20": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M74.17 18.39c5.31-3.87-1.66-7.27-1.66-7.27s-20.66-2.78-26.56-3.1c-7.56-.72-22.76-1.1-22.76-1.1S10.98 10 18.3 16.95c10.59 2.96 14.71-1.32 31.19-.91 16.85.28 21.74 4.37 24.68 2.35Z\"/><path d=\"M0 10h5v5H0z\" style=\"fill:none\"/>",
        "eyebrow3": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M73 13c4.85-1.21 0-10-10-10S3 8 3 8s50 10 70 5Z\"/>",
        "eyebrow4": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M61 16V6L31 1 1 6v10l30-5z\"/>",
        "eyebrow5": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M65 16c3-3 0-10 0-10S45 1 35 1 3 11 3 11s-3 7 0 10 22-8 32-8 27 6 30 3Z\"/>",
        "eyebrow6": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M67 17c3-3 0-12 0-12H39C29 5 3 1 3 1S0 14 3 17s26 0 36 0 25 3 28 0Z\"/>",
        "eyebrow7": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M71 21c8-8 0-12 0-12S43 5 35 5C25 5 7 1 7 1S-5 5 7 17c16 4 8 0 28 0 32 0 33 7 36 4Z\"/>",
        "eyebrow8": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M71 25c8-8 0-16 0-16S43 1 35 1C25 1 7 5 7 5s-12 8 0 20c16 8 16-4 36-4s24 8 28 4Z\"/>",
        "eyebrow9": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M73 21c8-8 0-16 0-16S45 1 37 1C27 1 1 17 1 17s20-4 40-4c12 0 28 12 32 8Z\"/>",
        "female1": "<path d=\"M100.82 273.11c15.6-15.4 34-18 53-7 7.7 4.5 14.7 10 22 15v1c-1.8-.3-3.8-.2-5.4-.9a103.37 103.37 0 0 0-59.3-8.2c-1.6.3-3.1 1.3-4.7 1.4a36 36 0 0 1-5.6-.3Zm7.1-2.8c18.8-3.4 36.2-1.1 53.9 4-17.1-15-37.6-16.6-53.9-4\"/><path fill=\"$[hairColor]\" d=\"M107.92 270.31c16.3-12.6 36.9-11 53.9 4-17.82-5.1-35.1-7.4-53.9-4\"/>",
        "female10": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M154.4 146.6c-.2-1.7-.3-2.7 0-3.4.8-2.2 5.8-2 9.2-2 4.6 0 8.9-.3 15.1 0 10 .4 19.5.5 22.3 3.4 2.6 2.7 2.6 5.5 2.6 5.5s.2.6 1.3 4.8c-1.2.1-3.1.1-5.3 0-4.2-.3-6.5-1.1-10.5-2-6-1.4-10.8-1.9-13.1-2-10.1-.7-15.1-1-17.1-.7-.7.1-2.9.5-3.9-.7-.3-.7-.4-1.5-.6-2.9zm-4.6-2.1c.3.3.2.7.4 1.8.1 1.2.2 1.3.3 1.6.4 2.1.7 2.3.7 2.7-.3 1.4-3.7 1.2-6.6 2-6.1 1.7-8.3 7.4-9.2 6.8-.8-.5.8-6.5 5.3-10.9 3-2.9 7.6-5.3 9.1-4z\"/>",
        "female2": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M99.84 276.69c1.33-1.3 2.43-3.09 4-3.82 6.19-2.85 12.34-6 18.85-7.88a131 131 0 0 1 44.31-4.81c1 .06 2.22-.09 2.87.43 2 1.63 3.78 3.54 5.64 5.34-2.08.92-4.11 2.45-6.26 2.65-15.64 1.42-31.34 2.27-46.95 4-6.09.67-12 3.12-18 4.73-1.15.31-2.31.54-3.47.8Z\"/>",
        "female3": "<path d=\"M169.63 281.29c-16.3-9.2-34.2-9.9-52.2-9.6-4 .1-7.9.6-11.9.8-1.3.1-2.7-.5-4-.7-.1-.5-.3-1.1-.4-1.6 3.4-1.7 6.7-4.3 10.2-4.9a148.2 148.2 0 0 1 50.6-.5 17.75 17.75 0 0 1 7.2 3.1c8.2 5.3 8.3 6.7 1.4 13.5a2.5 2.5 0 0 0-.9-.1m1.1-4.8c.2-.7.3-1.3.5-2-7.8-7.1-17.6-5.8-27-6 4.6 1.4 9.3 2.1 13.8 3.4 4.3 1.2 8.5 3.11 12.7 4.6\"/><path fill=\"$[hairColor]\" d=\"M170.73 276.49c-4.2-1.6-8.4-3.4-12.7-4.6-4.6-1.3-9.3-2-13.8-3.4 9.4.2 19.2-1.1 27 6a15 15 0 0 1-.5 2\"/>",
        "female4": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M212.2 211.3c0 2-1.6 3.4-2.9 4.5-3.1 2.8-6.5 2.4-7.4 2.3-3.9-.5-6.5-3.5-7.4-4.5-3.1-3.6-2.8-6.3-5.7-8.3-2.7-1.9-5.1-.9-5.1-1.5-.1-1 5.9-3.9 12.5-3 3.3.5 5.6 1.7 8 3 3.7 1.9 8 4.3 8 7.5z\"/><path d=\"M152.2 200.6c-.5.3-1.4 1-2 2-.8 1.3-1 2.6-1 3.2\"/>",
        "female5": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M229 193.1c.3 3.1.3 7.8-2.1 9.9-2.6 2.2-6.8.1-8.6-.8-1.3-.6-24.5-11.6-37.9-8.1-11.7 3-17.2 17.3-17.8 16.7-.4-.4 2-5.1 14.4-24.7m0-.1c17.4 2.4 34.7 4.7 52.1 7.1\"/>",
        "female6": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M178.5 145.6c6.5.4 6.1 3.9 15 5.9 4.3.9 10.2.6 22 0 3.2-.2 5.5-.4 8-1 1.6-.4 2.2-.7 4-1 3-.5 3.8-.2 4.3-1 1-1.5-1-4.8-1.8-5.8-.7-1-1.8-1.7-3.6-2.2-6.8-1.7-24.9.9-34.4.7-6.3-.1-7.8-1.8-10.6-2.2 0 0-1.4-.2-3.1.1-5.6.8-19.8 12.2-19 13.7.8 1.2 8.2-7.8 19.2-7.2z\"/>",
        "female7": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M231.4 124.3c1.5 1.9-.6 5.3-.9 5.9-.9 1.4-2 2.4-2.8 2.9-6.5.1-11.4-.7-14.8-1.5-1-.2-3.8-.9-9.2-2.2-9.9-2.4-11.2-2.8-13.9-2.9-1.3-.1-5.3-.2-10.2.7-7.1 1.4-11.7 4.4-13.9 5.9-6.1 4.1-7.7 7.6-8.3 7.4-1.2-.5 3.3-13.3 15.7-22.1 3.9-2.8 8-4.7 8.3-4.4s-2.6 2.4-5.5 6.6c-1.7 2.4-2 2.8-1.8 2.9.8.6 6.9-6.4 15.7-6.6.8 0 2.4.2 5.5.7 4.2.7 6.9 1.3 11.1 2.2 8.5 1.9 12.8 2.8 13.9 2.9 6.8.9 9.8-.1 11.1 1.6z\"/>",
        "female8": "<path d=\"M228.6 172.3c1.9 0 1.9-3 0-3-2 0-2 3 0 3m-7.1-5.9c-.1 0-.2 0-.3-.1q-.3-.15-.6 0c-.2 0-.4.1-.6.2s-.3.2-.4.4c-.1.1-.2.3-.3.5 0 .1 0 .3-.1.4 0 .3.1.5.2.8.1.1.2.2.2.3.2.2.4.3.7.4.1 0 .2 0 .3.1q.3.15.6 0c.2 0 .4-.1.6-.2s.3-.2.4-.4c.1-.1.2-.3.3-.5 0-.1 0-.3.1-.4 0-.3-.1-.5-.2-.8-.1-.1-.2-.2-.2-.3-.2-.2-.4-.3-.7-.4m-11.9-.3c1.9 0 1.9-3 0-3-2 0-2 3 0 3m-13.5-1.9c1.9 0 1.9-3 0-3s-1.9 3 0 3m-13.4 1.3c0 .1 0 .2-.1.3q-.15.3 0 .6c0 .2.1.4.2.6s.2.3.4.4c.1.1.3.2.5.3.1 0 .3 0 .4.1.3 0 .5-.1.8-.2.1-.1.2-.2.3-.2.2-.2.3-.4.4-.7 0-.1 0-.2.1-.3q.15-.3 0-.6c0-.2-.1-.4-.2-.6s-.2-.3-.4-.4c-.1-.1-.3-.2-.5-.3-.1 0-.3 0-.4-.1-.3 0-.5.1-.8.2-.1.1-.2.2-.3.2-.2.3-.3.5-.4.7m-7.4 2.7c-.1 0-.2 0-.3-.1q-.3-.15-.6 0c-.2 0-.4.1-.6.2s-.3.2-.4.4c-.1.1-.2.3-.3.5 0 .1 0 .3-.1.4 0 .3.1.5.2.8.1.1.2.2.2.3.2.2.4.3.7.4.1 0 .2 0 .3.1q.3.15.6 0c.2 0 .4-.1.6-.2s.3-.2.4-.4c.1-.1.2-.3.3-.5 0-.1 0-.3.1-.4 0-.3-.1-.5-.2-.8-.1-.1-.2-.2-.2-.3-.2-.2-.4-.4-.7-.4m-8.7 7.4c1.9 0 1.9-3 0-3s-1.9 3 0 3\"/>",
        "female9": "<path stroke=\"#000\" d=\"M219.5 190.5c-2.4-6.4-6.1-10.2-8.2-12 0 0-10-8.8-25.1-7.4-1.4.1-2.8.4-2.8.4s-5.2 1-9.9 4c-7.7 4.8-11.4 13.6-12 15\"/>"
    },
    "facialHair": {
        "beard-point": "<path fill=\"$[hairColor]\" fill-rule=\"evenodd\" stroke=\"#000\" d=\"M200 410c55 0 55 15 55 30 70 0 85-35 85-140h10c0 130-13.03 137.37-30 160-30 40-110 120-120 120s-90-80-120-120c-16.97-22.63-30-30-30-160h10c0 105 15 140 85 140 0-15 0-30 55-30Zm-45 30c0 20 5 30 25 30 10 0 10-10 20-10s10 10 20 10c20 0 25-10 25-30s-15-20-45-20-45 0-45 20Z\"/>",
        "beard1": "<path fill=\"$[hairColor]\" fill-rule=\"evenodd\" stroke=\"#000\" d=\"M200 410c45 0 50 10 50 10 30 0 90-15 90-120h10c0 130-30 150-40 160s-60 60-110 60-100-50-110-60-40-30-40-160h10c0 105 60 120 90 120 0 0 5-10 50-10Zm-45 30c0 20 5 30 25 30 10 0 10-10 20-10s10 10 20 10c20 0 25-10 25-30s-15-20-45-20-45 0-45 20Z\"/>",
        "beard2": "<path fill=\"$[hairColor]\" fill-rule=\"evenodd\" stroke=\"#000\" d=\"M200 410c55 0 55 15 55 30 70 0 85-35 85-140h10c0 130-30 150-40 160s-60 60-110 60-100-50-110-60-40-30-40-160h10c0 105 15 140 85 140 0-15 0-30 55-30Zm-45 30c0 20 5 30 25 30 10 0 10-10 20-10s10 10 20 10c20 0 25-10 25-30s-15-20-45-20-45 0-45 20Z\"/>",
        "beard3": "<path fill=\"$[hairColor]\" fill-rule=\"evenodd\" stroke=\"#000\" d=\"M200 410c55 0 55 15 55 30 70 0 85-35 85-140h10c0 85.955-6.62 123.276-13.03 142.306-3.286 9.75-6.333 14.677-7.138 19.4-1.068 6.257-8.838 9.629-10.958 17.543-3.017 11.263-8.556 10.735-10.665 17.834-2.637 8.883-7.952 7.494-9.426 12.682-2.075 7.307-10.412 7.821-13.197 13.6-3.548 7.362-10.63 5.887-14.533 10.156-6.3 6.892-15.088 3.937-20.9 8.56-4.793 3.812-10.78 1.493-15.71 3.422-10.582 4.14-20.605 2.066-30.024 2.066-8.633 0-19.018 1.295-28.214-1.692-5.696-1.85-12.198 1.078-17.972-3.64-5.88-4.804-15.908-.87-21.481-8.598-3.316-4.597-11.258-2.689-14.29-9.82-2.193-5.155-10.92-4.418-12.121-12.146-1.034-6.647-11.694-8.405-13.307-15.405-1.694-7.352-10.13-11.094-11.95-17.176-3.054-10.198-8.921-11.446-9.594-18.569-.468-4.949-5.392-10.959-9.558-21.057C58.247 420.836 50 384.304 50 300h10c0 105 15 140 85 140 0-15 0-30 55-30zm-45 30c0 20 5 30 25 30 10 0 9.702-5.833 19.702-5.833S210 470 220 470c20 0 25-10 25-30s-15-20-45-20-45 0-45 20z\"/>",
        "beard4": "<path fill=\"$[hairColor]\" fill-rule=\"evenodd\" stroke=\"#000\" d=\"M200 410c55 0 55 15 55 40 0 0 30 0 45-20 0 60-35 70-45 75s-40 10-55 10-45-5-55-10-45-15-45-75c15 20 45 20 45 20 0-25 0-40 55-40Zm-45 30c0 20 5 30 25 30 10 0 0-20 20-20s10 20 20 20c20 0 25-10 25-30s-15-20-45-20-45 0-45 20Z\"/>",
        "beard5": "<path fill=\"$[hairColor]\" fill-rule=\"evenodd\" stroke=\"#000\" d=\"M60 300H50s-10 70 10 130c10 20 30 55 90 55 10-10 0-45-10-55s-30 0-60-30c-20-20-20-70-20-100Zm261 100c-30 30-50 20-60 30s-20 45-10 55c60 0 80-35 90-55 20-60 10-130 10-130h-10c0 30 0 80-20 100Z\"/><path fill=\"$[hairColor]\" fill-rule=\"evenodd\" stroke=\"#000\" d=\"M200 405c55 0 65 20 65 35s1.12 46.94-15 55c-10 5-20 5-30 25v30l-5 10-5-10-5 15s-4.86-9.65-5-9.99c-.02.34-5 9.99-5 9.99s-5-15.32-5-15-5 10-5 10l-5-10v-30c-10-20-20-20-30-25-16.12-8.06-15-40-15-55s10-35 65-35Zm0 150.01V555zM150 440c5 20 10 30 30 30 10 0 10-15 20-15s10 15 20 15c20 0 25-10 30-30 4.85-19.4-20-20-50-20s-54.85.6-50 20Z\"/><path fill=\"$[primary]\" stroke=\"#000\" d=\"M180 520h40v20h-40z\"/>",
        "beard6": "<path fill=\"$[hairColor]\" fill-rule=\"evenodd\" stroke=\"#000\" d=\"M60 300H50s-10 70 10 130c10 20 30 55 90 55 10-10 0-45-10-55s-30 0-60-30c-20-20-20-70-20-100Zm261 100c-30 30-50 20-60 30s-20 45-10 55c60 0 80-35 90-55 20-60 10-130 10-130h-10c0 30 0 80-20 100Z\"/><path fill=\"$[hairColor]\" fill-rule=\"evenodd\" stroke=\"#000\" d=\"M200 405c55 0 65 20 65 35s0 40-10 55c-5 10-5 15-5 15v30l-5 10-5-10-5 10-5-10v-30h-15v30l-5 10-5-10-5 15-5-15-5 10-5-10v-30h-15v30l-5 10-5-10-5 10-5-10v-30s0-5-5-15c-8.06-16.12-10-40-10-55s10-35 65-35Zm-50 35c5 20 10 30 30 30 10 0 10-15 20-15s10 15 20 15c20 0 25-10 30-30 4.85-19.4-20-20-50-20s-54.85.6-50 20Z\"/><path fill=\"$[primary]\" stroke=\"#000\" d=\"M150 510h20v20h-20zm35 0h30v20h-30zm45 0h20v20h-20z\"/>",
        "chin-strap": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M341.86 329.762c-18.78 98.415-39.492 102.786-40.731 106.121-16.86 17.717-52.855 38.72-62.486 41.411-18.05 5.044-27.166 6.53-27.222 4.596-.084-2.842 0-14.947 0-14.947s-7.232-.02-11.188 0c-3.985.02-11.47 0-11.47 0s.03 11.263 0 14.947c-.022 2.551-15.622-.996-29.079-4.596-9.66-2.585-48.654-24.496-61.946-42.674-2.083-2.473-22.699-13.454-39.524-104.858h-10c6.25 93.092 30.023 116.409 32.351 120.951 0 0 44.861 57.484 119.668 57.548 75 .065 117.788-57.548 117.788-57.548 2.596-5.716 23.22-21.704 33.84-120.951z\"/>",
        "chin-strapStache": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M341.86 329.762c-18.78 98.415-39.492 102.786-40.731 106.121-16.86 17.717-52.855 38.72-62.486 41.411-18.05 5.044-27.166 6.53-27.222 4.596-.084-2.842 0-14.947 0-14.947s-7.232-.02-11.188 0c-3.985.02-11.47 0-11.47 0s.03 11.263 0 14.947c-.022 2.551-15.622-.996-29.079-4.596-9.66-2.585-48.654-24.496-61.946-42.674-2.083-2.473-22.699-13.454-39.524-104.858h-10c6.25 93.092 30.023 116.409 32.351 120.951 0 0 44.861 57.484 119.668 57.548 75 .065 117.788-57.548 117.788-57.548 2.596-5.716 23.22-21.704 33.84-120.951z\"/><path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M150 425c-5-5 25-20 35-20 5 0 10 5 15 5s10-5 15-5c10 0 40 15 35 20s-5-5-50-5-45 10-50 5Z\"/>",
        "fullgoatee": "<path fill=\"$[hairColor]\" fill-rule=\"evenodd\" stroke=\"#000\" d=\"M200 410c55 0 55 15 55 30 0 0 5 40-5 55-5 5-35 15-50 15s-46.67-10-50-15c-10-15-5-55-5-55 0-15 0-30 55-30Zm-45 30c0 20 5 30 25 30 10 0 10-10 20-10s10 10 20 10c20 0 25-10 25-30s-15-20-45-20-45 0-45 20Z\"/>",
        "fullgoatee2": "<path fill=\"$[hairColor]\" fill-rule=\"evenodd\" stroke=\"#000\" d=\"M200 405c55 0 65 20 65 35s-5 40-15 55c-5 5-35 15-50 15s-46.67-10-50-15c-10-15-15-40-15-55s10-35 65-35Zm-50 35c5 20 10 30 30 30 10 0 10-15 20-15s10 15 20 15c20 0 25-10 30-30 4.85-19.4-20-20-50-20s-54.85.6-50 20Z\"/>",
        "fullgoatee3": "<path fill=\"$[hairColor]\" fill-rule=\"evenodd\" stroke=\"#000\" d=\"M200 405c55 0 75 20 75 35s-15 40-25 55c-5 5-35 15-50 15s-46.67-10-50-15c-10-15-25-40-25-55s20-35 75-35Zm-55 35c5 20 15 30 35 30 10 0 10-15 20-15s10 15 20 15c20 0 30-10 35-30 4.85-19.4-25-20-55-20s-59.85.6-55 20Z\"/>",
        "fullgoatee4": "<path fill=\"$[hairColor]\" fill-rule=\"evenodd\" stroke=\"#000\" d=\"M200 405c55 0 65 20 65 35s1.12 46.94-15 55c-10 5-30 15-50 45-20-30-40-40-50-45-16.12-8.06-15-40-15-55s10-35 65-35Zm-50 35c5 20 10 30 30 30 10 0 10-15 20-15s10 15 20 15c20 0 25-10 30-30 4.85-19.4-20-20-50-20s-54.85.6-50 20Z\"/>",
        "fullgoatee5": "<path fill=\"$[hairColor]\" fill-rule=\"evenodd\" stroke=\"#000\" d=\"M200 405c55 0 65 20 65 35s1.12 46.94-15 55c-10 5-20 5-30 25v30l-5 10-5-10-5 15s-4.86-9.65-5-9.99c-.02.34-5 9.99-5 9.99s-5-15.32-5-15-5 10-5 10l-5-10v-30c-10-20-20-20-30-25-16.12-8.06-15-40-15-55s10-35 65-35Zm0 150.01V555zM150 440c5 20 10 30 30 30 10 0 10-15 20-15s10 15 20 15c20 0 25-10 30-30 4.85-19.4-20-20-50-20s-54.85.6-50 20Z\"/><path fill=\"$[primary]\" stroke=\"#000\" d=\"M180 520h40v20h-40z\"/>",
        "fullgoatee6": "<path fill=\"$[hairColor]\" fill-rule=\"evenodd\" stroke=\"#000\" d=\"M200 405c55 0 65 20 65 35s0 40-10 55c-5 10-5 15-5 15v30l-5 10-5-10-5 10-5-10v-30h-15v30l-5 10-5-10-5 15-5-15-5 10-5-10v-30h-15v30l-5 10-5-10-5 10-5-10v-30s0-5-5-15c-8.06-16.12-10-40-10-55s10-35 65-35Zm-50 35c5 20 10 30 30 30 10 0 10-15 20-15s10 15 20 15c20 0 25-10 30-30 4.85-19.4-20-20-50-20s-54.85.6-50 20Z\"/><path fill=\"$[primary]\" stroke=\"#000\" d=\"M150 510h20v20h-20zm35 0h30v20h-30zm45 0h20v20h-20z\"/>",
        "goatee-thin-stache": "<path stroke=\"#000\" stroke-width=\"3\" d=\"m205.17 408-.17 12m10-15v16.28m10-13.26V420m10-10v11.28M194.83 408l.17 12m-10-15v16.28m-10-13.26V420m-10-10v11.53m0 48.47v25m10-30v35m10-40v40m10-40v40m10 0v-40m10 0v40m10-35v35m10-30v25\"/>",
        "goatee-thin": "<path stroke=\"#000\" stroke-width=\"3\" d=\"M165 470v25m10-30v35m10-40v40m10-40v40m10 0v-40m10 0v40m10-35v35m10-30v25\"/>",
        "goatee1-stache": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"m200 457.82 10 2.18s0 20 10 20 30-5 30 0c0 20-30 30-50 30s-50-10-50-30c0-5 20 0 30 0s10-20 10-20zM150 425c-5-5 25-20 35-20 5 0 10 5 15 5s10-5 15-5c10 0 40 15 35 20s-5-5-50-5-45 10-50 5Z\"/>",
        "goatee1": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"m200 457.82 10 2.18s0 20 10 20 30-5 30 0c0 20-30 30-50 30s-50-10-50-30c0-5 20 0 30 0s10-20 10-20z\"/>",
        "goatee10": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M188 454c2-4 22-4 24 0 4.12 8.25-12 21-12 21s-16.12-12.75-12-21Zm62 31c-10 15-23.68 21.84-30 25-10 5-20 15-20 15s-10-10-20-15c-6.32-3.16-20-10-30-25 5-5 10 10 40 10 5 0 5-15 10-15s5 15 10 15c30 0 35-15 40-10Z\"/>",
        "goatee11": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M188 454c2-4 22-4 24 0 4.12 8.25-12 21-12 21s-16.12-12.75-12-21Zm62 31c-10 15-23.68 21.84-30 25-10 5-20 15-20 15s-10-10-20-15c-6.32-3.16-20-10-30-25 5-5 10 10 40 10 5 0 5-15 10-15s5 15 10 15c30 0 35-15 40-10Zm-100-60c-5-5 25-20 35-20 5 0 10 5 15 5s10-5 15-5c10 0 40 15 35 20s-5-5-50-5-45 10-50 5Z\"/>",
        "goatee12": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M200 458.02 190 460c-10 10-20 40-20 40s10 10 30 10 30-10 30-10-10-30-20-40zM150 425c-5-5 25-20 35-20 5 0 10 5 15 5s10-5 15-5c10 0 40 15 35 20s-5-5-50-5-45 10-50 5Z\"/>",
        "goatee15": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M175 485s10-5 25-5 25 5 25 5c-15 30-15 45-15 45l-5-10-5 20-5-20-5 10s0-15-15-45Zm-25-60c-5-5 25-20 35-20 5 0 10 5 15 5s10-5 15-5c10 0 40 15 35 20s-5-5-50-5-45 10-50 5Z\"/>",
        "goatee16": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M175 485s10-5 25-5 25 5 25 5c-15 30-15 45-15 45l-5-10-5 20-5-20-5 10s0-15-15-45Zm-25-60c-5-5 25-20 35-20 5 0 10 5 15 5s10-5 15-5c10 0 40 15 35 20s-5-5-50-5-45 10-50 5Zm38 33c2-2 22-2 24 0s-8 16-12 16-14-14-12-16Z\"/>",
        "goatee17": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M175 485s10-5 25-5 25 5 25 5c-15 30-15 45-15 45l-5-10-5 20-5-20-5 10s0-15-15-45Zm13-27c2-2 22-2 24 0s-8 16-12 16-14-14-12-16Z\"/>",
        "goatee18": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M220 480c10 0 30-5 30 0 0 20-30 30-50 30s-50-10-50-30c0-5 20 0 30 0zm-32-22c2-2 22-2 24 0s-8 16-12 16-14-14-12-16Z\"/>",
        "goatee19": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M220 480c10 0 30-5 30 0 0 20-30 30-50 30s-50-10-50-30c0-5 20 0 30 0zm-32-22c2-2 22-2 24 0s-8 16-12 16-14-14-12-16Zm-38-33c-5-5 25-20 35-20 5 0 10 5 15 5s10-5 15-5c10 0 40 15 35 20s-5-5-50-5-45 10-50 5Z\"/>",
        "goatee2": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M200 458.02 190 460c-10 10-20 40-20 40s10 10 30 10 30-10 30-10-10-30-20-40z\"/>",
        "goatee3": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M175 485s10-5 25-5 25 5 25 5c-15 30-15 45-15 45l-5-10-5 20-5-20-5 10s0-15-15-45Z\"/>",
        "goatee4-stache": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"m200.542 480.142 10.053.096S210 480 220 480s30-5 30 0c0 20-30 30-50 30s-50-10-50-30c0-5 20 0 30 0s11.295.185 11.295.185zM150 425c-5-5 25-20 35-20 5 0 10 5 15 5s10-5 15-5c10 0 40 15 35 20s-5-5-50-5-45 10-50 5z\"/>",
        "goatee4": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M220 480c10 0 30-5 30 0 0 20-30 30-50 30s-50-10-50-30c0-5 20 0 30 0z\"/>",
        "goatee5": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M200 460c10 0 10 20 20 20s20-20 20-20 10 0 10 5c0 40-10 50-50 50s-50-10-50-50c0-5 10-5 10-5s10 20 20 20 10-20 20-20Z\"/>",
        "goatee6": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M188 454c2-2 22-2 24 0s-8 16-12 16-14-14-12-16Zm12 21c10 0 10 5 20 5s20-20 20-20 10 0 10 5c0 40-10 50-50 50s-50-10-50-50c0-5 10-5 10-5s10 20 20 20 10-5 20-5Zm-50-50c-5-5 25-20 35-20 5 0 10 5 15 5s10-5 15-5c10 0 40 15 35 20s-5-5-50-5-45 10-50 5Z\"/>",
        "goatee7": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M250 485c-10 20-30 20-50 20s-40 0-50-20c5-5 10 10 50 10s45-15 50-10Z\"/>",
        "goatee8": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M188 454c2-2 22-2 24 0s-8 16-12 16-14-14-12-16Zm62 31c-10 20-30 20-50 20s-40 0-50-20c5-5 10 10 50 10s45-15 50-10Z\"/>",
        "goatee9": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M188 454c-2.15-1.84 26.15-1.84 24 0-7 6-12 26-12 26s-5-20-12-26Zm62 31c-10 20-30 20-50 20s-40 0-50-20c5-5 35 20 50-5 15 25 45 0 50 5Z\"/>",
        "harley1-sb-1": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M205 420c-4 0-5-5-.8-10 5.8-5 15.8-5 15.8-5 15 0 35 15 35 25 0 30 10 55 5 60s-15 5-20 0 5-40 5-55-15-15-40-15Zm-10 0c4 0 5-5 0-10s-15-5-15-5c-16 0-35 15-35 25 0 30-10 55-5 60s15 5 20 0-5-40-5-55 15-15 40-15ZM60 300H50s-3.85 100.38 25 110c15 5 35 15 40 10 20-20-5-25-5-25s-50-20-50-95Zm280 0h10s3.85 100.38-25 110c-15 5-35 15-40 10-20-20 5-25 5-25s50-20 50-95Z\"/>",
        "harley1-sb-2": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M205 420c-4 0-5-5-.8-10 5.8-5 15.8-5 15.8-5 15 0 35 15 35 25 0 30 10 55 5 60s-15 5-20 0 5-40 5-55-15-15-40-15Zm-10 0c4 0 5-5 0-10s-15-5-15-5c-16 0-35 15-35 25 0 30-10 55-5 60s15 5 20 0-5-40-5-55 15-15 40-15ZM60 300H50s-8.85 85.38 20 95c15 5 0-34.1 0-34.1S65 355 60 300Zm279 0h10s8.85 85.38-20 95c-15 5 0-34.1 0-34.1s5-5.9 10-60.9Z\"/>",
        "harley1": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M205 420c-4 0-5-5-.8-10 5.8-5 15.8-5 15.8-5 15 0 35 15 35 25 0 30 10 55 5 60s-15 5-20 0 5-40 5-55-15-15-40-15Zm-10 0c4 0 5-5 0-10s-15-5-15-5c-16 0-35 15-35 25 0 30-10 55-5 60s15 5 20 0-5-40-5-55 15-15 40-15Z\"/>",
        "harley2-sb-1": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M205 420c-4 0-5-5-.8-10 5.8-5 15.8-5 15.8-5 15 0 35 15 35 25 0 30 10 55 5 60s-15 5-20 0 5-40 5-55-15-15-40-15Zm-10 0c4 0 5-5 0-10s-15-5-15-5c-16 0-35 15-35 25 0 30-10 55-5 60s15 5 20 0-5-40-5-55 15-15 40-15Zm-7 38c2-2 22-2 24 0s-8 16-12 16-14-14-12-16ZM60 300H50s-3.85 100.38 25 110c15 5 35 15 40 10 20-20-5-25-5-25s-50-20-50-95Zm280 0h10s3.85 100.38-25 110c-15 5-35 15-40 10-20-20 5-25 5-25s50-20 50-95Z\"/>",
        "harley2-sb-2": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M205 420c-4 0-5-5-.8-10 5.8-5 15.8-5 15.8-5 15 0 35 15 35 25 0 30 10 55 5 60s-15 5-20 0 5-40 5-55-15-15-40-15Zm-10 0c4 0 5-5 0-10s-15-5-15-5c-16 0-35 15-35 25 0 30-10 55-5 60s15 5 20 0-5-40-5-55 15-15 40-15Zm-7 38c2-2 22-2 24 0s-8 16-12 16-14-14-12-16ZM60 300H50s-8.85 85.38 20 95c15 5 0-34.1 0-34.1S65 355 60 300Zm279 0h10s8.85 85.38-20 95c-15 5 0-34.1 0-34.1s5-5.9 10-60.9Z\"/>",
        "harley2": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M205 420c-4 0-5-5-.8-10 5.8-5 15.8-5 15.8-5 15 0 35 15 35 25 0 30 10 55 5 60s-15 5-20 0 5-40 5-55-15-15-40-15Zm-10 0c4 0 5-5 0-10s-15-5-15-5c-16 0-35 15-35 25 0 30-10 55-5 60s15 5 20 0-5-40-5-55 15-15 40-15Zm-7 38c2-2 22-2 24 0s-8 16-12 16-14-14-12-16Z\"/>",
        "harly3-sb-1": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M205 420c-4 0-5-5-.8-10 5.8-5 15.8-5 15.8-5 15 0 35 15 35 25 0 30 10 55 5 60s-15 5-20 0 5-40 5-55-15-15-40-15Zm-10 0c4 0 5-5 0-10s-15-5-15-5c-16 0-35 15-35 25 0 30-10 55-5 60s15 5 20 0-5-40-5-55 15-15 40-15Zm5 38.02L190 460c-10 10-20 40-20 40s10 10 30 10 30-10 30-10-10-30-20-40zM60 300H50s-3.85 100.38 25 110c15 5 35 15 40 10 20-20-5-25-5-25s-50-20-50-95Zm280 0h10s3.85 100.38-25 110c-15 5-35 15-40 10-20-20 5-25 5-25s50-20 50-95Z\"/>",
        "harly3-sb-2": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M205 420c-4 0-5-5-.8-10 5.8-5 15.8-5 15.8-5 15 0 35 15 35 25 0 30 10 55 5 60s-15 5-20 0 5-40 5-55-15-15-40-15Zm-10 0c4 0 5-5 0-10s-15-5-15-5c-16 0-35 15-35 25 0 30-10 55-5 60s15 5 20 0-5-40-5-55 15-15 40-15Zm5 38.02L190 460c-10 10-20 40-20 40s10 10 30 10 30-10 30-10-10-30-20-40zM60 300H50s-8.85 85.38 20 95c15 5 0-34.1 0-34.1S65 355 60 300Zm279 0h10s8.85 85.38-20 95c-15 5 0-34.1 0-34.1s5-5.9 10-60.9Z\"/>",
        "harly3": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M205 420c-4 0-5-5-.8-10 5.8-5 15.8-5 15.8-5 15 0 35 15 35 25 0 30 10 55 5 60s-15 5-20 0 5-40 5-55-15-15-40-15Zm-10 0c4 0 5-5 0-10s-15-5-15-5c-16 0-35 15-35 25 0 30-10 55-5 60s15 5 20 0-5-40-5-55 15-15 40-15Zm5 38.02L190 460c-10 10-20 40-20 40s10 10 30 10 30-10 30-10-10-30-20-40z\"/>",
        "honest-abe-stache": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M340 300c0 105-85 140-85 140s-5 30-15 30c-30 0-30-10-40-10s-10 10-40 10c-10 0-15-30-15-30s-85-35-85-140H50c0 105 20 140 20 140s55 80 130 80 130-80 130-80 20-35 20-140zM150 425c-5-5 25-20 35-20 5 0 10 5 15 5s10-5 15-5c10 0 40 15 35 20s-5-5-50-5-45 10-50 5Z\"/>",
        "honest-abe": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M340 300c0 105-85 140-85 140s-5 30-15 30c-30 0-30-10-40-10s-10 10-40 10c-10 0-15-30-15-30s-85-35-85-140H50c0 105 20 140 20 140s55 80 130 80 130-80 130-80 20-35 20-140z\"/>",
        "logan": "<path fill=\"$[hairColor]\" fill-rule=\"evenodd\" stroke=\"#000\" d=\"M60 300H50s-10 70 10 130c10 20 60 70 120 70 10 0-30-28.8-30-50 0-20 10-20 10-30s-30 30-70-10c-20-20-30-80-30-110Zm250 110c-40 40-70 0-70 10s10 10 10 30c0 21.2-40 50-30 50 60 0 110-50 120-70 20-60 10-130 10-130h-10c0 30-10 90-30 110Z\"/>",
        "loganGoatee2": "<path fill=\"$[hairColor]\" fill-rule=\"evenodd\" stroke=\"#000\" d=\"M60 300H50s-10 70 10 130c10 20 60 70 120 70 10 0-30-28.8-30-50 0-20 10-20 10-30s-30 30-70-10c-20-20-30-80-30-110Zm250 110c-40 40-70 0-70 10s10 10 10 30c0 21.2-40 50-30 50 60 0 110-50 120-70 20-60 10-130 10-130h-10c0 30-10 90-30 110Z\"/><path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M200 458.02 190 460c-10 10-20 40-20 40s10 10 30 10 30-10 30-10-10-30-20-40z\"/>",
        "loganGoatee2Stache": "<path fill=\"$[hairColor]\" fill-rule=\"evenodd\" stroke=\"#000\" d=\"M60 300H50s-10 70 10 130c10 20 60 70 120 70 10 0-30-28.8-30-50 0-20 10-20 10-30s-30 30-70-10c-20-20-30-80-30-110Zm250 110c-40 40-70 0-70 10s10 10 10 30c0 21.2-40 50-30 50 60 0 110-50 120-70 20-60 10-130 10-130h-10c0 30-10 90-30 110Z\"/><path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M200 458.02 190 460c-10 10-20 40-20 40s10 10 30 10 30-10 30-10-10-30-20-40zM150 425c-5-5 25-20 35-20 5 0 10 5 15 5s10-5 15-5c10 0 40 15 35 20s-5-5-50-5-45 10-50 5Z\"/>",
        "loganGoatee3": "<path fill=\"$[hairColor]\" fill-rule=\"evenodd\" stroke=\"#000\" d=\"M60 300H50s-10 70 10 130c10 20 60 70 120 70 10 0-30-28.8-30-50 0-20 10-20 10-30s-30 30-70-10c-20-20-30-80-30-110Zm250 110c-40 40-70 0-70 10s10 10 10 30c0 21.2-40 50-30 50 60 0 110-50 120-70 20-60 10-130 10-130h-10c0 30-10 90-30 110Z\"/><path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M175 485s10-5 25-5 25 5 25 5c-15 30-15 45-15 45l-5-10-5 20-5-20-5 10s0-15-15-45Z\"/>",
        "loganGoatee3soul": "<path fill=\"$[hairColor]\" fill-rule=\"evenodd\" stroke=\"#000\" d=\"M60 300H50s-10 70 10 130c10 20 60 70 120 70 10 0-30-28.8-30-50 0-20 10-20 10-30s-30 30-70-10c-20-20-30-80-30-110Zm250 110c-40 40-70 0-70 10s10 10 10 30c0 21.2-40 50-30 50 60 0 110-50 120-70 20-60 10-130 10-130h-10c0 30-10 90-30 110Z\"/><path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M175 485s10-5 25-5 25 5 25 5c-15 30-15 45-15 45l-5-10-5 20-5-20-5 10s0-15-15-45Zm13-27c2-2 22-2 24 0s-8 16-12 16-14-14-12-16Z\"/>",
        "loganGoatee3soulStache": "<path fill=\"$[hairColor]\" fill-rule=\"evenodd\" stroke=\"#000\" d=\"M60 300H50s-10 70 10 130c10 20 60 70 120 70 10 0-30-28.8-30-50 0-20 10-20 10-30s-30 30-70-10c-20-20-30-80-30-110Zm250 110c-40 40-70 0-70 10s10 10 10 30c0 21.2-40 50-30 50 60 0 110-50 120-70 20-60 10-130 10-130h-10c0 30-10 90-30 110Z\"/><path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M175 485s10-5 25-5 25 5 25 5c-15 30-15 45-15 45l-5-10-5 20-5-20-5 10s0-15-15-45Zm13-27c2-2 22-2 24 0s-8 16-12 16-14-14-12-16Zm-38-33c-5-5 25-20 35-20 5 0 10 5 15 5s10-5 15-5c10 0 40 15 35 20s-5-5-50-5-45 10-50 5Z\"/>",
        "loganSoul": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M188 458c2-2 22-2 24 0s-8 16-12 16-14-14-12-16ZM60 300H50s-10 70 10 130c10 20 60 70 120 70 10 0-30-28.8-30-50 0-20 10-20 10-30s-30 30-70-10c-20-20-30-80-30-110Zm250 110c-40 40-70 0-70 10s10 10 10 30c0 21.2-40 50-30 50 60 0 110-50 120-70 20-60 10-130 10-130h-10c0 30-10 90-30 110Z\"/>",
        "mustache-thin": "<path stroke=\"#000\" stroke-width=\"3\" d=\"m205.17 408-.17 12m10-15v16.28m10-13.26V420m10-10v11.28M194.83 408l.17 12m-10-15v16.28m-10-13.26V420m-10-10v11.53\"/>",
        "mustache1": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M150 425c-5-5 25-20 35-20 5 0 10 5 15 5s10-5 15-5c10 0 40 15 35 20s-5-5-50-5-45 10-50 5Z\"/>",
        "mustache1SB1": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M150 425c-5-5 25-20 35-20 5 0 10 5 15 5s10-5 15-5c10 0 40 15 35 20s-5-5-50-5-45 10-50 5ZM60 300H50s-3.85 100.38 25 110c15 5 35 15 40 10 20-20-5-25-5-25s-50-20-50-95Zm280 0h10s3.85 100.38-25 110c-15 5-35 15-40 10-20-20 5-25 5-25s50-20 50-95Z\"/>",
        "mustache1SB2": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M150 425c-5-5 25-20 35-20 5 0 10 5 15 5s10-5 15-5c10 0 40 15 35 20s-5-5-50-5-45 10-50 5ZM60 300H50s-8.85 85.38 20 95c15 5 0-34.1 0-34.1S65 355 60 300Zm279 0h10s8.85 85.38-20 95c-15 5 0-34.1 0-34.1s5-5.9 10-60.9Z\"/>",
        "mutton": "<path fill=\"$[hairColor]\" fill-rule=\"evenodd\" stroke=\"#000\" d=\"M60 300H50s-10 70 10 130c10 20 30 55 90 55 10-10 0-45-10-55s-30 0-60-30c-20-20-20-70-20-100Zm261 100c-30 30-50 20-60 30s-20 45-10 55c60 0 80-35 90-55 20-60 10-130 10-130h-10c0 30 0 80-20 100Z\"/>",
        "muttonGoatee1": "<path fill=\"$[hairColor]\" fill-rule=\"evenodd\" stroke=\"#000\" d=\"M60 300H50s-10 70 10 130c10 20 30 55 90 55 10-10 0-45-10-55s-30 0-60-30c-20-20-20-70-20-100Zm261 100c-30 30-50 20-60 30s-20 45-10 55c60 0 80-35 90-55 20-60 10-130 10-130h-10c0 30 0 80-20 100Z\"/><path fill=\"$[hairColor]\" stroke=\"#000\" d=\"m200 457.82 10 2.18s0 20 10 20 30-5 30 0c0 20-30 30-50 30s-50-10-50-30c0-5 20 0 30 0s10-20 10-20z\"/>",
        "muttonGoatee1Stache": "<path fill=\"$[hairColor]\" fill-rule=\"evenodd\" stroke=\"#000\" d=\"M60 300H50s-10 70 10 130c10 20 30 55 90 55 10-10 0-45-10-55s-30 0-60-30c-20-20-20-70-20-100Zm261 100c-30 30-50 20-60 30s-20 45-10 55c60 0 80-35 90-55 20-60 10-130 10-130h-10c0 30 0 80-20 100Z\"/><path fill=\"$[hairColor]\" stroke=\"#000\" d=\"m200 457.82 10 2.18s0 20 10 20 30-5 30 0c0 20-30 30-50 30s-50-10-50-30c0-5 20 0 30 0s10-20 10-20zM150 425c-5-5 25-20 35-20 5 0 10 5 15 5s10-5 15-5c10 0 40 15 35 20s-5-5-50-5-45 10-50 5Z\"/>",
        "muttonGoatee2": "<path fill=\"$[hairColor]\" fill-rule=\"evenodd\" stroke=\"#000\" d=\"M60 300H50s-10 70 10 130c10 20 30 55 90 55 10-10 0-45-10-55s-30 0-60-30c-20-20-20-70-20-100Zm261 100c-30 30-50 20-60 30s-20 45-10 55c60 0 80-35 90-55 20-60 10-130 10-130h-10c0 30 0 80-20 100Zm-121 58.02L190 460c-10 10-20 40-20 40s10 10 30 10 30-10 30-10-10-30-20-40z\"/>",
        "muttonGoatee2Stache": "<path fill=\"$[hairColor]\" fill-rule=\"evenodd\" stroke=\"#000\" d=\"M60 300H50s-10 70 10 130c10 20 30 55 90 55 10-10 0-45-10-55s-30 0-60-30c-20-20-20-70-20-100Zm261 100c-30 30-50 20-60 30s-20 45-10 55c60 0 80-35 90-55 20-60 10-130 10-130h-10c0 30 0 80-20 100Zm-121 58.02L190 460c-10 10-20 40-20 40s10 10 30 10 30-10 30-10-10-30-20-40zM150 425c-5-5 25-20 35-20 5 0 10 5 15 5s10-5 15-5c10 0 40 15 35 20s-5-5-50-5-45 10-50 5Z\"/>",
        "muttonGoatee5": "<path fill=\"$[hairColor]\" fill-rule=\"evenodd\" stroke=\"#000\" d=\"M60 300H50s-10 70 10 130c10 20 30 55 90 55 10-10 0-45-10-55s-30 0-60-30c-20-20-20-70-20-100Zm261 100c-30 30-50 20-60 30s-20 45-10 55c60 0 80-35 90-55 20-60 10-130 10-130h-10c0 30 0 80-20 100Z\"/><path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M200 460c10 0 10 20 20 20s20-20 20-20 10 0 10 5c0 40-10 50-50 50s-50-10-50-50c0-5 10-5 10-5s10 20 20 20 10-20 20-20Z\"/>",
        "muttonGoatee5Stache": "<path fill=\"$[hairColor]\" fill-rule=\"evenodd\" stroke=\"#000\" d=\"M60 300H50s-10 70 10 130c10 20 30 55 90 55 10-10 0-45-10-55s-30 0-60-30c-20-20-20-70-20-100Zm261 100c-30 30-50 20-60 30s-20 45-10 55c60 0 80-35 90-55 20-60 10-130 10-130h-10c0 30 0 80-20 100Z\"/><path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M200 460c10 0 10 20 20 20s20-20 20-20 10 0 10 5c0 40-10 50-50 50s-50-10-50-50c0-5 10-5 10-5s10 20 20 20 10-20 20-20Zm-50-35c-5-5 25-20 35-20 5 0 10 5 15 5s10-5 15-5c10 0 40 15 35 20s-5-5-50-5-45 10-50 5Z\"/>",
        "muttonSoul": "<path fill=\"$[hairColor]\" fill-rule=\"evenodd\" stroke=\"#000\" d=\"M60 300H50s-10 70 10 130c10 20 30 55 90 55 10-10 0-45-10-55s-30 0-60-30c-20-20-20-70-20-100Zm261 100c-30 30-50 20-60 30s-20 45-10 55c60 0 80-35 90-55 20-60 10-130 10-130h-10c0 30 0 80-20 100Z\"/><path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M188 458c2-2 22-2 24 0s-8 16-12 16-14-14-12-16Z\"/>",
        "muttonStache": "<path fill=\"$[hairColor]\" fill-rule=\"evenodd\" stroke=\"#000\" d=\"M60 300H50s-10 70 10 130c10 20 30 55 90 55 10-10 0-45-10-55s-30 0-60-30c-20-20-20-70-20-100Zm261 100c-30 30-50 20-60 30s-20 45-10 55c60 0 80-35 90-55 20-60 10-130 10-130h-10c0 30 0 80-20 100Zm-171 25c-5-5 25-20 35-20 5 0 10 5 15 5s10-5 15-5c10 0 40 15 35 20s-5-5-50-5-45 10-50 5Z\"/>",
        "muttonStacheSoul": "<path fill=\"$[hairColor]\" fill-rule=\"evenodd\" stroke=\"#000\" d=\"M60 300H50s-10 70 10 130c10 20 30 55 90 55 10-10 0-45-10-55s-30 0-60-30c-20-20-20-70-20-100Zm261 100c-30 30-50 20-60 30s-20 45-10 55c60 0 80-35 90-55 20-60 10-130 10-130h-10c0 30 0 80-20 100Zm-171 25c-5-5 25-20 35-20 5 0 10 5 15 5s10-5 15-5c10 0 40 15 35 20s-5-5-50-5-45 10-50 5Zm38 33c2-2 22-2 24 0s-8 16-12 16-14-14-12-16Z\"/>",
        "neckbeard": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M200 450c20 0 10 30 20 30s35-5 45-15c20-20 30-30 40-30 0 70-65 80-105 80S95 505 95 435c10 0 20 10 40 30 10 10 35 15 45 15s0-30 20-30Z\"/>",
        "neckbeard2": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M200 450c20 0 10 30 20 30s35-5 45-15c20-20 30-30 40-30 0 70-65 80-105 80S95 505 95 435c10 0 20 10 40 30 10 10 35 15 45 15s0-30 20-30Zm-50-25c-5-5 25-20 35-20 5 0 10 5 15 5s10-5 15-5c10 0 40 15 35 20s-5-5-50-5-45 10-50 5Z\"/>",
        "neckbeard2SB1": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M200 450c20 0 10 30 20 30s35-5 45-15c20-20 30-30 40-30 0 70-65 80-105 80S95 505 95 435c10 0 20 10 40 30 10 10 35 15 45 15s0-30 20-30Zm-50-25c-5-5 25-20 35-20 5 0 10 5 15 5s10-5 15-5c10 0 40 15 35 20s-5-5-50-5-45 10-50 5Z\"/><path fill=\"$[hairColor]\" fill-rule=\"evenodd\" stroke=\"#000\" d=\"M60 300H50s-3.85 100.38 25 110c15 5 35 15 40 10 20-20-5-25-5-25s-50-20-50-95Zm280 0h10s3.85 100.38-25 110c-15 5-35 15-40 10-20-20 5-25 5-25s50-20 50-95Z\"/>",
        "neckbeard2SB2": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M200 450c20 0 10 30 20 30s35-5 45-15c20-20 30-30 40-30 0 70-65 80-105 80S95 505 95 435c10 0 20 10 40 30 10 10 35 15 45 15s0-30 20-30Zm-50-25c-5-5 25-20 35-20 5 0 10 5 15 5s10-5 15-5c10 0 40 15 35 20s-5-5-50-5-45 10-50 5Z\"/><path fill=\"$[hairColor]\" fill-rule=\"evenodd\" stroke=\"#000\" d=\"M60 300H50s-8.85 85.38 20 95c15 5 0-34.1 0-34.1S65 355 60 300Zm279 0h10s8.85 85.38-20 95c-15 5 0-34.1 0-34.1s5-5.9 10-60.9Z\"/>",
        "neckbeardSB1": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M200 450c20 0 10 30 20 30s35-5 45-15c20-20 30-30 40-30 0 70-65 80-105 80S95 505 95 435c10 0 20 10 40 30 10 10 35 15 45 15s0-30 20-30Z\"/><path fill=\"$[hairColor]\" fill-rule=\"evenodd\" stroke=\"#000\" d=\"M60 300H50s-3.85 100.38 25 110c15 5 35 15 40 10 20-20-5-25-5-25s-50-20-50-95Zm280 0h10s3.85 100.38-25 110c-15 5-35 15-40 10-20-20 5-25 5-25s50-20 50-95Z\"/>",
        "neckbeardSB2": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M200 450c20 0 10 30 20 30s35-5 45-15c20-20 30-30 40-30 0 70-65 80-105 80S95 505 95 435c10 0 20 10 40 30 10 10 35 15 45 15s0-30 20-30Z\"/><path fill=\"$[hairColor]\" fill-rule=\"evenodd\" stroke=\"#000\" d=\"M60 300H50s-8.85 85.38 20 95c15 5 0-34.1 0-34.1S65 355 60 300Zm279 0h10s8.85 85.38-20 95c-15 5 0-34.1 0-34.1s5-5.9 10-60.9Z\"/>",
        "none": "",
        "sideburns1": "<path fill=\"$[hairColor]\" fill-rule=\"evenodd\" stroke=\"#000\" d=\"M60 300H50s-5 105 25 110c29.59 4.93 40 10 40 10s-55-45-55-120Zm280-10h10s5 105-25 110c-29.59 4.93-40 10-40 10s55-45 55-120Z\"/>",
        "sideburns2": "<path fill=\"$[hairColor]\" fill-rule=\"evenodd\" stroke=\"#000\" d=\"M60 300H50s-3.85 100.38 25 110c15 5 35 15 40 10 20-20-5-25-5-25s-50-20-50-95Zm280 0h10s3.85 100.38-25 110c-15 5-35 15-40 10-20-20 5-25 5-25s50-20 50-95Z\"/>",
        "sideburns3": "<path fill=\"$[hairColor]\" fill-rule=\"evenodd\" stroke=\"#000\" d=\"M60 300H50s-8.85 85.38 20 95c15 5 0-34.1 0-34.1S65 355 60 300Zm279 0h10s8.85 85.38-20 95c-15 5 0-34.1 0-34.1s5-5.9 10-60.9Z\"/>",
        "soul-stache": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M188 458c2-2 22-2 24 0s-8 16-12 16-14-14-12-16Zm-38-33c-5-5 25-20 35-20 5 0 10 5 15 5s10-5 15-5c10 0 40 15 35 20s-5-5-50-5-45 10-50 5Z\"/>",
        "soul": "<path fill=\"$[hairColor]\" stroke=\"#000\" d=\"M188 458c2-2 22-2 24 0s-8 16-12 16-14-14-12-16Z\"/>",
        "wilt-sideburns-long": "<path fill=\"$[hairColor]\" fill-rule=\"evenodd\" stroke=\"#000\" d=\"M200 405c55 0 55 20 55 35 0 0 5 40-5 55-5 5-35 15-50 15s-46.67-10-50-15c-10-15-5-55-5-55 0-15 0-35 55-35Zm-45 35c0 5 5 5 25 5 10 0 10-5 20-5s10 5 20 5c20 0 25 0 25-5 0-20-15-15-45-15s-45-5-45 15ZM60 300H50s-3.85 100.38 25 110c15 5 35 15 40 10 20-20-5-25-5-25s-50-20-50-95Zm280 0h10s3.85 100.38-25 110c-15 5-35 15-40 10-20-20 5-25 5-25s50-20 50-95Z\"/>",
        "wilt-sideburns-short": "<path fill=\"$[hairColor]\" fill-rule=\"evenodd\" stroke=\"#000\" d=\"M200 405c55 0 55 20 55 35 0 0 5 40-5 55-5 5-35 15-50 15s-46.67-10-50-15c-10-15-5-55-5-55 0-15 0-35 55-35Zm-45 35c0 5 5 5 25 5 10 0 10-5 20-5s10 5 20 5c20 0 25 0 25-5 0-20-15-15-45-15s-45-5-45 15ZM60 300H50s-8.85 85.38 20 95c15 5 0-34.1 0-34.1S65 355 60 300Zm279 0h10s8.85 85.38-20 95c-15 5 0-34.1 0-34.1s5-5.9 10-60.9Z\"/>",
        "wilt": "<path fill=\"$[hairColor]\" fill-rule=\"evenodd\" stroke=\"#000\" d=\"M200 405c55 0 55 20 55 35 0 0 5 40-5 55-5 5-35 15-50 15s-46.67-10-50-15c-10-15-5-55-5-55 0-15 0-35 55-35Zm-45 35c0 5 5 5 25 5 10 0 10-5 20-5s10 5 20 5c20 0 25 0 25-5 0-20-15-15-45-15s-45-5-45 15Z\"/>"
    },
    "glasses": {
        "facemask": "<g stroke-width=\"2\"><path fill=\"rgba(150,150,175,.5)\" fill-rule=\"evenodd\" stroke=\"#000\" d=\"M200 190c50 0 100 10 110 20s20 80 20 80 0 60-10 70-50 10-80 10c-10 0-20-10-40-10s-30 10-40 10c-30 0-70 0-80-10s-10-70-10-70 10-70 20-80 60-20 110-20Zm-70 90q-45 0-45 30c0 25 15 30 45 30s60-5 60-30-30-30-60-30Zm140 60c30 0 45-5 45-30q0-30-45-30c-30 0-60 5-60 30s30 30 60 30Z\"/><path fill=\"#333\" stroke=\"#000\" d=\"M350 315v-30h-20v30zm-280 0v-30H50v30z\"/><path fill=\"none\" stroke=\"#fff\" d=\"m260 270 10-30m0 35 10-30m-160 25 10-30m0 35 10-30m120 115 5-15m0 20 5-15m-150 10 5-15m0 20 5-15\"/></g>",
        "glasses1-primary": "<path fill=\"#333\" stroke=\"#000\" stroke-width=\"2\" d=\"M195 285h10s35-10 65-10 50 10 50 10 0 5 10 5v30c-10 0-10 5-10 5s-20 20-50 20c-60 0-65-35-65-35 0-5-10-5-10 0 0 0-5 35-65 35-30 0-50-20-50-20s0-5-10-5v-30c10 0 10-5 10-5s20-10 50-10 65 10 65 10ZM90 295c0 20 0 40 40 40 50 0 50-30 50-30v-10s-20-10-50-10c-40 0-40 10-40 10Zm130 10s0 30 50 30c40 0 40-20 40-40 0 0 0-10-40-10-30 0-50 10-50 10z\"/><path fill=\"rgba(150,150,175,.5)\" d=\"M90 295s0-10 40-10c30 0 50 10 50 10v10s0 30-50 30c-40 0-40-20-40-40m180 40c-50 0-50-30-50-30v-10s20-10 50-10c40 0 40 10 40 10 0 20 0 40-40 40\"/><path fill=\"$[primary]\" stroke=\"#000\" stroke-width=\"2\" d=\"M350 320v-30h-20v30zm-280 0v-30H50v30z\"/><path fill=\"none\" stroke=\"#fff\" stroke-width=\"2\" d=\"m280 315 10-20m0 20 10-20m-160 20 10-20m0 20 10-20\"/>",
        "glasses1-secondary": "<path fill=\"#333\" stroke=\"#000\" stroke-width=\"2\" d=\"M195 285h10s35-10 65-10 50 10 50 10 0 5 10 5v30c-10 0-10 5-10 5s-20 20-50 20c-60 0-65-35-65-35 0-5-10-5-10 0 0 0-5 35-65 35-30 0-50-20-50-20s0-5-10-5v-30c10 0 10-5 10-5s20-10 50-10 65 10 65 10ZM90 295c0 20 0 40 40 40 50 0 50-30 50-30v-10s-20-10-50-10c-40 0-40 10-40 10Zm130 10s0 30 50 30c40 0 40-20 40-40 0 0 0-10-40-10-30 0-50 10-50 10z\"/><path fill=\"rgba(150,150,175,.5)\" d=\"M90 295s0-10 40-10c30 0 50 10 50 10v10s0 30-50 30c-40 0-40-20-40-40m180 40c-50 0-50-30-50-30v-10s20-10 50-10c40 0 40 10 40 10 0 20 0 40-40 40\"/><path fill=\"$[secondary]\" stroke=\"#000\" stroke-width=\"2\" d=\"M350 320v-30h-20v30zm-280 0v-30H50v30z\"/><path fill=\"none\" stroke=\"#fff\" stroke-width=\"2\" d=\"m280 315 10-20m0 20 10-20m-160 20 10-20m0 20 10-20\"/>",
        "glasses2-black": "<path fill=\"#333\" stroke=\"#000\" stroke-width=\"2\" d=\"M50 285h30s20-10 50-10 65 10 65 10h10s35-10 65-10 50 10 50 10h30v10l-30 5s-20-15-50-15-60 10-60 10-5 15 0 25c0 0-5-10-10-10s-10 10-10 10c5-10 0-25 0-25s-30-10-60-10-50 15-50 15l-30-5z\"/><path fill=\"rgba(150,150,175,.5)\" fill-rule=\"lens\" d=\"M155 340c35 0 35 5 35-20 5-10 0-25 0-25s-30-10-60-10-50 15-50 15-5 40 5 45 40-5 70-5m160 5c10-5 5-45 5-45s-20-15-50-15-60 10-60 10-5 15 0 25c0 25 0 20 35 20 30 0 60 10 70 5\"/><path fill=\"none\" stroke=\"#fff\" stroke-width=\"2\" d=\"m275 330 15-35m-5 35 15-35m-165 35 15-35m-5 35 15-35\"/>",
        "glasses2-primary": "<path fill=\"$[primary]\" stroke=\"#000\" stroke-width=\"2\" d=\"M50 285h30s20-10 50-10 65 10 65 10h10s35-10 65-10 50 10 50 10h30v10l-30 5s-20-15-50-15-60 10-60 10-5 15 0 25c0 0-5-10-10-10s-10 10-10 10c5-10 0-25 0-25s-30-10-60-10-50 15-50 15l-30-5z\"/><path fill=\"rgba(150,150,175,.5)\" fill-rule=\"lens\" d=\"M155 340c35 0 35 5 35-20 5-10 0-25 0-25s-30-10-60-10-50 15-50 15-5 40 5 45 40-5 70-5m160 5c10-5 5-45 5-45s-20-15-50-15-60 10-60 10-5 15 0 25c0 25 0 20 35 20 30 0 60 10 70 5\"/><path fill=\"none\" stroke=\"#fff\" stroke-width=\"2\" d=\"m275 330 15-35m-5 35 15-35m-165 35 15-35m-5 35 15-35\"/>",
        "glasses2-secondary": "<path fill=\"$[secondary]\" stroke=\"#000\" stroke-width=\"2\" d=\"M50 285h30s20-10 50-10 65 10 65 10h10s35-10 65-10 50 10 50 10h30v10l-30 5s-20-15-50-15-60 10-60 10-5 15 0 25c0 0-5-10-10-10s-10 10-10 10c5-10 0-25 0-25s-30-10-60-10-50 15-50 15l-30-5z\"/><path fill=\"rgba(150,150,175,.5)\" fill-rule=\"lens\" d=\"M155 340c35 0 35 5 35-20 5-10 0-25 0-25s-30-10-60-10-50 15-50 15-5 40 5 45 40-5 70-5m160 5c10-5 5-45 5-45s-20-15-50-15-60 10-60 10-5 15 0 25c0 25 0 20 35 20 30 0 60 10 70 5\"/><path fill=\"none\" stroke=\"#fff\" stroke-width=\"2\" d=\"m275 330 15-35m-5 35 15-35m-165 35 15-35m-5 35 15-35\"/>",
        "none": ""
    },
    "hair": {
        "afro": "<path fill=\"$[hairColor]\" stroke=\"#000\" stroke-width=\"4\" d=\"M60 310H50s-40 0-40-50C10 120 80 70 200 70s190 50 190 190c0 50-40 50-40 50h-10v-20c0-5-10-20-15-25s-10-45-15-55c-6.32-12.65-60-10-110-10s-103.68-2.65-110 10c-5 10-10 50-15 55s-15 20-15 25zM200 70\"/>",
        "afro2": "<path fill=\"$[hairColor]\" stroke=\"#000\" stroke-width=\"4\" d=\"M198.27 56.61c-1 1.31-1.41 3.32-1.35 6.68.06 3.65.66 5.87 2.56 9.35 1.37 2.51 2.24 4.75 1.93 4.98-.3.23-1.51.41-2.69.39-1.18-.01-3.36-.95-4.84-2.08-1.48-1.12-3.16-1.79-3.73-1.48s-2.46 1.71-4.2 3.11c-2.67 2.14-3.29 2.34-3.93 1.29-.42-.68-.77-2.45-.78-3.94l-.01-2.69c-10.31-1.17-11.31-1.58-12.79-3.62-.95-1.3-3.22-3.13-5.04-4.07-1.83-.94-4.35-2.49-5.61-3.45l-2.29-1.74c-9.11 4.5-12.09 6.27-12.51 6.84-.51.7 1.65 5.32 6.71 14.31 4.1 7.31 7.27 13.47 7.04 13.7-.23.22-4.24-1.78-8.91-4.46-4.68-2.68-10-5.33-11.82-5.89-1.83-.56-3.79-.79-4.36-.53-.57.27-1.05.96-1.06 1.53-.02.57 1.28 2.71 2.89 4.77 1.61 2.05 2.92 3.92 2.93 4.15 0 .23-4.01.41-8.91.41-8.24-.01-9.4.2-15.15 2.69-3.42 1.48-6.97 2.7-7.88 2.7s-2.86.47-4.33 1.03c-2.39.92-2.94.83-5.18-.84-1.39-1.03-3.17-1.85-3.97-1.84-.8.02-3.51 1.82-6.02 4.01-2.51 2.18-5.03 4.21-5.6 4.52s-4.21-.57-8.09-1.94c-3.87-1.37-8.35-2.49-9.95-2.49s-2.9.18-2.9.41.58 1.82 1.29 3.53c.72 1.71 3.69 6.29 6.61 10.17 2.91 3.88 5.31 7.7 5.33 8.5.02 1.29-.93 1.45-8.69 1.45l-8.71-.01c-26.05 13.64-35.66 18.9-38.17 20.49s-5.6 3.88-6.87 5.09c-1.26 1.2-2.29 2.47-2.28 2.81s1.23.61 2.71.59c1.49-.01 5.5-1.12 8.92-2.45 3.43-1.33 6.3-2.35 6.4-2.25.09.1-1.69 2.88-3.95 6.19S16.9 163.2 16.9 164c-.01 1.31.62 1.39 6.63.83 3.66-.34 6.67-.34 6.68 0 .02.35-1.56 2.13-3.52 3.97s-7.3 5.91-11.87 9.05c-4.56 3.14-9.88 6.95-11.82 8.47-2.26 1.77-3.54 3.43-3.55 4.63-.02 1.02.82 2.7 1.86 3.71 1.04 1.02 2.54 1.86 3.34 1.87s4.06-1.66 7.26-3.71 5.98-3.63 6.19-3.52c.2.11.62 1.33.92 2.7.53 2.43.33 2.62-9.72 8.85-5.64 3.49-11.85 7.5-13.79 8.91-2.79 2.02-3.52 3.06-3.52 5.03-.01 1.75.67 3 2.27 4.21 1.26.94 3.12 1.87 4.15 2.07s2.71.55 3.73.79c1.03.23 3.08 1.53 4.57 2.9l2.69 2.49c-4.18 3.48-7.16 6.19-9.31 8.26-2.89 2.78-3.93 4.41-3.97 6.25-.04 1.37.7 3.52 1.62 4.77.97 1.3 2.49 2.29 3.56 2.3 1.02.01 2.35.29 2.95.62.8.46.26 1.68-2.14 4.76-1.78 2.28-3.67 4.98-4.2 6.01-.54 1.03-.98 2.43-.98 3.11 0 .99 1.2 1.25 5.81 1.25 3.19 0 5.79.28 5.78.62-.02.35-.75 2.68-1.64 5.19-.88 2.51-1.62 5.21-1.63 6.01-.02.8.9 1.83 2.04 2.29 1.14.45 2.08 1.11 2.09 1.45 0 .34-.55 2.49-1.24 4.77s-1.25 4.8-1.26 5.6c-.01.85.61 1.45 1.48 1.45.83 0 1.95-.47 2.51-1.04.8-.82 1-.69.96.63-.02.91.72 2.68 1.65 3.94.96 1.3 2.49 2.29 3.55 2.3 1.03 0 2.35.28 2.95.62.81.45.26 1.67-2.14 4.76-1.78 2.28-3.67 4.98-4.2 6.01-.54 1.02-.97 2.42-.97 3.11-.01.99 1.24 1.24 6.22 1.25h6.22l-3.33 9.54c3.54 3.57 5.12 4.59 5.81 4.58.68-.01 4.98-3.71 9.54-8.21 5.21-5.13 9.39-8.53 11.21-9.12 1.6-.52 4.68-.94 6.85-.93l3.94.01c-.03-22.79-.03-22.82 2.87-28.62 1.59-3.19 5.03-8.6 7.64-12.02s5.26-7.71 5.9-9.54c.63-1.82 2.07-9.85 3.2-17.83 1.12-7.99 2.98-18.25 4.12-22.82 1.14-4.56 2.91-9.95 3.93-11.98s2.97-4.36 4.34-5.18c1.37-.81 5.29-2.11 8.72-2.89 5.66-1.28 14.65-1.4 99.97-1.34 71.98.05 95.09.31 99.55 1.12 3.2.58 7.28 1.86 9.08 2.85 2.14 1.18 3.92 3.09 5.18 5.54 1.06 2.05 2.84 7.47 3.97 12.03 1.12 4.56 2.96 14.83 4.07 22.82 1.12 7.98 2.55 16.01 3.18 17.84.63 1.82 3.28 6.12 5.88 9.54 2.61 3.43 6.04 8.84 7.63 12.04 2.89 5.8 2.9 5.82 2.87 17.21l-.03 11.41c7.07 0 9.96.44 10.99.97s5.78 4.64 10.57 9.13 9.36 8.17 10.16 8.17 2.42-.84 3.61-1.86l2.15-1.87c-2.06-7.07-2.65-9.41-2.65-9.75.01-.34 2.62-.62 5.82-.62 4.61.01 5.81-.25 5.81-1.24 0-.68-.44-2.08-.97-3.11-.54-1.03-2.42-3.73-4.2-6.02-2.39-3.08-2.94-4.3-2.13-4.76.59-.33 1.92-.61 2.95-.62 1.06 0 2.59-.99 3.56-2.29.92-1.25 1.67-2.75 1.66-3.32-.02-.74.69-.85 2.48-.41 2.16.54 2.5.4 2.48-1.03-.02-.92-.55-3.53-1.18-5.81s-.9-4.55-.61-5.04c.3-.49 1.19-1.14 1.99-1.45s1.46-1.22 1.47-2.01c0-.8-.75-3.7-1.67-6.44-.93-2.73-1.68-5.07-1.67-5.18.01-.12 2.63-.21 5.82-.21 4.61.01 5.81-.25 5.81-1.24 0-.68-.44-2.08-.97-3.11-.53-1.02-2.42-3.73-4.19-6.01-2.4-3.09-2.95-4.31-2.14-4.76.6-.34 1.93-.62 2.95-.62 1.07-.01 2.6-1 3.56-2.3.93-1.25 1.68-3.12 1.66-4.14-.01-1.03-.4-2.62-.86-3.53-.45-.91-3.44-3.9-6.63-6.64l-5.8-4.98c5.56-4.61 7.93-5.82 9.13-5.8 1.14.02 3.38-.82 4.98-1.87 2.19-1.45 2.95-2.57 3.11-4.59.18-2.29-.29-3.03-3.32-5.22-1.93-1.4-8.13-5.42-13.77-8.93-10.05-6.24-10.25-6.42-9.71-8.86.3-1.37.72-2.58.93-2.69.21-.12 2.99 1.47 6.18 3.53 3.19 2.05 6.46 3.74 7.26 3.76.8.01 2.28-.83 3.3-1.87s1.86-2.73 1.87-3.75c.01-1.22-1.2-2.82-3.51-4.63-1.94-1.52-7.25-5.34-11.81-8.49-4.57-3.14-9.9-7.22-11.86-9.06-1.95-1.85-3.54-3.63-3.52-3.97.02-.35 3.03-.34 6.68 0 6.01.57 6.64.49 6.64-.83-.01-.79-1.87-4.25-4.15-7.67l-4.15-6.23c10.29 3.87 14.39 4.99 15.76 4.99s2.51-.28 2.53-.62-1.38-1.95-3.11-3.57c-1.73-1.61-5.76-4.42-8.95-6.22-3.19-1.81-11.96-6.48-19.49-10.37-12.53-6.49-13.66-7.26-13.43-9.14.14-1.12 2.63-5.22 5.55-9.1 2.91-3.87 5.88-8.44 6.6-10.15.71-1.71 1.3-3.3 1.3-3.53s-1.31-.41-2.91-.42c-1.59 0-6.07 1.12-9.95 2.49-3.88 1.36-7.52 2.23-8.09 1.92-.57-.3-3.09-2.34-5.6-4.53-2.51-2.18-5.21-3.99-6.01-4.01s-2.6.81-4.01 1.83c-1.55 1.14-3.59 1.81-5.19 1.72-1.44-.07-5.43-1.45-8.85-3.04-3.42-1.6-8.08-3.37-10.36-3.94-2.66-.66-6.46-.83-10.58-.49-3.54.3-6.43.26-6.42-.08 0-.34 1.33-2.3 2.94-4.36 1.62-2.05 2.82-4.29 2.67-4.97-.15-.73-1.12-1.21-2.32-1.17-1.13.04-3.08.32-4.33.62-2.04.48-2.24.34-1.92-1.32.21-1.03.58-3.27.84-4.98.32-2.18.15-3.12-.58-3.13-.57-.01-2.02 1.02-3.22 2.28s-2.74 3.42-3.41 4.79c-.68 1.36-1.75 2.71-2.38 2.98-.64.28-3.77-.12-6.96-.88l-5.81-1.37c-18.65 6.17-24.72 7.96-25.51 7.96-.81-.01-3.3-2.41-5.6-5.4-3.47-4.52-4.55-5.4-6.63-5.4-1.37 0-3.33-.38-4.36-.85-1.03-.46-3.36-2.78-5.18-5.15-1.82-2.38-4.99-7.48-7.05-11.35-2.05-3.87-4.14-7.17-4.66-7.34-.51-.16-1.57.55-2.36 1.59Z\"/>",
        "bald": "",
        "blowoutFade": "<defs><linearGradient id=\"a\" x1=\"200\" x2=\"200\" y1=\"100\" y2=\"310\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"rgba(0,0,0,.5)\"/><stop offset=\"1\" stop-color=\"rgba(0,0,0,.25)\"/></linearGradient></defs><path d=\"M60 310H50v-10c0-140 50-200 150-200s150 60 150 200v10h-10v-20c0-5-10-20-15-25s-5-55-15-65c-40-40-60 0-110 0s-70-40-110 0c-10 10-10 60-15 65s-15 20-15 25z\" style=\"fill:url(#a);stroke:none\"/><path fill=\"$[hairColor]\" stroke=\"#000\" stroke-width=\"4\" d=\"M198.45 65.22c-.9 1.22-1.58 3.59-1.5 5.25.07 1.67.82 4.83 1.66 7.03s1.72 4.79 1.96 5.75c.28 1.16-.16 1.76-1.32 1.77-.96.01-2.65-.65-3.75-1.47s-2.68-1.52-3.5-1.55c-.82-.04-2.4.86-3.5 2s-2.56 2.05-3.25 2.03-1.36-1.48-1.5-3.26c-.23-2.99-.58-3.28-4.75-4.01-2.49-.43-5.62-1.84-7-3.15-1.37-1.3-4.42-3.65-6.77-5.23-3.84-2.59-4.54-2.75-7-1.61-1.5.69-4.02 2.27-5.59 3.5l-2.86 2.23C159.25 93.49 161.55 99 161 99s-4.71-2.02-9.25-4.48-9.04-4.49-10-4.5-1.96.32-2.21.73.65 2.44 2 4.5S144 99.22 144 99.5s-3.15.5-7 .5c-4.79 0-8.66.67-12.25 2.1-2.89 1.16-7.28 2.72-9.75 3.47-3.87 1.17-4.81 1.16-6.75-.1-1.24-.81-2.81-1.46-3.5-1.45s-3.39 1.81-6 4L94 112c-8.91-3.12-12.96-4.02-14.75-4.02L76 108c2.91 5.81 5.6 10.42 7.86 14s3.89 6.84 3.62 7.25c-.26.41-3.74.76-7.73.77l-7.25.03c-26.19 15.07-35.64 21.12-37.9 23.16l-4.1 3.71c4.26.06 7.75-.82 10.5-1.92s5-1.55 5-1-1.36 3.14-3.01 5.75c-1.66 2.61-3.01 5.31-3 6 .01.91 1.51 1.11 5.51.75 3.02-.28 5.52-.16 5.54.25s-1.91 2.55-4.3 4.75c-2.4 2.2-8.26 7.04-13.05 10.75-5.77 4.49-8.69 7.42-8.69 8.75 0 1.1.68 2.68 1.5 3.5s2.06 1.51 2.75 1.51c.69.01 3.39-1.34 6-3 2.61-1.65 5.2-3.01 5.75-3.01s1.01.79 1.03 1.75c.01.96-1 2.69-2.25 3.85-1.26 1.15-6.47 4.97-11.59 8.5-5.12 3.52-9.51 7.19-9.75 8.15s.01 2.65.56 3.75c.57 1.14 3.05 2.63 5.75 3.46 2.61.81 5.65 2.4 6.75 3.54l2 2.07c-9.94 9.89-11.48 12.17-11.49 14.18-.01 1.85.89 3.42 2.74 4.79 1.51 1.12 3.2 2.16 3.75 2.32.55.15-.45 2.5-2.23 5.21-1.77 2.71-3.23 5.72-3.25 6.68-.02 1.41.85 1.75 4.48 1.75 3.33 0 4.5.39 4.5 1.5 0 .82-.56 3.51-1.25 5.98-1.15 4.11-1.09 4.59.75 5.9 1.83 1.3 1.9 1.83.84 6.27-.64 2.67-.98 5.19-.75 5.6.22.41 1.31.52 2.41.25 1.52-.38 2.12.1 2.5 2 .33 1.67 13.5 2.5 13.5 2.5s0-30 20-50c10-10 13.87-20.43 14.92-24 1.08-3.65 3.16-7.87 4.75-9.62 1.72-1.9 4.99-3.82 8.33-4.89 5.08-1.64 12.59-1.79 97.5-2.01 50.8-.14 95.14.16 99 .66 3.85.5 9.02 1.91 11.48 3.13 2.47 1.23 5.26 3.58 6.22 5.23.95 1.65 2.65 6.6 3.78 11C317.1 223.9 320 230 330 240c20 20 19.45 51.1 20 50s15.9-4 17-4c1.84 0 1.95-.46 1.38-5.75-.49-4.62-.29-6 1-7 1.48-1.14 1.49-1.7.06-6.5-1.28-4.29-1.33-5.38-.25-5.98.72-.41 3-.75 5.06-.75 3.41-.02 3.69-.23 3.11-2.27-.35-1.24-1.92-4.16-3.5-6.5-1.57-2.34-2.75-4.38-2.61-4.55.14-.16 1.49-.84 3-1.5s3.13-2.21 3.6-3.45.61-3.15.32-4.25c-.3-1.1-2.93-4.36-5.86-7.25L367 225c5.04-3.75 7.63-5.1 9-5.42 1.38-.32 3.31-1.36 4.29-2.33 1-.98 1.66-2.84 1.5-4.22-.22-1.88-2.9-4.27-11.29-10.07-8.94-6.18-11.05-8.11-11.25-10.28-.14-1.47.09-2.67.5-2.66.41.02 2.89 1.37 5.5 3 2.61 1.64 5.48 2.87 6.38 2.73s2.24-1.15 2.99-2.25c1.13-1.67 1.13-2.33.02-4-.73-1.1-6.01-5.65-11.73-10.11-5.73-4.46-11.31-9.09-12.41-10.28l-2-2.18c10.58.06 11.5-.21 11.47-1.68-.01-.96-1.36-3.89-3-6.5-1.63-2.61-2.63-4.76-2.22-4.77.41 0 3.45.9 6.75 2.01s6.36 1.68 6.81 1.26c.45-.41-1.19-2.55-3.64-4.75s-10.45-7.37-17.78-11.5c-7.32-4.12-14.23-8.24-15.35-9.15-1.97-1.6-1.98-1.76-.31-5 .95-1.84 3.55-6.27 5.77-9.85s4.03-7.06 4.02-7.75-1.03-1.25-2.27-1.26c-1.24 0-5.18.93-8.75 2.09l-6.5 2.09c-7.36-6.33-9.95-8.17-10.5-8.17s-2.19.79-3.64 1.75c-2.23 1.48-3.2 1.57-6.25.6-1.99-.63-6.31-2.31-9.61-3.72-4.44-1.91-7.75-2.59-12.75-2.61-3.71-.01-6.74-.36-6.73-.77s.9-1.87 1.98-3.25c1.08-1.37 1.97-3.29 1.98-4.25.02-1.47-.59-1.65-3.73-1.14l-3.75.61c1.16-7.15 1.16-9.23.75-9.25-.41-.01-1.71 1-2.88 2.25-1.16 1.26-2.63 3.29-3.25 4.53-.75 1.51-2.02 2.25-3.87 2.25-1.51 0-4.1-.41-5.75-.92-2.44-.75-5.1-.19-14.25 3-6.19 2.16-11.7 3.7-12.25 3.42s-2.46-2.52-4.25-4.98c-2.4-3.31-4.1-4.62-6.5-5-2.11-.34-4.22-1.72-6-3.93-1.51-1.88-4.57-7.06-6.8-11.5-2.22-4.45-4.34-8.09-4.7-8.09s-1.39 1-2.3 2.22Z\"/>",
        "cornrows": "<defs><linearGradient id=\"a\" x1=\"200\" x2=\"200\" y1=\"100\" y2=\"310\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"rgba(0,0,0,.3)\"/><stop offset=\"1\" stop-color=\"rgba(0,0,0,0)\"/></linearGradient></defs><path d=\"M60 310H50v-10c0-140 50-200 150-200s150 60 150 200v10h-10v-20c0-5-10-20-15-25s-5-45-15-55-60 0-110 0-100-10-110 0-10 50-15 55-15 20-15 25z\" style=\"fill:url(#a);stroke:none\"/><path fill=\"$[hairColor]\" stroke=\"#000\" stroke-width=\"4\" d=\"M195 200h-10V100h10zm10 0h10V100h-10v100m20 0h10V100h-10v100m20 0h10v-95h-10zm20-5h10v-85h-10zm20 0h10v-75h-10zm20-5h10v-50h-10zm20 5h10v-20h-10v20m-150 5h-10V100h10zm-20 0h-10v-95.13h10zm-20-5v-85.15h-10V195zm-20 0v-75h-10v75zm-20-5H85v-50h10zm-20 5H65v-20h10z\"/>",
        "crop-fade": "<defs><linearGradient id=\"a\" x1=\"200\" x2=\"200\" y1=\"100\" y2=\"310\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"rgba(0,0,0,.25)\"/><stop offset=\"1\" stop-color=\"rgba(0,0,0,0)\"/></linearGradient></defs><path d=\"M60 310H50v-10c0-140 50-200 150-200s150 60 150 200v10h-10v-20c0-5-10-20-15-25s-5-55-15-65c-40-40-60 0-110 0s-70-40-110 0c-10 10-10 60-15 65s-15 20-15 25z\" style=\"fill:url(#a);stroke:none\"/><path fill=\"$[hairColor]\" stroke=\"#000\" stroke-width=\"4\" d=\"M200 95c120 0 140 90 140 115-20 0-20 5-25 0s-15-15-50-15c-15 0-40 5-65 5s-50-5-65-5c-35 0-45 10-50 15s-5 0-25 0c0-25 25-115 140-115Z\"/>",
        "crop-fade2": "<defs><linearGradient id=\"a\" x1=\"200\" x2=\"200\" y1=\"100\" y2=\"310\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"rgba(0,0,0,.25)\"/><stop offset=\"1\" stop-color=\"rgba(0,0,0,0)\"/></linearGradient></defs><g style=\"opacity:1;stroke-width:1;stroke-miterlimit:4;stroke-dasharray:none\"><path d=\"M60 310H50v-10c0-140 50-200 150-200s150 60 150 200v10h-10v-20c0-5-10-20-15-25s-5-55-15-65c-40-40-56.429-38.095-106.429-38.095S130 160 90 200c-10 10-10 60-15 65s-15 20-15 25z\" style=\"fill:url(#a);stroke:none;stroke-width:1;stroke-miterlimit:4;stroke-dasharray:none\"/></g><path fill=\"$[hairColor]\" stroke=\"#000\" stroke-width=\"4\" d=\"M200 95c120 0 140 90 140 115-20 0-20 5-25 0s-14.444-11.112-49.444-11.112c-15 0-39.96-.317-64.96-.317s-50.04.317-65.04.317C100.556 198.888 90 205 85 210s-5 0-25 0c0-25 25-115 140-115Z\"/>",
        "crop": "<path fill=\"$[hairColor]\" stroke=\"#000\" stroke-width=\"4\" d=\"M200 95c120 0 140 90 140 115-20 0-20 5-25 0s-15-15-50-15c-15 0-40 5-65 5s-50-5-65-5c-35 0-45 10-50 15s-5 0-25 0c0-25 25-115 140-115Z\"/>",
        "curly": "<path fill=\"$[hairColor]\" stroke=\"#000\" stroke-width=\"4\" d=\"M182.42 68.88c-.3 1.02-.72 3.3-.94 5.06-.4 3.11-.51 3.17-6.13 2.9-3.15-.15-6.6.2-7.67.78-1.06.58-1.89 1.75-1.84 2.62s1.47 2.86 3.15 4.43 3.91 4.48 4.97 6.46c1.05 1.97 1.94 4.27 1.99 5.11.05.98-1.1 1.63-3.2 1.82-1.8.17-3.81.86-4.48 1.51-.67.67-1.46.87-1.75.45-.3-.41-.15-2.23.31-4.05.45-1.82.75-4.35.66-5.62-.08-1.28-1.22-2.99-2.52-3.82-2.06-1.32-2.6-1.32-4.28 0-1.06.82-2.38 1.49-2.94 1.49-.55-.01-1.52-1.04-2.15-2.3-.76-1.56-2.47-2.58-5.21-3.15-3.71-.76-4.29-.56-6.67 2.27-2.29 2.71-3.14 3.03-6.69 2.56-2.83-.38-4.05-.15-4.03.75.01.71 1 2.56 2.2 4.11 1.19 1.54 2.21 3.16 2.25 3.57.03.42-.84 1.67-1.95 2.78-1.12 1.1-1.76 2.57-1.43 3.27.34.69-.4 1.93-1.63 2.76-1.23.82-2.81 1.47-3.52 1.47-.7-.02-1.07-.69-.82-1.52.26-.83-.16-2.88-.93-4.58-1.1-2.49-1.82-2.99-3.65-2.56-1.69.4-2.41.02-2.84-1.49-.34-1.19-1.42-2.04-2.61-2.06-1.11-.01-2.91.89-3.99 1.99-1.41 1.43-2.77 1.82-4.78 1.39-2.05-.46-3.34-.07-4.79 1.44-1.09 1.15-1.66 2.65-1.27 3.34.4.72-.76 2.86-2.7 4.97-1.88 2.02-3.42 4.13-3.41 4.67.01.55-.67.98-1.52.97s-1.76-.47-2.06-1.02c-.29-.55-1.33-1-2.31-.99-.98 0-2.34.76-3.01 1.68-.68.92-1.23 2.9-1.23 4.39 0 1.96-.72 2.98-2.56 3.66l-2.55.94c4.8 4.65 6.2 6.44 6.2 6.98 0 .53.93.99 2.06 1.01s2.3.81 2.6 1.75c.29.94.3 1.82.01 1.95s-1.34-.16-2.33-.65c-1.09-.53-2.83-.51-4.37.06-1.41.52-4.31.85-6.42.75-2.11-.11-3.85.24-3.84.78 0 .54-.81.72-1.8.38-1.3-.42-2.56.55-4.65 3.58-1.57 2.29-2.62 4.71-2.3 5.38.3.68 2.19 2.03 4.19 3 2.54 1.24 3.54 2.31 3.32 3.6-.17 1.01-1.09 2.3-2.05 2.88-1.33.8-2.21.64-3.84-.69-2-1.67-2.23-1.65-5.22.39-2.12 1.45-2.94 2.68-2.56 3.85.32.94-.13 2.24-1 2.89-.86.66-1.56 1.74-1.53 2.41.02.67.96 1.77 2.09 2.45 1.8 1.1 1.86 1.39.5 2.43-1.18.91-1.5 2.88-1.33 8.24.19 6.12-.09 7.4-2.16 9.88-1.79 2.19-3.24 2.89-6.01 2.97-2.56.07-4.18.78-5.46 2.39-1.27 1.6-1.63 3.16-1.21 5.2.33 1.6 1.36 3.48 2.3 4.18.94.69 1.56 2 1.39 2.91-.18.9-.07 2.61.24 3.81.3 1.19 1.21 2.17 2.03 2.16.87 0 1.47.89 1.47 2.17 0 1.2-.75 3.26-1.65 4.59-1.29 1.9-1.5 3.6-1 7.96.39 3.47.26 5.53-.35 5.54-.53 0-1.19 1.1-1.45 2.42-.32 1.62-1.13 2.42-2.4 2.44-1.54.02-1.84.54-1.54 2.67.21 1.45-.16 4.82-.82 7.48-.65 2.65-1.12 8.36-1.04 12.68.06 4.31.47 8.19.9 8.63.42.42 1.16.02 1.64-.91.46-.93 1.28-1.71 1.8-1.71.51-.01.95.95.95 2.14.01 1.19-.58 3.89-1.31 6.02-1.03 2.96-1.14 5.52-.52 11.03.45 3.95 1.34 9.05 1.98 11.34.65 2.3 1.69 4.55 2.32 5.01.78.57 1.47.13 2.15-1.33.68-1.49 1.63-2.07 3.02-1.85 1.65.27 2.39-.51 3.94-4.13 1.06-2.45 2.26-4.46 2.64-4.47.39-.01.92 1.08 1.15 2.39.24 1.33 1.07 2.4 1.86 2.4.78-.01 1.43-.35 1.45-.75.03-.39.7-1.6 1.49-2.67 1.44-1.94 1.46-1.93 2.82.21.76 1.19 1.91 2.17 2.57 2.18.66.02 1.74-1.2 2.42-2.69.67-1.49 1.66-5.57 2.19-9.03.52-3.45.96-10.08.94-14.71-.01-5.63.53-9.9 1.66-12.98.95-2.58 1.48-5.92 1.2-7.67-.27-1.7.04-4.93.71-7.17s1.64-4.83 2.16-5.75c.53-.93.98-2.11.99-2.64.02-.52 1.97-3.44 4.34-6.48 3.87-4.92 4.27-5.92 3.77-9.3-.4-2.64-.16-3.99.79-4.48.75-.37 2.53-.47 3.95-.19 1.62.3 3.19-.07 4.19-1.01.88-.82 2.78-1.73 4.22-2.01 1.46-.29 4.56-2.22 6.91-4.31 3.95-3.49 4.75-3.8 10.09-3.86 3.21-.04 6.54-.46 7.42-.94 1.12-.6 1.98-.39 2.82.69 1.04 1.32 3.27 1.55 14.31 1.45 11.35-.11 13.53.12 16.23 1.7 2.25 1.33 5.18 1.88 10.59 1.98 4.1.09 9.37.22 11.7.29 2.33.08 12.07-.26 21.6-.76 9.48-.47 18.93-.82 21.05-.78 2.47.05 5.06-.68 7.2-2.03 2.94-1.87 4.7-2.13 15.95-2.36 9.32-.18 12.8-.58 13.89-1.59 1.16-1.08 3.12-1.23 9.46-.73 7.44.61 8.1.84 11.54 4.16 1.98 1.94 4.34 3.54 5.24 3.56.9 0 2.89.88 4.42 1.93s3.6 1.71 4.61 1.46 2.65-.23 3.65.05c1.54.42 1.73 1.02 1.25 4.03-.53 3.2-.18 4.09 3.66 9.3 2.29 3.19 4.75 7.31 5.47 9.17.72 1.87 1.7 4.47 2.17 5.8s1.09 5.45 1.37 9.16c.25 3.71 1.13 8.08 1.97 9.71 1.1 2.13 1.38 4.68 1.04 9.24-.31 3.72.03 9.54.82 14.18.73 4.34 1.39 9.22 1.48 10.85.08 1.63.9 3.75 1.82 4.72 1.61 1.68 1.75 1.66 3.36-.68.91-1.33 1.96-2.41 2.34-2.4.37.01 1.28 1.35 2 2.99.72 1.61 1.76 2.73 2.3 2.47.53-.25 1.07-1.56 1.19-2.9.11-1.33.52-2.43.89-2.42s1.54 2.04 2.6 4.52c1.56 3.57 2.36 4.37 3.86 3.95 1.4-.38 2.15.16 2.96 2.15 1.07 2.53 1.16 2.57 2.19.74.58-1.05 1.47-7.51 1.94-14.35.67-10.34.58-12.98-.47-15.62-.7-1.76-1.22-4.49-1.17-6.07.05-1.59.45-2.87.89-2.84.45.02.88.56.98 1.2.1.63.63.88 1.19.54.74-.44.99-3.08.92-9.5-.06-4.9-.48-9.91-.94-11.13s-.8-3.95-.76-6.07c.06-2.84-.27-4-1.25-4.42-.74-.31-1.75-1.67-2.26-3.02s-1.19-2.46-1.51-2.49c-.32-.02-.4-2.08-.18-4.58.31-3.59-.03-5.54-1.6-9.22l-2.02-4.65c3.03-2.56 4.54-5.7 5.57-9.2 1.28-4.42 1.55-6.51.99-7.96-.42-1.08-1.47-2.41-2.33-2.97-.88-.55-2.49-1.02-3.61-1.05-1.11-.02-2.21-.48-2.43-1.02-.22-.53.33-1.16 1.23-1.42.9-.25 1.64-1.21 1.65-2.14.01-.92.48-3.05 1.04-4.72.86-2.55.83-3.32-.18-4.72-.67-.93-2.53-2.4-4.14-3.28-2.26-1.23-3.26-2.6-4.32-5.93-.76-2.4-1.87-5.76-2.46-7.48-.59-1.73-1.47-3.14-1.96-3.14-.48.01-1.53-.75-2.35-1.67-1.41-1.61-1.6-1.61-3.99.02-2.14 1.45-2.52 1.49-2.56.25-.02-.78-.86-1.64-1.86-1.91-1-.26-1.64-1-1.42-1.67.21-.67 1.79-1.98 3.51-2.92 1.71-.94 3.3-2.38 3.52-3.18.22-.79-.66-3.41-1.99-5.79-1.68-3.01-3.22-4.51-4.99-4.92-1.41-.31-4.02-.27-5.8.08-3.11.63-3.29.51-4.84-3.31l-1.63-3.97c4.56-4.08 5.87-5.6 5.85-6-.03-.4-.69-.72-1.47-.71-.77.01-1.9-1.07-2.5-2.42-1-2.28-1.39-2.39-5.59-1.71-2.48.4-5.96 1.79-7.74 3.09-1.77 1.29-4.19 2.35-5.39 2.35-1.2-.01-2.19-.22-2.21-.49-.02-.28.5-2.16 1.15-4.19.67-2.09 2.42-4.48 4-5.48 1.54-.98 2.78-2.33 2.75-3.02-.02-.68-.98-2.01-2.13-2.95-1.78-1.47-1.93-2.03-1-3.8.93-1.78.79-2.29-.96-3.52-1.13-.8-3.04-1.43-4.26-1.41s-2.83 1.07-3.59 2.33l-1.37 2.27c-3.88-4.5-5.65-5.47-7.42-5.46-1.49.01-3.57.47-4.62 1.04-1.04.57-2.47 2.4-3.15 4.07s-1.17 3.93-1.09 5.03c.1 1.22-.51 2.02-1.56 2.06-1.04.03-3.2-2.05-5.41-5.21l-3.69-5.32c4.28-4.77 5.48-6.97 5.41-7.96-.07-1.08-1.24-2.14-2.91-2.65-1.56-.48-4.33-.44-6.22.07-2.62.73-3.79.58-5.03-.63-.88-.85-1.96-1.58-2.37-1.59-.41-.02-1.56 1.03-2.56 2.32l-1.81 2.33c-4.59-4.37-6.94-5.65-8.18-5.66s-2.53.73-2.87 1.64c-.34.9-2.39 1.97-4.56 2.36-3.58.65-3.94 1.03-3.93 4.07.01 1.88-.63 3.56-1.45 3.85-.8.29-1.93.3-2.5.01-.58-.28-.9-2.01-.73-3.86.28-2.86-.09-3.59-2.44-4.92-2.25-1.27-3.11-1.32-4.61-.25-1.56 1.1-1.96 1.02-2.62-.52-.43-1-.37-3.72.14-6.04.82-3.8.7-4.38-1.02-5.6-1.07-.74-2.28-1.35-2.69-1.34s-.7.74-.63 1.63c.06.88-.57 1.6-1.39 1.6s-1.75-.48-2.07-1.07c-.33-.58-1.7-1.07-3.08-1.07-1.56 0-2.46.61-2.39 1.61.07.88-.55 1.83-1.35 2.13-.8.29-2.63-.18-4.07-1.07-1.44-.88-2.66-2.31-2.73-3.2-.06-.89-.79-1.61-1.62-1.61-.84 0-1.78.85-2.07 1.88Z\"/>",
        "curly2": "<path fill=\"$[hairColor]\" stroke=\"#000\" stroke-width=\"4\" d=\"M198.45 65.22c-.9 1.22-1.58 3.59-1.5 5.25.07 1.67.82 4.83 1.66 7.03s1.72 4.79 1.96 5.75c.28 1.16-.16 1.76-1.32 1.77-.96.01-2.65-.65-3.75-1.47s-2.68-1.52-3.5-1.55c-.82-.04-2.4.86-3.5 2s-2.56 2.05-3.25 2.03-1.36-1.48-1.5-3.26c-.23-2.99-.58-3.28-4.75-4.01-2.49-.43-5.62-1.84-7-3.15-1.37-1.3-4.42-3.65-6.77-5.23-3.84-2.59-4.54-2.75-7-1.61-1.5.69-4.02 2.27-5.59 3.5l-2.86 2.23C159.25 93.49 161.55 99 161 99s-4.71-2.02-9.25-4.48-9.04-4.49-10-4.5-1.96.32-2.21.73.65 2.44 2 4.5S144 99.22 144 99.5s-3.15.5-7 .5c-4.79 0-8.66.67-12.25 2.1-2.89 1.16-7.28 2.72-9.75 3.47-3.87 1.17-4.81 1.16-6.75-.1-1.24-.81-2.81-1.46-3.5-1.45s-3.39 1.81-6 4L94 112c-8.91-3.12-12.96-4.02-14.75-4.02L76 108c2.91 5.81 5.6 10.42 7.86 14s3.89 6.84 3.62 7.25c-.26.41-3.74.76-7.73.77l-7.25.03c-26.19 15.07-35.64 21.12-37.9 23.16l-4.1 3.71c4.26.06 7.75-.82 10.5-1.92s5-1.55 5-1-1.36 3.14-3.01 5.75c-1.66 2.61-3.01 5.31-3 6 .01.91 1.51 1.11 5.51.75 3.02-.28 5.52-.16 5.54.25s-1.91 2.55-4.3 4.75c-2.4 2.2-8.26 7.04-13.05 10.75-5.77 4.49-8.69 7.42-8.69 8.75 0 1.1.68 2.68 1.5 3.5s2.06 1.51 2.75 1.51c.69.01 3.39-1.34 6-3 2.61-1.65 5.2-3.01 5.75-3.01s1.01.79 1.03 1.75c.01.96-1 2.69-2.25 3.85-1.26 1.15-6.47 4.97-11.59 8.5-5.12 3.52-9.51 7.19-9.75 8.15s.01 2.65.56 3.75c.57 1.14 3.05 2.63 5.75 3.46 2.61.81 5.65 2.4 6.75 3.54l2 2.07c-9.94 9.89-11.48 12.17-11.49 14.18-.01 1.85.89 3.42 2.74 4.79 1.51 1.12 3.2 2.16 3.75 2.32.55.15-.45 2.5-2.23 5.21-1.77 2.71-3.23 5.72-3.25 6.68-.02 1.41.85 1.75 4.48 1.75 3.33 0 4.5.39 4.5 1.5 0 .82-.56 3.51-1.25 5.98-1.15 4.11-1.09 4.59.75 5.9 1.83 1.3 1.9 1.83.84 6.27-.64 2.67-.98 5.19-.75 5.6.22.41 1.31.52 2.41.25 1.52-.38 2.12.1 2.5 2 .33 1.67 1.5 2.83 3.5 3.5 1.65.55 3 1.23 3 1.5s-1.3 2.41-2.89 4.75-3.05 5.15-3.25 6.25c-.32 1.77.25 2.03 4.89 2.25 2.89.14 5.26.36 5.27.5s-.64 2.05-1.44 4.25c-1.39 3.79-1.35 4.12.73 6.23 1.2 1.22 2.64 2.23 3.19 2.24s3.59-2.57 6.76-5.73l5.76-5.74L62 284c5.76-9.69 8.62-13.85 10.07-15.5s3.15-4.01 3.78-5.25 2.5-10.91 4.15-21.5c1.66-10.59 3.87-22.18 4.92-25.75 1.08-3.65 3.16-7.87 4.75-9.62 1.72-1.9 4.99-3.82 8.33-4.89 5.08-1.64 12.59-1.79 97.5-2.01 50.8-.14 95.14.16 99 .66 3.85.5 9.02 1.91 11.48 3.13 2.47 1.23 5.26 3.58 6.22 5.23.95 1.65 2.65 6.6 3.78 11 1.12 4.4 3.17 15.54 4.53 24.75 1.37 9.21 3.17 18.1 3.99 19.75s1.95 3.23 2.5 3.5 3.26 3.99 6.03 8.25l5.04 7.75-.09 24c8.93 8.9 12.2 11.49 13.02 11.51.82.01 2.32-.55 3.33-1.24 1.63-1.13 1.71-1.77.69-5.77-.91-3.59-.88-4.65.17-5.23.72-.41 3-.75 5.06-.75 2.32-.01 3.75-.5 3.76-1.27 0-.69-1.57-3.73-3.49-6.75l-3.51-5.5c4.64-1.94 6.44-3.4 6.99-4.5s1.9-2 3-2c1.84 0 1.95-.46 1.38-5.75-.49-4.62-.29-6 1-7 1.48-1.14 1.49-1.7.06-6.5-1.28-4.29-1.33-5.38-.25-5.98.72-.41 3-.75 5.06-.75 3.41-.02 3.69-.23 3.11-2.27-.35-1.24-1.92-4.16-3.5-6.5-1.57-2.34-2.75-4.38-2.61-4.55.14-.16 1.49-.84 3-1.5s3.13-2.21 3.6-3.45.61-3.15.32-4.25c-.3-1.1-2.93-4.36-5.86-7.25L367 225c5.04-3.75 7.63-5.1 9-5.42 1.38-.32 3.31-1.36 4.29-2.33 1-.98 1.66-2.84 1.5-4.22-.22-1.88-2.9-4.27-11.29-10.07-8.94-6.18-11.05-8.11-11.25-10.28-.14-1.47.09-2.67.5-2.66.41.02 2.89 1.37 5.5 3 2.61 1.64 5.48 2.87 6.38 2.73s2.24-1.15 2.99-2.25c1.13-1.67 1.13-2.33.02-4-.73-1.1-6.01-5.65-11.73-10.11-5.73-4.46-11.31-9.09-12.41-10.28l-2-2.18c10.58.06 11.5-.21 11.47-1.68-.01-.96-1.36-3.89-3-6.5-1.63-2.61-2.63-4.76-2.22-4.77.41 0 3.45.9 6.75 2.01s6.36 1.68 6.81 1.26c.45-.41-1.19-2.55-3.64-4.75s-10.45-7.37-17.78-11.5c-7.32-4.12-14.23-8.24-15.35-9.15-1.97-1.6-1.98-1.76-.31-5 .95-1.84 3.55-6.27 5.77-9.85s4.03-7.06 4.02-7.75-1.03-1.25-2.27-1.26c-1.24 0-5.18.93-8.75 2.09l-6.5 2.09c-7.36-6.33-9.95-8.17-10.5-8.17s-2.19.79-3.64 1.75c-2.23 1.48-3.2 1.57-6.25.6-1.99-.63-6.31-2.31-9.61-3.72-4.44-1.91-7.75-2.59-12.75-2.61-3.71-.01-6.74-.36-6.73-.77s.9-1.87 1.98-3.25c1.08-1.37 1.97-3.29 1.98-4.25.02-1.47-.59-1.65-3.73-1.14l-3.75.61c1.16-7.15 1.16-9.23.75-9.25-.41-.01-1.71 1-2.88 2.25-1.16 1.26-2.63 3.29-3.25 4.53-.75 1.51-2.02 2.25-3.87 2.25-1.51 0-4.1-.41-5.75-.92-2.44-.75-5.1-.19-14.25 3-6.19 2.16-11.7 3.7-12.25 3.42s-2.46-2.52-4.25-4.98c-2.4-3.31-4.1-4.62-6.5-5-2.11-.34-4.22-1.72-6-3.93-1.51-1.88-4.57-7.06-6.8-11.5-2.22-4.45-4.34-8.09-4.7-8.09s-1.39 1-2.3 2.22Z\"/>",
        "curly3": "<path fill=\"$[hairColor]\" stroke=\"#000\" stroke-width=\"4\" d=\"M180.58 65.5c-.32.83-3.05 2.63-6.08 4-3.03 1.38-7.13 2.5-9.13 2.5-2.82 0-4.42.79-7.13 3.5-2.77 2.77-4.29 3.5-7.3 3.5-2.09 0-4.5.67-5.37 1.5-1.4 1.34-1.79 1.28-3.57-.5-1.1-1.1-2.68-2-3.5-2s-1.78.4-2.12.88c-.35.49-2.71.88-5.25.88-2.55-.01-6.43.77-8.63 1.72l-4 1.72L120 94c-10.02-.48-10.52-.29-11.71 2.25-.88 1.88-1.68 2.48-2.54 1.89-.69-.48-2.49-1.15-4-1.5S99 95.33 99 94.5s-.69-1.84-1.53-2.25c-.99-.49-2.02-.06-2.97 1.25-.79 1.1-1.23 2.56-.97 3.25s.02 1.47-.53 1.75-.99 1.51-.97 2.75-.63 3.6-1.45 5.25c-.81 1.65-1.27 3.34-1.03 3.75.25.41-.11.78-.8.81s-3.05.26-5.25.5c-2.2.25-5.01 1.12-6.25 1.95-1.24.82-2.25 2.16-2.25 2.99s-1.46 2.46-3.25 3.64c-2.39 1.57-4.05 1.96-6.25 1.47s-4.19-.02-7.5 1.77c-2.48 1.34-5.06 3.16-5.75 4.03-1.01 1.29-.97 1.87.25 3.09 1.33 1.33 1.33 1.69-.01 3.25-.83.96-1.25 2.43-.94 3.25.41 1.05-1 2.35-4.74 4.35-2.92 1.57-7.03 4.49-9.12 6.5-2.1 2.01-4.64 5-5.64 6.65-1.01 1.65-3 3.34-4.44 3.75S25 159.68 25 160.5s.39 2.29.87 3.25 1.15 3.44 1.5 5.5c.6 3.59.52 3.73-1.87 3.25-2.15-.43-2.77.09-4.47 3.75-1.91 4.14-1.92 4.32-.12 6.75 1.01 1.38 2.57 3.06 3.46 3.75 1.45 1.11 1.46 1.42.13 2.75-.82.82-1.5 2.18-1.5 3s.9 1.72 2 2c1.52.38 2 1.33 2 4 0 1.93-.45 3.5-1 3.5s-1.5 1.01-2.1 2.25c-.82 1.66-.8 2.77.08 4.25.96 1.64.71 3.12-1.4 8.25-2.37 5.74-2.46 6.45-1.08 8.75.82 1.38 2.59 3.06 3.93 3.75 2.33 1.2 2.36 1.34.75 3.59-1.15 1.6-1.33 2.54-.58 3 .6.36 1.05 1.45 1 2.41-.06.96-.66 1.75-1.35 1.75-.8 0-.99.63-.53 1.75.58 1.39.38 1.6-1 1-1.21-.53-2.02-.15-2.72 1.25q-1.005 1.995 0 7.5c.7 3.87 1.67 5.95 3.25 7.01 1.24.83 3.26 1.5 4.5 1.5 1.24-.01 2.48.44 2.75.99s.05 1.23-.5 1.5-1 2.52-1 5c0 4.3.12 4.49 2.75 4.25 2.39-.22 2.72.08 2.51 2.25-.14 1.38.41 3.18 1.22 4 1.23 1.25 1.27 2.05.25 4.76-.68 1.79-1.79 3.25-2.48 3.25-.69-.01-1.51 1.23-1.83 2.74-.36 1.72.02 3.6 1 5 .87 1.24 2.82 2.82 4.33 3.51 1.73.79 2.86 2.18 3.06 3.75.22 1.77-.48 3.07-2.41 4.49-1.58 1.16-2.44 2.52-2.06 3.25.47.89 3.98 1.25 12.16 1.25H60c0-20.92.18-21.84 3.25-27.82 1.79-3.48 4.92-8.43 6.96-11 2.05-2.58 4.37-5.8 5.17-7.18.79-1.37 2.85-11.95 4.56-23.5s3.44-22.37 3.84-24.05c.39-1.67 2.52-4.65 4.72-6.62 2.2-1.96 6.36-4.75 9.25-6.2s8.06-3.31 11.5-4.13c3.44-.83 10.97-1.79 16.75-2.13 7.69-.46 16.53 0 33 1.7 14.91 1.55 28.74 2.33 41 2.33s26.09-.78 41-2.33c16.47-1.7 25.31-2.16 33-1.7 5.77.34 13.31 1.3 16.75 2.13 3.44.82 8.61 2.69 11.5 4.15s7.15 4.27 9.47 6.25c3.98 3.39 4.31 4.09 5.75 12.1.83 4.68 2.42 15.36 3.52 23.75 1.11 8.39 2.7 16.49 3.55 18 .84 1.51 3.32 5 5.52 7.75 2.19 2.75 5.21 7.48 6.71 10.5 2.42 4.87 2.76 6.8 2.98 16.75L340 310l20.5-.5c-.28-3.87-.61-6.24-.93-7.75-.49-2.39-.04-3.08 3.43-5.25 2.2-1.37 4.23-3.4 4.5-4.5s.27-2.9 0-4-1.06-2-1.75-1.99c-.69 0-1.8-1.46-2.48-3.25-1.02-2.72-.98-3.51.28-4.76 1.05-1.05 1.29-2.4.79-4.5-.71-2.95-.67-2.99 2.47-2.25l3.19.75c0-6.98-.45-9.23-1-9.5s-.77-.95-.5-1.5 1.51-1 2.75-.99c1.24 0 3.26-.67 4.5-1.5 1.58-1.06 2.55-3.14 3.25-7.01q1.005-5.505 0-7.5c-.7-1.4-1.51-1.78-2.72-1.25-1.38.6-1.58.39-1-1 .5-1.21.26-1.75-.78-1.75-.82 0-1.51-.34-1.52-.75s.56-1.3 1.25-1.97c.8-.77 2.33-.95 4.14-.5 2.65.66 2.84.52 2.5-1.78-.3-2.02-.95-2.51-3.37-2.54-1.65-.02-3.68-.4-4.5-.86-1.19-.65-.83-1.21 1.75-2.71 1.79-1.04 3.7-2.79 4.25-3.89.76-1.52.38-3.51-1.58-8.25-2.11-5.13-2.36-6.61-1.4-8.25.88-1.48.9-2.59.08-4.25-.6-1.24-1.55-2.25-2.1-2.25s-1-1.57-1-3.5c0-2.67.48-3.62 2-4 1.1-.28 2-1.18 2-2s-.68-2.18-1.5-3c-1.33-1.33-1.32-1.64.13-2.75.89-.69 2.47-2.49 3.5-4 1.79-2.64 1.8-2.88.12-5.8-1-1.75-2.94-3.35-4.52-3.75-2.55-.64-2.72-.98-2.12-4.2.36-1.93 1.04-4.29 1.52-5.25s.87-2.43.87-3.25-1.17-1.84-2.61-2.25-3.43-2.1-4.44-3.75c-1-1.65-3.54-4.64-5.64-6.65-2.09-2.01-6.17-4.82-9.06-6.25-4.61-2.28-5.19-2.9-4.75-5.1.36-1.78.07-2.5-1-2.5-.82 0-1.79-.56-2.15-1.25s.2-1.82 1.25-2.53c1.42-.96 1.65-1.67.9-2.87-.55-.88-3.12-2.78-5.71-4.22-4.01-2.24-5.01-2.44-6.75-1.38-1.68 1.03-2.69.94-5.79-.5-2.06-.96-4.05-2.2-4.41-2.75-.37-.55-.48-1.56-.25-2.25.22-.69-.83-2-2.34-2.92-1.97-1.2-3.81-1.49-6.5-1-3.52.63-3.87.45-5.75-2.83-1.63-2.85-1.91-4.71-1.5-10l.5-6.5c-6.41.4-8.01 1-8 1.75 0 .69-1.24 1.54-2.75 1.89s-3.31 1.02-4 1.5c-.86.59-1.65-.01-2.53-1.89-.81-1.72-2.02-2.71-3.25-2.64-1.09.06-3.32.29-4.97.5l-3 .39.54-11c-6.87-3.24-10.09-3.91-12.76-3.75-2.35.14-4.51-.2-4.78-.75s-1.18-1-2-1-2.4.9-3.5 2c-1.81 1.81-2.17 1.85-3.75.48-1.4-1.22-3.02-1.37-8.01-.75l-6.27.77c.03-5.29-.24-5.48-3.6-5.25-2.14.15-3.86.87-4.18 1.75-.3.83-1.03 1.83-1.62 2.23-.59.41-1.63.75-2.32.75-.69.01-2.15-1.78-3.25-3.98s-2-4.67-2-5.5-.68-2.62-1.5-4c-.82-1.37-2.18-2.5-3-2.5s-2.29.9-3.25 2.01c-.96 1.1-2.2 2-2.75 2-.55-.01-1.56.88-2.25 1.99-.69 1.1-1.93 2-2.75 2s-1.5-.45-1.5-1-1.83-1.93-4.08-3.06c-2.68-1.36-4.99-1.85-6.75-1.44-1.89.45-2.89.18-3.42-.93S189.56 64 186.08 64c-3.44 0-5.09.45-5.5 1.5Z\"/>",
        "curlyFade1": "<defs><linearGradient id=\"a\" x1=\"200\" x2=\"200\" y1=\"100\" y2=\"310\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"rgba(0,0,0,.25)\"/><stop offset=\"1\" stop-color=\"rgba(0,0,0,0)\"/></linearGradient></defs><path d=\"M60 310H50v-10c0-140 50-200 150-200s150 60 150 200v10h-10v-20c0-5-10-20-15-25s-5-55-15-65c-40-40-60 0-110 0s-70-40-110 0c-10 10-10 60-15 65s-15 20-15 25z\" style=\"fill:url(#a);stroke:none\"/><path fill=\"$[hairColor]\" stroke=\"#000\" stroke-width=\"4\" d=\"M179.59 87.23c-1.3.91-3.19 1.7-4.18 1.74-.99.05-1.94.43-2.1.86-.16.42-2.14.88-4.39 1.01-2.72.17-4.17.58-4.35 1.27-.15.56-1.26 1.47-2.47 2.02-1.2.55-3.66 1.08-5.45 1.17s-3.47.51-3.73.94c-.29.48-1.24.39-2.4-.22-1.54-.81-3.12-.8-8.12.02-3.42.54-7.34 1.45-8.72 2.02-2.18.9-2.5 1.38-2.41 3.67.08 1.48-.16 3.1-.55 3.59-.38.49-2.55.91-4.81.93-3.62.03-4.16.24-4.53 1.81-.32 1.41-.85 1.73-2.44 1.47-1.11-.19-2.74-.32-3.62-.31-.88.02-1.72-.68-1.86-1.54-.15-.85-.87-1.53-1.62-1.51-.74.02-1.75.83-2.23 1.8-.47.98-.9 2.03-.96 2.32s-.45.84-.88 1.21c-.43.38-.85 1.41-.92 2.3-.07.9-.73 2.87-1.46 4.39-1.05 2.26-2.01 2.96-5.01 3.65-2.05.47-4.66 1.54-5.81 2.37-1.15.84-2.13 2.21-2.18 3.04-.04.84-1.44 2.56-3.11 3.83-2.07 1.59-3.66 2.17-5.06 1.83-1.59-.39-2.98.41-6.2 3.56-2.27 2.26-4.12 4.74-4.12 5.49 0 .76.51 1.51 1.13 1.67.89.23.87.78-.11 2.54-.68 1.24-.99 2.77-.68 3.41.33.68-1.52 3.22-4.48 6.16-3.86 3.84-5.7 6.62-7.74 11.65-1.55 3.64-3.43 7.13-4.13 7.74-.7.62-1.29 1.55-1.32 2.08-.02.53.55 2.79 1.26 5.03 1.03 3.45.98 4.24-.29 5.28-.83.67-1.95 2.68-2.52 4.46-.89 2.64-.72 3.62.96 5.23 1.13 1.1 1.92 2.42 1.74 2.95-.18.52.09 1.79.59 2.83s.84 1.25.75.47.41-.36 1.1.94c.69 1.29.95 3.09.59 4-.54 1.31.17 1.65 3.5 1.67 2.31.02 7.23.54 10.94 1.17l6.8 1.14c9.98-6.52 15.16-9.44 18.07-10.67 2.89-1.24 8.61-2.97 12.71-3.83 4.09-.87 11.79-1.85 17.12-2.17 6.86-.4 15.72.08 30.35 1.69 7.2.8 13.87 1.38 20.38 1.77 6.53.39 12.89.6 19.5.64 6.62.05 12.99-.07 19.52-.37s13.21-.77 20.45-1.43c15.33-1.35 23.43-1.6 30.98-1.01 5.62.45 13.34 1.51 17.16 2.36 3.83.84 9.3 2.49 12.17 3.67 2.89 1.16 8.07 3.85 11.56 5.94 3.94 2.22 7.32 3.53 8.48 3.39 1.05-.13 4.25-.6 7.1-1.05 2.84-.44 6.6-.77 8.38-.76 2.02.02 4.19-.71 5.84-1.97 1.45-1.11 2.48-2.46 2.29-2.99-.18-.53.81-1.46 2.19-2.06 2.28-.99 2.38-1.36 1.11-4.14-.71-1.72-1.98-3.66-2.84-4.29-1.35-.99-1.33-1.71.12-5.19.97-2.27 1.73-4.56 1.66-5.07s-.89-1.43-1.84-2.05c-.94-.63-2.48-3.48-3.39-6.37-1.02-3.46-3.06-7.34-5.83-11.08-2.33-3.18-4.83-6.28-5.57-6.89-.84-.68-1.12-1.83-.75-3.07.39-1.28.03-2.69-1.01-3.93-1.43-1.7-1.47-2.2-.35-4.09 1.19-2 .99-2.46-3.01-6.72-2.71-2.86-5.1-4.52-6.41-4.48-1.15.03-3.44-.65-5.09-1.51-1.85-.97-3.24-2.55-3.61-4.1-.34-1.39-1.33-3.36-2.21-4.37-.97-1.11-2.88-1.85-4.86-1.89-2.58-.05-3.72-.7-5.45-3.1-1.41-1.94-2.55-5.22-3.2-9.09l-1.1-5.98c-4.85-.09-6.38.42-6.52 1.07-.15.65-1.31 1.16-2.59 1.14-1.28-.01-2.44.5-2.58 1.15s-1.02-.21-1.97-1.91c-1.64-2.87-1.99-3.04-5.67-2.63-2.56.28-4.2.03-4.69-.71-.42-.63-.85-2.39-.98-3.9s-.59-3.21-1.02-3.79c-.42-.58-1.95-1.48-3.39-1.99s-5.46-1.31-8.92-1.76c-5.36-.67-6.45-.58-7.35.59-.96 1.25-1.28 1.26-3.23.09-1.19-.7-3.41-1.17-4.93-1.03-1.52.13-3.7.21-4.85.18-1.17-.03-2.11-.62-2.15-1.34-.03-.7-.8-1.45-1.7-1.66-.89-.21-2.35-.05-3.24.34-.89.4-1.79 1.2-2.01 1.79-.21.6-1.01 1.1-1.77 1.13-.77.03-2.36-.94-3.54-2.15-1.17-1.19-2.83-3.25-3.68-4.56-.85-1.29-2.2-2.4-3.02-2.46s-3.1 1.06-5.09 2.49l-3.64 2.61c-4.58-2.66-6.9-3.16-9.14-3.02-1.96.13-3.54-.03-3.53-.34.01-.32-2.12-.42-4.72-.23-3.36.24-5.42.83-7.1 2.01Z\"/>",
        "curlyFade2": "<defs><linearGradient id=\"a\" x1=\"200\" x2=\"200\" y1=\"100\" y2=\"310\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"rgba(0,0,0,.25)\"/><stop offset=\"1\" stop-color=\"rgba(0,0,0,0)\"/></linearGradient></defs><path d=\"M60 310H50v-10c0-140 50-200 150-200s150 60 150 200v10h-10v-20c0-5-10-20-15-25s-5-55-15-65c-40-40-60 0-110 0s-70-40-110 0c-10 10-10 60-15 65s-15 20-15 25z\" style=\"fill:url(#a);stroke:none\"/><path fill=\"$[hairColor]\" stroke=\"#000\" stroke-width=\"4\" d=\"M177 76.08c-1.37 1.1-3.4 1.99-4.49 1.96-1.1-.02-2.11.41-2.25.96s-2.29 1-4.76 1c-3 0-4.56.45-4.69 1.34-.1.74-1.23 1.86-2.5 2.5S154.39 85 152.43 85s-3.76.45-4 1c-.26.61-1.32.43-2.68-.46-1.81-1.17-3.57-1.27-9-.5-3.71.53-7.93 1.52-9.36 2.21-2.27 1.08-2.55 1.71-2.09 4.75.29 1.92.22 4-.14 4.62-.36.61-2.69 1.06-5.16 1-3.97-.11-4.53.15-4.75 2.13-.2 1.77-.73 2.15-2.5 1.76-1.24-.26-3.04-.49-4-.5-.96 0-1.97-.91-2.25-2.01s-1.17-2-2-2-1.82 1.01-2.2 2.25c-.39 1.24-.72 2.55-.75 2.92-.03.36-.4 1.04-.83 1.5s-.77 1.73-.76 2.83-.54 3.49-1.22 5.31c-1 2.67-2 3.49-5.24 4.25-2.2.52-4.99 1.73-6.21 2.69-1.21.96-2.23 2.54-2.25 3.5s-1.5 2.91-3.29 4.33c-2.23 1.77-3.96 2.4-5.5 2-1.75-.45-3.26.43-6.75 3.92-2.47 2.47-4.5 5.18-4.5 6s.56 1.65 1.25 1.84c.98.26.95.86-.12 2.75-.76 1.32-1.09 2.97-.75 3.66.36.73-1.67 3.42-4.92 6.5-4.21 4-6.18 6.89-8.25 12.11-1.49 3.78-3.29 7.38-4 8-.72.63-1.27 1.59-1.24 2.14s.95 2.91 2.04 5.25c1.69 3.61 1.78 4.44.6 5.5-.77.69-1.56 2.77-1.75 4.63-.29 2.75.16 3.78 2.41 5.5 1.53 1.17 2.76 2.57 2.73 3.12-.02.55.68 1.9 1.56 3 .87 1.1 1.3 1.32.94.5s.3-.37 1.47 1c1.16 1.38 2.1 3.29 2.07 4.25-.03 1.39.83 1.76 4.21 1.79 2.34.02 7.49.58 11.46 1.25l7.21 1.21c8.2-6.82 12.83-9.84 15.58-11.11s8.38-3.03 12.5-3.9c4.13-.88 12-1.86 17.5-2.17 7.07-.4 16.29.11 31.5 1.75 14.91 1.6 27.47 2.31 41 2.31s26.08-.71 41-2.32c15.87-1.7 24.25-2.15 32-1.69 5.77.35 13.65 1.31 17.5 2.15 3.85.83 9.25 2.57 12 3.85s7.48 4.36 10.5 6.85c3.33 2.74 6.29 4.41 7.5 4.22 1.1-.16 4.48-.79 7.5-1.38 3.02-.6 6.96-1.08 8.75-1.07 2.04.01 4.55-1.01 6.75-2.74 1.92-1.51 3.5-3.31 3.5-4s1.35-1.93 3-2.75c2.73-1.36 2.95-1.84 2.44-5.25-.31-2.06-1.21-4.31-2-5-1.24-1.07-1.09-1.92 1.09-6 1.39-2.61 2.52-5.2 2.5-5.75-.01-.55-.81-1.49-1.78-2.1-.96-.6-2.4-3.52-3.19-6.5-.93-3.51-3.01-7.32-5.94-10.9-2.48-3.03-5.16-5.95-5.96-6.5-.92-.63-1.21-1.75-.8-3 .43-1.28.03-2.65-1.1-3.81-1.54-1.58-1.59-2.08-.37-4 1.29-2.04 1.07-2.48-3.25-6.44-2.91-2.66-5.48-4.19-6.89-4.08-1.24.09-3.7-.47-5.47-1.25-1.98-.87-3.45-2.38-3.83-3.92-.33-1.37-1.36-3.3-2.28-4.28-1.01-1.08-3.05-1.76-5.17-1.73-2.77.04-3.97-.58-5.75-2.97-1.44-1.93-2.52-5.27-3-9.27l-.75-6.25c-5.23 0-6.92.56-7.13 1.25-.2.69-1.49 1.25-2.87 1.25-1.37 0-2.65.56-2.84 1.25s-1.09-.21-2-2c-1.56-3.05-1.93-3.22-5.91-2.77-2.76.32-4.51.06-4.98-.75-.41-.67-.75-2.58-.77-4.23s-.36-3.53-.77-4.17c-.4-.65-1.97-1.66-3.48-2.25-1.51-.6-5.79-1.55-9.5-2.13-5.75-.89-6.94-.82-8 .5-1.13 1.4-1.47 1.4-3.5.01-1.24-.84-3.6-1.45-5.25-1.35-1.65.11-4.01.12-5.25.04-1.27-.08-2.25-.81-2.25-1.65 0-.83-.79-1.74-1.75-2.03-.96-.28-2.55-.17-3.54.25-.98.43-1.99 1.34-2.25 2.03-.25.69-1.14 1.25-1.96 1.25s-2.51-1.23-3.75-2.73-2.98-4.09-3.87-5.75-2.35-3.13-3.25-3.27c-.89-.14-3.43 1.1-5.63 2.75l-4 3c-5.03-3.68-7.6-4.5-10.08-4.5-2.15 0-3.92-.34-3.92-.75s-2.36-.74-5.25-.72c-3.72.03-5.98.62-7.75 2.05Z\"/>",
        "dreads": "<defs><linearGradient id=\"a\" x1=\"200\" x2=\"200\" y1=\"100\" y2=\"310\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"rgba(0,0,0,.3)\"/><stop offset=\"1\" stop-color=\"rgba(0,0,0,0)\"/></linearGradient></defs><path d=\"M60 300H50c0-140 50-200 150-200s150 60 150 200h-10v-10c0-5-10-20-15-25s-5-55-15-65c-40-40-60 0-110 0s-70-40-110 0c-10 10-10 60-15 65s-15 20-15 25z\" style=\"fill:url(#a);stroke:none\"/><path fill=\"$[hairColor]\" fill-rule=\"evenodd\" stroke=\"#000\" stroke-width=\"4\" d=\"M217.4 2.49c1.16.4 4.69 1.24 7.86 1.87 4.97.98 5.76 1.45 5.75 3.39-.01 1.28-.77 2.47-1.76 2.76-.96.28-1.42.84-1.03 1.25.4.41.29 1.53-.25 2.49-.88 1.59-1.2 1.61-3.47.25-1.78-1.07-2.38-1.14-2.08-.25.23.69.68 2.49 1 4 .48 2.27.15 2.92-1.92 3.75-2.18.87-2.36 1.29-1.4 3.25.88 1.81.68 3.03-1.02 6.25-1.25 2.37-3.33 4.51-5.09 5.25-2.61 1.09-2.99 1.76-2.99 5.25 0 2.89.42 4 1.5 4 .82 0 1.72-.45 2-1s1.85-1 3.5-1c2.67 0 3.06-.39 3.5-3.5.36-2.55 1.11-3.66 2.75-4.11 1.24-.33 2.59-.56 3-.5s.75-.56.75-1.39c0-1.18.81-1.37 3.75-.87 3.39.56 3.67.44 2.97-1.25-.42-1.04-.53-2.67-.25-3.63.29-.96.98-1.52 1.53-1.25s1 .05 1-.5 1.34-.89 2.98-.75c1.65.14 3.21-.31 3.5-1 .28-.69.86-1.2 1.27-1.13.41.06 1.31.06 2 0 .69-.07 1.47-1.02 1.75-2.12.45-1.8.83-1.88 3.75-.87 2.75.96 3.37.88 4-.5.41-.9 1.65-1.63 2.75-1.63s2 .34 2.01.75c0 .41.86.75 1.9.75 1.05 0 2.29-.31 2.75-.7.46-.38 1.52-.43 2.34-.1s1.95-.03 2.5-.8c.56-.77 1.57-1.51 2.25-1.65.69-.14 1.94.31 2.79 1s1.3 2.04 1 3-.09 1.98.46 2.25 1.68.05 2.5-.5 1.68-.66 1.91-.25c.22.41.22 3.23-.01 6.25s-.98 5.83-1.66 6.23c-.71.42-1.8-.01-2.55-1-1.24-1.63-1.38-1.63-2.5-.02-.66.94-1.75 1.73-2.44 1.75S270.1 35.1 269 34s-2-2.45-2-3-1.24-1.19-2.75-1.43-4.44-.69-6.5-1c-3.34-.51-3.78-.33-4 1.68-.19 1.67-1.37 2.64-4.58 3.75-3.75 1.29-4.26 1.81-3.75 3.75.45 1.75.03 2.47-1.92 3.25-1.37.55-2.5 1.45-2.5 2s.79 2.65 1.75 4.66c1.32 2.76 1.44 3.75.5 4-.81.22-.37 1.22 1.25 2.84 1.38 1.38 3.06 2.5 3.75 2.49.69 0 2.04.9 3 2 .96 1.11 2.43 2.01 3.25 2.01s1.73.79 2.01 1.75.84 1.42 1.25 1.01c.41-.4 1.27.05 1.91 1 .89 1.33.89 2.05 0 3.03-.9 1-.88 1.29.08 1.25.69-.02 2.38-.49 3.75-1.04 1.93-.77 2.73-.66 3.5.5.69 1.04.61 2.01-.25 3.15-.69.9-1.11 2.82-.93 4.25.24 1.91-.3 2.91-2 3.77-1.28.65-3.22.95-4.32.67-1.12-.28-2.66.2-3.5 1.09-1.21 1.29-1.75 1.35-2.79.33-.72-.69-1.28-2.05-1.25-3.01.02-1.12-.5-1.57-1.46-1.25-.82.28-2.18.28-3 0s-1.49-1.29-1.47-2.25c.01-.96-.21-1.97-.5-2.25s-2.21.02-4.28.66c-2.06.64-3.75 1.81-3.75 2.6s-.5 2.07-1.11 2.84-1.17 3.09-1.25 5.15-.36 4.2-.64 4.75-1.29.77-2.25.49c-1.3-.39-1.94.25-2.5 2.5-.62 2.47-1.21 2.97-3.31 2.76-1.41-.14-2.76.09-3 .5S222.1 96 221 96c-1.45 0-1.85.48-1.45 1.75.31.96.76 4.79 1 8.5.44 6.65.41 6.75-2.05 6.75-1.83 0-2.5.53-2.5 2 0 1.76-.45 1.92-3.75 1.36-2.06-.36-3.86-1.03-4-1.5s-.7-.86-1.25-.86-.99.56-.97 1.25-1 2.53-2.25 4.09c-1.81 2.25-2.8 2.7-4.78 2.18-1.67-.43-3-.12-4 .93-.97 1.02-2.15 1.31-3.34.81-1.2-.49-1.63-1.37-1.25-2.51.39-1.15.08-1.75-.91-1.75-.82 0-1.79.56-2.15 1.25-.48.93-.93.82-1.75-.43-.61-.92-2-1.69-3.1-1.7-1.1-.02-3.69-.05-5.75-.07-3.27-.04-3.83-.41-4.34-2.8-.32-1.51-1.11-4.33-1.74-6.25s-1.16-3.95-1.18-4.5-.7-2.51-1.51-4.36c-1.32-2.99-1.85-3.32-4.82-3-2.42.26-3.59-.12-4.25-1.39-.5-.96-1.92-2.26-3.16-2.89-1.24-.62-1.91-.73-1.5-.25.42.49-.03 1.68-1 2.64-1.66 1.66-1.91 1.64-5-.25-1.79-1.1-3.7-1.78-4.25-1.5s-1 1.63-1 3c0 1.6-.63 2.61-1.75 2.8-.96.17-2.54.17-3.5 0-1.32-.23-1.75-1.27-1.75-4.3 0-3.62-.22-3.96-2.25-3.54-1.3.26-3.01-.27-4.03-1.25-.98-.94-1.77-2.27-1.75-2.96s-.53-1.43-1.22-1.65c-.78-.25-1.06-1.46-.75-3.18.28-1.57 1.33-3.03 2.4-3.35 1.04-.31 2.28-1.58 2.75-2.82.54-1.43 1.94-2.43 3.85-2.75 1.65-.28 3-.95 3-1.5s.68-1 1.5-1 2.29 1.11 3.25 2.47c1.74 2.46 1.76 2.46 6.75-1.35l-2.73-2.81c-1.5-1.55-2.73-3.93-2.74-5.31 0-1.37-.57-3.03-1.26-3.69-.7-.65-1.83-.99-2.52-.75s-1.95-.12-2.79-.81c-.85-.69-1.53-2.71-1.46-7.75l-4.25.62c-3.88.56-4.36.38-5.5-2-1.14-2.39-1.03-2.73 1.28-3.87 1.39-.69 2.53-1.7 2.53-2.25s-.24-1.34-.53-1.75-1.66-.19-3.04.5c-2.19 1.09-2.69 1-3.96-.75-.82-1.13-1.17-2.87-.81-4 .35-1.1.72-3.12.83-4.5.11-1.37.25-3.06.32-3.75s.93-1.25 1.9-1.25c1.03 0 2.29-1.26 3-3 1-2.44 1.65-2.88 3.48-2.38 1.24.35 3.15 1.53 4.25 2.64 1.75 1.76 1.83 2.28.66 4.13-1.13 1.76-1.13 2.23 0 2.86.74.42 3.14 1.3 5.34 1.97 2.2.66 4.45 1.68 5 2.27.55.58 1.15 1.72 1.33 2.53.18.82 1.08 2.3 2 3.3 1.61 1.75 1.71 1.75 2.89 0 .82-1.23.9-2.38.25-3.57-.54-.96-.97-2.87-.97-4.25 0-1.37.72-2.84 1.59-3.25.97-.46 1.36-1.43 1-2.5-.39-1.15.01-1.93 1.16-2.27.96-.29 2.2-.09 2.75.44.63.61 1.83.62 3.25.02 1.76-.73 2.52-.54 3.5.89.94 1.38 1.99 1.68 7.25.6l-4.27-1.97c-3.19-1.47-4.26-2.53-4.25-4.21.01-1.24.47-2.48 1.02-2.75s.76-1.06.46-1.75.39-2.15 1.53-3.25 2.06-2.68 2.05-3.5 1.21-2.07 2.72-2.76 3.3-1.26 3.99-1.25 1.36 1.02 1.5 2.26 1.26 2.7 2.5 3.25 2.26 1.79 2.25 2.75c0 .96-.52 1.86-1.15 2-.87.19-.87.8 0 2.5.87 1.69 1.77 2.13 3.65 1.75 1.99-.4 2.78.07 3.86 2.25.75 1.51 2.1 3.09 3 3.5s1.48 1.31 1.28 2-.64 2.15-.98 3.25c-.52 1.67-.16 2 2.11 1.98 1.5-.01 3.29-.35 3.98-.75.76-.44 1.25-2.89 1.25-11.73l5.25-2.38c2.89-1.3 5.55-2.99 5.93-3.75.43-.87-.21-1.83-1.75-2.62-1.89-.97-2.26-1.72-1.68-3.35.6-1.68 1.3-1.98 3.5-1.5 2.16.47 2.64.28 2.25-.9-.28-.83.18-1.72 1-2s1.57-1.23 1.65-2.12c.11-1.19.71-1.42 2.25-.89Zm-62.91 51.76c1.37.69 2.6 1.98 2.75 2.87.2 1.24 1.51 1.65 5.51 1.75 2.89.07 5.26-.21 5.27-.62.02-.41-1.11-1.76-2.5-3-1.38-1.24-3.2-2.02-4.02-1.75s-2.06-.1-2.75-.83-2.26-1.85-3.5-2.5c-1.24-.64-2.47-1.17-2.75-1.17s-.5.9-.5 2c0 1.13 1.08 2.54 2.49 3.25Zm78.34-.58c.11.87.95 1.13 2.42.74 1.38-.36 2.52-.07 2.94.75.39.74.95 1 1.25.59.31-.41-.23-1.65-1.19-2.76-.96-1.1-2.24-2-2.83-2-.6.01-1.46.31-1.92.68-.46.36-.76 1.26-.67 2ZM224 72c1.33 0 1.75-.42 1.27-1.25-.41-.69-.86-1.59-1-2-.15-.41-.27-1.2-.27-1.75s-.45-1-1-1-1 1.35-1 3c0 2.33.44 3 2 3Zm-53.5.09c.55 0 1.58-.7 2.28-1.55.7-.84.86-1.54.36-1.54s-1.53.7-2.28 1.54c-.75.85-.91 1.55-.36 1.55Z\"/><path fill=\"$[hairColor]\" fill-rule=\"evenodd\" stroke=\"#000\" stroke-width=\"4\" d=\"M176.78 95.02c2.48.02 4.48.76 6 2.25 1.27 1.25 2.26 1.68 2.25.98-.02-.69.65-1.25 1.47-1.25s1.5.67 1.5 1.5.89 1.5 2 1.5c1.1 0 2.68-1.12 3.5-2.5.82-1.37 2.06-2.51 2.75-2.52s2.26.89 3.5 2c1.34 1.2 2.9 1.76 3.86 1.37.99-.41 1.95-.02 2.5 1 .49.91 1.34 1.43 1.89 1.15s1.15.4 1.32 1.5c.18 1.1.63 2 1 2 .38 0 1.57-.56 2.65-1.25 1.73-1.1 2.4-.82 5.42 2.25 3.37 3.41 3.47 3.44 4.03 1.25.32-1.24.36-2.7.08-3.25s.29-1.44 1.25-1.97 1.3-.98.75-.98c-.55-.01-.1-.66 1-1.45 1.53-1.1 2.3-1.16 3.29-.27.72.64 1.28 1.73 1.25 2.42-.02.69.18 1.25.46 1.25s2.53-1.35 5-3 5.18-2.78 6-2.5 1.5 1.17 1.5 2-.45 1.72-1 2-1 .95-1 1.5 1.13 1 2.5 1c1.38 0 2.55.56 2.62 1.25.06.69.06 1.81 0 2.5-.07.69.56 1.25 1.38 1.25s1.94.79 2.48 1.75c.86 1.53 1.11 1.56 1.98.25.55-.83.78-2.29.52-3.25-.27-.96-.03-1.97.52-2.25s1-1.4 1-2.5c0-1.8.53-1.96 5.25-1.58 2.89.23 6.04.46 7 .5s1.99.87 2.29 1.83c.3 1.01-.12 2.07-1 2.5-.85.41-1.54 1.42-1.54 2.25s.68 1.72 1.5 2 1.48 1.06 1.46 1.75c-.03.69.67 1.92 1.54 2.75 1.13 1.07 1.58 1.14 1.54.25-.02-.69.97-1.24 2.21-1.22 1.24.01 2.93.71 3.75 1.55 1.02 1.04 2.55 1.36 4.75.98 1.79-.31 3.25-1.01 3.25-1.56s1.46-1 3.25-1c2.26-.01 3.71.68 4.75 2.25.82 1.24 1.5 4.05 1.5 6.25 0 3.55.27 4 2.39 4 1.76 0 2.76.87 3.75 3.25.75 1.79 1.7 3.24 2.11 3.22.41-.01 1.28 1 1.93 2.25.92 1.76.92 2.56 0 3.49-.91.93-.91 1.56.01 2.75.66.85 1.67 1.54 2.25 1.54s1.51-1.12 2.06-2.5c.6-1.5 1.8-2.5 3-2.5 1.33 0 2.17.83 2.5 2.5.27 1.38 1.18 2.5 2 2.5s1.61 1.01 1.75 2.25c.18 1.65.98 2.32 3 2.5 1.79.16 2.92.95 3.25 2.25q.495 1.995-1.5 3c-1.84.92-1.88 1.18-.47 3.25.83 1.24 1.44 2.7 1.33 3.25-.1.55.37 2.35 1.05 4 1.16 2.8 1.04 3.16-1.81 5.5-1.68 1.38-3.06 2.95-3.07 3.5s1.32 2.57 2.97 4.5c1.64 1.93 3.4 3.5 3.91 3.5s1.19.34 1.51.75-.1 2.1-.92 3.75-1.16 3.11-.74 3.25.65 2.84.5 6c-.22 4.87-.72 6.21-3.26 8.75-1.65 1.65-3 3.45-3 4s-.45 1.22-1 1.5-1.74-.06-2.64-.75c-.91-.69-2.93-1.14-4.5-1-1.82.16-3.04-.29-3.36-1.25-.27-.82-.27-1.95 0-2.5s1.06-.98 1.75-.96c.69.03 1.81-.53 2.5-1.25.75-.77.95-2.03.5-3.13-.5-1.24-1.4-1.66-2.75-1.3-1.1.3-4.25.07-7-.52s-5.56-1.47-6.25-1.96c-.86-.6-.95-1.43-.3-2.63.69-1.27.48-2.17-.75-3.27-.94-.83-2.49-1.4-3.45-1.25s-1.74-.07-1.72-.48c.01-.41-1.11-1.31-2.5-2s-2.64-2.23-2.78-3.42c-.14-1.2-.93-2.41-1.75-2.69-1.16-.4-1.33-.03-.75 1.67.62 1.81.12 2.58-2.85 4.44-2.41 1.51-3.82 1.89-4.25 1.15-.36-.61-1.66-1.62-2.9-2.25-1.57-.8-2.05-1.68-1.59-2.9.38-1 .27-1.43-.25-1.01-.5.41-1.47.3-2.16-.25-.69-.54-2.6-.77-4.25-.49-2.66.44-2.94.81-2.46 3.25.34 1.7.05 3.03-.75 3.48-.71.41-3.2.75-5.54.75-2.78.01-4.8-.58-5.86-1.73-1.51-1.65-1.76-1.65-4.25-.06-1.45.92-3.32 2.63-4.14 3.79-1.4 1.97-1.35 2.11.75 2.07 1.35-.03 2.25.55 2.25 1.45 0 .82-.68 1.72-1.5 2s-2.74.51-4.25.51c-1.51.01-4.27-.33-6.12-.75-1.86-.42-3.77-1.55-4.25-2.51-.62-1.23-.27-2.57 1.15-4.5 1.12-1.51 2.02-3.09 2-3.5-.01-.41-1.6-.75-3.53-.75-2.44 0-3.5.45-3.5 1.5 0 .82.34 1.5.75 1.51.41 0 .68 1.01.58 2.25-.09 1.23-.2 2.58-.25 2.99-.04.41-1.09.87-2.33 1.02-1.41.18-2.11.83-1.88 1.75.21.82.54 2.27.75 3.23.28 1.27-.52 1.99-2.87 2.63-1.79.48-4.55.6-6.14.25-1.72-.37-3.24-1.55-3.75-2.88-.47-1.24-1.31-2.47-1.86-2.75s-1-1.85-1-3.5-.45-3.22-1-3.5c-.67-.33-.67-1.17 0-2.5.55-1.1 1.79-1.98 2.75-1.96 1.56.04 1.59-.12.25-1.54-.82-.87-2.06-1.57-2.75-1.54-.69.02-1.7.94-2.25 2.04s-1 2.9-1 4-.45 2-1 2-.83.79-.63 1.75c.21.96-.25 2.65-1.01 3.75-.77 1.1-1.39 2.79-1.38 3.75s.47 1.75 1.02 1.75 1 .68 1 1.5-1.01 1.71-2.25 1.97-3.15.57-4.25.69-2.9-.08-4-.45c-1.31-.45-2.09-1.71-2.25-3.69-.19-2.28.18-3.04 1.5-3.1 1.39-.06 1.44-.19.25-.63-.82-.31-2.08-1.06-2.78-1.67-1.03-.89-.82-1.57 1-3.34 1.83-1.79 2.03-2.47 1.02-3.5-.69-.7-1.34-2.85-1.44-4.78-.15-2.71-.83-3.84-3-5-1.54-.82-2.58-2.06-2.3-2.75.27-.69-.18-1.25-1-1.25s-1.72.45-2 1 .18 2.35 1 4c.87 1.75 1.22 3.94.83 5.25-.37 1.24-1.39 2.77-2.25 3.41-.87.64-1.92.98-2.33.75-.41-.22-1.41.38-2.21 1.34s-1.23 2.43-.96 3.25-.08 2.01-.79 2.64c-.71.62-3.09 1.45-5.29 1.85-2.53.45-4.92.26-9-1.73l2.5-1.77c1.74-1.23 2.27-2.26 1.75-3.38-.49-1.06-2.03-1.61-4.5-1.61-2.67-.01-4.11.57-5 2-.81 1.3-1.95 1.82-3.25 1.5-1.1-.28-2.68-.05-3.5.5s-2.62.78-4 .5c-1.43-.29-2.57-1.25-2.65-2.25-.09-.96-.2-2.33-.25-3.04-.06-.7-.78-1.71-1.6-2.23s-2.74-.96-4.25-.96c-1.51-.01-2.75-.47-2.75-1.02s-.45-1-1-1-1.22.9-1.5 2-1.29 2.06-2.25 2.14-2.65.17-3.75.2-3.58-.76-5.5-1.75-4.29-1.52-5.25-1.19-1.73 1.39-1.71 2.35c.03.96-.72 2.43-1.66 3.25-.96.84-3.71 1.52-6.29 1.56-2.53.03-5.26.43-6.09.89-1.29.72-1.26.95.25 1.69.96.47 1.75 1.76 1.75 2.86s-.45 2.22-1 2.5-1.45 1.63-2 3c-.6 1.5-1.8 2.5-3 2.5-1.1 0-2.79.9-3.75 2.01-.97 1.11-2.98 2-4.5 2-1.51-.01-2.97-.46-3.25-1.01-.3-.6-1.21-.39-2.25.52-1.42 1.24-1.99 1.29-3 .25-.69-.7-1.03-2.06-.75-3.02.31-1.08-.17-1.99-1.25-2.37-.96-.34-3.66-1.47-6-2.5-3.09-1.37-4.43-2.63-4.9-4.63-.36-1.51-.13-3.99.5-5.5.88-2.11.86-3.27-.1-5-.69-1.24-1.7-2.56-2.25-2.93-.65-.45-.56-1.58.25-3.25.9-1.86 1.73-2.38 3-1.89.96.38 3.1.66 4.75.62 1.65-.03 3.33.45 3.73 1.07.49.75.73.62.71-.37-.02-.82.67-2.18 1.53-3s1.67-2.62 1.79-3.99c.16-1.61.95-2.61 2.24-2.82 1.1-.19 2.33.26 2.73.99.55.99.74 1.01.75.07.01-.69-.99-1.92-2.23-2.75-2.12-1.4-2.17-1.72-.91-5.25 1.2-3.33 1.14-4.12-.5-7.11-1.83-3.34-1.83-3.36.46-5 1.26-.9 2.27-2.43 2.25-3.39-.03-.96.85-2.2 1.95-2.75s3.13-1 4.5-1c1.38 0 2.72-.68 3-1.5.33-1 1.33-1.33 3-1 2.06.41 2.39.19 1.85-1.25-.36-.96-1.59-2.78-2.75-4.05-1.67-1.83-1.87-2.64-.97-4 .62-.93 2.09-1.7 3.25-1.7 1.17 0 2.35-.79 2.62-1.75.28-.96.95-1.75 1.5-1.75s1.67 1.01 2.48 2.25c.87 1.32 1.24 3.28.89 4.75-.38 1.6-.1 2.75.77 3.2.76.39 2.15-.06 3.14-1 .98-.94 1.54-2.49 1.25-3.45s.37-3.33 1.47-5.25c1.19-2.07 1.59-3.7 1-4-.63-.31-.54-1.1.25-2.13.69-.9 2.15-2.02 3.25-2.5s2.9-1.43 4-2.12 2.22-1.6 2.5-2.03c.28-.42 1.29-.54 2.25-.25 1.16.35 1.75 1.54 1.75 3.53 0 2.5.33 2.92 2 2.5 1.13-.28 3.2.39 4.75 1.53 1.51 1.12 3.43 1.99 4.25 1.94.96-.07.67-.53-.8-1.29-1.27-.65-2.17-1.85-1.99-2.68.17-.83 1.21-1.61 2.3-1.75s2.55-1.38 3.24-2.75c.69-1.38 1.03-2.95.75-3.5s.2-1.56 1.04-2.25c.85-.69 1.53-1.81 1.5-2.5-.02-.69.75-1.24 1.71-1.23.96 0 2.26.34 2.88.75.63.4 1.3 1.58 1.5 2.62.26 1.34 1.4 2.01 3.87 2.26 2.85.3 3.69-.06 4.54-1.89.57-1.24 1.47-2.2 2-2.13.53.08 2.09.5 3.46.93 2.11.67 2.38.53 1.75-.89-.49-1.1-.24-1.84.75-2.17.82-.28 1.5-1.17 1.5-2 0-1 .67-1.33 2-1q1.995.495 3.03-1.5c.75-1.46 2.02-1.99 4.75-1.98Zm76.05 21.02c.09.53 1.41 1.8 2.92 2.83s3.65 2.16 4.75 2.51c1.59.52 2.14.09 2.69-2.12.5-2 .22-3.12-1-4.08-.93-.73-1.58-1.74-1.44-2.25s-.65-1.1-1.75-1.32c-1.1-.21-2.98.48-4.17 1.54s-2.09 2.36-2 2.89Zm-104.49 2.52c-.65 1.09-.81 2.6-.36 3.44.44.83 1.3 1.16 1.91.75s1.11-1.87 1.11-3.25c0-2 .5-2.5 2.5-2.5s2.5-.5 2.5-2.5c0-1.37-.38-2.5-.85-2.5-.46 0-1.93 1.04-3.25 2.31s-2.92 3.18-3.56 4.25ZM233 117c0 .55.68 1 1.5 1s1.5.45 1.5 1 .5.89 1.12.75 1.52-1.26 2-2.5c.63-1.62.53-2.21-.37-2.11-.69.07-2.26.3-3.5.5s-2.25.81-2.25 1.36Zm-53 5c.55 0 1-.67 1-1.5s-.45-1.5-1-1.5-1 .67-1 1.5.45 1.5 1 1.5Zm99.25 1.45c.69.25 1.6.13 2.03-.25.43-.39.76-1.49.75-2.45-.02-.96-.39-1.75-.83-1.75s-1.34.9-2 2c-.94 1.57-.93 2.1.05 2.45ZM245.5 125c1.02.96 1.66 1.1 1.78.37.1-.62-.49-1.69-1.31-2.37-.83-.68-1.63-.85-1.78-.37s.44 1.54 1.31 2.37Zm-43 4c1.38.55 2.72 1 3 1s.11-.79-.37-1.75-1.88-2.05-3.12-2.41c-1.61-.46-2.22-.25-2.13.75.06.78 1.25 1.86 2.62 2.41Zm-62.68.47c.1.29.74.72 1.43.95.69.24 2-.44 2.92-1.5.92-1.05 1.37-1.89 1-1.86-.37.04-1.76.47-3.1.97s-2.35 1.15-2.25 1.44ZM153 139c-.55 0-.75.56-.44 1.25.3.69-.15 1.81-1 2.5-1.11.88-2.14.96-3.56.25-1.33-.67-2.17-.67-2.5 0-.28.55.51 1.86 1.75 2.91s2.47 1.54 2.75 1.08c.28-.45 1.63-1.1 3-1.45 2.19-.55 2.5-1.17 2.5-5 0-2.41-.35-4.75-.78-5.21-.43-.45-.76.18-.75 1.42.02 1.24-.42 2.25-.97 2.25Zm14.25 7.75c-1.42.16-2.42 1.08-2.7 2.5-.25 1.24-.02 2.7.5 3.25.53.55.73 1.79.45 2.75-.36 1.28-1.11 1.58-2.75 1.1-1.97-.57-2.09-.44-1 1 .69.91.95 2.44.59 3.4s-.59 2.09-.5 2.5-.96 1.65-2.34 2.75c-1.37 1.1-2.5 2.9-2.5 4s.45 2.22 1 2.5 1.39 1.51 1.86 2.75c.49 1.29 1.97 2.46 3.48 2.75 1.87.36 2.64.07 2.68-1 .04-.82-.51-2.01-1.23-2.62-.71-.62-1.63-2.08-2.04-3.25-.61-1.73.02-2.74 3.36-5.38 3.32-2.63 4.01-3.73 3.61-5.75-.28-1.4.21-3.6 1.12-5 .89-1.37 1.88-2.72 2.21-3s.9-1.29 1.27-2.25c.45-1.17-.15-2.58-1.82-4.25-2.26-2.26-2.35-2.67-1-4.25.83-.96 1.17-2.1.75-2.53-.41-.43-1.23-.76-1.81-.75-.58.02-1.03 1.94-1 4.28.05 3.69-.24 4.28-2.19 4.5ZM278.5 143c.82 0 1.27-.45 1-1s-.95-1-1.5-1-1 .45-1 1 .68 1 1.5 1Zm-75 3.5c.82.28 1.95.28 2.5 0s1-.95 1-1.5-.88-1-1.95-1-2.2.45-2.5 1 .13 1.22.95 1.5Zm98.36 2c.59.55 1.76.66 2.6.25 1.25-.61 1.31-1.04.29-2.29-.69-.85-1.57-1.53-1.95-1.5-.39.02-1 .6-1.36 1.29s-.17 1.7.42 2.25ZM235 152c1.65 0 3-.45 3-1s-1.01-1.68-2.25-2.51-2.59-1.5-3-1.5c-.41.01-.75 1.14-.75 2.51 0 2.11.47 2.5 3 2.5Zm-141.4.79c1.55 1.05 1.96 1.05 2.24 0 .19-.71.07-1.85-.25-2.54S94.57 149 94.05 149s-1.27.56-1.65 1.25c-.4.72.11 1.8 1.2 2.54Zm15.16-.72c.13.51.91 1.15 1.74 1.43s1.95.5 2.5.5.89-.63.75-1.4c-.14-.78-.52-1.58-.86-1.79-.33-.21-1.45-.22-2.49-.03-1.04.2-1.77.78-1.64 1.29Zm77.17 4c.04.51 1.31.64 2.82.29s2.97-.81 3.25-1.02c.28-.22-.19-1.08-1.04-1.94-1.38-1.39-1.71-1.38-3.32.1-.98.9-1.75 2.06-1.71 2.57Zm34.08 5.43c2.37 3.2 2.72 4.26 1.73 5.29-.99 1.04-.94 1.29.26 1.27.9-.01 1.8-1.44 2.25-3.54.41-1.94.5-4.08.2-4.77s-2.19-1.98-4.2-2.87c-2.31-1.03-3.57-1.21-3.42-.5.12.61 1.56 2.92 3.18 5.12Zm-16.65.5c1.29 1.31 1.3 1.95.06 5-1.28 3.17-1.25 3.61.33 4.64.96.63 2.36.86 3.1.5.83-.39 1.17-1.61.87-3.14-.28-1.37-.05-3.4.49-4.5.72-1.45.55-2.9-.61-5.25-.88-1.79-2.25-3.25-3.05-3.25-.79 0-1.72 1.01-2.06 2.25-.38 1.38-.04 2.83.87 3.75Zm35.14 0c.82 0 1.68-.34 1.9-.75.23-.41-.78-.81-2.23-.89-1.46-.08-2.31.25-1.91.75.41.49 1.42.89 2.24.89Zm79.3 25.7c.12 1.43.86 2.31 1.95 2.33.96.01 2.24-1 2.85-2.25.6-1.25.94-2.84.75-3.53s-.93-1.25-1.65-1.25-1.93.54-2.7 1.2-1.31 2.24-1.2 3.5Z\"/>",
        "emo": "<path fill=\"$[hairColor]\" stroke=\"#000\" stroke-width=\"4\" d=\"M60 310H50v-10c0-133.375 45.38-194.143 136.14-199.595Q192.902 100 200 100c100 0 150 60 150 200v10h-10c-5.865-19.535-9.397-26.984-15-45-2.917-4.702-25.536-47.024-35.536-57.024s-53.452 7.5-84.107 19.107c-10.733 4.064-108.964 32.475-119.957 32.19 0 0-7.086 5.755-10.4 5.727-5 5-15 20-15 25z\"/>",
        "faux-hawk": "<path fill=\"$[hairColor]\" stroke=\"#000\" stroke-width=\"4\" d=\"M185.17 46.93c-1.3.97-2.87 2.36-3.49 3.08-.62.74-2.49 2.24-4.17 3.33-1.69 1.1-3.77 3.18-4.64 4.62-.86 1.43-2.6 3.21-3.88 3.97s-4.32 2.88-6.77 4.69c-2.48 1.8-5.35 4.43-6.36 5.87-1.02 1.42-2.86 3.33-4.11 4.25-1.24.9-2.78 1.52-3.4 1.38-.62-.15-2.47.71-4.12 1.89s-3.75 2.53-4.66 3c-.9.47-2.76 1.87-4.15 3.1-1.39 1.22-2.82 2.27-3.17 2.34-.34.07-1.72 1.14-3.06 2.37-1.34 1.21-2.59 2.23-2.76 2.26-.18.03-1.92 1.35-3.88 2.91-1.96 1.55-4.46 3.77-5.54 4.94-1.08 1.16-2.43 3.03-2.98 4.15-.96 1.9-1.22 2.04-4.54 2.41-2.98.38-4.01.82-6.48 2.76-1.98 1.55-3.23 3.03-3.84 4.55-.49 1.23-1.98 4.28-3.31 6.77-2.06 3.89-3.32 5.36-9.2 10.83-3.71 3.43-8.25 7.6-10.1 9.27-2.41 2.17-3.69 3.84-4.55 5.93-.65 1.6-1.86 4.77-2.68 7.05s-1.59 4.56-1.73 5.08c-.13.52-1.61 2.22-3.27 3.78-2.42 2.32-3.02 3.26-3.38 5.28-.23 1.35-.43 2.86-.45 3.36-.01.49-.9 1.82-1.95 2.95s-2.15 2.63-2.46 3.33c-.3.69-1.03 3.61-1.59 6.46-.55 2.87-1.05 6.42-1.14 7.91-.13 2.28-.6 3.47-2.92 7.48-1.44 2.61-2.76 5.69-2.98 6.85-.22 1.18-.2 3.57.05 5.36.4 2.96.34 3.47-.58 5.85-.54 1.43-.99 3.6-1.01 4.84-.02 1.22.2 3.03.48 4 .45 1.56.39 2.06-.54 4.5-.56 1.49-1.02 3.46-1.02 4.36-.01.91.17 2.38.4 3.27s.68 2.02 1.01 2.51c.38.58.63 2.63.72 5.97.08 2.88-.08 6.26-.37 7.79-.36 1.87-.39 3.06-.1 3.89.24.66.26 1.6.07 2.1-.2.5-.49 2.71-.66 4.93-.19 2.53-.12 4.55.18 5.39.28.78.45 4.14.39 7.94-.08 5.04.09 7.26.77 9.57.51 1.66 1.08 4.36 1.26 6.01.19 1.64.75 3.48 1.24 4.08.51.6 1.49 1.11 2.17 1.13.69 0 2.36-.76 3.7-1.72 1.34-.95 2.7-1.73 3.02-1.72.33 0 1.17-.65 1.88-1.47.7-.81 1.23-1.97 1.17-2.55-.06-.59.83-2.28 1.96-3.77 1.14-1.5 2.16-3.2 2.27-3.79s.51-1.07.9-1.05c.39.01 1.7-1.37 2.9-3.06 1.22-1.71 2.29-3.88 2.38-4.81s.49-1.82.89-1.98c.4-.15 1.15-.79 1.68-1.41.57-.68 1.01-2.56 1.11-4.69.1-1.96.65-4.67 1.21-6.05.56-1.37.9-2.84.75-3.27-.14-.42.54-1.96 1.55-3.44 1.5-2.16 1.8-3.06 1.47-4.53-.22-1.02-.37-2.26-.36-2.77.02-.51.2-1.91.4-3.1.2-1.2.59-3.44.85-4.97.29-1.6 1.2-3.57 2.09-4.57.91-1.02 1.65-2.57 1.71-3.63.07-1.02-.24-2.89-.68-4.13-.44-1.26-.76-2.64-.72-3.06.04-.43.87-1.65 1.84-2.72 1.31-1.41 1.85-2.64 2.03-4.57.15-1.64.68-3.02 1.39-3.63.64-.54 1.23-1.76 1.33-2.7s-.05-2.19-.33-2.77c-.33-.73 0-2.05 1.08-4.25.87-1.74 2.74-4.42 4.15-5.95 2.25-2.41 2.84-2.72 4.42-2.45 1.01.18 1.99.41 2.16.5.18.09 1.3-.15 2.51-.54 1.21-.38 2.86-.86 3.66-1.04.81-.18 2.64-.69 4.08-1.12 1.45-.44 3.5-1.17 4.56-1.63 1.66-.73 2.28-.68 4.31.35 1.48.75 3.11 1.06 4.29.81 1.05-.21 4.04-.04 6.65.4 4.23.68 5.19 1.14 7.89 3.74 2.22 2.1 4.04 3.12 6.36 3.54 2.36.44 3.89.42 5.51-.09 1.23-.39 3.29-1.38 4.57-2.2 1.7-1.1 2.67-1.36 3.65-.97.74.3 2.76.7 4.49.91 1.75.2 3.53.53 3.94.75.43.22 2.4.56 4.38.78s4.87.64 6.41.95c2 .4 3.75.33 6.1-.25 1.8-.44 4.56-.95 6.14-1.15 2.21-.27 3.19-.07 4.43.88.88.66 3.06 1.37 4.85 1.57 2.22.24 4.11.05 5.91-.59 1.45-.52 3.27-1.73 4.04-2.69.9-1.11 2.05-1.73 3.2-1.72 1 0 1.94.2 2.12.45.18.24 1.53.61 3.03.82 1.71.23 4.23-.01 6.85-.65 2.27-.56 4.56-1.01 5.11-.99.53.01 2.17-.86 3.61-1.93 2.26-1.7 2.86-1.88 4.58-1.34 1.09.34 2.85.57 3.91.52 1.05-.06 3.79.63 6.08 1.51 2.29.9 5.01 1.64 6.06 1.67 1.05.02 2.63-.24 3.53-.58.9-.33 2.64-1.32 3.87-2.18 1.25-.88 2.66-1.4 3.19-1.17.54.23 3.62.56 6.84.72 4.6.26 6.21.13 7.78-.65 1.67-.84 2.26-.88 3.83-.23 1.03.41 3 1.08 4.39 1.47 1.37.4 3.14.84 3.91 1.01s2.35.59 3.51.93c1.15.35 2.24.56 2.41.48.17-.09 1.11-.3 2.09-.47 1.53-.28 2.08.01 4.21 2.19 1.33 1.38 3.07 3.82 3.87 5.43.99 2.01 1.28 3.21.93 3.89-.28.53-.46 1.68-.39 2.54s.61 1.98 1.21 2.47c.68.57 1.15 1.83 1.25 3.34.11 1.79.59 2.93 1.82 4.24.92 1 1.69 2.14 1.72 2.54.02.4-.33 1.68-.81 2.84s-.86 2.9-.83 3.86c.02 1.01.69 2.48 1.55 3.45.85.97 1.67 2.86 1.89 4.37.21 1.49.5 3.65.66 4.82.15 1.15.27 2.52.26 3.02 0 .49-.22 1.71-.48 2.7-.39 1.44-.13 2.34 1.28 4.52.97 1.5 1.61 3.07 1.43 3.49-.17.42.11 1.92.63 3.33s.94 4.22.95 6.24c0 2.22.37 4.19.94 4.92.52.67 1.28 1.35 1.69 1.53.41.17.8 1.13.84 2.12.05.98 1.08 3.32 2.3 5.17 1.22 1.86 2.57 3.37 2.98 3.36.43-.01.85.51.94 1.14.09.64 1.13 2.49 2.31 4.13 1.19 1.61 2.11 3.45 2.02 4.08s.47 1.87 1.24 2.75c.78.87 1.71 1.57 2.06 1.55s1.85.78 3.34 1.76c1.51.95 3.41 1.68 4.2 1.63.8-.05 1.94-.62 2.53-1.26.57-.63 1.24-2.52 1.46-4.2.22-1.66.89-4.38 1.47-6.02.77-2.28.97-4.48.86-9.49-.07-3.77.11-7.1.42-7.83.33-.8.39-2.8.17-5.32-.2-2.23-.52-4.48-.75-5-.21-.53-.19-1.45.07-2.07.31-.78.28-1.98-.11-3.9-.32-1.57-.51-4.96-.43-7.83.08-3.33.34-5.36.75-5.89.35-.44.83-1.53 1.06-2.41s.41-2.47.38-3.56c-.02-1.09-.52-3.14-1.12-4.54-1.01-2.35-1.06-2.72-.54-4.47.31-1.04.53-2.87.5-4.04-.03-1.18-.52-3.36-1.09-4.84-.96-2.44-1.01-2.97-.61-6 .23-1.86.24-4.33 0-5.54-.23-1.19-1.57-4.3-3.03-6.88-2.32-3.95-2.79-5.13-2.94-7.47-.11-1.53-.65-5.16-1.22-8.08-.59-2.93-1.35-5.89-1.66-6.58s-1.4-2.1-2.42-3.13c-1.04-1.03-1.91-2.31-1.94-2.83-.02-.52-.25-2.1-.51-3.51-.4-2.2-.97-3-3.89-5.58-1.93-1.68-3.61-3.49-3.71-4.02-.11-.55-.7-1.65-1.34-2.46s-1.67-2.97-2.33-4.8c-.78-2.24-1.91-4.06-3.35-5.4-1.22-1.16-2.63-3.25-3.24-4.82-.58-1.54-1.87-3.53-2.83-4.42s-2.66-2.03-3.77-2.52c-1.11-.51-2.4-1.71-2.89-2.68-.48-.98-1.86-2.57-3.06-3.54-1.21-.99-2.98-1.8-3.94-1.79-.95-.01-2.17-.46-2.69-1.01-.53-.55-1.44-2.05-2.03-3.33-.58-1.29-2.72-3.99-4.74-6.03-2.03-2.06-5.34-5.62-7.37-7.91-2.03-2.32-4.3-4.5-5.03-4.81-.75-.31-2.86-2.35-4.71-4.58a31.2 31.2 0 0 0-7.77-6.86c-2.41-1.52-5.5-3.2-6.87-3.71-1.38-.51-3.64-1.46-5.02-2.12-1.38-.65-3.34-2.34-4.36-3.77-1.01-1.44-2.16-2.65-2.55-2.68-.4-.03-1.83-2.03-3.18-4.48-1.34-2.47-3.19-5.22-4.13-6.08-.94-.87-3.32-1.63-5.34-1.69-3.6-.07-3.7-.14-6.67-5.19-2.37-4.2-3.26-5.19-4.62-5.01-1.34.18-2.14-.71-4.05-4.6-1.92-4.07-2.64-4.9-4.33-4.9-1.4.02-2.44.92-3.37 2.87-1.35 2.75-1.37 2.76-2.08.47-.4-1.27-1.98-3.47-3.52-4.86l-2.76-2.51-4.82 5.56c-4.32-3.67-5.38-3.83-7.64-2.84-1.58.68-3.69.94-4.7.56-1.23-.43-2.61-.07-4.19 1.12Z\"/>",
        "fauxhawk-fade": "<defs><linearGradient id=\"a\" x1=\"200\" x2=\"200\" y1=\"100\" y2=\"310\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"rgba(0,0,0,.25)\"/><stop offset=\"1\" stop-color=\"rgba(0,0,0,0)\"/></linearGradient></defs><g style=\"display:inline\"><path d=\"M60 310H50v-10c0-140 50-200 150-200s150 60 150 200v10h-10v-20c0-5-10-20-15-25s-5-55-15-65c-40-40-56.429-38.095-106.429-38.095S130 160 90 200c-10 10-10 60-15 65s-15 20-15 25z\" style=\"display:inline;opacity:1;fill:url(#a);stroke:none;stroke-width:1;stroke-miterlimit:4;stroke-dasharray:none\"/></g><path fill=\"$[hairColor]\" stroke=\"#000\" stroke-width=\"4.001\" d=\"M186.574 63.308c-1.38.914-3.048 2.224-3.706 2.902-.658.697-2.644 2.11-4.428 3.137-1.795 1.036-4.004 2.996-4.928 4.352-.913 1.347-2.761 3.024-4.12 3.74-1.36.716-4.378 3.134-6.98 4.84-2.633 1.695-3.698 3.69-4.77 5.047-1.083 1.338-1.985 2.085-3.313 2.952-1.316.848-2.349 2.437-2.349 2.437-.547.603-3.464.794-5.216 1.906s-2.509 3.225-3.475 3.668c-.956.443-2.931 1.762-4.408 2.92-1.476 1.15-2.994 2.139-3.366 2.205-.361.066-1.827 1.074-3.25 2.232-1.423 1.14-2.75 2.101-2.93 2.13-.192.028-2.04 1.271-4.121 2.74 1.206.294-4.29 2.363-5.437 3.465-1.147 1.093-3.027 2.11-3.61 3.166-1.02 1.79-2.04 1.624-5.566 1.972-3.165.358-2.247 2.16-4.87 3.988-2.103 1.46-3.654 2.458-4.302 3.89-.52 1.159-2.102 4.032-3.515 6.378-2.188 3.664-1.961 5.05-8.206 10.202-3.94 3.231-2.727 4.186-4.691 5.76-2.56 2.043-3.919 3.617-4.832 5.586-.69 1.507-1.53 5.237-2.4 7.385s-1.688 4.296-1.837 4.786c-.138.49-1.71 2.091-3.473 3.56-2.57 2.186-3.207 3.072-3.59 4.975-.244 1.272-.456 2.694-.477 3.165-.01.462-.212 2.012-1.327 3.077-13.917 26.93.055 20.434 20.174 19.793 6.615-2.296 23.167-11.049 33.226-13.355 24.884-5.704 49.903-4.276 77.7-4.133 25.588.131 50.833-.518 75.14 4.693 13.99 2.998 30.483 11.738 39.346 13.955 20.81.15 27.744 1.091 26.427-2.908-.116-1.442-1.2-5.16-1.805-7.91-.606-2.678-1.04-2.932-2.061-6.347-.209-.699-1.487-1.979-2.57-2.95-1.104-.97-2.028-2.175-2.06-2.665-.021-.49-.266-1.978-.542-3.307-.425-2.072-1.476-2.677-4.577-5.108-2.05-1.582-.9-5.269-1.007-5.768-.116-.518-.743-1.554-1.423-2.317s-1.773-2.798-2.474-4.522c-.828-2.11-2.028-3.825-3.558-5.087-1.295-1.093-2.793-3.062-3.44-4.541-.616-1.45-.945-3.772-1.964-4.61s.385-.414-.794-.876c-1.179-.48-2.548-1.61-3.069-2.524-.51-.924-1.975-2.421-3.25-3.335l-1.23-2.44c-.562-.518-1.529-1.93-2.155-3.137-.616-1.215-2.889-3.759-5.034-5.68-2.156-1.941-2.69-5.195-4.846-7.353-2.156-2.185-4.567-4.239-5.342-4.53-.796-.293-3.037-2.215-5.002-4.316-2.368-2.58-1.744-4.223-4.899-5.966-2.559-1.432-5.84-3.015-7.295-3.495-1.466-.48-3.122-1.97-4.587-2.593-1.466-.612-3.696-1.906-4.78-3.253-1.072-1.357-2.888-2.2-3.303-2.228-.424-.028-1.943-1.912-3.377-4.22-1.423-2.327-3.387-4.918-4.386-5.728-.998-.82-3.525-1.535-5.67-1.592-3.824-.066-3.93-.132-7.084-4.889-2.517-3.957-3.462-4.89-4.906-4.72-1.423.17-2.273-.669-4.301-4.333-2.04-3.834-2.804-4.616-4.599-4.616-1.486.019-2.59.866-3.578 2.703-1.434 2.591-1.455 2.6-2.21.443-.424-1.196-2.102-3.269-3.738-4.578l-3.526-2.067c-3.753 1.148-3.364 2.987-4.97 4.494-4.587-3.458-5.267-3.162-7.667-2.23-1.678.641-3.918.886-4.991.528-1.306-.405-2.772-.066-4.45 1.055z\"/>",
        "female1": "<g fill=\"$[hairColor]\" stroke=\"#000\" stroke-width=\"4\"><path d=\"M84.6 349.3c-2.9-2.7-5.7-5.4-8.7-8-19.6-16.4-25.8-36.4-20.6-59.4 1.4-6.3 2.3-12.7 4.2-18.8 1-2.4 3.1-4.5 5.9-5.6 5.1-1.7 6.9.1 7.5 4.8 3.4 26.2 3 52.9 10.4 78.8.7 2.6 1.5 5.2 2.3 7.8zM78.4 337c-9.2-20-9.1-41.4-13.2-62.2h-1.3l-3.3 24.5c-2.5-5.8.8-26.7 5.5-30.9 2.5 16 5 31.5 7.4 46.9.8-.5 1-1 1-1.3-1.1-17.2-2.2-34.5-3.4-51.8-.1-1-.7-2.6-1.4-2.8-1.3-.3-3.4-.2-4.2.5-1.7 1.7-3.6 3.6-4.1 5.7-1.3 5.2-1.2 10.8-2.8 15.8-2.7 8.6-2.2 17-.8 25.5 2.1 12.1 9.5 22.9 20.6 30.1z\"/><path d=\"M78.4 337c-11.2-7.2-18.6-17.9-20.5-30-1.5-8.5-1.9-17 .8-25.5 1.6-5.2 1.5-10.6 2.8-15.8.5-2.1 2.4-4 4.1-5.7.8-.7 2.9-.9 4.2-.5.7.2 1.3 1.8 1.4 2.8 1.2 17.3 2.3 34.5 3.4 51.8 0 .6-.4 1.1-1 1.3-2.4-15.5-4.9-30.9-7.4-46.9-4.7 4.2-8 25-5.5 30.9l3.2-24.5h1.3c4.1 20.6 4 42 13.2 62.1z\"/></g><g fill=\"$[hairColor]\" stroke=\"#000\" stroke-width=\"4\"><path d=\"M378.1 263.2c-8.6-27.1-18.2-53.9-27.4-80.9-6.7-20-19.4-38.5-36.9-53.7-15.5-13.6-32.6-25.6-52.1-35.3-12.5-6.1-25.3-11.3-40.7-10.8-12.4.4-24.9.3-37.3 0-11.3-.4-22.6 1.7-32.6 5.9-16.5 7-31.6 15.8-45 26-10.2 7.7-20.5 15.5-28.9 24.5-12.5 13.6-20.9 29-27.1 45.3-15.8 41.1-30.9 82.4-35.8 125.4-1.2 10.3-2.8 20.8 2.4 30.9 2.2 4.5 4.8 8.9 7 13.4 1.6 3 3.8 6.2 4.1 9.3.5 4.3 2.6 7 7 9.5 11.5 6.5 22.3 13.7 33.9 20 5.4 3 8.8 6.5 11.7 11 6.4 9.9 14.5 19.3 24.2 27.4 1.3.9 2.8 1.7 4.2 2.4-2.7-6.1-5.7-11.5-7.5-17.1-2-5.8-2.9-11.9-4.3-17.8-.3-1-.7-2.7-1.2-4.8-10.7-44.8-7.3-81-5.7-89.3 2.7-14 5.4-27.9 8.9-41.8 2.2-8.6 5.6-16.9 8.5-25.3 4.5.7 8 1.1 11.6 1.8 2.8.6 5.4 1.4 7.9 2.4 4 1.7 7.7 4.5 12 5.1 18.7 2.8 37.4 4.9 56.9 7.3 1.8-7.8 3.4-14.8 5.3-22.2 1.7 7.9 3.2 14.9 4.7 21.7.8.2 1.5.3 2.3.3 13.5-1.2 26.9-2.2 40.3-4 7.8-1.1 16.5-2.4 22.9-5.8 7.2-3.9 14.8-4.3 22.6-6.3.6 1.7 1.2 3 1.7 4.3 8 21.1 13.5 43 16.4 65.1 4.9 37-2.3 67.3-6.4 87.2q-.6 2.7-.9 4.2c-3.5 12.3-3.1 24.6-12.3 35.1 1.7-.2 3.4-1 4.5-2 8-8.9 16.3-17.6 23.6-26.8 3.7-4.7 7.2-8.9 13.2-12 12.9-7 25.1-14.8 37.5-22.3.8-.7 1.2-1.5 1.3-2.4.6-6.9 5.1-12.5 8-18.7 3.2-6.9 7.5-14.2 7.6-21.4.4-22-3.4-43.6-10.1-64.8zM26.4 351.6l-1.1.3c-.6-1.1-1.3-2.2-2-3.3-9.4-15.3-9.1-31.4-6.2-47.8 6.2-35.8 17.6-70.6 30.7-105 3.6-9.3 7.4-18.5 11.2-27.8-16.2 60.7-34.8 121.1-32.6 183.6zm74.5 71.2-1.9.4c-3.7-4.6-7.8-9.2-11.4-14-6.8-9.3-14.1-18.5-20.1-28.2-10.7-17.2-12.3-35.9-11.1-54.8 1.3-20.4 9.5-39.5 16.1-58.8 3.7-10.7 7.5-21.3 11.3-32 .6-1.6 1.3-3.1 2-4.9l20.5 6.6c-27.4 61.3-25.8 123.4-5.4 185.7zm203.5-1.8c-.8.9-1.7 1.5-2.9 1.9 19.3-62.3 21.4-124.3-5.7-185.9l20.8-6.6c4.1 11.6 8.4 22.9 12.1 34.4 5.2 16.6 10.6 33.3 14.9 50.1 3.5 14.4 3.4 29.2-.4 43.4-2.1 8.2-4.8 16.8-9.7 24.1-8.7 13.3-19.3 25.8-29.1 38.6zm66.6-54.7q-.6 1.5-2.1 2.4c-4.1 2.7-8.3 5.5-12.7 8.1-8.2 4.9-16.4 9.6-25.5 14 1.8-2.8 3.8-5.5 5.4-8.4 2.3-4.1 5.2-8 6.4-12.2 6-21.4 7.2-43 .9-64.2-7.3-24-15.8-47.8-24-71.6-1.1-3.3-1.3-5 3.1-6.5 5.4-1.9 5.6-3.6 4.1-9.9-3.8-15.4-12-29.2-21.8-42.6-11.4-15.5-24.5-29.8-44.1-39.2-15.1-7.2-30.8-14-48.5-16.4-13.2-1.8-26.8-.6-39 3.6-.5.3-.9.6-1.3 1 6.9-1.2 13.9-2.9 20.9-3.6 13-1.3 25.7-.5 37.6 4.8 11.3 4.8 23.3 8.6 33.8 14.2 20.4 10.8 33.1 27.1 44.8 43.8 7.8 11.2 12.1 23.5 16.1 35.9.4 1.7.7 3.5.8 5.2-10.6 3.1-21.1 6.2-31.6 9.3-3.4.9-6.6 2.3-10 3.2-3.9 1-6-.3-7-3.6-6.1-19.3-14.7-38.2-25.7-56-1.9-3-4-6-6.3-8.9 5.6 10.5 11.8 20.8 16.6 31.6 5.2 11.9 9.1 24.2 13.6 36.3 1 2.7-1.6 3.6-3.7 4.6-8.4 4.1-17.8 6.1-27.6 6.9-11.5.9-22.9 1.8-34.3 2.6-1.1 0-2.1 0-3.1-.2-1.8-13.5-3.8-26.9-5.6-40.4h-.7l-5.4 40.6c-8.9-.6-17.2-1-25.6-1.7-13.1-1.1-26.4-1.7-38.2-7.4-4-1.9-5.3-3.5-4.3-7.5 4.9-19.5 14.2-37.8 24-56 1.7-3.1 3.9-6.2 5.3-9.6-1.1 1.1-2 2.3-2.8 3.4-12.2 18.8-21.8 38.7-28.6 59.2-2.3 6.8-4.6 7.7-12.7 4.8-3.8-1.3-7.5-2.5-11.3-3.7-7.6-2.7-15.3-5.1-22.8-7.9-1-.5-1.8-2.5-1.5-3.6 3.7-15.6 10.7-30.5 20.9-44.1 11.7-15.4 24.7-29.9 44.3-39.6 8.4-4.2 17.8-7.3 26.7-11.1 1.3-.6 2.5-1.3 3.7-2.1-25.2 7-46.8 18.3-62.8 36-12.4 13.5-22.3 28.1-29.5 43.7-2.5 5.5-3.8 11.3-5.5 17-1 3.3.4 5.7 4.4 7.1 1.6.4 3.2 1.2 4.9 1.9-2.7 7.4-5.5 14.5-8 21.7-5.2 14.6-10.7 29.2-15.4 44.1-8.3 26-8.8 52.3-.3 78.4 1.7 5.4 6.4 10 9.7 14.9.4.6.7 1.2 1.6 2.9-2.7-1.4-4.4-2.3-5.9-3.2-9.9-5.9-19.9-11.8-29.9-17.7-3.7-2.2-5.4-4.8-5.7-8.6-3.5-38.1 1.2-75.8 10.5-113.2 5.2-21.1 11.4-42.3 16.5-63.2 2.7-11.4 6.4-22.5 12.5-33.1 7.1-12.2 18.4-21.6 30-30.6 18-14 37.2-26.6 60.8-34.1 5.2-1.8 10.6-2.7 16.2-2.9 16.2-.3 32.5 0 48.7 0 12.3 0 22.8 4.6 32.9 9.4 26 12.2 48.6 28.4 66.6 47.8 9.4 10.4 14.7 22.4 18 35.1 7.5 29.6 15.5 59 22.4 88.5 6.9 29.1 7.7 58.6 8.1 88.1 0 4.2-1.2 8.3-2 12.5zm6.4-15.7c-.1.1-.6.2-1.9.5 1.2-62.8-16.1-123.3-32.9-184.2 2 5.3 4.2 10.6 6.1 15.9 6.3 16.8 12.9 33.5 18.5 50.5 9.5 28.5 17.6 57.3 19.6 86.8.8 10.9-4.1 20.8-9.4 30.5z\"/><path d=\"M172.4 123.8c-25.4 7-46.9 18.3-62.8 35.9-12.3 13.4-22.2 28.1-29.5 43.7-2.4 5.4-3.8 11.4-5.5 17-1 3.3.4 5.7 4.4 7.1 1.6.6 3.1 1.2 4.9 1.9-2.8 7.3-5.4 14.5-8 21.7-5.2 14.7-10.8 29.4-15.4 44.1-8.2 26.1-8.8 52.4-.3 78.4 1.7 5.3 6.4 9.9 9.7 14.9.3.6.6 1.1 1.6 2.9-2.8-1.6-4.4-2.4-5.9-3.2-10-5.9-19.9-11.9-29.9-17.7-3.8-2.2-5.4-4.7-5.7-8.6-3.5-38.2 1.2-75.9 10.5-113.3 5.3-21.2 11.4-42.3 16.5-63.6 2.8-11.5 6.4-22.6 12.5-33.1 7-12.1 18.4-21.4 30-30.6 17.9-13.9 37.2-26.5 60.8-34.1 5.2-1.7 10.6-2.6 16.2-2.9 16.2-.3 32.4-.1 48.7 0 12.3 0 22.8 4.6 32.9 9.4 26 12.2 48.5 28.4 66.5 47.8 9.6 10.3 14.9 22.5 18 35.1 7.5 29.5 15.5 58.8 22.4 88.5 6.7 29.1 7.6 58.6 8.1 88.1.1 4.2-1.1 8.3-2 12.5q-.6 1.5-2.1 2.4c-4.2 2.8-8.4 5.5-12.7 8.1-8.2 4.9-16.4 9.6-25.5 14 1.8-2.8 3.8-5.5 5.4-8.4 2.3-4 5.2-7.9 6.4-12.2 6-21.2 7.2-42.8.9-64.2-7.1-24-15.7-47.7-24-71.6-1.1-3.1-1.3-5 3.1-6.5 5.4-1.8 5.6-3.6 4.1-9.9-3.8-15.4-12-29.3-21.8-42.6-11.3-15.5-24.5-29.8-44.1-39.2-15.2-7.3-30.9-14-48.5-16.4-13.2-1.8-26.7-.5-39 3.7-.5.2-.9.6-1.3 1z\"/><path d=\"M172.1 123.9c6.9-1.2 13.9-2.9 20.9-3.6 13.1-1.3 25.7-.5 37.6 4.8 11.1 4.9 23.3 8.7 33.8 14.2 20.3 10.8 33 27.1 44.8 43.8 7.9 11.4 12.1 23.5 16.1 35.9.4 1.7.6 3.4.8 5.2-10.5 3.1-21.1 6.1-31.6 9.3-3.4 1-6.5 2.4-10 3.2-4 1.1-6-.2-7-3.6-6.1-19.3-14.7-38-25.7-56-1.9-3-4-6-6.3-8.9 5.6 10.5 11.8 20.9 16.6 31.6 5.2 11.9 9.1 24.1 13.6 36.3 1 2.8-1.5 3.6-3.7 4.6-8.5 4.2-17.8 6.1-27.6 6.9-11.4.9-22.8 1.7-34.3 2.6-1 0-2-.1-3.1-.2-1.9-13.5-3.8-27-5.6-40.4h-.8l-5.5 40.6c-8.8-.6-17.2-.9-25.6-1.7-13.2-1.1-26.4-1.7-38.2-7.4-4-1.8-5.3-3.5-4.3-7.5 4.9-19.6 14.2-37.9 24-56 1.7-3.1 3.9-6.2 5.3-9.6-1 1-1.9 2.2-2.8 3.4-12.1 18.8-21.7 38.7-28.6 59.2-2.2 6.7-4.7 7.7-12.7 4.8-3.7-1.3-7.5-2.4-11.3-3.7-7.6-2.5-15.3-5-22.8-7.9-1-.4-1.8-2.4-1.5-3.6 3.8-15.6 10.9-30.5 21.1-44.1 11.6-15.5 24.7-29.9 44.3-39.6 8.6-4.2 17.8-7.4 26.7-11.1 1.3-.6 2.5-1.4 3.8-2.1zM295.8 237l20.7-6.8c4.1 11.7 8.5 23.2 12.1 34.5 5.3 16.6 10.6 33.3 14.9 50.1 3.5 14.3 3.4 29.1-.4 43.4-2 8.2-4.9 16.8-9.7 24.1-8.8 13.2-19.3 25.8-29.1 38.6-.7.8-1.6 1.6-2.9 1.9 19.4-62.1 21.6-124.1-5.6-185.8zM99 423.2c-3.8-4.6-7.9-9.1-11.4-13.9-6.9-9.3-14.1-18.5-20.1-28.2-10.7-17.3-12.3-35.8-11.1-54.9 1.3-20.4 9.5-39.5 16.1-58.9 3.7-10.7 7.5-21.3 11.3-32 .6-1.6 1.2-3.1 2-4.9l20.5 6.7c-27.4 61.3-25.7 123.3-5.4 185.7zM59 168c-16.1 60.8-34.7 121.1-32.5 183.8l-1.1.3c-.7-1.1-1.4-2.2-2-3.3-9.4-15.3-9.1-31.5-6.2-47.8 6.2-35.8 17.6-70.5 30.7-105 3.4-9.5 7.3-18.7 11.1-28zm316.5 183.1c1.2-62.9-16.1-123.5-32.7-184.2 2 5.3 4.2 10.6 6.1 15.9 6.2 16.9 12.8 33.6 18.5 50.5 9.5 28.5 17.4 57.3 19.6 86.8.8 10.9-4.1 20.7-9.4 30.5-.3.3-.7.3-2.1.5z\"/></g>",
        "female10": "<g fill=\"$[hairColor]\" stroke=\"#000\" stroke-width=\"4\"><path d=\"M151 122.5c-.7-4-3.3-16.3-13-22.2-10.4-6.3-22.5-1.3-33 3.2-17.6 7.4-28.4 19-40 31.7-2.5 2.8-13.6 15-25 33.8-5.7 9.3-13 21.5-19 39-5.5 15.9-7.6 29.6-9 39-1.5 10.2-.9 10.3-3 26.4-2.3 17.8-3.4 26.6-6 35.9-4.2 15.2-6.8 14.2-13 32.7-4 12-7.3 22.1-8 35.9-.8 16.7 2.8 29.4 5 36.9 2.9 10 6.9 23.8 18 36.9 8.8 10.4 18.4 16.1 27 21.1 10.8 6.3 15.5 6.9 29 15.8 5.7 3.8 8.3 6 9 5.3 1.7-1.8-13.5-19.4-32-47.5-1-1.5-23.2-35.3-20-38 1.3-1.2 5.9 4.6 16 8.4 4.3 1.7 14.8 6.2 17 3.2 2.9-3.9-12-13.7-17-34.8-2.2-9.6-1.7-18.3-1-30.6.3-5.6.8-13.5 3-23.2 3.6-16.3 9.6-26.8 13-33.8 16.2-33 3.6-46.3 18-77 3.1-6.5 5.7-10.3 31-39 13.1-14.8 31-35 53-59.1z\"/><path d=\"M128 167.9c1.2 2.2-18.3 11.8-39 36.9-8.8 10.6-15.6 19.2-19 32.7-3.6 14.6-1.2 27 1 38 2.4 12.1 4.3 12.6 14 41.1 8.2 24.2 9.5 31.7 10 34.8 2.8 17.7 1.3 30 1 32.7-.8 6.1-2.5 12.2-6 24.3-3.5 12.3-5.5 16.4-9 20-4.1 4.2-10.7 8.3-13 6.3-2.8-2.4 4.1-11.3 5-28.5.2-4.3-.2-8.5-1-16.9-1.5-15.2-2.2-22.7-5-29.5-2.5-6.2-3.8-5.5-18-23.2-14.5-18.1-16.2-22.7-17-25.3-2.1-6.8-1.7-13-1-25.3 1.1-18.6 4.9-32.3 6-35.9 3.1-10.5 5.9-20 13-30.6 5.8-8.5 12.3-14 18-19 5.4-4.7 10.8-8.7 17-12.7 18.7-11.9 41.7-22.3 43-19.9zm198 27.4c8.5 30.6 18.5 53.9 26 69.6 9.7 20.1 31.6 61.3 36 69.6 11.4 21.4 13.9 25.6 16 34.8 5.1 22.1.8 41.1-4 62.3-1 4.3-5.7 24.5-17 49.6-6 13.2-14.1 31.3-29 51.7-6.5 8.9-15.5 19.9-23 36.9-4.3 9.7-6 16.7-5 24.3 1.2 9.1 5.7 14.2 4 15.8-2.1 2.1-12.4-3.8-20-12.7-9.7-11.2-9.7-20.7-15-21.1-4.7-.4-9.1 6.8-14 14.8-5.4 8.8-4.5 14.4-7 14.8-4.2.6-9.3-13.5-14-26.4-5.3-14.6-8-22.1-8-31.7 0-6.5 1.3-12.2 4-23.2 3.4-14.1 5-21.5 9-30.6 4.9-11.1 7.4-11.3 16-27.4 3.9-7.4 5.7-11.7 10-21.1 13.2-29.2 15.8-31.9 21-44.3 9.7-23.1 13.2-42.8 15-53.8 2.8-16.7 3.1-29.3 2-70.7-.6-22-1.5-49.4-3-81.2z\"/><path d=\"M99 153.1c3.8-23.9 32.9-38.1 50-46.4 19.9-9.7 42-20.5 73-17.9 10.8.9 48.7 5.5 77 36.9 15.8 17.5 21.9 35.8 31 63.3 4 12.1 10.7 32.1 13 59.1 1.4 16 .3 23.3 3 45.4 2 16.3 4.7 29 6 34.8 1.8 8.2 5.6 24.8 13 45.4 7.3 20.2 10.5 23.5 11 34.8.5 12.6-3 22.7-5 28.5-4.2 12.2-9.9 20-16 28.5-7 9.6-12.3 17-15 15.8-4-1.8 5.8-18.9 2-44.3-2.7-17.8-9.1-20.1-11-41.1-.2-1.8-.5-6-2-6.3-3.7-.8-5.4 23.2-22 36.9-4.9 4.1-11.6 6.6-25 11.6-1.3.5-10 3.7-22 5.3-5.7.7-8.5 1.1-9 0-1.6-3.5 21.4-11.7 36-34.8 4.3-6.8 7.2-15.1 13-31.7 5.9-16.9 6.8-23.7 7-28.5.3-5.7-.1-12.7-3-24.3-3.1-12.5-7.6-23.8-20-47.5-12-22.9-18-34.3-26-44.3-6.5-8.1-16.8-20.7-31-27.4-.6-.3.1.1-21-7.4-5.3-1.9-7.4-2.6-10-2.1-7.9 1.5-7.9 13.2-14 17.9-5.8 4.5-17.5-1.3-40-11.6-10.1-4.6-15.6-7.8-20-10.6-11.2-7-17.5-11.1-21-19-3.7-8.3-2.4-16.4-2-19z\"/><path d=\"M297 190.1c.5-1.4-21.9-16.2-52-20-18.4-2.4-32.3.3-41 2.1-17.1 3.5-24.2 8.4-27 10.6-8 6.1-13.3 14.7-14 15.8-2.7 4.3-4 6.5-4 7.4.2 3.1 9.1 7.5 17 5.3 7-2 6.9-9.5 14-16.9 5.6-5.8 11.5-7.6 21-10.6 14.6-4.6 27.8-4.9 38-4.2 29.3 1.7 47.5 11.7 48 10.5z\"/><path d=\"M261 145.7c-9-5.1-25.1-12.5-46-12.7-6.4 0-20.3 0-36 7.4-5.5 2.6-15.3 7.3-24 17.9-4.3 5.2-9.7 11.8-11 22.2-1.5 12.2 6.2 19.9 4 22.2-3.3 3.3-21.3-3.6-28-16.9-11.8-23.6 11.7-68.9 42-87.6 35.7-21.9 87.9-11.1 131 26.4\"/></g>",
        "female11": "<g fill=\"$[hairColor]\" stroke=\"#000\" stroke-width=\"4\"><path d=\"M335.4 102c11.9 11.5 18.7 25.2 21.9 40.1 1.6 7.3 1.9 14.8 2.3 22.3.9 14.8 1.3 29.6 2.5 44.4.4 4.1 3.5 8 4.7 12.1 5.7 20.8 5.6 41.6.7 62.5-4.2 18-8.8 35.9-13 53.8-1.2 5.2-1.9 10.5-2.7 15.8-1.4 9.6-7.1 17.7-12.1 26.1-.7 1.1-2.5 1.7-3.7 2.6-.9-1.2-2.7-2.3-2.8-3.5-.3-5.8-.1-11.6.5-17.4 2.7-23.1 3.3-46.2-.4-69.3-.4-2-1.4-3.9-1.2-5.9s.7-4.2 2.1-5.5c4.3-4.2 4-9 2.8-13.7-4.3-17.3-13.9-32.5-26.5-46.3-7.2-7.9-16.7-13.1-29.2-13.4-5.1-.1-10.3-1.8-15.4-2.7-.4-.1-.8-.4-1.1-.3-6.9 1.9-10.2-3.4-14.9-5.7-11.4-5.5-24.2-8.6-37.3-8.9-9.7-.2-19.4.9-29.1 1.3-5.1.2-10.6-.5-15.4.6-9.6 2.3-19.5 4-27.4 10-2.2 1.7-6 2.2-9.2 2.8-8.3 1.5-17 2.1-25 4.3-5.7 1.6-10.8 4.4-14.8 8.2-6.7 6.6-11.3 14.6-17.7 21.4-9.6 10-11.2 22.4-16.5 33.8-4.8 10.4-2.7 20.4-1.5 30.8 2.2 18.4 3.7 36.8 5.8 55.2.8 6.6 2.5 13.1 3.6 19.7.2 1.7.2 3.5 0 5.2-.7.2-1.3.4-2 .6-1.3-1.6-2.4-3.2-3.4-4.9-8.1-17.4-14.7-35-18.1-53.6-2.5-13.8-6.1-27.5-10.7-40.9-5.6-16.6-3.6-33-1.5-49.6.8-6.4 1.5-12.6.1-19.2-1.3-6.2-.1-12.9.8-19.4 2.5-17.4 5-34.7 8.2-52 1.4-6.6 3.3-13 5.8-19.3 1.2-3 3.6-5.6 5.6-8.4l1.8.6c-2.6 8.8-5.1 17.6-7.7 26.3.5.1.9.3 1.5.4 3.6-8.2 8.1-16.2 10.5-24.6 4.1-13.7 11-25.6 23.2-35.1 1.1-.8 2.3-1.5 5-3.3-1.9 8.2-3.4 15-4.9 21.8.6.2 1.2.4 1.9.6 3.4-6.6 7.1-13.1 9.9-19.9 1.4-3.4 2.8-5.3 7.1-4.8 4.1.6 5.8-.9 6.7-4.4 1-4.4 2.9-8.6 5.5-12.5v5.7c25.4-6 51.6-7.7 77.5-9.7 7.4-.6 14.9 1.6 22.4 2.2 6 .4 12 .3 18 .4 16.8.2 33.7-1 49.7 5.6 8.8 3.6 13.9 9.9 20 15.7 2.3 2.2 4.4 4.4 6.5 6.7.6-.2 1.3-.3 1.9-.5-.7-5.9-1.3-11.7-2-17.6.4 0 .8-.1 1.2-.2 1.5 5 3 10.1 4.4 15.1.8 3 2 4.5 6.4 5 8.9 1 14.4 6.6 18.8 12.9-6.2-5.4-12.7-10.2-22.4-11.4.6 2.7.9 4.6 1.4 6.5-1.4-2.5-2.8-5.1-4.4-8.2-5.4 41.2-14.5 80.3-54.2 108.7 2.5.6 4.2.6 5.4-.2 6.5-4.1 12.6-8.9 19.5-12.5 18.8-9.6 28.7-24.6 35.1-41.5 2.7-7.1 3.2-15.1 2.8-22.6-.4-8.1-2.9-16-4.6-24 6.4 15.3 10.2 30.8 4.1 46.8-6.8 17.8-18.4 33-35.8 44.5-6.2 4.1-13 7.4-20.3 11.5 16.3 5.3 34.3 2.4 46.1 14.5q2.7-1.5 5.1-3.3c8.5-8.2 17.9-15.9 25.3-24.7 16-18.7 23.6-39 10.3-61.5-3-5.2-6.1-10.4-9.2-15.6-1.2-2.3-2.8-4.7-4.3-7.1zm-155 44.2c-3.3 11.9-5.8 23.9-4.9 37.1 5.4-4.5 10.5-8 11-14.2.8-10.5 7.5-18.7 14.2-26.9 4.6-5.6 9.6-10.9 13.5-16.9 13-19.7 15.3-39.6.5-59.5-2.6-3.5-5.6-6-10.5-6-10.6 0-21.4-.4-31.9.5-15.6 1.3-31.2 3.2-46.6 5.7-5.5.9-12.5 3.3-15.2 7-3.6 5.1-4.9 12-5 18.1-.2 21.8 5.5 42.6 18.3 61.7 8.1 12 16.1 23.9 28.2 33.4 4 3.1 7.8 4.1 12.3 1.1-5.8-21.9 4.7-45.8 21.2-47.6-1.6 1.9-3 3.6-4.6 5.3-1.5.7-3.4 1.2-4.6 2.2-8.8 8.5-12.3 18.7-12 29.9.1 3.3.9 6.6 1.4 9.8 5.3.3 6.5-2 6.8-4.9.2-3.3-.2-6.7.5-9.9 2.4-8.7 5-17.3 7.4-25.9zM215 61.8c2.1 3.3 3 4.9 4.1 6.4 9 13.8 11.6 28.5 4.9 43.3-4.2 9.3-10.5 18-16.5 26.8-4.3 6.3-9.8 12-13.9 18.4-2.3 3.6-3.2 7.9-4.7 11.9.5.2 1.1.4 1.5.6 10.9-10.9 22.4-20.9 38.3-26.6-15.6 12.5-28.4 26.8-40.3 42.3 6.8 0 14.6.7 19-2.2 19.3-12.6 37.7-26.2 56.3-39.7 13.7-10.2 24.8-22.7 32.6-36.7 8.6-15.1 8.3-14.8-3.5-28-9.6-10.6-22.1-15.7-37-16.4-13-.6-26.1-.1-40.8-.1zM255.3 195c14.5-12.9 30.2-26.2 37.5-45s14.9-47.6 13.5-55.8c-.4.6-.8 1.2-1.2 1.9-7.3 18.6-20.2 35.1-37.5 48-16.9 12.5-34.3 24.5-51.5 36.8-1.5 1.1-3 2.2-3.6 2.7 13.9 3.7 27.9 7.4 42.8 11.4zm-120.5 5.4c-1.6-1.1-3.2-2.3-4.7-3.6-5.6-5.9-13.2-11.1-16.3-17.9-10.6-22.8-17.9-46.5-15.2-71.5.9-9.1 2.8-18 4.4-27.4-3.2.3-6.3-2-8.5 2.6-4 8.8-8.7 17.4-14.1 25.6-3.5 5-5.3 10.7-5.1 16.5.9 27.3 16.5 49.5 33.7 71.1 4.8 6 11.1 8.5 19.5 5.5 1.3-.6 3.2-.5 6.3-.9zm-23 2.7c-13.5-11.9-22.1-27.3-30-42.8-4.8-9.3-7.4-19.6-9.5-29.7-1.5-7.4-1.6-15.1 1.5-22.6 2.6-5.9 3.6-12.4 5.6-19.5-1 .3-1.9.7-2.8 1.2q-1.65 1.5-3 3c-8.8 9.4-13 20.2-15.2 31.9-3.3 17.2-1.4 34 6.5 49.8 6.2 12.2 14.4 23.6 21.8 35.3.8 1.1 1.7 2.2 2.7 3.2 7.9-3.5 15.1-6.7 22.4-9.8zm223.7 174.3 2.5.3c2.7-7.2 6.1-14.3 7.9-21.7 4.6-17.9 7.8-36 12.5-53.8 5.3-20.4 9.9-40.8 8.3-61.8-.6-7.4-2-14.8-3-22.2-.6.1-1.1.1-1.6.2v2.5c.6 23.4-4.4 45.1-25.6 61.9-1.2.9-1.5 3.2-1.3 4.8.6 5.3 1.8 10.5 2.3 15.8 2.3 21.6.8 43.2-2 64.8-.4 3.1 0 6.2 0 9.2zM85.3 216.2c-21-11.5-41.4-23.4-46.1-46.7-2.2 10.1-3.6 20.1-5.7 30-3.4 16.4 2.8 29.1 18.9 38.3 2.7 1.6 5.3 3.5 7.8 5.2 1.5.8 3.1 1.6 4.7 2.2 6.9-9.9 13.5-19.2 20.4-29zm16.5-121.9c-.8 7.1-2.1 14.2-2.2 21.3-.4 21 6.7 40.8 14.7 60.3 3.7 8.9 11.4 15.4 20.1 21 1.3.8 4.1 1.2 5.4.6 5.1-2.2 9.9-4.9 14.5-7.3-30.4-26.7-48.7-58.2-52.5-95.9zm255.8 86h-1.2c-.4.7-.8 1.5-1.1 2.3-3.2 20-10.2 38.6-25.1 54.6-.7.8-1.3 2.3-.8 3.1 4.3 9.7 8.9 19.3 13.7 29.3 1.6-2.3 4.2-4.5 5.3-7.2 3.4-9.8 8.2-19.7 9-29.7 1.2-17.4.1-34.9.2-52.4zM58.3 365.1c.5-.1.9-.2 1.3-.3-.7-5.3-1.5-10.5-2-15.8-1.8-18.4-3-36.8-5-55.2-.6-5.9-1.5-12.4-4.8-17.4-6-9-10.2-18.3-11.4-28.5-.5-4-.9-8.1-1.4-12.1-2.6 13.7-3.9 27.4-.1 41 7 25.8 13.8 51.5 20.7 77.3 1 3.7 1.8 7.4 2.7 11zm297.4-198.4c-7.9 21-26.3 35.1-43.8 49.9 5 6.6 10.2 13.2 14.7 19.2 18.9-20.2 24.5-44.4 29.1-69.1zM53.2 134.9c-7.4 15.3-13.3 29.3-6.5 44.7 4.7 10.6 26.4 28.5 36.2 30-6-9.6-11.9-18.9-17.6-28.3-4.6-7.5-9-15.1-9.8-23.8-.8-7.1-1.5-14.1-2.3-22.6zm-11.9 99.9c-2.6 8.8 2.7 31.6 10 36.9 2.9-8 6-16 8.9-24.1-6.1-4.2-12.3-8.4-18.9-12.8zm158.8-70.6c-7.1 6.8-14.2 13.5-21.6 20.5 5.3.4 10-4.1 21.6-20.5z\"/><path d=\"M181.2 145c1.5-1.7 2.9-3.4 4.6-5.3-16.5 1.9-27.1 25.8-21.2 47.6-4.6 3-8.4 2-12.3-1.1-12.1-9.5-20.2-21.4-28.2-33.4-12.8-19.1-18.6-39.8-18.3-61.7.1-6.1 1.4-13 5-18.1 2.6-3.7 9.6-6.1 15.2-7 15.4-2.5 31-4.4 46.6-5.7 10.5-.9 21.2-.5 31.9-.5 4.9 0 7.9 2.5 10.5 6 14.7 20 12.4 39.9-.5 59.5-3.9 5.9-8.9 11.3-13.5 16.9-6.8 8.2-13.4 16.4-14.2 26.9-.5 6.2-5.6 9.7-11 14.2-1.1-13.2 1.5-25.2 4.9-37.1 0-.4.2-.8.5-1.2z\"/><path d=\"M215 61.8c14.7 0 27.8-.5 40.7.1 14.9.7 27.4 5.8 37 16.4 11.9 13.2 12.1 12.9 3.5 28-7.8 14-18.9 26.5-32.6 36.7-18.4 13.5-37 27.1-56.3 39.7-4.4 2.9-12.3 2.2-19 2.2 11.9-15.5 24.7-29.8 40.3-42.3-15.9 5.6-27.4 15.7-38.3 26.6-.5-.2-1.1-.4-1.5-.6 1.5-4 2.3-8.4 4.7-11.9 4.2-6.4 9.7-12.1 13.9-18.4 6-8.7 12.3-17.4 16.5-26.8 6.8-14.8 4.1-29.4-4.9-43.3-.9-1.5-1.9-3.1-4-6.4zM335.4 102c1.6 2.4 3.3 4.8 4.8 7.3 3.2 5.2 6.1 10.4 9.2 15.6 13.3 22.6 5.7 42.8-10.3 61.5-7.6 8.8-16.8 16.6-25.3 24.7q-2.4 1.8-5.1 3.3c-11.8-12.1-29.6-9.2-46.1-14.5 7.4-4.1 14.1-7.5 20.3-11.5 17.4-11.5 29.1-26.7 35.8-44.5 6.1-16 2.3-31.5-4.1-46.8l.1.2c-.4-1.9-.8-3.9-1.4-6.6 9.7 1.2 16.2 6 22.4 11.4-.1 0-.2 0-.3-.1z\"/><path d=\"M255.3 195c-14.9-3.9-28.8-7.6-43-11.4.6-.5 2.1-1.6 3.6-2.7 17.2-12.2 34.7-24.3 51.5-36.8 17.3-12.9 30.2-29.4 37.5-48 .3-.7.7-1.3 1.2-1.9 1.4 8.2-6.2 36.9-13.5 55.8-7.2 18.8-22.8 32.1-37.3 45zm-120.5 5.4c-3 .4-4.9.3-6.4.9-8.4 3-14.7.6-19.5-5.5C91.7 174.2 76 152 75.1 124.7c-.2-5.8 1.6-11.5 5.1-16.5 5.4-8.2 10.1-16.8 14.1-25.6 2.1-4.6 5.4-2.3 8.5-2.6-1.5 9.4-3.4 18.4-4.4 27.4-2.7 25 4.7 48.7 15.2 71.5 3.2 6.8 10.7 12 16.3 17.9 1.2 1.1 2.6 1.9 4.9 3.6z\"/><path d=\"M111.7 203.1c-7.2 3.2-14.5 6.4-22.3 9.8-1-1-1.9-2.1-2.7-3.2-7.4-11.7-15.6-23.1-21.8-35.3-7.9-15.8-9.8-32.6-6.5-49.8 2.2-11.8 6.4-22.6 15.2-31.9.9-1 2-2 3-3 .9-.5 1.8-.9 2.8-1.2-2 7.1-3 13.6-5.6 19.5-3.3 7.5-3.2 15.2-1.5 22.6 2.1 10.1 4.7 20.4 9.5 29.7 7.9 15.4 16.4 30.9 29.9 42.8zm223.8 174.3c0-3-.4-6.1 0-9.1 2.8-21.5 4.3-43.1 2-64.8-.6-5.3-1.8-10.5-2.3-15.8-.2-1.6.1-3.9 1.3-4.8 21.1-16.9 26.3-38.5 25.6-61.9v-2.5c.6-.1 1.1-.1 1.6-.2 1.1 7.4 2.5 14.8 3 22.2 1.6 21-3 41.4-8.3 61.8-4.7 17.8-7.9 35.9-12.5 53.8-1.9 7.4-5.3 14.5-7.9 21.7-.9-.1-1.7-.3-2.5-.4zM85.3 216.2c-6.9 9.8-13.5 19.1-20.4 28.9-1.8-.8-3.3-1.4-4.7-2.2-2.7-1.7-5.1-3.6-7.8-5.2-16.1-9.3-22.3-22-18.9-38.3 2.1-9.9 3.5-19.9 5.7-30 4.7 23.4 25 35.3 46.1 46.8zm16.5-121.9c3.7 37.7 22.1 69.2 52.5 96-4.6 2.3-9.3 5-14.5 7.3-1.8.5-3.8.3-5.4-.6-8.6-5.6-16.3-12.2-20.1-21-8.2-19.5-15.1-39.3-14.7-60.3.1-7.2 1.4-14.3 2.2-21.4zm212.6 2.8c1.6 8 4.1 16 4.6 24 .4 7.5-.1 15.5-2.8 22.6-6.4 16.9-16.3 31.9-35.1 41.5-7 3.5-13 8.4-19.5 12.5-1.2.7-3 .8-5.4.2 39.7-28.5 48.8-67.5 54.2-108.7 1.6 3.1 3 5.6 4.4 8.2-.2 0-.4-.1-.4-.3z\"/><path d=\"M357.5 180.3c0 17.5 1.1 35-.5 52.4-.8 10-5.6 19.9-9 29.7-.9 2.7-3.5 4.9-5.3 7.2-4.7-10-9.2-19.6-13.7-29.3-.2-1.1.1-2.2.8-3.1 14.9-16 22.1-34.6 25.1-54.6.2-.8.6-1.6 1.1-2.3zM58.3 365.1c-.9-3.7-1.8-7.3-2.8-11-6.9-25.8-13.8-51.5-20.7-77.3-3.7-13.6-2.5-27.3.1-41 .5 4 .9 8.1 1.4 12.1 1.2 10.3 5.5 19.5 11.4 28.5 3.3 5 4.1 11.5 4.8 17.4 2 18.4 3.3 36.8 5 55.2.5 5.3 1.4 10.5 2 15.8-.3.2-.8.3-1.2.3z\"/><path d=\"M355.7 166.7c-4.6 24.7-10.2 48.9-29.1 69.1-4.6-6-9.7-12.6-14.7-19.2 17.5-14.8 35.8-28.9 43.8-49.9zM53.2 134.9c.8 8.5 1.6 15.5 2.2 22.6.8 8.7 5.3 16.3 9.8 23.8 5.7 9.4 11.7 18.7 17.6 28.3-9.8-1.4-31.5-19.3-36.2-30-6.7-15.4-.8-29.5 6.6-44.7zm-11.9 99.9c6.7 4.5 12.8 8.6 19 12.8-3 8.1-6 16.1-8.9 24.1-7.6-5.4-12.7-28.1-10.1-36.9zM181.2 145c-.2.4-.6.8-.8 1.2-2.5 8.6-5 17.2-7.1 25.8-.8 3.2-.2 6.6-.5 9.9-.2 2.9-1.5 5.2-6.8 4.9-.5-3.1-1.4-6.5-1.4-9.8-.2-11.2 3.3-21.3 12-29.9 1.5-.8 3-1.5 4.6-2.1zm18.9 19.2c-11.6 16.4-16.5 20.8-21.6 20.5 7.4-6.9 14.5-13.7 21.6-20.5z\"/></g>",
        "female12": "<g fill=\"$[hairColor]\" stroke=\"#000\" stroke-width=\"4\"><path d=\"M9.4 262.8c.5-4.5.7-9 1.6-13.4 3.4-17.4 5.4-35 13.1-51.5 3.9-8.4 8.2-16.6 14-24.2.6-.8 1.2-1.8 1.5-2.7 5.4-16.4 16.1-30.1 28.7-42.7 14.3-14.4 30.5-26.8 48.3-37.5 16.1-9.7 34-15.1 53.1-17.7 3.2-.4 6.5-.6 9.8-.9.6-.1 1.2-.3 1.8-.5h1.5c8.8 1.8 16.9 5.1 24.6 9 3.4 1.7 5.7 2 9.1.4 2.9-1.4 6.3-2.1 9.6-2.4 10.9-.9 21.7-.7 32.3 2.2 13.7 3.8 26.4 9 37.2 17.6 2.9 2.3 6.1 4.4 9.3 6.4 8.1 5.2 14.3 11.8 19.8 19.1 6.2 8.3 12.7 16.4 19 24.6 1.8 2.3 3.6 4.7 5.2 7.2 12.5 19.8 22.7 40.6 29.8 62.5 5.2 15.8 7.7 31.9 8 48.4.4 21.7-.7 43.3-5.6 64.7-.8 3.5-1.9 7-3.7 10.1-8.4 14.5-19.4 27.2-33.9 37.3-3.6 2.5-6.7 5.4-10 8.2-8.4 6.9-18.1 11.2-29.9 10.6-.6 0-1.2.1-1.7-.2-3-1.6-5.4-.1-7.8 1.3-1.8 1-3.6 2-5.5 2.8-.8.3-2.4.5-2.8 0-.6-.6-.7-1.9-.5-2.7 1.9-5.6 4.5-11.1 5.7-16.9 2.3-10.8 4.4-21.6 5.6-32.5.6-5-.9-10.2-1.6-15.3-1-6.8-1.7-13.6-3.2-20.3-1.7-8-4.1-15.8-6.2-23.7-5.3-19.8-15.6-37.9-25.2-56.1-4.1-7.8-9.7-14.6-16.3-20.9-10.9-10.3-21.7-20.6-32.8-30.7-2.9-2.6-6.5-4.6-9.8-6.8-2.3-1.5-4.8-2.3-8.1-1.1-.1 1.6-.4 3.5-.4 5.4.1 11.7.2 23.4.5 35.1.4 17.3.7 34.6-.3 51.9-1.4 25.9.7 51.7 3.8 77.5 1.8 14.8 2.5 29.7 1.9 44.6 0 .7-.7 1.4-1.1 2.1-.4-.7-.9-1.4-1.1-2.1-.4-1.1-.4-2.3-.9-3.3-8.5-19.2-14-39-16.7-59.5-1.8-13.9-4.6-27.7-7-41.6-3.4-20.2-3.7-40.5-1.6-60.9.3-3.1 1.1-6.2 2.2-9.2 4.3-12.4 7.7-25.1 14.9-36.7-1.1 1.3-2.2 2.5-3.2 3.8-1.1 1.4-2 2.8-3.1 4.2-6.8 8.7-13.3 17.6-20.3 26.2-7.4 9-12.6 19-17.1 29.3-7.9 18.1-16.1 36.1-23.4 54.3-4 10-6.5 20.4-9.4 30.7-2.5 8.7-5.1 17.5-6.6 26.4-2.2 13.1-1.8 26.4 1.1 39.5 0 .1.1.3.1.4 1 3.1.7 3.5-2.8 2.5-6.9-1.9-13.9-3.6-20.3-6.2-2.9-1.2-5.6-2.2-8.7-2.6-9.9-1.5-17.2-6.4-22.8-13.5-4-5.1-7.7-10.5-11.8-15.5-5.4-6.5-7.7-14-10.5-21.5-1-2.8-3-5.3-4.7-7.9-4.7-7-7.3-14.7-9.3-22.6-2.8-11-4.6-22.1-5.1-33.4 0-.9-.3-1.7-.4-2.6.1-2.1.1-4.3.1-6.5zm293 132.1c5.8.4 11.1-.6 16.2-2.5 8.5-3.3 15.1-8.6 20.5-15.2.5-.6 1.1-1.2 1.6-1.7.1.1.3.1.4.2-.3 1.1-.5 2.1-.8 3.2.8-.7 1.3-1.6 1.4-2.5 1.6-9.4 3.4-18.8 4.5-28.2 2.7-22.3 1-44.4-5.4-66.2-5.4-18.7-13.6-36.5-22.5-54.1-2.9-5.8-6-11.6-9-17.4.4.2.7.5.8.8 6.9 13.6 14.3 27.1 20.7 40.9 16.8 36.2 21.6 73.6 14.1 112.2-.8 4.3-1.7 8.5-2.6 12.8h.6c.5-.3 1-.7 1.5-1.1 12.8-9.8 23.4-21.1 30.3-34.9.4-.8.8-1.8 1.5-2.2 1.8-.9 2.1-2.3 2.3-3.8 1.9-13 4.6-25.9 5.5-38.9.9-13.7.7-27.5 0-41.2-.7-14.9-4.9-29.4-9.9-43.7-7-20.2-17.3-39.1-29.2-57.3-5.4-8.3-12.3-15.7-18.5-23.6-3.2-4-6.2-8.2-9.6-12.1-7.3-8.4-33.2-26.2-44.2-30.3-13.4-5-27-8.7-41.9-7.7-6.6.4-12.8 1.5-18.5 4.5-1 .5-2.3.9-2.7 1.7-1.9 3.7-3.6 7.6-5.5 11.7 2.8-.7 4.9-1.3 7.1-1.7 10.2-1.5 20.3-.8 30.5.8 27.9 4.2 53.2 13.6 75.7 28.9 4.7 3.2 8.7 7.3 12.8 11 1 .9 1.5 2.1 2 2.9-4-3.5-7.8-7.5-12.3-10.8-10.9-7.9-22.8-14.4-35.7-19.4-15.6-6.1-31.8-10.2-48.7-12.3-10.1-1.2-20-1.3-29.9 1.5-1.5.5-2.4 1.1-2.7 2.4-1.1 4.8-2.8 9.6-3.3 14.5-1.6 17.2-2.8 34.4-4.1 51.5-.3 3.6-.2 3.6 3.6 4.9 5.9 2 10.7 5.4 15 9.2 9.2 8.1 18 16.4 26.9 24.8 7 6.5 14 13.1 18.8 21.1 9.5 15.9 18.2 32.1 24.4 49.1 4.2 11.6 7.3 23.5 10.2 35.4 2.1 8.5 3.2 17.2 4.2 25.9.7 5.3 1 10.7.6 16-.5 6.1-2.2 12.2-3.2 18.3-1.2 7.2-2.9 14.3-5.7 21.2-.8 1.8-1.4 3.8-2.2 6.1 5.4-2.5 9.7-5.7 14.8-7.6.2.2.3.4.5.6-.1.8-.4 1.4-.9 2.3zm-200-2.2c-.1-1.1-.2-1.9-.3-2.7-2.5-13.8-2.7-27.5.1-41.2 2.1-10.1 5.2-20.1 7.8-30.2 3.5-13.7 8.7-26.9 14.4-40 5.1-11.7 10.6-23.3 15.7-35 5.2-11.9 11.1-23.4 19.9-33.7 7.9-9.2 15.3-18.7 22.7-28.2 2.8-3.6 5.6-7.2 10.2-9.1.6-.3 1.2-1.2 1.2-1.8.4-7.2.6-14.4 1.2-21.6 1.1-13 2.4-26.1 3.9-39.1.5-4.4 2.3-8.7 3.5-13-.1 0-.2-.1-.4-.2-19-3.5-38-3.1-57 0-12 2-22.3 6.8-32.2 12.8-4.6 2.8-9.2 5.5-13.9 8.3-20.3 12-38.1 26.3-50.7 45.2-5.6 8.4-11.8 16.4-16.9 25-8.4 13.9-12.1 29.2-15.3 44.6-3.8 18.4-5.8 36.7-2.6 55.3 1.8 10.7 3.9 21.4 8.4 31.5 1.1 2.6 2.6 5 4 7.5-1.3-9.3-2.3-18.4-1.9-27.6.8 4.2 1.3 8.5 1.9 12.8 2.3 16.9 6 33.4 17.6 47.7 4.7 5.8 9.1 11.7 14.8 16.8 4 3.6 9.2 5.4 15.1 7.5-5.2-8.6-7.9-17.3-8.5-26.2-1.7-22.5.6-44.7 6.2-66.7 1.3-5.1 3.2-10 4.9-15.1-1 5.2-2.5 10.2-3.9 15.3-3.8 13.9-4.9 28.1-6.2 42.3-1.5 16.4-.4 32.5 7 47.9 1.1 2.3 2.3 3.1 5.2 3.1 1.2 0 2.5.3 3.4.8 6.2 3.6 13.4 4.9 20.7 7zm89.8-217.2c-.2-.1-.4-.2-.6-.2-1.5 2.3-3.1 4.5-4.4 6.9-5.8 10.4-8.9 21.7-12.7 32.7-.9 2.8-1.7 5.6-2 8.5-2.3 20.6-1.8 41.2 1.7 61.7 2.5 14.4 5.1 28.9 7.2 43.3 2.5 17.6 7.3 34.7 14 51.3.3.7.6 1.3.9 1.9.6-3.3.8-6.4.5-9.5-1.4-16.7-2.9-33.5-4.3-50.2-1.3-16-2.3-31.9-1.4-47.9 1-19.3 1.5-38.6.8-58-.5-12-.1-24.1-.1-36.2 0-1.3.2-2.8.4-4.3zm16.9-91.8c-3.9-2.8-18.5-8.7-24-8.9-5.9-.2-11.9.2-17.8.9-17.8 2.1-34.4 7.3-49.3 16.2-18.7 11.2-35.6 24.2-50.5 39.3-9.9 10-18 21.1-23.7 33.4-.4.8-.7 1.5-1 2.3 1.7-1.5 3-3.2 4.2-4.9 10.4-14.8 23.4-27.4 39.4-37.6 9.2-5.8 18.5-11.5 27.8-17.2 9.5-6 19.7-10.4 31.4-12.1 18.7-2.6 37.4-4.3 56 .4 1.5.4 2.2 0 2.7-1.3 1.5-3.4 3.1-6.8 4.8-10.5z\"/><path d=\"M384 255c-.7-14.9-4.9-29.4-9.9-43.7-7-20.2-17.3-39.1-29.2-57.3-5.4-8.3-12.3-15.7-18.5-23.6-3.2-4-6.2-8.2-9.6-12.1-7.3-8.4-33.2-26.2-44.2-30.3-13.4-5-27-8.7-41.9-7.7-6.6.4-12.8 1.5-18.5 4.5-1 .5-2.3.9-2.7 1.7-1.9 3.7-3.6 7.6-5.5 11.7 2.8-.7 4.9-1.3 7.1-1.7 10.2-1.5 20.3-.8 30.5.8 27.9 4.2 53.2 13.6 75.7 28.9 4.7 3.2 8.7 7.3 12.8 11 1 .9 1.5 2.1 2 2.9-4-3.5-7.8-7.5-12.3-10.8-10.9-7.9-22.8-14.4-35.7-19.4-15.6-6.1-31.8-10.2-48.7-12.3-10.1-1.2-20-1.3-29.9 1.5-1.5.5-2.4 1.1-2.7 2.4-1.1 4.8-2.8 9.6-3.3 14.5-1.6 17.2-2.8 34.4-4.1 51.5-.3 3.6-.2 3.6 3.6 4.9 5.9 2 10.7 5.4 15 9.2 9.2 8.1 18 16.4 26.9 24.8 7 6.5 14 13.1 18.8 21.1 9.5 15.9 18.2 32.1 24.4 49.1 4.2 11.6 7.3 23.5 10.2 35.4 2.1 8.5 3.2 17.2 4.2 25.9.7 5.3 1 10.7.6 16-.5 6.1-2.2 12.2-3.2 18.3-1.2 7.2-2.9 14.3-5.7 21.2-.8 1.8-1.4 3.8-2.2 6.1 5.4-2.5 9.7-5.7 14.8-7.6.2.2.3.4.5.6-.4.6-.7 1.2-1.2 2.1 5.8.4 11.1-.6 16.2-2.5 8.5-3.3 15.1-8.6 20.5-15.2.5-.6 1.1-1.2 1.6-1.7.1.1.3.1.4.2-.3 1.1-.5 2.1-.8 3.2.8-.7 1.3-1.6 1.4-2.5 1.6-9.4 3.4-18.8 4.5-28.2 2.7-22.3 1-44.4-5.4-66.2-5.4-18.7-13.6-36.5-22.5-54.1-2.9-5.8-6-11.6-9-17.4.4.2.7.5.8.8 6.9 13.6 14.3 27.1 20.7 40.9 16.8 36.2 21.6 73.6 14.1 112.2-.8 4.3-1.7 8.5-2.6 12.8h.6c.5-.3 1-.7 1.5-1.1 12.8-9.8 23.4-21.1 30.3-34.9.4-.8.8-1.8 1.5-2.2 1.8-.9 2.1-2.3 2.3-3.8 1.9-13 4.6-25.9 5.5-38.9 1.2-13.5.9-27.3.3-41z\"/><path d=\"M192.9 172.6c.6-.3 1.2-1.2 1.2-1.8.4-7.2.6-14.4 1.2-21.6 1.1-13 2.4-26.1 3.9-39.1.5-4.4 2.3-8.7 3.5-13-.1 0-.2-.1-.4-.2-19-3.5-38-3.1-57 0-12 2-22.3 6.8-32.2 12.8-4.6 2.8-9.2 5.5-13.9 8.3-20.3 12-38.1 26.3-50.7 45.2-5.6 8.4-11.8 16.4-16.9 25-8.4 13.9-12.1 29.2-15.3 44.6-3.8 18.4-5.8 36.7-2.6 55.3 1.8 10.7 3.9 21.4 8.4 31.5 1.1 2.6 2.6 5 4 7.5-1.3-9.3-2.3-18.4-1.9-27.6.8 4.2 1.3 8.5 1.9 12.8 2.3 16.9 6 33.4 17.6 47.7 4.7 5.8 9.1 11.7 14.8 16.8 4 3.6 9.2 5.4 15.1 7.5-5.2-8.6-7.9-17.3-8.5-26.2-1.7-22.5.6-44.7 6.2-66.7 1.3-5.1 3.2-10 4.9-15.1-1 5.2-2.5 10.2-3.9 15.3-3.8 13.9-4.9 28.1-6.2 42.3-1.5 16.4-.4 32.5 7 47.9 1.1 2.3 2.3 3.1 5.2 3.1 1.2 0 2.5.3 3.4.8 6.3 3.6 13.4 4.8 20.7 6.9-.1-1.1-.2-1.9-.3-2.7-2.5-13.8-2.7-27.5.1-41.2 2.1-10.1 5.2-20.1 7.8-30.2 3.5-13.7 8.7-26.9 14.4-40 5.1-11.7 10.6-23.3 15.7-35 5.2-11.9 11.1-23.4 19.9-33.7 7.9-9.2 15.3-18.7 22.7-28.2 2.8-3.5 5.5-7 10.2-9z\"/><path d=\"M192.5 322c-1.3-16-2.3-31.9-1.4-47.9 1-19.3 1.5-38.6.8-58-.5-12-.1-24.1-.1-36.2 0-1.5.3-3 .4-4.5-.2-.1-.4-.2-.6-.2-1.5 2.3-3.1 4.5-4.4 6.9-5.8 10.4-8.9 21.7-12.7 32.7-.9 2.8-1.7 5.6-2 8.5-2.3 20.6-1.8 41.2 1.7 61.7 2.5 14.4 5.1 28.9 7.2 43.3 2.5 17.6 7.3 34.7 14 51.3.3.7.6 1.3.9 1.9.6-3.3.8-6.4.5-9.5-1.4-16.5-2.9-33.2-4.3-50zm-106-197.6c9.2-5.8 18.5-11.5 27.8-17.2 9.5-6 19.7-10.4 31.4-12.1 18.7-2.6 37.4-4.3 56 .4 1.5.4 2.2 0 2.7-1.3 1.5-3.5 3.1-7 4.7-10.6-3.9-2.8-18.5-8.7-24-8.9-5.9-.2-11.9.2-17.8.9-17.8 2.1-34.4 7.3-49.3 16.2C99.3 103 82.4 116 67.5 131.1c-9.9 10-18 21.1-23.7 33.4-.4.8-.7 1.5-1 2.3 1.7-1.5 3-3.2 4.2-4.9 10.4-14.7 23.4-27.4 39.5-37.5z\"/></g>",
        "female2": "<g fill=\"$[hairColor]\" stroke=\"#000\" stroke-width=\"4\"><path d=\"M410.1 326.4c-7 23.9-14.2 47.7-21 71.6-.9 3.6-1.3 7.2-1.4 11-.6 8.8 3.2 15.9 9.9 21.9 1.4 1.2 1.8 3.3 2.6 5-2 .4-4.4 1.6-6.3 1.3-9.5-1.5-18-6.6-23.5-14.1-3.1-4.3-6.9-8.2-11.1-11.7 3.9 7.9 7.5 15.9 11.6 23.9 1.9 3.8 4.5 7.4 6.6 11.1.5.9.2 2.1.3 3.1-1.1-.4-2.8-.4-3.4-1.2-4.8-7-9.3-14.2-14.1-21.2-11.3-16.4-21-33.6-24.8-53.2-.2-.6-.5-1.1-.9-1.6-8.9 9.8-13.8 21-14.4 33.7-.9 17.5.6 34.5 7.1 51.1.7 1.7.8 3.6.3 5.4-.8-.4-1.5-1-2.1-1.6-11.2-16.9-17.5-36.2-18.4-56.1-.9-20.7 5.9-39.5 18.1-56.6 1.1-1.5 1.3-3.9 1.1-5.8-.6-7-1.5-14-2.3-21.1-4.3 6.3-5.5 14.4-13.1 19.2 0-10.4.4-20.1-.1-29.7-.4-7-.9-14.3-2.9-21.1-2.3-7.8-6.3-15.3-9.9-22.7-1.2-2-3-3.6-5.3-4.6-26.1-12.4-50.6-27-72.3-45.5-6.1-5.2-11.7-11.1-17.3-16.3-25.6 27-57.3 46.4-91.7 62.4-2.4 1.2-4.7 2.8-6.5 4.8-4.7 4.5-9.1 9.2-13.3 14.2-2.5 3-4.4 6.6-5.4 10.4-3.5 14.9-3.1 30-2.8 45.2v4.1c-4.3-.3-5-3.3-5.6-6.2-2.2-11.3-4.3-22.5-6.6-33.7-1.9-9.6-4.3-19.2-6.5-28.8-.4-1.4-1.4-2.6-2.8-3.3.3 2.8.4 5.7.9 8.4 1.6 8.7-.1 16.9-3.5 25-4.9 11.7-9.8 23.4-14.4 35.2-.9 2.3-1 5.7.1 7.7 14.5 27.6 30.6 54.2 53.9 76.2.7.6 1.3 1.2 1.8 1.9.2.2.1.5.1.8-10.3 2.5-46-27.1-65.6-54.8-1.3 13.4-2 25.7 4 37.7 5.7 11.5 13.3 21.7 22 31.5l-.8 1c-9.3-5.7-18.8-11.4-28.2-17.2-8.8 7.4-18.9 12.1-32 12.4 1.5-1.2 2.2-1.8 3-2.3 7.9-5.8 9.2-13.8 8.6-22.5-1.1-17.9-7.5-34.5-15.8-50.3-4.6-8.8-6.8-17.7-6-27.1.9-12.5.5-25.1 4-37.6 3.1-11.1 8-21 16.3-29.2 9-9 18.5-17.6 27.6-26.4 1.2-1.2 2.5-3.1 2.4-4.7-.7-9.4 2.1-18.9 8.1-26.5 4.3-5.7 9.3-10.7 13.8-16.1 1.8-2.3 4-5 4.7-7.7 8.5-31.4 29-54.1 57.9-70.6 8.7-5 18.1-9.2 27.4-13.4 10.7-4.8 22.5-6.5 34.2-4.9 14.2 1.9 28.4 2.9 42.9 1 9.5-1.2 18.6 1.6 27.2 5.1 26.8 11.1 50.5 25.9 67.4 48.8 7.9 10.6 12.6 22.4 16.5 34.7 1.1 2.8 2.6 5.4 4.7 7.7 5.7 7.5 12.2 14.4 17.5 22.2 4.6 6.9 5.7 14.9 3.9 23-.7 3 .5 4.7 2.3 6.9 9.7 11.4 19.7 22.7 28.7 34.7 6.9 9.1 10.6 19.9 12 31.2.2.8.5 1.7.8 2.4-.2 3.8-.2 8.1-.2 12.5zM64.8 232.9c5.3-10 13.1-18.8 22.7-25.4 13-9 25.7-18.2 39.3-26.4 22.1-13.7 46.2-23.2 73.2-26.1.7-5.7 1.4-11.7 2.2-18.6-9.9 0-19.4-1-28.6.2-32.1 4.1-61.5 15.3-88.3 32.3-7.4 4.7-13.4 10.3-15.5 19.7-3.4 14.6-5.5 29.2-5 44.3.2 3.3.5 6.7.6 10 .1 4 2.3 5.3 6.1 4.3 5.7-1.5 11.7-2.5 16.9-5 12.7-5.7 25.9-10.7 37.4-18.2 24.3-15.9 47.6-33.2 71.3-50 1-.6 1.7-1.6 2-2.7.5-4.6.6-9.2.9-15.4-11.3 2.8-21.8 4.5-31.7 8-38.7 14.3-72.3 35.6-99.7 65.2-1.2 1.3-2.5 2.6-3.8 3.8zm237.3 33.8c3.8 10.8 9.1 21.3 11 32.5 1.8 11 .4 22.3.4 33.3 5-7 10.6-22.3 12.2-30.8 1.7-9.2 3.6-18.4 10.2-26.1 1.9-2.2 4.1-5 4.4-7.7.6-5 0-10.3-.6-15.2-.1-1-2.1-2.4-3.5-2.6-22.1-2.4-42.2-10.4-61.4-20.6-26.4-14-49.1-33.3-66.8-56.4-1.1-1.7-2.2-3.6-3.1-5.5 1.1.1 1.5 0 1.7.2.4.4.9.8 1.2 1.3 16 21.1 36.3 39.1 59.9 52.7 20.4 12 42 21.1 66.3 24.1 2.5.3 5.1.3 7 .4 4.4-10.4.4-17.2-8.1-23.6-14.1-10.8-28.6-20.8-44.7-29-22.7-11.6-45.6-22.6-70.5-29.6-4.7-1.3-9.5-1.6-14.9-2.4 0 9.2.1 17.5 0 25.7-.1 5.7 1.8 10.9 6.2 14.7 8.5 7.9 17 16 26.4 23 19.3 14.6 39.8 27.4 62.8 36.4l32.7 13c.3.1.5.6.6.9l-.6 1.2q-15-4.95-28.8-9.9zM203 159.5c27.3 2.6 50.5 15 74.1 26 23.7 11 45.7 24.6 65.5 43-.5-13.8-1.6-26.3-5.1-38.4-1.7-6.2-3.5-12.2-8.7-16.5-10.1-8.5-19.7-17.7-30.4-25.7-15.8-12-34.1-17.7-54.3-13.3-10.4 2.1-20.3 5.7-30.2 9.2-12 4.5-10.7 5.2-10.9 15.7zM359.2 252c3.1 2.5 6.1 4.7 8.6 7.1 16.1 15.5 27.5 49.8 5.2 74.7-6.2 6.8-12.7 13.3-19.6 19.5-4.1 3.7-5.9 7-4.6 12.3 1 4.3.7 8.7 1.3 13.1 1.3 10.7 3.1 21.2 11.2 29.7 6.2 6.6 12.1 13.5 18.8 19.6 4.1 3.7 9.2 6.8 15.5 5.9.1-.6.2-.8.1-.9-.4-.5-.8-.9-1.2-1.3-7.8-5.3-11.1-12.7-10.6-21.4.4-6.3.8-12.7 2.7-18.7 4.8-15.1 10.4-30.1 15.5-45.1 8.8-25.4 5.5-49.1-10.6-71.3-8-11.1-16.7-21.6-26.9-31.1-2 2.8-3.7 5.5-5.4 7.9zM80.3 323.7c.5-6.6.8-13.3 1.3-20 .7-11 2.9-21.2 12.6-28.8 2-1.6 3.6-4.1 5.4-6.1-8.1 1.8-15.4 5.1-23.4 5.7 2.4-1.4 5.2-2.1 7.7-3 27.7-9.5 53.9-22.9 77.5-39.7 13-9.2 24.7-20.2 36.8-30.4 1.7-1.6 2.7-3.9 2.8-6.2-.3-6.1-1.3-12.1-2.1-18.6-1.3 1-2.2 1.6-3.1 2.3-17 12.4-33.7 25.3-51.2 37.1-22.7 15.5-46.7 28.9-74.7 34.4-.9.2-1.7.8-2.2 1.6-2.9 6-1 15.8 2.4 19.2-.4 2.6-1.1 4.4-.8 5.7 3.4 15.7 7.3 31.2 11 46.8zM6.9 378c.4-4.4.5-8.7 1.1-13 1.8-11.1 8.1-20.4 14.1-29.9 2.5-4.1 4.7-7.7 4.6-13.2-.3-15.7 2.5-31.4 9.7-45.8 4.1-7.7 6.5-16.2 6.9-24.9.2-3.7-.7-7.5-1.1-11.2-.7-.2-1.3-.3-2-.4-11.5 12-23.2 23.7-34.2 35.9-3.5 3.9-5.6 9.1-7.5 14.1-6.9 18.4-6.9 37.4-6 56.4.2 1.9.8 3.8 1.7 5.5 4 8.8 8.4 17.4 12.7 26.5zm344.9-115.9c7.6 7.6 11.1 16.4 10.4 26.3-1.2 15.8-9.3 29.6-18.3 42.6-4.6 6.7-11 12.3-15.7 18.8-19.4 26.2-22.3 54.5-12.2 84.5.6 1.5.9 3 1.6 4.6.6 1.3 1.2 2.5 1.4 3-.6-10.3-1.1-21.1-1.7-32.1-.8-17.2 7.4-31.4 18.1-44 7.3-8.7 17.1-15.5 25.6-23.4 7.7-7.1 14.8-14.9 18.3-24.7 7-19.6 1.6-37.1-10.5-53.5-2.8-3.8-6.8-6.9-10.7-10.6-2.5 3.4-4.4 5.7-6.3 8.5zM54 260.8c1.9 17.1-4.7 31.5-12.7 45.5-6.4 11.3-13.1 22.3-19.9 33.4C15.3 349.8 9 360 9.3 372.1c.4 31.2 17.2 47.3 43.7 60.4 0-.1.1-.3 0-.3-1.1-1.6-2.2-3.1-3.5-4.7-17.6-21-21.4-44.7-13.2-69.8 5.1-16 11.3-31.7 18.4-47 6-12.8 7.5-25.5 5.8-39-.5-4.5-1.9-7.8-6.5-10.9zm20.7-86.7c27.2-21.7 58.4-33.5 92.1-40 11.7-2.3 23.3-1.3 35.7 1.5-.6-3.5.1-7.1-1.6-8.8-7.5-7.7-16.3-14.2-28-14.3-10.9-.1-21.8.4-32.7 1.4-4.5.3-9.6 1.2-13.2 3.6-9.7 6.3-19.1 13.2-27.9 20.6-11.2 9.6-18.9 21.7-24.4 36zm254.6-3.9c.3-.2.5-.3.7-.5-.1-.5-.3-1.1-.6-1.6-1-2-1.9-4-3.1-5.9-12.8-22.3-32.9-37.4-55.9-49.2-1.8-.8-3.8-1.3-5.8-1.3-20.5-.7-39.2 4.9-57 13.7-.6.3-1.1.9-1.2 1.6-.6 6.2-1.2 12.4-1.8 18.5 12.5-5.7 25.4-10.6 39.1-13.2 25.4-4.9 46.5 2.9 64.7 19.2zm.5 172.4c4.3-5.1 7.6-9 10.8-13.2.7-1.1 1-2.4.7-3.7-2-10.6.2-20.3 5.6-29.6 3-5.1 5.7-10.4 8-15.7 2.8-6.8 1.3-10.7-4.9-15.7-3 2.7-6.2 5.4-9.1 8.2-1.8 1.6-3.5 3.5-4.8 5.6-4.4 8.3-6.6 17.3-7.5 26.5-1.3 12.1-.6 24.1 1.2 37.6zm-288.7 4.3c-.9 3.3-2 6.8-3.2 10-2 5-1.1 9.2 1.7 13.7 11.4 18 27.1 33.2 45.9 44.4.3.2.7.2 1.1.2-7.9-11.1-16-21.8-23.6-33.1-7.6-11.5-14.5-23.1-21.9-35.2zm99-236.1c22.6-2.3 44.7-4.8 62.1 13.9.6-7.7 1.3-14.1 1.6-20.5 0-1-1.3-2.7-2.2-2.9-21.4-3.7-41.9-2.9-61.5 9.5zm66.2 11.4c8.7-3.2 17.1-7 25.9-9.3s18.2-3.3 26.8-5c-11-7.6-35.5-10.1-51.7-5-.3 6.5-.6 13.1-1 19.3zM51 256.6c-13.6 15.8-11.8 33.8-13.6 51.2 12.4-18.6 17.5-36.9 13.6-51.2zM345.5 361c-2 1.8-2.9 2.7-3.9 3.5-4.4 3-5.2 6.7-3.1 11.5 2 5 2.9 10.3 5.1 15 4.3 9.1 9 18.1 13.6 27 .6-.2 1.1-.4 1.8-.6-8.9-17.6-13.5-36.9-13.5-56.4zm13.1-80c-6.4 14-19 26.3-14.9 44.5 9.6-14.1 16.5-27.9 14.9-44.5zm-296-15.1c.6-.1 1.2-.3 1.8-.3 0-6.4.3-12.9-.1-19.3-.4-5.5-1.6-11-2.1-16.3-.2-2.6-.2-5.3-.1-7.8l-2.3-.3c-1.5 6.2-3.9 12.3-4.4 18.5-.5 6.1-1.9 12.7 4.2 18.6-2-.4-2.7-.6-4.2-1 2.6 2.9 4.9 5.5 7.2 7.9zm282.9-43.2c-.3 4.5-.2 8.8-.8 13-1.5 10-4.3 20.1-.4 30 11.2-9.1 9.2-34.4 1.2-43zM54.4 256.2c-.6-1.8-1-3.8-1.3-5.7-.8-9.7.5-19.3 5.8-27.9 2.9-4.7 3.9-7.9 2.6-13.7-7.5 8.1-12.7 16.6-14.3 27.6-1.1 7 .9 11.7 5 16.6.6.7 1 1.5 2.2 3.1zM12.8 401c1.4 11.2 3.1 22.4-6.4 31.8.4.3.6.6 1 .9 7.6-4.1 15.1-8.1 22.2-11.9-6-7.5-11.4-14.1-16.8-20.8zm332.4-190.9c.2 5.1-1.1 10.6 3.8 14.6 1.1 1 1.7 2.8 2 4.4 1.3 6.3 2.3 12.6 3.6 19 .3 1 .7 1.9 1.2 2.9 1-.7 2-1.4 2.9-2.2 2.9-3 .9-6.6.9-10-.1-11.9-6.3-20.6-14.4-28.7zM63.9 195.3c-16.3 15.1-24.5 32.8-18 43.9-.6-12 4.7-21.3 12.5-29.5 4.1-4.1 5.6-8.7 5.5-14.4zm279.8 1.1c-.5.2-.9.3-1.3.4 1.3 3.7 1.7 7.9 4.2 10.8 7.6 9 14.9 18.1 14.8 31 6.7-10.8-3.4-28.9-17.7-42.2zM29.1 323.1c3.7-5.1 6-9.2 5.7-14.6-.3-5 .6-10.3 1.2-15.2.4-3.7.9-7.1 1.5-10.7-6 12.6-7.5 26-8.4 40.5zm16.1-73.7c-.4 3.7-.7 6.8-1 9.9 2.5-2.9 6.6-5.9 1-9.9z\"/><path d=\"M302.1 266.7c9.2 3.1 18.9 6.5 28.5 9.8l.6-1.2c-.2-.3-.4-.8-.6-.9l-32.7-12.9c-23-9-43.6-21.8-62.8-36.4-9.3-7.1-17.8-15.2-26.4-23-4.3-3.9-6.2-9-6.2-14.7.1-8.2 0-16.3 0-25.7 5.4.9 10.4 1.1 14.9 2.4 24.9 7 47.9 18.1 70.5 29.6 15.9 8.1 30.6 18.2 44.7 29 8.4 6.4 12.3 13.2 8.1 23.6-2.3 0-4.7-.2-7-.4-24.3-2.8-45.9-12.1-66.3-24.1-23.6-13.6-43.9-31.6-59.9-52.7-.4-.5-.8-.9-1.2-1.3-.2-.2-.6-.1-1.7-.2.9 1.9 1.9 3.8 3.1 5.5 17.7 23.1 40.5 42.3 66.8 56.4 19.2 10.4 39.3 18.2 61.4 20.6 1.3.2 3.4 1.6 3.5 2.6.6 5 1.1 10.3.6 15.2-.3 2.6-2.3 5.5-4.4 7.7-6.6 7.7-8.5 16.8-10.2 26.1-1.5 8.4-7.2 23.8-12.2 30.8 0-11 1.5-22.3-.4-33.3-1.6-11.1-7-21.6-10.7-32.5z\"/><path d=\"M203 159.5c.2-10.6-1.2-11.3 10.9-15.7 9.8-3.7 19.9-7.1 30.2-9.2 20.3-4.3 38.6 1.3 54.3 13.3 10.6 8 20.2 17.1 30.4 25.7 5.3 4.5 7 10.4 8.7 16.5 3.4 12.3 4.6 24.7 5.1 38.4-19.8-18.5-41.7-32.1-65.5-43-23.7-10.8-46.8-23.3-74.1-26zm156.2 92.6c1.7-2.4 3.4-5 5.4-7.9 10.4 9.5 19 20.1 26.9 31.1 16 22.1 19.6 45.9 10.6 71.3-5.3 15-10.8 29.9-15.5 45.1-1.8 6-2.3 12.4-2.7 18.7-.5 8.7 2.8 16.1 10.6 21.4.5.4.9.8 1.2 1.3.1.1 0 .3-.1.9-6.4.8-11.6-2.3-15.5-5.9-6.8-6.1-12.7-13-18.8-19.6-8-8.4-9.8-19.1-11.2-29.7-.6-4.4-.2-8.9-1.3-13.1-1.3-5.3.6-8.6 4.6-12.3 6.9-6.1 13.5-12.6 19.6-19.5 22.3-24.9 11-59.2-5.2-74.7-2.5-2.5-5.4-4.6-8.6-7.1zM64.8 232.9c1.3-1.2 2.6-2.4 3.9-3.8 27.4-29.5 61.1-50.8 99.7-65.2 9.7-3.7 20.3-5.2 31.7-8-.4 6.2-.5 10.9-.9 15.4-.1 1-1.1 2-2 2.7-23.8 16.7-47 34.1-71.4 50-11.4 7.5-24.7 12.5-37.4 18.2-5.3 2.3-11.3 3.3-16.9 5-3.9 1-6-.3-6.1-4.3-.1-3.3-.3-6.6-.6-10z\"/><path d=\"M64.9 232.9c-.5-15 1.5-29.7 4.9-44.5 2.1-9.4 8.1-14.9 15.5-19.7 26.8-16.9 56.2-28.2 88.3-32.3 9.2-1.1 18.6-.2 28.6-.2-.8 7-1.6 12.9-2.2 18.6-27.1 2.8-51.1 12.4-73.2 26.1-13.4 8.3-26.3 17.5-39.3 26.4-9.6 6.7-17.3 15.5-22.6 25.6zm15.4 90.9c-3.9-15.6-7.7-31.1-11.4-46.7-.4-1.4.4-3 .8-5.7-3.5-3.2-5.4-13.2-2.4-19.2.5-.8 1.3-1.3 2.2-1.6 28-5.6 52-19.1 74.7-34.4 17.5-11.9 34.1-24.8 51.2-37.1.9-.7 1.8-1.4 3.1-2.3.8 6.5 1.8 12.5 2.1 18.6-.1 2.3-1.1 4.6-2.8 6.2-12.1 10.4-23.9 21.2-36.8 30.4-23.6 16.7-49.6 30.1-77.5 39.7-2.6.7-5.3 1.7-7.7 3 8-.6 15.3-3.8 23.4-5.7-1.8 2-3.1 4.4-5.4 6.1-9.6 7.6-11.9 17.9-12.6 28.8-.1 6.6-.5 13.2-.9 19.9zM6.9 378c-4.4-8.9-8.6-17.7-12.8-26.5-.9-1.7-1.5-3.6-1.7-5.5-.9-19.1-.9-38.2 6-56.4 1.8-5 4-10.1 7.5-14.1 11.2-12.4 22.8-24.1 34.3-35.9.7.2 1.3.3 2 .4.4 3.7 1.2 7.5 1.1 11.2-.5 8.6-2.8 17.1-6.9 24.9-7.2 14.4-10.1 30-9.7 45.8.1 5.6-2.1 9.1-4.6 13.2C16.2 344.6 10 354 8 365c-.8 4.2-.8 8.6-1.1 13zm344.9-115.9c1.9-2.7 3.8-5.1 6.2-8.4 3.8 3.7 7.8 6.7 10.7 10.6 12 16.3 17.5 33.9 10.5 53.5-3.6 9.7-10.6 17.6-18.3 24.7-8.4 7.8-18.2 14.7-25.6 23.4-10.7 12.7-19 26.9-18.1 44 .6 11 1.1 21.8 1.7 32.1-.2-.4-.8-1.6-1.4-3-.6-1.5-1-3-1.6-4.6-10.2-29.9-7.2-58.5 12.2-84.5 4.9-6.5 11.3-12.1 15.7-18.8 8.9-13 17.1-26.8 18.3-42.6.8-9.9-2.7-18.8-10.3-26.4z\"/><path d=\"M54 260.8c4.6 3.1 6 6.5 6.6 11 1.7 13.6.2 26.3-5.8 39-7.3 15.2-13.5 30.9-18.6 46.9-8.1 25.1-4.4 48.7 13.2 69.8 1.2 1.5 2.3 3 3.5 4.7.1.1 0 .3 0 .3-26.6-13.2-43.3-29.2-43.7-60.4-.2-12.1 6.1-22.3 12.2-32.4 6.8-11.1 13.5-22.1 19.9-33.4 8-14 14.7-28.4 12.7-45.5zm20.7-86.7c5.5-14.2 13.2-26.4 24.5-36 8.8-7.4 18.1-14.3 27.9-20.6 3.6-2.3 8.7-3.1 13.2-3.6 10.9-1 21.7-1.4 32.7-1.4 11.8.3 20.5 6.7 28 14.3 1.7 1.6 1 5.4 1.6 8.8-12.6-2.8-24.2-3.8-35.7-1.5-33.8 6.5-65 18.1-92.2 40zm254.6-3.9-20.9-18.9c-18.2-16.3-39.3-24.1-64.7-19.2-13.7 2.6-26.6 7.5-39.1 13.2.6-6.2 1.1-12.4 1.8-18.5.2-.6.6-1.2 1.2-1.6 17.9-8.8 36.7-14.4 57-13.7 2 0 4 .5 5.8 1.3 23 12 43.2 27 55.9 49.2 1.1 1.9 2 4 3.1 5.9.2.5.4 1 .6 1.6zm.4 172.4c-1.8-13.5-2.3-25.6-1-37.7 1-9.2 3.1-18.2 7.5-26.5 1.3-2 2.8-4 4.8-5.6 2.9-2.8 6.1-5.5 9.1-8.2 6.2 5 7.7 8.9 4.9 15.7-2.2 5.4-5 10.7-8 15.7-5.5 9.3-7.7 19.1-5.6 29.6.2 1.3 0 2.6-.7 3.7-3.3 4.3-6.8 8.3-11 13.3z\"/><path d=\"M41.1 346.9c7.4 11.9 14.3 23.8 21.9 35 7.6 11.4 15.6 22.2 23.6 33.2-.4.1-.8 0-1.1-.2-18.9-11.1-34.6-26.3-45.9-44.4-2.8-4.5-3.8-8.8-1.7-13.7 1.3-3.1 2.3-6.5 3.2-9.9zm99-236.1c19.6-12.4 40.2-13.2 61.5-9.5.9.2 2.2 1.9 2.2 2.9-.3 6.4-.9 12.8-1.6 20.5-17.3-18.7-39.4-16.2-62.1-13.9zm66.2 11.4c.3-6.3.6-12.8.9-19.3 16.1-5.1 40.8-2.5 51.7 5-8.7 1.5-18.1 2.5-26.8 5-8.5 2.3-16.9 6.1-25.8 9.3zM51 256.6c4 14.3-1.2 32.7-13.6 51.1 1.8-17.3.1-35.3 13.6-51.1zM345.5 361c0 19.5 4.6 38.7 13.4 56.3-.6.2-1.1.4-1.8.6-4.6-9-9.3-17.9-13.6-27-2.2-4.8-3.1-10.1-5.1-15-1.9-4.8-1.1-8.3 3.1-11.5 1.1-.8 1.9-1.7 4-3.4zm13.1-80c1.6 16.3-5.4 30.3-14.9 44.5-4.1-18.2 8.5-30.4 14.9-44.5zm-296-15.1c-2.2-2.5-4.6-5-7.2-8 1.4.3 2 .4 4.2 1-6.1-5.9-4.6-12.5-4.2-18.6.5-6.3 2.8-12.4 4.4-18.5l2.3.3c-.2 2.6-.1 5.3.1 7.8.6 5.5 1.8 11 2.1 16.3.4 6.4.1 12.9.1 19.3-.6.2-1.2.3-1.8.4zm282.9-43.2c8 8.5 9.9 33.8-1.1 43-3.9-9.9-1.1-20 .4-30 .5-4.2.5-8.5.7-13z\"/><path d=\"M54.4 256.2c-1.2-1.6-1.7-2.3-2.2-3-4.1-5-6.1-9.6-5-16.6 1.7-11 6.8-19.6 14.3-27.6 1.2 5.8.2 9-2.6 13.7-5.4 8.6-6.7 18.2-5.8 27.9.3 1.9.8 3.7 1.3 5.6zM12.8 401c5.5 6.8 10.8 13.3 16.9 20.8-7 3.8-14.6 7.8-22.2 11.9-.4-.3-.6-.6-1-.9 9.5-9.5 7.7-20.7 6.3-31.8zm332.4-190.9c8.1 8.2 14.3 16.9 14.3 28.6 0 3.5 1.9 7-.9 10-.9.8-1.8 1.5-2.9 2.2-.5-.9-.9-1.9-1.2-2.9-1.2-6.4-2.2-12.6-3.6-19-.3-1.5-.8-3.3-2-4.4-4.8-4.1-3.5-9.4-3.7-14.5z\"/><path d=\"M63.9 195.3c.1 5.8-1.4 10.4-5.4 14.4-7.9 8.1-13.2 17.5-12.5 29.5-6.7-11.2 1.5-28.9 17.9-43.9zm279.8 1.1c14.3 13.2 24.3 31.4 17.6 42 .1-12.9-7.2-21.8-14.8-31-2.3-2.8-2.8-7.1-4.2-10.8.5.1 1 0 1.4-.2zM29.1 323.1c.8-14.5 2.3-28 8.4-40.6-.5 3.6-1.1 7.1-1.5 10.7-.6 5.1-1.5 10.3-1.2 15.2.2 5.5-2.1 9.7-5.7 14.7zm16.1-73.6c5.6 4.1 1.5 6.9-1 9.9.3-3.2.6-6.4 1-9.9z\"/></g>",
        "female3": "<g fill=\"$[hairColor]\" stroke=\"#000\" stroke-width=\"4\"><path d=\"M224.5 42.7c4.8.8 9.7 1.3 14.6 2.4 17 4 26.8 13.5 29.6 27.9.6 3.1 2.2 4.6 5.4 5.8 16.7 6.4 32 15 45.3 25.6 7 5.5 12.8 11.7 15.2 19.8q.75 2.1 2.1 3.9c13.9 19.7 22.5 40.9 24.3 63.6 3.1 36.7 4.9 73.3-2.6 109.8-1.5 7.4-1.6 14.4 1.3 21.5 5.7 14.3 4.2 28.7 1.8 43.2-3.1 18.2-6.3 36.5-8.9 54.8-1.3 9.2-1.3 18.4-1.9 27.6-.1 1.9-.9 3.6-2.3 5.1 0-13.7.6-27.6-.1-41.3-.8-13.9-2.9-27.9-4.5-42.6-1 1-1.7 1.4-1.9 1.9-8 25.2-13.6 50.7-7.1 76.7 2.8 10.7 6.4 21.1 9.2 31.8 1.9 7.3 2.9 14.9 4.2 22.3.1.6-.6 1.3-1.5 3.1-3.7-7.2-6.8-13.4-9.9-19.6-19.4-38.2-26.1-78.6-29.2-119.5-2.4-31.2-3.3-62.6-10.3-93.5-5.5-24.3-15.7-47.4-28-69.9-.8-1.4-3.7-2.8-5.7-3-11.5-.9-23 1.2-32.9 6.2-10.2 5.2-20.8 6.4-32.3 3.1-17-4.8-34.5-7.3-52.3-6.5-11.9.5-24.5 1.1-32.8 10.1-3.2 3.5-6.1 7.3-8.8 11.1-10.1 13.9-18.1 28.7-22.8 44.6-3 10.2-2.9 20.5-1 31.1 3.9 22.7 6.5 45.5.8 68.3-1 4.4-2.4 8.7-4.1 12.9-6.8 15.3-8.9 31.7-6.2 47.8 3.2 18.4 6.4 36.7 10.2 55.1 1.1 5.5 4.1 10.9 6.3 16.3.6 1.5.9 3.1 1.5 4.6-.6.2-1 .5-1.6.7-1-.9-1.9-1.8-2.6-2.9-16.5-28.7-21-59.1-19-90.6 1.1-17.8-.1-35.6.8-53.4.6-10-3.1-18.3-8.7-26.9-15.5-24.1-22.2-49.9-19.5-77.2 1.8-18.6 3.1-37.4 5.7-55.9 3.3-23.1 11.8-45.4 25-66 4.2-6.6 8.4-13.3 12.7-19.8 1.9-2.9 4-5.9 7-8.1 16.3-12.2 32.4-24.8 52.5-32.8 9.7-3.9 20.3-6.2 30.5-9.3 1.7-.5 3.9-.9 5-2 10.7-10.9 25.1-15.6 41.3-17.5.9-.2 1.9-.4 2.8-.7 1.1.3 2.3.4 3.4.3zm102.9 156.9c1.8-3 3.7-5.9 5.3-8.9 4.8-8.6 9.6-17.1 14.4-25.7 3.8-6.7-.7-11.9-3.7-17.9-4.2 13.9-11.9 25.8-21.7 36.7q-1.05 1.35-.6 3c1.9 4.3 4.2 8.5 6.3 12.8.8 1.7 1.4 3.5 2.1 5.3 8.8 20.1 17.5 40.4 20.6 61.8 1.6 10.9 2.4 21.9 3.7 32.7 6.9-44.8 8.8-89.4-2.2-135.2-6.2 9.8-11.4 18.4-17 26.9-2.1 3.2-4.9 5.8-7.2 8.5zM125.6 195c-.7-.9-1.4-1.8-1.9-2.8-6.4-14.3-9.4-29.2-7.2-44.5 3.3-24.2 12.5-47.6 27.1-68.8.9-1.2 1.6-2.6 2.4-3.9-4.6 1-8.9 2.6-12.7 4.9-11.9 7.3-23.6 15-35.5 22.4-17.9 11.2-23.3 29.6-16.7 46.5 4.6 11.9 8.9 24 14.1 35.7 3.4 7.9 7.9 15.5 12 23.1.7 1 1.4 1.9 2.3 2.8 6.4-3.4 12.4-6.6 18.8-10-1.2-1.8-2-3.5-2.7-5.4 1 1.5 2 2.9 3.2 4.2.8.9 2.3 1.9 3.3 1.8 8.3-.5 16.5-1.1 23.4-1.6-2.8-3.4-7.5-7.2-8.9-11.6-4-11.2-6.9-22.7-8.8-34.3-3.6-23.3 7.6-44.5 16.3-65.9.1-.4.7-.8 1.1-1-3 9-5.5 18.2-9.1 27-9.7 23.4-7.7 46.6.2 69.9 4.5 12.9 14 18.8 31 17.8-.3-.8-.6-1.5-.9-2.3-8.4-16.9-13.1-35-13.8-53.4-.7-14.8-.8-29.6-.6-44.4.1-9.1 1.5-18.2 2.2-27.3.6 0 1.1.1 1.6.1-.5 4.2-1.4 8.5-1.4 12.7-.1 19.9-.5 39.7.2 59.6.6 18 5.3 35.8 13.6 52.4.8 1.5 1.9 3.5 3.6 4 5.2 1.5 10.5 2.5 15.7 3.6.7-1 1.4-1.6 1.4-2.2.2-5 .8-10 .3-15-3.2-33.1-.5-66.8-13.5-99.1-3.1-7.7-4-16.1-6.1-24.8-3.9.7-7.7 1-11.2 2-2.6.8-4.8 2.4-7.2 3.6-.7-.5-1.5-1.6-1.9-1.4-4.6 1.1-9.3 2-11.6 6.2-6.8 12.6-14.7 24.8-20.2 37.8-7.8 18.5-12.8 37.7-8.7 57.6 1.9 8.2 4.6 16.1 6.8 24zm204.6 200c.3.1.6.1.9.2.5-1.4 1-2.9 1.4-4.4 3.1-11.7 5.4-23.6 9.3-35.1 4.4-12.8 6.7-26.1 7-39.4.5-24.5-.1-49.1-8.7-72.8-6.9-19.2-15.4-37.9-22.7-57-4-10-9.3-19.5-15.8-28.4-8.3-11.5-25-13.7-37.5-12.9-.9.1-1.8.4-2.6.8-30 13.5-48.4 34.8-60.2 60.8q-.3 1.05-.3 2.1c8.5.2 16.4-.3 24.2-3.1 8.7-3.1 17.6-5.8 26.7-7.9 4.1-1 8.8-.2 14-.2-2.5-5.2-4.7-9.5-6.9-13.9.6-.3 1.1-.5 1.7-.8 1.1 1.2 2.2 2.5 3.1 3.8 4.4 7.9 8.6 15.8 12.8 23.8 11.6 21.8 21 44.2 25.1 67.9 2.6 15.3 4.8 30.5 6.2 45.9 3.1 33.4 4.2 67 11.7 100.1 2.8 12.2 6.5 24.2 9.9 36.4l1.4-.3c-1-6.4-2.6-12.9-2.8-19.3-.3-11.7.8-23.5.5-35.2-1.1-35.1-2.5-70.2-4.1-105.4-.6-12.7 0-25.7-3-38-7.1-29.5-18.2-58-35.3-84.8q-.45-.75-.6-1.5l1.4-.6c2.5 3.6 5.6 7.2 7.3 11 14.8 32.5 31.4 64.5 31.5 100.3.1 20 1.6 40 2.4 60 .8 15.9 1.5 31.9 2 47.9zm-150-331.2c17.8 43.5 20.1 87.1 21.3 132.2.8-.8 1.6-1.6 2.3-2.5 8.9-17.8 22.4-32.8 41.6-44 1.4-1 2.3-2.4 2.5-3.9 2.1-24.3-1.1-48.2-8.5-71.8-.7-1.7-2.2-3.1-4.2-3.8-8.3-2.3-16.6-5-25.1-6-9.2-.9-18.5-.2-29.9-.2zM56.9 170h-1.6c-2.1 7.3-5.2 14.4-6.2 21.7-2.5 19.3-4.2 38.6-6.1 57.9-.1 2.4.2 4.8 1 7.1 4.2 13.7 11.3 26.8 20.9 38.5.9 1.1 1.7 2.4 2.5 3.5-.6.3-1.1.6-1.8.9-4.5-6.2-9.3-12.3-13.2-18.8s-6.8-13.2-10.2-20c-5.2 15.7 11.2 68.1 24.1 77 2.6-16.6 6-33.2 7.8-49.9 1.6-16.3 6.7-32.2 15-47-20.6-21.3-32-44.2-32.2-70.9zm33 68.3c5.7-8 10.8-14.8 15.2-21.7.9-1.3.3-3.8-.5-5.4-4.2-8.3-9.1-16.4-13.1-24.8-3.9-8.1-6.4-16.6-10.5-24.6-4-7.7-6.2-16-6.4-24.4 0-1-.5-2.2-.8-4.2-10.9 15.6-16.7 30.7-14.2 48.1 2.5 17.2 11.8 32.1 20.2 47.2 2 3.5 6.3 6.3 10.1 9.8zM281 140.8c1.9-13.4 4.1-27.9 6.3-42.5 1-7.3-1.8-12.4-10.9-14.8-6-1.6-11.5-4.2-17.3-6.2-5.5-1.9-11.2-3.4-17.9-5.5 8 24.9 12.2 49.2 10 72.8 9.3-1.2 18.3-2.3 29.8-3.8zm24.9 18c1.4-1.2 2.2-1.9 3-2.7 10.8-10.5 13.3-23.4 14-36.5.2-3.7-.9-8.8-3.8-11.2-9.1-7.2-19.3-13.2-29-19.7-.5.4-.9.7-1.4 1 3 18.1-1.3 35.6-7 53.3 11.4 2.1 18.5 7.9 24.2 15.8zm1.9 1.2c4.2 7.8 8.1 15.1 12.8 23.7 5.7-9.5 10.9-18.3 16.3-27 5.8-9.5 4-18.3-2.8-27-2.2-2.7-3.1-6-4.7-9.1-1.5-2.9-3.2-5.6-4.7-8.4-.6.1-1.3.3-1.8.4 6.5 18.7-1.8 33.9-15.1 47.4zm-44.6-85.2C261.4 59 246.4 50.4 233 48.4c-18.1-2.7-33.6 2.3-47.6 11.6 27.8-1.9 52.3 6.7 77.8 14.8zM77.4 292.1c-10 33.1-7.6 66.9-7.9 101.7 17.8-34 14-67.8 7.9-101.7zm276.4 23.5c-.3 1.6-.7 3.1-.9 4.6-1.4 7.8-1.7 15.9-4.5 23.5-2.3 6.3-3.2 12.9-2.8 19.5 1.1 15.2 3.4 30.4 5.2 45.4 6.4-30.8 17-61.4 3-93z\"/><path d=\"M330.2 395c-.7-16-1.3-32-1.9-48-.8-20-2.4-40-2.4-60-.1-35.8-16.7-67.9-31.5-100.3-1.7-3.9-4.9-7.3-7.3-11l-1.4.6q.15.75.6 1.5c17.1 26.7 28.2 55.3 35.3 84.8 3 12.3 2.4 25.3 3 38 1.5 35.1 3 70.2 4.1 105.4.3 11.7-.7 23.5-.5 35.2.1 6.5 1.8 12.9 2.8 19.3l-1.4.3c-3.3-12.1-7.1-24.1-9.9-36.4-7.5-33-8.6-66.6-11.7-100.1-1.4-15.4-3.7-30.7-6.2-45.9-4-23.7-13.5-46-25.1-67.9-4.2-7.9-8.5-15.8-12.8-23.8-.9-1.3-2-2.6-3.1-3.8-.6.3-1.1.5-1.7.8 2.2 4.4 4.4 8.8 6.9 13.9-5.2 0-9.9-.8-14 .2-9.1 2.1-18.1 4.7-26.7 7.9-7.8 2.9-15.7 3.4-24.2 3.1q0-1.05.3-2.1c11.8-26 30.2-47.3 60.2-60.8.8-.4 1.7-.7 2.6-.8 12.5-.9 29.2 1.3 37.5 12.9 6.6 8.9 11.9 18.5 15.8 28.4 7.3 19.1 15.8 37.8 22.7 57 8.6 23.7 9.2 48.2 8.7 72.8-.3 13.3-2.6 26.6-7 39.4-3.9 11.5-6.2 23.4-9.3 35.1-.3 1.4-.9 3-1.4 4.4-.3 0-.6 0-1-.1zM161.3 71c2.4-1.2 4.6-2.9 7.2-3.6 3.6-1 7.3-1.3 11.2-2 2.1 8.7 2.9 17.1 6.1 24.8 13.2 32.3 10.3 66 13.5 99.1.5 5-.1 10-.3 15 0 .6-.7 1.1-1.4 2.2-5.3-1.1-10.7-2.1-15.7-3.6-1.6-.5-2.8-2.5-3.6-4-8.4-16.6-13-34.4-13.6-52.4-.7-19.9-.3-39.7-.2-59.6 0-4.2.9-8.5 1.4-12.7-.6 0-1.1-.1-1.6-.1-.8 9.1-2.1 18.2-2.2 27.3-.2 14.8-.1 29.6.6 44.4.7 18.3 5.3 36.4 13.8 53.4.3.8.6 1.5.9 2.3-17 1-26.6-4.9-31-17.8-8-23.3-10-46.5-.2-69.9 3.7-8.8 6.1-18 9.1-27 1.9-5.3 4-10.6 6-15.8z\"/><path d=\"M180.2 63.8c11.5 0 20.9-.8 29.8.2 8.6 1 16.9 3.7 25.1 6 2 .7 3.5 2.1 4.2 3.8 7.2 23.6 10.4 47.4 8.5 71.8-.2 1.5-1.1 2.9-2.5 3.9-19.3 11.2-32.6 26.2-41.6 44-.7.9-1.5 1.7-2.3 2.5-1.2-45.1-3.5-88.7-21.2-132.2zM125.5 195c.9 2.2 1.9 4.4 2.4 5.5-6.4 3.4-12.4 6.6-18.8 10-.8-.9-1.6-1.8-2.3-2.8-4.1-7.6-8.6-15.3-12-23.1-5.2-11.7-9.5-23.8-14.1-35.7-6.4-16.9-1-35.3 16.7-46.5 11.9-7.4 23.6-15 35.5-22.4 3.8-2.3 8.2-3.9 12.7-4.9-.8 1.3-1.6 2.7-2.4 3.9-14.5 21.2-23.7 44.6-27.1 68.8-2.2 15.2.8 30.1 7.2 44.5.6 1 1.2 2 1.9 2.9.4-.1.3-.2.3-.2zm-68.6-25c.2 26.6 11.6 49.5 32.3 70.8-8 14-13.1 30.1-15 47-1.8 16.7-5.2 33.3-7.8 49.9-12.7-9-29.1-61.2-24.1-77 3.4 6.9 6.3 13.6 10.2 20s8.7 12.5 13.2 18.8c.6-.3 1.1-.6 1.8-.9-.8-1.2-1.6-2.4-2.5-3.5-9.6-11.7-16.7-24.7-20.9-38.5-.8-2.3-1.1-4.7-1-7.1 1.8-19.3 3.4-38.7 6.1-57.9.9-7.3 4-14.5 6.2-21.7z\"/><path d=\"m161.3 71-6.2 15.7c-.3.4-.9.7-1.1 1-8.7 21.4-19.7 42.6-16.3 65.9 1.9 11.6 4.9 23 8.8 34.3 1.5 4.5 6.2 8.2 8.9 11.6-6.9.5-15.1 1.2-23.4 1.6-1 .1-2.5-1-3.3-1.8-1.3-1.3-2.2-2.9-3.3-4.3l.1.1c-2.3-8-4.9-15.9-6.6-24-4.1-19.9.9-39 8.7-57.6 5.5-13 13.4-25.2 20.2-37.8 2.3-4.2 7-5.1 11.6-6.2.5-.1 1.3.9 1.9 1.5zM89.9 238.3c-3.7-3.5-8.1-6.3-10.1-9.9-8.3-15.3-17.7-30.1-20.2-47.2-2.5-17.4 3.3-32.5 14.2-48.1.4 1.4.7 2.8.8 4.2.2 8.4 2.4 16.7 6.4 24.4 4.1 8 6.6 16.5 10.5 24.6 4 8.4 8.8 16.5 13.1 24.8.8 1.6 1.4 4.1.5 5.4-4.4 7.1-9.4 13.8-15.2 21.8zM281 140.8c-11.6 1.4-20.5 2.7-29.8 3.8 2.2-23.7-1.9-47.9-10-72.8 6.6 2.1 12.4 3.6 17.9 5.5 5.8 2 11.4 4.6 17.3 6.2 9.1 2.4 11.9 7.5 10.9 14.8-2.1 14.6-4.3 29.2-6.3 42.5zm46.2 58.8c2.4-2.8 5.3-5.4 7.2-8.4 5.5-8.4 10.8-17 17-26.9 11 45.7 9.1 90.4 2.2 135.2-1.1-10.9-2.1-21.9-3.7-32.7-3.1-21.5-11.8-41.6-20.6-61.8-.8-1.8-1.4-3.6-1.9-5.4zm-21.3-40.7c-5.7-8-12.8-13.7-24.1-15.7 5.7-17.7 9.9-35.1 7-53.3.5-.4.9-.7 1.4-1 9.7 6.5 19.9 12.6 29 19.7 3 2.3 4 7.4 3.8 11.2-.8 13.1-3.2 26-14 36.5-.9.7-1.7 1.3-3.1 2.6z\"/><path d=\"M307.8 160c13.2-13.6 21.7-28.7 15.1-47.3.6-.1 1.3-.3 1.8-.4 1.6 2.8 3.2 5.5 4.7 8.4 1.6 3.1 2.5 6.3 4.7 9.1 6.8 8.7 8.6 17.5 2.8 27-5.4 8.7-10.5 17.5-16.3 27-4.7-8.7-8.6-15.9-12.8-23.8zm-44.6-85.2c-25.5-8.1-50-16.7-77.7-14.7 14-9.4 29.5-14.3 47.6-11.6 13.3 2 28.3 10.5 30.1 26.3zM77.4 292.1c6.1 33.9 9.9 67.7-7.9 101.7.4-34.8-2-68.6 7.9-101.7zm276.4 23.5c14 31.6 3.3 62.2-2.9 93-1.8-15.2-4.1-30.3-5.2-45.4-.5-6.6.4-13.2 2.8-19.5 2.8-7.5 3.1-15.7 4.5-23.5.2-1.6.5-3.1.8-4.6zm-26.4-116.1c-2.2-4.2-4.4-8.4-6.3-12.7-.3-1-.1-2.1.6-3 9.7-11 17.4-22.8 21.7-36.7 3.1 6 7.5 11.4 3.7 17.9-4.8 8.6-9.6 17.1-14.4 25.7-1.7 3-3.6 5.9-5.4 9z\"/></g>",
        "female4": "<g fill=\"$[hairColor]\" stroke=\"#000\" stroke-width=\"4\"><path d=\"M91.1 414.3c-16.9-8.5-24.3-22.7-30.7-36.4-8.3-17.7-13.7-36.2-20.5-54.3-2.5-6.7-5.1-13.4-8.3-19.9-5.7-11.4-7.9-23.6-6.4-35.5 3.3-25.3 5.8-50.8 10.8-75.8 7.7-38.5 25.5-72.8 59.7-99.6 18.8-14.7 40.4-24.6 67.2-25.9 19.6-.9 39.5-1.7 59.2-.6 26 1.5 49.8 10.3 70.9 24.2 9.3 6.2 15.7 14.1 20.8 22.9 1.1 2.2 3 4.1 5.2 5.6 13.9 7.7 23.8 18.2 30.8 30.4 10.1 17.4 17 35.8 20.5 54.5 3.4 17.9 6.1 35.5 4.2 53.2 0 .9.1 1.8.3 2.8l-9.2 49.9-9.8 21.9c-.2.4-.2 1-.6 1.3-10.3 8.9-11.1 21.1-13.7 32.6-4.4 19.6-13.1 38.1-25.6 54.7-4.5 5.9-10.5 10.9-15.8 16.3l-1.8-1c.3-.8.4-2 1-2.4 8.7-5.9 11-14.8 12.7-23.3 7-35.6 15.2-71.1 16.5-107.7 1.3-33.1-6.1-66.5-21.6-98.1-1.4-3-3.4-5.8-5.5-9.2-1.2.9-2.3 1.9-3.3 2.9-6.8 8.4-13.9 16.7-20.3 25.4-13.9 19-35 30.6-60.1 37.5-18 4.9-36.5.8-54.5-4.8-9.1-2.9-18.4-5.4-27.4-8.5-15.5-5.2-30.1-2.4-45-.6-4.1.5-8 1.8-12 2.4-3 .3-6.1.4-9.2.4-7.3 15.8-11.2 33.1-9.6 51.4q1.95 22.5 4.2 45c2.2 21.6 12.1 41.5 25.1 60.8 1.5 2.3 1.8 5.1 2.6 7.6zM75.7 247.9c6.9-1.6 13.4-2.9 19.7-4.7 9.3-2.6 18.8-3.3 28.6-.9 9 2.2 17.6 5.2 26.5 7.6 14.2 3.8 28.5 9.2 42.9 10.4 33.7 2.8 58-11.2 76.8-31.5 12.1-13 21.3-27.9 32.8-41.3 11.9-14 14.7-29.9 13.8-47-.4-6.8.2-14-2.8-20.1-3.7-8-9.3-15.4-16.4-21.8-20.3-17.8-46.2-26.3-74.1-29.7-22.1-2.7-43.8-1.6-65.5.8-18.6 2.1-35.8 8.4-49.9 18.1C65.9 116.2 45.8 155 38 199.5c-4.1 23.6-7.4 47.4-10.6 71.1-1 8 .4 16.2 4.3 23.9C30 266 42.4 240 45.2 212.3c-.8 13.3-2.6 26.5-5.3 39.6-3.6 17.2-7.7 34.4-2.3 52.3 6 19.9 12.3 39.8 19.2 59.5 4.8 13.6 12.5 26.6 22.8 38.3 1.7 2 3.9 3.8 6.2 6.1.3-1 .5-1.3.4-1.5-.5-.9-1-1.7-1.6-2.6-13.7-19.5-22-40-23.7-61.9-.9-11.5-1.8-23.1-3.1-34.6-2.3-19 .7-37.9 8.8-55.2 2.3-4.7 3.1-9.9 2.2-15.1-4-24 4.6-44.5 23.1-61.8 16.2-15.2 37.3-24.6 59.5-32.7 13.9-5.1 28.3-9.5 43.9-10.7 7.6-.6 15.3-.6 22.5 3.1-15.1-3-29.3-1.2-43.2 2.5-23.2 6.1-44.8 15.3-64.1 27.1-14 8.3-25.2 19.3-32.9 32.1-9.7 15.9-9.6 32.9-1.9 51.1zm275.7-21.1 2.7.2c2.5 36.2 3.6 72.3-4 107.9 3.1-3.7 6.3-7.3 7.4-11.5 3.7-13.8 6.9-27.6 9.7-41.6 5-24.8 6.5-49.6.3-75.5-4.3-18.2-10.3-35.7-19.5-52.8-6.3-11.7-16-21.2-27.1-30-.5-.4-1.3-.4-2.4-.6.3 7 .7 13.8.8 20.5.2 14.1.5 28.4-9.8 39.9-6.2 7-4.9 13-.5 21.4 18.9 36.2 25.5 73.8 21.1 111.6-3.5 30.2-9.2 60.1-14 90.1-.6 3.4-1.6 6.8-2.4 10.2l1.7.7c4.1-7.1 8.6-14 12.2-21.2 10.8-21.6 14-45.2 19.5-68.2 6.1-25.7 6.1-52.2 4.8-78.8-.2-7.7-.3-15-.5-22.3z\"/><path d=\"M75.7 247.9c-7.7-18.2-7.7-35.1 1.8-51.2 7.7-12.8 18.9-23.8 32.9-32.1 19.3-11.8 40.9-20.9 64.1-27.1 13.9-3.6 28.1-5.4 43.2-2.5-7.2-3.6-14.8-3.7-22.5-3.1-15.7 1.2-30 5.5-43.9 10.7-22.2 8.2-43.2 17.6-59.5 32.7-18.5 17.3-27 37.8-23.1 61.8.9 5.2.2 10.4-2.2 15.1-8.1 17.3-11.1 36.2-8.8 55.2 1.3 11.5 2.3 23.1 3.1 34.6 1.7 21.9 9.9 42.5 23.7 62 .6.8 1.1 1.7 1.6 2.6.1.2-.1.5-.4 1.5-2.3-2.2-4.4-4-6.2-6.1-10.2-11.7-17.9-24.7-22.7-38.3-6.9-19.7-13.2-39.6-19.2-59.5-5.4-17.9-1.3-35.1 2.3-52.3 2.7-13 4.5-26.2 5.3-39.6-2.8 27.7-15.1 53.7-13.5 82.2-3.9-7.7-5.3-15.9-4.3-23.9 3.2-23.8 6.5-47.5 10.6-71.1 7.8-44.5 27.9-83.3 70-111.7 14-9.7 31.3-16 49.8-18.1 21.6-2.5 43.4-3.5 65.4-.8 28 3.4 53.8 11.9 74.1 29.7 7.1 6.4 12.7 13.8 16.4 21.8 2.9 6.2 2.4 13.4 2.8 20.1.9 17-1.9 33-13.8 47-11.4 13.5-20.7 28.3-32.8 41.3-18.7 20.2-43.1 34.2-76.8 31.5-14.4-1.2-28.6-6.7-42.9-10.4-8.9-2.3-17.6-5.3-26.5-7.6-9.8-2.5-19.3-1.8-28.6.9-6 1.8-12.5 3.1-19.4 4.7z\"/><path d=\"M351.4 226.8c.2 7.3.3 14.7.6 22 1.3 26.6 1.3 53.1-4.8 78.8-5.5 23-8.6 46.6-19.5 68.2-3.7 7.2-8.1 14.2-12.2 21.2l-1.7-.7c.8-3.4 1.8-6.7 2.4-10.2 4.8-30 10.5-59.9 14-90.1 4.3-37.8-2.2-75.4-21.1-111.6-4.3-8.4-5.7-14.4.5-21.4 10.3-11.6 10-25.9 9.8-39.9-.1-6.7-.5-13.4-.8-20.5 1.1.3 1.9.3 2.4.6 11.1 8.7 20.8 18.3 27.1 30 9.2 17.1 15.2 34.5 19.5 52.8 6.1 25.9 4.8 50.7-.3 75.5-2.8 14-6.1 27.8-9.7 41.6-1.1 4.2-4.3 7.8-7.4 11.5 7.7-35.6 6.6-71.7 4-107.9z\"/></g>",
        "female5": "<g fill=\"$[hairColor]\" stroke=\"#000\" stroke-width=\"4\"><path d=\"M18.9 304.5c1.7-11.9 3.6-23.8 5.1-35.7 3.2-25.9 10.2-51.2 22.3-75.5 1.8-3.7 2.9-7.7 4.8-11.3 13.9-25.3 30.4-49.1 56.4-67.7 11.7-8.3 25.7-13.7 40.3-17.8 20.8-5.9 42.2-9.3 64.5-6.5.9.1 1.7.2 2.6.4 8.6 1.8 16.7 4 20.5 10.9 6.8-1.4 13.2-3.3 19.9-4.1 7.7-1.1 14.9.7 21.3 4.2 26.1 14.4 42.8 35 57.2 57 17.7 27.1 27 56.4 33.3 86.5 3.1 14.8 8.6 29.2 12.2 43.9 4.4 18.2 4.6 36.4-3.2 54.2-4.7 10.9-9.1 22-12.1 33.3-1.7 6.9-.2 14.5-.6 21.8-.3 2.3-1.2 4.6-2.7 6.5-2.8 3.8-6.6 7.1-8.9 11-5.2 9-14.4 15-23.7 20.8-4.2 2.6-9.6 4.1-15 6.3-4.5-5.6-9-11.9-7.8-19.4 1.8-11.4 3.4-23.1 7-34.2 6.9-21.3 10.8-42.7 7.5-64.7-2.4-15.5-5.5-30.8-8.7-46.2-1.8-8.8-3.8-17.7-6.6-26.3-1.1-3.6-4.5-6.7-6.8-10.1-2-3.1-3.8-6.1-5.6-9.2-4.3-7.3-8-14.9-13.1-22-6.6-9-17.3-13.4-30.1-13.3-9.2.2-18.4 1-27.4 2.4-5.6.9-9.9-.4-13.7-3-8.1-5.4-25.9-6.7-34.4-1.4-5.8 3.6-11.3 7.6-15.4 12.3-15.1 17.2-29.3 35-44.4 52.3-7.7 8.9-16.6 17-25 25.6 1.1-1.5 2.1-3.1 3.3-4.6 8.8-10.5 17.7-21 26.7-31.3 14.6-16.9 29.1-33.8 44-50.4 7.8-8.8 19.1-11.8 32.1-9.8 4.2.6 8.1 2.1 12.2 2.9 1.3.3 3.5.2 4.4-.5 6.2-4.6 11.6-9.4 11.1-16.9-.1-1.4.9-2.9 1.5-4.3 3.2-6.3 4.9-13.1 5.1-19.9.2-13.4 2.2-26.7 3.3-40 .2-1.9-1.4-4.6-.3-5.7 3.2-3.5.5-5.3-2.4-6.6-4.5-2.1-9.3-4.1-14.4-5.1-11.6-2.4-23.4-2-35.2-.6-44.2 5.4-78.3 23.4-102.8 53.5-12.6 15.5-22.9 32.1-29.8 49.8-6.3 16.2-12.3 32.5-16.3 49-3.7 15.1-3.9 30.7-6.7 46-4.2 23.6.9 46.1 10.5 68.3 3.1 7.1 6.5 14.2 9 21.5 2.1 5.7 6.7 9.5 13.1 13.5-1.5-4.6-2.7-8.1-3.9-11.7-6-17.9-11.6-35.8-9.9-54.6 1.4-15 7-29.2 12.3-43.5 6.8-18.1 13.1-36.3 19.7-54.3.8-1.6 1.7-3.1 2.8-4.6.4.1.8.3 1.2.4-.6 3.3-.8 6.8-2.1 10-6 16-12.1 32-18.4 47.8-5.6 14.1-11.2 28.4-12.8 43.4-1.7 16.6 2.3 32.7 7.7 48.6 2.9 8.3 7.5 16.4 9 24.9 2.1 11.2 9.4 19.2 19.8 25.9 6.5 4.2 13.7 7.8 20.5 11.7 1.5.6 3 1.2 4.6 1.8-5.2-8.3-10-15.6-14.5-23-19.9-33-29.2-67.2-18.8-103.8 2.6-9.1 5-18.3 12.5-25.9-5.9 10.2-9.4 20.9-11.8 32-6.9 31.1.1 60.4 16.2 88.6 5.8 10 12.1 19.8 18.2 29.6.9 1.6 1.5 3.3 2.9 5.9-2.7-.7-4.2-.7-5.2-1.3-10.7-6-21.5-11.7-31.7-18.1-8-5.1-12.2-12.4-15.1-20.3-.7-2.1-2.7-4-4.5-5.7-3.3-3-7.3-5.4-10.2-8.7-2.5-2.8-4.1-6.2-5.6-9.5-2.3-4.9-3.6-10.1-6.3-14.8-8.5-15.3-11.4-31.7-13.9-48.2-.3-1.9-.7-3.7-1-5.6.2-2.3.3-4.6.2-6.8zm312.3-83c.2-.1.5-.2.7-.3.8 1.1 1.7 2.2 2.5 3.4 10.8 16.8 19 34.6 24.3 53 7.2 25.3 6.2 49.9-9 73.7-6.1 9.5-11.3 19.7-14 30.1-4.3 17-6.3 34.5-9.3 52.3 9.2-5.3 17.7-10.7 22.9-18.8 2.2-3.6 4.7-6.9 7.6-10.2 2.4-2.3 3.6-5.4 3.3-8.3-.4-5-1.5-10-.4-14.8 2-9.2 5-18.3 8.8-27.1 11.2-24.7 14.2-49.3 4-74.8-4.9-12.3-6.8-25.6-9.3-38.5-7.3-37.7-22.4-73-48.7-104.9-10-12.2-21.4-23.3-36.7-31.4-12-6.5-27.9-6.9-39.9-.5-1.7 1-2.9 2.5-3.2 4.2-1.2 12.5-2.6 25-3 37.5-.3 9 .2 17.9-4.8 26.3-.8 1.4-1.2 2.9-1.3 4.4-1 6.2-4.9 11.1-10.4 15.3-1.4 1.1-2.6 2.3-3.9 3.4 3.7 2.8 7.2 2.6 11.4 2.2 10-1.1 19.9-2.3 30-2.3 11.8.1 21.7 4.7 28 12.7 5.1 6.6 9 13.8 13.4 20.9 2.6 4 5 8.1 7.3 12.3 2.8 5.1 6.4 10.2 7.8 15.5 3.6 13.6 6.1 27.4 9.2 41.1 7 30.7 8.1 61-3 91.4-4.1 11.1-5.1 23-7.3 34.6-1.1 5.9 2.3 10.8 5.4 15.4 14.9-6.1 13.8-17.1 14.4-27.8.3-7.6 1.3-15.1 3-22.6 3.7-15.6 11.3-30.3 19.4-44.8 8.3-14.8 11-30.2 9.2-46.5-1.8-16.4-7-32.1-14.2-47.3-4.8-9.6-9.6-19.2-14.2-28.8z\"/><path d=\"M87 287.4c-7.5 7.6-10 16.8-12.5 25.9-10.4 36.6-1.1 70.9 19.2 103.8 4.5 7.4 9.2 14.7 14.5 23-1.6-.5-3.1-1.1-4.6-1.8-6.9-3.8-14.1-7.5-20.5-11.7-10.3-6.7-17.8-14.6-19.8-25.9-1.5-8.4-6.3-16.6-9-24.9-5.3-15.9-9.4-32-7.7-48.6 1.5-15 7.2-29.2 12.8-43.4 6.3-15.9 12.4-31.8 18.4-47.8 1.2-3.3 1.4-6.7 2.1-10-.4-.1-.8-.3-1.2-.4-.9 1.5-2.3 2.9-2.8 4.6-6.6 18.1-12.9 36.3-19.7 54.3-5.4 14.2-11 28.4-12.3 43.5-1.7 18.8 3.9 36.7 9.9 54.6 1.2 3.6 2.4 7.1 3.9 11.7-6.5-4-11-7.8-13.1-13.5-2.7-7.3-6-14.3-9-21.5-9.6-22.3-14.7-44.8-10.5-68.4 2.8-15.3 3-30.9 6.7-46 4-16.6 10.1-32.9 16.3-49 6.8-17.7 17-34.2 29.8-49.8C102.4 116 136.4 98 180.7 92.6c11.8-1.4 23.6-1.9 35.2.6 5 1.2 9.9 2.9 14.4 5.1 2.9 1.3 5.5 3.2 2.4 6.6-1.1 1.1.5 3.8.3 5.7-1.1 13.4-3.1 26.7-3.3 40-.1 6.9-1.9 13.6-5.1 19.9-.7 1.4-1.6 2.9-1.5 4.3.6 7.6-4.9 12.3-11.1 16.9-.9.7-3 .7-4.4.5-4.1-.8-8.1-2.3-12.2-2.9-13-2-24.3 1-32.1 9.8-14.9 16.6-29.4 33.6-44 50.4-9 10.5-17.9 20.9-26.7 31.3-1.2 1.4-2.2 3-3.3 4.6-1.1.6-1.7 1.3-2.3 2z\"/><path d=\"M331.2 221.5c4.6 9.6 9.3 19.2 14 28.7 7.3 15.2 12.4 30.9 14.2 47.3 1.7 16.2-.9 31.5-9.2 46.5-8.1 14.5-15.7 29.2-19.4 44.8-1.7 7.5-2.7 15-3 22.6-.6 10.7.5 21.7-14.4 27.8-3.2-4.5-6.6-9.5-5.4-15.4 2.2-11.6 3.2-23.5 7.3-34.6 11.2-30.4 10-60.7 3-91.4-3.1-13.7-5.6-27.5-9.2-41.1-1.4-5.4-4.9-10.5-7.8-15.5-2.3-4.1-4.7-8.2-7.3-12.3-4.3-7-8.2-14.2-13.4-20.9-6.4-8-16.2-12.6-28-12.7-10-.1-20 1.1-30 2.3-4.1.5-7.7.7-11.4-2.2 1.2-1.2 2.5-2.4 3.9-3.4 5.4-4.2 9.3-9.1 10.4-15.3.2-1.5.6-3 1.3-4.4 5-8.3 4.5-17.3 4.8-26.3.4-12.5 1.7-25 3-37.5.3-1.7 1.5-3.2 3.2-4.2 12-6.4 27.9-6 39.9.5 15.3 8.2 26.7 19.3 36.7 31.4 26.3 32 41.4 67.2 48.7 104.9 2.5 12.9 4.4 26.2 9.3 38.5 10.2 25.6 7.2 50.2-4 74.8-3.9 8.8-6.8 17.8-8.8 27.1-1.1 4.7 0 9.8.4 14.8.3 3-.9 6.1-3.3 8.3-2.9 3.2-5.4 6.6-7.6 10.2-5.2 8.1-13.7 13.6-22.9 18.8 3-17.7 4.9-35.2 9.3-52.3 2.7-10.4 7.9-20.6 14-30.1 15.2-23.8 16.3-48.4 9-73.7-5.4-18.4-13.5-36.2-24.3-53-.7-1.1-1.6-2.2-2.5-3.4z\"/></g>",
        "female6": "<g fill=\"$[hairColor]\" stroke=\"#000\" stroke-width=\"4\"><path d=\"M388.9 299.1c-8.5-37.3-23.3-73.5-39.4-109.4-4.8-10.6-10.1-21.6-18.4-30.8-18.7-20.6-44-36.3-73.2-48.2-15-6-31.3-9.9-48.2-11.4-19-1.9-36.7 1.9-54 7-26.5 7.8-48.2 21.1-67.9 36.1-7.8 5.9-15.3 12.3-20.7 19.5-10.8 14.3-17.3 30-23.9 45.7-16.8 40.1-32.4 80.5-37.5 122.5-1.2 10.2-2.9 20.4 2.5 30.3 2.3 4.2 4.9 8.2 6.9 12.4 2.1 4.3 3.6 8.8 5.5 13.1.5 1.3 1.1 2.9 2.3 3.5 10.6 6.1 21.2 12.1 32.1 17.8 9.2 4.7 16.7 10.3 22.2 18 6.3 8.6 15.2 16.2 23.1 24.2.9.9 2.6 1.3 3.9 1.9.5-.2.9-.5 1.3-.7-10.8-9.8-9.8-22-13.5-33.2-.3-1-.8-2.8-1.3-5-8.9-35.6-14.2-52.9-4.2-101.1 1.5-7.2 1.4-14.9 10.2-20.4 4.9-3 8.8-7.1 13.6-10.2 5.4-3.6 9.1-7.5 9.2-13q.15-.75.6-1.5c4.9-.5 10.1-.2 13.4-1.9 12.8-6.6 26.4-11.9 41.3-15.3-.1-23.4 16.6-47.3 25.9-59.7 12.8 18.9 24.7 38 25.1 58.6 12.2 4.5 24 8.4 34.8 13.3 6.4 2.9 12.2 5.3 20 4.2.6 2.5 1 4.7 1.6 6.9.2 1.2.8 2.4 1.8 3.4 5.8 4.6 11.4 9.2 17.6 13.6s10.7 9.2 11.4 15.9c1.2 11.1 3.7 22.2 4.7 33.4.6 6.8-.6 29.6-7.9 74.3-.3 1.8-.5 3.3-.7 4.2-4 11.8-3.2 23.9-13.8 33.8.5.1 1 .4 1.4.4 1.3-.9 2.7-1.6 3.9-2.5 11.5-9 20-19.6 27.8-30.5 1.8-2.2 4.1-4.1 6.8-5.7 4.2-2.7 8.8-4.9 13.2-7.4 8.7-4.8 17.3-9.7 25.9-14.6 1.9-1.2 4.2-2.3 5-3.9 2.9-5.6 5.4-11.3 7.9-17.1 3.1-7 8.6-14.2 8.3-21.2-.6-16.5-2.9-33-6.6-49.3zM18.4 371.8l-1.8.3c-2.5-5.4-5-10.8-7.4-16.2-5.1-11.3-2.3-22.7-.4-34 6-35 18.3-68.8 31.9-102.4 3.7-9.3 7.9-18.3 11.8-27.5-16.7 59.4-36.4 118.3-34.1 179.8zm76.2 69.3c-1.5-1.5-3.3-2.7-4.5-4.3-9.7-12.3-20.2-24.3-28.9-37-11.3-16.6-12.8-34.6-11.4-52.8 1.7-22.2 10.8-43.1 20.9-64.1v33.6c.4 0 .9.1 1.4.2L85.3 302l1.5.3C73.5 349 81.9 395 94.6 441.1zm228.7-19.7c-4.8 6-9.9 11.8-14.9 17.7-.4.6-1 1-1.6 1.4 4.4-22.6 10-45.6 13.1-68.7s.2-46.3-5.4-69.4c.4-.1.9-.2 1.4-.3 4.4 4.9 8.8 9.8 13.8 14.9 2.9-5.8 1.5-11.3 1.8-16.6.3-5.5.1-11 .1-16.7.4.3.8.4.9.6 9.9 23.3 19.4 46.8 19.2 71.7-.1 15.1-2.7 29.8-11.5 43.5-4.9 7.5-11.1 14.7-16.9 21.9zm57-54.3c-.1 6-1.2 11.9-2.1 17.8-.1 1-1.3 2.1-2.4 2.7-5.8 3.5-11.7 6.9-17.7 10.3-7 4-14.1 7.8-21.2 11.7l-.7-.6c1.3-2 2.2-4.3 4.4-5.1 8.3-7.7 9-16.9 11-26 4.9-22.5 2.1-44.7-6.6-66.2-9.2-22.8-18.8-45.6-30.5-67.7-14-26.2-38-47.1-69.3-63.2-7.3-3.8-15.4-5.8-24.5-4.8 1.8.2 3.5.4 5.3.6 8.6 1 15.9 4.1 22.8 8 20.6 11.5 38.5 24.9 51.6 41.6 9.4 12 15.9 25.1 22.5 38.2 8.4 16.5 6.1 33.5 6.7 51.1-.6-.4-1.1-.8-1.5-1.3-7.9-13.6-21.1-24.2-35.5-34.2-4.4-3-7.5-6.9-8.8-11.2-2.4-7.2-6.9-14-11.1-20.7-9.9-15.9-20-31.8-30.2-47.6-1.6-2.4-3.8-4.6-6.2-7.4 14.8 24.1 29.3 47.4 44 71.3-5.6.1-9.7-.2-14.1-2.1-11.2-4.9-23-8.9-34.5-13.4-1.4-.6-3.5-1.6-3.5-2.4-.6-15.6-8.2-29.7-16.4-43.6-3.1-5.3-6.7-10.4-10.6-16.3-9.4 9.5-14.4 19.7-19.4 29.7-4.8 9.7-9 19.6-9 30.1 0 .7-1.5 1.8-2.6 2.1-13.2 3.5-25.7 8.4-37.2 14.3-3 1.5-7.4 1.5-11.2 2.1-.3-.4-.6-.7-.9-1 13.8-22.5 27.5-44.9 41.2-67.3-.3-.2-.7-.2-1-.4-3.2 4.9-6.5 9.8-9.6 14.7-10 15.7-20.2 31.5-29.8 47.3-2.7 4.3-3.6 9.2-5.6 13.8-.8 1.6-1.9 3-3.5 4.3-10.7 8.3-22.9 15.6-31 25.7-3.2 4-5.9 8.1-9.7 12 0-3.1-.2-6.1 0-9.1.7-10.5-.5-21.2 2.9-31.2 4.4-13 12-25.5 19.1-38 12.6-22.2 34.7-38.7 60.1-52.9 7.6-4.4 16.5-7.1 25.9-8-8.5-.8-16.2 1.1-23.1 4.6-16.4 8.1-31 18.1-43.2 29.7-18.6 17.5-31.2 37.4-39.3 59-4.3 11.6-10.5 22.8-15.2 34.3-8.8 21.5-14.1 43.4-11 66 1.1 8.1 2.5 16.4 5.4 24.3 1.9 5.2 6.6 9.7 10 14.5.5.6.8 1.3 1.8 2.9-2.8-1.4-4.6-2.3-6.2-3.2l-31.2-17.4c-3.5-1.8-5.5-4-5.8-7.6-3.8-40.6 1.9-80.6 13.5-120.6 6.1-21.1 11.5-42.4 17.6-63.5 4.3-14.8 8.4-29.9 21.9-42 9.7-8.5 20.2-16.5 31.3-24 19.1-13.2 41-22.9 66.4-27.7 9.6-1.8 19.7-3.6 29.4-3.3 11.1.3 22.4 2.3 33.1 4.9 32.4 7.6 57.7 23.4 80.8 41.3 9.1 7 17.2 14.8 21.1 24.2 4.8 11.6 8.8 23.3 12.7 35 3.2 9.7 5.9 19.4 8.7 29.1 12.4 43.5 22.3 87.1 21.7 131.8zm3.7 3.9c-2.6-30.9-3.6-61.7-12-92.1-8.4-30.2-16.5-60.4-24.8-90.7 2.6 6.2 5.2 12.4 7.6 18.5 7 18 14.3 35.8 20.7 53.8 9.4 26.3 16.9 53 19 80.4.8 10.9-4.7 20.5-10.5 30.1z\"/><path d=\"M336.2 409c1.3-1.9 2.2-4.2 4.1-5.9 8.3-7.6 9-16.9 11-26 5-22.4 2.1-44.7-6.6-66.2-9.2-22.8-18.8-45.6-30.5-67.7-13.9-26.4-38-47.2-69.3-63.2-7.3-3.8-15.3-5.9-24.5-4.8 1.8.2 3.6.4 5.3.6 8.6 1.1 15.9 4.2 22.8 8 20.6 11.5 38.5 25.1 51.6 41.6 9.5 12.1 15.9 25.1 22.5 38.2 8.4 16.6 6.1 33.6 6.7 51.1-.8-.6-1.3-.9-1.5-1.3-8-13.7-21.1-24.3-35.5-34.2-4.4-3-7.5-6.8-8.8-11.2-2.4-7.2-6.9-14-11.1-20.7-9.9-16-20-31.8-30.2-47.6-1.5-2.4-3.8-4.6-6.2-7.4 14.9 24.1 29.3 47.5 44 71.3-5.6.2-9.7-.2-14.1-2.1-11.2-4.8-23-8.9-34.5-13.4-1.4-.6-3.5-1.6-3.5-2.4-.6-15.6-8.2-29.6-16.4-43.6-3.1-5.3-6.8-10.4-10.6-16.3-9.4 9.6-14.4 19.8-19.4 29.7-4.9 9.7-9 19.5-9 30.1 0 .7-1.5 1.8-2.6 2.1-13.2 3.5-25.7 8.4-37.2 14.3-3 1.5-7.4 1.4-11.2 2.1-.3-.3-.6-.6-.9-1 13.7-22.4 27.4-44.8 41.2-67.3-.3-.2-.7-.2-1-.4-3.2 4.9-6.5 9.8-9.6 14.7-10 15.7-20.1 31.5-29.8 47.3-2.6 4.3-3.6 9.2-5.6 13.8-.7 1.6-1.9 3.1-3.5 4.3-10.7 8.4-22.9 15.7-31 25.7-3.1 3.9-5.9 8-9.7 12 0-3-.2-6 0-9.1.7-10.4-.5-21.2 2.9-31.2 4.4-13 12.1-25.5 19.1-38 12.6-22.2 34.7-38.6 60.1-52.9 7.6-4.3 16.5-7 25.9-8-8.5-.8-16.2 1.1-23.1 4.6-16.4 8.2-30.9 18.2-43.2 29.7-18.6 17.6-31.3 37.4-39.3 59-4.3 11.6-10.5 22.8-15.2 34.3-8.7 21.5-14.1 43.4-11 66 .9 8.2 2.8 16.3 5.4 24.3 1.9 5.1 6.6 9.7 10 14.5.4.6.8 1.3 1.8 2.9-2.8-1.5-4.5-2.3-6.2-3.2l-31.2-17.4c-3.5-1.9-5.5-4-5.8-7.6-3.8-40.7 1.9-80.7 13.5-120.4 6.2-21.1 11.5-42.4 17.6-63.5 4.3-14.9 8.4-30.1 21.9-42 9.7-8.5 20.2-16.5 31.3-24 19.1-13.2 41.1-22.9 66.4-27.7 9.6-1.8 19.7-3.6 29.4-3.3 11.1.4 22.4 2.4 33.1 4.9 32.4 7.6 57.7 23.3 80.8 41.3 9 7 17.2 14.8 21.1 24.2 4.8 11.5 8.8 23.1 12.7 35 3.2 9.6 5.9 19.4 8.7 29.1 12.3 43.5 22.2 87.1 21.7 131.8-.1 5.9-1.2 11.8-2.1 17.8-.3 1-1.2 2-2.4 2.7-5.8 3.5-11.7 7-17.7 10.3-7 3.9-14.1 7.8-21.2 11.7.1.4-.2.2-.4 0z\"/><path d=\"M70.7 282.9v33.7c.5.1 1 .2 1.4.2l13.2-14.7 1.5.3c-13.3 46.8-4.9 92.6 7.8 138.8-1.6-1.4-3.1-2.8-4.5-4.3-9.8-12.3-20.3-24.3-28.9-37-11.3-16.6-12.7-34.5-11.4-52.8 1.7-22.3 10.7-43.3 20.9-64.2zm245.2 19.2 13.6 15c2.9-5.7 1.6-11.2 1.8-16.6s.1-10.9.1-16.7c.4.2.8.4.9.6 10 23.4 19.4 46.8 19.2 71.7-.1 15-2.7 29.7-11.5 43.5-4.9 7.6-11.1 14.6-16.9 21.9-4.8 5.9-9.9 11.8-14.9 17.7-.5.5-1 1-1.6 1.4 4.4-22.6 10-45.6 13.1-68.7s.2-46.4-5.4-69.4c.5-.1 1.1-.2 1.6-.4zM52.5 192c-16.7 59.4-36.4 118.4-34 179.7l-1.8.3c-2.5-5.4-5-10.8-7.4-16.2-5.1-11.3-2.3-22.7-.4-34 6-35 18.3-68.8 31.9-102.4 3.6-9.1 7.8-18.3 11.7-27.4zm294.7-3.8c2.5 6.2 5.1 12.4 7.5 18.6 7 17.8 14.3 35.8 20.7 53.8 9.4 26.4 16.9 53.1 19 80.4.8 10.8-4.7 20.4-10.5 30.1-2.6-30.9-3.5-61.8-12-92.1-8.3-30.3-16.4-60.5-24.7-90.8z\"/></g>",
        "female7": "<g fill=\"$[hairColor]\" stroke=\"#000\" stroke-width=\"4\"><path d=\"m216.1 60.6 11.1 1.8c15.5 2.3 30 8.1 41.8 16.8 32.1 23.2 57.1 50.5 71.8 84.2 8.9 20.5 15.1 41.5 16.6 63.3 2 29.6-.2 59.2-7.7 88.2-3.2 12.2-3.6 24.2-3.8 36.4-.2 24.4-.1 48.9-.7 73.2-.7 29.5-8.8 58-17.5 86.3-2.2 7.2-4.5 14.4-6.9 21.5-.4 1.1-1.1 1.9-2.2 2.5-1.6-10.2 2.4-20 2.6-30.8-17.2 15.8-34.5 30.4-60.4 36 1-1.5 1.8-3.2 2.6-4.9 13.5-40.7 23-82.4 28.4-124.4 5.4-42.4 13-84.6 9.4-127.1-8.1 1.2-16.5 3.5-24.9 3.7-11.6.2-23.2-1.1-34.8-2.1-1.9-.2-4.7-2.5-5.1-4.2-2.2-9-3.8-18.2-4.8-27.4-1.9-22.2-7.5-44.2-16.6-65.2-.4-1-1.2-1.8-2.2-2.5 1.8 8.3 3.7 16.6 5.4 24.9 4.3 20.4 5.1 40.9 3.4 61.6-.3 4 .5 8.1.1 12.1a5.7 5.7 0 0 1-3.6 4.1c-11.7 3.6-24.6 3.7-36.4.1-3-.9-4.3-2.2-3.5-5.5.9-3.3.4-6.9 0-10.4-2.9-29 1.1-57.5 8.7-85.8.3-1 .5-2 .7-3l-1.7-.4c-4.1 12.5-9.3 24.8-12.2 37.5-3.2 14.6-4.5 29.4-6.7 44.2-.8 5-2 9.9-3 14.8-.6 3-2.6 4.5-6.3 5.3-18.7 3.5-37.1 3.3-55.4-1.8l-5-1.4c2 87.3 13 172.8 41.1 257.6-5.6-1.8-11-2.9-15.8-5.1-15.9-7.3-29.9-17.2-41.2-29-.6-.7-1.3-1.2-3.1-3l4.4 31.5-2 .3c-.7-.8-1.3-1.6-1.7-2.5-7.1-26-15.2-51.9-20.9-78-3.3-15.2-3.5-31.1-3.9-46.7-.6-24.3-.1-48.5-.4-72.9-.1-5-1.6-10-2.6-15.1-1.8-9.1-4-18.2-5.4-27.3-3.6-24.2-5.9-48.4-2.6-72.6 6.8-49.8 28.3-93.8 72.3-128.7 8.3-6.6 16.6-13.3 25.8-19 10.8-6.6 23.8-9 36.9-10.7 1.8-.2 3.5-.7 5.2-1zM200.4 73c2.2-6.8 10.3-6.5 16.3-9.4H183c4.3 1.4 7.6 2.1 10.4 3.6 2.7 1.6 4.7 3.9 7 5.8-2.1-1.1-4.2-2-6.5-2.9-6.4-2-13-5.5-19.3-5.2-8.7.5-17.5 3.4-25.8 6.1-5.4 1.8-10 5.5-15 8.3 23.3-1.2 45.8-2.5 65.9 7.9 20.8-10.3 43.2-9.1 66.1-7.1-11.6-10.3-26.6-13.3-41.8-15.8-.5-.1-1.1-.1-1.6 0-7.2 3-14.6 5.9-22 8.7zm66.2 463.3c16.6-4.9 43.9-22.6 53.9-35.2.9-1.2 1.5-2.8 1.6-4.2 1.5-16 3.2-32 4.1-48.1 3.5-68.8 1.1-137.6-10.1-203.3 6.4 19.3 8.2 41.7 9.9 64 1.8 22.5 3.2 45.2 3.7 67.7.5 22.7.2 45.5-.9 68.3-1.1 22.3-3.4 44.7-5.3 68.4 10.5-32.1 19-63.1 19-95.2-.1-48.5 4-97.1-3.6-145.5l1.5-.2 5.9 41.3 1.5.1c2.6-19.9 6.3-39.9 7.4-59.9.8-15.6-.3-31.3-3.1-46.7-3.3-18.6-7.7-37.1-21.1-53.2-13-15.7-27.8-29.8-45.4-41.8-4.4-3-9.3-5.9-14.6-7.8-17.4-5.9-36-9-54.8-8.9-4.7 0-9.4 2.5-14.1 3.6-1.4.3-2.9.3-4.3 0-5.3-1.2-10.4-3.5-15.7-3.6-7.2-.1-14.4.5-21.4 1.7-14.8 2.4-29.7 4.5-42.4 12.5-16.7 10.4-30.6 23-43.1 36.8-5.3 5.8-10.8 11.9-14.1 18.6-9.1 19.1-14 39.1-16.2 59.6-2.2 20.2.4 40.3 3.1 60.3 1.3 9.4 3.1 18.7 4.7 28 3.5-13.5 2.9-27.3 7.5-39.5-1.1 15.4-2.9 31.8-3.3 48.1-.5 23.5.4 47.1-.1 70.6-.9 38.8 5 77.7 17.5 115 .4 1.2.9 2.5 1.3 3.8.6-.9.9-1.9.7-2.9-2-25.7-4.9-51.4-6-77.2-2.2-53.2.3-106.5 7.5-159.4 1.3-9.6 3.8-19.1 5.7-28.6l1.3.2c-1.1 4.5-2.7 9.1-3.2 13.7-3 31.2-6.5 62.2-8.5 93.4-3.2 48.2-.7 96.5 4.3 144.6.1 2.2 1 4.4 2.5 6.3 12.9 13.5 29 24.6 47.4 32.4 1.9.9 4 1.4 6.6 2.3-3.9-12-8.3-22.9-11-34.1-4.3-17.9-8.2-36-11.2-54.2C102.9 394 93.5 340 96.1 285c-.1-1.3-.4-2.6-.9-3.8-.7-1.8-2.3-3.6-2.3-5.5-.9-40.5 16.4-76.5 38.2-111.5 1.4-1.9 2.9-3.8 4.7-5.6 1.6-1.7 3.2-3.4 4.9-5-3.6 6.6-8.5 12.3-12 18.4-12.4 21.7-22.3 44.1-28.5 67.6-3.4 12.6-5 25.3-2.2 38.3.5 1.4 1.7 2.7 3.3 3.4 18.2 5.2 37.8 5.6 56.4 1.2 1.5-.4 3.6-1.8 3.8-3.1 1.6-7 2.8-14 3.6-21.1 1.8-20.3 5.4-40.4 13-59.8 5.5-14.3 12.7-28.1 21.6-41 .9 1.4 1.5 2.6 2.2 3.5 16 24.5 26.2 51.4 30.1 79.2 1.8 12.7 3.5 25.3 5.6 37.9.3 1.6 2.4 3.9 4.2 4.3 18.9 4.4 37.7 3.7 56.3-1.2 1.2-.3 2.8-1.3 2.9-2.2.8-4.9 2.4-10 1.6-14.8-2-12.8-3.6-25.7-7.9-38-8.9-26-18.5-51.9-39.7-74.2 7.8 4.8 13.8 11.2 17.5 18.7 7.3 13.8 14.5 27.8 20.8 41.9 9 20.2 13.8 41.1 13 62.8 0 1.4.2 3.7-.7 4.3-3.6 2-2.5 4.7-2.6 7.4-.5 19.7.7 39.6-1.6 59.1-5.4 44.2-11.8 88.3-19.4 132.2-2.8 19.8-9.9 38.6-15.4 57.9zm-66.1-374.4-2-.3c-2.9 7.3-6.2 14.4-8.5 21.8-10.2 32.9-11.4 66.4-9.2 100.2.1 1.3 2.5 3.6 3.9 3.6 9.4.5 18.9.6 28.4.6 4.8 0 6.9-2.1 6.3-6.4-.3-3.5-.3-7 .1-10.4 1.7-20.1.6-40.4-3.3-60.3-3.4-16.7-5.6-33.7-15.7-48.8zm-.3-63.1c6.5-4.5 14.1-5.2 21.6-4.7 7.7.5 15.4 1.2 23 2.5 13.4 2.2 26.9 4.5 38.3 11.6 17 10.8 31.9 23.7 44.3 38.3.8 1 1.8 1.9 2.8 2.8 0-1.4-.4-2.8-1.2-4-13.4-23.9-33.3-43.4-56.6-60.8-2.3-1.7-5.2-2.8-8.2-3-12.2-.5-24.5-1.3-36.6-.5-10.2.8-21.2 1.5-28 10-2.1-5-7.2-6.3-12.1-7.6-15.6-4-31.6-4-47.6-2.6-4.3.4-9.2 1.5-12.3 3.8-23.3 17.3-43.1 37-56.5 60.8-.7 1.2-1.3 2.6-1.6 3.2 10.1-9.4 20.5-19.5 31.4-29 13.6-11.9 30-19.7 49.6-22.3 6.2-.9 12.4-2.1 18.6-2.7 10.4-.8 21.2-2.2 31.1 4.2z\"/><path d=\"M266.6 536.3c5.4-19.2 12.5-38.2 15.9-57.5 7.6-43.9 14-88 19.4-132.2 2.4-19.6 1.2-39.4 1.6-59.1.1-2.6-1-5.4 2.6-7.4 1-.6.7-2.8.7-4.3.8-21.7-4-42.7-13-62.8-6.4-14.2-13.5-28.1-20.9-42-3.7-7.5-9.8-13.9-17.5-18.7 21.3 22.3 30.8 48.2 39.8 74.1 4.2 12.3 5.9 25.2 7.9 38 .7 4.8-.8 9.9-1.6 14.8-.1.9-1.7 1.8-2.9 2.2-18.6 5.1-37.5 5.7-56.3 1.2-1.8-.4-3.9-2.7-4.2-4.3-2.2-12.6-3.9-25.2-5.6-37.9-3.8-27.8-14.1-54.6-30.1-79.2-.7-1.1-1.3-2.1-2.2-3.5-8.9 13-16.1 26.7-21.6 41-7.6 19.5-11.2 39.5-13 59.8-.8 7.1-2 14.2-3.6 21.1-.2 1.2-2.3 2.7-3.8 3.1-18.5 4.3-38.1 3.8-56.4-1.2-1.6-.7-2.9-1.8-3.3-3.4-2.8-12.8-1.2-25.6 2.2-38.3 6.2-23.5 16.1-45.9 28.5-67.6 3.5-6.1 8.4-11.8 12-18.4-1.6 1.6-3.3 3.3-4.9 5-1.7 1.7-3.3 3.5-4.7 5.6-21.8 35-39.1 71-38.2 111.5 0 1.8 1.6 3.6 2.3 5.5.6 1.2.9 2.5.9 3.8-2.6 54.8 6.8 108.9 15.6 163.1 3 18.1 6.9 36.2 11.2 54.2 2.7 11.2 7.1 22.1 11 34.1-2.7-.9-4.7-1.5-6.6-2.3-18.4-7.8-34.6-18.8-47.5-32.4-1.5-1.8-2.4-4-2.5-6.3-5-48.1-7.5-96.3-4.3-144.6 2.1-31.2 5.5-62.3 8.5-93.4.5-4.6 2.1-9.1 3.2-13.7l-1.3-.2c-1.9 9.5-4.4 19-5.7 28.6-7.2 52.9-9.7 106.2-7.5 159.4 1.1 25.8 3.9 51.5 6 77.2.2 1.1-.1 2-.7 2.9-.4-1.2-.9-2.5-1.3-3.8-12.5-37.4-18.5-76.2-17.6-115.1.5-23.5-.5-47.1.1-70.6.4-16.3 2.2-32.7 3.3-48.1-4.5 12.3-4 26-7.5 39.5-1.6-9.4-3.4-18.7-4.7-28-2.7-20-5.3-40.1-3.1-60.3 2.2-20.5 7-40.6 16.2-59.6 3.2-6.7 8.8-12.8 14.1-18.6 12.4-13.8 26.4-26.4 43.1-36.8 12.7-8 27.6-10 42.4-12.5 7-1.2 14.2-1.9 21.4-1.7 5.3.2 10.5 2.5 15.7 3.6 1.4.3 2.9.3 4.3 0 4.7-1.2 9.4-3.6 14.1-3.6 18.8 0 37.4 3 54.8 8.9 5.2 1.7 10.1 4.7 14.6 7.8 17.7 12 32.4 26.1 45.4 41.8 13.4 16.1 17.8 34.7 21.1 53.2 2.8 15.4 3.8 31.1 3.1 46.7-1.1 20-4.8 40-7.4 59.9l-1.5-.1-5.8-41.3-1.5.2c7.6 48.4 3.5 97 3.6 145.5 0 32.1-8.5 63.2-19 95.2 1.9-23.7 4.3-46 5.3-68.4 1.1-22.7 1.4-45.4.9-68.3-.5-22.6-2-45.2-3.7-67.7-1.8-22.4-3.5-44.9-9.9-64 11.2 65.8 13.6 134.5 10.1 203.3-.8 16.1-2.6 32.1-4.1 48.1-.1 1.5-.7 3-1.6 4.2-10.4 12.5-37.7 30.2-54.3 35.1zM325.7 204c-1.2-33-20.8-56.6-52.9-74-15.7-8.5-32.9-11.4-51.1-9.7-6.3.6-12.4 3.2-18.5 4.9l.5 1.3c4.4-1.4 8.8-3.5 13.4-4.1 17.3-2 34.1-.4 49.6 7.1 28.1 13.6 47.7 32.9 55.2 59.9 1.3 5 2.5 9.7 3.8 14.6zm-250.8-2.8c1.9-6.2 3.4-12.7 5.8-18.8 10.4-27.3 32.4-46 63.4-56.8 16.4-5.7 33.9-6.3 51-.2-3.9-1.9-7.8-4-12-4.5-14.4-1.9-28.9-1.6-42.5 3.5-26.1 9.9-45.9 25.4-58 47.4-5.2 9.1-7.8 19.2-7.7 29.4z\"/><path d=\"M200.5 161.9c10.1 15.1 12.3 32.1 15.7 48.8 3.9 19.9 5.1 40.2 3.3 60.3-.4 3.5-.4 7-.1 10.4.6 4.3-1.5 6.3-6.3 6.4-9.5 0-18.9-.1-28.4-.6-1.4-.1-3.8-2.3-3.9-3.6-2.2-33.7-1-67.3 9.2-100.2 2.3-7.4 5.6-14.5 8.5-21.8zm-.3-63.1c-9.9-6.3-20.6-5-31.2-4-6.2.6-12.4 1.8-18.6 2.7-19.6 2.6-36 10.4-49.6 22.3-10.9 9.6-21.3 19.7-31.4 29 .3-.5.9-1.8 1.6-3.2 13.4-23.9 33.2-43.5 56.5-60.8 3.1-2.3 8.1-3.5 12.3-3.8 16-1.3 32-1.4 47.6 2.6 4.9 1.2 10 2.6 12.1 7.6 6.8-8.5 17.8-9.3 28-10 12.1-.9 24.4 0 36.6.5 3 .3 5.9 1.2 8.2 3 23.2 17.4 43.1 36.9 56.6 60.8.8 1.2 1.2 2.6 1.2 4-.9-.9-1.9-1.8-2.8-2.8-12.4-14.6-27.3-27.5-44.3-38.3-11.3-7.2-24.9-9.4-38.3-11.6-7.6-1.2-15.3-2-23-2.5-7.5-.7-15.1-.1-21.5 4.5z\"/><path d=\"M200.4 73.1c7.4-2.9 14.8-5.8 22.2-8.6.5-.1 1.1-.1 1.6 0C239.5 67 254.5 70 266 80.3c-22.9-2-45.3-3.2-66.1 7.1-20.2-10.4-42.7-9-65.9-7.9 5-2.9 9.5-6.5 15-8.3 8.3-2.9 17-5.8 25.8-6.1 6.3-.3 12.9 3.2 19.3 5.2 2.2.9 4.4 1.7 6.5 2.9z\"/><path d=\"M200.5 73c-2.4-1.9-4.4-4.3-7.1-5.8s-6.1-2.2-10.4-3.6h33.7c-6 3-14.1 2.6-16.2 9.4-.1.1 0 0 0 0zm125.2 131c-1.3-4.9-2.5-9.8-3.8-14.6-7.6-27-27-46.3-55.2-59.9-15.5-7.5-32.3-9.1-49.6-7.1-4.6.6-8.9 2.7-13.4 4.1l-.5-1.3c6.2-1.6 12.2-4.2 18.5-4.9 18.2-1.8 35.4 1.2 51.1 9.7 32.1 17.5 51.7 41.1 52.9 74zm-250.8-2.8c-.2-10.2 2.5-20.2 7.7-29.4 12.1-22 31.9-37.6 58-47.4 13.6-5.1 28-5.4 42.5-3.5 4.2.6 8.1 2.7 12 4.5-17.1-6.1-34.6-5.5-51 .2-31 10.6-53 29.3-63.4 56.8-2.4 6.1-3.9 12.4-5.8 18.8z\"/></g>",
        "female8": "<g fill=\"$[hairColor]\" stroke=\"#000\" stroke-width=\"4\"><path d=\"M218.5 42.8c5.4-7.8 13.7-12.2 23.7-14.9C228 39.3 214 50.7 208.4 68.2c3.4-.2 5.8-.3 8.1-.5 11.7-1.3 23.5 1.3 33 7.2 16.9 10.1 29.8 24 37.3 40.2 1.1 2.5 2.6 5.2 2.3 7.7-.5 4.3 1.8 6.4 5.7 8.6 28.8 16.9 46.9 40.3 56.6 68.2 8.3 23.9 12.2 48.2 7.2 73 3.2 15.2-.6 30.2-2.2 45.2-2.4 22-9.4 42.9-27.3 60-16.7 15.9-33.6 31.6-50.4 47.4-.9.7-1.9 1.2-2.9 1.7l-1.1-.7c.8-1.4 1.6-2.8 2.5-4.2 9.6-14.9 19.9-29.4 28.6-44.6 18-31.3 18.5-63.7 5.1-96.3-2.2-5.5-5.3-10.8-9.1-15.7-10.2-12.7-21.1-25-32.5-38.2-.3 1.1-.5 2.3-.6 3.4-.2 7.7-.4 8.3-9.4 9.7-8.2 1.3-16.4 2.3-24.7 2.8-32.6 2.2-65.2 2-97.7-2.3-1.3-.2-2.6-.6-3.9-.7-6-.7-9.2-3.3-8.2-8.6.1-1.6.1-3.2 0-4.7-19.7 23.1-42.7 43.1-48.4 71.7-5.4 26.9-3.8 53 10.6 77.7 9.1 15.6 19.5 30.6 29.3 45.9 1 1.4 1.5 3 1.4 4.6-.9-.3-2-.5-2.6-1-19.1-18.1-38.5-36-57.1-54.5-5.2-5.2-8.4-12-11.2-18.4-4.1-9.6-7-19.6-10.5-29.4v-12.3c.4-4.9.7-9.7 1.3-14.5.8-6.1 2-12.2 2.6-18.3.6-4.2.7-8.5.4-12.7-4.8-43 7.9-81.6 40.6-115.4 10.4-10.9 22.7-20.4 36.5-28.1 3-1.7 3.8-3.5 2.9-6.3-4.4-13.5.4-24.2 14-32.2 14.2-8.3 29.2-15.4 46.3-18.1 6.6-1 13.7-.2 20.8-.2-5.1-5-12.1-9-19.6-12.3s-15.1-5.9-22.6-8.8c6-1.6 19.3 2.5 37.2 11.5-3-11.4 4.5-42.4 12.7-51-.9 7.2-2.1 13.8-2.5 20.5-.6 7.7-.7 15.4-.6 23.2 0 1.4 1.7 2.8 2.7 4.2-.1 1.9-.3 3.8-.4 6.5l23.3-25.5-.5-.5zm-90.3 94.3c-13.2 7-26.9 13.1-39 20.8-14.5 9.3-28.2 20-34.1 35.2-8.4 21.7-15.1 43.7-12.3 66.9.3 2.5.4 5.1.5 7.6 1.5-1.2 2.7-2.6 3.4-4.2 9.5-17.4 18.3-35 28.6-52 6.6-10.9 15.3-21 23.2-31.4 1-1.3 2.9-2.2 4.4-3.3-1.5 3.1-3.7 5.3-5.7 7.6-21.5 25.7-36.3 54.2-49.9 83.2-4.5 9.6-7.6 19.6-7.5 30.1.1 3.8-.1 7.6-.5 11.4-2.4 19.7 6.4 37.2 15.2 54.7 1.3 2.3 2.9 4.4 4.9 6.3 14.5 14.2 29 28.3 43.6 42.4.9.8 2 1.5 3 2.2q-.3-2.4-1.8-4.5c-7.6-12.5-16.6-24.6-22.6-37.6C62.2 330 66.2 289.3 99 251.8c5.2-6 10.9-11.8 16-17.8 4.1-4.9 8.8-9.7 11.3-15.2 6-13.2 10.9-26.7 16.5-40.7 0 1.3-.2 2.5-.4 3.8-2.4 6.8-5 13.5-7.4 20.3s-4 13.6-6.7 20.2c-4.4 10.8-1.4 15.5 12 17.1 25.3 2.8 50.8 4.1 76.3 2.6 14.1-.8 28.1-2.4 42.2-3.5 6.1-.5 7.9-3.2 7.2-8-1.5-11.1-4.7-21.9-9.5-32.3-2.7-5.8-4.4-11.9-6.5-17.9 6 12.1 11 24.3 16.2 36.6.9 2.4 2.1 4.7 3.7 6.8 8.3 9.8 16.8 19.5 25.3 29.1 27.2 30.6 33 64.8 23.7 101.2-5.3 20.7-18.2 38.7-30.4 56.9l-2.7 4.2c11.3-9.1 21.2-19.1 32-28.4 19.5-16.8 30.6-37.1 35.5-59.7 2.3-10.8 1.9-22 3.6-33 1.6-10.7-1.2-20.1-7.9-29.2-5-6.7-9.6-13.6-13.8-20.6-12.5-21.8-24.7-43.7-41.9-63.3-.2-.2 0-.7 0-2.1 2.1 2.1 3.6 3.4 4.9 4.9 16.9 19.4 28.3 41.3 41.4 62.5 4.5 7.3 10.1 14.2 15.2 21.3 1.3-1.2 2.1-2.7 2.3-4.3 3.4-29.6-4.7-59.3-23.1-84.8-9-12.6-20-23.6-35.5-30.8-3.8-1.8-8-2.9-12.1-4.4 24.4 4.5 38 19.8 51.2 35.6-11.7-19-26.9-35.4-48.7-47.2-2.9 4.4-3.2 10-9.7 12.2.3-1.7.9-3.3 1.9-4.7 5.3-7.8 6.7-15.7 2.6-24.3-7.9-16.3-20.7-29-37.9-39.2-11.4-6.8-23.2-6.8-34.9-5.2l7.1 13.3-2 .7c-.8-1.6-1.6-3.2-2.5-4.8-1.1-1.9-2-4.2-3.8-5.6-7-5.4-15.5-8-25-6.5-19.5 3.1-36.6 10.6-52 21-10.3 7-12.5 16.2-8.9 26.5 1.7 4.9.4 8.1-4.8 10.7-21.3 10.7-35.9 26.7-49.2 43.7-.2.3-.2.6-.2.9 9-6.4 17.7-13.4 27.3-19.4 9.4-5.8 20-10.1 31.3-13.9zm76.9-119.4c-8 16-12.7 37 0 45.5z\"/><path d=\"M128.2 137.1c-11.2 3.8-22 8.1-31.5 14S78.4 164 69.4 170.5c0-.3 0-.7.2-.9 13.4-17 27.9-33.1 49.2-43.8 5.2-2.6 6.6-5.8 4.8-10.7-3.6-10.3-1.5-19.5 8.9-26.5 15.3-10.4 32.4-18 52-21 9.4-1.5 18 1.2 24.9 6.6 1.8 1.4 2.7 3.7 3.8 5.6.9 1.6 1.7 3.2 2.5 4.8l2-.7-7.1-13.3c11.8-1.6 23.5-1.5 34.9 5.2 17.2 10.3 30 23 37.9 39.3 4.2 8.6 2.8 16.5-2.6 24.3-1 1.5-1.7 3.1-1.9 4.7 6.5-2.2 6.8-7.8 9.7-12.2 21.9 11.8 37 28.2 48.7 47.2-13.2-15.8-26.9-31.1-51.2-35.6 4 1.4 8.3 2.6 12.1 4.4 15.4 7.2 26.5 18.2 35.4 30.7 18.4 25.5 26.5 55.2 23.1 84.8-.2 1.6-1 3.1-2.3 4.3-5.1-7.1-10.7-13.9-15.2-21.3-13.1-21.2-24.5-43.1-41.4-62.5-1.3-1.5-2.8-2.8-4.9-4.9 0 1.3-.2 1.8 0 2.1 17.2 19.6 29.5 41.5 41.9 63.3 4.2 7.1 8.8 14 13.8 20.6 6.7 9 9.5 18.5 7.9 29.2-1.7 11-1.3 22.2-3.6 33-4.9 22.6-16 42.9-35.5 59.7-10.8 9.3-20.6 19.3-32 28.4l2.7-4.2c12.2-18.2 25.2-36.2 30.4-56.9 9.3-36.4 3.5-70.6-23.7-101.2-8.5-9.6-17-19.3-25.3-29.1-1.6-2.1-2.8-4.4-3.7-6.8-5.1-12.3-10.1-24.6-16.2-36.6 2.1 6 3.8 12.1 6.5 17.9 4.8 10.4 8 21.3 9.5 32.3.6 4.7-1.1 7.5-7.2 8-14.1 1.1-28.1 2.7-42.2 3.5-25.5 1.5-50.9.3-76.3-2.6-13.5-1.5-16.5-6.3-12-17.1 2.7-6.6 4.4-13.5 6.7-20.2s5-13.5 7.4-20.3c.3-1.3.4-2.5.4-3.8-5.6 13.9-10.5 27.5-16.5 40.7-2.5 5.5-7.2 10.3-11.3 15.2-5.1 6.1-10.7 11.8-16 17.8-32.8 37.5-36.8 78.2-17.3 120.7 6 13 15 25.1 22.6 37.6q1.5 2.1 1.8 4.5c-1.1-.7-2.1-1.4-3-2.2C88.5 398.3 74 384.1 59.5 370c-2-1.9-3.6-4-4.9-6.3-8.7-17.5-17.6-35-15.2-54.7.4-3.8.6-7.6.5-11.4-.1-10.5 3-20.5 7.5-30.1 13.5-29 28.4-57.5 49.9-83.1 1.9-2.3 4.1-4.5 5.7-7.6-1.5 1.1-3.4 1.9-4.4 3.3-7.9 10.4-16.6 20.4-23.2 31.4-10.3 17-19.2 34.6-28.7 52-.7 1.6-1.9 3.1-3.4 4.2-.2-2.5-.2-5.1-.5-7.6-2.8-23.2 4-45.2 12.3-66.9C61 178 74.7 167.3 89.2 158c12.1-7.9 25.7-13.9 39-20.9zM223.6 75c7.5 3.3 15.4 6.5 22.9 10.1 7.9 3.8 12.5 10.2 15.5 16.9 3.3 6.8 5.6 13.9 7 21.1 1.1 7.1.2 14.4.2 21.9 9.7-38.8-15.4-66.6-45.6-70zm-34.2 5.6-1.7-1.3c-8.8 8.3-18.3 16.2-26.3 25-10.5 11.7-14.2 25.2-11.4 39.8.6 2.3 1.5 4.6 2.5 6.8-3.3-27.4 2.1-41 24.5-60.1 4.1-3.4 8.3-6.8 12.4-10.2zm44.8 11.5c16.4 21.7 23.6 43.7 4.6 66.9 18.1-9 17.1-47.4-4.6-66.9zm-40.5 69.6c0-12.3-.7-23.7.2-35.2s3.3-22.7 5.1-34c-6.8 22.6-9.6 45.3-5.3 69.2zm24.1.1c5.7-5.6 7.8-50 2.6-62.7 1.4 21 2 42.1-2.6 62.7zm-85-24.5c-7.7-24.4 4.3-41.1 28.5-54.5-23.9 6.6-42 41.4-28.5 54.5zm35.8 41.3c-4.8 9.7-9.6 34.8-8.4 44.5.7 5.4 2 10.8 7.1 14.9-11.2-20-1.6-39.6 1.3-59.4zm50 59.1c1.5-19.1 1.3-38.1-3.4-56.4 1.1 18.4 2.2 37.4 3.4 56.4zm-37.7-75.8c-6-16.6-5.4-33.4-1-50.2-5.5 16.9-6.4 33.6 1 50.2zm24.2-144.3v45.5c-12.7-8.4-8.1-29.4 0-45.5z\"/><path d=\"M223.6 75c30.2 3.4 55.3 31.2 45.7 70.1 0-7.6.9-14.9-.2-21.9-1.4-7.2-3.8-14.3-7-21.1-3.1-6.8-7.6-13.2-15.5-16.9-7.6-3.7-15.5-6.9-23-10.2zm-34.2 5.6c-4.1 3.4-8.3 6.8-12.3 10.3-22.5 19.1-27.8 32.7-24.5 60.1-1-2.2-1.9-4.5-2.5-6.8-2.8-14.6 1-28.1 11.4-39.8 7.9-8.8 17.5-16.7 26.3-25z\"/><path d=\"M234.2 92.1c21.6 19.6 22.7 58 4.6 66.9 19-23.3 11.9-45.2-4.6-66.9zm-40.5 69.6c-4.3-23.8-1.5-46.6 5.3-69.2-1.8 11.4-4.2 22.6-5.1 34s-.2 22.9-.2 35.2zm24.1.1c4.6-20.6 4-41.6 2.6-62.7 5.2 12.6 3.1 57.1-2.6 62.7zm-85-24.5c-13.5-13.1 4.6-47.9 28.5-54.5-24.2 13.4-36.2 30.1-28.5 54.5zm35.8 41.3c-2.9 19.9-12.6 39.4-1.3 59.4-5.1-4.1-6.4-9.5-7.1-14.9-1.2-9.7 3.7-34.8 8.4-44.5zm50 59.1c-1.1-19-2.3-37.9-3.4-56.4 4.7 18.2 4.9 37.3 3.4 56.4zm-37.7-75.8c-7.4-16.6-6.5-33.4-1-50.2-4.4 16.8-5 33.6 1 50.2z\"/></g>",
        "female9": "<g fill=\"$[hairColor]\" stroke=\"#000\" stroke-width=\"4\"><path d=\"M216.2 66.7c3.7.6 7.4 1.3 11.1 1.9 15.5 2.3 30.1 8.2 42 17.1 32.2 23.8 57.4 51.6 72.1 86.1 8.9 20.9 15.2 42.4 16.7 64.7 2 30.3-.2 60.6-7.7 90.2-3.2 12.5-3.7 24.7-3.8 37.2-.2 25-.1 49.9-.7 74.9-.7 30.1-8.8 59.3-17.6 88.3-2.2 7.4-4.5 14.7-6.9 22-.3 1.1-1.1 2-2.2 2.6-1.9-10.4 2.6-20.5 2.3-31.3-17.1 16-34.5 30.9-59.7 36.4C290 470.4 301.2 383 303 293.7l-10.6 2.7-.7-1.3c1.9-.8 3.9-1.6 6-2.1 3.3-.7 4.3-2.1 4.7-5.1 4.7-30-7.8-57-19.5-84.2-.9-1.7-2.4-3-4.3-3.8-13.9-5.9-28.5-10.5-43.5-14-11.1-2.7-20.1 1.6-30.1 2.8-3.2.3-6.5.3-9.8 0-1.6-.2-3.2-.7-4.6-1.3-13.4-4.6-26.5-2.5-39.3 1.7-10 3.2-19.7 6.9-29.5 10.6-1.9.8-3.5 2.1-4.4 3.7-9.8 21.1-18.4 42.5-20.4 65.3-.7 7.3.7 14.7 1.1 22.1.1 2.5 0 5.1-.1 7.6-2 36.7 2.7 73.1 8 109.4 5 33.8 11.2 67.5 17.9 101.1 2.9 14.5 8.3 28.5 12.7 42.8.4 1.3 1.2 2.5 2.4 5.3-6.3-2-11.7-3.2-16.5-5.4-16-7.4-30-17.4-41.5-29.5-.6-.7-1.3-1.3-3.1-3l4.4 32.2-2 .3c-.7-.8-1.3-1.6-1.7-2.5-7.2-26.6-15.2-53-21-79.8-3.3-15.6-3.6-31.8-4-47.7-.6-24.8-.1-49.6-.4-74.4-.1-5.1-1.6-10.2-2.6-15.4-1.8-9.3-4-18.6-5.4-27.9-3.6-24.7-5.9-49.4-2.6-74.2C49.4 178.9 71 133.8 115.2 98c8.3-6.7 16.6-13.7 25.9-19.4 10.9-6.7 23.9-9.2 37.1-10.9 1.8-.2 3.5-.7 5.2-1zm-15.7 12.7c2.2-7 10.3-6.6 16.3-9.6h-30.7l14.4 9.6c-2.1-1.1-4.2-2.1-6.5-2.9-6.4-2-13-5.6-19.4-5.3-8.8.5-17.6 3.4-25.9 6.3-5.4 1.9-10.1 5.6-15 8.5 23.4-1.2 46-2.6 66.2 8 20.9-10.5 43.4-9.3 66.4-7.3-11.6-10.5-26.6-13.6-41.9-16.2-.5-.1-1.1-.1-1.6 0-7.4 3-14.8 6-22.3 8.9zM59 284l.8.1c-1.2 16.7-3 33.3-3.4 50-.5 24.3.3 48.7-.1 73-.6 37.8 4.1 74.9 16.1 111.3 1.1 3.2 1.9 6.3 2.8 9.5.7-1 .9-2.2.7-3.3-2-26.1-4.8-52.3-5.9-78.4-2.2-54.4.3-108.9 7.5-163 1.3-9.9 3.8-19.7 5.8-29.5l1.3.2c-1.1 4.8-2.8 9.6-3.3 14.4-3.1 32.3-6.5 64.5-8.6 96.9-3.1 48.7-.6 97.4 4.3 145.9.2 2.2.9 4.8 2.4 6.4 13.2 14.3 30 25.8 49.1 33.9 1.5.6 3.1 1.1 4.7 1.5-.8-3.3-1.5-6.3-2.4-9.3-3.7-12.1-8.7-24.1-11.1-36.4-6-31.5-11.4-63.1-15.8-94.8-5.4-38.5-10.6-77-8-115.9 0-1.4-.2-2.7-.7-4-.8-2.2-2.4-4.3-2.5-6.5-1.1-27 7.3-52.4 18.7-77.3.5-1.2 1.9-2.7 1.4-3.4-3.1-4.7 1.8-5.3 4.6-6.8 2.6-1.4 5.3-2.6 8.2-3.5 12.3-3.9 25-7.2 37-11.6 6.7-2.5 12.8-2.3 19.3-.7 11.5 2.8 23 3.4 34.6.2 8-2.2 15.8-2.2 23.3 1.4 1.2.4 2.4.7 3.6 1 14 4.9 28 9.7 41.9 14.7 1.2.4 3 2.1 2.7 2.5-3 5.1 1.7 8.8 3.4 12.8 9.8 23.1 16.7 46.5 15.7 71.3-.1 1.6-.4 3.3-1 4.9-.6 1.9-2.2 3.7-2.2 5.6-.1 12.7.9 25.5 0 38.2-1.6 21.6-3.9 43.3-6.6 64.8-6.4 51.5-12.8 103-31.8 153.6 21.7-8.2 40.7-20.8 55.4-36.8 1-1.3 1.6-2.8 1.6-4.3 1.9-26.5 4.8-52.9 5.2-79.4.5-31.8-.6-63.6-2.2-95.3-1-21.3-3.8-42.6-6.2-63.9-.8-7-2.7-14-4.1-20.9l1.8-.1c17 91.5 16.8 183.4 7 275.6 8.1-25.8 16.7-51.5 17.8-78.3 2.2-55.5 4.6-111.1-1-166.7 2 14.1 4 28.2 6 43.2.5-1.9 1-3.1 1.2-4.3 2.7-19.7 6.5-39.3 7.6-59.1.8-15.5-.3-30.9-3.1-46.2-3.4-19-7.8-37.9-21.1-54.4-12.8-16-28.1-30.4-45.5-42.8-8.5-6.1-18.7-10.2-29.5-12.1-10.6-1.9-21.3-3.6-32-4.8-7.9-.9-15.9-.8-22.7 3.9-.8.5-2.7.1-4-.2-5.6-1.3-11.2-3.6-16.8-3.8-6.8-.3-13.7.6-20.5 1.8-15 2.5-30.2 4.7-43 13-16.9 10.9-31.2 24-43.8 38.5-4.9 5.7-10.2 11.4-13.2 17.8-9.2 19.5-14 40-16.3 61-2.2 20.7.3 41.2 3.1 61.7 1.3 9.7 3.1 19.2 4.7 28.8h1zm141.2-178.3c6.4-4.7 13.8-5.3 21.3-4.8 7.8.4 15.5 1.3 23.1 2.5 13.6 2.3 27.4 4.6 38.9 12 17.1 11 32 24.3 44.5 39.2.8.9 1.8 1.9 2.7 2.8.2-1.1-.1-2.3-.7-3.3-13.6-24.7-33.7-45-57.3-63-2.3-1.7-5.2-2.8-8.2-3-12.4-.5-25-1.3-37.3-.4-10 .7-20.9 1.6-26.5 9-3.9-2.1-7.3-4.7-11.3-5.8-16.6-5-33.7-4.9-50.9-3.1-3.9.4-8.5 1.6-11.3 3.7-23.2 17.6-43 37.6-56.5 61.8-.8 1.4-1.5 2.9-1.9 3.7 10.4-9.8 20.7-20.1 31.7-29.9 13.5-12 29.8-19.9 49.3-22.6 6.4-.9 12.8-2.2 19.2-2.8 10.6-1.1 21.4-2.4 31.2 4z\"/><path d=\"m59 284-5.8 41.5h-1c-1.6-9.6-3.4-19.2-4.7-28.8-2.7-20.5-5.3-40.9-3.1-61.7 2.2-21 7.1-41.4 16.3-61 3-6.4 8.3-12.2 13.2-17.8 12.5-14.5 26.8-27.5 43.8-38.5 12.9-8.3 28-10.4 43-13 6.7-1.1 13.7-2.1 20.5-1.8 5.7.3 11.2 2.5 16.8 3.8 1.3.3 3.2.7 4 .2 6.8-4.7 14.8-4.8 22.7-3.9 10.7 1.2 21.4 3 32 4.8 10.9 1.9 21 6 29.5 12.1 17.4 12.4 32.7 26.8 45.5 42.8 13.4 16.5 17.8 35.4 21.1 54.4 2.8 15.3 3.9 30.8 3.1 46.3-1.1 19.7-4.9 39.4-7.6 59.1-.2 1.2-.6 2.3-1.2 4.3-2.1-15-4.1-29.1-6-43.2 5.6 55.6 3.1 111.2 1 166.7-1.1 26.8-9.7 52.5-17.8 78.3 9.8-92.1 10-184.1-7-275.6l-1.8.1c1.4 7 3.4 13.9 4.1 20.9 2.4 21.3 5.1 42.6 6.2 63.9 1.5 31.7 2.6 63.6 2.2 95.3-.4 26.5-3.3 52.9-5.2 79.4-.1 1.5-.6 3-1.6 4.3-14.7 15.9-33.7 28.6-55.4 36.8 19-50.6 25.5-102.1 31.8-153.6 2.7-21.6 5-43.2 6.6-64.8.9-12.7-.1-25.4 0-38.2 0-1.9 1.6-3.7 2.2-5.6.6-1.6.9-3.2 1-4.9 1-24.8-5.9-48.2-15.7-71.3-1.7-4-6.3-7.7-3.4-12.8.2-.4-1.6-2.1-2.7-2.5-13.9-5-28-9.8-41.9-14.7-1.2-.3-2.4-.6-3.6-1-7.5-3.6-15.3-3.6-23.3-1.4-11.6 3.2-23 2.6-34.6-.2-6.4-1.6-12.6-1.8-19.3.7-12 4.5-24.7 7.7-37 11.6-2.9.9-5.6 2.1-8.2 3.5-2.8 1.5-7.7 2.1-4.6 6.8.5.7-.9 2.3-1.4 3.4C100.3 233.5 91.9 259 93 286c.1 2.2 1.8 4.3 2.5 6.5.5 1.3.8 2.6.7 4-2.6 38.9 2.7 77.4 8 115.9 4.4 31.7 9.9 63.3 15.8 94.8 2.3 12.3 7.3 24.3 11.1 36.4.9 3 1.6 6 2.4 9.3-1.6-.4-3.2-.9-4.7-1.5-19.1-8-35.8-19.6-49-33.9-1.5-1.7-2.2-4.2-2.4-6.4-5.1-48.6-7.6-97.2-4.5-145.9 2.1-32.3 5.5-64.6 8.6-96.9.5-4.8 2.2-9.6 3.3-14.4l-1.3-.2c-2 9.8-4.4 19.6-5.8 29.5-7.2 54.1-9.7 108.6-7.5 163 1.1 26.2 3.9 52.3 5.9 78.4.2 1.2-.1 2.3-.7 3.3-.9-3.2-1.8-6.4-2.8-9.5-12.1-36.3-16.8-73.4-16.2-111.2.4-24.3-.5-48.7.1-73 .4-16.7 2.2-33.4 3.4-50zm144.1-149.7c5.3-1.7 9.5-3.9 14-4.4 17-2 33.6-.6 48.8 6.8 28.8 13.8 48.7 33.6 56.4 61.6 1.4 5 2.6 10.1 3.9 15.2-1.2-33.8-20.8-58.1-53.1-75.8-9.9-5.4-20.5-9.3-32.3-9.9-12.8-.8-26-2-37.7 6.5zm-7.9-2c-4-1.4-7.8-3.5-11.9-4-13.2-1.9-26.6-2.1-39.1 2.4-36.3 13-60.7 35.1-68.8 69-.8 3.4-1 6.9-1.5 10.4 1.3-1.6 2.1-3.4 2.3-5.3 5-23.7 18.4-43.2 40.5-58.1 23.4-15.9 48.8-22.7 78.5-14.4z\"/><path d=\"M200.2 105.7c-9.8-6.4-20.6-5.1-31.2-4.2-6.4.6-12.8 1.9-19.2 2.8-19.5 2.7-35.8 10.6-49.3 22.7-11 9.8-21.4 20.1-31.7 29.9.4-.9 1.2-2.3 1.9-3.7C84.2 129 104 109 127.2 91.5c2.9-2.2 7.4-3.3 11.3-3.7 17.2-1.8 34.3-1.9 50.9 3.1 3.9 1.2 7.3 3.7 11.3 5.8 5.6-7.4 16.5-8.2 26.5-9 12.3-.9 24.8-.1 37.3.4 3.1.2 5.9 1.3 8.2 3 23.6 17.9 43.8 38.3 57.3 62.9.6 1 .9 2.2.7 3.3-.9-.9-1.9-1.8-2.7-2.8-12.4-14.9-27.4-28.1-44.5-39.2-11.5-7.4-25.3-9.7-38.9-12-7.6-1.2-15.3-2.1-23.1-2.5-7.4-.4-14.8.3-21.3 4.9z\"/><path d=\"M200.5 79.4c7.4-3 14.9-5.9 22.3-8.9.5-.1 1.1-.1 1.6 0 15.3 2.5 30.4 5.6 42 16.2-23-2-45.4-3.2-66.4 7.3-20.3-10.6-42.9-9.2-66.2-8 5-2.9 9.6-6.6 15-8.5 8.3-2.9 17.1-5.8 25.9-6.3 6.3-.3 13 3.3 19.4 5.3 2.2.8 4.4 1.8 6.5 2.9z\"/><path d=\"m200.6 79.3-14.4-9.6h30.7c-6 3-14.2 2.7-16.3 9.6-.1.1 0 0 0 0zm2.5 55c11.7-8.5 24.9-7.3 37.8-6.6 11.8.7 22.4 4.5 32.3 9.9 32.3 17.7 51.9 42 53.1 75.8-1.3-5.1-2.6-10.1-3.9-15.2-7.7-28-27.7-47.8-56.4-61.6-15.3-7.4-31.9-8.7-48.8-6.8-4.6.6-8.8 2.8-14.1 4.5zm-7.9-2c-29.6-8.4-55-1.5-78.5 14.3-22.2 15-35.5 34.4-40.5 58.1-.3 1.9-1.1 3.7-2.3 5.3.5-3.5.7-7 1.5-10.4 8.1-33.9 32.6-56 68.8-69 12.4-4.5 25.9-4.2 39.1-2.4 4 .7 7.9 2.7 11.9 4.1z\"/></g>",
        "hair": "<path fill=\"$[hairColor]\" stroke=\"#000\" stroke-width=\"5\" d=\"M185 76.42c-2.48.71-5.63 1.74-7 2.3-1.38.56-3.85 2.13-5.5 3.48-1.65 1.36-5.7 4.34-9 6.64s-8.25 5.77-11 7.71c-3.51 2.48-6.04 3.51-8.5 3.47-1.93-.03-5.3.57-7.5 1.34-2.2.78-8.95 2.18-15 3.12-6.05.95-13.93 2.39-17.5 3.21-3.58.82-8.53 2.52-11 3.78-2.5 1.27-6.18 4.45-8.3 7.16-2.39 3.07-4.54 7.46-5.81 11.87-1.1 3.85-3.33 11.05-4.95 16s-3.85 13.72-4.95 19.5c-1.29 6.71-2.87 11.76-4.37 14-1.29 1.92-6.25 8-11.01 13.5-5.96 6.87-9.96 12.66-12.81 18.5-3.02 6.22-4.25 10.11-4.57 14.5-.3 4.21.35 9.44 2.2 17.5 2.18 9.54 2.45 12.27 1.62 16-.55 2.47-1.91 6.86-3.02 9.75-1.12 2.89-2.31 7.61-2.65 10.5-.33 2.89-.12 7.72.49 10.75.75 3.73 2.31 7.04 4.87 10.29 2.07 2.63 4.21 4.95 4.76 5.15s3.47-.46 6.5-1.47c3.02-1.01 6.42-2.88 7.55-4.15 1.12-1.28 3.08-5.02 4.34-8.32s2.93-8.93 3.71-12.5c.88-4.04 2.45-7.77 4.16-9.84 1.51-1.84 3.5-4.54 4.42-6 1.09-1.71 2.8-10.34 4.79-24.16 1.71-11.83 3.56-23.3 4.12-25.5.55-2.2 1.42-5.13 1.93-6.5.51-1.38 3.53-4.78 6.7-7.56 3.18-2.78 9.83-7.8 14.78-11.15 6.91-4.68 10.16-6.24 14-6.75 3.19-.42 7.71-.09 12.5.91 4.12.87 13.57 3.81 21 6.53 7.42 2.73 17.77 5.9 23 7.06 5.22 1.16 10.4 2.27 11.5 2.47s4.14 2.19 6.75 4.43c3.82 3.27 5.08 5.18 6.43 9.81.93 3.16 2.5 6.54 3.5 7.5s2.61 1.76 3.57 1.77c.96 0 5.8-1.97 10.75-4.4 4.95-2.42 12.61-6.59 17.02-9.26s12.29-8.09 17.5-12.04c6.1-4.63 10.1-8.46 11.23-10.75 1.32-2.7 2.54-3.71 5-4.15 1.79-.32 5.95-.09 9.25.5s8.92 2.52 12.5 4.29c4.02 1.98 9.02 5.7 13.11 9.75 5.37 5.31 6.92 7.57 8.22 12.04.88 3.02 2.28 9.1 3.12 13.5s2.45 14.97 3.59 23.5c1.31 9.87 2.71 16.59 3.84 18.5.98 1.65 2.08 6.04 2.45 9.75s2.03 10.46 3.7 15c1.66 4.54 4.11 9.82 5.43 11.75 1.32 1.92 3.98 4.4 5.92 5.5 3.08 1.75 3.99 1.85 7.32.8 3.05-.96 4.64-2.5 8.05-7.75 2.34-3.6 4.7-8.58 5.25-11.05.55-2.48 1.67-5.85 2.5-7.5.97-1.94 1.5-5.91 1.5-11.25-.01-7.47-.34-8.89-3.5-15-2.44-4.71-3.49-8.04-3.46-11 .03-2.34.7-6.05 1.49-8.25s1.45-6.93 1.47-10.5c.02-3.58.68-9.2 1.48-12.5s1.47-7.58 1.5-9.5c.04-2.67-.72-4.26-3.21-6.71-1.8-1.76-7.09-5.81-11.76-9-6.74-4.6-9.56-7.33-13.71-13.29-2.88-4.13-5.89-9.3-6.69-11.5-.81-2.2-1.7-5.13-1.98-6.5-.28-1.38-3.4-6.78-6.93-12-3.53-5.23-8.64-14-11.36-19.5s-6.17-11.8-7.67-14c-1.51-2.2-4.86-5.74-7.45-7.88-2.6-2.13-6.66-4.83-9.02-6-4.03-1.98-4.78-2.04-11.75-.87-6.87 1.15-7.82 1.09-12.2-.77-2.61-1.12-6.33-2.02-8.25-2.01-1.93.01-5.3-.47-7.5-1.06-2.2-.6-7.83-2.8-12.5-4.9-4.68-2.09-12.1-4.96-16.5-6.38s-11.26-3.27-15.25-4.11c-3.99-.83-8.49-1.49-10-1.45-1.51.03-4.78.64-7.25 1.35Z\"/>",
        "high": "<path fill=\"$[hairColor]\" stroke=\"#000\" stroke-width=\"4\" d=\"M60 310H50v-10C50 110 40 90 60 90h280c20 0 10 20 10 210v10h-10v-20c0-5-10-20-15-25s-5-55-15-65-60 0-110 0-100-10-110 0-10 60-15 65-15 20-15 25z\"/>",
        "juice": "<path fill=\"$[hairColor]\" stroke=\"#000\" stroke-width=\"4\" d=\"M60 310H50s-.19-5 0-10C60 40-10 145 200 80c34.77-10.76 43.79-21.21 65 0 5 5 5 45 5 45s3.04-26.26 10-25c110 20 60-20 70 200 .23 4.99 0 10 0 10h-10v-20c0-5-10-20-15-25s-5-65-15-75-60 10-110 10-100-20-110-10-10 70-15 75-15 20-15 25z\"/>",
        "longHair": "<path fill=\"$[hairColor]\" stroke=\"#000\" stroke-width=\"4\" d=\"M46.17 300C47.51 160.01 78.5 95.59 219.25 91.8c10 0 14.92.06 20.58 8.73 0 0 9.09-1.93 15.59-.93 82.33 40.7 101.33 87.2 101.33 227.2l-22-30S320 210 310 200l-110-12.14L90 200c-10.01 9.99-5.25 137.8-5.25 137.8l-30 31s-9-25.5-8.58-68.8Z\"/><path fill=\"$[hairColor]\" d=\"M240 200c60-20 60 120 140 160-40-60-40-100-40-100s-7.25-100.2-107.25-100.2M73 309s7 51-53 71c120 20 80-240 220-180l11.25-39.2L100 160l-28.75 60\"/><path fill=\"none\" stroke=\"#000\" stroke-width=\"4\" d=\"M240 200c60-20 60 120 140 160-40-60-40-100-40-100M73 309s7 51-53 71c120 20 80-240 220-180\"/>",
        "messy-short": "<path fill=\"$[hairColor]\" stroke=\"#000\" stroke-width=\"4\" d=\"M60 310H50v-75h-5l10-25-15 5 20-30H45l25-25-15-5 30-17.95L70 130l32.5-7.95L90 115l35-5-7.5-12.45L155 100l-15-15 40 7.55L175 75l30 15-5-20 25 20 35-10-15 15h30l-15 10 40 2.55-15 7.45 35 5-17.5 7.55L340 145l-17.5 5 27.5 20-15 10 25 35h-12.5l7.5 20h-5v75h-10v-20c0-5-10-20-15-25s-5-65.3-15-75.3l-6.33 11s-4.34-8.7-4.34-9c0-.29-11.66 12.67-11.66 12.67L285 189.7l-21 20.67.33-18-26.66 24.33 3.33-25-30.33 22 .33-20.33-27.33 28L187.5 195 166 213.7l1-15.66-23.33 19.33 4-23.33L123 208.37l2-16.67-23 21.67.33-21.67-12.66 8.34L90 190c-10 10-10 70-15 75s-15 20-15 25z\"/>",
        "messy": "<path fill=\"$[hairColor]\" stroke=\"#000\" stroke-width=\"4\" d=\"M150.74 72.13c-.03.43 3.16 2.66 7.19 5.01l7.25 4.23c-2.73 1.64-5.17 2.7-7.19 3.42s-5.44 1.68-7.62 2.13c-2.17.46-8.51 2.16-14.1 3.78-5.58 1.62-13.19 3.82-16.92 4.89-3.72 1.06-8.92 2.51-11.56 3.21-2.63.7-7.71 1.98-11.28 2.84-3.57.85-8.51 2.19-11 2.97-2.48.77-5.22 1.7-6.09 2.05-.93.38-1.52 1-1.41 1.5.1.47 1.67 1.32 3.56 1.92 1.86.6 4.47 1.49 5.8 1.98s2.4 1.21 2.39 1.6c-.01.38-1.65 2.29-3.66 4.23-2 1.94-5.6 5.05-8 6.91s-5.64 4.41-7.21 5.67c-1.57 1.27-4.28 3.68-6 5.36-1.73 1.69-4.32 4.59-5.75 6.45s-4.77 7.64-7.43 12.83c-2.66 5.2-4.83 9.83-4.83 10.29 0 .47-.26.91-.58.99-.31.08-.76 1.08-.98 2.23-.38 1.92-.29 2.14 1.14 2.68 1.25.48 1.55.94 1.55 2.42 0 1.01-.37 5.64-.82 10.3-.45 4.65-1.23 11-1.72 14.1l-1.73 10.71c-.45 2.8-1.07 8.38-1.37 12.41s-1 10.42-1.55 14.2c-.91 6.34-.92 6.95-.08 7.9.56.63 1.16 3 1.55 6.1.35 2.79.64 7.62.64 10.72.01 3.1.26 8.56.57 12.12.3 3.57.92 8.14 1.37 10.16.45 2.01.96 5.38 1.14 7.47.3 3.71.36 3.83 2.28 4.65 1.09.47 1.97 1.1 1.97 1.41s1.08 1.33 2.4 2.27c1.57 1.13 3.08 1.71 4.37 1.71 1.32 0 2.38-.43 3.19-1.28.67-.71 2.67-4.21 4.45-7.77 1.78-3.57 3.67-7.12 4.2-7.9s2.11-3.57 3.51-6.2c1.4-2.64 3.22-6.96 4.04-9.59.82-2.64 1.73-6.19 2.02-7.9.29-1.7.94-8.18 1.45-14.38.5-6.2 1.42-13.82 2.05-16.92.62-3.1 1.8-7.66 2.63-10.13 1.49-4.43 1.54-4.49 4.05-5.28 1.39-.44 6.21-.96 10.71-1.16l8.18-.35c1.44-7.84 2.03-9.5 2.82-10.13.82-.65 1.83-.81 3.67-.59 1.39.16 4.95.9 7.89 1.64 2.95.73 7.9 2.53 11 4 3.1 1.46 6.78 2.79 8.18 2.95 2.48.29 2.55.26 3.12-1.61.47-1.53.91-1.94 2.25-2.08.93-.1 3.2.38 5.06 1.05 1.86.68 6.69 2.91 10.72 4.96 4.03 2.04 9.87 5.39 12.97 7.44s6.53 4.49 7.62 5.42c1.08.93 3.62 2.87 5.64 4.31 2.01 1.44 4.11 2.63 4.65 2.64.65.01.99-.41.99-1.25.01-.7-1.26-4.38-2.82-8.18-1.55-3.8-2.66-7.03-2.45-7.19.21-.15.97-.28 1.69-.28.73 0 3.22.51 5.55 1.13s5.56 1.65 7.19 2.29 3.6 1.08 4.37.99c1.35-.17 1.42-.37 1.59-4.41.09-2.33.48-4.56.84-4.96.37-.4 1.82-.72 3.21-.71 1.4.01 5.2.5 8.46 1.08 3.26.59 7.83 1.83 10.15 2.76 2.33.93 7.15 3.02 10.72 4.64 3.57 1.63 7.88 3.47 9.59 4.1 1.7.62 3.35 1.35 3.66 1.63s1.46.5 2.54.51c1.93 0 1.97-.05 1.61-1.85-.2-1.01-1.62-4.12-3.15-6.92a794 794 0 0 0-5.14-9.16c-1.29-2.25-2.34-4.22-2.34-4.37 0-.16 1.2-.44 2.68-.64 1.47-.19 2.99-.64 3.37-.98.39-.35.83-2.61.99-5.01l.29-4.37c3.28-.57 7.15-.57 10.72-.37 3.56.2 7.21.56 8.1.79 1.23.32 2.58 1.81 5.5 6.07 2.14 3.1 4.33 6.59 4.87 7.76s1.3 2.12 1.69 2.12c.42-.01.7-.76.7-1.85-.01-1.01.33-2.97.74-4.37.42-1.39 1.88-4.74 3.26-7.43 2.12-4.18 2.64-4.82 3.48-4.38.54.29 3.14 2.69 5.78 5.33 2.64 2.63 5.9 6.5 7.25 8.6 1.35 2.09 3.63 6.4 5.07 9.58s3.12 7.63 3.72 9.87c.61 2.25 1.48 6 1.93 8.32.46 2.33 1.25 9.31 1.75 15.51.51 6.21 1.16 12.68 1.45 14.39.29 1.7 1.2 5.26 2.02 7.89.82 2.64 2.64 6.95 4.04 9.59s2.98 5.43 3.51 6.2c.53.78 2.42 4.33 4.2 7.9s3.78 7.06 4.45 7.77c.81.86 1.87 1.28 3.19 1.28 1.3.01 2.8-.58 4.37-1.7 1.32-.94 2.4-1.96 2.4-2.27s.89-.95 1.97-1.41c1.93-.83 1.99-.95 2.29-4.66.17-2.09.68-5.45 1.13-7.47s1.07-6.58 1.38-10.15c.3-3.57.55-9.03.56-12.13 0-3.1.29-7.92.64-10.71.39-3.11.99-5.48 1.55-6.11.84-.95.84-1.56-.08-7.89-.55-3.78-1.24-10.17-1.54-14.2-.31-4.04-.92-9.62-1.38-12.41-.45-2.79-1.23-7.62-1.72-10.72-.5-3.1-1.27-9.45-1.72-14.1s-.82-9.28-.82-10.29c0-1.48.29-1.95 1.55-2.43 1.42-.54 1.51-.75 1.14-2.67-.23-1.15-.67-2.16-.99-2.23-.32-.08-.58-.53-.58-.99 0-.47-2.25-5.23-5-10.58s-6.75-12.23-8.88-15.3c-2.14-3.06-5.84-8.39-8.23-11.84s-5.47-8.18-6.83-10.5c-1.37-2.33-2.81-5.12-3.21-6.21-.63-1.72-.56-2.45.49-5.78.66-2.09 1.22-4.5 1.23-5.36.02-.85-.3-1.83-.7-2.18-.4-.34-2.76-1.4-5.25-2.35-2.48-.95-6.41-2.6-8.74-3.67-2.32-1.06-5.05-2.6-6.06-3.42l-1.83-1.49c1.84-5.78 2.25-8.62 2.25-11.42 0-3.8-.13-4.37-.98-4.35-.55.01-2.01.84-3.25 1.86s-4.28 3.27-6.77 5.01c-2.48 1.75-6.92 4.32-9.87 5.73-2.94 1.41-6.88 3.1-8.74 3.76-1.86.67-4.65 1.55-6.2 1.98-2.58.7-2.97.67-4.51-.3-.93-.59-2.71-2.12-3.95-3.41-1.24-1.28-2.96-2.7-3.81-3.14s-2.25-.79-3.1-.79c-1.04.01-2.3.74-3.81 2.21l-2.25 2.19c-9.18-3.78-14.96-5.79-18.76-6.9-4.79-1.4-8.03-2.02-10.57-2.02-2.55 0-3.67.22-3.68.71 0 .38 1.03 1.72 2.3 2.96s2.51 2.63 2.76 3.1c.35.66-.36.56-3.29-.47-2.05-.72-8.68-2.55-14.73-4.06s-15.06-3.39-20.02-4.17c-4.97-.79-10.55-1.72-12.41-2.08s-5.16-.87-7.33-1.14-5.25-.65-6.84-.84c-2.22-.27-2.9-.18-2.95.42Z\"/>",
        "middle-part": "<path fill=\"$[hairColor]\" stroke=\"#000\" stroke-width=\"4\" d=\"m60.7 303.6-10.18 2.73s-10.34-6.75-10.47-26.25A411 411 0 0 1 38.08 249c-.2-9.59-.03-18.34.42-26.31.51-7.92 1.31-15.08 2.36-21.56 1.11-6.48 2.45-12.31 3.96-17.56 3.18-10.58 6.91-18.91 10.54-25.28 3.71-6.48 7.2-10.94 9.89-13.58 5.38-5.37 13.13-11.13 22.17-18.43 8.94-7.4 19.07-16.18 29.29-27.17 10.68-10.98 22.51-16.62 32.85-19.55 10.38-2.64 19.25-2.91 23.85-3.12 9.2-.27 25.61 16.69 25.61 16.69s20.62-16.33 29.93-15.73c4.67.37 13.77.98 23.87 3.86 10.17 3.13 21.54 8.82 31.02 19.4 9.59 10.67 19.73 19.38 28.92 26.77 9.43 7.35 17.63 13.2 23.25 18.58 2.81 2.65 6.42 7.2 10.14 13.75 3.66 6.44 7.34 14.82 10.33 25.34 1.41 5.23 2.64 11.02 3.61 17.43.92 6.41 1.59 13.49 1.95 21.29.34 7.85.39 16.46.12 25.88-.3 9.46-.94 19.64-2.06 30.47-.22 19.42-10.69 26.22-10.69 26.22l-10.23-2.65s1.72-11.23 2.17-15.18c.38-4.04-8.03-16.21-12.48-20.05-2.27-1.9-5.66-13.36-10.28-26.07-5.23-13.61-11.69-28.76-17.29-33.79-5.66-5.23-19.79-7.41-32.54-8.4-12.76-1.12-24.1-.86-24.1-.86s-7.29-9.1-8.8-10.64c-.76-.77-.1.39 3.66 5.55 3.78 5.08 10.69 13.88 22.36 27.8-10.33.43-26.38-4.73-39.78-10.31-13.24-5.86-23.75-11.93-23.75-11.93s-9.95 6.06-22.6 11.86c-12.77 5.47-28.2 10.48-38.45 9.98 10.34-13.69 16.44-22.35 19.77-27.36 3.32-5.09 3.9-6.25 3.21-5.48-1.39 1.52-7.89 10.52-7.89 10.52s-11.14-.28-23.52.79c-12.34.91-25.92 2.97-31.15 8.08-5.19 4.93-10.81 19.84-15.45 33.28-4.28 12.63-7.6 24.1-9.92 26.03-4.6 3.93-13.44 16.38-13.16 20.48.32 4.03 1.51 15.56 1.51 15.56Z\"/>",
        "parted": "<path fill=\"$[hairColor]\" stroke=\"#000\" stroke-width=\"4\" d=\"m61.7 299.46-10.79-1.23s-10.55-7.47-9.99-21.33c.2-6.62.55-13.25 1.03-19.82.48-6.75 1.1-13.35 1.87-19.76.77-6.5 1.71-12.75 2.79-18.74q1.68-9.06 3.81-17.28c2.95-11.1 6.5-21.14 10.55-30.24 4.14-9.39 8.72-17.95 13.64-25.73 4.93-8.16 10.17-15.52 15.66-22.06 5.47-6.82 11.21-12.68 17.19-17.5 5.99-4.91 12.29-8.62 18.85-11.06 6.62-2.37 13.57-3.37 20.77-2.99l3.58 10.85s-.75-13.55 5.88-19a177 177 0 0 1 29.09-2.68c9.7.09 19.24.91 28.5 2.37 9.29 1.54 18.27 3.62 26.81 6.14 8.53 2.51 16.59 5.39 24.08 8.55 7.45 3.07 14.32 6.39 20.5 9.9 6.15 3.4 11.62 7 16.32 10.78 9.32 7.24 15.62 15.38 18.16 24.57 9.94 8.58 17.34 13.01 22.88 16.87 5.51 3.74 9.18 7.07 11.66 13.24 2.47 6.14 3.76 15.25 4.44 30.69.33 7.78.49 17.19.55 28.61.02 5.72.01 11.94-.02 18.7-.04 6.74-.1 14-.17 21.81-.22 17.63-10.22 27.27-10.22 27.27l-9.83.91.08-16.17c.03-4.17-9.91-15.03-14.94-18.34-2.52-1.66-3.75-13.28-5.58-25.67-1.82-12.71-4.24-26.18-9.3-29.97-2.53-1.93-8.29-2.15-16.16-1.32-7.91.76-17.95 2.52-29.02 4.63-11.09 1.98-23.17 4.25-35.09 6.18-11.91 1.75-23.62 3.16-33.98 3.69-15.47.5-24.85-4.38-30.68-10.75-5.77-6.56-8.03-14.6-9.36-20.07-.19 5.46-12.88 10.55-26.66 15.16-13.56 4.08-28.05 7.46-32.89 11.64-4.8 4.01-9.64 16.87-13.62 28.51-3.71 10.96-6.61 20.92-8.83 22.4-4.44 2.92-13.2 12.13-12.93 15.54.29 3.31 1.37 12.7 1.37 12.7Z\"/>",
        "shaggy1": "<path fill=\"$[hairColor]\" stroke=\"#000\" stroke-width=\"4\" d=\"M37.17 332.53c6.66-10.67 10.33-36.33 10.33-36.33s-11.67 7.13-22.67 9.66c10-13.33 22.92-52.06 22.92-52.06s-10.25 8.06-20.92 7.73c30.34-49.67 10.75-84.26 65.34-123 0 0-13.09-2.26-25.67-10.33 37.88-2.4 64.75-46.9 129.25-38.4 0 0-5.5-10.5-27-21.5 69.5-1 86.5 36.5 86.5 36.5s16.5-7.5 25 14c64.5 9.5 58.5 97 83 140-8.88-1.4-16.5-7.5-16.5-7.5s3.87 27.1 19.37 50.6c-9.5-2.75-21.29-10.04-21.29-10.04s8.29 22.29 11.55 28.79C344.12 315.9 333.75 300 333.75 300s-5.58 24.86-22 41.8c9.75-25.94 8.5-58 8.5-58l-15-31L310 200c-40-40-70.25-1.7-132.25-2.7-81.53-1.32-100 86.5-100 86.5s.08 21.73 7.75 56.73c-17-11.67-24.33-48.33-24.33-43.33s-12.67 31-24 35.33Z\"/><path d=\"M114 190s32.25-4.8 76-55m-43 43s56.75 2.7 103-36m-110-3s38.75-54.3 93-34\" style=\"fill:none;stroke:#000;stroke-width:5\"/>",
        "shaggy2": "<path fill=\"$[hairColor]\" stroke=\"#000\" stroke-width=\"4\" d=\"M37.17 332.53c6.66-10.67 10.33-36.33 10.33-36.33s-11.67 7.13-22.67 9.66c10-13.33 22.92-52.06 22.92-52.06s-10.25 8.06-20.92 7.73c30.34-49.67 10.75-84.26 65.34-123 0 0-13.09-2.26-25.67-10.33 37.88-2.4 64.75-46.9 129.25-38.4 0 0-5.5-10.5-27-21.5 69.5-1 86.5 36.5 86.5 36.5s16.5-7.5 25 14c64.5 9.5 58.5 97 83 140-8.88-1.4-16.5-7.5-16.5-7.5s3.87 27.1 19.37 50.6c-9.5-2.75-21.29-10.04-21.29-10.04s8.29 22.29 11.55 28.79C344.12 315.9 333.75 300 333.75 300s-5.58 24.86-22 41.8c9.75-25.94 8.5-58 8.5-58l-15-31L310 200c-40-40-70.25-1.7-132.25-2.7-81.53-1.32-100 86.5-100 86.5s.08 21.73 7.75 56.73c-17-11.67-24.33-48.33-24.33-43.33s-12.67 31-24 35.33Z\"/><path fill=\"$[hairColor]\" d=\"M328 206s-8.75 49.7-46 71c20.25-32.2 8-77 8-77s-7.75 27.3-24 38c3.25-22.7-15.25-41.7-15.25-41.7S219.25 238.8 173 258c23.25-28.2 27-56 27-56s-31.25 37.3-55.75 47.8c19-28 23.5-54.5 23.5-54.5s-45 43.5-62.75 86.7c-5.25-26.2 6-70 6-70l14-54 137 2z\"/><path fill=\"none\" stroke=\"#000\" stroke-width=\"4\" d=\"M328 206s-8.75 49.7-46 71c20.25-32.2 8-77 8-77s-7.75 27.3-24 38c3.25-22.7-15.25-41.7-15.25-41.7S219.25 238.8 173 258c23.25-28.2 27-56 27-56s-31.25 37.3-55.75 47.8c19-28 23.5-54.5 23.5-54.5s-45 43.5-62.75 86.7c-5.25-26.2 6-70 6-70m3-22s32.25-4.8 76-55m-43 43s56.75 2.7 103-36m-110-3s38.75-54.3 93-34\"/>",
        "short-bald": "<path fill=\"$[hairColor]\" stroke=\"#000\" stroke-width=\"4\" d=\"M60 310H50v-10c0-140 50-200 150-200s150 60 150 200v10h-10v-20c0-5-10-20-15-25s-15-55-15-65c0-56.57-60-95-110-95S90 143.43 90 200c0 10-10 60-15 65s-15 20-15 25z\"/>",
        "short-fade": "<defs><linearGradient id=\"a\" x1=\"200\" x2=\"200\" y1=\"100\" y2=\"310\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"rgba(0,0,0,.25)\"/><stop offset=\"1\" stop-color=\"rgba(0,0,0,0)\"/></linearGradient></defs><path d=\"M60 310H50v-10c0-140 50-200 150-200s150 60 150 200v10h-10v-20c0-5-10-20-15-25s-5-55-15-65c-40-40-60 0-110 0s-70-40-110 0c-10 10-10 60-15 65s-15 20-15 25z\" style=\"fill:url(#a);stroke:none\"/>",
        "short": "<path fill=\"$[hairColor]\" stroke=\"#000\" stroke-width=\"4\" d=\"M60 310H50v-10c0-140 50-200 150-200s150 60 150 200v10h-10v-20c0-5-10-20-15-25s-5-50-15-60-60-5-110-5-100-5-110 5-10 55-15 60-15 20-15 25z\"/>",
        "short2": "<path fill=\"$[hairColor]\" stroke=\"#000\" stroke-width=\"4\" d=\"M60 310H50v-10c0-140 50-200 150-200s150 60 150 200v10h-10v-20c0-5-10-20-15-25s-5-55-15-65c-40-40-60 0-110 0s-70-40-110 0c-10 10-10 60-15 65s-15 20-15 25z\"/>",
        "short3": "<path fill=\"$[hairColor]\" stroke=\"#000\" stroke-width=\"4\" d=\"M178.27 84.63c-1.7.39-3.73.99-4.51 1.33-.78.35-3.17 1-5.31 1.44s-4.7 1.45-5.67 2.23c-.98.79-3.05 1.7-4.62 2.03-1.55.33-5.18 1.33-8.06 2.23-2.87.91-6.09 2.38-7.12 3.25-1.05.89-3.02 2.03-4.39 2.55-1.38.51-3.14.78-3.92.59-.77-.19-2.85.21-4.62.88-1.77.68-4.02 1.43-5 1.68-.98.24-2.91 1.09-4.3 1.87-1.39.79-2.84 1.44-3.23 1.45s-1.77.69-3.05 1.5c-1.3.83-2.51 1.51-2.71 1.51s-1.9.86-3.78 1.9c-1.89 1.05-4.22 2.62-5.17 3.48-.96.87-2.05 2.33-2.43 3.24-.66 1.58-.91 1.66-4.45 1.52-3.15-.13-4.16.11-6.4 1.52-1.79 1.13-2.81 2.3-3.14 3.63-.27 1.08-1.22 3.74-2.11 5.91-1.39 3.4-2.42 4.63-7.51 9.03-3.22 2.8-7.19 6.22-8.82 7.58-2.13 1.79-3.18 3.26-3.73 5.21-.43 1.5-1.2 4.5-1.72 6.67s-.99 4.35-1.07 4.85c-.07.5-1.41 2.01-2.97 3.34-2.3 2.01-2.83 2.88-2.97 4.87-.1 1.33-.15 2.83-.1 3.33.04.5-.78 1.73-1.82 2.74-1.04 1-2.11 2.37-2.38 3.04-.28.67-.83 3.54-1.22 6.37-.38 2.84-.69 6.39-.68 7.89.01 2.3-.47 3.45-2.99 7.3-1.6 2.51-3.1 5.53-3.32 6.7-.24 1.17-.11 3.62.26 5.45.63 3.04.57 3.56-.54 5.93-.65 1.42-1.18 3.61-1.18 4.86.02 1.25.35 3.09.75 4.08.62 1.62.56 2.13-.61 4.57-.72 1.5-1.29 3.48-1.28 4.4 0 .92.27 2.43.59 3.33.33.92.95 2.07 1.4 2.58.53.58.9 2.67 1.07 6.06.15 2.92-.01 6.34-.37 7.89-.43 1.89-.45 3.1-.06 3.94.31.67.37 1.63.12 2.13s-.59 2.76-.77 5.01c-.2 2.55-.07 4.62.32 5.46.38.78.65 4.2.64 8.05.01 5.12.27 7.38 1.12 9.71.64 1.67 1.34 4.41 1.58 6.08s.89 3.53 1.45 4.13c.57.59 1.66 1.08 2.41 1.07.77 0 2.61-.83 4.11-1.83 1.49-1 3.01-1.82 3.37-1.82s1.31-.69 2.13-1.52c.8-.84 1.43-2.01 1.39-2.59-.04-.59 1.01-2.31 2.34-3.81 1.34-1.51 2.55-3.23 2.7-3.82.14-.59.62-1.06 1.06-1.05.43.01 1.95-1.37 3.38-3.06s2.72-3.83 2.85-4.75c.14-.92.62-1.81 1.07-1.96.45-.14 1.31-.77 1.92-1.37.66-.66 1.21-2.51 1.38-4.62.16-1.92.83-4.61 1.47-5.94.64-1.35 1.03-2.79.87-3.21s.61-1.93 1.73-3.35c1.62-2.08 1.95-2.97 1.59-4.43-.24-1-.42-2.24-.41-2.74.02-.5.18-1.87.38-3.04.19-1.17.56-3.36.81-4.87.26-1.55 1.17-3.46 2.1-4.42.93-.95 1.65-2.46 1.67-3.5.03-1-.4-2.85-.93-4.09-.53-1.25-.95-2.62-.92-3.04.02-.42.82-1.58 1.78-2.58 1.3-1.34 1.78-2.52 1.84-4.41.04-1.6.5-2.93 1.19-3.5.62-.5 1.15-1.66 1.18-2.58.02-.92-.23-2.14-.57-2.72-.42-.73-.19-2 .74-4.09.75-1.67 2.41-4.2 3.73-5.62 2.07-2.24 2.63-2.54 4.29-2.2 1.05.2 2.07.46 2.26.56s1.31-.1 2.5-.43a66 66 0 0 1 3.61-.89c.8-.15 2.59-.58 4.01-.95 1.41-.39 3.39-1.03 4.41-1.45 1.6-.66 2.22-.59 4.35.45 1.54.75 3.2 1.1 4.34.89 1.03-.19 4.01.05 6.63.51 4.22.76 5.2 1.23 8.04 3.82 2.33 2.1 4.18 3.14 6.46 3.61 2.31.47 3.8.46 5.34-.01 1.16-.37 3.09-1.32 4.28-2.13 1.58-1.06 2.5-1.31 3.47-.92.73.3 2.7.73 4.39.95 1.7.22 3.42.57 3.84.79s2.33.59 4.24.82c1.91.24 4.7.69 6.19 1.01 1.93.4 3.62.35 5.85-.22 1.71-.44 4.35-.97 5.85-1.16 2.13-.28 3.08-.08 4.29.89.86.69 2.96 1.41 4.69 1.62 2.13.25 3.93.05 5.67-.61 1.39-.54 3.15-1.8 3.89-2.8.86-1.16 1.98-1.81 3.1-1.81.96 0 1.88.2 2.05.45s1.48.62 2.92.82c1.66.23 4.12-.03 6.68-.75 2.22-.6 4.48-1.1 5.01-1.1.53.01 2.16-.92 3.61-2.07 2.28-1.82 2.89-2.01 4.57-1.48 1.06.33 2.79.54 3.83.46 1.06-.07 3.73.6 5.97 1.49 2.23.9 4.91 1.64 5.95 1.64 1.03 0 2.65-.31 3.56-.69.92-.38 2.73-1.46 4.03-2.41 1.32-.96 2.77-1.54 3.31-1.31.51.22 3.63.48 6.89.59 4.69.15 6.34-.03 8.03-.9 1.81-.93 2.42-.99 4-.35 1.01.41 3 1.06 4.41 1.44 1.4.38 3.2.81 4 .97.79.15 2.42.55 3.61.89 1.19.33 2.31.52 2.51.42.18-.1 1.2-.35 2.26-.56 1.65-.33 2.21-.04 4.29 2.2 1.3 1.42 2.97 3.95 3.72 5.62.92 2.1 1.15 3.36.72 4.09-.33.58-.59 1.81-.57 2.72.02.92.54 2.08 1.17 2.58.7.57 1.15 1.9 1.19 3.5.04 1.89.53 3.07 1.82 4.4.97 1 1.77 2.17 1.79 2.58.02.42-.4 1.79-.94 3.04-.53 1.24-.96 3.09-.94 4.09.02 1.04.73 2.54 1.67 3.49.92.96 1.81 2.87 2.08 4.42.25 1.5.61 3.69.8 4.85.19 1.17.35 2.54.37 3.04.01.5-.19 1.73-.43 2.73-.36 1.46-.05 2.35 1.58 4.42 1.12 1.43 1.88 2.93 1.71 3.35-.15.42.23 1.85.87 3.2.64 1.33 1.29 4 1.44 5.93.16 2.1.71 3.94 1.38 4.6.61.6 1.47 1.22 1.91 1.37.46.15.94 1.03 1.07 1.95.13.91 1.42 3.05 2.85 4.74 1.42 1.68 2.96 3.06 3.39 3.05.44-.01.92.46 1.06 1.04.15.59 1.37 2.31 2.71 3.81 1.34 1.51 2.4 3.22 2.35 3.81-.04.58.6 1.74 1.42 2.59.84.83 1.8 1.52 2.15 1.52.34 0 1.86.82 3.37 1.82s3.38 1.83 4.15 1.84c.76.02 1.86-.46 2.44-1.05.56-.6 1.23-2.45 1.47-4.12s.96-4.41 1.59-6.08c.87-2.32 1.14-4.58 1.14-9.7 0-3.84.27-7.26.64-8.04.4-.84.53-2.91.34-5.46-.18-2.25-.52-4.51-.77-5.01s-.2-1.46.12-2.13c.39-.83.37-2.04-.07-3.93-.36-1.55-.51-4.97-.36-7.9.17-3.38.54-5.47 1.08-6.06.44-.5 1.07-1.66 1.39-2.58.33-.9.59-2.54.59-3.63-.01-1.09-.59-3.07-1.32-4.4-1.22-2.24-1.27-2.59-.56-4.41.43-1.08.77-2.92.77-4.09s-.55-3.28-1.21-4.7c-1.12-2.36-1.16-2.88-.54-5.93.38-1.83.5-4.28.27-5.45-.22-1.17-1.72-4.18-3.32-6.69-2.52-3.84-3-4.99-2.99-7.29.01-1.51-.3-5.05-.68-7.89-.39-2.84-.94-5.7-1.21-6.37-.28-.67-1.35-2.03-2.39-3.04s-1.86-2.24-1.82-2.74.01-1.99-.08-3.33c-.13-2.07-.64-2.85-3.49-5.31-1.85-1.59-3.4-3.3-3.42-3.8s-.48-1.53-1.03-2.28c-.56-.75-1.29-2.73-1.65-4.39-.42-2.01-1.29-3.65-2.58-4.86-1.1-1.03-2.18-2.87-2.49-4.24-.31-1.34-1.26-3.04-2.1-3.8-.85-.76-2.44-1.71-3.55-2.12-1.09-.42-2.22-1.41-2.52-2.22-.29-.8-1.42-2.1-2.51-2.88s-2.85-1.41-3.9-1.4c-1.05.02-2.29-.32-2.74-.76-.45-.43-1.09-1.59-1.42-2.59-.34-1.01-2.05-3.05-3.8-4.55-1.76-1.5-4.63-4.03-6.37-5.64-1.74-1.6-3.8-3.06-4.59-3.25-.78-.19-2.75-1.53-4.37-2.98-1.97-1.76-4.46-3.16-7.6-4.25-2.56-.87-5.94-1.82-7.51-2.09-1.56-.27-4.13-.78-5.71-1.13-1.56-.36-3.67-1.33-4.67-2.15-.99-.84-2.2-1.52-2.7-1.53-.48-.01-1.95-1.14-3.24-2.51-1.3-1.39-3.24-2.89-4.32-3.33-1.09-.46-4.09-.82-6.74-.81-4.72.01-4.83-.03-8.18-2.74-2.72-2.2-3.84-2.72-5.69-2.63s-2.85-.38-5.14-2.4c-2.36-2.08-3.31-2.51-5.67-2.55-1.95-.03-3.44.38-4.82 1.33-1.98 1.38-2 1.38-2.9.17-.49-.66-2.62-1.84-4.73-2.62l-3.82-1.42-6.72 2.53c-6.04-2.25-7.52-2.42-10.61-2.11-2.14.22-5.05.15-6.46-.16-1.71-.37-3.59-.33-5.66.15Z\"/>",
        "shortBangs": "<path fill=\"$[hairColor]\" stroke=\"#000\" stroke-width=\"4\" d=\"M53.25 329.3S50 313.5 50 300c0-140 50-200 150-200s150 60 150 200c0 12-5.25 40.3-5.25 40.3-5-18.5-11.5-52-11.5-52S330 270 325 265s-5-55-15-65c-40-40-60 0-110 0s-70-40-110 0c-10 10-10 60-15 65s-10.25 19.3-10.25 19.3-7 30.5-11.5 45Z\"/><path fill=\"$[hairColor]\" d=\"M76 199s-8.25 40.3 12 66c5.75-23.7 16-47 16-47s-2.25 22.3 3 37c13.25-14.7 31-67 31-67s-4 42.59-.25 58.3C143.5 230.59 148 219 148 219s2.25 22.8 6.25 38.3C166.75 240.8 179 180 179 180s-8.25 57.3-1.25 70.8c9-12.5 10.25-38.8 10.25-38.8s12 23.3 15.75 44.8c12-13 16.25-62.8 16.25-62.8s10.3 42.72 21 50c5.3-5.88 0-59 0-59s22.17 58.53 36 67c3.5-12.14-1-35-1-35s12.17 28.86 23.5 38.2c1.67-9.67-7.67-47.34-7.67-47.34s24.67 44.34 28.15 61.25c8.85-20.91 3.19-74.25 3.19-74.25L271 157l-136-3z\"/><path fill=\"none\" stroke=\"#000\" stroke-width=\"4\" d=\"M76 199s-8.25 40.3 12 66c5.75-23.7 16-47 16-47s-2.25 22.3 3 37c13.25-14.7 31-67 31-67s-4 42.59-.25 58.3C143.5 230.59 148 219 148 219s2.25 22.8 6.25 38.3C166.75 240.8 179 180 179 180s-8.25 57.3-1.25 70.8c9-12.5 13.5-40.5 13.5-40.5s8.75 25 12.5 46.5c12-13 16.25-62.8 16.25-62.8s10.3 42.72 21 50c5.3-5.88 0-59 0-59s22.17 58.53 36 67c3.5-12.14-1-35-1-35s12.17 28.86 23.5 38.2c1.67-9.67-7.67-47.34-7.67-47.34s24.67 44.34 28.15 61.25c8.85-20.91 3.19-74.25 3.19-74.25\"/>",
        "spike": "<path fill=\"$[hairColor]\" stroke=\"#000\" stroke-width=\"4\" d=\"M60 310H50v-10c0-65-5-145-5-150 0-10 5-20 5-20l10 10 6-20 14 10 5-20 15 10 5-20 15 10 8-22 12 12 8-20 12 16 10-21 10 21 10-21 10 21 10-21 10 21 10-21 10 21 12-16 8 20 12-12 8 24.37L290 100l10 20 12-9.96 8 19.96 14-10 6 20 10-10s5 10 5 20c0 5-5 85-5 150v10h-10v-20c0-5-10-20-15-25s-5-55-15-65-60 0-110 0-100-10-110 0-10 60-15 65-15 20-15 25z\"/>",
        "spike2": "<path fill=\"$[hairColor]\" stroke=\"#000\" stroke-width=\"4\" d=\"M60 310H50v-35l-2-11 2-9-2-11 2-9-2-11 2-9-2-15 7-10-3-15.63L65 165l-1-17 16-3v-21h20l4-20 20 4 12-20 20 12 12-20 16 16 16-20 16 20 16-16 12 20 20-12 12 20 20-4 4 20h20v21l16 3-1 17 13 9.04-3 15.96 7 10-2 15 2 9-2 11 2 9-2 11 2 9-2 11v35h-10v-20c0-5-10-20-15-25s-5-50-15-60-60-5-110-5-100-5-110 5-10 55-15 60-15 20-15 25z\"/>",
        "spike3": "<path fill=\"$[hairColor]\" stroke=\"#000\" stroke-width=\"5\" d=\"m59.99 309.97-9.99.02s-1.98-4.71-4.04-9.48l-10.6-24.48-8.66-11.07 1.65-9.05-7.84-11.2 3.59-9.06-6.17-11.15 5.2-8.9-3.58-14.75 17.6-9.39-3.32-14.5 25.03-8.7.75-14.9 21.98-3.91 1.47-18.31 21.51-3.02 4.96-19.14 18.68.03 12.26-22.85 17.27 9.82 11.33-24.4 13.86 17.48 13.2-24.51 15.63 24.47 12.3-17.59 13.77 24.45 16.76-9.92 14.31 22.84 19.14-.12 5.99 18.93 21.94 2.75 1.86 17.9 21.99 3.44.81 14.49 24.54 7.65-3.1 14.55 17.26 8.86-3.27 14.66 5.29 8.76-5.85 11.28 3.78 9.07-7.58 11.5 1.84 9.27-8.62 11.57-10.78 26.06c-2.15 5.19-4.22 10.36-4.22 10.36l-10.03-.1s-.79-15.25.11-20.4c.94-5.15-10.68-20.44-18.68-25.35-7.86-4.87-5.4-54.81-19.55-64.07-40.62-38.86-63.64 1.89-101.31 2.51-37.75.06-61.8-40.78-101.89-.55-14.3 9.72-11.99 59.64-19.91 64.54-8.01 4.91-19.57 19.04-18.66 23.92.87 4.84-.01 19.69-.01 19.69Z\"/>",
        "spike4": "<path fill=\"$[hairColor]\" stroke=\"#000\" stroke-width=\"5\" d=\"M60.24 310h-9.98s-.07-4.66-.15-9.25c-.13-7.33-.35-14.71-.63-22-.27-7.13-.61-14.16-.97-20.97-.36-6.66-.75-13.11-1.15-19.21-.4-5.99-.82-11.65-1.23-16.87-.82-10.14-1.64-18.6-2.28-24.6-.66-5.8-1.11-9.4-1.14-10.19-.28-6.19 4.6-16.43 4.6-16.43l10.34-1.07 6.77-19.05 14.5-3.03 6.87-18.83 15.24-2.24 7.59-17.19 14.65-.88 11.11-15.77L145 94.35l10.35-10.28 9.9 3.53 11.34-8.05 7.93 5.52 10.19-6.93 8.77 6.13 9.09-6.13 9.76 6.92 8.13-5.51 10.79 8.02 9.87-3.53 9.66 10.2 10.42-1.95 10.35 17.32 8.88-3.62 11.75 19.55 11.52-.07 9.1 20.54 13.83 2.61 6.05 18.75 9.89.68s4.51 10.05 4.18 16.3c-.04.8-.5 4.45-1.17 10.35-.64 6.13-1.45 14.79-2.26 25.2-.4 5.36-.79 11.19-1.17 17.36-.37 6.28-.73 12.92-1.05 19.77-.32 6.98-.61 14.18-.84 21.45-.23 7.4-.39 14.87-.48 22.25l-.1 9.27h-9.98s.25-12.6.34-16.86c.11-4.27-9.33-15.45-14.07-18.99-2.37-1.82-3.08-14.23-4.38-27.82-1.35-14.27-3.37-29.86-8.11-35.85-9.64-12.96-18.21-20.72-26.42-24.83-8.27-4.12-16.12-3.99-24.39-1.96-8.35 2.37-17.13 6.82-27.2 10.64-10.13 4.15-21.53 7.6-35 7.52-13.21.16-24.36-3.22-34.3-7.31-9.9-3.76-18.58-8.15-26.95-10.45-8.34-1.94-16.37-1.96-24.99 2.28-8.55 4.24-17.56 12.12-27.68 25.16-4.92 6.01-7.23 21.43-8.74 35.49-1.35 13.37-2.03 25.59-4.36 27.4-4.68 3.5-13.9 14.55-13.75 18.78.14 4.23.54 16.8.54 16.8Z\"/>",
        "tall-fade": "<defs><linearGradient id=\"a\" x1=\"200\" x2=\"200\" y1=\"100\" y2=\"310\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"rgba(0,0,0,.25)\"/><stop offset=\"1\" stop-color=\"rgba(0,0,0,0)\"/></linearGradient></defs><g style=\"display:inline\"><path d=\"M60 310H50v-10c0-140 50-200 150-200s150 60 150 200v10h-10v-20c0-5-10-20-15-25s-5-55-15-65c-40-40-56.429-38.095-106.429-38.095S130 160 90 200c-10 10-10 60-15 65s-15 20-15 25z\" style=\"display:inline;opacity:1;fill:url(#a);stroke:none;stroke-width:1;stroke-miterlimit:4;stroke-dasharray:none\"/></g><path fill=\"$[hairColor]\" stroke=\"#000\" stroke-width=\"3.787\" d=\"M176.958 80.33c-1.666.356-3.656.694-4.42 1.005-.765.32-2.055.284-4.153.686s-4.817-.357-5.767.356c-.961.723-4.673-1.601-5.58 1.436-1.52.302-5.92-1.098-8.743-.275-2.813.832-5.969 2.177-6.978 2.973-1.03.814-2.96 1.857-4.303 2.332-1.353.467-3.078.714-3.842.54-.755-.174-3.004-1.702-4.739-1.09-1.735.623-3.73 3.203-4.69 3.432-.96.219-3.273-1.108-4.636-.394-1.362.722-2.397 3.27-2.745 3.43-2.989 1.372-1.8.579-2.989 1.372a31 31 0 0 1-2.656 1.381c-.05-.263-4.43-2.651-4.968.476-2.855.459-4.32 1.567-4.015 2.972-.94.796-2.85-1.446-2.802 2.543-2.752 1.235-1.103 2.36-4.573 2.232-3.087-.119-4.077-.32-5.01 3.495-1.754 1.034-4.017 2.314-4.34 3.53-.265.989-.564 3.211-1.437 5.196-5.571 1.426-2.372 6.34-7.36 10.364-3.157 2.561-1.891 5.497-3.489 6.741-2.087 1.637-3.748 11.4-4.287 13.184-.421 1.372-.966 8.114-1.896 12.835-2.045 9.632-1.918 6.557-2.956 12.805-.414 6.977-1.54 6.943-2.291 14.791-1.65 9.93-4.07 25.692-4.154 27.305 13.07-1.575 15.468-.457 24.767-.598 2.688-7.24 12.988-17.017 31.388-17.386 26.676-.176 68.995.364 90.96.39 24.425-.18 49.48.895 73.733 1.779 17.401.59 34.288 6.477 39.775 16.265 11.669-1.34 14.105.89 24.676.232-.985-8.536-3.087-26.773-4.306-32.295-1.13-4.084-.635-7.333-2.476-10.758-1.328-6.785-1.608-7.98-2.868-15.269-2.678-8.718-1.723-10.969-2.993-12.874-.233-2.265-.107-4.023-.46-5.542-.412-1.838.209-3.338-1.056-4.445-1.078-.942-1.311-1.855-1.615-3.108-.304-1.226-.204-2.203-1.027-2.899-.833-.695-.944-4.649-2.032-5.024-1.068-.384-1.228-1.815-1.522-2.556.241-1.258-1.467-2.26-2.04-2.95-.783-.944-2.675-1.546-4.297-1.889-.296-1.7-1.162-2.397-2.55-3.613-.334-.924-3.588-2.054-5.303-3.426-1.725-1.372-1.592-4.738-5.192-4.948-1.705-1.464-5.55-2.973-5.55-2.973s-1.223-4.135-4.705-4.199c-1.93-1.61-3.95-3.522-7.028-4.519-2.509-.795-6.032-.191-7.571-.438-1.53-.247-2.365-4.291-6.439-2.296-1.529-.33-4.156-.073-4.156-.073-.97-.768-2.156-1.39-2.646-1.4-.47-.008-1.49.641-2.755-.612-3.09-2.418-4.237-.164-6.76-1.152-1.068-.42-4.008-2.223-6.606-2.214-4.626.01-4.734 1.446-8.017-1.033-2.666-2.012-5.237 1.721-7.05 1.804-1.814.082-2.794-.348-5.038-2.196-2.313-1.902-3.245-2.295-5.558-2.332-1.911-.028-3.371.347-4.724 1.216-1.94 1.263-1.96 1.263-2.842.156-.48-.604-2.568-1.683-4.636-2.397l-5.428.175-4.903.84c-5.92-2.057-7.581-1.16-10.61-.877-2.097.201-6.002 1.19-7.384.906a656 656 0 0 1-5.337-1.126z\"/>"
    },
    "hairBg": {
        "female1": "<path fill=\"$[hairColor]\" stroke=\"#000\" stroke-width=\"4\" d=\"M381.6 499.5h-8.5c-6.4-8.9-6.1-18.6-6.1-28.3 0-3.9 1.7-6.9 4-9.2 7.6-8.1 8.7-12.7 5.6-23.1-1.5-5-5-10.5-2.5-15.4 2.3-4.4 1.5-8.4 1.9-12.6.1-.6-.4-1.3-.8-2.4-1-.9-2.4-2.1-4.3-3.8 1.7-4.9 3.4-9.8 4.7-13.7-1-3.4-1.7-6-2.8-9.9-2.2-2-5.2-4.6-7.9-7v-11c3.7-5.4 5.5-10.5 4.1-15.9-3.9-5-7.3-9.6-11.5-15 1.2-3.5 2.7-7.8 4.1-12 .9-5.3 1.1-10.9.8-16.4-4.9-13.2-9.5-26.6-13.2-41-1.2-4.8-2.4-9.6-3.4-14.6-5-36-28-102-60-88-23 10-30 64-70.4 57.3h-31.6c-6.3 0-12.6 0-18.7-.1C154 217 140 218 132 207c-11-17 4-40-14-52v3c-3 0-5-1-7-3-1 7-4 12-8 18-25 36-54 65-66 106-1.2 4.3-2.4 8.4-3.5 12.6C30.2 304 27 316 21.1 328c-1.3 3.4-1.9 7.1.2 11.6 1.2 1.8 3.2 4.9 4.8 7.2-4 5.3-7.6 10-11.4 15 6.3 8.8 2.5 15.3-3.3 20.8v10.2c1.8 4 3.4 6.7 4.2 9.7.6 2.4-.8 4.7-1.7 7-1.2 3.5-.8 8.1.5 11.8 1.7 5 1.9 9.4-.1 14.5-1.2 2.8-.9 6.5-.4 9.6.4 2.6 2.1 5 3 7.6 1 3 2.2 6 2.2 9 0 2.4.4 4.5 1.1 6.7 2.3 6.8 3.9 13.5.2 20.5-.8 1.4-.1 3.6-.1 5l4.9 4.9c-.9 5.4-2 11.4-3 17.2 1.5 1.5 2.6 3.1 4.2 4 4.6 2.6 4.6 7.9 6.8 11.8 1.3 2.3.4 5.8-1.4 9.1-1.5 2.7-1.3 7.3 1.6 11.3 4.6 6.3 2.9 12.7-2.6 18.1-5.8 5.8-6.7 12.8-4.6 20.7 1.2-4.9 2.4-9.9 3.9-16 2.1-1.9 5-4.7 7.4-6.9 1-4.2 3.6-8.6 2.3-10.7-2.2-3.5-.7-7.2-2.4-10.2-1.9-3.5 1.5-6.2.7-9.6-.8-3.5-.2-7.2-.2-10.7L48.7 538c.6 2.4 1.6 6.1 2.5 9.9-1.6 3.1-2 8-1.3 14.5 4.9-8.4 3.3-17.3 3.6-26.1-3.9-5.6-7.7-10.9-11.7-16.6 4.9-5.1 1.8-11.1 2.7-15.7-1.7-3.3-2.9-5.6-3.7-7.2 2.1-5 3.9-9.5 5.8-14-1.9-3.7-4-7.7-6.8-13.3 1-2.8 2.5-7 3.9-11.3l.9.3V444c-3.3-.2-1.9-2.8-2.3-4.3-.7-.4-1.3-.9-1.9-1.4l.7-.7 1.5 1.8c-.2.1-.3.3-.3.3 3.4.1 2 2.6 2.3 4.3 5.5 2.2 6.9 7.3 6.3 12.1-.2 2-.9 5.2-2.1 6.7-5 6.7-.7 11.3 2.9 16.1 1.9 2.6 4.5 4.6 6.3 6.4 0 1.4.1 1.8 0 2.2-.5 1.3-1 2.5-1.5 3.8-4.1 10.8-3.9 14.3 2 23.4 2.1 3.2 4.5 6.2 6.5 8.9-7.4 14 5.3 18.7 10.9 26.9V565c-4 4.7-7.7 9-11.1 13.1 0 3.3-.1 5.8 0 8.4.1 2.3.4 4.5.6 6.8 2-11.4 4.3-16.4 11-21.4 2.5-1.9 5.1-3.6 7.9-5.2 9.5-5.3 12.9-14.1 14.6-24.3 1.2-1.1 2.6-2.4 3.8-3.6v-23.2c-7.3-6.7-3.7-13.3-1.5-20.1 3.7-2.8 7.3-6.2 13.5-3.6-3.1 5.9-8.4 9-12 13.5v10.2c4.2 2.5 9 4.7 10.6 9.1-1 3-1.4 5.9-2.8 8.2s-3.8 3.9-5.7 5.9c7-.1 9.3-6 13.3-8.8v-11c-2.4-4.2-8.1-5.7-6.5-11 4.1-3.1 8-6 13.4-10.1 0 12.1 0 22.6 1.1 33 1.3-4.5 2.6-9 3.9-13.6 2.6 2.3 4.5 4 6.1 5.5v7.9c-5.6 5.6-11.6 11.5-17.6 17.6.9 2-2.3 5.6 2.1 7v-5.8c3.6-2.2 5.6-6 10-8 3.3-1.5 5.9-4.7 8.3-7.4.1.5.3 1.1.5 1.7 1.2-3.5 2.4-7 3.9-11.3l.8-.5c-.3.4-.6.9-.9 1.3-1.2 1.5.1 4.9.2 7.5 2.3-3 3.3-5.9 3.9-9l.3-2.1c1.1-.7 2.1-1.4 3.1-2 1-2.9 3.6-6.1 2.3-7.5-1.1-1.2-1.3-2.5-1.4-3.8 2.4-.5 4.5-.9 6.6-1.2 4.9 3.3.9 8.6 4 13.5 1.9-4.4 3.4-7.9 5-11.6l-.6-.8c.6-3.7.1-7.4.3-11.1l-11.7-11.7c4.9-3.6 1.8-7.9 2.7-11-1.7-2.3-2.9-4-3.7-5.1 2.1-3.6 3.9-6.7 5.8-9.9-1.4-1.9-2.9-4-4.7-6.4 1.1-2.7 1.3-5.4.8-8.7.4-.7.7-1.4 1.1-2.1.3.1.6.1.9.2v-10.2c-3.3-.1-1.9-2-2.3-3.1-.7-.3-1.3-.6-1.9-1l.7-.5c.5.4 1 .9 1.6 1.3-.1.1-.3.2-.3.2 3.4 0 2 1.9 2.3 3.1 5.5 1.6 6.9 5.1 6.3 8.5-.2 1.4-.9 3.6-2.1 4.8-5 4.7-.7 8 2.9 11.3 1.9 1.8 4.5 3.3 6.3 4.5 0 1 .1 1.3 0 1.5l-1.5 2.7c-4.1 7.6-3.9 10.1 2 16.5 2.1 2.3 4.5 4.4 6.5 6.3-7.4 9.9 5.3 13.2 10.9 18.9v10.3c-4 3.3-7.7 6.4-11.1 9.2 0 2.3-.1 4.1 0 5.9.1 1.6.4 3.2.6 4.8 2-8 4.3-11.6 11-15.1 2.5-1.3 5.1-2.6 7.9-3.6 9.5-3.7 12.9-10 14.6-17.1 1.2-.8 2.6-1.7 3.8-2.5v-16.3c-7.3-4.7-3.7-9.4-1.5-14.2 3.6-2 7.3-4.4 13.5-2.5-3.1 4.1-8.4 6.3-12 9.5v7.2c4.2 1.8 9 3.3 10.6 6.4-1 2.1-1.4 4.2-2.8 5.8s-3.8 2.8-5.7 4.1c7-.1 9.3-4.2 13.3-6.2v-7.7c-2.4-3-8.1-4-6.5-7.8 4.1-2.2 8-4.2 13.4-7.1 0 8.5 0 15.9 1.1 23.3 1.3-3.2 2.6-6.3 3.9-9.6l.9.6c-.4 1.5-.9 3-1.7 4.5-.8 1.4-.1 3.6-.1 5l2.6 2.6c-4.2 3-8.7 6.1-13.1 9.3.9 1.4-2.3 4 2.1 4.9v-4.1c3.6-1.5 5.6-4.3 10-5.6q1.8-.6 3.3-1.5c-.9 5.3-1.9 11-2.9 16.7 1.5 1.5 2.6 3.1 4.2 4 4.6 2.6 4.6 7.9 6.8 11.8 1.3 2.3.4 5.8-1.4 9.1-1.5 2.7-1.3 7.3 1.6 11.3 4.6 6.3 2.9 12.7-2.6 18.1-5.8 5.8-6.7 12.8-4.6 20.7 1.2-4.9 2.4-9.9 3.9-16 2.1-1.9 5-4.7 7.4-6.9 1-4.2 3.6-8.6 2.3-10.7-2.2-3.5-.7-7.2-2.4-10.2-1.9-3.5 1.5-6.2.7-9.6-.8-3.5-.2-7.2-.2-10.7 3.6 3.6 6.9 6.8 10.8 10.8.6 2.4 1.6 6.1 2.5 9.9-1.6 3.1-2 8-1.3 14.5 4.9-8.4 3.3-17.3 3.6-26.1-3.9-5.6-7.7-10.9-11.7-16.6 4.9-5.1 1.8-11.1 2.7-15.7-1.7-3.3-2.9-5.6-3.7-7.2 2.1-5 3.9-9.5 5.8-14-.8-1.6-1.7-3.2-2.6-5 1.8-.2 3.5-.5 5.2-.7 4.9 2.3.9 6 4 9.5.8-1.3 1.5-2.5 2.2-3.7.9.9 1.9 1.7 2.6 2.5 0 1.4.1 1.8 0 2.2-.5 1.3-1 2.5-1.5 3.8-4.1 10.8-3.9 14.3 2 23.4 2.1 3.2 4.5 6.2 6.5 8.9-7.4 14 5.3 18.7 10.9 26.9V565c-4 4.7-7.7 9-11.1 13.1 0 3.3-.1 5.8 0 8.4.1 2.3.4 4.5.6 6.8 2-11.4 4.3-16.4 11-21.4 2.5-1.9 5.1-3.6 7.9-5.2 9.5-5.3 12.9-14.1 14.6-24.3 1.2-1.1 2.6-2.4 3.8-3.6v-23.2c-7.3-6.7-3.7-13.3-1.5-20.1 3.6-2.8 7.3-6.2 13.5-3.6-3.1 5.9-8.4 9-12 13.5v10.2c4.2 2.5 9 4.7 10.6 9.1-1 3-1.4 5.9-2.8 8.2s-3.8 3.9-5.7 5.9c7-.1 9.3-6 13.3-8.8v-11c-2.4-4.2-8.1-5.7-6.5-11 4.1-3.1 8-6 13.4-10.1 0 12.1 0 22.6 1.1 33 1.3-4.5 2.6-9 3.9-13.6 2.5 2.3 4.5 4 6.1 5.5v7.9L341 548.3c.9 2-2.3 5.6 2.1 7v-5.8c3.6-2.2 5.6-6 10-8 4.1-1.8 7-6.3 10-9.1v-13.9c-2.3-3.4-4.5-6.6-7-10.4.9-1.9 2-4.1 3-6.2 6.1 2.2 6.2 8 8.1 12.1 1.5 3.1 1.7 7.6-1.4 11.3-1.2 1.5.1 4.9.2 7.5 2.3-3 3.3-5.9 3.9-9 .6-3.3.8-6.8 1.2-10.7-.3-.7-.9-2.2-1.5-3.9 4.3-.8 7.9-1.5 11.2-2.1 4.9 3.3.9 8.6 4 13.5 1.9-4.4 3.4-7.9 5-11.6-2.6-3.3-5.1-6.6-7.5-9.7zM27.9 466.2c-.3-.6-1-1.2-1-1.8-.1-3.7.4-7.5-.2-11.1-.6-3.3-2.3-6.5-3.6-9.6-1.1-2.5-.3-4.4.7-6.9 4.1-10 3.8-10.2-1.5-21.7 3.8-4.6 2.4-10.3 2.2-15.6-.2-4.9-1.8-9.7-.9-13.5 1.7-2.4 3.4-4.8 5.9-8.4-.1-.4-.1-2.4-.1-4.9q2.1 3.75 0 6.3c-2.9 11-2.9 11.1 4.7 20.8-1.7 3.7-3.5 7.8-5.5 12.1 1.7 3.4 3.3 6.8 5.3 10.7-1.3 2.8-2.8 5.9-5 10.6-1.3 6 2.1 12.1 7.5 17.2-2.3 5.7-4.3 10.8-6.4 15.9-.6-.1-1.4-.1-2.1-.1zm4.3 10.2c1.9 2.9 3.2 5 5 7.7-1.7 2.9-4.1 7.1-6.9 12-3.2-7.4.9-12.7 1.9-19.7zm3.1 41.8-5.9-5.9c1.3-3.1 2.9-6.8 4.7-11.1 4.4 6.4 5.9 12.1 1.2 17zm284.2-316.7C328 204 325 215 330 220c-7-4-6-13-10.5-18.5zm26.7 92.8c.8 1.7 2.8 3.7 3.8 5.7-3 2-6 0-7-2s2-3 3.2-3.7zm-13.5 98.2h-8.2c.4-1.8.8-3.1 1.4-5.6 2.5 2 4 3.3 6.8 5.6zm-26.2 35.1v7.1c-1.6.1-3.6.3-5.2.4-2.4-2.6-2.1-3 5.2-7.5zm-13-43.1v.7h-2.2v-.7zM273 456c-.2 2-.9 5.2-2.1 6.7-2.5 3.3-2.7 6.1-1.8 8.6h-4.9c-.8-.8-1.5-1.6-2.1-2.5 1-2.8 2.4-6.8 3.8-10.8l.9.3V444c-1.3-.1-1.8-.5-2.1-1 .8-.7 1.5-1.3 2-2 .2.9-.1 2.1 0 3 5.5 2.2 6.9 7.2 6.3 12zm-49.2-60h-8.2c.4-1.2.8-2.2 1.4-3.9 2.5 1.4 4 2.3 6.8 3.9zm-26.1 24.8v5c-1.6.1-3.6.2-5.2.3-2.4-1.8-2.1-2.1 5.2-5.3zm-4.2-55.7c.6 0 1.3-.1 1.9-.1v2.6l-1.1.1c-.3-.9-.5-1.7-.8-2.6zm-8.9 25.3v.5h-2.2v-.5zm-73.9 2.1h-8.2c.4-1.8.8-3.1 1.4-5.6 2.5 2 4 3.3 6.8 5.6zm-26.1 35.1v7.1c-1.6.1-3.6.3-5.2.4-2.4-2.6-2.1-3 5.2-7.5zm-13.1-43.1v.7h-2.2v-.7zm186.9 65.9c-.1.3-.2.5-.3.7 0-.3 0-.6.1-.9.1.1.2.1.2.2zm-5.4-53.8c-2.2-2.4-6.1-3-6-6 1.2-.1 2.2-.1 2.9-.1.5 1.5 1.5 3.1 3.1 5.2zm-5.5 14.3c1.3-1.3 2.9-2.4 4.6-2.5-.5 1.1-1 2.3-1.5 3.4l1.2 2.4c-1.2-.9-2.7-2.1-4.3-3.3zm15.1-23.9c-.1-.1-.3-.2-.4-.2 1.2-2.6 2.5-5.3 3.9-8.4 4 6 4 6.1-3.5 8.6zm-122.7 6.3c-.7-1-1.6-1.9-2.4-2.6l2.5-2.5c.1 1.3 0 2.9-.1 5.1zm-4.3 18.8c1.8-1.9 3.9-2.9 6.4-1.2 1.4 2.7 2.3 4.5 3.8 7.5-1.4.6-3.1 1.3-5 2.1-.3-.4-.7-.8-1.1-1.2-.5-1.7-1.8-3.7-4.1-7.2zm7.6 35.9h-1.4c.5-.5 1.1-.8 2-.9zm-11.8-85.8c-.3.5-.5 1-.7 1.5-1-.5-1.9-1-2.6-1.5zm-6.3 15.9-3.5 3.5c-1.9-2.7-5.5-4-5.6-8.8 4.9-.9 6.2 3.5 9.1 5.3zm3 23.5h-.2v-.4c0 .1.1.2.2.4zm20.3 83c-.8-.6-1.9-1.3-3.2-2.2-.2-2-.2-4-.3-6.1.7-1.1 1.4-2.4 2.2-3.7 4.5 4.5 6 8.5 1.3 12zm83.3-122.4c-.1.2-.3.4-.4.5-.4-.2-.7-.4-1-.5zm1.7 20.5v4.6c-1.9-1.3-4.2-2.5-4.2-5.2 1.8-.2 3.1.1 4.2.6zm6.4-13.6c.2 1.7.1 3.2-.4 4.7-2.2-1.2-1.8-2.4.4-4.7zm14.4 107.3c1.5 2.3 2.6 4 3.9 6 .4.8.6 1.6.7 2.5-1.4 2.4-3.1 5.4-5.1 8.9V485c-.4-.5-.8-.9-1.3-1.3.6-2.4 1.4-4.8 1.8-7.3zm89-136.9v.1zM40 387.2c1.3-2.8 2.6-5.5 4.1-8.8 2.7 4.1 1.4 7-4.1 8.8zm15.2 45.5c1.7-3.5 3.6-7.5 6-12.4 3.2 2.7 5.6 4.7 8 6.7-4.8 5-.5 11.4-3.6 18.2-3.6-4.4-6.6-8-10.4-12.5zm4.8 36.7c1.3-2.8 2.3-5 3.4-7.5 4.4 3.4 8.7 6.8 13.1 10.1-1.6 3.1-2.9 5.5-4.4 8.4-5-3.2-8.1-7.6-12.1-11zm10.6 23c.7 1.8 1.3 3.4 2.4 6.2-.8 1.7-2.3 5.3-4.2 9.6-5.3-5.5-5.1-5.8 1.8-15.8zM69.3 509c3.1.2 1.9 2.5 2.2 4.1-3.1-.2-2.1-2.4-2.2-4.1zm2.2 27.9c.2-5.2-.7-10 1.9-15 1.1-2.1-1.2-5.9-1.9-8.9 2.3 1.8 4.5 3.5 7.2 5.6-.9 4.1-2.4 8.1-2.6 12.2-.1 3.6 1.2 7.2 2 10.8-2.3-1.4-4.5-3.1-6.6-4.7zm6.7 5.2c.8.3 1.4.8 2 1.4l-.7.7c-.5-.6-1-1.2-1.6-1.8zm13.2-7.7c1.1 11.8-1.6 21.5-12.8 27.5 1.8-5.8 3.7-11.6 5.9-18.7-1-4.5-6.3-9.7-2.2-17 1.7-3.1.3-8 .3-12-1.3-1.3-2.7-2.6-4.4-4.5-.9-7 6.4-15.5-2.2-22.1 1.9-3 3.8-5.9 6.4-10.1V469h7.3c-3.7 8.4-4.3 16.5 2 23.2-8.1 23.7-10.2 22.3-.3 42.2zm8.1 1.4c-1.7-6.2-3.3-11.8-4.9-17.8.4-.1 1.6-.3 3-.6.7 6.2 4.9 11.4 1.9 18.4zm5.9-56.5-.1-1.1c1.9-.3 3.9-.6 5.8-.8l.2 2zm3.8-22.5c-.9.2-2 .1-2.9.6s-1.6 1.4-2.3 2c-2.4-1.4-4.8-2.8-7-4.1-4-7.5 3.5-11.8 3.8-17.8h13c-.8 3.5-1.4 6.8-2.2 10-.7 3-1.6 6-2.4 9.3zm10.3 13.5c-1.8-1-3.7-1.9-5.7-2.9 1.2-1 2.3-1.9 3.4-2.9 1.6.8 3.4 1.6 6.7 3.2-2.2.3-3.8.5-5.3.7.2.6.6 1.2.9 1.9zm6.3-17.6c.8-4.4 1.3-8.9 4.4-13.6.8 1.7 1.7 3.5 1.9 5.2-1.7 3.3-4.5 5.6-6.3 8.4zm7.4 20.3h-.7v-2.2h.7zm10.7 48.5c-1.4 1-2.6 2.1-3.4 3.2v-6c-2.3-3.4-4.5-6.6-7-10.4.9-1.9 2-4.1 3-6.2 6.1 2.2 6.2 8 8.1 12.1.8 1.7 1.2 3.9.9 6.1-.5.4-1 .8-1.6 1.2zm4.2-4.2c.1-1.3.2-2.6.4-4-.3-.7-.9-2.2-1.5-3.9h.1c2.4 2.7 2.6 5.4 1 7.9zm13.8-18.9c.6 1.7 1.6 4.3 2.5 7l-.1.2c-1.6-2.1-3.2-4.1-4.7-6.1h-8.2c.1-.4 0-.7-.1-1.1-.8-2.4-.2-5.1-.2-7.5 3.6 2.5 6.9 4.8 10.8 7.5zm-11.6-37.8q-1.5 1.8-3.6 4.5c.6-1.1 1.4-2.2 2.3-3.1.4-.6.9-1 1.3-1.4zm2.8-68.3c1.3-2 2.6-3.9 4.1-6.2 2.7 2.9 1.4 5-4.1 6.2zm15.2 32.1c1.7-2.5 3.6-5.3 6.1-8.7 3.2 1.9 5.6 3.3 8.1 4.7-4.8 3.5-.5 8-3.6 12.9-3.8-3.2-6.8-5.8-10.6-8.9zm4.8 25.8c1.3-2 2.3-3.5 3.4-5.3 4.4 2.4 8.7 4.8 13.1 7.1-1.6 2.2-2.9 3.9-4.4 5.9-5-2.2-8.2-5.3-12.1-7.7zm10.6 16.3c.7 1.3 1.3 2.4 2.4 4.4-.8 1.2-2.3 3.8-4.2 6.7-5.3-3.9-5.1-4.1 1.8-11.1zm-1.3 11.7c3.1.1 1.9 1.8 2.2 2.9-3.1-.2-2.1-1.8-2.2-2.9zm2.2 19.6c.2-3.7-.7-7.1 1.9-10.5 1.1-1.5-1.2-4.1-1.9-6.3 2.3 1.2 4.5 2.5 7.2 3.9-.9 2.9-2.4 5.7-2.6 8.6-.1 2.5 1.2 5.1 2 7.6-2.3-1-4.5-2.2-6.6-3.3zm6.7 3.6c.8.2 1.4.6 2 .9-.2.2-.5.3-.7.5-.5-.4-1-.9-1.6-1.3zm13.2-5.4c1.1 8.3-1.6 15.1-12.8 19.4 1.8-4.1 3.7-8.2 5.9-13.2-1-3.2-6.3-6.8-2.2-12 1.7-2.2.3-5.6.3-8.5-1.4-1-2.6-1.9-4.4-3.1-.9-4.9 6.4-10.9-2.2-15.5 1.9-2.1 3.8-4.2 6.4-7.1v-6h7.3c-3.7 5.9-4.3 11.6 2 16.4-8.1 16.6-10.2 15.6-.3 29.6zm8.1 1c-1.7-4.4-3.3-8.3-4.9-12.5.4-.1 1.6-.2 3-.4.7 4.3 4.9 8 1.9 12.9zm5.9-39.8-.1-.8c1.9-.2 3.9-.4 5.8-.6l.2 1.4zm3.8-15.8c-.9.1-2 .1-2.9.4s-1.6 1-2.3 1.4c-2.4-1-4.8-2-7-2.9-4-5.3 3.5-8.3 3.8-12.5h13c-.8 2.5-1.4 4.8-2.2 7.1-.7 2-1.6 4.1-2.4 6.5zm10.3 9.5c-1.8-.7-3.7-1.3-5.7-2.1 1.2-.7 2.3-1.4 3.4-2 1.6.5 3.4 1.1 6.7 2.2-2.2.2-3.8.3-5.3.5.2.4.6.9.9 1.4zm20 44.6c-.1.2-.3.4-.4.7 0-.1-.1-.2-.1-.3.2-.2.3-.3.5-.4zm4.7 22.7-5.9-5.9c1.3-3.1 2.9-6.8 4.7-11.1 4.4 6.4 5.8 12.1 1.2 17zm19.9-85.5c1.7-3.5 3.6-7.5 6-12.4 3.2 2.7 5.6 4.7 8 6.7-4.8 5-.5 11.4-3.6 18.2-3.7-4.4-6.7-8-10.4-12.5zm4.8 36.7c1.3-2.8 2.3-5 3.4-7.5 4.4 3.4 8.7 6.8 13.1 10.1-1.6 3.1-2.9 5.5-4.4 8.4-5.1-3.2-8.2-7.6-12.1-11zm10.6 23c.7 1.8 1.3 3.4 2.4 6.2-.8 1.7-2.3 5.3-4.2 9.6-5.3-5.5-5.1-5.8 1.8-15.8zm-1.3 16.6c3.1.2 1.9 2.5 2.2 4.1-3.1-.2-2.1-2.4-2.2-4.1zm2.2 28c.2-5.2-.7-10 1.9-15 1.1-2.1-1.2-5.9-1.9-8.9 2.3 1.8 4.5 3.5 7.2 5.6-.9 4.1-2.4 8.1-2.5 12.2-.1 3.6 1.2 7.2 2 10.8-2.5-1.5-4.6-3.1-6.7-4.7zm6.6 5.1c.8.3 1.4.8 2 1.4l-.7.7-1.5-1.8zm13.3-7.7c1.1 11.8-1.6 21.5-12.8 27.5 1.8-5.8 3.7-11.6 5.9-18.7-1-4.5-6.3-9.7-2.2-17 1.7-3.1.3-8 .3-12-1.4-1.3-2.6-2.6-4.5-4.5-.9-7 6.4-15.5-2.2-22.1 1.9-3 3.8-5.9 6.4-10.1V469h7.3c-3.7 8.4-4.3 16.5 2 23.2-8.1 23.7-10.2 22.3-.2 42.2zm8.1 1.4c-1.7-6.2-3.3-11.8-4.9-17.8.4-.1 1.6-.3 3-.6.7 6.2 4.9 11.4 1.9 18.4zm5.8-56.5-.1-1.1c2-.3 3.9-.6 5.8-.8l.2 2zm3.8-22.5c-.9.2-2 .1-2.9.6s-1.6 1.4-2.3 2c-2.4-1.4-4.8-2.8-7-4.1-4-7.5 3.5-11.8 3.8-17.8h13c-.8 3.5-1.4 6.8-2.2 10-.6 3.1-1.5 6-2.4 9.3zm10.3 13.5c-1.8-1-3.7-1.9-5.7-2.9 1.2-1 2.3-1.9 3.4-2.9 1.6.8 3.4 1.6 6.7 3.2-2.2.3-3.8.5-5.3.7.3.6.6 1.3.9 1.9zm2.2-88.7c-1.9-2.7-5.5-4-5.6-8.8 4.9-.8 6.2 3.5 9 5.4-1.5 1.4-2.3 2.2-3.4 3.4zm5.4-27.8c1.4-1.9 2.7-3.9 4.4-6.4 1.6 1.4 3.2 2.6 5.2 4.2-2.3 4.6-4.2 8.3-6 12-6.8-3.4-7.2-4.7-3.6-9.8zm1.9 43.3v4.5h-1.1v-4.5zm4.3 75.9h-.7v-2.2h.7zm-7.5-20.3c1.1-5.6 1.4-11.5 7.7-17.6 1.3 9.5-4.6 12.8-7.7 17.6zm14.1-59.3c-2.2-3.3-6.1-4.3-6-8.5 6-.6 6.5-.1 6 8.5zm-5.4 20.2c1.9-2.8 4.5-4.8 7.6-2.7 1.4 2.7 2.3 4.5 3.8 7.5-1.4.6-3.1 1.3-5 2.1-1.6-1.5-4-4.2-6.4-6.9zm4.8 39c2.1-4.9 2.5-5.3 5.5-5.7-2.5 1.2-.4 7.5-5.5 5.7z\"/>",
        "female2": "<g fill=\"$[hairColor]\" stroke=\"#000\" stroke-width=\"4\"><path d=\"m401.1 549.5-1.8.7c-.6-1.2-1.5-2.4-2.2-3.6-.1-.2-.2-.3-.2-.5-.2-.5-.4-1.1-.4-1.7-.7-21.9-8.4-42.1-16.3-62-18-45.3-29.3-92.3-37.9-140.1-3.2-17.5-6.1-35.1-9.3-52.7l1.8-.3c5.1 26.5 10.3 52.9 15.7 79.4 8.4 41.8 21.1 82.2 36.9 121.8 6.7 16.9 12.4 34.1 12.7 52.6.1 2.1.4 4.3 1 6.4z\"/><path d=\"m396.9 546.1-.6.3c-2.2-.2-4.4-.6-6.6-.7-16.5-.6-33-.5-49.4-1.8-24.7-2-49.3-5.4-74.1-7.6-14.9-1.3-30-1-44.9-2.3-28.6-2.3-57.1-4.9-85.6-7.8-11.8-1.2-23.6-2.4-35-5.3-11.7-2.9-23.2-4.3-35.1-2.9-10.8 1.2-21.7.6-32.3-1.8-1.7-4.9-2.4-9.6-4.9-13.1-5.2-7.4-6-15.4-4.9-23.8 1-8.1 2-16.3 4.2-24.1 5.4-19.7 9.3-39.5 8.8-60.1-.1-3.3-.1-6.6-.1-9.8s0-6.6.1-9.8C38 342 47 309 63 280l-.7-.5c6.8-9.8 10.8-19.7 16.7-29.5 2.3-3.2 4.8-6.3 7.7-9.1l2.1.2c-.6.6-1.2 1.2-1.8 1.9 12-7 26-9 40.1-9.5 3.7-.2 7.4-.5 11-.6 3.7-.2 7.4-.3 11.1-.4 33.6-1.1 66.8 4 100.2 6.2 23.1 1.5 42.9 10.9 62 22.2 6.7 4 12 10.4 17.7 16.1 1.5 1.5 2.4 4.1 2.8 6.3.4 2.1.8 4.2 1.1 6.3l1.8-.3-1.8.3c3.1 17.6 6.1 35.2 9.3 52.7 8.6 47.8 19.9 94.9 37.9 140.1 7.9 19.9 15.6 40.1 16.3 62 0 .6.1 1.1.4 1.7zm-18.7-11.5c-.3-2.8-.2-4.3-.6-5.5-4-12-8.1-23.9-12.3-35.8-3-8.3-6.6-16.4-9.4-24.7-9.1-27.1-18.1-54.3-26.9-81.6-6.1-19-11.6-38.2-17.4-57.3-.6-2.5-1.1-5-1.4-7.5-1.4 15 58.6 202.8 68 212.4zM68.6 351.4C69 332 75 313 74.4 292.8c-.7 3.1-1.1 4.7-1.4 6.2-3 20-5 39-6.3 58.6l-1.2 11.7c-.9 7.8-1.9 15.6-3.1 23.4-3.7 24.1-7.2 48.1-7.2 72.5 0 11.3 4.9 22.4 2.4 34 0 .1.5.4.7.5 3.1-5.6 3.3-15.8.8-24.1-.9-2.8-1.8-5.9-1.6-8.8.9-15.8 1.6-31.6 3.3-47.3 1.9-18.2 4.2-36.4 6.4-54.6.4-4.4.9-9 1.4-13.5z\"/><path d=\"M396.3 546.7c.1.6.2 1.2.3 1.7-2.2.6-4.5 1.9-6.7 1.8-17.8-.6-35.7-.8-53.4-2.3-37.5-3.2-74.7-8.8-112.5-9.6-25.9-.6-51.8-4.1-77.7-6.4-12.3-1.1-24.6-1.9-36.8-3.7-7.5-1.1-14.7-5.2-22.1-5.7-11.7-.8-23.6.2-35.4.3-6.8 0-13.7-.2-20.5-.4-3.9-.1-6.4-.9-4.6-6.1.8-2.9.4-6-1.2-8.6-10.1-14.4-7.1-29.9-4-45.3 1.2-6.2 2.9-12.3 4.9-18.3 4.6-13.6 6.9-27.9 6.7-42.2-.1-6.8-.1-13.5 0-20.2l.3-10.1C36 340 46 308 63 280c-16 29-25 62-26.6 95.5-.1 3.3-.1 6.6-.1 9.8s.1 6.6.1 9.8c.5 20.6-3.3 40.4-8.8 60.1-2.2 7.8-3.2 16-4.2 24.1-1.1 8.4-.3 16.4 4.9 23.8 2.5 3.5 3.1 8.3 4.9 13.1 10.6 2.4 21.5 3 32.3 1.8 11.9-1.4 23.4 0 35.1 2.9 11.4 2.9 23.2 4.1 35 5.3 28.5 2.9 57 5.5 85.6 7.8 14.9 1.2 30 .9 44.9 2.3 24.7 2.2 49.3 5.6 74.1 7.6 16.4 1.4 32.9 1.2 49.4 1.8 2.2.1 4.4.4 6.6.7z\"/><path d=\"M377.6 529c.4 1.3.3 2.8.6 5.5-9.4-9.5-69.4-197.3-68-212.4.3 2.5.8 5.1 1.4 7.5 5.7 19.1 11.3 38.3 17.4 57.3 8.7 27.3 17.8 54.4 26.9 81.6 2.8 8.3 6.5 16.4 9.4 24.7 4.2 11.9 8.2 23.9 12.3 35.8zm-42.8-248.2c.6 2.7-.5 5.7 0 8.4l-1.8.3c-.4-2.1-.8-4.2-1.1-6.3-.4-2.2-1.3-4.7-2.8-6.3-5.6-5.6-10.9-12.1-17.7-16.1-19.1-11.3-38.9-20.7-62-22.2-33.4-2.2-66.6-7.4-100.2-6.2-3.7.1-7.4.3-11.1.4-3.7.2-7.4.4-11 .6C113 234 99 236 87 243c.6-.7 1.2-1.3 1.8-1.9 9.2-8.9 24-7.3 35.2-10.1 5-.5 10.2-.8 15.3-1.1 30.8-1.5 61.6.9 92.3 4.2 9.8 1.1 19.6 1.7 29.3 3 26.1 3.4 47.6 16.1 66.8 33.5 3.3 3 6.1 6 7.1 10.2zM82.3 243.5c1.4-.9 2.8-1.8 4.3-2.6-2.9 2.8-5.4 5.8-7.7 9.1-5.9 9.8-9.9 19.7-16.7 29.5-.1.2-.2.3-.3.5 6.1-12 9.1-26 20.4-36.5zm-7.9 49.3C75 313 69 332 68.6 351.4c-.5 4.6-1 9.1-1.6 13.6-2.2 18.2-4.5 36.4-6.4 54.6-1.6 15.7-2.4 31.5-3.3 47.3-.2 2.9.8 5.9 1.6 8.8 2.5 8.4 2.3 18.5-.8 24.1-.3-.2-.7-.4-.7-.5 2.5-11.6-2.4-22.7-2.4-34 0-24.4 3.4-48.4 7.2-72.5 1.2-7.8 2.3-15.6 3.1-23.4.4-3.9.9-7.8 1.2-11.7C68 338 70 319 73 299c.3-1.5.7-3.1 1.4-6.2zm260.4-3.6c5.1 26.5 10.3 52.9 15.7 79.4 8.4 41.8 21.1 82.2 36.9 121.8 6.7 16.9 12.4 34.1 12.7 52.6.2 2.2.5 4.4 1.1 6.5l-1.8.7c-.6-1.2-1.5-2.4-2.2-3.6-.1-.2-.2-.3-.2-.5-.2-.5-.4-1.1-.4-1.7-.7-21.9-8.4-42.1-16.3-62-18-45.3-29.3-92.3-37.9-140.1-3.2-17.5-6.1-35.1-9.3-52.7z\"/><path d=\"M396.3 546.4v.3c.1.6.2 1.2.3 1.7-2.2.6-4.5 1.9-6.7 1.8-17.8-.6-35.7-.8-53.4-2.3-37.5-3.2-74.7-8.8-112.5-9.6-25.9-.6-51.8-4.1-77.7-6.4-12.3-1.1-24.6-1.9-36.8-3.7-7.5-1.1-14.7-5.2-22.1-5.7-11.7-.8-23.6.2-35.4.3-6.8 0-13.7-.2-20.5-.4-3.9-.1-6.4-.9-4.6-6.1.8-2.9.4-6-1.2-8.6-10.1-14.4-7.1-29.9-4-45.3 1.2-6.2 2.9-12.3 4.9-18.3 4.6-13.6 6.9-27.9 6.7-42.2-.1-6.8-.1-13.5 0-20.2l.3-10.1C36 340 46 308 63 280c-16 29-25 62-26.6 95.5-.1 3.3-.1 6.6-.1 9.8s.1 6.6.1 9.8c.5 20.6-3.3 40.4-8.8 60.1-2.2 7.8-3.2 16-4.2 24.1-1.1 8.4-.3 16.4 4.9 23.8 2.5 3.5 3.1 8.3 4.9 13.1 10.6 2.4 21.5 3 32.3 1.8 11.9-1.4 23.4 0 35.1 2.9 11.4 2.9 23.2 4.1 35 5.3 28.5 2.9 57 5.5 85.6 7.8 14.9 1.2 30 .9 44.9 2.3 24.7 2.2 49.3 5.6 74.1 7.6 16.4 1.4 32.9 1.2 49.4 1.8 2.3.1 4.5.4 6.7.7zM88.8 241.1c9.2-8.9 24-7.3 35.2-10.1 5-.5 10.2-.8 15.3-1.1 30.8-1.5 61.6.9 92.3 4.2 9.8 1.1 19.6 1.7 29.3 3 26.1 3.4 47.6 16.1 66.8 33.5 3.3 3 6.1 6 7 10.2.6 2.7-.5 5.7 0 8.4l-1.8.3c-.4-2.1-.8-4.2-1.1-6.3-.4-2.2-1.3-4.7-2.8-6.3-5.6-5.6-10.9-12.1-17.7-16.1-19.1-11.3-38.9-20.7-62-22.2-33.4-2.2-66.6-7.4-100.2-6.2-3.7.1-7.4.3-11.1.4-3.7.2-7.4.4-11 .6-14 .6-28 2.6-40 9.6.6-.7 1.2-1.3 1.8-1.9zm-2.1-.2c-2.9 2.8-5.4 5.8-7.7 9.1-5.9 9.8-9.9 19.7-16.7 29.5-.1.2-.2.3-.3.5 6-12 9-26 20.3-36.5 1.4-.9 2.9-1.7 4.4-2.6z\"/><path d=\"M378.2 534.6c-9.4-9.5-69.4-197.3-68-212.4.3 2.5.8 5.1 1.4 7.5 5.7 19.1 11.3 38.3 17.4 57.3 8.7 27.3 17.8 54.4 26.9 81.6 2.8 8.3 6.5 16.4 9.4 24.7 4.3 11.9 8.3 23.8 12.3 35.8.4 1.2.3 2.7.6 5.5zM74.4 292.8C75 313 69 332 68.6 351.4c-.5 4.6-1 9.1-1.6 13.6-2.2 18.2-4.5 36.4-6.4 54.6-1.6 15.7-2.4 31.5-3.3 47.3-.2 2.9.8 5.9 1.6 8.8 2.5 8.4 2.3 18.5-.8 24.1-.3-.2-.7-.4-.7-.5 2.5-11.6-2.4-22.7-2.4-34 0-24.4 3.4-48.4 7.2-72.5 1.2-7.8 2.3-15.6 3.1-23.4.4-3.9.9-7.8 1.2-11.7C68 338 70 319 73 299c.3-1.5.7-3.1 1.4-6.2z\"/></g>",
        "female3": "<path fill=\"$[hairColor]\" stroke=\"#000\" stroke-width=\"4\" d=\"M51.1 551.5c1.1-31.5 2-62.4 3.1-93.4 1.3-37.9-1.3-75.6-4.8-113.2-.4-4.2-.2-8.6-1-12.8-1.6-8.9 2.9-14.7 10.4-18.2 6.4-2.8 13.1-4.8 20-6.2 33.5-6.6 67.3-12.3 101.5-7.7 29.3 3.9 58.3 10.2 87.4 15.6 19.1 3.6 38.1 7.3 56.9 11.6 7.3 1.6 14.2 4.8 21.2 7.7 1.1.4 1.5 3.2 1.6 4.8 1.1 33.7 1.9 67.3 2.9 101 1.1 35 2.1 70.1 3.2 105.1.1 1.8.3 3.7.6 5.5-13.8 8.9-28.6 12-45.1 12.1-40.6.1-80.9-3.2-121.3-5.3-44.1-2.4-88.2-4.3-132.2-6.5-1.3.1-2.7 0-4.4-.1zm33.7-14.1c-1.2-1.6-2.8-4-4.5-7.1-7.3-13.9-6.7-27.1-6.4-40.4.2-12.6-.4-25.2-.5-37.8-.1-19.6-.8-22-3-72.9-.6-14.6-1.1-27.3-1.5-37.4-.4 2.7-.6 5.4-.4 8.2 1.4 23.4 3.3 46.7 4.1 70.1.8 24.4.7 48.9 1.3 73.3.2 12.5 1.4 24.9 6.4 36.8.9 2.7 2.9 4.9 4.5 7.2zm192.6-169-.2 5c-3 92.5-.4 164.2-.4 164.2.1 1.5.1 3.4.2 5.6.3 1 .7 2 1.3 2.8-.4-.9-.8-1.8-1.3-2.8-.6-15.2-1.3-39-1.3-68.3-.2-54.9 1.9-106.5 1.7-106.5zM337 544.7c-.4.5-.8 1-1.3 1.4.5-.5 1.3-1 1.3-1.4-1.8-55.3-3.7-110.6-5.6-165.9h-1.2c2.3 55.3 4.6 110.6 6.8 165.9zm-241.4-4.5c-.9-30.7-2-61.8-3.3-93.1q-1.95-47.25-4.5-93.3c-.3 1.7-.6 4.6-.5 8.3.2 4.8 1.1 8.3 1.3 9.1 3.1 12.7 3.5 94.2 5.6 144 .2 4.8.7 13.7 1.4 25zm137.9-1.7c1.6-27.1 2.4-56.3 1.9-87.3-.6-32.1-2.5-62.1-5.3-89.9 5.5 58.9 7.5 118 3.4 177.2zm85.2-161.4c.8 56.8 1.6 113.7 2.3 170.5 1.7-57-2.5-113.8-2.3-170.5z\"/>",
        "female4": "<g fill=\"$[hairColor]\" stroke=\"#000\" stroke-width=\"4\"><path d=\"M164.1 292.8c.3 86.5 1.5 176.8 39.7 190.4 3.2 1.2 5.2 1.2 44.2-4.5 47.2-6.9 70.8-10.4 73.7-12.8 44.8-38.1-99.8-318.1-144.9-303.2-13.2 4.4-13 46.3-12.7 130.1zM80.8 466.6c5.3 1.8 24.3.8 62.2-1.3 11.4-.6 12.7-.9 14.1-1.9 26.6-19.7-46.1-199.1-80.8-192.9-33.2 5.8-36.2 181.9 4.5 196.1z\"/><path d=\"M89.1 324.9c7.2 28.3 22.6 68.2 30.8 99.4 8.9 33.7 13.3 50.5 13.5 51.2.5 1.7 7.3 1 8.8.8 14.2-1.2 48 5.2 60.3-1.7 32.2-18.1-18-163.2-67.9-264.5-15.1-30.7-24-44.9-32.1-43.6-18.1 2.9-32.1 85.1-13.4 158.4z\"/><path d=\"M59 440.9c1.1 13.2 1.7 19.8 4.5 26.9 11.5 28.9 49.9 39.7 50.6 38.5.3-.6-7.2-4-15.4-14.1-3.2-3.9-7.1-8.8-9.2-16.3-1.2-4.4-1.6-8.9-1.1-15.3 1.2-14.7 5.9-25.8 7.1-28.7 3.6-8.9 5-21.8 7.7-47.4 3.6-33.7-2-51.8-3.2-78.2-3.3-73.7 31.8-119.8 16.7-129.5-6.2-3.9-18.2.4-42.3 9-10.9 3.9-16.4 5.9-19.9 8.3-27.3 19.3-13.9 89.3-3.8 141.7 5.9 31 11 44.4 9 67.3-.6 6.2-2.3 19.5-.7 37.8zm143.6-194.2c18.5 27.1 7.7 24.7 41.7 101.3 25.9 58.4 26.1 46.3 35.3 73.1 4.6 13.6 8 26.9 20.5 37.8 9 7.9 16.2 8.8 25.6 19.2 11.7 13 12.6 24.7 14.7 24.4 5-.9.5-64.1-13.5-138.5-12.4-65.8-21.7-84.8-25.6-92.3-7.6-14.7-23.3-33.5-54.5-71.2-38-45.9-47.5-52.7-56.4-50.6-12.6 2.9-20.6 22.9-20.5 39.1 0 22.1 15 31.8 32.7 57.7z\"/><path d=\"M288.8 362.7c15.1 11 26.6 21.5 35.9 36.5 15.3 24.7 19.9 54 22.4 69.9 1.4 8.7 2.8 22.5 5.8 35.3.7 3.1 1.5 6.2 1.9 10.9.8 9.3-.9 14.7.6 15.4 1.7.7 6.2-4.4 9-9.6 13.7-25.3 14.7-59.8 14.7-64.1.6-30.5-.4-45.7-2.6-65.4-7.6-70.1 1.3-66.7-5.5-121.4-7.2-57.3-11.9-91-39.1-118.6-20.8-21.1-47.3-31.1-55.1-34-23.8-8.7-43.4-9.6-57.9-10.1-16.8-.6-48.5-1.3-84.6 14.1-7.9 3.4-25.6 11.6-44.6 27.4-19.3 16-30.4 31.9-37.4 42.1-10.1 14.6-22.2 32.4-28.9 58.1-5.6 21.5-4.2 38.1-2.6 71.2.3 6.4.2 1.6 6.2 56.9 3.3 31.2 5 46.9 5.4 53.3.6 11.2 1 23.1 3.2 41 2 15.5 3.8 23.5 8.3 32.1 2.2 4.1 6.5 12.2 15.4 19.2 7.3 5.8 14.3 8.3 21.8 10.9 4.6 1.6 20.4 7.7 21.8 5.1s-15.2-9.4-23.7-26.3c-4.6-9.1-5.3-18.2-5.1-25 0-18.2 1-32.9 1.9-42.9 1.5-16.8 2.7-19.9 3.8-37.2 1-14.2 1.7-25.6.6-40.4-.9-12.5-2.8-23.7-3.8-29.5-2.2-12.7-4.4-21.7-3.8-35.3.3-6.6.4-10 1.3-11.5 12.3-22.6 140.4 17.8 214.7 71.9z\"/></g>",
        "female5": "<g fill=\"$[hairColor]\" stroke=\"#000\" stroke-width=\"4\"><path d=\"M75.6 220.7c-14.4 17-16.7 30.1-16 39.1.1 1.4 2 9 5.8 24.4 2.1 8.5 3.8 17.1 5.8 25.6 2.5 10.6 3.5 14.2 1.9 19.2-1.3 4.2-3.9 6.9-9 12.2-4.4 4.6-10.6 11-20.5 15.4-9.3 4.1-10.9 1.7-17.3 5.8-8.5 5.4-12.2 13.8-13.5 17.3-2.9 8-2.1 14.8-1.3 21.2.5 4.4 1.1 9.3 3.8 14.7 3.6 7.2 8.7 11.3 14.7 16 9.7 7.5 11.6 6.1 21.2 13.5 7.9 6.1 13 10.2 14.7 17.3 1.8 7.4-1.2 13.8-1.9 15.4-3.8 8.2-11.3 12.6-17.3 16-5.4 3.1-5.7 2.3-8.3 4.5-5.6 4.7-9.9 13.7-7.7 22.4 1.6 6.7 6.4 10.6 9 12.8 1.1.9 3.5 2.8 10.3 5.8 7.6 3.4 13.7 5 21.2 7.1 12 3.3 18 4.9 18.6 5.1 20.1 6.7 19.4 14.4 34.6 17.9 10.1 2.4 9.7-1.2 27.6 1.3 11.6 1.6 14 3.4 19.9 1.9 10.1-2.6 16.8-11.5 19.2-14.7 5.3-7.1 3.4-8.7 8.3-14.1 1.1-1.2 10.8-11.6 22.4-10.3 2.4.3 5.6 1.9 12.2 5.1 7.1 3.5 9.6 5.3 14.1 7.7 10.6 5.7 17.2 9.2 25.6 9 7.3-.2 12.9-3.1 19.2-6.4 3-1.6 6.7-4.3 14.1-9.6 12.5-9.1 13.5-10.8 14.1-12.2 2.8-6.6-.4-12 3.2-14.7 1.6-1.2 3.6-1 7.7-.6 5.9.6 11.2 2.1 18.6 5.1 9.2 3.7 8.5 4.4 10.9 4.5 7.8.3 15.6-7 18.6-14.7 1.8-4.7 1.4-8.6.6-15.4-.5-4.8-1.7-14.9-8.3-25-.9-1.4-.4-.4-11.5-13.5-8-9.4-9.4-11.1-10.9-14.1-2.5-5-5.7-11.2-3.8-17.3.9-3 2.3-3.8 16-15.1 8.2-6.8 10.2-8.6 12.8-11.8 4.9-6.1 6.7-11.1 7.1-12.2.5-1.4 2-6.2 1.9-13.5-.2-14-6.4-24.6-9.6-30.1-2.9-4.9-7.6-12.8-16.7-19.2-5.7-4-6.8-3-11.5-7.1-2.6-2.2-11.7-9.9-12.2-21.2-.1-2.2.6-5.1 1.9-10.9 2.1-9 3.1-13.5 6.4-16.7 3.8-3.6 5.9-1.5 12.2-5.1 1.9-1.1 10.3-6.2 12.8-15.4 1.3-4.6.2-9-1.9-17.9-2-8.3-3.1-12.9-6.4-17.9-4.9-7.4-11.2-10.8-16-13.5-13.1-7.1-25.4-7.1-30.1-7.1-1.3 0-1.2.1-12.2 1.3-25.4 2.8-27.6 2.8-30.1 2.6-2.5-.3-2.7-.5-23.7-9.6-13.1-5.6-21.4-9.2-32.1-12.8-11.3-3.9-14.7-4.3-17.3-4.5-5-.3-7.7.3-22.4 3.2-19.9 3.9-19.7 3.7-21.8 4.5-7.3 2.9-12.1 6.6-21.8 14.1-6.6 5.1-6.5 5.8-14.1 11.5-8.3 6.3-7.8 5.1-15.4 10.9-8 6.1-10.3 8.8-16 10.9-4.2 1.5-7.9 1.8-10.4 1.9z\"/><path d=\"M81.4 249.7c4.7 27.3 1.1 22.6 5.8 43.6C93 319.6 97 319.7 97.5 335c.3 9.6.6 22.5-7.7 30.8-5.7 5.6-8.9 2.6-22.4 10.3-6.2 3.5-15 8.6-21.2 18.6-2.8 4.6-5.7 9.4-5.1 15.4.9 9.2 9.5 15.1 16.7 19.9 15.1 10.1 20.2 5.9 30.8 14.1 2.1 1.7 15.2 12.2 16.7 29.5 1 11.4-3.3 23.4-10.9 31.4-7.8 8.3-15.2 8-16.7 14.7-1.4 6.7 4.4 13.3 9 18.6 6.7 7.7 13.9 10.6 16.7 11.5 4.5 1.6 11.2 4 14.7.6 2.5-2.4 2.9-7.3 1.3-10.9-3-6.9-11.4-5.3-14.7-12.8-.2-.6-1.9-4.3-.6-8.3 1.1-3.6 3.8-5.5 5.8-7.1 3.2-2.5 7.7-7.2 16.7-16.7 5.9-6.2 8.9-9.4 10.3-13.5 2-5.8 1.2-11 .6-14.7-.9-5.8-2.9-10.1-7.1-18.6-3.7-7.6-5.5-11.3-7.7-14.1-6.8-8.6-15.5-12.7-18.6-14.1-6.6-3-8.2-2.2-14.1-5.8-4.8-2.9-9.7-5.9-10.3-10.9-.7-5.7 4.6-10.5 5.8-11.5 1.9-1.7 3.1-2.1 8.3-4.5 0 0 8.7-4 17.9-9 7.4-4 8.7-5.3 9.6-6.4 1.6-2 3.2-4.8 4.5-11.5.9-4.9 2.2-12 .6-21.8-1.5-9.6-5-16.4-9-24.4-5.4-10.7-7.6-11.3-10.3-19.2-1.7-5.1-2.2-9.6-3.2-18.6-.9-7.8-1.8-16.7-.6-28.2.5-5.1 1.3-9.3 1.9-12.2 2.6-4.5 2.3-10-.6-14.1-3.3-4.6-9.3-6.5-13.8-5-6.6 2.2-8.2 11.2-9.3 17.2-1.5 7.8-.4 14.1-.1 16zm182.1-52.6c12.8 1.6 23.5 3.5 31.4 5.1 10.2 2.1 14.7 3.4 19.2 7.1 2.2 1.8 8.8 7.2 10.3 16.7.2 1.3 1.4 9.4-3.2 16.7-1.4 2.2-2.3 2.7-12.8 11.5-5.7 4.8-8.5 7.1-9 7.7-3 3.8-3.5 7.3-4.5 25-1.1 18.9-1 21.6.6 25.6 2.8 6.8 7.4 11.3 9 12.8 3.8 3.7 5.1 3.4 13.5 9s12.5 8.4 15.4 12.8c4.2 6.6 4.4 13.3 4.5 15.4.2 8.3-3.1 14.4-5.1 17.9-3.6 6.4-5.4 5.9-11.5 14.7-3.8 5.5-6.1 8.9-7.7 14.1-.6 2.1-2.7 9.5-.6 17.9 1.6 6.6 5.8 11.5 14.1 21.2 9.6 11.1 12.4 11.9 13.5 17.3 1.8 9.3-4.5 17.7-5.1 18.6-3.2 4.2-7.1 6.3-9.6 7.7-7.5 4.1-10.2 2.4-14.1 5.1-9.3 6.6-6.4 25.7-7.1 25.6-.5 0-.8-12.8-1.3-12.8s2.3 17.6-6.4 24.4c-2.5 1.9-6.6 2.6-14.7 3.8-6.7 1-9 .5-10.9-.6-2.6-1.6-3.6-4.2-4.5-6.4-2.7-7.1-1-13.8 0-17.3 1.3-4.6 3.1-7.8 6.4-13.5 4-6.9 4.4-5.7 7.1-10.9 3.1-6 3.3-9 7.1-12.2 2.3-1.9 4.6-2.8 5.8-3.2 7.3-2.6 10.8.7 14.7-1.9 3.1-2.1 4.3-6.4 3.8-9.6-.5-3.7-3-5.8-8.3-10.3-15.7-13.1-18-15.2-19.9-19.2-2.5-5.3-2.6-10.3-2.6-12.2 0-4.6 1.5-9.1 4.5-17.9 1.7-5.1 2.6-7.6 3.8-10.3.7-1.4 2.5-5 9.6-14.7 6.4-8.7 8.7-10.9 8.3-14.7-.3-3-2.1-5.1-3.8-7.1-11.3-12.4-16.9-14.3-24.4-23.1-1.4-1.7-6.6-8-10.9-17.3-.8-1.7-2.1-4.5-3.2-8.3-.7-2.3-2.3-8.1-2.6-20.5-.3-11.6-.4-17.4 1.9-23.1 2.5-6.3 6.6-10.9 7.7-12.2 5.4-6.1 8.7-6.5 11.5-12.2.8-1.7 3.5-7.2 1.3-11.5-1.1-2.2-3.1-3.3-7.7-5.1-13.2-5.1-16.9-3.2-20.5-7.1-4.1-4.3-5.3-12.9-1.3-16.7 2.6-2.4 6.8-2 8.3-1.8zm-99.4-4.5c-2.3 14.1-9.5 20.7-14.7 30.8-6.7 12.9-6.9 25.2-7.1 30.8-.3 13.5 3.3 23.6 7.7 35.9 3.7 10.5 5.6 15.7 10.3 20.5 5.2 5.4 9.2 5.9 15.4 13.5 3.4 4.1 6.2 7.6 7.1 12.8 1.4 8.2-2.7 14.8-3.8 16.7-2.7 4.4-6 6.8-10.9 10.3-11.8 8.3-18.6 8.3-21.8 15.4-.6 1.4-.8 3.3-1.3 7.1-.9 7.2-1.8 15 1.3 23.7.9 2.5 3.4 9.2 9.6 14.7 5.4 4.8 8 3.7 20.5 10.3 5.6 3 9.5 5.1 14.1 9 4.7 4 9.5 8.3 11.5 15.4.7 2.3 2.5 8.7-.6 14.1-1.4 2.4-3.6 4.3-14.1 8.3-15.8 6.1-20.4 5.6-23.1 10.3-2.1 3.7-1.5 8-.6 13.5.5 3.5 1.3 8.5 5.1 13.5 5 6.5 11.7 8.3 14.1 9 3.9 1 7.5 2 10.9 0 3.5-2 5.6-6.4 5.1-10.3-.7-5.2-5.9-5.6-6.4-10.3-.6-5.3 5.2-11.6 10.9-12.8 2.7-.6 3 .4 7.7 0 1.2-.1 4.1-.4 10.3-2.6 6-2.1 9-3.1 10.9-4.5 7.2-5.2 8-15.2 8.3-18.6.2-2.1 1.2-13.7-6.4-22.4-3.8-4.4-8.1-6.2-16-9.6-7.7-3.3-9.7-2.7-16.7-6.4-4.5-2.4-3.6-2.7-10.9-7.1-7-4.2-8.8-4.5-12.2-7.7-3.8-3.5-5.7-6.9-6.4-8.3-.9-1.8-2.1-4-2.6-7.1-1.1-7.2 2.4-12.9 3.2-14.1 1.6-2.5 2.5-2.6 9.6-8.3 7-5.6 6.3-5.7 12.8-10.9 7.7-6.2 8.1-5.6 11.5-9 4.4-4.3 8-7.8 9.6-13.5 1.9-6.8-.3-12.7-1.9-17.3-2.5-7-6.4-11.6-9.6-15.4s-6.1-6.3-8.3-8.3c-8.5-7.5-9.9-6.1-13.5-10.3-5.4-6.3-6.2-14.3-7.1-23.1-.3-3.1-.7-7.6 0-13.5 2.4-19.2 14.9-36.2 16.7-38.5.7-1 2.2-2.9 3.2-5.8 2.2-6.4.3-12.4-.6-15.4-1.1-3.6-3.1-9.7-9-14.1-2.3-1.7-8.1-6-14.1-3.8-4.4 1.6-6.4 5.7-7.1 7.1 0 1.4-.2 3.6-.6 6.3z\"/></g>",
        "longHair": "<path fill=\"$[hairColor]\" stroke=\"#000\" stroke-width=\"4\" d=\"M63 243s-11.25 45.2-20 72-22.23 81.18 12 102c17.75 10.8 56.25 13.8 56.25 13.8L308 437s44.75-5.2 52-58c6.01-43.79 6.25-79-32-125\"/><path fill=\"$[hairColor]\" stroke=\"#000\" stroke-width=\"4\" d=\"M341 393s-6.51 32.08-11.25 46.3c-2.5 7.5-7 19.5 1.25 35.7-13.3-2.88-30-22-30-22s-11.7 35.32-44.3 42.32c8-14.8 7.3-34.32 7.3-34.32M55 393s6.51 32.08 11.25 46.3c2.5 7.5 7 19.5-1.25 35.7 13.3-2.88 30-22 30-22s11.7 35.32 44.3 42.32c-8-14.8-7.3-34.32-7.3-34.32\"/>",
        "none": "",
        "shaggy": "<path fill=\"$[hairColor]\" stroke=\"#000\" stroke-width=\"4\" d=\"M59.75 313.8s-8.5 30.69-5.25 60.4c11.25-19.71 25-32.34 25-32.34S64.17 391.7 69.17 416.2c16.5-28 26.66-41.67 26.66-41.67S86.5 427.7 91.5 460.2c18-33 33.67-47.67 33.67-47.67s-14.3 40.12-8.3 75.12c21.5-46 81.38-32.85 81.38-32.85L196 325zm281.5 0s8.5 30.69 5.25 60.4c-11.25-19.71-25-32.34-25-32.34s15.33 49.84 10.33 74.34c-16.5-28-26.66-41.67-26.66-41.67s9.33 53.17 4.33 85.67c-18-33-33.67-47.67-33.67-47.67s14.3 40.12 8.3 75.12c-21.5-46-81.38-32.85-81.38-32.85L205 325z\"/>"
    },
    "head": {
        "female1": "<path fill=\"$[skinColor]\" stroke=\"#000\" stroke-width=\"6\" d=\"M196.8 104.8c9.8-.2 48.8-1.1 82.7 18.6 78.6 45.8 71.1 168.5 70.5 176.9-5.1 68.6-41.1 113.8-57 133.7-24.8 31-53.4 66.8-93 66.3-37.4-.4-63.6-32.7-90-65.3-19.8-24.4-54.9-68.3-60-134.7-4.4-57.2 12.6-143.6 75-178.2 28.9-16 60.6-17 71.8-17.3z\"/>",
        "female2": "<path fill=\"$[skinColor]\" stroke=\"#000\" stroke-width=\"6\" d=\"M196.8 102.9c14.2-.4 66-1.9 105.3 33.1 0 0 52 46.2 47.9 164.3-.3 7.9-.9 15.9-.9 15.9-.7 8.8-1.9 16.5-4.1 34.8-5.6 46.5-9.3 54.3-12 59-10.1 17.8-17.4 12.8-44 39-27.7 27.3-27.5 40.5-48 48-10.2 3.8-19.5 3.8-38 4-19.9.2-30.4.3-42-4-19.5-7.1-19.5-18.2-50-46-26-23.7-29.7-19-39-33-4.5-6.8-9.2-16.3-16-65-2.9-21.1-4.3-28.8-5.1-37.2 0 0-.7-8-.9-15.5-4.5-119.5 56.4-167.9 56.4-167.9 35-28 75.7-29.1 90.4-29.5z\"/>",
        "female3": "<path fill=\"$[skinColor]\" stroke=\"#000\" stroke-width=\"6\" d=\"M200 100.3c10.8.2 55 2 93 33.7 51.3 42.8 54.4 109.2 57 166.3.8 18-.1 33.6-5 50.7-4.2 14.6-13 35.4-40 65-40.6 44.4-67.5 73.8-106 74-43.4.2-74.9-36.7-106-73-26.1-30.5-34.2-54.4-37-64-5.3-18.1-6.4-34.2-6-52.7 1.5-67.5 2.5-114.8 38-153.3 43-46.7 105.4-46.8 112-46.7z\"/>",
        "head1": "<path fill=\"$[skinColor]\" stroke=\"#000\" stroke-width=\"6\" d=\"M200 100c100 0 150 60 150 200 0 70-50 200-150 200S50 370 50 300c0-140 50-200 150-200Z\"/><path fill=\"$[faceShave]\" d=\"M200 410c30 0 50 10 50 10 30 0 90-15 90-120h10c0 70-50 200-150 200S50 370 50 300h10c0 105 60 120 90 120 0 0 20-10 50-10\"/><path fill=\"$[headShave]\" d=\"M60 300H50c0-140 50-200 150-200s150 60 150 200h-10v-10c0-5-10-20-15-25s-5-55-15-65c-40-40-60 0-110 0s-70-40-110 0c-10 10-10 60-15 65s-15 20-15 25z\"/>",
        "head10": "<path fill=\"$[skinColor]\" stroke=\"#000\" stroke-width=\"6\" d=\"M200 100c100 0 150 60 150 200-10 160 0 110-100 190-10 10-30 20-50 10-20 10.9-40 0-50-10-100-80-90-30-100-190 0-140 50-200 150-200Z\"/><path fill=\"$[faceShave]\" d=\"M200 410c30 0 50 10 50 10 30 0 90-15 90-120h10c-10 160 0 110-100 190-10 10-30 20-50 10-20 10-38.96-1.17-50-10-100-80-90-30-100-190h10c0 105 60 120 90 120 0 0 20-10 50-10\"/><path fill=\"$[headShave]\" d=\"M60 300H50c0-140 50-200 150-200s150 60 150 200h-10v-10c0-5-10-20-15-25s-5-55-15-65c-40-40-60 0-110 0s-70-40-110 0c-10 10-10 60-15 65s-15 20-15 25z\"/>",
        "head11": "<path fill=\"$[skinColor]\" stroke=\"#000\" stroke-width=\"6\" d=\"M200 100c100 0 150 60 150 200-10 160-10 110-100 180-10 10-30 20-50 20s-40-10-50-20c-90-70-90-20-100-180 0-140 50-200 150-200Z\"/><path fill=\"$[headShave]\" d=\"M60 300H50c0-140 50-200 150-200s150 60 150 200h-10v-10c0-5-10-20-15-25s-5-55-15-65c-40-40-60 0-110 0s-70-40-110 0c-10 10-10 60-15 65s-15 20-15 25z\"/><path fill=\"$[faceShave]\" d=\"M200 410c30 0 50 10 50 10 30 0 90-15 90-120h10c-10 160-10 110-100 180-11.16 8.68-30 20-50 20s-38.84-11.32-50-20c-90-70-90-20-100-180h10c0 105 60 120 90 120 0 0 20-10 50-10\"/>",
        "head12": "<path fill=\"$[skinColor]\" stroke=\"#000\" stroke-width=\"6\" d=\"M200 100c100 0 150 60 150 200 0 120 0 140-100 180-10 10-30 20-50 20s-40-10-50-20C50 440 50 420 50 300c0-140 50-200 150-200Z\"/><path fill=\"$[headShave]\" d=\"M60 300H50c0-140 50-200 150-200s150 60 150 200h-10v-10c0-5-10-20-15-25s-5-55-15-65c-40-40-60 0-110 0s-70-40-110 0c-10 10-10 60-15 65s-15 20-15 25z\"/><path fill=\"$[faceShave]\" d=\"M200 410c30 0 50 10 50 10 30 0 90-15 90-120h10c0 120 0 140-100 180-13.13 5.25-30 20-50 20s-36.87-14.75-50-20C50 440 50 420 50 300h10c0 105 60 120 90 120 0 0 20-10 50-10\"/>",
        "head13": "<path fill=\"$[skinColor]\" stroke=\"#000\" stroke-width=\"6\" d=\"M200 100c100 0 150 60 150 200 0 120-10 150-110 190 0 0-20 10-40 10s-40-10-40-10C60 450 50 420 50 300c0-140 50-200 150-200Z\"/><path fill=\"$[headShave]\" d=\"M60 300H50c0-140 50-200 150-200s150 60 150 200h-10v-10c0-5-10-20-15-25s-5-55-15-65c-40-40-60 0-110 0s-70-40-110 0c-10 10-10 60-15 65s-15 20-15 25z\"/><path fill=\"$[faceShave]\" d=\"M200 410c30 0 50 10 50 10 30 0 90-15 90-120h10c0 120-10 150-110 190 0 0-20 10-40 10s-40-10-40-10C60 450 50 420 50 300h10c0 105 60 120 90 120 0 0 20-10 50-10\"/>",
        "head14": "<path fill=\"$[skinColor]\" stroke=\"#000\" stroke-width=\"6\" d=\"M200 100c100 0 150 60 150 200 0 150-80 160-110 190-10 10-20 10-40 10s-30 0-40-10c-30-30-110-40-110-190 0-140 50-200 150-200Z\"/><path fill=\"$[headShave]\" d=\"M60 300H50c0-140 50-200 150-200s150 60 150 200h-10v-10c0-5-10-20-15-25s-5-55-15-65c-40-40-60 0-110 0s-70-40-110 0c-10 10-10 60-15 65s-15 20-15 25z\"/><path fill=\"$[faceShave]\" d=\"M200 410c30 0 50 10 50 10 30 0 90-15 90-120h10c0 150-80 160-110 190-10 10-20 10-40 10s-29.88-.12-40-10c-30-29.31-110-40-110-190h10c0 105 60 120 90 120 0 0 20-10 50-10\"/>",
        "head15": "<path fill=\"$[skinColor]\" stroke=\"#000\" stroke-width=\"6\" d=\"M200 100c100 0 150 60 150 200-20 180-10 140-90 180-30 10-40 20-60 20s-30-10-60-20c-80-40-70 0-90-180 0-140 50-200 150-200Z\"/><path fill=\"$[headShave]\" d=\"M60 300H50c0-140 50-200 150-200s150 60 150 200h-10v-10c0-5-10-20-15-25s-5-55-15-65c-40-40-60 0-110 0s-70-40-110 0c-10 10-10 60-15 65s-15 20-15 25z\"/><path fill=\"$[faceShave]\" d=\"M200 410c30 0 50 10 50 10 30 0 90-15 90-120h10c-20 180.69-10 140-90 180-30 10-40 20-60 20s-30-10-60-20c-80-40-70 0-90-180h10c0 105 60 120 90 120 0 0 20-10 50-10\"/>",
        "head16": "<path fill=\"$[skinColor]\" stroke=\"#000\" stroke-width=\"6\" d=\"M200 100c100 0 150 60 150 200 0 0-20 105-20 135s-110 65-130 65-130-35-130-65-20-135-20-135c0-140 50-200 150-200Z\"/><path fill=\"$[headShave]\" d=\"M60 300H50c0-140 50-200 150-200s150 60 150 200h-10v-10c0-5-10-20-15-25s-5-55-15-65c-40-40-60 0-110 0s-70-40-110 0c-10 10-10 60-15 65s-15 20-15 25z\"/><path fill=\"$[faceShave]\" d=\"M200 410c30 0 50 10 50 10 30 0 90-15 90-120h10s-20 105-20 135-110 65-130 65-130-35-130-65-20-135-20-135h10c0 105 60 120 90 120 0 0 20-10 50-10\"/>",
        "head17": "<path fill=\"$[skinColor]\" stroke=\"#000\" stroke-width=\"6\" d=\"M200 100c100 0 150 60 150 200 0 0-5.15 110.6-10 130-5 20-60 70-140 70S65 450 60 430c-4.85-19.4-10-130-10-130 0-140 50-200 150-200Z\"/><path fill=\"$[headShave]\" d=\"M60 300H50c0-140 50-200 150-200s150 60 150 200h-10v-10c0-5-10-20-15-25s-5-55-15-65c-40-40-60 0-110 0s-70-40-110 0c-10 10-10 60-15 65s-15 20-15 25z\"/><path fill=\"$[faceShave]\" d=\"M200 410c30 0 50 10 50 10 30 0 90-15 90-120h10s0 80-10 130c-5 20-60 70-140 70S65 450 60 430c-10-50-10-130-10-130h10c0 105 60 120 90 120 0 0 20-10 50-10\"/>",
        "head18": "<path fill=\"$[skinColor]\" stroke=\"#000\" stroke-width=\"6\" d=\"M200 100c100 0 150 60 150 200 0 0-20 105-20 135s-60 45-80 55-10 15-50 5c-40 10-30 5-50-5s-80-25-80-55-20-135-20-135c0-140 50-200 150-200Z\"/><path fill=\"$[headShave]\" d=\"M60 300H50c0-140 50-200 150-200s150 60 150 200h-10v-10c0-5-10-20-15-25s-5-55-15-65c-40-40-60 0-110 0s-70-40-110 0c-10 10-10 60-15 65s-15 20-15 25z\"/><path fill=\"$[faceShave]\" d=\"M200 410c30 0 50 10 50 10 30 0 90-15 90-120h10s-20 105-20 135-60 45-80 55-10 15-50 5c-40 10-30 5-50-5s-80-25-80-55-20-135-20-135h10c0 105 60 120 90 120 0 0 20-10 50-10\"/>",
        "head2": "<path fill=\"$[skinColor]\" stroke=\"#000\" stroke-width=\"6\" d=\"M200 100c100 0 150 60 150 200 0 70-30 120-40 130l-60 60s-20 10-50 10-50-10-50-10l-60-60c-10-10-40-60-40-130 0-140 50-200 150-200Z\"/><path fill=\"$[faceShave]\" d=\"M200 410c30 0 50 10 50 10 30 0 90-15 90-120h10c0 70-30 120-40 130l-60 60s-20 10-50 10-50-10-50-10l-60-60c-10-10-40-60-40-130h10c0 105 60 120 90 120 0 0 20-10 50-10\"/><path fill=\"$[headShave]\" d=\"M60 300H50c0-140 50-200 150-200s150 60 150 200h-10v-10c0-5-10-20-15-25s-5-55-15-65c-40-40-60 0-110 0s-70-40-110 0c-10 10-10 60-15 65s-15 20-15 25z\"/>",
        "head3": "<path fill=\"$[skinColor]\" stroke=\"#000\" stroke-width=\"6\" d=\"M200 100c100 0 150 60 150 200 0 20-20 130-20 130l-80 50c-20 20-40 20-50 20s-30 0-50-20l-80-50S50 320 50 300c0-140 50-200 150-200Z\"/><path fill=\"$[faceShave]\" d=\"M200 410c30 0 50 10 50 10 30 0 90-15 90-120h10c0 20-20 130-20 130l-80 50c-20 20-40 20-50 20s-30 0-50-20l-80-50S50 320 50 300h10c0 105 60 120 90 120 0 0 20-10 50-10\"/><path fill=\"$[headShave]\" d=\"M60 300H50c0-140 50-200 150-200s150 60 150 200h-10v-10c0-5-10-20-15-25s-5-55-15-65c-40-40-60 0-110 0s-70-40-110 0c-10 10-10 60-15 65s-15 20-15 25z\"/>",
        "head4": "<path fill=\"$[skinColor]\" stroke=\"#000\" stroke-width=\"6\" d=\"M200 100c100 0 150 60 150 200 0 70-10 90-30 130-10 20-60 50-70 60-20 20-20 10-50 10s-30 10-50-10c-10-10-60-40-70-60-20-40-30-60-30-130 0-140 50-200 150-200Z\"/><path fill=\"$[faceShave]\" d=\"M200 410c30 0 50 10 50 10 30 0 90-15 90-120h10c0 70-10 90-30 130-10 20-60 50-70 60-20 20-20 10-50 10s-30 10-50-10c-10-10-60-40-70-60-20-40-30-60-30-130h10c0 105 60 120 90 120 0 0 20-10 50-10\"/><path fill=\"$[headShave]\" d=\"M60 300H50c0-140 50-200 150-200s150 60 150 200h-10v-10c0-5-10-20-15-25s-5-55-15-65c-40-40-60 0-110 0s-70-40-110 0c-10 10-10 60-15 65s-15 20-15 25z\"/>",
        "head5": "<path fill=\"$[skinColor]\" stroke=\"#000\" stroke-width=\"6\" d=\"M200 100c100 0 150 60 150 200 0 50-.51 71.54-10 100-10 30-80 70-90 80s-20 20-50 20-40-10-50-20-80-50-90-80c-9.49-28.46-10-50-10-100 0-140 50-200 150-200Z\"/><path fill=\"$[faceShave]\" d=\"M200 410c30 0 50 10 50 10 30 0 90-15 90-120h10c0 50-.51 71.54-10 100-10 30-80 70-90 80s-20 20-50 20-40-10-50-20-80-50-90-80c-9.49-28.46-10-50-10-100h10c0 105 60 120 90 120 0 0 20-10 50-10\"/><path fill=\"$[headShave]\" d=\"M60 300H50c0-140 50-200 150-200s150 60 150 200h-10v-10c0-5-10-20-15-25s-5-55-15-65c-40-40-60 0-110 0s-70-40-110 0c-10 10-10 60-15 65s-15 20-15 25z\"/>",
        "head6": "<path fill=\"$[skinColor]\" stroke=\"#000\" stroke-width=\"6\" d=\"M200 100c100 0 150 60 150 200 0 70-30 150-40 160s-60 40-110 40-100-30-110-40-40-90-40-160c0-140 50-200 150-200Z\"/><path fill=\"$[faceShave]\" d=\"M200 410c30 0 50 10 50 10 30 0 90-15 90-120h10c0 70-30 150-40 160s-60 40-110 40-100-30-110-40-40-90-40-160h10c0 105 60 120 90 120 0 0 20-10 50-10\"/><path fill=\"$[headShave]\" d=\"M60 300H50c0-140 50-200 150-200s150 60 150 200h-10v-10c0-5-10-20-15-25s-5-55-15-65c-40-40-60 0-110 0s-70-40-110 0c-10 10-10 60-15 65s-15 20-15 25z\"/>",
        "head7": "<path fill=\"$[skinColor]\" stroke=\"#000\" stroke-width=\"6\" d=\"M200 100c100 0 150 60 150 200 0 20-20 120-25 130-4.47 8.94-105 70-105 70h-40s-98.29-56.58-105-70c-5-10-25-110-25-130 0-140 50-200 150-200Z\"/><path fill=\"$[faceShave]\" d=\"M200 410c30 0 50 10 50 10 30 0 90-15 90-120h10c0 20-20 120-25 130-4.47 8.94-105 70-105 70h-40s-98.29-56.58-105-70c-5-10-25-110-25-130h10c0 105 60 120 90 120 0 0 20-10 50-10\"/><path fill=\"$[headShave]\" d=\"M60 300H50c0-140 50-200 150-200s150 60 150 200h-10v-10c0-5-10-20-15-25s-5-55-15-65c-40-40-60 0-110 0s-70-40-110 0c-10 10-10 60-15 65s-15 20-15 25z\"/>",
        "head8": "<path fill=\"$[skinColor]\" stroke=\"#000\" stroke-width=\"6\" d=\"M200 100c100 0 150 60 150 200 0 20-5 100-25 130-10 20-45 50-85 55-5 5-15 15-40 15s-35-10-40-15c-35-5-75-35-85-55-20-30-25-110-25-130 0-140 50-200 150-200Z\"/><path fill=\"$[faceShave]\" d=\"M200 410c30 0 50 10 50 10 30 0 90-15 90-120h10c0 20-5 100-25 130-10 20-45 50-85 55-5 5-15 15-40 15s-35-10-40-15c-35-5-75-35-85-55-20-30-25-110-25-130h10c0 105 60 120 90 120 0 0 20-10 50-10\"/><path fill=\"$[headShave]\" d=\"M60 300H50c0-140 50-200 150-200s150 60 150 200h-10v-10c0-5-10-20-15-25s-5-55-15-65c-40-40-60 0-110 0s-70-40-110 0c-10 10-10 60-15 65s-15 20-15 25z\"/>",
        "head9": "<path fill=\"$[skinColor]\" stroke=\"#000\" stroke-width=\"6\" d=\"M200 100c100 0 150 60 150 200 0 160-80 170-100 190-10 10-30 20-50 10-20 10.9-40 0-50-10-20-20-100-30-100-190 0-140 50-200 150-200Z\"/><path fill=\"$[headShave]\" d=\"M60 300H50c0-140 50-200 150-200s150 60 150 200h-10v-10c0-5-10-20-15-25s-5-55-15-65c-40-40-60 0-110 0s-70-40-110 0c-10 10-10 60-15 65s-15 20-15 25z\"/><path fill=\"$[faceShave]\" d=\"M200 410c30 0 50 10 50 10 30 0 90-15 90-120h10c0 160-80 170-100 190-10 10-30 20-50 10-20 10-40 0-50-10-20-20-100-30-100-190h10c0 105 60 120 90 120 0 0 20-10 50-10\"/>"
    },
    "jersey": {
        "baseball": "<g stroke=\"#000\"><path fill=\"$[secondary]\" stroke-width=\"3\" d=\"M120 505s35 40 80 40 80-40 80-40v95H120z\"/><path fill=\"$[primary]\" stroke-width=\"6\" d=\"M120 504.6c10 45.4 80 55.4 90 65.4s10 40 10 40H-5s5-40 5-50 10-30 40-40 50 0 80-15.4z\"/><path fill=\"$[primary]\" stroke-width=\"6\" d=\"M360 520c30 10 40 30 40 40s10 50 10 50H180s0-40 10-50 80-10 90-55c30 15 50 5 80 15z\"/><path fill=\"$[primary]\" stroke-width=\"1.5\" d=\"M196 597c-2.8 0-5-2.2-5-5s2.2-5 5-5 5 2.2 5 5-2.2 5-5 5zm-2-5h1m2 0h1\"/></g><g fill=\"none\" stroke=\"#000\" stroke-width=\"6\"><path d=\"M120 504.6c6.9 37.6 62.2 49.3 67.9 57-7.8 11.2-8 48.4-8 48.4H-5s5-40 5-50 10-30 40-40 50 0 80-15.4z\"/><path d=\"M360 520c30 10 40 30 40 40s10 50 10 50H180s0-40 10-50 80-10 90-55c30 15 50 5 80 15z\"/></g>",
        "baseball2": "<g stroke=\"#000\"><path fill=\"$[accent]\" stroke-width=\"3\" d=\"M120 505s35 40 80 40 80-40 80-40v95H120z\"/><path fill=\"$[primary]\" stroke-width=\"6\" d=\"M120 504.6c10 45.4 80 55.4 90 65.4s10 40 10 40H-5s5-40 5-50 10-30 40-40 50 0 80-15.4z\"/><path fill=\"$[primary]\" stroke-width=\"6\" d=\"M360 520c30 10 40 30 40 40s10 50 10 50H180s0-40 10-50 80-10 90-55c30 15 50 5 80 15z\"/><path fill=\"$[primary]\" stroke-width=\"1.5\" d=\"M196 597c-2.8 0-5-2.2-5-5s2.2-5 5-5 5 2.2 5 5-2.2 5-5 5zm-2-5h1m2 0h1\"/></g><path stroke=\"#000\" d=\"M293.8 513c.6 0 1.2.6 1.2 1.2 0 .7-1.5 4.4-3.4 8.3-1.9 3.8-5.4 9-7.8 11.3-2.4 2.4-7 5.9-10.3 7.7-3.3 1.9-10.3 5.3-15.5 7.5-5.2 2.3-13.8 5.8-19 7.7-5.2 2-11.3 4.8-13.5 6.3s-5.7 4.7-7.8 7.1c-2.2 2.5-4.4 6.5-5.2 9.4-.8 2.7-1.8 10.1-2.2 16.3-.5 6.7-1.2 11.1-1.8 10.9-.6-.3-.9-4.8-.7-11.8.2-7.2.9-13.4 2-16.9 1.2-3.8 3.2-7.2 6.8-11 2.8-3 7.8-6.9 11-8.6 3.2-1.8 7.7-3.7 9.9-4.4s7.8-2.8 12.5-4.7c4.7-2 13-5.8 18.4-8.7 6.8-3.5 11.2-6.5 14-9.7 2.3-2.5 5.4-7.5 7.1-11.2 1.6-3.6 3.6-6.7 4.2-6.7zm6.4 1c1.1 0 1.9.7 1.9 1.7s-1.7 5.4-3.9 9.8c-2.3 4.6-6 10-8.8 12.9-2.6 2.6-7.7 6.5-11.3 8.6s-10.6 5.6-15.5 7.8c-5 2.2-13.4 5.6-18.8 7.6-5.3 2-11.4 4.7-13.5 5.9-2 1.3-5.2 4-7 6-1.7 2.1-3.6 5.4-4.1 7.4-.5 2.1-1.2 8.6-1.5 14.5-.6 9.9-.8 10.8-2.6 10.8-1.9 0-2-.5-1.4-10.8.3-5.9 1.2-13.1 2-16 1-3.9 2.6-6.4 6.1-9.8 2.7-2.6 6.4-5.5 8.3-6.4 1.9-1 10-4.4 18-7.5s18.3-7.6 23-10 10.3-5.9 12.5-7.8c2.2-1.8 5.9-6.2 8.2-9.8 2.3-3.5 4.7-8.3 5.4-10.7.8-3.1 1.6-4.2 3-4.2zm6.9 1c1.1 0 2 .7 2 1.5s-2.1 5.7-4.7 10.7c-3.4 6.9-6.4 11-11.2 15.8-4.8 4.7-9.3 7.9-16.6 11.7-5.5 2.8-15 7.1-21 9.6-6.1 2.4-13.3 5.2-16 6.2-2.8 1.1-6.9 3.7-9.3 5.9-2.5 2.4-4.7 5.6-5.3 7.6-.5 1.9-.9 5.7-.9 8.5 0 2.7-.3 7.1-.7 9.8-.5 2.7-1.3 4.7-2.1 4.7-.9 0-1.1-2.4-.6-10.3.3-5.6 1.1-11.8 1.6-13.7.6-1.9 2-4.6 3.1-6 1-1.4 3.6-3.7 5.6-5.1 2-1.5 9.2-4.8 16.1-7.4s16.5-6.7 21.5-9.1c4.9-2.3 11.8-6.1 15.2-8.3 3.5-2.3 8.2-6.5 10.4-9.4 2.3-2.8 5.7-8.4 7.6-12.2 1.8-3.9 3.3-7.8 3.3-8.8s.8-1.7 2-1.7zm-196.8-5c.7 0 2.2 1.9 3.2 4.2 1.1 2.4 3.8 7.4 6 11.2 2.3 3.8 6.3 9.2 9.1 11.9s9.9 8.4 16 12.7c6 4.3 13.2 9.8 15.9 12.2 3.3 2.9 5.9 6.4 7.9 10.8 2.7 5.9 3 7.8 3.6 20.3.6 12.6.5 13.7-1.2 13.7-1.5 0-1.7-1.1-1.7-9.8 0-5.3-.4-12.2-1-15.2s-2-7.3-3.1-9.5-3.5-5.5-5.2-7.3c-1.8-1.8-7.5-6.2-12.7-9.7s-12.5-8.8-16.3-11.9c-3.7-3.1-8.4-8.2-10.6-11.4-2.1-3.1-5.2-8.4-6.8-11.7-1.7-3.3-3.4-7-3.8-8.3-.5-1.5-.3-2.2.7-2.2zm-5 1c.4 0 3 4.8 5.7 10.7 3.6 8.2 6.3 12.4 10.7 17.2 3.3 3.5 10.6 9.8 16.4 14s11.6 8.4 13 9.2c1.4.9 4 3.1 5.9 5s4.5 5.6 5.8 8.4c1.8 4 2.4 7.6 3.8 31.5h-2.3c-2.1 0-2.2-.3-2.5-12.3-.3-10-.7-13.1-2.6-17.2-1.2-2.8-3.2-6.1-4.4-7.4-1.2-1.2-6.7-5.4-12.2-9.1-5.5-3.8-13.2-9.6-17-12.8-3.9-3.3-9-8.8-11.5-12.3-2.4-3.5-6.2-10.2-8.3-14.9-3.1-6.7-3.6-8.7-2.5-9.2.7-.4 1.6-.8 2-.8zm-7.5 3c.5-.1 3.5 5.2 6.8 11.7 4.3 8.5 7.7 13.6 12 18.2 3.3 3.5 9.4 9 13.5 12.1s10.8 7.9 14.8 10.6 8.4 6.6 9.8 8.6c1.7 2.7 2.7 6.2 3.4 12 .5 4.6 1 10.9 1 14 0 4-.4 5.8-1.3 5.8-.8 0-1.4-3.5-2-12-.4-6.6-1.3-13.4-2.1-15.3-.8-1.7-2.1-3.9-2.8-4.7-.7-.9-6.4-5.1-12.7-9.5s-14.8-11.2-18.9-15c-4.1-3.9-9.3-9.7-11.5-13s-5.6-9.2-7.4-13c-1.8-3.9-3.3-7.8-3.3-8.8 0-.9.3-1.7.7-1.7z\"/><path fill=\"$[secondary]\" stroke=\"$[secondary]\" d=\"M296.4 513c.9 0 1.2 1 1 3.2-.3 1.8-1.7 5.8-3.2 8.8s-5.2 7.9-8.2 11c-3.7 3.8-8.5 7.1-14.5 10.2-5 2.6-15.5 7.2-23.5 10.3s-16.1 6.5-18 7.5c-1.9.9-5.6 3.8-8.3 6.4-3.5 3.4-5.1 5.9-6.1 9.8-.8 2.9-1.7 10.1-2 16-.5 9.4-.8 10.8-2.4 10.8s-1.6-.9-.9-11.2c.4-6.2 1.4-13.6 2.2-16.3.8-2.9 3-6.9 5.2-9.4 2.1-2.4 5.6-5.6 7.8-7.1s8.3-4.3 13.5-6.3c5.2-1.9 13.8-5.4 19-7.7 5.2-2.2 12.2-5.6 15.5-7.5 3.3-1.8 7.9-5.3 10.3-7.7 2.4-2.3 5.9-7.5 7.8-11.3 1.9-3.9 3.4-7.6 3.4-8.3 0-.6.6-1.2 1.4-1.2zm7.1 1c.9 0 1.5.9 1.5 2.2s-1.5 5.4-3.3 9.3c-1.9 3.8-5.3 9.4-7.6 12.2-2.2 2.9-6.9 7.1-10.4 9.4-3.4 2.2-10.3 6-15.2 8.3-5 2.4-14.6 6.5-21.5 9.1s-14.1 5.9-16.1 7.4c-2 1.4-4.6 3.7-5.6 5.1-1.1 1.4-2.5 4.1-3.2 6-.6 1.9-1.1 6-1.1 9s-.3 7.6-.7 10.3c-.5 2.7-1.3 4.7-2.1 4.7-.9 0-1.1-2.5-.6-10.8.3-5.9 1-12.4 1.5-14.5.5-2 2.4-5.3 4.1-7.4 1.8-2 5-4.7 7-6 2.1-1.2 8.2-3.9 13.6-5.9 5.3-2 13.7-5.4 18.7-7.6 4.9-2.2 11.9-5.7 15.5-7.8s8.7-6 11.3-8.6c2.8-2.9 6.5-8.3 8.8-12.9 2.2-4.4 3.9-8.8 3.9-9.8 0-.9.7-1.7 1.5-1.7zm-196.3-4c.7 0 2.6 3 4.3 6.7 1.6 3.8 5.1 10.1 7.7 14 2.9 4.4 7.5 9.5 11.5 12.9 3.8 3.1 11.1 8.4 16.3 11.9s10.9 7.9 12.7 9.7c1.7 1.8 4.1 5.1 5.2 7.3s2.5 6.5 3.1 9.5 1 9.9 1 15.2c0 7.2-.3 9.8-1.3 9.8-.8 0-1.4-3.7-2-13.2-.6-10.7-1.2-14.3-3-18.3-1.3-2.8-3.9-6.5-5.8-8.4s-4.5-4.1-5.9-5c-1.4-.8-7.2-5-13-9.2s-13.1-10.5-16.4-14c-3.8-4.1-7.6-9.9-10.7-16.2-2.7-5.3-4.9-10.4-4.9-11.2s.6-1.5 1.2-1.5zm-1.7 10.8c2.2 4.8 6.1 11.6 8.5 15.1 2.5 3.5 7.6 9 11.5 12.3 3.8 3.2 11.5 9 17 12.8 5.5 3.7 11 7.9 12.2 9.1 1.2 1.3 3.2 4.6 4.4 7.4 1.9 4.1 2.3 7.2 2.6 17.2.3 10.4.1 12.3-1.2 12.3-1.2 0-1.5-1.3-1.5-5.8 0-3.1-.5-9.4-1-14-.7-5.8-1.7-9.3-3.4-12-1.4-2-5.8-5.9-9.8-8.6s-10.7-7.5-14.8-10.6-10.2-8.6-13.5-12.1c-4.4-4.6-7.7-9.7-12-18.2-4.9-9.7-5.7-12-4.6-12.7 1.2-.7 2.4 1 5.6 7.8z\"/><g fill=\"none\" stroke=\"#000\" stroke-width=\"6\"><path d=\"M120 504.6c6.9 37.6 62.2 49.3 67.9 57-7.8 11.2-8 48.4-8 48.4H-5s5-40 5-50 10-30 40-40 50 0 80-15.4z\"/><path d=\"M360 520c30 10 40 30 40 40s10 50 10 50H180s0-40 10-50 80-10 90-55c30 15 50 5 80 15z\"/></g>",
        "baseball3": "<g stroke=\"#000\"><path fill=\"$[accent]\" stroke-width=\"3\" d=\"M120 505s35 40 80 40 80-40 80-40v95H120z\"/><path fill=\"$[primary]\" stroke-width=\"6\" d=\"M120 504.6c10 45.4 80 55.4 90 65.4s10 40 10 40H-5s5-40 5-50 10-30 40-40 50 0 80-15.4z\"/><path fill=\"$[primary]\" stroke-width=\"6\" d=\"M360 520c30 10 40 30 40 40s10 50 10 50H180s0-40 10-50 80-10 90-55c30 15 50 5 80 15z\"/><path fill=\"$[accent]\" stroke-width=\"1.5\" d=\"M196 597c-2.8 0-5-2.2-5-5s2.2-5 5-5 5 2.2 5 5-2.2 5-5 5zm-2-5h1m2 0h1\"/></g><path fill=\"none\" stroke=\"$[secondary]\" stroke-width=\"5\" d=\"M10 540v70m20-86v86m20-93v93m20-95v95m20-96v96m20-100v100m20-83v83m20-66v66m20-57v57m220-70v70m-20-86v86m-20-93v93m-20-95v95m-20-96v96m-20-101v101m-20-86v87m-20-72v71m-20-63v62m-20-57v57\"/><g fill=\"none\" stroke=\"#000\" stroke-width=\"6\"><path d=\"M120 504.6c6.9 37.6 62.2 49.3 67.9 57-7.8 11.2-8 48.4-8 48.4H-5s5-40 5-50 10-30 40-40 50 0 80-15.4z\"/><path d=\"M360 520c30 10 40 30 40 40s10 50 10 50H180s0-40 10-50 80-10 90-55c30 15 50 5 80 15z\"/></g>",
        "baseball4": "<g stroke=\"#000\"><path fill=\"$[accent]\" stroke-width=\"3\" d=\"M120 505s35 40 80 40 80-40 80-40v95H120z\"/><path fill=\"$[secondary]\" stroke-width=\"6\" d=\"M120 504.6c10 45.4 80 55.4 90 65.4s10 40 10 40H-5s5-40 5-50 10-30 40-40 50 0 80-15.4z\"/><path fill=\"$[secondary]\" stroke-width=\"6\" d=\"M360 520c30 10 40 30 40 40s10 50 10 50H180s0-40 10-50 80-10 90-55c30 15 50 5 80 15z\"/><path fill=\"$[primary]\" stroke-width=\"1.5\" d=\"M196 597c-2.8 0-5-2.2-5-5s2.2-5 5-5 5 2.2 5 5-2.2 5-5 5zm-2-5h1m2 0h1\"/></g><g fill=\"none\" stroke=\"#000\" stroke-width=\"6\"><path d=\"M120 504.6c6.9 37.6 62.2 49.3 67.9 57-7.8 11.2-8 48.4-8 48.4H-5s5-40 5-50 10-30 40-40 50 0 80-15.4z\"/><path d=\"M360 520c30 10 40 30 40 40s10 50 10 50H180s0-40 10-50 80-10 90-55c30 15 50 5 80 15z\"/></g>",
        "football": "<g stroke=\"#000\"><path fill=\"$[primary]\" stroke-width=\"6\" d=\"M120 505c0 35 50 25 80 45 30-20 80-10 80-45 30-25 90-15 100-5s10.07 20.41 15 50c5 30 5 20 5 60H0c0-40 0-29.59 5-59.59 4.93-29.59 5-39.38 15-50.41 9.5-10.48 70-20 100 5Z\"/><path fill=\"$[secondary]\" stroke-width=\"2\" d=\"M120 505c0 35 50 25 80 45 30-20 80-10 80-45l15-10c5 60-55 45-95 75-40-30-100-15-95-75z\"/><path fill=\"none\" stroke-width=\"6\" d=\"M120 505c0 35 50 25 80 45 30-20 80-10 80-45 30-25 90-15 100-5s10.07 20.41 15 50c5 30 5 20 5 60H0c0-40 0-30 5-60 4.93-29.59 5-38.97 15-50 9.5-10.48 70-20 100 5Z\"/><path fill=\"none\" stroke-width=\"2\" d=\"M19.5 570s72.5-2.11 81.5-20m280 20s-71-2.11-80-20\"/></g>",
        "football2": "<path fill=\"$[primary]\" stroke=\"#000\" stroke-width=\"6\" d=\"M120 505c0 35 50 25 80 45 30-20 80-10 80-45 30-25 90-15 100-5s10.07 20.41 15 50c5 30 5 20 5 60H0c0-40 0-29.59 5-59.59 4.93-29.59 5-39.38 15-50.41 9.5-10.48 70-20 100 5Z\"/><path fill=\"$[secondary]\" stroke=\"#000\" stroke-width=\"2\" d=\"M120 505c0 35 50 25 80 45 30-20 80-10 80-45l15-10c5 60-55 45-95 75-40-30-100-15-95-75zm-100-5 15 80 5-88.8-10 3.07zm360 0-15 80-5-88.8 10 3.07z\"/><path fill=\"none\" stroke=\"#000\" stroke-width=\"6\" d=\"M120 505c0 35 50 25 80 45 30-20 80-10 80-45 30-25 90-15 100-5s10.07 20.41 15 50c5 30 5 20 5 60H0c0-40 0-30 5-60 4.93-29.59 5-38.97 15-50 9.5-10.48 70-20 100 5Z\"/><path fill=\"none\" stroke=\"#000\" stroke-width=\"2\" d=\"M19.5 570s72.5-2.11 81.5-20m280 20s-71-2.11-80-20\"/>",
        "football3": "<g stroke=\"#000\"><path fill=\"$[primary]\" stroke-width=\"6\" d=\"M120 505c0 35 50 25 80 45 30-20 80-10 80-45 30-25 90-15 100-5s10.07 20.41 15 50c5 30 5 20 5 60H0c0-40 0-29.59 5-59.59 4.93-29.59 5-39.38 15-50.41 9.5-10.48 70-20 100 5Z\"/><path fill=\"$[secondary]\" stroke-width=\"2\" d=\"M120 505c0 35 50 25 80 45 30-20 80-10 80-45l15-10c5 60-55 45-95 75-40-30-100-15-95-75z\"/><g stroke-width=\"2\"><path fill=\"$[secondary]\" d=\"m55 490-25 5-10 5v80h35zm290 0 25 5 10 5v80h-35z\"/><path fill=\"$[accent]\" d=\"m30 495 15-3.14V580H30zm340 0-15-3.14V580h15z\"/></g><path fill=\"none\" stroke-width=\"6\" d=\"M120 505c0 35 50 25 80 45 30-20 80-10 80-45 30-25 90-15 100-5s10.07 20.41 15 50c5 30 5 20 5 60H0c0-40 0-30 5-60 4.93-29.59 5-38.97 15-50 9.5-10.48 70-20 100 5Z\"/><path fill=\"none\" stroke-width=\"2\" d=\"M19.5 570s72.5-2.11 81.5-20m280 20s-71-2.11-80-20\"/></g>",
        "football4": "<path fill=\"$[primary]\" stroke=\"#000\" stroke-width=\"6\" d=\"M120 505c0 35 50 25 80 45 30-20 80-10 80-45 30-25 90-15 100-5s10.07 20.41 15 50c5 30 5 20 5 60H0c0-40 0-29.59 5-59.59 4.93-29.59 5-39.38 15-50.41 9.5-10.48 70-20 100 5Z\"/><path fill=\"$[secondary]\" stroke=\"#000\" stroke-width=\"2\" d=\"M120 505c0 35 50 25 80 45 30-20 80-10 80-45l15-10c5 60-55 45-95 75-40-30-100-15-95-75zm0 35c-40 26.67-60 80-60 80h40s0-53.33 20-80Zm160 0c40 26.67 60 80 60 80h-40s0-53.33-20-80Z\"/><path fill=\"none\" stroke=\"#000\" stroke-width=\"6\" d=\"M120 505c0 35 50 25 80 45 30-20 80-10 80-45 30-25 90-15 100-5s10.07 20.41 15 50c5 30 5 20 5 60H0c0-40 0-30 5-60 4.93-29.59 5-38.97 15-50 9.5-10.48 70-20 100 5Z\"/><path fill=\"none\" stroke=\"#000\" stroke-width=\"2\" d=\"M19.5 570s72.5-2.11 81.5-20m280 20s-71-2.11-80-20\"/>",
        "football5": "<path d=\"M120 505c0 35 50 25 80 45 30-20 80-10 80-45 30-25 90-15 100-5s10.07 20.41 15 50c5 30 5 20 5 60H0c0-40 0-29.59 5-59.59 4.93-29.59 5-39.38 15-50.41 9.5-10.48 70-20 100 5Z\" style=\"fill:#fff;fill-rule:nonzero;stroke:#000;stroke-width:6px\"/><path d=\"M388.812 518.932c-.419-3.338 2.794 10.698 6.188 31.068 5 30 5 20 5 60h-57.163z\" style=\"fill:$[primary]\" transform=\"matrix(-1 0 0 1 400.837 0)\"/><path d=\"M388.812 518.932c-.419-3.338 2.794 10.698 6.188 31.068 5 30 5 20 5 60h-57.163z\" style=\"fill:$[primary]\"/><path d=\"M28.441 497.904 57.812 610.86l-46.409-91.928c1.742-13.878 7.068-21.504 17.038-21.028\" style=\"fill:$[secondary];stroke:#000;stroke-width:1px;stroke-linecap:round;stroke-linejoin:round;stroke-miterlimit:1.5\"/><path d=\"M28.441 497.904 57.812 610.86l-46.409-91.928c1.742-13.878 7.068-21.504 17.038-21.028\" style=\"fill:$[secondary];stroke:#000;stroke-width:1px;stroke-linecap:round;stroke-linejoin:round;stroke-miterlimit:1.5\" transform=\"matrix(-1 0 0 1 400.215 0)\"/><path d=\"M120 505c0 35 50 25 80 45 30-20 80-10 80-45l15-10c5 60-55 45-95 75-40-30-100-15-95-75z\" style=\"fill:$[primary];fill-rule:nonzero;stroke:#000;stroke-width:2px\"/><path d=\"M120 505c0 35 50 25 80 45 30-20 80-10 80-45 30-25 90-15 100-5s10.07 20.41 15 50c5 30 5 20 5 60H0c0-40 0-30 5-60 4.93-29.59 5-38.97 15-50 9.5-10.48 70-20 100 5Z\" style=\"fill:none;fill-rule:nonzero;stroke:#000;stroke-width:6px\"/><path d=\"M19.5 570s72.5-2.11 81.5-20m280 20s-71-2.11-80-20\" style=\"fill:none;fill-rule:nonzero;stroke:#000;stroke-width:2px\"/>",
        "hockey": "<g stroke=\"#000\"><path fill=\"$[primary]\" stroke-width=\"6\" d=\"M120 505c0 20 50 15 80 35 30-20 80-15 80-35 0 0 50-5 80 5 0 0 20 10 30 40s10 60 10 60H0s0-30 10-60 30-40 30-40c30-10 80-5 80-5Z\"/><path fill=\"$[accent]\" d=\"M4.5 577.03S10 580 20 580c30-15 110-20 180-20 90 0 150 5 180 20 10 0 17-2.97 17-2.97l1 12.97s-8 5-18 5c-40-20-110-22.48-180-22.48-80 0-150 2.48-180 22.48-10 0-18-5-18-5z\"/><path fill=\"$[secondary]\" stroke-width=\"2\" d=\"M172.5 545.53c-110-4.5-152 22.5-152 22.5s-9 1-14.5-5c15-48 34-53.03 34-53.03s50-5 80-5c0 20 52.5 40.53 52.5 40.53Zm55 0c110-4.5 152 22.5 152 22.5s9 1 14.5-5c-15-48-34-53.03-34-53.03s-50-5-80-5c0 20-52.5 40.53-52.5 40.53Z\"/><path fill=\"$[accent]\" stroke-width=\"2\" d=\"M120 505c0 20 50 15 80 30 30-15 80-10 80-30l15-1c0 41-40 21-95 56-55-35-95-15-95-56z\"/><path fill=\"none\" stroke-width=\"6\" d=\"M120 505c0 20 50 15 80 35 30-20 80-15 80-35 0 0 50-5 80 5 0 0 20 10 30 40s10 60 10 60H0s0-30 10-60 30-40 30-40c30-10 80-5 80-5Z\"/><path fill=\"$[secondary]\" stroke-width=\"2\" d=\"M180 528.21h40l10 17.05L200 564l-30-18.74z\"/></g>",
        "hockey2": "<g stroke=\"#000\"><path fill=\"$[primary]\" stroke-width=\"6\" d=\"M120 505c0 20 50 15 80 35 30-20 80-15 80-35 0 0 50-5 80 5 0 0 20 10 30 40s10 60 10 60H0s0-30 10-60 30-40 30-40c30-10 80-5 80-5Z\"/><path fill=\"$[secondary]\" stroke-width=\"2\" d=\"M120 505c0 20 50 15 80 30 30-15 80-10 80-30l15-1c0 41-40 21-95 56-55-35-95-15-95-56z\"/><path fill=\"none\" stroke-width=\"6\" d=\"M120 505c0 20 50 15 80 35 30-20 80-15 80-35 0 0 50-5 80 5 0 0 20 10 30 40s10 60 10 60H0s0-30 10-60 30-40 30-40c30-10 80-5 80-5Z\"/><path fill=\"$[accent]\" stroke-width=\"2\" d=\"M180 528.21h40l10 17.05L200 564l-30-18.74z\"/></g>",
        "hockey3": "<g stroke=\"#000\"><path fill=\"$[primary]\" stroke-width=\"6\" d=\"M120 505c0 20 50 15 80 35 30-20 80-15 80-35 0 0 50-5 80 5 0 0 20 10 30 40s10 60 10 60H0s0-30 10-60 30-40 30-40c30-10 80-5 80-5Z\"/><path fill=\"$[secondary]\" stroke-width=\"none\" d=\"m0 600 400 1.8-2-11.8s-8 5-18 5c-40-20-70-30-180-30C80 565 2 590 2 590z\"/><path fill=\"$[accent]\" d=\"M4.5 577.03S10 580 20 580c30-15 110-20 180-20 90 0 150 5 180 20 10 0 17-2.97 17-2.97l1 12.97s-8 5-18 5c-40-20-110-22.48-180-22.48-80 0-150 2.48-180 22.48-10 0-18-5-18-5z\"/><path fill=\"$[accent]\" stroke-width=\"2\" d=\"M120 505c0 20 50 15 80 30 30-15 80-10 80-30l15-1c0 41-40 21-95 56-55-35-95-15-95-56z\"/><path fill=\"none\" stroke-width=\"6\" d=\"M120 505c0 20 50 15 80 35 30-20 80-15 80-35 0 0 50-5 80 5 0 0 20 10 30 40s10 60 10 60H0s0-30 10-60 30-40 30-40c30-10 80-5 80-5Z\"/><path fill=\"$[secondary]\" stroke-width=\"2\" d=\"M180 528.21h40l10 17.05L200 564l-30-18.74z\"/></g>",
        "hockey4": "<g stroke=\"#000\"><path fill=\"$[primary]\" stroke-width=\"6\" d=\"M120 505c0 20 50 15 80 35 30-20 80-15 80-35 0 0 50-5 80 5 0 0 20 10 30 40s10 60 10 60H0s0-30 10-60 30-40 30-40c30-10 80-5 80-5Z\"/><path fill=\"$[secondary]\" d=\"M4.5 577.03S10 580 20 580c30-15 110-20 180-20 90 0 150 5 180 20 10 0 17-2.97 17-2.97l1 12.97s-8 5-18 5c-40-20-110-22.48-180-22.48-80 0-150 2.48-180 22.48-10 0-18-5-18-5z\"/><path fill=\"$[secondary]\" stroke-width=\"2\" d=\"M120 505c0 20 50 15 80 30 30-15 80-10 80-30l15-1c0 41-40 21-95 56-55-35-95-15-95-56z\"/><path fill=\"none\" stroke-width=\"6\" d=\"M120 505c0 20 50 15 80 35 30-20 80-15 80-35 0 0 50-5 80 5 0 0 20 10 30 40s10 60 10 60H0s0-30 10-60 30-40 30-40c30-10 80-5 80-5Z\"/><path fill=\"$[accent]\" stroke-width=\"2\" d=\"M180 528.21h40l10 17.05L200 564l-30-18.74z\"/></g>",
        "jersey": "<path fill=\"$[primary]\" stroke=\"#000\" stroke-width=\"6\" d=\"M80 610s10-30 10-90l20-10s10 80 90 80 90-80 90-80l20 10c0 60 10 90 10 90z\"/>",
        "jersey2": "<path fill=\"$[primary]\" stroke=\"#000\" stroke-width=\"6\" d=\"M80 610s10-30 10-90l20-10s10 80 90 80 90-80 90-80l20 10c0 60 10 90 10 90z\"/><path fill=\"none\" stroke=\"#000\" stroke-width=\"16\" d=\"M90 520c0 60-10 90-10 90m230-90c0 60 10 90 10 90M110 510s10 80 90 80 90-80 90-80\"/><path fill=\"none\" stroke=\"$[accent]\" stroke-width=\"12\" d=\"M90 520c0 60-10 90-10 90m230-90c0 60 10 90 10 90M110 510s10 80 90 80 90-80 90-80\"/><path fill=\"none\" stroke=\"$[secondary]\" stroke-width=\"6\" d=\"M90 520c0 60-10 90-10 90m230-90c0 60 10 90 10 90M110 510s10 80 90 80 90-80 90-80\"/>",
        "jersey3": "<path fill=\"$[primary]\" stroke=\"#000\" stroke-width=\"6\" d=\"M80 610s10-30 10-90l20-10s10 80 90 80 90-80 90-80l20 10c0 60 10 90 10 90z\"/><path fill=\"$[secondary]\" d=\"M85 575v25h230v-25h-65s-20 15-50 15-50-15-50-15z\"/><path fill=\"none\" stroke=\"#000\" stroke-width=\"16\" d=\"M90 520c0 60-10 90-10 90m230-90c0 60 10 90 10 90M110 510s10 80 90 80 90-80 90-80\"/><path fill=\"none\" stroke=\"$[primary]\" stroke-width=\"12\" d=\"M90 520c0 60-10 90-10 90m230-90c0 60 10 90 10 90M110 510s10 80 90 80 90-80 90-80\"/><path fill=\"none\" stroke=\"$[accent]\" stroke-width=\"6\" d=\"M90 520c0 60-10 90-10 90m230-90c0 60 10 90 10 90M110 510s10 80 90 80 90-80 90-80\"/>",
        "jersey4": "<path fill=\"$[primary]\" stroke=\"#000\" stroke-width=\"6\" d=\"M80 610s10-30 10-90l20-10s10 80 90 80 90-80 90-80l20 10c0 60 10 90 10 90z\"/><path fill=\"none\" stroke=\"#000\" stroke-width=\"16\" d=\"M90 520c0 60-10 90-10 90m230-90c0 60 10 90 10 90M110 510s10 80 90 80 90-80 90-80\"/><path fill=\"none\" stroke=\"$[accent]\" stroke-width=\"8\" d=\"M90 520c0 60-10 90-10 90m230-90c0 60 10 90 10 90m-210-98s15 78 90 78 90-78 90-78\"/><path fill=\"none\" stroke=\"$[primary]\" stroke-width=\"4\" d=\"M86 522c0 60-10 88-10 88m238-88c0 60 10 88 10 88M114 510s11 76 86 76 86-76 86-76\"/><path fill=\"none\" stroke=\"$[secondary]\" stroke-width=\"4\" d=\"M94 518c0 60-10 92-10 92m222-92c0 60 10 92 10 92m-210-96s12 80 94 80 94-80 94-80\"/>",
        "jersey5": "<path fill=\"$[primary]\" stroke=\"#000\" stroke-width=\"6\" d=\"M80 610s10-30 10-90l20-10s10 80 90 80 90-80 90-80l20 10c0 60 10 90 10 90z\"/><path fill=\"none\" stroke=\"$[accent]\" stroke-width=\"2\" d=\"M95 610v-92.45M105 610v-97.95m10 2.95v95m10-60v62.05M135 565v45m10-35v35m10-30v30m10-25v25m10-20v20m10-20v20m10-20v20m110 0v-92.45M295 610v-97.95M285 515v95m-10-60v62.05M265 565v45m-10-35v35m-10-30v30m-10-25v25m-10-20v20m-10-20v20m-10-20v20\"/><path fill=\"none\" stroke=\"#000\" stroke-width=\"16\" d=\"M90 520c0 60-10 90-10 90m230-90c0 60 10 90 10 90M110 510s10 80 90 80 90-80 90-80\"/><path fill=\"none\" stroke=\"$[accent]\" stroke-width=\"8\" d=\"M90 520c0 60-10 90-10 90m230-90c0 60 10 90 10 90m-210-98s15 78 90 78 90-78 90-78\"/><path fill=\"none\" stroke=\"$[primary]\" stroke-width=\"4\" d=\"M86 522c0 60-10 88-10 88m238-88c0 60 10 88 10 88M114 510s11 76 86 76 86-76 86-76\"/><path fill=\"none\" stroke=\"$[secondary]\" stroke-width=\"4\" d=\"M94 518c0 60-10 92-10 92m222-92c0 60 10 92 10 92m-210-96s12 80 94 80 94-80 94-80\"/>"
    },
    "miscLine": {
        "blush": "<path d=\"m102 385 9.1-25m13.6 0-9.1 25m13.6 0 9.1-25m13.6 0-9.1 25m106.3 0 9.1-25m13.6 0-9.1 25m13.6 0 9.1-25m13.6 0-9.1 25\" style=\"opacity:.251;fill:#a15757;stroke:#a15757\"/><ellipse cx=\"129.2\" cy=\"372.5\" rx=\"28.2\" ry=\"21.1\" style=\"opacity:.25;fill:#a15757\"/><ellipse cx=\"271.8\" cy=\"372.5\" rx=\"28.2\" ry=\"21.1\" style=\"opacity:.25;fill:#a15757\"/>",
        "chin1": "<path fill=\"none\" stroke=\"#000\" stroke-width=\"2\" d=\"M180 465s10-5 20-5 20 5 20 5\"/>",
        "chin2": "<path fill=\"none\" stroke=\"#000\" stroke-width=\"2\" d=\"M200 467.37V480\"/>",
        "forehead1": "<path fill=\"none\" stroke=\"#000\" stroke-width=\"2\" d=\"M200 270v-15l5-5-5 5-5-5\"/>",
        "forehead2": "<path fill=\"none\" stroke=\"#000\" stroke-width=\"2\" d=\"M170 235s15 0 30 5c15-5 30-5 30-5m-75-15s35 0 45 5c10-5 45-5 45-5\"/>",
        "forehead3": "<path fill=\"none\" stroke=\"#000\" stroke-width=\"2\" d=\"M170 235s15 0 30 5c15-5 30-5 30-5\"/>",
        "forehead4": "<path fill=\"none\" stroke=\"#000\" stroke-width=\"2\" d=\"M155 220s35 0 45 5c10-5 45-5 45-5\"/>",
        "forehead5": "<path fill=\"none\" stroke=\"#000\" stroke-width=\"2\" d=\"M200 270v-15l5-5-5 5-5-5m-25-15s15 0 30 5c15-5 30-5 30-5m-75-15s35 0 45 5c10-5 45-5 45-5\"/>",
        "freckles1": "<path d=\"M144 363c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3m-15-1c-1.11 0-2-.89-2-2s.89-2 2-2 2 .89 2 2-.89 2-2 2m-15 1c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3m-15-1c-1.11 0-2-.89-2-2s.89-2 2-2 2 .89 2 2-.89 2-2 2m5 11c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3m10-1c-1.11 0-2-.89-2-2s.89-2 2-2 2 .89 2 2-.89 2-2 2m10 1c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3m10-1c-1.11 0-2-.89-2-2s.89-2 2-2 2 .89 2 2-.89 2-2 2m10 11c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3m-15-1c-1.11 0-2-.89-2-2s.89-2 2-2 2 .89 2 2-.89 2-2 2m-10 0c-1.11 0-2-.89-2-2s.89-2 2-2 2 .89 2 2-.89 2-2 2m-10 1c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3m-10-1c-1.11 0-2-.89-2-2s.89-2 2-2 2 .89 2 2-.89 2-2 2m45-10c-1.11 0-2-.89-2-2s.89-2 2-2 2 .89 2 2-.89 2-2 2m-50 0c-1.11 0-2-.89-2-2s.89-2 2-2 2 .89 2 2-.89 2-2 2m60 5c-1.11 0-2-.89-2-2s.89-2 2-2 2 .89 2 2-.89 2-2 2m0-10c-1.11 0-2-.89-2-2s.89-2 2-2 2 .89 2 2-.89 2-2 2m-48-15c-1.11 0-2-.89-2-2s.89-2 2-2 2 .89 2 2-.89 2-2 2m15 2c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4m15-2c-1.11 0-2-.89-2-2s.89-2 2-2 2 .89 2 2-.89 2-2 2m-15 41c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3m15-1c-1.11 0-2-.89-2-2s.89-2 2-2 2 .89 2 2-.89 2-2 2m-30 0c-1.11 0-2-.89-2-2s.89-2 2-2 2 .89 2 2-.89 2-2 2m150-29c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3m15-1c-1.11 0-2-.89-2-2s.89-2 2-2 2 .89 2 2-.89 2-2 2m15 1c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3m15-1c-1.11 0-2-.89-2-2s.89-2 2-2 2 .89 2 2-.89 2-2 2m-5 11c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3m-10-1c-1.11 0-2-.89-2-2s.89-2 2-2 2 .89 2 2-.89 2-2 2m-10 1c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3m-10-1c-1.11 0-2-.89-2-2s.89-2 2-2 2 .89 2 2-.89 2-2 2m-10 11c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3m15-1c-1.11 0-2-.89-2-2s.89-2 2-2 2 .89 2 2-.89 2-2 2m10 0c-1.11 0-2-.89-2-2s.89-2 2-2 2 .89 2 2-.89 2-2 2m10 1c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3m10-1c-1.11 0-2-.89-2-2s.89-2 2-2 2 .89 2 2-.89 2-2 2m-45-10c-1.11 0-2-.89-2-2s.89-2 2-2 2 .89 2 2-.89 2-2 2m50 0c-1.11 0-2-.89-2-2s.89-2 2-2 2 .89 2 2-.89 2-2 2m-60 5c-1.11 0-2-.89-2-2s.89-2 2-2 2 .89 2 2-.89 2-2 2m0-10c-1.11 0-2-.89-2-2s.89-2 2-2 2 .89 2 2-.89 2-2 2m48-15c-1.11 0-2-.89-2-2s.89-2 2-2 2 .89 2 2-.89 2-2 2m-15 2c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4m-15-2c-1.11 0-2-.89-2-2s.89-2 2-2 2 .89 2 2-.89 2-2 2m15 41c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3m-15-1c-1.11 0-2-.89-2-2s.89-2 2-2 2 .89 2 2-.89 2-2 2m30 0c-1.11 0-2-.89-2-2s.89-2 2-2 2 .89 2 2-.89 2-2 2\" style=\"opacity:.251;mix-blend-mode:multiply;fill:#8b6135\"/>",
        "freckles2": "<path d=\"m102 385 9.08-25m13.62 0-9.08 25m13.62 0 9.07-25m13.62 0-9.08 25m106.22 0 9.08-25m13.61 0-9.07 25m13.61 0 9.08-25m13.62 0-9.08 25\" style=\"opacity:.251;mix-blend-mode:multiply;fill:none;stroke:#8b6135;stroke-width:4.4\"/>",
        "none": ""
    },
    "mouth": {
        "angry": "<path d=\"M40 9C50 9 65-1 70 4s10 15 5 20-25 0-35 0-30 5-35 0S5 9 10 4s20 5 30 5Z\" style=\"fill:#fff;stroke:#000;stroke-width:5\"/>",
        "closed": "<path d=\"m170 440 10-10h40l10 10\" style=\"fill:none;stroke:#000;stroke-width:5\"/>",
        "mouth": "<path d=\"M32 3c10 0 15 0 25 5 5 5 5 5 0 10s-15 0-25 0-20 5-25 0-5-5 0-10c10-5 15-5 25-5Z\" style=\"fill:#fff;stroke:#000;stroke-width:5\"/>",
        "mouth2": "<path d=\"M167 382s10-8.86 33-9c16.67-.1 34 9 34 9s-11.33 21.31-34 22c-22.32.68-33-22-33-22\" style=\"opacity:.05;mix-blend-mode:multiply;fill:#501414\"/><path d=\"M176 384s14-4 24-4 24 4 24 4-8 8-24 8-24-8-24-8\" style=\"fill:#fff\"/><path d=\"M176 384s14-4 24-4 24 4 24 4-8 8-24 8-24-8-24-8Z\" style=\"fill:none;stroke:#000;stroke-width:4\"/><path d=\"M180 376c16-4 24-4 40 0\" style=\"fill:none;stroke:#000;stroke-width:1\"/><path d=\"M166 382s5 3.19 10 2m58-2s-5 3.19-10 2\" style=\"fill:none;stroke:#000;stroke-width:4\"/><path d=\"M185.71 400.69c15.15 4.14 16.29 3.86 29.15-.57\" style=\"fill:none;stroke:#000;stroke-width:1\"/>",
        "mouth3": "<path d=\"M1 3s11-1.86 34-2C51.67.9 69 3 69 3S57.67 26.31 35 27C12.68 27.68 1 3 1 3\" style=\"opacity:.05;mix-blend-mode:multiply;fill:#501414\"/><path d=\"M11 5s14 1.71 24 1.71S59 5 59 5s-8 10-24 10S11 5 11 5\" style=\"fill:#fff\"/><path d=\"M11 5s14 1.71 24 1.71S59 5 59 5s-8 10-24 10S11 5 11 5ZM1 3s5 3.19 10 2m58-2s-5 3.19-10 2M20.71 23.69c15.15 4.14 16.29 3.86 29.15-.57\" style=\"fill:none;stroke:#000;stroke-width:4\"/>",
        "mouth4": "<path d=\"M168 384s9-13.77 32-14.03c17.4-.2 32 13.2 32 13.2s-4.29 23.24-32 23.81c-27.29.56-32-22.98-32-22.98\" style=\"opacity:.05;mix-blend-mode:multiply;fill:#501414\"/><path d=\"M168 384c12-4 48-4 64 0-20 4-10 4-32 4-20 0-16 0-32-4\" style=\"fill:#fff\"/><path d=\"M168 384c12-4 48-4 64 0-20 4-10 4-32 4-20 0-16 0-32-4Zm13.71 18.12c14.52 5.66 24.72 5.71 37.72-.71m.86-26.53c-14.52-5.66-27.29-6.34-40.29.09\" style=\"fill:none;stroke:#000;stroke-width:3\"/>",
        "mouth5": "<path d=\"M168 384s9-13.77 32-14.03c17.4-.2 32 13.2 32 13.2s-4.29 23.24-32 23.81c-27.29.56-32-22.98-32-22.98\" style=\"opacity:.05;mix-blend-mode:multiply;fill:#501414\"/><path d=\"M181.71 402.12c14.52 5.66 24.72 5.71 37.72-.71m.86-26.53c-14.52-5.66-27.29-6.34-40.29.09m-4 9.03c8-2.17 16 0 24 0s16-2.17 24 0m12-4s0 4-12 4m-60-4s0 4 12 4\" style=\"fill:none;stroke:#000;stroke-width:4\"/>",
        "mouth6": "<path d=\"M168 384s9-13.77 32-14.03c17.4-.2 32 13.2 32 13.2s-4.29 23.24-32 23.81c-27.29.56-32-22.98-32-22.98\" style=\"opacity:.05;mix-blend-mode:multiply;fill:#501414\"/><path d=\"M181.71 402.12c14.52 5.66 24.72 5.71 37.72-.71m.86-26.53c-14.52-5.66-27.29-6.34-40.29.09\" style=\"fill:none;stroke:#000;stroke-width:2\"/><path d=\"M165 390s20-5 35-5 35 4 35 4\" style=\"fill:none;stroke:#000;stroke-width:4\"/>",
        "mouth7": "<path d=\"M168 384s9-13.77 32-14.03c17.4-.2 32 13.2 32 13.2s-4.29 28.26-32 28.83c-27.29.56-32-28-32-28\" style=\"opacity:.05;mix-blend-mode:multiply;fill:#501414\"/><path d=\"M168 384c12-4 48-4 64 0-8 8-10 16-32 16-20 0-24-8-32-16Z\" style=\"fill:#000;stroke:#000\"/><path d=\"M168 384c12-4 48-4 64 0-20 4-10 4-32 4-20 0-16 0-32-4m12 12s14-1 20-1 20 1 20 1-4 4-20 4c-12 0-20-4-20-4\" style=\"fill:#fff\"/><path d=\"M168 384c12-4 48-4 64 0-8 8-10 16-32 16-20 0-24-8-32-16Zm16 24c12 6 20 6 32 0m4.29-33.12c-14.52-5.66-27.29-6.34-40.29.09\" style=\"fill:none;stroke:#000;stroke-width:4\"/>",
        "mouth8": "<path d=\"M168 384s9-13.77 32-14.03c17.4-.2 32 13.2 32 13.2s-4.29 28.26-32 28.83c-27.29.56-32-28-32-28\" style=\"opacity:.05;mix-blend-mode:multiply;fill:#501414\"/><path d=\"M168 384c12-4 48-4 64 0-8 8-10 16-32 16-20 0-24-8-32-16Z\" style=\"fill:#000;stroke:#000\"/><path d=\"M168 384c14.08-5.73 53.75-3.73 64.25.6-20 4.67-30.5 2-30.5 2l.17-5.17-4.67-.33.17 5.17S184 388 168 384m4.42 6.6s21.58 3.17 27.58 3.17 26.92-3 26.92-3S216 400 200 400c-12 0-27.58-9.4-27.58-9.4\" style=\"fill:#fff\"/><path d=\"M168 384c12-4 48-4 64 0-8 8-10 16-32 16-20 0-24-8-32-16Zm16 24c12 6 20 6 32 0\" style=\"fill:none;stroke:#000;stroke-width:4\"/>",
        "side": "<path d=\"m1 22 60-10L51 2\" style=\"fill:none;stroke:#000;stroke-width:5\"/>",
        "smile-closed": "<path d=\"M170 430s10 10 30 10 30-10 30-10\" style=\"fill:none;stroke:#000;stroke-width:5\"/>",
        "smile": "<path d=\"M170 430s10 20 30 20 30-20 30-20z\" style=\"fill:#fff;stroke:#000;stroke-width:5\"/>",
        "smile2": "<path d=\"M11 8S4.33 28 31 28 51 8 51 8 41 4.37 31 4.37 11 8 11 8Zm50-5L51 8M1 3l10 5\" style=\"fill:#fff;stroke:#000;stroke-width:5\"/>",
        "smile3": "<path d=\"M5 3s13.33 20 40 20S85 3 85 3 65 5.22 45 5.22 5 3 5 3Z\" style=\"fill:#fff;stroke:#000;stroke-width:5\"/>",
        "smile4": "<path d=\"M198.19 431.84c-7.3-1.3-14.7-2.5-22-3.9a67 67 0 0 1-10.6-3c-4.5-1.6-8.6-3.4-11.8 2.2-.5.9-3.1.6-4.7.9.2-1.5-.1-3.2.6-4.5 2.2-4.6 4.6-9.1 7.1-13.5.7-1.2 2.1-2.1 3.2-3.1.6 1.4 1.7 2.8 1.6 4.1a53.4 53.4 0 0 1-1.7 8.1c27.8 8.4 55.3 8.3 83.4.2-.1-1.3-.2-2.8-.2-4.2s.2-2.8.5-5.8c2 2.2 3.2 3.2 3.9 4.5 2 3.8 4 7.6 5.7 11.6.5 1.2.2 2.7.3 4-1.5-.2-3.3.1-4.4-.7-1.6-1.1-2.6-2.9-3.3-3.6-12.7 2.3-24.7 4.6-36.8 6.8-3.5-.1-7.1-.1-10.8-.1\"/>",
        "straight": "<path d=\"M180 430h40\" style=\"fill:none;stroke:#000;stroke-width:5\"/>"
    },
    "nose": {
        "honker": "<path fill=\"$[skinColor]\" stroke=\"#000\" stroke-width=\"5\" d=\"M50 50s-20 60 9 55c0 0 29 5 9-55\"/>",
        "nose1": "<path fill=\"$[skinColor]\" stroke=\"#000\" stroke-width=\"5\" d=\"M170 390s10-10 20 0 10 10 20 0 20 0 20 0\"/>",
        "nose10": "<path fill=\"$[skinColor]\" stroke=\"#000\" stroke-width=\"5\" d=\"M40.3 99.804c2.56 5.426 7.286 9.34 15.292 10.445 8.532-1.475 12.386-4.548 15.285-10.378\"/>",
        "nose11": "<path fill=\"$[skinColor]\" stroke=\"#000\" stroke-width=\"5\" d=\"M33.39 35.68s-22.8 22.8 0 22.8c11.41 0 2.23 6.84 18.25 6.84s4.56-6.84 15.97-6.84c22.8 0 0-22.8 0-22.8\"/>",
        "nose12": "<path fill=\"$[skinColor]\" stroke=\"#000\" stroke-width=\"5\" d=\"M36.03 47c-19.25.25-26.57 32.37-4.37 27.13 9-2.13 8.25 4.12 18.12 4.37 9.5.24 5.75-6.12 16.38-3.25 22.01 5.96 18.75-28-.21-28.02M50 55.6S51.25 45 51.25 35 50 5 50 5\"/><path d=\"M40 95h20v5H40z\" style=\"fill:none\"/>",
        "nose13": "<path fill=\"$[skinColor]\" stroke=\"#000\" stroke-width=\"5\" d=\"M58 18S43 28.72 38 33c-4.17 3.57-10 10-10 30 0 10 15 20 25 20s20-5 20-15\"/><path d=\"m84.99 55.01 5-.02.02 5-5 .02z\" style=\"fill:none\"/>",
        "nose14": "<path fill=\"$[skinColor]\" stroke=\"#000\" stroke-width=\"5\" d=\"M190 300c-5-15 5-15 10-15s15 0 10 15\"/>",
        "nose2": "<path fill=\"$[skinColor]\" stroke=\"#000\" stroke-width=\"5\" d=\"m28 1 20 45s-5 20-25 20S3 46 3 46\"/>",
        "nose3": "<path fill=\"$[skinColor]\" stroke=\"#000\" stroke-width=\"5\" d=\"m175 380 25 20 25-20\"/>",
        "nose4": "<path fill=\"$[skinColor]\" stroke=\"#000\" stroke-width=\"5\" d=\"M11 1S6 31 21 41L1 51\"/>",
        "nose5": "<path fill=\"$[skinColor]\" stroke=\"#000\" stroke-width=\"5\" d=\"M175 370c-20 0-5 25 5 15 5-5 15 10 20 10s15-15 20-10c10 10 25-15 5-15\"/>",
        "nose6": "<path fill=\"$[skinColor]\" stroke=\"#000\" stroke-width=\"5\" d=\"M190 325s-5 20-5 45c-20-5-15 15-15 20 20 0 15 10 30 10s10-10 30-10c0-5 5-25-15-20 0-25-5-45-5-45\"/>",
        "nose7": "<path fill=\"$[skinColor]\" stroke=\"#000\" stroke-width=\"5\" d=\"M180 380s10-5 20-5 20 5 20 5m-20-5v-40\"/>",
        "nose8": "<path fill=\"$[skinColor]\" stroke=\"#000\" stroke-width=\"5\" d=\"M186.89 385.17s-4.71-14.11 14.11-14.11 14.11 14.11 14.11 14.11M201 371.06v-18.82\"/>",
        "nose9": "<path fill=\"$[skinColor]\" stroke=\"#000\" stroke-width=\"5\" d=\"m28 1 16.043 32.815s.75 10.848-18.228 10.417c-4.731-.107-4.624.436-6.246-.08\" transform=\"matrix(1 0 -.07193 1 2.942 .274)\"/>",
        "pinocchio": "<path fill=\"$[skinColor]\" stroke=\"#000\" stroke-width=\"5\" d=\"M40 40s50-30 0 30\"/>",
        "small": "<path d=\"M180.17 380.08c1.6.3 3.5.1 4.8.9 4.7 2.8 9.2 6 13.8 9a10.23 10.23 0 0 0 11.7 0c3.9-2.5 7.8-5.1 11.7-7.6 1.6-1.1 3.3-2.2 5.7-3.8 0 2.1.4 3.4-.1 4.3-2.8 6.4-17.9 16.1-24.8 15-4-.6-8-2.8-11.3-5.3-4.3-3.3-7.8-7.5-11.6-11.4a4.5 4.5 0 0 0 .1-1.1\"/>"
    },
    "smileLine": {
        "line1": "<path fill=\"none\" stroke=\"#000\" stroke-width=\"2\" d=\"M9 2s-12.5 8.95-4 34\"/>",
        "line2": "<path fill=\"none\" stroke=\"#000\" stroke-width=\"2\" d=\"M17 2 2 12l5 15\"/>",
        "line3": "<path fill=\"none\" stroke=\"#000\" stroke-width=\"2\" d=\"M12.33 4.32s-10 3.29-10 13.18 10 13.18 10 13.18\"/>",
        "line4": "<path fill=\"none\" stroke=\"#000\" stroke-width=\"2\" d=\"m0 20 6-10-6-9\"/>",
        "none": ""
    }
};
}),
"[project]/Projects/fmko/node_modules/facesjs/build/display.js [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "display",
    ()=>display
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$facesjs$2f$build$2f$override$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/node_modules/facesjs/build/override.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$facesjs$2f$build$2f$svgs$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/fmko/node_modules/facesjs/build/svgs.js [app-ssr] (ecmascript)");
;
;
const addWrapper = (svgString)=>`<g>${svgString}</g>`;
const addTransform = (element, newTransform)=>{
    const oldTransform = element.getAttribute("transform");
    element.setAttribute("transform", `${oldTransform ? `${oldTransform} ` : ""}${newTransform}`);
};
const rotateCentered = (element, angle)=>{
    const bbox = element.getBBox();
    const cx = bbox.x + bbox.width / 2;
    const cy = bbox.y + bbox.height / 2;
    addTransform(element, `rotate(${angle} ${cx} ${cy})`);
};
const scaleStrokeWidthAndChildren = (element, factor)=>{
    if (element.tagName === "style") {
        return;
    }
    const strokeWidth = element.getAttribute("stroke-width");
    if (strokeWidth) {
        element.setAttribute("stroke-width", String(parseFloat(strokeWidth) / factor));
    }
    const children = element.childNodes;
    for(let i = 0; i < children.length; i++){
        scaleStrokeWidthAndChildren(children[i], factor);
    }
};
// Scale relative to the center of bounding box of element e, like in Raphael.
// Set x and y to 1 and this does nothing. Higher = bigger, lower = smaller.
const scaleCentered = (element, x, y)=>{
    const bbox = element.getBBox();
    const cx = bbox.x + bbox.width / 2;
    const cy = bbox.y + bbox.height / 2;
    const tx = cx * (1 - x) / x;
    const ty = cy * (1 - y) / y;
    addTransform(element, `scale(${x} ${y}) translate(${tx} ${ty})`);
    // Keep apparent stroke width constant, similar to how Raphael does it (I think)
    if (Math.abs(x) !== 1 || Math.abs(y) !== 1 || Math.abs(x) + Math.abs(y) !== 2) {
        const factor = (Math.abs(x) + Math.abs(y)) / 2;
        scaleStrokeWidthAndChildren(element, factor);
    }
};
// Translate element such that its center is at (x, y). Specifying xAlign and yAlign can instead make (x, y) the left/right and top/bottom.
const translate = (element, x, y, xAlign = "center", yAlign = "center")=>{
    const bbox = element.getBBox();
    let cx;
    let cy;
    if (xAlign === "left") {
        cx = bbox.x;
    } else if (xAlign === "right") {
        cx = bbox.x + bbox.width;
    } else {
        cx = bbox.x + bbox.width / 2;
    }
    if (yAlign === "top") {
        cy = bbox.y;
    } else if (yAlign === "bottom") {
        cy = bbox.y + bbox.height;
    } else {
        cy = bbox.y + bbox.height / 2;
    }
    addTransform(element, `translate(${x - cx} ${y - cy})`);
};
// Defines the range of fat/skinny, relative to the original width of the default head.
const fatScale = (fatness)=>0.8 + 0.2 * fatness;
const drawFeature = (svg, face, info)=>{
    const feature = face[info.name];
    if (!feature || !__TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$facesjs$2f$build$2f$svgs$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"][info.name]) {
        return;
    }
    if ([
        "hat",
        "hat2",
        "hat3"
    ].includes(face.accessories.id) && info.name == "hair") {
        if ([
            "afro",
            "afro2",
            "curly",
            "curly2",
            "curly3",
            "faux-hawk",
            "hair",
            "high",
            "juice",
            "messy-short",
            "messy",
            "middle-part",
            "parted",
            "shaggy1",
            "shaggy2",
            "short3",
            "spike",
            "spike2",
            "spike3",
            "spike4"
        ].includes(face.hair.id)) {
            face.hair.id = "short";
        } else if ([
            "blowoutFade",
            "curlyFade1",
            "curlyFade2",
            "dreads",
            "fauxhawk-fade",
            "tall-fade"
        ].includes(face.hair.id)) {
            face.hair.id = "short-fade";
        } else {
            return;
        }
    }
    // @ts-expect-error
    let featureSVGString = __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$facesjs$2f$build$2f$svgs$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"][info.name][feature.id];
    if (!featureSVGString) {
        return;
    }
    // @ts-expect-error
    if (feature.shave) {
        // @ts-expect-error
        featureSVGString = featureSVGString.replace("$[faceShave]", feature.shave);
    }
    // @ts-expect-error
    if (feature.shave) {
        // @ts-expect-error
        featureSVGString = featureSVGString.replace("$[headShave]", feature.shave);
    }
    featureSVGString = featureSVGString.replace("$[skinColor]", face.body.color);
    featureSVGString = featureSVGString.replace(/\$\[hairColor\]/g, face.hair.color);
    featureSVGString = featureSVGString.replace(/\$\[primary\]/g, face.teamColors[0]);
    featureSVGString = featureSVGString.replace(/\$\[secondary\]/g, face.teamColors[1]);
    featureSVGString = featureSVGString.replace(/\$\[accent\]/g, face.teamColors[2]);
    const bodySize = face.body.size !== undefined ? face.body.size : 1;
    for(let i = 0; i < info.positions.length; i++){
        svg.insertAdjacentHTML("beforeend", addWrapper(featureSVGString));
        const position = info.positions[i];
        if (position !== null) {
            // Special case, for the pinocchio nose it should not be centered but should stick out to the left or right
            let xAlign;
            if (feature.id === "nose4" || feature.id === "pinocchio") {
                // @ts-expect-error
                xAlign = feature.flip ? "right" : "left";
            } else {
                xAlign = "center";
            }
            translate(svg.lastChild, position[0], position[1], xAlign);
        }
        if (feature.hasOwnProperty("angle")) {
            // @ts-expect-error
            rotateCentered(svg.lastChild, (i === 0 ? 1 : -1) * feature.angle);
        }
        // Flip if feature.flip is specified or if this is the second position (for eyes and eyebrows). Scale if feature.size is specified.
        // @ts-expect-error
        const scale = feature.hasOwnProperty("size") ? feature.size : 1;
        if (info.name === "body" || info.name === "jersey") {
            // @ts-expect-error
            scaleCentered(svg.lastChild, bodySize, 1);
        // @ts-expect-error
        } else if (feature.flip || i === 1) {
            // @ts-expect-error
            scaleCentered(svg.lastChild, -scale, scale);
        } else if (scale !== 1) {
            // @ts-expect-error
            scaleCentered(svg.lastChild, scale, scale);
        }
        if (info.scaleFatness && info.positions[0] !== null) {
            // Scale individual feature relative to the edge of the head. If fatness is 1, then there are 47 pixels on each side. If fatness is 0, then there are 78 pixels on each side.
            const distance = (78 - 47) * (1 - face.fatness);
            // @ts-expect-error
            translate(svg.lastChild, distance, 0, "left", "top");
        }
    }
    if (info.scaleFatness && info.positions.length === 1 && info.positions[0] === null) {
        // @ts-expect-error
        scaleCentered(svg.lastChild, fatScale(face.fatness), 1);
    }
};
const display = (container, face, overrides)=>{
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$fmko$2f$node_modules$2f$facesjs$2f$build$2f$override$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"])(face, overrides);
    const containerElement = typeof container === "string" ? document.getElementById(container) : container;
    if (!containerElement) {
        throw new Error("container not found");
    }
    containerElement.innerHTML = "";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("version", "1.2");
    svg.setAttribute("baseProfile", "tiny");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.setAttribute("viewBox", "0 0 400 600");
    svg.setAttribute("preserveAspectRatio", "xMinYMin meet");
    // Needs to be in the DOM here so getBBox will work
    containerElement.appendChild(svg);
    const featureInfos = [
        {
            name: "hairBg",
            positions: [
                null
            ],
            scaleFatness: true
        },
        {
            name: "body",
            positions: [
                null
            ]
        },
        {
            name: "jersey",
            positions: [
                null
            ]
        },
        {
            name: "ear",
            positions: [
                [
                    55,
                    325
                ],
                [
                    345,
                    325
                ]
            ],
            scaleFatness: true
        },
        {
            name: "head",
            positions: [
                null
            ],
            // Meaning it just gets placed into the SVG with no translation
            scaleFatness: true
        },
        {
            name: "eyeLine",
            positions: [
                null
            ]
        },
        {
            name: "smileLine",
            positions: [
                [
                    150,
                    435
                ],
                [
                    250,
                    435
                ]
            ]
        },
        {
            name: "miscLine",
            positions: [
                null
            ]
        },
        {
            name: "facialHair",
            positions: [
                null
            ],
            scaleFatness: true
        },
        {
            name: "eye",
            positions: [
                [
                    140,
                    310
                ],
                [
                    260,
                    310
                ]
            ]
        },
        {
            name: "eyebrow",
            positions: [
                [
                    140,
                    270
                ],
                [
                    260,
                    270
                ]
            ]
        },
        {
            name: "mouth",
            positions: [
                [
                    200,
                    440
                ]
            ]
        },
        {
            name: "nose",
            positions: [
                [
                    200,
                    370
                ]
            ]
        },
        {
            name: "hair",
            positions: [
                null
            ],
            scaleFatness: true
        },
        {
            name: "glasses",
            positions: [
                null
            ],
            scaleFatness: true
        },
        {
            name: "accessories",
            positions: [
                null
            ],
            scaleFatness: true
        }
    ];
    for (const info of featureInfos){
        drawFeature(svg, face, info);
    }
};
}),
];

//# sourceMappingURL=f8ff4_f3b5597a._.js.map