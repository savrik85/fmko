"use strict";
/**
 * Match runner — orchestruje plnou simulaci zápasu.
 * Volán z daily-tick nebo cron triggeru.
 */
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
exports.recoverStuckRounds = recoverStuckRounds;
exports.runScheduledMatches = runScheduledMatches;
exports.buildMatchPlayers = buildMatchPlayers;
exports.copyOrCreateLineup = copyOrCreateLineup;
exports.createAutoLineup = createAutoLineup;
var simulation_1 = require("../engine/simulation");
var weather_1 = require("../season/weather");
var commentary_1 = require("../engine/commentary");
var rng_1 = require("../generators/rng");
var update_stats_1 = require("../stats/update-stats");
var logger_1 = require("../lib/logger");
/**
 * Recovery pro kola uvízlá v 'lineup_locked' — simulace spadla mezi zamčením kola
 * a přepnutím na 'simulated' (typicky worker CPU/subrequest limit u velkého kola).
 *
 * Bez tohoto match-tick i POST /game/run-matches locked kolo IGNORUJÍ (hledají výhradně
 * status='scheduled') a zároveň ho nedohrají → celá liga se zasekne, protože další kolo
 * má scheduled_at v budoucnu mimo game_date. Viz incident 2026-06-01 (Okresní přebor
 * Prachatice, kolo 16: 2/7 zápasů odsimulováno, zbytek uvízl).
 *
 * runScheduledMatches je idempotentní (bere jen 'lineups_open'), takže již odsimulované
 * zápasy zůstanou beze změny — žádné zdvojení skóre/financí. Zpracuje max `limit` kol
 * za invokaci (ochrana před vyčerpáním času workeru).
 */
