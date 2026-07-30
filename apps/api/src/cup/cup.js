"use strict";
/**
 * Celorepublikový amatérský pohár — KO soutěž napříč všemi ligami + generované velkokluby.
 * Silová simulace (bez sestav) s šancí na překvapení (giant-killing).
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
exports.cupPrize = cupPrize;
exports.cupPrizeTable = cupPrizeTable;
exports.cupRoundDates = cupRoundDates;
exports.roundName = roundName;
exports.createCup = createCup;
exports.ensureBigClubSquads = ensureBigClubSquads;
exports.simulateCupRound = simulateCupRound;
exports.maybeAdvanceCup = maybeAdvanceCup;
var rng_1 = require("../generators/rng");
var logger_1 = require("../lib/logger");
var finance_processor_1 = require("../season/finance-processor");
/** Odměna za VÝHRU kola podle hloubky (od finále). Platí pro libovolný počet kol. */
var CUP_PRIZE_BY_DEPTH = [240000, 120000, 72000, 42000, 24000, 15000, 9000];
function cupPrize(round, totalRounds) {
    if (round <= 2)
        return 2000; // předkolo proti slabým amatérům — jen symbolická odměna
    return CUP_PRIZE_BY_DEPTH[Math.min(Math.max(0, totalRounds - round), CUP_PRIZE_BY_DEPTH.length - 1)];
}
/** Reputace za výhru kola (trenér + tým). Pohár je prestižnější než liga —
 *  vítěz poháru naskládá kumulativně víc reputace než vítěz ligy. */
function cupRepBonus(round, totalRounds) {
    var fromEnd = totalRounds - round;
    if (fromEnd === 0)
        return { manager: 8, team: 5 }; // výhra ve finále = vítěz poháru
    if (fromEnd === 1)
        return { manager: 5, team: 3 }; // výhra v semifinále (postup do finále)
    if (fromEnd === 2)
        return { manager: 3, team: 2 }; // výhra ve čtvrtfinále
    if (fromEnd === 3)
        return { manager: 2, team: 1 }; // výhra v osmifinále
    return { manager: 0, team: 0 };
}
/** Tabulka odměn pro UI: název kola → částka za výhru. */
function cupPrizeTable(totalRounds) {
    var out = [];
    for (var r = 1; r <= totalRounds; r++)
        out.push({ round: r, roundName: roundName(r, totalRounds), prize: cupPrize(r, totalRounds) });
    return out;
}
/**
 * Datumy jednotlivých kol poháru — rozprostřené přes celou sezónu, FINÁLE na konci ligy.
 * Kola padají na sobotu (ligový den je po/čt), takže se s ligou nekříží.
 */
function cupRoundDates(db, seasonNumber, totalRounds) {
    return __awaiter(this, void 0, void 0, function () {
        var span, startMs, endMs, dates, r, frac, d, i, nd;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db.prepare("SELECT MIN(scheduled_at) AS first, MAX(scheduled_at) AS last FROM season_calendar sc JOIN leagues l ON l.id = sc.league_id WHERE l.league_type = 'senior' AND sc.season_number = ?").bind(seasonNumber).first()
                        .catch(function (e) { logger_1.logger.warn({ module: M }, "cup span", e); return null; })];
                case 1:
                    span = _a.sent();
                    startMs = (span === null || span === void 0 ? void 0 : span.first) ? new Date(span.first).getTime() : Date.now();
                    endMs = (span === null || span === void 0 ? void 0 : span.last) ? new Date(span.last).getTime() : startMs + totalRounds * 14 * 86400000;
                    dates = [];
                    for (r = 1; r <= totalRounds; r++) {
                        frac = r / totalRounds;
                        d = new Date(startMs + frac * (endMs - startMs));
                        while (d.getUTCDay() !== 6)
                            d.setUTCDate(d.getUTCDate() + 1); // snap na sobotu (pohárový den)
                        d.setUTCHours(16, 0, 0, 0);
                        dates.push(d.toISOString());
                    }
                    // Zajisti přísně rostoucí (snap mohl kola slepit) — posuň duplicity o týden.
                    for (i = 1; i < dates.length; i++) {
                        if (dates[i] <= dates[i - 1]) {
                            nd = new Date(dates[i - 1]);
                            nd.setUTCDate(nd.getUTCDate() + 7);
                            dates[i] = nd.toISOString();
                        }
                    }
                    return [2 /*return*/, dates];
            }
        });
    });
}
var M = "cup";
var CUP_NAME = "Český amatérský pohár";
var HOME_ADV = 3;
var BIG_CLUB_PREFIX = ["FC", "Sparta", "Slávia", "Viktoria", "Baník", "Tatran", "Sokol", "Union", "Dynamo", "Slovan", "Spartak", "Lokomotiva", "Jiskra", "Real", "Inter", "Dukla", "Slavoj", "AC", "FK", "SK"];
// Reálná česká města seřazená dle velikosti (největší první) — velkokluby jsou z měst,
// síla klubu roste s velikostí města (Praha nejsilnější, menší města slabší).
var BIG_CITIES = [
    "Praha", "Brno", "Ostrava", "Plzeň", "Liberec", "Olomouc", "České Budějovice", "Hradec Králové",
    "Ústí nad Labem", "Pardubice", "Zlín", "Havířov", "Kladno", "Most", "Opava", "Frýdek-Místek",
    "Karviná", "Jihlava", "Teplice", "Děčín", "Karlovy Vary", "Jablonec nad Nisou", "Mladá Boleslav", "Prostějov",
    "Přerov", "Chomutov", "Třebíč", "Třinec", "Tábor", "Znojmo", "Příbram", "Kolín",
    "Cheb", "Trutnov", "Písek", "Kroměříž", "Šumperk", "Vsetín", "Uherské Hradiště", "Břeclav",
    "Hodonín", "Český Těšín", "Litoměřice", "Havlíčkův Brod", "Nový Jičín", "Krnov", "Sokolov", "Vyškov",
    "Náchod", "Bohumín", "Klatovy", "Žďár nad Sázavou", "Jindřichův Hradec", "Kutná Hora", "Blansko", "Strakonice",
    "Rakovník", "Benešov", "Jičín", "Chrudim", "Beroun", "Mělník", "Valašské Meziříčí", "Kopřivnice",
];
function nextPow2(n) { var p = 1; while (p < n)
    p <<= 1; return p; }
