"use strict";
/**
 * Match API routes — absence, lineup, simulace, výsledky.
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
exports.matchesRouter = void 0;
var hono_1 = require("hono");
var middleware_1 = require("../auth/middleware");
var session_1 = require("../auth/session");
var logger_1 = require("../lib/logger");
var season_1 = require("../lib/season");
var matchesRouter = new hono_1.Hono();
exports.matchesRouter = matchesRouter;
matchesRouter.use("/teams/:teamId/*", middleware_1.requireTeamOwnership);
function uuid() { return crypto.randomUUID(); }
// GET /api/teams/:teamId/match-preview/:matchId — detailed match preview with team comparison
matchesRouter.get("/teams/:teamId/match-preview/:matchId", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, matchId, match, homeId, awayId, _a, homeTeam, awayTeam, isLocalDerby, leagueId, allTeams, tIds, ph, leagueMatches, stats, _i, tIds_1, tid, _b, _c, m, hid, aid, hs, as_, sorted, posMap, _d, homePlayers, awayPlayers, homeManager, awayManager, mapTeam, stadium, generateForecast, schedAt, forecast;
    var _e, _f, _g, _h;
    return __generator(this, function (_j) {
        switch (_j.label) {
            case 0:
                teamId = c.req.param("teamId");
                matchId = c.req.param("matchId");
                return [4 /*yield*/, c.env.DB.prepare("SELECT m.*, sc.scheduled_at, sc.game_week\n     FROM matches m LEFT JOIN season_calendar sc ON m.calendar_id = sc.id\n     WHERE m.id = ?").bind(matchId).first()];
            case 1:
                match = _j.sent();
                if (!match)
                    return [2 /*return*/, c.json({ error: "Match not found" }, 404)];
                homeId = match.home_team_id;
                awayId = match.away_team_id;
                return [4 /*yield*/, Promise.all([
                        c.env.DB.prepare("SELECT t.*, v.name as village_name FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?")
                            .bind(homeId).first(),
                        c.env.DB.prepare("SELECT t.*, v.name as village_name FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?")
                            .bind(awayId).first(),
                    ])];
            case 2:
                _a = _j.sent(), homeTeam = _a[0], awayTeam = _a[1];
                if (!homeTeam || !awayTeam)
                    return [2 /*return*/, c.json({ error: "Team not found" }, 404)];
                isLocalDerby = !!homeTeam.village_id && homeTeam.village_id === awayTeam.village_id;
                leagueId = match.league_id;
                return [4 /*yield*/, c.env.DB.prepare("SELECT id FROM teams WHERE league_id = ?").bind(leagueId).all()];
            case 3:
                allTeams = _j.sent();
                tIds = allTeams.results.map(function (t) { return t.id; });
                ph = tIds.map(function () { return "?"; }).join(",");
                return [4 /*yield*/, c.env.DB.prepare("SELECT m.home_team_id, m.away_team_id, m.home_score, m.away_score\n     FROM matches m\n     JOIN season_calendar sc ON sc.id = m.calendar_id\n     WHERE m.status = 'simulated' AND m.league_id = ?\n       AND sc.season_number = (SELECT MAX(season_number) FROM season_calendar WHERE league_id = ?)").bind(leagueId, leagueId).all().catch(function (e) { logger_1.logger.warn({ module: "matches" }, "fetch league matches for preview", e); return { results: [] }; })];
            case 4:
                leagueMatches = _j.sent();
                stats = {};
                for (_i = 0, tIds_1 = tIds; _i < tIds_1.length; _i++) {
                    tid = tIds_1[_i];
                    stats[tid] = { w: 0, d: 0, l: 0, gf: 0, ga: 0, form: [] };
                }
                for (_b = 0, _c = leagueMatches.results; _b < _c.length; _b++) {
                    m = _c[_b];
                    hid = m.home_team_id, aid = m.away_team_id;
                    hs = m.home_score, as_ = m.away_score;
                    if (!stats[hid] || !stats[aid])
                        continue;
                    stats[hid].gf += hs;
                    stats[hid].ga += as_;
                    stats[aid].gf += as_;
                    stats[aid].ga += hs;
                    if (hs > as_) {
                        stats[hid].w++;
                        stats[hid].form.push("W");
                        stats[aid].l++;
                        stats[aid].form.push("L");
                    }
                    else if (hs < as_) {
                        stats[aid].w++;
                        stats[aid].form.push("W");
                        stats[hid].l++;
                        stats[hid].form.push("L");
                    }
                    else {
                        stats[hid].d++;
                        stats[hid].form.push("D");
                        stats[aid].d++;
                        stats[aid].form.push("D");
                    }
                }
                sorted = tIds.map(function (tid) {
                    var s = stats[tid];
                    var pts = s.w * 3 + s.d;
                    return { id: tid, pts: pts, gd: s.gf - s.ga, gf: s.gf, played: s.w + s.d + s.l, form: s.form.slice(-5).reverse() };
                }).sort(function (a, b) { return b.pts - a.pts || b.gd - a.gd || b.gf - a.gf; });
                posMap = new Map(sorted.map(function (t, i) { return [t.id, i + 1]; }));
                return [4 /*yield*/, Promise.all([
                        c.env.DB.prepare("SELECT id, first_name, last_name, age, position, overall_rating, physical FROM players WHERE team_id = ? AND (status IS NULL OR status != 'released') ORDER BY CASE position WHEN 'GK' THEN 0 WHEN 'DEF' THEN 1 WHEN 'MID' THEN 2 WHEN 'FWD' THEN 3 END, overall_rating DESC")
                            .bind(homeId).all(),
                        c.env.DB.prepare("SELECT id, first_name, last_name, age, position, overall_rating, physical FROM players WHERE team_id = ? AND (status IS NULL OR status != 'released') ORDER BY CASE position WHEN 'GK' THEN 0 WHEN 'DEF' THEN 1 WHEN 'MID' THEN 2 WHEN 'FWD' THEN 3 END, overall_rating DESC")
                            .bind(awayId).all(),
                        c.env.DB.prepare("SELECT name, avatar FROM managers WHERE team_id = ? LIMIT 1")
                            .bind(homeId).first().catch(function (e) { logger_1.logger.warn({ module: "matches" }, "fetch home manager", e); return null; }),
                        c.env.DB.prepare("SELECT name, avatar FROM managers WHERE team_id = ? LIMIT 1")
                            .bind(awayId).first().catch(function (e) { logger_1.logger.warn({ module: "matches" }, "fetch away manager", e); return null; }),
                    ])];
            case 5:
                _d = _j.sent(), homePlayers = _d[0], awayPlayers = _d[1], homeManager = _d[2], awayManager = _d[3];
                mapTeam = function (team, players, manager) {
                    var _a;
                    var tid = team.id;
                    var s = stats[tid] || { w: 0, d: 0, l: 0, gf: 0, ga: 0, form: [] };
                    return {
                        id: tid,
                        name: team.name,
                        primaryColor: team.primary_color || "#2D5F2D",
                        secondaryColor: team.secondary_color || "#FFFFFF",
                        badgePattern: team.badge_pattern || "shield",
                        isAi: team.user_id === "ai",
                        isPlayer: tid === teamId,
                        position: (_a = posMap.get(tid)) !== null && _a !== void 0 ? _a : 0,
                        points: s.w * 3 + s.d,
                        played: s.w + s.d + s.l,
                        wins: s.w, draws: s.d, losses: s.l,
                        goalsFor: s.gf, goalsAgainst: s.ga,
                        form: s.form.slice(-5),
                        trainingType: team.training_type,
                        manager: manager ? { name: manager.name, avatar: JSON.parse(manager.avatar) } : null,
                        squad: players.results.map(function (p) {
                            var phys = typeof p.physical === "string" ? JSON.parse(p.physical) : (p.physical || {});
                            return {
                                id: p.id,
                                name: "".concat(p.first_name, " ").concat(p.last_name),
                                position: p.position,
                                rating: p.overall_rating,
                                age: p.age,
                                height: phys.height,
                                weight: phys.weight,
                                foot: phys.preferredFoot || "right",
                            };
                        }),
                        avgRating: players.results.length > 0
                            ? Math.round(players.results.reduce(function (sum, p) { return sum + p.overall_rating; }, 0) / players.results.length)
                            : 0,
                        squadSize: players.results.length,
                    };
                };
                return [4 /*yield*/, c.env.DB.prepare("SELECT capacity, pitch_condition, pitch_type FROM stadiums WHERE team_id = ?").bind(homeId).first().catch(function (e) { logger_1.logger.warn({ module: "matches" }, "fetch stadium for preview", e); return null; })];
            case 6:
                stadium = _j.sent();
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../season/weather"); })];
            case 7:
                generateForecast = (_j.sent()).generateForecast;
                schedAt = ((_e = match.scheduled_at) !== null && _e !== void 0 ? _e : match.created_at);
                forecast = generateForecast(schedAt, matchId.charCodeAt(0) + matchId.charCodeAt(1));
                return [2 /*return*/, c.json({
                        matchId: matchId,
                        round: match.round,
                        scheduledAt: schedAt,
                        isHome: homeId === teamId,
                        isLocalDerby: isLocalDerby,
                        home: mapTeam(homeTeam, homePlayers, homeManager),
                        away: mapTeam(awayTeam, awayPlayers, awayManager),
                        venue: {
                            name: homeTeam.stadium_name || "H\u0159i\u0161t\u011B ".concat(homeTeam.name),
                            capacity: (_f = stadium === null || stadium === void 0 ? void 0 : stadium.capacity) !== null && _f !== void 0 ? _f : 0,
                            pitchCondition: (_g = stadium === null || stadium === void 0 ? void 0 : stadium.pitch_condition) !== null && _g !== void 0 ? _g : 50,
                            pitchType: (_h = stadium === null || stadium === void 0 ? void 0 : stadium.pitch_type) !== null && _h !== void 0 ? _h : "natural",
                        },
                        weather: {
                            icon: forecast.icon,
                            expected: forecast.expected,
                            temperature: forecast.temperature,
                            description: forecast.description,
                        },
                    })];
        }
    });
}); });
// GET /api/teams/:teamId/schedule — rozpis zápasů (odehrané + nadcházející)
matchesRouter.get("/teams/:teamId/schedule", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, team, mapVillageSize, teamCategory, teamPromotionPrice, league, result, defaultLineup, hasAnyDefaultLineup, defaultPresetSlot, matches;
    var _a, _b, _c;
    return __generator(this, function (_d) {
        switch (_d.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, c.env.DB.prepare("SELECT t.name, t.league_id, v.size as village_size FROM teams t LEFT JOIN villages v ON v.id = t.village_id WHERE t.id = ?").bind(teamId).first()];
            case 1:
                team = _d.sent();
                if (!team)
                    return [2 /*return*/, c.json({ error: "Team not found" }, 404)];
                if (!team.league_id)
                    return [2 /*return*/, c.json({ matches: [], leagueName: "" })];
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../season/finance-processor"); })];
            case 2:
                mapVillageSize = (_d.sent()).mapVillageSize;
                teamCategory = mapVillageSize((_a = team.village_size) !== null && _a !== void 0 ? _a : "village");
                teamPromotionPrice = promoCost(teamCategory);
                return [4 /*yield*/, c.env.DB.prepare("SELECT l.name, s.number as season_number FROM leagues l JOIN seasons s ON l.season_id = s.id WHERE l.id = ?").bind(team.league_id).first().catch(function (e) { logger_1.logger.warn({ module: "matches" }, "fetch league for schedule", e); return null; })];
            case 3:
                league = _d.sent();
                return [4 /*yield*/, c.env.DB.prepare("SELECT m.*,\n       ht.name as home_name, ht.primary_color as home_color, ht.secondary_color as home_secondary, ht.badge_pattern as home_badge, ht.user_id as home_user_id, ht.village_id as home_village_id,\n       at.name as away_name, at.primary_color as away_color, at.secondary_color as away_secondary, at.badge_pattern as away_badge, at.user_id as away_user_id, at.village_id as away_village_id,\n       sc.scheduled_at, sc.game_week,\n       l.preset_slot, l.is_auto as lineup_is_auto\n     FROM matches m\n     JOIN teams ht ON m.home_team_id = ht.id\n     JOIN teams at ON m.away_team_id = at.id\n     LEFT JOIN season_calendar sc ON m.calendar_id = sc.id\n     LEFT JOIN lineups l ON l.team_id = ? AND l.calendar_id = COALESCE(m.calendar_id, m.id)\n     WHERE (m.home_team_id = ? OR m.away_team_id = ?)\n       AND sc.season_number = (SELECT MAX(sc2.season_number) FROM season_calendar sc2 WHERE sc2.league_id = m.league_id)\n     ORDER BY COALESCE(sc.scheduled_at, m.created_at) ASC").bind(teamId, teamId, teamId).all().catch(function (e) { logger_1.logger.warn({ module: "matches" }, "fetch team schedule", e); return { results: [] }; })];
            case 4:
                result = _d.sent();
                return [4 /*yield*/, c.env.DB.prepare("SELECT preset_slot, formation, tactic FROM lineups WHERE team_id = ? AND is_auto = 0 ORDER BY submitted_at DESC, id ASC LIMIT 1").bind(teamId).first()
                        .catch(function (e) { logger_1.logger.warn({ module: "matches" }, "fetch default lineup for schedule", e); return null; })];
            case 5:
                defaultLineup = _d.sent();
                hasAnyDefaultLineup = !!defaultLineup;
                defaultPresetSlot = (_b = defaultLineup === null || defaultLineup === void 0 ? void 0 : defaultLineup.preset_slot) !== null && _b !== void 0 ? _b : null;
                matches = result.results.map(function (row) {
                    var _a, _b, _c;
                    return ({
                        id: row.id,
                        calendarId: row.calendar_id,
                        round: row.round,
                        status: row.status,
                        homeTeamId: row.home_team_id,
                        homeName: row.home_name,
                        homeColor: row.home_color || "#2D5F2D",
                        homeSecondary: row.home_secondary || "#FFFFFF",
                        homeBadge: row.home_badge || "shield",
                        homeScore: row.home_score,
                        awayTeamId: row.away_team_id,
                        awayName: row.away_name,
                        awayColor: row.away_color || "#2D5F2D",
                        awaySecondary: row.away_secondary || "#FFFFFF",
                        awayBadge: row.away_badge || "shield",
                        awayScore: row.away_score,
                        scheduledAt: row.scheduled_at || row.simulated_at || row.created_at,
                        gameWeek: row.game_week,
                        isFriendly: row.calendar_id === null,
                        isHome: row.home_team_id === teamId,
                        simulatedAt: row.simulated_at,
                        promoted: row.promoted === 1,
                        promotionCost: (_a = row.promotion_cost) !== null && _a !== void 0 ? _a : null,
                        promotionBoost: (_b = row.promotion_boost) !== null && _b !== void 0 ? _b : 1.0,
                        presetSlot: (_c = row.preset_slot) !== null && _c !== void 0 ? _c : null,
                        hasLineup: row.lineup_is_auto !== null && row.lineup_is_auto === 0, // explicit per-calendar
                        isDefaultLineup: (row.lineup_is_auto === null || row.lineup_is_auto !== 0) && hasAnyDefaultLineup, // má fallback default
                        defaultPresetSlot: defaultPresetSlot, // jaký preset slot má poslední uložená sestava (pro indikaci u "(výchozí)")
                        isLocalDerby: !!row.home_village_id && row.home_village_id === row.away_village_id,
                    });
                });
                return [2 /*return*/, c.json({
                        leagueName: (_c = league === null || league === void 0 ? void 0 : league.name) !== null && _c !== void 0 ? _c : "Liga",
                        season: (0, season_1.mustSeason)(league === null || league === void 0 ? void 0 : league.season_number),
                        matches: matches,
                        promotionPrice: teamPromotionPrice,
                    })];
        }
    });
}); });
// POST /api/teams/:teamId/matches/:matchId/promote — zaplatit propagaci nadcházejícího domácího zápasu
var PROMO_BOOST = 1.25;
var PROMO_HEADLINES = [
    "{team} láká na zápas s {opp}!",
    "{team} pálí do propagace zápasu s {opp}",
    "Přijď na {team} vs {opp} — propagace běží",
    "Plakáty, rozhlas a tlampače: {team} zve na derby s {opp}",
    "{team}: „Na {opp} přijďte všichni!“",
];
var PROMO_BODIES = [
    "V {village} se rozjela propagační kampaň — fotbalisté {team} slibují parádní zápas proti {opp}. Vedení klubu nešetří na plakátech ani na hlášeních v obecním rozhlase. „Stánek s pivem bude připraven, grill roztopen a tribuna vyčištěna,“ hlásí pořadatelé.",
    "Klub {team} tentokrát sází na reklamu. Před zápasem s {opp} se v {village} objevily plakáty na každé druhé zastávce a místní trafika hlásí, že se o zápase mluví víc než obvykle. Očekává se vyprodaný stadion.",
    "„Takový zápas si nenecháme ujít,“ píše se na plakátech {team}. V {village} se připravuje na soupeření s {opp} a vedení klubu posílá pozvánku všem, kdo mají rádi dobrý fotbal. Kdo přijde, dostane atmosféru.",
    "V {village} je rušno: {team} vyrukoval s propagační kampaní před zápasem s {opp}. Starosta prý přislíbil účast i s rodinou, místní restaurace nabízí akci na pivo a fanoušci se těší na plný stadion.",
    "Před zápasem {team} vs {opp} proudí do {village} nezvyklé množství propagace. Reklamy visí u hřiště, na zastávkách i v hospodách. Očekává se znatelně vyšší návštěva než obvykle.",
];
function promoCost(category) {
    return category === "vesnice" ? 500
        : category === "obec" ? 1000
            : category === "mestys" ? 1500
                : 2500;
}
function pickOne(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}
matchesRouter.post("/teams/:teamId/matches/:matchId/promote", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, matchId, match, status, mapVillageSize, category, cost, team, gameDate, homeName, awayName, villageName, leagueId, recordTransaction, generatePromotionalArticle, ai, headline, body, newBudget;
    var _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                teamId = c.req.param("teamId");
                matchId = c.req.param("matchId");
                return [4 /*yield*/, c.env.DB.prepare("SELECT m.*, ht.name as home_name, at.name as away_name, ht.league_id as league_id,\n            v.name as village_name, v.size as village_size, ht.game_date as game_date\n     FROM matches m\n     JOIN teams ht ON m.home_team_id = ht.id\n     JOIN teams at ON m.away_team_id = at.id\n     JOIN villages v ON ht.village_id = v.id\n     WHERE m.id = ? AND m.home_team_id = ?").bind(matchId, teamId).first().catch(function (e) {
                        logger_1.logger.warn({ module: "matches" }, "load match for promote", e);
                        return null;
                    })];
            case 1:
                match = _c.sent();
                if (!match) {
                    return [2 /*return*/, c.json({ error: "Zápas nenalezen nebo nejsi domácí tým" }, 404)];
                }
                status = match.status;
                if (status !== "scheduled" && status !== "lineups_open") {
                    return [2 /*return*/, c.json({ error: "Propagovat lze jen nadcházející zápas" }, 409)];
                }
                if (match.promoted === 1) {
                    return [2 /*return*/, c.json({ error: "Tento zápas je už propagovaný" }, 409)];
                }
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../season/finance-processor"); })];
            case 2:
                mapVillageSize = (_c.sent()).mapVillageSize;
                category = mapVillageSize((_a = match.village_size) !== null && _a !== void 0 ? _a : "village");
                cost = promoCost(category);
                return [4 /*yield*/, c.env.DB.prepare("SELECT budget FROM teams WHERE id = ?")
                        .bind(teamId).first()];
            case 3:
                team = _c.sent();
                if (!team || team.budget < cost) {
                    return [2 /*return*/, c.json({ error: "Nedostatek prost\u0159edk\u016F (".concat(cost, " K\u010D)") }, 400)];
                }
                gameDate = (_b = match.game_date) !== null && _b !== void 0 ? _b : new Date().toISOString();
                homeName = match.home_name;
                awayName = match.away_name;
                villageName = match.village_name;
                leagueId = match.league_id;
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../season/finance-processor"); })];
            case 4:
                recordTransaction = (_c.sent()).recordTransaction;
                return [4 /*yield*/, recordTransaction(c.env.DB, teamId, "promotional_campaign", -cost, "Propagace z\u00E1pasu vs ".concat(awayName), gameDate, matchId)];
            case 5:
                _c.sent();
                // 2. Označit zápas
                return [4 /*yield*/, c.env.DB.prepare("UPDATE matches SET promoted = 1, promotion_cost = ?, promotion_boost = ? WHERE id = ?").bind(cost, PROMO_BOOST, matchId).run()];
            case 6:
                // 2. Označit zápas
                _c.sent();
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../news/promo-generator"); })];
            case 7:
                generatePromotionalArticle = (_c.sent()).generatePromotionalArticle;
                return [4 /*yield*/, generatePromotionalArticle(c.env.DB, c.env.GEMINI_API_KEY, matchId, teamId).catch(function (e) {
                        logger_1.logger.warn({ module: "matches" }, "ai promo generation failed", e);
                        return null;
                    })];
            case 8:
                ai = _c.sent();
                if (ai) {
                    headline = ai.headline;
                    body = ai.body;
                }
                else {
                    headline = pickOne(PROMO_HEADLINES)
                        .replace("{team}", homeName)
                        .replace("{opp}", awayName);
                    body = pickOne(PROMO_BODIES)
                        .replace(/\{team\}/g, homeName)
                        .replace(/\{opp\}/g, awayName)
                        .replace(/\{village\}/g, villageName);
                }
                return [4 /*yield*/, c.env.DB.prepare("INSERT INTO news (id, league_id, team_id, type, headline, body, match_id, created_at) VALUES (?, ?, ?, 'promotion', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))").bind(uuid(), leagueId, teamId, headline, body, matchId).run().catch(function (e) {
                        logger_1.logger.warn({ module: "matches" }, "insert promo news", e);
                    })];
            case 9:
                _c.sent();
                newBudget = team.budget - cost;
                return [2 /*return*/, c.json({ ok: true, cost: cost, newBudget: newBudget, promotionBoost: PROMO_BOOST })];
        }
    });
}); });
// GET /api/teams/:teamId/league-schedule — full league schedule by rounds
// Optional query param ?leagueId=... override (např. pro U21 ligu).
matchesRouter.get("/teams/:teamId/league-schedule", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, overrideLeagueId, leagueId, team, league, result, roundsMap, _i, _a, row, round, rounds;
    var _b, _c, _d, _e;
    return __generator(this, function (_f) {
        switch (_f.label) {
            case 0:
                teamId = c.req.param("teamId");
                overrideLeagueId = c.req.query("leagueId");
                leagueId = overrideLeagueId !== null && overrideLeagueId !== void 0 ? overrideLeagueId : null;
                if (!!leagueId) return [3 /*break*/, 2];
                return [4 /*yield*/, c.env.DB.prepare("SELECT league_id FROM teams WHERE id = ?").bind(teamId).first()];
            case 1:
                team = _f.sent();
                leagueId = (_b = team === null || team === void 0 ? void 0 : team.league_id) !== null && _b !== void 0 ? _b : null;
                _f.label = 2;
            case 2:
                if (!leagueId)
                    return [2 /*return*/, c.json({ rounds: [], leagueName: "" })];
                return [4 /*yield*/, c.env.DB.prepare("SELECT l.name, s.number as season_number FROM leagues l JOIN seasons s ON l.season_id = s.id WHERE l.id = ?").bind(leagueId).first().catch(function (e) { logger_1.logger.warn({ module: "matches" }, "fetch league for league-schedule", e); return null; })];
            case 3:
                league = _f.sent();
                return [4 /*yield*/, c.env.DB.prepare("SELECT m.id, m.round, m.status, m.home_score, m.away_score,\n       m.home_team_id, m.away_team_id,\n       ht.name as home_name, ht.primary_color as home_color, ht.secondary_color as home_secondary, ht.badge_pattern as home_badge, ht.user_id as home_user_id,\n       at.name as away_name, at.primary_color as away_color, at.secondary_color as away_secondary, at.badge_pattern as away_badge, at.user_id as away_user_id,\n       sc.scheduled_at, sc.game_week\n     FROM matches m\n     JOIN teams ht ON m.home_team_id = ht.id\n     JOIN teams at ON m.away_team_id = at.id\n     JOIN season_calendar sc ON m.calendar_id = sc.id\n     WHERE m.league_id = ?\n       AND sc.season_number = (SELECT MAX(season_number) FROM season_calendar WHERE league_id = ?)\n     ORDER BY COALESCE(m.round, sc.game_week, 999), ht.name").bind(leagueId, leagueId).all().catch(function (e) { logger_1.logger.warn({ module: "matches" }, "fetch league schedule matches", e); return { results: [] }; })];
            case 4:
                result = _f.sent();
                roundsMap = new Map();
                for (_i = 0, _a = result.results; _i < _a.length; _i++) {
                    row = _a[_i];
                    round = (_d = (_c = row.round) !== null && _c !== void 0 ? _c : row.game_week) !== null && _d !== void 0 ? _d : 0;
                    if (!roundsMap.has(round))
                        roundsMap.set(round, []);
                    roundsMap.get(round).push(row);
                }
                rounds = Array.from(roundsMap.entries())
                    .sort(function (_a, _b) {
                    var a = _a[0];
                    var b = _b[0];
                    return a - b;
                })
                    .map(function (_a) {
                    var _b;
                    var round = _a[0], matches = _a[1];
                    return ({
                        round: round,
                        scheduledAt: (_b = matches[0]) === null || _b === void 0 ? void 0 : _b.scheduled_at,
                        matches: matches.map(function (row) { return ({
                            id: row.id,
                            status: row.status,
                            homeTeamId: row.home_team_id,
                            homeName: row.home_name,
                            homeColor: row.home_color || "#2D5F2D",
                            homeSecondary: row.home_secondary || "#FFFFFF",
                            homeBadge: row.home_badge || "shield",
                            homeIsAi: row.home_user_id === "ai",
                            homeScore: row.home_score,
                            awayTeamId: row.away_team_id,
                            awayName: row.away_name,
                            awayColor: row.away_color || "#2D5F2D",
                            awaySecondary: row.away_secondary || "#FFFFFF",
                            awayBadge: row.away_badge || "shield",
                            awayIsAi: row.away_user_id === "ai",
                            awayScore: row.away_score,
                        }); }),
                    });
                });
                return [2 /*return*/, c.json({
                        leagueName: (_e = league === null || league === void 0 ? void 0 : league.name) !== null && _e !== void 0 ? _e : "Liga",
                        season: (0, season_1.mustSeason)(league === null || league === void 0 ? void 0 : league.season_number),
                        rounds: rounds,
                    })];
        }
    });
}); });
// GET /api/matches/:id — detail zápasu
matchesRouter.get("/matches/:id", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var row, isLocalDerby, homeLineup, awayLineup, collectIds, allIds, placeholders, players, byId_1, merge, e_1;
    var _a;
    var _b, _c, _d, _e, _f, _g;
    return __generator(this, function (_h) {
        switch (_h.label) {
            case 0: return [4 /*yield*/, c.env.DB.prepare("SELECT m.*,\n       ht.name as home_name, ht.primary_color as home_color, ht.badge_pattern as home_badge, ht.secondary_color as home_secondary, ht.village_id as home_village_id,\n       at.name as away_name, at.primary_color as away_color, at.badge_pattern as away_badge, at.secondary_color as away_secondary, at.village_id as away_village_id\n     FROM matches m\n     LEFT JOIN teams ht ON m.home_team_id = ht.id\n     LEFT JOIN teams at ON m.away_team_id = at.id\n     WHERE m.id = ?").bind(c.req.param("id")).first()];
            case 1:
                row = _h.sent();
                if (!row)
                    return [2 /*return*/, c.json({ error: "Match not found" }, 404)];
                isLocalDerby = !!row.home_village_id && row.home_village_id === row.away_village_id;
                homeLineup = JSON.parse((_b = row.home_lineup_data) !== null && _b !== void 0 ? _b : "null");
                awayLineup = JSON.parse((_c = row.away_lineup_data) !== null && _c !== void 0 ? _c : "null");
                collectIds = function (ld) {
                    return ld ? __spreadArray(__spreadArray([], ld.starters, true), ld.subs, true).map(function (p) { return p.id; }).filter(Boolean) : [];
                };
                allIds = __spreadArray(__spreadArray([], collectIds(homeLineup), true), collectIds(awayLineup), true);
                if (!(allIds.length > 0)) return [3 /*break*/, 5];
                _h.label = 2;
            case 2:
                _h.trys.push([2, 4, , 5]);
                placeholders = allIds.map(function () { return "?"; }).join(",");
                return [4 /*yield*/, (_a = c.env.DB.prepare("SELECT id, squad_number FROM players WHERE id IN (".concat(placeholders, ")"))).bind.apply(_a, allIds).all()];
            case 3:
                players = _h.sent();
                byId_1 = new Map(players.results.map(function (p) { return [p.id, p.squad_number]; }));
                merge = function (ld) {
                    if (!ld)
                        return;
                    for (var _i = 0, _a = [ld.starters, ld.subs]; _i < _a.length; _i++) {
                        var list = _a[_i];
                        for (var _b = 0, list_1 = list; _b < list_1.length; _b++) {
                            var p = list_1[_b];
                            var num = byId_1.get(p.id);
                            if (num != null)
                                p.squadNumber = num;
                        }
                    }
                };
                merge(homeLineup);
                merge(awayLineup);
                return [3 /*break*/, 5];
            case 4:
                e_1 = _h.sent();
                logger_1.logger.warn({ module: "matches" }, "merge squad numbers", e_1);
                return [3 /*break*/, 5];
            case 5: return [2 /*return*/, c.json(__assign(__assign({}, row), { events: JSON.parse((_d = row.events) !== null && _d !== void 0 ? _d : "[]"), commentary: JSON.parse((_e = row.commentary) !== null && _e !== void 0 ? _e : "[]"), player_ratings: JSON.parse((_f = row.player_ratings) !== null && _f !== void 0 ? _f : "{}"), home_lineup_data: homeLineup, away_lineup_data: awayLineup, absences: JSON.parse((_g = row.absences) !== null && _g !== void 0 ? _g : "[]"), isLocalDerby: isLocalDerby }))];
        }
    });
}); });
// GET /api/teams/:teamId/match-summary/:matchId — "co rozhodlo" breakdown po zápase
// JIT compute: vezme uložená data zápasu, vrátí top 3 faktory + per-line strength.
matchesRouter.get("/teams/:teamId/match-summary/:matchId", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, matchId, row, isOwnHome, buildMatchSummary, summary, e_2;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                teamId = c.req.param("teamId");
                matchId = c.req.param("matchId");
                return [4 /*yield*/, c.env.DB.prepare("SELECT home_team_id, away_team_id, home_score, away_score, home_lineup_data, away_lineup_data, player_ratings, events, status FROM matches WHERE id = ?").bind(matchId).first()];
            case 1:
                row = _a.sent();
                if (!row)
                    return [2 /*return*/, c.json({ error: "match_not_found" }, 404)];
                if (row.status !== "simulated")
                    return [2 /*return*/, c.json({ error: "match_not_simulated" }, 400)];
                isOwnHome = row.home_team_id === teamId;
                if (!isOwnHome && row.away_team_id !== teamId) {
                    return [2 /*return*/, c.json({ error: "team_not_in_match" }, 403)];
                }
                _a.label = 2;
            case 2:
                _a.trys.push([2, 4, , 5]);
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../multiplayer/match-summary"); })];
            case 3:
                buildMatchSummary = (_a.sent()).buildMatchSummary;
                summary = buildMatchSummary({
                    homeLineupData: row.home_lineup_data ? JSON.parse(row.home_lineup_data) : null,
                    awayLineupData: row.away_lineup_data ? JSON.parse(row.away_lineup_data) : null,
                    playerRatings: row.player_ratings ? JSON.parse(row.player_ratings) : {},
                    events: row.events ? JSON.parse(row.events) : [],
                    homeScore: row.home_score,
                    awayScore: row.away_score,
                    isOwnHome: isOwnHome,
                });
                if (!summary)
                    return [2 /*return*/, c.json({ error: "missing_lineup_data" }, 400)];
                return [2 /*return*/, c.json(summary)];
            case 4:
                e_2 = _a.sent();
                logger_1.logger.warn({ module: "matches" }, "build match summary", e_2);
                return [2 /*return*/, c.json({ error: "summary_failed" }, 500)];
            case 5: return [2 /*return*/];
        }
    });
}); });
// GET /api/teams/:teamId/unseen-match — najde nejstarší nepřečtený zápas
matchesRouter.get("/teams/:teamId/unseen-match", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, row, isHome;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, c.env.DB.prepare("SELECT m.id, m.round, m.home_team_id, m.away_team_id,\n     t1.name as home_name, t2.name as away_name\n     FROM matches m\n     JOIN teams t1 ON m.home_team_id = t1.id\n     JOIN teams t2 ON m.away_team_id = t2.id\n     WHERE m.status = 'simulated' AND m.events IS NOT NULL AND LENGTH(m.events) > 10\n     AND ((m.home_team_id = ? AND m.home_seen_at IS NULL)\n       OR (m.away_team_id = ? AND m.away_seen_at IS NULL))\n     ORDER BY m.simulated_at ASC LIMIT 1").bind(teamId, teamId).first()];
            case 1:
                row = _a.sent();
                if (!row)
                    return [2 /*return*/, c.json(null)];
                isHome = row.home_team_id === teamId;
                return [2 /*return*/, c.json({
                        matchId: row.id,
                        opponent: isHome ? row.away_name : row.home_name,
                        round: row.round,
                        isHome: isHome,
                    })];
        }
    });
}); });
// POST /api/matches/:id/mark-seen — označí zápas jako přečtený
matchesRouter.post("/matches/:id/mark-seen", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var token, session, matchId, body, ownTeam, match, col;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                token = (0, session_1.getTokenFromRequest)(c);
                if (!token)
                    return [2 /*return*/, c.json({ error: "Nepřihlášen" }, 401)];
                return [4 /*yield*/, (0, session_1.getSession)(c.env.SESSION_KV, token)];
            case 1:
                session = _a.sent();
                if (!session)
                    return [2 /*return*/, c.json({ error: "Neplatná session" }, 401)];
                matchId = c.req.param("id");
                return [4 /*yield*/, c.req.json().catch(function (e) { logger_1.logger.warn({ module: "matches" }, "parse mark-seen body", e); return { teamId: "" }; })];
            case 2:
                body = _a.sent();
                return [4 /*yield*/, c.env.DB.prepare("SELECT id FROM teams WHERE id = ? AND user_id = ?")
                        .bind(body.teamId, session.userId).first()];
            case 3:
                ownTeam = _a.sent();
                if (!ownTeam)
                    return [2 /*return*/, c.json({ error: "Přístup odepřen" }, 403)];
                return [4 /*yield*/, c.env.DB.prepare("SELECT home_team_id, away_team_id FROM matches WHERE id = ?")
                        .bind(matchId).first()];
            case 4:
                match = _a.sent();
                if (!match)
                    return [2 /*return*/, c.json({ error: "Match not found" }, 404)];
                col = match.home_team_id === body.teamId ? "home_seen_at" : "away_seen_at";
                return [4 /*yield*/, c.env.DB.prepare("UPDATE matches SET ".concat(col, " = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?")).bind(matchId).run()];
            case 5:
                _a.sent();
                return [2 /*return*/, c.json({ ok: true })];
        }
    });
}); });
// GET /api/teams/:teamId/players/:playerId/match-history — FM-style match history per player
matchesRouter.get("/teams/:teamId/players/:playerId/match-history", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var playerId, result, matches;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                playerId = c.req.param("playerId");
                return [4 /*yield*/, c.env.DB.prepare("SELECT mps.*, m.home_team_id, m.away_team_id, m.home_score, m.away_score,\n       m.simulated_at, m.round, m.weather,\n       ht.name as home_name, ht.primary_color as home_color, ht.secondary_color as home_secondary, ht.badge_pattern as home_badge,\n       at.name as away_name, at.primary_color as away_color, at.secondary_color as away_secondary, at.badge_pattern as away_badge\n     FROM match_player_stats mps\n     JOIN matches m ON mps.match_id = m.id\n     LEFT JOIN teams ht ON m.home_team_id = ht.id\n     LEFT JOIN teams at ON m.away_team_id = at.id\n     WHERE mps.player_id = ?\n     ORDER BY m.simulated_at DESC").bind(playerId).all().catch(function (e) { logger_1.logger.warn({ module: "matches" }, "fetch player match history", e); return { results: [] }; })];
            case 1:
                result = _a.sent();
                matches = result.results.map(function (row) {
                    // isHome z perspektivy KLUBU HRAČE v daném zápase (mps.team_id), ne toho kdo se dívá
                    var isHome = row.home_team_id === row.team_id;
                    var opponentName = isHome ? row.away_name : row.home_name;
                    var opponentColor = isHome ? row.away_color : row.home_color;
                    var opponentSecondary = isHome ? row.away_secondary : row.home_secondary;
                    var opponentBadge = isHome ? row.away_badge : row.home_badge;
                    var opponentId = isHome ? row.away_team_id : row.home_team_id;
                    var myScore = isHome ? row.home_score : row.away_score;
                    var oppScore = isHome ? row.away_score : row.home_score;
                    var resultLabel = myScore > oppScore ? "W"
                        : myScore < oppScore ? "L" : "D";
                    return {
                        matchId: row.match_id,
                        date: row.simulated_at,
                        round: row.round,
                        isHome: isHome,
                        opponent: opponentName,
                        opponentId: opponentId,
                        opponentColor: opponentColor || "#2D5F2D",
                        opponentSecondary: opponentSecondary || "#FFFFFF",
                        opponentBadge: opponentBadge || "shield",
                        homeScore: row.home_score,
                        awayScore: row.away_score,
                        result: resultLabel,
                        position: row.position,
                        started: row.started === 1,
                        minutesPlayed: row.minutes_played,
                        goals: row.goals,
                        assists: row.assists,
                        yellowCards: row.yellow_cards,
                        redCards: row.red_cards,
                        rating: row.rating,
                        weather: row.weather,
                    };
                });
                return [2 /*return*/, c.json({ matches: matches })];
        }
    });
}); });
// GET /api/teams/:teamId/match-results — team match results with aggregated stats
matchesRouter.get("/teams/:teamId/match-results", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, result, scorers, matches, leagueMatches, form, totalW, totalD, totalL, goalsFor, goalsAgainst;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, c.env.DB.prepare("SELECT m.id, m.round, m.home_team_id, m.away_team_id, m.home_score, m.away_score,\n       m.simulated_at, m.weather, m.attendance, m.stadium_name, m.calendar_id,\n       ht.name as home_name, ht.primary_color as home_color, ht.secondary_color as home_secondary, ht.badge_pattern as home_badge,\n       at.name as away_name, at.primary_color as away_color, at.secondary_color as away_secondary, at.badge_pattern as away_badge\n     FROM matches m\n     LEFT JOIN teams ht ON m.home_team_id = ht.id\n     LEFT JOIN teams at ON m.away_team_id = at.id\n     WHERE m.status = 'simulated'\n       AND (m.home_team_id = ? OR m.away_team_id = ?)\n     ORDER BY m.simulated_at DESC").bind(teamId, teamId).all().catch(function (e) { logger_1.logger.warn({ module: "matches" }, "fetch team match results", e); return { results: [] }; })];
            case 1:
                result = _a.sent();
                return [4 /*yield*/, c.env.DB.prepare("SELECT mps.player_id,\n       COALESCE(p.first_name, dp.first_name) as first_name,\n       COALESCE(p.last_name, dp.last_name) as last_name,\n       COALESCE(p.nickname, dp.nickname) as nickname,\n       COALESCE(p.position, dp.position) as position,\n       (p.id IS NULL) as is_departed,\n       SUM(mps.goals) as total_goals, SUM(mps.assists) as total_assists,\n       SUM(mps.yellow_cards) as total_yellows, SUM(mps.red_cards) as total_reds,\n       COUNT(*) as appearances, ROUND(AVG(mps.rating), 1) as avg_rating\n     FROM match_player_stats mps\n     LEFT JOIN players p ON mps.player_id = p.id\n     LEFT JOIN departed_players dp ON mps.player_id = dp.id\n     WHERE mps.team_id = ?\n     GROUP BY mps.player_id\n     ORDER BY total_goals DESC, total_assists DESC\n     LIMIT 10").bind(teamId).all().catch(function (e) { logger_1.logger.warn({ module: "matches" }, "fetch team scorers", e); return { results: [] }; })];
            case 2:
                scorers = _a.sent();
                matches = result.results.map(function (row) {
                    var isHome = row.home_team_id === teamId;
                    var myScore = isHome ? row.home_score : row.away_score;
                    var oppScore = isHome ? row.away_score : row.home_score;
                    var resultLabel = myScore > oppScore ? "W" : myScore < oppScore ? "L" : "D";
                    return {
                        id: row.id,
                        round: row.round,
                        date: row.simulated_at,
                        isHome: isHome,
                        isFriendly: row.calendar_id == null,
                        opponent: isHome ? row.away_name : row.home_name,
                        opponentId: isHome ? row.away_team_id : row.home_team_id,
                        opponentColor: (isHome ? row.away_color : row.home_color) || "#2D5F2D",
                        opponentSecondary: (isHome ? row.away_secondary : row.home_secondary) || "#FFFFFF",
                        opponentBadge: (isHome ? row.away_badge : row.home_badge) || "shield",
                        homeScore: row.home_score,
                        awayScore: row.away_score,
                        result: resultLabel,
                        weather: row.weather,
                        attendance: row.attendance,
                        stadium: row.stadium_name,
                    };
                });
                leagueMatches = matches.filter(function (m) { return !m.isFriendly; });
                form = leagueMatches.slice(0, 5).map(function (m) { return m.result; });
                totalW = leagueMatches.filter(function (m) { return m.result === "W"; }).length;
                totalD = leagueMatches.filter(function (m) { return m.result === "D"; }).length;
                totalL = leagueMatches.filter(function (m) { return m.result === "L"; }).length;
                goalsFor = leagueMatches.reduce(function (s, m) { return s + (m.isHome ? m.homeScore : m.awayScore); }, 0);
                goalsAgainst = leagueMatches.reduce(function (s, m) { return s + (m.isHome ? m.awayScore : m.homeScore); }, 0);
                return [2 /*return*/, c.json({
                        matches: matches,
                        form: form,
                        summary: { played: leagueMatches.length, wins: totalW, draws: totalD, losses: totalL, goalsFor: goalsFor, goalsAgainst: goalsAgainst },
                        topPlayers: scorers.results.map(function (r) {
                            var _a, _b;
                            return ({
                                playerId: r.player_id,
                                name: (r.first_name || r.last_name) ? "".concat((_a = r.first_name) !== null && _a !== void 0 ? _a : "", " ").concat((_b = r.last_name) !== null && _b !== void 0 ? _b : "").trim() : "Bývalý hráč",
                                isDeparted: !!r.is_departed,
                                nickname: r.nickname,
                                position: r.position,
                                goals: r.total_goals,
                                assists: r.total_assists,
                                yellowCards: r.total_yellows,
                                redCards: r.total_reds,
                                appearances: r.appearances,
                                avgRating: r.avg_rating,
                            });
                        }),
                    })];
        }
    });
}); });
// POST /api/admin/backfill-match-stats — jednorázový backfill match_player_stats z existujících zápasů
matchesRouter.post("/admin/backfill-match-stats", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var backfillMatchStats, result;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("../../scripts/backfill-match-stats"); })];
            case 1:
                backfillMatchStats = (_a.sent()).backfillMatchStats;
                return [4 /*yield*/, backfillMatchStats(c.env.DB)];
            case 2:
                result = _a.sent();
                return [2 /*return*/, c.json(result)];
        }
    });
}); });
// POST /api/admin/backfill-assists — dopočítá assists v existujících match_player_stats
matchesRouter.post("/admin/backfill-assists", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var backfillAssists, result;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("../../scripts/backfill-assists"); })];
            case 1:
                backfillAssists = (_a.sent()).backfillAssists;
                return [4 /*yield*/, backfillAssists(c.env.DB)];
            case 2:
                result = _a.sent();
                return [2 /*return*/, c.json(result)];
        }
    });
}); });
// ── Friendly match challenges (PvP only) ──
function sendSMS(db, teamId, senderName, roleTitle, body) {
    return __awaiter(this, void 0, void 0, function () {
        var convId;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db.prepare("SELECT id FROM conversations WHERE team_id = ? AND type = 'system' AND title = ?")
                        .bind(teamId, roleTitle).first().then(function (r) { return r === null || r === void 0 ? void 0 : r.id; })
                        .catch(function (e) { logger_1.logger.warn({ module: "matches" }, "sendSMS find conversation", e); return null; })];
                case 1:
                    convId = _a.sent();
                    if (!!convId) return [3 /*break*/, 3];
                    convId = uuid();
                    return [4 /*yield*/, db.prepare("INSERT INTO conversations (id, team_id, type, title, pinned, unread_count, last_message_text, last_message_at, created_at) VALUES (?, ?, 'system', ?, 0, 0, '', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))")
                            .bind(convId, teamId, roleTitle).run()
                            .catch(function (e) { return logger_1.logger.warn({ module: "matches" }, "sendSMS insert conversation", e); })];
                case 2:
                    _a.sent();
                    _a.label = 3;
                case 3: return [4 /*yield*/, db.prepare("INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, sent_at) VALUES (?, ?, 'system', ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))")
                        .bind(uuid(), convId, senderName, body).run()
                        .catch(function (e) { return logger_1.logger.warn({ module: "matches" }, "sendSMS insert message", e); })];
                case 4:
                    _a.sent();
                    return [4 /*yield*/, db.prepare("UPDATE conversations SET unread_count = unread_count + 1, last_message_text = ?, last_message_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?")
                            .bind(body.slice(0, 100), convId).run()
                            .catch(function (e) { return logger_1.logger.warn({ module: "matches" }, "sendSMS update conversation", e); })];
                case 5:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
// POST /api/teams/:teamId/challenge/:opponentTeamId — poslat výzvu na přátelák
matchesRouter.post("/teams/:teamId/challenge/:opponentTeamId", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, opponentTeamId, body, opponent, team, lastChallenge, daysDiff, existing, gameDateStr, gameDateDay, seasonStart, friendlyRes, challengeId, expiresAt, createNotification, pushEnv, e_3;
    var _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                teamId = c.req.param("teamId");
                opponentTeamId = c.req.param("opponentTeamId");
                return [4 /*yield*/, c.req.json().catch(function () { return ({}); })];
            case 1:
                body = _c.sent();
                if (teamId === opponentTeamId)
                    return [2 /*return*/, c.json({ error: "Nemůžeš vyzvat sám sebe" }, 400)];
                return [4 /*yield*/, c.env.DB.prepare("SELECT id, name, user_id, team_type FROM teams WHERE id = ?")
                        .bind(opponentTeamId).first()];
            case 2:
                opponent = _c.sent();
                if (!opponent || opponent.user_id === "ai" || opponent.team_type === "u21")
                    return [2 /*return*/, c.json({ error: "Přáteláky lze hrát pouze proti hráčským týmům" }, 400)];
                return [4 /*yield*/, c.env.DB.prepare("SELECT name, budget, game_date, season_start FROM teams WHERE id = ?")
                        .bind(teamId).first()];
            case 3:
                team = _c.sent();
                if (!team)
                    return [2 /*return*/, c.json({ error: "Team not found" }, 404)];
                if (team.budget < 1000)
                    return [2 /*return*/, c.json({ error: "Nedostatek peněz (min 1 000 Kč)" }, 400)];
                return [4 /*yield*/, c.env.DB.prepare("SELECT created_at FROM challenges WHERE (challenger_team_id = ? OR challenged_team_id = ?) AND status IN ('accepted','played') ORDER BY created_at DESC LIMIT 1").bind(teamId, teamId).first()
                        .catch(function (e) { logger_1.logger.warn({ module: "matches" }, "fetch last challenge cooldown", e); return null; })];
            case 4:
                lastChallenge = _c.sent();
                if (lastChallenge) {
                    daysDiff = (new Date(team.game_date).getTime() - new Date(lastChallenge.created_at).getTime()) / (1000 * 60 * 60 * 24);
                    // Záporný rozdíl = výzva z časového prostoru staré sezóny (před resetem game_clock) — cooldown neaplikovat
                    if (daysDiff >= 0 && daysDiff < 3)
                        return [2 /*return*/, c.json({ error: "Přátelák je možný jednou za 3 dny", cooldown: true }, 400)];
                }
                return [4 /*yield*/, c.env.DB.prepare("SELECT id FROM challenges WHERE challenger_team_id = ? AND challenged_team_id = ? AND status = 'pending'").bind(teamId, opponentTeamId).first()
                        .catch(function (e) { logger_1.logger.warn({ module: "matches" }, "fetch existing pending challenge", e); return null; })];
            case 5:
                existing = _c.sent();
                if (existing)
                    return [2 /*return*/, c.json({ error: "Výzva už byla odeslána" }, 400)];
                gameDateStr = team.game_date;
                gameDateDay = gameDateStr ? gameDateStr.split("T")[0] : null;
                if (!gameDateDay) return [3 /*break*/, 7];
                seasonStart = (_a = team.season_start) !== null && _a !== void 0 ? _a : "1970-01-01";
                return [4 /*yield*/, c.env.DB.prepare("SELECT id FROM matches WHERE calendar_id IS NULL AND status IN ('lineups_open','simulated')\n       AND (home_team_id = ? OR away_team_id = ? OR home_team_id = ? OR away_team_id = ?)\n       AND created_at LIKE ? AND created_at >= ? LIMIT 1").bind(teamId, teamId, opponentTeamId, opponentTeamId, "".concat(gameDateDay, "%"), seasonStart).all()];
            case 6:
                friendlyRes = _c.sent();
                if (friendlyRes.results.length > 0)
                    return [2 /*return*/, c.json({ error: "Jeden z týmů už dnes hrál nebo má naplánovaný přátelák" }, 400)];
                _c.label = 7;
            case 7:
                challengeId = uuid();
                expiresAt = new Date(team.game_date);
                expiresAt.setDate(expiresAt.getDate() + 7);
                return [4 /*yield*/, c.env.DB.prepare("INSERT INTO challenges (id, challenger_team_id, challenged_team_id, status, message, created_at, expires_at) VALUES (?, ?, ?, 'pending', ?, ?, ?)").bind(challengeId, teamId, opponentTeamId, (_b = body.message) !== null && _b !== void 0 ? _b : null, team.game_date, expiresAt.toISOString()).run()];
            case 8:
                _c.sent();
                // SMS to opponent
                return [4 /*yield*/, sendSMS(c.env.DB, opponentTeamId, "Sportovní ředitel", "Sportovní ředitel", "\u26BD V\u00FDzva na p\u0159\u00E1telsk\u00FD z\u00E1pas od ".concat(team.name, "!").concat(body.message ? " Vzkaz: \"".concat(body.message, "\"") : "", " Pod\u00EDvej se do P\u0159\u00E1tel\u00E1k\u016F."))];
            case 9:
                // SMS to opponent
                _c.sent();
                _c.label = 10;
            case 10:
                _c.trys.push([10, 13, , 14]);
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../community/notifications"); })];
            case 11:
                createNotification = (_c.sent()).createNotification;
                pushEnv = { VAPID_PUBLIC_KEY: c.env.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: c.env.VAPID_PRIVATE_KEY, VAPID_SUBJECT: c.env.VAPID_SUBJECT, DB: c.env.DB };
                return [4 /*yield*/, createNotification(c.env.DB, opponentTeamId, "challenge", "\u26BD V\u00FDzva od ".concat(team.name, "!"), "Chcete hrát přátelský zápas? Odpověz v Přáteláky.", "/dashboard/friendly", pushEnv)];
            case 12:
                _c.sent();
                return [3 /*break*/, 14];
            case 13:
                e_3 = _c.sent();
                logger_1.logger.warn({ module: "matches" }, "challenge create notification", e_3);
                return [3 /*break*/, 14];
            case 14: return [2 /*return*/, c.json({ ok: true, challengeId: challengeId })];
        }
    });
}); });
// POST /api/teams/:teamId/challenge/:challengeId/accept — přijmout výzvu
matchesRouter.post("/teams/:teamId/challenge/:challengeId/accept", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, challengeId, challenge, team, challengerTeamId, challenger, gameDateDay, seasonStart, _a, leagueRes, friendlyRes, matchDate, matchId, claimed, recordTransaction, createNotification, pushEnv, e_4;
    var _b, _c, _d;
    return __generator(this, function (_e) {
        switch (_e.label) {
            case 0:
                teamId = c.req.param("teamId");
                challengeId = c.req.param("challengeId");
                return [4 /*yield*/, c.env.DB.prepare("SELECT * FROM challenges WHERE id = ? AND challenged_team_id = ? AND status = 'pending'").bind(challengeId, teamId).first()];
            case 1:
                challenge = _e.sent();
                if (!challenge)
                    return [2 /*return*/, c.json({ error: "Výzva nenalezena nebo už zpracována" }, 404)];
                return [4 /*yield*/, c.env.DB.prepare("SELECT name, budget, game_date, season_start FROM teams WHERE id = ?")
                        .bind(teamId).first()];
            case 2:
                team = _e.sent();
                if (!team || team.budget < 1000)
                    return [2 /*return*/, c.json({ error: "Nedostatek peněz (min 1 000 Kč)" }, 400)];
                challengerTeamId = challenge.challenger_team_id;
                return [4 /*yield*/, c.env.DB.prepare("SELECT name, game_date, budget FROM teams WHERE id = ?")
                        .bind(challengerTeamId).first()];
            case 3:
                challenger = _e.sent();
                if (!challenger || challenger.budget < 1000)
                    return [2 /*return*/, c.json({ error: "Soupeř nemá dostatek peněz (min 1 000 Kč)" }, 400)];
                gameDateDay = team.game_date ? team.game_date.split("T")[0] : null;
                if (!gameDateDay) return [3 /*break*/, 5];
                seasonStart = (_b = team.season_start) !== null && _b !== void 0 ? _b : "1970-01-01";
                return [4 /*yield*/, c.env.DB.batch([
                        c.env.DB.prepare("SELECT m.id FROM matches m JOIN season_calendar sc ON m.calendar_id = sc.id\n         WHERE (m.home_team_id = ? OR m.away_team_id = ? OR m.home_team_id = ? OR m.away_team_id = ?)\n         AND sc.scheduled_at LIKE ? AND sc.season_number = (SELECT MAX(number) FROM seasons WHERE status = 'active')\n         AND m.status IN ('scheduled','lineups_open','simulated') LIMIT 1").bind(teamId, teamId, challengerTeamId, challengerTeamId, "".concat(gameDateDay, "%")),
                        c.env.DB.prepare("SELECT id FROM matches WHERE calendar_id IS NULL AND status IN ('lineups_open','simulated')\n         AND (home_team_id = ? OR away_team_id = ? OR home_team_id = ? OR away_team_id = ?)\n         AND created_at LIKE ? AND created_at >= ? LIMIT 1").bind(teamId, teamId, challengerTeamId, challengerTeamId, "".concat(gameDateDay, "%"), seasonStart),
                    ])];
            case 4:
                _a = _e.sent(), leagueRes = _a[0], friendlyRes = _a[1];
                if (leagueRes.results.length > 0)
                    return [2 /*return*/, c.json({ error: "Dnes máš nebo soupeř má ligový zápas — přátelák nelze přijmout" }, 400)];
                if (friendlyRes.results.length > 0)
                    return [2 /*return*/, c.json({ error: "Jeden z týmů už dnes hrál nebo má naplánovaný přátelák" }, 400)];
                _e.label = 5;
            case 5:
                matchDate = new Date(team.game_date);
                if (new Date().getUTCHours() >= 17) {
                    matchDate.setUTCDate(matchDate.getUTCDate() + 1);
                }
                matchId = uuid();
                return [4 /*yield*/, c.env.DB.prepare("INSERT INTO matches (id, home_team_id, away_team_id, status, created_at) VALUES (?, ?, ?, 'lineups_open', ?)").bind(matchId, challengerTeamId, teamId, matchDate.toISOString()).run()];
            case 6:
                _e.sent();
                return [4 /*yield*/, c.env.DB.prepare("UPDATE challenges SET status = 'accepted', match_id = ? WHERE id = ? AND challenged_team_id = ? AND status = 'pending' RETURNING id").bind(matchId, challengeId, teamId).first()];
            case 7:
                claimed = _e.sent();
                if (!!claimed) return [3 /*break*/, 9];
                return [4 /*yield*/, c.env.DB.prepare("DELETE FROM matches WHERE id = ?").bind(matchId).run()
                        .catch(function (e) { return logger_1.logger.warn({ module: "matches" }, "rollback orphan match", e); })];
            case 8:
                _e.sent();
                return [2 /*return*/, c.json({ error: "Výzva nenalezena nebo už zpracována" }, 409)];
            case 9: return [4 /*yield*/, Promise.resolve().then(function () { return require("../season/finance-processor"); })];
            case 10:
                recordTransaction = (_e.sent()).recordTransaction;
                return [4 /*yield*/, recordTransaction(c.env.DB, teamId, "event", -1000, "P\u0159\u00E1tel\u00E1k: cestovn\u00E9 a rozhod\u010D\u00ED", team.game_date)];
            case 11:
                _e.sent();
                return [4 /*yield*/, recordTransaction(c.env.DB, challengerTeamId, "event", -1000, "P\u0159\u00E1tel\u00E1k: cestovn\u00E9 a rozhod\u010D\u00ED", team.game_date)];
            case 12:
                _e.sent();
                // SMS both teams
                return [4 /*yield*/, sendSMS(c.env.DB, challengerTeamId, "Sportovní ředitel", "Sportovní ředitel", "\u2705 ".concat(team.name, " p\u0159ijal v\u00FDzvu na p\u0159\u00E1tel\u00E1k! Nastav sestavu, z\u00E1pas se odehraje v 18:00."))];
            case 13:
                // SMS both teams
                _e.sent();
                return [4 /*yield*/, sendSMS(c.env.DB, teamId, "Sportovní ředitel", "Sportovní ředitel", "\u2705 P\u0159\u00E1tel\u00E1k s ".concat((_c = challenger === null || challenger === void 0 ? void 0 : challenger.name) !== null && _c !== void 0 ? _c : "soupeřem", " domluven! Nastav sestavu, z\u00E1pas se odehraje v 18:00."))];
            case 14:
                _e.sent();
                _e.label = 15;
            case 15:
                _e.trys.push([15, 19, , 20]);
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../community/notifications"); })];
            case 16:
                createNotification = (_e.sent()).createNotification;
                pushEnv = { VAPID_PUBLIC_KEY: c.env.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: c.env.VAPID_PRIVATE_KEY, VAPID_SUBJECT: c.env.VAPID_SUBJECT, DB: c.env.DB };
                return [4 /*yield*/, createNotification(c.env.DB, challengerTeamId, "challenge", "\u2705 ".concat(team.name, " p\u0159ijal v\u00FDzvu!"), "Nastav sestavu, zápas se odehraje v 18:00.", "/dashboard/match", pushEnv)];
            case 17:
                _e.sent();
                return [4 /*yield*/, createNotification(c.env.DB, teamId, "challenge", "\u2705 P\u0159\u00E1tel\u00E1k s ".concat((_d = challenger === null || challenger === void 0 ? void 0 : challenger.name) !== null && _d !== void 0 ? _d : "soupeřem", " domluven!"), "Nastav sestavu, zápas se odehraje v 18:00.", "/dashboard/match", pushEnv)];
            case 18:
                _e.sent();
                return [3 /*break*/, 20];
            case 19:
                e_4 = _e.sent();
                logger_1.logger.warn({ module: "matches" }, "challenge accept notifications", e_4);
                return [3 /*break*/, 20];
            case 20: return [2 /*return*/, c.json({ ok: true, matchId: matchId })];
        }
    });
}); });
// POST /api/teams/:teamId/challenge/:challengeId/decline — odmítnout výzvu
matchesRouter.post("/teams/:teamId/challenge/:challengeId/decline", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, challengeId, challenge, team, createNotification, pushEnv, e_5;
    var _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                teamId = c.req.param("teamId");
                challengeId = c.req.param("challengeId");
                return [4 /*yield*/, c.env.DB.prepare("SELECT challenger_team_id FROM challenges WHERE id = ? AND challenged_team_id = ? AND status = 'pending'").bind(challengeId, teamId).first()];
            case 1:
                challenge = _c.sent();
                if (!challenge)
                    return [2 /*return*/, c.json({ error: "Výzva nenalezena" }, 404)];
                return [4 /*yield*/, c.env.DB.prepare("UPDATE challenges SET status = 'declined' WHERE id = ?").bind(challengeId).run()];
            case 2:
                _c.sent();
                return [4 /*yield*/, c.env.DB.prepare("SELECT name FROM teams WHERE id = ?").bind(teamId).first()];
            case 3:
                team = _c.sent();
                return [4 /*yield*/, sendSMS(c.env.DB, challenge.challenger_team_id, "Sportovní ředitel", "Sportovní ředitel", "\u274C ".concat((_a = team === null || team === void 0 ? void 0 : team.name) !== null && _a !== void 0 ? _a : "Soupeř", " odm\u00EDtl v\u00FDzvu na p\u0159\u00E1tel\u00E1k."))];
            case 4:
                _c.sent();
                _c.label = 5;
            case 5:
                _c.trys.push([5, 8, , 9]);
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../community/notifications"); })];
            case 6:
                createNotification = (_c.sent()).createNotification;
                pushEnv = { VAPID_PUBLIC_KEY: c.env.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: c.env.VAPID_PRIVATE_KEY, VAPID_SUBJECT: c.env.VAPID_SUBJECT, DB: c.env.DB };
                return [4 /*yield*/, createNotification(c.env.DB, challenge.challenger_team_id, "challenge", "\u274C ".concat((_b = team === null || team === void 0 ? void 0 : team.name) !== null && _b !== void 0 ? _b : "Soupeř", " odm\u00EDtl v\u00FDzvu"), "Zkus vyzvat jiný tým.", "/dashboard/friendly", pushEnv)];
            case 7:
                _c.sent();
                return [3 /*break*/, 9];
            case 8:
                e_5 = _c.sent();
                logger_1.logger.warn({ module: "matches" }, "challenge decline notification", e_5);
                return [3 /*break*/, 9];
            case 9: return [2 /*return*/, c.json({ ok: true })];
        }
    });
}); });
// POST /api/teams/:teamId/challenge/:challengeId/cancel — stáhnout vlastní odeslanou výzvu (jen pending)
matchesRouter.post("/teams/:teamId/challenge/:challengeId/cancel", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, challengeId, challenge, cancelled, team, createNotification, pushEnv, e_6;
    var _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                teamId = c.req.param("teamId");
                challengeId = c.req.param("challengeId");
                return [4 /*yield*/, c.env.DB.prepare("SELECT challenged_team_id FROM challenges WHERE id = ? AND challenger_team_id = ? AND status = 'pending'").bind(challengeId, teamId).first()];
            case 1:
                challenge = _c.sent();
                if (!challenge)
                    return [2 /*return*/, c.json({ error: "Výzva nenalezena nebo už zpracována" }, 404)];
                return [4 /*yield*/, c.env.DB.prepare("UPDATE challenges SET status = 'declined' WHERE id = ? AND challenger_team_id = ? AND status = 'pending' RETURNING id").bind(challengeId, teamId).first()];
            case 2:
                cancelled = _c.sent();
                if (!cancelled)
                    return [2 /*return*/, c.json({ error: "Výzva už byla mezitím přijata nebo zpracována" }, 409)];
                return [4 /*yield*/, c.env.DB.prepare("SELECT name FROM teams WHERE id = ?").bind(teamId).first()];
            case 3:
                team = _c.sent();
                return [4 /*yield*/, sendSMS(c.env.DB, challenge.challenged_team_id, "Sportovní ředitel", "Sportovní ředitel", "\u21A9\uFE0F ".concat((_a = team === null || team === void 0 ? void 0 : team.name) !== null && _a !== void 0 ? _a : "Soupeř", " st\u00E1hl v\u00FDzvu na p\u0159\u00E1telsk\u00FD z\u00E1pas."))];
            case 4:
                _c.sent();
                _c.label = 5;
            case 5:
                _c.trys.push([5, 8, , 9]);
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../community/notifications"); })];
            case 6:
                createNotification = (_c.sent()).createNotification;
                pushEnv = { VAPID_PUBLIC_KEY: c.env.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: c.env.VAPID_PRIVATE_KEY, VAPID_SUBJECT: c.env.VAPID_SUBJECT, DB: c.env.DB };
                return [4 /*yield*/, createNotification(c.env.DB, challenge.challenged_team_id, "challenge", "\u21A9\uFE0F ".concat((_b = team === null || team === void 0 ? void 0 : team.name) !== null && _b !== void 0 ? _b : "Soupeř", " st\u00E1hl v\u00FDzvu"), "Výzva na přátelák byla zrušena.", "/dashboard/friendly", pushEnv)];
            case 7:
                _c.sent();
                return [3 /*break*/, 9];
            case 8:
                e_6 = _c.sent();
                logger_1.logger.warn({ module: "matches" }, "challenge cancel notification", e_6);
                return [3 /*break*/, 9];
            case 9: return [2 /*return*/, c.json({ ok: true })];
        }
    });
}); });
// GET /api/teams/:teamId/challenges — seznam výzev + cooldown
matchesRouter.get("/teams/:teamId/challenges", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, team, incoming, outgoing, played, lastChallenge, cooldownDaysLeft, daysDiff, humanTeams, gameDateDay, leagueMatchToday, lm;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, c.env.DB.prepare("SELECT game_date FROM teams WHERE id = ?")
                        .bind(teamId).first()];
            case 1:
                team = _a.sent();
                return [4 /*yield*/, c.env.DB.prepare("SELECT c.*, t.name as challenger_name FROM challenges c\n     JOIN teams t ON c.challenger_team_id = t.id\n     WHERE c.challenged_team_id = ? AND c.status = 'pending'\n     ORDER BY c.created_at DESC").bind(teamId).all()];
            case 2:
                incoming = _a.sent();
                return [4 /*yield*/, c.env.DB.prepare("SELECT c.*, t.name as challenged_name, m.status as match_status FROM challenges c\n     JOIN teams t ON c.challenged_team_id = t.id\n     LEFT JOIN matches m ON c.match_id = m.id\n     WHERE c.challenger_team_id = ? AND c.status IN ('pending', 'accepted')\n     ORDER BY c.created_at DESC").bind(teamId).all()];
            case 3:
                outgoing = _a.sent();
                return [4 /*yield*/, c.env.DB.prepare("SELECT c.*, t1.name as challenger_name, t2.name as challenged_name,\n            m.home_score, m.away_score\n     FROM challenges c\n     JOIN teams t1 ON c.challenger_team_id = t1.id\n     JOIN teams t2 ON c.challenged_team_id = t2.id\n     LEFT JOIN matches m ON c.match_id = m.id\n     WHERE (c.challenger_team_id = ? OR c.challenged_team_id = ?) AND c.status = 'played'\n     ORDER BY c.created_at DESC LIMIT 5").bind(teamId, teamId).all()];
            case 4:
                played = _a.sent();
                return [4 /*yield*/, c.env.DB.prepare("SELECT created_at FROM challenges WHERE (challenger_team_id = ? OR challenged_team_id = ?) AND status IN ('accepted','played') ORDER BY created_at DESC LIMIT 1").bind(teamId, teamId).first()
                        .catch(function (e) { logger_1.logger.warn({ module: "matches" }, "fetch last challenge cooldown (list)", e); return null; })];
            case 5:
                lastChallenge = _a.sent();
                cooldownDaysLeft = 0;
                if (lastChallenge && team) {
                    daysDiff = (new Date(team.game_date).getTime() - new Date(lastChallenge.created_at).getTime()) / (1000 * 60 * 60 * 24);
                    // Záporný rozdíl = výzva z časového prostoru staré sezóny (před resetem game_clock) — bez cooldownu
                    cooldownDaysLeft = daysDiff < 0 ? 0 : Math.max(0, Math.ceil(3 - daysDiff));
                }
                return [4 /*yield*/, c.env.DB.prepare("SELECT t.id, t.name, v.name as village FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.user_id <> 'ai' AND t.id <> ? AND COALESCE(t.team_type, 'senior') <> 'u21' ORDER BY t.name").bind(teamId).all()];
            case 6:
                humanTeams = _a.sent();
                gameDateDay = (team === null || team === void 0 ? void 0 : team.game_date) ? team.game_date.split("T")[0] : null;
                leagueMatchToday = false;
                if (!gameDateDay) return [3 /*break*/, 8];
                return [4 /*yield*/, c.env.DB.prepare("SELECT m.id FROM matches m JOIN season_calendar sc ON m.calendar_id = sc.id\n       WHERE (m.home_team_id = ? OR m.away_team_id = ?)\n       AND sc.scheduled_at LIKE ? AND sc.season_number = (SELECT MAX(number) FROM seasons WHERE status = 'active')\n       AND m.status IN ('scheduled','lineups_open','simulated') LIMIT 1").bind(teamId, teamId, "".concat(gameDateDay, "%")).all()
                        .catch(function (e) { logger_1.logger.warn({ module: "matches" }, "league match today check", e); return { results: [] }; })];
            case 7:
                lm = _a.sent();
                leagueMatchToday = lm.results.length > 0;
                _a.label = 8;
            case 8: return [2 /*return*/, c.json({
                    leagueMatchToday: leagueMatchToday,
                    incoming: incoming.results.map(function (r) { return ({
                        id: r.id, challengerName: r.challenger_name, message: r.message, createdAt: r.created_at,
                    }); }),
                    outgoing: outgoing.results.map(function (r) { return ({
                        id: r.id, challengedName: r.challenged_name, message: r.message, createdAt: r.created_at,
                        status: r.status,
                        matchId: r.match_id,
                        matchStatus: r.match_status,
                    }); }),
                    played: played.results.map(function (r) { return ({
                        id: r.id, matchId: r.match_id,
                        challengerName: r.challenger_name, challengedName: r.challenged_name,
                        homeScore: r.home_score, awayScore: r.away_score,
                    }); }),
                    cooldownDaysLeft: cooldownDaysLeft,
                    canChallenge: cooldownDaysLeft === 0,
                    teams: humanTeams.results.map(function (r) { return ({ id: r.id, name: r.name, village: r.village }); }),
                })];
        }
    });
}); });
