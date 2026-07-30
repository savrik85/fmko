"use strict";
/**
 * Match summary — "Co rozhodlo o výsledku".
 *
 * Pure post-mortem analyzer: vezme uložená data zápasu (lineup_data, player_ratings,
 * events) a vrátí top 3 faktory které rozhodly. Vysvětluje hráči, proč vyhrál/prohrál.
 *
 * Neslouží jako JIT compute pro existující zápasy — žádný DB write.
 */
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
exports.buildMatchSummary = buildMatchSummary;
var TACTIC_LABEL = {
    offensive: "Útočná",
    balanced: "Vyrovnaná",
    defensive: "Defenzivní",
    long_ball: "Nakopávané",
    possession: "Držení míče",
    pressing: "Vysoký presink",
};
var TACTIC_VS_TACTIC = {
    offensive: {
        defensive: "Útok proti pevné obraně — nevyhrávající kombinace.",
        balanced: "Útočná taktika tě posílila v útoku, ale otevřela obranu.",
    },
    defensive: {
        offensive: "Defenzivní postoj proti silnému útoku — solidní volba.",
        balanced: "Defenzivní taktika omezila útok i obranu.",
    },
};
function avg(values) {
    if (values.length === 0)
        return 0;
    return values.reduce(function (a, b) { return a + b; }, 0) / values.length;
}
function avgRatingForPosition(starters, ratings, pos) {
    var players = starters.filter(function (p) { var _a; return ((_a = p.position) !== null && _a !== void 0 ? _a : p.naturalPosition) === pos; });
    if (players.length === 0)
        return 0;
    // Per-player: match rating (0-10) když existuje, jinak pre-match rating (0-100 scale)
    // přeškálovaný na 0-10 podle FM-style empirické křivky: rating 50 ≈ 6.5 match rating.
    var values = players.map(function (p) {
        var matchR = ratings[p.id];
        if (typeof matchR === "number" && matchR > 0)
            return matchR;
        // pre-match rating je 1-100; map 30→5, 50→6.5, 70→8 (linear přes 0.075x + 3)
        return Math.max(3, Math.min(9, p.rating * 0.075 + 3));
    });
    return avg(values);
}
function deltaToImpact(delta) {
    if (delta >= 2.0)
        return "HIGH_POSITIVE";
    if (delta >= 1.0)
        return "MEDIUM_POSITIVE";
    if (delta >= 0.3)
        return "LOW_POSITIVE";
    if (delta <= -2.0)
        return "HIGH_NEGATIVE";
    if (delta <= -1.0)
        return "MEDIUM_NEGATIVE";
    if (delta <= -0.3)
        return "LOW_NEGATIVE";
    return "NEUTRAL";
}
function buildMatchSummary(input) {
    var _a, _b, _c, _d, _e;
    var homeLineupData = input.homeLineupData, awayLineupData = input.awayLineupData, playerRatings = input.playerRatings, events = input.events, homeScore = input.homeScore, awayScore = input.awayScore, isOwnHome = input.isOwnHome;
    if (!homeLineupData || !awayLineupData)
        return null;
    var ownLineup = isOwnHome ? homeLineupData : awayLineupData;
    var oppLineup = isOwnHome ? awayLineupData : homeLineupData;
    var ownScore = isOwnHome ? homeScore : awayScore;
    var oppScore = isOwnHome ? awayScore : homeScore;
    var ownStrength = {
        gk: round1(avgRatingForPosition(ownLineup.starters, playerRatings, "GK")),
        def: round1(avgRatingForPosition(ownLineup.starters, playerRatings, "DEF")),
        mid: round1(avgRatingForPosition(ownLineup.starters, playerRatings, "MID")),
        fwd: round1(avgRatingForPosition(ownLineup.starters, playerRatings, "FWD")),
    };
    var opponentStrength = {
        gk: round1(avgRatingForPosition(oppLineup.starters, playerRatings, "GK")),
        def: round1(avgRatingForPosition(oppLineup.starters, playerRatings, "DEF")),
        mid: round1(avgRatingForPosition(oppLineup.starters, playerRatings, "MID")),
        fwd: round1(avgRatingForPosition(oppLineup.starters, playerRatings, "FWD")),
    };
    var outcome = ownScore > oppScore ? "WIN" : ownScore < oppScore ? "LOSS" : "DRAW";
    // ── Generuj kandidáty faktorů ────────────────────────────────────────────
    var candidates = [];
    // 1. Key matchup — největší rozdíl po liniích
    var matchups = [
        { line: "gk", label: "Brankář", emoji: "🧤" },
        { line: "def", label: "Obrana", emoji: "🛡️" },
        { line: "mid", label: "Záloha", emoji: "🎯" },
        { line: "fwd", label: "Útok", emoji: "⚔️" },
    ];
    for (var _i = 0, matchups_1 = matchups; _i < matchups_1.length; _i++) {
        var _f = matchups_1[_i], line = _f.line, label = _f.label;
        var ownVal = ownStrength[line];
        var oppVal = opponentStrength[line];
        if (ownVal === 0 || oppVal === 0)
            continue;
        var delta = ownVal - oppVal;
        if (Math.abs(delta) < 0.3)
            continue; // nezajímavé
        var impact = deltaToImpact(delta);
        // Hodnocení je o VÝKONU v zápase (match rating), ne o kvalitě kádru — formulace to musí
        // dát jasně najevo, jinak čtenář čte „slabší útok" jako sílu týmu, i když kádrově je vyrovnaný.
        var description = delta > 0
            ? "".concat(label, ": o ").concat(Math.abs(delta).toFixed(1), " lep\u0161\u00ED v\u00FDkon ne\u017E soupe\u0159 (").concat(ownVal.toFixed(1), " vs ").concat(oppVal.toFixed(1), ").")
            : "".concat(label, ": o ").concat(Math.abs(delta).toFixed(1), " slab\u0161\u00ED v\u00FDkon ne\u017E soupe\u0159 (").concat(ownVal.toFixed(1), " vs ").concat(oppVal.toFixed(1), ").");
        candidates.push({
            type: line === "gk" ? "goalkeeper" : "key_matchup",
            label: label,
            description: description,
            impact: impact,
            ownValue: ownVal,
            oppValue: oppVal,
        });
    }
    // 2. Tactic matchup — pro staré zápasy může být tactic null
    var ownTactic = (_a = ownLineup.tactic) !== null && _a !== void 0 ? _a : "balanced";
    var oppTactic = (_b = oppLineup.tactic) !== null && _b !== void 0 ? _b : "balanced";
    if (ownLineup.tactic && oppLineup.tactic && ownTactic !== oppTactic) {
        var note = (_c = TACTIC_VS_TACTIC[ownTactic]) === null || _c === void 0 ? void 0 : _c[oppTactic];
        if (note) {
            // Heuristika: pokud výhra a taktika doporučená → positive, jinak negative
            var goodCombo = (ownTactic === "defensive" && oppTactic === "offensive") ||
                (ownTactic === "offensive" && oppTactic === "balanced");
            var impact = outcome === "WIN"
                ? (goodCombo ? "MEDIUM_POSITIVE" : "LOW_POSITIVE")
                : (goodCombo ? "LOW_NEGATIVE" : "MEDIUM_NEGATIVE");
            candidates.push({
                type: "tactic",
                label: "Taktika",
                description: "".concat(TACTIC_LABEL[ownTactic], " vs ").concat(TACTIC_LABEL[oppTactic], " \u2014 ").concat(note),
                impact: impact,
            });
        }
    }
    // 3. Karty a disciplína — type "card" + detail "red"
    var isRedCard = function (e) { return e.type === "card" && e.detail === "red"; };
    var ownRed = events.filter(function (e) { return isRedCard(e) && playerIsInLineup(e, ownLineup); }).length;
    var oppRed = events.filter(function (e) { return isRedCard(e) && playerIsInLineup(e, oppLineup); }).length;
    if (ownRed > 0 || oppRed > 0) {
        var netRed = oppRed - ownRed;
        if (Math.abs(netRed) >= 1) {
            candidates.push({
                type: "discipline",
                label: "Disciplína",
                description: ownRed > 0
                    ? "Vylou\u010Den\u00ED (".concat(ownRed, ") ve tv\u00E9m t\u00FDmu v\u00FDznamn\u011B ovlivnilo z\u00E1pas.")
                    : "Soupe\u0159 dostal ".concat(oppRed, " \u010Derven").concat(oppRed === 1 ? "ou kartu" : "é karty", " a ty jsi toho vyu\u017Eil."),
                impact: ownRed > 0 ? "HIGH_NEGATIVE" : "MEDIUM_POSITIVE",
            });
        }
    }
    // ── Vyber top 3 podle |impact| ────────────────────────────────────────────
    var impactOrder = {
        HIGH_NEGATIVE: 6, HIGH_POSITIVE: 6,
        MEDIUM_NEGATIVE: 4, MEDIUM_POSITIVE: 4,
        LOW_NEGATIVE: 2, LOW_POSITIVE: 2,
        NEUTRAL: 0,
    };
    candidates.sort(function (a, b) { return impactOrder[b.impact] - impactOrder[a.impact]; });
    var factors = candidates.slice(0, 3);
    // ── Generuj souhrnný text ─────────────────────────────────────────────────
    var summaryText = buildSummaryText(outcome, factors, ownStrength, opponentStrength);
    return {
        factors: factors,
        ownStrength: ownStrength,
        opponentStrength: opponentStrength,
        // Když původní tactic byla null/undefined (staré zápasy), vracíme prázdný string,
        // aby UI mohlo schovat sekci místo zobrazení "Vyrovnaná" placeholder.
        ownTactic: ownLineup.tactic ? ((_d = TACTIC_LABEL[ownTactic]) !== null && _d !== void 0 ? _d : ownTactic) : "",
        opponentTactic: oppLineup.tactic ? ((_e = TACTIC_LABEL[oppTactic]) !== null && _e !== void 0 ? _e : oppTactic) : "",
        outcome: outcome,
        summaryText: summaryText,
    };
}
function buildSummaryText(outcome, factors, own, opp) {
    if (factors.length === 0) {
        return outcome === "WIN"
            ? "Vyrovnaný zápas — výhru přinesly drobné rozdíly v jednotlivých duelech."
            : outcome === "DRAW"
                ? "Vyrovnaný souboj bez výrazných rozdílů. Remíza odpovídá síle obou týmů."
                : "Soupeř byl celkově silnější — bez výrazné slabiny v jedné konkrétní linii.";
    }
    var topFactor = factors[0];
    if (outcome === "WIN") {
        return "Vyhr\u00E1li jste d\u00EDky **".concat(topFactor.label.toLowerCase(), "** \u2014 ").concat(topFactor.description);
    }
    else if (outcome === "LOSS") {
        return "Kl\u00ED\u010Dov\u00FD rozd\u00EDl: **".concat(topFactor.label.toLowerCase(), "**. ").concat(topFactor.description);
    }
    else {
        var strong = strongLines(own, opp);
        if (strong.length === 0) {
            return "Vyrovnaný souboj. Remíza odpovídá síle obou týmů.";
        }
        var list = strong.join(" a ");
        // Plurál pokud více linií, jinak shoda rodu se singulárem
        var verb = strong.length > 1 ? "stačily" : strong[0] === "obrana" || strong[0] === "záloha" ? "stačila" : "stačil";
        return "Vyrovnan\u00FD souboj. Tvoje siln\u011Bj\u0161\u00ED ".concat(list, " ").concat(verb, " jen na rem\u00EDzu.");
    }
}
function strongLines(own, opp) {
    var lines = [
        ["gk", "brankář"], ["def", "obrana"], ["mid", "záloha"], ["fwd", "útok"],
    ];
    return lines.filter(function (_a) {
        var k = _a[0];
        return own[k] - opp[k] > 0.5;
    }).map(function (_a) {
        var l = _a[1];
        return l;
    });
}
function playerIsInLineup(event, lineup) {
    var ids = new Set(__spreadArray(__spreadArray([], lineup.starters, true), lineup.subs, true).map(function (p) { return p.id; }));
    // MatchEvent.playerId může být engineId (number) nebo dbId. Posíláme dbId v lineup,
    // takže porovnání musí ladit s tím, jak match-runner ukládá events.
    // Pro tuto JIT funkci stačí kontrolovat existenci jako string match.
    var eventPlayerId = event.playerId;
    if (eventPlayerId == null)
        return false;
    return ids.has(String(eventPlayerId));
}
function round1(v) {
    return Math.round(v * 10) / 10;
}
