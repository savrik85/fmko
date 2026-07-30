"use strict";
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.districtPoolFor = districtPoolFor;
exports.pickDistrictFlavor = pickDistrictFlavor;
/** Vrátí efektivní pole pro daný okres. Neznámý/undefined okres → jen core. */
function districtPoolFor(pool, district) {
    var _a, _b;
    if (district === "Prachatice" && ((_a = pool.prachatice) === null || _a === void 0 ? void 0 : _a.length))
        return __spreadArray(__spreadArray([], pool.core, true), pool.prachatice, true);
    if (district === "Praha" && ((_b = pool.praha) === null || _b === void 0 ? void 0 : _b.length))
        return __spreadArray(__spreadArray([], pool.core, true), pool.praha, true);
    return pool.core;
}
/** Sloučí core + top-up daného okresu a vybere jeden přes dodaný pick. */
function pickDistrictFlavor(pool, district, pick) {
    return pick(districtPoolFor(pool, district));
}
