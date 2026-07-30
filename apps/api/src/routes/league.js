"use strict";
/**
 * League API routes — standings from real DB data.
 */
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
exports.leagueRouter = void 0;
var hono_1 = require("hono");
var logger_1 = require("../lib/logger");
var season_1 = require("../lib/season");
var leagueRouter = new hono_1.Hono();
exports.leagueRouter = leagueRouter;
function deriveInitials(name) {
    if (!name)
        return "?";
    var cleaned = String(name).replace(/^FK\s+/i, "").replace(/^SK\s+/i, "").replace(/^TJ\s+/i, "").trim();
    var words = cleaned.split(/\s+/).filter(Boolean);
    if (words.length === 0)
        return "?";
    if (words.length === 1)
        return words[0].slice(0, 3).toUpperCase();
    return words.slice(0, 3).map(function (w) { var _a; return (_a = w[0]) !== null && _a !== void 0 ? _a : ""; }).join("").toUpperCase();
}
// GET /api/teams/:teamId/standings — real standings from DB
leagueRouter.get("/teams/:teamId/standings", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, team, leagueId, leagueInfo, leagueTeams, teamIds, teamMeta, placeholders, matches, stats, _i, teamIds_1, tid, _a, _b, m, homeId, awayId, hs, as_, standings;
    var _c;
    var _d, _e;
    return __generator(this, function (_f) {
        switch (_f.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, c.env.DB.prepare("SELECT t.*, v.name as village_name, v.district FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?").bind(teamId).first()];
            case 1:
                team = _f.sent();
                if (!team)
                    return [2 /*return*/, c.json({ error: "Team not found" }, 404)];
                leagueId = team.league_id;
                if (!leagueId)
                    return [2 /*return*/, c.json({ leagueName: "", standings: [], season: null })];
                return [4 /*yield*/, c.env.DB.prepare("SELECT l.name, l.level, s.number as season_number FROM leagues l JOIN seasons s ON l.season_id = s.id WHERE l.id = ?").bind(leagueId).first().catch(function (e) { logger_1.logger.warn({ module: "league" }, "fetch league info", e); return null; })];
            case 2:
                leagueInfo = _f.sent();
                return [4 /*yield*/, c.env.DB.prepare("SELECT t.id, t.name, t.user_id, t.primary_color, t.secondary_color, t.badge_pattern, v.name as village_name FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.league_id = ? ORDER BY t.name").bind(leagueId).all()];
            case 3:
                leagueTeams = _f.sent();
                teamIds = leagueTeams.results.map(function (t) { return t.id; });
                teamMeta = Object.fromEntries(leagueTeams.results.map(function (t) { return [t.id, {
                        name: t.name,
                        isAi: t.user_id === "ai",
                        primaryColor: t.primary_color || "#2D5F2D",
                        secondaryColor: t.secondary_color || "#FFFFFF",
                        badgePattern: t.badge_pattern || "shield",
                    }]; }));
                placeholders = teamIds.map(function () { return "?"; }).join(",");
                return [4 /*yield*/, (_c = c.env.DB.prepare("SELECT m.* FROM matches m\n     JOIN season_calendar sc ON sc.id = m.calendar_id\n     WHERE m.status = 'simulated'\n       AND sc.season_number = (SELECT MAX(season_number) FROM season_calendar WHERE league_id = ?)\n       AND (m.home_team_id IN (".concat(placeholders, ") OR m.away_team_id IN (").concat(placeholders, "))"))).bind.apply(_c, __spreadArray(__spreadArray([leagueId], teamIds, false), teamIds, false)).all().catch(function (e) { logger_1.logger.warn({ module: "league" }, "fetch simulated matches", e); return { results: [] }; })];
            case 4:
                matches = _f.sent();
                stats = {};
                for (_i = 0, teamIds_1 = teamIds; _i < teamIds_1.length; _i++) {
                    tid = teamIds_1[_i];
                    stats[tid] = { wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, form: [] };
                }
                for (_a = 0, _b = matches.results; _a < _b.length; _a++) {
                    m = _b[_a];
                    homeId = m.home_team_id;
                    awayId = m.away_team_id;
                    hs = m.home_score;
                    as_ = m.away_score;
                    if (!stats[homeId] || !stats[awayId])
                        continue;
                    stats[homeId].gf += hs;
                    stats[homeId].ga += as_;
                    stats[awayId].gf += as_;
                    stats[awayId].ga += hs;
                    if (hs > as_) {
                        stats[homeId].wins++;
                        stats[homeId].form.push("W");
                        stats[awayId].losses++;
                        stats[awayId].form.push("L");
                    }
                    else if (hs < as_) {
                        stats[awayId].wins++;
                        stats[awayId].form.push("W");
                        stats[homeId].losses++;
                        stats[homeId].form.push("L");
                    }
                    else {
                        stats[homeId].draws++;
                        stats[homeId].form.push("D");
                        stats[awayId].draws++;
                        stats[awayId].form.push("D");
                    }
                }
                standings = teamIds.map(function (tid) {
                    var s = stats[tid];
                    var m = teamMeta[tid];
                    var played = s.wins + s.draws + s.losses;
                    return {
                        teamId: tid,
                        team: m.name,
                        played: played,
                        wins: s.wins,
                        draws: s.draws,
                        losses: s.losses,
                        gf: s.gf,
                        ga: s.ga,
                        points: s.wins * 3 + s.draws,
                        form: s.form.slice(-5).reverse(),
                        isPlayer: tid === teamId,
                        isAi: m.isAi,
                        primaryColor: m.primaryColor,
                        secondaryColor: m.secondaryColor,
                        badgePattern: m.badgePattern,
                    };
                });
                // Sort: points DESC, goal diff DESC, goals for DESC
                standings.sort(function (a, b) {
                    var pd = b.points - a.points;
                    if (pd !== 0)
                        return pd;
                    var gd = (b.gf - b.ga) - (a.gf - a.ga);
                    if (gd !== 0)
                        return gd;
                    return b.gf - a.gf;
                });
                // Assign positions
                standings.forEach(function (s, i) { s.pos = i + 1; });
                return [2 /*return*/, c.json({
                        leagueName: (_d = leagueInfo === null || leagueInfo === void 0 ? void 0 : leagueInfo.name) !== null && _d !== void 0 ? _d : "Okresn\u00ED p\u0159ebor ".concat(team.district),
                        leagueLevel: (_e = leagueInfo === null || leagueInfo === void 0 ? void 0 : leagueInfo.level) !== null && _e !== void 0 ? _e : "okresni_prebor",
                        season: (0, season_1.mustSeason)(leagueInfo === null || leagueInfo === void 0 ? void 0 : leagueInfo.season_number),
                        standings: standings,
                    })];
        }
    });
}); });
// GET /api/teams/:teamId/league-stats — top scorers + assists across the league
leagueRouter.get("/teams/:teamId/league-stats", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, team, season, seasonId, stats, rows;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, c.env.DB.prepare("SELECT league_id FROM teams WHERE id = ?")
                        .bind(teamId).first()];
            case 1:
                team = _a.sent();
                if (!(team === null || team === void 0 ? void 0 : team.league_id))
                    return [2 /*return*/, c.json({ topScorers: [], topAssists: [] })];
                return [4 /*yield*/, c.env.DB.prepare("SELECT id FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1").first().catch(function (e) { logger_1.logger.warn({ module: "league" }, "fetch active season for stats", e); return null; })];
            case 2:
                season = _a.sent();
                seasonId = (0, season_1.mustSeason)(season === null || season === void 0 ? void 0 : season.id);
                return [4 /*yield*/, c.env.DB.prepare("SELECT ps.goals, ps.assists, ps.appearances, ps.man_of_match as motm,\n       ps.yellow_cards, ps.red_cards, ps.avg_rating, ps.clean_sheets,\n       p.id as player_id, p.first_name, p.last_name, p.position, ps.team_id,\n       t.name as team_name, t.primary_color, t.secondary_color, t.badge_pattern\n     FROM player_stats ps\n     JOIN players p ON ps.player_id = p.id\n     JOIN teams t ON ps.team_id = t.id\n     WHERE ps.season_id = ? AND t.league_id = ?\n     ORDER BY ps.goals DESC, ps.assists DESC").bind(seasonId, team.league_id).all().catch(function (e) { logger_1.logger.error({ module: "league" }, "fetch league stats", e); return { results: [] }; })];
            case 3:
                stats = _a.sent();
                rows = stats.results.map(function (r) {
                    var _a, _b, _c, _d, _e, _f, _g, _h;
                    return ({
                        playerId: r.player_id,
                        name: "".concat(r.first_name, " ").concat(r.last_name),
                        position: r.position,
                        teamId: r.team_id,
                        teamName: r.team_name,
                        teamColor: r.primary_color || "#2D5F2D",
                        teamSecondary: r.secondary_color || "#FFFFFF",
                        teamBadge: r.badge_pattern || "shield",
                        goals: (_a = r.goals) !== null && _a !== void 0 ? _a : 0,
                        assists: (_b = r.assists) !== null && _b !== void 0 ? _b : 0,
                        appearances: (_c = r.appearances) !== null && _c !== void 0 ? _c : 0,
                        motm: (_d = r.motm) !== null && _d !== void 0 ? _d : 0,
                        yellowCards: (_e = r.yellow_cards) !== null && _e !== void 0 ? _e : 0,
                        redCards: (_f = r.red_cards) !== null && _f !== void 0 ? _f : 0,
                        avgRating: (_g = r.avg_rating) !== null && _g !== void 0 ? _g : 0,
                        cleanSheets: (_h = r.clean_sheets) !== null && _h !== void 0 ? _h : 0,
                        isMyTeam: r.team_id === teamId,
                    });
                });
                return [2 /*return*/, c.json({
                        topScorers: __spreadArray([], rows, true).sort(function (a, b) { return b.goals - a.goals || b.assists - a.assists; }).filter(function (r) { return r.goals > 0; }).slice(0, 15),
                        topAssists: __spreadArray([], rows, true).sort(function (a, b) { return b.assists - a.assists || b.goals - a.goals; }).filter(function (r) { return r.assists > 0; }).slice(0, 15),
                        topRated: __spreadArray([], rows, true).filter(function (r) { return r.appearances >= 3 && r.avgRating > 0; }).sort(function (a, b) { return b.avgRating - a.avgRating; }).slice(0, 10),
                        mostCards: __spreadArray([], rows, true).filter(function (r) { return r.yellowCards + r.redCards > 0; }).sort(function (a, b) { return (b.yellowCards + b.redCards * 3) - (a.yellowCards + a.redCards * 3); }).slice(0, 10),
                        mostAppearances: __spreadArray([], rows, true).sort(function (a, b) { return b.appearances - a.appearances; }).filter(function (r) { return r.appearances > 0; }).slice(0, 10),
                    })];
        }
    });
}); });
// GET /api/teams/:teamId/players/:playerId/league-rank — pozice hráče v žebříčcích ligy
leagueRouter.get("/teams/:teamId/players/:playerId/league-rank", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, playerId, team, season, stats, rows, me, goalsBetter, assistsBetter, ratingPool, ratingBetter, ratingTotal, ratingEligible;
    var _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                teamId = c.req.param("teamId");
                playerId = c.req.param("playerId");
                return [4 /*yield*/, c.env.DB.prepare("SELECT league_id FROM teams WHERE id = ?")
                        .bind(teamId).first()];
            case 1:
                team = _c.sent();
                if (!(team === null || team === void 0 ? void 0 : team.league_id))
                    return [2 /*return*/, c.json({ ranks: null })];
                return [4 /*yield*/, c.env.DB.prepare("SELECT id FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1").first().catch(function (e) { logger_1.logger.warn({ module: "league" }, "fetch active season for rank", e); return null; })];
            case 2:
                season = _c.sent();
                if (!season)
                    return [2 /*return*/, c.json({ ranks: null })];
                return [4 /*yield*/, c.env.DB.prepare("SELECT ps.player_id, ps.goals, ps.assists, ps.avg_rating, ps.appearances\n     FROM player_stats ps\n     JOIN players p ON ps.player_id = p.id\n     JOIN teams t ON ps.team_id = t.id\n     WHERE ps.season_id = ? AND t.league_id = ?").bind(season.id, team.league_id).all()
                        .catch(function (e) { logger_1.logger.warn({ module: "league" }, "fetch league rank stats", e); return { results: [] }; })];
            case 3:
                stats = _c.sent();
                rows = stats.results;
                if (rows.length === 0)
                    return [2 /*return*/, c.json({ ranks: null })];
                me = rows.find(function (r) { return r.player_id === playerId; });
                if (!me)
                    return [2 /*return*/, c.json({ ranks: null })];
                goalsBetter = rows.filter(function (r) { return r.goals > me.goals; }).length;
                assistsBetter = rows.filter(function (r) { return r.assists > me.assists; }).length;
                ratingPool = rows.filter(function (r) { return r.appearances >= 3; });
                ratingBetter = ratingPool.filter(function (r) { return r.avg_rating > me.avg_rating; }).length;
                ratingTotal = ratingPool.length;
                ratingEligible = me.appearances >= 3;
                return [2 /*return*/, c.json({
                        ranks: {
                            goals: { rank: goalsBetter + 1, total: rows.length, value: me.goals },
                            assists: { rank: assistsBetter + 1, total: rows.length, value: me.assists },
                            rating: ratingEligible
                                ? { rank: ratingBetter + 1, total: ratingTotal, value: Number((_b = (_a = me.avg_rating) === null || _a === void 0 ? void 0 : _a.toFixed(2)) !== null && _b !== void 0 ? _b : 0) }
                                : null,
                        },
                    })];
        }
    });
}); });
// GET /api/leagues — seznam všech aktivních lig (pro league picker v UI)
leagueRouter.get("/leagues", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var leagues;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, c.env.DB.prepare("SELECT l.id, l.name, l.level, l.district, l.season_id, s.number as season_number, (SELECT COUNT(*) FROM teams t WHERE t.league_id = l.id) as team_count FROM leagues l JOIN seasons s ON l.season_id = s.id WHERE l.status = 'active' AND l.district IN ('Prachatice', 'Praha') ORDER BY l.name").all().catch(function (e) { logger_1.logger.error({ module: "league" }, "fetch leagues", e); return { results: [] }; })];
            case 1:
                leagues = _a.sent();
                return [2 /*return*/, c.json({ leagues: leagues.results })];
        }
    });
}); });
// GET /api/leagues/:leagueId/standings — tabulka libovolné ligy
leagueRouter.get("/leagues/:leagueId/standings", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var leagueId, leagueInfo, leagueTeams, teamIds, matches, stats, _i, teamIds_2, tid, _a, _b, m, homeId, awayId, hs, as_, standings;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                leagueId = c.req.param("leagueId");
                return [4 /*yield*/, c.env.DB.prepare("SELECT l.name, l.level, l.district, s.number as season_number FROM leagues l JOIN seasons s ON l.season_id = s.id WHERE l.id = ?").bind(leagueId).first()];
            case 1:
                leagueInfo = _c.sent();
                if (!leagueInfo)
                    return [2 /*return*/, c.json({ error: "League not found" }, 404)];
                return [4 /*yield*/, c.env.DB.prepare("SELECT t.id, t.name, t.user_id, t.primary_color, t.secondary_color, t.badge_pattern, v.name as village_name FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.league_id = ? ORDER BY t.name").bind(leagueId).all()];
            case 2:
                leagueTeams = _c.sent();
                teamIds = leagueTeams.results.map(function (t) { return t.id; });
                if (teamIds.length === 0)
                    return [2 /*return*/, c.json({ leagueName: leagueInfo.name, standings: [], season: leagueInfo.season_number })];
                return [4 /*yield*/, c.env.DB.prepare("SELECT m.home_team_id, m.away_team_id, m.home_score, m.away_score FROM matches m\n     JOIN season_calendar sc ON sc.id = m.calendar_id\n     WHERE m.league_id = ? AND m.status = 'simulated'\n       AND sc.season_number = (SELECT MAX(season_number) FROM season_calendar WHERE league_id = ?)").bind(leagueId, leagueId).all()];
            case 3:
                matches = _c.sent();
                stats = {};
                for (_i = 0, teamIds_2 = teamIds; _i < teamIds_2.length; _i++) {
                    tid = teamIds_2[_i];
                    stats[tid] = { wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, form: [] };
                }
                for (_a = 0, _b = matches.results; _a < _b.length; _a++) {
                    m = _b[_a];
                    homeId = m.home_team_id;
                    awayId = m.away_team_id;
                    hs = m.home_score;
                    as_ = m.away_score;
                    if (!stats[homeId] || !stats[awayId])
                        continue;
                    stats[homeId].gf += hs;
                    stats[homeId].ga += as_;
                    stats[awayId].gf += as_;
                    stats[awayId].ga += hs;
                    if (hs > as_) {
                        stats[homeId].wins++;
                        stats[homeId].form.push("W");
                        stats[awayId].losses++;
                        stats[awayId].form.push("L");
                    }
                    else if (hs < as_) {
                        stats[awayId].wins++;
                        stats[awayId].form.push("W");
                        stats[homeId].losses++;
                        stats[homeId].form.push("L");
                    }
                    else {
                        stats[homeId].draws++;
                        stats[homeId].form.push("D");
                        stats[awayId].draws++;
                        stats[awayId].form.push("D");
                    }
                }
                standings = teamIds.map(function (tid) {
                    var s = stats[tid];
                    var t = leagueTeams.results.find(function (r) { return r.id === tid; });
                    return {
                        teamId: tid, team: t.name,
                        played: s.wins + s.draws + s.losses, wins: s.wins, draws: s.draws, losses: s.losses,
                        gf: s.gf, ga: s.ga, points: s.wins * 3 + s.draws,
                        form: s.form.slice(-5).reverse(),
                        isAi: t.user_id === "ai",
                        primaryColor: t.primary_color || "#2D5F2D",
                        secondaryColor: t.secondary_color || "#FFFFFF",
                        badgePattern: t.badge_pattern || "shield",
                    };
                });
                standings.sort(function (a, b) { return (b.points - a.points) || ((b.gf - b.ga) - (a.gf - a.ga)) || (b.gf - a.gf); });
                standings.forEach(function (s, i) { s.pos = i + 1; });
                return [2 /*return*/, c.json({ leagueName: leagueInfo.name, leagueLevel: leagueInfo.level, season: leagueInfo.season_number, standings: standings })];
        }
    });
}); });
// GET /api/leagues/:leagueId/results — výsledky zápasů
leagueRouter.get("/leagues/:leagueId/results", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var leagueId, gameWeek, query, binds, results;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                leagueId = c.req.param("leagueId");
                gameWeek = c.req.query("gameWeek");
                query = "SELECT m.id, m.round, m.home_score, m.away_score, m.status, m.attendance, m.weather, sc.game_week, sc.scheduled_at, t1.name as home_name, t1.primary_color as home_color, t2.name as away_name, t2.primary_color as away_color FROM matches m JOIN teams t1 ON m.home_team_id = t1.id JOIN teams t2 ON m.away_team_id = t2.id JOIN season_calendar sc ON m.calendar_id = sc.id WHERE m.league_id = ? AND m.status = 'simulated' AND sc.season_number = (SELECT MAX(season_number) FROM season_calendar WHERE league_id = ?)";
                binds = [leagueId, leagueId];
                if (gameWeek) {
                    query += " AND sc.game_week = ?";
                    binds.push(parseInt(gameWeek));
                }
                query += " ORDER BY sc.game_week DESC, m.round";
                return [4 /*yield*/, (_a = c.env.DB.prepare(query)).bind.apply(_a, binds).all()
                        .catch(function (e) { logger_1.logger.error({ module: "league" }, "fetch results", e); return { results: [] }; })];
            case 1:
                results = _b.sent();
                return [2 /*return*/, c.json({ results: results.results })];
        }
    });
}); });
// GET /api/leagues/:leagueId/news — zpravodaj cizí ligy
leagueRouter.get("/leagues/:leagueId/news", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var leagueId, newsRows, iconMap, articles;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                leagueId = c.req.param("leagueId");
                return [4 /*yield*/, c.env.DB.prepare("SELECT n.id, n.type, n.headline, n.body, n.game_week, n.created_at, ur.photos_json FROM news n LEFT JOIN ultras_reports ur ON ur.news_id = n.id WHERE n.league_id = ? ORDER BY n.created_at DESC LIMIT 30").bind(leagueId).all().catch(function (e) { logger_1.logger.error({ module: "league" }, "fetch league news", e); return { results: [] }; })];
            case 1:
                newsRows = _a.sent();
                iconMap = {
                    round_results: "\u26BD", ai_report: "\u270D\uFE0F", transfer: "\uD83E\uDD1D",
                    seasonal: "\uD83C\uDF89", manager_arrival: "\uD83D\uDCCB",
                    interview: "\uD83C\uDF99\uFE0F", round_summary: "\uD83C\uDFC6", player_interview: "\uD83C\uDFA4",
                    season_wrap: "\uD83C\uDFC1", season_awards: "\uD83C\uDFC6", legend_farewell: "\uD83C\uDF96\uFE0F",
                    ultras_report: "\uD83D\uDD25",
                };
                articles = newsRows.results.map(function (n) {
                    var _a, _b, _c;
                    return ({
                        id: n.id, type: n.type,
                        headline: ((_a = n.headline) !== null && _a !== void 0 ? _a : n.type), body: ((_b = n.body) !== null && _b !== void 0 ? _b : ""),
                        icon: (_c = iconMap[n.type]) !== null && _c !== void 0 ? _c : "\uD83D\uDCF0",
                        date: n.created_at, gameWeek: n.game_week,
                        photos: n.photos_json ? JSON.parse(n.photos_json) : undefined,
                    });
                });
                return [2 /*return*/, c.json({ articles: articles })];
        }
    });
}); });
// GET /api/leagues/:leagueId/transfers-overview — přehled přestupů v lize
leagueRouter.get("/leagues/:leagueId/transfers-overview", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var leagueId, transfersRes, fromTeamIds, fromTeamsMap, placeholders, fromTeamsRows, _i, _a, r, leagueTransfers, virtualSalesRes, virtualSales, paidTransfers, totalTransfers, totalValue, avgFee, crossLeagueCount, faRes, adminFeeRes, biggest, sellersMap, _b, paidTransfers_1, t, existing, topSellers, buyersMap, _c, paidTransfers_2, t, existing, topBuyers, activeMap, _d, leagueTransfers_1, t, buyer, seller, mostActive, recent, speculationsRes, specPlayerIds, watcherBadgesMap, placeholders, watcherRes, _e, _f, w, badge, pid, speculations;
    var _g, _h;
    var _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x;
    return __generator(this, function (_y) {
        switch (_y.label) {
            case 0:
                leagueId = c.req.param("leagueId");
                return [4 /*yield*/, c.env.DB.prepare("SELECT\n       pc.player_id, pc.team_id as to_team_id, pc.fee, pc.joined_at, pc.join_type,\n       p.first_name, p.last_name, p.avatar as player_avatar, p.age, p.position,\n       t_to.name as to_team_name, t_to.league_id as to_league_id,\n       t_to.badge_primary_color as to_badge_primary, t_to.badge_secondary_color as to_badge_secondary,\n       t_to.badge_pattern as to_badge_pattern, t_to.badge_initials as to_badge_initials, t_to.badge_symbol as to_badge_symbol,\n       t_to.primary_color as to_primary_color, t_to.secondary_color as to_secondary_color,\n       (SELECT pc2.team_id FROM player_contracts pc2\n        WHERE pc2.player_id = pc.player_id\n        AND pc2.is_active = 0\n        AND pc2.leave_type IN ('transfer', 'released')\n        AND pc2.left_at <= pc.joined_at\n        ORDER BY pc2.left_at DESC LIMIT 1) as from_team_id\n     FROM player_contracts pc\n     JOIN players p ON pc.player_id = p.id\n     JOIN teams t_to ON pc.team_id = t_to.id\n     WHERE pc.join_type IN ('transfer', 'free_agent')\n     ORDER BY pc.joined_at DESC").all().catch(function (e) { logger_1.logger.error({ module: "league" }, "fetch transfers", e); return { results: [] }; })];
            case 1:
                transfersRes = _y.sent();
                fromTeamIds = Array.from(new Set(transfersRes.results.map(function (r) { return r.from_team_id; }).filter(Boolean)));
                fromTeamsMap = {};
                if (!(fromTeamIds.length > 0)) return [3 /*break*/, 3];
                placeholders = fromTeamIds.map(function () { return "?"; }).join(",");
                return [4 /*yield*/, (_g = c.env.DB.prepare("SELECT id, name, league_id, badge_primary_color, badge_secondary_color, badge_pattern, badge_initials, badge_symbol, primary_color, secondary_color FROM teams WHERE id IN (".concat(placeholders, ")"))).bind.apply(_g, fromTeamIds).all().catch(function () { return ({ results: [] }); })];
            case 2:
                fromTeamsRows = _y.sent();
                for (_i = 0, _a = fromTeamsRows.results; _i < _a.length; _i++) {
                    r = _a[_i];
                    fromTeamsMap[r.id] = {
                        name: r.name, leagueId: r.league_id,
                        badgePrimary: (_j = r.badge_primary_color) !== null && _j !== void 0 ? _j : r.primary_color,
                        badgeSecondary: (_k = r.badge_secondary_color) !== null && _k !== void 0 ? _k : r.secondary_color,
                        badgePattern: r.badge_pattern,
                        badgeInitials: (_l = r.badge_initials) !== null && _l !== void 0 ? _l : deriveInitials(r.name),
                        badgeSymbol: r.badge_symbol,
                    };
                }
                _y.label = 3;
            case 3:
                leagueTransfers = transfersRes.results
                    .filter(function (r) {
                    var _a;
                    var toInLeague = r.to_league_id === leagueId;
                    var fromInLeague = r.from_team_id && ((_a = fromTeamsMap[r.from_team_id]) === null || _a === void 0 ? void 0 : _a.leagueId) === leagueId;
                    return toInLeague || fromInLeague;
                })
                    .map(function (r) {
                    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s;
                    var fromTeam = r.from_team_id ? fromTeamsMap[r.from_team_id] : null;
                    var isCrossLeague = fromTeam && fromTeam.leagueId !== r.to_league_id;
                    var avatar = (function () { try {
                        return JSON.parse(r.player_avatar);
                    }
                    catch (e) {
                        logger_1.logger.warn({ module: "league" }, "parse player avatar: ".concat(e));
                        return {};
                    } })();
                    var fromBadge = fromTeam ? {
                        primary: (_a = fromTeam.badgePrimary) !== null && _a !== void 0 ? _a : "#374151",
                        secondary: (_b = fromTeam.badgeSecondary) !== null && _b !== void 0 ? _b : "#9ca3af",
                        pattern: (_c = fromTeam.badgePattern) !== null && _c !== void 0 ? _c : "shield",
                        initials: (_d = fromTeam.badgeInitials) !== null && _d !== void 0 ? _d : "?",
                        symbol: (_e = fromTeam.badgeSymbol) !== null && _e !== void 0 ? _e : null,
                    } : null;
                    var toBadge = {
                        primary: (_g = (_f = r.to_badge_primary) !== null && _f !== void 0 ? _f : r.to_primary_color) !== null && _g !== void 0 ? _g : "#374151",
                        secondary: (_j = (_h = r.to_badge_secondary) !== null && _h !== void 0 ? _h : r.to_secondary_color) !== null && _j !== void 0 ? _j : "#9ca3af",
                        pattern: (_k = r.to_badge_pattern) !== null && _k !== void 0 ? _k : "shield",
                        initials: (_l = r.to_badge_initials) !== null && _l !== void 0 ? _l : deriveInitials(r.to_team_name),
                        symbol: (_m = r.to_badge_symbol) !== null && _m !== void 0 ? _m : null,
                    };
                    return {
                        playerId: r.player_id,
                        playerName: "".concat(r.first_name, " ").concat(r.last_name),
                        playerAvatar: avatar,
                        age: (_o = r.age) !== null && _o !== void 0 ? _o : 0,
                        position: (_p = r.position) !== null && _p !== void 0 ? _p : "",
                        fromTeamId: r.from_team_id,
                        fromTeam: (_q = fromTeam === null || fromTeam === void 0 ? void 0 : fromTeam.name) !== null && _q !== void 0 ? _q : null,
                        fromTeamBadge: fromBadge,
                        toTeamId: r.to_team_id,
                        toTeam: r.to_team_name,
                        toTeamBadge: toBadge,
                        fee: (_r = r.fee) !== null && _r !== void 0 ? _r : 0,
                        date: r.joined_at,
                        isCrossLeague: !!isCrossLeague,
                        joinType: (_s = r.join_type) !== null && _s !== void 0 ? _s : "transfer",
                        toVirtual: false,
                    };
                });
                return [4 /*yield*/, c.env.DB.prepare("SELECT o.player_id, o.offer_amount as fee, o.resolved_at as joined_at,\n            dp.first_name, dp.last_name, dp.age, dp.position, dp.overall_rating, dp.avatar as player_avatar,\n            json_extract(o.virtual_team_data, '$.name') as virtual_club,\n            t.id as from_team_id, t.name as from_team_name,\n            t.badge_primary_color, t.badge_secondary_color, t.badge_pattern, t.badge_initials, t.badge_symbol,\n            t.primary_color, t.secondary_color\n     FROM transfer_offers o\n     JOIN departed_players dp ON dp.id = o.player_id\n     JOIN teams t ON t.id = o.to_team_id\n     WHERE o.from_team_id = 'virtual_ai' AND o.status = 'accepted' AND t.league_id = ?\n     ORDER BY o.resolved_at DESC").bind(leagueId).all().catch(function (e) { logger_1.logger.warn({ module: "league" }, "fetch virtual sales", e); return { results: [] }; })];
            case 4:
                virtualSalesRes = _y.sent();
                virtualSales = virtualSalesRes.results.map(function (r) {
                    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
                    var fromBadge = {
                        primary: (_b = (_a = r.badge_primary_color) !== null && _a !== void 0 ? _a : r.primary_color) !== null && _b !== void 0 ? _b : "#374151",
                        secondary: (_d = (_c = r.badge_secondary_color) !== null && _c !== void 0 ? _c : r.secondary_color) !== null && _d !== void 0 ? _d : "#9ca3af",
                        pattern: (_e = r.badge_pattern) !== null && _e !== void 0 ? _e : "shield",
                        initials: (_f = r.badge_initials) !== null && _f !== void 0 ? _f : deriveInitials(r.from_team_name),
                        symbol: (_g = r.badge_symbol) !== null && _g !== void 0 ? _g : null,
                    };
                    var avatar = (function () { try {
                        return r.player_avatar ? JSON.parse(r.player_avatar) : {};
                    }
                    catch (_a) {
                        return {};
                    } })();
                    return {
                        playerId: r.player_id,
                        playerName: "".concat(r.first_name, " ").concat(r.last_name),
                        playerAvatar: avatar,
                        age: (_h = r.age) !== null && _h !== void 0 ? _h : 0,
                        position: (_j = r.position) !== null && _j !== void 0 ? _j : "",
                        fromTeamId: r.from_team_id,
                        fromTeam: r.from_team_name,
                        fromTeamBadge: fromBadge,
                        toTeamId: "virtual_ai",
                        toTeam: (_k = r.virtual_club) !== null && _k !== void 0 ? _k : "Cizí klub",
                        toTeamBadge: { primary: "#4a5d43", secondary: "#e8e4d8", pattern: "shield", initials: "?", symbol: null },
                        fee: (_l = r.fee) !== null && _l !== void 0 ? _l : 0,
                        date: r.joined_at,
                        isCrossLeague: false,
                        joinType: "transfer",
                        toVirtual: true,
                    };
                });
                // Sloučit a seřadit podle data (nejnovější první) — virtuální prodeje se propletou mezi ostatní.
                leagueTransfers.push.apply(leagueTransfers, virtualSales);
                leagueTransfers.sort(function (a, b) { var _a, _b; return String((_a = b.date) !== null && _a !== void 0 ? _a : "").localeCompare(String((_b = a.date) !== null && _b !== void 0 ? _b : "")); });
                paidTransfers = leagueTransfers.filter(function (t) { return t.joinType === "transfer"; });
                totalTransfers = paidTransfers.length;
                totalValue = paidTransfers.reduce(function (s, t) { return s + t.fee; }, 0);
                avgFee = totalTransfers > 0 ? Math.round(totalValue / totalTransfers) : 0;
                crossLeagueCount = paidTransfers.filter(function (t) { return t.isCrossLeague; }).length;
                return [4 /*yield*/, c.env.DB.prepare("SELECT COUNT(*) as cnt FROM player_contracts pc\n     JOIN teams t ON pc.team_id = t.id\n     WHERE pc.join_type = 'free_agent' AND t.league_id = ?").bind(leagueId).first().catch(function () { return ({ cnt: 0 }); })];
            case 5:
                faRes = _y.sent();
                return [4 /*yield*/, c.env.DB.prepare("SELECT SUM(ABS(amount)) as total FROM transactions tx\n     JOIN teams t ON tx.team_id = t.id\n     WHERE tx.type = 'transfer_admin_fee' AND t.league_id = ?").bind(leagueId).first().catch(function () { return ({ total: 0 }); })];
            case 6:
                adminFeeRes = _y.sent();
                biggest = __spreadArray([], paidTransfers, true).sort(function (a, b) { return b.fee - a.fee; }).slice(0, 10);
                sellersMap = new Map();
                for (_b = 0, paidTransfers_1 = paidTransfers; _b < paidTransfers_1.length; _b++) {
                    t = paidTransfers_1[_b];
                    if (!t.fromTeamId || !t.fromTeam)
                        continue;
                    existing = sellersMap.get(t.fromTeamId);
                    if (existing) {
                        existing.earned += t.fee;
                        existing.count++;
                    }
                    else
                        sellersMap.set(t.fromTeamId, { teamId: t.fromTeamId, teamName: t.fromTeam, badge: t.fromTeamBadge, earned: t.fee, count: 1 });
                }
                topSellers = __spreadArray([], sellersMap.values(), true).sort(function (a, b) { return b.earned - a.earned; }).slice(0, 5);
                buyersMap = new Map();
                for (_c = 0, paidTransfers_2 = paidTransfers; _c < paidTransfers_2.length; _c++) {
                    t = paidTransfers_2[_c];
                    if (t.toVirtual)
                        continue;
                    existing = buyersMap.get(t.toTeamId);
                    if (existing) {
                        existing.spent += t.fee;
                        existing.count++;
                    }
                    else
                        buyersMap.set(t.toTeamId, { teamId: t.toTeamId, teamName: t.toTeam, badge: t.toTeamBadge, spent: t.fee, count: 1 });
                }
                topBuyers = __spreadArray([], buyersMap.values(), true).sort(function (a, b) { return b.spent - a.spent; }).slice(0, 5);
                activeMap = new Map();
                for (_d = 0, leagueTransfers_1 = leagueTransfers; _d < leagueTransfers_1.length; _d++) {
                    t = leagueTransfers_1[_d];
                    if (!t.toVirtual) {
                        buyer = (_m = activeMap.get(t.toTeamId)) !== null && _m !== void 0 ? _m : { teamId: t.toTeamId, teamName: t.toTeam, badge: t.toTeamBadge, in: 0, out: 0, total: 0 };
                        buyer.in++;
                        buyer.total++;
                        activeMap.set(t.toTeamId, buyer);
                    }
                    if (t.fromTeamId && t.fromTeam) {
                        seller = (_o = activeMap.get(t.fromTeamId)) !== null && _o !== void 0 ? _o : { teamId: t.fromTeamId, teamName: t.fromTeam, badge: t.fromTeamBadge, in: 0, out: 0, total: 0 };
                        seller.out++;
                        seller.total++;
                        activeMap.set(t.fromTeamId, seller);
                    }
                }
                mostActive = __spreadArray([], activeMap.values(), true).sort(function (a, b) { return b.total - a.total; }).slice(0, 5);
                recent = leagueTransfers.slice(0, 20);
                return [4 /*yield*/, c.env.DB.prepare("SELECT\n       pw.player_id,\n       p.first_name, p.last_name, p.avatar as player_avatar, p.position, p.overall_rating,\n       pc.team_id as current_team_id,\n       t.name as current_team_name,\n       t.badge_primary_color as cur_badge_primary, t.badge_secondary_color as cur_badge_secondary,\n       t.badge_pattern as cur_badge_pattern, t.badge_initials as cur_badge_initials, t.badge_symbol as cur_badge_symbol,\n       t.primary_color as cur_primary_color, t.secondary_color as cur_secondary_color,\n       COUNT(DISTINCT pw.team_id) as watcher_count,\n       MAX(pw.created_at) as latest_watched_at\n     FROM player_watchlist pw\n     JOIN players p ON pw.player_id = p.id\n     JOIN player_contracts pc ON pc.player_id = p.id AND pc.is_active = 1\n     JOIN teams t ON pc.team_id = t.id\n     WHERE t.league_id = ?\n       AND pw.team_id != pc.team_id\n     GROUP BY pw.player_id\n     ORDER BY latest_watched_at DESC\n     LIMIT 5").bind(leagueId).all().catch(function (e) { logger_1.logger.warn({ module: "league" }, "fetch speculations", e); return { results: [] }; })];
            case 7:
                speculationsRes = _y.sent();
                specPlayerIds = speculationsRes.results.map(function (r) { return r.player_id; });
                watcherBadgesMap = {};
                if (!(specPlayerIds.length > 0)) return [3 /*break*/, 9];
                placeholders = specPlayerIds.map(function () { return "?"; }).join(",");
                return [4 /*yield*/, (_h = c.env.DB.prepare("SELECT DISTINCT pw.player_id,\n         t.id as team_id,\n         t.badge_primary_color as bp, t.badge_secondary_color as bs, t.badge_pattern as pat,\n         t.badge_initials as ini, t.badge_symbol as sym, t.primary_color as pc, t.secondary_color as sc, t.name as tname\n       FROM player_watchlist pw\n       JOIN teams t ON pw.team_id = t.id\n       WHERE pw.player_id IN (".concat(placeholders, ")"))).bind.apply(_h, specPlayerIds).all().catch(function (e) { logger_1.logger.warn({ module: "league" }, "fetch watchers", e); return { results: [] }; })];
            case 8:
                watcherRes = _y.sent();
                for (_e = 0, _f = watcherRes.results; _e < _f.length; _e++) {
                    w = _f[_e];
                    badge = {
                        primary: (_q = (_p = w.bp) !== null && _p !== void 0 ? _p : w.pc) !== null && _q !== void 0 ? _q : "#374151",
                        secondary: (_s = (_r = w.bs) !== null && _r !== void 0 ? _r : w.sc) !== null && _s !== void 0 ? _s : "#9ca3af",
                        pattern: (_t = w.pat) !== null && _t !== void 0 ? _t : "shield",
                        initials: (_u = w.ini) !== null && _u !== void 0 ? _u : deriveInitials(w.tname),
                        symbol: (_v = w.sym) !== null && _v !== void 0 ? _v : null,
                    };
                    pid = w.player_id;
                    if (!watcherBadgesMap[pid])
                        watcherBadgesMap[pid] = [];
                    watcherBadgesMap[pid].push(badge);
                }
                _y.label = 9;
            case 9:
                speculations = speculationsRes.results.map(function (r) {
                    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
                    return ({
                        playerId: r.player_id,
                        playerName: "".concat(r.first_name, " ").concat(r.last_name),
                        playerAvatar: (function () { try {
                            return JSON.parse(r.player_avatar);
                        }
                        catch (e) {
                            logger_1.logger.warn({ module: "league" }, "parse spec avatar: ".concat(e));
                            return {};
                        } })(),
                        position: r.position,
                        overallRating: (_a = r.overall_rating) !== null && _a !== void 0 ? _a : 0,
                        currentTeamId: r.current_team_id,
                        currentTeamName: r.current_team_name,
                        currentTeamBadge: {
                            primary: (_c = (_b = r.cur_badge_primary) !== null && _b !== void 0 ? _b : r.cur_primary_color) !== null && _c !== void 0 ? _c : "#374151",
                            secondary: (_e = (_d = r.cur_badge_secondary) !== null && _d !== void 0 ? _d : r.cur_secondary_color) !== null && _e !== void 0 ? _e : "#9ca3af",
                            pattern: (_f = r.cur_badge_pattern) !== null && _f !== void 0 ? _f : "shield",
                            initials: (_g = r.cur_badge_initials) !== null && _g !== void 0 ? _g : deriveInitials(r.current_team_name),
                            symbol: (_h = r.cur_badge_symbol) !== null && _h !== void 0 ? _h : null,
                        },
                        watcherCount: (_j = r.watcher_count) !== null && _j !== void 0 ? _j : 0,
                        watcherBadges: (_k = watcherBadgesMap[r.player_id]) !== null && _k !== void 0 ? _k : [],
                        latestWatchedAt: r.latest_watched_at,
                    });
                });
                return [2 /*return*/, c.json({
                        stats: {
                            totalTransfers: totalTransfers,
                            totalValue: totalValue,
                            avgFee: avgFee,
                            freeAgentSignings: (_w = faRes === null || faRes === void 0 ? void 0 : faRes.cnt) !== null && _w !== void 0 ? _w : 0,
                            crossLeagueCount: crossLeagueCount,
                            crossLeagueAdminTotal: (_x = adminFeeRes === null || adminFeeRes === void 0 ? void 0 : adminFeeRes.total) !== null && _x !== void 0 ? _x : 0,
                        },
                        biggest: biggest,
                        topSellers: topSellers,
                        topBuyers: topBuyers,
                        mostActive: mostActive,
                        recent: recent,
                        speculations: speculations,
                    })];
        }
    });
}); });