/** Název kola. Kola 1-2 = předkola (slabé týmy), hlavní pavouk od kola 3 (číslován od 1). */
function roundName(round, totalRounds) {
    if (round === 1)
        return "1. předkolo";
    if (round === 2)
        return "2. předkolo";
    var fromEnd = totalRounds - round;
    if (fromEnd === 0)
        return "Finále";
    if (fromEnd === 1)
        return "Semifinále";
    if (fromEnd === 2)
        return "Čtvrtfinále";
    if (fromEnd === 3)
        return "Osmifinále";
    return "".concat(round - 2, ". kolo");
}
function samplePoisson(lambda, rng) {
    var L = Math.exp(-lambda);
    var k = 0, p = 1;
    do {
        k++;
        p *= rng.random();
    } while (p > L && k < 12);
    return k - 1;
}
/** Odsimuluje jeden pohárový zápas (silově). Vrací skóre + vítěze + příznak překvapení. */
function simMatch(sH, sA, rng) {
    var diff = (sH + HOME_ADV) - sA;
    var expH = Math.max(0.25, Math.min(4.5, 1.45 + diff * 0.055));
    var expA = Math.max(0.25, Math.min(4.5, 1.45 - diff * 0.055));
    var hg = samplePoisson(expH, rng);
    var ag = samplePoisson(expA, rng);
    var hp = null, ap = null;
    var homeWin;
    if (hg === ag) {
        // Penalty — mírně favorizuj silnějšího, ale je to loterie
        var homePenChance = 0.5 + (sH - sA) * 0.01;
        homeWin = rng.random() < Math.max(0.3, Math.min(0.7, homePenChance));
        hp = homeWin ? 5 : 3 + Math.floor(rng.random() * 2);
        ap = homeWin ? 3 + Math.floor(rng.random() * 2) : 5;
    }
    else {
        homeWin = hg > ag;
    }
    var winnerStr = homeWin ? sH : sA;
    var loserStr = homeWin ? sA : sH;
    var upset = loserStr - winnerStr >= 12; // slabší vyřadil výrazně silnějšího
    return { hg: hg, ag: ag, hp: hp, ap: ap, homeWin: homeWin, upset: upset };
}
/** Vytvoří pohár pro danou sezónu: los všech senior týmů + doplnění velkokluby na mocninu 2. */
function createCup(db, seasonNumber) {
    return __awaiter(this, void 0, void 0, function () {
        var existing, teamsRes, real, rng, seedBracket, PRELIM_ROUNDS, totalRounds, cupId, roundDates, participants, usedNames, bigCount, i, rank, city, nm, g, base, strength, humanIds, shuf, realHuman, realAi, bigs, orderedReal, order, realPairs, i, bigPairs, i, WEAK_A, WEAK_B, weakTeams, i, nm, g, bracketOrder, i, allTeams, failed, i, batch, matchStmts, pos, expectedMatches, i, teamCount, matchCount;
        var _a, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0: return [4 /*yield*/, db.prepare("SELECT id FROM cup_competitions WHERE season_number = ? LIMIT 1").bind(seasonNumber).first()
                        .catch(function (e) { logger_1.logger.warn({ module: M }, "guard cup", e); return null; })];
                case 1:
                    existing = _d.sent();
                    if (existing)
                        return [2 /*return*/, { created: false, cupId: existing.id }];
                    return [4 /*yield*/, db.prepare("SELECT t.id, t.name, t.primary_color, t.user_id, CAST(COALESCE(ROUND(AVG(p.overall_rating)), 30) AS INTEGER) AS strength FROM teams t LEFT JOIN players p ON p.team_id = t.id AND p.status = 'active' WHERE t.team_type = 'senior' AND t.league_id IS NOT NULL AND t.name NOT LIKE 'DELETED-%' GROUP BY t.id").all()
                            .catch(function (e) { logger_1.logger.warn({ module: M }, "load teams for cup", e); return { results: [] }; })];
                case 2:
                    teamsRes = _d.sent();
                    real = teamsRes.results;
                    if (real.length < 2)
                        return [2 /*return*/, { created: false }];
                    rng = (0, rng_1.createRng)((seasonNumber * 2654435761) >>> 0);
                    seedBracket = nextPow2(real.length);
                    PRELIM_ROUNDS = 2;
                    totalRounds = Math.round(Math.log2(seedBracket)) + PRELIM_ROUNDS;
                    cupId = crypto.randomUUID();
                    return [4 /*yield*/, cupRoundDates(db, seasonNumber, totalRounds)];
                case 3:
                    roundDates = _d.sent();
                    participants = real.map(function (t) { return ({
                        id: crypto.randomUUID(), team_id: t.id, name: t.name, strength: t.strength, is_big_club: 0, primary_color: t.primary_color,
                    }); });
                    usedNames = new Set();
                    bigCount = seedBracket - participants.length;
                    for (i = 0; i < bigCount; i++) {
                        rank = i % BIG_CITIES.length;
                        city = BIG_CITIES[rank];
                        nm = "".concat(BIG_CLUB_PREFIX[Math.floor(rng.random() * BIG_CLUB_PREFIX.length)], " ").concat(city);
                        g = 0;
                        while (usedNames.has(nm) && g++ < 30)
                            nm = "".concat(BIG_CLUB_PREFIX[Math.floor(rng.random() * BIG_CLUB_PREFIX.length)], " ").concat(city);
                        usedNames.add(nm);
                        base = Math.round(68 - (rank / (BIG_CITIES.length - 1)) * 24);
                        strength = Math.max(42, Math.min(70, base + Math.floor(rng.random() * 5) - 2));
                        participants.push({ id: crypto.randomUUID(), team_id: null, name: nm, strength: strength, is_big_club: 1, primary_color: null });
                    }
                    humanIds = new Set(real.filter(function (t) { return t.user_id !== "ai"; }).map(function (t) { return t.id; }));
                    shuf = function (arr) {
                        var _a;
                        for (var i = arr.length - 1; i > 0; i--) {
                            var j = Math.floor(rng.random() * (i + 1));
                            _a = [arr[j], arr[i]], arr[i] = _a[0], arr[j] = _a[1];
                        }
                        return arr;
                    };
                    realHuman = shuf(participants.filter(function (p) { return p.is_big_club === 0 && p.team_id !== null && humanIds.has(p.team_id); }));
                    realAi = shuf(participants.filter(function (p) { return p.is_big_club === 0 && !(p.team_id !== null && humanIds.has(p.team_id)); }));
                    bigs = shuf(participants.filter(function (p) { return p.is_big_club === 1; }));
                    orderedReal = __spreadArray(__spreadArray([], realHuman, true), realAi, true);
                    order = [];
                    realPairs = Math.floor(orderedReal.length / 2);
                    for (i = 0; i < realPairs * 2; i++)
                        order.push(orderedReal[i]);
                    bigPairs = Math.floor(bigs.length / 2);
                    for (i = 0; i < bigPairs * 2; i++)
                        order.push(bigs[i]);
                    if (orderedReal.length % 2 === 1)
                        order.push(orderedReal[orderedReal.length - 1]);
                    if (bigs.length % 2 === 1)
                        order.push(bigs[bigs.length - 1]);
                    WEAK_A = ["TJ", "SK", "FC", "Sokol", "Slavoj", "Tatran", "Jiskra", "Baník"];
                    WEAK_B = ["Dolní Lhota", "Horní Ves", "Kozojedy", "Trnávka", "Zadní Chlum", "Kravaře", "Suchdol", "Blaťany", "Ořechov", "Bahňany", "Vlčí Důl", "Mokrá", "Podhájí", "Křemže", "Zálesí", "Nová Ves"];
                    weakTeams = [];
                    for (i = 0; i < order.length * 3; i++) {
                        nm = "".concat(WEAK_A[Math.floor(rng.random() * WEAK_A.length)], " ").concat(WEAK_B[Math.floor(rng.random() * WEAK_B.length)]);
                        g = 0;
                        while (usedNames.has(nm) && g++ < 60)
                            nm = "".concat(WEAK_A[Math.floor(rng.random() * WEAK_A.length)], " ").concat(WEAK_B[Math.floor(rng.random() * WEAK_B.length)], " ").concat(String.fromCharCode(66 + (g % 8)));
                        usedNames.add(nm);
                        // Vyloženě slabí amatéři (síla 4-10) — velký odstup i od nejslabšího lidského týmu, ať lidé skoro jistě projdou.
                        weakTeams.push({ id: crypto.randomUUID(), team_id: null, name: nm, strength: 4 + Math.floor(rng.random() * 7), is_big_club: 0, primary_color: null });
                    }
                    bracketOrder = [];
                    for (i = 0; i < order.length; i++) {
                        bracketOrder.push(order[i], weakTeams[i * 3], weakTeams[i * 3 + 1], weakTeams[i * 3 + 2]);
                    }
                    allTeams = __spreadArray(__spreadArray([], participants, true), weakTeams, true);
                    failed = false;
                    return [4 /*yield*/, db.prepare("INSERT INTO cup_competitions (id, season_number, name, status, total_rounds, current_round) VALUES (?, ?, ?, 'active', ?, 1)")
                            .bind(cupId, seasonNumber, CUP_NAME, totalRounds).run()
                            .catch(function (e) { failed = true; logger_1.logger.error({ module: M }, "insert cup", e); })];
                case 4:
                    _d.sent();
                    i = 0;
                    _d.label = 5;
                case 5:
                    if (!(i < allTeams.length)) return [3 /*break*/, 8];
                    batch = allTeams.slice(i, i + 20).map(function (p) {
                        return db.prepare("INSERT INTO cup_teams (id, cup_id, team_id, name, strength, is_big_club, primary_color) VALUES (?, ?, ?, ?, ?, ?, ?)")
                            .bind(p.id, cupId, p.team_id, p.name, p.strength, p.is_big_club, p.primary_color);
                    });
                    return [4 /*yield*/, db.batch(batch).catch(function (e) { failed = true; logger_1.logger.error({ module: M }, "insert cup teams", e); })];
                case 6:
                    _d.sent();
                    _d.label = 7;
                case 7:
                    i += 20;
                    return [3 /*break*/, 5];
                case 8:
                    matchStmts = [];
                    for (pos = 0; pos < bracketOrder.length / 2; pos++) {
                        matchStmts.push(db.prepare("INSERT INTO cup_matches (id, cup_id, round, bracket_pos, home_cup_team_id, away_cup_team_id, scheduled_at, status) VALUES (?, ?, 1, ?, ?, ?, ?, 'scheduled')").bind(crypto.randomUUID(), cupId, pos, bracketOrder[pos * 2].id, bracketOrder[pos * 2 + 1].id, (_a = roundDates[0]) !== null && _a !== void 0 ? _a : null));
                    }
                    expectedMatches = matchStmts.length;
                    i = 0;
                    _d.label = 9;
                case 9:
                    if (!(i < matchStmts.length)) return [3 /*break*/, 12];
                    return [4 /*yield*/, db.batch(matchStmts.slice(i, i + 40)).catch(function (e) { failed = true; logger_1.logger.error({ module: M }, "insert round1", e); })];
                case 10:
                    _d.sent();
                    _d.label = 11;
                case 11:
                    i += 40;
                    return [3 /*break*/, 9];
                case 12: return [4 /*yield*/, db.prepare("SELECT COUNT(*) AS c FROM cup_teams WHERE cup_id = ?").bind(cupId).first()
                        .catch(function (e) { logger_1.logger.warn({ module: M }, "verify cup teams count", e); return null; })];
                case 13:
                    teamCount = _d.sent();
                    return [4 /*yield*/, db.prepare("SELECT COUNT(*) AS c FROM cup_matches WHERE cup_id = ?").bind(cupId).first()
                            .catch(function (e) { logger_1.logger.warn({ module: M }, "verify cup matches count", e); return null; })];
                case 14:
                    matchCount = _d.sent();
                    if (!(failed || ((_b = teamCount === null || teamCount === void 0 ? void 0 : teamCount.c) !== null && _b !== void 0 ? _b : -1) !== allTeams.length || ((_c = matchCount === null || matchCount === void 0 ? void 0 : matchCount.c) !== null && _c !== void 0 ? _c : -1) !== expectedMatches)) return [3 /*break*/, 18];
                    logger_1.logger.error({ module: M }, "createCup NE\u00DAPLN\u00DD (teams ".concat(teamCount === null || teamCount === void 0 ? void 0 : teamCount.c, "/").concat(allTeams.length, ", matches ").concat(matchCount === null || matchCount === void 0 ? void 0 : matchCount.c, "/").concat(expectedMatches, ") \u2192 \u00FAklid + throw"));
                    return [4 /*yield*/, db.prepare("DELETE FROM cup_matches WHERE cup_id = ?").bind(cupId).run().catch(function (e) { return logger_1.logger.warn({ module: M }, "cleanup cup matches", e); })];
                case 15:
                    _d.sent();
                    return [4 /*yield*/, db.prepare("DELETE FROM cup_teams WHERE cup_id = ?").bind(cupId).run().catch(function (e) { return logger_1.logger.warn({ module: M }, "cleanup cup teams", e); })];
                case 16:
                    _d.sent();
                    return [4 /*yield*/, db.prepare("DELETE FROM cup_competitions WHERE id = ?").bind(cupId).run().catch(function (e) { return logger_1.logger.warn({ module: M }, "cleanup cup competition", e); })];
                case 17:
                    _d.sent();
                    throw new Error("createCup: neúplné vytvoření poháru — zrušeno (viz error log)");
                case 18:
                    logger_1.logger.info({ module: M }, "cup created s=".concat(seasonNumber, " teams=").concat(allTeams.length, " (").concat(participants.length, " seed\u016F + ").concat(weakTeams.length, " slab\u00FDch) rounds=").concat(totalRounds));
                    return [2 /*return*/, { created: true, cupId: cupId, teams: allTeams.length, rounds: totalRounds }];
            }
        });
    });
}
/**
 * Lazy generování kádrů velkoklubů (plné atributy, různá morálka/kondice) — chunkovaně,
 * ať se nenarazí na limit subrequestů. Vrátí počet klubů, jimž byl kádr vygenerován.
 */
