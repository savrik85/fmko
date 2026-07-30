"use strict";
/**
 * Friendly match runner — simuluje přátelské zápasy (bez calendar/league).
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
exports.simulateFriendlyMatches = simulateFriendlyMatches;
var simulation_1 = require("../engine/simulation");
var commentary_1 = require("../engine/commentary");
var rng_1 = require("../generators/rng");
var match_runner_1 = require("./match-runner");
var logger_1 = require("../lib/logger");
function simulateFriendlyMatches(db) {
    return __awaiter(this, void 0, void 0, function () {
        var matches, count, weathers, roll, weather, weights, cum, i, _loop_1, _i, _a, match;
        var _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z;
        return __generator(this, function (_0) {
            switch (_0.label) {
                case 0: return [4 /*yield*/, db.prepare("SELECT id, home_team_id, away_team_id FROM matches WHERE calendar_id IS NULL AND league_id IS NULL AND status = 'lineups_open'").all()];
                case 1:
                    matches = _0.sent();
                    if (matches.results.length === 0)
                        return [2 /*return*/, 0];
                    count = 0;
                    weathers = ["sunny", "cloudy", "rain", "wind", "snow"];
                    roll = Math.random() * 100;
                    weather = "cloudy";
                    weights = [30, 30, 20, 15, 5];
                    cum = 0;
                    for (i = 0; i < weathers.length; i++) {
                        cum += weights[i];
                        if (roll < cum) {
                            weather = weathers[i];
                            break;
                        }
                    }
                    _loop_1 = function (match) {
                        var matchId, homeTeamId, awayTeamId, rng, copyOrCreateLineup, hasHomeLineup, hasAwayLineup, homeLineupRow_1, awayLineupRow_1, homeBuild, awayBuild, homeLineup_1, awayLineup, homeSubs_1, awaySubs, homeLineupPreSim, awayLineupPreSim, homeSubsPreSim, awaySubsPreSim, homeTeam, awayTeam, homeTactic, awayTactic, homeFormation, awayFormation, homeCaptainEngineId, awayCaptainEngineId, readFamiliarity, homeFam, awayFam, homeSetup, awaySetup, stadiumRow, stadiumNameRow, friendlyAttendance, result, commDistrict, commentary, buildLineupData, homeLineupData, awayLineupData, matchAbsences, applyMatchResult, e_1, processMatchDayFinances, gameDate, attendance, homeResult, awayResult, homeTeamRow, awayTeamRow, e_2, logConditionStmt, allPlayers, fullIdMap, _1, _2, _3, engineId, dbId, _4, _5, _6, engineId, dbId, preSimCondById, _7, _8, p, stmts, _9, allPlayers_1, p, dbId, oldCond, teamIdForPlayer, e_3, fullIdMap, _10, _11, _12, engineId, dbId, _13, _14, _15, engineId, dbId, matchRng, _16, _17, _18, engineId, pm, dbId, minutes, playerRow, age, ageMod, minutesMod, improveChance, skills, posSkills, candidates, attr, current, e_4, smsBody, _19, _20, tid, convId, e_5;
                        return __generator(this, function (_21) {
                            switch (_21.label) {
                                case 0:
                                    matchId = match.id;
                                    homeTeamId = match.home_team_id;
                                    awayTeamId = match.away_team_id;
                                    _21.label = 1;
                                case 1:
                                    _21.trys.push([1, 58, , 59]);
                                    rng = (0, rng_1.createRng)(Date.now() + matchId.charCodeAt(0));
                                    return [4 /*yield*/, Promise.resolve().then(function () { return require("./match-runner"); })];
                                case 2:
                                    copyOrCreateLineup = (_21.sent()).copyOrCreateLineup;
                                    return [4 /*yield*/, db.prepare("SELECT id FROM lineups WHERE team_id = ? AND calendar_id = ?")
                                            .bind(homeTeamId, matchId).first().catch(function (e) { logger_1.logger.warn({ module: "friendly-runner" }, "check home lineup", e); return null; })];
                                case 3:
                                    hasHomeLineup = _21.sent();
                                    if (!!hasHomeLineup) return [3 /*break*/, 5];
                                    return [4 /*yield*/, copyOrCreateLineup(db, homeTeamId, matchId)];
                                case 4:
                                    _21.sent();
                                    _21.label = 5;
                                case 5: return [4 /*yield*/, db.prepare("SELECT id FROM lineups WHERE team_id = ? AND calendar_id = ?")
                                        .bind(awayTeamId, matchId).first().catch(function (e) { logger_1.logger.warn({ module: "friendly-runner" }, "check away lineup", e); return null; })];
                                case 6:
                                    hasAwayLineup = _21.sent();
                                    if (!!hasAwayLineup) return [3 /*break*/, 8];
                                    return [4 /*yield*/, copyOrCreateLineup(db, awayTeamId, matchId)];
                                case 7:
                                    _21.sent();
                                    _21.label = 8;
                                case 8: return [4 /*yield*/, db.prepare("SELECT formation, tactic, players_data, captain_id FROM lineups WHERE team_id = ? AND calendar_id = ?")
                                        .bind(homeTeamId, matchId).first()
                                        .catch(function (e) { logger_1.logger.warn({ module: "friendly-runner" }, "load home lineup", e); return null; })];
                                case 9:
                                    homeLineupRow_1 = _21.sent();
                                    return [4 /*yield*/, db.prepare("SELECT formation, tactic, players_data, captain_id FROM lineups WHERE team_id = ? AND calendar_id = ?")
                                            .bind(awayTeamId, matchId).first()
                                            .catch(function (e) { logger_1.logger.warn({ module: "friendly-runner" }, "load away lineup", e); return null; })];
                                case 10:
                                    awayLineupRow_1 = _21.sent();
                                    return [4 /*yield*/, (0, match_runner_1.buildMatchPlayers)(db, homeTeamId, (_b = homeLineupRow_1 === null || homeLineupRow_1 === void 0 ? void 0 : homeLineupRow_1.players_data) !== null && _b !== void 0 ? _b : null, 0, { friendlyMultiplier: 1.8, matchKey: matchId })];
                                case 11:
                                    homeBuild = _21.sent();
                                    return [4 /*yield*/, (0, match_runner_1.buildMatchPlayers)(db, awayTeamId, (_c = awayLineupRow_1 === null || awayLineupRow_1 === void 0 ? void 0 : awayLineupRow_1.players_data) !== null && _c !== void 0 ? _c : null, 100, { friendlyMultiplier: 1.8, matchKey: matchId })];
                                case 12:
                                    awayBuild = _21.sent();
                                    homeLineup_1 = homeBuild.players;
                                    awayLineup = awayBuild.players;
                                    homeSubs_1 = homeLineup_1.splice(11);
                                    awaySubs = awayLineup.splice(11);
                                    homeLineupPreSim = homeLineup_1.map(function (p) { return (__assign({}, p)); });
                                    awayLineupPreSim = awayLineup.map(function (p) { return (__assign({}, p)); });
                                    homeSubsPreSim = homeSubs_1.map(function (p) { return (__assign({}, p)); });
                                    awaySubsPreSim = awaySubs.map(function (p) { return (__assign({}, p)); });
                                    return [4 /*yield*/, db.prepare("SELECT name FROM teams WHERE id = ?").bind(homeTeamId).first()];
                                case 13:
                                    homeTeam = _21.sent();
                                    return [4 /*yield*/, db.prepare("SELECT name FROM teams WHERE id = ?").bind(awayTeamId).first()];
                                case 14:
                                    awayTeam = _21.sent();
                                    homeTactic = (_d = homeLineupRow_1 === null || homeLineupRow_1 === void 0 ? void 0 : homeLineupRow_1.tactic) !== null && _d !== void 0 ? _d : "balanced";
                                    awayTactic = (_e = awayLineupRow_1 === null || awayLineupRow_1 === void 0 ? void 0 : awayLineupRow_1.tactic) !== null && _e !== void 0 ? _e : "balanced";
                                    homeFormation = (_f = homeLineupRow_1 === null || homeLineupRow_1 === void 0 ? void 0 : homeLineupRow_1.formation) !== null && _f !== void 0 ? _f : "4-4-2";
                                    awayFormation = (_g = awayLineupRow_1 === null || awayLineupRow_1 === void 0 ? void 0 : awayLineupRow_1.formation) !== null && _g !== void 0 ? _g : "4-4-2";
                                    homeCaptainEngineId = (homeLineupRow_1 === null || homeLineupRow_1 === void 0 ? void 0 : homeLineupRow_1.captain_id) ? (_h = __spreadArray([], homeBuild.idMap.entries(), true).find(function (_a) {
                                        var dbId = _a[1];
                                        return dbId === homeLineupRow_1.captain_id;
                                    })) === null || _h === void 0 ? void 0 : _h[0] : undefined;
                                    awayCaptainEngineId = (awayLineupRow_1 === null || awayLineupRow_1 === void 0 ? void 0 : awayLineupRow_1.captain_id) ? (_j = __spreadArray([], awayBuild.idMap.entries(), true).find(function (_a) {
                                        var dbId = _a[1];
                                        return dbId === awayLineupRow_1.captain_id;
                                    })) === null || _j === void 0 ? void 0 : _j[0] : undefined;
                                    return [4 /*yield*/, Promise.resolve().then(function () { return require("../engine/chemistry"); })];
                                case 15:
                                    readFamiliarity = (_21.sent()).readFamiliarity;
                                    return [4 /*yield*/, readFamiliarity(db, homeTeamId)];
                                case 16:
                                    homeFam = _21.sent();
                                    return [4 /*yield*/, readFamiliarity(db, awayTeamId)];
                                case 17:
                                    awayFam = _21.sent();
                                    homeSetup = {
                                        teamId: 1,
                                        teamName: (_k = homeTeam === null || homeTeam === void 0 ? void 0 : homeTeam.name) !== null && _k !== void 0 ? _k : "Domácí",
                                        lineup: homeLineup_1,
                                        subs: homeSubs_1,
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
                                    return [4 /*yield*/, db.prepare("SELECT pitch_condition FROM stadiums WHERE team_id = ?")
                                            .bind(homeTeamId).first().catch(function (e) { logger_1.logger.warn({ module: "friendly-runner" }, "load stadium", e); return null; })];
                                case 18:
                                    stadiumRow = _21.sent();
                                    return [4 /*yield*/, db.prepare("SELECT stadium_name FROM teams WHERE id = ?")
                                            .bind(homeTeamId).first().catch(function (e) { logger_1.logger.warn({ module: "friendly-runner" }, "load stadium name", e); return null; })];
                                case 19:
                                    stadiumNameRow = _21.sent();
                                    friendlyAttendance = Math.round(20 + Math.random() * 50);
                                    result = (0, simulation_1.simulateMatch)(rng, {
                                        home: homeSetup,
                                        away: awaySetup,
                                        weather: weather,
                                        isHomeAdvantage: false, // přátelák = neutrální
                                        pitchCondition: (_p = stadiumRow === null || stadiumRow === void 0 ? void 0 : stadiumRow.pitch_condition) !== null && _p !== void 0 ? _p : 50,
                                        stadiumName: (_q = stadiumNameRow === null || stadiumNameRow === void 0 ? void 0 : stadiumNameRow.stadium_name) !== null && _q !== void 0 ? _q : undefined,
                                        attendance: friendlyAttendance,
                                    });
                                    // Commentary (okresově dle domácího = dějiště)
                                    return [4 /*yield*/, (0, commentary_1.loadCommentaryFromDB)(db)];
                                case 20:
                                    // Commentary (okresově dle domácího = dějiště)
                                    _21.sent();
                                    return [4 /*yield*/, db.prepare("SELECT v.district FROM teams t LEFT JOIN villages v ON t.village_id = v.id WHERE t.id = ?").bind(homeTeamId).first()
                                            .catch(function (e) { logger_1.logger.warn({ module: "friendly-runner" }, "load district for commentary", e); return null; })];
                                case 21:
                                    commDistrict = (_s = (_r = (_21.sent())) === null || _r === void 0 ? void 0 : _r.district) !== null && _s !== void 0 ? _s : undefined;
                                    commentary = (0, commentary_1.generateMatchCommentary)(rng, result.events, homeSetup.teamName, awaySetup.teamName, commDistrict);
                                    buildLineupData = function (lineup, subs, idMap, formation, tactic, captainEngineId) {
                                        var _a;
                                        var gkCount = 0;
                                        var mapStarter = function (p) {
                                            var _a, _b;
                                            var pos = (_a = p.matchPosition) !== null && _a !== void 0 ? _a : p.position;
                                            if (pos === "GK") {
                                                gkCount++;
                                                if (gkCount > 1)
                                                    pos = "DEF";
                                            }
                                            return { id: (_b = idMap.get(p.id)) !== null && _b !== void 0 ? _b : "", name: "".concat(p.firstName, " ").concat(p.lastName), position: pos, naturalPosition: p.position,
                                                rating: Math.round((p.speed + p.technique + p.shooting + p.passing + p.defense) / 5) };
                                        };
                                        var mapSub = function (p) {
                                            var _a, _b;
                                            return ({
                                                id: (_a = idMap.get(p.id)) !== null && _a !== void 0 ? _a : "", name: "".concat(p.firstName, " ").concat(p.lastName),
                                                position: (_b = p.matchPosition) !== null && _b !== void 0 ? _b : p.position, naturalPosition: p.position,
                                                rating: Math.round((p.speed + p.technique + p.shooting + p.passing + p.defense) / 5),
                                            });
                                        };
                                        var captainDbId = captainEngineId != null ? ((_a = idMap.get(captainEngineId)) !== null && _a !== void 0 ? _a : null) : null;
                                        return { starters: lineup.map(mapStarter), subs: subs.map(mapSub), formation: formation, tactic: tactic, captainId: captainDbId };
                                    };
                                    homeLineupData = buildLineupData(homeLineupPreSim, homeSubsPreSim, homeBuild.idMap, homeFormation, homeTactic, homeCaptainEngineId);
                                    awayLineupData = buildLineupData(awayLineupPreSim, awaySubsPreSim, awayBuild.idMap, awayFormation, awayTactic, awayCaptainEngineId);
                                    matchAbsences = __spreadArray(__spreadArray([], ((_t = homeBuild.absentNames) !== null && _t !== void 0 ? _t : []).map(function (a) { return (__assign(__assign({}, a), { teamId: homeTeamId })); }), true), ((_u = awayBuild.absentNames) !== null && _u !== void 0 ? _u : []).map(function (a) { return (__assign(__assign({}, a), { teamId: awayTeamId })); }), true);
                                    // Save
                                    return [4 /*yield*/, db.prepare("UPDATE matches SET status = 'simulated', home_score = ?, away_score = ?,\n         events = ?, commentary = ?, attendance = ?, stadium_name = ?, pitch_condition = ?, weather = ?,\n         home_lineup_data = ?, away_lineup_data = ?, absences = ?, possession_home = ?,\n         simulated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?").bind(result.homeScore, result.awayScore, JSON.stringify(result.events), JSON.stringify(commentary), friendlyAttendance, (_v = stadiumNameRow === null || stadiumNameRow === void 0 ? void 0 : stadiumNameRow.stadium_name) !== null && _v !== void 0 ? _v : null, (_w = stadiumRow === null || stadiumRow === void 0 ? void 0 : stadiumRow.pitch_condition) !== null && _w !== void 0 ? _w : 50, weather, JSON.stringify(homeLineupData), JSON.stringify(awayLineupData), matchAbsences.length > 0 ? JSON.stringify(matchAbsences) : null, result.possessionHome, matchId).run()];
                                case 22:
                                    // Save
                                    _21.sent();
                                    // Update challenge status
                                    return [4 /*yield*/, db.prepare("UPDATE challenges SET status = 'played' WHERE match_id = ?").bind(matchId).run().catch(function (e) { return logger_1.logger.warn({ module: "friendly-runner" }, "update challenge status", e); })];
                                case 23:
                                    // Update challenge status
                                    _21.sent();
                                    _21.label = 24;
                                case 24:
                                    _21.trys.push([24, 28, , 29]);
                                    return [4 /*yield*/, Promise.resolve().then(function () { return require("../engine/chemistry"); })];
                                case 25:
                                    applyMatchResult = (_21.sent()).applyMatchResult;
                                    return [4 /*yield*/, applyMatchResult(db, homeTeamId, homeTactic, homeFormation)];
                                case 26:
                                    _21.sent();
                                    return [4 /*yield*/, applyMatchResult(db, awayTeamId, awayTactic, awayFormation)];
                                case 27:
                                    _21.sent();
                                    return [3 /*break*/, 29];
                                case 28:
                                    e_1 = _21.sent();
                                    logger_1.logger.warn({ module: "friendly-runner" }, "apply chemistry post-friendly", e_1);
                                    return [3 /*break*/, 29];
                                case 29:
                                    _21.trys.push([29, 37, , 38]);
                                    return [4 /*yield*/, Promise.resolve().then(function () { return require("../season/finance-processor"); })];
                                case 30:
                                    processMatchDayFinances = (_21.sent()).processMatchDayFinances;
                                    gameDate = new Date().toISOString().split("T")[0];
                                    attendance = friendlyAttendance;
                                    homeResult = result.homeScore > result.awayScore ? "win" : result.homeScore < result.awayScore ? "loss" : "draw";
                                    awayResult = homeResult === "win" ? "loss" : homeResult === "loss" ? "win" : "draw";
                                    return [4 /*yield*/, db.prepare("SELECT user_id FROM teams WHERE id = ?").bind(homeTeamId).first().catch(function (e) { logger_1.logger.warn({ module: "friendly-runner" }, "fetch home team user_id", e); return null; })];
                                case 31:
                                    homeTeamRow = _21.sent();
                                    return [4 /*yield*/, db.prepare("SELECT user_id FROM teams WHERE id = ?").bind(awayTeamId).first().catch(function (e) { logger_1.logger.warn({ module: "friendly-runner" }, "fetch away team user_id", e); return null; })];
                                case 32:
                                    awayTeamRow = _21.sent();
                                    if (!((homeTeamRow === null || homeTeamRow === void 0 ? void 0 : homeTeamRow.user_id) && homeTeamRow.user_id !== "ai")) return [3 /*break*/, 34];
                                    return [4 /*yield*/, processMatchDayFinances(db, homeTeamId, matchId, true, homeResult, attendance, gameDate, 50, true)];
                                case 33:
                                    _21.sent();
                                    _21.label = 34;
                                case 34:
                                    if (!((awayTeamRow === null || awayTeamRow === void 0 ? void 0 : awayTeamRow.user_id) && awayTeamRow.user_id !== "ai")) return [3 /*break*/, 36];
                                    return [4 /*yield*/, processMatchDayFinances(db, awayTeamId, matchId, false, awayResult, attendance, gameDate, 50, true)];
                                case 35:
                                    _21.sent();
                                    _21.label = 36;
                                case 36: return [3 /*break*/, 38];
                                case 37:
                                    e_2 = _21.sent();
                                    logger_1.logger.error({ module: "friendly-runner" }, "Finance processing failed", e_2);
                                    return [3 /*break*/, 38];
                                case 38:
                                    _21.trys.push([38, 42, , 43]);
                                    return [4 /*yield*/, Promise.resolve().then(function () { return require("../lib/condition-log"); })];
                                case 39:
                                    logConditionStmt = (_21.sent()).logConditionStmt;
                                    allPlayers = __spreadArray(__spreadArray([], result.homeLineup, true), result.awayLineup, true);
                                    fullIdMap = new Map();
                                    for (_1 = 0, _2 = homeBuild.idMap; _1 < _2.length; _1++) {
                                        _3 = _2[_1], engineId = _3[0], dbId = _3[1];
                                        fullIdMap.set(engineId, dbId);
                                    }
                                    for (_4 = 0, _5 = awayBuild.idMap; _4 < _5.length; _4++) {
                                        _6 = _5[_4], engineId = _6[0], dbId = _6[1];
                                        fullIdMap.set(engineId, dbId);
                                    }
                                    preSimCondById = new Map();
                                    for (_7 = 0, _8 = __spreadArray(__spreadArray([], homeLineupPreSim, true), awayLineupPreSim, true); _7 < _8.length; _7++) {
                                        p = _8[_7];
                                        preSimCondById.set(p.id, p.condition);
                                    }
                                    stmts = [];
                                    for (_9 = 0, allPlayers_1 = allPlayers; _9 < allPlayers_1.length; _9++) {
                                        p = allPlayers_1[_9];
                                        dbId = fullIdMap.get(p.id);
                                        if (!dbId)
                                            continue;
                                        stmts.push(db.prepare("UPDATE players SET life_context = json_set(life_context, '$.condition', ?, '$.morale', ?) WHERE id = ?").bind(Math.round(p.condition), Math.round(p.morale), dbId));
                                        oldCond = preSimCondById.get(p.id);
                                        if (oldCond != null && Math.round(oldCond) !== Math.round(p.condition)) {
                                            teamIdForPlayer = result.homeLineup.includes(p) ? homeTeamId : awayTeamId;
                                            stmts.push(logConditionStmt(db, dbId, teamIdForPlayer, oldCond, p.condition, "friendly", "P\u0159\u00E1tel\u00E1k (".concat(result.homeScore, ":").concat(result.awayScore, ")")));
                                        }
                                    }
                                    if (!(stmts.length > 0)) return [3 /*break*/, 41];
                                    return [4 /*yield*/, db.batch(stmts)];
                                case 40:
                                    _21.sent();
                                    _21.label = 41;
                                case 41: return [3 /*break*/, 43];
                                case 42:
                                    e_3 = _21.sent();
                                    logger_1.logger.error({ module: "friendly-runner" }, "Condition persist failed", e_3);
                                    return [3 /*break*/, 43];
                                case 43:
                                    _21.trys.push([43, 50, , 51]);
                                    fullIdMap = new Map();
                                    for (_10 = 0, _11 = homeBuild.idMap; _10 < _11.length; _10++) {
                                        _12 = _11[_10], engineId = _12[0], dbId = _12[1];
                                        fullIdMap.set(engineId, dbId);
                                    }
                                    for (_13 = 0, _14 = awayBuild.idMap; _13 < _14.length; _13++) {
                                        _15 = _14[_13], engineId = _15[0], dbId = _15[1];
                                        fullIdMap.set(engineId, dbId);
                                    }
                                    matchRng = (0, rng_1.createRng)(Date.now() + matchId.charCodeAt(2));
                                    _16 = 0, _17 = Object.entries(result.playerMinutes);
                                    _21.label = 44;
                                case 44:
                                    if (!(_16 < _17.length)) return [3 /*break*/, 49];
                                    _18 = _17[_16], engineId = _18[0], pm = _18[1];
                                    dbId = fullIdMap.get(Number(engineId));
                                    if (!dbId)
                                        return [3 /*break*/, 48];
                                    minutes = ((_x = pm.left) !== null && _x !== void 0 ? _x : 90) - pm.entered;
                                    if (minutes < 15)
                                        return [3 /*break*/, 48];
                                    return [4 /*yield*/, db.prepare("SELECT age, skills, position, team_id FROM players WHERE id = ?")
                                            .bind(dbId).first().catch(function (e) { logger_1.logger.warn({ module: "friendly-runner" }, "load player for experience", e); return null; })];
                                case 45:
                                    playerRow = _21.sent();
                                    if (!playerRow)
                                        return [3 /*break*/, 48];
                                    age = playerRow.age;
                                    ageMod = age < 22 ? 0.04 : age < 26 ? 0.025 : age < 30 ? 0.015 : 0.005;
                                    minutesMod = minutes / 90;
                                    improveChance = ageMod * minutesMod;
                                    if (!(matchRng.random() < improveChance)) return [3 /*break*/, 48];
                                    skills = JSON.parse(playerRow.skills);
                                    posSkills = {
                                        GK: ["goalkeeping"], DEF: ["defense", "heading", "strength"],
                                        MID: ["passing", "technique"], FWD: ["shooting", "speed", "technique"],
                                    };
                                    candidates = (_y = posSkills[playerRow.position]) !== null && _y !== void 0 ? _y : ["technique"];
                                    attr = matchRng.pick(candidates);
                                    current = (_z = skills[attr]) !== null && _z !== void 0 ? _z : 50;
                                    if (!(current < 80)) return [3 /*break*/, 48];
                                    skills[attr] = current + 1;
                                    return [4 /*yield*/, db.prepare("UPDATE players SET skills = ? WHERE id = ?")
                                            .bind(JSON.stringify(skills), dbId).run()];
                                case 46:
                                    _21.sent();
                                    return [4 /*yield*/, db.prepare("INSERT INTO training_log (player_id, team_id, attribute, old_value, new_value, change, training_type, game_date) VALUES (?, ?, ?, ?, ?, 1, 'friendly', ?)").bind(dbId, playerRow.team_id, attr, current, current + 1, new Date().toISOString()).run().catch(function (e) { return logger_1.logger.warn({ module: "friendly-runner" }, "training log insert", e); })];
                                case 47:
                                    _21.sent();
                                    _21.label = 48;
                                case 48:
                                    _16++;
                                    return [3 /*break*/, 44];
                                case 49: return [3 /*break*/, 51];
                                case 50:
                                    e_4 = _21.sent();
                                    logger_1.logger.error({ module: "friendly-runner" }, "Match experience failed", e_4);
                                    return [3 /*break*/, 51];
                                case 51:
                                    smsBody = "\u26BD P\u0159\u00E1tel\u00E1k odehr\u00E1n! ".concat(homeSetup.teamName, " ").concat(result.homeScore, ":").concat(result.awayScore, " ").concat(awaySetup.teamName);
                                    _19 = 0, _20 = [homeTeamId, awayTeamId];
                                    _21.label = 52;
                                case 52:
                                    if (!(_19 < _20.length)) return [3 /*break*/, 57];
                                    tid = _20[_19];
                                    return [4 /*yield*/, db.prepare("SELECT id FROM conversations WHERE team_id = ? AND type = 'system' AND title = 'Sportovní ředitel'")
                                            .bind(tid).first().then(function (r) { return r === null || r === void 0 ? void 0 : r.id; }).catch(function (e) { logger_1.logger.warn({ module: "friendly-runner" }, "find sportovni reditel conv", e); return null; })];
                                case 53:
                                    convId = _21.sent();
                                    if (!convId) return [3 /*break*/, 56];
                                    return [4 /*yield*/, db.prepare("INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, sent_at) VALUES (?, ?, 'system', 'Sportovní ředitel', ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))")
                                            .bind(crypto.randomUUID(), convId, smsBody).run().catch(function (e) { return logger_1.logger.warn({ module: "friendly-runner" }, "insert sms message", e); })];
                                case 54:
                                    _21.sent();
                                    return [4 /*yield*/, db.prepare("UPDATE conversations SET unread_count = unread_count + 1, last_message_text = ?, last_message_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?")
                                            .bind(smsBody.slice(0, 100), convId).run().catch(function (e) { return logger_1.logger.warn({ module: "friendly-runner" }, "update conv unread", e); })];
                                case 55:
                                    _21.sent();
                                    _21.label = 56;
                                case 56:
                                    _19++;
                                    return [3 /*break*/, 52];
                                case 57:
                                    count++;
                                    logger_1.logger.info({ module: "friendly-runner" }, "Friendly simulated: ".concat(homeSetup.teamName, " ").concat(result.homeScore, ":").concat(result.awayScore, " ").concat(awaySetup.teamName));
                                    return [3 /*break*/, 59];
                                case 58:
                                    e_5 = _21.sent();
                                    logger_1.logger.error({ module: "friendly-runner" }, "Failed to simulate friendly ".concat(matchId), e_5);
                                    return [3 /*break*/, 59];
                                case 59: return [2 /*return*/];
                            }
                        });
                    };
                    _i = 0, _a = matches.results;
                    _0.label = 2;
                case 2:
                    if (!(_i < _a.length)) return [3 /*break*/, 5];
                    match = _a[_i];
                    return [5 /*yield**/, _loop_1(match)];
                case 3:
                    _0.sent();
                    _0.label = 4;
                case 4:
                    _i++;
                    return [3 /*break*/, 2];
                case 5: return [2 /*return*/, count];
            }
        });
    });
}