function recoverStuckRounds(db_1, geminiApiKey_1) {
    return __awaiter(this, arguments, void 0, function (db, geminiApiKey, limit) {
        var stuck, recovered, _i, _a, round, results, calRow, gameWeek, matchRows, lines, _b, _c, r, hs, as_, hn, an, e_1;
        var _d;
        if (limit === void 0) { limit = 1; }
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0: return [4 /*yield*/, db.prepare("SELECT id, league_id FROM season_calendar WHERE status = 'lineup_locked' ORDER BY scheduled_at ASC LIMIT ?").bind(limit).all()];
                case 1:
                    stuck = _e.sent();
                    recovered = [];
                    _i = 0, _a = stuck.results;
                    _e.label = 2;
                case 2:
                    if (!(_i < _a.length)) return [3 /*break*/, 12];
                    round = _a[_i];
                    // Dosud nezasimulované zápasy kola → lineups_open (idempotentní: simulated zůstanou)
                    return [4 /*yield*/, db.prepare("UPDATE matches SET status = 'lineups_open' WHERE calendar_id = ? AND status = 'scheduled'").bind(round.id).run()];
                case 3:
                    // Dosud nezasimulované zápasy kola → lineups_open (idempotentní: simulated zůstanou)
                    _e.sent();
                    return [4 /*yield*/, runScheduledMatches(db, round.id, geminiApiKey)];
                case 4:
                    results = _e.sent();
                    return [4 /*yield*/, db.prepare("UPDATE season_calendar SET status = 'simulated' WHERE id = ?")
                            .bind(round.id).run()];
                case 5:
                    _e.sent();
                    recovered.push({ calendarId: round.id, leagueId: round.league_id, matches: results.length });
                    if (!(results.length > 0)) return [3 /*break*/, 11];
                    _e.label = 6;
                case 6:
                    _e.trys.push([6, 10, , 11]);
                    return [4 /*yield*/, db.prepare("SELECT game_week FROM season_calendar WHERE id = ?")
                            .bind(round.id).first()];
                case 7:
                    calRow = _e.sent();
                    gameWeek = (_d = calRow === null || calRow === void 0 ? void 0 : calRow.game_week) !== null && _d !== void 0 ? _d : 0;
                    return [4 /*yield*/, db.prepare("SELECT m.home_score, m.away_score, t1.name as home_name, t2.name as away_name FROM matches m JOIN teams t1 ON m.home_team_id = t1.id JOIN teams t2 ON m.away_team_id = t2.id WHERE m.calendar_id = ? AND m.status = 'simulated'").bind(round.id).all()];
                case 8:
                    matchRows = _e.sent();
                    lines = [];
                    for (_b = 0, _c = matchRows.results; _b < _c.length; _b++) {
                        r = _c[_b];
                        hs = r.home_score;
                        as_ = r.away_score;
                        hn = r.home_name;
                        an = r.away_name;
                        if (hs > as_)
                            lines.push("".concat(hn, " porazil ").concat(an, " ").concat(hs, ":").concat(as_));
                        else if (hs < as_)
                            lines.push("".concat(an, " zv\u00EDt\u011Bzil nad ").concat(hn, " ").concat(as_, ":").concat(hs));
                        else
                            lines.push("".concat(hn, " remizoval s ").concat(an, " ").concat(hs, ":").concat(as_));
                    }
                    return [4 /*yield*/, db.prepare("INSERT INTO news (id, league_id, type, headline, body, game_week, created_at) VALUES (?, ?, 'round_results', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))")
                            .bind(crypto.randomUUID(), round.league_id, "".concat(gameWeek, ". kolo: p\u0159ehled v\u00FDsledk\u016F"), lines.join(". ") + ".", gameWeek).run()];
                case 9:
                    _e.sent();
                    return [3 /*break*/, 11];
                case 10:
                    e_1 = _e.sent();
                    logger_1.logger.warn({ module: "match-runner" }, "recovery round_results news failed", e_1);
                    return [3 /*break*/, 11];
                case 11:
                    _i++;
                    return [3 /*break*/, 2];
                case 12: return [2 /*return*/, recovered];
            }
        });
    });
}
function runScheduledMatches(db, calendarId, geminiApiKey) {
    return __awaiter(this, void 0, void 0, function () {
        var results, matches, weathers, weatherWeights, weatherRoll, cumulative, weather, i, _loop_1, _i, _a, match, generateRoundSummary, e_2, generatePlayerInterview, e_3;
        var _this = this;
        var _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7, _8, _9, _10, _11, _12, _13, _14, _15, _16, _17, _18;
        return __generator(this, function (_19) {
            switch (_19.label) {
                case 0:
                    results = [];
                    return [4 /*yield*/, db.prepare("SELECT * FROM matches WHERE calendar_id = ? AND status = 'lineups_open'").bind(calendarId).all()];
                case 1:
                    matches = _19.sent();
                    weathers = ["sunny", "cloudy", "rain", "wind", "snow"];
                    weatherWeights = [30, 30, 20, 15, 5];
                    weatherRoll = Math.random() * 100;
                    cumulative = 0;
                    weather = "cloudy";
                    for (i = 0; i < weathers.length; i++) {
                        cumulative += weatherWeights[i];
                        if (weatherRoll < cumulative) {
                            weather = weathers[i];
                            break;
                        }
                    }
                    _loop_1 = function (match) {
                        var matchId, homeTeamId, awayTeamId, hasHomeLineup, hasAwayLineup, seedFromString, rng, homeTeam, awayTeam, homeIsHuman, awayIsHuman, matchType, loadLineup, homeLineupRow_1, awayLineupRow_1, homeBuild_1, awayBuild_1, homeLineup_3, awayLineup, homeSubs_3, awaySubs, homeLineupPreSim, awayLineupPreSim, homeSubsPreSim, awaySubsPreSim, fullIdMap_1, _20, _21, _22, k, v, _23, _24, _25, k, v, fullPosMap_1, _26, _27, _28, k, v, _29, _30, _31, k, v, _loop_2, _32, _33, _34, teamDbId, lineup, idMap, e_4, homeTactic, awayTactic, homeFormation, awayFormation, homeCaptainEngineId, awayCaptainEngineId, readFamiliarity, homeFam, awayFam, homeSetup, awaySetup, stadiumRow, pitchCondition, stadiumNameRow, stadiumName, calculateFacilityEffects, facilities, _35, _36, key, facilityEffects, stadiumCapacity, homeInfo, rep, _37, loadFanbaseAggregate, loadRegionalPopulation, expectedAttendance, homeAdvantageFromFanbase, BUS_CONFIG_1, fanbaseAgg, regionalPopulation, expected, popBase, busRows, busDropIn, _38, _39, b, cfg, repBonus, recentWins, formBonus, rawAttendance, celebAttendanceMultiplier, allLineupIds, celebRows, _40, _41, celebRow, pers, bonusMap, typeBonus, bonus, fansSatRow, fansSat, satisfactionAttendanceMul, promoRow, promoBoost, preMatchHeat, _42, getRelation, DERBY_HEAT_THRESHOLD, rel, e_5, derbyAttendanceMul, wf, shieldedWeather, attendance, homeMoraleBoost, _43, homeLineup_1, p, _44, homeSubs_1, p, haInfo, haMoraleBoost, _45, homeLineup_2, p, _46, homeSubs_2, p, calculateEffects_1, loadEquipMods, _47, homeEquipment, awayEquipment, loadStaffMods, _48, homeStaffFx_1, awayStaffFx, zeroEquipMods_1, mergeStaff, applyManagerBonus, acceptedOfficials, officialCount, homeAdvantage, crowdBoost, attendanceWithOfficials, result, commDistrict, commentary, buildLineupData, matchAbsences, applyMatchResult, e_6, _49, applyBusConversion, applyPromoConversion, applyTierPromotion, applyLossStreakPenalty, busResult, wasPromoted, promoResult, tierResult, lossResult, e_7, applyPostMatchRelations, e_8, season, playerPositions, _50, _51, p, ratings, momPlayerId, homeUpdatesPreview, goalsByPlayer, applyLocalSensations, e_9, homeStarterIds_1, homeUpdates, awayStarterIds_1, awayUpdates, allEntries, allUpdates, suspensionStmts, _52, allUpdates_1, u, _53, allUpdates_2, u, stats, injuryTypeMap, injuryStmts, _54, _55, event_1, evTeamId, idMap, realPlayerId, injuryReduction, days, injType, severity, _56, processMatchDayFinances, processCashLoanRepayment, homeResult, awayResult, gameDate, repRows, repMap, homeRep, awayRep, e_10, _57, _58, tid, isHome, gf, ga, margin, won, lost, bigWin, blowoutLoss, upAttr, downAttr, repDelta, e_11, logConditionStmt, preSimCondById, _59, _60, p, stmts, _61, _62, p, dbId, oldCond, teamIdForPlayer, e_12, matchRng, _63, _64, _65, engineId, pm, dbId, minutes, playerRow, age, ageMod, minutesMod, improveChance, skills, posSkills, candidates, attr, current, e_13, vr, isDerby, checkMatchAchievements, e_14, e_15;
                        var _66;
                        return __generator(this, function (_67) {
                            switch (_67.label) {
                                case 0:
                                    matchId = match.id;
                                    homeTeamId = match.home_team_id;
                                    awayTeamId = match.away_team_id;
                                    _67.label = 1;
                                case 1:
                                    _67.trys.push([1, 134, , 135]);
                                    return [4 /*yield*/, db.prepare("SELECT id FROM lineups WHERE team_id = ? AND calendar_id = ?").bind(homeTeamId, calendarId).first()];
                                case 2:
                                    hasHomeLineup = _67.sent();
                                    if (!!hasHomeLineup) return [3 /*break*/, 4];
                                    return [4 /*yield*/, copyOrCreateLineup(db, homeTeamId, calendarId)];
                                case 3:
                                    _67.sent();
                                    _67.label = 4;
                                case 4: return [4 /*yield*/, db.prepare("SELECT id FROM lineups WHERE team_id = ? AND calendar_id = ?").bind(awayTeamId, calendarId).first()];
                                case 5:
                                    hasAwayLineup = _67.sent();
                                    if (!!hasAwayLineup) return [3 /*break*/, 7];
                                    return [4 /*yield*/, copyOrCreateLineup(db, awayTeamId, calendarId)];
                                case 6:
                                    _67.sent();
                                    _67.label = 7;
                                case 7: return [4 /*yield*/, Promise.resolve().then(function () { return require("../lib/seed"); })];
                                case 8:
                                    seedFromString = (_67.sent()).seedFromString;
                                    rng = (0, rng_1.createRng)(seedFromString(calendarId) + Date.now());
                                    return [4 /*yield*/, db.prepare("SELECT name, user_id FROM teams WHERE id = ?").bind(homeTeamId).first()];
                                case 9:
                                    homeTeam = _67.sent();
                                    return [4 /*yield*/, db.prepare("SELECT name, user_id FROM teams WHERE id = ?").bind(awayTeamId).first()];
                                case 10:
                                    awayTeam = _67.sent();
                                    homeIsHuman = !!homeTeam && homeTeam.user_id !== "ai";
                                    awayIsHuman = !!awayTeam && awayTeam.user_id !== "ai";
                                    matchType = homeIsHuman && awayIsHuman ? "pvp"
                                        : homeIsHuman ? "pve_home" : awayIsHuman ? "pve_away" : "ai_vs_ai";
                                    loadLineup = function (tid) { return __awaiter(_this, void 0, void 0, function () {
                                        var exact;
                                        return __generator(this, function (_a) {
                                            switch (_a.label) {
                                                case 0: return [4 /*yield*/, db.prepare("SELECT formation, tactic, players_data, is_auto, captain_id FROM lineups WHERE team_id = ? AND calendar_id = ? ORDER BY is_auto ASC, submitted_at DESC, id ASC LIMIT 1")
                                                        .bind(tid, calendarId).first().catch(function (e) {
                                                        logger_1.logger.warn({ module: "match-runner" }, "Failed to load lineup exact", e);
                                                        return null;
                                                    })];
                                                case 1:
                                                    exact = _a.sent();
                                                    if (exact)
                                                        return [2 /*return*/, exact];
                                                    // Fallback: poslední user-saved sestava (jakýkoliv calendar, ne auto)
                                                    return [2 /*return*/, db.prepare("SELECT formation, tactic, players_data, is_auto, captain_id FROM lineups WHERE team_id = ? AND is_auto = 0 ORDER BY submitted_at DESC, id ASC LIMIT 1")
                                                            .bind(tid).first().catch(function (e) {
                                                            logger_1.logger.warn({ module: "match-runner" }, "Failed to load lineup fallback", e);
                                                            return null;
                                                        })];
                                            }
                                        });
                                    }); };
                                    return [4 /*yield*/, loadLineup(homeTeamId)];
                                case 11:
                                    homeLineupRow_1 = _67.sent();
                                    return [4 /*yield*/, loadLineup(awayTeamId)];
                                case 12:
                                    awayLineupRow_1 = _67.sent();
                                    return [4 /*yield*/, buildMatchPlayers(db, homeTeamId, (_b = homeLineupRow_1 === null || homeLineupRow_1 === void 0 ? void 0 : homeLineupRow_1.players_data) !== null && _b !== void 0 ? _b : null, 0, { matchKey: calendarId })];
                                case 13:
                                    homeBuild_1 = _67.sent();
                                    return [4 /*yield*/, buildMatchPlayers(db, awayTeamId, (_c = awayLineupRow_1 === null || awayLineupRow_1 === void 0 ? void 0 : awayLineupRow_1.players_data) !== null && _c !== void 0 ? _c : null, 100, { matchKey: calendarId })];
                                case 14:
                                    awayBuild_1 = _67.sent();
                                    homeLineup_3 = homeBuild_1.players;
                                    awayLineup = awayBuild_1.players;
                                    homeSubs_3 = homeLineup_3.splice(11);
                                    awaySubs = awayLineup.splice(11);
                                    homeLineupPreSim = homeLineup_3.map(function (p) { return (__assign({}, p)); });
                                    awayLineupPreSim = awayLineup.map(function (p) { return (__assign({}, p)); });
                                    homeSubsPreSim = homeSubs_3.map(function (p) { return (__assign({}, p)); });
                                    awaySubsPreSim = awaySubs.map(function (p) { return (__assign({}, p)); });
                                    fullIdMap_1 = new Map();
                                    for (_20 = 0, _21 = homeBuild_1.idMap; _20 < _21.length; _20++) {
                                        _22 = _21[_20], k = _22[0], v = _22[1];
                                        fullIdMap_1.set(k, v);
                                    }
                                    for (_23 = 0, _24 = awayBuild_1.idMap; _23 < _24.length; _23++) {
                                        _25 = _24[_23], k = _25[0], v = _25[1];
                                        fullIdMap_1.set(k, v);
                                    }
                                    fullPosMap_1 = new Map();
                                    for (_26 = 0, _27 = homeBuild_1.positionMap; _26 < _27.length; _26++) {
                                        _28 = _27[_26], k = _28[0], v = _28[1];
                                        fullPosMap_1.set(k, v);
                                    }
                                    for (_29 = 0, _30 = awayBuild_1.positionMap; _29 < _30.length; _29++) {
                                        _31 = _30[_29], k = _31[0], v = _31[1];
                                        fullPosMap_1.set(k, v);
                                    }
                                    _67.label = 15;
                                case 15:
                                    _67.trys.push([15, 20, , 21]);
                                    _loop_2 = function (teamDbId, lineup, idMap) {
                                        var dbPlayerIds, placeholders, relRows, dbToEngine, _68, idMap_1, _69, engineId, dbId, _70, lineup_1, p, pDbId, rels, _loop_3, _71, _72, r;
                                        var _73;
                                        return __generator(this, function (_74) {
                                            switch (_74.label) {
                                                case 0:
                                                    dbPlayerIds = __spreadArray([], idMap.entries(), true).filter(function (_a) {
                                                        var engineId = _a[0];
                                                        return lineup.some(function (p) { return p.id === engineId; });
                                                    }).map(function (_a) {
                                                        var dbId = _a[1];
                                                        return dbId;
                                                    });
                                                    if (dbPlayerIds.length < 2)
                                                        return [2 /*return*/, "continue"];
                                                    placeholders = dbPlayerIds.map(function () { return "?"; }).join(",");
                                                    return [4 /*yield*/, (_73 = db.prepare("SELECT player_a_id, player_b_id, type\n                         FROM relationships\n                         WHERE player_a_id IN (".concat(placeholders, ")\n                            OR player_b_id IN (").concat(placeholders, ")"))).bind.apply(_73, __spreadArray(__spreadArray([], dbPlayerIds, false), dbPlayerIds, false)).all().catch(function (e) {
                                                            logger_1.logger.warn({ module: "match-runner" }, "relationships query", e);
                                                            return { results: [] };
                                                        })];
                                                case 1:
                                                    relRows = _74.sent();
                                                    dbToEngine = new Map();
                                                    for (_68 = 0, idMap_1 = idMap; _68 < idMap_1.length; _68++) {
                                                        _69 = idMap_1[_68], engineId = _69[0], dbId = _69[1];
                                                        dbToEngine.set(dbId, engineId);
                                                    }
                                                    for (_70 = 0, lineup_1 = lineup; _70 < lineup_1.length; _70++) {
                                                        p = lineup_1[_70];
                                                        pDbId = idMap.get(p.id);
                                                        if (!pDbId)
                                                            continue;
                                                        rels = [];
                                                        _loop_3 = function (r) {
                                                            var otherId = r.player_a_id === pDbId ? r.player_b_id : r.player_b_id === pDbId ? r.player_a_id : null;
                                                            if (!otherId)
                                                                return "continue";
                                                            var otherEngineId = dbToEngine.get(otherId);
                                                            if (otherEngineId != null && lineup.some(function (lp) { return lp.id === otherEngineId; })) {
                                                                rels.push({ withId: otherEngineId, type: r.type });
                                                            }
                                                        };
                                                        for (_71 = 0, _72 = relRows.results; _71 < _72.length; _71++) {
                                                            r = _72[_71];
                                                            _loop_3(r);
                                                        }
                                                        if (rels.length > 0)
                                                            p.relationshipsInLineup = rels;
                                                    }
                                                    return [2 /*return*/];
                                            }
                                        });
                                    };
                                    _32 = 0, _33 = [
                                        [homeTeamId, homeLineup_3, homeBuild_1.idMap],
                                        [awayTeamId, awayLineup, awayBuild_1.idMap],
                                    ];
                                    _67.label = 16;
                                case 16:
                                    if (!(_32 < _33.length)) return [3 /*break*/, 19];
                                    _34 = _33[_32], teamDbId = _34[0], lineup = _34[1], idMap = _34[2];
                                    return [5 /*yield**/, _loop_2(teamDbId, lineup, idMap)];
                                case 17:
                                    _67.sent();
                                    _67.label = 18;
                                case 18:
                                    _32++;
                                    return [3 /*break*/, 16];
                                case 19: return [3 /*break*/, 21];
                                case 20:
                                    e_4 = _67.sent();
                                    logger_1.logger.warn({ module: "match-runner" }, "relationship injection failed", e_4);
                                    return [3 /*break*/, 21];
                                case 21:
                                    homeTactic = (_d = homeLineupRow_1 === null || homeLineupRow_1 === void 0 ? void 0 : homeLineupRow_1.tactic) !== null && _d !== void 0 ? _d : "balanced";
                                    awayTactic = (_e = awayLineupRow_1 === null || awayLineupRow_1 === void 0 ? void 0 : awayLineupRow_1.tactic) !== null && _e !== void 0 ? _e : "balanced";
                                    homeFormation = (_f = homeLineupRow_1 === null || homeLineupRow_1 === void 0 ? void 0 : homeLineupRow_1.formation) !== null && _f !== void 0 ? _f : "4-4-2";
                                    awayFormation = (_g = awayLineupRow_1 === null || awayLineupRow_1 === void 0 ? void 0 : awayLineupRow_1.formation) !== null && _g !== void 0 ? _g : "4-4-2";
                                    homeCaptainEngineId = (homeLineupRow_1 === null || homeLineupRow_1 === void 0 ? void 0 : homeLineupRow_1.captain_id) ? (_h = __spreadArray([], homeBuild_1.idMap.entries(), true).find(function (_a) {
                                        var dbId = _a[1];
                                        return dbId === homeLineupRow_1.captain_id;
                                    })) === null || _h === void 0 ? void 0 : _h[0] : undefined;
                                    awayCaptainEngineId = (awayLineupRow_1 === null || awayLineupRow_1 === void 0 ? void 0 : awayLineupRow_1.captain_id) ? (_j = __spreadArray([], awayBuild_1.idMap.entries(), true).find(function (_a) {
                                        var dbId = _a[1];
                                        return dbId === awayLineupRow_1.captain_id;
                                    })) === null || _j === void 0 ? void 0 : _j[0] : undefined;
                                    return [4 /*yield*/, Promise.resolve().then(function () { return require("../engine/chemistry"); })];
                                case 22:
                                    readFamiliarity = (_67.sent()).readFamiliarity;
                                    return [4 /*yield*/, readFamiliarity(db, homeTeamId)];
                                case 23:
                                    homeFam = _67.sent();
                                    return [4 /*yield*/, readFamiliarity(db, awayTeamId)];
                                case 24:
                                    awayFam = _67.sent();
                                    homeSetup = {
                                        teamId: 1,
                                        teamName: (_k = homeTeam === null || homeTeam === void 0 ? void 0 : homeTeam.name) !== null && _k !== void 0 ? _k : "Domácí",
                                        lineup: homeLineup_3,
                                        subs: homeSubs_3,
                                        tactic: homeTactic,
                                        formation: homeFormation,
                                        captainId: homeCaptainEngineId,
                                        formationFamiliarity: (_l = homeFam.formation[homeFormation]) !== null && _l !== void 0 ? _l : 0,
                                    };
                                    awaySetup = {
                                        teamId: 2,
                                        teamName: (_m = awayTeam === null || awayTeam === void 0 ? void 0 : awayTeam.name) !== null && _m !== void 0 ? _m : "Hosté",
                                        lineup: awayLineup,
                                        subs: awaySubs,
                                        tactic: awayTactic,
                                        formation: awayFormation,
                                        captainId: awayCaptainEngineId,
                                        formationFamiliarity: (_o = awayFam.formation[awayFormation]) !== null && _o !== void 0 ? _o : 0,
                                    };
                                    return [4 /*yield*/, db.prepare("SELECT * FROM stadiums WHERE team_id = ?")
                                            .bind(homeTeamId).first().catch(function (e) {
                                            logger_1.logger.warn({ module: "match-runner" }, "Failed to load stadium", e);
                                            return null;
                                        })];
                                case 25:
                                    stadiumRow = _67.sent();
                                    pitchCondition = (_p = stadiumRow === null || stadiumRow === void 0 ? void 0 : stadiumRow.pitch_condition) !== null && _p !== void 0 ? _p : 50;
                                    return [4 /*yield*/, db.prepare("SELECT stadium_name FROM teams WHERE id = ?")
                                            .bind(homeTeamId).first().catch(function (e) {
                                            logger_1.logger.warn({ module: "match-runner" }, "Failed to load stadium name", e);
                                            return null;
                                        })];
                                case 26:
                                    stadiumNameRow = _67.sent();
                                    stadiumName = (_q = stadiumNameRow === null || stadiumNameRow === void 0 ? void 0 : stadiumNameRow.stadium_name) !== null && _q !== void 0 ? _q : null;
                                    return [4 /*yield*/, Promise.resolve().then(function () { return require("../stadium/stadium-generator"); })];
                                case 27:
                                    calculateFacilityEffects = (_67.sent()).calculateFacilityEffects;
                                    facilities = {};
                                    if (stadiumRow) {
                                        for (_35 = 0, _36 = ["changing_rooms", "showers", "refreshments", "stands", "parking", "fence", "roof", "ultras_stand", "toilets"]; _35 < _36.length; _35++) {
                                            key = _36[_35];
                                            facilities[key] = (_r = stadiumRow[key]) !== null && _r !== void 0 ? _r : 0;
                                        }
                                    }
                                    facilityEffects = calculateFacilityEffects(facilities);
                                    stadiumCapacity = ((_s = stadiumRow === null || stadiumRow === void 0 ? void 0 : stadiumRow.capacity) !== null && _s !== void 0 ? _s : 200) + facilityEffects.capacityBonus;
                                    return [4 /*yield*/, db.prepare("SELECT v.population, v.size, t.reputation FROM villages v JOIN teams t ON t.village_id = v.id WHERE t.id = ?").bind(homeTeamId).first().catch(function (e) {
                                            logger_1.logger.warn({ module: "match-runner" }, "Failed to load home village info", e);
                                            return null;
                                        })];
                                case 28:
                                    homeInfo = _67.sent();
                                    rep = (_t = homeInfo === null || homeInfo === void 0 ? void 0 : homeInfo.reputation) !== null && _t !== void 0 ? _t : 50;
                                    return [4 /*yield*/, Promise.resolve().then(function () { return require("../season/fanbase-helpers"); })];
                                case 29:
                                    _37 = _67.sent(), loadFanbaseAggregate = _37.loadFanbaseAggregate, loadRegionalPopulation = _37.loadRegionalPopulation, expectedAttendance = _37.expectedAttendance, homeAdvantageFromFanbase = _37.homeAdvantageFromFanbase;
                                    return [4 /*yield*/, Promise.resolve().then(function () { return require("../season/fanbase-config"); })];
                                case 30:
                                    BUS_CONFIG_1 = (_67.sent()).BUS_CONFIG;
                                    return [4 /*yield*/, loadFanbaseAggregate(db, homeTeamId)];
                                case 31:
                                    fanbaseAgg = (_67.sent()).agg;
                                    return [4 /*yield*/, loadRegionalPopulation(db, homeTeamId)];
                                case 32:
                                    regionalPopulation = (_67.sent()).regionalPopulation;
                                    expected = expectedAttendance(fanbaseAgg, (_u = homeInfo === null || homeInfo === void 0 ? void 0 : homeInfo.population) !== null && _u !== void 0 ? _u : 500, regionalPopulation);
                                    popBase = expected.total;
                                    return [4 /*yield*/, db.prepare("SELECT bus_size FROM bus_subsidies WHERE team_id = ? AND match_id = ?").bind(homeTeamId, matchId).all()
                                            .catch(function (e) {
                                            logger_1.logger.warn({ module: "match-runner" }, "load bus subsidies for attendance", e);
                                            return { results: [] };
                                        })];
                                case 33:
                                    busRows = _67.sent();
                                    busDropIn = 0;
                                    for (_38 = 0, _39 = busRows.results; _38 < _39.length; _38++) {
                                        b = _39[_38];
                                        cfg = BUS_CONFIG_1.SIZES[b.bus_size];
                                        if (cfg) {
                                            busDropIn += Math.round(cfg.attendeesMin + Math.random() * (cfg.attendeesMax - cfg.attendeesMin));
                                        }
                                    }
                                    repBonus = Math.round(popBase * (rep / 100) * 0.3);
                                    return [4 /*yield*/, db.prepare("SELECT COUNT(*) as w\n                 FROM (SELECT CASE\n                                  WHEN (home_team_id = ? AND home_score > away_score) OR\n                                       (away_team_id = ? AND away_score > home_score) THEN 1\n                                  ELSE 0 END as win\n                       FROM matches\n                       WHERE (home_team_id = ? OR away_team_id = ?)\n                         AND status = 'simulated'\n                       ORDER BY simulated_at DESC LIMIT 5)\n                 WHERE win = 1").bind(homeTeamId, homeTeamId, homeTeamId, homeTeamId).first().catch(function (e) {
                                            logger_1.logger.warn({ module: "match-runner" }, "Failed to load recent wins", e);
                                            return { w: 0 };
                                        })];
                                case 34:
                                    recentWins = _67.sent();
                                    formBonus = Math.round(((_v = recentWins === null || recentWins === void 0 ? void 0 : recentWins.w) !== null && _v !== void 0 ? _v : 0) * popBase * 0.08);
                                    rawAttendance = Math.max(8, popBase + repBonus + formBonus + busDropIn + Math.round(Math.random() * 10 - 5));
                                    celebAttendanceMultiplier = 1.0;
                                    allLineupIds = __spreadArray(__spreadArray([], homeLineup_3, true), awayLineup, true).map(function (lp) { return fullIdMap_1.get(lp.id); }).filter(Boolean);
                                    if (!(allLineupIds.length > 0)) return [3 /*break*/, 36];
                                    return [4 /*yield*/, (_66 = db.prepare("SELECT is_celebrity, personality\n                     FROM players\n                     WHERE id IN (".concat(allLineupIds.map(function () { return "?"; }).join(","), ")\n                       AND is_celebrity = 1"))).bind.apply(_66, allLineupIds).all().catch(function (e) {
                                            logger_1.logger.warn({ module: "match-runner" }, "celeb attendance check", e);
                                            return { results: [] };
                                        })];
                                case 35:
                                    celebRows = _67.sent();
                                    for (_40 = 0, _41 = celebRows.results; _40 < _41.length; _40++) {
                                        celebRow = _41[_40];
                                        pers = JSON.parse(celebRow.personality);
                                        bonusMap = { S: 3.0, A: 2.0, B: 1.5, C: 1.25 };
                                        typeBonus = {
                                            legend: (_w = bonusMap[pers.celebrityTier]) !== null && _w !== void 0 ? _w : 1.5,
                                            fallen_star: 1.3,
                                            glass_man: 1.4
                                        };
                                        bonus = (_x = typeBonus[pers.celebrityType]) !== null && _x !== void 0 ? _x : 1.25;
                                        celebAttendanceMultiplier = Math.max(celebAttendanceMultiplier, bonus);
                                    }
                                    _67.label = 36;
                                case 36: return [4 /*yield*/, db.prepare("SELECT satisfaction FROM fans WHERE team_id = ?")
                                        .bind(homeTeamId).first().catch(function (e) {
                                        logger_1.logger.warn({ module: "match-runner" }, "load fans satisfaction", e);
                                        return null;
                                    })];
                                case 37:
                                    fansSatRow = _67.sent();
                                    fansSat = (_y = fansSatRow === null || fansSatRow === void 0 ? void 0 : fansSatRow.satisfaction) !== null && _y !== void 0 ? _y : 50;
                                    satisfactionAttendanceMul = 0.75 + (Math.max(0, Math.min(100, fansSat)) / 100) * 0.5;
                                    return [4 /*yield*/, db.prepare("SELECT promotion_boost FROM matches WHERE id = ?")
                                            .bind(matchId).first().catch(function (e) {
                                            logger_1.logger.warn({ module: "match-runner" }, "load promotion", e);
                                            return null;
                                        })];
                                case 38:
                                    promoRow = _67.sent();
                                    promoBoost = (_z = promoRow === null || promoRow === void 0 ? void 0 : promoRow.promotion_boost) !== null && _z !== void 0 ? _z : 1.0;
                                    preMatchHeat = 0;
                                    _67.label = 39;
                                case 39:
                                    _67.trys.push([39, 42, , 43]);
                                    return [4 /*yield*/, Promise.resolve().then(function () { return require("../community/manager-relations"); })];
                                case 40:
                                    _42 = _67.sent(), getRelation = _42.getRelation, DERBY_HEAT_THRESHOLD = _42.DERBY_HEAT_THRESHOLD;
                                    return [4 /*yield*/, getRelation(db, homeTeamId, awayTeamId)];
                                case 41:
                                    rel = _67.sent();
                                    preMatchHeat = rel.heat;
                                    if (preMatchHeat >= DERBY_HEAT_THRESHOLD) {
                                        logger_1.logger.info({ module: "match-runner", matchId: matchId }, "derby match (heat=".concat(preMatchHeat, ")"));
                                    }
                                    return [3 /*break*/, 43];
                                case 42:
                                    e_5 = _67.sent();
                                    logger_1.logger.warn({ module: "match-runner" }, "load manager relation pre-match", e_5);
                                    return [3 /*break*/, 43];
                                case 43:
                                    derbyAttendanceMul = preMatchHeat >= 60 ? 1.35 : 1.0;
                                    wf = (0, weather_1.weatherAttendanceFactor)(weather);
                                    shieldedWeather = wf + (1 - wf) * facilityEffects.weatherAttendanceShield;
                                    attendance = Math.min(Math.round(rawAttendance * promoBoost * (1 + facilityEffects.attendanceBonus) * celebAttendanceMultiplier * satisfactionAttendanceMul * derbyAttendanceMul * shieldedWeather), stadiumCapacity);
                                    homeMoraleBoost = facilityEffects.homeMoraleBonus + facilityEffects.homeCrowdMoraleBonus;
                                    if (homeMoraleBoost > 0) {
                                        for (_43 = 0, homeLineup_1 = homeLineup_3; _43 < homeLineup_1.length; _43++) {
                                            p = homeLineup_1[_43];
                                            p.morale = Math.min(100, p.morale + homeMoraleBoost);
                                        }
                                        for (_44 = 0, homeSubs_1 = homeSubs_3; _44 < homeSubs_1.length; _44++) {
                                            p = homeSubs_1[_44];
                                            p.morale = Math.min(100, p.morale + homeMoraleBoost);
                                        }
                                    }
                                    haInfo = homeAdvantageFromFanbase(fanbaseAgg, attendance, stadiumCapacity);
                                    haMoraleBoost = Math.max(-5, Math.min(10, Math.round(haInfo.total * 3)));
                                    if (haMoraleBoost !== 0) {
                                        for (_45 = 0, homeLineup_2 = homeLineup_3; _45 < homeLineup_2.length; _45++) {
                                            p = homeLineup_2[_45];
                                            p.morale = Math.max(0, Math.min(100, p.morale + haMoraleBoost));
                                        }
                                        for (_46 = 0, homeSubs_2 = homeSubs_3; _46 < homeSubs_2.length; _46++) {
                                            p = homeSubs_2[_46];
                                            p.morale = Math.max(0, Math.min(100, p.morale + haMoraleBoost));
                                        }
                                        logger_1.logger.info({ module: "match-runner", teamId: homeTeamId, matchId: matchId }, "fanbase HA: fans=".concat(haInfo.fromFans.toFixed(2), " atm=").concat(haInfo.atmosphere, " \u2192 morale ").concat(haMoraleBoost >= 0 ? "+" : "").concat(haMoraleBoost));
                                    }
                                    return [4 /*yield*/, Promise.resolve().then(function () { return require("../equipment/equipment-generator"); })];
                                case 44:
                                    calculateEffects_1 = (_67.sent()).calculateEffects;
                                    loadEquipMods = function (tid) { return __awaiter(_this, void 0, void 0, function () {
                                        var eq, levels, conditions, _i, _a, _b, k, v, eff;
                                        return __generator(this, function (_c) {
                                            switch (_c.label) {
                                                case 0: return [4 /*yield*/, db.prepare("SELECT * FROM equipment WHERE team_id = ?").bind(tid).first().catch(function (e) {
                                                        logger_1.logger.warn({ module: "match-runner" }, "Failed to load equipment", e);
                                                        return null;
                                                    })];
                                                case 1:
                                                    eq = _c.sent();
                                                    if (!eq)
                                                        return [2 /*return*/, undefined];
                                                    levels = {};
                                                    conditions = {};
                                                    for (_i = 0, _a = Object.entries(eq); _i < _a.length; _i++) {
                                                        _b = _a[_i], k = _b[0], v = _b[1];
                                                        if (k === "id" || k === "team_id")
                                                            continue;
                                                        if (k.endsWith("_condition"))
                                                            conditions[k] = v;
                                                        else if (typeof v === "number")
                                                            levels[k] = v;
                                                    }
                                                    eff = calculateEffects_1(levels, conditions);
                                                    return [2 /*return*/, {
                                                            techniqueMod: eff.matchTechniqueMod,
                                                            gkBonus: eff.gkBonus,
                                                            injurySeverityMod: eff.injurySeverityMod,
                                                            conditionDrainMod: eff.conditionDrainMod,
                                                            moraleMod: eff.moraleMod,
                                                            setPiecesMod: eff.setPiecesMod,
                                                            weatherResistMod: eff.weatherResistMod,
                                                            crowdMod: eff.crowdMod,
                                                            injuryDaysReduction: eff.injuryDaysReduction,
                                                        }];
                                            }
                                        });
                                    }); };
                                    return [4 /*yield*/, Promise.all([
                                            loadEquipMods(homeTeamId), loadEquipMods(awayTeamId),
                                        ])];
                                case 45:
                                    _47 = _67.sent(), homeEquipment = _47[0], awayEquipment = _47[1];
                                    loadStaffMods = function (tid) { return __awaiter(_this, void 0, void 0, function () {
                                        var calculateStaffEffects, rows;
                                        return __generator(this, function (_a) {
                                            switch (_a.label) {
                                                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("../staff/staff-effects"); })];
                                                case 1:
                                                    calculateStaffEffects = (_a.sent()).calculateStaffEffects;
                                                    return [4 /*yield*/, db.prepare("SELECT role, coaching, medicine, maintenance, judgement, communication, work_rate, charm FROM staff_members WHERE team_id = ?").bind(tid).all()
                                                            .catch(function (e) { logger_1.logger.warn({ module: "match-runner" }, "load staff mods", e); return { results: [] }; })];
                                                case 2:
                                                    rows = _a.sent();
                                                    return [2 /*return*/, calculateStaffEffects(rows.results)];
                                            }
                                        });
                                    }); };
                                    return [4 /*yield*/, Promise.all([loadStaffMods(homeTeamId), loadStaffMods(awayTeamId)])];
                                case 46:
                                    _48 = _67.sent(), homeStaffFx_1 = _48[0], awayStaffFx = _48[1];
                                    zeroEquipMods_1 = function () { return ({
                                        techniqueMod: 0, gkBonus: 0, injurySeverityMod: 0, conditionDrainMod: 0, moraleMod: 0,
                                        setPiecesMod: 0, weatherResistMod: 0, crowdMod: 0, injuryDaysReduction: 0,
                                    }); };
                                    mergeStaff = function (eq, fx, isHome) {
                                        var merged = eq !== null && eq !== void 0 ? eq : zeroEquipMods_1();
                                        merged.gkBonus += fx.gkBonus;
                                        merged.conditionDrainMod += fx.conditionDrainReduction;
                                        merged.injurySeverityMod += fx.injurySeverityReduction;
                                        if (isHome)
                                            merged.crowdMod += fx.crowdMod + fx.crowdAttendanceBonus; // šéf fanklubu jen doma
                                        return merged;
                                    };
                                    homeEquipment = mergeStaff(homeEquipment, homeStaffFx_1, true);
                                    awayEquipment = mergeStaff(awayEquipment, awayStaffFx, false);
                                    // Add changing room injury reduction to home equipment
                                    if (facilityEffects.homeInjuryReduction > 0 && homeEquipment) {
                                        homeEquipment.injurySeverityMod += facilityEffects.homeInjuryReduction;
                                    }
                                    applyManagerBonus = function (teamId, lineup, subs) { return __awaiter(_this, void 0, void 0, function () {
                                        var mgr, tacticsBonus, _i, _a, p, moraleBonus, _b, _c, p;
                                        return __generator(this, function (_d) {
                                            switch (_d.label) {
                                                case 0: return [4 /*yield*/, db.prepare("SELECT tactics, motivation FROM managers WHERE team_id = ?")
                                                        .bind(teamId).first().catch(function (e) {
                                                        logger_1.logger.warn({ module: "match-runner" }, "mgr query", e);
                                                        return null;
                                                    })];
                                                case 1:
                                                    mgr = _d.sent();
                                                    if (!mgr)
                                                        return [2 /*return*/];
                                                    tacticsBonus = Math.floor((mgr.tactics - 40) / 20);
                                                    if (tacticsBonus > 0) {
                                                        for (_i = 0, _a = __spreadArray(__spreadArray([], lineup, true), subs, true); _i < _a.length; _i++) {
                                                            p = _a[_i];
                                                            p.passing = Math.min(100, p.passing + tacticsBonus);
                                                            p.defense = Math.min(100, p.defense + tacticsBonus);
                                                        }
                                                    }
                                                    moraleBonus = Math.floor((mgr.motivation - 30) / 10);
                                                    if (moraleBonus > 0) {
                                                        for (_b = 0, _c = __spreadArray(__spreadArray([], lineup, true), subs, true); _b < _c.length; _b++) {
                                                            p = _c[_b];
                                                            p.morale = Math.min(100, p.morale + moraleBonus);
                                                        }
                                                    }
                                                    return [2 /*return*/];
                                            }
                                        });
                                    }); };
                                    return [4 /*yield*/, applyManagerBonus(homeTeamId, homeLineup_3, homeSubs_3)];
                                case 47:
                                    _67.sent();
                                    return [4 /*yield*/, applyManagerBonus(awayTeamId, awayLineup, awaySubs)];
                                case 48:
                                    _67.sent();
                                    return [4 /*yield*/, db.prepare("SELECT COUNT(*) as cnt\n                 FROM village_invitations\n                 WHERE match_id = ?\n                   AND team_id = ?\n                   AND status IN ('accepted', 'attended')").bind(matchId, homeTeamId).first().catch(function (e) {
                                            logger_1.logger.warn({ module: "match-runner" }, "load accepted officials", e);
                                            return null;
                                        })];
                                case 49:
                                    acceptedOfficials = _67.sent();
                                    officialCount = (_0 = acceptedOfficials === null || acceptedOfficials === void 0 ? void 0 : acceptedOfficials.cnt) !== null && _0 !== void 0 ? _0 : 0;
                                    homeAdvantage = Math.min(0.15, 0.05 + officialCount * 0.015 + facilityEffects.homeAdvantageBonus);
                                    crowdBoost = 1 + ((_1 = homeEquipment === null || homeEquipment === void 0 ? void 0 : homeEquipment.crowdMod) !== null && _1 !== void 0 ? _1 : 0);
                                    attendanceWithOfficials = Math.min(stadiumCapacity, Math.round((attendance !== null && attendance !== void 0 ? attendance : 0) * crowdBoost) + officialCount * 50);
                                    result = (0, simulation_1.simulateMatch)(rng, {
                                        home: homeSetup,
                                        away: awaySetup,
                                        weather: weather,
                                        isHomeAdvantage: true,
                                        homeAdvantage: homeAdvantage,
                                        pitchCondition: pitchCondition,
                                        stadiumName: stadiumName !== null && stadiumName !== void 0 ? stadiumName : undefined,
                                        attendance: attendanceWithOfficials,
                                        homeEquipment: homeEquipment,
                                        awayEquipment: awayEquipment,
                                    });
                                    if (!(officialCount > 0)) return [3 /*break*/, 51];
                                    return [4 /*yield*/, db.prepare("UPDATE village_invitations\n                     SET status = 'attended'\n                     WHERE match_id = ?\n                       AND team_id = ?\n                       AND status = 'accepted'").bind(matchId, homeTeamId).run().catch(function (e) {
                                            logger_1.logger.warn({ module: "match-runner" }, "mark invitations attended", e);
                                        })];
                                case 50:
                                    _67.sent();
                                    _67.label = 51;
                                case 51: 
                                // Load commentary templates from DB + generate (okresově dle domácího = dějiště)
                                return [4 /*yield*/, (0, commentary_1.loadCommentaryFromDB)(db)];
                                case 52:
                                    // Load commentary templates from DB + generate (okresově dle domácího = dějiště)
                                    _67.sent();
                                    return [4 /*yield*/, db.prepare("SELECT v.district FROM teams t LEFT JOIN villages v ON t.village_id = v.id WHERE t.id = ?").bind(homeTeamId).first()
                                            .catch(function (e) { logger_1.logger.warn({ module: "match-runner" }, "load district for commentary", e); return null; })];
                                case 53:
                                    commDistrict = (_3 = (_2 = (_67.sent())) === null || _2 === void 0 ? void 0 : _2.district) !== null && _3 !== void 0 ? _3 : undefined;
                                    commentary = (0, commentary_1.generateMatchCommentary)(rng, result.events, homeSetup.teamName, awaySetup.teamName, commDistrict);
                                    buildLineupData = function (lineup, subs, idMap, formation, tactic, captainEngineId) {
                                        var _a;
                                        var mapPlayer = function (p) {
                                            var _a, _b;
                                            return ({
                                                id: (_a = idMap.get(p.id)) !== null && _a !== void 0 ? _a : "", name: "".concat(p.firstName, " ").concat(p.lastName),
                                                position: (_b = p.matchPosition) !== null && _b !== void 0 ? _b : p.position, naturalPosition: p.position,
                                                rating: Math.round((p.speed + p.technique + p.shooting + p.passing + p.defense) / 5),
                                            });
                                        };
                                        var captainDbId = captainEngineId != null ? ((_a = idMap.get(captainEngineId)) !== null && _a !== void 0 ? _a : null) : null;
                                        return {
                                            starters: lineup.map(mapPlayer),
                                            subs: subs.map(mapPlayer),
                                            formation: formation,
                                            tactic: tactic,
                                            captainId: captainDbId
                                        };
                                    };
                                    matchAbsences = __spreadArray(__spreadArray([], ((_4 = homeBuild_1.absentNames) !== null && _4 !== void 0 ? _4 : []).map(function (a) { return (__assign(__assign({}, a), { teamId: homeTeamId })); }), true), ((_5 = awayBuild_1.absentNames) !== null && _5 !== void 0 ? _5 : []).map(function (a) { return (__assign(__assign({}, a), { teamId: awayTeamId })); }), true);
                                    // Save results with events + commentary + match context + lineups + absences + possession
                                    return [4 /*yield*/, db.prepare("UPDATE matches\n                 SET status           = 'simulated',\n                     home_score       = ?,\n                     away_score       = ?,\n                     events           = ?,\n                     commentary       = ?,\n                     attendance       = ?,\n                     stadium_name     = ?,\n                     pitch_condition  = ?,\n                     weather          = ?,\n                     home_lineup_data = ?,\n                     away_lineup_data = ?,\n                     absences = ?,\n                     possession_home = ?,\n                     simulated_at     = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')\n                 WHERE id = ?").bind(result.homeScore, result.awayScore, JSON.stringify(result.events), JSON.stringify(commentary), attendanceWithOfficials, stadiumName, pitchCondition, weather, JSON.stringify(buildLineupData(homeLineupPreSim, homeSubsPreSim, homeBuild_1.idMap, homeFormation, homeTactic, homeCaptainEngineId)), JSON.stringify(buildLineupData(awayLineupPreSim, awaySubsPreSim, awayBuild_1.idMap, awayFormation, awayTactic, awayCaptainEngineId)), matchAbsences.length > 0 ? JSON.stringify(matchAbsences) : null, result.possessionHome, matchId).run()];
                                case 54:
                                    // Save results with events + commentary + match context + lineups + absences + possession
                                    _67.sent();
                                    _67.label = 55;
                                case 55:
                                    _67.trys.push([55, 59, , 60]);
                                    return [4 /*yield*/, Promise.resolve().then(function () { return require("../engine/chemistry"); })];
                                case 56:
                                    applyMatchResult = (_67.sent()).applyMatchResult;
                                    return [4 /*yield*/, applyMatchResult(db, homeTeamId, homeTactic, homeFormation)];
                                case 57:
                                    _67.sent();
                                    return [4 /*yield*/, applyMatchResult(db, awayTeamId, awayTactic, awayFormation)];
                                case 58:
                                    _67.sent();
                                    return [3 /*break*/, 60];
                                case 59:
                                    e_6 = _67.sent();
                                    logger_1.logger.warn({ module: "match-runner" }, "apply chemistry post-match", e_6);
                                    return [3 /*break*/, 60];
                                case 60:
                                    _67.trys.push([60, 67, , 68]);
                                    return [4 /*yield*/, Promise.resolve().then(function () { return require("../season/fanbase-helpers"); })];
                                case 61:
                                    _49 = _67.sent(), applyBusConversion = _49.applyBusConversion, applyPromoConversion = _49.applyPromoConversion, applyTierPromotion = _49.applyTierPromotion, applyLossStreakPenalty = _49.applyLossStreakPenalty;
                                    return [4 /*yield*/, applyBusConversion(db, homeTeamId, matchId)];
                                case 62:
                                    busResult = _67.sent();
                                    wasPromoted = ((_6 = promoRow === null || promoRow === void 0 ? void 0 : promoRow.promotion_boost) !== null && _6 !== void 0 ? _6 : 1.0) > 1.0;
                                    return [4 /*yield*/, applyPromoConversion(db, homeTeamId, wasPromoted, rawAttendance)];
                                case 63:
                                    promoResult = _67.sent();
                                    return [4 /*yield*/, applyTierPromotion(db, homeTeamId)];
                                case 64:
                                    tierResult = _67.sent();
                                    return [4 /*yield*/, applyLossStreakPenalty(db, homeTeamId)];
                                case 65:
                                    lossResult = _67.sent();
                                    logger_1.logger.info({ module: "match-runner", teamId: homeTeamId, matchId: matchId }, "fanbase post-match: bus drop-in=".concat(busResult.totalDropIn, " converted=").concat(busResult.totalConverted, " promo+").concat(promoResult.converted, " -").concat(promoResult.lost, " tier c\u2192r=").concat(tierResult.casualToRegular, " r\u2192h=").concat(tierResult.regularToHardcore, " loss-penalty=").concat(lossResult.triggered ? "c-".concat(lossResult.casualLost, "/r-").concat(lossResult.regularLost) : "no"));
                                    // Hosté: jen loss streak penalty (jejich domácí akce nejsou)
                                    return [4 /*yield*/, applyLossStreakPenalty(db, awayTeamId)];
                                case 66:
                                    // Hosté: jen loss streak penalty (jejich domácí akce nejsou)
                                    _67.sent();
                                    return [3 /*break*/, 68];
                                case 67:
                                    e_7 = _67.sent();
                                    logger_1.logger.warn({ module: "match-runner" }, "fanbase post-match update", e_7);
                                    return [3 /*break*/, 68];
                                case 68:
                                    _67.trys.push([68, 71, , 72]);
                                    return [4 /*yield*/, Promise.resolve().then(function () { return require("../community/manager-relations"); })];
                                case 69:
                                    applyPostMatchRelations = (_67.sent()).applyPostMatchRelations;
                                    return [4 /*yield*/, applyPostMatchRelations(db, {
                                            matchId: matchId,
                                            homeTeamId: homeTeamId,
                                            awayTeamId: awayTeamId,
                                            homeScore: result.homeScore,
                                            awayScore: result.awayScore,
                                            leagueId: (_7 = match.league_id) !== null && _7 !== void 0 ? _7 : null,
                                            preMatchHeat: preMatchHeat,
                                        })];
                                case 70:
                                    _67.sent();
                                    return [3 /*break*/, 72];
                                case 71:
                                    e_8 = _67.sent();
                                    logger_1.logger.warn({ module: "match-runner" }, "manager relations post-match", e_8);
                                    return [3 /*break*/, 72];
                                case 72: return [4 /*yield*/, db.prepare("SELECT id FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1").first().catch(function (e) {
                                        logger_1.logger.warn({ module: "match-runner" }, "Failed to load active season", e);
                                        return null;
                                    })];
                                case 73:
                                    season = _67.sent();
                                    if (!season) return [3 /*break*/, 93];
                                    playerPositions = new Map();
                                    for (_50 = 0, _51 = __spreadArray(__spreadArray(__spreadArray(__spreadArray([], homeLineup_3, true), homeSubs_3, true), awayLineup, true), awaySubs, true); _50 < _51.length; _50++) {
                                        p = _51[_50];
                                        playerPositions.set(p.id, (_8 = p.matchPosition) !== null && _8 !== void 0 ? _8 : p.position);
                                    }
                                    ratings = (0, update_stats_1.calculatePlayerRatings)(result.events, fullIdMap_1, 1, result.homeScore, result.awayScore, playerPositions);
                                    momPlayerId = (0, update_stats_1.determineManOfMatch)(ratings);
                                    return [4 /*yield*/, (0, update_stats_1.saveMatchMom)(db, matchId, momPlayerId)];
                                case 74:
                                    _67.sent();
                                    _67.label = 75;
                                case 75:
                                    _67.trys.push([75, 78, , 79]);
                                    homeUpdatesPreview = (0, update_stats_1.extractStatsFromEvents)(result.events, homeBuild_1.idMap, homeLineupPreSim.map(function (p) { var _a; return (_a = homeBuild_1.idMap.get(p.id)) !== null && _a !== void 0 ? _a : ""; }).filter(Boolean), ratings, result.playerMinutes);
                                    goalsByPlayer = homeUpdatesPreview.map(function (u) { return ({ playerId: u.playerId, goals: u.goals }); });
                                    return [4 /*yield*/, Promise.resolve().then(function () { return require("../season/village-processor"); })];
                                case 76:
                                    applyLocalSensations = (_67.sent()).applyLocalSensations;
                                    return [4 /*yield*/, applyLocalSensations(db, matchId, homeTeamId, goalsByPlayer, momPlayerId, new Date().toISOString())];
                                case 77:
                                    _67.sent();
                                    return [3 /*break*/, 79];
                                case 78:
                                    e_9 = _67.sent();
                                    logger_1.logger.warn({ module: "match-runner" }, "local sensations hook", e_9);
                                    return [3 /*break*/, 79];
                                case 79:
                                    homeStarterIds_1 = homeLineupPreSim.map(function (p) { var _a; return (_a = homeBuild_1.idMap.get(p.id)) !== null && _a !== void 0 ? _a : ""; }).filter(Boolean);
                                    homeUpdates = (0, update_stats_1.extractStatsFromEvents)(result.events, homeBuild_1.idMap, homeStarterIds_1, ratings, result.playerMinutes);
                                    return [4 /*yield*/, (0, update_stats_1.updatePlayerStats)(db, season.id, homeTeamId, homeUpdates, result.awayScore === 0, momPlayerId).catch(function (e) { return logger_1.logger.warn({ module: "match-runner" }, "Failed to update home player stats", e); })];
                                case 80:
                                    _67.sent();
                                    awayStarterIds_1 = awayLineupPreSim.map(function (p) { var _a; return (_a = awayBuild_1.idMap.get(p.id)) !== null && _a !== void 0 ? _a : ""; }).filter(Boolean);
                                    awayUpdates = (0, update_stats_1.extractStatsFromEvents)(result.events, awayBuild_1.idMap, awayStarterIds_1, ratings, result.playerMinutes);
                                    return [4 /*yield*/, (0, update_stats_1.updatePlayerStats)(db, season.id, awayTeamId, awayUpdates, result.homeScore === 0, momPlayerId).catch(function (e) { return logger_1.logger.warn({ module: "match-runner" }, "Failed to update away player stats", e); })];
                                case 81:
                                    _67.sent();
                                    allEntries = __spreadArray(__spreadArray([], homeUpdates.map(function (u) {
                                        var _a;
                                        return ({
                                            playerId: u.playerId,
                                            teamId: homeTeamId,
                                            started: homeStarterIds_1.includes(u.playerId),
                                            position: (_a = fullPosMap_1.get(u.playerId)) !== null && _a !== void 0 ? _a : "MID",
                                            minutesPlayed: u.minutesPlayed,
                                            goals: u.goals,
                                            assists: u.assists,
                                            yellowCards: u.yellowCards,
                                            redCards: u.redCards,
                                            rating: u.rating,
                                        });
                                    }), true), awayUpdates.map(function (u) {
                                        var _a;
                                        return ({
                                            playerId: u.playerId,
                                            teamId: awayTeamId,
                                            started: awayStarterIds_1.includes(u.playerId),
                                            position: (_a = fullPosMap_1.get(u.playerId)) !== null && _a !== void 0 ? _a : "MID",
                                            minutesPlayed: u.minutesPlayed,
                                            goals: u.goals,
                                            assists: u.assists,
                                            yellowCards: u.yellowCards,
                                            redCards: u.redCards,
                                            rating: u.rating,
                                        });
                                    }), true);
                                    return [4 /*yield*/, (0, update_stats_1.saveMatchPlayerStats)(db, matchId, allEntries).catch(function (e) { return logger_1.logger.warn({ module: "match-runner" }, "Failed to save match player stats", e); })];
                                case 82:
                                    _67.sent();
                                    // Save player_ratings JSON to match record
                                    return [4 /*yield*/, db.prepare("UPDATE matches SET player_ratings = ? WHERE id = ?")
                                            .bind(JSON.stringify(ratings), matchId).run().catch(function (e) { return logger_1.logger.warn({ module: "match-runner" }, "Failed to save player ratings", e); })];
                                case 83:
                                    // Save player_ratings JSON to match record
                                    _67.sent();
                                    allUpdates = __spreadArray(__spreadArray([], homeUpdates, true), awayUpdates, true);
                                    suspensionStmts = [];
                                    for (_52 = 0, allUpdates_1 = allUpdates; _52 < allUpdates_1.length; _52++) {
                                        u = allUpdates_1[_52];
                                        if (u.redCards > 0) {
                                            suspensionStmts.push(db.prepare("UPDATE players SET suspended_matches = suspended_matches + 1 WHERE id = ?").bind(u.playerId));
                                        }
                                    }
                                    if (!(suspensionStmts.length > 0)) return [3 /*break*/, 85];
                                    return [4 /*yield*/, db.batch(suspensionStmts).catch(function (e) { return logger_1.logger.warn({ module: "match-runner" }, "batch suspensions", e); })];
                                case 84:
                                    _67.sent();
                                    _67.label = 85;
                                case 85:
                                    _53 = 0, allUpdates_2 = allUpdates;
                                    _67.label = 86;
                                case 86:
                                    if (!(_53 < allUpdates_2.length)) return [3 /*break*/, 90];
                                    u = allUpdates_2[_53];
                                    if (!(u.yellowCards > 0)) return [3 /*break*/, 89];
                                    return [4 /*yield*/, db.prepare("SELECT COALESCE(SUM(yellow_cards), 0) as yellow_cards FROM player_stats WHERE player_id = ? AND season_id = ?")
                                            .bind(u.playerId, season.id).first().catch(function (e) {
                                            logger_1.logger.warn({ module: "match-runner" }, "query failed", e);
                                            return null;
                                        })];
                                case 87:
                                    stats = _67.sent();
                                    if (!(stats && stats.yellow_cards > 0 && stats.yellow_cards % 4 === 0)) return [3 /*break*/, 89];
                                    return [4 /*yield*/, db.prepare("UPDATE players SET suspended_matches = suspended_matches + 1 WHERE id = ?")
                                            .bind(u.playerId).run().catch(function (e) {
                                            logger_1.logger.warn({ module: "match-runner" }, "op failed", e);
                                        })];
                                case 88:
                                    _67.sent();
                                    _67.label = 89;
                                case 89:
                                    _53++;
                                    return [3 /*break*/, 86];
                                case 90: 
                                // Decrement suspensions for players who SAT OUT this match (served their ban)
                                return [4 /*yield*/, db.prepare("UPDATE players SET suspended_matches = MAX(0, suspended_matches - 1) WHERE team_id IN (?, ?) AND suspended_matches > 0 AND id NOT IN (SELECT player_id FROM match_player_stats WHERE match_id = ?)")
                                        .bind(homeTeamId, awayTeamId, matchId).run().catch(function (e) { return logger_1.logger.warn({ module: "match-runner" }, "decrement suspensions", e); })];
                                case 91:
                                    // Decrement suspensions for players who SAT OUT this match (served their ban)
                                    _67.sent();
                                    injuryTypeMap = {
                                        "natažený sval": "sval", "naražené žebro": "zebra", "podvrtnutý kotník": "kotnik",
                                        "bolest kolene": "koleno", "bolavá záda": "zada", "naražená hlava": "hlava",
                                        "pohmožděný palec": "obecne", "přetržený achilov": "achilovka",
                                    };
                                    injuryStmts = [];
                                    for (_54 = 0, _55 = result.events; _54 < _55.length; _54++) {
                                        event_1 = _55[_54];
                                        if (event_1.type === "injury") {
                                            evTeamId = event_1.teamId === 1 ? homeTeamId : awayTeamId;
                                            idMap = event_1.teamId === 1 ? homeBuild_1.idMap : awayBuild_1.idMap;
                                            realPlayerId = idMap.get(event_1.playerId);
                                            if (realPlayerId) {
                                                injuryReduction = (_10 = (_9 = (event_1.teamId === 1 ? homeEquipment : awayEquipment)) === null || _9 === void 0 ? void 0 : _9.injuryDaysReduction) !== null && _10 !== void 0 ? _10 : 0;
                                                days = Math.max(2, 3 + Math.floor(Math.random() * 18) - injuryReduction);
                                                injType = (_12 = injuryTypeMap[(_11 = event_1.detail) !== null && _11 !== void 0 ? _11 : ""]) !== null && _12 !== void 0 ? _12 : "obecne";
                                                severity = days <= 7 ? "lehke" : days <= 14 ? "stredni" : "tezke";
                                                injuryStmts.push(db.prepare("INSERT INTO injuries (id, player_id, team_id, type, description, severity, days_remaining, days_total, match_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), realPlayerId, evTeamId, injType, (_13 = event_1.detail) !== null && _13 !== void 0 ? _13 : "zranění", severity, days, days, matchId));
                                            }
                                        }
                                    }
                                    if (!(injuryStmts.length > 0)) return [3 /*break*/, 93];
                                    return [4 /*yield*/, db.batch(injuryStmts).catch(function (e) { return logger_1.logger.warn({ module: "match-runner" }, "batch persist injuries", e); })];
                                case 92:
                                    _67.sent();
                                    _67.label = 93;
                                case 93:
                                    _67.trys.push([93, 100, , 101]);
                                    return [4 /*yield*/, Promise.resolve().then(function () { return require("../season/finance-processor"); })];
                                case 94:
                                    _56 = _67.sent(), processMatchDayFinances = _56.processMatchDayFinances, processCashLoanRepayment = _56.processCashLoanRepayment;
                                    homeResult = result.homeScore > result.awayScore ? "win" : result.homeScore < result.awayScore ? "loss" : "draw";
                                    awayResult = result.awayScore > result.homeScore ? "win" : result.awayScore < result.homeScore ? "loss" : "draw";
                                    gameDate = new Date().toISOString();
                                    return [4 /*yield*/, db.prepare("SELECT id, reputation FROM teams WHERE id IN (?, ?)").bind(homeTeamId, awayTeamId).all().catch(function (e) {
                                            logger_1.logger.warn({ module: "match-runner" }, "load team reputations for finances", e);
                                            return { results: [] };
                                        })];
                                case 95:
                                    repRows = _67.sent();
                                    repMap = new Map(repRows.results.map(function (r) { var _a; return [r.id, (_a = r.reputation) !== null && _a !== void 0 ? _a : 50]; }));
                                    homeRep = (_14 = repMap.get(homeTeamId)) !== null && _14 !== void 0 ? _14 : 50;
                                    awayRep = (_15 = repMap.get(awayTeamId)) !== null && _15 !== void 0 ? _15 : 50;
                                    return [4 /*yield*/, processMatchDayFinances(db, homeTeamId, matchId, true, homeResult, attendanceWithOfficials, gameDate, awayRep, false, weather)];
                                case 96:
                                    _67.sent();
                                    return [4 /*yield*/, processMatchDayFinances(db, awayTeamId, matchId, false, awayResult, attendanceWithOfficials, gameDate, homeRep, false, weather)];
                                case 97:
                                    _67.sent();
                                    // Cash loan repayments — po všech ostatních match-day financích (na čerstvém budgetu)
                                    return [4 /*yield*/, processCashLoanRepayment(db, homeTeamId, matchId, gameDate)];
                                case 98:
                                    // Cash loan repayments — po všech ostatních match-day financích (na čerstvém budgetu)
                                    _67.sent();
                                    return [4 /*yield*/, processCashLoanRepayment(db, awayTeamId, matchId, gameDate)];
                                case 99:
                                    _67.sent();
                                    return [3 /*break*/, 101];
                                case 100:
                                    e_10 = _67.sent();
                                    logger_1.logger.error({ module: "match-runner" }, "Match finances failed for ".concat(matchId), e_10);
                                    return [3 /*break*/, 101];
                                case 101:
                                    _57 = 0, _58 = [homeTeamId, awayTeamId];
                                    _67.label = 102;
                                case 102:
                                    if (!(_57 < _58.length)) return [3 /*break*/, 114];
                                    tid = _58[_57];
                                    _67.label = 103;
                                case 103:
                                    _67.trys.push([103, 112, , 113]);
                                    isHome = tid === homeTeamId;
                                    gf = isHome ? result.homeScore : result.awayScore;
                                    ga = isHome ? result.awayScore : result.homeScore;
                                    margin = gf - ga;
                                    won = margin > 0, lost = margin < 0;
                                    bigWin = margin >= 3, blowoutLoss = margin <= -3;
                                    if (!(Math.random() < (won ? 0.16 : 0.10))) return [3 /*break*/, 105];
                                    upAttr = ["coaching", "tactics"][Math.floor(Math.random() * 2)];
                                    return [4 /*yield*/, db.prepare("UPDATE managers SET ".concat(upAttr, " = MIN(99, ").concat(upAttr, " + 1) WHERE team_id = ?")).bind(tid).run()];
                                case 104:
                                    _67.sent();
                                    _67.label = 105;
                                case 105:
                                    if (!(lost && Math.random() < (blowoutLoss ? 0.25 : 0.12))) return [3 /*break*/, 107];
                                    downAttr = ["motivation", "discipline"][Math.floor(Math.random() * 2)];
                                    return [4 /*yield*/, db.prepare("UPDATE managers SET ".concat(downAttr, " = MAX(10, ").concat(downAttr, " - 1) WHERE team_id = ?")).bind(tid).run()];
                                case 106:
                                    _67.sent();
                                    _67.label = 107;
                                case 107:
                                    if (!(Math.random() < 0.05)) return [3 /*break*/, 109];
                                    return [4 /*yield*/, db.prepare("UPDATE managers SET youth_development = MIN(99, youth_development + 1) WHERE team_id = ?").bind(tid).run()];
                                case 108:
                                    _67.sent();
                                    _67.label = 109;
                                case 109:
                                    repDelta = 0;
                                    if (won)
                                        repDelta = bigWin ? 2 : 1;
                                    else if (lost)
                                        repDelta = blowoutLoss ? -2 : -1;
                                    if (!(repDelta !== 0 && Math.random() < 0.35)) return [3 /*break*/, 111];
                                    return [4 /*yield*/, db.prepare("UPDATE managers SET reputation = MAX(15, MIN(75, reputation + ?)) WHERE team_id = ?").bind(repDelta, tid).run()];
                                case 110:
                                    _67.sent();
                                    _67.label = 111;
                                case 111: return [3 /*break*/, 113];
                                case 112:
                                    e_11 = _67.sent();
                                    logger_1.logger.warn({ module: "match-runner" }, "manager xp update", e_11);
                                    return [3 /*break*/, 113];
                                case 113:
                                    _57++;
                                    return [3 /*break*/, 102];
                                case 114:
                                    _67.trys.push([114, 118, , 119]);
                                    return [4 /*yield*/, Promise.resolve().then(function () { return require("../lib/condition-log"); })];
                                case 115:
                                    logConditionStmt = (_67.sent()).logConditionStmt;
                                    preSimCondById = new Map();
                                    for (_59 = 0, _60 = __spreadArray(__spreadArray([], homeLineupPreSim, true), awayLineupPreSim, true); _59 < _60.length; _59++) {
                                        p = _60[_59];
                                        preSimCondById.set(p.id, p.condition);
                                    }
                                    stmts = [];
                                    for (_61 = 0, _62 = __spreadArray(__spreadArray([], result.homeLineup, true), result.awayLineup, true); _61 < _62.length; _61++) {
                                        p = _62[_61];
                                        dbId = fullIdMap_1.get(p.id);
                                        if (!dbId)
                                            continue;
                                        stmts.push(db.prepare("UPDATE players\n                         SET life_context = json_set(life_context, '$.condition', ?, '$.morale', ?)\n                         WHERE id = ?").bind(Math.round(p.condition), Math.round(p.morale), dbId));
                                        oldCond = preSimCondById.get(p.id);
                                        if (oldCond != null && Math.round(oldCond) !== Math.round(p.condition)) {
                                            teamIdForPlayer = result.homeLineup.includes(p) ? homeTeamId : awayTeamId;
                                            stmts.push(logConditionStmt(db, dbId, teamIdForPlayer, oldCond, p.condition, "match", "Z\u00E1pas (".concat(result.homeScore, ":").concat(result.awayScore, ")")));
                                        }
                                    }
                                    if (!(stmts.length > 0)) return [3 /*break*/, 117];
                                    return [4 /*yield*/, db.batch(stmts)];
                                case 116:
                                    _67.sent();
                                    _67.label = 117;
                                case 117: return [3 /*break*/, 119];
                                case 118:
                                    e_12 = _67.sent();
                                    logger_1.logger.error({ module: "match-runner" }, "Condition persist failed", e_12);
                                    return [3 /*break*/, 119];
                                case 119:
                                    _67.trys.push([119, 126, , 127]);
                                    matchRng = (0, rng_1.createRng)(Date.now() + matchId.charCodeAt(2));
                                    _63 = 0, _64 = Object.entries(result.playerMinutes);
                                    _67.label = 120;
                                case 120:
                                    if (!(_63 < _64.length)) return [3 /*break*/, 125];
                                    _65 = _64[_63], engineId = _65[0], pm = _65[1];
                                    dbId = fullIdMap_1.get(Number(engineId));
                                    if (!dbId)
                                        return [3 /*break*/, 124];
                                    minutes = ((_16 = pm.left) !== null && _16 !== void 0 ? _16 : 90) - pm.entered;
                                    if (minutes < 15)
                                        return [3 /*break*/, 124]; // too few minutes to learn anything
                                    return [4 /*yield*/, db.prepare("SELECT age, skills, position FROM players WHERE id = ?")
                                            .bind(dbId).first().catch(function (e) {
                                            logger_1.logger.warn({ module: "match-runner" }, "Failed to load player for match experience", e);
                                            return null;
                                        })];
                                case 121:
                                    playerRow = _67.sent();
                                    if (!playerRow)
                                        return [3 /*break*/, 124];
                                    age = playerRow.age;
                                    ageMod = age < 22 ? 0.08 : age < 26 ? 0.05 : age < 30 ? 0.03 : 0.01;
                                    minutesMod = minutes / 90;
                                    improveChance = ageMod * minutesMod;
                                    if (!(matchRng.random() < improveChance)) return [3 /*break*/, 124];
                                    skills = JSON.parse(playerRow.skills);
                                    posSkills = {
                                        GK: ["goalkeeping"], DEF: ["defense", "heading", "strength"],
                                        MID: ["passing", "vision", "technique"], FWD: ["shooting", "speed", "technique"],
                                    };
                                    candidates = (_17 = posSkills[playerRow.position]) !== null && _17 !== void 0 ? _17 : ["technique"];
                                    attr = matchRng.pick(candidates);
                                    current = (_18 = skills[attr]) !== null && _18 !== void 0 ? _18 : 50;
                                    if (!(current < 85)) return [3 /*break*/, 124];
                                    skills[attr] = current + 1;
                                    return [4 /*yield*/, db.prepare("UPDATE players SET skills = ? WHERE id = ?")
                                            .bind(JSON.stringify(skills), dbId).run()];
                                case 122:
                                    _67.sent();
                                    // Log it
                                    return [4 /*yield*/, db.prepare("INSERT INTO training_log (player_id, team_id, attribute, old_value, new_value, change, training_type, game_date) VALUES (?, ?, ?, ?, ?, 1, 'match', ?)").bind(dbId, fullPosMap_1.get(dbId) ? (homeBuild_1.idMap.has(Number(engineId)) ? homeTeamId : awayTeamId) : homeTeamId, attr, current, current + 1, new Date().toISOString()).run().catch(function (e) { return logger_1.logger.warn({ module: "match-runner" }, "Failed to save training log", e); })];
                                case 123:
                                    // Log it
                                    _67.sent();
                                    _67.label = 124;
                                case 124:
                                    _63++;
                                    return [3 /*break*/, 120];
                                case 125: return [3 /*break*/, 127];
                                case 126:
                                    e_13 = _67.sent();
                                    logger_1.logger.error({ module: "match-runner" }, "Match experience failed", e_13);
                                    return [3 /*break*/, 127];
                                case 127:
                                    _67.trys.push([127, 132, , 133]);
                                    return [4 /*yield*/, db.prepare("SELECT CASE WHEN h.village_id = a.village_id AND h.village_id IS NOT NULL THEN 1 ELSE 0 END as d FROM teams h, teams a WHERE h.id = ? AND a.id = ?").bind(homeTeamId, awayTeamId).first()];
                                case 128:
                                    vr = _67.sent();
                                    isDerby = (vr === null || vr === void 0 ? void 0 : vr.d) === 1;
                                    return [4 /*yield*/, Promise.resolve().then(function () { return require("../services/achievements"); })];
                                case 129:
                                    checkMatchAchievements = (_67.sent()).checkMatchAchievements;
                                    return [4 /*yield*/, checkMatchAchievements(db, homeTeamId, { own: result.homeScore, opp: result.awayScore, isDerby: isDerby })];
                                case 130:
                                    _67.sent();
                                    return [4 /*yield*/, checkMatchAchievements(db, awayTeamId, { own: result.awayScore, opp: result.homeScore, isDerby: isDerby })];
                                case 131:
                                    _67.sent();
                                    return [3 /*break*/, 133];
                                case 132:
                                    e_14 = _67.sent();
                                    logger_1.logger.warn({ module: "match-runner" }, "check achievements", e_14);
                                    return [3 /*break*/, 133];
                                case 133:
                                    results.push({
                                        matchId: matchId,
                                        homeScore: result.homeScore,
                                        awayScore: result.awayScore,
                                        eventsCount: result.events.length,
                                        matchType: matchType,
                                    });
                                    return [3 /*break*/, 135];
                                case 134:
                                    e_15 = _67.sent();
                                    logger_1.logger.error({ module: "match-runner" }, "Failed to simulate match ".concat(matchId), e_15);
                                    return [3 /*break*/, 135];
                                case 135: return [2 /*return*/];
                            }
                        });
                    };
                    _i = 0, _a = matches.results;
                    _19.label = 2;
                case 2:
                    if (!(_i < _a.length)) return [3 /*break*/, 5];
                    match = _a[_i];
                    return [5 /*yield**/, _loop_1(match)];
                case 3:
                    _19.sent();
                    _19.label = 4;
                case 4:
                    _i++;
                    return [3 /*break*/, 2];
                case 5:
                    if (!(results.length > 0 && geminiApiKey)) return [3 /*break*/, 14];
                    _19.label = 6;
                case 6:
                    _19.trys.push([6, 9, , 10]);
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("../news/round-summary"); })];
                case 7:
                    generateRoundSummary = (_19.sent()).generateRoundSummary;
                    return [4 /*yield*/, generateRoundSummary(db, geminiApiKey, calendarId)];
                case 8:
                    _19.sent();
                    return [3 /*break*/, 10];
                case 9:
                    e_2 = _19.sent();
                    logger_1.logger.warn({ module: "match-runner" }, "round summary failed", e_2);
                    return [3 /*break*/, 10];
                case 10:
                    _19.trys.push([10, 13, , 14]);
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("../news/player-interview"); })];
                case 11:
                    generatePlayerInterview = (_19.sent()).generatePlayerInterview;
                    return [4 /*yield*/, generatePlayerInterview(db, geminiApiKey, calendarId)];
                case 12:
                    _19.sent();
                    return [3 /*break*/, 14];
                case 13:
                    e_3 = _19.sent();
                    logger_1.logger.warn({ module: "match-runner" }, "player interview failed", e_3);
                    return [3 /*break*/, 14];
                case 14: return [2 /*return*/, results];
            }
        });
    });
}
function buildMatchPlayers(db_1, teamId_1, userLineupJson_1) {
    return __awaiter(this, arguments, void 0, function (db, teamId, userLineupJson, idOffset, options, 
    // Volitelně předané řádky kádru (stejný tvar jako players) — pro pohárové velkokluby
    // z cup_club_players. Když je zadáno, přeskočí se dotaz na tabulku players.
    sourceRows) {
        var rows, _a, injuredIds, suspendedIds, absentInfo, _i, _b, r, injuryRows, _c, _d, ir, healthyRows, absentIds, hasUserLineup, allDbIds, generateAbsences, absenceSeedForMatch, fetchTeamDistrict, squadForAbsence, district, dayBeforeRng, matchDayRng, fetchTeamCommuteMod, vanCommuteMod, dayBeforeAbs, matchDayAbs, seen_1, allAbsences, _e, allAbsences_1, a, r, e_16, _f, _g, r, id, allAvailable, ordered, userPicks, pickedIds_2, starters_4, _loop_4, _h, pickedIds_1, id, missingByPos, _loop_5, _j, _k, pick, restRaw, positionPriority, replacements, usedRestIds_1, _l, _m, pos, need, i, pick, _loop_6, _o, _p, tryPos, state_1, benchRest, savedNames, actualNames, dbgSaved, dbgActual, matchPositionMap, picks, _q, picks_1, p, idCounter, idMap, positionMap, players, starters, presentDbIds, _r, starters_1, p, dbId, missingPositions, _s, matchPositionMap_1, _t, playerId, pos, _debugMissing, unassigned, _loop_7, _u, _v, pos, _w, unassigned_1, p, hasGK, _x, starters_2, p, best, _y, starters_3, p;
        var _z, _0, _1, _2;
        if (idOffset === void 0) { idOffset = 0; }
        return __generator(this, function (_3) {
            switch (_3.label) {
                case 0:
                    if (!(sourceRows !== null && sourceRows !== void 0)) return [3 /*break*/, 1];
                    _a = sourceRows;
                    return [3 /*break*/, 3];
                case 1: return [4 /*yield*/, db.prepare("SELECT * FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active') ORDER BY overall_rating DESC").bind(teamId).all()];
                case 2:
                    _a = _3.sent();
                    _3.label = 3;
                case 3:
                    rows = _a;
                    injuredIds = new Set();
                    suspendedIds = new Set();
                    absentInfo = [];
                    for (_i = 0, _b = rows.results; _i < _b.length; _i++) {
                        r = _b[_i];
                        if (r.suspended_matches > 0) {
                            suspendedIds.add(r.id);
                            absentInfo.push({
                                name: "".concat(r.first_name, " ").concat(r.last_name),
                                reason: "Stopka za karty",
                                smsText: "M\u00E1m stopku, nesm\u00EDm hr\u00E1t."
                            });
                        }
                    }
                    return [4 /*yield*/, db.prepare("SELECT player_id FROM injuries WHERE days_remaining > 0 AND player_id IN (SELECT id FROM players WHERE team_id = ?)")
                            .bind(teamId).all().catch(function () { return ({ results: [] }); })];
                case 4:
                    injuryRows = _3.sent();
                    for (_c = 0, _d = injuryRows.results; _c < _d.length; _c++) {
                        ir = _d[_c];
                        injuredIds.add(ir.player_id);
                    }
                    healthyRows = rows.results.filter(function (r) { return !injuredIds.has(r.id) && !suspendedIds.has(r.id); });
                    absentIds = new Set();
                    hasUserLineup = !!userLineupJson;
                    allDbIds = rows.results.map(function (r) { return r.id.slice(0, 8); });
                    logger_1.logger.info({ module: "match-runner" }, "buildMatchPlayers team=".concat(teamId.slice(0, 8), " total=").concat(rows.results.length, " healthy=").concat(healthyRows.length, " hasLineup=").concat(hasUserLineup, " dbIDs=[").concat(allDbIds.join(","), "]"));
                    if (!(options === null || options === void 0 ? void 0 : options.matchKey)) return [3 /*break*/, 13];
                    _3.label = 5;
                case 5:
                    _3.trys.push([5, 12, , 13]);
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("../events/absence"); })];
                case 6:
                    generateAbsences = (_3.sent()).generateAbsences;
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("../lib/seed"); })];
                case 7:
                    absenceSeedForMatch = (_3.sent()).absenceSeedForMatch;
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("../events/match-absences"); })];
                case 8:
                    fetchTeamDistrict = (_3.sent()).fetchTeamDistrict;
                    squadForAbsence = healthyRows.map(function (row) {
                        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
                        var personality = JSON.parse(row.personality);
                        var lifeContext = JSON.parse(row.life_context);
                        var physical = row.physical ? JSON.parse(row.physical) : {};
                        return {
                            firstName: row.first_name,
                            lastName: row.last_name,
                            age: row.age,
                            occupation: (_a = lifeContext.occupation) !== null && _a !== void 0 ? _a : "",
                            discipline: (_b = personality.discipline) !== null && _b !== void 0 ? _b : 50,
                            patriotism: (_c = personality.patriotism) !== null && _c !== void 0 ? _c : 50,
                            alcohol: (_d = personality.alcohol) !== null && _d !== void 0 ? _d : 30,
                            temper: (_e = personality.temper) !== null && _e !== void 0 ? _e : 40,
                            morale: (_f = lifeContext.morale) !== null && _f !== void 0 ? _f : 50,
                            stamina: (_g = physical.stamina) !== null && _g !== void 0 ? _g : 50,
                            injuryProneness: (_h = personality.injuryProneness) !== null && _h !== void 0 ? _h : 50,
                            commuteKm: (_j = row.commute_km) !== null && _j !== void 0 ? _j : 0,
                            isCelebrity: !!row.is_celebrity,
                            celebrityType: personality.celebrityType,
                            celebrityTier: personality.celebrityTier,
                        };
                    });
                    return [4 /*yield*/, fetchTeamDistrict(db, teamId)];
                case 9:
                    district = _3.sent();
                    dayBeforeRng = (0, rng_1.createRng)(absenceSeedForMatch({
                        matchKey: options.matchKey,
                        teamId: teamId,
                        phase: "day_before"
                    }));
                    matchDayRng = (0, rng_1.createRng)(absenceSeedForMatch({
                        matchKey: options.matchKey,
                        teamId: teamId,
                        phase: "match_day"
                    }));
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("../events/match-absences"); })];
                case 10:
                    fetchTeamCommuteMod = (_3.sent()).fetchTeamCommuteMod;
                    return [4 /*yield*/, fetchTeamCommuteMod(db, teamId)];
                case 11:
                    vanCommuteMod = _3.sent();
                    dayBeforeAbs = generateAbsences(dayBeforeRng, squadForAbsence, "day_before", district, options.friendlyMultiplier, vanCommuteMod);
                    matchDayAbs = generateAbsences(matchDayRng, squadForAbsence, "match_day", district, options.friendlyMultiplier, vanCommuteMod);
                    seen_1 = new Set();
                    allAbsences = __spreadArray(__spreadArray([], dayBeforeAbs, true), matchDayAbs, true).filter(function (a) {
                        if (seen_1.has(a.playerIndex))
                            return false;
                        seen_1.add(a.playerIndex);
                        return true;
                    });
                    absentIds = new Set(allAbsences.map(function (a) { var _a; return (_a = healthyRows[a.playerIndex]) === null || _a === void 0 ? void 0 : _a.id; }).filter(Boolean));
                    for (_e = 0, allAbsences_1 = allAbsences; _e < allAbsences_1.length; _e++) {
                        a = allAbsences_1[_e];
                        r = healthyRows[a.playerIndex];
                        if (r)
                            absentInfo.push({ name: "".concat(r.first_name, " ").concat(r.last_name), reason: a.reason, smsText: a.smsText });
                    }
                    return [3 /*break*/, 13];
                case 12:
                    e_16 = _3.sent();
                    logger_1.logger.warn({ module: "match-runner" }, "absence generation", e_16);
                    return [3 /*break*/, 13];
                case 13:
                    // DEBUG: check each player's exclusion reason
                    for (_f = 0, _g = rows.results; _f < _g.length; _f++) {
                        r = _g[_f];
                        id = r.id;
                        if (absentIds.has(id))
                            console.log("[LINEUP-DEBUG] ".concat(r.first_name, " ").concat(r.last_name, " (").concat(id.slice(0, 8), ") EXCLUDED: absent"));
                        if (suspendedIds.has(id))
                            console.log("[LINEUP-DEBUG] ".concat(r.first_name, " ").concat(r.last_name, " (").concat(id.slice(0, 8), ") EXCLUDED: suspended=").concat(r.suspended_matches));
                        if (injuredIds.has(id))
                            console.log("[LINEUP-DEBUG] ".concat(r.first_name, " ").concat(r.last_name, " (").concat(id.slice(0, 8), ") EXCLUDED: injured"));
                    }
                    allAvailable = rows.results.filter(function (r) { return !absentIds.has(r.id) && !suspendedIds.has(r.id) && !injuredIds.has(r.id); });
                    logger_1.logger.info({ module: "match-runner" }, "team=".concat(teamId, " DB=").concat(rows.results.length, " absent=").concat(absentIds.size, " suspended=").concat(suspendedIds.size, " injured=").concat(injuredIds.size, " available=").concat(allAvailable.length));
                    if (suspendedIds.size > 0)
                        logger_1.logger.info({ module: "match-runner" }, "suspended IDs: ".concat(__spreadArray([], suspendedIds, true).join(",")));
                    if (injuredIds.size > 0)
                        logger_1.logger.info({ module: "match-runner" }, "injured IDs: ".concat(__spreadArray([], injuredIds, true).join(",")));
                    ordered = allAvailable;
                    if (userLineupJson) {
                        try {
                            userPicks = JSON.parse(userLineupJson);
                            pickedIds_2 = __spreadArray([], new Set(userPicks.map(function (p) { return p.playerId; })), true);
                            starters_4 = [];
                            _loop_4 = function (id) {
                                var player = allAvailable.find(function (r) { return r.id === id; });
                                if (player) {
                                    starters_4.push(player);
                                }
                                else {
                                    var isAbsent = absentIds.has(id);
                                    var isSusp = suspendedIds.has(id);
                                    var isInj = injuredIds.has(id);
                                    var dbPlayer = rows.results.find(function (r) { return r.id === id; });
                                    if (dbPlayer) {
                                        logger_1.logger.warn({ module: "match-runner" }, "LINEUP PLAYER ".concat(dbPlayer.first_name, " ").concat(dbPlayer.last_name, " (").concat(id, ") EXCLUDED: absent=").concat(isAbsent, " suspended=").concat(isSusp, " injured=").concat(isInj));
                                    }
                                    else {
                                        var msg = "MISSING: ".concat(id, " not in ").concat(rows.results.length, " rows.");
                                        console.log("[LINEUP-BUG] ".concat(msg));
                                        if (!globalThis.__lineupDebug)
                                            globalThis.__lineupDebug = [];
                                        globalThis.__lineupDebug.push(msg);
                                    }
                                }
                            };
                            for (_h = 0, pickedIds_1 = pickedIds_2; _h < pickedIds_1.length; _h++) {
                                id = pickedIds_1[_h];
                                _loop_4(id);
                            }
                            logger_1.logger.info({ module: "match-runner" }, "Lineup: ".concat(pickedIds_2.length, " picked, ").concat(starters_4.length, " found, ").concat(pickedIds_2.length - starters_4.length, " missing"));
                            missingByPos = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
                            _loop_5 = function (pick) {
                                if (!allAvailable.find(function (r) { return r.id === pick.playerId; })) {
                                    var pos = (_z = pick.matchPosition) !== null && _z !== void 0 ? _z : "MID";
                                    missingByPos[pos] = ((_0 = missingByPos[pos]) !== null && _0 !== void 0 ? _0 : 0) + 1;
                                }
                            };
                            for (_j = 0, _k = userPicks.slice(0, 11); _j < _k.length; _j++) {
                                pick = _k[_j];
                                _loop_5(pick);
                            }
                            restRaw = allAvailable.filter(function (r) { return !pickedIds_2.includes(r.id); });
                            positionPriority = {
                                GK: ["GK", "DEF", "MID", "FWD"],
                                DEF: ["DEF", "MID", "FWD", "GK"],
                                MID: ["MID", "DEF", "FWD", "GK"],
                                FWD: ["FWD", "MID", "DEF", "GK"],
                            };
                            replacements = [];
                            usedRestIds_1 = new Set();
                            for (_l = 0, _m = ["GK", "DEF", "MID", "FWD"]; _l < _m.length; _l++) {
                                pos = _m[_l];
                                need = (_1 = missingByPos[pos]) !== null && _1 !== void 0 ? _1 : 0;
                                for (i = 0; i < need; i++) {
                                    pick = void 0;
                                    _loop_6 = function (tryPos) {
                                        pick = restRaw.find(function (r) { return !usedRestIds_1.has(r.id) && r.position === tryPos; });
                                        if (pick)
                                            return "break";
                                    };
                                    for (_o = 0, _p = positionPriority[pos]; _o < _p.length; _o++) {
                                        tryPos = _p[_o];
                                        state_1 = _loop_6(tryPos);
                                        if (state_1 === "break")
                                            break;
                                    }
                                    if (pick) {
                                        replacements.push(pick);
                                        usedRestIds_1.add(pick.id);
                                    }
                                }
                            }
                            benchRest = restRaw.filter(function (r) { return !usedRestIds_1.has(r.id); });
                            ordered = __spreadArray(__spreadArray(__spreadArray([], starters_4, true), replacements, true), benchRest, true).slice(0, 16);
                            savedNames = pickedIds_2.map(function (id) {
                                var p = rows.results.find(function (r) { return r.id === id; });
                                return p ? "".concat(p.first_name, " ").concat(p.last_name) : "?".concat(id.slice(0, 8));
                            });
                            actualNames = ordered.slice(0, 11).map(function (r) { return "".concat(r.first_name, " ").concat(r.last_name); });
                            logger_1.logger.info({ module: "match-runner" }, "SAVED:  ".concat(savedNames.join(", ")));
                            logger_1.logger.info({ module: "match-runner" }, "ACTUAL: ".concat(actualNames.join(", ")));
                            if (!globalThis.__lineupDebug)
                                globalThis.__lineupDebug = [];
                            dbgSaved = starters_4.map(function (s) { return "".concat(s.first_name, " ").concat(s.last_name); }).join(",");
                            dbgActual = ordered.slice(0, 11).map(function (s) { return "".concat(s.first_name, " ").concat(s.last_name); }).join(",");
                            globalThis.__lineupDebug.push("team=".concat(teamId.slice(0, 8), " starters=").concat(starters_4.length, " ordered11=[").concat(dbgActual, "] savedPicked=[").concat(dbgSaved, "]"));
                        }
                        catch (e) {
                            logger_1.logger.error({ module: "match-runner" }, "Failed to parse lineup: ".concat(e));
                            ordered = allAvailable.slice(0, 16);
                        }
                    }
                    else {
                        ordered = allAvailable.slice(0, 16);
                    }
                    matchPositionMap = new Map();
                    if (userLineupJson) {
                        try {
                            picks = JSON.parse(userLineupJson);
                            for (_q = 0, picks_1 = picks; _q < picks_1.length; _q++) {
                                p = picks_1[_q];
                                if (p.matchPosition)
                                    matchPositionMap.set(p.playerId, p.matchPosition);
                            }
                        }
                        catch (e) {
                            logger_1.logger.warn({ module: "match-runner" }, "parse userLineupJson", e);
                        }
                    }
                    idCounter = 1 + idOffset;
                    idMap = new Map();
                    positionMap = new Map();
                    players = ordered.map(function (row) {
                        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1;
                        var skills = JSON.parse(row.skills);
                        var personality = JSON.parse(row.personality);
                        var lifeContext = JSON.parse(row.life_context);
                        var physical = row.physical ? JSON.parse(row.physical) : {};
                        var engineId = idCounter++;
                        var dbId = row.id;
                        idMap.set(engineId, dbId);
                        positionMap.set(dbId, row.position);
                        var mp = matchPositionMap.get(dbId);
                        return {
                            id: engineId,
                            firstName: row.first_name,
                            lastName: row.last_name,
                            nickname: row.nickname || null,
                            position: row.position,
                            matchPosition: mp ? mp : undefined,
                            speed: (_a = skills.speed) !== null && _a !== void 0 ? _a : 50,
                            technique: (_b = skills.technique) !== null && _b !== void 0 ? _b : 50,
                            shooting: (_c = skills.shooting) !== null && _c !== void 0 ? _c : 50,
                            passing: (_d = skills.passing) !== null && _d !== void 0 ? _d : 50,
                            heading: (_e = skills.heading) !== null && _e !== void 0 ? _e : 50,
                            defense: (_f = skills.defense) !== null && _f !== void 0 ? _f : 50,
                            goalkeeping: (_g = skills.goalkeeping) !== null && _g !== void 0 ? _g : 50,
                            stamina: (_j = (_h = physical.stamina) !== null && _h !== void 0 ? _h : skills.stamina) !== null && _j !== void 0 ? _j : 50,
                            strength: (_l = (_k = physical.strength) !== null && _k !== void 0 ? _k : skills.strength) !== null && _l !== void 0 ? _l : 50,
                            vision: (_m = skills.vision) !== null && _m !== void 0 ? _m : 50,
                            creativity: (_o = skills.creativity) !== null && _o !== void 0 ? _o : 50,
                            setPieces: (_p = skills.setPieces) !== null && _p !== void 0 ? _p : 50,
                            discipline: (_q = personality.discipline) !== null && _q !== void 0 ? _q : 50,
                            alcohol: (_r = personality.alcohol) !== null && _r !== void 0 ? _r : 30,
                            temper: (_s = personality.temper) !== null && _s !== void 0 ? _s : 40,
                            leadership: (_t = personality.leadership) !== null && _t !== void 0 ? _t : 30,
                            workRate: (_u = personality.workRate) !== null && _u !== void 0 ? _u : 50,
                            aggression: (_v = personality.aggression) !== null && _v !== void 0 ? _v : 40,
                            consistency: (_w = personality.consistency) !== null && _w !== void 0 ? _w : 50,
                            clutch: (_x = personality.clutch) !== null && _x !== void 0 ? _x : 50,
                            preferredFoot: (_y = physical.preferredFoot) !== null && _y !== void 0 ? _y : "right",
                            preferredSide: (_z = physical.preferredSide) !== null && _z !== void 0 ? _z : "center",
                            condition: (_0 = lifeContext.condition) !== null && _0 !== void 0 ? _0 : 100,
                            morale: (_1 = lifeContext.morale) !== null && _1 !== void 0 ? _1 : 50,
                        };
                    });
                    starters = players.slice(0, Math.min(11, players.length));
                    if (matchPositionMap.size > 0) {
                        presentDbIds = new Set();
                        for (_r = 0, starters_1 = starters; _r < starters_1.length; _r++) {
                            p = starters_1[_r];
                            dbId = idMap.get(p.id);
                            if (dbId)
                                presentDbIds.add(dbId);
                        }
                        missingPositions = [];
                        for (_s = 0, matchPositionMap_1 = matchPositionMap; _s < matchPositionMap_1.length; _s++) {
                            _t = matchPositionMap_1[_s], playerId = _t[0], pos = _t[1];
                            if (!presentDbIds.has(playerId)) {
                                missingPositions.push(pos);
                            }
                        }
                        _debugMissing = __spreadArray([], missingPositions, true);
                        unassigned = starters.filter(function (p) { return !p.matchPosition; });
                        _loop_7 = function (pos) {
                            var needCount = missingPositions.filter(function (mp) { return mp === pos; }).length;
                            for (var i = 0; i < needCount; i++) {
                                var naturalMatch = unassigned.find(function (p) { return !p.matchPosition && p.position === pos; });
                                var target = naturalMatch !== null && naturalMatch !== void 0 ? naturalMatch : unassigned.find(function (p) { return !p.matchPosition; });
                                if (target)
                                    target.matchPosition = pos;
                            }
                        };
                        for (_u = 0, _v = ["GK", "DEF", "MID", "FWD"]; _u < _v.length; _u++) {
                            pos = _v[_u];
                            _loop_7(pos);
                        }
                        // Fallback: kdyby zbyli unassigned (formace neúplná), dej jim natural position.
                        for (_w = 0, unassigned_1 = unassigned; _w < unassigned_1.length; _w++) {
                            p = unassigned_1[_w];
                            if (!p.matchPosition)
                                p.matchPosition = p.position;
                        }
                    }
                    else {
                        hasGK = false;
                        for (_x = 0, starters_2 = starters; _x < starters_2.length; _x++) {
                            p = starters_2[_x];
                            if (p.matchPosition) {
                                if (p.matchPosition === "GK")
                                    hasGK = true;
                                continue;
                            }
                            if (!hasGK && p.position === "GK") {
                                p.matchPosition = "GK";
                                hasGK = true;
                            }
                            else
                                p.matchPosition = p.position === "GK" ? "DEF" : p.position;
                        }
                        // If still no GK, assign the one with best goalkeeping
                        if (!hasGK && starters.length > 0) {
                            best = (_2 = starters.find(function (p) { return !p.matchPosition; })) !== null && _2 !== void 0 ? _2 : starters[0];
                            for (_y = 0, starters_3 = starters; _y < starters_3.length; _y++) {
                                p = starters_3[_y];
                                if (p.goalkeeping > best.goalkeeping)
                                    best = p;
                            }
                            best.matchPosition = "GK";
                        }
                    }
                    return [2 /*return*/, { players: players, idMap: idMap, positionMap: positionMap, absentNames: absentInfo }];
            }
        });
    });
}
/**
 * Copy last saved lineup to new calendar_id, or auto-generate if none exists.
 * Validates that copied players still exist and are active.
 */
