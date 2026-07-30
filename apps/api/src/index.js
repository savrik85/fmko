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
var hono_1 = require("hono");
var cors_1 = require("hono/cors");
var auth_1 = require("./routes/auth");
var villages_1 = require("./routes/villages");
var teams_1 = require("./routes/teams");
var matches_1 = require("./routes/matches");
var league_1 = require("./routes/league");
var game_1 = require("./routes/game");
var messaging_1 = require("./routes/messaging");
var group_chats_1 = require("./routes/group-chats");
var push_1 = require("./routes/push");
var votes_1 = require("./routes/votes");
var cash_loans_1 = require("./routes/cash-loans");
var relations_1 = require("./routes/relations");
var u21_1 = require("./routes/u21");
var staff_1 = require("./routes/staff");
// transfers endpoints are in gameRouter
var match_runner_1 = require("./multiplayer/match-runner");
var daily_tick_1 = require("./season/daily-tick");
var app = new hono_1.Hono();
app.use("*", (0, cors_1.cors)({ origin: "*" }));
// Global error handler — structured JSON logging, bez expose interních detailů klientovi.
app.onError(function (err, c) {
    var _a;
    // Business-level guard z finance-processor: přeložit na 400 s uživatelskou hláškou.
    if (err.message.startsWith("BUDGET_BLOCKED:")) {
        return c.json({ error: err.message.replace(/^BUDGET_BLOCKED:\s*/, "") }, 400);
    }
    var reqId = crypto.randomUUID().slice(0, 8);
    var entry = {
        ts: new Date().toISOString(),
        level: "error",
        mod: "api",
        msg: "".concat(c.req.method, " ").concat(c.req.url),
        err: err.message,
        stack: (_a = err.stack) === null || _a === void 0 ? void 0 : _a.split("\n").slice(0, 4).join(" | "),
        reqId: reqId,
    };
    console.error(JSON.stringify(entry));
    // Vracíme pouze reqId pro debugging, nikoli raw err.message (může obsahovat SQL detaily).
    return c.json({ error: "Interní chyba serveru", reqId: reqId }, 500);
});
app.get("/", function (c) { return c.json({ name: "Prales API", version: "0.2.0" }); });
app.get("/health", function (c) { return c.json({ status: "ok" }); });
app.route("/auth", auth_1.authRouter);
app.route("/api/villages", villages_1.villagesRouter);
app.route("/api/teams", teams_1.teamsRouter);
app.route("/api", matches_1.matchesRouter);
app.route("/api", league_1.leagueRouter);
app.route("/api", game_1.gameRouter);
app.route("/api", messaging_1.messagingRouter);
app.route("/api", group_chats_1.groupChatsRouter);
app.route("/api", push_1.pushRouter);
app.route("/api", votes_1.votesRouter);
app.route("/api", cash_loans_1.cashLoansRouter);
app.route("/api", relations_1.relationsRouter);
app.route("/api", u21_1.default);
app.route("/api", staff_1.staffRouter);
exports.default = {
    fetch: app.fetch,
    scheduled: function (event, env, ctx) {
        return __awaiter(this, void 0, void 0, function () {
            var cron, log, result, e_1, executeStaffTick, r, e_2, executeTransferPressureTick, r, e_3, _a, applyAiPlayerThreads, expireStaleAiThreads, spawnRes, expireRes, e_4, isMatchTick, recovered, _i, recovered_1, r, e_5, leagues, totalMatches, _b, _c, league, gameDate, leagueId, gd, dayEnd, matchCal, lockResult, calculateStandings, standingsBefore, results, isU21Round, returnNextMatchPlayers, returned, e_6, expired, _loop_1, _d, _e, ci, e_7, calRow, gameWeek, matchRows, lines, topScore, topMatch, _f, _g, r, hs, as_, hn, an, headline, body, e_8, createNotification, pushEnv, _h, results_1, mr, md, title, body, e_9, generateAiRoundReport, e_10, generateUltrasReport, e_11, generateBetweenRoundEvents, _j, createRng, cryptoSeed, recordTransaction, brRng, _k, results_2, mr, humanTeamId, _l, td, sqRows, squad, lastWon, teamDistrict, brEvents, _m, brEvents_1, ev, eff, leaver, injured, days, maintainFreeAgentPool, e_12, roleSenders, sender, roleConvTitle, roleConvId, e_13, pickRandomAdhocEvent, _o, createAdhocRng, cryptoSeedAdhoc, humanTeams, adhocSeasonRow, adhocSeasonN, _p, _q, ht, adhocRng, adhocEvent, createNotification, e_14, matchConvs, _r, _s, conv, e_15, simulateFriendlyMatches, friendlyCount, e_16, _t, createRng, cryptoSeedCeleb, celebRng, celebLeagues, _u, _v, cl, lid, existing, recent, spawnCelebrity, result, e_17, _w, createRng, cryptoSeedMarket, marketRng, generateAiListings, marketLeagues, _x, _y, ml, lid, dist, listings, e_18, e_19, generateMatchdayPreview, leagues, generated, _loop_2, _z, _0, lg, e_20;
            var _1, _2, _3, _4, _5, _6, _7, _8, _9, _10, _11, _12;
            return __generator(this, function (_13) {
                switch (_13.label) {
                    case 0:
                        cron = event.cron;
                        log = function (level, msg, err) {
                            var _a;
                            var entry = { ts: new Date().toISOString(), level: level, mod: "cron", msg: msg };
                            if (err) {
                                entry.err = err.message;
                                entry.stack = (_a = err.stack) === null || _a === void 0 ? void 0 : _a.split("\n").slice(0, 3).join(" | ");
                            }
                            console[level === "error" ? "error" : "log"](JSON.stringify(entry));
                        };
                        log("info", "trigger: cron=".concat(cron || "manual"));
                        if (!(cron === "0 3 * * *" || !cron)) return [3 /*break*/, 4];
                        _13.label = 1;
                    case 1:
                        _13.trys.push([1, 3, , 4]);
                        log("info", "daily tick starting");
                        return [4 /*yield*/, (0, daily_tick_1.executeDailyTick)(env)];
                    case 2:
                        result = _13.sent();
                        log("info", "daily tick done: ".concat(result.events.length, " events, training=").concat(result.isTrainingDay));
                        return [3 /*break*/, 4];
                    case 3:
                        e_1 = _13.sent();
                        log("error", "daily tick failed", e_1);
                        return [3 /*break*/, 4];
                    case 4:
                        if (!(cron === "0 5 * * *" || !cron)) return [3 /*break*/, 9];
                        _13.label = 5;
                    case 5:
                        _13.trys.push([5, 8, , 9]);
                        log("info", "staff tick starting");
                        return [4 /*yield*/, Promise.resolve().then(function () { return require("./staff/staff-tick"); })];
                    case 6:
                        executeStaffTick = (_13.sent()).executeStaffTick;
                        return [4 /*yield*/, executeStaffTick(env)];
                    case 7:
                        r = _13.sent();
                        log("info", "staff tick done: regen=".concat(r.regenTeams, " healed=").concat(r.healedExtra, " courses=").concat(r.coursesDone, " scout=").concat(r.scoutTips, " newCand=").concat(r.newCandidates));
                        return [3 /*break*/, 9];
                    case 8:
                        e_2 = _13.sent();
                        log("error", "staff tick failed", e_2);
                        return [3 /*break*/, 9];
                    case 9:
                        if (!(cron === "0 10 * * *")) return [3 /*break*/, 14];
                        _13.label = 10;
                    case 10:
                        _13.trys.push([10, 13, , 14]);
                        log("info", "transfer pressure tick starting");
                        return [4 /*yield*/, Promise.resolve().then(function () { return require("./transfers/transfer-pressure-tick"); })];
                    case 11:
                        executeTransferPressureTick = (_13.sent()).executeTransferPressureTick;
                        return [4 /*yield*/, executeTransferPressureTick(env)];
                    case 12:
                        r = _13.sent();
                        log("info", "transfer pressure tick done: expired=".concat(r.expiredOffers, " aiOffers=").concat(r.aiOffers, " unrest=").concat(r.unrestProcessed).concat(r.skipped ? " (skipped)" : ""));
                        return [3 /*break*/, 14];
                    case 13:
                        e_3 = _13.sent();
                        log("error", "transfer pressure tick failed", e_3);
                        return [3 /*break*/, 14];
                    case 14:
                        if (!(cron === "0 14 * * *")) return [3 /*break*/, 20];
                        _13.label = 15;
                    case 15:
                        _13.trys.push([15, 19, , 20]);
                        log("info", "ai player chats tick starting");
                        return [4 /*yield*/, Promise.resolve().then(function () { return require("./messaging/ai-player-spawn"); })];
                    case 16:
                        _a = _13.sent(), applyAiPlayerThreads = _a.applyAiPlayerThreads, expireStaleAiThreads = _a.expireStaleAiThreads;
                        return [4 /*yield*/, applyAiPlayerThreads(env.DB, env)];
                    case 17:
                        spawnRes = _13.sent();
                        return [4 /*yield*/, expireStaleAiThreads(env.DB)];
                    case 18:
                        expireRes = _13.sent();
                        log("info", "ai player chats: ".concat(spawnRes.spawned, " spawned, ").concat(spawnRes.skipped, " skipped, ").concat(expireRes.offended, " offended, ").concat(expireRes.safetyClosed, " safety closed"));
                        return [3 /*break*/, 20];
                    case 19:
                        e_4 = _13.sent();
                        log("error", "ai player chats tick failed", e_4);
                        return [3 /*break*/, 20];
                    case 20:
                        isMatchTick = (cron === null || cron === void 0 ? void 0 : cron.startsWith("0 16")) || (cron === null || cron === void 0 ? void 0 : cron.startsWith("5 16")) || (cron === null || cron === void 0 ? void 0 : cron.startsWith("10 16")) || (cron === null || cron === void 0 ? void 0 : cron.startsWith("15 16")) || !cron;
                        if (!isMatchTick) return [3 /*break*/, 157];
                        _13.label = 21;
                    case 21:
                        _13.trys.push([21, 156, , 157]);
                        log("info", "match tick starting");
                        _13.label = 22;
                    case 22:
                        _13.trys.push([22, 24, , 25]);
                        return [4 /*yield*/, (0, match_runner_1.recoverStuckRounds)(env.DB, env.GEMINI_API_KEY)];
                    case 23:
                        recovered = _13.sent();
                        for (_i = 0, recovered_1 = recovered; _i < recovered_1.length; _i++) {
                            r = recovered_1[_i];
                            log("info", "recovered stuck round ".concat(r.calendarId, " (liga ").concat(r.leagueId, "): ").concat(r.matches, " z\u00E1pas\u016F dohr\u00E1no"));
                        }
                        return [3 /*break*/, 25];
                    case 24:
                        e_5 = _13.sent();
                        log("error", "stuck round recovery failed", e_5);
                        return [3 /*break*/, 25];
                    case 25: return [4 /*yield*/, env.DB.prepare("SELECT t.league_id, MAX(t.game_date) as max_game_date\n           FROM teams t JOIN leagues l ON t.league_id = l.id\n           WHERE t.league_id IS NOT NULL AND t.game_date IS NOT NULL\n             AND l.name NOT LIKE '%\u010Cesk\u00E9 Bud\u011Bjovice%'\n           GROUP BY t.league_id").all()];
                    case 26:
                        leagues = _13.sent();
                        totalMatches = 0;
                        _b = 0, _c = leagues.results;
                        _13.label = 27;
                    case 27:
                        if (!(_b < _c.length)) return [3 /*break*/, 130];
                        league = _c[_b];
                        gameDate = league.max_game_date;
                        leagueId = league.league_id;
                        if (!gameDate || !leagueId)
                            return [3 /*break*/, 129];
                        gd = new Date(gameDate);
                        dayEnd = new Date(gd);
                        dayEnd.setUTCHours(23, 59, 59, 999);
                        return [4 /*yield*/, env.DB.prepare("SELECT id FROM season_calendar WHERE league_id = ? AND scheduled_at <= ? AND status = 'scheduled' AND season_number = (SELECT MAX(season_number) FROM season_calendar WHERE league_id = ?) ORDER BY scheduled_at ASC LIMIT 1").bind(leagueId, dayEnd.toISOString(), leagueId).first()];
                    case 28:
                        matchCal = _13.sent();
                        if (!matchCal) return [3 /*break*/, 129];
                        return [4 /*yield*/, env.DB.prepare("UPDATE season_calendar SET status = 'lineup_locked' WHERE id = ? AND status = 'scheduled'").bind(matchCal.id).run()];
                    case 29:
                        lockResult = _13.sent();
                        if (lockResult.meta.changes === 0) {
                            log("info", "skip ".concat(matchCal.id, ": jin\u00FD trigger u\u017E dr\u017E\u00ED lock"));
                            return [3 /*break*/, 129];
                        }
                        return [4 /*yield*/, Promise.resolve().then(function () { return require("./stats/standings"); })];
                    case 30:
                        calculateStandings = (_13.sent()).calculateStandings;
                        return [4 /*yield*/, calculateStandings(env.DB, leagueId)];
                    case 31:
                        standingsBefore = _13.sent();
                        return [4 /*yield*/, env.DB.prepare("UPDATE matches SET status = 'lineups_open' WHERE calendar_id = ? AND status = 'scheduled'").bind(matchCal.id).run()];
                    case 32:
                        _13.sent();
                        return [4 /*yield*/, (0, match_runner_1.runScheduledMatches)(env.DB, matchCal.id, env.GEMINI_API_KEY)];
                    case 33:
                        results = _13.sent();
                        return [4 /*yield*/, env.DB.prepare("UPDATE season_calendar SET status = 'simulated' WHERE id = ?")
                                .bind(matchCal.id).run()];
                    case 34:
                        _13.sent();
                        totalMatches += results.length;
                        _13.label = 35;
                    case 35:
                        _13.trys.push([35, 40, , 41]);
                        return [4 /*yield*/, env.DB.prepare("SELECT 1 FROM leagues WHERE id = ? AND league_type = 'u21'").bind(leagueId).first()];
                    case 36:
                        isU21Round = _13.sent();
                        if (!isU21Round) return [3 /*break*/, 39];
                        return [4 /*yield*/, Promise.resolve().then(function () { return require("./season/u21-return"); })];
                    case 37:
                        returnNextMatchPlayers = (_13.sent()).returnNextMatchPlayers;
                        return [4 /*yield*/, returnNextMatchPlayers(env.DB, matchCal.id)];
                    case 38:
                        returned = _13.sent();
                        if (returned > 0)
                            log("info", "U21 n\u00E1vrat: ".concat(returned, " hr\u00E1\u010D\u016F zp\u011Bt do A-t\u00FDmu"));
                        _13.label = 39;
                    case 39: return [3 /*break*/, 41];
                    case 40:
                        e_6 = _13.sent();
                        log("warn", "u21 return hook", e_6);
                        return [3 /*break*/, 41];
                    case 41:
                        _13.trys.push([41, 48, , 49]);
                        return [4 /*yield*/, env.DB.prepare("SELECT id FROM coach_interviews WHERE match_calendar_id = ? AND status = 'pending'").bind(matchCal.id).all()];
                    case 42:
                        expired = _13.sent();
                        _loop_1 = function (ci) {
                            return __generator(this, function (_14) {
                                switch (_14.label) {
                                    case 0: return [4 /*yield*/, env.DB.prepare("DELETE FROM messages WHERE metadata LIKE ?")
                                            .bind("%\"interviewId\":\"".concat(ci.id, "\"%")).run()
                                            .catch(function (e) { return log("warn", "cleanup interview msg ".concat(ci.id), e); })];
                                    case 1:
                                        _14.sent();
                                        return [2 /*return*/];
                                }
                            });
                        };
                        _d = 0, _e = expired.results;
                        _13.label = 43;
                    case 43:
                        if (!(_d < _e.length)) return [3 /*break*/, 46];
                        ci = _e[_d];
                        return [5 /*yield**/, _loop_1(ci)];
                    case 44:
                        _13.sent();
                        _13.label = 45;
                    case 45:
                        _d++;
                        return [3 /*break*/, 43];
                    case 46: return [4 /*yield*/, env.DB.prepare("UPDATE coach_interviews SET status = 'expired' WHERE match_calendar_id = ? AND status = 'pending'").bind(matchCal.id).run()];
                    case 47:
                        _13.sent();
                        if (expired.results.length > 0)
                            log("info", "expired ".concat(expired.results.length, " unanswered interviews after match"));
                        return [3 /*break*/, 49];
                    case 48:
                        e_7 = _13.sent();
                        log("warn", "post-match interview cleanup", e_7);
                        return [3 /*break*/, 49];
                    case 49:
                        if (!(results.length > 0)) return [3 /*break*/, 129];
                        return [4 /*yield*/, env.DB.prepare("SELECT game_week FROM season_calendar WHERE id = ?")
                                .bind(matchCal.id).first()];
                    case 50:
                        calRow = _13.sent();
                        gameWeek = (_1 = calRow === null || calRow === void 0 ? void 0 : calRow.game_week) !== null && _1 !== void 0 ? _1 : 0;
                        _13.label = 51;
                    case 51:
                        _13.trys.push([51, 54, , 55]);
                        return [4 /*yield*/, env.DB.prepare("SELECT m.home_score, m.away_score, t1.name as home_name, t2.name as away_name\n                   FROM matches m JOIN teams t1 ON m.home_team_id = t1.id JOIN teams t2 ON m.away_team_id = t2.id\n                   WHERE m.calendar_id = ? AND m.status = 'simulated'").bind(matchCal.id).all()];
                    case 52:
                        matchRows = _13.sent();
                        lines = [];
                        topScore = 0;
                        topMatch = "";
                        for (_f = 0, _g = matchRows.results; _f < _g.length; _f++) {
                            r = _g[_f];
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
                            if (hs + as_ > topScore) {
                                topScore = hs + as_;
                                topMatch = "".concat(hn, " vs ").concat(an, " ").concat(hs, ":").concat(as_);
                            }
                        }
                        headline = "".concat(gameWeek, ". kolo: p\u0159ehled v\u00FDsledk\u016F");
                        body = lines.join(". ") + "." + (topScore >= 4 ? " Nejv\u00EDce g\u00F3l\u016F padlo v utk\u00E1n\u00ED ".concat(topMatch, ".") : "");
                        return [4 /*yield*/, env.DB.prepare("INSERT INTO news (id, league_id, type, headline, body, game_week, created_at) VALUES (?, ?, 'round_results', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))").bind(crypto.randomUUID(), leagueId, headline, body, gameWeek).run()];
                    case 53:
                        _13.sent();
                        return [3 /*break*/, 55];
                    case 54:
                        e_8 = _13.sent();
                        log("error", "news generation failed", e_8);
                        return [3 /*break*/, 55];
                    case 55:
                        _13.trys.push([55, 64, , 65]);
                        return [4 /*yield*/, Promise.resolve().then(function () { return require("./community/notifications"); })];
                    case 56:
                        createNotification = (_13.sent()).createNotification;
                        pushEnv = { VAPID_PUBLIC_KEY: env.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: env.VAPID_PRIVATE_KEY, VAPID_SUBJECT: env.VAPID_SUBJECT, DB: env.DB };
                        _h = 0, results_1 = results;
                        _13.label = 57;
                    case 57:
                        if (!(_h < results_1.length)) return [3 /*break*/, 63];
                        mr = results_1[_h];
                        if (mr.matchType === "ai_vs_ai")
                            return [3 /*break*/, 62];
                        return [4 /*yield*/, env.DB.prepare("SELECT m.home_score, m.away_score, m.home_team_id, m.away_team_id, t1.name as hn, t2.name as an, t1.user_id as hu, t2.user_id as au FROM matches m JOIN teams t1 ON m.home_team_id=t1.id JOIN teams t2 ON m.away_team_id=t2.id WHERE m.id=?").bind(mr.matchId).first()];
                    case 58:
                        md = _13.sent();
                        if (!md)
                            return [3 /*break*/, 62];
                        title = "\u26BD Z\u00E1pas skon\u010Dil!";
                        body = "".concat(md.hn, " vs ").concat(md.an, " \u2014 v\u00FDsledek \u010Dek\u00E1 v aplikaci.");
                        if (!(md.hu !== "ai")) return [3 /*break*/, 60];
                        return [4 /*yield*/, createNotification(env.DB, md.home_team_id, "match_result", title, body, "/dashboard/match", pushEnv).catch(function (e) { return log("warn", "match_result notif home", e); })];
                    case 59:
                        _13.sent();
                        _13.label = 60;
                    case 60:
                        if (!(md.au !== "ai")) return [3 /*break*/, 62];
                        return [4 /*yield*/, createNotification(env.DB, md.away_team_id, "match_result", title, body, "/dashboard/match", pushEnv).catch(function (e) { return log("warn", "match_result notif away", e); })];
                    case 61:
                        _13.sent();
                        _13.label = 62;
                    case 62:
                        _h++;
                        return [3 /*break*/, 57];
                    case 63: return [3 /*break*/, 65];
                    case 64:
                        e_9 = _13.sent();
                        log("warn", "match_result notifications failed", e_9);
                        return [3 /*break*/, 65];
                    case 65:
                        if (!env.GEMINI_API_KEY) return [3 /*break*/, 72];
                        _13.label = 66;
                    case 66:
                        _13.trys.push([66, 68, , 69]);
                        return [4 /*yield*/, Promise.resolve().then(function () { return require("./news/ai-reporter"); })];
                    case 67:
                        generateAiRoundReport = (_13.sent()).generateAiRoundReport;
                        ctx.waitUntil(generateAiRoundReport(env.DB, env.GEMINI_API_KEY, leagueId, matchCal.id, gameWeek, standingsBefore)
                            .catch(function (e) { return log("error", "AI report failed", e); }));
                        return [3 /*break*/, 69];
                    case 68:
                        e_10 = _13.sent();
                        log("error", "AI reporter import failed", e_10);
                        return [3 /*break*/, 69];
                    case 69:
                        _13.trys.push([69, 71, , 72]);
                        return [4 /*yield*/, Promise.resolve().then(function () { return require("./news/ultras-report"); })];
                    case 70:
                        generateUltrasReport = (_13.sent()).generateUltrasReport;
                        ctx.waitUntil(generateUltrasReport(env.DB, env.GEMINI_API_KEY, matchCal.id)
                            .catch(function (e) { return log("error", "Ultras report failed", e); }));
                        return [3 /*break*/, 72];
                    case 71:
                        e_11 = _13.sent();
                        log("error", "Ultras reporter import failed", e_11);
                        return [3 /*break*/, 72];
                    case 72:
                        _13.trys.push([72, 108, , 109]);
                        return [4 /*yield*/, Promise.resolve().then(function () { return require("./events/between-rounds"); })];
                    case 73:
                        generateBetweenRoundEvents = (_13.sent()).generateBetweenRoundEvents;
                        return [4 /*yield*/, Promise.resolve().then(function () { return require("./generators/rng"); })];
                    case 74:
                        _j = _13.sent(), createRng = _j.createRng, cryptoSeed = _j.cryptoSeed;
                        return [4 /*yield*/, Promise.resolve().then(function () { return require("./season/finance-processor"); })];
                    case 75:
                        recordTransaction = (_13.sent()).recordTransaction;
                        brRng = createRng(cryptoSeed());
                        _k = 0, results_2 = results;
                        _13.label = 76;
                    case 76:
                        if (!(_k < results_2.length)) return [3 /*break*/, 107];
                        mr = results_2[_k];
                        if (mr.matchType === "ai_vs_ai")
                            return [3 /*break*/, 106];
                        if (!(mr.matchType === "pve_home" || mr.matchType === "pvp")) return [3 /*break*/, 78];
                        return [4 /*yield*/, env.DB.prepare("SELECT home_team_id FROM matches WHERE id = ?").bind(mr.matchId).first()];
                    case 77:
                        _l = (_2 = (_13.sent())) === null || _2 === void 0 ? void 0 : _2.home_team_id;
                        return [3 /*break*/, 80];
                    case 78: return [4 /*yield*/, env.DB.prepare("SELECT away_team_id FROM matches WHERE id = ?").bind(mr.matchId).first()];
                    case 79:
                        _l = (_3 = (_13.sent())) === null || _3 === void 0 ? void 0 : _3.away_team_id;
                        _13.label = 80;
                    case 80:
                        humanTeamId = _l;
                        if (!humanTeamId)
                            return [3 /*break*/, 106];
                        return [4 /*yield*/, env.DB.prepare("SELECT budget, reputation, game_date FROM teams WHERE id = ?").bind(humanTeamId).first()];
                    case 81:
                        td = _13.sent();
                        return [4 /*yield*/, env.DB.prepare("SELECT * FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active')").bind(humanTeamId).all()];
                    case 82:
                        sqRows = _13.sent();
                        squad = sqRows.results.map(function (r) {
                            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x;
                            var s = JSON.parse(r.skills);
                            var p = JSON.parse(r.personality);
                            var lc = JSON.parse(r.life_context);
                            return { firstName: r.first_name, lastName: r.last_name, age: r.age, position: r.position,
                                speed: (_a = s.speed) !== null && _a !== void 0 ? _a : 50, technique: (_b = s.technique) !== null && _b !== void 0 ? _b : 50, shooting: (_c = s.shooting) !== null && _c !== void 0 ? _c : 50, passing: (_d = s.passing) !== null && _d !== void 0 ? _d : 50,
                                heading: (_e = s.heading) !== null && _e !== void 0 ? _e : 50, defense: (_f = s.defense) !== null && _f !== void 0 ? _f : 50, goalkeeping: (_g = s.goalkeeping) !== null && _g !== void 0 ? _g : 0,
                                stamina: (_h = s.stamina) !== null && _h !== void 0 ? _h : 50, strength: (_j = s.strength) !== null && _j !== void 0 ? _j : 50, discipline: (_k = p.discipline) !== null && _k !== void 0 ? _k : 50,
                                patriotism: (_l = p.patriotism) !== null && _l !== void 0 ? _l : 50, alcohol: (_m = p.alcohol) !== null && _m !== void 0 ? _m : 30, temper: (_o = p.temper) !== null && _o !== void 0 ? _o : 40,
                                injuryProneness: (_p = p.injuryProneness) !== null && _p !== void 0 ? _p : 50, occupation: (_q = lc.occupation) !== null && _q !== void 0 ? _q : "",
                                bodyType: "normal", avatarConfig: {}, condition: (_r = lc.condition) !== null && _r !== void 0 ? _r : 100, morale: (_s = lc.morale) !== null && _s !== void 0 ? _s : 50,
                                preferredFoot: "right", preferredSide: "center",
                                leadership: (_t = p.leadership) !== null && _t !== void 0 ? _t : 30, workRate: (_u = p.workRate) !== null && _u !== void 0 ? _u : 50, aggression: (_v = p.aggression) !== null && _v !== void 0 ? _v : 40,
                                consistency: (_w = p.consistency) !== null && _w !== void 0 ? _w : 50, clutch: (_x = p.clutch) !== null && _x !== void 0 ? _x : 50 };
                        });
                        lastWon = mr.matchType === "pve_home" ? mr.homeScore > mr.awayScore : mr.awayScore > mr.homeScore;
                        return [4 /*yield*/, env.DB.prepare("SELECT v.district FROM teams t JOIN villages v ON t.village_id=v.id WHERE t.id=?").bind(humanTeamId).first().catch(function (e) { log("warn", "Failed to get team district", e); return null; })];
                    case 83:
                        teamDistrict = _13.sent();
                        brEvents = generateBetweenRoundEvents(brRng, squad, (_4 = td === null || td === void 0 ? void 0 : td.budget) !== null && _4 !== void 0 ? _4 : 0, (_5 = td === null || td === void 0 ? void 0 : td.reputation) !== null && _5 !== void 0 ? _5 : 50, lastWon, gameWeek, teamDistrict === null || teamDistrict === void 0 ? void 0 : teamDistrict.district);
                        _m = 0, brEvents_1 = brEvents;
                        _13.label = 84;
                    case 84:
                        if (!(_m < brEvents_1.length)) return [3 /*break*/, 106];
                        ev = brEvents_1[_m];
                        if (!ev.effect) return [3 /*break*/, 99];
                        eff = ev.effect;
                        if (!(eff.type === "morale" && eff.value)) return [3 /*break*/, 86];
                        return [4 /*yield*/, env.DB.prepare("UPDATE players SET life_context = json_set(life_context, '$.morale', MIN(100, MAX(0, json_extract(life_context, '$.morale') + ?))) WHERE team_id = ?")
                                .bind(eff.value, humanTeamId).run().catch(function (e) { return log("warn", "morale effect failed", e); })];
                    case 85:
                        _13.sent();
                        _13.label = 86;
                    case 86:
                        if (!(eff.type === "budget" && eff.value)) return [3 /*break*/, 88];
                        return [4 /*yield*/, recordTransaction(env.DB, humanTeamId, "event", eff.value, ev.title, (_6 = td === null || td === void 0 ? void 0 : td.game_date) !== null && _6 !== void 0 ? _6 : new Date().toISOString()).catch(function (e) { return log("warn", "budget effect failed", e); })];
                    case 87:
                        _13.sent();
                        _13.label = 88;
                    case 88:
                        if (!(eff.type === "reputation" && eff.value)) return [3 /*break*/, 90];
                        return [4 /*yield*/, env.DB.prepare("UPDATE teams SET reputation = MIN(100, MAX(0, reputation + ?)) WHERE id = ?")
                                .bind(eff.value, humanTeamId).run().catch(function (e) { return log("warn", "reputation effect failed", e); })];
                    case 89:
                        _13.sent();
                        _13.label = 90;
                    case 90:
                        if (!(eff.type === "player_leave" && eff.playerIndex != null)) return [3 /*break*/, 92];
                        leaver = sqRows.results[eff.playerIndex];
                        if (!leaver) return [3 /*break*/, 92];
                        return [4 /*yield*/, env.DB.prepare("UPDATE players SET status = 'quit' WHERE id = ?").bind(leaver.id).run().catch(function (e) { return log("warn", "player_leave effect failed", e); })];
                    case 91:
                        _13.sent();
                        _13.label = 92;
                    case 92:
                        if (!(eff.type === "injury" && eff.playerIndex != null)) return [3 /*break*/, 94];
                        injured = sqRows.results[eff.playerIndex];
                        if (!injured) return [3 /*break*/, 94];
                        days = ((_7 = eff.duration) !== null && _7 !== void 0 ? _7 : 1) * 7;
                        return [4 /*yield*/, env.DB.prepare("INSERT OR IGNORE INTO injuries (id, player_id, type, days_remaining) VALUES (?, ?, 'training', ?)")
                                .bind(crypto.randomUUID(), injured.id, days).run().catch(function (e) { return log("warn", "injury effect failed", e); })];
                    case 93:
                        _13.sent();
                        _13.label = 94;
                    case 94:
                        if (!(eff.type === "player_add")) return [3 /*break*/, 99];
                        _13.label = 95;
                    case 95:
                        _13.trys.push([95, 98, , 99]);
                        return [4 /*yield*/, Promise.resolve().then(function () { return require("./transfers/free-agent-pool"); })];
                    case 96:
                        maintainFreeAgentPool = (_13.sent()).maintainFreeAgentPool;
                        return [4 /*yield*/, maintainFreeAgentPool(env.DB, brRng, new Date())];
                    case 97:
                        _13.sent();
                        return [3 /*break*/, 99];
                    case 98:
                        e_12 = _13.sent();
                        log("warn", "pool generation for player_add event", e_12);
                        return [3 /*break*/, 99];
                    case 99:
                        roleSenders = {
                            budget: { name: "Účetní", title: "Účetní klubu" },
                            reputation: { name: "Starosta", title: "Starosta obce" },
                            morale: { name: "Asistent trenéra", title: "Asistent" },
                            player_leave: { name: "Kapitán", title: "Kapitán týmu" },
                            player_add: { name: "Hospodský", title: "Místní kontakt" },
                            injury: { name: "Zdravotník", title: "Správce hřiště" },
                            condition: { name: "Masér", title: "Masér" },
                        };
                        sender = (_10 = roleSenders[(_9 = (_8 = ev.effect) === null || _8 === void 0 ? void 0 : _8.type) !== null && _9 !== void 0 ? _9 : ""]) !== null && _10 !== void 0 ? _10 : { name: "Vedení klubu", title: "Vedení" };
                        roleConvTitle = sender.title;
                        return [4 /*yield*/, env.DB.prepare("SELECT id FROM conversations WHERE team_id = ? AND type = 'system' AND title = ?")
                                .bind(humanTeamId, roleConvTitle).first().then(function (r) { return r === null || r === void 0 ? void 0 : r.id; }).catch(function (e) { log("warn", "Failed to find role conversation", e); return null; })];
                    case 100:
                        roleConvId = _13.sent();
                        if (!!roleConvId) return [3 /*break*/, 102];
                        roleConvId = crypto.randomUUID();
                        return [4 /*yield*/, env.DB.prepare("INSERT INTO conversations (id, team_id, type, title, pinned, unread_count, last_message_text, last_message_at, created_at) VALUES (?, ?, 'system', ?, 0, 0, '', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))")
                                .bind(roleConvId, humanTeamId, roleConvTitle).run().catch(function (e) { return log("warn", "Failed to create role conversation", e); })];
                    case 101:
                        _13.sent();
                        _13.label = 102;
                    case 102: return [4 /*yield*/, env.DB.prepare("INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, metadata, sent_at) VALUES (?, ?, 'system', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))")
                            .bind(crypto.randomUUID(), roleConvId, sender.name, "".concat(ev.emoji, " ").concat(ev.description), JSON.stringify({ type: "event", category: ev.category }))
                            .run().catch(function (e) { return log("warn", "Failed to insert event message", e); })];
                    case 103:
                        _13.sent();
                        return [4 /*yield*/, env.DB.prepare("UPDATE conversations SET unread_count = unread_count + 1, last_message_text = ?, last_message_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?")
                                .bind("".concat(ev.emoji, " ").concat(ev.title), roleConvId).run().catch(function (e) { return log("warn", "Failed to update conversation unread", e); })];
                    case 104:
                        _13.sent();
                        _13.label = 105;
                    case 105:
                        _m++;
                        return [3 /*break*/, 84];
                    case 106:
                        _k++;
                        return [3 /*break*/, 76];
                    case 107: return [3 /*break*/, 109];
                    case 108:
                        e_13 = _13.sent();
                        log("error", "between-round events failed", e_13);
                        return [3 /*break*/, 109];
                    case 109:
                        _13.trys.push([109, 120, , 121]);
                        return [4 /*yield*/, Promise.resolve().then(function () { return require("./season/seasonal-events"); })];
                    case 110:
                        pickRandomAdhocEvent = (_13.sent()).pickRandomAdhocEvent;
                        return [4 /*yield*/, Promise.resolve().then(function () { return require("./generators/rng"); })];
                    case 111:
                        _o = _13.sent(), createAdhocRng = _o.createRng, cryptoSeedAdhoc = _o.cryptoSeed;
                        return [4 /*yield*/, env.DB.prepare("SELECT t.id, t.league_id, v.district FROM teams t JOIN villages v ON t.village_id=v.id WHERE t.league_id = ? AND t.user_id <> 'ai'").bind(leagueId).all()];
                    case 112:
                        humanTeams = _13.sent();
                        return [4 /*yield*/, env.DB.prepare("SELECT MAX(number) AS n FROM seasons WHERE status = 'active'").first().catch(function (e) { log("warn", "adhoc season lookup failed", e); return null; })];
                    case 113:
                        adhocSeasonRow = _13.sent();
                        adhocSeasonN = (_11 = adhocSeasonRow === null || adhocSeasonRow === void 0 ? void 0 : adhocSeasonRow.n) !== null && _11 !== void 0 ? _11 : null;
                        if (adhocSeasonN == null)
                            log("error", "adhoc events: žádná aktivní sezóna → přeskočeno (žádný tichý fallback na season 1)");
                        _p = 0, _q = humanTeams.results;
                        _13.label = 114;
                    case 114:
                        if (!(_p < _q.length)) return [3 /*break*/, 119];
                        ht = _q[_p];
                        if (adhocSeasonN == null)
                            return [3 /*break*/, 119]; // negenerovat s podvrženou season='1' (konzument by je skryl)
                        adhocRng = createAdhocRng(cryptoSeedAdhoc());
                        adhocEvent = pickRandomAdhocEvent(adhocRng, gameWeek, ht.district);
                        if (!adhocEvent) return [3 /*break*/, 118];
                        return [4 /*yield*/, env.DB.prepare("INSERT INTO seasonal_events (id, league_id, type, title, description, effects, choices, season, game_week, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')").bind(crypto.randomUUID(), ht.league_id, adhocEvent.type, adhocEvent.title, adhocEvent.description, JSON.stringify(adhocEvent.effects), JSON.stringify(adhocEvent.choices), String(adhocSeasonN), adhocEvent.gameWeek).run().catch(function (e) { return log("warn", "adhoc event insert failed", e); })];
                    case 115:
                        _13.sent();
                        return [4 /*yield*/, Promise.resolve().then(function () { return require("./community/notifications"); })];
                    case 116:
                        createNotification = (_13.sent()).createNotification;
                        return [4 /*yield*/, createNotification(env.DB, ht.id, "event", "".concat(adhocEvent.title), (_12 = adhocEvent.description) !== null && _12 !== void 0 ? _12 : "Nová událost v klubu", "/dashboard/events", { VAPID_PUBLIC_KEY: env.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: env.VAPID_PRIVATE_KEY, VAPID_SUBJECT: env.VAPID_SUBJECT, DB: env.DB }).catch(function (e) { return log("warn", "event notification failed", e); })];
                    case 117:
                        _13.sent();
                        _13.label = 118;
                    case 118:
                        _p++;
                        return [3 /*break*/, 114];
                    case 119: return [3 /*break*/, 121];
                    case 120:
                        e_14 = _13.sent();
                        log("error", "adhoc events failed", e_14);
                        return [3 /*break*/, 121];
                    case 121:
                        _13.trys.push([121, 128, , 129]);
                        return [4 /*yield*/, env.DB.prepare("SELECT c.id FROM conversations c JOIN messages m ON m.conversation_id = c.id WHERE c.team_id IN (SELECT DISTINCT home_team_id FROM matches WHERE calendar_id = ? UNION SELECT DISTINCT away_team_id FROM matches WHERE calendar_id = ?) AND c.type = 'squad_group' AND c.title LIKE '⚽ vs %' AND m.metadata LIKE ?").bind(matchCal.id, matchCal.id, "%".concat(matchCal.id, "%")).all().catch(function (e) { log("warn", "Failed to fetch match conversations for cleanup", e); return { results: [] }; })];
                    case 122:
                        matchConvs = _13.sent();
                        _r = 0, _s = matchConvs.results;
                        _13.label = 123;
                    case 123:
                        if (!(_r < _s.length)) return [3 /*break*/, 127];
                        conv = _s[_r];
                        return [4 /*yield*/, env.DB.prepare("DELETE FROM messages WHERE conversation_id = ?").bind(conv.id).run().catch(function (e) { return log("warn", "Failed to delete match messages", e); })];
                    case 124:
                        _13.sent();
                        return [4 /*yield*/, env.DB.prepare("DELETE FROM conversations WHERE id = ?").bind(conv.id).run().catch(function (e) { return log("warn", "Failed to delete match conversation", e); })];
                    case 125:
                        _13.sent();
                        _13.label = 126;
                    case 126:
                        _r++;
                        return [3 /*break*/, 123];
                    case 127: return [3 /*break*/, 129];
                    case 128:
                        e_15 = _13.sent();
                        log("warn", "match conversation cleanup failed", e_15);
                        return [3 /*break*/, 129];
                    case 129:
                        _b++;
                        return [3 /*break*/, 27];
                    case 130:
                        _13.trys.push([130, 133, , 134]);
                        return [4 /*yield*/, Promise.resolve().then(function () { return require("./multiplayer/friendly-runner"); })];
                    case 131:
                        simulateFriendlyMatches = (_13.sent()).simulateFriendlyMatches;
                        return [4 /*yield*/, simulateFriendlyMatches(env.DB)];
                    case 132:
                        friendlyCount = _13.sent();
                        totalMatches += friendlyCount;
                        if (friendlyCount > 0)
                            log("info", "".concat(friendlyCount, " friendly matches simulated"));
                        return [3 /*break*/, 134];
                    case 133:
                        e_16 = _13.sent();
                        log("error", "friendly matches failed", e_16);
                        return [3 /*break*/, 134];
                    case 134:
                        log("info", "match tick done: ".concat(totalMatches, " matches simulated (all leagues)"));
                        _13.label = 135;
                    case 135:
                        _13.trys.push([135, 145, , 146]);
                        return [4 /*yield*/, Promise.resolve().then(function () { return require("./generators/rng"); })];
                    case 136:
                        _t = _13.sent(), createRng = _t.createRng, cryptoSeedCeleb = _t.cryptoSeed;
                        celebRng = createRng(cryptoSeedCeleb());
                        return [4 /*yield*/, env.DB.prepare("SELECT DISTINCT league_id FROM teams WHERE user_id != 'ai' AND league_id IS NOT NULL").all()];
                    case 137:
                        celebLeagues = _13.sent();
                        _u = 0, _v = celebLeagues.results;
                        _13.label = 138;
                    case 138:
                        if (!(_u < _v.length)) return [3 /*break*/, 144];
                        cl = _v[_u];
                        lid = cl.league_id;
                        return [4 /*yield*/, env.DB.prepare("SELECT id FROM free_agents WHERE is_celebrity = 1 AND district = (SELECT district FROM leagues WHERE id = ?)").bind(lid).first().catch(function (e) { log("error", "celeb check existing", e); return null; })];
                    case 139:
                        existing = _13.sent();
                        if (existing)
                            return [3 /*break*/, 143];
                        return [4 /*yield*/, env.DB.prepare("SELECT id FROM players WHERE is_celebrity = 1 AND team_id IN (SELECT id FROM teams WHERE league_id = ?)").bind(lid).first().catch(function (e) { log("error", "celeb check recent", e); return null; })];
                    case 140:
                        recent = _13.sent();
                        if (recent)
                            return [3 /*break*/, 143];
                        if (!(celebRng.random() < 0.004)) return [3 /*break*/, 143];
                        return [4 /*yield*/, Promise.resolve().then(function () { return require("./season/celebrity-spawn"); })];
                    case 141:
                        spawnCelebrity = (_13.sent()).spawnCelebrity;
                        return [4 /*yield*/, spawnCelebrity(env.DB, lid, celebRng)];
                    case 142:
                        result = _13.sent();
                        if (result)
                            log("info", "celebrity spawned: ".concat(result.name, " (").concat(result.type, ") in league ").concat(lid));
                        _13.label = 143;
                    case 143:
                        _u++;
                        return [3 /*break*/, 138];
                    case 144: return [3 /*break*/, 146];
                    case 145:
                        e_17 = _13.sent();
                        log("error", "celebrity spawn failed", e_17);
                        return [3 /*break*/, 146];
                    case 146:
                        _13.trys.push([146, 154, , 155]);
                        return [4 /*yield*/, Promise.resolve().then(function () { return require("./generators/rng"); })];
                    case 147:
                        _w = _13.sent(), createRng = _w.createRng, cryptoSeedMarket = _w.cryptoSeed;
                        marketRng = createRng(cryptoSeedMarket());
                        return [4 /*yield*/, Promise.resolve().then(function () { return require("./transfers/virtual-teams"); })];
                    case 148:
                        generateAiListings = (_13.sent()).generateAiListings;
                        return [4 /*yield*/, env.DB.prepare("SELECT l.id, l.district FROM leagues l JOIN teams t ON t.league_id = l.id WHERE t.user_id != 'ai' GROUP BY l.id").all().catch(function (e) { log("error", "fetch leagues for AI market", e); return { results: [] }; })];
                    case 149:
                        marketLeagues = _13.sent();
                        _x = 0, _y = marketLeagues.results;
                        _13.label = 150;
                    case 150:
                        if (!(_x < _y.length)) return [3 /*break*/, 153];
                        ml = _y[_x];
                        lid = ml.id;
                        dist = ml.district;
                        return [4 /*yield*/, generateAiListings(env.DB, dist, lid, marketRng)];
                    case 151:
                        listings = _13.sent();
                        if (listings > 0) {
                            log("info", "AI market: ".concat(dist, " \u2014 ").concat(listings, " listings"));
                        }
                        _13.label = 152;
                    case 152:
                        _x++;
                        return [3 /*break*/, 150];
                    case 153: return [3 /*break*/, 155];
                    case 154:
                        e_18 = _13.sent();
                        log("error", "AI market activity failed", e_18);
                        return [3 /*break*/, 155];
                    case 155: return [3 /*break*/, 157];
                    case 156:
                        e_19 = _13.sent();
                        log("error", "match tick failed", e_19);
                        return [3 /*break*/, 157];
                    case 157:
                        if (!(cron === "0 6 * * *")) return [3 /*break*/, 168];
                        _13.label = 158;
                    case 158:
                        _13.trys.push([158, 167, , 168]);
                        log("info", "matchday preview tick starting");
                        if (!!env.GEMINI_API_KEY) return [3 /*break*/, 159];
                        log("warn", "skip matchday preview — no GEMINI_API_KEY");
                        return [3 /*break*/, 166];
                    case 159: return [4 /*yield*/, Promise.resolve().then(function () { return require("./news/matchday-preview"); })];
                    case 160:
                        generateMatchdayPreview = (_13.sent()).generateMatchdayPreview;
                        return [4 /*yield*/, env.DB.prepare("SELECT DISTINCT t.league_id, t.game_date FROM teams t WHERE t.league_id IS NOT NULL AND t.game_date IS NOT NULL AND t.user_id != 'ai'").all()];
                    case 161:
                        leagues = _13.sent();
                        generated = 0;
                        _loop_2 = function (lg) {
                            var leagueId, gameDate, gd, dayStart, dayEnd, todayCal, e_21;
                            return __generator(this, function (_15) {
                                switch (_15.label) {
                                    case 0:
                                        leagueId = lg.league_id;
                                        gameDate = lg.game_date;
                                        if (!leagueId || !gameDate)
                                            return [2 /*return*/, "continue"];
                                        gd = new Date(gameDate);
                                        dayStart = new Date(gd);
                                        dayStart.setUTCHours(0, 0, 0, 0);
                                        dayEnd = new Date(gd);
                                        dayEnd.setUTCHours(23, 59, 59, 999);
                                        return [4 /*yield*/, env.DB.prepare("SELECT id FROM season_calendar WHERE league_id = ? AND status = 'scheduled' AND scheduled_at BETWEEN ? AND ? LIMIT 1").bind(leagueId, dayStart.toISOString(), dayEnd.toISOString()).first()
                                                .catch(function (e) { log("warn", "preview cal lookup ".concat(leagueId), e); return null; })];
                                    case 1:
                                        todayCal = _15.sent();
                                        if (!todayCal)
                                            return [2 /*return*/, "continue"];
                                        _15.label = 2;
                                    case 2:
                                        _15.trys.push([2, 4, , 5]);
                                        return [4 /*yield*/, generateMatchdayPreview(env.DB, env.GEMINI_API_KEY, leagueId, todayCal.id)];
                                    case 3:
                                        _15.sent();
                                        generated++;
                                        return [3 /*break*/, 5];
                                    case 4:
                                        e_21 = _15.sent();
                                        log("error", "preview failed for league ".concat(leagueId), e_21);
                                        return [3 /*break*/, 5];
                                    case 5: return [2 /*return*/];
                                }
                            });
                        };
                        _z = 0, _0 = leagues.results;
                        _13.label = 162;
                    case 162:
                        if (!(_z < _0.length)) return [3 /*break*/, 165];
                        lg = _0[_z];
                        return [5 /*yield**/, _loop_2(lg)];
                    case 163:
                        _13.sent();
                        _13.label = 164;
                    case 164:
                        _z++;
                        return [3 /*break*/, 162];
                    case 165:
                        log("info", "matchday preview tick done: ".concat(generated, " articles"));
                        _13.label = 166;
                    case 166: return [3 /*break*/, 168];
                    case 167:
                        e_20 = _13.sent();
                        log("error", "matchday preview tick failed", e_20);
                        return [3 /*break*/, 168];
                    case 168: return [2 /*return*/];
                }
            });
        });
    },
};
