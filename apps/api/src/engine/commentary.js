"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateCommentary = generateCommentary;
exports.generateMatchCommentary = generateMatchCommentary;
exports.loadCommentaryFromDB = loadCommentaryFromDB;
var logger_1 = require("../lib/logger");
// In-memory cache (per-worker, refreshes on deploy).
// Načítá se JEDNOU všechny řádky (včetně district). Filtr dle okresu je až při
// generování — NE při načtení: cron zpracuje víc okresů v jedné invokaci a
// district-filtrovaná cache by prosákla flavor mezi okresy.
var cachedTemplates = null;
var cachedReactions = null;
function loadTemplates(db) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, tRes, rRes;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (cachedTemplates)
                        return [2 /*return*/];
                    return [4 /*yield*/, Promise.all([
                            db.prepare("SELECT event_type, template, tags, district FROM commentary_templates").all().catch(function (e) { logger_1.logger.warn({ module: "commentary" }, "load templates", e); return { results: [] }; }),
                            db.prepare("SELECT text, district FROM crowd_reactions").all().catch(function (e) { logger_1.logger.warn({ module: "commentary" }, "load templates", e); return { results: [] }; }),
                        ])];
                case 1:
                    _a = _b.sent(), tRes = _a[0], rRes = _a[1];
                    cachedTemplates = tRes.results.map(function (r) {
                        var _a;
                        return ({
                            event_type: r.event_type,
                            template: r.template,
                            tags: (function () { try {
                                return JSON.parse(r.tags);
                            }
                            catch (_a) {
                                return [];
                            } })(),
                            district: (_a = r.district) !== null && _a !== void 0 ? _a : null,
                        });
                    });
                    cachedReactions = rRes.results.map(function (r) { var _a; return ({ text: r.text, district: (_a = r.district) !== null && _a !== void 0 ? _a : null }); });
                    if (cachedReactions.length === 0)
                        cachedReactions = [{ text: 'Na tribuně ticho.', district: null }];
                    return [2 /*return*/];
            }
        });
    });
}
// Fallback templates if DB is empty or unavailable
var FALLBACK_REACTIONS = [{ text: 'Na tribuně ticho.', district: null }];
var FALLBACK_TEMPLATES = [
    { event_type: 'goal', template: 'GÓÓÓL! {player} skóruje!', tags: [], district: null },
    { event_type: 'chance', template: '{player} střílí — mimo!', tags: [], district: null },
    { event_type: 'foul', template: 'Faul {player}.', tags: [], district: null },
    { event_type: 'card', template: 'Karta pro {player}.', tags: [], district: null },
    { event_type: 'injury', template: '{player} je zraněný.', tags: [], district: null },
    { event_type: 'substitution', template: 'Střídání: {player}.', tags: [], district: null },
    { event_type: 'special', template: '{player} na míči.', tags: ['possession'], district: null },
];
/**
 * Generate a commentary line for a match event.
 */
function generateCommentary(rng, event, homeTeamName, awayTeamName, homeScore, awayScore, district) {
    var templates = cachedTemplates !== null && cachedTemplates !== void 0 ? cachedTemplates : FALLBACK_TEMPLATES;
    var reactions = cachedReactions !== null && cachedReactions !== void 0 ? cachedReactions : FALLBACK_REACTIONS;
    // Okresový filtr: univerzální (district == null) + řádky daného okresu. Neznámý okres → jen univerzální.
    var matching = templates.filter(function (t) { return t.event_type === event.type && (t.district == null || t.district === district); });
    if (event.detail && matching.length > 0) {
        var tagSpecific = matching.filter(function (t) { return t.tags.includes(event.detail); });
        if (tagSpecific.length > 0)
            matching = tagSpecific;
    }
    if (matching.length === 0)
        return event.description;
    var districtReactions = reactions.filter(function (r) { return r.district == null || r.district === district; });
    var template = rng.pick(matching);
    var crowdReaction = rng.pick(districtReactions.length > 0 ? districtReactions : reactions).text;
    var teamName = event.teamId === 1 ? homeTeamName : awayTeamName;
    return template.template
        .replace('{player}', event.playerName)
        .replace('{team}', teamName)
        .replace('{minute}', String(event.minute))
        .replace('{score}', "".concat(homeScore, ":").concat(awayScore))
        .replace('{crowd_reaction}', crowdReaction);
}
/**
 * Generate full commentary for all events in a match.
 * Must be called after loadCommentaryFromDB().
 */
function generateMatchCommentary(rng, events, homeTeamName, awayTeamName, district) {
    var homeScore = 0;
    var awayScore = 0;
    return events.map(function (event) {
        var _a;
        if (event.type === 'goal') {
            var scores = (_a = event.detail) === null || _a === void 0 ? void 0 : _a.split(':').map(Number);
            if (scores && scores.length === 2) {
                homeScore = scores[0];
                awayScore = scores[1];
            }
        }
        return "".concat(event.minute, "' \u2014 ").concat(generateCommentary(rng, event, homeTeamName, awayTeamName, homeScore, awayScore, district));
    });
}
/**
 * Load commentary templates from DB into cache.
 * Call this once before match simulation.
 */
function loadCommentaryFromDB(db) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, loadTemplates(db)];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