function ensureBigClubSquads(db_1, cupId_1) {
    return __awaiter(this, arguments, void 0, function (db, cupId, maxClubs) {
        var clubs, generateSquad, cryptoSeed, FIRSTNAMES, SURNAMES, CORE, done, _loop_1, _i, _a, club;
        var _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
        if (maxClubs === void 0) { maxClubs = 8; }
        return __generator(this, function (_o) {
            switch (_o.label) {
                case 0: return [4 /*yield*/, db.prepare("SELECT ct.id, ct.name, ct.strength FROM cup_teams ct WHERE ct.cup_id = ? AND ct.is_big_club = 1 AND NOT EXISTS (SELECT 1 FROM cup_club_players p WHERE p.cup_team_id = ct.id) LIMIT ?").bind(cupId, maxClubs).all()
                        .catch(function (e) { logger_1.logger.warn({ module: M }, "ensure squads: load clubs", e); return { results: [] }; })];
                case 1:
                    clubs = _o.sent();
                    if (!clubs.results.length)
                        return [2 /*return*/, 0];
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("../generators/player"); })];
                case 2:
                    generateSquad = (_o.sent()).generateSquad;
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("../generators/rng"); })];
                case 3:
                    cryptoSeed = (_o.sent()).cryptoSeed;
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("../data/czech-names"); })];
                case 4:
                    FIRSTNAMES = (_o.sent()).FIRSTNAMES;
                    SURNAMES = { "Novák": 10, "Svoboda": 8, "Dvořák": 7, "Černý": 6, "Procházka": 5, "Kučera": 5, "Veselý": 4, "Horák": 4, "Němec": 3, "Marek": 3, "Pospíšil": 3, "Pokorný": 2, "Hájek": 2, "Král": 2, "Jelínek": 2 };
                    CORE = ["speed", "technique", "shooting", "passing", "heading", "defense", "goalkeeping", "stamina", "strength"];
                    done = 0;
                    _loop_1 = function (club) {
                        var rng, village, surnameData, firstnameData, squad, overallOf, avg, shift, stmts, _loop_2, _p, squad_1, p, i;
                        return __generator(this, function (_q) {
                            switch (_q.label) {
                                case 0:
                                    rng = (0, rng_1.createRng)(cryptoSeed());
                                    village = { region_code: "Praha", category: "mesto", population: 100000, district: "Praha", lat: 50.08, lng: 14.42, name: club.name };
                                    surnameData = { surnames: SURNAMES, female_forms: {} };
                                    firstnameData = { male: FIRSTNAMES, female: {} };
                                    squad = generateSquad(rng, village, surnameData, firstnameData, 18);
                                    overallOf = function (p) { return Math.round(CORE.reduce(function (s, k) { var _a; return s + ((_a = p[k]) !== null && _a !== void 0 ? _a : 40); }, 0) / CORE.length); };
                                    avg = squad.reduce(function (s, p) { return s + overallOf(p); }, 0) / Math.max(1, squad.length);
                                    shift = club.strength - avg;
                                    stmts = [];
                                    _loop_2 = function (p) {
                                        var pr = p;
                                        var sk = function (k) { var _a; return Math.max(15, Math.min(95, Math.round(((_a = pr[k]) !== null && _a !== void 0 ? _a : 40) + shift))); };
                                        var skills = { speed: sk("speed"), technique: sk("technique"), shooting: sk("shooting"), passing: sk("passing"), heading: sk("heading"), defense: sk("defense"), goalkeeping: sk("goalkeeping"), vision: sk("technique"), creativity: sk("passing"), setPieces: rng.int(20, 70) };
                                        var physical = { stamina: sk("stamina"), strength: sk("strength"), injuryProneness: (_b = pr.injuryProneness) !== null && _b !== void 0 ? _b : 50, height: rng.int(172, 191), weight: rng.int(68, 88), preferredFoot: "right", preferredSide: "center" };
                                        var personality = { discipline: (_c = pr.discipline) !== null && _c !== void 0 ? _c : 50, patriotism: (_d = pr.patriotism) !== null && _d !== void 0 ? _d : 50, alcohol: (_e = pr.alcohol) !== null && _e !== void 0 ? _e : 30, temper: (_f = pr.temper) !== null && _f !== void 0 ? _f : 40, leadership: (_g = pr.leadership) !== null && _g !== void 0 ? _g : 40, workRate: (_h = pr.workRate) !== null && _h !== void 0 ? _h : 55, aggression: (_j = pr.aggression) !== null && _j !== void 0 ? _j : 45, consistency: (_k = pr.consistency) !== null && _k !== void 0 ? _k : 55, clutch: (_l = pr.clutch) !== null && _l !== void 0 ? _l : 50 };
                                        var overall = Math.max(20, Math.min(90, overallOf(pr) + Math.round(shift)));
                                        var pp = p;
                                        stmts.push(db.prepare("INSERT INTO cup_club_players (id, cup_team_id, first_name, last_name, position, overall_rating, age, skills, physical, personality, condition, morale, avatar, suspended_matches) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?)").bind(crypto.randomUUID(), club.id, pp.firstName, pp.lastName, pp.position, overall, (_m = pp.age) !== null && _m !== void 0 ? _m : 26, JSON.stringify(skills), JSON.stringify(physical), JSON.stringify(personality), rng.int(78, 100), rng.int(45, 78), rng.random() < 0.05 ? rng.int(1, 2) : 0)); // různá kondice/morálka, občas trest
                                    };
                                    for (_p = 0, squad_1 = squad; _p < squad_1.length; _p++) {
                                        p = squad_1[_p];
                                        _loop_2(p);
                                    }
                                    i = 0;
                                    _q.label = 1;
                                case 1:
                                    if (!(i < stmts.length)) return [3 /*break*/, 4];
                                    return [4 /*yield*/, db.batch(stmts.slice(i, i + 40)).catch(function (e) { return logger_1.logger.warn({ module: M }, "insert cup squad", e); })];
                                case 2:
                                    _q.sent();
                                    _q.label = 3;
                                case 3:
                                    i += 40;
                                    return [3 /*break*/, 1];
                                case 4:
                                    done++;
                                    return [2 /*return*/];
                            }
                        });
                    };
                    _i = 0, _a = clubs.results;
                    _o.label = 5;
                case 5:
                    if (!(_i < _a.length)) return [3 /*break*/, 8];
                    club = _a[_i];
                    return [5 /*yield**/, _loop_1(club)];
                case 6:
                    _o.sent();
                    _o.label = 7;
                case 7:
                    _i++;
                    return [3 /*break*/, 5];
                case 8:
                    logger_1.logger.info({ module: M }, "cup squads generated for ".concat(done, " clubs"));
                    return [2 /*return*/, done];
            }
        });
    });
}
/** Načte kádr velkoklubu z cup_club_players ve tvaru řádků `players` (pro buildMatchPlayers sourceRows). */
function loadCupClubRows(db, cupTeamId) {
    return __awaiter(this, void 0, void 0, function () {
        var res;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db.prepare("SELECT * FROM cup_club_players WHERE cup_team_id = ? ORDER BY overall_rating DESC").bind(cupTeamId).all()
                        .catch(function (e) { logger_1.logger.warn({ module: M }, "load cup club rows", e); return { results: [] }; })];
                case 1:
                    res = _a.sent();
                    return [2 /*return*/, {
                            results: res.results.map(function (r) {
                                var _a, _b;
                                return (__assign(__assign({}, r), { nickname: null, status: "active", life_context: JSON.stringify({ morale: (_a = r.morale) !== null && _a !== void 0 ? _a : 60, condition: (_b = r.condition) !== null && _b !== void 0 ? _b : 100 }) }));
                            }),
                        }];
            }
        });
    });
}
/** Penaltový rozstřel — mírně zvýhodní silnější tým. */
function cupShootout(rng, sHome, sAway) {
    var hp = 0, ap = 0;
    var pHome = Math.max(0.55, Math.min(0.9, 0.72 + (sHome - 50) / 500));
    var pAway = Math.max(0.55, Math.min(0.9, 0.72 + (sAway - 50) / 500));
    for (var i = 0; i < 5; i++) {
        if (rng.random() < pHome)
            hp++;
        if (rng.random() < pAway)
            ap++;
    }
    var guard = 0;
    while (hp === ap && guard++ < 20) {
        if (rng.random() < pHome)
            hp++;
        if (rng.random() < pAway)
            ap++;
    }
    if (hp === ap)
        hp++; // pojistka
    return { hp: hp, ap: ap };
}
/**
 * Plnohodnotná simulace pohárového zápasu — reálný zápasový engine (sestavy, morálka, kondice,
 * absence, počasí) + uložení hráčských statistik do match_player_stats.
 */
