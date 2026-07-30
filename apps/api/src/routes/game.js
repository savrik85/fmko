"use strict";
/**
 * FMK-62: Game system API routes — tréninky, ekonomika, mládež, nábor.
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
exports.gameRouter = void 0;
var hono_1 = require("hono");
var rng_1 = require("../generators/rng");
var economy_1 = require("../season/economy");
var daily_tick_1 = require("../season/daily-tick");
var finance_processor_1 = require("../season/finance-processor");
var between_rounds_1 = require("../events/between-rounds");
var seasonal_events_1 = require("../season/seasonal-events");
var logger_1 = require("../lib/logger");
var season_1 = require("../lib/season");
var middleware_1 = require("../auth/middleware");
var player_view_1 = require("../transfers/player-view");
var gameRouter = new hono_1.Hono();
exports.gameRouter = gameRouter;
// ── Auth middleware ──────────────────────────────────────────────────────────
// Všechny write operace na týmových routách vyžadují ownership ověření.
gameRouter.use("/teams/:teamId/*", middleware_1.requireTeamOwnership);
// Admin operace vyžadují admin session.
gameRouter.use("/admin/*", middleware_1.requireAdmin);
gameRouter.use("/game/*", middleware_1.requireAdmin);
gameRouter.use("/leagues/:leagueId/generate-schedule", middleware_1.requireAdmin);
// ────────────────────────────────────────────────────────────────────────────
/** Send a system SMS to a team's phone (find-or-create conversation by role title). */
function sendPhoneSMS(db, teamId, senderName, roleTitle, body) {
    return __awaiter(this, void 0, void 0, function () {
        var convId;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db.prepare("SELECT id FROM conversations WHERE team_id = ? AND type = 'system' AND title = ?")
                        .bind(teamId, roleTitle).first().then(function (r) { return r === null || r === void 0 ? void 0 : r.id; }).catch(function (e) { logger_1.logger.warn({ module: "game" }, "db op failed", e); return null; })];
                case 1:
                    convId = _a.sent();
                    if (!!convId) return [3 /*break*/, 3];
                    convId = crypto.randomUUID();
                    return [4 /*yield*/, db.prepare("INSERT INTO conversations (id, team_id, type, title, pinned, unread_count, last_message_text, last_message_at, created_at) VALUES (?, ?, 'system', ?, 0, 0, '', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))")
                            .bind(convId, teamId, roleTitle).run().catch(function (e) { return logger_1.logger.warn({ module: "game" }, "db op failed", e); })];
                case 2:
                    _a.sent();
                    _a.label = 3;
                case 3: return [4 /*yield*/, db.prepare("INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, sent_at) VALUES (?, ?, 'system', ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))")
                        .bind(crypto.randomUUID(), convId, senderName, body).run().catch(function (e) { return logger_1.logger.warn({ module: "game" }, "db op failed", e); })];
                case 4:
                    _a.sent();
                    return [4 /*yield*/, db.prepare("UPDATE conversations SET unread_count = unread_count + 1, last_message_text = ?, last_message_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?")
                            .bind(body.slice(0, 100), convId).run().catch(function (e) { return logger_1.logger.warn({ module: "game" }, "db op failed", e); })];
                case 5:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/** After transfer: recalculate commute distance and reset squad number. */
function onPlayerTransferred(db, playerId, newTeamId) {
    return __awaiter(this, void 0, void 0, function () {
        var team, player, sameVillage, newCommute;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db.prepare("SELECT v.name, v.district, v.lat, v.lng FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?")
                        .bind(newTeamId).first().catch(function (e) { logger_1.logger.warn({ module: "game" }, "db op failed", e); return null; })];
                case 1:
                    team = _a.sent();
                    return [4 /*yield*/, db.prepare("SELECT residence, commute_km FROM players WHERE id = ?")
                            .bind(playerId).first().catch(function (e) { logger_1.logger.warn({ module: "game" }, "db op failed", e); return null; })];
                case 2:
                    player = _a.sent();
                    if (!(team && player)) return [3 /*break*/, 4];
                    sameVillage = player.residence === team.name;
                    newCommute = sameVillage ? 0 : Math.floor(5 + Math.random() * 15);
                    // trainingRest nemá cestovat s hráčem k novému týmu — volno dal starý trenér
                    return [4 /*yield*/, db.prepare("UPDATE players SET commute_km = ?, squad_number = NULL, life_context = json_remove(life_context, '$.trainingRest') WHERE id = ?")
                            .bind(newCommute, playerId).run().catch(function (e) { return logger_1.logger.warn({ module: "game" }, "db op failed", e); })];
                case 3:
                    // trainingRest nemá cestovat s hráčem k novému týmu — volno dal starý trenér
                    _a.sent();
                    return [3 /*break*/, 6];
                case 4: 
                // At minimum reset squad number
                return [4 /*yield*/, db.prepare("UPDATE players SET squad_number = NULL, life_context = json_remove(life_context, '$.trainingRest') WHERE id = ?")
                        .bind(playerId).run().catch(function (e) { return logger_1.logger.warn({ module: "game" }, "db op failed", e); })];
                case 5:
                    // At minimum reset squad number
                    _a.sent();
                    _a.label = 6;
                case 6: return [2 /*return*/];
            }
        });
    });
}
// GET /api/teams/:id/training — get training plan + simulate a session preview
gameRouter.get("/teams/:teamId/training", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, team, lastResult, trainingDays, parsed, restRows;
    var _a, _b, _c;
    return __generator(this, function (_d) {
        switch (_d.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, c.env.DB.prepare("SELECT training_type, training_approach, training_sessions, training_days, last_training_at, last_training_result FROM teams WHERE id = ?").bind(teamId).first().catch(function (e) { logger_1.logger.warn({ module: "game" }, "fetch training plan", e); return null; })];
            case 1:
                team = _d.sent();
                if (!team)
                    return [2 /*return*/, c.json({ error: "Team not found" }, 404)];
                lastResult = team.last_training_result
                    ? JSON.parse(team.last_training_result)
                    : null;
                trainingDays = null;
                if (team.training_days) {
                    try {
                        parsed = JSON.parse(team.training_days);
                        if (Array.isArray(parsed) && parsed.every(function (d) { return typeof d === "number" && d >= 1 && d <= 5; })) {
                            trainingDays = parsed;
                        }
                    }
                    catch (e) {
                        logger_1.logger.warn({ module: "game", teamId: teamId }, "parse training_days", e);
                    }
                }
                return [4 /*yield*/, c.env.DB.prepare("SELECT id FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active') AND json_extract(life_context, '$.trainingRest') = 1").bind(teamId).all()
                        .catch(function (e) { logger_1.logger.warn({ module: "game", teamId: teamId }, "load training rest players", e); return { results: [] }; })];
            case 2:
                restRows = _d.sent();
                return [2 /*return*/, c.json({
                        type: (_a = team.training_type) !== null && _a !== void 0 ? _a : "conditioning",
                        approach: (_b = team.training_approach) !== null && _b !== void 0 ? _b : "balanced",
                        sessionsPerWeek: (_c = team.training_sessions) !== null && _c !== void 0 ? _c : 2,
                        trainingDays: trainingDays,
                        restPlayerIds: restRows.results.map(function (r) { return r.id; }),
                        lastTrainingAt: team.last_training_at,
                        lastResult: lastResult,
                    })];
        }
    });
}); });
// POST /api/teams/:id/training — set training plan
gameRouter.post("/teams/:teamId/training", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, body, trainingDaysJson, validated;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, c.req.json()];
            case 1:
                body = _a.sent();
                trainingDaysJson = null;
                if (Array.isArray(body.trainingDays)) {
                    validated = Array.from(new Set(body.trainingDays.filter(function (d) { return typeof d === "number" && d >= 1 && d <= 5; }))).sort();
                    if (validated.length > 0) {
                        trainingDaysJson = JSON.stringify(validated);
                    }
                }
                return [4 /*yield*/, c.env.DB.prepare("UPDATE teams SET training_type = ?, training_approach = ?, training_sessions = ?, training_days = ? WHERE id = ?").bind(body.type, body.approach, body.sessionsPerWeek, trainingDaysJson, teamId).run().catch(function (e) { return logger_1.logger.warn({ module: "game" }, "update training plan", e); })];
            case 2:
                _a.sent();
                return [2 /*return*/, c.json({ ok: true })];
        }
    });
}); });
// POST /api/teams/:teamId/training-rest — volno z příštího tréninku pro vybrané hráče
gameRouter.post("/teams/:teamId/training-rest", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, body, playerIds, stmts, placeholders, e_1;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, c.req.json()
                        .catch(function (e) { logger_1.logger.warn({ module: "game", teamId: teamId }, "parse training-rest body", e); return null; })];
            case 1:
                body = _b.sent();
                if (!body || !Array.isArray(body.playerIds))
                    return [2 /*return*/, c.json({ error: "Chybí playerIds" }, 400)];
                playerIds = Array.from(new Set(body.playerIds.filter(function (id) { return typeof id === "string" && id.length > 0 && id.length <= 64; }))).slice(0, 60);
                stmts = [
                    c.env.DB.prepare("UPDATE players SET life_context = json_remove(life_context, '$.trainingRest') WHERE team_id = ? AND json_extract(life_context, '$.trainingRest') IS NOT NULL").bind(teamId),
                ];
                if (playerIds.length > 0) {
                    placeholders = playerIds.map(function () { return "?"; }).join(", ");
                    stmts.push((_a = c.env.DB.prepare("UPDATE players SET life_context = json_set(life_context, '$.trainingRest', 1) WHERE team_id = ? AND (status IS NULL OR status = 'active') AND id IN (".concat(placeholders, ")"))).bind.apply(_a, __spreadArray([teamId], playerIds, false)));
                }
                _b.label = 2;
            case 2:
                _b.trys.push([2, 4, , 5]);
                return [4 /*yield*/, c.env.DB.batch(stmts)];
            case 3:
                _b.sent();
                return [3 /*break*/, 5];
            case 4:
                e_1 = _b.sent();
                logger_1.logger.error({ module: "game", teamId: teamId }, "save training rest", e_1);
                return [2 /*return*/, c.json({ error: "Uložení volna se nepovedlo" }, 500)];
            case 5: return [2 /*return*/, c.json({ ok: true, count: playerIds.length })];
        }
    });
}); });
// Training simulation removed from manual endpoint — runs only via daily tick (cron)
// GET /api/teams/:teamId/players/:playerId/training-log — tréninkový vývoj hráče
gameRouter.get("/teams/:teamId/players/:playerId/training-log", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, playerId, rows;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                teamId = c.req.param("teamId");
                playerId = c.req.param("playerId");
                return [4 /*yield*/, c.env.DB.prepare("SELECT attribute, old_value, new_value, change, training_type, game_date, created_at FROM training_log WHERE player_id = ? AND team_id = ? ORDER BY created_at DESC LIMIT 50").bind(playerId, teamId).all().catch(function (e) { logger_1.logger.warn({ module: "game" }, "fetch training log", e); return { results: [] }; })];
            case 1:
                rows = _a.sent();
                return [2 /*return*/, c.json({ log: rows.results })];
        }
    });
}); });
// GET /api/teams/:teamId/players/:playerId/profile-extras — personality + relationships
gameRouter.get("/teams/:teamId/players/:playerId/profile-extras", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, playerId, _a, playerRow, relRows, personalityRaw, personality, relatedIds, relatedMap, placeholders, nameRows, _i, _b, r, EFFECT_MAP, TYPE_LABELS, relationships;
    var _c;
    var _d;
    return __generator(this, function (_e) {
        switch (_e.label) {
            case 0:
                teamId = c.req.param("teamId");
                playerId = c.req.param("playerId");
                return [4 /*yield*/, c.env.DB.batch([
                        c.env.DB.prepare("SELECT personality FROM players WHERE id = ?").bind(playerId),
                        c.env.DB.prepare("SELECT r.type, r.strength,\n              CASE WHEN r.player_a_id = ? THEN r.player_b_id ELSE r.player_a_id END as related_id\n       FROM relationships r\n       WHERE r.player_a_id = ? OR r.player_b_id = ?").bind(playerId, playerId, playerId),
                    ])];
            case 1:
                _a = _e.sent(), playerRow = _a[0], relRows = _a[1];
                personalityRaw = (_d = playerRow.results[0]) === null || _d === void 0 ? void 0 : _d.personality;
                personality = (function () {
                    try {
                        return typeof personalityRaw === "string" ? JSON.parse(personalityRaw) : (personalityRaw !== null && personalityRaw !== void 0 ? personalityRaw : {});
                    }
                    catch (e) {
                        logger_1.logger.warn({ module: "game" }, "parse player personality", e);
                        return {};
                    }
                })();
                relatedIds = relRows.results.map(function (r) { return r.related_id; }).filter(Boolean);
                relatedMap = {};
                if (!(relatedIds.length > 0)) return [3 /*break*/, 3];
                placeholders = relatedIds.map(function () { return "?"; }).join(",");
                return [4 /*yield*/, (_c = c.env.DB.prepare("SELECT id, first_name, last_name, position FROM players WHERE id IN (".concat(placeholders, ")"))).bind.apply(_c, relatedIds).all().catch(function (e) { logger_1.logger.warn({ module: "game" }, "fetch related player names", e); return { results: [] }; })];
            case 2:
                nameRows = _e.sent();
                for (_i = 0, _b = nameRows.results; _i < _b.length; _i++) {
                    r = _b[_i];
                    relatedMap[r.id] = { name: "".concat(r.first_name, " ").concat(r.last_name), position: r.position };
                }
                _e.label = 3;
            case 3:
                EFFECT_MAP = {
                    brothers: "+5 morálka když hrají spolu",
                    father_son: "+3 morálka, mentoring efekt",
                    in_laws: "Neutrální, občas třecí plochy",
                    classmates: "+2 chemie na tréninku",
                    coworkers: "+1 morálka, znají se z práce",
                    neighbors: "+1 morálka, společná cesta",
                    drinking_buddies: "+3 morálka, riziko absence po výhře",
                    rivals: "-2 morálka v sestavě, motivace k překonání",
                    mentor_pupil: "+5 vývoj mladšího hráče",
                };
                TYPE_LABELS = {
                    brothers: "Bratři",
                    father_son: "Otec a syn",
                    in_laws: "Příbuzní",
                    classmates: "Spolužáci",
                    coworkers: "Kolegové z práce",
                    neighbors: "Sousedi",
                    drinking_buddies: "Kamarádi z hospody",
                    rivals: "Rivalové",
                    mentor_pupil: "Mentor a žák",
                };
                relationships = relRows.results
                    .filter(function (r) { return relatedMap[r.related_id]; })
                    .map(function (r) {
                    var _a, _b, _c;
                    return ({
                        relatedPlayerId: r.related_id,
                        relatedPlayerName: relatedMap[r.related_id].name,
                        relatedPlayerPosition: relatedMap[r.related_id].position,
                        type: r.type,
                        typeLabel: (_a = TYPE_LABELS[r.type]) !== null && _a !== void 0 ? _a : r.type,
                        strength: (_b = r.strength) !== null && _b !== void 0 ? _b : 50,
                        effect: (_c = EFFECT_MAP[r.type]) !== null && _c !== void 0 ? _c : "",
                    });
                })
                    .sort(function (a, b) { return b.strength - a.strength; });
                return [2 /*return*/, c.json({ personality: personality, relationships: relationships })];
        }
    });
}); });
// GET /api/teams/:id/training-stats — aggregated training statistics
gameRouter.get("/teams/:teamId/training-stats", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, _a, totalsRes, topRes, breakdownRes, teamRow, totals, topImprovers, skillBreakdown, attRaw, attData, attPlayerIds, attNames, nameRows, _i, _b, r, attList, attendanceTop, attendanceBottom;
    var _c;
    var _d, _e, _f, _g, _h;
    return __generator(this, function (_j) {
        switch (_j.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, c.env.DB.batch([
                        // Total gains/losses
                        c.env.DB.prepare("SELECT SUM(CASE WHEN change > 0 THEN 1 ELSE 0 END) as gains,\n              SUM(CASE WHEN change < 0 THEN 1 ELSE 0 END) as losses,\n              COUNT(DISTINCT game_date) as sessions\n       FROM training_log WHERE team_id = ?").bind(teamId),
                        // Top improvers (join with players for name)
                        c.env.DB.prepare("SELECT tl.player_id, p.first_name, p.last_name, SUM(tl.change) as total_gains,\n              (SELECT tl2.attribute FROM training_log tl2 WHERE tl2.player_id = tl.player_id AND tl2.team_id = ? AND tl2.change > 0 GROUP BY tl2.attribute ORDER BY SUM(tl2.change) DESC LIMIT 1) as top_attr\n       FROM training_log tl JOIN players p ON tl.player_id = p.id\n       WHERE tl.team_id = ? AND tl.change > 0\n       GROUP BY tl.player_id ORDER BY total_gains DESC LIMIT 5").bind(teamId, teamId),
                        // Skill breakdown
                        c.env.DB.prepare("SELECT attribute,\n              SUM(CASE WHEN change > 0 THEN change ELSE 0 END) as gains,\n              SUM(CASE WHEN change < 0 THEN ABS(change) ELSE 0 END) as losses\n       FROM training_log WHERE team_id = ?\n       GROUP BY attribute ORDER BY gains DESC").bind(teamId),
                        // Attendance data
                        c.env.DB.prepare("SELECT training_attendance FROM teams WHERE id = ?").bind(teamId),
                    ])];
            case 1:
                _a = _j.sent(), totalsRes = _a[0], topRes = _a[1], breakdownRes = _a[2], teamRow = _a[3];
                totals = (_d = totalsRes.results[0]) !== null && _d !== void 0 ? _d : { gains: 0, losses: 0, sessions: 0 };
                topImprovers = topRes.results.map(function (r) { return ({
                    playerId: r.player_id,
                    name: "".concat(r.first_name, " ").concat(r.last_name),
                    totalGains: r.total_gains,
                    topAttribute: r.top_attr,
                }); });
                skillBreakdown = breakdownRes.results.map(function (r) { return ({
                    attribute: r.attribute,
                    gains: r.gains,
                    losses: r.losses,
                }); });
                attRaw = (_e = teamRow.results[0]) === null || _e === void 0 ? void 0 : _e.training_attendance;
                attData = (function () {
                    try {
                        return JSON.parse(attRaw !== null && attRaw !== void 0 ? attRaw : "{}");
                    }
                    catch (_a) {
                        return {};
                    }
                })();
                attPlayerIds = Object.keys(attData);
                attNames = {};
                if (!(attPlayerIds.length > 0)) return [3 /*break*/, 3];
                return [4 /*yield*/, (_c = c.env.DB.prepare("SELECT id, first_name, last_name FROM players WHERE id IN (".concat(attPlayerIds.map(function () { return "?"; }).join(","), ") AND team_id = ?"))).bind.apply(_c, __spreadArray(__spreadArray([], attPlayerIds, false), [teamId], false)).all().catch(function () { return ({ results: [] }); })];
            case 2:
                nameRows = _j.sent();
                for (_i = 0, _b = nameRows.results; _i < _b.length; _i++) {
                    r = _b[_i];
                    attNames[r.id] = "".concat(r.first_name, " ").concat(r.last_name);
                }
                _j.label = 3;
            case 3:
                attList = Object.entries(attData)
                    .filter(function (_a) {
                    var pid = _a[0];
                    return attNames[pid];
                }) // only current players
                    .map(function (_a) {
                    var pid = _a[0], d = _a[1];
                    return ({
                        playerId: pid,
                        name: attNames[pid],
                        attended: d.attended,
                        total: d.total,
                        pct: d.total > 0 ? Math.round((d.attended / d.total) * 100) : 0,
                    });
                });
                attendanceTop = __spreadArray([], attList, true).sort(function (a, b) { return b.pct - a.pct; }).slice(0, 5);
                attendanceBottom = __spreadArray([], attList, true).sort(function (a, b) { return a.pct - b.pct; }).slice(0, 5);
                return [2 /*return*/, c.json({
                        totalImprovements: (_f = totals.gains) !== null && _f !== void 0 ? _f : 0,
                        totalDeclines: (_g = totals.losses) !== null && _g !== void 0 ? _g : 0,
                        trainingSessions: (_h = totals.sessions) !== null && _h !== void 0 ? _h : 0,
                        topImprovers: topImprovers,
                        skillBreakdown: skillBreakdown,
                        attendanceTop: attendanceTop,
                        attendanceBottom: attendanceBottom,
                    })];
        }
    });
}); });
// GET /api/teams/:id/budget — rozpočet s kompletním přehledem
gameRouter.get("/teams/:teamId/budget", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, _a, mapVillageSize, countRemainingMatchDays, _b, teamResult, wageResult, sponsorContracts, topWages, team, category, wageRow, playerCount, weeklyWages, sponsors, rng, generated, reputation, WEEKS_PER_SEASON, weeklySponsorIncome, weeklyBaseSponsor, weeklySubsidies, weeklySubsidy, weeklyContributions, weeklyIncome, maintenanceCosts, weeklyMaintenance, weeklyEquipment, trainingPerSession, sessionsPerWeek, weeklyTraining, weeklyExpenses, weeklyNet, activeLoan, remainingInfo, matchDatesRows, _c, matchTimestamps, perMatchInstallment, installmentsRemaining, loanRemaining, now, WEEK_MS, loanDrainAfterWeeks, forecastSeries, in4Weeks, inSeason, bankruptIdx, weeksUntilBankrupt, weeklyLoanRepayment, effectiveWeeklyNet;
    var _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s;
    return __generator(this, function (_t) {
        switch (_t.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../season/finance-processor"); })];
            case 1:
                _a = _t.sent(), mapVillageSize = _a.mapVillageSize, countRemainingMatchDays = _a.countRemainingMatchDays;
                return [4 /*yield*/, c.env.DB.batch([
                        c.env.DB.prepare("SELECT t.*, v.name as village_name, v.size, v.population, v.district FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?").bind(teamId),
                        c.env.DB.prepare("SELECT COUNT(*) as cnt, COALESCE(SUM(weekly_wage), 0) as weekly_total FROM players WHERE team_id = ?").bind(teamId),
                        c.env.DB.prepare("SELECT sponsor_name, sponsor_type, monthly_amount, win_bonus FROM sponsor_contracts WHERE team_id = ? AND status = 'active'").bind(teamId),
                        c.env.DB.prepare("SELECT id, first_name, last_name, position, overall_rating, weekly_wage FROM players WHERE team_id = ? ORDER BY weekly_wage DESC LIMIT 5").bind(teamId),
                    ])];
            case 2:
                _b = _t.sent(), teamResult = _b[0], wageResult = _b[1], sponsorContracts = _b[2], topWages = _b[3];
                team = teamResult.results[0];
                if (!team)
                    return [2 /*return*/, c.json({ error: "Team not found" }, 404)];
                category = mapVillageSize(team.size);
                wageRow = wageResult.results[0];
                playerCount = (_d = wageRow === null || wageRow === void 0 ? void 0 : wageRow.cnt) !== null && _d !== void 0 ? _d : 0;
                weeklyWages = (_e = wageRow === null || wageRow === void 0 ? void 0 : wageRow.weekly_total) !== null && _e !== void 0 ? _e : 0;
                sponsors = sponsorContracts.results.map(function (s) { return ({
                    name: s.sponsor_name,
                    type: s.sponsor_type,
                    monthlyAmount: s.monthly_amount,
                    winBonus: s.win_bonus,
                }); });
                if (!(sponsors.length === 0)) return [3 /*break*/, 4];
                rng = (0, rng_1.createRng)(teamId.charCodeAt(0));
                return [4 /*yield*/, (0, economy_1.generateSponsors)(rng, team.size, team.reputation, team.district, c.env.DB)];
            case 3:
                generated = _t.sent();
                sponsors.push.apply(sponsors, generated);
                _t.label = 4;
            case 4:
                reputation = (_f = team.reputation) !== null && _f !== void 0 ? _f : 50;
                WEEKS_PER_SEASON = 16;
                weeklySponsorIncome = Math.round(sponsors.reduce(function (sum, s) { return sum + s.monthlyAmount; }, 0) / 4.3) * 2;
                weeklyBaseSponsor = Math.round((reputation * 100) / 4.3);
                weeklySubsidies = { vesnice: 1400, obec: 2300, mestys: 3500, mesto: 5800 };
                weeklySubsidy = (_g = weeklySubsidies[category]) !== null && _g !== void 0 ? _g : 2300;
                weeklyContributions = Math.round((playerCount * 100) / 4.3);
                weeklyIncome = weeklySponsorIncome + weeklyBaseSponsor + weeklySubsidy + weeklyContributions;
                maintenanceCosts = { vesnice: 115, obec: 230, mestys: 465, mesto: 700 };
                weeklyMaintenance = (_h = maintenanceCosts[category]) !== null && _h !== void 0 ? _h : 230;
                weeklyEquipment = 115;
                trainingPerSession = { vesnice: 200, obec: 400, mestys: 600, mesto: 1000 };
                sessionsPerWeek = (_j = team.training_sessions) !== null && _j !== void 0 ? _j : 2;
                weeklyTraining = ((_k = trainingPerSession[category]) !== null && _k !== void 0 ? _k : 400) * sessionsPerWeek;
                weeklyExpenses = weeklyWages + weeklyMaintenance + weeklyEquipment + weeklyTraining;
                weeklyNet = weeklyIncome - weeklyExpenses;
                return [4 /*yield*/, c.env.DB.prepare("SELECT id, principal, total_to_repay, remaining, total_installments, installments_paid, per_match_installment, status FROM cash_loans WHERE team_id = ? AND status = 'active' LIMIT 1").bind(teamId).first().catch(function (e) { logger_1.logger.warn({ module: "game" }, "load active cash loan", e); return null; })];
            case 5:
                activeLoan = _t.sent();
                return [4 /*yield*/, countRemainingMatchDays(c.env.DB, teamId)];
            case 6:
                remainingInfo = _t.sent();
                if (!remainingInfo.seasonId) return [3 /*break*/, 8];
                return [4 /*yield*/, c.env.DB.prepare("SELECT sc.scheduled_at FROM matches m\n         JOIN season_calendar sc ON m.calendar_id = sc.id\n         JOIN leagues l ON sc.league_id = l.id\n         WHERE l.season_id = ?\n           AND (m.home_team_id = ? OR m.away_team_id = ?)\n           AND m.status = 'scheduled'\n         ORDER BY sc.scheduled_at").bind(remainingInfo.seasonId, teamId, teamId).all()
                        .catch(function (e) { logger_1.logger.warn({ module: "game" }, "load scheduled match dates", e); return { results: [] }; })];
            case 7:
                _c = _t.sent();
                return [3 /*break*/, 9];
            case 8:
                _c = { results: [] };
                _t.label = 9;
            case 9:
                matchDatesRows = _c;
                matchTimestamps = ((_l = matchDatesRows.results) !== null && _l !== void 0 ? _l : [])
                    .map(function (r) { return new Date(r.scheduled_at).getTime(); })
                    .filter(function (t) { return !Number.isNaN(t); });
                perMatchInstallment = (_m = activeLoan === null || activeLoan === void 0 ? void 0 : activeLoan.per_match_installment) !== null && _m !== void 0 ? _m : 0;
                installmentsRemaining = activeLoan
                    ? activeLoan.total_installments - activeLoan.installments_paid
                    : 0;
                loanRemaining = (_o = activeLoan === null || activeLoan === void 0 ? void 0 : activeLoan.remaining) !== null && _o !== void 0 ? _o : 0;
                now = Date.now();
                WEEK_MS = 7 * 24 * 60 * 60 * 1000;
                loanDrainAfterWeeks = function (weeks) {
                    if (installmentsRemaining <= 0 || perMatchInstallment <= 0)
                        return 0;
                    var cutoff = now + weeks * WEEK_MS;
                    var matchesPlayedBy = matchTimestamps.filter(function (t) { return t <= cutoff; }).length;
                    var installments = Math.min(installmentsRemaining, matchesPlayedBy);
                    // Poslední splátka dorovnává zbytek (kvůli ceil zaokrouhlení při uzavření)
                    if (installments >= installmentsRemaining)
                        return loanRemaining;
                    return installments * perMatchInstallment;
                };
                forecastSeries = Array.from({ length: WEEKS_PER_SEASON + 1 }, function (_, w) { return ({
                    week: w,
                    budget: team.budget + weeklyNet * w - loanDrainAfterWeeks(w),
                }); });
                in4Weeks = (_q = (_p = forecastSeries[4]) === null || _p === void 0 ? void 0 : _p.budget) !== null && _q !== void 0 ? _q : team.budget;
                inSeason = (_s = (_r = forecastSeries[WEEKS_PER_SEASON]) === null || _r === void 0 ? void 0 : _r.budget) !== null && _s !== void 0 ? _s : team.budget;
                bankruptIdx = forecastSeries.findIndex(function (p, i) { return i > 0 && p.budget < 0; });
                weeksUntilBankrupt = bankruptIdx > 0 ? bankruptIdx : null;
                weeklyLoanRepayment = installmentsRemaining > 0 && matchTimestamps.length > 0
                    ? Math.round(loanRemaining / Math.max(1, Math.ceil((matchTimestamps[Math.min(matchTimestamps.length, installmentsRemaining) - 1] - now) / WEEK_MS)))
                    : 0;
                effectiveWeeklyNet = weeklyNet - weeklyLoanRepayment;
                return [2 /*return*/, c.json({
                        budget: team.budget,
                        sponsors: sponsors.map(function (s) { return (__assign(__assign({}, s), { weeklyAmount: Math.round(s.monthlyAmount / 4.3) })); }),
                        playerCount: playerCount,
                        wageBill: {
                            weekly: weeklyWages,
                            topPlayers: topWages.results.map(function (p) { return ({
                                id: p.id, name: "".concat(p.first_name, " ").concat(p.last_name),
                                position: p.position, rating: p.overall_rating, weeklyWage: p.weekly_wage,
                            }); }),
                        },
                        weekly: {
                            income: {
                                sponsors: weeklySponsorIncome, baseSponsor: weeklyBaseSponsor,
                                subsidy: weeklySubsidy, playerContributions: weeklyContributions,
                                total: weeklyIncome,
                            },
                            expenses: {
                                wages: weeklyWages, maintenance: weeklyMaintenance,
                                equipment: weeklyEquipment, training: weeklyTraining,
                                loanRepayment: weeklyLoanRepayment,
                                total: weeklyExpenses,
                            },
                            net: weeklyNet,
                            netWithLoan: effectiveWeeklyNet,
                        },
                        forecast: {
                            weeklyNet: effectiveWeeklyNet,
                            weeksUntilBankrupt: weeksUntilBankrupt,
                            in4Weeks: in4Weeks,
                            inSeason: inSeason,
                            series: forecastSeries,
                        },
                        loan: activeLoan ? {
                            id: activeLoan.id,
                            principal: activeLoan.principal,
                            totalToRepay: activeLoan.total_to_repay,
                            remaining: activeLoan.remaining,
                            totalInstallments: activeLoan.total_installments,
                            installmentsPaid: activeLoan.installments_paid,
                            installmentsRemaining: activeLoan.total_installments - activeLoan.installments_paid,
                            perMatchInstallment: activeLoan.per_match_installment,
                        } : null,
                        remainingMatches: remainingInfo.remainingMatches,
                        purchaseBlocked: team.budget < 0,
                    })];
        }
    });
}); });
// GET /api/teams/:teamId/transactions — finanční historie
gameRouter.get("/teams/:teamId/transactions", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, limit, offset, type, direction, query, bindings, result, countQuery, countBindings, total;
    var _a, _b;
    var _c, _d, _e, _f, _g;
    return __generator(this, function (_h) {
        switch (_h.label) {
            case 0:
                teamId = c.req.param("teamId");
                limit = parseInt((_c = c.req.query("limit")) !== null && _c !== void 0 ? _c : "50");
                offset = parseInt((_d = c.req.query("offset")) !== null && _d !== void 0 ? _d : "0");
                type = (_e = c.req.query("type")) !== null && _e !== void 0 ? _e : null;
                direction = (_f = c.req.query("direction")) !== null && _f !== void 0 ? _f : null;
                query = "SELECT * FROM transactions WHERE team_id = ?";
                bindings = [teamId];
                if (type) {
                    query += " AND type = ?";
                    bindings.push(type);
                }
                if (direction === "income") {
                    query += " AND amount > 0";
                }
                else if (direction === "expense") {
                    query += " AND amount < 0";
                }
                query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
                bindings.push(limit, offset);
                return [4 /*yield*/, (_a = c.env.DB.prepare(query)).bind.apply(_a, bindings).all().catch(function (e) { logger_1.logger.warn({ module: "game" }, "fetch transactions", e); return { results: [] }; })];
            case 1:
                result = _h.sent();
                countQuery = type
                    ? "SELECT COUNT(*) as cnt FROM transactions WHERE team_id = ? AND type = ?"
                    : "SELECT COUNT(*) as cnt FROM transactions WHERE team_id = ?";
                countBindings = type ? [teamId, type] : [teamId];
                return [4 /*yield*/, (_b = c.env.DB.prepare(countQuery)).bind.apply(_b, countBindings).first().catch(function (e) { logger_1.logger.warn({ module: "game" }, "count transactions", e); return { cnt: 0 }; })];
            case 2:
                total = _h.sent();
                return [2 /*return*/, c.json({
                        transactions: result.results.map(function (t) { return ({
                            id: t.id, type: t.type, amount: t.amount,
                            balanceAfter: t.balance_after, description: t.description,
                            referenceId: t.reference_id, gameDate: t.game_date, createdAt: t.created_at,
                        }); }),
                        total: (_g = total === null || total === void 0 ? void 0 : total.cnt) !== null && _g !== void 0 ? _g : 0,
                        limit: limit,
                        offset: offset,
                    })];
        }
    });
}); });
// GET /api/teams/:teamId/wages — přehled mezd hráčů
gameRouter.get("/teams/:teamId/wages", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, result, totalWeekly;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, c.env.DB.prepare("SELECT id, first_name, last_name, position, overall_rating, weekly_wage, age FROM players WHERE team_id = ? ORDER BY weekly_wage DESC").bind(teamId).all().catch(function (e) { logger_1.logger.warn({ module: "game" }, "fetch player wages", e); return { results: [] }; })];
            case 1:
                result = _a.sent();
                totalWeekly = result.results.reduce(function (s, p) { return s + p.weekly_wage; }, 0);
                return [2 /*return*/, c.json({
                        players: result.results.map(function (p) { return ({
                            id: p.id, name: "".concat(p.first_name, " ").concat(p.last_name),
                            position: p.position, rating: p.overall_rating,
                            age: p.age, weeklyWage: p.weekly_wage,
                        }); }),
                        totalWeekly: totalWeekly,
                        totalMonthly: Math.round(totalWeekly * 4.3),
                        playerCount: result.results.length,
                    })];
        }
    });
}); });
// GET /api/teams/:id/events — mezikolové události
gameRouter.get("/teams/:teamId/events", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, rng, team, playersResult, generatedPlayers, events;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                teamId = c.req.param("teamId");
                rng = (0, rng_1.createRng)((0, rng_1.cryptoSeed)());
                return [4 /*yield*/, c.env.DB.prepare("SELECT * FROM teams WHERE id = ?").bind(teamId).first()];
            case 1:
                team = _a.sent();
                if (!team)
                    return [2 /*return*/, c.json({ error: "Team not found" }, 404)];
                return [4 /*yield*/, c.env.DB.prepare("SELECT * FROM players WHERE team_id = ?").bind(teamId).all()];
            case 2:
                playersResult = _a.sent();
                generatedPlayers = playersResult.results.map(function (row) {
                    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z;
                    var r = row;
                    var skills = JSON.parse(r.skills);
                    var personality = JSON.parse(r.personality);
                    var lifeContext = JSON.parse(r.life_context);
                    var phys = r.physical ? JSON.parse(r.physical) : {};
                    return {
                        firstName: r.first_name, lastName: r.last_name,
                        age: r.age, position: r.position,
                        speed: (_a = skills.speed) !== null && _a !== void 0 ? _a : 50, technique: (_b = skills.technique) !== null && _b !== void 0 ? _b : 50,
                        shooting: (_c = skills.shooting) !== null && _c !== void 0 ? _c : 50, passing: (_d = skills.passing) !== null && _d !== void 0 ? _d : 50,
                        heading: (_e = skills.heading) !== null && _e !== void 0 ? _e : 50, defense: (_f = skills.defense) !== null && _f !== void 0 ? _f : 50,
                        goalkeeping: (_g = skills.goalkeeping) !== null && _g !== void 0 ? _g : 50,
                        stamina: (_j = (_h = phys.stamina) !== null && _h !== void 0 ? _h : skills.stamina) !== null && _j !== void 0 ? _j : 50,
                        strength: (_l = (_k = phys.strength) !== null && _k !== void 0 ? _k : skills.strength) !== null && _l !== void 0 ? _l : 50,
                        injuryProneness: (_m = personality.injuryProneness) !== null && _m !== void 0 ? _m : 50, discipline: (_o = personality.discipline) !== null && _o !== void 0 ? _o : 50,
                        patriotism: (_p = personality.patriotism) !== null && _p !== void 0 ? _p : 50, alcohol: (_q = personality.alcohol) !== null && _q !== void 0 ? _q : 30,
                        temper: (_r = personality.temper) !== null && _r !== void 0 ? _r : 40, occupation: (_s = lifeContext.occupation) !== null && _s !== void 0 ? _s : "",
                        bodyType: "normal", avatarConfig: {},
                        condition: (_t = lifeContext.condition) !== null && _t !== void 0 ? _t : 100, morale: (_u = lifeContext.morale) !== null && _u !== void 0 ? _u : 50,
                        preferredFoot: "right", preferredSide: "center",
                        leadership: (_v = personality.leadership) !== null && _v !== void 0 ? _v : 30, workRate: (_w = personality.workRate) !== null && _w !== void 0 ? _w : 50,
                        aggression: (_x = personality.aggression) !== null && _x !== void 0 ? _x : 40, consistency: (_y = personality.consistency) !== null && _y !== void 0 ? _y : 50,
                        clutch: (_z = personality.clutch) !== null && _z !== void 0 ? _z : 50,
                    };
                });
                events = (0, between_rounds_1.generateBetweenRoundEvents)(rng, generatedPlayers, team.budget, team.reputation, null, 1, team.district);
                return [2 /*return*/, c.json(events)];
        }
    });
}); });
// GET /api/teams/:id/seasonal-events — all seasonal events (pending = with choices, resolved = past)
gameRouter.get("/teams/:teamId/seasonal-events", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, team, seasonNum, seasonStr, _a, dbEventsRes, lastCalRes, dbEvents, currentGameWeek, events, rng, allEvents, week, weekEvents, idx, ev, id;
    var _b, _c;
    return __generator(this, function (_d) {
        switch (_d.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, c.env.DB.prepare("SELECT t.league_id, v.district FROM teams t JOIN villages v ON t.village_id=v.id WHERE t.id = ?").bind(teamId).first()];
            case 1:
                team = _d.sent();
                if (!(team === null || team === void 0 ? void 0 : team.league_id))
                    return [2 /*return*/, c.json({ events: [] })];
                return [4 /*yield*/, activeSeasonNumber(c.env.DB)];
            case 2:
                seasonNum = _d.sent();
                seasonStr = String(seasonNum);
                return [4 /*yield*/, c.env.DB.batch([
                        c.env.DB.prepare("SELECT * FROM seasonal_events WHERE league_id = ? AND season = ? ORDER BY game_week").bind(team.league_id, seasonStr),
                        c.env.DB.prepare("SELECT MAX(game_week) as gw FROM season_calendar WHERE league_id = ? AND status = 'simulated' AND season_number = ?").bind(team.league_id, seasonNum),
                    ])];
            case 3:
                _a = _d.sent(), dbEventsRes = _a[0], lastCalRes = _a[1];
                dbEvents = { results: dbEventsRes.results };
                currentGameWeek = (_c = (_b = lastCalRes.results[0]) === null || _b === void 0 ? void 0 : _b.gw) !== null && _c !== void 0 ? _c : 0;
                if (dbEvents.results.length > 0) {
                    events = dbEvents.results.map(function (row) { return ({
                        id: row.id,
                        type: row.type,
                        title: row.title,
                        description: row.description,
                        effects: JSON.parse(row.effects),
                        choices: row.choices ? JSON.parse(row.choices) : null,
                        gameWeek: row.game_week,
                        status: row.status,
                    }); });
                    return [2 /*return*/, c.json({ events: events, currentGameWeek: currentGameWeek })];
                }
                rng = (0, rng_1.createRng)(team.league_id.charCodeAt(0));
                allEvents = [];
                week = 0;
                _d.label = 4;
            case 4:
                if (!(week <= 30)) return [3 /*break*/, 9];
                weekEvents = (0, seasonal_events_1.getSeasonalEventsForWeek)(rng, week, team.district);
                idx = 0;
                _d.label = 5;
            case 5:
                if (!(idx < weekEvents.length)) return [3 /*break*/, 8];
                ev = weekEvents[idx];
                id = "se-".concat(team.league_id, "-s").concat(seasonStr, "-w").concat(week, "-").concat(idx);
                return [4 /*yield*/, c.env.DB.prepare("INSERT OR IGNORE INTO seasonal_events (id, league_id, type, title, description, effects, choices, season, game_week, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, team.league_id, ev.type, ev.title, ev.description, JSON.stringify(ev.effects), ev.choices ? JSON.stringify(ev.choices) : null, seasonStr, ev.gameWeek, ev.choices ? "pending" : "active").run().catch(function (e) { return logger_1.logger.warn({ module: "game" }, "insert seasonal event", e); })];
            case 6:
                _d.sent();
                allEvents.push(__assign(__assign({}, ev), { id: id, status: ev.choices ? "pending" : "active" }));
                _d.label = 7;
            case 7:
                idx++;
                return [3 /*break*/, 5];
            case 8:
                week++;
                return [3 /*break*/, 4];
            case 9: return [2 /*return*/, c.json({
                    events: allEvents.map(function (ev) {
                        var _a;
                        return ({
                            id: ev.id, type: ev.type, title: ev.title, description: ev.description,
                            effects: ev.effects, choices: (_a = ev.choices) !== null && _a !== void 0 ? _a : null,
                            gameWeek: ev.gameWeek, status: ev.status,
                        });
                    }),
                    currentGameWeek: currentGameWeek,
                })];
        }
    });
}); });
// POST /api/teams/:id/seasonal-events/:eventId/choose — make a choice
gameRouter.post("/teams/:teamId/seasonal-events/:eventId/choose", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, eventId, body, event, choices, choice, claimed, _i, _a, effect, desc;
    var _b, _c;
    return __generator(this, function (_d) {
        switch (_d.label) {
            case 0:
                teamId = c.req.param("teamId");
                eventId = c.req.param("eventId");
                return [4 /*yield*/, c.req.json()];
            case 1:
                body = _d.sent();
                return [4 /*yield*/, c.env.DB.prepare("SELECT * FROM seasonal_events WHERE id = ?")
                        .bind(eventId).first()];
            case 2:
                event = _d.sent();
                if (!event)
                    return [2 /*return*/, c.json({ error: "Event not found" }, 404)];
                if (event.status !== "pending")
                    return [2 /*return*/, c.json({ error: "Already resolved" }, 400)];
                choices = JSON.parse(event.choices);
                choice = choices.find(function (ch) { return ch.id === body.choiceId; });
                if (!choice)
                    return [2 /*return*/, c.json({ error: "Invalid choice" }, 400)];
                return [4 /*yield*/, c.env.DB.prepare("UPDATE seasonal_events SET status = 'resolved' WHERE id = ? AND status = 'pending'").bind(eventId).run().catch(function (e) { logger_1.logger.warn({ module: "game" }, "claim seasonal event", e); return { meta: { changes: 0 } }; })];
            case 3:
                claimed = _d.sent();
                if (claimed.meta.changes === 0)
                    return [2 /*return*/, c.json({ error: "Already resolved" }, 400)];
                _i = 0, _a = choice.effects;
                _d.label = 4;
            case 4:
                if (!(_i < _a.length)) return [3 /*break*/, 23];
                effect = _a[_i];
                if (!(effect.type === "budget")) return [3 /*break*/, 6];
                return [4 /*yield*/, (0, finance_processor_1.recordTransaction)(c.env.DB, teamId, "event", effect.value, "Ud\u00E1lost: ".concat((_b = choice.text) !== null && _b !== void 0 ? _b : "efekt"), new Date().toISOString()).catch(function (e) { return logger_1.logger.warn({ module: "game" }, "record event transaction", e); })];
            case 5:
                _d.sent();
                _d.label = 6;
            case 6:
                if (!(effect.type === "reputation")) return [3 /*break*/, 8];
                return [4 /*yield*/, c.env.DB.prepare("UPDATE teams SET reputation = MIN(100, MAX(0, reputation + ?)) WHERE id = ?")
                        .bind(effect.value, teamId).run().catch(function (e) { return logger_1.logger.warn({ module: "game" }, "update reputation from event", e); })];
            case 7:
                _d.sent();
                _d.label = 8;
            case 8:
                if (!(effect.type === "morale")) return [3 /*break*/, 10];
                return [4 /*yield*/, c.env.DB.prepare("UPDATE players SET life_context = json_set(life_context, '$.morale',\n          MIN(100, MAX(0, json_extract(life_context, '$.morale') + ?)))\n        WHERE team_id = ?").bind(effect.value, teamId).run().catch(function (e) { return logger_1.logger.warn({ module: "game" }, "update morale from event", e); })];
            case 9:
                _d.sent();
                _d.label = 10;
            case 10:
                if (!(effect.type === "stamina_boost")) return [3 /*break*/, 12];
                return [4 /*yield*/, c.env.DB.prepare("UPDATE players SET skills = json_set(skills, '$.stamina', MIN(100, json_extract(skills, '$.stamina') + ?)) WHERE team_id = ?").bind(effect.value, teamId).run().catch(function (e) { return logger_1.logger.warn({ module: "game" }, "apply stamina boost", e); })];
            case 11:
                _d.sent();
                _d.label = 12;
            case 12:
                if (!(effect.type === "experience")) return [3 /*break*/, 14];
                return [4 /*yield*/, c.env.DB.prepare("UPDATE players SET skills = json_set(skills, '$.experience', MIN(100, COALESCE(json_extract(skills, '$.experience'), 0) + ?)) WHERE team_id = ?").bind(effect.value, teamId).run().catch(function (e) { return logger_1.logger.warn({ module: "game" }, "apply experience event", e); })];
            case 13:
                _d.sent();
                _d.label = 14;
            case 14:
                if (!(effect.type === "alcohol_event")) return [3 /*break*/, 17];
                // Increase alcohol-prone players' next absence chance by reducing condition
                return [4 /*yield*/, c.env.DB.prepare("INSERT INTO condition_log (player_id, team_id, old_value, new_value, delta, source, description)\n         SELECT id, team_id,\n           json_extract(life_context, '$.condition'),\n           MAX(10, json_extract(life_context, '$.condition') - 20),\n           MAX(10, json_extract(life_context, '$.condition') - 20) - json_extract(life_context, '$.condition'),\n           'event', 'Alkoholov\u00E1 ud\u00E1lost (pijani)'\n         FROM players\n         WHERE team_id = ? AND json_extract(personality, '$.alcohol') > 50\n           AND json_extract(life_context, '$.condition') IS NOT NULL").bind(teamId).run().catch(function (e) { return logger_1.logger.warn({ module: "game" }, "log alcohol event", e); })];
            case 15:
                // Increase alcohol-prone players' next absence chance by reducing condition
                _d.sent();
                return [4 /*yield*/, c.env.DB.prepare("UPDATE players SET life_context = json_set(life_context, '$.condition', MAX(10, json_extract(life_context, '$.condition') - 20))\n        WHERE team_id = ? AND json_extract(personality, '$.alcohol') > 50").bind(teamId).run().catch(function (e) { return logger_1.logger.warn({ module: "game" }, "apply alcohol event", e); })];
            case 16:
                _d.sent();
                _d.label = 17;
            case 17:
                if (!(effect.type === "condition")) return [3 /*break*/, 20];
                desc = "Ud\u00E1lost: ".concat((_c = choice.text) !== null && _c !== void 0 ? _c : "kondice");
                return [4 /*yield*/, c.env.DB.prepare("INSERT INTO condition_log (player_id, team_id, old_value, new_value, delta, source, description)\n         SELECT id, team_id,\n           json_extract(life_context, '$.condition'),\n           MIN(100, MAX(0, json_extract(life_context, '$.condition') + ?)),\n           MIN(100, MAX(0, json_extract(life_context, '$.condition') + ?)) - json_extract(life_context, '$.condition'),\n           'event', ?\n         FROM players\n         WHERE team_id = ? AND json_extract(life_context, '$.condition') IS NOT NULL").bind(effect.value, effect.value, desc, teamId).run().catch(function (e) { return logger_1.logger.warn({ module: "game" }, "log condition event", e); })];
            case 18:
                _d.sent();
                return [4 /*yield*/, c.env.DB.prepare("UPDATE players SET life_context = json_set(life_context, '$.condition',\n          MIN(100, MAX(0, json_extract(life_context, '$.condition') + ?)))\n        WHERE team_id = ?").bind(effect.value, teamId).run().catch(function (e) { return logger_1.logger.warn({ module: "game" }, "update condition from event", e); })];
            case 19:
                _d.sent();
                _d.label = 20;
            case 20:
                if (!(effect.type === "pitch_condition")) return [3 /*break*/, 22];
                return [4 /*yield*/, c.env.DB.prepare("UPDATE stadiums SET pitch_condition = MIN(100, MAX(0, pitch_condition + ?)) WHERE team_id = ?").bind(effect.value, teamId).run().catch(function (e) { return logger_1.logger.warn({ module: "game" }, "update pitch condition from event", e); })];
            case 21:
                _d.sent();
                _d.label = 22;
            case 22:
                _i++;
                return [3 /*break*/, 4];
            case 23: return [2 /*return*/, c.json({ ok: true, appliedEffects: choice.effects })];
        }
    });
}); });
// POST /api/teams/:id/pub-visit — vzít kluky do hospody (cooldown 2 herní dny)
gameRouter.post("/teams/:teamId/pub-visit", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, body, team, lastVisit, lastDate, gameDate_1, daysDiff, gameDate, createCoachLedSession, result, cost, _a, _b, _c, _d;
    return __generator(this, function (_e) {
        switch (_e.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, c.req.json()];
            case 1:
                body = _e.sent();
                return [4 /*yield*/, c.env.DB.prepare("SELECT game_date FROM teams WHERE id = ?")
                        .bind(teamId).first()];
            case 2:
                team = _e.sent();
                if (!team)
                    return [2 /*return*/, c.json({ error: "Team not found" }, 404)];
                return [4 /*yield*/, c.env.DB.prepare("SELECT created_at FROM seasonal_events WHERE league_id = (SELECT league_id FROM teams WHERE id = ?) AND type = 'hospoda_action' ORDER BY created_at DESC LIMIT 1").bind(teamId).first().catch(function (e) { logger_1.logger.warn({ module: "game" }, "db op failed", e); return null; })];
            case 3:
                lastVisit = _e.sent();
                if (lastVisit) {
                    lastDate = new Date(lastVisit.created_at).getTime();
                    gameDate_1 = new Date(team.game_date).getTime();
                    daysDiff = (gameDate_1 - lastDate) / (1000 * 60 * 60 * 24);
                    if (daysDiff < 2) {
                        return [2 /*return*/, c.json({ error: "Hospoda je dostupná jednou za 2 dny", cooldown: true }, 400)];
                    }
                }
                gameDate = team.game_date.slice(0, 10);
                if (!(body.choice === "no")) return [3 /*break*/, 5];
                // Trenér zakázal hospodu — žádná pub_session, jen morale penalty.
                return [4 /*yield*/, c.env.DB.prepare("UPDATE players SET life_context = json_set(life_context, '$.morale', MIN(100, MAX(0, json_extract(life_context, '$.morale') - 3))) WHERE team_id = ?").bind(teamId).run().catch(function (e) { return logger_1.logger.warn({ module: "game" }, "apply no-pub morale penalty", e); })];
            case 4:
                // Trenér zakázal hospodu — žádná pub_session, jen morale penalty.
                _e.sent();
                return [3 /*break*/, 9];
            case 5: return [4 /*yield*/, Promise.resolve().then(function () { return require("../season/pub"); })];
            case 6:
                createCoachLedSession = (_e.sent()).createCoachLedSession;
                return [4 /*yield*/, createCoachLedSession(c.env.DB, teamId, gameDate, body.choice)];
            case 7:
                result = _e.sent();
                if (!result.ok)
                    return [2 /*return*/, c.json({ error: result.reason }, 400)];
                cost = body.choice === "all" ? -1500 : -500;
                return [4 /*yield*/, (0, finance_processor_1.recordTransaction)(c.env.DB, teamId, "event", cost, "Hospoda", team.game_date)
                        .catch(function (e) { return logger_1.logger.warn({ module: "game" }, "record pub cost", e); })];
            case 8:
                _e.sent();
                _e.label = 9;
            case 9:
                _b = (_a = c.env.DB.prepare("INSERT INTO seasonal_events (id, league_id, type, title, description, effects, season, game_week, status, created_at) VALUES (?, (SELECT league_id FROM teams WHERE id = ?), 'hospoda_action', 'Posezení v hospodě', ?, '[]', ?, 0, 'resolved', ?)")).bind;
                _c = [crypto.randomUUID(), teamId,
                    body.choice === "all" ? "Celý tým šel do hospody" : body.choice === "one" ? "Jen jedno pivo" : "Trenér zakázal hospodu"];
                _d = String;
                return [4 /*yield*/, activeSeasonNumber(c.env.DB)];
            case 10: 
            // Cooldown event
            return [4 /*yield*/, _b.apply(_a, _c.concat([_d.apply(void 0, [_e.sent()]),
                    team.game_date])).run().catch(function (e) { return logger_1.logger.warn({ module: "game" }, "record pub cooldown event", e); })];
            case 11:
                // Cooldown event
                _e.sent();
                return [2 /*return*/, c.json({ ok: true, choice: body.choice })];
        }
    });
}); });
// GET /api/teams/:id/pub-status — cooldown check
gameRouter.get("/teams/:teamId/pub-status", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, team, lastVisit, daysDiff;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, c.env.DB.prepare("SELECT game_date FROM teams WHERE id = ?")
                        .bind(teamId).first()];
            case 1:
                team = _a.sent();
                if (!team)
                    return [2 /*return*/, c.json({ available: false })];
                return [4 /*yield*/, c.env.DB.prepare("SELECT created_at FROM seasonal_events WHERE league_id = (SELECT league_id FROM teams WHERE id = ?) AND type = 'hospoda_action' ORDER BY created_at DESC LIMIT 1").bind(teamId).first().catch(function (e) { logger_1.logger.warn({ module: "game" }, "db op failed", e); return null; })];
            case 2:
                lastVisit = _a.sent();
                if (!lastVisit)
                    return [2 /*return*/, c.json({ available: true })];
                daysDiff = (new Date(team.game_date).getTime() - new Date(lastVisit.created_at).getTime()) / (1000 * 60 * 60 * 24);
                return [2 /*return*/, c.json({ available: daysDiff >= 2, daysLeft: Math.max(0, Math.ceil(2 - daysDiff)) })];
        }
    });
}); });
// POST /api/teams/:id/youth — nastavit investici do mládeže
gameRouter.post("/teams/:teamId/youth", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var body, costs, cost;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0: return [4 /*yield*/, c.req.json()];
            case 1:
                body = _b.sent();
                costs = { none: 0, minimal: 500, medium: 2000, high: 5000 };
                cost = (_a = costs[body.investment]) !== null && _a !== void 0 ? _a : 0;
                return [2 /*return*/, c.json({
                        ok: true,
                        investment: body.investment,
                        monthlyCost: cost,
                        message: cost === 0
                            ? "Mládežnická akademie zrušena."
                            : "Investice do ml\u00E1de\u017Ee: ".concat(cost, " K\u010D/m\u011Bs\u00EDc."),
                    })];
        }
    });
}); });
// POST /api/teams/:id/recruit — aktivní nábor
gameRouter.post("/teams/:teamId/recruit", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var body, rng, actions, action, success;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, c.req.json()];
            case 1:
                body = _a.sent();
                rng = (0, rng_1.createRng)((0, rng_1.cryptoSeed)());
                actions = {
                    poster: { cost: 200, prob: 0.15, desc: "Plakát na obecní nástěnce" },
                    newsletter: { cost: 500, prob: 0.25, desc: "Inzerát v obecním zpravodaji" },
                    visit: { cost: 1500, prob: 0.4, desc: "Objíždění sousedních vesnic" },
                };
                action = actions[body.action];
                if (!action)
                    return [2 /*return*/, c.json({ error: "Unknown action" }, 400)];
                success = rng.random() < action.prob;
                return [2 /*return*/, c.json({
                        success: success,
                        cost: action.cost,
                        message: success
                            ? "".concat(action.desc, " \u2014 n\u011Bkdo se ozval! Nov\u00FD hr\u00E1\u010D chce p\u0159ij\u00EDt.")
                            : "".concat(action.desc, " \u2014 bohu\u017Eel se nikdo neozval."),
                    })];
        }
    });
}); });
// GET /api/teams/:id/news — obecní zpravodaj / news feed
gameRouter.get("/teams/:teamId/news", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, _a, teamRes, matchesRes, team, matchRows, articles, _i, matchRows_1, m, isHome, myScore, theirScore, opponent, won, drew, headline, icon, getTeamPosition, pos, newsRows, pinnedRows, seenNewsIds_1, combinedRows, _b, combinedRows_1, n, iconMap;
    var _c, _d;
    return __generator(this, function (_e) {
        switch (_e.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, c.env.DB.batch([
                        c.env.DB.prepare("SELECT t.name, t.league_id, t.reputation FROM teams t WHERE t.id = ?").bind(teamId),
                        c.env.DB.prepare("SELECT m.id, m.home_score, m.away_score, m.simulated_at, m.round,\n       ht.name as home_name, at.name as away_name,\n       m.home_team_id, m.away_team_id\n     FROM matches m\n     JOIN teams ht ON m.home_team_id = ht.id\n     JOIN teams at ON m.away_team_id = at.id\n     WHERE (m.home_team_id = ? OR m.away_team_id = ?) AND m.status = 'simulated'\n     ORDER BY m.simulated_at DESC LIMIT 5").bind(teamId, teamId),
                    ])];
            case 1:
                _a = _e.sent(), teamRes = _a[0], matchesRes = _a[1];
                team = teamRes.results[0];
                if (!team)
                    return [2 /*return*/, c.json({ error: "Team not found" }, 404)];
                matchRows = matchesRes.results;
                articles = [];
                for (_i = 0, matchRows_1 = matchRows; _i < matchRows_1.length; _i++) {
                    m = matchRows_1[_i];
                    isHome = m.home_team_id === teamId;
                    myScore = isHome ? m.home_score : m.away_score;
                    theirScore = isHome ? m.away_score : m.home_score;
                    opponent = isHome ? m.away_name : m.home_name;
                    won = myScore > theirScore;
                    drew = myScore === theirScore;
                    headline = void 0;
                    icon = void 0;
                    if (won) {
                        headline = "".concat(team.name, " por\u00E1\u017E\u00ED ").concat(opponent, " ").concat(m.home_score, ":").concat(m.away_score, "!");
                        icon = "\uD83C\uDFC6";
                    }
                    else if (drew) {
                        headline = "Rem\u00EDza ".concat(m.home_score, ":").concat(m.away_score, " s ").concat(opponent);
                        icon = "\uD83E\uDD1D";
                    }
                    else {
                        headline = "".concat(team.name, " padl s ").concat(opponent, " ").concat(m.home_score, ":").concat(m.away_score);
                        icon = "\uD83D\uDE14";
                    }
                    articles.push({
                        id: m.id,
                        type: "match",
                        headline: headline,
                        body: "".concat(m.round ? m.round + ". kolo — " : "").concat(isHome ? "Domácí zápas" : "Venku", ". ").concat(won ? "Fanoušci slaví!" : drew ? "Spravedlivá dělba bodů." : "Příště to bude lepší."),
                        icon: icon,
                        date: (_c = m.simulated_at) !== null && _c !== void 0 ? _c : "",
                    });
                }
                if (!team.league_id) return [3 /*break*/, 4];
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../stats/standings"); })];
            case 2:
                getTeamPosition = (_e.sent()).getTeamPosition;
                return [4 /*yield*/, getTeamPosition(c.env.DB, team.league_id, teamId)];
            case 3:
                pos = _e.sent();
                if (pos > 0) {
                    articles.push({
                        id: "standing",
                        type: "standing",
                        headline: "".concat(team.name, " je na ").concat(pos, ". m\u00EDst\u011B v tabulce"),
                        body: "Aktu\u00E1ln\u00ED pozice v okresn\u00EDm p\u0159eboru.",
                        icon: "\uD83D\uDCCA",
                        date: new Date().toISOString(),
                    });
                }
                _e.label = 4;
            case 4:
                if (!team.league_id) return [3 /*break*/, 7];
                return [4 /*yield*/, c.env.DB.prepare("SELECT n.id, n.type, n.headline, n.body, n.game_week, n.created_at, ur.photos_json FROM news n\n       LEFT JOIN matches m ON n.match_id = m.id AND n.type = 'promotion'\n       LEFT JOIN ultras_reports ur ON ur.news_id = n.id\n       WHERE (n.league_id = ? OR n.team_id = ?)\n         AND (n.type != 'promotion' OR COALESCE(m.status, 'upcoming') != 'simulated')\n       ORDER BY n.created_at DESC LIMIT 20").bind(team.league_id, teamId).all().catch(function (e) { logger_1.logger.warn({ module: "game" }, "fetch news articles", e); return { results: [] }; })];
            case 5:
                newsRows = _e.sent();
                return [4 /*yield*/, c.env.DB.prepare("SELECT id, type, headline, body, game_week, created_at FROM news\n       WHERE league_id = ? AND type IN ('season_opener', 'season_wrap')\n         AND created_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days')\n       ORDER BY created_at DESC LIMIT 2").bind(team.league_id).all().catch(function (e) { logger_1.logger.warn({ module: "game" }, "fetch pinned season news", e); return { results: [] }; })];
            case 6:
                pinnedRows = _e.sent();
                seenNewsIds_1 = new Set();
                combinedRows = __spreadArray(__spreadArray([], newsRows.results, true), pinnedRows.results, true).filter(function (n) {
                    var id = n.id;
                    if (seenNewsIds_1.has(id))
                        return false;
                    seenNewsIds_1.add(id);
                    return true;
                });
                for (_b = 0, combinedRows_1 = combinedRows; _b < combinedRows_1.length; _b++) {
                    n = combinedRows_1[_b];
                    iconMap = {
                        manager_arrival: "\uD83D\uDCCB",
                        round_results: "\u26BD",
                        seasonal: "\uD83C\uDF89",
                        municipal_elections: "\uD83D\uDDF3\uFE0F",
                        transfer: "\uD83E\uDD1D",
                        celebrity_arrival: "\uD83C\uDF1F",
                        celebrity_signing: "\uD83D\uDCDD",
                        ai_report: "\u270D\uFE0F",
                        promotion: "\uD83D\uDCE2",
                        interview: "\uD83C\uDF99\uFE0F",
                        player_interview: "\uD83C\uDFA4",
                        manager_feud: "\uD83D\uDDE3\uFE0F",
                        season_wrap: "\uD83C\uDFC1",
                        season_opener: "\uD83C\uDFBA",
                        season_awards: "\uD83C\uDFC6",
                        legend_farewell: "\uD83C\uDF96\uFE0F",
                        ultras_report: "\uD83D\uDD25",
                    };
                    articles.push({
                        id: n.id,
                        type: n.type,
                        headline: n.headline,
                        body: n.body,
                        icon: (_d = iconMap[n.type]) !== null && _d !== void 0 ? _d : "\uD83D\uDCF0",
                        date: n.created_at,
                        gameWeek: n.game_week,
                        photos: n.photos_json ? JSON.parse(n.photos_json) : undefined,
                    });
                }
                _e.label = 7;
            case 7:
                // Sort by date
                articles.sort(function (a, b) { return new Date(b.date).getTime() - new Date(a.date).getTime(); });
                return [2 /*return*/, c.json({ articles: articles })];
        }
    });
}); });
// GET /api/teams/:id/transfers — generate transfer offers + departure risks
gameRouter.get("/teams/:teamId/transfers", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, team, playersResult, squad, _a, generateTransferOffers, checkDepartureRisks, weekSeed, rng, villageInfo, surnameData, firstnameData, offers, risks, enrichedRisks, POS_LABELS, enrichedOffers;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, c.env.DB.prepare("SELECT t.*, v.name as village_name, v.size, v.population, v.region as region_code FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?").bind(teamId).first()];
            case 1:
                team = _b.sent();
                if (!team)
                    return [2 /*return*/, c.json({ error: "Team not found" }, 404)];
                return [4 /*yield*/, c.env.DB.prepare("SELECT * FROM players WHERE team_id = ?").bind(teamId).all()];
            case 2:
                playersResult = _b.sent();
                squad = playersResult.results.map(function (row) {
                    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
                    var skills = JSON.parse(row.skills);
                    var personality = JSON.parse(row.personality);
                    var lifeContext = JSON.parse(row.life_context);
                    var physical = row.physical ? JSON.parse(row.physical) : {};
                    return {
                        firstName: row.first_name, lastName: row.last_name,
                        age: row.age, position: row.position,
                        speed: skills.speed, technique: skills.technique, shooting: skills.shooting,
                        passing: skills.passing, heading: skills.heading, defense: skills.defense,
                        goalkeeping: skills.goalkeeping,
                        stamina: (_b = (_a = physical.stamina) !== null && _a !== void 0 ? _a : skills.stamina) !== null && _b !== void 0 ? _b : 50,
                        strength: (_d = (_c = physical.strength) !== null && _c !== void 0 ? _c : skills.strength) !== null && _d !== void 0 ? _d : 50,
                        injuryProneness: (_e = personality.injuryProneness) !== null && _e !== void 0 ? _e : 50, discipline: personality.discipline,
                        patriotism: personality.patriotism, alcohol: personality.alcohol,
                        temper: personality.temper, occupation: lifeContext.occupation,
                        bodyType: "normal", avatarConfig: {},
                        condition: (_f = lifeContext.condition) !== null && _f !== void 0 ? _f : 100, morale: (_g = lifeContext.morale) !== null && _g !== void 0 ? _g : 50,
                        preferredFoot: "right", preferredSide: "center",
                        leadership: (_h = personality.leadership) !== null && _h !== void 0 ? _h : 30, workRate: (_j = personality.workRate) !== null && _j !== void 0 ? _j : 50,
                        aggression: (_k = personality.aggression) !== null && _k !== void 0 ? _k : 40, consistency: (_l = personality.consistency) !== null && _l !== void 0 ? _l : 50,
                        clutch: (_m = personality.clutch) !== null && _m !== void 0 ? _m : 50,
                    };
                });
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../transfers/transfer-system"); })];
            case 3:
                _a = _b.sent(), generateTransferOffers = _a.generateTransferOffers, checkDepartureRisks = _a.checkDepartureRisks;
                weekSeed = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
                rng = (0, rng_1.createRng)(weekSeed + teamId.charCodeAt(0));
                villageInfo = {
                    region_code: team.region_code,
                    category: team.size,
                    population: team.population,
                };
                surnameData = { surnames: { "Novák": 10, "Dvořák": 8, "Svoboda": 7, "Černý": 6, "Procházka": 5, "Kučera": 5, "Veselý": 4, "Horák": 4, "Němec": 3, "Marek": 3 }, female_forms: {} };
                firstnameData = { male: { "0-100": { "Jan": 10, "Petr": 8, "Martin": 7, "Tomáš": 6, "David": 5, "Jakub": 5, "Ondřej": 4, "Filip": 4, "Adam": 3, "Lukáš": 3 } }, female: {} };
                offers = generateTransferOffers(rng, villageInfo, team.reputation, squad.length, surnameData, firstnameData, squad);
                risks = checkDepartureRisks(rng, squad);
                enrichedRisks = risks.map(function (r) {
                    var _a;
                    return (__assign(__assign({}, r), { playerId: (_a = playersResult.results[r.playerIndex]) === null || _a === void 0 ? void 0 : _a.id, playerName: "".concat(squad[r.playerIndex].firstName, " ").concat(squad[r.playerIndex].lastName) }));
                });
                POS_LABELS = { GK: "BRA", DEF: "OBR", MID: "ZÁL", FWD: "ÚTO" };
                enrichedOffers = offers.map(function (o) {
                    var _a;
                    return ({
                        channel: o.channel,
                        description: o.description,
                        cost: o.cost,
                        expiresInRounds: o.expiresInRounds,
                        player: {
                            firstName: o.player.firstName,
                            lastName: o.player.lastName,
                            age: o.player.age,
                            position: o.player.position,
                            positionLabel: (_a = POS_LABELS[o.player.position]) !== null && _a !== void 0 ? _a : o.player.position,
                            occupation: o.player.occupation,
                        },
                    });
                });
                return [2 /*return*/, c.json({ offers: enrichedOffers, departureRisks: enrichedRisks })];
        }
    });
}); });
// GET /api/teams/:id/equipment — get equipment (auto-create if missing)
gameRouter.get("/teams/:teamId/equipment", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, _a, generateEquipment, getUpgradeOptions, getRepairOptions, getLevelDescription, calculateEffects, CATEGORIES, CATEGORY_LABELS, equip, team_1, seed, i, rng, config_1, cols, condCols, vals, condVals, placeholders, _b, teamRes, matchCountRes, seasonRes, team, matchCount, seasonNum, levels, conditions, categories, _i, CATEGORIES_1, cat, lv, cond, effects;
    var _c;
    var _d, _e, _f, _g, _h, _j;
    return __generator(this, function (_k) {
        switch (_k.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../equipment/equipment-generator"); })];
            case 1:
                _a = _k.sent(), generateEquipment = _a.generateEquipment, getUpgradeOptions = _a.getUpgradeOptions, getRepairOptions = _a.getRepairOptions, getLevelDescription = _a.getLevelDescription, calculateEffects = _a.calculateEffects, CATEGORIES = _a.CATEGORIES, CATEGORY_LABELS = _a.CATEGORY_LABELS;
                return [4 /*yield*/, c.env.DB.prepare("SELECT * FROM equipment WHERE team_id = ?").bind(teamId).first().catch(function (e) { logger_1.logger.warn({ module: "game" }, "fetch equipment", e); return null; })];
            case 2:
                equip = _k.sent();
                if (!!equip) return [3 /*break*/, 6];
                return [4 /*yield*/, c.env.DB.prepare("SELECT v.size FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?").bind(teamId).first().catch(function (e) { logger_1.logger.warn({ module: "game" }, "fetch team size for equipment", e); return null; })];
            case 3:
                team_1 = _k.sent();
                seed = 0;
                for (i = 0; i < teamId.length; i++)
                    seed = ((seed << 5) - seed + teamId.charCodeAt(i)) | 0;
                rng = (0, rng_1.createRng)(Math.abs(seed) + 99);
                config_1 = generateEquipment(rng, (_d = team_1 === null || team_1 === void 0 ? void 0 : team_1.size) !== null && _d !== void 0 ? _d : "obec");
                cols = CATEGORIES.map(function (c) { return c; }).join(", ");
                condCols = CATEGORIES.map(function (c) { return "".concat(c, "_condition"); }).join(", ");
                vals = CATEGORIES.map(function (c) { var _a; return (_a = config_1[c]) !== null && _a !== void 0 ? _a : 0; });
                condVals = CATEGORIES.map(function (c) { var _a; return (_a = config_1["".concat(c, "_condition")]) !== null && _a !== void 0 ? _a : 50; });
                placeholders = __spreadArray(__spreadArray([], vals, true), condVals, true).map(function () { return "?"; }).join(", ");
                return [4 /*yield*/, (_c = c.env.DB.prepare("INSERT INTO equipment (id, team_id, ".concat(cols, ", ").concat(condCols, ") VALUES (?, ?, ").concat(placeholders, ")"))).bind.apply(_c, __spreadArray(__spreadArray([crypto.randomUUID(), teamId], vals, false), condVals, false)).run().catch(function (e) { return logger_1.logger.warn({ module: "game" }, "insert equipment", e); })];
            case 4:
                _k.sent();
                return [4 /*yield*/, c.env.DB.prepare("SELECT * FROM equipment WHERE team_id = ?").bind(teamId).first().catch(function (e) { logger_1.logger.warn({ module: "game" }, "re-fetch equipment after insert", e); return null; })];
            case 5:
                equip = _k.sent();
                if (!equip)
                    return [2 /*return*/, c.json({ error: "Failed to create equipment" }, 500)];
                _k.label = 6;
            case 6: return [4 /*yield*/, c.env.DB.batch([
                    c.env.DB.prepare("SELECT reputation FROM teams WHERE id = ?").bind(teamId),
                    c.env.DB.prepare("SELECT COUNT(*) as cnt FROM matches WHERE (home_team_id = ? OR away_team_id = ?) AND status = 'simulated'").bind(teamId, teamId),
                    c.env.DB.prepare("SELECT number FROM seasons WHERE status = 'active' LIMIT 1"),
                ])];
            case 7:
                _b = _k.sent(), teamRes = _b[0], matchCountRes = _b[1], seasonRes = _b[2];
                team = teamRes.results[0];
                matchCount = matchCountRes.results[0];
                seasonNum = (0, season_1.mustSeason)((_e = seasonRes.results[0]) === null || _e === void 0 ? void 0 : _e.number);
                levels = {};
                conditions = {};
                categories = [];
                for (_i = 0, CATEGORIES_1 = CATEGORIES; _i < CATEGORIES_1.length; _i++) {
                    cat = CATEGORIES_1[_i];
                    lv = (_f = equip[cat]) !== null && _f !== void 0 ? _f : 0;
                    cond = (_g = equip["".concat(cat, "_condition")]) !== null && _g !== void 0 ? _g : 50;
                    levels[cat] = lv;
                    conditions["".concat(cat, "_condition")] = cond;
                    categories.push({
                        key: cat,
                        label: CATEGORY_LABELS[cat],
                        level: lv,
                        condition: cond,
                        effectiveLevel: Math.round(lv * (cond / 100) * 10) / 10,
                        description: getLevelDescription(cat, lv),
                    });
                }
                effects = calculateEffects(levels, conditions);
                return [2 /*return*/, c.json({
                        categories: categories,
                        upgrades: getUpgradeOptions(levels, (_h = team === null || team === void 0 ? void 0 : team.reputation) !== null && _h !== void 0 ? _h : 0, (_j = matchCount === null || matchCount === void 0 ? void 0 : matchCount.cnt) !== null && _j !== void 0 ? _j : 0, seasonNum),
                        repairs: getRepairOptions(levels, conditions),
                        effects: effects,
                    })];
        }
    });
}); });
// POST /api/teams/:id/equipment/upgrade
gameRouter.post("/teams/:teamId/equipment/upgrade", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, body, _a, getUpgradeOptions, CATEGORIES, equip, team, matchCount, levels, _i, CATEGORIES_2, cat, upgradeSeason, upgrades, upgrade;
    var _b, _c, _d;
    return __generator(this, function (_e) {
        switch (_e.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, c.req.json()];
            case 1:
                body = _e.sent();
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../equipment/equipment-generator"); })];
            case 2:
                _a = _e.sent(), getUpgradeOptions = _a.getUpgradeOptions, CATEGORIES = _a.CATEGORIES;
                return [4 /*yield*/, c.env.DB.prepare("SELECT * FROM equipment WHERE team_id = ?").bind(teamId).first()];
            case 3:
                equip = _e.sent();
                if (!equip)
                    return [2 /*return*/, c.json({ error: "Equipment not found" }, 404)];
                return [4 /*yield*/, c.env.DB.prepare("SELECT budget, reputation FROM teams WHERE id = ?").bind(teamId).first()];
            case 4:
                team = _e.sent();
                if (!team)
                    return [2 /*return*/, c.json({ error: "Team not found" }, 404)];
                return [4 /*yield*/, c.env.DB.prepare("SELECT COUNT(*) as cnt FROM matches WHERE (home_team_id = ? OR away_team_id = ?) AND status = 'simulated'").bind(teamId, teamId).first().catch(function (e) { logger_1.logger.warn({ module: "game" }, "count matches for equipment upgrade", e); return null; })];
            case 5:
                matchCount = _e.sent();
                levels = {};
                for (_i = 0, CATEGORIES_2 = CATEGORIES; _i < CATEGORIES_2.length; _i++) {
                    cat = CATEGORIES_2[_i];
                    levels[cat] = (_b = equip[cat]) !== null && _b !== void 0 ? _b : 0;
                }
                return [4 /*yield*/, c.env.DB.prepare("SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1")
                        .first().catch(function (e) { logger_1.logger.warn({ module: "game" }, "fetch season for equip upgrade", e); return null; })];
            case 6:
                upgradeSeason = _e.sent();
                upgrades = getUpgradeOptions(levels, team.reputation, (_c = matchCount === null || matchCount === void 0 ? void 0 : matchCount.cnt) !== null && _c !== void 0 ? _c : 0, (0, season_1.mustSeason)(upgradeSeason === null || upgradeSeason === void 0 ? void 0 : upgradeSeason.number));
                upgrade = upgrades.find(function (u) { return u.category === body.category; });
                if (!upgrade)
                    return [2 /*return*/, c.json({ error: "No upgrade available" }, 400)];
                if (upgrade.locked)
                    return [2 /*return*/, c.json({ error: (_d = upgrade.lockReason) !== null && _d !== void 0 ? _d : "Zamčeno" }, 400)];
                if (team.budget < upgrade.cost)
                    return [2 /*return*/, c.json({ error: "Nedostatek peněz" }, 400)];
                // Validate category name to prevent SQL injection
                if (!CATEGORIES.includes(body.category))
                    return [2 /*return*/, c.json({ error: "Invalid category" }, 400)];
                return [4 /*yield*/, (0, finance_processor_1.recordTransaction)(c.env.DB, teamId, "equipment_upgrade", -upgrade.cost, "Vylep\u0161en\u00ED vybaven\u00ED: ".concat(body.category, " \u2192 \u00FArove\u0148 ").concat(upgrade.nextLevel), new Date().toISOString())];
            case 7:
                _e.sent();
                return [4 /*yield*/, c.env.DB.prepare("UPDATE equipment SET ".concat(body.category, " = ?, ").concat(body.category, "_condition = 100 WHERE team_id = ?")).bind(upgrade.nextLevel, teamId).run()];
            case 8:
                _e.sent();
                return [2 /*return*/, c.json({ ok: true, cost: upgrade.cost, newLevel: upgrade.nextLevel })];
        }
    });
}); });
// POST /api/teams/:id/equipment/repair
gameRouter.post("/teams/:teamId/equipment/repair", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, body, CATEGORIES, equip, level, cost, team;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, c.req.json()];
            case 1:
                body = _b.sent();
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../equipment/equipment-generator"); })];
            case 2:
                CATEGORIES = (_b.sent()).CATEGORIES;
                if (!CATEGORIES.includes(body.category))
                    return [2 /*return*/, c.json({ error: "Invalid category" }, 400)];
                return [4 /*yield*/, c.env.DB.prepare("SELECT * FROM equipment WHERE team_id = ?").bind(teamId).first()];
            case 3:
                equip = _b.sent();
                if (!equip)
                    return [2 /*return*/, c.json({ error: "Equipment not found" }, 404)];
                level = (_a = equip[body.category]) !== null && _a !== void 0 ? _a : 0;
                if (level === 0)
                    return [2 /*return*/, c.json({ error: "Nothing to repair" }, 400)];
                cost = level * 500;
                return [4 /*yield*/, c.env.DB.prepare("SELECT budget FROM teams WHERE id = ?").bind(teamId).first()];
            case 4:
                team = _b.sent();
                if (!team || team.budget < cost)
                    return [2 /*return*/, c.json({ error: "Nedostatek peněz" }, 400)];
                return [4 /*yield*/, (0, finance_processor_1.recordTransaction)(c.env.DB, teamId, "equipment_expense", -cost, "Oprava vybaven\u00ED: ".concat(body.category), new Date().toISOString())];
            case 5:
                _b.sent();
                return [4 /*yield*/, c.env.DB.prepare("UPDATE equipment SET ".concat(body.category, "_condition = 100 WHERE team_id = ?")).bind(teamId).run()];
            case 6:
                _b.sent();
                return [2 /*return*/, c.json({ ok: true, cost: cost })];
        }
    });
}); });
// GET /api/teams/:id/stadium — get stadium info (auto-create if missing)
gameRouter.get("/teams/:teamId/stadium", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, stadium, team, generateStadium, createRng_1, seed, i, rng, config, id, getUpgradeOptions, facilities, _a, teamInfoRes, matchCountRes, currentSeasonRes, teamInfo, matchCount, currentSeason, pitchActions, pitchUpgrades, customization, SCOREBOARD_COSTS, SCOREBOARD_LABELS, FLAG_COSTS, FLAG_LABELS, visualUpgrades;
    var _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3;
    return __generator(this, function (_4) {
        switch (_4.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, c.env.DB.prepare("SELECT * FROM stadiums WHERE team_id = ?").bind(teamId).first().catch(function (e) { logger_1.logger.warn({ module: "game" }, "fetch stadium", e); return null; })];
            case 1:
                stadium = _4.sent();
                if (!!stadium) return [3 /*break*/, 7];
                return [4 /*yield*/, c.env.DB.prepare("SELECT t.*, v.size FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?").bind(teamId).first().catch(function (e) { logger_1.logger.warn({ module: "game" }, "fetch team for stadium creation", e); return null; })];
            case 2:
                team = _4.sent();
                if (!team)
                    return [2 /*return*/, c.json({ error: "Team not found" }, 404)];
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../stadium/stadium-generator"); })];
            case 3:
                generateStadium = (_4.sent()).generateStadium;
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../generators/rng"); })];
            case 4:
                createRng_1 = (_4.sent()).createRng;
                seed = 0;
                for (i = 0; i < teamId.length; i++)
                    seed = ((seed << 5) - seed + teamId.charCodeAt(i)) | 0;
                rng = createRng_1(Math.abs(seed));
                config = generateStadium(rng, team.size);
                id = crypto.randomUUID();
                return [4 /*yield*/, c.env.DB.prepare("INSERT INTO stadiums (id, team_id, capacity, pitch_condition, pitch_type, changing_rooms, showers, refreshments, stands, parking, fence)\n       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, teamId, config.capacity, config.pitchCondition, config.pitchType, config.changingRooms, config.showers, config.refreshments, config.stands, config.parking, config.fence).run().catch(function (e) { return logger_1.logger.warn({ module: "game" }, "insert stadium", e); })];
            case 5:
                _4.sent();
                return [4 /*yield*/, c.env.DB.prepare("SELECT * FROM stadiums WHERE team_id = ?")
                        .bind(teamId).first()];
            case 6:
                // Re-read from DB to get proper snake_case column names
                stadium = (_b = _4.sent()) !== null && _b !== void 0 ? _b : __assign({ id: id, team_id: teamId }, config);
                _4.label = 7;
            case 7: return [4 /*yield*/, Promise.resolve().then(function () { return require("../stadium/stadium-generator"); })];
            case 8:
                getUpgradeOptions = (_4.sent()).getUpgradeOptions;
                facilities = {
                    changing_rooms: (_c = stadium.changing_rooms) !== null && _c !== void 0 ? _c : 0,
                    showers: (_d = stadium.showers) !== null && _d !== void 0 ? _d : 0,
                    refreshments: (_e = stadium.refreshments) !== null && _e !== void 0 ? _e : 0,
                    stands: (_f = stadium.stands) !== null && _f !== void 0 ? _f : 0,
                    roof: (_g = stadium.roof) !== null && _g !== void 0 ? _g : 0,
                    ultras_stand: (_h = stadium.ultras_stand) !== null && _h !== void 0 ? _h : 0,
                    toilets: (_j = stadium.toilets) !== null && _j !== void 0 ? _j : 0,
                    parking: (_k = stadium.parking) !== null && _k !== void 0 ? _k : 0,
                    fence: (_l = stadium.fence) !== null && _l !== void 0 ? _l : 0,
                };
                return [4 /*yield*/, c.env.DB.batch([
                        c.env.DB.prepare("SELECT reputation, stadium_name FROM teams WHERE id = ?").bind(teamId),
                        c.env.DB.prepare("SELECT COUNT(*) as cnt FROM matches WHERE (home_team_id = ? OR away_team_id = ?) AND status = 'simulated'").bind(teamId, teamId),
                        c.env.DB.prepare("SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1"),
                    ])];
            case 9:
                _a = _4.sent(), teamInfoRes = _a[0], matchCountRes = _a[1], currentSeasonRes = _a[2];
                teamInfo = (_m = teamInfoRes.results[0]) !== null && _m !== void 0 ? _m : null;
                matchCount = (_o = matchCountRes.results[0]) !== null && _o !== void 0 ? _o : null;
                currentSeason = (_p = currentSeasonRes.results[0]) !== null && _p !== void 0 ? _p : null;
                pitchActions = [
                    { level: "basic", label: "Základní údržba", desc: "Posečení, zarovnání", cost: 500, improvement: 10 },
                    { level: "thorough", label: "Důkladná údržba", desc: "Přesetí holých míst, hnojení", cost: 1000, improvement: 25 },
                    { level: "renovation", label: "Renovace trávníku", desc: "Kompletní obnova povrchu", cost: 1700, improvement: 50 },
                ].filter(function (a) { return stadium.pitch_condition + a.improvement <= 110; });
                pitchUpgrades = [];
                if (stadium.pitch_type === "natural") {
                    pitchUpgrades.push({ pitchType: "hybrid", label: "Hybridní trávník", desc: "Mix přírodní + umělé vlákno, odolnější", cost: 85000 });
                }
                if (stadium.pitch_type === "hybrid") {
                    pitchUpgrades.push({ pitchType: "artificial", label: "Umělý trávník", desc: "Žádná údržba, hratelný za každého počasí", cost: 220000 });
                }
                customization = {
                    fenceColor: (_q = stadium.fence_color) !== null && _q !== void 0 ? _q : null,
                    standColor: (_r = stadium.stand_color) !== null && _r !== void 0 ? _r : null,
                    seatColor: (_s = stadium.seat_color) !== null && _s !== void 0 ? _s : null,
                    roofColor: (_t = stadium.roof_color) !== null && _t !== void 0 ? _t : null,
                    accentColor: (_u = stadium.accent_color) !== null && _u !== void 0 ? _u : null,
                    scoreboardLevel: (_v = stadium.scoreboard_level) !== null && _v !== void 0 ? _v : 0,
                    flagSize: (_w = stadium.flag_size) !== null && _w !== void 0 ? _w : 0,
                    ultrasText: (_x = stadium.ultras_text) !== null && _x !== void 0 ? _x : null,
                    ultrasBannerColor: (_y = stadium.ultras_banner_color) !== null && _y !== void 0 ? _y : null,
                    ultrasTextColor: (_z = stadium.ultras_text_color) !== null && _z !== void 0 ? _z : null,
                    flagColor: (_0 = stadium.flag_color) !== null && _0 !== void 0 ? _0 : null,
                };
                SCOREBOARD_COSTS = [0, 2000, 8000, 25000];
                SCOREBOARD_LABELS = ["Žádný", "Dřevěná tabule", "LED jednobarevná", "Full-color LED"];
                FLAG_COSTS = [0, 1500, 5000, 15000];
                FLAG_LABELS = ["Žádná", "Malá vlajka (3m)", "Střední vlajka (5m)", "Velká vlajka (8m)"];
                visualUpgrades = [];
                if (customization.scoreboardLevel < 3) {
                    visualUpgrades.push({
                        kind: "scoreboard",
                        currentLevel: customization.scoreboardLevel,
                        nextLevel: customization.scoreboardLevel + 1,
                        cost: SCOREBOARD_COSTS[customization.scoreboardLevel + 1],
                        label: SCOREBOARD_LABELS[customization.scoreboardLevel + 1],
                    });
                }
                if (customization.flagSize < 3) {
                    visualUpgrades.push({
                        kind: "flag",
                        currentLevel: customization.flagSize,
                        nextLevel: customization.flagSize + 1,
                        cost: FLAG_COSTS[customization.flagSize + 1],
                        label: FLAG_LABELS[customization.flagSize + 1],
                    });
                }
                return [2 /*return*/, c.json({
                        stadiumName: (_1 = teamInfo === null || teamInfo === void 0 ? void 0 : teamInfo.stadium_name) !== null && _1 !== void 0 ? _1 : null,
                        capacity: stadium.capacity,
                        pitchCondition: stadium.pitch_condition,
                        pitchType: stadium.pitch_type,
                        facilities: facilities,
                        customization: customization,
                        visualUpgrades: visualUpgrades,
                        upgrades: getUpgradeOptions(facilities, (_2 = teamInfo === null || teamInfo === void 0 ? void 0 : teamInfo.reputation) !== null && _2 !== void 0 ? _2 : 0, (_3 = matchCount === null || matchCount === void 0 ? void 0 : matchCount.cnt) !== null && _3 !== void 0 ? _3 : 0, (0, season_1.mustSeason)(currentSeason === null || currentSeason === void 0 ? void 0 : currentSeason.number)),
                        pitchActions: pitchActions,
                        pitchUpgrades: pitchUpgrades,
                    })];
        }
    });
}); });
// POST /api/teams/:id/stadium/upgrade — upgrade a facility
gameRouter.post("/teams/:teamId/stadium/upgrade", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, body, stadium, team, matchCount, seasonRow, seasonNum, getUpgradeOptions, facilities, upgrades, upgrade, capacityBonus;
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
    return __generator(this, function (_o) {
        switch (_o.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, c.req.json()];
            case 1:
                body = _o.sent();
                return [4 /*yield*/, c.env.DB.prepare("SELECT * FROM stadiums WHERE team_id = ?").bind(teamId).first()];
            case 2:
                stadium = _o.sent();
                if (!stadium)
                    return [2 /*return*/, c.json({ error: "Stadium not found" }, 404)];
                return [4 /*yield*/, c.env.DB.prepare("SELECT budget, reputation FROM teams WHERE id = ?").bind(teamId).first()];
            case 3:
                team = _o.sent();
                if (!team)
                    return [2 /*return*/, c.json({ error: "Team not found" }, 404)];
                return [4 /*yield*/, c.env.DB.prepare("SELECT COUNT(*) as cnt FROM matches WHERE (home_team_id = ? OR away_team_id = ?) AND status = 'simulated'").bind(teamId, teamId).first().catch(function (e) { logger_1.logger.warn({ module: "game" }, "count matches for stadium upgrade", e); return null; })];
            case 4:
                matchCount = _o.sent();
                return [4 /*yield*/, c.env.DB.prepare("SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1").first().catch(function (e) { logger_1.logger.warn({ module: "game" }, "fetch season for stadium upgrade", e); return null; })];
            case 5:
                seasonRow = _o.sent();
                seasonNum = (0, season_1.mustSeason)(seasonRow === null || seasonRow === void 0 ? void 0 : seasonRow.number);
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../stadium/stadium-generator"); })];
            case 6:
                getUpgradeOptions = (_o.sent()).getUpgradeOptions;
                facilities = {
                    changing_rooms: (_a = stadium.changing_rooms) !== null && _a !== void 0 ? _a : 0,
                    showers: (_b = stadium.showers) !== null && _b !== void 0 ? _b : 0,
                    refreshments: (_c = stadium.refreshments) !== null && _c !== void 0 ? _c : 0,
                    stands: (_d = stadium.stands) !== null && _d !== void 0 ? _d : 0,
                    roof: (_e = stadium.roof) !== null && _e !== void 0 ? _e : 0,
                    ultras_stand: (_f = stadium.ultras_stand) !== null && _f !== void 0 ? _f : 0,
                    toilets: (_g = stadium.toilets) !== null && _g !== void 0 ? _g : 0,
                    parking: (_h = stadium.parking) !== null && _h !== void 0 ? _h : 0,
                    fence: (_j = stadium.fence) !== null && _j !== void 0 ? _j : 0,
                };
                upgrades = getUpgradeOptions(facilities, team.reputation, (_k = matchCount === null || matchCount === void 0 ? void 0 : matchCount.cnt) !== null && _k !== void 0 ? _k : 0, seasonNum);
                upgrade = upgrades.find(function (u) { return u.facility === body.facility; });
                if (!upgrade)
                    return [2 /*return*/, c.json({ error: "No upgrade available" }, 400)];
                if (upgrade.locked)
                    return [2 /*return*/, c.json({ error: (_l = upgrade.lockReason) !== null && _l !== void 0 ? _l : "Zamčeno" }, 400)];
                if (team.budget < upgrade.cost)
                    return [2 /*return*/, c.json({ error: "Nedostatek peněz" }, 400)];
                // Deduct cost + apply upgrade
                return [4 /*yield*/, (0, finance_processor_1.recordTransaction)(c.env.DB, teamId, "stadium_upgrade", -upgrade.cost, "Vylep\u0161en\u00ED stadionu: ".concat(body.facility), new Date().toISOString())];
            case 7:
                // Deduct cost + apply upgrade
                _o.sent();
                return [4 /*yield*/, c.env.DB.prepare("UPDATE stadiums SET ".concat(body.facility, " = ? WHERE team_id = ?")).bind(upgrade.nextLevel, teamId).run()];
            case 8:
                _o.sent();
                if (!(body.facility === "stands")) return [3 /*break*/, 10];
                capacityBonus = (_m = [0, 50, 150, 300][upgrade.nextLevel]) !== null && _m !== void 0 ? _m : 0;
                return [4 /*yield*/, c.env.DB.prepare("UPDATE stadiums SET capacity = capacity + ? WHERE team_id = ?").bind(capacityBonus, teamId).run()];
            case 9:
                _o.sent();
                _o.label = 10;
            case 10: return [2 /*return*/, c.json({ ok: true, cost: upgrade.cost, newLevel: upgrade.nextLevel })];
        }
    });
}); });
// PATCH /api/teams/:id/stadium/customize — set color (zdarma)
gameRouter.patch("/teams/:teamId/stadium/customize", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, body, clean, allowed;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, c.req.json()];
            case 1:
                body = _a.sent();
                if (!(body.field === "ultras_text")) return [3 /*break*/, 3];
                clean = body.value === null
                    ? null
                    : String(body.value).replace(/[^\p{L}\p{N} .!?#'-]/gu, "").slice(0, 22).trim() || null;
                return [4 /*yield*/, c.env.DB.prepare("UPDATE stadiums SET ultras_text = ? WHERE team_id = ?")
                        .bind(clean, teamId).run()];
            case 2:
                _a.sent();
                return [2 /*return*/, c.json({ ok: true, value: clean })];
            case 3:
                allowed = new Set(["fence_color", "stand_color", "seat_color", "roof_color", "accent_color", "ultras_banner_color", "ultras_text_color", "flag_color"]);
                if (!allowed.has(body.field))
                    return [2 /*return*/, c.json({ error: "Invalid field" }, 400)];
                // Hex color validation (jednoduchá)
                if (body.value !== null && !/^#[0-9A-Fa-f]{6}$/.test(body.value)) {
                    return [2 /*return*/, c.json({ error: "Invalid color (must be hex #RRGGBB or null)" }, 400)];
                }
                return [4 /*yield*/, c.env.DB.prepare("UPDATE stadiums SET ".concat(body.field, " = ? WHERE team_id = ?"))
                        .bind(body.value, teamId).run()];
            case 4:
                _a.sent();
                return [2 /*return*/, c.json({ ok: true })];
        }
    });
}); });
// POST /api/teams/:id/stadium/visual-upgrade — koupit scoreboard nebo vlajku
gameRouter.post("/teams/:teamId/stadium/visual-upgrade", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, body, SCOREBOARD_COSTS, FLAG_COSTS, stadium, team, currentLevel, nextLevel, cost, column;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, c.req.json()];
            case 1:
                body = _a.sent();
                SCOREBOARD_COSTS = [0, 2000, 8000, 25000];
                FLAG_COSTS = [0, 1500, 5000, 15000];
                return [4 /*yield*/, c.env.DB.prepare("SELECT scoreboard_level, flag_size FROM stadiums WHERE team_id = ?").bind(teamId).first()];
            case 2:
                stadium = _a.sent();
                if (!stadium)
                    return [2 /*return*/, c.json({ error: "Stadium not found" }, 404)];
                return [4 /*yield*/, c.env.DB.prepare("SELECT budget FROM teams WHERE id = ?")
                        .bind(teamId).first()];
            case 3:
                team = _a.sent();
                if (!team)
                    return [2 /*return*/, c.json({ error: "Team not found" }, 404)];
                currentLevel = body.kind === "scoreboard" ? stadium.scoreboard_level : stadium.flag_size;
                nextLevel = currentLevel + 1;
                if (nextLevel > 3)
                    return [2 /*return*/, c.json({ error: "Už je na maxu" }, 400)];
                cost = (body.kind === "scoreboard" ? SCOREBOARD_COSTS : FLAG_COSTS)[nextLevel];
                if (team.budget < cost)
                    return [2 /*return*/, c.json({ error: "Nedostatek peněz" }, 400)];
                return [4 /*yield*/, (0, finance_processor_1.recordTransaction)(c.env.DB, teamId, "stadium_visual", -cost, "Stadion vzhled: ".concat(body.kind === "scoreboard" ? "scoreboard" : "vlajka", " L").concat(nextLevel), new Date().toISOString())];
            case 4:
                _a.sent();
                column = body.kind === "scoreboard" ? "scoreboard_level" : "flag_size";
                return [4 /*yield*/, c.env.DB.prepare("UPDATE stadiums SET ".concat(column, " = ? WHERE team_id = ?"))
                        .bind(nextLevel, teamId).run()];
            case 5:
                _a.sent();
                return [2 /*return*/, c.json({ ok: true, cost: cost, newLevel: nextLevel })];
        }
    });
}); });
// POST /api/teams/:id/stadium/maintain-pitch — improve pitch condition
gameRouter.post("/teams/:teamId/stadium/maintain-pitch", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, body, costs, action, team;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, c.req.json()];
            case 1:
                body = _a.sent();
                costs = {
                    basic: { cost: 500, improvement: 10, label: "Základní údržba (+10%)" },
                    thorough: { cost: 1000, improvement: 25, label: "Důkladná údržba (+25%)" },
                    renovation: { cost: 1700, improvement: 50, label: "Renovace trávníku (+50%)" },
                };
                action = costs[body.level];
                if (!action)
                    return [2 /*return*/, c.json({ error: "Invalid level" }, 400)];
                return [4 /*yield*/, c.env.DB.prepare("SELECT budget FROM teams WHERE id = ?")
                        .bind(teamId).first()];
            case 2:
                team = _a.sent();
                if (!team || team.budget < action.cost)
                    return [2 /*return*/, c.json({ error: "Nedostatek peněz" }, 400)];
                return [4 /*yield*/, (0, finance_processor_1.recordTransaction)(c.env.DB, teamId, "pitch_repair", -action.cost, "\u00DAdr\u017Eba h\u0159i\u0161t\u011B: +".concat(action.improvement, "% kondice"), new Date().toISOString())];
            case 3:
                _a.sent();
                return [4 /*yield*/, c.env.DB.prepare("UPDATE stadiums SET pitch_condition = MIN(100, pitch_condition + ?) WHERE team_id = ?").bind(action.improvement, teamId).run()];
            case 4:
                _a.sent();
                return [2 /*return*/, c.json({ ok: true, cost: action.cost, improvement: action.improvement })];
        }
    });
}); });
// POST /api/teams/:id/stadium/upgrade-pitch — change pitch type
gameRouter.post("/teams/:teamId/stadium/upgrade-pitch", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, body, upgrades, upgrade, stadium, team;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, c.req.json()];
            case 1:
                body = _a.sent();
                upgrades = {
                    hybrid: { from: "natural", cost: 85000 },
                    artificial: { from: "hybrid", cost: 220000 },
                };
                upgrade = upgrades[body.pitchType];
                if (!upgrade)
                    return [2 /*return*/, c.json({ error: "Invalid pitch type" }, 400)];
                return [4 /*yield*/, c.env.DB.prepare("SELECT pitch_type FROM stadiums WHERE team_id = ?")
                        .bind(teamId).first()];
            case 2:
                stadium = _a.sent();
                if (!stadium)
                    return [2 /*return*/, c.json({ error: "Stadium not found" }, 404)];
                if (stadium.pitch_type !== upgrade.from)
                    return [2 /*return*/, c.json({ error: "Nejd\u0159\u00EDv pot\u0159ebuje\u0161 ".concat(upgrade.from, " povrch") }, 400)];
                return [4 /*yield*/, c.env.DB.prepare("SELECT budget FROM teams WHERE id = ?")
                        .bind(teamId).first()];
            case 3:
                team = _a.sent();
                if (!team || team.budget < upgrade.cost)
                    return [2 /*return*/, c.json({ error: "Nedostatek peněz" }, 400)];
                return [4 /*yield*/, (0, finance_processor_1.recordTransaction)(c.env.DB, teamId, "pitch_upgrade", -upgrade.cost, "Zm\u011Bna povrchu: ".concat(body.pitchType), new Date().toISOString())];
            case 4:
                _a.sent();
                return [4 /*yield*/, c.env.DB.prepare("UPDATE stadiums SET pitch_type = ?, pitch_condition = 100 WHERE team_id = ?").bind(body.pitchType, teamId).run()];
            case 5:
                _a.sent();
                return [2 /*return*/, c.json({ ok: true, cost: upgrade.cost })];
        }
    });
}); });
// GET /api/teams/:id/roles — team roles (captain, penalty, free kick)
gameRouter.get("/teams/:teamId/roles", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, team;
    var _a, _b, _c;
    return __generator(this, function (_d) {
        switch (_d.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, c.env.DB.prepare("SELECT captain_id, penalty_taker_id, freekick_taker_id FROM teams WHERE id = ?").bind(teamId).first().catch(function (e) { logger_1.logger.warn({ module: "game" }, "fetch team roles", e); return null; })];
            case 1:
                team = _d.sent();
                if (!team)
                    return [2 /*return*/, c.json({ error: "Team not found" }, 404)];
                return [2 /*return*/, c.json({
                        captainId: (_a = team.captain_id) !== null && _a !== void 0 ? _a : null,
                        penaltyTakerId: (_b = team.penalty_taker_id) !== null && _b !== void 0 ? _b : null,
                        freekickTakerId: (_c = team.freekick_taker_id) !== null && _c !== void 0 ? _c : null,
                    })];
        }
    });
}); });
// POST /api/teams/:id/roles — set team roles
gameRouter.post("/teams/:teamId/roles", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, body, updates, binds, idsToCheck, placeholders, validCount;
    var _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, c.req.json()];
            case 1:
                body = _c.sent();
                updates = [];
                binds = [];
                idsToCheck = [body.captainId, body.penaltyTakerId, body.freekickTakerId].filter(function (id) { return !!id; });
                if (!(idsToCheck.length > 0)) return [3 /*break*/, 3];
                placeholders = idsToCheck.map(function () { return "?"; }).join(",");
                return [4 /*yield*/, (_a = c.env.DB.prepare("SELECT COUNT(*) as cnt FROM players WHERE team_id = ? AND id IN (".concat(placeholders, ")"))).bind.apply(_a, __spreadArray([teamId], idsToCheck, false)).first().catch(function (e) { logger_1.logger.warn({ module: "game" }, "validate role player ids", e); return null; })];
            case 2:
                validCount = _c.sent();
                if (!validCount || validCount.cnt !== idsToCheck.length) {
                    return [2 /*return*/, c.json({ error: "Hráč nenáleží do týmu" }, 400)];
                }
                _c.label = 3;
            case 3:
                if (body.captainId !== undefined) {
                    updates.push("captain_id = ?");
                    binds.push(body.captainId || null);
                }
                if (body.penaltyTakerId !== undefined) {
                    updates.push("penalty_taker_id = ?");
                    binds.push(body.penaltyTakerId || null);
                }
                if (body.freekickTakerId !== undefined) {
                    updates.push("freekick_taker_id = ?");
                    binds.push(body.freekickTakerId || null);
                }
                if (!(updates.length > 0)) return [3 /*break*/, 5];
                binds.push(teamId);
                return [4 /*yield*/, (_b = c.env.DB.prepare("UPDATE teams SET ".concat(updates.join(", "), " WHERE id = ?")))
                        .bind.apply(_b, binds).run().catch(function (e) { return logger_1.logger.warn({ module: "game" }, "update team roles", e); })];
            case 4:
                _c.sent();
                _c.label = 5;
            case 5: return [2 /*return*/, c.json({ ok: true })];
        }
    });
}); });
// GET /api/teams/:id/injuries — active injuries
gameRouter.get("/teams/:teamId/injuries", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, result;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, c.env.DB.prepare("SELECT i.*, p.first_name, p.last_name, p.nickname, p.position, p.avatar\n     FROM injuries i JOIN players p ON i.player_id = p.id\n     WHERE i.team_id = ? AND i.days_remaining > 0\n     ORDER BY i.days_remaining ASC").bind(teamId).all().catch(function (e) { logger_1.logger.warn({ module: "game" }, "fetch injuries", e); return { results: [] }; })];
            case 1:
                result = _a.sent();
                return [2 /*return*/, c.json(result.results.map(function (row) { return ({
                        id: row.id,
                        playerId: row.player_id,
                        firstName: row.first_name,
                        lastName: row.last_name,
                        nickname: row.nickname,
                        position: row.position,
                        avatar: row.avatar ? JSON.parse(row.avatar) : null,
                        type: row.type,
                        description: row.description,
                        severity: row.severity,
                        daysRemaining: row.days_remaining,
                        daysTotal: row.days_total,
                        createdAt: row.created_at,
                    }); }))];
        }
    });
}); });
// ═══ SPONSOR CONTRACTS ═══
// GET /api/teams/:id/sponsors — active contracts (main + stadium) + available offers
/** Podmínky prodloužení smlouvy — deterministické (tým+sponzor+sezóna), stejný vzorec jako nabídky.
 *  Sponzor mimo okresní pool (např. z onboardingu) → prodloužení za stávající částky. */
function computeRenewalTerms(teamId, seasonNum, contract, reputation, size, spRows, seedFn) {
    var category = contract.category || "main";
    var seasons = category === "banner" ? 2 : 3;
    var repMod = reputation / 50;
    var sizeMod = size === "mesto" ? 1.3 : size === "mestys" ? 1.1 : size === "obec" ? 1.0 : 0.8;
    var catMult = category === "main" ? 3 : category === "stadium" ? 1.5 : 0.8;
    var cleanSp = function (nm) { return nm.replace(/\s*s\.r\.o\.?\s*/gi, "").trim(); };
    var baseName = category === "stadium" ? contract.sponsor_name.replace(/\s+Arena$/i, "").trim() : contract.sponsor_name;
    var spRow = category === "stadium"
        ? spRows.find(function (r) { return cleanSp(r.name) === baseName; })
        : spRows.find(function (r) { return r.name === contract.sponsor_name; });
    var monthly = contract.monthly_amount;
    var winBonus = contract.win_bonus;
    if (spRow) {
        var rng = (0, rng_1.createRng)(seedFn(teamId + "renew" + contract.sponsor_name + seasonNum));
        monthly = Math.round(rng.int(spRow.monthly_min, spRow.monthly_max) * repMod * sizeMod * catMult);
        winBonus = category === "main" ? Math.round(rng.int(spRow.win_bonus_min, spRow.win_bonus_max) * repMod * 2) : 0;
    }
    var earlyTerminationFee = Math.round(monthly * seasons * (category === "banner" ? 1.5 : 2));
    return { monthlyAmount: monthly, winBonus: winBonus, seasons: seasons, earlyTerminationFee: earlyTerminationFee };
}
gameRouter.get("/teams/:teamId/sponsors", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, team, activeRows, mapContract, mainContract, stadiumContract, bannerContracts, sponsorRows, seasonForSeed, seedSeason, repMod, sizeMod, seedFromString, rng, shuffledSponsors, i, j, mainCurrentName, mainPoolFiltered, mainOffers, offerCount, bigFish_1, pool, i, s, monthly, winB, seasons, terminationFee, requirement, stadiumCurrentBase, stadiumPoolFiltered, stadiumOffers, pool, i, s, monthly, seasons, terminationFee, cleanName, MAX_BANNERS, bannerOffers, usedNames, bannerPool, i, s, monthly, seasons, terminationFee, _a, currentSeasonRes, teamFullRes, seasonNum, teamFull, changedThisSeason, renewalFor, lastExpiredFor, mainExpired, _b, stadiumExpired, _c;
    var _d;
    var _e, _f, _g, _h, _j;
    return __generator(this, function (_k) {
        switch (_k.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, c.env.DB.prepare("SELECT t.reputation, t.stadium_name, v.district, v.size, v.name as village_name FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?").bind(teamId).first().catch(function (e) { logger_1.logger.warn({ module: "game" }, "fetch team info for sponsors", e); return null; })];
            case 1:
                team = _k.sent();
                if (!team)
                    return [2 /*return*/, c.json({ error: "Team not found" }, 404)];
                return [4 /*yield*/, c.env.DB.prepare("SELECT * FROM sponsor_contracts WHERE team_id = ? AND status = 'active'").bind(teamId).all().catch(function (e) { logger_1.logger.warn({ module: "game" }, "fetch active sponsor contracts", e); return { results: [] }; })];
            case 2:
                activeRows = _k.sent();
                mapContract = function (row) { return ({
                    id: row.id,
                    category: row.category || "main",
                    sponsorName: row.sponsor_name,
                    sponsorType: row.sponsor_type,
                    monthlyAmount: row.monthly_amount,
                    winBonus: row.win_bonus,
                    seasonsTotal: row.seasons_total,
                    seasonsRemaining: row.seasons_remaining,
                    earlyTerminationFee: row.early_termination_fee,
                    isNamingRights: row.is_naming_rights === 1,
                    signedAt: row.signed_at,
                }); };
                mainContract = activeRows.results.find(function (r) { return (r.category || "main") === "main"; });
                stadiumContract = activeRows.results.find(function (r) { return r.category === "stadium"; });
                bannerContracts = activeRows.results.filter(function (r) { return r.category === "banner"; });
                return [4 /*yield*/, c.env.DB.prepare("SELECT * FROM district_sponsors WHERE district = ? ORDER BY name").bind(team.district).all().catch(function (e) { logger_1.logger.warn({ module: "game" }, "fetch district sponsors", e); return { results: [] }; })];
            case 3:
                sponsorRows = _k.sent();
                return [4 /*yield*/, c.env.DB.prepare("SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1").first().catch(function (e) { logger_1.logger.warn({ module: "sponsors" }, "fetch season for seed", e); return null; })];
            case 4:
                seasonForSeed = _k.sent();
                seedSeason = (0, season_1.mustSeason)(seasonForSeed === null || seasonForSeed === void 0 ? void 0 : seasonForSeed.number);
                repMod = team.reputation / 50;
                sizeMod = team.size === "mesto" ? 1.3 : team.size === "mestys" ? 1.1 : team.size === "obec" ? 1.0 : 0.8;
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../lib/seed"); })];
            case 5:
                seedFromString = (_k.sent()).seedFromString;
                rng = (0, rng_1.createRng)(seedFromString(teamId + "sponsors" + seedSeason));
                shuffledSponsors = __spreadArray([], sponsorRows.results, true);
                for (i = shuffledSponsors.length - 1; i > 0; i--) {
                    j = Math.floor(rng.random() * (i + 1));
                    _d = [shuffledSponsors[j], shuffledSponsors[i]], shuffledSponsors[i] = _d[0], shuffledSponsors[j] = _d[1];
                }
                mainCurrentName = mainContract === null || mainContract === void 0 ? void 0 : mainContract.sponsor_name;
                mainPoolFiltered = shuffledSponsors.filter(function (s) { return s.name !== mainCurrentName; });
                mainOffers = [];
                {
                    offerCount = team.reputation >= 60 ? 5 : team.reputation >= 40 ? 4 : 3;
                    bigFish_1 = __spreadArray([], mainPoolFiltered, true).sort(function (a, b) { return b.monthly_max - a.monthly_max; }).slice(0, 2);
                    pool = __spreadArray(__spreadArray([], bigFish_1, true), mainPoolFiltered.filter(function (s) { return !bigFish_1.includes(s); }), true).slice(0, offerCount * 2);
                    for (i = 0; i < Math.min(offerCount, pool.length); i++) {
                        s = pool[i];
                        monthly = Math.round(rng.int(s.monthly_min, s.monthly_max) * repMod * sizeMod * 3);
                        winB = Math.round(rng.int(s.win_bonus_min, s.win_bonus_max) * repMod * 2);
                        seasons = rng.int(1, 3);
                        terminationFee = Math.round(monthly * seasons * 2);
                        requirement = void 0;
                        if (monthly > 2000)
                            requirement = "Reputace ".concat(Math.round(30 + monthly / 100), "+");
                        mainOffers.push({
                            sponsorName: s.name, sponsorType: s.type,
                            monthlyAmount: monthly, winBonus: winB,
                            seasons: seasons,
                            earlyTerminationFee: terminationFee,
                            requirement: requirement,
                        });
                    }
                    mainOffers.sort(function (a, b) { return b.monthlyAmount - a.monthlyAmount; });
                }
                stadiumCurrentBase = (_e = stadiumContract === null || stadiumContract === void 0 ? void 0 : stadiumContract.sponsor_name) === null || _e === void 0 ? void 0 : _e.replace(/\s+Arena$/i, "").trim();
                stadiumPoolFiltered = shuffledSponsors.filter(function (s) {
                    return !stadiumCurrentBase || s.name.replace(/\s*s\.r\.o\.?\s*/gi, "").trim() !== stadiumCurrentBase;
                });
                stadiumOffers = [];
                {
                    pool = stadiumPoolFiltered.slice(stadiumPoolFiltered.length > 4 ? 2 : 0);
                    for (i = 0; i < Math.min(3, pool.length); i++) {
                        s = pool[i];
                        monthly = Math.round(rng.int(s.monthly_min, s.monthly_max) * repMod * sizeMod * 1.5);
                        seasons = rng.int(1, 3);
                        terminationFee = Math.round(monthly * seasons * 2);
                        cleanName = s.name.replace(/\s*s\.r\.o\.?\s*/gi, "").trim();
                        stadiumOffers.push({
                            sponsorName: "".concat(cleanName, " Arena"), sponsorType: s.type,
                            monthlyAmount: monthly, winBonus: 0,
                            seasons: seasons,
                            earlyTerminationFee: terminationFee,
                        });
                    }
                    stadiumOffers.sort(function (a, b) { return b.monthlyAmount - a.monthlyAmount; });
                }
                MAX_BANNERS = 6;
                bannerOffers = [];
                usedNames = new Set(bannerContracts.map(function (c) { return c.sponsor_name; }));
                bannerPool = shuffledSponsors.filter(function (s) { return !usedNames.has(s.name); });
                for (i = 0; i < Math.min(12, bannerPool.length); i++) {
                    s = bannerPool[i];
                    monthly = Math.round(rng.int(s.monthly_min, s.monthly_max) * repMod * sizeMod * 0.8);
                    seasons = rng.int(1, 2);
                    terminationFee = Math.round(monthly * seasons * 1.5);
                    bannerOffers.push({
                        sponsorName: s.name, sponsorType: s.type,
                        monthlyAmount: monthly, winBonus: 0,
                        seasons: seasons,
                        earlyTerminationFee: terminationFee,
                    });
                }
                bannerOffers.sort(function (a, b) { return b.monthlyAmount - a.monthlyAmount; });
                return [4 /*yield*/, c.env.DB.batch([
                        c.env.DB.prepare("SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1"),
                        c.env.DB.prepare("SELECT name, last_main_sponsor_change_season FROM teams WHERE id = ?").bind(teamId),
                    ])];
            case 6:
                _a = _k.sent(), currentSeasonRes = _a[0], teamFullRes = _a[1];
                seasonNum = (0, season_1.mustSeason)((_f = currentSeasonRes.results[0]) === null || _f === void 0 ? void 0 : _f.number);
                teamFull = (_g = teamFullRes.results[0]) !== null && _g !== void 0 ? _g : null;
                changedThisSeason = ((_h = teamFull === null || teamFull === void 0 ? void 0 : teamFull.last_main_sponsor_change_season) !== null && _h !== void 0 ? _h : 0) >= seasonNum;
                renewalFor = function (row) { return row
                    ? computeRenewalTerms(teamId, seedSeason, row, team.reputation, team.size, sponsorRows.results, seedFromString)
                    : null; };
                lastExpiredFor = function (cat) { return __awaiter(void 0, void 0, void 0, function () {
                    var row;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0: return [4 /*yield*/, c.env.DB.prepare("SELECT * FROM sponsor_contracts WHERE team_id = ? AND status = 'expired' AND COALESCE(category, 'main') = ? ORDER BY signed_at DESC LIMIT 1").bind(teamId, cat).first()
                                    .catch(function (e) { logger_1.logger.warn({ module: "game", teamId: teamId }, "fetch expired contract", e); return null; })];
                            case 1:
                                row = _a.sent();
                                return [2 /*return*/, row ? __assign(__assign({}, mapContract(row)), { renewal: renewalFor(row) }) : null];
                        }
                    });
                }); };
                if (!mainContract) return [3 /*break*/, 7];
                _b = null;
                return [3 /*break*/, 9];
            case 7: return [4 /*yield*/, lastExpiredFor("main")];
            case 8:
                _b = _k.sent();
                _k.label = 9;
            case 9:
                mainExpired = _b;
                if (!stadiumContract) return [3 /*break*/, 10];
                _c = null;
                return [3 /*break*/, 12];
            case 10: return [4 /*yield*/, lastExpiredFor("stadium")];
            case 11:
                _c = _k.sent();
                _k.label = 12;
            case 12:
                stadiumExpired = _c;
                return [2 /*return*/, c.json({
                        mainContract: mainContract ? __assign(__assign({}, mapContract(mainContract)), { renewal: renewalFor(mainContract) }) : null,
                        stadiumContract: stadiumContract ? __assign(__assign({}, mapContract(stadiumContract)), { renewal: renewalFor(stadiumContract) }) : null,
                        mainExpired: mainExpired,
                        stadiumExpired: stadiumExpired,
                        bannerContracts: bannerContracts.map(function (r) { return (__assign(__assign({}, mapContract(r)), { renewal: renewalFor(r) })); }),
                        stadiumName: team.stadium_name,
                        teamName: (_j = teamFull === null || teamFull === void 0 ? void 0 : teamFull.name) !== null && _j !== void 0 ? _j : "",
                        mainOffers: mainOffers,
                        stadiumOffers: stadiumOffers,
                        bannerOffers: bannerContracts.length >= MAX_BANNERS ? [] : bannerOffers,
                        maxBanners: MAX_BANNERS,
                        canChangeMainSponsor: !changedThisSeason,
                        season: seasonNum,
                    })];
        }
    });
}); });
// POST /api/teams/:id/sponsors/sign — sign a new sponsor contract
gameRouter.post("/teams/:teamId/sponsors/sign", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, body, category, MAX_BANNERS, allActive, bannerCount, existing, econ, spBounds, cleanSp, baseName, spRow, repMod, sizeMod, catMult, maxMonthly, maxWinBonus, maxSeasons, validatedTerminationFee, season, sn, team, id, teamInfo, village, oldName, newName, season;
    var _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, c.req.json()];
            case 1:
                body = _c.sent();
                category = body.category || "main";
                MAX_BANNERS = 6;
                return [4 /*yield*/, c.env.DB.prepare("SELECT id, category FROM sponsor_contracts WHERE team_id = ? AND status = 'active'").bind(teamId).all().catch(function (e) { logger_1.logger.warn({ module: "game" }, "fetch active contracts for signing", e); return { results: [] }; })];
            case 2:
                allActive = _c.sent();
                if (category === "banner") {
                    bannerCount = allActive.results.filter(function (r) { return r.category === "banner"; }).length;
                    if (bannerCount >= MAX_BANNERS) {
                        return [2 /*return*/, c.json({ error: "Maxim\u00E1ln\u00ED po\u010Det banner\u016F (".concat(MAX_BANNERS, ") je dosa\u017Een") }, 400)];
                    }
                }
                else {
                    existing = allActive.results.find(function (r) { return (r.category || "main") === category; });
                    if (existing)
                        return [2 /*return*/, c.json({ error: "U\u017E m\u00E1\u0161 aktivn\u00ED smlouvu pro ".concat(category === "main" ? "hlavního sponzora" : "stadion") }, 400)];
                }
                return [4 /*yield*/, c.env.DB.prepare("SELECT t.reputation, v.size, v.district FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?").bind(teamId).first()
                        .catch(function (e) { logger_1.logger.warn({ module: "game" }, "sponsor econ lookup", e); return null; })];
            case 3:
                econ = _c.sent();
                if (!econ)
                    return [2 /*return*/, c.json({ error: "Tým nenalezen" }, 404)];
                return [4 /*yield*/, c.env.DB.prepare("SELECT name, monthly_max, win_bonus_max FROM district_sponsors WHERE district = ?")
                        .bind(econ.district).all()
                        .catch(function (e) { logger_1.logger.warn({ module: "game" }, "sponsor bounds lookup", e); return { results: [] }; })];
            case 4:
                spBounds = _c.sent();
                cleanSp = function (nm) { return nm.replace(/\s*s\.r\.o\.?\s*/gi, "").trim(); };
                baseName = category === "stadium" ? body.sponsorName.replace(/\s+Arena$/i, "").trim() : body.sponsorName;
                spRow = category === "stadium"
                    ? spBounds.results.find(function (r) { return cleanSp(r.name) === baseName; })
                    : spBounds.results.find(function (r) { return r.name === body.sponsorName; });
                if (!spRow)
                    return [2 /*return*/, c.json({ error: "Neplatný sponzor pro tento okres" }, 400)];
                repMod = econ.reputation / 50;
                sizeMod = econ.size === "mesto" ? 1.3 : econ.size === "mestys" ? 1.1 : econ.size === "obec" ? 1.0 : 0.8;
                catMult = category === "main" ? 3 : category === "stadium" ? 1.5 : 0.8;
                maxMonthly = Math.ceil(spRow.monthly_max * repMod * sizeMod * catMult) + 1;
                maxWinBonus = category === "main" ? Math.ceil(spRow.win_bonus_max * repMod * 2) + 1 : 0;
                maxSeasons = category === "banner" ? 2 : 3;
                if (!Number.isFinite(body.monthlyAmount) || body.monthlyAmount < 0 || body.monthlyAmount > maxMonthly)
                    return [2 /*return*/, c.json({ error: "Neplatná výše sponzoringu" }, 400)];
                if (!Number.isFinite(body.winBonus) || body.winBonus < 0 || body.winBonus > maxWinBonus)
                    return [2 /*return*/, c.json({ error: "Neplatný bonus za výhru" }, 400)];
                if (!Number.isInteger(body.seasons) || body.seasons < 1 || body.seasons > maxSeasons)
                    return [2 /*return*/, c.json({ error: "Neplatná délka smlouvy" }, 400)];
                validatedTerminationFee = Math.round(body.monthlyAmount * body.seasons * (category === "banner" ? 1.5 : 2));
                if (!(category === "main")) return [3 /*break*/, 7];
                return [4 /*yield*/, c.env.DB.prepare("SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1")
                        .first().catch(function (e) { logger_1.logger.warn({ module: "game" }, "fetch season for sponsor signing", e); return null; })];
            case 5:
                season = _c.sent();
                sn = (0, season_1.mustSeason)(season === null || season === void 0 ? void 0 : season.number);
                return [4 /*yield*/, c.env.DB.prepare("SELECT last_main_sponsor_change_season FROM teams WHERE id = ?")
                        .bind(teamId).first().catch(function (e) { logger_1.logger.warn({ module: "game" }, "fetch sponsor change limit", e); return null; })];
            case 6:
                team = _c.sent();
                if (((_a = team === null || team === void 0 ? void 0 : team.last_main_sponsor_change_season) !== null && _a !== void 0 ? _a : 0) >= sn) {
                    return [2 /*return*/, c.json({ error: "Hlavního sponzora lze změnit pouze jednou za sezónu" }, 400)];
                }
                _c.label = 7;
            case 7:
                id = crypto.randomUUID();
                return [4 /*yield*/, c.env.DB.prepare("INSERT INTO sponsor_contracts (id, team_id, sponsor_name, sponsor_type, monthly_amount, win_bonus,\n      seasons_total, seasons_remaining, early_termination_fee, is_naming_rights, category)\n     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, teamId, body.sponsorName, body.sponsorType, body.monthlyAmount, body.winBonus, body.seasons, body.seasons, validatedTerminationFee, body.isNamingRights ? 1 : 0, category).run()];
            case 8:
                _c.sent();
                if (!(category === "main")) return [3 /*break*/, 16];
                return [4 /*yield*/, c.env.DB.prepare("SELECT name, village_id FROM teams WHERE id = ?")
                        .bind(teamId).first()];
            case 9:
                teamInfo = _c.sent();
                return [4 /*yield*/, c.env.DB.prepare("SELECT name FROM villages WHERE id = ?")
                        .bind(teamInfo.village_id).first().catch(function (e) { logger_1.logger.warn({ module: "game" }, "fetch village for sponsor rename", e); return null; })];
            case 10:
                village = _c.sent();
                oldName = teamInfo.name;
                newName = "FK ".concat(body.sponsorName, " ").concat((_b = village === null || village === void 0 ? void 0 : village.name) !== null && _b !== void 0 ? _b : "").trim();
                return [4 /*yield*/, c.env.DB.prepare("SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1")
                        .first().catch(function (e) { logger_1.logger.warn({ module: "game" }, "fetch season for sponsor rename", e); return null; })];
            case 11:
                season = _c.sent();
                // Reputation penalty for name change (-3)
                return [4 /*yield*/, c.env.DB.prepare("UPDATE teams SET name = ?, last_main_sponsor_change_season = ?, reputation = MAX(0, reputation - 3) WHERE id = ?")
                        .bind(newName, (0, season_1.mustSeason)(season === null || season === void 0 ? void 0 : season.number), teamId).run()];
            case 12:
                // Reputation penalty for name change (-3)
                _c.sent();
                // Přejmenování promítnout i do poháru a do U21 týmu klubu (jinak drží starý název).
                return [4 /*yield*/, c.env.DB.prepare("UPDATE cup_teams SET name = ? WHERE team_id = ?")
                        .bind(newName, teamId).run().catch(function (e) { return logger_1.logger.warn({ module: "game" }, "rename cup_teams on sponsor change", e); })];
            case 13:
                // Přejmenování promítnout i do poháru a do U21 týmu klubu (jinak drží starý název).
                _c.sent();
                return [4 /*yield*/, c.env.DB.prepare("UPDATE teams SET name = ? WHERE parent_team_id = ? AND team_type = 'u21'")
                        .bind("".concat(newName, " U21"), teamId).run().catch(function (e) { return logger_1.logger.warn({ module: "game" }, "rename U21 on sponsor change", e); })];
            case 14:
                _c.sent();
                // News for entire league
                return [4 /*yield*/, c.env.DB.prepare("INSERT INTO news (id, league_id, type, title, body, created_at) VALUES (?, (SELECT league_id FROM teams WHERE id = ?), 'rename', ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))").bind(crypto.randomUUID(), teamId, "".concat(oldName, " m\u011Bn\u00ED n\u00E1zev na ").concat(newName), "Klub ".concat(oldName, " podepsal sponzorskou smlouvu s ").concat(body.sponsorName, " a m\u011Bn\u00ED sv\u016Fj n\u00E1zev na ").concat(newName, ". Fanou\u0161ci nejsou nad\u0161en\u00ED (-3 reputace).")).run().catch(function (e) { return logger_1.logger.warn({ module: "game" }, "insert sponsor rename news", e); })];
            case 15:
                // News for entire league
                _c.sent();
                return [2 /*return*/, c.json({ ok: true, contractId: id, newTeamName: newName, reputationPenalty: 3 })];
            case 16:
                if (!(category === "stadium")) return [3 /*break*/, 18];
                return [4 /*yield*/, c.env.DB.prepare("UPDATE teams SET stadium_name = ? WHERE id = ?")
                        .bind(body.sponsorName, teamId).run()];
            case 17:
                _c.sent();
                _c.label = 18;
            case 18: return [2 /*return*/, c.json({ ok: true, contractId: id })];
        }
    });
}); });
// POST /api/teams/:teamId/sponsors/renew — prodloužení stávající smlouvy za aktuální podmínky
// (stejný sponzor: bez přejmenování, bez reputační sankce, nepočítá se jako změna hlavního sponzora)
gameRouter.post("/teams/:teamId/sponsors/renew", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, body, contract, cat_1, active, econ, spRows, season, seedFromString, terms;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, c.req.json()
                        .catch(function (e) { logger_1.logger.warn({ module: "game", teamId: teamId }, "parse sponsor renew body", e); return null; })];
            case 1:
                body = _a.sent();
                if (!(body === null || body === void 0 ? void 0 : body.contractId))
                    return [2 /*return*/, c.json({ error: "Chybí contractId" }, 400)];
                return [4 /*yield*/, c.env.DB.prepare("SELECT * FROM sponsor_contracts WHERE id = ? AND team_id = ? AND status IN ('active', 'expired')").bind(body.contractId, teamId).first()];
            case 2:
                contract = _a.sent();
                if (!contract)
                    return [2 /*return*/, c.json({ error: "Smlouva nenalezena" }, 404)];
                if (!(contract.status === "expired")) return [3 /*break*/, 4];
                cat_1 = contract.category || "main";
                return [4 /*yield*/, c.env.DB.prepare("SELECT id, category FROM sponsor_contracts WHERE team_id = ? AND status = 'active'").bind(teamId).all().catch(function (e) { logger_1.logger.warn({ module: "game", teamId: teamId }, "renew expired active check", e); return { results: [] }; })];
            case 3:
                active = _a.sent();
                if (cat_1 === "banner") {
                    if (active.results.filter(function (r) { return r.category === "banner"; }).length >= 6)
                        return [2 /*return*/, c.json({ error: "Maximální počet bannerů je dosažen" }, 400)];
                }
                else if (active.results.some(function (r) { return (r.category || "main") === cat_1; })) {
                    return [2 /*return*/, c.json({ error: "V této kategorii už máš aktivní smlouvu" }, 400)];
                }
                _a.label = 4;
            case 4: return [4 /*yield*/, c.env.DB.prepare("SELECT t.reputation, v.size, v.district FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?").bind(teamId).first()
                    .catch(function (e) { logger_1.logger.warn({ module: "game", teamId: teamId }, "sponsor renew econ lookup", e); return null; })];
            case 5:
                econ = _a.sent();
                if (!econ)
                    return [2 /*return*/, c.json({ error: "Tým nenalezen" }, 404)];
                return [4 /*yield*/, c.env.DB.prepare("SELECT * FROM district_sponsors WHERE district = ?")
                        .bind(econ.district).all().catch(function (e) { logger_1.logger.warn({ module: "game", teamId: teamId }, "sponsor renew bounds", e); return { results: [] }; })];
            case 6:
                spRows = _a.sent();
                return [4 /*yield*/, c.env.DB.prepare("SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1")
                        .first().catch(function (e) { logger_1.logger.warn({ module: "game" }, "fetch season for renew", e); return null; })];
            case 7:
                season = _a.sent();
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../lib/seed"); })];
            case 8:
                seedFromString = (_a.sent()).seedFromString;
                terms = computeRenewalTerms(teamId, (0, season_1.mustSeason)(season === null || season === void 0 ? void 0 : season.number), contract, econ.reputation, econ.size, spRows.results, seedFromString);
                return [4 /*yield*/, c.env.DB.prepare("UPDATE sponsor_contracts SET status = 'active', monthly_amount = ?, win_bonus = ?, seasons_total = ?, seasons_remaining = ?, early_termination_fee = ? WHERE id = ?").bind(terms.monthlyAmount, terms.winBonus, terms.seasons, terms.seasons, terms.earlyTerminationFee, body.contractId).run()];
            case 9:
                _a.sent();
                return [2 /*return*/, c.json({ ok: true, renewed: terms })];
        }
    });
}); });
// POST /api/teams/:id/sponsors/terminate — early termination (with fee)
gameRouter.post("/teams/:teamId/sponsors/terminate", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, body, category, allActiveT, contractRow, contract, fee, team, village, oldName, defaultName;
    var _a, _b, _c;
    return __generator(this, function (_d) {
        switch (_d.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, c.req.json().catch(function (e) { logger_1.logger.warn({ module: "game" }, "parse terminate body", e); return { category: "main", contractId: undefined }; })];
            case 1:
                body = _d.sent();
                category = body.category || "main";
                return [4 /*yield*/, c.env.DB.prepare("SELECT id, early_termination_fee, seasons_remaining, category FROM sponsor_contracts WHERE team_id = ? AND status = 'active'").bind(teamId).all().catch(function (e) { logger_1.logger.warn({ module: "game" }, "fetch contracts for termination", e); return { results: [] }; })];
            case 2:
                allActiveT = _d.sent();
                contractRow = category === "banner"
                    ? allActiveT.results.find(function (r) { return r.id === body.contractId && r.category === "banner"; })
                    : allActiveT.results.find(function (r) { return (r.category || "main") === category; });
                contract = contractRow ? {
                    id: contractRow.id,
                    early_termination_fee: contractRow.early_termination_fee,
                    seasons_remaining: contractRow.seasons_remaining,
                } : null;
                if (!contract)
                    return [2 /*return*/, c.json({ error: "Žádná aktivní smlouva" }, 400)];
                fee = Math.round(contract.early_termination_fee * (contract.seasons_remaining / 3));
                return [4 /*yield*/, c.env.DB.prepare("SELECT budget, village_id FROM teams WHERE id = ?")
                        .bind(teamId).first()];
            case 3:
                team = _d.sent();
                if (!team || team.budget < fee)
                    return [2 /*return*/, c.json({ error: "Nedostatek pen\u011Bz (sankce ".concat(fee, " K\u010D)") }, 400)];
                // Deduct fee + terminate
                return [4 /*yield*/, (0, finance_processor_1.recordTransaction)(c.env.DB, teamId, "sponsor_termination", -fee, "Ukon\u010Den\u00ED sponzorsk\u00E9 smlouvy (sankce)", new Date().toISOString())];
            case 4:
                // Deduct fee + terminate
                _d.sent();
                return [4 /*yield*/, c.env.DB.prepare("UPDATE sponsor_contracts SET status = 'terminated' WHERE id = ?").bind(contract.id).run()];
            case 5:
                _d.sent();
                return [4 /*yield*/, c.env.DB.prepare("SELECT name FROM villages WHERE id = ?")
                        .bind(team.village_id).first().catch(function (e) { logger_1.logger.warn({ module: "game" }, "fetch village for termination", e); return null; })];
            case 6:
                village = _d.sent();
                if (!(category === "main")) return [3 /*break*/, 10];
                return [4 /*yield*/, c.env.DB.prepare("SELECT name FROM teams WHERE id = ?").bind(teamId).first()];
            case 7:
                oldName = (_b = (_a = (_d.sent())) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : "";
                defaultName = "SK ".concat((_c = village === null || village === void 0 ? void 0 : village.name) !== null && _c !== void 0 ? _c : "").trim();
                return [4 /*yield*/, c.env.DB.prepare("UPDATE teams SET name = ?, reputation = MAX(0, reputation - 2) WHERE id = ?")
                        .bind(defaultName, teamId).run()];
            case 8:
                _d.sent();
                // News for entire league
                return [4 /*yield*/, c.env.DB.prepare("INSERT INTO news (id, league_id, type, title, body, created_at) VALUES (?, (SELECT league_id FROM teams WHERE id = ?), 'rename', ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))").bind(crypto.randomUUID(), teamId, "".concat(oldName, " se p\u0159ejmenov\u00E1v\u00E1 na ").concat(defaultName), "Klub ".concat(oldName, " ukon\u010Dil sponzorskou smlouvu a vrac\u00ED se k n\u00E1zvu ").concat(defaultName, ". Fanou\u0161ci zmaten\u00ED (-2 reputace).")).run().catch(function (e) { return logger_1.logger.warn({ module: "game" }, "insert termination rename news", e); })];
            case 9:
                // News for entire league
                _d.sent();
                return [2 /*return*/, c.json({ ok: true, fee: fee, newTeamName: defaultName, reputationPenalty: 2 })];
            case 10:
                if (!(category === "stadium")) return [3 /*break*/, 12];
                if (!village) return [3 /*break*/, 12];
                return [4 /*yield*/, c.env.DB.prepare("UPDATE teams SET stadium_name = ? WHERE id = ?")
                        .bind("Sportovn\u00ED are\u00E1l ".concat(village.name), teamId).run()];
            case 11:
                _d.sent();
                _d.label = 12;
            case 12: 
            // Banner — žádné rename ani penalty na reputaci
            return [2 /*return*/, c.json({ ok: true, fee: fee })];
        }
    });
}); });
// POST /api/teams/:id/rename — custom rename (after sponsor termination, once per season)
gameRouter.post("/teams/:teamId/rename", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, name, season, sn, team, activeSponsor, oldName, newName;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, c.req.json()];
            case 1:
                name = (_b.sent()).name;
                if (!name || name.trim().length < 2 || name.trim().length > 50) {
                    return [2 /*return*/, c.json({ error: "Název musí mít 2-50 znaků" }, 400)];
                }
                return [4 /*yield*/, c.env.DB.prepare("SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1")
                        .first().catch(function (e) { logger_1.logger.warn({ module: "game" }, "fetch season for rename", e); return null; })];
            case 2:
                season = _b.sent();
                sn = (0, season_1.mustSeason)(season === null || season === void 0 ? void 0 : season.number);
                return [4 /*yield*/, c.env.DB.prepare("SELECT name, last_main_sponsor_change_season FROM teams WHERE id = ?")
                        .bind(teamId).first().catch(function (e) { logger_1.logger.warn({ module: "game" }, "fetch team for rename", e); return null; })];
            case 3:
                team = _b.sent();
                if (!team)
                    return [2 /*return*/, c.json({ error: "Team not found" }, 404)];
                if (((_a = team.last_main_sponsor_change_season) !== null && _a !== void 0 ? _a : 0) >= sn) {
                    return [2 /*return*/, c.json({ error: "Název lze změnit pouze jednou za sezónu" }, 400)];
                }
                return [4 /*yield*/, c.env.DB.prepare("SELECT id FROM sponsor_contracts WHERE team_id = ? AND status = 'active' AND (category = 'main' OR category IS NULL)").bind(teamId).first().catch(function (e) { logger_1.logger.warn({ module: "game" }, "check active sponsor for rename", e); return null; })];
            case 4:
                activeSponsor = _b.sent();
                if (activeSponsor)
                    return [2 /*return*/, c.json({ error: "Nelze přejmenovat při aktivní sponzorské smlouvě" }, 400)];
                oldName = team.name;
                newName = name.trim();
                // Reputation penalty (-3)
                return [4 /*yield*/, c.env.DB.prepare("UPDATE teams SET name = ?, last_main_sponsor_change_season = ?, reputation = MAX(0, reputation - 3) WHERE id = ?")
                        .bind(newName, sn, teamId).run()];
            case 5:
                // Reputation penalty (-3)
                _b.sent();
                // News for entire league
                return [4 /*yield*/, c.env.DB.prepare("INSERT INTO news (id, league_id, type, title, body, created_at) VALUES (?, (SELECT league_id FROM teams WHERE id = ?), 'rename', ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))").bind(crypto.randomUUID(), teamId, "".concat(oldName, " se p\u0159ejmenov\u00E1v\u00E1 na ").concat(newName), "Klub ".concat(oldName, " m\u011Bn\u00ED sv\u016Fj n\u00E1zev na ").concat(newName, ". Fanou\u0161ci reaguj\u00ED rozpa\u010Dit\u011B (-3 reputace).")).run().catch(function (e) { return logger_1.logger.warn({ module: "game" }, "insert rename news", e); })];
            case 6:
                // News for entire league
                _b.sent();
                return [2 /*return*/, c.json({ ok: true, newName: newName, reputationPenalty: 3 })];
        }
    });
}); });
// POST /api/leagues/:leagueId/generate-schedule — generate schedule if missing
gameRouter.post("/leagues/:leagueId/generate-schedule", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var leagueId, league, existing, teamRows, teamIds, generateSchedule, generateSeasonCalendar, rng, schedule, calendar, _i, _a, entry, calendarByWeek, _b, _c, entry, inserted, _d, schedule_1, match, calId;
    var _e;
    return __generator(this, function (_f) {
        switch (_f.label) {
            case 0:
                leagueId = c.req.param("leagueId");
                return [4 /*yield*/, c.env.DB.prepare("SELECT l.id, l.season_id, s.number as season_number FROM leagues l JOIN seasons s ON l.season_id = s.id WHERE l.id = ?").bind(leagueId).first().catch(function (e) { logger_1.logger.warn({ module: "game" }, "fetch league for schedule", e); return null; })];
            case 1:
                league = _f.sent();
                if (!league)
                    return [2 /*return*/, c.json({ error: "League not found" }, 404)];
                return [4 /*yield*/, c.env.DB.prepare("SELECT COUNT(*) as cnt FROM matches WHERE league_id = ?").bind(leagueId).first().catch(function (e) { logger_1.logger.warn({ module: "game" }, "count existing schedule", e); return { cnt: 0 }; })];
            case 2:
                existing = _f.sent();
                if (existing && existing.cnt > 0)
                    return [2 /*return*/, c.json({ error: "Schedule already exists", matchCount: existing.cnt }, 400)];
                return [4 /*yield*/, c.env.DB.prepare("SELECT id FROM teams WHERE league_id = ? ORDER BY name").bind(leagueId).all().catch(function (e) { logger_1.logger.warn({ module: "game" }, "fetch teams for schedule", e); return { results: [] }; })];
            case 3:
                teamRows = _f.sent();
                teamIds = teamRows.results.map(function (r) { return r.id; });
                if (teamIds.length < 2)
                    return [2 /*return*/, c.json({ error: "Not enough teams" }, 400)];
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../league/schedule"); })];
            case 4:
                generateSchedule = (_f.sent()).generateSchedule;
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../season/calendar"); })];
            case 5:
                generateSeasonCalendar = (_f.sent()).generateSeasonCalendar;
                rng = (0, rng_1.createRng)((0, rng_1.cryptoSeed)());
                schedule = generateSchedule(rng, teamIds.length);
                calendar = generateSeasonCalendar(leagueId, league.season_number, new Date());
                _i = 0, _a = calendar.entries;
                _f.label = 6;
            case 6:
                if (!(_i < _a.length)) return [3 /*break*/, 9];
                entry = _a[_i];
                return [4 /*yield*/, c.env.DB.prepare("INSERT OR IGNORE INTO season_calendar (id, league_id, season_number, game_week, match_day, scheduled_at, status) VALUES (?, ?, ?, ?, ?, ?, 'scheduled')").bind(entry.id, leagueId, league.season_number, entry.gameWeek, entry.matchDay, entry.scheduledAt).run().catch(function (e) { return logger_1.logger.warn({ module: "game" }, "insert calendar entry", e); })];
            case 7:
                _f.sent();
                _f.label = 8;
            case 8:
                _i++;
                return [3 /*break*/, 6];
            case 9:
                calendarByWeek = new Map();
                for (_b = 0, _c = calendar.entries; _b < _c.length; _b++) {
                    entry = _c[_b];
                    if (!calendarByWeek.has(entry.gameWeek)) {
                        calendarByWeek.set(entry.gameWeek, entry.id);
                    }
                }
                inserted = 0;
                _d = 0, schedule_1 = schedule;
                _f.label = 10;
            case 10:
                if (!(_d < schedule_1.length)) return [3 /*break*/, 13];
                match = schedule_1[_d];
                if (match.homeTeamIndex >= teamIds.length || match.awayTeamIndex >= teamIds.length)
                    return [3 /*break*/, 12];
                calId = (_e = calendarByWeek.get(match.round)) !== null && _e !== void 0 ? _e : null;
                return [4 /*yield*/, c.env.DB.prepare("INSERT INTO matches (id, league_id, calendar_id, round, home_team_id, away_team_id, status) VALUES (?, ?, ?, ?, ?, ?, 'scheduled')").bind(crypto.randomUUID(), leagueId, calId, match.round, teamIds[match.homeTeamIndex], teamIds[match.awayTeamIndex]).run().catch(function (e) { return logger_1.logger.warn({ module: "game" }, "insert match", e); })];
            case 11:
                _f.sent();
                inserted++;
                _f.label = 12;
            case 12:
                _d++;
                return [3 /*break*/, 10];
            case 13: return [2 /*return*/, c.json({ ok: true, matchesCreated: inserted, calendarEntries: calendar.entries.length, teams: teamIds.length })];
        }
    });
}); });
// GET /api/teams/:id/season-info — season number, current day, total days, upcoming events
gameRouter.get("/teams/:teamId/season-info", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, team, _a, leagueRes, calRes, league, calEntries, firstEntry, lastEntry, seasonStart, seasonEnd, now, totalDays, currentDay, upcoming, _i, calEntries_1, entry, isHome, opponent, matchStatus, friendlyMatches, _b, _c, fm, isHome, opponent, fmStatus, sessions, defaultDayMap, customDays, parsed, trainingDays, matchDatesSet, typeLabels, approachLabels, label, approach, today, daysToGenerate, d, day, dow, dayKey, tomorrow, tomorrowKey, skipped, gameNow, futureEvents;
    var _d, _e, _f, _g, _h, _j, _k;
    return __generator(this, function (_l) {
        switch (_l.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, c.env.DB.prepare("SELECT league_id, training_type, training_sessions, training_approach, training_days, season_start, season_end, game_date FROM teams WHERE id = ?")
                        .bind(teamId).first()];
            case 1:
                team = _l.sent();
                if (!(team === null || team === void 0 ? void 0 : team.league_id))
                    return [2 /*return*/, c.json({ season: 1, currentDay: 1, totalDays: 1, upcoming: [] })];
                return [4 /*yield*/, c.env.DB.batch([
                        c.env.DB.prepare("SELECT l.id, s.number as season_number FROM leagues l JOIN seasons s ON l.season_id = s.id WHERE l.id = ?").bind(team.league_id),
                        c.env.DB.prepare("SELECT sc.*, m.home_team_id, m.away_team_id, m.status as match_status, m.home_score, m.away_score, ht.name as home_name, at.name as away_name FROM season_calendar sc LEFT JOIN matches m ON m.calendar_id = sc.id AND (m.home_team_id = ? OR m.away_team_id = ?) LEFT JOIN teams ht ON m.home_team_id = ht.id LEFT JOIN teams at ON m.away_team_id = at.id WHERE sc.league_id = ? AND sc.season_number = (SELECT MAX(sc2.season_number) FROM season_calendar sc2 WHERE sc2.league_id = sc.league_id) ORDER BY sc.scheduled_at ASC").bind(teamId, teamId, team.league_id),
                    ])];
            case 2:
                _a = _l.sent(), leagueRes = _a[0], calRes = _a[1];
                league = (_d = leagueRes.results[0]) !== null && _d !== void 0 ? _d : null;
                calEntries = calRes.results;
                if (calEntries.length === 0)
                    return [2 /*return*/, c.json({ season: (0, season_1.mustSeason)(league === null || league === void 0 ? void 0 : league.season_number), currentDay: 1, totalDays: 1, upcoming: [] })];
                firstEntry = calEntries[0];
                lastEntry = calEntries[calEntries.length - 1];
                seasonStart = team.season_start ? new Date(team.season_start) : new Date(firstEntry.scheduled_at);
                seasonEnd = team.season_end ? new Date(team.season_end) : new Date(lastEntry.scheduled_at);
                now = team.game_date ? new Date(team.game_date) : new Date();
                totalDays = Math.max(1, Math.ceil((seasonEnd.getTime() - seasonStart.getTime()) / (24 * 60 * 60 * 1000)));
                currentDay = Math.max(1, Math.min(totalDays, Math.ceil((now.getTime() - seasonStart.getTime()) / (24 * 60 * 60 * 1000))));
                upcoming = [];
                // My matches
                for (_i = 0, calEntries_1 = calEntries; _i < calEntries_1.length; _i++) {
                    entry = calEntries_1[_i];
                    if (!entry.home_team_id)
                        continue; // no match for this team in this slot
                    isHome = entry.home_team_id === teamId;
                    opponent = isHome ? entry.away_name : entry.home_name;
                    matchStatus = entry.match_status;
                    upcoming.push({
                        type: "match",
                        date: entry.scheduled_at,
                        title: "".concat(entry.game_week, ". kolo \u2014 ").concat(opponent !== null && opponent !== void 0 ? opponent : "Soupeř"),
                        subtitle: isHome ? "Doma" : "Venku",
                        status: matchStatus === "simulated"
                            ? "".concat(entry.home_score, ":").concat(entry.away_score)
                            : "Naplánováno",
                        isHome: isHome,
                    });
                }
                return [4 /*yield*/, c.env.DB.prepare("SELECT m.id, m.status, m.home_team_id, m.away_team_id, m.home_score, m.away_score, m.created_at, m.simulated_at,\n       t1.name as home_name, t2.name as away_name\n     FROM matches m\n     JOIN teams t1 ON m.home_team_id = t1.id\n     JOIN teams t2 ON m.away_team_id = t2.id\n     WHERE (m.home_team_id = ? OR m.away_team_id = ?) AND m.calendar_id IS NULL\n       AND COALESCE(m.simulated_at, m.created_at) >= ?\n     ORDER BY m.created_at DESC LIMIT 10").bind(teamId, teamId, (_e = team.season_start) !== null && _e !== void 0 ? _e : "1970-01-01").all().catch(function (e) { logger_1.logger.warn({ module: "game" }, "load friendlies for calendar", e); return { results: [] }; })];
            case 3:
                friendlyMatches = _l.sent();
                for (_b = 0, _c = friendlyMatches.results; _b < _c.length; _b++) {
                    fm = _c[_b];
                    isHome = fm.home_team_id === teamId;
                    opponent = isHome ? fm.away_name : fm.home_name;
                    fmStatus = fm.status;
                    upcoming.push({
                        type: "match",
                        date: ((_f = fm.simulated_at) !== null && _f !== void 0 ? _f : fm.created_at),
                        title: "P\u0159\u00E1tel\u00E1k \u2014 ".concat(opponent),
                        subtitle: isHome ? "Doma" : "Venku",
                        status: fmStatus === "simulated"
                            ? "".concat(fm.home_score, ":").concat(fm.away_score)
                            : fmStatus === "lineups_open" ? "Nastav sestavu!" : "Naplánováno",
                        isHome: isHome,
                    });
                }
                // Training days — custom training_days override default mapping podle sessions
                if (team.training_type) {
                    sessions = (_g = team.training_sessions) !== null && _g !== void 0 ? _g : 2;
                    defaultDayMap = {
                        1: [2], 2: [2, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 4, 5],
                    };
                    customDays = null;
                    if (team.training_days) {
                        try {
                            parsed = JSON.parse(team.training_days);
                            if (Array.isArray(parsed) && parsed.every(function (d) { return typeof d === "number" && d >= 1 && d <= 5; })) {
                                customDays = parsed;
                            }
                        }
                        catch (e) {
                            logger_1.logger.warn({ module: "game", teamId: teamId }, "parse training_days for calendar", e);
                        }
                    }
                    trainingDays = (customDays && customDays.length > 0) ? customDays : ((_h = defaultDayMap[sessions]) !== null && _h !== void 0 ? _h : defaultDayMap[2]);
                    matchDatesSet = new Set(upcoming.filter(function (e) { return e.type === "match"; }).map(function (e) { return e.date.slice(0, 10); }));
                    typeLabels = { conditioning: "Kondice", technique: "Technika", tactics: "Taktika", match_practice: "Zápasový" };
                    approachLabels = { strict: "přísný", balanced: "vyrovnaný", relaxed: "volný" };
                    label = (_j = typeLabels[team.training_type]) !== null && _j !== void 0 ? _j : team.training_type;
                    approach = team.training_approach ? (_k = approachLabels[team.training_approach]) !== null && _k !== void 0 ? _k : "" : "";
                    today = new Date(now);
                    daysToGenerate = Math.max(14, totalDays - currentDay + 1);
                    for (d = 0; d < daysToGenerate; d++) {
                        day = new Date(today);
                        day.setDate(today.getDate() + d);
                        dow = day.getDay();
                        if (trainingDays.includes(dow)) {
                            dayKey = day.toISOString().slice(0, 10);
                            tomorrow = new Date(day);
                            tomorrow.setDate(tomorrow.getDate() + 1);
                            tomorrowKey = tomorrow.toISOString().slice(0, 10);
                            skipped = matchDatesSet.has(dayKey) || matchDatesSet.has(tomorrowKey);
                            upcoming.push(__assign({ type: "training", date: day.toISOString(), title: skipped ? "Volno \u2014 z\u00E1pas v dohledu" : "Tr\u00E9nink \u2014 ".concat(label), subtitle: approach ? "".concat(sessions, "\u00D7/t\u00FDden \u00B7 ").concat(approach) : "".concat(sessions, "\u00D7/t\u00FDden") }, (skipped ? { status: "Přeskočeno" } : {})));
                        }
                    }
                }
                // Sort by date and take next events
                upcoming.sort(function (a, b) { return new Date(a.date).getTime() - new Date(b.date).getTime(); });
                gameNow = new Date(now);
                gameNow.setUTCHours(0, 0, 0, 0);
                futureEvents = upcoming.filter(function (e) { return new Date(e.date) >= gameNow || e.status === "Naplánováno"; });
                return [2 /*return*/, c.json({
                        season: (0, season_1.mustSeason)(league === null || league === void 0 ? void 0 : league.season_number),
                        currentDay: currentDay,
                        totalDays: totalDays,
                        gameDate: now.toISOString(),
                        upcoming: upcoming,
                    })];
        }
    });
}); });
// POST /api/game/ai-market — force AI market activity for testing
gameRouter.post("/game/ai-market", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var body, league, _a, generateAiListings, generateAiOffers, rng, listings, offers, i, _b, _c;
    return __generator(this, function (_d) {
        switch (_d.label) {
            case 0: return [4 /*yield*/, c.req.json().catch(function (e) { logger_1.logger.warn({ module: "game" }, "parse ai-market body", e); return null; })];
            case 1:
                body = _d.sent();
                if (!(body === null || body === void 0 ? void 0 : body.leagueId))
                    return [2 /*return*/, c.json({ error: "Missing leagueId" }, 400)];
                return [4 /*yield*/, c.env.DB.prepare("SELECT district FROM leagues WHERE id = ?").bind(body.leagueId).first()];
            case 2:
                league = _d.sent();
                if (!league)
                    return [2 /*return*/, c.json({ error: "League not found" }, 404)];
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../transfers/virtual-teams"); })];
            case 3:
                _a = _d.sent(), generateAiListings = _a.generateAiListings, generateAiOffers = _a.generateAiOffers;
                rng = (0, rng_1.createRng)((0, rng_1.cryptoSeed)());
                listings = 0, offers = 0;
                i = 0;
                _d.label = 4;
            case 4:
                if (!(i < 5)) return [3 /*break*/, 8];
                _b = listings;
                return [4 /*yield*/, generateAiListings(c.env.DB, league.district, body.leagueId, rng)];
            case 5:
                listings = _b + _d.sent();
                _c = offers;
                return [4 /*yield*/, generateAiOffers(c.env.DB, league.district, body.leagueId, rng)];
            case 6:
                offers = _c + _d.sent();
                _d.label = 7;
            case 7:
                i++;
                return [3 /*break*/, 4];
            case 8: return [2 /*return*/, c.json({ ok: true, listings: listings, offers: offers, district: league.district })];
        }
    });
}); });
// POST /api/game/seed-market — admin: napln trh AI hráči, obnov/dopln volné hráče v okrese,
// volitelně vygeneruj legendu. Vše pro danou ligu, obejde běžné stropy (ruční admin doplnění).
// Body: { leagueId, listings?, freeAgents?, replaceFreeAgents?, celebrity?, celebrityTier? }
gameRouter.post("/game/seed-market", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var body, league, district, rng, wantFreeAgents, wantListings, gd, gameDate, result, generateFreeAgentsForDistrict, removed, del, gen, generateAiListings, made, i, _a, spawnCelebrity, _b;
    var _c, _d, _e, _f, _g;
    return __generator(this, function (_h) {
        switch (_h.label) {
            case 0: return [4 /*yield*/, c.req.json()
                    .catch(function (e) { logger_1.logger.warn({ module: "game" }, "parse seed-market body", e); return null; })];
            case 1:
                body = _h.sent();
                if (!(body === null || body === void 0 ? void 0 : body.leagueId))
                    return [2 /*return*/, c.json({ error: "Missing leagueId" }, 400)];
                return [4 /*yield*/, c.env.DB.prepare("SELECT district FROM leagues WHERE id = ?").bind(body.leagueId).first()];
            case 2:
                league = _h.sent();
                if (!league)
                    return [2 /*return*/, c.json({ error: "League not found" }, 404)];
                district = league.district;
                rng = (0, rng_1.createRng)((0, rng_1.cryptoSeed)());
                wantFreeAgents = Math.min(Math.max(0, (_c = body.freeAgents) !== null && _c !== void 0 ? _c : 0), 30);
                wantListings = Math.min(Math.max(0, (_d = body.listings) !== null && _d !== void 0 ? _d : 0), 30);
                return [4 /*yield*/, c.env.DB.prepare("SELECT game_date FROM teams WHERE league_id = ? AND game_date IS NOT NULL LIMIT 1")
                        .bind(body.leagueId).first().catch(function (e) { logger_1.logger.warn({ module: "game" }, "seed-market game_date lookup", e); return null; })];
            case 3:
                gd = _h.sent();
                gameDate = (gd === null || gd === void 0 ? void 0 : gd.game_date) ? new Date(gd.game_date) : new Date();
                result = { district: district };
                if (!(wantFreeAgents > 0)) return [3 /*break*/, 8];
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../transfers/free-agent-pool"); })];
            case 4:
                generateFreeAgentsForDistrict = (_h.sent()).generateFreeAgentsForDistrict;
                removed = 0;
                if (!body.replaceFreeAgents) return [3 /*break*/, 6];
                return [4 /*yield*/, c.env.DB.prepare("DELETE FROM free_agents WHERE id IN (SELECT id FROM free_agents WHERE district = ? ORDER BY overall_rating ASC LIMIT ?)").bind(district, wantFreeAgents).run().catch(function (e) { logger_1.logger.warn({ module: "game" }, "seed-market delete weak FA", e); return null; })];
            case 5:
                del = _h.sent();
                removed = (_f = (_e = del === null || del === void 0 ? void 0 : del.meta) === null || _e === void 0 ? void 0 : _e.changes) !== null && _f !== void 0 ? _f : 0;
                _h.label = 6;
            case 6: return [4 /*yield*/, generateFreeAgentsForDistrict(c.env.DB, rng, district, wantFreeAgents, gameDate)];
            case 7:
                gen = _h.sent();
                result.freeAgents = { removed: removed, generated: gen };
                _h.label = 8;
            case 8:
                if (!(wantListings > 0)) return [3 /*break*/, 14];
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../transfers/virtual-teams"); })];
            case 9:
                generateAiListings = (_h.sent()).generateAiListings;
                made = 0;
                i = 0;
                _h.label = 10;
            case 10:
                if (!(i < wantListings)) return [3 /*break*/, 13];
                _a = made;
                return [4 /*yield*/, generateAiListings(c.env.DB, district, body.leagueId, rng, { force: true })];
            case 11:
                made = _a + _h.sent();
                _h.label = 12;
            case 12:
                i++;
                return [3 /*break*/, 10];
            case 13:
                result.listings = made;
                _h.label = 14;
            case 14:
                if (!body.celebrity) return [3 /*break*/, 17];
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../season/celebrity-spawn"); })];
            case 15:
                spawnCelebrity = (_h.sent()).spawnCelebrity;
                _b = result;
                return [4 /*yield*/, spawnCelebrity(c.env.DB, body.leagueId, rng, "legend", (_g = body.celebrityTier) !== null && _g !== void 0 ? _g : "A")];
            case 16:
                _b.celebrity = _h.sent();
                _h.label = 17;
            case 17: return [2 /*return*/, c.json(__assign({ ok: true }, result))];
        }
    });
}); });
// POST /api/game/spawn-celebrity — force spawn celebrity for testing
gameRouter.post("/game/spawn-celebrity", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var body, spawnCelebrity, rng, result;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, c.req.json().catch(function (e) { logger_1.logger.warn({ module: "game" }, "parse spawn-celebrity body", e); return null; })];
            case 1:
                body = _a.sent();
                if (!(body === null || body === void 0 ? void 0 : body.leagueId))
                    return [2 /*return*/, c.json({ error: "Missing leagueId" }, 400)];
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../season/celebrity-spawn"); })];
            case 2:
                spawnCelebrity = (_a.sent()).spawnCelebrity;
                rng = (0, rng_1.createRng)((0, rng_1.cryptoSeed)());
                return [4 /*yield*/, spawnCelebrity(c.env.DB, body.leagueId, rng, body.type, body.tier)];
            case 3:
                result = _a.sent();
                return [2 /*return*/, c.json({ ok: true, result: result })];
        }
    });
}); });
// POST /api/game/set-admin — nastavit admin roli (vyžaduje admin session přes middleware výše)
// Prvního admina je nutné nastavit přímo přes: npx wrangler d1 execute <db> --remote --command
// 'UPDATE users SET is_admin = 1 WHERE email = "admin@example.com"'
gameRouter.post("/game/set-admin", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var body;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, c.req.json().catch(function (e) { logger_1.logger.warn({ module: "game" }, "parse set-admin body", e); return null; })];
            case 1:
                body = _a.sent();
                if (!(body === null || body === void 0 ? void 0 : body.email))
                    return [2 /*return*/, c.json({ error: "Missing email" }, 400)];
                return [4 /*yield*/, c.env.DB.prepare("UPDATE users SET is_admin = ? WHERE email = ?").bind(body.isAdmin ? 1 : 0, body.email).run()];
            case 2:
                _a.sent();
                return [2 /*return*/, c.json({ ok: true, email: body.email, isAdmin: body.isAdmin })];
        }
    });
}); });
// POST /api/game/bootstrap-league — vyplní existující prázdnou ligu AI týmy + rozpis
gameRouter.post("/game/bootstrap-league", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var body, db, league, existingTeams, humanTeam, aiTeamCount, targetAI, usedVillageIds, districtVillages, availableVillages, getDistrictDataFromDB, districtData, createRng, rng, usedNames, villageSize, generateAITeams, firstnameData, aiTeams, insertAITeamsIntoDB, leagueSetup, _a, generateSchedule, totalRounds, generateSeasonCalendar, allTeams, teamIds, seasonRow, seasonNumber, schedule, calendar, rounds, _i, _b, entry, calByWeek, _c, _d, entry, _e, schedule_2, match, calId, globalDate, firstMatch, initDate, simulatedRounds, runScheduledMatches, r, cal, refTeam;
    var _f, _g, _h;
    return __generator(this, function (_j) {
        switch (_j.label) {
            case 0: return [4 /*yield*/, c.req.json().catch(function (e) { logger_1.logger.warn({ module: "game" }, "db op failed", e); return null; })];
            case 1:
                body = _j.sent();
                if (!(body === null || body === void 0 ? void 0 : body.leagueId))
                    return [2 /*return*/, c.json({ error: "Missing leagueId" }, 400)];
                db = c.env.DB;
                return [4 /*yield*/, db.prepare("SELECT id, district, name, level, season_id, status FROM leagues WHERE id = ?")
                        .bind(body.leagueId).first()];
            case 2:
                league = _j.sent();
                if (!league)
                    return [2 /*return*/, c.json({ error: "League not found" }, 404)];
                if (league.status !== "active")
                    return [2 /*return*/, c.json({ error: "League not active" }, 400)];
                return [4 /*yield*/, db.prepare("SELECT id, name, user_id, village_id FROM teams WHERE league_id = ?").bind(league.id).all()];
            case 3:
                existingTeams = _j.sent();
                humanTeam = existingTeams.results.find(function (t) { return t.user_id !== "ai"; });
                aiTeamCount = existingTeams.results.filter(function (t) { return t.user_id === "ai"; }).length;
                targetAI = 14 - (humanTeam ? 1 : 0) - aiTeamCount;
                if (targetAI <= 0)
                    return [2 /*return*/, c.json({ error: "League already has enough teams", teams: existingTeams.results.length }, 400)];
                usedVillageIds = new Set(existingTeams.results.map(function (t) { return t.village_id; }));
                return [4 /*yield*/, db.prepare("SELECT id as code, name, district, region as region_code, population, size as category FROM villages WHERE district = ?").bind(league.district).all()];
            case 4:
                districtVillages = _j.sent();
                availableVillages = districtVillages.results
                    .filter(function (v) { return !usedVillageIds.has(v.code); })
                    .map(function (v) { return ({
                    name: v.name, code: v.code,
                    region_code: v.region_code || "CZ010",
                    category: v.category === "hamlet" ? "vesnice" : v.category === "village" ? "obec" : v.category === "town" ? "mestys" : "mesto",
                    population: v.population,
                }); });
                if (availableVillages.length < targetAI) {
                    return [2 /*return*/, c.json({ error: "Not enough villages: need ".concat(targetAI, ", have ").concat(availableVillages.length) }, 400)];
                }
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../data/districts/index"); })];
            case 5:
                getDistrictDataFromDB = (_j.sent()).getDistrictDataFromDB;
                return [4 /*yield*/, getDistrictDataFromDB(db, league.district)];
            case 6:
                districtData = _j.sent();
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../generators/rng"); })];
            case 7:
                createRng = (_j.sent()).createRng;
                rng = createRng((0, rng_1.cryptoSeed)());
                usedNames = new Set(existingTeams.results.map(function (t) { return t.name; }));
                villageSize = (_g = (_f = districtVillages.results[0]) === null || _f === void 0 ? void 0 : _f.category) !== null && _g !== void 0 ? _g : "village";
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../league/ai-teams"); })];
            case 8:
                generateAITeams = (_j.sent()).generateAITeams;
                firstnameData = {
                    male: {
                        "1960s": { "Jiří": 0.08, "Jan": 0.07, "Petr": 0.06, "Josef": 0.06, "Jaroslav": 0.05, "Milan": 0.05, "Zdeněk": 0.04 },
                        "1970s": { "Petr": 0.08, "Jan": 0.07, "Martin": 0.06, "Jiří": 0.06, "Pavel": 0.05, "Tomáš": 0.04, "Roman": 0.03 },
                        "1980s": { "Jan": 0.08, "Martin": 0.07, "Tomáš": 0.06, "Pavel": 0.05, "Michal": 0.05, "David": 0.05, "Lukáš": 0.04 },
                        "1990s": { "Jan": 0.09, "Tomáš": 0.07, "Jakub": 0.06, "David": 0.06, "Lukáš": 0.05, "Ondřej": 0.05, "Filip": 0.04 },
                        "2000s": { "Jakub": 0.08, "Jan": 0.07, "Adam": 0.06, "Matěj": 0.06, "Ondřej": 0.05, "Filip": 0.05, "Vojtěch": 0.04 },
                        "2010s": { "Jakub": 0.07, "Jan": 0.07, "Adam": 0.06, "Vojtěch": 0.05, "Filip": 0.05, "Tomáš": 0.05, "Šimon": 0.04 },
                    },
                };
                aiTeams = generateAITeams(rng, availableVillages, targetAI, districtData.surnames, firstnameData, usedNames);
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../league/insert-ai-teams"); })];
            case 9:
                insertAITeamsIntoDB = (_j.sent()).insertAITeamsIntoDB;
                leagueSetup = {
                    name: league.name, district: league.district, season: "2024/2025", level: 1, totalRounds: 26,
                    teams: aiTeams.map(function (ai) { return ({
                        teamName: ai.teamName, villageName: ai.villageName, villageCode: ai.villageCode,
                        primaryColor: ai.primaryColor, secondaryColor: ai.secondaryColor, isPlayer: false, aiTeam: ai,
                    }); }),
                    schedule: [],
                };
                return [4 /*yield*/, insertAITeamsIntoDB(db, league.id, leagueSetup, districtVillages.results, rng, villageSize, league.district)];
            case 10:
                _j.sent();
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../league/schedule"); })];
            case 11:
                _a = _j.sent(), generateSchedule = _a.generateSchedule, totalRounds = _a.totalRounds;
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../season/calendar"); })];
            case 12:
                generateSeasonCalendar = (_j.sent()).generateSeasonCalendar;
                return [4 /*yield*/, db.prepare("SELECT id FROM teams WHERE league_id = ? ORDER BY name").bind(league.id).all()];
            case 13:
                allTeams = _j.sent();
                teamIds = allTeams.results.map(function (r) { return r.id; });
                return [4 /*yield*/, db.prepare("SELECT number FROM seasons WHERE id = ?").bind(league.season_id).first()];
            case 14:
                seasonRow = _j.sent();
                seasonNumber = (0, season_1.mustSeason)(seasonRow === null || seasonRow === void 0 ? void 0 : seasonRow.number);
                schedule = generateSchedule(rng, teamIds.length);
                calendar = generateSeasonCalendar(league.id, seasonNumber, new Date());
                rounds = totalRounds(teamIds.length);
                _i = 0, _b = calendar.entries;
                _j.label = 15;
            case 15:
                if (!(_i < _b.length)) return [3 /*break*/, 18];
                entry = _b[_i];
                return [4 /*yield*/, db.prepare("INSERT OR IGNORE INTO season_calendar (id, league_id, season_number, game_week, match_day, scheduled_at, status) VALUES (?, ?, ?, ?, ?, ?, 'scheduled')").bind(entry.id, league.id, seasonNumber, entry.gameWeek, entry.matchDay, entry.scheduledAt)
                        .run().catch(function (e) { return logger_1.logger.warn({ module: "bootstrap" }, "calendar insert", e); })];
            case 16:
                _j.sent();
                _j.label = 17;
            case 17:
                _i++;
                return [3 /*break*/, 15];
            case 18:
                calByWeek = new Map();
                for (_c = 0, _d = calendar.entries; _c < _d.length; _c++) {
                    entry = _d[_c];
                    if (!calByWeek.has(entry.gameWeek))
                        calByWeek.set(entry.gameWeek, entry.id);
                }
                _e = 0, schedule_2 = schedule;
                _j.label = 19;
            case 19:
                if (!(_e < schedule_2.length)) return [3 /*break*/, 22];
                match = schedule_2[_e];
                if (match.homeTeamIndex >= teamIds.length || match.awayTeamIndex >= teamIds.length)
                    return [3 /*break*/, 21];
                calId = (_h = calByWeek.get(match.round)) !== null && _h !== void 0 ? _h : null;
                return [4 /*yield*/, db.prepare("INSERT INTO matches (id, league_id, calendar_id, round, home_team_id, away_team_id, status) VALUES (?, ?, ?, ?, ?, ?, 'scheduled')").bind(crypto.randomUUID(), league.id, calId, match.round, teamIds[match.homeTeamIndex], teamIds[match.awayTeamIndex])
                        .run().catch(function (e) { return logger_1.logger.warn({ module: "bootstrap" }, "match insert", e); })];
            case 20:
                _j.sent();
                _j.label = 21;
            case 21:
                _e++;
                return [3 /*break*/, 19];
            case 22:
                if (!(calendar.entries.length > 0)) return [3 /*break*/, 25];
                return [4 /*yield*/, db.prepare("SELECT MAX(game_date) as max_date FROM teams WHERE game_date IS NOT NULL AND league_id != ?").bind(league.id).first().catch(function (e) { logger_1.logger.warn({ module: "bootstrap" }, "load global game_date for init", e); return null; })];
            case 23:
                globalDate = _j.sent();
                firstMatch = new Date(calendar.entries[0].scheduledAt);
                firstMatch.setDate(firstMatch.getDate() - 1);
                initDate = (globalDate === null || globalDate === void 0 ? void 0 : globalDate.max_date) && globalDate.max_date > firstMatch.toISOString()
                    ? globalDate.max_date
                    : firstMatch.toISOString();
                return [4 /*yield*/, db.prepare("UPDATE teams SET game_date = ? WHERE league_id = ?")
                        .bind(initDate, league.id).run()];
            case 24:
                _j.sent();
                _j.label = 25;
            case 25:
                simulatedRounds = 0;
                if (!(body.simulateRounds && body.simulateRounds > 0)) return [3 /*break*/, 37];
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../multiplayer/match-runner"); })];
            case 26:
                runScheduledMatches = (_j.sent()).runScheduledMatches;
                // Set game_date far ahead so all rounds are eligible
                return [4 /*yield*/, db.prepare("UPDATE teams SET game_date = '2030-01-01T00:00:00.000Z' WHERE league_id = ?").bind(league.id).run()];
            case 27:
                // Set game_date far ahead so all rounds are eligible
                _j.sent();
                r = 0;
                _j.label = 28;
            case 28:
                if (!(r < body.simulateRounds)) return [3 /*break*/, 34];
                return [4 /*yield*/, db.prepare("SELECT id FROM season_calendar WHERE league_id = ? AND status = 'scheduled' ORDER BY scheduled_at ASC LIMIT 1").bind(league.id).first()];
            case 29:
                cal = _j.sent();
                if (!cal)
                    return [3 /*break*/, 34];
                return [4 /*yield*/, db.prepare("UPDATE matches SET status = 'lineups_open' WHERE calendar_id = ? AND status = 'scheduled'")
                        .bind(cal.id).run()];
            case 30:
                _j.sent();
                return [4 /*yield*/, runScheduledMatches(db, cal.id, c.env.GEMINI_API_KEY)];
            case 31:
                _j.sent();
                return [4 /*yield*/, db.prepare("UPDATE season_calendar SET status = 'simulated' WHERE id = ?").bind(cal.id).run()];
            case 32:
                _j.sent();
                simulatedRounds++;
                _j.label = 33;
            case 33:
                r++;
                return [3 /*break*/, 28];
            case 34: return [4 /*yield*/, db.prepare("SELECT t.game_date FROM teams t JOIN leagues l ON t.league_id = l.id WHERE l.district != ? AND t.game_date IS NOT NULL LIMIT 1").bind(league.district).first()];
            case 35:
                refTeam = _j.sent();
                if (!(refTeam === null || refTeam === void 0 ? void 0 : refTeam.game_date)) return [3 /*break*/, 37];
                return [4 /*yield*/, db.prepare("UPDATE teams SET game_date = ? WHERE league_id = ?").bind(refTeam.game_date, league.id).run()];
            case 36:
                _j.sent();
                _j.label = 37;
            case 37: return [2 /*return*/, c.json({
                    ok: true,
                    league: league.name,
                    teams: teamIds.length,
                    matches: schedule.length,
                    calendarEntries: calendar.entries.length,
                    simulatedRounds: simulatedRounds,
                })];
        }
    });
}); });
// POST /api/game/advance-day — denní tick (posun dne, tréninky, finance, zprávy)
// Zápasy a zpravodaj řeší VÝHRADNĚ run-matches cron (18:00 CET)
gameRouter.post("/game/advance-day", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var result;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, (0, daily_tick_1.executeDailyTick)(c.env)];
            case 1:
                result = _a.sent();
                return [2 /*return*/, c.json({ ok: true, type: "daily", result: result })];
        }
    });
}); });
// POST /api/game/staff-tick — staff tick (masér, lékař, správce, psycholog, kurzy, skaut, pool).
// Samostatný cron (0 5 * * *); tenhle endpoint je pro ruční spuštění na testu (bez cronů).
gameRouter.post("/game/staff-tick", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var executeStaffTick, result;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("../staff/staff-tick"); })];
            case 1:
                executeStaffTick = (_a.sent()).executeStaffTick;
                return [4 /*yield*/, executeStaffTick(c.env)];
            case 2:
                result = _a.sent();
                return [2 /*return*/, c.json({ ok: true, type: "staff", result: result })];
        }
    });
}); });
// POST /api/game/run-matches — simulace zápasů, max 1 liga za invokaci
gameRouter.post("/game/run-matches", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, runScheduledMatches, recoverStuckRounds, targetLeagueId, recoveredRounds, e_2, leagueRows, totalMatches, processedLeague, _i, _b, row, gameDate, leagueId, gd, dayEnd, matchCal, lockResult, calculateStandings, standingsBefore, results, calRow, gameWeek, matchRows, lines, _c, _d, r, hs, as_, hn, an, generateAiRoundReport, e_3, generateUltrasReport, e_4, pickRandomAdhocEvent, createRng_2, humanTeams, _e, _f, ht, adhocRng, adhocEvent, _g, _h, _j, _k, e_5, e_6, simulateFriendlyMatches, friendlyCount, e_7, debugLogs;
    var _l, _m;
    return __generator(this, function (_o) {
        switch (_o.label) {
            case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("../multiplayer/match-runner"); })];
            case 1:
                _a = _o.sent(), runScheduledMatches = _a.runScheduledMatches, recoverStuckRounds = _a.recoverStuckRounds;
                targetLeagueId = c.req.query("leagueId");
                recoveredRounds = [];
                _o.label = 2;
            case 2:
                _o.trys.push([2, 4, , 5]);
                return [4 /*yield*/, recoverStuckRounds(c.env.DB, c.env.GEMINI_API_KEY)];
            case 3:
                recoveredRounds = _o.sent();
                return [3 /*break*/, 5];
            case 4:
                e_2 = _o.sent();
                logger_1.logger.warn({ module: "game" }, "stuck round recovery failed", e_2);
                return [3 /*break*/, 5];
            case 5: return [4 /*yield*/, c.env.DB.prepare("SELECT DISTINCT t.league_id, MIN(t.game_date) as game_date FROM teams t WHERE t.league_id IS NOT NULL AND t.game_date IS NOT NULL GROUP BY t.league_id").all()];
            case 6:
                leagueRows = _o.sent();
                totalMatches = 0;
                processedLeague = null;
                _i = 0, _b = leagueRows.results;
                _o.label = 7;
            case 7:
                if (!(_i < _b.length)) return [3 /*break*/, 41];
                row = _b[_i];
                gameDate = row.game_date;
                leagueId = row.league_id;
                if (!gameDate || !leagueId)
                    return [3 /*break*/, 40];
                if (targetLeagueId && leagueId !== targetLeagueId)
                    return [3 /*break*/, 40];
                gd = new Date(gameDate);
                dayEnd = new Date(gd);
                dayEnd.setUTCHours(23, 59, 59, 999);
                return [4 /*yield*/, c.env.DB.prepare("SELECT id FROM season_calendar WHERE league_id = ? AND scheduled_at <= ? AND status = 'scheduled' ORDER BY scheduled_at ASC LIMIT 1").bind(leagueId, dayEnd.toISOString()).first()];
            case 8:
                matchCal = _o.sent();
                if (!matchCal) return [3 /*break*/, 40];
                if (processedLeague && !targetLeagueId)
                    return [3 /*break*/, 41];
                return [4 /*yield*/, c.env.DB.prepare("UPDATE season_calendar SET status = 'lineup_locked' WHERE id = ? AND status = 'scheduled'").bind(matchCal.id).run()];
            case 9:
                lockResult = _o.sent();
                if (lockResult.meta.changes === 0)
                    return [3 /*break*/, 40];
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../stats/standings"); })];
            case 10:
                calculateStandings = (_o.sent()).calculateStandings;
                return [4 /*yield*/, calculateStandings(c.env.DB, leagueId)];
            case 11:
                standingsBefore = _o.sent();
                return [4 /*yield*/, c.env.DB.prepare("UPDATE matches SET status = 'lineups_open' WHERE calendar_id = ? AND status = 'scheduled'")
                        .bind(matchCal.id).run()];
            case 12:
                _o.sent();
                return [4 /*yield*/, runScheduledMatches(c.env.DB, matchCal.id, c.env.GEMINI_API_KEY)];
            case 13:
                results = _o.sent();
                return [4 /*yield*/, c.env.DB.prepare("UPDATE season_calendar SET status = 'simulated' WHERE id = ?")
                        .bind(matchCal.id).run()];
            case 14:
                _o.sent();
                totalMatches += results.length;
                if (!(results.length > 0)) return [3 /*break*/, 39];
                _o.label = 15;
            case 15:
                _o.trys.push([15, 38, , 39]);
                return [4 /*yield*/, c.env.DB.prepare("SELECT game_week FROM season_calendar WHERE id = ?")
                        .bind(matchCal.id).first()];
            case 16:
                calRow = _o.sent();
                gameWeek = (_l = calRow === null || calRow === void 0 ? void 0 : calRow.game_week) !== null && _l !== void 0 ? _l : 0;
                return [4 /*yield*/, c.env.DB.prepare("SELECT m.home_score, m.away_score, t1.name as home_name, t2.name as away_name FROM matches m JOIN teams t1 ON m.home_team_id = t1.id JOIN teams t2 ON m.away_team_id = t2.id WHERE m.calendar_id = ? AND m.status = 'simulated'").bind(matchCal.id).all()];
            case 17:
                matchRows = _o.sent();
                lines = [];
                for (_c = 0, _d = matchRows.results; _c < _d.length; _c++) {
                    r = _d[_c];
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
                return [4 /*yield*/, c.env.DB.prepare("INSERT INTO news (id, league_id, type, headline, body, game_week, created_at) VALUES (?, ?, 'round_results', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))")
                        .bind(crypto.randomUUID(), leagueId, "".concat(gameWeek, ". kolo: p\u0159ehled v\u00FDsledk\u016F"), lines.join(". ") + ".", gameWeek).run()];
            case 18:
                _o.sent();
                if (!c.env.GEMINI_API_KEY) return [3 /*break*/, 27];
                _o.label = 19;
            case 19:
                _o.trys.push([19, 22, , 23]);
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../news/ai-reporter"); })];
            case 20:
                generateAiRoundReport = (_o.sent()).generateAiRoundReport;
                return [4 /*yield*/, generateAiRoundReport(c.env.DB, c.env.GEMINI_API_KEY, leagueId, matchCal.id, gameWeek, standingsBefore)];
            case 21:
                _o.sent();
                return [3 /*break*/, 23];
            case 22:
                e_3 = _o.sent();
                logger_1.logger.warn({ module: "game" }, "AI reporter error: ".concat(e_3.message));
                return [3 /*break*/, 23];
            case 23:
                _o.trys.push([23, 26, , 27]);
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../news/ultras-report"); })];
            case 24:
                generateUltrasReport = (_o.sent()).generateUltrasReport;
                return [4 /*yield*/, generateUltrasReport(c.env.DB, c.env.GEMINI_API_KEY, matchCal.id)];
            case 25:
                _o.sent();
                return [3 /*break*/, 27];
            case 26:
                e_4 = _o.sent();
                logger_1.logger.warn({ module: "game" }, "ultras report error: ".concat(e_4.message));
                return [3 /*break*/, 27];
            case 27:
                _o.trys.push([27, 36, , 37]);
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../season/seasonal-events"); })];
            case 28:
                pickRandomAdhocEvent = (_o.sent()).pickRandomAdhocEvent;
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../generators/rng"); })];
            case 29:
                createRng_2 = (_o.sent()).createRng;
                return [4 /*yield*/, c.env.DB.prepare("SELECT t.id, t.league_id, v.district FROM teams t JOIN villages v ON t.village_id=v.id WHERE t.league_id = ? AND t.user_id <> 'ai'").bind(leagueId).all()];
            case 30:
                humanTeams = _o.sent();
                _e = 0, _f = humanTeams.results;
                _o.label = 31;
            case 31:
                if (!(_e < _f.length)) return [3 /*break*/, 35];
                ht = _f[_e];
                adhocRng = createRng_2((0, rng_1.cryptoSeed)());
                adhocEvent = pickRandomAdhocEvent(adhocRng, gameWeek, ht.district);
                if (!adhocEvent) return [3 /*break*/, 34];
                _h = (_g = c.env.DB.prepare("INSERT INTO seasonal_events (id, league_id, type, title, description, effects, choices, season, game_week, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')")).bind;
                _j = [crypto.randomUUID(), ht.league_id, adhocEvent.type, adhocEvent.title, adhocEvent.description,
                    JSON.stringify(adhocEvent.effects), JSON.stringify(adhocEvent.choices)];
                _k = String;
                return [4 /*yield*/, activeSeasonNumber(c.env.DB)];
            case 32: return [4 /*yield*/, _h.apply(_g, _j.concat([_k.apply(void 0, [_o.sent()]), adhocEvent.gameWeek])).run().catch(function (e) { return logger_1.logger.warn({ module: "game" }, "ad-hoc event insert: ".concat(e.message)); })];
            case 33:
                _o.sent();
                _o.label = 34;
            case 34:
                _e++;
                return [3 /*break*/, 31];
            case 35: return [3 /*break*/, 37];
            case 36:
                e_5 = _o.sent();
                logger_1.logger.warn({ module: "game" }, "ad-hoc events: ".concat(e_5.message));
                return [3 /*break*/, 37];
            case 37: return [3 /*break*/, 39];
            case 38:
                e_6 = _o.sent();
                logger_1.logger.warn({ module: "game" }, "news generation: ".concat(e_6.message));
                return [3 /*break*/, 39];
            case 39:
                processedLeague = leagueId;
                _o.label = 40;
            case 40:
                _i++;
                return [3 /*break*/, 7];
            case 41:
                _o.trys.push([41, 44, , 45]);
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../multiplayer/friendly-runner"); })];
            case 42:
                simulateFriendlyMatches = (_o.sent()).simulateFriendlyMatches;
                return [4 /*yield*/, simulateFriendlyMatches(c.env.DB)];
            case 43:
                friendlyCount = _o.sent();
                totalMatches += friendlyCount;
                return [3 /*break*/, 45];
            case 44:
                e_7 = _o.sent();
                logger_1.logger.warn({ module: "game" }, "friendlies: ".concat(e_7.message));
                return [3 /*break*/, 45];
            case 45:
                debugLogs = (_m = globalThis.__lineupDebug) !== null && _m !== void 0 ? _m : [];
                return [2 /*return*/, c.json({ ok: true, type: "matches", totalMatches: totalMatches, processedLeague: processedLeague, recoveredRounds: recoveredRounds, debug: debugLogs })];
        }
    });
}); });
// POST /api/game/generate-round-report?calendarId=X
// Dogeneruje chybějící AI souhrn kola (news type 'ai_report'). Recovery uvízlého kola
// vkládá jen základní round_results — tenhle dotvoří plný redakční článek.
// Idempotentní: pokud ai_report pro kolo už existuje, nedělá nic.
gameRouter.post("/game/generate-round-report", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var calendarId, cal, existing, calculateStandings, generateAiRoundReport, standings, report;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                calendarId = c.req.query("calendarId");
                if (!calendarId)
                    return [2 /*return*/, c.json({ error: "calendarId je povinný" }, 400)];
                if (!c.env.GEMINI_API_KEY)
                    return [2 /*return*/, c.json({ error: "GEMINI_API_KEY není nastaven" }, 500)];
                return [4 /*yield*/, c.env.DB.prepare("SELECT league_id, game_week, status FROM season_calendar WHERE id = ?").bind(calendarId).first()];
            case 1:
                cal = _a.sent();
                if (!cal)
                    return [2 /*return*/, c.json({ error: "kolo nenalezeno" }, 404)];
                if (cal.status !== "simulated")
                    return [2 /*return*/, c.json({ error: "kolo nen\u00ED simulated (".concat(cal.status, ")") }, 400)];
                return [4 /*yield*/, c.env.DB.prepare("SELECT id FROM news WHERE league_id = ? AND game_week = ? AND type = 'ai_report'").bind(cal.league_id, cal.game_week).first()];
            case 2:
                existing = _a.sent();
                if (existing)
                    return [2 /*return*/, c.json({ ok: false, skipped: true, reason: "ai_report pro toto kolo už existuje" })];
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../stats/standings"); })];
            case 3:
                calculateStandings = (_a.sent()).calculateStandings;
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../news/ai-reporter"); })];
            case 4:
                generateAiRoundReport = (_a.sent()).generateAiRoundReport;
                return [4 /*yield*/, calculateStandings(c.env.DB, cal.league_id)];
            case 5:
                standings = _a.sent();
                return [4 /*yield*/, generateAiRoundReport(c.env.DB, c.env.GEMINI_API_KEY, cal.league_id, calendarId, cal.game_week, standings)];
            case 6:
                _a.sent();
                return [4 /*yield*/, c.env.DB.prepare("SELECT headline, substr(body, 1, 240) as preview, length(body) as len FROM news WHERE league_id = ? AND game_week = ? AND type = 'ai_report'").bind(cal.league_id, cal.game_week).first()];
            case 7:
                report = _a.sent();
                return [2 /*return*/, c.json({ ok: true, calendarId: calendarId, gameWeek: cal.game_week, generated: !!report, report: report })];
        }
    });
}); });
// POST /api/game/fix-match-finances?matchId=X&teamId=Y
// Doplní match-day finance pro tým, kterému chybí — half-processed zápas, kde simulace spadla
// mezi financemi domácího a hostů (zápas zůstal 'simulated', takže recovery ho nesáhne).
// Idempotentní: pokud tým už má transakce pro tento zápas, nedělá nic.
gameRouter.post("/game/fix-match-finances", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var matchId, teamId, match, isHome, isAway, existing, _a, processMatchDayFinances, processCashLoanRepayment, hs, as_, result, opponentId, oppRow, opponentRep, gameDate, before, after, txs;
    var _b, _c, _d, _e, _f;
    return __generator(this, function (_g) {
        switch (_g.label) {
            case 0:
                matchId = c.req.query("matchId");
                teamId = c.req.query("teamId");
                if (!matchId || !teamId)
                    return [2 /*return*/, c.json({ error: "matchId a teamId jsou povinné" }, 400)];
                return [4 /*yield*/, c.env.DB.prepare("SELECT home_team_id, away_team_id, home_score, away_score, attendance, status FROM matches WHERE id = ?").bind(matchId).first()];
            case 1:
                match = _g.sent();
                if (!match)
                    return [2 /*return*/, c.json({ error: "zápas nenalezen" }, 404)];
                if (match.status !== "simulated")
                    return [2 /*return*/, c.json({ error: "z\u00E1pas nen\u00ED simulated (".concat(match.status, ")") }, 400)];
                isHome = match.home_team_id === teamId;
                isAway = match.away_team_id === teamId;
                if (!isHome && !isAway)
                    return [2 /*return*/, c.json({ error: "tým v tomto zápase nehrál" }, 400)];
                return [4 /*yield*/, c.env.DB.prepare("SELECT COUNT(*) as c FROM transactions WHERE team_id = ? AND reference_id = ?").bind(teamId, matchId).first()];
            case 2:
                existing = _g.sent();
                if (((_b = existing === null || existing === void 0 ? void 0 : existing.c) !== null && _b !== void 0 ? _b : 0) > 0) {
                    return [2 /*return*/, c.json({ ok: false, skipped: true, reason: "t\u00FDm u\u017E m\u00E1 ".concat(existing.c, " transakc\u00ED pro tento z\u00E1pas") })];
                }
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../season/finance-processor"); })];
            case 3:
                _a = _g.sent(), processMatchDayFinances = _a.processMatchDayFinances, processCashLoanRepayment = _a.processCashLoanRepayment;
                hs = match.home_score, as_ = match.away_score;
                result = isHome
                    ? (hs > as_ ? "win" : hs < as_ ? "loss" : "draw")
                    : (as_ > hs ? "win" : as_ < hs ? "loss" : "draw");
                opponentId = isHome ? match.away_team_id : match.home_team_id;
                return [4 /*yield*/, c.env.DB.prepare("SELECT reputation FROM teams WHERE id = ?")
                        .bind(opponentId).first()];
            case 4:
                oppRow = _g.sent();
                opponentRep = (_c = oppRow === null || oppRow === void 0 ? void 0 : oppRow.reputation) !== null && _c !== void 0 ? _c : 50;
                gameDate = new Date().toISOString();
                return [4 /*yield*/, c.env.DB.prepare("SELECT budget FROM teams WHERE id = ?").bind(teamId).first()];
            case 5:
                before = _g.sent();
                return [4 /*yield*/, processMatchDayFinances(c.env.DB, teamId, matchId, isHome, result, (_d = match.attendance) !== null && _d !== void 0 ? _d : 0, gameDate, opponentRep)];
            case 6:
                _g.sent();
                return [4 /*yield*/, processCashLoanRepayment(c.env.DB, teamId, matchId, gameDate)];
            case 7:
                _g.sent();
                return [4 /*yield*/, c.env.DB.prepare("SELECT budget FROM teams WHERE id = ?").bind(teamId).first()];
            case 8:
                after = _g.sent();
                return [4 /*yield*/, c.env.DB.prepare("SELECT type, amount FROM transactions WHERE team_id = ? AND reference_id = ?")
                        .bind(teamId, matchId).all()];
            case 9:
                txs = _g.sent();
                return [2 /*return*/, c.json({
                        ok: true,
                        matchId: matchId,
                        teamId: teamId,
                        isHome: isHome,
                        result: result,
                        attendance: match.attendance,
                        budgetBefore: before === null || before === void 0 ? void 0 : before.budget, budgetAfter: after === null || after === void 0 ? void 0 : after.budget,
                        delta: ((_e = after === null || after === void 0 ? void 0 : after.budget) !== null && _e !== void 0 ? _e : 0) - ((_f = before === null || before === void 0 ? void 0 : before.budget) !== null && _f !== void 0 ? _f : 0),
                        transactions: txs.results,
                    })];
        }
    });
}); });
// ═══ Classifieds (Placená inzerce) ═══
var CLASSIFIED_CATEGORIES = {
    player_wanted: { label: "Hledáme hráče", icon: "\uD83D\uDD0D" },
    player_offering: { label: "Hráč k dispozici", icon: "\uD83E\uDD1A" },
    equipment: { label: "Vybavení", icon: "\uD83C\uDFBD" },
    match: { label: "Přátelský zápas", icon: "\u26BD" },
    general: { label: "Různé", icon: "\uD83D\uDCCB" },
};
var CLASSIFIED_COST = 500; // Kč per ad
var CLASSIFIED_DURATION_DAYS = 14;
// GET /api/teams/:teamId/classifieds — all active classifieds visible to this team's league
gameRouter.get("/teams/:teamId/classifieds", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, team, now, result;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, c.env.DB.prepare("SELECT league_id FROM teams WHERE id = ?")
                        .bind(teamId).first()];
            case 1:
                team = _b.sent();
                now = new Date().toISOString();
                return [4 /*yield*/, c.env.DB.prepare("SELECT * FROM classifieds\n     WHERE (league_id = ? OR league_id IS NULL)\n       AND (expires_at IS NULL OR expires_at > ?)\n     ORDER BY created_at DESC").bind((_a = team === null || team === void 0 ? void 0 : team.league_id) !== null && _a !== void 0 ? _a : "", now).all().catch(function (e) { logger_1.logger.warn({ module: "game" }, "fetch classifieds", e); return { results: [] }; })];
            case 2:
                result = _b.sent();
                return [2 /*return*/, c.json({
                        classifieds: result.results.map(function (row) {
                            var _a, _b, _c, _d;
                            return ({
                                id: row.id,
                                teamId: row.team_id,
                                teamName: row.team_name,
                                category: row.category,
                                categoryLabel: (_b = (_a = CLASSIFIED_CATEGORIES[row.category]) === null || _a === void 0 ? void 0 : _a.label) !== null && _b !== void 0 ? _b : "Různé",
                                categoryIcon: (_d = (_c = CLASSIFIED_CATEGORIES[row.category]) === null || _c === void 0 ? void 0 : _c.icon) !== null && _d !== void 0 ? _d : "\uD83D\uDCCB",
                                message: row.message,
                                cost: row.cost,
                                createdAt: row.created_at,
                                expiresAt: row.expires_at,
                                isOwn: row.team_id === teamId,
                            });
                        }),
                        categories: Object.entries(CLASSIFIED_CATEGORIES).map(function (_a) {
                            var key = _a[0], val = _a[1];
                            return ({
                                key: key,
                                label: val.label, icon: val.icon,
                            });
                        }),
                        cost: CLASSIFIED_COST,
                    })];
        }
    });
}); });
// POST /api/teams/:teamId/classifieds — create a new classified ad (deducts from budget)
gameRouter.post("/teams/:teamId/classifieds", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, body, category, team, id, expiresAt;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, c.req.json().catch(function (e) { logger_1.logger.warn({ module: "game" }, "parse classified body", e); return { category: undefined, message: undefined }; })];
            case 1:
                body = _a.sent();
                if (!body.message || body.message.trim().length < 5) {
                    return [2 /*return*/, c.json({ error: "Zpráva musí mít alespoň 5 znaků" }, 400)];
                }
                if (body.message.length > 200) {
                    return [2 /*return*/, c.json({ error: "Zpráva může mít max 200 znaků" }, 400)];
                }
                category = body.category && CLASSIFIED_CATEGORIES[body.category] ? body.category : "general";
                return [4 /*yield*/, c.env.DB.prepare("SELECT name, budget, league_id FROM teams WHERE id = ?")
                        .bind(teamId).first()];
            case 2:
                team = _a.sent();
                if (!team)
                    return [2 /*return*/, c.json({ error: "Tým nenalezen" }, 404)];
                if (team.budget < CLASSIFIED_COST) {
                    return [2 /*return*/, c.json({ error: "Nedostate\u010Dn\u00FD rozpo\u010Det. Pot\u0159ebujete ".concat(CLASSIFIED_COST, " K\u010D, m\u00E1te ").concat(team.budget, " K\u010D.") }, 400)];
                }
                // Deduct cost
                return [4 /*yield*/, (0, finance_processor_1.recordTransaction)(c.env.DB, teamId, "classified_ad", -CLASSIFIED_COST, "Inzer\u00E1t ve zpravodaji", new Date().toISOString())];
            case 3:
                // Deduct cost
                _a.sent();
                id = crypto.randomUUID();
                expiresAt = new Date(Date.now() + CLASSIFIED_DURATION_DAYS * 86400000).toISOString();
                return [4 /*yield*/, c.env.DB.prepare("INSERT INTO classifieds (id, team_id, team_name, league_id, category, message, cost, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(id, teamId, team.name, team.league_id, category, body.message.trim(), CLASSIFIED_COST, expiresAt).run()];
            case 4:
                _a.sent();
                return [2 /*return*/, c.json({ ok: true, id: id, newBudget: team.budget - CLASSIFIED_COST })];
        }
    });
}); });
// DELETE /api/teams/:teamId/classifieds/:id — remove own classified
gameRouter.delete("/teams/:teamId/classifieds/:id", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, id, ad;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                teamId = c.req.param("teamId");
                id = c.req.param("id");
                return [4 /*yield*/, c.env.DB.prepare("SELECT team_id FROM classifieds WHERE id = ?")
                        .bind(id).first()];
            case 1:
                ad = _a.sent();
                if (!ad || ad.team_id !== teamId)
                    return [2 /*return*/, c.json({ error: "Inzerát nenalezen" }, 404)];
                return [4 /*yield*/, c.env.DB.prepare("DELETE FROM classifieds WHERE id = ?").bind(id).run()];
            case 2:
                _a.sent();
                return [2 /*return*/, c.json({ ok: true })];
        }
    });
}); });
// ═══ LINEUP / NEXT MATCH ═══
// GET next match info + current lineup
// Optional ?calendarId=X — vrátí konkrétní zápas (calendar entry NEBO friendly match.id), jinak nejbližší
gameRouter.get("/teams/:teamId/next-match", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, requestedCalId, team, gameDate, match, calendarId, gameWeek, scheduledAt, isFriendly, reqCal, friend, friendlyMatch, nextCal, isLocalDerby, vr, lineupQuery, _a, lineupRes, playersRes, lineup, lineupSource, players, matchDate, daysUntilMatch, absenceSeedForMatch, generateAbsences, fetchTeamDistrict, matchKey, injuredPreviewIds, suspendedPreviewIds, injRows, _i, _b, ir, _c, _d, r, healthyPlayers, absenceSquad, district, friendlyMultiplier, absences, dayBeforeRng, matchDayRng, dayBeforeAbs, matchDayAbs, seen_1, absentPlayerIds, playerIds, relMap, placeholders, relRows, _e, _f, r, e_8, available, upcomingMatches, upcomingLeague, _g, _h, u, upcomingFriendly, _j, _k, u, e_9;
    var _l;
    var _m, _o, _p;
    return __generator(this, function (_q) {
        switch (_q.label) {
            case 0:
                teamId = c.req.param("teamId");
                requestedCalId = c.req.query("calendarId");
                return [4 /*yield*/, c.env.DB.prepare("SELECT league_id, game_date FROM teams WHERE id = ?")
                        .bind(teamId).first()];
            case 1:
                team = _q.sent();
                if (!team)
                    return [2 /*return*/, c.json({ nextMatch: null })];
                gameDate = team.game_date ? new Date(team.game_date) : new Date();
                match = null;
                calendarId = null;
                gameWeek = null;
                scheduledAt = null;
                isFriendly = false;
                if (!requestedCalId) return [3 /*break*/, 6];
                return [4 /*yield*/, c.env.DB.prepare("SELECT id, scheduled_at, game_week FROM season_calendar WHERE id = ?").bind(requestedCalId).first()];
            case 2:
                reqCal = _q.sent();
                if (!reqCal) return [3 /*break*/, 4];
                calendarId = reqCal.id;
                gameWeek = reqCal.game_week;
                scheduledAt = reqCal.scheduled_at;
                return [4 /*yield*/, c.env.DB.prepare("SELECT m.id, m.home_team_id, m.away_team_id, t1.name as home_name, t2.name as away_name, t1.primary_color as home_color, t2.primary_color as away_color FROM matches m JOIN teams t1 ON m.home_team_id = t1.id JOIN teams t2 ON m.away_team_id = t2.id WHERE m.calendar_id = ? AND (m.home_team_id = ? OR m.away_team_id = ?)").bind(reqCal.id, teamId, teamId).first()];
            case 3:
                match = _q.sent();
                return [3 /*break*/, 6];
            case 4: return [4 /*yield*/, c.env.DB.prepare("SELECT m.id, m.home_team_id, m.away_team_id, m.created_at,\n           t1.name as home_name, t2.name as away_name,\n           t1.primary_color as home_color, t2.primary_color as away_color\n         FROM matches m\n         JOIN teams t1 ON m.home_team_id = t1.id\n         JOIN teams t2 ON m.away_team_id = t2.id\n         WHERE m.id = ? AND m.calendar_id IS NULL AND (m.home_team_id = ? OR m.away_team_id = ?)").bind(requestedCalId, teamId, teamId).first()];
            case 5:
                friend = _q.sent();
                if (friend) {
                    match = friend;
                    isFriendly = true;
                    scheduledAt = friend.created_at;
                }
                _q.label = 6;
            case 6:
                if (!!match) return [3 /*break*/, 11];
                return [4 /*yield*/, c.env.DB.prepare("SELECT m.id, m.home_team_id, m.away_team_id, m.created_at,\n         t1.name as home_name, t2.name as away_name,\n         t1.primary_color as home_color, t2.primary_color as away_color\n       FROM matches m\n       JOIN teams t1 ON m.home_team_id = t1.id\n       JOIN teams t2 ON m.away_team_id = t2.id\n       WHERE (m.home_team_id = ? OR m.away_team_id = ?) AND m.status = 'lineups_open' AND m.calendar_id IS NULL\n       ORDER BY m.created_at ASC LIMIT 1").bind(teamId, teamId).first()];
            case 7:
                friendlyMatch = _q.sent();
                if (!friendlyMatch) return [3 /*break*/, 8];
                match = friendlyMatch;
                isFriendly = true;
                scheduledAt = friendlyMatch.created_at;
                return [3 /*break*/, 11];
            case 8:
                if (!team.league_id) return [3 /*break*/, 11];
                return [4 /*yield*/, c.env.DB.prepare("SELECT sc.id, sc.scheduled_at, sc.game_week FROM season_calendar sc WHERE sc.league_id = ? AND sc.status = 'scheduled' AND sc.season_number = (SELECT MAX(sc2.season_number) FROM season_calendar sc2 WHERE sc2.league_id = sc.league_id) AND EXISTS (SELECT 1 FROM matches m WHERE m.calendar_id = sc.id) ORDER BY sc.scheduled_at ASC LIMIT 1").bind(team.league_id).first()];
            case 9:
                nextCal = _q.sent();
                if (!nextCal)
                    return [2 /*return*/, c.json({ nextMatch: null })];
                calendarId = nextCal.id;
                gameWeek = nextCal.game_week;
                scheduledAt = nextCal.scheduled_at;
                return [4 /*yield*/, c.env.DB.prepare("SELECT m.id, m.home_team_id, m.away_team_id, t1.name as home_name, t2.name as away_name, t1.primary_color as home_color, t2.primary_color as away_color FROM matches m JOIN teams t1 ON m.home_team_id = t1.id JOIN teams t2 ON m.away_team_id = t2.id WHERE m.calendar_id = ? AND (m.home_team_id = ? OR m.away_team_id = ?)").bind(nextCal.id, teamId, teamId).first()];
            case 10:
                match = _q.sent();
                _q.label = 11;
            case 11:
                if (!match)
                    return [2 /*return*/, c.json({ nextMatch: null })];
                isLocalDerby = false;
                if (!(match.home_team_id && match.away_team_id)) return [3 /*break*/, 13];
                return [4 /*yield*/, c.env.DB.prepare("SELECT CASE WHEN h.village_id = a.village_id AND h.village_id IS NOT NULL THEN 1 ELSE 0 END as d FROM teams h, teams a WHERE h.id = ? AND a.id = ?").bind(match.home_team_id, match.away_team_id).first()
                        .catch(function (e) { logger_1.logger.warn({ module: "game" }, "derby check", e); return null; })];
            case 12:
                vr = _q.sent();
                isLocalDerby = (vr === null || vr === void 0 ? void 0 : vr.d) === 1;
                _q.label = 13;
            case 13:
                lineupQuery = isFriendly
                    ? c.env.DB.prepare("SELECT formation, tactic, players_data, is_auto, captain_id, preset_slot FROM lineups WHERE team_id = ? AND calendar_id = ?").bind(teamId, match.id)
                    : c.env.DB.prepare("SELECT formation, tactic, players_data, is_auto, captain_id, preset_slot FROM lineups WHERE team_id = ? AND calendar_id = ?").bind(teamId, calendarId);
                return [4 /*yield*/, c.env.DB.batch([
                        lineupQuery,
                        c.env.DB.prepare("SELECT p.id, p.first_name, p.last_name, p.position, p.overall_rating, p.age, p.weekly_wage, p.skills, p.life_context, p.personality, p.physical, p.squad_number, p.commute_km, p.suspended_matches, p.is_celebrity, ps.avg_rating, i.days_remaining as injury_days, i.type as injury_type FROM players p LEFT JOIN injuries i ON p.id = i.player_id AND i.days_remaining > 0 LEFT JOIN player_stats ps ON ps.player_id = p.id AND ps.team_id = p.team_id AND ps.season_id = (SELECT id FROM seasons WHERE status = 'active' LIMIT 1) WHERE p.team_id = ? AND (p.status IS NULL OR p.status = 'active') ORDER BY p.overall_rating DESC").bind(teamId),
                    ])];
            case 14:
                _a = _q.sent(), lineupRes = _a[0], playersRes = _a[1];
                lineup = (_m = lineupRes.results[0]) !== null && _m !== void 0 ? _m : null;
                lineupSource = lineup ? "explicit" : null;
                if (!!lineup) return [3 /*break*/, 16];
                return [4 /*yield*/, c.env.DB.prepare("SELECT formation, tactic, players_data, is_auto, captain_id, preset_slot FROM lineups WHERE team_id = ? AND is_auto = 0 ORDER BY submitted_at DESC, id ASC LIMIT 1").bind(teamId).first().catch(function (e) { logger_1.logger.warn({ module: "game" }, "db op failed", e); return null; })];
            case 15:
                lineup = _q.sent();
                if (lineup)
                    lineupSource = "default";
                _q.label = 16;
            case 16:
                players = { results: playersRes.results };
                matchDate = new Date(scheduledAt);
                daysUntilMatch = isFriendly ? 0 : Math.max(0, Math.round((matchDate.getTime() - gameDate.getTime()) / 86400000));
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../lib/seed"); })];
            case 17:
                absenceSeedForMatch = (_q.sent()).absenceSeedForMatch;
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../events/absence"); })];
            case 18:
                generateAbsences = (_q.sent()).generateAbsences;
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../events/match-absences"); })];
            case 19:
                fetchTeamDistrict = (_q.sent()).fetchTeamDistrict;
                matchKey = isFriendly ? match.id : calendarId;
                injuredPreviewIds = new Set();
                suspendedPreviewIds = new Set();
                return [4 /*yield*/, c.env.DB.prepare("SELECT player_id FROM injuries WHERE days_remaining > 0 AND player_id IN (SELECT id FROM players WHERE team_id = ?)").bind(teamId).all().catch(function () { return ({ results: [] }); })];
            case 20:
                injRows = _q.sent();
                for (_i = 0, _b = injRows.results; _i < _b.length; _i++) {
                    ir = _b[_i];
                    injuredPreviewIds.add(ir.player_id);
                }
                for (_c = 0, _d = players.results; _c < _d.length; _c++) {
                    r = _d[_c];
                    if (r.suspended_matches > 0)
                        suspendedPreviewIds.add(r.id);
                }
                healthyPlayers = players.results.filter(function (r) { return !injuredPreviewIds.has(r.id) && !suspendedPreviewIds.has(r.id); });
                absenceSquad = healthyPlayers.map(function (row) {
                    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
                    var pers = (function () { try {
                        return JSON.parse(row.personality);
                    }
                    catch (_a) {
                        return {};
                    } })();
                    var lc = (function () { try {
                        return JSON.parse(row.life_context);
                    }
                    catch (_a) {
                        return {};
                    } })();
                    var phys = (function () { try {
                        return JSON.parse(row.physical);
                    }
                    catch (_a) {
                        return {};
                    } })();
                    return {
                        firstName: row.first_name, lastName: row.last_name,
                        age: row.age, occupation: (_a = lc.occupation) !== null && _a !== void 0 ? _a : "",
                        discipline: (_b = pers.discipline) !== null && _b !== void 0 ? _b : 50, patriotism: (_c = pers.patriotism) !== null && _c !== void 0 ? _c : 50,
                        alcohol: (_d = pers.alcohol) !== null && _d !== void 0 ? _d : 30, temper: (_e = pers.temper) !== null && _e !== void 0 ? _e : 40,
                        morale: (_f = lc.morale) !== null && _f !== void 0 ? _f : 50, stamina: (_g = phys.stamina) !== null && _g !== void 0 ? _g : 50,
                        injuryProneness: (_h = pers.injuryProneness) !== null && _h !== void 0 ? _h : 50,
                        commuteKm: (_j = row.commute_km) !== null && _j !== void 0 ? _j : 0,
                        isCelebrity: !!row.is_celebrity,
                        celebrityType: pers.celebrityType,
                        celebrityTier: pers.celebrityTier,
                    };
                });
                return [4 /*yield*/, fetchTeamDistrict(c.env.DB, teamId)];
            case 21:
                district = _q.sent();
                friendlyMultiplier = isFriendly ? 1.8 : undefined;
                absences = [];
                if (daysUntilMatch <= 1) {
                    dayBeforeRng = (0, rng_1.createRng)(absenceSeedForMatch({ matchKey: matchKey, teamId: teamId, phase: "day_before" }));
                    matchDayRng = (0, rng_1.createRng)(absenceSeedForMatch({ matchKey: matchKey, teamId: teamId, phase: "match_day" }));
                    dayBeforeAbs = generateAbsences(dayBeforeRng, absenceSquad, "day_before", district, friendlyMultiplier);
                    matchDayAbs = generateAbsences(matchDayRng, absenceSquad, "match_day", district, friendlyMultiplier);
                    seen_1 = new Set();
                    absences = __spreadArray(__spreadArray([], dayBeforeAbs, true), matchDayAbs, true).filter(function (a) {
                        if (seen_1.has(a.playerIndex))
                            return false;
                        seen_1.add(a.playerIndex);
                        return true;
                    });
                }
                absentPlayerIds = new Set(absences.map(function (a) { var _a; return (_a = healthyPlayers[a.playerIndex]) === null || _a === void 0 ? void 0 : _a.id; }).filter(Boolean));
                playerIds = players.results.map(function (p) { return p.id; });
                relMap = {};
                if (!(playerIds.length > 1)) return [3 /*break*/, 25];
                _q.label = 22;
            case 22:
                _q.trys.push([22, 24, , 25]);
                placeholders = playerIds.map(function () { return "?"; }).join(",");
                return [4 /*yield*/, (_l = c.env.DB.prepare("SELECT player_a_id, player_b_id, type FROM relationships WHERE player_a_id IN (".concat(placeholders, ") OR player_b_id IN (").concat(placeholders, ")"))).bind.apply(_l, __spreadArray(__spreadArray([], playerIds, false), playerIds, false)).all()];
            case 23:
                relRows = _q.sent();
                for (_e = 0, _f = relRows.results; _e < _f.length; _e++) {
                    r = _f[_e];
                    if (!relMap[r.player_a_id])
                        relMap[r.player_a_id] = [];
                    if (!relMap[r.player_b_id])
                        relMap[r.player_b_id] = [];
                    relMap[r.player_a_id].push({ otherPlayerId: r.player_b_id, type: r.type });
                    relMap[r.player_b_id].push({ otherPlayerId: r.player_a_id, type: r.type });
                }
                return [3 /*break*/, 25];
            case 24:
                e_8 = _q.sent();
                logger_1.logger.warn({ module: "game" }, "relationships query for lineup", e_8);
                return [3 /*break*/, 25];
            case 25:
                available = players.results.map(function (p) {
                    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t;
                    var skills = (function () { try {
                        return JSON.parse(p.skills);
                    }
                    catch (e) {
                        logger_1.logger.warn({ module: "game" }, "parse player skills for lineup", e);
                        return {};
                    } })();
                    var lc = (function () { try {
                        return JSON.parse(p.life_context);
                    }
                    catch (e) {
                        logger_1.logger.warn({ module: "game" }, "parse player life_context for lineup", e);
                        return {};
                    } })();
                    var injured = p.injury_days > 0;
                    var suspended = ((_a = p.suspended_matches) !== null && _a !== void 0 ? _a : 0) > 0;
                    var absent = absentPlayerIds.has(p.id) || injured || suspended;
                    var absenceInfo = !injured && !suspended ? absences.find(function (a) { var _a; return ((_a = healthyPlayers[a.playerIndex]) === null || _a === void 0 ? void 0 : _a.id) === p.id; }) : null;
                    return {
                        id: p.id, firstName: p.first_name, lastName: p.last_name, position: p.position,
                        overallRating: p.overall_rating, age: p.age, condition: (_b = lc.condition) !== null && _b !== void 0 ? _b : 100, morale: (_c = lc.morale) !== null && _c !== void 0 ? _c : 50, squadNumber: (_d = p.squad_number) !== null && _d !== void 0 ? _d : null,
                        speed: (_e = skills.speed) !== null && _e !== void 0 ? _e : 50, technique: (_f = skills.technique) !== null && _f !== void 0 ? _f : 50, shooting: (_g = skills.shooting) !== null && _g !== void 0 ? _g : 50,
                        passing: (_h = skills.passing) !== null && _h !== void 0 ? _h : 50, heading: (_j = skills.heading) !== null && _j !== void 0 ? _j : 50, defense: (_k = skills.defense) !== null && _k !== void 0 ? _k : 50,
                        goalkeeping: (_l = skills.goalkeeping) !== null && _l !== void 0 ? _l : 50, stamina: (_m = skills.stamina) !== null && _m !== void 0 ? _m : 50,
                        avgRating: (_o = p.avg_rating) !== null && _o !== void 0 ? _o : null,
                        hangover: !!lc.hangover,
                        absent: absent,
                        injured: injured,
                        suspended: suspended,
                        suspendedMatches: suspended ? p.suspended_matches : null,
                        injuryDays: injured ? p.injury_days : null,
                        injuryType: injured ? p.injury_type : null,
                        absenceReason: suspended ? "Stopka" : injured ? "Zranění" : ((_p = absenceInfo === null || absenceInfo === void 0 ? void 0 : absenceInfo.reason) !== null && _p !== void 0 ? _p : null),
                        absenceSms: suspended ? "M\u00E1m stopku, ".concat(p.suspended_matches, " z\u00E1pas(\u016F) nesm\u00EDm hr\u00E1t.") : injured ? "Jsem zran\u011Bn\u00FD (".concat((_q = p.injury_type) !== null && _q !== void 0 ? _q : "zranění", "), je\u0161t\u011B ").concat(p.injury_days, " dn\u00ED.") : ((_r = absenceInfo === null || absenceInfo === void 0 ? void 0 : absenceInfo.smsText) !== null && _r !== void 0 ? _r : null),
                        absenceEmoji: suspended ? "🟥" : injured ? "🩹" : ((_s = absenceInfo === null || absenceInfo === void 0 ? void 0 : absenceInfo.emoji) !== null && _s !== void 0 ? _s : null),
                        relationships: (_t = relMap[p.id]) !== null && _t !== void 0 ? _t : [],
                    };
                });
                upcomingMatches = [];
                _q.label = 26;
            case 26:
                _q.trys.push([26, 30, , 31]);
                if (!team.league_id) return [3 /*break*/, 28];
                return [4 /*yield*/, c.env.DB.prepare("SELECT sc.id as cal_id, sc.game_week, sc.scheduled_at,\n          m.home_team_id, m.away_team_id, t1.name as home_name, t2.name as away_name,\n          (SELECT COUNT(*) FROM lineups l WHERE l.team_id = ? AND l.calendar_id = sc.id) as has_lineup\n        FROM season_calendar sc\n        JOIN matches m ON m.calendar_id = sc.id\n        JOIN teams t1 ON m.home_team_id = t1.id\n        JOIN teams t2 ON m.away_team_id = t2.id\n        WHERE sc.league_id = ? AND sc.status = 'scheduled'\n          AND (m.home_team_id = ? OR m.away_team_id = ?)\n        ORDER BY sc.scheduled_at ASC LIMIT 30").bind(teamId, team.league_id, teamId, teamId).all()];
            case 27:
                upcomingLeague = _q.sent();
                for (_g = 0, _h = upcomingLeague.results; _g < _h.length; _g++) {
                    u = _h[_g];
                    upcomingMatches.push({
                        calendarId: u.cal_id,
                        gameWeek: u.game_week,
                        scheduledAt: u.scheduled_at,
                        opponentName: (u.home_team_id === teamId ? u.away_name : u.home_name),
                        isHome: u.home_team_id === teamId,
                        hasLineup: u.has_lineup > 0,
                        isFriendly: false,
                    });
                }
                _q.label = 28;
            case 28: return [4 /*yield*/, c.env.DB.prepare("SELECT m.id as match_id, m.created_at, m.home_team_id, m.away_team_id,\n        t1.name as home_name, t2.name as away_name,\n        (SELECT COUNT(*) FROM lineups l WHERE l.team_id = ? AND l.calendar_id = m.id) as has_lineup\n       FROM matches m\n       JOIN teams t1 ON m.home_team_id = t1.id\n       JOIN teams t2 ON m.away_team_id = t2.id\n       WHERE (m.home_team_id = ? OR m.away_team_id = ?) AND m.status = 'lineups_open' AND m.calendar_id IS NULL\n       ORDER BY m.created_at ASC LIMIT 10").bind(teamId, teamId, teamId).all()];
            case 29:
                upcomingFriendly = _q.sent();
                for (_j = 0, _k = upcomingFriendly.results; _j < _k.length; _j++) {
                    u = _k[_j];
                    upcomingMatches.push({
                        calendarId: u.match_id, // pro přátelák používáme match.id (FE switch logika tomu rozumí)
                        gameWeek: null,
                        scheduledAt: u.created_at,
                        opponentName: (u.home_team_id === teamId ? u.away_name : u.home_name),
                        isHome: u.home_team_id === teamId,
                        hasLineup: u.has_lineup > 0,
                        isFriendly: true,
                    });
                }
                // Sloučit chronologicky
                upcomingMatches.sort(function (a, b) { return a.scheduledAt.localeCompare(b.scheduledAt); });
                return [3 /*break*/, 31];
            case 30:
                e_9 = _q.sent();
                logger_1.logger.warn({ module: "game" }, "fetch upcoming matches", e_9);
                return [3 /*break*/, 31];
            case 31: return [2 /*return*/, c.json({
                    nextMatch: {
                        matchId: match.id,
                        calendarId: isFriendly ? match.id : calendarId,
                        gameWeek: gameWeek,
                        scheduledAt: scheduledAt,
                        isHome: match.home_team_id === teamId,
                        homeName: match.home_name, awayName: match.away_name,
                        homeColor: match.home_color, awayColor: match.away_color,
                        isFriendly: isFriendly,
                        isLocalDerby: isLocalDerby,
                    },
                    lineup: lineup ? {
                        formation: lineup.formation, tactic: lineup.tactic, isAuto: lineup.is_auto === 1,
                        captainId: (_o = lineup.captain_id) !== null && _o !== void 0 ? _o : null,
                        presetSlot: (_p = lineup.preset_slot) !== null && _p !== void 0 ? _p : null,
                        source: lineupSource, // "explicit" = pro tento zápas, "default" = fallback z poslední uložené
                        players: (function () { try {
                            return JSON.parse(lineup.players_data);
                        }
                        catch (e) {
                            logger_1.logger.warn({ module: "game" }, "parse lineup players_data", e);
                            return [];
                        } })(),
                    } : null,
                    availablePlayers: available,
                    upcomingMatches: upcomingMatches,
                })];
        }
    });
}); });
// POST lineup-preview — vrátí sílu sestavy (per linie, attack/defense, overall)
// + comparison se soupeřem (auto best 11). Pure read, žádné DB writes.
// Když je předán matchId, backend si sám dohledá opponent.
gameRouter.post("/teams/:teamId/lineup-preview", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, body, e_10, players, _a, mapRowToMatchPlayer, autoSelectBest11, calcLineupPreview, placeholders, rows, posByPlayerId, ownLineup, ownSetup, opponentTeamId, matchRow, opponentSetup, opp, preview;
    var _b;
    var _c, _d, _e, _f;
    return __generator(this, function (_g) {
        switch (_g.label) {
            case 0:
                teamId = c.req.param("teamId");
                _g.label = 1;
            case 1:
                _g.trys.push([1, 3, , 4]);
                return [4 /*yield*/, c.req.json()];
            case 2:
                body = _g.sent();
                return [3 /*break*/, 4];
            case 3:
                e_10 = _g.sent();
                logger_1.logger.warn({ module: "game" }, "lineup-preview parse body", e_10);
                return [2 /*return*/, c.json({ error: "invalid_body" }, 400)];
            case 4:
                players = (_c = body.players) !== null && _c !== void 0 ? _c : [];
                if (players.length === 0)
                    return [2 /*return*/, c.json({ error: "no_players" }, 400)];
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../engine/lineup-loader"); })];
            case 5:
                _a = _g.sent(), mapRowToMatchPlayer = _a.mapRowToMatchPlayer, autoSelectBest11 = _a.autoSelectBest11;
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../engine/lineup-strength"); })];
            case 6:
                calcLineupPreview = (_g.sent()).calcLineupPreview;
                placeholders = players.map(function () { return "?"; }).join(",");
                return [4 /*yield*/, (_b = c.env.DB.prepare("SELECT id, first_name, last_name, nickname, position, skills, personality, life_context, physical FROM players WHERE id IN (".concat(placeholders, ") AND team_id = ?"))).bind.apply(_b, __spreadArray(__spreadArray([], players.map(function (p) { return p.playerId; }), false), [teamId], false)).all()];
            case 7:
                rows = (_d = (_g.sent()).results) !== null && _d !== void 0 ? _d : [];
                posByPlayerId = new Map(players.map(function (p) { return [p.playerId, p.matchPosition]; }));
                ownLineup = rows.map(function (r) { return mapRowToMatchPlayer(r, posByPlayerId.get(r.id)); });
                if (ownLineup.length < 11) {
                    return [2 /*return*/, c.json({ error: "incomplete_lineup", count: ownLineup.length }, 400)];
                }
                ownSetup = {
                    teamId: 1,
                    teamName: "own",
                    lineup: ownLineup,
                    subs: [],
                    tactic: ((_e = body.tactic) !== null && _e !== void 0 ? _e : "balanced"),
                    formation: (_f = body.formation) !== null && _f !== void 0 ? _f : "4-4-2",
                };
                opponentTeamId = null;
                if (!body.matchId) return [3 /*break*/, 9];
                return [4 /*yield*/, c.env.DB.prepare("SELECT home_team_id, away_team_id FROM matches WHERE id = ?").bind(body.matchId).first()];
            case 8:
                matchRow = _g.sent();
                if (matchRow) {
                    opponentTeamId = matchRow.home_team_id === teamId ? matchRow.away_team_id : matchRow.home_team_id;
                }
                _g.label = 9;
            case 9:
                if (!opponentTeamId) return [3 /*break*/, 11];
                return [4 /*yield*/, autoSelectBest11(c.env.DB, opponentTeamId)];
            case 10:
                opp = _g.sent();
                if (opp.players.length >= 11) {
                    opponentSetup = {
                        teamId: 2,
                        teamName: "opponent",
                        lineup: opp.players,
                        subs: [],
                        tactic: opp.tactic,
                        formation: opp.formation,
                    };
                }
                _g.label = 11;
            case 11:
                preview = calcLineupPreview(ownSetup, opponentSetup);
                return [2 /*return*/, c.json(preview)];
        }
    });
}); });
// GET lineup for specific calendar entry
gameRouter.get("/teams/:teamId/lineup/:calendarId", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, calendarId, row;
    var _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                teamId = c.req.param("teamId");
                calendarId = c.req.param("calendarId");
                return [4 /*yield*/, c.env.DB.prepare("SELECT formation, tactic, players_data, captain_id, preset_slot FROM lineups WHERE team_id = ? AND calendar_id = ?").bind(teamId, calendarId).first()];
            case 1:
                row = _c.sent();
                if (!row)
                    return [2 /*return*/, c.json({ lineup: null })];
                return [2 /*return*/, c.json({
                        lineup: {
                            formation: row.formation, tactic: row.tactic,
                            captainId: (_a = row.captain_id) !== null && _a !== void 0 ? _a : null,
                            presetSlot: (_b = row.preset_slot) !== null && _b !== void 0 ? _b : null,
                            players: (function () { try {
                                return JSON.parse(row.players_data);
                            }
                            catch (_a) {
                                return [];
                            } })(),
                        },
                    })];
        }
    });
}); });
// Whitelist taktik a formací — drží sync se shared/engine. Neplatné hodnoty by jinak crashly engine.
var VALID_TACTICS = ["offensive", "balanced", "defensive", "long_ball", "possession", "pressing"];
var VALID_FORMATIONS = ["4-4-2", "4-3-3", "3-5-2", "4-5-1", "5-3-2", "3-4-3"];
// POST save lineup for next match
gameRouter.post("/teams/:teamId/lineup", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, body, gkCount, playerIds, placeholders, validPlayers, validIds, invalid, captainId, existing, presetSlot, id;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, c.req.json()];
            case 1:
                body = _b.sent();
                if (!body.players || body.players.length !== 11)
                    return [2 /*return*/, c.json({ error: "Sestava musí mít přesně 11 hráčů" }, 400)];
                gkCount = body.players.filter(function (p) { return p.matchPosition === "GK"; }).length;
                if (gkCount !== 1)
                    return [2 /*return*/, c.json({ error: "Sestava musí mít přesně 1 brankáře" }, 400)];
                if (!VALID_TACTICS.includes(body.tactic)) {
                    return [2 /*return*/, c.json({ error: "Neplatn\u00E1 taktika \"".concat(body.tactic, "\"") }, 400)];
                }
                if (!VALID_FORMATIONS.includes(body.formation)) {
                    return [2 /*return*/, c.json({ error: "Neplatn\u00E1 formace \"".concat(body.formation, "\"") }, 400)];
                }
                playerIds = body.players.map(function (p) { return p.playerId; });
                if (new Set(playerIds).size !== playerIds.length) {
                    return [2 /*return*/, c.json({ error: "Sestava obsahuje duplicitního hráče" }, 400)];
                }
                placeholders = playerIds.map(function () { return "?"; }).join(",");
                return [4 /*yield*/, (_a = c.env.DB.prepare("SELECT p.id FROM players p LEFT JOIN injuries i ON p.id = i.player_id AND i.days_remaining > 0\n     WHERE p.id IN (".concat(placeholders, ") AND p.team_id = ? AND (p.status IS NULL OR p.status = 'active')\n     AND i.id IS NULL AND (p.suspended_matches IS NULL OR p.suspended_matches = 0)"))).bind.apply(_a, __spreadArray(__spreadArray([], playerIds, false), [teamId], false)).all().catch(function (e) { logger_1.logger.warn({ module: "game" }, "validate lineup players", e); return { results: [] }; })];
            case 2:
                validPlayers = _b.sent();
                validIds = new Set(validPlayers.results.map(function (r) { return r.id; }));
                invalid = playerIds.filter(function (id) { return !validIds.has(id); });
                if (invalid.length > 0) {
                    return [2 /*return*/, c.json({ error: "".concat(invalid.length, " hr\u00E1\u010D(\u016F) nen\u00ED dostupn\u00FDch (zran\u011Bn\u00ED, suspendace nebo nepat\u0159\u00ED do t\u00FDmu)") }, 400)];
                }
                captainId = body.captainId && playerIds.includes(body.captainId) ? body.captainId : null;
                return [4 /*yield*/, c.env.DB.prepare("SELECT id FROM lineups WHERE team_id = ? AND calendar_id = ?")
                        .bind(teamId, body.calendarId).first()];
            case 3:
                existing = _b.sent();
                presetSlot = body.presetSlot && ["A", "B", "C"].includes(body.presetSlot)
                    ? body.presetSlot : null;
                if (!existing) return [3 /*break*/, 5];
                return [4 /*yield*/, c.env.DB.prepare("UPDATE lineups SET formation = ?, tactic = ?, players_data = ?, captain_id = ?, preset_slot = ?, is_auto = 0, submitted_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?")
                        .bind(body.formation, body.tactic, JSON.stringify(body.players), captainId, presetSlot, existing.id).run()];
            case 4:
                _b.sent();
                return [3 /*break*/, 7];
            case 5:
                id = crypto.randomUUID();
                return [4 /*yield*/, c.env.DB.prepare("INSERT INTO lineups (id, team_id, calendar_id, formation, tactic, players_data, captain_id, preset_slot, is_auto, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))")
                        .bind(id, teamId, body.calendarId, body.formation, body.tactic, JSON.stringify(body.players), captainId, presetSlot).run()];
            case 6:
                _b.sent();
                _b.label = 7;
            case 7:
                if (!presetSlot) return [3 /*break*/, 9];
                return [4 /*yield*/, c.env.DB.prepare("INSERT INTO lineup_presets (team_id, slot, formation, tactic, captain_id, players_data, updated_at)\n       VALUES (?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))\n       ON CONFLICT(team_id, slot) DO UPDATE SET\n         formation = excluded.formation,\n         tactic = excluded.tactic,\n         captain_id = excluded.captain_id,\n         players_data = excluded.players_data,\n         updated_at = excluded.updated_at").bind(teamId, presetSlot, body.formation, body.tactic, captainId, JSON.stringify(body.players))
                        .run().catch(function (e) { return logger_1.logger.warn({ module: "game" }, "auto-upsert preset", e); })];
            case 8:
                _b.sent();
                _b.label = 9;
            case 9: return [2 /*return*/, c.json({ ok: true })];
        }
    });
}); });
// ═══ LINEUP PRESETS — fixní sloty A/B/C ═══
var PRESET_SLOTS = ["A", "B", "C"];
gameRouter.get("/teams/:teamId/lineup-presets", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, rows, presets, _loop_1, _i, _a, r;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, c.env.DB.prepare("SELECT slot, formation, tactic, captain_id, players_data, updated_at FROM lineup_presets WHERE team_id = ?").bind(teamId).all()
                        .catch(function (e) { logger_1.logger.warn({ module: "game" }, "load presets", e); return { results: [] }; })];
            case 1:
                rows = _b.sent();
                presets = { A: null, B: null, C: null };
                _loop_1 = function (r) {
                    presets[r.slot] = {
                        formation: r.formation,
                        tactic: r.tactic,
                        captainId: r.captain_id,
                        players: (function () { try {
                            return JSON.parse(r.players_data);
                        }
                        catch (_a) {
                            return [];
                        } })(),
                        updatedAt: r.updated_at,
                    };
                };
                for (_i = 0, _a = rows.results; _i < _a.length; _i++) {
                    r = _a[_i];
                    _loop_1(r);
                }
                return [2 /*return*/, c.json({ presets: presets })];
        }
    });
}); });
gameRouter.put("/teams/:teamId/lineup-presets/:slot", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, slot, body, playerIds, captainId;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                teamId = c.req.param("teamId");
                slot = c.req.param("slot");
                if (!PRESET_SLOTS.includes(slot))
                    return [2 /*return*/, c.json({ error: "Neplatný slot (A/B/C)" }, 400)];
                return [4 /*yield*/, c.req.json()];
            case 1:
                body = _a.sent();
                if (!body.players || body.players.length !== 11)
                    return [2 /*return*/, c.json({ error: "Sestava musí mít 11 hráčů" }, 400)];
                if (!VALID_TACTICS.includes(body.tactic)) {
                    return [2 /*return*/, c.json({ error: "Neplatn\u00E1 taktika \"".concat(body.tactic, "\"") }, 400)];
                }
                if (!VALID_FORMATIONS.includes(body.formation)) {
                    return [2 /*return*/, c.json({ error: "Neplatn\u00E1 formace \"".concat(body.formation, "\"") }, 400)];
                }
                playerIds = body.players.map(function (p) { return p.playerId; });
                captainId = body.captainId && playerIds.includes(body.captainId) ? body.captainId : null;
                return [4 /*yield*/, c.env.DB.prepare("INSERT INTO lineup_presets (team_id, slot, formation, tactic, captain_id, players_data, updated_at)\n     VALUES (?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))\n     ON CONFLICT(team_id, slot) DO UPDATE SET\n       formation = excluded.formation,\n       tactic = excluded.tactic,\n       captain_id = excluded.captain_id,\n       players_data = excluded.players_data,\n       updated_at = excluded.updated_at").bind(teamId, slot, body.formation, body.tactic, captainId, JSON.stringify(body.players)).run()];
            case 2:
                _a.sent();
                return [2 /*return*/, c.json({ ok: true })];
        }
    });
}); });
gameRouter.delete("/teams/:teamId/lineup-presets/:slot", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, slot;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                teamId = c.req.param("teamId");
                slot = c.req.param("slot");
                if (!PRESET_SLOTS.includes(slot))
                    return [2 /*return*/, c.json({ error: "Neplatný slot" }, 400)];
                return [4 /*yield*/, c.env.DB.prepare("DELETE FROM lineup_presets WHERE team_id = ? AND slot = ?").bind(teamId, slot).run()];
            case 1:
                _a.sent();
                return [2 /*return*/, c.json({ ok: true })];
        }
    });
}); });
gameRouter.post("/teams/:teamId/lineup-presets/:slot/apply", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, slot, preset, presetPlayers, allPlayers, playerMap, used, warnings, finalPlayersRaw, finalPlayers, gkCount, captainStillIn;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                teamId = c.req.param("teamId");
                slot = c.req.param("slot");
                if (!PRESET_SLOTS.includes(slot))
                    return [2 /*return*/, c.json({ error: "Neplatný slot" }, 400)];
                // Optional body — zatím nepoužíváme, ale FE ho posílá. Parse pro kompatibilitu.
                return [4 /*yield*/, c.req.json().catch(function () { return ({}); })];
            case 1:
                // Optional body — zatím nepoužíváme, ale FE ho posílá. Parse pro kompatibilitu.
                _a.sent();
                return [4 /*yield*/, c.env.DB.prepare("SELECT formation, tactic, captain_id, players_data FROM lineup_presets WHERE team_id = ? AND slot = ?").bind(teamId, slot).first()];
            case 2:
                preset = _a.sent();
                if (!preset)
                    return [2 /*return*/, c.json({ error: "Preset je prázdný" }, 404)];
                presetPlayers = (function () { try {
                    return JSON.parse(preset.players_data);
                }
                catch (_a) {
                    return [];
                } })();
                return [4 /*yield*/, c.env.DB.prepare("SELECT p.id, p.position, p.overall_rating,\n       (CASE WHEN i.days_remaining > 0 OR (p.suspended_matches IS NOT NULL AND p.suspended_matches > 0) OR p.status != 'active' THEN 1 ELSE 0 END) as unavailable\n     FROM players p LEFT JOIN injuries i ON p.id = i.player_id AND i.days_remaining > 0\n     WHERE p.team_id = ?").bind(teamId).all()];
            case 3:
                allPlayers = _a.sent();
                playerMap = new Map(allPlayers.results.map(function (p) { return [p.id, p]; }));
                used = new Set();
                warnings = [];
                finalPlayersRaw = presetPlayers.map(function (slot) {
                    var _a;
                    var stored = playerMap.get(slot.playerId);
                    if (stored && !stored.unavailable && !used.has(slot.playerId)) {
                        used.add(slot.playerId);
                        return slot;
                    }
                    // substitute — preferuj stejnou pozici, pak cokoliv dostupné
                    var repl = (_a = allPlayers.results.filter(function (x) { return !x.unavailable && !used.has(x.id) && x.position === slot.matchPosition; })
                        .sort(function (a, b) { return b.overall_rating - a.overall_rating; })[0]) !== null && _a !== void 0 ? _a : allPlayers.results.filter(function (x) { return !x.unavailable && !used.has(x.id); })
                        .sort(function (a, b) { return b.overall_rating - a.overall_rating; })[0];
                    if (repl) {
                        used.add(repl.id);
                        warnings.push("Hr\u00E1\u010D nahrazen na pozici ".concat(slot.matchPosition));
                        return { playerId: repl.id, matchPosition: slot.matchPosition };
                    }
                    // Žádná náhrada — slot zůstane prázdný (vrátí null)
                    warnings.push("Slot ".concat(slot.matchPosition, " nem\u00E1 n\u00E1hradu (m\u00E1lo dostupn\u00FDch hr\u00E1\u010D\u016F)"));
                    return null;
                });
                finalPlayers = finalPlayersRaw.filter(function (p) { return p !== null; });
                // Validace: musí být 11 hráčů, právě 1 GK
                if (finalPlayers.length < 11) {
                    return [2 /*return*/, c.json({ error: "T\u00FDm nem\u00E1 dost dostupn\u00FDch hr\u00E1\u010D\u016F (".concat(finalPlayers.length, "/11). N\u011Bkter\u00E9 sloty jsou pr\u00E1zdn\u00E9."), warnings: warnings }, 400)];
                }
                gkCount = finalPlayers.filter(function (p) { return p.matchPosition === "GK"; }).length;
                if (gkCount !== 1) {
                    return [2 /*return*/, c.json({ error: "Sestava mus\u00ED m\u00EDt pr\u00E1v\u011B 1 brank\u00E1\u0159e (m\u00E1 ".concat(gkCount, ")."), warnings: warnings }, 400)];
                }
                captainStillIn = preset.captain_id && finalPlayers.some(function (p) { return p.playerId === preset.captain_id; });
                return [2 /*return*/, c.json({
                        formation: preset.formation,
                        tactic: preset.tactic,
                        captainId: captainStillIn ? preset.captain_id : null,
                        players: finalPlayers,
                        warnings: warnings,
                    })];
        }
    });
}); });
// ═══ TACTIC FAMILIARITY (chemistry) ═══
gameRouter.get("/teams/:teamId/tactic-chemistry", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, readFamiliarity, fam;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../engine/chemistry"); })];
            case 1:
                readFamiliarity = (_a.sent()).readFamiliarity;
                return [4 /*yield*/, readFamiliarity(c.env.DB, teamId)];
            case 2:
                fam = _a.sent();
                return [2 /*return*/, c.json(fam)];
        }
    });
}); });
// ═══ ADMIN: backfill familiarity z historie ═══
gameRouter.post("/admin/backfill-chemistry", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var backfillFromHistory, result;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("../engine/chemistry"); })];
            case 1:
                backfillFromHistory = (_a.sent()).backfillFromHistory;
                return [4 /*yield*/, backfillFromHistory(c.env.DB)];
            case 2:
                result = _a.sent();
                return [2 /*return*/, c.json(__assign({ ok: true }, result))];
        }
    });
}); });
// Backfill: do pub_sessions z historických posezení doplnit avatary trenérů
gameRouter.post("/admin/backfill-stammtisch-coaches", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var backfillStammtischCoaches, result;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("../community/manager-relations"); })];
            case 1:
                backfillStammtischCoaches = (_a.sent()).backfillStammtischCoaches;
                return [4 /*yield*/, backfillStammtischCoaches(c.env.DB)];
            case 2:
                result = _a.sent();
                return [2 /*return*/, c.json(__assign({ ok: true }, result))];
        }
    });
}); });
// POST /api/admin/regenerate-u21-schedule — smaže existující U21 rozpis a vygeneruje
// single round-robin (každý s každým 1×, „polovina sezóny"). Volitelně ?leagueId=...
gameRouter.post("/admin/regenerate-u21-schedule", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var u21LeagueId, regenerateU21Schedule, _a, createRng, cryptoSeed, targets, _b, results, _i, targets_1, lg, rng, r, e_11;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                u21LeagueId = c.req.query("leagueId");
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../league/u21-generator"); })];
            case 1:
                regenerateU21Schedule = (_c.sent()).regenerateU21Schedule;
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../generators/rng"); })];
            case 2:
                _a = _c.sent(), createRng = _a.createRng, cryptoSeed = _a.cryptoSeed;
                if (!u21LeagueId) return [3 /*break*/, 3];
                _b = [{ id: u21LeagueId }];
                return [3 /*break*/, 5];
            case 3: return [4 /*yield*/, c.env.DB.prepare("SELECT id FROM leagues WHERE league_type = 'u21'").all()];
            case 4:
                _b = (_c.sent()).results;
                _c.label = 5;
            case 5:
                targets = _b;
                results = [];
                _i = 0, targets_1 = targets;
                _c.label = 6;
            case 6:
                if (!(_i < targets_1.length)) return [3 /*break*/, 11];
                lg = targets_1[_i];
                _c.label = 7;
            case 7:
                _c.trys.push([7, 9, , 10]);
                rng = createRng(cryptoSeed());
                return [4 /*yield*/, regenerateU21Schedule(c.env.DB, lg.id, rng)];
            case 8:
                r = _c.sent();
                results.push(__assign({ u21LeagueId: lg.id }, r));
                return [3 /*break*/, 10];
            case 9:
                e_11 = _c.sent();
                results.push({ u21LeagueId: lg.id, error: String(e_11) });
                return [3 /*break*/, 10];
            case 10:
                _i++;
                return [3 /*break*/, 6];
            case 11: return [2 /*return*/, c.json({ ok: true, leagues: results.length, results: results })];
        }
    });
}); });
// POST /api/admin/backfill-u21 — vytvoří U21 ligu/týmy/rozpis pro všechny existující A-ligy.
// Idempotentní: liga s parent_league_id se přeskočí.
gameRouter.post("/admin/backfill-u21", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var seniorLeagueId, backfillU21ForLeague, _a, createRng, cryptoSeed, targets, _b, results, _i, targets_2, lg, rng, r, e_12;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                seniorLeagueId = c.req.query("leagueId");
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../league/u21-generator"); })];
            case 1:
                backfillU21ForLeague = (_c.sent()).backfillU21ForLeague;
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../generators/rng"); })];
            case 2:
                _a = _c.sent(), createRng = _a.createRng, cryptoSeed = _a.cryptoSeed;
                if (!seniorLeagueId) return [3 /*break*/, 3];
                _b = [{ id: seniorLeagueId }];
                return [3 /*break*/, 5];
            case 3: return [4 /*yield*/, c.env.DB.prepare("SELECT id FROM leagues WHERE league_type = 'senior' OR league_type IS NULL").all()];
            case 4:
                _b = (_c.sent()).results;
                _c.label = 5;
            case 5:
                targets = _b;
                results = [];
                _i = 0, targets_2 = targets;
                _c.label = 6;
            case 6:
                if (!(_i < targets_2.length)) return [3 /*break*/, 11];
                lg = targets_2[_i];
                _c.label = 7;
            case 7:
                _c.trys.push([7, 9, , 10]);
                rng = createRng(cryptoSeed());
                return [4 /*yield*/, backfillU21ForLeague(c.env.DB, lg.id, rng)];
            case 8:
                r = _c.sent();
                results.push(__assign({ seniorLeagueId: lg.id }, r));
                return [3 /*break*/, 10];
            case 9:
                e_12 = _c.sent();
                results.push({ seniorLeagueId: lg.id, error: String(e_12) });
                return [3 /*break*/, 10];
            case 10:
                _i++;
                return [3 /*break*/, 6];
            case 11: return [2 /*return*/, c.json({ ok: true, leagues: results.length, results: results })];
        }
    });
}); });
// POST /api/admin/backfill-pub?date=YYYY-MM-DD — vygenerovat pub session pro daný den pro všechny lidské týmy.
// Pokud date neuvedeno, použije se včerejšek.
gameRouter.post("/admin/backfill-pub", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var today, dateParam, target, y, generatePubSessionsForAllTeams, result;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                today = new Date();
                dateParam = c.req.query("date");
                target = dateParam;
                if (!target) {
                    y = new Date(today);
                    y.setUTCDate(y.getUTCDate() - 1);
                    target = y.toISOString().slice(0, 10);
                }
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../season/pub"); })];
            case 1:
                generatePubSessionsForAllTeams = (_a.sent()).generatePubSessionsForAllTeams;
                return [4 /*yield*/, generatePubSessionsForAllTeams(c.env.DB, target)];
            case 2:
                result = _a.sent();
                return [2 /*return*/, c.json(__assign({ ok: true, gameDate: target }, result))];
        }
    });
}); });
// POST /api/admin/backfill-achievements — přepočítat achievementy ze stavu DB pro všechny týmy (nebo jeden).
gameRouter.post("/admin/backfill-achievements", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var targetTeamId, backfillTeamAchievements, teams, _a, summary, totalUnlocked, _loop_2, _i, teams_1, t;
    var _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                targetTeamId = c.req.query("teamId");
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../services/achievements"); })];
            case 1:
                backfillTeamAchievements = (_c.sent()).backfillTeamAchievements;
                if (!targetTeamId) return [3 /*break*/, 2];
                _a = [{ id: targetTeamId }];
                return [3 /*break*/, 4];
            case 2: return [4 /*yield*/, c.env.DB.prepare("SELECT id FROM teams").all()];
            case 3:
                _a = (_c.sent()).results;
                _c.label = 4;
            case 4:
                teams = _a;
                summary = {};
                totalUnlocked = 0;
                _loop_2 = function (t) {
                    var unlocked, _d, unlocked_1, key;
                    return __generator(this, function (_e) {
                        switch (_e.label) {
                            case 0: return [4 /*yield*/, backfillTeamAchievements(c.env.DB, t.id).catch(function (e) {
                                    logger_1.logger.warn({ module: "game" }, "backfill achievements for ".concat(t.id), e);
                                    return [];
                                })];
                            case 1:
                                unlocked = _e.sent();
                                totalUnlocked += unlocked.length;
                                for (_d = 0, unlocked_1 = unlocked; _d < unlocked_1.length; _d++) {
                                    key = unlocked_1[_d];
                                    summary[key] = ((_b = summary[key]) !== null && _b !== void 0 ? _b : 0) + 1;
                                }
                                return [2 /*return*/];
                        }
                    });
                };
                _i = 0, teams_1 = teams;
                _c.label = 5;
            case 5:
                if (!(_i < teams_1.length)) return [3 /*break*/, 8];
                t = teams_1[_i];
                return [5 /*yield**/, _loop_2(t)];
            case 6:
                _c.sent();
                _c.label = 7;
            case 7:
                _i++;
                return [3 /*break*/, 5];
            case 8: return [2 /*return*/, c.json({ ok: true, teams: teams.length, totalUnlocked: totalUnlocked, perAchievement: summary })];
        }
    });
}); });
// ═══ TRANSFER SYSTEM ═══
// Release player → free agent
gameRouter.post("/teams/:teamId/players/:playerId/release", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, playerId, player, existingFa, removePlayer, removed, createTransferNews, e_13;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 7, , 8]);
                teamId = c.req.param("teamId");
                playerId = c.req.param("playerId");
                return [4 /*yield*/, c.env.DB.prepare("SELECT p.*, t.name as team_name, t.league_id, v.district FROM players p JOIN teams t ON p.team_id = t.id JOIN villages v ON t.village_id = v.id WHERE p.id = ? AND p.team_id = ?").bind(playerId, teamId).first()];
            case 1:
                player = _a.sent();
                if (!player)
                    return [2 /*return*/, c.json({ error: "Hráč nenalezen" }, 404)];
                return [4 /*yield*/, c.env.DB.prepare("SELECT id FROM free_agents WHERE released_from_team_id = ? AND first_name = ? AND last_name = ? AND created_at > datetime('now', '-5 minutes')").bind(teamId, player.first_name, player.last_name).first().catch(function (e) { logger_1.logger.warn({ module: "game" }, "check duplicate free agent", e); return null; })];
            case 2:
                existingFa = _a.sent();
                if (existingFa)
                    return [2 /*return*/, c.json({ ok: true })];
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../transfers/remove-player"); })];
            case 3:
                removePlayer = (_a.sent()).removePlayer;
                return [4 /*yield*/, removePlayer(c.env.DB, playerId, "released", { toFreeAgent: true, teamId: teamId })];
            case 4:
                removed = _a.sent();
                if (!removed.ok)
                    return [2 /*return*/, c.json({ error: "Hráč nenalezen" }, 404)];
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../transfers/transfer-news"); })];
            case 5:
                createTransferNews = (_a.sent()).createTransferNews;
                return [4 /*yield*/, createTransferNews(c.env.DB, player.league_id, teamId, "player_released", {
                        playerName: "".concat(player.first_name, " ").concat(player.last_name), playerAge: player.age,
                        playerPosition: player.position, teamName: player.team_name,
                    }).catch(function (e) { return logger_1.logger.warn({ module: "game" }, "create release news", e); })];
            case 6:
                _a.sent();
                return [2 /*return*/, c.json({ ok: true })];
            case 7:
                e_13 = _a.sent();
                logger_1.logger.error({ module: "game" }, "release player failed", e_13);
                return [2 /*return*/, c.json({ error: String(e_13) }, 500)];
            case 8: return [2 /*return*/];
        }
    });
}); });
// List free agents
gameRouter.get("/teams/:teamId/free-agents", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId_1, team_2, agents, filtered, result, e_14;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 3, , 4]);
                teamId_1 = c.req.param("teamId");
                return [4 /*yield*/, c.env.DB.prepare("SELECT t.reputation, v.district, v.lat, v.lng FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?").bind(teamId_1).first()];
            case 1:
                team_2 = _a.sent();
                if (!team_2)
                    return [2 /*return*/, c.json({ error: "Tým nenalezen" }, 404)];
                return [4 /*yield*/, c.env.DB.prepare("SELECT fa.*, v.lat as v_lat, v.lng as v_lon, v.name as village_name FROM free_agents fa LEFT JOIN villages v ON fa.village_id = v.id WHERE fa.district = ? AND fa.expires_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now') ORDER BY fa.overall_rating DESC").bind(team_2.district).all()];
            case 2:
                agents = _a.sent();
                filtered = agents.results.filter(function (fa) {
                    var _a;
                    try {
                        var rej = JSON.parse((_a = fa.rejected_by) !== null && _a !== void 0 ? _a : "[]");
                        return !rej.includes(teamId_1);
                    }
                    catch (e) {
                        logger_1.logger.warn({ module: "game" }, "parse rejected_by", e);
                        return true;
                    }
                });
                result = filtered.map(function (fa) {
                    var _a, _b;
                    var distKm = null;
                    if (fa.v_lat && fa.v_lon && team_2.lat && team_2.lng) {
                        var R = 6371;
                        var dLat = (fa.v_lat - team_2.lat) * Math.PI / 180;
                        var dLon = (fa.v_lon - team_2.lng) * Math.PI / 180;
                        var a = Math.pow(Math.sin(dLat / 2), 2) + Math.cos(team_2.lat * Math.PI / 180) * Math.cos(fa.v_lat * Math.PI / 180) * Math.pow(Math.sin(dLon / 2), 2);
                        distKm = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
                    }
                    return {
                        id: fa.id, firstName: fa.first_name, lastName: fa.last_name, nickname: fa.nickname,
                        nationality: (_a = fa.nationality) !== null && _a !== void 0 ? _a : "CZ",
                        age: fa.age, position: fa.position, overallRating: fa.overall_rating, weeklyWage: fa.weekly_wage,
                        occupation: (function () { var _a, _b; try {
                            return (_b = (_a = JSON.parse(fa.life_context)) === null || _a === void 0 ? void 0 : _a.occupation) !== null && _b !== void 0 ? _b : "";
                        }
                        catch (e) {
                            logger_1.logger.warn({ module: "game" }, "parse free agent life_context", e);
                            return "";
                        } })(),
                        source: fa.source, villageName: (_b = fa.village_name) !== null && _b !== void 0 ? _b : null, distanceKm: distKm, expiresAt: fa.expires_at,
                        avatar: (function () { try {
                            return JSON.parse(fa.avatar);
                        }
                        catch (e) {
                            logger_1.logger.warn({ module: "game" }, "parse free agent avatar", e);
                            return {};
                        } })(),
                        skills: (function () { try {
                            return JSON.parse(fa.skills);
                        }
                        catch (e) {
                            logger_1.logger.warn({ module: "game" }, "parse free agent skills", e);
                            return {};
                        } })(),
                        physical: (function () { try {
                            return JSON.parse(fa.physical);
                        }
                        catch (e) {
                            logger_1.logger.warn({ module: "game" }, "parse free agent physical", e);
                            return {};
                        } })(),
                        personality: (function () { try {
                            return JSON.parse(fa.personality);
                        }
                        catch (e) {
                            logger_1.logger.warn({ module: "game" }, "parse free agent personality", e);
                            return {};
                        } })(),
                        isCelebrity: !!fa.is_celebrity,
                    };
                });
                return [2 /*return*/, c.json({ freeAgents: result })];
            case 3:
                e_14 = _a.sent();
                logger_1.logger.error({ module: "game" }, "fetch free agents failed", e_14);
                return [2 /*return*/, c.json({ error: String(e_14), freeAgents: [] }, 500)];
            case 4: return [2 /*return*/];
        }
    });
}); });
// Search all players across all teams in the league
gameRouter.get("/teams/:teamId/search-players", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId_2, searchLeagueId, team, targetLeague, rows, blur_1, players, e_15;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 3, , 4]);
                teamId_2 = c.req.param("teamId");
                searchLeagueId = c.req.query("leagueId");
                return [4 /*yield*/, c.env.DB.prepare("SELECT league_id FROM teams WHERE id = ?")
                        .bind(teamId_2).first()];
            case 1:
                team = _a.sent();
                if (!(team === null || team === void 0 ? void 0 : team.league_id))
                    return [2 /*return*/, c.json({ players: [] })];
                targetLeague = searchLeagueId !== null && searchLeagueId !== void 0 ? searchLeagueId : team.league_id;
                return [4 /*yield*/, c.env.DB.prepare("SELECT p.id, p.first_name, p.last_name, p.nickname, p.age, p.position, p.overall_rating, p.weekly_wage,\n       p.skills, p.physical, p.personality, p.life_context, p.avatar, p.squad_number, p.nationality,\n       t.id as team_id, t.name as team_name\n       FROM players p JOIN teams t ON p.team_id = t.id\n       WHERE t.league_id = ? AND t.id != ? AND t.user_id != 'ai' AND (p.status IS NULL OR p.status = 'active')\n       ORDER BY p.overall_rating DESC LIMIT 200").bind(targetLeague, teamId_2).all()];
            case 2:
                rows = _a.sent();
                blur_1 = function (v) { return Math.round(v / 5) * 5; };
                players = rows.results.map(function (r) {
                    var _a;
                    var isOwn = r.team_id === teamId_2;
                    var skills = {};
                    var physical = {};
                    try {
                        skills = JSON.parse(r.skills);
                    }
                    catch (e) {
                        logger_1.logger.warn({ module: "game" }, "parse player skills", e);
                    }
                    try {
                        physical = JSON.parse(r.physical);
                    }
                    catch (e) {
                        logger_1.logger.warn({ module: "game" }, "parse player physical", e);
                    }
                    // Foreign players: blur attributes (round to nearest 5)
                    if (!isOwn) {
                        for (var _i = 0, _b = Object.keys(skills); _i < _b.length; _i++) {
                            var k = _b[_i];
                            if (typeof skills[k] === "number")
                                skills[k] = blur_1(skills[k]);
                        }
                        for (var _c = 0, _d = Object.keys(physical); _c < _d.length; _c++) {
                            var k = _d[_c];
                            if (typeof physical[k] === "number")
                                physical[k] = blur_1(physical[k]);
                        }
                    }
                    return {
                        id: r.id, firstName: r.first_name, lastName: r.last_name, nickname: r.nickname,
                        nationality: (_a = r.nationality) !== null && _a !== void 0 ? _a : "CZ",
                        age: r.age, position: r.position, overallRating: r.overall_rating, weeklyWage: r.weekly_wage,
                        squadNumber: r.squad_number,
                        teamId: r.team_id, teamName: r.team_name, isOwnTeam: isOwn,
                        skills: skills,
                        physical: physical,
                        avatar: (function () { try {
                            return JSON.parse(r.avatar);
                        }
                        catch (e) {
                            logger_1.logger.warn({ module: "game" }, "parse player avatar", e);
                            return {};
                        } })(),
                    };
                });
                return [2 /*return*/, c.json({ players: players })];
            case 3:
                e_15 = _a.sent();
                logger_1.logger.error({ module: "game" }, "search players failed", e_15);
                return [2 /*return*/, c.json({ error: String(e_15), players: [] }, 500)];
            case 4: return [2 /*return*/];
        }
    });
}); });
// Sign free agent
gameRouter.post("/teams/:teamId/free-agents/:faId/sign", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, faId, body, team, fa, agentVillage, squadCount, personality, evaluateSigningChance, rng, decision, currentRejected, playerId, isCelebrity, faLifeCtx, faSkillsMax, generateResidence, teamVillage, resRng, res, season, deleted, gameDate, createTransferNews, celebPers, celebTier, celebTypeStr, tierDesc, headline, bodyText, leagueTeams, _i, _a, lt, repBonus, newPlayer, playerData;
    var _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r;
    return __generator(this, function (_s) {
        switch (_s.label) {
            case 0:
                teamId = c.req.param("teamId");
                faId = c.req.param("faId");
                return [4 /*yield*/, c.req.json()];
            case 1:
                body = _s.sent();
                return [4 /*yield*/, c.env.DB.prepare("SELECT t.*, v.lat, v.lng, v.district FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?").bind(teamId).first()];
            case 2:
                team = _s.sent();
                if (!team)
                    return [2 /*return*/, c.json({ error: "Tým nenalezen" }, 404)];
                return [4 /*yield*/, c.env.DB.prepare("SELECT * FROM free_agents WHERE id = ?").bind(faId).first()];
            case 3:
                fa = _s.sent();
                if (!fa)
                    return [2 /*return*/, c.json({ error: "Volný hráč nenalezen" }, 404)];
                agentVillage = null;
                if (!fa.village_id) return [3 /*break*/, 5];
                return [4 /*yield*/, c.env.DB.prepare("SELECT lat, lng FROM villages WHERE id = ?")
                        .bind(fa.village_id).first().catch(function (e) { logger_1.logger.warn({ module: "game" }, "fetch agent village coords", e); return null; })];
            case 4:
                agentVillage = _s.sent();
                _s.label = 5;
            case 5: return [4 /*yield*/, c.env.DB.prepare("SELECT COUNT(*) as cnt FROM players WHERE team_id = ?")
                    .bind(teamId).first()];
            case 6:
                squadCount = _s.sent();
                if (((_b = squadCount === null || squadCount === void 0 ? void 0 : squadCount.cnt) !== null && _b !== void 0 ? _b : 0) >= 30)
                    return [2 /*return*/, c.json({ error: "Kádr je plný (max. 30 hráčů)" }, 400)];
                personality = (function () { try {
                    return JSON.parse(fa.personality);
                }
                catch (e) {
                    logger_1.logger.warn({ module: "game" }, "parse free agent personality", e);
                    return {};
                } })();
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../transfers/player-agency"); })];
            case 7:
                evaluateSigningChance = (_s.sent()).evaluateSigningChance;
                rng = (0, rng_1.createRng)((0, rng_1.cryptoSeed)());
                decision = evaluateSigningChance({ weekly_wage: fa.weekly_wage, personality: personality, village_id: fa.village_id, district: fa.district }, { reputation: team.reputation, villageLat: team.lat, villageLon: team.lng, squadSize: (_c = squadCount === null || squadCount === void 0 ? void 0 : squadCount.cnt) !== null && _c !== void 0 ? _c : 15, district: team.district }, agentVillage, body.offeredWage, rng);
                if (!!decision.accepted) return [3 /*break*/, 9];
                currentRejected = (function () { var _a; try {
                    return JSON.parse((_a = fa.rejected_by) !== null && _a !== void 0 ? _a : "[]");
                }
                catch (e) {
                    logger_1.logger.warn({ module: "game" }, "parse rejected_by for update", e);
                    return [];
                } })();
                currentRejected.push(teamId);
                return [4 /*yield*/, c.env.DB.prepare("UPDATE free_agents SET rejected_by = ? WHERE id = ?")
                        .bind(JSON.stringify(currentRejected), faId).run().catch(function (e) { return logger_1.logger.warn({ module: "game" }, "update rejected_by", e); })];
            case 8:
                _s.sent();
                return [2 /*return*/, c.json({ success: false, decision: decision })];
            case 9:
                playerId = crypto.randomUUID();
                isCelebrity = (_d = fa.is_celebrity) !== null && _d !== void 0 ? _d : 0;
                faLifeCtx = (function () { try {
                    return JSON.parse(fa.life_context);
                }
                catch (_a) {
                    return {};
                } })();
                faSkillsMax = faLifeCtx.skillsMax ? JSON.stringify(faLifeCtx.skillsMax) : fa.skills;
                return [4 /*yield*/, c.env.DB.prepare("INSERT INTO players (id, team_id, first_name, last_name, nickname, age, position, overall_rating, skills, physical, personality, life_context, avatar, hidden_talent, weekly_wage, nationality, status, is_celebrity, skills_max)\n     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)").bind(playerId, teamId, fa.first_name, fa.last_name, (_e = fa.nickname) !== null && _e !== void 0 ? _e : "", fa.age, fa.position, fa.overall_rating, fa.skills, fa.physical, fa.personality, fa.life_context, fa.avatar, (_f = fa.hidden_talent) !== null && _f !== void 0 ? _f : 0, body.offeredWage, (_g = fa.nationality) !== null && _g !== void 0 ? _g : "CZ", isCelebrity, faSkillsMax).run()];
            case 10:
                _s.sent();
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../generators/residence"); })];
            case 11:
                generateResidence = (_s.sent()).generateResidence;
                return [4 /*yield*/, c.env.DB.prepare("SELECT v.name, v.size, v.district FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?")
                        .bind(teamId).first().catch(function (e) { logger_1.logger.warn({ module: "game" }, "db op failed", e); return null; })];
            case 12:
                teamVillage = _s.sent();
                if (!teamVillage) return [3 /*break*/, 14];
                resRng = (0, rng_1.createRng)((0, rng_1.cryptoSeed)());
                res = generateResidence(resRng, teamVillage.name, teamVillage.size, teamVillage.district);
                return [4 /*yield*/, c.env.DB.prepare("UPDATE players SET residence = ?, commute_km = ? WHERE id = ?")
                        .bind(res.residence, res.commuteKm, playerId).run().catch(function (e) { return logger_1.logger.warn({ module: "game" }, "db op failed", e); })];
            case 13:
                _s.sent();
                _s.label = 14;
            case 14: return [4 /*yield*/, c.env.DB.prepare("SELECT id FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1").first().catch(function (e) { logger_1.logger.warn({ module: "game" }, "fetch season for signing contract", e); return null; })];
            case 15:
                season = _s.sent();
                return [4 /*yield*/, c.env.DB.prepare("INSERT INTO player_contracts (id, player_id, team_id, season_id, join_type, fee, is_active) VALUES (?, ?, ?, ?, 'free_agent', 0, 1)")
                        .bind(crypto.randomUUID(), playerId, teamId, (_h = season === null || season === void 0 ? void 0 : season.id) !== null && _h !== void 0 ? _h : "unknown").run().catch(function (e) { return logger_1.logger.warn({ module: "game" }, "insert signing contract", e); })];
            case 16:
                _s.sent();
                return [4 /*yield*/, c.env.DB.prepare("DELETE FROM free_agents WHERE id = ? RETURNING id").bind(faId).first()];
            case 17:
                deleted = _s.sent();
                if (!!deleted) return [3 /*break*/, 19];
                // Jiný tým ho stihl dřív — rollback: smazat hráče co jsme právě insertli
                return [4 /*yield*/, c.env.DB.prepare("DELETE FROM players WHERE id = ?").bind(playerId).run()
                        .catch(function (e) { return logger_1.logger.warn({ module: "game" }, "rollback player after FA race condition", e); })];
            case 18:
                // Jiný tým ho stihl dřív — rollback: smazat hráče co jsme právě insertli
                _s.sent();
                return [2 /*return*/, c.json({ error: "Hráč již byl podepsán jiným týmem" }, 409)];
            case 19:
                gameDate = (_j = team.game_date) !== null && _j !== void 0 ? _j : new Date().toISOString();
                return [4 /*yield*/, (0, finance_processor_1.recordTransaction)(c.env.DB, teamId, "signing_fee", -500, "Registrace: ".concat(fa.first_name, " ").concat(fa.last_name), gameDate)];
            case 20:
                _s.sent();
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../transfers/transfer-news"); })];
            case 21:
                createTransferNews = (_s.sent()).createTransferNews;
                if (!isCelebrity) return [3 /*break*/, 30];
                celebPers = (function () { try {
                    return JSON.parse(fa.personality);
                }
                catch (_a) {
                    return {};
                } })();
                celebTier = celebPers.celebrityTier;
                celebTypeStr = (_k = celebPers.celebrityType) !== null && _k !== void 0 ? _k : "legend";
                tierDesc = celebTypeStr === "legend"
                    ? { S: "bývalý reprezentant", A: "ex-ligista z 1. ligy", B: "hráč 2. ligy", C: "krajský přeborník" }[celebTier !== null && celebTier !== void 0 ? celebTier : "C"]
                    : celebTypeStr === "fallen_star" ? "zkrachovalý talent" : "věčně zraněný profík";
                headline = "HOTOVO: ".concat(fa.first_name, " ").concat(fa.last_name, " podepsal za ").concat(team.name, "!");
                bodyText = celebTier === "S"
                    ? "Je to ofici\u00E1ln\u00ED! ".concat(fa.first_name, " ").concat(fa.last_name, " bude hr\u00E1t za ").concat(team.name, " v okresn\u00EDm p\u0159eboru. Cel\u00FD okres je vzh\u016Fru nohama.")
                    : "".concat(fa.first_name, " ").concat(fa.last_name, ", ").concat(tierDesc, ", se dohodl s ").concat(team.name, ". Pos\u00EDl\u00ED k\u00E1dr pro zbytek sez\u00F3ny.");
                return [4 /*yield*/, c.env.DB.prepare("INSERT INTO news (id, league_id, type, headline, body, created_at) VALUES (?, ?, 'celebrity_signing', ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))")
                        .bind(crypto.randomUUID(), team.league_id, headline, bodyText).run()
                        .catch(function (e) { return logger_1.logger.warn({ module: "game" }, "celebrity signing news", e); })];
            case 22:
                _s.sent();
                return [4 /*yield*/, c.env.DB.prepare("SELECT c.id as conv_id FROM teams t JOIN conversations c ON c.team_id = t.id AND c.type = 'chairman' WHERE t.league_id = ? AND t.user_id != 'ai'").bind(team.league_id).all().catch(function (e) { logger_1.logger.warn({ module: "game" }, "fetch league teams for celeb broadcast", e); return { results: [] }; })];
            case 23:
                leagueTeams = _s.sent();
                _i = 0, _a = leagueTeams.results;
                _s.label = 24;
            case 24:
                if (!(_i < _a.length)) return [3 /*break*/, 27];
                lt = _a[_i];
                return [4 /*yield*/, c.env.DB.prepare("INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, sent_at) VALUES (?, ?, 'system', 'Předseda Přeboru', ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))")
                        .bind(crypto.randomUUID(), lt.conv_id, "\u2B50 ".concat(fa.first_name, " ").concat(fa.last_name, " podepsal smlouvu s ").concat(team.name, "!"))
                        .run().catch(function (e) { return logger_1.logger.warn({ module: "game" }, "celeb signing broadcast", e); })];
            case 25:
                _s.sent();
                _s.label = 26;
            case 26:
                _i++;
                return [3 /*break*/, 24];
            case 27:
                repBonus = (_l = { S: 15, A: 10, B: 7, C: 4 }[celebTier !== null && celebTier !== void 0 ? celebTier : "C"]) !== null && _l !== void 0 ? _l : 5;
                return [4 /*yield*/, c.env.DB.prepare("UPDATE teams SET reputation = MIN(100, reputation + ?) WHERE id = ?")
                        .bind(repBonus, teamId).run().catch(function (e) { return logger_1.logger.warn({ module: "game" }, "celeb rep boost", e); })];
            case 28:
                _s.sent();
                return [4 /*yield*/, c.env.DB.prepare("UPDATE players SET life_context = json_set(life_context, '$.morale', MIN(100, json_extract(life_context, '$.morale') + 3)) WHERE team_id = ?")
                        .bind(teamId).run().catch(function (e) { return logger_1.logger.warn({ module: "game" }, "celeb morale boost", e); })];
            case 29:
                _s.sent();
                return [3 /*break*/, 32];
            case 30: return [4 /*yield*/, createTransferNews(c.env.DB, team.league_id, teamId, "player_signed", {
                    playerName: "".concat(fa.first_name, " ").concat(fa.last_name), playerAge: fa.age,
                    playerPosition: fa.position, teamName: team.name,
                }).catch(function (e) { return logger_1.logger.warn({ module: "game" }, "create signing news", e); })];
            case 31:
                _s.sent();
                _s.label = 32;
            case 32: return [4 /*yield*/, c.env.DB.prepare("SELECT * FROM players WHERE id = ?").bind(playerId).first().catch(function (e) { logger_1.logger.warn({ module: "game" }, "fetch new player after signing", e); return null; })];
            case 33:
                newPlayer = _s.sent();
                playerData = newPlayer ? __assign(__assign({}, newPlayer), { skills: JSON.parse((_m = newPlayer.skills) !== null && _m !== void 0 ? _m : "{}"), physical: JSON.parse((_o = newPlayer.physical) !== null && _o !== void 0 ? _o : "{}"), personality: JSON.parse((_p = newPlayer.personality) !== null && _p !== void 0 ? _p : "{}"), lifeContext: JSON.parse((_q = newPlayer.life_context) !== null && _q !== void 0 ? _q : "{}"), avatar: JSON.parse((_r = newPlayer.avatar) !== null && _r !== void 0 ? _r : "{}") }) : null;
                return [2 /*return*/, c.json({ success: true, decision: decision, playerId: playerId, player: playerData })];
        }
    });
}); });
// List player on transfer market
gameRouter.post("/teams/:teamId/players/:playerId/list", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, playerId, body, player, existing, expiresAt, id, createTransferNews;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                teamId = c.req.param("teamId");
                playerId = c.req.param("playerId");
                return [4 /*yield*/, c.req.json()];
            case 1:
                body = _a.sent();
                return [4 /*yield*/, c.env.DB.prepare("SELECT p.first_name, p.last_name, p.age, p.position, p.loan_from_team_id, t.league_id, t.name as team_name FROM players p JOIN teams t ON p.team_id = t.id WHERE p.id = ? AND p.team_id = ?").bind(playerId, teamId).first()];
            case 2:
                player = _a.sent();
                if (!player)
                    return [2 /*return*/, c.json({ error: "Hráč nenalezen" }, 404)];
                if (player.loan_from_team_id)
                    return [2 /*return*/, c.json({ error: "Hostující hráč nemůže být vylistován na trh" }, 400)];
                return [4 /*yield*/, c.env.DB.prepare("SELECT id FROM transfer_listings WHERE player_id = ? AND status = 'active'").bind(playerId).first()];
            case 3:
                existing = _a.sent();
                if (existing)
                    return [2 /*return*/, c.json({ error: "Hráč je už na trhu" }, 400)];
                expiresAt = new Date();
                expiresAt.setDate(expiresAt.getDate() + 7);
                id = crypto.randomUUID();
                return [4 /*yield*/, c.env.DB.prepare("INSERT INTO transfer_listings (id, player_id, team_id, asking_price, league_id, expires_at) VALUES (?, ?, ?, ?, ?, ?)").bind(id, playerId, teamId, body.askingPrice, player.league_id, expiresAt.toISOString()).run()];
            case 4:
                _a.sent();
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../transfers/transfer-news"); })];
            case 5:
                createTransferNews = (_a.sent()).createTransferNews;
                return [4 /*yield*/, createTransferNews(c.env.DB, player.league_id, teamId, "player_listed", {
                        playerName: "".concat(player.first_name, " ").concat(player.last_name), playerAge: player.age,
                        playerPosition: player.position, teamName: player.team_name, fee: body.askingPrice,
                    }).catch(function (e) { return logger_1.logger.warn({ module: "game" }, "create listing news", e); })];
            case 6:
                _a.sent();
                return [2 /*return*/, c.json({ ok: true, listingId: id })];
        }
    });
}); });
// ═══ WATCHLIST (scouted players) ═══
// Add player to watchlist
gameRouter.post("/teams/:teamId/watchlist/:playerId", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, playerId, playerExists;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                teamId = c.req.param("teamId");
                playerId = c.req.param("playerId");
                return [4 /*yield*/, c.env.DB.prepare("SELECT id FROM players WHERE id = ?")
                        .bind(playerId).first()
                        .catch(function (e) { logger_1.logger.warn({ module: "game" }, "check player exists for watchlist", e); return null; })];
            case 1:
                playerExists = _a.sent();
                if (!playerExists)
                    return [2 /*return*/, c.json({ error: "Hráč nenalezen" }, 404)];
                return [4 /*yield*/, c.env.DB.prepare("INSERT OR IGNORE INTO player_watchlist (id, team_id, player_id) VALUES (?, ?, ?)").bind(crypto.randomUUID(), teamId, playerId).run()
                        .catch(function (e) { return logger_1.logger.warn({ module: "game" }, "insert watchlist", e); })];
            case 2:
                _a.sent();
                return [2 /*return*/, c.json({ ok: true })];
        }
    });
}); });
// Remove player from watchlist
gameRouter.delete("/teams/:teamId/watchlist/:playerId", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, playerId;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                teamId = c.req.param("teamId");
                playerId = c.req.param("playerId");
                return [4 /*yield*/, c.env.DB.prepare("DELETE FROM player_watchlist WHERE team_id = ? AND player_id = ?")
                        .bind(teamId, playerId).run()
                        .catch(function (e) { return logger_1.logger.warn({ module: "game" }, "delete watchlist", e); })];
            case 1:
                _a.sent();
                return [2 /*return*/, c.json({ ok: true })];
        }
    });
}); });
// Hall of Fame — žebříček všech týmů podle počtu achievementů (zlato > stříbro > bronz)
gameRouter.get("/hall-of-fame", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var rows, entries;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, c.env.DB.prepare("SELECT\n       t.id as team_id, t.name as team_name, t.primary_color, t.secondary_color, t.badge_pattern,\n       t.user_id as user_id,\n       m.id as manager_id, m.name as manager_name, m.avatar as manager_avatar,\n       v.name as village_name,\n       COUNT(ta.achievement_key) as total,\n       COALESCE(SUM(CASE WHEN ta.tier = 'gold' THEN 1 ELSE 0 END), 0) as gold,\n       COALESCE(SUM(CASE WHEN ta.tier = 'silver' THEN 1 ELSE 0 END), 0) as silver,\n       COALESCE(SUM(CASE WHEN ta.tier = 'bronze' THEN 1 ELSE 0 END), 0) as bronze\n     FROM teams t\n     LEFT JOIN managers m ON m.team_id = t.id\n     LEFT JOIN villages v ON v.id = t.village_id\n     LEFT JOIN team_achievements ta ON ta.team_id = t.id\n     GROUP BY t.id\n     ORDER BY gold DESC, silver DESC, bronze DESC, t.name ASC\n     LIMIT 100").all()
                    .catch(function (e) { logger_1.logger.warn({ module: "game" }, "hall of fame query", e); return { results: [] }; })];
            case 1:
                rows = _a.sent();
                entries = rows.results.map(function (r, i) {
                    var _a, _b, _c, _d;
                    return ({
                        rank: i + 1,
                        teamId: r.team_id,
                        teamName: r.team_name,
                        primaryColor: r.primary_color || "#2D5F2D",
                        secondaryColor: r.secondary_color || "#FFFFFF",
                        badgePattern: r.badge_pattern || "shield",
                        isHuman: r.user_id !== "ai",
                        managerId: r.manager_id,
                        managerName: r.manager_name,
                        managerAvatar: (function () {
                            try {
                                return r.manager_avatar ? JSON.parse(r.manager_avatar) : null;
                            }
                            catch (e) {
                                logger_1.logger.warn({ module: "game" }, "parse manager avatar for hof", e);
                                return null;
                            }
                        })(),
                        villageName: r.village_name,
                        total: (_a = r.total) !== null && _a !== void 0 ? _a : 0,
                        gold: (_b = r.gold) !== null && _b !== void 0 ? _b : 0,
                        silver: (_c = r.silver) !== null && _c !== void 0 ? _c : 0,
                        bronze: (_d = r.bronze) !== null && _d !== void 0 ? _d : 0,
                    });
                });
                return [2 /*return*/, c.json({ entries: entries })];
        }
    });
}); });
// Kořaly — seznam získaných + katalog všech achievementů
gameRouter.get("/teams/:teamId/achievements", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, _a, ACHIEVEMENTS, getTeamAchievements, earned, earnedMap;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../services/achievements"); })];
            case 1:
                _a = _b.sent(), ACHIEVEMENTS = _a.ACHIEVEMENTS, getTeamAchievements = _a.getTeamAchievements;
                return [4 /*yield*/, getTeamAchievements(c.env.DB, teamId)];
            case 2:
                earned = _b.sent();
                earnedMap = new Map(earned.map(function (e) { return [e.key, e.earnedAt]; }));
                return [2 /*return*/, c.json({
                        achievements: ACHIEVEMENTS.map(function (a) {
                            var _a;
                            return ({
                                key: a.key,
                                icon: a.icon,
                                title: a.title,
                                desc: a.desc,
                                tier: a.tier,
                                earnedAt: (_a = earnedMap.get(a.key)) !== null && _a !== void 0 ? _a : null,
                            });
                        }),
                        earnedCount: earned.length,
                        totalCount: ACHIEVEMENTS.length,
                    })];
        }
    });
}); });
// List watched players with enriched data (known attrs, last matches, transfers)
gameRouter.get("/teams/:teamId/watchlist", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, rows, playerIds, matchStats, placeholders, statsRows, _i, _a, s, e_16, transfers, placeholders, trRows, _b, _c, t, arr, e_17, roundTo5, players;
    var _d, _e;
    var _f, _g, _h, _j, _k;
    return __generator(this, function (_l) {
        switch (_l.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, c.env.DB.prepare("SELECT w.player_id, w.created_at as watched_since,\n       p.id, p.first_name, p.last_name, p.nickname, p.age, p.position, p.overall_rating,\n       p.skills, p.avatar, p.team_id,\n       t.name as team_name, t.primary_color as team_color, t.secondary_color as team_secondary,\n       t.badge_pattern as team_badge, t.user_id as team_user_id,\n       v.name as village_name, v.district,\n       i.days_remaining as injury_days, i.type as injury_type\n     FROM player_watchlist w\n     JOIN players p ON p.id = w.player_id\n     LEFT JOIN teams t ON t.id = p.team_id\n     LEFT JOIN villages v ON v.id = t.village_id\n     LEFT JOIN injuries i ON i.player_id = p.id AND i.days_remaining > 0\n     WHERE w.team_id = ? AND (p.status IS NULL OR p.status != 'released')\n     ORDER BY w.created_at DESC").bind(teamId).all()
                        .catch(function (e) { logger_1.logger.warn({ module: "game" }, "fetch watchlist", e); return { results: [] }; })];
            case 1:
                rows = _l.sent();
                playerIds = rows.results.map(function (r) { return r.id; });
                matchStats = new Map();
                if (!(playerIds.length > 0)) return [3 /*break*/, 5];
                _l.label = 2;
            case 2:
                _l.trys.push([2, 4, , 5]);
                placeholders = playerIds.map(function () { return "?"; }).join(",");
                return [4 /*yield*/, (_d = c.env.DB.prepare("SELECT player_id,\n           COUNT(*) as matches,\n           SUM(goals) as goals,\n           SUM(assists) as assists,\n           AVG(rating) as avg_rating\n         FROM (\n           SELECT player_id, goals, assists, rating\n           FROM match_player_stats\n           WHERE player_id IN (".concat(placeholders, ")\n           ORDER BY created_at DESC\n           LIMIT 50\n         )\n         GROUP BY player_id"))).bind.apply(_d, playerIds).all()];
            case 3:
                statsRows = _l.sent();
                for (_i = 0, _a = statsRows.results; _i < _a.length; _i++) {
                    s = _a[_i];
                    matchStats.set(s.player_id, {
                        goals: (_f = s.goals) !== null && _f !== void 0 ? _f : 0,
                        assists: (_g = s.assists) !== null && _g !== void 0 ? _g : 0,
                        avgRating: (_h = s.avg_rating) !== null && _h !== void 0 ? _h : 0,
                        matches: (_j = s.matches) !== null && _j !== void 0 ? _j : 0,
                    });
                }
                return [3 /*break*/, 5];
            case 4:
                e_16 = _l.sent();
                logger_1.logger.warn({ module: "game" }, "fetch watchlist match stats", e_16);
                return [3 /*break*/, 5];
            case 5:
                transfers = new Map();
                if (!(playerIds.length > 0)) return [3 /*break*/, 9];
                _l.label = 6;
            case 6:
                _l.trys.push([6, 8, , 9]);
                placeholders = playerIds.map(function () { return "?"; }).join(",");
                return [4 /*yield*/, (_e = c.env.DB.prepare("SELECT o.player_id, COALESCE(o.resolved_at, o.created_at) as date,\n           COALESCE(o.counter_amount, o.offer_amount) as fee,\n           seller.name as seller_name,\n           buyer.name as buyer_name\n         FROM transfer_offers o\n         LEFT JOIN teams seller ON seller.id = o.to_team_id\n         LEFT JOIN teams buyer ON buyer.id = o.from_team_id\n         WHERE o.player_id IN (".concat(placeholders, ") AND o.status = 'accepted'\n         ORDER BY date DESC\n         LIMIT 50"))).bind.apply(_e, playerIds).all()];
            case 7:
                trRows = _l.sent();
                for (_b = 0, _c = trRows.results; _b < _c.length; _b++) {
                    t = _c[_b];
                    arr = (_k = transfers.get(t.player_id)) !== null && _k !== void 0 ? _k : [];
                    if (arr.length < 3)
                        arr.push({ date: t.date, fromTeam: t.seller_name, toTeam: t.buyer_name, fee: t.fee });
                    transfers.set(t.player_id, arr);
                }
                return [3 /*break*/, 9];
            case 8:
                e_17 = _l.sent();
                logger_1.logger.warn({ module: "game" }, "fetch watchlist transfers", e_17);
                return [3 /*break*/, 9];
            case 9:
                roundTo5 = function (v) { return Math.round(v / 5) * 5; };
                players = rows.results.map(function (r) {
                    var _a, _b;
                    var skills = (function () { try {
                        return JSON.parse(r.skills);
                    }
                    catch (_a) {
                        return {};
                    } })();
                    var avatar = (function () { try {
                        return JSON.parse(r.avatar);
                    }
                    catch (_a) {
                        return {};
                    } })();
                    var blurredSkills = {};
                    for (var _i = 0, _c = Object.keys(skills); _i < _c.length; _i++) {
                        var k = _c[_i];
                        if (typeof skills[k] === "number")
                            blurredSkills[k] = roundTo5(skills[k]);
                    }
                    var stats = (_a = matchStats.get(r.id)) !== null && _a !== void 0 ? _a : { goals: 0, assists: 0, avgRating: 0, matches: 0 };
                    return {
                        id: r.id,
                        firstName: r.first_name,
                        lastName: r.last_name,
                        nickname: r.nickname,
                        age: r.age,
                        position: r.position,
                        overallRating: r.overall_rating,
                        skills: blurredSkills,
                        avatar: avatar,
                        teamId: r.team_id,
                        teamName: r.team_name,
                        teamColor: r.team_color,
                        teamSecondary: r.team_secondary,
                        teamBadge: r.team_badge,
                        teamIsAI: r.team_user_id === "ai",
                        villageName: r.village_name,
                        district: r.district,
                        injury: r.injury_days ? { daysRemaining: r.injury_days, type: r.injury_type } : null,
                        watchedSince: r.watched_since,
                        recentStats: {
                            matches: stats.matches,
                            goals: stats.goals,
                            assists: stats.assists,
                            avgRating: Math.round(stats.avgRating * 10) / 10,
                        },
                        transfers: (_b = transfers.get(r.id)) !== null && _b !== void 0 ? _b : [],
                    };
                });
                return [2 /*return*/, c.json({ players: players })];
        }
    });
}); });
// Withdraw listing
gameRouter.delete("/teams/:teamId/listings/:listingId", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, listingId;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                teamId = c.req.param("teamId");
                listingId = c.req.param("listingId");
                return [4 /*yield*/, c.env.DB.prepare("UPDATE transfer_listings SET status = 'withdrawn' WHERE id = ? AND team_id = ?").bind(listingId, teamId).run()];
            case 1:
                _a.sent();
                return [4 /*yield*/, c.env.DB.prepare("UPDATE transfer_bids SET status = 'rejected' WHERE listing_id = ? AND status = 'pending'").bind(listingId).run().catch(function (e) { return logger_1.logger.warn({ module: "game" }, "reject bids on listing withdrawal", e); })];
            case 2:
                _a.sent();
                return [2 /*return*/, c.json({ ok: true })];
        }
    });
}); });
// Browse transfer market
gameRouter.get("/teams/:teamId/market", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, team, listings, myListings, myListingIds, bids, bidsResult, listingIds, myBids, myBidsResult, _i, _a, b, playerIds, myOffersByPlayer, myOffersResult, _b, _c, o;
    var _d, _e, _f;
    var _g;
    return __generator(this, function (_h) {
        switch (_h.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, c.env.DB.prepare("SELECT league_id FROM teams WHERE id = ?").bind(teamId).first()];
            case 1:
                team = _h.sent();
                if (!team)
                    return [2 /*return*/, c.json({ error: "Tým nenalezen" }, 404)];
                return [4 /*yield*/, c.env.DB.prepare("SELECT tl.id, tl.player_id, tl.asking_price, tl.expires_at, tl.is_ai_listing, tl.ai_player_data, tl.rejected_by,\n     p.first_name, p.last_name, p.age, p.position, p.overall_rating, p.avatar as player_avatar, p.skills, p.nationality,\n     t.name as team_name, i.days_remaining as injury_days\n     FROM transfer_listings tl\n     LEFT JOIN players p ON tl.player_id = p.id AND tl.is_ai_listing = 0\n     LEFT JOIN teams t ON tl.team_id = t.id AND tl.is_ai_listing = 0\n     LEFT JOIN injuries i ON p.id = i.player_id AND i.days_remaining > 0 AND tl.is_ai_listing = 0\n     WHERE tl.league_id = ? AND tl.status = 'active' AND tl.team_id != ? ORDER BY tl.created_at DESC").bind(team.league_id, teamId).all()];
            case 2:
                listings = _h.sent();
                // Filter out listings where this team was rejected (same as free agents)
                listings.results = listings.results.filter(function (l) {
                    var _a;
                    try {
                        var rej = JSON.parse((_a = l.rejected_by) !== null && _a !== void 0 ? _a : "[]");
                        return !rej.includes(teamId);
                    }
                    catch (e) {
                        logger_1.logger.warn({ module: "game" }, "parse rejected_by in market filter", e);
                        return true;
                    }
                });
                return [4 /*yield*/, c.env.DB.prepare("SELECT tl.id, tl.player_id, tl.asking_price, tl.expires_at,\n     p.first_name, p.last_name, p.age, p.position, p.overall_rating, p.avatar as player_avatar\n     FROM transfer_listings tl JOIN players p ON tl.player_id = p.id WHERE tl.team_id = ? AND tl.status = 'active'").bind(teamId).all()];
            case 3:
                myListings = _h.sent();
                myListingIds = myListings.results.map(function (l) { return l.id; });
                bids = [];
                if (!(myListingIds.length > 0)) return [3 /*break*/, 5];
                return [4 /*yield*/, (_d = c.env.DB.prepare("SELECT tb.*, t.name as bidder_name FROM transfer_bids tb JOIN teams t ON tb.team_id = t.id\n       WHERE tb.listing_id IN (".concat(myListingIds.map(function () { return "?"; }).join(","), ") AND tb.status = 'pending'"))).bind.apply(_d, myListingIds).all().catch(function (e) { logger_1.logger.warn({ module: "game" }, "fetch bids for my listings", e); return { results: [] }; })];
            case 4:
                bidsResult = _h.sent();
                bids = bidsResult.results;
                _h.label = 5;
            case 5:
                listingIds = listings.results.map(function (l) { return l.id; });
                myBids = {};
                if (!(listingIds.length > 0)) return [3 /*break*/, 7];
                return [4 /*yield*/, (_e = c.env.DB.prepare("SELECT listing_id, amount FROM transfer_bids WHERE team_id = ? AND status = 'pending' AND listing_id IN (".concat(listingIds.map(function () { return "?"; }).join(","), ")"))).bind.apply(_e, __spreadArray([teamId], listingIds, false)).all().catch(function (e) { logger_1.logger.warn({ module: "game" }, "fetch my bids", e); return { results: [] }; })];
            case 6:
                myBidsResult = _h.sent();
                for (_i = 0, _a = myBidsResult.results; _i < _a.length; _i++) {
                    b = _a[_i];
                    myBids[b.listing_id] = b.amount;
                }
                _h.label = 7;
            case 7:
                playerIds = listings.results.map(function (l) { return l.player_id; }).filter(Boolean);
                myOffersByPlayer = {};
                if (!(playerIds.length > 0)) return [3 /*break*/, 9];
                return [4 /*yield*/, (_f = c.env.DB.prepare("SELECT id, player_id, offer_amount, counter_amount, status FROM transfer_offers\n       WHERE from_team_id = ? AND status IN ('pending','countered') AND player_id IN (".concat(playerIds.map(function () { return "?"; }).join(","), ")"))).bind.apply(_f, __spreadArray([teamId], playerIds, false)).all().catch(function (e) { logger_1.logger.warn({ module: "game" }, "fetch my offers for market", e); return { results: [] }; })];
            case 8:
                myOffersResult = _h.sent();
                for (_b = 0, _c = myOffersResult.results; _b < _c.length; _b++) {
                    o = _c[_b];
                    myOffersByPlayer[o.player_id] = {
                        offerId: o.id,
                        amount: o.offer_amount,
                        counterAmount: (_g = o.counter_amount) !== null && _g !== void 0 ? _g : null,
                        status: o.status,
                    };
                }
                _h.label = 9;
            case 9: return [2 /*return*/, c.json({
                    listings: listings.results.map(function (l) {
                        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
                        var isAi = !!l.is_ai_listing;
                        if (isAi) {
                            var ai = (function () { try {
                                return JSON.parse(l.ai_player_data);
                            }
                            catch (_a) {
                                return {};
                            } })();
                            var blur_2 = function (v) { return Math.round(v / 5) * 5; };
                            return {
                                id: l.id, playerId: "virtual_ai", askingPrice: l.asking_price, isAiListing: true,
                                playerName: "".concat((_a = ai.firstName) !== null && _a !== void 0 ? _a : "?", " ").concat((_b = ai.lastName) !== null && _b !== void 0 ? _b : "?"), nationality: (_c = ai.nationality) !== null && _c !== void 0 ? _c : "CZ", playerAge: ai.age, position: ai.position,
                                overallRating: ai.overallRating, teamName: (_d = ai.fromTeam) !== null && _d !== void 0 ? _d : "Neznámý tým", expiresAt: l.expires_at,
                                avatar: (_e = ai.avatar) !== null && _e !== void 0 ? _e : {},
                                skills: ai.skills ? Object.fromEntries(Object.entries(ai.skills).map(function (_a) {
                                    var k = _a[0], v = _a[1];
                                    return [k, typeof v === "number" ? blur_2(v) : v];
                                })) : {},
                                myBidAmount: (_f = myBids[l.id]) !== null && _f !== void 0 ? _f : null,
                            };
                        }
                        var activeOffer = (_g = myOffersByPlayer[l.player_id]) !== null && _g !== void 0 ? _g : null;
                        return {
                            id: l.id, playerId: l.player_id, askingPrice: l.asking_price, isAiListing: false,
                            playerName: "".concat(l.first_name, " ").concat(l.last_name), nationality: (_h = l.nationality) !== null && _h !== void 0 ? _h : "CZ", playerAge: l.age, position: l.position,
                            overallRating: l.overall_rating, teamName: l.team_name, expiresAt: l.expires_at,
                            injuryDays: (_j = l.injury_days) !== null && _j !== void 0 ? _j : null,
                            avatar: (function () { try {
                                return JSON.parse(l.player_avatar);
                            }
                            catch (e) {
                                logger_1.logger.warn({ module: "game" }, "parse market avatar: ".concat(e));
                                return {};
                            } })(),
                            skills: (function () { try {
                                var s = JSON.parse(l.skills);
                                var blur_3 = function (v) { return Math.round(v / 5) * 5; };
                                return Object.fromEntries(Object.entries(s).map(function (_a) {
                                    var k = _a[0], v = _a[1];
                                    return [k, typeof v === "number" ? blur_3(v) : v];
                                }));
                            }
                            catch (_a) {
                                return {};
                            } })(),
                            myBidAmount: (_k = myBids[l.id]) !== null && _k !== void 0 ? _k : null,
                            myActiveOfferId: (_l = activeOffer === null || activeOffer === void 0 ? void 0 : activeOffer.offerId) !== null && _l !== void 0 ? _l : null,
                            myActiveOfferAmount: activeOffer ? ((_m = activeOffer.counterAmount) !== null && _m !== void 0 ? _m : activeOffer.amount) : null,
                            myActiveOfferStatus: (_o = activeOffer === null || activeOffer === void 0 ? void 0 : activeOffer.status) !== null && _o !== void 0 ? _o : null,
                        };
                    }),
                    myListings: myListings.results.map(function (l) { return ({
                        id: l.id, playerId: l.player_id, askingPrice: l.asking_price,
                        playerName: "".concat(l.first_name, " ").concat(l.last_name), playerAge: l.age, position: l.position,
                        overallRating: l.overall_rating, expiresAt: l.expires_at,
                        avatar: (function () { try {
                            return JSON.parse(l.player_avatar);
                        }
                        catch (e) {
                            logger_1.logger.warn({ module: "game" }, "parse myListing avatar: ".concat(e));
                            return {};
                        } })(),
                        bids: bids.filter(function (b) { return b.listing_id === l.id; }).map(function (b) { return ({
                            id: b.id, amount: b.amount, bidderName: b.bidder_name, teamId: b.team_id,
                        }); }),
                    }); }),
                })];
        }
    });
}); });
// Place bid
gameRouter.post("/teams/:teamId/market/:listingId/bid", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, listingId, body, team, listing, aiData, rejectedByStr_1, rejectedBy, teamInfo, squadCount, aiVillage, evaluateSigningChance, agencyRng, pers, decision, playerId, skills, physical, personality, lifeContext, avatar, weeklyWage, recordTransaction_1, gameDate, generateResidence, teamVillage, resRng, res, season, teamRow, createTransferNews, newPlayer, playerData, listingInfo, existing, expiresAt, offerId, pName, createNotification, pushEnv, e_18;
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3;
    return __generator(this, function (_4) {
        switch (_4.label) {
            case 0:
                teamId = c.req.param("teamId");
                listingId = c.req.param("listingId");
                return [4 /*yield*/, c.req.json()];
            case 1:
                body = _4.sent();
                if (!body.amount || body.amount <= 0 || !Number.isInteger(body.amount)) {
                    return [2 /*return*/, c.json({ error: "Nabídka musí být kladné celé číslo" }, 400)];
                }
                return [4 /*yield*/, c.env.DB.prepare("SELECT budget FROM teams WHERE id = ?").bind(teamId).first()];
            case 2:
                team = _4.sent();
                if (!team || team.budget < body.amount)
                    return [2 /*return*/, c.json({ error: "Nedostatek pen\u011Bz. M\u00E1te ".concat((_b = (_a = team === null || team === void 0 ? void 0 : team.budget) === null || _a === void 0 ? void 0 : _a.toLocaleString("cs")) !== null && _b !== void 0 ? _b : 0, " K\u010D, nab\u00EDz\u00EDte ").concat(body.amount.toLocaleString("cs"), " K\u010D.") }, 400)];
                return [4 /*yield*/, c.env.DB.prepare("SELECT is_ai_listing, ai_player_data, asking_price, rejected_by FROM transfer_listings WHERE id = ? AND status = 'active'")
                        .bind(listingId).first()];
            case 3:
                listing = _4.sent();
                if (!listing)
                    return [2 /*return*/, c.json({ error: "Listing nenalezen" }, 404)];
                if (!listing.is_ai_listing) return [3 /*break*/, 26];
                // AI listing — check price, then player agency decision, then transfer
                if (body.amount < listing.asking_price) {
                    return [2 /*return*/, c.json({ error: "Nab\u00EDdka je p\u0159\u00EDli\u0161 n\u00EDzk\u00E1. Po\u017Eadovan\u00E1 cena: ".concat(listing.asking_price.toLocaleString("cs"), " K\u010D.") }, 400)];
                }
                aiData = JSON.parse(listing.ai_player_data);
                rejectedByStr_1 = (_c = listing.rejected_by) !== null && _c !== void 0 ? _c : "[]";
                rejectedBy = (function () { try {
                    return JSON.parse(rejectedByStr_1);
                }
                catch (_a) {
                    return [];
                } })();
                if (rejectedBy.includes(teamId)) {
                    return [2 /*return*/, c.json({ ok: false, rejected: true, explanation: "Hráč vás už jednou odmítl. Momentálně nemá zájem." })];
                }
                return [4 /*yield*/, c.env.DB.prepare("SELECT t.reputation, v.lat, v.lng, v.district FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?").bind(teamId).first()];
            case 4:
                teamInfo = _4.sent();
                return [4 /*yield*/, c.env.DB.prepare("SELECT COUNT(*) as cnt FROM players WHERE team_id = ?")
                        .bind(teamId).first().catch(function (e) { logger_1.logger.warn({ module: "game" }, "count squad for AI bid", e); return { cnt: 15 }; })];
            case 5:
                squadCount = _4.sent();
                return [4 /*yield*/, c.env.DB.prepare("SELECT lat, lng FROM villages WHERE name = ? OR name LIKE ? LIMIT 1").bind((_d = aiData.fromCity) !== null && _d !== void 0 ? _d : "", "".concat((_e = aiData.fromCity) !== null && _e !== void 0 ? _e : "", "%")).first()
                        .catch(function (e) { logger_1.logger.warn({ module: "game" }, "fetch AI city coords", e); return null; })];
            case 6:
                aiVillage = _4.sent();
                if (!teamInfo) return [3 /*break*/, 9];
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../transfers/player-agency"); })];
            case 7:
                evaluateSigningChance = (_4.sent()).evaluateSigningChance;
                agencyRng = (0, rng_1.createRng)((0, rng_1.cryptoSeed)());
                pers = __assign(__assign({}, ((_f = aiData.personality) !== null && _f !== void 0 ? _f : {})), { patriotism: 65 });
                decision = evaluateSigningChance({ weekly_wage: (_g = aiData.weeklyWage) !== null && _g !== void 0 ? _g : 200, personality: pers, district: (_h = aiData.fromDistrict) !== null && _h !== void 0 ? _h : null }, { reputation: teamInfo.reputation, villageLat: teamInfo.lat, villageLon: teamInfo.lng, squadSize: (_j = squadCount === null || squadCount === void 0 ? void 0 : squadCount.cnt) !== null && _j !== void 0 ? _j : 15, district: teamInfo.district }, aiVillage, (_k = aiData.weeklyWage) !== null && _k !== void 0 ? _k : 200, agencyRng);
                if (!!decision.accepted) return [3 /*break*/, 9];
                // Save rejection — same pattern as free agents rejected_by
                rejectedBy.push(teamId);
                return [4 /*yield*/, c.env.DB.prepare("UPDATE transfer_listings SET rejected_by = ? WHERE id = ?")
                        .bind(JSON.stringify(rejectedBy), listingId).run()
                        .catch(function (e) { return logger_1.logger.warn({ module: "game" }, "save AI rejection", e); })];
            case 8:
                _4.sent();
                return [2 /*return*/, c.json({ ok: false, rejected: true, explanation: decision.explanation, factors: decision.factors })];
            case 9:
                playerId = crypto.randomUUID();
                skills = JSON.stringify((_l = aiData.skills) !== null && _l !== void 0 ? _l : {});
                physical = JSON.stringify((_m = aiData.physical) !== null && _m !== void 0 ? _m : {});
                personality = JSON.stringify((_o = aiData.personality) !== null && _o !== void 0 ? _o : {});
                lifeContext = JSON.stringify({ occupation: "Fotbalista", condition: 80, morale: 55 });
                avatar = JSON.stringify((_p = aiData.avatar) !== null && _p !== void 0 ? _p : {});
                weeklyWage = (_q = aiData.weeklyWage) !== null && _q !== void 0 ? _q : Math.round(10 + (((_r = aiData.overallRating) !== null && _r !== void 0 ? _r : 40) / 100) * 400);
                return [4 /*yield*/, c.env.DB.prepare("INSERT INTO players (id, team_id, first_name, last_name, age, position, overall_rating, skills, physical, personality, life_context, avatar, weekly_wage, status, nationality)\n       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)").bind(playerId, teamId, aiData.firstName, aiData.lastName, aiData.age, aiData.position, aiData.overallRating, skills, physical, personality, lifeContext, avatar, weeklyWage, (_s = aiData.nationality) !== null && _s !== void 0 ? _s : "CZ").run()];
            case 10:
                _4.sent();
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../season/finance-processor"); })];
            case 11:
                recordTransaction_1 = (_4.sent()).recordTransaction;
                return [4 /*yield*/, c.env.DB.prepare("SELECT game_date FROM teams WHERE id = ?").bind(teamId).first().catch(function (e) { logger_1.logger.warn({ module: "game" }, "db op failed", e); return null; })];
            case 12:
                gameDate = (_u = (_t = (_4.sent())) === null || _t === void 0 ? void 0 : _t.game_date) !== null && _u !== void 0 ? _u : new Date().toISOString();
                return [4 /*yield*/, recordTransaction_1(c.env.DB, teamId, "transfer_fee", -body.amount, "P\u0159estup: ".concat(aiData.firstName, " ").concat(aiData.lastName, " z ").concat(aiData.fromTeam), gameDate)];
            case 13:
                _4.sent();
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../generators/residence"); })];
            case 14:
                generateResidence = (_4.sent()).generateResidence;
                return [4 /*yield*/, c.env.DB.prepare("SELECT v.name, v.size, v.district FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?")
                        .bind(teamId).first().catch(function (e) { logger_1.logger.warn({ module: "game" }, "fetch village for AI transfer", e); return null; })];
            case 15:
                teamVillage = _4.sent();
                if (!teamVillage) return [3 /*break*/, 17];
                resRng = (0, rng_1.createRng)((0, rng_1.cryptoSeed)());
                res = generateResidence(resRng, teamVillage.name, teamVillage.size, teamVillage.district);
                return [4 /*yield*/, c.env.DB.prepare("UPDATE players SET residence = ?, commute_km = ? WHERE id = ?")
                        .bind(res.residence, res.commuteKm, playerId).run().catch(function (e) { return logger_1.logger.warn({ module: "game" }, "set residence AI transfer", e); })];
            case 16:
                _4.sent();
                _4.label = 17;
            case 17: return [4 /*yield*/, c.env.DB.prepare("SELECT id FROM seasons WHERE status = 'active' LIMIT 1").first().catch(function (e) { logger_1.logger.warn({ module: "game" }, "fetch season for AI transfer", e); return null; })];
            case 18:
                season = _4.sent();
                return [4 /*yield*/, c.env.DB.prepare("INSERT INTO player_contracts (id, player_id, team_id, season_id, join_type, fee, is_active) VALUES (?, ?, ?, ?, 'transfer', ?, 1)")
                        .bind(crypto.randomUUID(), playerId, teamId, (_v = season === null || season === void 0 ? void 0 : season.id) !== null && _v !== void 0 ? _v : "unknown", body.amount).run().catch(function (e) { return logger_1.logger.warn({ module: "game" }, "AI transfer contract", e); })];
            case 19:
                _4.sent();
                // Mark listing sold
                return [4 /*yield*/, c.env.DB.prepare("UPDATE transfer_listings SET status = 'sold' WHERE id = ?").bind(listingId).run()];
            case 20:
                // Mark listing sold
                _4.sent();
                return [4 /*yield*/, c.env.DB.prepare("SELECT name, league_id FROM teams WHERE id = ?").bind(teamId).first()];
            case 21:
                teamRow = _4.sent();
                if (!teamRow) return [3 /*break*/, 24];
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../transfers/transfer-news"); })];
            case 22:
                createTransferNews = (_4.sent()).createTransferNews;
                return [4 /*yield*/, createTransferNews(c.env.DB, teamRow.league_id, teamId, "transfer_completed", {
                        playerName: "".concat(aiData.firstName, " ").concat(aiData.lastName), playerAge: aiData.age,
                        playerPosition: aiData.position, teamName: teamRow.name, toTeamName: teamRow.name, fromTeamName: (_w = aiData.fromTeam) !== null && _w !== void 0 ? _w : "Neznámý tým",
                        fee: body.amount, isCrossDistrict: true,
                    }).catch(function (e) { return logger_1.logger.warn({ module: "game" }, "AI transfer news", e); })];
            case 23:
                _4.sent();
                _4.label = 24;
            case 24: return [4 /*yield*/, c.env.DB.prepare("SELECT * FROM players WHERE id = ?").bind(playerId).first().catch(function (e) { logger_1.logger.warn({ module: "game" }, "fetch new AI transfer player", e); return null; })];
            case 25:
                newPlayer = _4.sent();
                playerData = newPlayer ? __assign(__assign({}, newPlayer), { skills: JSON.parse((_x = newPlayer.skills) !== null && _x !== void 0 ? _x : "{}"), physical: JSON.parse((_y = newPlayer.physical) !== null && _y !== void 0 ? _y : "{}"), personality: JSON.parse((_z = newPlayer.personality) !== null && _z !== void 0 ? _z : "{}"), lifeContext: JSON.parse((_0 = newPlayer.life_context) !== null && _0 !== void 0 ? _0 : "{}"), avatar: JSON.parse((_1 = newPlayer.avatar) !== null && _1 !== void 0 ? _1 : "{}") }) : null;
                return [2 /*return*/, c.json({ ok: true, autoAccepted: true, playerId: playerId, player: playerData })];
            case 26: return [4 /*yield*/, c.env.DB.prepare("SELECT tl.team_id as seller_team_id, tl.player_id, p.first_name, p.last_name,\n            ts.name as seller_name, tb.name as buyer_name\n     FROM transfer_listings tl\n     LEFT JOIN players p ON tl.player_id = p.id\n     LEFT JOIN teams ts ON tl.team_id = ts.id\n     LEFT JOIN teams tb ON tb.id = ?\n     WHERE tl.id = ?").bind(teamId, listingId).first()
                    .catch(function (e) { logger_1.logger.warn({ module: "game" }, "fetch listing for offer", e); return null; })];
            case 27:
                listingInfo = _4.sent();
                if (!listingInfo || !listingInfo.player_id) {
                    return [2 /*return*/, c.json({ error: "Inzerát nenalezen nebo nemá hráče" }, 404)];
                }
                if (listingInfo.seller_team_id === teamId) {
                    return [2 /*return*/, c.json({ error: "Nemůžeš nabízet na vlastního hráče" }, 400)];
                }
                return [4 /*yield*/, c.env.DB.prepare("SELECT id FROM transfer_offers WHERE player_id = ? AND from_team_id = ? AND status IN ('pending','countered') LIMIT 1").bind(listingInfo.player_id, teamId).first().catch(function (e) { logger_1.logger.warn({ module: "game" }, "check duplicate offer from market", e); return null; })];
            case 28:
                existing = _4.sent();
                if (existing) {
                    return [2 /*return*/, c.json({ ok: true, offerId: existing.id, alreadyExists: true })];
                }
                expiresAt = new Date();
                expiresAt.setDate(expiresAt.getDate() + 7);
                offerId = crypto.randomUUID();
                return [4 /*yield*/, c.env.DB.prepare("INSERT INTO transfer_offers (id, player_id, from_team_id, to_team_id, offer_amount, expires_at, offer_type, last_action_by) VALUES (?, ?, ?, ?, ?, ?, 'transfer', ?)").bind(offerId, listingInfo.player_id, teamId, listingInfo.seller_team_id, body.amount, expiresAt.toISOString(), teamId).run()];
            case 29:
                _4.sent();
                return [4 /*yield*/, c.env.DB.prepare("INSERT INTO transfer_offer_events (id, offer_id, team_id, event_type, amount) VALUES (?, ?, ?, 'offer', ?)").bind(crypto.randomUUID(), offerId, teamId, body.amount).run()
                        .catch(function (e) { return logger_1.logger.warn({ module: "game" }, "insert market->offer event", e); })];
            case 30:
                _4.sent();
                pName = listingInfo.first_name ? "".concat(listingInfo.first_name, " ").concat(listingInfo.last_name) : "hráče";
                return [4 /*yield*/, sendPhoneSMS(c.env.DB, listingInfo.seller_team_id, "Sportovní ředitel", "Sportovní ředitel", "\uD83D\uDCB0 ".concat((_2 = listingInfo.buyer_name) !== null && _2 !== void 0 ? _2 : "Klub", " nab\u00EDz\u00ED ").concat(body.amount.toLocaleString("cs"), " K\u010D za ").concat(pName, " z tv\u00E9 inzerce.")).catch(function (e) { return logger_1.logger.warn({ module: "game" }, "market->offer SMS", e); })];
            case 31:
                _4.sent();
                _4.label = 32;
            case 32:
                _4.trys.push([32, 35, , 36]);
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../community/notifications"); })];
            case 33:
                createNotification = (_4.sent()).createNotification;
                pushEnv = { VAPID_PUBLIC_KEY: c.env.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: c.env.VAPID_PRIVATE_KEY, VAPID_SUBJECT: c.env.VAPID_SUBJECT, DB: c.env.DB };
                return [4 /*yield*/, createNotification(c.env.DB, listingInfo.seller_team_id, "transfer", "\uD83D\uDCB0 Nov\u00E1 nab\u00EDdka za ".concat(pName), "".concat((_3 = listingInfo.buyer_name) !== null && _3 !== void 0 ? _3 : "Klub", " nab\u00EDz\u00ED ").concat(body.amount.toLocaleString("cs-CZ"), " K\u010D."), "/dashboard/transfers/offer/".concat(offerId), pushEnv)];
            case 34:
                _4.sent();
                return [3 /*break*/, 36];
            case 35:
                e_18 = _4.sent();
                logger_1.logger.warn({ module: "game" }, "market->offer notification", e_18);
                return [3 /*break*/, 36];
            case 36: return [2 /*return*/, c.json({ ok: true, offerId: offerId })];
        }
    });
}); });
// Accept bid — seller prijima initial bid, nebo buyer prijima counter
gameRouter.post("/teams/:teamId/bids/:bidId/accept", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, bidId, bid, buyerTeamId, sellerTeamId, playerId, amount, buyer, seller, player, gameDate, playerName, bidDeductResult, season, createTransferNews, smsRole, createNotification, pushEnv, e_19;
    var _a, _b, _c, _d, _e, _f, _g;
    return __generator(this, function (_h) {
        switch (_h.label) {
            case 0:
                teamId = c.req.param("teamId");
                bidId = c.req.param("bidId");
                return [4 /*yield*/, c.env.DB.prepare("SELECT tb.*, tl.player_id, tl.team_id as seller_team_id\n     FROM transfer_bids tb\n     JOIN transfer_listings tl ON tb.listing_id = tl.id\n     JOIN players p ON tl.player_id = p.id\n     WHERE tb.id = ? AND tb.status IN ('pending','countered') AND p.team_id = tl.team_id\n       AND (tb.team_id = ? OR tl.team_id = ?)\n       AND (tb.last_action_by IS NULL OR tb.last_action_by != ?)").bind(bidId, teamId, teamId, teamId).first()];
            case 1:
                bid = _h.sent();
                if (!bid)
                    return [2 /*return*/, c.json({ error: "Nabídka nenalezena, hráč už není v inzerci, nebo nejsi na tahu" }, 404)];
                buyerTeamId = bid.team_id;
                sellerTeamId = bid.seller_team_id;
                if (sellerTeamId !== teamId && buyerTeamId !== teamId) {
                    return [2 /*return*/, c.json({ error: "Nemáš přístup k této nabídce" }, 403)];
                }
                playerId = bid.player_id;
                amount = (bid.counter_amount != null ? bid.counter_amount : bid.amount);
                return [4 /*yield*/, c.env.DB.prepare("SELECT budget, name, game_date FROM teams WHERE id = ?").bind(buyerTeamId).first()];
            case 2:
                buyer = _h.sent();
                if (!buyer)
                    return [2 /*return*/, c.json({ error: "Kupující nenalezen" }, 400)];
                return [4 /*yield*/, c.env.DB.prepare("SELECT name, league_id, budget FROM teams WHERE id = ?").bind(sellerTeamId).first()];
            case 3:
                seller = _h.sent();
                return [4 /*yield*/, c.env.DB.prepare("SELECT first_name, last_name, age, position FROM players WHERE id = ?").bind(playerId).first()];
            case 4:
                player = _h.sent();
                gameDate = (_a = buyer.game_date) !== null && _a !== void 0 ? _a : new Date().toISOString();
                playerName = "".concat(player === null || player === void 0 ? void 0 : player.first_name, " ").concat(player === null || player === void 0 ? void 0 : player.last_name);
                return [4 /*yield*/, c.env.DB.prepare("UPDATE teams SET budget = budget - ? WHERE id = ? AND budget >= ?").bind(amount, buyerTeamId, amount).run()];
            case 5:
                bidDeductResult = _h.sent();
                if (bidDeductResult.meta.changes === 0) {
                    return [2 /*return*/, c.json({ error: "Kupující nemá dostatek prostředků" }, 400)];
                }
                return [4 /*yield*/, c.env.DB.prepare("SELECT id FROM seasons WHERE status = 'active' LIMIT 1")
                        .first().catch(function (e) { logger_1.logger.warn({ module: "game" }, "fetch season for transfer contract", e); return null; })];
            case 6:
                season = _h.sent();
                return [4 /*yield*/, c.env.DB.batch([
                        c.env.DB.prepare("UPDATE teams SET budget = budget + ? WHERE id = ?").bind(amount, sellerTeamId),
                        c.env.DB.prepare("UPDATE players SET team_id = ? WHERE id = ? AND team_id = ?").bind(buyerTeamId, playerId, sellerTeamId),
                        c.env.DB.prepare("UPDATE transfer_listings SET status = 'sold' WHERE id = ?").bind(bid.listing_id),
                        c.env.DB.prepare("UPDATE transfer_bids SET status = 'accepted' WHERE id = ?").bind(bidId),
                    ])];
            case 7:
                _h.sent();
                return [4 /*yield*/, c.env.DB.prepare("UPDATE transfer_bids SET status = 'rejected' WHERE listing_id = ? AND id != ? AND status IN ('pending','countered')")
                        .bind(bid.listing_id, bidId).run().catch(function (e) { return logger_1.logger.warn({ module: "game" }, "reject other bids on accept", e); })];
            case 8:
                _h.sent();
                // Transaction log (budget již upraven výše)
                return [4 /*yield*/, c.env.DB.batch([
                        c.env.DB.prepare("INSERT INTO transactions (id, team_id, type, amount, balance_after, description, game_date) VALUES (?, ?, 'transfer_fee', ?, ?, ?, ?)")
                            .bind(crypto.randomUUID(), buyerTeamId, -amount, buyer.budget - amount, "P\u0159estup: ".concat(playerName), gameDate),
                        c.env.DB.prepare("INSERT INTO transactions (id, team_id, type, amount, balance_after, description, game_date) VALUES (?, ?, 'transfer_income', ?, ?, ?, ?)")
                            .bind(crypto.randomUUID(), sellerTeamId, amount, ((_b = seller === null || seller === void 0 ? void 0 : seller.budget) !== null && _b !== void 0 ? _b : 0) + amount, "Prodej: ".concat(playerName), gameDate),
                    ]).catch(function (e) { return logger_1.logger.warn({ module: "game" }, "log bid-accept transactions", e); })];
            case 9:
                // Transaction log (budget již upraven výše)
                _h.sent();
                return [4 /*yield*/, onPlayerTransferred(c.env.DB, playerId, buyerTeamId)];
            case 10:
                _h.sent();
                return [4 /*yield*/, c.env.DB.prepare("UPDATE player_contracts SET leave_type = 'transfer', is_active = 0, left_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE player_id = ? AND team_id = ? AND is_active = 1")
                        .bind(playerId, sellerTeamId).run().catch(function (e) { return logger_1.logger.warn({ module: "game" }, "deactivate contract on transfer", e); })];
            case 11:
                _h.sent();
                return [4 /*yield*/, c.env.DB.prepare("INSERT INTO player_contracts (id, player_id, team_id, season_id, join_type, fee, is_active) VALUES (?, ?, ?, ?, 'transfer', ?, 1)")
                        .bind(crypto.randomUUID(), playerId, buyerTeamId, (_c = season === null || season === void 0 ? void 0 : season.id) !== null && _c !== void 0 ? _c : "unknown", amount).run().catch(function (e) { return logger_1.logger.warn({ module: "game" }, "insert transfer contract", e); })];
            case 12:
                _h.sent();
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../transfers/transfer-news"); })];
            case 13:
                createTransferNews = (_h.sent()).createTransferNews;
                return [4 /*yield*/, createTransferNews(c.env.DB, (_d = seller === null || seller === void 0 ? void 0 : seller.league_id) !== null && _d !== void 0 ? _d : "", null, "transfer_completed", {
                        playerName: "".concat(player === null || player === void 0 ? void 0 : player.first_name, " ").concat(player === null || player === void 0 ? void 0 : player.last_name), playerAge: player === null || player === void 0 ? void 0 : player.age,
                        playerPosition: player === null || player === void 0 ? void 0 : player.position, teamName: (_e = seller === null || seller === void 0 ? void 0 : seller.name) !== null && _e !== void 0 ? _e : "",
                        fromTeamName: seller === null || seller === void 0 ? void 0 : seller.name, toTeamName: buyer.name, fee: amount,
                    }).catch(function (e) { return logger_1.logger.warn({ module: "game" }, "create transfer completed news", e); })];
            case 14:
                _h.sent();
                smsRole = "Sportovní ředitel";
                return [4 /*yield*/, sendPhoneSMS(c.env.DB, buyerTeamId, smsRole, smsRole, "\uD83E\uDD1D P\u0159estup potvrzen! ".concat(playerName, " p\u0159ich\u00E1z\u00ED z ").concat((_f = seller === null || seller === void 0 ? void 0 : seller.name) !== null && _f !== void 0 ? _f : "neznámého klubu", " za ").concat(amount.toLocaleString("cs"), " K\u010D.")).catch(function (e) { return logger_1.logger.warn({ module: "game" }, "bid accept SMS buyer", e); })];
            case 15:
                _h.sent();
                return [4 /*yield*/, sendPhoneSMS(c.env.DB, sellerTeamId, smsRole, smsRole, "\uD83D\uDCE4 Prodej potvrzen. ".concat(playerName, " odch\u00E1z\u00ED do ").concat(buyer.name, " za ").concat(amount.toLocaleString("cs"), " K\u010D.")).catch(function (e) { return logger_1.logger.warn({ module: "game" }, "bid accept SMS seller", e); })];
            case 16:
                _h.sent();
                _h.label = 17;
            case 17:
                _h.trys.push([17, 21, , 22]);
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../community/notifications"); })];
            case 18:
                createNotification = (_h.sent()).createNotification;
                pushEnv = { VAPID_PUBLIC_KEY: c.env.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: c.env.VAPID_PRIVATE_KEY, VAPID_SUBJECT: c.env.VAPID_SUBJECT, DB: c.env.DB };
                return [4 /*yield*/, createNotification(c.env.DB, buyerTeamId, "transfer", "\u2705 P\u0159estup ".concat(playerName, " dokon\u010Den"), "Koupili jste od ".concat((_g = seller === null || seller === void 0 ? void 0 : seller.name) !== null && _g !== void 0 ? _g : "prodávajícího", " za ").concat(amount.toLocaleString("cs-CZ"), " K\u010D."), "/dashboard/transfers", pushEnv)];
            case 19:
                _h.sent();
                return [4 /*yield*/, createNotification(c.env.DB, sellerTeamId, "transfer", "\u2705 Prodej ".concat(playerName, " dokon\u010Den"), "".concat(buyer.name, " zaplatil ").concat(amount.toLocaleString("cs-CZ"), " K\u010D."), "/dashboard/transfers", pushEnv)];
            case 20:
                _h.sent();
                return [3 /*break*/, 22];
            case 21:
                e_19 = _h.sent();
                logger_1.logger.warn({ module: "game" }, "bid accept notifications", e_19);
                return [3 /*break*/, 22];
            case 22: return [2 /*return*/, c.json({ ok: true })];
        }
    });
}); });
// Reject bid — seller odmita initial bid, nebo buyer odmita counter
gameRouter.post("/teams/:teamId/bids/:bidId/reject", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, bidId, bidInfo, canReject, pName, isSellerRejecting, otherTeamId, rejecterName, createNotification, pushEnv, e_20;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                teamId = c.req.param("teamId");
                bidId = c.req.param("bidId");
                return [4 /*yield*/, c.env.DB.prepare("SELECT tb.team_id as buyer_team_id, tb.amount, tb.counter_amount, tb.last_action_by, tb.status,\n            tl.player_id, tl.team_id as seller_team_id,\n            p.first_name, p.last_name,\n            ts.name as seller_name, tbuyer.name as buyer_name\n     FROM transfer_bids tb JOIN transfer_listings tl ON tb.listing_id = tl.id\n     LEFT JOIN players p ON tl.player_id = p.id\n     LEFT JOIN teams ts ON tl.team_id = ts.id\n     LEFT JOIN teams tbuyer ON tb.team_id = tbuyer.id\n     WHERE tb.id = ? AND (tb.team_id = ? OR tl.team_id = ?) AND tb.status IN ('pending','countered')").bind(bidId, teamId, teamId).first()
                        .catch(function (e) { logger_1.logger.warn({ module: "game" }, "fetch bid for reject notif", e); return null; })];
            case 1:
                bidInfo = _a.sent();
                if (!bidInfo)
                    return [2 /*return*/, c.json({ error: "Nabídka nenalezena" }, 404)];
                canReject = bidInfo.last_action_by != null
                    ? bidInfo.last_action_by !== teamId
                    : bidInfo.seller_team_id === teamId;
                if (!canReject)
                    return [2 /*return*/, c.json({ error: "Nejsi na tahu" }, 409)];
                return [4 /*yield*/, c.env.DB.prepare("UPDATE transfer_bids SET status = 'rejected' WHERE id = ?").bind(bidId).run()];
            case 2:
                _a.sent();
                pName = bidInfo.first_name ? "".concat(bidInfo.first_name, " ").concat(bidInfo.last_name) : "hráče";
                isSellerRejecting = teamId === bidInfo.seller_team_id;
                otherTeamId = isSellerRejecting ? bidInfo.buyer_team_id : bidInfo.seller_team_id;
                rejecterName = isSellerRejecting ? bidInfo.seller_name : bidInfo.buyer_name;
                return [4 /*yield*/, sendPhoneSMS(c.env.DB, otherTeamId, "Sportovní ředitel", "Sportovní ředitel", "\u274C ".concat(rejecterName !== null && rejecterName !== void 0 ? rejecterName : "Klub", " odm\u00EDtl ").concat(isSellerRejecting ? "nabídku" : "protinabídku", " za ").concat(pName, ".")).catch(function (e) { return logger_1.logger.warn({ module: "game" }, "bid reject SMS", e); })];
            case 3:
                _a.sent();
                _a.label = 4;
            case 4:
                _a.trys.push([4, 7, , 8]);
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../community/notifications"); })];
            case 5:
                createNotification = (_a.sent()).createNotification;
                pushEnv = { VAPID_PUBLIC_KEY: c.env.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: c.env.VAPID_PRIVATE_KEY, VAPID_SUBJECT: c.env.VAPID_SUBJECT, DB: c.env.DB };
                return [4 /*yield*/, createNotification(c.env.DB, otherTeamId, "transfer", "\u274C Nab\u00EDdka za ".concat(pName, " zam\u00EDtnuta"), "".concat(rejecterName !== null && rejecterName !== void 0 ? rejecterName : "Klub", " odm\u00EDtl jedn\u00E1n\u00ED."), "/dashboard/transfers", pushEnv)];
            case 6:
                _a.sent();
                return [3 /*break*/, 8];
            case 7:
                e_20 = _a.sent();
                logger_1.logger.warn({ module: "game" }, "bid reject notification", e_20);
                return [3 /*break*/, 8];
            case 8: return [2 /*return*/, c.json({ ok: true })];
        }
    });
}); });
// Counter bid — seller posle protinabidku, buyer ji muze prijmout/odmitnout/counter
gameRouter.post("/teams/:teamId/bids/:bidId/counter", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, bidId, body, bid, canCounter, buyer, otherTeamId, counterTeamName, pName, createNotification, pushEnv, e_21;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                teamId = c.req.param("teamId");
                bidId = c.req.param("bidId");
                return [4 /*yield*/, c.req.json()];
            case 1:
                body = _b.sent();
                if (!body.amount || body.amount <= 0 || !Number.isInteger(body.amount)) {
                    return [2 /*return*/, c.json({ error: "Protinabídka musí být kladné celé číslo" }, 400)];
                }
                return [4 /*yield*/, c.env.DB.prepare("SELECT tb.*, tl.team_id as seller_team_id, tl.player_id, p.first_name, p.last_name,\n            tbuyer.name as buyer_name, ts.name as seller_name\n     FROM transfer_bids tb JOIN transfer_listings tl ON tb.listing_id = tl.id\n     LEFT JOIN players p ON tl.player_id = p.id\n     LEFT JOIN teams tbuyer ON tb.team_id = tbuyer.id\n     LEFT JOIN teams ts ON tl.team_id = ts.id\n     WHERE tb.id = ? AND (tb.team_id = ? OR tl.team_id = ?) AND tb.status IN ('pending','countered')").bind(bidId, teamId, teamId).first()];
            case 2:
                bid = _b.sent();
                if (!bid)
                    return [2 /*return*/, c.json({ error: "Nabídka nenalezena" }, 404)];
                canCounter = bid.last_action_by != null
                    ? bid.last_action_by !== teamId
                    : bid.seller_team_id === teamId;
                if (!canCounter)
                    return [2 /*return*/, c.json({ error: "Nejsi na tahu" }, 409)];
                if (!(bid.team_id === teamId)) return [3 /*break*/, 4];
                return [4 /*yield*/, c.env.DB.prepare("SELECT budget FROM teams WHERE id = ?").bind(teamId).first()];
            case 3:
                buyer = _b.sent();
                if (!buyer || buyer.budget < body.amount) {
                    return [2 /*return*/, c.json({ error: "Nedostatek pen\u011Bz. M\u00E1te ".concat(((_a = buyer === null || buyer === void 0 ? void 0 : buyer.budget) !== null && _a !== void 0 ? _a : 0).toLocaleString("cs"), " K\u010D, nab\u00EDz\u00EDte ").concat(body.amount.toLocaleString("cs"), " K\u010D.") }, 400)];
                }
                _b.label = 4;
            case 4: return [4 /*yield*/, c.env.DB.prepare("UPDATE transfer_bids SET status = 'countered', counter_amount = ?, last_action_by = ? WHERE id = ?").bind(body.amount, teamId, bidId).run()];
            case 5:
                _b.sent();
                otherTeamId = teamId === bid.seller_team_id ? bid.team_id : bid.seller_team_id;
                counterTeamName = teamId === bid.seller_team_id ? bid.seller_name : bid.buyer_name;
                pName = "".concat(bid.first_name, " ").concat(bid.last_name);
                return [4 /*yield*/, sendPhoneSMS(c.env.DB, otherTeamId, "Sportovní ředitel", "Sportovní ředitel", "\uD83D\uDD04 ".concat(counterTeamName !== null && counterTeamName !== void 0 ? counterTeamName : "Klub", " poslal protinab\u00EDdku ").concat(body.amount.toLocaleString("cs"), " K\u010D za ").concat(pName, ".")).catch(function (e) { return logger_1.logger.warn({ module: "game" }, "bid counter SMS", e); })];
            case 6:
                _b.sent();
                _b.label = 7;
            case 7:
                _b.trys.push([7, 10, , 11]);
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../community/notifications"); })];
            case 8:
                createNotification = (_b.sent()).createNotification;
                pushEnv = { VAPID_PUBLIC_KEY: c.env.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: c.env.VAPID_PRIVATE_KEY, VAPID_SUBJECT: c.env.VAPID_SUBJECT, DB: c.env.DB };
                return [4 /*yield*/, createNotification(c.env.DB, otherTeamId, "transfer", "\uD83D\uDD04 Protinab\u00EDdka za ".concat(pName), "".concat(counterTeamName !== null && counterTeamName !== void 0 ? counterTeamName : "Klub", " poslal protinab\u00EDdku ").concat(body.amount.toLocaleString("cs-CZ"), " K\u010D."), "/dashboard/transfers", pushEnv)];
            case 9:
                _b.sent();
                return [3 /*break*/, 11];
            case 10:
                e_21 = _b.sent();
                logger_1.logger.warn({ module: "game" }, "bid counter notification", e_21);
                return [3 /*break*/, 11];
            case 11: return [2 /*return*/, c.json({ ok: true })];
        }
    });
}); });
// Withdraw bid — buyer stahne svou nabidku
gameRouter.delete("/teams/:teamId/bids/:bidId", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, bidId, result, bidInfo, pName, createNotification, pushEnv, e_22;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                teamId = c.req.param("teamId");
                bidId = c.req.param("bidId");
                return [4 /*yield*/, c.env.DB.prepare("UPDATE transfer_bids SET status = 'withdrawn' WHERE id = ? AND team_id = ? AND status IN ('pending','countered')").bind(bidId, teamId).run()];
            case 1:
                result = _b.sent();
                if (result.meta.changes === 0) {
                    return [2 /*return*/, c.json({ error: "Nabídku nelze stáhnout (není tvoje nebo už je vyřešená)" }, 409)];
                }
                return [4 /*yield*/, c.env.DB.prepare("SELECT tl.team_id as seller_team_id, tl.player_id, p.first_name, p.last_name, tbuyer.name as buyer_name\n     FROM transfer_bids tb JOIN transfer_listings tl ON tb.listing_id = tl.id\n     LEFT JOIN players p ON tl.player_id = p.id\n     LEFT JOIN teams tbuyer ON tb.team_id = tbuyer.id\n     WHERE tb.id = ?").bind(bidId).first()
                        .catch(function (e) { logger_1.logger.warn({ module: "game" }, "fetch bid for withdraw notif", e); return null; })];
            case 2:
                bidInfo = _b.sent();
                if (!bidInfo) return [3 /*break*/, 7];
                pName = bidInfo.first_name ? "".concat(bidInfo.first_name, " ").concat(bidInfo.last_name) : "hráče";
                _b.label = 3;
            case 3:
                _b.trys.push([3, 6, , 7]);
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../community/notifications"); })];
            case 4:
                createNotification = (_b.sent()).createNotification;
                pushEnv = { VAPID_PUBLIC_KEY: c.env.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: c.env.VAPID_PRIVATE_KEY, VAPID_SUBJECT: c.env.VAPID_SUBJECT, DB: c.env.DB };
                return [4 /*yield*/, createNotification(c.env.DB, bidInfo.seller_team_id, "transfer", "\u21A9\uFE0F Nab\u00EDdka za ".concat(pName, " sta\u017Eena"), "".concat((_a = bidInfo.buyer_name) !== null && _a !== void 0 ? _a : "Klub", " st\u00E1hl svou nab\u00EDdku."), "/dashboard/transfers", pushEnv)];
            case 5:
                _b.sent();
                return [3 /*break*/, 7];
            case 6:
                e_22 = _b.sent();
                logger_1.logger.warn({ module: "game" }, "bid withdraw notification", e_22);
                return [3 /*break*/, 7];
            case 7: return [2 /*return*/, c.json({ ok: true })];
        }
    });
}); });
// Transfer offers between teams (transfer or loan)
gameRouter.post("/teams/:teamId/offers", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, body, targetSquad, player, isBuyout, targetOwnerId, ownerTeam, buyerU21, offerType, loanDuration, team, offeredPlayerId, swap, injury, existing, recentClosed, daysLeft, computeInterestForOffer, interest, expiresAt, id, buyerTeam, pName, createNotification, pushEnv, offerLabel, e_23;
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
    return __generator(this, function (_o) {
        switch (_o.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, c.req.json()];
            case 1:
                body = _o.sent();
                targetSquad = body.targetSquad === "u21" ? "u21" : "senior";
                return [4 /*yield*/, c.env.DB.prepare("SELECT p.*, t.user_id FROM players p JOIN teams t ON p.team_id = t.id WHERE p.id = ?").bind(body.playerId).first()];
            case 2:
                player = _o.sent();
                if (!player)
                    return [2 /*return*/, c.json({ error: "Hráč nenalezen" }, 404)];
                isBuyout = player.team_id === teamId && !!player.loan_from_team_id;
                targetOwnerId = player.team_id;
                if (isBuyout) {
                    targetOwnerId = player.loan_from_team_id;
                    if (body.offerType === "loan")
                        return [2 /*return*/, c.json({ error: "Na hostujícího hráče lze poslat jen trvalý odkup" }, 400)];
                }
                else {
                    if (player.team_id === teamId)
                        return [2 /*return*/, c.json({ error: "Nemůžeš nabídnout na vlastního hráče" }, 400)];
                    if (player.loan_from_team_id)
                        return [2 /*return*/, c.json({ error: "Hráč je již na hostování" }, 400)];
                }
                return [4 /*yield*/, c.env.DB.prepare("SELECT user_id FROM teams WHERE id = ?").bind(targetOwnerId).first()];
            case 3:
                ownerTeam = _o.sent();
                if (!ownerTeam || ownerTeam.user_id === "ai")
                    return [2 /*return*/, c.json({ error: "Nabídky lze posílat jen lidským týmům" }, 400)];
                if (!(targetSquad === "u21")) return [3 /*break*/, 5];
                if (player.age > 21)
                    return [2 /*return*/, c.json({ error: "Hráč starší 21 let nelze poslat do U21" }, 400)];
                if (player.next_match_return === 1)
                    return [2 /*return*/, c.json({ error: "Hráč právě čeká na návrat z U21, nelze nabízet" }, 400)];
                return [4 /*yield*/, c.env.DB.prepare("SELECT id FROM teams WHERE parent_team_id = ? AND team_type = 'u21'").bind(teamId).first()];
            case 4:
                buyerU21 = _o.sent();
                if (!buyerU21)
                    return [2 /*return*/, c.json({ error: "Tvůj klub nemá U21 tým" }, 400)];
                _o.label = 5;
            case 5:
                offerType = (_a = body.offerType) !== null && _a !== void 0 ? _a : "transfer";
                loanDuration = offerType === "loan" ? ((_b = body.loanDuration) !== null && _b !== void 0 ? _b : 30) : null;
                // Validace částky: loan povoluje 0 (bezplatné hostování), transfer vyžaduje kladné celé číslo
                if (!Number.isInteger(body.amount) || body.amount < 0 || (offerType !== "loan" && body.amount === 0)) {
                    return [2 /*return*/, c.json({ error: "Nabídka musí být kladné celé číslo (0 povolena jen pro hostování)" }, 400)];
                }
                if (!(body.amount > 0)) return [3 /*break*/, 7];
                return [4 /*yield*/, c.env.DB.prepare("SELECT budget FROM teams WHERE id = ?").bind(teamId).first()];
            case 6:
                team = _o.sent();
                if (!team || team.budget < body.amount)
                    return [2 /*return*/, c.json({ error: "Nedostatek pen\u011Bz. M\u00E1te ".concat((_d = (_c = team === null || team === void 0 ? void 0 : team.budget) === null || _c === void 0 ? void 0 : _c.toLocaleString("cs")) !== null && _d !== void 0 ? _d : 0, " K\u010D, nab\u00EDz\u00EDte ").concat(body.amount.toLocaleString("cs"), " K\u010D.") }, 400)];
                _o.label = 7;
            case 7:
                if (offerType === "loan" && (!loanDuration || loanDuration < 7 || loanDuration > 180)) {
                    return [2 /*return*/, c.json({ error: "Délka hostování musí být 7–180 dní" }, 400)];
                }
                offeredPlayerId = (_e = body.offeredPlayerId) !== null && _e !== void 0 ? _e : null;
                if (!offeredPlayerId) return [3 /*break*/, 10];
                if (offerType === "loan")
                    return [2 /*return*/, c.json({ error: "Hráče na výměnu lze přidat jen u trvalého přestupu" }, 400)];
                if (offeredPlayerId === body.playerId)
                    return [2 /*return*/, c.json({ error: "Nelze nabídnout stejného hráče" }, 400)];
                return [4 /*yield*/, c.env.DB.prepare("SELECT team_id, loan_from_team_id FROM players WHERE id = ?").bind(offeredPlayerId).first()];
            case 8:
                swap = _o.sent();
                if (!swap)
                    return [2 /*return*/, c.json({ error: "Hráč na výměnu nenalezen" }, 404)];
                if (swap.team_id !== teamId)
                    return [2 /*return*/, c.json({ error: "Hráč na výměnu není ve tvém klubu" }, 400)];
                if (swap.loan_from_team_id)
                    return [2 /*return*/, c.json({ error: "Hráč na výměnu je na hostování, nelze vyměnit" }, 400)];
                return [4 /*yield*/, c.env.DB.prepare("SELECT 1 FROM injuries WHERE player_id = ? AND days_remaining > 0 LIMIT 1").bind(offeredPlayerId).first().catch(function (e) { logger_1.logger.warn({ module: "game" }, "check swap player injury", e); return null; })];
            case 9:
                injury = _o.sent();
                if (injury)
                    return [2 /*return*/, c.json({ error: "Zraněného hráče nelze nabídnout na výměnu" }, 400)];
                _o.label = 10;
            case 10: return [4 /*yield*/, c.env.DB.prepare("SELECT id FROM transfer_offers WHERE player_id = ? AND from_team_id = ? AND status IN ('pending','countered') LIMIT 1").bind(body.playerId, teamId).first().catch(function (e) { logger_1.logger.warn({ module: "game" }, "check duplicate offer", e); return null; })];
            case 11:
                existing = _o.sent();
                if (existing)
                    return [2 /*return*/, c.json({ error: "Již máte aktivní nabídku na tohoto hráče", offerId: existing.id }, 409)];
                return [4 /*yield*/, c.env.DB.prepare("SELECT resolved_at FROM transfer_offers\n     WHERE player_id = ? AND from_team_id = ? AND status IN ('rejected','expired','withdrawn')\n       AND resolved_at > datetime('now', '-10 days')\n     ORDER BY resolved_at DESC LIMIT 1").bind(body.playerId, teamId).first()
                        .catch(function (e) { logger_1.logger.warn({ module: "game" }, "check offer cooldown", e); return null; })];
            case 12:
                recentClosed = _o.sent();
                if (recentClosed) {
                    daysLeft = Math.max(1, 10 - Math.floor((Date.now() - new Date(recentClosed.resolved_at).getTime()) / 86400000));
                    return [2 /*return*/, c.json({ error: "Na tohoto hr\u00E1\u010De jsi ned\u00E1vno nab\u00EDzel \u2014 po\u010Dkej je\u0161t\u011B ".concat(daysLeft, " ").concat(daysLeft === 1 ? "den" : daysLeft < 5 ? "dny" : "dní") }, 429)];
                }
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../transfers/player-interest"); })];
            case 13:
                computeInterestForOffer = (_o.sent()).computeInterestForOffer;
                return [4 /*yield*/, computeInterestForOffer(c.env.DB, body.playerId, { fromTeamId: teamId, offerAmount: body.amount })
                        .catch(function (e) { logger_1.logger.warn({ module: "game" }, "compute player interest", e); return null; })];
            case 14:
                interest = _o.sent();
                expiresAt = new Date();
                expiresAt.setDate(expiresAt.getDate() + 7);
                id = crypto.randomUUID();
                return [4 /*yield*/, c.env.DB.prepare("INSERT INTO transfer_offers (id, player_id, from_team_id, to_team_id, offer_amount, message, expires_at, offer_type, loan_duration, last_action_by, offered_player_id, target_squad, player_interest) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
                        .bind(id, body.playerId, teamId, targetOwnerId, body.amount, (_f = body.message) !== null && _f !== void 0 ? _f : null, expiresAt.toISOString(), offerType, loanDuration, teamId, offeredPlayerId, targetSquad, (_g = interest === null || interest === void 0 ? void 0 : interest.level) !== null && _g !== void 0 ? _g : null).run()];
            case 15:
                _o.sent();
                // Log initial offer event
                return [4 /*yield*/, c.env.DB.prepare("INSERT INTO transfer_offer_events (id, offer_id, team_id, event_type, amount, message) VALUES (?, ?, ?, 'offer', ?, ?)")
                        .bind(crypto.randomUUID(), id, teamId, body.amount, (_h = body.message) !== null && _h !== void 0 ? _h : null).run()
                        .catch(function (e) { return logger_1.logger.warn({ module: "game" }, "insert offer event", e); })];
            case 16:
                // Log initial offer event
                _o.sent();
                return [4 /*yield*/, c.env.DB.prepare("SELECT name FROM teams WHERE id = ?").bind(teamId).first().catch(function (e) { logger_1.logger.warn({ module: "game" }, "db op failed", e); return null; })];
            case 17:
                buyerTeam = _o.sent();
                pName = "".concat(player.first_name, " ").concat(player.last_name);
                if (!isBuyout) return [3 /*break*/, 19];
                return [4 /*yield*/, sendPhoneSMS(c.env.DB, targetOwnerId, "Sportovní ředitel", "Sportovní ředitel", "\uD83D\uDCE9 ".concat((_j = buyerTeam === null || buyerTeam === void 0 ? void 0 : buyerTeam.name) !== null && _j !== void 0 ? _j : "Neznámý klub", " chce odkoupit ").concat(pName, " (aktu\u00E1ln\u011B u nich na hostov\u00E1n\u00ED) za ").concat(body.amount.toLocaleString("cs"), " K\u010D.")).catch(function (e) { return logger_1.logger.warn({ module: "game" }, "db op failed", e); })];
            case 18:
                _o.sent();
                return [3 /*break*/, 23];
            case 19:
                if (!(offerType === "loan")) return [3 /*break*/, 21];
                return [4 /*yield*/, sendPhoneSMS(c.env.DB, targetOwnerId, "Sportovní ředitel", "Sportovní ředitel", "\uD83D\uDCE9 ".concat((_k = buyerTeam === null || buyerTeam === void 0 ? void 0 : buyerTeam.name) !== null && _k !== void 0 ? _k : "Neznámý klub", " m\u00E1 z\u00E1jem o hostov\u00E1n\u00ED ").concat(pName, ".").concat(body.amount > 0 ? " Nab\u00EDz\u00ED poplatek ".concat(body.amount.toLocaleString("cs"), " K\u010D.") : "", " Pod\u00EDvejte se na to v p\u0159estupech.")).catch(function (e) { return logger_1.logger.warn({ module: "game" }, "db op failed", e); })];
            case 20:
                _o.sent();
                return [3 /*break*/, 23];
            case 21: return [4 /*yield*/, sendPhoneSMS(c.env.DB, targetOwnerId, "Sportovní ředitel", "Sportovní ředitel", "\uD83D\uDCE9 P\u0159i\u0161la nab\u00EDdka na ".concat(pName, " od ").concat((_l = buyerTeam === null || buyerTeam === void 0 ? void 0 : buyerTeam.name) !== null && _l !== void 0 ? _l : "neznámého klubu", " za ").concat(body.amount.toLocaleString("cs"), " K\u010D. Pod\u00EDvejte se na to v p\u0159estupech.")).catch(function (e) { return logger_1.logger.warn({ module: "game" }, "db op failed", e); })];
            case 22:
                _o.sent();
                _o.label = 23;
            case 23:
                _o.trys.push([23, 26, , 27]);
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../community/notifications"); })];
            case 24:
                createNotification = (_o.sent()).createNotification;
                pushEnv = { VAPID_PUBLIC_KEY: c.env.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: c.env.VAPID_PRIVATE_KEY, VAPID_SUBJECT: c.env.VAPID_SUBJECT, DB: c.env.DB };
                offerLabel = offerType === "loan" ? "hostování" : "přestup";
                return [4 /*yield*/, createNotification(c.env.DB, targetOwnerId, "transfer", "\uD83D\uDCB0 Nov\u00E1 nab\u00EDdka za ".concat(pName), "".concat((_m = buyerTeam === null || buyerTeam === void 0 ? void 0 : buyerTeam.name) !== null && _m !== void 0 ? _m : "Neznámý klub", " nab\u00EDz\u00ED ").concat(offerLabel, " za ").concat(body.amount.toLocaleString("cs-CZ"), " K\u010D."), "/dashboard/transfers/offer/".concat(id), pushEnv)];
            case 25:
                _o.sent();
                return [3 /*break*/, 27];
            case 26:
                e_23 = _o.sent();
                logger_1.logger.warn({ module: "game" }, "new offer notification", e_23);
                return [3 /*break*/, 27];
            case 27: return [2 /*return*/, c.json({ ok: true, offerId: id })];
        }
    });
}); });
gameRouter.get("/teams/:teamId/offers", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, virtualNameSql, incoming, myTeam, outgoing, history, loanedOut, loanedIn, addOnTurn, historyWithRole, incomingBids, outgoingBids, addBidOnTurn;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                teamId = c.req.param("teamId");
                virtualNameSql = "CASE WHEN to2.from_team_id = 'virtual_ai' THEN COALESCE(\n       json_extract(to2.virtual_team_data, '$.name'),\n       CASE WHEN json_valid(to2.message) THEN json_extract(to2.message, '$.teamName') END,\n       'Nezn\u00E1m\u00FD klub') ELSE t.name END";
                return [4 /*yield*/, c.env.DB.prepare("SELECT to2.*, p.first_name, p.last_name, p.age, p.position, p.overall_rating, p.avatar as player_avatar, p.skills as player_skills,\n     ".concat(virtualNameSql, " as from_team_name, t.league_id as from_league_id,\n     CASE WHEN to2.from_team_id = 'virtual_ai' THEN 1 ELSE 0 END as is_virtual,\n     op.first_name as offered_first_name, op.last_name as offered_last_name, op.position as offered_position\n     FROM transfer_offers to2 JOIN players p ON to2.player_id = p.id LEFT JOIN teams t ON to2.from_team_id = t.id\n     LEFT JOIN players op ON to2.offered_player_id = op.id\n     WHERE to2.to_team_id = ? AND to2.status IN ('pending','countered') ORDER BY to2.created_at DESC")).bind(teamId).all()];
            case 1:
                incoming = _b.sent();
                return [4 /*yield*/, c.env.DB.prepare("SELECT league_id FROM teams WHERE id = ?").bind(teamId).first()];
            case 2:
                myTeam = _b.sent();
                return [4 /*yield*/, c.env.DB.prepare("SELECT to2.*, p.first_name, p.last_name, p.age, p.position, p.avatar as player_avatar, p.skills as player_skills,\n     t.name as to_team_name, t.league_id as to_league_id,\n     op.first_name as offered_first_name, op.last_name as offered_last_name, op.position as offered_position\n     FROM transfer_offers to2 JOIN players p ON to2.player_id = p.id JOIN teams t ON to2.to_team_id = t.id\n     LEFT JOIN players op ON to2.offered_player_id = op.id\n     WHERE to2.from_team_id = ? AND to2.status IN ('pending','countered') ORDER BY to2.created_at DESC").bind(teamId).all()];
            case 3:
                outgoing = _b.sent();
                return [4 /*yield*/, c.env.DB.prepare("SELECT to2.*, COALESCE(p.first_name, dp.first_name) as first_name, COALESCE(p.last_name, dp.last_name) as last_name,\n     COALESCE(p.age, dp.age) as age, COALESCE(p.position, dp.position) as position,\n     COALESCE(p.overall_rating, dp.overall_rating) as overall_rating, p.avatar as player_avatar,\n     ".concat(virtualNameSql.replace("ELSE t.name END", "ELSE tf.name END"), " as from_team_name, tt.name as to_team_name,\n     tf.league_id as from_league_id, tt.league_id as to_league_id,\n     CASE WHEN to2.from_team_id = 'virtual_ai' THEN 1 ELSE 0 END as is_virtual\n     FROM transfer_offers to2\n     LEFT JOIN players p ON to2.player_id = p.id\n     LEFT JOIN departed_players dp ON to2.player_id = dp.id\n     LEFT JOIN teams tf ON to2.from_team_id = tf.id\n     JOIN teams tt ON to2.to_team_id = tt.id\n     WHERE (to2.from_team_id = ? OR to2.to_team_id = ?)\n       AND to2.status IN ('accepted','rejected','withdrawn','expired')\n     ORDER BY COALESCE(to2.resolved_at, to2.created_at) DESC\n     LIMIT 50")).bind(teamId, teamId).all()];
            case 4:
                history = _b.sent();
                return [4 /*yield*/, c.env.DB.prepare("SELECT p.id, p.first_name, p.last_name, p.position, p.age, p.overall_rating, p.loan_until, t.name as loan_team_name\n     FROM players p JOIN teams t ON p.team_id = t.id WHERE p.loan_from_team_id = ?").bind(teamId).all().catch(function (e) { logger_1.logger.warn({ module: "game" }, "fetch loaned out", e); return { results: [] }; })];
            case 5:
                loanedOut = _b.sent();
                return [4 /*yield*/, c.env.DB.prepare("SELECT p.id, p.first_name, p.last_name, p.position, p.age, p.overall_rating, p.loan_until, t.name as owner_team_name\n     FROM players p JOIN teams t ON p.loan_from_team_id = t.id WHERE p.team_id = ? AND p.loan_from_team_id IS NOT NULL").bind(teamId).all().catch(function (e) { logger_1.logger.warn({ module: "game" }, "fetch loaned in", e); return { results: [] }; })];
            case 6:
                loanedIn = _b.sent();
                addOnTurn = function (rows) {
                    return rows.map(function (r) {
                        var onTurn = r.last_action_by != null
                            ? r.last_action_by !== teamId
                            : r.status === "pending"
                                ? r.to_team_id === teamId
                                : r.from_team_id === teamId;
                        return __assign(__assign({}, r), { on_turn: onTurn });
                    });
                };
                historyWithRole = history.results.map(function (r) { return (__assign(__assign({}, r), { my_role: r.from_team_id === teamId ? "buyer" : "seller" })); });
                return [4 /*yield*/, c.env.DB.prepare("SELECT tb.id, tb.listing_id, tb.amount, tb.counter_amount, tb.last_action_by, tb.status, tb.created_at,\n            tl.player_id, tl.asking_price,\n            p.first_name, p.last_name, p.age, p.position, p.overall_rating, p.avatar as player_avatar,\n            t.name as buyer_team_name\n     FROM transfer_bids tb\n     JOIN transfer_listings tl ON tb.listing_id = tl.id\n     JOIN players p ON tl.player_id = p.id\n     JOIN teams t ON tb.team_id = t.id\n     WHERE tl.team_id = ? AND tb.status IN ('pending','countered') AND tl.status = 'active'\n     ORDER BY tb.created_at DESC").bind(teamId).all().catch(function (e) { logger_1.logger.warn({ module: "game" }, "fetch incoming bids", e); return { results: [] }; })];
            case 7:
                incomingBids = _b.sent();
                return [4 /*yield*/, c.env.DB.prepare("SELECT tb.id, tb.listing_id, tb.amount, tb.counter_amount, tb.last_action_by, tb.status, tb.created_at,\n            tl.player_id, tl.asking_price, tl.team_id as seller_team_id,\n            p.first_name, p.last_name, p.age, p.position, p.overall_rating, p.avatar as player_avatar,\n            t.name as seller_team_name\n     FROM transfer_bids tb\n     JOIN transfer_listings tl ON tb.listing_id = tl.id\n     JOIN players p ON tl.player_id = p.id\n     JOIN teams t ON tl.team_id = t.id\n     WHERE tb.team_id = ? AND tb.status IN ('pending','countered') AND tl.status = 'active'\n     ORDER BY tb.created_at DESC").bind(teamId).all().catch(function (e) { logger_1.logger.warn({ module: "game" }, "fetch outgoing bids", e); return { results: [] }; })];
            case 8:
                outgoingBids = _b.sent();
                addBidOnTurn = function (rows, myRole) {
                    return rows.map(function (r) {
                        var onTurn = r.last_action_by != null
                            ? r.last_action_by !== teamId
                            : myRole === "seller"; // legacy: seller je na tahu pro pending bid
                        return __assign(__assign({}, r), { on_turn: onTurn });
                    });
                };
                return [2 /*return*/, c.json({
                        incoming: addOnTurn(incoming.results),
                        outgoing: addOnTurn(outgoing.results),
                        incomingBids: addBidOnTurn(incomingBids.results, "seller"),
                        outgoingBids: addBidOnTurn(outgoingBids.results, "buyer"),
                        history: historyWithRole,
                        loanedOut: loanedOut.results,
                        loanedIn: loanedIn.results,
                        myLeagueId: (_a = myTeam === null || myTeam === void 0 ? void 0 : myTeam.league_id) !== null && _a !== void 0 ? _a : null,
                    })];
        }
    });
}); });
// Detail jedné nabídky s face-off kontextem (oba trenéři, hráč, timeline eventů)
gameRouter.get("/teams/:teamId/offers/:offerId", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, offerId, offer, role, status, isActive, onTurn, playerRow, player, offeredPlayer, op, teamFields, isVirtualOffer, fromTeamRow, _a, toTeamRow, virtualFromTeam, vd, legacy, vName, teamPublic, fetchManager, _b, fromManager, toManager, events, currentAmount, crossLeague, adminFee, playerInterest, _c, computeInterestForOffer, INTEREST_LABELS, isOfferActive, virtualRating, fresh, lvl, e_24;
    var _d, _e, _f, _g, _h, _j;
    return __generator(this, function (_k) {
        switch (_k.label) {
            case 0:
                teamId = c.req.param("teamId");
                offerId = c.req.param("offerId");
                return [4 /*yield*/, c.env.DB.prepare("SELECT * FROM transfer_offers WHERE id = ? AND (from_team_id = ? OR to_team_id = ?)").bind(offerId, teamId, teamId).first()];
            case 1:
                offer = _k.sent();
                if (!offer)
                    return [2 /*return*/, c.json({ error: "Nabídka nenalezena" }, 404)];
                role = offer.from_team_id === teamId ? "buyer" : "seller";
                status = offer.status;
                isActive = status === "pending" || status === "countered";
                onTurn = isActive && (offer.last_action_by != null
                    ? offer.last_action_by !== teamId
                    : status === "pending" ? offer.to_team_id === teamId : offer.from_team_id === teamId);
                return [4 /*yield*/, c.env.DB.prepare("SELECT * FROM players WHERE id = ?").bind(offer.player_id).first()];
            case 2:
                playerRow = _k.sent();
                player = playerRow ? (0, player_view_1.buildPlayerView)(playerRow, teamId) : null;
                offeredPlayer = null;
                if (!offer.offered_player_id) return [3 /*break*/, 4];
                return [4 /*yield*/, c.env.DB.prepare("SELECT * FROM players WHERE id = ?").bind(offer.offered_player_id).first()];
            case 3:
                op = _k.sent();
                if (op)
                    offeredPlayer = (0, player_view_1.buildPlayerView)(op, teamId);
                _k.label = 4;
            case 4:
                teamFields = "id, name, primary_color, secondary_color, badge_pattern, badge_symbol, badge_initials, badge_primary_color, badge_secondary_color, budget, reputation, league_id";
                isVirtualOffer = offer.from_team_id === "virtual_ai";
                if (!isVirtualOffer) return [3 /*break*/, 5];
                _a = null;
                return [3 /*break*/, 7];
            case 5: return [4 /*yield*/, c.env.DB.prepare("SELECT ".concat(teamFields, " FROM teams WHERE id = ?")).bind(offer.from_team_id).first()];
            case 6:
                _a = _k.sent();
                _k.label = 7;
            case 7:
                fromTeamRow = _a;
                return [4 /*yield*/, c.env.DB.prepare("SELECT ".concat(teamFields, " FROM teams WHERE id = ?")).bind(offer.to_team_id).first()];
            case 8:
                toTeamRow = _k.sent();
                virtualFromTeam = null;
                if (isVirtualOffer) {
                    vd = {};
                    try {
                        if (offer.virtual_team_data)
                            vd = JSON.parse(offer.virtual_team_data);
                        else if (offer.message) {
                            legacy = JSON.parse(offer.message);
                            vd = { name: legacy.teamName, city: legacy.city };
                        }
                    }
                    catch (e) {
                        logger_1.logger.warn({ module: "game" }, "parse virtual_team_data", e);
                    }
                    vName = (_d = vd.name) !== null && _d !== void 0 ? _d : "Neznámý klub";
                    virtualFromTeam = {
                        id: "virtual_ai",
                        name: vName,
                        primary_color: "#4a5d43",
                        secondary_color: "#e8e4d8",
                        badge_pattern: "plain",
                        badge_symbol: null,
                        initials: vName.split(" ").map(function (w) { return w[0]; }).join("").slice(0, 3).toUpperCase(),
                        budget: null,
                        reputation: (_e = vd.rating) !== null && _e !== void 0 ? _e : null,
                        league_id: null,
                        is_virtual: true,
                        city: (_f = vd.city) !== null && _f !== void 0 ? _f : null,
                        district: (_g = vd.district) !== null && _g !== void 0 ? _g : null,
                    };
                }
                teamPublic = function (row, isMine) {
                    var _a, _b, _c;
                    return ({
                        id: row.id, name: row.name,
                        primary_color: (_a = row.badge_primary_color) !== null && _a !== void 0 ? _a : row.primary_color,
                        secondary_color: (_b = row.badge_secondary_color) !== null && _b !== void 0 ? _b : row.secondary_color,
                        badge_pattern: row.badge_pattern,
                        badge_symbol: row.badge_symbol,
                        initials: row.badge_initials,
                        budget: isMine ? row.budget : null,
                        reputation: (_c = row.reputation) !== null && _c !== void 0 ? _c : null,
                        league_id: row.league_id,
                    });
                };
                fetchManager = function (tId) { return __awaiter(void 0, void 0, void 0, function () {
                    var row, avatar;
                    var _a, _b, _c, _d;
                    return __generator(this, function (_e) {
                        switch (_e.label) {
                            case 0: return [4 /*yield*/, c.env.DB.prepare("SELECT id, name, backstory, avatar, age, coaching, motivation, tactics, youth_development, discipline, reputation FROM managers WHERE team_id = ? LIMIT 1").bind(tId).first().catch(function (e) { logger_1.logger.warn({ module: "game" }, "fetch manager for offer detail", e); return null; })];
                            case 1:
                                row = _e.sent();
                                if (!row)
                                    return [2 /*return*/, null];
                                avatar = {};
                                try {
                                    avatar = row.avatar ? JSON.parse(row.avatar) : {};
                                }
                                catch (e) {
                                    logger_1.logger.warn({ module: "game" }, "parse manager avatar", e);
                                }
                                return [2 /*return*/, {
                                        id: row.id, name: row.name, backstory: row.backstory,
                                        avatar: avatar,
                                        age: row.age,
                                        coaching: (_a = row.coaching) !== null && _a !== void 0 ? _a : 40,
                                        motivation: (_b = row.motivation) !== null && _b !== void 0 ? _b : 40,
                                        tactics: (_c = row.tactics) !== null && _c !== void 0 ? _c : 40,
                                        reputation: (_d = row.reputation) !== null && _d !== void 0 ? _d : 30,
                                    }];
                        }
                    });
                }); };
                return [4 /*yield*/, Promise.all([
                        isVirtualOffer ? Promise.resolve(null) : fetchManager(offer.from_team_id),
                        fetchManager(offer.to_team_id),
                    ])];
            case 9:
                _b = _k.sent(), fromManager = _b[0], toManager = _b[1];
                return [4 /*yield*/, c.env.DB.prepare("SELECT e.id, e.event_type, e.team_id, e.amount, e.message, e.created_at, t.name as team_name\n     FROM transfer_offer_events e JOIN teams t ON e.team_id = t.id\n     WHERE e.offer_id = ? ORDER BY e.created_at ASC, e.id ASC").bind(offerId).all().catch(function (e) { logger_1.logger.warn({ module: "game" }, "fetch offer events", e); return { results: [] }; })];
            case 10:
                events = _k.sent();
                currentAmount = (offer.counter_amount != null ? offer.counter_amount : offer.offer_amount);
                crossLeague = !!((fromTeamRow === null || fromTeamRow === void 0 ? void 0 : fromTeamRow.league_id) && (toTeamRow === null || toTeamRow === void 0 ? void 0 : toTeamRow.league_id) && fromTeamRow.league_id !== toTeamRow.league_id);
                adminFee = crossLeague ? Math.round(currentAmount * 0.20) : 0;
                playerInterest = null;
                _k.label = 11;
            case 11:
                _k.trys.push([11, 16, , 17]);
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../transfers/player-interest"); })];
            case 12:
                _c = _k.sent(), computeInterestForOffer = _c.computeInterestForOffer, INTEREST_LABELS = _c.INTEREST_LABELS;
                isOfferActive = offer.status === "pending" || offer.status === "countered";
                if (!(isOfferActive && playerRow)) return [3 /*break*/, 14];
                virtualRating = virtualFromTeam ? virtualFromTeam.reputation : null;
                return [4 /*yield*/, computeInterestForOffer(c.env.DB, offer.player_id, {
                        fromTeamId: offer.from_team_id, offerAmount: currentAmount,
                        virtualRating: virtualRating,
                    })];
            case 13:
                fresh = _k.sent();
                if (fresh) {
                    playerInterest = { level: fresh.level, label: INTEREST_LABELS[fresh.level] };
                    if (role === "seller")
                        playerInterest.factors = fresh.factors;
                }
                return [3 /*break*/, 15];
            case 14:
                if (offer.player_interest != null) {
                    lvl = offer.player_interest;
                    playerInterest = { level: lvl, label: INTEREST_LABELS[lvl] };
                }
                _k.label = 15;
            case 15: return [3 /*break*/, 17];
            case 16:
                e_24 = _k.sent();
                logger_1.logger.warn({ module: "game" }, "player interest for offer detail", e_24);
                return [3 /*break*/, 17];
            case 17: return [2 /*return*/, c.json({
                    offer: {
                        id: offer.id,
                        player_id: offer.player_id,
                        from_team_id: offer.from_team_id,
                        to_team_id: offer.to_team_id,
                        offer_type: (_h = offer.offer_type) !== null && _h !== void 0 ? _h : "transfer",
                        loan_duration: offer.loan_duration,
                        offer_amount: offer.offer_amount,
                        counter_amount: offer.counter_amount,
                        message: offer.message,
                        reject_message: offer.reject_message,
                        status: offer.status,
                        last_action_by: offer.last_action_by,
                        expires_at: offer.expires_at,
                        created_at: offer.created_at,
                        resolved_at: offer.resolved_at,
                        offered_player_id: offer.offered_player_id,
                        player_interest: (_j = offer.player_interest) !== null && _j !== void 0 ? _j : null,
                        is_virtual: isVirtualOffer,
                    },
                    role: role,
                    on_turn: onTurn,
                    player: player,
                    offeredPlayer: offeredPlayer,
                    fromTeam: fromTeamRow ? teamPublic(fromTeamRow, offer.from_team_id === teamId) : virtualFromTeam,
                    toTeam: toTeamRow ? teamPublic(toTeamRow, offer.to_team_id === teamId) : null,
                    fromManager: fromManager,
                    toManager: toManager,
                    events: events.results,
                    currentAmount: currentAmount,
                    crossLeague: crossLeague,
                    adminFee: adminFee,
                    playerInterest: playerInterest,
                })];
        }
    });
}); });
gameRouter.post("/teams/:teamId/offers/:offerId/accept", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, offerId, body, acceptMessage, offer, isPending, rightSide, amount, buyerTeamId, sellerTeamId, playerId, offerType, loanDuration, swapPlayerId, targetSquad, vd, legacy, virtualName, vSeller, vGameDate, removePlayer, removed, soldName, createTransferNews, createNotification, pushEnv, e_25, buyerDestTeamId, buyerU21, buyer, seller, player, gameDate, offerPlayerName, currentSeason, seasonId, isCrossLeague, adminFee, loanDeductResult, loanUntil, createTransferNews, totalCost, transferDeductResult, currentPlayer, isBuyoutAccept, swap, playerUpdateStmt, batch, buyerBalanceAfter, txLog, contractCloseTeam, contractLeaveType, createTransferNews, playerName, smsRole, createNotification, pushEnv, label, acceptNote, e_26;
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s;
    return __generator(this, function (_t) {
        switch (_t.label) {
            case 0:
                teamId = c.req.param("teamId");
                offerId = c.req.param("offerId");
                return [4 /*yield*/, c.req.json().catch(function () { return ({}); })];
            case 1:
                body = _t.sent();
                acceptMessage = (_a = body.message) !== null && _a !== void 0 ? _a : null;
                return [4 /*yield*/, c.env.DB.prepare("SELECT * FROM transfer_offers\n     WHERE id = ? AND (from_team_id = ? OR to_team_id = ?) AND status IN ('pending','countered')\n       AND (last_action_by IS NULL OR last_action_by != ?)").bind(offerId, teamId, teamId, teamId).first()];
            case 2:
                offer = _t.sent();
                if (!offer)
                    return [2 /*return*/, c.json({ error: "Nabídka nenalezena nebo nejsi na tahu" }, 409)];
                // Fallback check když last_action_by IS NULL
                if (offer.last_action_by == null) {
                    isPending = offer.status === "pending";
                    rightSide = isPending ? offer.to_team_id === teamId : offer.from_team_id === teamId;
                    if (!rightSide)
                        return [2 /*return*/, c.json({ error: "Nejsi na tahu" }, 409)];
                }
                if (offer.expires_at && new Date(offer.expires_at) < new Date()) {
                    return [2 /*return*/, c.json({ error: "Nabídka vypršela" }, 410)];
                }
                amount = (offer.counter_amount != null ? offer.counter_amount : offer.offer_amount);
                if (amount < 0)
                    return [2 /*return*/, c.json({ error: "Neplatná částka přestupu" }, 400)];
                buyerTeamId = offer.from_team_id;
                sellerTeamId = offer.to_team_id;
                playerId = offer.player_id;
                offerType = (_b = offer.offer_type) !== null && _b !== void 0 ? _b : "transfer";
                loanDuration = offer.loan_duration;
                swapPlayerId = (_c = offer.offered_player_id) !== null && _c !== void 0 ? _c : null;
                targetSquad = ((_d = offer.target_squad) !== null && _d !== void 0 ? _d : "senior") === "u21" ? "u21" : "senior";
                if (!(buyerTeamId === "virtual_ai")) return [3 /*break*/, 17];
                vd = {};
                try {
                    if (offer.virtual_team_data)
                        vd = JSON.parse(offer.virtual_team_data);
                    else if (offer.message) {
                        legacy = JSON.parse(offer.message);
                        vd = { name: legacy.teamName, city: legacy.city };
                    }
                }
                catch (e) {
                    logger_1.logger.warn({ module: "game" }, "parse virtual_team_data on accept", e);
                }
                virtualName = (_e = vd.name) !== null && _e !== void 0 ? _e : "Neznámý klub";
                return [4 /*yield*/, c.env.DB.prepare("SELECT name, league_id, budget, game_date FROM teams WHERE id = ?")
                        .bind(sellerTeamId).first()];
            case 3:
                vSeller = _t.sent();
                if (!vSeller)
                    return [2 /*return*/, c.json({ error: "Prodávající nenalezen" }, 400)];
                vGameDate = (_f = vSeller.game_date) !== null && _f !== void 0 ? _f : new Date().toISOString();
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../transfers/remove-player"); })];
            case 4:
                removePlayer = (_t.sent()).removePlayer;
                return [4 /*yield*/, removePlayer(c.env.DB, playerId, "transfer", { toFreeAgent: false, teamId: sellerTeamId })];
            case 5:
                removed = _t.sent();
                if (!removed.ok || !removed.player)
                    return [2 /*return*/, c.json({ error: "Hráč již není v kádru" }, 409)];
                soldName = "".concat(removed.player.firstName, " ").concat(removed.player.lastName);
                return [4 /*yield*/, c.env.DB.batch([
                        c.env.DB.prepare("UPDATE teams SET budget = budget + ? WHERE id = ?").bind(amount, sellerTeamId),
                        c.env.DB.prepare("UPDATE transfer_offers SET status = 'accepted', resolved_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?").bind(offerId),
                    ])];
            case 6:
                _t.sent();
                return [4 /*yield*/, c.env.DB.prepare("INSERT INTO transactions (id, team_id, type, amount, balance_after, description, game_date) VALUES (?, ?, 'transfer_income', ?, ?, ?, ?)")
                        .bind(crypto.randomUUID(), sellerTeamId, amount, vSeller.budget + amount, "Prodej: ".concat(soldName, " \u2192 ").concat(virtualName), vGameDate)
                        .run().catch(function (e) { return logger_1.logger.warn({ module: "game" }, "log virtual sale transaction", e); })];
            case 7:
                _t.sent();
                // Event log — jen za lidskou stranu (transfer_offer_events.team_id má FK na teams).
                return [4 /*yield*/, c.env.DB.prepare("INSERT INTO transfer_offer_events (id, offer_id, team_id, event_type, amount, message) VALUES (?, ?, ?, 'accept', ?, ?)")
                        .bind(crypto.randomUUID(), offerId, sellerTeamId, amount, acceptMessage).run()
                        .catch(function (e) { return logger_1.logger.warn({ module: "game" }, "insert virtual accept event", e); })];
            case 8:
                // Event log — jen za lidskou stranu (transfer_offer_events.team_id má FK na teams).
                _t.sent();
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../transfers/transfer-news"); })];
            case 9:
                createTransferNews = (_t.sent()).createTransferNews;
                return [4 /*yield*/, createTransferNews(c.env.DB, (_g = vSeller.league_id) !== null && _g !== void 0 ? _g : "", null, "transfer_completed", {
                        playerName: soldName, playerAge: removed.player.age,
                        playerPosition: removed.player.position, teamName: vSeller.name,
                        fromTeamName: vSeller.name, toTeamName: virtualName, fee: amount,
                    }).catch(function (e) { return logger_1.logger.warn({ module: "game" }, "create virtual sale news", e); })];
            case 10:
                _t.sent();
                return [4 /*yield*/, sendPhoneSMS(c.env.DB, sellerTeamId, "Sportovní ředitel", "Sportovní ředitel", "\uD83D\uDCE4 P\u0159estup potvrzen. ".concat(soldName, " odch\u00E1z\u00ED do ").concat(virtualName).concat(vd.city ? " (".concat(vd.city, ")") : "", " za ").concat(amount.toLocaleString("cs"), " K\u010D.")).catch(function (e) { return logger_1.logger.warn({ module: "game" }, "virtual sale SMS", e); })];
            case 11:
                _t.sent();
                _t.label = 12;
            case 12:
                _t.trys.push([12, 15, , 16]);
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../community/notifications"); })];
            case 13:
                createNotification = (_t.sent()).createNotification;
                pushEnv = { VAPID_PUBLIC_KEY: c.env.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: c.env.VAPID_PRIVATE_KEY, VAPID_SUBJECT: c.env.VAPID_SUBJECT, DB: c.env.DB };
                return [4 /*yield*/, createNotification(c.env.DB, sellerTeamId, "transfer", "\u2705 P\u0159estup ".concat(soldName, " dokon\u010Den"), "".concat(virtualName, " zaplatil ").concat(amount.toLocaleString("cs-CZ"), " K\u010D."), "/dashboard/transfers", pushEnv)];
            case 14:
                _t.sent();
                return [3 /*break*/, 16];
            case 15:
                e_25 = _t.sent();
                logger_1.logger.warn({ module: "game" }, "virtual sale notification", e_25);
                return [3 /*break*/, 16];
            case 16: return [2 /*return*/, c.json({ ok: true, sold_to: virtualName })];
            case 17:
                buyerDestTeamId = offer.from_team_id;
                if (!(targetSquad === "u21" && offerType !== "loan")) return [3 /*break*/, 19];
                return [4 /*yield*/, c.env.DB.prepare("SELECT id FROM teams WHERE parent_team_id = ? AND team_type = 'u21'").bind(offer.from_team_id).first()];
            case 18:
                buyerU21 = _t.sent();
                if (!buyerU21) {
                    return [2 /*return*/, c.json({ error: "Kupující nemá U21 tým — nelze přijmout" }, 400)];
                }
                buyerDestTeamId = buyerU21.id;
                _t.label = 19;
            case 19: return [4 /*yield*/, c.env.DB.prepare("SELECT budget, name, game_date, league_id FROM teams WHERE id = ?").bind(buyerTeamId).first()];
            case 20:
                buyer = _t.sent();
                if (!buyer)
                    return [2 /*return*/, c.json({ error: "Kupující nenalezen" }, 400)];
                return [4 /*yield*/, c.env.DB.prepare("SELECT name, league_id, budget FROM teams WHERE id = ?").bind(sellerTeamId).first()];
            case 21:
                seller = _t.sent();
                return [4 /*yield*/, c.env.DB.prepare("SELECT first_name, last_name, age, position FROM players WHERE id = ?").bind(playerId).first()];
            case 22:
                player = _t.sent();
                gameDate = (_h = buyer.game_date) !== null && _h !== void 0 ? _h : new Date().toISOString();
                offerPlayerName = "".concat(player === null || player === void 0 ? void 0 : player.first_name, " ").concat(player === null || player === void 0 ? void 0 : player.last_name);
                return [4 /*yield*/, c.env.DB.prepare("SELECT id FROM seasons ORDER BY number DESC LIMIT 1")
                        .first().catch(function (e) { logger_1.logger.warn({ module: "game" }, "fetch season for offer accept", e); return null; })];
            case 23:
                currentSeason = _t.sent();
                seasonId = (0, season_1.mustSeason)(currentSeason === null || currentSeason === void 0 ? void 0 : currentSeason.id);
                isCrossLeague = !!((seller === null || seller === void 0 ? void 0 : seller.league_id) && buyer.league_id && seller.league_id !== buyer.league_id);
                adminFee = (offerType !== "loan" && isCrossLeague) ? Math.round(amount * 0.20) : 0;
                if (!(offerType === "loan" && loanDuration)) return [3 /*break*/, 32];
                if (!(amount > 0)) return [3 /*break*/, 25];
                return [4 /*yield*/, c.env.DB.prepare("UPDATE teams SET budget = budget - ? WHERE id = ? AND budget >= ?").bind(amount, buyerTeamId, amount).run()];
            case 24:
                loanDeductResult = _t.sent();
                if (loanDeductResult.meta.changes === 0) {
                    return [2 /*return*/, c.json({ error: "Kupující nemá dostatek prostředků" }, 400)];
                }
                _t.label = 25;
            case 25:
                loanUntil = new Date(gameDate);
                loanUntil.setDate(loanUntil.getDate() + loanDuration);
                return [4 /*yield*/, c.env.DB.batch([
                        c.env.DB.prepare("UPDATE players SET team_id = ?, loan_from_team_id = ?, loan_until = ? WHERE id = ? AND team_id = ?")
                            .bind(buyerTeamId, sellerTeamId, loanUntil.toISOString(), playerId, sellerTeamId),
                        c.env.DB.prepare("UPDATE transfer_offers SET status = 'accepted', resolved_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?").bind(offerId),
                    ])];
            case 26:
                _t.sent();
                // Contract + transaction log (non-critical)
                return [4 /*yield*/, c.env.DB.prepare("INSERT INTO player_contracts (id, player_id, team_id, season_id, joined_at, join_type, fee, is_active) VALUES (?, ?, ?, ?, ?, 'loan', ?, 1)")
                        .bind(crypto.randomUUID(), playerId, buyerTeamId, seasonId, gameDate, amount).run().catch(function (e) { return logger_1.logger.warn({ module: "game" }, "insert loan contract", e); })];
            case 27:
                // Contract + transaction log (non-critical)
                _t.sent();
                if (!(amount > 0)) return [3 /*break*/, 29];
                return [4 /*yield*/, c.env.DB.batch([
                        c.env.DB.prepare("INSERT INTO transactions (id, team_id, type, amount, balance_after, description, game_date) VALUES (?, ?, 'loan_fee', ?, ?, ?, ?)")
                            .bind(crypto.randomUUID(), buyerTeamId, -amount, buyer.budget - amount, "Hostov\u00E1n\u00ED: ".concat(offerPlayerName), gameDate),
                        c.env.DB.prepare("UPDATE teams SET budget = budget + ? WHERE id = ?").bind(amount, sellerTeamId),
                        c.env.DB.prepare("INSERT INTO transactions (id, team_id, type, amount, balance_after, description, game_date) VALUES (?, ?, 'loan_income', ?, ?, ?, ?)")
                            .bind(crypto.randomUUID(), sellerTeamId, amount, ((_j = seller === null || seller === void 0 ? void 0 : seller.budget) !== null && _j !== void 0 ? _j : 0) + amount, "Hostov\u00E1n\u00ED (p\u0159\u00EDjem): ".concat(offerPlayerName), gameDate),
                    ]).catch(function (e) { return logger_1.logger.warn({ module: "game" }, "log loan transactions", e); })];
            case 28:
                _t.sent();
                _t.label = 29;
            case 29: return [4 /*yield*/, Promise.resolve().then(function () { return require("../transfers/transfer-news"); })];
            case 30:
                createTransferNews = (_t.sent()).createTransferNews;
                return [4 /*yield*/, createTransferNews(c.env.DB, (_k = seller === null || seller === void 0 ? void 0 : seller.league_id) !== null && _k !== void 0 ? _k : "", null, "loan_completed", {
                        playerName: offerPlayerName, playerAge: player === null || player === void 0 ? void 0 : player.age,
                        playerPosition: player === null || player === void 0 ? void 0 : player.position, teamName: (_l = seller === null || seller === void 0 ? void 0 : seller.name) !== null && _l !== void 0 ? _l : "",
                        fromTeamName: seller === null || seller === void 0 ? void 0 : seller.name, toTeamName: buyer.name, fee: amount,
                    }).catch(function (e) { return logger_1.logger.warn({ module: "game" }, "create loan news", e); })];
            case 31:
                _t.sent();
                return [3 /*break*/, 47];
            case 32:
                totalCost = amount + adminFee;
                return [4 /*yield*/, c.env.DB.prepare("UPDATE teams SET budget = budget - ? WHERE id = ? AND budget >= ?").bind(totalCost, buyerTeamId, totalCost).run()];
            case 33:
                transferDeductResult = _t.sent();
                if (transferDeductResult.meta.changes === 0) {
                    return [2 /*return*/, c.json({ error: adminFee > 0
                                ? "Kupuj\u00EDc\u00ED nem\u00E1 dostatek prost\u0159edk\u016F (cena ".concat(amount.toLocaleString("cs"), " K\u010D + administra\u010Dn\u00ED poplatek ").concat(adminFee.toLocaleString("cs"), " K\u010D)")
                                : "Kupující nemá dostatek prostředků" }, 400)];
                }
                return [4 /*yield*/, c.env.DB.prepare("SELECT team_id, loan_from_team_id FROM players WHERE id = ?")
                        .bind(playerId).first()];
            case 34:
                currentPlayer = _t.sent();
                isBuyoutAccept = !!(currentPlayer === null || currentPlayer === void 0 ? void 0 : currentPlayer.loan_from_team_id) && currentPlayer.loan_from_team_id === sellerTeamId && currentPlayer.team_id === buyerTeamId;
                if (!swapPlayerId) return [3 /*break*/, 37];
                return [4 /*yield*/, c.env.DB.prepare("SELECT team_id, loan_from_team_id FROM players WHERE id = ?").bind(swapPlayerId).first()];
            case 35:
                swap = _t.sent();
                if (!(!swap || swap.team_id !== buyerTeamId || swap.loan_from_team_id)) return [3 /*break*/, 37];
                // Vrátit peníze (rollback budget)
                return [4 /*yield*/, c.env.DB.prepare("UPDATE teams SET budget = budget + ? WHERE id = ?").bind(totalCost, buyerTeamId).run()
                        .catch(function (e) { return logger_1.logger.warn({ module: "game" }, "rollback budget after swap race", e); })];
            case 36:
                // Vrátit peníze (rollback budget)
                _t.sent();
                return [2 /*return*/, c.json({ error: "Hráč na výměnu již není k dispozici" }, 409)];
            case 37:
                playerUpdateStmt = isBuyoutAccept
                    ? c.env.DB.prepare("UPDATE players SET team_id = ?, loan_from_team_id = NULL, loan_until = NULL WHERE id = ? AND team_id = ?").bind(buyerDestTeamId, playerId, buyerTeamId)
                    : c.env.DB.prepare("UPDATE players SET team_id = ? WHERE id = ? AND team_id = ?").bind(buyerDestTeamId, playerId, sellerTeamId);
                batch = [
                    c.env.DB.prepare("UPDATE teams SET budget = budget + ? WHERE id = ?").bind(amount, sellerTeamId),
                    playerUpdateStmt,
                    c.env.DB.prepare("UPDATE transfer_offers SET status = 'accepted', resolved_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?").bind(offerId),
                    c.env.DB.prepare("UPDATE transfer_listings SET status = 'sold' WHERE player_id = ? AND status = 'active'").bind(playerId),
                    c.env.DB.prepare("UPDATE transfer_bids SET status = 'rejected' WHERE listing_id IN (SELECT id FROM transfer_listings WHERE player_id = ?) AND status = 'pending'").bind(playerId),
                ];
                if (swapPlayerId) {
                    // Swap hráč jde opačným směrem (buyer → seller).
                    batch.push(c.env.DB.prepare("UPDATE players SET team_id = ? WHERE id = ? AND team_id = ?").bind(sellerTeamId, swapPlayerId, buyerTeamId));
                }
                return [4 /*yield*/, c.env.DB.batch(batch)];
            case 38:
                _t.sent();
                buyerBalanceAfter = buyer.budget - totalCost;
                txLog = [
                    c.env.DB.prepare("INSERT INTO transactions (id, team_id, type, amount, balance_after, description, game_date) VALUES (?, ?, 'transfer_fee', ?, ?, ?, ?)")
                        .bind(crypto.randomUUID(), buyerTeamId, -amount, buyerBalanceAfter + adminFee, "P\u0159estup: ".concat(offerPlayerName), gameDate),
                    c.env.DB.prepare("INSERT INTO transactions (id, team_id, type, amount, balance_after, description, game_date) VALUES (?, ?, 'transfer_income', ?, ?, ?, ?)")
                        .bind(crypto.randomUUID(), sellerTeamId, amount, ((_m = seller === null || seller === void 0 ? void 0 : seller.budget) !== null && _m !== void 0 ? _m : 0) + amount, "Prodej: ".concat(offerPlayerName), gameDate),
                ];
                if (adminFee > 0) {
                    txLog.push(c.env.DB.prepare("INSERT INTO transactions (id, team_id, type, amount, balance_after, description, game_date) VALUES (?, ?, 'transfer_admin_fee', ?, ?, ?, ?)")
                        .bind(crypto.randomUUID(), buyerTeamId, -adminFee, buyerBalanceAfter, "Administrační poplatek za meziligový přestup", gameDate));
                }
                return [4 /*yield*/, c.env.DB.batch(txLog).catch(function (e) { return logger_1.logger.warn({ module: "game" }, "log offer-accept transactions", e); })];
            case 39:
                _t.sent();
                contractCloseTeam = isBuyoutAccept ? buyerTeamId : sellerTeamId;
                contractLeaveType = isBuyoutAccept ? "loan_bought" : "transfer";
                return [4 /*yield*/, c.env.DB.prepare("UPDATE player_contracts SET is_active = 0, left_at = ?, leave_type = ? WHERE player_id = ? AND team_id = ? AND is_active = 1")
                        .bind(gameDate, contractLeaveType, playerId, contractCloseTeam).run().catch(function (e) { return logger_1.logger.warn({ module: "game" }, "deactivate contract on offer accept", e); })];
            case 40:
                _t.sent();
                return [4 /*yield*/, c.env.DB.prepare("INSERT INTO player_contracts (id, player_id, team_id, season_id, joined_at, join_type, fee, is_active) VALUES (?, ?, ?, ?, ?, 'transfer', ?, 1)")
                        .bind(crypto.randomUUID(), playerId, buyerTeamId, seasonId, gameDate, amount).run().catch(function (e) { return logger_1.logger.warn({ module: "game" }, "insert transfer contract on offer accept", e); })];
            case 41:
                _t.sent();
                if (!swapPlayerId) return [3 /*break*/, 44];
                return [4 /*yield*/, c.env.DB.prepare("UPDATE player_contracts SET is_active = 0, left_at = ?, leave_type = 'transfer' WHERE player_id = ? AND team_id = ? AND is_active = 1")
                        .bind(gameDate, swapPlayerId, buyerTeamId).run().catch(function (e) { return logger_1.logger.warn({ module: "game" }, "deactivate swap contract", e); })];
            case 42:
                _t.sent();
                return [4 /*yield*/, c.env.DB.prepare("INSERT INTO player_contracts (id, player_id, team_id, season_id, joined_at, join_type, fee, is_active) VALUES (?, ?, ?, ?, ?, 'swap', 0, 1)")
                        .bind(crypto.randomUUID(), swapPlayerId, sellerTeamId, seasonId, gameDate).run().catch(function (e) { return logger_1.logger.warn({ module: "game" }, "insert swap contract", e); })];
            case 43:
                _t.sent();
                _t.label = 44;
            case 44: return [4 /*yield*/, Promise.resolve().then(function () { return require("../transfers/transfer-news"); })];
            case 45:
                createTransferNews = (_t.sent()).createTransferNews;
                return [4 /*yield*/, createTransferNews(c.env.DB, (_o = seller === null || seller === void 0 ? void 0 : seller.league_id) !== null && _o !== void 0 ? _o : "", null, "transfer_completed", {
                        playerName: offerPlayerName, playerAge: player === null || player === void 0 ? void 0 : player.age,
                        playerPosition: player === null || player === void 0 ? void 0 : player.position, teamName: (_p = seller === null || seller === void 0 ? void 0 : seller.name) !== null && _p !== void 0 ? _p : "",
                        fromTeamName: seller === null || seller === void 0 ? void 0 : seller.name, toTeamName: buyer.name, fee: amount,
                    }).catch(function (e) { return logger_1.logger.warn({ module: "game" }, "create offer accepted news", e); })];
            case 46:
                _t.sent();
                _t.label = 47;
            case 47: 
            // Event log
            return [4 /*yield*/, c.env.DB.prepare("INSERT INTO transfer_offer_events (id, offer_id, team_id, event_type, amount, message) VALUES (?, ?, ?, 'accept', ?, ?)")
                    .bind(crypto.randomUUID(), offerId, teamId, amount, acceptMessage).run()
                    .catch(function (e) { return logger_1.logger.warn({ module: "game" }, "insert accept event", e); })];
            case 48:
                // Event log
                _t.sent();
                // Update commute + reset squad number
                return [4 /*yield*/, onPlayerTransferred(c.env.DB, playerId, buyerTeamId)];
            case 49:
                // Update commute + reset squad number
                _t.sent();
                if (!swapPlayerId) return [3 /*break*/, 51];
                return [4 /*yield*/, onPlayerTransferred(c.env.DB, swapPlayerId, sellerTeamId)];
            case 50:
                _t.sent();
                _t.label = 51;
            case 51:
                playerName = offerPlayerName;
                smsRole = "Sportovní ředitel";
                if (!(offerType === "loan")) return [3 /*break*/, 54];
                return [4 /*yield*/, sendPhoneSMS(c.env.DB, buyerTeamId, smsRole, smsRole, "\uD83E\uDD1D Hostov\u00E1n\u00ED schv\u00E1leno! ".concat(playerName, " p\u0159ich\u00E1z\u00ED z ").concat((_q = seller === null || seller === void 0 ? void 0 : seller.name) !== null && _q !== void 0 ? _q : "neznámého klubu", " na ").concat(loanDuration, " dn\u00ED.")).catch(function (e) { return logger_1.logger.warn({ module: "game" }, "loan accept SMS buyer", e); })];
            case 52:
                _t.sent();
                return [4 /*yield*/, sendPhoneSMS(c.env.DB, sellerTeamId, smsRole, smsRole, "\uD83D\uDCE4 Hostov\u00E1n\u00ED potvrzeno. ".concat(playerName, " odch\u00E1z\u00ED do ").concat(buyer.name, " na ").concat(loanDuration, " dn\u00ED.").concat(amount > 0 ? " Poplatek: ".concat(amount.toLocaleString("cs"), " K\u010D.") : "")).catch(function (e) { return logger_1.logger.warn({ module: "game" }, "loan accept SMS seller", e); })];
            case 53:
                _t.sent();
                return [3 /*break*/, 57];
            case 54: return [4 /*yield*/, sendPhoneSMS(c.env.DB, buyerTeamId, smsRole, smsRole, "\uD83E\uDD1D P\u0159estup potvrzen! ".concat(playerName, " p\u0159ich\u00E1z\u00ED z ").concat((_r = seller === null || seller === void 0 ? void 0 : seller.name) !== null && _r !== void 0 ? _r : "neznámého klubu", " za ").concat(amount.toLocaleString("cs"), " K\u010D.")).catch(function (e) { return logger_1.logger.warn({ module: "game" }, "transfer accept SMS buyer", e); })];
            case 55:
                _t.sent();
                return [4 /*yield*/, sendPhoneSMS(c.env.DB, sellerTeamId, smsRole, smsRole, "\uD83D\uDCE4 P\u0159estup potvrzen. ".concat(playerName, " odch\u00E1z\u00ED do ").concat(buyer.name, " za ").concat(amount.toLocaleString("cs"), " K\u010D.")).catch(function (e) { return logger_1.logger.warn({ module: "game" }, "transfer accept SMS seller", e); })];
            case 56:
                _t.sent();
                _t.label = 57;
            case 57:
                _t.trys.push([57, 61, , 62]);
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../community/notifications"); })];
            case 58:
                createNotification = (_t.sent()).createNotification;
                pushEnv = { VAPID_PUBLIC_KEY: c.env.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: c.env.VAPID_PRIVATE_KEY, VAPID_SUBJECT: c.env.VAPID_SUBJECT, DB: c.env.DB };
                label = offerType === "loan" ? "Hostování" : "Přestup";
                acceptNote = acceptMessage ? " \u201E".concat(acceptMessage, "\"") : "";
                return [4 /*yield*/, createNotification(c.env.DB, buyerTeamId, "transfer", "\u2705 ".concat(label, " ").concat(playerName, " dokon\u010Den"), "Koupili jste od ".concat((_s = seller === null || seller === void 0 ? void 0 : seller.name) !== null && _s !== void 0 ? _s : "prodávajícího", " za ").concat(amount.toLocaleString("cs-CZ"), " K\u010D.").concat(acceptNote), "/dashboard/transfers/offer/".concat(offerId), pushEnv)];
            case 59:
                _t.sent();
                return [4 /*yield*/, createNotification(c.env.DB, sellerTeamId, "transfer", "\u2705 ".concat(label, " ").concat(playerName, " dokon\u010Den"), "".concat(buyer.name, " zaplatil ").concat(amount.toLocaleString("cs-CZ"), " K\u010D.").concat(acceptNote), "/dashboard/transfers/offer/".concat(offerId), pushEnv)];
            case 60:
                _t.sent();
                return [3 /*break*/, 62];
            case 61:
                e_26 = _t.sent();
                logger_1.logger.warn({ module: "game" }, "offer accept notifications", e_26);
                return [3 /*break*/, 62];
            case 62: return [2 /*return*/, c.json({ ok: true })];
        }
    });
}); });
gameRouter.post("/teams/:teamId/offers/:offerId/reject", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, offerId, body, offer, canReject, applyOfferRejectionImpact, otherTeamId, player, rejecterTeam, playerName, isLoan, rejectMsg, createNotification, pushEnv, e_27;
    var _a, _b, _c, _d;
    return __generator(this, function (_e) {
        switch (_e.label) {
            case 0:
                teamId = c.req.param("teamId");
                offerId = c.req.param("offerId");
                return [4 /*yield*/, c.req.json().catch(function (e) { logger_1.logger.warn({ module: "game" }, "parse reject offer body", e); return {}; })];
            case 1:
                body = _e.sent();
                return [4 /*yield*/, c.env.DB.prepare("SELECT id, player_id, from_team_id, to_team_id, offer_amount, counter_amount, offer_type, status, last_action_by, virtual_team_data\n     FROM transfer_offers WHERE id = ? AND (from_team_id = ? OR to_team_id = ?) AND status IN ('pending','countered')").bind(offerId, teamId, teamId).first()
                        .catch(function (e) { logger_1.logger.warn({ module: "game" }, "fetch offer for reject", e); return null; })];
            case 2:
                offer = _e.sent();
                if (!offer)
                    return [2 /*return*/, c.json({ error: "Nabídka nenalezena" }, 404)];
                canReject = offer.last_action_by != null
                    ? offer.last_action_by !== teamId
                    : (offer.status === "pending" ? offer.to_team_id === teamId : offer.from_team_id === teamId);
                if (!canReject)
                    return [2 /*return*/, c.json({ error: "Nejsi na tahu" }, 409)];
                return [4 /*yield*/, c.env.DB.prepare("UPDATE transfer_offers SET status = 'rejected', reject_message = ?, resolved_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?").bind((_a = body.message) !== null && _a !== void 0 ? _a : null, offerId).run()];
            case 3:
                _e.sent();
                if (!(offer.to_team_id === teamId)) return [3 /*break*/, 5];
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../transfers/offer-rejection-impact"); })];
            case 4:
                applyOfferRejectionImpact = (_e.sent()).applyOfferRejectionImpact;
                c.executionCtx.waitUntil(applyOfferRejectionImpact(c.env.DB, offer, "reject", {
                    GEMINI_API_KEY: c.env.GEMINI_API_KEY,
                    VAPID_PUBLIC_KEY: c.env.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: c.env.VAPID_PRIVATE_KEY, VAPID_SUBJECT: c.env.VAPID_SUBJECT, DB: c.env.DB,
                }).catch(function (e) { return logger_1.logger.warn({ module: "game" }, "rejection impact", e); }));
                _e.label = 5;
            case 5: return [4 /*yield*/, c.env.DB.prepare("INSERT INTO transfer_offer_events (id, offer_id, team_id, event_type, amount, message) VALUES (?, ?, ?, 'reject', NULL, ?)")
                    .bind(crypto.randomUUID(), offerId, teamId, (_b = body.message) !== null && _b !== void 0 ? _b : null).run()
                    .catch(function (e) { return logger_1.logger.warn({ module: "game" }, "insert reject event", e); })];
            case 6:
                _e.sent();
                otherTeamId = offer.from_team_id === teamId ? offer.to_team_id : offer.from_team_id;
                // Virtuální klub nemá telefon ani notifikace — odmítnutí končí tady.
                if (otherTeamId === "virtual_ai")
                    return [2 /*return*/, c.json({ ok: true })];
                return [4 /*yield*/, c.env.DB.prepare("SELECT first_name, last_name FROM players WHERE id = ?")
                        .bind(offer.player_id).first().catch(function (e) { logger_1.logger.warn({ module: "game" }, "fetch player for reject notif", e); return null; })];
            case 7:
                player = _e.sent();
                return [4 /*yield*/, c.env.DB.prepare("SELECT name FROM teams WHERE id = ?")
                        .bind(teamId).first().catch(function (e) { logger_1.logger.warn({ module: "game" }, "fetch rejecter team", e); return null; })];
            case 8:
                rejecterTeam = _e.sent();
                playerName = player ? "".concat(player.first_name, " ").concat(player.last_name) : "hráče";
                isLoan = offer.offer_type === "loan";
                rejectMsg = body.message;
                return [4 /*yield*/, sendPhoneSMS(c.env.DB, otherTeamId, "Sportovní ředitel", "Sportovní ředitel", "\u274C ".concat((_c = rejecterTeam === null || rejecterTeam === void 0 ? void 0 : rejecterTeam.name) !== null && _c !== void 0 ? _c : "Klub", " odm\u00EDtl ").concat(isLoan ? "hostování" : "přestup", " ").concat(playerName, ".").concat(rejectMsg ? " Vzkaz: \"".concat(rejectMsg, "\"") : "")).catch(function (e) { return logger_1.logger.warn({ module: "game" }, "SMS reject notif", e); })];
            case 9:
                _e.sent();
                _e.label = 10;
            case 10:
                _e.trys.push([10, 13, , 14]);
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../community/notifications"); })];
            case 11:
                createNotification = (_e.sent()).createNotification;
                pushEnv = { VAPID_PUBLIC_KEY: c.env.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: c.env.VAPID_PRIVATE_KEY, VAPID_SUBJECT: c.env.VAPID_SUBJECT, DB: c.env.DB };
                return [4 /*yield*/, createNotification(c.env.DB, otherTeamId, "transfer", "\u274C Nab\u00EDdka za ".concat(playerName, " zam\u00EDtnuta"), "".concat((_d = rejecterTeam === null || rejecterTeam === void 0 ? void 0 : rejecterTeam.name) !== null && _d !== void 0 ? _d : "Klub", " odm\u00EDtl nab\u00EDdku").concat(rejectMsg ? ": \u201E".concat(rejectMsg, "\"") : "."), "/dashboard/transfers/offer/".concat(offerId), pushEnv)];
            case 12:
                _e.sent();
                return [3 /*break*/, 14];
            case 13:
                e_27 = _e.sent();
                logger_1.logger.warn({ module: "game" }, "reject offer notification", e_27);
                return [3 /*break*/, 14];
            case 14: return [2 /*return*/, c.json({ ok: true })];
        }
    });
}); });
// POST /teams/:teamId/players/:playerId/unrest-talk — usmiřovací akce s trucujícím hráčem.
// Deterministické efekty, AI generuje jen textaci odpovědi hráče (s fallbackem).
gameRouter.post("/teams/:teamId/players/:playerId/unrest-talk", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, playerId, body, actionId, performUnrestAction, result;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                teamId = c.req.param("teamId");
                playerId = c.req.param("playerId");
                return [4 /*yield*/, c.req.json().catch(function (e) { logger_1.logger.warn({ module: "game" }, "parse unrest-talk body", e); return {}; })];
            case 1:
                body = _b.sent();
                actionId = body.action;
                if (!actionId)
                    return [2 /*return*/, c.json({ error: "Chybí akce" }, 400)];
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../transfers/unrest"); })];
            case 2:
                performUnrestAction = (_b.sent()).performUnrestAction;
                return [4 /*yield*/, performUnrestAction(c.env.DB, c.env, teamId, playerId, actionId)];
            case 3:
                result = _b.sent();
                if (!result.ok)
                    return [2 /*return*/, c.json({ error: result.error }, ((_a = result.status) !== null && _a !== void 0 ? _a : 400))];
                return [2 /*return*/, c.json(result)];
        }
    });
}); });
gameRouter.post("/teams/:teamId/offers/:offerId/counter", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, offerId, body, offer, canCounter, buyer, otherTeamId, player, counterTeam, pName, createNotification, pushEnv, e_28;
    var _a, _b, _c, _d;
    return __generator(this, function (_e) {
        switch (_e.label) {
            case 0:
                teamId = c.req.param("teamId");
                offerId = c.req.param("offerId");
                return [4 /*yield*/, c.req.json()];
            case 1:
                body = _e.sent();
                if (!body.amount || body.amount <= 0 || !Number.isInteger(body.amount)) {
                    return [2 /*return*/, c.json({ error: "Protinabídka musí být kladné celé číslo" }, 400)];
                }
                return [4 /*yield*/, c.env.DB.prepare("SELECT player_id, from_team_id, to_team_id, status, last_action_by, expires_at FROM transfer_offers WHERE id = ? AND (from_team_id = ? OR to_team_id = ?) AND status IN ('pending','countered')").bind(offerId, teamId, teamId).first()];
            case 2:
                offer = _e.sent();
                if (!offer)
                    return [2 /*return*/, c.json({ error: "Nabídka nenalezena" }, 404)];
                if (offer.from_team_id === "virtual_ai") {
                    return [2 /*return*/, c.json({ error: "Virtuální klub o ceně nejedná — ber, nebo nech být" }, 400)];
                }
                canCounter = offer.last_action_by != null
                    ? offer.last_action_by !== teamId
                    : (offer.status === "pending" ? offer.to_team_id === teamId : offer.from_team_id === teamId);
                if (!canCounter)
                    return [2 /*return*/, c.json({ error: "Nejsi na tahu" }, 409)];
                if (offer.expires_at && new Date(offer.expires_at) < new Date()) {
                    return [2 /*return*/, c.json({ error: "Nabídka vypršela" }, 410)];
                }
                if (!(offer.from_team_id === teamId)) return [3 /*break*/, 4];
                return [4 /*yield*/, c.env.DB.prepare("SELECT budget FROM teams WHERE id = ?").bind(teamId).first()];
            case 3:
                buyer = _e.sent();
                if (!buyer || buyer.budget < body.amount) {
                    return [2 /*return*/, c.json({ error: "Nedostatek pen\u011Bz. M\u00E1te ".concat(((_a = buyer === null || buyer === void 0 ? void 0 : buyer.budget) !== null && _a !== void 0 ? _a : 0).toLocaleString("cs"), " K\u010D, nab\u00EDz\u00EDte ").concat(body.amount.toLocaleString("cs"), " K\u010D.") }, 400)];
                }
                _e.label = 4;
            case 4: return [4 /*yield*/, c.env.DB.prepare("UPDATE transfer_offers SET status = 'countered', counter_amount = ?, last_action_by = ? WHERE id = ?").bind(body.amount, teamId, offerId).run()];
            case 5:
                _e.sent();
                return [4 /*yield*/, c.env.DB.prepare("INSERT INTO transfer_offer_events (id, offer_id, team_id, event_type, amount, message) VALUES (?, ?, ?, 'counter', ?, ?)")
                        .bind(crypto.randomUUID(), offerId, teamId, body.amount, (_b = body.message) !== null && _b !== void 0 ? _b : null).run()
                        .catch(function (e) { return logger_1.logger.warn({ module: "game" }, "insert counter event", e); })];
            case 6:
                _e.sent();
                otherTeamId = offer.from_team_id === teamId ? offer.to_team_id : offer.from_team_id;
                return [4 /*yield*/, c.env.DB.prepare("SELECT first_name, last_name FROM players WHERE id = ?")
                        .bind(offer.player_id).first()
                        .catch(function (e) { logger_1.logger.warn({ module: "game" }, "fetch player for counter notif", e); return null; })];
            case 7:
                player = _e.sent();
                return [4 /*yield*/, c.env.DB.prepare("SELECT name FROM teams WHERE id = ?").bind(teamId).first()
                        .catch(function (e) { logger_1.logger.warn({ module: "game" }, "fetch counter team", e); return null; })];
            case 8:
                counterTeam = _e.sent();
                pName = player ? "".concat(player.first_name, " ").concat(player.last_name) : "hráče";
                return [4 /*yield*/, sendPhoneSMS(c.env.DB, otherTeamId, "Sportovní ředitel", "Sportovní ředitel", "\uD83D\uDCB0 ".concat((_c = counterTeam === null || counterTeam === void 0 ? void 0 : counterTeam.name) !== null && _c !== void 0 ? _c : "Klub", " poslal protinab\u00EDdku na ").concat(pName, ": ").concat(body.amount.toLocaleString("cs"), " K\u010D.")).catch(function (e) { return logger_1.logger.warn({ module: "game" }, "SMS counter notif", e); })];
            case 9:
                _e.sent();
                _e.label = 10;
            case 10:
                _e.trys.push([10, 13, , 14]);
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../community/notifications"); })];
            case 11:
                createNotification = (_e.sent()).createNotification;
                pushEnv = { VAPID_PUBLIC_KEY: c.env.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: c.env.VAPID_PRIVATE_KEY, VAPID_SUBJECT: c.env.VAPID_SUBJECT, DB: c.env.DB };
                return [4 /*yield*/, createNotification(c.env.DB, otherTeamId, "transfer", "\uD83D\uDD04 Protinab\u00EDdka za ".concat(pName), "".concat((_d = counterTeam === null || counterTeam === void 0 ? void 0 : counterTeam.name) !== null && _d !== void 0 ? _d : "Klub", " poslal protinab\u00EDdku ").concat(body.amount.toLocaleString("cs-CZ"), " K\u010D").concat(body.message ? ": \u201E".concat(body.message, "\"") : "."), "/dashboard/transfers/offer/".concat(offerId), pushEnv)];
            case 12:
                _e.sent();
                return [3 /*break*/, 14];
            case 13:
                e_28 = _e.sent();
                logger_1.logger.warn({ module: "game" }, "counter offer notification", e_28);
                return [3 /*break*/, 14];
            case 14: return [2 /*return*/, c.json({ ok: true })];
        }
    });
}); });
// Předčasné ukončení hostování — hráč se ihned vrací do původního klubu
gameRouter.post("/teams/:teamId/loans/:playerId/terminate", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, playerId, player, ownerTeamId, gameDate, borrower, owner, pName, createTransferNews, role;
    var _a, _b, _c, _d, _e, _f;
    return __generator(this, function (_g) {
        switch (_g.label) {
            case 0:
                teamId = c.req.param("teamId");
                playerId = c.req.param("playerId");
                return [4 /*yield*/, c.env.DB.prepare("SELECT id, first_name, last_name, age, position, team_id, loan_from_team_id FROM players WHERE id = ?").bind(playerId).first()];
            case 1:
                player = _g.sent();
                if (!player)
                    return [2 /*return*/, c.json({ error: "Hráč nenalezen" }, 404)];
                if (player.team_id !== teamId)
                    return [2 /*return*/, c.json({ error: "Hráč není ve tvém klubu" }, 403)];
                if (!player.loan_from_team_id)
                    return [2 /*return*/, c.json({ error: "Hráč není na hostování" }, 400)];
                ownerTeamId = player.loan_from_team_id;
                return [4 /*yield*/, c.env.DB.prepare("SELECT game_date FROM teams WHERE id = ?").bind(teamId).first()];
            case 2:
                gameDate = (_b = (_a = (_g.sent())) === null || _a === void 0 ? void 0 : _a.game_date) !== null && _b !== void 0 ? _b : new Date().toISOString();
                // Vrátit hráče do původního týmu
                return [4 /*yield*/, c.env.DB.prepare("UPDATE players SET team_id = ?, loan_from_team_id = NULL, loan_until = NULL WHERE id = ?")
                        .bind(ownerTeamId, playerId).run()];
            case 3:
                // Vrátit hráče do původního týmu
                _g.sent();
                // Uzavřít loan kontrakt
                return [4 /*yield*/, c.env.DB.prepare("UPDATE player_contracts SET is_active = 0, left_at = ?, leave_type = 'loan_terminated' WHERE player_id = ? AND team_id = ? AND is_active = 1")
                        .bind(gameDate, playerId, teamId).run()
                        .catch(function (e) { return logger_1.logger.warn({ module: "game" }, "close loan contract failed", e); })];
            case 4:
                // Uzavřít loan kontrakt
                _g.sent();
                // Update commute + reset squad number
                return [4 /*yield*/, onPlayerTransferred(c.env.DB, playerId, ownerTeamId)];
            case 5:
                // Update commute + reset squad number
                _g.sent();
                return [4 /*yield*/, c.env.DB.prepare("SELECT name FROM teams WHERE id = ?").bind(teamId).first()];
            case 6:
                borrower = _g.sent();
                return [4 /*yield*/, c.env.DB.prepare("SELECT name, league_id FROM teams WHERE id = ?").bind(ownerTeamId).first()];
            case 7:
                owner = _g.sent();
                pName = "".concat(player.first_name, " ").concat(player.last_name);
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../transfers/transfer-news"); })];
            case 8:
                createTransferNews = (_g.sent()).createTransferNews;
                return [4 /*yield*/, createTransferNews(c.env.DB, (_c = owner === null || owner === void 0 ? void 0 : owner.league_id) !== null && _c !== void 0 ? _c : "", null, "loan_return", {
                        playerName: pName, playerAge: player.age,
                        playerPosition: player.position, teamName: (_d = owner === null || owner === void 0 ? void 0 : owner.name) !== null && _d !== void 0 ? _d : "",
                        fromTeamName: borrower === null || borrower === void 0 ? void 0 : borrower.name, toTeamName: owner === null || owner === void 0 ? void 0 : owner.name, fee: 0,
                    }).catch(function (e) { return logger_1.logger.warn({ module: "game" }, "create loan return news", e); })];
            case 9:
                _g.sent();
                role = "Sportovní ředitel";
                return [4 /*yield*/, sendPhoneSMS(c.env.DB, teamId, role, role, "\uD83D\uDCE4 Hostov\u00E1n\u00ED ".concat(pName, " bylo p\u0159ed\u010Dasn\u011B ukon\u010Deno. Hr\u00E1\u010D se vr\u00E1til do ").concat((_e = owner === null || owner === void 0 ? void 0 : owner.name) !== null && _e !== void 0 ? _e : "původního klubu", ".")).catch(function (e) { return logger_1.logger.warn({ module: "game" }, "db op failed", e); })];
            case 10:
                _g.sent();
                return [4 /*yield*/, sendPhoneSMS(c.env.DB, ownerTeamId, role, role, "\uD83D\uDCE5 ".concat((_f = borrower === null || borrower === void 0 ? void 0 : borrower.name) !== null && _f !== void 0 ? _f : "Klub", " p\u0159ed\u010Dasn\u011B ukon\u010Dil hostov\u00E1n\u00ED ").concat(pName, ". Hr\u00E1\u010D je zp\u011Bt u tebe.")).catch(function (e) { return logger_1.logger.warn({ module: "game" }, "db op failed", e); })];
            case 11:
                _g.sent();
                return [2 /*return*/, c.json({ ok: true })];
        }
    });
}); });
gameRouter.delete("/teams/:teamId/offers/:offerId", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, offerId, body, withdrawMessage, result, offer, otherTeamId, initiatorIsBuyer, player, initiatorTeam, pName, verb, createNotification, pushEnv, e_29;
    var _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                teamId = c.req.param("teamId");
                offerId = c.req.param("offerId");
                return [4 /*yield*/, c.req.json().catch(function () { return ({}); })];
            case 1:
                body = _c.sent();
                withdrawMessage = (_a = body.message) !== null && _a !== void 0 ? _a : null;
                return [4 /*yield*/, c.env.DB.prepare("UPDATE transfer_offers SET status = 'withdrawn', resolved_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ? AND (from_team_id = ? OR to_team_id = ?) AND status IN ('pending','countered')").bind(offerId, teamId, teamId).run()];
            case 2:
                result = _c.sent();
                if (result.meta.changes === 0) {
                    return [2 /*return*/, c.json({ error: "Jednání nelze ukončit (nejsi součástí nebo už je vyřešené)" }, 409)];
                }
                return [4 /*yield*/, c.env.DB.prepare("INSERT INTO transfer_offer_events (id, offer_id, team_id, event_type, amount, message) VALUES (?, ?, ?, 'withdraw', NULL, ?)")
                        .bind(crypto.randomUUID(), offerId, teamId, withdrawMessage).run()
                        .catch(function (e) { return logger_1.logger.warn({ module: "game" }, "insert withdraw event", e); })];
            case 3:
                _c.sent();
                return [4 /*yield*/, c.env.DB.prepare("SELECT player_id, from_team_id, to_team_id FROM transfer_offers WHERE id = ?")
                        .bind(offerId).first()
                        .catch(function (e) { logger_1.logger.warn({ module: "game" }, "fetch offer for withdraw notif", e); return null; })];
            case 4:
                offer = _c.sent();
                if (!(offer && offer.from_team_id !== "virtual_ai")) return [3 /*break*/, 11];
                otherTeamId = teamId === offer.from_team_id ? offer.to_team_id : offer.from_team_id;
                initiatorIsBuyer = teamId === offer.from_team_id;
                return [4 /*yield*/, c.env.DB.prepare("SELECT first_name, last_name FROM players WHERE id = ?").bind(offer.player_id).first()
                        .catch(function (e) { logger_1.logger.warn({ module: "game" }, "player for withdraw", e); return null; })];
            case 5:
                player = _c.sent();
                return [4 /*yield*/, c.env.DB.prepare("SELECT name FROM teams WHERE id = ?").bind(teamId).first()
                        .catch(function (e) { logger_1.logger.warn({ module: "game" }, "initiator team for withdraw", e); return null; })];
            case 6:
                initiatorTeam = _c.sent();
                pName = player ? "".concat(player.first_name, " ").concat(player.last_name) : "hráče";
                verb = initiatorIsBuyer ? "stáhl nabídku" : "ukončil jednání";
                _c.label = 7;
            case 7:
                _c.trys.push([7, 10, , 11]);
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../community/notifications"); })];
            case 8:
                createNotification = (_c.sent()).createNotification;
                pushEnv = { VAPID_PUBLIC_KEY: c.env.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: c.env.VAPID_PRIVATE_KEY, VAPID_SUBJECT: c.env.VAPID_SUBJECT, DB: c.env.DB };
                return [4 /*yield*/, createNotification(c.env.DB, otherTeamId, "transfer", "\u21A9\uFE0F Jedn\u00E1n\u00ED o ".concat(pName, " ukon\u010Deno"), "".concat((_b = initiatorTeam === null || initiatorTeam === void 0 ? void 0 : initiatorTeam.name) !== null && _b !== void 0 ? _b : "Klub", " ").concat(verb).concat(withdrawMessage ? ": \u201E".concat(withdrawMessage, "\"") : "."), "/dashboard/transfers/offer/".concat(offerId), pushEnv)];
            case 9:
                _c.sent();
                return [3 /*break*/, 11];
            case 10:
                e_29 = _c.sent();
                logger_1.logger.warn({ module: "game" }, "withdraw notification", e_29);
                return [3 /*break*/, 11];
            case 11: return [2 /*return*/, c.json({ ok: true })];
        }
    });
}); });
// ── Player offers (organic scouting) ──
// GET /api/teams/:teamId/player-offers — pending offers
gameRouter.get("/teams/:teamId/player-offers", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, offers;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, c.env.DB.prepare("SELECT * FROM player_offers WHERE team_id = ? AND status = 'pending' AND expires_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now') ORDER BY created_at DESC").bind(teamId).all().catch(function () { return ({ results: [] }); })];
            case 1:
                offers = _a.sent();
                return [2 /*return*/, c.json(offers.results.map(function (o) {
                        var _a, _b, _c, _d, _e, _f;
                        return ({
                            id: o.id, source: o.source, sourceName: o.source_name, message: o.message,
                            firstName: o.first_name, lastName: o.last_name, age: o.age, position: o.position,
                            nationality: (_a = o.nationality) !== null && _a !== void 0 ? _a : "CZ",
                            overallRating: o.overall_rating, weeklyWage: o.weekly_wage, expiresAt: o.expires_at,
                            skills: JSON.parse((_b = o.skills) !== null && _b !== void 0 ? _b : "{}"),
                            physical: JSON.parse((_c = o.physical) !== null && _c !== void 0 ? _c : "{}"),
                            personality: JSON.parse((_d = o.personality) !== null && _d !== void 0 ? _d : "{}"),
                            lifeContext: JSON.parse((_e = o.life_context) !== null && _e !== void 0 ? _e : "{}"),
                            avatar: JSON.parse((_f = o.avatar) !== null && _f !== void 0 ? _f : "{}"),
                        });
                    }))];
        }
    });
}); });
// POST /api/teams/:teamId/player-offers/:offerId/accept — sign the offered player
gameRouter.post("/teams/:teamId/player-offers/:offerId/accept", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, offerId, offer, claim, playerId, generateResidence, teamVillage, resRng, res, season, team, newPlayer, playerData;
    var _a, _b, _c, _d, _e, _f, _g;
    return __generator(this, function (_h) {
        switch (_h.label) {
            case 0:
                teamId = c.req.param("teamId");
                offerId = c.req.param("offerId");
                return [4 /*yield*/, c.env.DB.prepare("SELECT * FROM player_offers WHERE id = ? AND team_id = ? AND status = 'pending'")
                        .bind(offerId, teamId).first()];
            case 1:
                offer = _h.sent();
                if (!offer)
                    return [2 /*return*/, c.json({ error: "Nabídka nenalezena" }, 404)];
                return [4 /*yield*/, c.env.DB.prepare("UPDATE player_offers SET status = 'accepted' WHERE id = ? AND team_id = ? AND status = 'pending'")
                        .bind(offerId, teamId).run()];
            case 2:
                claim = _h.sent();
                if (claim.meta.changes === 0) {
                    return [2 /*return*/, c.json({ error: "Nabídka už byla zpracována" }, 409)];
                }
                playerId = crypto.randomUUID();
                return [4 /*yield*/, c.env.DB.prepare("INSERT INTO players (id, team_id, first_name, last_name, nickname, age, position, overall_rating, skills, physical, personality, life_context, avatar, weekly_wage, status, nationality)\n     VALUES (?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)").bind(playerId, teamId, offer.first_name, offer.last_name, offer.age, offer.position, offer.overall_rating, offer.skills, offer.physical, offer.personality, offer.life_context, offer.avatar, offer.weekly_wage, (_a = offer.nationality) !== null && _a !== void 0 ? _a : "CZ").run()];
            case 3:
                _h.sent();
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../generators/residence"); })];
            case 4:
                generateResidence = (_h.sent()).generateResidence;
                return [4 /*yield*/, c.env.DB.prepare("SELECT v.name, v.size, v.district FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?")
                        .bind(teamId).first().catch(function (e) { logger_1.logger.warn({ module: "game" }, "db op failed", e); return null; })];
            case 5:
                teamVillage = _h.sent();
                if (!teamVillage) return [3 /*break*/, 7];
                resRng = (0, rng_1.createRng)((0, rng_1.cryptoSeed)());
                res = generateResidence(resRng, teamVillage.name, teamVillage.size, teamVillage.district);
                return [4 /*yield*/, c.env.DB.prepare("UPDATE players SET residence = ?, commute_km = ? WHERE id = ?")
                        .bind(res.residence, res.commuteKm, playerId).run().catch(function (e) { return logger_1.logger.warn({ module: "game" }, "db op failed", e); })];
            case 6:
                _h.sent();
                _h.label = 7;
            case 7: return [4 /*yield*/, c.env.DB.prepare("SELECT id FROM seasons ORDER BY number DESC LIMIT 1").first().catch(function (e) { logger_1.logger.warn({ module: "game" }, "db op failed", e); return null; })];
            case 8:
                season = _h.sent();
                return [4 /*yield*/, c.env.DB.prepare("INSERT INTO player_contracts (id, player_id, team_id, season_id, join_type, fee, is_active) VALUES (?, ?, ?, ?, ?, 0, 1)")
                        .bind(crypto.randomUUID(), playerId, teamId, (0, season_1.mustSeason)(season === null || season === void 0 ? void 0 : season.id), offer.source).run().catch(function (e) { return logger_1.logger.warn({ module: "game" }, "db op failed", e); })];
            case 9:
                _h.sent();
                return [4 /*yield*/, c.env.DB.prepare("SELECT game_date FROM teams WHERE id = ?").bind(teamId).first().catch(function (e) { logger_1.logger.warn({ module: "game" }, "db op failed", e); return null; })];
            case 10:
                team = _h.sent();
                return [4 /*yield*/, (0, finance_processor_1.recordTransaction)(c.env.DB, teamId, "signing_fee", -500, "Registrace: ".concat(offer.first_name, " ").concat(offer.last_name), (_b = team === null || team === void 0 ? void 0 : team.game_date) !== null && _b !== void 0 ? _b : new Date().toISOString())];
            case 11:
                _h.sent();
                return [4 /*yield*/, c.env.DB.prepare("SELECT * FROM players WHERE id = ?").bind(playerId).first()];
            case 12:
                newPlayer = _h.sent();
                playerData = newPlayer ? __assign(__assign({}, newPlayer), { skills: JSON.parse((_c = newPlayer.skills) !== null && _c !== void 0 ? _c : "{}"), physical: JSON.parse((_d = newPlayer.physical) !== null && _d !== void 0 ? _d : "{}"), personality: JSON.parse((_e = newPlayer.personality) !== null && _e !== void 0 ? _e : "{}"), lifeContext: JSON.parse((_f = newPlayer.life_context) !== null && _f !== void 0 ? _f : "{}"), avatar: JSON.parse((_g = newPlayer.avatar) !== null && _g !== void 0 ? _g : "{}") }) : null;
                return [2 /*return*/, c.json({ ok: true, player: playerData })];
        }
    });
}); });
// POST /api/teams/:teamId/player-offers/:offerId/reject
gameRouter.post("/teams/:teamId/player-offers/:offerId/reject", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var offerId, teamId;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                offerId = c.req.param("offerId");
                teamId = c.req.param("teamId");
                return [4 /*yield*/, c.env.DB.prepare("UPDATE player_offers SET status = 'rejected' WHERE id = ? AND team_id = ?").bind(offerId, teamId).run()];
            case 1:
                _a.sent();
                return [2 /*return*/, c.json({ ok: true })];
        }
    });
}); });
// ── TEMP: Admin — manuální generování player offer pro testování ──
gameRouter.post("/admin/generate-player-offer/:teamId", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, generatePlayerOffer, createRng, team, sizeMap, villageInfo, rng, gameDate, result;
    var _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../events/player-offers"); })];
            case 1:
                generatePlayerOffer = (_c.sent()).generatePlayerOffer;
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../generators/rng"); })];
            case 2:
                createRng = (_c.sent()).createRng;
                return [4 /*yield*/, c.env.DB.prepare("SELECT v.district, v.population, v.size FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?").bind(teamId).first().catch(function (e) { logger_1.logger.warn({ module: "game" }, "admin offer gen", e); return null; })];
            case 3:
                team = _c.sent();
                if (!team)
                    return [2 /*return*/, c.json({ error: "team not found" }, 404)];
                sizeMap = { hamlet: "vesnice", village: "obec", town: "mestys", small_city: "mesto", city: "mesto" };
                villageInfo = {
                    region_code: team.district,
                    category: ((_a = sizeMap[team.size]) !== null && _a !== void 0 ? _a : "obec"),
                    population: (_b = team.population) !== null && _b !== void 0 ? _b : 500,
                    district: team.district,
                };
                rng = createRng((0, rng_1.cryptoSeed)());
                gameDate = new Date().toISOString();
                return [4 /*yield*/, generatePlayerOffer(c.env.DB, rng, teamId, team.district, villageInfo, gameDate)];
            case 4:
                result = _c.sent();
                return [2 /*return*/, c.json({ ok: true, result: result })];
        }
    });
}); });
// ── Coach interviews (Rozhovor kola) ──
// POST /api/admin/regenerate-pending-interviews — smaže všechny pending rozhovory
// a vygeneruje nové se stejnou (league_id, calendar_id, game_week) trojicí.
// Optional body: { groups: [{leagueId, calendarId, gameWeek, count}, ...] } — pokud zadané,
// použije se místo lookupu z DB (užitečné když pending už byly smazány).
gameRouter.post("/admin/regenerate-pending-interviews", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var body, groups, summary, _i, _a, g, del, tryCreateInterviewRequest, regenerated, i, before, after, e_30;
    var _b, _c, _d, _e, _f, _g;
    return __generator(this, function (_h) {
        switch (_h.label) {
            case 0: return [4 /*yield*/, c.req.json().catch(function (e) {
                    logger_1.logger.warn({ module: "game.ts" }, "regen interviews — parse body (může být prázdné)", e);
                    return null;
                })];
            case 1:
                body = _h.sent();
                if (!((_b = body === null || body === void 0 ? void 0 : body.groups) === null || _b === void 0 ? void 0 : _b.length)) return [3 /*break*/, 2];
                groups = {
                    results: body.groups.map(function (g) { return ({
                        league_id: g.leagueId,
                        match_calendar_id: g.calendarId,
                        game_week: g.gameWeek,
                        cnt: g.count,
                    }); }),
                };
                return [3 /*break*/, 4];
            case 2: return [4 /*yield*/, c.env.DB.prepare("SELECT league_id, match_calendar_id, game_week, COUNT(*) as cnt\n       FROM coach_interviews WHERE status = 'pending'\n       GROUP BY league_id, match_calendar_id, game_week").all().catch(function (e) {
                    logger_1.logger.warn({ module: "game.ts" }, "regen interviews — group lookup", e);
                    return { results: [] };
                })];
            case 3:
                groups = _h.sent();
                _h.label = 4;
            case 4:
                summary = [];
                _i = 0, _a = (_c = groups.results) !== null && _c !== void 0 ? _c : [];
                _h.label = 5;
            case 5:
                if (!(_i < _a.length)) return [3 /*break*/, 17];
                g = _a[_i];
                return [4 /*yield*/, c.env.DB.prepare("DELETE FROM coach_interviews WHERE status = 'pending' AND league_id = ? AND match_calendar_id = ? AND game_week = ?").bind(g.league_id, g.match_calendar_id, g.game_week).run().catch(function (e) {
                        logger_1.logger.warn({ module: "game.ts" }, "regen interviews — delete", e);
                        return { meta: { changes: 0 } };
                    })];
            case 6:
                del = _h.sent();
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../news/interview-generator"); })];
            case 7:
                tryCreateInterviewRequest = (_h.sent()).tryCreateInterviewRequest;
                regenerated = 0;
                i = 0;
                _h.label = 8;
            case 8:
                if (!(i < g.cnt)) return [3 /*break*/, 15];
                _h.label = 9;
            case 9:
                _h.trys.push([9, 13, , 14]);
                return [4 /*yield*/, c.env.DB.prepare("SELECT COUNT(*) as cnt FROM coach_interviews WHERE league_id = ? AND match_calendar_id = ?").bind(g.league_id, g.match_calendar_id).first()];
            case 10:
                before = _h.sent();
                return [4 /*yield*/, tryCreateInterviewRequest(c.env.DB, c.env.GEMINI_API_KEY, {
                        leagueId: g.league_id,
                        calendarId: g.match_calendar_id,
                        gameWeek: g.game_week,
                    })];
            case 11:
                _h.sent();
                return [4 /*yield*/, c.env.DB.prepare("SELECT COUNT(*) as cnt FROM coach_interviews WHERE league_id = ? AND match_calendar_id = ?").bind(g.league_id, g.match_calendar_id).first()];
            case 12:
                after = _h.sent();
                if (((_d = after === null || after === void 0 ? void 0 : after.cnt) !== null && _d !== void 0 ? _d : 0) > ((_e = before === null || before === void 0 ? void 0 : before.cnt) !== null && _e !== void 0 ? _e : 0))
                    regenerated++;
                else
                    return [3 /*break*/, 15]; // round-robin už nemá komu přiřadit
                return [3 /*break*/, 14];
            case 13:
                e_30 = _h.sent();
                logger_1.logger.warn({ module: "game.ts" }, "regen interviews — create", e_30);
                return [3 /*break*/, 15];
            case 14:
                i++;
                return [3 /*break*/, 8];
            case 15:
                summary.push({
                    leagueId: g.league_id,
                    calendarId: g.match_calendar_id,
                    gameWeek: g.game_week,
                    deleted: (_g = (_f = del.meta) === null || _f === void 0 ? void 0 : _f.changes) !== null && _g !== void 0 ? _g : 0,
                    regenerated: regenerated,
                });
                _h.label = 16;
            case 16:
                _i++;
                return [3 /*break*/, 5];
            case 17: return [2 /*return*/, c.json({ ok: true, summary: summary })];
        }
    });
}); });
// GET /api/teams/:teamId/coach-interviews — pending interviews (jen ty kde zápas ještě nebyl)
gameRouter.get("/teams/:teamId/coach-interviews", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, rows, interviews;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, c.env.DB.prepare("SELECT ci.* FROM coach_interviews ci\n     LEFT JOIN season_calendar sc ON ci.match_calendar_id = sc.id\n     WHERE ci.team_id = ? AND ci.status = 'pending'\n       AND (ci.match_calendar_id LIKE 'season-%-wrap' OR (sc.id IS NOT NULL AND sc.status NOT IN ('simulated','cancelled')))\n     ORDER BY ci.created_at DESC").bind(teamId).all().catch(function (e) {
                        logger_1.logger.warn({ module: "game.ts" }, "get coach_interviews", e);
                        return { results: [] };
                    })];
            case 1:
                rows = _b.sent();
                interviews = ((_a = rows.results) !== null && _a !== void 0 ? _a : []).map(function (r) { return ({
                    id: r.id,
                    leagueId: r.league_id,
                    teamId: r.team_id,
                    managerId: r.manager_id,
                    matchCalendarId: r.match_calendar_id,
                    gameWeek: r.game_week,
                    questions: (function () { try {
                        return JSON.parse(r.questions);
                    }
                    catch (_a) {
                        return [];
                    } })(),
                    status: r.status,
                    expiresAt: r.expires_at,
                    createdAt: r.created_at,
                }); });
                return [2 /*return*/, c.json({ interviews: interviews })];
        }
    });
}); });
// POST /api/teams/:teamId/coach-interviews/:interviewId/answer — submit answers + generate article
gameRouter.post("/teams/:teamId/coach-interviews/:interviewId/answer", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, interviewId, interview, body, questions, answers, _a, managerRow, calRow, opponentName, qa, isSeasonWrap, article, seasonNumber, generateSeasonInterviewArticle, generateInterviewArticle, newsId, managerAvatar, newsBody, humanTeams, msgBody, _i, humanTeams_1, t, e_31;
    var _b, _c, _d;
    return __generator(this, function (_e) {
        switch (_e.label) {
            case 0:
                teamId = c.req.param("teamId");
                interviewId = c.req.param("interviewId");
                return [4 /*yield*/, c.env.DB.prepare("SELECT * FROM coach_interviews WHERE id = ? AND team_id = ? AND status = 'pending'").bind(interviewId, teamId).first().catch(function (e) {
                        logger_1.logger.warn({ module: "game.ts" }, "get interview for answer", e);
                        return null;
                    })];
            case 1:
                interview = _e.sent();
                if (!interview)
                    return [2 /*return*/, c.json({ error: "Rozhovor nenalezen nebo již zpracován" }, 404)];
                return [4 /*yield*/, c.req.json().catch(function (e) { logger_1.logger.warn({ module: "game.ts" }, "parse interview answer body", e); return null; })];
            case 2:
                body = _e.sent();
                if (!((_b = body === null || body === void 0 ? void 0 : body.answers) === null || _b === void 0 ? void 0 : _b.length))
                    return [2 /*return*/, c.json({ error: "Chybí odpovědi" }, 400)];
                questions = (function () {
                    try {
                        return JSON.parse(interview.questions);
                    }
                    catch (_a) {
                        return [];
                    }
                })();
                if (body.answers.length !== questions.length) {
                    return [2 /*return*/, c.json({ error: "O\u010Dek\u00E1v\u00E1no ".concat(questions.length, " odpov\u011Bd\u00ED, dost\u00E1no ").concat(body.answers.length) }, 400)];
                }
                answers = body.answers.map(function (a) { return String(a).slice(0, 500).trim(); });
                // KROK 1: Okamžitě ulož odpovědi před Gemini — odpovědi se neztratí při selhání generování
                return [4 /*yield*/, c.env.DB.prepare("UPDATE coach_interviews SET status = 'answered', answers = ? WHERE id = ?").bind(JSON.stringify(answers), interviewId)
                        .run()
                        .catch(function (e) { logger_1.logger.warn({ module: "game.ts" }, "save interview answers", e); })];
            case 3:
                // KROK 1: Okamžitě ulož odpovědi před Gemini — odpovědi se neztratí při selhání generování
                _e.sent();
                return [4 /*yield*/, Promise.all([
                        c.env.DB.prepare("SELECT m.name as manager_name, m.avatar as manager_avatar, t.name as team_name, t.league_id FROM managers m JOIN teams t ON t.id = m.team_id WHERE m.team_id = ?").bind(teamId).first()
                            .catch(function (e) { logger_1.logger.warn({ module: "game.ts" }, "load manager for interview article", e); return null; }),
                        c.env.DB.prepare("SELECT m.home_team_id, m.away_team_id, ht.name as home_name, at.name as away_name\n       FROM matches m\n       JOIN teams ht ON m.home_team_id = ht.id\n       JOIN teams at ON m.away_team_id = at.id\n       WHERE m.calendar_id = ? AND (m.home_team_id = ? OR m.away_team_id = ?) LIMIT 1").bind(interview.match_calendar_id, teamId, teamId)
                            .first()
                            .catch(function (e) { logger_1.logger.warn({ module: "game.ts" }, "load match for interview article", e); return null; }),
                    ])];
            case 4:
                _a = _e.sent(), managerRow = _a[0], calRow = _a[1];
                if (!managerRow) {
                    logger_1.logger.warn({ module: "game.ts", teamId: teamId }, "manager not found, answers saved but article skipped");
                    return [2 /*return*/, c.json({ ok: true, articlePending: true })];
                }
                opponentName = calRow
                    ? (calRow.home_team_id === teamId ? calRow.away_name : calRow.home_name)
                    : "soupeř";
                qa = questions.map(function (q, i) { var _a; return ({ q: q, a: (_a = answers[i]) !== null && _a !== void 0 ? _a : "" }); });
                isSeasonWrap = String((_c = interview.match_calendar_id) !== null && _c !== void 0 ? _c : "").includes("-wrap");
                if (!isSeasonWrap) return [3 /*break*/, 7];
                seasonNumber = Math.max(1, Math.round(Number((_d = interview.game_week) !== null && _d !== void 0 ? _d : 100) / 100));
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../news/season-interview"); })];
            case 5:
                generateSeasonInterviewArticle = (_e.sent()).generateSeasonInterviewArticle;
                return [4 /*yield*/, generateSeasonInterviewArticle(c.env.GEMINI_API_KEY, qa, managerRow.manager_name, managerRow.team_name, seasonNumber)];
            case 6:
                article = _e.sent();
                return [3 /*break*/, 10];
            case 7: return [4 /*yield*/, Promise.resolve().then(function () { return require("../news/interview-generator"); })];
            case 8:
                generateInterviewArticle = (_e.sent()).generateInterviewArticle;
                return [4 /*yield*/, generateInterviewArticle(c.env.GEMINI_API_KEY, qa, managerRow.manager_name, managerRow.team_name, opponentName)];
            case 9:
                article = _e.sent();
                _e.label = 10;
            case 10:
                if (!article) {
                    logger_1.logger.warn({ module: "game.ts", teamId: teamId }, "Gemini failed for interview article, answers saved, will retry");
                    return [2 /*return*/, c.json({ ok: true, articlePending: true })];
                }
                newsId = crypto.randomUUID();
                managerAvatar = (function () {
                    try {
                        return managerRow.manager_avatar ? JSON.parse(managerRow.manager_avatar) : null;
                    }
                    catch (_a) {
                        return null;
                    }
                })();
                newsBody = JSON.stringify({
                    managerName: managerRow.manager_name,
                    managerAvatar: managerAvatar,
                    teamName: managerRow.team_name,
                    article: article.body,
                    qa: qa,
                });
                return [4 /*yield*/, c.env.DB.prepare("INSERT INTO news (id, league_id, team_id, type, headline, body, game_week, created_at) VALUES (?, ?, ?, 'interview', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))").bind(newsId, managerRow.league_id, teamId, article.headline, newsBody, interview.game_week)
                        .run()
                        .catch(function (e) { logger_1.logger.warn({ module: "game.ts" }, "insert interview news", e); })];
            case 11:
                _e.sent();
                return [4 /*yield*/, c.env.DB.prepare("UPDATE coach_interviews SET article_news_id = ? WHERE id = ?").bind(newsId, interviewId)
                        .run()
                        .catch(function (e) { logger_1.logger.warn({ module: "game.ts" }, "update interview article_news_id", e); })];
            case 12:
                _e.sent();
                _e.label = 13;
            case 13:
                _e.trys.push([13, 19, , 20]);
                return [4 /*yield*/, c.env.DB.prepare("SELECT id FROM teams WHERE league_id = ? AND user_id != 'ai' AND id != ?").bind(managerRow.league_id, teamId)
                        .all()
                        .then(function (r) { var _a; return (_a = r.results) !== null && _a !== void 0 ? _a : []; })];
            case 14:
                humanTeams = _e.sent();
                msgBody = "\uD83D\uDCF0 Vy\u0161el nov\u00FD Rozhovor kola: \"".concat(article.headline, "\"");
                _i = 0, humanTeams_1 = humanTeams;
                _e.label = 15;
            case 15:
                if (!(_i < humanTeams_1.length)) return [3 /*break*/, 18];
                t = humanTeams_1[_i];
                return [4 /*yield*/, sendPhoneSMS(c.env.DB, t.id, "Redakce Zpravodaje", "Redakce Zpravodaje", msgBody)
                        .catch(function (e) { return logger_1.logger.warn({ module: "game.ts" }, "interview notify team", e); })];
            case 16:
                _e.sent();
                _e.label = 17;
            case 17:
                _i++;
                return [3 /*break*/, 15];
            case 18: return [3 /*break*/, 20];
            case 19:
                e_31 = _e.sent();
                logger_1.logger.warn({ module: "game.ts" }, "interview league notifications", e_31);
                return [3 /*break*/, 20];
            case 20:
                logger_1.logger.info({ module: "game.ts", teamId: teamId }, "interview answered -> article ".concat(newsId));
                return [2 /*return*/, c.json({ ok: true, articleId: newsId })];
        }
    });
}); });
// POST /api/teams/:teamId/coach-interviews/:interviewId/decline — odmítnutí rozhovoru
gameRouter.post("/teams/:teamId/coach-interviews/:interviewId/decline", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, interviewId;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                teamId = c.req.param("teamId");
                interviewId = c.req.param("interviewId");
                return [4 /*yield*/, c.env.DB.prepare("UPDATE coach_interviews SET status = 'declined' WHERE id = ? AND team_id = ? AND status = 'pending'").bind(interviewId, teamId).run()
                        .catch(function (e) { logger_1.logger.warn({ module: "game.ts" }, "decline interview", e); })];
            case 1:
                _a.sent();
                return [2 /*return*/, c.json({ ok: true })];
        }
    });
}); });
// POST /api/admin/teams/:teamId/generate-interview — dev trigger pro testovani
gameRouter.post("/admin/teams/:teamId/generate-interview", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, nextMatch, tryCreateInterviewRequest;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, c.env.DB.prepare("SELECT sc.id as calendar_id, sc.game_week, sc.scheduled_at, t.league_id\n     FROM season_calendar sc\n     JOIN matches m ON m.calendar_id = sc.id\n     JOIN teams t ON t.id = ?\n     WHERE (m.home_team_id = ? OR m.away_team_id = ?)\n       AND sc.scheduled_at > datetime('now')\n       AND sc.status = 'scheduled'\n     ORDER BY sc.scheduled_at ASC LIMIT 1").bind(teamId, teamId, teamId)
                        .first()
                        .catch(function (e) { logger_1.logger.warn({ module: "game.ts" }, "admin generate-interview lookup", e); return null; })];
            case 1:
                nextMatch = _a.sent();
                if (!nextMatch)
                    return [2 /*return*/, c.json({ error: "Zadny nadchazejici zapas" }, 404)];
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../news/interview-generator"); })];
            case 2:
                tryCreateInterviewRequest = (_a.sent()).tryCreateInterviewRequest;
                return [4 /*yield*/, tryCreateInterviewRequest(c.env.DB, c.env.GEMINI_API_KEY, {
                        leagueId: nextMatch.league_id,
                        calendarId: nextMatch.calendar_id,
                        gameWeek: nextMatch.game_week,
                    })];
            case 3:
                _a.sent();
                return [2 /*return*/, c.json({ ok: true, calendarId: nextMatch.calendar_id, gameWeek: nextMatch.game_week })];
        }
    });
}); });
// POST /api/admin/leagues/:leagueId/generate-matchday-preview — dev trigger
gameRouter.post("/admin/leagues/:leagueId/generate-matchday-preview", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var leagueId, nextCal, generateMatchdayPreview;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                leagueId = c.req.param("leagueId");
                return [4 /*yield*/, c.env.DB.prepare("SELECT id, game_week, scheduled_at FROM season_calendar\n     WHERE league_id = ? AND status = 'scheduled'\n     ORDER BY scheduled_at ASC LIMIT 1").bind(leagueId)
                        .first()
                        .catch(function (e) { logger_1.logger.warn({ module: "game.ts" }, "admin matchday-preview lookup", e); return null; })];
            case 1:
                nextCal = _a.sent();
                if (!nextCal)
                    return [2 /*return*/, c.json({ error: "Žádné nadcházející kolo v této lize" }, 404)];
                if (!c.env.GEMINI_API_KEY)
                    return [2 /*return*/, c.json({ error: "GEMINI_API_KEY není nastaven" }, 500)];
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../news/matchday-preview"); })];
            case 2:
                generateMatchdayPreview = (_a.sent()).generateMatchdayPreview;
                return [4 /*yield*/, generateMatchdayPreview(c.env.DB, c.env.GEMINI_API_KEY, leagueId, nextCal.id)];
            case 3:
                _a.sent();
                return [2 /*return*/, c.json({ ok: true, calendarId: nextCal.id, gameWeek: nextCal.game_week, scheduledAt: nextCal.scheduled_at })];
        }
    });
}); });
// POST /api/admin/generate-round-summary?calendarId=X — dev trigger pro Hráče+Trenéra kola
gameRouter.post("/admin/generate-round-summary", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var calendarId, generateRoundSummary, result;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                calendarId = c.req.query("calendarId");
                if (!calendarId)
                    return [2 /*return*/, c.json({ error: "calendarId query parameter required" }, 400)];
                if (!c.env.GEMINI_API_KEY)
                    return [2 /*return*/, c.json({ error: "GEMINI_API_KEY není nastaven" }, 503)];
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../news/round-summary"); })];
            case 1:
                generateRoundSummary = (_a.sent()).generateRoundSummary;
                return [4 /*yield*/, generateRoundSummary(c.env.DB, c.env.GEMINI_API_KEY, calendarId)];
            case 2:
                result = _a.sent();
                return [2 /*return*/, c.json(__assign({ ok: true }, result))];
        }
    });
}); });
// POST /api/admin/generate-ultras-report?calendarId=X — dev trigger rubriky Prales Ultras
gameRouter.post("/admin/generate-ultras-report", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var calendarId, generateUltrasReport, result;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                calendarId = c.req.query("calendarId");
                if (!calendarId)
                    return [2 /*return*/, c.json({ error: "calendarId query parameter required" }, 400)];
                if (!c.env.GEMINI_API_KEY)
                    return [2 /*return*/, c.json({ error: "GEMINI_API_KEY není nastaven" }, 503)];
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../news/ultras-report"); })];
            case 1:
                generateUltrasReport = (_a.sent()).generateUltrasReport;
                return [4 /*yield*/, generateUltrasReport(c.env.DB, c.env.GEMINI_API_KEY, calendarId)];
            case 2:
                result = _a.sent();
                return [2 /*return*/, c.json(__assign({ ok: true }, result))];
        }
    });
}); });
// POST /api/admin/generate-player-interview?calendarId=X — dev trigger pro Rozhovor s hráčem
gameRouter.post("/admin/generate-player-interview", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var calendarId, generatePlayerInterview, result;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                calendarId = c.req.query("calendarId");
                if (!calendarId)
                    return [2 /*return*/, c.json({ error: "calendarId query parameter required" }, 400)];
                if (!c.env.GEMINI_API_KEY)
                    return [2 /*return*/, c.json({ error: "GEMINI_API_KEY není nastaven" }, 503)];
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../news/player-interview"); })];
            case 1:
                generatePlayerInterview = (_a.sent()).generatePlayerInterview;
                return [4 /*yield*/, generatePlayerInterview(c.env.DB, c.env.GEMINI_API_KEY, calendarId)];
            case 2:
                result = _a.sent();
                return [2 /*return*/, c.json(__assign({ ok: true }, result))];
        }
    });
}); });
// POST /api/admin/teams/:teamId/grant-budget — admin korekce rozpočtu (refundy apod.)
// Body: { amount: number, reason: string }. Jde přes recordTransaction (audit + balance_after).
gameRouter.post("/admin/teams/:teamId/grant-budget", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, body, team, recordTransaction, balanceAfter;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, c.req.json().catch(function (e) {
                        logger_1.logger.warn({ module: "game.ts" }, "parse grant-budget body", e);
                        return null;
                    })];
            case 1:
                body = _b.sent();
                if (!body || typeof body.amount !== "number" || body.amount === 0) {
                    return [2 /*return*/, c.json({ error: "amount (nenulové číslo) je povinné" }, 400)];
                }
                return [4 /*yield*/, c.env.DB.prepare("SELECT game_date FROM teams WHERE id = ?")
                        .bind(teamId).first()];
            case 2:
                team = _b.sent();
                if (!team)
                    return [2 /*return*/, c.json({ error: "Tým nenalezen" }, 404)];
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../season/finance-processor"); })];
            case 3:
                recordTransaction = (_b.sent()).recordTransaction;
                return [4 /*yield*/, recordTransaction(c.env.DB, teamId, "other", body.amount, (_a = body.reason) !== null && _a !== void 0 ? _a : "Admin korekce rozpočtu", team.game_date)];
            case 4:
                balanceAfter = _b.sent();
                return [2 /*return*/, c.json({ ok: true, teamId: teamId, amount: body.amount, balanceAfter: balanceAfter })];
        }
    });
}); });
// POST /api/admin/end-season?force=1 — GLOBÁLNÍ chunkovaná orchestrace konce sezóny.
// Zakončí celý ročník napříč všemi senior ligami + založí nový globální ročník.
// Volat OPAKOVANĚ dokud allDone=true (admin tlačítko / curl loop). Jedna jednotka práce/invokaci.
gameRouter.post("/admin/end-season", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var force, runEndSeasonStep, result;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                force = c.req.query("force") === "1";
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../season/end-season"); })];
            case 1:
                runEndSeasonStep = (_a.sent()).runEndSeasonStep;
                return [4 /*yield*/, runEndSeasonStep(c.env.DB, c.env.GEMINI_API_KEY, { force: force })];
            case 2:
                result = _a.sent();
                return [2 /*return*/, c.json(result)];
        }
    });
}); });
// GET /api/season-history — archiv všech sezón (síň slávy) pro stránku Historie.
gameRouter.get("/season-history", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var rows, safeParse, history;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, c.env.DB.prepare("SELECT lh.id, lh.league_id, lh.season_number, lh.final_standings, lh.awards, lh.season_stats, lh.created_at, l.name AS league_name\n     FROM league_history lh JOIN leagues l ON l.id = lh.league_id\n     ORDER BY lh.season_number DESC, l.name ASC").all().catch(function (e) { logger_1.logger.warn({ module: "game.ts" }, "load season history", e); return { results: [] }; })];
            case 1:
                rows = _a.sent();
                safeParse = function (v) { try {
                    return v ? JSON.parse(v) : null;
                }
                catch (_a) {
                    return null;
                } };
                history = rows.results.map(function (r) { return ({
                    id: r.id, leagueId: r.league_id, leagueName: r.league_name, seasonNumber: r.season_number,
                    finalStandings: safeParse(r.final_standings), awards: safeParse(r.awards), seasonStats: safeParse(r.season_stats),
                    createdAt: r.created_at,
                }); });
                return [2 /*return*/, c.json({ history: history })];
        }
    });
}); });
// GET /api/teams/:teamId/trophies — trofeje klubu (ownership-guarded prefixem /teams/:teamId/*).
gameRouter.get("/teams/:teamId/trophies", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, row, trophies;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, c.env.DB.prepare("SELECT trophies FROM teams WHERE id = ?").bind(teamId).first()
                        .catch(function (e) { logger_1.logger.warn({ module: "game.ts" }, "load trophies", e); return null; })];
            case 1:
                row = _b.sent();
                trophies = [];
                try {
                    trophies = JSON.parse((_a = row === null || row === void 0 ? void 0 : row.trophies) !== null && _a !== void 0 ? _a : "[]");
                }
                catch (_c) {
                    trophies = [];
                }
                return [2 /*return*/, c.json({ trophies: trophies })];
        }
    });
}); });
// GET /api/teams/:teamId/season-recap — nepřečtený přehled konce sezóny (nebo null).
gameRouter.get("/teams/:teamId/season-recap", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, row, data;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, c.env.DB.prepare("SELECT season_number, data FROM season_recap WHERE team_id = ? AND seen = 0 ORDER BY season_number DESC LIMIT 1").bind(teamId).first()
                        .catch(function (e) { logger_1.logger.warn({ module: "game.ts" }, "load season recap", e); return null; })];
            case 1:
                row = _a.sent();
                if (!row)
                    return [2 /*return*/, c.json({ recap: null })];
                data = null;
                try {
                    data = JSON.parse(row.data);
                }
                catch (e) {
                    logger_1.logger.warn({ module: "game.ts" }, "parse recap data", e);
                }
                // Neúplný recap (jen "departures" snapshot z fáze departures, bez champion/awards/seasonStats)
                // se nikdy nesmí servírovat na FE — /season-end očekává plný recap a bez těch polí spadne.
                // Vzniká např. u AI týmu, který dohrál sezónu a NIKDY neprošel buildTeamRecap (běží jen pro
                // lidské týmy); po převzetí takového týmu ho nový manažer zdědí. Ber ho jako neexistující.
                if (!data || !data.champion || !data.awards || !data.seasonStats) {
                    return [2 /*return*/, c.json({ recap: null })];
                }
                return [2 /*return*/, c.json({ recap: data, seasonNumber: row.season_number })];
        }
    });
}); });
// POST /api/teams/:teamId/season-recap/dismiss — manažer viděl recap.
gameRouter.post("/teams/:teamId/season-recap/dismiss", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, c.env.DB.prepare("UPDATE season_recap SET seen = 1 WHERE team_id = ? AND seen = 0").bind(teamId).run()
                        .catch(function (e) { return logger_1.logger.warn({ module: "game.ts" }, "dismiss season recap", e); })];
            case 1:
                _a.sent();
                return [2 /*return*/, c.json({ ok: true })];
        }
    });
}); });
// GET /api/teams/:teamId/season-welcome — uvítání do nové sezóny (novinky + co tě čeká), pokud ještě nebylo viděno.
gameRouter.get("/teams/:teamId/season-welcome", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, w, seasonNumber, team, firstMatch, squad, cup, cupRow, mine, big, real, news;
    var _a, _b, _c, _d, _e, _f, _g;
    return __generator(this, function (_h) {
        switch (_h.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, c.env.DB.prepare("SELECT season_number FROM season_welcome WHERE team_id = ? AND seen = 0 ORDER BY season_number DESC LIMIT 1")
                        .bind(teamId).first()
                        .catch(function (e) { logger_1.logger.warn({ module: "game.ts" }, "load season welcome", e); return null; })];
            case 1:
                w = _h.sent();
                if (!w)
                    return [2 /*return*/, c.json(null)];
                seasonNumber = w.season_number;
                return [4 /*yield*/, c.env.DB.prepare("SELECT name FROM teams WHERE id = ?").bind(teamId).first()
                        .catch(function (e) { logger_1.logger.warn({ module: "game.ts" }, "welcome team", e); return null; })];
            case 2:
                team = _h.sent();
                return [4 /*yield*/, c.env.DB.prepare("SELECT MIN(sc.scheduled_at) AS d FROM season_calendar sc JOIN matches m ON m.calendar_id = sc.id WHERE (m.home_team_id = ? OR m.away_team_id = ?) AND m.status = 'scheduled' AND sc.season_number = ?").bind(teamId, teamId, seasonNumber).first().catch(function (e) { logger_1.logger.warn({ module: "game.ts" }, "welcome first match", e); return null; })];
            case 3:
                firstMatch = _h.sent();
                return [4 /*yield*/, c.env.DB.prepare("SELECT COUNT(*) AS c FROM players WHERE team_id = ? AND (status IS NULL OR status != 'released')").bind(teamId).first()
                        .catch(function (e) { logger_1.logger.warn({ module: "game.ts" }, "welcome squad", e); return null; })];
            case 4:
                squad = _h.sent();
                cup = null;
                return [4 /*yield*/, c.env.DB.prepare("SELECT id, name, total_rounds FROM cup_competitions WHERE season_number = ? AND status = 'active' LIMIT 1").bind(seasonNumber).first()
                        .catch(function (e) { logger_1.logger.warn({ module: "game.ts" }, "welcome cup", e); return null; })];
            case 5:
                cupRow = _h.sent();
                if (!cupRow) return [3 /*break*/, 9];
                return [4 /*yield*/, c.env.DB.prepare("SELECT strength FROM cup_teams WHERE cup_id = ? AND team_id = ?").bind(cupRow.id, teamId).first().catch(function (e) { logger_1.logger.warn({ module: "game.ts" }, "welcome cup mine", e); return null; })];
            case 6:
                mine = _h.sent();
                return [4 /*yield*/, c.env.DB.prepare("SELECT MIN(strength) mn, MAX(strength) mx FROM cup_teams WHERE cup_id = ? AND is_big_club = 1").bind(cupRow.id).first().catch(function (e) { logger_1.logger.warn({ module: "game.ts" }, "welcome cup big", e); return null; })];
            case 7:
                big = _h.sent();
                return [4 /*yield*/, c.env.DB.prepare("SELECT ROUND(AVG(strength)) a FROM cup_teams WHERE cup_id = ? AND is_big_club = 0").bind(cupRow.id).first().catch(function (e) { logger_1.logger.warn({ module: "game.ts" }, "welcome cup real", e); return null; })];
            case 8:
                real = _h.sent();
                cup = { name: cupRow.name, rounds: cupRow.total_rounds, myStrength: (_a = mine === null || mine === void 0 ? void 0 : mine.strength) !== null && _a !== void 0 ? _a : null, bigMin: (_b = big === null || big === void 0 ? void 0 : big.mn) !== null && _b !== void 0 ? _b : 0, bigMax: (_c = big === null || big === void 0 ? void 0 : big.mx) !== null && _c !== void 0 ? _c : 0, realAvg: (_d = real === null || real === void 0 ? void 0 : real.a) !== null && _d !== void 0 ? _d : 0 };
                _h.label = 9;
            case 9:
                news = seasonNumber === 2 ? [
                    { icon: "🏆", title: "Celorepublikový pohár", text: "Nově hraješ i pohár — 128 týmů, vyřazovací pavouk. Los je náhodný, můžeš narazit i na velkoklub." },
                    { icon: "🌦️", title: "Počasí rozhoduje", text: "Déšť, sníh a vítr mění hru — horší technika, víc soubojů, míň diváků i míň vypitého piva." },
                    { icon: "🧢", title: "Kabina žije", text: "Tahoun drží partu a zvedá morálku, potížista dělá dusno. Rivalové v kádru se hádají, kámoši od piva táhnou spolu." },
                    { icon: "🌍", title: "Cizinci na trhu", text: "Na trhu potkáš Slováky, Ukrajince, Vietnamce i Romy — s vlastními jmény a vzhledem." },
                    { icon: "📅", title: "Pevné hrací dny", text: "Liga se hraje v pondělí a čtvrtek, pohár v sobotu." },
                ] : [];
                return [2 /*return*/, c.json({
                        seasonNumber: seasonNumber,
                        teamName: (_e = team === null || team === void 0 ? void 0 : team.name) !== null && _e !== void 0 ? _e : "",
                        firstMatch: (_f = firstMatch === null || firstMatch === void 0 ? void 0 : firstMatch.d) !== null && _f !== void 0 ? _f : null,
                        squadSize: (_g = squad === null || squad === void 0 ? void 0 : squad.c) !== null && _g !== void 0 ? _g : 0,
                        cup: cup,
                        news: news,
                    })];
        }
    });
}); });
// POST /api/teams/:teamId/season-welcome/dismiss
gameRouter.post("/teams/:teamId/season-welcome/dismiss", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, c.env.DB.prepare("UPDATE season_welcome SET seen = 1 WHERE team_id = ? AND seen = 0").bind(teamId).run()
                        .catch(function (e) { return logger_1.logger.warn({ module: "game.ts" }, "dismiss season welcome", e); })];
            case 1:
                _a.sent();
                return [2 /*return*/, c.json({ ok: true })];
        }
    });
}); });
// POST /api/teams/:teamId/season-recap/decide — manažer rozhodl souboje „kdo zůstane".
// Body: { leaving: string[] } — ID hráčů, kteří odejdou (poražení v duelech). Validuje proti staged duelům.
gameRouter.post("/teams/:teamId/season-recap/decide", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, body, leaving, row, data, duels, byId_1, _i, duels_1, d, toRemove, removePlayer, removed, _a, toRemove_1, id, info, r;
    var _b, _c;
    return __generator(this, function (_d) {
        switch (_d.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, c.req.json().catch(function (e) { logger_1.logger.warn({ module: "game.ts" }, "parse decide body", e); return null; })];
            case 1:
                body = _d.sent();
                leaving = Array.isArray(body === null || body === void 0 ? void 0 : body.leaving) ? body.leaving : [];
                return [4 /*yield*/, c.env.DB.prepare("SELECT season_number, data FROM season_recap WHERE team_id = ? AND seen = 0 ORDER BY season_number DESC LIMIT 1")
                        .bind(teamId).first()
                        .catch(function (e) { logger_1.logger.warn({ module: "game.ts" }, "load recap for decide", e); return null; })];
            case 2:
                row = _d.sent();
                if (!row)
                    return [2 /*return*/, c.json({ error: "Recap nenalezen" }, 404)];
                data = {};
                try {
                    data = JSON.parse(row.data);
                }
                catch (e) {
                    logger_1.logger.warn({ module: "game.ts" }, "parse recap data for decide", e);
                }
                duels = (_c = (_b = data === null || data === void 0 ? void 0 : data.decision) === null || _b === void 0 ? void 0 : _b.duels) !== null && _c !== void 0 ? _c : [];
                if (!(duels.length > 0)) return [3 /*break*/, 8];
                byId_1 = new Map();
                for (_i = 0, duels_1 = duels; _i < duels_1.length; _i++) {
                    d = duels_1[_i];
                    byId_1.set(d.a.playerId, d.a);
                    byId_1.set(d.b.playerId, d.b);
                }
                toRemove = leaving.filter(function (id) { return byId_1.has(id); }).slice(0, duels.length);
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../transfers/remove-player"); })];
            case 3:
                removePlayer = (_d.sent()).removePlayer;
                removed = [];
                _a = 0, toRemove_1 = toRemove;
                _d.label = 4;
            case 4:
                if (!(_a < toRemove_1.length)) return [3 /*break*/, 7];
                id = toRemove_1[_a];
                info = byId_1.get(id);
                return [4 /*yield*/, removePlayer(c.env.DB, id, "quit", { toFreeAgent: false, teamId: teamId })];
            case 5:
                r = _d.sent();
                if (r.ok)
                    removed.push({ name: info.name, age: info.age, position: info.position, overallRating: info.overallRating, kind: "decision", reason: "Trenér se rozhodl dát mu sbohem." });
                _d.label = 6;
            case 6:
                _a++;
                return [3 /*break*/, 4];
            case 7:
                data.decision = null;
                data.departures = removed;
                _d.label = 8;
            case 8: return [4 /*yield*/, c.env.DB.prepare("UPDATE season_recap SET data = ?, seen = 1 WHERE team_id = ? AND season_number = ?")
                    .bind(JSON.stringify(data), teamId, row.season_number).run()
                    .catch(function (e) { return logger_1.logger.warn({ module: "game.ts" }, "update recap after decide", e); })];
            case 9:
                _d.sent();
                return [2 /*return*/, c.json({ ok: true })];
        }
    });
}); });
// POST /api/teams/:teamId/season-recap/party — proslov trenéra na závěrečné.
// Body: { tone: 'pokorny'|'chvastavy'|'nemuzu'|'opily' } → dopad na morálku kádru, přízeň vesnice, reputaci.
var PARTY_TONE_FX = {
    pokorny: { morale: 4, favor: 4, rep: 1 },
    chvastavy: { morale: 5, favor: -3, rep: 0 },
    nemuzu: { morale: -5, favor: -4, rep: -1 },
    opily: { morale: 2, favor: 5, rep: -1 },
};
gameRouter.post("/teams/:teamId/season-recap/party", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, body, fx, row, data;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, c.req.json().catch(function (e) { logger_1.logger.warn({ module: "game.ts" }, "parse party body", e); return null; })];
            case 1:
                body = _b.sent();
                fx = (body === null || body === void 0 ? void 0 : body.tone) ? PARTY_TONE_FX[body.tone] : null;
                if (!fx)
                    return [2 /*return*/, c.json({ error: "Neznámý tón proslovu" }, 400)];
                return [4 /*yield*/, c.env.DB.prepare("SELECT season_number, data FROM season_recap WHERE team_id = ? AND seen = 0 ORDER BY season_number DESC LIMIT 1")
                        .bind(teamId).first()
                        .catch(function (e) { logger_1.logger.warn({ module: "game.ts" }, "load recap for party", e); return null; })];
            case 2:
                row = _b.sent();
                if (!row)
                    return [2 /*return*/, c.json({ error: "Recap nenalezen" }, 404)];
                data = {};
                try {
                    data = JSON.parse(row.data);
                }
                catch (e) {
                    logger_1.logger.warn({ module: "game.ts" }, "parse recap data for party", e);
                }
                if ((_a = data === null || data === void 0 ? void 0 : data.party) === null || _a === void 0 ? void 0 : _a.appliedTone)
                    return [2 /*return*/, c.json({ ok: true, already: true })]; // jen jednou
                // Dopady (clamp), každý nekritický
                return [4 /*yield*/, c.env.DB.prepare("UPDATE players SET life_context = json_set(COALESCE(life_context,'{}'), '$.morale', MAX(0, MIN(100, COALESCE(json_extract(life_context,'$.morale'),50) + ?))) WHERE team_id = ? AND status = 'active'").bind(fx.morale, teamId).run().catch(function (e) { return logger_1.logger.warn({ module: "game.ts" }, "party morale", e); })];
            case 3:
                // Dopady (clamp), každý nekritický
                _b.sent();
                return [4 /*yield*/, c.env.DB.prepare("UPDATE village_team_favor SET favor = MAX(0, MIN(100, favor + ?)) WHERE team_id = ? AND official_id IS NULL").bind(fx.favor, teamId).run().catch(function (e) { return logger_1.logger.warn({ module: "game.ts" }, "party favor", e); })];
            case 4:
                _b.sent();
                if (!(fx.rep !== 0)) return [3 /*break*/, 6];
                return [4 /*yield*/, c.env.DB.prepare("UPDATE managers SET reputation = MAX(15, MIN(75, reputation + ?)) WHERE team_id = ?").bind(fx.rep, teamId).run().catch(function (e) { return logger_1.logger.warn({ module: "game.ts" }, "party rep", e); })];
            case 5:
                _b.sent();
                _b.label = 6;
            case 6:
                if (data.party)
                    data.party.appliedTone = body.tone;
                return [4 /*yield*/, c.env.DB.prepare("UPDATE season_recap SET data = ? WHERE team_id = ? AND season_number = ?")
                        .bind(JSON.stringify(data), teamId, row.season_number).run()
                        .catch(function (e) { return logger_1.logger.warn({ module: "game.ts" }, "mark party applied", e); })];
            case 7:
                _b.sent();
                return [2 /*return*/, c.json({ ok: true })];
        }
    });
}); });
// ── Celorepublikový pohár (KO) ──
function activeSeasonNumber(db) {
    return __awaiter(this, void 0, void 0, function () {
        var s;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db.prepare("SELECT MAX(number) AS n FROM seasons WHERE status = 'active'").first()];
                case 1:
                    s = _a.sent();
                    return [2 /*return*/, (0, season_1.mustSeason)(s === null || s === void 0 ? void 0 : s.n, "aktivní sezóna")];
            }
        });
    });
}
// GET /api/teams/:teamId/cup — pohár aktuální sezóny: pavouk + cesta daného týmu.
gameRouter.get("/teams/:teamId/cup", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, seasonNum, cup, _a, roundName, cupPrizeTable, teamsRes, tmap, ctOf, side, matchesRes, gdRow, gameNow, daysUntil, myCt, roundsMap, myMatches, _i, _b, m, entry, isHome, opp, won, rounds, winner, statsRes, scorers;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, activeSeasonNumber(c.env.DB)];
            case 1:
                seasonNum = _c.sent();
                return [4 /*yield*/, c.env.DB.prepare("SELECT id, name, season_number, status, total_rounds, current_round, winner_team_id FROM cup_competitions WHERE season_number = ? LIMIT 1")
                        .bind(seasonNum).first()
                        .catch(function (e) { logger_1.logger.warn({ module: "game.ts" }, "load cup", e); return null; })];
            case 2:
                cup = _c.sent();
                if (!cup)
                    return [2 /*return*/, c.json({ cup: null })];
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../cup/cup"); })];
            case 3:
                _a = _c.sent(), roundName = _a.roundName, cupPrizeTable = _a.cupPrizeTable;
                return [4 /*yield*/, c.env.DB.prepare("SELECT id, team_id, name, strength, is_big_club, primary_color, eliminated_round FROM cup_teams WHERE cup_id = ?")
                        .bind(cup.id).all()
                        .catch(function (e) { logger_1.logger.warn({ module: "game.ts" }, "load cup teams", e); return { results: [] }; })];
            case 4:
                teamsRes = _c.sent();
                tmap = new Map(teamsRes.results.map(function (t) { return [t.id, t]; }));
                ctOf = function (id) { return (id ? tmap.get(id) : null); };
                side = function (id) { var t = ctOf(id); return t ? { name: t.name, color: t.primary_color, isBig: !!t.is_big_club, teamId: t.team_id, strength: t.strength, cupTeamId: t.id } : null; };
                return [4 /*yield*/, c.env.DB.prepare("SELECT round, bracket_pos, home_cup_team_id, away_cup_team_id, home_score, away_score, home_pens, away_pens, winner_cup_team_id, status, upset, scheduled_at FROM cup_matches WHERE cup_id = ? ORDER BY round, bracket_pos")
                        .bind(cup.id).all()
                        .catch(function (e) { logger_1.logger.warn({ module: "game.ts" }, "load cup matches", e); return { results: [] }; })];
            case 5:
                matchesRes = _c.sent();
                return [4 /*yield*/, c.env.DB.prepare("SELECT game_date FROM teams WHERE id = ?").bind(teamId).first()
                        .catch(function (e) { logger_1.logger.warn({ module: "game.ts" }, "load game_date for cup", e); return null; })];
            case 6:
                gdRow = _c.sent();
                gameNow = (gdRow === null || gdRow === void 0 ? void 0 : gdRow.game_date) ? new Date(gdRow.game_date).getTime() : Date.now();
                daysUntil = function (iso) { return iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - gameNow) / 86400000)) : null; };
                myCt = teamsRes.results.find(function (t) { return t.team_id === teamId; });
                roundsMap = new Map();
                myMatches = [];
                for (_i = 0, _b = matchesRes.results; _i < _b.length; _i++) {
                    m = _b[_i];
                    entry = {
                        bracketPos: m.bracket_pos,
                        home: side(m.home_cup_team_id), away: side(m.away_cup_team_id),
                        homeScore: m.home_score, awayScore: m.away_score, homePens: m.home_pens, awayPens: m.away_pens,
                        winnerId: m.winner_cup_team_id, status: m.status, upset: !!m.upset,
                    };
                    if (!roundsMap.has(m.round))
                        roundsMap.set(m.round, []);
                    roundsMap.get(m.round).push(entry);
                    if (myCt && (m.home_cup_team_id === myCt.id || m.away_cup_team_id === myCt.id)) {
                        isHome = m.home_cup_team_id === myCt.id;
                        opp = side(isHome ? m.away_cup_team_id : m.home_cup_team_id);
                        won = m.winner_cup_team_id === myCt.id;
                        myMatches.push({
                            round: m.round, roundName: roundName(m.round, cup.total_rounds),
                            opponent: opp,
                            isHome: isHome,
                            myScore: isHome ? m.home_score : m.away_score, oppScore: isHome ? m.away_score : m.home_score,
                            myPens: isHome ? m.home_pens : m.away_pens, oppPens: isHome ? m.away_pens : m.home_pens,
                            status: m.status, won: m.status === "simulated" ? won : null,
                            scheduledAt: m.scheduled_at, daysUntil: m.status === "simulated" ? null : daysUntil(m.scheduled_at),
                        });
                    }
                }
                rounds = __spreadArray([], roundsMap.entries(), true).sort(function (_a, _b) {
                    var a = _a[0];
                    var b = _b[0];
                    return a - b;
                }).map(function (_a) {
                    var round = _a[0], matches = _a[1];
                    return ({ round: round, roundName: roundName(round, cup.total_rounds), matches: matches });
                });
                winner = cup.winner_team_id ? side(cup.winner_team_id) : null;
                return [4 /*yield*/, c.env.DB.prepare("SELECT mps.player_id, SUM(mps.goals) AS goals, SUM(mps.assists) AS assists, SUM(mps.yellow_cards) AS yc, SUM(mps.red_cards) AS rc, COUNT(*) AS apps,\n       COALESCE(p.first_name || ' ' || p.last_name, cc.first_name || ' ' || cc.last_name, '?') AS name,\n       ct.name AS team_name, ct.team_id AS real_team_id\n     FROM match_player_stats mps\n     JOIN cup_matches cm ON cm.id = mps.match_id AND cm.cup_id = ?\n     LEFT JOIN players p ON p.id = mps.player_id\n     LEFT JOIN cup_club_players cc ON cc.id = mps.player_id\n     LEFT JOIN cup_teams ct ON ct.id = mps.team_id\n     GROUP BY mps.player_id\n     HAVING SUM(mps.goals) > 0 OR SUM(mps.assists) > 0 OR SUM(mps.red_cards) > 0\n     ORDER BY goals DESC, assists DESC LIMIT 20").bind(cup.id).all()
                        .catch(function (e) { logger_1.logger.warn({ module: "game.ts" }, "cup stats", e); return { results: [] }; })];
            case 7:
                statsRes = _c.sent();
                scorers = statsRes.results.map(function (r) {
                    var _a;
                    return ({
                        playerId: r.player_id, name: r.name, teamName: (_a = r.team_name) !== null && _a !== void 0 ? _a : "", teamId: r.real_team_id,
                        goals: r.goals, assists: r.assists, yellow: r.yc, red: r.rc, apps: r.apps,
                    });
                });
                return [2 /*return*/, c.json({
                        cup: { name: cup.name, seasonNumber: cup.season_number, status: cup.status, totalRounds: cup.total_rounds, currentRound: cup.current_round, winner: winner },
                        myTeam: myCt ? { name: myCt.name, eliminatedRound: myCt.eliminated_round, alive: myCt.eliminated_round == null && cup.status === "active", isChampion: cup.winner_team_id === myCt.id } : null,
                        myMatches: myMatches,
                        rounds: rounds,
                        prizes: cupPrizeTable(cup.total_rounds),
                        scorers: scorers,
                    })];
        }
    });
}); });
// GET /api/teams/:teamId/cup/team/:cupTeamId — detail pohárového týmu (síla, soupiska velkoklubu, cesta pohárem).
gameRouter.get("/teams/:teamId/cup/team/:cupTeamId", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var cupTeamId, ct, roundName, squadRes, matchesRes;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                cupTeamId = c.req.param("cupTeamId");
                return [4 /*yield*/, c.env.DB.prepare("SELECT ct.id, ct.cup_id, ct.team_id, ct.name, ct.strength, ct.is_big_club, ct.primary_color, ct.eliminated_round, cc.total_rounds FROM cup_teams ct JOIN cup_competitions cc ON cc.id = ct.cup_id WHERE ct.id = ?")
                        .bind(cupTeamId).first()];
            case 1:
                ct = _a.sent();
                if (!ct)
                    return [2 /*return*/, c.json({ error: "Pohárový tým nenalezen" }, 404)];
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../cup/cup"); })];
            case 2:
                roundName = (_a.sent()).roundName;
                return [4 /*yield*/, c.env.DB.prepare("SELECT first_name, last_name, position, overall_rating, age, condition, morale, suspended_matches FROM cup_club_players WHERE cup_team_id = ? ORDER BY CASE position WHEN 'GK' THEN 0 WHEN 'DEF' THEN 1 WHEN 'MID' THEN 2 ELSE 3 END, overall_rating DESC").bind(cupTeamId).all()
                        .catch(function (e) { logger_1.logger.warn({ module: "game.ts" }, "load cup squad", e); return { results: [] }; })];
            case 3:
                squadRes = _a.sent();
                return [4 /*yield*/, c.env.DB.prepare("SELECT cm.round, cm.status, cm.home_score, cm.away_score, cm.home_pens, cm.away_pens, cm.winner_cup_team_id,\n       h.name AS home_name, a.name AS away_name, h.id AS home_id, a.id AS away_id\n     FROM cup_matches cm JOIN cup_teams h ON h.id = cm.home_cup_team_id JOIN cup_teams a ON a.id = cm.away_cup_team_id\n     WHERE cm.cup_id = ? AND (cm.home_cup_team_id = ? OR cm.away_cup_team_id = ?) ORDER BY cm.round").bind(ct.cup_id, cupTeamId, cupTeamId).all()
                        .catch(function (e) { logger_1.logger.warn({ module: "game.ts" }, "load cup team matches", e); return { results: [] }; })];
            case 4:
                matchesRes = _a.sent();
                return [2 /*return*/, c.json({
                        team: {
                            cupTeamId: ct.id, teamId: ct.team_id, name: ct.name, strength: ct.strength,
                            isBig: !!ct.is_big_club, color: ct.primary_color,
                            eliminatedRound: ct.eliminated_round, alive: ct.eliminated_round == null,
                        },
                        squad: squadRes.results.map(function (p) { return ({
                            name: "".concat(p.first_name, " ").concat(p.last_name), position: p.position, rating: p.overall_rating,
                            age: p.age, condition: p.condition, morale: p.morale, suspended: p.suspended_matches > 0,
                        }); }),
                        matches: matchesRes.results.map(function (m) { return ({
                            round: m.round, roundName: roundName(m.round, ct.total_rounds), status: m.status,
                            homeName: m.home_name, awayName: m.away_name,
                            homeScore: m.home_score, awayScore: m.away_score, homePens: m.home_pens, awayPens: m.away_pens,
                            won: m.winner_cup_team_id === cupTeamId,
                            isHome: m.home_id === cupTeamId,
                        }); }),
                    })];
        }
    });
}); });
// POST /api/admin/run-daily-tick — ruční spuštění denního ticku (globální hodiny + auto-pohár + vše).
gameRouter.post("/admin/run-daily-tick", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var executeDailyTick, r, e_32;
    var _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("../season/daily-tick"); })];
            case 1:
                executeDailyTick = (_c.sent()).executeDailyTick;
                _c.label = 2;
            case 2:
                _c.trys.push([2, 4, , 5]);
                return [4 /*yield*/, executeDailyTick(c.env)];
            case 3:
                r = _c.sent();
                return [2 /*return*/, c.json({ ok: true, events: (_b = (_a = r.events) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 0 })];
            case 4:
                e_32 = _c.sent();
                logger_1.logger.error({ module: "game.ts" }, "manual daily tick", e_32);
                return [2 /*return*/, c.json({ error: "tick selhal" }, 500)];
            case 5: return [2 /*return*/];
        }
    });
}); });
// POST /api/admin/run-transfer-tick — ruční spuštění transfer pressure ticku
// (expirace nabídek, CPU nabídky, truc). Testing env nemá crony — jediná cesta, jak ho tam spustit.
gameRouter.post("/admin/run-transfer-tick", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var executeTransferPressureTick, r, e_33;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("../transfers/transfer-pressure-tick"); })];
            case 1:
                executeTransferPressureTick = (_a.sent()).executeTransferPressureTick;
                _a.label = 2;
            case 2:
                _a.trys.push([2, 4, , 5]);
                return [4 /*yield*/, executeTransferPressureTick(c.env, { force: true })];
            case 3:
                r = _a.sent();
                return [2 /*return*/, c.json(__assign({ ok: true }, r))];
            case 4:
                e_33 = _a.sent();
                logger_1.logger.error({ module: "game.ts" }, "manual transfer pressure tick", e_33);
                return [2 /*return*/, c.json({ error: "tick selhal" }, 500)];
            case 5: return [2 /*return*/];
        }
    });
}); });
// POST /api/admin/generate-ai-offers — force vygeneruje čerstvé CPU nabídky pro KAŽDÝ lidský tým.
// ?replace=1 nejdřív expiruje stávající pending virtuální nabídky (přímý UPDATE, BEZ dopadu na
// hráče), takže se stará „studená" várka nahradí novou dle aktuálního modelu zájmu.
gameRouter.post("/admin/generate-ai-offers", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var replace, expired, res, generateAiOffers, _a, createRng, cryptoSeed, rng, leagues, created, _i, _b, lg, _c;
    var _d, _e;
    return __generator(this, function (_f) {
        switch (_f.label) {
            case 0:
                replace = c.req.query("replace") === "1";
                expired = 0;
                if (!replace) return [3 /*break*/, 2];
                return [4 /*yield*/, c.env.DB.prepare("UPDATE transfer_offers SET status = 'expired', resolved_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE from_team_id = 'virtual_ai' AND status = 'pending'").run().catch(function (e) { logger_1.logger.warn({ module: "game" }, "expire virtual offers", e); return null; })];
            case 1:
                res = _f.sent();
                expired = (_e = (_d = res === null || res === void 0 ? void 0 : res.meta) === null || _d === void 0 ? void 0 : _d.changes) !== null && _e !== void 0 ? _e : 0;
                _f.label = 2;
            case 2: return [4 /*yield*/, Promise.resolve().then(function () { return require("../transfers/virtual-teams"); })];
            case 3:
                generateAiOffers = (_f.sent()).generateAiOffers;
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../generators/rng"); })];
            case 4:
                _a = _f.sent(), createRng = _a.createRng, cryptoSeed = _a.cryptoSeed;
                rng = createRng(cryptoSeed());
                return [4 /*yield*/, c.env.DB.prepare("SELECT l.id, l.district FROM leagues l JOIN teams t ON t.league_id = l.id WHERE t.user_id != 'ai' GROUP BY l.id").all().catch(function (e) { logger_1.logger.warn({ module: "game" }, "fetch leagues for force offers", e); return { results: [] }; })];
            case 5:
                leagues = _f.sent();
                created = 0;
                _i = 0, _b = leagues.results;
                _f.label = 6;
            case 6:
                if (!(_i < _b.length)) return [3 /*break*/, 9];
                lg = _b[_i];
                _c = created;
                return [4 /*yield*/, generateAiOffers(c.env.DB, lg.district, lg.id, rng, { force: true })];
            case 7:
                created = _c + _f.sent();
                _f.label = 8;
            case 8:
                _i++;
                return [3 /*break*/, 6];
            case 9: return [2 /*return*/, c.json({ ok: true, expired: expired, created: created })];
        }
    });
}); });
// POST /api/admin/backfill-departed-avatars — doplní náhodný obličej všem archivovaným
// hráčům bez avataru (prodaní/odešlí před migrací 0115), aby v souhrnu přestupů nebyli bez ksichtu.
gameRouter.post("/admin/backfill-departed-avatars", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var generatePlayerFace, rows, stmts, i;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("./teams"); })];
            case 1:
                generatePlayerFace = (_a.sent()).generatePlayerFace;
                return [4 /*yield*/, c.env.DB.prepare("SELECT id, age FROM departed_players WHERE avatar IS NULL OR avatar = '' OR avatar = '{}'").all().catch(function (e) { logger_1.logger.warn({ module: "game" }, "load departed for avatar backfill", e); return { results: [] }; })];
            case 2:
                rows = _a.sent();
                stmts = rows.results.map(function (r) {
                    var _a;
                    var face = generatePlayerFace({ age: (_a = r.age) !== null && _a !== void 0 ? _a : 25, bodyType: "normal" });
                    return c.env.DB.prepare("UPDATE departed_players SET avatar = ? WHERE id = ?").bind(JSON.stringify(face), r.id);
                });
                i = 0;
                _a.label = 3;
            case 3:
                if (!(i < stmts.length)) return [3 /*break*/, 6];
                return [4 /*yield*/, c.env.DB.batch(stmts.slice(i, i + 50)).catch(function (e) { return logger_1.logger.warn({ module: "game" }, "avatar backfill batch", e); })];
            case 4:
                _a.sent();
                _a.label = 5;
            case 5:
                i += 50;
                return [3 /*break*/, 3];
            case 6: return [2 /*return*/, c.json({ ok: true, updated: stmts.length })];
        }
    });
}); });
// POST /api/admin/cup/create — vytvoří pohár pro aktuální sezónu.
gameRouter.post("/admin/cup/create", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var createCup, r, _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("../cup/cup"); })];
            case 1:
                createCup = (_c.sent()).createCup;
                _a = createCup;
                _b = [c.env.DB];
                return [4 /*yield*/, activeSeasonNumber(c.env.DB)];
            case 2: return [4 /*yield*/, _a.apply(void 0, _b.concat([_c.sent()]))];
            case 3:
                r = _c.sent();
                return [2 /*return*/, c.json(r)];
        }
    });
}); });
// POST /api/admin/cup/advance — odsimuluje aktuální kolo poháru.
gameRouter.post("/admin/cup/advance", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var cup, _a, _b, simulateCupRound, r;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                _b = (_a = c.env.DB.prepare("SELECT id FROM cup_competitions WHERE season_number = ? AND status = 'active' LIMIT 1"))
                    .bind;
                return [4 /*yield*/, activeSeasonNumber(c.env.DB)];
            case 1: return [4 /*yield*/, _b.apply(_a, [_c.sent()]).first()
                    .catch(function (e) { logger_1.logger.warn({ module: "game.ts" }, "load active cup", e); return null; })];
            case 2:
                cup = _c.sent();
                if (!cup)
                    return [2 /*return*/, c.json({ error: "Žádný aktivní pohár" }, 404)];
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../cup/cup"); })];
            case 3:
                simulateCupRound = (_c.sent()).simulateCupRound;
                return [4 /*yield*/, simulateCupRound(c.env.DB, cup.id)];
            case 4:
                r = _c.sent();
                return [2 /*return*/, c.json(r)];
        }
    });
}); });
// POST /api/admin/cup/sync-names — srovná názvy s reálným týmem tam, kde přejmenování
// (naming sponzor / převzetí) nebylo promítnuto: (1) pohár, (2) U21 týmy podle rodiče.
gameRouter.post("/admin/cup/sync-names", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var cup, _a, _b, cupUpdated, res, u21;
    var _c, _d, _e, _f;
    return __generator(this, function (_g) {
        switch (_g.label) {
            case 0:
                _b = (_a = c.env.DB.prepare("SELECT id FROM cup_competitions WHERE season_number = ? AND status = 'active' LIMIT 1"))
                    .bind;
                return [4 /*yield*/, activeSeasonNumber(c.env.DB)];
            case 1: return [4 /*yield*/, _b.apply(_a, [_g.sent()]).first()
                    .catch(function (e) { logger_1.logger.warn({ module: "game.ts" }, "sync-names load cup", e); return null; })];
            case 2:
                cup = _g.sent();
                cupUpdated = 0;
                if (!cup) return [3 /*break*/, 4];
                return [4 /*yield*/, c.env.DB.prepare("UPDATE cup_teams\n         SET name = (SELECT t.name FROM teams t WHERE t.id = cup_teams.team_id),\n             primary_color = (SELECT t.primary_color FROM teams t WHERE t.id = cup_teams.team_id)\n       WHERE cup_id = ?\n         AND team_id IS NOT NULL\n         AND name != (SELECT t.name FROM teams t WHERE t.id = cup_teams.team_id)").bind(cup.id).run().catch(function (e) { logger_1.logger.warn({ module: "game.ts" }, "sync cup team names", e); return null; })];
            case 3:
                res = _g.sent();
                cupUpdated = (_d = (_c = res === null || res === void 0 ? void 0 : res.meta) === null || _c === void 0 ? void 0 : _c.changes) !== null && _d !== void 0 ? _d : 0;
                _g.label = 4;
            case 4: return [4 /*yield*/, c.env.DB.prepare("UPDATE teams\n       SET name = (SELECT p.name FROM teams p WHERE p.id = teams.parent_team_id) || ' U21'\n     WHERE team_type = 'u21' AND parent_team_id IS NOT NULL\n       AND name != (SELECT p.name FROM teams p WHERE p.id = teams.parent_team_id) || ' U21'").run().catch(function (e) { logger_1.logger.warn({ module: "game.ts" }, "sync u21 names", e); return null; })];
            case 5:
                u21 = _g.sent();
                return [2 /*return*/, c.json({ ok: true, cupUpdated: cupUpdated, u21Updated: (_f = (_e = u21 === null || u21 === void 0 ? void 0 : u21.meta) === null || _e === void 0 ? void 0 : _e.changes) !== null && _f !== void 0 ? _f : 0 })];
        }
    });
}); });
// ── Admin: Seed data management ──
gameRouter.get("/admin/seed-data", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var OCCUPATIONS, tables, result, _i, tables_1, t, cnt, _a, entry, dists;
    var _b, _c, _d;
    return __generator(this, function (_e) {
        switch (_e.label) {
            case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("../generators/occupations"); })];
            case 1:
                OCCUPATIONS = (_e.sent()).OCCUPATIONS;
                tables = [
                    { key: "villages", label: "Vesnice", editable: false },
                    { key: "district_surnames", label: "Příjmení", editable: true },
                    { key: "district_sponsors", label: "Sponzoři", editable: true },
                    { key: "commentary_templates", label: "Komentáře", editable: true },
                    { key: "crowd_reactions", label: "Reakce publika", editable: true },
                    { key: "occupations", label: "Povolání", editable: false, count: OCCUPATIONS.length },
                ];
                result = [];
                _i = 0, tables_1 = tables;
                _e.label = 2;
            case 2:
                if (!(_i < tables_1.length)) return [3 /*break*/, 9];
                t = tables_1[_i];
                if (!((_b = t.count) !== null && _b !== void 0)) return [3 /*break*/, 3];
                _a = _b;
                return [3 /*break*/, 5];
            case 3: return [4 /*yield*/, c.env.DB.prepare("SELECT COUNT(*) as cnt FROM ".concat(t.key)).first().catch(function () { return ({ cnt: 0 }); })];
            case 4:
                _a = (_c = (_e.sent())) === null || _c === void 0 ? void 0 : _c.cnt;
                _e.label = 5;
            case 5:
                cnt = (_d = _a) !== null && _d !== void 0 ? _d : 0;
                entry = { key: t.key, label: t.label, count: cnt, editable: t.editable };
                if (!(t.key === "district_surnames" || t.key === "district_sponsors")) return [3 /*break*/, 7];
                return [4 /*yield*/, c.env.DB.prepare("SELECT DISTINCT district FROM ".concat(t.key, " ORDER BY district")).all().catch(function () { return ({ results: [] }); })];
            case 6:
                dists = _e.sent();
                entry.districts = dists.results.map(function (r) { return r.district; });
                _e.label = 7;
            case 7:
                result.push(entry);
                _e.label = 8;
            case 8:
                _i++;
                return [3 /*break*/, 2];
            case 9: return [2 /*return*/, c.json(result)];
        }
    });
}); });
gameRouter.get("/admin/seed-data/:table", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var table, OCCUPATIONS, rows_1, allowed, district, limit, offset, query, binds, rows, total;
    var _a, _b;
    var _c;
    return __generator(this, function (_d) {
        switch (_d.label) {
            case 0:
                table = c.req.param("table");
                if (!(table === "occupations")) return [3 /*break*/, 2];
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../generators/occupations"); })];
            case 1:
                OCCUPATIONS = (_d.sent()).OCCUPATIONS;
                rows_1 = OCCUPATIONS.map(function (o) { return ({
                    id: o.id, name: o.name,
                    hamlet: o.w.hamlet, village: o.w.village, town: o.w.town, small_city: o.w.small_city, city: o.w.city,
                    injuryRisk: o.injuryRisk, overtimeRisk: o.overtimeRisk, strengthBonus: o.strengthBonus,
                    excuses: o.excuses.join(" | "),
                }); });
                return [2 /*return*/, c.json({ rows: rows_1, total: rows_1.length })];
            case 2:
                allowed = ["villages", "district_surnames", "district_sponsors", "commentary_templates", "crowd_reactions"];
                if (!allowed.includes(table))
                    return [2 /*return*/, c.json({ error: "Invalid table" }, 400)];
                district = c.req.query("district");
                limit = Number(c.req.query("limit") || "100");
                offset = Number(c.req.query("offset") || "0");
                query = "SELECT ".concat(table === "district_surnames" ? "rowid as id, " : "", "* FROM ").concat(table);
                binds = [];
                if (district && (table === "district_surnames" || table === "district_sponsors")) {
                    query += " WHERE district = ?";
                    binds.push(district);
                }
                query += " LIMIT ? OFFSET ?";
                binds.push(limit, offset);
                return [4 /*yield*/, (_a = c.env.DB.prepare(query)).bind.apply(_a, binds).all().catch(function () { return ({ results: [] }); })];
            case 3:
                rows = _d.sent();
                return [4 /*yield*/, (_b = c.env.DB.prepare("SELECT COUNT(*) as cnt FROM ".concat(table).concat(district ? " WHERE district = ?" : "")))
                        .bind.apply(_b, (district ? [district] : [])).first().catch(function () { return ({ cnt: 0 }); })];
            case 4:
                total = _d.sent();
                return [2 /*return*/, c.json({ rows: rows.results, total: (_c = total === null || total === void 0 ? void 0 : total.cnt) !== null && _c !== void 0 ? _c : 0 })];
        }
    });
}); });
gameRouter.post("/admin/seed-data/:table", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var table, body, district, surname, frequency, district, name_1, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max, event_type, template, tags, text;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                table = c.req.param("table");
                return [4 /*yield*/, c.req.json()];
            case 1:
                body = _a.sent();
                if (!(table === "district_surnames")) return [3 /*break*/, 3];
                district = body.district, surname = body.surname, frequency = body.frequency;
                if (!district || !surname)
                    return [2 /*return*/, c.json({ error: "Missing district or surname" }, 400)];
                return [4 /*yield*/, c.env.DB.prepare("INSERT INTO district_surnames (district, surname, frequency) VALUES (?, ?, ?)")
                        .bind(district, surname, frequency !== null && frequency !== void 0 ? frequency : 10).run()];
            case 2:
                _a.sent();
                return [2 /*return*/, c.json({ ok: true })];
            case 3:
                if (!(table === "district_sponsors")) return [3 /*break*/, 5];
                district = body.district, name_1 = body.name, type = body.type, monthly_min = body.monthly_min, monthly_max = body.monthly_max, win_bonus_min = body.win_bonus_min, win_bonus_max = body.win_bonus_max;
                if (!district || !name_1)
                    return [2 /*return*/, c.json({ error: "Missing fields" }, 400)];
                return [4 /*yield*/, c.env.DB.prepare("INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max) VALUES (?, ?, ?, ?, ?, ?, ?)")
                        .bind(district, name_1, type !== null && type !== void 0 ? type : "obecné", monthly_min !== null && monthly_min !== void 0 ? monthly_min : 500, monthly_max !== null && monthly_max !== void 0 ? monthly_max : 1500, win_bonus_min !== null && win_bonus_min !== void 0 ? win_bonus_min : 100, win_bonus_max !== null && win_bonus_max !== void 0 ? win_bonus_max : 300).run()];
            case 4:
                _a.sent();
                return [2 /*return*/, c.json({ ok: true })];
            case 5:
                if (!(table === "commentary_templates")) return [3 /*break*/, 7];
                event_type = body.event_type, template = body.template, tags = body.tags;
                if (!event_type || !template)
                    return [2 /*return*/, c.json({ error: "Missing fields" }, 400)];
                return [4 /*yield*/, c.env.DB.prepare("INSERT INTO commentary_templates (event_type, template, tags) VALUES (?, ?, ?)")
                        .bind(event_type, template, JSON.stringify(tags !== null && tags !== void 0 ? tags : [])).run()];
            case 6:
                _a.sent();
                return [2 /*return*/, c.json({ ok: true })];
            case 7:
                if (!(table === "crowd_reactions")) return [3 /*break*/, 9];
                text = body.text;
                if (!text)
                    return [2 /*return*/, c.json({ error: "Missing text" }, 400)];
                return [4 /*yield*/, c.env.DB.prepare("INSERT INTO crowd_reactions (text) VALUES (?)").bind(text).run()];
            case 8:
                _a.sent();
                return [2 /*return*/, c.json({ ok: true })];
            case 9: return [2 /*return*/, c.json({ error: "Table not writable" }, 400)];
        }
    });
}); });
gameRouter.delete("/admin/seed-data/:table/:id", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var table, id, allowed, idCol;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                table = c.req.param("table");
                id = c.req.param("id");
                allowed = ["district_surnames", "district_sponsors", "commentary_templates", "crowd_reactions"];
                if (!allowed.includes(table))
                    return [2 /*return*/, c.json({ error: "Cannot delete from this table" }, 400)];
                idCol = table === "district_surnames" ? "rowid" : "id";
                return [4 /*yield*/, c.env.DB.prepare("DELETE FROM ".concat(table, " WHERE ").concat(idCol, " = ?")).bind(id).run()];
            case 1:
                _a.sent();
                return [2 /*return*/, c.json({ ok: true })];
        }
    });
}); });
gameRouter.put("/admin/seed-data/:table/:id", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var table, id, allowed, body, idCol, allowedCols, validCols, updates, values, _i, _a, _b, k, v;
    var _c;
    var _d;
    return __generator(this, function (_e) {
        switch (_e.label) {
            case 0:
                table = c.req.param("table");
                id = c.req.param("id");
                allowed = ["district_surnames", "district_sponsors", "commentary_templates", "crowd_reactions"];
                if (!allowed.includes(table))
                    return [2 /*return*/, c.json({ error: "Cannot edit this table" }, 400)];
                return [4 /*yield*/, c.req.json()];
            case 1:
                body = _e.sent();
                idCol = table === "district_surnames" ? "rowid" : "id";
                allowedCols = {
                    district_surnames: ["district", "surname", "frequency"],
                    district_sponsors: ["district", "name", "type", "monthly_min", "monthly_max", "win_bonus_min", "win_bonus_max"],
                    commentary_templates: ["event_type", "template", "tags"],
                    crowd_reactions: ["text"],
                };
                validCols = (_d = allowedCols[table]) !== null && _d !== void 0 ? _d : [];
                updates = [];
                values = [];
                for (_i = 0, _a = Object.entries(body); _i < _a.length; _i++) {
                    _b = _a[_i], k = _b[0], v = _b[1];
                    if (validCols.includes(k)) {
                        updates.push("".concat(k, " = ?"));
                        values.push(v);
                    }
                }
                if (updates.length === 0)
                    return [2 /*return*/, c.json({ error: "No valid fields" }, 400)];
                values.push(id);
                return [4 /*yield*/, (_c = c.env.DB.prepare("UPDATE ".concat(table, " SET ").concat(updates.join(", "), " WHERE ").concat(idCol, " = ?"))).bind.apply(_c, values).run()];
            case 2:
                _e.sent();
                return [2 /*return*/, c.json({ ok: true })];
        }
    });
}); });
// ─────────────────────────────────────────────────────────────
// Fanoušci + Občerstvení (self concession mode)
// ─────────────────────────────────────────────────────────────
// GET /api/teams/:id/fans — stav fanoušků, vstupné override, last match delta
gameRouter.get("/teams/:teamId/fans", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, ensureFansRow, fans, _a, mapVillageSize, getBaseTicketPrice, villageRow, villageBaseTicketPrice, mgr, mgrMatchBoost, mgrWeeklyLoyaltyBoost, reasons;
    var _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../season/fans-processor"); })];
            case 1:
                ensureFansRow = (_c.sent()).ensureFansRow;
                return [4 /*yield*/, ensureFansRow(c.env.DB, teamId)];
            case 2:
                _c.sent();
                return [4 /*yield*/, c.env.DB.prepare("SELECT satisfaction, loyalty, expected_performance, base_ticket_price, last_match_delta, last_match_reasons FROM fans WHERE team_id = ?").bind(teamId).first().catch(function (e) { logger_1.logger.warn({ module: "game" }, "load fans", e); return null; })];
            case 3:
                fans = _c.sent();
                if (!fans)
                    return [2 /*return*/, c.json({ error: "Fans not found" }, 404)];
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../season/finance-processor"); })];
            case 4:
                _a = _c.sent(), mapVillageSize = _a.mapVillageSize, getBaseTicketPrice = _a.getBaseTicketPrice;
                return [4 /*yield*/, c.env.DB.prepare("SELECT v.size FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?").bind(teamId).first().catch(function (e) {
                        logger_1.logger.warn({ module: "game" }, "load village for base ticket", e);
                        return null;
                    })];
            case 5:
                villageRow = _c.sent();
                villageBaseTicketPrice = getBaseTicketPrice(mapVillageSize((_b = villageRow === null || villageRow === void 0 ? void 0 : villageRow.size) !== null && _b !== void 0 ? _b : "village"));
                return [4 /*yield*/, c.env.DB.prepare("SELECT reputation, motivation FROM managers WHERE team_id = ?").bind(teamId).first().catch(function (e) {
                        logger_1.logger.warn({ module: "game" }, "load manager for fans", e);
                        return null;
                    })];
            case 6:
                mgr = _c.sent();
                mgrMatchBoost = mgr
                    ? Math.round((mgr.reputation - 50) * 0.03 + (mgr.motivation - 50) * 0.02)
                    : 0;
                mgrWeeklyLoyaltyBoost = mgr
                    ? Math.round((mgr.reputation - 50) * 0.02 + (mgr.motivation - 50) * 0.015)
                    : 0;
                reasons = [];
                try {
                    reasons = fans.last_match_reasons ? JSON.parse(fans.last_match_reasons) : [];
                }
                catch (e) {
                    logger_1.logger.warn({ module: "game" }, "parse last_match_reasons", e);
                }
                return [2 /*return*/, c.json({
                        satisfaction: fans.satisfaction,
                        loyalty: fans.loyalty,
                        expectedPerformance: fans.expected_performance,
                        baseTicketPrice: fans.base_ticket_price,
                        villageBaseTicketPrice: villageBaseTicketPrice,
                        lastMatchDelta: fans.last_match_delta,
                        lastMatchReasons: reasons,
                        manager: mgr
                            ? {
                                reputation: mgr.reputation,
                                motivation: mgr.motivation,
                                matchBoost: mgrMatchBoost,
                                weeklyLoyaltyBoost: mgrWeeklyLoyaltyBoost,
                            }
                            : null,
                    })];
        }
    });
}); });
// GET /api/teams/:id/fans/history — posledních N zápasů s satisfaction delta
gameRouter.get("/teams/:teamId/fans/history", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, limit, rows, items;
    var _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                teamId = c.req.param("teamId");
                limit = Math.min(50, Math.max(1, parseInt((_a = c.req.query("limit")) !== null && _a !== void 0 ? _a : "20", 10)));
                return [4 /*yield*/, c.env.DB.prepare("SELECT id, match_id, gamedate, satisfaction_before, satisfaction_after, delta,\n            reasons, opponent_name, result, attendance, created_at\n     FROM fans_match_history\n     WHERE team_id = ?\n     ORDER BY created_at DESC\n     LIMIT ?")
                        .bind(teamId, limit)
                        .all()
                        .catch(function (e) {
                        logger_1.logger.warn({ module: "game" }, "load fans history", e);
                        return { results: [] };
                    })];
            case 1:
                rows = _c.sent();
                items = ((_b = rows.results) !== null && _b !== void 0 ? _b : []).map(function (r) { return ({
                    id: r.id,
                    matchId: r.match_id,
                    gamedate: r.gamedate,
                    satisfactionBefore: r.satisfaction_before,
                    satisfactionAfter: r.satisfaction_after,
                    delta: r.delta,
                    reasons: r.reasons ? JSON.parse(r.reasons) : [],
                    opponentName: r.opponent_name,
                    result: r.result,
                    attendance: r.attendance,
                    createdAt: r.created_at,
                }); });
                return [2 /*return*/, c.json({ items: items })];
        }
    });
}); });
// GET /api/teams/:id/concession/sales — detailní historie prodejů občerstvení (jen self mode)
gameRouter.get("/teams/:teamId/concession/sales", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, limit, rows, byMatch, _i, _a, r, key, group;
    var _b, _c, _d;
    return __generator(this, function (_e) {
        switch (_e.label) {
            case 0:
                teamId = c.req.param("teamId");
                limit = Math.min(100, Math.max(1, parseInt((_b = c.req.query("limit")) !== null && _b !== void 0 ? _b : "30", 10)));
                return [4 /*yield*/, c.env.DB.prepare("SELECT s.id, s.match_id, s.gamedate, s.product_key, s.quality_level, s.sell_price,\n            s.wholesale_price, s.sold_count, s.revenue, s.profit, s.stockout, s.attendance,\n            s.created_at,\n            CASE WHEN m.home_team_id = ? THEN at.name ELSE ht.name END as opponent_name,\n            CASE\n              WHEN m.home_team_id = ? AND m.home_score > m.away_score THEN 'win'\n              WHEN m.away_team_id = ? AND m.away_score > m.home_score THEN 'win'\n              WHEN m.home_score = m.away_score THEN 'draw'\n              ELSE 'loss'\n            END as result\n     FROM concession_match_sales s\n     LEFT JOIN matches m ON m.id = s.match_id\n     LEFT JOIN teams ht ON ht.id = m.home_team_id\n     LEFT JOIN teams at ON at.id = m.away_team_id\n     WHERE s.team_id = ?\n     ORDER BY s.created_at DESC, s.product_key\n     LIMIT ?")
                        .bind(teamId, teamId, teamId, teamId, limit)
                        .all()
                        .catch(function (e) {
                        logger_1.logger.warn({ module: "game" }, "load concession sales", e);
                        return { results: [] };
                    })];
            case 1:
                rows = _e.sent();
                byMatch = new Map();
                for (_i = 0, _a = (_c = rows.results) !== null && _c !== void 0 ? _c : []; _i < _a.length; _i++) {
                    r = _a[_i];
                    key = (_d = r.match_id) !== null && _d !== void 0 ? _d : r.created_at;
                    if (!byMatch.has(key)) {
                        byMatch.set(key, {
                            matchId: r.match_id,
                            gamedate: r.gamedate,
                            opponentName: r.opponent_name,
                            result: r.result,
                            attendance: r.attendance,
                            products: [],
                            totalRevenue: 0,
                            totalProfit: 0,
                        });
                    }
                    group = byMatch.get(key);
                    group.products.push({
                        productKey: r.product_key,
                        qualityLevel: r.quality_level,
                        sellPrice: r.sell_price,
                        wholesalePrice: r.wholesale_price,
                        soldCount: r.sold_count,
                        revenue: r.revenue,
                        profit: r.profit,
                        stockout: r.stockout === 1,
                    });
                    group.totalRevenue += r.revenue;
                    group.totalProfit += r.profit;
                }
                return [2 /*return*/, c.json({ matches: Array.from(byMatch.values()) })];
        }
    });
}); });
// PATCH /api/teams/:id/fans/ticket-price — user override ceny vstupného
gameRouter.patch("/teams/:teamId/fans/ticket-price", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, body, price, ensureFansRow;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, c.req.json().catch(function (e) {
                        logger_1.logger.warn({ module: "game" }, "parse ticket-price body", e);
                        return { baseTicketPrice: 0 };
                    })];
            case 1:
                body = _b.sent();
                price = Math.max(0, Math.min(500, Math.round((_a = body.baseTicketPrice) !== null && _a !== void 0 ? _a : 0)));
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../season/fans-processor"); })];
            case 2:
                ensureFansRow = (_b.sent()).ensureFansRow;
                return [4 /*yield*/, ensureFansRow(c.env.DB, teamId)];
            case 3:
                _b.sent();
                return [4 /*yield*/, c.env.DB.prepare("UPDATE fans SET base_ticket_price = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE team_id = ?").bind(price, teamId).run().catch(function (e) { return logger_1.logger.warn({ module: "game" }, "update ticket price", e); })];
            case 4:
                _b.sent();
                return [2 /*return*/, c.json({ ok: true, baseTicketPrice: price })];
        }
    });
}); });
// GET /api/teams/:id/concession — mód + stav produktů (+ katalog pro UI)
gameRouter.get("/teams/:teamId/concession", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, ensureFansRow, _a, CONCESSION_CATALOG, CONCESSION_PRODUCT_KEYS, stadium, mode, refreshmentsLevel, canSwitchToSelf, productsResult, productsByKey, teamRow, computeExternalWeeklyConcession, externalWeeklyIncome, products;
    var _b, _c;
    return __generator(this, function (_d) {
        switch (_d.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../season/fans-processor"); })];
            case 1:
                ensureFansRow = (_d.sent()).ensureFansRow;
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../season/concession-catalog"); })];
            case 2:
                _a = _d.sent(), CONCESSION_CATALOG = _a.CONCESSION_CATALOG, CONCESSION_PRODUCT_KEYS = _a.CONCESSION_PRODUCT_KEYS;
                return [4 /*yield*/, ensureFansRow(c.env.DB, teamId)];
            case 3:
                _d.sent();
                return [4 /*yield*/, c.env.DB.prepare("SELECT concession_mode, refreshments FROM stadiums WHERE team_id = ?").bind(teamId).first().catch(function (e) {
                        logger_1.logger.warn({ module: "game" }, "load stadium for concession", e);
                        return null;
                    })];
            case 4:
                stadium = _d.sent();
                mode = (stadium === null || stadium === void 0 ? void 0 : stadium.concession_mode) === "self" ? "self" : "external";
                refreshmentsLevel = (_b = stadium === null || stadium === void 0 ? void 0 : stadium.refreshments) !== null && _b !== void 0 ? _b : 0;
                canSwitchToSelf = refreshmentsLevel >= 1;
                return [4 /*yield*/, c.env.DB.prepare("SELECT product_key, quality_level, sell_price, stock_quantity FROM concession_products WHERE team_id = ?").bind(teamId).all().catch(function (e) { logger_1.logger.warn({ module: "game" }, "load concession products", e); return { results: [] }; })];
            case 5:
                productsResult = _d.sent();
                productsByKey = new Map(productsResult.results.map(function (r) { return [r.product_key, r]; }));
                return [4 /*yield*/, c.env.DB.prepare("SELECT reputation FROM teams WHERE id = ?")
                        .bind(teamId).first().catch(function (e) { logger_1.logger.warn({ module: "game" }, "load team rep", e); return null; })];
            case 6:
                teamRow = _d.sent();
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../season/finance-processor"); })];
            case 7:
                computeExternalWeeklyConcession = (_d.sent()).computeExternalWeeklyConcession;
                externalWeeklyIncome = computeExternalWeeklyConcession(refreshmentsLevel, (_c = teamRow === null || teamRow === void 0 ? void 0 : teamRow.reputation) !== null && _c !== void 0 ? _c : 50);
                products = CONCESSION_PRODUCT_KEYS.map(function (key) {
                    var _a, _b, _c;
                    var row = productsByKey.get(key);
                    var catalog = CONCESSION_CATALOG[key];
                    return {
                        key: key,
                        label: catalog.label,
                        baseDemandRate: catalog.baseDemandRate,
                        qualityLevel: (_a = row === null || row === void 0 ? void 0 : row.quality_level) !== null && _a !== void 0 ? _a : 1,
                        sellPrice: (_b = row === null || row === void 0 ? void 0 : row.sell_price) !== null && _b !== void 0 ? _b : catalog.tiers[1].defaultSellPrice,
                        stockQuantity: (_c = row === null || row === void 0 ? void 0 : row.stock_quantity) !== null && _c !== void 0 ? _c : 0,
                        tiers: catalog.tiers.map(function (t, i) { return ({
                            level: i,
                            label: t.label,
                            wholesalePrice: t.wholesalePrice,
                            defaultSellPrice: t.defaultSellPrice,
                        }); }),
                    };
                });
                return [2 /*return*/, c.json({
                        mode: mode,
                        canSwitchToSelf: canSwitchToSelf,
                        refreshmentsLevel: refreshmentsLevel,
                        externalWeeklyIncome: externalWeeklyIncome,
                        products: products,
                    })];
        }
    });
}); });
// PATCH /api/teams/:id/concession/mode — přepínání mezi external a self
gameRouter.patch("/teams/:teamId/concession/mode", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, body, mode, stadium;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, c.req.json().catch(function (e) {
                        logger_1.logger.warn({ module: "game" }, "parse mode body", e);
                        return { mode: "external" };
                    })];
            case 1:
                body = _b.sent();
                mode = body.mode === "self" ? "self" : "external";
                if (!(mode === "self")) return [3 /*break*/, 3];
                return [4 /*yield*/, c.env.DB.prepare("SELECT refreshments FROM stadiums WHERE team_id = ?").bind(teamId).first().catch(function (e) {
                        logger_1.logger.warn({ module: "game" }, "check refreshments for self mode", e);
                        return null;
                    })];
            case 2:
                stadium = _b.sent();
                if (((_a = stadium === null || stadium === void 0 ? void 0 : stadium.refreshments) !== null && _a !== void 0 ? _a : 0) < 1) {
                    return [2 /*return*/, c.json({ error: "Pro vlastní provoz je potřeba alespoň L1 občerstvení ve stadionu" }, 400)];
                }
                _b.label = 3;
            case 3: return [4 /*yield*/, c.env.DB.prepare("UPDATE stadiums SET concession_mode = ? WHERE team_id = ?").bind(mode, teamId).run().catch(function (e) { return logger_1.logger.warn({ module: "game" }, "update concession mode", e); })];
            case 4:
                _b.sent();
                return [2 /*return*/, c.json({ ok: true, mode: mode })];
        }
    });
}); });
// PATCH /api/teams/:id/concession/products/:key — kvalita + prodejní cena
gameRouter.patch("/teams/:teamId/concession/products/:key", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, key, body, CONCESSION_CATALOG, catalog, ensureFansRow, existing, newQuality, newPrice;
    var _a, _b, _c, _d;
    return __generator(this, function (_e) {
        switch (_e.label) {
            case 0:
                teamId = c.req.param("teamId");
                key = c.req.param("key");
                return [4 /*yield*/, c.req.json().catch(function (e) {
                        logger_1.logger.warn({ module: "game" }, "parse concession product body", e);
                        return {};
                    })];
            case 1:
                body = _e.sent();
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../season/concession-catalog"); })];
            case 2:
                CONCESSION_CATALOG = (_e.sent()).CONCESSION_CATALOG;
                catalog = CONCESSION_CATALOG[key];
                if (!catalog)
                    return [2 /*return*/, c.json({ error: "Neznámý produkt" }, 400)];
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../season/fans-processor"); })];
            case 3:
                ensureFansRow = (_e.sent()).ensureFansRow;
                return [4 /*yield*/, ensureFansRow(c.env.DB, teamId)];
            case 4:
                _e.sent();
                return [4 /*yield*/, c.env.DB.prepare("SELECT quality_level, sell_price FROM concession_products WHERE team_id = ? AND product_key = ?").bind(teamId, key).first().catch(function (e) {
                        logger_1.logger.warn({ module: "game" }, "load concession product", e);
                        return null;
                    })];
            case 5:
                existing = _e.sent();
                newQuality = body.qualityLevel !== undefined
                    ? Math.max(0, Math.min(3, Math.round(body.qualityLevel)))
                    : ((_a = existing === null || existing === void 0 ? void 0 : existing.quality_level) !== null && _a !== void 0 ? _a : 1);
                newPrice = body.sellPrice !== undefined
                    ? Math.max(0, Math.min(1000, Math.round(body.sellPrice)))
                    : ((_d = (_b = existing === null || existing === void 0 ? void 0 : existing.sell_price) !== null && _b !== void 0 ? _b : (_c = catalog.tiers[newQuality]) === null || _c === void 0 ? void 0 : _c.defaultSellPrice) !== null && _d !== void 0 ? _d : 0);
                return [4 /*yield*/, c.env.DB.prepare("UPDATE concession_products SET quality_level = ?, sell_price = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE team_id = ? AND product_key = ?").bind(newQuality, newPrice, teamId, key).run().catch(function (e) { return logger_1.logger.warn({ module: "game" }, "update concession product", e); })];
            case 6:
                _e.sent();
                return [2 /*return*/, c.json({ ok: true, qualityLevel: newQuality, sellPrice: newPrice })];
        }
    });
}); });
// POST /api/teams/:id/concession/restock — nákup skladu (strhne wholesale × quantity z rozpočtu)
gameRouter.post("/teams/:teamId/concession/restock", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, body, CONCESSION_CATALOG, catalog, quantity, product, tier, totalCost, team, gameDate, newStock;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, c.req.json().catch(function (e) {
                        logger_1.logger.warn({ module: "game" }, "parse restock body", e);
                        return { productKey: "", quantity: 0 };
                    })];
            case 1:
                body = _b.sent();
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../season/concession-catalog"); })];
            case 2:
                CONCESSION_CATALOG = (_b.sent()).CONCESSION_CATALOG;
                catalog = CONCESSION_CATALOG[body.productKey];
                if (!catalog)
                    return [2 /*return*/, c.json({ error: "Neznámý produkt" }, 400)];
                quantity = Math.max(0, Math.min(10000, Math.round((_a = body.quantity) !== null && _a !== void 0 ? _a : 0)));
                if (quantity <= 0)
                    return [2 /*return*/, c.json({ error: "Množství musí být kladné" }, 400)];
                return [4 /*yield*/, c.env.DB.prepare("SELECT quality_level, stock_quantity FROM concession_products WHERE team_id = ? AND product_key = ?").bind(teamId, body.productKey).first().catch(function (e) {
                        logger_1.logger.warn({ module: "game" }, "load restock product", e);
                        return null;
                    })];
            case 3:
                product = _b.sent();
                if (!product)
                    return [2 /*return*/, c.json({ error: "Produkt nenalezen" }, 404)];
                tier = catalog.tiers[product.quality_level];
                if (!tier || tier.wholesalePrice === 0) {
                    return [2 /*return*/, c.json({ error: "Tento produkt se nenabízí (L0)" }, 400)];
                }
                totalCost = tier.wholesalePrice * quantity;
                return [4 /*yield*/, c.env.DB.prepare("SELECT budget FROM teams WHERE id = ?")
                        .bind(teamId).first().catch(function (e) { logger_1.logger.warn({ module: "game" }, "load team budget", e); return null; })];
            case 4:
                team = _b.sent();
                if (!team)
                    return [2 /*return*/, c.json({ error: "Tým nenalezen" }, 404)];
                if (team.budget < totalCost)
                    return [2 /*return*/, c.json({ error: "Nedostatek peněz" }, 400)];
                gameDate = new Date().toISOString();
                return [4 /*yield*/, (0, finance_processor_1.recordTransaction)(c.env.DB, teamId, "concession_wholesale", -totalCost, "N\u00E1kup ".concat(catalog.label, " (").concat(quantity, " ks \u00D7 ").concat(tier.wholesalePrice, " K\u010D)"), gameDate)];
            case 5:
                _b.sent();
                newStock = product.stock_quantity + quantity;
                return [4 /*yield*/, c.env.DB.prepare("UPDATE concession_products SET stock_quantity = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE team_id = ? AND product_key = ?").bind(newStock, teamId, body.productKey).run().catch(function (e) { return logger_1.logger.warn({ module: "game" }, "update stock after restock", e); })];
            case 6:
                _b.sent();
                return [2 /*return*/, c.json({ ok: true, newStock: newStock, totalCost: totalCost })];
        }
    });
}); });
// POST /api/admin/backfill-fans — dev-only backfill pro existující týmy
gameRouter.post("/admin/backfill-fans", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var ensureFansRow, teams, created, _i, _a, team;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("../season/fans-processor"); })];
            case 1:
                ensureFansRow = (_b.sent()).ensureFansRow;
                return [4 /*yield*/, c.env.DB.prepare("SELECT id FROM teams").all()
                        .catch(function (e) { logger_1.logger.warn({ module: "game" }, "backfill list teams", e); return { results: [] }; })];
            case 2:
                teams = _b.sent();
                created = 0;
                _i = 0, _a = teams.results;
                _b.label = 3;
            case 3:
                if (!(_i < _a.length)) return [3 /*break*/, 6];
                team = _a[_i];
                return [4 /*yield*/, ensureFansRow(c.env.DB, team.id)];
            case 4:
                _b.sent();
                created++;
                _b.label = 5;
            case 5:
                _i++;
                return [3 /*break*/, 3];
            case 6: return [2 /*return*/, c.json({ ok: true, teamsProcessed: created })];
        }
    });
}); });
// POST /api/admin/leagues/:leagueId/set-game-date — ruční sync herního data ligy
gameRouter.post("/admin/leagues/:leagueId/set-game-date", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var leagueId, body, result;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                leagueId = c.req.param("leagueId");
                return [4 /*yield*/, c.req.json()];
            case 1:
                body = _a.sent();
                if (!body.gameDate)
                    return [2 /*return*/, c.json({ error: "gameDate required" }, 400)];
                return [4 /*yield*/, c.env.DB.prepare("UPDATE teams SET game_date = ? WHERE league_id = ?")
                        .bind(body.gameDate, leagueId).run()
                        .catch(function (e) { logger_1.logger.warn({ module: "game" }, "set-game-date", e); return null; })];
            case 2:
                result = _a.sent();
                if (!result)
                    return [2 /*return*/, c.json({ error: "DB error" }, 500)];
                return [2 /*return*/, c.json({ ok: true, leagueId: leagueId, gameDate: body.gameDate, rowsAffected: result.meta.changes })];
        }
    });
}); });
// POST /api/admin/leagues/:leagueId/trigger-day-before — vygeneruje day-before attendance zprávy
gameRouter.post("/admin/leagues/:leagueId/trigger-day-before", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var leagueId, absenceSeedForMatch, generateAbsences, generateAttendanceMessage, fetchDistrictForTrigger, teams, processed, _loop_3, _i, _a, team;
    var _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                leagueId = c.req.param("leagueId");
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../lib/seed"); })];
            case 1:
                absenceSeedForMatch = (_c.sent()).absenceSeedForMatch;
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../events/absence"); })];
            case 2:
                generateAbsences = (_c.sent()).generateAbsences;
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../messaging/message-generator"); })];
            case 3:
                generateAttendanceMessage = (_c.sent()).generateAttendanceMessage;
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../events/match-absences"); })];
            case 4:
                fetchDistrictForTrigger = (_c.sent()).fetchTeamDistrict;
                return [4 /*yield*/, c.env.DB.prepare("SELECT id, user_id, game_date FROM teams WHERE league_id = ? AND user_id != 'ai'").bind(leagueId).all()];
            case 5:
                teams = _c.sent();
                processed = 0;
                _loop_3 = function (team) {
                    var teamId, tomorrow, tStart, tEnd, tomorrowMatch, alreadySent, matchRow, opponentName, squadRows, absRng, absSquad, triggerDistrict, dayBeforeAbsences, absentIds, matchConvId, totalSquad, msgCount, _loop_4, _d, _e, row;
                    return __generator(this, function (_f) {
                        switch (_f.label) {
                            case 0:
                                teamId = team.id;
                                if (!team.game_date)
                                    return [2 /*return*/, "continue"];
                                tomorrow = new Date(team.game_date);
                                tomorrow.setDate(tomorrow.getDate() + 1);
                                tStart = new Date(tomorrow);
                                tStart.setUTCHours(0, 0, 0, 0);
                                tEnd = new Date(tomorrow);
                                tEnd.setUTCHours(23, 59, 59, 999);
                                return [4 /*yield*/, c.env.DB.prepare("SELECT id FROM season_calendar WHERE league_id = ? AND scheduled_at BETWEEN ? AND ? AND status = 'scheduled'").bind(leagueId, tStart.toISOString(), tEnd.toISOString()).first()
                                        .catch(function (e) { logger_1.logger.warn({ module: "game" }, "trigger-day-before match lookup", e); return null; })];
                            case 1:
                                tomorrowMatch = _f.sent();
                                if (!tomorrowMatch)
                                    return [2 /*return*/, "continue"];
                                return [4 /*yield*/, c.env.DB.prepare("SELECT id FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE team_id = ? AND type = 'squad_group') AND metadata LIKE ?").bind(teamId, "%".concat(tomorrowMatch.id, "%")).first()
                                        .catch(function (e) { logger_1.logger.warn({ module: "game" }, "trigger-day-before already sent check", e); return null; })];
                            case 2:
                                alreadySent = _f.sent();
                                if (alreadySent)
                                    return [2 /*return*/, "continue"];
                                return [4 /*yield*/, c.env.DB.prepare("SELECT m.home_team_id, m.away_team_id, t1.name as home_name, t2.name as away_name FROM matches m JOIN teams t1 ON m.home_team_id = t1.id JOIN teams t2 ON m.away_team_id = t2.id WHERE m.calendar_id = ? AND (m.home_team_id = ? OR m.away_team_id = ?) LIMIT 1").bind(tomorrowMatch.id, teamId, teamId).first()
                                        .catch(function (e) { logger_1.logger.warn({ module: "game" }, "trigger-day-before match row", e); return null; })];
                            case 3:
                                matchRow = _f.sent();
                                opponentName = matchRow ? (matchRow.home_team_id === teamId ? matchRow.away_name : matchRow.home_name) : "Soupeř";
                                return [4 /*yield*/, c.env.DB.prepare("SELECT p.id, p.first_name, p.last_name, p.age, p.personality, p.life_context, p.physical, p.commute_km, p.is_celebrity, p.suspended_matches\n         FROM players p\n         LEFT JOIN injuries i ON p.id = i.player_id AND i.days_remaining > 0\n         WHERE p.team_id = ? AND (p.status IS NULL OR p.status = 'active')\n           AND i.player_id IS NULL AND (p.suspended_matches IS NULL OR p.suspended_matches = 0)\n         ORDER BY p.overall_rating DESC").bind(teamId).all()];
                            case 4:
                                squadRows = _f.sent();
                                absRng = (0, rng_1.createRng)(absenceSeedForMatch({ matchKey: tomorrowMatch.id, teamId: teamId, phase: "day_before" }));
                                absSquad = squadRows.results.map(function (r) {
                                    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
                                    var pers = (function () { try {
                                        return JSON.parse(r.personality);
                                    }
                                    catch (_a) {
                                        return {};
                                    } })();
                                    var lc = (function () { try {
                                        return JSON.parse(r.life_context);
                                    }
                                    catch (_a) {
                                        return {};
                                    } })();
                                    var phys = (function () { try {
                                        return JSON.parse(r.physical);
                                    }
                                    catch (_a) {
                                        return {};
                                    } })();
                                    return { firstName: r.first_name, lastName: r.last_name, age: (_a = r.age) !== null && _a !== void 0 ? _a : 25, occupation: (_b = lc.occupation) !== null && _b !== void 0 ? _b : "",
                                        discipline: (_c = pers.discipline) !== null && _c !== void 0 ? _c : 50, patriotism: (_d = pers.patriotism) !== null && _d !== void 0 ? _d : 50, alcohol: (_e = pers.alcohol) !== null && _e !== void 0 ? _e : 30, temper: (_f = pers.temper) !== null && _f !== void 0 ? _f : 40,
                                        morale: (_g = lc.morale) !== null && _g !== void 0 ? _g : 50, stamina: (_h = phys.stamina) !== null && _h !== void 0 ? _h : 50, injuryProneness: (_j = pers.injuryProneness) !== null && _j !== void 0 ? _j : 50, commuteKm: (_k = r.commute_km) !== null && _k !== void 0 ? _k : 0,
                                        isCelebrity: !!r.is_celebrity, celebrityType: pers.celebrityType, celebrityTier: pers.celebrityTier };
                                });
                                return [4 /*yield*/, fetchDistrictForTrigger(c.env.DB, teamId)];
                            case 5:
                                triggerDistrict = _f.sent();
                                dayBeforeAbsences = generateAbsences(absRng, absSquad, "day_before", triggerDistrict);
                                absentIds = new Set(dayBeforeAbsences.map(function (a) { var _a; return (_a = squadRows.results[a.playerIndex]) === null || _a === void 0 ? void 0 : _a.id; }));
                                matchConvId = crypto.randomUUID();
                                return [4 /*yield*/, c.env.DB.prepare("INSERT INTO conversations (id, team_id, type, title, pinned, unread_count, last_message_at, created_at) VALUES (?, ?, 'squad_group', ?, 0, 0, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))").bind(matchConvId, teamId, "\u26BD vs ".concat(opponentName)).run()
                                        .catch(function (e) { return logger_1.logger.warn({ module: "game" }, "trigger-day-before create conv", e); })];
                            case 6:
                                _f.sent();
                                totalSquad = squadRows.results.length;
                                return [4 /*yield*/, c.env.DB.prepare("INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, metadata, sent_at) VALUES (?, ?, 'user', ?, 'Trenér', ?, ?, datetime('now', '+' || ? || ' seconds'))").bind(crypto.randomUUID(), matchConvId, teamId, "\uD83D\uDCCB Z\u00EDtra hrajeme proti ".concat(opponentName, "! Kdo m\u016F\u017Ee?"), JSON.stringify({ type: "match_announce", calendarId: tomorrowMatch.id }), 0).run()
                                        .catch(function (e) { return logger_1.logger.warn({ module: "game" }, "trigger-day-before announce", e); })];
                            case 7:
                                _f.sent();
                                msgCount = 1;
                                _loop_4 = function (row) {
                                    var pid, absence, available, lc, msg;
                                    return __generator(this, function (_g) {
                                        switch (_g.label) {
                                            case 0:
                                                pid = row.id;
                                                absence = dayBeforeAbsences.find(function (a) { var _a; return ((_a = squadRows.results[a.playerIndex]) === null || _a === void 0 ? void 0 : _a.id) === pid; });
                                                available = !absentIds.has(pid);
                                                lc = (function () { try {
                                                    return JSON.parse(row.life_context);
                                                }
                                                catch (_a) {
                                                    return {};
                                                } })();
                                                msg = generateAttendanceMessage("".concat(row.first_name, " ").concat(row.last_name), available, (_b = lc.condition) !== null && _b !== void 0 ? _b : 100, absRng);
                                                return [4 /*yield*/, c.env.DB.prepare("INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, metadata, sent_at) VALUES (?, ?, 'player', ?, ?, ?, ?, datetime('now', '+' || ? || ' seconds'))").bind(crypto.randomUUID(), matchConvId, pid, msg.senderName, absence ? absence.smsText : msg.body, JSON.stringify({ type: "attendance", response: available ? "yes" : "no", timing: "day_before", calendarId: tomorrowMatch.id }), msgCount * 10).run().catch(function (e) { return logger_1.logger.warn({ module: "game" }, "trigger-day-before player msg", e); })];
                                            case 1:
                                                _g.sent();
                                                msgCount++;
                                                return [2 /*return*/];
                                        }
                                    });
                                };
                                _d = 0, _e = squadRows.results;
                                _f.label = 8;
                            case 8:
                                if (!(_d < _e.length)) return [3 /*break*/, 11];
                                row = _e[_d];
                                return [5 /*yield**/, _loop_4(row)];
                            case 9:
                                _f.sent();
                                _f.label = 10;
                            case 10:
                                _d++;
                                return [3 /*break*/, 8];
                            case 11: return [4 /*yield*/, c.env.DB.prepare("UPDATE conversations SET unread_count = ?, last_message_text = ?, last_message_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?").bind(msgCount, "\uD83D\uDCCB ".concat(dayBeforeAbsences.length, " omluven\u00FDch z ").concat(squadRows.results.length), matchConvId).run()
                                    .catch(function (e) { return logger_1.logger.warn({ module: "game" }, "trigger-day-before conv update", e); })];
                            case 12:
                                _f.sent();
                                processed++;
                                return [2 /*return*/];
                        }
                    });
                };
                _i = 0, _a = teams.results;
                _c.label = 6;
            case 6:
                if (!(_i < _a.length)) return [3 /*break*/, 9];
                team = _a[_i];
                return [5 /*yield**/, _loop_3(team)];
            case 7:
                _c.sent();
                _c.label = 8;
            case 8:
                _i++;
                return [3 /*break*/, 6];
            case 9: return [2 /*return*/, c.json({ ok: true, leagueId: leagueId, processed: processed })];
        }
    });
}); });
// POST /api/admin/news/:newsId/regenerate-interview — přegeneruje článek z uložených QA
gameRouter.post("/admin/news/:newsId/regenerate-interview", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var newsId, generateInterviewArticle, row, body, opponentMatch, opponentName, geminiKey, result, correctionNote, newBody, newHeadline;
    var _a, _b, _c;
    return __generator(this, function (_d) {
        switch (_d.label) {
            case 0:
                newsId = c.req.param("newsId");
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../news/interview-generator"); })];
            case 1:
                generateInterviewArticle = (_d.sent()).generateInterviewArticle;
                return [4 /*yield*/, c.env.DB.prepare("SELECT * FROM news WHERE id = ?")
                        .bind(newsId)
                        .first()
                        .catch(function (e) { logger_1.logger.warn({ module: "game" }, "regenerate-interview fetch", e); return null; })];
            case 2:
                row = _d.sent();
                if (!row)
                    return [2 /*return*/, c.json({ error: "news not found" }, 404)];
                body = JSON.parse(row.body);
                if (!((_a = body.qa) === null || _a === void 0 ? void 0 : _a.length))
                    return [2 /*return*/, c.json({ error: "no qa in article" }, 400)];
                opponentMatch = row.headline.match(/vs\.\s+(.+?)["„]/);
                opponentName = (_c = (_b = opponentMatch === null || opponentMatch === void 0 ? void 0 : opponentMatch[1]) === null || _b === void 0 ? void 0 : _b.trim()) !== null && _c !== void 0 ? _c : "soupeř";
                geminiKey = c.env.GEMINI_API_KEY;
                return [4 /*yield*/, generateInterviewArticle(geminiKey, body.qa, body.managerName, body.teamName, opponentName)];
            case 3:
                result = _d.sent();
                if (!result)
                    return [2 /*return*/, c.json({ error: "gemini failed" }, 500)];
                correctionNote = "\n\n— Oprava: Předchozí verze článku chybně upravila záměrné slovní hříčky trenéra jako překlepy. Za nedorozumění se omlouváme — chyba byla na straně redaktora.";
                newBody = JSON.stringify(__assign(__assign({}, body), { article: result.body + correctionNote }));
                newHeadline = result.headline.replace(/\[oprava\]$/, "").trim() + " [oprava]";
                return [4 /*yield*/, c.env.DB.prepare("UPDATE news SET headline = ?, body = ? WHERE id = ?")
                        .bind(newHeadline, newBody, newsId)
                        .run()
                        .catch(function (e) { logger_1.logger.warn({ module: "game" }, "regenerate-interview update", e); })];
            case 4:
                _d.sent();
                return [2 /*return*/, c.json({ ok: true, newsId: newsId, headline: newHeadline, articlePreview: result.body.slice(0, 200) })];
        }
    });
}); });
