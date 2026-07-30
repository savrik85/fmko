"use strict";
/**
 * Zpravodajské články o přestupech — generuje české texty s okresním humorem.
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
exports.createTransferNews = createTransferNews;
var logger_1 = require("../lib/logger");
var district_pool_1 = require("../data/flavor/district-pool");
var HUMOR_POOL = {
    core: [
        "Rekordní přestup okresu!",
        "Prý mu slíbili, že bude kopat penalty.",
        "Přestupová bomba otřásla okresním fotbalem.",
        "Za ty prachy si koupíš maximálně sud piva.",
        "V hospodě se o ničem jiném nemluví.",
        "Trenér si mne ruce.",
        "Fanoušci jsou nadšení — oba dva.",
        "Přestup století! No, alespoň tohoto měsíce.",
        "Dres mu šijou na míru. Tedy — svlékají ze starého hráče.",
        "Papíry podepsal, teď jen aby si zapamatoval jméno klubu.",
        "Údajně rozhodla nabídka lepšího čísla na dresu.",
    ],
    prachatice: [
        "Spoluhráči mu na rozloučenou koupili klobásu.",
        "Starosta obce pogratuloval osobně.",
        "Říká se, že rozhodla nabídka domácího guláše po zápase.",
        "Údajně o něj stálo i sousední vesnice, ale prohráli v hospodě v kartách.",
        "Prý se rozhodoval mezi fotbalem a hasičama. Zvítězil míč.",
        "Slavnostní podpis proběhl v místní hospodě za přítomnosti výčepní.",
        "Přestupní papíry podepsal na kapotě traktoru.",
        "Ruku na to si plácli u pípy, zbytek dořešili na pivním tácku.",
        "Prý ho zlákala nabídka, že bude po zápase první u kotle s gulášem.",
        "Na rozloučenou mu myslivci nabalili zvěřinu na cestu.",
        "Papíry doputovaly do klubu v tašce s houbama z Boubína.",
        "O přestupu věděla celá ves dřív než hráč sám — u pumpy v Netolicích.",
        "Trenér si ho vyhlídl na pouti mezi kolotočem a střelnicí.",
    ],
    praha: [
        "Podpis proběhl v kavárně na Vinohradech nad flat white.",
        "Manažer to prý dojednal cestou tramvají, mezi Andělem a Národní.",
        "Za ty peníze si v Praze koupíš tak měsíc nájmu.",
        "Přestup okomentovali i influenceři na Instagramu.",
        "Papíry podepsal na iPadu ve sdíleném officu.",
        "Fanoušci to řešili hlavně v komentech pod postem klubu.",
        "Detaily doladili v metru na céčku, než jim ujela zastávka.",
        "Podpis stihli mezi dvěma zastávkami tramvaje na Smíchov.",
        "Manažer to oslavil matchou na náplavce, hráč craftem na Žižkově.",
        "Klub o přestupu vypustil reel dřív, než hráč dojel z Karlína.",
        "Smlouvu poslali přes DocuSign, podepsal ji na mobilu v kavárně.",
        "Prý rozhodlo hlavně, že to má blíž na metro než k bývalému klubu.",
    ],
};
var HUMOR_YOUNG_POOL = {
    core: [
        "Mladá krev! Snad vydrží aspoň do konce sezóny.",
        "Prý ho doporučil učitel tělocviku.",
        "Ještě nemá ani řidičák, ale na hřišti je jako blesk.",
        "Spoluhráči se těší — konečně někdo, kdo poběží místo nich.",
        "Mládí vpřed! A hlavně na tréninky.",
    ],
};
var HUMOR_OLD_POOL = {
    core: [
        "Zkušenosti k nezaplacení. Tedy — zaplatili jsme trochu.",
        "Říká se mu okresní Maldini.",
        "Kolena sice vrzou, ale hlava to pořád má.",
        "Veterán, který viděl víc sobot v kabině než většina hráčů.",
        "Přišel s vlastní masážní emulzí a ibuprofenem.",
    ],
};
function createTransferNews(db, leagueId, teamId, type, data, rng) {
    return __awaiter(this, void 0, void 0, function () {
        var headline, body, district, _a, pick, coreHumor, agePool, humor, id;
        var _b, _c, _d, _e, _f, _g;
        return __generator(this, function (_h) {
            switch (_h.label) {
                case 0:
                    headline = "";
                    body = "";
                    if (!leagueId) return [3 /*break*/, 2];
                    return [4 /*yield*/, db.prepare("SELECT district FROM leagues WHERE id = ?").bind(leagueId).first()
                            .catch(function (e) { logger_1.logger.warn({ module: "transfer-news" }, "load district", e); return null; })];
                case 1:
                    _a = (_b = (_h.sent())) === null || _b === void 0 ? void 0 : _b.district;
                    return [3 /*break*/, 3];
                case 2:
                    _a = undefined;
                    _h.label = 3;
                case 3:
                    district = _a;
                    pick = (_c = rng === null || rng === void 0 ? void 0 : rng.pick.bind(rng)) !== null && _c !== void 0 ? _c : (function (arr) { return arr[Math.floor(Math.random() * arr.length)]; });
                    coreHumor = (0, district_pool_1.districtPoolFor)(HUMOR_POOL, district);
                    agePool = data.playerAge <= 22
                        ? __spreadArray(__spreadArray([], coreHumor, true), (0, district_pool_1.districtPoolFor)(HUMOR_YOUNG_POOL, district), true) : data.playerAge >= 33
                        ? __spreadArray(__spreadArray([], coreHumor, true), (0, district_pool_1.districtPoolFor)(HUMOR_OLD_POOL, district), true) : coreHumor;
                    humor = pick(agePool);
                    switch (type) {
                        case "player_released":
                            headline = "".concat(data.teamName, " se rozlou\u010Dil s ").concat(data.playerName);
                            body = "Veden\u00ED ".concat(data.teamName, " se rozhodlo uvolnit ").concat(data.playerName, " (").concat(data.playerAge, ", ").concat(data.playerPosition, "). ").concat((_d = data.reason) !== null && _d !== void 0 ? _d : "Důvody nejsou známy.", " Je te\u010F voln\u00FD hr\u00E1\u010D.");
                            break;
                        case "player_signed":
                            headline = "".concat(data.playerName, " pos\u00EDl\u00ED k\u00E1dr ").concat(data.teamName);
                            body = "".concat(data.playerName, " (").concat(data.playerAge, ", ").concat(data.playerPosition, ") podepsal za ").concat(data.teamName, ". ").concat(humor);
                            break;
                        case "player_quit":
                            headline = "".concat(data.playerName, " p\u0159estal chodit na tr\u00E9ninky");
                            body = "Fotbalista ".concat(data.teamName, " ").concat(data.playerName, " (").concat(data.playerAge, ") p\u0159estal doch\u00E1zet. ").concat((_e = data.reason) !== null && _e !== void 0 ? _e : "Prý ho to nebaví.");
                            break;
                        case "transfer_completed":
                            if (data.isCrossDistrict) {
                                headline = "Posila z jin\u00E9ho okresu! ".concat(data.playerName, " p\u0159ich\u00E1z\u00ED z ").concat(data.fromTeamName);
                                body = "".concat(data.toTeamName, " p\u0159ivedl ").concat(data.playerName, " (").concat(data.playerAge, ", ").concat(data.playerPosition, ") a\u017E z ").concat(data.fromTeamName).concat(data.fee ? " za ".concat(data.fee.toLocaleString("cs"), " K\u010D") : "", ". Meziokresn\u00ED p\u0159estup vzbudil pozornost \u2014 uvid\u00EDme, jestli se nov\u00E9mu prost\u0159ed\u00ED p\u0159izp\u016Fsob\u00ED.");
                            }
                            else {
                                headline = "P\u0159estup! ".concat(data.playerName, " m\u00ED\u0159\u00ED z ").concat(data.fromTeamName, " do ").concat(data.toTeamName);
                                body = "".concat(data.playerName, " (").concat(data.playerAge, ", ").concat(data.playerPosition, ") p\u0159estupuje z ").concat(data.fromTeamName, " do ").concat(data.toTeamName).concat(data.fee ? " za ".concat(data.fee.toLocaleString("cs"), " K\u010D") : "", ". ").concat(humor);
                            }
                            break;
                        case "loan_completed":
                            headline = "Hostov\u00E1n\u00ED: ".concat(data.playerName, " zam\u00ED\u0159il do ").concat(data.toTeamName);
                            body = "".concat(data.playerName, " (").concat(data.playerAge, ", ").concat(data.playerPosition, ") odch\u00E1z\u00ED z ").concat(data.fromTeamName, " na hostov\u00E1n\u00ED do ").concat(data.toTeamName).concat(data.fee ? " za poplatek ".concat(data.fee.toLocaleString("cs"), " K\u010D") : "", ". Uvid\u00EDme, jestli se vr\u00E1t\u00ED jako lep\u0161\u00ED hr\u00E1\u010D.");
                            break;
                        case "loan_return":
                            headline = "".concat(data.playerName, " se vr\u00E1til z hostov\u00E1n\u00ED do ").concat(data.teamName);
                            body = "".concat(data.playerName, " (").concat(data.playerAge, ", ").concat(data.playerPosition, ") se vrac\u00ED zp\u011Bt do ").concat(data.teamName, " po skon\u010Den\u00ED hostov\u00E1n\u00ED").concat(data.fromTeamName ? " v ".concat(data.fromTeamName) : "", ".");
                            break;
                        case "player_listed":
                            headline = "".concat(data.teamName, " nab\u00EDz\u00ED ").concat(data.playerName, " na p\u0159estup");
                            body = "Na p\u0159estupov\u00E9m trhu se objevil ".concat(data.playerName, " (").concat(data.playerAge, ", ").concat(data.playerPosition, ") z ").concat(data.teamName, ". Po\u017Eadovan\u00E1 cena: ").concat(((_f = data.fee) !== null && _f !== void 0 ? _f : 0).toLocaleString("cs"), " K\u010D.");
                            break;
                        case "player_sold":
                            headline = "".concat(data.playerName, " prod\u00E1n za ").concat(((_g = data.fee) !== null && _g !== void 0 ? _g : 0).toLocaleString("cs"), " K\u010D");
                            body = "".concat(data.toTeamName, " koupil ").concat(data.playerName, " od ").concat(data.fromTeamName, ". ").concat(humor);
                            break;
                        default:
                            return [2 /*return*/];
                    }
                    id = crypto.randomUUID();
                    return [4 /*yield*/, db.prepare("INSERT INTO news (id, league_id, team_id, type, headline, body, created_at) VALUES (?, ?, ?, 'transfer', ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))").bind(id, leagueId, teamId, headline, body).run().catch(function (e) { return logger_1.logger.warn({ module: "transfer-news" }, "insert news", e); })];
                case 4:
                    _h.sent();
                    return [2 /*return*/];
            }
        });
    });
}