function simulateCupTie(db, rng, cupMatchId, homeCupTeamId, awayCupTeamId, realTeamOf, strengthOf, weather) {
    return __awaiter(this, void 0, void 0, function () {
        var buildMatchPlayers, simulateMatch, _a, calculatePlayerRatings, extractStatsFromEvents, saveMatchPlayerStats, determineManOfMatch, saveMatchMom, homeReal, awayReal, savedLineup, homeLR, awayLR, homeBuild, _b, _c, _d, awayBuild, _e, _f, _g, homeLineup, homeSubs, awayLineup, awaySubs, fb, homePre, awayPre, homeSetup, awaySetup, result, fullIdMap, _i, _h, _j, e, d, _k, _l, _m, e, d, positions, _o, _p, _q, d, p, _r, _s, _t, d, p, enginePos, _u, _v, p, ratings, homeStarterIds, awayStarterIds, homeUpdates, awayUpdates, toEntry, entries, hp, ap, homeWin, winnerStr, loserStr;
        var _w;
        var _this = this;
        var _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7, _8, _9, _10, _11, _12, _13;
        return __generator(this, function (_14) {
            switch (_14.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("../multiplayer/match-runner"); })];
                case 1:
                    buildMatchPlayers = (_14.sent()).buildMatchPlayers;
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("../engine/simulation"); })];
                case 2:
                    simulateMatch = (_14.sent()).simulateMatch;
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("../stats/update-stats"); })];
                case 3:
                    _a = _14.sent(), calculatePlayerRatings = _a.calculatePlayerRatings, extractStatsFromEvents = _a.extractStatsFromEvents, saveMatchPlayerStats = _a.saveMatchPlayerStats, determineManOfMatch = _a.determineManOfMatch, saveMatchMom = _a.saveMatchMom;
                    homeReal = (_x = realTeamOf.get(homeCupTeamId)) !== null && _x !== void 0 ? _x : null;
                    awayReal = (_y = realTeamOf.get(awayCupTeamId)) !== null && _y !== void 0 ? _y : null;
                    savedLineup = function (rid) { return __awaiter(_this, void 0, void 0, function () {
                        var _a;
                        return __generator(this, function (_b) {
                            switch (_b.label) {
                                case 0:
                                    if (!rid) return [3 /*break*/, 2];
                                    return [4 /*yield*/, db.prepare("SELECT players_data, formation FROM lineups WHERE team_id = ? ORDER BY submitted_at DESC LIMIT 1").bind(rid).first().catch(function (e) { logger_1.logger.warn({ module: M }, "cup saved lineup", e); return null; })];
                                case 1:
                                    _a = _b.sent();
                                    return [3 /*break*/, 3];
                                case 2:
                                    _a = null;
                                    _b.label = 3;
                                case 3: return [2 /*return*/, _a];
                            }
                        });
                    }); };
                    return [4 /*yield*/, savedLineup(homeReal)];
                case 4:
                    homeLR = _14.sent();
                    return [4 /*yield*/, savedLineup(awayReal)];
                case 5:
                    awayLR = _14.sent();
                    if (!homeReal) return [3 /*break*/, 7];
                    return [4 /*yield*/, buildMatchPlayers(db, homeReal, (_z = homeLR === null || homeLR === void 0 ? void 0 : homeLR.players_data) !== null && _z !== void 0 ? _z : null, 0, { matchKey: cupMatchId })];
                case 6:
                    _b = _14.sent();
                    return [3 /*break*/, 10];
                case 7:
                    _c = buildMatchPlayers;
                    _d = [db, homeCupTeamId, null, 0, { matchKey: cupMatchId }];
                    return [4 /*yield*/, loadCupClubRows(db, homeCupTeamId)];
                case 8: return [4 /*yield*/, _c.apply(void 0, _d.concat([_14.sent()]))];
                case 9:
                    _b = _14.sent();
                    _14.label = 10;
                case 10:
                    homeBuild = _b;
                    if (!awayReal) return [3 /*break*/, 12];
                    return [4 /*yield*/, buildMatchPlayers(db, awayReal, (_0 = awayLR === null || awayLR === void 0 ? void 0 : awayLR.players_data) !== null && _0 !== void 0 ? _0 : null, 100, { matchKey: cupMatchId })];
                case 11:
                    _e = _14.sent();
                    return [3 /*break*/, 15];
                case 12:
                    _f = buildMatchPlayers;
                    _g = [db, awayCupTeamId, null, 100, { matchKey: cupMatchId }];
                    return [4 /*yield*/, loadCupClubRows(db, awayCupTeamId)];
                case 13: return [4 /*yield*/, _f.apply(void 0, _g.concat([_14.sent()]))];
                case 14:
                    _e = _14.sent();
                    _14.label = 15;
                case 15:
                    awayBuild = _e;
                    homeLineup = homeBuild.players;
                    homeSubs = homeLineup.splice(11);
                    awayLineup = awayBuild.players;
                    awaySubs = awayLineup.splice(11);
                    if (homeLineup.length < 7 || awayLineup.length < 7) {
                        logger_1.logger.warn({ module: M }, "cup tie ".concat(cupMatchId, ": m\u00E1lo hr\u00E1\u010D\u016F (home ").concat(homeLineup.length, ", away ").concat(awayLineup.length, ") \u2192 silov\u00E1 simulace bez statistik (k\u00E1dr velkoklubu nebo tenk\u00FD re\u00E1ln\u00FD k\u00E1dr)"));
                        fb = simMatch((_1 = strengthOf.get(homeCupTeamId)) !== null && _1 !== void 0 ? _1 : 30, (_2 = strengthOf.get(awayCupTeamId)) !== null && _2 !== void 0 ? _2 : 30, rng);
                        return [2 /*return*/, __assign(__assign({}, fb), { hp: (_3 = fb.hp) !== null && _3 !== void 0 ? _3 : 0, ap: (_4 = fb.ap) !== null && _4 !== void 0 ? _4 : 0 })];
                    }
                    homePre = homeLineup.map(function (p) { return (__assign({}, p)); });
                    awayPre = awayLineup.map(function (p) { return (__assign({}, p)); });
                    homeSetup = { teamId: 1, teamName: "Domácí", lineup: homeLineup, subs: homeSubs, tactic: "balanced", formation: (_5 = homeLR === null || homeLR === void 0 ? void 0 : homeLR.formation) !== null && _5 !== void 0 ? _5 : "4-4-2", formationFamiliarity: 0 };
                    awaySetup = { teamId: 2, teamName: "Hosté", lineup: awayLineup, subs: awaySubs, tactic: "balanced", formation: (_6 = awayLR === null || awayLR === void 0 ? void 0 : awayLR.formation) !== null && _6 !== void 0 ? _6 : "4-4-2", formationFamiliarity: 0 };
                    result = simulateMatch(rng, { home: homeSetup, away: awaySetup, weather: weather, isHomeAdvantage: false });
                    fullIdMap = new Map();
                    for (_i = 0, _h = homeBuild.idMap; _i < _h.length; _i++) {
                        _j = _h[_i], e = _j[0], d = _j[1];
                        fullIdMap.set(e, d);
                    }
                    for (_k = 0, _l = awayBuild.idMap; _k < _l.length; _k++) {
                        _m = _l[_k], e = _m[0], d = _m[1];
                        fullIdMap.set(e, d);
                    }
                    positions = new Map();
                    for (_o = 0, _p = homeBuild.positionMap; _o < _p.length; _o++) {
                        _q = _p[_o], d = _q[0], p = _q[1];
                        positions.set(d, p);
                    }
                    for (_r = 0, _s = awayBuild.positionMap; _r < _s.length; _r++) {
                        _t = _s[_r], d = _t[0], p = _t[1];
                        positions.set(d, p);
                    }
                    enginePos = new Map();
                    for (_u = 0, _v = __spreadArray(__spreadArray(__spreadArray(__spreadArray([], homePre, true), homeSubs, true), awayPre, true), awaySubs, true); _u < _v.length; _u++) {
                        p = _v[_u];
                        enginePos.set(p.id, (_7 = p.matchPosition) !== null && _7 !== void 0 ? _7 : p.position);
                    }
                    ratings = calculatePlayerRatings(result.events, fullIdMap, 1, result.homeScore, result.awayScore, enginePos);
                    homeStarterIds = homePre.map(function (p) { var _a; return (_a = homeBuild.idMap.get(p.id)) !== null && _a !== void 0 ? _a : ""; }).filter(Boolean);
                    awayStarterIds = awayPre.map(function (p) { var _a; return (_a = awayBuild.idMap.get(p.id)) !== null && _a !== void 0 ? _a : ""; }).filter(Boolean);
                    homeUpdates = extractStatsFromEvents(result.events, homeBuild.idMap, homeStarterIds, ratings, result.playerMinutes);
                    awayUpdates = extractStatsFromEvents(result.events, awayBuild.idMap, awayStarterIds, ratings, result.playerMinutes);
                    toEntry = function (u, cupTeamId, starters) {
                        var _a;
                        return ({
                            playerId: u.playerId, teamId: cupTeamId, started: starters.includes(u.playerId), position: (_a = positions.get(u.playerId)) !== null && _a !== void 0 ? _a : "MID",
                            minutesPlayed: u.minutesPlayed, goals: u.goals, assists: u.assists, yellowCards: u.yellowCards, redCards: u.redCards, rating: u.rating,
                        });
                    };
                    entries = __spreadArray(__spreadArray([], homeUpdates.map(function (u) { return toEntry(u, homeCupTeamId, homeStarterIds); }), true), awayUpdates.map(function (u) { return toEntry(u, awayCupTeamId, awayStarterIds); }), true);
                    return [4 /*yield*/, saveMatchPlayerStats(db, cupMatchId, entries).catch(function (e) { return logger_1.logger.warn({ module: M }, "save cup player stats", e); })];
                case 16:
                    _14.sent();
                    return [4 /*yield*/, saveMatchMom(db, cupMatchId, determineManOfMatch(ratings)).catch(function (e) { return logger_1.logger.warn({ module: M }, "cup mom", e); })];
                case 17:
                    _14.sent();
                    hp = 0, ap = 0;
                    if (result.homeScore === result.awayScore) {
                        (_w = cupShootout(rng, (_8 = strengthOf.get(homeCupTeamId)) !== null && _8 !== void 0 ? _8 : 50, (_9 = strengthOf.get(awayCupTeamId)) !== null && _9 !== void 0 ? _9 : 50), hp = _w.hp, ap = _w.ap);
                    }
                    homeWin = result.homeScore > result.awayScore || (result.homeScore === result.awayScore && hp > ap);
                    winnerStr = homeWin ? ((_10 = strengthOf.get(homeCupTeamId)) !== null && _10 !== void 0 ? _10 : 30) : ((_11 = strengthOf.get(awayCupTeamId)) !== null && _11 !== void 0 ? _11 : 30);
                    loserStr = homeWin ? ((_12 = strengthOf.get(awayCupTeamId)) !== null && _12 !== void 0 ? _12 : 30) : ((_13 = strengthOf.get(homeCupTeamId)) !== null && _13 !== void 0 ? _13 : 30);
                    return [2 /*return*/, { hg: result.homeScore, ag: result.awayScore, hp: hp, ap: ap, homeWin: homeWin, upset: loserStr - winnerStr >= 12 }];
            }
        });
    });
}
/** Odsimuluje aktuální kolo poháru a vygeneruje další kolo z vítězů (nebo ukončí pohár ve finále). */
function simulateCupRound(db, cupId) {
    return __awaiter(this, void 0, void 0, function () {
        var cup, round, CUP_CHUNK, matchesRes, teamsRes, strengthOf, realTeamOf, gdRow, gameDate, prize, repBonus, roundLabel, rng, winners, _i, _a, m, cupWeathers, tieWeather, r, winnerId, loserId, realWinner, cupRefId, alreadyPaid, _b, remain, winnersRes, winnersAll, champ, nextByPos, _c, winnersAll_1, w, np, slot, roundDates, nextDate, nextStmts, _d, nextByPos_1, _e, np, slot, i;
        var _f, _g, _h, _j, _k, _l, _m, _o;
        return __generator(this, function (_p) {
            switch (_p.label) {
                case 0: return [4 /*yield*/, db.prepare("SELECT total_rounds, current_round, status, season_number FROM cup_competitions WHERE id = ?").bind(cupId)
                        .first()
                        .catch(function (e) { logger_1.logger.warn({ module: M }, "load cup", e); return null; })];
                case 1:
                    cup = _p.sent();
                    if (!cup || cup.status !== "active")
                        return [2 /*return*/, { ok: false }];
                    round = cup.current_round;
                    CUP_CHUNK = 12;
                    return [4 /*yield*/, db.prepare("SELECT id, bracket_pos, home_cup_team_id, away_cup_team_id FROM cup_matches WHERE cup_id = ? AND round = ? AND status = 'scheduled' ORDER BY bracket_pos LIMIT ?")
                            .bind(cupId, round, CUP_CHUNK).all()
                            .catch(function (e) { logger_1.logger.warn({ module: M }, "load round matches", e); return { results: [] }; })];
                case 2:
                    matchesRes = _p.sent();
                    return [4 /*yield*/, db.prepare("SELECT id, strength, team_id FROM cup_teams WHERE cup_id = ?").bind(cupId).all()
                            .catch(function (e) { logger_1.logger.warn({ module: M }, "load cup teams", e); return { results: [] }; })];
                case 3:
                    teamsRes = _p.sent();
                    strengthOf = new Map(teamsRes.results.map(function (t) { return [t.id, t.strength]; }));
                    realTeamOf = new Map(teamsRes.results.map(function (t) { return [t.id, t.team_id]; }));
                    return [4 /*yield*/, db.prepare("SELECT MAX(game_date) AS d FROM teams WHERE game_date IS NOT NULL").first()
                            .catch(function (e) { logger_1.logger.warn({ module: M }, "load game date", e); return null; })];
                case 4:
                    gdRow = _p.sent();
                    gameDate = (_f = gdRow === null || gdRow === void 0 ? void 0 : gdRow.d) !== null && _f !== void 0 ? _f : new Date().toISOString();
                    prize = cupPrize(round, cup.total_rounds);
                    repBonus = cupRepBonus(round, cup.total_rounds);
                    roundLabel = roundName(round, cup.total_rounds);
                    rng = (0, rng_1.createRng)((cupId.charCodeAt(0) + round * 7919) >>> 0);
                    winners = [];
                    _i = 0, _a = matchesRes.results;
                    _p.label = 5;
                case 5:
                    if (!(_i < _a.length)) return [3 /*break*/, 17];
                    m = _a[_i];
                    if (!m.home_cup_team_id || !m.away_cup_team_id)
                        return [3 /*break*/, 16];
                    cupWeathers = ["sunny", "cloudy", "cloudy", "rain", "wind", "snow"];
                    tieWeather = cupWeathers[rng.int(0, cupWeathers.length - 1)];
                    return [4 /*yield*/, simulateCupTie(db, rng, m.id, m.home_cup_team_id, m.away_cup_team_id, realTeamOf, strengthOf, tieWeather)];
                case 6:
                    r = _p.sent();
                    winnerId = r.homeWin ? m.home_cup_team_id : m.away_cup_team_id;
                    loserId = r.homeWin ? m.away_cup_team_id : m.home_cup_team_id;
                    return [4 /*yield*/, db.prepare("UPDATE cup_matches SET home_score=?, away_score=?, home_pens=?, away_pens=?, winner_cup_team_id=?, status='simulated', upset=? WHERE id=?")
                            .bind(r.hg, r.ag, r.hp, r.ap, winnerId, r.upset ? 1 : 0, m.id).run()
                            .catch(function (e) { return logger_1.logger.warn({ module: M }, "update cup match", e); })];
                case 7:
                    _p.sent();
                    return [4 /*yield*/, db.prepare("UPDATE cup_teams SET eliminated_round = ? WHERE id = ?").bind(round, loserId).run()
                            .catch(function (e) { return logger_1.logger.warn({ module: M }, "eliminate", e); })];
                case 8:
                    _p.sent();
                    winners.push({ pos: m.bracket_pos, teamId: winnerId });
                    realWinner = realTeamOf.get(winnerId);
                    cupRefId = "cup-".concat(cupId, "-r").concat(round, "-").concat(winnerId);
                    if (!realWinner) return [3 /*break*/, 10];
                    return [4 /*yield*/, db.prepare("SELECT 1 FROM transactions WHERE reference_id = ?").bind(cupRefId).first().catch(function (e) { logger_1.logger.warn({ module: M }, "cup prize gate", e); return null; })];
                case 9:
                    _b = _p.sent();
                    return [3 /*break*/, 11];
                case 10:
                    _b = null;
                    _p.label = 11;
                case 11:
                    alreadyPaid = _b;
                    if (!(realWinner && !alreadyPaid)) return [3 /*break*/, 16];
                    return [4 /*yield*/, (0, finance_processor_1.recordTransaction)(db, realWinner, "cup_prize", prize, "Poh\u00E1r \u2014 postup (".concat(roundLabel, ")"), gameDate, cupRefId)
                            .catch(function (e) { return logger_1.logger.warn({ module: M }, "cup prize", e); })];
                case 12:
                    _p.sent();
                    if (!(repBonus.manager > 0)) return [3 /*break*/, 14];
                    return [4 /*yield*/, db.prepare("UPDATE managers SET reputation = MAX(15, MIN(75, reputation + ?)) WHERE team_id = ?").bind(repBonus.manager, realWinner).run()
                            .catch(function (e) { return logger_1.logger.warn({ module: M }, "cup manager reputation", e); })];
                case 13:
                    _p.sent();
                    _p.label = 14;
                case 14:
                    if (!(repBonus.team > 0)) return [3 /*break*/, 16];
                    return [4 /*yield*/, db.prepare("UPDATE teams SET reputation = MAX(0, MIN(100, reputation + ?)) WHERE id = ?").bind(repBonus.team, realWinner).run()
                            .catch(function (e) { return logger_1.logger.warn({ module: M }, "cup team reputation", e); })];
                case 15:
                    _p.sent();
                    _p.label = 16;
                case 16:
                    _i++;
                    return [3 /*break*/, 5];
                case 17: return [4 /*yield*/, db.prepare("SELECT COUNT(*) AS c FROM cup_matches WHERE cup_id = ? AND round = ? AND status = 'scheduled'").bind(cupId, round).first()
                        .catch(function (e) { logger_1.logger.warn({ module: M }, "count remaining", e); return { c: 0 }; })];
                case 18:
                    remain = _p.sent();
                    if (((_g = remain === null || remain === void 0 ? void 0 : remain.c) !== null && _g !== void 0 ? _g : 0) > 0)
                        return [2 /*return*/, { ok: true, round: round }]; // kolo ještě není celé dohrané
                    return [4 /*yield*/, db.prepare("SELECT bracket_pos, winner_cup_team_id FROM cup_matches WHERE cup_id = ? AND round = ? AND status = 'simulated' AND winner_cup_team_id IS NOT NULL").bind(cupId, round).all()
                            .catch(function (e) { logger_1.logger.warn({ module: M }, "gather winners", e); return { results: [] }; })];
                case 19:
                    winnersRes = _p.sent();
                    winnersAll = winnersRes.results.map(function (w) { return ({ pos: w.bracket_pos, teamId: w.winner_cup_team_id }); });
                    if (!(round >= cup.total_rounds)) return [3 /*break*/, 21];
                    champ = (_j = (_h = winnersAll[0]) === null || _h === void 0 ? void 0 : _h.teamId) !== null && _j !== void 0 ? _j : null;
                    return [4 /*yield*/, db.prepare("UPDATE cup_competitions SET status='finished', winner_team_id=? WHERE id=?").bind(champ, cupId).run()
                            .catch(function (e) { return logger_1.logger.warn({ module: M }, "finish cup", e); })];
                case 20:
                    _p.sent();
                    return [2 /*return*/, { ok: true, round: round, finished: true, winner: champ !== null && champ !== void 0 ? champ : undefined }];
                case 21:
                    // Vygeneruj další kolo: vítěz pozice i → další kolo pozice floor(i/2), home pokud i sudé
                    winnersAll.sort(function (a, b) { return a.pos - b.pos; });
                    nextByPos = new Map();
                    for (_c = 0, winnersAll_1 = winnersAll; _c < winnersAll_1.length; _c++) {
                        w = winnersAll_1[_c];
                        np = Math.floor(w.pos / 2);
                        slot = (_k = nextByPos.get(np)) !== null && _k !== void 0 ? _k : {};
                        if (w.pos % 2 === 0)
                            slot.home = w.teamId;
                        else
                            slot.away = w.teamId;
                        nextByPos.set(np, slot);
                    }
                    return [4 /*yield*/, cupRoundDates(db, cup.season_number, cup.total_rounds)];
                case 22:
                    roundDates = _p.sent();
                    nextDate = (_l = roundDates[round]) !== null && _l !== void 0 ? _l : null;
                    nextStmts = [];
                    for (_d = 0, nextByPos_1 = nextByPos; _d < nextByPos_1.length; _d++) {
                        _e = nextByPos_1[_d], np = _e[0], slot = _e[1];
                        nextStmts.push(db.prepare("INSERT INTO cup_matches (id, cup_id, round, bracket_pos, home_cup_team_id, away_cup_team_id, scheduled_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled')").bind(crypto.randomUUID(), cupId, round + 1, np, (_m = slot.home) !== null && _m !== void 0 ? _m : null, (_o = slot.away) !== null && _o !== void 0 ? _o : null, nextDate));
                    }
                    i = 0;
                    _p.label = 23;
                case 23:
                    if (!(i < nextStmts.length)) return [3 /*break*/, 26];
                    return [4 /*yield*/, db.batch(nextStmts.slice(i, i + 40)).catch(function (e) { return logger_1.logger.error({ module: M }, "insert next round", e); })];
                case 24:
                    _p.sent();
                    _p.label = 25;
                case 25:
                    i += 40;
                    return [3 /*break*/, 23];
                case 26: return [4 /*yield*/, db.prepare("UPDATE cup_competitions SET current_round = ? WHERE id = ?").bind(round + 1, cupId).run()
                        .catch(function (e) { return logger_1.logger.warn({ module: M }, "bump round", e); })];
                case 27:
                    _p.sent();
                    return [2 /*return*/, { ok: true, round: round }];
            }
        });
    });
}
/**
 * Auto-postup poháru: pokud aktuální kolo aktivního poháru má naplánované datum
 * <= herní den, odsimuluj ho (i víc kol dozadu, kdyby se hra opozdila). Volá se z daily-ticku.
 */
