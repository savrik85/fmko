"use strict";
/**
 * Vztahy mezi manažery — API.
 *
 * GET  /teams/:teamId/relations            — přehled vztahů týmu v lize
 * GET  /teams/:teamId/relations/:otherId   — detail vztahu + dostupné interakce
 * POST /teams/:teamId/relations/:otherId/interact — provedení interakce
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
exports.relationsRouter = void 0;
var hono_1 = require("hono");
var logger_1 = require("../lib/logger");
var manager_relations_1 = require("../community/manager-relations");
var finance_processor_1 = require("../season/finance-processor");
var notifications_1 = require("../community/notifications");
var middleware_1 = require("../auth/middleware");
var relation_texts_1 = require("../community/relation-texts");
exports.relationsRouter = new hono_1.Hono();
/** Okres týmu (pro lokalizaci relation textů). Neznámý → undefined → generický core. */
function districtOfTeam(db, teamId) {
    return __awaiter(this, void 0, void 0, function () {
        var row;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, db.prepare("SELECT v.district FROM teams t LEFT JOIN villages v ON t.village_id = v.id WHERE t.id = ?")
                        .bind(teamId).first()
                        .catch(function (e) { logger_1.logger.warn({ module: "relations" }, "load district", e); return null; })];
                case 1:
                    row = _b.sent();
                    return [2 /*return*/, (_a = row === null || row === void 0 ? void 0 : row.district) !== null && _a !== void 0 ? _a : undefined];
            }
        });
    });
}
// Write operace (interact, posezení, runda) smí provádět jen vlastník týmu z :teamId.
exports.relationsRouter.use("/teams/:teamId/relations/*", middleware_1.requireTeamOwnership);
exports.relationsRouter.use("/teams/:teamId/stammtisch", middleware_1.requireTeamOwnership);
exports.relationsRouter.use("/teams/:teamId/stammtisch-invite/*", middleware_1.requireTeamOwnership);
exports.relationsRouter.use("/teams/:teamId/pub-round", middleware_1.requireTeamOwnership);
var BEER_COST = 50;
var BET_AMOUNT = 500;
var AD_COST = 100;
var GIFT_COST = 80;
var BEER_COOLDOWN_DAYS = 7;
var AD_COOLDOWN_DAYS = 14;
var PRAISE_COOLDOWN_DAYS = 7;
var BEER_MIN_RESPECT = 30;
/**
 * Poslední odehraný zápas týmu `a` — ale jen pokud byl proti `b`.
 * Pozápasové interakce (gesto, dárek) se vážou na čerstvý zážitek: jakmile tým
 * odehraje další zápas, moment u kabin je pryč.
 */
