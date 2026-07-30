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
exports.generateUltrasReport = generateUltrasReport;
// apps/api/src/news/ultras-report.ts
// Rubrika "Prales Ultras" — fan-voice hodnocení atmosféry kola + výběr kotlů pro galerii fotek.
// Model: ai-reporter.ts (inline Gemini fetch, volný text, 1. řádek = headline).
var logger_1 = require("../lib/logger");
var stadium_generator_1 = require("../stadium/stadium-generator");
var FACILITY_KEYS = ["changing_rooms", "showers", "refreshments", "stands", "parking", "fence", "roof", "ultras_stand", "toilets"];
function isLightHex(hex) {
    var c = hex.replace("#", "");
    var r = parseInt(c.substring(0, 2), 16) || 0;
    var g = parseInt(c.substring(2, 4), 16) || 0;
    var b = parseInt(c.substring(4, 6), 16) || 0;
    return (r * 299 + g * 587 + b * 114) / 1000 > 150;
}
/** "1240" -> "1 240" (bez Intl, který je na Workers omezený). */
function fmtNum(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}
/** Vybere ≤3 kotle doprovázející žebříček (nejvyšší návštěva, nejnabitější kotel, výrazná plachta). */
function pickGallery(homeMatches) {
    var cands = homeMatches.filter(function (m) { return m.ultrasStand > 0; });
    if (cands.length === 0)
        return [];
    var used = new Set();
    var chosen = [];
    var add = function (m, caption) {
        var _a;
        if (!m || used.has(m.homeTeamId) || chosen.length >= 3)
            return;
        used.add(m.homeTeamId);
        chosen.push({
            teamId: m.homeTeamId,
            teamName: m.homeName,
            ultrasText: (_a = m.ultrasText) !== null && _a !== void 0 ? _a : "",
            bannerColor: m.bannerColor,
            textColor: m.textColor,
            level: m.ultrasStand,
            attendance: m.attendance,
            capacity: m.capacity,
            fillPct: m.fillPct,
            caption: caption,
        });
    };
    var byAtt = __spreadArray([], cands, true).sort(function (a, b) { return b.attendance - a.attendance; });
    add(byAtt[0], "".concat(fmtNum(byAtt[0].attendance), " div\u00E1k\u016F \u2014 nejv\u00EDc v kole"));
    var byFill = __spreadArray([], cands, true).sort(function (a, b) { return b.fillPct - a.fillPct; }).find(function (m) { return !used.has(m.homeTeamId); });
    add(byFill, byFill ? "nejnabitější kotel kola" : "");
    var byLevel = __spreadArray([], cands, true).sort(function (a, b) { return b.ultrasStand - a.ultrasStand || (b.ultrasText ? 1 : 0) - (a.ultrasText ? 1 : 0); })
        .find(function (m) { return !used.has(m.homeTeamId); });
    add(byLevel, byLevel ? (byLevel.ultrasStand >= 3 ? "největší kotel v lize" : byLevel.ultrasText ? "plachta \u201E".concat(byLevel.ultrasText, "\"") : "kotel v plné palbě") : "");
    return chosen;
}
/** Deterministický fallback text (když Gemini selže / chybí klíč). Rubrika vyjde vždy. */
function fallbackArticle(gameWeek, homeMatches) {
    if (homeMatches.length === 0)
        return "Kotel po ".concat(gameWeek, ". kole\nToto kolo se doma nehr\u00E1lo, tak jsme si dali pauzu na pivo.");
    var byAtt = __spreadArray([], homeMatches, true).sort(function (a, b) { return b.attendance - a.attendance; });
    var top = byAtt[0];
    var bottom = byAtt[byAtt.length - 1];
    var parts = [];
    parts.push("Kotel hodnot\u00ED ".concat(gameWeek, ". kolo"));
    parts.push("Nejv\u00EDc lid\u00ED dorazilo na **".concat(top.homeName, "** \u2014 ").concat(fmtNum(top.attendance), " div\u00E1k\u016F. Naopak nejpr\u00E1zdn\u011Bji bylo u **").concat(bottom.homeName, "** (").concat(fmtNum(bottom.attendance), ")."));
    var byFill = __spreadArray([], homeMatches, true).sort(function (a, b) { return b.fillPct - a.fillPct; })[0];
    parts.push("Nejlep\u0161\u00ED atmosf\u00E9ru kola m\u011Bl **".concat(byFill.homeName, "** \u2014 bylo tam ").concat(fullnessDesc(byFill.fillPct), "."));
    return parts.join("\n");
}
function generateUltrasReport(db, geminiApiKey, calendarId) {
    return __awaiter(this, void 0, void 0, function () {
        var cal, leagueId, gameWeek, seasonNumber, existing, rows, homeMatches, photos, article, e_1, lines, headline, body, newsId;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, db
                        .prepare("SELECT league_id, game_week, season_number FROM season_calendar WHERE id = ?")
                        .bind(calendarId)
                        .first()];
                case 1:
                    cal = _b.sent();
                    if (!cal) {
                        logger_1.logger.warn({ module: "ultras-report" }, "calendar not found: ".concat(calendarId));
                        return [2 /*return*/, { newsId: null, photos: 0, skipped: true }];
                    }
                    leagueId = cal.league_id, gameWeek = cal.game_week, seasonNumber = cal.season_number;
                    return [4 /*yield*/, db
                            .prepare("SELECT 1 FROM ultras_reports WHERE league_id = ? AND game_week = ?")
                            .bind(leagueId, gameWeek)
                            .first()];
                case 2:
                    existing = _b.sent();
                    if (existing)
                        return [2 /*return*/, { newsId: null, photos: 0, skipped: true }];
                    return [4 /*yield*/, db
                            .prepare("SELECT m.home_team_id, m.home_score, m.away_score, m.attendance, m.weather,\n              t1.name AS home_name, t2.name AS away_name,\n              t1.primary_color AS home_primary, t1.secondary_color AS home_secondary,\n              s.capacity, s.changing_rooms, s.showers, s.refreshments, s.stands, s.parking, s.fence, s.roof, s.ultras_stand, s.toilets,\n              s.ultras_text, s.ultras_banner_color, s.ultras_text_color\n       FROM matches m\n       JOIN teams t1 ON m.home_team_id = t1.id\n       JOIN teams t2 ON m.away_team_id = t2.id\n       LEFT JOIN stadiums s ON s.team_id = m.home_team_id\n       WHERE m.calendar_id = ? AND m.status = 'simulated'")
                            .bind(calendarId)
                            .all()];
                case 3:
                    rows = _b.sent();
                    homeMatches = rows.results.map(function (r) {
                        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
                        var facilities = {};
                        for (var _i = 0, FACILITY_KEYS_1 = FACILITY_KEYS; _i < FACILITY_KEYS_1.length; _i++) {
                            var k = FACILITY_KEYS_1[_i];
                            facilities[k] = (_a = r[k]) !== null && _a !== void 0 ? _a : 0;
                        }
                        var capacity = Math.max(1, ((_b = r.capacity) !== null && _b !== void 0 ? _b : 200) + (0, stadium_generator_1.calculateFacilityEffects)(facilities).capacityBonus);
                        var attendance = (_c = r.attendance) !== null && _c !== void 0 ? _c : 0;
                        var primary = (_d = r.home_primary) !== null && _d !== void 0 ? _d : "#2D5F2D";
                        var bannerColor = (_e = r.ultras_banner_color) !== null && _e !== void 0 ? _e : primary;
                        var textColor = (_f = r.ultras_text_color) !== null && _f !== void 0 ? _f : (isLightHex(bannerColor) ? "#1a1a1a" : "#ffffff");
                        return {
                            homeTeamId: r.home_team_id,
                            homeName: r.home_name,
                            awayName: r.away_name,
                            homeScore: (_g = r.home_score) !== null && _g !== void 0 ? _g : 0,
                            awayScore: (_h = r.away_score) !== null && _h !== void 0 ? _h : 0,
                            attendance: attendance,
                            weather: (_j = r.weather) !== null && _j !== void 0 ? _j : null,
                            capacity: capacity,
                            fillPct: Math.round((100 * attendance) / capacity),
                            ultrasStand: (_k = r.ultras_stand) !== null && _k !== void 0 ? _k : 0,
                            ultrasText: (_l = r.ultras_text) !== null && _l !== void 0 ? _l : null,
                            bannerColor: bannerColor,
                            textColor: textColor,
                            primaryColor: primary,
                            secondaryColor: (_m = r.home_secondary) !== null && _m !== void 0 ? _m : "#ffffff",
                        };
                    });
                    photos = pickGallery(homeMatches);
                    article = "";
                    _b.label = 4;
                case 4:
                    _b.trys.push([4, 6, , 7]);
                    return [4 /*yield*/, callGeminiUltras(geminiApiKey, gameWeek, homeMatches, photos)];
                case 5:
                    article = _b.sent();
                    return [3 /*break*/, 7];
                case 6:
                    e_1 = _b.sent();
                    logger_1.logger.warn({ module: "ultras-report" }, "gemini failed, using fallback", e_1);
                    return [3 /*break*/, 7];
                case 7:
                    if (!article || article.trim().length < 10)
                        article = fallbackArticle(gameWeek, homeMatches);
                    lines = article.trim().split("\n");
                    headline = ((_a = lines.shift()) !== null && _a !== void 0 ? _a : "Kotel hodnot\u00ED ".concat(gameWeek, ". kolo")).replace(/^#+\s*/, "").trim();
                    body = lines.join("\n").trim() || headline;
                    newsId = crypto.randomUUID();
                    return [4 /*yield*/, db
                            .prepare("INSERT INTO news (id, league_id, type, headline, body, game_week, created_at) VALUES (?, ?, 'ultras_report', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))")
                            .bind(newsId, leagueId, headline, body, gameWeek)
                            .run()];
                case 8:
                    _b.sent();
                    return [4 /*yield*/, db
                            .prepare("INSERT OR IGNORE INTO ultras_reports (id, league_id, calendar_id, game_week, season_number, news_id, photos_json) VALUES (?, ?, ?, ?, ?, ?, ?)")
                            .bind(crypto.randomUUID(), leagueId, calendarId, gameWeek, seasonNumber !== null && seasonNumber !== void 0 ? seasonNumber : 0, newsId, JSON.stringify(photos))
                            .run()];
                case 9:
                    _b.sent();
                    return [2 /*return*/, { newsId: newsId, photos: photos.length, skipped: false }];
            }
        });
    });
}
/** Inline Gemini REST volání (vzor ai-reporter.ts). Volný text, 1. řádek = headline. */
/** Kotel popsaný lidsky (bez herních „level" termínů) — pro grounding Gemini. */
function kotelDesc(level) {
    if (level >= 3)
        return "velký kotel (spousta vlajek, bubny)";
    if (level === 2)
        return "pořádný kotel (vlajky, buben)";
    if (level === 1)
        return "malý kotel (pár vlajek)";
    return "bez kotle";
}
/** Zaplněnost stadionu slovy (bez procent) — fanouškovské, ne stats. */
function fullnessDesc(fillPct) {
    if (fillPct >= 95)
        return "vyprodáno";
    if (fillPct >= 80)
        return "narváno";
    if (fillPct >= 55)
        return "slušně zaplněno";
    if (fillPct >= 30)
        return "poloprázdno";
    return "skoro prázdno";
}
function callGeminiUltras(apiKey, gameWeek, homeMatches, photos) {
    return __awaiter(this, void 0, void 0, function () {
        var facts, galleryNote, prompt, res, data, parts, text;
        var _a, _b, _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    facts = homeMatches
                        .map(function (m) { return "- ".concat(m.homeName, " (doma) vs ").concat(m.awayName, " ").concat(m.homeScore, ":").concat(m.awayScore, ": dorazilo ").concat(m.attendance, " div\u00E1k\u016F (").concat(fullnessDesc(m.fillPct), "), ").concat(kotelDesc(m.ultrasStand)).concat(m.ultrasText ? ", na placht\u011B \u201E".concat(m.ultrasText, "\"") : "").concat(m.weather ? ", ".concat(m.weather) : ""); })
                        .join("\n");
                    galleryNote = photos.length
                        ? "Na fotk\u00E1ch budou kotle: ".concat(photos.map(function (p) { return "".concat(p.teamName, " (").concat(p.caption, ")"); }).join("; "), ".")
                        : "V tomto kole neměl doma pořádný kotel nikdo — zmiň to s nadhledem.";
                    prompt = "Jsi pisatel fanou\u0161kovsk\u00E9ho zpravodaje \"Prales Ultras\" v amat\u00E9rsk\u00E9 fotbalov\u00E9 lize. P\u00ED\u0161e\u0161 z pohledu lid\u00ED na kotli, zaujat\u011B pro atmosf\u00E9ru, s vtipem a nads\u00E1zkou, ale V\u00DDHRADN\u011A z dodan\u00FDch dat \u2014 NIKDY nevym\u00FD\u0161lej jm\u00E9na ani \u010D\u00EDsla.\n\nNapi\u0161 kr\u00E1tk\u00FD \u010Dl\u00E1nek (120\u2013200 slov) hodnot\u00EDc\u00ED ATMOSF\u00C9RU ".concat(gameWeek, ". kola. P\u00E1te\u0159\u00ED je \u017Eeb\u0159\u00ED\u010Dek:\n- kam p\u0159i\u0161lo NEJV\u00CDC lid\u00ED a kam NEJM\u00CD\u0147,\n- kde bylo vyprod\u00E1no / pln\u00FD d\u016Fm a kde zely ochozy pr\u00E1zdnotou,\n- zmi\u0148 prvky kotl\u016F (plachta s n\u00E1pisem, vlajky, buben) u t\u00FDm\u016F, co je maj\u00ED.\n\nD\u016ELE\u017DIT\u00C9: P\u00ED\u0161e\u0161 jako fanou\u0161ek, NE jako hra. NIKDY nepou\u017E\u00EDvej hern\u00ED ani technick\u00E9 term\u00EDny ani procenta zapln\u011Bnosti \u2014 \u017E\u00E1dn\u00E9 \u201Elevel\", \u201E\u00FArove\u0148\", \u010D\u00EDsla \u00FArovn\u00ED kotle, \u201Efill\", \u201Ekapacita\", \u201EX % zapln\u011Bno / z kapacity\". Po\u010Dty div\u00E1k\u016F (kolik lid\u00ED dorazilo) pou\u017E\u00EDvej klidn\u011B. Zapln\u011Bnost a kotel popi\u0161 lidsky: vyprod\u00E1no / narv\u00E1no / polopr\u00E1zdno, velk\u00FD/mal\u00FD kotel, kolik vlajek, jestli bu\u0161\u00ED buben, jestli vis\u00ED plachta.\n\nDATA (jen tato sm\u00ED\u0161 pou\u017E\u00EDt):\n").concat(facts, "\n\n").concat(galleryNote, "\n\nForm\u00E1t: PRVN\u00CD \u0158\u00C1DEK je \u00FAdern\u00FD titulek (bez markdownu). Dal\u0161\u00ED \u0159\u00E1dky jsou t\u011Blo \u010Dl\u00E1nku. V t\u011Ble sm\u00ED\u0161 zv\u00FDraznit **tu\u010Dn\u011B** n\u00E1zvy t\u00FDm\u016F a kl\u00ED\u010Dov\u00E1 \u010D\u00EDsla. Pi\u0161 \u010Desky.");
                    return [4 /*yield*/, fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=".concat(apiKey), {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                contents: [{ parts: [{ text: prompt }] }],
                                generationConfig: { maxOutputTokens: 2048, temperature: 0.6, thinkingConfig: { thinkingBudget: 0 } },
                            }),
                        })];
                case 1:
                    res = _e.sent();
                    if (!res.ok)
                        throw new Error("Gemini HTTP ".concat(res.status));
                    return [4 /*yield*/, res.json()];
                case 2:
                    data = (_e.sent());
                    parts = (_d = (_c = (_b = (_a = data.candidates) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.content) === null || _c === void 0 ? void 0 : _c.parts) !== null && _d !== void 0 ? _d : [];
                    text = parts.filter(function (p) { return !p.thought; }).map(function (p) { var _a; return (_a = p.text) !== null && _a !== void 0 ? _a : ""; }).join("");
                    if (!text)
                        throw new Error("Gemini empty response");
                    return [2 /*return*/, text];
            }
        });
    });
}