function copyOrCreateLineup(db, teamId, calendarId) {
    return __awaiter(this, void 0, void 0, function () {
        var team, lastLineup, picks, activeIds, activeSet_1, validPicks, captainStillActive, e_17;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db.prepare("SELECT team_type FROM teams WHERE id = ?")
                        .bind(teamId).first()
                        .catch(function (e) { logger_1.logger.warn({ module: "match-runner" }, "team_type lookup", e); return null; })];
                case 1:
                    team = _a.sent();
                    if (!((team === null || team === void 0 ? void 0 : team.team_type) === "u21")) return [3 /*break*/, 3];
                    return [4 /*yield*/, createAutoLineup(db, teamId, calendarId)];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
                case 3: return [4 /*yield*/, db.prepare("SELECT l.formation, l.tactic, l.players_data, l.captain_id, l.preset_slot, l.submitted_at\n         FROM lineups l\n         WHERE l.team_id = ?\n           AND l.is_auto = 0\n         ORDER BY l.submitted_at DESC, l.id ASC LIMIT 1").bind(teamId).first().catch(function (e) {
                        logger_1.logger.error({ module: "match-runner" }, "copyOrCreateLineup: query failed", e);
                        return null;
                    })];
                case 4:
                    lastLineup = _a.sent();
                    if (!lastLineup) return [3 /*break*/, 12];
                    picks = JSON.parse(lastLineup.players_data);
                    return [4 /*yield*/, db.prepare("SELECT id FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active')").bind(teamId).all()];
                case 5:
                    activeIds = _a.sent();
                    activeSet_1 = new Set(activeIds.results.map(function (r) { return r.id; }));
                    validPicks = picks.filter(function (p) { return activeSet_1.has(p.playerId); });
                    if (!(validPicks.length >= 11)) return [3 /*break*/, 10];
                    captainStillActive = lastLineup.captain_id && activeSet_1.has(lastLineup.captain_id) ? lastLineup.captain_id : null;
                    _a.label = 6;
                case 6:
                    _a.trys.push([6, 8, , 9]);
                    // POZOR: zachovej původní submitted_at, aby kopie nepřepsala "poslední user-saved"
                    // pro budoucí copyOrCreateLineup volání. Bez toho by se každou simulací posouval
                    // "poslední lineup" na auto-kopii a metadata se postupně ztrácela.
                    return [4 /*yield*/, db.prepare("INSERT INTO lineups (id, team_id, calendar_id, formation, tactic, players_data, captain_id, preset_slot, is_auto, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)").bind(crypto.randomUUID(), teamId, calendarId, lastLineup.formation, lastLineup.tactic, JSON.stringify(validPicks.slice(0, 11)), captainStillActive, lastLineup.preset_slot, lastLineup.submitted_at).run()];
                case 7:
                    // POZOR: zachovej původní submitted_at, aby kopie nepřepsala "poslední user-saved"
                    // pro budoucí copyOrCreateLineup volání. Bez toho by se každou simulací posouval
                    // "poslední lineup" na auto-kopii a metadata se postupně ztrácela.
                    _a.sent();
                    return [2 /*return*/];
                case 8:
                    e_17 = _a.sent();
                    logger_1.logger.error({ module: "match-runner" }, "copyOrCreateLineup INSERT failed for ".concat(teamId, " cal=").concat(calendarId), e_17);
                    return [3 /*break*/, 9];
                case 9: return [3 /*break*/, 11];
                case 10:
                    logger_1.logger.warn({ module: "match-runner" }, "copyOrCreateLineup: only ".concat(validPicks.length, "/11 valid for ").concat(teamId));
                    _a.label = 11;
                case 11: return [3 /*break*/, 13];
                case 12:
                    logger_1.logger.warn({ module: "match-runner" }, "copyOrCreateLineup: no lineup found for ".concat(teamId));
                    _a.label = 13;
                case 13: 
                // Fallback: auto-generate
                return [4 /*yield*/, createAutoLineup(db, teamId, calendarId)];
                case 14:
                    // Fallback: auto-generate
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function createAutoLineup(db, teamId, calendarId) {
    return __awaiter(this, void 0, void 0, function () {
        var players, savedLineup, formation, parts, slots, picked, usedIds, _loop_8, _i, _a, pos, _loop_9, state_2, savedTactic, tactic, lineupId;
        var _b, _c, _d, _e;
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0: return [4 /*yield*/, db.prepare("SELECT id, position, overall_rating FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active') ORDER BY overall_rating DESC").bind(teamId).all()];
                case 1:
                    players = _f.sent();
                    return [4 /*yield*/, db.prepare("SELECT formation FROM lineups WHERE team_id = ? ORDER BY submitted_at DESC LIMIT 1")
                            .bind(teamId).first().catch(function (e) {
                            logger_1.logger.warn({ module: "match-runner" }, "query failed", e);
                            return null;
                        })];
                case 2:
                    savedLineup = _f.sent();
                    formation = (_b = savedLineup === null || savedLineup === void 0 ? void 0 : savedLineup.formation) !== null && _b !== void 0 ? _b : "4-4-2";
                    parts = formation.split("-").map(Number);
                    slots = {
                        GK: 1,
                        DEF: parts[0] || 4,
                        MID: (parts[1] || 4) + (parts[2] && parts.length > 3 ? parts[2] : 0),
                        FWD: parts[parts.length - 1] || 2
                    };
                    picked = [];
                    usedIds = new Set();
                    _loop_8 = function (pos) {
                        var candidates = players.results.filter(function (p) { return p.position === pos && !usedIds.has(p.id); });
                        var count = slots[pos];
                        for (var i = 0; i < count && i < candidates.length; i++) {
                            picked.push({ playerId: candidates[i].id, matchPosition: pos });
                            usedIds.add(candidates[i].id);
                        }
                    };
                    // First pass: fill each position with natural players
                    for (_i = 0, _a = ["GK", "DEF", "MID", "FWD"]; _i < _a.length; _i++) {
                        pos = _a[_i];
                        _loop_8(pos);
                    }
                    _loop_9 = function () {
                        var remaining = players.results.find(function (p) { return !usedIds.has(p.id); });
                        if (!remaining)
                            return "break";
                        // Find which position still needs players
                        var filled = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
                        for (var _g = 0, picked_1 = picked; _g < picked_1.length; _g++) {
                            var p = picked_1[_g];
                            filled[p.matchPosition]++;
                        }
                        var needPos = (_d = (_c = Object.entries(slots).find(function (_a) {
                            var pos = _a[0], need = _a[1];
                            return filled[pos] < need;
                        })) === null || _c === void 0 ? void 0 : _c[0]) !== null && _d !== void 0 ? _d : "MID";
                        picked.push({ playerId: remaining.id, matchPosition: needPos });
                        usedIds.add(remaining.id);
                    };
                    // Second pass: fill remaining slots with best available (out of position)
                    while (picked.length < 11) {
                        state_2 = _loop_9();
                        if (state_2 === "break")
                            break;
                    }
                    return [4 /*yield*/, db.prepare("SELECT tactic FROM lineups WHERE team_id = ? AND is_auto = 0 ORDER BY submitted_at DESC LIMIT 1")
                            .bind(teamId).first().catch(function (e) {
                            logger_1.logger.warn({ module: "match-runner" }, "load saved tactic", e);
                            return null;
                        })];
                case 3:
                    savedTactic = _f.sent();
                    tactic = (_e = savedTactic === null || savedTactic === void 0 ? void 0 : savedTactic.tactic) !== null && _e !== void 0 ? _e : "balanced";
                    lineupId = crypto.randomUUID();
                    return [4 /*yield*/, db.prepare("INSERT INTO lineups (id, team_id, calendar_id, formation, tactic, players_data, is_auto) VALUES (?, ?, ?, ?, ?, ?, 1)").bind(lineupId, teamId, calendarId, formation, tactic, JSON.stringify(picked)).run()];
                case 4:
                    _f.sent();
                    return [2 /*return*/];
            }
        });
    });
}