function lastMutualFinishedMatch(db, a, b) {
    return __awaiter(this, void 0, void 0, function () {
        var last, opponent;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db.prepare("SELECT id, home_team_id, away_team_id, home_score, away_score, status, round, league_id\n     FROM matches\n     WHERE status IN ('simulated', 'finished')\n       AND (home_team_id = ? OR away_team_id = ?)\n     ORDER BY simulated_at DESC LIMIT 1").bind(a, a).first()];
                case 1:
                    last = _a.sent();
                    if (!last)
                        return [2 /*return*/, null];
                    opponent = last.home_team_id === a ? last.away_team_id : last.home_team_id;
                    return [2 /*return*/, opponent === b ? last : null];
            }
        });
    });
}
function nextMutualMatch(db, a, b) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db.prepare("SELECT id, home_team_id, away_team_id, home_score, away_score, status, round, league_id\n     FROM matches\n     WHERE status IN ('scheduled', 'lineups_open')\n       AND ((home_team_id = ? AND away_team_id = ?) OR (home_team_id = ? AND away_team_id = ?))\n     ORDER BY round ASC LIMIT 1").bind(a, b, b, a).first()];
                case 1: return [2 /*return*/, _a.sent()];
            }
        });
    });
}
function hasInteraction(db, type, actorId, matchId) {
    return __awaiter(this, void 0, void 0, function () {
        var row;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db.prepare("SELECT id FROM manager_interactions WHERE type = ? AND actor_team_id = ? AND match_id = ? LIMIT 1").bind(type, actorId, matchId).first()];
                case 1:
                    row = _a.sent();
                    return [2 /*return*/, !!row];
            }
        });
    });
}
function lastInteractionAt(db, type, teamA, teamB) {
    return __awaiter(this, void 0, void 0, function () {
        var row;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, db.prepare("SELECT created_at FROM manager_interactions\n     WHERE type = ? AND ((actor_team_id = ? AND target_team_id = ?) OR (actor_team_id = ? AND target_team_id = ?))\n     ORDER BY created_at DESC LIMIT 1").bind(type, teamA, teamB, teamB, teamA).first()];
                case 1:
                    row = _b.sent();
                    return [2 /*return*/, (_a = row === null || row === void 0 ? void 0 : row.created_at) !== null && _a !== void 0 ? _a : null];
            }
        });
    });
}
function daysSince(iso) {
    if (!iso)
        return Infinity;
    return (Date.now() - new Date(iso).getTime()) / 86400000;
}
function insertInteraction(db_1, type_1, actorId_1, targetId_1, matchId_1, payload_1) {
    return __awaiter(this, arguments, void 0, function (db, type, actorId, targetId, matchId, payload, status) {
        var id;
        if (status === void 0) { status = "resolved"; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    id = crypto.randomUUID();
                    return [4 /*yield*/, db.prepare("INSERT INTO manager_interactions (id, type, actor_team_id, target_team_id, match_id, payload, status) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id, type, actorId, targetId, matchId, JSON.stringify(payload), status).run()];
                case 1:
                    _a.sent();
                    return [2 /*return*/, id];
            }
        });
    });
}
var STAMMTISCH_COOLDOWN_DAYS = 14;
var STAMMTISCH_COST_PER_HEAD = 80;
var STAMMTISCH_RESERVATION_FEE = 100;
// ────────────────────────────────────────────────────────────────────────────
// GET /teams/:teamId/social-info — dostupnost posezení s trenéry a rundy
// ────────────────────────────────────────────────────────────────────────────
exports.relationsRouter.get("/teams/:teamId/social-info", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, db, lastStammtisch, stammtischPlanned, stammtischCooldownLeft, plannedInvites, eventId, inv, lastMatch, pubRound, myScore, theirScore, existing, invitesRes;
    var _a, _b, _c;
    return __generator(this, function (_d) {
        switch (_d.label) {
            case 0:
                teamId = c.req.param("teamId");
                db = c.env.DB;
                return [4 /*yield*/, db.prepare("SELECT id, created_at, status, payload FROM manager_interactions WHERE type = 'stammtisch' AND actor_team_id = ? ORDER BY created_at DESC LIMIT 1").bind(teamId).first()];
            case 1:
                lastStammtisch = _d.sent();
                stammtischPlanned = (lastStammtisch === null || lastStammtisch === void 0 ? void 0 : lastStammtisch.status) === "planned";
                stammtischCooldownLeft = Math.max(0, Math.ceil(STAMMTISCH_COOLDOWN_DAYS - daysSince((_a = lastStammtisch === null || lastStammtisch === void 0 ? void 0 : lastStammtisch.created_at) !== null && _a !== void 0 ? _a : null)));
                plannedInvites = [];
                if (!(stammtischPlanned && lastStammtisch)) return [3 /*break*/, 3];
                eventId = null;
                try {
                    eventId = (_c = (_b = JSON.parse(lastStammtisch.payload)) === null || _b === void 0 ? void 0 : _b.eventId) !== null && _c !== void 0 ? _c : null;
                }
                catch (e) {
                    logger_1.logger.warn({ module: "relations" }, "parse planned stammtisch payload", e);
                }
                if (!eventId) return [3 /*break*/, 3];
                return [4 /*yield*/, db.prepare("SELECT mi.target_team_id, mi.status, t.name as team_name, m.name as manager_name\n         FROM manager_interactions mi\n         JOIN teams t ON t.id = mi.target_team_id\n         LEFT JOIN managers m ON m.team_id = mi.target_team_id\n         WHERE mi.type = 'stammtisch_invite' AND mi.actor_team_id = ?\n           AND json_extract(mi.payload, '$.eventId') = ?").bind(teamId, eventId).all()];
            case 2:
                inv = _d.sent();
                plannedInvites = inv.results.map(function (r) {
                    var _a;
                    return ({
                        teamId: r.target_team_id,
                        teamName: r.team_name,
                        managerName: (_a = r.manager_name) !== null && _a !== void 0 ? _a : "Tren\u00E9r ".concat(r.team_name),
                        status: r.status,
                    });
                });
                _d.label = 3;
            case 3: return [4 /*yield*/, db.prepare("SELECT id, home_team_id, home_score, away_score FROM matches\n     WHERE status IN ('simulated', 'finished') AND (home_team_id = ? OR away_team_id = ?)\n     ORDER BY simulated_at DESC LIMIT 1").bind(teamId, teamId).first()];
            case 4:
                lastMatch = _d.sent();
                pubRound = { available: false, planned: false, reason: "Žádný odehraný zápas." };
                if (!lastMatch) return [3 /*break*/, 6];
                myScore = lastMatch.home_team_id === teamId ? lastMatch.home_score : lastMatch.away_score;
                theirScore = lastMatch.home_team_id === teamId ? lastMatch.away_score : lastMatch.home_score;
                return [4 /*yield*/, db.prepare("SELECT status FROM manager_interactions WHERE type = 'pub_round' AND actor_team_id = ? AND match_id = ? LIMIT 1").bind(teamId, lastMatch.id).first()];
            case 5:
                existing = _d.sent();
                if ((existing === null || existing === void 0 ? void 0 : existing.status) === "planned") {
                    pubRound = { available: false, planned: true, reason: "Runda je slíbená — večer se v hospodě roztočí." };
                }
                else if (existing) {
                    pubRound = { available: false, planned: false, reason: "Za tuhle výhru už hospoda pila." };
                }
                else if (myScore <= theirScore) {
                    pubRound = { available: false, planned: false, reason: "Runda se kupuje po výhře. Nejdřív vyhraj." };
                }
                else {
                    pubRound = { available: true, planned: false, reason: null };
                }
                _d.label = 6;
            case 6: return [4 /*yield*/, db.prepare("SELECT mi.id, mi.actor_team_id, t.name as host_team, m.name as host_manager\n     FROM manager_interactions mi\n     JOIN teams t ON t.id = mi.actor_team_id\n     LEFT JOIN managers m ON m.team_id = mi.actor_team_id\n     WHERE mi.type = 'stammtisch_invite' AND mi.target_team_id = ? AND mi.status = 'invited'\n     ORDER BY mi.created_at DESC").bind(teamId).all()];
            case 7:
                invitesRes = _d.sent();
                return [2 /*return*/, c.json({
                        stammtisch: {
                            available: !stammtischPlanned && stammtischCooldownLeft === 0,
                            planned: stammtischPlanned,
                            cooldownDaysLeft: stammtischCooldownLeft === Infinity ? 0 : stammtischCooldownLeft,
                            costPerHead: STAMMTISCH_COST_PER_HEAD,
                            plannedInvites: plannedInvites,
                        },
                        pubRound: pubRound,
                        incomingInvites: invitesRes.results.map(function (i) {
                            var _a;
                            return ({
                                id: i.id,
                                hostTeamId: i.actor_team_id,
                                hostTeam: i.host_team,
                                hostManager: (_a = i.host_manager) !== null && _a !== void 0 ? _a : "Tren\u00E9r ".concat(i.host_team),
                            });
                        }),
                    })];
        }
    });
}); });
// ────────────────────────────────────────────────────────────────────────────
// GET /teams/:teamId/relations — přehled
// ────────────────────────────────────────────────────────────────────────────
exports.relationsRouter.get("/teams/:teamId/relations", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, team, rows, relations;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                teamId = c.req.param("teamId");
                return [4 /*yield*/, c.env.DB.prepare("SELECT league_id FROM teams WHERE id = ?")
                        .bind(teamId).first()];
            case 1:
                team = _a.sent();
                if (!(team === null || team === void 0 ? void 0 : team.league_id))
                    return [2 /*return*/, c.json({ relations: [] })];
                return [4 /*yield*/, c.env.DB.prepare("SELECT t.id as other_team_id, t.name as team_name, t.primary_color,\n            m.name as manager_name, m.user_id as manager_user_id,\n            r.respect, r.heat, r.history\n     FROM teams t\n     LEFT JOIN managers m ON m.team_id = t.id\n     LEFT JOIN manager_relations r\n       ON (r.team_a_id = MIN(t.id, ?) AND r.team_b_id = MAX(t.id, ?))\n     WHERE t.league_id = ? AND t.id != ?").bind(teamId, teamId, team.league_id, teamId).all()];
            case 2:
                rows = _a.sent();
                relations = rows.results.map(function (r) {
                    var _a, _b, _c;
                    var respect = (_a = r.respect) !== null && _a !== void 0 ? _a : 0;
                    var heat = (_b = r.heat) !== null && _b !== void 0 ? _b : 0;
                    var isAi = !r.manager_user_id || r.manager_user_id === "ai";
                    var history = [];
                    try {
                        history = r.history ? JSON.parse(r.history) : [];
                    }
                    catch (_d) {
                        history = [];
                    }
                    return {
                        teamId: r.other_team_id,
                        teamName: r.team_name,
                        primaryColor: r.primary_color,
                        managerName: (_c = r.manager_name) !== null && _c !== void 0 ? _c : "Tren\u00E9r ".concat(r.team_name),
                        isAi: isAi,
                        archetypeLabel: isAi ? manager_relations_1.AI_ARCHETYPE_LABELS[(0, manager_relations_1.aiArchetype)(r.other_team_id)] : null,
                        respect: respect,
                        heat: heat,
                        status: (0, manager_relations_1.relationStatus)(respect, heat),
                        label: (0, manager_relations_1.relationLabel)(respect, heat),
                        loyalAlly: (0, manager_relations_1.isLoyalAlly)(history),
                    };
                }).sort(function (a, b) { return (Math.abs(b.respect) + b.heat) - (Math.abs(a.respect) + a.heat); });
                return [2 /*return*/, c.json({ relations: relations })];
        }
    });
}); });
// ────────────────────────────────────────────────────────────────────────────
// GET /teams/:teamId/relations/:otherId — detail + dostupné interakce
// ────────────────────────────────────────────────────────────────────────────
exports.relationsRouter.get("/teams/:teamId/relations/:otherId", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, otherId, db, otherExists, rel, otherIsAi, _a, lastMatch, nextMatch, gesture, gift, myScore, theirScore, score, _b, beerAt, beerCooldownLeft, beer, statement, _c, bet, pendingBet, existing, praiseAt, praiseCooldownLeft, adAt, adCooldownLeft;
    return __generator(this, function (_d) {
        switch (_d.label) {
            case 0:
                teamId = c.req.param("teamId");
                otherId = c.req.param("otherId");
                if (teamId === otherId)
                    return [2 /*return*/, c.json({ error: "Vztah sám se sebou neexistuje. Zatím." }, 400)];
                db = c.env.DB;
                return [4 /*yield*/, db.prepare("SELECT id FROM teams WHERE id = ?").bind(otherId).first()];
            case 1:
                otherExists = _d.sent();
                if (!otherExists)
                    return [2 /*return*/, c.json({ error: "Tým nenalezen." }, 404)];
                return [4 /*yield*/, (0, manager_relations_1.getRelation)(db, teamId, otherId)];
            case 2:
                rel = _d.sent();
                return [4 /*yield*/, (0, manager_relations_1.isAiTeam)(db, otherId)];
            case 3:
                otherIsAi = _d.sent();
                return [4 /*yield*/, Promise.all([
                        lastMutualFinishedMatch(db, teamId, otherId),
                        nextMutualMatch(db, teamId, otherId),
                    ])];
            case 4:
                _a = _d.sent(), lastMatch = _a[0], nextMatch = _a[1];
                gesture = null;
                gift = null;
                if (!(lastMatch && lastMatch.home_score != null && lastMatch.away_score != null)) return [3 /*break*/, 8];
                myScore = lastMatch.home_team_id === teamId ? lastMatch.home_score : lastMatch.away_score;
                theirScore = lastMatch.home_team_id === teamId ? lastMatch.away_score : lastMatch.home_score;
                score = "".concat(lastMatch.home_score, ":").concat(lastMatch.away_score);
                return [4 /*yield*/, hasInteraction(db, "gesture", teamId, lastMatch.id)];
            case 5:
                if (!(_d.sent())) {
                    gesture = { matchId: lastMatch.id, score: score, won: myScore > theirScore };
                }
                _b = myScore - theirScore >= 4;
                if (!_b) return [3 /*break*/, 7];
                return [4 /*yield*/, hasInteraction(db, "gift", teamId, lastMatch.id)];
            case 6:
                _b = !(_d.sent());
                _d.label = 7;
            case 7:
                if (_b) {
                    gift = { matchId: lastMatch.id, score: score };
                }
                _d.label = 8;
            case 8: return [4 /*yield*/, lastInteractionAt(db, "beer", teamId, otherId)];
            case 9:
                beerAt = _d.sent();
                beerCooldownLeft = Math.max(0, Math.ceil(BEER_COOLDOWN_DAYS - daysSince(beerAt)));
                beer = {
                    available: rel.respect >= BEER_MIN_RESPECT && beerCooldownLeft === 0,
                    minRespect: BEER_MIN_RESPECT,
                    cooldownDaysLeft: beerCooldownLeft === Infinity ? 0 : beerCooldownLeft,
                    cost: BEER_COST,
                };
                statement = null;
                _c = nextMatch;
                if (!_c) return [3 /*break*/, 11];
                return [4 /*yield*/, hasInteraction(db, "statement", teamId, nextMatch.id)];
            case 10:
                _c = !(_d.sent());
                _d.label = 11;
            case 11:
                if (_c) {
                    statement = { matchId: nextMatch.id, round: nextMatch.round };
                }
                bet = null;
                pendingBet = null;
                if (!nextMatch) return [3 /*break*/, 13];
                return [4 /*yield*/, db.prepare("SELECT actor_team_id, status FROM manager_interactions\n       WHERE type = 'bet' AND match_id = ? AND status IN ('pending', 'offered') LIMIT 1").bind(nextMatch.id).first()];
            case 12:
                existing = _d.sent();
                if (existing) {
                    pendingBet = { matchId: nextMatch.id, status: existing.status, offeredByMe: existing.actor_team_id === teamId };
                }
                else {
                    bet = { matchId: nextMatch.id, round: nextMatch.round, amount: BET_AMOUNT };
                }
                _d.label = 13;
            case 13: return [4 /*yield*/, lastInteractionAt(db, "praise", teamId, otherId)];
            case 14:
                praiseAt = _d.sent();
                praiseCooldownLeft = Math.max(0, Math.ceil(PRAISE_COOLDOWN_DAYS - daysSince(praiseAt)));
                return [4 /*yield*/, lastInteractionAt(db, "ad", teamId, otherId)];
            case 15:
                adAt = _d.sent();
                adCooldownLeft = Math.max(0, Math.ceil(AD_COOLDOWN_DAYS - daysSince(adAt)));
                return [2 /*return*/, c.json({
                        respect: rel.respect,
                        heat: rel.heat,
                        status: (0, manager_relations_1.relationStatus)(rel.respect, rel.heat),
                        label: (0, manager_relations_1.relationLabel)(rel.respect, rel.heat),
                        loyalAlly: (0, manager_relations_1.isLoyalAlly)(rel.history),
                        history: rel.history,
                        otherIsAi: otherIsAi,
                        archetypeLabel: otherIsAi ? manager_relations_1.AI_ARCHETYPE_LABELS[(0, manager_relations_1.aiArchetype)(otherId)] : null,
                        interactions: {
                            gesture: gesture,
                            gift: gift,
                            beer: beer,
                            bet: bet,
                            pendingBet: pendingBet,
                            statement: statement,
                            praise: { available: praiseCooldownLeft === 0, cooldownDaysLeft: praiseCooldownLeft === Infinity ? 0 : praiseCooldownLeft },
                            ad: { available: adCooldownLeft === 0, cooldownDaysLeft: adCooldownLeft === Infinity ? 0 : adCooldownLeft, cost: AD_COST },
                        },
                    })];
        }
    });
}); });
exports.relationsRouter.post("/teams/:teamId/relations/:otherId/interact", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, otherId, db, body, otherExists, _a, myName, theirName, myManager, theirManager, otherIsAi, gameDate, names, _b, choice, match, _c, resultText, _d, _e, _f, _g, aiResponseText, myScore, theirScore, resp, praiseAt, myTeamRow, praiseArticle, _h, _j, aiResponseText, archetype, deltas, r, rel, beerAt, purchase, dartsText, won, match, existing, purchase, rel, offer, purchase, tone, match, roundLabel, message, _k, _l, _m, _o, _p, _q, _r, _s, aiResponseText, resp, adAt, purchase, team, adText, revealed, tone, match, _t, myScore, theirScore, purchase, message, e_1;
    var _u, _v, _w;
    return __generator(this, function (_x) {
        switch (_x.label) {
            case 0:
                teamId = c.req.param("teamId");
                otherId = c.req.param("otherId");
                if (teamId === otherId)
                    return [2 /*return*/, c.json({ error: "Neplatný cíl." }, 400)];
                db = c.env.DB;
                return [4 /*yield*/, c.req.json().catch(function (e) {
                        logger_1.logger.warn({ module: "relations" }, "parse interact body", e);
                        return null;
                    })];
            case 1:
                body = _x.sent();
                if (!(body === null || body === void 0 ? void 0 : body.type))
                    return [2 /*return*/, c.json({ error: "Chybí typ interakce." }, 400)];
                return [4 /*yield*/, db.prepare("SELECT id FROM teams WHERE id = ?").bind(otherId).first()];
            case 2:
                otherExists = _x.sent();
                if (!otherExists)
                    return [2 /*return*/, c.json({ error: "Tým nenalezen." }, 404)];
                return [4 /*yield*/, Promise.all([
                        (0, manager_relations_1.getTeamName)(db, teamId), (0, manager_relations_1.getTeamName)(db, otherId),
                        (0, manager_relations_1.getManagerName)(db, teamId), (0, manager_relations_1.getManagerName)(db, otherId),
                    ])];
            case 3:
                _a = _x.sent(), myName = _a[0], theirName = _a[1], myManager = _a[2], theirManager = _a[3];
                return [4 /*yield*/, (0, manager_relations_1.isAiTeam)(db, otherId)];
            case 4:
                otherIsAi = _x.sent();
                return [4 /*yield*/, (0, manager_relations_1.getTeamGameDate)(db, teamId)];
            case 5:
                gameDate = _x.sent();
                names = { myName: myName, theirName: theirName, myManager: myManager, theirManager: theirManager };
                _x.label = 6;
            case 6:
                _x.trys.push([6, 131, , 132]);
                _b = body.type;
                switch (_b) {
                    case "gesture": return [3 /*break*/, 7];
                    case "praise": return [3 /*break*/, 30];
                    case "beer": return [3 /*break*/, 41];
                    case "bet": return [3 /*break*/, 57];
                    case "bet_accept": return [3 /*break*/, 69];
                    case "bet_decline": return [3 /*break*/, 69];
                    case "statement": return [3 /*break*/, 77];
                    case "ad": return [3 /*break*/, 101];
                    case "gift": return [3 /*break*/, 113];
                }
                return [3 /*break*/, 129];
            case 7:
                choice = body.choice;
                if (!choice || !["handshake", "silent", "jab"].includes(choice)) {
                    return [2 /*return*/, c.json({ error: "Neplatná volba gesta." }, 400)];
                }
                if (!body.matchId) return [3 /*break*/, 9];
                return [4 /*yield*/, lastMutualFinishedMatch(db, teamId, otherId)];
            case 8:
                _c = _x.sent();
                return [3 /*break*/, 10];
            case 9:
                _c = null;
                _x.label = 10;
            case 10:
                match = _c;
                if (!match || match.id !== body.matchId)
                    return [2 /*return*/, c.json({ error: "Zápas nenalezen nebo už není aktuální." }, 400)];
                return [4 /*yield*/, hasInteraction(db, "gesture", teamId, match.id)];
            case 11:
                if (_x.sent()) {
                    return [2 /*return*/, c.json({ error: "Gesto po tomto zápase už proběhlo." }, 400)];
                }
                resultText = void 0;
                if (!(choice === "handshake")) return [3 /*break*/, 13];
                return [4 /*yield*/, (0, manager_relations_1.applyRelationEvent)(db, teamId, otherId, {
                        respect: 5, icon: "🤝", text: "".concat(myManager, " podal po z\u00E1pase ruku"),
                    })];
            case 12:
                _x.sent();
                resultText = "Podal jsi ruku.";
                return [3 /*break*/, 21];
            case 13:
                if (!(choice === "jab")) return [3 /*break*/, 20];
                return [4 /*yield*/, (0, manager_relations_1.applyRelationEvent)(db, teamId, otherId, {
                        heat: 10, icon: "🗞️", text: "".concat(myManager, " si r\u00FDpl do novin na \u00FA\u010Det ").concat(theirName),
                    })];
            case 14:
                _x.sent();
                return [4 /*yield*/, (0, manager_relations_1.shiftSquadMorale)(db, teamId, 2)];
            case 15:
                _x.sent();
                _d = manager_relations_1.insertRelationNews;
                _e = [db, match.league_id, "".concat(myManager, " si po z\u00E1pase pustil pusu na \u0161pac\u00EDr")];
                _f = relation_texts_1.jabNewsBody;
                _g = [names];
                return [4 /*yield*/, districtOfTeam(db, teamId)];
            case 16: return [4 /*yield*/, _d.apply(void 0, _e.concat([_f.apply(void 0, _g.concat([_x.sent()])),
                    teamId]))];
            case 17:
                _x.sent();
                if (!!otherIsAi) return [3 /*break*/, 19];
                return [4 /*yield*/, (0, notifications_1.createNotification)(db, otherId, "event", "🗞️ Rýpnutí v novinách", "Tren\u00E9r ".concat(myName, " si na tebe otev\u0159el pusu v novin\u00E1ch. Nech\u00E1\u0161 to tak?"), "/dashboard/manager/".concat(teamId), c.env)
                        .catch(function (e) { return logger_1.logger.warn({ module: "relations" }, "jab notification", e); })];
            case 18:
                _x.sent();
                _x.label = 19;
            case 19:
                resultText = "Rýpnutí je v novinách. Kabina se baví.";
                return [3 /*break*/, 21];
            case 20:
                resultText = "Odešel jsi beze slova.";
                _x.label = 21;
            case 21:
                aiResponseText = null;
                if (!otherIsAi) return [3 /*break*/, 28];
                myScore = match.home_team_id === teamId ? match.home_score : match.away_score;
                theirScore = match.home_team_id === teamId ? match.away_score : match.home_score;
                resp = (0, manager_relations_1.aiGestureResponse)((0, manager_relations_1.aiArchetype)(otherId), choice, theirScore > myScore);
                if (!(resp.choice === "handshake")) return [3 /*break*/, 23];
                return [4 /*yield*/, (0, manager_relations_1.applyRelationEvent)(db, teamId, otherId, {
                        respect: 3, icon: "🤝", text: "".concat(theirManager, " ").concat(resp.flavor),
                    })];
            case 22:
                _x.sent();
                return [3 /*break*/, 27];
            case 23:
                if (!(resp.choice === "jab")) return [3 /*break*/, 25];
                return [4 /*yield*/, (0, manager_relations_1.applyRelationEvent)(db, teamId, otherId, {
                        heat: 8, icon: "💢", text: "".concat(theirManager, " ").concat(resp.flavor),
                    })];
            case 24:
                _x.sent();
                return [3 /*break*/, 27];
            case 25: return [4 /*yield*/, (0, manager_relations_1.applyRelationEvent)(db, teamId, otherId, {
                    icon: "🚪", text: "".concat(theirManager, " ").concat(resp.flavor),
                })];
            case 26:
                _x.sent();
                _x.label = 27;
            case 27:
                aiResponseText = "".concat(theirManager, " ").concat(resp.flavor, ".");
                _x.label = 28;
            case 28: return [4 /*yield*/, insertInteraction(db, "gesture", teamId, otherId, match.id, { choice: choice })];
            case 29:
                _x.sent();
                return [2 /*return*/, c.json({ ok: true, message: resultText, aiResponse: aiResponseText })];
            case 30: return [4 /*yield*/, lastInteractionAt(db, "praise", teamId, otherId)];
            case 31:
                praiseAt = _x.sent();
                if (daysSince(praiseAt) < PRAISE_COOLDOWN_DAYS) {
                    return [2 /*return*/, c.json({ error: "Chválil jsi nedávno. Moc cukru kazí zuby." }, 400)];
                }
                return [4 /*yield*/, (0, manager_relations_1.applyRelationEvent)(db, teamId, otherId, {
                        respect: 4, icon: "👏", text: "".concat(myManager, " pochv\u00E1lil pr\u00E1ci, kterou ").concat(theirManager, " v ").concat(theirName, " odv\u00E1d\u00ED"),
                    })];
            case 32:
                _x.sent();
                return [4 /*yield*/, db.prepare("SELECT league_id FROM teams WHERE id = ?")
                        .bind(teamId).first()];
            case 33:
                myTeamRow = _x.sent();
                _h = relation_texts_1.praiseNews;
                _j = [names];
                return [4 /*yield*/, districtOfTeam(db, teamId)];
            case 34:
                praiseArticle = _h.apply(void 0, _j.concat([_x.sent()]));
                return [4 /*yield*/, (0, manager_relations_1.insertRelationNews)(db, (_u = myTeamRow === null || myTeamRow === void 0 ? void 0 : myTeamRow.league_id) !== null && _u !== void 0 ? _u : null, praiseArticle.headline, praiseArticle.body, teamId)];
            case 35:
                _x.sent();
                aiResponseText = null;
                if (!otherIsAi) return [3 /*break*/, 37];
                archetype = (0, manager_relations_1.aiArchetype)(otherId);
                deltas = {
                    ferovka: { respect: 2, heat: 0 },
                    pohodar: { respect: 2, heat: 0 },
                    urazeny: { respect: 1, heat: 0 },
                    provokater: { respect: 1, heat: -2 },
                };
                r = deltas[archetype];
                return [4 /*yield*/, (0, manager_relations_1.applyRelationEvent)(db, teamId, otherId, {
                        respect: r.respect, heat: r.heat, icon: "🗣️", text: "".concat(theirManager, " pochvalu ocenil"),
                    })];
            case 36:
                _x.sent();
                aiResponseText = (0, relation_texts_1.praiseReplyText)(archetype, names);
                return [3 /*break*/, 39];
            case 37: return [4 /*yield*/, (0, notifications_1.createNotification)(db, otherId, "event", "👏 Pochvala od kolegy", "Tren\u00E9r ".concat(myName, " ocenil pr\u00E1ci, kterou v klubu odv\u00E1d\u00ED\u0161. Respekt mezi v\u00E1mi roste."), "/dashboard/manager/".concat(teamId), c.env)
                    .catch(function (e) { return logger_1.logger.warn({ module: "relations" }, "praise notification", e); })];
            case 38:
                _x.sent();
                _x.label = 39;
            case 39: return [4 /*yield*/, insertInteraction(db, "praise", teamId, otherId, null, {})];
            case 40:
                _x.sent();
                return [2 /*return*/, c.json({ ok: true, message: "Vzk\u00E1zal jsi tren\u00E9rovi ".concat(theirName, " uzn\u00E1n\u00ED."), aiResponse: aiResponseText })];
            case 41: return [4 /*yield*/, (0, manager_relations_1.getRelation)(db, teamId, otherId)];
            case 42:
                rel = _x.sent();
                if (rel.respect < BEER_MIN_RESPECT) {
                    return [2 /*return*/, c.json({ error: "Na pivo pot\u0159ebuje\u0161 aspo\u0148 trochu respektu (".concat(BEER_MIN_RESPECT, "+).") }, 400)];
                }
                return [4 /*yield*/, lastInteractionAt(db, "beer", teamId, otherId)];
            case 43:
                beerAt = _x.sent();
                if (daysSince(beerAt) < BEER_COOLDOWN_DAYS) {
                    return [2 /*return*/, c.json({ error: "Na pivo jste spolu byli nedávno. Nepřeháněj to." }, 400)];
                }
                return [4 /*yield*/, (0, finance_processor_1.assertPurchaseAllowed)(db, teamId, BEER_COST)];
            case 44:
                purchase = _x.sent();
                if (!purchase.ok)
                    return [2 /*return*/, c.json({ error: purchase.reason }, 400)];
                if (!(otherIsAi && (0, manager_relations_1.aiArchetype)(otherId) === "urazeny" && rel.heat > 50)) return [3 /*break*/, 46];
                return [4 /*yield*/, insertInteraction(db, "beer", teamId, otherId, null, { declined: true })];
            case 45:
                _x.sent();
                return [2 /*return*/, c.json({ ok: true, message: "".concat(theirManager, " pozv\u00E1n\u00ED odm\u00EDtl. Po\u0159\u00E1d se zlob\u00ED.") })];
            case 46: return [4 /*yield*/, (0, finance_processor_1.recordTransaction)(db, teamId, "manager_social", -BEER_COST, "Pivo s tren\u00E9rem ".concat(theirName), gameDate)];
            case 47:
                _x.sent();
                return [4 /*yield*/, (0, manager_relations_1.applyRelationEvent)(db, teamId, otherId, {
                        respect: 8, icon: "🍻", text: "".concat(myManager, " a ").concat(theirManager, " za\u0161li na pivo"),
                    })];
            case 48:
                _x.sent();
                dartsText = null;
                if (!(Math.random() < 0.5)) return [3 /*break*/, 53];
                won = Math.random() < 0.5;
                if (!won) return [3 /*break*/, 50];
                return [4 /*yield*/, (0, manager_relations_1.applyRelationEvent)(db, teamId, otherId, {
                        respect: 3, icon: "🎯", text: "".concat(myManager, " porazil ").concat(theirManager, " v \u0161ipk\u00E1ch"),
                    })];
            case 49:
                _x.sent();
                dartsText = (0, relation_texts_1.dartsWinText)(names);
                return [3 /*break*/, 53];
            case 50: return [4 /*yield*/, (0, finance_processor_1.recordTransaction)(db, teamId, "manager_social", -BEER_COST, "Prohran\u00E9 \u0161ipky \u2014 runda pro hospodu", gameDate)];
            case 51:
                _x.sent();
                return [4 /*yield*/, (0, manager_relations_1.shiftSquadMorale)(db, otherId, 1)];
            case 52:
                _x.sent();
                dartsText = (0, relation_texts_1.dartsLossText)(names);
                _x.label = 53;
            case 53: return [4 /*yield*/, insertInteraction(db, "beer", teamId, otherId, null, { darts: dartsText != null })];
            case 54:
                _x.sent();
                if (!!otherIsAi) return [3 /*break*/, 56];
                return [4 /*yield*/, (0, notifications_1.createNotification)(db, otherId, "event", "🍻 Pivo s kolegou", "Tren\u00E9r ".concat(myName, " t\u011B vzal na pivo. Respekt mezi v\u00E1mi roste."), "/dashboard/manager/".concat(teamId), c.env)
                        .catch(function (e) { return logger_1.logger.warn({ module: "relations" }, "beer notification", e); })];
            case 55:
                _x.sent();
                _x.label = 56;
            case 56: return [2 /*return*/, c.json({ ok: true, message: (0, relation_texts_1.beerSceneText)(names), darts: dartsText })];
            case 57: return [4 /*yield*/, nextMutualMatch(db, teamId, otherId)];
            case 58:
                match = _x.sent();
                if (!match || match.id !== body.matchId)
                    return [2 /*return*/, c.json({ error: "Žádný nadcházející vzájemný zápas." }, 400)];
                return [4 /*yield*/, db.prepare("SELECT id FROM manager_interactions WHERE type = 'bet' AND match_id = ? AND status IN ('pending', 'offered') LIMIT 1").bind(match.id).first()];
            case 59:
                existing = _x.sent();
                if (existing)
                    return [2 /*return*/, c.json({ error: "Sázka na tento zápas už existuje." }, 400)];
                return [4 /*yield*/, (0, finance_processor_1.assertPurchaseAllowed)(db, teamId, BET_AMOUNT)];
            case 60:
                purchase = _x.sent();
                if (!purchase.ok)
                    return [2 /*return*/, c.json({ error: purchase.reason }, 400)];
                if (!otherIsAi) return [3 /*break*/, 66];
                return [4 /*yield*/, (0, manager_relations_1.getRelation)(db, teamId, otherId)];
            case 61:
                rel = _x.sent();
                if (!!(0, manager_relations_1.aiAcceptsBet)((0, manager_relations_1.aiArchetype)(otherId), rel.heat)) return [3 /*break*/, 63];
                return [4 /*yield*/, insertInteraction(db, "bet", teamId, otherId, match.id, { declined: true }, "resolved")];
            case 62:
                _x.sent();
                return [2 /*return*/, c.json({ ok: true, accepted: false, message: "".concat(theirManager, " m\u00E1vl rukou: \u201EJ\u00E1 se nes\u00E1z\u00EDm.\" Mo\u017En\u00E1 p\u0159\u00ED\u0161t\u011B.") })];
            case 63: return [4 /*yield*/, insertInteraction(db, "bet", teamId, otherId, match.id, { amount: BET_AMOUNT }, "pending")];
            case 64:
                _x.sent();
                return [4 /*yield*/, (0, manager_relations_1.applyRelationEvent)(db, teamId, otherId, {
                        heat: 3, icon: "🍺", text: "S\u00E1zka o be\u010Dku na ".concat(match.round != null ? "".concat(match.round, ". kolo") : "příští zápas"),
                    })];
            case 65:
                _x.sent();
                return [2 /*return*/, c.json({ ok: true, accepted: true, message: "".concat(theirManager, " pl\u00E1cl: \u201EPlat\u00ED. Be\u010Dka.\" Te\u010F to mus\u00EDte urvat na h\u0159i\u0161ti.") })];
            case 66: 
            // Lidský protějšek — nabídka čeká na přijetí
            return [4 /*yield*/, insertInteraction(db, "bet", teamId, otherId, match.id, { amount: BET_AMOUNT }, "offered")];
            case 67:
                // Lidský protějšek — nabídka čeká na přijetí
                _x.sent();
                return [4 /*yield*/, (0, notifications_1.createNotification)(db, otherId, "event", "🍺 Sázka o bečku!", "Tren\u00E9r ".concat(myName, " se s tebou chce vsadit o be\u010Dku (").concat(BET_AMOUNT, " K\u010D) na v\u00E1\u0161 vz\u00E1jemn\u00FD z\u00E1pas. P\u0159ijme\u0161?"), "/dashboard/manager/".concat(teamId), c.env)
                        .catch(function (e) { return logger_1.logger.warn({ module: "relations" }, "bet offer notification", e); })];
            case 68:
                _x.sent();
                return [2 /*return*/, c.json({ ok: true, accepted: null, message: "Nab\u00EDdka odesl\u00E1na. Uvid\u00EDme, jestli m\u00E1 ".concat(theirManager, " kur\u00E1\u017E.") })];
            case 69: return [4 /*yield*/, db.prepare("SELECT id, actor_team_id, match_id FROM manager_interactions\n           WHERE type = 'bet' AND status = 'offered' AND actor_team_id = ? AND target_team_id = ? LIMIT 1").bind(otherId, teamId).first()];
            case 70:
                offer = _x.sent();
                if (!offer)
                    return [2 /*return*/, c.json({ error: "Žádná čekající sázka." }, 400)];
                if (!(body.type === "bet_decline")) return [3 /*break*/, 72];
                return [4 /*yield*/, db.prepare("UPDATE manager_interactions SET status = 'resolved', payload = json_set(payload, '$.declined', 1) WHERE id = ?")
                        .bind(offer.id).run()];
            case 71:
                _x.sent();
                return [2 /*return*/, c.json({ ok: true, message: "Sázku jsi odmítl. Bečka zůstává v bezpečí." })];
            case 72: return [4 /*yield*/, (0, finance_processor_1.assertPurchaseAllowed)(db, teamId, BET_AMOUNT)];
            case 73:
                purchase = _x.sent();
                if (!purchase.ok)
                    return [2 /*return*/, c.json({ error: purchase.reason }, 400)];
                return [4 /*yield*/, db.prepare("UPDATE manager_interactions SET status = 'pending' WHERE id = ?").bind(offer.id).run()];
            case 74:
                _x.sent();
                return [4 /*yield*/, (0, manager_relations_1.applyRelationEvent)(db, teamId, otherId, {
                        heat: 3, icon: "🍺", text: "Sázka o bečku uzavřena",
                    })];
            case 75:
                _x.sent();
                return [4 /*yield*/, (0, notifications_1.createNotification)(db, otherId, "event", "🍺 Sázka přijata!", "Tren\u00E9r ".concat(myName, " s\u00E1zku o be\u010Dku p\u0159ijal. Te\u010F se hraje o pivo."), "/dashboard/manager/".concat(teamId), c.env)
                        .catch(function (e) { return logger_1.logger.warn({ module: "relations" }, "bet accept notification", e); })];
            case 76:
                _x.sent();
                return [2 /*return*/, c.json({ ok: true, message: "Sázka platí. Hraje se o bečku." })];
            case 77:
                tone = body.tone;
                if (!tone || !["respect", "provoke", "humble"].includes(tone)) {
                    return [2 /*return*/, c.json({ error: "Neplatný tón výroku." }, 400)];
                }
                return [4 /*yield*/, nextMutualMatch(db, teamId, otherId)];
            case 78:
                match = _x.sent();
                if (!match || match.id !== body.matchId)
                    return [2 /*return*/, c.json({ error: "Žádný nadcházející vzájemný zápas." }, 400)];
                return [4 /*yield*/, hasInteraction(db, "statement", teamId, match.id)];
            case 79:
                if (_x.sent()) {
                    return [2 /*return*/, c.json({ error: "Před tímhle zápasem už jsi do novin mluvil. Jednou stačí." }, 400)];
                }
                roundLabel = match.round != null ? "".concat(match.round, ". kolo") : "nadcházející zápas";
                message = void 0;
                if (!(tone === "respect")) return [3 /*break*/, 84];
                _k = manager_relations_1.insertRelationNews;
                _l = [db, match.league_id, "P\u0159ed z\u00E1pasem: ".concat(myName, " smek\u00E1")];
                _m = relation_texts_1.statementRespectQuote;
                _o = [names];
                return [4 /*yield*/, districtOfTeam(db, teamId)];
            case 80: return [4 /*yield*/, _k.apply(void 0, _l.concat([_m.apply(void 0, _o.concat([_x.sent()])), teamId]))];
            case 81:
                _x.sent();
                return [4 /*yield*/, (0, manager_relations_1.applyRelationEvent)(db, teamId, otherId, {
                        respect: 5, icon: "🫡", text: "".concat(myManager, " p\u0159ed ").concat(roundLabel, " ve\u0159ejn\u011B uznal kvality soupe\u0159e"),
                    })];
            case 82:
                _x.sent();
                return [4 /*yield*/, (0, manager_relations_1.shiftSquadMorale)(db, teamId, 1)];
            case 83:
                _x.sent();
                message = "Uznání vyšlo v novinách. Kabina hraje bez tlaku.";
                return [3 /*break*/, 92];
            case 84:
                if (!(tone === "provoke")) return [3 /*break*/, 90];
                _p = manager_relations_1.insertRelationNews;
                _q = [db, match.league_id, "P\u0158EST\u0158ELKA: ".concat(myManager, " provokuje p\u0159ed ").concat(roundLabel)];
                _r = relation_texts_1.statementProvokeQuote;
                _s = [names];
                return [4 /*yield*/, districtOfTeam(db, teamId)];
            case 85: return [4 /*yield*/, _p.apply(void 0, _q.concat([_r.apply(void 0, _s.concat([_x.sent()])), teamId]))];
            case 86:
                _x.sent();
                return [4 /*yield*/, (0, manager_relations_1.applyRelationEvent)(db, teamId, otherId, {
                        heat: 10, icon: "😏", text: "".concat(myManager, " p\u0159ed ").concat(roundLabel, " provokoval v novin\u00E1ch"),
                    })];
            case 87:
                _x.sent();
                return [4 /*yield*/, (0, manager_relations_1.shiftSquadMorale)(db, teamId, 2)];
            case 88:
                _x.sent();
                return [4 /*yield*/, (0, manager_relations_1.shiftSquadMorale)(db, otherId, 2)];
            case 89:
                _x.sent(); // provokace soupeře nabudí — má to cenu
                message = "Provokace vyšla v novinách. Kabina hoří — jenže soupeř taky.";
                return [3 /*break*/, 92];
            case 90: return [4 /*yield*/, (0, manager_relations_1.insertRelationNews)(db, match.league_id, "".concat(myName, " hraje chud\u00E1\u010Dka"), (0, relation_texts_1.statementHumbleQuote)(names), teamId)];
            case 91:
                _x.sent();
                message = "Skromnost vyšla v novinách. Teď nesmíš vyhrát moc vysoko… nebo vlastně smíš?";
                _x.label = 92;
            case 92:
                aiResponseText = null;
                if (!otherIsAi) return [3 /*break*/, 97];
                resp = (0, manager_relations_1.aiStatementResponse)((0, manager_relations_1.aiArchetype)(otherId), tone, names);
                if (!(resp.respect !== 0 || resp.heat !== 0)) return [3 /*break*/, 94];
                return [4 /*yield*/, (0, manager_relations_1.applyRelationEvent)(db, teamId, otherId, {
                        respect: resp.respect, heat: resp.heat, icon: "🗣️", text: resp.historyText,
                    })];
            case 93:
                _x.sent();
                _x.label = 94;
            case 94:
                if (!resp.counterQuote) return [3 /*break*/, 96];
                return [4 /*yield*/, (0, manager_relations_1.insertRelationNews)(db, match.league_id, "".concat(theirManager, " odpov\u00EDd\u00E1"), resp.counterQuote, otherId)];
            case 95:
                _x.sent();
                aiResponseText = resp.counterQuote;
                _x.label = 96;
            case 96: return [3 /*break*/, 99];
            case 97: return [4 /*yield*/, (0, notifications_1.createNotification)(db, otherId, "event", "🗣️ Soupeř mluví do novin", "Tren\u00E9r ".concat(myName, " se p\u0159ed va\u0161\u00EDm z\u00E1pasem rozpov\u00EDdal v novin\u00E1ch. P\u0159e\u010Dti si zpravodaj \u2014 a klidn\u011B odpov\u011Bz."), "/dashboard/manager/".concat(teamId), c.env)
                    .catch(function (e) { return logger_1.logger.warn({ module: "relations" }, "statement notification", e); })];
            case 98:
                _x.sent();
                _x.label = 99;
            case 99: return [4 /*yield*/, insertInteraction(db, "statement", teamId, otherId, match.id, { tone: tone }, tone === "humble" ? "pending" : "resolved")];
            case 100:
                _x.sent();
                return [2 /*return*/, c.json({ ok: true, message: message, aiResponse: aiResponseText })];
            case 101: return [4 /*yield*/, lastInteractionAt(db, "ad", teamId, otherId)];
            case 102:
                adAt = _x.sent();
                if (daysSince(adAt) < AD_COOLDOWN_DAYS) {
                    return [2 /*return*/, c.json({ error: "Redakce další anonymní inzerát zatím nepřijme. Nech to vychladnout." }, 400)];
                }
                return [4 /*yield*/, (0, finance_processor_1.assertPurchaseAllowed)(db, teamId, AD_COST)];
            case 103:
                purchase = _x.sent();
                if (!purchase.ok)
                    return [2 /*return*/, c.json({ error: purchase.reason }, 400)];
                return [4 /*yield*/, db.prepare("SELECT league_id FROM teams WHERE id = ?")
                        .bind(teamId).first()];
            case 104:
                team = _x.sent();
                return [4 /*yield*/, (0, finance_processor_1.recordTransaction)(db, teamId, "manager_social", -AD_COST, "Inzerát v novinách", gameDate)];
            case 105:
                _x.sent();
                adText = (0, relation_texts_1.adTextFor)(names);
                return [4 /*yield*/, (0, manager_relations_1.insertRelationNews)(db, (_v = team === null || team === void 0 ? void 0 : team.league_id) !== null && _v !== void 0 ? _v : null, "Inzerce", adText)];
            case 106:
                _x.sent();
                return [4 /*yield*/, (0, manager_relations_1.shiftSquadMorale)(db, otherId, -2)];
            case 107:
                _x.sent();
                revealed = false;
                if (!(Math.random() < 0.3)) return [3 /*break*/, 111];
                revealed = true;
                return [4 /*yield*/, (0, manager_relations_1.applyRelationEvent)(db, teamId, otherId, {
                        heat: 15, respect: -5, icon: "🕵️", text: "Provalilo se, \u017Ee jedovat\u00FD inzer\u00E1t podal ".concat(myManager),
                    })];
            case 108:
                _x.sent();
                return [4 /*yield*/, (0, manager_relations_1.insertRelationNews)(db, (_w = team === null || team === void 0 ? void 0 : team.league_id) !== null && _w !== void 0 ? _w : null, "Redakce má jasno: anonym nebyl anonym", "Jedovat\u00FD inzer\u00E1t na adresu ".concat(theirName, " podal podle dob\u0159e informovan\u00FDch zdroj\u016F s\u00E1m tren\u00E9r ").concat(myName, ". \u201EPlatil dvacetikorunama z kasi\u010Dky,\" sm\u011Bje se redaktor. Na okrese se tohle ned\u011Bl\u00E1."), teamId)];
            case 109:
                _x.sent();
                if (!!otherIsAi) return [3 /*break*/, 111];
                return [4 /*yield*/, (0, notifications_1.createNotification)(db, otherId, "event", "🕵️ Anonym odhalen", "Ten jedovat\u00FD inzer\u00E1t na v\u00E1\u0161 t\u00FDm podal tren\u00E9r ".concat(myName, ". Te\u010F to v\u00ED\u0161."), "/dashboard/manager/".concat(teamId), c.env)
                        .catch(function (e) { return logger_1.logger.warn({ module: "relations" }, "ad reveal notification", e); })];
            case 110:
                _x.sent();
                _x.label = 111;
            case 111: return [4 /*yield*/, insertInteraction(db, "ad", teamId, otherId, null, { text: adText, revealed: revealed })];
            case 112:
                _x.sent();
                return [2 /*return*/, c.json({
                        ok: true,
                        message: revealed
                            ? "Inzerát vyšel… a redaktor tě práskl. Celý okres ví, kdo ho podal."
                            : "Inzerát vyšel. Nikdo neví, kdo ho podal. Zatím.",
                        revealed: revealed,
                    })];
            case 113:
                tone = body.tone;
                if (!tone || !["sincere", "poison"].includes(tone))
                    return [2 /*return*/, c.json({ error: "Neplatný tón dárku." }, 400)];
                if (!body.matchId) return [3 /*break*/, 115];
                return [4 /*yield*/, lastMutualFinishedMatch(db, teamId, otherId)];
            case 114:
                _t = _x.sent();
                return [3 /*break*/, 116];
            case 115:
                _t = null;
                _x.label = 116;
            case 116:
                match = _t;
                if (!match || match.id !== body.matchId)
                    return [2 /*return*/, c.json({ error: "Zápas nenalezen." }, 400)];
                myScore = match.home_team_id === teamId ? match.home_score : match.away_score;
                theirScore = match.home_team_id === teamId ? match.away_score : match.home_score;
                if (myScore - theirScore < 4)
                    return [2 /*return*/, c.json({ error: "Dárkový koš se posílá jen po pořádném debaklu (4+ góly)." }, 400)];
                return [4 /*yield*/, hasInteraction(db, "gift", teamId, match.id)];
            case 117:
                if (_x.sent())
                    return [2 /*return*/, c.json({ error: "Dárek už jsi poslal." }, 400)];
                return [4 /*yield*/, (0, finance_processor_1.assertPurchaseAllowed)(db, teamId, GIFT_COST)];
            case 118:
                purchase = _x.sent();
                if (!purchase.ok)
                    return [2 /*return*/, c.json({ error: purchase.reason }, 400)];
                return [4 /*yield*/, (0, finance_processor_1.recordTransaction)(db, teamId, "manager_social", -GIFT_COST, "D\u00E1rkov\u00FD ko\u0161 pro ".concat(theirName), gameDate)];
            case 119:
                _x.sent();
                message = void 0;
                if (!(tone === "sincere")) return [3 /*break*/, 123];
                return [4 /*yield*/, (0, manager_relations_1.applyRelationEvent)(db, teamId, otherId, {
                        respect: 8, icon: "🎁", text: "".concat(myManager, " poslal po v\u00FDh\u0159e ").concat(myScore, ":").concat(theirScore, " up\u0159\u00EDmn\u00FD d\u00E1rkov\u00FD ko\u0161"),
                    })];
            case 120:
                _x.sent();
                message = (0, relation_texts_1.giftSincereMessage)();
                if (!!otherIsAi) return [3 /*break*/, 122];
                return [4 /*yield*/, (0, notifications_1.createNotification)(db, otherId, "event", "🎁 Dárkový koš", "Tren\u00E9r ".concat(myName, " poslal po z\u00E1pase ko\u0161 s lahv\u00ED a vzkazem: \u201EHlavu vzh\u016Fru, p\u0159\u00ED\u0161t\u011B to vyjde.\""), "/dashboard/manager/".concat(teamId), c.env)
                        .catch(function (e) { return logger_1.logger.warn({ module: "relations" }, "gift notification", e); })];
            case 121:
                _x.sent();
                _x.label = 122;
            case 122: return [3 /*break*/, 127];
            case 123: return [4 /*yield*/, (0, manager_relations_1.applyRelationEvent)(db, teamId, otherId, {
                    heat: 15, icon: "🎁", text: "".concat(myManager, " poslal po debaklu ").concat(myScore, ":").concat(theirScore, " jedovat\u00FD d\u00E1rkov\u00FD ko\u0161"),
                })];
            case 124:
                _x.sent();
                return [4 /*yield*/, (0, manager_relations_1.shiftSquadMorale)(db, teamId, 3)];
            case 125:
                _x.sent();
                message = (0, relation_texts_1.giftPoisonMessage)();
                if (!!otherIsAi) return [3 /*break*/, 127];
                return [4 /*yield*/, (0, notifications_1.createNotification)(db, otherId, "event", "🎁 „Dárek“", "Tren\u00E9r ".concat(myName, " poslal ko\u0161 s karti\u010Dkou: \u201EA\u0165 se da\u0159\u00ED aspo\u0148 v hospod\u011B.\u201C Tohle si zapamatuj."), "/dashboard/manager/".concat(teamId), c.env)
                        .catch(function (e) { return logger_1.logger.warn({ module: "relations" }, "gift poison notification", e); })];
            case 126:
                _x.sent();
                _x.label = 127;
            case 127: return [4 /*yield*/, insertInteraction(db, "gift", teamId, otherId, match.id, { tone: tone })];
            case 128:
                _x.sent();
                return [2 /*return*/, c.json({ ok: true, message: message })];
            case 129: return [2 /*return*/, c.json({ error: "Neznámý typ interakce." }, 400)];
            case 130: return [3 /*break*/, 132];
            case 131:
                e_1 = _x.sent();
                logger_1.logger.error({ module: "relations" }, "interact failed", e_1);
                return [2 /*return*/, c.json({ error: "Interakce se nepovedla. Zkus to znovu." }, 500)];
            case 132: return [2 /*return*/];
        }
    });
}); });
// ────────────────────────────────────────────────────────────────────────────
// POST /teams/:teamId/stammtisch — domluvit posezení s 2–4 trenéry
// Vyhodnotí se až večer při „odehrání" hospody (daily-tick → resolvePlannedSocialEvents).
// ────────────────────────────────────────────────────────────────────────────
exports.relationsRouter.post("/teams/:teamId/stammtisch", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, db, body, guestIds, lastStammtisch, host, guestsRes, acceptedElsewhere, maxCost, purchase, eventId, _a, myName, myManager, gameDate, _i, guestIds_1, gid;
    var _b;
    var _c, _d;
    return __generator(this, function (_e) {
        switch (_e.label) {
            case 0:
                teamId = c.req.param("teamId");
                db = c.env.DB;
                return [4 /*yield*/, c.req.json().catch(function (e) {
                        logger_1.logger.warn({ module: "relations" }, "parse stammtisch body", e);
                        return null;
                    })];
            case 1:
                body = _e.sent();
                guestIds = __spreadArray([], new Set((_c = body === null || body === void 0 ? void 0 : body.guestTeamIds) !== null && _c !== void 0 ? _c : []), true).filter(function (id) { return id !== teamId; });
                if (guestIds.length < 1 || guestIds.length > 4) {
                    return [2 /*return*/, c.json({ error: "Pozvi 1 až 4 trenéry — na víc nemá hospoda stůl." }, 400)];
                }
                return [4 /*yield*/, db.prepare("SELECT created_at, status FROM manager_interactions WHERE type = 'stammtisch' AND actor_team_id = ? ORDER BY created_at DESC LIMIT 1").bind(teamId).first()];
            case 2:
                lastStammtisch = _e.sent();
                if ((lastStammtisch === null || lastStammtisch === void 0 ? void 0 : lastStammtisch.status) === "planned") {
                    return [2 /*return*/, c.json({ error: "Posezení už je domluvené — výsledek uvidíš večer v hospodě." }, 400)];
                }
                if (daysSince((_d = lastStammtisch === null || lastStammtisch === void 0 ? void 0 : lastStammtisch.created_at) !== null && _d !== void 0 ? _d : null) < STAMMTISCH_COOLDOWN_DAYS) {
                    return [2 /*return*/, c.json({ error: "Posezení s trenéry bylo nedávno. Hospodský potřebuje doplnit sudy." }, 400)];
                }
                return [4 /*yield*/, db.prepare("SELECT league_id FROM teams WHERE id = ?").bind(teamId).first()];
            case 3:
                host = _e.sent();
                if (!(host === null || host === void 0 ? void 0 : host.league_id))
                    return [2 /*return*/, c.json({ error: "Tým není v lize." }, 400)];
                return [4 /*yield*/, (_b = db.prepare("SELECT id, user_id FROM teams WHERE league_id = ? AND id IN (".concat(guestIds.map(function () { return "?"; }).join(","), ")"))).bind.apply(_b, __spreadArray([host.league_id], guestIds, false)).all()];
            case 4:
                guestsRes = _e.sent();
                if (guestsRes.results.length !== guestIds.length) {
                    return [2 /*return*/, c.json({ error: "Někteří pozvaní nejsou z tvojí ligy." }, 400)];
                }
                if (guestsRes.results.some(function (g) { return g.user_id === "ai"; })) {
                    return [2 /*return*/, c.json({ error: "Posezení je jen pro lidské trenéry — AI trenér do hospody nepřijde." }, 400)];
                }
                return [4 /*yield*/, db.prepare("SELECT id FROM manager_interactions WHERE type = 'stammtisch_invite' AND target_team_id = ? AND status = 'accepted' LIMIT 1").bind(teamId).first()];
            case 5:
                acceptedElsewhere = _e.sent();
                if (acceptedElsewhere) {
                    return [2 /*return*/, c.json({ error: "Dnes večer už sedíš u stolu jinde — přijal jsi cizí pozvání." }, 400)];
                }
                maxCost = STAMMTISCH_RESERVATION_FEE + STAMMTISCH_COST_PER_HEAD * (guestIds.length + 1);
                return [4 /*yield*/, (0, finance_processor_1.assertPurchaseAllowed)(db, teamId, maxCost)];
            case 6:
                purchase = _e.sent();
                if (!purchase.ok)
                    return [2 /*return*/, c.json({ error: purchase.reason }, 400)];
                eventId = crypto.randomUUID();
                return [4 /*yield*/, Promise.all([(0, manager_relations_1.getTeamName)(db, teamId), (0, manager_relations_1.getManagerName)(db, teamId)])];
            case 7:
                _a = _e.sent(), myName = _a[0], myManager = _a[1];
                return [4 /*yield*/, (0, manager_relations_1.getTeamGameDate)(db, teamId)];
            case 8:
                gameDate = _e.sent();
                return [4 /*yield*/, (0, finance_processor_1.recordTransaction)(db, teamId, "manager_social", -STAMMTISCH_RESERVATION_FEE, "Rezervace stolu v hospodě na posezení s trenéry", gameDate, eventId)];
            case 9:
                _e.sent();
                _i = 0, guestIds_1 = guestIds;
                _e.label = 10;
            case 10:
                if (!(_i < guestIds_1.length)) return [3 /*break*/, 14];
                gid = guestIds_1[_i];
                return [4 /*yield*/, insertInteraction(db, "stammtisch_invite", teamId, gid, null, { eventId: eventId }, "invited")];
            case 11:
                _e.sent();
                return [4 /*yield*/, (0, notifications_1.createNotification)(db, gid, "event", "🍻 Pozvánka na posezení", "Tren\u00E9r ".concat(myManager, " (").concat(myName, ") t\u011B zve dnes ve\u010Der na posezen\u00ED s tren\u00E9ry. P\u0159ijmi nebo odm\u00EDtni ve sv\u00E9 hospod\u011B."), "/dashboard/hospoda", c.env)
                        .catch(function (e) { return logger_1.logger.warn({ module: "relations" }, "stammtisch invite notification", e); })];
            case 12:
                _e.sent();
                _e.label = 13;
            case 13:
                _i++;
                return [3 /*break*/, 10];
            case 14: return [4 /*yield*/, insertInteraction(db, "stammtisch", teamId, teamId, null, { guestTeamIds: guestIds, eventId: eventId }, "planned")];
            case 15:
                _e.sent();
                return [2 /*return*/, c.json({
                        ok: true,
                        planned: true,
                        message: "St\u016Fl rezervov\u00E1n (".concat(STAMMTISCH_RESERVATION_FEE, " K\u010D) a pozv\u00E1nky rozesl\u00E1ny! Kdo p\u0159ijme a jak ve\u010Der dopadne, uvid\u00ED\u0161 v hospod\u011B."),
                    })];
        }
    });
}); });
// ────────────────────────────────────────────────────────────────────────────
// POST /teams/:teamId/stammtisch-invite/:inviteId — přijmout/odmítnout pozvánku
// ────────────────────────────────────────────────────────────────────────────
exports.relationsRouter.post("/teams/:teamId/stammtisch-invite/:inviteId", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, inviteId, db, body, invite, otherAccepted, ownPlanned, _a, guestManager, hostName;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                teamId = c.req.param("teamId");
                inviteId = c.req.param("inviteId");
                db = c.env.DB;
                return [4 /*yield*/, c.req.json().catch(function (e) {
                        logger_1.logger.warn({ module: "relations" }, "parse invite response body", e);
                        return null;
                    })];
            case 1:
                body = _b.sent();
                if (typeof (body === null || body === void 0 ? void 0 : body.accept) !== "boolean")
                    return [2 /*return*/, c.json({ error: "Chybí odpověď." }, 400)];
                return [4 /*yield*/, db.prepare("SELECT id, actor_team_id, status FROM manager_interactions WHERE id = ? AND type = 'stammtisch_invite' AND target_team_id = ? LIMIT 1").bind(inviteId, teamId).first()];
            case 2:
                invite = _b.sent();
                if (!invite)
                    return [2 /*return*/, c.json({ error: "Pozvánka nenalezena." }, 404)];
                if (invite.status !== "invited")
                    return [2 /*return*/, c.json({ error: "Na pozvánku už jsi odpověděl." }, 400)];
                if (!body.accept) return [3 /*break*/, 5];
                return [4 /*yield*/, db.prepare("SELECT id FROM manager_interactions WHERE type = 'stammtisch_invite' AND target_team_id = ? AND status = 'accepted' AND id != ? LIMIT 1").bind(teamId, inviteId).first()];
            case 3:
                otherAccepted = _b.sent();
                if (otherAccepted) {
                    return [2 /*return*/, c.json({ error: "Dnes večer už sedíš u jiného stolu — přijal jsi jiné pozvání." }, 400)];
                }
                return [4 /*yield*/, db.prepare("SELECT id FROM manager_interactions WHERE type = 'stammtisch' AND actor_team_id = ? AND status = 'planned' LIMIT 1").bind(teamId).first()];
            case 4:
                ownPlanned = _b.sent();
                if (ownPlanned) {
                    return [2 /*return*/, c.json({ error: "Dnes večer hostíš vlastní posezení — nemůžeš sedět ve dvou hospodách najednou." }, 400)];
                }
                _b.label = 5;
            case 5: return [4 /*yield*/, db.prepare("UPDATE manager_interactions SET status = ? WHERE id = ?")
                    .bind(body.accept ? "accepted" : "declined", inviteId).run()];
            case 6:
                _b.sent();
                return [4 /*yield*/, Promise.all([
                        (0, manager_relations_1.getManagerName)(db, teamId),
                        (0, manager_relations_1.getTeamName)(db, invite.actor_team_id),
                    ])];
            case 7:
                _a = _b.sent(), guestManager = _a[0], hostName = _a[1];
                return [4 /*yield*/, (0, notifications_1.createNotification)(db, invite.actor_team_id, "event", body.accept ? "🍻 Pozvánka přijata" : "🍻 Pozvánka odmítnuta", body.accept
                        ? "".concat(guestManager, " doraz\u00ED na posezen\u00ED. Hospodsk\u00FD chlad\u00ED.")
                        : "".concat(guestManager, " se omluvil \u2014 dnes ve\u010Der nedoraz\u00ED."), "/dashboard/hospoda", c.env)
                        .catch(function (e) { return logger_1.logger.warn({ module: "relations" }, "invite response notification", e); })];
            case 8:
                _b.sent();
                return [2 /*return*/, c.json({
                        ok: true,
                        message: body.accept
                            ? "P\u0159ijato! Ve\u010Der doraz do hospody ".concat(hostName, " \u2014 \u00FAtratu plat\u00ED hostitel.")
                            : "Odmítnuto. Třeba příště.",
                    })];
        }
    });
}); });
// ────────────────────────────────────────────────────────────────────────────
// POST /teams/:teamId/pub-round — slíbit rundu hospodě po výhře
// Vyhodnotí se večer při „odehrání" hospody.
// ────────────────────────────────────────────────────────────────────────────
exports.relationsRouter.post("/teams/:teamId/pub-round", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var teamId, db, lastMatch, myScore, theirScore, purchase;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                teamId = c.req.param("teamId");
                db = c.env.DB;
                return [4 /*yield*/, db.prepare("SELECT id, home_team_id, home_score, away_score FROM matches\n     WHERE status IN ('simulated', 'finished') AND (home_team_id = ? OR away_team_id = ?)\n     ORDER BY simulated_at DESC LIMIT 1").bind(teamId, teamId).first()];
            case 1:
                lastMatch = _a.sent();
                if (!lastMatch)
                    return [2 /*return*/, c.json({ error: "Žádný odehraný zápas." }, 400)];
                myScore = lastMatch.home_team_id === teamId ? lastMatch.home_score : lastMatch.away_score;
                theirScore = lastMatch.home_team_id === teamId ? lastMatch.away_score : lastMatch.home_score;
                if (myScore <= theirScore)
                    return [2 /*return*/, c.json({ error: "Runda se kupuje po výhře. Nejdřív vyhraj." }, 400)];
                return [4 /*yield*/, hasInteraction(db, "pub_round", teamId, lastMatch.id)];
            case 2:
                if (_a.sent()) {
                    return [2 /*return*/, c.json({ error: "Za tuhle výhru už je runda slíbená nebo vypitá." }, 400)];
                }
                return [4 /*yield*/, (0, finance_processor_1.assertPurchaseAllowed)(db, teamId, 30 * 12)];
            case 3:
                purchase = _a.sent();
                if (!purchase.ok)
                    return [2 /*return*/, c.json({ error: purchase.reason }, 400)];
                return [4 /*yield*/, insertInteraction(db, "pub_round", teamId, teamId, lastMatch.id, {}, "planned")];
            case 4:
                _a.sent();
                return [2 /*return*/, c.json({
                        ok: true,
                        planned: true,
                        message: "Slíbeno! Hospoda už se těší — rundu roztočíš večer a uvidíš, kolik hrdel slavilo.",
                    })];
        }
    });
}); });