function maybeAdvanceCup(db) {
    return __awaiter(this, void 0, void 0, function () {
        var season, gd, anyCup, advanced, guard, cup, cur;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db.prepare("SELECT MAX(number) AS n FROM seasons WHERE status = 'active'").first()
                        .catch(function (e) { logger_1.logger.warn({ module: M }, "advance: season", e); return null; })];
                case 1:
                    season = _a.sent();
                    if (!(season === null || season === void 0 ? void 0 : season.n))
                        return [2 /*return*/, 0];
                    return [4 /*yield*/, db.prepare("SELECT MAX(game_date) AS d FROM teams WHERE game_date IS NOT NULL").first()
                            .catch(function (e) { logger_1.logger.warn({ module: M }, "advance: game date", e); return null; })];
                case 2:
                    gd = _a.sent();
                    if (!(gd === null || gd === void 0 ? void 0 : gd.d))
                        return [2 /*return*/, 0];
                    return [4 /*yield*/, db.prepare("SELECT id FROM cup_competitions WHERE season_number = ? LIMIT 1").bind(season.n).first()
                            .catch(function (e) { logger_1.logger.warn({ module: M }, "advance: any cup", e); return null; })];
                case 3:
                    anyCup = _a.sent();
                    if (!!anyCup) return [3 /*break*/, 5];
                    return [4 /*yield*/, createCup(db, season.n).catch(function (e) { return logger_1.logger.warn({ module: M }, "lazy create cup", e); })];
                case 4:
                    _a.sent();
                    return [2 /*return*/, 0];
                case 5: 
                // Lazy dogenerování kádrů velkoklubů (chunk 8/tick) — musí být hotové před 1. kolem.
                return [4 /*yield*/, ensureBigClubSquads(db, anyCup.id, 8).catch(function (e) { return logger_1.logger.warn({ module: M }, "ensure big club squads", e); })];
                case 6:
                    // Lazy dogenerování kádrů velkoklubů (chunk 8/tick) — musí být hotové před 1. kolem.
                    _a.sent();
                    advanced = 0, guard = 0;
                    _a.label = 7;
                case 7:
                    if (!(guard++ < 3)) return [3 /*break*/, 11];
                    return [4 /*yield*/, db.prepare("SELECT id, current_round FROM cup_competitions WHERE season_number = ? AND status = 'active' LIMIT 1")
                            .bind(season.n).first()
                            .catch(function (e) { logger_1.logger.warn({ module: M }, "advance: load cup", e); return null; })];
                case 8:
                    cup = _a.sent();
                    if (!cup)
                        return [3 /*break*/, 11];
                    return [4 /*yield*/, db.prepare("SELECT MIN(scheduled_at) AS d FROM cup_matches WHERE cup_id = ? AND round = ? AND status = 'scheduled'")
                            .bind(cup.id, cup.current_round).first()
                            .catch(function (e) { logger_1.logger.warn({ module: M }, "advance: round date", e); return null; })];
                case 9:
                    cur = _a.sent();
                    if (!(cur === null || cur === void 0 ? void 0 : cur.d) || cur.d > gd.d)
                        return [3 /*break*/, 11]; // kolo ještě nemá nadejít / už je dohrané
                    return [4 /*yield*/, simulateCupRound(db, cup.id)];
                case 10:
                    _a.sent();
                    advanced++;
                    return [3 /*break*/, 7];
                case 11:
                    if (advanced > 0)
                        logger_1.logger.info({ module: M }, "cup auto-advanced ".concat(advanced, " kol (s=").concat(season.n, ")"));
                    return [2 /*return*/, advanced];
            }
        });
    });
}
